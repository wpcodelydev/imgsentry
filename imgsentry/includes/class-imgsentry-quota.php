<?php

/**
 * Central optimization quota for ImgSentry.
 *
 * ALL quota logic lives in this one class (limits, domain rules, billing cycle, usage counter).
 * The real counter now lives on the wpcodely.com server. This class shows the numbers the server last
 * reported (ImgSentry_Cloud_Client::get_quota_snapshot()) and falls back to the constants below only
 * before the first answer from the server. Local counting (record_success) is used only when the
 * local engine optimized an image during a server outage; those images are reported to the server later.
 *
 * Rules (from the product plan; the server is the authority):
 * - Starter (free): 500 image files OR 300 MB per month, whichever fills first. Every image size counts as one file.
 * - Business: 10,000 files OR 4 GB per month (yearly billing: 150,000 files OR 50 GB per year), shared by all sites of the license.
 * - Professional: no limit (fair use).
 * - Bound to the normalized site domain, not to an e-mail address.
 * - Cycle starts at the first account (opt-in) time in UTC and renews monthly on that day/time.
 * - Optimization is blocked on localhost, *.local, *.test, *.localhost, private IPs and "staging" hosts.
 * - Only successful optimizations are counted.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Quota {
    const OPTION_USAGE = 'imgsentry_quota_usage';

    const OPTION_START = 'imgsentry_account_started_at';

    const FREE_IMAGE_LIMIT = 500;

    const FREE_BYTES_LIMIT = 314572800;

    // 300 MB.
    const BUSINESS_IMAGE_LIMIT = 10000;

    const BUSINESS_BYTES_LIMIT = 4294967296;

    // 4 GB (monthly).
    const PROFESSIONAL_IMAGE_LIMIT = null;

    const PROFESSIONAL_BYTES_LIMIT = null;

    /**
     * Error codes returned to callers.
     */
    const CODE_QUOTA = 'quota_exceeded';

    const CODE_DOMAIN = 'domain_not_allowed';

    const CODE_ACCOUNT = 'account_required';

    /**
     * Limits for the current plan. null = unlimited.
     *
     * @return array{images:int|null,bytes:int|null}
     */
    public static function get_limits() {
        $snap = self::snapshot();
        if ( null !== $snap ) {
            return array(
                'images' => $snap['images_limit'],
                'bytes'  => $snap['bytes_limit'],
            );
        }
        $plan = ImgSentry_License::get_plan();
        if ( 'professional' === $plan ) {
            return array(
                'images' => self::PROFESSIONAL_IMAGE_LIMIT,
                'bytes'  => self::PROFESSIONAL_BYTES_LIMIT,
            );
        }
        if ( 'business' === $plan ) {
            return array(
                'images' => self::BUSINESS_IMAGE_LIMIT,
                'bytes'  => self::BUSINESS_BYTES_LIMIT,
            );
        }
        return array(
            'images' => self::FREE_IMAGE_LIMIT,
            'bytes'  => self::FREE_BYTES_LIMIT,
        );
    }

    /**
     * Quota numbers last reported by the server, only while their cycle is still running.
     *
     * @return array|null
     */
    private static function snapshot() {
        if ( !class_exists( 'ImgSentry_Cloud_Client' ) ) {
            return null;
        }
        $snap = ImgSentry_Cloud_Client::get_quota_snapshot();
        if ( null === $snap || (int) $snap['cycle_end'] <= time() ) {
            return null;
        }
        return $snap;
    }

    /**
     * Normalized site domain: lowercase host, no "www.", no port, no trailing dot.
     *
     * @return string
     */
    public static function get_domain() {
        $host = wp_parse_url( home_url(), PHP_URL_HOST );
        $host = ( is_string( $host ) ? strtolower( trim( $host ) ) : '' );
        $host = rtrim( $host, '.' );
        if ( 0 === strpos( $host, 'www.' ) ) {
            $host = substr( $host, 4 );
        }
        return $host;
    }

    /**
     * Whether optimization is forbidden on this host (development / staging environments).
     *
     * @param string|null $host Normalized host; current site by default.
     * @return bool
     */
    public static function is_blocked_domain( $host = null ) {
        if ( defined( 'IMGSENTRY_ALLOW_ANY_DOMAIN' ) && IMGSENTRY_ALLOW_ANY_DOMAIN ) {
            return false;
            // Developer override (wp-config.php) for testing only.
        }
        if ( null === $host ) {
            $host = self::get_domain();
        }
        $host = strtolower( (string) $host );
        if ( '' === $host ) {
            return false;
        }
        if ( 'localhost' === $host ) {
            return true;
        }
        foreach ( array('.localhost', '.local', '.test') as $suffix ) {
            if ( substr( $host, -strlen( $suffix ) ) === $suffix ) {
                return true;
            }
        }
        // A "staging" label only (staging.example.com, shop-staging.example.com); names that merely contain the word, such as mystagingtips.com, are real sites.
        if ( 1 === preg_match( '/(^|[.-])staging([.-]|$)/', $host ) ) {
            return true;
        }
        // IP addresses: only public ones are allowed.
        $bare = trim( $host, '[]' );
        if ( filter_var( $bare, FILTER_VALIDATE_IP ) ) {
            return false === filter_var( $bare, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE );
        }
        return false;
    }

    /**
     * UTC timestamp of the first account (opt-in) moment for this domain.
     *
     * If the Freemius SDK exposes the time the site was connected, use that timestamp (UTC, integer).
     * Otherwise fallback to the stored option timestamp.
     *
     * @return int
     */
    public static function get_account_started_at() {
        // The saved anchor wins. It is set once and survives disconnect / reconnect (a new Freemius install
        // has a new "created" time, which must not restart the monthly cycle). The server's cycle start
        // replaces it whenever a quota snapshot arrives (see ImgSentry_Cloud_Client::store_quota()).
        $start = (int) get_option( self::OPTION_START, 0 );
        if ( $start > 0 ) {
            return $start;
        }
        // First time: use the moment the account was connected, if the SDK knows it.
        if ( function_exists( 'imgsentry_fs' ) && imgsentry_fs()->is_registered() ) {
            $site = imgsentry_fs()->get_site();
            if ( is_object( $site ) && !empty( $site->created ) ) {
                $created_ts = strtotime( $site->created . ' UTC' );
                if ( false !== $created_ts && $created_ts > 0 ) {
                    update_option( self::OPTION_START, (int) $created_ts, false );
                    return (int) $created_ts;
                }
            }
        }
        $start = time();
        update_option( self::OPTION_START, $start, false );
        return $start;
    }

    /**
     * Add whole months to a UTC timestamp, clamping the day (Jan 31 + 1 month = Feb 28/29).
     *
     * @param int $ts     Base timestamp.
     * @param int $months Months to add (>= 0).
     * @return int
     */
    private static function add_months( $ts, $months ) {
        $year = (int) gmdate( 'Y', $ts );
        $month = (int) gmdate( 'n', $ts );
        $day = (int) gmdate( 'j', $ts );
        $hour = (int) gmdate( 'G', $ts );
        $min = (int) gmdate( 'i', $ts );
        $sec = (int) gmdate( 's', $ts );
        $total = $month - 1 + max( 0, (int) $months );
        $year += intdiv( $total, 12 );
        $month = $total % 12 + 1;
        $days_in_month = (int) gmdate( 't', gmmktime(
            0,
            0,
            0,
            $month,
            1,
            $year
        ) );
        return gmmktime(
            $hour,
            $min,
            $sec,
            $month,
            min( $day, $days_in_month ),
            $year
        );
    }

    /**
     * Current billing cycle boundaries (UTC timestamps).
     *
     * @return array{start:int,end:int}
     */
    public static function get_cycle() {
        $snap = self::snapshot();
        if ( null !== $snap && (int) $snap['cycle_start'] > 0 ) {
            return array(
                'start' => (int) $snap['cycle_start'],
                'end'   => (int) $snap['cycle_end'],
            );
        }
        $account_start = self::get_account_started_at();
        $now = time();
        if ( $now < $account_start ) {
            return array(
                'start' => $account_start,
                'end'   => self::add_months( $account_start, 1 ),
            );
        }
        $n = ((int) gmdate( 'Y', $now ) - (int) gmdate( 'Y', $account_start )) * 12 + ((int) gmdate( 'n', $now ) - (int) gmdate( 'n', $account_start ));
        $n = max( 0, $n );
        while ( $n > 0 && self::add_months( $account_start, $n ) > $now ) {
            $n--;
        }
        while ( self::add_months( $account_start, $n + 1 ) <= $now ) {
            $n++;
        }
        return array(
            'start' => self::add_months( $account_start, $n ),
            'end'   => self::add_months( $account_start, $n + 1 ),
        );
    }

    /**
     * Usage for the current cycle and domain. Starts from zero in a new cycle / on a new domain.
     *
     * Normally the numbers come from the server (shared by all sites of one Business license). The local counter is used only before the first server answer or during a server outage.
     *
     * @return array{images:int,bytes:int,cycle_start:int,domain:string}
     */
    public static function get_usage() {
        $cycle = self::get_cycle();
        $domain = self::get_domain();
        $snap = self::snapshot();
        if ( null !== $snap ) {
            return array(
                'images'      => max( 0, (int) $snap['images_used'] ),
                'bytes'       => max( 0, (int) $snap['bytes_used'] ),
                'cycle_start' => (int) $cycle['start'],
                'domain'      => $domain,
            );
        }
        $stored = get_option( self::OPTION_USAGE, array() );
        if ( !is_array( $stored ) || !isset( $stored['cycle_start'], $stored['domain'] ) || (int) $stored['cycle_start'] !== (int) $cycle['start'] || (string) $stored['domain'] !== $domain ) {
            return array(
                'images'      => 0,
                'bytes'       => 0,
                'cycle_start' => (int) $cycle['start'],
                'domain'      => $domain,
            );
        }
        return array(
            'images'      => max( 0, (int) (( isset( $stored['images'] ) ? $stored['images'] : 0 )) ),
            'bytes'       => max( 0, (int) (( isset( $stored['bytes'] ) ? $stored['bytes'] : 0 )) ),
            'cycle_start' => (int) $cycle['start'],
            'domain'      => $domain,
        );
    }

    /**
     * Whether the plan limits are used up.
     *
     * @return bool
     */
    public static function is_exhausted() {
        $limits = self::get_limits();
        if ( null === $limits['images'] && null === $limits['bytes'] ) {
            return false;
        }
        $usage = self::get_usage();
        if ( null !== $limits['images'] && $usage['images'] >= $limits['images'] ) {
            return true;
        }
        if ( null !== $limits['bytes'] && $usage['bytes'] >= $limits['bytes'] ) {
            return true;
        }
        return false;
    }

    /**
     * Central pre-check used before every optimization.
     *
     * @return array|null null when optimization is allowed, otherwise array( 'code' => string, 'message' => string ).
     */
    public static function check_can_optimize() {
        if ( self::is_blocked_domain() ) {
            return array(
                'code'    => self::CODE_DOMAIN,
                'message' => __( 'Image optimization is turned off on local, test and staging sites. Use it on your live domain.', 'imgsentry' ),
            );
        }
        // Account (Freemius opt-in) is required only for optimization.
        $skip_account_check = false;
        // Developer test override. Inside a premium-only block so Freemius removes it from the free build.
        if ( function_exists( 'imgsentry_fs' ) ) {
        }
        if ( !$skip_account_check && function_exists( 'imgsentry_fs' ) && !imgsentry_fs()->is_registered() ) {
            return array(
                'code'    => self::CODE_ACCOUNT,
                'message' => __( 'Connect your free ImgSentry account to start optimizing images.', 'imgsentry' ),
            );
        }
        if ( self::is_exhausted() ) {
            $cycle = self::get_cycle();
            return array(
                'code'    => self::CODE_QUOTA,
                'message' => sprintf( 
                    /* translators: %s: date when the quota renews */
                    __( 'Your monthly optimization quota is used up. It renews on %s (UTC), or upgrade to Pro for unlimited optimization.', 'imgsentry' ),
                    gmdate( 'M j, Y H:i', (int) $cycle['end'] )
                 ),
            );
        }
        return null;
    }

    /**
     * Count one image optimized by the LOCAL engine (server outage fallback only).
     * Cloud optimizations are counted by the server, never here.
     *
     * @param int $original_bytes Size of the source image that was processed.
     * @return void
     */
    public static function record_success( $original_bytes ) {
        $usage = self::get_usage();
        $usage['images'] += 1;
        $usage['bytes'] += max( 0, (int) $original_bytes );
        update_option( self::OPTION_USAGE, $usage, false );
    }

    /**
     * Build the failure array the optimizer engine returns when quota/domain rules block it.
     * Deliberately does NOT mark the attachment as "failed" in postmeta (it is not the image's fault).
     *
     * @param int   $attachment_id Attachment ID.
     * @param array $block         Result of check_can_optimize().
     * @return array
     */
    public static function format_block_result( $attachment_id, array $block ) {
        return array(
            'success'       => false,
            'attachment_id' => (int) $attachment_id,
            'original_size' => 0,
            'new_size'      => 0,
            'bytes_saved'   => 0,
            'percent_saved' => 0,
            'backup_path'   => '',
            'has_backup'    => false,
            'new_filepath'  => '',
            'output_format' => '',
            'engine_used'   => '',
            'error'         => $block['message'],
            'error_code'    => $block['code'],
            'quota'         => self::get_status(),
        );
    }

    /**
     * Snapshot for the browser (usage bar and notifications).
     *
     * @return array
     */
    public static function get_status() {
        if ( class_exists( 'ImgSentry_Cloud_Client' ) ) {
            ImgSentry_Cloud_Client::maybe_refresh_quota();
        }
        $limits = self::get_limits();
        $usage = self::get_usage();
        $cycle = self::get_cycle();
        $block = self::is_blocked_domain();
        $plan = ImgSentry_License::get_plan();
        $percent = 0;
        if ( null !== $limits['images'] && $limits['images'] > 0 ) {
            $percent = max( $percent, $usage['images'] / $limits['images'] * 100 );
        }
        if ( null !== $limits['bytes'] && $limits['bytes'] > 0 ) {
            $percent = max( $percent, $usage['bytes'] / $limits['bytes'] * 100 );
        }
        $account = ImgSentry_License::get_account_state();
        return array(
            'plan'              => $plan,
            'unlimited'         => null === $limits['images'] && null === $limits['bytes'],
            'images_used'       => (int) $usage['images'],
            'images_limit'      => $limits['images'],
            'bytes_used'        => (int) $usage['bytes'],
            'bytes_limit'       => $limits['bytes'],
            'percent'           => (int) min( 100, floor( $percent ) ),
            'exhausted'         => self::is_exhausted(),
            'domain_blocked'    => $block,
            'domain'            => self::get_domain(),
            'cycle_start'       => (int) $cycle['start'],
            'cycle_end'         => (int) $cycle['end'],
            'account_connected' => (bool) $account['connected'],
            'account_url'       => (string) $account['url'],
            'account_state'     => (string) $account['state'],
            'license_active'    => (bool) $account['license_active'],
            'cloud'             => ( class_exists( 'ImgSentry_Cloud_Client' ) ? ImgSentry_Cloud_Client::get_notice_state() : array(
                'down'                => false,
                'fallback_active'     => false,
                'fallback_used_today' => 0,
            ) ),
        );
    }

}
