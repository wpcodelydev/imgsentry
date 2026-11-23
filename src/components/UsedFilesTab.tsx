import { getStorageFolderPath } from './UnusedFilesTab';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MediaItem } from '../types';
import { useScanStatus } from '../utils/scanStatus';
import { MediaGridCard } from './MediaGridCard';
import { MediaPreview80 } from './MediaPreview80';
import { ImageUsageDetailsDrawer } from './ImageUsageDetailsDrawer';
import { getRealFilePath, getUsageLocations, mapPhpItemToMediaItem } from '../utils/fileUtils';
import { UnifiedLocationCell } from './UnifiedLocationCell';
import { 
  FileText, 
  PieChart, 
  Image as ImageIcon, 
  FileCode, 
  HelpCircle, 
  RefreshCw, 
  SlidersHorizontal, 
  List, 
  Grid, 
  Filter, 
  Search, 
  Download, 
  Eye, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Globe,
  Palette,
  ShoppingCart,
  Layout,
  File,
  Layers,
  ChevronDown,
  X,
  Music,
  AlertTriangle,
  Loader2,
  ShieldCheck
} from 'lucide-react';

interface UsedFilesTabProps {
  mediaList: MediaItem[];
  externalSearchQuery?: string;
  onRescan?: () => void;
  onNavigateToSettings: (subTab?: string) => void;
  onNavigateToScanner?: () => void;
  onItemRescanned?: (updatedItem: MediaItem) => void;
  onExportCSV: (selectedIds?: number[]) => void;
  isDarkMode?: boolean;
  initialLocationFilter?: string;
  selectedIds: number[];
  setSelectedIds: React.Dispatch<React.SetStateAction<number[]>>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  dataRevision?: number;
  isActive?: boolean;
}

export { getStorageFolderPath };

export const UsedFilesTab: React.FC<UsedFilesTabProps> = ({
  mediaList,
  externalSearchQuery = '',
  onRescan,
  onNavigateToSettings,
  onNavigateToScanner,
  onItemRescanned,
  onExportCSV,
  isDarkMode = false,
  initialLocationFilter = 'all',
  selectedIds,
  setSelectedIds,
  onRefresh,
  isRefreshing = false,
  dataRevision,
  isActive
}) => {
  const scanStatus = useScanStatus();
  const isWp = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData);
  const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;

  // Local pagination & server fetch state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(externalSearchQuery || '');
  const [breakdownIncomplete, setBreakdownIncomplete] = useState<boolean>(false);
  const [serverItems, setServerItems] = useState<MediaItem[]>([]);
  const [serverTotal, setServerTotal] = useState<number>(0);
  const [serverCategoryBreakdown, setServerCategoryBreakdown] = useState<any>(null);
  const [backendFileTypeOptions, setBackendFileTypeOptions] = useState<{ value: string; label: string; group?: string; count?: number }[] | null>(null);
  const [backendLocationOptions, setBackendLocationOptions] = useState<{ value: string; label: string; count?: number }[] | null>(null);
  const [backendDateOptions, setBackendDateOptions] = useState<{ value: string; label: string; count?: number }[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const latestFetchIdRef = useRef<number>(0);

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [isStaleBannerDismissed, setIsStaleBannerDismissed] = useState(false);

  // Reset page when search changes via debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(localSearchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearchQuery]);

  // Reset page when external search query changes (skip first render)
  const isFirstExternalSearchRef = useRef<boolean>(true);
  useEffect(() => {
    if (isFirstExternalSearchRef.current) {
      isFirstExternalSearchRef.current = false;
      return;
    }
    setCurrentPage(1);
  }, [externalSearchQuery]);

  const searchQuery = externalSearchQuery || debouncedSearch;
  const [fileTypeFilters, setFileTypeFilters] = useState<string[]>([]);
  const [locationFilters, setLocationFilters] = useState<string[]>(
    initialLocationFilter !== 'all' ? [initialLocationFilter.toLowerCase()] : []
  );
  const [sizeFilters, setSizeFilters] = useState<string[]>([]);
  const [dateFilters, setDateFilters] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerItem, setDrawerItem] = useState<MediaItem | null>(null);

  const fetchUsedFiles = useCallback(async (page: number, search: string, silent: boolean = false) => {
    if (!imgsentryData || (!imgsentryData.ajax_url && !imgsentryData.ajaxUrl)) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    const fetchId = ++latestFetchIdRef.current;
    if (!silent) {
      setIsLoading(true);
    }
    setFetchError(null);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_fetch_usage_list');
      fd.append('status', 'used');
      fd.append('page', String(page));
      fd.append('per_page', '30');
      fd.append('search', search);
      fd.append('file_types', JSON.stringify(fileTypeFilters));
      fd.append('locations', JSON.stringify(locationFilters));
      fd.append('sizes', JSON.stringify(sizeFilters));
      fd.append('dates', JSON.stringify(dateFilters));
      fd.append('nonce', imgsentryData.nonce);
      fd.append('include_breakdown', page === 1 ? '1' : '0');

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (fetchId !== latestFetchIdRef.current) return;
      if (json.success && json.data) {
        const mapped = (json.data.items || []).map((item: any) => mapPhpItemToMediaItem(item));
        setServerItems(mapped);
        setServerTotal(Number(json.data.total) || 0);
        if (json.data.category_breakdown) {
          setServerCategoryBreakdown(json.data.category_breakdown);
          setBreakdownIncomplete(!!json.data.breakdown_incomplete);
        }
        hasLoadedOnceRef.current = true;
      } else {
        throw new Error(json.data?.message || 'Failed to fetch used files list.');
      }
    } catch (e: any) {
      console.error('Error fetching used files:', e);
      if (fetchId !== latestFetchIdRef.current) return;
      setFetchError(e.message || 'Error loading used media items.');
    } finally {
      if (!silent && fetchId === latestFetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [imgsentryData, fileTypeFilters, locationFilters, sizeFilters, dateFilters]);

  useEffect(() => {
    if (!isWp) {
      hasLoadedOnceRef.current = true;
    }
  }, [isWp]);

  // Fetch distinct file types from backend
  const fetchFileTypeOptions = useCallback(() => {
    if (!isWp || !imgsentryData) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    if (!ajaxUrl) return;

    const fd = new FormData();
    fd.append('action', 'imgsentry_get_distinct_file_types');
    fd.append('status', 'used');
    fd.append('nonce', imgsentryData.nonce);

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.options)) {
          setBackendFileTypeOptions(json.data.options);
        }
      })
      .catch(err => {
        console.error('Error fetching distinct file types for used tab:', err);
      });
  }, [isWp, imgsentryData]);

  useEffect(() => {
    fetchFileTypeOptions();
  }, [fetchFileTypeOptions]);

  // Fetch distinct location options from backend
  const fetchLocationOptions = useCallback(() => {
    if (!isWp || !imgsentryData) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    if (!ajaxUrl) return;

    const fd = new FormData();
    fd.append('action', 'imgsentry_get_distinct_locations');
    fd.append('status', 'used');
    fd.append('nonce', imgsentryData.nonce);

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.options)) {
          setBackendLocationOptions(json.data.options);
        }
      })
      .catch(err => {
        console.error('Error fetching distinct locations for used tab:', err);
      });
  }, [isWp, imgsentryData]);

  useEffect(() => {
    fetchLocationOptions();
  }, [fetchLocationOptions]);

  // Fetch distinct date options from backend
  const fetchDateOptions = useCallback(() => {
    if (!isWp || !imgsentryData) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    if (!ajaxUrl) return;

    const fd = new FormData();
    fd.append('action', 'imgsentry_get_distinct_dates');
    fd.append('status', 'used');
    fd.append('nonce', imgsentryData.nonce);

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.options)) {
          setBackendDateOptions(json.data.options);
        }
      })
      .catch(err => {
        console.error('Error fetching distinct dates for used tab:', err);
      });
  }, [isWp, imgsentryData]);

  useEffect(() => {
    fetchDateOptions();
  }, [fetchDateOptions]);

  // Fetch on mount, search change, page change, or filter change
  useEffect(() => {
    if (isWp) {
      fetchUsedFiles(currentPage, searchQuery);
    }
  }, [currentPage, searchQuery, JSON.stringify([fileTypeFilters, locationFilters, sizeFilters, dateFilters]), isWp]);

  const lastSyncedRevisionRef = useRef<number>(dataRevision ?? 0);
  const prevIsActiveRef = useRef<boolean>(isActive ?? false);

  useEffect(() => {
    const justBecameActive = Boolean(isActive) && !prevIsActiveRef.current;
    if (isWp && justBecameActive && dataRevision !== undefined && dataRevision !== lastSyncedRevisionRef.current) {
      lastSyncedRevisionRef.current = dataRevision;
      fetchUsedFiles(currentPage, searchQuery, true);
      fetchFileTypeOptions();
    }
    prevIsActiveRef.current = Boolean(isActive);
  }, [isActive, dataRevision]);

  // Auto-refresh: Silently refetch while scan is running every 15s
  useEffect(() => {
    if (!scanStatus.isRunning) return;
    const interval = setInterval(() => {
      fetchUsedFiles(currentPage, searchQuery, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [scanStatus.isRunning, currentPage, searchQuery, fetchUsedFiles]);

  // Auto-refresh: When scan completes, silently refetch everything
  const prevIsRunningRef = useRef<boolean>(scanStatus.isRunning);
  useEffect(() => {
    if (prevIsRunningRef.current && !scanStatus.isRunning) {
      fetchUsedFiles(currentPage, searchQuery, true);
      fetchFileTypeOptions();
      fetchLocationOptions();
      fetchDateOptions();
    }
    prevIsRunningRef.current = scanStatus.isRunning;
  }, [scanStatus.isRunning, currentPage, searchQuery, fetchUsedFiles, fetchFileTypeOptions, fetchLocationOptions, fetchDateOptions]);

  const handleManualRefresh = () => {
    if (isWp) {
      fetchUsedFiles(currentPage, searchQuery);
      fetchFileTypeOptions();
      fetchLocationOptions();
      fetchDateOptions();
    }
    if (onRefresh) {
      onRefresh();
    }
  };

  // Filter used items for local fallback & whole-library aggregate stats
  const aggregateUsedItems = useMemo(() => mediaList.filter(item => item.inUse && !item.isTrashed), [mediaList]);

  // Items to display
  const itemsToDisplay = isWp ? serverItems : aggregateUsedItems;

  // Compute scan staleness metrics (threshold: 30 days or no scan time)
  const staleStats = useMemo(() => {
    if (itemsToDisplay.length === 0) return { count: 0, total: 0, ratio: 0 };
    const THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let staleCount = 0;
    for (const item of itemsToDisplay) {
      if (!item.lastScanTime) {
        staleCount++;
      } else {
        const scanTimestamp = new Date(item.lastScanTime).getTime();
        if (isNaN(scanTimestamp) || (now - scanTimestamp) > THRESHOLD_MS) {
          staleCount++;
        }
      }
    }
    return {
      count: staleCount,
      total: itemsToDisplay.length,
      ratio: staleCount / itemsToDisplay.length
    };
  }, [itemsToDisplay]);

  // Sync initialLocationFilter if it changes from outside
  useEffect(() => {
    if (initialLocationFilter !== 'all') {
      setLocationFilters([initialLocationFilter.toLowerCase()]);
    }
  }, [initialLocationFilter]);

  // Type Badge helper matching Media Scanner Tab
  const renderTypeBadge = (ext: string) => {
    const uppercaseExt = (ext || '').toUpperCase();
    switch (uppercaseExt) {
      case 'JPG':
      case 'JPEG':
        return <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">JPG</span>;
      case 'PNG':
        return <span className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-purple-200 dark:border-purple-800">PNG</span>;
      case 'WEBP':
      case 'AVIF':
        return <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800">{uppercaseExt}</span>;
      case 'SVG':
        return <span className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800">SVG</span>;
      case 'PDF':
        return <span className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-800">PDF</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-gray-200 dark:border-slate-700">{uppercaseExt || 'FILE'}</span>;
    }
  };

  const availableImageFolders = useMemo(() => {
    const folders = new Set<string>();
    mediaList.forEach(item => {
      folders.add(getStorageFolderPath(item));
    });
    return Array.from(folders).sort();
  }, [mediaList]);


  const availableExtensions = useMemo(() => {
    const exts = new Set<string>();
    mediaList.forEach(item => {
      if (item.extension) {
        exts.add(item.extension.toLowerCase());
      }
    });
    return Array.from(exts).sort();
  }, [mediaList]);

  const { imageExtensions, mediaExtensions, documentExtensions, otherExtensions } = useMemo(() => {
    const images = new Set<string>();
    const media = new Set<string>();
    const docs = new Set<string>();
    const others = new Set<string>();

    const imageTypes = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'avif'];
    const mediaTypes = ['mp4', 'webm', 'mp3', 'wav', 'ogg', 'mov', 'm4a', 'flac', 'aac', 'avi', 'mkv'];
    const docTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'ppt'];

    mediaList.forEach(item => {
      if (!item.extension) return;
      const ext = item.extension.toLowerCase();
      
      if (item.category === 'images' || imageTypes.includes(ext)) {
        images.add(ext);
      } else if (item.category === 'audio' || item.category === 'video' || mediaTypes.includes(ext)) {
        media.add(ext);
      } else if (item.category === 'documents' || docTypes.includes(ext)) {
        docs.add(ext);
      } else {
        others.add(ext);
      }
    });

    return {
      imageExtensions: Array.from(images).sort(),
      mediaExtensions: Array.from(media).sort(),
      documentExtensions: Array.from(docs).sort(),
      otherExtensions: Array.from(others).sort()
    };
  }, [mediaList]);

  // Helpers for matching single items against a specific filter value
  const matchFileType = (item: MediaItem, filterVal: string): boolean => {
    if (isWp) return true; // In live WP mode, file type filtering is handled server-side via SQL in build_usage_where_clause()
    const ext = (item.extension || '').toLowerCase();
    const filter = filterVal.toLowerCase();
    
    if (filter === 'pdf') {
      return ext === 'pdf';
    } else if (filter === 'excel' || filter === 'xls' || filter === 'xlsx' || filter === 'csv') {
      return ['xls', 'xlsx', 'csv'].includes(ext);
    } else if (filter === 'word' || filter === 'doc' || filter === 'docx') {
      return ['doc', 'docx'].includes(ext);
    } else if (filter === 'text' || filter === 'txt') {
      return ['txt', 'css', 'js', 'json', 'xml', 'html', 'md'].includes(ext);
    } else if (filter === 'archive' || filter === 'zip') {
      return ['zip', 'rar', 'tar', 'gz', '7z'].includes(ext);
    } else if (filter === 'media') {
      return item.category === 'audio' || item.category === 'video' || mediaExtensions.includes(ext);
    } else if (filter === 'other_files') {
      return !(item.category === 'images' || imageExtensions.includes(ext)) &&
             !(item.category === 'audio' || item.category === 'video' || mediaExtensions.includes(ext)) &&
             !(item.category === 'documents' || documentExtensions.includes(ext));
    } else if (filter === 'documents') {
      return item.category === 'documents' || documentExtensions.includes(ext);
    } else if (filter === 'jpg' || filter === 'jpeg') {
      const effectiveExt = (item.display_extension || item.effective_format || ext).toLowerCase();
      return ['jpg', 'jpeg'].includes(effectiveExt);
    } else {
      const effectiveExt = (item.display_extension || item.effective_format || ext).toLowerCase();
      return effectiveExt === filter;
    }
  };

  const matchFolder = (item: MediaItem, filterVal: string): boolean => {
    if (isWp) return true; // In live WP mode, location/folder filtering is handled server-side via SQL in build_usage_where_clause()
    const itemFolder = getStorageFolderPath(item).toLowerCase();
    const filterLower = filterVal.toLowerCase();
    if (filterLower.startsWith('/')) {
      return itemFolder === filterLower;
    } else {
      const loc = (item.location || '').toLowerCase();
      return loc === filterLower || loc.includes(filterLower) || itemFolder.includes(filterLower);
    }
  };


  const matchSize = (item: MediaItem, filterVal: string): boolean => {
    if (isWp) return true; // In live WP mode, size filtering is handled server-side via SQL in build_usage_where_clause()
    if (!item.fileSize || item.fileSize <= 0) return false;
    if (filterVal === 'small') return item.fileSize < 500 * 1024;
    if (filterVal === 'medium') return item.fileSize >= 500 * 1024 && item.fileSize <= 2 * 1024 * 1024;
    if (filterVal === 'large') return item.fileSize > 2 * 1024 * 1024;
    return true;
  };

  const matchDate = (item: MediaItem, filterVal: string): boolean => {
    if (isWp) return true; // In live WP mode, date filtering is handled server-side via SQL in build_usage_where_clause()
    const uploadDate = item.uploadDate || '';
    return uploadDate.includes(filterVal);
  };

  // Live counts calculated directly from itemsToDisplay
  const optionCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    itemsToDisplay.forEach(item => {
      const ext = (item.extension || '').toLowerCase();
      counts[ext] = (counts[ext] || 0) + 1;

      if (item.category === 'audio' || item.category === 'video' || mediaExtensions.includes(ext)) {
        counts['media'] = (counts['media'] || 0) + 1;
      }
      if (item.category === 'documents' || documentExtensions.includes(ext)) {
        counts['documents'] = (counts['documents'] || 0) + 1;
      }
      if (!(item.category === 'images' || imageExtensions.includes(ext)) &&
          !(item.category === 'audio' || item.category === 'video' || mediaExtensions.includes(ext)) &&
          !(item.category === 'documents' || documentExtensions.includes(ext))) {
        counts['other_files'] = (counts['other_files'] || 0) + 1;
      }

      const folder = getStorageFolderPath(item).toLowerCase();
      counts[folder] = (counts[folder] || 0) + 1;
      const loc = (item.location || '').toLowerCase();
      if (loc && loc !== folder) {
        counts[loc] = (counts[loc] || 0) + 1;
      }

      const usageLocs = getUsageLocations(item);
      usageLocs.forEach(u => {
        const uType = u.type.toLowerCase();
        counts[uType] = (counts[uType] || 0) + 1;
      });

      if (item.fileSize && item.fileSize > 0) {
        if (item.fileSize < 500 * 1024) {
          counts['small'] = (counts['small'] || 0) + 1;
        } else if (item.fileSize >= 500 * 1024 && item.fileSize <= 2 * 1024 * 1024) {
          counts['medium'] = (counts['medium'] || 0) + 1;
        } else {
          counts['large'] = (counts['large'] || 0) + 1;
        }
      }

      // (Removed hardcoded demo date counting)
    });

    return counts;
  }, [itemsToDisplay, imageExtensions, mediaExtensions, documentExtensions]);

  // Unindexed / unscanned filesize count
  const unscannedSizeCount = useMemo(() => {
    return itemsToDisplay.filter(item => !item.fileSize || item.fileSize <= 0).length;
  }, [itemsToDisplay]);

  // Options structures for dropdown overlays
  const fileTypeOptions = useMemo(() => {
    if (isWp && backendFileTypeOptions !== null) {
      return backendFileTypeOptions;
    }

    const opts: { value: string; label: string; group?: string; count?: number }[] = [];
    imageExtensions.forEach(ext => {
      if (availableExtensions.includes(ext)) {
        opts.push({ value: ext, label: ext.toUpperCase(), group: 'Images' });
      }
    });

    const hasMedia = mediaExtensions.some(ext => availableExtensions.includes(ext));
    if (hasMedia) {
      opts.push({ value: 'media', label: 'All Media', group: 'Media (Audio/Video)' });
      mediaExtensions.forEach(ext => {
        if (availableExtensions.includes(ext)) {
          opts.push({ value: ext, label: ext.toUpperCase(), group: 'Media (Audio/Video)' });
        }
      });
    }

    const hasDocs = documentExtensions.some(ext => availableExtensions.includes(ext));
    if (hasDocs) {
      opts.push({ value: 'documents', label: 'All Documents', group: 'Documents' });
      documentExtensions.forEach(ext => {
        if (availableExtensions.includes(ext)) {
          opts.push({ value: ext, label: ext.toUpperCase(), group: 'Documents' });
        }
      });
    }

    const hasOthers = otherExtensions.some(ext => availableExtensions.includes(ext));
    if (hasOthers) {
      opts.push({ value: 'other_files', label: 'All Other Files', group: 'Other Files' });
      otherExtensions.forEach(ext => {
        if (availableExtensions.includes(ext)) {
          opts.push({ value: ext, label: ext.toUpperCase(), group: 'Other Files' });
        }
      });
    }
    return opts;
  }, [isWp, backendFileTypeOptions, availableExtensions, imageExtensions, mediaExtensions, documentExtensions, otherExtensions]);

  const folderOptions = useMemo<Array<{ value: string; label: string; count?: number }>>(() => {
    if (isWp && backendLocationOptions !== null) {
      return backendLocationOptions;
    }

    return availableImageFolders.map(folder => ({
      value: folder.toLowerCase(),
      label: folder
    }));
  }, [isWp, backendLocationOptions, availableImageFolders]);


  const sizeOptions = [
    { value: 'small', label: '< 500 KB' },
    { value: 'medium', label: '500 KB - 2 MB' },
    { value: 'large', label: '> 2 MB' }
  ];

  const dateOptions = useMemo(() => {
    if (isWp && backendDateOptions !== null) {
      return backendDateOptions;
    }
    return [];
  }, [isWp, backendDateOptions]);

  // Multi-Select filtering logic (OR within group, AND between groups)
  const filteredItems = useMemo(() => {
    return itemsToDisplay.filter(item => {
      // 1. File Type Filters (OR within group)
      if (fileTypeFilters.length > 0) {
        const matches = fileTypeFilters.some(filterVal => matchFileType(item, filterVal));
        if (!matches) return false;
      }

      // 2. Folder Filters (OR within group)
      if (locationFilters.length > 0) {
        const matches = locationFilters.some(filterVal => matchFolder(item, filterVal));
        if (!matches) return false;
      }



      // 4. Size Filters (OR within group)
      if (sizeFilters.length > 0) {
        const matches = sizeFilters.some(filterVal => matchSize(item, filterVal));
        if (!matches) return false;
      }

      // 5. Date Filters (OR within group)
      if (dateFilters.length > 0) {
        const matches = dateFilters.some(filterVal => matchDate(item, filterVal));
        if (!matches) return false;
      }

      // 6. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.filename.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          (item.parentTitle && item.parentTitle.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [itemsToDisplay, fileTypeFilters, locationFilters, sizeFilters, dateFilters, searchQuery]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0 || !Number.isFinite(bytes) || bytes < 1) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
    return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(1)) + ' ' + sizes[safeIndex];
  };

  // Dropdown State for "Used In" popover
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      setActiveDropdownId(null);
      if (openDropdown) {
        const target = e.target as HTMLElement;
        if (!target.closest('.filter-dropdown-container')) {
          setOpenDropdown(null);
        }
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [openDropdown]);



  const handleRemoveChip = (group: string, val: string) => {
    setCurrentPage(1);
    if (group === 'type') {
      setFileTypeFilters(prev => prev.filter(v => v !== val));
    } else if (group === 'folder') {
      setLocationFilters(prev => prev.filter(v => v !== val));
    } else if (group === 'size') {
      setSizeFilters(prev => prev.filter(v => v !== val));
    } else if (group === 'date') {
      setDateFilters(prev => prev.filter(v => v !== val));
    }
  };

  const handleClearAllFilters = () => {
    setCurrentPage(1);
    setFileTypeFilters([]);
    setLocationFilters([]);
    setSizeFilters([]);
    setDateFilters([]);
    setLocalSearchQuery('');
    setDebouncedSearch('');
  };

  const isAnyFilterActive = fileTypeFilters.length > 0 || locationFilters.length > 0 || sizeFilters.length > 0 || dateFilters.length > 0;

  const activeChips = useMemo(() => {
    const chips: { group: string; value: string; label: string }[] = [];

    fileTypeFilters.forEach(val => {
      const opt = fileTypeOptions.find(o => o.value === val);
      chips.push({ group: 'type', value: val, label: `Type: ${opt ? opt.label : val.toUpperCase()}` });
    });

    locationFilters.forEach(val => {
      const opt = folderOptions.find(o => o.value === val);
      chips.push({ group: 'folder', value: val, label: `Folder: ${opt ? opt.label : val}` });
    });

    sizeFilters.forEach(val => {
      const opt = sizeOptions.find(o => o.value === val);
      chips.push({ group: 'size', value: val, label: `Size: ${opt ? opt.label : val}` });
    });

    dateFilters.forEach(val => {
      const opt = dateOptions.find(o => o.value === val);
      chips.push({ group: 'date', value: val, label: `Date: ${opt ? opt.label : val}` });
    });

    return chips;
  }, [fileTypeFilters, locationFilters, sizeFilters, dateFilters, fileTypeOptions, folderOptions]);

  const pageSize = 30;
  const totalItems = isWp ? serverTotal : filteredItems.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedItems = isWp ? serverItems : filteredItems.slice(startIndex, startIndex + pageSize);

  // Page Selection Handlers
  const isAllCurrentPageSelected = paginatedItems.length > 0 && paginatedItems.every(i => selectedIds.includes(i.id));

  const handleToggleSelectCurrentPage = () => {
    const currentPageIds = paginatedItems.map(i => i.id);
    if (isAllCurrentPageSelected) {
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };



  // Dynamic Real Metrics calculations
  const hasCategoryBreakdown = isWp && !!serverCategoryBreakdown;

  const totalUsedCount = isWp ? serverTotal : aggregateUsedItems.length;
  const totalUsedSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.total_size || 0)
    : aggregateUsedItems.reduce((acc, i) => acc + i.fileSize, 0);

  const imageItems = aggregateUsedItems.filter(i => i.category === 'images');
  const totalImagesCount = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.images?.count || 0)
    : imageItems.length;
  const totalImagesSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.images?.size || 0)
    : imageItems.reduce((acc, i) => acc + i.fileSize, 0);

  const docItems = aggregateUsedItems.filter(i => i.category === 'documents');
  const totalDocsCount = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.documents?.count || 0)
    : docItems.length;
  const totalDocsSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.documents?.size || 0)
    : docItems.reduce((acc, i) => acc + i.fileSize, 0);

  const mediaItems = aggregateUsedItems.filter(i => i.category === 'audio' || i.category === 'video');
  const totalMediaCount = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.video?.count || 0) + Number(serverCategoryBreakdown.audio?.count || 0)
    : mediaItems.length;
  const totalMediaSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.video?.size || 0) + Number(serverCategoryBreakdown.audio?.size || 0)
    : mediaItems.reduce((acc, i) => acc + i.fileSize, 0);

  const otherItems = aggregateUsedItems.filter(i => i.category !== 'images' && i.category !== 'documents' && i.category !== 'audio' && i.category !== 'video');
  const totalOthersCount = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.other?.count || 0) + Number(serverCategoryBreakdown.fonts?.count || 0)
    : otherItems.length;
  const totalOthersSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.other?.size || 0) + Number(serverCategoryBreakdown.fonts?.size || 0)
    : otherItems.reduce((acc, i) => acc + i.fileSize, 0);

  const getFormattedParts = (bytes: number) => {
    const formatted = formatBytes(bytes);
    const parts = formatted.split(' ');
    return {
      value: parts[0] || '0',
      unit: parts[1] || 'B'
    };
  };

  const usedSizeParts = getFormattedParts(totalUsedSize);
  const imagesSizeParts = getFormattedParts(totalImagesSize);
  const docsSizeParts = getFormattedParts(totalDocsSize);
  const mediaSizeParts = getFormattedParts(totalMediaSize);
  const othersSizeParts = getFormattedParts(totalOthersSize);

  const renderUsedInBadge = (item: MediaItem) => {
    const isDropdownOpen = activeDropdownId === item.id;
    const locations = getUsageLocations(item);

    if (locations.length === 0) {
      return (
        <div className="space-y-1 relative" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 border border-amber-200 dark:border-amber-900/50">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-amber-800 dark:text-amber-300 text-xs truncate">
                Usage details unavailable
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerItem(item);
                  setDrawerOpen(true);
                }}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline text-left cursor-pointer"
              >
                View details / Rescan
              </button>
            </div>
          </div>
        </div>
      );
    }

    const primaryLoc = locations[0];
    const extraCount = locations.length - 1;

    const getTypeBadge = (type: string) => {
      let colors = "bg-purple-50 text-purple-600 border-purple-100";
      if (type === 'Theme') colors = "bg-blue-50 text-blue-600 border-blue-100";
      if (type === 'WooCommerce') colors = "bg-emerald-50 text-emerald-600 border-emerald-100";
      if (type === 'Elementor') colors = "bg-rose-50 text-rose-600 border-rose-100";
      if (type === 'Page') colors = "bg-indigo-50 text-indigo-600 border-indigo-100";
      if (type === 'Post') colors = "bg-violet-50 text-violet-600 border-violet-100";
      if (type === 'Widget') colors = "bg-amber-50 text-amber-600 border-amber-100";
      if (type === 'Settings') colors = "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800";

      return (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border leading-none shrink-0 ${colors}`}>
          {type}
        </span>
      );
    };

    const getTypeIcon = (type: string) => {
      if (type === 'WooCommerce') return <ShoppingCart className="w-3.5 h-3.5" />;
      if (type === 'Elementor') return <Layers className="w-3.5 h-3.5" />;
      if (type === 'Theme') return <Palette className="w-3.5 h-3.5" />;
      if (type === 'Widget') return <SlidersHorizontal className="w-3.5 h-3.5" />;
      if (type === 'Settings') return <ShieldCheck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />;
      if (type === 'Page' || type === 'Post') return <Globe className="w-3.5 h-3.5" />;
      return <File className="w-3.5 h-3.5" />;
    };

    return (
      <div className="space-y-1.5 relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0 border border-slate-200 dark:border-slate-700">
            {getTypeIcon(primaryLoc.type)}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-slate-900 dark:text-white text-xs truncate max-w-[150px]" title={primaryLoc.title || primaryLoc.name}>
                {primaryLoc.title || primaryLoc.name}
              </span>
              {getTypeBadge(primaryLoc.type)}
            </div>
            {primaryLoc.context && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]" title={primaryLoc.context}>
                {primaryLoc.context}
              </span>
            )}
          </div>
        </div>

        {extraCount > 0 && (
          <div className="pl-9.5">
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerItem(item);
                  setDrawerOpen(true);
                }}
                className="group flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-all shadow-3xs cursor-pointer"
              >
                <span>Also used in {extraCount} place{extraCount > 1 ? 's' : ''}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 p-2 text-xs">
                  <div className="font-black text-slate-400 dark:text-slate-500 mb-2 px-2 uppercase tracking-wider text-[9px]">Additional Usage Locations</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1 thin-scrollbar">
                    {locations.slice(1).map((loc, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="text-slate-400 dark:text-slate-500">
                            {getTypeIcon(loc.type)}
                          </div>
                          <span className="font-bold text-slate-700 dark:text-slate-300 truncate">{loc.title || loc.name}</span>
                        </div>
                        {getTypeBadge(loc.type)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 text-gray-900 dark:text-slate-100">

      {/* SCAN FRESHNESS WARNING BANNER */}
      {!isWp && !isStaleBannerDismissed && staleStats.total > 0 && staleStats.ratio >= 0.20 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3.5 flex items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-950 dark:text-amber-200">
                Usage data may be outdated for some files
              </div>
              <div className="text-[11px] text-amber-800 dark:text-amber-300/80 mt-0.5">
                {staleStats.count} of {staleStats.total} used files ({Math.round(staleStats.ratio * 100)}%) haven't been scanned recently or have legacy cache — run a Smart Scan for accurate results.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToScanner && (
              <button
                onClick={onNavigateToScanner}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-3xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Run Smart Scan</span>
              </button>
            )}
            <button
              onClick={() => setIsStaleBannerDismissed(true)}
              className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
              title="Dismiss warning"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* METRICS ROW (6 Cards matching screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Total Used Files */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Total Used Files</span>
            <div className="text-xl font-black text-blue-600 dark:text-[#5B8DEF] mt-1.5 block leading-none">{(totalUsedCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-[#5B8DEF]/15 dark:text-[#5B8DEF] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              All files used on site
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-[#5B8DEF]/15 text-blue-600 dark:text-[#5B8DEF] flex items-center justify-center shrink-0 ml-2">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Images */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Images</span>
            <div className="text-xl font-black text-emerald-600 dark:text-[#4ade80] mt-1.5 block leading-none">{(totalImagesCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-[#4ade80]/15 dark:text-[#4ade80] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {totalUsedCount > 0 ? ((totalImagesCount / totalUsedCount) * 100).toFixed(1) : 0}% of used
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-[#4ade80]/15 text-emerald-600 dark:text-[#4ade80] flex items-center justify-center shrink-0 ml-2">
            <ImageIcon className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Documents */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Documents</span>
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1.5 block leading-none">{(totalDocsCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-purple-700 bg-purple-100 dark:bg-purple-950/40 dark:text-purple-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {totalUsedCount > 0 ? ((totalDocsCount / totalUsedCount) * 100).toFixed(1) : 0}% of used
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 ml-2">
            <FileCode className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Media (Video/Audio) */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Media (Video/Audio)</span>
            <div className="text-xl font-black text-orange-600 dark:text-orange-400 mt-1.5 block leading-none">{(totalMediaCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-orange-700 bg-orange-100 dark:bg-orange-950/40 dark:text-orange-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {totalUsedCount > 0 ? ((totalMediaCount / totalUsedCount) * 100).toFixed(1) : 0}% of used
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 ml-2">
            <Music className="w-6 h-6" />
          </div>
        </div>

        {/* Card 5: Other Files */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Other Files</span>
            <div className="text-xl font-black text-slate-500 dark:text-slate-400 mt-1.5 block leading-none">{(totalOthersCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-slate-700 bg-slate-100 dark:bg-[#0b1220]/40 dark:text-slate-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {totalUsedCount > 0 ? ((totalOthersCount / totalUsedCount) * 100).toFixed(1) : 0}% of used
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-[#0b1220]/60 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0 ml-2">
            <File className="w-6 h-6" />
          </div>
        </div>

        {/* Card 6: Total Size */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200/80 dark:border-slate-700 shadow-3xs flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Total Size</span>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1.5 block leading-none">{usedSizeParts.value} <span className="text-xs">{usedSizeParts.unit}</span></div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Storage used by files
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 ml-2">
            <PieChart className="w-6 h-6" />
          </div>
        </div>
      </div>

      {breakdownIncomplete && (
        <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
          Totals may be incomplete on very large libraries.
        </div>
      )}

      {/* CONTROL BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
            <button 
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 flex items-center gap-1.5 font-bold cursor-pointer ${
                viewMode === 'list' 
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-r border-purple-200' 
                  : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-[#1e293b]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 flex items-center gap-1.5 font-bold cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' 
                  : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-[#1e293b]'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Grid View</span>
            </button>
          </div>

          {/* File Type Dropdown */}
          <div className="relative filter-dropdown-container">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'fileType' ? null : 'fileType')}
              className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-all text-xs bg-white dark:bg-slate-800 cursor-pointer ${
                fileTypeFilters.length > 0 
                  ? 'border-purple-500 text-purple-700 dark:text-purple-300 dark:border-purple-400 ring-1 ring-purple-500/20' 
                  : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <span>File Type</span>
              {fileTypeFilters.length > 0 && (
                <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {fileTypeFilters.length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'fileType' ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown === 'fileType' && (
              <div className="absolute left-0 mt-1.5 w-64 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 p-2.5 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-700 px-1 mb-1.5">
                  <button 
                    onClick={() => { setCurrentPage(1); setFileTypeFilters(fileTypeOptions.map(o => o.value)); }} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => { setCurrentPage(1); setFileTypeFilters([]); }} 
                    className="text-gray-500 dark:text-slate-400 font-bold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-y-auto max-h-60 pr-1">
                  {fileTypeOptions.map((opt, idx) => {
                    const isChecked = fileTypeFilters.includes(opt.value);
                    const count = isWp
                      ? (typeof opt.count === 'number' ? opt.count : 0)
                      : (optionCounts[opt.value.toLowerCase()] || 0);
                    const showGroup = opt.group && (idx === 0 || fileTypeOptions[idx - 1].group !== opt.group);
                    return (
                      <React.Fragment key={opt.value}>
                        {showGroup && (
                          <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mt-2 mb-1 px-1.5">
                            {opt.group}
                          </div>
                        )}
                        <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer select-none text-gray-700 dark:text-slate-200 font-medium">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => {
                              setCurrentPage(1);
                              setFileTypeFilters(prev => 
                                prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                              );
                            }}
                            className="rounded border-gray-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                          />
                          <span className="flex-1 truncate">{opt.label} · {count}</span>
                        </label>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Folder Dropdown */}
          <div className="relative filter-dropdown-container">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'folder' ? null : 'folder')}
              className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-all text-xs bg-white dark:bg-slate-800 cursor-pointer ${
                locationFilters.length > 0 
                  ? 'border-purple-500 text-purple-700 dark:text-purple-300 dark:border-purple-400 ring-1 ring-purple-500/20' 
                  : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <span>Image Folder</span>
              {locationFilters.length > 0 && (
                <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {locationFilters.length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'folder' ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown === 'folder' && (
              <div className="absolute left-0 mt-1.5 w-64 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 p-2.5 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-700 px-1 mb-1.5">
                  <button 
                    onClick={() => { setCurrentPage(1); setLocationFilters(folderOptions.map(o => o.value)); }} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => { setCurrentPage(1); setLocationFilters([]); }} 
                    className="text-gray-500 dark:text-slate-400 font-bold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-y-auto max-h-60 pr-1">
                  {isWp && backendLocationOptions === null ? (
                    <div className="p-3 text-center text-gray-500 dark:text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                      <span>Loading locations...</span>
                    </div>
                  ) : folderOptions.length === 0 ? (
                    <div className="p-3 text-center text-gray-500 dark:text-slate-400">
                      No locations found
                    </div>
                  ) : (
                    folderOptions.map(opt => {
                      const isChecked = locationFilters.includes(opt.value);
                      const count = isWp
                        ? (typeof opt.count === 'number' ? opt.count : 0)
                        : (optionCounts[opt.value.toLowerCase()] || 0);
                      return (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer select-none text-gray-700 dark:text-slate-200 font-medium">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => {
                              setCurrentPage(1);
                              setLocationFilters(prev => 
                                prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                              );
                            }}
                            className="rounded border-gray-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                          />
                          <span className="flex-1 truncate">{opt.label} · {count}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Size Dropdown */}
          <div className="relative filter-dropdown-container">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'size' ? null : 'size')}
              className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-all text-xs bg-white dark:bg-slate-800 cursor-pointer ${
                sizeFilters.length > 0 
                  ? 'border-purple-500 text-purple-700 dark:text-purple-300 dark:border-purple-400 ring-1 ring-purple-500/20' 
                  : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <span>Size</span>
              {sizeFilters.length > 0 && (
                <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {sizeFilters.length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'size' ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown === 'size' && (
              <div className="absolute left-0 mt-1.5 w-64 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 p-2.5 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-700 px-1 mb-1.5">
                  <button 
                    onClick={() => { setCurrentPage(1); setSizeFilters(sizeOptions.map(o => o.value)); }} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => { setCurrentPage(1); setSizeFilters([]); }} 
                    className="text-gray-500 dark:text-slate-400 font-bold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-y-auto max-h-60 pr-1">
                  {sizeOptions.map(opt => {
                    const isChecked = sizeFilters.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer select-none text-gray-700 dark:text-slate-200 font-medium">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            setCurrentPage(1);
                            setSizeFilters(prev => 
                              prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                            );
                          }}
                          className="rounded border-gray-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                        />
                        <span className="flex-1 truncate">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                {!isWp && unscannedSizeCount > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 px-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5 leading-tight">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      {unscannedSizeCount} {unscannedSizeCount === 1 ? 'file is' : 'files are'} not scanned yet and excluded from size filtering. Run a scan to include.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date Dropdown */}
          <div className="relative filter-dropdown-container">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'date' ? null : 'date')}
              className={`px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-all text-xs bg-white dark:bg-slate-800 cursor-pointer ${
                dateFilters.length > 0 
                  ? 'border-purple-500 text-purple-700 dark:text-purple-300 dark:border-purple-400 ring-1 ring-purple-500/20' 
                  : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <span>Date</span>
              {dateFilters.length > 0 && (
                <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {dateFilters.length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'date' ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown === 'date' && (
              <div className="absolute left-0 mt-1.5 w-64 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 p-2.5 flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-700 px-1 mb-1.5">
                  <button 
                    onClick={() => { setCurrentPage(1); setDateFilters(dateOptions.map(o => o.value)); }} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => { setCurrentPage(1); setDateFilters([]); }} 
                    className="text-gray-500 dark:text-slate-400 font-bold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-y-auto max-h-60 pr-1">
                  {isWp && backendDateOptions === null ? (
                    <div className="p-3 text-center text-gray-500 dark:text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                      <span>Loading dates...</span>
                    </div>
                  ) : dateOptions.length === 0 ? (
                    <div className="p-3 text-center text-gray-500 dark:text-slate-400">
                      No dates found
                    </div>
                  ) : (
                    dateOptions.map(opt => {
                      const isChecked = dateFilters.includes(opt.value);
                      const count = isWp
                        ? (typeof opt.count === 'number' ? opt.count : 0)
                        : (optionCounts[opt.value.toLowerCase()] || 0);
                      return (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer select-none text-gray-700 dark:text-slate-200 font-medium">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => {
                              setCurrentPage(1);
                              setDateFilters(prev => 
                                prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                              );
                            }}
                            className="rounded border-gray-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                          />
                          <span className="flex-1 truncate">{opt.label} · {count}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleClearAllFilters}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-[#1e293b] text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear Filters</span>
          </button>

          <div className="relative">
            <input
              type="text"
              placeholder="Search files..."
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              className="pl-3 pr-8 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-60 text-gray-800 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579]"
            />
            <Search className="w-4 h-4 text-gray-400 dark:text-[#5b6579] absolute right-2.5 top-2" />
          </div>
        </div>



      </div>

      {/* ACTIVE CHIPS ROW */}
      {isAnyFilterActive && (
        <div className="flex flex-wrap items-center gap-2 py-2 px-1 border-t border-gray-100 dark:border-[#243044] text-xs mt-1 mb-2">
          <span className="text-gray-500 dark:text-slate-400 font-bold">Active filters:</span>
          {activeChips.map(chip => (
            <div 
              key={`${chip.group}-${chip.value}`}
              className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-100 dark:border-purple-900/50 rounded-full font-semibold"
            >
              <span>{chip.label}</span>
              <button
                onClick={() => handleRemoveChip(chip.group, chip.value)}
                className="hover:bg-purple-100 dark:hover:bg-purple-900/80 p-0.5 rounded-full transition-colors cursor-pointer text-purple-500 hover:text-purple-700 dark:hover:text-purple-200"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={handleClearAllFilters}
            className="text-red-600 dark:text-red-400 font-bold hover:underline ml-1 cursor-pointer text-xs"
          >
            Clear all
          </button>
        </div>
      )}

      {scanStatus.isRunning && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-800 px-3.5 py-2.5 text-xs flex items-center gap-2.5 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
          <span>A scan is in progress. Results update as files are checked.</span>
        </div>
      )}

      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-3.5 py-2.5 text-xs flex items-center justify-between gap-2.5 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={() => fetchUsedFiles(currentPage, searchQuery)}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* MAIN MEDIA DISPLAY (GRID VIEW OR LIST VIEW) */}
      <div className="relative">
        {isLoading && !hasLoadedOnceRef.current ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-12 border border-gray-200/90 dark:border-slate-700 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#A61E69] animate-spin" />
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Loading used files...</span>
          </div>
        ) : (
          <>
            {isLoading && hasLoadedOnceRef.current && (
              <div className="flex items-center gap-2 mb-3 px-3 py-1.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/50 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 w-fit">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                <span>Refreshing...</span>
              </div>
            )}
            {paginatedItems.length === 0 ? (
              fetchError ? null : (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-10 border border-gray-200/90 dark:border-slate-700 text-center shadow-sm">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center mx-auto text-slate-400">
                      <Search className="w-6 h-6" />
                    </div>
                    {isAnyFilterActive || Boolean(searchQuery) ? (
                      <>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">No used files match your filters.</h3>
                        <div className="pt-1 flex justify-center">
                          <button
                            onClick={handleClearAllFilters}
                            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer text-xs"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Clear Filters</span>
                          </button>
                        </div>
                      </>
                    ) : scanStatus.isRunning ? (
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Files are still being checked. They will appear here automatically.
                      </h3>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">No used files found yet.</h3>
                    )}
                  </div>
                </div>
              )
            ) : viewMode === 'grid' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200/90 dark:border-slate-700 shadow-2xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const isDropdownActive = activeDropdownId === item.id;
              return (
                <MediaGridCard
                  key={item.id}
                  item={item}
                  status="used"
                  selected={isSelected}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onInspect={() => setPreviewItem(item)}
                  footer={renderUsedInBadge(item)}
                  raised={isDropdownActive}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200/90 dark:border-slate-700 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-bold bg-gray-50/70 dark:bg-slate-900/40">
                  <th className="py-3 px-3 w-10 text-center">
                    <input 
                      type="checkbox" 
                      checked={isAllCurrentPageSelected}
                      onChange={handleToggleSelectCurrentPage}
                      className="rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                      title={isAllCurrentPageSelected ? "Deselect items on current page" : "Select items on current page"}
                    />
                  </th>
                  <th className="py-3 px-3 w-[18%] min-w-[150px] max-w-[200px]">File Preview</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Dimensions</th>
                  <th className="py-3 px-3">Source & Usage</th>
                  <th className="py-3 px-3">Upload Date</th>
                  <th className="py-3 pr-8 pl-3 text-right w-[12%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {paginatedItems.map((item) => (
                  <tr 
                    key={item.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors"
                  >
                    <td className="py-3.5 px-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                      />
                    </td>

                    {/* 80x80 File Preview */}
                    <td className="py-3.5 px-3 w-[18%] min-w-[150px] max-w-[200px]">
                      <div className="flex items-center gap-3">
                        <MediaPreview80 item={item} />
                        <div className="min-w-0 max-w-[120px] sm:max-w-[160px]">
                          <span className="font-bold text-gray-900 dark:text-white block truncate text-xs" title={item.filename}>
                            {item.filename}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {renderTypeBadge(item.display_extension || item.extension || '')}
                    </td>

                    {/* Size */}
                    <td className="py-3.5 px-3 whitespace-nowrap font-medium text-gray-700 dark:text-slate-300">
                      {item.formattedSize}
                    </td>

                    {/* Dimensions */}
                    <td className="py-3.5 px-3 whitespace-nowrap text-gray-600 dark:text-slate-400 font-mono">
                      {item.dimensions || '—'}
                    </td>

                    {/* Source & Usage */}
                    <td className="py-3.5 px-3">
                      <UnifiedLocationCell 
                        item={item} 
                        pageContext="used" 
                        onOpenUsageDrawer={(targetItem) => {
                          setDrawerItem(targetItem);
                          setDrawerOpen(true);
                        }} 
                      />
                    </td>

                    {/* Upload Date */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-slate-200">{item.uploadDate.split(' ').slice(0, 3).join(' ')}</div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">{item.uploadDate.split(' ').slice(3).join(' ')}</div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => setPreviewItem(item)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <a 
                          href={item.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
    )}
  </div>

      {/* SELECTION BAR AND PAGINATION FOR USED FILES */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200/90 dark:border-slate-700 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Left Selection Controls */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1 text-gray-600 dark:text-slate-400 font-medium mr-2">
            <span className="font-bold text-gray-900 dark:text-white">{selectedIds.length}</span>
            <span>selected</span>
          </div>
          <button 
            onClick={handleToggleSelectCurrentPage}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-[#1e293b] text-gray-700 dark:text-slate-200 px-3 py-1.5 rounded-lg font-semibold cursor-pointer shadow-sm"
          >
            {isAllCurrentPageSelected ? 'Deselect page' : 'Select page'}
          </button>
          <span className="text-gray-300 dark:text-slate-600">|</span>
          <button 
            onClick={() => setSelectedIds([])}
            className="text-gray-500 dark:text-slate-400 font-bold hover:underline cursor-pointer"
          >
            Clear Selection
          </button>
        </div>

        {/* Right Pagination */}
        <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400">
          <span>Total {totalItems} items</span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1 font-bold">
              <button 
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage === 1}
                className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setCurrentPage(validCurrentPage - 1)}
                disabled={validCurrentPage === 1}
                className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                let pageNum = idx + 1;
                if (totalPages > 5 && validCurrentPage > 3) {
                  pageNum = validCurrentPage - 3 + idx;
                  if (pageNum + (4 - idx) > totalPages) {
                    pageNum = totalPages - 4 + idx;
                  }
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer ${
                      validCurrentPage === pageNum 
                        ? 'bg-[#A61E69] text-white' 
                        : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button 
                onClick={() => setCurrentPage(validCurrentPage + 1)}
                disabled={validCurrentPage === totalPages}
                className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setCurrentPage(totalPages)}
                disabled={validCurrentPage === totalPages}
                className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

      </div>

      {/* PREVIEW MODAL */}
      {previewItem && (
        <div className="fixed inset-0 bg-[rgba(17,24,39,0.65)] backdrop-blur-[5px] flex items-center justify-center z-50 p-[30px]">
          <div className="w-full max-w-[640px] max-h-[90vh] bg-[#0f1118] rounded-[18px] overflow-hidden text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] font-sans flex flex-col">
            {/* Header */}
            <div className="h-[64px] flex items-center justify-between px-[32px] bg-[#111421] border-b border-white/5 shrink-0">
              <h3 className="text-[17px] font-semibold text-white truncate max-w-[480px]" style={{ color: '#ffffff' }}>
                {previewItem.filename}
              </h3>
              <button 
                onClick={() => setPreviewItem(null)} 
                className="w-[34px] h-[34px] border-none bg-transparent text-[#a7b1c2] hover:text-white hover:rotate-90 transition-all duration-250 cursor-pointer text-[26px] flex items-center justify-center leading-none"
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* Scrollable Content Wrapper */}
            <div className="p-[30px] pb-2 overflow-y-auto flex-1 pr-[30px] thin-scrollbar">
              {/* Preview Image / Container */}
              <div className="w-full h-[295px] rounded-[14px] overflow-hidden bg-[#1b2030] flex items-center justify-center shrink-0">
                {previewItem.url && previewItem.url !== '#' ? (
                  <img 
                    src={previewItem.url} 
                    alt={previewItem.title || previewItem.filename} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="text-[#8f97a9] text-sm flex flex-col items-center gap-2">
                    <FileText className="w-12 h-12 opacity-50" />
                    <span>No Image Preview Available</span>
                  </div>
                )}
              </div>

              {/* Path */}
              <div className="mt-[22px] bg-[#181b25] border border-white/5 rounded-[10px] text-[#8f97a9] text-[13px] py-[14px] px-[16px] overflow-hidden text-ellipsis whitespace-nowrap">
                {getRealFilePath(previewItem)}
              </div>

              {/* Grid Cards */}
              <div className="grid grid-cols-2 gap-[16px] mt-[22px]">
                {/* File Size */}
                <div className="relative bg-[#191c25] border border-white/6 rounded-[12px] pt-[18px] px-[18px] pb-[16px] overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[4px] before:rounded-l-[12px] before:bg-[#19d4ff]">
                  <div className="text-[#737b8d] text-[11px] tracking-[1.4px] uppercase mb-[8px] font-normal">File Size</div>
                  <div className="text-[17px] font-semibold text-white leading-[1.45]">{previewItem.formattedSize}</div>
                </div>

                {/* Dimensions */}
                <div className="relative bg-[#191c25] border border-white/6 rounded-[12px] pt-[18px] px-[18px] pb-[16px] overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[4px] before:rounded-l-[12px] before:bg-[#8d5bff]">
                  <div className="text-[#737b8d] text-[11px] tracking-[1.4px] uppercase mb-[8px] font-normal">Dimensions</div>
                  <div className="text-[17px] font-semibold text-white leading-[1.45]">{previewItem.dimensions || '—'}</div>
                </div>

                {/* Upload Date */}
                <div className="relative bg-[#191c25] border border-white/6 rounded-[12px] pt-[18px] px-[18px] pb-[16px] overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[4px] before:rounded-l-[12px] before:bg-[#ffb000]">
                  <div className="text-[#737b8d] text-[11px] tracking-[1.4px] uppercase mb-[8px] font-normal">Upload Date</div>
                  <div className="text-[17px] font-semibold text-white leading-[1.45]">{previewItem.uploadDate}</div>
                </div>

                {/* Live Usage Summary */}
                <div className="relative bg-[#191c25] border border-white/6 rounded-[12px] pt-[18px] px-[18px] pb-[16px] overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[4px] before:rounded-l-[12px] before:bg-[#4ade80]">
                  <div className="text-[#737b8d] text-[11px] tracking-[1.4px] uppercase mb-[8px] font-normal">Live Usage</div>
                  <div className="text-[17px] font-semibold text-white leading-[1.45]">
                    {(() => {
                      const count = getUsageLocations(previewItem).length;
                      return count === 1 ? 'Used in 1 location' : `Used in ${count} locations`;
                    })()}
                  </div>
                </div>
              </div>

              {/* Used In List Section */}
              <div className="mt-[22px] mb-4 bg-[#181b25] border border-white/5 rounded-[12px] p-[16px]">
                <span className="text-[#737b8d] text-[11px] tracking-[1.4px] uppercase mb-[10px] font-semibold block">
                  Used In (All Locations)
                </span>
                <div className="space-y-[8px] max-h-[160px] overflow-y-auto pr-1 thin-scrollbar">
                  {(() => {
                    const previewLocs = getUsageLocations(previewItem);
                    if (previewLocs.length === 0) {
                      return (
                        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-900/40 text-left space-y-1">
                          <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span>Usage details unavailable</span>
                          </div>
                          <p className="text-[11px] text-[#8f97a9]">
                            Location references are not currently indexed. Open the details drawer to rescan this file.
                          </p>
                        </div>
                      );
                    }
                    return previewLocs.map((loc, idx) => {
                      let typeColor = 'bg-indigo-950/40 text-indigo-300 border-indigo-800';
                      if (loc.type === 'WooCommerce') typeColor = 'bg-emerald-950/40 text-emerald-300 border-emerald-800';
                      if (loc.type === 'Elementor') typeColor = 'bg-rose-950/40 text-rose-300 border-rose-800';
                      if (loc.type === 'Widget') typeColor = 'bg-amber-950/40 text-amber-300 border-amber-800';
                      if (loc.type === 'Theme') typeColor = 'bg-blue-950/40 text-blue-300 border-blue-800';
                      if (loc.type === 'Post') typeColor = 'bg-violet-950/40 text-violet-300 border-violet-800';
                      if (loc.type === 'Page') typeColor = 'bg-indigo-950/40 text-indigo-300 border-indigo-800';

                      return (
                        <div key={idx} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#191c25] border border-white/5 shadow-3xs">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#1b2030] flex items-center justify-center text-[#8f97a9] shrink-0 border border-white/5">
                              {loc.type === 'WooCommerce' && <ShoppingCart className="w-4 h-4" />}
                              {loc.type === 'Elementor' && <Layers className="w-4 h-4" />}
                              {loc.type === 'Theme' && <Palette className="w-4 h-4" />}
                              {loc.type === 'Widget' && <SlidersHorizontal className="w-4 h-4" />}
                              {(loc.type === 'Page' || loc.type === 'Post') && <Globe className="w-4 h-4" />}
                              {(!['WooCommerce', 'Elementor', 'Theme', 'Widget', 'Page', 'Post'].includes(loc.type)) && <File className="w-4 h-4" />}
                            </div>
                            <span className="font-semibold text-white text-xs truncate">{loc.name}</span>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded border leading-none shrink-0 ${typeColor}`}>
                            {loc.type}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="px-[32px] py-[22px] bg-[#111421]/90 border-t border-white/5 flex justify-end gap-[12px] shrink-0 z-10">
              <button
                onClick={() => setPreviewItem(null)}
                className="h-[44px] px-[22px] rounded-[10px] text-[15px] font-semibold cursor-pointer transition-colors bg-transparent text-[#d4d7df] border border-white/15 hover:bg-[#202433]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ImageUsageDetailsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        item={drawerItem}
        isDarkMode={isDarkMode}
        onItemRescanned={(updated) => {
          setDrawerItem(updated);
          if (onItemRescanned) {
            onItemRescanned(updated);
          }
        }}
        onNavigateToScanner={onNavigateToScanner}
      />
    </div>
  );
};
