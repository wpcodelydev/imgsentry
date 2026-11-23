<?php
/**
 * AJAX Optimizer Controller Class for ImgSentry.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Ajax_Optimizer extends ImgSentry_Ajax_Base {

	/**
	 * Constructor. Register Optimizer AJAX actions.
	 */
	public function __construct() {
		add_action( 'wp_ajax_imgsentry_get_optimization_stats', array( $this, 'get_optimization_stats' ) );
		add_action( 'wp_ajax_imgsentry_get_optimization_settings', array( $this, 'get_optimization_settings' ) );
		add_action( 'wp_ajax_imgsentry_save_optimization_settings', array( $this, 'save_optimization_settings' ) );
		add_action( 'wp_ajax_imgsentry_get_queue_status', array( $this, 'get_queue_status' ) );
		add_action( 'wp_ajax_imgsentry_enqueue_optimization_queue', array( $this, 'enqueue_optimization_queue' ) );
		add_action( 'wp_ajax_imgsentry_cancel_optimization_queue', array( $this, 'cancel_optimization_queue' ) );
		add_action( 'wp_ajax_imgsentry_clear_optimization_queue', array( $this, 'clear_optimization_queue' ) );
		add_action( 'wp_ajax_imgsentry_optimize_image', array( $this, 'optimize_image' ) );
		add_action( 'wp_ajax_imgsentry_restore_original', array( $this, 'restore_original' ) );
		add_action( 'wp_ajax_imgsentry_clean_stale_backups', array( $this, 'clean_stale_backups' ) );
		add_action( 'wp_ajax_imgsentry_get_backup_usage', array( $this, 'get_backup_usage' ) );
		add_action( 'wp_ajax_imgsentry_delete_all_backups', array( $this, 'delete_all_backups' ) );
		add_action( 'wp_ajax_imgsentry_purge_orphaned_trash_backups', array( $this, 'purge_orphaned_trash_backups' ) );
		add_action( 'wp_ajax_imgsentry_process_queue_tick', array( $this, 'process_queue_tick' ) );
		add_action( 'wp_ajax_imgsentry_run_queue_tick', array( $this, 'run_queue_tick' ) );
		add_action( 'wp_ajax_imgsentry_get_optimize_progress', array( $this, 'get_optimize_progress' ) );
		add_action( 'wp_ajax_nopriv_imgsentry_process_queue_tick', array( $this, 'process_queue_tick' ) );
	}

	/**
	 * Fetch optimization statistics and server capabilities.
	 */
	public function get_optimization_stats() {
		$this->verify_permission( array( 'optimization', 'dashboard' ), 'imgsentry_admin_nonce' );

		if ( ! class_exists( 'ImgSentry_Optimization_Stats' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-stats.php';
		}

		$stats = ImgSentry_Optimization_Stats::get_stats( true ); // force refresh

		$has_imagick = extension_loaded( 'imagick' ) && class_exists( 'Imagick' );
		$has_gd      = extension_loaded( 'gd' ) && function_exists( 'gd_info' );
		
		$has_webp = false;
		$has_avif = false;
		if ( $has_imagick ) {
			try {
				$formats = Imagick::queryFormats();
				$has_webp = in_array( 'WEBP', $formats, true );
				$has_avif = in_array( 'AVIF', $formats, true );
			} catch ( Exception $e ) {
				// Fallback to GD if Imagick query fails
			}
		}
		if ( ! $has_webp && $has_gd ) {
			$has_webp = function_exists( 'imagewebp' );
		}
		if ( ! $has_avif && $has_gd ) {
			$has_avif = function_exists( 'imageavif' );
		}

		$active_engine = $has_imagick ? 'imagick' : ( $has_gd ? 'gd' : 'none' );

		wp_send_json_success( array(
			'stats'        => $stats,
			'capabilities' => array(
				'has_imagick'   => $has_imagick,
				'has_gd'        => $has_gd,
				'has_webp'      => $has_webp,
				'has_avif'      => $has_avif,
				'active_engine' => $active_engine,
			),
			'quota'        => class_exists( 'ImgSentry_Quota' ) ? ImgSentry_Quota::get_status() : null,
		) );
	}

	/**
	 * Settings that belong to the Image Optimization page. Only these keys can be read or changed
	 * through the two endpoints below, by anyone holding the 'optimization' permission.
	 * Everything else stays Administrator-only in Settings.
	 *
	 * @return array
	 */
	private static function optimization_settings_keys() {
		return array( 'nextGenFormat', 'generateBackupBeforeOptimization', 'autoOptimizeOnUpload', 'defaultCompressionLevel', 'defaultCompressionQuality' );
	}

	/**
	 * Read the optimization-page settings (whitelisted keys only).
	 */
	public function get_optimization_settings() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		$all      = ImgSentry_Settings::instance()->get_settings();
		$settings = array();
		foreach ( self::optimization_settings_keys() as $key ) {
			$settings[ $key ] = isset( $all[ $key ] ) ? $all[ $key ] : null;
		}

		wp_send_json_success( array( 'settings' => $settings ) );
	}

	/**
	 * Save the optimization-page settings. Needs the 'optimization' permission (Administrators always pass).
	 * Any key outside the whitelist is ignored, so this can never change other plugin settings.
	 */
	public function save_optimization_settings() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$input_raw = isset( $_POST['settings'] ) ? json_decode( wp_unslash( $_POST['settings'] ), true ) : null;
		if ( ! is_array( $input_raw ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid settings payload received.', 'imgsentry' ) ), 400 );
			exit;
		}

		$input = array();
		foreach ( self::optimization_settings_keys() as $key ) {
			if ( array_key_exists( $key, $input_raw ) ) {
				$input[ $key ] = $input_raw[ $key ];
			}
		}
		if ( empty( $input ) ) {
			wp_send_json_error( array( 'message' => __( 'No valid optimization settings were sent.', 'imgsentry' ) ), 400 );
			exit;
		}

		$instance = ImgSentry_Settings::instance();
		$clean    = $instance->sanitize_settings( $input, $instance->get_settings() );

		// Write only the whitelisted keys into the stored option (everything else stays exactly as it was).
		$stored = get_option( ImgSentry_Settings::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		$changed = array();
		foreach ( $input as $key => $unused ) {
			if ( array_key_exists( $key, $clean ) ) {
				$stored[ $key ]  = $clean[ $key ];
				$changed[ $key ] = $clean[ $key ];
			}
		}
		update_option( ImgSentry_Settings::OPTION_KEY, $stored, false );

		$this->log_action( 'Optimization settings updated', $changed, 'info', 'Settings', 'Optimizer Engine' );

		wp_send_json_success(
			array(
				'message'  => __( 'Optimization settings saved.', 'imgsentry' ),
				'settings' => $changed,
			)
		);
	}

	/**
	 * Let the request finish its work even if the browser disconnects, within a time limit.
	 *
	 * @param int $seconds Time limit in seconds.
	 * @return void
	 */
	private function keep_running( $seconds ) {
		ignore_user_abort( true );
		if ( function_exists( 'set_time_limit' ) ) {
			set_time_limit( (int) $seconds ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- Long optimizations need more than the default limit; the call is skipped where it is disabled.
		}
	}

	/**
	 * Attachment IDs from a JSON list in $_POST[ $field ]: unique, positive, limited, and only those the person may edit.
	 *
	 * @param string $field Field name.
	 * @param int    $limit Maximum number of IDs.
	 * @return int[]
	 */
	private function read_id_list( $field, $limit ) {
		// The nonce is verified by the calling handler. The value is decoded JSON and every entry is cast to int below.
		$raw = isset( $_POST[ $field ] ) ? json_decode( wp_unslash( $_POST[ $field ] ), true ) : null; // phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$ids = array();
		foreach ( $raw as $value ) {
			if ( is_scalar( $value ) && (int) $value > 0 ) {
				$ids[ (int) $value ] = (int) $value;
			}
			if ( count( $ids ) >= $limit ) {
				break;
			}
		}
		return $this->filter_editable_ids( array_values( $ids ) );
	}

	/**
	 * Administrators may see every attachment; everyone else only the ones they can edit.
	 *
	 * @param int[] $ids Attachment IDs.
	 * @return int[]
	 */
	private function filter_editable_ids( array $ids ) {
		if ( ImgSentry_Permissions::is_administrator() ) {
			return $ids;
		}
		return array_values(
			array_filter(
				$ids,
				static function ( $id ) {
					return current_user_can( 'edit_post', $id );
				}
			)
		);
	}

	/**
	 * Live progress of single-image optimizations.
	 *
	 * Input: nonce, optional ids (JSON array, at most 25).
	 * Output: { items: { "123": { ...progress... } }, active: [123, 456] }
	 */
	public function get_optimize_progress() {
		$this->verify_permission( array( 'optimization', 'dashboard' ), 'imgsentry_admin_nonce' );

		if ( ! class_exists( 'ImgSentry_Optimize_Progress' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimize-progress.php';
		}

		$ids    = $this->read_id_list( 'ids', 25 );
		$active = $this->filter_editable_ids( ImgSentry_Optimize_Progress::get_active() );

		wp_send_json_success(
			array(
				'items'  => (object) ImgSentry_Optimize_Progress::get_many( $ids ),
				'active' => array_values( $active ),
			)
		);
	}

	/**
	 * Fetch background optimization queue status.
	 *
	 * Optional input sync_ids (JSON array, at most 50): the ids the screen is waiting for. Those whose last queue row
	 * is finished are returned in "finished" together with the refreshed media item.
	 */
	public function get_queue_status() {
		$this->verify_permission( array( 'optimization', 'dashboard' ), 'imgsentry_admin_nonce' );

		if ( ! class_exists( 'ImgSentry_Optimization_Queue' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-queue.php';
		}

		$status   = ImgSentry_Optimization_Queue::get_status_counts();
		$finished = array();
		$sync_ids = $this->read_id_list( 'sync_ids', 50 );

		if ( ! empty( $sync_ids ) ) {
			$rows = ImgSentry_Optimization_Queue::get_latest_rows( $sync_ids );
			foreach ( $sync_ids as $id ) {
				if ( ! isset( $rows[ $id ] ) ) {
					continue;
				}
				$row = $rows[ $id ];
				if ( ! in_array( $row->status, array( 'done', 'failed', 'cancelled' ), true ) ) {
					continue;
				}
				$post = get_post( $id );
				if ( ! $post || 'attachment' !== $post->post_type ) {
					continue; // Deleted in the meantime.
				}
				$state = $row->status;
				$error = null;
				if ( 'done' === $state && 'skipped' === $row->outcome ) {
					$state = 'skipped';
				} elseif ( 'done' !== $state ) {
					$error = ! empty( $row->last_error ) ? $row->last_error : $row->error_message;
					$error = ( null === $error || '' === $error ) ? null : (string) $error;
				}
				$entry = array(
					'id'    => $id,
					'state' => $state,
					'error' => $error,
				);
				if ( in_array( $state, array( 'done', 'skipped' ), true ) ) {
					$entry['item'] = ImgSentry_Scanner::format_media_item( $post );
				}
				$finished[] = $entry;
			}
		}

		wp_send_json_success( array(
			'status'   => $status,
			'finished' => $finished,
		) );
	}

	/**
	 * Enqueue attachments into the background queue.
	 */
	public function enqueue_optimization_queue() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$attachment_ids_raw = isset( $_POST['attachment_ids'] ) ? json_decode( wp_unslash( $_POST['attachment_ids'] ), true ) : null;
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$options_raw        = isset( $_POST['options'] ) ? json_decode( wp_unslash( $_POST['options'] ), true ) : null;

		if ( ! is_array( $attachment_ids_raw ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid attachment IDs payload.', 'imgsentry' ) ) );
		}

		// Do not queue work that cannot run (quota used up / local or staging site).
		if ( class_exists( 'ImgSentry_Quota' ) ) {
			$quota_block = ImgSentry_Quota::check_can_optimize();
			if ( null !== $quota_block ) {
				wp_send_json_error(
					array(
						'message'    => $quota_block['message'],
						'error_code' => $quota_block['code'],
						'quota'      => ImgSentry_Quota::get_status(),
					),
					403
				);
				exit;
			}
		}

		$attachment_ids = array_map( 'intval', $attachment_ids_raw );
		$options        = is_array( $options_raw ) ? $options_raw : array();

		// Per-item check: non-administrators may only optimize media WordPress lets them edit.
		if ( ! ImgSentry_Permissions::is_administrator() ) {
			$editable_ids = array();
			foreach ( $attachment_ids as $candidate_id ) {
				if ( $candidate_id > 0 && current_user_can( 'edit_post', $candidate_id ) ) {
					$editable_ids[] = $candidate_id;
				}
			}
			if ( ! empty( $attachment_ids ) && empty( $editable_ids ) ) {
				wp_send_json_error( array( 'message' => __( 'You do not have permission to optimize the selected media items.', 'imgsentry' ) ), 403 );
				exit;
			}
			$attachment_ids = $editable_ids;
		}

		if ( ! class_exists( 'ImgSentry_Optimization_Queue' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-queue.php';
		}

		$result = ImgSentry_Optimization_Queue::enqueue( $attachment_ids, $options, false );

		if ( ! empty( $result['skipped'] ) && $result['skipped'] > 0 ) {
			$message = sprintf(
				/* translators: 1: number of selected images, 2: number of images skipped because they are already optimized, 3: number of images queued. */
				__( '%1$d selected, %2$d already optimized and skipped, %3$d queued for background processing.', 'imgsentry' ),
				$result['total'],
				$result['skipped'],
				$result['enqueued']
			);
		} else {
			/* translators: %d: number of images queued. */
			$message = sprintf( __( 'Enqueued %d image(s) for background processing.', 'imgsentry' ), $result['enqueued'] );
		}

		wp_send_json_success( array(
			'message'  => $message,
			'enqueued' => $result['enqueued'],
			'skipped'  => $result['skipped'],
			'total'    => $result['total'],
			'status'   => $result['status'],
		) );
	}

	/**
	 * Cancel background queue processing.
	 */
	public function cancel_optimization_queue() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		if ( ! class_exists( 'ImgSentry_Optimization_Queue' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-queue.php';
		}

		ImgSentry_Optimization_Queue::cancel_queue();

		wp_send_json_success( array(
			'message' => __( 'Background queue processing cancelled successfully.', 'imgsentry' ),
			'status'  => ImgSentry_Optimization_Queue::get_status_counts(),
		) );
	}

	/**
	 * Clear historical queue records (done, failed, cancelled).
	 */
	public function clear_optimization_queue() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		if ( ! class_exists( 'ImgSentry_Optimization_Queue' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-queue.php';
		}

		ImgSentry_Optimization_Queue::clear_queue();

		wp_send_json_success( array(
			'message' => __( 'Cleared completed background queue history successfully.', 'imgsentry' ),
			'status'  => ImgSentry_Optimization_Queue::get_status_counts(),
		) );
	}

	/**
	 * Optimize a single image immediately.
	 */
	public function optimize_image() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$attachment_id = isset( $_POST['attachment_id'] ) ? intval( $_POST['attachment_id'] ) : 0;
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$options_raw   = isset( $_POST['options'] ) ? json_decode( wp_unslash( $_POST['options'] ), true ) : null;
		$options       = is_array( $options_raw ) ? $options_raw : array();

		if ( ! ImgSentry_Permissions::is_administrator() && ( $attachment_id <= 0 || ! current_user_can( 'edit_post', $attachment_id ) ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to optimize this media item.', 'imgsentry' ) ), 403 );
			exit;
		}

		// Closing the tab must not stop a half-finished optimization; the result is saved in the database either way.
		$this->keep_running( 120 );

		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}

		$result = ImgSentry_Optimizer_Engine::optimize( $attachment_id, $options );

		if ( ! empty( $result['success'] ) ) {
			wp_send_json_success( $result );
		} else {
			wp_send_json_error( $result );
		}
	}

	/**
	 * Restore a single image back to original pristine state.
	 */
	public function restore_original() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$attachment_id = isset( $_POST['attachment_id'] ) ? intval( $_POST['attachment_id'] ) : 0;

		if ( ! ImgSentry_Permissions::is_administrator() && ( $attachment_id <= 0 || ! current_user_can( 'edit_post', $attachment_id ) ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to restore this media item.', 'imgsentry' ) ), 403 );
			exit;
		}

		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}

		$result = ImgSentry_Optimizer_Engine::restore_original( $attachment_id );

		if ( ! empty( $result['success'] ) ) {
			wp_send_json_success( $result );
		} else {
			wp_send_json_error( $result );
		}
	}

	/**
	 * Log a failed queue tick at most once per minute for each failure kind.
	 *
	 * The tick endpoint is reachable without login (the background loopback request has no cookie), so anyone
	 * can call it. Without this limit, repeated wrong-secret requests would add one log row per request.
	 *
	 * @param string $key     Failure kind (used in the transient name).
	 * @param string $message Log message.
	 * @return void
	 */
	private function log_queue_tick_failure_throttled( $key, $message ) {
		if ( ! class_exists( 'ImgSentry_Logger' ) ) {
			return;
		}
		$transient = 'imgsentry_tick_fail_' . sanitize_key( $key );
		if ( get_transient( $transient ) ) {
			return;
		}
		set_transient( $transient, 1, MINUTE_IN_SECONDS );
		ImgSentry_Logger::error( $message );
	}

	/**
	 * Tick/process background queue.
	 */
	public function process_queue_tick() {
		// This endpoint is called by the plugin's own background request (no login, so no nonce). It is protected by a random secret checked below with hash_equals().
		// phpcs:ignore WordPress.Security.NonceVerification.Missing
		$secret   = isset( $_POST['secret'] ) ? sanitize_text_field( wp_unslash( $_POST['secret'] ) ) : '';
		$expected = get_option( 'imgsentry_queue_worker_secret' );

		if ( empty( $expected ) ) {
			$this->log_queue_tick_failure_throttled( 'secret_missing', 'Queue worker tick failed: imgsentry_queue_worker_secret not configured in options.' );
			wp_send_json_error( array( 'message' => __( 'Queue worker secret not configured.', 'imgsentry' ) ) );
			exit;
		}

		if ( empty( $secret ) || ! hash_equals( $expected, $secret ) ) {
			$this->log_queue_tick_failure_throttled( 'secret_mismatch', 'Queue worker tick failed: Unauthorized queue process trigger (secret mismatch).' );
			wp_send_json_error( array( 'message' => __( 'Unauthorized queue process trigger.', 'imgsentry' ) ) );
			exit;
		}

		$this->keep_running( 120 );

		if ( ! class_exists( 'ImgSentry_Optimization_Queue' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-queue.php';
		}

		$result = ImgSentry_Optimization_Queue::process_batch();
		wp_send_json_success( $result );
	}

	/**
	 * Browser-driven queue tick (logged-in admins only).
	 *
	 * Keeps the queue moving when WP-Cron and loopback requests are blocked. The
	 * queue's own run lock prevents overlapping workers, so concurrent ticks are safe.
	 */
	public function run_queue_tick() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );
		$this->keep_running( 120 );

		if ( ! class_exists( 'ImgSentry_Optimization_Queue' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimization-queue.php';
		}

		$result = ImgSentry_Optimization_Queue::process_batch();
		wp_send_json_success( $result );
	}

	/**
	 * Scan and clean stale backup references.
	 */
	public function clean_stale_backups() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}

		$result = ImgSentry_Optimizer_Engine::clean_stale_backups();

		wp_send_json_success(
			array(
				'total_scanned' => $result['total_scanned'],
				'cleared_stale' => $result['cleared_stale'],
				'message'       => sprintf( 'Scanned %d backup records. Cleared %d stale references.', $result['total_scanned'], $result['cleared_stale'] ),
			)
		);
	}

	/**
	 * Backup count and disk usage (Settings screen).
	 */
	public function get_backup_usage() {
		$this->verify_request( 'imgsentry_admin_nonce' );
		if ( ! ImgSentry_Permissions::is_administrator() ) {
			wp_send_json_error( array( 'message' => __( 'Only administrators can see backup usage.', 'imgsentry' ) ), 403 );
			exit;
		}
		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}
		wp_send_json_success( ImgSentry_Optimizer_Engine::get_backup_usage() );
	}

	/**
	 * Delete all original-image backups (administrators only).
	 */
	public function delete_all_backups() {
		$this->verify_request( 'imgsentry_admin_nonce' );
		if ( ! ImgSentry_Permissions::is_administrator() ) {
			wp_send_json_error( array( 'message' => __( 'Only administrators can delete backups.', 'imgsentry' ) ), 403 );
			exit;
		}
		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}
		$deleted = ImgSentry_Optimizer_Engine::delete_all_backups();
		wp_send_json_success(
			array(
				'deleted' => $deleted,
				'usage'   => ImgSentry_Optimizer_Engine::get_backup_usage(),
				'message' => sprintf( 'Deleted %d backup files.', $deleted ),
			)
		);
	}

	/**
	 * Scan and purge orphaned trash-created backups.
	 */
	public function purge_orphaned_trash_backups() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}

		$result = ImgSentry_Optimizer_Engine::purge_orphaned_trash_backups();

		wp_send_json_success(
			array(
				'scanned_files' => $result['scanned_files'],
				'deleted_files' => $result['deleted_files'],
				'meta_cleaned'  => $result['meta_cleaned'],
				'message'       => sprintf( 'Scanned %d backup file(s). Removed %d orphaned trash backup file(s) and cleared metadata for %d item(s).', $result['scanned_files'], $result['deleted_files'], $result['meta_cleaned'] ),
			)
		);
	}
}
