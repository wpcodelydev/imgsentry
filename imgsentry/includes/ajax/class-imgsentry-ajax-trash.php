<?php

/**
 * AJAX Trash Controller Class for ImgSentry.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Ajax_Trash extends ImgSentry_Ajax_Base {
    /**
     * In-memory registry of attachment IDs currently being processed by plugin trash flows.
     * Prevents recursion or duplicate processing when our own code calls wp_trash_post or wp_delete_attachment.
     *
     * @var array<int, bool>
     */
    private static $processing_trash = array();

    /**
     * Constructor. Register Trash AJAX actions and global interceptor hooks.
     */
    public function __construct() {
        add_action( 'wp_ajax_imgsentry_check_usage_before_trash', array($this, 'check_usage_before_trash') );
        add_action( 'wp_ajax_imgsentry_move_to_trash', array($this, 'move_to_trash') );
        add_action( 'wp_ajax_imgsentry_restore_media', array($this, 'restore_media') );
        add_action( 'wp_ajax_imgsentry_delete_permanently', array($this, 'delete_permanently') );
        add_action( 'wp_ajax_imgsentry_bulk_action', array($this, 'bulk_action') );
        add_action( 'wp_ajax_imgsentry_delete_all', array($this, 'delete_all') );
        add_action( 'wp_ajax_imgsentry_empty_trash', array($this, 'empty_trash') );
        add_action( 'wp_ajax_imgsentry_stream_quarantine_media', array($this, 'imgsentry_ajax_stream_quarantine_media') );
        // Global Interceptor Hooks: Capture native WP and third-party media deletions into ImgSentry Trash
        add_action(
            'wp_trash_post',
            array(__CLASS__, 'intercept_wp_trash_post'),
            5,
            1
        );
        add_action(
            'delete_attachment',
            array(__CLASS__, 'intercept_delete_attachment'),
            5,
            1
        );
    }

    /**
     * Global Interceptor for soft trash events (wp_trash_post).
     * Fired when an attachment is moved to WordPress Trash from native Media Library or other plugins.
     *
     * @param int $post_id Post ID being trashed.
     */
    public static function intercept_wp_trash_post( $post_id ) {
        $post_id = intval( $post_id );
        if ( $post_id <= 0 ) {
            return;
        }
        if ( 'attachment' !== get_post_type( $post_id ) ) {
            return;
        }
        // Skip if this deletion is already being managed by ImgSentry
        if ( !empty( self::$processing_trash[$post_id] ) || get_post_meta( $post_id, '_imgsentry_trashed', true ) === '1' ) {
            return;
        }
        self::imgsentry_soft_delete_attachment( $post_id );
    }

    /**
     * Global Interceptor for permanent deletion events (delete_attachment).
     * Fired right before wp_delete_attachment physically unlinks files and deletes post records.
     *
     * If this was an external permanent delete (not initiated via ImgSentry Permanent Delete),
     * we safely rescue/quarantine the files into imgsentry/trash/media/{attachment_id}/ and
     * preserve optimization backups before WordPress deletes everything.
     *
     * @param int $post_id Attachment ID being permanently deleted.
     */
    public static function intercept_delete_attachment( $post_id ) {
        $post_id = intval( $post_id );
        if ( $post_id <= 0 ) {
            return;
        }
        // Skip if initiated by our own permanent delete flow (which cleans up backups/quarantine intentionally)
        if ( !empty( self::$processing_trash[$post_id] ) ) {
            return;
        }
        // If attachment was already quarantined in ImgSentry Trash, clean up quarantine directory
        $is_already_trashed = get_post_meta( $post_id, '_imgsentry_trashed', true ) === '1';
        if ( $is_already_trashed ) {
            self::cleanup_optimization_backup( $post_id );
            $file_path = get_attached_file( $post_id );
            if ( $file_path && class_exists( 'ImgSentry_FM_Core' ) ) {
                ImgSentry_FM_Core::delete_cached_thumbnail_for_path( $file_path );
            }
            $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $post_id ) : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/trash/media/' . $post_id . '/' );
            if ( !is_dir( $quarantine_dir ) ) {
                $trash_base = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir() : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/trash/media/' );
                $candidates = glob( trailingslashit( $trash_base ) . '*/*/' . $post_id, GLOB_ONLYDIR );
                if ( !empty( $candidates ) && is_dir( $candidates[0] ) ) {
                    $quarantine_dir = trailingslashit( $candidates[0] );
                }
            }
            self::delete_quarantine_folder( $quarantine_dir );
            return;
        }
        // Otherwise, this is an external force-delete of an active attachment (e.g. from third-party plugin or Shift+Delete).
        // Auto-quarantine the file and backup before it gets permanently destroyed by WP Core.
        $file_path = get_attached_file( $post_id );
        if ( $file_path && file_exists( $file_path ) ) {
            $upload_dir = wp_upload_dir();
            $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $post_id ) : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/trash/media/' . $post_id . '/' );
            if ( !file_exists( $quarantine_dir ) ) {
                wp_mkdir_p( $quarantine_dir );
            }
            // Copy files into quarantine folder so a copy survives WP Core unlinking
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
            @copy( $file_path, $quarantine_dir . basename( $file_path ) );
            $metadata = wp_get_attachment_metadata( $post_id );
            $base_dir = dirname( $file_path ) . '/';
            if ( is_array( $metadata ) && !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
                foreach ( $metadata['sizes'] as $size_info ) {
                    if ( !empty( $size_info['file'] ) ) {
                        $thumb = $base_dir . $size_info['file'];
                        if ( file_exists( $thumb ) ) {
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                            @copy( $thumb, $quarantine_dir . $size_info['file'] );
                        }
                    }
                }
            }
        }
    }

    /**
     * Usage-check safety endpoint before trashing single or bulk media items.
     * Fast DB lookup against wp_imgsentry_attachment_usage index table.
     */
    public function check_usage_before_trash() {
        $this->verify_permission( 'unused_trash', 'imgsentry_admin_nonce' );
        $ids = array();
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
        if ( isset( $_POST['id'] ) ) {
            // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
            $ids[] = absint( $_POST['id'] );
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
        if ( isset( $_POST['ids'] ) && is_array( $_POST['ids'] ) ) {
            // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
            $ids = array_merge( $ids, array_map( 'absint', $_POST['ids'] ) );
        }
        $ids = array_values( array_unique( array_filter( $ids ) ) );
        if ( empty( $ids ) ) {
            wp_send_json_error( array(
                'message' => __( 'No valid attachment IDs provided for usage check.', 'imgsentry' ),
            ) );
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
        $force_live = !empty( $_POST['force_recheck'] );
        $result = ImgSentry_Usage_Indexer::check_attachments_usage( $ids, $force_live );
        wp_send_json_success( $result );
    }

    /**
     * Helper: Soft delete and quarantine attachment into imgsentry/trash/media/{attachment_id}/
     * Includes full rollback if file move or database update fails.
     *
     * @param int $attachment_id Attachment ID.
     * @return array Result array ('success' => bool, 'message' => string).
     */
    public static function imgsentry_soft_delete_attachment( $attachment_id ) {
        self::$processing_trash[$attachment_id] = true;
        try {
            $file_path = get_attached_file( $attachment_id );
            if ( !$file_path || !file_exists( $file_path ) ) {
                // If file is already missing on disk, simply update DB status safely
                update_post_meta( $attachment_id, '_imgsentry_trashed', '1' );
                update_post_meta( $attachment_id, '_imgsentry_trashed_date', current_time( 'mysql' ) );
                wp_update_post( array(
                    'ID'          => $attachment_id,
                    'post_status' => 'trash',
                ) );
                return array(
                    'success' => true,
                    'message' => __( 'Record marked as trashed.', 'imgsentry' ),
                );
            }
            $upload_dir = wp_upload_dir();
            $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $attachment_id ) : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/trash/media/' . $attachment_id . '/' );
            if ( !file_exists( $quarantine_dir ) ) {
                if ( !wp_mkdir_p( $quarantine_dir ) ) {
                    return array(
                        'success' => false,
                        'message' => __( 'Failed to create quarantine folder.', 'imgsentry' ),
                    );
                }
                $trash_base = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_dir() : dirname( dirname( $quarantine_dir ) ) );
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                @file_put_contents( trailingslashit( $trash_base ) . '.htaccess', "Order deny,allow\nDeny from all\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n" );
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                @file_put_contents( trailingslashit( $trash_base ) . 'index.php', '<?php // Silence' );
            }
            // Identify all files (original + thumbnails)
            $files_to_move = array();
            $files_to_move['original'] = array(
                'source' => $file_path,
                'dest'   => $quarantine_dir . basename( $file_path ),
            );
            $base_dir = dirname( $file_path ) . '/';
            $metadata = wp_get_attachment_metadata( $attachment_id );
            if ( is_array( $metadata ) && !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
                foreach ( $metadata['sizes'] as $size_key => $size_info ) {
                    if ( !empty( $size_info['file'] ) ) {
                        $thumb_source = $base_dir . $size_info['file'];
                        if ( file_exists( $thumb_source ) ) {
                            $files_to_move['thumb_' . $size_key] = array(
                                'source' => $thumb_source,
                                'dest'   => $quarantine_dir . $size_info['file'],
                            );
                        }
                    }
                }
            }
            // Execute file moves with rollback tracking
            $moved_files = array();
            $move_failed = false;
            foreach ( $files_to_move as $key => $paths ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                if ( @rename( $paths['source'], $paths['dest'] ) ) {
                    $moved_files[$key] = $paths;
                } else {
                    $move_failed = true;
                    break;
                }
            }
            // Rollback file moves if any failed
            if ( $move_failed ) {
                foreach ( $moved_files as $paths ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                    @rename( $paths['dest'], $paths['source'] );
                }
                return array(
                    'success' => false,
                    'message' => __( 'Failed to quarantine files. Operation rolled back.', 'imgsentry' ),
                );
            }
            // Update database metadata
            $save_meta = update_post_meta( $attachment_id, '_imgsentry_trashed', '1' );
            $save_date = update_post_meta( $attachment_id, '_imgsentry_trashed_date', current_time( 'mysql' ) );
            $save_origin = update_post_meta( $attachment_id, '_imgsentry_original_path', $file_path );
            $update_post = wp_update_post( array(
                'ID'          => $attachment_id,
                'post_status' => 'trash',
            ) );
            // Rollback if DB update fails
            if ( false === $update_post ) {
                foreach ( $moved_files as $paths ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                    @rename( $paths['dest'], $paths['source'] );
                }
                delete_post_meta( $attachment_id, '_imgsentry_trashed' );
                delete_post_meta( $attachment_id, '_imgsentry_trashed_date' );
                delete_post_meta( $attachment_id, '_imgsentry_original_path' );
                return array(
                    'success' => false,
                    'message' => __( 'Database update failed. Operation rolled back.', 'imgsentry' ),
                );
            }
            if ( class_exists( 'ImgSentry_FM_Core' ) && method_exists( 'ImgSentry_FM_Core', 'invalidate_folder_size_cache' ) ) {
                ImgSentry_FM_Core::invalidate_folder_size_cache( $file_path );
            }
            return array(
                'success' => true,
                'message' => __( 'Quarantined successfully.', 'imgsentry' ),
            );
        } finally {
            unset(self::$processing_trash[$attachment_id]);
        }
    }

    /**
     * Whether the current user may act on a media item: Administrator, or WordPress allows delete_post on it.
     */
    private function user_can_manage_attachment( $id ) {
        return ImgSentry_Permissions::is_administrator() || current_user_can( 'delete_post', (int) $id );
    }

    /**
     * Whether the current user may act on File Manager trash items: Administrator or File Manager access.
     */
    private function user_can_manage_fm_trash() {
        return current_user_can( 'manage_options' ) || class_exists( 'ImgSentry_FM_Security' ) && ImgSentry_FM_Security::can_user_manage();
    }

    /**
     * Send a 403 for an item the user may not modify.
     */
    private function deny_item_permission() {
        wp_send_json_error( array(
            'message' => __( 'You do not have permission to modify this media item.', 'imgsentry' ),
        ), 403 );
        exit;
    }

    /**
     * True when the request comes from the Duplicate Images page.
     */
    private function is_duplicates_request() {
        // phpcs:ignore WordPress.Security.NonceVerification.Missing
        return isset( $_POST['source'] ) && 'duplicates' === sanitize_key( wp_unslash( $_POST['source'] ) );
    }

    /**
     * Files the user chose to ignore in the duplicate finder must never be trashed from that page.
     */
    private function is_blocked_by_duplicate_ignore( $id ) {
        return $this->is_duplicates_request() && '1' === (string) get_post_meta( (int) $id, '_imgsentry_excluded', true );
    }

    /**
     * Move Single Media to Trash.
     */
    public function move_to_trash() {
        $this->verify_permission( 'unused_trash', 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
        $id = ( isset( $_POST['id'] ) ? intval( $_POST['id'] ) : 0 );
        if ( !$id ) {
            wp_send_json_error( array(
                'message' => __( 'Invalid media ID.', 'imgsentry' ),
            ) );
        }
        if ( !$this->user_can_manage_attachment( $id ) ) {
            $this->deny_item_permission();
        }
        if ( $this->is_blocked_by_duplicate_ignore( $id ) ) {
            wp_send_json_error( array(
                'message' => __( 'This file is on your ignore list. Use "Stop ignoring" first if you want to move it to Trash.', 'imgsentry' ),
            ) );
        }
        // Real-time usage verification safety gate to close race condition window
        if ( class_exists( 'ImgSentry_Usage_Indexer' ) ) {
            $usage_check_res = ImgSentry_Usage_Indexer::check_attachments_usage( array($id), false );
            $usage_item = ( !empty( $usage_check_res['items'][0] ) ? $usage_check_res['items'][0] : null );
            // Determine genuine usage only — exclude protection-rule markers (exclusion_rule, min_age_rule)
            // from counting as "used", matching the logic already used in bulk_action()'s 'trash' case.
            $genuine_usage_count = 0;
            if ( !empty( $usage_item['locations'] ) && is_array( $usage_item['locations'] ) ) {
                foreach ( $usage_item['locations'] as $loc ) {
                    $ft = ( isset( $loc['field_type'] ) ? $loc['field_type'] : '' );
                    if ( 'exclusion_rule' !== $ft && 'min_age_rule' !== $ft ) {
                        $genuine_usage_count++;
                    }
                }
            }
            $is_used = $genuine_usage_count > 0;
            // Requirement 4b: Prevent trashing unverified items
            global $wpdb;
            $table_name = ImgSentry_Usage_Indexer::get_table_name();
            $is_unverified = (bool) $wpdb->get_var( $wpdb->prepare( 
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                "SELECT 1 FROM {$table_name} WHERE attachment_id = %d AND is_dirty = 1",
                $id
             ) );
            if ( $is_unverified && !$is_used ) {
                wp_send_json_error( array(
                    'message' => __( 'Usage is still being checked. Please wait for the scan to complete before trashing this item.', 'imgsentry' ),
                ) );
            }
            if ( $is_used ) {
                $compat_usage = array(
                    'is_used' => true,
                    'status'  => 'used',
                    'sources' => ( !empty( $usage_item['locations'] ) ? $usage_item['locations'] : array() ),
                    'count'   => $genuine_usage_count,
                    'hash'    => '',
                );
                ImgSentry_Usage_Indexer::update_attachment_usage_record( $id, $compat_usage );
                $title = get_the_title( $id );
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::warning( 'Skipped Trashing Used File', array(
                        'type'      => 'Delete',
                        'source'    => 'ImgSentry',
                        'details'   => sprintf( 'Skipped trashing attachment "%s" (ID: #%d) because it is currently in use.', $title, $id ),
                        'object_id' => $id,
                    ) );
                }
                /* translators: %1$s: item title, %2$d: attachment ID */
                $imgsentry_msg_1 = sprintf( __( 'Cannot move "%1$s" (ID: #%2$d) to trash because it is currently in use.', 'imgsentry' ), $title, $id );
                wp_send_json_error( array(
                    'message'              => $imgsentry_msg_1,
                    'is_used'              => true,
                    'item_id'              => $id,
                    'skipped_now_used_ids' => array($id),
                    'usage_details'        => $compat_usage,
                ) );
            }
        }
        $result = self::imgsentry_soft_delete_attachment( $id );
        if ( !$result['success'] ) {
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::error( 'Failed to move media to trash', array(
                    'type'      => 'Delete',
                    'source'    => 'ImgSentry',
                    'details'   => sprintf( 'Failed to quarantine attachment #%d: %s', $id, $result['message'] ),
                    'object_id' => $id,
                ) );
            }
            wp_send_json_error( array(
                'message' => $result['message'],
            ) );
        }
        $title = get_the_title( $id );
        if ( class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::success( 'Moved to Trash', array(
                'type'      => 'Delete',
                'source'    => 'ImgSentry',
                'details'   => sprintf( 'Moved "%s" (ID: #%d) to quarantine trash folder.', $title, $id ),
                'object_id' => $id,
            ) );
        }
        if ( class_exists( 'ImgSentry_Duplicate_Finder' ) ) {
            ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'Single item #%d moved to trash', $id ) );
        }
        if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
            ImgSentry_Optimization_Stats::invalidate_cache();
        }
        /* translators: %s: item title */
        $imgsentry_msg_2 = sprintf( __( '"%s" moved to trash.', 'imgsentry' ), $title );
        wp_send_json_success( array(
            'message' => $imgsentry_msg_2,
            'stats'   => ImgSentry_Scanner::get_total_stats(),
        ) );
    }

    /**
     * Helper: Restore attachment from quarantine.
     * Handles collisions, renames thumbnails proportionally, and updates attachment metadata.
     *
     * @param int $attachment_id Attachment ID.
     * @return array Result array ('success' => bool, 'message' => string).
     */
    public static function imgsentry_restore_attachment( $attachment_id ) {
        $upload_dir = wp_upload_dir();
        $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $attachment_id ) : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/trash/media/' . $attachment_id . '/' );
        if ( !is_dir( $quarantine_dir ) ) {
            $trash_base = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir() : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/trash/media/' );
            $candidates = glob( trailingslashit( $trash_base ) . '*/*/' . $attachment_id, GLOB_ONLYDIR );
            if ( !empty( $candidates ) && is_dir( $candidates[0] ) ) {
                $quarantine_dir = trailingslashit( $candidates[0] );
            } else {
                $legacy = trailingslashit( $trash_base ) . $attachment_id;
                if ( is_dir( $legacy ) ) {
                    $quarantine_dir = trailingslashit( $legacy );
                }
            }
        }
        $orig_path_meta = get_post_meta( $attachment_id, '_imgsentry_original_path', true );
        $orig_trashed_meta = get_post_meta( $attachment_id, '_imgsentry_trashed', true );
        $orig_date_meta = get_post_meta( $attachment_id, '_imgsentry_trashed_date', true );
        $current_attached = get_attached_file( $attachment_id );
        $old_metadata = wp_get_attachment_metadata( $attachment_id );
        $target_orig_path = ( $orig_path_meta ? $orig_path_meta : $current_attached );
        $target_dir = ( $target_orig_path ? dirname( $target_orig_path ) . '/' : trailingslashit( $upload_dir['path'] ) );
        $orig_filename = basename( $target_orig_path );
        if ( !file_exists( $target_dir ) ) {
            wp_mkdir_p( $target_dir );
        }
        $moved_files = array();
        $dest_file = '';
        if ( is_dir( $quarantine_dir ) ) {
            $quarantined_files = array_diff( scandir( $quarantine_dir ), array('.', '..') );
            $main_quarantine_file = $quarantine_dir . $orig_filename;
            if ( !file_exists( $main_quarantine_file ) && !empty( $quarantined_files ) ) {
                // Find first non-thumbnail file as candidate
                $main_quarantine_file = $quarantine_dir . reset( $quarantined_files );
                $orig_filename = basename( $main_quarantine_file );
            }
            // Check collision in target directory
            $final_main_filename = $orig_filename;
            $dest_file = $target_dir . $final_main_filename;
            $name_part = pathinfo( $orig_filename, PATHINFO_FILENAME );
            $ext_part = pathinfo( $orig_filename, PATHINFO_EXTENSION );
            $counter = 1;
            while ( file_exists( $dest_file ) ) {
                $final_main_filename = $name_part . '-' . $counter . (( $ext_part ? '.' . $ext_part : '' ));
                $dest_file = $target_dir . $final_main_filename;
                $counter++;
            }
            $is_renamed = $final_main_filename !== $orig_filename;
            // Move main file
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
            if ( @rename( $main_quarantine_file, $dest_file ) ) {
                $moved_files[] = array(
                    'source' => $main_quarantine_file,
                    'dest'   => $dest_file,
                );
            } else {
                return array(
                    'success' => false,
                    'message' => __( 'Failed to move main file from quarantine.', 'imgsentry' ),
                );
            }
            // Handle metadata and thumbnail sizes
            $metadata = wp_get_attachment_metadata( $attachment_id );
            if ( is_array( $metadata ) ) {
                $metadata['file'] = _wp_relative_upload_path( $dest_file );
                if ( !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
                    foreach ( $metadata['sizes'] as $size_key => &$size_info ) {
                        if ( !empty( $size_info['file'] ) ) {
                            $old_thumb_name = $size_info['file'];
                            $quarantined_thumb = $quarantine_dir . $old_thumb_name;
                            if ( file_exists( $quarantined_thumb ) ) {
                                if ( $is_renamed ) {
                                    // Replace base stem with new stem proportionally
                                    $new_thumb_name = str_replace( $name_part, pathinfo( $final_main_filename, PATHINFO_FILENAME ), $old_thumb_name );
                                    $dest_thumb = $target_dir . $new_thumb_name;
                                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                                    if ( @rename( $quarantined_thumb, $dest_thumb ) ) {
                                        $moved_files[] = array(
                                            'source' => $quarantined_thumb,
                                            'dest'   => $dest_thumb,
                                        );
                                        $size_info['file'] = $new_thumb_name;
                                    }
                                } else {
                                    $dest_thumb = $target_dir . $old_thumb_name;
                                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                                    if ( @rename( $quarantined_thumb, $dest_thumb ) ) {
                                        $moved_files[] = array(
                                            'source' => $quarantined_thumb,
                                            'dest'   => $dest_thumb,
                                        );
                                    }
                                }
                            }
                        }
                    }
                    unset($size_info);
                }
                wp_update_attachment_metadata( $attachment_id, $metadata );
            }
            // Update attached file path
            update_attached_file( $attachment_id, $dest_file );
        }
        delete_post_meta( $attachment_id, '_imgsentry_trashed' );
        delete_post_meta( $attachment_id, '_imgsentry_trashed_date' );
        delete_post_meta( $attachment_id, '_imgsentry_original_path' );
        $update_res = wp_update_post( array(
            'ID'          => $attachment_id,
            'post_status' => 'inherit',
        ) );
        // Rollback if DB update fails
        if ( false === $update_res || 0 === $update_res || is_wp_error( $update_res ) ) {
            if ( !is_dir( $quarantine_dir ) ) {
                wp_mkdir_p( $quarantine_dir );
            }
            foreach ( $moved_files as $paths ) {
                if ( file_exists( $paths['dest'] ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
                    @rename( $paths['dest'], $paths['source'] );
                }
            }
            if ( $orig_trashed_meta ) {
                update_post_meta( $attachment_id, '_imgsentry_trashed', $orig_trashed_meta );
            }
            if ( $orig_date_meta ) {
                update_post_meta( $attachment_id, '_imgsentry_trashed_date', $orig_date_meta );
            }
            if ( $orig_path_meta ) {
                update_post_meta( $attachment_id, '_imgsentry_original_path', $orig_path_meta );
            }
            if ( !empty( $old_metadata ) ) {
                wp_update_attachment_metadata( $attachment_id, $old_metadata );
            }
            if ( !empty( $current_attached ) ) {
                update_attached_file( $attachment_id, $current_attached );
            }
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::error( 'Database update failed during restore', array(
                    'type'      => 'Restore',
                    'source'    => 'ImgSentry',
                    'details'   => sprintf( 'Database status update failed for attachment #%d during restore. Operation rolled back.', $attachment_id ),
                    'object_id' => $attachment_id,
                ) );
            }
            return array(
                'success' => false,
                'message' => __( 'Database update failed during restore. Operation rolled back.', 'imgsentry' ),
            );
        }
        // Clean up empty quarantine directory and prune empty parent buckets on confirmed DB success
        if ( is_dir( $quarantine_dir ) ) {
            self::delete_quarantine_folder( $quarantine_dir );
        }
        if ( class_exists( 'ImgSentry_FM_Core' ) && method_exists( 'ImgSentry_FM_Core', 'invalidate_folder_size_cache' ) && !empty( $dest_file ) ) {
            ImgSentry_FM_Core::invalidate_folder_size_cache( $dest_file );
        }
        if ( class_exists( 'ImgSentry_Usage_Indexer' ) ) {
            ImgSentry_Usage_Indexer::mark_dirty( $attachment_id );
        }
        delete_transient( 'imgsentry_dashboard_stats_cache' );
        return array(
            'success' => true,
            'message' => __( 'Restored successfully.', 'imgsentry' ),
        );
    }

    /**
     * Helper: Delete quarantine directory recursively and prune empty parent month/year folders.
     *
     * @param string $quarantine_dir Absolute path to attachment quarantine directory.
     */
    public static function delete_quarantine_folder( string $quarantine_dir ) : void {
        if ( !is_dir( $quarantine_dir ) ) {
            return;
        }
        if ( !class_exists( 'ImgSentry_Cron' ) ) {
            return;
        }
        ImgSentry_Cron::delete_directory_recursively( $quarantine_dir );
        // Prune parent month and year directories if they are now empty
        $month_dir = dirname( rtrim( $quarantine_dir, '/\\' ) );
        if ( is_dir( $month_dir ) && basename( $month_dir ) !== 'media' && basename( $month_dir ) !== 'trash' ) {
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
            $month_contents = array_diff( ( @scandir( $month_dir ) ?: array() ), array('.', '..') );
            $artifacts = array('.DS_Store', 'Thumbs.db', 'desktop.ini');
            $filtered_month_contents = array_filter( $month_contents, function ( $item ) use($artifacts) {
                return !in_array( $item, $artifacts, true );
            } );
            if ( empty( $filtered_month_contents ) ) {
                foreach ( $month_contents as $file ) {
                    wp_delete_file( trailingslashit( $month_dir ) . $file );
                }
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on some hosts; the result is checked. Removes an empty plugin-owned folder; WP_Filesystem is not available in cron or background requests.
                @rmdir( $month_dir );
                $year_dir = dirname( $month_dir );
                if ( is_dir( $year_dir ) && basename( $year_dir ) !== 'media' && basename( $year_dir ) !== 'trash' ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                    $year_contents = array_diff( ( @scandir( $year_dir ) ?: array() ), array('.', '..') );
                    $filtered_year_contents = array_filter( $year_contents, function ( $item ) use($artifacts) {
                        return !in_array( $item, $artifacts, true );
                    } );
                    if ( empty( $filtered_year_contents ) ) {
                        foreach ( $year_contents as $file ) {
                            wp_delete_file( trailingslashit( $year_dir ) . $file );
                        }
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on some hosts; the result is checked. Removes an empty plugin-owned folder; WP_Filesystem is not available in cron or background requests.
                        @rmdir( $year_dir );
                    }
                }
            }
        }
    }

    /**
     * Restore Single Media from Trash.
     */
    public function restore_media() {
        $this->verify_permission( 'trash_restore', 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
        $id = ( isset( $_POST['id'] ) ? intval( $_POST['id'] ) : 0 );
        if ( !$id ) {
            // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
            $str_id = ( isset( $_POST['id'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['id'] ) ) : '' );
            // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
            $mode = ( isset( $_POST['mode'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['mode'] ) ) : 'cancel' );
            if ( !empty( $str_id ) && class_exists( 'ImgSentry_FM_Core' ) ) {
                if ( !$this->user_can_manage_fm_trash() ) {
                    $this->deny_item_permission();
                }
                $res = ImgSentry_FM_Core::restore_file_trash_item( $str_id, $mode );
                if ( is_wp_error( $res ) ) {
                    $data = $res->get_error_data();
                    wp_send_json_error( array_merge( array(
                        'message' => $res->get_error_message(),
                    ), ( is_array( $data ) ? $data : array() ) ) );
                }
                wp_send_json_success( array(
                    'message' => $res['message'] ?? __( 'Item restored successfully.', 'imgsentry' ),
                    'stats'   => ( class_exists( 'ImgSentry_Scanner' ) ? ImgSentry_Scanner::get_total_stats() : array() ),
                ) );
            }
            wp_send_json_error( array(
                'message' => __( 'Invalid media ID.', 'imgsentry' ),
            ) );
        }
        if ( !$this->user_can_manage_attachment( $id ) ) {
            $this->deny_item_permission();
        }
        $result = self::imgsentry_restore_attachment( $id );
        if ( !$result['success'] ) {
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::error( 'Failed to restore media from trash', array(
                    'type'      => 'Restore',
                    'source'    => 'ImgSentry',
                    'details'   => sprintf( 'Failed to restore attachment #%d: %s', $id, $result['message'] ),
                    'object_id' => $id,
                ) );
            }
            wp_send_json_error( array(
                'message' => $result['message'],
            ) );
        }
        $title = get_the_title( $id );
        if ( class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::success( 'Restored from Trash', array(
                'type'      => 'Restore',
                'source'    => 'ImgSentry',
                'details'   => sprintf( 'Restored "%s" (ID: #%d) back to media library.', $title, $id ),
                'object_id' => $id,
            ) );
        }
        if ( class_exists( 'ImgSentry_Duplicate_Finder' ) ) {
            ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'Single item #%d restored from trash', $id ) );
        }
        if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
            ImgSentry_Optimization_Stats::invalidate_cache();
        }
        /* translators: %s: item title */
        $imgsentry_msg_3 = sprintf( __( '"%s" restored successfully.', 'imgsentry' ), $title );
        wp_send_json_success( array(
            'message' => $imgsentry_msg_3,
            'stats'   => ImgSentry_Scanner::get_total_stats(),
        ) );
    }

    /**
     * Clean up orphaned optimization backup for an attachment before permanent deletion.
     *
     * Reads _imgsentry_backup_original_path, removes the backup file if present,
     * prunes the parent directory if empty, and logs via ImgSentry_Logger.
     *
     * @param int    $attachment_id Attachment ID.
     * @param string $filename      Optional attachment filename or title for logging context.
     */
    public static function cleanup_optimization_backup( $attachment_id, $filename = '' ) {
        $attachment_id = absint( $attachment_id );
        if ( !$attachment_id ) {
            return;
        }
        // Clean up any cached thumbnail preview for this attachment
        if ( class_exists( 'ImgSentry_FM_Core' ) && function_exists( 'get_attached_file' ) ) {
            $attached_file = get_attached_file( $attachment_id );
            if ( !empty( $attached_file ) ) {
                ImgSentry_FM_Core::delete_cached_thumbnail_for_path( $attached_file );
            }
        }
        $backup_path = get_post_meta( $attachment_id, '_imgsentry_backup_original_path', true );
        if ( empty( $backup_path ) ) {
            return;
        }
        if ( empty( $filename ) ) {
            $filename = get_the_title( $attachment_id );
            if ( empty( $filename ) ) {
                $filename = basename( $backup_path );
            }
        }
        if ( file_exists( $backup_path ) ) {
            wp_delete_file( $backup_path );
            $parent_dir = dirname( $backup_path );
            if ( is_dir( $parent_dir ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                $remaining = @scandir( $parent_dir );
                if ( is_array( $remaining ) ) {
                    $non_dot_items = array_diff( $remaining, array('.', '..') );
                    if ( empty( $non_dot_items ) ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on some hosts; the result is checked. Removes an empty plugin-owned folder; WP_Filesystem is not available in cron or background requests.
                        @rmdir( $parent_dir );
                    }
                }
            }
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::info( sprintf( 'Removed orphaned optimization backup for %s during permanent deletion', $filename ), array(
                    'type'      => 'Delete',
                    'source'    => 'Optimizer Engine',
                    'details'   => sprintf( 'Removed orphaned backup file (%s) for attachment #%d during permanent deletion.', basename( $backup_path ), $attachment_id ),
                    'object_id' => $attachment_id,
                ) );
            }
        }
    }

    /**
     * Delete Single Media Permanently.
     * Core attachment is deleted first; quarantine dir cleaned up on success.
     */
    public function delete_permanently() {
        $this->verify_permission( 'trash_delete_permanent', 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
        $id = ( isset( $_POST['id'] ) ? intval( $_POST['id'] ) : 0 );
        if ( !$id ) {
            // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
            $str_id = ( isset( $_POST['id'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['id'] ) ) : '' );
            if ( !empty( $str_id ) && class_exists( 'ImgSentry_FM_Core' ) ) {
                if ( !$this->user_can_manage_fm_trash() ) {
                    $this->deny_item_permission();
                }
                $res = ImgSentry_FM_Core::delete_file_trash_item_permanently( $str_id );
                if ( is_wp_error( $res ) ) {
                    wp_send_json_error( array(
                        'message' => $res->get_error_message(),
                    ) );
                }
                wp_send_json_success( array(
                    'message' => $res['message'] ?? __( 'Item permanently deleted.', 'imgsentry' ),
                    'stats'   => ( class_exists( 'ImgSentry_Scanner' ) ? ImgSentry_Scanner::get_total_stats( true ) : array() ),
                ) );
            }
            wp_send_json_error( array(
                'message' => __( 'Invalid media ID.', 'imgsentry' ),
            ) );
        }
        if ( !$this->user_can_manage_attachment( $id ) ) {
            $this->deny_item_permission();
        }
        self::$processing_trash[$id] = true;
        try {
            $item_meta = self::imgsentry_get_attachment_item_meta( $id );
            $title = get_the_title( $id );
            // Determine quarantine directory BEFORE deleting post from database
            $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $id ) : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/trash/media/' . $id . '/' );
            if ( !is_dir( $quarantine_dir ) ) {
                $trash_base = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir() : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/trash/media/' );
                $candidates = glob( trailingslashit( $trash_base ) . '*/*/' . $id, GLOB_ONLYDIR );
                if ( !empty( $candidates ) && is_dir( $candidates[0] ) ) {
                    $quarantine_dir = trailingslashit( $candidates[0] );
                } else {
                    $legacy = trailingslashit( $trash_base ) . $id;
                    if ( is_dir( $legacy ) ) {
                        $quarantine_dir = trailingslashit( $legacy );
                    }
                }
            }
            if ( class_exists( 'ImgSentry_Usage_Indexer' ) ) {
                $usage_check_res = ImgSentry_Usage_Indexer::check_attachments_usage( array($id), false );
                $usage_item = ( !empty( $usage_check_res['items'][0] ) ? $usage_check_res['items'][0] : null );
                $is_used = !empty( $usage_item['is_used'] );
                if ( $is_used ) {
                    if ( class_exists( 'ImgSentry_Logger' ) ) {
                        ImgSentry_Logger::warning( 'Skipped Permanent Deletion', array(
                            'type'      => 'Delete',
                            'source'    => 'ImgSentry',
                            'details'   => sprintf( 'Skipped permanent deletion of "%s" (ID: #%d) because it is currently in use on the site.', $title, $id ),
                            'object_id' => $id,
                        ) );
                    }
                    /* translators: %s: item title */
                    $imgsentry_msg_4 = sprintf( __( 'Cannot permanently delete "%s" — it is now in use somewhere on the site. Please restore and review it first.', 'imgsentry' ), $title );
                    wp_send_json_error( array(
                        'message' => $imgsentry_msg_4,
                    ) );
                }
            }
            // Clean up orphaned optimization backup BEFORE wp_delete_attachment removes postmeta
            self::cleanup_optimization_backup( $id, $title );
            // True physical delete + database cleanup FIRST
            $result = wp_delete_attachment( $id, true );
            if ( false === $result || null === $result ) {
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::error( 'Failed to delete file', array(
                        'type'      => 'Delete',
                        'source'    => 'ImgSentry',
                        'details'   => sprintf( 'Could not delete "%s" (ID: #%d) - file in use or database error.', $title, $id ),
                        'object_id' => $id,
                    ) );
                }
                /* translators: %s: item title */
                $imgsentry_msg_5 = sprintf( __( 'Failed to delete attachment "%s" from database.', 'imgsentry' ), $title );
                wp_send_json_error( array(
                    'message' => $imgsentry_msg_5,
                ) );
            }
            // Clean up quarantine folder on confirmed success
            self::delete_quarantine_folder( $quarantine_dir );
            if ( is_dir( $quarantine_dir ) ) {
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::error( 'Failed to clean up quarantine directory', array(
                        'type'      => 'Delete',
                        'source'    => 'ImgSentry',
                        'details'   => sprintf( 'Post record #%d deleted, but quarantine directory "%s" could not be removed from disk.', $id, $quarantine_dir ),
                        'object_id' => $id,
                    ) );
                }
            }
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::success( 'Deleted Permanently', array(
                    'type'      => 'Delete',
                    'source'    => 'ImgSentry',
                    'details'   => sprintf( 'Permanently deleted file "%s" (ID: #%d) and associated thumbnails.', $title, $id ),
                    'object_id' => $id,
                ) );
            }
            if ( class_exists( 'ImgSentry_Duplicate_Finder' ) ) {
                ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'Single item #%d permanently deleted', $id ) );
            }
            if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
                ImgSentry_Optimization_Stats::invalidate_cache();
            }
            /* translators: %s: item title */
            $imgsentry_msg_6 = sprintf( __( '"%s" permanently deleted.', 'imgsentry' ), $title );
            wp_send_json_success( array(
                'message' => $imgsentry_msg_6,
                'stats'   => ImgSentry_Scanner::get_total_stats_after_mutation( 1, ( isset( $item_meta['size'] ) ? (int) $item_meta['size'] : 0 ), ( isset( $item_meta['category'] ) ? $item_meta['category'] : null ) ),
            ) );
        } finally {
            unset(self::$processing_trash[$id]);
        }
    }

    /**
     * Retrieve metadata for a single attachment for itemized bulk logging.
     *
     * @param int $attachment_id Attachment ID.
     * @return array
     */
    public static function imgsentry_get_attachment_item_meta( $attachment_id ) {
        $attachment_id = (int) $attachment_id;
        $title = get_the_title( $attachment_id );
        $file_path = get_attached_file( $attachment_id );
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
        $size = ( $file_path && file_exists( $file_path ) ? (int) @filesize( $file_path ) : 0 );
        if ( !$size ) {
            $meta_size = get_post_meta( $attachment_id, '_filesize', true );
            if ( $meta_size ) {
                $size = (int) $meta_size;
            }
        }
        $filename = ( $file_path ? basename( $file_path ) : (( $title ? $title : '#' . $attachment_id )) );
        return array(
            'id'             => $attachment_id,
            'title'          => ( $title ? $title : $filename ),
            'filename'       => $filename,
            'size'           => $size,
            'size_formatted' => size_format( $size, 2 ),
        );
    }

    /**
     * Bulk Actions Handler (Move to Trash, Restore, Delete Permanently).
     * Supports batching for delete_permanent with batch_size (default 50) and offset (default 0).
     */
    public function bulk_action() {
        check_ajax_referer( 'imgsentry_admin_nonce', 'nonce' );
        $action = ( isset( $_POST['bulk_action'] ) ? sanitize_text_field( wp_unslash( $_POST['bulk_action'] ) ) : '' );
        if ( 'trash' === $action ) {
            $this->require_permission( 'unused_trash' );
        } elseif ( 'restore' === $action ) {
            $this->require_permission( 'trash_restore' );
        } elseif ( 'delete_permanent' === $action ) {
            $this->require_permission( 'trash_delete_permanent' );
        } else {
            $this->verify_admin_request( 'imgsentry_admin_nonce' );
        }
        $ids = ( isset( $_POST['ids'] ) && is_array( $_POST['ids'] ) ? array_map( 'intval', $_POST['ids'] ) : array() );
        $batch_size = ( isset( $_POST['batch_size'] ) ? max( 1, min( 500, absint( $_POST['batch_size'] ) ) ) : 50 );
        $offset = ( isset( $_POST['offset'] ) ? max( 0, absint( $_POST['offset'] ) ) : 0 );
        $force_used = !empty( $_POST['force'] );
        $force_protected = !empty( $_POST['force_protected'] ) || !empty( $_POST['override_protection'] );
        // The Duplicate Images page can never force-trash used or protected files.
        if ( 'trash' === $action && $this->is_duplicates_request() ) {
            $force_used = false;
            $force_protected = false;
        }
        if ( empty( $ids ) ) {
            wp_send_json_error( array(
                'message' => __( 'No items selected.', 'imgsentry' ),
            ) );
        }
        $total_ids = count( $ids );
        // Free plan: bulk permanent delete / bulk restore from Trash are Pro features (one item at a time stays free).
        if ( in_array( $action, array('delete_permanent', 'restore'), true ) && count( array_unique( array_filter( $ids ) ) ) > 1 ) {
            ImgSentry_License::require_feature( 'trash_bulk_actions', ( 'delete_permanent' === $action ? __( 'Bulk permanent deletion requires ImgSentry Pro. You can still delete items one at a time.', 'imgsentry' ) : __( 'Restoring several items at once requires ImgSentry Pro. You can still restore items one at a time.', 'imgsentry' ) ) );
        }
        // If a large batch of IDs was passed, slice according to offset and batch_size for delete_permanent
        if ( 'delete_permanent' === $action && ($total_ids > $batch_size || $offset > 0) ) {
            $ids_to_process = array_slice( $ids, $offset, $batch_size );
        } else {
            $ids_to_process = $ids;
        }
        // Per-item check: non-administrators may only act on items WordPress lets them delete.
        if ( !ImgSentry_Permissions::is_administrator() ) {
            $permitted_ids = array();
            foreach ( $ids_to_process as $candidate_id ) {
                if ( current_user_can( 'delete_post', (int) $candidate_id ) ) {
                    $permitted_ids[] = (int) $candidate_id;
                }
            }
            if ( empty( $permitted_ids ) ) {
                wp_send_json_error( array(
                    'message' => __( 'You do not have permission to modify the selected media items.', 'imgsentry' ),
                ), 403 );
                exit;
            }
            $ids_to_process = $permitted_ids;
        }
        $processed_ids = array();
        $processed_items = array();
        $failed_ids = array();
        $skipped_now_used_ids = array();
        $skipped_used_ids = array();
        $skipped_protected_ids = array();
        switch ( $action ) {
            case 'trash':
                foreach ( $ids_to_process as $id ) {
                    if ( $this->is_blocked_by_duplicate_ignore( $id ) ) {
                        $failed_ids[] = $id;
                        // Ignored files are never trashed from the duplicates page.
                        continue;
                    }
                    $item_meta = self::imgsentry_get_attachment_item_meta( $id );
                    // Real-time usage verification safety gate to close race condition window
                    if ( class_exists( 'ImgSentry_Usage_Indexer' ) ) {
                        $usage_check_res = ImgSentry_Usage_Indexer::check_attachments_usage( array($id), false );
                        $usage_item = ( !empty( $usage_check_res['items'][0] ) ? $usage_check_res['items'][0] : null );
                        $has_protection_rule = false;
                        $genuine_usage_count = 0;
                        if ( !empty( $usage_item['locations'] ) && is_array( $usage_item['locations'] ) ) {
                            foreach ( $usage_item['locations'] as $loc ) {
                                $ft = ( isset( $loc['field_type'] ) ? $loc['field_type'] : '' );
                                if ( 'exclusion_rule' === $ft || 'min_age_rule' === $ft ) {
                                    $has_protection_rule = true;
                                } else {
                                    $genuine_usage_count++;
                                }
                            }
                        }
                        $is_genuinely_used = $genuine_usage_count > 0 || !empty( $usage_item['is_used'] ) && !$has_protection_rule;
                        // Requirement 4b: Prevent trashing unverified items
                        global $wpdb;
                        $table_name = ImgSentry_Usage_Indexer::get_table_name();
                        $is_unverified = (bool) $wpdb->get_var( $wpdb->prepare( 
                            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                            "SELECT 1 FROM {$table_name} WHERE attachment_id = %d AND is_dirty = 1",
                            $id
                         ) );
                        if ( $is_unverified && !$is_genuinely_used ) {
                            $skipped_now_used_ids[] = $id;
                            if ( class_exists( 'ImgSentry_Logger' ) ) {
                                ImgSentry_Logger::warning( 'Skipped Trashing Unverified File', array(
                                    'type'      => 'Delete',
                                    'source'    => 'ImgSentry',
                                    'details'   => sprintf( 'Skipped trashing attachment #%d: Usage is still being checked.', $id ),
                                    'object_id' => $id,
                                ) );
                            }
                            continue;
                        }
                        // Skip if genuinely in use (unless overridden), OR if protected by settings (unless separately overridden)
                        if ( $is_genuinely_used && !$force_used || $has_protection_rule && !$force_protected ) {
                            $skipped_now_used_ids[] = $id;
                            if ( $is_genuinely_used ) {
                                $skipped_used_ids[] = $id;
                            } else {
                                $skipped_protected_ids[] = $id;
                            }
                            // Only persist a status update when genuinely used — this only confirms/elevates
                            // status to 'used' and is safe. Do NOT write 'unused' here for protection-rule-only
                            // skips, since that would risk forcing an incorrect status based on this check's data.
                            if ( $is_genuinely_used ) {
                                $compat_usage = array(
                                    'is_used' => true,
                                    'status'  => 'used',
                                    'sources' => ( !empty( $usage_item['locations'] ) ? $usage_item['locations'] : array() ),
                                    'count'   => $genuine_usage_count,
                                    'hash'    => '',
                                );
                                ImgSentry_Usage_Indexer::update_attachment_usage_record( $id, $compat_usage );
                            }
                            if ( class_exists( 'ImgSentry_Logger' ) ) {
                                ImgSentry_Logger::warning( 'Skipped Trashing File', array(
                                    'type'      => 'Delete',
                                    'source'    => 'ImgSentry',
                                    'details'   => sprintf(
                                        'Skipped trashing attachment "%s" (ID: #%d): %s.',
                                        $item_meta['title'],
                                        $id,
                                        ( $is_genuinely_used ? 'currently in use on site' : 'protected by settings' )
                                    ),
                                    'object_id' => $id,
                                ) );
                            }
                            continue;
                        }
                    }
                    $res = self::imgsentry_soft_delete_attachment( $id );
                    if ( $res['success'] ) {
                        $processed_ids[] = $id;
                        $processed_items[] = $item_meta;
                    } else {
                        $failed_ids[] = $id;
                        if ( class_exists( 'ImgSentry_Logger' ) ) {
                            ImgSentry_Logger::error( 'Failed to Move to Trash', array(
                                'type'      => 'Delete',
                                'source'    => 'ImgSentry',
                                'details'   => sprintf(
                                    'Failed to quarantine attachment "%s" (ID: #%d): %s',
                                    $item_meta['title'],
                                    $id,
                                    ( isset( $res['message'] ) ? $res['message'] : 'Unknown error' )
                                ),
                                'object_id' => $id,
                            ) );
                        }
                    }
                }
                $count = count( $processed_ids );
                $skipped_cnt = count( $skipped_now_used_ids );
                $total_bytes = array_sum( array_column( $processed_items, 'size' ) );
                if ( $skipped_cnt > 0 ) {
                    /* translators: 1: trashed count, 2: skipped count */
                    $msg = sprintf( __( '%1$d items moved to trash, %2$d skipped (in use or protected by settings).', 'imgsentry' ), $count, $skipped_cnt );
                } else {
                    /* translators: %d: trashed count */
                    $msg = sprintf( __( '%d items moved to trash.', 'imgsentry' ), $count );
                }
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    if ( $count === 1 && $skipped_cnt === 0 ) {
                        $item = $processed_items[0];
                        ImgSentry_Logger::success( 'Moved to Trash', array(
                            'type'      => 'Delete',
                            'source'    => 'ImgSentry',
                            'details'   => sprintf(
                                'Moved "%s" (ID: #%d, %s) to quarantine trash folder.',
                                $item['title'],
                                $item['id'],
                                $item['size_formatted']
                            ),
                            'object_id' => $item['id'],
                        ) );
                    } elseif ( $count > 0 || $skipped_cnt > 0 ) {
                        $details_str = sprintf( 'Moved %d files (%s) to quarantine trash folder.', $count, size_format( $total_bytes, 2 ) );
                        if ( !empty( $skipped_now_used_ids ) ) {
                            $details_str .= sprintf( ' (%d skipped as used)', count( $skipped_now_used_ids ) );
                        }
                        if ( !empty( $failed_ids ) ) {
                            $details_str .= sprintf( ' (%d failed)', count( $failed_ids ) );
                        }
                        ImgSentry_Logger::success( 'Bulk Moved to Trash', array(
                            'type'      => 'Delete',
                            'source'    => 'ImgSentry',
                            'details'   => array(
                                'summary'                => $details_str,
                                'count'                  => $count,
                                'total_bytes'            => $total_bytes,
                                'formatted_size'         => size_format( $total_bytes, 2 ),
                                'skipped_now_used_count' => $skipped_cnt,
                                'failed_count'           => count( $failed_ids ),
                                'items'                  => $processed_items,
                            ),
                            'object_id' => ( !empty( $processed_ids ) ? $processed_ids[0] : (( !empty( $skipped_now_used_ids ) ? $skipped_now_used_ids[0] : 0 )) ),
                        ) );
                    }
                }
                if ( class_exists( 'ImgSentry_Duplicate_Finder' ) ) {
                    ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'Bulk trash action on %d items', $count ) );
                }
                if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
                    ImgSentry_Optimization_Stats::invalidate_cache();
                }
                break;
            case 'restore':
                foreach ( $ids_to_process as $id ) {
                    $item_meta = self::imgsentry_get_attachment_item_meta( $id );
                    $res = self::imgsentry_restore_attachment( $id );
                    if ( $res['success'] ) {
                        $processed_ids[] = $id;
                        $processed_items[] = $item_meta;
                    } else {
                        $failed_ids[] = $id;
                        if ( class_exists( 'ImgSentry_Logger' ) ) {
                            ImgSentry_Logger::error( 'Failed to Restore from Trash', array(
                                'type'      => 'Restore',
                                'source'    => 'ImgSentry',
                                'details'   => sprintf(
                                    'Failed to restore attachment "%s" (ID: #%d): %s',
                                    $item_meta['title'],
                                    $id,
                                    ( isset( $res['message'] ) ? $res['message'] : 'Unknown error' )
                                ),
                                'object_id' => $id,
                            ) );
                        }
                    }
                }
                $count = count( $processed_ids );
                $total_bytes = array_sum( array_column( $processed_items, 'size' ) );
                /* translators: %d: number of items */
                $msg = sprintf( __( '%d items restored.', 'imgsentry' ), $count );
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    if ( $count === 1 ) {
                        $item = $processed_items[0];
                        ImgSentry_Logger::success( 'Restored from Trash', array(
                            'type'      => 'Restore',
                            'source'    => 'ImgSentry',
                            'details'   => sprintf( 'Restored "%s" (ID: #%d) back to active media library.', $item['title'], $item['id'] ),
                            'object_id' => $item['id'],
                        ) );
                    } elseif ( $count > 1 ) {
                        $details_str = sprintf( 'Restored %d files (%s) back to active media library.', $count, size_format( $total_bytes, 2 ) );
                        if ( !empty( $failed_ids ) ) {
                            $details_str .= sprintf( ' (%d failed)', count( $failed_ids ) );
                        }
                        ImgSentry_Logger::success( 'Bulk Restored from Trash', array(
                            'type'      => 'Restore',
                            'source'    => 'ImgSentry',
                            'details'   => array(
                                'summary'        => $details_str,
                                'count'          => $count,
                                'total_bytes'    => $total_bytes,
                                'formatted_size' => size_format( $total_bytes, 2 ),
                                'failed_count'   => count( $failed_ids ),
                                'items'          => $processed_items,
                            ),
                            'object_id' => $processed_ids[0],
                        ) );
                    }
                }
                if ( class_exists( 'ImgSentry_Duplicate_Finder' ) ) {
                    ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'Bulk restore action on %d items', $count ) );
                }
                if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
                    ImgSentry_Optimization_Stats::invalidate_cache();
                }
                break;
            case 'delete_permanent':
                $skipped_now_used_ids = array();
                $trash_base = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir() : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/trash/media/' );
                foreach ( $ids_to_process as $id ) {
                    $item_meta = self::imgsentry_get_attachment_item_meta( $id );
                    // Determine quarantine folder BEFORE deleting post from database
                    $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $id ) : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/trash/media/' . $id . '/' );
                    if ( !is_dir( $quarantine_dir ) ) {
                        $candidates = glob( trailingslashit( $trash_base ) . '*/*/' . $id, GLOB_ONLYDIR );
                        if ( !empty( $candidates ) && is_dir( $candidates[0] ) ) {
                            $quarantine_dir = trailingslashit( $candidates[0] );
                        } else {
                            $legacy = trailingslashit( $trash_base ) . $id;
                            if ( is_dir( $legacy ) ) {
                                $quarantine_dir = trailingslashit( $legacy );
                            }
                        }
                    }
                    if ( class_exists( 'ImgSentry_Usage_Indexer' ) ) {
                        $usage_check_res = ImgSentry_Usage_Indexer::check_attachments_usage( array($id), false );
                        $usage_item = ( !empty( $usage_check_res['items'][0] ) ? $usage_check_res['items'][0] : null );
                        $is_used = !empty( $usage_item['is_used'] );
                        if ( $is_used ) {
                            $skipped_now_used_ids[] = $id;
                            if ( class_exists( 'ImgSentry_Logger' ) ) {
                                ImgSentry_Logger::warning( 'Skipped Permanent Deletion', array(
                                    'type'      => 'Delete',
                                    'source'    => 'ImgSentry',
                                    'details'   => sprintf( 'Skipped permanent deletion of "%s" (ID: #%d) because it is currently in use on the site.', $item_meta['title'], $id ),
                                    'object_id' => $id,
                                ) );
                            }
                            continue;
                        }
                    }
                    // Clean up orphaned optimization backup BEFORE wp_delete_attachment removes postmeta
                    self::cleanup_optimization_backup( $id, $item_meta['title'] );
                    $deleted = wp_delete_attachment( $id, true );
                    if ( $deleted ) {
                        self::delete_quarantine_folder( $quarantine_dir );
                        $processed_ids[] = $id;
                        $processed_items[] = $item_meta;
                    } else {
                        $failed_ids[] = $id;
                        if ( class_exists( 'ImgSentry_Logger' ) ) {
                            ImgSentry_Logger::error( 'Failed to Delete Permanently', array(
                                'type'      => 'Delete',
                                'source'    => 'ImgSentry',
                                'details'   => sprintf( 'Could not delete "%s" (ID: #%d) - file in use or database error.', $item_meta['title'], $id ),
                                'object_id' => $id,
                            ) );
                        }
                    }
                }
                $count = count( $processed_ids );
                $total_bytes = array_sum( array_column( $processed_items, 'size' ) );
                if ( count( $skipped_now_used_ids ) > 0 ) {
                    /* translators: %1$d: number of items deleted, %2$d: number of items skipped */
                    $msg = sprintf( __( '%1$d items permanently deleted, %2$d skipped (in use).', 'imgsentry' ), $count, count( $skipped_now_used_ids ) );
                } else {
                    /* translators: %d: number of items */
                    $msg = sprintf( __( '%d items permanently deleted.', 'imgsentry' ), $count );
                }
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    if ( $count === 1 ) {
                        $item = $processed_items[0];
                        ImgSentry_Logger::success( 'Deleted Permanently', array(
                            'type'      => 'Delete',
                            'source'    => 'ImgSentry',
                            'details'   => sprintf(
                                'Permanently deleted file "%s" (ID: #%d, %s) and associated thumbnails.',
                                $item['title'],
                                $item['id'],
                                $item['size_formatted']
                            ),
                            'object_id' => $item['id'],
                        ) );
                    } elseif ( $count > 1 ) {
                        $details_str = sprintf( 'Permanently purged %d media items (%s) from disk and database.', $count, size_format( $total_bytes, 2 ) );
                        if ( !empty( $failed_ids ) ) {
                            $details_str .= sprintf( ' (%d failed)', count( $failed_ids ) );
                        }
                        ImgSentry_Logger::success( 'Bulk Permanently Deleted', array(
                            'type'      => 'Delete',
                            'source'    => 'ImgSentry',
                            'details'   => array(
                                'summary'        => $details_str,
                                'count'          => $count,
                                'total_bytes'    => $total_bytes,
                                'formatted_size' => size_format( $total_bytes, 2 ),
                                'failed_count'   => count( $failed_ids ),
                                'items'          => $processed_items,
                            ),
                            'object_id' => $processed_ids[0],
                        ) );
                    }
                }
                if ( class_exists( 'ImgSentry_Duplicate_Finder' ) ) {
                    ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'Bulk permanent delete on %d items', $count ) );
                }
                if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
                    ImgSentry_Optimization_Stats::invalidate_cache();
                }
                break;
            default:
                wp_send_json_error( array(
                    'message' => __( 'Invalid bulk action.', 'imgsentry' ),
                ) );
                return;
        }
        $remaining = max( 0, $total_ids - ($offset + count( $ids_to_process )) );
        wp_send_json_success( array(
            'message'                => $msg,
            'count'                  => count( $processed_ids ),
            'processed_count'        => count( $processed_ids ),
            'failed_count'           => count( $failed_ids ),
            'skipped_now_used_count' => count( $skipped_now_used_ids ),
            'processed_ids'          => $processed_ids,
            'failed_ids'             => $failed_ids,
            'skipped_now_used_ids'   => $skipped_now_used_ids,
            'skipped_used_ids'       => $skipped_used_ids,
            'skipped_protected_ids'  => $skipped_protected_ids,
            'offset'                 => $offset,
            'batch_size'             => $batch_size,
            'total'                  => $total_ids,
            'remaining'              => $remaining,
            'has_more'               => $remaining > 0,
            'is_complete'            => $remaining === 0,
            'stats'                  => ( 'delete_permanent' === $action ? ImgSentry_Scanner::get_total_stats_after_mutation( $count, $total_bytes ) : ImgSentry_Scanner::get_total_stats() ),
        ) );
    }

    /**
     * Delete All Media (Active or Trashed).
     */
    public function delete_all() {
        $this->verify_permission( 'trash_delete_permanent', 'imgsentry_admin_nonce' );
        // Free plan: acting on the whole library / whole Trash at once is a Pro feature.
        ImgSentry_License::require_feature( 'trash_bulk_actions', __( 'Bulk actions on all items require ImgSentry Pro.', 'imgsentry' ) );
    }

    /**
     * Empty Trash.
     * Supports time-budget-driven adaptive batching (75% of max_execution_time),
     * with backward-compatible optional `batch_size` cap and `offset` support.
     */
    public function empty_trash() {
        $this->verify_permission( 'trash_delete_permanent', 'imgsentry_admin_nonce' );
        // Free plan: Empty Trash (bulk) is a Pro feature. Items can still be deleted one at a time.
        ImgSentry_License::require_feature( 'trash_bulk_actions', __( 'Empty Trash requires ImgSentry Pro. You can still delete items one at a time.', 'imgsentry' ) );
    }

    /**
     * Stream quarantine media preview securely for authorized administrators.
     */
    public function imgsentry_ajax_stream_quarantine_media() {
        $this->verify_permission( 'trash_view', 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
        $attachment_id = ( isset( $_GET['id'] ) ? intval( $_GET['id'] ) : 0 );
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
        $size = ( isset( $_GET['size'] ) ? sanitize_file_name( wp_unslash( $_GET['size'] ) ) : '' );
        if ( !$attachment_id ) {
            wp_die( 'Invalid media ID' );
        }
        $upload_dir = wp_upload_dir();
        $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $attachment_id ) : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/trash/media/' . $attachment_id . '/' );
        if ( !is_dir( $quarantine_dir ) ) {
            $trash_base = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir() : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/trash/media/' );
            $candidates = glob( trailingslashit( $trash_base ) . '*/*/' . $attachment_id, GLOB_ONLYDIR );
            if ( !empty( $candidates ) && is_dir( $candidates[0] ) ) {
                $quarantine_dir = trailingslashit( $candidates[0] );
            } else {
                $legacy = trailingslashit( $trash_base ) . $attachment_id;
                if ( is_dir( $legacy ) ) {
                    $quarantine_dir = trailingslashit( $legacy );
                }
            }
        }
        if ( !is_dir( $quarantine_dir ) ) {
            wp_die( 'File not found in quarantine' );
        }
        $target_file = '';
        if ( !empty( $size ) && file_exists( $quarantine_dir . $size ) ) {
            $target_file = $quarantine_dir . $size;
        } else {
            $files = array_diff( scandir( $quarantine_dir ), array('.', '..') );
            if ( !empty( $files ) ) {
                $target_file = $quarantine_dir . reset( $files );
            }
        }
        if ( !$target_file || !file_exists( $target_file ) ) {
            wp_die( 'File not found' );
        }
        // Boundary check: Verify realpath of target file resolves inside trash base directory
        $trash_base_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir() : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/trash/media/' );
        $real_target = realpath( $target_file );
        $real_trash_base = realpath( $trash_base_dir );
        if ( !$real_target || !$real_trash_base ) {
            wp_die( 'File not found in quarantine' );
        }
        $norm_target = wp_normalize_path( $real_target );
        $norm_trash_base = wp_normalize_path( $real_trash_base );
        if ( 0 !== strpos( $norm_target, $norm_trash_base ) ) {
            wp_die( 'File not found in quarantine' );
        }
        $mime_type = wp_check_filetype( $target_file )['type'];
        if ( !$mime_type ) {
            $mime_type = 'application/octet-stream';
        }
        if ( ob_get_level() ) {
            ob_end_clean();
        }
        header( 'Content-Type: ' . $mime_type );
        header( 'Content-Disposition: inline; filename="' . rawurlencode( basename( $target_file ) ) . '"' );
        header( 'Content-Length: ' . filesize( $target_file ) );
        header( 'Cache-Control: private, max-age=3600' );
        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
        readfile( $target_file );
        exit;
    }

}
