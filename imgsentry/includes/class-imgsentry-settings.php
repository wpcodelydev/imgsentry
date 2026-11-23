<?php

/**
 * ImgSentry — Settings Controller
 *
 * Manages plugin settings and defaults for ImgSentry. Stores settings as
 * ONE serialized option row for performance.
 *
 * Requires IMGSENTRY_OPTION_KEY + IMGSENTRY_PLUGIN_DIR constants to already be defined
 * by the main plugin bootstrap file before this file is required.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Settings {
    /** @var ImgSentry_Settings|null */
    private static $instance = null;

    /** @var string Single serialized option row (autoload = no). */
    const OPTION_KEY = IMGSENTRY_OPTION_KEY;

    // 'imgsentry_settings'
    public static function instance() {
        if ( is_null( self::$instance ) ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Output format the Next-Gen Image Format setting asks for, in the words the optimizer engine uses.
     * 'off' (or anything unknown) means: compress the image and keep its own format.
     *
     * @return string 'webp'|'avif'|'original'
     */
    public static function get_target_output_format() {
        $settings = self::instance()->get_settings();
        $format = ( isset( $settings['nextGenFormat'] ) ? strtolower( (string) $settings['nextGenFormat'] ) : 'webp' );
        return ( in_array( $format, array('webp', 'avif'), true ) ? $format : 'original' );
    }

    /**
     * The one place that builds the optimizer options for "automatic" optimizations: the upload hook and the
     * Media Library "Optimize Now" / "Re-Optimize" buttons. Everything not listed here follows the engine defaults
     * and the global backup setting. The Image Optimization page shows and saves the same compression level, quality and output format (one shared setting).
     *
     * @param bool $force Re-optimize an image that is already optimized.
     * @return array
     */
    public static function get_auto_optimize_options( $force = false ) {
        $settings = self::instance()->get_settings();
        $level = ( isset( $settings['defaultCompressionLevel'] ) ? (string) $settings['defaultCompressionLevel'] : 'balanced' );
        if ( !in_array( $level, array(
            'lossless',
            'balanced',
            'aggressive',
            'custom'
        ), true ) ) {
            $level = 'balanced';
        }
        $custom_quality = ( isset( $settings['defaultCompressionQuality'] ) ? (int) $settings['defaultCompressionQuality'] : 78 );
        if ( $custom_quality < 1 || $custom_quality > 100 ) {
            $custom_quality = 78;
        }
        return array(
            'output_format'         => self::get_target_output_format(),
            'compression_level'     => $level,
            'quality'               => $custom_quality,
            'preserve_transparency' => true,
            'keep_exif'             => false,
            'force'                 => (bool) $force,
        );
    }

    private function __construct() {
    }

    /**
     * Centralized capability check enforcing restrictToAdmins setting.
     *
     * @return bool
     */
    public static function can_user_access_imgsentry() {
        $settings = self::instance()->get_settings();
        $restrict = !empty( $settings['restrictToAdmins'] );
        if ( $restrict ) {
            $user = wp_get_current_user();
            return current_user_can( 'manage_options' ) && in_array( 'administrator', (array) $user->roles, true );
        }
        return current_user_can( 'manage_options' );
    }

    /**
     * Get the site default timezone.
     *
     * Uses wp_timezone_string(); if the result is a valid IANA identifier
     * (in timezone_identifiers_list()) use it; otherwise use 'UTC'.
     *
     * @return string
     */
    private static function get_default_timezone() {
        if ( function_exists( 'wp_timezone_string' ) ) {
            $tz = wp_timezone_string();
            if ( !empty( $tz ) && in_array( $tz, timezone_identifiers_list(), true ) ) {
                return $tz;
            }
        }
        return 'UTC';
    }

    /* ---------------------------------------------------------------------
     * Defaults — mirrors the PluginSettings TS interface field-for-field
     * ------------------------------------------------------------------- */
    public function get_defaults() {
        return array(
            'timeZone'                          => self::get_default_timezone(),
            'dateFormat'                        => 'May 24, 2024 10:30 AM',
            'enablePlugin'                      => true,
            'enableUsageTracking'               => true,
            'deleteDataOnUninstall'             => false,
            'defaultScanType'                   => 'smart',
            'includeImages'                     => true,
            'includeDocuments'                  => true,
            'includeVideos'                     => true,
            'includeAudio'                      => true,
            'includeSvg'                        => true,
            'includeOthers'                     => true,
            'memoryLimit'                       => '512MB',
            'autoTrashUnusedFiles'              => false,
            'autoPurgeTrashEnabled'             => true,
            'retentionDays'                     => 7,
            'fmAutoPurgeTrashEnabled'           => false,
            'fmTrashRetentionDays'              => 7,
            'minFileAgeDays'                    => 7,
            'enableScheduledScan'               => false,
            'scheduledScanFrequency'            => 7,
            'scheduledScanTime'                 => '02:00',
            'excludedFolders'                   => self::get_default_excluded_folders(),
            'excludedFiles'                     => self::get_default_excluded_files(),
            'exclusionDefaultsSeeded'           => false,
            'restrictToAdmins'                  => true,
            'nonceVerification'                 => true,
            'autoBackupBeforeDelete'            => false,
            'generateBackupBeforeOptimization'  => true,
            'autoOptimizeOnUpload'              => false,
            'enableMediaSync'                   => false,
            'backupDirectory'                   => 'wp-content/uploads/imgsentry/backups/',
            'backupRetentionDays'               => 0,
            'cloudFallbackEnabled'              => true,
            'cloudFallbackDailyCap'             => 200,
            'displayNextGenFormat'              => false,
            'nextGenFormat'                     => 'webp',
            'defaultCompressionLevel'           => 'balanced',
            'defaultCompressionQuality'         => 78,
            'nextGenDeliveryMethod'             => 'picture',
            'cdnUrl'                            => '',
            'logLevel'                          => 'info',
            'notificationEmail'                 => '',
            'notificationFromEmail'             => '',
            'customMetaKeys'                    => array(),
            'webhookUrl'                        => '',
            'webhookSecret'                     => '',
            'fileManagerGlobalHiddenPaths'      => 'wp-config.php|.htaccess|.env|.git|wp-content/themes|wp-content/plugins|wp-content/uploads/imgsentry',
            'fileManagerGlobalLockedExtensions' => '.php|.htaccess|.env|.sh|.sql',
            'enableFileManager'                 => false,
            'showFileManagerPromo'              => true,
            'fileManagerViewMode'               => 'list',
            'fileManagerTheme'                  => 'light',
            'fileManagerMaxUploadMB'            => 50,
            'fileManagerAllowedRoles'           => array('editor'),
            'fileManagerPrivateFolderAccess'    => '',
            'fileManagerNotifyOnUpload'         => false,
            'fileManagerNotifyOnDownload'       => false,
            'fileManagerNotifyOnEdit'           => false,
            'fileManagerNotifyOnChanges'        => false,
        );
    }

    /**
     * Recommended default folder exclusions (kept identical to DEFAULT_EXCLUDED_FOLDERS in the React app).
     *
     * @return array
     */
    public static function get_default_excluded_folders() {
        return array(
            array(
                'id'          => 'ef-0',
                'path'        => '/wp-content/uploads/imgsentry/backups/',
                'isPreSeeded' => true,
                'note'        => 'Isolated plugin backup directory — automatically excluded from scans',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-trash',
                'path'        => '/wp-content/uploads/imgsentry/trash/',
                'isPreSeeded' => true,
                'note'        => 'Isolated plugin trash directory — automatically excluded from scans',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-1',
                'path'        => '/wp-content/uploads/cache/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-2',
                'path'        => '/wp-content/uploads/backup/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-3',
                'path'        => '/wp-content/uploads/backups/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-5',
                'path'        => '/wp-content/uploads/wc-logs/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-7',
                'path'        => '/wp-content/uploads/elementor/css/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-8',
                'path'        => '/wp-content/uploads/wpo-cache/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-9',
                'path'        => '/wp-content/uploads/wp-rocket-cache/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'folder',
            ),
            array(
                'id'          => 'ef-11',
                'path'        => '/wp-content/uploads/wpforms/',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended (WPForms entry attachments)',
                'category'    => 'folder',
            )
        );
    }

    /**
     * Recommended default file-pattern exclusions (kept identical to DEFAULT_EXCLUDED_FILES in the React app).
     *
     * @return array
     */
    public static function get_default_excluded_files() {
        return array(
            array(
                'id'          => 'eff-1',
                'path'        => '*-thumbnail.jpg',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'file',
            ),
            array(
                'id'          => 'eff-2',
                'path'        => 'invoice-*.pdf',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'file',
            ),
            array(
                'id'          => 'eff-3',
                'path'        => '.htaccess',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'file',
            ),
            array(
                'id'          => 'eff-4',
                'path'        => 'web.config',
                'isPreSeeded' => true,
                'note'        => 'Added automatically — recommended',
                'category'    => 'file',
            )
        );
    }

    /**
     * Send one of ImgSentry's own emails (plain text), using the optional "From Email" setting as the sender.
     *
     * The sender address is applied only to this one message: the filter is added right before wp_mail() and
     * removed right after, so emails from other plugins and from WordPress itself are never changed.
     * An SMTP plugin that forces its own sender address still wins.
     *
     * @param string      $to      Recipient.
     * @param string      $subject Subject.
     * @param string      $message Plain text body.
     * @param string|null $from    Sender address. null = use the saved setting; '' = WordPress default sender.
     * @return bool Whether wp_mail() accepted the message.
     */
    public static function send_plugin_mail(
        $to,
        $subject,
        $message,
        $from = null
    ) {
        if ( null === $from ) {
            $settings = self::instance()->get_settings();
            $from = ( is_array( $settings ) && !empty( $settings['notificationFromEmail'] ) ? (string) $settings['notificationFromEmail'] : '' );
        }
        $from = sanitize_email( (string) $from );
        $filter = null;
        if ( '' !== $from && is_email( $from ) ) {
            $filter = static function () use($from) {
                return $from;
            };
            add_filter( 'wp_mail_from', $filter, 99 );
        }
        $sent = wp_mail(
            $to,
            $subject,
            $message,
            array('Content-Type: text/plain; charset=UTF-8')
        );
        if ( null !== $filter ) {
            remove_filter( 'wp_mail_from', $filter, 99 );
        }
        return $sent;
    }

    /**
     * Returns saved settings merged over defaults so new fields added in
     * future versions never come back as null/undefined to the React app.
     * Automatically corrects legacy stale default backup paths to the consolidated path.
     */
    public function get_settings() {
        $saved = get_option( self::OPTION_KEY, array() );
        if ( !is_array( $saved ) ) {
            $saved = array();
        }
        $merged = wp_parse_args( $saved, $this->get_defaults() );
        // Legacy mapping for defaultScanType (quick -> smart, deep -> full)
        if ( isset( $merged['defaultScanType'] ) ) {
            $scan_type = $merged['defaultScanType'];
            if ( 'quick' === $scan_type ) {
                $scan_type = 'smart';
            } elseif ( 'deep' === $scan_type ) {
                $scan_type = 'full';
            } elseif ( !in_array( $scan_type, array('smart', 'full'), true ) ) {
                $scan_type = 'smart';
            }
            $merged['defaultScanType'] = $scan_type;
            if ( isset( $saved['defaultScanType'] ) && $saved['defaultScanType'] !== $scan_type ) {
                $saved['defaultScanType'] = $scan_type;
                update_option( self::OPTION_KEY, $saved );
            }
        }
        $allowed_themes = array('light', 'dark', 'auto');
        if ( !isset( $merged['fileManagerTheme'] ) || !in_array( $merged['fileManagerTheme'], $allowed_themes, true ) ) {
            $merged['fileManagerTheme'] = 'light';
            if ( isset( $saved['fileManagerTheme'] ) ) {
                $saved['fileManagerTheme'] = 'light';
                update_option( self::OPTION_KEY, $saved );
            }
        }
        // If the stored backupDirectory matches an old default path, update it seamlessly to the new default
        if ( isset( $merged['backupDirectory'] ) ) {
            $raw_backup = trim( (string) $merged['backupDirectory'], '/\\' );
            $normalized = strtolower( wp_normalize_path( $raw_backup ) );
            $legacy_defaults = array(
                'wp-content/uploads/imgsentrybackups/backups',
                'wp-content/uploads/imgsentrybackups',
                'imgsentrybackups/backups',
                'imgsentrybackups'
            );
            if ( in_array( $normalized, $legacy_defaults, true ) ) {
                $merged['backupDirectory'] = 'wp-content/uploads/imgsentry/backups/';
                // If the option existed in the database with the old default, update the DB value
                if ( isset( $saved['backupDirectory'] ) && $saved['backupDirectory'] !== $merged['backupDirectory'] ) {
                    $saved['backupDirectory'] = $merged['backupDirectory'];
                    update_option( self::OPTION_KEY, $saved );
                }
            } else {
                // Ensure in-memory backupDirectory is safe without rewriting option in the database
                $merged['backupDirectory'] = self::sanitize_backup_directory( $merged['backupDirectory'], 'wp-content/uploads/imgsentry/backups/' );
            }
        }
        // One-time: make sure the recommended exclusions really are stored (the UI always showed them,
        // but older versions only kept an empty list in the database). After this the user's list is final,
        // even if they remove every item.
        if ( empty( $saved['exclusionDefaultsSeeded'] ) ) {
            if ( empty( $saved['excludedFolders'] ) || !is_array( $saved['excludedFolders'] ) ) {
                $saved['excludedFolders'] = self::get_default_excluded_folders();
            }
            if ( empty( $saved['excludedFiles'] ) || !is_array( $saved['excludedFiles'] ) ) {
                $saved['excludedFiles'] = self::get_default_excluded_files();
            }
            $saved['exclusionDefaultsSeeded'] = true;
            update_option( self::OPTION_KEY, $saved );
            $merged['excludedFolders'] = $saved['excludedFolders'];
            $merged['excludedFiles'] = $saved['excludedFiles'];
            $merged['exclusionDefaultsSeeded'] = true;
        }
        // Migration for excludedFolders in saved settings to correct old wrong pre-seeded paths
        if ( isset( $saved['excludedFolders'] ) && is_array( $saved['excludedFolders'] ) ) {
            $has_changes = false;
            $has_trash = false;
            foreach ( $saved['excludedFolders'] as &$folder ) {
                $path = '';
                if ( is_string( $folder ) ) {
                    $path = $folder;
                } elseif ( is_array( $folder ) && isset( $folder['path'] ) ) {
                    $path = $folder['path'];
                }
                if ( empty( $path ) ) {
                    continue;
                }
                $normalized = strtolower( wp_normalize_path( $path ) );
                // Identify and correct the old stale backup path
                if ( strpos( $normalized, 'imgsentrybackups/backups' ) !== false ) {
                    if ( is_string( $folder ) ) {
                        $folder = '/wp-content/uploads/imgsentry/backups/';
                    } elseif ( is_array( $folder ) ) {
                        $folder['path'] = '/wp-content/uploads/imgsentry/backups/';
                    }
                    $has_changes = true;
                }
                if ( strpos( $normalized, 'imgsentry/trash' ) !== false ) {
                    $has_trash = true;
                }
            }
            unset($folder);
            // Break reference
            // Append trash directory if not present in saved settings
            if ( !$has_trash && !empty( $saved['excludedFolders'] ) ) {
                $saved['excludedFolders'][] = array(
                    'id'          => 'ef-trash',
                    'path'        => '/wp-content/uploads/imgsentry/trash/',
                    'isPreSeeded' => true,
                    'note'        => 'Isolated plugin trash directory — automatically excluded from scans',
                    'category'    => 'folder',
                );
                $has_changes = true;
            }
            if ( $has_changes ) {
                update_option( self::OPTION_KEY, $saved );
                $merged['excludedFolders'] = $saved['excludedFolders'];
            }
        }
        // Migration for existing installs: automatically upgrade untouched legacy default cloaked pathways
        if ( isset( $saved['fileManagerGlobalHiddenPaths'] ) ) {
            $old_default = 'wp-config.php|.htaccess|.env|.git|wp-content/themes|wp-content/plugins';
            if ( trim( (string) $saved['fileManagerGlobalHiddenPaths'] ) === $old_default ) {
                $new_default = 'wp-config.php|.htaccess|.env|.git|wp-content/themes|wp-content/plugins|wp-content/uploads/imgsentry';
                $saved['fileManagerGlobalHiddenPaths'] = $new_default;
                $merged['fileManagerGlobalHiddenPaths'] = $new_default;
                update_option( self::OPTION_KEY, $saved );
            }
        }
        // Migration for existing installs: initialize fmAutoPurgeTrashEnabled and fmTrashRetentionDays
        // For existing installs (!empty($saved)), preserve their prior effective behavior (auto purge enabled with their retentionDays value).
        // For brand new installs ($saved is empty), get_defaults() sets fmAutoPurgeTrashEnabled = false and fmTrashRetentionDays = 7.
        if ( !empty( $saved ) && !array_key_exists( 'fmAutoPurgeTrashEnabled', $saved ) ) {
            $saved['fmAutoPurgeTrashEnabled'] = true;
            if ( !array_key_exists( 'fmTrashRetentionDays', $saved ) ) {
                $saved['fmTrashRetentionDays'] = ( isset( $saved['retentionDays'] ) ? (int) $saved['retentionDays'] : 7 );
            }
            update_option( self::OPTION_KEY, $saved );
            $merged['fmAutoPurgeTrashEnabled'] = $saved['fmAutoPurgeTrashEnabled'];
            $merged['fmTrashRetentionDays'] = $saved['fmTrashRetentionDays'];
        }
        // Free plan: auto-delete of Trash is a Pro feature, always reported as OFF.
        // The raw stored value is left untouched so it comes back if the site upgrades.
        if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'trash_auto_purge' ) ) {
            $merged['autoPurgeTrashEnabled'] = false;
        }
        // Free plan: Scheduled Scan and Auto-Trash Unused Files are Business / Professional features, always reported as OFF.
        // The raw stored values are left untouched so they come back if the site upgrades.
        if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'scheduled_scan' ) ) {
            $merged['enableScheduledScan'] = false;
        }
        if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'auto_trash_unused' ) ) {
            $merged['autoTrashUnusedFiles'] = false;
        }
        // Free plan: the scan webhook is a Business / Professional feature, always reported as empty.
        // The raw stored values are left untouched so they come back after an upgrade.
        if ( class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'webhook' ) ) {
            $merged['webhookUrl'] = '';
            $merged['webhookSecret'] = '';
        }
        return $merged;
    }

    /* ---------------------------------------------------------------------
     * Sanitization — every field is whitelisted/clamped, nothing passes
     * through unchecked. $existing is the last-known-good state, used as
     * the fallback for any field intentionally omitted from a PATCH-style
     * partial payload.
     * ------------------------------------------------------------------- */
    public function sanitize_settings( array $input, array $existing ) {
        $out = $existing;
        // --- Booleans ---------------------------------------------------
        $bool_fields = array(
            'enablePlugin',
            'enableUsageTracking',
            'includeImages',
            'includeDocuments',
            'includeVideos',
            'includeAudio',
            'includeSvg',
            'includeOthers',
            'autoTrashUnusedFiles',
            'autoPurgeTrashEnabled',
            'fmAutoPurgeTrashEnabled',
            'enableScheduledScan',
            'restrictToAdmins',
            'displayNextGenFormat',
            'generateBackupBeforeOptimization',
            'autoOptimizeOnUpload',
            'enableMediaSync',
            'deleteDataOnUninstall',
            'showFileManagerPromo'
        );
        foreach ( $bool_fields as $field ) {
            // Free plan: Scheduled Scan and Auto-Trash Unused Files can never be switched on, whatever the request says.
            if ( 'enableScheduledScan' === $field && class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'scheduled_scan' ) ) {
                $out[$field] = false;
                continue;
            }
            if ( 'autoTrashUnusedFiles' === $field && class_exists( 'ImgSentry_License' ) && !ImgSentry_License::can_use( 'auto_trash_unused' ) ) {
                $out[$field] = false;
                continue;
            }
            if ( array_key_exists( $field, $input ) ) {
                $out[$field] = (bool) rest_sanitize_boolean( $input[$field] );
            }
        }
        // Nonce verification is always on (immutable security policy)
        $out['nonceVerification'] = true;
        // --- Enums (whitelisted) -----------------------------------------
        if ( isset( $input['defaultScanType'] ) ) {
            $scan_type = sanitize_key( (string) $input['defaultScanType'] );
            if ( 'quick' === $scan_type ) {
                $scan_type = 'smart';
            } elseif ( 'deep' === $scan_type ) {
                $scan_type = 'full';
            }
            if ( in_array( $scan_type, array('smart', 'full'), true ) ) {
                $out['defaultScanType'] = $scan_type;
            }
        }
        if ( isset( $input['logLevel'] ) && in_array( $input['logLevel'], array('error', 'info', 'debug'), true ) ) {
            $out['logLevel'] = $input['logLevel'];
        }
        if ( isset( $input['nextGenFormat'] ) && in_array( $input['nextGenFormat'], array('off', 'webp', 'avif'), true ) ) {
            $out['nextGenFormat'] = $input['nextGenFormat'];
        }
        if ( isset( $input['defaultCompressionLevel'] ) && in_array( $input['defaultCompressionLevel'], array(
            'lossless',
            'balanced',
            'aggressive',
            'custom'
        ), true ) ) {
            $out['defaultCompressionLevel'] = $input['defaultCompressionLevel'];
        }
        if ( isset( $input['defaultCompressionQuality'] ) && is_numeric( $input['defaultCompressionQuality'] ) ) {
            $out['defaultCompressionQuality'] = max( 1, min( 100, (int) $input['defaultCompressionQuality'] ) );
        }
        // How WebP / AVIF copies reach visitors: <picture> tags in the page, or rewrite rules in .htaccess.
        if ( isset( $input['nextGenDeliveryMethod'] ) && in_array( $input['nextGenDeliveryMethod'], array('picture', 'rewrite'), true ) ) {
            $out['nextGenDeliveryMethod'] = $input['nextGenDeliveryMethod'];
        } elseif ( !isset( $out['nextGenDeliveryMethod'] ) || !in_array( $out['nextGenDeliveryMethod'], array('picture', 'rewrite'), true ) ) {
            $out['nextGenDeliveryMethod'] = 'picture';
        }
        if ( isset( $input['cdnUrl'] ) ) {
            // Empty = no CDN. Otherwise keep a clean http(s) URL without a trailing slash.
            $cdn_raw = trim( (string) wp_unslash( $input['cdnUrl'] ) );
            $out['cdnUrl'] = ( '' === $cdn_raw ? '' : untrailingslashit( esc_url_raw( $cdn_raw, array('http', 'https') ) ) );
        }
        if ( isset( $input['scheduledScanFrequency'] ) && in_array( (int) $input['scheduledScanFrequency'], array(
            7,
            15,
            30,
            60
        ), true ) ) {
            $out['scheduledScanFrequency'] = (int) $input['scheduledScanFrequency'];
        }
        if ( isset( $input['scheduledScanTime'] ) ) {
            $time_val = sanitize_text_field( $input['scheduledScanTime'] );
            if ( preg_match( '/^([01]\\d|2[0-3]):([0-5]\\d)$/', $time_val ) ) {
                $out['scheduledScanTime'] = $time_val;
            } else {
                $out['scheduledScanTime'] = '02:00';
            }
        }
        // retentionDays whitelist: [2, 7, 15, 30], default snap 7
        if ( isset( $input['retentionDays'] ) ) {
            $val = absint( $input['retentionDays'] );
            $out['retentionDays'] = ( in_array( $val, array(
                2,
                7,
                15,
                30
            ), true ) ? $val : 7 );
        }
        // fmTrashRetentionDays whitelist: [2, 7, 15, 30], default snap 7
        if ( isset( $input['fmTrashRetentionDays'] ) ) {
            $val = absint( $input['fmTrashRetentionDays'] );
            $out['fmTrashRetentionDays'] = ( in_array( $val, array(
                2,
                7,
                15,
                30
            ), true ) ? $val : 7 );
        }
        $memory_options = array(
            '128MB',
            '256MB',
            '512MB',
            '1024MB',
            '2048MB'
        );
        if ( isset( $input['memoryLimit'] ) ) {
            $val = strtoupper( sanitize_text_field( $input['memoryLimit'] ) );
            if ( in_array( $val, $memory_options, true ) ) {
                $out['memoryLimit'] = $val;
            }
        }
        // --- Clamped integers --------------------------------------------
        if ( isset( $input['minFileAgeDays'] ) ) {
            $out['minFileAgeDays'] = max( 0, absint( $input['minFileAgeDays'] ) );
        }
        // --- Plain strings -------------------------------------------------
        if ( isset( $input['timeZone'] ) ) {
            $tz = sanitize_text_field( $input['timeZone'] );
            // Only accept values PHP actually recognizes as valid timezones.
            if ( in_array( $tz, timezone_identifiers_list(), true ) || 'UTC' === $tz ) {
                $out['timeZone'] = $tz;
            }
        }
        if ( isset( $input['dateFormat'] ) ) {
            // Only the formats offered in Settings > General are accepted.
            $date_format = sanitize_text_field( $input['dateFormat'] );
            if ( in_array( $date_format, array('May 24, 2024 10:30 AM', 'Y-m-d H:i', 'd/m/Y H:i'), true ) ) {
                $out['dateFormat'] = $date_format;
            }
        }
        // --- File Manager Security Settings -------------------------------
        if ( isset( $input['fileManagerGlobalHiddenPaths'] ) ) {
            $out['fileManagerGlobalHiddenPaths'] = sanitize_text_field( (string) $input['fileManagerGlobalHiddenPaths'] );
        }
        if ( isset( $input['fileManagerGlobalLockedExtensions'] ) ) {
            $out['fileManagerGlobalLockedExtensions'] = sanitize_text_field( (string) $input['fileManagerGlobalLockedExtensions'] );
        }
        // --- File Manager General Settings -------------------------------
        // Only a site on the Professional plan can switch the File Manager on; otherwise the saved value stays as it is.
        if ( array_key_exists( 'enableFileManager', $input ) && class_exists( 'ImgSentry_License' ) && ImgSentry_License::can_use( 'file_manager' ) ) {
            $out['enableFileManager'] = (bool) rest_sanitize_boolean( $input['enableFileManager'] );
        }
        if ( isset( $input['fileManagerViewMode'] ) && in_array( $input['fileManagerViewMode'], array('list', 'grid'), true ) ) {
            $out['fileManagerViewMode'] = $input['fileManagerViewMode'];
        }
        if ( isset( $input['fileManagerTheme'] ) ) {
            $theme = sanitize_text_field( (string) $input['fileManagerTheme'] );
            $allowed_themes = array('light', 'dark', 'auto');
            $out['fileManagerTheme'] = ( in_array( $theme, $allowed_themes, true ) ? $theme : 'light' );
        }
        if ( isset( $input['fileManagerMaxUploadMB'] ) ) {
            $val = absint( $input['fileManagerMaxUploadMB'] );
            $out['fileManagerMaxUploadMB'] = min( max( 1, $val ), 2048 );
        }
        // Private root folder for the File Manager (validated against the real file system when it is used and when it is saved).
        if ( isset( $input['fileManagerPrivateFolderAccess'] ) ) {
            $out['fileManagerPrivateFolderAccess'] = sanitize_text_field( (string) $input['fileManagerPrivateFolderAccess'] );
        }
        // Email notification switches for File Manager activity.
        foreach ( array(
            'fileManagerNotifyOnUpload',
            'fileManagerNotifyOnDownload',
            'fileManagerNotifyOnEdit',
            'fileManagerNotifyOnChanges'
        ) as $notify_key ) {
            if ( array_key_exists( $notify_key, $input ) ) {
                $out[$notify_key] = (bool) rest_sanitize_boolean( $input[$notify_key] );
            }
        }
        // Notification email: empty means "use the WordPress admin email"; an invalid address is ignored.
        if ( isset( $input['notificationEmail'] ) ) {
            $notification_email = trim( (string) $input['notificationEmail'] );
            if ( '' === $notification_email ) {
                $out['notificationEmail'] = '';
            } elseif ( is_email( sanitize_email( $notification_email ) ) ) {
                $out['notificationEmail'] = sanitize_email( $notification_email );
            }
        }
        // From email of ImgSentry's own emails: empty means "WordPress default sender"; an invalid address is ignored.
        if ( isset( $input['notificationFromEmail'] ) ) {
            $from_email = trim( (string) $input['notificationFromEmail'] );
            if ( '' === $from_email ) {
                $out['notificationFromEmail'] = '';
            } elseif ( is_email( sanitize_email( $from_email ) ) ) {
                $out['notificationFromEmail'] = sanitize_email( $from_email );
            }
        }
        if ( isset( $input['fileManagerAllowedRoles'] ) && is_array( $input['fileManagerAllowedRoles'] ) ) {
            $wp_roles_obj = ( function_exists( 'wp_roles' ) ? wp_roles() : null );
            $existing_roles = ( $wp_roles_obj && isset( $wp_roles_obj->roles ) && is_array( $wp_roles_obj->roles ) ? array_keys( $wp_roles_obj->roles ) : array(
                'administrator',
                'editor',
                'author',
                'contributor',
                'subscriber'
            ) );
            $clean_roles = array();
            foreach ( $input['fileManagerAllowedRoles'] as $role_slug ) {
                $role_slug = sanitize_key( (string) $role_slug );
                if ( in_array( $role_slug, $existing_roles, true ) && !in_array( $role_slug, $clean_roles, true ) ) {
                    $clean_roles[] = $role_slug;
                }
            }
            $out['fileManagerAllowedRoles'] = $clean_roles;
        }
        // --- Backup directory: allow a custom relative path, but hard-block
        //     path traversal and force it to stay inside wp-content/uploads/.
        if ( isset( $input['backupDirectory'] ) ) {
            $out['backupDirectory'] = $this->sanitize_backup_directory( $input['backupDirectory'], 'wp-content/uploads/imgsentry/backups/' );
        }
        if ( isset( $input['backupRetentionDays'] ) ) {
            $val = (int) $input['backupRetentionDays'];
            if ( in_array( $val, array(0, 30, 90), true ) ) {
                $out['backupRetentionDays'] = $val;
            }
        }
        // --- Integrations: custom image fields + webhook ------------------
        if ( array_key_exists( 'customMetaKeys', $input ) ) {
            $out['customMetaKeys'] = ImgSentry_Integrations::sanitize_meta_keys( $input['customMetaKeys'] );
        }
        // --- Exclusion lists ---------------------------------------------
        if ( isset( $input['excludedFolders'] ) && is_array( $input['excludedFolders'] ) ) {
            $out['excludedFolders'] = $this->sanitize_exclusion_list( $input['excludedFolders'], 'folder' );
        }
        if ( isset( $input['excludedFiles'] ) && is_array( $input['excludedFiles'] ) ) {
            $out['excludedFiles'] = $this->sanitize_exclusion_list( $input['excludedFiles'], 'file' );
        }
        return $out;
    }

    /**
     * Whether folder names are case-sensitive on this server (true on Linux, false on Windows and macOS).
     *
     * @return bool
     */
    public static function folder_rules_case_sensitive() {
        return !in_array( PHP_OS_FAMILY, array('Windows', 'Darwin'), true );
    }

    /**
     * Sanitizes an array of ExclusionItem objects: { id, path, isPreSeeded, category, note }
     */
    private function sanitize_exclusion_list( array $list, $category ) {
        $clean = array();
        $seen = array();
        foreach ( $list as $item ) {
            if ( !is_array( $item ) || empty( $item['path'] ) ) {
                continue;
            }
            $path = (string) $item['path'];
            if ( 'folder' === $category ) {
                $path = $this->sanitize_uploads_subfolder( $path );
                if ( '' === $path ) {
                    continue;
                    // rejected: traversal attempt or outside uploads/
                }
            } else {
                // File patterns are wildcard globs (e.g. "*-thumbnail.jpg"),
                // not filesystem paths — sanitize as text only.
                $path = sanitize_text_field( $path );
                $path = str_replace( array('../', '..\\'), '', $path );
            }
            // Folder names are case-sensitive on Linux ("Cache" and "cache" are two folders); Windows and macOS are not.
            $key = ( 'folder' === $category && self::folder_rules_case_sensitive() ? $path : strtolower( $path ) );
            if ( isset( $seen[$key] ) ) {
                continue;
                // de-dupe
            }
            $seen[$key] = true;
            $clean[] = array(
                'id'          => ( isset( $item['id'] ) ? sanitize_key( $item['id'] ) : uniqid( 'imgsentry-', true ) ),
                'path'        => $path,
                'isPreSeeded' => !empty( $item['isPreSeeded'] ),
                'category'    => $category,
                'note'        => ( isset( $item['note'] ) ? sanitize_text_field( $item['note'] ) : '' ),
            );
        }
        return $clean;
    }

    /**
     * Forces a folder exclusion path to live inside wp-content/uploads/ and
     * strips traversal sequences. Returns '' if the path is invalid or
     * resolves to the uploads root itself (which would disable scanning).
     */
    private function sanitize_uploads_subfolder( $path ) {
        $path = sanitize_text_field( $path );
        $path = str_replace( array('../', '..\\', "\x00"), '', $path );
        $path = wp_normalize_path( $path );
        if ( '/' !== substr( $path, 0, 1 ) ) {
            $path = '/wp-content/uploads/' . ltrim( $path, '/' );
        }
        $path = trailingslashit( $path );
        $blocked_roots = array('/wp-content/uploads/', '/wp-content/uploads', '/');
        if ( in_array( $path, $blocked_roots, true ) ) {
            return '';
        }
        if ( 0 !== strpos( $path, '/wp-content/uploads/' ) ) {
            return '';
        }
        return $path;
    }

    /**
     * Sanitizes a relative-to-ABSPATH directory (used for the backup path
     * setting). Blocks traversal and absolute paths; falls back to $default
     * on anything suspicious.
     */
    private function sanitize_relative_path( $path, $default ) {
        $path = sanitize_text_field( (string) $path );
        $path = str_replace( array('../', '..\\', "\x00"), '', $path );
        $path = wp_normalize_path( ltrim( $path, '/' ) );
        $path = trailingslashit( $path );
        if ( '' === trim( $path, '/' ) ) {
            return $default;
        }
        return $path;
    }

    /**
     * Sanitizes the backup directory setting.
     *
     * Enforces that the backup directory must reside strictly inside the WordPress
     * uploads directory and contain at least one dedicated subfolder. Discards
     * any directory traversal, relative dot segments, or external targets.
     *
     * @param mixed  $input   User input from settings form or stored setting.
     * @param string $default Safe fallback default path.
     * @return string Sanitized relative path with trailing slash.
     */
    public static function sanitize_backup_directory( $input, $default = 'wp-content/uploads/imgsentry/backups/' ) {
        $str = sanitize_text_field( (string) $input );
        $str = str_replace( '\\', '/', $str );
        $str = str_replace( "\x00", '', $str );
        $str = trim( $str );
        $raw_segments = explode( '/', $str );
        $segments = array();
        foreach ( $raw_segments as $seg ) {
            if ( '' === $seg ) {
                continue;
                // Drop empty segments.
            }
            if ( '.' === $seg || '..' === $seg ) {
                return $default;
                // Discard traversal or relative dot targets.
            }
            $segments[] = $seg;
        }
        if ( empty( $segments ) ) {
            return $default;
        }
        $clean_path = implode( '/', $segments );
        // Derive allowed uploads prefix relative to ABSPATH (handling custom WP_CONTENT_DIR / custom uploads dir)
        $prefix = self::get_uploads_relative_prefix();
        $prefix_slash = $prefix . '/';
        if ( 0 !== strpos( $clean_path, $prefix_slash ) ) {
            return $default;
        }
        $remainder = substr( $clean_path, strlen( $prefix_slash ) );
        if ( '' === trim( $remainder, '/' ) ) {
            return $default;
        }
        return trailingslashit( $clean_path );
    }

    /**
     * Get the relative path of the uploads directory relative to ABSPATH.
     *
     * Default is 'wp-content/uploads', but dynamically detects custom content/uploads locations.
     *
     * @return string Relative uploads path without leading or trailing slashes.
     */
    public static function get_uploads_relative_prefix() {
        $prefix = 'wp-content/uploads';
        if ( function_exists( 'wp_upload_dir' ) && defined( 'ABSPATH' ) ) {
            $upload_info = wp_upload_dir();
            if ( !empty( $upload_info['basedir'] ) ) {
                $norm_basedir = ( function_exists( 'wp_normalize_path' ) ? wp_normalize_path( $upload_info['basedir'] ) : str_replace( '\\', '/', $upload_info['basedir'] ) );
                $norm_abspath = ( function_exists( 'wp_normalize_path' ) ? wp_normalize_path( ABSPATH ) : str_replace( '\\', '/', ABSPATH ) );
                if ( 0 === strpos( $norm_basedir, $norm_abspath ) ) {
                    $rel_prefix = trim( substr( $norm_basedir, strlen( $norm_abspath ) ), '/' );
                    if ( !empty( $rel_prefix ) ) {
                        $prefix = $rel_prefix;
                    }
                }
            }
        }
        return $prefix;
    }

    /**
     * Get the actual governing memory limit of the server.
     *
     * @return string Governing memory limit (e.g. '512M', '256M', etc.)
     */
    public static function get_actual_memory_limit() {
        $ini_limit = ini_get( 'memory_limit' );
        if ( '-1' === $ini_limit || -1 === $ini_limit ) {
            return 'unlimited';
        }
        $ini_bytes = self::convert_hr_to_bytes( $ini_limit );
        $wp_limit_bytes = ( defined( 'WP_MEMORY_LIMIT' ) ? self::convert_hr_to_bytes( WP_MEMORY_LIMIT ) : 0 );
        $wp_max_limit_bytes = ( defined( 'WP_MAX_MEMORY_LIMIT' ) ? self::convert_hr_to_bytes( WP_MAX_MEMORY_LIMIT ) : 0 );
        $max_bytes = max( $ini_bytes, $wp_limit_bytes, $wp_max_limit_bytes );
        if ( $max_bytes === $wp_max_limit_bytes && $wp_max_limit_bytes > 0 ) {
            $governing_limit = WP_MAX_MEMORY_LIMIT;
        } elseif ( $max_bytes === $wp_limit_bytes && $wp_limit_bytes > 0 ) {
            $governing_limit = WP_MEMORY_LIMIT;
        } else {
            $governing_limit = $ini_limit;
        }
        return strtoupper( trim( $governing_limit ) );
    }

    /**
     * Helper to convert shorthand memory notation to bytes.
     *
     * @param string $value Memory limit string.
     * @return int Number of bytes.
     */
    public static function convert_hr_to_bytes( $value ) {
        $value = trim( $value );
        $qty = (int) $value;
        $unit = strtolower( substr( $value, -1 ) );
        if ( 'b' === $unit ) {
            $value = substr( $value, 0, -1 );
            $unit = strtolower( substr( trim( $value ), -1 ) );
        }
        switch ( $unit ) {
            case 'g':
                $qty *= 1073741824;
                break;
            case 'm':
                $qty *= 1048576;
                break;
            case 'k':
                $qty *= 1024;
                break;
        }
        return $qty;
    }

}
