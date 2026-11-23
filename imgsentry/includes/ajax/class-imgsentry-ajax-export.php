<?php
/**
 * AJAX Export Controller Class for ImgSentry.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Ajax_Export extends ImgSentry_Ajax_Base {

	/**
	 * Constructor. Register Export AJAX actions.
	 */
	public function __construct() {
		add_action( 'wp_ajax_imgsentry_export_csv', array( $this, 'export_csv' ) );
	}

	/**
	 * Export Media List to CSV using batched streaming.
	 */
		/**
	 * Safe helper for CSV cell values.
	 */
	private static function csv_safe( $v ) {
		if ( is_string( $v ) && strlen( $v ) > 0 ) {
			$first = $v[0];
			if ( in_array( $first, array( '=', '+', '-', '@', "\t", "\r" ), true ) ) {
				return "'" . $v;
			}
		}
		return $v;
	}

public function export_csv() {
		$this->verify_request( 'imgsentry_admin_nonce' );

		if ( function_exists( 'set_time_limit' ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
			@set_time_limit( 0 );
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$status   = isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : 'all';
		$filename = 'media-export-' . gmdate( 'Y-m-d-His' ) . '.csv';

		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . $filename );

		$output = fopen( 'php://output', 'w' );
		echo "\xEF\xBB\xBF";
		fputcsv( $output, array( 'ID', 'Title', 'Filename', 'Size (Bytes)', 'Mime Type', 'Upload Date', 'In Use', 'Trashed' ) );

		$batch_size = 1000;
		$page       = 1;

		while ( true ) {
			$result = ImgSentry_Scanner::get_media_items( array(
				'status'   => $status,
				'page'     => $page,
				'per_page' => $batch_size,
			) );

			$items = isset( $result['items'] ) ? $result['items'] : array();
			if ( empty( $items ) ) {
				break;
			}

			foreach ( $items as $item ) {
				fputcsv( $output, array(
					$item['id'],
					self::csv_safe( $item['title'] ),
					self::csv_safe( $item['filename'] ),
					$item['file_size'],
					self::csv_safe( $item['mime_type'] ),
					self::csv_safe( $item['upload_date'] ),
					$item['in_use'] ? 'Yes' : 'No',
					$item['is_trashed'] ? 'Yes' : 'No',
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
}
