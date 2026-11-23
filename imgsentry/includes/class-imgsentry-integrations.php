<?php
/**
 * Integrations: real plugin detection and custom image fields (extra meta keys).
 * The scan webhook (a Business / Professional feature) lives in includes/premium/ and is not part of the free build.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Integrations {

	const MAX_META_KEYS = 50;
	const MAX_KEY_LEN   = 100;

	/** @var array|null Per-request cache of the saved custom meta keys. */
	private static $meta_keys_cache = null;

	/* ---------------------------------------------------------------------
	 * A) Supported plugins with real status
	 * ------------------------------------------------------------------- */

	/**
	 * Which translation plugin really is installed (WPML and Polylang separately).
	 * Polylang can define icl_object_id() itself, so the generic detector alone may say "wpml" on a Polylang site.
	 *
	 * @return array{wpml:bool,polylang:bool}
	 */
	public static function detect_translation_plugins() {
		$active  = ( class_exists( 'ImgSentry_Usage_Indexer' ) && method_exists( 'ImgSentry_Usage_Indexer', 'get_active_translation_plugin' ) )
			? ImgSentry_Usage_Indexer::get_active_translation_plugin()
			: null;
		$wpml_real = defined( 'ICL_SITEPRESS_VERSION' ) || class_exists( 'SitePress' );
		$pll_real  = defined( 'POLYLANG_VERSION' ) || class_exists( 'Polylang' ) || function_exists( 'pll_get_post_translations' );

		return array(
			'wpml'     => ( 'wpml' === $active ) && $wpml_real,
			'polylang' => ( 'polylang' === $active ) || ( 'wpml' === $active && ! $wpml_real && $pll_real ),
		);
	}

	/**
	 * Detect a single plugin. Never fatal when the plugin is absent.
	 *
	 * @param string $id Item id.
	 * @return bool
	 */
	public static function is_plugin_active( $id ) {
		switch ( $id ) {
			case 'elementor':
				return defined( 'ELEMENTOR_VERSION' );
			case 'woocommerce':
				return class_exists( 'WooCommerce' );
			case 'divi':
				return defined( 'ET_BUILDER_VERSION' ) || defined( 'ET_CORE_VERSION' );
			case 'beaver':
				return class_exists( 'FLBuilder' ) || defined( 'FL_BUILDER_VERSION' );
			case 'wpbakery':
				return defined( 'WPB_VC_VERSION' );
			case 'acf':
				return class_exists( 'ACF' ) || function_exists( 'get_field' );
			case 'wpml':
				$t = self::detect_translation_plugins();
				return $t['wpml'];
			case 'polylang':
				$t = self::detect_translation_plugins();
				return $t['polylang'];
		}
		return false;
	}

	/**
	 * List for the Integrations tab. Descriptions only claim what the scanner really does.
	 *
	 * @return array<int,array{id:string,name:string,status:string,desc:string}>
	 */
	public static function get_supported_plugins() {
		$items = array(
			array( 'elementor', 'Elementor', 'Reads Elementor layouts and re-checks a page when it is saved.' ),
			array( 'woocommerce', 'WooCommerce', 'Reads product gallery images and re-checks a product when it is saved.' ),
			array( 'divi', 'Divi', 'Reads Divi shortcodes and image URLs inside page content.' ),
			array( 'beaver', 'Beaver Builder', 'Reads Beaver Builder layout data (image IDs and URLs).' ),
			array( 'wpbakery', 'WPBakery', 'Reads single image IDs in WPBakery shortcodes.' ),
			array( 'acf', 'Advanced Custom Fields', 'Reads fields named image, gallery, photo and similar. Add other names below.' ),
			array( 'wpml', 'WPML', 'Counts usage across translated posts and media.' ),
			array( 'polylang', 'Polylang', 'Counts usage across translated posts and media.' ),
		);

		$out = array();
		foreach ( $items as $item ) {
			$out[] = array(
				'id'     => $item[0],
				'name'   => $item[1],
				'status' => self::is_plugin_active( $item[0] ) ? 'active' : 'inactive',
				'desc'   => $item[2],
			);
		}

		$out[] = array(
			'id'     => 'blocks',
			'name'   => 'Block editor',
			'status' => 'builtin',
			'desc'   => 'Reads image, gallery, cover and media-text blocks.',
		);
		$out[] = array(
			'id'     => 'widgets',
			'name'   => 'Widgets and Customizer',
			'status' => 'builtin',
			'desc'   => 'Reads widgets, site logo, site icon and header image.',
		);

		return $out;
	}

	/**
	 * Settings as sent to the browser: the webhook secret never leaves the server, and the read-only
	 * plugin list travels with them (read from the `settings` prop in React, not posted back).
	 *
	 * @param array $settings Full settings.
	 * @return array
	 */
	public static function prepare_settings_for_browser( $settings ) {
		if ( ! is_array( $settings ) ) {
			return $settings;
		}
		$settings['webhookSecretSet'] = ! empty( $settings['webhookSecret'] );
		$settings['webhookSecret']    = '';
		unset( $settings['webhookSecretClear'] );
		$settings['integrations'] = self::get_supported_plugins();
		return $settings;
	}

	/* ---------------------------------------------------------------------
	 * B) Custom image fields (extra meta keys)
	 * ------------------------------------------------------------------- */

	/**
	 * Clean a list of meta keys. Accepts an array or a text with one key per line.
	 * Allowed characters: A-Z a-z 0-9 _ - . : (1-100 chars). Duplicates removed, max 50 keys.
	 *
	 * @param mixed $raw Array or newline separated string.
	 * @return string[]
	 */
	public static function sanitize_meta_keys( $raw ) {
		if ( is_string( $raw ) ) {
			$raw = preg_split( '/\r\n|\r|\n/', $raw );
		}
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$clean = array();
		foreach ( $raw as $line ) {
			if ( ! is_string( $line ) && ! is_numeric( $line ) ) {
				continue;
			}
			$key = trim( (string) $line );
			if ( '' === $key || strlen( $key ) > self::MAX_KEY_LEN || ! preg_match( '/^[A-Za-z0-9_\-.:]+$/', $key ) ) {
				continue;
			}
			if ( in_array( $key, $clean, true ) ) {
				continue;
			}
			$clean[] = $key;
			if ( count( $clean ) >= self::MAX_META_KEYS ) {
				break;
			}
		}
		return $clean;
	}

	/**
	 * Saved custom keys (cached for this request).
	 *
	 * @return string[]
	 */
	public static function get_custom_meta_keys() {
		if ( null !== self::$meta_keys_cache ) {
			return self::$meta_keys_cache;
		}
		$keys = array();
		if ( class_exists( 'ImgSentry_Settings' ) ) {
			$settings = ImgSentry_Settings::instance()->get_settings();
			if ( is_array( $settings ) && isset( $settings['customMetaKeys'] ) ) {
				$keys = self::sanitize_meta_keys( $settings['customMetaKeys'] );
			}
		}
		self::$meta_keys_cache = $keys;
		return $keys;
	}

	/** Forget the per-request cache (after the settings were saved). */
	public static function flush_cache() {
		self::$meta_keys_cache = null;
	}
}
