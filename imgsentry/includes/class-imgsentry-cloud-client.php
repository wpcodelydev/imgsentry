<?php

/**
 * ImgSentry cloud optimizer client.
 *
 * Talks to the wpcodely.com optimization server (API v1). Every plan (Free, Business, Professional)
 * optimizes there. This class only does the network work and the "what to do when the server is
 * not reachable" decisions. The engine (class-imgsentry-optimizer-engine.php) decides what to send.
 *
 * Rules implemented here:
 * - Server unreachable: first RETRY_WINDOW seconds => ask the caller to retry later ("retry"),
 *   then, on the Business and Professional plans (Premium build only) and if the user allows it, optimize on the
 *   site with the local engine ("fallback"), with a daily cap. The Free build has no fallback: it reports a failure.
 * - Fallback is used ONLY for connection failures, timeouts and 5xx. Never for quota_exceeded or an
 *   invalid / inactive license.
 * - Images optimized locally during an outage are reported to the server later (POST /v1/quota/consume).
 * - Quota numbers shown in the admin come from GET /v1/license/status (cached snapshot, no network on page load).
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Cloud_Client {
    const DEFAULT_URL = 'https://api.wpcodely.com';

    const RETRY_WINDOW = 300;

    // Seconds the server may be down before the local fallback is allowed.
    const MAX_BYTES = 20971520;

    // 20 MiB, the server limit.
    const POLL_DEADLINE = 90;

    // Seconds to wait for one batch of jobs.
    const BATCH_SIZE = 4;

    // Jobs sent at the same time (the server allows 5 at once per license).
    const OPT_DOWN_SINCE = 'imgsentry_cloud_down_since';

    const OPT_QUOTA = 'imgsentry_cloud_quota';

    const OPT_PENDING = 'imgsentry_cloud_pending_consume';

    const OPT_FALLBACK = 'imgsentry_cloud_fallback_day';

    const OPT_NOTICE = 'imgsentry_cloud_notice';

    /**
     * Server base URL (no trailing slash). Override with IMGSENTRY_CLOUD_URL in wp-config.php for testing.
     *
     * @return string
     */
    public static function base_url() {
        $url = ( defined( 'IMGSENTRY_CLOUD_URL' ) ? (string) IMGSENTRY_CLOUD_URL : self::DEFAULT_URL );
        return untrailingslashit( esc_url_raw( $url ) );
    }

    /**
     * Whether the cloud path can be used at all on this site (an account/licence to authenticate with exists).
     *
     * @return bool
     */
    public static function is_enabled() {
        if ( defined( 'IMGSENTRY_DISABLE_CLOUD' ) && IMGSENTRY_DISABLE_CLOUD ) {
            return false;
        }
        return null !== ImgSentry_License::get_cloud_auth();
    }

    /**
     * Whether this source file can be sent to the server (type and size limits). Others are optimized locally.
     *
     * @param string $path  File path.
     * @param string $mime  MIME type.
     * @param int    $bytes File size.
     * @return bool
     */
    public static function can_handle( $path, $mime, $bytes ) {
        $bytes = (int) $bytes;
        if ( $bytes <= 0 || $bytes > self::MAX_BYTES ) {
            return false;
        }
        $ext = strtolower( pathinfo( (string) $path, PATHINFO_EXTENSION ) );
        return in_array( (string) $mime, array(
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif'
        ), true ) || in_array( $ext, array(
            'jpg',
            'jpeg',
            'png',
            'webp',
            'gif'
        ), true );
    }

    // ------------------------------------------------------------------
    // HTTP
    // ------------------------------------------------------------------
    /**
     * Request headers for this site.
     *
     * @return array
     */
    private static function headers() {
        $auth = ImgSentry_License::get_cloud_auth();
        if ( null === $auth ) {
            return array();
        }
        return array(
            'Authorization'       => $auth['authorization'],
            'X-ImgSentry-Install' => $auth['install'],
            'X-ImgSentry-Site'    => ImgSentry_Quota::get_domain(),
            'X-ImgSentry-Version' => ( defined( 'IMGSENTRY_VERSION' ) ? (string) IMGSENTRY_VERSION : '' ),
            'Accept'              => 'application/json',
        );
    }

    /**
     * One API call. Never throws.
     *
     * @param string $method  GET|POST|DELETE.
     * @param string $path    Path starting with /v1.
     * @param array  $args    Extra wp_remote_request args (body, timeout, headers, stream, filename).
     * @return array{conn:bool,status:int,data:array,retry_after:int,error:string}
     */
    private static function call( $method, $path, array $args = array() ) {
        $headers = self::headers();
        if ( empty( $headers ) ) {
            return array(
                'conn'        => false,
                'status'      => 0,
                'data'        => array(),
                'retry_after' => 0,
                'error'       => 'no_auth',
            );
        }
        $extra_headers = ( isset( $args['headers'] ) && is_array( $args['headers'] ) ? $args['headers'] : array() );
        unset($args['headers']);
        $req = array_merge( array(
            'method'      => $method,
            'timeout'     => 20,
            'redirection' => 0,
            'sslverify'   => true,
            'headers'     => array_merge( $headers, $extra_headers ),
        ), $args );
        $res = wp_remote_request( self::base_url() . $path, $req );
        if ( is_wp_error( $res ) ) {
            return array(
                'conn'        => false,
                'status'      => 0,
                'data'        => array(),
                'retry_after' => 0,
                'error'       => $res->get_error_message(),
            );
        }
        $status = (int) wp_remote_retrieve_response_code( $res );
        $data = array();
        if ( empty( $args['stream'] ) ) {
            $decoded = json_decode( (string) wp_remote_retrieve_body( $res ), true );
            $data = ( is_array( $decoded ) ? $decoded : array() );
        }
        return array(
            'conn'        => true,
            'status'      => $status,
            'data'        => $data,
            'retry_after' => (int) wp_remote_retrieve_header( $res, 'retry-after' ),
            'error'       => '',
        );
    }

    /**
     * Turn a failed call into the standard failure array used by the engine.
     *
     * @param array $r Result of call().
     * @return array
     */
    private static function failure( array $r ) {
        $code = ( isset( $r['data']['code'] ) ? (string) $r['data']['code'] : '' );
        $message = ( isset( $r['data']['message'] ) ? (string) $r['data']['message'] : '' );
        // Server not reachable, or broken on its side (5xx).
        if ( !$r['conn'] || $r['status'] >= 500 ) {
            return array(
                'ok'          => false,
                'code'        => 'cloud_unavailable',
                'message'     => __( 'The ImgSentry optimization server is not reachable.', 'imgsentry' ),
                'unavailable' => true,
                'stop'        => false,
                'local_ok'    => false,
                'retry_after' => (int) $r['retry_after'],
            );
        }
        if ( 429 === $r['status'] ) {
            return array(
                'ok'          => false,
                'code'        => 'cloud_busy',
                'message'     => __( 'The optimization server asked to slow down. ImgSentry will try again shortly.', 'imgsentry' ),
                'unavailable' => false,
                'stop'        => false,
                'busy'        => true,
                'local_ok'    => false,
                'retry_after' => max( 5, (int) $r['retry_after'] ),
            );
        }
        if ( 409 === $r['status'] && 'quota_exceeded' === $code ) {
            if ( isset( $r['data']['quota'] ) && is_array( $r['data']['quota'] ) ) {
                self::store_quota( $r['data']['quota'], null, true );
            }
            return array(
                'ok'          => false,
                'code'        => 'quota_exceeded',
                'message'     => __( 'Your optimization quota is used up. It renews at the start of your next cycle, or upgrade your plan for more.', 'imgsentry' ),
                'unavailable' => false,
                'stop'        => true,
                'local_ok'    => false,
                'retry_after' => 0,
            );
        }
        if ( in_array( $code, array(
            'invalid_license',
            'license_inactive',
            'plan_not_allowed',
            'site_mismatch',
            'site_limit_reached'
        ), true ) ) {
            if ( 'invalid_license' === $code ) {
                $msg = __( 'Your ImgSentry account could not be verified. Open the Account page to check it, or disconnect and connect it again.', 'imgsentry' );
            } elseif ( 'site_mismatch' === $code ) {
                // The address of this site differs from the address registered with the connected account.
                $msg = __( 'The address of this site does not match the connected ImgSentry account. Open the Account page and connect the account again.', 'imgsentry' );
            } elseif ( 'site_limit_reached' === $code ) {
                // The connected account already uses the Free plan on the maximum number of websites.
                $msg = __( 'This ImgSentry account already uses the Free plan on the maximum number of websites. Upgrade to Business or Professional to add more websites.', 'imgsentry' );
            } elseif ( 'plan_not_allowed' === $code ) {
                // The server sends this for free sites on local, test or IP-address hosts. It is not about a license.
                $msg = __( 'Image optimization is not available for local, test or IP-address sites. Use it on your live domain.', 'imgsentry' );
            } else {
                $msg = __( 'Your ImgSentry license is not active. Renew it to keep optimizing images.', 'imgsentry' );
            }
            return array(
                'ok'          => false,
                'code'        => $code,
                'message'     => $msg,
                'unavailable' => false,
                'stop'        => true,
                'local_ok'    => false,
                'retry_after' => 0,
            );
        }
        // The server cannot process this particular file (type, size, pixels): the local engine can try.
        if ( in_array( $code, array('file_too_large', 'unsupported_type', 'image_too_large_pixels'), true ) ) {
            return array(
                'ok'          => false,
                'code'        => $code,
                'message'     => ( '' !== $message ? $message : __( 'The optimization server cannot process this file.', 'imgsentry' ) ),
                'unavailable' => false,
                'stop'        => false,
                'local_ok'    => true,
                'retry_after' => 0,
            );
        }
        return array(
            'ok'          => false,
            'code'        => ( '' !== $code ? $code : 'cloud_error' ),
            'message'     => ( '' !== $message ? $message : __( 'The optimization server returned an error.', 'imgsentry' ) ),
            'unavailable' => false,
            'stop'        => false,
            'local_ok'    => false,
            'retry_after' => 0,
        );
    }

    // ------------------------------------------------------------------
    // Optimization jobs
    // ------------------------------------------------------------------
    /**
     * Optimize several files. Files are sent in small groups (BATCH_SIZE at a time).
     *
     * @param array $items Map key => array( 'path' => string, 'bytes' => int ).
     * @param array $opts  array( 'formats' => string[], 'level' => string, 'keep_metadata' => bool ).
     * @param bool  $refresh_quota Fetch the quota numbers once the work is done (skip while more files follow).
     * @return array Map key => array( 'ok' => true, 'files' => array( format => tmp path ), 'sizes' => array( format => bytes ), 'no_gain' => array( format => bool ) )
     *               or a failure array (see failure()). After a stop/unavailable failure the remaining items get the same failure.
     */
    public static function process_files( array $items, array $opts, $refresh_quota = true ) {
        $out = array();
        $chunks = array_chunk( $items, self::BATCH_SIZE, true );
        $abort = null;
        foreach ( $chunks as $chunk ) {
            if ( null !== $abort ) {
                foreach ( $chunk as $key => $unused ) {
                    $out[$key] = $abort;
                }
                continue;
            }
            $res = self::process_chunk( $chunk, $opts );
            foreach ( $res as $key => $r ) {
                $out[$key] = $r;
                if ( empty( $r['ok'] ) && (!empty( $r['stop'] ) || !empty( $r['unavailable'] ) || !empty( $r['busy'] )) && null === $abort ) {
                    $abort = $r;
                }
            }
        }
        $any_ok = false;
        foreach ( $out as $r ) {
            if ( !empty( $r['ok'] ) ) {
                $any_ok = true;
                break;
            }
        }
        if ( $any_ok ) {
            self::mark_server_up();
            if ( $refresh_quota ) {
                self::refresh_quota( true );
            }
        }
        return $out;
    }

    /**
     * Several API calls at the same time (one round trip instead of one per call).
     * Uses WordPress' own Requests library; falls back to one call after the other when it is not available.
     *
     * @param array $requests Map key => array( 'method', 'path', 'body'?, 'headers'?, 'timeout'?, 'filename'? ).
     * @return array Map key => array( conn, status, data, retry_after, error ) like call().
     */
    private static function multi( array $requests ) {
        $out = array();
        if ( empty( $requests ) ) {
            return $out;
        }
        $class = '';
        if ( class_exists( '\\WpOrg\\Requests\\Requests' ) ) {
            $class = '\\WpOrg\\Requests\\Requests';
        } elseif ( class_exists( 'Requests' ) ) {
            $class = 'Requests';
        }
        $headers = self::headers();
        if ( '' !== $class && count( $requests ) > 1 && !empty( $headers ) ) {
            try {
                $verify = ( defined( 'WPINC' ) && file_exists( ABSPATH . WPINC . '/certificates/ca-bundle.crt' ) ? ABSPATH . WPINC . '/certificates/ca-bundle.crt' : true );
                $batch = array();
                foreach ( $requests as $key => $rq ) {
                    $item = array(
                        'url'     => self::base_url() . $rq['path'],
                        'type'    => $rq['method'],
                        'headers' => array_merge( $headers, ( isset( $rq['headers'] ) ? $rq['headers'] : array() ) ),
                        'data'    => ( isset( $rq['body'] ) ? $rq['body'] : array() ),
                        'options' => array(
                            'timeout'          => ( isset( $rq['timeout'] ) ? (int) $rq['timeout'] : 20 ),
                            'connect_timeout'  => 10,
                            'follow_redirects' => false,
                            'verify'           => $verify,
                        ),
                    );
                    if ( !empty( $rq['filename'] ) ) {
                        $item['options']['filename'] = $rq['filename'];
                    }
                    $batch[$key] = $item;
                }
                $responses = call_user_func( array($class, 'request_multiple'), $batch, array(
                    'timeout' => 60,
                    'verify'  => $verify,
                ) );
                foreach ( $batch as $key => $unused ) {
                    $r = ( isset( $responses[$key] ) ? $responses[$key] : null );
                    if ( is_object( $r ) && isset( $r->status_code ) ) {
                        $data = array();
                        if ( empty( $requests[$key]['filename'] ) ) {
                            $decoded = json_decode( (string) $r->body, true );
                            $data = ( is_array( $decoded ) ? $decoded : array() );
                        }
                        $retry = 0;
                        if ( isset( $r->headers['retry-after'] ) ) {
                            $retry = (int) $r->headers['retry-after'];
                        }
                        $out[$key] = array(
                            'conn'        => true,
                            'status'      => (int) $r->status_code,
                            'data'        => $data,
                            'retry_after' => $retry,
                            'error'       => '',
                        );
                    } else {
                        $out[$key] = array(
                            'conn'        => false,
                            'status'      => 0,
                            'data'        => array(),
                            'retry_after' => 0,
                            'error'       => ( is_object( $r ) && method_exists( $r, 'getMessage' ) ? $r->getMessage() : 'request failed' ),
                        );
                    }
                }
                return $out;
            } catch ( \Throwable $e ) {
                $out = array();
                // Fall through to the one-by-one way.
            }
        }
        foreach ( $requests as $key => $rq ) {
            $args = array(
                'timeout' => ( isset( $rq['timeout'] ) ? (int) $rq['timeout'] : 20 ),
            );
            if ( isset( $rq['body'] ) ) {
                $args['body'] = $rq['body'];
            }
            if ( isset( $rq['headers'] ) ) {
                $args['headers'] = $rq['headers'];
            }
            if ( !empty( $rq['filename'] ) ) {
                $args['stream'] = true;
                $args['filename'] = $rq['filename'];
            }
            $out[$key] = self::call( $rq['method'], $rq['path'], $args );
        }
        return $out;
    }

    /**
     * Build the "create job" request for one file.
     *
     * @param string $path File to send.
     * @param array  $opts Options.
     * @return array Request array for multi(), or a failure array (has key 'ok').
     */
    private static function build_create_request( $path, array $opts ) {
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- The file can be unreadable on some hosts; the result is checked below.
        $contents = @file_get_contents( $path );
        if ( false === $contents || '' === $contents ) {
            return array(
                'ok'          => false,
                'code'        => 'file_unreadable',
                'message'     => __( 'The image file could not be read.', 'imgsentry' ),
                'unavailable' => false,
                'stop'        => false,
                'local_ok'    => false,
                'retry_after' => 0,
            );
        }
        $options = array(
            'request_id'    => 'is-' . wp_generate_uuid4(),
            'formats'       => array_values( $opts['formats'] ),
            'level'         => $opts['level'],
            'keep_metadata' => !empty( $opts['keep_metadata'] ),
        );
        $boundary = 'imgsentry' . wp_generate_password( 24, false, false );
        $ext = strtolower( preg_replace( '/[^a-z0-9]/i', '', (string) pathinfo( $path, PATHINFO_EXTENSION ) ) );
        $name = 'image.' . (( '' !== $ext ? $ext : 'bin' ));
        $body = '--' . $boundary . "\r\n";
        $body .= 'Content-Disposition: form-data; name="options"' . "\r\n\r\n";
        $body .= wp_json_encode( $options ) . "\r\n";
        $body .= '--' . $boundary . "\r\n";
        $body .= 'Content-Disposition: form-data; name="file"; filename="' . $name . '"' . "\r\n";
        $body .= 'Content-Type: application/octet-stream' . "\r\n\r\n";
        $body .= $contents . "\r\n";
        $body .= '--' . $boundary . '--' . "\r\n";
        return array(
            'method'  => 'POST',
            'path'    => '/v1/optimize/jobs',
            'timeout' => 60,
            'body'    => $body,
            'headers' => array(
                'Content-Type' => 'multipart/form-data; boundary=' . $boundary,
            ),
        );
    }

    /**
     * Create, wait for and download one group of jobs. Every step talks to the server for the whole group at once.
     *
     * @param array $chunk Items.
     * @param array $opts  Options.
     * @return array
     */
    private static function process_chunk( array $chunk, array $opts ) {
        $out = array();
        $create = array();
        foreach ( $chunk as $key => $item ) {
            $rq = self::build_create_request( $item['path'], $opts );
            if ( isset( $rq['ok'] ) ) {
                $out[$key] = $rq;
            } else {
                $create[$key] = $rq;
            }
        }
        // 1. Create all jobs at once.
        $jobs = array();
        foreach ( self::multi( $create ) as $key => $r ) {
            if ( $r['conn'] && 202 === $r['status'] && !empty( $r['data']['job_id'] ) ) {
                $jobs[$key] = (string) $r['data']['job_id'];
            } else {
                $out[$key] = self::failure( $r );
            }
        }
        unset($create);
        // 2. Wait until they are done (one status call per job, all at once, first look after a short pause).
        $deadline = time() + self::POLL_DEADLINE;
        $wait = 250000;
        // microseconds.
        $pending = $jobs;
        $done = array();
        while ( !empty( $pending ) && time() < $deadline ) {
            usleep( $wait );
            $wait = min( 1500000, (int) ($wait * 1.6) );
            $polls = array();
            foreach ( $pending as $key => $job_id ) {
                $polls[$key] = array(
                    'method'  => 'GET',
                    'path'    => '/v1/optimize/jobs/' . rawurlencode( $job_id ),
                    'timeout' => 15,
                );
            }
            foreach ( self::multi( $polls ) as $key => $r ) {
                if ( !$r['conn'] || 200 !== $r['status'] ) {
                    $out[$key] = self::failure( $r );
                    unset($pending[$key]);
                    continue;
                }
                $status = ( isset( $r['data']['status'] ) ? (string) $r['data']['status'] : '' );
                if ( 'done' === $status ) {
                    $done[$key] = $r['data'];
                    unset($pending[$key]);
                } elseif ( 'failed' === $status ) {
                    $out[$key] = array(
                        'ok'          => false,
                        'code'        => ( isset( $r['data']['error_code'] ) ? (string) $r['data']['error_code'] : 'cloud_job_failed' ),
                        'message'     => __( 'The server could not optimize this image.', 'imgsentry' ),
                        'unavailable' => false,
                        'stop'        => false,
                        'local_ok'    => true,
                        'retry_after' => 0,
                    );
                    unset($pending[$key]);
                }
            }
        }
        // Jobs that did not finish in time: cancel (the server gives the quota back) and report "unavailable".
        if ( !empty( $pending ) ) {
            $cancel = array();
            foreach ( $pending as $key => $job_id ) {
                $cancel[$key] = array(
                    'method'  => 'DELETE',
                    'path'    => '/v1/optimize/jobs/' . rawurlencode( $job_id ),
                    'timeout' => 10,
                );
            }
            self::multi( $cancel );
            foreach ( $pending as $key => $job_id ) {
                $out[$key] = self::failure( array(
                    'conn'        => false,
                    'status'      => 0,
                    'data'        => array(),
                    'retry_after' => 0,
                    'error'       => 'timeout',
                ) );
            }
        }
        // 3. Download every result file of every finished job at once.
        $temp_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_temp_dir( 'optimizer' ) : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/temp/optimizer/' );
        if ( !file_exists( $temp_dir ) ) {
            wp_mkdir_p( $temp_dir );
        }
        $downloads = array();
        $meta = array();
        foreach ( $done as $key => $data ) {
            $meta[$key] = array(
                'files'   => array(),
                'sizes'   => array(),
                'no_gain' => array(),
            );
            $results = ( isset( $data['results'] ) && is_array( $data['results'] ) ? $data['results'] : array() );
            foreach ( $results as $row ) {
                if ( empty( $row['format'] ) || !in_array( $row['format'], array('original', 'webp', 'avif'), true ) ) {
                    continue;
                }
                $format = (string) $row['format'];
                $meta[$key]['no_gain'][$format] = !empty( $row['no_gain'] );
                $meta[$key]['sizes'][$format] = ( isset( $row['bytes'] ) ? (int) $row['bytes'] : 0 );
                if ( $meta[$key]['no_gain'][$format] ) {
                    continue;
                    // Nothing better than the source: nothing to download.
                }
                $tmp = $temp_dir . 'cloud-' . wp_generate_password( 12, false, false ) . '.' . $format;
                $downloads[$key . '|' . $format] = array(
                    'method'   => 'GET',
                    'path'     => '/v1/optimize/jobs/' . rawurlencode( $jobs[$key] ) . '/files/' . $format,
                    'timeout'  => 120,
                    'filename' => $tmp,
                );
            }
        }
        $failed = array();
        foreach ( self::multi( $downloads ) as $id => $r ) {
            list( $key, $format ) = explode( '|', $id, 2 );
            $tmp = $downloads[$id]['filename'];
            if ( $r['conn'] && 200 === $r['status'] && file_exists( $tmp ) && filesize( $tmp ) > 0 ) {
                $meta[$key]['files'][$format] = $tmp;
            } else {
                wp_delete_file( $tmp );
                $failed[$key] = ( $r['conn'] && 200 === $r['status'] ? array(
                    'conn'        => false,
                    'status'      => 0,
                    'data'        => array(),
                    'retry_after' => 0,
                    'error'       => 'download',
                ) : $r );
            }
        }
        // Jobs whose files were all saved are deleted on the server right away (it keeps a finished job
        // for a short time only so that a failed download can be repeated). Best effort: an error here is ignored.
        $cleanup = array();
        foreach ( $done as $key => $unused ) {
            if ( !isset( $failed[$key] ) ) {
                $cleanup[$key] = array(
                    'method'  => 'DELETE',
                    'path'    => '/v1/optimize/jobs/' . rawurlencode( $jobs[$key] ),
                    'timeout' => 10,
                );
            }
        }
        if ( !empty( $cleanup ) ) {
            self::multi( $cleanup );
        }
        foreach ( $done as $key => $unused ) {
            if ( isset( $failed[$key] ) ) {
                foreach ( $meta[$key]['files'] as $f ) {
                    wp_delete_file( $f );
                }
                $out[$key] = self::failure( $failed[$key] );
            } else {
                $out[$key] = array(
                    'ok'      => true,
                    'files'   => $meta[$key]['files'],
                    'sizes'   => $meta[$key]['sizes'],
                    'no_gain' => $meta[$key]['no_gain'],
                );
            }
        }
        return $out;
    }

    // ------------------------------------------------------------------
    // Server up / down handling
    // ------------------------------------------------------------------
    /**
     * The server answered: forget any outage and hide the notice.
     *
     * @return void
     */
    public static function mark_server_up() {
        if ( get_option( self::OPT_DOWN_SINCE ) ) {
            delete_option( self::OPT_DOWN_SINCE );
        }
        if ( get_option( self::OPT_NOTICE ) ) {
            delete_option( self::OPT_NOTICE );
        }
    }

    /**
     * Decide what to do after "server unreachable".
     *
     * The Free build has no local fallback: after the retry window it always answers 'fail'.
     *
     * @return string 'retry' (try again in a few minutes) | 'fallback' (use the local engine) | 'fail' (no fallback) | 'cap' (daily fallback cap reached).
     */
    public static function handle_unavailable() {
        $now = time();
        $since = (int) get_option( self::OPT_DOWN_SINCE, 0 );
        if ( $since <= 0 ) {
            $since = $now;
            update_option( self::OPT_DOWN_SINCE, $since, false );
        }
        if ( $now - $since < self::RETRY_WINDOW ) {
            return 'retry';
        }
        return 'fail';
    }

    // ------------------------------------------------------------------
    // Quota snapshot
    // ------------------------------------------------------------------
    /**
     * Save the quota numbers the server reported.
     *
     * @param array      $quota   Server "quota" object.
     * @param array|null $license Optional: array( 'plan' => string, 'active' => bool ).
     * @param bool       $full    True when the server said the quota is used up.
     * @return void
     */
    private static function store_quota( array $quota, $license = null, $full = false ) {
        $snap = array(
            'images_used'  => ( isset( $quota['images_used'] ) ? (int) $quota['images_used'] : 0 ),
            'images_limit' => ( isset( $quota['images_limit'] ) ? ( null === $quota['images_limit'] ? null : (int) $quota['images_limit'] ) : null ),
            'bytes_used'   => ( isset( $quota['bytes_used'] ) ? (int) $quota['bytes_used'] : 0 ),
            'bytes_limit'  => ( isset( $quota['bytes_limit'] ) ? ( null === $quota['bytes_limit'] ? null : (int) $quota['bytes_limit'] ) : null ),
            'cycle_start'  => ( isset( $quota['cycle_start'] ) ? (int) $quota['cycle_start'] : 0 ),
            'cycle_end'    => ( isset( $quota['cycle_end'] ) ? (int) $quota['cycle_end'] : 0 ),
            'full'         => (bool) $full,
            'fetched_at'   => time(),
            'fp'           => self::quota_fingerprint(),
        );
        if ( is_array( $license ) ) {
            $snap['active'] = ( isset( $license['active'] ) ? (bool) $license['active'] : true );
            $snap['plan'] = ( isset( $license['plan'] ) ? (string) $license['plan'] : '' );
        }
        update_option( self::OPT_QUOTA, $snap, false );
        // Keep the local fallback cycle in step with the server's cycle.
        if ( $snap['cycle_start'] > 0 && class_exists( 'ImgSentry_Quota' ) ) {
            update_option( ImgSentry_Quota::OPTION_START, $snap['cycle_start'], false );
        }
    }

    /**
     * Cached quota snapshot (never calls the network).
     *
     * @return array|null
     */
    public static function get_quota_snapshot() {
        $s = get_option( self::OPT_QUOTA, null );
        if ( !is_array( $s ) || !isset( $s['images_used'] ) ) {
            return null;
        }
        // A snapshot made under another plan, licence key or install is not valid any more
        // (for example right after an upgrade): ignore it so the numbers are fetched again.
        if ( !isset( $s['fp'] ) || self::quota_fingerprint() !== (string) $s['fp'] ) {
            return null;
        }
        return $s;
    }

    /**
     * What the cached quota snapshot belongs to: the plan, the credentials (licence key or install
     * secret) and the install. Changes on upgrade, downgrade, a new licence key or a new account.
     *
     * @return string
     */
    private static function quota_fingerprint() {
        $auth = ImgSentry_License::get_cloud_auth();
        $raw = (( is_array( $auth ) ? $auth['authorization'] . '|' . $auth['install'] : '-' )) . '|' . ImgSentry_License::get_plan();
        return md5( $raw );
    }

    /**
     * Refresh the snapshot from the server only when it is needed, so an admin page load normally
     * makes no network call:
     * - there is no valid snapshot (first run, or the plan/licence changed), or
     * - the snapshot says the quota is used up and is older than 5 minutes (so an upgrade or a
     *   renewed cycle is noticed without having to optimize an image first), or
     * - the snapshot is older than 5 hours (so a limit changed on the server is picked up).
     * At most one attempt every 2 minutes, so an unreachable server never slows every page.
     *
     * @return void
     */
    public static function maybe_refresh_quota() {
        if ( !self::is_enabled() ) {
            return;
        }
        $snap = self::get_quota_snapshot();
        $needs = false;
        if ( null === $snap ) {
            $needs = true;
        } elseif ( time() - (int) $snap['fetched_at'] > 5 * HOUR_IN_SECONDS ) {
            // Older than 5 hours: refresh even if the quota is not full, so a limit changed on the server shows up.
            $needs = true;
        } elseif ( time() - (int) $snap['fetched_at'] > 300 ) {
            $needs = null !== $snap['images_limit'] && (int) $snap['images_used'] >= (int) $snap['images_limit'] || null !== $snap['bytes_limit'] && (int) $snap['bytes_used'] >= (int) $snap['bytes_limit'];
        }
        if ( !$needs || get_transient( 'imgsentry_cloud_quota_try' ) ) {
            return;
        }
        set_transient( 'imgsentry_cloud_quota_try', 1, 2 * MINUTE_IN_SECONDS );
        self::refresh_quota( true );
    }

    /**
     * Fetch GET /v1/license/status and store it. Skipped when the snapshot is fresh (unless forced).
     *
     * @param bool $force Ignore the cache age.
     * @return array|null Snapshot or null when the server could not be reached.
     */
    public static function refresh_quota( $force = false ) {
        $snap = self::get_quota_snapshot();
        if ( !$force && null !== $snap && time() - (int) $snap['fetched_at'] < 300 ) {
            return $snap;
        }
        if ( !self::is_enabled() ) {
            return $snap;
        }
        $r = self::call( 'GET', '/v1/license/status', array(
            'timeout' => 10,
        ) );
        if ( $r['conn'] && 200 === $r['status'] && isset( $r['data']['quota'] ) && is_array( $r['data']['quota'] ) ) {
            self::store_quota( $r['data']['quota'], array(
                'plan'   => ( isset( $r['data']['plan'] ) ? $r['data']['plan'] : '' ),
                'active' => !empty( $r['data']['active'] ),
            ), false );
            return self::get_quota_snapshot();
        }
        return $snap;
    }

    /**
     * Notice state for the admin screens.
     *
     * @return array{down:bool,fallback_active:bool,fallback_used_today:int}
     */
    public static function get_notice_state() {
        $used_today = 0;
        return array(
            'down'                => (bool) get_option( self::OPT_DOWN_SINCE, 0 ),
            'fallback_active'     => (bool) get_option( self::OPT_NOTICE, 0 ),
            'fallback_used_today' => $used_today,
        );
    }

}
