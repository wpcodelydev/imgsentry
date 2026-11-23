<?php
/**
 * AJAX Duplicates Controller Class for ImgSentry.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Ajax_Duplicates extends ImgSentry_Ajax_Base {

	/**
	 * Constructor. Register Duplicates AJAX actions.
	 */
	public function __construct() {
		add_action( 'wp_ajax_imgsentry_get_duplicate_groups', array( $this, 'get_duplicate_groups' ) );
		add_action( 'wp_ajax_imgsentry_hash_scan_batch', array( $this, 'hash_scan_batch' ) );
		add_action( 'wp_ajax_imgsentry_ignore_file', array( $this, 'ignore_file' ) );
		add_action( 'wp_ajax_imgsentry_ignore_files', array( $this, 'ignore_files' ) );
		add_action( 'wp_ajax_imgsentry_unignore_files', array( $this, 'unignore_files' ) );
		add_action( 'wp_ajax_imgsentry_set_original', array( $this, 'set_original' ) );
	}

	/**
	 * Fetch duplicate groups calculated by ImgSentry_Duplicate_Finder.
	 */
	public function get_duplicate_groups() {
		try {
			$this->verify_permission( 'duplicate', 'imgsentry_admin_nonce' );

			// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
			$detection_mode = isset( $_POST['detection_mode'] ) ? sanitize_text_field( wp_unslash( $_POST['detection_mode'] ) ) : 'visual';
			if ( ! in_array( $detection_mode, array( 'exact', 'visual', 'similar' ), true ) ) {
				$detection_mode = 'visual';
			}

			// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
			$force_refresh = isset( $_POST['force_refresh'] ) && 'true' === $_POST['force_refresh'];
			$cache_key     = 'imgsentry_duplicate_groups_cache_' . $detection_mode;

			if ( $force_refresh ) {
				ImgSentry_Duplicate_Finder::invalidate_cache();
			} else {
				$cached_groups = get_transient( $cache_key );
				if ( false !== $cached_groups ) {
					wp_send_json_success( array(
						'groups'         => $cached_groups,
						'cached'         => true,
						'detection_mode' => $detection_mode,
						'coverage'       => ImgSentry_Duplicate_Finder::get_coverage_stats(),
					) );
					return;
				}
			}

			if ( function_exists( 'wp_raise_memory_limit' ) ) {
				wp_raise_memory_limit( 'admin' );
			}
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Some hosts disable it; the result does not matter.
			@set_time_limit( 120 );

			$groups = ImgSentry_Duplicate_Finder::find_duplicate_groups( $detection_mode );
			set_transient( $cache_key, $groups, HOUR_IN_SECONDS );

			wp_send_json_success( array(
				'groups'         => $groups,
				'detection_mode' => $detection_mode,
				'coverage'       => ImgSentry_Duplicate_Finder::get_coverage_stats(),
			) );
		} catch ( \Throwable $e ) {
			self::log_failure( 'get_duplicate_groups', $e );
			wp_send_json_error( array(
				'message' => __( 'Could not load duplicate groups. Please try again.', 'imgsentry' ),
				'groups'  => array(),
			) );
		}
	}

	/**
	 * Run batch hash calculation for attachments missing _imgsentry_exact_hash.
	 */
	public function hash_scan_batch() {
		$last_id = 0;

		try {
			$this->verify_permission( 'duplicate', 'imgsentry_admin_nonce' );

			// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
			$last_id    = isset( $_POST['last_id'] ) ? absint( $_POST['last_id'] ) : 0;
			// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
			$batch_size = isset( $_POST['batch_size'] ) ? absint( $_POST['batch_size'] ) : 20;

			if ( $batch_size <= 0 ) {
				$batch_size = 20;
			}
			$batch_size = min( $batch_size, 100 );

			global $wpdb;

			// 1. Get total number of active image attachments
			$total = (int) $wpdb->get_var( "
				SELECT COUNT(p.ID) 
				FROM {$wpdb->posts} p
				LEFT JOIN {$wpdb->postmeta} m_trash ON p.ID = m_trash.post_id AND m_trash.meta_key = '_imgsentry_trashed'
				WHERE p.post_type = 'attachment'
				  AND p.post_status != 'trash'
				  AND p.post_mime_type LIKE 'image/%'
				  AND (m_trash.meta_value IS NULL OR m_trash.meta_value != '1')
			" );

			// The "image/" prefix is passed as a placeholder value, so the % wildcard is not written inside the SQL text.
			$image_mime_like = $wpdb->esc_like( 'image/' ) . '%';

			// 2. Keyset paging: Fetch batch of attachment IDs where ID > last_id
			$batch_ids = $wpdb->get_col( $wpdb->prepare( "
				SELECT p.ID 
				FROM {$wpdb->posts} p
				LEFT JOIN {$wpdb->postmeta} m_trash ON p.ID = m_trash.post_id AND m_trash.meta_key = '_imgsentry_trashed'
				WHERE p.post_type = 'attachment'
				  AND p.post_status != 'trash'
				  AND p.post_mime_type LIKE %s
				  AND (m_trash.meta_value IS NULL OR m_trash.meta_value != '1')
				  AND p.ID > %d
				ORDER BY p.ID ASC
				LIMIT %d
			", $image_mime_like, $last_id, $batch_size ) );

			$processed_in_batch = 0;
			$results            = array( 'failed' => 0, 'phash_unsupported' => 0 );
			if ( ! empty( $batch_ids ) ) {
				$results            = ImgSentry_Image_Hasher::backfill_batch( $batch_ids );
				$processed_in_batch = count( $batch_ids );
				$new_last_id        = (int) max( $batch_ids );
			} else {
				$new_last_id        = $last_id;
			}

			// Compute count of image IDs <= last_id for progress calculation
			$processed = (int) $wpdb->get_var( $wpdb->prepare( "
				SELECT COUNT(p.ID) 
				FROM {$wpdb->posts} p
				LEFT JOIN {$wpdb->postmeta} m_trash ON p.ID = m_trash.post_id AND m_trash.meta_key = '_imgsentry_trashed'
				WHERE p.post_type = 'attachment'
				  AND p.post_status != 'trash'
				  AND p.post_mime_type LIKE %s
				  AND (m_trash.meta_value IS NULL OR m_trash.meta_value != '1')
				  AND p.ID <= %d
			", $image_mime_like, $new_last_id ) );

			$done = empty( $batch_ids ) || ( $processed >= $total );

			if ( $done ) {
				ImgSentry_Duplicate_Finder::invalidate_cache();
			}

			wp_send_json_success( array(
				'done'              => $done,
				'is_complete'       => $done,
				'last_id'           => $new_last_id,
				'total'             => $total,
				'processed'         => $processed,
				'batch_processed'   => $processed_in_batch,
				'failed'            => (int) ( $results['failed'] ?? 0 ),
				'phash_unsupported' => (int) ( $results['phash_unsupported'] ?? 0 ),
			) );
		} catch ( \Throwable $e ) {
			self::log_failure( 'hash_scan_batch', $e );
			wp_send_json_error( array(
				'message'     => __( 'The scan step failed. Please try again.', 'imgsentry' ),
				'done'        => true,
				'is_complete' => true,
				'last_id'     => $last_id,
				'total'       => 0,
				'processed'   => 0,
			) );
		}
	}

	/**
	 * Log a failure server-side; the browser only gets a generic message.
	 */
	private static function log_failure( $where, $e ) {
		if ( class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::log(
				'Error',
				'Duplicate Images request failed',
				array(
					'type'    => 'Duplicate',
					'source'  => 'Duplicate Finder',
					'details' => sprintf( '%s: %s', $where, $e->getMessage() ),
				)
			);
		}
	}

	/**
	 * Validate a list of attachment IDs. Only existing attachments the current user may edit are returned.
	 *
	 * @param array|string $raw Array or comma separated list.
	 */
	private function validate_attachment_ids( $raw, $max = 500 ) {
		$raw = is_array( $raw ) ? $raw : explode( ',', (string) $raw );
		$ids = array_slice( array_values( array_unique( array_filter( array_map( 'absint', $raw ) ) ) ), 0, $max );

		$valid = array();
		foreach ( $ids as $id ) {
			$post = get_post( $id );
			if ( $post && 'attachment' === $post->post_type && current_user_can( 'edit_post', $id ) ) {
				$valid[] = $id;
			}
		}
		return $valid;
	}

	/** Raw POST value (unslashed) for an ID list field. */
	private function post_list( $key ) {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		if ( ! isset( $_POST[ $key ] ) ) {
			return array();
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		return wp_unslash( $_POST[ $key ] );
	}

	/**
	 * Ignore one attachment in the duplicate finder.
	 */
	public function ignore_file() {
		$this->verify_permission( 'duplicate', 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$id  = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
		$ids = $this->validate_attachment_ids( array( $id ), 1 );
		if ( empty( $ids ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid media ID.', 'imgsentry' ) ) );
		}

		update_post_meta( $id, '_imgsentry_excluded', '1' );
		ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'File #%d ignored', $id ) );

		$title = get_the_title( $id ) ? get_the_title( $id ) : sprintf( 'Attachment #%d', $id );
		if ( class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::info(
				'Ignore Duplicate File',
				array(
					'type'      => 'Settings',
					'source'    => 'Duplicate Finder',
					'details'   => sprintf( 'Ignored "%s" (ID: #%d) in duplicate scans.', $title, $id ),
					'object_id' => $id,
				)
			);
		}

		/* translators: 1: file title, 2: attachment ID */
		$imgsentry_msg_1 = sprintf( __( '"%1$s" (ID: #%2$d) will be ignored.', 'imgsentry' ), $title, $id );
		wp_send_json_success( array(
			'message' => $imgsentry_msg_1,
			'id'      => $id,
		) );
	}

	/**
	 * Ignore several attachments.
	 */
	public function ignore_files() {
		$this->verify_permission( 'duplicate', 'imgsentry_admin_nonce' );

		$ids = $this->validate_attachment_ids( $this->post_list( 'ids' ) );
		if ( empty( $ids ) ) {
			wp_send_json_error( array( 'message' => __( 'No valid media IDs provided.', 'imgsentry' ) ) );
		}

		foreach ( $ids as $id ) {
			update_post_meta( $id, '_imgsentry_excluded', '1' );
		}
		ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( '%d files ignored', count( $ids ) ) );

		if ( class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::info(
				'Ignore Group Duplicates',
				array(
					'type'      => 'Settings',
					'source'    => 'Duplicate Finder',
					'details'   => sprintf( 'Ignored %d files in duplicate scans. IDs: %s', count( $ids ), implode( ', ', $ids ) ),
					'object_id' => reset( $ids ),
				)
			);
		}

		/* translators: %d: number of files */
		$imgsentry_msg_2 = sprintf( __( '%d file(s) will be ignored.', 'imgsentry' ), count( $ids ) );
		wp_send_json_success( array(
			'message' => $imgsentry_msg_2,
			'count'   => count( $ids ),
			'ids'     => $ids,
		) );
	}

	/**
	 * Stop ignoring attachments (removes the exclusion flag).
	 */
	public function unignore_files() {
		$this->verify_permission( 'duplicate', 'imgsentry_admin_nonce' );

		$ids = $this->validate_attachment_ids( $this->post_list( 'ids' ) );
		if ( empty( $ids ) ) {
			wp_send_json_error( array( 'message' => __( 'No valid media IDs provided.', 'imgsentry' ) ) );
		}

		foreach ( $ids as $id ) {
			delete_post_meta( $id, '_imgsentry_excluded' );
		}
		ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( '%d files un-ignored', count( $ids ) ) );

		if ( class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::info(
				'Stop Ignoring Duplicate Files',
				array(
					'type'      => 'Settings',
					'source'    => 'Duplicate Finder',
					'details'   => sprintf( 'Removed %d files from the ignore list. IDs: %s', count( $ids ), implode( ', ', $ids ) ),
					'object_id' => reset( $ids ),
				)
			);
		}

		/* translators: %d: number of files */
		$imgsentry_msg_3 = sprintf( __( '%d file(s) are no longer ignored.', 'imgsentry' ), count( $ids ) );
		wp_send_json_success( array(
			'message' => $imgsentry_msg_3,
			'count'   => count( $ids ),
			'ids'     => $ids,
		) );
	}

	/**
	 * Choose the original of a duplicate group. The chosen file gets the manual flag and the
	 * other members of the same group lose it, so exactly one original is stored per group.
	 */
	public function set_original() {
		$this->verify_permission( 'duplicate', 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : ( isset( $_POST['attachment_id'] ) ? absint( $_POST['attachment_id'] ) : 0 );
		if ( ! $id || 1 !== count( $this->validate_attachment_ids( array( $id ), 1 ) ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid attachment ID.', 'imgsentry' ) ) );
		}

		$group_ids = $this->validate_attachment_ids( $this->post_list( 'group_ids' ), 200 );
		foreach ( $group_ids as $gid ) {
			if ( $gid !== $id ) {
				delete_post_meta( $gid, '_imgsentry_manual_original' );
			}
		}
		update_post_meta( $id, '_imgsentry_manual_original', '1' );

		ImgSentry_Duplicate_Finder::invalidate_cache( sprintf( 'Manual original set to attachment #%d', $id ) );

		$title = get_the_title( $id ) ? get_the_title( $id ) : sprintf( 'Attachment #%d', $id );
		if ( class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::success(
				'Set Duplicate Group Original',
				array(
					'type'      => 'Settings',
					'source'    => 'Duplicate Finder',
					'details'   => sprintf( 'Designated "%s" (ID: #%d) as the original of its duplicate group.', $title, $id ),
					'object_id' => $id,
				)
			);
		}

		/* translators: 1: file title, 2: attachment ID */
		$imgsentry_msg_4 = sprintf( __( '"%1$s" (ID: #%2$d) is now the original.', 'imgsentry' ), $title, $id );
		wp_send_json_success( array(
			'message' => $imgsentry_msg_4,
			'id'      => $id,
		) );
	}
}