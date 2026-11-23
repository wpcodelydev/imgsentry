<?php

/**
 * AJAX Settings Controller Class for ImgSentry.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Ajax_Settings extends ImgSentry_Ajax_Base {
    /**
     * Constructor. Register Settings AJAX actions.
     */
    public function __construct() {
        add_action( 'wp_ajax_imgsentry_get_settings', array($this, 'get_settings') );
        add_action( 'wp_ajax_imgsentry_save_settings', array($this, 'save_settings') );
        add_action( 'wp_ajax_imgsentry_test_email', array($this, 'test_email') );
        add_action( 'wp_ajax_imgsentry_clean_plugin_data', array($this, 'clean_plugin_data') );
        add_action( 'wp_ajax_imgsentry_run_cron_now', array($this, 'run_cron_now') );
        add_action( 'wp_ajax_imgsentry_get_upload_folders', array($this, 'get_upload_folders') );
        add_action( 'wp_ajax_imgsentry_check_upload_folder', array($this, 'check_upload_folder') );
    }

    /**
     * Fetch Plugin Settings.
     */
    public function get_settings() {
        $this->verify_request( 'imgsentry_admin_nonce' );
        $settings = ImgSentry_Settings::instance()->get_settings();
        $settings = ImgSentry_Integrations::prepare_settings_for_browser( $settings );
        wp_send_json_success( array(
            'settings'            => $settings,
            'actual_memory_limit' => ImgSentry_Settings::get_actual_memory_limit(),
            'integrations'        => ( isset( $settings['integrations'] ) ? $settings['integrations'] : array() ),
        ) );
    }

    /**
     * Send one test email, so the admin can check that mail from this site is delivered.
     *
     * Uses the address typed in the form (even if not saved yet). An empty address falls back to the saved
     * Notification Email and then to the WordPress admin email. Nothing is stored. A short per-user wait stops
     * repeated clicks from sending many emails.
     */
    public function test_email() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        $throttle_key = 'imgsentry_test_email_' . get_current_user_id();
        if ( get_transient( $throttle_key ) ) {
            wp_send_json_error( array(
                'message' => __( 'Please wait a few seconds before sending another test email.', 'imgsentry' ),
            ) );
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- The nonce is checked in verify_admin_request() above.
        $typed = ( isset( $_POST['email'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['email'] ) ) ) : '' );
        if ( '' !== $typed ) {
            $to = sanitize_email( $typed );
            if ( !is_email( $to ) ) {
                wp_send_json_error( array(
                    'message' => __( 'The Notification Email is not a valid email address.', 'imgsentry' ),
                ) );
            }
        } else {
            $stored = ImgSentry_Settings::instance()->get_settings();
            $to = ( is_array( $stored ) && !empty( $stored['notificationEmail'] ) ? sanitize_email( $stored['notificationEmail'] ) : '' );
            if ( !is_email( $to ) ) {
                $to = sanitize_email( (string) get_option( 'admin_email' ) );
            }
            if ( !is_email( $to ) ) {
                wp_send_json_error( array(
                    'message' => __( 'No valid email address was found. Enter a Notification Email first.', 'imgsentry' ),
                ) );
            }
        }
        // The From Email as typed in the form (even if not saved yet). Empty means the WordPress default sender.
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- The nonce is checked in verify_admin_request() above.
        $from = ( isset( $_POST['from'] ) ? sanitize_email( trim( sanitize_text_field( wp_unslash( $_POST['from'] ) ) ) ) : null );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- The nonce is checked in verify_admin_request() above.
        if ( isset( $_POST['from'] ) && '' !== trim( sanitize_text_field( wp_unslash( $_POST['from'] ) ) ) && !is_email( (string) $from ) ) {
            wp_send_json_error( array(
                'message' => __( 'The From Email is not a valid email address.', 'imgsentry' ),
            ) );
        }
        set_transient( $throttle_key, 1, 10 );
        $site_name = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
        /* translators: %s: site name */
        $subject = sprintf( __( '[%s] ImgSentry test email', 'imgsentry' ), $site_name );
        $message = __( 'This is a test email from ImgSentry.', 'imgsentry' ) . "\n\n";
        $message .= __( 'If you can read this message, emails from this site reach this address.', 'imgsentry' ) . "\n\n";
        /* translators: %s: site address (URL) */
        $imgsentry_msg_1 = sprintf( __( 'Site: %s', 'imgsentry' ), home_url() );
        $message .= $imgsentry_msg_1 . "\n";
        // Remember the reason if WordPress reports that the message could not be sent.
        $failure = '';
        $on_failed = static function ( $error ) use(&$failure) {
            if ( $error instanceof WP_Error ) {
                $failure = wp_strip_all_tags( $error->get_error_message() );
            }
        };
        add_action( 'wp_mail_failed', $on_failed );
        $sent = ImgSentry_Settings::send_plugin_mail(
            $to,
            $subject,
            $message,
            $from
        );
        remove_action( 'wp_mail_failed', $on_failed );
        if ( $sent ) {
            /* translators: %s: email address that received the test message */
            $imgsentry_msg_2 = sprintf( __( 'Test email sent to %s. Check your inbox and the spam folder.', 'imgsentry' ), $to );
            wp_send_json_success( array(
                'message' => $imgsentry_msg_2,
            ) );
        }
        $reason = ( '' !== $failure ? ' ' . mb_substr( $failure, 0, 200 ) : '' );
        wp_send_json_error( array(
            'message' => __( 'Could not send the email.', 'imgsentry' ) . $reason . ' ' . __( 'Check your mail or SMTP plugin settings.', 'imgsentry' ),
        ) );
    }

    /**
     * Save Plugin Settings.
     */
    public function save_settings() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $settings_raw = ( isset( $_POST['settings'] ) ? json_decode( wp_unslash( $_POST['settings'] ), true ) : null );
        if ( !is_array( $settings_raw ) ) {
            wp_send_json_error( array(
                'message' => __( 'Invalid settings payload received.', 'imgsentry' ),
            ) );
        }
        $settings_instance = ImgSentry_Settings::instance();
        $existing = $settings_instance->get_settings();
        $sanitized = $settings_instance->sanitize_settings( $settings_raw, $existing );
        // At least one scan file type must stay enabled, otherwise a scan would have nothing to check.
        $file_type_keys = array(
            'includeImages',
            'includeDocuments',
            'includeVideos',
            'includeAudio',
            'includeSvg',
            'includeOthers'
        );
        $any_file_type = false;
        foreach ( $file_type_keys as $file_type_key ) {
            if ( !empty( $sanitized[$file_type_key] ) ) {
                $any_file_type = true;
                break;
            }
        }
        if ( !$any_file_type ) {
            wp_send_json_error( array(
                'message' => __( 'Select at least one file type in Settings > Scan Settings > Scan File Types before saving.', 'imgsentry' ),
            ) );
        }
        // The notification email, when given, must be a valid address.
        if ( isset( $settings_raw['notificationEmail'] ) && '' !== trim( (string) $settings_raw['notificationEmail'] ) && !is_email( sanitize_email( trim( (string) $settings_raw['notificationEmail'] ) ) ) ) {
            wp_send_json_error( array(
                'message' => __( 'The Notification Email is not a valid email address.', 'imgsentry' ),
            ) );
        }
        // The From Email, when given, must be a valid address.
        if ( isset( $settings_raw['notificationFromEmail'] ) && '' !== trim( (string) $settings_raw['notificationFromEmail'] ) && !is_email( sanitize_email( trim( (string) $settings_raw['notificationFromEmail'] ) ) ) ) {
            wp_send_json_error( array(
                'message' => __( 'The From Email is not a valid email address.', 'imgsentry' ),
            ) );
        }
        // The File Manager private folder, when given, must exist inside the allowed area.
        $private_folder = ( isset( $sanitized['fileManagerPrivateFolderAccess'] ) ? trim( (string) $sanitized['fileManagerPrivateFolderAccess'] ) : '' );
        if ( '' !== $private_folder && class_exists( 'ImgSentry_FM_Security' ) && '' === ImgSentry_FM_Security::resolve_private_folder( $private_folder, (string) get_option( 'imgsentry_fm_root_scope', 'wp-content' ) ) ) {
            wp_send_json_error( array(
                'message' => __( 'The Separate or Private Folder was not found or is outside the allowed area. Use a folder inside wp-content, for example wp-content/uploads/clients.', 'imgsentry' ),
            ) );
        }
        // Free plan: auto-delete of Trash is always OFF. Keep the previously stored raw value in the
        // database (so it returns after an upgrade) and report OFF to the browser.
        $stored_value = $sanitized['autoPurgeTrashEnabled'];
        if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'trash_auto_purge' ) ) {
            $raw_saved = get_option( ImgSentry_Settings::OPTION_KEY, array() );
            $stored_value = ( is_array( $raw_saved ) && array_key_exists( 'autoPurgeTrashEnabled', $raw_saved ) ? (bool) $raw_saved['autoPurgeTrashEnabled'] : true );
            $sanitized_for_db = $sanitized;
            $sanitized_for_db['autoPurgeTrashEnabled'] = $stored_value;
            $sanitized['autoPurgeTrashEnabled'] = false;
        } else {
            $sanitized_for_db = $sanitized;
        }
        // Free plan: Scheduled Scan, Auto-Trash Unused Files and the scan webhook
        // are always OFF / empty. Keep the previously stored raw value in the database (it returns after an upgrade)
        // and report the OFF / empty value to the browser. Format: setting => array( feature, value shown while locked ).
        $gated_settings = array(
            'enableScheduledScan'  => array('scheduled_scan', false),
            'autoTrashUnusedFiles' => array('auto_trash_unused', false),
            'webhookUrl'           => array('webhook', ''),
            'webhookSecret'        => array('webhook', ''),
        );
        $raw_saved_gated = get_option( ImgSentry_Settings::OPTION_KEY, array() );
        foreach ( $gated_settings as $gated_key => $gated_rule ) {
            if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( $gated_rule[0] ) ) {
                if ( is_array( $raw_saved_gated ) && array_key_exists( $gated_key, $raw_saved_gated ) ) {
                    $sanitized_for_db[$gated_key] = ( is_bool( $gated_rule[1] ) ? (bool) $raw_saved_gated[$gated_key] : (string) $raw_saved_gated[$gated_key] );
                } else {
                    $sanitized_for_db[$gated_key] = $gated_rule[1];
                }
                $sanitized[$gated_key] = $gated_rule[1];
            }
        }
        // Persist the full settings object
        update_option( ImgSentry_Settings::OPTION_KEY, $sanitized_for_db, false );
        ImgSentry_Integrations::flush_cache();
        // Keep legacy retention days option in sync
        if ( isset( $sanitized['retentionDays'] ) ) {
            update_option( 'imgsentry_trash_days', $sanitized['retentionDays'] );
        }
        $this->log_action(
            'Plugin settings updated',
            'Configuration updated and synchronized.',
            'Info',
            'Settings',
            'System'
        );
        // Check if the submitted backup directory was rejected / altered by sanitization
        $warnings = array();
        // Next-Gen delivery with rewrite rules: bring the .htaccess file in line with the saved settings.
        $rewrite_result = ImgSentry_Htaccess::sync( $sanitized_for_db );
        if ( !$rewrite_result['ok'] ) {
            $warnings[] = array(
                'code'    => 'rewrite_rules',
                'message' => $rewrite_result['message'],
            );
        }
        if ( isset( $settings_raw['backupDirectory'] ) ) {
            $submitted_backup = trim( (string) $settings_raw['backupDirectory'] );
            if ( '' !== $submitted_backup ) {
                $normalized = str_replace( '\\', '/', $submitted_backup );
                $normalized = preg_replace( '#/+#', '/', $normalized );
                $normalized = trailingslashit( $normalized );
                $normalized = ltrim( $normalized, '/' );
                $applied_backup = ( isset( $sanitized['backupDirectory'] ) ? $sanitized['backupDirectory'] : '' );
                if ( $normalized !== $applied_backup ) {
                    $warnings[] = array(
                        'code'    => 'backup_directory_rejected',
                        'message' => sprintf( 
                            /* translators: %s: The applied backup folder path */
                            __( 'The backup folder was rejected and reset to "%s". Backups must be inside the uploads directory.', 'imgsentry' ),
                            $applied_backup
                         ),
                        'applied' => $applied_backup,
                    );
                }
            }
        }
        // Warn about NEW hand-typed excluded folders that do not exist (usually a spelling mistake).
        // The rule is still saved; recommended (pre-seeded) folders are skipped because they appear only when a plugin creates them.
        if ( !empty( $sanitized['excludedFolders'] ) && is_array( $sanitized['excludedFolders'] ) ) {
            $old_paths = array();
            foreach ( ( isset( $existing['excludedFolders'] ) && is_array( $existing['excludedFolders'] ) ? $existing['excludedFolders'] : array() ) as $old_item ) {
                $old_paths[] = ( is_array( $old_item ) && isset( $old_item['path'] ) ? (string) $old_item['path'] : (string) $old_item );
            }
            list( $uploads_base ) = $this->get_uploads_context();
            $missing_folders = array();
            foreach ( $sanitized['excludedFolders'] as $folder_item ) {
                if ( !is_array( $folder_item ) || !empty( $folder_item['isPreSeeded'] ) || in_array( $folder_item['path'], $old_paths, true ) ) {
                    continue;
                }
                $rel = ltrim( $folder_item['path'], '/' );
                if ( 0 === stripos( $rel, 'wp-content/uploads/' ) ) {
                    $rel = substr( $rel, strlen( 'wp-content/uploads/' ) );
                }
                if ( '' !== $rel && '' === $this->resolve_upload_subfolder( $uploads_base, $rel ) ) {
                    $missing_folders[] = $folder_item['path'];
                }
            }
            if ( !empty( $missing_folders ) ) {
                $warnings[] = array(
                    'code'    => 'excluded_folder_missing',
                    'message' => sprintf( 
                        /* translators: %s: comma separated folder paths */
                        __( 'Saved, but these excluded folders were not found on the server: %s. Check the spelling.', 'imgsentry' ),
                        implode( ', ', $missing_folders )
                     ),
                );
            }
        }
        // Tell the user when some custom image field lines were ignored (invalid, duplicate or over the limit of 50).
        if ( isset( $settings_raw['customMetaKeys'] ) ) {
            $raw_keys = ( is_array( $settings_raw['customMetaKeys'] ) ? $settings_raw['customMetaKeys'] : array() );
            $raw_keys = array_filter( array_map( static function ( $k ) {
                return ( is_scalar( $k ) ? trim( (string) $k ) : '' );
            }, $raw_keys ), 'strlen' );
            if ( count( array_unique( $raw_keys ) ) > count( $sanitized['customMetaKeys'] ) ) {
                $warnings[] = array(
                    'code'    => 'custom_meta_keys_ignored',
                    'message' => __( 'Some custom image fields were ignored (invalid characters, too long, or more than 50).', 'imgsentry' ),
                );
            }
        }
        wp_send_json_success( array(
            'message'  => __( 'Settings saved successfully.', 'imgsentry' ),
            'settings' => ImgSentry_Integrations::prepare_settings_for_browser( $sanitized ),
            'warnings' => $warnings,
        ) );
    }

    /**
     * Run Cron Manually from Admin.
     */
    public function run_cron_now() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        $count = ImgSentry_Cron::imgsentry_execute_purge_batch();
        $this->log_action(
            'Cron job executed manually',
            sprintf( 'Manual auto-cleanup executed. %d expired items purged.', $count ),
            'Success',
            'System',
            'System'
        );
        /* translators: %d: number of expired items that were purged */
        $imgsentry_msg_3 = sprintf( __( 'Auto-purge cron executed. %d expired items purged.', 'imgsentry' ), $count );
        wp_send_json_success( array(
            'message' => $imgsentry_msg_3,
            'stats'   => ImgSentry_Scanner::get_total_stats(),
        ) );
    }

    /**
     * Clean disposable or regenerable plugin data.
     */
    public function clean_plugin_data() {
        global $wpdb;
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $options_raw = ( isset( $_POST['options'] ) ? json_decode( wp_unslash( $_POST['options'] ), true ) : null );
        if ( !is_array( $options_raw ) ) {
            wp_send_json_error( array(
                'message' => __( 'Invalid cleanup options received.', 'imgsentry' ),
            ) );
        }
        $clean_orph_scans = !empty( $options_raw['cleanOrphanedScans'] );
        $clean_scans = !empty( $options_raw['cleanScans'] );
        $clean_logs = !empty( $options_raw['cleanLogs'] );
        $clean_trans = !empty( $options_raw['cleanTransients'] );
        $clean_orphmeta = !empty( $options_raw['cleanOrphanedMeta'] );
        $clean_thumbs = !empty( $options_raw['cleanThumbsCache'] );
        // Never reset or purge scan data while a scan (manual or scheduled) is running.
        if ( ($clean_scans || $clean_orph_scans) && class_exists( 'ImgSentry_FM_Media_Sync' ) && ImgSentry_FM_Media_Sync::is_locked() ) {
            wp_send_json_error( array(
                'message' => __( 'A scan is currently running. Please wait for it to finish before cleaning scan data.', 'imgsentry' ),
            ) );
        }
        $freed_orph_scans = 0;
        $freed_scans = 0;
        $freed_logs = 0;
        $freed_transients = 0;
        $freed_meta = 0;
        $freed_thumbs = 0;
        $freed_thumb_bytes = 0;
        // 1a. Clean Orphaned Scan Records Only (Safe option)
        if ( $clean_orph_scans ) {
            $table_usage = $wpdb->prefix . 'imgsentry_attachment_usage';
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $result = $wpdb->query( "DELETE u FROM {$table_usage} u LEFT JOIN {$wpdb->posts} p ON u.attachment_id = p.ID WHERE p.ID IS NULL" );
            if ( is_numeric( $result ) ) {
                $freed_orph_scans = $result;
            }
        }
        // 1b. Clean Scan Data & Indices (Reset)
        if ( $clean_scans ) {
            $table_usage = $wpdb->prefix . 'imgsentry_attachment_usage';
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $result = $wpdb->query( "DELETE FROM {$table_usage}" );
            if ( is_numeric( $result ) ) {
                $freed_scans = $result;
            }
            delete_option( 'imgsentry_scan_history' );
            delete_option( 'imgsentry_scan_status' );
        }
        // 2. Clean Logs Table
        if ( $clean_logs ) {
            $table_logs = $wpdb->prefix . 'imgsentry_logs';
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $result = $wpdb->query( "DELETE FROM {$table_logs}" );
            if ( is_numeric( $result ) ) {
                $freed_logs = $result;
            }
            delete_option( 'imgsentry_audit_log' );
        }
        // 3. Clean cached next-gen image URLs (transients). Locks, throttles and quota markers are never touched.
        if ( $clean_trans ) {
            $result = $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $wpdb->esc_like( '_transient_imgsentry_ng_url_' ) . '%', $wpdb->esc_like( '_transient_timeout_imgsentry_ng_url_' ) . '%' ) );
            if ( is_numeric( $result ) ) {
                $freed_transients = $result;
            }
        }
        // 4. Clean orphaned ImgSentry postmeta (only rows whose post no longer exists).
        if ( $clean_orphmeta ) {
            $result = $wpdb->query( $wpdb->prepare( "DELETE pm FROM {$wpdb->postmeta} pm LEFT JOIN {$wpdb->posts} p ON pm.post_id = p.ID WHERE pm.meta_key LIKE %s AND p.ID IS NULL", $wpdb->esc_like( '_imgsentry_' ) . '%' ) );
            if ( is_numeric( $result ) ) {
                $freed_meta = $result;
            }
        }
        // 5. Clean Thumbnail Previews Cache (cache/thumbs/)
        if ( $clean_thumbs && class_exists( 'ImgSentry_FM_Core' ) ) {
            $thumb_res = ImgSentry_FM_Core::clear_thumbnail_cache();
            $freed_thumbs = $thumb_res['deleted'];
            $freed_thumb_bytes = $thumb_res['freed_bytes'];
            // Remove the thumbnail lookup entries too, so none of them points to a deleted preview file.
            $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $wpdb->esc_like( '_transient_imgsentry_th_' ) . '%', $wpdb->esc_like( '_transient_timeout_imgsentry_th_' ) . '%' ) );
        }
        // Cached dashboard numbers are outdated after any cleanup; they are rebuilt on the next request.
        delete_transient( 'imgsentry_dashboard_stats_cache' );
        // Audit Log
        $this->log_action(
            'Plugin Database Cleanup',
            sprintf(
                'Cleaned up database & cache: cleared %d orphaned scan records, reset %d scan index records, %d logs, %d transients, %d orphaned postmeta rows, and %d thumbnail previews (%s freed).',
                $freed_orph_scans,
                $freed_scans,
                $freed_logs,
                $freed_transients,
                $freed_meta,
                $freed_thumbs,
                size_format( $freed_thumb_bytes )
            ),
            'Success',
            'System',
            'System'
        );
        wp_send_json_success( array(
            'message' => __( 'Plugin database and cache cleaned successfully.', 'imgsentry' ),
            'freed'   => array(
                'orphaned_scans' => $freed_orph_scans,
                'scans'          => $freed_scans,
                'logs'           => $freed_logs,
                'transients'     => $freed_transients,
                'meta'           => $freed_meta,
                'thumbs'         => $freed_thumbs,
                'thumb_bytes'    => $freed_thumb_bytes,
            ),
            'stats'   => ImgSentry_Scanner::get_total_stats(),
        ) );
    }

    /**
     * Real uploads folder of this site: absolute path (with trailing slash) and the label shown in the picker.
     * The label is the folder's real place inside the site (for example /wp-content/uploads/sites/2/ on a multisite subsite).
     *
     * @return array{0:string,1:string} [ absolute base, label ]
     */
    private function get_uploads_context() {
        $upload = wp_upload_dir( null, false );
        $base = ( !empty( $upload['basedir'] ) ? trailingslashit( wp_normalize_path( $upload['basedir'] ) ) : '' );
        $abs = trailingslashit( wp_normalize_path( ABSPATH ) );
        $label = '/wp-content/uploads/';
        if ( '' !== $base ) {
            $label = ( 0 === strpos( $base, $abs ) ? '/' . substr( $base, strlen( $abs ) ) : $base );
        }
        return array($base, $label);
    }

    /**
     * Turns a path relative to the uploads folder into a real folder path, or returns '' when it does not exist,
     * is a symlink, or tries to leave the uploads folder.
     *
     * @param string $base Absolute uploads path with trailing slash.
     * @param string $rel  Path inside uploads ('' = the uploads folder itself).
     * @return string Absolute folder path (no trailing slash) or ''.
     */
    private function resolve_upload_subfolder( $base, $rel ) {
        if ( '' === $base || !is_dir( $base ) ) {
            return '';
        }
        $rel = trim( str_replace( '\\', '/', (string) $rel ), '/' );
        if ( '' === $rel ) {
            return rtrim( $base, '/' );
        }
        if ( false !== strpos( $rel, "\x00" ) ) {
            return '';
        }
        $current = rtrim( $base, '/' );
        foreach ( explode( '/', $rel ) as $segment ) {
            if ( '' === $segment || '.' === $segment || '..' === $segment ) {
                return '';
            }
            $current .= '/' . $segment;
            if ( is_link( $current ) || !is_dir( $current ) ) {
                return '';
            }
        }
        return $current;
    }

    /**
     * Returns the real sub-folders of ONE folder inside the uploads directory (used by Settings > Exclusions >
     * Browse Folder Tree). Folders are loaded one level at a time, so nothing is cut off on big sites.
     * Read-only. POST "parent" = path inside uploads ('' = the uploads folder itself).
     */
    public function get_upload_folders() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        list( $base, $label ) = $this->get_uploads_context();
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $parent = ( isset( $_POST['parent'] ) ? sanitize_text_field( wp_unslash( $_POST['parent'] ) ) : '' );
        $parent = trim( str_replace( '\\', '/', $parent ), '/' );
        $full = $this->resolve_upload_subfolder( $base, $parent );
        if ( '' === $full ) {
            wp_send_json_error( array(
                'message' => __( 'This folder was not found inside the uploads folder.', 'imgsentry' ),
            ) );
        }
        $truncated = false;
        $folders = $this->list_upload_children( $base, ( '' === $parent ? '' : $parent . '/' ), $truncated );
        wp_send_json_success( array(
            'folders'        => $folders,
            'truncated'      => $truncated,
            'uploads_root'   => $label,
            'case_sensitive' => ( class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::folder_rules_case_sensitive() : true ),
        ) );
    }

    /**
     * Checks that a folder really exists inside the uploads directory (used when a path is typed by hand).
     * POST "path" = the typed path, for example /wp-content/uploads/my-folder/ or my-folder.
     */
    public function check_upload_folder() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        list( $base ) = $this->get_uploads_context();
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $raw = ( isset( $_POST['path'] ) ? sanitize_text_field( wp_unslash( $_POST['path'] ) ) : '' );
        $rel = ltrim( str_replace( '\\', '/', $raw ), '/' );
        $prefix = 'wp-content/uploads/';
        if ( 0 === stripos( $rel, $prefix ) ) {
            $rel = substr( $rel, strlen( $prefix ) );
        }
        wp_send_json_success( array(
            'exists' => '' !== $rel && '' !== $this->resolve_upload_subfolder( $base, $rel ),
        ) );
    }

    /**
     * Lists the direct sub-folders of one uploads folder.
     *
     * @param string $base      Absolute uploads path with trailing slash.
     * @param string $relative  Folder inside uploads with trailing slash ('' for the root).
     * @param bool   $truncated Set to true when the folder has more than the maximum number of sub-folders.
     * @return array
     */
    private function list_upload_children( $base, $relative, &$truncated ) {
        $max_nodes = 1000;
        $recommended = array(
            'cache'           => __( 'General cache output', 'imgsentry' ),
            'backup'          => __( 'Common backup output', 'imgsentry' ),
            'backups'         => __( 'Backup plugin output', 'imgsentry' ),
            'wc-logs'         => __( 'WooCommerce log files', 'imgsentry' ),
            'elementor/css'   => __( 'Compiled page CSS', 'imgsentry' ),
            'wpo-cache'       => __( 'WP-Optimize cache', 'imgsentry' ),
            'wp-rocket-cache' => __( 'WP Rocket cache output', 'imgsentry' ),
            'wpforms'         => __( 'Form submission attachments', 'imgsentry' ),
        );
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
        $entries = @scandir( $base . $relative );
        if ( !is_array( $entries ) ) {
            return array();
        }
        $names = array();
        foreach ( $entries as $name ) {
            if ( '.' === $name[0] ) {
                continue;
                // ".", ".." and hidden folders.
            }
            if ( '' === $relative && 'imgsentry' === strtolower( $name ) ) {
                continue;
                // ImgSentry's own backups/trash are always protected.
            }
            $full = $base . $relative . $name;
            if ( is_link( $full ) || !is_dir( $full ) ) {
                continue;
            }
            $names[] = $name;
        }
        // Natural order; numeric folders (years / months) newest first.
        usort( $names, function ( $a, $b ) {
            if ( ctype_digit( $a ) && ctype_digit( $b ) ) {
                return (int) $b - (int) $a;
            }
            return strnatcasecmp( $a, $b );
        } );
        if ( count( $names ) > $max_nodes ) {
            $truncated = true;
            $names = array_slice( $names, 0, $max_nodes );
        }
        $nodes = array();
        foreach ( $names as $name ) {
            $rel_path = $relative . $name . '/';
            $rel_key = strtolower( rtrim( $rel_path, '/' ) );
            $node = array(
                'name'        => $name,
                'path'        => '/wp-content/uploads/' . $rel_path,
                'rel'         => rtrim( $rel_path, '/' ),
                'hasChildren' => $this->folder_has_subfolder( $base . $rel_path ),
            );
            if ( isset( $recommended[$rel_key] ) ) {
                $node['isRecommended'] = true;
                $node['note'] = $recommended[$rel_key];
            }
            $nodes[] = $node;
        }
        return $nodes;
    }

    /**
     * Whether a folder has at least one visible sub-folder (stops at the first one found).
     * If a folder holds a huge number of files the look-up stops early and says "yes"; opening it then shows the truth.
     *
     * @param string $dir Absolute folder path with trailing slash.
     * @return bool
     */
    private function folder_has_subfolder( $dir ) {
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
        $handle = @opendir( $dir );
        if ( !$handle ) {
            return false;
        }
        $checked = 0;
        $found = false;
        // phpcs:ignore WordPress.CodeAnalysis.AssignmentInCondition.FoundInWhileCondition
        while ( false !== ($entry = readdir( $handle )) ) {
            if ( '.' === $entry[0] ) {
                continue;
            }
            if ( ++$checked > 2000 ) {
                $found = true;
                break;
            }
            $path = $dir . $entry;
            if ( !is_link( $path ) && is_dir( $path ) ) {
                $found = true;
                break;
            }
        }
        closedir( $handle );
        return $found;
    }

}
