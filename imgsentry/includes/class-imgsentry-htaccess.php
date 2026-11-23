<?php
/**
 * Rewrite rules for Next-Gen images (Apache / LiteSpeed).
 *
 * When the owner chooses "Use rewrite rules" in Settings, a block of rules is written to the site's
 * .htaccess file between "# BEGIN ImgSentry" and "# END ImgSentry" with WordPress' own insert_with_markers().
 * Nothing outside that block is changed. The block is removed again when the option is switched off,
 * when the plugin is deactivated and when it is deleted.
 *
 * With the rules, a browser that supports WebP / AVIF gets the WebP / AVIF copy when it asks for the
 * .jpg / .png address of an image, so no page code has to change.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ImgSentry_Htaccess {

	/**
	 * Marker name used in the .htaccess file.
	 */
	const MARKER = 'ImgSentry';

	/**
	 * Option that remembers that the rules were written successfully.
	 */
	const OPTION_ACTIVE = 'imgsentry_rewrite_active';

	/**
	 * Loads the WordPress admin helpers this class needs.
	 *
	 * @return void
	 */
	private static function load_admin_functions() {
		if ( ! function_exists( 'insert_with_markers' ) ) {
			require_once ABSPATH . 'wp-admin/includes/misc.php';
		}
		if ( ! function_exists( 'get_home_path' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
	}

	/**
	 * Whether this server reads .htaccess files (Apache or LiteSpeed).
	 *
	 * @return bool
	 */
	public static function is_server_supported() {
		global $is_apache;
		return ! empty( $is_apache );
	}

	/**
	 * Whether the rules were written to .htaccess by this plugin.
	 *
	 * @return bool
	 */
	public static function is_active() {
		return (bool) get_option( self::OPTION_ACTIVE, false );
	}

	/**
	 * Full path of the .htaccess file of this site.
	 *
	 * @return string
	 */
	public static function get_file_path() {
		self::load_admin_functions();
		return get_home_path() . '.htaccess';
	}

	/**
	 * The lines written between the markers.
	 *
	 * @return string[]
	 */
	public static function get_rules() {
		return array(
			'<IfModule mod_rewrite.c>',
			'RewriteEngine On',
			'RewriteCond %{HTTP_ACCEPT} image/avif',
			'RewriteCond %{REQUEST_FILENAME} -f',
			'RewriteCond %{REQUEST_FILENAME}.avif -f',
			'RewriteRule ^(.+)\.(jpe?g|png)$ $1.$2.avif [NC,T=image/avif,E=IMGSENTRY_NEXTGEN:1,L]',
			'RewriteCond %{HTTP_ACCEPT} image/webp',
			'RewriteCond %{REQUEST_FILENAME} -f',
			'RewriteCond %{REQUEST_FILENAME}.webp -f',
			'RewriteRule ^(.+)\.(jpe?g|png)$ $1.$2.webp [NC,T=image/webp,E=IMGSENTRY_NEXTGEN:1,L]',
			'</IfModule>',
			'<IfModule mod_headers.c>',
			'<FilesMatch "(?i)\.(jpe?g|png)$">',
			'Header append Vary Accept',
			'</FilesMatch>',
			'Header append Vary Accept env=IMGSENTRY_NEXTGEN',
			'Header append Vary Accept env=REDIRECT_IMGSENTRY_NEXTGEN',
			'</IfModule>',
			'<IfModule mod_mime.c>',
			'AddType image/avif .avif',
			'AddType image/webp .webp',
			'</IfModule>',
		);
	}

	/**
	 * Writes the rules to .htaccess.
	 *
	 * @return array { ok: bool, message: string } The message is empty on success.
	 */
	public static function enable() {
		if ( ! self::is_server_supported() ) {
			delete_option( self::OPTION_ACTIVE );
			return array(
				'ok'      => false,
				'message' => __( 'Rewrite rules need an Apache or LiteSpeed server. This server does not use .htaccess files, so please use the <picture> tags option instead.', 'imgsentry' ),
			);
		}

		self::load_admin_functions();
		$file = self::get_file_path();

		$writable = file_exists( $file ) ? wp_is_writable( $file ) : wp_is_writable( dirname( $file ) );
		if ( ! $writable ) {
			delete_option( self::OPTION_ACTIVE );
			return array(
				'ok'      => false,
				'message' => __( 'The .htaccess file of this site cannot be edited, so the rewrite rules were not added. Make the file writable or use the <picture> tags option instead.', 'imgsentry' ),
			);
		}

		$written = insert_with_markers( $file, self::MARKER, self::get_rules() );
		if ( ! $written ) {
			delete_option( self::OPTION_ACTIVE );
			return array(
				'ok'      => false,
				'message' => __( 'The rewrite rules could not be written to the .htaccess file. Please use the <picture> tags option instead.', 'imgsentry' ),
			);
		}

		update_option( self::OPTION_ACTIVE, 1, false );
		return array(
			'ok'      => true,
			'message' => '',
		);
	}

	/**
	 * Removes the rules from .htaccess (only the block that belongs to this plugin).
	 *
	 * @return array { ok: bool, message: string }
	 */
	public static function disable() {
		delete_option( self::OPTION_ACTIVE );

		self::load_admin_functions();
		$file = self::get_file_path();
		if ( ! file_exists( $file ) ) {
			return array(
				'ok'      => true,
				'message' => '',
			);
		}

		$existing = extract_from_markers( $file, self::MARKER );
		if ( empty( $existing ) ) {
			return array(
				'ok'      => true,
				'message' => '',
			);
		}

		if ( ! wp_is_writable( $file ) || ! insert_with_markers( $file, self::MARKER, array() ) ) {
			return array(
				'ok'      => false,
				'message' => __( 'The ImgSentry rewrite rules could not be removed from the .htaccess file. Please delete the lines between "# BEGIN ImgSentry" and "# END ImgSentry" by hand.', 'imgsentry' ),
			);
		}

		return array(
			'ok'      => true,
			'message' => '',
		);
	}

	/**
	 * Brings the .htaccess file in line with the saved settings.
	 *
	 * @param array $settings Saved plugin settings.
	 * @return array { ok: bool, message: string }
	 */
	public static function sync( $settings ) {
		$wanted = is_array( $settings )
			&& ! empty( $settings['displayNextGenFormat'] )
			&& isset( $settings['nextGenDeliveryMethod'] )
			&& 'rewrite' === $settings['nextGenDeliveryMethod'];

		if ( $wanted ) {
			return self::enable();
		}
		if ( self::is_active() ) {
			return self::disable();
		}
		return array(
			'ok'      => true,
			'message' => '',
		);
	}
}
