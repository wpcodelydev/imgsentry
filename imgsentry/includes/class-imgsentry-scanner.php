<?php

/**
 * Media Scanner Engine Class.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Scanner {
    /**
     * Retrieve list of media items based on filter arguments.
     *
     * @param array $args Filter and pagination parameters.
     * @return array Array containing items, total items count, and total pages.
     */
    public static function get_media_items( $args = array() ) {
        global $wpdb;
        $defaults = array(
            'type'         => 'all',
            'search'       => '',
            'date_from'    => '',
            'date_to'      => '',
            'date_range'   => '',
            'location'     => '',
            'size'         => '',
            'status'       => 'active',
            'trash_status' => 'all',
            'page'         => 1,
            'per_page'     => 30,
            'orderby'      => 'date',
            'order'        => 'DESC',
        );
        $r = wp_parse_args( $args, $defaults );
        // Lightweight one-time check to backfill any existing optimized attachments without format meta
        self::maybe_backfill_nextgen_meta();
        $page = max( 1, intval( $r['page'] ) );
        $per_page_raw = $r['per_page'];
        // Check if size filter is active
        $has_size_filter = !empty( $r['size'] ) && 'all' !== $r['size'];
        // Base query arguments for WP_Query / get_posts.
        $query_args = array(
            'post_type' => 'attachment',
            'orderby'   => sanitize_key( $r['orderby'] ),
            'order'     => ( strtoupper( $r['order'] ) === 'ASC' ? 'ASC' : 'DESC' ),
        );
        if ( $has_size_filter ) {
            // Fetch all candidate posts without SQL limit so we can accurately resolve sizes & paginate in PHP
            $query_args['posts_per_page'] = -1;
        } elseif ( -1 === intval( $per_page_raw ) || 'all' === $per_page_raw ) {
            $query_args['posts_per_page'] = -1;
        } else {
            $per_page = max( 1, intval( $per_page_raw ) );
            $offset = ($page - 1) * $per_page;
            $query_args['posts_per_page'] = $per_page;
            $query_args['paged'] = $page;
            $query_args['offset'] = $offset;
        }
        // Build Meta Query conditions array.
        $meta_queries = array();
        // Handle Status (Active vs Trashed vs All).
        if ( 'trash' === $r['status'] ) {
            $query_args['post_status'] = array('trash', 'inherit');
            $meta_queries[] = array(
                'key'     => '_imgsentry_trashed',
                'value'   => '1',
                'compare' => '=',
            );
            // Trash status filter ('expiring_soon', 'trashed_today', 'safe')
            if ( !empty( $r['trash_status'] ) && 'all' !== $r['trash_status'] ) {
                $settings = get_option( 'imgsentry_settings', array() );
                $retention_days = ( isset( $settings['retentionDays'] ) ? absint( $settings['retentionDays'] ) : (int) get_option( 'imgsentry_trash_days', 7 ) );
                if ( $retention_days <= 0 ) {
                    $retention_days = 7;
                }
                $threshold_days = max( 0, $retention_days - 3 );
                $cutoff_time = wp_date( 'Y-m-d H:i:s', time() - $threshold_days * DAY_IN_SECONDS );
                if ( 'trashed_today' === $r['trash_status'] ) {
                    $rolling_cutoff = wp_date( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS );
                    $meta_queries[] = array(
                        'key'     => '_imgsentry_trashed_date',
                        'value'   => $rolling_cutoff,
                        'compare' => '>=',
                        'type'    => 'DATETIME',
                    );
                } elseif ( 'expiring_soon' === $r['trash_status'] ) {
                    $meta_queries[] = array(
                        'key'     => '_imgsentry_trashed_date',
                        'value'   => $cutoff_time,
                        'compare' => '<=',
                        'type'    => 'DATETIME',
                    );
                } elseif ( 'safe' === $r['trash_status'] ) {
                    $meta_queries[] = array(
                        'key'     => '_imgsentry_trashed_date',
                        'value'   => $cutoff_time,
                        'compare' => '>',
                        'type'    => 'DATETIME',
                    );
                }
            }
            // Trash date filter ('today', 'this_month') based on _imgsentry_trashed_date
            if ( !empty( $r['date_range'] ) && 'all' !== $r['date_range'] ) {
                if ( 'today' === $r['date_range'] ) {
                    $rolling_cutoff = wp_date( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS );
                    $meta_queries[] = array(
                        'key'     => '_imgsentry_trashed_date',
                        'value'   => $rolling_cutoff,
                        'compare' => '>=',
                        'type'    => 'DATETIME',
                    );
                } elseif ( 'this_month' === $r['date_range'] ) {
                    $meta_queries[] = array(
                        'key'     => '_imgsentry_trashed_date',
                        'value'   => array(current_time( 'Y-m-01 00:00:00' ), current_time( 'Y-m-t 23:59:59' )),
                        'compare' => 'BETWEEN',
                        'type'    => 'DATETIME',
                    );
                }
            }
        } elseif ( 'all' === $r['status'] ) {
            $query_args['post_status'] = array('inherit', 'trash');
        } else {
            $query_args['post_status'] = 'inherit';
            $meta_queries[] = array(
                'relation' => 'OR',
                array(
                    'key'     => '_imgsentry_trashed',
                    'compare' => 'NOT EXISTS',
                ),
                array(
                    'key'     => '_imgsentry_trashed',
                    'value'   => '1',
                    'compare' => '!=',
                ),
            );
        }
        // Location Filter meta query clause (nested subfolder aware + root support).
        if ( !empty( $r['location'] ) && 'all' !== $r['location'] ) {
            $loc_clean = str_replace( 'wp-content/uploads/', '', ltrim( $r['location'], '/' ) );
            $loc_clean = trim( $loc_clean, '/' );
            if ( !empty( $loc_clean ) ) {
                if ( 'root' === strtolower( $loc_clean ) ) {
                    $meta_queries[] = array(
                        'key'     => '_wp_attached_file',
                        'value'   => '/',
                        'compare' => 'NOT LIKE',
                    );
                } else {
                    $meta_queries[] = array(
                        'key'     => '_wp_attached_file',
                        'value'   => $loc_clean,
                        'compare' => 'LIKE',
                    );
                }
            }
        }
        if ( !empty( $meta_queries ) ) {
            if ( count( $meta_queries ) === 1 ) {
                $query_args['meta_query'] = $meta_queries;
            } else {
                $query_args['meta_query'] = array_merge( array(
                    'relation' => 'AND',
                ), $meta_queries );
            }
        }
        // Search Filter.
        if ( !empty( $r['search'] ) ) {
            $query_args['s'] = sanitize_text_field( $r['search'] );
        }
        // Date Range / Month Filter (for active non-trash items or standard post_date filtering).
        if ( 'trash' !== $r['status'] ) {
            if ( !empty( $r['date_range'] ) && 'all' !== $r['date_range'] ) {
                $date_parts = explode( '-', $r['date_range'] );
                if ( count( $date_parts ) === 2 && is_numeric( $date_parts[0] ) && is_numeric( $date_parts[1] ) ) {
                    $query_args['date_query'] = array(array(
                        'year'  => intval( $date_parts[0] ),
                        'month' => intval( $date_parts[1] ),
                    ));
                }
            } elseif ( !empty( $r['date_from'] ) || !empty( $r['date_to'] ) ) {
                $date_query = array();
                if ( !empty( $r['date_from'] ) ) {
                    $date_query['after'] = sanitize_text_field( $r['date_from'] );
                }
                if ( !empty( $r['date_to'] ) ) {
                    $date_query['before'] = sanitize_text_field( $r['date_to'] );
                }
                $date_query['inclusive'] = true;
                $query_args['date_query'] = array($date_query);
            }
        }
        // Mime type filtering.
        if ( 'all' !== $r['type'] ) {
            $mime_types = self::get_mime_types_for_category( $r['type'] );
            if ( !empty( $mime_types ) ) {
                $query_args['post_mime_type'] = $mime_types;
            }
        }
        $query = new WP_Query($query_args);
        $upload_dir = wp_upload_dir();
        $basedir = ( isset( $upload_dir['basedir'] ) ? $upload_dir['basedir'] : '' );
        if ( $has_size_filter ) {
            $candidate_posts = $query->posts;
            $matched_posts = array();
            if ( !empty( $candidate_posts ) ) {
                foreach ( $candidate_posts as $post ) {
                    $filesize_meta = get_post_meta( $post->ID, '_filesize', true );
                    $attachment_metadata = get_post_meta( $post->ID, '_wp_attachment_metadata', true );
                    $attached_file = get_post_meta( $post->ID, '_wp_attached_file', true );
                    $size = self::resolve_attachment_filesize(
                        $filesize_meta,
                        $attachment_metadata,
                        $attached_file,
                        $basedir
                    );
                    if ( $size <= 0 ) {
                        continue;
                    }
                    $size_filter = strtolower( $r['size'] );
                    $matches = false;
                    if ( 'small' === $size_filter && $size < 512000 ) {
                        $matches = true;
                    } elseif ( 'medium' === $size_filter && $size >= 512000 && $size <= 2097152 ) {
                        $matches = true;
                    } elseif ( 'large' === $size_filter && $size > 2097152 ) {
                        $matches = true;
                    }
                    if ( $matches ) {
                        $matched_posts[] = $post;
                    }
                }
            }
            $total_items = count( $matched_posts );
            if ( -1 === intval( $per_page_raw ) || 'all' === $per_page_raw ) {
                $total_pages = 1;
                $posts_to_return = $matched_posts;
            } else {
                $per_page = max( 1, intval( $per_page_raw ) );
                $total_pages = max( 1, (int) ceil( $total_items / $per_page ) );
                $offset = ($page - 1) * $per_page;
                $posts_to_return = array_slice( $matched_posts, $offset, $per_page );
            }
        } else {
            $total_items = $query->found_posts;
            $total_pages = $query->max_num_pages;
            $posts_to_return = $query->posts;
        }
        $items = array();
        if ( !empty( $posts_to_return ) ) {
            $post_ids = wp_list_pluck( $posts_to_return, 'ID' );
            $usage_map = array();
            $meta_map = array();
            if ( !empty( $post_ids ) ) {
                $table_name = ImgSentry_Usage_Indexer::get_table_name();
                $placeholders = implode( ',', array_fill( 0, count( $post_ids ), '%d' ) );
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $sql = $wpdb->prepare( "SELECT attachment_id, status, usage_sources, usage_count, last_scanned_at FROM {$table_name} WHERE attachment_id IN ({$placeholders})", $post_ids );
                // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $rows = $wpdb->get_results( $sql );
                if ( !empty( $rows ) ) {
                    foreach ( $rows as $row ) {
                        $usage_map[(int) $row->attachment_id] = $row;
                    }
                }
                // Batch-fetch postmeta across all queried items in one query
                $meta_map = self::get_batch_postmeta( $post_ids );
            }
            foreach ( $posts_to_return as $post ) {
                $usage_row = ( isset( $usage_map[$post->ID] ) ? $usage_map[$post->ID] : null );
                $meta_row = ( isset( $meta_map[$post->ID] ) ? $meta_map[$post->ID] : null );
                $items[] = self::format_media_item(
                    $post,
                    $usage_row,
                    $meta_row,
                    !empty( $r['lightweight'] )
                );
            }
        }
        return array(
            'items'        => $items,
            'total'        => $total_items,
            'pages'        => $total_pages,
            'current_page' => $page,
        );
    }

    /**
     * Batch fetch postmeta for media items to prevent N+1 queries.
     *
     * @param array $post_ids Array of attachment post IDs.
     * @return array Associative array of [ post_id => [ meta_key => meta_value ] ]
     */
    public static function get_batch_postmeta( $post_ids ) {
        global $wpdb;
        if ( empty( $post_ids ) || !is_array( $post_ids ) ) {
            return array();
        }
        $post_ids = array_filter( array_map( 'intval', $post_ids ) );
        if ( empty( $post_ids ) ) {
            return array();
        }
        $meta_keys = array(
            '_imgsentry_optimized',
            '_imgsentry_bytes_saved',
            '_imgsentry_optimized_date',
            '_imgsentry_optimization_status',
            '_imgsentry_backup_original_path',
            '_imgsentry_backup_path',
            '_imgsentry_trashed',
            '_imgsentry_trashed_date',
            '_filesize',
            '_imgsentry_output_format',
            '_imgsentry_nextgen_formats',
            '_imgsentry_effective_size',
            '_imgsentry_percent_saved',
            '_imgsentry_savings_unknown'
        );
        $placeholders = implode( ',', array_fill( 0, count( $post_ids ), '%d' ) );
        $meta_key_placeholders = implode( ',', array_fill( 0, count( $meta_keys ), '%s' ) );
        // The IN (...) lists only contain %d / %s placeholders that were built above from the array sizes; the values are passed to prepare().
        // phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber
        $sql = $wpdb->prepare( "SELECT post_id, meta_key, meta_value\n\t\t\t FROM {$wpdb->postmeta}\n\t\t\t WHERE post_id IN ({$placeholders})\n\t\t\t   AND meta_key IN ({$meta_key_placeholders})", array_merge( $post_ids, $meta_keys ) );
        // phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, WordPress.DB.PreparedSQLPlaceholders.ReplacementsWrongNumber
        // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- The query was prepared just above; $wpdb->postmeta is a core table.
        $rows = $wpdb->get_results( $sql );
        $meta_map = array();
        if ( !empty( $rows ) ) {
            foreach ( $rows as $row ) {
                $val = $row->meta_value;
                if ( '_imgsentry_nextgen_formats' === $row->meta_key ) {
                    $val = maybe_unserialize( $val );
                }
                $meta_map[(int) $row->post_id][$row->meta_key] = $val;
            }
        }
        return $meta_map;
    }

    /**
     * Map media category filters to mime types.
     *
     * @param string $category Filter category name.
     * @return array Mime type array.
     */
    public static function get_mime_types_for_category( $category ) {
        switch ( strtolower( $category ) ) {
            case 'images':
                return array(
                    'image/jpeg',
                    'image/png',
                    'image/gif',
                    'image/webp',
                    'image/avif',
                    'image/svg+xml',
                    'image/bmp'
                );
            case 'webp':
                return array('image/webp');
            case 'avif':
                return array('image/avif');
            case 'jpg':
            case 'jpeg':
                return array('image/jpeg');
            case 'png':
                return array('image/png');
            case 'svg':
                return array('image/svg+xml');
            case 'pdf':
                return array('application/pdf');
            case 'fonts':
                return array(
                    'font/woff',
                    'font/woff2',
                    'font/ttf',
                    'font/otf',
                    'application/font-woff',
                    'application/x-font-ttf',
                    'application/font-sfnt'
                );
            case 'documents':
                return array(
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'text/plain',
                    'text/csv'
                );
            case 'audio':
                return array(
                    'audio/mpeg',
                    'audio/wav',
                    'audio/ogg',
                    'audio/aac',
                    'audio/flac'
                );
            case 'video':
                return array(
                    'video/mp4',
                    'video/webm',
                    'video/ogg',
                    'video/quicktime',
                    'video/x-msvideo'
                );
            case 'other':
            default:
                return array();
        }
    }

    /**
     * Format an attachment WP_Post object into an easy-to-use array.
     * Reads usage metadata directly from custom wp_imgsentry_attachment_usage table
     * and uses batched postmeta map to eliminate N+1 queries.
     *
     * @param WP_Post     $post Attachment post object.
     * @param object|null $usage_data Usage row object from wp_imgsentry_attachment_usage or null.
     * @param array|null  $meta_data Pre-fetched postmeta array for this post or null.
     * @param bool        $lightweight Optional. When true, skips expensive disk checks and sub-sizes map for fast list views.
     * @return array Formatted item payload.
     */
    public static function format_media_item(
        $post,
        $usage_data = null,
        $meta_data = null,
        $lightweight = false
    ) {
        $get_meta_val = function ( $key ) use($meta_data, $post) {
            if ( is_array( $meta_data ) ) {
                return ( isset( $meta_data[$key] ) ? $meta_data[$key] : '' );
            }
            return get_post_meta( $post->ID, $key, true );
        };
        $is_trashed_meta = $get_meta_val( '_imgsentry_trashed' );
        $is_trashed = '1' === $is_trashed_meta || 'trash' === $post->post_status;
        $file_path = get_attached_file( $post->ID );
        if ( $is_trashed && !$lightweight ) {
            // Resolve quarantine path for trashed items
            $quarantine_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_trash_media_dir( $post->ID ) : trailingslashit( wp_upload_dir()['basedir'] ) . 'imgsentry/trash/media/' . $post->ID . '/' );
            $quarantine_file = $quarantine_dir . basename( $file_path );
            if ( file_exists( $quarantine_file ) ) {
                $file_path = $quarantine_file;
            }
        }
        $file_url = wp_get_attachment_url( $post->ID );
        $filename = basename( ( $file_path ? $file_path : $file_url ) );
        $ext = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
        $mime = get_post_mime_type( $post->ID );
        $category = self::determine_category( $mime, $ext );
        $metadata = wp_get_attachment_metadata( $post->ID );
        $size_unknown = false;
        if ( $lightweight ) {
            // Skip expensive file_exists/is_readable disk checks in lightweight list mode
            $file_exists = true;
            $file_missing = false;
            $thumbnail_sizes_bytes = 0;
            $sub_sizes_count = 0;
            if ( is_array( $metadata ) && !empty( $metadata['filesize'] ) && intval( $metadata['filesize'] ) > 0 ) {
                $file_size = intval( $metadata['filesize'] );
            } elseif ( is_array( $metadata ) && !empty( $metadata['file_size'] ) && intval( $metadata['file_size'] ) > 0 ) {
                $file_size = intval( $metadata['file_size'] );
            } else {
                $meta_size = $get_meta_val( '_filesize' );
                if ( $meta_size && intval( $meta_size ) > 0 ) {
                    $file_size = intval( $meta_size );
                } else {
                    $file_size = 0;
                    $size_unknown = true;
                }
            }
            $formatted_size = ( $size_unknown ? 'Unknown' : size_format( $file_size, 2 ) );
        } else {
            $file_exists = $file_path && file_exists( $file_path );
            $file_missing = !$file_exists;
            // Approach (a) Fix Ghost File Bug:
            // If file does not exist on disk, exclude phantom size completely (file_size = 0)
            // and flag file_missing = true. Never fall back to cached database sizes for missing files.
            if ( !$file_exists ) {
                $file_size = 0;
                $formatted_size = __( 'Missing on disk', 'imgsentry' );
            } else {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                $disk_size = @filesize( $file_path );
                if ( false !== $disk_size && $disk_size > 0 ) {
                    $file_size = (int) $disk_size;
                } elseif ( is_array( $metadata ) && !empty( $metadata['filesize'] ) && intval( $metadata['filesize'] ) > 0 ) {
                    $file_size = intval( $metadata['filesize'] );
                } elseif ( is_array( $metadata ) && !empty( $metadata['file_size'] ) && intval( $metadata['file_size'] ) > 0 ) {
                    $file_size = intval( $metadata['file_size'] );
                } else {
                    $meta_size = $get_meta_val( '_filesize' );
                    if ( $meta_size && intval( $meta_size ) > 0 ) {
                        $file_size = intval( $meta_size );
                    } else {
                        $file_size = 0;
                        $size_unknown = true;
                    }
                }
                $formatted_size = ( $size_unknown ? 'Unknown' : size_format( $file_size, 2 ) );
            }
            // Item 1: Parse intermediate/thumbnail sub-sizes from _wp_attachment_metadata,
            // verify existence on disk, and sum physical thumbnail volumes.
            $thumbnail_sizes_bytes = 0;
            $sub_sizes_count = 0;
            $seen_thumb_paths = array();
            if ( !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) && !empty( $file_path ) ) {
                $base_dir = dirname( $file_path );
                foreach ( $metadata['sizes'] as $size_key => $size_info ) {
                    if ( !empty( $size_info['file'] ) ) {
                        $thumb_file_path = trailingslashit( $base_dir ) . $size_info['file'];
                        if ( !isset( $seen_thumb_paths[$thumb_file_path] ) ) {
                            $seen_thumb_paths[$thumb_file_path] = true;
                            if ( file_exists( $thumb_file_path ) ) {
                                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                                $thumb_size = @filesize( $thumb_file_path );
                                if ( false !== $thumb_size && $thumb_size > 0 ) {
                                    $thumbnail_sizes_bytes += (int) $thumb_size;
                                    $sub_sizes_count++;
                                }
                            }
                        }
                    }
                }
            }
        }
        // Batch or single lookup against wp_imgsentry_attachment_usage custom table.
        if ( null === $usage_data ) {
            global $wpdb;
            $table_name = ImgSentry_Usage_Indexer::get_table_name();
            $usage_data = $wpdb->get_row( $wpdb->prepare( 
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                "SELECT status, usage_sources, usage_count, last_scanned_at FROM {$table_name} WHERE attachment_id = %d",
                $post->ID
             ) );
        }
        $status = ( $usage_data && isset( $usage_data->status ) ? $usage_data->status : 'unused' );
        $in_use = 'used' === $status;
        if ( $lightweight ) {
            $use_reasons = array();
        } else {
            $sources_raw = ( $usage_data && !empty( $usage_data->usage_sources ) ? $usage_data->usage_sources : '[]' );
            $use_reasons = json_decode( $sources_raw, true );
            if ( !is_array( $use_reasons ) ) {
                $use_reasons = array();
            }
        }
        $last_scan_time = ( $usage_data && !empty( $usage_data->last_scanned_at ) ? $usage_data->last_scanned_at : null );
        // Thumbnail / Preview & Dimensions.
        $thumb_url = '';
        $preview_url = '';
        $dimensions = '';
        $width = null;
        $height = null;
        $is_image = wp_attachment_is( 'image', $post->ID ) || $mime && strpos( $mime, 'image/' ) === 0 || in_array( $ext, array(
            'jpg',
            'jpeg',
            'png',
            'gif',
            'webp',
            'avif',
            'svg',
            'bmp',
            'ico',
            'tiff'
        ), true );
        $is_video = 'video' === $category || $mime && strpos( $mime, 'video/' ) === 0 || in_array( $ext, array(
            'mp4',
            'm4v',
            'webm',
            'ogv',
            'wmv',
            'flv',
            'avi',
            'mov',
            'mkv'
        ), true );
        if ( $is_image ) {
            $thumb_src = wp_get_attachment_image_src( $post->ID, 'thumbnail' );
            $thumb_url = ( $thumb_src ? $thumb_src[0] : $file_url );
            // Larger, uncropped preview for grid cards (the 150x150 thumbnail looks blurry when enlarged).
            $preview_src = wp_get_attachment_image_src( $post->ID, 'medium_large' );
            $preview_url = ( $preview_src ? $preview_src[0] : $file_url );
            $width = ( is_array( $metadata ) && isset( $metadata['width'] ) ? $metadata['width'] : null );
            $height = ( is_array( $metadata ) && isset( $metadata['height'] ) ? $metadata['height'] : null );
            if ( !$lightweight && (!$width || !$height) ) {
                $actual_path = ( $file_path ? $file_path : get_attached_file( $post->ID ) );
                if ( $actual_path && file_exists( $actual_path ) && function_exists( 'getimagesize' ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                    $size_info = @getimagesize( $actual_path );
                    if ( $size_info && !empty( $size_info[0] ) && !empty( $size_info[1] ) ) {
                        $width = $size_info[0];
                        $height = $size_info[1];
                    }
                }
            }
            if ( $width && $height ) {
                $dimensions = $width . ' x ' . $height;
            }
        } elseif ( $is_video ) {
            $width = ( is_array( $metadata ) && isset( $metadata['width'] ) ? $metadata['width'] : null );
            $height = ( is_array( $metadata ) && isset( $metadata['height'] ) ? $metadata['height'] : null );
            if ( $width && $height ) {
                $dimensions = $width . ' x ' . $height;
            }
        }
        // Trashed metadata via batched lookup
        $is_trashed_meta = $get_meta_val( '_imgsentry_trashed' );
        $is_trashed = '1' === $is_trashed_meta || 'trash' === $post->post_status;
        $trashed_date = $get_meta_val( '_imgsentry_trashed_date' );
        // Securely stream quarantined media files for trashed items
        if ( $is_trashed ) {
            $nonce = wp_create_nonce( 'imgsentry_admin_nonce' );
            $base_url = admin_url( 'admin-ajax.php' );
            // Rewrite full URL
            $file_filename = basename( ( $file_path ? $file_path : $file_url ) );
            $file_url = add_query_arg( array(
                'action' => 'imgsentry_stream_quarantine_media',
                'id'     => $post->ID,
                'nonce'  => $nonce,
                'size'   => $file_filename,
            ), $base_url );
            // Rewrite Thumbnail URL
            if ( $is_image ) {
                $preview_src = wp_get_attachment_image_src( $post->ID, 'medium_large' );
                $preview_url = ( $preview_src ? add_query_arg( array(
                    'action' => 'imgsentry_stream_quarantine_media',
                    'id'     => $post->ID,
                    'nonce'  => $nonce,
                    'size'   => basename( $preview_src[0] ),
                ), $base_url ) : $file_url );
                $thumb_src = wp_get_attachment_image_src( $post->ID, 'thumbnail' );
                if ( $thumb_src ) {
                    $thumb_filename = basename( $thumb_src[0] );
                    $thumb_url = add_query_arg( array(
                        'action' => 'imgsentry_stream_quarantine_media',
                        'id'     => $post->ID,
                        'nonce'  => $nonce,
                        'size'   => $thumb_filename,
                    ), $base_url );
                } else {
                    $thumb_url = $file_url;
                }
            } else {
                $thumb_url = '';
            }
        }
        $original_path = $get_meta_val( '_imgsentry_original_path' );
        $normalized_original = '';
        if ( !empty( $original_path ) ) {
            $normalized_original = str_replace( wp_normalize_path( ABSPATH ), '', wp_normalize_path( $original_path ) );
            $normalized_original = '/' . ltrim( $normalized_original, '/' );
        }
        if ( $is_trashed && empty( $trashed_date ) ) {
            $trashed_date = get_the_modified_date( 'Y-m-d H:i:s', $post->ID );
            if ( empty( $trashed_date ) ) {
                $trashed_date = current_time( 'mysql' );
            }
        }
        if ( !$is_trashed ) {
            $trashed_date = '';
        }
        // Days in trash calculation (strictly 0 if trashed today)
        $days_in_trash = 0;
        if ( $trashed_date ) {
            $diff = time() - strtotime( $trashed_date );
            $days_in_trash = max( 0, (int) floor( $diff / DAY_IN_SECONDS ) );
        }
        // Optimization metadata via batched lookup
        $is_optimized = (bool) $get_meta_val( '_imgsentry_optimized' );
        // Optimized by another plugin (Imagify, Smush, ShortPixel ...): ImgSentry leaves it alone, so the list must not offer it as "not optimized".
        $externally_optimized = ( !$is_optimized && class_exists( 'ImgSentry_External_Optimizers' ) ? ImgSentry_External_Optimizers::is_optimized( $post->ID ) : false );
        $bytes_saved = (int) $get_meta_val( '_imgsentry_bytes_saved' );
        $optimized_date = $get_meta_val( '_imgsentry_optimized_date' );
        $optimization_status = $get_meta_val( '_imgsentry_optimization_status' );
        $backup_path = $get_meta_val( '_imgsentry_backup_original_path' );
        if ( empty( $backup_path ) ) {
            $backup_path = $get_meta_val( '_imgsentry_backup_path' );
        }
        // A backup is only valid if the item is optimized and the backup file exists on disk
        $has_backup = ($is_optimized || 'optimized' === $optimization_status) && !empty( $backup_path ) && ($lightweight || file_exists( $backup_path ));
        // Output format & Next-Gen formats via batched lookup (fallback to get_post_meta)
        $output_format = $get_meta_val( '_imgsentry_output_format' );
        if ( empty( $output_format ) ) {
            $output_format = ( get_post_meta( $post->ID, '_imgsentry_output_format', true ) ?: null );
        }
        $next_gen_formats = $get_meta_val( '_imgsentry_nextgen_formats' );
        if ( is_string( $next_gen_formats ) ) {
            $next_gen_formats = maybe_unserialize( $next_gen_formats );
        }
        if ( empty( $next_gen_formats ) || !is_array( $next_gen_formats ) ) {
            $next_gen_formats = ( get_post_meta( $post->ID, '_imgsentry_nextgen_formats', true ) ?: array() );
        }
        $effective_size = (int) $get_meta_val( '_imgsentry_effective_size' );
        if ( $effective_size <= 0 ) {
            $effective_size = (int) get_post_meta( $post->ID, '_imgsentry_effective_size', true );
        }
        // Task 5 & Headline Fix: Lazy backfill for existing attachments marked _imgsentry_optimized without next-gen meta or missing effective size
        if ( !$lightweight && $is_optimized && (empty( $output_format ) || empty( $next_gen_formats ) || $effective_size <= 0) ) {
            $backfilled = self::backfill_attachment_nextgen_meta( $post->ID, $file_path );
            $output_format = $backfilled['output_format'];
            $next_gen_formats = $backfilled['next_gen_formats'];
            $effective_size = ( !empty( $backfilled['effective_size'] ) ? (int) $backfilled['effective_size'] : (int) get_post_meta( $post->ID, '_imgsentry_effective_size', true ) );
            $bytes_saved = (int) get_post_meta( $post->ID, '_imgsentry_bytes_saved', true );
        }
        $savings_unknown = (bool) $get_meta_val( '_imgsentry_savings_unknown' );
        if ( !$savings_unknown ) {
            $savings_unknown = (bool) get_post_meta( $post->ID, '_imgsentry_savings_unknown', true );
        }
        $percent_saved = $get_meta_val( '_imgsentry_percent_saved' );
        if ( '' === $percent_saved || null === $percent_saved ) {
            $percent_saved = get_post_meta( $post->ID, '_imgsentry_percent_saved', true );
        }
        // If savings cannot be accurately known (legacy image optimized without backup prior to this fix),
        // return null for bytes_saved and percent_saved rather than a misleading stale percentage.
        if ( $savings_unknown ) {
            $bytes_saved = null;
            $percent_saved = null;
        }
        // Location
        $relative_location = '';
        if ( $file_path ) {
            $relative_location = str_replace( wp_normalize_path( ABSPATH ), '', wp_normalize_path( $file_path ) );
            $relative_location = '/' . ltrim( $relative_location, '/' );
        } elseif ( $file_url ) {
            $relative_location = str_replace( site_url(), '', $file_url );
        }
        // The format shown is the format of the main file (the file people download). It stays the same as the
        // uploaded file; the WebP / AVIF copies are shown separately.
        $display_extension = $ext;
        // Calculate tracked backup file size if backup exists on disk
        $backup_size_bytes = 0;
        if ( !$lightweight && $has_backup && !empty( $backup_path ) && file_exists( $backup_path ) ) {
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
            $backup_size_bytes = (int) @filesize( $backup_path );
        }
        // Calculate tracked Next-Gen companion sibling sizes
        $nextgen_sizes_bytes = 0;
        if ( !empty( $next_gen_formats ) && is_array( $next_gen_formats ) ) {
            foreach ( array('webp', 'avif') as $fmt_key ) {
                if ( !empty( $next_gen_formats[$fmt_key]['exists'] ) ) {
                    if ( !empty( $next_gen_formats[$fmt_key]['size_bytes'] ) ) {
                        $nextgen_sizes_bytes += (int) $next_gen_formats[$fmt_key]['size_bytes'];
                    } elseif ( !$lightweight && !empty( $next_gen_formats[$fmt_key]['file_path'] ) && file_exists( $next_gen_formats[$fmt_key]['file_path'] ) ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                        $nextgen_sizes_bytes += (int) @filesize( $next_gen_formats[$fmt_key]['file_path'] );
                    }
                }
            }
        }
        // Size and saving people actually get (the WebP / AVIF file when it exists and is smaller), the same
        // rule the Media Library column uses. Display only: disk and quota statistics are unchanged.
        $delivered_size = null;
        $delivered_format = '';
        $delivered_percent = null;
        if ( $is_optimized ) {
            $main_for_delivered = ( $effective_size > 0 ? $effective_size : max( 0, (int) $file_size ) );
            $original_for_calc = 0;
            if ( !$savings_unknown ) {
                $original_for_calc = ( $backup_size_bytes > 0 ? $backup_size_bytes : $main_for_delivered + max( 0, (int) $bytes_saved ) );
            }
            $delivered = ImgSentry_Optimization_Stats::get_delivered_info(
                $main_for_delivered,
                $original_for_calc,
                $next_gen_formats,
                (string) $output_format
            );
            $delivered_size = (int) $delivered['size'];
            $delivered_format = (string) $delivered['format'];
            $delivered_percent = $delivered['percent'];
        }
        $has_webp_val = !empty( $next_gen_formats['webp']['exists'] );
        $has_avif_val = !empty( $next_gen_formats['avif']['exists'] );
        $deep_needed = (bool) $get_meta_val( '_imgsentry_deep_scan_needed' );
        return array(
            'id'                        => $post->ID,
            'title'                     => get_the_title( $post->ID ),
            'filename'                  => $filename,
            'url'                       => $file_url,
            'thumb_url'                 => $thumb_url,
            'preview_url'               => $preview_url,
            'thumbnail_url'             => $thumb_url,
            'mime_type'                 => $mime,
            'category'                  => $category,
            'extension'                 => $ext,
            'display_extension'         => $display_extension,
            'effective_format'          => $display_extension,
            'file_size'                 => $file_size,
            'filesize'                  => $file_size,
            'size_unknown'              => $size_unknown,
            'formatted_size'            => $formatted_size,
            'width'                     => ( $width ? (int) $width : '' ),
            'height'                    => ( $height ? (int) $height : '' ),
            'dimensions'                => $dimensions,
            'upload_date'               => get_the_date( 'Y-m-d H:i:s', $post->ID ),
            'parent_id'                 => $post->post_parent,
            'parent_title'              => ( $post->post_parent ? get_the_title( $post->post_parent ) : '' ),
            'is_attached'               => $post->post_parent > 0,
            'in_use'                    => $in_use,
            'use_reasons'               => $use_reasons,
            'location'                  => $relative_location,
            'last_scan_time'            => ( !empty( $last_scan_time ) ? $last_scan_time : null ),
            'file_exists'               => $file_exists,
            'file_missing'              => $file_missing,
            'thumbnail_sizes_bytes'     => $thumbnail_sizes_bytes,
            'thumbnail_sizes_formatted' => size_format( $thumbnail_sizes_bytes, 2 ),
            'sub_sizes_count'           => $sub_sizes_count,
            'is_trashed'                => $is_trashed,
            'original_path'             => $normalized_original,
            'trashed_date'              => ( $trashed_date ? $trashed_date : '' ),
            'days_in_trash'             => $days_in_trash,
            'is_optimized'              => $is_optimized,
            'externally_optimized'      => (bool) $externally_optimized,
            'optimization_status'       => ( $is_optimized || 'completed' === $optimization_status || 'optimized' === $optimization_status ? 'optimized' : (( $optimization_status ? $optimization_status : 'ready' )) ),
            'bytes_saved'               => $bytes_saved,
            'percent_saved'             => ( null !== $percent_saved && '' !== $percent_saved ? (float) $percent_saved : null ),
            'savings_unknown'           => $savings_unknown,
            'optimized_size'            => ( $is_optimized ? ( $effective_size > 0 ? $effective_size : max( 0, $file_size ) ) : null ),
            'effective_size'            => ( $is_optimized ? ( $effective_size > 0 ? $effective_size : max( 0, $file_size ) ) : null ),
            'delivered_size'            => $delivered_size,
            'delivered_format'          => $delivered_format,
            'delivered_percent_saved'   => $delivered_percent,
            'optimized_date'            => $optimized_date,
            'has_backup'                => $has_backup,
            'backup_exists'             => (bool) $has_backup,
            'backup_size_bytes'         => $backup_size_bytes,
            'nextgen_sizes_bytes'       => $nextgen_sizes_bytes,
            'output_format'             => ( $output_format ? $output_format : null ),
            'next_gen_formats'          => ( !empty( $next_gen_formats ) && is_array( $next_gen_formats ) ? $next_gen_formats : array() ),
            'has_webp'                  => $has_webp_val,
            'has_avif'                  => $has_avif_val,
            'deep_scan_needed'          => $deep_needed,
        );
    }

    /**
     * Categorize media item based on mime type or file extension.
     *
     * @param string $mime Mime type.
     * @param string $ext File extension.
     * @return string Category name.
     */
    public static function determine_category( $mime, $ext ) {
        if ( strpos( $mime, 'image/' ) === 0 ) {
            return 'images';
        }
        if ( strpos( $mime, 'audio/' ) === 0 ) {
            return 'audio';
        }
        if ( strpos( $mime, 'video/' ) === 0 ) {
            return 'video';
        }
        if ( in_array( $ext, array(
            'woff',
            'woff2',
            'ttf',
            'otf',
            'eot'
        ), true ) || strpos( $mime, 'font' ) !== false ) {
            return 'fonts';
        }
        if ( in_array( $ext, array(
            'pdf',
            'doc',
            'docx',
            'xls',
            'xlsx',
            'ppt',
            'pptx',
            'txt',
            'csv'
        ), true ) || strpos( $mime, 'pdf' ) !== false || strpos( $mime, 'document' ) !== false ) {
            return 'documents';
        }
        return 'other';
    }

    /**
     * Invalidate dashboard stats transient cache.
     */
    public static function invalidate_dashboard_cache() {
        delete_transient( 'imgsentry_dashboard_stats_cache' );
    }

    /**
     * Callback for postmeta mutations to invalidate dashboard stats cache when relevant keys change.
     *
     * @param int    $meta_id    ID of updated metadata entry.
     * @param int    $object_id  Attachment / Post ID.
     * @param string $meta_key   Metadata key name.
     */
    public static function on_postmeta_change( $meta_id, $object_id, $meta_key ) {
        if ( in_array( $meta_key, array(
            '_imgsentry_bytes_saved',
            '_imgsentry_optimized',
            '_imgsentry_optimization_status',
            '_imgsentry_trashed',
            '_filesize',
            '_imgsentry_nextgen_formats',
            '_imgsentry_output_format'
        ), true ) ) {
            self::invalidate_dashboard_cache();
        }
    }

    /**
     * Retrieve total stats across the media library.
     * Returns true values and flags incomplete if sizes cannot be computed.
     * Supports optional force_refresh parameter. When false, reuses any existing
     * cached 'total_stats' inside 'imgsentry_dashboard_stats_cache'.
     *
     * @param bool $force_refresh Set true to bypass cache and recalculate.
     * @return array Stats payload.
     */
    public static function get_total_stats( $force_refresh = false ) {
        if ( !$force_refresh ) {
            $cached = get_transient( 'imgsentry_dashboard_stats_cache' );
            if ( is_array( $cached ) && isset( $cached['total_stats'] ) && is_array( $cached['total_stats'] ) ) {
                return $cached['total_stats'];
            }
        }
        global $wpdb;
        $total_media = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_status = 'inherit'" );
        $trashed_media = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_trashed' AND meta_value = '1'" );
        $raw_total_size = $wpdb->get_var( "SELECT SUM(CAST(meta_value AS UNSIGNED)) FROM {$wpdb->postmeta} WHERE meta_key = '_filesize'" );
        $total_size_incomplete = false;
        $total_size = 0;
        if ( null !== $raw_total_size && '' !== $raw_total_size ) {
            $total_size = (int) $raw_total_size;
        } else {
            $total_size_incomplete = true;
        }
        $trashed_size = 0;
        $media_trash_dir = '';
        if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
            $media_trash_dir = wp_normalize_path( ImgSentry_Storage_Paths::get_trash_media_dir() );
            if ( is_dir( $media_trash_dir ) ) {
                $trashed_size = self::get_dir_size( $media_trash_dir );
            }
        }
        if ( 0 === $trashed_size ) {
            $trashed_ids = $wpdb->get_col( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_trashed' AND meta_value = '1'" );
            if ( !empty( $trashed_ids ) ) {
                foreach ( $trashed_ids as $tid ) {
                    $tf = get_attached_file( $tid );
                    if ( $tf && file_exists( $tf ) ) {
                        $norm_tf = wp_normalize_path( $tf );
                        $fm_trash_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? wp_normalize_path( ImgSentry_Storage_Paths::get_trash_files_dir() ) : '' );
                        if ( (empty( $media_trash_dir ) || strpos( $norm_tf, $media_trash_dir ) !== 0) && (empty( $fm_trash_dir ) || strpos( $norm_tf, $fm_trash_dir ) !== 0) ) {
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                            $trashed_size += (int) @filesize( $tf );
                        }
                    }
                }
            }
        }
        // Calculate a detailed per-category breakdown of trashed items with a 75% max_execution_time budget guard
        $trashed_category_breakdown = array(
            'images'                 => array(
                'count' => 0,
                'size'  => 0,
            ),
            'video'                  => array(
                'count' => 0,
                'size'  => 0,
            ),
            'documents'              => array(
                'count' => 0,
                'size'  => 0,
            ),
            'audio'                  => array(
                'count' => 0,
                'size'  => 0,
            ),
            'fonts'                  => array(
                'count' => 0,
                'size'  => 0,
            ),
            'other'                  => array(
                'count' => 0,
                'size'  => 0,
            ),
            'calculation_incomplete' => false,
        );
        $start_time_trash = microtime( true );
        $raw_limit_trash = (int) ini_get( 'max_execution_time' );
        $is_unlimited_trash = 0 === $raw_limit_trash;
        $time_budget_trash = ( $is_unlimited_trash ? 60.0 : (( $raw_limit_trash > 0 ? $raw_limit_trash : 30 )) * 0.75 );
        $calculation_incomplete_trash = false;
        $upload_dir = wp_upload_dir();
        $basedir = ( isset( $upload_dir['basedir'] ) ? $upload_dir['basedir'] : '' );
        $trashed_results = $wpdb->get_results( "SELECT \n\t\t\t\tp.ID,\n\t\t\t\tp.post_mime_type,\n\t\t\t\tp.guid,\n\t\t\t\tpm_size.meta_value AS filesize_meta,\n\t\t\t\tpm_file.meta_value AS attached_file,\n\t\t\t\tpm_meta.meta_value AS attachment_metadata\n\t\t\t FROM {$wpdb->posts} p\n\t\t\t JOIN {$wpdb->postmeta} pm_trash ON p.ID = pm_trash.post_id AND pm_trash.meta_key = '_imgsentry_trashed' AND pm_trash.meta_value = '1'\n\t\t\t LEFT JOIN {$wpdb->postmeta} pm_size ON p.ID = pm_size.post_id AND pm_size.meta_key = '_filesize'\n\t\t\t LEFT JOIN {$wpdb->postmeta} pm_file ON p.ID = pm_file.post_id AND pm_file.meta_key = '_wp_attached_file'\n\t\t\t LEFT JOIN {$wpdb->postmeta} pm_meta ON p.ID = pm_meta.post_id AND pm_meta.meta_key = '_wp_attachment_metadata'\n\t\t\t WHERE p.post_type = 'attachment'" );
        if ( !empty( $trashed_results ) ) {
            foreach ( $trashed_results as $row ) {
                if ( microtime( true ) - $start_time_trash > $time_budget_trash ) {
                    $calculation_incomplete_trash = true;
                    break;
                }
                $mime = strtolower( (string) $row->post_mime_type );
                $guid = (string) $row->guid;
                $path_ext = pathinfo( wp_parse_url( $guid, PHP_URL_PATH ), PATHINFO_EXTENSION );
                $ext = strtoupper( $path_ext );
                $size = self::resolve_attachment_filesize(
                    ( isset( $row->filesize_meta ) ? $row->filesize_meta : null ),
                    ( isset( $row->attachment_metadata ) ? $row->attachment_metadata : null ),
                    ( isset( $row->attached_file ) ? $row->attached_file : '' ),
                    $basedir
                );
                $cat = 'other';
                if ( 0 === strpos( $mime, 'image/' ) ) {
                    $cat = 'images';
                } elseif ( 0 === strpos( $mime, 'video/' ) ) {
                    $cat = 'video';
                } elseif ( 0 === strpos( $mime, 'audio/' ) ) {
                    $cat = 'audio';
                } elseif ( in_array( strtolower( $ext ), array(
                    'woff',
                    'woff2',
                    'ttf',
                    'otf',
                    'eot'
                ), true ) || false !== strpos( $mime, 'font' ) ) {
                    $cat = 'fonts';
                } elseif ( in_array( strtolower( $ext ), array(
                    'pdf',
                    'doc',
                    'docx',
                    'xls',
                    'xlsx',
                    'ppt',
                    'pptx',
                    'txt',
                    'csv'
                ), true ) || false !== strpos( $mime, 'pdf' ) || false !== strpos( $mime, 'document' ) ) {
                    $cat = 'documents';
                }
                $trashed_category_breakdown[$cat]['count']++;
                $trashed_category_breakdown[$cat]['size'] += $size;
            }
        }
        $trashed_category_breakdown['calculation_incomplete'] = $calculation_incomplete_trash;
        // Calculate actual sizes for transients, logs, and scanner data
        $raw_transient_size = $wpdb->get_var( $wpdb->prepare( "SELECT SUM(LENGTH(option_name) + LENGTH(option_value)) FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $wpdb->esc_like( '_transient_imgsentry_ng_url_' ) . '%', $wpdb->esc_like( '_transient_timeout_imgsentry_ng_url_' ) . '%' ) );
        $db_transients_bytes = ( $raw_transient_size ? (int) $raw_transient_size : 0 );
        $table_logs = $wpdb->prefix . 'imgsentry_logs';
        $db_logs_bytes = 0;
        $logs_table_exists = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table_logs ) );
        if ( $logs_table_exists ) {
            $table_size = $wpdb->get_var( $wpdb->prepare( "SELECT (data_length + index_length) FROM information_schema.TABLES WHERE table_schema = DATABASE() AND table_name = %s", $table_logs ) );
            if ( $table_size ) {
                $db_logs_bytes += (int) $table_size;
            } else {
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $row_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table_logs}" );
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $data_size = (int) $wpdb->get_var( "SELECT SUM(LENGTH(message) + IFNULL(LENGTH(details), 0)) FROM {$table_logs}" );
                $db_logs_bytes += $data_size + $row_count * 120;
            }
        }
        $audit_log_size = $wpdb->get_var( $wpdb->prepare( "SELECT LENGTH(option_value) FROM {$wpdb->options} WHERE option_name = %s", 'imgsentry_audit_log' ) );
        if ( $audit_log_size ) {
            $db_logs_bytes += (int) $audit_log_size;
        }
        $table_usage = $wpdb->prefix . 'imgsentry_attachment_usage';
        $db_usage_bytes = 0;
        $usage_table_exists = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table_usage ) );
        if ( $usage_table_exists ) {
            $table_size = $wpdb->get_var( $wpdb->prepare( "SELECT (data_length + index_length) FROM information_schema.TABLES WHERE table_schema = DATABASE() AND table_name = %s", $table_usage ) );
            if ( $table_size ) {
                $db_usage_bytes += (int) $table_size;
            } else {
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $row_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table_usage}" );
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                $sources_len = (int) $wpdb->get_var( "SELECT SUM(LENGTH(usage_sources)) FROM {$table_usage}" );
                $db_usage_bytes += $sources_len + $row_count * 150;
            }
        }
        $history_size = $wpdb->get_var( $wpdb->prepare( "SELECT SUM(LENGTH(option_value)) FROM {$wpdb->options} WHERE option_name IN (%s, %s)", 'imgsentry_scan_history', 'imgsentry_scan_status' ) );
        if ( $history_size ) {
            $db_usage_bytes += (int) $history_size;
        }
        $settings = get_option( IMGSENTRY_OPTION_KEY, array() );
        $retention_days = ( isset( $settings['retentionDays'] ) ? absint( $settings['retentionDays'] ) : (int) get_option( 'imgsentry_trash_days', 7 ) );
        // Calculate orphaned postmeta bytes
        $raw_orphmeta_size = $wpdb->get_var( $wpdb->prepare( "SELECT SUM(LENGTH(pm.meta_key) + LENGTH(pm.meta_value)) FROM {$wpdb->postmeta} pm LEFT JOIN {$wpdb->posts} p ON pm.post_id = p.ID WHERE pm.meta_key LIKE %s AND p.ID IS NULL", $wpdb->esc_like( '_imgsentry_' ) . '%' ) );
        $db_orphmeta_bytes = ( $raw_orphmeta_size ? (int) $raw_orphmeta_size : 0 );
        // Calculate orphaned scan records bytes
        $db_orphaned_scans_bytes = 0;
        if ( $usage_table_exists ) {
            $raw_orphscans_size = $wpdb->get_var( 
                // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
                "SELECT SUM(LENGTH(u.usage_sources) + 50) FROM {$table_usage} u LEFT JOIN {$wpdb->posts} p ON u.attachment_id = p.ID WHERE p.ID IS NULL"
             );
            if ( $raw_orphscans_size ) {
                $db_orphaned_scans_bytes = (int) $raw_orphscans_size;
            }
        }
        // Calculate thumbs cache bytes recursively
        $thumbs_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_cache_dir( 'thumbs' ) : wp_upload_dir()['basedir'] . '/imgsentry/cache/thumbs' );
        $thumbs_cache_bytes = self::get_dir_size( $thumbs_dir );
        return array(
            'total_media'                => $total_media,
            'trashed_media'              => $trashed_media,
            'total_size'                 => $total_size,
            'total_size_incomplete'      => $total_size_incomplete,
            'formatted_total'            => ( $total_size > 0 ? size_format( $total_size, 2 ) : (( $total_size_incomplete ? 'N/A' : '0 B' )) ),
            'trashed_size'               => $trashed_size,
            'formatted_trashed'          => ( $trashed_size > 0 ? size_format( $trashed_size, 2 ) : '0 B' ),
            'retention_days'             => $retention_days,
            'db_usage_bytes'             => $db_usage_bytes,
            'db_logs_bytes'              => $db_logs_bytes,
            'db_transients_bytes'        => $db_transients_bytes,
            'db_orphmeta_bytes'          => $db_orphmeta_bytes,
            'db_orphaned_scans_bytes'    => $db_orphaned_scans_bytes,
            'thumbs_cache_bytes'         => $thumbs_cache_bytes,
            'trashed_category_breakdown' => $trashed_category_breakdown,
        );
    }

    /**
     * Incrementally adjust the cached dashboard stats after a permanent deletion,
     * instead of forcing a full recursive disk scan + DB recompute.
     * Returns the adjusted total_stats array on success, or false if there was no
     * usable cache to adjust (caller should fall back to a full recompute in that case).
     *
     * @param int         $delta_count Number of items just permanently deleted.
     * @param int         $delta_bytes Total bytes freed by that deletion.
     * @param string|null $category    Optional category key ('images','video','documents','audio','fonts','other') to adjust the breakdown too.
     * @return array|false
     */
    public static function adjust_trash_stats_cache( $delta_count, $delta_bytes, $category = null ) {
        $cached = get_transient( 'imgsentry_dashboard_stats_cache' );
        if ( !is_array( $cached ) || !isset( $cached['total_stats'] ) || !is_array( $cached['total_stats'] ) ) {
            return false;
        }
        $stats = $cached['total_stats'];
        $stats['trashed_media'] = max( 0, (int) $stats['trashed_media'] - (int) $delta_count );
        $stats['trashed_size'] = max( 0, (int) $stats['trashed_size'] - (int) $delta_bytes );
        $stats['formatted_trashed'] = ( $stats['trashed_size'] > 0 ? size_format( $stats['trashed_size'], 2 ) : '0 B' );
        if ( $category && isset( $stats['trashed_category_breakdown'][$category] ) ) {
            $stats['trashed_category_breakdown'][$category]['count'] = max( 0, (int) $stats['trashed_category_breakdown'][$category]['count'] - (int) $delta_count );
            $stats['trashed_category_breakdown'][$category]['size'] = max( 0, (int) $stats['trashed_category_breakdown'][$category]['size'] - (int) $delta_bytes );
        }
        $cached['total_stats'] = $stats;
        $ttl = (int) apply_filters( 'imgsentry_dashboard_cache_ttl', 300 );
        if ( $ttl <= 0 ) {
            $ttl = 300;
        }
        set_transient( 'imgsentry_dashboard_stats_cache', $cached, $ttl );
        return $stats;
    }

    /**
     * Get stats to return after a permanent-delete operation: adjusts the existing
     * cache cheaply when possible, falling back to a full recompute only on a cache miss.
     *
     * @param int         $delta_count
     * @param int         $delta_bytes
     * @param string|null $category
     * @return array
     */
    public static function get_total_stats_after_mutation( $delta_count, $delta_bytes, $category = null ) {
        $adjusted = self::adjust_trash_stats_cache( $delta_count, $delta_bytes, $category );
        if ( false === $adjusted ) {
            return self::get_total_stats( true );
        }
        return $adjusted;
    }

    /**
     * Helper function to recursively compute directory size.
     *
     * @param string $dir Path to directory.
     * @return int Directory size in bytes.
     */
    public static function get_dir_size( $dir ) {
        $size = 0;
        if ( !is_dir( $dir ) ) {
            return 0;
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
        $files = @scandir( $dir );
        if ( !is_array( $files ) ) {
            return 0;
        }
        foreach ( $files as $file ) {
            if ( '.' === $file || '..' === $file ) {
                continue;
            }
            $path = $dir . '/' . $file;
            if ( is_dir( $path ) ) {
                $size += self::get_dir_size( $path );
            } elseif ( is_file( $path ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                $size += (int) @filesize( $path );
            }
        }
        return $size;
    }

    /**
     * One-time cleanup function for malformed imgsentry_scan_history database option.
     *
     * @return array Stats on repaired vs removed entries.
     */
    public static function clean_scan_history_data() {
        $raw_history = get_option( 'imgsentry_scan_history', array() );
        if ( !is_array( $raw_history ) ) {
            $raw_history = array();
        }
        $repaired_count = 0;
        $removed_count = 0;
        $cleaned = array();
        foreach ( $raw_history as $entry ) {
            if ( !is_array( $entry ) ) {
                $removed_count++;
                continue;
            }
            $has_id = !empty( $entry['id'] );
            $has_timestamp = !empty( $entry['timestamp'] );
            // Remove entry if both ID and timestamp are missing (completely unrepairable)
            if ( !$has_id && !$has_timestamp ) {
                $removed_count++;
                continue;
            }
            $needs_repair = false;
            if ( empty( $entry['id'] ) || !is_string( $entry['id'] ) ) {
                $entry['id'] = 'scan-' . time() . '-' . wp_generate_password( 6, false );
                $needs_repair = true;
            }
            if ( empty( $entry['timestamp'] ) || !is_string( $entry['timestamp'] ) ) {
                $entry['timestamp'] = current_time( 'mysql' );
                $needs_repair = true;
            }
            if ( empty( $entry['scanType'] ) || !is_string( $entry['scanType'] ) ) {
                $entry['scanType'] = 'Deep Scan';
                $needs_repair = true;
            }
            $numeric_fields = array(
                'totalScanned',
                'unusedCount',
                'deletedCount',
                'unusedSizeBytes',
                'durationSeconds'
            );
            foreach ( $numeric_fields as $num_field ) {
                if ( !isset( $entry[$num_field] ) || !is_numeric( $entry[$num_field] ) ) {
                    if ( isset( $entry['stats'] ) && is_array( $entry['stats'] ) && isset( $entry['stats'][$num_field] ) && is_numeric( $entry['stats'][$num_field] ) ) {
                        $entry[$num_field] = (int) $entry['stats'][$num_field];
                    } else {
                        $entry[$num_field] = 0;
                    }
                    $needs_repair = true;
                } else {
                    $entry[$num_field] = (int) $entry[$num_field];
                }
            }
            if ( empty( $entry['formattedUnusedSize'] ) || !is_string( $entry['formattedUnusedSize'] ) ) {
                $bytes = (int) $entry['unusedSizeBytes'];
                if ( $bytes >= 1073741824 ) {
                    $entry['formattedUnusedSize'] = number_format( $bytes / 1073741824, 2 ) . ' GB';
                } elseif ( $bytes >= 1048576 ) {
                    $entry['formattedUnusedSize'] = number_format( $bytes / 1048576, 2 ) . ' MB';
                } elseif ( $bytes >= 1024 ) {
                    $entry['formattedUnusedSize'] = number_format( $bytes / 1024, 2 ) . ' KB';
                } else {
                    $entry['formattedUnusedSize'] = $bytes . ' B';
                }
                $needs_repair = true;
            }
            if ( empty( $entry['status'] ) || !is_string( $entry['status'] ) ) {
                $entry['status'] = 'completed';
                $needs_repair = true;
            }
            if ( $needs_repair ) {
                $repaired_count++;
            }
            $cleaned[] = $entry;
        }
        update_option( 'imgsentry_scan_history', $cleaned );
        return array(
            'total'    => count( $raw_history ),
            'repaired' => $repaired_count,
            'removed'  => $removed_count,
            'cleaned'  => count( $cleaned ),
        );
    }

    /**
     * Backfill next-gen sibling metadata and effective delivered size for an attachment optimized prior to this fix.
     * Checks disk for existing .webp or .avif sibling files and writes postmeta.
     *
     * @param int $attachment_id
     * @param string|null $file_path
     * @return array Array with 'output_format', 'next_gen_formats', and 'effective_size'
     */
    public static function backfill_attachment_nextgen_meta( $attachment_id, $file_path = null ) {
        if ( empty( $file_path ) ) {
            $file_path = get_attached_file( $attachment_id );
        }
        $output_format = get_post_meta( $attachment_id, '_imgsentry_output_format', true );
        $next_gen_meta = get_post_meta( $attachment_id, '_imgsentry_nextgen_formats', true );
        $effective_size = (int) get_post_meta( $attachment_id, '_imgsentry_effective_size', true );
        if ( is_string( $next_gen_meta ) ) {
            $next_gen_meta = maybe_unserialize( $next_gen_meta );
        }
        if ( !empty( $output_format ) && !empty( $next_gen_meta ) && is_array( $next_gen_meta ) && $effective_size > 0 ) {
            return array(
                'output_format'    => $output_format,
                'next_gen_formats' => $next_gen_meta,
                'effective_size'   => $effective_size,
            );
        }
        $webp_exists = false;
        $webp_path = null;
        $webp_size = null;
        $avif_exists = false;
        $avif_path = null;
        $avif_size = null;
        if ( !empty( $file_path ) ) {
            $dir = dirname( $file_path );
            $filename_base = pathinfo( $file_path, PATHINFO_FILENAME );
            // Check WebP candidates (double extension or replaced extension)
            $candidate_webp_1 = $file_path . '.webp';
            $candidate_webp_2 = trailingslashit( $dir ) . $filename_base . '.webp';
            if ( file_exists( $candidate_webp_1 ) ) {
                $webp_exists = true;
                $webp_path = $candidate_webp_1;
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                $webp_size = (int) @filesize( $candidate_webp_1 );
            } elseif ( file_exists( $candidate_webp_2 ) ) {
                $webp_exists = true;
                $webp_path = $candidate_webp_2;
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                $webp_size = (int) @filesize( $candidate_webp_2 );
            }
            // Check AVIF candidates (double extension or replaced extension)
            $candidate_avif_1 = $file_path . '.avif';
            $candidate_avif_2 = trailingslashit( $dir ) . $filename_base . '.avif';
            if ( file_exists( $candidate_avif_1 ) ) {
                $avif_exists = true;
                $avif_path = $candidate_avif_1;
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                $avif_size = (int) @filesize( $candidate_avif_1 );
            } elseif ( file_exists( $candidate_avif_2 ) ) {
                $avif_exists = true;
                $avif_path = $candidate_avif_2;
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                $avif_size = (int) @filesize( $candidate_avif_2 );
            }
        }
        $next_gen_meta = array(
            'webp' => array(
                'exists'     => (bool) $webp_exists,
                'path'       => ( $webp_exists ? $webp_path : null ),
                'size_bytes' => $webp_size,
            ),
            'avif' => array(
                'exists'     => (bool) $avif_exists,
                'path'       => ( $avif_exists ? $avif_path : null ),
                'size_bytes' => $avif_size,
            ),
        );
        if ( empty( $output_format ) ) {
            if ( $avif_exists && $webp_exists ) {
                $output_format = 'both';
            } elseif ( $avif_exists ) {
                $output_format = 'avif';
            } elseif ( $webp_exists ) {
                $output_format = 'webp';
            } else {
                $output_format = 'original';
            }
        }
        // Calculate the size of the main file
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
        $primary_size = ( !empty( $file_path ) && file_exists( $file_path ) ? (int) @filesize( $file_path ) : 0 );
        $effective_size = $primary_size;
        $sibling_sizes = array();
        if ( $webp_exists && $webp_size > 0 ) {
            $sibling_sizes['webp'] = $webp_size;
        }
        if ( $avif_exists && $avif_size > 0 ) {
            $sibling_sizes['avif'] = $avif_size;
        }
        // The size that counts is the size of the main file (what people download). WebP / AVIF copies are not added to it.
        update_post_meta( $attachment_id, '_imgsentry_output_format', $output_format );
        update_post_meta( $attachment_id, '_imgsentry_nextgen_formats', $next_gen_meta );
        if ( $effective_size > 0 ) {
            update_post_meta( $attachment_id, '_imgsentry_effective_size', $effective_size );
            // Recompute _imgsentry_bytes_saved and _imgsentry_percent_saved against original backup if available
            $backup_path = get_post_meta( $attachment_id, '_imgsentry_backup_path', true );
            if ( empty( $backup_path ) ) {
                $backup_path = get_post_meta( $attachment_id, '_imgsentry_backup_original_path', true );
            }
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
            $original_size = ( !empty( $backup_path ) && file_exists( $backup_path ) ? (int) @filesize( $backup_path ) : 0 );
            if ( $original_size > 0 && $original_size >= $effective_size ) {
                $bytes_saved = max( 0, $original_size - $effective_size );
                $percent_saved = round( $bytes_saved / $original_size * 100, 2 );
                update_post_meta( $attachment_id, '_imgsentry_bytes_saved', $bytes_saved );
                update_post_meta( $attachment_id, '_imgsentry_percent_saved', $percent_saved );
                delete_post_meta( $attachment_id, '_imgsentry_savings_unknown' );
            } elseif ( $original_size <= 0 && !empty( $sibling_sizes ) && 'original' !== $output_format ) {
                // No pristine backup exists on disk to measure true original size.
                // Flag that savings cannot be reliably calculated from disk backfill
                update_post_meta( $attachment_id, '_imgsentry_savings_unknown', 1 );
            }
        }
        return array(
            'output_format'    => $output_format,
            'next_gen_formats' => $next_gen_meta,
            'effective_size'   => $effective_size,
        );
    }

    /**
     * Lightweight one-time migration to backfill nextgen format metadata
     * and effective size for existing attachments optimized prior to this fix.
     */
    public static function maybe_backfill_nextgen_meta() {
        $migration_flag = get_option( 'imgsentry_nextgen_meta_backfilled_v2', false );
        if ( $migration_flag ) {
            return;
        }
        global $wpdb;
        // Find up to 100 optimized attachments missing _imgsentry_effective_size or _imgsentry_output_format
        $post_ids = $wpdb->get_col( "SELECT p.post_id \n\t\t\t FROM {$wpdb->postmeta} p \n\t\t\t WHERE p.meta_key = '_imgsentry_optimized' AND p.meta_value = '1' \n\t\t\t   AND p.post_id NOT IN (\n\t\t\t\t   SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_effective_size'\n\t\t\t   )\n\t\t\t LIMIT 100" );
        if ( !empty( $post_ids ) ) {
            foreach ( $post_ids as $id ) {
                self::backfill_attachment_nextgen_meta( (int) $id );
            }
        }
        // If fewer than 100 were found, backfill is complete
        if ( empty( $post_ids ) || count( $post_ids ) < 100 ) {
            update_option( 'imgsentry_nextgen_meta_backfilled_v2', true, false );
        }
    }

    /**
     * Calculate real system / hidden storage breakdown from tracked paths and database records.
     * Includes time budget guard (75% of max_execution_time) per ImgSentry_FM_Core pattern,
     * returning 'calculation_incomplete' => true if interrupted.
     *
     * @return array Real calculated byte totals.
     */
    public static function get_system_storage_breakdown() {
        global $wpdb;
        $start_time = microtime( true );
        $raw_limit = (int) ini_get( 'max_execution_time' );
        $is_unlimited = 0 === $raw_limit;
        // Apply a 75% max_execution_time budget or 60s for VPS/unlimited (per ImgSentry_FM_Core pattern)
        $time_budget = ( $is_unlimited ? 60.0 : (( $raw_limit > 0 ? $raw_limit : 30 )) * 0.75 );
        $calculation_incomplete = false;
        // 1. Active Library: Primary attached files on disk + intermediate thumbnails
        $active_ids = $wpdb->get_col( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_status = 'inherit' AND ID NOT IN (\n\t\t\t\tSELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_trashed' AND meta_value = '1'\n\t\t\t)" );
        $active_primary_bytes = 0;
        $active_thumbnails_bytes = 0;
        $seen_active_files = array();
        if ( !empty( $active_ids ) ) {
            foreach ( $active_ids as $att_id ) {
                // Guard: check execution time against budget (75% of max_execution_time)
                if ( microtime( true ) - $start_time > $time_budget ) {
                    $calculation_incomplete = true;
                    break;
                }
                $file_path = get_attached_file( $att_id );
                if ( $file_path && file_exists( $file_path ) ) {
                    if ( !isset( $seen_active_files[$file_path] ) ) {
                        $seen_active_files[$file_path] = true;
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                        $active_primary_bytes += (int) @filesize( $file_path );
                    }
                    $meta = wp_get_attachment_metadata( $att_id );
                    if ( !empty( $meta['sizes'] ) && is_array( $meta['sizes'] ) ) {
                        $dir = dirname( $file_path );
                        foreach ( $meta['sizes'] as $sz ) {
                            if ( !empty( $sz['file'] ) ) {
                                $tp = trailingslashit( $dir ) . $sz['file'];
                                if ( !isset( $seen_active_files[$tp] ) && file_exists( $tp ) ) {
                                    $seen_active_files[$tp] = true;
                                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                                    $active_thumbnails_bytes += (int) @filesize( $tp );
                                }
                            }
                        }
                    }
                }
            }
        }
        $active_library_bytes = $active_primary_bytes + $active_thumbnails_bytes;
        // 2. Trash & Quarantine: File Manager Trash + Media Trash
        // Note: ImgSentry_Storage_Paths::get_trash_media_dir() is '.../imgsentry/trash/media/'
        //       ImgSentry_Storage_Paths::get_trash_files_dir() is '.../imgsentry/trash/files/'
        // These are mutually exclusive sibling directories, so they never overlap in physical paths.
        $trash_media_bytes = 0;
        $media_trash_dir = '';
        if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
            $media_trash_dir = wp_normalize_path( ImgSentry_Storage_Paths::get_trash_media_dir() );
            if ( is_dir( $media_trash_dir ) ) {
                $trash_media_bytes = self::get_dir_size( $media_trash_dir );
            }
        }
        $trash_fm_bytes = 0;
        $fm_trash_dir = '';
        if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
            $fm_trash_dir = wp_normalize_path( ImgSentry_Storage_Paths::get_trash_files_dir() );
            if ( is_dir( $fm_trash_dir ) ) {
                $trash_fm_bytes = self::get_dir_size( $fm_trash_dir );
            }
        }
        // Double-counting safeguard: ensure neither path is within the other
        if ( !empty( $media_trash_dir ) && !empty( $fm_trash_dir ) ) {
            if ( strpos( trailingslashit( $media_trash_dir ), trailingslashit( $fm_trash_dir ) ) === 0 || strpos( trailingslashit( $fm_trash_dir ), trailingslashit( $media_trash_dir ) ) === 0 ) {
                $trash_fm_bytes = 0;
                // Prevent overlap if configured to same tree
            }
        }
        $trash_quarantine_bytes = $trash_media_bytes + $trash_fm_bytes;
        // Fallback for legacy WP trashed media attachments not stored in imgsentry/trash/media/
        if ( 0 === $trash_media_bytes ) {
            $trashed_ids = $wpdb->get_col( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_trashed' AND meta_value = '1'" );
            if ( !empty( $trashed_ids ) ) {
                foreach ( $trashed_ids as $tid ) {
                    $tf = get_attached_file( $tid );
                    if ( $tf && file_exists( $tf ) ) {
                        $norm_tf = wp_normalize_path( $tf );
                        // Verify this file is not already inside fm_trash_dir or media_trash_dir
                        if ( (empty( $media_trash_dir ) || strpos( $norm_tf, $media_trash_dir ) !== 0) && (empty( $fm_trash_dir ) || strpos( $norm_tf, $fm_trash_dir ) !== 0) ) {
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                            $trash_media_bytes += (int) @filesize( $tf );
                        }
                    }
                }
                $trash_quarantine_bytes = $trash_media_bytes + $trash_fm_bytes;
            }
        }
        // 3. Optimization Backups: tracked via _imgsentry_backup_path / _imgsentry_backup_original_path
        $backup_paths = $wpdb->get_col( "SELECT DISTINCT meta_value FROM {$wpdb->postmeta} \n\t\t\t WHERE meta_key IN ('_imgsentry_backup_path', '_imgsentry_backup_original_path') \n\t\t\t AND meta_value != ''" );
        $optimization_backups_bytes = 0;
        $seen_backups = array();
        if ( !empty( $backup_paths ) ) {
            foreach ( $backup_paths as $bp ) {
                if ( !isset( $seen_backups[$bp] ) && file_exists( $bp ) ) {
                    $seen_backups[$bp] = true;
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                    $optimization_backups_bytes += (int) @filesize( $bp );
                }
            }
        }
        // 4. Next-Gen Sibling Formats: tracked via _imgsentry_nextgen_formats
        $nextgen_meta = $wpdb->get_col( "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_nextgen_formats' AND meta_value != ''" );
        $nextgen_siblings_bytes = 0;
        $seen_ng = array();
        $webp_count = 0;
        $avif_count = 0;
        if ( !empty( $nextgen_meta ) ) {
            foreach ( $nextgen_meta as $raw_ng ) {
                $ng = maybe_unserialize( $raw_ng );
                if ( is_array( $ng ) ) {
                    foreach ( array('webp', 'avif') as $fmt ) {
                        $has_format = false;
                        if ( !empty( $ng[$fmt]['exists'] ) ) {
                            $has_format = true;
                        } else {
                            $path_to_check = ( !empty( $ng[$fmt]['path'] ) ? $ng[$fmt]['path'] : (( !empty( $ng[$fmt]['file_path'] ) ? $ng[$fmt]['file_path'] : '' )) );
                            if ( !empty( $path_to_check ) && file_exists( $path_to_check ) ) {
                                $has_format = true;
                            }
                        }
                        if ( $has_format ) {
                            if ( 'webp' === $fmt ) {
                                $webp_count++;
                            } elseif ( 'avif' === $fmt ) {
                                $avif_count++;
                            }
                        }
                        if ( !empty( $ng[$fmt]['file_path'] ) && file_exists( $ng[$fmt]['file_path'] ) ) {
                            $p = $ng[$fmt]['file_path'];
                            if ( !isset( $seen_ng[$p] ) ) {
                                $seen_ng[$p] = true;
                                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                                $nextgen_siblings_bytes += (int) @filesize( $p );
                            }
                        } elseif ( !empty( $ng[$fmt]['size_bytes'] ) && !empty( $ng[$fmt]['exists'] ) ) {
                            $nextgen_siblings_bytes += (int) $ng[$fmt]['size_bytes'];
                        }
                    }
                }
            }
        }
        $nextgen_count = $webp_count + $avif_count;
        return array(
            'active_library_bytes'       => $active_library_bytes,
            'active_primary_bytes'       => $active_primary_bytes,
            'active_thumbnails_bytes'    => $active_thumbnails_bytes,
            'trash_quarantine_bytes'     => $trash_quarantine_bytes,
            'trash_media_bytes'          => $trash_media_bytes,
            'trash_fm_bytes'             => $trash_fm_bytes,
            'optimization_backups_bytes' => $optimization_backups_bytes,
            'nextgen_siblings_bytes'     => $nextgen_siblings_bytes,
            'calculation_incomplete'     => $calculation_incomplete,
            'nextgen_siblings_count'     => $nextgen_count,
            'webp_copies_count'          => $webp_count,
            'avif_copies_count'          => $avif_count,
        );
    }

    /**
     * Multi-tier helper to resolve attachment filesize accurately without redundant I/O.
     * 1. _filesize custom postmeta key
     * 2. _wp_attachment_metadata serialized array ('filesize' or 'file_size')
     * 3. Physical filesystem filesize() check
     *
     * @param mixed  $filesize_meta        _filesize meta value.
     * @param mixed  $attachment_metadata  _wp_attachment_metadata raw or serialized value.
     * @param string $attached_file        _wp_attached_file relative path.
     * @param string $basedir              WP uploads basedir.
     * @return int Filesize in bytes.
     */
    public static function resolve_attachment_filesize(
        $filesize_meta = null,
        $attachment_metadata = null,
        $attached_file = '',
        $basedir = ''
    ) {
        if ( !empty( $filesize_meta ) && intval( $filesize_meta ) > 0 ) {
            return intval( $filesize_meta );
        }
        $metadata = maybe_unserialize( $attachment_metadata );
        if ( is_array( $metadata ) ) {
            if ( !empty( $metadata['filesize'] ) && intval( $metadata['filesize'] ) > 0 ) {
                return intval( $metadata['filesize'] );
            } elseif ( !empty( $metadata['file_size'] ) && intval( $metadata['file_size'] ) > 0 ) {
                return intval( $metadata['file_size'] );
            }
        }
        if ( !empty( $attached_file ) ) {
            if ( empty( $basedir ) ) {
                $upload_dir = wp_upload_dir();
                $basedir = ( isset( $upload_dir['basedir'] ) ? $upload_dir['basedir'] : '' );
            }
            if ( !empty( $basedir ) ) {
                $file_path = path_join( $basedir, $attached_file );
                if ( file_exists( $file_path ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                    return (int) @filesize( $file_path );
                }
            }
        }
        return 0;
    }

    /**
     * Recursively scan the trash media directory and purge any orphaned/untracked quarantine media folder.
     *
     * @return array Results summary.
     */
    public static function purge_orphaned_quarantine_files() {
        if ( !class_exists( 'ImgSentry_Storage_Paths' ) ) {
            return array(
                'deleted_folders' => 0,
            );
        }
        $trash_media_base = wp_normalize_path( ImgSentry_Storage_Paths::get_trash_media_dir() );
        if ( !is_dir( $trash_media_base ) ) {
            return array(
                'deleted_folders' => 0,
            );
        }
        $deleted_folders = 0;
        try {
            // Find all attachment folders: trash/media/{year}/{month}/{id}/
            $candidates = glob( trailingslashit( $trash_media_base ) . '*/*/*', GLOB_ONLYDIR );
            if ( !is_array( $candidates ) ) {
                $candidates = array();
            }
            // Also support legacy/flat structures: trash/media/{id}/
            $legacy_candidates = glob( trailingslashit( $trash_media_base ) . '*', GLOB_ONLYDIR );
            if ( is_array( $legacy_candidates ) ) {
                foreach ( $legacy_candidates as $legacy ) {
                    $base = basename( $legacy );
                    if ( is_numeric( $base ) && is_dir( $legacy ) ) {
                        $candidates[] = $legacy;
                    }
                }
            }
            $candidates = array_unique( $candidates );
            foreach ( $candidates as $folder ) {
                $folder = wp_normalize_path( $folder );
                $id_str = basename( $folder );
                if ( !is_numeric( $id_str ) ) {
                    continue;
                }
                $id = intval( $id_str );
                // Check whether post exists and is flagged as trashed
                $post_exists = false;
                $has_trashed_meta = false;
                if ( $id > 0 ) {
                    $post = get_post( $id );
                    if ( $post && 'attachment' === $post->post_type ) {
                        $post_exists = true;
                        $trashed_meta = get_post_meta( $id, '_imgsentry_trashed', true );
                        if ( '1' === $trashed_meta ) {
                            $has_trashed_meta = true;
                        }
                    }
                }
                if ( !$post_exists || !$has_trashed_meta ) {
                    // Delete that orphaned subfolder and its contents
                    if ( class_exists( 'ImgSentry_Cron' ) ) {
                        ImgSentry_Cron::delete_directory_recursively( $folder );
                    } elseif ( method_exists( 'ImgSentry_Ajax_Trash', 'delete_quarantine_folder' ) ) {
                        ImgSentry_Ajax_Trash::delete_quarantine_folder( $folder );
                    } else {
                        self::delete_dir_recursively_fallback( $folder );
                    }
                    if ( is_dir( $folder ) ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on some hosts; the result is checked. Removes an empty plugin-owned folder; WP_Filesystem is not available in cron or background requests.
                        @rmdir( $folder );
                    }
                    $deleted_folders++;
                }
            }
            // Clean up any empty parent month or year directories that might now be empty
            $years = glob( trailingslashit( $trash_media_base ) . '*', GLOB_ONLYDIR );
            if ( is_array( $years ) ) {
                foreach ( $years as $year_dir ) {
                    $months = glob( trailingslashit( $year_dir ) . '*', GLOB_ONLYDIR );
                    if ( is_array( $months ) ) {
                        foreach ( $months as $month_dir ) {
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                            $month_contents = array_diff( ( @scandir( $month_dir ) ?: array() ), array('.', '..') );
                            $artifacts = array('.DS_Store', 'Thumbs.db', 'desktop.ini');
                            $filtered = array_filter( $month_contents, function ( $item ) use($artifacts) {
                                return !in_array( $item, $artifacts, true );
                            } );
                            if ( empty( $filtered ) ) {
                                foreach ( $month_contents as $file ) {
                                    wp_delete_file( trailingslashit( $month_dir ) . $file );
                                }
                                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on some hosts; the result is checked. Removes an empty plugin-owned folder; WP_Filesystem is not available in cron or background requests.
                                @rmdir( $month_dir );
                            }
                        }
                    }
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
                    $year_contents = array_diff( ( @scandir( $year_dir ) ?: array() ), array('.', '..') );
                    $artifacts = array('.DS_Store', 'Thumbs.db', 'desktop.ini');
                    $filtered = array_filter( $year_contents, function ( $item ) use($artifacts) {
                        return !in_array( $item, $artifacts, true );
                    } );
                    if ( empty( $filtered ) ) {
                        foreach ( $year_contents as $file ) {
                            wp_delete_file( trailingslashit( $year_dir ) . $file );
                        }
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on some hosts; the result is checked. Removes an empty plugin-owned folder; WP_Filesystem is not available in cron or background requests.
                        @rmdir( $year_dir );
                    }
                }
            }
        } catch ( Exception $e ) {
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::error( 'Error during orphaned quarantine files scan: ' . $e->getMessage() );
            }
        }
        self::invalidate_dashboard_cache();
        if ( $deleted_folders > 0 && class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::info( 'Orphaned quarantine files cleanup completed', array(
                'type'    => 'Maintenance',
                'source'  => 'Scanner Engine',
                'details' => sprintf( 'Removed %d orphaned quarantine media folder(s) from trash/media/.', $deleted_folders ),
            ) );
        }
        return array(
            'deleted_folders' => $deleted_folders,
        );
    }

    /**
     * Get distinct locations/subfolders for trashed attachments.
     *
     * @return array Array containing 'options' and 'calculation_incomplete'.
     */
    public static function get_distinct_trash_locations() {
        global $wpdb;
        $sql = "SELECT pm_file.meta_value AS attached_file\n\t\t\t\tFROM {$wpdb->posts} p\n\t\t\t\tINNER JOIN {$wpdb->postmeta} pm_trash ON p.ID = pm_trash.post_id AND pm_trash.meta_key = '_imgsentry_trashed' AND pm_trash.meta_value = '1'\n\t\t\t\tLEFT JOIN {$wpdb->postmeta} pm_file ON p.ID = pm_file.post_id AND pm_file.meta_key = '_wp_attached_file'\n\t\t\t\tWHERE p.post_type = 'attachment' AND p.post_status IN ('trash', 'inherit')";
        // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name comes from $wpdb->prefix and cannot be a placeholder; no user input.
        $rows = $wpdb->get_results( $sql );
        if ( empty( $rows ) ) {
            return array(
                'options'                => array(),
                'calculation_incomplete' => false,
            );
        }
        $folder_counts = array();
        foreach ( $rows as $row ) {
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
            $folder_key = ( !empty( $dir ) ? $dir : 'Root' );
            if ( !isset( $folder_counts[$folder_key] ) ) {
                $folder_counts[$folder_key] = 0;
            }
            $folder_counts[$folder_key]++;
        }
        ksort( $folder_counts );
        $options = array();
        foreach ( $folder_counts as $folder => $count ) {
            $value = ( 'Root' === $folder ? 'root' : $folder );
            $label = ( 'Root' === $folder ? 'Uploads Root' : $folder );
            $options[] = array(
                'value' => $value,
                'label' => $label,
                'count' => $count,
            );
        }
        return array(
            'options'                => $options,
            'calculation_incomplete' => false,
        );
    }

    /**
     * Simple directory recursive deletion helper.
     *
     * @param string $dir Path to directory.
     */
    private static function delete_dir_recursively_fallback( string $dir ) : void {
        if ( !is_dir( $dir ) ) {
            return;
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call can fail on some hosts; the result is checked.
        $files = @scandir( $dir );
        if ( !is_array( $files ) ) {
            return;
        }
        foreach ( $files as $file ) {
            if ( '.' === $file || '..' === $file ) {
                continue;
            }
            $path = $dir . '/' . $file;
            if ( is_dir( $path ) ) {
                self::delete_dir_recursively_fallback( $path );
            } else {
                wp_delete_file( $path );
            }
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call can fail on some hosts; the result is checked. Removes an empty plugin-owned folder; WP_Filesystem is not available in cron or background requests.
        @rmdir( $dir );
    }

}
