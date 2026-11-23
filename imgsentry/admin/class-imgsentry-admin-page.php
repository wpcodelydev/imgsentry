<?php
/**
 * Admin Page Renderer Class for ImgSentry.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Admin_Page {

	/**
	 * Page hook suffix.
	 *
	 * @var string
	 */
	private $page_hook = '';

	/**
	 * Constructor. Register admin menu and hooks.
	 */
	public function __construct() {
		add_action( 'admin_menu', array( $this, 'register_admin_menu' ) );
		add_action( 'admin_init', array( $this, 'maybe_redirect_to_accessible_page' ) );
		add_action( 'admin_page_access_denied', array( $this, 'handle_access_denied' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'in_admin_header', array( $this, 'suppress_admin_notices' ), 1000 );
		
		add_filter( 'script_loader_tag', function( $tag, $handle, $src ) {
			if ( 'imgsentry-react-app' === $handle ) {
				// phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedScript -- The script is already enqueued with wp_enqueue_script(); this only marks it as a module.
				return '<script type="module" src="' . esc_url( $src ) . '"></script>';
			}
			return $tag;
		}, 10, 3 );
	}

	/**
	 * Suppress external admin notices on all ImgSentry screens.
	 *
	 * Hooked to 'in_admin_header' at priority 1000 so it executes just before
	 * WordPress renders admin_notices inside #wpbody-content.
	 */
	public function suppress_admin_notices() {
		$screen = get_current_screen();
		if ( ! $screen ) {
			return;
		}

		// Exact screen IDs registered by ImgSentry
		$imgsentry_screen_ids = array(
			'toplevel_page_imgsentry',
			'imgsentry_page_imgsentry-scanner',
			'imgsentry_page_imgsentry-unused',
			'imgsentry_page_imgsentry-used',
			'imgsentry_page_imgsentry-duplicate',
			'imgsentry_page_imgsentry-image_optimization',
			'imgsentry_page_imgsentry-trash',
			'imgsentry_page_imgsentry-reports',
			'imgsentry_page_imgsentry-settings',
			'imgsentry_page_imgsentry-wp_file_manager',
			'imgsentry_page_imgsentry-help',
		);

		if ( in_array( $screen->id, $imgsentry_screen_ids, true ) || strpos( $screen->id, 'media-cleanup' ) !== false ) {
			remove_all_actions( 'admin_notices' );
			remove_all_actions( 'all_admin_notices' );
			remove_all_actions( 'user_admin_notices' );
			remove_all_actions( 'network_admin_notices' );
		}
	}

	/**
	 * Whether the current user may open the File Manager: it must be active (Professional plan + switched ON by
	 * the Administrator) and the user must be an Administrator or be allowed through Allowed Roles / folder rules.
	 *
	 * @return bool
	 */
	private function file_manager_user_allowed() {
		if ( class_exists( 'ImgSentry_License' ) && ! ImgSentry_License::file_manager_active() ) {
			return false;
		}
		return current_user_can( 'manage_options' ) || ( class_exists( 'ImgSentry_FM_Security' ) && ImgSentry_FM_Security::can_user_manage() );
	}

	/**
	 * Whether the locked "Advance File Manager" entry (menu item + upgrade page) is shown to the current user.
	 *
	 * Only for Administrators, only while the plan does not include the File Manager, and only while the
	 * Administrator keeps "Show Advance File Manager in the menu" ON in Settings > General.
	 * The upgrade page never loads any File Manager code or data.
	 *
	 * @return bool
	 */
	private function file_manager_promo_visible() {
		if ( ! class_exists( 'ImgSentry_License' ) || ImgSentry_License::can_use( 'file_manager' ) ) {
			return false;
		}
		$is_admin = class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::is_administrator() : current_user_can( 'manage_options' );
		if ( ! $is_admin ) {
			return false;
		}
		$settings = class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::instance()->get_settings() : array();
		return ! is_array( $settings ) || ! array_key_exists( 'showFileManagerPromo', $settings ) || ! empty( $settings['showFileManagerPromo'] );
	}

	/**
	 * Register Top-Level Admin Menu Page.
	 */
	public function register_admin_menu() {
		$accessible = class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::get_accessible_pages() : array();
		$fm_allowed = $this->file_manager_user_allowed();

		// This user has no ImgSentry access at all: add no menu.
		if ( empty( $accessible ) && ! $fm_allowed ) {
			return;
		}

		// Menu entries are registered only for pages the user may open; every page re-checks access when rendered.
		$this->page_hook = add_menu_page(
			__( 'ImgSentry', 'imgsentry' ),
			__( 'ImgSentry', 'imgsentry' ),
			'read',
			'imgsentry',
			array( $this, 'render_admin_page' ),
			IMGSENTRY_PLUGIN_URL . 'assets/images/imgsentry-icon.svg?v=' . IMGSENTRY_VERSION,
			25
		);

		// Add Dashboard submenu representing the top-level main page
		if ( in_array( 'imgsentry', $accessible, true ) ) {
			add_submenu_page(
				'imgsentry',
				__( 'Dashboard', 'imgsentry' ),
				__( 'Dashboard', 'imgsentry' ),
				'read',
				'imgsentry',
				array( $this, 'render_admin_page' )
			);
		}

		// Other pages
		$subpages = array(
			'scanner'             => __( 'Media Scanner', 'imgsentry' ),
			'unused'              => __( 'Unused Files', 'imgsentry' ),
			'used'                => __( 'Used Files', 'imgsentry' ),
			'duplicate'           => __( 'Duplicate Image', 'imgsentry' ),
			'image_optimization'  => __( 'Image Optimization', 'imgsentry' ),
			'wp_file_manager'     => __( 'Advance File Manager', 'imgsentry' ),
			'trash'               => __( 'Trash Bin', 'imgsentry' ),
			'settings'            => __( 'Settings', 'imgsentry' ),
		);

		foreach ( $subpages as $slug => $title ) {
			$menu_title = $title;
			if ( 'wp_file_manager' === $slug ) {
				// The side menu shows the File Manager only when the user may really open it. The locked
				// upgrade entry lives in the plugin's top tabs, not in the WordPress menu.
				if ( ! $fm_allowed ) {
					continue;
				}
				// Short label so the sidebar item stays on one line (the page title keeps the full name).
				$menu_title = __( 'File Manager', 'imgsentry' );
			} elseif ( ! in_array( 'imgsentry-' . $slug, $accessible, true ) ) {
				continue;
			}
			add_submenu_page(
				'imgsentry',
				$title,
				$menu_title,
				'read',
				'imgsentry-' . $slug,
				array( $this, 'render_admin_page' )
			);
		}
	}

	/**
	 * First ImgSentry page slug the current user may open ('' if none).
	 */
	private function get_first_accessible_slug() {
		$pages = class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::get_accessible_pages() : array();
		if ( ! empty( $pages ) ) {
			return $pages[0];
		}
		if ( $this->file_manager_user_allowed() ) {
			return 'imgsentry-wp_file_manager';
		}
		return '';
	}

	/**
	 * A user without Dashboard access who opens the top-level ImgSentry link is sent to the first page they can open.
	 */
	public function maybe_redirect_to_accessible_page() {
		if ( wp_doing_ajax() || ! class_exists( 'ImgSentry_Permissions' ) ) {
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
		$page = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : '';
		if ( 'imgsentry' !== $page || ImgSentry_Permissions::can_access_page( 'imgsentry' ) ) {
			return;
		}
		$target = $this->get_first_accessible_slug();
		if ( '' !== $target ) {
			wp_safe_redirect( admin_url( 'admin.php?page=' . $target ) );
			exit;
		}
	}

	/**
	 * Replace WordPress's generic "not allowed" message on ImgSentry pages with a clear explanation.
	 */
	public function handle_access_denied() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
		$page = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : '';
		if ( 0 !== strpos( $page, 'imgsentry' ) ) {
			return;
		}
		wp_die(
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built with esc_* below.
			$this->get_access_denied_html(),
			esc_html__( 'ImgSentry - Access restricted', 'imgsentry' ),
			array( 'response' => 403 )
		);
	}

	/**
	 * Friendly "no access" message with links to the pages the user can open.
	 *
	 * @return string Escaped HTML.
	 */
	private function get_access_denied_html() {
		$titles = array(
			'imgsentry'                    => __( 'Dashboard', 'imgsentry' ),
			'imgsentry-scanner'            => __( 'Media Scanner', 'imgsentry' ),
			'imgsentry-unused'             => __( 'Unused Files', 'imgsentry' ),
			'imgsentry-used'               => __( 'Used Files', 'imgsentry' ),
			'imgsentry-duplicate'          => __( 'Duplicate Image', 'imgsentry' ),
			'imgsentry-image_optimization' => __( 'Image Optimization', 'imgsentry' ),
			'imgsentry-trash'              => __( 'Trash Bin', 'imgsentry' ),
			'imgsentry-settings'           => __( 'Settings', 'imgsentry' ),
			'imgsentry-wp_file_manager'    => __( 'Advance File Manager', 'imgsentry' ),
		);

		$slugs = class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::get_accessible_pages() : array();
		if ( $this->file_manager_user_allowed() ) {
			$slugs[] = 'imgsentry-wp_file_manager';
		}

		$html  = '<h1>' . esc_html__( 'You do not have access to this ImgSentry page', 'imgsentry' ) . '</h1>';
		$html .= '<p>' . esc_html__( 'Your account is not allowed to open this page. Ask a site Administrator to give you access in ImgSentry > Settings > Permissions.', 'imgsentry' ) . '</p>';

		if ( ! empty( $slugs ) ) {
			$html .= '<p>' . esc_html__( 'Pages you can open:', 'imgsentry' ) . '</p><ul>';
			foreach ( $slugs as $slug ) {
				if ( isset( $titles[ $slug ] ) ) {
					$html .= '<li><a href="' . esc_url( admin_url( 'admin.php?page=' . $slug ) ) . '">' . esc_html( $titles[ $slug ] ) . '</a></li>';
				}
			}
			$html .= '</ul>';
		} else {
			$html .= '<p>' . esc_html__( 'You currently have no access to any ImgSentry page.', 'imgsentry' ) . '</p>';
		}

		return $html;
	}

	/**
	 * Enqueue CSS and JS assets on the plugin admin page only.
	 *
	 * @param string $hook_suffix Current admin page hook.
	 */
	public function enqueue_assets( $hook_suffix ) {
		// Only enqueue on our plugin pages
		if ( strpos( $hook_suffix, 'imgsentry' ) === false ) {
			return;
		}

		// Load the app only on pages this user may open (never leak plugin data to others).
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
		$current_page  = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : 'imgsentry';
		$fm_user_ok    = $this->file_manager_user_allowed();
		if ( 'imgsentry-wp_file_manager' === $current_page ) {
			if ( ! $fm_user_ok && ! $this->file_manager_promo_visible() ) {
				return;
			}
		} elseif ( class_exists( 'ImgSentry_Permissions' ) && ! ImgSentry_Permissions::can_access_page( $current_page ) ) {
			return;
		}

		$is_admin_user = class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::is_administrator() : current_user_can( 'manage_options' );

		// Pages this user may open (null = Administrator: everything). The React app hides everything else.
		$allowed_pages = null;
		if ( ! $is_admin_user && class_exists( 'ImgSentry_Permissions' ) ) {
			$allowed_pages = array();
			foreach ( ImgSentry_Permissions::get_registered_pages() as $page_slug => $nav_id ) {
				if ( ImgSentry_Permissions::can_access_page( $page_slug ) ) {
					$allowed_pages[] = $nav_id;
				}
			}
			if ( $fm_user_ok ) {
				$allowed_pages[] = 'wp_file_manager';
			}
		}
		$localized_settings = $this->get_localized_settings( $is_admin_user );

		// Retrieve non-admin WordPress users for ACL and user restriction rules
		$localized_users = array();
		if ( current_user_can( 'manage_options' ) && function_exists( 'get_users' ) ) {
			$raw_wp_users = get_users(
				array(
					'role__not_in' => array( 'administrator' ),
					'fields'       => array( 'ID', 'user_login', 'display_name' ),
					'orderby'      => 'display_name',
					'order'        => 'ASC',
				)
			);
			foreach ( $raw_wp_users as $u ) {
				$localized_users[] = array(
					'id'           => (int) $u->ID,
					'username'     => (string) $u->user_login,
					'display_name' => (string) ( ! empty( $u->display_name ) ? $u->display_name : $u->user_login ),
				);
			}
		}

		$build_file_exists = file_exists( IMGSENTRY_PLUGIN_DIR . 'build/assets/plugin.js' );

		// Enqueue local fonts stylesheet
		$fonts_css_url  = IMGSENTRY_PLUGIN_URL . 'assets/css/imgsentry-fonts.css';
		$fonts_css_path = IMGSENTRY_PLUGIN_DIR . 'assets/css/imgsentry-fonts.css';
		$fonts_ver      = file_exists( $fonts_css_path ) ? (string) filemtime( $fonts_css_path ) : IMGSENTRY_VERSION;
		wp_enqueue_style( 'imgsentry-fonts', $fonts_css_url, array(), $fonts_ver );

		// Keep the page height steady while the React app loads. Until it starts, the page is almost empty, so the
		// scrollbar appears late and WordPress re-calculates the side menu (it "shakes"). This reserves the height
		// and the scrollbar from the first paint.
		wp_add_inline_style( 'imgsentry-fonts', 'html{overflow-y:scroll;}#imgsentry-plugin-root:empty{min-height:100vh;}' );

		// Enqueue the compiled Vite CSS
		if ( $build_file_exists ) {
			wp_enqueue_style(
			'imgsentry-react-app-style',
			IMGSENTRY_PLUGIN_URL . 'build/assets/plugin.css',
			array( 'imgsentry-fonts' ),
			IMGSENTRY_VERSION
		);
		}

		// Enqueue the File Manager CSS and JS assets if user has permissions
		if ( class_exists( 'ImgSentry_FM_Security' ) && ImgSentry_FM_Security::can_user_manage() ) {
			$fm_css_url  = IMGSENTRY_PLUGIN_URL . 'assets/css/imgsentry-fm.css';
			$fm_css_path = IMGSENTRY_PLUGIN_DIR . 'assets/css/imgsentry-fm.css';
			$fm_ver      = file_exists( $fm_css_path ) ? (string) filemtime( $fm_css_path ) : IMGSENTRY_VERSION;
			wp_enqueue_style( 'imgsentry-fm-css', $fm_css_url, array( 'imgsentry-fonts' ), $fm_ver );

			$imgsentry_admin_js_url  = IMGSENTRY_PLUGIN_URL . 'assets/js/imgsentry-admin.js';
			$imgsentry_admin_js_path = IMGSENTRY_PLUGIN_DIR . 'assets/js/imgsentry-admin.js';
			$imgsentry_admin_js_ver  = file_exists( $imgsentry_admin_js_path ) ? (string) filemtime( $imgsentry_admin_js_path ) : IMGSENTRY_VERSION;
			wp_enqueue_script( 'imgsentry-admin-js', $imgsentry_admin_js_url, array( 'jquery' ), $imgsentry_admin_js_ver, true );

			$fm_js_url  = IMGSENTRY_PLUGIN_URL . 'assets/js/imgsentry-fm.js';
			$fm_js_path = IMGSENTRY_PLUGIN_DIR . 'assets/js/imgsentry-fm.js';
			$fm_js_ver  = file_exists( $fm_js_path ) ? (string) filemtime( $fm_js_path ) : IMGSENTRY_VERSION;
			wp_enqueue_script( 'imgsentry-fm-js', $fm_js_url, array( 'jquery', 'imgsentry-admin-js' ), $fm_js_ver, true );

			$current_scope = get_option( 'imgsentry_fm_root_scope', 'wp-content' );
			$root_label    = ( 'full' === $current_scope || 'public_html' === $current_scope ) ? 'public_html' : 'wp-content';
			$root_url_prefix = ( 'wp-content' === $current_scope ) ? content_url() : site_url();

			$code_editor_defaults = array(
				'theme'        => 'dark',
				'fullscreen'   => false,
				'font_size'    => 14,
				'tab_size'     => '4',
				'code_folding' => true,
			);
			$code_editor_settings = get_option( 'imgsentry_fm_code_editor_settings', $code_editor_defaults );
			if ( ! is_array( $code_editor_settings ) ) {
				$code_editor_settings = $code_editor_defaults;
			} else {
				$code_editor_settings = wp_parse_args( $code_editor_settings, $code_editor_defaults );
			}

			wp_localize_script(
				'imgsentry-fm-js',
				'imgSentryFmData',
				array(
					'plugin_url'      => IMGSENTRY_PLUGIN_URL,
					'ajax_url'        => admin_url( 'admin-ajax.php' ),
					'site_url'        => site_url(),
					'nonce'           => wp_create_nonce( ImgSentry_FM_Security::NONCE_ACTION ),
					'root_label'      => $root_label,
					'root_scope'      => $current_scope,
					'root_url_prefix' => $root_url_prefix,
					'root_path'       => ImgSentry_FM_Security::get_root(),
					'users'           => $localized_users,
					'max_upload_size'     => wp_max_upload_size(),
					'server_upload_limit' => self::get_server_upload_limit(),
					'upload_max_filesize' => self::convert_shorthand_to_bytes( ini_get( 'upload_max_filesize' ) ),
					'post_max_size'       => self::convert_shorthand_to_bytes( ini_get( 'post_max_size' ) ),
					'archive_formats'     => class_exists( 'ImgSentry_FM_Core' ) ? ImgSentry_FM_Core::get_supported_archive_formats() : array(
						'zip'     => class_exists( 'ZipArchive' ),
						'tar'     => class_exists( 'PharData' ),
						'tar.gz'  => class_exists( 'PharData' ) && extension_loaded( 'zlib' ),
						'tar.bz2' => class_exists( 'PharData' ) && extension_loaded( 'bz2' ),
						'tar.xz'  => false,
					),
					'settings'        => array(
						'codeEditorTheme'      => $code_editor_settings['theme'],
						'codeEditorSettings'   => $code_editor_settings,
						'codeEditorFullscreen' => (bool) $code_editor_settings['fullscreen'],
						'codeEditorFontSize'   => (int) $code_editor_settings['font_size'],
						'codeEditorTabSize'    => (string) $code_editor_settings['tab_size'],
						'codeEditorFolding'    => (bool) $code_editor_settings['code_folding'],
					),
					'i18n'            => array(
						'confirm_delete' => __( 'Are you sure you want to move selected items to the trash bin?', 'imgsentry' ),
						'new_folder'     => __( 'New Folder', 'imgsentry' ),
						'new_file'       => __( 'New File', 'imgsentry' ),
						'upload'         => __( 'Upload File', 'imgsentry' ),
						'rename'         => __( 'Rename', 'imgsentry' ),
						'copy'           => __( 'Copy', 'imgsentry' ),
						'move'           => __( 'Move', 'imgsentry' ),
						'zip'            => __( 'Zip Archive', 'imgsentry' ),
						'unzip'          => __( 'Extract Zip', 'imgsentry' ),
						'settings'       => __( 'Settings', 'imgsentry' ),
					),
				)
			);
		}

		// Enqueue the compiled Vite JS
		if ( $build_file_exists ) {
			wp_enqueue_script(
			'imgsentry-react-app',
			IMGSENTRY_PLUGIN_URL . 'build/assets/plugin.js',
			array( 'jquery' ), // Vite bundles React
			IMGSENTRY_VERSION,
			true
		);
		}

		// Pass server data & localization to JavaScript.
		$stats      = ImgSentry_Scanner::get_total_stats();
		$trash_days = get_option( 'imgsentry_trash_days', 7 );

		// Determine the active tab based on page query parameter
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
		$active_tab = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : 'imgsentry';
		$tab_name = 'dashboard';
		if ( 'imgsentry' !== $active_tab ) {
			$tab_name = str_replace( 'imgsentry-', '', $active_tab );
		}

		// Collect custom plugin notices to surface inside React dashboard rather than WP notice wrappers
		$plugin_notices = array();
		if ( defined( 'EWWW_IMAGE_OPTIMIZER_VERSION' ) ) {
			$plugin_notices[] = array(
				'id'          => 'ewww_conflict',
				'type'        => 'warning',
				'title'       => __( 'Optimization Plugin Detected', 'imgsentry' ),
				'message'     => __( 'EWWW Image Optimizer is active. Ensure auto-conversion settings do not create unindexed WebP/AVIF variants.', 'imgsentry' ),
				'dismissible' => true,
			);
		}
		if ( defined( 'SHORTPIXEL_IMAGE_OPTIMIZER_VERSION' ) ) {
			$plugin_notices[] = array(
				'id'          => 'shortpixel_conflict',
				'type'        => 'warning',
				'title'       => __( 'Third-Party Optimizer Detected', 'imgsentry' ),
				'message'     => __( 'ShortPixel is active. Backup originals before running bulk cleanup.', 'imgsentry' ),
				'dismissible' => true,
			);
		}

		// Free / Pro flags and optimization quota (fixed contract with the React app).
		$license_data = ImgSentry_License::get_client_data();
		$quota_status = ImgSentry_Quota::get_status();

		if ( ImgSentry_Permissions::can( 'optimization' ) ) {
			if ( ! empty( $quota_status['domain_blocked'] ) ) {
				$plugin_notices[] = array(
					'id'          => 'optimization_domain_blocked',
					'type'        => 'warning',
					'title'       => __( 'Optimization is off on this site', 'imgsentry' ),
					'message'     => __( 'Image optimization does not run on local, test and staging sites. It works on your live domain.', 'imgsentry' ),
					'dismissible' => true,
				);
			} elseif ( ! empty( $quota_status['exhausted'] ) ) {
				$plugin_notices[] = array(
					'id'          => 'optimization_quota_exhausted',
					'type'        => 'error',
					'title'       => __( 'Monthly optimization quota used up', 'imgsentry' ),
					'message'     => sprintf(
						/* translators: %s: renewal date */
						__( 'You have used your Free optimization quota. It renews on %s (UTC). Upgrade to Pro for unlimited optimization.', 'imgsentry' ),
						gmdate( 'M j, Y H:i', (int) $quota_status['cycle_end'] )
					),
					'dismissible' => true,
				);
			} elseif ( ! $quota_status['unlimited'] && (int) $quota_status['percent'] >= 80 ) {
				$plugin_notices[] = array(
					'id'          => 'optimization_quota_low',
					'type'        => 'warning',
					'title'       => __( 'Optimization quota almost used', 'imgsentry' ),
					'message'     => sprintf(
						/* translators: %d: percent of quota used */
						__( 'You have used %d%% of your monthly Free optimization quota.', 'imgsentry' ),
						(int) $quota_status['percent']
					),
					'dismissible' => true,
				);
			}
		}

		wp_localize_script(
			'imgsentry-react-app',
			'imgsentry_data',
			array(
				'is_pro'      => $license_data['is_pro'],
				'plan'        => $license_data['plan'],
				'features'    => $license_data['features'],
				'upgrade_url' => $license_data['upgrade_url'],
				'quota'       => $quota_status,
				'current_user' => self::get_current_user_chip( $quota_status ),
				'ajax_url'   => admin_url( 'admin-ajax.php' ),
				'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
				'nonce'      => wp_create_nonce( 'imgsentry_admin_nonce' ),
				'restNonce'  => wp_create_nonce( 'wp_rest' ),
				'stats'        => $stats,
				'settings'     => $localized_settings,
				'actual_memory_limit' => ImgSentry_Settings::get_actual_memory_limit(),
				'can_manage_files'    => ( class_exists( 'ImgSentry_FM_Security' ) ? ImgSentry_FM_Security::can_user_manage() : current_user_can( 'manage_options' ) ),
				'is_admin_user'       => $is_admin_user,
				'file_manager_promo'  => $this->file_manager_promo_visible(),
				'rewrite_supported'   => ImgSentry_Htaccess::is_server_supported(),
				'rewrite_active'      => ImgSentry_Htaccess::is_active(),
				'allowed_pages'       => $allowed_pages,
				'trash_days'   => $trash_days,
				'users'        => $localized_users,
				'scan_history' => get_option( 'imgsentry_scan_history', array() ),
				'active_tab'   => $tab_name,
				'notices'      => $plugin_notices,
				'last_stale_backup_cleanup' => get_option( 'imgsentry_last_stale_backup_cleanup', 0 ),
				'last_stale_backup_cleanup_cleared' => get_option( 'imgsentry_last_stale_backup_cleanup_cleared', 0 ),
				'next_scheduled_cleanup'    => wp_next_scheduled( 'imgsentry_daily_trash_purge' ),
								'system_status' => array(
					'php_version'      => PHP_VERSION,
					'wp_version'       => get_bloginfo( 'version' ),
					'memory_limit'     => ini_get( 'memory_limit' ),
					'uploads_writable' => (bool) wp_is_writable( wp_upload_dir()['basedir'] ),
					'cron_disabled'    => ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ),
					'min_php'          => '7.4',
					'min_wp'           => '5.8',
				),
				'i18n'       => array(
					'confirm_delete'      => __( 'Are you sure you want to delete this file permanently? This action cannot be undone.', 'imgsentry' ),
					'confirm_trash'       => __( 'Are you sure you want to move this file to trash?', 'imgsentry' ),
					'confirm_empty_trash' => __( 'Are you sure you want to empty the trash? All trashed items will be deleted permanently.', 'imgsentry' ),
					'select_items'        => __( 'Please select at least one media item.', 'imgsentry' ),
					'type_delete_error'   => __( 'Please type "DELETE" into the box to confirm.', 'imgsentry' ),
					'processing'          => __( 'Processing...', 'imgsentry' ),
				),
			)
		);

		wp_localize_script(
			'imgsentry-react-app',
			'imgsentryData',
			array(
				'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
				'ajax_url'  => admin_url( 'admin-ajax.php' ),
				'nonce'     => wp_create_nonce( 'imgsentry_admin_nonce' ),
				'restNonce' => wp_create_nonce( 'wp_rest' ),
				'settings'  => $localized_settings,
				'notices'   => $plugin_notices,
				'last_stale_backup_cleanup' => get_option( 'imgsentry_last_stale_backup_cleanup', 0 ),
				'last_stale_backup_cleanup_cleared' => get_option( 'imgsentry_last_stale_backup_cleanup_cleared', 0 ),
				'next_scheduled_cleanup'    => wp_next_scheduled( 'imgsentry_daily_trash_purge' ),
			)
		);
	}

	/**
	 * Settings passed to the browser. Administrators get everything; other users get a copy with
	 * sensitive values blanked (type-preserving so the app never receives undefined).
	 *
	 * @param bool $is_admin_user Whether the current user is an Administrator.
	 * @return array
	 */
	private function get_localized_settings( $is_admin_user ) {
		$settings = ImgSentry_Settings::instance()->get_settings();
		// The webhook secret never goes to the browser; the read-only plugin list travels with the settings.
		if ( is_array( $settings ) && class_exists( 'ImgSentry_Integrations' ) ) {
			$settings = ImgSentry_Integrations::prepare_settings_for_browser( $settings );
		}
		if ( $is_admin_user || ! is_array( $settings ) ) {
			return $settings;
		}

		$blocked = array(
			'backupDirectory',
			'cdnUrl',
			'deleteDataOnUninstall',
			'restrictToAdmins',
			'nonceVerification',
			'fileManagerGlobalHiddenPaths',
			'fileManagerGlobalLockedExtensions',
			'fileManagerAllowedRoles',
		);

		foreach ( $settings as $key => $value ) {
			$name = (string) $key;
			if ( in_array( $name, $blocked, true ) || preg_match( '/(email|webhook|token|secret|password|license|api_?key)/i', $name ) ) {
				if ( is_array( $value ) ) {
					$settings[ $key ] = array();
				} elseif ( is_bool( $value ) ) {
					$settings[ $key ] = false;
				} elseif ( is_numeric( $value ) ) {
					$settings[ $key ] = 0;
				} else {
					$settings[ $key ] = '';
				}
			}
		}

		return $settings;
	}

	/**
	 * Render the Admin Page HTML.
	 */
	public function render_admin_page() {
		if ( ! file_exists( IMGSENTRY_PLUGIN_DIR . 'build/assets/plugin.js' ) ) {
			echo '<div class="wrap"><div class="notice notice-error"><p>' . esc_html__( 'ImgSentry cannot load its admin screen because the compiled files in the build folder are missing. Please re-install the plugin from the official package.', 'imgsentry' ) . '</p></div></div>';
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
		$active_tab = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : 'imgsentry';

		$page_denied = false;
		if ( 'imgsentry-wp_file_manager' === $active_tab ) {
			if ( ! ( $this->file_manager_user_allowed() ) && ! $this->file_manager_promo_visible() ) {
				$page_denied = true;
			}
		} elseif ( ! ( class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::can_access_page( $active_tab ) : current_user_can( 'manage_options' ) ) ) {
			$page_denied = true;
		}

		if ( $page_denied ) {
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built with esc_* in get_access_denied_html().
			echo '<div class="wrap imgsentry-wrap">' . $this->get_access_denied_html() . '</div>';
			return;
		}

		if ( 'imgsentry-used' === $active_tab ) {
			if ( class_exists( 'ImgSentry_Page_Used_Files' ) ) {
				( new ImgSentry_Page_Used_Files() )->render();
				return;
			}
		}
		?>
		<div class="wrap imgsentry-wrap">
			<div id="imgsentry-plugin-root"></div>
		</div>
		<?php
	}

	/**
	 * Render recent Audit Log entries table.
	 */
	public function render_audit_log_table() {
		$log = get_option( 'imgsentry_audit_log', array() );

		if ( empty( $log ) || ! is_array( $log ) ) {
			echo '<p class="description">' . esc_html__( 'No activity logged yet.', 'imgsentry' ) . '</p>';
			return;
		}

		echo '<table class="widefat striped">';
		echo '<thead><tr>';
		echo '<th>' . esc_html__( 'Time', 'imgsentry' ) . '</th>';
		echo '<th>' . esc_html__( 'User', 'imgsentry' ) . '</th>';
		echo '<th>' . esc_html__( 'Action', 'imgsentry' ) . '</th>';
		echo '<th>' . esc_html__( 'Details', 'imgsentry' ) . '</th>';
		echo '</tr></thead><tbody>';

		foreach ( array_slice( $log, 0, 15 ) as $entry ) {
			echo '<tr>';
			echo '<td><code>' . esc_html( $entry['timestamp'] ) . '</code></td>';
			echo '<td>' . esc_html( $entry['user'] ) . '</td>';
			echo '<td><strong>' . esc_html( $entry['action'] ) . '</strong></td>';
			echo '<td>' . esc_html( wp_json_encode( $entry['details'] ) ) . '</td>';
			echo '</tr>';
		}

		echo '</tbody></table>';
	}

	/**
	 * Logged-in user details for the header chip (name, role, avatar, Freemius account link).
	 *
	 * @param array $quota_status Result of ImgSentry_Quota::get_status().
	 * @return array
	 */
	private static function get_current_user_chip( $quota_status ): array {
		$user  = wp_get_current_user();
		$role  = '';
		$roles = ( $user && is_array( $user->roles ) ) ? array_values( $user->roles ) : array();

		if ( is_multisite() && is_super_admin( $user->ID ) ) {
			$role = __( 'Super Admin', 'imgsentry' );
		} elseif ( ! empty( $roles ) ) {
			$wp_roles = wp_roles();
			$slug     = (string) $roles[0];
			$name     = isset( $wp_roles->role_names[ $slug ] ) ? $wp_roles->role_names[ $slug ] : $slug;
			$role     = translate_user_role( $name );
		}

		$avatar = get_avatar_url( $user->ID, array( 'size' => 64 ) );

		// The Freemius Account page needs manage_options, so only offer the link to those users.
		$account_url   = '';
		$account_state = 'connected';
		if ( is_array( $quota_status ) && ! empty( $quota_status['account_state'] ) ) {
			$account_state = (string) $quota_status['account_state'];
			$account_url   = (string) ( $quota_status['account_url'] ?? '' );
		} else {
			$account       = ImgSentry_License::get_account_state();
			$account_state = (string) $account['state'];
			$account_url   = (string) $account['url'];
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			$account_url = '';
		}

		return array(
			'name'              => '' !== (string) $user->display_name ? (string) $user->display_name : (string) $user->user_login,
			'role'              => (string) $role,
			'avatar'            => is_string( $avatar ) ? $avatar : '',
			'account_url'       => $account_url,
			'account_state'     => $account_state,
		);
	}

	/**
	 * Convert PHP ini shorthand byte values (e.g. '2M', '64K', '1G') to raw integer bytes.
	 *
	 * @param string|int $val Shorthand string or numeric value.
	 * @return int Bytes.
	 */
	public static function convert_shorthand_to_bytes( $val ): int {
		$val = trim( (string) $val );
		if ( empty( $val ) ) {
			return 0;
		}

		$last = strtolower( substr( $val, -1 ) );
		$num  = (float) $val;

		switch ( $last ) {
			case 'g':
				$num *= 1024 * 1024 * 1024;
				break;
			case 'm':
				$num *= 1024 * 1024;
				break;
			case 'k':
				$num *= 1024;
				break;
		}

		return (int) $num;
	}

	/**
	 * Get server upload limit in bytes by reading upload_max_filesize and post_max_size.
	 * Takes the minimum of both values.
	 *
	 * @return int Limit in bytes.
	 */
	public static function get_server_upload_limit(): int {
		$upload_max = self::convert_shorthand_to_bytes( ini_get( 'upload_max_filesize' ) );
		$post_max   = self::convert_shorthand_to_bytes( ini_get( 'post_max_size' ) );

		if ( function_exists( 'wp_convert_hr_to_bytes' ) ) {
			if ( $upload_max <= 0 ) {
				$upload_max = (int) wp_convert_hr_to_bytes( ini_get( 'upload_max_filesize' ) );
			}
			if ( $post_max <= 0 ) {
				$post_max = (int) wp_convert_hr_to_bytes( ini_get( 'post_max_size' ) );
			}
		}

		if ( $upload_max > 0 && $post_max > 0 ) {
			return min( $upload_max, $post_max );
		}
		if ( $upload_max > 0 ) {
			return $upload_max;
		}
		if ( $post_max > 0 ) {
			return $post_max;
		}

		return function_exists( 'wp_max_upload_size' ) ? (int) wp_max_upload_size() : 2097152;
	}
}
