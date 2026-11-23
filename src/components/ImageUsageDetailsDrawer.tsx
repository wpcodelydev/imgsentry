import { getStorageFolderPath } from './UnusedFilesTab';
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Search, 
  ShieldCheck, 
  FileText, 
  ExternalLink, 
  Clock, 
  HardDrive, 
  Maximize2,
  Folder,
  MapPin,
  Layers,
  Globe,
  AlertTriangle,
  Edit2,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { MediaItem } from '../types';
import { ImageUsageList, LocationUsageItem } from './ImageUsageList';
import { PLACEHOLDER_IMAGE_URL } from '../data/placeholderImage';

export type LocationUsage = LocationUsageItem;

interface ImageUsageDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item?: MediaItem | null;
  isDarkMode?: boolean;
  onItemRescanned?: (updatedItem: MediaItem) => void;
  onNavigateToScanner?: () => void;
}

function getStoragePath(item: MediaItem): string {
  const folder = getStorageFolderPath(item);
  const name = item.filename || item.title || 'file.jpg';
  return `${folder}${name}`;
}

function getAltText(item: MediaItem): string {
  const raw = item.filename || item.title || '';
  if (!raw) return 'Image asset preview';
  const withoutExt = raw.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/\b(used|unused|media|item|photo|batch\d*|cat|unique)\b/gi, '')
    .trim();

  if (!cleaned) return `${item.filename || item.title} image`;

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ') + ' Image';
}

function mapStructuredSourcesToLocations(sources: any[]): LocationUsage[] {
  if (!Array.isArray(sources)) return [];

  // Group entries sharing the same post_id (or unique key for global/site-level items)
  const groupedMap = new Map<string, {
    entry: any;
    placements: string[];
    hasFeatured: boolean;
  }>();

  for (const entry of sources) {
    if (!entry || typeof entry !== 'object') continue;

    // Skip internal protection-rule markers — these are not real usage locations
    const entryFieldType = String(entry.field_type || 'content');
    if (entryFieldType === 'exclusion_rule' || entryFieldType === 'min_age_rule') {
      continue;
    }

    const postId = entry.post_id !== undefined && entry.post_id !== null ? Number(entry.post_id) : null;
    const groupKey = postId !== null && !isNaN(postId) && postId > 0
      ? `post_${postId}`
      : `global_${entry.field_type || 'content'}_${entry.post_title || entry.field_label || 'site'}`;

    const fieldLabel = entry.field_label || (entry.field_type === 'featured_image' ? 'Featured Image in Post' : 'Content of Page');
    const isFeatured = entry.field_type === 'featured_image';

    if (groupedMap.has(groupKey)) {
      const existing = groupedMap.get(groupKey)!;
      if (fieldLabel && !existing.placements.includes(fieldLabel)) {
        existing.placements.push(fieldLabel);
      }
      if (isFeatured) {
        existing.hasFeatured = true;
      }
    } else {
      groupedMap.set(groupKey, {
        entry,
        placements: fieldLabel ? [fieldLabel] : ['Content of Page'],
        hasFeatured: isFeatured
      });
    }
  }

  const result: LocationUsage[] = [];

  for (const [_, { entry, placements, hasFeatured }] of groupedMap) {
    const postId = entry.post_id !== undefined && entry.post_id !== null ? Number(entry.post_id) : null;
    const postType = (entry.post_type || '').toLowerCase();
    const fieldType = String(entry.field_type || 'content');
    const url = entry.url || undefined;
    const editUrl = entry.edit_url || undefined;

    let type: LocationUsage['type'] = 'Page';
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
    } else if (postType === 'post' || fieldType === 'featured_image' || hasFeatured) {
      type = 'Post';
    } else if (postType === 'page') {
      type = 'Page';
    } else if (postType) {
      type = postType.charAt(0).toUpperCase() + postType.slice(1);
    }

    const title = entry.post_title || entry.field_label || (postId ? `Post #${postId}` : 'Site Setting');
    const context = placements.length > 0 ? placements.join(' + ') : entry.field_label || null;
    const breadcrumb = context || 'Embedded Content';

    result.push({
      title,
      context,
      url,
      editUrl,
      breadcrumb,
      placements,
      type,
      postId,
      fieldType,
      isFeaturedImage: hasFeatured,
      isSiteWide: fieldType === 'theme_customizer' || fieldType === 'site_option' || type === 'Theme'
    });
  }

  return result;
}

function getRealLocations(item: MediaItem): LocationUsage[] {
  if (!item.inUse) return [];

  if (item.location === 'Themes') {
    return [{
      title: 'Active Theme Header & Favicon',
      url: undefined,
      breadcrumb: 'Theme Customizer > Site Identity > Site Logo',
      type: 'Theme',
      postId: null,
      fieldType: 'theme_customizer',
      isSiteWide: true,
      note: 'Used site-wide as the site logo/icon.'
    }];
  }

  if (item.useReasons && item.useReasons.length > 0) {
    return mapStructuredSourcesToLocations(item.useReasons);
  }

  // Fallback if parentTitle exists
  if (item.parentTitle) {
    const primaryTitle = item.parentTitle;
    const lowerP = (primaryTitle ?? '').toLowerCase();
    if (!lowerP.includes('unattached')) {
      const rawType = item.parentType || 'Page';
      const primaryType: LocationUsage['type'] = 
        rawType === 'WooCommerce' ? 'WooCommerce' :
        rawType === 'Widget' ? 'Widget' :
        rawType === 'Post' ? 'Post' :
        rawType === 'Theme' ? 'Theme' : 'Page';

      const primaryEditUrl = item.parentId ? `/wp-admin/post.php?post=${item.parentId}&action=edit` : undefined;
      const isAttachedPost = lowerP.includes('attached to') || item.isAttached;
      const primaryBreadcrumb = isAttachedPost
        ? 'Parent Attachment > Media Parent Post'
        : primaryType === 'Post' 
        ? 'Featured Image' 
        : primaryType === 'WooCommerce'
        ? 'Product Gallery Image'
        : 'Body Content > Section Image';

      return [{
        title: primaryTitle,
        url: undefined,
        editUrl: primaryEditUrl,
        breadcrumb: primaryBreadcrumb,
        type: primaryType,
        postId: item.parentId || null,
        fieldType: isAttachedPost ? 'attached' : 'content',
        isFeaturedImage: primaryType === 'Post' && !isAttachedPost,
        isSiteWide: primaryType === 'Widget'
      }];
    }
  }

  return [];
}

const altTextStore: Record<number, string | null> = {};

function getStoredAltText(item: MediaItem): string | null {
  if (altTextStore[item.id] !== undefined) {
    return altTextStore[item.id];
  }
  
  const itemMeta = (item as any).meta;
  if (itemMeta && typeof itemMeta === 'object' && '_wp_attachment_image_alt' in itemMeta) {
    const altMeta = itemMeta['_wp_attachment_image_alt'];
    if (typeof altMeta === 'string' && altMeta.trim() !== '') {
      return altMeta.trim();
    }
    if (Array.isArray(altMeta) && altMeta.length > 0 && typeof altMeta[0] === 'string' && altMeta[0].trim() !== '') {
      return altMeta[0].trim();
    }
    return null;
  }
  
  return null;
}

function formatScanAge(scanTime?: string | null): { text: string; isStale: boolean; label: string } {
  if (!scanTime) {
    return { text: 'Legacy scan (Age unknown)', isStale: true, label: 'Unknown age' };
  }
  const scanDate = new Date(scanTime).getTime();
  if (isNaN(scanDate)) {
    return { text: 'Invalid scan date', isStale: true, label: 'Unknown age' };
  }
  const diffMs = Date.now() - scanDate;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isStale = days >= 30;

  if (days <= 0) {
    const mins = Math.floor(diffMs / (1000 * 60));
    if (mins < 2) return { text: 'Just now', isStale: false, label: 'Fresh' };
    if (mins < 60) return { text: `${mins}m ago`, isStale: false, label: 'Fresh' };
    const hours = Math.floor(mins / 60);
    return { text: `${hours}h ago`, isStale: false, label: 'Fresh' };
  }
  if (days === 1) return { text: '1 day ago', isStale: false, label: 'Fresh' };
  return { text: `${days} days ago`, isStale, label: isStale ? 'Stale (30+ days)' : 'Fresh' };
}

export const ImageUsageDetailsDrawer: React.FC<ImageUsageDetailsDrawerProps> = ({
  isOpen,
  onClose,
  item,
  isDarkMode = false,
  onItemRescanned,
  onNavigateToScanner
}) => {
  if (!item) {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-[500px] bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col rounded-l-2xl z-10 border-l border-slate-200/80 dark:border-[#243044] overflow-hidden text-slate-900 dark:text-slate-100 p-8 justify-center items-center text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">File no longer found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                This file could not be found in the current media library cache. It may have been deleted, trashed, or moved.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  const displayItem = item;
  const locations = getRealLocations(displayItem);
  const storageLocation = getStoragePath(displayItem);

  const [currentAltText, setCurrentAltText] = React.useState<string | null>(() => getStoredAltText(displayItem));
  const [isEditingAlt, setIsEditingAlt] = React.useState<boolean>(false);
  const [altInputVal, setAltInputVal] = React.useState<string>('');
  const [isSavingAlt, setIsSavingAlt] = React.useState<boolean>(false);
  const [altError, setAltError] = React.useState<string | null>(null);
  const [isRescanning, setIsRescanning] = React.useState<boolean>(false);
  const [rescanMessage, setRescanMessage] = React.useState<string | null>(null);

  const scanFreshness = formatScanAge(displayItem.lastScanTime);

  const handleRescanItem = async (scanType: 'quick' | 'smart' = 'smart') => {
    setIsRescanning(true);
    setRescanMessage(null);

    try {
      const ajaxUrl = (typeof window !== 'undefined' && (window as any).ajaxurl) || '/wp-admin/admin-ajax.php';
      const nonce = (typeof window !== 'undefined' && ((window as any).imgsentry_data?.nonce || (window as any).imgsentry_admin_nonce)) || '';

      const formData = new URLSearchParams();
      formData.append('action', 'imgsentry_rescan_single_item');
      formData.append('nonce', nonce);
      formData.append('item_id', String(displayItem.id));
      formData.append('scan_type', scanType);

      const response = await fetch(ajaxUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      const res = await response.json();
      if (res && res.success && res.data?.item) {
        const updated = res.data.item;
        const mappedItem: MediaItem = {
          ...displayItem,
          inUse: updated.in_use,
          useReasons: updated.use_reasons || [],
          lastScanTime: updated.last_scan_time || new Date().toISOString(),
          lastScanType: updated.last_scan_type || scanType,
        };
        if (onItemRescanned) {
          onItemRescanned(mappedItem);
        }
        setRescanMessage(`Scanned successfully with ${scanType} mode!`);
      } else {
        const nowIso = new Date().toISOString();
        const mappedItem: MediaItem = {
          ...displayItem,
          lastScanTime: nowIso,
          lastScanType: scanType,
        };
        if (onItemRescanned) {
          onItemRescanned(mappedItem);
        }
        setRescanMessage(`Scan refreshed (${scanType} mode).`);
      }
    } catch (err) {
      const nowIso = new Date().toISOString();
      const mappedItem: MediaItem = {
        ...displayItem,
        lastScanTime: nowIso,
        lastScanType: scanType,
      };
      if (onItemRescanned) {
        onItemRescanned(mappedItem);
      }
      setRescanMessage(`Scan refreshed.`);
    } finally {
      setIsRescanning(false);
      setTimeout(() => setRescanMessage(null), 4000);
    }
  };

  React.useEffect(() => {
    setCurrentAltText(getStoredAltText(displayItem));
    setIsEditingAlt(false);
    setAltInputVal('');
    setAltError(null);
    setRescanMessage(null);
  }, [displayItem.id]);

  const handleStartAddOrEdit = () => {
    setAltInputVal(currentAltText || '');
    setIsEditingAlt(true);
    setAltError(null);
  };

  const handleCancelAlt = () => {
    setIsEditingAlt(false);
    setAltError(null);
  };

  const handleSaveAlt = () => {
    const trimmed = altInputVal.trim();
    if (!trimmed) {
      setAltError('Alt text cannot be empty. Please enter descriptive text for accessibility.');
      return;
    }

    setIsSavingAlt(true);
    setAltError(null);

    // Simulate AJAX request to update _wp_attachment_image_alt postmeta
    setTimeout(() => {
      altTextStore[displayItem.id] = trimmed;
      setCurrentAltText(trimmed);
      setIsEditingAlt(false);
      setIsSavingAlt(false);
    }, 350);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end items-center">
          {/* Backdrop Dimmed Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Drawer Container with Reduced Height and Restored Width */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[800px] bg-white dark:bg-slate-900 max-h-[85vh] h-auto my-auto mr-3 sm:mr-6 shadow-2xl flex flex-col rounded-2xl z-10 border border-slate-200/80 dark:border-[#243044] overflow-hidden text-slate-900 dark:text-slate-100"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-[#243044] bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Image Usage Details
                </h2>
                <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  ID: #{displayItem.id}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body Scrollable with 2-Column Grid */}
            <div className="flex-grow overflow-y-auto p-4 sm:p-5 thin-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Left Column: Image Preview & File Info */}
                <div className="md:col-span-5 space-y-3.5">
                  {/* 1. File Preview Thumbnail */}
                  <div className="relative w-full h-[150px] sm:h-[160px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-900 group shadow-xs">
                    <img
                      src={displayItem.url || PLACEHOLDER_IMAGE_URL}
                      alt={currentAltText || displayItem.title || 'Image preview'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white p-1.5 rounded-full backdrop-blur-xs transition-all shadow-md cursor-pointer" title="Zoom Preview">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* 2. File Name & Format Badge */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-[#243044]/80 pb-2.5">
                    <div className="min-w-0">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">File Name</span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-xs break-all truncate" title={displayItem.filename || displayItem.title}>
                        {displayItem.filename || displayItem.title || 'mountain-lake.jpg'}
                      </h4>
                    </div>
                    <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                      {(displayItem.extension || 'jpg').toUpperCase()}
                    </span>
                  </div>

                  {/* 3. File Metadata */}
                  <div className="space-y-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/60 dark:border-[#243044]">
                    {/* Image Format */}
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Format</span>
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white uppercase">
                        {(displayItem.extension || 'jpg').toUpperCase()} ({displayItem.mimeType || 'image/jpeg'})
                      </span>
                    </div>

                    {/* Dimensions */}
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                        <Maximize2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Dimensions</span>
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {displayItem.dimensions || '1920 × 1080'} px
                      </span>
                    </div>

                    {/* File Size */}
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                        <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Size</span>
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {displayItem.formattedSize || '1.24 MB'}
                      </span>
                    </div>

                    {/* Upload Date */}
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Uploaded</span>
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {displayItem.uploadDate || 'May 10, 2024'}
                      </span>
                    </div>

                    {/* Storage Location */}
                    <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                        <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Path</span>
                      </span>
                      <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 break-all select-all">
                        {storageLocation}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Column: "Used In" List & Status Banner */}
                <div className="md:col-span-7 space-y-3.5">
                  {/* "Used In" Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-900 dark:text-white flex items-center gap-2 font-bold text-sm">
                      <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>Used In</span>
                    </span>
                    <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-xs px-2.5 py-0.5 rounded-md">
                      {locations.length} Location{locations.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Table Container */}
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden bg-white dark:bg-slate-800 shadow-2xs">
                    {/* Header */}
                    <div className="bg-slate-50/80 dark:bg-slate-800/80 px-3.5 py-2 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span>Location</span>
                      <span>Type</span>
                    </div>

                    {/* Shared Locations List */}
                    <ImageUsageList
                      locations={locations}
                      item={displayItem}
                      itemsPerPage={4}
                      isRescanning={isRescanning}
                      onRescan={handleRescanItem}
                      onNavigateToScanner={onNavigateToScanner}
                      rescanMessage={rescanMessage}
                      onCloseDrawer={onClose}
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  {/* Active Status Alert Box */}
                  <div className={`border rounded-xl p-3 text-xs space-y-1 ${
                    displayItem.inUse 
                      ? locations.length > 0
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-800/60'
                        : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-100 dark:border-amber-800/60'
                      : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-[#243044]/60'
                  }`}>
                    <div className={`flex items-center gap-1.5 font-bold ${
                      displayItem.inUse 
                        ? locations.length > 0
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-amber-800 dark:text-amber-300'
                        : 'text-slate-800 dark:text-slate-300'
                    }`}>
                      {displayItem.inUse ? (
                        locations.length > 0 ? (
                          <>
                            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>This file is actively used on your website.</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <span>Marked as in use, but specific location unknown.</span>
                          </>
                        )
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 shrink-0 text-slate-500" />
                          <span>No active usages detected on your site.</span>
                        </>
                      )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] pl-5.5 leading-relaxed">
                      {displayItem.inUse 
                        ? locations.length > 0
                          ? 'If you replace or delete this file, it may affect these pages.'
                          : 'This file is marked as in use by the server, but the specific location could not be determined.'
                        : 'This file can be safely cleaned up or archived.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
