<?php
/**
 * ImgSentry - Usage Indexer & Incremental Scanner Engine.
 *
 * Provides custom table management, WP hooks for incremental invalidation,
 * post-centric attachment indexing, background batch scanning, and dashboard queries.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Usage_Indexer {

	/**
	 * Table name without prefix.
	 */
	const TABLE_NAME = 'imgsentry_attachment_usage';

	/**
	 * Single instance.
	 *
	 * @var ImgSentry_Usage_Indexer|null
	 */
	private static $instance = null;

	/**
	 * Get singleton instance.
	 *
	 * @return ImgSentry_Usage_Indexer
	 */
	public static function get_instance() {
		if ( is_null( self::$instance ) ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Check if attachment usage tracking is enabled.
	 * Note: enablePlugin is the broader master switch gating the entire cleanup/cron execution,
	 * while enableUsageTracking specifically gates the incremental post-save/meta-change indexing hooks.
	 *
	 * @return bool
	 */
	public static function is_usage_tracking_enabled() {
		$settings = get_option( 'imgsentry_settings', array() );
		if ( class_exists( 'ImgSentry_Settings' ) ) {
			$defaults = ImgSentry_Settings::instance()->get_defaults();
			$settings = wp_parse_args( $settings, $defaults );
		}
		// enablePlugin is the master switch; if the plugin is fully disabled, tracking is also disabled.
		if ( empty( $settings['enablePlugin'] ) ) {
			return false;
		}
		return ! empty( $settings['enableUsageTracking'] );
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->init_hooks();
	}

	/**
	 * Register all incremental invalidation hooks and background cron actions.
	 */
	private function init_hooks() {
		// Content & Post Invalidation Hooks (single save_post hook to avoid double execution)
		add_action( 'save_post', array( $this, 'on_save_post' ), 10, 3 );
		add_action( 'delete_attachment', array( $this, 'on_delete_attachment' ) );

		// Meta Invalidation Hooks
		add_action( 'added_post_meta', array( $this, 'on_post_meta_change' ), 10, 4 );
		add_action( 'updated_post_meta', array( $this, 'on_post_meta_change' ), 10, 4 );
		add_action( 'deleted_post_meta', array( $this, 'on_post_meta_change' ), 10, 4 );

		// Elementor Saved Hook
		add_action( 'elementor/document/after_save', array( $this, 'on_elementor_after_save' ), 10, 2 );

		// WooCommerce Product Save Hook
		add_action( 'woocommerce_update_product', array( $this, 'on_woocommerce_update_product' ), 10, 1 );
		add_action( 'woocommerce_process_product_meta', array( $this, 'on_woocommerce_update_product' ), 10, 1 );

		// Theme Customizer Saved Hook
		add_action( 'customize_save_after', array( $this, 'on_customize_save_after' ) );

		// Widget Update Hook
		add_filter( 'widget_update_callback', array( $this, 'on_widget_update' ), 10, 4 );
		add_action( 'update_option_sidebars_widgets', array( $this, 'on_sidebars_widgets_update' ) );

		// Background Batch Processing Cron Action
		add_action( 'imgsentry_process_background_batch', array( $this, 'process_background_batch_scan' ), 10, 1 );
		add_action( 'imgsentry_process_dirty_queue_event', array( $this, 'process_dirty_queue' ) );

		// Orphan Data Reconciliation Cron Hooks
		add_filter( 'cron_schedules', array( $this, 'add_weekly_cron_schedule' ) );
		add_action( 'imgsentry_weekly_reconcile_orphans', array( 'ImgSentry_Usage_Indexer', 'reconcile_orphaned_rows' ) );
		add_action( 'imgsentry_reconcile_orphans_batch', array( 'ImgSentry_Usage_Indexer', 'reconcile_orphaned_rows' ) );

		// Auto-ensure table exists and queue is active on admin or plugin init
		add_action( 'admin_init', array( $this, 'ensure_schema_and_initial_scan' ) );
		add_action( 'add_attachment', array( $this, 'on_attachment_added' ), 20, 1 );
		add_action( 'admin_init', array( $this, 'maybe_auto_process_dirty_attachments' ) );
		add_action( 'admin_init', array( $this, 'maybe_opportunistic_reconcile' ) );
		add_action( 'admin_init', array( $this, 'maybe_run_v1_false_positive_cleanup' ) );

		// Schedule weekly orphan reconciliation cron if not already scheduled
		if ( ! wp_next_scheduled( 'imgsentry_weekly_reconcile_orphans' ) ) {
			wp_schedule_event( time() + DAY_IN_SECONDS, 'weekly', 'imgsentry_weekly_reconcile_orphans' );
		}
	}

	/**
	 * Register 'weekly' cron schedule interval if not already present in WordPress.
	 *
	 * @param array $schedules Existing cron schedules.
	 * @return array
	 */
	public function add_weekly_cron_schedule( $schedules ) {
		if ( ! isset( $schedules['weekly'] ) ) {
			$schedules['weekly'] = array(
				'interval' => 7 * DAY_IN_SECONDS,
				'display'  => __( 'Once Weekly', 'imgsentry' ),
			);
		}
		return $schedules;
	}

	/**
	 * Opportunistically check and reconcile orphaned rows, throttled to at most once per hour.
	 */
	public function maybe_opportunistic_reconcile() {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		if ( get_transient( 'imgsentry_last_reconcile_check' ) ) {
			return;
		}
		set_transient( 'imgsentry_last_reconcile_check', 1, HOUR_IN_SECONDS );
		self::reconcile_orphaned_rows();
	}

	/**
	 * Build structured source entry for usage tracking.
	 *
	 * @param int|null $post_id Post ID or null.
	 * @param string   $field_type Field type slug.
	 * @param string   $field_label Human readable field label.
	 * @return array
	 */
	private static function build_source_entry( $post_id, $field_type, $field_label ) {
		$post = $post_id ? get_post( $post_id ) : null;
		return array(
			'post_id'     => $post_id ? (int) $post_id : null,
			'post_title'  => $post ? ( $post->post_title ? $post->post_title : "Post #{$post_id}" ) : $field_label,
			'post_type'   => $post ? $post->post_type : null,
			'field_type'  => $field_type,   // 'content' | 'featured_image' | 'attached' | 'woocommerce_gallery' | 'elementor' | 'custom_meta' | 'theme_customizer' | 'site_option'
			'field_label' => $field_label,  // human label, e.g. "Featured Image", "Custom Field: banner"
			'url'         => $post_id ? get_permalink( $post_id ) : null,
			'edit_url'    => $post_id && current_user_can( 'edit_post', $post_id )
				? get_edit_post_link( $post_id, 'raw' )
				: null,
		);
	}

	/**
	 * Builds (once per request) the ready-to-match exclusion rules from the saved settings.
	 *
	 * @return array { uploads_base: string, folders: string[], files: array<int, array{regex: string, match_path: bool}> }
	 */
	private static function get_exclusion_rules() {
		static $rules = null;
		if ( null !== $rules ) {
			return $rules;
		}

		$settings = class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::instance()->get_settings() : array();
		$upload   = wp_upload_dir();
		$base     = isset( $upload['basedir'] ) ? trailingslashit( wp_normalize_path( $upload['basedir'] ) ) : '';

		$rules = array(
			'uploads_base' => $base,
			'folders'      => array(),
			'files'        => array(),
		);

		$prefix = 'wp-content/uploads/';

		// Folders are stored like "/wp-content/uploads/cache/" — turn them into real paths inside the uploads folder.
		if ( '' !== $base && ! empty( $settings['excludedFolders'] ) && is_array( $settings['excludedFolders'] ) ) {
			foreach ( $settings['excludedFolders'] as $folder_item ) {
				$folder_path = is_array( $folder_item ) && isset( $folder_item['path'] ) ? $folder_item['path'] : ( is_string( $folder_item ) ? $folder_item : '' );
				if ( '' === trim( (string) $folder_path ) ) {
					continue;
				}
				$relative = ltrim( wp_normalize_path( (string) $folder_path ), '/' );
				if ( 0 === stripos( $relative, $prefix ) ) {
					$relative = substr( $relative, strlen( $prefix ) );
				}
				$relative = trim( $relative, '/' );
				if ( '' === $relative || false !== strpos( $relative, '..' ) ) {
					continue; // Never let an empty/odd rule exclude the whole uploads folder.
				}
				$rules['folders'][] = $base . $relative . '/';
			}
		}

		if ( ! empty( $settings['excludedFiles'] ) && is_array( $settings['excludedFiles'] ) ) {
			foreach ( $settings['excludedFiles'] as $file_item ) {
				$pattern = is_array( $file_item ) && isset( $file_item['path'] ) ? $file_item['path'] : ( is_string( $file_item ) ? $file_item : '' );
				$pattern = trim( wp_normalize_path( (string) $pattern ) );
				if ( '' === $pattern ) {
					continue;
				}
				$match_path = false !== strpos( $pattern, '/' );
				if ( $match_path ) {
					$pattern = ltrim( $pattern, '/' );
					if ( 0 === stripos( $pattern, $prefix ) ) {
						$pattern = substr( $pattern, strlen( $prefix ) );
					}
				}
				$regex = '/^' . str_replace( array( '\\*', '\\?' ), array( '.*', '.' ), preg_quote( $pattern, '/' ) ) . '$/i';
				$rules['files'][] = array(
					'regex'      => $regex,
					'match_path' => $match_path,
				);
			}
		}

		return $rules;
	}

	/**
	 * Check if an arbitrary file path matches excludedFolders or excludedFiles.
	 *
	 * @param string $file_path Physical file path.
	 * @return bool True if matched (and should be excluded/protected), false otherwise.
	 */
	public static function is_path_excluded_by_pattern( $file_path ) {
		if ( empty( $file_path ) ) {
			return false;
		}

		$file_path_normalized = wp_normalize_path( $file_path );
		$filename             = basename( $file_path_normalized );
		$rules                = self::get_exclusion_rules();

		// 1. Folder exclusions, matched against the real path inside the uploads folder.
		// Case-sensitive on Linux (so "Cache" does not exclude "cache"), case-insensitive on Windows and macOS.
		$folders_case_sensitive = class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::folder_rules_case_sensitive() : true;
		foreach ( $rules['folders'] as $target_folder_path ) {
			$hit = $folders_case_sensitive
				? strpos( $file_path_normalized, $target_folder_path )
				: stripos( $file_path_normalized, $target_folder_path );
			if ( false !== $hit ) {
				return true;
			}
		}

		// 2. File wildcard exclusions. "*" = any characters, "?" = one character, case-insensitive.
		// A pattern without "/" is matched against the file name; a pattern with "/" is matched against the
		// path inside the uploads folder (for example "2024/05/*.pdf").
		$relative_path = $filename;
		if ( '' !== $rules['uploads_base'] && 0 === stripos( $file_path_normalized, $rules['uploads_base'] ) ) {
			$relative_path = substr( $file_path_normalized, strlen( $rules['uploads_base'] ) );
		}
		foreach ( $rules['files'] as $file_rule ) {
			$subject = $file_rule['match_path'] ? $relative_path : $filename;
			if ( 1 === preg_match( $file_rule['regex'], $subject ) ) {
				return true;
			}
		}

		// Hard-protected folders and files checking
		$lower_path = strtolower( $file_path_normalized );
		$basename   = basename( $lower_path );

		// Exact basename file matches
		if (
			'wp-config.php' === $basename ||
			'.htaccess' === $basename ||
			'web.config' === $basename
		) {
			return true;
		}

		// Substring folder/segment checks
		if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
			$real_backups_path = wp_normalize_path( strtolower( ImgSentry_Storage_Paths::get_backups_dir() ) );
			$real_trash_path   = wp_normalize_path( strtolower( ImgSentry_Storage_Paths::get_trash_dir() ) );

			if ( strpos( $lower_path, $real_backups_path ) !== false || strpos( $lower_path, $real_trash_path ) !== false ) {
				return true;
			}
		} else {
			if (
				strpos( $lower_path, '/imgsentry/backups' ) !== false ||
				strpos( $lower_path, '/imgsentry/trash' ) !== false
			) {
				return true;
			}
		}

		if (
			strpos( $lower_path, '-imgsentry-backup' ) !== false ||
			strpos( $lower_path, 'wp-admin' ) !== false
		) {
			return true;
		}

		// Active theme check
		if ( function_exists( 'get_stylesheet_directory' ) ) {
			$theme_dir = wp_normalize_path( get_stylesheet_directory() );
			if ( ! empty( $theme_dir ) && strpos( $file_path_normalized, $theme_dir ) !== false ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if an attachment's path matches excludedFolders or excludedFiles.
	 *
	 * @param int $attachment_id Attachment post ID.
	 * @return bool True if matched (and should be excluded/protected), false otherwise.
	 */
	public static function is_attachment_path_excluded( $attachment_id ) {
		$file_path = get_attached_file( $attachment_id );
		if ( empty( $file_path ) ) {
			return false;
		}
		return self::is_path_excluded_by_pattern( $file_path );
	}

	/**
	 * Build SQL filter query clause based on allowed Scan Scope Filters.
	 *
	 * @return string SQL clause (e.g., ' AND post_mime_type NOT IN (...)')
	 */
	public static function get_allowed_mime_types_sql_clause() {
		$settings = get_option( 'imgsentry_settings', array() );
		$defaults = ImgSentry_Settings::instance()->get_defaults();
		$settings = wp_parse_args( $settings, $defaults );

		$disabled_categories = array();
		if ( empty( $settings['includeImages'] ) ) {
			$disabled_categories[] = 'images';
		}
		if ( empty( $settings['includeDocuments'] ) ) {
			$disabled_categories[] = 'documents';
		}
		if ( empty( $settings['includeVideos'] ) ) {
			$disabled_categories[] = 'video';
		}
		if ( empty( $settings['includeAudio'] ) ) {
			$disabled_categories[] = 'audio';
		}
		if ( empty( $settings['includeOthers'] ) ) {
			$disabled_categories[] = 'fonts';
		}

		$exclude_mimes = array();
		foreach ( $disabled_categories as $cat ) {
			$mimes = ImgSentry_Scanner::get_mime_types_for_category( $cat );
			if ( ! empty( $mimes ) ) {
				$exclude_mimes = array_merge( $exclude_mimes, $mimes );
			}
		}

		if ( empty( $settings['includeSvg'] ) ) {
			if ( ! in_array( 'image/svg+xml', $exclude_mimes, true ) ) {
				$exclude_mimes[] = 'image/svg+xml';
			}
		} else {
			$exclude_mimes = array_diff( $exclude_mimes, array( 'image/svg+xml' ) );
		}

		global $wpdb;
		$sql_parts = array();
		if ( ! empty( $exclude_mimes ) ) {
			$escaped_mimes = array_map( function( $mime ) use ( $wpdb ) {
				return "'" . esc_sql( $mime ) . "'";
			}, $exclude_mimes );
			$sql_parts[] = 'post_mime_type NOT IN (' . implode( ',', $escaped_mimes ) . ')';
		}

		if ( empty( $settings['includeOthers'] ) ) {
			$all_active_mimes = array();
			$active_categories = array();
			if ( ! empty( $settings['includeImages'] ) ) { $active_categories[] = 'images'; }
			if ( ! empty( $settings['includeDocuments'] ) ) { $active_categories[] = 'documents'; }
			if ( ! empty( $settings['includeVideos'] ) ) { $active_categories[] = 'video'; }
			if ( ! empty( $settings['includeAudio'] ) ) { $active_categories[] = 'audio'; }
			
			foreach ( $active_categories as $cat ) {
				$all_active_mimes = array_merge( $all_active_mimes, ImgSentry_Scanner::get_mime_types_for_category( $cat ) );
			}
			if ( empty( $settings['includeSvg'] ) ) {
				$all_active_mimes = array_diff( $all_active_mimes, array( 'image/svg+xml' ) );
			} else {
				if ( ! in_array( 'image/svg+xml', $all_active_mimes, true ) ) {
					$all_active_mimes[] = 'image/svg+xml';
				}
			}

			if ( ! empty( $all_active_mimes ) ) {
				$escaped_allowed = array_map( function( $mime ) use ( $wpdb ) {
					return "'" . esc_sql( $mime ) . "'";
				}, $all_active_mimes );
				$sql_parts[] = 'post_mime_type IN (' . implode( ',', $escaped_allowed ) . ')';
			} else {
				$sql_parts[] = '1=0';
			}
		}

		if ( ! empty( $sql_parts ) ) {
			return ' AND (' . implode( ' AND ', $sql_parts ) . ')';
		}

		return '';
	}

	/**
	 * Ensure table schema exists and trigger initial background scan if unindexed.
	 */
	public function ensure_schema_and_initial_scan() {
		global $wpdb;
		$imgsentry_table_name   = self::get_table_name();
		$imgsentry_table_exists = ( $imgsentry_table_name === $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $imgsentry_table_name ) ) ) );
		if ( ! $imgsentry_table_exists || '1' !== (string) get_option( 'imgsentry_usage_table_db_version', '' ) ) {
			self::create_table();
			update_option( 'imgsentry_usage_table_db_version', '1' );
		}

		if ( false === get_transient( 'imgsentry_attachments_registered_recently' ) ) {
			self::ensure_all_attachments_registered();
			set_transient( 'imgsentry_attachments_registered_recently', 1, 5 * MINUTE_IN_SECONDS );
		}

		$table_name = self::get_table_name();

		// One-time schema migration check for version 2 (structured usage_sources objects)
		$stored_schema_ver = (int) get_option( 'imgsentry_usage_schema_version', 1 );
		if ( $stored_schema_ver < 2 ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$wpdb->query( "UPDATE {$table_name} SET is_dirty = 1" );
			update_option( 'imgsentry_usage_schema_version', 2 );
		}

		// Check if table is empty or all rows are still dirty with 0 used items
		$counts = $wpdb->get_row(
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
			"SELECT 
				COUNT(*) AS total,
				SUM(CASE WHEN u.is_dirty = 1 THEN 1 ELSE 0 END) AS dirty,
				SUM(CASE WHEN u.status = 'used' THEN 1 ELSE 0 END) AS used
			 FROM {$table_name} u
			 INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
			 WHERE p.post_type = 'attachment' AND p.post_status = 'inherit'"
		);
			// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		$total = $counts ? (int) $counts->total : 0;
		$dirty = $counts ? (int) $counts->dirty : 0;
		$used  = $counts ? (int) $counts->used : 0;

		// If there are attachments and either none have been scanned (all dirty & 0 used) or scan was never triggered
		if ( $total > 0 && 0 === $used && $dirty === $total && 'yes' !== get_option( 'imgsentry_scan_lock', 'no' ) ) {
			if ( self::is_usage_tracking_enabled() ) {
				self::start_background_scan( false, 'full', 'auto' );
			}
		}
	}

	/**
	 * ------------------------------------------------------------------------
	 * PART 1: DATABASE SCHEMA
	 * ------------------------------------------------------------------------
	 * Creates custom table wp_imgsentry_attachment_usage for persistent usage data.
	 */
	public static function create_table() {
		global $wpdb;

		$table_name      = $wpdb->prefix . self::TABLE_NAME;
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table_name} (
			attachment_id bigint(20) unsigned NOT NULL,
			status varchar(20) NOT NULL DEFAULT 'unused',
			usage_sources longtext DEFAULT NULL,
			usage_count int(10) unsigned NOT NULL DEFAULT 0,
			content_hash varchar(64) DEFAULT NULL,
			is_dirty tinyint(1) NOT NULL DEFAULT 1,
			last_scanned_at datetime DEFAULT NULL,
			PRIMARY KEY  (attachment_id),
			KEY status (status),
			KEY is_dirty (is_dirty),
			KEY last_scanned_at (last_scanned_at)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	/**
	 * Get full table name with prefix.
	 *
	 * @return string
	 */
	public static function get_table_name() {
		global $wpdb;
		return $wpdb->prefix . self::TABLE_NAME;
	}

	/**
	 * Build the shared WHERE clause, params, and JOIN string for usage queries,
	 * given the same filter criteria used by get_paginated_usage(). Extracted so
	 * get_paginated_usage() and get_usage_category_breakdown() build identical,
	 * always-in-sync filter conditions from one place.
	 *
	 * @return array{where_sql: string, where_params: array, joins: string}
	 */
	private static function build_usage_where_clause( $status, $search, $file_types, $locations, $sizes, $dates, $usage_locations ) {
		global $wpdb;

		$status = in_array( $status, array( 'used', 'unused' ), true ) ? $status : 'used';

		if ( 'unused' === $status ) {
			$where_clauses = array( "u.status = 'unused' AND u.is_dirty = 0 AND u.last_scanned_at IS NOT NULL", 'p.post_type = %s', "p.post_status = 'inherit'" );
			$where_params  = array( 'attachment' );
		} else {
			$where_clauses = array( 'u.status = %s', 'p.post_type = %s', "p.post_status = 'inherit'" );
			$where_params  = array( $status, 'attachment' );
		}

		if ( ! empty( $search ) ) {
			$search_like  = '%' . $wpdb->esc_like( $search ) . '%';
			$search_extra = '';
			$search_fmt   = ltrim( strtolower( trim( $search ) ), '.' );
			if ( 'webp' === $search_fmt ) {
				$search_extra = " OR EXISTS ( SELECT 1 FROM {$wpdb->postmeta} pm_sfmt WHERE pm_sfmt.post_id = p.ID AND pm_sfmt.meta_key = '_imgsentry_output_format' AND pm_sfmt.meta_value IN ('webp','both') )";
			} elseif ( 'avif' === $search_fmt ) {
				$search_extra = " OR EXISTS ( SELECT 1 FROM {$wpdb->postmeta} pm_sfmt WHERE pm_sfmt.post_id = p.ID AND pm_sfmt.meta_key = '_imgsentry_output_format' AND pm_sfmt.meta_value IN ('avif','both') )";
			}
			$where_clauses[] = '(p.post_title LIKE %s OR p.guid LIKE %s OR pm_file.meta_value LIKE %s' . $search_extra . ')';
			$where_params[]  = $search_like;
			$where_params[]  = $search_like;
			$where_params[]  = $search_like;
		}

		if ( ! empty( $file_types ) ) {
			$type_clauses = array();
			foreach ( $file_types as $type ) {
				$type = strtolower( trim( $type ) );
				if ( 'documents' === $type ) {
					$type_clauses[] = "(p.post_mime_type LIKE 'application/%' OR p.post_mime_type LIKE 'text/%' OR pm_file.meta_value LIKE '%.pdf' OR pm_file.meta_value LIKE '%.doc%' OR pm_file.meta_value LIKE '%.xls%' OR pm_file.meta_value LIKE '%.txt')";
				} elseif ( 'media' === $type ) {
					$type_clauses[] = "(p.post_mime_type LIKE 'audio/%' OR p.post_mime_type LIKE 'video/%' OR pm_file.meta_value LIKE '%.mp3' OR pm_file.meta_value LIKE '%.mp4' OR pm_file.meta_value LIKE '%.wav')";
				} elseif ( 'other_files' === $type ) {
					$type_clauses[] = "(p.post_mime_type NOT LIKE 'image/%' AND p.post_mime_type NOT LIKE 'application/%' AND p.post_mime_type NOT LIKE 'text/%' AND p.post_mime_type NOT LIKE 'audio/%' AND p.post_mime_type NOT LIKE 'video/%')";
				} elseif ( 'jpg' === $type || 'jpeg' === $type || 'image/jpeg' === $type ) {
					$type_clauses[] = "((pm_file.meta_value LIKE '%.jpg' OR pm_file.meta_value LIKE '%.jpeg' OR p.post_mime_type = 'image/jpeg') AND NOT EXISTS ( SELECT 1 FROM {$wpdb->postmeta} pm_fmt WHERE pm_fmt.post_id = p.ID AND pm_fmt.meta_key = '_imgsentry_output_format' AND pm_fmt.meta_value IN ('webp','avif','both') ))";
				} elseif ( 'png' === $type || 'image/png' === $type ) {
					$type_clauses[] = "((pm_file.meta_value LIKE '%.png' OR p.post_mime_type = 'image/png') AND NOT EXISTS ( SELECT 1 FROM {$wpdb->postmeta} pm_fmt WHERE pm_fmt.post_id = p.ID AND pm_fmt.meta_key = '_imgsentry_output_format' AND pm_fmt.meta_value IN ('webp','avif','both') ))";
				} elseif ( 'webp' === $type || 'image/webp' === $type ) {
					$type_clauses[] = "((pm_file.meta_value LIKE '%.webp' OR p.post_mime_type = 'image/webp') OR EXISTS ( SELECT 1 FROM {$wpdb->postmeta} pm_fmt WHERE pm_fmt.post_id = p.ID AND pm_fmt.meta_key = '_imgsentry_output_format' AND pm_fmt.meta_value IN ('webp','both') ))";
				} elseif ( 'avif' === $type || 'image/avif' === $type ) {
					$type_clauses[] = "((pm_file.meta_value LIKE '%.avif' OR p.post_mime_type = 'image/avif') OR EXISTS ( SELECT 1 FROM {$wpdb->postmeta} pm_fmt WHERE pm_fmt.post_id = p.ID AND pm_fmt.meta_key = '_imgsentry_output_format' AND pm_fmt.meta_value IN ('avif','both') ))";
				} elseif ( 'svg' === $type || 'image/svg+xml' === $type ) {
					$type_clauses[] = "(pm_file.meta_value LIKE '%.svg' OR p.post_mime_type LIKE '%%svg%%')";
				} elseif ( 'pdf' === $type || 'application/pdf' === $type ) {
					$type_clauses[] = "(pm_file.meta_value LIKE '%.pdf' OR p.post_mime_type = 'application/pdf')";
				} elseif ( strpos( $type, '/' ) !== false ) {
					$type_clauses[] = "p.post_mime_type = %s";
					$where_params[] = $type;
				} else {
					$type_clauses[] = "(pm_file.meta_value LIKE %s OR p.post_mime_type LIKE %s)";
					$where_params[]  = '%.' . $wpdb->esc_like( $type );
					$where_params[]  = '%/' . $wpdb->esc_like( $type );
				}
			}
			if ( ! empty( $type_clauses ) ) {
				$where_clauses[] = '(' . implode( ' OR ', $type_clauses ) . ')';
			}
		}

		if ( ! empty( $locations ) ) {
			$location_clauses = array();
			foreach ( $locations as $loc ) {
				// Strip leading/trailing slashes and wp-content/uploads/ if it is present
				$loc_clean = str_replace( 'wp-content/uploads/', '', ltrim( $loc, '/' ) );
				$loc_clean = trim( $loc_clean, '/' );
				
				if ( ! empty( $loc_clean ) ) {
					if ( 'root' === strtolower( $loc_clean ) ) {
						$location_clauses[] = "(pm_file.meta_value NOT LIKE '%/%' AND pm_file.meta_value != '')";
					} else {
						$loc_esc = $wpdb->esc_like( $loc_clean );
						$location_clauses[] = "(pm_file.meta_value LIKE %s OR pm_file.meta_value LIKE %s)";
						$where_params[]     = $loc_esc . '/%';
						$where_params[]     = $loc_esc . '%';
					}
				} else {
					$location_clauses[] = "(pm_file.meta_value != '' OR p.guid != '')";
				}
			}
			if ( ! empty( $location_clauses ) ) {
				$where_clauses[] = '(' . implode( ' OR ', $location_clauses ) . ')';
			}
		}

		if ( ! empty( $usage_locations ) ) {
			$usage_clauses = array();
			foreach ( $usage_locations as $uloc ) {
				$uloc_clean = trim( $uloc );
				if ( ! empty( $uloc_clean ) ) {
					$usage_clauses[] = "u.usage_sources LIKE %s";
					$where_params[]  = '%' . $wpdb->esc_like( $uloc_clean ) . '%';
				}
			}
			if ( ! empty( $usage_clauses ) ) {
				$where_clauses[] = '(' . implode( ' OR ', $usage_clauses ) . ')';
			}
		}

		if ( ! empty( $sizes ) ) {
			$valid_sizes = array();
			foreach ( (array) $sizes as $s ) {
				$s = trim( strtolower( $s ) );
				if ( empty( $s ) || 'all' === $s ) {
					continue;
				}
				if ( 'small' === $s ) {
					$valid_sizes[] = "(CAST(pm_size.meta_value AS UNSIGNED) > 0 AND CAST(pm_size.meta_value AS UNSIGNED) < 512000)";
				} elseif ( 'medium' === $s ) {
					$valid_sizes[] = "(CAST(pm_size.meta_value AS UNSIGNED) >= 512000 AND CAST(pm_size.meta_value AS UNSIGNED) <= 2097152)";
				} elseif ( 'large' === $s ) {
					$valid_sizes[] = "(CAST(pm_size.meta_value AS UNSIGNED) > 2097152)";
				}
			}
			if ( ! empty( $valid_sizes ) ) {
				$where_clauses[] = '(' . implode( ' OR ', $valid_sizes ) . ')';
			}
		}
		if ( ! empty( $dates ) ) {
			$date_clauses = array();
			foreach ( $dates as $dt ) {
				if ( preg_match( '/^\d{4}-\d{2}$/', $dt ) ) {
					$date_clauses[] = "p.post_date LIKE %s";
					$where_params[] = $dt . '-%';
				}
			}
			if ( ! empty( $date_clauses ) ) {
				$where_clauses[] = '(' . implode( ' OR ', $date_clauses ) . ')';
			}
		}

		$where_sql = implode( ' AND ', $where_clauses );

		$joins = " u INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID ";
		$joins .= " LEFT JOIN {$wpdb->postmeta} pm_file ON u.attachment_id = pm_file.post_id AND pm_file.meta_key = '_wp_attached_file' ";
		$joins .= " LEFT JOIN {$wpdb->postmeta} pm_size ON u.attachment_id = pm_size.post_id AND pm_size.meta_key = '_filesize' ";

		return array(
			'where_sql'    => $where_sql,
			'where_params' => $where_params,
			'joins'        => $joins,
		);
	}

	/**
	 * Get paginated attachment usage records from custom table joined to wp_posts.
	 *
	 * @param string $status 'used' or 'unused'.
	 * @param int    $page Current page number (1-based).
	 * @param int    $per_page Items per page (-1 or int).
	 * @param string $search Search query for post_title or guidance.
	 * @return array Array containing 'items' and 'total'.
	 */
	public static function get_paginated_usage( $status, $page = 1, $per_page = 30, $search = '', $file_types = array(), $locations = array(), $sizes = array(), $dates = array(), $usage_locations = array() ) {
		self::ensure_all_attachments_registered();
		global $wpdb;
		$table_name = self::get_table_name();
		$page       = max( 1, (int) $page );
		$filter_parts = self::build_usage_where_clause( $status, $search, $file_types, $locations, $sizes, $dates, $usage_locations );
		$where_sql    = $filter_parts['where_sql'];
		$where_params = $filter_parts['where_params'];
		$joins        = $filter_parts['joins'];

		// Count Query
		$count_sql   = "SELECT COUNT(*) FROM {$table_name} {$joins} WHERE {$where_sql}";
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$total_items = (int) $wpdb->get_var( $wpdb->prepare( $count_sql, $where_params ) );

		// Data Query
		if ( -1 === (int) $per_page || 'all' === $per_page ) {
			$data_sql = "SELECT u.*, p.post_title, p.guid FROM {$table_name} {$joins} WHERE {$where_sql} ORDER BY u.last_scanned_at DESC, u.attachment_id DESC";
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$rows     = $wpdb->get_results( $wpdb->prepare( $data_sql, $where_params ) );
		} else {
			$per_page    = max( 1, (int) $per_page );
			$offset      = ( $page - 1 ) * $per_page;
			$data_sql    = "SELECT u.*, p.post_title, p.guid FROM {$table_name} {$joins} WHERE {$where_sql} ORDER BY u.last_scanned_at DESC, u.attachment_id DESC LIMIT %d OFFSET %d";
			$data_params = array_merge( $where_params, array( $per_page, $offset ) );
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$rows        = $wpdb->get_results( $wpdb->prepare( $data_sql, $data_params ) );
		}

		$items = array();
		if ( ! empty( $rows ) ) {
			foreach ( $rows as $row ) {
				$sources = ! empty( $row->usage_sources ) ? json_decode( $row->usage_sources, true ) : array();

				// Convert DB timestamp to explicit UTC ISO 8601 string
				$last_scanned_utc = null;
				if ( ! empty( $row->last_scanned_at ) ) {
					$ts = strtotime( $row->last_scanned_at . ' UTC' );
					if ( $ts ) {
						$last_scanned_utc = gmdate( 'Y-m-d\TH:i:s\Z', $ts );
					}
				}

				$items[] = array(
					'attachment_id'   => (int) $row->attachment_id,
					'status'          => $row->status,
					'usage_sources'   => is_array( $sources ) ? $sources : array(),
					'usage_count'     => (int) $row->usage_count,
					'content_hash'    => $row->content_hash,
					'is_dirty'        => (int) $row->is_dirty,
					'last_scanned_at' => $last_scanned_utc,
					'post_title'      => $row->post_title,
					'guid'            => $row->guid,
				);
			}
		}

		$unverified_count = 0;
		if ( 'unused' === $status ) {
			$unverified_count = (int) $wpdb->get_var(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
				"SELECT COUNT(*) FROM {$table_name} u
				 INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
				 WHERE u.status = 'unused' AND (u.is_dirty = 1 OR u.last_scanned_at IS NULL)
				 AND p.post_type = 'attachment' AND p.post_status = 'inherit'"
			);
		}

		return array(
			'items'      => $items,
			'total'      => $total_items,
			'page'       => $page,
			'pages'      => ceil( $total_items / max( 1, is_numeric( $per_page ) ? (int) $per_page : 30 ) ),
			'unverified' => $unverified_count,
		);
	}

	/**
	 * Get usage category breakdown.
	 *
	 * Returns the count and size of files for images, documents, video, audio, fonts, and other categories
	 * across all rows matching the specified filters and status.
	 *
	 * @param string $status 'used' or 'unused'.
	 * @param string $search Search query.
	 * @param array $file_types File type filters.
	 * @param array $locations Location filters.
	 * @param array $sizes Size filters.
	 * @param array $dates Date filters.
	 * @param array $usage_locations Usage location filters.
	 * @return array breakdown stats.
	 */
	public static function get_usage_category_breakdown( $status, $search = '', $file_types = array(), $locations = array(), $sizes = array(), $dates = array(), $usage_locations = array() ) {
		global $wpdb;

		$status = in_array( $status, array( 'used', 'unused' ), true ) ? $status : 'used';

		$filter_parts = self::build_usage_where_clause( $status, $search, $file_types, $locations, $sizes, $dates, $usage_locations );
		$where_sql    = $filter_parts['where_sql'];
		$where_params = $filter_parts['where_params'];
		$joins        = $filter_parts['joins'];

		$table_name = self::get_table_name();

		$breakdown = array(
			'total_size' => 0,
			'images'     => array( 'count' => 0, 'size' => 0 ),
			'video'      => array( 'count' => 0, 'size' => 0 ),
			'documents'  => array( 'count' => 0, 'size' => 0 ),
			'audio'      => array( 'count' => 0, 'size' => 0 ),
			'fonts'      => array( 'count' => 0, 'size' => 0 ),
			'other'      => array( 'count' => 0, 'size' => 0 ),
			'calculation_incomplete' => false,
		);

		$start_time   = microtime( true );
		$raw_limit    = (int) ini_get( 'max_execution_time' );
		$is_unlimited = ( 0 === $raw_limit );
		$time_budget  = $is_unlimited ? 60.0 : ( ( $raw_limit > 0 ? $raw_limit : 30 ) * 0.75 );

		$upload_dir = wp_upload_dir();
		$basedir    = isset( $upload_dir['basedir'] ) ? $upload_dir['basedir'] : '';

		

		// Same postmeta columns ImgSentry_Scanner::get_total_stats() reads for trashed items,
		// via the same joins/where already used by get_paginated_usage() for this status/filters.
		$sql = "SELECT p.ID, p.post_mime_type, p.guid, pm_size.meta_value AS filesize_meta, pm_file.meta_value AS attached_file, pm_meta.meta_value AS attachment_metadata
		        FROM {$table_name} {$joins}
		        LEFT JOIN {$wpdb->postmeta} pm_meta ON u.attachment_id = pm_meta.post_id AND pm_meta.meta_key = '_wp_attachment_metadata'
		        WHERE {$where_sql}";
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $where_params ) );

		if ( ! empty( $rows ) ) {
			foreach ( $rows as $row ) {
				if ( ( microtime( true ) - $start_time ) > $time_budget ) {
					$breakdown['calculation_incomplete'] = true;
					break;
				}

				$mime     = strtolower( (string) $row->post_mime_type );
				$guid     = (string) $row->guid;
				$path_ext = pathinfo( wp_parse_url( $guid, PHP_URL_PATH ), PATHINFO_EXTENSION );
				$ext      = strtoupper( $path_ext );

				$size = 0;
				if ( class_exists( 'ImgSentry_Scanner' ) && method_exists( 'ImgSentry_Scanner', 'resolve_attachment_filesize' ) ) {
					$size = ImgSentry_Scanner::resolve_attachment_filesize(
						isset( $row->filesize_meta ) ? $row->filesize_meta : null,
						isset( $row->attachment_metadata ) ? $row->attachment_metadata : null,
						isset( $row->attached_file ) ? $row->attached_file : '',
						$basedir
					);
				} else {
					if ( ! empty( $row->filesize_meta ) ) {
						$size = (int) $row->filesize_meta;
					} elseif ( ! empty( $row->attached_file ) ) {
						$full_path = trailingslashit( $basedir ) . ltrim( $row->attached_file, '/' );
						if ( file_exists( $full_path ) ) {
							$size = (int) filesize( $full_path );
						}
					}
				}

				

				$cat = 'other';
				if ( 0 === strpos( $mime, 'image/' ) ) {
					$cat = 'images';
				} elseif ( 0 === strpos( $mime, 'video/' ) ) {
					$cat = 'video';
				} elseif ( 0 === strpos( $mime, 'audio/' ) ) {
					$cat = 'audio';
				} elseif ( in_array( strtolower( $ext ), array( 'woff', 'woff2', 'ttf', 'otf', 'eot' ), true ) || false !== strpos( $mime, 'font' ) ) {
					$cat = 'fonts';
				} elseif ( in_array( strtolower( $ext ), array( 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv' ), true ) || false !== strpos( $mime, 'pdf' ) || false !== strpos( $mime, 'document' ) ) {
					$cat = 'documents';
				}

				$breakdown[ $cat ]['count']++;
				$breakdown[ $cat ]['size'] += $size;
				$breakdown['total_size']   += $size;
			}
		}

		return $breakdown;
	}

	/**
	 * ------------------------------------------------------------------------
	 * PART 2: POST-CENTRIC ATTACHMENT INDEXING (O(N) POST PASS)
	 * ------------------------------------------------------------------------
	 */

	/**
	 * Detect which translation plugin is active (if any).
	 *
	 * @return string|null 'wpml', 'polylang', or null if neither is active.
	 */
	public static function get_active_translation_plugin() {
		if ( function_exists( 'icl_object_id' ) || defined( 'ICL_SITEPRESS_VERSION' ) || class_exists( 'SitePress' ) ) {
			return 'wpml';
		}
		if ( function_exists( 'pll_get_post_translations' ) || class_exists( 'Polylang' ) ) {
			return 'polylang';
		}
		return null;
	}

	/**
	 * Retrieve all translated post IDs for a given post or attachment (including the ID itself).
	 *
	 * @param int    $post_id   Post or Attachment ID.
	 * @param string $post_type Optional post type.
	 * @return array Array of translated post IDs (integers).
	 */
	public static function get_post_translation_ids( $post_id, $post_type = '' ) {
		$post_id = (int) $post_id;
		if ( $post_id <= 0 ) {
			return array();
		}

		$plugin = self::get_active_translation_plugin();
		if ( null === $plugin ) {
			return array( $post_id );
		}

		$translation_ids = array( $post_id );

		if ( empty( $post_type ) ) {
			$post_type = get_post_type( $post_id );
		}
		$post_type = $post_type ? $post_type : 'post';

		if ( 'polylang' === $plugin ) {
			if ( function_exists( 'pll_get_post_translations' ) ) {
				$pll_translations = pll_get_post_translations( $post_id );
				if ( is_array( $pll_translations ) && ! empty( $pll_translations ) ) {
					foreach ( $pll_translations as $t_id ) {
						$t_id = (int) $t_id;
						if ( $t_id > 0 ) {
							$translation_ids[] = $t_id;
						}
					}
				}
			}
		} elseif ( 'wpml' === $plugin ) {
			$element_type = 'post_' . $post_type;

			// 1. Standard WPML filter: wpml_element_trid + wpml_get_element_translations
			$trid = apply_filters( 'wpml_element_trid', null, $post_id, $element_type );
			if ( ! empty( $trid ) ) {
				$wpml_translations = apply_filters( 'wpml_get_element_translations', null, $trid, $element_type );
				if ( is_array( $wpml_translations ) && ! empty( $wpml_translations ) ) {
					foreach ( $wpml_translations as $trans ) {
						if ( is_object( $trans ) && isset( $trans->element_id ) ) {
							$translation_ids[] = (int) $trans->element_id;
						} elseif ( is_array( $trans ) && isset( $trans['element_id'] ) ) {
							$translation_ids[] = (int) $trans['element_id'];
						}
					}
				}
			}

			// 2. Fallback: wpml_get_content_translations
			if ( count( $translation_ids ) <= 1 ) {
				$content_translations = apply_filters( 'wpml_get_content_translations', null, $post_id, $post_type );
				if ( is_array( $content_translations ) && ! empty( $content_translations ) ) {
					foreach ( $content_translations as $trans ) {
						if ( is_object( $trans ) && isset( $trans->element_id ) ) {
							$translation_ids[] = (int) $trans->element_id;
						} elseif ( is_array( $trans ) && isset( $trans['element_id'] ) ) {
							$translation_ids[] = (int) $trans['element_id'];
						} elseif ( is_numeric( $trans ) ) {
							$translation_ids[] = (int) $trans;
						}
					}
				}
			}

			// 3. Fallback: query active languages via icl_object_id or wpml_object_id
			if ( count( $translation_ids ) <= 1 ) {
				$active_languages = apply_filters( 'wpml_active_languages', null, 'skip_empty=0' );
				if ( is_array( $active_languages ) && ! empty( $active_languages ) ) {
					foreach ( array_keys( $active_languages ) as $lang_code ) {
						$lang_post_id = 0;
						if ( function_exists( 'icl_object_id' ) ) {
							$lang_post_id = (int) icl_object_id( $post_id, $post_type, false, $lang_code );
						} else {
							$lang_post_id = (int) apply_filters( 'wpml_object_id', $post_id, $post_type, false, $lang_code );
						}
						if ( $lang_post_id > 0 ) {
							$translation_ids[] = $lang_post_id;
						}
					}
				}
			}
		}

		return array_values( array_unique( array_filter( $translation_ids ) ) );
	}

	/**
	 * Parse ONE post's post_content and relevant postmeta once,
	 * extract all attachment IDs referenced in it, and update usage rows.
	 * When a translation plugin is active, scans the entire translation group.
	 *
	 * @param int $post_id Post ID.
	 * @return array Array of referenced attachment IDs.
	 */
	public static function index_post_for_attachments( $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post || 'attachment' === $post->post_type || 'revision' === $post->post_type ) {
			return array();
		}

		if ( in_array( $post->post_status, array( 'trash', 'auto-draft' ), true ) ) {
			return array();
		}

		$post_id   = (int) $post->ID;
		$post_type = $post->post_type ? $post->post_type : 'post';

		// Gather all translated posts in the translation group (returns just [$post_id] if no translation plugin is active)
		$post_ids_to_scan = self::get_post_translation_ids( $post_id, $post_type );
		if ( empty( $post_ids_to_scan ) ) {
			$post_ids_to_scan = array( $post_id );
		}

		// Map of attachment_id => array of structured source entries
		$attachments_found = array();

		// URL-to-ID cache for this post scan to guarantee each unique URL is resolved at most once
		$resolved_urls_cache = array();
		$resolve_url_to_id   = function ( $url ) use ( &$resolved_urls_cache ) {
			if ( empty( $url ) || ! is_string( $url ) ) {
				return 0;
			}
			if ( array_key_exists( $url, $resolved_urls_cache ) ) {
				return $resolved_urls_cache[ $url ];
			}
			$resolved_id = 0;
			if ( function_exists( 'attachment_url_to_postid' ) ) {
				$resolved_id = (int) attachment_url_to_postid( $url );
				if ( $resolved_id <= 0 ) {
					$clean_no_query = strtok( $url, '?' );
					if ( $clean_no_query && $clean_no_query !== $url ) {
						$resolved_id = (int) attachment_url_to_postid( $clean_no_query );
					}
				}
			}
			$resolved_urls_cache[ $url ] = $resolved_id;
			return $resolved_id;
		};

		global $wpdb;
		$allowlist_keys_base = self::get_default_indexable_meta_keys();

		foreach ( $post_ids_to_scan as $scan_post_id ) {
			$scan_post = ( $scan_post_id === $post_id ) ? $post : get_post( $scan_post_id );
			if ( ! $scan_post || 'attachment' === $scan_post->post_type || 'revision' === $scan_post->post_type ) {
				continue;
			}
			if ( in_array( $scan_post->post_status, array( 'trash', 'auto-draft' ), true ) ) {
				continue;
			}

			$s_id    = (int) $scan_post->ID;
			$s_type  = ucfirst( $scan_post->post_type ? $scan_post->post_type : 'post' );

			// 1. Post Content (Gutenberg block markup, wp-image-{id}, wp-att-{id})
			$content_ids = self::extract_attachment_ids_from_content( $scan_post->post_content );
			foreach ( $content_ids as $att_id ) {
				$attachments_found[ $att_id ][] = self::build_source_entry( $s_id, 'content', sprintf( 'Content of %s', $s_type ) );
			}

			// 1b. Raw Image URLs in Post Content (Divi Backgrounds, Section Presets, Shortcodes, etc.)
			if ( ! empty( $scan_post->post_content ) ) {
				$content_urls = self::extract_upload_image_urls( $scan_post->post_content );
				$is_divi      = ( false !== strpos( $scan_post->post_content, 'et_pb_' ) );
				foreach ( $content_urls as $raw_url ) {
					$resolved_id = $resolve_url_to_id( $raw_url );
					if ( $resolved_id > 0 ) {
						$source_type  = $is_divi ? 'divi_raw_url' : 'content_raw_url';
						$source_label = $is_divi ? 'Divi Background/Layout Image' : sprintf( 'Raw Image URL in %s', $s_type );
						$attachments_found[ $resolved_id ][] = self::build_source_entry( $s_id, $source_type, $source_label );
					}
				}
			}

			// 2. Featured Image (_thumbnail_id)
			$thumb_id = (int) get_post_meta( $s_id, '_thumbnail_id', true );
			if ( $thumb_id > 0 && $thumb_id !== $s_id ) {
				$attachments_found[ $thumb_id ][] = self::build_source_entry( $s_id, 'featured_image', sprintf( 'Featured Image in %s', $s_type ) );
			}

			// 3. WooCommerce Product Gallery (_product_image_gallery)
			$wc_gallery = get_post_meta( $s_id, '_product_image_gallery', true );
			if ( ! empty( $wc_gallery ) ) {
				$wc_ids = array_filter( array_map( 'intval', explode( ',', $wc_gallery ) ) );
				foreach ( $wc_ids as $att_id ) {
					$attachments_found[ $att_id ][] = self::build_source_entry( $s_id, 'woocommerce_gallery', 'WooCommerce Product Gallery' );
				}
			}

			// 4. Elementor Data (_elementor_data)
			$elementor_json = get_post_meta( $s_id, '_elementor_data', true );
			if ( ! empty( $elementor_json ) ) {
				$el_ids = self::extract_attachment_ids_from_json( $elementor_json );
				foreach ( $el_ids as $att_id ) {
					$attachments_found[ $att_id ][] = self::build_source_entry( $s_id, 'elementor', 'Elementor Page/Template' );
				}
			}

			// 5. Post Parent Attachment Relationship
			$attached_ids = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT ID FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'attachment'",
					$s_id
				)
			);
			if ( ! empty( $attached_ids ) ) {
				foreach ( $attached_ids as $att_id ) {
					$att_id = (int) $att_id;
					$attachments_found[ $att_id ][] = self::build_source_entry( $s_id, 'attached', sprintf( 'Attached to %s', $s_type ) );
				}
			}

			// 6. Allow-list Meta Keys / ACF Fields for this post
			$allowlist_keys = apply_filters( 'imgsentry_indexable_meta_keys', $allowlist_keys_base, $s_id );
			if ( ! empty( $allowlist_keys ) && is_array( $allowlist_keys ) ) {
				foreach ( $allowlist_keys as $meta_key ) {
					if ( in_array( $meta_key, array( '_thumbnail_id', '_product_image_gallery', '_elementor_data' ), true ) ) {
						continue; // Already handled above
					}
					$meta_val = get_post_meta( $s_id, $meta_key, true );
					if ( ! empty( $meta_val ) ) {
						$extracted_meta_ids = self::extract_ids_from_meta_value( $meta_val );
						foreach ( $extracted_meta_ids as $att_id ) {
							$attachments_found[ $att_id ][] = self::build_source_entry( $s_id, 'custom_meta', sprintf( 'Custom Meta Field (%s)', esc_html( $meta_key ) ) );
						}

						// Beaver Builder raw image URL detection in _fl_builder_data / _fl_builder_draft
						if ( '_fl_builder_data' === $meta_key || false !== strpos( $meta_key, '_fl_builder_' ) ) {
							$bb_urls = self::extract_upload_image_urls( $meta_val );
							foreach ( $bb_urls as $raw_url ) {
								$resolved_id = $resolve_url_to_id( $raw_url );
								if ( $resolved_id > 0 ) {
									$attachments_found[ $resolved_id ][] = self::build_source_entry( $s_id, 'beaver_builder_raw_url', 'Beaver Builder Background/Asset Image' );
								}
							}
						}
					}
				}
			}
		}

		// Write / update usage rows for the detected attachment IDs
		foreach ( $attachments_found as $att_id => $sources ) {
			self::add_attachment_usage_sources( $att_id, $sources );
		}

		return array_keys( $attachments_found );
	}

	/**
	 * Index global site settings (Theme Customizer logo/header/icon and Widgets).
	 */
	public static function index_global_settings() {
		$global_attachments = array();

		// Custom Logo
		$logo_id = (int) get_theme_mod( 'custom_logo' );
		if ( $logo_id > 0 ) {
			$global_attachments[ $logo_id ][] = array(
				'post_id'     => null,
				'post_title'  => 'Custom Logo',
				'post_type'   => null,
				'field_type'  => 'theme_customizer',
				'field_label' => 'Theme Customizer: Custom Logo',
				'url'         => null,
				'edit_url'    => admin_url( 'customize.php' ),
			);
		}

		// Site Icon
		$icon_id = (int) get_option( 'site_icon' );
		if ( $icon_id > 0 ) {
			$global_attachments[ $icon_id ][] = array(
				'post_id'     => null,
				'post_title'  => 'Site Icon / Favicon',
				'post_type'   => null,
				'field_type'  => 'site_option',
				'field_label' => 'Site Settings: Site Icon / Favicon',
				'url'         => null,
				'edit_url'    => admin_url( 'options-general.php' ),
			);
		}

		// Header Image
		$header_img = get_theme_mod( 'header_image' );
		if ( ! empty( $header_img ) && function_exists( 'attachment_url_to_postid' ) ) {
			$header_id = attachment_url_to_postid( $header_img );
			if ( $header_id > 0 ) {
				$global_attachments[ $header_id ][] = array(
					'post_id'     => null,
					'post_title'  => 'Header Image',
					'post_type'   => null,
					'field_type'  => 'theme_customizer',
					'field_label' => 'Theme Customizer: Header Image',
					'url'         => null,
					'edit_url'    => admin_url( 'customize.php' ),
				);
			}
		}

		foreach ( $global_attachments as $att_id => $sources ) {
			self::add_attachment_usage_sources( $att_id, $sources );
		}
	}

	/**
	 * Build a 'min_age_rule' protection source entry for a newly-uploaded attachment,
	 * if it is younger than the configured minimum file age threshold. Shared by
	 * add_attachment_usage_sources() and imgsentry_is_attachment_used() so this logic
	 * exists in exactly one place.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array|null Structured source entry array, or null if not protected.
	 */
	private static function get_min_age_protection_source( $attachment_id ) {
		$settings     = get_option( 'imgsentry_settings', array() );
		$defaults     = ImgSentry_Settings::instance()->get_defaults();
		$settings     = wp_parse_args( $settings, $defaults );
		$min_age_days = isset( $settings['minFileAgeDays'] ) ? (int) $settings['minFileAgeDays'] : 7;

		$post_date = get_post_field( 'post_date', $attachment_id );
		if ( empty( $post_date ) ) {
			return null;
		}

		$uploaded_time = strtotime( $post_date );
		$age_days      = ( time() - $uploaded_time ) / DAY_IN_SECONDS;

		if ( $age_days >= $min_age_days ) {
			return null;
		}

		$age_days_floor = (int) floor( $age_days );

		return array(
			'post_id'     => null,
			'post_title'  => 'Newly Uploaded File',
			'post_type'   => null,
			'field_type'  => 'min_age_rule',
			'field_label' => sprintf( 'Uploaded %d day(s) ago — protected from deletion for %d days to avoid removing recently added media. Adjustable in Settings > Auto Clean > Minimum File Age.', $age_days_floor, $min_age_days ),
			'url'         => null,
			'edit_url'    => admin_url( 'admin.php?page=imgsentry-settings' ),
		);
	}

	/**
	 * Record or merge usage sources for an attachment in the database.
	 *
	 * @param int   $attachment_id Attachment ID.
	 * @param array $new_sources Array of structured source entry arrays.
	 */
	public static function add_attachment_usage_sources( $attachment_id, $new_sources = array(), $replace = false ) {
		global $wpdb;
		$attachment_id = (int) $attachment_id;
		if ( $attachment_id <= 0 ) {
			return;
		}
		if ( ! $replace && empty( $new_sources ) ) {
			return;
		}

		$table_name = self::get_table_name();
		$existing_sources = array();
		if ( ! $replace ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$row = $wpdb->get_row( $wpdb->prepare( "SELECT usage_sources FROM {$table_name} WHERE attachment_id = %d", $attachment_id ) );
			if ( $row && ! empty( $row->usage_sources ) ) {
				$decoded = json_decode( $row->usage_sources, true );
				if ( is_array( $decoded ) ) {
					$existing_sources = $decoded;
				}
			}
			$all_sources = array_merge( $existing_sources, $new_sources );
		} else {
			$all_sources = (array) $new_sources;
		}
		$deduped     = array();

		foreach ( $all_sources as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$post_id    = isset( $entry['post_id'] ) ? $entry['post_id'] : 'null';
			$field_type = isset( $entry['field_type'] ) ? $entry['field_type'] : 'unknown';
			$field_label= isset( $entry['field_label'] ) ? $entry['field_label'] : '';
			$key        = "{$post_id}_{$field_type}_{$field_label}";
			$deduped[ $key ] = $entry;
		}

		$merged_sources = array_values( $deduped );

		// Apply Exclusions (excludedFolders, excludedFiles)
		if ( self::is_attachment_path_excluded( $attachment_id ) ) {
			$merged_sources[] = array(
				'post_id'     => null,
				'post_title'  => 'Protected by Settings',
				'post_type'   => null,
				'field_type'  => 'exclusion_rule',
				'field_label' => 'Excluded Folder/File Pattern',
				'url'         => null,
				'edit_url'    => admin_url( 'admin.php?page=imgsentry-settings' ),
			);
		}

		// Apply Minimum File Age threshold
		$min_age_source = self::get_min_age_protection_source( $attachment_id );
		if ( null !== $min_age_source ) {
			$merged_sources[] = $min_age_source;
		}

		// Deduplicate and recompute count, status, hash based strictly on genuine usage
		$deduped_final   = array();
		$genuine_sources = array();
		foreach ( $merged_sources as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$post_id     = isset( $entry['post_id'] ) ? $entry['post_id'] : 'null';
			$field_type  = isset( $entry['field_type'] ) ? $entry['field_type'] : 'unknown';
			$field_label = isset( $entry['field_label'] ) ? $entry['field_label'] : '';
			$key         = "{$post_id}_{$field_type}_{$field_label}";
			$deduped_final[ $key ] = $entry;

			if ( 'exclusion_rule' !== $field_type && 'min_age_rule' !== $field_type ) {
				$genuine_sources[ $key ] = $entry;
			}
		}
		$merged_sources = array_values( $deduped_final );
		$count          = count( $genuine_sources );
		$status         = $count > 0 ? 'used' : 'unused';
		$hash           = md5( $attachment_id . '|' . $status . '|' . wp_json_encode( $merged_sources ) );

		$wpdb->replace(
			$table_name,
			array(
				'attachment_id'   => $attachment_id,
				'status'          => $status,
				'usage_sources'   => wp_json_encode( $merged_sources ),
				'usage_count'     => $count,
				'content_hash'    => $hash,
				'is_dirty'        => 0,
				'last_scanned_at' => current_time( 'mysql', true ),
			),
			array( '%d', '%s', '%s', '%d', '%s', '%d', '%s' )
		);
	}

	/**
	 * Default allow-list of meta keys known to store attachment IDs.
	 *
	 * @return array
	 */
	public static function get_default_indexable_meta_keys() {
		$base = array(
			'_thumbnail_id',
			'_product_image_gallery',
			'_elementor_data',
			'_fl_builder_data', // Beaver Builder
			'image',
			'gallery',
			'photo',
			'banner',
			'file',
			'logo',
			'thumbnail',
			'featured_image',
			'background_image',
			'header_image',
			'hero_image',
			'avatar',
		);

		// Keys the administrator added in Settings > Integrations (cached per request). The
		// imgsentry_indexable_meta_keys filter still runs on top of this list at every call site.
		if ( class_exists( 'ImgSentry_Integrations' ) ) {
			$custom = ImgSentry_Integrations::get_custom_meta_keys();
			if ( ! empty( $custom ) ) {
				$base = array_values( array_unique( array_merge( $base, $custom ) ) );
			}
		}

		return $base;
	}

	/**
	 * Helper: Extract attachment IDs from arbitrary meta value (int, string, array, serialized).
	 *
	 * @param mixed $value Meta value.
	 * @return array Array of attachment IDs.
	 */
	public static function extract_ids_from_meta_value( $value, $current_key = null ) {
		$ids = array();
		
		$allowlist = array( 'id', 'ID', 'attachment_id', 'photo', 'photo_id', 'image', 'src' );
		$denylist  = array( 'padding', 'margin', 'width', 'height', 'font_size', 'column', 'spacing', 'border_radius', 'opacity', 'z_index', 'color', 'size', 'length', 'top', 'bottom', 'left', 'right', 'duration', 'delay' );

		// Only grab naked numbers if the key is null (root level), numeric (flat array list like ACF gallery), or explicitly in the allowlist.
		$is_allowed_key = is_null( $current_key ) || is_numeric( $current_key ) || in_array( strtolower( (string) $current_key ), $allowlist, true );

		if ( is_numeric( $value ) && (int) $value > 0 ) {
			if ( $is_allowed_key ) {
				$ids[] = (int) $value;
			}
		} elseif ( is_string( $value ) ) {
			if ( is_serialized( $value ) ) {
				// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_unserialize, WordPress.PHP.NoSilencedErrors.Discouraged -- Only used with allowed_classes set to false. The filesystem call can fail on some hosts; the result is checked.
				$unserialized = @unserialize( $value, array( 'allowed_classes' => false ) );
				if ( false !== $unserialized ) {
					return self::extract_ids_from_meta_value( $unserialized, $current_key );
				}
			} elseif ( strpos( $value, ',' ) !== false && $is_allowed_key ) {
				$parts = explode( ',', $value );
				foreach ( $parts as $part ) {
					if ( is_numeric( trim( $part ) ) && (int) trim( $part ) > 0 ) {
						$ids[] = (int) trim( $part );
					}
				}
			}
		} elseif ( is_array( $value ) ) {
			foreach ( $value as $k => $v ) {
				if ( is_string( $k ) && in_array( strtolower( $k ), $denylist, true ) ) {
					continue;
				}
				$ids = array_merge( $ids, self::extract_ids_from_meta_value( $v, $k ) );
			}
		}
		return array_unique( array_filter( $ids ) );
	}

	/**
	 * Whether an attachment is referenced by any widget option (widget_*).
	 * Widget options are read once per request and indexed by attachment ID.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool
	 */
	private static function is_attachment_used_in_widgets( $attachment_id ) {
		static $widget_ids = null;
		if ( null === $widget_ids ) {
			global $wpdb;
			$widget_ids = array();
			$values     = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT option_value FROM {$wpdb->options} WHERE option_name LIKE %s",
					$wpdb->esc_like( 'widget_' ) . '%'
				)
			);
			foreach ( (array) $values as $blob ) {
				if ( ! is_string( $blob ) || '' === $blob ) {
					continue;
				}
				if ( preg_match_all( '/"attachment_id";i:(\d+);/', $blob, $m ) ) {
					foreach ( $m[1] as $found ) {
						$widget_ids[ (int) $found ] = true;
					}
				}
				if ( preg_match_all( '/wp-image-(\d+)/', $blob, $m ) ) {
					foreach ( $m[1] as $found ) {
						$widget_ids[ (int) $found ] = true;
					}
				}
				if ( preg_match_all( '/"(?:id|mediaId|imageId|attachmentId|attachment_id)":\s*(\d+)/', $blob, $m ) ) {
					foreach ( $m[1] as $found ) {
						$widget_ids[ (int) $found ] = true;
					}
				}
				if ( preg_match_all( '/"ids":\[([\d,\s]+)\]/', $blob, $m ) ) {
					foreach ( $m[1] as $list ) {
						foreach ( preg_split( '/\s*,\s*/', trim( $list ) ) as $found ) {
							$widget_ids[ (int) $found ] = true;
						}
					}
				}
				if ( preg_match_all( '/"ids";a:\d+:\{([^}]*)\}/', $blob, $m ) ) {
					foreach ( $m[1] as $list ) {
						if ( preg_match_all( '/i:(\d+);/', $list, $n ) ) {
							foreach ( $n[1] as $found ) {
								$widget_ids[ (int) $found ] = true;
							}
						}
					}
				}
			}
		}
		return isset( $widget_ids[ (int) $attachment_id ] );
	}

	/**
	 * ------------------------------------------------------------------------
	 * PART 3: TARGETED SINGLE ATTACHMENT USAGE DETECTION
	 * ------------------------------------------------------------------------
	 * Checks indexed sources and allowlisted meta keys for a single attachment.
	 *
	 * @param int $attachment_id Attachment Post ID.
	 * @return array Structured result containing is_used, status, sources, count, hash.
	 */
	public static function imgsentry_is_attachment_used( $attachment_id ) {
		global $wpdb;

		$attachment_id = (int) $attachment_id;
		if ( $attachment_id <= 0 ) {
			return array(
				'is_used' => false,
				'status'  => 'unused',
				'sources' => array(),
				'count'   => 0,
				'hash'    => '',
			);
		}

		// Retrieve all translation IDs for this attachment if translation plugin is active
		$target_attachment_ids = self::get_post_translation_ids( $attachment_id, 'attachment' );
		if ( empty( $target_attachment_ids ) ) {
			$target_attachment_ids = array( $attachment_id );
		}

		$sources = array();

		// 1. Featured Image (_thumbnail_id postmeta lookup via index)
		$att_placeholders = implode( ',', array_fill( 0, count( $target_attachment_ids ), '%d' ) );
		$featured_posts = $wpdb->get_results(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input. The placeholder list is built from the size of the array passed to prepare(), so it only holds %d or %s; the table name comes from $wpdb->prefix.
				"SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_thumbnail_id' AND meta_value IN ({$att_placeholders}) AND post_id NOT IN ({$att_placeholders})",
				array_merge( $target_attachment_ids, $target_attachment_ids )
			)
		);
		if ( ! empty( $featured_posts ) ) {
			foreach ( $featured_posts as $fp ) {
				$p_id      = (int) $fp->post_id;
				$p_type    = ucfirst( get_post_type( $p_id ) ? get_post_type( $p_id ) : 'post' );
				$sources[] = self::build_source_entry( $p_id, 'featured_image', sprintf( 'Featured Image in %s', $p_type ) );
			}
		}

		// 2. WooCommerce Product Gallery (_product_image_gallery)
		$wc_clauses = array();
		$wc_params  = array();
		foreach ( $target_attachment_ids as $t_id ) {
			$wc_clauses[] = "(meta_value = %s OR meta_value LIKE %s OR meta_value LIKE %s OR meta_value LIKE %s)";
			$wc_params[]  = (string) $t_id;
			$wc_params[]  = $t_id . ',%';
			$wc_params[]  = '%,' . $t_id . ',%';
			$wc_params[]  = '%,' . $t_id;
		}
		if ( ! empty( $wc_clauses ) ) {
			$wc_sql = "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_product_image_gallery' AND (" . implode( ' OR ', $wc_clauses ) . ")";
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$wc_galleries = $wpdb->get_results( $wpdb->prepare( $wc_sql, $wc_params ) );
			if ( ! empty( $wc_galleries ) ) {
				foreach ( $wc_galleries as $wc ) {
					$p_id      = (int) $wc->post_id;
					$sources[] = self::build_source_entry( $p_id, 'woocommerce_gallery', 'WooCommerce Product Gallery' );
				}
			}
		}

		// 3. Post Parent Attachment Relationship
		foreach ( $target_attachment_ids as $t_id ) {
			$post_parent = (int) $wpdb->get_var(
				$wpdb->prepare( "SELECT post_parent FROM {$wpdb->posts} WHERE ID = %d", $t_id )
			);
			if ( $post_parent > 0 ) {
				$parent_type = ucfirst( get_post_type( $post_parent ) ? get_post_type( $post_parent ) : 'post' );
				$sources[]   = self::build_source_entry( $post_parent, 'attached', sprintf( 'Attached to %s', $parent_type ) );
			}
		}

		// 4. Post Content Regex Search (wp-image-{id} and wp-att-{id}, plus Divi/WPBakery/Gutenberg blocks)
		// Run live content LIKE query ONLY for the original attachment ID to prevent performance multiplication
		$content_matches = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT ID, post_title, post_type, post_content FROM {$wpdb->posts} 
				 WHERE post_status IN ('publish', 'draft', 'pending', 'future', 'private') 
				   AND post_type NOT IN ('attachment', 'revision') 
				   AND (
				       post_content LIKE %s 
				    OR post_content LIKE %s
				    OR post_content LIKE %s
				    OR post_content LIKE %s
				   ) 
				 LIMIT 15",
				'%' . $wpdb->esc_like( 'wp-image-' . $attachment_id ) . '%',
				'%' . $wpdb->esc_like( 'wp-att-' . $attachment_id ) . '%',
				'%' . $wpdb->esc_like( 'image="' . $attachment_id . '"' ) . '%', // WPBakery
				'%' . $wpdb->esc_like( '"id":' . $attachment_id ) . '%' // Gutenberg blocks
			)
		);
		if ( ! empty( $content_matches ) ) {
			foreach ( $content_matches as $cm ) {
				$p_id    = (int) $cm->ID;
				$content = $cm->post_content;
				
				// Validate with proper boundaries using PHP regex to prevent substring false positives
				$is_match = false;
				if ( preg_match( '/wp-image-' . $attachment_id . '(?!\d)/', $content ) ) {
					$is_match = true;
				} elseif ( preg_match( '/wp-att-' . $attachment_id . '(?!\d)/', $content ) ) {
					$is_match = true;
				} elseif ( preg_match( '/image="' . $attachment_id . '"/', $content ) ) {
					$is_match = true;
				} elseif ( preg_match( '/"id":\s*' . $attachment_id . '(?!\d)/', $content ) ) {
					$is_match = true;
				}
				
				if ( $is_match ) {
					$p_type    = ucfirst( $cm->post_type ? $cm->post_type : 'post' );
					$sources[] = self::build_source_entry( $p_id, 'content', sprintf( 'Content of %s', $p_type ) );
				}
			}
		}

		// 4b. Sibling Translation IDs indexed lookup (fast indexed query without full-table LIKE scans)
		$sibling_ids = array_diff( $target_attachment_ids, array( $attachment_id ) );
		if ( ! empty( $sibling_ids ) ) {
			$table_name       = self::get_table_name();
			$sib_placeholders = implode( ',', array_fill( 0, count( $sibling_ids ), '%d' ) );
			$sibling_rows     = $wpdb->get_results(
				$wpdb->prepare(
					// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input. The placeholder list is built from the size of the array passed to prepare(), so it only holds %d or %s; the table name comes from $wpdb->prefix.
					"SELECT attachment_id, status, usage_sources FROM {$table_name} WHERE attachment_id IN ({$sib_placeholders})",
					$sibling_ids
				)
			);
			if ( ! empty( $sibling_rows ) ) {
				foreach ( $sibling_rows as $s_row ) {
					if ( ! empty( $s_row->usage_sources ) ) {
						$decoded = json_decode( $s_row->usage_sources, true );
						if ( is_array( $decoded ) ) {
							foreach ( $decoded as $src_entry ) {
								if ( is_array( $src_entry ) ) {
									$sources[] = $src_entry;
								}
							}
						}
					}
				}
			}
		}

		// 5. Elementor AST Data (_elementor_data)
		foreach ( $target_attachment_ids as $t_id ) {
			$elementor_matches = $wpdb->get_results(
				$wpdb->prepare(
					"SELECT pm.post_id, pm.meta_value 
					 FROM {$wpdb->postmeta} pm
					 INNER JOIN {$wpdb->posts} p ON pm.post_id = p.ID
					 WHERE pm.meta_key = '_elementor_data'
					   AND p.post_status IN ('publish', 'draft', 'pending', 'future', 'private')
					   AND p.post_type NOT IN ('attachment', 'revision')
					   AND (
					       pm.meta_value LIKE %s 
					    OR pm.meta_value LIKE %s
					   )
					 LIMIT 500",
					'%"id"%' . $wpdb->esc_like( (string) $t_id ) . '%',
					'%wp-image-' . $wpdb->esc_like( (string) $t_id ) . '%'
				)
			);
			if ( ! empty( $elementor_matches ) ) {
				foreach ( $elementor_matches as $em ) {
					$p_id = (int) $em->post_id;
					$data = json_decode( $em->meta_value, true );
					if ( is_array( $data ) && self::walk_elementor_ast( $data, $t_id, array() ) ) {
						$sources[] = self::build_source_entry( $p_id, 'elementor', 'Elementor Page/Template' );
					}
				}
			}
		}

		// 6. Explicit Allow-list Meta Keys / ACF Fields (Uses index on meta_key)
		$allowlist_keys     = apply_filters( 'imgsentry_indexable_meta_keys', self::get_default_indexable_meta_keys(), $attachment_id );
		$meta_keys_to_query = array_diff( $allowlist_keys, array( '_thumbnail_id', '_product_image_gallery', '_elementor_data' ) );

		if ( ! empty( $meta_keys_to_query ) ) {
			$placeholders = implode( ',', array_fill( 0, count( $meta_keys_to_query ), '%s' ) );
			foreach ( $target_attachment_ids as $t_id ) {
				$acf_query_params = array_merge(
					$meta_keys_to_query,
					array(
						(string) $t_id,
						'i:' . $t_id . ';%',
						'%"' . $t_id . '"%',
					)
				);

				$custom_meta = $wpdb->get_results(
					// phpcs:ignore WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber -- The number of placeholders is built from the size of the arrays passed to prepare().
					$wpdb->prepare(
						// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
						"SELECT post_id, meta_key FROM {$wpdb->postmeta} 
						 WHERE meta_key IN ({$placeholders}) 
						   AND (meta_value = %s OR meta_value LIKE %s OR meta_value LIKE %s) 
						 LIMIT 10",
						$acf_query_params
					)
				);
						// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				if ( ! empty( $custom_meta ) ) {
					foreach ( $custom_meta as $cm ) {
						$p_id      = (int) $cm->post_id;
						$sources[] = self::build_source_entry( $p_id, 'custom_meta', sprintf( 'Custom Meta Field (%s)', esc_html( $cm->meta_key ) ) );
					}
				}
			}
		}

		// 7. Theme Customizer & Options (Custom Logo, Site Icon, Header Image)
		foreach ( $target_attachment_ids as $t_id ) {
			$raw_custom_logo = get_theme_mod( 'custom_logo' );
			if ( ! empty( $raw_custom_logo ) && (int) $raw_custom_logo === $t_id ) {
				$sources[] = array(
					'post_id'     => null,
					'post_title'  => 'Custom Logo',
					'post_type'   => null,
					'field_type'  => 'theme_customizer',
					'field_label' => 'Theme Customizer: Custom Logo',
					'url'         => null,
					'edit_url'    => admin_url( 'customize.php' ),
				);
			}
			$raw_site_icon = get_option( 'site_icon' );
			if ( ! empty( $raw_site_icon ) && (int) $raw_site_icon === $t_id ) {
				$sources[] = array(
					'post_id'     => null,
					'post_title'  => 'Site Icon / Favicon',
					'post_type'   => null,
					'field_type'  => 'site_option',
					'field_label' => 'Site Settings: Site Icon / Favicon',
					'url'         => null,
					'edit_url'    => admin_url( 'options-general.php' ),
				);
			}
			$header_img = get_theme_mod( 'header_image' );
			if ( ! empty( $header_img ) && function_exists( 'attachment_url_to_postid' ) ) {
				$header_id = attachment_url_to_postid( $header_img );
				if ( ! empty( $header_id ) && (int) $header_id === $t_id ) {
					$sources[] = array(
						'post_id'     => null,
						'post_title'  => 'Header Image',
						'post_type'   => null,
						'field_type'  => 'theme_customizer',
						'field_label' => 'Theme Customizer: Header Image',
						'url'         => null,
						'edit_url'    => admin_url( 'customize.php' ),
					);
				}
			}
		}

		// 8. Widgets stored in wp_options (Media Image, Gallery, Text and Block widgets)
		foreach ( $target_attachment_ids as $t_id ) {
			if ( self::is_attachment_used_in_widgets( (int) $t_id ) ) {
				$sources[] = array(
					'post_id'     => null,
					'post_title'  => 'Sidebar / Widget Area',
					'post_type'   => null,
					'field_type'  => 'theme_customizer',
					'field_label' => 'Sidebar / Widget Area',
					'url'         => null,
					'edit_url'    => admin_url( 'widgets.php' ),
				);
				break;
			}
		}

		// Deduplicate sources by post_id + field_type + field_label
		$deduped = array();
		foreach ( $sources as $src ) {
			if ( is_array( $src ) ) {
				$pid = isset( $src['post_id'] ) ? $src['post_id'] : 'null';
				$ft  = isset( $src['field_type'] ) ? $src['field_type'] : 'unknown';
				$fl  = isset( $src['field_label'] ) ? $src['field_label'] : '';
				$key = "{$pid}_{$ft}_{$fl}";
				$deduped[ $key ] = $src;
			}
		}

		$sources = array_values( $deduped );

		// Apply Exclusions (excludedFolders, excludedFiles)
		if ( self::is_attachment_path_excluded( $attachment_id ) ) {
			$sources[] = array(
				'post_id'     => null,
				'post_title'  => 'Protected by Settings',
				'post_type'   => null,
				'field_type'  => 'exclusion_rule',
				'field_label' => 'Excluded Folder/File Pattern',
				'url'         => null,
				'edit_url'    => admin_url( 'admin.php?page=imgsentry-settings' ),
			);
		}

		// Apply Minimum File Age threshold
		$min_age_source = self::get_min_age_protection_source( $attachment_id );
		if ( null !== $min_age_source ) {
			$sources[] = $min_age_source;
		}

		// Deduplicate and recompute count, status, hash strictly based on genuine usage sources
		$deduped_final   = array();
		$genuine_sources = array();
		foreach ( $sources as $src ) {
			if ( is_array( $src ) ) {
				$pid = isset( $src['post_id'] ) ? $src['post_id'] : 'null';
				$ft  = isset( $src['field_type'] ) ? $src['field_type'] : 'unknown';
				$fl  = isset( $src['field_label'] ) ? $src['field_label'] : '';
				$key = "{$pid}_{$ft}_{$fl}";
				$deduped_final[ $key ] = $src;

				if ( 'exclusion_rule' !== $ft && 'min_age_rule' !== $ft ) {
					$genuine_sources[ $key ] = $src;
				}
			}
		}
		$sources = array_values( $deduped_final );
		$count   = count( $genuine_sources );
		$is_used = $count > 0;
		$status  = $is_used ? 'used' : 'unused';

		// Generate content hash based on detected sources
		$hash = md5( $attachment_id . '|' . $status . '|' . wp_json_encode( $sources ) );

		return array(
			'is_used' => $is_used,
			'status'  => $status,
			'sources' => $sources,
			'count'   => $count,
			'hash'    => $hash,
		);
	}

	/**
	 * Helper: Walk Elementor AST data recursively to locate attachment references.
	 *
	 * @param array $elements Elementor elements array.
	 * @param int   $attachment_id Attachment ID.
	 * @param array $filenames Optional filename list.
	 * @return bool
	 */
	private static function walk_elementor_ast( $elements, $attachment_id, $filenames = array() ) {
		if ( ! is_array( $elements ) ) {
			return false;
		}

		foreach ( $elements as $el ) {
			if ( ! is_array( $el ) ) {
				continue;
			}
			if ( ! empty( $el['settings'] ) && is_array( $el['settings'] ) ) {
				foreach ( $el['settings'] as $k => $v ) {
					if ( is_array( $v ) ) {
						// 1. Direct image setting object (e.g. 'image' => array('id' => 12, 'url' => '...'))
						if ( isset( $v['id'] ) && (int) $v['id'] === $attachment_id ) {
							if ( ! empty( $v['url'] ) || false !== strpos( $k, 'image' ) || false !== strpos( $k, 'media' ) || false !== strpos( $k, 'bg' ) || false !== strpos( $k, 'logo' ) || false !== strpos( $k, 'photo' ) || false !== strpos( $k, 'gallery' ) ) {
								return true;
							}
						}
						// 2. Repeater items or gallery arrays
						foreach ( $v as $item ) {
							if ( is_array( $item ) ) {
								if ( isset( $item['id'] ) && (int) $item['id'] === $attachment_id ) {
									if ( ! empty( $item['url'] ) || false !== strpos( $k, 'image' ) || false !== strpos( $k, 'gallery' ) || false !== strpos( $k, 'media' ) || false !== strpos( $k, 'slides' ) ) {
										return true;
									}
								}
								if ( isset( $item['image']['id'] ) && (int) $item['image']['id'] === $attachment_id ) {
									return true;
								}
							}
						}
					} elseif ( is_string( $v ) && false !== strpos( $v, 'wp-image-' . $attachment_id ) ) {
						return true;
					}
				}
			}
			if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
				if ( self::walk_elementor_ast( $el['elements'], $attachment_id, $filenames ) ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Update attachment usage record in custom table.
	 *
	 * @param int   $attachment_id Attachment Post ID.
	 * @param array $usage_data Output from imgsentry_is_attachment_used().
	 */
	public static function update_attachment_usage_record( $attachment_id, $usage_data = null ) {
		global $wpdb;

		if ( is_null( $usage_data ) ) {
			$usage_data = self::imgsentry_is_attachment_used( $attachment_id );
		}

		$table_name = self::get_table_name();

		$wpdb->replace(
			$table_name,
			array(
				'attachment_id'   => $attachment_id,
				'status'          => $usage_data['status'],
				'usage_sources'   => wp_json_encode( $usage_data['sources'] ),
				'usage_count'     => $usage_data['count'],
				'content_hash'    => $usage_data['hash'],
				'is_dirty'        => 0,
				'last_scanned_at' => current_time( 'mysql', true ),
			),
			array( '%d', '%s', '%s', '%d', '%s', '%d', '%s' )
		);

		// Duplicate-group results contain usage status: drop that cache (silently, once per request).
		if ( class_exists( 'ImgSentry_Duplicate_Finder' ) ) {
			ImgSentry_Duplicate_Finder::invalidate_cache( '', true );
		}
	}

	/**
	 * Normalize any stored or legacy scan type to 'smart' or 'full'.
	 * Legacy values: 'quick' becomes 'smart', 'deep' becomes 'full'.
	 *
	 * @param string $scan_type Raw scan type.
	 * @return string 'smart' or 'full'.
	 */
	public static function normalize_scan_type( $scan_type ) {
		$scan_type = strtolower( (string) $scan_type );
		return in_array( $scan_type, array( 'full', 'deep' ), true ) ? 'full' : 'smart';
	}

	/**
	 * Human readable scan label used in scan history and logs.
	 *
	 * @param string $scan_type Raw scan type.
	 * @return string
	 */
	public static function get_scan_type_label( $scan_type ) {
		return 'full' === self::normalize_scan_type( $scan_type ) ? 'Deep Scan' : 'Smart Scan';
	}

	/**
	 * Attachment IDs whose stored usage sources point at the given post.
	 *
	 * @param int $post_id Post ID.
	 * @return int[]
	 */
	private static function get_attachment_ids_sourced_by_post( $post_id ) {
		global $wpdb;
		$post_id = (int) $post_id;
		if ( $post_id <= 0 ) {
			return array();
		}
		$table_name = self::get_table_name();
		$like_a     = '%' . $wpdb->esc_like( '"post_id":' . $post_id . ',' ) . '%';
		$like_b     = '%' . $wpdb->esc_like( '"post_id":' . $post_id . '}' ) . '%';
		$like_c     = '%' . $wpdb->esc_like( '"post_id":"' . $post_id . '"' ) . '%';
		$ids        = $wpdb->get_col(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
				"SELECT attachment_id FROM {$table_name} WHERE usage_sources LIKE %s OR usage_sources LIKE %s OR usage_sources LIKE %s LIMIT 1000",
				$like_a,
				$like_b,
				$like_c
			)
		);
		return array_map( 'intval', (array) $ids );
	}

	/**
	 * Re-index a post after it changed AND queue every attachment it used before for a fresh check.
	 *
	 * index_post_for_attachments() only ADDS sources. Without this cleanup an image removed from a post
	 * would stay "used" until the next Full Scan. Queued attachments are re-checked live (replace mode).
	 *
	 * @param int $post_id Post ID.
	 */
	public static function reindex_post_with_cleanup( $post_id ) {
		$post_id = (int) $post_id;
		if ( $post_id <= 0 ) {
			return;
		}
		$previous_ids = self::get_attachment_ids_sourced_by_post( $post_id );
		self::index_post_for_attachments( $post_id );
		if ( ! empty( $previous_ids ) ) {
			self::mark_dirty( $previous_ids );
		}
	}

	/**
	 * Mark specific attachment IDs or all attachments as dirty.
	 *
	 * @param array|int|null $attachment_ids Single ID, array of IDs, or null for all.
	 */
	public static function mark_dirty( $attachment_ids = null ) {
		global $wpdb;

		$table_name = self::get_table_name();

		if ( is_null( $attachment_ids ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$wpdb->query( "UPDATE {$table_name} SET is_dirty = 1" );
			return;
		}

		if ( ! is_array( $attachment_ids ) ) {
			$attachment_ids = array( (int) $attachment_ids );
		}

		$attachment_ids = array_filter( array_map( 'intval', $attachment_ids ) );
		if ( empty( $attachment_ids ) ) {
			return;
		}

		$placeholders = implode( ',', array_fill( 0, count( $attachment_ids ), '%d' ) );
		$wpdb->query(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input. The placeholder list is built from the size of the array passed to prepare(), so it only holds %d or %s; the table name comes from $wpdb->prefix.
				"UPDATE {$table_name} SET is_dirty = 1 WHERE attachment_id IN ({$placeholders})",
				$attachment_ids
			)
		);

		// Trigger background worker if not scheduled
		if ( ! wp_next_scheduled( 'imgsentry_process_dirty_queue_event' ) ) {
			wp_schedule_single_event( time() + 5, 'imgsentry_process_dirty_queue_event' );
		}
	}

	/**
	 * ------------------------------------------------------------------------
	 * PART 4: WP HOOKS FOR INCREMENTAL INVALIDATION
	 * ------------------------------------------------------------------------
	 */

	/**
	 * Hook: save_post
	 */
	public function on_save_post( $post_id, $post, $update ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		if ( ! $post || 'attachment' === $post->post_type || 'revision' === $post->post_type ) {
			return;
		}

		self::reindex_post_with_cleanup( $post_id );
	}

	/**
	 * Hook: delete_attachment
	 */
	public function on_delete_attachment( $post_id ) {
		global $wpdb;
		$table_name = self::get_table_name();
		$wpdb->delete( $table_name, array( 'attachment_id' => (int) $post_id ), array( '%d' ) );
		delete_transient( 'imgsentry_dashboard_stats_cache' );
	}

	/**
	 * Hook: added_post_meta / updated_post_meta / deleted_post_meta
	 */
	public function on_post_meta_change( $meta_id, $object_id, $meta_key, $meta_value ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		$allowlist = apply_filters( 'imgsentry_indexable_meta_keys', self::get_default_indexable_meta_keys(), $object_id );
		if ( in_array( $meta_key, $allowlist, true ) ) {
			self::reindex_post_with_cleanup( (int) $object_id );
		}
	}

	/**
	 * Hook: elementor/document/after_save
	 */
	public function on_elementor_after_save( $document, $data ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		$post_id = $document->get_main_id();
		if ( $post_id > 0 ) {
			self::reindex_post_with_cleanup( (int) $post_id );
		}
	}

	/**
	 * Hook: woocommerce_update_product
	 */
	public function on_woocommerce_update_product( $product_id ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		if ( $product_id > 0 ) {
			self::reindex_post_with_cleanup( (int) $product_id );
		}
	}

	/**
	 * Hook: customize_save_after
	 */
	public function on_customize_save_after() {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		self::index_global_settings();
	}

	/**
	 * Hook: widget_update_callback
	 */
	public function on_widget_update( $instance, $new_instance, $old_instance, $widget ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return $instance;
		}
		if ( isset( $new_instance['attachment_id'] ) ) {
			self::add_attachment_usage_sources(
				(int) $new_instance['attachment_id'],
				array(
					array(
						'post_id'     => null,
						'post_title'  => 'Sidebar / Widget Area',
						'post_type'   => null,
						'field_type'  => 'theme_customizer',
						'field_label' => 'Sidebar / Widget Area',
						'url'         => null,
						'edit_url'    => admin_url( 'widgets.php' ),
					),
				)
			);
		}
		return $instance;
	}

	/**
	 * Hook: update_option_sidebars_widgets
	 */
	public function on_sidebars_widgets_update() {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		self::index_global_settings();
	}

	/**
	 * Extract attachment IDs from post HTML content.
	 */
	public static function extract_attachment_ids_from_content( $content ) {
		if ( empty( $content ) || ! is_string( $content ) ) {
			return array();
		}
		$ids = array();
		if ( preg_match_all( '/wp-image-(\d+)/', $content, $matches ) ) {
			$ids = array_merge( $ids, array_map( 'intval', $matches[1] ) );
		}
		if ( preg_match_all( '/wp-att-(\d+)/', $content, $matches ) ) {
			$ids = array_merge( $ids, array_map( 'intval', $matches[1] ) );
		}
		if ( preg_match_all( '/<!--\s*wp:(?:image|gallery|cover|media-text)[^>]*"id":\s*(\d+)/', $content, $matches ) ) {
			$ids = array_merge( $ids, array_map( 'intval', $matches[1] ) );
		}
		// WPBakery
		if ( preg_match_all( '/\[vc_[^\]]+image="(\d+)"/', $content, $matches ) ) {
			$ids = array_merge( $ids, array_map( 'intval', $matches[1] ) );
		}
		// Divi (or any other src attribute in shortcodes, e.g. et_pb_image src="..." )
		if ( preg_match_all( '/\[et_pb_[^\]]+src="([^"]+)"/', $content, $matches ) ) {
			foreach ( $matches[1] as $url ) {
				if ( function_exists( 'attachment_url_to_postid' ) ) {
					$id = attachment_url_to_postid( $url );
					if ( $id > 0 ) {
						$ids[] = $id;
					}
				}
			}
		}
		return array_unique( array_filter( $ids ) );
	}

	/**
	 * Extract attachment IDs from raw JSON string (e.g. Elementor data).
	 */
	public static function extract_attachment_ids_from_json( $json_str ) {
		if ( empty( $json_str ) || ! is_string( $json_str ) ) {
			return array();
		}
		$ids = array();

		$data = json_decode( $json_str, true );
		if ( is_array( $data ) ) {
			$extract_from_ast = function ( $elements ) use ( &$extract_from_ast, &$ids ) {
				if ( ! is_array( $elements ) ) {
					return;
				}
				foreach ( $elements as $el ) {
					if ( ! is_array( $el ) ) {
						continue;
					}
					if ( ! empty( $el['settings'] ) && is_array( $el['settings'] ) ) {
						foreach ( $el['settings'] as $k => $v ) {
							if ( is_array( $v ) ) {
								if ( isset( $v['id'] ) && is_numeric( $v['id'] ) && (int) $v['id'] > 0 ) {
									if ( ! empty( $v['url'] ) || false !== strpos( $k, 'image' ) || false !== strpos( $k, 'media' ) || false !== strpos( $k, 'bg' ) || false !== strpos( $k, 'logo' ) || false !== strpos( $k, 'photo' ) || false !== strpos( $k, 'gallery' ) ) {
										$ids[] = (int) $v['id'];
									}
								}
								foreach ( $v as $item ) {
									if ( is_array( $item ) ) {
										if ( isset( $item['id'] ) && is_numeric( $item['id'] ) && (int) $item['id'] > 0 ) {
											if ( ! empty( $item['url'] ) || false !== strpos( $k, 'image' ) || false !== strpos( $k, 'gallery' ) || false !== strpos( $k, 'media' ) || false !== strpos( $k, 'slides' ) ) {
												$ids[] = (int) $item['id'];
											}
										}
										if ( isset( $item['image']['id'] ) && is_numeric( $item['image']['id'] ) && (int) $item['image']['id'] > 0 ) {
											$ids[] = (int) $item['image']['id'];
										}
									}
								}
							} elseif ( is_string( $v ) ) {
								if ( preg_match_all( '/wp-image-(\d+)/', $v, $matches ) ) {
									foreach ( $matches[1] as $m_id ) {
										$ids[] = (int) $m_id;
									}
								}
							}
						}
					}
					if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
						$extract_from_ast( $el['elements'] );
					}
				}
			};
			$extract_from_ast( $data );
		} else {
			if ( preg_match_all( '/"image"[^}]*?"id":\s*(\d+)/s', $json_str, $matches ) ) {
				$ids = array_merge( $ids, array_map( 'intval', $matches[1] ) );
			}
			if ( preg_match_all( '/"url":\s*"[^"]+"[^}]*?"id":\s*(\d+)/s', $json_str, $matches ) ) {
				$ids = array_merge( $ids, array_map( 'intval', $matches[1] ) );
			}
			if ( preg_match_all( '/"id":\s*(\d+)[^}]*?"url":\s*"[^"]+"/s', $json_str, $matches ) ) {
				$ids = array_merge( $ids, array_map( 'intval', $matches[1] ) );
			}
		}

		return array_unique( array_filter( $ids ) );
	}

	/**
	 * Extract unique image file URLs pointing to the site's uploads directory.
	 *
	 * @param mixed $data Content string, array, or object.
	 * @return array Unique list of sanitized image URLs located in uploads.
	 */
	public static function extract_upload_image_urls( $data ) {
		if ( empty( $data ) ) {
			return array();
		}

		$text = '';
		if ( is_string( $data ) ) {
			$text = $data;
		} elseif ( is_array( $data ) || is_object( $data ) ) {
			$text = maybe_serialize( $data );
		}

		if ( empty( $text ) ) {
			return array();
		}

		// Normalize JSON-escaped slashes
		$text = str_replace( '\/', '/', $text );

		$upload_dir = wp_upload_dir();
		$base_url   = ! empty( $upload_dir['baseurl'] ) ? $upload_dir['baseurl'] : '';

		$urls = array();

		// Match URLs with common image extensions: jpg, jpeg, png, gif, webp, avif, svg
		if ( preg_match_all( '/https?:\/\/[^\s"\'<>\\\]+?\.(?:jpe?g|png|gif|webp|avif|svg)(?=[?\s"\'<>\\\]|$)/i', $text, $matches ) ) {
			foreach ( $matches[0] as $raw_url ) {
				$clean_url = stripslashes( trim( $raw_url ) );
				if ( empty( $clean_url ) ) {
					continue;
				}
				// Verify URL belongs to uploads directory
				if ( ( $base_url && 0 === strpos( $clean_url, $base_url ) ) || false !== strpos( $clean_url, '/wp-content/uploads/' ) ) {
					$urls[] = $clean_url;
				}
			}
		}

		return array_values( array_unique( $urls ) );
	}

	/**
	 * ------------------------------------------------------------------------
	 * PART 5: BACKGROUND FULL SCANS VIA WP CRON IN POST BATCHES
	 * ------------------------------------------------------------------------
	 */

	/**
	 * Start a background scan.
	 *
	 * Smart Scan: re-checks files that are new, not yet verified, currently unused, or not checked for a while.
	 * Full Scan: re-checks every file in the library.
	 * Both use the same per-attachment live check, so results are identical to the trash safety check.
	 *
	 * @param bool   $force      When a scan is already running: resume it instead of refusing.
	 * @param string $scan_type  'smart' or 'full' (legacy 'quick' / 'deep' are mapped).
	 * @param string $trigger    'manual', 'scheduled' or 'auto'.
	 * @return bool True when a scan is running after this call, false when one is already running.
	 */
	public static function start_background_scan( $force = false, $scan_type = 'full', $trigger = 'auto' ) {
		global $wpdb;

		$scan_type = self::normalize_scan_type( $scan_type );
		$trigger   = in_array( $trigger, array( 'manual', 'scheduled', 'auto' ), true ) ? $trigger : 'auto';

		$old_status = get_option( 'imgsentry_scan_status', array() );
		if ( ! is_array( $old_status ) ) {
			$old_status = array();
		}
		$lock_on     = 'yes' === get_option( 'imgsentry_scan_lock', 'no' );
		$lock_time   = (int) get_option( 'imgsentry_scan_lock_time', 0 );
		$lock_fresh  = $lock_on && ( time() - $lock_time ) < 300;
		$was_running = isset( $old_status['state'] ) && 'running' === $old_status['state'];

		if ( $lock_fresh && ! $force ) {
			return false; // A scan is already running.
		}
		if ( $force && $lock_on && $was_running && ! empty( $old_status['scan_id'] ) ) {
			return self::resume_scan( $old_status );
		}

		self::ensure_all_attachments_registered();
		$table_name = self::get_table_name();

		if ( 'full' === $scan_type ) {
			// Queue everything. Previous results stay visible until each file is re-checked (replace mode).
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$wpdb->query( "UPDATE {$table_name} SET is_dirty = 1" );
		} else {
			$stale_days = max( 1, (int) apply_filters( 'imgsentry_smart_scan_stale_days', 7 ) );
			$cutoff     = gmdate( 'Y-m-d H:i:s', time() - ( $stale_days * DAY_IN_SECONDS ) );
			$wpdb->query(
				$wpdb->prepare(
					// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
					"UPDATE {$table_name} SET is_dirty = 1 WHERE is_dirty = 0 AND ( status = 'unused' OR last_scanned_at IS NULL OR last_scanned_at < %s )",
					$cutoff
				)
			);
		}

		$counts  = self::get_scan_progress_counts();
		$queued  = (int) $counts['dirty'];
		$scan_id = wp_generate_password( 12, false );

		update_option( 'imgsentry_scan_lock', 'yes' );
		update_option( 'imgsentry_scan_lock_time', time() );
		update_option( 'imgsentry_scan_in_progress', 'yes' );
		update_option(
			'imgsentry_scan_status',
			array(
				'state'         => 'running',
				'scan_id'       => $scan_id,
				'scan_type'     => $scan_type,
				'trigger'       => $trigger,
				'queued'        => $queued,
				'processed'     => 0,
				'total'         => $queued,
				'empty_batches' => 0,
				'started_at'    => current_time( 'mysql', true ),
				'started_ts'    => time(),
				'last_batch_at' => current_time( 'mysql', true ),
			)
		);
		delete_transient( 'imgsentry_dashboard_stats_cache' );

		if ( $queued > 0 ) {
			wp_schedule_single_event( time(), 'imgsentry_process_background_batch', array( $scan_id ) );
		} else {
			self::finalize_scan();
		}

		return true;
	}

	/**
	 * Resume a running scan that stopped making progress.
	 * The attachment at the front of the queue is parked as "not verified" so it cannot block the scan again.
	 * A later Smart Scan re-checks it.
	 *
	 * @param array $status Current scan status.
	 * @return bool
	 */
	private static function resume_scan( $status ) {
		global $wpdb;
		$table_name = self::get_table_name();

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$front_id = (int) $wpdb->get_var( "SELECT attachment_id FROM {$table_name} WHERE is_dirty = 1 ORDER BY attachment_id ASC LIMIT 1" );
		if ( $front_id > 0 ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$wpdb->query( $wpdb->prepare( "UPDATE {$table_name} SET is_dirty = 0, last_scanned_at = NULL WHERE attachment_id = %d", $front_id ) );
			if ( class_exists( 'ImgSentry_Logger' ) ) {
				ImgSentry_Logger::warning(
					'Scan resumed',
					array(
						'type'    => 'Scan',
						'source'  => 'Media Scanner',
						'details' => sprintf( 'Scan resumed after a stall. Attachment ID %d was skipped and will be checked again by the next Smart Scan.', $front_id ),
					)
				);
			}
		}

		$status['empty_batches'] = 0;
		$status['last_batch_at'] = current_time( 'mysql', true );
		update_option( 'imgsentry_scan_status', $status );
		update_option( 'imgsentry_scan_lock_time', time() );
		wp_schedule_single_event( time(), 'imgsentry_process_background_batch', array( (string) $status['scan_id'] ) );

		return true;
	}

	/**
	 * Ensure all WP attachments exist in custom table.
	 */
	public static function ensure_all_attachments_registered() {
		global $wpdb;
		$table_name = self::get_table_name();
		$mime_filter = self::get_allowed_mime_types_sql_clause();

		$wpdb->query(
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
			"INSERT IGNORE INTO {$table_name} (attachment_id, status, is_dirty)
			 SELECT ID, 'unused', 1 FROM {$wpdb->posts} 
			 WHERE post_type = 'attachment' AND post_status = 'inherit'{$mime_filter}"
		);
			// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		if ( ! empty( $mime_filter ) ) {
			$wpdb->query(
				// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
				"DELETE u FROM {$table_name} u 
				 LEFT JOIN {$wpdb->posts} p ON u.attachment_id = p.ID 
				 WHERE p.ID IS NULL OR (p.post_type = 'attachment' AND NOT (1=1{$mime_filter}))"
			);
				// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		}
	}

	/**
	 * Background scan worker (WP-Cron). Checks queued attachments with the live per-attachment check,
	 * then finishes the scan once nothing is left in the queue.
	 *
	 * @param string $scan_id Scan this event belongs to. Events of an older scan are ignored.
	 */
	public function process_background_batch_scan( $scan_id = '' ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}

		$status = get_option( 'imgsentry_scan_status', array() );
		if ( ! is_array( $status ) || empty( $status['state'] ) || 'running' !== $status['state'] ) {
			return;
		}
		$current_id = isset( $status['scan_id'] ) ? (string) $status['scan_id'] : '';
		if ( '' !== (string) $scan_id && '' !== $current_id && (string) $scan_id !== $current_id ) {
			return; // Event of an older scan.
		}

		update_option( 'imgsentry_scan_lock_time', time() );

		$batch_size = max( 1, (int) apply_filters( 'imgsentry_scan_cron_batch_size', 500 ) );
		$done       = $this->process_dirty_queue( $batch_size, false );
		$counts     = self::get_scan_progress_counts();

		$status = get_option( 'imgsentry_scan_status', array() );
		if ( ! is_array( $status ) || empty( $status['state'] ) || 'running' !== $status['state'] ) {
			return; // Finished by a concurrent request.
		}
		$status['last_batch_at'] = current_time( 'mysql', true );
		$status['empty_batches'] = $done > 0 ? 0 : ( isset( $status['empty_batches'] ) ? (int) $status['empty_batches'] : 0 ) + 1;
		update_option( 'imgsentry_scan_status', $status );

		if ( $counts['dirty'] > 0 ) {
			if ( (int) $status['empty_batches'] < 3 ) {
				wp_schedule_single_event( time() + 1, 'imgsentry_process_background_batch', array( $current_id ) );
			}
			return;
		}

		self::finalize_scan();
	}

	/**
	 * Finish the scan when no queued attachment is left. Safe to call from any request.
	 *
	 * @return bool True when this call finished the scan.
	 */
	public static function maybe_finalize_scan() {
		$status = get_option( 'imgsentry_scan_status', array() );
		if ( ! is_array( $status ) || empty( $status['state'] ) || 'running' !== $status['state'] ) {
			return false;
		}
		$counts = self::get_scan_progress_counts();
		if ( $counts['dirty'] > 0 ) {
			return false;
		}
		return self::finalize_scan();
	}

	/**
	 * Mark the running scan as completed, release locks, write scan history and notify listeners.
	 *
	 * @return bool
	 */
	public static function finalize_scan() {
		$status = get_option( 'imgsentry_scan_status', array() );
		if ( ! is_array( $status ) || empty( $status['state'] ) || 'running' !== $status['state'] ) {
			return false;
		}

		$scan_id = isset( $status['scan_id'] ) ? (string) $status['scan_id'] : 'legacy';
		$guard   = 'imgsentry_finalize_' . $scan_id;
		if ( ! add_option( $guard, time(), '', 'no' ) ) {
			return false; // Another request is already finishing this scan.
		}

		$counts     = self::get_scan_progress_counts();
		$started_ts = isset( $status['started_ts'] ) ? (int) $status['started_ts'] : time();
		$duration   = max( 1, time() - $started_ts );
		$queued     = isset( $status['queued'] ) ? (int) $status['queued'] : (int) $counts['total'];

		$status['state']       = 'completed';
		$status['finished_at'] = current_time( 'mysql', true );
		$status['processed']   = (int) $counts['total'];
		$status['total']       = (int) $counts['total'];
		update_option( 'imgsentry_scan_status', $status );

		update_option( 'imgsentry_scan_lock', 'no' );
		update_option( 'imgsentry_scan_in_progress', 'no' );
		delete_transient( 'imgsentry_dashboard_stats_cache' );

		$stats = self::get_dashboard_stats( true );
		$entry = self::record_scan_history( $status, $stats, $queued, $duration );

		$status['history_id'] = $entry['id'];
		update_option( 'imgsentry_scan_status', $status );

		if ( class_exists( 'ImgSentry_Logger' ) ) {
			$trigger = isset( $status['trigger'] ) ? $status['trigger'] : 'manual';
			ImgSentry_Logger::success(
				sprintf( '%s completed', $entry['scanType'] ),
				array(
					'type'    => 'Scan',
					'source'  => 'scheduled' === $trigger ? 'Scheduled Scan' : ( 'auto' === $trigger ? 'Auto Scan' : 'Media Scanner' ),
					'details' => sprintf(
						'Checked %s files in %ds. Library: %s used, %s unused (%s).',
						number_format_i18n( $queued ),
						$duration,
						number_format_i18n( $entry['usedCount'] ),
						number_format_i18n( $entry['unusedCount'] ),
						$entry['formattedUnusedSize']
					),
				)
			);
		}

		/**
		 * Fires after a scan finished.
		 *
		 * @param array $status Final scan status (scan_id, scan_type, trigger, history_id ...).
		 * @param array $entry  Scan history entry that was written.
		 */
		do_action( 'imgsentry_scan_completed', $status, $entry );

		delete_option( $guard );
		return true;
	}

	/**
	 * Write one entry to the scan history option (newest first, max 100).
	 *
	 * @param array $status   Final scan status.
	 * @param array $stats    Dashboard stats after the scan.
	 * @param int   $checked  Number of files this scan checked.
	 * @param int   $duration Duration in seconds.
	 * @return array The stored entry.
	 */
	private static function record_scan_history( $status, $stats, $checked, $duration ) {
		global $wpdb;
		$table_name = self::get_table_name();

		$sizes = $wpdb->get_row(
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
			"SELECT
				SUM( CASE WHEN u.status = 'unused' THEN CAST( pm.meta_value AS UNSIGNED ) ELSE 0 END ) AS unused_bytes,
				SUM( CASE WHEN u.status = 'used' THEN CAST( pm.meta_value AS UNSIGNED ) ELSE 0 END ) AS used_bytes
			 FROM {$table_name} u
			 INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
			 INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_filesize'
			 WHERE p.post_type = 'attachment' AND p.post_status = 'inherit'
			   AND u.is_dirty = 0 AND u.last_scanned_at IS NOT NULL"
		);
			// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$unused_bytes = $sizes && $sizes->unused_bytes ? (int) $sizes->unused_bytes : 0;
		$used_bytes   = $sizes && $sizes->used_bytes ? (int) $sizes->used_bytes : 0;

		$trigger = isset( $status['trigger'] ) ? (string) $status['trigger'] : 'manual';
		$entry   = array(
			'id'                  => 'scan-' . time() . '-' . wp_generate_password( 4, false ),
			'timestamp'           => gmdate( 'Y-m-d\TH:i:s\Z' ),
			'formattedDate'       => current_time( 'M j, Y g:i A' ),
			'scanType'            => self::get_scan_type_label( isset( $status['scan_type'] ) ? $status['scan_type'] : 'smart' ),
			'totalScanned'        => (int) $checked,
			'unusedCount'         => isset( $stats['unused_count'] ) ? (int) $stats['unused_count'] : 0,
			'deletedCount'        => 0,
			'unusedSizeBytes'     => $unused_bytes,
			'formattedUnusedSize' => size_format( $unused_bytes, 2 ) ? size_format( $unused_bytes, 2 ) : '0 B',
			'usedCount'           => isset( $stats['used_count'] ) ? (int) $stats['used_count'] : 0,
			'usedSizeBytes'       => $used_bytes,
			'formattedUsedSize'   => size_format( $used_bytes, 2 ) ? size_format( $used_bytes, 2 ) : '0 B',
			'durationSeconds'     => (int) $duration,
			'status'              => 'completed',
			'isManual'            => 'manual' === $trigger,
			'triggered_by'        => $trigger,
		);

		$history = get_option( 'imgsentry_scan_history', array() );
		if ( ! is_array( $history ) ) {
			$history = array();
		}
		array_unshift( $history, $entry );
		if ( count( $history ) > 100 ) {
			$history = array_slice( $history, 0, 100 );
		}
		update_option( 'imgsentry_scan_history', $history );

		return $entry;
	}

	/**
	 * Update fields of one scan history entry (used after scheduled auto-trash).
	 *
	 * @param string $entry_id Entry ID.
	 * @param array  $fields   Fields to overwrite.
	 */
	public static function update_scan_history_entry( $entry_id, $fields ) {
		$history = get_option( 'imgsentry_scan_history', array() );
		if ( ! is_array( $history ) || empty( $entry_id ) ) {
			return;
		}
		foreach ( $history as $i => $row ) {
			if ( is_array( $row ) && isset( $row['id'] ) && (string) $row['id'] === (string) $entry_id ) {
				$history[ $i ] = array_merge( $row, (array) $fields );
				update_option( 'imgsentry_scan_history', $history );
				return;
			}
		}
	}

	/**
	 * Automatically register and mark new attachments as dirty for background scan.
	 */
	public function on_attachment_added( $attachment_id ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		if ( get_post_type( $attachment_id ) !== 'attachment' ) {
			return;
		}
		global $wpdb;
		$table_name = self::get_table_name();
		$wpdb->query( $wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			"INSERT IGNORE INTO {$table_name} (attachment_id, status, is_dirty) VALUES (%d, 'unused', 1)",
			$attachment_id
		) );
		if ( ! wp_next_scheduled( 'imgsentry_process_dirty_queue_event' ) ) {
			wp_schedule_single_event( time() + 5, 'imgsentry_process_dirty_queue_event' );
		}
	}

	/**
	 * Process queued dirty attachments or posts incrementally.
	 *
	 * @param int  $limit      Max items to process.
	 * @param bool $reschedule Schedule a follow-up event when more dirty rows remain.
	 */
	public function process_dirty_queue( $limit = 20, $reschedule = true ) {
		if ( ! self::is_usage_tracking_enabled() ) {
			return 0;
		}
		global $wpdb;

		$start_time = microtime( true );
		$table_name = self::get_table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$dirty_ids  = $wpdb->get_col( $wpdb->prepare( "SELECT attachment_id FROM {$table_name} WHERE is_dirty = 1 ORDER BY attachment_id ASC LIMIT %d", $limit ) );

		if ( empty( $dirty_ids ) ) {
			return 0;
		}

		$processed_count = 0;
		foreach ( $dirty_ids as $attachment_id ) {
			if ( ( microtime( true ) - $start_time ) >= 20.0 ) {
				break;
			}
			try {
				$usage = self::imgsentry_is_attachment_used( $attachment_id );
				self::add_attachment_usage_sources( $attachment_id, $usage['sources'], true );
			} catch ( \Throwable $e ) {
				// Never let one broken attachment block the whole queue: park it as "not verified".
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
				$wpdb->query( $wpdb->prepare( "UPDATE {$table_name} SET is_dirty = 0, last_scanned_at = NULL WHERE attachment_id = %d", (int) $attachment_id ) );
				if ( class_exists( 'ImgSentry_Logger' ) ) {
					ImgSentry_Logger::warning(
						'Attachment skipped during scan',
						array(
							'type'    => 'Scan',
							'source'  => 'Scanner Engine',
							'details' => sprintf( 'Attachment ID %d could not be checked: %s', (int) $attachment_id, $e->getMessage() ),
						)
					);
				}
			}
			$processed_count++;
		}

		if ( $reschedule && $processed_count > 0 && self::is_usage_tracking_enabled() ) {
			global $wpdb;
			$table_name = self::get_table_name();
			$has_dirty = (int) $wpdb->get_var(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
				"SELECT 1 FROM {$table_name} u
				 INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
				 WHERE u.is_dirty = 1 AND p.post_type = 'attachment' AND p.post_status = 'inherit'
				 LIMIT 1"
			);
			if ( $has_dirty && ! wp_next_scheduled( 'imgsentry_process_dirty_queue_event' ) ) {
				wp_schedule_single_event( time() + 5, 'imgsentry_process_dirty_queue_event' );
			}
		}

		return $processed_count;
	}

	/**
	 * Auto-process dirty attachments asynchronously on plugin admin dashboard load.
	 * Strictly scoped to imgsentry plugin admin pages.
	 */
	public function maybe_auto_process_dirty_attachments() {
		if ( ! self::is_usage_tracking_enabled() ) {
			return;
		}
		if ( ! is_admin() ) {
			return;
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page parameter used for routing; nothing is changed.
		$page = isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : '';
		if ( empty( $page ) || 0 !== strpos( $page, 'imgsentry' ) ) {
			return;
		}

		global $wpdb;
		$table_name  = self::get_table_name();
		$dirty_count = (int) $wpdb->get_var(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			"SELECT COUNT(*) FROM {$table_name} u
			 INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
			 WHERE u.is_dirty = 1 AND p.post_type = 'attachment' AND p.post_status = 'inherit'"
		);

		if ( $dirty_count > 0 && 'yes' !== get_option( 'imgsentry_scan_lock', 'no' ) ) {
			if ( ! wp_next_scheduled( 'imgsentry_process_dirty_queue_event' ) ) {
				wp_schedule_single_event( time() + 2, 'imgsentry_process_dirty_queue_event' );
			}
		}
	}

	/**
	 * Get total count of attachments in WP library.
	 */
	public static function get_total_attachment_count() {
		global $wpdb;
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_status = 'inherit'" );
	}

	/**
	 * Get live progress counts directly from the usage table.
	 *
	 * @return array { total: int, processed: int, dirty: int }
	 */
	public static function get_scan_progress_counts() {
		global $wpdb;
		$table_name = self::get_table_name();
		$row = $wpdb->get_row(
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
			"SELECT 
				COUNT(*) AS total,
				SUM(CASE WHEN u.is_dirty = 0 THEN 1 ELSE 0 END) AS processed,
				SUM(CASE WHEN u.is_dirty = 1 THEN 1 ELSE 0 END) AS dirty
			 FROM {$table_name} u
			 INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
			 WHERE p.post_type = 'attachment' AND p.post_status = 'inherit'"
		);
			// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		return array(
			'total'     => $row ? (int) $row->total : 0,
			'processed' => $row ? (int) $row->processed : 0,
			'dirty'     => $row ? (int) $row->dirty : 0,
		);
	}

	/**
	 * ------------------------------------------------------------------------
	 * PART 6: DASHBOARD QUERY & AUTO-TRIGGER
	 * ------------------------------------------------------------------------
	 * Reads ONLY from custom status table joined with live wp_posts.
	 * Supports optional force_refresh parameter. When false, reuses any existing
	 * cached 'dashboard_stats' inside 'imgsentry_dashboard_stats_cache'.
	 *
	 * @param bool $force_refresh Set true to bypass cache and recalculate.
	 * @return array Fast stats payload for dashboard.
	 */
	public static function get_dashboard_stats( $force_refresh = false ) {
		if ( ! $force_refresh ) {
			$cached = get_transient( 'imgsentry_dashboard_stats_cache' );
			if ( is_array( $cached ) && isset( $cached['dashboard_stats'] ) && is_array( $cached['dashboard_stats'] ) ) {
				return $cached['dashboard_stats'];
			}
		}

		global $wpdb;

		$table_name = self::get_table_name();

		// Make sure all attachments are registered in table first
		self::ensure_all_attachments_registered();

		$raw_stats = $wpdb->get_row(
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
			"SELECT 
				COUNT(*) AS total_attachments,
				SUM(CASE WHEN u.status = 'used' THEN 1 ELSE 0 END) AS used_count,
				SUM(CASE WHEN u.status = 'unused' AND u.is_dirty = 0 AND u.last_scanned_at IS NOT NULL THEN 1 ELSE 0 END) AS unused_count,
				SUM(CASE WHEN u.status = 'unused' AND (u.is_dirty = 1 OR u.last_scanned_at IS NULL) THEN 1 ELSE 0 END) AS unverified_count,
				SUM(CASE WHEN u.is_dirty = 1 THEN 1 ELSE 0 END) AS dirty_count,
				MAX(u.last_scanned_at) AS last_scanned_at
			 FROM {$table_name} u
			 INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
			 WHERE p.post_type = 'attachment' AND p.post_status = 'inherit'"
		);
			// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		$total     = $raw_stats ? (int) $raw_stats->total_attachments : 0;
		$used      = $raw_stats ? (int) $raw_stats->used_count : 0;
		$unused    = $raw_stats ? (int) $raw_stats->unused_count : 0;
		$dirty     = $raw_stats ? (int) $raw_stats->dirty_count : 0;
		$unverified = $raw_stats ? (int) $raw_stats->unverified_count : 0;
		$last_scan = $raw_stats ? $raw_stats->last_scanned_at : null;

		$last_scan_utc = null;
		if ( ! empty( $last_scan ) ) {
			$ts = strtotime( $last_scan . ' UTC' );
			if ( $ts ) {
				$last_scan_utc = gmdate( 'Y-m-d\TH:i:s\Z', $ts );
			}
		}

		$scan_indicator = __( 'Never scanned', 'imgsentry' );
		if ( ! empty( $last_scan ) ) {
			$timestamp = strtotime( $last_scan . ' UTC' );
			if ( $timestamp ) {
				/* translators: %s: how long ago the last scan ran, e.g. 2 hours */
				$scan_indicator = sprintf( __( 'Last scanned %s ago', 'imgsentry' ), human_time_diff( $timestamp, time() ) );
			}
		}

		$scan_status = get_option( 'imgsentry_scan_status', array() );
		$is_running  = isset( $scan_status['state'] ) && 'running' === $scan_status['state'];

		return array(
			'total_attachments'  => $total,
			'used_count'         => $used,
			'unused_count'       => $unused,
			'dirty_count'        => $dirty,
			'unverified_count'   => $unverified,
			'last_scanned_at'    => $last_scan_utc,
			'last_scan_human'    => $scan_indicator,
			'is_scan_running'    => $is_running,
			'used_percentage'    => $total > 0 ? round( ( $used / $total ) * 100, 1 ) : 0,
			'unused_percentage'  => $total > 0 ? round( ( $unused / $total ) * 100, 1 ) : 0,
		);
	}

	/**
	 * ------------------------------------------------------------------------
	 * PART 7: AUTOMATIC ORPHAN DATA RECONCILIATION
	 * ------------------------------------------------------------------------
	 * Deletes orphaned records from imgsentry_attachment_usage in bounded batches.
	 *
	 * @param int $limit Max rows to delete per batch (default 500).
	 * @return int Number of deleted orphaned rows.
	 */
	public static function reconcile_orphaned_rows( $limit = 500 ) {
		global $wpdb;

		$settings   = get_option( 'imgsentry_settings', array() );
		$defaults   = ImgSentry_Settings::instance()->get_defaults();
		$settings   = wp_parse_args( $settings, $defaults );
		$batch_size = 50;

		$table_name = self::get_table_name();
		$limit      = $batch_size;

		// Query orphaned IDs bounded by LIMIT (never unbounded)
		$orphaned_ids = $wpdb->get_col(
			$wpdb->prepare(
				// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
				"SELECT u.attachment_id 
				 FROM {$table_name} u 
				 LEFT JOIN {$wpdb->posts} p ON u.attachment_id = p.ID 
				 WHERE p.ID IS NULL 
				 LIMIT %d",
				$limit
			)
		);
				// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		if ( empty( $orphaned_ids ) ) {
			return 0;
		}

		$placeholders = implode( ',', array_fill( 0, count( $orphaned_ids ), '%d' ) );
		$deleted = $wpdb->query(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input. The placeholder list is built from the size of the array passed to prepare(), so it only holds %d or %s; the table name comes from $wpdb->prefix.
				"DELETE FROM {$table_name} WHERE attachment_id IN ({$placeholders})",
				$orphaned_ids
			)
		);

		$deleted_count = false !== $deleted ? (int) $deleted : 0;

		// If ImgSentry_Logger exists, log a single summary entry if 1+ rows were found and removed
		if ( $deleted_count > 0 && class_exists( 'ImgSentry_Logger' ) ) {
			ImgSentry_Logger::warning(
				sprintf( 'Orphan reconciliation cleaned %d orphaned usage record(s)', $deleted_count ),
				array(
					'type'       => 'System',
					'source'     => 'System',
					'details'    => sprintf( 'Removed %d orphaned attachment records from %s table with no matching posts.', $deleted_count, $table_name ),
					'user_login' => defined( 'DOING_CRON' ) && DOING_CRON ? 'system_cron' : 'system',
				)
			);
		}

		// If batch deleted exactly/up to the limit, schedule follow-up WP-Cron to continue in chunks
		if ( count( $orphaned_ids ) >= $limit ) {
			$pause_seconds = 1;
			wp_schedule_single_event( time() + $pause_seconds, 'imgsentry_reconcile_orphans_batch' );
		}

		return $deleted_count;
	}

	/**
	 * One-time upgrade routine to fix cached false-positives from older versions.
	 */
	public function maybe_run_v1_false_positive_cleanup() {
		if ( get_option( 'imgsentry_v1_false_positive_cleanup_run' ) ) {
			return;
		}

		global $wpdb;
		$table_name = self::get_table_name();

		// Check if table exists before running (in case plugin is just being installed)
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		if ( $wpdb->get_var( "SHOW TABLES LIKE '{$table_name}'" ) !== $table_name ) {
			return;
		}

		$wpdb->query(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			"UPDATE {$table_name} 
			 SET is_dirty = 1 
			 WHERE status = 'used' AND (usage_sources LIKE '%Content of%' OR usage_sources LIKE '%Custom Meta Field%')"
		);

		update_option( 'imgsentry_v1_false_positive_cleanup_run', 1 );
	}

	/**
	 * Fast usage lookup for one or more attachment IDs against custom usage table.
	 *
	 * @param array|int $attachment_ids Single ID or array of attachment IDs.
	 * @param bool      $force_live     Whether to force a live usage recheck bypassing indexed data.
	 * @return array {
	 *    items: array of [
	 *       'attachment_id' => int,
	 *       'filename'      => string,
	 *       'title'         => string,
	 *       'is_used'       => bool,
	 *       'usage_count'   => int,
	 *       'locations'     => array of [ 'title' => string, 'type' => string, 'label' => string, 'display' => string, 'edit_url' => string|null ],
	 *       'last_scanned_at' => string|null
	 *    ],
	 *    last_scan_time: string|null,
	 *    last_scan_formatted: string,
	 *    total_checked: int,
	 *    used_count: int,
	 *    unused_count: int
	 * }
	 */
	public static function check_attachments_usage( $attachment_ids, $force_live = false ) {
		global $wpdb;

		if ( ! is_array( $attachment_ids ) ) {
			$attachment_ids = array( $attachment_ids );
		}
		$attachment_ids = array_values( array_unique( array_filter( array_map( 'intval', $attachment_ids ) ) ) );

		if ( empty( $attachment_ids ) ) {
			return array(
				'items'               => array(),
				'last_scan_time'      => null,
				'last_scan_formatted' => __( 'Never scanned', 'imgsentry' ),
				'total_checked'       => 0,
				'used_count'          => 0,
				'unused_count'        => 0,
			);
		}

		$table_name = self::get_table_name();
		$placeholders = implode( ',', array_fill( 0, count( $attachment_ids ), '%d' ) );

		$query = "SELECT u.attachment_id, u.status, u.usage_sources, u.usage_count, u.is_dirty, u.last_scanned_at, p.post_title, p.guid 
		          FROM {$table_name} u 
		          LEFT JOIN {$wpdb->posts} p ON u.attachment_id = p.ID 
		          WHERE u.attachment_id IN ({$placeholders})";

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$rows = $wpdb->get_results( $wpdb->prepare( $query, $attachment_ids ) );
		$row_map = array();
		if ( ! empty( $rows ) ) {
			foreach ( $rows as $row ) {
				$row_map[ (int) $row->attachment_id ] = $row;
			}
		}

		// Also get the latest global scan timestamp for context
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$latest_scan_raw = $wpdb->get_var( "SELECT MAX(last_scanned_at) FROM {$table_name}" );
		$last_scan_utc = null;
		$last_scan_formatted = __( 'Never scanned', 'imgsentry' );

		if ( ! empty( $latest_scan_raw ) ) {
			$ts = strtotime( $latest_scan_raw . ' UTC' );
			if ( $ts ) {
				$last_scan_utc = gmdate( 'Y-m-d\TH:i:s\Z', $ts );
				$last_scan_formatted = date_i18n( get_option( 'date_format', 'M j, Y' ), $ts );
			}
		}

		$items        = array();
		$used_count   = 0;
		$unused_count = 0;

		foreach ( $attachment_ids as $att_id ) {
			$row      = isset( $row_map[ $att_id ] ) ? $row_map[ $att_id ] : null;
			$is_fresh = ( $row && ! empty( $row->last_scanned_at ) && (int) $row->is_dirty === 0 );

			// Only run expensive live check if forcing live recheck OR item is missing from index or flagged dirty
			if ( $force_live || ! $is_fresh ) {
				// Perform live check
				$fresh_check = self::imgsentry_is_attachment_used( $att_id );
				// Persist fresh results
				self::add_attachment_usage_sources( $att_id, $fresh_check['sources'], true );

				// Also persist to translated media sibling IDs if any translation plugin is active
				$plugin = self::get_active_translation_plugin();
				if ( null !== $plugin ) {
					$sibling_att_ids = self::get_post_translation_ids( $att_id, 'attachment' );
					foreach ( $sibling_att_ids as $sib_id ) {
						if ( $sib_id !== $att_id ) {
							self::add_attachment_usage_sources( $sib_id, $fresh_check['sources'], true );
						}
					}
				}

				// Retrieve the freshly persisted row from DB
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
				$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table_name} WHERE attachment_id = %d", $att_id ) );
			}

			$post = get_post( $att_id );
			$title = $post ? ( $post->post_title ? $post->post_title : "Media #{$att_id}" ) : "Media #{$att_id}";
			$filename = $post ? basename( get_attached_file( $att_id ) ? get_attached_file( $att_id ) : ( $post->guid ? $post->guid : "file-{$att_id}" ) ) : "file-{$att_id}";

			$sources_raw = ( $row && ! empty( $row->usage_sources ) ) ? json_decode( $row->usage_sources, true ) : array();
			if ( ! is_array( $sources_raw ) ) {
				$sources_raw = array();
			}

			// Format locations nicely: post title + type (e.g. "Homepage Banner (Page)", "Summer Sale (Elementor Section)")
			$locations = array();
			foreach ( $sources_raw as $src ) {
				if ( ! is_array( $src ) ) {
					continue;
				}

				$loc_title = ! empty( $src['post_title'] ) ? $src['post_title'] : ( ! empty( $src['field_label'] ) ? $src['field_label'] : 'Content' );
				$post_type = ! empty( $src['post_type'] ) ? $src['post_type'] : '';
				$field_type = ! empty( $src['field_type'] ) ? $src['field_type'] : '';

				$type_display = 'Page';
				if ( 'elementor' === $field_type || false !== strpos( strtolower( $post_type ), 'elementor' ) ) {
					$type_display = 'Elementor Section';
				} elseif ( 'woocommerce_gallery' === $field_type || 'product' === strtolower( $post_type ) ) {
					$type_display = 'WooCommerce Product';
				} elseif ( 'theme_customizer' === $field_type || 'site_option' === $field_type ) {
					$type_display = 'Theme Setting';
				} elseif ( 'featured_image' === $field_type ) {
					$type_display = ! empty( $post_type ) ? ucfirst( $post_type ) . ' (Featured Image)' : 'Featured Image';
				} elseif ( ! empty( $post_type ) ) {
					$type_display = ucfirst( $post_type );
				}

				$display_label = sprintf( '%s (%s)', $loc_title, $type_display );

				$locations[] = array(
					'post_id'     => isset( $src['post_id'] ) ? (int) $src['post_id'] : null,
					'title'       => $loc_title,
					'type'        => $type_display,
					'field_type'  => $field_type,
					'field_label' => ! empty( $src['field_label'] ) ? $src['field_label'] : '',
					'display'     => $display_label,
					'edit_url'    => ! empty( $src['edit_url'] ) ? $src['edit_url'] : null,
				);
			}

			// Determine if marked as used
			$is_used = false;
			if ( $row ) {
				$is_used = ( 'used' === $row->status || ! empty( $locations ) || (int) $row->usage_count > 0 );
			}

			if ( $is_used ) {
				$used_count++;
			} else {
				$unused_count++;
			}

			$item_last_scanned = null;
			if ( $row && ! empty( $row->last_scanned_at ) ) {
				$item_ts = strtotime( $row->last_scanned_at . ' UTC' );
				if ( $item_ts ) {
					$item_last_scanned = gmdate( 'Y-m-d\TH:i:s\Z', $item_ts );
				}
			}

			$items[] = array(
				'attachment_id'   => $att_id,
				'title'           => $title,
				'filename'        => $filename,
				'is_used'         => $is_used,
				'usage_count'     => count( $locations ),
				'locations'       => $locations,
				'last_scanned_at' => $item_last_scanned ? $item_last_scanned : $last_scan_utc,
			);
		}

		return array(
			'items'               => $items,
			'last_scan_time'      => $last_scan_utc,
			'last_scan_formatted' => $last_scan_formatted,
			'total_checked'       => count($items),
			'used_count'          => $used_count,
			'unused_count'        => $unused_count,
		);
	}

	/**
	 * Query database for distinct file extensions/mime types present in the media library,
	 * filtered by usage status ('used' or 'unused'), with counts for each file type option.
	 * Includes a performance time budget to prevent slow responses on large media libraries.
	 *
	 * @param string $status 'used' or 'unused'
	 * @return array Array containing 'options' and 'calculation_incomplete' flag.
	 */
	public static function get_distinct_file_types( $status = 'unused' ) {
		self::ensure_all_attachments_registered();
		global $wpdb;

		$status     = in_array( $status, array( 'used', 'unused' ), true ) ? $status : 'unused';
		$table_name = self::get_table_name();

		$sql = "SELECT p.post_mime_type, pm_file.meta_value AS attached_file, (SELECT pm_fmt.meta_value FROM {$wpdb->postmeta} pm_fmt WHERE pm_fmt.post_id = p.ID AND pm_fmt.meta_key = '_imgsentry_output_format' LIMIT 1) AS output_format
				FROM {$table_name} u
				INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
				LEFT JOIN {$wpdb->postmeta} pm_file ON u.attachment_id = pm_file.post_id AND pm_file.meta_key = '_wp_attached_file'
				WHERE u.status = %s AND p.post_type = 'attachment' AND p.post_status = 'inherit'";

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $status ) );

		if ( empty( $rows ) ) {
			return array(
				'options'                => array(),
				'calculation_incomplete' => false,
			);
		}

		$image_types = array( 'jpg', 'png', 'webp', 'svg', 'gif', 'avif' );
		$media_types = array( 'mp4', 'webm', 'mp3', 'wav', 'ogg', 'mov', 'm4a', 'flac', 'aac', 'avi', 'mkv' );
		$doc_types   = array( 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt' );

		$ext_counts             = array();
		$start_time             = microtime( true );
		$max_exec               = (int) ini_get( 'max_execution_time' );
		$time_budget            = ( $max_exec > 0 && $max_exec < 30 ) ? ( $max_exec * 0.7 ) : 3.0;
		$calculation_incomplete = false;

		foreach ( $rows as $row ) {
			if ( ( microtime( true ) - $start_time ) > $time_budget ) {
				$calculation_incomplete = true;
				break;
			}

			$ext          = '';
			$file_ext     = ! empty( $row->attached_file ) ? strtolower( pathinfo( $row->attached_file, PATHINFO_EXTENSION ) ) : '';
			$mime         = ! empty( $row->post_mime_type ) ? strtolower( trim( $row->post_mime_type ) ) : '';

			// 1. Check primary MIME type first to align with build_usage_where_clause filter logic
			if ( 'application/pdf' === $mime ) {
				$ext = 'pdf';
			} elseif ( false !== strpos( $mime, 'image/jpeg' ) || false !== strpos( $mime, 'image/pjpeg' ) ) {
				$ext = 'jpg';
			} elseif ( false !== strpos( $mime, 'image/png' ) ) {
				$ext = 'png';
			} elseif ( false !== strpos( $mime, 'image/webp' ) ) {
				$ext = 'webp';
			} elseif ( false !== strpos( $mime, 'image/svg' ) ) {
				$ext = 'svg';
			} elseif ( false !== strpos( $mime, 'image/gif' ) ) {
				$ext = 'gif';
			} elseif ( false !== strpos( $mime, 'image/avif' ) ) {
				$ext = 'avif';
			} elseif ( ! empty( $mime ) && false !== strpos( $mime, '/' ) ) {
				$parts = explode( '/', $mime );
				$subtype = isset( $parts[1] ) ? $parts[1] : '';
				if ( 'x-msdownload' === $subtype ) $ext = 'exe';
				elseif ( 'plain' === $subtype ) $ext = 'txt';
				elseif ( 'mpeg' === $subtype ) $ext = 'mp3';
				elseif ( 'quicktime' === $subtype ) $ext = 'mov';
				elseif ( 'x-matroska' === $subtype ) $ext = 'mkv';
				elseif ( ! empty( $file_ext ) ) $ext = $file_ext;
				else $ext = $subtype;
			}

			// 2. Fall back to attached_file path extension if MIME was generic/empty
			if ( empty( $ext ) && ! empty( $file_ext ) ) {
				$ext = $file_ext;
			}

			// Normalize jpeg to canonical jpg bucket
			if ( 'jpeg' === $ext ) {
				$ext = 'jpg';
			}

			$fmt         = strtolower( trim( (string) ( isset( $row->output_format ) ? $row->output_format : '' ) ) );
			$is_nextgen  = in_array( $fmt, array( 'webp', 'avif', 'both' ), true );
			$buckets     = array();
			if ( ! empty( $ext ) ) {
				// Same rule as the jpg/png filter: optimized jpg/png files are NOT counted as jpg/png.
				if ( ! ( $is_nextgen && in_array( $ext, array( 'jpg', 'png' ), true ) ) ) {
					$buckets[ $ext ] = true;
				}
			}
			if ( in_array( $fmt, array( 'webp', 'both' ), true ) ) { $buckets['webp'] = true; }
			if ( in_array( $fmt, array( 'avif', 'both' ), true ) ) { $buckets['avif'] = true; }
			foreach ( array_keys( $buckets ) as $bucket ) {
				if ( ! isset( $ext_counts[ $bucket ] ) ) { $ext_counts[ $bucket ] = 0; }
				$ext_counts[ $bucket ]++;
			}
		}

		$images = array();
		$media  = array();
		$docs   = array();
		$others = array();

		foreach ( $ext_counts as $ext => $count ) {
			if ( in_array( $ext, $image_types, true ) ) {
				$images[ $ext ] = $count;
			} elseif ( in_array( $ext, $media_types, true ) ) {
				$media[ $ext ] = $count;
			} elseif ( in_array( $ext, $doc_types, true ) ) {
				$docs[ $ext ] = $count;
			} else {
				$others[ $ext ] = $count;
			}
		}

		ksort( $images );
		ksort( $media );
		ksort( $docs );
		ksort( $others );

		$options = array();

		// Images group
		foreach ( $images as $ext => $count ) {
			$label = ( 'jpg' === $ext ) ? 'JPG/JPEG (.jpg, .jpeg)' : strtoupper( $ext ) . ' (.' . $ext . ')';
			$options[] = array(
				'value' => $ext,
				'label' => $label,
				'group' => 'Images',
				'count' => $count,
			);
		}

		// Media group
		if ( ! empty( $media ) ) {
			$total_media_count = array_sum( $media );
			$options[] = array(
				'value' => 'media',
				'label' => 'All Media (Audio/Video)',
				'group' => 'Media',
				'count' => $total_media_count,
			);
			foreach ( $media as $ext => $count ) {
				$options[] = array(
					'value' => $ext,
					'label' => strtoupper( $ext ) . ' (.' . $ext . ')',
					'group' => 'Media',
					'count' => $count,
				);
			}
		}

		// Documents group
		if ( ! empty( $docs ) ) {
			$total_doc_count = array_sum( $docs );
			$options[] = array(
				'value' => 'documents',
				'label' => 'All Documents',
				'group' => 'Documents',
				'count' => $total_doc_count,
			);
			foreach ( $docs as $ext => $count ) {
				$options[] = array(
					'value' => $ext,
					'label' => strtoupper( $ext ) . ' (.' . $ext . ')',
					'group' => 'Documents',
					'count' => $count,
				);
			}
		}

		// Other Files group
		if ( ! empty( $others ) ) {
			$total_other_count = array_sum( $others );
			$options[] = array(
				'value' => 'other_files',
				'label' => 'All Other Files',
				'group' => 'Other Files',
				'count' => $total_other_count,
			);
			foreach ( $others as $ext => $count ) {
				$options[] = array(
					'value' => $ext,
					'label' => strtoupper( $ext ) . ' (.' . $ext . ')',
					'group' => 'Other Files',
					'count' => $count,
				);
			}
		}

		return array(
			'options'                => $options,
			'calculation_incomplete' => $calculation_incomplete,
		);
	}

	/**
	 * Get Distinct Locations (upload subfolder paths) for Used/Unused tab filter dropdowns.
	 *
	 * @param string $status 'used' or 'unused'.
	 * @return array Array containing 'options' and 'calculation_incomplete'.
	 */
	public static function get_distinct_locations( $status = 'unused' ) {
		global $wpdb;

		$status     = in_array( $status, array( 'used', 'unused' ), true ) ? $status : 'unused';
		$table_name = self::get_table_name();

		$sql = "SELECT pm_file.meta_value AS attached_file
				FROM {$table_name} u
				INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
				LEFT JOIN {$wpdb->postmeta} pm_file ON u.attachment_id = pm_file.post_id AND pm_file.meta_key = '_wp_attached_file'
				WHERE u.status = %s AND p.post_type = 'attachment' AND p.post_status = 'inherit'";

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $status ) );

		if ( empty( $rows ) ) {
			return array(
				'options'                => array(),
				'calculation_incomplete' => false,
			);
		}

		$folder_counts          = array();
		$start_time             = microtime( true );
		$max_exec               = (int) ini_get( 'max_execution_time' );
		$time_budget            = ( $max_exec > 0 && $max_exec < 30 ) ? ( $max_exec * 0.7 ) : 3.0;
		$calculation_incomplete = false;

		foreach ( $rows as $row ) {
			if ( ( microtime( true ) - $start_time ) > $time_budget ) {
				$calculation_incomplete = true;
				break;
			}

			if ( empty( $row->attached_file ) ) {
				continue;
			}

			$file = trim( $row->attached_file );
			$file = str_replace( '\\', '/', $file );
			$file = str_replace( 'wp-content/uploads/', '', ltrim( $file, '/' ) );

			$dir = dirname( $file );
			if ( '.' === $dir || '/' === $dir || '\\' === $dir ) {
				$dir = '';
			}
			$dir = trim( $dir, '/' );

			$folder_key = ! empty( $dir ) ? $dir : 'Root';

			if ( ! isset( $folder_counts[ $folder_key ] ) ) {
				$folder_counts[ $folder_key ] = 0;
			}
			$folder_counts[ $folder_key ]++;
		}

		ksort( $folder_counts );

		$options = array();
		foreach ( $folder_counts as $folder => $count ) {
			$value = ( 'Root' === $folder ) ? 'root' : $folder;
			$label = ( 'Root' === $folder ) ? 'Root (uploads/)' : $folder;
			$options[] = array(
				'value' => $value,
				'label' => $label,
				'count' => $count,
			);
		}

		return array(
			'options'                => $options,
			'calculation_incomplete' => $calculation_incomplete,
		);
	}

	/**
	 * Get Distinct Month/Year Upload Dates for Used/Unused tab filter dropdowns.
	 *
	 * @param string $status 'used' or 'unused'.
	 * @return array Array containing 'options' and 'calculation_incomplete'.
	 */
	public static function get_distinct_dates( $status = 'unused' ) {
		global $wpdb;

		$status     = in_array( $status, array( 'used', 'unused' ), true ) ? $status : 'unused';
		$table_name = self::get_table_name();

		$sql = "SELECT p.post_date
				FROM {$table_name} u
				INNER JOIN {$wpdb->posts} p ON u.attachment_id = p.ID
				WHERE u.status = %s AND p.post_type = 'attachment' AND p.post_status = 'inherit'";

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $status ) );

		if ( empty( $rows ) ) {
			return array(
				'options'                => array(),
				'calculation_incomplete' => false,
			);
		}

		$date_counts            = array();
		$start_time             = microtime( true );
		$max_exec               = (int) ini_get( 'max_execution_time' );
		$time_budget            = ( $max_exec > 0 && $max_exec < 30 ) ? ( $max_exec * 0.7 ) : 3.0;
		$calculation_incomplete = false;

		foreach ( $rows as $row ) {
			if ( ( microtime( true ) - $start_time ) > $time_budget ) {
				$calculation_incomplete = true;
				break;
			}

			if ( empty( $row->post_date ) || '0000-00-00 00:00:00' === $row->post_date ) {
				continue;
			}

			$ym = substr( $row->post_date, 0, 7 );
			if ( ! preg_match( '/^\d{4}-\d{2}$/', $ym ) ) {
				continue;
			}

			if ( ! isset( $date_counts[ $ym ] ) ) {
				$date_counts[ $ym ] = 0;
			}
			$date_counts[ $ym ]++;
		}

		krsort( $date_counts );

		$options = array();
		foreach ( $date_counts as $ym => $count ) {
			$timestamp = strtotime( $ym . '-01' );
			$label     = $timestamp ? gmdate( 'F Y', $timestamp ) : $ym;

			$options[] = array(
				'value' => $ym,
				'label' => $label,
				'count' => $count,
			);
		}

		return array(
			'options'                => $options,
			'calculation_incomplete' => $calculation_incomplete,
		);
	}
}

// Initialize Singleton
add_action( 'plugins_loaded', array( 'ImgSentry_Usage_Indexer', 'get_instance' ) );