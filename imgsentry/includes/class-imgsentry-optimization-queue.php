<?php

/**
 * Background Optimization Queue & Worker Class.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Optimization_Queue {
    /**
     * Table name without prefix.
     */
    const TABLE_NAME = 'imgsentry_optimization_queue';

    /**
     * Transient lock key for concurrency control.
     */
    const LOCK_KEY = 'imgsentry_opt_queue_lock';

    /**
     * Max automatic retries before marking permanently failed.
     */
    const MAX_ATTEMPTS = 3;

    /**
     * Table layout version (option imgsentry_queue_schema_version). 2 = outcome, byte and error columns.
     */
    const SCHEMA_VERSION = 2;

    /**
     * Option holding the current run: started_at, finished_at, skipped_at_enqueue.
     */
    const RUN_META_OPTION = 'imgsentry_queue_run_meta';

    /**
     * Default time budget in seconds per batch tick.
     */
    const DEFAULT_TIME_BUDGET = 20;

    /**
     * Hook constructor.
     */
    public function __construct() {
        add_action( 'imgsentry_process_optimization_queue', array($this, 'process_batch') );
    }

    /**
     * Uploads waiting for the end of the request (attachment ID => attachment ID).
     *
     * @var int[]
     */
    private static $pending_upload_ids = array();

    /**
     * Whether the end-of-request worker is already registered.
     *
     * @var bool
     */
    private static $upload_worker_registered = false;

    /**
     * While true the upload hook does nothing (a restore regenerates metadata too and must not re-optimize).
     *
     * @var bool
     */
    private static $upload_hook_suspended = false;

    /**
     * Switch the upload auto-optimize hook off / on for the code that regenerates metadata on purpose.
     *
     * @param bool $suspend True to ignore uploads, false to listen again.
     * @return void
     */
    public static function suspend_upload_hook( $suspend ) {
        self::$upload_hook_suspended = (bool) $suspend;
    }

    /**
     * End of the upload request: the metadata is saved and the browser already has its answer, so the queue is
     * filled and worked on now. If this cannot finish (host limits, a crash), the queue's own background worker
     * and WP-Cron pick the remaining items up.
     *
     * @return void
     */
    public static function run_upload_queue_after_response() {
        $ids = array_values( self::$pending_upload_ids );
        self::$pending_upload_ids = array();
        if ( empty( $ids ) ) {
            return;
        }
        try {
            ignore_user_abort( true );
            if ( function_exists( 'set_time_limit' ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Some hosts disable it; the queue has its own time budget.
                @set_time_limit( 120 );
            }
            // Let the browser finish the upload first (PHP-FPM / LiteSpeed). Elsewhere the request simply ends afterwards.
            if ( function_exists( 'fastcgi_finish_request' ) ) {
                fastcgi_finish_request();
            } elseif ( function_exists( 'litespeed_finish_request' ) ) {
                litespeed_finish_request();
            }
            if ( !class_exists( 'ImgSentry_Settings' ) ) {
                return;
            }
            $options = ImgSentry_Settings::get_auto_optimize_options();
            $result = self::enqueue( $ids, $options, false );
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                foreach ( $ids as $attachment_id ) {
                    $filename = basename( (string) get_attached_file( $attachment_id ) );
                    ImgSentry_Logger::log( ImgSentry_Logger::LEVEL_INFO, sprintf( 'Upload auto-optimize queued: attachment #%d (%s)', $attachment_id, $filename ), array(
                        'type'      => 'Optimize',
                        'source'    => 'Media Upload Hook',
                        'object_id' => $attachment_id,
                        'details'   => array(
                            'attachment_id' => $attachment_id,
                            'filename'      => $filename,
                            'output_format' => $options['output_format'],
                            'queue_result'  => $result,
                        ),
                    ) );
                }
            }
            if ( !empty( $result['enqueued'] ) ) {
                self::process_batch( 5, self::DEFAULT_TIME_BUDGET, 20 );
            }
        } catch ( Throwable $e ) {
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::log( ImgSentry_Logger::LEVEL_ERROR, 'Upload auto-optimize stopped: ' . $e->getMessage(), array(
                    'type'   => 'Optimize',
                    'source' => 'Media Upload Hook',
                ) );
            }
        }
    }

    /**
     * Get full table name with WordPress DB prefix.
     *
     * @return string
     */
    public static function get_table_name() {
        global $wpdb;
        return $wpdb->prefix . self::TABLE_NAME;
    }

    /**
     * Create or update the custom queue database table schema.
     */
    public static function create_table() {
        global $wpdb;
        $table_name = self::get_table_name();
        $charset_collate = $wpdb->get_charset_collate();
        $sql = "CREATE TABLE {$table_name} (\n\t\t\tid bigint(20) unsigned NOT NULL AUTO_INCREMENT,\n\t\t\tattachment_id bigint(20) unsigned NOT NULL,\n\t\t\toptions longtext NOT NULL,\n\t\t\tstatus varchar(20) NOT NULL DEFAULT 'pending',\n\t\t\tattempts tinyint(3) unsigned NOT NULL DEFAULT 0,\n\t\t\terror_message text NULL,\n\t\t\toutcome varchar(20) NULL,\n\t\t\tbytes_original bigint(20) unsigned NOT NULL DEFAULT 0,\n\t\t\tbytes_saved bigint(20) unsigned NOT NULL DEFAULT 0,\n\t\t\terror_code varchar(64) NULL,\n\t\t\tlast_error text NULL,\n\t\t\tcreated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\t\t\tupdated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n\t\t\tPRIMARY KEY  (id),\n\t\t\tKEY status_idx (status),\n\t\t\tKEY attachment_idx (attachment_id)\n\t\t) {$charset_collate};";
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );
    }

    /**
     * Ensure the optimization queue table exists in the database.
     *
     * Self-heals environments where files were updated without plugin reactivation.
     *
     * @return bool True if table was created, false if already existed.
     */
    public static function ensure_table_exists() {
        global $wpdb;
        $table_name = self::get_table_name();
        $exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table_name ) );
        if ( $exists !== $table_name ) {
            self::create_table();
            update_option( 'imgsentry_queue_schema_version', self::SCHEMA_VERSION, false );
            return true;
        }
        self::upgrade_schema_if_needed();
        return false;
    }

    /**
     * Bring an older table up to the current layout (dbDelta adds the new columns and keeps every row).
     * Safe to call any number of times.
     *
     * @return void
     */
    private static function upgrade_schema_if_needed() {
        if ( (int) get_option( 'imgsentry_queue_schema_version', 1 ) >= self::SCHEMA_VERSION ) {
            return;
        }
        self::create_table();
        update_option( 'imgsentry_queue_schema_version', self::SCHEMA_VERSION, false );
    }

    /**
     * The current run's bookkeeping.
     *
     * @return array{started_at:int|null,finished_at:int|null,skipped_at_enqueue:int}
     */
    private static function get_run_meta() {
        $meta = get_option( self::RUN_META_OPTION, array() );
        $meta = ( is_array( $meta ) ? $meta : array() );
        return array(
            'started_at'         => ( !empty( $meta['started_at'] ) ? (int) $meta['started_at'] : null ),
            'finished_at'        => ( !empty( $meta['finished_at'] ) ? (int) $meta['finished_at'] : null ),
            'skipped_at_enqueue' => ( !empty( $meta['skipped_at_enqueue'] ) ? (int) $meta['skipped_at_enqueue'] : 0 ),
        );
    }

    /**
     * Save the current run's bookkeeping.
     *
     * @param array $meta Run meta.
     * @return void
     */
    private static function save_run_meta( array $meta ) {
        update_option( self::RUN_META_OPTION, $meta, false );
    }

    /**
     * A new run begins: old finished rows are removed and the bookkeeping starts again.
     *
     * @return void
     */
    private static function begin_new_run() {
        global $wpdb;
        $table_name = self::get_table_name();
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
        $wpdb->query( "DELETE FROM {$table_name} WHERE status IN ('done', 'failed', 'cancelled')" );
        self::save_run_meta( array(
            'started_at'         => time(),
            'finished_at'        => null,
            'skipped_at_enqueue' => 0,
        ) );
    }

    /**
     * Record the moment the queue ran empty (once per run).
     *
     * @param int $pending    Pending rows.
     * @param int $processing Processing rows.
     * @param int $total      All rows.
     * @return array Current meta.
     */
    private static function note_run_end( $pending, $processing, $total ) {
        $meta = self::get_run_meta();
        if ( $total > 0 && 0 === $pending && 0 === $processing && null === $meta['finished_at'] ) {
            $meta['finished_at'] = time();
            self::save_run_meta( $meta );
        }
        return $meta;
    }

    /**
     * The newest queue row of each attachment.
     *
     * @param int[] $attachment_ids Attachment IDs.
     * @return array<int,object> Rows keyed by attachment ID.
     */
    public static function get_latest_rows( array $attachment_ids ) {
        global $wpdb;
        $ids = array_values( array_unique( array_filter( array_map( 'intval', $attachment_ids ) ) ) );
        if ( empty( $ids ) ) {
            return array();
        }
        self::ensure_table_exists();
        $table_name = self::get_table_name();
        $placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
        // phpcs:disable WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name is the plugin's own; the placeholders are built from the ID count.
        $rows = $wpdb->get_results( $wpdb->prepare( "SELECT q.* FROM {$table_name} q INNER JOIN ( SELECT MAX(id) AS id FROM {$table_name} WHERE attachment_id IN ({$placeholders}) GROUP BY attachment_id ) latest ON q.id = latest.id", $ids ) );
        // phpcs:enable WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $out = array();
        foreach ( (array) $rows as $row ) {
            $out[(int) $row->attachment_id] = $row;
        }
        return $out;
    }

    /**
     * Enqueue items for background optimization.
     *
     * @param array $attachment_ids Array of attachment IDs.
     * @param array $options        Optimization settings array.
     * @param bool  $immediate      Whether to trigger synchronous processing as fallback for single uploads.
     * @return array Status summary of enqueued items.
     */
    public static function enqueue( array $attachment_ids, array $options = array(), $immediate = false ) {
        global $wpdb;
        self::ensure_table_exists();
        $table_name = self::get_table_name();
        $options_json = wp_json_encode( $options );
        $enqueued = 0;
        $skipped = 0;
        $force = !empty( $options['force'] ) && filter_var( $options['force'], FILTER_VALIDATE_BOOLEAN );
        $attachment_ids = array_map( 'intval', $attachment_ids );
        $attachment_ids = array_filter( $attachment_ids, function ( $id ) {
            return $id > 0;
        } );
        $total_requested = count( $attachment_ids );
        if ( empty( $attachment_ids ) ) {
            return array(
                'enqueued' => 0,
                'skipped'  => 0,
                'total'    => 0,
                'status'   => self::get_status_counts(),
            );
        }
        // A run is the set of rows between "queue was empty" and "queue is empty again".
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
        $has_active_rows = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table_name} WHERE status IN ('pending', 'processing')" ) > 0;
        $run_begun = $has_active_rows;
        // An active run just continues.
        foreach ( $attachment_ids as $att_id ) {
            // Skip already-optimized images unless force is explicitly requested
            if ( !$force && (get_post_meta( $att_id, '_imgsentry_optimized', true ) || class_exists( 'ImgSentry_External_Optimizers' ) && ImgSentry_External_Optimizers::is_optimized( $att_id )) ) {
                $skipped++;
                continue;
            }
            // Check if item is already pending or processing
            $existing = $wpdb->get_row( $wpdb->prepare( 
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                "SELECT id, status FROM {$table_name} WHERE attachment_id = %d AND status IN ('pending', 'processing')",
                $att_id
             ) );
            if ( !$run_begun ) {
                // First image of a new run: forget the finished rows of the previous run. This happens only when something
                // is really queued, so a click that only hits already-optimized images does not wipe the last results.
                self::begin_new_run();
                $run_begun = true;
            }
            if ( $existing ) {
                // Update options and ensure status is pending
                $wpdb->update(
                    $table_name,
                    array(
                        'options'       => $options_json,
                        'status'        => 'pending',
                        'attempts'      => 0,
                        'error_message' => null,
                        'error_code'    => null,
                        'last_error'    => null,
                    ),
                    array(
                        'id' => $existing->id,
                    ),
                    array(
                        '%s',
                        '%s',
                        '%d',
                        '%s',
                        '%s',
                        '%s'
                    ),
                    array('%d')
                );
                $enqueued++;
            } else {
                // Insert new queue record
                $wpdb->insert( $table_name, array(
                    'attachment_id' => $att_id,
                    'options'       => $options_json,
                    'status'        => 'pending',
                    'attempts'      => 0,
                    'error_message' => null,
                    'created_at'    => current_time( 'mysql' ),
                    'updated_at'    => current_time( 'mysql' ),
                ), array(
                    '%d',
                    '%s',
                    '%s',
                    '%d',
                    '%s',
                    '%s',
                    '%s'
                ) );
                $enqueued++;
            }
        }
        // Images skipped at enqueue time belong to the run they were requested in.
        if ( $skipped > 0 && $run_begun ) {
            $meta = self::get_run_meta();
            $meta['skipped_at_enqueue'] = (int) $meta['skipped_at_enqueue'] + $skipped;
            self::save_run_meta( $meta );
        }
        // Kick off the background worker if items were enqueued
        if ( $enqueued > 0 ) {
            self::spawn_worker();
            // Immediate processing fallback (processes single or bulk uploads directly without relying solely on loopback)
            if ( $immediate ) {
                if ( function_exists( 'set_time_limit' ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                    @set_time_limit( 60 );
                }
                self::process_batch( 5, self::DEFAULT_TIME_BUDGET, 20 );
            }
        }
        return array(
            'enqueued' => $enqueued,
            'skipped'  => $skipped,
            'total'    => $total_requested,
            'status'   => self::get_status_counts(),
        );
    }

    /**
     * Concurrency lock: Acquire exclusive run lock.
     *
     * @param int $duration_seconds Lock expiration in seconds.
     * @return bool True if lock acquired, false if already locked.
     */
    public static function acquire_lock( $duration_seconds = 60 ) {
        $lock = get_transient( self::LOCK_KEY );
        if ( !empty( $lock ) ) {
            return false;
        }
        set_transient( self::LOCK_KEY, time(), $duration_seconds );
        return true;
    }

    /**
     * Concurrency lock: Release exclusive lock.
     */
    public static function release_lock() {
        delete_transient( self::LOCK_KEY );
    }

    /**
     * Concurrency lock: Check if lock is active.
     *
     * @return bool
     */
    public static function is_locked() {
        return (bool) get_transient( self::LOCK_KEY );
    }

    /**
     * Process a batch of queue items.
     *
     * @param int $batch_size           Number of items to pick up per tick.
     * @param int $time_budget_seconds  Maximum seconds allowed for this tick.
     * @param int $max_items            Maximum total items to process in this run.
     * @return array Batch run result.
     */
    public static function process_batch( $batch_size = 5, $time_budget_seconds = self::DEFAULT_TIME_BUDGET, $max_items = 20 ) {
        global $wpdb;
        if ( function_exists( 'set_time_limit' ) ) {
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            @set_time_limit( 60 );
        }
        self::ensure_table_exists();
        // 1. Acquire Concurrency Lock with self-healing expiry tied to the time budget
        $lock_duration = intval( $time_budget_seconds ) + 5;
        if ( !self::acquire_lock( $lock_duration ) ) {
            return array(
                'status'  => 'locked',
                'message' => __( 'Another worker is currently processing the queue.', 'imgsentry' ),
            );
        }
        $table_name = self::get_table_name();
        // Self-healing: recover rows stuck in 'processing' for > 5 minutes (pure SQL time math, no PHP timezone offset)
        $wpdb->query( 
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            "UPDATE {$table_name} \n\t\t\t SET status = 'pending', \n\t\t\t     error_message = 'Recovered from abandoned processing' \n\t\t\t WHERE status = 'processing' \n\t\t\t   AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)"
         );
        $start_time = microtime( true );
        $processed = 0;
        $errors = 0;
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
        $initial_pending = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table_name} WHERE status = 'pending'" );
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
            if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                error_log( sprintf(
                    '[ImgSentry Queue] process_batch START: %d items pending, batch_size=%d, budget=%ds, max_items=%d',
                    $initial_pending,
                    $batch_size,
                    $time_budget_seconds,
                    $max_items
                ) );
            }
        }
        if ( class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::log( ImgSentry_Logger::LEVEL_INFO, sprintf(
                'Optimization queue batch started: %d pending items, budget %ds, max %d items.',
                $initial_pending,
                $time_budget_seconds,
                $max_items
            ) );
        }
        // Ensure Optimizer Engine is loaded
        if ( !class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
            require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
        }
        $delay_next = 0;
        try {
            // 2. Process pending items in batches while within safe time budget and under item ceiling
            while ( microtime( true ) - $start_time < $time_budget_seconds - 2 && $processed + $errors < $max_items ) {
                $items = $wpdb->get_results( $wpdb->prepare( 
                    // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                    "SELECT id, attachment_id, options, attempts FROM {$table_name} WHERE status = 'pending' ORDER BY id ASC LIMIT %d",
                    $batch_size
                 ) );
                if ( empty( $items ) ) {
                    break;
                }
                foreach ( $items as $item ) {
                    // Time budget & max item ceiling checks
                    if ( microtime( true ) - $start_time >= $time_budget_seconds - 2 || $processed + $errors >= $max_items ) {
                        break 2;
                    }
                    // Check if queue has been globally cancelled or item was cancelled
                    $current_status = $wpdb->get_var( 
                        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                        $wpdb->prepare( "SELECT status FROM {$table_name} WHERE id = %d", $item->id )
                     );
                    if ( 'cancelled' === $current_status ) {
                        continue;
                    }
                    // Mark item as processing & increment attempts
                    $new_attempts = intval( $item->attempts ) + 1;
                    $wpdb->update(
                        $table_name,
                        array(
                            'status'   => 'processing',
                            'attempts' => $new_attempts,
                        ),
                        array(
                            'id' => $item->id,
                        ),
                        array('%s', '%d'),
                        array('%d')
                    );
                    // Decode per-job options
                    $options = json_decode( $item->options, true );
                    if ( !is_array( $options ) ) {
                        $options = array();
                    }
                    // Execute optimization
                    $result = ImgSentry_Optimizer_Engine::optimize( $item->attachment_id, $options );
                    if ( !empty( $result['success'] ) ) {
                        // Mark done, and keep what was achieved so the screen can show totals.
                        $was_skipped = !empty( $result['skipped'] );
                        $wpdb->update(
                            $table_name,
                            array(
                                'status'         => 'done',
                                'error_message'  => null,
                                'outcome'        => ( $was_skipped ? 'skipped' : 'optimized' ),
                                'bytes_original' => ( $was_skipped ? 0 : max( 0, (int) (( isset( $result['original_size'] ) ? $result['original_size'] : 0 )) ) ),
                                'bytes_saved'    => ( $was_skipped ? 0 : max( 0, (int) (( isset( $result['bytes_saved'] ) ? $result['bytes_saved'] : 0 )) ) ),
                                'error_code'     => null,
                                'last_error'     => null,
                            ),
                            array(
                                'id' => $item->id,
                            ),
                            array(
                                '%s',
                                '%s',
                                '%s',
                                '%d',
                                '%d',
                                '%s',
                                '%s'
                            ),
                            array('%d')
                        );
                        $processed++;
                    } elseif ( !empty( $result['error_code'] ) && in_array( $result['error_code'], array('cloud_retry', 'cloud_busy'), true ) ) {
                        // Server not reachable (or busy) right now: put the item back, wait a little, try again.
                        $wpdb->update(
                            $table_name,
                            array(
                                'status'        => 'pending',
                                'attempts'      => max( 0, $new_attempts - 1 ),
                                'error_message' => ( !empty( $result['error'] ) ? $result['error'] : null ),
                            ),
                            array(
                                'id' => $item->id,
                            ),
                            array('%s', '%d', '%s'),
                            array('%d')
                        );
                        $delay_next = ( 'cloud_busy' === $result['error_code'] ? 30 : 60 );
                        break 2;
                    } elseif ( !empty( $result['error_code'] ) && in_array( $result['error_code'], array(
                        'quota_exceeded',
                        'domain_not_allowed',
                        'account_required',
                        'invalid_license',
                        'license_inactive',
                        'plan_not_allowed',
                        'site_mismatch',
                        'site_limit_reached',
                        'cloud_unreachable',
                        'cloud_fallback_cap'
                    ), true ) ) {
                        // Quota used up (or optimization not allowed on this host): stop the whole run.
                        // The current and all remaining items are cancelled (not "failed") with the reason; nothing is retried.
                        $halt_message = ( !empty( $result['error'] ) ? $result['error'] : 'Optimization stopped: quota reached.' );
                        $wpdb->query( $wpdb->prepare( 
                            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                            "UPDATE {$table_name} SET status = 'cancelled', error_message = %s, error_code = %s WHERE status IN ('pending','processing')",
                            $halt_message,
                            (string) $result['error_code']
                         ) );
                        if ( class_exists( 'ImgSentry_Logger' ) ) {
                            ImgSentry_Logger::warning( 'Optimization queue stopped', array(
                                'type'    => 'Optimize',
                                'source'  => 'Optimization Queue',
                                'details' => $halt_message,
                            ) );
                        }
                        $errors++;
                        break 2;
                    } else {
                        $error_msg = ( !empty( $result['error'] ) ? $result['error'] : 'Unknown error during background optimization' );
                        $clean_msg = $error_msg;
                        // The engine's own message, without retry wording.
                        $error_code = ( !empty( $result['error_code'] ) ? substr( (string) $result['error_code'], 0, 64 ) : null );
                        if ( !empty( $result['error_code'] ) ) {
                            $error_msg .= " ({$result['error_code']})";
                        }
                        // Automatic Retry Check: If attempts < MAX_ATTEMPTS, re-queue as 'pending' for retry
                        if ( $new_attempts < self::MAX_ATTEMPTS ) {
                            $wpdb->update(
                                $table_name,
                                array(
                                    'status'        => 'pending',
                                    'error_message' => sprintf(
                                        'Retry %d/%d: %s',
                                        $new_attempts,
                                        self::MAX_ATTEMPTS - 1,
                                        $error_msg
                                    ),
                                    'error_code'    => $error_code,
                                    'last_error'    => $clean_msg,
                                ),
                                array(
                                    'id' => $item->id,
                                ),
                                array(
                                    '%s',
                                    '%s',
                                    '%s',
                                    '%s'
                                ),
                                array('%d')
                            );
                        } else {
                            // Permanently failed after max retries
                            $wpdb->update(
                                $table_name,
                                array(
                                    'status'        => 'failed',
                                    'error_message' => sprintf( 'Permanently failed after %d attempts: %s', $new_attempts, $error_msg ),
                                    'error_code'    => $error_code,
                                    'last_error'    => $clean_msg,
                                ),
                                array(
                                    'id' => $item->id,
                                ),
                                array(
                                    '%s',
                                    '%s',
                                    '%s',
                                    '%s'
                                ),
                                array('%d')
                            );
                        }
                        $errors++;
                    }
                }
            }
            if ( 0 === $processed && 0 === $errors ) {
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $pending_remaining = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table_name} WHERE status = 'pending'" );
                if ( 0 === $pending_remaining ) {
                    self::release_lock();
                    return array(
                        'status'    => 'idle',
                        'processed' => 0,
                        'counts'    => self::get_status_counts(),
                    );
                }
            }
        } finally {
            // Always release lock
            self::release_lock();
        }
        // 4. Check if more pending items exist; if so, trigger next async worker tick
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
        $pending_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table_name} WHERE status = 'pending'" );
        if ( $pending_count > 0 ) {
            if ( $delay_next > 0 ) {
                // Server unreachable or busy: wait before the next try instead of hammering it.
                if ( !wp_next_scheduled( 'imgsentry_process_optimization_queue' ) ) {
                    wp_schedule_single_event( time() + $delay_next, 'imgsentry_process_optimization_queue' );
                }
            } else {
                self::spawn_worker();
            }
        }
        $elapsed = round( microtime( true ) - $start_time, 2 );
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG && defined( 'WP_DEBUG_LOG' ) && WP_DEBUG_LOG ) {
            if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                error_log( sprintf(
                    '[ImgSentry Queue] process_batch END: %d processed, %d errors, %d remaining in queue (elapsed: %fs)',
                    $processed,
                    $errors,
                    $pending_count,
                    $elapsed
                ) );
            }
        }
        if ( class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::log( ImgSentry_Logger::LEVEL_INFO, sprintf(
                'Optimization queue batch finished: %d processed, %d errors, %d remaining in queue (elapsed: %fs).',
                $processed,
                $errors,
                $pending_count,
                $elapsed
            ) );
        }
        return array(
            'status'    => ( $pending_count > 0 ? 'processing' : 'completed' ),
            'processed' => $processed,
            'errors'    => $errors,
            'remaining' => $pending_count,
            'counts'    => self::get_status_counts(),
        );
    }

    /**
     * Cancel all pending and processing queue tasks.
     *
     * @return int Number of cancelled records.
     */
    public static function cancel_queue() {
        global $wpdb;
        $table_name = self::get_table_name();
        $cancelled = $wpdb->query( 
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            "UPDATE {$table_name} SET status = 'cancelled', error_message = 'Cancelled by user', error_code = NULL WHERE status IN ('pending', 'processing')"
         );
        self::release_lock();
        return (int) $cancelled;
    }

    /**
     * Clear completed (done, failed, cancelled) records from the queue.
     *
     * @param array $statuses Array of statuses to purge.
     * @return int Number of purged rows.
     */
    public static function clear_queue( $statuses = array('done', 'failed', 'cancelled') ) {
        global $wpdb;
        $table_name = self::get_table_name();
        $placeholders = implode( ',', array_fill( 0, count( $statuses ), '%s' ) );
        $purged = $wpdb->query( 
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $wpdb->prepare( "DELETE FROM {$table_name} WHERE status IN ({$placeholders})", $statuses )
         );
        return (int) $purged;
    }

    /**
     * Retrieve breakdown of queue status counts.
     *
     * Besides the counters this returns what the screen needs for a progress card: how many images were really
     * optimized or skipped, the bytes saved, the start / end time of the run, the files being worked on, the
     * failed files with their reasons, and the message of a quota / licence stop.
     *
     * @return array
     */
    public static function get_status_counts() {
        global $wpdb;
        $table_name = self::get_table_name();
        // Check if table exists
        $table_exists = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table_name ) );
        if ( !$table_exists ) {
            return array(
                'total'          => 0,
                'pending'        => 0,
                'processing'     => 0,
                'done'           => 0,
                'failed'         => 0,
                'cancelled'      => 0,
                'percent'        => 100,
                'is_running'     => false,
                'optimized'      => 0,
                'skipped'        => 0,
                'bytes_original' => 0,
                'bytes_saved'    => 0,
                'started_at'     => null,
                'finished_at'    => null,
                'current_files'  => array(),
                'failed_items'   => array(),
                'stop_message'   => null,
                'stop_code'      => null,
            );
        }
        self::upgrade_schema_if_needed();
        // One query for every counter and sum.
        $groups = (array) $wpdb->get_results( 
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            "SELECT status, outcome, COUNT(*) AS cnt, COALESCE(SUM(bytes_original), 0) AS orig, COALESCE(SUM(bytes_saved), 0) AS saved FROM {$table_name} GROUP BY status, outcome"
         );
        $by_status = array(
            'pending'    => 0,
            'processing' => 0,
            'done'       => 0,
            'failed'     => 0,
            'cancelled'  => 0,
        );
        $optimized = 0;
        $skipped_rows = 0;
        $bytes_original = 0;
        $bytes_saved = 0;
        foreach ( $groups as $g ) {
            if ( isset( $by_status[$g->status] ) ) {
                $by_status[$g->status] += (int) $g->cnt;
            }
            if ( 'done' === $g->status && 'optimized' === $g->outcome ) {
                $optimized += (int) $g->cnt;
                $bytes_original += (int) $g->orig;
                $bytes_saved += (int) $g->saved;
            } elseif ( 'done' === $g->status && 'skipped' === $g->outcome ) {
                $skipped_rows += (int) $g->cnt;
            }
        }
        $pending = $by_status['pending'];
        $processing = $by_status['processing'];
        $done = $by_status['done'];
        $failed = $by_status['failed'];
        $cancelled = $by_status['cancelled'];
        $total = $pending + $processing + $done + $failed + $cancelled;
        $completed = $done + $failed + $cancelled;
        $percent = ( $total > 0 ? round( $completed / $total * 100 ) : 100 );
        $is_running = $pending > 0 || $processing > 0 || self::is_locked();
        $meta = self::note_run_end( $pending, $processing, $total );
        // Fetch recent error messages
        $recent_errors = $wpdb->get_results( 
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            "SELECT attachment_id, error_message, updated_at FROM {$table_name} WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 5"
         );
        // Files being worked on right now.
        $current_files = array();
        if ( $processing > 0 ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $current_rows = $wpdb->get_results( "SELECT attachment_id FROM {$table_name} WHERE status = 'processing' ORDER BY id ASC LIMIT 3" );
            foreach ( (array) $current_rows as $row ) {
                $current_files[] = array(
                    'attachment_id' => (int) $row->attachment_id,
                    'filename'      => self::display_name( (int) $row->attachment_id ),
                );
            }
        }
        // Failed files with the reason.
        $failed_items = array();
        if ( $failed > 0 ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $failed_rows = $wpdb->get_results( "SELECT attachment_id, error_code, last_error, error_message, attempts FROM {$table_name} WHERE status = 'failed' ORDER BY updated_at DESC, id DESC LIMIT 50" );
            foreach ( (array) $failed_rows as $row ) {
                $att_id = (int) $row->attachment_id;
                $message = ( null !== $row->last_error && '' !== $row->last_error ? $row->last_error : (string) $row->error_message );
                $failed_items[] = array(
                    'attachment_id' => $att_id,
                    'title'         => (string) get_the_title( $att_id ),
                    'filename'      => self::display_name( $att_id ),
                    'error_code'    => ( null === $row->error_code ? '' : (string) $row->error_code ),
                    'message'       => $message,
                    'attempts'      => (int) $row->attempts,
                );
            }
        }
        // A stop by quota / licence / site rules (not a click on "cancel").
        $stop_message = null;
        $stop_code = null;
        if ( $cancelled > 0 ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $stop_row = $wpdb->get_row( "SELECT error_message, error_code FROM {$table_name} WHERE status = 'cancelled' AND error_message IS NOT NULL AND error_message <> 'Cancelled by user' ORDER BY updated_at DESC, id DESC LIMIT 1" );
            if ( $stop_row ) {
                $stop_message = (string) $stop_row->error_message;
                $stop_code = ( null === $stop_row->error_code || '' === $stop_row->error_code ? null : (string) $stop_row->error_code );
            }
        }
        return array(
            'total'          => $total,
            'pending'        => $pending,
            'processing'     => $processing,
            'done'           => $done,
            'failed'         => $failed,
            'cancelled'      => $cancelled,
            'percent'        => $percent,
            'is_running'     => $is_running,
            'is_locked'      => self::is_locked(),
            'recent_errors'  => $recent_errors,
            'optimized'      => $optimized,
            'skipped'        => $skipped_rows + (int) $meta['skipped_at_enqueue'],
            'bytes_original' => $bytes_original,
            'bytes_saved'    => $bytes_saved,
            'started_at'     => $meta['started_at'],
            'finished_at'    => $meta['finished_at'],
            'current_files'  => $current_files,
            'failed_items'   => $failed_items,
            'stop_message'   => $stop_message,
            'stop_code'      => $stop_code,
        );
    }

    /**
     * File name of an attachment for display, or its title when the file is not known.
     *
     * @param int $attachment_id Attachment ID.
     * @return string
     */
    private static function display_name( $attachment_id ) {
        $file = get_attached_file( $attachment_id );
        if ( !empty( $file ) ) {
            return wp_basename( $file );
        }
        return (string) get_the_title( $attachment_id );
    }

    /**
     * Trigger asynchronous background worker without blocking the user response.
     */
    public static function spawn_worker() {
        // 1. Schedule a single WP-Cron event as safety fallback
        if ( !wp_next_scheduled( 'imgsentry_process_optimization_queue' ) ) {
            wp_schedule_single_event( time(), 'imgsentry_process_optimization_queue' );
        }
        $secret = get_option( 'imgsentry_queue_worker_secret' );
        if ( empty( $secret ) ) {
            $secret = wp_generate_password( 32, false, false );
            add_option(
                'imgsentry_queue_worker_secret',
                $secret,
                '',
                'no'
            );
        }
        // 2. Fire non-blocking asynchronous HTTP POST to admin-ajax.php to start immediate tick
        $ajax_url = admin_url( 'admin-ajax.php' );
        wp_remote_post( $ajax_url, array(
            'timeout'   => 0.01,
            'blocking'  => false,
            'sslverify' => apply_filters( 'https_local_ssl_verify', false ),
            'body'      => array(
                'action' => 'imgsentry_process_queue_tick',
                'secret' => $secret,
            ),
        ) );
    }

}
