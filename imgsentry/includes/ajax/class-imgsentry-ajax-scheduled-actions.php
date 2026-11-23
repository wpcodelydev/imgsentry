<?php

/**
 * AJAX Scheduled Actions Controller Class for ImgSentry.
 * Handles fetching real WP-Cron events and Action Scheduler queue actions,
 * executing actions, canceling / re-enabling scheduled jobs, and retrieving execution logs.
 *
 * Security model:
 * - Every endpoint requires a valid nonce AND the plugin-level admin capability
 *   (ImgSentry_Settings::can_user_access_imgsentry(), i.e. manage_options and, when
 *   "restrictToAdmins" is on, the administrator role).
 * - Only ImgSentry hooks are ever run / canceled. Arbitrary hook names (WordPress core or
 *   other plugins) are rejected, and run-now never takes arguments from the browser.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Ajax_Scheduled_Actions extends ImgSentry_Ajax_Base {
    const AS_GROUP = 'imgsentry_fm_jobs';

    const SCAN_HOOK = 'imgsentry_scheduled_scan';

    /**
     * Constructor. Register Scheduled Actions AJAX actions.
     */
    public function __construct() {
        add_action( 'wp_ajax_imgsentry_get_scheduled_actions', array($this, 'get_scheduled_actions') );
        add_action( 'wp_ajax_imgsentry_run_scheduled_action', array($this, 'run_scheduled_action') );
        add_action( 'wp_ajax_imgsentry_cancel_scheduled_action', array($this, 'cancel_scheduled_action') );
        add_action( 'wp_ajax_imgsentry_enable_scheduled_action', array($this, 'enable_scheduled_action') );
        add_action( 'wp_ajax_imgsentry_get_scheduled_action_logs', array($this, 'get_action_logs') );
        add_action( 'wp_ajax_imgsentry_clear_old_scheduled_actions', array($this, 'clear_old_scheduled_actions') );
    }

    /**
     * Catalog of the plugin's own recurring tasks that can be disabled / re-enabled.
     *
     * @return array hook => display metadata.
     */
    private function get_managed_catalog() {
        $catalog = array(
            'imgsentry_daily_trash_purge'  => array(
                'title'      => 'Daily Trash Purge',
                'group'      => 'imgsentry_cron_group',
                'recurrence' => '1 day',
                'hint'       => 'Settings > Auto Clean / Trash Settings',
                'note'       => 'This task also prunes old logs, expired optimization backups and finished background jobs.',
            ),
            'imgsentry_cleanup_temp_files' => array(
                'title'      => 'Temporary File Cleanup',
                'group'      => 'imgsentry_cron_group',
                'recurrence' => '1 day',
                'hint'       => 'Settings > Advanced',
                'note'       => '',
            ),
        );
        return $catalog;
    }

    /**
     * Whether the current plan includes Media Trends (the Daily Media Snapshot task).
     *
     * @return bool
     */
    private function is_snapshot_task_available() {
        return !class_exists( 'ImgSentry_License' ) || ImgSentry_License::can_use( 'media_trends' );
    }

    /**
     * System maintenance hooks that may be run on demand but are always re-registered
     * by the plugin itself (so they cannot be disabled).
     *
     * @return string[]
     */
    private function get_maintenance_hooks() {
        return array('imgsentry_fm_watchdog_cron', 'imgsentry_fm_cleanup_orphaned_uploads', 'imgsentry_weekly_reconcile_orphans');
    }

    /**
     * Whether a hook may be run on demand.
     *
     * @param string $hook Hook name.
     * @return bool
     */
    private function is_runnable_hook( $hook ) {
        $catalog = $this->get_managed_catalog();
        return isset( $catalog[$hook] ) || in_array( $hook, $this->get_maintenance_hooks(), true );
    }

    /**
     * Build a stable numeric id for a WP-Cron event (does not change between requests).
     *
     * @param string $hook      Hook name.
     * @param int    $timestamp Scheduled timestamp.
     * @param string $key       Event key.
     * @return int
     */
    private function make_cron_id( $hook, $timestamp, $key ) {
        return (int) sprintf( '%u', crc32( $hook . '|' . $timestamp . '|' . $key ) );
    }

    /**
     * Decode the optional args payload posted by the browser (used for matching existing events only).
     *
     * @return array
     */
    private function read_posted_args() {
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- nonce verified in verify_admin_request().
        $args_raw = ( isset( $_POST['args'] ) ? wp_unslash( $_POST['args'] ) : '{}' );
        $args = ( is_string( $args_raw ) ? json_decode( $args_raw, true ) : (array) $args_raw );
        return ( is_array( $args ) ? $args : array() );
    }

    /**
     * Find a scheduled WP-Cron event by hook and args.
     *
     * @param string $hook Hook name.
     * @param array  $args Event args.
     * @return array|null Event data array or null.
     */
    private function find_cron_event( $hook, array $args ) {
        $cron = _get_cron_array();
        if ( !is_array( $cron ) ) {
            return null;
        }
        foreach ( $cron as $hooks_at_time ) {
            if ( !is_array( $hooks_at_time ) || !isset( $hooks_at_time[$hook] ) ) {
                continue;
            }
            foreach ( (array) $hooks_at_time[$hook] as $data ) {
                $event_args = ( isset( $data['args'] ) && is_array( $data['args'] ) ? $data['args'] : array() );
                // phpcs:ignore Universal.Operators.StrictComparisons.LooseEqual -- order-insensitive array compare is intended.
                if ( $event_args == $args ) {
                    return $data;
                }
            }
        }
        return null;
    }

    /**
     * Find a one-time (non-recurring) WP-Cron event of a hook by the id shown in the list.
     *
     * @param string $hook Hook name.
     * @param string $id   Id sent by the browser (see make_cron_id()).
     * @return array{timestamp:int,args:array}|null
     */
    private function find_one_off_event_by_id( $hook, $id ) {
        if ( !ctype_digit( (string) $id ) ) {
            return null;
        }
        $cron = _get_cron_array();
        if ( !is_array( $cron ) ) {
            return null;
        }
        foreach ( $cron as $timestamp => $hooks_at_time ) {
            if ( !is_array( $hooks_at_time ) || !isset( $hooks_at_time[$hook] ) ) {
                continue;
            }
            foreach ( (array) $hooks_at_time[$hook] as $key => $data ) {
                if ( !empty( $data['schedule'] ) ) {
                    continue;
                }
                if ( $this->make_cron_id( $hook, (int) $timestamp, (string) $key ) === (int) $id ) {
                    return array(
                        'timestamp' => (int) $timestamp,
                        'args'      => ( isset( $data['args'] ) && is_array( $data['args'] ) ? $data['args'] : array() ),
                    );
                }
            }
        }
        return null;
    }

    /**
     * Resolve and validate an ImgSentry Action Scheduler job.
     *
     * @param string $id Action ID.
     * @return array{store:object,action:object,status:string}|string Array on success, error message string otherwise.
     */
    private function resolve_as_action( $id ) {
        if ( !is_numeric( $id ) || !class_exists( 'ActionScheduler' ) || !method_exists( 'ActionScheduler', 'store' ) ) {
            return __( 'Action Scheduler is not available or the job id is invalid.', 'imgsentry' );
        }
        $store = ActionScheduler::store();
        $action = $store->fetch_action( (int) $id );
        if ( !$action || !method_exists( $action, 'get_group' ) || self::AS_GROUP !== $action->get_group() ) {
            return __( 'This job does not belong to ImgSentry.', 'imgsentry' );
        }
        $status = (string) $store->get_status( (int) $id );
        return array(
            'store'  => $store,
            'action' => $action,
            'status' => $status,
        );
    }

    /**
     * Fetch all registered scheduled actions from WP-Cron and Action Scheduler.
     */
    public function get_scheduled_actions() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        $actions = array();
        $catalog = $this->get_managed_catalog();
        $maintenance = $this->get_maintenance_hooks();
        $cron_array = _get_cron_array();
        $schedules = wp_get_schedules();
        $found_expected = array();
        $disabled_hooks = ( class_exists( 'ImgSentry_Cron' ) ? ImgSentry_Cron::get_disabled_hooks() : array() );
        // 1. Query active WP-Cron scheduled events
        if ( is_array( $cron_array ) ) {
            foreach ( $cron_array as $timestamp => $cron_hooks_at_time ) {
                if ( !is_array( $cron_hooks_at_time ) ) {
                    continue;
                }
                foreach ( $cron_hooks_at_time as $hook => $keys ) {
                    if ( 0 !== strpos( $hook, 'imgsentry_' ) ) {
                        continue;
                    }
                    // Not listed on plans without Media Trends (the task does nothing there).
                    if ( 'imgsentry_daily_snapshot_event' === $hook && !$this->is_snapshot_task_available() ) {
                        continue;
                    }
                    $is_managed = isset( $catalog[$hook] );
                    if ( $is_managed ) {
                        $found_expected[$hook] = true;
                    }
                    foreach ( (array) $keys as $key => $data ) {
                        $meta = ( $is_managed ? $catalog[$hook] : array(
                            'group'      => 'imgsentry_cron_group',
                            'recurrence' => ( isset( $data['schedule'] ) && $data['schedule'] ? $data['schedule'] : 'Non-repeating' ),
                        ) );
                        $date_str = gmdate( 'Y-m-d H:i:s', (int) $timestamp ) . ' +0000';
                        $recurrence_label = ( empty( $data['schedule'] ) ? 'Non-repeating' : $meta['recurrence'] );
                        if ( !empty( $data['schedule'] ) ) {
                            $slug = $data['schedule'];
                            if ( isset( $schedules[$slug]['display'] ) ) {
                                $recurrence_label = $schedules[$slug]['display'];
                            } else {
                                $recurrence_label = ucfirst( str_replace( '_', ' ', $slug ) );
                            }
                        }
                        $is_recurring = !empty( $data['schedule'] );
                        $can_cancel = $is_managed || !$is_recurring;
                        $can_run = $this->is_runnable_hook( $hook );
                        /* translators: %s: date and time of the next run */
                        $imgsentry_fmt_1 = __( 'Registered with WP-Cron scheduler. Next run at %s', 'imgsentry' );
                        $imgsentry_msg_1 = sprintf( $imgsentry_fmt_1, $date_str );
                        $actions[] = array(
                            'id'            => $this->make_cron_id( $hook, (int) $timestamp, (string) $key ),
                            'hook'          => $hook,
                            'status'        => 'pending',
                            'args'          => ( !empty( $data['args'] ) ? $data['args'] : new stdClass() ),
                            'group'         => $meta['group'],
                            'recurrence'    => $recurrence_label,
                            'scheduledDate' => $date_str,
                            'claimId'       => null,
                            'priority'      => 10,
                            'source'        => 'wp_cron',
                            'can_run'       => $can_run,
                            'can_cancel'    => $can_cancel,
                            'can_enable'    => false,
                            'logs'          => array(array(
                                'timestamp' => 'Scheduled',
                                'message'   => $imgsentry_msg_1,
                            )),
                        );
                    }
                }
            }
        }
        // Include managed tasks that are not scheduled as 'disabled' (with a working Re-enable).
        foreach ( $catalog as $hook => $meta ) {
            if ( isset( $found_expected[$hook] ) ) {
                continue;
            }
            if ( self::SCAN_HOOK === $hook ) {
                $reason = 'Scheduled scanning is turned off. Click Re-enable to turn "Enable Scheduled Scan" back on (current frequency and time settings are kept).';
            } elseif ( in_array( $hook, $disabled_hooks, true ) ) {
                $reason = 'Task was disabled from this page. Click Re-enable to schedule it again.';
            } else {
                $reason = 'Task is not scheduled right now. Click Re-enable to schedule it (' . $meta['hint'] . ').';
            }
            $actions[] = array(
                'id'            => $this->make_cron_id( $hook, 0, 'disabled' ),
                'hook'          => $hook,
                'status'        => 'disabled',
                'args'          => new stdClass(),
                'group'         => $meta['group'],
                'recurrence'    => $meta['recurrence'],
                'scheduledDate' => 'Unscheduled (Disabled)',
                'claimId'       => null,
                'priority'      => 10,
                'source'        => 'wp_cron',
                'can_run'       => false,
                'can_cancel'    => false,
                'can_enable'    => true,
                'logs'          => array(array(
                    'timestamp' => 'Disabled',
                    'message'   => $reason,
                )),
            );
        }
        $status_counts = array(
            'all'         => 0,
            'pending'     => 0,
            'in-progress' => 0,
            'complete'    => 0,
            'failed'      => 0,
            'canceled'    => 0,
        );
        // Calculate initial status counts from WP-Cron entries
        foreach ( $actions as $cron_act ) {
            if ( 'pending' === $cron_act['status'] ) {
                $status_counts['pending']++;
            } elseif ( 'disabled' === $cron_act['status'] ) {
                $status_counts['canceled']++;
            }
        }
        // 2. Query real Action Scheduler queue actions if available
        if ( class_exists( 'ActionScheduler' ) && method_exists( 'ActionScheduler', 'store' ) ) {
            try {
                $store = ActionScheduler::store();
                if ( is_object( $store ) && method_exists( $store, 'query_actions' ) ) {
                    $segments = array(
                        'pending'     => array(200, 'ASC'),
                        'in-progress' => array(200, 'ASC'),
                        'failed'      => array(100, 'DESC'),
                        'complete'    => array(15, 'DESC'),
                        'canceled'    => array(15, 'DESC'),
                    );
                    $all_queried_ids = array();
                    foreach ( $segments as $segment_status => $cfg ) {
                        $ids = $store->query_actions( array(
                            'group'    => self::AS_GROUP,
                            'status'   => $segment_status,
                            'per_page' => $cfg[0],
                            'orderby'  => 'date',
                            'order'    => $cfg[1],
                        ) );
                        if ( is_array( $ids ) ) {
                            $all_queried_ids = array_merge( $all_queried_ids, $ids );
                        }
                    }
                    $seen_ids = array();
                    $action_ids = array();
                    foreach ( $all_queried_ids as $aid ) {
                        $aid = (int) $aid;
                        if ( !isset( $seen_ids[$aid] ) ) {
                            $seen_ids[$aid] = true;
                            $action_ids[] = $aid;
                        }
                    }
                    if ( !empty( $action_ids ) && method_exists( $store, 'fetch_action' ) ) {
                        foreach ( $action_ids as $action_id ) {
                            $action = $store->fetch_action( $action_id );
                            $status = ( method_exists( $store, 'get_status' ) ? $store->get_status( $action_id ) : 'pending' );
                            $status = ( !empty( $status ) ? $status : 'pending' );
                            $schedule = ( $action ? $action->get_schedule() : null );
                            $date = ( $schedule ? $schedule->get_date() : null );
                            $actions[] = array(
                                'id'            => (int) $action_id,
                                'hook'          => ( $action ? $action->get_hook() : 'unknown' ),
                                'status'        => $status,
                                'args'          => ( $action ? $action->get_args() : array() ),
                                'group'         => ( $action ? $action->get_group() : self::AS_GROUP ),
                                'recurrence'    => ( $schedule && method_exists( $schedule, 'is_recurring' ) && $schedule->is_recurring() ? 'Recurring' : 'Non-repeating' ),
                                'scheduledDate' => ( $date ? $date->format( 'Y-m-d H:i:s' ) . ' +0000' : 'Immediate' ),
                                'claimId'       => null,
                                'priority'      => 10,
                                'source'        => 'action_scheduler',
                                'can_run'       => 'pending' === $status,
                                'can_cancel'    => 'pending' === $status,
                                'can_enable'    => false,
                                'logs'          => array(),
                            );
                        }
                    }
                    // True database-level status counts for the imgsentry_fm_jobs group
                    foreach ( array(
                        'pending',
                        'in-progress',
                        'complete',
                        'failed',
                        'canceled'
                    ) as $count_status ) {
                        $status_counts[$count_status] += (int) $store->query_actions( array(
                            'group'  => self::AS_GROUP,
                            'status' => $count_status,
                        ), 'count' );
                    }
                }
            } catch ( \Throwable $e ) {
                // Fallback silently if Action Scheduler query encountered error
            }
        }
        $status_counts['all'] = $status_counts['pending'] + $status_counts['in-progress'] + $status_counts['complete'] + $status_counts['failed'] + $status_counts['canceled'];
        wp_send_json_success( array(
            'actions'       => $actions,
            'total'         => count( $actions ),
            'status_counts' => $status_counts,
        ) );
    }

    /**
     * Run a scheduled action immediately on-demand.
     */
    public function run_scheduled_action() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $hook = ( isset( $_POST['hook'] ) ? sanitize_text_field( wp_unslash( $_POST['hook'] ) ) : '' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $source = ( isset( $_POST['source'] ) ? sanitize_text_field( wp_unslash( $_POST['source'] ) ) : 'wp_cron' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $id = ( isset( $_POST['action_id'] ) ? sanitize_text_field( wp_unslash( $_POST['action_id'] ) ) : '' );
        if ( empty( $hook ) ) {
            wp_send_json_error( array(
                'message' => __( 'Missing hook name.', 'imgsentry' ),
            ) );
        }
        if ( 'wp_cron' === $source ) {
            if ( !$this->is_runnable_hook( $hook ) ) {
                wp_send_json_error( array(
                    'message' => __( 'This task cannot be run manually.', 'imgsentry' ),
                ) );
            }
            $this->log_action(
                sprintf( 'Manual trigger initiated for action: %s', $hook ),
                array(
                    'hook'      => $hook,
                    'source'    => $source,
                    'action_id' => $id,
                ),
                'info',
                'System',
                'Scheduled Actions'
            );
            // Plugin tasks take no arguments: never forward browser-supplied args to a hook.
            $queued = wp_schedule_single_event( time(), $hook, array() );
            if ( false === $queued || is_wp_error( $queued ) ) {
                wp_send_json_error( array(
                    'message' => __( 'This task is already queued or due to run within the next few minutes, so a second run was not added. Please wait a moment and refresh.', 'imgsentry' ),
                ) );
            }
            if ( function_exists( 'spawn_cron' ) ) {
                spawn_cron();
            }
            /* translators: %s: name of the scheduled task */
            $imgsentry_fmt_2 = __( 'Queued "%s" for immediate background execution.', 'imgsentry' );
            $msg = sprintf( $imgsentry_fmt_2, $hook );
            if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
                $msg .= ' ' . __( 'WP-Cron is disabled on this site (DISABLE_WP_CRON), so it will run on your server cron\'s next tick.', 'imgsentry' );
            }
            wp_send_json_success( array(
                'message'   => $msg,
                'action_id' => $id,
                'status'    => 'pending',
            ) );
        }
        // Action Scheduler job
        $resolved = $this->resolve_as_action( $id );
        if ( is_string( $resolved ) ) {
            wp_send_json_error( array(
                'message' => $resolved,
            ) );
        }
        if ( 'pending' !== $resolved['status'] ) {
            /* translators: %s: current status of the job */
            $imgsentry_fmt_3 = __( 'Only pending jobs can be run (current status: %s).', 'imgsentry' );
            $imgsentry_msg_2 = sprintf( $imgsentry_fmt_3, $resolved['status'] );
            wp_send_json_error( array(
                'message' => $imgsentry_msg_2,
            ) );
        }
        if ( !class_exists( 'ActionScheduler_QueueRunner' ) ) {
            wp_send_json_error( array(
                'message' => __( 'Action Scheduler queue runner is not available.', 'imgsentry' ),
            ) );
        }
        $this->log_action(
            sprintf( 'Manual trigger initiated for action: %s', $hook ),
            array(
                'hook'      => $hook,
                'source'    => $source,
                'action_id' => $id,
            ),
            'info',
            'System',
            'Scheduled Actions'
        );
        try {
            ActionScheduler_QueueRunner::instance()->process_action( (int) $id, 'imgsentry_admin' );
        } catch ( \Throwable $e ) {
            /* translators: %1$s: task name, %2$s: job ID, %3$s: error message */
            $imgsentry_fmt_4 = __( 'Job "%1$s" (#%2$s) failed: %3$s', 'imgsentry' );
            $imgsentry_msg_3 = sprintf(
                $imgsentry_fmt_4,
                $hook,
                $id,
                $e->getMessage()
            );
            wp_send_json_error( array(
                'message' => $imgsentry_msg_3,
            ) );
        }
        $new_status = (string) $resolved['store']->get_status( (int) $id );
        if ( 'failed' === $new_status ) {
            /* translators: %1$s: task name, %2$s: job ID */
            $imgsentry_fmt_5 = __( 'Job "%1$s" (#%2$s) ran but ended in a failed state. Open its logs for details.', 'imgsentry' );
            $imgsentry_msg_4 = sprintf( $imgsentry_fmt_5, $hook, $id );
            wp_send_json_error( array(
                'message' => $imgsentry_msg_4,
            ) );
        }
        /* translators: %1$s: task name, %2$s: job ID, %3$s: resulting status */
        $imgsentry_fmt_6 = __( 'Job "%1$s" (#%2$s) processed. Status: %3$s.', 'imgsentry' );
        $imgsentry_msg_5 = sprintf(
            $imgsentry_fmt_6,
            $hook,
            $id,
            ( $new_status ? $new_status : 'complete' )
        );
        wp_send_json_success( array(
            'message'   => $imgsentry_msg_5,
            'action_id' => $id,
            'status'    => ( $new_status ? $new_status : 'complete' ),
        ) );
    }

    /**
     * Cancel or unschedule a registered scheduled action.
     *
     * Managed recurring tasks are disabled persistently (the plugin will not silently
     * re-schedule them on the next request) and can be turned back on with "Re-enable".
     */
    public function cancel_scheduled_action() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $hook = ( isset( $_POST['hook'] ) ? sanitize_text_field( wp_unslash( $_POST['hook'] ) ) : '' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $source = ( isset( $_POST['source'] ) ? sanitize_text_field( wp_unslash( $_POST['source'] ) ) : 'wp_cron' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $id = ( isset( $_POST['action_id'] ) ? sanitize_text_field( wp_unslash( $_POST['action_id'] ) ) : '' );
        if ( empty( $hook ) ) {
            wp_send_json_error( array(
                'message' => __( 'Missing hook name.', 'imgsentry' ),
            ) );
        }
        if ( 'wp_cron' === $source ) {
            $catalog = $this->get_managed_catalog();
            if ( 0 !== strpos( $hook, 'imgsentry_' ) ) {
                wp_send_json_error( array(
                    'message' => __( 'Only ImgSentry tasks can be canceled here.', 'imgsentry' ),
                ) );
            }
            // A one-time run queued with "Run" (or any other one-time event of a managed task): remove only that
            // event. The recurring task itself stays scheduled and enabled.
            $one_off = ( isset( $catalog[$hook] ) ? $this->find_one_off_event_by_id( $hook, $id ) : null );
            if ( $one_off ) {
                wp_unschedule_event( $one_off['timestamp'], $hook, $one_off['args'] );
                $this->log_action(
                    sprintf( 'One-time scheduled run canceled: %s', $hook ),
                    array(
                        'hook'      => $hook,
                        'source'    => $source,
                        'action_id' => $id,
                    ),
                    'info',
                    'System',
                    'Scheduled Actions'
                );
                /* translators: %s: name of the scheduled task */
                $imgsentry_fmt_7 = __( 'One-time run of "%s" was removed.', 'imgsentry' );
                $imgsentry_msg_6 = sprintf( $imgsentry_fmt_7, $hook );
                wp_send_json_success( array(
                    'message'       => $imgsentry_msg_6,
                    'action_id'     => $id,
                    'status'        => 'canceled',
                    'reenable_hint' => __( 'The recurring task is unchanged.', 'imgsentry' ),
                ) );
            }
            if ( self::SCAN_HOOK === $hook ) {
                wp_clear_scheduled_hook( $hook );
                $hint = __( 'Scheduled scanning is now turned off in Settings too. Use Re-enable to turn it back on.', 'imgsentry' );
            } elseif ( isset( $catalog[$hook] ) ) {
                ImgSentry_Cron::set_hook_disabled( $hook, true );
                wp_clear_scheduled_hook( $hook );
                $hint = __( 'The task stays disabled until you click Re-enable.', 'imgsentry' );
                if ( !empty( $catalog[$hook]['note'] ) ) {
                    $hint .= ' ' . $catalog[$hook]['note'];
                }
            } else {
                $args = $this->read_posted_args();
                $event = $this->find_cron_event( $hook, $args );
                if ( null === $event ) {
                    wp_send_json_error( array(
                        'message' => __( 'This task is no longer scheduled.', 'imgsentry' ),
                    ) );
                }
                if ( !empty( $event['schedule'] ) ) {
                    wp_send_json_error( array(
                        'message' => __( 'This is a system maintenance task that the plugin registers automatically, so it cannot be disabled.', 'imgsentry' ),
                    ) );
                }
                wp_clear_scheduled_hook( $hook, $args );
                $hint = __( 'This one-time background step was removed. It is created again only when the related operation is started.', 'imgsentry' );
            }
            $this->log_action(
                sprintf( 'Scheduled action canceled: %s', $hook ),
                array(
                    'hook'      => $hook,
                    'source'    => $source,
                    'action_id' => $id,
                ),
                'warning',
                'System',
                'Scheduled Actions'
            );
            /* translators: %s: name of the scheduled task */
            $imgsentry_fmt_8 = __( 'WP-Cron task "%s" has been canceled.', 'imgsentry' );
            $imgsentry_msg_7 = sprintf( $imgsentry_fmt_8, $hook );
            wp_send_json_success( array(
                'message'       => $imgsentry_msg_7,
                'action_id'     => $id,
                'status'        => ( isset( $catalog[$hook] ) ? 'disabled' : 'canceled' ),
                'reenable_hint' => $hint,
            ) );
        }
        // Action Scheduler job
        $resolved = $this->resolve_as_action( $id );
        if ( is_string( $resolved ) ) {
            wp_send_json_error( array(
                'message' => $resolved,
            ) );
        }
        if ( 'pending' !== $resolved['status'] ) {
            /* translators: %s: current status of the job */
            $imgsentry_fmt_9 = __( 'Only pending jobs can be canceled (current status: %s).', 'imgsentry' );
            $imgsentry_msg_8 = sprintf( $imgsentry_fmt_9, $resolved['status'] );
            wp_send_json_error( array(
                'message' => $imgsentry_msg_8,
            ) );
        }
        try {
            $resolved['store']->cancel_action( (int) $id );
        } catch ( \Throwable $e ) {
            /* translators: %s: error message */
            $imgsentry_fmt_10 = __( 'Could not cancel the job: %s', 'imgsentry' );
            $imgsentry_msg_9 = sprintf( $imgsentry_fmt_10, $e->getMessage() );
            wp_send_json_error( array(
                'message' => $imgsentry_msg_9,
            ) );
        }
        if ( 'canceled' !== (string) $resolved['store']->get_status( (int) $id ) ) {
            wp_send_json_error( array(
                'message' => __( 'The job could not be canceled (it may have just started running).', 'imgsentry' ),
            ) );
        }
        $this->log_action(
            sprintf( 'Scheduled action canceled: %s', $hook ),
            array(
                'hook'      => $hook,
                'source'    => $source,
                'action_id' => $id,
            ),
            'warning',
            'System',
            'Scheduled Actions'
        );
        /* translators: %1$s: task name, %2$s: job ID */
        $imgsentry_fmt_11 = __( 'Action Scheduler job "%1$s" (#%2$s) canceled.', 'imgsentry' );
        $imgsentry_msg_10 = sprintf( $imgsentry_fmt_11, $hook, $id );
        wp_send_json_success( array(
            'message'       => $imgsentry_msg_10,
            'action_id'     => $id,
            'status'        => 'canceled',
            'reenable_hint' => __( 'Action Scheduler jobs are created again automatically when a new background operation is started.', 'imgsentry' ),
        ) );
    }

    /**
     * Re-enable a disabled managed task and schedule it again.
     */
    public function enable_scheduled_action() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $hook = ( isset( $_POST['hook'] ) ? sanitize_text_field( wp_unslash( $_POST['hook'] ) ) : '' );
        $catalog = $this->get_managed_catalog();
        if ( empty( $hook ) || !isset( $catalog[$hook] ) ) {
            wp_send_json_error( array(
                'message' => __( 'This task cannot be enabled from here.', 'imgsentry' ),
            ) );
        }
        if ( self::SCAN_HOOK === $hook ) {
            if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'scheduled_scan' ) ) {
                ImgSentry_License::deny( 'scheduled_scan' );
            }
            if ( !ImgSentry_Cron::is_plugin_enabled() ) {
                wp_send_json_error( array(
                    'message' => __( 'The plugin is switched off in Settings. Enable the plugin first, then re-enable the scheduled scan.', 'imgsentry' ),
                ) );
            }
            if ( !wp_next_scheduled( self::SCAN_HOOK ) ) {
                wp_send_json_error( array(
                    'message' => __( 'Could not schedule the scan. Check the scan frequency and time in Settings > Scheduled Scan.', 'imgsentry' ),
                ) );
            }
        } else {
            ImgSentry_Cron::set_hook_disabled( $hook, false );
            if ( !ImgSentry_Cron::schedule_managed_hook( $hook ) ) {
                wp_send_json_error( array(
                    'message' => __( 'Could not schedule this task. WP-Cron may be unavailable.', 'imgsentry' ),
                ) );
            }
        }
        $this->log_action(
            sprintf( 'Scheduled action re-enabled: %s', $hook ),
            array(
                'hook' => $hook,
            ),
            'info',
            'System',
            'Scheduled Actions'
        );
        /* translators: %s: name of the scheduled task */
        $imgsentry_fmt_12 = __( 'Task "%s" has been re-enabled and scheduled.', 'imgsentry' );
        $imgsentry_msg_11 = sprintf( $imgsentry_fmt_12, $hook );
        wp_send_json_success( array(
            'message' => $imgsentry_msg_11,
            'status'  => 'pending',
        ) );
    }

    /**
     * Retrieve audit trail / execution logs for a scheduled action.
     */
    public function get_action_logs() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $id = ( isset( $_POST['action_id'] ) ? sanitize_text_field( wp_unslash( $_POST['action_id'] ) ) : '' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $hook = ( isset( $_POST['hook'] ) ? sanitize_text_field( wp_unslash( $_POST['hook'] ) ) : '' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $source = ( isset( $_POST['source'] ) ? sanitize_text_field( wp_unslash( $_POST['source'] ) ) : 'wp_cron' );
        $logs = array();
        // 1. If Action Scheduler, attempt to fetch from ActionScheduler_Logger (only for ImgSentry jobs)
        if ( 'action_scheduler' === $source && class_exists( 'ActionScheduler_Logger' ) && is_numeric( $id ) ) {
            try {
                $resolved = $this->resolve_as_action( $id );
                if ( is_array( $resolved ) ) {
                    $logger = ActionScheduler::logger();
                    $raw_logs = $logger->get_logs( (int) $id );
                    if ( is_array( $raw_logs ) ) {
                        foreach ( $raw_logs as $log_entry ) {
                            $date = $log_entry->get_date();
                            $logs[] = array(
                                'timestamp' => ( $date ? $date->format( 'Y-m-d H:i:s' ) : 'Recently' ),
                                'message'   => $log_entry->get_message(),
                            );
                        }
                    }
                }
            } catch ( \Throwable $e ) {
                // Fallback
            }
        }
        // 2. Query ImgSentry_Logger database table
        if ( class_exists( 'ImgSentry_Logger' ) && !empty( $hook ) ) {
            $search_term = sanitize_text_field( $hook );
            $query_res = ImgSentry_Logger::query( array(
                'search'   => $search_term,
                'per_page' => 15,
            ) );
            if ( !empty( $query_res['items'] ) && is_array( $query_res['items'] ) ) {
                foreach ( $query_res['items'] as $item ) {
                    $logs[] = array(
                        'timestamp' => ( isset( $item['time'] ) ? $item['time'] : (( isset( $item['raw_time'] ) ? $item['raw_time'] : 'Recent' )) ),
                        'message'   => (( isset( $item['boldText'] ) ? $item['boldText'] : '' )) . (( !empty( $item['subText'] ) ? ' - ' . $item['subText'] : '' )),
                    );
                }
            }
        }
        // 3. Generic placeholder lines when no real log entry exists (flagged so the UI can ignore them)
        $used_fallback = empty( $logs );
        if ( $used_fallback ) {
            /* translators: %s: name of the scheduler that tracks the action */
            $imgsentry_fmt_13 = __( 'Action registered and tracked by %s', 'imgsentry' );
            $imgsentry_msg_12 = sprintf( $imgsentry_fmt_13, ( 'wp_cron' === $source ? 'WP-Cron Manager' : 'ActionScheduler_QueueRunner' ) );
            /* translators: %s: WordPress hook name */
            $imgsentry_fmt_14 = __( 'Status: Active and monitoring hook "%s"', 'imgsentry' );
            $imgsentry_msg_13 = sprintf( $imgsentry_fmt_14, $hook );
            $logs = array(array(
                'timestamp' => current_time( 'mysql' ),
                'message'   => $imgsentry_msg_12,
            ), array(
                'timestamp' => current_time( 'mysql' ),
                'message'   => $imgsentry_msg_13,
            ));
        }
        wp_send_json_success( array(
            'logs'        => $logs,
            'is_fallback' => $used_fallback,
        ) );
    }

    /**
     * Manually clear completed/canceled/failed scheduled actions safely scoped to imgsentry_fm_jobs.
     */
    public function clear_old_scheduled_actions() {
        $this->verify_admin_request( 'imgsentry_admin_nonce' );
        if ( !class_exists( 'ActionScheduler' ) || !method_exists( 'ActionScheduler', 'store' ) ) {
            wp_send_json_error( array(
                'message' => __( 'Action Scheduler is not active.', 'imgsentry' ),
            ) );
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $status_param = ( isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : 'all' );
        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler (verify_admin_request).
        $days = ( isset( $_POST['older_than_days'] ) ? absint( $_POST['older_than_days'] ) : 0 );
        // Whitelist only 'complete', 'failed', and 'canceled' (prevent pending and in-progress)
        $allowed_statuses = array('complete', 'failed', 'canceled');
        $target_statuses = array();
        if ( 'all' === $status_param || empty( $status_param ) ) {
            $target_statuses = $allowed_statuses;
        } elseif ( in_array( $status_param, $allowed_statuses, true ) ) {
            $target_statuses = array($status_param);
        } else {
            wp_send_json_error( array(
                'message' => __( 'Invalid status parameter.', 'imgsentry' ),
            ) );
        }
        $deleted_count = 0;
        try {
            $store = ActionScheduler::store();
            if ( is_object( $store ) && method_exists( $store, 'query_actions' ) && method_exists( $store, 'delete_action' ) ) {
                $query_args = array(
                    'group'    => self::AS_GROUP,
                    'per_page' => 500,
                );
                if ( $days > 0 ) {
                    $cutoff = ( function_exists( 'as_get_datetime_object' ) ? as_get_datetime_object( $days . ' days ago' ) : new DateTime($days . ' days ago', new DateTimeZone('UTC')) );
                    $query_args['date'] = $cutoff;
                    $query_args['date_compare'] = '<';
                }
                foreach ( $target_statuses as $status ) {
                    $status_query_args = $query_args;
                    $status_query_args['status'] = $status;
                    // Query for matching action IDs in the 'imgsentry_fm_jobs' group
                    $action_ids = $store->query_actions( $status_query_args );
                    if ( is_array( $action_ids ) && !empty( $action_ids ) ) {
                        foreach ( $action_ids as $action_id ) {
                            try {
                                $store->delete_action( (int) $action_id );
                                $deleted_count++;
                            } catch ( \Throwable $inner_e ) {
                                // Ignore failed individual deletions and continue
                            }
                        }
                    }
                }
            }
        } catch ( \Throwable $e ) {
            /* translators: %s: error message */
            $imgsentry_fmt_15 = __( 'Error clearing scheduled actions: %s', 'imgsentry' );
            $imgsentry_msg_14 = sprintf( $imgsentry_fmt_15, $e->getMessage() );
            wp_send_json_error( array(
                'message' => $imgsentry_msg_14,
            ) );
        }
        $this->log_action(
            sprintf( 'Manual clear old scheduled actions completed. Removed %d actions.', $deleted_count ),
            array(
                'deleted_count'    => $deleted_count,
                'requested_status' => $status_param,
                'older_than_days'  => $days,
            ),
            'info',
            'System',
            'Scheduled Actions'
        );
        /* translators: %d: number of cleared actions */
        $imgsentry_fmt_16 = _n(
            'Cleared %d old action.',
            'Cleared %d old actions.',
            $deleted_count,
            'imgsentry'
        );
        $imgsentry_msg_15 = sprintf( $imgsentry_fmt_16, $deleted_count );
        wp_send_json_success( array(
            'deleted_count' => $deleted_count,
            'message'       => $imgsentry_msg_15,
        ) );
    }

}
