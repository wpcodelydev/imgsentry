<?php
/**
 * Database-Backed Central Logger Class for ImgSentry.
 *
 * Provides structured, queryable, database-persisted event auditing,
 * performance tracking, error telemetry, retention pruning, and export capabilities.
 *
 * @package ImgSentry
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

class ImgSentry_Logger {

	/**
	 * Log levels.
	 */
	const LEVEL_INFO     = 'Info';
	const LEVEL_SUCCESS  = 'Success';
	const LEVEL_WARNING  = 'Warning';
	const LEVEL_ERROR    = 'Error';
	const LEVEL_CRITICAL = 'Critical';

	/**
	 * Get the full logs table name with database prefix.
	 *
	 * @return string
	 */
	public static function get_table_name() {
		global $wpdb;
		return $wpdb->prefix . 'imgsentry_logs';
	}

	/**
	 * Create or upgrade the custom database table schema using dbDelta.
	 *
	 * @return void
	 */
	public static function create_table() {
		global $wpdb;

		$table_name      = self::get_table_name();
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table_name} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			timestamp datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			level varchar(20) NOT NULL DEFAULT 'Info',
			type varchar(50) NOT NULL DEFAULT 'System',
			source varchar(100) NOT NULL DEFAULT 'System',
			message text NOT NULL,
			details longtext NULL,
			user_id bigint(20) unsigned DEFAULT 0,
			user_login varchar(60) NOT NULL DEFAULT 'system',
			user_ip varchar(45) NOT NULL DEFAULT '',
			object_id bigint(20) unsigned DEFAULT 0,
			PRIMARY KEY  (id),
			KEY level (level),
			KEY type (type),
			KEY source (source),
			KEY timestamp (timestamp),
			KEY user_login (user_login),
			KEY object_id (object_id)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	/**
	 * Ensure table exists on demand.
	 *
	 * @return bool
	 */
	public static function ensure_table_exists() {
		global $wpdb;
		$table_name = self::get_table_name();
		$exists     = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table_name ) );
		if ( $exists !== $table_name ) {
			self::create_table();
			return true;
		}
		return false;
	}

	/**
	 * Sanitize log level string to standard TitleCase format.
	 *
	 * @param string $level Raw level string.
	 * @return string Normalized level string.
	 */
	public static function normalize_level( $level ) {
		$l = strtolower( trim( (string) $level ) );
		switch ( $l ) {
			case 'success':
				return self::LEVEL_SUCCESS;
			case 'warning':
			case 'warn':
				return self::LEVEL_WARNING;
			case 'error':
			case 'err':
				return self::LEVEL_ERROR;
			case 'critical':
			case 'crit':
			case 'fatal':
				return self::LEVEL_CRITICAL;
			case 'info':
			default:
				return self::LEVEL_INFO;
		}
	}

	/**
	 * Check if a log level is allowed to be logged based on the configured log level.
	 *
	 * @param string $level Normalized log level.
	 * @return bool True if logging is allowed, false otherwise.
	 */
	public static function is_log_level_allowed( $level ) {
		$settings = get_option( 'imgsentry_settings', array() );
		if ( class_exists( 'ImgSentry_Settings' ) ) {
			$defaults = ImgSentry_Settings::instance()->get_defaults();
			$settings = wp_parse_args( $settings, $defaults );
		}
		$config_level = isset( $settings['logLevel'] ) ? strtolower( $settings['logLevel'] ) : 'info';

		// If configured level is 'error', only 'Error' and 'Critical' are logged.
		if ( 'error' === $config_level ) {
			return in_array( $level, array( self::LEVEL_ERROR, self::LEVEL_CRITICAL ), true );
		}

		// If configured level is 'info', we log 'Info', 'Success', 'Warning', 'Error', and 'Critical'.
		if ( 'info' === $config_level ) {
			return in_array( $level, array( self::LEVEL_INFO, self::LEVEL_SUCCESS, self::LEVEL_WARNING, self::LEVEL_ERROR, self::LEVEL_CRITICAL ), true );
		}

		// If 'debug', log absolutely everything.
		return true;
	}

	/**
	 * Sanitize and normalize log type.
	 *
	 * @param string $type
	 * @return string
	 */
	public static function normalize_type( $type ) {
		$t = strtolower( trim( (string) $type ) );
		switch ( $t ) {
			case 'scan':
			case 'scanner':
				return 'Scan';
			case 'delete':
			case 'trash':
			case 'purge':
				return 'Delete';
			case 'optimize':
			case 'optimization':
				return 'Optimize';
			case 'file':
			case 'files':
				return 'File';
			case 'login':
			case 'auth':
				return 'Login';
			case 'settings':
			case 'config':
				return 'Settings';
			case 'duplicate':
			case 'duplicates':
				return 'Duplicate';
			case 'reference':
			case 'references':
				return 'Reference';
			case 'restore':
				return 'Restore';
			case 'system':
			default:
				return ! empty( $type ) ? ucfirst( $t ) : 'System';
		}
	}

	/**
	 * Get client IP address safely.
	 *
	 * REMOTE_ADDR is the only value a visitor cannot forge, so it is the default. Forwarded headers
	 * (X-Forwarded-For, CF-Connecting-IP, Client-IP) are client-controlled and are only honoured when the
	 * site owner opts in, e.g. when the site sits behind a trusted reverse proxy / CDN:
	 * add_filter( 'imgsentry_trust_proxy_headers', '__return_true' );
	 *
	 * @return string
	 */
	public static function get_client_ip() {
		$ip = '';
		if ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );
		}

		if ( apply_filters( 'imgsentry_trust_proxy_headers', false ) ) {
			foreach ( array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP' ) as $header ) {
				if ( empty( $_SERVER[ $header ] ) ) {
					continue;
				}
				$raw       = sanitize_text_field( wp_unslash( $_SERVER[ $header ] ) );
				$parts     = explode( ',', $raw );
				$candidate = trim( $parts[0] );
				if ( filter_var( $candidate, FILTER_VALIDATE_IP ) ) {
					$ip = $candidate;
					break;
				}
			}
		}

		$validated = filter_var( $ip, FILTER_VALIDATE_IP );
		return $validated ? $validated : '127.0.0.1';
	}

	/**
	 * Insert a log record into {$wpdb->prefix}imgsentry_logs.
	 *
	 * @param string       $level   Level (Info, Success, Warning, Error, Critical).
	 * @param string       $message Primary short summary message (boldText).
	 * @param array|string $args    Additional fields (type, source, details, object_id, user_id, user_login, user_ip, timestamp).
	 * @return int|false Inserted ID on success, false on failure.
	 */
	public static function log( $level, $message, $args = array() ) {
		global $wpdb;

		if ( empty( $message ) ) {
			return false;
		}

		if ( is_string( $args ) ) {
			$args = array( 'details' => $args );
		} elseif ( ! is_array( $args ) ) {
			$args = array();
		}

		$level = self::normalize_level( $level );
		if ( ! self::is_log_level_allowed( $level ) ) {
			return false;
		}
		$type  = isset( $args['type'] ) ? self::normalize_type( $args['type'] ) : 'System';

		$source = ! empty( $args['source'] ) ? sanitize_text_field( $args['source'] ) : 'System';

		// Format details (subText or structured JSON/array)
		$details = '';
		if ( isset( $args['details'] ) ) {
			if ( is_array( $args['details'] ) || is_object( $args['details'] ) ) {
				$details = wp_json_encode( $args['details'] );
			} else {
				$details = (string) $args['details'];
			}
		} elseif ( isset( $args['subText'] ) ) {
			$details = (string) $args['subText'];
		}

		// Resolve user details
		$user_id    = 0;
		$user_login = 'system';

		if ( isset( $args['user_login'] ) && is_string( $args['user_login'] ) ) {
			$user_login = sanitize_user( $args['user_login'] );
			if ( isset( $args['user_id'] ) ) {
				$user_id = absint( $args['user_id'] );
			}
		} elseif ( function_exists( 'wp_get_current_user' ) ) {
			$current_user = wp_get_current_user();
			if ( $current_user && $current_user->exists() ) {
				$user_id    = (int) $current_user->ID;
				$user_login = $current_user->user_login;
			} elseif ( defined( 'DOING_CRON' ) && DOING_CRON ) {
				$user_login = 'system_cron';
			}
		}

		$user_ip   = ! empty( $args['user_ip'] ) ? sanitize_text_field( $args['user_ip'] ) : self::get_client_ip();
		$object_id = isset( $args['object_id'] ) ? absint( $args['object_id'] ) : 0;
		$timestamp = ! empty( $args['timestamp'] ) ? sanitize_text_field( $args['timestamp'] ) : current_time( 'mysql' );

		$table_name = self::get_table_name();

		$data = array(
			'timestamp'  => $timestamp,
			'level'      => $level,
			'type'       => $type,
			'source'     => $source,
			'message'    => sanitize_text_field( $message ),
			'details'    => $details,
			'user_id'    => $user_id,
			'user_login' => $user_login,
			'user_ip'    => $user_ip,
			'object_id'  => $object_id,
		);

		$format = array( '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%d' );

		$inserted = $wpdb->insert( $table_name, $data, $format );

		if ( false === $inserted ) {
			// Auto-heal table if missing
			self::create_table();
			$inserted = $wpdb->insert( $table_name, $data, $format );
		}

		return $inserted ? (int) $wpdb->insert_id : false;
	}

	/**
	 * Convenience helpers.
	 */
	public static function info( $message, $args = array() ) {
		return self::log( self::LEVEL_INFO, $message, $args );
	}

	public static function success( $message, $args = array() ) {
		return self::log( self::LEVEL_SUCCESS, $message, $args );
	}

	public static function warning( $message, $args = array() ) {
		return self::log( self::LEVEL_WARNING, $message, $args );
	}

	public static function error( $message, $args = array() ) {
		return self::log( self::LEVEL_ERROR, $message, $args );
	}

	public static function critical( $message, $args = array() ) {
		return self::log( self::LEVEL_CRITICAL, $message, $args );
	}

	/**
	 * Deprecated legacy audit log sync.
	 */
	private static function sync_legacy_audit_log( $timestamp, $user_login, $action, $details ) {
		// Deprecated: stopped writing to imgsentry_audit_log option to prevent database bloat.
		return;
	}

	/**
	 * Format DB record to frontend LogItem schema.
	 *
	 * @param object|array $row Database row.
	 * @return array
	 */
	public static function format_log_item( $row ) {
		$r = (object) $row;

		$level = self::normalize_level( $r->level );

		// Determine Tailwind badge classes
		switch ( $level ) {
			case self::LEVEL_SUCCESS:
				$level_bg = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
				break;
			case self::LEVEL_WARNING:
				$level_bg = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
				break;
			case self::LEVEL_ERROR:
				$level_bg = 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
				break;
			case self::LEVEL_CRITICAL:
				$level_bg = 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300';
				break;
			case self::LEVEL_INFO:
			default:
				$level_bg = 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
				break;
		}

		$raw_details = isset( $r->details ) ? $r->details : '';
		$sub_text    = $raw_details;

		// Clean up subtext if it's stored as JSON
		if ( ! empty( $raw_details ) && is_string( $raw_details ) && ( '{' === $raw_details[0] || '[' === $raw_details[0] ) ) {
			$decoded = json_decode( $raw_details, true );
			if ( json_last_error() === JSON_ERROR_NONE && is_array( $decoded ) ) {
				if ( ! empty( $decoded['summary'] ) ) {
					$sub_text = $decoded['summary'];
					if ( ! empty( $decoded['items'] ) && is_array( $decoded['items'] ) ) {
						$file_list = array();
						foreach ( array_slice( $decoded['items'], 0, 5 ) as $it ) {
							if ( is_array( $it ) ) {
								$file_list[] = ! empty( $it['filename'] ) ? $it['filename'] : ( ! empty( $it['title'] ) ? $it['title'] : ( isset( $it['id'] ) ? '#' . $it['id'] : '' ) );
							} elseif ( is_scalar( $it ) ) {
								$file_list[] = (string) $it;
							}
						}
						$file_list = array_filter( $file_list );
						if ( ! empty( $file_list ) ) {
							$sub_text .= ' Files: ' . implode( ', ', $file_list ) . ( count( $decoded['items'] ) > 5 ? ' (+' . ( count( $decoded['items'] ) - 5 ) . ' more)' : '' );
						}
					}
				} else {
					$parts = array();
					foreach ( $decoded as $k => $v ) {
						if ( is_scalar( $v ) ) {
							$parts[] = "{$k}: {$v}";
						} elseif ( is_array( $v ) ) {
							$parts[] = "{$k}: " . count( $v ) . ' items';
						}
					}
					$sub_text = implode( ' | ', $parts );
				}
			}
		}

		// Format friendly timestamp (e.g. May 24, 2024 10:30:15 AM).
		// Stored values are already in the site's local time (current_time( 'mysql' )), so they are
		// formatted as-is. Converting them again (strtotime + wp_date) would shift them by the site's UTC offset.
		$formatted_time = mysql2date( 'M j, Y h:i:s A', $r->timestamp, false );
		if ( false === $formatted_time || '' === $formatted_time ) {
			$formatted_time = (string) $r->timestamp;
		}

		return array(
			'id'          => 'log-' . $r->id,
			'raw_id'      => (int) $r->id,
			'time'        => $formatted_time,
			'raw_time'    => $r->timestamp,
			'level'       => $level,
			'levelBg'     => $level_bg,
			'type'        => ! empty( $r->type ) ? $r->type : 'System',
			'source'      => ! empty( $r->source ) ? $r->source : 'System',
			'boldText'    => $r->message,
			'subText'     => $sub_text,
			'raw_details' => $raw_details,
			'user'        => ! empty( $r->user_login ) ? $r->user_login : 'system',
			'user_id'     => isset( $r->user_id ) ? (int) $r->user_id : 0,
			'ip'          => ! empty( $r->user_ip ) ? $r->user_ip : '127.0.0.1',
			'object_id'   => isset( $r->object_id ) ? (int) $r->object_id : 0,
		);
	}

	/**
	 * Query logs with robust filtering, searching, and pagination.
	 *
	 * @param array $args Query parameters.
	 * @return array Array with items, total, page, per_page, total_pages, and stats.
	 */
	public static function query( $args = array() ) {
		global $wpdb;

		$table_name = self::get_table_name();

		$defaults = array(
			'search'     => '',
			'level'      => 'all',
			'type'       => 'all',
			'source'     => 'all',
			'user'       => 'all',
			'date_range' => 'all',
			'date_from'  => '',
			'date_to'    => '',
			'page'       => 1,
			'per_page'   => 10,
			'orderby'    => 'id',
			'order'      => 'DESC',
		);

		$params = wp_parse_args( $args, $defaults );

		$page     = max( 1, absint( $params['page'] ) );
		$per_page = intval( $params['per_page'] );
		if ( $per_page <= 0 && -1 !== $per_page ) {
			$per_page = 10;
		}

		$where_clauses = array( '1=1' );
		$where_values  = array();

		// 1. Search Query (matches message, details, user_login, source)
		if ( ! empty( $params['search'] ) ) {
			$search_like     = '%' . $wpdb->esc_like( sanitize_text_field( $params['search'] ) ) . '%';
			$where_clauses[] = '(message LIKE %s OR details LIKE %s OR user_login LIKE %s OR source LIKE %s)';
			$where_values[]  = $search_like;
			$where_values[]  = $search_like;
			$where_values[]  = $search_like;
			$where_values[]  = $search_like;
		}

		// 2. Level filter
		if ( ! empty( $params['level'] ) && 'all' !== strtolower( $params['level'] ) ) {
			$where_clauses[] = 'level = %s';
			$where_values[]  = self::normalize_level( $params['level'] );
		}

		// 3. Type filter
		if ( ! empty( $params['type'] ) && 'all' !== strtolower( $params['type'] ) ) {
			$where_clauses[] = 'type = %s';
			$where_values[]  = self::normalize_type( $params['type'] );
		}

		// 4. Source filter
		if ( ! empty( $params['source'] ) && 'all' !== strtolower( $params['source'] ) ) {
			$where_clauses[] = 'source = %s';
			$where_values[]  = sanitize_text_field( $params['source'] );
		}

		// 5. User filter
		if ( ! empty( $params['user'] ) && 'all' !== strtolower( $params['user'] ) ) {
			$where_clauses[] = 'user_login = %s';
			$where_values[]  = sanitize_user( $params['user'] );
		}

		// 6. Date Range filter
		$date_range = strtolower( trim( (string) $params['date_range'] ) );
		$now_time   = time();

		if ( 'today' === $date_range ) {
			$start_today     = wp_date( 'Y-m-d 00:00:00', $now_time );
			$where_clauses[] = 'timestamp >= %s';
			$where_values[]  = $start_today;
		} elseif ( 'yesterday' === $date_range ) {
			$start_yesterday = wp_date( 'Y-m-d 00:00:00', $now_time - DAY_IN_SECONDS );
			$end_yesterday   = wp_date( 'Y-m-d 23:59:59', $now_time - DAY_IN_SECONDS );
			$where_clauses[] = 'timestamp >= %s AND timestamp <= %s';
			$where_values[]  = $start_yesterday;
			$where_values[]  = $end_yesterday;
		} elseif ( 'last7' === $date_range || '7days' === $date_range ) {
			$start_7days     = wp_date( 'Y-m-d 00:00:00', $now_time - ( 7 * DAY_IN_SECONDS ) );
			$where_clauses[] = 'timestamp >= %s';
			$where_values[]  = $start_7days;
		} elseif ( 'last30' === $date_range || '30days' === $date_range ) {
			$start_30days    = wp_date( 'Y-m-d 00:00:00', $now_time - ( 30 * DAY_IN_SECONDS ) );
			$where_clauses[] = 'timestamp >= %s';
			$where_values[]  = $start_30days;
		} elseif ( ! empty( $params['date_from'] ) || ! empty( $params['date_to'] ) ) {
			if ( ! empty( $params['date_from'] ) ) {
				$where_clauses[] = 'timestamp >= %s';
				$where_values[]  = sanitize_text_field( $params['date_from'] ) . ' 00:00:00';
			}
			if ( ! empty( $params['date_to'] ) ) {
				$where_clauses[] = 'timestamp <= %s';
				$where_values[]  = sanitize_text_field( $params['date_to'] ) . ' 23:59:59';
			}
		}

		$where_sql = implode( ' AND ', $where_clauses );

		// Count total matching records
		if ( ! empty( $where_values ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input. The placeholder list is built from the size of the array passed to prepare(), so it only holds %d or %s; the table name comes from $wpdb->prefix.
			$count_sql   = $wpdb->prepare( "SELECT COUNT(id) FROM {$table_name} WHERE {$where_sql}", $where_values );
		} else {
			$count_sql   = "SELECT COUNT(id) FROM {$table_name} WHERE {$where_sql}";
		}

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$total = (int) $wpdb->get_var( $count_sql );

		// Order & limit
		$allowed_orderby = array( 'id', 'timestamp', 'level', 'type', 'source', 'user_login' );
		$orderby         = in_array( strtolower( $params['orderby'] ), $allowed_orderby, true ) ? strtolower( $params['orderby'] ) : 'id';
		$order           = 'ASC' === strtoupper( $params['order'] ) ? 'ASC' : 'DESC';

		if ( -1 === $per_page ) {
			$limit_sql = '';
		} else {
			$offset    = ( $page - 1 ) * $per_page;
			$limit_sql = sprintf( 'LIMIT %d OFFSET %d', $per_page, $offset );
		}

		if ( ! empty( $where_values ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input. The placeholder list is built from the size of the array passed to prepare(), so it only holds %d or %s; the table name comes from $wpdb->prefix.
			$data_sql = $wpdb->prepare( "SELECT * FROM {$table_name} WHERE {$where_sql} ORDER BY {$orderby} {$order} {$limit_sql}", $where_values );
		} else {
			$data_sql = "SELECT * FROM {$table_name} WHERE {$where_sql} ORDER BY {$orderby} {$order} {$limit_sql}";
		}

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$rows  = $wpdb->get_results( $data_sql );
		$items = array();

		if ( ! empty( $rows ) ) {
			foreach ( $rows as $row ) {
				$items[] = self::format_log_item( $row );
			}
		}

		$total_pages = ( -1 === $per_page || $total === 0 ) ? 1 : (int) ceil( $total / $per_page );

		return array(
			'items'       => $items,
			'total'       => $total,
			'page'        => $page,
			'per_page'    => $per_page,
			'total_pages' => $total_pages,
		);
	}

	/**
	 * Compute live aggregated stats for logs (Cards, Charts, Top Sources, Filter options).
	 *
	 * @return array
	 */
	public static function get_stats() {
		global $wpdb;

		$table_name = self::get_table_name();

		// Auto heal table if not created yet
		self::ensure_table_exists();

		// 1. Overall counts by Level
		$level_counts_raw = $wpdb->get_results(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			"SELECT level, COUNT(id) as count FROM {$table_name} GROUP BY level",
			ARRAY_A
		);

		$total_count    = 0;
		$info_count     = 0;
		$success_count  = 0;
		$warning_count  = 0;
		$error_count    = 0;
		$critical_count = 0;

		if ( ! empty( $level_counts_raw ) ) {
			foreach ( $level_counts_raw as $row ) {
				$c   = (int) $row['count'];
				$lvl = self::normalize_level( $row['level'] );
				$total_count += $c;

				switch ( $lvl ) {
					case self::LEVEL_INFO:
						$info_count += $c;
						break;
					case self::LEVEL_SUCCESS:
						$success_count += $c;
						break;
					case self::LEVEL_WARNING:
						$warning_count += $c;
						break;
					case self::LEVEL_ERROR:
						$error_count += $c;
						break;
					case self::LEVEL_CRITICAL:
						$critical_count += $c;
						break;
				}
			}
		}

		// 2. Logs Over Time: one bucket per day for the past 90 days (the UI groups them into daily / weekly / monthly).
		// Dates are built from the site-local clock, the same clock used when log rows are written.
		$now_time   = time();
		$days_back  = 90;
		$range_from = wp_date( 'Y-m-d 00:00:00', $now_time - ( ( $days_back - 1 ) * DAY_IN_SECONDS ) );

		$daily_raw = $wpdb->get_results(
			$wpdb->prepare(
				// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
				"SELECT DATE(timestamp) as log_date, COUNT(id) as count
				 FROM {$table_name}
				 WHERE timestamp >= %s
				 GROUP BY DATE(timestamp)
				 ORDER BY log_date ASC",
				$range_from
			),
			ARRAY_A
		);
				// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		$daily_map = array();
		if ( ! empty( $daily_raw ) ) {
			foreach ( $daily_raw as $d ) {
				$daily_map[ $d['log_date'] ] = (int) $d['count'];
			}
		}

		$logs_over_time = array();
		for ( $i = $days_back - 1; $i >= 0; $i-- ) {
			$t        = $now_time - ( $i * DAY_IN_SECONDS );
			$date_key = wp_date( 'Y-m-d', $t );
			$logs_over_time[] = array(
				'date'  => wp_date( 'M j', $t ),
				'key'   => $date_key,
				'count' => isset( $daily_map[ $date_key ] ) ? $daily_map[ $date_key ] : 0,
			);
		}

		// 3. Top Log Sources (Progress bar chart)
		$sources_raw = $wpdb->get_results(
			// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The table name comes from $wpdb->prefix and any list of placeholders is built from the size of the array passed to prepare(); no user input is written into the SQL text.
			"SELECT source, COUNT(id) as count
			 FROM {$table_name}
			 GROUP BY source
			 ORDER BY count DESC
			 LIMIT 6",
			ARRAY_A
		);
			// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared

		$top_sources = array();
		if ( ! empty( $sources_raw ) ) {
			foreach ( $sources_raw as $s ) {
				$c       = (int) $s['count'];
				$src     = ! empty( $s['source'] ) ? $s['source'] : 'System';
				$percent = $total_count > 0 ? round( ( $c / $total_count ) * 100, 1 ) : 0;
				$top_sources[] = array(
					'source'     => $src,
					'count'      => number_format_i18n( $c ),
					'raw_count'  => $c,
					'percentage' => $percent,
					'width'      => $percent . '%',
				);
			}
		}

		// 4. Distinct values for UI dropdown filters (real values only; no placeholder defaults)
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$distinct_sources = $wpdb->get_col( "SELECT DISTINCT source FROM {$table_name} WHERE source != '' ORDER BY source ASC" );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$distinct_types   = $wpdb->get_col( "SELECT DISTINCT type FROM {$table_name} WHERE type != '' ORDER BY type ASC" );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$distinct_users   = $wpdb->get_col( "SELECT DISTINCT user_login FROM {$table_name} WHERE user_login != '' ORDER BY user_login ASC" );

		return array(
			'total'              => $total_count,
			'info_count'         => $info_count,
			'success_count'      => $success_count,
			'warning_count'      => $warning_count,
			'error_count'        => $error_count,
			'critical_count'     => $critical_count,
			'logs_over_time'     => $logs_over_time,
			'top_sources'        => $top_sources,
			'distinct_sources'   => is_array( $distinct_sources ) ? $distinct_sources : array(),
			'distinct_types'     => is_array( $distinct_types ) ? $distinct_types : array(),
			'distinct_users'     => is_array( $distinct_users ) ? $distinct_users : array(),
			'log_retention_days' => self::get_retention_days(),
		);
	}

	/**
	 * Prune logs older than $days (used by daily WP-Cron).
	 *
	 * @param int $days Retention period in days (default 30).
	 * @return int Number of pruned rows.
	 */
	public static function prune_logs( $days = 30 ) {
		global $wpdb;

		$days = max( 1, absint( $days ) );
		$cutoff_date = wp_date( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) );

		$table_name = self::get_table_name();
		$deleted    = $wpdb->query(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$wpdb->prepare( "DELETE FROM {$table_name} WHERE timestamp < %s", $cutoff_date )
		);

		return false !== $deleted ? (int) $deleted : 0;
	}

	/**
	 * Clear all logs from database.
	 *
	 * @return bool
	 */
	public static function clear_all() {
		global $wpdb;

		$table_name = self::get_table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
		$result     = $wpdb->query( "TRUNCATE TABLE {$table_name}" );

		if ( false === $result ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
			$result = $wpdb->query( "DELETE FROM {$table_name}" );
		}

		// Also clear legacy audit log
		delete_option( 'imgsentry_audit_log' );

		// Insert initialization record
		self::info( 'Logs database cleared and re-initialized', array(
			'type'   => 'System',
			'source' => 'System',
		) );

		return false !== $result;
	}

	/**
	 * Generate and return CSV content string for export using chunked batching.
	 *
	 * @param array $args Query parameters.
	 * @return string CSV text.
	 */
	public static function export_csv( $args = array() ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
		$output = fopen( 'php://temp', 'r+' );

		// CSV Header
		fputcsv( $output, array( 'Log ID', 'Timestamp', 'Level', 'Type', 'Source', 'User', 'IP Address', 'Message', 'Details' ) );

		$batch_size = 1000;
		$page       = 1;

		while ( true ) {
			$args['page']     = $page;
			$args['per_page'] = $batch_size;

			$result = self::query( $args );
			$items  = isset( $result['items'] ) ? $result['items'] : array();

			if ( empty( $items ) ) {
				break;
			}

			foreach ( $items as $item ) {
				fputcsv( $output, array(
					$item['id'],
					$item['raw_time'],
					$item['level'],
					$item['type'],
					self::csv_safe( $item['source'] ),
					self::csv_safe( $item['user'] ),
					self::csv_safe( $item['ip'] ),
					self::csv_safe( $item['boldText'] ),
					self::csv_safe( $item['subText'] ),
				) );
			}

			unset( $result, $items );
			$page++;
		}

		rewind( $output );
		$csv = stream_get_contents( $output );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
		fclose( $output );

		return $csv;
	}

	/**
	 * Neutralise spreadsheet formula injection in a CSV cell.
	 * Values that start with = + - @ (or a tab / carriage return) would be executed as a formula by Excel / Sheets.
	 *
	 * @param mixed $value Raw cell value.
	 * @return string
	 */
	public static function csv_safe( $value ) {
		$value = (string) $value;
		if ( '' !== $value && in_array( $value[0], array( '=', '+', '-', '@', "\t", "\r" ), true ) ) {
			return "'" . $value;
		}
		return $value;
	}

	/**
	 * Log retention period in days (same default as the daily cron prune: 30).
	 *
	 * @return int
	 */
	public static function get_retention_days() {
		$settings = get_option( 'imgsentry_settings', array() );
		$days     = ( is_array( $settings ) && isset( $settings['logRetentionDays'] ) ) ? absint( $settings['logRetentionDays'] ) : 30;
		return max( 1, $days );
	}

	/**
	 * Seed initial demo logs if table is completely empty.
	 */
	public static function seed_initial_logs_if_empty() {
		// Deprecated demo seeding — logs table remains genuinely empty on fresh installs.
		return;
	}
}
