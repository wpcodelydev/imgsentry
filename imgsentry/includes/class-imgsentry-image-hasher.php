<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Real PHP Hashing Engine for Duplicate Image Detection.
 * Computes and caches exact byte-for-byte hashes and visual perceptual hashes (dHash).
 */
class ImgSentry_Image_Hasher {
	const HASH_ALGO_VERSION = 4;

	/**
	 * Computes an exact content hash (MD5) of the physical file.
	 * Catches byte-identical files regardless of filename.
	 *
	 * @param int $attachment_id The attachment post ID.
	 * @return string|false The 32-character hex MD5 hash, or false on failure.
	 */
	public static function get_exact_hash( $attachment_id ) {
		$file_path = get_attached_file( $attachment_id );
		if ( ! $file_path || ! file_exists( $file_path ) ) {
			return false;
		}

		// Check if we have a valid, up-to-date cache
		$cached_hash = self::get_cached_hash( $attachment_id, '_imgsentry_exact_hash', $file_path );
		if ( $cached_hash !== false ) {
			return $cached_hash;
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
		$hash = @md5_file( $file_path );
		if ( $hash ) {
			update_post_meta( $attachment_id, '_imgsentry_exact_hash', $hash );
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
			update_post_meta( $attachment_id, '_imgsentry_hash_computed_at', @filemtime( $file_path ) );
		}

		return $hash;
	}

	/**
	 * Computes or retrieves the exact MD5 hash of a physical file path.
	 * Leverages postmeta caching if the file is a registered WordPress attachment,
	 * or computes live md5_file() for non-attachment files.
	 *
	 * @param string $file_path Physical absolute file path.
	 * @return string|false 32-character hex MD5 string, or false on failure.
	 */
	public static function get_file_hash( $file_path ) {
		if ( ! $file_path || ! file_exists( $file_path ) || is_dir( $file_path ) ) {
			return false;
		}

		// Check if file corresponds to a WordPress attachment ID using centralized resolver
		$attachment_id = 0;
		if ( class_exists( 'ImgSentry_FM_Media_Sync' ) ) {
			$attachment_id = (int) ImgSentry_FM_Media_Sync::get_attachment_id_by_path( (string) $file_path );
		} elseif ( function_exists( 'wp_upload_dir' ) ) {
			$upload_dir = wp_upload_dir();
			$base_dir   = str_replace( '\\', '/', $upload_dir['basedir'] );
			$norm_path  = str_replace( '\\', '/', $file_path );

			if ( 0 === strpos( $norm_path, $base_dir ) ) {
				$rel_attached = ltrim( substr( $norm_path, strlen( $base_dir ) ), '/' );

				global $wpdb;
				if ( isset( $wpdb ) && $wpdb instanceof \wpdb ) {
					$attachment_id = (int) $wpdb->get_var(
						$wpdb->prepare(
							"SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value = %s LIMIT 1",
							$rel_attached
						)
					);
				}
			}
		}

		// If attachment ID found, leverage existing get_exact_hash() with postmeta caching
		if ( $attachment_id > 0 ) {
			$hash = self::get_exact_hash( $attachment_id );
			if ( $hash ) {
				return $hash;
			}
		}

		// Fallback for non-attachment files (e.g. theme files, .zip, .php, .css): compute live
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
		return @md5_file( $file_path );
	}

	/**
	 * Name of the image engine used for perceptual hashes ('imagick', 'gd' or '').
	 */
	public static function current_engine() {
		return class_exists( 'Imagick' ) ? 'imagick' : ( function_exists( 'gd_info' ) ? 'gd' : '' );
	}

	/**
	 * Computes a 64-bit Perceptual Difference Hash (dHash) from pixel data.
	 * Catches resized or re-compressed versions of the same visual image.
	 *
	 * @param int $attachment_id The attachment post ID.
	 * @return string|false The 16-character hex dHash string, or false on failure/unsupported.
	 */
	public static function get_perceptual_hash( $attachment_id ) {
		$file_path = get_attached_file( $attachment_id );
		if ( ! $file_path || ! file_exists( $file_path ) ) {
			return false;
		}

		$mime_type = get_post_mime_type( $attachment_id );
		if ( strpos( (string) $mime_type, 'image/' ) !== 0 ) {
			return false; // Not an image, cannot calculate dHash
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
		$file_mtime = (int) @filemtime( $file_path );
		if ( ! $file_mtime ) {
			return false;
		}

		$engine = self::current_engine();
		if ( empty( $engine ) ) {
			return false;
		}

		// Filesize guard to prevent memory exhaustion on oversized images
		$max_size  = apply_filters( 'imgsentry_max_hashable_file_size', 25 * 1024 * 1024 );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
		$file_size = @filesize( $file_path );
		if ( $file_size && $file_size > $max_size ) {
			update_post_meta( $attachment_id, '_imgsentry_phash_unsupported', '1' );
			update_post_meta( $attachment_id, '_imgsentry_phash_algo', (string) self::HASH_ALGO_VERSION );
			update_post_meta( $attachment_id, '_imgsentry_phash_computed_at', $file_mtime );
			update_post_meta( $attachment_id, '_imgsentry_phash_engine', $engine );
			return false;
		}

		// Check for animation or SVG
		if ( 'image/svg+xml' === $mime_type || self::is_animated_image( $file_path, $mime_type ) ) {
			update_post_meta( $attachment_id, '_imgsentry_phash_unsupported', '1' );
			update_post_meta( $attachment_id, '_imgsentry_phash_algo', (string) self::HASH_ALGO_VERSION );
			update_post_meta( $attachment_id, '_imgsentry_phash_computed_at', $file_mtime );
			update_post_meta( $attachment_id, '_imgsentry_phash_engine', $engine );
			return false;
		}

		// Check if we have a valid, up-to-date cache
		$cached_hash       = get_post_meta( $attachment_id, '_imgsentry_phash', true );
		$phash_computed_at = (int) get_post_meta( $attachment_id, '_imgsentry_phash_computed_at', true );
		$phash_algo        = get_post_meta( $attachment_id, '_imgsentry_phash_algo', true );
		$phash_engine      = get_post_meta( $attachment_id, '_imgsentry_phash_engine', true );

		if ( '' !== (string) $cached_hash && $phash_computed_at === $file_mtime && (string) $phash_algo === (string) self::HASH_ALGO_VERSION && $phash_engine === $engine ) {
			return $cached_hash;
		}

		// Check if it was explicitly marked as unsupported with current mtime/algo/engine
		$is_unsupported = get_post_meta( $attachment_id, '_imgsentry_phash_unsupported', true );
		if ( '1' === (string) $is_unsupported && $phash_computed_at === $file_mtime && (string) $phash_algo === (string) self::HASH_ALGO_VERSION && $phash_engine === $engine ) {
			return false;
		}

		// Poison flag: mark unsupported before starting compute so crashes/timeouts don't retry forever
		update_post_meta( $attachment_id, '_imgsentry_phash_unsupported', '1' );
		update_post_meta( $attachment_id, '_imgsentry_phash_computed_at', $file_mtime );
		update_post_meta( $attachment_id, '_imgsentry_phash_algo', (string) self::HASH_ALGO_VERSION );
		update_post_meta( $attachment_id, '_imgsentry_phash_engine', $engine );

		$hash = false;

		// Prefer Imagick for superior format support, fallback to GD
		if ( 'imagick' === $engine ) {
			$hash = self::compute_dhash_imagick( $file_path );
		} elseif ( 'gd' === $engine ) {
			$hash = self::compute_dhash_gd( $file_path, $mime_type );
		}

		if ( $hash ) {
			delete_post_meta( $attachment_id, '_imgsentry_phash_unsupported' );
			update_post_meta( $attachment_id, '_imgsentry_phash', $hash );
			update_post_meta( $attachment_id, '_imgsentry_phash_algo', (string) self::HASH_ALGO_VERSION );
			update_post_meta( $attachment_id, '_imgsentry_phash_computed_at', $file_mtime );
			update_post_meta( $attachment_id, '_imgsentry_phash_engine', $engine );
		}

		return $hash;
	}

	/**
	 * Process a batch of attachment IDs, computing and caching both hashes.
	 * Designed for AJAX/Cron batch processing.
	 *
	 * @param array $ids Array of attachment post IDs.
	 * @return array Associative array with 'success' and 'failed' counts.
	 */
	public static function backfill_batch( $ids ) {
		$success = 0;
		$failed  = 0;
		$phash_unsupported = 0;

		// Memory and timeout safeguards for image batch processing
		if ( function_exists( 'wp_raise_memory_limit' ) ) {
			wp_raise_memory_limit( 'image' );
		}
		if ( function_exists( 'set_time_limit' ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
			@set_time_limit( 60 );
		}

		foreach ( $ids as $id ) {
			try {
				$exact_hash = self::get_exact_hash( $id );
				$phash      = self::get_perceptual_hash( $id );

				// If we got an exact hash, the file exists and is readable.
				// (Phash might gracefully return false if it's a PDF/Document, which is fine).
				if ( $exact_hash !== false ) {
					$success++;
					if ( $phash === false && strpos( get_post_mime_type( $id ), 'image/' ) === 0 ) {
						$phash_unsupported++;
					}
				} else {
					$failed++;
				}
			} catch ( Throwable $e ) {
				$failed++;
			} catch ( Exception $e ) {
				$failed++;
			}
		}

		return array(
			'success'            => $success,
			'failed'             => $failed,
			'phash_unsupported'  => $phash_unsupported,
		);
	}

	/**
	 * Verifies cache freshness against the actual file modified time.
	 */
	private static function get_cached_hash( $attachment_id, $meta_key, $file_path ) {
		$computed_at = get_post_meta( $attachment_id, '_imgsentry_hash_computed_at', true );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
		$file_mtime  = @filemtime( $file_path );

		// If missing timestamps or file modified since last hash, cache is invalid
		if ( ! $computed_at || ! $file_mtime || (int) $computed_at !== (int) $file_mtime ) {
			return false;
		}

		$cached_hash = get_post_meta( $attachment_id, $meta_key, true );
		if ( '' === $cached_hash ) {
			return false;
		}

		return $cached_hash;
	}

	/**
	 * Helper to convert shorthand memory limit string (e.g. "256M", "1G") to bytes.
	 */
	private static function parse_memory_limit( $limit ) {
		if ( empty( $limit ) || '-1' === (string) $limit ) {
			return -1;
		}
		$limit = trim( $limit );
		$last  = strtolower( substr( $limit, -1 ) );
		$val   = (float) $limit;

		switch ( $last ) {
			case 'g':
				$val *= 1024 * 1024 * 1024;
				break;
			case 'm':
				$val *= 1024 * 1024;
				break;
			case 'k':
				$val *= 1024;
				break;
		}
		return (int) $val;
	}

	/**
	 * Computes dHash using GD library.
	 */
	private static function compute_dhash_gd( $file_path, $mime_type ) {
		// Pre-check image pixel dimensions and estimated memory usage before decompressing
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
		$image_info = @getimagesize( $file_path );
		if ( ! is_array( $image_info ) || empty( $image_info[0] ) || empty( $image_info[1] ) ) {
			return false;
		}

		$img_w = (int) $image_info[0];
		$img_h = (int) $image_info[1];

		// Estimated memory needed for GD uncompressed RGBA bitmap (width * height * 4 * 2x GD overhead)
		$required_memory = $img_w * $img_h * 4 * 2;

		$memory_limit = function_exists( 'ini_get' ) ? ini_get( 'memory_limit' ) : '256M';
		$limit_bytes  = self::parse_memory_limit( $memory_limit );

		if ( $limit_bytes > 0 ) {
			$safe_limit    = $limit_bytes * 0.8;
			$current_usage = function_exists( 'memory_get_usage' ) ? memory_get_usage( true ) : 0;
			if ( ( $current_usage + $required_memory ) > $safe_limit ) {
				return false;
			}
		}

		$source = false;

		switch ( $mime_type ) {
			case 'image/jpeg':
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
				$source = @imagecreatefromjpeg( $file_path );
				break;
			case 'image/png':
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
				$source = @imagecreatefrompng( $file_path );
				break;
			case 'image/gif':
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
				$source = @imagecreatefromgif( $file_path );
				break;
			case 'image/webp':
				if ( function_exists( 'imagecreatefromwebp' ) ) {
					// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
					$source = @imagecreatefromwebp( $file_path );
				}
				break;
		}

		if ( ! $source ) {
			return false;
		}

		$width  = imagesx( $source );
		$height = imagesy( $source );

		// Flatten alpha onto a white background before resizing/grayscaling
		$flattened = imagecreatetruecolor( $width, $height );
		$white_bg  = imagecolorallocate( $flattened, 255, 255, 255 );
		imagefilledrectangle( $flattened, 0, 0, $width, $height, $white_bg );
		imagecopy( $flattened, $source, 0, 0, 0, 0, $width, $height );
		imagedestroy( $source );
		$source = $flattened;

		// 1. Create a 9x8 target image
		$resized = imagecreatetruecolor( 9, 8 );
		
		// Fill background with white to handle transparency
		$white = imagecolorallocate( $resized, 255, 255, 255 );
		imagefill( $resized, 0, 0, $white );

		// 2. Resize ignoring aspect ratio (squash down to 9x8)
		imagecopyresampled( $resized, $source, 0, 0, 0, 0, 9, 8, $width, $height );

		// 3. Convert to grayscale
		imagefilter( $resized, IMG_FILTER_GRAYSCALE );

		$hash_binary = '';

		// 4. Compare pixels. 8 rows (Y), 9 columns (X).
		// We compare pixel X to pixel X+1 (the one to its right). Total 8 comparisons per row.
		for ( $y = 0; $y < 8; $y++ ) {
			for ( $x = 0; $x < 8; $x++ ) {
				$left_rgb  = imagecolorat( $resized, $x, $y );
				$right_rgb = imagecolorat( $resized, $x + 1, $y );

				// Since image is grayscale, Red, Green, and Blue channels are equal.
				// We bitshift to isolate just the Red channel for brightness comparison.
				$left_brightness  = ( $left_rgb >> 16 ) & 0xFF;
				$right_brightness = ( $right_rgb >> 16 ) & 0xFF;

				// If left pixel is brighter than the right pixel, bit is 1. Else 0.
				$hash_binary .= ( $left_brightness > $right_brightness ) ? '1' : '0';
			}
		}

		imagedestroy( $source );
		imagedestroy( $resized );

		// 5. Pack 64 bits into a 16-char hex string
		return self::binary_to_hex( $hash_binary );
	}

	/**
	 * Computes dHash using Imagick library.
	 */
	private static function compute_dhash_imagick( $file_path ) {
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
		$gi = @getimagesize( $file_path );
		$max_pixels = apply_filters( 'imgsentry_max_hashable_pixels', 100000000 );
		if ( $gi && ( (int) $gi[0] * (int) $gi[1] ) > $max_pixels ) {
			return false;
		}

		$image = null;
		try {
			$image = new Imagick();

			// Set resource limits derived from memory-guard budget / WP_MEMORY_LIMIT
			$mem_str    = defined( 'WP_MEMORY_LIMIT' ) ? WP_MEMORY_LIMIT : ( function_exists( 'ini_get' ) ? ini_get( 'memory_limit' ) : '256M' );
			$mem_bytes  = self::parse_memory_limit( $mem_str );
			$safe_limit = $mem_bytes > 0 ? (int) ( $mem_bytes * 0.8 ) : 256 * 1024 * 1024;

			if ( defined( 'Imagick::RESOURCETYPE_MEMORY' ) ) {
				$image->setResourceLimit( Imagick::RESOURCETYPE_MEMORY, $safe_limit );
			}
			if ( defined( 'Imagick::RESOURCETYPE_MAP' ) ) {
				$image->setResourceLimit( Imagick::RESOURCETYPE_MAP, $safe_limit );
			}

			// Reduce decoding overhead for JPEG sources
			if ( is_array( $gi) && isset( $gi['mime'] ) && 'image/jpeg' === $gi['mime'] ) {
				if ( method_exists( $image, 'setOption' ) ) {
					$image->setOption( 'jpeg:size', '256x256' );
				}
			}

			// Load only the first frame
			$image->readImage( $file_path . '[0]' );

			// Auto-orient
			if ( method_exists( $image, 'autoOrient' ) ) {
				$image->autoOrient();
			}

			// Flatten transparency onto a white background and remove alpha
			if ( method_exists( $image, 'setImageBackgroundColor' ) ) {
				$image->setImageBackgroundColor( 'white' );
			}
			if ( method_exists( $image, 'mergeImageLayers' ) && defined( 'Imagick::LAYERMETHOD_FLATTEN' ) ) {
				$flattened = $image->mergeImageLayers( Imagick::LAYERMETHOD_FLATTEN );
				$image->clear();
				$image->destroy();
				$image = $flattened;
			}
			if ( method_exists( $image, 'setImageAlphaChannel' ) && defined( 'Imagick::ALPHACHANNEL_REMOVE' ) ) {
				$image->setImageAlphaChannel( Imagick::ALPHACHANNEL_REMOVE );
			}

			// 1. Resize ignoring aspect ratio
			$image->resizeImage( 9, 8, Imagick::FILTER_LANCZOS, 1, false );

			// 2. Convert to grayscale
			$image->transformImageColorspace( Imagick::COLORSPACE_GRAY );

			$hash_binary = '';
			$iterator    = $image->getPixelIterator();

			// 3. Compare pixels
			for ( $y = 0; $y < 8; $y++ ) {
				$iterator->setIteratorRow( $y );
				$pixels = $iterator->getCurrentIteratorRow();

				for ( $x = 0; $x < 8; $x++ ) {
					$left_color  = $pixels[ $x ]->getColor();
					$right_color = $pixels[ $x + 1 ]->getColor();

					$hash_binary .= ( $left_color['r'] > $right_color['r'] ) ? '1' : '0';
				}
			}

			return self::binary_to_hex( $hash_binary );

		} catch ( Throwable $e ) {
			return false;
		} finally {
			if ( $image instanceof Imagick ) {
				$image->clear();
				$image->destroy();
			}
		}
	}

	/**
	 * Cheap header sniffing for animated images.
	 */
	private static function is_animated_image( $file_path, $mime_type ) {
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- The filesystem call can fail on some hosts; the result is checked. Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
		$fp = @fopen( $file_path, 'rb' );
		if ( ! $fp ) return false;

		if ( 'image/gif' === $mime_type ) {
			$count  = 0;
			$buffer = '';
			while ( ! feof( $fp ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
				$chunk = fread( $fp, 64 * 1024 );
				if ( false === $chunk || '' === $chunk ) {
					break;
				}
				$data  = $buffer . $chunk;
				$count += substr_count( $data, "\x00\x21\xF9\x04" );
				if ( $count >= 2 ) {
					// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
					fclose( $fp );
					return true;
				}
				$buffer = substr( $data, -3 );
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
			fclose( $fp );
			return false;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
		$content = fread( $fp, 64 * 1024 );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
		fclose( $fp );

		if ( 'image/webp' === $mime_type ) {
			return strpos( substr( $content, 0, 256 ), 'ANIM' ) !== false;
		}
		if ( 'image/png' === $mime_type ) {
			return strpos( substr( $content, 0, 1024 ), 'acTL' ) !== false;
		}
		return false;
	}

	/**
	 * Helper: Converts a 64-character binary string to a 16-character hex string.
	 * Processes in 4-bit chunks to avoid floating-point/precision issues on 32-bit systems.
	 */
	private static function binary_to_hex( $binary_string ) {
		$hex = '';
		$chunks = str_split( $binary_string, 4 );
		foreach ( $chunks as $chunk ) {
			$hex .= dechex( bindec( $chunk ) );
		}
		return str_pad( $hex, 16, '0', STR_PAD_LEFT ); // Ensure leading zeros aren't dropped
	}
}
