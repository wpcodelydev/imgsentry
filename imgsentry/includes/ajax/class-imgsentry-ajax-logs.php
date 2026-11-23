<?php
/**
 * AJAX Logs Controller Class for ImgSentry.
 *
 * Provides endpoints for retrieving, filtering, searching, exporting,
 * and managing database-backed activity and audit logs.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Ajax_Logs extends ImgSentry_Ajax_Base {

	/**
	 * Constructor. Register Logs AJAX actions.
	 */
	public function __construct() {
		add_action( 'wp_ajax_imgsentry_get_logs', array( $this, 'get_logs' ) );
		add_action( 'wp_ajax_imgsentry_get_log_stats', array( $this, 'get_log_stats' ) );
		add_action( 'wp_ajax_imgsentry_clear_logs', array( $this, 'clear_logs' ) );
		add_action( 'wp_ajax_imgsentry_export_logs', array( $this, 'export_logs' ) );
		add_action( 'wp_ajax_imgsentry_delete_single_log', array( $this, 'delete_single_log' ) );
	}

	/**
	 * Fetch paginated and filtered logs from database.
	 */
	public function get_logs() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$search     = isset( $_POST['search'] ) ? sanitize_text_field( wp_unslash( $_POST['search'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$level      = isset( $_POST['level'] ) ? sanitize_text_field( wp_unslash( $_POST['level'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$type       = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$source     = isset( $_POST['source'] ) ? sanitize_text_field( wp_unslash( $_POST['source'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$user       = isset( $_POST['user'] ) ? sanitize_text_field( wp_unslash( $_POST['user'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$date_range = isset( $_POST['date_range'] ) ? sanitize_text_field( wp_unslash( $_POST['date_range'] ) ) : ( isset( $_POST['date_filter'] ) ? sanitize_text_field( wp_unslash( $_POST['date_filter'] ) ) : 'all' );
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$date_from  = isset( $_POST['date_from'] ) ? sanitize_text_field( wp_unslash( $_POST['date_from'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$date_to    = isset( $_POST['date_to'] ) ? sanitize_text_field( wp_unslash( $_POST['date_to'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$page       = isset( $_POST['page'] ) ? max( 1, intval( $_POST['page'] ) ) : 1;
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$per_page   = isset( $_POST['per_page'] ) ? intval( $_POST['per_page'] ) : 10;
		$per_page   = ( $per_page < 1 ) ? 10 : min( $per_page, 100 );
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$orderby    = isset( $_POST['orderby'] ) ? sanitize_key( wp_unslash( $_POST['orderby'] ) ) : 'id';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$order      = isset( $_POST['order'] ) ? sanitize_text_field( wp_unslash( $_POST['order'] ) ) : 'DESC';

		$query_args = array(
			'search'     => $search,
			'level'      => $level,
			'type'       => $type,
			'source'     => $source,
			'user'       => $user,
			'date_range' => $date_range,
			'date_from'  => $date_from,
			'date_to'    => $date_to,
			'page'       => $page,
			'per_page'   => $per_page,
			'orderby'    => $orderby,
			'order'      => $order,
		);

		$result = ImgSentry_Logger::query( $query_args );
		$stats  = ImgSentry_Logger::get_stats();

		wp_send_json_success( array(
			'items'       => $result['items'],
			'total'       => $result['total'],
			'page'        => $result['page'],
			'per_page'    => $result['per_page'],
			'total_pages' => $result['total_pages'],
			'stats'       => $stats,
		) );
	}

	/**
	 * Get aggregated statistics for the logs tab.
	 */
	public function get_log_stats() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		$stats = ImgSentry_Logger::get_stats();

		wp_send_json_success( array(
			'stats' => $stats,
		) );
	}

	/**
	 * Clear all logs from database.
	 */
	public function clear_logs() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		$cleared = ImgSentry_Logger::clear_all();

		if ( ! $cleared ) {
			wp_send_json_error( array( 'message' => __( 'Failed to clear logs database.', 'imgsentry' ) ) );
		}

		$stats = ImgSentry_Logger::get_stats();

		wp_send_json_success( array(
			'message' => __( 'Logs cleared successfully.', 'imgsentry' ),
			'stats'   => $stats,
		) );
	}

	/**
	 * Export logs to CSV string.
	 */
	public function export_logs() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		if ( function_exists( 'set_time_limit' ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
			@set_time_limit( 0 );
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$search     = isset( $_POST['search'] ) ? sanitize_text_field( wp_unslash( $_POST['search'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$level      = isset( $_POST['level'] ) ? sanitize_text_field( wp_unslash( $_POST['level'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$type       = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$source     = isset( $_POST['source'] ) ? sanitize_text_field( wp_unslash( $_POST['source'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$user       = isset( $_POST['user'] ) ? sanitize_text_field( wp_unslash( $_POST['user'] ) ) : 'all';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$date_range = isset( $_POST['date_range'] ) ? sanitize_text_field( wp_unslash( $_POST['date_range'] ) ) : ( isset( $_POST['date_filter'] ) ? sanitize_text_field( wp_unslash( $_POST['date_filter'] ) ) : 'all' );
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$date_from  = isset( $_POST['date_from'] ) ? sanitize_text_field( wp_unslash( $_POST['date_from'] ) ) : '';
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$date_to    = isset( $_POST['date_to'] ) ? sanitize_text_field( wp_unslash( $_POST['date_to'] ) ) : '';

		$query_args = array(
			'search'     => $search,
			'level'      => $level,
			'type'       => $type,
			'source'     => $source,
			'user'       => $user,
			'date_range' => $date_range,
			'date_from'  => $date_from,
			'date_to'    => $date_to,
		);

		$filename = 'imgsentry-logs-' . gmdate( 'Y-m-d-His' ) . '.csv';

		// Drop any buffered output (notices from other plugins etc.) so it cannot end up inside the CSV file.
		while ( ob_get_level() > 0 ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
			@ob_end_clean();
		}

		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
		header( 'Cache-Control: no-store, no-cache, must-revalidate' );

		$output = fopen( 'php://output', 'w' );
		// UTF-8 BOM so Excel shows non-English text correctly (the browser-side export already does this).
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
		fwrite( $output, "\xEF\xBB\xBF" );
		fputcsv( $output, array( 'Log ID', 'Timestamp', 'Level', 'Type', 'Source', 'User', 'IP Address', 'Message', 'Details' ) );

		$batch_size = 1000;
		$page       = 1;

		while ( true ) {
			$query_args['page']     = $page;
			$query_args['per_page'] = $batch_size;

			$result = ImgSentry_Logger::query( $query_args );
			$items  = isset( $result['items'] ) ? $result['items'] : array();

			if ( empty( $items ) ) {
				break;
			}

			foreach ( $items as $item ) {
				fputcsv( $output, array(
					$item['id'],
					$item['raw_time'],
					$item['level'],
					$item['type'],
					ImgSentry_Logger::csv_safe( $item['source'] ),
					ImgSentry_Logger::csv_safe( $item['user'] ),
					ImgSentry_Logger::csv_safe( $item['ip'] ),
					ImgSentry_Logger::csv_safe( $item['boldText'] ),
					ImgSentry_Logger::csv_safe( $item['subText'] ),
				) );
			}

			unset( $result, $items );

			if ( ob_get_level() > 0 ) {
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
				@ob_flush();
			}
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
			@flush();

			$page++;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
		fclose( $output );
		exit;
	}

	/**
	 * Delete a single log record.
	 */
	public function delete_single_log() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$raw_id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		if ( ! $raw_id && isset( $_POST['log_id'] ) ) {
			// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
			$log_id_str = sanitize_text_field( wp_unslash( $_POST['log_id'] ) );
			$raw_id     = absint( str_replace( 'log-', '', $log_id_str ) );
		}

		if ( ! $raw_id ) {
			wp_send_json_error( array( 'message' => __( 'Invalid log ID.', 'imgsentry' ) ) );
		}

		global $wpdb;
		$table_name = ImgSentry_Logger::get_table_name();
		$deleted    = $wpdb->delete( $table_name, array( 'id' => $raw_id ), array( '%d' ) );

		if ( false === $deleted || 0 === $deleted ) {
			wp_send_json_error( array( 'message' => __( 'Log item not found or could not be deleted.', 'imgsentry' ) ) );
		}

		$stats = ImgSentry_Logger::get_stats();

		wp_send_json_success( array(
			'message' => __( 'Log item deleted successfully.', 'imgsentry' ),
			'stats'   => $stats,
		) );
	}
}
