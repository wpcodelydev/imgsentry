<?php
/**
 * Used Files Page Class for ImgSentry.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Page_Used_Files {

	/**
	 * Render the Used Files page HTML.
	 */
	public function render() {
		if ( ! ( class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::can_user_access_imgsentry() : current_user_can( 'manage_options' ) ) ) {
			wp_die( esc_html__( 'You do not have sufficient permissions to access this page.', 'imgsentry' ) );
		}
		?>
		<div class="wrap imgsentry-wrap">
			<div id="imgsentry-plugin-root"></div>
		</div>
		<?php
	}
}
