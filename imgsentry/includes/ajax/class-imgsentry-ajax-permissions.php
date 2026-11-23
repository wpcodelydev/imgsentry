<?php
/**
 * AJAX Permissions Controller Class for ImgSentry.
 *
 * Provides endpoints for retrieving, saving, and searching user permissions
 * for plugin capabilities.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Ajax_Permissions extends ImgSentry_Ajax_Base {

	/**
	 * Constructor. Register Permissions AJAX actions.
	 */
	public function __construct() {
		add_action( 'wp_ajax_imgsentry_get_permissions', array( $this, 'get_permissions' ) );
		add_action( 'wp_ajax_imgsentry_save_permissions', array( $this, 'save_permissions' ) );
		add_action( 'wp_ajax_imgsentry_search_permission_users', array( $this, 'search_users' ) );
		add_action( 'wp_ajax_imgsentry_list_permission_users', array( $this, 'list_users' ) );
	}

	/**
	 * Shape one user for the Permissions screen (name, login and role).
	 *
	 * @param WP_User $user User object.
	 * @return array
	 */
	private function format_user( $user ): array {
		$role_slug = '';
		$role_name = '';
		$roles     = ( isset( $user->roles ) && is_array( $user->roles ) ) ? array_values( $user->roles ) : array();

		if ( ! empty( $roles ) ) {
			$role_slug  = (string) $roles[0];
			$role_names = function_exists( 'wp_roles' ) ? wp_roles()->get_names() : array();
			$role_name  = isset( $role_names[ $role_slug ] ) ? translate_user_role( $role_names[ $role_slug ] ) : $role_slug;
		}

		return array(
			'id'           => (int) $user->ID,
			'display_name' => (string) $user->display_name,
			'user_login'   => (string) $user->user_login,
			'role'         => (string) $role_name,
			'role_slug'    => $role_slug,
		);
	}

	/**
	 * Fetch capabilities, roles, current rules, and configured users.
	 */
	public function get_permissions() {
		$this->verify_admin_request( 'imgsentry_admin_nonce' );

		$caps_map     = class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::get_capabilities() : array();
		$capabilities = array();
		foreach ( $caps_map as $key => $label ) {
			$capabilities[] = array(
				'key'   => $key,
				'label' => $label,
			);
		}

		$admin_only = class_exists( 'ImgSentry_Permissions' ) ? ImgSentry_Permissions::get_admin_only_capabilities() : array( 'settings', 'logs', 'reports' );

		$roles      = array();
		$role_names = function_exists( 'wp_roles' ) ? wp_roles()->get_names() : array();
		foreach ( $role_names as $slug => $label ) {
			if ( 'administrator' === $slug ) {
				continue;
			}
			$roles[] = array(
				'slug'  => $slug,
				'label' => $label,
			);
		}

		$rules = class_exists( 'ImgSentry_Permissions' )
			? ImgSentry_Permissions::get_rules()
			: array( 'version' => 1, 'roles' => array(), 'users' => array() );

		$users = array();
		if ( ! empty( $rules['users'] ) && is_array( $rules['users'] ) ) {
			foreach ( array_keys( $rules['users'] ) as $user_id ) {
				$id = (int) $user_id;
				if ( $id <= 0 ) {
					continue;
				}
				$userdata = get_userdata( $id );
				if ( ! $userdata ) {
					continue;
				}
				$users[] = $this->format_user( $userdata );
			}
		}

		wp_send_json_success(
			array(
				'capabilities' => $capabilities,
				'admin_only'   => $admin_only,
				'roles'        => $roles,
				'rules'        => $rules,
				'users'        => $users,
			)
		);
	}

	/**
	 * Save updated capability rules for roles and users.
	 */
	public function save_permissions() {
		$this->verify_admin_request( 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$raw_rules = isset( $_POST['rules'] ) ? wp_unslash( $_POST['rules'] ) : '';
		$decoded   = is_string( $raw_rules ) ? json_decode( $raw_rules, true ) : null;

		if ( ! is_array( $decoded ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid permissions data.', 'imgsentry' ) ), 400 );
			exit;
		}

		$clean = class_exists( 'ImgSentry_Permissions' )
			? ImgSentry_Permissions::save_rules( $decoded )
			: array( 'version' => 1, 'roles' => array(), 'users' => array() );

		$roles_count = ( isset( $clean['roles'] ) && is_array( $clean['roles'] ) ) ? count( $clean['roles'] ) : 0;
		$users_count = ( isset( $clean['users'] ) && is_array( $clean['users'] ) ) ? count( $clean['users'] ) : 0;

		$this->log_action(
			'Updated page permissions',
			array(
				'roles' => $roles_count,
				'users' => $users_count,
			),
			'info',
			'Settings',
			'Permissions'
		);

		wp_send_json_success(
			array(
				'rules'   => $clean,
				'message' => __( 'Permissions saved.', 'imgsentry' ),
			)
		);
	}

	/**
	 * Search for non-administrator users to assign custom capability rules.
	 */
	public function search_users() {
		$this->verify_admin_request( 'imgsentry_admin_nonce' );

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is checked at the start of this handler.
		$term = isset( $_POST['term'] ) ? sanitize_text_field( wp_unslash( $_POST['term'] ) ) : '';

		if ( strlen( $term ) < 2 ) {
			wp_send_json_success( array() );
			exit;
		}

		$users = get_users(
			array(
				'search'         => '*' . $term . '*',
				'search_columns' => array( 'user_login', 'user_nicename', 'display_name' ),
				'number'         => 20,
				'fields'         => 'all',
				'role__not_in'   => array( 'administrator' ),
			)
		);

		$results = array();
		if ( is_array( $users ) ) {
			foreach ( $users as $user ) {
				$user_id = isset( $user->ID ) ? (int) $user->ID : ( isset( $user->id ) ? (int) $user->id : 0 );
				if ( $user_id <= 0 ) {
					continue;
				}

				if ( class_exists( 'ImgSentry_Permissions' ) && ImgSentry_Permissions::is_administrator( $user_id ) ) {
					continue;
				}

				$results[] = $this->format_user( $user );
			}
		}

		wp_send_json_success( $results );
	}

	/**
	 * List non-administrator users for the "Add user override" dropdown.
	 *
	 * Returns at most 200 users. If the site has more, "truncated" is true and
	 * the screen falls back to search.
	 */
	public function list_users() {
		$this->verify_admin_request( 'imgsentry_admin_nonce' );

		$limit = 200;
		$users = get_users(
			array(
				'number'       => $limit + 1,
				'orderby'      => 'display_name',
				'order'        => 'ASC',
				'fields'       => 'all',
				'role__not_in' => array( 'administrator' ),
			)
		);

		$truncated = is_array( $users ) && count( $users ) > $limit;
		$results   = array();

		if ( is_array( $users ) ) {
			foreach ( array_slice( $users, 0, $limit ) as $user ) {
				$user_id = isset( $user->ID ) ? (int) $user->ID : 0;
				if ( $user_id <= 0 ) {
					continue;
				}

				if ( class_exists( 'ImgSentry_Permissions' ) && ImgSentry_Permissions::is_administrator( $user_id ) ) {
					continue;
				}

				$results[] = $this->format_user( $user );
			}
		}

		wp_send_json_success(
			array(
				'users'     => $results,
				'truncated' => $truncated,
			)
		);
	}
}
