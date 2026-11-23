<?php
/**
 * Centralized Storage Paths Resolver for ImgSentry & ImgSentry.
 *
 * Provides a single source of truth for all plugin storage locations:
 * parent folder, backups, thumbnail cache, temporary processing scratchpads,
 * and quarantine trash folders.
 *
 * @package    ImgSentry
 * @subpackage Storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Storage_Paths {

	/**
	 * Top-level consolidated parent folder name inside wp-content/uploads/
	 */
	const PARENT_FOLDER_NAME = 'imgsentry';

	/**
	 * Get the root uploads directory information array safely.
	 *
	 * @return array
	 */
	public static function get_upload_dir(): array {
		return wp_upload_dir();
	}

	/**
	 * Get the absolute path to the consolidated parent directory.
	 * Default: wp-content/uploads/imgsentry/
	 *
	 * @return string Normalized path with trailing slash.
	 */
	public static function get_base_dir(): string {
		$upload_dir = self::get_upload_dir();
		$base_dir   = trailingslashit( $upload_dir['basedir'] ) . self::PARENT_FOLDER_NAME . '/';
		return wp_normalize_path( $base_dir );
	}

	/**
	 * Get the public base URL for the consolidated parent directory.
	 * Default: https://example.com/wp-content/uploads/imgsentry/
	 *
	 * @return string Normalized URL with trailing slash.
	 */
	public static function get_base_url(): string {
		$upload_dir = self::get_upload_dir();
		return trailingslashit( $upload_dir['baseurl'] ) . self::PARENT_FOLDER_NAME . '/';
	}

	/**
	 * Get the backups directory (permanent image backups before optimization/trash).
	 * Default: wp-content/uploads/imgsentry/backups/
	 *
	 * @param string $sub Subdirectory or date path (e.g. '2026/09/123').
	 * @return string
	 */
	public static function get_backups_dir( string $sub = '' ): string {
		$dir = self::get_base_dir() . 'backups/';
		if ( ! empty( $sub ) ) {
			$dir .= trim( $sub, '/\\' ) . '/';
		}
		return wp_normalize_path( $dir );
	}

	/**
	 * Get the thumbnail cache directory for File Manager grid/list previews.
	 * Default: wp-content/uploads/imgsentry/cache/thumbs/
	 *
	 * @param string $sub Subdirectory name (e.g. 'thumbs').
	 * @return string
	 */
	public static function get_cache_dir( string $sub = 'thumbs' ): string {
		$dir = self::get_base_dir() . 'cache/';
		if ( ! empty( $sub ) ) {
			$dir .= trim( $sub, '/\\' ) . '/';
		}
		return wp_normalize_path( $dir );
	}

	/**
	 * Get the thumbnail cache public URL for File Manager previews.
	 *
	 * @param string $sub Subdirectory name (e.g. 'thumbs').
	 * @return string
	 */
	public static function get_cache_url( string $sub = 'thumbs' ): string {
		$url = self::get_base_url() . 'cache/';
		if ( ! empty( $sub ) ) {
			$url .= trim( $sub, '/' ) . '/';
		}
		return $url;
	}

	/**
	 * Get the temporary scratchpad parent or subfolder path.
	 * Default: wp-content/uploads/imgsentry/temp/
	 *
	 * @param string $sub Subdirectory: 'optimizer', 'downloads', 'chunks', or custom.
	 * @return string
	 */
	public static function get_temp_dir( string $sub = '' ): string {
		$dir = self::get_base_dir() . 'temp/';
		if ( ! empty( $sub ) ) {
			$dir .= trim( $sub, '/\\' ) . '/';
		}
		return wp_normalize_path( $dir );
	}

	/**
	 * Get public URL for temporary download archives (e.g. ZIP downloads).
	 *
	 * @param string $sub Subdirectory (e.g. 'downloads').
	 * @return string
	 */
	public static function get_temp_url( string $sub = 'downloads' ): string {
		$url = self::get_base_url() . 'temp/';
		if ( ! empty( $sub ) ) {
			$url .= trim( $sub, '/' ) . '/';
		}
		return $url;
	}

	/**
	 * Get the list of all active temp subdirectories managed by the plugin.
	 *
	 * @return array<string, string> Map of purpose key to absolute directory path.
	 */
	public static function get_temp_subdirs(): array {
		return array(
			'optimizer' => self::get_temp_dir( 'optimizer' ),
			'downloads' => self::get_temp_dir( 'downloads' ),
			'chunks'    => self::get_temp_dir( 'chunks' ),
			'thumbs'    => self::get_cache_dir( 'thumbs' ),
		);
	}

	/**
	 * Get the list of all active cache subdirectories managed by the plugin.
	 *
	 * @return array<string, string> Map of purpose key to absolute directory path.
	 */
	public static function get_cache_subdirs(): array {
		return array(
			'thumbs' => self::get_cache_dir( 'thumbs' ),
		);
	}

	/**
	 * Get the list of legacy temporary directories for backward-compatibility sweeps.
	 *
	 * @return array<string>
	 */
	public static function get_legacy_temp_dirs(): array {
		$upload_dir = self::get_upload_dir();
		$basedir    = trailingslashit( $upload_dir['basedir'] );

		return array(
			wp_normalize_path( $basedir . 'imgsentry-temp/' ),
			wp_normalize_path( $basedir . 'imgsentry-fm-temp/' ),
			wp_normalize_path( $basedir . 'imgsentry-fm-uploads/' ),
		);
	}

	/**
	 * Get the quarantine trash directory.
	 * Default: wp-content/uploads/imgsentry/trash/
	 *
	 * @param string $sub Subdirectory: 'media', 'files', or specific ID.
	 * @return string
	 */
	public static function get_trash_dir( string $sub = '' ): string {
		$dir = self::get_base_dir() . 'trash/';
		if ( ! empty( $sub ) ) {
			$dir .= trim( $sub, '/\\' ) . '/';
		}
		return wp_normalize_path( $dir );
	}

	/**
	 * Get the Media Library trash quarantine directory.
	 * Structure: wp-content/uploads/imgsentry/trash/media/{year}/{month}/{attachment_id}/
	 *
	 * Uses the attachment's post_date (or current date if post_date is unavailable)
	 * to determine the year/month bucket — consistent with how get_backup_base_dir() does this.
	 *
	 * @param int|string $attachment_id Optional attachment ID or sub-path.
	 * @param string     $date_str      Optional date string override (e.g. post_date 'YYYY-MM-DD HH:MM:SS').
	 * @return string Normalized path with trailing slash.
	 */
	public static function get_trash_media_dir( $attachment_id = '', string $date_str = '' ): string {
		$dir = self::get_trash_dir( 'media' );
		$att_id_str = trim( (string) $attachment_id, '/\\' );

		if ( ! empty( $att_id_str ) ) {
			// If attachment_id already contains sub-path slashes (e.g. '2026/09/123'), use as-is
			if ( strpos( $att_id_str, '/' ) !== false || strpos( $att_id_str, '\\' ) !== false ) {
				$dir .= $att_id_str . '/';
			} else {
				$att_id_int = is_numeric( $att_id_str ) ? intval( $att_id_str ) : 0;
				$year  = '';
				$month = '';

				if ( ! empty( $date_str ) && $date_str !== '0000-00-00 00:00:00' ) {
					$timestamp = strtotime( $date_str );
					if ( $timestamp ) {
						$year  = gmdate( 'Y', $timestamp );
						$month = gmdate( 'm', $timestamp );
					}
				}

				if ( ( empty( $year ) || empty( $month ) ) && $att_id_int > 0 && function_exists( 'get_post' ) ) {
					$post = get_post( $att_id_int );
					if ( $post && ! empty( $post->post_date ) && $post->post_date !== '0000-00-00 00:00:00' ) {
						$timestamp = strtotime( $post->post_date );
						if ( $timestamp ) {
							$year  = gmdate( 'Y', $timestamp );
							$month = gmdate( 'm', $timestamp );
						}
					}
				}

				if ( empty( $year ) || empty( $month ) ) {
					$year  = gmdate( 'Y' );
					$month = gmdate( 'm' );
				}

				$dir .= $year . '/' . $month . '/' . $att_id_str . '/';
			}
		}

		return wp_normalize_path( $dir );
	}

	/**
	 * Get the File Manager filesystem trash quarantine directory.
	 * Default: wp-content/uploads/imgsentry/trash/files/
	 *
	 * @param string $sub Optional sub-path.
	 * @return string
	 */
	public static function get_trash_files_dir( string $sub = '' ): string {
		$dir = self::get_trash_dir( 'files' );
		if ( ! empty( $sub ) ) {
			$dir .= trim( $sub, '/\\' ) . '/';
		}
		return wp_normalize_path( $dir );
	}

	/**
	 * Initialize and secure all required plugin storage directories with .htaccess and index.php.
	 *
	 * @return bool True if created/secured successfully.
	 */
	public static function init_storage(): bool {
		$dirs_to_init = array(
			self::get_base_dir(),
			self::get_backups_dir(),
			self::get_cache_dir( 'thumbs' ),
			self::get_temp_dir(),
			self::get_temp_dir( 'optimizer' ),
			self::get_temp_dir( 'downloads' ),
			self::get_temp_dir( 'chunks' ),
			self::get_trash_dir( 'media' ),
			self::get_trash_dir( 'files' ),
		);

		foreach ( $dirs_to_init as $dir ) {
			if ( ! is_dir( $dir ) ) {
				wp_mkdir_p( $dir );
			}
			if ( class_exists( 'ImgSentry_FM_Security' ) ) {
				ImgSentry_FM_Security::harden_upload_directory( $dir );
			}
		}

		// Apply security shields (Deny all direct web access to backups, temp scratchpads, and trash)
		$protected_dirs = array(
			self::get_base_dir(),
			self::get_backups_dir(),
			self::get_temp_dir(),
			self::get_trash_dir(),
		);

		foreach ( $protected_dirs as $protected_dir ) {
			if ( is_dir( $protected_dir ) ) {
				$htaccess_file = trailingslashit( $protected_dir ) . '.htaccess';
				if ( ! file_exists( $htaccess_file ) ) {
					// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
					@file_put_contents( $htaccess_file, "Order deny,allow\nDeny from all\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n" );
				}
				$index_file = trailingslashit( $protected_dir ) . 'index.php';
				if ( ! file_exists( $index_file ) ) {
					// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
					@file_put_contents( $index_file, "<?php\n// Silence is golden.\n" );
				}
			}
		}

		// Explicit allow rule for public thumbnail cache folder to override base_dir deny
		$cache_base = self::get_cache_dir();
		if ( is_dir( $cache_base ) ) {
			$cache_ht = trailingslashit( $cache_base ) . '.htaccess';
			if ( ! file_exists( $cache_ht ) ) {
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
				@file_put_contents(
					$cache_ht,
					"<FilesMatch \"\\.(jpg|jpeg|png|gif|webp|svg)$\">\n" .
					"    <IfModule mod_authz_core.c>\n" .
					"        Require all granted\n" .
					"    </IfModule>\n" .
					"    <IfModule !mod_authz_core.c>\n" .
					"        Order allow,deny\n" .
					"        Allow from all\n" .
					"    </IfModule>\n" .
					"</FilesMatch>\n"
				);
			}
		}

		return true;
	}
}
