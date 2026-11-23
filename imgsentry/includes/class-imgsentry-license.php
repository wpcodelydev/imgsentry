<?php

/**
 * Central Free / Pro gate for ImgSentry.
 *
 * Every Pro check in the plugin goes through ImgSentry_License::can_use().
 *
 * FREE build: get_plan() always returns 'free'. There is no filter or option that can change it.
 * PREMIUM build: a small block inside get_plan() asks a class that exists only in the premium zip
 * for the real plan. Freemius removes that block and that class when it generates the free zip.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_License {
    /**
     * Default "Upgrade" link: the pricing page on wpcodely.com. Change here (or via the imgsentry_upgrade_url filter).
     */
    const UPGRADE_URL = 'https://wpcodely.com/plugin/imgsentry/';

    /**
     * Pro-only features. Keys MUST match window.imgsentry_data.features in the React app (ProLock.tsx).
     *
     * @return array feature => human readable label.
     */
    public static function get_pro_features() {
        return array(
            'trash_bulk_actions'     => __( 'Bulk actions in Trash (bulk delete, bulk restore, Empty Trash)', 'imgsentry' ),
            'trash_auto_purge'       => __( 'Scheduled auto-delete of Trash', 'imgsentry' ),
            'file_manager'           => __( 'File Manager', 'imgsentry' ),
            'scheduled_scan'         => __( 'Scheduled Scan', 'imgsentry' ),
            'auto_trash_unused'      => __( 'Auto-Trash Unused Files', 'imgsentry' ),
            'duplicate_replace_refs' => __( 'Replace references of duplicate images', 'imgsentry' ),
            'webhook'                => __( 'Scan webhook', 'imgsentry' ),
            'media_trends'           => __( 'Media Trends and daily snapshots', 'imgsentry' ),
            'local_fallback'         => __( 'Optimize on your own site when the server is unreachable', 'imgsentry' ),
        );
    }

    /**
     * Get the current plan for the site: 'free', 'business', or 'professional'.
     *
     * @return string 'free'|'business'|'professional'
     */
    public static function get_plan() {
        $plan = 'free';
        if ( function_exists( 'imgsentry_fs' ) ) {
        }
        return $plan;
    }

    /**
     * Credentials for the ImgSentry optimization server.
     *
     * Paid plans send the license key. Everyone else (Starter) sends the Freemius install secret of this site.
     * The license-key part sits inside the premium-only block, so the free zip never contains it.
     *
     * @return array{authorization:string,install:string}|null null when this site has no account yet.
     */
    public static function get_cloud_auth() {
        if ( !function_exists( 'imgsentry_fs' ) ) {
            return null;
        }
        $site = imgsentry_fs()->get_site();
        $install_id = ( is_object( $site ) && !empty( $site->id ) ? (string) $site->id : '' );
        if ( '' !== $install_id && is_object( $site ) && !empty( $site->secret_key ) ) {
            return array(
                'authorization' => 'Install ' . (string) $site->secret_key,
                'install'       => $install_id,
            );
        }
        return null;
    }

    /**
     * One place that describes the Freemius account state of this site.
     *
     * state: 'connected' (registered), 'skipped' (user chose Skip), 'pending' (waiting for the e-mail
     * confirmation) or 'disconnected' (not registered; activation / connect screen).
     * url:   Account page when connected, otherwise the SDK link that reopens the connect screen
     *        (get_reconnect_url clears both skipped and pending mode).
     * license_active: false only when the Premium code is running but the license is not active
     *        (for example after "Deactivate License"). The Free build never needs a license, so it is true there.
     *
     * @return array{state:string,connected:bool,license_active:bool,url:string,label:string}
     */
    public static function get_account_state() {
        $state = 'disconnected';
        $connected = false;
        $license_active = true;
        $url = '';
        $has_sdk = function_exists( 'imgsentry_fs' );
        $fs = ( $has_sdk ? imgsentry_fs() : null );
        if ( !$has_sdk ) {
            // No SDK loaded: nothing to connect to. Same as the previous behavior (never blocks the UI).
            $state = 'connected';
            $connected = true;
        }
        if ( is_object( $fs ) ) {
            $registered = ( method_exists( $fs, 'is_registered' ) ? (bool) $fs->is_registered() : false );
            if ( $registered ) {
                $state = 'connected';
                $connected = true;
                $url = ( method_exists( $fs, 'get_account_url' ) ? (string) $fs->get_account_url() : '' );
                if ( method_exists( $fs, 'is_premium' ) && $fs->is_premium() && method_exists( $fs, 'can_use_premium_code' ) ) {
                    $license_active = (bool) $fs->can_use_premium_code();
                    // Premium zip activated without a license: the SDK shows its own license screen on the top page
                    // and removes the Account page, so the Account URL would be a dead end. Use the activation URL.
                    if ( !$license_active && method_exists( $fs, 'is_activation_mode' ) && method_exists( $fs, 'get_activation_url' ) && $fs->is_activation_mode() ) {
                        $url = (string) $fs->get_activation_url();
                    }
                }
            } elseif ( method_exists( $fs, 'is_anonymous' ) && $fs->is_anonymous() ) {
                $state = 'skipped';
                $url = ( method_exists( $fs, 'get_reconnect_url' ) ? (string) $fs->get_reconnect_url() : '' );
            } elseif ( method_exists( $fs, 'is_pending_activation' ) && $fs->is_pending_activation() ) {
                $state = 'pending';
                $url = ( method_exists( $fs, 'get_reconnect_url' ) ? (string) $fs->get_reconnect_url() : '' );
            } else {
                $url = ( method_exists( $fs, 'get_activation_url' ) ? (string) $fs->get_activation_url() : '' );
            }
        }
        // Developer test override. Inside a premium-only block so Freemius removes it from the free build.
        if ( function_exists( 'imgsentry_fs' ) ) {
        }
        return array(
            'state'          => $state,
            'connected'      => $connected,
            'license_active' => $license_active,
            'url'            => $url,
            'label'          => ( $connected ? __( 'Account', 'imgsentry' ) : __( 'Connect Account', 'imgsentry' ) ),
        );
    }

    /**
     * Whether this site has an active Pro license.
     *
     * @return bool
     */
    public static function is_pro() {
        return 'free' !== self::get_plan();
    }

    /**
     * Whether a feature may be used on this site.
     *
     * @param string $feature Feature key from get_pro_features().
     * @return bool
     */
    public static function can_use( $feature ) {
        $feature = (string) $feature;
        // File Manager is a Professional-plan feature (not Business).
        if ( 'file_manager' === $feature ) {
            return 'professional' === self::get_plan();
        }
        if ( array_key_exists( $feature, self::get_pro_features() ) ) {
            return self::is_pro();
        }
        // Unknown keys are treated as Pro-only so a typo can never open a Pro feature.
        return self::is_pro();
    }

    /**
     * Whether the File Manager is switched on for this site: Professional plan AND the Administrator
     * turned it ON in Settings > General. Every File Manager entry point (menu, page, AJAX, e-mails) uses this.
     * The saved ON/OFF value is never changed by a plan change; it simply stops counting while the plan is not Professional.
     *
     * @return bool
     */
    public static function file_manager_active() {
        if ( !self::can_use( 'file_manager' ) ) {
            return false;
        }
        if ( !class_exists( 'ImgSentry_Settings' ) ) {
            return false;
        }
        $settings = ImgSentry_Settings::instance()->get_settings();
        return is_array( $settings ) && !empty( $settings['enableFileManager'] );
    }

    /**
     * Upgrade URL: the ONE place that builds every Upgrade link in the plugin.
     *
     * Adds only safe query args: utm_source, utm_medium (where the click happened), feature,
     * current_plan and plan (the plan to highlight on the pricing page). Never adds license keys,
     * e-mails or any personal data.
     *
     * @param string $context Where the click happened, e.g. quota_bar, trash_lock, dashboard_card.
     * @param string $feature Feature key, if the click came from a locked feature.
     * @return string
     */
    public static function get_upgrade_url( $context = '', $feature = '' ) {
        $context = sanitize_key( (string) $context );
        $feature = sanitize_key( (string) $feature );
        $plan = self::get_plan();
        $base = (string) apply_filters(
            'imgsentry_upgrade_url',
            self::UPGRADE_URL,
            $context,
            $feature
        );
        $args = array(
            'utm_source'   => 'plugin',
            'current_plan' => $plan,
        );
        if ( 'professional' !== $plan ) {
            $args['plan'] = ( 'business' === $plan ? 'professional' : 'business' );
        }
        if ( '' !== $context ) {
            $args['utm_medium'] = $context;
        }
        if ( '' !== $feature ) {
            $args['feature'] = $feature;
        }
        return esc_url_raw( add_query_arg( $args, $base ) );
    }

    /**
     * Whether an Upgrade button should be shown (everyone except Professional).
     *
     * @return bool
     */
    public static function can_upgrade() {
        return 'professional' !== self::get_plan();
    }

    /**
     * Values handed to the browser (merged into window.imgsentry_data).
     *
     * @return array
     */
    public static function get_client_data() {
        $features = array();
        foreach ( array_keys( self::get_pro_features() ) as $feature ) {
            $features[$feature] = self::can_use( $feature );
        }
        return array(
            'is_pro'      => self::is_pro(),
            'plan'        => self::get_plan(),
            'features'    => $features,
            'upgrade_url' => self::get_upgrade_url(),
        );
    }

    /**
     * Send the standard 403 "pro_required" JSON response and stop.
     * Shape (fixed contract with the React app): { success:false, data:{ code, feature, message } }
     *
     * @param string $feature Feature key.
     * @param string $message Optional custom message.
     * @return void
     */
    public static function deny( $feature, $message = '' ) {
        $features = self::get_pro_features();
        if ( '' === $message ) {
            $label = ( isset( $features[$feature] ) ? $features[$feature] : (string) $feature );
            $message = sprintf( 
                /* translators: %s: feature name */
                __( '%s requires ImgSentry Pro.', 'imgsentry' ),
                $label
             );
        }
        wp_send_json_error( array(
            'code'    => 'pro_required',
            'feature' => (string) $feature,
            'message' => $message,
        ), 403 );
        exit;
    }

    /**
     * Stop the request with pro_required unless the feature is available.
     *
     * @param string $feature Feature key.
     * @param string $message Optional custom message.
     * @return void
     */
    public static function require_feature( $feature, $message = '' ) {
        if ( !self::can_use( $feature ) ) {
            self::deny( $feature, $message );
        }
    }

}
