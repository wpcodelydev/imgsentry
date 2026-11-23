<?php
/**
 * Detects images that another image-optimization plugin has already optimized.
 *
 * One shared rule used by the Media Library column, the Optimize Images page (single and bulk
 * optimization), the background queue and optimize-on-upload: an image that was already
 * optimized elsewhere is left alone unless the user explicitly asks to optimize it again.
 *
 * Only data the other plugins write themselves is read (checked against their source code):
 * Imagify (_imagify_status), LiteSpeed Cache (litespeed-optimize-size / -set), Smush
 * (wp-smpro-smush-data), ShortPixel (table shortpixel_postmeta) and EWWW (table ewwwio_images).
 * More plugins can be added with the 'imgsentry_externally_optimized' filter.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_External_Optimizers {

	/**
	 * Whether another plugin already optimized this image.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool
	 */
	public static function is_optimized( $attachment_id ) {
		global $wpdb;
		static $cache = array();

		$attachment_id = absint( $attachment_id );
		if ( $attachment_id <= 0 ) {
			return false;
		}
		if ( isset( $cache[ $attachment_id ] ) ) {
			return $cache[ $attachment_id ];
		}

		$found = false;

		if ( in_array( get_post_meta( $attachment_id, '_imagify_status', true ), array( 'success', 'already_optimized' ), true ) ) {
			$found = true;
		} elseif ( get_post_meta( $attachment_id, 'litespeed-optimize-size', true ) || get_post_meta( $attachment_id, 'litespeed-optimize-set', true ) ) {
			$found = true;
		} elseif ( ! empty( get_post_meta( $attachment_id, 'wp-smpro-smush-data', true ) ) ) {
			$found = true;
		}

		if ( ! $found && self::table_exists( $wpdb->prefix . 'shortpixel_postmeta' ) ) {
			// ShortPixel: image_type 0 = the full-size image, status 2 = optimized successfully.
			$found = (bool) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Reads another plugin's table; no WordPress API exists for it. Result is cached below.
				$wpdb->prepare(
					"SELECT 1 FROM {$wpdb->prefix}shortpixel_postmeta WHERE attach_id = %d AND image_type = 0 AND status = 2 LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name is the site prefix plus a fixed string.
					$attachment_id
				)
			);
		}

		if ( ! $found && self::table_exists( $wpdb->prefix . 'ewwwio_images' ) ) {
			// EWWW: a finished (not pending) record that has a size.
			$found = (bool) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Reads another plugin's table; no WordPress API exists for it. Result is cached below.
				$wpdb->prepare(
					"SELECT 1 FROM {$wpdb->prefix}ewwwio_images WHERE attachment_id = %d AND pending = 0 AND image_size > 0 LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name is the site prefix plus a fixed string.
					$attachment_id
				)
			);
		}

		/**
		 * Filters whether another plugin already optimized an image.
		 *
		 * @param bool $found         True when the image was already optimized elsewhere.
		 * @param int  $attachment_id Attachment ID.
		 */
		$cache[ $attachment_id ] = (bool) apply_filters( 'imgsentry_externally_optimized', $found, $attachment_id );

		return $cache[ $attachment_id ];
	}

	/**
	 * Whether a database table exists (checked once per request).
	 *
	 * @param string $table Full table name.
	 * @return bool
	 */
	private static function table_exists( $table ) {
		global $wpdb;
		static $cache = array();

		if ( ! isset( $cache[ $table ] ) ) {
			$cache[ $table ] = ( $table === $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Cached in a static variable for the request.
		}

		return $cache[ $table ];
	}
}
