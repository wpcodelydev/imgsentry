<?php

/**
 * Plugin Name:       ImgSentry - Image Optimizer & Media Cleaner
 * Description:       Compress image size and convert images to WebP/AVIF. And use the Media Cleaner to remove unused and duplicate files that waste disk space.
 * Version:           1.0.0
 * Author:            WPCodely
 * Author URI:        https://wpcodely.com/
 * License:           GPL-3.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain:       imgsentry
 * Requires at least: 5.8
 * Requires PHP:      7.4
 *
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
if ( function_exists( 'imgsentry_fs' ) ) {
    // The other version (Free or Premium) of ImgSentry is already loaded, for example while the Premium zip
    // is being activated over the Free version. Tell the SDK about this file and stop here, so nothing
    // (constants, classes, hooks) is declared twice. The Freemius deploy sets the first argument to false in the Free zip.
    imgsentry_fs()->set_basename( false, __FILE__ );
    return;
}
if ( !function_exists( 'imgsentry_fs' ) ) {
    // Create a helper function for easy SDK access.
    function imgsentry_fs() {
        global $imgsentry_fs;
        if ( !isset( $imgsentry_fs ) ) {
            // Include Freemius SDK.
            require_once dirname( __FILE__ ) . '/vendor/freemius/start.php';
            $imgsentry_fs = fs_dynamic_init( array(
                'id'               => '42060',
                'slug'             => 'imgsentry',
                'type'             => 'plugin',
                'public_key'       => 'pk_7cc06741047ae19f7145419e74629',
                'is_premium'       => false,
                'has_addons'       => false,
                'has_paid_plans'   => true,
                'is_org_compliant' => true,
                'menu'             => array(
                    'slug'    => 'imgsentry',
                    'contact' => false,
                    'support' => false,
                ),
                'is_live'          => true,
            ) );
        }
        return $imgsentry_fs;
    }

    // Init Freemius.
    imgsentry_fs();
    // Signal that SDK was initiated.
    do_action( 'imgsentry_fs_loaded' );
}
// Define Plugin Constants.
define( 'IMGSENTRY_VERSION', '1.0.0' );
define( 'IMGSENTRY_PLUGIN_FILE', __FILE__ );
define( 'IMGSENTRY_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'IMGSENTRY_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'IMGSENTRY_PLUGIN_DIR_URL', plugin_dir_url( __FILE__ ) );
define( 'IMGSENTRY_OPTION_KEY', 'imgsentry_settings' );
define( 'IMGSENTRY_CRON_HOOK', 'imgsentry_daily_trash_purge' );
// Same hook ImgSentry_Cron::CRON_HOOK registers (the old 'imgsentry_auto_purge_trash' duplicate was removed).
define( 'IMGSENTRY_TEMP_CLEANUP_CRON_HOOK', 'imgsentry_cleanup_temp_files' );
define( 'IMGSENTRY_DAILY_SNAPSHOT_CRON_HOOK', 'imgsentry_daily_snapshot_event' );
/**
 * Require Action Scheduler library early (before plugins_loaded).
 */
if ( file_exists( IMGSENTRY_PLUGIN_DIR . 'lib/action-scheduler/action-scheduler.php' ) ) {
    require_once IMGSENTRY_PLUGIN_DIR . 'lib/action-scheduler/action-scheduler.php';
}
/**
 * Require core plugin classes.
 */
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-storage-paths.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-settings.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-permissions.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-license.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-quota.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-cloud-client.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-scanner.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-image-hasher.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-duplicate-finder.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-stats.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-queue.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-usage-indexer.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-integrations.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-logger.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-base.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-scanner.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-trash.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-settings.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-export.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-duplicates.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-logs.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-permissions.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-optimizer.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-scheduled-actions.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/ajax/class-imgsentry-ajax-notifications.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-external-optimizers.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-media-library-column.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-cron.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-nextgen-delivery.php';
require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-htaccess.php';
require_once IMGSENTRY_PLUGIN_DIR . 'admin/class-imgsentry-admin-page.php';
require_once IMGSENTRY_PLUGIN_DIR . 'admin/pages/class-imgsentry-page-used-files.php';
/**
 * Main Plugin Bootstrap Class.
 */
final class ImgSentry_Plugin {
    /**
     * Single instance of the class.
     *
     * @var ImgSentry_Plugin|null
     */
    private static $instance = null;

    /**
     * Main Instance Gateway.
     *
     * @return ImgSentry_Plugin
     */
    public static function get_instance() {
        if ( is_null( self::$instance ) ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor.
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Register plugin hooks.
     */
    private function init_hooks() {
        // Initialize ImgSentry_Settings singleton
        ImgSentry_Settings::instance();
        ImgSentry_Permissions::init();
        if ( is_admin() || defined( 'DOING_AJAX' ) && DOING_AJAX ) {
            new ImgSentry_Admin_Page();
            new ImgSentry_Ajax_Scanner();
            new ImgSentry_Ajax_Settings();
            new ImgSentry_Ajax_Export();
            new ImgSentry_Ajax_Duplicates();
            new ImgSentry_Ajax_Logs();
            new ImgSentry_Ajax_Permissions();
            new ImgSentry_Ajax_Optimizer();
            new ImgSentry_Ajax_Scheduled_Actions();
            new ImgSentry_Ajax_Notifications();
            new ImgSentry_Media_Library_Column();
        }
        // Initialize Trash AJAX & Global Deletion Interceptors in all contexts (Admin, AJAX, REST, WP-CLI)
        new ImgSentry_Ajax_Trash();
        ImgSentry_Duplicate_Finder::register_hooks();
        // Initialize Background Queue, Cron & Next-Gen Delivery Handlers.
        new ImgSentry_Optimization_Queue();
        if ( class_exists( 'ImgSentry_FM_Background_Jobs' ) ) {
            ImgSentry_FM_Background_Jobs::init();
        }
        new ImgSentry_Cron();
        // Next-Gen delivery (<picture> tags) is part of every plan.
        ImgSentry_NextGen_Delivery::get_instance();
    }

    /**
     * Plugin Activation Handler.
     */
    public static function activate() {
        // Seed the FULL default settings array using ImgSentry_Settings::instance()->get_defaults()
        if ( false === get_option( IMGSENTRY_OPTION_KEY ) && class_exists( 'ImgSentry_Settings' ) ) {
            $defaults = ImgSentry_Settings::instance()->get_defaults();
            add_option(
                IMGSENTRY_OPTION_KEY,
                $defaults,
                '',
                'no'
            );
        }
        // Create optimization queue table
        if ( class_exists( 'ImgSentry_Optimization_Queue' ) ) {
            ImgSentry_Optimization_Queue::create_table();
        }
        // Create File Manager background jobs table
        if ( class_exists( 'ImgSentry_FM_Background_Jobs' ) ) {
            ImgSentry_FM_Background_Jobs::create_table();
        }
        // Create File Manager ACL rules table
        if ( class_exists( 'ImgSentry_FM_ACL' ) ) {
            ImgSentry_FM_ACL::create_table();
        }
        // Create File Manager Operation Restrictions table
        if ( class_exists( 'ImgSentry_FM_Operation_Restrictions' ) ) {
            ImgSentry_FM_Operation_Restrictions::create_table();
        }
        // Create database-backed logs table
        if ( class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::create_table();
        }
        // Create usage indexer custom table and launch initial background scan
        if ( class_exists( 'ImgSentry_Usage_Indexer' ) ) {
            ImgSentry_Usage_Indexer::create_table();
            ImgSentry_Usage_Indexer::start_background_scan();
        }
        // Initialize dedicated backup storage and unified storage structure (.htaccess, index.php)
        if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
            ImgSentry_Storage_Paths::init_storage();
        }
        if ( class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
            ImgSentry_Optimizer_Engine::init_backup_storage();
        }
        // Set default options if not already set.
        if ( false === get_option( 'imgsentry_queue_worker_secret' ) ) {
            add_option(
                'imgsentry_queue_worker_secret',
                wp_generate_password( 32, false, false ),
                '',
                'no'
            );
        }
        if ( false === get_option( 'imgsentry_trash_days' ) ) {
            add_option( 'imgsentry_trash_days', 7 );
        }
        // Schedule the daily maintenance events (auto-purge trash, temp cleanup, library snapshot).
        // A task the admin explicitly disabled from Settings > Scheduled Actions stays disabled.
        $imgsentry_daily_hooks = array(IMGSENTRY_CRON_HOOK, IMGSENTRY_TEMP_CLEANUP_CRON_HOOK);
        foreach ( $imgsentry_daily_hooks as $imgsentry_daily_hook ) {
            if ( class_exists( 'ImgSentry_Cron' ) && ImgSentry_Cron::is_hook_disabled( $imgsentry_daily_hook ) ) {
                continue;
            }
            if ( !wp_next_scheduled( $imgsentry_daily_hook ) ) {
                wp_schedule_event( time(), 'daily', $imgsentry_daily_hook );
            }
        }
        // Remove the legacy duplicate trash-purge event created by older versions.
        wp_clear_scheduled_hook( 'imgsentry_auto_purge_trash' );
        // One-time cleanup routine: purge legacy orphaned trash-created backups from backups/
        if ( !get_option( 'imgsentry_trash_backups_purged_v1' ) ) {
            if ( class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
                ImgSentry_Optimizer_Engine::purge_orphaned_trash_backups( true );
            }
            update_option( 'imgsentry_trash_backups_purged_v1', 1 );
        }
    }

    /**
     * Plugin Deactivation Handler.
     */
    public static function deactivate() {
        // Take the ImgSentry rewrite rules out of .htaccess (only the block that belongs to this plugin).
        ImgSentry_Htaccess::disable();
        // Clear every recurring / chained cron event this plugin registers so nothing is left behind.
        $imgsentry_cron_hooks = array(
            IMGSENTRY_CRON_HOOK,
            'imgsentry_daily_trash_purge',
            'imgsentry_auto_purge_trash',
            'imgsentry_execute_purge_batch',
            IMGSENTRY_TEMP_CLEANUP_CRON_HOOK,
            IMGSENTRY_DAILY_SNAPSHOT_CRON_HOOK,
            'imgsentry_scheduled_scan',
            'imgsentry_process_optimization_queue',
            'imgsentry_send_summary_digest',
            'imgsentry_hourly_unused_alert_check',
            'imgsentry_fm_watchdog_cron',
            'imgsentry_fm_cleanup_orphaned_uploads',
            'imgsentry_weekly_reconcile_orphans',
            'imgsentry_reconcile_orphans_batch',
            'imgsentry_process_dirty_queue_event',
            'imgsentry_process_background_batch'
        );
        foreach ( array_unique( $imgsentry_cron_hooks ) as $imgsentry_cron_hook ) {
            wp_clear_scheduled_hook( $imgsentry_cron_hook );
        }
    }

}

// Register Activation and Deactivation Hooks at file level.
register_activation_hook( __FILE__, array('ImgSentry_Plugin', 'activate') );
register_deactivation_hook( __FILE__, array('ImgSentry_Plugin', 'deactivate') );
/**
 * Instantiate ImgSentry.
 */
function imgsentry_init() {
    return ImgSentry_Plugin::get_instance();
}

// Fire up the plugin.
add_action( 'plugins_loaded', 'imgsentry_init' );
/**
 * Free build only matters: show a notice when the site has a valid license but is still running the
 * free code (Premium version not installed yet). The premium build never shows it.
 */
function imgsentry_premium_install_notice() {
    if ( !function_exists( 'imgsentry_fs' ) || !current_user_can( 'manage_options' ) ) {
        return;
    }
    $fs = imgsentry_fs();
    if ( $fs->is_premium() || !$fs->can_use_premium_code() ) {
        return;
    }
    $account_url = ( method_exists( $fs, 'get_account_url' ) ? $fs->get_account_url() : '' );
    echo '<div class="notice notice-info"><p><strong>' . esc_html__( 'ImgSentry:', 'imgsentry' ) . '</strong> ';
    echo esc_html__( 'Your license is active, but the Premium version is not installed yet. Install it from the ImgSentry Account page, or upload the Premium zip from your purchase email (Plugins > Add New > Upload Plugin).', 'imgsentry' );
    if ( is_string( $account_url ) && '' !== $account_url ) {
        echo ' <a href="' . esc_url( $account_url ) . '">' . esc_html__( 'Open Account page', 'imgsentry' ) . '</a>';
    }
    echo '</p></div>';
}

add_action( 'admin_notices', 'imgsentry_premium_install_notice' );
/**
 * Add Settings link to the plugin action links on the Plugins list page.
 *
 * @param array $links Array of existing action links.
 * @return array Modified array of action links with Settings prepended.
 */
function imgsentry_add_plugin_action_links(  $links  ) {
    $settings_link = sprintf( '<a href="%s">%s</a>', esc_url( admin_url( 'admin.php?page=imgsentry-settings' ) ), __( 'Settings', 'imgsentry' ) );
    array_unshift( $links, $settings_link );
    return $links;
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'imgsentry_add_plugin_action_links' );
/**
 * Freemius uninstall cleanup handler.
 *
 * Runs automatically when the plugin is uninstalled via Freemius after_uninstall hook.
 */
function imgsentry_fs_uninstall_cleanup() {
    global $wpdb;
    // Take the ImgSentry rewrite rules out of .htaccess (only the block that belongs to this plugin).
    ImgSentry_Htaccess::disable();
    $settings = get_option( 'imgsentry_settings', array() );
    // 1. Unschedule all WP-Cron hooks (every recurring and chained event the plugin registers).
    $imgsentry_cron_hooks = array(
        'imgsentry_scheduled_scan',
        'imgsentry_auto_purge_trash',
        'imgsentry_purge_old_backups',
        'imgsentry_send_summary_digest',
        'imgsentry_hourly_unused_alert_check',
        'imgsentry_daily_trash_purge',
        'imgsentry_execute_purge_batch',
        'imgsentry_cleanup_temp_files',
        'imgsentry_daily_snapshot_event',
        'imgsentry_process_optimization_queue',
        'imgsentry_fm_watchdog_cron',
        'imgsentry_fm_cleanup_orphaned_uploads',
        'imgsentry_weekly_reconcile_orphans',
        'imgsentry_reconcile_orphans_batch',
        'imgsentry_process_dirty_queue_event',
        'imgsentry_process_background_batch',
        'imgsentry_hash_single_attachment',
        'imgsentry_fm_delete_temp_file',
        'imgsentry_auto_trash_continue',
        'imgsentry_fm_build_manifest',
        'imgsentry_fm_process_chunk',
        'imgsentry_fm_send_activity_digest'
    );
    foreach ( $imgsentry_cron_hooks as $imgsentry_cron_hook ) {
        if ( function_exists( 'wp_unschedule_hook' ) ) {
            wp_unschedule_hook( $imgsentry_cron_hook );
            // Removes events regardless of their arguments.
        } else {
            wp_clear_scheduled_hook( $imgsentry_cron_hook );
        }
    }
    // 2. Remove all options, postmeta, and storage folders if "deleteDataOnUninstall" is enabled.
    if ( !empty( $settings['deleteDataOnUninstall'] ) ) {
        // Delete Plugin Options and Transients
        delete_option( 'imgsentry_settings' );
        delete_option( 'imgsentry_trash_days' );
        delete_option( 'imgsentry_scan_history' );
        delete_option( 'imgsentry_audit_log' );
        delete_option( 'imgsentry_purge_errors' );
        delete_option( 'imgsentry_unused_alert_active' );
        delete_option( 'imgsentry_fm_notify_queue' );
        delete_option( 'imgsentry_bell_events' );
        delete_option( 'imgsentry_last_trash_purge' );
        delete_option( 'imgsentry_fm_notify_retries' );
        delete_metadata(
            'user',
            0,
            'imgsentry_bell_read',
            '',
            true
        );
        delete_option( 'imgsentry_fm_acl_db_version' );
        delete_option( 'imgsentry_fm_operation_restrictions_db_version' );
        delete_option( 'imgsentry_fm_code_editor_settings' );
        delete_option( 'imgsentry_fm_settings' );
        delete_option( 'imgsentry_fm_audit_log' );
        delete_option( 'imgsentry_fm_root_scope' );
        delete_option( 'imgsentry_fm_media_sync_enabled' );
        delete_option( 'imgsentry_daily_snapshots' );
        delete_option( 'imgsentry_last_stale_backup_cleanup' );
        delete_option( 'imgsentry_last_stale_backup_cleanup_cleared' );
        delete_option( 'imgsentry_nextgen_meta_backfilled_v2' );
        delete_option( 'imgsentry_queue_worker_secret' );
        delete_option( 'imgsentry_scan_in_progress' );
        delete_option( 'imgsentry_scan_lock_time' );
        delete_option( 'imgsentry_scan_lock' );
        delete_option( 'imgsentry_disabled_cron_hooks' );
        delete_option( 'imgsentry_scan_status' );
        delete_option( 'imgsentry_trash_backups_purged_v1' );
        delete_option( 'imgsentry_undo_operations_log' );
        delete_option( 'imgsentry_usage_schema_version' );
        delete_option( 'imgsentry_v1_false_positive_cleanup_run' );
        delete_option( 'imgsentry_permissions' );
        delete_option( 'imgsentry_quota_usage' );
        delete_option( 'imgsentry_account_started_at' );
        delete_option( 'imgsentry_cloud_down_since' );
        delete_option( 'imgsentry_cloud_fallback_day' );
        delete_option( 'imgsentry_cloud_notice' );
        delete_option( 'imgsentry_cloud_pending_consume' );
        delete_option( 'imgsentry_cloud_quota' );
        delete_option( 'imgsentry_replace_lock' );
        delete_option( 'imgsentry_usage_table_db_version' );
        // Every remaining option that starts with "imgsentry_" (undo-operation options, scan finalize guards and any option added in a later version) and every ImgSentry transient with its timeout row.
        $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s OR option_name LIKE %s",
            $wpdb->esc_like( 'imgsentry_' ) . '%',
            $wpdb->esc_like( '_transient_imgsentry_' ) . '%',
            $wpdb->esc_like( '_transient_timeout_imgsentry_' ) . '%'
        ) );
        delete_transient( 'imgsentry_scan_lock' );
        delete_transient( 'imgsentry_last_unused_alert_check' );
        // Drop custom database tables
        $tables_to_drop = array(
            "{$wpdb->prefix}imgsentry_logs",
            "{$wpdb->prefix}imgsentry_attachment_usage",
            "{$wpdb->prefix}imgsentry_usage_index",
            "{$wpdb->prefix}imgsentry_optimization_queue",
            "{$wpdb->prefix}imgsentry_fm_jobs",
            "{$wpdb->prefix}imgsentry_fm_acl_rules",
            "{$wpdb->prefix}imgsentry_fm_operation_restrictions"
        );
        foreach ( $tables_to_drop as $table_name ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $wpdb->query( "DROP TABLE IF EXISTS {$table_name}" );
        }
        // Remove only ImgSentry's own Action Scheduler jobs (group 'imgsentry_fm_jobs').
        // The Action Scheduler tables themselves are shared with other plugins and are never dropped.
        $imgsentry_as_groups = $wpdb->prefix . 'actionscheduler_groups';
        $imgsentry_as_actions = $wpdb->prefix . 'actionscheduler_actions';
        $imgsentry_as_logs = $wpdb->prefix . 'actionscheduler_logs';
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $imgsentry_as_groups ) ) === $imgsentry_as_groups && $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $imgsentry_as_actions ) ) === $imgsentry_as_actions ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
            $imgsentry_as_group_id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT group_id FROM {$imgsentry_as_groups} WHERE slug = %s", 'imgsentry_fm_jobs' ) );
            if ( $imgsentry_as_group_id > 0 ) {
                if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $imgsentry_as_logs ) ) === $imgsentry_as_logs ) {
                    // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                    $wpdb->query( $wpdb->prepare( "DELETE l FROM {$imgsentry_as_logs} l INNER JOIN {$imgsentry_as_actions} a ON l.action_id = a.action_id WHERE a.group_id = %d", $imgsentry_as_group_id ) );
                }
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $wpdb->query( $wpdb->prepare( "DELETE FROM {$imgsentry_as_actions} WHERE group_id = %d", $imgsentry_as_group_id ) );
                $wpdb->delete( $imgsentry_as_groups, array(
                    'group_id' => $imgsentry_as_group_id,
                ), array('%d') );
            }
        }
        // Remove every ImgSentry post meta key (they all start with "_imgsentry_"), including keys added in later versions.
        $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE %s", $wpdb->esc_like( '_imgsentry_' ) . '%' ) );
        // Helper for recursive folder removal
        $imgsentry_delete_dir_recursive = function ( $dir ) use(&$imgsentry_delete_dir_recursive) {
            if ( is_link( $dir ) ) {
                wp_delete_file( $dir );
                return;
            }
            if ( !file_exists( $dir ) || !is_dir( $dir ) ) {
                return;
            }
            $items = array_diff( scandir( $dir ), array('.', '..') );
            foreach ( $items as $item ) {
                $path = $dir . DIRECTORY_SEPARATOR . $item;
                if ( is_link( $path ) ) {
                    wp_delete_file( $path );
                } elseif ( is_dir( $path ) ) {
                    $imgsentry_delete_dir_recursive( $path );
                } else {
                    wp_delete_file( $path );
                }
            }
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- Removes an empty plugin-owned folder; the call may fail on some hosts and WP_Filesystem is not available during uninstall.
            @rmdir( $dir );
        };
        // Remove parent ImgsentryBackups directory (wp-content/uploads/ImgsentryBackups/)
        $upload_dir = wp_upload_dir();
        $normalized_basedir = wp_normalize_path( $upload_dir['basedir'] );
        $imgsentry_backups = wp_normalize_path( trailingslashit( $upload_dir['basedir'] ) . 'ImgsentryBackups' );
        $imgsentry_delete_dir_recursive( $imgsentry_backups );
        // Remove consolidated ImgSentry directory (wp-content/uploads/imgsentry/)
        $imgsentry_dir = wp_normalize_path( trailingslashit( $upload_dir['basedir'] ) . 'imgsentry' );
        if ( 0 === strpos( $imgsentry_dir, $normalized_basedir ) ) {
            $imgsentry_delete_dir_recursive( $imgsentry_dir );
        }
        // Remove temporary processing directories
        $imgsentry_temp_dirs = array('imgsentry-temp', 'imgsentry-fm-temp', 'imgsentry-fm-uploads');
        foreach ( $imgsentry_temp_dirs as $temp_dir_name ) {
            $temp_dir = wp_normalize_path( trailingslashit( $upload_dir['basedir'] ) . $temp_dir_name );
            if ( 0 === strpos( $temp_dir, $normalized_basedir ) ) {
                $imgsentry_delete_dir_recursive( $temp_dir );
            }
        }
        // Also remove configured custom backup directory only if strictly inside uploads (prevents accidental deletion of WordPress core, plugins, or themes).
        if ( !empty( $settings['backupDirectory'] ) && is_string( $settings['backupDirectory'] ) ) {
            $raw_backup = $settings['backupDirectory'];
            $normalized_raw = str_replace( '\\', '/', $raw_backup );
            // Reject path traversal ('..' segments) or NUL bytes
            $has_nul_byte = false !== strpos( $raw_backup, "\x00" );
            $segments = explode( '/', $normalized_raw );
            $has_traversal = in_array( '..', $segments, true );
            if ( !$has_nul_byte && !$has_traversal ) {
                $candidate_path = wp_normalize_path( ABSPATH . ltrim( $raw_backup, '/' ) );
                $real_basedir = realpath( $upload_dir['basedir'] );
                if ( false !== $real_basedir ) {
                    $norm_basedir = wp_normalize_path( $real_basedir );
                    $norm_basedir_slash = trailingslashit( $norm_basedir );
                    // If candidate is a symlink located inside uploads, remove the symlink itself without following it
                    if ( is_link( $candidate_path ) ) {
                        $parent_real = realpath( dirname( $candidate_path ) );
                        if ( false !== $parent_real ) {
                            $norm_parent = wp_normalize_path( $parent_real );
                            if ( $norm_parent === $norm_basedir || 0 === strpos( $norm_parent, $norm_basedir_slash ) ) {
                                wp_delete_file( $candidate_path );
                            }
                        }
                    } else {
                        $real_candidate = realpath( $candidate_path );
                        if ( false !== $real_candidate ) {
                            $norm_candidate = wp_normalize_path( $real_candidate );
                            // Strictly inside basedir: must start with basedir/ and be longer than basedir
                            $is_strictly_inside = 0 === strpos( $norm_candidate, $norm_basedir_slash ) && strlen( $norm_candidate ) > strlen( $norm_basedir );
                            // Belt-and-braces: protect uploads root, WP_CONTENT_DIR, and ABSPATH
                            $wp_content_real = realpath( ( defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : ABSPATH . 'wp-content' ) );
                            $abspath_real = realpath( ABSPATH );
                            $protected_roots = array($norm_basedir, ( $wp_content_real ? wp_normalize_path( $wp_content_real ) : '' ), ( $abspath_real ? wp_normalize_path( $abspath_real ) : '' ));
                            $is_protected = in_array( $norm_candidate, array_filter( $protected_roots ), true );
                            if ( $is_strictly_inside && !$is_protected ) {
                                $imgsentry_delete_dir_recursive( $real_candidate );
                            }
                        }
                    }
                }
            }
        }
        // Remove Media Scanner Trash directory (wp-content/uploads/.imgsentry-trash/)
        $scanner_trash = wp_normalize_path( trailingslashit( $upload_dir['basedir'] ) . '.imgsentry-trash' );
        $imgsentry_delete_dir_recursive( $scanner_trash );
        // Remove File Manager Trash directory (wp-content/.imgsentry-fm-trash/)
        $fm_trash = wp_normalize_path( (( defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : ABSPATH . 'wp-content' )) . '/.imgsentry-fm-trash' );
        $imgsentry_delete_dir_recursive( $fm_trash );
    }
}

if ( function_exists( 'imgsentry_fs' ) ) {
    imgsentry_fs()->add_action( 'after_uninstall', 'imgsentry_fs_uninstall_cleanup' );
    // Account / license changed: drop the cached cloud quota so the next page load shows fresh state.
    foreach ( array(
        'after_account_delete',
        'after_license_deactivation',
        'after_license_activation',
        'after_account_connection'
    ) as $imgsentry_fs_event ) {
        imgsentry_fs()->add_action( $imgsentry_fs_event, 'imgsentry_clear_cloud_quota_cache' );
    }
    // Every "Upgrade" link that Freemius builds itself (Account page, notices, checkout cancel link)
    // goes to our pricing page on wpcodely.com.
    imgsentry_fs()->add_filter( 'pricing_url', 'imgsentry_fs_pricing_url' );
    // Freemius' own Upgrade menu item and Plugins-list link cannot open in a new tab. Hide them and
    // use our own links below, which open the pricing page in a new tab.
    imgsentry_fs()->add_filter( 'is_pricing_page_visible', '__return_false' );
}
/**
 * Delete the cached cloud quota snapshot (and its refresh throttle) after an account or license change.
 * Settings and plugin data are not touched.
 */
function imgsentry_clear_cloud_quota_cache() {
    if ( class_exists( 'ImgSentry_Cloud_Client' ) ) {
        delete_option( ImgSentry_Cloud_Client::OPT_QUOTA );
    }
    delete_transient( 'imgsentry_cloud_quota_try' );
}

/**
 * Pricing URL for Freemius' own links.
 *
 * @param string|null $url URL Freemius built (ignored).
 * @return string
 */
function imgsentry_fs_pricing_url(  $url  ) {
    return ( class_exists( 'ImgSentry_License' ) ? ImgSentry_License::get_upgrade_url( 'freemius_link' ) : (string) $url );
}

/**
 * "Upgrade" link in the Plugins list row. Opens the pricing page in a new tab.
 *
 * @param array $links Existing action links.
 * @return array
 */
function imgsentry_plugin_row_upgrade_link(  $links  ) {
    if ( !class_exists( 'ImgSentry_License' ) || !ImgSentry_License::can_upgrade() ) {
        return $links;
    }
    $label = ( 'business' === ImgSentry_License::get_plan() ? __( 'Upgrade to Professional', 'imgsentry' ) : __( 'Upgrade', 'imgsentry' ) );
    $links['imgsentry_upgrade'] = '<a href="' . esc_url( ImgSentry_License::get_upgrade_url( 'plugins_list' ) ) . '" target="_blank" rel="noopener noreferrer" style="font-weight:600;color:#A61E69;">' . esc_html( $label ) . '</a>';
    return $links;
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'imgsentry_plugin_row_upgrade_link' );
/**
 * "Connect Account" item in the ImgSentry admin menu.
 *
 * The Freemius SDK adds its own "Account" item only when the site is registered. When the user skipped the
 * opt-in, is waiting for the e-mail confirmation or disconnected, this item gives a way back.
 * In SDK activation mode all submenu items are removed and the top-level page already is the connect screen,
 * so nothing is added then.
 */
function imgsentry_add_account_menu_item() {
    global $submenu;
    if ( !current_user_can( 'manage_options' ) || !class_exists( 'ImgSentry_License' ) ) {
        return;
    }
    if ( !isset( $submenu['imgsentry'] ) ) {
        return;
    }
    $account = ImgSentry_License::get_account_state();
    if ( $account['connected'] ) {
        return;
        // The SDK shows its own Account item.
    }
    $hook = add_submenu_page(
        'imgsentry',
        $account['label'],
        $account['label'],
        'manage_options',
        'imgsentry-account-link',
        'imgsentry_render_account_link_page'
    );
    if ( $hook ) {
        add_action( 'load-' . $hook, 'imgsentry_redirect_account_link' );
    }
}

add_action( 'admin_menu', 'imgsentry_add_account_menu_item', 99 );
/**
 * Send the click on "Connect Account" to the right SDK page (same tab, same site).
 */
function imgsentry_redirect_account_link() {
    if ( !current_user_can( 'manage_options' ) || !class_exists( 'ImgSentry_License' ) ) {
        return;
    }
    $account = ImgSentry_License::get_account_state();
    $url = ( '' !== $account['url'] ? $account['url'] : admin_url( 'admin.php?page=imgsentry' ) );
    wp_safe_redirect( $url );
    exit;
}

/**
 * Fallback body of the Connect Account page (only seen if the redirect could not run).
 */
function imgsentry_render_account_link_page() {
    if ( !class_exists( 'ImgSentry_License' ) ) {
        return;
    }
    $account = ImgSentry_License::get_account_state();
    echo '<div class="wrap"><p><a class="button button-primary" href="' . esc_url( $account['url'] ) . '">' . esc_html( $account['label'] ) . '</a></p></div>';
}

/**
 * "Connect Account" / "Account" link in the Plugins list row (administrators only).
 *
 * @param array $links Existing action links.
 * @return array
 */
function imgsentry_plugin_row_account_link(  $links  ) {
    if ( !current_user_can( 'manage_options' ) || !class_exists( 'ImgSentry_License' ) ) {
        return $links;
    }
    $account = ImgSentry_License::get_account_state();
    if ( '' === $account['url'] ) {
        return $links;
    }
    $links['imgsentry_account'] = '<a href="' . esc_url( $account['url'] ) . '">' . esc_html( $account['label'] ) . '</a>';
    return $links;
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'imgsentry_plugin_row_account_link' );
/**
 * Premium build: the site is connected but the license is not active (for example after "Deactivate License").
 * Show a clear notice with a button to the Account page so the license can be activated again.
 * Shown on the Dashboard, the Plugins list and ImgSentry screens only.
 */
function imgsentry_license_inactive_notice() {
    if ( !current_user_can( 'manage_options' ) || !class_exists( 'ImgSentry_License' ) || !function_exists( 'get_current_screen' ) ) {
        return;
    }
    $screen = get_current_screen();
    $id = ( $screen && !empty( $screen->id ) ? (string) $screen->id : '' );
    if ( 'dashboard' !== $id && 'plugins' !== $id && false === strpos( $id, 'imgsentry' ) ) {
        return;
    }
    $account = ImgSentry_License::get_account_state();
    if ( !$account['connected'] || $account['license_active'] || '' === $account['url'] ) {
        return;
    }
    echo '<div class="notice notice-warning"><p><strong>' . esc_html__( 'ImgSentry: Your license is inactive.', 'imgsentry' ) . '</strong> ';
    echo esc_html__( 'Please open your account settings to reactivate it.', 'imgsentry' );
    echo ' <a class="button button-primary" style="margin-left:8px;" href="' . esc_url( $account['url'] ) . '">' . esc_html__( 'Manage account', 'imgsentry' ) . '</a></p></div>';
}

add_action( 'admin_notices', 'imgsentry_license_inactive_notice' );
/**
 * Menu label of the Upgrade item: a crown icon + "Upgrade to Pro" text, centered. The full-width filled
 * background in the plugin's primary colour (#A61E69) is drawn by the CSS on the menu row
 * (see imgsentry_upgrade_menu_style). Pure inline SVG, so no extra request and no icon font is needed.
 *
 * @return string HTML (the WordPress menu prints the title as it is).
 */
function imgsentry_upgrade_menu_label() {
    $crown = '<svg class="imgsentry-upgrade-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M2.5 7.2c-.3-.8.6-1.5 1.3-1l4.1 3 3.4-5.1c.4-.6 1.3-.6 1.7 0l3.4 5.1 4.1-3c.7-.5 1.6.2 1.3 1l-2.4 8.3c-.1.4-.5.7-.9.7H5.8c-.4 0-.8-.3-.9-.7L2.5 7.2z"/><rect x="5" y="18.2" width="14" height="2.3" rx="1.1"/></svg>';
    return '<span class="imgsentry-upgrade-pill">' . $crown . '<span class="imgsentry-upgrade-text">' . esc_html__( 'Upgrade to Pro', 'imgsentry' ) . '</span></span>';
}

/**
 * "Upgrade" item in the ImgSentry admin menu (not shown to Professional sites).
 */
function imgsentry_add_upgrade_menu_item() {
    global $submenu;
    if ( !current_user_can( 'manage_options' ) || !class_exists( 'ImgSentry_License' ) || !ImgSentry_License::can_upgrade() ) {
        return;
    }
    if ( !isset( $submenu['imgsentry'] ) ) {
        return;
    }
    add_submenu_page(
        'imgsentry',
        __( 'Upgrade to Pro', 'imgsentry' ),
        imgsentry_upgrade_menu_label(),
        'manage_options',
        'imgsentry-upgrade-link',
        'imgsentry_render_upgrade_link_page'
    );
}

add_action( 'admin_menu', 'imgsentry_add_upgrade_menu_item', 99 );
/**
 * Keep the Upgrade item at the very bottom of the ImgSentry menu.
 *
 * The Freemius SDK adds its "Account" item very late (priority 999999999), so the Upgrade item would end
 * up above it. This runs after everything else and moves Upgrade to the end of the list.
 */
function imgsentry_move_upgrade_menu_item_to_bottom() {
    global $submenu;
    if ( empty( $submenu['imgsentry'] ) || !is_array( $submenu['imgsentry'] ) ) {
        return;
    }
    $upgrade_item = null;
    foreach ( $submenu['imgsentry'] as $key => $item ) {
        if ( isset( $item[2] ) && 'imgsentry-upgrade-link' === $item[2] ) {
            $upgrade_item = $item;
            unset($submenu['imgsentry'][$key]);
            break;
        }
    }
    if ( null !== $upgrade_item ) {
        // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Moves this plugin's own submenu item; this is the documented way to reorder a submenu.
        $submenu['imgsentry'][] = $upgrade_item;
        // Appended = last position.
    }
}

add_action( 'admin_menu', 'imgsentry_move_upgrade_menu_item_to_bottom', PHP_INT_MAX );
/**
 * Fallback page for the Upgrade menu item (only seen if the new-tab script did not run).
 */
function imgsentry_render_upgrade_link_page() {
    if ( !class_exists( 'ImgSentry_License' ) ) {
        return;
    }
    echo '<div class="wrap"><p><a href="' . esc_url( ImgSentry_License::get_upgrade_url( 'admin_menu' ) ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Open the ImgSentry pricing page', 'imgsentry' ) . '</a></p></div>';
}

/**
 * Style of the Upgrade menu item (full-width #A61E69 fill, centered white text).
 * Loaded on every admin screen because the WordPress menu is visible everywhere.
 */
function imgsentry_upgrade_menu_style() {
    if ( !current_user_can( 'manage_options' ) || !class_exists( 'ImgSentry_License' ) || !ImgSentry_License::can_upgrade() ) {
        return;
    }
    $css = '
#adminmenu .wp-submenu li.imgsentry-upgrade-li,
#adminmenu .wp-submenu li:has(.imgsentry-upgrade-pill){padding:0;margin-top:8px;}
#adminmenu .wp-submenu li.imgsentry-upgrade-li a,
#adminmenu .wp-submenu li a:has(.imgsentry-upgrade-pill){display:block;padding:8px 12px;margin:0;background:#A61E69;color:#fff;text-align:center;border-radius:0;transition:background-color .15s ease;}
#adminmenu .imgsentry-upgrade-pill{display:flex;align-items:center;justify-content:center;gap:6px;color:#fff;font-weight:600;font-size:13px;line-height:1.4;text-align:center;}
#adminmenu .imgsentry-upgrade-pill svg{flex:0 0 auto;display:block;color:#fff;}
#adminmenu .wp-submenu li.imgsentry-upgrade-li a:hover,
#adminmenu .wp-submenu li.imgsentry-upgrade-li a:focus,
#adminmenu .wp-submenu li a:has(.imgsentry-upgrade-pill):hover,
#adminmenu .wp-submenu li a:has(.imgsentry-upgrade-pill):focus{background:#8F1B5A;color:#fff;box-shadow:none;}
';
    // Handle without a file: only carries the small inline style.
    wp_register_style(
        'imgsentry-upgrade-menu',
        false,
        array(),
        IMGSENTRY_VERSION
    );
    wp_enqueue_style( 'imgsentry-upgrade-menu' );
    wp_add_inline_style( 'imgsentry-upgrade-menu', $css );
}

add_action( 'admin_enqueue_scripts', 'imgsentry_upgrade_menu_style', 99 );
/**
 * Make the menu item open the pricing page in a new tab.
 */
function imgsentry_upgrade_menu_new_tab_script() {
    if ( !current_user_can( 'manage_options' ) || !class_exists( 'ImgSentry_License' ) || !ImgSentry_License::can_upgrade() ) {
        return;
    }
    $url = ImgSentry_License::get_upgrade_url( 'admin_menu' );
    // Handle without a file: only carries the small inline script below (printed in the footer).
    wp_register_script(
        'imgsentry-upgrade-menu',
        false,
        array(),
        IMGSENTRY_VERSION,
        true
    );
    wp_enqueue_script( 'imgsentry-upgrade-menu' );
    wp_add_inline_script( 'imgsentry-upgrade-menu', '(function(){var a=document.querySelector(\'#adminmenu a[href$="page=imgsentry-upgrade-link"]\');if(a){a.href=' . wp_json_encode( $url ) . ';a.target="_blank";a.rel="noopener noreferrer";if(a.parentNode){a.parentNode.classList.add("imgsentry-upgrade-li");}}})();' );
}

add_action( 'admin_enqueue_scripts', 'imgsentry_upgrade_menu_new_tab_script', 99 );