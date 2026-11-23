<?php
/**
 * Media Library "ImgSentry" column.
 *
 * Adds an optimization column to the Media Library list view (Media > Library, list mode).
 * Each image row shows either an "Optimize" button or the optimization result (new size, saving,
 * a collapsible details panel, "Re-optimize" and "Restore original"). All work is done by the
 * existing optimizer engine; this class only renders the cell and forwards two AJAX actions.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Media_Library_Column extends ImgSentry_Ajax_Base {

	const COLUMN_ID = 'imgsentry_optimizer';

	/**
	 * Source image types the optimizer engine can process.
	 *
	 * @var string[]
	 */
	private static $supported_mimes = array( 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif' );

	/**
	 * Register hooks.
	 */
	public function __construct() {
		add_filter( 'manage_media_columns', array( $this, 'add_column' ) );
		add_action( 'manage_media_custom_column', array( $this, 'render_column' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );

		add_action( 'wp_ajax_imgsentry_ml_optimize', array( $this, 'ajax_optimize' ) );
		add_action( 'wp_ajax_imgsentry_ml_restore', array( $this, 'ajax_restore' ) );
		add_action( 'wp_ajax_imgsentry_ml_delete_nextgen', array( $this, 'ajax_delete_nextgen' ) );
	}

	// ------------------------------------------------------------------
	// Column registration
	// ------------------------------------------------------------------

	/**
	 * Add the column (only for users who may use the optimizer).
	 *
	 * @param array $columns Existing columns.
	 * @return array
	 */
	public function add_column( $columns ) {
		if ( ! self::current_user_can_optimize() ) {
			return $columns;
		}
		$columns[ self::COLUMN_ID ] = esc_html__( 'ImgSentry', 'imgsentry' );
		return $columns;
	}

	/**
	 * Print the cell for one row.
	 *
	 * @param string $column_name Column key.
	 * @param int    $post_id     Attachment ID.
	 */
	public function render_column( $column_name, $post_id ) {
		if ( self::COLUMN_ID !== $column_name ) {
			return;
		}
		echo self::render_cell( $post_id ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Every dynamic value is escaped inside render_cell().
	}

	/**
	 * Load the script and style on the Media Library screen only.
	 *
	 * @param string $hook_suffix Current admin page.
	 */
	public function enqueue_assets( $hook_suffix ) {
		if ( 'upload.php' !== $hook_suffix || ! self::current_user_can_optimize() ) {
			return;
		}

		wp_enqueue_style(
			'imgsentry-media-column',
			IMGSENTRY_PLUGIN_URL . 'assets/css/imgsentry-media-column.css',
			array(),
			IMGSENTRY_VERSION
		);

		wp_enqueue_script(
			'imgsentry-media-column',
			IMGSENTRY_PLUGIN_URL . 'assets/js/imgsentry-media-column.js',
			array(),
			IMGSENTRY_VERSION,
			true
		);

		wp_localize_script(
			'imgsentry-media-column',
			'imgsentryMediaColumn',
			array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nonce'   => wp_create_nonce( 'imgsentry_admin_nonce' ),
				'i18n'    => array(
					'optimizing' => __( 'Optimizing…', 'imgsentry' ),
					'deleting'   => __( 'Deleting…', 'imgsentry' ),
					'restoring'  => __( 'Restoring…', 'imgsentry' ),
					'showMore'   => __( 'View Details', 'imgsentry' ),
					'showLess'   => __( 'Close Details', 'imgsentry' ),
					'confirmNextgen' => __( 'Delete the WebP and AVIF copies of this image? The original image is not touched.', 'imgsentry' ),
					'failed'     => __( 'The request failed. Reload the page and try again.', 'imgsentry' ),
				),
			)
		);
	}

	// ------------------------------------------------------------------
	// AJAX
	// ------------------------------------------------------------------

	/**
	 * Optimize (or re-optimize) one image and return the refreshed cell.
	 */
	public function ajax_optimize() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		$attachment_id = isset( $_POST['attachment_id'] ) ? absint( $_POST['attachment_id'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked in verify_permission().
		$force         = isset( $_POST['force'] ) && '1' === sanitize_text_field( wp_unslash( $_POST['force'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked in verify_permission().

		$this->assert_item_access( $attachment_id );

		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}

		// Same options the "optimize on upload" feature uses (one shared builder, so the two can never drift apart):
		// the output format comes from the Next-Gen Image Format setting. Everything else follows the engine
		// defaults and the global backup setting.
		$options = ImgSentry_Settings::get_auto_optimize_options( $force );

		$result = ImgSentry_Optimizer_Engine::optimize( $attachment_id, $options );

		if ( ! empty( $result['success'] ) ) {
			$text = ! empty( $result['skipped'] )
				? __( 'This image is already optimized.', 'imgsentry' )
				: __( 'Image optimized.', 'imgsentry' );

			wp_send_json_success(
				array(
					'html'    => self::render_cell( $attachment_id, array( 'type' => 'success', 'text' => $text ) ),
					'message' => $text,
				)
			);
		}

		$message = self::clean_message( isset( $result['error'] ) ? $result['error'] : '' );
		if ( '' === $message ) {
			$message = __( 'Optimization failed.', 'imgsentry' );
		}

		$notice = array( 'type' => 'error', 'text' => $message );

		// No account connected yet: the message gets a link to the connect screen (administrators only,
		// because the SDK Account / connect pages need manage_options).
		if ( ! empty( $result['error_code'] ) && in_array( $result['error_code'], array( 'account_required', 'site_mismatch', 'invalid_license' ), true ) && current_user_can( 'manage_options' ) && class_exists( 'ImgSentry_License' ) ) {
			$account = ImgSentry_License::get_account_state();
			if ( '' !== $account['url'] ) {
				$notice['link_url']   = $account['url'];
				$notice['link_label'] = __( 'Connect Account', 'imgsentry' );
			}
		}

		wp_send_json_error(
			array(
				'html'    => self::render_cell( $attachment_id, $notice ),
				'message' => $message,
			)
		);
	}

	/**
	 * Restore the original image and return the refreshed cell.
	 */
	public function ajax_restore() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		$attachment_id = isset( $_POST['attachment_id'] ) ? absint( $_POST['attachment_id'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked in verify_permission().

		$this->assert_item_access( $attachment_id );

		if ( ! class_exists( 'ImgSentry_Optimizer_Engine' ) ) {
			require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimizer-engine.php';
		}

		$result = ImgSentry_Optimizer_Engine::restore_original( $attachment_id );

		if ( ! empty( $result['success'] ) ) {
			$text = __( 'Original image restored.', 'imgsentry' );
			wp_send_json_success(
				array(
					'html'    => self::render_cell( $attachment_id, array( 'type' => 'success', 'text' => $text ) ),
					'message' => $text,
				)
			);
		}

		$message = self::clean_message( isset( $result['error'] ) ? $result['error'] : '' );
		if ( '' === $message ) {
			$message = __( 'The original image could not be restored.', 'imgsentry' );
		}

		wp_send_json_error(
			array(
				'html'    => self::render_cell( $attachment_id, array( 'type' => 'error', 'text' => $message ) ),
				'message' => $message,
			)
		);
	}

	/**
	 * Delete the WebP / AVIF copies of an image that ImgSentry did not optimize itself.
	 */
	public function ajax_delete_nextgen() {
		$this->verify_permission( 'optimization', 'imgsentry_admin_nonce' );

		$attachment_id = isset( $_POST['attachment_id'] ) ? absint( $_POST['attachment_id'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked in verify_permission().

		$this->assert_item_access( $attachment_id );

		// Images ImgSentry optimized keep their next-gen files; "Restore original" is the way to undo those.
		if ( '1' === (string) get_post_meta( $attachment_id, '_imgsentry_optimized', true ) ) {
			wp_send_json_error( array( 'message' => __( 'Use "Restore original" for images optimized with ImgSentry.', 'imgsentry' ) ), 400 );
			exit;
		}

		$deleted = self::delete_nextgen_files( $attachment_id );

		$text = ( $deleted > 0 )
			? __( 'Next-Gen images deleted.', 'imgsentry' )
			: __( 'No Next-Gen images were found.', 'imgsentry' );

		wp_send_json_success(
			array(
				'html'    => self::render_cell( $attachment_id, array( 'type' => 'success', 'text' => $text ) ),
				'message' => $text,
			)
		);
	}

	/**
	 * Delete the .webp / .avif copies next to an image and its thumbnails. The image files themselves are never touched.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return int Number of files deleted.
	 */
	private static function delete_nextgen_files( $attachment_id ) {
		$file = get_attached_file( $attachment_id );
		if ( ! $file ) {
			return 0;
		}

		$dir       = trailingslashit( dirname( $file ) );
		$sources   = array( $file );
		$protected = array( wp_normalize_path( $file ) );

		$metadata = wp_get_attachment_metadata( $attachment_id );
		if ( is_array( $metadata ) ) {
			if ( ! empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
				foreach ( $metadata['sizes'] as $size ) {
					if ( ! empty( $size['file'] ) ) {
						$sources[]   = $dir . $size['file'];
						$protected[] = wp_normalize_path( $dir . $size['file'] );
					}
				}
			}
			if ( ! empty( $metadata['original_image'] ) ) {
				$sources[]   = $dir . $metadata['original_image'];
				$protected[] = wp_normalize_path( $dir . $metadata['original_image'] );
			}
		}

		// Both naming styles exist: photo.jpg.webp and photo.webp.
		$candidates = array();
		foreach ( $sources as $source ) {
			$without_ext = preg_replace( '/\.[^.\/\\\\]+$/', '', $source );
			foreach ( array( 'webp', 'avif' ) as $ext ) {
				$candidates[] = $source . '.' . $ext;
				$candidates[] = $without_ext . '.' . $ext;
			}
		}

		$uploads = wp_upload_dir();
		$base    = trailingslashit( wp_normalize_path( (string) realpath( $uploads['basedir'] ) ) );
		$deleted = 0;

		foreach ( array_unique( $candidates ) as $candidate ) {
			// A converted image can itself be a .webp file: never delete a real image file.
			if ( in_array( wp_normalize_path( $candidate ), $protected, true ) || ! is_file( $candidate ) ) {
				continue;
			}
			$real = realpath( $candidate );
			if ( ! $real || 0 !== strpos( wp_normalize_path( $real ), $base ) ) {
				continue; // Only files inside the uploads folder.
			}
			wp_delete_file( $candidate );
			if ( ! file_exists( $candidate ) ) {
				++$deleted;
			}
		}

		if ( $deleted > 0 ) {
			if ( class_exists( 'ImgSentry_NextGen_Delivery' ) ) {
				ImgSentry_NextGen_Delivery::clear_sibling_cache( $attachment_id );
			}
			if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
				ImgSentry_Optimization_Stats::invalidate_cache();
			}
		}

		return $deleted;
	}

	/**
	 * Stop the request unless the attachment is a supported image this user may edit.
	 *
	 * @param int $attachment_id Attachment ID.
	 */
	private function assert_item_access( $attachment_id ) {
		if ( $attachment_id <= 0 || ! self::is_supported( $attachment_id ) ) {
			wp_send_json_error( array( 'message' => __( 'This file cannot be optimized.', 'imgsentry' ) ), 404 );
			exit;
		}

		if ( ! ImgSentry_Permissions::is_administrator() && ! current_user_can( 'edit_post', $attachment_id ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to change this media item.', 'imgsentry' ) ), 403 );
			exit;
		}
	}

	// ------------------------------------------------------------------
	// Rendering
	// ------------------------------------------------------------------

	/**
	 * HTML of one cell. Safe to print: every dynamic value is escaped here.
	 *
	 * @param int        $attachment_id Attachment ID.
	 * @param array|null $notice        Optional message: array( 'type' => 'success'|'error', 'text' => string ).
	 * @return string
	 */
	public static function render_cell( $attachment_id, $notice = null ) {
		$attachment_id = absint( $attachment_id );

		if ( ! self::is_supported( $attachment_id ) ) {
			return '<span class="imgsentry-ml-na" aria-hidden="true">&mdash;</span>';
		}

		$is_optimized = '1' === (string) get_post_meta( $attachment_id, '_imgsentry_optimized', true );

		if ( $is_optimized ) {
			return self::render_optimized( $attachment_id, $notice );
		}

		// Optimized earlier by another plugin: say so instead of offering to compress it again.
		if ( class_exists( 'ImgSentry_External_Optimizers' ) && ImgSentry_External_Optimizers::is_optimized( $attachment_id ) ) {
			return self::render_external( $attachment_id, $notice );
		}

		return self::render_idle( $attachment_id, $notice );
	}

	/**
	 * Cell for an image that is not optimized yet: one button, nothing else.
	 *
	 * @param int        $attachment_id Attachment ID.
	 * @param array|null $notice        Notice.
	 * @return string
	 */
	private static function render_idle( $attachment_id, $notice ) {
		// A failed earlier attempt is shown until the next try, unless a fresh notice was passed in.
		if ( empty( $notice ) && 'failed' === get_post_meta( $attachment_id, '_imgsentry_optimization_status', true ) ) {
			$stored = self::clean_message( (string) get_post_meta( $attachment_id, '_imgsentry_optimization_error', true ) );
			if ( '' !== $stored ) {
				$notice = array( 'type' => 'error', 'text' => $stored );
			}
		}

		// The output format (Settings > Next-Gen Image Format) is shown as a tooltip only, to keep the cell small.
		$target = self::get_target_format();
		if ( 'original' === $target ) {
			$title = __( 'Compress this image and keep its format', 'imgsentry' );
		} else {
			/* translators: %s: output format name, for example WebP or AVIF. */
			$title = sprintf( __( 'Compress this image and convert it to %s', 'imgsentry' ), self::format_label( $target ) );
		}

		$html  = '<div class="imgsentry-ml" data-imgsentry-id="' . esc_attr( $attachment_id ) . '">';
		$html .= self::notice_html( $notice );
		$html .= '<button type="button" class="button button-primary imgsentry-ml__btn" data-imgsentry-action="optimize" title="' . esc_attr( $title ) . '">' . esc_html__( 'Optimize Now', 'imgsentry' ) . '</button>';
		$html .= '</div>';

		return $html;
	}

	/**
	 * Cell for an image that was already optimized (by another plugin): a short message and three buttons.
	 *
	 * @param int        $attachment_id Attachment ID.
	 * @param array|null $notice        Notice.
	 * @return string
	 */
	private static function render_external( $attachment_id, $notice ) {
		$html  = '<div class="imgsentry-ml is-external" data-imgsentry-id="' . esc_attr( $attachment_id ) . '">';
		$html .= self::notice_html( $notice );
		$html .= '<p class="imgsentry-ml__external"><strong>' . esc_html__( 'WELL DONE.', 'imgsentry' ) . '</strong> ' . esc_html__( 'This media file is already optimized, no further optimization is required.', 'imgsentry' ) . '</p>';
		$html .= '<button type="button" class="button imgsentry-ml__retry" data-imgsentry-action="retry">' . esc_html__( 'Try again', 'imgsentry' ) . '</button>';
		$html .= '<div class="imgsentry-ml__actions">';
		$html .= '<button type="button" class="button-link imgsentry-ml__act" data-imgsentry-action="reoptimize"><span class="dashicons dashicons-admin-generic" aria-hidden="true"></span>' . esc_html__( 'Re-Optimize', 'imgsentry' ) . '</button>';
		$html .= '<button type="button" class="button-link imgsentry-ml__act" data-imgsentry-action="delete-nextgen"><span class="dashicons dashicons-undo" aria-hidden="true"></span>' . esc_html__( 'Delete Next-Gen images', 'imgsentry' ) . '</button>';
		$html .= '</div>';
		$html .= '</div>';

		return $html;
	}

	/**
	 * Cell for an image ImgSentry optimized. The sizes and the saving are always visible; a toggle opens
	 * the extra details; "Re-Optimize" and "Restore Original" sit below with an icon each.
	 *
	 * @param int        $attachment_id Attachment ID.
	 * @param array|null $notice        Notice.
	 * @return string
	 */
	private static function render_optimized( $attachment_id, $notice ) {
		$backup_path = self::get_backup_path( $attachment_id );
		$has_backup  = '' !== $backup_path;

		// Files may have just been rewritten in this same request: never trust PHP's cached file sizes.
		clearstatcache( true );

		$file     = get_attached_file( $attachment_id );
		$file_now = ( $file && file_exists( $file ) ) ? (int) filesize( $file ) : 0;

		$new_size = (int) get_post_meta( $attachment_id, '_imgsentry_effective_size', true );
		if ( $new_size <= 0 ) {
			$new_size = $file_now;
		}

		// The main file (the file people get when they download the image).
		$main_size = ( $file_now > 0 ) ? $file_now : $new_size;

		$saved_bytes = max( 0, (int) get_post_meta( $attachment_id, '_imgsentry_bytes_saved', true ) );
		$overall_pct = max( 0, min( 100, (float) get_post_meta( $attachment_id, '_imgsentry_percent_saved', true ) ) );

		// The real original is the backup file when there is one; otherwise it is the new size plus the saving.
		$original_size = $has_backup ? (int) filesize( $backup_path ) : ( $new_size + $saved_bytes );

		$metadata = wp_get_attachment_metadata( $attachment_id );
		$thumbs   = ( is_array( $metadata ) && ! empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) ? count( $metadata['sizes'] ) : 0;
		$nextgen  = get_post_meta( $attachment_id, '_imgsentry_nextgen_formats', true );
		$nextgen  = is_array( $nextgen ) ? $nextgen : array();
		$has_ng   = ! empty( $nextgen['webp']['exists'] ) || ! empty( $nextgen['avif']['exists'] );

		$format_key = (string) get_post_meta( $attachment_id, '_imgsentry_output_format', true );

		// New Filesize and Original Saving: the WebP / AVIF file when it exists and is smaller than the main
		// file, otherwise the main file. The same rule is used on the Image Optimization page.
		$delivered     = ImgSentry_Optimization_Stats::get_delivered_info( $main_size, $original_size, $nextgen, $format_key );
		$shown_size    = (int) $delivered['size'];
		$original_pct  = ( null !== $delivered['percent'] ) ? (float) $delivered['percent'] : $overall_pct;
		$date_raw   = (string) get_post_meta( $attachment_id, '_imgsentry_optimized_date', true );

		$pct = static function ( $value ) {
			return number_format_i18n( $value, 2 ) . '%';
		};
		$row = static function ( $label, $value, $class = '' ) {
			return '<div class="imgsentry-ml__row"><dt>' . esc_html( $label ) . '</dt><dd' . ( '' !== $class ? ' class="' . esc_attr( $class ) . '"' : '' ) . '>' . esc_html( $value ) . '</dd></div>';
		};

		$panel_id = 'imgsentry-ml-panel-' . $attachment_id;

		$html  = '<div class="imgsentry-ml is-optimized" data-imgsentry-id="' . esc_attr( $attachment_id ) . '">';
		$html .= self::notice_html( $notice );

		// Always visible.
		$html .= '<dl class="imgsentry-ml__details">';
		if ( $original_size > 0 ) {
			$html .= $row( __( 'Original Filesize:', 'imgsentry' ), size_format( $original_size, 2 ) );
		}
		$html .= $row( __( 'New Filesize:', 'imgsentry' ), size_format( $shown_size, 2 ), 'is-accent' );
		$html .= $row( __( 'Original Saving:', 'imgsentry' ), $pct( $original_pct ) );
		$html .= '</dl>';

		// Toggle + extra details.
		$html .= '<button type="button" class="imgsentry-ml__toggle" data-imgsentry-action="toggle" aria-expanded="false" aria-controls="' . esc_attr( $panel_id ) . '"><span class="imgsentry-ml__toggle-text">' . esc_html__( 'View Details', 'imgsentry' ) . '</span><span class="dashicons dashicons-arrow-down-alt2" aria-hidden="true"></span></button>';
		$html .= '<div class="imgsentry-ml__panel" id="' . esc_attr( $panel_id ) . '" hidden>';
		$html .= '<dl class="imgsentry-ml__details">';
		if ( '' !== $format_key ) {
			$html .= $row( __( 'Output format:', 'imgsentry' ), self::format_label( $format_key ), 'is-accent' );
		}
		$html .= $row( __( 'Next-Gen generated:', 'imgsentry' ), $has_ng ? __( 'Yes', 'imgsentry' ) : __( 'No', 'imgsentry' ), 'is-accent' );
		if ( $thumbs > 0 ) {
			$html .= $row( __( 'Thumbnails Optimized:', 'imgsentry' ), number_format_i18n( $thumbs ), 'is-accent' );
		}
		if ( '' !== $date_raw ) {
			$formatted = mysql2date( get_option( 'date_format' ), $date_raw );
			if ( $formatted ) {
				$html .= $row( __( 'Optimized on:', 'imgsentry' ), $formatted );
			}
		}
		$html .= $row( __( 'Original backup:', 'imgsentry' ), $has_backup ? __( 'Available', 'imgsentry' ) : __( 'Not kept', 'imgsentry' ) );
		$html .= '</dl>';
		$html .= '</div>'; // .imgsentry-ml__panel

		// Actions. Both need the original backup: re-optimizing without it would compress an
		// already compressed file again and lose quality.
		if ( $has_backup ) {
			$target = self::get_target_format();
			$title  = ( 'original' === $target )
				? __( 'Optimize again from the original image', 'imgsentry' )
				/* translators: %s: output format name, for example WebP. */
				: sprintf( __( 'Optimize again from the original image as %s', 'imgsentry' ), self::format_label( $target ) );

			$html .= '<div class="imgsentry-ml__actions">';
			$html .= '<button type="button" class="button-link imgsentry-ml__act" data-imgsentry-action="reoptimize" title="' . esc_attr( $title ) . '"><span class="dashicons dashicons-admin-generic" aria-hidden="true"></span>' . esc_html__( 'Re-Optimize', 'imgsentry' ) . '</button>';
			$html .= '<button type="button" class="button-link imgsentry-ml__act" data-imgsentry-action="restore"><span class="dashicons dashicons-undo" aria-hidden="true"></span>' . esc_html__( 'Restore Original', 'imgsentry' ) . '</button>';
			$html .= '</div>';
		}

		$html .= '</div>';

		return $html;
	}

	/**
	 * HTML for an inline message.
	 *
	 * @param array|null $notice Notice.
	 * @return string
	 */
	private static function notice_html( $notice ) {
		if ( ! is_array( $notice ) || empty( $notice['text'] ) ) {
			return '';
		}
		$type = ( isset( $notice['type'] ) && 'success' === $notice['type'] ) ? 'success' : 'error';
		$role = ( 'success' === $type ) ? 'status' : 'alert';

		$link = '';
		if ( ! empty( $notice['link_url'] ) && ! empty( $notice['link_label'] ) ) {
			$link = ' <a href="' . esc_url( (string) $notice['link_url'] ) . '">' . esc_html( (string) $notice['link_label'] ) . '</a>';
		}

		return '<p class="imgsentry-ml__notice imgsentry-ml__notice--' . esc_attr( $type ) . '" role="' . esc_attr( $role ) . '">' . esc_html( (string) $notice['text'] ) . $link . '</p>';
	}

	// ------------------------------------------------------------------
	// Helpers
	// ------------------------------------------------------------------

	/**
	 * Whether the current user may use the optimizer at all.
	 *
	 * @return bool
	 */
	private static function current_user_can_optimize() {
		return class_exists( 'ImgSentry_Permissions' ) && ImgSentry_Permissions::can( 'optimization' );
	}

	/**
	 * Whether the attachment is an image the engine can process.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool
	 */
	private static function is_supported( $attachment_id ) {
		if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) ) {
			return false;
		}
		return in_array( strtolower( (string) get_post_mime_type( $attachment_id ) ), self::$supported_mimes, true );
	}

	/**
	 * Output format chosen in Settings > Next-Gen Image Format: webp, avif or original (when "off").
	 *
	 * @return string
	 */
	private static function get_target_format() {
		return class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::get_target_output_format() : 'original';
	}

	/**
	 * Readable name of an output format key.
	 *
	 * @param string $key Format key.
	 * @return string
	 */
	private static function format_label( $key ) {
		switch ( strtolower( (string) $key ) ) {
			case 'webp':
				return 'WebP';
			case 'avif':
				return 'AVIF';
			case 'both':
				return 'WebP + AVIF';
			default:
				return __( 'Original format', 'imgsentry' );
		}
	}

	/**
	 * Path of the original-image backup, or an empty string when there is none on disk.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return string
	 */
	private static function get_backup_path( $attachment_id ) {
		$path = get_post_meta( $attachment_id, '_imgsentry_backup_original_path', true );
		if ( empty( $path ) ) {
			$path = get_post_meta( $attachment_id, '_imgsentry_backup_path', true );
		}
		return ( is_string( $path ) && '' !== $path && file_exists( $path ) ) ? $path : '';
	}

	/**
	 * Remove the server path from an engine message before it is shown.
	 *
	 * @param string $message Raw message.
	 * @return string
	 */
	private static function clean_message( $message ) {
		$message = wp_strip_all_tags( (string) $message );
		$message = str_replace( array( ABSPATH, wp_normalize_path( ABSPATH ) ), '', $message );
		return trim( $message );
	}
}
