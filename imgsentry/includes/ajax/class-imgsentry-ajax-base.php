<?php
/**
 * Abstract Base AJAX Controller Class for ImgSentry.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

abstract class ImgSentry_Ajax_Base {

	/**
	 * Verify Ajax Nonce and User Capabilities.
	 *
	 * Security hotfix (step 0): the default gate is now plugin-level administrator access
	 * (same check as verify_admin_request()). Previously this accepted any user with the
	 * 'delete_posts' capability (Contributor and above). The upcoming per-page permission
	 * layer will replace this single gate.
	 */
	protected function verify_request( $action = 'imgsentry_admin_nonce' ) {
		$this->verify_admin_request( $action );
	}

	/**
	 * Verify Ajax Nonce and the plugin-level ADMIN capability.
	 *
	 * Use this for endpoints that change plugin configuration or control background jobs
	 * (settings, cron / scheduled actions, data cleanup). It enforces the centralized
	 * ImgSentry_Settings::can_user_access_imgsentry() check, i.e. manage_options and — when the
	 * "restrictToAdmins" setting is on — the administrator role.
	 */
	protected function verify_admin_request( $action = 'imgsentry_admin_nonce' ) {
		check_ajax_referer( $action, 'nonce' );

		$allowed = class_exists( 'ImgSentry_Settings' ) && method_exists( 'ImgSentry_Settings', 'can_user_access_imgsentry' )
			? ImgSentry_Settings::can_user_access_imgsentry()
			: current_user_can( 'manage_options' );

		if ( ! $allowed ) {
			wp_send_json_error(
				array( 'message' => __( 'Only administrators can perform this action.', 'imgsentry' ) ),
				403
			);
			exit;
		}
	}

	/**
	 * Verify if the current user has permission for the specified capabilities.
	 *
	 * @param string|array $caps Capability or array of capabilities.
	 * @return bool
	 */
	protected function has_permission( $caps ): bool {
		if ( ! is_array( $caps ) ) {
			$caps = array( $caps );
		}
		if ( empty( $caps ) ) {
			return false;
		}

		if ( class_exists( 'ImgSentry_Permissions' ) ) {
			foreach ( $caps as $cap ) {
				if ( ImgSentry_Permissions::can( $cap ) ) {
					return true;
				}
			}
		} else {
			// Fallback check: same as verify_admin_request()
			$allowed = class_exists( 'ImgSentry_Settings' ) && method_exists( 'ImgSentry_Settings', 'can_user_access_imgsentry' )
				? ImgSentry_Settings::can_user_access_imgsentry()
				: current_user_can( 'manage_options' );
			if ( $allowed ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Require permission or send 403 error.
	 *
	 * @param string|array $caps Capability or array of capabilities.
	 * @return void
	 */
	protected function require_permission( $caps ): void {
		if ( ! $this->has_permission( $caps ) ) {
			wp_send_json_error( array( 'message' => __( 'You do not have permission to perform this action.', 'imgsentry' ) ), 403 );
			exit;
		}
	}

	/**
	 * Verify Ajax Nonce and permission.
	 *
	 * @param string|array $caps Capability or array of capabilities.
	 * @param string $action Nonce action.
	 * @return void
	 */
	protected function verify_permission( $caps, $action = 'imgsentry_admin_nonce' ): void {
		check_ajax_referer( $action, 'nonce' );
		$this->require_permission( $caps );
	}

	/**
	 * Log administrative actions for auditing.
	 *
	 * @param string $action Action description.
	 * @param array|string $details Additional detail key-value pairs or message.
	 * @param string $level Log level ('info', 'success', 'warning', 'error', 'critical').
	 * @param string $type Log type ('Scan', 'Delete', 'System', 'File', 'Optimize', 'Settings', etc.).
	 * @param string $source Log source ('ImgSentry', 'Media Scanner', 'Optimizer Engine', etc.).
	 * @param int $object_id Associated attachment ID or object ID.
	 */
	protected function log_action( $action, $details = array(), $level = 'info', $type = 'System', $source = 'ImgSentry', $object_id = 0 ) {
		if ( class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::log(
				$level,
				$action,
				array(
					'type'      => $type,
					'source'    => $source,
					'details'   => $details,
					'object_id' => $object_id,
				)
			);
		}
	}
}
