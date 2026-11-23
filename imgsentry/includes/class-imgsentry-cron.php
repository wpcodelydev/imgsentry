<?php

/**
 * Cron and Scheduled Purge Manager Class.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Cron {
    const CRON_HOOK = 'imgsentry_daily_trash_purge';

    const BATCH_PURGE_HOOK = 'imgsentry_execute_purge_batch';

    const TEMP_CLEANUP_HOOK = 'imgsentry_cleanup_temp_files';

    const SNAPSHOT_CRON_HOOK = 'imgsentry_daily_snapshot_event';

    const BATCH_SIZE = 50;

    const DISABLED_HOOKS_OPTION = 'imgsentry_disabled_cron_hooks';

    /**
     * Constructor. Register cron hooks.
     */
    public function __construct() {
        add_action( self::CRON_HOOK, array($this, 'imgsentry_cron_trash_purge_callback') );
        add_action( self::BATCH_PURGE_HOOK, array($this, 'imgsentry_execute_purge_batch_callback') );
        // Register settings listener
        add_action(
            'update_option_' . IMGSENTRY_OPTION_KEY,
            array($this, 'on_settings_updated'),
            10,
            2
        );
        // Hook cron callbacks
        add_action( 'imgsentry_auto_purge_trash', array($this, 'execute_auto_purge_trash') );
        add_action( self::TEMP_CLEANUP_HOOK, array($this, 'execute_cleanup_temp_files') );
        // Custom cron schedules filter (ensures 'weekly' interval is registered)
        add_filter( 'cron_schedules', array($this, 'register_cron_intervals') );
        if ( did_action( 'init' ) ) {
            $this->register_cron_events();
        } else {
            add_action( 'init', array($this, 'register_cron_events'), 20 );
        }
    }

    /**
     * Recurring WP-Cron hooks that the plugin registers itself and that the
     * Scheduled Actions page is allowed to disable / re-enable.
     *
     * 'imgsentry_scheduled_scan' is NOT listed here: it is driven by the
     * "enableScheduledScan" setting (single source of truth).
     *
     * @return array hook => array( 'recurrence' => string, 'offset' => int seconds until first run ).
     */
    public static function get_managed_hooks() {
        $hooks = array(
            self::CRON_HOOK         => array(
                'recurrence' => 'daily',
                'offset'     => 0,
            ),
            self::TEMP_CLEANUP_HOOK => array(
                'recurrence' => 'daily',
                'offset'     => 0,
            ),
        );
        return $hooks;
    }

    /**
     * Hooks the admin has explicitly disabled from the Scheduled Actions page.
     *
     * @return string[]
     */
    public static function get_disabled_hooks() {
        $list = get_option( self::DISABLED_HOOKS_OPTION, array() );
        if ( !is_array( $list ) ) {
            return array();
        }
        return array_values( array_filter( array_map( 'strval', $list ) ) );
    }

    /**
     * Whether a managed hook was explicitly disabled by the admin.
     *
     * @param string $hook Hook name.
     * @return bool
     */
    public static function is_hook_disabled( $hook ) {
        return in_array( (string) $hook, self::get_disabled_hooks(), true );
    }

    /**
     * Persist the disabled / enabled state of a managed hook.
     *
     * @param string $hook     Hook name.
     * @param bool   $disabled True to disable, false to re-enable.
     */
    public static function set_hook_disabled( $hook, $disabled ) {
        $hook = (string) $hook;
        $list = self::get_disabled_hooks();
        $has = in_array( $hook, $list, true );
        if ( $disabled && !$has ) {
            $list[] = $hook;
        } elseif ( !$disabled && $has ) {
            $list = array_values( array_diff( $list, array($hook) ) );
        } else {
            return;
        }
        update_option( self::DISABLED_HOOKS_OPTION, array_values( $list ), false );
    }

    /**
     * Schedule a managed recurring hook if it is not scheduled yet.
     *
     * @param string $hook Hook name.
     * @return bool True when the hook is scheduled after this call.
     */
    public static function schedule_managed_hook( $hook ) {
        $managed = self::get_managed_hooks();
        if ( !isset( $managed[$hook] ) ) {
            return false;
        }
        if ( wp_next_scheduled( $hook ) ) {
            return true;
        }
        return false !== wp_schedule_event( time() + (int) $managed[$hook]['offset'], $managed[$hook]['recurrence'], $hook );
    }

    /**
     * Register custom cron intervals (e.g. 'weekly').
     *
     * @param array $schedules Existing schedules.
     * @return array Modified schedules.
     */
    public function register_cron_intervals( $schedules = array() ) {
        if ( !isset( $schedules['weekly'] ) ) {
            $schedules['weekly'] = array(
                'interval' => 7 * DAY_IN_SECONDS,
                'display'  => ( did_action( 'init' ) ? esc_html__( 'Once Weekly', 'imgsentry' ) : 'Once Weekly' ),
            );
        }
        return $schedules;
    }

    /**
     * Register recurring cron events on init.
     *
     * Hooks the admin disabled from Settings > Scheduled Actions are skipped so
     * that a cancel really persists across requests.
     */
    public function register_cron_events() {
        foreach ( self::get_managed_hooks() as $hook => $cfg ) {
            if ( self::is_hook_disabled( $hook ) ) {
                continue;
            }
            if ( !wp_next_scheduled( $hook ) ) {
                wp_schedule_event( time() + (int) $cfg['offset'], $cfg['recurrence'], $hook );
            }
        }
        // Retired feature: remove the weekly summary digest event that earlier versions scheduled (it never sent anything).
        if ( wp_next_scheduled( 'imgsentry_send_summary_digest' ) ) {
            wp_clear_scheduled_hook( 'imgsentry_send_summary_digest' );
        }
        // Retired feature: remove the hourly "large unused media" event that older versions scheduled.
        if ( wp_next_scheduled( 'imgsentry_hourly_unused_alert_check' ) ) {
            wp_clear_scheduled_hook( 'imgsentry_hourly_unused_alert_check' );
        }
        // Ensure legacy time-based backup purge cron is unscheduled
        if ( wp_next_scheduled( 'imgsentry_purge_old_backups' ) ) {
            wp_clear_scheduled_hook( 'imgsentry_purge_old_backups' );
        }
        // Legacy duplicate trash-purge event (older activation routine scheduled a second,
        // parallel hook for the same job). The unified hook is self::CRON_HOOK.
        if ( wp_next_scheduled( 'imgsentry_auto_purge_trash' ) ) {
            wp_clear_scheduled_hook( 'imgsentry_auto_purge_trash' );
        }
    }

    /**
     * Dynamic schedule sync listener when imgsentry_settings changes.
     */
    public function on_settings_updated( $old_value, $new_value ) {
        // Free build: Scheduled Scan does not exist here, so an event left behind by an earlier Premium version is removed.
        wp_clear_scheduled_hook( 'imgsentry_scheduled_scan' );
    }

    /**
     * Cron Callback: Auto Purge Trash
     */
    public function execute_auto_purge_trash() {
        self::imgsentry_execute_purge_batch();
    }

    /**
     * Initialize secure backup storage directory with access protection.
     */
    public static function init_backup_storage() {
        if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
            ImgSentry_Storage_Paths::init_storage();
            return ImgSentry_Storage_Paths::get_backups_dir();
        }
        if ( class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
            ImgSentry_Optimizer_Engine::init_backup_storage();
            return ImgSentry_Optimizer_Engine::get_backup_base_dir();
        }
        $settings = get_option( IMGSENTRY_OPTION_KEY, array() );
        $backup_rel = ( !empty( $settings['backupDirectory'] ) ? $settings['backupDirectory'] : 'wp-content/uploads/imgsentry/backups/' );
        if ( class_exists( 'ImgSentry_Settings' ) ) {
            $backup_rel = ImgSentry_Settings::sanitize_backup_directory( $backup_rel, 'wp-content/uploads/imgsentry/backups/' );
        }
        $backup_dir = wp_normalize_path( ABSPATH . ltrim( $backup_rel, '/' ) );
        $upload_dir = wp_upload_dir();
        $parent_dir = wp_normalize_path( trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/' );
        if ( !file_exists( $parent_dir ) ) {
            wp_mkdir_p( $parent_dir );
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call can fail on locked-down hosts; the result is checked. Direct filesystem call on plugin-owned folders; WP_Filesystem is not available in cron.
        @chmod( $parent_dir, 0755 );
        if ( !file_exists( $backup_dir ) ) {
            wp_mkdir_p( $backup_dir );
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call can fail on locked-down hosts; the result is checked. Direct filesystem call on plugin-owned folders; WP_Filesystem is not available in cron.
        @chmod( $backup_dir, 0755 );
        $htaccess_content = "# Apache 2.2\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n\n# Apache 2.4+\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n";
        $index_content = "<?php\n// Silence is golden.\n";
        foreach ( array($parent_dir, $backup_dir) as $dir ) {
            $ht = trailingslashit( $dir ) . '.htaccess';
            if ( !file_exists( $ht ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call can fail on locked-down hosts; the result is checked. Direct filesystem call on plugin-owned folders; WP_Filesystem is not available in cron.
                @file_put_contents( $ht, $htaccess_content );
            }
            $idx = trailingslashit( $dir ) . 'index.php';
            if ( !file_exists( $idx ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call can fail on locked-down hosts; the result is checked. Direct filesystem call on plugin-owned folders; WP_Filesystem is not available in cron.
                @file_put_contents( $idx, $index_content );
            }
        }
        return $backup_dir;
    }

    /**
     * Check if the plugin cleanup/cron engine is fully enabled.
     *
     * @return bool
     */
    public static function is_plugin_enabled() {
        $settings = get_option( 'imgsentry_settings', array() );
        if ( class_exists( 'ImgSentry_Settings' ) ) {
            $defaults = ImgSentry_Settings::instance()->get_defaults();
            $settings = wp_parse_args( $settings, $defaults );
        }
        return !empty( $settings['enablePlugin'] );
    }

    /**
     * Prune old undo backup options older than 30 days.
     */
    public static function purge_expired_undo_backups() {
        $log = get_option( 'imgsentry_undo_operations_log', array() );
        if ( empty( $log ) || !is_array( $log ) ) {
            return;
        }
        $cutoff = time() - 30 * DAY_IN_SECONDS;
        $modified = false;
        foreach ( $log as $op_id => $timestamp ) {
            if ( (int) $timestamp <= $cutoff ) {
                delete_option( $op_id );
                unset($log[$op_id]);
                $modified = true;
            }
        }
        if ( $modified ) {
            update_option( 'imgsentry_undo_operations_log', $log, false );
        }
    }

    /**
     * Daily cron runner callback.
     */
    public function imgsentry_cron_trash_purge_callback() {
        if ( !self::is_plugin_enabled() ) {
            return;
        }
        self::imgsentry_execute_purge_batch();
        // Purge File Manager trash folder items exceeding retention days (if enabled)
        if ( class_exists( 'ImgSentry_FM_Core' ) && method_exists( 'ImgSentry_FM_Core', 'purge_expired_trash' ) ) {
            $settings = get_option( IMGSENTRY_OPTION_KEY, array() );
            if ( !empty( $settings['fmAutoPurgeTrashEnabled'] ) ) {
                $fm_retention_days = ( isset( $settings['fmTrashRetentionDays'] ) ? absint( $settings['fmTrashRetentionDays'] ) : 7 );
                ImgSentry_FM_Core::purge_expired_trash( $fm_retention_days );
            }
        }
        // Prune logs older than configured retention period (default 30 days)
        if ( class_exists( 'ImgSentry_Logger' ) ) {
            $settings = get_option( IMGSENTRY_OPTION_KEY, array() );
            $retention_days = ( isset( $settings['logRetentionDays'] ) ? absint( $settings['logRetentionDays'] ) : 30 );
            $pruned = ImgSentry_Logger::prune_logs( $retention_days );
            if ( $pruned > 0 ) {
                ImgSentry_Logger::info( sprintf( 'Cron auto-pruned %d expired log records older than %d days', $pruned, $retention_days ), array(
                    'type'       => 'System',
                    'source'     => 'System',
                    'user_login' => 'system_cron',
                ) );
            }
        }
        // Auto-delete expired optimization backups
        if ( class_exists( 'ImgSentry_Optimizer_Engine' ) && method_exists( 'ImgSentry_Optimizer_Engine', 'purge_expired_optimization_backups' ) ) {
            $settings = get_option( IMGSENTRY_OPTION_KEY, array() );
            $retention_days = ( isset( $settings['backupRetentionDays'] ) ? absint( $settings['backupRetentionDays'] ) : 0 );
            ImgSentry_Optimizer_Engine::purge_expired_optimization_backups( $retention_days );
        }
        // Automated clean stale backup references with 7-day grace period
        if ( class_exists( 'ImgSentry_Optimizer_Engine' ) && method_exists( 'ImgSentry_Optimizer_Engine', 'clean_stale_backups' ) ) {
            $res = ImgSentry_Optimizer_Engine::clean_stale_backups();
            update_option( 'imgsentry_last_stale_backup_cleanup', time() );
            update_option( 'imgsentry_last_stale_backup_cleanup_cleared', ( isset( $res['cleared_stale'] ) ? intval( $res['cleared_stale'] ) : 0 ) );
        }
        // Safe 7-day auto-clear for completed/canceled actions in 'imgsentry_fm_jobs' group (Approach B)
        if ( class_exists( 'ActionScheduler' ) && method_exists( 'ActionScheduler', 'store' ) ) {
            try {
                $store = ActionScheduler::store();
                if ( is_object( $store ) && method_exists( $store, 'query_actions' ) && method_exists( $store, 'delete_action' ) ) {
                    $cutoff = ( function_exists( 'as_get_datetime_object' ) ? as_get_datetime_object( '7 days ago' ) : new DateTime('7 days ago', new DateTimeZone('UTC')) );
                    $statuses = array('complete', 'canceled');
                    foreach ( $statuses as $status ) {
                        $action_ids = $store->query_actions( array(
                            'group'        => 'imgsentry_fm_jobs',
                            'status'       => $status,
                            'date'         => $cutoff,
                            'date_compare' => '<',
                            'per_page'     => 500,
                        ) );
                        if ( is_array( $action_ids ) && !empty( $action_ids ) ) {
                            foreach ( $action_ids as $action_id ) {
                                $store->delete_action( $action_id );
                            }
                        }
                    }
                }
            } catch ( Exception $e ) {
                // Suppress exceptions during background cleanup
            }
        }
    }

    /**
     * Chained batch runner callback.
     */
    public function imgsentry_execute_purge_batch_callback() {
        if ( !self::is_plugin_enabled() ) {
            return;
        }
        self::imgsentry_execute_purge_batch();
    }

    /**
     * Execute purge batch for expired items in trash.
     *
     * @return int Number of purged items.
     */
    public static function imgsentry_execute_purge_batch() {
        if ( !self::is_plugin_enabled() ) {
            return 0;
        }
        global $wpdb;
        $settings = get_option( IMGSENTRY_OPTION_KEY, array() );
        if ( class_exists( 'ImgSentry_Settings' ) ) {
            $defaults = ImgSentry_Settings::instance()->get_defaults();
            $settings = wp_parse_args( $settings, $defaults );
        }
        if ( empty( $settings['autoPurgeTrashEnabled'] ) ) {
            return 0;
        }
        // Free plan: scheduled auto-delete of Trash is a Pro feature, forced OFF (cron reads the raw option).
        if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'trash_auto_purge' ) ) {
            return 0;
        }
        // Premium build only: Freemius removes this block (and the method below) from the free zip.
        $purged = 0;
        return $purged;
    }

    public static function delete_directory_recursively( $dir ) {
        if ( !file_exists( $dir ) ) {
            return true;
        }
        // Never follow symlinks: remove only the link itself, not the folder it points to.
        if ( is_link( $dir ) ) {
            wp_delete_file( $dir );
            if ( !is_link( $dir ) ) {
                return true;
            }
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
            return @rmdir( $dir );
        }
        if ( !is_dir( $dir ) ) {
            wp_delete_file( $dir );
            return !file_exists( $dir );
        }
        $items = array_diff( scandir( $dir ), array('.', '..') );
        foreach ( $items as $item ) {
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if ( is_dir( $path ) && !is_link( $path ) ) {
                self::delete_directory_recursively( $path );
            } else {
                wp_delete_file( $path );
            }
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on locked-down hosts; the result is checked. Direct filesystem call on plugin-owned folders; WP_Filesystem is not available in cron.
        return @rmdir( $dir );
    }

    /**
     * Callback for the daily imgsentry_cleanup_temp_files cron event.
     *
     * Sweeps temporary scratchpad folders (temp/optimizer/, temp/downloads/, temp/chunks/,
     * plus legacy temp directories) for orphaned temporary files older than 24 hours.
     * Only deletes files (never directories), preserving the folder structure.
     * Logs results only if files were actually cleaned up (zero noise on normal daily runs).
     *
     * @param int $max_age_seconds Maximum age in seconds before a temp file is considered orphaned (default 86400 / 24 hours).
     * @return array Cleanup statistics: array( 'deleted_files' => int, 'freed_bytes' => int, 'scanned_dirs' => int ).
     */
    public static function execute_cleanup_temp_files( $max_age_seconds = DAY_IN_SECONDS ) {
        $max_age_seconds = ( (int) $max_age_seconds > 0 ? (int) $max_age_seconds : DAY_IN_SECONDS );
        $cutoff_time = time() - $max_age_seconds;
        // Gather all target temp directories to scan using centralized path resolver
        $target_dirs = array();
        if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
            $subdirs = ImgSentry_Storage_Paths::get_temp_subdirs();
            foreach ( $subdirs as $dir ) {
                $target_dirs[] = $dir;
            }
            // Also include base temp directory
            $target_dirs[] = ImgSentry_Storage_Paths::get_temp_dir();
            // Also include legacy temp directories for backward-compatibility
            $legacy = ImgSentry_Storage_Paths::get_legacy_temp_dirs();
            foreach ( $legacy as $dir ) {
                $target_dirs[] = $dir;
            }
        } else {
            // Fallback if helper not available
            $upload_dir = wp_upload_dir();
            $basedir = trailingslashit( $upload_dir['basedir'] );
            $target_dirs = array(
                $basedir . 'imgsentry/temp/optimizer/',
                $basedir . 'imgsentry/temp/downloads/',
                $basedir . 'imgsentry/temp/chunks/',
                $basedir . 'imgsentry/temp/',
                $basedir . 'imgsentry-temp/',
                $basedir . 'imgsentry-fm-temp/',
                $basedir . 'imgsentry-fm-uploads/'
            );
        }
        $target_dirs = array_unique( array_filter( $target_dirs ) );
        $thumb_cache_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_cache_dir( 'thumbs' ) : '' );
        $thumb_retention = (int) apply_filters( 'imgsentry_thumb_cache_retention', 30 * DAY_IN_SECONDS );
        $thumb_cutoff = time() - $thumb_retention;
        // Load thumbnail index if available to check for deleted source files
        $thumb_index = ( class_exists( 'ImgSentry_FM_Core' ) && method_exists( 'ImgSentry_FM_Core', 'get_thumb_index' ) ? ImgSentry_FM_Core::get_thumb_index() : array() );
        $thumb_index_changed = false;
        $deleted_count = 0;
        $freed_bytes = 0;
        $scanned_dirs = 0;
        $deleted_files_log = array();
        foreach ( $target_dirs as $dir ) {
            if ( !is_dir( $dir ) ) {
                continue;
            }
            $scanned_dirs++;
            $is_thumb_cache = !empty( $thumb_cache_dir ) && wp_normalize_path( $dir ) === wp_normalize_path( $thumb_cache_dir );
            $dir_cutoff = ( $is_thumb_cache ? $thumb_cutoff : $cutoff_time );
            // Scan directory items
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on locked-down hosts; the result is checked.
            $items = @scandir( $dir );
            if ( !is_array( $items ) ) {
                continue;
            }
            foreach ( $items as $item ) {
                // Skip special dot entries, security protection files, and index file
                if ( '.' === $item || '..' === $item || '.htaccess' === $item || 'index.php' === $item || '.thumb_index.json' === $item ) {
                    continue;
                }
                $file_path = trailingslashit( $dir ) . $item;
                // SAFETY CHECK: NEVER delete directories to keep folder structure intact
                if ( is_dir( $file_path ) ) {
                    continue;
                }
                // Verify it is a regular file
                if ( !is_file( $file_path ) ) {
                    continue;
                }
                // Check file last modification time
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on locked-down hosts; the result is checked.
                $mtime = @filemtime( $file_path );
                if ( false === $mtime ) {
                    continue;
                }
                // For thumbnail cache, also detect if source file was already deleted
                $source_is_gone = false;
                $matched_hash = null;
                if ( $is_thumb_cache && !empty( $thumb_index ) ) {
                    foreach ( $thumb_index as $h => $entry ) {
                        if ( ($entry['thumb'] ?? '') === $item ) {
                            $matched_hash = $h;
                            if ( !empty( $entry['path'] ) && !file_exists( $entry['path'] ) ) {
                                $source_is_gone = true;
                            }
                            break;
                        }
                    }
                }
                // 45-day hardcoded safety-net TTL check for thumbnail cache
                $is_older_than_45_days = $is_thumb_cache && time() - $mtime > 45 * DAY_IN_SECONDS;
                // Delete if source file is gone OR if file is older than 45 days (safety net) OR if file is older than cutoff
                if ( !$source_is_gone && !$is_older_than_45_days && $mtime > $dir_cutoff ) {
                    // File is newer than all thresholds, leave it intact
                    continue;
                }
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on locked-down hosts; the result is checked.
                $file_size = (int) @filesize( $file_path );
                // Attempt deletion
                wp_delete_file( $file_path );
                if ( !file_exists( $file_path ) ) {
                    $deleted_count++;
                    $freed_bytes += $file_size;
                    if ( $is_thumb_cache && null !== $matched_hash ) {
                        unset($thumb_index[$matched_hash]);
                        $thumb_index_changed = true;
                    }
                    if ( count( $deleted_files_log ) < 20 ) {
                        $deleted_files_log[] = basename( $file_path ) . ' (' . size_format( $file_size, 2 ) . ')';
                    }
                }
            }
        }
        if ( $thumb_index_changed && class_exists( 'ImgSentry_FM_Core' ) && method_exists( 'ImgSentry_FM_Core', 'save_thumb_index' ) ) {
            ImgSentry_FM_Core::save_thumb_index( $thumb_index );
        }
        // Only log if one or more orphaned files were actually cleaned up (prevents noise on normal daily runs)
        if ( $deleted_count > 0 ) {
            $details = sprintf(
                'Daily Temp Cleanup: Purged %d orphaned scratchpad file(s) across %d directories freeing %s total (Cutoff: >%s old). Cleaned files: %s',
                $deleted_count,
                $scanned_dirs,
                size_format( $freed_bytes, 2 ),
                human_time_diff( time() - $max_age_seconds, time() ),
                implode( ', ', $deleted_files_log ) . (( $deleted_count > 20 ? '...' : '' ))
            );
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::info( sprintf( 'Purged %d orphaned temporary files (%s freed)', $deleted_count, size_format( $freed_bytes, 2 ) ), array(
                    'type'    => 'Delete',
                    'source'  => 'Temp Cleanup Cron',
                    'details' => $details,
                ) );
            } else {
                if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                    // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                    error_log( '[ImgSentry] ' . $details );
                }
            }
        }
        return array(
            'deleted_files' => $deleted_count,
            'freed_bytes'   => $freed_bytes,
            'scanned_dirs'  => $scanned_dirs,
        );
    }

}
