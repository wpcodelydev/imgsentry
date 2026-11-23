<?php
/**
 * Next-Gen Image Delivery Class (WebP / AVIF <picture> Tag Wrapper).
 *
 * Wraps <img> tags in <picture> tags on the front-end when displayNextGenFormat
 * is enabled and AVIF/WebP sibling files exist on disk for the attachment.
 * Available on every plan, with the CDN address too. This is the "Use <picture> tags" method; with the
 * "Use rewrite rules" method (see ImgSentry_Htaccess) the page code is left as it is.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ImgSentry_NextGen_Delivery {

	/**
	 * Single instance of the class.
	 * @var ImgSentry_NextGen_Delivery|null
	 */
	private static $instance = null;

	/**
	 * In-memory runtime cache for attachment sibling checks.
	 * @var array
	 */
	private static $runtime_cache = array();

	/**
	 * Per-request answer to "is Next-Gen delivery switched on and allowed on this plan".
	 * @var bool|null
	 */
	private static $setting_cache = null;

	/**
	 * Get main instance gateway.
	 * @return ImgSentry_NextGen_Delivery
	 */
	public static function get_instance() {
		if ( is_null( self::$instance ) ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->init_hooks();
	}

	/**
	 * Hook into WordPress front-end image rendering filters.
	 */
	private function init_hooks() {
		// 'wp_get_attachment_image' is the WordPress filter for images printed with wp_get_attachment_image() (widgets, galleries, themes).
		add_filter( 'wp_get_attachment_image', array( $this, 'filter_attachment_image_html' ), 10, 5 );
		add_filter( 'post_thumbnail_html', array( $this, 'filter_post_thumbnail_html' ), 10, 5 );
		add_filter( 'the_content', array( $this, 'filter_the_content' ), 99 );
	}

	/**
	 * Check if displayNextGenFormat is enabled in ImgSentry settings (all plans) with the <picture> tags method
	 * and that the current request is one that shows pages to visitors.
	 * @return bool
	 */
	public function is_delivery_enabled() {
		if ( null === self::$setting_cache ) {
			self::$setting_cache = false;
			$settings = get_option( 'imgsentry_settings', array() );
			if ( class_exists( 'ImgSentry_Settings' ) ) {
				$defaults = ImgSentry_Settings::instance()->get_defaults();
				$settings = wp_parse_args( $settings, $defaults );
			}
			$method              = ( is_array( $settings ) && isset( $settings['nextGenDeliveryMethod'] ) ) ? $settings['nextGenDeliveryMethod'] : 'picture';
			self::$setting_cache = is_array( $settings ) && ! empty( $settings['displayNextGenFormat'] ) && 'rewrite' !== $method;
		}

		return self::$setting_cache && $this->is_delivery_context();
	}

	/**
	 * <picture> tags are for pages shown to visitors. Not for the admin screens, RSS feeds or the REST API
	 * (the block editor and other apps would receive <picture> markup they cannot use).
	 * admin-ajax requests are allowed because many themes load posts that way.
	 *
	 * @return bool
	 */
	private function is_delivery_context() {
		if ( is_admin() && ! wp_doing_ajax() ) {
			return false;
		}
		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			return false;
		}
		if ( did_action( 'wp' ) && is_feed() ) {
			return false;
		}
		return true;
	}

	/**
	 * Filter for wp_get_attachment_image_html
	 */
	public function filter_attachment_image_html( $html, $attachment_id, $size, $icon, $attr ) {
		if ( empty( $html ) || ! $this->is_delivery_enabled() ) {
			return $html;
		}
		return $this->maybe_convert_to_picture_tag( $html, $attachment_id );
	}

	/**
	 * Filter for post_thumbnail_html
	 */
	public function filter_post_thumbnail_html( $html, $post_id, $post_thumbnail_id, $size, $attr ) {
		if ( empty( $html ) || ! $this->is_delivery_enabled() || ! $post_thumbnail_id ) {
			return $html;
		}
		return $this->maybe_convert_to_picture_tag( $html, $post_thumbnail_id );
	}

	/**
	 * Filter for the_content to catch wp-image-{id} tags embedded in posts/pages
	 */
	public function filter_the_content( $content ) {
		if ( empty( $content ) || ! $this->is_delivery_enabled() || ! is_string( $content ) ) {
			return $content;
		}

		if ( false === stripos( $content, '<img' ) ) {
			return $content;
		}

		// Existing <picture> blocks are matched first and handed back unchanged, so an <img> that is already
		// wrapped (by the filter above, a theme or the editor) is never wrapped a second time.
		$result = preg_replace_callback(
			'/<picture\b.*?<\/picture>|<img[^>]+>/is',
			array( $this, 'replace_content_img_tag' ),
			$content
		);

		// On a regex error PHP returns null: keep the original content instead of an empty page.
		return ( null === $result ) ? $content : $result;
	}

	/**
	 * Callback to convert an <img> tag in the_content if a wp-image-{id} class or data-attachment-id exists
	 */
	public function replace_content_img_tag( $matches ) {
		$img_tag = $matches[0];

		// A whole <picture> block that is already in the content stays as it is.
		if ( 0 === stripos( $img_tag, '<picture' ) ) {
			return $img_tag;
		}

		// Avoid double-wrapping if already inside a picture element
		if ( false !== stripos( $img_tag, 'data-imgsentry-picture' ) ) {
			return $img_tag;
		}

		$attachment_id = 0;
		if ( preg_match( '/wp-image-(\d+)/i', $img_tag, $id_match ) ) {
			$attachment_id = intval( $id_match[1] );
		} elseif ( preg_match( '/data-attachment-id=["\'](\d+)["\']/i', $img_tag, $id_match ) ) {
			$attachment_id = intval( $id_match[1] );
		}

		if ( $attachment_id > 0 ) {
			return $this->maybe_convert_to_picture_tag( $img_tag, $attachment_id );
		}

		return $img_tag;
	}

	/**
	 * Core conversion function: wraps <img> in <picture> with <source> tags if AVIF/WebP siblings exist on disk.
	 *
	 * Inspects both 'srcset' and 'src' attributes to generate matching per-size Next-Gen srcset / src attributes.
	 *
	 * @param string $html The original <img> element HTML.
	 * @param int $attachment_id The WordPress attachment ID.
	 * @return string The <picture> wrapped HTML or original <img> HTML if no siblings exist.
	 */
	public function maybe_convert_to_picture_tag( $html, $attachment_id = 0 ) {
		if ( empty( $html ) || ! $this->is_delivery_enabled() ) {
			return $html;
		}

		if ( false !== stripos( $html, '<picture' ) ) {
			return $html;
		}

		// Extract src attribute
		$src = '';
		if ( preg_match( '/\bsrc=["\']([^"\']+)["\']/i', $html, $src_match ) ) {
			$src = html_entity_decode( $src_match[1] );
		}

		// Extract srcset attribute
		$srcset = '';
		if ( preg_match( '/\bsrcset=["\']([^"\']+)["\']/i', $html, $srcset_match ) ) {
			$srcset = html_entity_decode( $srcset_match[1] );
		}

		// Extract sizes attribute
		$sizes = '';
		if ( preg_match( '/\bsizes=["\']([^"\']+)["\']/i', $html, $sizes_match ) ) {
			$sizes = $sizes_match[1];
		}

		if ( empty( $src ) && empty( $srcset ) ) {
			return $html;
		}

		$sources_html = '';
		$formats      = array( 'avif', 'webp' ); // AVIF prioritized first, then WebP

		foreach ( $formats as $format ) {
			$new_srcset_entries = array();

			// 1. Process responsive srcset if present
			if ( ! empty( $srcset ) ) {
				$entries = explode( ',', $srcset );
				foreach ( $entries as $entry ) {
					$entry = trim( $entry );
					if ( empty( $entry ) ) {
						continue;
					}

					// Split URL and descriptor (e.g. "https://site/photo-300x200.jpg 300w")
					if ( preg_match( '/^(\S+)(?:\s+(.+))?$/', $entry, $parts ) ) {
						$candidate_url        = $parts[1];
						$candidate_descriptor = ! empty( $parts[2] ) ? $parts[2] : '';

						$sibling_url = $this->get_sibling_for_url( $candidate_url, $format );
						if ( ! empty( $sibling_url ) ) {
							$new_srcset_entries[] = esc_url( $sibling_url ) . ( ! empty( $candidate_descriptor ) ? ' ' . esc_attr( $candidate_descriptor ) : '' );
						}
					}
				}
			}

			// 2. If no valid srcset entries were built, fall back to checking the single src URL
			if ( empty( $new_srcset_entries ) && ! empty( $src ) ) {
				$src_sibling = $this->get_sibling_for_url( $src, $format );
				if ( ! empty( $src_sibling ) ) {
					$new_srcset_entries[] = esc_url( $src_sibling );
				}
			}

			// 3. If we found sibling files for this format, build the <source> tag
			if ( ! empty( $new_srcset_entries ) ) {
				$built_srcset = implode( ', ', $new_srcset_entries );
				$sizes_attr   = ! empty( $sizes ) ? sprintf( ' sizes="%s"', esc_attr( $sizes ) ) : '';

				$sources_html .= sprintf(
					'<source srcset="%s"%s type="image/%s" />',
					$built_srcset,
					$sizes_attr,
					esc_attr( $format )
				);
			}
		}

		if ( empty( $sources_html ) ) {
			return $html;
		}

		return sprintf(
			'<picture data-imgsentry-picture="1">%s%s</picture>',
			$sources_html,
			$html
		);
	}

	/**
	 * Maps a CDN URL (the CDN URL saved in Settings > Optimization) back to the same path on this site,
	 * so the plugin can find the local file and its WebP/AVIF sibling. Returns the URL unchanged when no
	 * CDN is set or the URL does not belong to the CDN. Sibling URLs are still built from the original
	 * (CDN) URL by the caller, so visitors keep getting images from the CDN.
	 *
	 * @param string $url Image URL without query string.
	 * @return string
	 */
	private function map_cdn_url_to_site_url( $url ) {
		$settings = get_option( 'imgsentry_settings', array() );
		$cdn      = ( is_array( $settings ) && ! empty( $settings['cdnUrl'] ) ) ? trim( (string) $settings['cdnUrl'] ) : '';
		if ( '' === $cdn ) {
			return $url;
		}

		$parts = wp_parse_url( $cdn );
		if ( empty( $parts['host'] ) ) {
			return $url;
		}

		$cdn_base = '//' . $parts['host']
			. ( ! empty( $parts['port'] ) ? ':' . $parts['port'] : '' )
			. ( ! empty( $parts['path'] ) ? rtrim( $parts['path'], '/' ) : '' );

		$url_no_proto = preg_replace( '/^https?:/i', '', $url );
		if ( 0 !== stripos( $url_no_proto, $cdn_base . '/' ) ) {
			return $url;
		}

		return untrailingslashit( home_url() ) . substr( $url_no_proto, strlen( $cdn_base ) );
	}

	/**
	 * Resolves the local absolute filesystem path for a given image URL located in wp-content/uploads.
	 *
	 * @param string $url The image URL.
	 * @return string|false The absolute filesystem path, or false if not resolvable.
	 */
	public function get_local_path_from_url( $url ) {
		if ( empty( $url ) || ! is_string( $url ) ) {
			return false;
		}

		$upload_dir = wp_upload_dir();
		$base_url   = $upload_dir['baseurl'];
		$base_dir   = $upload_dir['basedir'];

		// Strip query parameters
		$clean_url = strtok( $url, '?' );

		// If the site serves images from the CDN set in Settings > Optimization, map the CDN URL back to this site's URL.
		$clean_url = $this->map_cdn_url_to_site_url( $clean_url );

		// Normalize protocols (http vs https)
		$clean_url_proto      = preg_replace( '/^https?:/i', '', $clean_url );
		$clean_base_url_proto = preg_replace( '/^https?:/i', '', $base_url );

		if ( 0 === strpos( $clean_url_proto, $clean_base_url_proto ) ) {
			// File names with spaces or accents are written percent-encoded in URLs, but not on the disk.
			$relative_path = rawurldecode( substr( $clean_url_proto, strlen( $clean_base_url_proto ) ) );
			if ( false !== strpos( $relative_path, '..' ) ) {
				return false; // Never leave the uploads folder.
			}
			return $base_dir . $relative_path;
		}

		return false;
	}

	/**
	 * Check if a Next-Gen sibling file exists for a specific image URL and return its sibling URL.
	 *
	 * @param string $image_url The full image URL (main or sub-size).
	 * @param string $format 'avif' or 'webp'.
	 * @return string|null The sibling URL if exists on disk, or null.
	 */
	public function get_sibling_for_url( $image_url, $format ) {
		$format = strtolower( $format );
		if ( ! in_array( $format, array( 'avif', 'webp' ), true ) ) {
			return null;
		}

		$clean_url = strtok( $image_url, '?' );
		$cache_key = 'imgsentry_ng_url_' . md5( $clean_url . '_' . $format );

		// 1. Runtime memory cache check
		if ( isset( self::$runtime_cache[ $cache_key ] ) ) {
			return self::$runtime_cache[ $cache_key ] ? self::$runtime_cache[ $cache_key ] : null;
		}

		// 2. Persistent Transient cache check (12 Hours)
		$cached = get_transient( $cache_key );
		if ( false !== $cached ) {
			self::$runtime_cache[ $cache_key ] = $cached;
			return ! empty( $cached ) ? $cached : null;
		}

		// Check if URL already has the target format extension
		$url_path = wp_parse_url( $clean_url, PHP_URL_PATH );
		$ext      = strtolower( pathinfo( $url_path, PATHINFO_EXTENSION ) );
		if ( $ext === $format ) {
			self::$runtime_cache[ $cache_key ] = false;
			set_transient( $cache_key, '', 12 * HOUR_IN_SECONDS );
			return null;
		}

		$local_path = $this->get_local_path_from_url( $clean_url );
		if ( ! $local_path || ! file_exists( $local_path ) ) {
			self::$runtime_cache[ $cache_key ] = false;
			set_transient( $cache_key, '', 12 * HOUR_IN_SECONDS );
			return null;
		}

		// Check 1: Suffix style (e.g. photo-300x200.jpg.avif)
		$sibling_path_suffix = $local_path . '.' . $format;
		if ( file_exists( $sibling_path_suffix ) ) {
			$sibling_url = $clean_url . '.' . $format;
			self::$runtime_cache[ $cache_key ] = $sibling_url;
			set_transient( $cache_key, $sibling_url, 12 * HOUR_IN_SECONDS );
			return $sibling_url;
		}

		// Check 2: Extension replacement style (e.g. photo-300x200.avif)
		$dir_name          = dirname( $local_path );
		$filename_base     = pathinfo( $local_path, PATHINFO_FILENAME );
		$sibling_path_swap = trailingslashit( $dir_name ) . $filename_base . '.' . $format;
		if ( file_exists( $sibling_path_swap ) ) {
			$url_dir     = dirname( $clean_url );
			$sibling_url = trailingslashit( $url_dir ) . $filename_base . '.' . $format;
			self::$runtime_cache[ $cache_key ] = $sibling_url;
			set_transient( $cache_key, $sibling_url, 12 * HOUR_IN_SECONDS );
			return $sibling_url;
		}

		self::$runtime_cache[ $cache_key ] = false;
		set_transient( $cache_key, '', 12 * HOUR_IN_SECONDS );
		return null;
	}

	/**
	 * Returns available Next-Gen sibling URLs (avif/webp) for an attachment, with caching and safe offload checks.
	 * Maintained for backward compatibility.
	 *
	 * @param int $attachment_id
	 * @return array Array with keys 'avif' => url|null, 'webp' => url|null
	 */
	public function get_nextgen_siblings( $attachment_id ) {
		$attachment_id = intval( $attachment_id );
		if ( $attachment_id <= 0 ) {
			return array( 'avif' => null, 'webp' => null );
		}

		// 1. Runtime memory cache check
		if ( isset( self::$runtime_cache[ $attachment_id ] ) ) {
			return self::$runtime_cache[ $attachment_id ];
		}

		// 2. Persistent Transient Cache (12 Hours)
		$cache_key = 'imgsentry_ng_siblings_' . $attachment_id;
		$cached    = get_transient( $cache_key );
		if ( false !== $cached && is_array( $cached ) ) {
			self::$runtime_cache[ $attachment_id ] = $cached;
			return $cached;
		}

		$result = array( 'avif' => null, 'webp' => null );

		$attachment_url = wp_get_attachment_url( $attachment_id );
		if ( empty( $attachment_url ) ) {
			self::$runtime_cache[ $attachment_id ] = $result;
			set_transient( $cache_key, $result, 12 * HOUR_IN_SECONDS );
			return $result;
		}

		$result['avif'] = $this->get_sibling_for_url( $attachment_url, 'avif' );
		$result['webp'] = $this->get_sibling_for_url( $attachment_url, 'webp' );

		self::$runtime_cache[ $attachment_id ] = $result;
		set_transient( $cache_key, $result, 12 * HOUR_IN_SECONDS );

		return $result;
	}

	/**
	 * Helper method to clear sibling transient cache for an attachment when optimized/restored.
	 *
	 * @param int $attachment_id
	 */
	public static function clear_sibling_cache( $attachment_id = 0 ) {
		// Reset in-memory runtime cache
		self::$runtime_cache = array();

		$attachment_id = intval( $attachment_id );
		if ( $attachment_id > 0 ) {
			delete_transient( 'imgsentry_ng_siblings_' . $attachment_id );

			// Also clear URL transients for main file and all known sub-sizes
			if ( function_exists( 'wp_get_attachment_url' ) ) {
				$url = wp_get_attachment_url( $attachment_id );
				if ( ! empty( $url ) ) {
					delete_transient( 'imgsentry_ng_url_' . md5( strtok( $url, '?' ) . '_avif' ) );
					delete_transient( 'imgsentry_ng_url_' . md5( strtok( $url, '?' ) . '_webp' ) );
				}

				if ( function_exists( 'wp_get_attachment_metadata' ) ) {
					$metadata = wp_get_attachment_metadata( $attachment_id );
					if ( ! empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) && ! empty( $url ) ) {
						$url_dir = dirname( $url );
						foreach ( $metadata['sizes'] as $size_info ) {
							if ( ! empty( $size_info['file'] ) ) {
								$sub_url = trailingslashit( $url_dir ) . $size_info['file'];
								delete_transient( 'imgsentry_ng_url_' . md5( strtok( $sub_url, '?' ) . '_avif' ) );
								delete_transient( 'imgsentry_ng_url_' . md5( strtok( $sub_url, '?' ) . '_webp' ) );
							}
						}
					}
				}
			}
		}
	}
}
