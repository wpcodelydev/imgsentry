<?php
/**
 * ImgSentry Image Optimization Stats Single Source of Truth Class.
 *
 * High-performance, cached statistics calculator optimized for massive media libraries.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Optimization_Stats {

	/**
	 * Get expected savings ratio dynamically based on compression preset and MIME type.
	 *
	 * @param string $compression_level Compression preset ('lossless', 'balanced', 'aggressive', 'custom').
	 * @param string $mime_or_ext       MIME type or file extension.
	 * @param int|null $custom_quality  Custom quality if level is 'custom'.
	 * @return float Compression saving ratio (0.0 to 1.0).
	 */
	public static function get_dynamic_saving_ratio( $compression_level = 'balanced', $mime_or_ext = 'image/jpeg', $custom_quality = null ) {
		$level = strtolower( trim( strval( $compression_level ) ) );
		$type  = strtolower( trim( strval( $mime_or_ext ) ) );

		$is_jpeg = strpos( $type, 'jpeg' ) !== false || strpos( $type, 'jpg' ) !== false;
		$is_png  = strpos( $type, 'png' ) !== false;
		$is_webp = strpos( $type, 'webp' ) !== false;
		$is_gif  = strpos( $type, 'gif' ) !== false;

		switch ( $level ) {
			case 'lossless':
				if ( $is_png ) {
					return 0.28; // PNG lossless palette / Deflate reduction
				} elseif ( $is_jpeg ) {
					return 0.18; // Metadata strip + Huffman optimization
				} elseif ( $is_gif ) {
					return 0.12;
				} elseif ( $is_webp ) {
					return 0.10;
				}
				return 0.15;

			case 'aggressive':
				if ( $is_png ) {
					return 0.78; // Aggressive quant + downsample
				} elseif ( $is_jpeg ) {
					return 0.72; // Quality 58 aggressive quantization
				} elseif ( $is_gif ) {
					return 0.45;
				} elseif ( $is_webp ) {
					return 0.60;
				}
				return 0.70;

			case 'custom':
				$q = ( null !== $custom_quality && is_numeric( $custom_quality ) ) ? max( 1, min( 100, (int) $custom_quality ) ) : 78;
				// Linear interpolation between quality 1 (90% savings) and quality 100 (10% savings)
				$base_ratio = 0.10 + ( ( 100 - $q ) / 100 ) * 0.80;
				if ( $is_png ) {
					$base_ratio = min( 0.85, $base_ratio * 1.15 );
				}
				return round( $base_ratio, 2 );

			case 'balanced':
			default:
				if ( $is_png ) {
					return 0.58; // Standard PNG optimization
				} elseif ( $is_jpeg ) {
					return 0.48; // Quality 78 sweet spot
				} elseif ( $is_gif ) {
					return 0.25;
				} elseif ( $is_webp ) {
					return 0.35;
				}
				return 0.45;
		}
	}

	// Cache transient key & TTL
	const CACHE_TRANSIENT = 'imgsentry_opt_stats_cache';
	const CACHE_TTL       = 3600; // 1 hour

	/**
	 * Invalidate cached optimization statistics.
	 */
	public static function invalidate_cache() {
		delete_transient( self::CACHE_TRANSIENT );
	}

	/**
	 * Retrieve all optimization stats in a single consolidated, cached payload.
	 *
	 * Uses optimized LEFT JOIN queries to avoid slow subqueries on large databases.
	 *
	 * @param bool $force_refresh Set true to bypass cache and recalculate.
	 * @return array Consolidated statistics dictionary.
	 */
	public static function get_stats( $force_refresh = false ) {
		if ( ! $force_refresh ) {
			$cached = get_transient( self::CACHE_TRANSIENT );
			if ( is_array( $cached ) && isset( $cached['total_images'] ) ) {
				return $cached;
			}
		}

		global $wpdb;

		// 1. Total active images count (using LEFT JOIN ... IS NULL instead of slow NOT IN subquery)
		$total_images = (int) $wpdb->get_var(
			"SELECT COUNT(p.ID) 
			 FROM {$wpdb->posts} p
			 LEFT JOIN {$wpdb->postmeta} pm_trashed 
			   ON p.ID = pm_trashed.post_id AND pm_trashed.meta_key = '_imgsentry_trashed' AND pm_trashed.meta_value = '1'
			 WHERE p.post_type = 'attachment' 
			   AND p.post_mime_type LIKE 'image/%' 
			   AND p.post_status != 'trash' 
			   AND pm_trashed.post_id IS NULL"
		);

		// 2. Count of optimized images (LEFT JOIN ... IS NULL)
		$optimized_count = (int) $wpdb->get_var(
			"SELECT COUNT(p.ID) 
			 FROM {$wpdb->posts} p
			 INNER JOIN {$wpdb->postmeta} pm_opt 
			   ON p.ID = pm_opt.post_id AND pm_opt.meta_key = '_imgsentry_optimized' AND pm_opt.meta_value = '1'
			 LEFT JOIN {$wpdb->postmeta} pm_trashed 
			   ON p.ID = pm_trashed.post_id AND pm_trashed.meta_key = '_imgsentry_trashed' AND pm_trashed.meta_value = '1'
			 WHERE p.post_type = 'attachment' 
			   AND p.post_mime_type LIKE 'image/%' 
			   AND p.post_status != 'trash' 
			   AND pm_trashed.post_id IS NULL"
		);

		// 3. Optimized percentage
		$percentage = $total_images > 0 ? round( ( $optimized_count / $total_images ) * 100, 1 ) : 0.0;

		// 4. Total bytes saved across all active optimized images (direct SQL SUM)
		$storage_saved_bytes = (int) $wpdb->get_var(
			"SELECT COALESCE(SUM(CAST(pm_saved.meta_value AS UNSIGNED)), 0)
			 FROM {$wpdb->posts} p
			 INNER JOIN {$wpdb->postmeta} pm_opt 
			   ON p.ID = pm_opt.post_id AND pm_opt.meta_key = '_imgsentry_optimized' AND pm_opt.meta_value = '1'
			 INNER JOIN {$wpdb->postmeta} pm_saved 
			   ON p.ID = pm_saved.post_id AND pm_saved.meta_key = '_imgsentry_bytes_saved'
			 LEFT JOIN {$wpdb->postmeta} pm_trashed 
			   ON p.ID = pm_trashed.post_id AND pm_trashed.meta_key = '_imgsentry_trashed' AND pm_trashed.meta_value = '1'
			 WHERE p.post_type = 'attachment' 
			   AND p.post_mime_type LIKE 'image/%' 
			   AND p.post_status != 'trash' 
			   AND pm_trashed.post_id IS NULL"
		);

		// 5. Current storage size & Potential savings (Batch queried in a single SQL scan)
		$active_rows = $wpdb->get_results(
			"SELECT p.ID, p.post_mime_type, pm_opt.meta_value as is_optimized, pm_meta.meta_value as meta_val
			 FROM {$wpdb->posts} p
			 LEFT JOIN {$wpdb->postmeta} pm_opt 
			   ON p.ID = pm_opt.post_id AND pm_opt.meta_key = '_imgsentry_optimized' AND pm_opt.meta_value = '1'
			 LEFT JOIN {$wpdb->postmeta} pm_meta 
			   ON p.ID = pm_meta.post_id AND pm_meta.meta_key = '_wp_attachment_metadata'
			 LEFT JOIN {$wpdb->postmeta} pm_trashed 
			   ON p.ID = pm_trashed.post_id AND pm_trashed.meta_key = '_imgsentry_trashed' AND pm_trashed.meta_value = '1'
			 WHERE p.post_type = 'attachment' 
			   AND p.post_mime_type LIKE 'image/%' 
			   AND p.post_status != 'trash' 
			   AND pm_trashed.post_id IS NULL",
			ARRAY_A
		);

		$current_storage_bytes   = 0;
		$potential_savings_bytes = 0;

		if ( ! empty( $active_rows ) ) {
			foreach ( $active_rows as $row ) {
				$size = 0;
				if ( ! empty( $row['meta_val'] ) ) {
					// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
					$meta_arr = @maybe_unserialize( $row['meta_val'] );
					if ( is_array( $meta_arr ) && isset( $meta_arr['filesize'] ) ) {
						$size = (int) $meta_arr['filesize'];
					}
				}

				// Fallback to disk filesize only if size was 0
				if ( $size <= 0 ) {
					$file_path = get_attached_file( (int) $row['ID'] );
					if ( $file_path && file_exists( $file_path ) ) {
						// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
						$size = (int) @filesize( $file_path );
					}
				}

				if ( $size > 0 ) {
					$current_storage_bytes += $size;

					// If not yet optimized, calculate potential savings
					if ( empty( $row['is_optimized'] ) ) {
						$mime  = strtolower( $row['post_mime_type'] );
						$ratio = self::get_dynamic_saving_ratio( 'balanced', $mime );
						$potential_savings_bytes += (int) round( $size * $ratio );
					}
				}
			}
		}

		// Calculate backup folder size efficiently (real directory recursive size scan)
		$backup_folder_bytes = 0;
		$backups_base = class_exists( 'ImgSentry_Storage_Paths' )
			? ImgSentry_Storage_Paths::get_backups_dir()
			: ( defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR . '/uploads/imgsentry/backups/' : '' );

		if ( ! empty( $backups_base ) && is_dir( $backups_base ) ) {
			try {
				$iterator = new RecursiveIteratorIterator(
					new RecursiveDirectoryIterator( $backups_base, FilesystemIterator::SKIP_DOTS ),
					RecursiveIteratorIterator::CHILD_FIRST
				);
				foreach ( $iterator as $file ) {
					if ( $file->isFile() ) {
						$backup_folder_bytes += $file->getSize();
					}
				}
			} catch ( Exception $e ) {
				// Ignore errors and keep size at 0
			}
		}

		$stats = array(
			'total_images'            => $total_images,
			'optimized_count'         => $optimized_count,
			'optimized_percentage'    => $percentage,
			'current_storage_bytes'   => $current_storage_bytes,
			'storage_saved_bytes'     => $storage_saved_bytes,
			'potential_savings_bytes' => $potential_savings_bytes,
			'backup_folder_bytes'     => $backup_folder_bytes,
			'calculated_at'           => current_time( 'mysql' ),
		);

		// Cache for 1 hour
		set_transient( self::CACHE_TRANSIENT, $stats, self::CACHE_TTL );

		return $stats;
	}

	/**
	 * Get total count of active images in the library.
	 *
	 * @return int Total count of active images.
	 */
	public static function get_total_images() {
		$stats = self::get_stats();
		return $stats['total_images'];
	}

	/**
	 * Get count of optimized active images in the library.
	 *
	 * @return int Count of optimized images.
	 */
	public static function get_optimized_count() {
		$stats = self::get_stats();
		return $stats['optimized_count'];
	}

	/**
	 * Get optimized percentage.
	 *
	 * @return float Percentage of optimized images (rounded to 1 decimal place).
	 */
	public static function get_optimized_percentage() {
		$stats = self::get_stats();
		return $stats['optimized_percentage'];
	}

	/**
	 * Get total current storage in bytes of all active images.
	 *
	 * @return int Total storage size in bytes.
	 */
	public static function get_current_storage_bytes() {
		$stats = self::get_stats();
		return $stats['current_storage_bytes'];
	}

	/**
	 * Get total storage saved in bytes.
	 *
	 * @return int Total bytes saved.
	 */
	public static function get_storage_saved_bytes() {
		$stats = self::get_stats();
		return $stats['storage_saved_bytes'];
	}

	/**
	 * Get estimated potential saving in bytes for unoptimized active images.
	 *
	 * @return int Estimated bytes that can be saved.
	 */
	public static function get_potential_saving_bytes() {
		$stats = self::get_stats();
		return $stats['potential_savings_bytes'];
	}

	/**
	 * Get total size of the backup directory in bytes.
	 *
	 * @return int Backup directory size in bytes.
	 */
	public static function get_backup_folder_bytes() {
		$stats = self::get_stats();
		return isset( $stats['backup_folder_bytes'] ) ? (int) $stats['backup_folder_bytes'] : 0;
	}

	/**
	 * The size people actually download for an optimized image, and the saving against the original.
	 *
	 * This is for DISPLAY only (Media Library column and Image Optimization page). It does not touch the
	 * disk or quota statistics above, because both the main file and the WebP / AVIF copy stay on disk.
	 *
	 * Rule: when the chosen output format (WebP or AVIF) was generated and its file is smaller than the main
	 * file, that file's size is shown. Otherwise the main file's size is shown.
	 *
	 * @param int        $main_size     Size of the main file in bytes.
	 * @param int        $original_size Size of the original (before optimization) in bytes; 0 when unknown.
	 * @param array|null $next_gen      The _imgsentry_nextgen_formats meta.
	 * @param string     $output_format The _imgsentry_output_format meta.
	 * @return array { size: int, format: string ('' | 'webp' | 'avif'), percent: float|null }
	 */
	public static function get_delivered_info( $main_size, $original_size, $next_gen, $output_format = '' ) {
		$main_size     = max( 0, (int) $main_size );
		$original_size = max( 0, (int) $original_size );
		$next_gen      = is_array( $next_gen ) ? $next_gen : array();
		$output_format = strtolower( (string) $output_format );

		$sizes = array();
		foreach ( array( 'webp', 'avif' ) as $fmt ) {
			if ( empty( $next_gen[ $fmt ]['exists'] ) ) {
				continue;
			}
			$bytes = ! empty( $next_gen[ $fmt ]['size_bytes'] ) ? (int) $next_gen[ $fmt ]['size_bytes'] : 0;
			if ( $bytes > 0 ) {
				$sizes[ $fmt ] = $bytes;
			}
		}

		// Prefer the format the image was optimized into; without that record, use the smaller copy.
		$chosen = '';
		if ( isset( $sizes[ $output_format ] ) ) {
			$chosen = $output_format;
		} elseif ( '' === $output_format && ! empty( $sizes ) ) {
			$chosen = (string) array_search( min( $sizes ), $sizes, true );
		}

		$size   = $main_size;
		$format = '';
		if ( '' !== $chosen && $main_size > 0 && $sizes[ $chosen ] < $main_size ) {
			$size   = $sizes[ $chosen ];
			$format = $chosen;
		}

		$percent = null;
		if ( $original_size > 0 && $size > 0 ) {
			$percent = max( 0, min( 100, round( ( ( $original_size - $size ) / $original_size ) * 100, 2 ) ) );
		}

		return array(
			'size'    => $size,
			'format'  => $format,
			'percent' => $percent,
		);
	}
}
