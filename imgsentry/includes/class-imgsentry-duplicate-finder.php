<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Core engine for clustering media duplicates based on computed exact and perceptual hashes.
 */
class ImgSentry_Duplicate_Finder {

	/**
	 * Thresholds for 64-bit dHash Hamming distance:
	 *
	 * 0     = same fingerprint (e.g. lossless optimisation, stripped EXIF)
	 * 1-4   = Visual duplicate (resized, re-compressed)
	 * 5-10  = Similar image (minor crop, light watermark)
	 * > 10  = not a duplicate
	 */
	const THRESHOLD_VISUAL  = 4;
	const THRESHOLD_SIMILAR = 10;

	/** Visual mode: both images must have the same aspect ratio within this relative tolerance. */
	const ASPECT_TOLERANCE = 0.05;

	/**
	 * Finds and groups duplicate images.
	 *
	 * @param string $detection_mode 'exact', 'visual' or 'similar'.
	 * @return array Groups: [ 'original' => entry, 'copies' => [ entry, ... ] ].
	 */
	public static function find_duplicate_groups( $detection_mode = 'visual' ) {
		global $wpdb;

		if ( ! in_array( $detection_mode, array( 'exact', 'visual', 'similar' ), true ) ) {
			$detection_mode = 'visual';
		}

		$table_usage = class_exists( 'ImgSentry_Usage_Indexer' ) ? ImgSentry_Usage_Indexer::get_table_name() : $wpdb->prefix . 'imgsentry_attachment_usage';
		$engine_now  = ImgSentry_Image_Hasher::current_engine();

		$query = "
			SELECT p.ID AS id, p.post_date,
			       m1.meta_value AS exact_hash,
			       m2.meta_value AS phash,
			       m_algo.meta_value AS phash_algo,
			       m_eng.meta_value AS phash_engine,
			       m_un.meta_value AS phash_unsupported,
			       m_pc.meta_value AS phash_computed_at,
			       u.status AS usage_status,
			       u.usage_count AS usage_count,
			       u.is_dirty AS is_dirty,
			       m4.meta_value AS attached_file,
			       m_ex.meta_value AS is_excluded,
			       m_orig.meta_value AS manual_original_hash,
			       m_hc.meta_value AS hash_computed_at
			FROM {$wpdb->posts} p
			INNER JOIN {$wpdb->postmeta} m1 ON p.ID = m1.post_id AND m1.meta_key = '_imgsentry_exact_hash'
			LEFT JOIN {$wpdb->postmeta} m2 ON p.ID = m2.post_id AND m2.meta_key = '_imgsentry_phash'
			LEFT JOIN {$wpdb->postmeta} m_algo ON p.ID = m_algo.post_id AND m_algo.meta_key = '_imgsentry_phash_algo'
			LEFT JOIN {$wpdb->postmeta} m_eng ON p.ID = m_eng.post_id AND m_eng.meta_key = '_imgsentry_phash_engine'
			LEFT JOIN {$wpdb->postmeta} m_un ON p.ID = m_un.post_id AND m_un.meta_key = '_imgsentry_phash_unsupported'
			LEFT JOIN {$wpdb->postmeta} m_pc ON p.ID = m_pc.post_id AND m_pc.meta_key = '_imgsentry_phash_computed_at'
			LEFT JOIN {$table_usage} u ON p.ID = u.attachment_id
			LEFT JOIN {$wpdb->postmeta} m4 ON p.ID = m4.post_id AND m4.meta_key = '_wp_attached_file'
			LEFT JOIN {$wpdb->postmeta} m_trash ON p.ID = m_trash.post_id AND m_trash.meta_key = '_imgsentry_trashed'
			LEFT JOIN {$wpdb->postmeta} m_ex ON p.ID = m_ex.post_id AND m_ex.meta_key = '_imgsentry_excluded'
			LEFT JOIN {$wpdb->postmeta} m_orig ON p.ID = m_orig.post_id AND m_orig.meta_key = '_imgsentry_manual_original'
			LEFT JOIN {$wpdb->postmeta} m_hc ON p.ID = m_hc.post_id AND m_hc.meta_key = '_imgsentry_hash_computed_at'
			WHERE p.post_type = 'attachment'
			  AND p.post_status != 'trash'
			  AND p.post_mime_type LIKE 'image/%'
			  AND (m_trash.meta_value IS NULL OR m_trash.meta_value != '1')
		";

		$results = $wpdb->get_results( $query ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared

		if ( empty( $results ) ) {
			return array();
		}

		$upload_dir = wp_upload_dir();
		$base_dir   = $upload_dir['basedir'];

		$items       = array();
		$exact_index = array();

		$missing_files_count = 0;
		$stale_hash_count    = 0;
		$excluded_by_path    = class_exists( 'ImgSentry_Usage_Indexer' );

		foreach ( $results as $row ) {
			if ( empty( $row->attached_file ) ) {
				$missing_files_count++;
				continue;
			}
			$stat = @stat( $base_dir . '/' . ltrim( $row->attached_file, '/' ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			if ( false === $stat ) {
				$missing_files_count++;
				continue;
			}
			$size  = (int) $stat['size'];
			$mtime = (int) $stat['mtime'];

			if ( (int) $row->hash_computed_at !== $mtime ) {
				$stale_hash_count++;
				continue;
			}

			$id = (int) $row->id;

			$is_excluded = ( ! empty( $row->is_excluded ) && '1' === (string) $row->is_excluded )
				|| ( $excluded_by_path && ImgSentry_Usage_Indexer::is_attachment_path_excluded( $id ) );

			$is_manual_original = ! empty( $row->manual_original_hash ) && (
				$row->manual_original_hash === $row->exact_hash ||
				$row->manual_original_hash === $row->phash ||
				'1' === (string) $row->manual_original_hash
			);

			// Usage: "pending / unknown" only while the row is dirty or was never indexed.
			$is_dirty      = isset( $row->is_dirty ) && '1' === (string) $row->is_dirty;
			$usage_unknown = $is_dirty || ! isset( $row->usage_status ) || '' === (string) $row->usage_status;
			$in_use        = ( ! $usage_unknown && 'used' === $row->usage_status ) ? 1 : 0;
			$use_count     = $in_use ? max( 1, (int) $row->usage_count ) : 0;

			// Perceptual hash is only trusted when algorithm, engine and file time all match.
			$phash = '';
			if (
				'' !== (string) $row->phash
				&& (string) $row->phash_algo === (string) ImgSentry_Image_Hasher::HASH_ALGO_VERSION
				&& '' !== $engine_now && (string) $row->phash_engine === $engine_now
				&& '1' !== (string) $row->phash_unsupported
				&& (int) $row->phash_computed_at === $mtime
				&& 16 === strlen( $row->phash ) && ctype_xdigit( $row->phash )
			) {
				$phash = strtolower( $row->phash );
				// Nearly empty / saturated fingerprints (flat images) match everything: ignore them.
				$bits = self::popcount_hex( $phash );
				if ( $bits < 4 || $bits > 60 ) {
					$phash = '';
				}
			}

			$items[ $id ] = array(
				'id'                 => $id,
				'timestamp'          => (int) strtotime( $row->post_date ),
				'exact_hash'         => (string) $row->exact_hash,
				'phash'              => $phash,
				'in_use'             => $in_use,
				'usage_unknown'      => $usage_unknown ? 1 : 0,
				'possibly_used'      => ( $in_use || $usage_unknown ) ? 1 : 0,
				'use_count'          => $use_count,
				'is_excluded'        => $is_excluded,
				'is_manual_original' => $is_manual_original ? 1 : 0,
				'size'               => $size,
				'attached_file'      => (string) $row->attached_file,
			);

			$exact_index[ $items[ $id ]['exact_hash'] ][] = $id;
		}
		unset( $results );

		if ( $missing_files_count > 0 && class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::info(
				sprintf( 'Skipped %d missing attachment file(s) during duplicate scan', $missing_files_count ),
				array(
					'type'    => 'Duplicate',
					'source'  => 'Duplicate Finder',
					'details' => sprintf( '%d attachment(s) had missing physical files on disk and were excluded from duplicate groups.', $missing_files_count ),
				)
			);
		}
		if ( $stale_hash_count > 0 && class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::info(
				sprintf( 'Skipped %d attachment(s) whose stored hash is out of date (file changed after hashing). Re-run the duplicate scan.', $stale_hash_count ),
				array(
					'type'    => 'Duplicate',
					'source'  => 'Duplicate Finder',
					'details' => sprintf( '%d attachment(s) had stored hashes that did not match the file mtime on disk.', $stale_hash_count ),
				)
			);
		}

		if ( empty( $items ) ) {
			return array();
		}

		// Original priority: manual choice, then possibly-used (used OR unknown), usage count,
		// larger file, older upload, lower ID.
		$ordered = array_values( $items );
		usort( $ordered, function ( $a, $b ) {
			if ( $a['is_manual_original'] !== $b['is_manual_original'] ) {
				return $b['is_manual_original'] - $a['is_manual_original'];
			}
			if ( $a['possibly_used'] !== $b['possibly_used'] ) {
				return $b['possibly_used'] - $a['possibly_used'];
			}
			if ( $a['use_count'] !== $b['use_count'] ) {
				return $b['use_count'] - $a['use_count'];
			}
			if ( $a['size'] !== $b['size'] ) {
				return $b['size'] - $a['size'];
			}
			if ( $a['timestamp'] !== $b['timestamp'] ) {
				return $a['timestamp'] - $b['timestamp'];
			}
			return $a['id'] - $b['id'];
		} );

		$item_order = array();
		foreach ( $ordered as $pos => $it ) {
			$item_order[ $it['id'] ] = $pos;
		}

		// Multi-index hashing (pigeonhole): two 64-bit hashes within distance k share at least one
		// identical chunk when split into k+1 disjoint chunks, so no pair inside the threshold is missed.
		$max_distance = ( 'visual' === $detection_mode ) ? self::THRESHOLD_VISUAL : self::THRESHOLD_SIMILAR;
		$num_chunks   = $max_distance + 1;
		$chunk_index  = array();
		$bin_by_id    = array();

		if ( 'exact' !== $detection_mode ) {
			foreach ( $ordered as $item ) {
				if ( '' === $item['phash'] ) {
					continue;
				}
				$bin = '';
				for ( $i = 0; $i < 16; $i++ ) {
					$bin .= str_pad( base_convert( $item['phash'][ $i ], 16, 2 ), 4, '0', STR_PAD_LEFT );
				}
				$bin_by_id[ $item['id'] ] = $bin;
				for ( $i = 0; $i < $num_chunks; $i++ ) {
					$start = intdiv( $i * 64, $num_chunks );
					$end   = intdiv( ( $i + 1 ) * 64, $num_chunks );
					$chunk_index[ $i ][ substr( $bin, $start, $end - $start ) ][] = $item['id'];
				}
			}
		}

		$dims     = array(); // Lazy width/height cache.
		$assigned = array();
		$groups   = array();

		foreach ( $ordered as $candidate ) {
			$candidate_id = $candidate['id'];
			if ( isset( $assigned[ $candidate_id ] ) ) {
				continue;
			}

			$copies = array();

			// Phase A: exact (byte-identical) copies.
			foreach ( $exact_index[ $candidate['exact_hash'] ] as $target_id ) {
				if ( $target_id !== $candidate_id && ! isset( $assigned[ $target_id ] ) ) {
					$copies[]                = array( $target_id, 'exact', 0, 'Exact byte-for-byte match' );
					$assigned[ $target_id ] = true;
				}
			}

			// Phase B: visual / similar copies.
			if ( 'exact' !== $detection_mode && isset( $bin_by_id[ $candidate_id ] ) ) {
				$bin      = $bin_by_id[ $candidate_id ];
				$cand_ids = array();
				for ( $i = 0; $i < $num_chunks; $i++ ) {
					$start = intdiv( $i * 64, $num_chunks );
					$end   = intdiv( ( $i + 1 ) * 64, $num_chunks );
					$chunk = substr( $bin, $start, $end - $start );
					if ( isset( $chunk_index[ $i ][ $chunk ] ) ) {
						foreach ( $chunk_index[ $i ][ $chunk ] as $id ) {
							if ( $id !== $candidate_id && ! isset( $assigned[ $id ] ) ) {
								$cand_ids[ $id ] = true;
							}
						}
					}
				}
				$ids = array_keys( $cand_ids );
				usort( $ids, function ( $a, $b ) use ( $item_order ) {
					return $item_order[ $a ] - $item_order[ $b ];
				} );

				foreach ( $ids as $target_id ) {
					$dist = self::calculate_hamming_distance( $candidate['phash'], $items[ $target_id ]['phash'] );
					if ( $dist < 0 || $dist > $max_distance ) {
						continue;
					}
					if ( 'visual' === $detection_mode && ! self::same_aspect_ratio( $candidate_id, $target_id, $dims ) ) {
						continue;
					}
					if ( 0 === $dist ) {
						$type   = 'exact_visual';
						$reason = 'Visually identical fingerprint (different file bytes, not pixel-verified)';
					} elseif ( $dist <= self::THRESHOLD_VISUAL ) {
						$type   = 'visual';
						$reason = sprintf( 'Visual duplicate (Hamming distance: %d)', $dist );
					} else {
						$type   = 'similar';
						$reason = sprintf( 'Similar image (Hamming distance: %d)', $dist );
					}
					$copies[]                = array( $target_id, $type, $dist, $reason );
					$assigned[ $target_id ] = true;
				}
			}

			$assigned[ $candidate_id ] = true;

			if ( empty( $copies ) ) {
				continue;
			}

			$copy_entries = array();
			foreach ( $copies as $c ) {
				$entry                = self::build_entry( $items[ $c[0] ], $dims );
				$entry['match_type']  = $c[1];
				$entry['distance']    = $c[2];
				$entry['reason']      = $c[3];
				$copy_entries[]       = $entry;
			}

			$orig_entry               = self::build_entry( $candidate, $dims );
			$orig_entry['hash']       = $candidate['exact_hash'] ? $candidate['exact_hash'] : $candidate['phash'];
			$orig_entry['exact_hash'] = $candidate['exact_hash'];
			$orig_entry['phash']      = $candidate['phash'];
			$orig_entry['is_manual_original'] = (bool) $candidate['is_manual_original'];

			$groups[] = array(
				'original' => $orig_entry,
				'copies'   => $copy_entries,
			);
		}

		return self::attach_usage_sources( $groups, $table_usage );
	}

	/**
	 * Fill 'use_reasons' for used entries with one batched query per 500 IDs.
	 */
	private static function attach_usage_sources( $groups, $table_usage ) {
		global $wpdb;

		$need = array();
		foreach ( $groups as $g ) {
			foreach ( array_merge( array( $g['original'] ), $g['copies'] ) as $e ) {
				if ( ! empty( $e['in_use'] ) ) {
					$need[ (int) $e['id'] ] = true;
				}
			}
		}
		if ( empty( $need ) ) {
			return $groups;
		}

		$sources = array();
		foreach ( array_chunk( array_keys( $need ), 500 ) as $chunk ) {
			$ph   = implode( ',', array_fill( 0, count( $chunk ), '%d' ) );
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT attachment_id, usage_sources FROM {$table_usage} WHERE attachment_id IN ({$ph})", $chunk ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- The table name comes from $wpdb->prefix and the IN list only holds %d placeholders built above.
			foreach ( (array) $rows as $r ) {
				$d = ! empty( $r->usage_sources ) ? json_decode( $r->usage_sources, true ) : array();
				$sources[ (int) $r->attachment_id ] = is_array( $d ) ? $d : array();
			}
		}

		foreach ( $groups as $gi => $g ) {
			if ( isset( $sources[ $g['original']['id'] ] ) ) {
				$groups[ $gi ]['original']['use_reasons'] = $sources[ $g['original']['id'] ];
			}
			foreach ( $g['copies'] as $ci => $e ) {
				if ( isset( $sources[ $e['id'] ] ) ) {
					$groups[ $gi ]['copies'][ $ci ]['use_reasons'] = $sources[ $e['id'] ];
				}
			}
		}
		return $groups;
	}

	/**
	 * Build the frontend entry for one grouped image (URL, date and size data only resolved here).
	 */
	private static function build_entry( $item, &$dims ) {
		static $date_format = null;
		if ( null === $date_format ) {
			$date_format = get_option( 'date_format', 'F j, Y' );
		}

		$d      = self::get_dimensions( $item['id'], $dims );
		$status = $item['is_excluded'] ? 'ignored' : ( $item['in_use'] ? 'used' : ( $item['usage_unknown'] ? 'unknown' : 'unused' ) );

		return array(
			'id'            => $item['id'],
			'url'           => (string) wp_get_attachment_url( $item['id'] ),
			'filename'      => basename( $item['attached_file'] ),
			'resolution'    => ( $d['width'] && $d['height'] ) ? $d['width'] . ' × ' . $d['height'] : 'Unknown',
			'width'         => $d['width'],
			'height'        => $d['height'],
			'date'          => wp_date( $date_format, $item['timestamp'] ),
			'size'          => $item['size'],
			'hash'          => $item['exact_hash'],
			'in_use'        => (bool) $item['in_use'],
			'usage_unknown' => (bool) $item['usage_unknown'],
			'use_reasons'   => array(),
			'is_excluded'   => (bool) $item['is_excluded'],
			'status'        => $status,
		);
	}

	private static function get_dimensions( $id, &$dims ) {
		if ( ! isset( $dims[ $id ] ) ) {
			$meta         = wp_get_attachment_metadata( $id );
			$dims[ $id ] = array(
				'width'  => ( is_array( $meta ) && ! empty( $meta['width'] ) ) ? (int) $meta['width'] : 0,
				'height' => ( is_array( $meta ) && ! empty( $meta['height'] ) ) ? (int) $meta['height'] : 0,
			);
		}
		return $dims[ $id ];
	}

	/** Same aspect ratio within tolerance; unknown dimensions never block a match. */
	private static function same_aspect_ratio( $a, $b, &$dims ) {
		$da = self::get_dimensions( $a, $dims );
		$db = self::get_dimensions( $b, $dims );
		if ( ! $da['width'] || ! $da['height'] || ! $db['width'] || ! $db['height'] ) {
			return true;
		}
		$ra = $da['width'] / $da['height'];
		$rb = $db['width'] / $db['height'];
		return abs( $ra - $rb ) / max( $ra, $rb ) <= self::ASPECT_TOLERANCE;
	}

	private static function popcount_hex( $hex ) {
		$n = 0;
		for ( $i = 0, $l = strlen( $hex ); $i < $l; $i++ ) {
			$n += substr_count( decbin( hexdec( $hex[ $i ] ) ), '1' );
		}
		return $n;
	}

	/**
	 * Get scan coverage statistics.
	 *
	 * @return array Coverage stats.
	 */
	public static function get_coverage_stats() {
		global $wpdb;

		// Reusing base exclusions. The "image/" prefix is a placeholder value, so no % wildcard is written inside the SQL text.
		$mime_like = $wpdb->esc_like( 'image/' ) . '%';
		$where     = "WHERE p.post_type = 'attachment'
				  AND p.post_status != 'trash'
				  AND p.post_mime_type LIKE %s
				  AND NOT EXISTS (SELECT 1 FROM {$wpdb->postmeta} m_trash WHERE m_trash.post_id = p.ID AND m_trash.meta_key = '_imgsentry_trashed' AND m_trash.meta_value = '1')";

		// The $where text above is a fixed string written in this method (no user input) and holds one %s placeholder
		// that every query below fills through prepare().
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		// phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$total          = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(p.ID) FROM {$wpdb->posts} p {$where}", $mime_like ) );
		// phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$hashed         = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} m1 ON p.ID = m1.post_id AND m1.meta_key = '_imgsentry_exact_hash' {$where}", $mime_like ) );
		// phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$unsupported    = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} m_un ON p.ID = m_un.post_id AND m_un.meta_key = '_imgsentry_phash_unsupported' AND m_un.meta_value = '1' {$where}", $mime_like ) );
		$phash_outdated = (int) $wpdb->get_var(
			// phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$wpdb->prepare(
				"SELECT COUNT(p.ID) FROM {$wpdb->posts} p
				INNER JOIN {$wpdb->postmeta} m_exact ON p.ID = m_exact.post_id AND m_exact.meta_key = '_imgsentry_exact_hash'
				LEFT JOIN {$wpdb->postmeta} m_algo ON p.ID = m_algo.post_id AND m_algo.meta_key = '_imgsentry_phash_algo'
				LEFT JOIN {$wpdb->postmeta} m_engine ON p.ID = m_engine.post_id AND m_engine.meta_key = '_imgsentry_phash_engine'
				{$where} AND (m_algo.meta_value IS NULL OR m_algo.meta_value != %s OR m_engine.meta_value IS NULL OR m_engine.meta_value != %s)",
				$mime_like,
				(string) (int) ImgSentry_Image_Hasher::HASH_ALGO_VERSION,
				(string) ImgSentry_Image_Hasher::current_engine()
			)
		);
		// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching

		return array(
			'total_images'              => $total,
			'hashed_images'             => $hashed,
			'unscanned_images'          => max( 0, $total - $hashed ),
			'visual_unsupported_images' => $unsupported,
			'phash_outdated_images'     => $phash_outdated,
		);
	}

	/**
	 * Invalidate cached duplicate groups transient.
	 *
	 * @param string $reason  Optional description of why the cache is being invalidated.
	 * @param bool   $silent  If true, skip logging the invalidation.
	 */
	public static function invalidate_cache( $reason = '', $silent = false ) {
		static $already_invalidated = false;

		if ( $silent ) {
			if ( $already_invalidated ) {
				return;
			}
			$already_invalidated = true;
		}

		delete_transient( 'imgsentry_duplicate_groups_cache' );
		delete_transient( 'imgsentry_duplicate_groups_cache_exact' );
		delete_transient( 'imgsentry_duplicate_groups_cache_visual' );
		delete_transient( 'imgsentry_duplicate_groups_cache_similar' );

		if ( ! $silent && class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::info(
				'Duplicate groups cache invalidated',
				array(
					'type'    => 'Cache',
					'source'  => 'Duplicate Finder',
					'details' => $reason ? sprintf( 'Cache cleared: %s', $reason ) : 'Duplicate groups cache transient deleted.',
				)
			);
		}
	}

	/**
	 * Register hooks for cache invalidation and hashing.
	 */
	public static function register_hooks() {
		add_action( 'add_attachment', array( __CLASS__, 'on_media_changed' ) );
		add_action( 'delete_attachment', array( __CLASS__, 'on_media_deleted' ) );
		add_filter( 'wp_update_attachment_metadata', array( __CLASS__, 'on_metadata_updated' ), 20, 2 );
		add_action( 'imgsentry_hash_single_attachment', array( __CLASS__, 'hash_single_attachment' ) );
	}

	/**
	 * Handler for new/updated media.
	 *
	 * @param int $id Attachment ID.
	 */
	public static function on_media_changed( $id ) {
		self::invalidate_cache( '', true );
		if ( 0 === strpos( get_post_mime_type( $id ), 'image/' ) && false === wp_next_scheduled( 'imgsentry_hash_single_attachment', array( (int) $id ) ) ) {
			wp_schedule_single_event( time() + 30, 'imgsentry_hash_single_attachment', array( (int) $id ) );
		}
	}

	/**
	 * Handler for metadata updates.
	 *
	 * @param array $data Metadata.
	 * @param int   $id   Attachment ID.
	 * @return array
	 */
	public static function on_metadata_updated( $data, $id ) {
		self::on_media_changed( $id );
		return $data;
	}

	/**
	 * Handler for media deletion.
	 *
	 * @param int $id Attachment ID.
	 */
	public static function on_media_deleted( $id ) {
		self::invalidate_cache( '', true );
	}

	/**
	 * Hash single attachment.
	 *
	 * @param int $id Attachment ID.
	 */
	public static function hash_single_attachment( $id ) {
		if ( class_exists( 'ImgSentry_Image_Hasher' ) ) {
			try {
				ImgSentry_Image_Hasher::backfill_batch( array( (int) $id ) );
			} catch ( Throwable $e ) {
				// Silently fail
			}
		}
		self::invalidate_cache( '', true );
	}

	/**
	 * Calculates the true Hamming distance (number of differing bits) between two 64-bit hex strings.
	 * 
	 * @param string $hex1 The first 16-character hex string.
	 * @param string $hex2 The second 16-character hex string.
	 * @return int The distance (0-64), or -1 if invalid formats.
	 */
	private static function calculate_hamming_distance( $hex1, $hex2 ) {
		if ( strlen( $hex1 ) !== 16 || strlen( $hex2 ) !== 16 ) {
			return -1;
		}

		$distance = 0;
		for ( $i = 0; $i < 16; $i++ ) {
			// Convert hex character to integer (0-15)
			$val1 = hexdec( $hex1[ $i ] );
			$val2 = hexdec( $hex2[ $i ] );
			
			// XOR produces 1s where bits differ
			$xor = $val1 ^ $val2;
			
			// Count the set bits (popcount) in the 4-bit XOR result
			$distance += substr_count( decbin( $xor ), '1' );
		}

		return $distance;
	}
}
