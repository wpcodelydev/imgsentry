import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MediaItem, PluginSettings } from '../types';
import { MediaPreview160 } from './MediaPreview160';
import { MediaPreview80 } from './MediaPreview80';
import { getRealFilePath, mapPhpItemToMediaItem } from '../utils/fileUtils';
import { UnifiedLocationCell } from './UnifiedLocationCell';
import { getProFeatures, ProLockBadge, UpgradePromptModal, isProRequiredError } from './ProLock';
import { 
  Trash2, 
  RotateCcw, 
  RefreshCw, 
  SlidersHorizontal, 
  PieChart, 
  FileText, 
  Video, 
  Image as ImageIcon, 
  Calendar, 
  AlertTriangle, 
  Search, 
  Grid, 
  List, 
  Download, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Eye,
  X,
  Clock,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface TrashTabProps {
  mediaList: MediaItem[];
  onRestore: (id: number) => void;
  onDeletePermanently: (idOrIds: number | number[]) => void;
  onEmptyTrash: () => void;
  onExportCSV: (selectedIds?: number[]) => void;
  onNavigateToSettings: (subTab?: 'general' | 'scan' | 'types' | 'delete' | 'backup' | 'schedule' | 'performance' | 'notification' | 'security' | 'advanced') => void;
  isDarkMode?: boolean;
  settings?: PluginSettings;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  dataRevision?: number;
  isActive?: boolean;
  refreshSignal?: number;
}

export const TrashTab: React.FC<TrashTabProps> = ({
  mediaList,
  onRestore,
  onDeletePermanently,
  onEmptyTrash,
  onExportCSV,
  onNavigateToSettings,
  isDarkMode = false,
  settings,
  isRefreshing = false,
  onRefresh,
  dataRevision,
  isActive,
  refreshSignal,
}) => {
  // Category Tab
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'documents' | 'videos' | 'others'>('all');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [bulkAction, setBulkAction] = useState<string>('');

  // Pro Features & Lock State
  const pro = getProFeatures();
  const bulkLocked = !pro.features.trash_bulk_actions;
  const [upgradeModal, setUpgradeModal] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({
    open: false,
    title: '',
    message: '',
  });

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Confirmation Modals
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'single' | 'bulk' | 'empty';
    idOrIds?: number | number[];
    item?: MediaItem;
    count?: number;
  } | null>(null);

  // Handle Escape key to close deletion confirmation modal
  useEffect(() => {
    if (!deleteConfirmTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDeleteConfirmTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirmTarget]);

  // Batch Operation Progress State (Fix 3: Batch bulk delete / empty trash)
  const [batchProgress, setBatchProgress] = useState<{
    isActive: boolean;
    title: string;
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    currentBatch: number;
    totalBatches: number;
    statusText: string;
    isError: boolean;
    errorMessage?: string;
    isComplete: boolean;
  } | null>(null);

  // Server-side pagination state (matching UsedFilesTab & UnusedFilesTab)
  const isWp = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData);
  const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(30);
  const [serverItems, setServerItems] = useState<MediaItem[]>([]);
  const [serverTotal, setServerTotal] = useState<number>(0);
  const [serverTotalPages, setServerTotalPages] = useState<number>(1);
  const [serverStats, setServerStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [backendLocationOptions, setBackendLocationOptions] = useState<{ value: string; label: string; count: number }[]>([]);
  const hasLoadedOnceRef = useRef<boolean>(false);

  const fetchLocationOptions = useCallback(() => {
    if (!isWp || !imgsentryData) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    if (!ajaxUrl) return;

    const fd = new FormData();
    fd.append('action', 'imgsentry_get_distinct_trash_locations');
    fd.append('status', 'trash');
    fd.append('nonce', imgsentryData.nonce || '');

    fetch(ajaxUrl, { method: 'POST', body: fd })
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.options)) {
          setBackendLocationOptions(json.data.options);
        }
      })
      .catch(err => {
        console.error('Error fetching distinct trash locations:', err);
      });
  }, [isWp, imgsentryData]);

  useEffect(() => {
    fetchLocationOptions();
  }, [fetchLocationOptions]);

  const fetchTrashedFiles = useCallback(async (page: number, search: string) => {
    if (!imgsentryData || (!imgsentryData.ajax_url && !imgsentryData.ajaxUrl)) return;
    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    setIsLoading(true);
    setFetchError(null);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_fetch_media');
      fd.append('status', 'trash');
      fd.append('page', String(page));
      fd.append('per_page', String(pageSize));
      if (search.trim()) fd.append('search', search.trim());

      if (activeTab !== 'all') {
        fd.append('type', activeTab);
      } else if (fileTypeFilter !== 'all') {
        fd.append('type', fileTypeFilter);
      }

      if (dateFilter !== 'all') {
        fd.append('date_range', dateFilter);
      }
      if (locationFilter !== 'all') {
        fd.append('location_type', locationFilter);
      }
      if (sizeFilter !== 'all') {
        fd.append('size_range', sizeFilter);
      }
      if (statusFilter !== 'all') {
        fd.append('trash_status', statusFilter);
      }

      fd.append('nonce', imgsentryData.nonce || '');

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success && json.data) {
        const mapped = (json.data.items || []).map((item: any) => mapPhpItemToMediaItem(item));
        setServerItems(mapped);
        setServerTotal(Number(json.data.total) || 0);
        setServerTotalPages(Number(json.data.pages) || 1);
        if (json.data.stats) {
          setServerStats(json.data.stats);
        }
        hasLoadedOnceRef.current = true;
      } else {
        throw new Error(json.data?.message || 'Failed to fetch trash items.');
      }
    } catch (e: any) {
      console.error('Error fetching trashed files:', e);
      setFetchError(e.message || 'Error loading trashed media items.');
    } finally {
      setIsLoading(false);
    }
  }, [imgsentryData, pageSize, activeTab, fileTypeFilter, locationFilter, sizeFilter, dateFilter, statusFilter]);

  useEffect(() => {
    if (!isWp) {
      hasLoadedOnceRef.current = true;
    }
  }, [isWp]);

  useEffect(() => {
    if (isWp) {
      fetchTrashedFiles(currentPage, searchQuery);
    }
  }, [currentPage, searchQuery, isWp, fetchTrashedFiles]);

  const lastSyncedRevisionRef = useRef<number>(dataRevision ?? 0);
  const prevIsActiveRef = useRef<boolean>(isActive ?? false);

  useEffect(() => {
    const justBecameActive = Boolean(isActive) && !prevIsActiveRef.current;
    if (isWp && justBecameActive && dataRevision !== undefined && dataRevision !== lastSyncedRevisionRef.current) {
      lastSyncedRevisionRef.current = dataRevision;
      fetchTrashedFiles(currentPage, searchQuery);
    }
    prevIsActiveRef.current = Boolean(isActive);
  }, [isActive, dataRevision]);

  // Refetch when parent signals refresh via top bar Refresh button
  const prevRefreshSignalRef = useRef<number | undefined>(refreshSignal);
  useEffect(() => {
    if (prevRefreshSignalRef.current !== undefined && refreshSignal !== undefined && refreshSignal !== prevRefreshSignalRef.current) {
      if (isWp) {
        fetchTrashedFiles(currentPage, searchQuery);
        fetchLocationOptions();
      }
    }
    prevRefreshSignalRef.current = refreshSignal;
  }, [refreshSignal, isWp, currentPage, searchQuery, fetchTrashedFiles, fetchLocationOptions]);

  const handleManualRefresh = () => {
    if (isWp) {
      fetchTrashedFiles(currentPage, searchQuery);
      fetchLocationOptions();
    }
    if (onRefresh) {
      onRefresh();
    }
  };

  // Filter trashed items (simulator fallback)
  const trashedItems = useMemo(
    () => mediaList.filter(i => i.isTrashed),
    [mediaList]
  );

  // Dynamic location options for simulator mode
  const mockLocationOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    trashedItems.forEach(item => {
      let loc = (item.location || '').trim();
      loc = loc.replace(/^wp-content\/uploads\//i, '').replace(/^\/+|\/+$/g, '');
      const parts = loc.split('/');
      const folderKey = parts.length > 1 ? parts.slice(0, -1).join('/') : (loc ? parts[0] : 'root');
      const normKey = folderKey.toLowerCase() === 'root' || !folderKey ? 'root' : folderKey;
      counts[normKey] = (counts[normKey] || 0) + 1;
    });

    return Object.entries(counts).map(([folder, count]) => ({
      value: folder,
      label: folder === 'root' ? 'Uploads Root' : folder,
      count,
    }));
  }, [trashedItems]);

  const locationOptions = isWp ? backendLocationOptions : mockLocationOptions;

  // Keep selectedIds in sync with available items
  useEffect(() => {
    setSelectedIds(prev => {
      const validItems = isWp ? serverItems : trashedItems;
      const validIds = prev.filter(id => validItems.some(item => item.id === id));
      if (validIds.length === prev.length && validIds.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return validIds;
    });
  }, [trashedItems, serverItems, isWp]);

  // Dynamic calculations with real values
  const hasCategoryBreakdown = isWp && serverStats?.trashed_category_breakdown;

  const totalTrashedCount = (isWp && serverStats?.trashed_media !== undefined)
    ? Number(serverStats.trashed_media)
    : trashedItems.length;

  const imagesCount = hasCategoryBreakdown
    ? Number(serverStats.trashed_category_breakdown.images?.count || 0)
    : trashedItems.filter(i => i.category === 'images').length;

  const docsCount = hasCategoryBreakdown
    ? Number(serverStats.trashed_category_breakdown.documents?.count || 0)
    : trashedItems.filter(i => i.category === 'documents').length;

  const videosCount = hasCategoryBreakdown
    ? Number(serverStats.trashed_category_breakdown.video?.count || 0)
    : trashedItems.filter(i => i.category === 'video').length;

  const othersCount = hasCategoryBreakdown
    ? Number(serverStats.trashed_category_breakdown.other?.count || 0) +
      Number(serverStats.trashed_category_breakdown.audio?.count || 0) +
      Number(serverStats.trashed_category_breakdown.fonts?.count || 0)
    : trashedItems.filter(i => i.category !== 'images' && i.category !== 'documents' && i.category !== 'video').length;

  const totalTrashedSize = (isWp && serverStats?.trashed_size !== undefined)
    ? Number(serverStats.trashed_size)
    : trashedItems.reduce((acc, i) => acc + (i.fileSize || 0), 0);

  const imagesSize = hasCategoryBreakdown
    ? Number(serverStats.trashed_category_breakdown.images?.size || 0)
    : trashedItems.filter(i => i.category === 'images').reduce((acc, i) => acc + (i.fileSize || 0), 0);

  const docsSize = hasCategoryBreakdown
    ? Number(serverStats.trashed_category_breakdown.documents?.size || 0)
    : trashedItems.filter(i => i.category === 'documents').reduce((acc, i) => acc + (i.fileSize || 0), 0);

  const videosSize = hasCategoryBreakdown
    ? Number(serverStats.trashed_category_breakdown.video?.size || 0)
    : trashedItems.filter(i => i.category === 'video').reduce((acc, i) => acc + (i.fileSize || 0), 0);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0 || !Number.isFinite(bytes) || bytes < 1) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
    return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(2)) + ' ' + sizes[safeIndex];
  };

  // Filtered items for display with bug fixes applied
  const filteredItems = trashedItems.filter(item => {
    // 1. Category tab filter
    if (activeTab === 'images' && item.category !== 'images') return false;
    if (activeTab === 'documents' && item.category !== 'documents') return false;
    if (activeTab === 'videos' && item.category !== 'video') return false;
    if (activeTab === 'others' && (item.category === 'images' || item.category === 'documents' || item.category === 'video')) return false;

    // 2. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !item.filename.toLowerCase().includes(q)) {
        return false;
      }
    }

    // 3. File type filter
    if (fileTypeFilter !== 'all' && item.category !== fileTypeFilter) return false;

    // 4. Location Filter (Real subfolder aware)
    if (locationFilter !== 'all') {
      let itemLoc = (item.location || '').toLowerCase();
      itemLoc = itemLoc.replace(/^wp-content\/uploads\//i, '').replace(/^\/+|\/+$/g, '');
      const locFilter = locationFilter.toLowerCase();
      if (locFilter === 'root') {
        if (itemLoc.includes('/') && itemLoc !== 'root') return false;
      } else {
        if (!itemLoc.includes(locFilter)) return false;
      }
    }

    // 5. Size Filter (Fixed: <500KB, 500KB-2MB, and >2MB Large)
    if (sizeFilter !== 'all') {
      const size = item.fileSize || 0;
      if (sizeFilter === 'small' && size >= 500 * 1024) return false;
      if (sizeFilter === 'medium' && (size < 500 * 1024 || size > 2 * 1024 * 1024)) return false;
      if (sizeFilter === 'large' && size <= 2 * 1024 * 1024) return false;
    }

    // 6. Date Filter (Fixed: Real Date object comparisons for 'today' and 'this_month')
    if (dateFilter !== 'all') {
      const rawDateStr = item.trashedDate || item.uploadDate || '';
      const itemDate = rawDateStr ? new Date(rawDateStr) : null;
      if (!itemDate || isNaN(itemDate.getTime())) {
        return false;
      }

      const now = new Date();

      if (dateFilter === 'today') {
        const isToday = 
          itemDate.getFullYear() === now.getFullYear() &&
          itemDate.getMonth() === now.getMonth() &&
          itemDate.getDate() === now.getDate();
        if (!isToday) return false;
      } else if (dateFilter === 'this_month') {
        const isThisMonth = 
          itemDate.getFullYear() === now.getFullYear() &&
          itemDate.getMonth() === now.getMonth();
        if (!isThisMonth) return false;
      }
    }

    // 7. Status Filter (Fixed: Real status filter logic based on retention and days in trash)
    if (statusFilter !== 'all') {
      const maxDays = settings?.retentionDays || 7;
      const daysInTrash = typeof item.daysInTrash === 'number' ? item.daysInTrash : 0;
      const daysLeft = Math.max(0, maxDays - daysInTrash);

      if (statusFilter === 'expiring_soon' && daysLeft > 3) return false;
      if (statusFilter === 'trashed_today' && daysInTrash !== 0) return false;
      if (statusFilter === 'safe' && daysLeft <= 3) return false;
    }

    return true;
  });

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, fileTypeFilter, locationFilter, sizeFilter, dateFilter, activeTab, statusFilter, pageSize]);

  // Pagination calculations
  const totalItems = isWp ? serverTotal : filteredItems.length;
  const displayedTotal = totalItems;
  const totalPages = isWp ? (serverTotalPages || Math.ceil(serverTotal / pageSize) || 1) : (Math.ceil(filteredItems.length / pageSize) || 1);
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);
  const itemsToDisplay = isWp ? serverItems : paginatedItems;

  // Selected items bytes calculation
  const selectedTrashedItems = useMemo(
    () => (isWp ? serverItems : trashedItems).filter(i => selectedIds.includes(i.id)),
    [trashedItems, serverItems, selectedIds, isWp]
  );
  const totalSelectedBytes = selectedTrashedItems.reduce((acc, i) => acc + (i.fileSize || 0), 0);

  // Page selection handlers
  const isAllCurrentPageSelected = itemsToDisplay.length > 0 && itemsToDisplay.every(i => selectedIds.includes(i.id));

  const handleToggleSelectCurrentPage = () => {
    const currentPageIds = itemsToDisplay.map(i => i.id);
    if (isAllCurrentPageSelected) {
      setSelectedIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const isAllFilteredSelected = itemsToDisplay.length > 0 && itemsToDisplay.every(i => selectedIds.includes(i.id));

  const selectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(itemsToDisplay.map(i => i.id));
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleRestore = (id: number) => {
    onRestore(id);
    setSelectedIds(prev => prev.filter(i => i !== id));
    if (isWp) {
      setServerItems(prev => prev.filter(i => i.id !== id));
      setServerTotal(prev => Math.max(0, prev - 1));
      setServerStats(prev => prev ? { ...prev, trashed_media: Math.max(0, (Number(prev.trashed_media) || 0) - 1) } : prev);
    }
  };

  // Safe delete with confirmation check
  const requestDeletePermanently = (item: MediaItem) => {
    setDeleteConfirmTarget({
      type: 'single',
      idOrIds: item.id,
      item: item
    });
  };

  const requestBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (bulkLocked && selectedIds.length > 1) {
      setUpgradeModal({
        open: true,
        title: 'Bulk Delete is a Pro Feature',
        message: 'Deleting multiple files permanently at once requires ImgSentry Pro.',
      });
      return;
    }
    setDeleteConfirmTarget({
      type: 'bulk',
      idOrIds: [...selectedIds],
      count: selectedIds.length
    });
  };

  const requestEmptyTrash = () => {
    if (bulkLocked) {
      setUpgradeModal({
        open: true,
        title: 'Empty Trash is a Pro Feature',
        message: 'Upgrade to Pro to instantly empty your entire trash bin with a single click.',
      });
      return;
    }
    if (totalTrashedCount === 0) return;
    setDeleteConfirmTarget({
      type: 'empty',
      count: totalTrashedCount
    });
  };

  const executeBatchedBulkDelete = async (idsToDelete: number[]) => {
    const total = idsToDelete.length;
    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    if (total <= BATCH_SIZE) {
      // Small selection: execute directly with single call, no visible batching modal needed
      onDeletePermanently(idsToDelete);
      setSelectedIds([]);
      return;
    }

    // Large selection (> 50 items): show progress indicator and process in sequential AJAX batches
    setBatchProgress({
      isActive: true,
      title: 'Bulk Permanent Deletion',
      total,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentBatch: 1,
      totalBatches,
      statusText: `Deleting 1 to ${Math.min(BATCH_SIZE, total)} of ${total} items...`,
      isError: false,
      isComplete: false,
    });

    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const ajaxUrl = imgsentryData?.ajax_url || imgsentryData?.ajaxUrl;

    let processedCount = 0;
    let succeededCount = 0;
    let failedCount = 0;
    const successfullyDeletedIds: number[] = [];

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchIds = idsToDelete.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
      const batchNum = batchIndex + 1;
      const currentStart = batchIndex * BATCH_SIZE + 1;
      const currentEnd = Math.min((batchIndex + 1) * BATCH_SIZE, total);

      setBatchProgress(prev => prev ? ({
        ...prev,
        currentBatch: batchNum,
        statusText: `Deleting ${currentStart} to ${currentEnd} of ${total} items... (Batch ${batchNum} of ${totalBatches})`,
      }) : null);

      try {
        if (ajaxUrl && imgsentryData?.nonce) {
          const fd = new FormData();
          fd.append('action', 'imgsentry_bulk_action');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('bulk_action', 'delete_permanent');
          fd.append('batch_size', String(BATCH_SIZE));
          fd.append('offset', '0');
          batchIds.forEach(id => fd.append('ids[]', String(id)));

          const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
          const json = await res.json();

          if (!res.ok || !json.success) {
            if (isProRequiredError(json)) {
              setUpgradeModal({
                open: true,
                title: 'Pro Feature Required',
                message: json?.data?.message || 'Bulk permanent deletion requires ImgSentry Pro.',
              });
              setBatchProgress(null);
              return;
            }
            throw new Error(json?.data?.message || `Server returned HTTP ${res.status}`);
          }

          const deletedInBatch: number[] = json.data?.processed_ids || batchIds;
          const failedInBatch: number[] = json.data?.failed_ids || [];

          succeededCount += deletedInBatch.length;
          failedCount += failedInBatch.length;
          processedCount += batchIds.length;
          successfullyDeletedIds.push(...deletedInBatch);

          onDeletePermanently(deletedInBatch);
        } else {
          // Simulator fallback: simulated chunk execution
          await new Promise(r => setTimeout(r, 280));
          succeededCount += batchIds.length;
          processedCount += batchIds.length;
          successfullyDeletedIds.push(...batchIds);
          onDeletePermanently(batchIds);
        }

        setBatchProgress(prev => prev ? ({
          ...prev,
          processed: processedCount,
          succeeded: succeededCount,
          failed: failedCount,
        }) : null);

      } catch (err: any) {
        console.error('Batch deletion failed at batch', batchNum, err);
        const remaining = total - processedCount;
        setBatchProgress(prev => prev ? ({
          ...prev,
          isError: true,
          errorMessage: `Batch ${batchNum} encountered an error: ${err.message || 'Network error'}. ${succeededCount} items permanently deleted. ${remaining} items remaining in trash.`,
          statusText: `Stopped at ${processedCount} of ${total} items due to error.`,
        }) : null);
        setSelectedIds(prev => prev.filter(id => !successfullyDeletedIds.includes(id)));
        return;
      }
    }

    setSelectedIds(prev => prev.filter(id => !successfullyDeletedIds.includes(id)));

    const completionStatus = failedCount > 0
      ? `Bulk deletion finished: ${succeededCount} permanently deleted, ${failedCount} failed.`
      : `Successfully permanently deleted all ${succeededCount} items!`;

    setBatchProgress(prev => prev ? ({
      ...prev,
      isComplete: true,
      statusText: completionStatus,
    }) : null);

    setTimeout(() => {
      setBatchProgress(prev => (prev?.isComplete && !prev?.isError ? null : prev));
    }, 1500);
  };

  const executeBatchedEmptyTrash = async (trashedIdsToEmpty: number[]) => {
    const initialTotal = trashedIdsToEmpty.length;
    const BATCH_SIZE = 50;

    if (initialTotal <= BATCH_SIZE) {
      // Small trash bin: execute directly with single call, no visible batching modal needed
      onEmptyTrash();
      setSelectedIds([]);
      return;
    }

    // Large trash bin (> 50 items): show progress indicator and process in sequential AJAX batches
    const estimatedBatches = Math.ceil(initialTotal / BATCH_SIZE);
    setBatchProgress({
      isActive: true,
      title: 'Emptying Trash Bin',
      total: initialTotal,
      processed: 0,
      succeeded: 0,
      failed: 0,
      currentBatch: 1,
      totalBatches: estimatedBatches,
      statusText: `Deleting batch 1 of items...`,
      isError: false,
      isComplete: false,
    });

    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const ajaxUrl = imgsentryData?.ajax_url || imgsentryData?.ajaxUrl;

    let processedCount = 0;
    let succeededCount = 0;
    let failedCount = 0;
    let currentTotal = initialTotal;
    let batchNumber = 0;
    let hasMore = true;
    const MAX_BATCH_ITERATIONS = 200; // Safety cap against infinite loops

    while (hasMore && batchNumber < MAX_BATCH_ITERATIONS) {
      batchNumber++;

      setBatchProgress(prev => prev ? ({
        ...prev,
        currentBatch: batchNumber,
        statusText: `Deleting batch ${batchNumber}... (${succeededCount} deleted, ${Math.max(0, currentTotal - processedCount)} remaining)`,
      }) : null);

      try {
        if (ajaxUrl && imgsentryData?.nonce) {
          const fd = new FormData();
          fd.append('action', 'imgsentry_empty_trash');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('batch_size', String(BATCH_SIZE));
          fd.append('offset', '0'); // Offset is always 0 as deleted items are removed from trash query results

          const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
          const json = await res.json();

          if (!res.ok || !json.success) {
            if (isProRequiredError(json)) {
              setUpgradeModal({
                open: true,
                title: 'Pro Feature Required',
                message: json?.data?.message || 'Emptying the trash bin requires ImgSentry Pro.',
              });
              setBatchProgress(null);
              return;
            }
            throw new Error(json?.data?.message || `Server returned HTTP ${res.status}`);
          }

          const batchData = json.data || {};
          const deletedInBatch: number[] = Array.isArray(batchData.deleted_ids) ? batchData.deleted_ids : (batchData.processed_ids || []);
          const failedInBatch: number[] = Array.isArray(batchData.failed_ids) ? batchData.failed_ids : [];
          const batchProcessed = typeof batchData.processed_count === 'number' ? batchData.processed_count : (deletedInBatch.length + failedInBatch.length);
          const batchSucceeded = deletedInBatch.length;
          const batchFailed = typeof batchData.failed_count === 'number' ? batchData.failed_count : failedInBatch.length;

          succeededCount += batchSucceeded;
          failedCount += batchFailed;
          processedCount += (batchProcessed > 0 ? batchProcessed : batchSucceeded + batchFailed);

          if (typeof batchData.total === 'number' && batchData.total > 0) {
            currentTotal = batchData.total;
          }

          if (deletedInBatch.length > 0) {
            onDeletePermanently(deletedInBatch);
          }

          // Determine if there are more items from server's explicit response
          if (typeof batchData.has_more === 'boolean') {
            hasMore = batchData.has_more;
          } else if (typeof batchData.remaining === 'number') {
            hasMore = batchData.remaining > 0;
          } else {
            hasMore = (deletedInBatch.length >= BATCH_SIZE);
          }

          // If nothing was processed or deleted in this batch, terminate loop to prevent looping on stuck items
          if (batchProcessed === 0 && deletedInBatch.length === 0) {
            hasMore = false;
          }

        } else {
          // Simulator fallback: simulate sequential chunk deletion
          await new Promise(r => setTimeout(r, 280));
          const startIndex = (batchNumber - 1) * BATCH_SIZE;
          const batchIds = trashedIdsToEmpty.slice(startIndex, startIndex + BATCH_SIZE);

          if (batchIds.length === 0) {
            hasMore = false;
            break;
          }

          succeededCount += batchIds.length;
          processedCount += batchIds.length;
          onDeletePermanently(batchIds);

          hasMore = (startIndex + batchIds.length) < trashedIdsToEmpty.length;
        }

        setBatchProgress(prev => prev ? ({
          ...prev,
          total: Math.max(currentTotal, processedCount),
          processed: processedCount,
          succeeded: succeededCount,
          failed: failedCount,
          totalBatches: Math.max(prev.totalBatches, batchNumber),
        }) : null);

      } catch (err: any) {
        console.error('Batch empty trash failed at batch', batchNumber, err);
        const remaining = Math.max(0, currentTotal - succeededCount);
        setBatchProgress(prev => prev ? ({
          ...prev,
          isError: true,
          errorMessage: `Batch ${batchNumber} encountered an error: ${err.message || 'Network error'}. ${succeededCount} items permanently deleted. ${remaining} items remaining in trash.`,
          statusText: `Stopped at batch ${batchNumber} due to error.`,
        }) : null);
        return;
      }
    }

    if (batchNumber >= MAX_BATCH_ITERATIONS && hasMore) {
      setBatchProgress(prev => prev ? ({
        ...prev,
        isError: true,
        errorMessage: `Safety limit of ${MAX_BATCH_ITERATIONS} batches reached. ${succeededCount} deleted, some items may remain in trash.`,
        statusText: `Reached max iteration safety limit (${MAX_BATCH_ITERATIONS} batches).`,
      }) : null);
      return;
    }

    onEmptyTrash();
    setSelectedIds([]);

    const completionStatus = failedCount > 0
      ? `Emptied trash: ${succeededCount} deleted, ${failedCount} failed and remain in trash.`
      : `Successfully emptied Trash! All ${succeededCount} items permanently purged.`;

    setBatchProgress(prev => prev ? ({
      ...prev,
      isComplete: true,
      statusText: completionStatus,
    }) : null);

    setTimeout(() => {
      setBatchProgress(prev => (prev?.isComplete && !prev?.isError ? null : prev));
    }, 1500);
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmTarget) return;

    if (deleteConfirmTarget.type === 'single' && typeof deleteConfirmTarget.idOrIds === 'number') {
      onDeletePermanently(deleteConfirmTarget.idOrIds);
      setSelectedIds(prev => prev.filter(i => i !== deleteConfirmTarget.idOrIds));
    } else if (deleteConfirmTarget.type === 'bulk' && Array.isArray(deleteConfirmTarget.idOrIds)) {
      executeBatchedBulkDelete(deleteConfirmTarget.idOrIds);
    } else if (deleteConfirmTarget.type === 'empty') {
      executeBatchedEmptyTrash(trashedItems.map(i => i.id));
    }

    setDeleteConfirmTarget(null);
  };

  const handleApplyBulk = () => {
    if (selectedIds.length === 0 || !bulkAction) return;
    if (bulkLocked && selectedIds.length > 1) {
      setUpgradeModal({
        open: true,
        title: bulkAction === 'restore' ? 'Bulk Restore is a Pro Feature' : 'Bulk Delete is a Pro Feature',
        message: 'Bulk operations on multiple items require ImgSentry Pro.',
      });
      return;
    }
    if (bulkAction === 'restore') {
      selectedIds.forEach(id => onRestore(id));
      setSelectedIds([]);
      setBulkAction('');
    } else if (bulkAction === 'delete') {
      requestBulkDelete();
      setBulkAction('');
    }
  };

  // Fix 1: Days Left badge ALWAYS uses real item.daysInTrash and shows Unknown if missing/NaN
  const getTimeLeftBadge = (daysInTrash?: number) => {
    if (typeof daysInTrash !== 'number' || isNaN(daysInTrash)) {
      return (
        <span className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-bold text-[11px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 whitespace-nowrap">
          —
        </span>
      );
    }

    const maxDays = settings?.retentionDays || 7;
    const daysLeft = Math.max(0, maxDays - daysInTrash);
    
    if (daysLeft >= 10) {
      return (
        <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
          {daysLeft} Days Left
        </span>
      );
    } else if (daysLeft >= 3) {
      return (
        <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800 whitespace-nowrap">
          {daysLeft} Days Left
        </span>
      );
    } else if (daysLeft > 0) {
      return (
        <span className="bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-800 whitespace-nowrap">
          {daysLeft} Day{daysLeft > 1 ? 's' : ''} Left
        </span>
      );
    } else {
      return (
        <span className="bg-red-200 text-red-900 dark:bg-red-900/90 dark:text-red-200 font-bold text-[11px] px-2.5 py-1 rounded-md border border-red-300 dark:border-red-700 whitespace-nowrap animate-pulse">
          Expires Today
        </span>
      );
    }
  };

  const renderTypeBadge = (ext: string) => {
    const uppercaseExt = (ext || '').toUpperCase();
    switch (uppercaseExt) {
      case 'JPG':
      case 'JPEG':
        return <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">JPG</span>;
      case 'PNG':
        return <span className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-purple-200 dark:border-purple-800">PNG</span>;
      case 'WEBP':
        return <span className="bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-pink-200 dark:border-pink-800">WEBP</span>;
      case 'PDF':
        return <span className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800">PDF</span>;
      default:
        return <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold text-[11px] px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800">{uppercaseExt || 'FILE'}</span>;
    }
  };

  return (
    <div className="space-y-5 text-gray-900 dark:text-slate-100">

      {/* 1. TOP STAT CARDS ROW (6 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
        {/* Card 1: Total Trashed Files */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Total Trashed Files</span>
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1.5 block leading-none">{totalTrashedCount}</div>
            <div className="text-[12px] font-semibold text-purple-700 bg-purple-100 dark:bg-purple-950/40 dark:text-purple-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 ml-2">
            <Trash2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Total Size */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Total Size</span>
            <div className="text-xl font-black text-emerald-600 dark:text-[#4ade80] mt-1.5 block leading-none">{formatSize(totalTrashedSize)}</div>
            <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-[#4ade80]/15 dark:text-[#4ade80] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Size in Trash
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-[#4ade80]/15 text-emerald-600 dark:text-[#4ade80] flex items-center justify-center shrink-0 ml-2">
            <PieChart className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Images */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Images</span>
            <div className="text-xl font-black text-blue-600 dark:text-[#5B8DEF] mt-1.5 block leading-none">{imagesCount}</div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-[#5B8DEF]/15 dark:text-[#5B8DEF] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files ({formatSize(imagesSize)})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-[#5B8DEF]/15 text-blue-600 dark:text-[#5B8DEF] flex items-center justify-center shrink-0 ml-2">
            <ImageIcon className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Documents */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Documents</span>
            <div className="text-xl font-black text-rose-500 dark:text-[#f87171] mt-1.5 block leading-none">{docsCount}</div>
            <div className="text-[12px] font-semibold text-rose-700 bg-rose-100 dark:bg-[#f87171]/15 dark:text-[#f87171] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files ({formatSize(docsSize)})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-[#f87171]/15 text-rose-600 dark:text-[#f87171] flex items-center justify-center shrink-0 ml-2">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Card 5: Videos */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Videos</span>
            <div className="text-xl font-black text-indigo-600 dark:text-[#8993a8] mt-1.5 block leading-none">{videosCount}</div>
            <div className="text-[12px] font-semibold text-indigo-700 bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files ({formatSize(videosSize)})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-[#8993a8]/15 text-indigo-600 dark:text-[#8993a8] flex items-center justify-center shrink-0 ml-2">
            <Video className="w-6 h-6" />
          </div>
        </div>

        {/* Card 6: Trash Expiry */}
        <div className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Trash Expiry</span>
            <div className="text-xl font-black text-amber-600 dark:text-[#fbbf24] mt-1.5 block leading-none">{settings?.retentionDays || 7} <span className="text-sm font-bold">Days</span></div>
            <div className="text-[12px] font-semibold text-amber-800 bg-amber-100 dark:bg-[#fbbf24]/15 dark:text-[#fbbf24] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Auto delete in
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-[#fbbf24]/15 text-amber-600 dark:text-[#fbbf24] flex items-center justify-center shrink-0 ml-2">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. WARNING ALERT BANNER & GLOBAL ACTIONS */}
      <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-amber-900 dark:text-amber-200 font-medium">
            Files in trash will be permanently deleted after the retention period ({settings?.retentionDays || 7} days). You can restore files or delete them immediately.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onNavigateToSettings('delete')}
            className="bg-white dark:bg-slate-800 hover:bg-amber-100/50 dark:hover:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-3 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer transition-colors"
          >
            Change Expiry Settings
          </button>
        </div>
      </div>

      {/* 3. TABS, SEARCH, AND UTILITY BUTTONS (Refresh, CSV, Empty Trash) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-700 pb-2">
        {/* Category Tabs */}
        <div className="flex items-center gap-6 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'all'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            All ({totalTrashedCount})
          </button>

          <button
            onClick={() => setActiveTab('images')}
            className={`pb-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'images'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Images ({imagesCount})
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`pb-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'documents'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Documents ({docsCount})
          </button>

          <button
            onClick={() => setActiveTab('videos')}
            className={`pb-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'videos'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Videos ({videosCount})
          </button>

          <button
            onClick={() => setActiveTab('others')}
            className={`pb-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'others'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Others ({othersCount})
          </button>
        </div>

        {/* Right Tools: Search & View Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Empty Trash Button */}
          <button
            onClick={requestEmptyTrash}
            disabled={totalTrashedCount === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border ${
              isDarkMode
                ? 'bg-[#1e293b] hover:bg-rose-950/40 !text-rose-400 border-rose-800'
                : 'bg-white hover:bg-rose-50 text-rose-600 border-rose-300'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Empty Trash</span>
            {bulkLocked && <ProLockBadge isDarkMode={isDarkMode} />}
          </button>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search trash files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-3 pr-8 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 w-44 sm:w-56 text-gray-800 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579]"
            />
            <Search className="w-4 h-4 text-gray-400 dark:text-[#5b6579] absolute right-2.5 top-2" />
          </div>

          {/* View Switcher */}
          <div className="flex items-center text-xs border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer ${
                viewMode === 'grid' ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-500'
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer ${
                viewMode === 'list' ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-500'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. FILTER CONTROLS ROW */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
            >
              <option value="">Bulk Actions</option>
              <option value="restore">Restore Selected</option>
              <option value="delete">Delete Permanently</option>
            </select>

            <button
              onClick={handleApplyBulk}
              disabled={selectedIds.length === 0 || !bulkAction}
              className="bg-white hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400! border border-blue-200 dark:border-blue-800 px-3.5 py-1.5 rounded-lg font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
            {bulkLocked && selectedIds.length > 1 && (
              <ProLockBadge isDarkMode={isDarkMode} />
            )}
          </div>

          {/* File Types Dropdown */}
          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
          >
            <option value="all">All File Types</option>
            <option value="images">Images</option>
            <option value="documents">Documents</option>
            <option value="video">Videos</option>
          </select>

          {/* Location Dropdown */}
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
          >
            <option value="all">All Locations ({totalTrashedCount})</option>
            {locationOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </select>

          {/* Fix 2: Size Filter with Large (> 2 MB) option */}
          <select
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
          >
            <option value="all">All Sizes</option>
            <option value="small">&lt; 500 KB</option>
            <option value="medium">500 KB - 2 MB</option>
            <option value="large">&gt; 2 MB</option>
          </select>

          {/* Fix 3: Date Filter with real Date logic */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
          >
            <option value="all">All Dates</option>
            <option value="today">Trashed Today</option>
            <option value="this_month">Trashed This Month</option>
          </select>

          {/* Fix 4: Real status filter options */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium outline-none"
          >
            <option value="all">All Status</option>
            <option value="expiring_soon">Expiring Soon (≤ 3 Days)</option>
            <option value="trashed_today">Trashed Today</option>
            <option value="safe">Safe (&gt; 3 Days Left)</option>
          </select>

          {/* Reset button */}
          {(searchQuery || fileTypeFilter !== 'all' || locationFilter !== 'all' || sizeFilter !== 'all' || dateFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFileTypeFilter('all');
                setLocationFilter('all');
                setSizeFilter('all');
                setDateFilter('all');
                setStatusFilter('all');
              }}
              className="bg-white hover:bg-gray-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* ERROR BANNER IF FETCH FAILED */}
      {fetchError && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* SELECTION INFORMATION BAR */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 px-4 py-2 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-blue-900 dark:text-blue-200">
              {selectedIds.length} of {displayedTotal} selected ({formatSize(totalSelectedBytes)})
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={selectAll}
              className="text-blue-700 dark:text-blue-300 font-extrabold hover:underline cursor-pointer"
            >
              {isAllFilteredSelected ? 'Deselect All' : 'Select All Filtered'}
            </button>
            <span className="text-gray-300 dark:text-slate-600">|</span>
            <button
              onClick={() => {
                if (bulkLocked && selectedIds.length > 1) {
                  setUpgradeModal({
                    open: true,
                    title: 'Bulk Restore is a Pro Feature',
                    message: 'Restoring multiple files at once requires ImgSentry Pro.',
                  });
                  return;
                }
                selectedIds.forEach(id => onRestore(id));
                setSelectedIds([]);
                if (isWp) {
                  fetchTrashedFiles(currentPage, searchQuery);
                }
              }}
              className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restore ({selectedIds.length})</span>
              {bulkLocked && selectedIds.length > 1 && <ProLockBadge isDarkMode={isDarkMode} />}
            </button>
            <button
              onClick={() => onExportCSV(selectedIds)}
              className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>Export Selected ({selectedIds.length})</span>
            </button>
            <button
              onClick={requestBulkDelete}
              className="text-rose-600 dark:text-rose-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete Forever ({selectedIds.length})</span>
              {bulkLocked && selectedIds.length > 1 && <ProLockBadge isDarkMode={isDarkMode} />}
            </button>
          </div>
        </div>
      )}

      {/* MAIN TRASH MEDIA DISPLAY (GRID VIEW OR LIST VIEW) */}
      <div className={`transition-opacity duration-200 ${(isRefreshing || (isLoading && !hasLoadedOnceRef.current)) ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
        {isLoading && !hasLoadedOnceRef.current ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-12 border border-gray-200/90 dark:border-slate-700 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#A61E69] animate-spin" />
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">Loading trashed media items...</span>
          </div>
        ) : (
          <>
            {isLoading && hasLoadedOnceRef.current && (
              <div className="flex items-center gap-2 mb-3 px-3 py-1.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/50 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 w-fit">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                <span>Refreshing...</span>
              </div>
            )}
            {viewMode === 'grid' ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200/90 dark:border-slate-700 shadow-2xs space-y-4">
            {/* Select All On Current Page header bar for Grid View */}
            {itemsToDisplay.length > 0 && (
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none font-bold text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isAllCurrentPageSelected}
                    onChange={handleToggleSelectCurrentPage}
                    className="rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                  />
                  <span>Select all {itemsToDisplay.length} on this page</span>
                </label>

                <span className="text-gray-500 dark:text-slate-400">
                  Showing {displayedTotal === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, displayedTotal)} of {displayedTotal}
                </span>
              </div>
            )}

            {itemsToDisplay.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Trash2 className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                <p className="font-semibold text-sm">Trash is empty</p>
                <p className="text-xs text-gray-500">No items currently match your trash filter criteria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {itemsToDisplay.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3.5 flex flex-col items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/30 shadow-xs'
                          : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 hover:shadow-md'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between mb-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                        />
                        {/* Days Left badge */}
                        {getTimeLeftBadge(item.daysInTrash)}
                      </div>

                      <div className="my-1 cursor-pointer flex justify-center" onClick={() => setPreviewItem(item)}>
                        <MediaPreview160 item={item} />
                      </div>

                      <div className="w-full mt-2.5 text-center">
                        <span className="font-bold text-gray-900 dark:text-white block truncate text-xs" title={item.title}>
                          {item.title}
                        </span>
                        <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-gray-500 dark:text-slate-400 mt-1">
                          <span>{item.formattedSize}</span>
                          {item.dimensions && (
                            <>
                              <span>•</span>
                              <span>{item.dimensions}</span>
                            </>
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5 mt-3 pt-2.5 border-t border-gray-100 dark:border-[#243044]">
                          <button
                            onClick={() => handleRestore(item.id)}
                            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-blue-400 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restore File</span>
                          </button>
                          <button
                            onClick={() => requestDeletePermanently(item)}
                            className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Forever</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200/90 dark:border-slate-700 overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-bold bg-gray-50/70 dark:bg-slate-900/40">
                  <th className="py-3 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      onChange={handleToggleSelectCurrentPage}
                      className="rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                      title={isAllCurrentPageSelected ? "Deselect items on current page" : "Select items on current page"}
                    />
                  </th>
                  <th className="py-3 px-3">File Preview</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Source & Original Location</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Trashed / Upload Date</th>
                  <th className="py-3 px-3">Time Left</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {itemsToDisplay.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <Trash2 className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                      <p className="font-semibold text-sm">Trash is empty</p>
                      <p className="text-xs text-gray-500">No items currently match your trash filter criteria.</p>
                    </td>
                  </tr>
                ) : (
                  itemsToDisplay.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    return (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors ${
                          isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(item.id)}
                            className="rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                          />
                        </td>

                        {/* Thumbnail & File Name */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3.5">
                            <div className="cursor-pointer" onClick={() => setPreviewItem(item)}>
                              <MediaPreview80 item={item} />
                            </div>
                            <div className="min-w-0 max-w-[200px] sm:max-w-[260px]">
                              <span className="font-bold text-gray-900 dark:text-white block truncate text-xs" title={item.title}>
                                {item.title}
                              </span>
                              <span className="text-[11px] text-gray-500 dark:text-slate-400 block truncate font-mono mt-0.5">
                                {getRealFilePath(item)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Type Badge */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {renderTypeBadge(item.extension)}
                        </td>

                        {/* Original Location */}
                        <td className="py-3.5 px-3">
                          <UnifiedLocationCell item={item} pageContext="trash" />
                        </td>

                        {/* Size */}
                        <td className="py-3.5 px-3 whitespace-nowrap font-medium text-gray-700 dark:text-slate-300">
                          {item.formattedSize}
                        </td>

                        {/* Date */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="text-gray-900 dark:text-slate-200 font-medium">
                            {(item.trashedDate || item.uploadDate || '').split(' ')[0]}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-slate-400 font-mono">
                            {(item.trashedDate || item.uploadDate || '').split(' ').slice(1).join(' ')}
                          </div>
                        </td>

                        {/* Time Left Badge */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {getTimeLeftBadge(item.daysInTrash)}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleRestore(item.id)}
                              className="bg-white hover:bg-blue-50 dark:hover:bg-blue-500/15 text-blue-600 border border-blue-200 dark:bg-slate-800 dark:border-slate-600 dark:text-blue-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                              title="Restore file to Media Library"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>

                            <button
                              onClick={() => requestDeletePermanently(item)}
                              className="bg-white hover:bg-rose-50 dark:hover:bg-rose-500/15 text-rose-600 border border-rose-200 dark:bg-slate-800 dark:border-slate-600 dark:text-rose-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                              title="Permanently remove file from server"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Forever</span>
                            </button>

                            <button 
                              onClick={() => setPreviewItem(item)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-[#e7ecf3] hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                              title="Inspect Details"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 7. BOTTOM PAGINATION BAR */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-slate-400 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Showing {displayedTotal === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + pageSize, displayedTotal)} of {displayedTotal} entries
            </span>
            {selectedIds.length > 0 && (
              <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                ({selectedIds.length} file{selectedIds.length > 1 ? 's' : ''} selected – {formatSize(totalSelectedBytes)})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select 
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-2.5 py-1 text-xs outline-none cursor-pointer"
            >
              <option value="10">10 per page</option>
              <option value="25">25 per page</option>
              <option value="30">30 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
            </select>

            {totalPages > 1 && (
              <div className="flex items-center gap-1 font-bold">
                <button 
                  onClick={() => setCurrentPage(1)}
                  disabled={validCurrentPage === 1}
                  className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="First Page"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setCurrentPage(validCurrentPage - 1)}
                  disabled={validCurrentPage === 1}
                  className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Previous Page"
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
                  className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={validCurrentPage === totalPages}
                  className="p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Last Page"
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

      {/* 8. INSPECT MODAL */}
      {previewItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 dark:border-[#243044] overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 font-bold text-xs">
                <Eye className="w-4 h-4 text-blue-400" />
                <span>Trashed File Inspector</span>
              </div>
              <button onClick={() => setPreviewItem(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-center space-y-4">
              {previewItem.thumbUrl ? (
                <div className="w-[360px] max-w-full h-[240px] mx-auto rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center shadow-inner">
                  <img src={previewItem.thumbUrl} alt={previewItem.title} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <div className="w-20 h-20 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <FileText className="w-10 h-10 text-slate-400" />
                </div>
              )}

              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate" title={previewItem.title}>
                  {previewItem.title}
                </h3>
                <p className="text-xs font-mono text-gray-500 dark:text-slate-400 mt-1">
                  {getRealFilePath(previewItem)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-left bg-gray-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Size</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">{previewItem.formattedSize}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Type</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">{previewItem.extension.toUpperCase()}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Time in Trash</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">
                    {typeof previewItem.daysInTrash === 'number' ? `${previewItem.daysInTrash} day(s)` : 'Today'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Auto Delete Status</span>
                  <div className="mt-0.5">{getTimeLeftBadge(previewItem.daysInTrash)}</div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => {
                    handleRestore(previewItem.id);
                    setPreviewItem(null);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restore to Library</span>
                </button>
                <button
                  onClick={() => {
                    const itemToDelete = previewItem;
                    setPreviewItem(null);
                    requestDeletePermanently(itemToDelete);
                  }}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Forever</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. DESTRUCTION CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div 
          className="fixed inset-0 z-[100000100] flex items-center justify-center bg-[rgba(17,24,39,0.65)] backdrop-blur-[5px] p-4 sm:p-[30px] font-sans box-border animate-fadeIn"
          onClick={() => setDeleteConfirmTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="permanent-delete-modal-title"
        >
          <div 
            className="w-full max-w-[480px] max-h-[90vh] bg-[#0f1118] rounded-[18px] overflow-hidden text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] font-sans flex flex-col border border-white/5"
            onClick={(e) => e.stopPropagation()}
            style={{ boxSizing: 'border-box' }}
          >
            {/* Header */}
            <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-950/60 border border-red-900/50 text-red-400 rounded-xl shrink-0 flex items-center justify-center">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="permanent-delete-modal-title" className="font-bold text-base text-white font-sans m-0" style={{ color: '#ffffff' }}>
                    {deleteConfirmTarget.type === 'empty' ? 'Empty Trash Warning' : 'Permanent Deletion Warning'}
                  </h3>
                  <p className="text-xs text-[#8f97a9] font-sans m-0 mt-0.5">
                    This action is irreversible
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setDeleteConfirmTarget(null)} 
                className="p-1.5 text-[#8f97a9] hover:text-white rounded-lg cursor-pointer transition-colors border-0 bg-transparent flex items-center justify-center"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1 font-sans">
              <div className="p-4 bg-red-950/30 border border-red-900/40 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-300 text-xs">This action cannot be undone!</p>
                  <p className="mt-1 text-red-300/90 text-xs leading-relaxed">
                    The physical files, thumbnail sub-sizes, and all WordPress database attachment records will be permanently erased.
                  </p>
                </div>
              </div>

              {deleteConfirmTarget.type === 'single' && deleteConfirmTarget.item && (
                <div className="bg-[#181b25] border border-white/5 rounded-xl p-4">
                  <span className="text-[#737b8d] text-[11px] tracking-wide uppercase font-semibold block">Target File</span>
                  <span className="font-semibold text-white text-sm block break-all mt-1">
                    {deleteConfirmTarget.item.title}
                  </span>
                  <span className="text-xs text-[#8f97a9] font-mono block mt-1">
                    {deleteConfirmTarget.item.formattedSize} • {deleteConfirmTarget.item.extension.toUpperCase()}
                  </span>
                </div>
              )}

              {deleteConfirmTarget.type === 'bulk' && (
                <div className="bg-[#181b25] border border-white/5 rounded-xl p-4">
                  <span className="text-[#737b8d] text-[11px] tracking-wide uppercase font-semibold block">Target Files</span>
                  <p className="text-white text-sm font-semibold mt-1">
                    Are you sure you want to permanently delete <strong className="text-red-400 font-bold">{deleteConfirmTarget.count} selected files</strong>?
                  </p>
                </div>
              )}

              {deleteConfirmTarget.type === 'empty' && (
                <div className="bg-[#181b25] border border-white/5 rounded-xl p-4">
                  <span className="text-[#737b8d] text-[11px] tracking-wide uppercase font-semibold block">Entire Trash Bin</span>
                  <p className="text-white text-sm font-semibold mt-1 leading-relaxed">
                    Are you sure you want to empty the entire trash? All <strong className="text-red-400 font-bold">{totalTrashedCount} files ({formatSize(totalTrashedSize)})</strong> will be permanently deleted from disk and database.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/5 bg-[#111421]/90 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-5 h-[42px] text-xs font-semibold text-[#d4d7df] border border-white/15 bg-transparent hover:bg-[#202433] rounded-[10px] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 h-[42px] text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-[10px] cursor-pointer shadow-sm flex items-center gap-2 transition-all active:scale-98 border-none"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {deleteConfirmTarget.type === 'empty' ? 'Yes, Empty Trash' : 'Yes, Delete Permanently'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. BATCH PERMANENT DELETION PROGRESS MODAL (Fix 3: Scalable sequential batch execution) */}
      {batchProgress && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 dark:border-[#243044] overflow-hidden">
            <div className="bg-[#A61E69] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <RefreshCw className={`w-4 h-4 ${!batchProgress.isComplete && !batchProgress.isError ? 'animate-spin' : ''}`} />
                <span>{batchProgress.title}</span>
              </div>
              {batchProgress.isError && (
                <button 
                  onClick={() => setBatchProgress(null)} 
                  className="text-white/80 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Progress percentage bar */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  <span>{batchProgress.statusText}</span>
                  <span className="font-mono text-[#A61E69] dark:text-pink-400">
                    {batchProgress.total > 0 ? Math.round((batchProgress.processed / batchProgress.total) * 100) : 100}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden border border-gray-200 dark:border-slate-700">
                  <div
                    className={`h-full transition-all duration-300 ${
                      batchProgress.isError 
                        ? 'bg-rose-500' 
                        : batchProgress.isComplete 
                        ? 'bg-emerald-500' 
                        : 'bg-gradient-to-r from-[#A61E69] to-pink-500'
                    }`}
                    style={{
                      width: `${batchProgress.total > 0 ? Math.min(100, Math.round((batchProgress.processed / batchProgress.total) * 100)) : 100}%`
                    }}
                  />
                </div>
              </div>

              {/* Status Stats Grid */}
              <div className="grid grid-cols-4 gap-2 text-center bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-200 dark:border-slate-700 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Total</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">{batchProgress.total}</span>
                </div>
                <div>
                  <span className="text-emerald-500 block text-[10px] font-bold uppercase">Deleted</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{batchProgress.succeeded}</span>
                </div>
                <div>
                  <span className="text-rose-500 block text-[10px] font-bold uppercase">Failed</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{batchProgress.failed}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] font-bold uppercase">Remaining</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">
                    {Math.max(0, batchProgress.total - batchProgress.processed)}
                  </span>
                </div>
              </div>

              {/* Error Callout */}
              {batchProgress.isError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Batch Operation Incomplete</p>
                      <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
                        {batchProgress.errorMessage}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 text-right">
                    <button
                      onClick={() => setBatchProgress(null)}
                      className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                    >
                      Close & Review Remaining Items
                    </button>
                  </div>
                </div>
              )}

              {/* Success Callout */}
              {batchProgress.isComplete && !batchProgress.isError && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <span className="text-emerald-600 font-bold">✓</span>
                  <span className="font-medium text-xs">All batches completed successfully without timeout.</span>
                </div>
              )}

              {/* In Progress Notice */}
              {!batchProgress.isComplete && !batchProgress.isError && (
                <p className="text-[11px] text-gray-500 dark:text-slate-400 text-center">
                  Processing in batches of 50 items to prevent PHP timeouts on large trash volumes.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Prompt Modal */}
      <UpgradePromptModal
        open={upgradeModal.open}
        onClose={() => setUpgradeModal({ open: false, title: '', message: '' })}
        isDarkMode={isDarkMode}
        title={upgradeModal.title}
        message={upgradeModal.message}
        upgradeUrl={pro.upgradeUrl}
        context="trash_lock"
        feature="trash_bulk_actions"
      />

    </div>
  );
};
