<?php

/**
 * AJAX controller for the Dashboard notification bell.
 *
 * Returns the notifications the server knows about (scheduled tasks running late, uploads folder not
 * writable, finished or failed image optimization, Trash auto-delete, and - only while the File Manager is
 * active - important File Manager events). The browser shows them in the bell next to the scan, account and
 * quota notices it already builds itself.
 *
 * Security model:
 * - A valid nonce is required (same nonce as the rest of the admin screens).
 * - Every group of notifications has its own permission check, so a user only receives what they may open
 *   anyway. A user who may open nothing of the plugin gets a 403.
 * - Read-only: nothing is changed in the database except a short-lived cache of one count.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Ajax_Notifications extends ImgSentry_Ajax_Base {
    /**
     * Cache key of the "Trash items about to expire" count (10 minutes).
     */
    const TRASH_SOON_TRANSIENT = 'imgsentry_bell_trash_soon';

    /**
     * Option written by the Trash auto-delete: [ first => timestamp, time => timestamp, count => int ].
     */
    const LAST_PURGE_OPTION = 'imgsentry_last_trash_purge';

    /**
     * User meta: ids of the notifications this user has already read (kept on the server, so the
     * read/unread state is the same in every browser and on every device).
     */
    const READ_META_KEY = 'imgsentry_bell_read';

    /**
     * Most read ids kept per user (the oldest are dropped).
     */
    const READ_META_MAX = 300;

    /**
     * Constructor. Register the AJAX action.
     */
    public function __construct() {
        add_action( 'wp_ajax_imgsentry_get_notifications', array($this, 'get_notifications') );
        add_action( 'wp_ajax_imgsentry_bell_mark_read', array($this, 'mark_read') );
    }

    /**
     * Handler: imgsentry_get_notifications.
     *
     * @return void
     */
    public function get_notifications() {
        check_ajax_referer( 'imgsentry_admin_nonce', 'nonce' );
        $user_id = get_current_user_id();
        $has_perms = class_exists( 'ImgSentry_Permissions' );
        $is_admin = ( $has_perms ? ImgSentry_Permissions::is_administrator() : current_user_can( 'manage_options' ) );
        $can_dash = ( $has_perms ? ImgSentry_Permissions::can( 'dashboard' ) : $is_admin );
        $can_optim = ( $has_perms ? ImgSentry_Permissions::can( 'optimization' ) : $is_admin );
        $can_trash = ( $has_perms ? ImgSentry_Permissions::can( 'trash_view' ) : $is_admin );
        $fm_user = class_exists( 'ImgSentry_FM_Security' ) && ImgSentry_FM_Security::can_user_manage();
        if ( !$can_dash && !$fm_user && !$is_admin ) {
            wp_send_json_error( array(
                'message' => __( 'You do not have permission to perform this action.', 'imgsentry' ),
            ), 403 );
        }
        $items = array();
        if ( $is_admin ) {
            $items = array_merge( $items, $this->get_system_items() );
        }
        if ( $can_optim ) {
            $items = array_merge( $items, $this->get_optimization_items() );
        }
        if ( $can_trash ) {
            $items = array_merge( $items, $this->get_trash_items() );
        }
        if ( $fm_user && class_exists( 'ImgSentry_FM_Logger' ) && method_exists( 'ImgSentry_FM_Logger', 'get_bell_items' ) ) {
            $items = array_merge( $items, ImgSentry_FM_Logger::get_bell_items( (int) $user_id, (bool) $is_admin ) );
        }
        // Most urgent first, then newest first.
        $rank = array(
            'error'   => 0,
            'warning' => 1,
            'info'    => 2,
            'success' => 3,
        );
        usort( $items, static function ( $a, $b ) use($rank) {
            $ra = ( isset( $rank[$a['severity']] ) ? $rank[$a['severity']] : 2 );
            $rb = ( isset( $rank[$b['severity']] ) ? $rank[$b['severity']] : 2 );
            if ( $ra !== $rb ) {
                return $ra <=> $rb;
            }
            return (int) $b['ts'] <=> (int) $a['ts'];
        } );
        wp_send_json_success( array(
            'items'    => array_slice( array_values( $items ), 0, 30 ),
            'read_ids' => $this->get_read_ids( (int) $user_id ),
        ) );
    }

    /**
     * Handler: imgsentry_bell_mark_read. Saves which notifications the current user has read.
     * Expects "ids": a JSON array of notification ids (at most 100 per request).
     *
     * @return void
     */
    public function mark_read() {
        check_ajax_referer( 'imgsentry_admin_nonce', 'nonce' );
        if ( !$this->user_can_use_bell() ) {
            wp_send_json_error( array(
                'message' => __( 'You do not have permission to perform this action.', 'imgsentry' ),
            ), 403 );
        }
        // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized, WordPress.Security.ValidatedSanitizedInput.MissingUnslash -- Unslashed here, decoded as JSON, and every id is checked against a strict pattern below.
        $raw = ( isset( $_POST['ids'] ) ? wp_unslash( $_POST['ids'] ) : '' );
        $ids = ( is_string( $raw ) ? json_decode( $raw, true ) : null );
        if ( !is_array( $ids ) ) {
            wp_send_json_error( array(
                'message' => __( 'Invalid request.', 'imgsentry' ),
            ), 400 );
        }
        $clean = array();
        foreach ( array_slice( $ids, 0, 100 ) as $id ) {
            if ( is_string( $id ) && preg_match( '/^[A-Za-z0-9._:\\-]{1,120}$/', $id ) ) {
                $clean[] = $id;
            }
        }
        $user_id = get_current_user_id();
        $merged = array_values( array_unique( array_merge( $this->get_read_ids( (int) $user_id ), $clean ) ) );
        if ( count( $merged ) > self::READ_META_MAX ) {
            $merged = array_slice( $merged, -self::READ_META_MAX );
        }
        update_user_meta( $user_id, self::READ_META_KEY, $merged );
        wp_send_json_success( array(
            'read_ids' => $merged,
        ) );
    }

    /**
     * Notification ids the user has already read.
     *
     * @param int $user_id User id.
     * @return string[]
     */
    private function get_read_ids( $user_id ) {
        $ids = get_user_meta( (int) $user_id, self::READ_META_KEY, true );
        if ( !is_array( $ids ) ) {
            return array();
        }
        return array_values( array_filter( $ids, 'is_string' ) );
    }

    /**
     * Whether the current user may use the bell at all (same rule as get_notifications()).
     *
     * @return bool
     */
    private function user_can_use_bell() {
        $has_perms = class_exists( 'ImgSentry_Permissions' );
        $is_admin = ( $has_perms ? ImgSentry_Permissions::is_administrator() : current_user_can( 'manage_options' ) );
        $can_dash = ( $has_perms ? ImgSentry_Permissions::can( 'dashboard' ) : $is_admin );
        $fm_user = class_exists( 'ImgSentry_FM_Security' ) && ImgSentry_FM_Security::can_user_manage();
        return $is_admin || $can_dash || $fm_user;
    }

    /**
     * Build one notification array in the shape the React bell expects.
     *
     * @param string $id       Stable id (changes when the situation is new).
     * @param string $severity error | warning | info | success.
     * @param string $kind     Icon group: system | optimize | trash | file | security.
     * @param string $title    Short title.
     * @param string $detail   One or two sentences.
     * @param string $target   App page to open on click.
     * @param int    $ts       Unix time of the event (0 = unknown).
     * @return array
     */
    private function make_item(
        $id,
        $severity,
        $kind,
        $title,
        $detail,
        $target,
        $ts = 0
    ) {
        return array(
            'id'       => (string) $id,
            'severity' => (string) $severity,
            'kind'     => (string) $kind,
            'title'    => (string) $title,
            'detail'   => (string) $detail,
            'target'   => (string) $target,
            'ts'       => (int) $ts,
        );
    }

    /**
     * Site health notices (Administrators only).
     *
     * @return array[]
     */
    private function get_system_items() {
        $items = array();
        // 1) Scheduled tasks are running late. Works for WP-Cron AND for a server cron job: it only looks at
        // whether the daily task is overdue, so a site with a correct server cron never gets a false alarm.
        $next = wp_next_scheduled( 'imgsentry_daily_trash_purge' );
        if ( $next && (int) $next < time() - 3 * HOUR_IN_SECONDS ) {
            $detail = __( 'Scheduled scans, Trash auto-delete and cleanup tasks are running late. Check that WP-Cron can run, or that a server cron job calls wp-cron.php.', 'imgsentry' );
            if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
                $detail = __( 'WP-Cron is switched off on this site, and the scheduled tasks are running late. Make sure a server cron job calls wp-cron.php regularly.', 'imgsentry' );
            }
            $items[] = $this->make_item(
                'cron-late-' . (int) floor( (int) $next / DAY_IN_SECONDS ),
                'warning',
                'system',
                __( 'Scheduled tasks are not running on time', 'imgsentry' ),
                $detail,
                'scheduled_actions',
                (int) $next
            );
        }
        // 2) The uploads folder cannot be written.
        $upload = wp_upload_dir( null, false );
        if ( !empty( $upload['error'] ) || empty( $upload['basedir'] ) || !wp_is_writable( $upload['basedir'] ) ) {
            $items[] = $this->make_item(
                'uploads-not-writable',
                'error',
                'system',
                __( 'The uploads folder is not writable', 'imgsentry' ),
                __( 'ImgSentry cannot save backups, Trash files or optimized images until WordPress can write to the uploads folder. Ask your host to fix the folder permissions.', 'imgsentry' ),
                'settings',
                0
            );
        }
        return $items;
    }

    /**
     * Result of the latest image optimization run.
     *
     * @return array[]
     */
    private function get_optimization_items() {
        if ( !class_exists( 'ImgSentry_Optimization_Queue' ) || !method_exists( 'ImgSentry_Optimization_Queue', 'get_status_counts' ) ) {
            return array();
        }
        try {
            $q = ImgSentry_Optimization_Queue::get_status_counts();
        } catch ( \Throwable $e ) {
            return array();
        }
        if ( !is_array( $q ) || !empty( $q['is_running'] ) || empty( $q['total'] ) ) {
            return array();
        }
        $finished = ( isset( $q['finished_at'] ) ? (int) $q['finished_at'] : 0 );
        if ( $finished <= 0 || time() - $finished > 3 * DAY_IN_SECONDS ) {
            return array();
        }
        $id = 'optimize-run-' . $finished;
        $failed = ( isset( $q['failed'] ) ? (int) $q['failed'] : 0 );
        $optimized = ( isset( $q['optimized'] ) ? (int) $q['optimized'] : 0 );
        $saved = ( isset( $q['bytes_saved'] ) ? (int) $q['bytes_saved'] : 0 );
        if ( $failed > 0 ) {
            return array($this->make_item(
                $id,
                'error',
                'optimize',
                sprintf( 
                    /* translators: %d: number of images */
                    _n(
                        '%d image could not be optimized',
                        '%d images could not be optimized',
                        $failed,
                        'imgsentry'
                    ),
                    $failed
                 ),
                sprintf( 
                    /* translators: %d: number of images that were optimized */
                    _n(
                        '%d image was optimized. Open Image Optimization to see the reasons for the others.',
                        '%d images were optimized. Open Image Optimization to see the reasons for the others.',
                        $optimized,
                        'imgsentry'
                    ),
                    $optimized
                 ),
                'image_optimization',
                $finished
            ));
        }
        if ( !empty( $q['stop_message'] ) ) {
            return array($this->make_item(
                $id,
                'warning',
                'optimize',
                __( 'Image optimization stopped', 'imgsentry' ),
                wp_strip_all_tags( (string) $q['stop_message'] ),
                'image_optimization',
                $finished
            ));
        }
        if ( $optimized > 0 ) {
            $size_text = ( $saved > 0 ? size_format( $saved ) : false );
            return array($this->make_item(
                $id,
                'success',
                'optimize',
                __( 'Image optimization finished', 'imgsentry' ),
                ( $size_text ? sprintf( 
                    /* translators: 1: number of images, 2: saved space, e.g. 2.4 MB */
                    _n(
                        '%1$d image optimized, %2$s saved.',
                        '%1$d images optimized, %2$s saved.',
                        $optimized,
                        'imgsentry'
                    ),
                    $optimized,
                    $size_text
                 ) : sprintf( 
                    /* translators: %d: number of images */
                    _n(
                        '%d image optimized.',
                        '%d images optimized.',
                        $optimized,
                        'imgsentry'
                    ),
                    $optimized
                 ) ),
                'image_optimization',
                $finished
            ));
        }
        return array();
    }

    /**
     * Trash notices: what the automatic delete removed, and what is about to be removed.
     *
     * @return array[]
     */
    private function get_trash_items() {
        $items = array();
        $settings = ( class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::instance()->get_settings() : array() );
        if ( !is_array( $settings ) ) {
            $settings = array();
        }
        return $items;
    }

}
