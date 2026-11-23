<?php

/**
 * AJAX Scanner Controller Class for ImgSentry.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Ajax_Scanner extends ImgSentry_Ajax_Base {
    /**
     * Constructor. Register Scanner AJAX actions.
     */
    public function __construct() {
        add_action( 'wp_ajax_imgsentry_run_scan', array($this, 'run_scan') );
        add_action( 'wp_ajax_imgsentry_run_deep_scan_batch', array($this, 'run_deep_scan_batch') );
        add_action( 'wp_ajax_imgsentry_rescan_single_item', array($this, 'rescan_single_item') );
        add_action( 'wp_ajax_imgsentry_fetch_media', array($this, 'fetch_media') );
        add_action( 'wp_ajax_imgsentry_fetch_usage_list', array($this, 'get_usage_list') );
        add_action( 'wp_ajax_imgsentry_save_scan_history', array($this, 'save_scan_history') );
        add_action( 'wp_ajax_imgsentry_get_scan_history', array($this, 'get_scan_history') );
        add_action( 'wp_ajax_imgsentry_get_scan_progress', array($this, 'get_scan_progress') );
        add_action( 'wp_ajax_imgsentry_get_dashboard_totals', array($this, 'get_dashboard_totals') );
        add_action( 'wp_ajax_imgsentry_get_system_storage', array($this, 'get_system_storage') );
        add_action( 'wp_ajax_imgsentry_get_distinct_file_types', array($this, 'get_distinct_file_types') );
        add_action( 'wp_ajax_imgsentry_get_distinct_locations', array($this, 'get_distinct_locations') );
        add_action( 'wp_ajax_imgsentry_get_distinct_trash_locations', array($this, 'get_distinct_trash_locations') );
        add_action( 'wp_ajax_imgsentry_get_distinct_dates', array($this, 'get_distinct_dates') );
        // Dashboard Stats Cache Invalidation Hooks
        add_action( 'wp_trash_post', array('ImgSentry_Scanner', 'invalidate_dashboard_cache') );
        add_action( 'untrash_post', array('ImgSentry_Scanner', 'invalidate_dashboard_cache') );
        add_action( 'delete_attachment', array('ImgSentry_Scanner', 'invalidate_dashboard_cache') );
        add_action( 'add_attachment', array('ImgSentry_Scanner', 'invalidate_dashboard_cache') );
        add_action(
            'added_post_meta',
            array('ImgSentry_Scanner', 'on_postmeta_change'),
            10,
            3
        );
        add_action(
            'updated_post_meta',
            array('ImgSentry_Scanner', 'on_postmeta_change'),
            10,
            3
        );
        add_action(
            'deleted_post_meta',
            array('ImgSentry_Scanner', 'on_postmeta_change'),
            10,
            3
        );
        // File Manager Actions (Trash, Restore, Delete Permanent, Empty Trash, Clear Thumb Cache)
        add_action( 'wp_ajax_imgsentry_fm_delete', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_fm_restore_trash', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_fm_delete_trash_permanent', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_fm_empty_trash', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_fm_clear_thumb_cache', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        // ImgSentry Trash & Bulk Actions
        add_action( 'wp_ajax_imgsentry_move_to_trash', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_restore_media', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_delete_permanently', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_bulk_action', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_delete_all', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_empty_trash', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        // Image Optimizer Actions
        add_action( 'wp_ajax_imgsentry_optimize_single', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_optimize_batch', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_restore_backup', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
        add_action( 'wp_ajax_imgsentry_convert_nextgen', array('ImgSentry_Scanner', 'invalidate_dashboard_cache'), 5 );
    }

    /**
     * Start a background scan.
     *
     * POST scan_type: 'smart' (default) or 'full'. POST force=1 resumes a scan that stopped making progress.
     */
    public function run_scan() {
        $this->verify_permission( 'scanner', 'imgsentry_admin_nonce' );
        if ( !ImgSentry_Usage_Indexer::is_usage_tracking_enabled() ) {
            wp_send_json_error( array(
                'message' => __( 'Usage tracking is turned off in Settings. Turn it on to scan your media library.', 'imgsentry' ),
            ) );
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $force = ( !empty( $_POST['force'] ) ? absint( $_POST['force'] ) : 0 );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $scan_type = ( isset( $_POST['scan_type'] ) ? ImgSentry_Usage_Indexer::normalize_scan_type( sanitize_text_field( wp_unslash( $_POST['scan_type'] ) ) ) : 'smart' );
        $started = ImgSentry_Usage_Indexer::start_background_scan( (bool) $force, $scan_type, 'manual' );
        $status = get_option( 'imgsentry_scan_status', array() );
        if ( !is_array( $status ) ) {
            $status = array();
        }
        if ( $started && class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::info( sprintf( '%s started', ImgSentry_Usage_Indexer::get_scan_type_label( $scan_type ) ), array(
                'type'    => 'Scan',
                'source'  => 'Media Scanner',
                'details' => sprintf( 'Checking %s files.', number_format_i18n( ( isset( $status['queued'] ) ? (int) $status['queued'] : 0 ) ) ),
            ) );
        }
        wp_send_json_success( array(
            'message'         => ( $started ? __( 'Scan started.', 'imgsentry' ) : __( 'A scan is already running.', 'imgsentry' ) ),
            'already_running' => !$started,
            'scan_type'       => ( isset( $status['scan_type'] ) ? $status['scan_type'] : $scan_type ),
            'queued'          => ( isset( $status['queued'] ) ? (int) $status['queued'] : 0 ),
            'stats'           => ImgSentry_Usage_Indexer::get_dashboard_stats(),
        ) );
    }

    /**
     * Get Scan Progress Status.
     *
     * While a scan runs, each poll also checks a batch of queued files (so the scan keeps moving even when
     * WP-Cron is slow) and finishes the scan when the queue is empty.
     */
    public function get_scan_progress() {
        $this->verify_permission( array('scanner', 'dashboard'), 'imgsentry_admin_nonce' );
        if ( !ImgSentry_Usage_Indexer::is_usage_tracking_enabled() ) {
            wp_send_json_success( array(
                'status'       => array(),
                'stats'        => array(),
                'is_running'   => false,
                'dirty_count'  => 0,
                'processed'    => 0,
                'total'        => 0,
                'scan_type'    => '',
                'history_head' => '',
            ) );
        }
        $status = get_option( 'imgsentry_scan_status', array() );
        if ( !is_array( $status ) ) {
            $status = array();
        }
        $is_scan_running = isset( $status['state'] ) && 'running' === $status['state'];
        if ( $is_scan_running ) {
            update_option( 'imgsentry_scan_lock_time', time() );
            // Heartbeat: the scan is alive.
            $poll_batch_size = (int) apply_filters( 'imgsentry_poll_scan_batch_size', 100 );
            ImgSentry_Usage_Indexer::get_instance()->process_dirty_queue( $poll_batch_size, false );
            ImgSentry_Usage_Indexer::maybe_finalize_scan();
        } else {
            $idle_counts = ImgSentry_Usage_Indexer::get_scan_progress_counts();
            if ( !empty( $idle_counts['dirty'] ) && $idle_counts['dirty'] > 0 ) {
                ImgSentry_Usage_Indexer::get_instance()->process_dirty_queue( 20 );
            }
        }
        $counts = ImgSentry_Usage_Indexer::get_scan_progress_counts();
        $status = get_option( 'imgsentry_scan_status', array() );
        if ( !is_array( $status ) ) {
            $status = array();
        }
        $is_running = isset( $status['state'] ) && 'running' === $status['state'];
        // Stuck-scan detection: track the remaining queue size across consecutive polls.
        $remaining = (int) $counts['dirty'];
        $last_left = ( isset( $status['last_remaining_count'] ) ? (int) $status['last_remaining_count'] : -1 );
        $stuck_polls = ( isset( $status['stuck_poll_count'] ) ? (int) $status['stuck_poll_count'] : 0 );
        if ( $is_running && $remaining > 0 ) {
            if ( $remaining === $last_left ) {
                $stuck_polls++;
                if ( 5 === $stuck_polls && class_exists( 'ImgSentry_Logger' ) ) {
                    global $wpdb;
                    $table_name = ImgSentry_Usage_Indexer::get_table_name();
                    // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                    $stuck_id = (int) $wpdb->get_var( "SELECT attachment_id FROM {$table_name} WHERE is_dirty = 1 ORDER BY attachment_id ASC LIMIT 1" );
                    ImgSentry_Logger::warning( sprintf( 'Scan progress appears stuck at item %d. Possible corrupted or unresponsive attachment.', $stuck_id ), array(
                        'type'    => 'Scan',
                        'source'  => 'Scanner Engine',
                        'details' => sprintf(
                            'Queue size stayed at %d for %d consecutive polls. Front of queue: Attachment ID %d.',
                            $remaining,
                            $stuck_polls,
                            $stuck_id
                        ),
                    ) );
                }
            } else {
                $stuck_polls = 0;
            }
        } else {
            $stuck_polls = 0;
        }
        if ( (( isset( $status['last_remaining_count'] ) ? (int) $status['last_remaining_count'] : -1 )) !== $remaining || (( isset( $status['stuck_poll_count'] ) ? (int) $status['stuck_poll_count'] : 0 )) !== $stuck_polls ) {
            $status['last_remaining_count'] = $remaining;
            $status['stuck_poll_count'] = $stuck_polls;
            update_option( 'imgsentry_scan_status', $status );
        }
        // Progress of THIS scan (Smart Scan only counts the files it has to check).
        if ( $is_running ) {
            $queued = ( isset( $status['queued'] ) ? (int) $status['queued'] : $remaining );
            $queued = max( $queued, $remaining );
            // New uploads during the scan extend the queue.
            $total = $queued;
            $processed = max( 0, $queued - $remaining );
        } else {
            $total = (int) $counts['total'];
            $processed = (int) $counts['processed'];
        }
        $history = get_option( 'imgsentry_scan_history', array() );
        $history_head = ( is_array( $history ) && !empty( $history[0]['id'] ) ? (string) $history[0]['id'] : '' );
        wp_send_json_success( array(
            'status'       => $status,
            'stats'        => ImgSentry_Usage_Indexer::get_dashboard_stats(),
            'is_running'   => (bool) $is_running,
            'dirty_count'  => (int) $counts['dirty'],
            'processed'    => (int) $processed,
            'total'        => (int) $total,
            'scan_type'    => ( isset( $status['scan_type'] ) ? (string) $status['scan_type'] : '' ),
            'history_head' => $history_head,
        ) );
    }

    /**
     * Run Deep Scan Batch.
     */
    public function run_deep_scan_batch() {
        $this->verify_permission( 'scanner', 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $batch_ids = ( isset( $_POST['batch_ids'] ) && is_array( $_POST['batch_ids'] ) ? array_map( 'intval', $_POST['batch_ids'] ) : array() );
        if ( empty( $batch_ids ) ) {
            wp_send_json_error( array(
                'message' => __( 'No IDs provided for deep scan batch.', 'imgsentry' ),
            ) );
        }
        $updated_items = array();
        foreach ( $batch_ids as $id ) {
            $post = get_post( $id );
            if ( $post && 'attachment' === $post->post_type ) {
                ImgSentry_Usage_Indexer::mark_dirty( $id );
                ImgSentry_Usage_Indexer::update_attachment_usage_record( $id );
                $updated_items[] = ImgSentry_Scanner::format_media_item( $post );
            }
        }
        wp_send_json_success( array(
            'updated_items' => $updated_items,
        ) );
    }

    /**
     * Rescan Single Media Item.
     */
    public function rescan_single_item() {
        $this->verify_permission( array('scanner', 'used_files', 'unused_files'), 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $item_id = ( isset( $_POST['item_id'] ) ? intval( $_POST['item_id'] ) : 0 );
        if ( !$item_id ) {
            wp_send_json_error( array(
                'message' => __( 'Invalid item ID provided.', 'imgsentry' ),
            ) );
        }
        $post = get_post( $item_id );
        if ( !$post || 'attachment' !== $post->post_type ) {
            wp_send_json_error( array(
                'message' => __( 'Attachment not found.', 'imgsentry' ),
            ) );
        }
        ImgSentry_Usage_Indexer::mark_dirty( $item_id );
        ImgSentry_Usage_Indexer::update_attachment_usage_record( $item_id );
        delete_transient( 'imgsentry_dashboard_stats_cache' );
        $formatted = ImgSentry_Scanner::format_media_item( $post );
        wp_send_json_success( array(
            'item'    => $formatted,
            'message' => __( 'Attachment scanned successfully.', 'imgsentry' ),
        ) );
    }

    /**
     * Fetch Paginated Media Items.
     */
    public function fetch_media() {
        check_ajax_referer( 'imgsentry_admin_nonce', 'nonce' );
        $type = ( isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : 'all' );
        $search = ( isset( $_POST['search'] ) ? sanitize_text_field( wp_unslash( $_POST['search'] ) ) : '' );
        $status = ( isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : 'all' );
        $page = ( isset( $_POST['page'] ) ? max( 1, intval( $_POST['page'] ) ) : 1 );
        $per_page = ( isset( $_POST['per_page'] ) ? intval( $_POST['per_page'] ) : 50 );
        // Default safely to 50 if per_page is empty or invalid
        if ( $per_page <= 0 && -1 !== $per_page ) {
            $per_page = 50;
        }
        $date_from = ( isset( $_POST['date_from'] ) ? sanitize_text_field( wp_unslash( $_POST['date_from'] ) ) : '' );
        $date_to = ( isset( $_POST['date_to'] ) ? sanitize_text_field( wp_unslash( $_POST['date_to'] ) ) : '' );
        // Handle date_range / dates parameter (e.g. 'YYYY-MM')
        $date_range = '';
        if ( !empty( $_POST['date_range'] ) ) {
            $date_range = sanitize_text_field( wp_unslash( $_POST['date_range'] ) );
        } elseif ( !empty( $_POST['dates'] ) ) {
            if ( is_array( $_POST['dates'] ) ) {
                $date_range = sanitize_text_field( wp_unslash( $_POST['dates'][0] ) );
            } else {
                $decoded = json_decode( wp_unslash( $_POST['dates'] ), true );
                if ( is_array( $decoded ) && !empty( $decoded[0] ) ) {
                    $date_range = sanitize_text_field( $decoded[0] );
                } else {
                    $date_range = sanitize_text_field( wp_unslash( $_POST['dates'] ) );
                }
            }
        }
        if ( 'all' === $date_range ) {
            $date_range = '';
        }
        // Handle location parameter
        $location = '';
        if ( !empty( $_POST['location_type'] ) ) {
            $location = sanitize_text_field( wp_unslash( $_POST['location_type'] ) );
        } elseif ( !empty( $_POST['location'] ) ) {
            $location = sanitize_text_field( wp_unslash( $_POST['location'] ) );
        } elseif ( !empty( $_POST['locations'] ) ) {
            if ( is_array( $_POST['locations'] ) ) {
                $location = sanitize_text_field( wp_unslash( $_POST['locations'][0] ) );
            } else {
                $decoded = json_decode( wp_unslash( $_POST['locations'] ), true );
                if ( is_array( $decoded ) && !empty( $decoded[0] ) ) {
                    $location = sanitize_text_field( $decoded[0] );
                } else {
                    $location = sanitize_text_field( wp_unslash( $_POST['locations'] ) );
                }
            }
        }
        if ( 'all' === $location ) {
            $location = '';
        }
        // Handle size parameter
        $size = '';
        if ( !empty( $_POST['size_range'] ) ) {
            $size = sanitize_text_field( wp_unslash( $_POST['size_range'] ) );
        } elseif ( !empty( $_POST['size'] ) ) {
            $size = sanitize_text_field( wp_unslash( $_POST['size'] ) );
        } elseif ( !empty( $_POST['sizes'] ) ) {
            if ( is_array( $_POST['sizes'] ) ) {
                $size = sanitize_text_field( wp_unslash( $_POST['sizes'][0] ) );
            } else {
                $decoded = json_decode( wp_unslash( $_POST['sizes'] ), true );
                if ( is_array( $decoded ) && !empty( $decoded[0] ) ) {
                    $size = sanitize_text_field( $decoded[0] );
                } else {
                    $size = sanitize_text_field( wp_unslash( $_POST['sizes'] ) );
                }
            }
        }
        if ( 'all' === $size ) {
            $size = '';
        }
        $lightweight = ( isset( $_POST['lightweight'] ) ? 'false' !== $_POST['lightweight'] && false !== $_POST['lightweight'] && '0' !== $_POST['lightweight'] : true );
        $trash_status = ( isset( $_POST['trash_status'] ) ? sanitize_text_field( wp_unslash( $_POST['trash_status'] ) ) : 'all' );
        // Trashed items are selected by status 'trash'; status 'all' also includes trashed items.
        if ( 'trash' === $status ) {
            $this->require_permission( 'trash_view' );
        } else {
            $this->require_permission( array(
                'scanner',
                'used_files',
                'unused_files',
                'duplicate',
                'optimization',
                'trash_view'
            ) );
            if ( 'all' === $status && !$this->has_permission( 'trash_view' ) ) {
                $status = 'active';
            }
        }
        $result = ImgSentry_Scanner::get_media_items( array(
            'type'         => $type,
            'search'       => $search,
            'status'       => $status,
            'trash_status' => $trash_status,
            'page'         => $page,
            'date_from'    => $date_from,
            'date_to'      => $date_to,
            'date_range'   => $date_range,
            'location'     => $location,
            'size'         => $size,
            'per_page'     => $per_page,
            'lightweight'  => $lightweight,
        ) );
        $stats = ImgSentry_Scanner::get_total_stats();
        wp_send_json_success( array(
            'items' => $result['items'],
            'total' => $result['total'],
            'pages' => $result['pages'],
            'page'  => $result['current_page'],
            'stats' => $stats,
        ) );
    }

    /**
     * Fetch Paginated Usage List (Used / Unused) from canonical index.
     */
    public function get_usage_list() {
        check_ajax_referer( 'imgsentry_admin_nonce', 'nonce' );
        $status = ( isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : 'used' );
        $page = ( isset( $_POST['page'] ) ? max( 1, intval( $_POST['page'] ) ) : 1 );
        $per_page = ( isset( $_POST['per_page'] ) ? intval( $_POST['per_page'] ) : 30 );
        $search = ( isset( $_POST['search'] ) ? sanitize_text_field( wp_unslash( $_POST['search'] ) ) : '' );
        if ( !in_array( $status, array('used', 'unused'), true ) ) {
            $status = 'used';
        }
        $this->require_permission( ( 'used' === $status ? 'used_files' : 'unused_files' ) );
        $file_types = array();
        if ( !empty( $_POST['file_types'] ) ) {
            $decoded = json_decode( wp_unslash( $_POST['file_types'] ), true );
            if ( is_array( $decoded ) ) {
                $file_types = array_map( 'sanitize_text_field', $decoded );
            }
        }
        $locations = array();
        if ( !empty( $_POST['locations'] ) ) {
            $decoded = json_decode( wp_unslash( $_POST['locations'] ), true );
            if ( is_array( $decoded ) ) {
                $locations = array_map( 'sanitize_text_field', $decoded );
            }
        }
        $usage_locations = array();
        if ( !empty( $_POST['usage_locations'] ) ) {
            $decoded = json_decode( wp_unslash( $_POST['usage_locations'] ), true );
            if ( is_array( $decoded ) ) {
                $usage_locations = array_map( 'sanitize_text_field', $decoded );
            }
        }
        $sizes = array();
        if ( !empty( $_POST['sizes'] ) ) {
            $decoded = json_decode( wp_unslash( $_POST['sizes'] ), true );
            if ( is_array( $decoded ) ) {
                $sizes = array_map( 'sanitize_text_field', $decoded );
            }
        }
        $dates = array();
        if ( !empty( $_POST['dates'] ) ) {
            $decoded = json_decode( wp_unslash( $_POST['dates'] ), true );
            if ( is_array( $decoded ) ) {
                $dates = array_map( 'sanitize_text_field', $decoded );
            }
        }
        $result = ImgSentry_Usage_Indexer::get_paginated_usage(
            $status,
            $page,
            $per_page,
            $search,
            $file_types,
            $locations,
            $sizes,
            $dates,
            $usage_locations
        );
        $include_breakdown = ( isset( $_POST['include_breakdown'] ) ? absint( $_POST['include_breakdown'] ) : 0 );
        $category_breakdown = null;
        if ( 1 === $include_breakdown ) {
            $category_breakdown = ImgSentry_Usage_Indexer::get_usage_category_breakdown(
                $status,
                $search,
                $file_types,
                $locations,
                $sizes,
                $dates,
                $usage_locations
            );
        }
        $formatted_items = array();
        if ( !empty( $result['items'] ) ) {
            $post_ids = array();
            foreach ( $result['items'] as $item ) {
                $post_ids[] = (int) $item['attachment_id'];
            }
            $meta_map = ImgSentry_Scanner::get_batch_postmeta( $post_ids );
            foreach ( $result['items'] as $item ) {
                $post = get_post( $item['attachment_id'] );
                if ( !$post || 'attachment' !== $post->post_type ) {
                    continue;
                }
                $usage_obj = (object) array(
                    'status'          => $item['status'],
                    'usage_sources'   => ( is_array( $item['usage_sources'] ) ? wp_json_encode( $item['usage_sources'] ) : $item['usage_sources'] ),
                    'usage_count'     => $item['usage_count'],
                    'last_scanned_at' => $item['last_scanned_at'],
                );
                $item_meta = ( isset( $meta_map[$post->ID] ) ? $meta_map[$post->ID] : null );
                $formatted_items[] = ImgSentry_Scanner::format_media_item(
                    $post,
                    $usage_obj,
                    $item_meta,
                    false
                );
            }
        }
        $response_data = array(
            'items'            => $formatted_items,
            'total'            => (int) $result['total'],
            'page'             => $page,
            'unverified_count' => (int) $result['unverified'],
        );
        if ( null !== $category_breakdown ) {
            $response_data['category_breakdown'] = $category_breakdown;
            $response_data['breakdown_incomplete'] = !empty( $category_breakdown['calculation_incomplete'] );
        }
        wp_send_json_success( $response_data );
    }

    /**
     * Get Scan History (newest first).
     */
    public function get_scan_history() {
        $this->verify_permission( array('scanner', 'dashboard'), 'imgsentry_admin_nonce' );
        $history = get_option( 'imgsentry_scan_history', array() );
        if ( !is_array( $history ) ) {
            $history = array();
        }
        wp_send_json_success( array(
            'history' => array_values( $history ),
        ) );
    }

    /**
     * Save Scan History.
     */
    public function save_scan_history() {
        $this->verify_permission( 'scanner', 'imgsentry_admin_nonce' );
        $raw_history = array();
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        if ( isset( $_POST['scan_history'] ) ) {
            // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
            $decoded = json_decode( wp_unslash( $_POST['scan_history'] ), true );
            if ( is_array( $decoded ) ) {
                $raw_history = $decoded;
            }
        }
        if ( empty( $raw_history ) ) {
            $raw_history = get_option( 'imgsentry_scan_history', array() );
        }
        if ( !is_array( $raw_history ) ) {
            $raw_history = array();
        }
        $cleaned = array();
        foreach ( $raw_history as $entry ) {
            if ( !is_array( $entry ) ) {
                continue;
                // Strip non-array items
            }
            $id = ( !empty( $entry['id'] ) && is_string( $entry['id'] ) ? sanitize_text_field( $entry['id'] ) : 'scan-' . time() . '-' . wp_generate_password( 6, false ) );
            $timestamp = ( !empty( $entry['timestamp'] ) && is_string( $entry['timestamp'] ) ? sanitize_text_field( $entry['timestamp'] ) : current_time( 'mysql' ) );
            $cleaned_entry = array(
                'id'                  => $id,
                'timestamp'           => $timestamp,
                'scanType'            => ( !empty( $entry['scanType'] ) && is_string( $entry['scanType'] ) ? sanitize_text_field( $entry['scanType'] ) : 'Smart Scan' ),
                'totalScanned'        => ( isset( $entry['totalScanned'] ) && is_numeric( $entry['totalScanned'] ) ? (int) $entry['totalScanned'] : 0 ),
                'unusedCount'         => ( isset( $entry['unusedCount'] ) && is_numeric( $entry['unusedCount'] ) ? (int) $entry['unusedCount'] : 0 ),
                'deletedCount'        => ( isset( $entry['deletedCount'] ) && is_numeric( $entry['deletedCount'] ) ? (int) $entry['deletedCount'] : 0 ),
                'unusedSizeBytes'     => ( isset( $entry['unusedSizeBytes'] ) && is_numeric( $entry['unusedSizeBytes'] ) ? (int) $entry['unusedSizeBytes'] : 0 ),
                'formattedUnusedSize' => ( !empty( $entry['formattedUnusedSize'] ) && is_string( $entry['formattedUnusedSize'] ) ? sanitize_text_field( $entry['formattedUnusedSize'] ) : '0 B' ),
                'usedCount'           => ( isset( $entry['usedCount'] ) && is_numeric( $entry['usedCount'] ) ? (int) $entry['usedCount'] : 0 ),
                'usedSizeBytes'       => ( isset( $entry['usedSizeBytes'] ) && is_numeric( $entry['usedSizeBytes'] ) ? (int) $entry['usedSizeBytes'] : 0 ),
                'formattedUsedSize'   => ( !empty( $entry['formattedUsedSize'] ) && is_string( $entry['formattedUsedSize'] ) ? sanitize_text_field( $entry['formattedUsedSize'] ) : '0 B' ),
                'durationSeconds'     => ( isset( $entry['durationSeconds'] ) && is_numeric( $entry['durationSeconds'] ) ? (int) $entry['durationSeconds'] : 0 ),
                'status'              => ( !empty( $entry['status'] ) && is_string( $entry['status'] ) ? sanitize_text_field( $entry['status'] ) : 'completed' ),
                'isManual'            => ( isset( $entry['isManual'] ) ? (bool) $entry['isManual'] : true ),
                'triggered_by'        => ( !empty( $entry['triggered_by'] ) && is_string( $entry['triggered_by'] ) ? sanitize_text_field( $entry['triggered_by'] ) : 'manual' ),
            );
            $cleaned[] = $cleaned_entry;
        }
        // Never let an out-of-date browser tab erase scans that finished on the server in the meantime.
        $stored_history = get_option( 'imgsentry_scan_history', array() );
        if ( is_array( $stored_history ) && !empty( $stored_history ) && !empty( $cleaned ) ) {
            $client_ids = array();
            $client_max = 0;
            foreach ( $cleaned as $c_entry ) {
                $client_ids[] = $c_entry['id'];
                $client_max = max( $client_max, (int) strtotime( $c_entry['timestamp'] ) );
            }
            $preserved = array();
            foreach ( $stored_history as $s_entry ) {
                if ( !is_array( $s_entry ) || empty( $s_entry['id'] ) || in_array( $s_entry['id'], $client_ids, true ) ) {
                    continue;
                }
                if ( (int) strtotime( ( isset( $s_entry['timestamp'] ) ? (string) $s_entry['timestamp'] : '' ) ) > $client_max ) {
                    $preserved[] = $s_entry;
                }
            }
            if ( !empty( $preserved ) ) {
                $cleaned = array_merge( $preserved, $cleaned );
            }
        }
        if ( count( $cleaned ) > 100 ) {
            $cleaned = array_slice( $cleaned, 0, 100 );
        }
        update_option( 'imgsentry_scan_history', $cleaned );
        delete_transient( 'imgsentry_dashboard_stats_cache' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        if ( !empty( $_POST['is_new_scan'] ) && class_exists( 'ImgSentry_Logger' ) && !empty( $cleaned[0] ) ) {
            $latest = $cleaned[0];
            ImgSentry_Logger::success( sprintf( '%s completed', $latest['scanType'] ), array(
                'type'    => 'Scan',
                'source'  => 'Media Scanner',
                'details' => sprintf(
                    'Scanned %s files in %ds. Found %s unused files (%s).',
                    number_format_i18n( $latest['totalScanned'] ),
                    $latest['durationSeconds'],
                    number_format_i18n( $latest['unusedCount'] ),
                    $latest['formattedUnusedSize']
                ),
            ) );
        }
        wp_send_json_success( array(
            'cleaned_count' => count( $cleaned ),
        ) );
    }

    /**
     * Get Lightweight Dashboard Totals and Aggregates.
     *
     * Pure SQL aggregate stats combining usage indexer status counts, scanner totals,
     * mime category breakdowns, and format distributions with zero disk I/O.
     *
     * Cached in WordPress transient 'imgsentry_dashboard_stats_cache' for 5 minutes (300 seconds default,
     * filterable via 'imgsentry_dashboard_cache_ttl'). Supports 'force_refresh=true' bypass.
     */
    public function get_dashboard_totals() {
        $this->verify_permission( array('dashboard', 'duplicate', 'scanner'), 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $force_refresh = !empty( $_POST['force_refresh'] ) && ('true' === $_POST['force_refresh'] || '1' === $_POST['force_refresh'] || true === $_POST['force_refresh']);
        $transient_key = 'imgsentry_dashboard_stats_cache';
        if ( !$force_refresh ) {
            $cached = get_transient( $transient_key );
            if ( is_array( $cached ) && isset( $cached['dashboard_stats'], $cached['total_stats'] ) ) {
                wp_send_json_success( $cached );
                return;
            }
        }
        global $wpdb;
        $dashboard_stats = ImgSentry_Usage_Indexer::get_dashboard_stats( true );
        $total_stats = ImgSentry_Scanner::get_total_stats( true );
        // Fast SQL aggregation for mime categories and file extensions across non-trashed attachments
        $mime_results = $wpdb->get_results( "SELECT \n\t\t\t\tpost_mime_type, \n\t\t\t\tCOUNT(*) as file_count,\n\t\t\t\tguid\n\t\t\t FROM {$wpdb->posts}\n\t\t\t WHERE post_type = 'attachment' AND post_status = 'inherit'\n\t\t\t GROUP BY post_mime_type, guid" );
        // Size breakdown from postmeta and attachment metadata in a single query (avoiding N+1 DB operations)
        $size_results = $wpdb->get_results( "SELECT \n\t\t\t\tp.ID,\n\t\t\t\tp.post_mime_type,\n\t\t\t\tp.guid,\n\t\t\t\tpm_size.meta_value AS filesize_meta,\n\t\t\t\tpm_file.meta_value AS attached_file,\n\t\t\t\tpm_meta.meta_value AS attachment_metadata\n\t\t\t FROM {$wpdb->posts} p\n\t\t\t LEFT JOIN {$wpdb->postmeta} pm_size ON p.ID = pm_size.post_id AND pm_size.meta_key = '_filesize'\n\t\t\t LEFT JOIN {$wpdb->postmeta} pm_file ON p.ID = pm_file.post_id AND pm_file.meta_key = '_wp_attached_file'\n\t\t\t LEFT JOIN {$wpdb->postmeta} pm_meta ON p.ID = pm_meta.post_id AND pm_meta.meta_key = '_wp_attachment_metadata'\n\t\t\t WHERE p.post_type = 'attachment' AND p.post_status = 'inherit'" );
        $category_sizes = array(
            'images'    => 0,
            'video'     => 0,
            'documents' => 0,
            'audio'     => 0,
            'fonts'     => 0,
            'other'     => 0,
        );
        $file_type_counts = array(
            'WEBP'      => 0,
            'AVIF'      => 0,
            'SVG'       => 0,
            'JPG/JPEG'  => 0,
            'PNG'       => 0,
            'Videos'    => 0,
            'Documents' => 0,
            'Archives'  => 0,
            'Others'    => 0,
        );
        $start_time = microtime( true );
        $raw_limit = (int) ini_get( 'max_execution_time' );
        $is_unlimited = 0 === $raw_limit;
        // Apply a 75% max_execution_time budget or 60s for VPS/unlimited (per ImgSentry_FM_Core pattern)
        $time_budget = ( $is_unlimited ? 60.0 : (( $raw_limit > 0 ? $raw_limit : 30 )) * 0.75 );
        $calculation_incomplete = false;
        $upload_dir = wp_upload_dir();
        $basedir = ( isset( $upload_dir['basedir'] ) ? $upload_dir['basedir'] : '' );
        if ( !empty( $size_results ) ) {
            foreach ( $size_results as $row ) {
                // Guard: check execution time against budget
                if ( microtime( true ) - $start_time > $time_budget ) {
                    $calculation_incomplete = true;
                    break;
                }
                $mime = strtolower( (string) $row->post_mime_type );
                $guid = (string) $row->guid;
                $path_ext = pathinfo( wp_parse_url( $guid, PHP_URL_PATH ), PATHINFO_EXTENSION );
                $ext = strtoupper( $path_ext );
                $size = ImgSentry_Scanner::resolve_attachment_filesize(
                    ( isset( $row->filesize_meta ) ? $row->filesize_meta : null ),
                    ( isset( $row->attachment_metadata ) ? $row->attachment_metadata : null ),
                    ( isset( $row->attached_file ) ? $row->attached_file : '' ),
                    $basedir
                );
                // Self-healing write-back: if resolved via disk fallback (Tier 3), write back to _filesize postmeta
                $had_filesize_meta = !empty( $row->filesize_meta ) && intval( $row->filesize_meta ) > 0;
                if ( !$had_filesize_meta && $size > 0 ) {
                    $had_attachment_metadata = false;
                    if ( !empty( $row->attachment_metadata ) ) {
                        $meta = maybe_unserialize( $row->attachment_metadata );
                        if ( is_array( $meta ) ) {
                            if ( !empty( $meta['filesize'] ) && intval( $meta['filesize'] ) > 0 || !empty( $meta['file_size'] ) && intval( $meta['file_size'] ) > 0 ) {
                                $had_attachment_metadata = true;
                            }
                        }
                    }
                    // Only write back when genuinely resolved via disk fallback (Tier 3)
                    if ( !$had_attachment_metadata ) {
                        update_post_meta( (int) $row->ID, '_filesize', (int) $size );
                    }
                }
                // Category classification
                if ( 0 === strpos( $mime, 'image/' ) ) {
                    $category_sizes['images'] += $size;
                } elseif ( 0 === strpos( $mime, 'video/' ) ) {
                    $category_sizes['video'] += $size;
                } elseif ( 0 === strpos( $mime, 'audio/' ) ) {
                    $category_sizes['audio'] += $size;
                } elseif ( in_array( strtolower( $ext ), array(
                    'woff',
                    'woff2',
                    'ttf',
                    'otf',
                    'eot'
                ), true ) || false !== strpos( $mime, 'font' ) ) {
                    $category_sizes['fonts'] += $size;
                } elseif ( in_array( strtolower( $ext ), array(
                    'pdf',
                    'doc',
                    'docx',
                    'xls',
                    'xlsx',
                    'ppt',
                    'pptx',
                    'txt',
                    'csv'
                ), true ) || false !== strpos( $mime, 'pdf' ) || false !== strpos( $mime, 'document' ) ) {
                    $category_sizes['documents'] += $size;
                } else {
                    $category_sizes['other'] += $size;
                }
                // Extension / file type classification
                if ( 'WEBP' === $ext ) {
                    $file_type_counts['WEBP']++;
                } elseif ( 'AVIF' === $ext ) {
                    $file_type_counts['AVIF']++;
                } elseif ( 'SVG' === $ext ) {
                    $file_type_counts['SVG']++;
                } elseif ( in_array( $ext, array('JPG', 'JPEG'), true ) ) {
                    $file_type_counts['JPG/JPEG']++;
                } elseif ( 'PNG' === $ext ) {
                    $file_type_counts['PNG']++;
                } elseif ( in_array( $ext, array(
                    'MP4',
                    'WEBM',
                    'MOV',
                    'AVI',
                    'MKV'
                ), true ) || 0 === strpos( $mime, 'video/' ) ) {
                    $file_type_counts['Videos']++;
                } elseif ( in_array( $ext, array(
                    'PDF',
                    'DOC',
                    'DOCX',
                    'XLS',
                    'XLSX',
                    'PPT',
                    'PPTX',
                    'TXT',
                    'CSV'
                ), true ) ) {
                    $file_type_counts['Documents']++;
                } elseif ( in_array( $ext, array(
                    'ZIP',
                    'TAR',
                    'GZ',
                    'RAR',
                    '7Z'
                ), true ) ) {
                    $file_type_counts['Archives']++;
                } else {
                    $file_type_counts['Others']++;
                }
            }
        }
        // Optimization aggregate bytes saved
        $opt_stats = $wpdb->get_row( "SELECT \n\t\t\t\tCOUNT(*) as optimized_count,\n\t\t\t\tSUM(CAST(meta_value AS UNSIGNED)) as total_bytes_saved\n\t\t\t FROM {$wpdb->postmeta}\n\t\t\t WHERE meta_key = '_imgsentry_bytes_saved'" );
        $total_bytes_saved = ( $opt_stats && $opt_stats->total_bytes_saved ? (int) $opt_stats->total_bytes_saved : 0 );
        $optimized_count = ( $opt_stats && $opt_stats->optimized_count ? (int) $opt_stats->optimized_count : 0 );
        $system_storage = self::get_system_storage_breakdown();
        // Top 5 largest non-trashed attachments for dashboard widget
        $top_largest_rows = $wpdb->get_results( "SELECT p.ID\n\t\t\t FROM {$wpdb->posts} p\n\t\t\t LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_filesize'\n\t\t\t WHERE p.post_type = 'attachment' AND p.post_status = 'inherit'\n\t\t\t ORDER BY CAST(pm.meta_value AS UNSIGNED) DESC, p.ID DESC\n\t\t\t LIMIT 5" );
        $top_largest_files = array();
        if ( !empty( $top_largest_rows ) ) {
            $t_post_ids = array();
            foreach ( $top_largest_rows as $t_row ) {
                $t_post_ids[] = (int) $t_row->ID;
            }
            $t_meta_map = ImgSentry_Scanner::get_batch_postmeta( $t_post_ids );
            foreach ( $top_largest_rows as $t_row ) {
                $t_post = get_post( $t_row->ID );
                if ( $t_post ) {
                    $t_meta = ( isset( $t_meta_map[$t_post->ID] ) ? $t_meta_map[$t_post->ID] : null );
                    $top_largest_files[] = ImgSentry_Scanner::format_media_item(
                        $t_post,
                        null,
                        $t_meta,
                        true
                    );
                }
            }
        }
        $payload = array(
            'dashboard_stats'        => $dashboard_stats,
            'total_stats'            => $total_stats,
            'category_sizes'         => $category_sizes,
            'calculation_incomplete' => (bool) $calculation_incomplete,
            'file_type_counts'       => $file_type_counts,
            'top_largest_files'      => $top_largest_files,
            'optimization'           => array(
                'optimized_count'   => $optimized_count,
                'total_bytes_saved' => $total_bytes_saved,
            ),
            'system_storage'         => $system_storage,
        );
        $ttl = (int) apply_filters( 'imgsentry_dashboard_cache_ttl', 300 );
        if ( $ttl <= 0 ) {
            $ttl = 300;
        }
        set_transient( $transient_key, $payload, $ttl );
        wp_send_json_success( $payload );
    }

    /**
     * AJAX endpoint to retrieve real media system storage breakdown.
     */
    public function get_system_storage() {
        $this->verify_permission( array('dashboard', 'trash_view', 'optimization'), 'imgsentry_admin_nonce' );
        $system_storage = self::get_system_storage_breakdown();
        wp_send_json_success( array(
            'system_storage' => $system_storage,
        ) );
    }

    /**
     * Get Distinct File Types for Used/Unused tab filter dropdowns.
     */
    public function get_distinct_file_types() {
        $this->verify_permission( array(
            'used_files',
            'unused_files',
            'scanner',
            'optimization'
        ), 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $status = ( isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : 'unused' );
        $result = ImgSentry_Usage_Indexer::get_distinct_file_types( $status );
        $options = ( isset( $result['options'] ) ? $result['options'] : array() );
        $incomplete = !empty( $result['calculation_incomplete'] );
        wp_send_json_success( array(
            'options'                => $options,
            'calculation_incomplete' => $incomplete,
        ) );
    }

    /**
     * Get Distinct Locations (upload subfolder paths) for Used/Unused tab filter dropdowns.
     */
    public function get_distinct_locations() {
        $this->verify_permission( array('used_files', 'unused_files', 'trash_view'), 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $status = ( isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : 'unused' );
        if ( 'trash' === $status ) {
            $result = ImgSentry_Scanner::get_distinct_trash_locations();
        } else {
            $result = ImgSentry_Usage_Indexer::get_distinct_locations( $status );
        }
        $options = ( isset( $result['options'] ) ? $result['options'] : array() );
        $incomplete = !empty( $result['calculation_incomplete'] );
        wp_send_json_success( array(
            'options'                => $options,
            'calculation_incomplete' => $incomplete,
        ) );
    }

    /**
     * Get Distinct Locations (upload subfolder paths) for Trashed items.
     */
    public function get_distinct_trash_locations() {
        $this->verify_permission( 'trash_view', 'imgsentry_admin_nonce' );
        $result = ImgSentry_Scanner::get_distinct_trash_locations();
        $options = ( isset( $result['options'] ) ? $result['options'] : array() );
        $incomplete = !empty( $result['calculation_incomplete'] );
        wp_send_json_success( array(
            'options'                => $options,
            'calculation_incomplete' => $incomplete,
        ) );
    }

    /**
     * Get Distinct Month/Year Upload Dates for Used/Unused tab filter dropdowns.
     */
    public function get_distinct_dates() {
        $this->verify_permission( array('used_files', 'unused_files', 'trash_view'), 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_request / verify_admin_request / verify_permission).
        $status = ( isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : 'unused' );
        $result = ImgSentry_Usage_Indexer::get_distinct_dates( $status );
        $options = ( isset( $result['options'] ) ? $result['options'] : array() );
        $incomplete = !empty( $result['calculation_incomplete'] );
        wp_send_json_success( array(
            'options'                => $options,
            'calculation_incomplete' => $incomplete,
        ) );
    }

    /**
     * Calculate real system / hidden storage breakdown from tracked paths and database records.
     * Delegates to ImgSentry_Scanner::get_system_storage_breakdown().
     *
     * @return array Real calculated byte totals.
     */
    public static function get_system_storage_breakdown() {
        if ( class_exists( 'ImgSentry_Scanner' ) ) {
            return ImgSentry_Scanner::get_system_storage_breakdown();
        }
        return array(
            'active_library_bytes'       => 0,
            'active_primary_bytes'       => 0,
            'active_thumbnails_bytes'    => 0,
            'trash_quarantine_bytes'     => 0,
            'trash_media_bytes'          => 0,
            'trash_fm_bytes'             => 0,
            'optimization_backups_bytes' => 0,
            'nextgen_siblings_bytes'     => 0,
            'calculation_incomplete'     => false,
        );
    }

}
