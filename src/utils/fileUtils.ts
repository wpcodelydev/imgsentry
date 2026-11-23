import { MediaItem } from '../types';

export const formatSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const resolveNextGenFormats = (item: any): {
  webp?: boolean;
  avif?: boolean;
  siblingSizeBytes?: number;
  siblingSizeKB?: number;
  siblingFormat?: string;
} | undefined => {
  if (!item) return undefined;

  const rawNextGen = item.next_gen_formats || item.nextGenFormats;
  const rawOutput = (item.output_format || item.outputFormat || '').toLowerCase();
  const existing = item.nextGenFormats || {};

  let hasWebp = Boolean(existing.webp);
  let hasAvif = Boolean(existing.avif);
  let siblingSizeBytes: number | undefined = existing.siblingSizeBytes;
  let siblingFormat: string | undefined = existing.siblingFormat;

  if (rawNextGen && typeof rawNextGen === 'object') {
    if (rawNextGen.webp?.exists === true || rawNextGen.webp === true) {
      hasWebp = true;
      if (rawNextGen.webp?.size_bytes && (rawOutput === 'webp' || !siblingSizeBytes)) {
        siblingSizeBytes = Number(rawNextGen.webp.size_bytes);
        siblingFormat = 'webp';
      }
    }
    if (rawNextGen.avif?.exists === true || rawNextGen.avif === true) {
      hasAvif = true;
      if (rawNextGen.avif?.size_bytes && (rawOutput === 'avif' || !siblingSizeBytes || siblingFormat !== 'avif')) {
        siblingSizeBytes = Number(rawNextGen.avif.size_bytes);
        siblingFormat = 'avif';
      }
    }
  }

  if (rawOutput === 'webp') hasWebp = true;
  if (rawOutput === 'avif') hasAvif = true;

  if (!hasWebp && !hasAvif && !siblingSizeBytes) {
    return undefined;
  }

  const siblingSizeKB = siblingSizeBytes ? Math.round(siblingSizeBytes / 1024) : existing.siblingSizeKB;

  return {
    ...existing,
    ...(hasWebp ? { webp: true } : {}),
    ...(hasAvif ? { avif: true } : {}),
    ...(siblingSizeBytes ? { siblingSizeBytes, siblingSizeKB, siblingFormat: siblingFormat || rawOutput } : {})
  };
};

export const mapPhpItemToMediaItem = (item: any): MediaItem => {
  const isFileMissing = Boolean(item.file_missing || item.fileMissing || item.file_exists === false);
  const rawSize = isFileMissing ? 0 : (item.file_size ?? item.fileSize ?? item.filesize ?? item.size ?? 0);
  let numSize = Number(rawSize);
  if (isNaN(numSize) || numSize < 0 || isFileMissing) {
    numSize = 0;
  }

  let formatted = item.formatted_size || item.formattedSize;
  if (isFileMissing) {
    formatted = 'Missing on disk';
  } else if (!formatted || formatted === '0 B' || formatted === '0.00 B' || formatted === 'Unknown') {
    formatted = item.size_unknown ? 'Unknown' : formatSize(numSize);
  }

  let dims = item.dimensions || (item.width && item.height ? `${item.width} x ${item.height}` : '');
  if (!dims || dims === '—') {
    dims = '—';
  }

  const thumbSizesBytes = Number(item.thumbnail_sizes_bytes || item.thumbnailSizesBytes || 0);
  const subSizesCount = Number(item.sub_sizes_count || item.subSizesCount || 0);
  const backupSizeBytes = Number(item.backup_size_bytes || item.backupSizeBytes || 0);
  const nextgenSizesBytes = Number(item.nextgen_sizes_bytes || item.nextgenSizesBytes || 0);

  return {
    id: Number(item.id || item.attachment_id),
    title: item.title || item.post_title || '',
    filename: item.filename || (item.guid ? item.guid.split('/').pop() : '') || '',
    url: item.url || item.guid || '',
    thumbUrl: item.thumb_url || item.url || item.guid || '',
    previewUrl: item.preview_url || item.thumb_url || item.url || item.guid || '',
    mimeType: item.mime_type || item.mimeType || '',
    category: item.category || 'other',
    extension: item.extension || '',
    display_extension: item.display_extension || item.effective_format || item.displayExtension || item.effectiveFormat || item.extension || '',
    effective_format: item.effective_format || item.display_extension || item.effectiveFormat || item.displayExtension || item.extension || '',
    displayExtension: item.display_extension || item.effective_format || item.displayExtension || item.effectiveFormat || item.extension || '',
    effectiveFormat: item.effective_format || item.display_extension || item.effectiveFormat || item.displayExtension || item.extension || '',
    fileSize: numSize,
    formattedSize: formatted,
    fileMissing: isFileMissing,
    file_missing: isFileMissing,
    thumbnailSizesBytes: thumbSizesBytes,
    thumbnail_sizes_bytes: thumbSizesBytes,
    subSizesCount: subSizesCount,
    backupSizeBytes: backupSizeBytes,
    backup_size_bytes: backupSizeBytes,
    nextgenSizesBytes: nextgenSizesBytes,
    nextgen_sizes_bytes: nextgenSizesBytes,
    dimensions: dims,
    uploadDate: item.upload_date || '',
    parentId: item.parent_id || item.parentId,
    parentTitle: item.parent_title || item.parentTitle,
    isAttached: Boolean(item.is_attached || item.isAttached),
    inUse: typeof item.in_use !== 'undefined' ? Boolean(item.in_use) : (item.status === 'used' || (Array.isArray(item.usage_sources) && item.usage_sources.length > 0)),
    useReasons: item.use_reasons || item.usage_sources || [],
    location: item.location || item.url || '',
    originalPath: item.original_path || item.originalPath || '',
    original_path: item.original_path || item.originalPath || '',
    lastScanTime: item.last_scan_time || item.last_scanned_at || item.lastScanTime || null,
    lastScanType: item.last_scan_type || item.lastScanType || null,
    isTrashed: typeof item.is_trashed !== 'undefined' ? Boolean(item.is_trashed) : (typeof item.isTrashed !== 'undefined' ? Boolean(item.isTrashed) : !!item.trashed_date),
    trashedDate: item.trashed_date,
    daysInTrash: item.days_in_trash || 0,
    optimizationStatus: item.optimization_status || (item.is_optimized ? 'optimized' : undefined),
    externallyOptimized: Boolean(item.externally_optimized),
    optimizedSizeKB: (item.is_optimized || item.optimization_status === 'optimized') && (item.optimized_size || item.effective_size) ? Math.round(Number(item.effective_size || item.optimized_size) / 1024) : undefined,
    effective_size: (item.effective_size !== undefined && item.effective_size !== null) ? Number(item.effective_size) : ((item.optimized_size !== undefined && item.optimized_size !== null) ? Number(item.optimized_size) : undefined),
    effectiveSize: (item.effective_size !== undefined && item.effective_size !== null) ? Number(item.effective_size) : ((item.optimized_size !== undefined && item.optimized_size !== null) ? Number(item.optimized_size) : undefined),
    deliveredSizeBytes: (item.is_optimized || item.optimization_status === 'optimized') && Number(item.delivered_size) > 0 ? Number(item.delivered_size) : undefined,
    deliveredPercent: (item.savings_unknown || item.savingsUnknown) ? undefined : (typeof item.delivered_percent_saved === 'number' ? item.delivered_percent_saved : undefined),
    deliveredFormat: item.delivered_format ? String(item.delivered_format) : undefined,
    originalSizeKB: item.original_size_kb || (item.bytes_saved && (item.effective_size || item.optimized_size || numSize) ? Math.round((Number(item.effective_size || item.optimized_size || numSize) + Number(item.bytes_saved)) / 1024) : (item.originalSizeKB || undefined)),
    bytesSaved: (item.savings_unknown || item.savingsUnknown) ? undefined : (item.bytes_saved !== undefined && item.bytes_saved !== null ? Number(item.bytes_saved) : (item.bytesSaved !== undefined && item.bytesSaved !== null ? Number(item.bytesSaved) : undefined)),
    bytes_saved: (item.savings_unknown || item.savingsUnknown) ? undefined : (item.bytes_saved !== undefined && item.bytes_saved !== null ? Number(item.bytes_saved) : (item.bytesSaved !== undefined && item.bytesSaved !== null ? Number(item.bytesSaved) : undefined)),
    percentSaved: (item.savings_unknown || item.savingsUnknown) ? undefined : (typeof item.percent_saved === 'number' ? item.percent_saved : (typeof item.percentSaved === 'number' ? item.percentSaved : undefined)),
    percent_saved: (item.savings_unknown || item.savingsUnknown) ? undefined : (typeof item.percent_saved === 'number' ? item.percent_saved : (typeof item.percentSaved === 'number' ? item.percentSaved : undefined)),
    savingsUnknown: Boolean(item.savings_unknown || item.savingsUnknown),
    savings_unknown: Boolean(item.savings_unknown || item.savingsUnknown),
    savingPercent: (item.savings_unknown || item.savingsUnknown)
      ? undefined
      : (typeof item.delivered_percent_saved === 'number' ? Math.round(item.delivered_percent_saved) : ((item.is_optimized || item.optimization_status === 'optimized') && item.bytes_saved && (Number(item.effective_size || item.optimized_size || numSize) + Number(item.bytes_saved)) > 0
        ? Math.round((Number(item.bytes_saved) / (Number(item.effective_size || item.optimized_size || numSize) + Number(item.bytes_saved))) * 100)
        : (typeof item.percent_saved === 'number' ? Math.round(item.percent_saved) : (typeof item.saving_percent === 'number' ? Math.round(item.saving_percent) : undefined)))),
    backupCreated: Boolean(item.has_backup),
    optimizedAt: item.optimized_date ? new Date(item.optimized_date).getTime() : undefined,
    outputFormat: item.output_format || item.outputFormat,
    output_format: item.output_format || item.outputFormat,
    next_gen_formats: item.next_gen_formats || item.nextGenFormats,
    nextGenFormats: resolveNextGenFormats(item),
    pending: Boolean(item.pending),
  };
};

export function getRealFilePath(item: MediaItem): string {
  if (item.originalPath || item.original_path) {
    return item.originalPath || item.original_path || '';
  }

  const loc = (item.location || 'Uploads').toLowerCase();
  
  if (loc.includes('theme')) {
    // Determine theme folder name from filename/title
    const name = (item.filename || '').toLowerCase();
    let themeFolder = 'custom-theme';
    
    if (name.includes('twentytwentyfour')) themeFolder = 'twentytwentyfour';
    else if (name.includes('astra')) themeFolder = 'astra';
    else if (name.includes('divi')) themeFolder = 'divi';
    else if (name.includes('oceanwp')) themeFolder = 'oceanwp';
    else if (name.includes('kadence')) themeFolder = 'kadence';
    else if (name.includes('generatepress')) themeFolder = 'generatepress';
    else if (name.includes('flatsome')) themeFolder = 'flatsome';
    else if (name.includes('neve')) themeFolder = 'neve';
    else if (name.includes('blocksy')) themeFolder = 'blocksy';
    else if (name.includes('sydney')) themeFolder = 'sydney';
    
    return `/wp-content/themes/${themeFolder}/images/${item.filename}`;
  } 
  
  if (loc.includes('plugin')) {
    // Determine plugin folder name from filename/title
    const name = (item.filename || '').toLowerCase();
    let pluginFolder = 'custom-plugin';
    
    if (name.includes('woocommerce')) pluginFolder = 'woocommerce';
    else if (name.includes('contact-form-7') || name.includes('cf7')) pluginFolder = 'contact-form-7';
    else if (name.includes('yoast-seo') || name.includes('yoast')) pluginFolder = 'wordpress-seo';
    else if (name.includes('elementor')) pluginFolder = 'elementor';
    else if (name.includes('revslider') || name.includes('slider-revolution')) pluginFolder = 'revslider';
    else if (name.includes('jetpack')) pluginFolder = 'jetpack';
    else if (name.includes('wpforms')) pluginFolder = 'wpforms';
    else if (name.includes('tablepress')) pluginFolder = 'tablepress';
    else if (name.includes('smush')) pluginFolder = 'wp-smushit';
    else if (name.includes('updraftplus')) pluginFolder = 'updraftplus';
    else if (name.includes('rankmath')) pluginFolder = 'seo-by-rank-math';
    else if (name.includes('wordfence')) pluginFolder = 'wordfence';
    
    return `/wp-content/plugins/${pluginFolder}/assets/${item.filename}`;
  }
  
  // Default fallback: display location or Unknown (no more guessing)
  return item.location || 'Unknown';
}

export interface UsageLocation {
  title: string;
  context?: string | null;
  name?: string;
  type: string;
  postId?: number | null;
  postType?: string | null;
  editUrl?: string | null;
  viewUrl?: string | null;
}

const usageLocationsCache = new Map<string, UsageLocation[]>();

export function getUsageLocations(item: MediaItem): UsageLocation[] {
  if (!item) return [];

  // Generate cache key based on immutable scan state of item
  const reasonsKey = Array.isArray(item.useReasons)
    ? item.useReasons.map(r => typeof r === 'object' ? `${r.post_id}_${r.field_type}` : String(r)).join('|')
    : '';
  const cacheKey = `${item.id}_${item.inUse ? 1 : 0}_${item.lastScanTime || ''}_${item.parentTitle || ''}_${item.parentType || ''}_${reasonsKey}`;

  const cached = usageLocationsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const locations: UsageLocation[] = [];
  const seenKeys = new Set<string>();

  if (Array.isArray(item.useReasons)) {
    for (const entry of item.useReasons) {
      if (!entry) continue;

      if (typeof entry === 'object') {
        const postId = entry.post_id !== undefined && entry.post_id !== null ? Number(entry.post_id) : null;
        const fieldType = String(entry.field_type || 'content');

        // Skip internal protection-rule markers — these are not real usage locations
        if (fieldType === 'exclusion_rule' || fieldType === 'min_age_rule') {
          continue;
        }

        const dedupKey = postId !== null && !isNaN(postId) && postId > 0
          ? `post_${postId}_${fieldType}`
          : `global_${fieldType}_${entry.post_title || entry.field_label || 'site'}`;

        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        const postType = (entry.post_type || '').toLowerCase();

        let type = 'Page';
        if (fieldType === 'woocommerce_gallery' || postType === 'product') {
          type = 'WooCommerce';
        } else if (fieldType === 'elementor' || postType.includes('elementor')) {
          type = 'Elementor';
        } else if (fieldType === 'theme_customizer' || fieldType === 'site_option' || postType === 'theme') {
          type = 'Theme';
        } else if (fieldType.includes('widget') || postType === 'widget') {
          type = 'Widget';
        } else if (fieldType === 'exclusion_rule' || fieldType === 'min_age_rule') {
          type = 'Settings';
        } else if (postType === 'post' || fieldType === 'featured_image') {
          type = 'Post';
        } else if (postType === 'page') {
          type = 'Page';
        } else if (postType) {
          type = postType.charAt(0).toUpperCase() + postType.slice(1);
        }

        const title = entry.post_title || entry.field_label || 'Untitled';
        const context = entry.field_label || null;

        locations.push({
          title,
          context,
          name: title,
          type,
          postId: postId || null,
          postType: entry.post_type || null,
          editUrl: entry.edit_url || null,
          viewUrl: entry.url || null
        });
      }
    }
  }

  // Ensure parentTitle is included if available and no locations found from useReasons
  if (locations.length === 0 && item.parentTitle) {
    const cleanP = item.parentTitle.trim();
    const lowerP = cleanP.toLowerCase();
    if (cleanP && !lowerP.includes('attached to') && !lowerP.includes('unattached')) {
      locations.unshift({
        title: cleanP,
        context: 'Attached Media Parent',
        name: cleanP,
        type: item.parentType || 'Page',
        postId: item.parentId || null,
        editUrl: item.parentId ? `/wp-admin/post.php?post=${item.parentId}&action=edit` : null,
        viewUrl: null
      });
    }
  }

  usageLocationsCache.set(cacheKey, locations);
  return locations;
}
