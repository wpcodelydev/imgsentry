<?php

/**
 * ImgSentry Image Optimizer Engine
 *
 * Real image compression, resizing, EXIF stripping, format conversion (WebP/AVIF),
 * and automatic original backups for WordPress Media Library attachments.
 *
 * Hardened with per-attachment concurrency locking, strict option clamping,
 * path traversal guards, memory-safety heuristics, and automated cache invalidation.
 *
 * @package ImgSentry
 */
if ( !defined( 'ABSPATH' ) ) {
    exit;
    // Exit if accessed directly.
}
class ImgSentry_Optimizer_Engine {
    /**
     * Primary method to optimize a single WordPress attachment.
     *
     * @param int   $attachment_id WordPress attachment ID.
     * @param array $options       Array of optimization options:
     *                             - compression_level (string|int): 'lossless'|'balanced'|'aggressive'|'custom' or quality % (1-100)
     *                             - quality (int): Specific quality value (1-100)
     *                             - max_width (int): Maximum image width in pixels (clamped 0-10000)
     *                             - max_height (int): Maximum image height in pixels (clamped 0-10000)
     *                             - keep_exif (bool): Preserve EXIF metadata (default false)
     *                             - preserve_transparency (bool): Preserve alpha transparency (default true)
     *                             - output_format (string): 'original'|'webp'|'avif'
     *                             - generate_backup (bool): Create backup of original file (default true)
     * @return array Structured result array.
     */
    public static function optimize( $attachment_id, $options = array() ) {
        $attachment_id = intval( $attachment_id );
        if ( $attachment_id <= 0 ) {
            return self::format_error( 0, 'invalid_attachment_id', 'Invalid attachment ID provided.' );
        }
        // Protect excluded/ignored files from optimization scanning/processing
        if ( class_exists( 'ImgSentry_Usage_Indexer' ) && ImgSentry_Usage_Indexer::is_attachment_path_excluded( $attachment_id ) ) {
            return self::format_error( $attachment_id, 'imgsentry_file_excluded', 'This media file is excluded/protected from optimization under Media Cleanup Manager settings.' );
        }
        // 1. Per-attachment concurrency locking (prevent double-processing race conditions)
        $lock_key = 'imgsentry_opt_lock_' . $attachment_id;
        $is_locked = get_transient( $lock_key );
        if ( !empty( $is_locked ) ) {
            return self::format_error( $attachment_id, 'attachment_locked', sprintf( 'Attachment #%d is currently being processed by another worker or request. Try again in a few moments.', $attachment_id ) );
        }
        // Set the transient lock. 120 seconds; the progress heartbeat renews it while a long job keeps working.
        set_transient( $lock_key, time(), 120 );
        if ( !class_exists( 'ImgSentry_Optimize_Progress' ) ) {
            require_once IMGSENTRY_PLUGIN_DIR . 'includes/class-imgsentry-optimize-progress.php';
        }
        // Step 1 (0-15%): preparation and backup.
        ImgSentry_Optimize_Progress::start( $attachment_id );
        try {
            // Resolve global settings fallback as authoritative baseline
            $global_backup_default = true;
            if ( class_exists( 'ImgSentry_Settings' ) ) {
                $imgsentry_settings = ImgSentry_Settings::instance()->get_settings();
                if ( isset( $imgsentry_settings['generateBackupBeforeOptimization'] ) ) {
                    $global_backup_default = (bool) $imgsentry_settings['generateBackupBeforeOptimization'];
                }
            }
            // Check if caller EXPLICITLY signaled an intentional per-call override for generate_backup
            $has_explicit_backup_override = is_array( $options ) && array_key_exists( 'generate_backup', $options );
            $explicit_backup_override = ( $has_explicit_backup_override ? filter_var( $options['generate_backup'], FILTER_VALIDATE_BOOLEAN ) : null );
            // 2. Parse and sanitize default options defensively
            $defaults = array(
                'compression_level'     => 'balanced',
                'quality'               => null,
                'resize_large'          => true,
                'max_width'             => 0,
                'max_height'            => 0,
                'keep_exif'             => false,
                'preserve_transparency' => true,
                'output_format'         => 'original',
                'generate_backup'       => $global_backup_default,
                'force'                 => false,
            );
            $options = wp_parse_args( $options, $defaults );
            // One spelling for the level ('Lossless', ' lossless ' ...), the checks below compare exact words.
            $options['compression_level'] = strtolower( trim( strval( $options['compression_level'] ) ) );
            // If caller provided an explicit override, respect it; otherwise strictly apply global setting
            if ( $has_explicit_backup_override ) {
                $options['generate_backup'] = (bool) $explicit_backup_override;
            } else {
                $options['generate_backup'] = (bool) $global_backup_default;
            }
            $resize_large = filter_var( $options['resize_large'], FILTER_VALIDATE_BOOLEAN );
            $options['resize_large'] = $resize_large;
            // Sane upper-bound clamping to prevent memory exhaustion / DoS attacks
            if ( $resize_large ) {
                $options['max_width'] = max( 0, min( 10000, intval( $options['max_width'] ) ) );
                $options['max_height'] = max( 0, min( 10000, intval( $options['max_height'] ) ) );
            } else {
                $options['max_width'] = 0;
                $options['max_height'] = 0;
            }
            $options['keep_exif'] = filter_var( $options['keep_exif'], FILTER_VALIDATE_BOOLEAN );
            $options['preserve_transparency'] = filter_var( $options['preserve_transparency'], FILTER_VALIDATE_BOOLEAN );
            $options['generate_backup'] = filter_var( $options['generate_backup'], FILTER_VALIDATE_BOOLEAN );
            $options['force'] = filter_var( $options['force'], FILTER_VALIDATE_BOOLEAN );
            // Strict output format whitelist
            $output_format = strtolower( trim( strval( $options['output_format'] ) ) );
            if ( !in_array( $output_format, array(
                'original',
                'webp',
                'avif',
                'both'
            ), true ) ) {
                $output_format = 'original';
            }
            $options['output_format'] = $output_format;
            // 3. Validate attachment post & guard against path traversal
            $current_file = get_attached_file( $attachment_id );
            if ( empty( $current_file ) || !file_exists( $current_file ) ) {
                return self::format_error( $attachment_id, 'file_not_found', "Source image file not found on disk at: {$current_file}" );
            }
            // Duplicate optimization prevention: check if image is already optimized
            $is_already_optimized = (bool) get_post_meta( $attachment_id, '_imgsentry_optimized', true );
            if ( $is_already_optimized && empty( $options['force'] ) ) {
                ImgSentry_Optimize_Progress::discard( $attachment_id );
                return array(
                    'success'       => true,
                    'skipped'       => true,
                    'attachment_id' => $attachment_id,
                    'message'       => __( 'Attachment is already optimized. Use force option to re-optimize.', 'imgsentry' ),
                );
            }
            // Already optimized by another plugin: leave it alone unless the caller forces it.
            if ( empty( $options['force'] ) && class_exists( 'ImgSentry_External_Optimizers' ) && ImgSentry_External_Optimizers::is_optimized( $attachment_id ) ) {
                ImgSentry_Optimize_Progress::discard( $attachment_id );
                return array(
                    'success'       => true,
                    'skipped'       => true,
                    'attachment_id' => $attachment_id,
                    'message'       => __( 'This media file is already optimized, no further optimization is required.', 'imgsentry' ),
                );
            }
            // Central quota / environment gate (Free monthly quota, no optimization on local/staging hosts).
            // Runs before any file is touched; a block here never marks the attachment as "failed".
            if ( class_exists( 'ImgSentry_Quota' ) ) {
                $quota_block = ImgSentry_Quota::check_can_optimize();
                if ( null !== $quota_block ) {
                    ImgSentry_Optimize_Progress::finish( $attachment_id, 'failed', $quota_block['message'] );
                    return ImgSentry_Quota::format_block_result( $attachment_id, $quota_block );
                }
            }
            // Path traversal check: verify file is within WordPress uploads directory
            $upload_dir = wp_upload_dir();
            $real_upload_base = realpath( $upload_dir['basedir'] );
            $real_current = realpath( $current_file );
            if ( !$real_upload_base || !$real_current || 0 !== strpos( wp_normalize_path( $real_current ), wp_normalize_path( $real_upload_base ) ) ) {
                return self::format_error( $attachment_id, 'path_traversal_blocked', 'Security violation: Attached file path resolves outside the WordPress uploads directory.' );
            }
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_is_writable -- Direct call on a plugin-owned path; WP_Filesystem is not available in cron or background requests.
            if ( !is_readable( $current_file ) || !is_writable( dirname( $current_file ) ) ) {
                return self::format_error( $attachment_id, 'file_permission_error', "Disk read/write permission denied for file: {$current_file}" );
            }
            // 4. Format conversion capability (AVIF / WebP): this server may not be able to write the requested
            // format. That is never an error: after the cloud decision (the cloud can write both) the output falls back
            // to what this server can do, see resolve_output_format().
            wp_raise_memory_limit( 'image' );
            // 5. Quality & compression level validation (Reject missing/invalid custom quality before any file operations)
            $quality = self::determine_quality( $options['compression_level'], $options['quality'] );
            if ( false === $quality ) {
                return self::format_error( $attachment_id, 'missing_custom_quality', 'Custom compression level selected but a valid numeric quality percentage (1-100) was not provided.' );
            }
            // Animated GIF / WebP / PNG / AVIF: re-encoding a single frame would destroy the animation. Leave them alone.
            if ( self::is_animated_image( $current_file ) ) {
                ImgSentry_Optimize_Progress::discard( $attachment_id );
                return array(
                    'success'       => true,
                    'skipped'       => true,
                    'attachment_id' => $attachment_id,
                    'message'       => __( 'Animated images are skipped so that their animation is not lost.', 'imgsentry' ),
                );
            }
            // 6. Source of Truth & Backup Logic (Stop generational quality loss)
            $backup_path = get_post_meta( $attachment_id, '_imgsentry_backup_original_path', true );
            if ( empty( $backup_path ) ) {
                $backup_path = get_post_meta( $attachment_id, '_imgsentry_backup_path', true );
            }
            $has_backup = false;
            $source_path = '';
            $source_mime = '';
            $source_ext = '';
            if ( !empty( $backup_path ) && file_exists( $backup_path ) ) {
                // Pristine original backup exists! ALWAYS use pristine backup as processing source.
                if ( !self::is_valid_backup_path( $backup_path ) ) {
                    return self::format_error( $attachment_id, 'path_traversal_blocked', 'Security violation: Backup path resolves outside allowed storage directories.' );
                }
                $source_path = $backup_path;
                $has_backup = true;
                $source_mime = get_post_meta( $attachment_id, '_imgsentry_original_mime_type', true );
                $source_ext = strtolower( pathinfo( $backup_path, PATHINFO_EXTENSION ) );
                if ( empty( $source_mime ) ) {
                    $source_mime = self::get_mime_from_extension( $source_ext, 'image/jpeg' );
                }
            } else {
                // No prior backup exists yet
                $current_ext = strtolower( pathinfo( $current_file, PATHINFO_EXTENSION ) );
                $current_mime = get_post_mime_type( $attachment_id );
                if ( empty( $current_mime ) && function_exists( 'mime_content_type' ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                    $current_mime = @mime_content_type( $current_file );
                }
                if ( empty( $current_mime ) ) {
                    $current_mime = self::get_mime_from_extension( $current_ext, 'image/jpeg' );
                }
                // Single source of truth for backup creation during optimization action: per-action toggle
                if ( !empty( $options['generate_backup'] ) ) {
                    // Ensure dedicated storage directory and security protection (.htaccess, index.php) exist
                    $storage_init = self::init_backup_storage();
                    if ( is_wp_error( $storage_init ) ) {
                        return self::format_error( $attachment_id, 'backup_dir_failed', $storage_init->get_error_message() );
                    }
                    // Create permanent original backup in dedicated subdirectory
                    $backup_dir = self::get_backup_base_dir( $attachment_id );
                    if ( !file_exists( $backup_dir ) ) {
                        if ( !wp_mkdir_p( $backup_dir ) ) {
                            return self::format_error( $attachment_id, 'backup_dir_failed', "Could not create backup directory at: {$backup_dir}" );
                        }
                    }
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call may fail on some hosts; the result is checked.
                    @chmod( $backup_dir, 0755 );
                    $original_filename_base = pathinfo( $current_file, PATHINFO_FILENAME );
                    $sanitized_base = sanitize_file_name( $original_filename_base );
                    if ( empty( $sanitized_base ) ) {
                        $sanitized_base = 'attachment-' . $attachment_id;
                    }
                    $original_ext = ( $current_ext ? $current_ext : 'jpg' );
                    $backup_file = $backup_dir . $sanitized_base . '-' . $attachment_id . '.' . $original_ext;
                    if ( !file_exists( $backup_file ) ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                        if ( !@copy( $current_file, $backup_file ) ) {
                            return self::format_error( $attachment_id, 'backup_copy_failed', "Failed to copy original file to backup path: {$backup_file}" );
                        }
                    }
                    $backup_path = $backup_file;
                    update_post_meta( $attachment_id, '_imgsentry_backup_original_path', $backup_path );
                    update_post_meta( $attachment_id, '_imgsentry_original_mime_type', $current_mime );
                    update_post_meta( $attachment_id, '_imgsentry_backup_path', $backup_path );
                    $source_path = $backup_path;
                    $has_backup = true;
                    $source_mime = $current_mime;
                    $source_ext = $original_ext;
                } else {
                    $source_path = $current_file;
                    $has_backup = false;
                    $source_mime = $current_mime;
                    $source_ext = $current_ext;
                }
            }
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $original_size = @filesize( $source_path );
            if ( !$original_size || $original_size <= 0 ) {
                return self::format_error( $attachment_id, 'empty_file', 'Source image file is empty or corrupt (0 bytes).' );
            }
            // Supported source formats check
            $supported_mimes = array(
                'image/jpeg',
                'image/png',
                'image/webp',
                'image/gif',
                'image/avif'
            );
            if ( !in_array( $source_mime, $supported_mimes, true ) && !in_array( $source_ext, array(
                'jpg',
                'jpeg',
                'png',
                'webp',
                'gif',
                'avif'
            ), true ) ) {
                return self::format_error( $attachment_id, 'unsupported_format', "Unsupported image format or MIME type: {$source_mime} ({$source_ext})." );
            }
            ImgSentry_Optimize_Progress::update(
                $attachment_id,
                15,
                1,
                __( 'Preparing and backing up', 'imgsentry' )
            );
            // 7. Memory safety check: estimate pixel memory requirements vs available memory_limit
            $memory_check = self::check_memory_safety( $source_path );
            $memory_tight = false;
            if ( !$memory_check['safe'] ) {
                // A low PHP memory_limit only stops GD. Imagick manages its own memory (and uses the disk when it is
                // short), so with Imagick installed the image is processed by Imagick alone.
                if ( 'memory_limit_risk' === $memory_check['error_code'] && extension_loaded( 'imagick' ) && class_exists( 'Imagick' ) ) {
                    $memory_tight = true;
                } else {
                    return self::format_error( $attachment_id, $memory_check['error_code'], $memory_check['message'] );
                }
            }
            // 8. Create temporary working file from pristine source in optimizer scratchpad
            $temp_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_temp_dir( 'optimizer' ) : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/temp/optimizer/' );
            if ( !file_exists( $temp_dir ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                @wp_mkdir_p( $temp_dir );
            }
            $temp_working_file = $temp_dir . 'opt-' . $attachment_id . '-' . wp_generate_password( 8, false ) . '.' . $source_ext;
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            if ( !@copy( $source_path, $temp_working_file ) ) {
                // The plugin's scratch folder is not writable here: use the server's own temp folder instead.
                $alt_temp_file = trailingslashit( get_temp_dir() ) . 'imgsentry-opt-' . $attachment_id . '-' . wp_generate_password( 8, false ) . '.' . $source_ext;
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                if ( @copy( $source_path, $alt_temp_file ) ) {
                    $temp_working_file = $alt_temp_file;
                } else {
                    return self::format_error( $attachment_id, 'temp_copy_failed', "Failed to copy pristine source to temporary working file: {$temp_working_file}" );
                }
            }
            // Determine target destination path for Step 1 (always primary image file in-place)
            $dest_dir = dirname( $current_file );
            if ( empty( $dest_dir ) || !file_exists( $dest_dir ) ) {
                $dest_dir = $upload_dir['path'];
            }
            $filename_base = pathinfo( $current_file, PATHINFO_FILENAME );
            if ( empty( $filename_base ) ) {
                $filename_base = 'attachment-' . $attachment_id;
            }
            $primary_dest_path = trailingslashit( $dest_dir ) . $filename_base . '.' . $source_ext;
            // Step 2 (15-45%): the main image.
            ImgSentry_Optimize_Progress::update(
                $attachment_id,
                15,
                2,
                __( 'Optimizing the main image', 'imgsentry' ),
                0,
                0,
                300
            );
            // CLOUD ROUTE: every plan optimizes on the ImgSentry server. The local engine below is the fallback.
            $cloud_used = false;
            $cloud_fallback = false;
            $cloud_process_result = null;
            $cloud_primary = null;
            $cloud_partial = false;
            if ( class_exists( 'ImgSentry_Cloud_Client' ) && ImgSentry_Cloud_Client::is_enabled() && ImgSentry_Cloud_Client::can_handle( $temp_working_file, $source_mime, $original_size ) ) {
                if ( function_exists( 'set_time_limit' ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
                    @set_time_limit( 300 );
                }
                set_transient( $lock_key, time(), 300 );
                $cloud_primary = self::cloud_optimize_primary(
                    $temp_working_file,
                    $primary_dest_path,
                    $options,
                    $quality,
                    $output_format
                );
                if ( 'ok' === $cloud_primary['status'] ) {
                    $cloud_used = true;
                    $cloud_process_result = array(
                        'success'       => true,
                        'new_file_path' => $cloud_primary['new_file_path'],
                        'engine_used'   => 'cloud',
                    );
                } elseif ( 'error' === $cloud_primary['status'] ) {
                    wp_delete_file( $temp_working_file );
                    ImgSentry_Optimize_Progress::finish( $attachment_id, 'failed', $cloud_primary['message'] );
                    // Not the image's fault: do not mark the attachment as failed.
                    return ImgSentry_Quota::format_block_result( $attachment_id, array(
                        'code'    => $cloud_primary['code'],
                        'message' => $cloud_primary['message'],
                    ) );
                } else {
                    // 'fallback' (server outage, allowed) or 'local' (the server cannot take this file): use the local engine.
                    $cloud_fallback = 'fallback' === $cloud_primary['status'];
                }
            }
            // 9. Detect image processing engine (Imagick preferred over GD)
            $use_imagick = extension_loaded( 'imagick' ) && class_exists( 'Imagick' );
            $use_gd = extension_loaded( 'gd' ) && function_exists( 'gd_info' );
            if ( $memory_tight ) {
                $use_gd = false;
            }
            if ( !$cloud_used && !$use_imagick && !$use_gd ) {
                wp_delete_file( $temp_working_file );
                return self::format_error( $attachment_id, 'no_image_library', 'Neither Imagick nor GD extension is enabled on this PHP server.' );
            }
            // The local engine can only write the formats this server supports: fall back instead of failing.
            if ( !$cloud_used ) {
                $resolved_format = self::resolve_output_format( $output_format, $use_imagick, $use_gd );
                if ( $resolved_format !== $output_format ) {
                    if ( class_exists( 'ImgSentry_Logger' ) ) {
                        ImgSentry_Logger::log( ImgSentry_Logger::LEVEL_INFO, sprintf( 'This server cannot create %s files, so "%s" was used instead.', strtoupper( $output_format ), $resolved_format ), array(
                            'type'      => 'Optimize',
                            'source'    => 'Optimizer Engine',
                            'object_id' => $attachment_id,
                        ) );
                    }
                    $output_format = $resolved_format;
                    $options['output_format'] = $resolved_format;
                }
            }
            // STEP 1: ALWAYS compress the primary image file in-place using GD or Imagick
            $process_result = ( $cloud_used ? $cloud_process_result : null );
            // The local engine writes to a scratch file first, so a result that is not smaller can be thrown away.
            $local_out = ( $cloud_used ? '' : trailingslashit( dirname( $temp_working_file ) ) . 'out-' . $attachment_id . '-' . wp_generate_password( 8, false ) . '.' . $source_ext );
            try {
                if ( $cloud_used ) {
                    // Already optimized by the server.
                } else {
                    // Imagick first, GD as the safety net (and the other way round): one engine failing is not an error.
                    $process_result = self::encode_with_best_engine(
                        $temp_working_file,
                        $local_out,
                        $attachment_id,
                        $options,
                        $quality,
                        'original',
                        $use_imagick,
                        $use_gd
                    );
                }
            } catch ( Exception $e ) {
                wp_delete_file( $temp_working_file );
                return self::format_error( $attachment_id, 'processing_exception', 'Image processing exception: ' . $e->getMessage() );
            } catch ( Throwable $t ) {
                wp_delete_file( $temp_working_file );
                return self::format_error( $attachment_id, 'processing_fatal', 'Fatal image processing error: ' . $t->getMessage() );
            } finally {
                if ( file_exists( $temp_working_file ) ) {
                    wp_delete_file( $temp_working_file );
                }
            }
            if ( empty( $process_result ) || !$process_result['success'] ) {
                return self::format_error( $attachment_id, $process_result['error_code'], $process_result['error_message'] );
            }
            if ( '' !== $local_out ) {
                clearstatcache( true );
                if ( !file_exists( $local_out ) ) {
                    return self::format_error( $attachment_id, 'output_missing', "Optimized primary file was not written to expected path: {$local_out}" );
                }
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $out_size = (int) @filesize( $local_out );
                // A resize / rotation only counts when the pixel size really changed (a resize that was asked for but not
                // needed must not let a bigger file through).
                $src_dims = wp_getimagesize( $source_path );
                $out_dims = wp_getimagesize( $local_out );
                $resize_asked = $src_dims && $out_dims && ($src_dims[0] !== $out_dims[0] || $src_dims[1] !== $out_dims[1]);
                if ( $out_size > 0 && ($resize_asked || $out_size < $original_size) ) {
                    // Smaller (or a resize was asked for): use the new file.
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call may fail on some hosts; the result is checked.
                    if ( !@rename( $local_out, $primary_dest_path ) ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                        @copy( $local_out, $primary_dest_path );
                        wp_delete_file( $local_out );
                    }
                } else {
                    // Not smaller (for example an image that is already optimized): keep the source, never make it bigger.
                    wp_delete_file( $local_out );
                    if ( realpath( $source_path ) !== realpath( $primary_dest_path ) ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                        @copy( $source_path, $primary_dest_path );
                    }
                }
                $process_result['new_file_path'] = $primary_dest_path;
            }
            $new_file_path = $process_result['new_file_path'];
            $engine_used = $process_result['engine_used'];
            // Verify compressed output primary file
            if ( !file_exists( $new_file_path ) ) {
                return self::format_error( $attachment_id, 'output_missing', "Optimized primary file was not written to expected path: {$new_file_path}" );
            }
            // The file was just rewritten (possibly in place): never trust PHP's cached stat for its size.
            clearstatcache( true );
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $new_size = @filesize( $new_file_path );
            if ( !$new_size || $new_size <= 0 ) {
                return self::format_error( $attachment_id, 'output_empty', 'Optimized primary image generated a 0-byte file.' );
            }
            ImgSentry_Optimize_Progress::update(
                $attachment_id,
                45,
                2,
                __( 'Main image optimized', 'imgsentry' )
            );
            $new_ext = strtolower( pathinfo( $new_file_path, PATHINFO_EXTENSION ) );
            $new_mime_type = self::get_mime_from_extension( $new_ext, $source_mime );
            // Update attachment record and metadata for the primary file
            update_attached_file( $attachment_id, $new_file_path );
            wp_update_post( array(
                'ID'             => $attachment_id,
                'post_mime_type' => $new_mime_type,
            ) );
            // Thumbnails. WordPress made them from the real upload, at full quality. When the main file keeps its
            // path, those thumbnails are kept as they are (they are compressed in place further down). Making them
            // again from the already compressed main file would lower their quality a second time and, for a
            // "-scaled" image, give them new names and leave the old files behind.
            $old_metadata = ( function_exists( 'wp_get_attachment_metadata' ) ? wp_get_attachment_metadata( $attachment_id ) : array() );
            $metadata = array();
            $keep_sizes = false;
            if ( is_array( $old_metadata ) && !empty( $old_metadata['sizes'] ) && is_array( $old_metadata['sizes'] ) && function_exists( 'wp_normalize_path' ) && wp_normalize_path( $new_file_path ) === wp_normalize_path( $current_file ) ) {
                $keep_sizes = true;
                $sizes_dir = trailingslashit( dirname( $new_file_path ) );
                foreach ( $old_metadata['sizes'] as $old_size_data ) {
                    if ( empty( $old_size_data['file'] ) || !file_exists( $sizes_dir . basename( $old_size_data['file'] ) ) ) {
                        // A thumbnail file is missing: make all of them again, as before.
                        $keep_sizes = false;
                        break;
                    }
                }
            }
            if ( $keep_sizes && function_exists( 'wp_update_attachment_metadata' ) ) {
                $metadata = $old_metadata;
                $new_dims = ( function_exists( 'wp_getimagesize' ) ? wp_getimagesize( $new_file_path ) : false );
                if ( is_array( $new_dims ) && !empty( $new_dims[0] ) && !empty( $new_dims[1] ) ) {
                    $metadata['width'] = (int) $new_dims[0];
                    $metadata['height'] = (int) $new_dims[1];
                }
                // The Media Library shows this value: it must be the size of the optimized file.
                $metadata['filesize'] = (int) $new_size;
                wp_update_attachment_metadata( $attachment_id, $metadata );
            } else {
                // Regenerate fresh metadata and thumbnail sub-sizes for the compressed primary image
                if ( function_exists( 'wp_generate_attachment_metadata' ) && function_exists( 'wp_update_attachment_metadata' ) ) {
                    require_once ABSPATH . 'wp-admin/includes/image.php';
                    $metadata = wp_generate_attachment_metadata( $attachment_id, $new_file_path );
                    if ( !empty( $metadata ) ) {
                        // WordPress only writes "original_image" when it creates a "-scaled" copy. Keep the link to the
                        // untouched original, otherwise WordPress can no longer find (or delete) that file.
                        if ( is_array( $old_metadata ) && !empty( $old_metadata['original_image'] ) && empty( $metadata['original_image'] ) ) {
                            $metadata['original_image'] = $old_metadata['original_image'];
                        }
                        // The Media Library shows this value: it must be the size of the optimized file.
                        $metadata['filesize'] = (int) $new_size;
                        wp_update_attachment_metadata( $attachment_id, $metadata );
                    }
                }
            }
            if ( empty( $metadata ) && function_exists( 'wp_get_attachment_metadata' ) ) {
                $metadata = wp_get_attachment_metadata( $attachment_id );
            }
            // STEP 2: Generate Next-Gen sibling file(s) (WebP / AVIF) for MAIN image AND all generated SUB-SIZES
            // (siblings keep the exact pixel size of the file they belong to: no resizing here).
            $sibling_options = $options;
            $sibling_options['max_width'] = 0;
            $sibling_options['max_height'] = 0;
            $nextgen_formats = array();
            if ( 'webp' === $output_format || 'both' === $output_format ) {
                $nextgen_formats[] = 'webp';
            }
            if ( 'avif' === $output_format || 'both' === $output_format ) {
                $nextgen_formats[] = 'avif';
            }
            $nextgen_generated = array();
            $sibling_sizes = array();
            if ( $cloud_used ) {
                // The full-size siblings came back together with the full-size file.
                if ( !empty( $cloud_primary['sibling_sizes'] ) ) {
                    $sibling_sizes = $cloud_primary['sibling_sizes'];
                    foreach ( array_keys( $sibling_sizes ) as $fmt_done ) {
                        $nextgen_generated[] = strtoupper( $fmt_done );
                    }
                }
                // Every other size (thumbnails etc.) is optimized on the server too; each file counts as one image.
                ImgSentry_Optimize_Progress::update(
                    $attachment_id,
                    45,
                    3,
                    __( 'Optimizing sizes on the ImgSentry server', 'imgsentry' ),
                    0,
                    0,
                    300
                );
                $cloud_sub = self::cloud_optimize_subsizes(
                    $attachment_id,
                    $new_file_path,
                    $metadata,
                    $options,
                    $quality,
                    $output_format
                );
                $cloud_partial = !empty( $cloud_sub['partial'] );
                ImgSentry_Optimize_Progress::update(
                    $attachment_id,
                    85,
                    3,
                    __( 'Sizes optimized', 'imgsentry' )
                );
                foreach ( $cloud_sub['generated'] as $fmt_done ) {
                    if ( !in_array( $fmt_done, $nextgen_generated, true ) ) {
                        $nextgen_generated[] = $fmt_done;
                    }
                }
            }
            if ( !$cloud_used && !empty( $nextgen_formats ) ) {
                $upload_dir_path = dirname( $new_file_path );
                // Step 3 (45-85%): sizes. Each finished size moves the bar forward.
                $sub_total = 0;
                $sub_done = 0;
                if ( !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
                    foreach ( $metadata['sizes'] as $size_check ) {
                        if ( !empty( $size_check['file'] ) && file_exists( trailingslashit( $upload_dir_path ) . $size_check['file'] ) ) {
                            $sub_total++;
                        }
                    }
                }
                ImgSentry_Optimize_Progress::update(
                    $attachment_id,
                    45,
                    3,
                    __( 'Creating WebP / AVIF copies', 'imgsentry' ),
                    0,
                    $sub_total
                );
                // 1. Generate Next-Gen siblings for the main full-size image
                foreach ( $nextgen_formats as $fmt ) {
                    $sibling_path = $new_file_path . '.' . $fmt;
                    // photo.jpg.webp or photo.jpg.avif
                    try {
                        // The main WebP / AVIF is made from the pristine original, with the same resize as the main file. Making
                        // it from the already compressed file would be lossy twice, and the copy often ends up bigger.
                        $use_pristine = $has_backup && !empty( $source_path ) && file_exists( $source_path );
                        $ng_res = self::encode_with_best_engine(
                            ( $use_pristine ? $source_path : $new_file_path ),
                            $sibling_path,
                            $attachment_id,
                            ( $use_pristine ? $options : $sibling_options ),
                            $quality,
                            $fmt,
                            $use_imagick,
                            $use_gd
                        );
                        if ( !empty( $ng_res['success'] ) && file_exists( $sibling_path ) ) {
                            if ( !in_array( strtoupper( $fmt ), $nextgen_generated, true ) ) {
                                $nextgen_generated[] = strtoupper( $fmt );
                            }
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                            $sibling_sizes[$fmt] = @filesize( $sibling_path );
                        }
                    } catch ( Exception $e ) {
                        if ( class_exists( 'ImgSentry_Logger' ) ) {
                            ImgSentry_Logger::warning( sprintf( 'Failed to generate %s sibling for main image: %s', strtoupper( $fmt ), $e->getMessage() ), array(
                                'type'      => 'Optimize',
                                'source'    => 'Optimizer Engine',
                                'object_id' => $attachment_id,
                            ) );
                        }
                    } catch ( Throwable $t ) {
                        if ( class_exists( 'ImgSentry_Logger' ) ) {
                            ImgSentry_Logger::warning( sprintf( 'Failed to generate %s sibling for main image: %s', strtoupper( $fmt ), $t->getMessage() ), array(
                                'type'      => 'Optimize',
                                'source'    => 'Optimizer Engine',
                                'object_id' => $attachment_id,
                            ) );
                        }
                    }
                }
                // 2. Loop through all generated sub-sizes and create their Next-Gen siblings
                if ( !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
                    foreach ( $metadata['sizes'] as $size_name => $size_data ) {
                        if ( empty( $size_data['file'] ) ) {
                            continue;
                        }
                        $sub_size_path = trailingslashit( $upload_dir_path ) . $size_data['file'];
                        if ( !file_exists( $sub_size_path ) ) {
                            continue;
                        }
                        foreach ( $nextgen_formats as $fmt ) {
                            $sub_sibling_path = $sub_size_path . '.' . $fmt;
                            // e.g. photo-150x150.jpg.webp or photo-150x150.jpg.avif
                            try {
                                $ng_sub_res = self::encode_with_best_engine(
                                    $sub_size_path,
                                    $sub_sibling_path,
                                    $attachment_id,
                                    $sibling_options,
                                    $quality,
                                    $fmt,
                                    $use_imagick,
                                    $use_gd
                                );
                                if ( !empty( $ng_sub_res['success'] ) && file_exists( $sub_sibling_path ) ) {
                                    if ( !in_array( strtoupper( $fmt ), $nextgen_generated, true ) ) {
                                        $nextgen_generated[] = strtoupper( $fmt );
                                    }
                                }
                            } catch ( Exception $e ) {
                                if ( class_exists( 'ImgSentry_Logger' ) ) {
                                    ImgSentry_Logger::warning( sprintf(
                                        'Failed to generate %s sibling for sub-size %s (%s): %s',
                                        strtoupper( $fmt ),
                                        $size_name,
                                        $size_data['file'],
                                        $e->getMessage()
                                    ), array(
                                        'type'      => 'Optimize',
                                        'source'    => 'Optimizer Engine',
                                        'object_id' => $attachment_id,
                                    ) );
                                }
                            } catch ( Throwable $t ) {
                                if ( class_exists( 'ImgSentry_Logger' ) ) {
                                    ImgSentry_Logger::warning( sprintf(
                                        'Failed to generate %s sibling for sub-size %s (%s): %s',
                                        strtoupper( $fmt ),
                                        $size_name,
                                        $size_data['file'],
                                        $t->getMessage()
                                    ), array(
                                        'type'      => 'Optimize',
                                        'source'    => 'Optimizer Engine',
                                        'object_id' => $attachment_id,
                                    ) );
                                }
                            }
                        }
                        $sub_done++;
                        ImgSentry_Optimize_Progress::update(
                            $attachment_id,
                            45 + 40 * $sub_done / max( 1, $sub_total ),
                            3,
                            __( 'Creating WebP / AVIF copies', 'imgsentry' ),
                            $sub_done,
                            $sub_total
                        );
                    }
                }
            }
            // The WebP / AVIF copies of the thumbnails were made from the thumbnails as WordPress created them. Only now
            // are the thumbnails themselves compressed (same format, never bigger).
            if ( !$cloud_used && !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) && function_exists( 'wp_update_attachment_metadata' ) ) {
                $metadata = self::compress_subsizes_in_place(
                    $attachment_id,
                    $new_file_path,
                    $metadata,
                    $options,
                    $quality,
                    $use_imagick,
                    $use_gd
                );
                wp_update_attachment_metadata( $attachment_id, $metadata );
            }
            // A WebP / AVIF copy is only worth keeping when it is smaller than the file it belongs to.
            if ( !empty( $nextgen_formats ) ) {
                $ng_cleanup = self::discard_larger_siblings( $new_file_path, $metadata, $nextgen_formats );
                foreach ( array_keys( $sibling_sizes ) as $sibling_fmt ) {
                    $sibling_file = $new_file_path . '.' . $sibling_fmt;
                    if ( file_exists( $sibling_file ) ) {
                        clearstatcache( true, $sibling_file );
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                        $sibling_sizes[$sibling_fmt] = (int) @filesize( $sibling_file );
                    } else {
                        unset($sibling_sizes[$sibling_fmt]);
                    }
                }
                $kept_generated = array();
                foreach ( $nextgen_generated as $generated_label ) {
                    if ( !empty( $ng_cleanup['remaining'][strtolower( $generated_label )] ) ) {
                        $kept_generated[] = $generated_label;
                    }
                }
                $nextgen_generated = $kept_generated;
            }
            // Step 4 (85-99%): saving results.
            ImgSentry_Optimize_Progress::update(
                $attachment_id,
                85,
                4,
                __( 'Saving WebP / AVIF copies and results', 'imgsentry' )
            );
            // 13. The size that counts is the size of the main image file: it is the file people get when they
            // download the image, and it is the same size the Media Library shows. The WebP / AVIF copies are
            // extra files and are not added to this number.
            $effective_size = $new_size;
            $bytes_saved = max( 0, $original_size - $effective_size );
            $percent_saved = ( $original_size > 0 ? round( $bytes_saved / $original_size * 100, 2 ) : 0 );
            update_post_meta( $attachment_id, '_imgsentry_optimized', 1 );
            update_post_meta( $attachment_id, '_imgsentry_bytes_saved', $bytes_saved );
            update_post_meta( $attachment_id, '_imgsentry_percent_saved', $percent_saved );
            update_post_meta( $attachment_id, '_imgsentry_effective_size', $effective_size );
            update_post_meta( $attachment_id, '_imgsentry_optimized_date', current_time( 'mysql' ) );
            update_post_meta( $attachment_id, '_imgsentry_optimization_status', 'completed' );
            delete_post_meta( $attachment_id, '_imgsentry_optimization_error' );
            // Count this successful optimization against the monthly quota (only successes are counted).
            // The server counts cloud jobs itself. Only local-engine work is counted here
            // (and, after a server outage, reported to the server later).
            if ( !$cloud_used && class_exists( 'ImgSentry_Quota' ) ) {
                ImgSentry_Quota::record_success( $original_size );
            }
            update_post_meta( $attachment_id, '_imgsentry_optimized_via', ( $cloud_used ? 'cloud' : 'local' ) );
            if ( $cloud_partial ) {
                update_post_meta( $attachment_id, '_imgsentry_cloud_partial', 1 );
            } else {
                delete_post_meta( $attachment_id, '_imgsentry_cloud_partial' );
            }
            // 14. Persist real Next-Gen format and sibling metadata to postmeta from actual written files
            $webp_path = $new_file_path . '.webp';
            $webp_alt_path = trailingslashit( dirname( $new_file_path ) ) . pathinfo( $new_file_path, PATHINFO_FILENAME ) . '.webp';
            $actual_webp_path = ( file_exists( $webp_path ) ? $webp_path : (( file_exists( $webp_alt_path ) ? $webp_alt_path : null )) );
            $webp_exists = 'original' !== $output_format && !empty( $actual_webp_path ) && file_exists( $actual_webp_path );
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $webp_size = ( $webp_exists ? (int) @filesize( $actual_webp_path ) : null );
            $avif_path = $new_file_path . '.avif';
            $avif_alt_path = trailingslashit( dirname( $new_file_path ) ) . pathinfo( $new_file_path, PATHINFO_FILENAME ) . '.avif';
            $actual_avif_path = ( file_exists( $avif_path ) ? $avif_path : (( file_exists( $avif_alt_path ) ? $avif_alt_path : null )) );
            $avif_exists = 'original' !== $output_format && !empty( $actual_avif_path ) && file_exists( $actual_avif_path );
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $avif_size = ( $avif_exists ? (int) @filesize( $actual_avif_path ) : null );
            $nextgen_meta = array(
                'webp' => array(
                    'exists'     => (bool) $webp_exists,
                    'path'       => ( $webp_exists ? $actual_webp_path : null ),
                    'size_bytes' => $webp_size,
                ),
                'avif' => array(
                    'exists'     => (bool) $avif_exists,
                    'path'       => ( $avif_exists ? $actual_avif_path : null ),
                    'size_bytes' => $avif_size,
                ),
            );
            update_post_meta( $attachment_id, '_imgsentry_output_format', $output_format );
            update_post_meta( $attachment_id, '_imgsentry_nextgen_formats', $nextgen_meta );
            // Invalidate global stats transient cache
            if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
                ImgSentry_Optimization_Stats::invalidate_cache();
            }
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::success( 'Image optimized successfully', array(
                    'type'      => 'Optimize',
                    'source'    => 'Optimizer Engine',
                    'details'   => sprintf(
                        'Saved %s (%s%%) converting to %s. Engine: %s.',
                        size_format( $bytes_saved ),
                        $percent_saved,
                        strtoupper( $new_ext ),
                        $engine_used
                    ),
                    'object_id' => $attachment_id,
                ) );
            }
            if ( class_exists( 'ImgSentry_NextGen_Delivery' ) ) {
                ImgSentry_NextGen_Delivery::clear_sibling_cache( $attachment_id );
            }
            ImgSentry_Optimize_Progress::update(
                $attachment_id,
                98,
                4,
                __( 'Saving WebP / AVIF copies and results', 'imgsentry' )
            );
            ImgSentry_Optimize_Progress::finish( $attachment_id, 'done' );
            return array(
                'success'           => true,
                'attachment_id'     => $attachment_id,
                'original_size'     => $original_size,
                'new_size'          => $new_size,
                'primary_size'      => $new_size,
                'effective_size'    => $effective_size,
                'bytes_saved'       => $bytes_saved,
                'percent_saved'     => $percent_saved,
                'quota'             => ( class_exists( 'ImgSentry_Quota' ) ? ImgSentry_Quota::get_status() : null ),
                'backup_path'       => $backup_path,
                'has_backup'        => $has_backup,
                'new_filepath'      => $new_file_path,
                'new_url'           => ( function_exists( 'wp_get_attachment_url' ) ? wp_get_attachment_url( $attachment_id ) : '' ),
                'output_format'     => $output_format,
                'engine_used'       => $engine_used,
                'cloud_partial'     => $cloud_partial,
                'nextgen_generated' => $nextgen_generated,
                'sibling_sizes'     => $sibling_sizes,
                'next_gen_size'     => ( !empty( $sibling_sizes[$output_format] ) ? $sibling_sizes[$output_format] : (( !empty( $sibling_sizes ) ? reset( $sibling_sizes ) : null )) ),
                'next_gen_formats'  => $nextgen_meta,
                'error'             => null,
                'error_code'        => null,
            );
        } finally {
            // An optimization that ended without a result (for example an uncaught error) must not stay "running".
            ImgSentry_Optimize_Progress::finish( $attachment_id, 'failed', __( 'The optimization stopped unexpectedly.', 'imgsentry' ) );
            // Guarantee per-attachment transient lock release
            delete_transient( $lock_key );
        }
    }

    // ------------------------------------------------------------------
    // Cloud helpers
    // ------------------------------------------------------------------
    /**
     * Server compression level from the plugin's level / quality.
     *
     * @param array $options Options.
     * @param int   $quality Resolved quality (1-100).
     * @return string lossless|balanced|aggressive
     */
    private static function cloud_level( $options, $quality ) {
        $level = ( isset( $options['compression_level'] ) ? strtolower( (string) $options['compression_level'] ) : 'balanced' );
        if ( in_array( $level, array('lossless', 'balanced', 'aggressive'), true ) ) {
            return $level;
        }
        $q = (int) $quality;
        if ( $q >= 92 ) {
            return 'lossless';
        }
        return ( $q >= 78 ? 'balanced' : 'aggressive' );
    }

    /**
     * Formats to ask the server for.
     *
     * @param string $output_format original|webp|avif|both.
     * @return string[]
     */
    private static function cloud_formats( $output_format ) {
        $formats = array('original');
        if ( 'webp' === $output_format || 'both' === $output_format ) {
            $formats[] = 'webp';
        }
        if ( 'avif' === $output_format || 'both' === $output_format ) {
            $formats[] = 'avif';
        }
        return $formats;
    }

    /**
     * Resize the working copy before upload when the "resize large images" setting asks for it.
     *
     * @param string $tmp     Working file.
     * @param array  $options Options.
     * @return void
     */
    private static function cloud_resize_if_needed( $tmp, $options ) {
        if ( empty( $options['resize_large'] ) ) {
            return;
        }
        $max_w = (int) $options['max_width'];
        $max_h = (int) $options['max_height'];
        if ( $max_w <= 0 && $max_h <= 0 ) {
            return;
        }
        $editor = wp_get_image_editor( $tmp );
        if ( is_wp_error( $editor ) ) {
            return;
        }
        $size = $editor->get_size();
        if ( empty( $size['width'] ) || empty( $size['height'] ) ) {
            return;
        }
        if ( $max_w > 0 && $size['width'] > $max_w || $max_h > 0 && $size['height'] > $max_h ) {
            $editor->resize( ( $max_w > 0 ? $max_w : null ), ( $max_h > 0 ? $max_h : null ), false );
            $editor->set_quality( 95 );
            $saved = $editor->save( $tmp );
            if ( !is_wp_error( $saved ) && !empty( $saved['path'] ) && $saved['path'] !== $tmp && file_exists( $saved['path'] ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call may fail on some hosts; the result is checked.
                @rename( $saved['path'], $tmp );
            }
        }
    }

    /**
     * Move a downloaded file into place.
     *
     * @param string $from Source.
     * @param string $to   Destination.
     * @return bool
     */
    private static function cloud_place( $from, $to ) {
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- The filesystem call may fail on some hosts; the result is checked.
        if ( @rename( $from, $to ) ) {
            return true;
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
        $ok = @copy( $from, $to );
        wp_delete_file( $from );
        return (bool) $ok;
    }

    /**
     * Send the full-size file to the server and put the results in place.
     *
     * @param string $tmp           Working copy of the pristine source.
     * @param string $dest          Where the optimized full-size file goes.
     * @param array  $options       Options.
     * @param int    $quality       Quality.
     * @param string $output_format Output format.
     * @return array status ok|fallback|local|error plus details.
     */
    private static function cloud_optimize_primary(
        $tmp,
        $dest,
        $options,
        $quality,
        $output_format
    ) {
        self::cloud_resize_if_needed( $tmp, $options );
        clearstatcache( true, $tmp );
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
        $bytes = (int) @filesize( $tmp );
        $res = ImgSentry_Cloud_Client::process_files( array(
            'primary' => array(
                'path'  => $tmp,
                'bytes' => $bytes,
            ),
        ), array(
            'formats'       => self::cloud_formats( $output_format ),
            'level'         => self::cloud_level( $options, $quality ),
            'keep_metadata' => !empty( $options['keep_exif'] ),
        ), false );
        $r = ( isset( $res['primary'] ) ? $res['primary'] : array(
            'ok'      => false,
            'code'    => 'cloud_error',
            'message' => 'No answer.',
        ) );
        if ( !empty( $r['ok'] ) ) {
            if ( !empty( $r['files']['original'] ) ) {
                if ( !self::cloud_place( $r['files']['original'], $dest ) ) {
                    foreach ( $r['files'] as $f ) {
                        wp_delete_file( $f );
                    }
                    return array(
                        'status'  => 'error',
                        'code'    => 'output_missing',
                        'message' => 'Could not save the optimized image.',
                    );
                }
            } elseif ( realpath( $tmp ) !== realpath( $dest ) ) {
                // The server could not make it smaller: keep the (resized) original.
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                @copy( $tmp, $dest );
            }
            $siblings = array();
            foreach ( array('webp', 'avif') as $fmt ) {
                if ( !empty( $r['files'][$fmt] ) && self::cloud_place( $r['files'][$fmt], $dest . '.' . $fmt ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                    $siblings[$fmt] = (int) @filesize( $dest . '.' . $fmt );
                }
            }
            return array(
                'status'        => 'ok',
                'new_file_path' => $dest,
                'sibling_sizes' => $siblings,
            );
        }
        if ( !empty( $r['unavailable'] ) ) {
            $what = ImgSentry_Cloud_Client::handle_unavailable();
            if ( 'fallback' === $what ) {
                return array(
                    'status' => 'fallback',
                );
            }
            if ( 'retry' === $what ) {
                return array(
                    'status'  => 'error',
                    'code'    => 'cloud_retry',
                    'message' => __( 'The ImgSentry server is not reachable right now. ImgSentry will try again in a few minutes.', 'imgsentry' ),
                );
            }
            if ( 'cap' === $what ) {
                return array(
                    'status'  => 'error',
                    'code'    => 'cloud_fallback_cap',
                    'message' => __( 'The ImgSentry server is not reachable and today\'s limit for optimizing on your site is reached. Try again later.', 'imgsentry' ),
                );
            }
            $unreachable_message = __( 'The ImgSentry server is not reachable. Please try again later.', 'imgsentry' );
            return array(
                'status'  => 'error',
                'code'    => 'cloud_unreachable',
                'message' => $unreachable_message,
            );
        }
        if ( !empty( $r['busy'] ) ) {
            return array(
                'status'  => 'error',
                'code'    => 'cloud_busy',
                'message' => $r['message'],
            );
        }
        if ( !empty( $r['local_ok'] ) ) {
            return array(
                'status' => 'local',
            );
        }
        return array(
            'status'  => 'error',
            'code'    => ( isset( $r['code'] ) ? $r['code'] : 'cloud_error' ),
            'message' => ( isset( $r['message'] ) ? $r['message'] : __( 'The optimization server returned an error.', 'imgsentry' ) ),
        );
    }

    /**
     * Optimize every generated size (thumbnails, medium, large ...) on the server. Each file counts as one image.
     * A failure here never undoes the full-size result; it only marks the image as "partial".
     *
     * @param int    $attachment_id  Attachment ID.
     * @param string $new_file_path  Optimized full-size file.
     * @param array  $metadata       Attachment metadata.
     * @param array  $options        Options.
     * @param int    $quality        Quality.
     * @param string $output_format  Output format.
     * @return array{generated:string[],partial:bool}
     */
    private static function cloud_optimize_subsizes(
        $attachment_id,
        $new_file_path,
        $metadata,
        $options,
        $quality,
        $output_format
    ) {
        $out = array(
            'generated' => array(),
            'partial'   => false,
        );
        if ( empty( $metadata['sizes'] ) || !is_array( $metadata['sizes'] ) ) {
            ImgSentry_Cloud_Client::refresh_quota( true );
            return $out;
        }
        $dir = trailingslashit( dirname( $new_file_path ) );
        $items = array();
        $names = array();
        foreach ( $metadata['sizes'] as $size_name => $size_data ) {
            if ( empty( $size_data['file'] ) ) {
                continue;
            }
            $path = $dir . $size_data['file'];
            if ( $path === $new_file_path || isset( $items[$path] ) || !file_exists( $path ) ) {
                continue;
            }
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $bytes = (int) @filesize( $path );
            if ( !ImgSentry_Cloud_Client::can_handle( $path, '', $bytes ) ) {
                continue;
            }
            $items[$path] = array(
                'path'  => $path,
                'bytes' => $bytes,
            );
            $names[$path] = $size_name;
        }
        if ( empty( $items ) ) {
            ImgSentry_Cloud_Client::refresh_quota( true );
            return $out;
        }
        $res = ImgSentry_Cloud_Client::process_files( $items, array(
            'formats'       => self::cloud_formats( $output_format ),
            'level'         => self::cloud_level( $options, $quality ),
            'keep_metadata' => false,
        ) );
        $metadata_changed = false;
        foreach ( $res as $path => $r ) {
            if ( empty( $r['ok'] ) ) {
                $out['partial'] = true;
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::warning( sprintf( 'Size "%s" was not optimized on the server: %s', $names[$path], ( isset( $r['message'] ) ? $r['message'] : '' ) ), array(
                        'type'      => 'Optimize',
                        'source'    => 'Optimizer Engine',
                        'object_id' => $attachment_id,
                    ) );
                }
                continue;
            }
            if ( !empty( $r['files']['original'] ) && self::cloud_place( $r['files']['original'], $path ) ) {
                if ( isset( $metadata['sizes'][$names[$path]]['filesize'] ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                    $metadata['sizes'][$names[$path]]['filesize'] = (int) @filesize( $path );
                    $metadata_changed = true;
                }
            }
            foreach ( array('webp', 'avif') as $fmt ) {
                if ( !empty( $r['files'][$fmt] ) && self::cloud_place( $r['files'][$fmt], $path . '.' . $fmt ) ) {
                    $out['generated'][] = strtoupper( $fmt );
                }
            }
        }
        if ( $metadata_changed && function_exists( 'wp_update_attachment_metadata' ) ) {
            wp_update_attachment_metadata( $attachment_id, $metadata );
        }
        $out['generated'] = array_values( array_unique( $out['generated'] ) );
        return $out;
    }

    /**
     * Restore pristine original image from backup archive.
     *
     * @param int $attachment_id WordPress attachment ID.
     * @return array Result array with status and details.
     */
    public static function restore_original( $attachment_id ) {
        $attachment_id = intval( $attachment_id );
        if ( $attachment_id <= 0 ) {
            return array(
                'success'       => false,
                'attachment_id' => 0,
                'error_code'    => 'invalid_attachment_id',
                'error'         => __( 'Invalid attachment ID provided.', 'imgsentry' ),
            );
        }
        // Concurrency locking for restore
        $lock_key = 'imgsentry_opt_lock_' . $attachment_id;
        $is_locked = get_transient( $lock_key );
        if ( !empty( $is_locked ) ) {
            return array(
                'success'       => false,
                'attachment_id' => $attachment_id,
                'error_code'    => 'attachment_locked',
                'error'         => __( 'Attachment is currently locked by another operation.', 'imgsentry' ),
            );
        }
        set_transient( $lock_key, time(), 60 );
        // Verify this attachment was actually optimized by Image Optimization.
        // Legacy trash-created backups must never be misidentified as restorable optimization backups.
        $is_optimized = get_post_meta( $attachment_id, '_imgsentry_optimized', true );
        $opt_status = get_post_meta( $attachment_id, '_imgsentry_optimization_status', true );
        if ( '1' !== $is_optimized && 'optimized' !== $opt_status ) {
            // Clean up any misleading legacy backup postmeta references
            delete_post_meta( $attachment_id, '_imgsentry_backup_original_path' );
            delete_post_meta( $attachment_id, '_imgsentry_backup_path' );
            delete_post_meta( $attachment_id, '_imgsentry_original_mime_type' );
            delete_transient( $lock_key );
            return array(
                'success'       => false,
                'attachment_id' => $attachment_id,
                'error_code'    => 'not_optimized',
                'error'         => __( 'Attachment has not been optimized. No valid optimization backup exists.', 'imgsentry' ),
                'has_backup'    => false,
            );
        }
        try {
            // 1. Locate backup path
            $backup_path = get_post_meta( $attachment_id, '_imgsentry_backup_original_path', true );
            if ( empty( $backup_path ) || !file_exists( $backup_path ) ) {
                $backup_path = get_post_meta( $attachment_id, '_imgsentry_backup_path', true );
            }
            // Fallback: search in attachment's backup folder by attachment ID pattern
            if ( empty( $backup_path ) || !file_exists( $backup_path ) ) {
                $backup_dir = self::get_backup_base_dir( $attachment_id );
                if ( is_dir( $backup_dir ) ) {
                    $files = glob( trailingslashit( $backup_dir ) . '*-' . intval( $attachment_id ) . '.*' );
                    if ( is_array( $files ) ) {
                        foreach ( $files as $file ) {
                            if ( is_file( $file ) ) {
                                $backup_path = $file;
                                break;
                            }
                        }
                    }
                }
            }
            if ( empty( $backup_path ) || !file_exists( $backup_path ) ) {
                // Self-heal: clear stale backup postmeta references so UI stops offering restore
                delete_post_meta( $attachment_id, '_imgsentry_backup_original_path' );
                delete_post_meta( $attachment_id, '_imgsentry_backup_path' );
                delete_post_meta( $attachment_id, '_imgsentry_original_mime_type' );
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::warning( 'Stale backup reference cleared', array(
                        'type'      => 'Self-Healing',
                        'source'    => 'Optimizer Engine',
                        'details'   => sprintf( 'Stale backup reference detected and cleared for attachment #%d — backup file no longer exists on disk.', $attachment_id ),
                        'object_id' => $attachment_id,
                    ) );
                }
                return array(
                    'success'       => false,
                    'attachment_id' => $attachment_id,
                    'error_code'    => 'stale_backup_cleared',
                    'error'         => sprintf( 'Backup file no longer exists on disk for attachment #%d. Stale backup reference has been cleared.', $attachment_id ),
                    'has_backup'    => false,
                );
            }
            // Path traversal check on backup (validates against ImgsentryBackups base and uploads base)
            if ( !self::is_valid_backup_path( $backup_path ) ) {
                return array(
                    'success'       => false,
                    'attachment_id' => $attachment_id,
                    'error_code'    => 'path_traversal_blocked',
                    'error'         => __( 'Security violation: Backup path resolves outside allowed storage directories.', 'imgsentry' ),
                );
            }
            $upload_dir = wp_upload_dir();
            $current_file = get_attached_file( $attachment_id );
            $original_mime = get_post_meta( $attachment_id, '_imgsentry_original_mime_type', true );
            $backup_ext = strtolower( pathinfo( $backup_path, PATHINFO_EXTENSION ) );
            if ( empty( $original_mime ) ) {
                $original_mime = self::get_mime_from_extension( $backup_ext, 'image/jpeg' );
            }
            // Destination file path
            $dest_dir = ( !empty( $current_file ) ? dirname( $current_file ) : '' );
            if ( empty( $dest_dir ) || !file_exists( $dest_dir ) ) {
                $dest_dir = $upload_dir['path'];
            }
            $filename_base = ( !empty( $current_file ) ? pathinfo( $current_file, PATHINFO_FILENAME ) : 'attachment-' . $attachment_id );
            $destination_path = trailingslashit( $dest_dir ) . $filename_base . '.' . $backup_ext;
            // Destination path boundary check (validates destination directory resolves strictly inside wp_upload_dir()['basedir'])
            $real_upload_base = realpath( $upload_dir['basedir'] );
            $real_dest_dir = realpath( dirname( $destination_path ) );
            $is_valid_dest = false;
            if ( $real_upload_base && $real_dest_dir ) {
                $norm_upload_base = wp_normalize_path( $real_upload_base );
                $norm_dest_dir = wp_normalize_path( $real_dest_dir );
                if ( 0 === strpos( $norm_dest_dir, $norm_upload_base ) ) {
                    $is_valid_dest = true;
                }
            }
            if ( !$is_valid_dest ) {
                return array(
                    'success'       => false,
                    'attachment_id' => $attachment_id,
                    'error_code'    => 'dest_path_traversal_blocked',
                    'error'         => __( 'Security violation: Destination path resolves outside allowed upload directory.', 'imgsentry' ),
                );
            }
            // 2. Copy pristine backup to destination path first. If this fails, nothing else has been touched yet,
            // so the current image and its thumbnails stay intact.
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            if ( !@copy( $backup_path, $destination_path ) ) {
                return array(
                    'success'       => false,
                    'attachment_id' => $attachment_id,
                    'error_code'    => 'restore_copy_failed',
                    'error'         => "Failed to restore backup from {$backup_path} to {$destination_path}.",
                );
            }
            // 3. Remove obsolete sub-sizes and any Next-Gen siblings of the current image
            if ( !empty( $current_file ) && file_exists( $current_file ) ) {
                $current_meta = wp_get_attachment_metadata( $attachment_id );
                if ( !empty( $current_meta['sizes'] ) && is_array( $current_meta['sizes'] ) ) {
                    $current_dir = dirname( $current_file );
                    foreach ( $current_meta['sizes'] as $size_data ) {
                        if ( !empty( $size_data['file'] ) ) {
                            $sub_size_file = trailingslashit( $current_dir ) . $size_data['file'];
                            if ( file_exists( $sub_size_file ) && $sub_size_file !== $backup_path && $sub_size_file !== $destination_path ) {
                                wp_delete_file( $sub_size_file );
                            }
                            // Clean up sub-size Next-Gen siblings (.webp, .avif)
                            if ( file_exists( $sub_size_file . '.webp' ) ) {
                                wp_delete_file( $sub_size_file . '.webp' );
                            }
                            if ( file_exists( $sub_size_file . '.avif' ) ) {
                                wp_delete_file( $sub_size_file . '.avif' );
                            }
                        }
                    }
                }
                // If current file has different extension/path, delete the converted version
                if ( $current_file !== $destination_path ) {
                    wp_delete_file( $current_file );
                }
            }
            // Clean up any Next-Gen sibling files (.webp / .avif) generated during optimization for main file
            $possible_siblings = array(
                $destination_path . '.webp',
                trailingslashit( $dest_dir ) . $filename_base . '.webp',
                $destination_path . '.avif',
                trailingslashit( $dest_dir ) . $filename_base . '.avif'
            );
            if ( !empty( $current_file ) ) {
                $possible_siblings[] = $current_file . '.webp';
                $possible_siblings[] = $current_file . '.avif';
            }
            foreach ( $possible_siblings as $sibling ) {
                if ( file_exists( $sibling ) && $sibling !== $backup_path && $sibling !== $destination_path ) {
                    wp_delete_file( $sibling );
                }
            }
            // 4. Update WordPress attachment record
            update_attached_file( $attachment_id, $destination_path );
            wp_update_post( array(
                'ID'             => $attachment_id,
                'post_mime_type' => $original_mime,
            ) );
            // 5. Regenerate attachment metadata & thumbnails
            if ( function_exists( 'wp_generate_attachment_metadata' ) && function_exists( 'wp_update_attachment_metadata' ) ) {
                require_once ABSPATH . 'wp-admin/includes/image.php';
                $old_metadata = ( function_exists( 'wp_get_attachment_metadata' ) ? wp_get_attachment_metadata( $attachment_id ) : array() );
                clearstatcache( true );
                // A restore must not trigger "Auto-Optimize on upload" again: the person just undid an optimization.
                if ( class_exists( 'ImgSentry_Optimization_Queue' ) ) {
                    ImgSentry_Optimization_Queue::suspend_upload_hook( true );
                }
                $metadata = wp_generate_attachment_metadata( $attachment_id, $destination_path );
                if ( class_exists( 'ImgSentry_Optimization_Queue' ) ) {
                    ImgSentry_Optimization_Queue::suspend_upload_hook( false );
                }
                if ( !empty( $metadata ) ) {
                    // Keep the link to the untouched original of a "-scaled" image (WordPress only writes it when it scales).
                    if ( is_array( $old_metadata ) && !empty( $old_metadata['original_image'] ) && empty( $metadata['original_image'] ) ) {
                        $metadata['original_image'] = $old_metadata['original_image'];
                    }
                    wp_update_attachment_metadata( $attachment_id, $metadata );
                }
            }
            // 6. Reset optimization status postmeta and clean up backup meta fields
            delete_post_meta( $attachment_id, '_imgsentry_optimized' );
            delete_post_meta( $attachment_id, '_imgsentry_bytes_saved' );
            delete_post_meta( $attachment_id, '_imgsentry_percent_saved' );
            delete_post_meta( $attachment_id, '_imgsentry_effective_size' );
            delete_post_meta( $attachment_id, '_imgsentry_optimization_status' );
            delete_post_meta( $attachment_id, '_imgsentry_optimized_date' );
            delete_post_meta( $attachment_id, '_imgsentry_optimization_error' );
            delete_post_meta( $attachment_id, '_imgsentry_backup_original_path' );
            delete_post_meta( $attachment_id, '_imgsentry_backup_path' );
            delete_post_meta( $attachment_id, '_imgsentry_original_mime_type' );
            delete_post_meta( $attachment_id, '_imgsentry_output_format' );
            delete_post_meta( $attachment_id, '_imgsentry_nextgen_formats' );
            delete_post_meta( $attachment_id, '_imgsentry_optimized_via' );
            delete_post_meta( $attachment_id, '_imgsentry_cloud_partial' );
            // 7. Delete physical backup file only (never delete shared year/month directory)
            if ( !empty( $backup_path ) && file_exists( $backup_path ) ) {
                wp_delete_file( $backup_path );
            }
            // Invalidate global stats transient cache & NextGen delivery cache
            if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
                ImgSentry_Optimization_Stats::invalidate_cache();
            }
            if ( class_exists( 'ImgSentry_NextGen_Delivery' ) ) {
                ImgSentry_NextGen_Delivery::clear_sibling_cache( $attachment_id );
            }
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $restored_size = @filesize( $destination_path );
            if ( class_exists( 'ImgSentry_Logger' ) ) {
                ImgSentry_Logger::info( 'Image restored from original backup', array(
                    'type'      => 'Restore',
                    'source'    => 'Optimizer Engine',
                    'details'   => sprintf( 'Restored attachment #%d from pristine backup file (%s) and removed associated backup file/folder.', $attachment_id, size_format( $restored_size ) ),
                    'object_id' => $attachment_id,
                ) );
            }
            return array(
                'success'         => true,
                'attachment_id'   => $attachment_id,
                'restored_size'   => ( $restored_size ? $restored_size : 0 ),
                'restored_format' => $backup_ext,
                'restored_path'   => $destination_path,
                'restored_url'    => ( function_exists( 'wp_get_attachment_url' ) ? wp_get_attachment_url( $attachment_id ) : '' ),
                'original_mime'   => $original_mime,
                'backup_path'     => $backup_path,
                'error'           => null,
                'error_code'      => null,
            );
        } finally {
            delete_transient( $lock_key );
        }
    }

    /**
     * Memory safety check: Estimates raster memory footprint vs available PHP memory.
     *
     * @param string $source_path Path to image file.
     * @return array Safety result array with 'safe' (bool) and optional error details.
     */
    private static function check_memory_safety( $source_path ) {
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
        $image_info = @getimagesize( $source_path );
        if ( !$image_info || empty( $image_info[0] ) || empty( $image_info[1] ) ) {
            return array(
                'safe' => true,
            );
            // Cannot inspect header, proceed with runtime engine guards
        }
        $width = (int) $image_info[0];
        $height = (int) $image_info[1];
        // Absolute dimension sanity limit (20,000 x 20,000 px)
        if ( $width > 20000 || $height > 20000 ) {
            return array(
                'safe'       => false,
                'error_code' => 'dimension_too_large',
                'message'    => sprintf( 'Image dimensions (%dx%d px) exceed maximum safety limit of 20000x20000 px.', $width, $height ),
            );
        }
        // Estimate memory required for RGBA pixel buffer: (width * height * 4 bytes) * 1.6 safety multiplier
        $estimated_memory = $width * $height * 4 * 1.6;
        $memory_limit = ini_get( 'memory_limit' );
        if ( !$memory_limit || '-1' === trim( $memory_limit ) ) {
            return array(
                'safe' => true,
            );
            // Unlimited PHP memory
        }
        $limit_bytes = self::parse_memory_limit_bytes( $memory_limit );
        $current_usage = memory_get_usage( true );
        $available_memory = $limit_bytes - $current_usage;
        // Require at least 8MB of headroom for core WP operations
        if ( $estimated_memory > $available_memory - 8 * 1024 * 1024 ) {
            return array(
                'safe'       => false,
                'error_code' => 'memory_limit_risk',
                'message'    => sprintf(
                    'Image dimensions (%dx%d px) require ~%s RAM, exceeding available PHP memory (~%s available of %s limit). Increase memory_limit or resize before optimizing.',
                    $width,
                    $height,
                    size_format( $estimated_memory, 1 ),
                    size_format( max( 0, $available_memory ), 1 ),
                    $memory_limit
                ),
            );
        }
        return array(
            'safe' => true,
        );
    }

    /**
     * Parse PHP memory limit string (e.g. '256M', '1G', '512K') into integer bytes.
     *
     * @param string $limit Memory limit string.
     * @return int Byte count.
     */
    private static function parse_memory_limit_bytes( $limit ) {
        $limit = trim( $limit );
        $last = strtolower( substr( $limit, -1 ) );
        $val = (int) $limit;
        switch ( $last ) {
            case 'g':
                $val *= 1024 * 1024 * 1024;
                break;
            case 'm':
                $val *= 1024 * 1024;
                break;
            case 'k':
                $val *= 1024;
                break;
        }
        return max( 0, $val );
    }

    // ------------------------------------------------------------------
    // Local engine helpers (server capability, quality, safety guards)
    // ------------------------------------------------------------------
    /**
     * Whether Imagick can write the given format on this server.
     *
     * @param string $fmt 'webp'|'avif'.
     * @return bool
     */
    private static function imagick_can_write( $fmt ) {
        if ( !extension_loaded( 'imagick' ) || !class_exists( 'Imagick' ) ) {
            return false;
        }
        try {
            return in_array( strtoupper( $fmt ), Imagick::queryFormats(), true );
        } catch ( Throwable $e ) {
            return false;
        }
    }

    /**
     * Whether GD can write the given format on this server.
     *
     * @param string $fmt 'webp'|'avif'.
     * @return bool
     */
    private static function gd_can_write( $fmt ) {
        if ( 'webp' === $fmt ) {
            return function_exists( 'imagewebp' );
        }
        if ( 'avif' === $fmt ) {
            return function_exists( 'imageavif' );
        }
        return true;
    }

    /**
     * The output format this server can really produce: AVIF falls back to WebP, WebP to the image's own format.
     *
     * @param string $requested   original|webp|avif|both.
     * @param bool   $use_imagick Imagick is available.
     * @param bool   $use_gd      GD is available.
     * @return string original|webp|avif|both
     */
    private static function resolve_output_format( $requested, $use_imagick, $use_gd ) {
        if ( 'original' === $requested ) {
            return 'original';
        }
        $webp = $use_imagick && self::imagick_can_write( 'webp' ) || $use_gd && self::gd_can_write( 'webp' );
        $avif = $use_imagick && self::imagick_can_write( 'avif' ) || $use_gd && self::gd_can_write( 'avif' );
        switch ( $requested ) {
            case 'webp':
                return ( $webp ? 'webp' : 'original' );
            case 'avif':
                return ( $avif ? 'avif' : (( $webp ? 'webp' : 'original' )) );
            case 'both':
                if ( $webp && $avif ) {
                    return 'both';
                }
                if ( $avif ) {
                    return 'avif';
                }
                return ( $webp ? 'webp' : 'original' );
        }
        return 'original';
    }

    /**
     * Write one image with the best engine this server has. If Imagick cannot do it (policy, missing delegate,
     * a read error) GD gets a turn, and the other way round, so a single engine failing is not a failure.
     *
     * @param string $source        Source file.
     * @param string $dest          Destination file (its extension decides the format of the file).
     * @param int    $attachment_id Attachment ID.
     * @param array  $options       Optimizer options.
     * @param int    $quality       Quality of the chosen compression level (1-100).
     * @param string $fmt           original|webp|avif.
     * @param bool   $use_imagick   Imagick is available.
     * @param bool   $use_gd        GD is available.
     * @return array process_with_*() style result.
     */
    private static function encode_with_best_engine(
        $source,
        $dest,
        $attachment_id,
        $options,
        $quality,
        $fmt,
        $use_imagick,
        $use_gd
    ) {
        $order = array();
        if ( $use_imagick && ('original' === $fmt || self::imagick_can_write( $fmt )) ) {
            $order[] = 'imagick';
        }
        if ( $use_gd && ('original' === $fmt || self::gd_can_write( $fmt )) ) {
            $order[] = 'gd';
        }
        if ( empty( $order ) ) {
            return array(
                'success'       => false,
                'error_code'    => 'format_unsupported',
                'error_message' => 'No image library on this server can write ' . strtoupper( $fmt ) . ' files.',
            );
        }
        $result = null;
        foreach ( $order as $engine ) {
            try {
                if ( 'imagick' === $engine ) {
                    $result = self::process_with_imagick(
                        $source,
                        $dest,
                        $attachment_id,
                        $options,
                        $quality,
                        $fmt
                    );
                } else {
                    $result = self::process_with_gd(
                        $source,
                        $dest,
                        $attachment_id,
                        $options,
                        $quality,
                        $fmt
                    );
                }
            } catch ( Throwable $e ) {
                $result = array(
                    'success'       => false,
                    'error_code'    => $engine . '_exception',
                    'error_message' => ucfirst( $engine ) . ' error: ' . $e->getMessage(),
                );
            }
            if ( !empty( $result['success'] ) && file_exists( $dest ) ) {
                return $result;
            }
        }
        return $result;
    }

    /**
     * Remove WebP / AVIF copies that are not smaller than the file they belong to (the main file and every
     * thumbnail). A copy that is not smaller only costs disk space and would make visitors download more.
     *
     * @param string $primary_path Path of the main file (the thumbnails sit in the same folder).
     * @param array  $metadata     Attachment metadata.
     * @param array  $formats      Formats that were generated: 'webp', 'avif'.
     * @return array { removed: int, remaining: array<string,bool> } Copies removed, and the formats that still have at least one copy.
     */
    private static function discard_larger_siblings( $primary_path, $metadata, $formats ) {
        $dir = trailingslashit( dirname( $primary_path ) );
        $files = array($primary_path);
        $removed = 0;
        $remaining = array();
        if ( !empty( $metadata['sizes'] ) && is_array( $metadata['sizes'] ) ) {
            foreach ( $metadata['sizes'] as $size_data ) {
                if ( !empty( $size_data['file'] ) ) {
                    $files[] = $dir . basename( $size_data['file'] );
                }
            }
        }
        foreach ( array_unique( $files ) as $file ) {
            if ( !file_exists( $file ) ) {
                continue;
            }
            clearstatcache( true, $file );
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $base_size = (int) @filesize( $file );
            if ( $base_size <= 0 ) {
                continue;
            }
            foreach ( $formats as $fmt ) {
                $sibling = $file . '.' . $fmt;
                if ( !file_exists( $sibling ) ) {
                    continue;
                }
                clearstatcache( true, $sibling );
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $sibling_size = (int) @filesize( $sibling );
                if ( $sibling_size <= 0 || $sibling_size >= $base_size ) {
                    wp_delete_file( $sibling );
                    $removed++;
                } else {
                    $remaining[$fmt] = true;
                }
            }
        }
        return array(
            'removed'   => $removed,
            'remaining' => $remaining,
        );
    }

    /**
     * Compress the thumbnails WordPress generated (same format, same pixel size). A thumbnail only changes when
     * the new file is smaller. Updates the "filesize" of each size in the metadata.
     *
     * @param int    $attachment_id Attachment ID.
     * @param string $primary_path  Path of the main file (the sizes sit in the same folder).
     * @param array  $metadata      Attachment metadata.
     * @param array  $options       Optimizer options.
     * @param int    $quality       Quality of the chosen compression level.
     * @param bool   $use_imagick   Imagick is available.
     * @param bool   $use_gd        GD is available.
     * @return array Updated metadata.
     */
    private static function compress_subsizes_in_place(
        $attachment_id,
        $primary_path,
        $metadata,
        $options,
        $quality,
        $use_imagick,
        $use_gd
    ) {
        $dir = trailingslashit( dirname( $primary_path ) );
        $sub_options = $options;
        $sub_options['max_width'] = 0;
        $sub_options['max_height'] = 0;
        $handled = array();
        foreach ( $metadata['sizes'] as $size_name => $size_data ) {
            if ( empty( $size_data['file'] ) ) {
                continue;
            }
            $file = basename( $size_data['file'] );
            $path = $dir . $file;
            $ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
            if ( !in_array( $ext, array(
                'jpg',
                'jpeg',
                'png',
                'webp',
                'avif'
            ), true ) || !file_exists( $path ) ) {
                continue;
            }
            if ( !isset( $handled[$path] ) ) {
                $handled[$path] = true;
                clearstatcache( true, $path );
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $before = (int) @filesize( $path );
                $tmp = $dir . 'imgsentry-tmp-' . $file;
                // Keeps the extension: it decides the format that is written.
                try {
                    $res = self::encode_with_best_engine(
                        $path,
                        $tmp,
                        $attachment_id,
                        $sub_options,
                        $quality,
                        'original',
                        $use_imagick,
                        $use_gd
                    );
                    clearstatcache( true, $tmp );
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                    $after = ( !empty( $res['success'] ) && file_exists( $tmp ) ? (int) @filesize( $tmp ) : 0 );
                    if ( $before > 0 && $after > 0 && $after < $before ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the file simply stays as it was.
                        @copy( $tmp, $path );
                    }
                } catch ( Throwable $e ) {
                    // A thumbnail that cannot be compressed simply stays as WordPress made it.
                    unset($e);
                }
                if ( file_exists( $tmp ) ) {
                    wp_delete_file( $tmp );
                }
            }
            clearstatcache( true, $path );
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
            $metadata['sizes'][$size_name]['filesize'] = (int) @filesize( $path );
        }
        return $metadata;
    }

    /**
     * Animated GIF / WebP / PNG (APNG) / AVIF: one re-encoded frame would destroy the animation.
     *
     * @param string $path File path.
     * @return bool
     */
    private static function is_animated_image( $path ) {
        $ext = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
        if ( !in_array( $ext, array(
            'gif',
            'png',
            'webp',
            'avif'
        ), true ) || !is_readable( $path ) ) {
            return false;
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_fopen -- Reads a local image header.
        $fh = @fopen( $path, 'rb' );
        if ( !$fh ) {
            return false;
        }
        $animated = false;
        if ( 'gif' === $ext ) {
            // Two or more "graphic control" blocks followed by an image block = more than one frame.
            $frames = 0;
            $tail = '';
            while ( $frames < 2 && !feof( $fh ) ) {
                // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
                $chunk = fread( $fh, 102400 );
                if ( false === $chunk || '' === $chunk ) {
                    break;
                }
                $data = $tail . $chunk;
                $frames += (int) preg_match_all( '/\\x00\\x21\\xF9\\x04.{4}\\x00[\\x2C\\x21]/s', $data );
                $tail = substr( $data, -9 );
                // Shorter than the pattern, so a match is never counted twice.
            }
            $animated = $frames > 1;
        } else {
            // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
            $head = (string) fread( $fh, 8192 );
            if ( 'png' === $ext ) {
                $animated = false !== strpos( $head, 'acTL' );
            } elseif ( 'webp' === $ext ) {
                $animated = false !== strpos( $head, 'ANIM' ) && false !== strpos( $head, 'VP8X' );
            } else {
                $animated = false !== strpos( substr( $head, 0, 64 ), 'avis' );
            }
        }
        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
        fclose( $fh );
        return $animated;
    }

    /**
     * Quality the file was saved with, read from its JPEG quantization table (like ImageMagick does).
     * Returns null when it cannot be told reliably (unusual tables), then no cap is applied.
     *
     * @param string $path JPEG file.
     * @return int|null 1-100.
     */
    private static function estimate_jpeg_quality( $path ) {
        if ( !is_readable( $path ) ) {
            return null;
        }
        // The quantization table sits in the first few KB, before the image data.
        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Reads the header of a local image.
        $data = file_get_contents(
            $path,
            false,
            null,
            0,
            262144
        );
        if ( !is_string( $data ) || strlen( $data ) < 4 || "\xff\xd8" !== substr( $data, 0, 2 ) ) {
            return null;
        }
        $total = strlen( $data );
        $pos = 2;
        while ( $pos + 4 <= $total ) {
            if ( "\xff" !== $data[$pos] ) {
                ++$pos;
                continue;
            }
            $code = ord( $data[$pos + 1] );
            if ( 0xff === $code ) {
                ++$pos;
                // Fill byte.
                continue;
            }
            if ( 0xda === $code || 0xd9 === $code ) {
                return null;
                // The image data starts here: there was no quantization table.
            }
            if ( 0x0 === $code || 0x1 === $code || $code >= 0xd0 && $code <= 0xd8 ) {
                $pos += 2;
                // Markers without a length.
                continue;
            }
            $segment = (ord( $data[$pos + 2] ) << 8) + ord( $data[$pos + 3] );
            if ( $segment < 2 ) {
                return null;
            }
            if ( 0xdb === $code ) {
                $start = $pos + 4;
                if ( $start + 65 > $total || 0 !== ord( $data[$start] ) >> 4 ) {
                    // Needs a complete 8-bit table.
                    return null;
                }
                $table = array();
                for ($k = 0; $k < 64; $k++) {
                    $table[$k] = ord( $data[$start + 1 + $k] );
                }
                return self::quality_from_quant_table( $table );
            }
            $pos += 2 + $segment;
        }
        return null;
    }

    /**
     * Match a quantization table (zigzag order) against the standard libjpeg tables for quality 1-100.
     *
     * @param int[] $table 64 values.
     * @return int|null Quality, or null if no standard table fits closely.
     */
    private static function quality_from_quant_table( $table ) {
        $standard = array(
            16,
            11,
            12,
            14,
            12,
            10,
            16,
            14,
            13,
            14,
            18,
            17,
            16,
            19,
            24,
            40,
            26,
            24,
            22,
            22,
            24,
            49,
            35,
            37,
            29,
            40,
            58,
            51,
            61,
            60,
            57,
            51,
            56,
            55,
            64,
            72,
            92,
            78,
            64,
            68,
            87,
            69,
            55,
            56,
            80,
            109,
            81,
            87,
            95,
            98,
            103,
            104,
            103,
            62,
            77,
            113,
            121,
            112,
            100,
            120,
            92,
            101,
            103,
            99
        );
        $best_quality = null;
        $best_diff = PHP_INT_MAX;
        for ($q = 1; $q <= 100; $q++) {
            $scale = ( $q < 50 ? 5000 / $q : 200 - 2 * $q );
            $diff = 0;
            for ($i = 0; $i < 64; $i++) {
                $expected = (int) floor( ($standard[$i] * $scale + 50) / 100 );
                $expected = max( 1, min( 255, $expected ) );
                $diff += abs( $expected - $table[$i] );
            }
            if ( $diff < $best_diff ) {
                $best_diff = $diff;
                $best_quality = $q;
            }
        }
        // Only trust a close match (an average difference of at most 1.5 per value).
        return ( $best_diff <= 96 ? $best_quality : null );
    }

    /**
     * Quality number each codec needs for the SAME look as the chosen level. The level's number is a JPEG
     * quality; WebP and AVIF reach that look with a lower number (so their files get smaller, not uglier).
     *
     * @param int    $quality JPEG-equivalent quality (1-100).
     * @param string $kind    jpeg|png|webp|avif|gif.
     * @return int
     */
    private static function quality_for_format( $quality, $kind ) {
        $quality = max( 1, min( 100, (int) $quality ) );
        if ( 'webp' === $kind ) {
            return max( 1, $quality - 5 );
        }
        if ( 'avif' === $kind ) {
            return max( 1, (int) round( $quality * 0.75 ) );
        }
        return $quality;
    }

    /**
     * The quality number that is really handed to the encoder. A JPEG is never encoded above the quality it
     * already has (that only makes the file bigger without improving anything).
     *
     * @param int    $quality     Quality of the level (1-100).
     * @param string $source_kind jpeg|png|webp|avif|gif.
     * @param string $target_kind jpeg|png|webp|avif|gif.
     * @param string $source_path Source file.
     * @return int
     */
    private static function resolve_encode_quality(
        $quality,
        $source_kind,
        $target_kind,
        $source_path
    ) {
        $base = max( 1, min( 100, (int) $quality ) );
        if ( 'jpeg' === $source_kind ) {
            $estimated = self::estimate_jpeg_quality( $source_path );
            if ( $estimated ) {
                $base = min( $base, $estimated );
            }
        }
        return self::quality_for_format( $base, $target_kind );
    }

    /**
     * Helper: Determine numeric quality from compression level.
     *
     * @param string|int $level          Compression preset ('lossless', 'balanced', 'aggressive', 'custom') or numeric quality.
     * @param int|null   $custom_quality Custom numeric quality value (1-100).
     * @return int|false Numeric quality (1-100) or false if custom quality is missing or invalid.
     */
    public static function determine_quality( $level, $custom_quality = null ) {
        $level_str = strtolower( trim( strval( $level ) ) );
        if ( 'custom' === $level_str ) {
            if ( null !== $custom_quality && '' !== $custom_quality && is_numeric( $custom_quality ) ) {
                $val = intval( $custom_quality );
                if ( $val >= 1 && $val <= 100 ) {
                    return max( 1, min( 100, $val ) );
                }
            }
            return false;
        }
        if ( is_numeric( $level ) ) {
            $val = intval( $level );
            if ( $val >= 1 && $val <= 100 ) {
                return max( 1, min( 100, $val ) );
            }
        }
        switch ( $level_str ) {
            case 'lossless':
                return 95;
            // Lossless visual preservation avoiding quality 100 bloat
            case 'aggressive':
                return 58;
            // Maximum file size reduction
            case 'balanced':
            default:
                return 78;
        }
    }

    /**
     * Process image using Imagick extension.
     */
    private static function process_with_imagick(
        $source_path,
        $dest_path,
        $attachment_id,
        $options,
        $quality,
        $output_format
    ) {
        $imagick = new Imagick();
        if ( !$imagick->readImage( $source_path ) ) {
            return array(
                'success'       => false,
                'error_code'    => 'imagick_read_failed',
                'error_message' => 'Imagick failed to read source image file.',
            );
        }
        // What the source really is (and, for a "lossless" JPEG, how it was sampled) before anything is changed.
        $source_kind = strtolower( (string) $imagick->getImageFormat() );
        if ( 'jpg' === $source_kind ) {
            $source_kind = 'jpeg';
        }
        $source_sampling = '';
        if ( 'jpeg' === $source_kind && isset( $options['compression_level'] ) && 'lossless' === $options['compression_level'] ) {
            try {
                $source_sampling = (string) $imagick->getImageProperty( 'jpeg:sampling-factor' );
            } catch ( Throwable $e ) {
                $source_sampling = '';
            }
        }
        // Perform EXIF Auto-Orientation BEFORE stripping metadata and BEFORE resizing
        if ( method_exists( $imagick, 'autoOrientImage' ) ) {
            $imagick->autoOrientImage();
        } elseif ( method_exists( $imagick, 'autoOrient' ) ) {
            $imagick->autoOrient();
        }
        // Handle EXIF metadata
        if ( empty( $options['keep_exif'] ) ) {
            $imagick->stripImage();
        }
        // Resize if max_width or max_height specified (defensively clamped 0-10000)
        $max_width = max( 0, min( 10000, intval( $options['max_width'] ) ) );
        $max_height = max( 0, min( 10000, intval( $options['max_height'] ) ) );
        $orig_width = $imagick->getImageWidth();
        $orig_height = $imagick->getImageHeight();
        if ( $max_width > 0 && $orig_width > $max_width || $max_height > 0 && $orig_height > $max_height ) {
            $imagick->resizeImage(
                $max_width,
                $max_height,
                Imagick::FILTER_LANCZOS,
                1,
                true
            );
        }
        // Format conversion
        $target_kind = $source_kind;
        if ( 'webp' === $output_format ) {
            $imagick->setImageFormat( 'WEBP' );
            $target_kind = 'webp';
        } elseif ( 'avif' === $output_format ) {
            $imagick->setImageFormat( 'AVIF' );
            $target_kind = 'avif';
        }
        // Compression settings
        if ( 'png' === $target_kind ) {
            // PNG is lossless whatever the level: the strongest zlib level with adaptive filtering gives the smallest file.
            $imagick->setOption( 'png:compression-level', '9' );
            $imagick->setImageCompressionQuality( 95 );
        } else {
            // JPEG-equivalent level -> the number this codec needs for the same look (never above the source's own quality).
            $imagick->setImageCompressionQuality( self::resolve_encode_quality(
                $quality,
                $source_kind,
                $target_kind,
                $source_path
            ) );
            if ( 'jpeg' === $target_kind ) {
                $imagick->setInterlaceScheme( Imagick::INTERLACE_PLANE );
                // Progressive JPEG: smaller file, same pixels.
                if ( '' !== $source_sampling ) {
                    $imagick->setOption( 'jpeg:sampling-factor', $source_sampling );
                    // "Lossless": keep the original chroma sampling.
                }
            } elseif ( 'webp' === $target_kind ) {
                $imagick->setOption( 'webp:method', '6' );
                // Slowest / best WebP compression at the same quality.
                if ( 'png' === $source_kind && isset( $options['compression_level'] ) && 'lossless' === $options['compression_level'] ) {
                    $imagick->setOption( 'webp:lossless', 'true' );
                    // PNG source + "lossless": a truly lossless WebP.
                }
            }
        }
        // Save image to target dest_path
        if ( !$imagick->writeImage( $dest_path ) ) {
            $imagick->clear();
            $imagick->destroy();
            return array(
                'success'       => false,
                'error_code'    => 'imagick_write_failed',
                'error_message' => "Imagick failed to write optimized image file to disk at: {$dest_path}",
            );
        }
        $imagick->clear();
        $imagick->destroy();
        return array(
            'success'       => true,
            'new_file_path' => $dest_path,
            'engine_used'   => 'imagick',
        );
    }

    /**
     * Process image using GD library.
     */
    private static function process_with_gd(
        $source_path,
        $dest_path,
        $attachment_id,
        $options,
        $quality,
        $output_format
    ) {
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
        $info = @getimagesize( $source_path );
        if ( !$info ) {
            return array(
                'success'       => false,
                'error_code'    => 'gd_invalid_image',
                'error_message' => 'GD getimagesize() failed to detect image dimensions or mime type.',
            );
        }
        $mime = $info['mime'];
        $orig_width = $info[0];
        $orig_height = $info[1];
        $kind_map = array(
            'image/jpeg' => 'jpeg',
            'image/png'  => 'png',
            'image/gif'  => 'gif',
            'image/webp' => 'webp',
            'image/avif' => 'avif',
        );
        $source_kind = ( isset( $kind_map[$mime] ) ? $kind_map[$mime] : '' );
        // Load image resource
        switch ( $mime ) {
            case 'image/jpeg':
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $image = @imagecreatefromjpeg( $source_path );
                break;
            case 'image/png':
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $image = @imagecreatefrompng( $source_path );
                break;
            case 'image/gif':
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $image = @imagecreatefromgif( $source_path );
                break;
            case 'image/webp':
                if ( function_exists( 'imagecreatefromwebp' ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                    $image = @imagecreatefromwebp( $source_path );
                } else {
                    $image = false;
                }
                break;
            case 'image/avif':
                if ( function_exists( 'imagecreatefromavif' ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                    $image = @imagecreatefromavif( $source_path );
                } else {
                    $image = false;
                }
                break;
            default:
                $image = false;
                break;
        }
        if ( !$image ) {
            return array(
                'success'       => false,
                'error_code'    => 'gd_load_failed',
                'error_message' => "GD failed to create image resource from file of type: {$mime}",
            );
        }
        // Perform EXIF Auto-Orientation for JPEGs BEFORE resizing
        if ( 'image/jpeg' === $mime && function_exists( 'exif_read_data' ) ) {
            try {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $exif = @exif_read_data( $source_path );
                $orientation = ( !empty( $exif['Orientation'] ) ? intval( $exif['Orientation'] ) : 0 );
                if ( $orientation > 1 ) {
                    $rotated = false;
                    switch ( $orientation ) {
                        case 2:
                            if ( function_exists( 'imageflip' ) ) {
                                imageflip( $image, IMG_FLIP_HORIZONTAL );
                                $rotated = $image;
                            }
                            break;
                        case 3:
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                            $rotated = @imagerotate( $image, 180, 0 );
                            break;
                        case 4:
                            if ( function_exists( 'imageflip' ) ) {
                                imageflip( $image, IMG_FLIP_VERTICAL );
                                $rotated = $image;
                            }
                            break;
                        case 5:
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                            $rotated = @imagerotate( $image, -90, 0 );
                            if ( $rotated && function_exists( 'imageflip' ) ) {
                                imageflip( $rotated, IMG_FLIP_HORIZONTAL );
                            }
                            break;
                        case 6:
                            // 90 degrees CW rotation needed (270 degrees CCW in GD)
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                            $rotated = @imagerotate( $image, -90, 0 );
                            break;
                        case 7:
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                            $rotated = @imagerotate( $image, 90, 0 );
                            if ( $rotated && function_exists( 'imageflip' ) ) {
                                imageflip( $rotated, IMG_FLIP_HORIZONTAL );
                            }
                            break;
                        case 8:
                            // 90 degrees CCW rotation needed (90 degrees CCW in GD)
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                            $rotated = @imagerotate( $image, 90, 0 );
                            break;
                    }
                    if ( $rotated && (is_resource( $rotated ) && get_resource_type( $rotated ) === 'gd' || is_object( $rotated ) && $rotated instanceof GdImage) ) {
                        if ( $rotated !== $image ) {
                            imagedestroy( $image );
                            $image = $rotated;
                        }
                        // Refresh original dimensions after physical rotation
                        $orig_width = imagesx( $image );
                        $orig_height = imagesy( $image );
                    }
                }
            } catch ( Exception $e ) {
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::warning( 'EXIF auto-orient skipped during GD processing: ' . $e->getMessage() );
                }
            } catch ( Throwable $t ) {
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::warning( 'EXIF auto-orient skipped during GD processing: ' . $t->getMessage() );
                }
            }
        }
        // Handle resizing (defensively clamped 0-10000)
        $max_width = max( 0, min( 10000, intval( $options['max_width'] ) ) );
        $max_height = max( 0, min( 10000, intval( $options['max_height'] ) ) );
        if ( $max_width > 0 && $orig_width > $max_width || $max_height > 0 && $orig_height > $max_height ) {
            $ratio = min( ( $max_width > 0 ? $max_width / $orig_width : 1 ), ( $max_height > 0 ? $max_height / $orig_height : 1 ) );
            $target_w = max( 1, intval( $orig_width * $ratio ) );
            $target_h = max( 1, intval( $orig_height * $ratio ) );
            if ( function_exists( 'imagescale' ) ) {
                $resized = imagescale( $image, $target_w, $target_h );
            } else {
                $resized = imagecreatetruecolor( $target_w, $target_h );
                if ( !empty( $options['preserve_transparency'] ) ) {
                    imagealphablending( $resized, false );
                    imagesavealpha( $resized, true );
                }
                imagecopyresampled(
                    $resized,
                    $image,
                    0,
                    0,
                    0,
                    0,
                    $target_w,
                    $target_h,
                    $orig_width,
                    $orig_height
                );
            }
            if ( $resized ) {
                imagedestroy( $image );
                $image = $resized;
            }
        }
        // Preserve alpha channel transparency if enabled
        if ( !empty( $options['preserve_transparency'] ) ) {
            imagealphablending( $image, false );
            imagesavealpha( $image, true );
        }
        $target_kind = $source_kind;
        if ( 'webp' === $output_format ) {
            $target_kind = 'webp';
        } elseif ( 'avif' === $output_format ) {
            $target_kind = 'avif';
        }
        // WebP and AVIF cannot be written from a palette (8-bit) image: convert it to true colour first.
        if ( in_array( $target_kind, array('webp', 'avif'), true ) && function_exists( 'imageistruecolor' ) && !imageistruecolor( $image ) && function_exists( 'imagepalettetotruecolor' ) ) {
            imagepalettetotruecolor( $image );
            if ( !empty( $options['preserve_transparency'] ) ) {
                imagealphablending( $image, false );
                imagesavealpha( $image, true );
            }
        }
        // JPEG-equivalent level -> the number this codec needs for the same look (never above the source's own quality).
        $clamped_quality = self::resolve_encode_quality(
            $quality,
            $source_kind,
            $target_kind,
            $source_path
        );
        $saved = false;
        if ( 'webp' === $target_kind ) {
            if ( !function_exists( 'imagewebp' ) ) {
                imagedestroy( $image );
                return array(
                    'success'       => false,
                    'error_code'    => 'webp_unsupported_gd',
                    'error_message' => 'imagewebp() function does not exist in GD build on this server.',
                );
            }
            $webp_quality = $clamped_quality;
            if ( 'png' === $source_kind && isset( $options['compression_level'] ) && 'lossless' === $options['compression_level'] && defined( 'IMG_WEBP_LOSSLESS' ) ) {
                $webp_quality = IMG_WEBP_LOSSLESS;
                // PNG source + "lossless": a truly lossless WebP.
            }
            $saved = imagewebp( $image, $dest_path, $webp_quality );
        } elseif ( 'avif' === $target_kind ) {
            if ( function_exists( 'imageavif' ) ) {
                $saved = imageavif( $image, $dest_path, $clamped_quality );
            } else {
                imagedestroy( $image );
                return array(
                    'success'       => false,
                    'error_code'    => 'avif_unsupported_gd',
                    'error_message' => 'imageavif() function does not exist in GD build on this server.',
                );
            }
        } else {
            switch ( $mime ) {
                case 'image/jpeg':
                    imageinterlace( $image, true );
                    // Progressive JPEG: smaller file, same pixels.
                    $saved = imagejpeg( $image, $dest_path, $clamped_quality );
                    break;
                case 'image/png':
                    // PNG is lossless whatever the level: the strongest compression gives the smallest file.
                    if ( defined( 'PNG_ALL_FILTERS' ) ) {
                        $saved = imagepng(
                            $image,
                            $dest_path,
                            9,
                            PNG_ALL_FILTERS
                        );
                    } else {
                        $saved = imagepng( $image, $dest_path, 9 );
                    }
                    break;
                case 'image/webp':
                    $saved = ( function_exists( 'imagewebp' ) ? imagewebp( $image, $dest_path, $clamped_quality ) : false );
                    break;
                case 'image/avif':
                    $saved = ( function_exists( 'imageavif' ) ? imageavif( $image, $dest_path, $clamped_quality ) : false );
                    break;
                case 'image/gif':
                    $saved = imagegif( $image, $dest_path );
                    break;
                default:
                    $saved = false;
                    break;
            }
        }
        imagedestroy( $image );
        if ( !$saved ) {
            return array(
                'success'       => false,
                'error_code'    => 'gd_save_failed',
                'error_message' => "GD failed to write optimized image file to disk at: {$dest_path}",
            );
        }
        return array(
            'success'       => true,
            'new_file_path' => $dest_path,
            'engine_used'   => 'gd',
        );
    }

    /**
     * Helper: Format error response and record error postmeta.
     */
    private static function format_error( $attachment_id, $code, $message ) {
        if ( $attachment_id > 0 ) {
            update_post_meta( $attachment_id, '_imgsentry_optimization_status', 'failed' );
            update_post_meta( $attachment_id, '_imgsentry_optimization_error', $message );
        }
        // Show the failure in the live progress. Errors that happen before this request owns the attachment
        // (a busy lock belongs to ANOTHER request, which is still working) must not touch its progress.
        if ( $attachment_id > 0 && class_exists( 'ImgSentry_Optimize_Progress' ) && !in_array( $code, array('attachment_locked', 'invalid_attachment_id', 'imgsentry_file_excluded'), true ) ) {
            ImgSentry_Optimize_Progress::finish( $attachment_id, 'failed', $message );
        }
        return array(
            'success'       => false,
            'attachment_id' => $attachment_id,
            'original_size' => 0,
            'new_size'      => 0,
            'bytes_saved'   => 0,
            'percent_saved' => 0,
            'backup_path'   => '',
            'has_backup'    => false,
            'new_filepath'  => '',
            'output_format' => '',
            'engine_used'   => '',
            'error'         => $message,
            'error_code'    => $code,
        );
    }

    /**
     * Helper: Get mime type from file extension.
     */
    private static function get_mime_from_extension( $ext, $default = 'image/jpeg' ) {
        switch ( strtolower( $ext ) ) {
            case 'webp':
                return 'image/webp';
            case 'avif':
                return 'image/avif';
            case 'png':
                return 'image/png';
            case 'gif':
                return 'image/gif';
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            default:
                return $default;
        }
    }

    /**
     * Get the dedicated backup base directory path.
     *
     * Returns wp-content/uploads/imgsentry/backups/ (or custom path) with optional attachment date subdirectory.
     *
     * @param int $attachment_id Optional attachment ID.
     * @return string Directory path with trailing slash.
     */
    public static function get_backup_base_dir( $attachment_id = 0 ) {
        $settings = get_option( 'imgsentry_settings', array() );
        if ( class_exists( 'ImgSentry_Settings' ) ) {
            $defaults = ImgSentry_Settings::instance()->get_defaults();
            $settings = wp_parse_args( $settings, $defaults );
        }
        $default_backup = 'wp-content/uploads/imgsentry/backups/';
        $raw_configured = ( isset( $settings['backupDirectory'] ) ? (string) $settings['backupDirectory'] : '' );
        $safe_configured = ( class_exists( 'ImgSentry_Settings' ) ? ImgSentry_Settings::sanitize_backup_directory( $raw_configured, $default_backup ) : (( !empty( $raw_configured ) ? $raw_configured : $default_backup )) );
        $configured_path = trim( $safe_configured, '/\\' );
        $normalized_conf = wp_normalize_path( $configured_path );
        // Legacy default paths that should automatically resolve to the centralized resolver
        $legacy_defaults = array(
            'wp-content/uploads/imgsentrybackups/backups',
            'wp-content/uploads/imgsentrybackups',
            'wp-content/uploads/imgsentry/backups',
            'imgsentrybackups/backups',
            'imgsentrybackups'
        );
        // If backupDirectory is empty or matches known old/current defaults, use centralized resolver
        if ( empty( $configured_path ) || in_array( strtolower( $normalized_conf ), $legacy_defaults, true ) ) {
            $sub_path = '';
            if ( $attachment_id > 0 ) {
                $post = get_post( $attachment_id );
                $year = '';
                $month = '';
                if ( $post && !empty( $post->post_date ) && $post->post_date !== '0000-00-00 00:00:00' ) {
                    $timestamp = strtotime( $post->post_date );
                    if ( $timestamp ) {
                        $year = gmdate( 'Y', $timestamp );
                        $month = gmdate( 'm', $timestamp );
                    }
                }
                if ( empty( $year ) || empty( $month ) ) {
                    $year = gmdate( 'Y' );
                    $month = gmdate( 'm' );
                }
                $sub_path = $year . '/' . $month . '/';
            }
            if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
                return trailingslashit( ImgSentry_Storage_Paths::get_backups_dir( $sub_path ) );
            }
            $upload_dir = wp_upload_dir();
            $default_dir = trailingslashit( $upload_dir['basedir'] ) . 'imgsentry/backups/';
            return trailingslashit( $default_dir . $sub_path );
        }
        // User set an explicitly custom non-default path: honour custom path
        $uploads_prefix = ( class_exists( 'ImgSentry_Settings' ) && method_exists( 'ImgSentry_Settings', 'get_uploads_relative_prefix' ) ? ImgSentry_Settings::get_uploads_relative_prefix() : 'wp-content/uploads' );
        if ( 0 !== strpos( $configured_path, $uploads_prefix ) ) {
            $configured_path = trailingslashit( $uploads_prefix ) . ltrim( $configured_path, '/' );
        }
        $base_dir = trailingslashit( ABSPATH ) . $configured_path;
        if ( $attachment_id > 0 ) {
            $post = get_post( $attachment_id );
            $year = '';
            $month = '';
            if ( $post && !empty( $post->post_date ) && $post->post_date !== '0000-00-00 00:00:00' ) {
                $timestamp = strtotime( $post->post_date );
                if ( $timestamp ) {
                    $year = gmdate( 'Y', $timestamp );
                    $month = gmdate( 'm', $timestamp );
                }
            }
            if ( empty( $year ) || empty( $month ) ) {
                $year = gmdate( 'Y' );
                $month = gmdate( 'm' );
            }
            return trailingslashit( $base_dir ) . $year . '/' . $month . '/';
        }
        return trailingslashit( $base_dir );
    }

    /**
     * Ensure the dedicated ImgSentry parent and backups subfolder exist and are protected.
     *
     * Automatically writes:
     * - An .htaccess file at wp-content/uploads/imgsentry/.htaccess and backups/.htaccess denying direct web access.
     * - A blank index.php stub in wp-content/uploads/imgsentry/ and backups/ subdirectories.
     *
     * @return true|WP_Error True if storage is ready and secured, or WP_Error on filesystem error.
     */
    public static function init_backup_storage() {
        if ( class_exists( 'ImgSentry_Storage_Paths' ) ) {
            ImgSentry_Storage_Paths::init_storage();
        }
        $backup_dir = self::get_backup_base_dir();
        $upload_dir = wp_upload_dir();
        $parent_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_base_dir() : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry' );
        // 1. Create parent directory wp-content/uploads/imgsentry/
        if ( !file_exists( $parent_dir ) ) {
            if ( !wp_mkdir_p( $parent_dir ) ) {
                return new WP_Error('backup_dir_failed', "Could not create parent storage directory at: {$parent_dir}");
            }
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call may fail on some hosts; the result is checked.
        @chmod( $parent_dir, 0755 );
        // 2. Create backups subfolder wp-content/uploads/imgsentry/backups/
        if ( !file_exists( $backup_dir ) ) {
            if ( !wp_mkdir_p( $backup_dir ) ) {
                return new WP_Error('backup_dir_failed', "Could not create backup directory at: {$backup_dir}");
            }
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call may fail on some hosts; the result is checked.
        @chmod( $backup_dir, 0755 );
        // 3. Fix permissions on any existing backup subdirectories
        self::fix_backup_folder_permissions();
        $htaccess_content = "# Apache 2.2\n" . "<IfModule !mod_authz_core.c>\n" . "    Deny from all\n" . "</IfModule>\n\n" . "# Apache 2.4+\n" . "<IfModule mod_authz_core.c>\n" . "    Require all denied\n" . "</IfModule>\n";
        $index_stub = "<?php\n// Silence is golden.\n";
        // Security protection for parent directory (imgsentry/)
        $parent_htaccess = trailingslashit( $parent_dir ) . '.htaccess';
        if ( !file_exists( $parent_htaccess ) ) {
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call may fail on some hosts; the result is checked.
            @file_put_contents( $parent_htaccess, $htaccess_content );
        }
        $parent_index = trailingslashit( $parent_dir ) . 'index.php';
        if ( !file_exists( $parent_index ) ) {
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call may fail on some hosts; the result is checked.
            @file_put_contents( $parent_index, $index_stub );
        }
        // Security protection for backups subfolder (backups/)
        $backups_htaccess = trailingslashit( $backup_dir ) . '.htaccess';
        if ( !file_exists( $backups_htaccess ) ) {
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call may fail on some hosts; the result is checked.
            @file_put_contents( $backups_htaccess, $htaccess_content );
        }
        $backups_index = trailingslashit( $backup_dir ) . 'index.php';
        if ( !file_exists( $backups_index ) ) {
            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- The filesystem call may fail on some hosts; the result is checked.
            @file_put_contents( $backups_index, $index_stub );
        }
        return true;
    }

    /**
     * Ensure all existing backup folders (parent, backups subfolder, and attachment subfolders) have 0755 directory permissions.
     */
    public static function fix_backup_folder_permissions( $dir = '' ) {
        if ( empty( $dir ) ) {
            $upload_dir = wp_upload_dir();
            $parent_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? wp_normalize_path( ImgSentry_Storage_Paths::get_base_dir() ) : wp_normalize_path( trailingslashit( $upload_dir['basedir'] ) . 'imgsentry' ) );
            $backup_dir = wp_normalize_path( self::get_backup_base_dir() );
            if ( is_dir( $parent_dir ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call may fail on some hosts; the result is checked.
                @chmod( $parent_dir, 0755 );
            }
            if ( is_dir( $backup_dir ) ) {
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call may fail on some hosts; the result is checked.
                @chmod( $backup_dir, 0755 );
                self::fix_backup_folder_permissions( $backup_dir );
            }
            return;
        }
        $subdirs = glob( trailingslashit( $dir ) . '*', GLOB_ONLYDIR );
        if ( is_array( $subdirs ) ) {
            foreach ( $subdirs as $subdir ) {
                if ( is_dir( $subdir ) ) {
                    // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- The filesystem call may fail on some hosts; the result is checked.
                    @chmod( $subdir, 0755 );
                    self::fix_backup_folder_permissions( $subdir );
                }
            }
        }
    }

    /**
     * Helper: Validate that a backup path resides within allowed directories.
     *
     * Supports the dedicated wp-content/uploads/imgsentry/ location
     * and standard uploads location.
     *
     * @param string $backup_path The absolute path to test.
     * @return bool True if valid and safe, false otherwise.
     */
    public static function is_valid_backup_path( $backup_path ) {
        if ( empty( $backup_path ) || !is_string( $backup_path ) ) {
            return false;
        }
        $real_backup = realpath( $backup_path );
        if ( !$real_backup ) {
            return false;
        }
        $normalized_backup = wp_normalize_path( $real_backup );
        // Check 1: Allowed inside configured backup base directory
        $backup_base = self::get_backup_base_dir();
        $real_storage = realpath( $backup_base );
        if ( $real_storage && 0 === strpos( $normalized_backup, wp_normalize_path( $real_storage ) ) ) {
            return true;
        }
        // Check 2: Allowed inside parent imgsentry directory
        $upload_dir = wp_upload_dir();
        $parent_dir = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_base_dir() : trailingslashit( $upload_dir['basedir'] ) . 'imgsentry' );
        $real_parent = realpath( $parent_dir );
        if ( $real_parent && 0 === strpos( $normalized_backup, wp_normalize_path( $real_parent ) ) ) {
            return true;
        }
        // Legacy Check: Also support old ImgsentryBackups path if files are still being read
        $legacy_parent = trailingslashit( $upload_dir['basedir'] ) . 'ImgsentryBackups';
        $real_legacy = realpath( $legacy_parent );
        if ( $real_legacy && 0 === strpos( $normalized_backup, wp_normalize_path( $real_legacy ) ) ) {
            return true;
        }
        // Check 3: Standard uploads base directory
        $real_upload_base = realpath( $upload_dir['basedir'] );
        if ( $real_upload_base && 0 === strpos( $normalized_backup, wp_normalize_path( $real_upload_base ) ) ) {
            return true;
        }
        return false;
    }

    /**
     * Helper: Recursively delete a directory.
     */
    private static function recursive_delete_dir( $dir_path ) {
        if ( !file_exists( $dir_path ) ) {
            return;
        }
        if ( !is_dir( $dir_path ) ) {
            wp_delete_file( $dir_path );
            return;
        }
        $files = array_diff( scandir( $dir_path ), array('.', '..') );
        foreach ( $files as $file ) {
            $sub_path = trailingslashit( $dir_path ) . $file;
            if ( is_dir( $sub_path ) ) {
                self::recursive_delete_dir( $sub_path );
            } else {
                wp_delete_file( $sub_path );
            }
        }
        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call may fail on some hosts; the result is checked.
        @rmdir( $dir_path );
    }

    /**
     * One-time utility to scan all attachments with _imgsentry_backup_original_path set,
     * verify if the backup file exists on disk, and clear stale metadata if missing.
     *
     * @return array Summary of scanned and cleared items.
     */
    /**
     * Deletes original backup files that exceed the configured retention period.
     *
     * @param int $retention_days Number of days to retain backups before deleting. 0 means forever.
     * @return int Number of deleted backup files.
     */
    public static function purge_expired_optimization_backups( $retention_days ) {
        if ( empty( $retention_days ) || (int) $retention_days <= 0 ) {
            return 0;
            // Forever
        }
        global $wpdb;
        $deleted_count = 0;
        $cutoff_time = time() - (int) $retention_days * DAY_IN_SECONDS;
        $results = $wpdb->get_results( "SELECT post_id, meta_value as backup_path FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_backup_original_path'" );
        if ( empty( $results ) ) {
            return 0;
        }
        foreach ( $results as $row ) {
            $attachment_id = $row->post_id;
            $backup_path = $row->backup_path;
            if ( empty( $backup_path ) || !file_exists( $backup_path ) ) {
                continue;
            }
            // Calculate backup time
            $backup_time = filemtime( $backup_path );
            if ( $backup_time < $cutoff_time ) {
                // Backup is older than retention period. Delete it!
                wp_delete_file( $backup_path );
                // Clean up empty directories recursively (year/month)
                $dir = dirname( $backup_path );
                if ( is_dir( $dir ) && class_exists( 'ImgSentry_Storage_Paths' ) ) {
                    $base_backups_dir = ImgSentry_Storage_Paths::get_backups_dir();
                    // Ensure we only delete empty directories within the backups folder
                    while ( $dir !== $base_backups_dir && strlen( $dir ) > strlen( $base_backups_dir ) ) {
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                        $files = @scandir( $dir );
                        if ( is_array( $files ) && count( $files ) <= 2 ) {
                            // Only . and ..
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call may fail on some hosts; the result is checked.
                            @rmdir( $dir );
                            $dir = dirname( $dir );
                        } else {
                            break;
                        }
                    }
                }
                // Clear metadata so UI knows backup is gone
                delete_post_meta( $attachment_id, '_imgsentry_backup_original_path' );
                delete_post_meta( $attachment_id, '_imgsentry_backup_path' );
                delete_post_meta( $attachment_id, '_imgsentry_original_mime_type' );
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::info( sprintf( 'Auto-deleted backup for attachment ID %d after %d days retention.', $attachment_id, $retention_days ) );
                }
                $deleted_count++;
            }
        }
        return $deleted_count;
    }

    /**
     * Number of original-image backups and the disk space they use.
     *
     * @return array{count:int,bytes:int}
     */
    public static function get_backup_usage() {
        global $wpdb;
        $rows = $wpdb->get_col( "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_backup_original_path'" );
        $count = 0;
        $bytes = 0;
        foreach ( (array) $rows as $path ) {
            if ( !empty( $path ) && file_exists( $path ) ) {
                $count++;
                // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                $bytes += (int) @filesize( $path );
            }
        }
        return array(
            'count' => $count,
            'bytes' => $bytes,
        );
    }

    /**
     * Delete every original-image backup (restore is not possible afterwards). Images stay optimized.
     *
     * @return int Number of deleted backup files.
     */
    public static function delete_all_backups() {
        global $wpdb;
        $rows = $wpdb->get_results( "SELECT post_id, meta_value AS backup_path FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_backup_original_path'" );
        $deleted = 0;
        foreach ( (array) $rows as $row ) {
            $path = $row->backup_path;
            if ( !empty( $path ) && file_exists( $path ) && self::is_valid_backup_path( $path ) ) {
                wp_delete_file( $path );
                if ( !file_exists( $path ) ) {
                    $deleted++;
                }
            }
            if ( empty( $path ) || !file_exists( $path ) ) {
                delete_post_meta( $row->post_id, '_imgsentry_backup_original_path' );
                delete_post_meta( $row->post_id, '_imgsentry_backup_path' );
                delete_post_meta( $row->post_id, '_imgsentry_original_mime_type' );
            }
        }
        if ( class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::info( sprintf( 'All original-image backups were deleted by the site owner (%d files).', $deleted ) );
        }
        return $deleted;
    }

    public static function clean_stale_backups() {
        global $wpdb;
        $results = $wpdb->get_results( "SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_imgsentry_backup_original_path'" );
        $total_scanned = 0;
        $cleared_count = 0;
        if ( !empty( $results ) && is_array( $results ) ) {
            foreach ( $results as $row ) {
                $total_scanned++;
                $attachment_id = intval( $row->post_id );
                $backup_path = trim( strval( $row->meta_value ) );
                $file_exists = !empty( $backup_path ) && file_exists( $backup_path );
                if ( !$file_exists ) {
                    // Check fallback location in flat backup folder
                    $backup_dir = self::get_backup_base_dir( $attachment_id );
                    if ( is_dir( $backup_dir ) ) {
                        $files = glob( trailingslashit( $backup_dir ) . '*-' . intval( $attachment_id ) . '.*' );
                        if ( !empty( $files ) && is_file( $files[0] ) ) {
                            $file_exists = true;
                            update_post_meta( $attachment_id, '_imgsentry_backup_original_path', $files[0] );
                            update_post_meta( $attachment_id, '_imgsentry_backup_path', $files[0] );
                        }
                    }
                }
                if ( $file_exists ) {
                    // Clear tracking timestamp if file is found/reappeared
                    delete_post_meta( $attachment_id, '_imgsentry_backup_missing_since' );
                } else {
                    $missing_since = get_post_meta( $attachment_id, '_imgsentry_backup_missing_since', true );
                    if ( empty( $missing_since ) ) {
                        // Record when it was first detected missing
                        update_post_meta( $attachment_id, '_imgsentry_backup_missing_since', time() );
                    } else {
                        // It was previously detected missing. Check if 7 days have elapsed (7 * 86400 = 604800)
                        $elapsed = time() - intval( $missing_since );
                        if ( $elapsed >= 7 * DAY_IN_SECONDS ) {
                            delete_post_meta( $attachment_id, '_imgsentry_backup_original_path' );
                            delete_post_meta( $attachment_id, '_imgsentry_backup_path' );
                            delete_post_meta( $attachment_id, '_imgsentry_original_mime_type' );
                            delete_post_meta( $attachment_id, '_imgsentry_backup_missing_since' );
                            $cleared_count++;
                            if ( class_exists( 'ImgSentry_Logger' ) ) {
                                ImgSentry_Logger::info( 'Stale backup reference purged after 7-day grace period', array(
                                    'type'      => 'Maintenance',
                                    'source'    => 'Optimizer Engine',
                                    'details'   => sprintf(
                                        'Scanned and removed stale backup reference for attachment #%d (file missing since %s, exceeding 7-day grace period: %s).',
                                        $attachment_id,
                                        gmdate( 'Y-m-d H:i:s', intval( $missing_since ) ),
                                        $backup_path
                                    ),
                                    'object_id' => $attachment_id,
                                ) );
                            }
                        }
                    }
                }
            }
        }
        if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
            ImgSentry_Optimization_Stats::invalidate_cache();
        }
        // Also run orphaned trash backups cleanup to purge any unoptimized trash files
        $trash_cleanup = self::purge_orphaned_trash_backups();
        return array(
            'total_scanned'          => $total_scanned,
            'cleared_stale'          => $cleared_count,
            'orphaned_trash_deleted' => $trash_cleanup['deleted_files'],
        );
    }

    /**
     * One-time / on-demand cleanup routine:
     * Scans wp-content/uploads/imgsentry/backups/{year}/{month}/ for backup files whose
     * attachment_id does NOT have _imgsentry_optimized = '1' (legacy orphaned backups created
     * by the old Trash flow, not by Optimization).
     *
     * Deletes those orphaned backup files and clears their corresponding
     * _imgsentry_backup_original_path, _imgsentry_backup_path, and _imgsentry_original_mime_type postmeta.
     * Prunes empty year/month subdirectories, and logs details and summary to the plugin's Logs page.
     *
     * @return array Summary of scanned, deleted files, and cleared postmeta.
     */
    public static function purge_orphaned_trash_backups( $silent = false ) {
        global $wpdb;
        $backups_base = ( class_exists( 'ImgSentry_Storage_Paths' ) ? ImgSentry_Storage_Paths::get_backups_dir() : self::get_backup_base_dir() );
        $scanned_count = 0;
        $deleted_files = 0;
        $meta_cleaned = 0;
        // 1. Filesystem scan: recursively inspect all files in wp-content/uploads/imgsentry/backups/
        if ( is_dir( $backups_base ) ) {
            try {
                $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($backups_base, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
                foreach ( $iterator as $file_info ) {
                    if ( $file_info->isFile() ) {
                        $filename = $file_info->getFilename();
                        // Skip security stub files
                        if ( 'index.php' === $filename || '.htaccess' === $filename ) {
                            continue;
                        }
                        $scanned_count++;
                        $file_path = wp_normalize_path( $file_info->getPathname() );
                        // Extract attachment ID from filename pattern: {stem}-{id}.{ext}
                        $attachment_id = 0;
                        if ( preg_match( '/-(\\d+)\\.[a-zA-Z0-9]+$/', $filename, $matches ) ) {
                            $attachment_id = intval( $matches[1] );
                        }
                        $is_orphaned = false;
                        if ( $attachment_id > 0 ) {
                            $opt_meta = get_post_meta( $attachment_id, '_imgsentry_optimized', true );
                            $status = get_post_meta( $attachment_id, '_imgsentry_optimization_status', true );
                            if ( '1' !== $opt_meta && 'optimized' !== $status ) {
                                $is_orphaned = true;
                            }
                        } else {
                            // Unmatched backup file without valid attachment ID
                            $is_orphaned = true;
                        }
                        if ( $is_orphaned ) {
                            wp_delete_file( $file_path );
                            if ( !file_exists( $file_path ) ) {
                                $deleted_files++;
                                if ( $attachment_id > 0 ) {
                                    delete_post_meta( $attachment_id, '_imgsentry_backup_original_path' );
                                    delete_post_meta( $attachment_id, '_imgsentry_backup_path' );
                                    delete_post_meta( $attachment_id, '_imgsentry_original_mime_type' );
                                    $meta_cleaned++;
                                }
                            }
                        }
                    } elseif ( $file_info->isDir() ) {
                        // Clean up empty year/month subdirectories
                        $dir_path = $file_info->getPathname();
                        // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- The filesystem call may fail on some hosts; the result is checked.
                        $entries = @scandir( $dir_path );
                        if ( is_array( $entries ) && count( array_diff( $entries, array('.', '..') ) ) === 0 ) {
                            // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- The filesystem call may fail on some hosts; the result is checked.
                            @rmdir( $dir_path );
                        }
                    }
                }
            } catch ( Exception $e ) {
                if ( class_exists( 'ImgSentry_Logger' ) ) {
                    ImgSentry_Logger::error( 'Error during orphaned trash backups directory traversal: ' . $e->getMessage() );
                }
            }
        }
        // 2. Database scan: clean any dangling postmeta where _imgsentry_backup_original_path exists but _imgsentry_optimized != '1'
        $dangling_meta = $wpdb->get_results( "SELECT p.post_id \n\t\t\t FROM {$wpdb->postmeta} p \n\t\t\t LEFT JOIN {$wpdb->postmeta} opt ON p.post_id = opt.post_id AND opt.meta_key = '_imgsentry_optimized' \n\t\t\t WHERE p.meta_key = '_imgsentry_backup_original_path' \n\t\t\t   AND (opt.meta_value IS NULL OR opt.meta_value != '1')" );
        if ( !empty( $dangling_meta ) ) {
            foreach ( $dangling_meta as $row ) {
                $att_id = intval( $row->post_id );
                delete_post_meta( $att_id, '_imgsentry_backup_original_path' );
                delete_post_meta( $att_id, '_imgsentry_backup_path' );
                delete_post_meta( $att_id, '_imgsentry_original_mime_type' );
                $meta_cleaned++;
            }
        }
        if ( class_exists( 'ImgSentry_Optimization_Stats' ) ) {
            ImgSentry_Optimization_Stats::invalidate_cache();
        }
        // 3. Log results to the plugin's Logs page (only if not silent OR if we actually cleaned/deleted items)
        if ( (!$silent || $deleted_files > 0 || $meta_cleaned > 0) && class_exists( 'ImgSentry_Logger' ) ) {
            ImgSentry_Logger::info( 'Orphaned trash backups cleanup completed', array(
                'type'    => 'Maintenance',
                'source'  => 'Optimizer Engine',
                'details' => sprintf(
                    'Scanned %d backup file(s) in backups/. Removed %d orphaned trash-created backup file(s) and cleared metadata for %d record(s).',
                    $scanned_count,
                    $deleted_files,
                    $meta_cleaned
                ),
            ) );
        }
        return array(
            'scanned_files' => $scanned_count,
            'deleted_files' => $deleted_files,
            'meta_cleaned'  => $meta_cleaned,
        );
    }

}
