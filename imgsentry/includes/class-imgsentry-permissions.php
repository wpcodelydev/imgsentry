<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class ImgSentry_Permissions
 *
 * Handles capability checks for the ImgSentry plugin.
 */
class ImgSentry_Permissions {

	const OPTION_KEY = 'imgsentry_permissions';

	private static $rules_cache = null;

	/**
	 * Get rules.
	 *
	 * @return array
	 */
	public static function get_rules(): array {
		if ( null !== self::$rules_cache ) {
			return self::$rules_cache;
		}
		$raw = get_option( self::OPTION_KEY, array() );
		self::$rules_cache = self::sanitize_rules( $raw );
		return self::$rules_cache;
	}

	/**
	 * Sanitize rules.
	 *
	 * @param mixed $input
	 * @return array
	 */
	public static function sanitize_rules( $input ): array {
		$sanitized = array( 'version' => 1, 'roles' => array(), 'users' => array() );
		if ( ! is_array( $input ) ) {
			return $sanitized;
		}

		$valid_caps = array_keys( self::get_capabilities() );

		// Sanitize roles.
		if ( isset( $input['roles'] ) && is_array( $input['roles'] ) ) {
			$wp_roles = wp_roles()->get_names();
			foreach ( $input['roles'] as $role_slug => $caps ) {
				$role_key = sanitize_key( $role_slug );
				if ( ! isset( $wp_roles[ $role_key ] ) || 'administrator' === $role_key ) {
					continue;
				}
				if ( ! is_array( $caps ) ) {
					continue;
				}
				$valid = array_intersect( $caps, $valid_caps );
				$valid = array_unique( $valid );
				if ( ! empty( $valid ) ) {
					$sanitized['roles'][ $role_key ] = array_values( $valid );
				}
			}
		}

		// Sanitize users.
		if ( isset( $input['users'] ) && is_array( $input['users'] ) ) {
			foreach ( $input['users'] as $user_id => $caps ) {
				$id = (int) $user_id;
				if ( $id <= 0 || ! get_userdata( $id ) || self::is_administrator( $id ) ) {
					continue;
				}
				if ( ! is_array( $caps ) ) {
					continue;
				}
				$user_caps = array();
				foreach ( $caps as $cap => $val ) {
					if ( in_array( $cap, $valid_caps, true ) ) {
						$user_caps[ $cap ] = (bool) $val;
					}
				}
				if ( ! empty( $user_caps ) ) {
					$sanitized['users'][ $id ] = $user_caps;
				}
			}
		}

		return $sanitized;
	}

	/**
	 * Save rules.
	 *
	 * @param array $input
	 * @return array
	 */
	public static function save_rules( $input ): array {
		$clean = self::sanitize_rules( $input );
		update_option( self::OPTION_KEY, $clean, false );
		self::$rules_cache = null;
		return $clean;
	}

	/**
	 * Remove user rule.
	 *
	 * @param int $user_id
	 * @return void
	 */
	public static function remove_user_rule( $user_id ): void {
		$user_id = (int) $user_id;
		$rules = self::get_rules();
		if ( isset( $rules['users'][ $user_id ] ) ) {
			unset( $rules['users'][ $user_id ] );
			update_option( self::OPTION_KEY, $rules, false );
			self::$rules_cache = null;
		}
	}

	/**
	 * Initialize permissions.
	 *
	 * @return void
	 */
	public static function init(): void {
		add_action( 'deleted_user', array( __CLASS__, 'remove_user_rule' ) );
	}

	/**
	 * Get storable capabilities.
	 *
	 * @return array
	 */
	public static function get_capabilities() {
		return array(
			'dashboard'              => 'Dashboard',
			'scanner'                => 'Media Scanner',
			'used_files'             => 'Used Files',
			'unused_files'           => 'Unused Files',
			'unused_trash'           => 'Move to Trash from Unused Files',
			'trash_view'             => 'View Trash',
			'trash_restore'          => 'Restore from Trash',
			'trash_delete_permanent' => 'Permanently Delete from Trash',
			'duplicate'              => 'Duplicate Images',
			'optimization'           => 'Image Optimization',
		);
	}

	/**
	 * Get admin-only capability keys.
	 *
	 * @return array
	 */
	public static function get_admin_only_capabilities() {
		return array( 'settings', 'logs', 'reports' );
	}

	/**
	 * Check if a user is an administrator.
	 *
	 * @param int|null $user_id
	 * @return bool
	 */
	public static function is_administrator( $user_id = null ) {
		if ( null === $user_id ) {
			$user_id = get_current_user_id();
		}

		if ( 0 === (int) $user_id ) {
			return false;
		}

		if ( (int) $user_id === get_current_user_id() ) {
			return class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::can_user_access_imgsentry() : current_user_can( 'manage_options' );
		}

		return user_can( $user_id, 'manage_options' );
	}

	/**
	 * Check if a user has a specific capability.
	 *
	 * @param string $cap
	 * @param int|null $user_id
	 * @return bool
	 */
	public static function can( $cap, $user_id = null ) {
		if ( null === $user_id ) {
			$user_id = get_current_user_id();
		}

		if ( 0 === (int) $user_id ) {
			return false;
		}

		// Administrators are never locked out.
		if ( self::is_administrator( $user_id ) ) {
			return true;
		}

		// Admin-only capabilities are denied for non-admins.
		if ( in_array( $cap, self::get_admin_only_capabilities(), true ) ) {
			return false;
		}

		// Unknown capabilities are denied.
		if ( ! array_key_exists( $cap, self::get_capabilities() ) ) {
			return false;
		}

		// Rules are assumed empty until implemented in next task.
		$rules = array( 'roles' => array(), 'users' => array() );
		if ( method_exists( __CLASS__, 'get_rules' ) ) {
			$rules = self::get_rules();
		}

		// User-level rule.
		if ( isset( $rules['users'][$user_id] ) && array_key_exists( $cap, $rules['users'][$user_id] ) ) {
			return (bool) $rules['users'][$user_id][$cap];
		}

		// Role-level rule.
		$userdata = get_userdata( $user_id );
		if ( $userdata && isset( $userdata->roles ) && is_array( $userdata->roles ) ) {
			foreach ( $userdata->roles as $role ) {
				if ( isset( $rules['roles'][$role] ) && is_array( $rules['roles'][$role] ) && in_array( $cap, $rules['roles'][$role], true ) ) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Map admin page slug to a capability key.
	 *
	 * @param string $page_slug
	 * @return string
	 */
	public static function get_page_capability( $page_slug ) {
		$map = array(
			'imgsentry'                     => 'dashboard',
			'imgsentry-scanner'             => 'scanner',
			'imgsentry-used'                => 'used_files',
			'imgsentry-unused'              => 'unused_files',
			'imgsentry-trash'               => 'trash_view',
			'imgsentry-duplicate'           => 'duplicate',
			'imgsentry-image_optimization'  => 'optimization',
			'imgsentry-settings'            => 'settings',
		);

		return isset( $map[ $page_slug ] ) ? $map[ $page_slug ] : '';
	}

	/**
	 * Registered ImgSentry admin pages in menu order: page slug => navigation id used by the React app.
	 * The File Manager page is controlled separately by its own access rules.
	 *
	 * @return array
	 */
	public static function get_registered_pages() {
		return array(
			'imgsentry'                    => 'dashboard',
			'imgsentry-scanner'            => 'scanner',
			'imgsentry-unused'             => 'unused',
			'imgsentry-used'               => 'used',
			'imgsentry-duplicate'          => 'duplicate',
			'imgsentry-image_optimization' => 'image_optimization',
			'imgsentry-trash'              => 'trash',
			'imgsentry-settings'           => 'settings',
		);
	}

	/**
	 * Whether a user may open an ImgSentry admin page (File Manager excluded).
	 *
	 * @param string   $page_slug Admin page slug, e.g. 'imgsentry-trash'.
	 * @param int|null $user_id   User ID (current user by default).
	 * @return bool
	 */
	public static function can_access_page( $page_slug, $user_id = null ) {
		$page_slug = (string) $page_slug;
		if ( '' === $page_slug ) {
			$page_slug = 'imgsentry';
		}
		if ( ! array_key_exists( $page_slug, self::get_registered_pages() ) ) {
			return self::is_administrator( $user_id );
		}
		$cap = self::get_page_capability( $page_slug );
		if ( '' === $cap ) {
			return self::is_administrator( $user_id );
		}
		return self::can( $cap, $user_id );
	}

	/**
	 * Page slugs (in menu order) the user may open, File Manager excluded.
	 *
	 * @param int|null $user_id User ID (current user by default).
	 * @return array
	 */
	public static function get_accessible_pages( $user_id = null ) {
		$pages = array();
		foreach ( array_keys( self::get_registered_pages() ) as $slug ) {
			if ( self::can_access_page( $slug, $user_id ) ) {
				$pages[] = $slug;
			}
		}
		return $pages;
	}
}
