import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MediaItem, UsageCheckItem, UsageCheckResult } from '../types';
import { useScanStatus } from '../utils/scanStatus';
import { MediaGridCard } from './MediaGridCard';
import { MediaPreview80 } from './MediaPreview80';
import { SingleUsageWarningModal } from './SingleUsageWarningModal';
import { BulkUsageWarningModal } from './BulkUsageWarningModal';
import { AgeProtectedTrashConfirmModal } from './AgeProtectedTrashConfirmModal';
import { getRealFilePath, getUsageLocations, mapPhpItemToMediaItem } from '../utils/fileUtils';
import { UnifiedLocationCell } from './UnifiedLocationCell';
import { 
  FileText, 
  PieChart, 
  Image as ImageIcon, 
  FileCode, 
  HelpCircle, 
  AlertTriangle, 
  RefreshCw, 
  Scan,
  SlidersHorizontal, 
  List, 
  Grid, 
  Filter, 
  Search, 
  Download, 
  Trash2, 
  Eye, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Folder,
  Layers,
  Video,
  X,
  ChevronDown,
  Loader2
} from 'lucide-react';

interface UnusedFilesTabProps {
  mediaList: MediaItem[];
  externalSearchQuery?: string;
  onMoveToTrash: (id: number) => void;
  onMoveSelectedToTrash: (ids: number[], force?: boolean, forceProtected?: boolean) => void;
  onRescan?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onNavigateToSettings: (subTab?: string) => void;
  onExportCSV: (selectedIds?: number[]) => void;
  isDarkMode?: boolean;
  initialLocationFilter?: string;
  selectedIds?: number[];
  setSelectedIds?: React.Dispatch<React.SetStateAction<number[]>>;
  dataRevision?: number;
  isActive?: boolean;
}

export function getStorageFolderPath(item: MediaItem): string {
  if (item.url) {
    try {
      let pathname = '';
      if (item.url.startsWith('http://') || item.url.startsWith('https://')) {
        pathname = new URL(item.url).pathname;
      } else {
        pathname = item.url.split('?')[0].split('#')[0];
      }
      pathname = decodeURIComponent(pathname);
      const lastSlashIndex = pathname.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        pathname = pathname.substring(0, lastSlashIndex + 1);
      }
      if (!pathname.startsWith('/')) {
        pathname = '/' + pathname;
      }
      if (!pathname.endsWith('/')) {
        pathname = pathname + '/';
      }
      const wpIndex = pathname.indexOf('/wp-content/');
      if (wpIndex !== -1) {
        pathname = pathname.substring(wpIndex);
      }
      if (pathname && pathname !== '/') {
        return pathname;
      }
    } catch (e) {
      // unparsable, fall through
    }
  }

  const loc = item.location;
  if (loc === 'Themes') return '/wp-content/themes/';
  if (loc === 'Plugins') return '/wp-content/plugins/';
  if (loc === 'Backups') return '/wp-content/uploads/backups/';
  if (loc === 'Cache') return '/wp-content/cache/images/';
  if (loc === 'Custom Folders') return '/wp-content/custom/';

  if (item.uploadDate) {
    const parts = item.uploadDate.match(/([A-Z][a-z]+)\s+(\d+),\s+(\d{4})/);
    if (parts) {
      const monthMap: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
        January: '01', February: '02', March: '03', April: '04', June: '06',
        July: '07', August: '08', September: '09', October: '10', November: '11', December: '12'
      };
      const m = monthMap[parts[1]];
      const y = parts[3];
      if (m && y) {
        return `/wp-content/uploads/${y}/${m}/`;
      }
    }
  }
  return '/wp-content/uploads/';
}

export const UnusedFilesTab: React.FC<UnusedFilesTabProps> = ({
  mediaList,
  externalSearchQuery = '',
  onMoveToTrash,
  onMoveSelectedToTrash,
  onRescan,
  onRefresh,
  isRefreshing: propIsRefreshing = false,
  onNavigateToSettings,
  onExportCSV,
  isDarkMode = false,
  initialLocationFilter = 'all',
  selectedIds: propSelectedIds,
  setSelectedIds: propSetSelectedIds,
  dataRevision,
  isActive
}) => {
  const scanStatus = useScanStatus();
  const isWp = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData);
  const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;

  // Local pagination & server fetch state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(externalSearchQuery || '');
  const [unverifiedCount, setUnverifiedCount] = useState<number>(0);
  const [breakdownIncomplete, setBreakdownIncomplete] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [serverItems, setServerItems] = useState<MediaItem[]>([]);
  const [serverTotal, setServerTotal] = useState<number>(0);
  const [serverCategoryBreakdown, setServerCategoryBreakdown] = useState<any>(null);
  const [backendFileTypeOptions, setBackendFileTypeOptions] = useState<{ value: string; label: string; group?: string; count?: number }[] | null>(null);
  const [backendLocationOptions, setBackendLocationOptions] = useState<{ value: string; label: string; count?: number }[] | null>(null);
  const [backendDateOptions, setBackendDateOptions] = useState<{ value: string; label: string; count?: number }[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const latestFetchIdRef = useRef<number>(0);
  const fileSizeMapRef = useRef<Record<number, number>>({});
  const isFetchingRef = useRef<boolean>(false);

  // View Mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Filters & Search
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(localSearchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearchQuery]);

  const searchQuery = externalSearchQuery || debouncedSearch;
  const [fileTypeFilters, setFileTypeFilters] = useState<string[]>([]);
  const [locationFilters, setLocationFilters] = useState<string[]>(
    initialLocationFilter !== 'all' ? [initialLocationFilter.toLowerCase()] : []
  );
  const [sizeFilters, setSizeFilters] = useState<string[]>([]);
  const [dateFilters, setDateFilters] = useState<string[]>([]);

  // Internal selection fallback
  const [internalSelectedIds, setInternalSelectedIds] = useState<number[]>([]);
  const selectedIds = propSelectedIds !== undefined ? propSelectedIds : internalSelectedIds;
  const setSelectedIds = propSetSelectedIds !== undefined ? propSetSelectedIds : setInternalSelectedIds;

  const fetchUnusedFiles = useCallback(async (page: number, search: string, silent: boolean = false) => {
    if (!imgsentryData || (!imgsentryData.ajax_url && !imgsentryData.ajaxUrl)) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    const fetchId = ++latestFetchIdRef.current;
    isFetchingRef.current = true;
    if (!silent) setIsLoading(true);
    setFetchError(null);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_fetch_usage_list');
      fd.append('status', 'unused');
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
        setUnverifiedCount(Number(json.data.unverified_count) || 0);
        mapped.forEach((m: MediaItem) => {
          fileSizeMapRef.current[Number(m.id)] = Number(m.fileSize);
        });
        if (json.data.category_breakdown) {
          setServerCategoryBreakdown(json.data.category_breakdown);
          setBreakdownIncomplete(!!json.data.breakdown_incomplete);
        }
        hasLoadedOnceRef.current = true;
      } else {
        throw new Error(json.data?.message || 'Failed to fetch unused files list.');
      }
    } catch (e: any) {
      console.error('Error fetching unused files:', e);
      if (fetchId !== latestFetchIdRef.current) return;
      setFetchError(e.message || 'Error loading unused media items.');
    } finally {
      isFetchingRef.current = false;
      if (fetchId === latestFetchIdRef.current) { setIsLoading(false); }
    }
  }, [imgsentryData, fileTypeFilters, locationFilters, sizeFilters, dateFilters]);

  useEffect(() => {
    if (!isWp) {
      hasLoadedOnceRef.current = true;
    }
  }, [isWp]);

  useEffect(() => {
    if (unverifiedCount <= 0) return;

    const intervalId = setInterval(() => {
      if (isActive && !document.hidden && !isFetchingRef.current) {
        fetchUnusedFiles(currentPage, searchQuery, true);
      }
    }, 10000);

    return () => clearInterval(intervalId);
  }, [unverifiedCount, isActive, currentPage, searchQuery, fetchUnusedFiles, scanStatus.processed, scanStatus.isRunning]);

  // Fetch distinct file types from backend
  const fetchFileTypeOptions = useCallback(() => {
    if (!isWp || !imgsentryData) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    if (!ajaxUrl) return;

    const fd = new FormData();
    fd.append('action', 'imgsentry_get_distinct_file_types');
    fd.append('status', 'unused');
    fd.append('nonce', imgsentryData.nonce);

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.options)) {
          setBackendFileTypeOptions(json.data.options);
        }
      })
      .catch(err => {
        console.error('Error fetching distinct file types for unused tab:', err);
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
    fd.append('status', 'unused');
    fd.append('nonce', imgsentryData.nonce);

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.options)) {
          setBackendLocationOptions(json.data.options);
        }
      })
      .catch(err => {
        console.error('Error fetching distinct locations for unused tab:', err);
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
    fd.append('status', 'unused');
    fd.append('nonce', imgsentryData.nonce);

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.options)) {
          setBackendDateOptions(json.data.options);
        }
      })
      .catch(err => {
        console.error('Error fetching distinct dates for unused tab:', err);
      });
  }, [isWp, imgsentryData]);

  useEffect(() => {
    fetchDateOptions();
  }, [fetchDateOptions]);

  // Fetch on mount, search change, page change, or filter change
  useEffect(() => {
    if (isWp) {
      fetchUnusedFiles(currentPage, searchQuery);
    }
  }, [currentPage, searchQuery, JSON.stringify([fileTypeFilters, locationFilters, sizeFilters, dateFilters]), isWp]);

  const lastSyncedRevisionRef = useRef<number>(dataRevision ?? 0);
  const prevIsActiveRef = useRef<boolean>(isActive ?? false);

  useEffect(() => {
    const justBecameActive = Boolean(isActive) && !prevIsActiveRef.current;
    if (isWp && justBecameActive && dataRevision !== undefined && dataRevision !== lastSyncedRevisionRef.current) {
      lastSyncedRevisionRef.current = dataRevision;
      fetchUnusedFiles(currentPage, searchQuery);
      fetchFileTypeOptions();
    }
    prevIsActiveRef.current = Boolean(isActive);
  }, [isActive, dataRevision]);

  const handleManualRefresh = () => {
    if (isWp) {
      fetchUnusedFiles(currentPage, searchQuery);
      fetchFileTypeOptions();
      fetchLocationOptions();
      fetchDateOptions();
    }
    if (onRefresh) {
      onRefresh();
    }
  };

  // Filter unused items for local fallback & aggregate stats
  const aggregateUnusedItems = useMemo(
    () => mediaList.filter(item => !item.inUse && !item.isTrashed),
    [mediaList]
  );

  const itemsToDisplay = isWp ? serverItems : aggregateUnusedItems;

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

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
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

  // Refreshing state
  const [localIsRefreshing, setLocalIsRefreshing] = useState(false);
  const activeRefreshing = localIsRefreshing || propIsRefreshing;

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      setLocalIsRefreshing(true);
      setTimeout(() => {
        setLocalIsRefreshing(false);
      }, 850);
    }
  };

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Usage Warning Modal States
  const [isCheckingUsage, setIsCheckingUsage] = useState<boolean>(false);
  const [singleWarningTarget, setSingleWarningTarget] = useState<UsageCheckItem | null>(null);
  const [singleWarningScanDate, setSingleWarningScanDate] = useState<string>('Never scanned');
  const [bulkWarningData, setBulkWarningData] = useState<{
    totalSelected: number;
    safeItems: UsageCheckItem[];
    usedItems: UsageCheckItem[];
    lastScanFormatted: string;
  } | null>(null);
  const [unverifiedWarning, setUnverifiedWarning] = useState<{
    type: 'single' | 'bulk';
    ids: number[];
    item?: MediaItem;
    errorMessage?: string;
  } | null>(null);
  const [ageProtectedConfirm, setAgeProtectedConfirm] = useState<{ id: number; ageLabel: string } | null>(null);

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

  const fileTypeOptions = useMemo(() => {
    if (isWp && backendFileTypeOptions !== null) {
      return backendFileTypeOptions;
    }

    const opts: { value: string; label: string; group?: string; count?: number }[] = [];
    
    // Images
    imageExtensions.forEach(ext => {
      if (availableExtensions.includes(ext)) {
        opts.push({ value: ext, label: `${ext.toUpperCase()} (.${ext})`, group: 'Images' });
      }
    });

    // Media
    if (mediaExtensions.some(ext => availableExtensions.includes(ext))) {
      opts.push({ value: 'media', label: 'All Media (Audio/Video)', group: 'Media' });
    }
    mediaExtensions.forEach(ext => {
      if (availableExtensions.includes(ext)) {
        opts.push({ value: ext, label: `${ext.toUpperCase()} (.${ext})`, group: 'Media' });
      }
    });

    // Documents
    if (documentExtensions.some(ext => availableExtensions.includes(ext))) {
      opts.push({ value: 'documents', label: 'All Documents', group: 'Documents' });
    }
    documentExtensions.forEach(ext => {
      if (availableExtensions.includes(ext)) {
        opts.push({ value: ext, label: `${ext.toUpperCase()} (.${ext})`, group: 'Documents' });
      }
    });

    // Others
    if (otherExtensions.some(ext => availableExtensions.includes(ext))) {
      opts.push({ value: 'other_files', label: 'All Other Files', group: 'Other Files' });
    }
    otherExtensions.forEach(ext => {
      if (availableExtensions.includes(ext)) {
        opts.push({ value: ext, label: `${ext.toUpperCase()} (.${ext})`, group: 'Other Files' });
      }
    });

    return opts;
  }, [isWp, backendFileTypeOptions, imageExtensions, mediaExtensions, documentExtensions, otherExtensions, availableExtensions]);

  const folderOptions = useMemo<Array<{ value: string; label: string; count?: number }>>(() => {
    if (isWp && backendLocationOptions !== null) {
      return backendLocationOptions;
    }

    const opts: Array<{ value: string; label: string; count?: number }> = availableImageFolders.map(folder => ({
      value: folder.toLowerCase(),
      label: folder
    }));
    locationFilters.forEach(val => {
      if (!opts.some(o => o.value === val)) {
        opts.push({ value: val, label: val.replace(/\b\w/g, l => l.toUpperCase()) });
      }
    });
    return opts;
  }, [isWp, backendLocationOptions, availableImageFolders, locationFilters]);

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

  // Helper matches
  const matchFileType = (item: MediaItem, filters: string[]) => {
    if (filters.length === 0) return true;
    if (isWp) return true; // In live WP mode, file type filtering is handled server-side via SQL in build_usage_where_clause()
    const ext = item.extension.toLowerCase();
    return filters.some(filter => {
      if (filter === 'all') return true;
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
        return mediaExtensions.includes(ext) || item.category === 'video' || item.category === 'audio';
      } else if (filter === 'other_files') {
        return !imageExtensions.includes(ext) && 
               !mediaExtensions.includes(ext) && 
               !documentExtensions.includes(ext) &&
               item.category !== 'images' && 
               item.category !== 'video' && 
               item.category !== 'audio' && 
               item.category !== 'documents';
      } else if (filter === 'documents') {
        return item.category === 'documents' || documentExtensions.includes(ext);
      } else if (filter === 'jpg' || filter === 'jpeg') {
        const effectiveExt = (item.display_extension || item.effective_format || ext).toLowerCase();
        return ['jpg', 'jpeg'].includes(effectiveExt);
      } else {
        const effectiveExt = (item.display_extension || item.effective_format || ext).toLowerCase();
        return effectiveExt === filter;
      }
    });
  };

  const matchFolder = (item: MediaItem, filters: string[]) => {
    if (filters.length === 0) return true;
    if (isWp) return true; // In live WP mode, location/folder filtering is handled server-side via SQL in build_usage_where_clause()
    const itemFolder = getStorageFolderPath(item).toLowerCase();
    return filters.some(filter => {
      if (filter === 'all') return true;
      if (filter.startsWith('/')) {
        return itemFolder === filter;
      } else {
        const loc = (item.location || '').toLowerCase();
        return loc === filter || loc.includes(filter) || itemFolder.includes(filter);
      }
    });
  };

  const matchSize = (item: MediaItem, filters: string[]) => {
    if (filters.length === 0) return true;
    if (isWp) return true; // In live WP mode, size filtering is handled server-side via SQL in build_usage_where_clause()
    if (!item.fileSize || item.fileSize <= 0) return false;
    return filters.some(filter => {
      if (filter === 'all') return true;
      if (filter === 'small') return item.fileSize < 500 * 1024;
      if (filter === 'medium') return item.fileSize >= 500 * 1024 && item.fileSize <= 2 * 1024 * 1024;
      if (filter === 'large') return item.fileSize > 2 * 1024 * 1024;
      return true;
    });
  };

  const matchDate = (item: MediaItem, filters: string[]) => {
    if (filters.length === 0) return true;
    if (isWp) return true; // In live WP mode, date filtering is handled server-side via SQL in build_usage_where_clause()
    const uploadDate = item.uploadDate || '';
    return filters.some(filter => {
      if (filter === 'all') return true;
      if (uploadDate.includes(filter)) return true;
      if (filter === '2024-05' && uploadDate.includes('May')) return true;
      if (filter === '2024-04' && uploadDate.includes('Apr')) return true;
      return false;
    });
  };

  // Option Counts
  const optionCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    // For file type options
    fileTypeOptions.forEach(opt => {
      if (opt.count !== undefined) {
        counts[opt.value.toLowerCase()] = opt.count;
      } else {
        let matchingCount = 0;
        itemsToDisplay.forEach(item => {
          if (
            matchFolder(item, locationFilters) &&
            matchSize(item, sizeFilters) &&
            matchDate(item, dateFilters)
          ) {
            if (matchFileType(item, [opt.value])) {
              matchingCount++;
            }
          }
        });
        counts[opt.value.toLowerCase()] = matchingCount;
      }
    });

    // For folder options
    folderOptions.forEach(opt => {
      if (opt.count !== undefined) {
        counts[opt.value] = opt.count;
      } else {
        let matchingCount = 0;
        itemsToDisplay.forEach(item => {
          if (
            matchFileType(item, fileTypeFilters) &&
            matchSize(item, sizeFilters) &&
            matchDate(item, dateFilters)
          ) {
            if (matchFolder(item, [opt.value])) {
              matchingCount++;
            }
          }
        });
        counts[opt.value] = matchingCount;
      }
    });

    // For size options
    sizeOptions.forEach(opt => {
      let matchingCount = 0;
      itemsToDisplay.forEach(item => {
        if (
          matchFileType(item, fileTypeFilters) &&
          matchFolder(item, locationFilters) &&
          matchDate(item, dateFilters)
        ) {
          if (matchSize(item, [opt.value])) {
            matchingCount++;
          }
        }
      });
      counts[opt.value] = matchingCount;
    });

    // For date options
    dateOptions.forEach(opt => {
      if (opt.count !== undefined) {
        counts[opt.value] = opt.count;
      } else {
        let matchingCount = 0;
        itemsToDisplay.forEach(item => {
          if (
            matchFileType(item, fileTypeFilters) &&
            matchFolder(item, locationFilters) &&
            matchSize(item, sizeFilters)
          ) {
            if (matchDate(item, [opt.value])) {
              matchingCount++;
            }
          }
        });
        counts[opt.value] = matchingCount;
      }
    });

    return counts;
  }, [
    itemsToDisplay,
    fileTypeFilters,
    locationFilters,
    sizeFilters,
    dateFilters,
    fileTypeOptions,
    folderOptions,
    dateOptions
  ]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return itemsToDisplay.filter(item => {
      // 1. File Type Filter (OR)
      if (!matchFileType(item, fileTypeFilters)) return false;

      // 2. Folder Filter (OR)
      if (!matchFolder(item, locationFilters)) return false;

      // 3. Size Filter (OR)
      if (!matchSize(item, sizeFilters)) return false;

      // 4. Date Filter (OR)
      if (!matchDate(item, dateFilters)) return false;

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.filename.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.extension.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [itemsToDisplay, fileTypeFilters, locationFilters, sizeFilters, dateFilters, searchQuery]);

  // Reset pagination on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, fileTypeFilters, locationFilters, sizeFilters, dateFilters]);

  const handleRemoveChip = (group: string, val: string) => {
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



  // Helper function to get usage locations for pre-trash checks without skipping protection rules
  const getPreTrashUsageLocations = (item: MediaItem) => {
    if (!item) return [];

    const locations: Array<{
      title: string;
      name: string;
      type: string;
      field_type?: string;
      field_label?: string;
    }> = [];
    const seenKeys = new Set<string>();

    if (Array.isArray(item.useReasons)) {
      for (const entry of item.useReasons) {
        if (!entry) continue;

        if (typeof entry === 'object') {
          const postId = entry.post_id !== undefined && entry.post_id !== null ? Number(entry.post_id) : null;
          const fieldType = String(entry.field_type || 'content');

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

          locations.push({
            title,
            name: title,
            type,
            field_type: fieldType,
            field_label: entry.field_label || title
          });
        }
      }
    }

    if (locations.length === 0 && item.parentTitle) {
      const cleanP = item.parentTitle.trim();
      const lowerP = cleanP.toLowerCase();
      if (cleanP && !lowerP.includes('attached to') && !lowerP.includes('unattached')) {
        locations.unshift({
          title: cleanP,
          name: cleanP,
          type: item.parentType || 'Page'
        });
      }
    }

    return locations;
  };

  // Check usage before trashing single or multiple items
  const checkUsageBeforeTrash = async (ids: number[]): Promise<UsageCheckResult> => {
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const fd = new FormData();
      fd.append('action', 'imgsentry_check_usage_before_trash');
      fd.append('nonce', imgsentryData.nonce);
      ids.forEach(id => fd.append('ids[]', String(id)));

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success && json.data) {
        return json.data as UsageCheckResult;
      }
      throw new Error(json?.data?.message || 'Usage verification failed.');
    }

    // Local / Dev Fallback: evaluate usage from state
    const items: UsageCheckItem[] = ids.map(id => {
      const item = mediaList.find(m => m.id === id);
      const locs = item ? getPreTrashUsageLocations(item) : [];
      const isUsed = item ? (item.inUse || locs.length > 0) : false;
      return {
        attachment_id: id,
        title: item?.title || `Media #${id}`,
        filename: item?.filename || `file-${id}`,
        is_used: isUsed,
        usage_count: locs.length,
        locations: locs.map(l => ({
          title: l.name,
          type: l.type,
          display: `${l.name} (${l.type})`,
          field_type: l.field_type,
          field_label: l.field_label
        })),
        last_scanned_at: item?.lastScanTime || null
      };
    });

    const usedCount = items.filter(i => i.is_used).length;
    return {
      items,
      last_scan_time: null,
      last_scan_formatted: 'Never scanned',
      total_checked: items.length,
      used_count: usedCount,
      unused_count: items.length - usedCount
    };
  };

  // Direct trash execution after confirmation or when safe
  const executeMoveToTrash = (id: number) => {
    onMoveToTrash(id);
    setSelectedIds(prev => prev.filter(i => i !== id));
    if (isWp) {
      setTimeout(() => { fetchUnusedFiles(currentPage, searchQuery); fetchFileTypeOptions(); fetchLocationOptions(); fetchDateOptions(); }, 500);
    }
  };

  const executeMoveSelectedToTrash = (ids: number[], force = false, forceProtected = false) => {
    onMoveSelectedToTrash(ids, force, forceProtected);
    setSelectedIds(prev => prev.filter(i => !ids.includes(i)));
    if (isWp) {
      setTimeout(() => { fetchUnusedFiles(currentPage, searchQuery); fetchFileTypeOptions(); fetchLocationOptions(); fetchDateOptions(); }, 500);
    }
  };

  // Single Item Trash Handler - direct execution, backend checks real-time genuine usage
  const handleMoveToTrash = async (id: number) => {
    if (scanStatus.isRunning) return;
    const item = (isWp ? serverItems : aggregateUnusedItems).find(i => i.id === id);
    if (!item) return;

    try {
      const result = await checkUsageBeforeTrash([id]);
      const resultItem = result?.items?.[0];

      if (resultItem?.locations && resultItem.locations.length > 0 && resultItem.locations.every((loc: any) => loc.field_type === 'min_age_rule')) {
        const ageLocation = resultItem.locations.find((loc: any) => loc.field_type === 'min_age_rule');
        setAgeProtectedConfirm({ id, ageLabel: ageLocation?.field_label || '' });
        return;
      }

      if (resultItem?.is_used) {
        setSingleWarningTarget(resultItem);
        setSingleWarningScanDate(result.last_scan_formatted || 'Never scanned');
        return;
      }

      executeMoveToTrash(id);
    } catch (e: any) {
      setUnverifiedWarning({ type: 'single', ids: [id], item, errorMessage: e.message });
    }
  };

  // Bulk Trash Handler with Safety Warning
  const handleMoveSelectedToTrash = async (ids: number[]) => {
    if (scanStatus.isRunning) return;
    if (ids.length === 0) return;
    
    setIsCheckingUsage(true);
    try {
      const checkResult = await checkUsageBeforeTrash(ids);
      const usedItems = checkResult.items.filter(i => i.is_used);
      const safeItems = checkResult.items.filter(i => !i.is_used);

      const isSingleAgeProtectedOnly =
        ids.length === 1 &&
        usedItems.length === 1 &&
        usedItems[0].locations.length > 0 &&
        usedItems[0].locations.every(loc => loc.field_type === 'min_age_rule');

      if (isSingleAgeProtectedOnly) {
        const ageLocation = usedItems[0].locations.find(loc => loc.field_type === 'min_age_rule');
        setAgeProtectedConfirm({
          id: usedItems[0].attachment_id,
          ageLabel: ageLocation?.field_label || ''
        });
      } else if (usedItems.length > 0) {
        setBulkWarningData({
          totalSelected: ids.length,
          safeItems,
          usedItems,
          lastScanFormatted: checkResult.last_scan_formatted || 'Never scanned'
        });
      } else {
        executeMoveSelectedToTrash(ids);
      }
    } catch (e: any) {
      console.error('Failed to perform bulk usage check:', e);
      setUnverifiedWarning({
        type: 'bulk',
        ids,
        errorMessage: e?.message || 'Connection or verification error'
      });
    } finally {
      setIsCheckingUsage(false);
    }
  };

  // Toggle selection
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Page Selection Handlers
  const isAllCurrentPageSelected = paginatedItems.length > 0 && paginatedItems.every(i => selectedIds.includes(i.id));

  const handleToggleSelectCurrentPage = () => {
    const currentPageIds = paginatedItems.filter(i => !i.pending).map(i => i.id);
    if (isAllCurrentPageSelected) {
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };



  // Calculate total selected bytes
  const selectedBytes = selectedIds.reduce((acc, id) => {
    const size = fileSizeMapRef.current[id] || 0;
    return acc + size;
  }, 0);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0 || !Number.isFinite(bytes) || bytes < 1) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
    return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(1)) + ' ' + sizes[safeIndex];
  };

  // Dynamic Real Metrics calculations
  const hasCategoryBreakdown = isWp && !!serverCategoryBreakdown;

  const totalUnusedCount = isWp ? serverTotal : aggregateUnusedItems.length;
  const totalUnusedSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.total_size || 0)
    : aggregateUnusedItems.reduce((acc, i) => acc + i.fileSize, 0);

  const imageItems = aggregateUnusedItems.filter(i => i.category === 'images');
  const totalImagesCount = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.images?.count || 0)
    : imageItems.length;
  const totalImagesSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.images?.size || 0)
    : imageItems.reduce((acc, i) => acc + i.fileSize, 0);

  const docItems = aggregateUnusedItems.filter(i => i.category === 'documents');
  const totalDocsCount = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.documents?.count || 0)
    : docItems.length;
  const totalDocsSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.documents?.size || 0)
    : docItems.reduce((acc, i) => acc + i.fileSize, 0);

  const mediaItems = aggregateUnusedItems.filter(i => i.category === 'video' || i.category === 'audio');
  const totalMediaCount = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.video?.count || 0) + Number(serverCategoryBreakdown.audio?.count || 0)
    : mediaItems.length;
  const totalMediaSize = hasCategoryBreakdown
    ? Number(serverCategoryBreakdown.video?.size || 0) + Number(serverCategoryBreakdown.audio?.size || 0)
    : mediaItems.reduce((acc, i) => acc + i.fileSize, 0);

  const otherItems = aggregateUnusedItems.filter(i => i.category !== 'images' && i.category !== 'documents' && i.category !== 'video' && i.category !== 'audio');
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

  const unusedSizeParts = getFormattedParts(totalUnusedSize);
  const imagesSizeParts = getFormattedParts(totalImagesSize);
  const docsSizeParts = getFormattedParts(totalDocsSize);
  const mediaSizeParts = getFormattedParts(totalMediaSize);
  const othersSizeParts = getFormattedParts(totalOthersSize);

  return (
    <div className="space-y-5 text-gray-900 dark:text-slate-100">

      {/* METRICS ROW (6 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Total Unused Files */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Total Unused Files</span>
            <div className="text-xl font-black text-blue-600 dark:text-[#5B8DEF] mt-1.5 block leading-none">{totalUnusedCount}</div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-[#5B8DEF]/15 dark:text-[#5B8DEF] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files
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
            <div className="text-xl font-black text-blue-600 dark:text-[#5B8DEF] mt-1.5 block leading-none">{totalImagesCount}</div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-[#5B8DEF]/15 dark:text-[#5B8DEF] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files ({imagesSizeParts.value} {imagesSizeParts.unit})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-[#5B8DEF]/15 text-blue-600 dark:text-[#5B8DEF] flex items-center justify-center shrink-0 ml-2">
            <ImageIcon className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Documents */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Documents</span>
            <div className="text-xl font-black text-amber-600 dark:text-[#fbbf24] mt-1.5 block leading-none">{totalDocsCount}</div>
            <div className="text-[12px] font-semibold text-amber-800 bg-amber-100 dark:bg-[#fbbf24]/15 dark:text-[#fbbf24] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files ({docsSizeParts.value} {docsSizeParts.unit})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-[#fbbf24]/15 text-amber-600 dark:text-[#fbbf24] flex items-center justify-center shrink-0 ml-2">
            <FileCode className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Media (Video/Audio) */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Media (Video/Audio)</span>
            <div className="text-xl font-black text-violet-600 dark:text-violet-400 mt-1.5 block leading-none">{totalMediaCount}</div>
            <div className="text-[12px] font-semibold text-violet-700 bg-violet-100 dark:bg-violet-950/40 dark:text-violet-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files ({mediaSizeParts.value} {mediaSizeParts.unit})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 ml-2">
            <Video className="w-6 h-6" />
          </div>
        </div>

        {/* Card 5: Others */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Others</span>
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1.5 block leading-none">{totalOthersCount}</div>
            <div className="text-[12px] font-semibold text-purple-700 bg-purple-100 dark:bg-purple-950/40 dark:text-purple-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files ({othersSizeParts.value} {othersSizeParts.unit})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 ml-2">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Card 6: Potential Savings */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Recoverable Space</span>
            <div className="text-xl font-black text-rose-600 dark:text-[#f87171] mt-1.5 block leading-none">{unusedSizeParts.value} <span className="text-xs font-bold">{unusedSizeParts.unit}</span></div>
            <div className="text-[12px] font-semibold text-rose-700 bg-rose-100 dark:bg-[#f87171]/15 dark:text-[#f87171] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              That you can free up
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-[#f87171]/15 text-rose-600 dark:text-[#f87171] flex items-center justify-center shrink-0 ml-2">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {breakdownIncomplete && (
        <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
          Totals may be incomplete on very large libraries.
        </div>
      )}

      {/* CONTROL BAR (VIEW MODE, FILTERS, SEARCH, EXPORT, DELETE ALL) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        
        {/* Left View Switcher & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* List / Grid toggle */}
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

          {/* Filter Dropdowns */}
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
                    onClick={() => setFileTypeFilters(fileTypeOptions.map(o => o.value))} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => setFileTypeFilters([])} 
                    className="text-gray-500 dark:text-slate-400 font-bold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-y-auto max-h-60 pr-1">
                  {fileTypeOptions.map((opt, idx) => {
                    const isChecked = fileTypeFilters.includes(opt.value);
                    const count = optionCounts[opt.value.toLowerCase()] || 0;
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
                              setFileTypeFilters(prev => 
                                prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                              );
                            }}
                            className="rounded border-gray-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                          />
                          <span className="flex-1 truncate">{opt.label}</span>
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
                    onClick={() => setLocationFilters(folderOptions.map(o => o.value))} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => setLocationFilters([])} 
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
                      return (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer select-none text-gray-700 dark:text-slate-200 font-medium">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => {
                              setLocationFilters(prev => 
                                prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                              );
                            }}
                            className="rounded border-gray-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                          />
                          <span className="flex-1 truncate">{opt.label}</span>
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
                    onClick={() => setSizeFilters(sizeOptions.map(o => o.value))} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => setSizeFilters([])} 
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
                    onClick={() => setDateFilters(dateOptions.map(o => o.value))} 
                    className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => setDateFilters([])} 
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
                      return (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer select-none text-gray-700 dark:text-slate-200 font-medium">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => {
                              setDateFilters(prev => 
                                prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                              );
                            }}
                            className="rounded border-gray-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                          />
                          <span className="flex-1 truncate">{opt.label}</span>
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
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-[#1e293b] text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
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

      {/* YELLOW ALERT WARNING BANNER */}
      <div className="bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200/90 dark:border-amber-800 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-200 font-medium shadow-sm">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>These files are not used anywhere on your site. Please double-check before deleting.</span>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-3.5 py-2.5 text-xs flex items-center justify-between gap-2.5 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={() => fetchUnusedFiles(currentPage, searchQuery)}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {unverifiedCount > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-800 px-3.5 py-2.5 text-xs flex items-center gap-2.5 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200 shadow-sm">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
          <span>
            Checking usage in the background: <strong>{scanStatus.processed.toLocaleString()}</strong> of <strong>{scanStatus.total.toLocaleString()}</strong> files verified. These files will become available automatically.
          </span>
        </div>
      )}

      {/* MAIN MEDIA DISPLAY (GRID VIEW OR LIST VIEW) */}
      <div className={`relative transition-opacity duration-200 ${activeRefreshing || (isLoading && !hasLoadedOnceRef.current) ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
        {isLoading && !hasLoadedOnceRef.current ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-12 border border-gray-200/90 dark:border-slate-700 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#A61E69] animate-spin" />
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Loading unused files...</span>
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
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">No files match your filters.</h3>
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
                    ) : unverifiedCount > 0 ? (
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Files are still being checked. Results will appear here automatically.
                      </h3>
                    ) : (
                      <>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white!">No unused files found.</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          All your files are used on your site.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )
            ) : viewMode === 'grid' ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200/90 dark:border-slate-700 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const trashBlocked = scanStatus.isRunning || !!item.pending;
              return (
                <MediaGridCard
                  key={item.id}
                  item={item}
                  status={item.pending ? 'checking' : 'unused'}
                  selected={isSelected}
                  selectDisabled={!!item.pending}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onInspect={() => setPreviewItem(item)}
                  onTrash={() => handleMoveToTrash(item.id)}
                  trashDisabled={trashBlocked}
                  trashTitle={trashBlocked ? 'Available when the check finishes' : 'Move to Trash'}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200/90 dark:border-slate-700 overflow-hidden shadow-sm">
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
                  <th className="py-3 px-3">Source & Location</th>
                  <th className="py-3 px-3">Upload Date</th>
                  <th className="py-3 pr-8 pl-3 text-right w-[12%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {paginatedItems.map((item) => (
                  <tr 
                    key={item.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors ${
                      selectedIds.includes(item.id) ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3.5 px-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        disabled={item.pending}
                        className={`rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] ${item.pending ? "opacity-20 cursor-not-allowed" : "cursor-pointer"}`}
                      />
                    </td>

                     {/* 80x80 px File Thumbnail & Name */}
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

                    {/* Type Badge */}
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

                    {/* Location */}
                    <td className="py-3.5 px-3">
                      <UnifiedLocationCell item={item} pageContext="unused" />
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
                          download={item.filename}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>

                        <button 
                          onClick={() => handleMoveToTrash(item.id)}
                          disabled={scanStatus.isRunning || item.pending}
                          className={`p-1.5 text-amber-600 rounded-md transition-colors ${
                            (scanStatus.isRunning || item.pending)
                              ? 'opacity-40 cursor-not-allowed'
                              : 'hover:bg-amber-50 dark:hover:bg-amber-950/60 cursor-pointer'
                          }`}
                          title={(scanStatus.isRunning || item.pending) ? "Available when the check finishes" : "Move to Trash"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BOTTOM SELECTION & PAGINATION BAR MATCHING SCREENSHOT */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 text-xs pt-1">
        
        {/* Left Bulk Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 text-gray-600 dark:text-slate-400 font-medium mr-2">
            <span className="font-bold text-gray-900 dark:text-white">{selectedIds.length}</span>
            <span>files selected ({formatBytes(selectedBytes)})</span>
          </div>

          <button 
            onClick={handleToggleSelectCurrentPage}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-[#1e293b] text-gray-700 dark:text-slate-200 px-3 py-1.5 rounded-lg font-semibold cursor-pointer shadow-sm"
          >
            {isAllCurrentPageSelected ? 'Deselect page' : 'Select page'}
          </button>

          <button 
            onClick={() => handleMoveSelectedToTrash(selectedIds)}
            disabled={selectedIds.length === 0 || scanStatus.isRunning}
            title={scanStatus.isRunning ? "Available when the scan finishes" : "Move to Trash"}
            className={`bg-white text-amber-600 border border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/15 dark:bg-slate-800 dark:border-amber-900 dark:text-amber-400 px-3 py-1.5 rounded-lg font-bold shadow-sm ${
              selectedIds.length === 0 || scanStatus.isRunning
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer'
            }`}
          >
            Move to Trash
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
      </>
    )}
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
                {previewItem.url && previewItem.url !== '#' && (previewItem.category === 'images' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes((previewItem.extension || '').toLowerCase())) ? (
                  <img 
                    src={previewItem.url} 
                    alt={previewItem.title || previewItem.filename} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="text-[#8f97a9] text-sm flex flex-col items-center gap-2 p-4 text-center">
                    <FileText className="w-12 h-12 opacity-50" />
                    <span className="font-bold text-white truncate max-w-[300px]" title={previewItem.filename}>{previewItem.filename}</span>
                    <span>No preview for this file type</span>
                  </div>
                )}
              </div>

              {/* Path */}
              <div className="mt-[22px] bg-[#181b25] border border-white/5 rounded-[10px] text-[#8f97a9] text-[13px] py-[14px] px-[16px] overflow-hidden text-ellipsis whitespace-nowrap">
                {getRealFilePath(previewItem)}
              </div>

              {/* Grid Cards */}
              <div className="grid grid-cols-2 gap-[16px] mt-[22px] mb-4">
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

                {/* Reason */}
                <div className="relative bg-[#191c25] border border-white/6 rounded-[12px] pt-[18px] px-[18px] pb-[16px] overflow-hidden before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[4px] before:rounded-l-[12px] before:bg-[#ff3ea5]">
                  <div className="text-[#737b8d] text-[11px] tracking-[1.4px] uppercase mb-[8px] font-normal">Reason</div>
                  <div className="text-[17px] font-semibold text-white leading-[1.45]">File is not used anywhere on this WordPress site.</div>
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
              <button
                onClick={() => {
                  if (scanStatus.isRunning) return;
                  handleMoveToTrash(previewItem.id);
                  setPreviewItem(null);
                }}
                disabled={scanStatus.isRunning}
                title={scanStatus.isRunning ? "Available when the scan finishes" : "Move to Trash"}
                className={`h-[44px] px-[22px] rounded-[10px] text-[15px] font-semibold transition-colors border-none text-white bg-[#2b3f7b] hover:bg-[#3550a0] flex items-center gap-2 ${
                  scanStatus.isRunning
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
              >
                <Trash2 className="w-4 h-4 text-white shrink-0" />
                <span>Move to Trash</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Warning Confirmation Modals */}
      <SingleUsageWarningModal
        isOpen={Boolean(singleWarningTarget)}
        item={singleWarningTarget}
        lastScanFormatted={singleWarningScanDate}
        onConfirmTrash={() => {
          if (singleWarningTarget) {
            executeMoveToTrash(singleWarningTarget.attachment_id);
            setSingleWarningTarget(null);
          }
        }}
        onCancel={() => setSingleWarningTarget(null)}
        onRescanNow={onRescan}
        isDarkMode={isDarkMode}
      />

      <BulkUsageWarningModal
        isOpen={Boolean(bulkWarningData)}
        totalSelected={bulkWarningData?.totalSelected || 0}
        safeItems={bulkWarningData?.safeItems || []}
        usedItems={bulkWarningData?.usedItems || []}
        lastScanFormatted={bulkWarningData?.lastScanFormatted || 'Never scanned'}
        onTrashSafeOnly={() => {
          if (bulkWarningData && bulkWarningData.safeItems.length > 0) {
            const safeIds = bulkWarningData.safeItems.map(i => i.attachment_id);
            executeMoveSelectedToTrash(safeIds);
            setBulkWarningData(null);
          }
        }}
        onTrashUsedAnyway={(includeProtected: boolean) => {
          if (bulkWarningData) {
            const genuineUsed = bulkWarningData.usedItems.filter(i =>
              !(i.locations && i.locations.length > 0 && i.locations.every(loc => loc.field_type === 'min_age_rule' || loc.field_type === 'exclusion_rule'))
            );
            const protectedOnly = bulkWarningData.usedItems.filter(i =>
              i.locations && i.locations.length > 0 && i.locations.every(loc => loc.field_type === 'min_age_rule' || loc.field_type === 'exclusion_rule')
            );
            const idsToSend = [
              ...bulkWarningData.safeItems.map(i => i.attachment_id),
              ...genuineUsed.map(i => i.attachment_id),
              ...(includeProtected ? protectedOnly.map(i => i.attachment_id) : [])
            ];
            executeMoveSelectedToTrash(idsToSend, true, includeProtected);
            setBulkWarningData(null);
          }
        }}
        onCancel={() => setBulkWarningData(null)}
        onRescanNow={onRescan}
      />

      {/* Unverified Usage Warning Modal (Fail-Safe when check throws or fails) */}
      {unverifiedWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div 
            className={`border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col ${
              isDarkMode ? 'bg-slate-900 border-amber-700/80 text-slate-100' : 'bg-white border-amber-300 text-slate-900'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unverified-warning-title"
          >
            {/* Header */}
            <div className={`px-6 pt-5 pb-4 border-b flex items-start justify-between ${
              isDarkMode ? 'border-slate-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="unverified-warning-title" className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Couldn't Verify File Usage
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Usage check could not be completed before trashing.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUnverifiedWarning(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/50 rounded-lg text-amber-900 dark:text-amber-200">
                <p className="font-semibold text-xs leading-relaxed">
                  {unverifiedWarning.type === 'single'
                    ? "Couldn't verify whether this file is in use due to a connection issue. Proceed with caution."
                    : `Couldn't verify whether these ${unverifiedWarning.ids.length} files are in use due to a connection issue. Proceed with caution.`
                  }
                </p>
                {unverifiedWarning.errorMessage && (
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 font-mono mt-1">
                    Details: {unverifiedWarning.errorMessage}
                  </p>
                )}
              </div>

              {unverifiedWarning.type === 'single' && unverifiedWarning.item && (
                <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-lg p-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Target Media</span>
                  <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {unverifiedWarning.item.title || unverifiedWarning.item.filename}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {unverifiedWarning.item.filename} (ID: {unverifiedWarning.item.id})
                  </div>
                </div>
              )}

              {unverifiedWarning.type === 'bulk' && (
                <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-lg p-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Selected Batch</span>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    {unverifiedWarning.ids.length} items queued for trash
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    IDs: {unverifiedWarning.ids.slice(0, 10).join(', ')}{unverifiedWarning.ids.length > 10 ? '...' : ''}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                If you proceed without verification, active pages or posts referencing these files might experience broken media assets.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setUnverifiedWarning(null)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={() => {
                  if (unverifiedWarning.type === 'single') {
                    executeMoveToTrash(unverifiedWarning.ids[0]);
                  } else {
                    executeMoveSelectedToTrash(unverifiedWarning.ids);
                  }
                  setUnverifiedWarning(null);
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Trash Anyway</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AgeProtectedTrashConfirmModal
        isOpen={!!ageProtectedConfirm}
        onClose={() => setAgeProtectedConfirm(null)}
        onConfirm={() => {
          if (ageProtectedConfirm) {
            executeMoveToTrash(ageProtectedConfirm.id);
          }
        }}
        ageLabel={ageProtectedConfirm?.ageLabel ?? ''}
      />

    </div>
  );
};
