import { csvCell, CSV_BOM } from '../utils/csv';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, 
  Play, 
  Download, 
  Layers, 
  FileImage, 
  TrendingDown, 
  Gauge, 
  ShieldCheck, 
  ChevronLeft, 
  ChevronRight, 
  MoreVertical, 
  Trash2, 
  RefreshCw, 
  Info, 
  CheckCircle, 
  Link as LinkIcon, 
  Shield, 
  Search,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck
} from 'lucide-react';
import { MediaItem } from '../types';
import { ImageUsageDetailsDrawer } from './ImageUsageDetailsDrawer';
import { getProFeatures, ProLockBadge, UpgradePromptModal, openUpgrade } from './ProLock';

interface DuplicateCopy {
  id: string;
  mediaId?: number;
  filename: string;
  fileSize: number; // in KB
  resolution: string;
  uploadedDate: string;
  usedInCount: number;
  path: string;
  isUsed: boolean;
  status: 'unused' | 'used' | 'unknown' | 'ignored';
  isSafeToDelete: boolean;
  duplicateType: 'exact' | 'visual' | 'similar';
  fileHash: string;
  distance?: number;
  inUse?: boolean;
  useReasons?: any[];
  usageUnknown?: boolean;
}

interface LocationUsage {
  id: string;
  title: string;
  url: string;
  breadcrumb: string;
  type: 'Page' | 'Post' | 'Widget' | 'WooCommerce' | 'Theme' | 'Category';
  isDraft?: boolean;
  isDeleted?: boolean;
  isSiteWide?: boolean;
  previewUrl?: string;
  note?: string;
  status: 'Pending' | 'Success' | 'Failed' | 'Manual';
  errorDetails?: string;
  kind?: string;
  postId?: number | null;
  termId?: number | null;
  viewUrl?: string;
  editUrl?: string;
  manual?: boolean;
  manualReason?: string;
}


interface DuplicateGroup {
  id: string;
  name: string;
  locked?: boolean;
  lockedCount?: number;
  originalImage: {
    mediaId?: number;
    filename: string;
    path: string;
    resolution: string;
    fileSize: number; // in KB
    uploadedDate: string;
    usedInCount: number;
    duplicateCount: number;
    potentialSaving: number; // in MB
    imageUrl: string;
    fileHash: string;
    originalReason: string;
    inUse?: boolean;
    useReasons?: any[];
    usageUnknown?: boolean;
  };
  copies: DuplicateCopy[];
}

interface DuplicateImageTabProps {
  isDarkMode?: boolean;
  mediaList?: MediaItem[];
  onCleanMedia?: (idsToRemove: number[], isDelete?: boolean) => Promise<boolean>;
  onNavigateToSettings: (subTab?: any) => void;
  onRescan?: () => void;
  showExportModal?: boolean;
  onCloseExportModal?: () => void;
  registerScanFunction?: (scanFn: () => void) => void;
  onScanStateChange?: (isScanning: boolean, progress: number, statusText: string) => void;
  onDuplicatesChanged?: () => void;
}

export const DuplicateImageTab: React.FC<DuplicateImageTabProps> = ({
  isDarkMode = false,
  mediaList = [],
  onCleanMedia,
  onNavigateToSettings,
  onRescan,
  showExportModal,
  onCloseExportModal,
  registerScanFunction,
  onScanStateChange,
  onDuplicatesChanged
}) => {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const [duplicateGroupsCount, setDuplicateGroupsCount] = useState(0);
  const [duplicateFilesCount, setDuplicateFilesCount] = useState(0);
  const [safeFilesCount, setSafeFilesCount] = useState(0);
  const [usedFilesCount, setUsedFilesCount] = useState(0);
  const [usedFilesSize, setUsedFilesSize] = useState(0); // in MB
  const [ignoredFilesCount, setIgnoredFilesCount] = useState(0);
  const [potentialSpaceSaving, setPotentialSpaceSaving] = useState(0); // in MB
  const [totalSizeScanned, setTotalSizeScanned] = useState(0); // in MB
  const [totalDuplicateSize, setTotalDuplicateSize] = useState(0); // in MB
  const [safeToDeleteSize, setSafeToDeleteSize] = useState(0); // in MB
  const [exactDupSize, setExactDupSize] = useState(0); // in MB
  const [visualDupSize, setVisualDupSize] = useState(0); // in MB
  const [similarDupSize, setSimilarDupSize] = useState(0); // in MB
  const [exactDupPct, setExactDupPct] = useState(0);
  const [visualDupPct, setVisualDupPct] = useState(0);
  const [similarDupPct, setSimilarDupPct] = useState(0);
  const [detectionMode, setDetectionMode] = useState<'exact' | 'visual' | 'similar'>('visual');
  const [coverage, setCoverage] = useState<{ total_images: number; hashed_images: number; unscanned_images: number; visual_unsupported_images: number; phash_outdated_images?: number; } | null>(null);
  const [duplicateLimit, setDuplicateLimit] = useState<{
    enabled: boolean;
    max: number;
    shown_images: number;
    total_images: number;
    locked_groups: number;
    locked_images: number;
  } | null>(null);

  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const currentGroup = groups[activeGroupIndex] || groups[0];

  // Filters & State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'all' | 'safe' | 'used' | 'ignored'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [activeContextMenu, setActiveContextMenu] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [replaceTargetCopy, setReplaceTargetCopy] = useState<DuplicateCopy | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isBulkReplacing, setIsBulkReplacing] = useState(false);
  const [replacementLocations, setReplacementLocations] = useState<LocationUsage[]>([]);
  const [replacementProgress, setReplacementProgress] = useState(0);
  const [replacementStatus, setReplacementStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  const [undoOperationId, setUndoOperationId] = useState<string | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [setOriginalTargetCopy, setSetOriginalTargetCopy] = useState<DuplicateCopy | null>(null);
  const [blockedTrashTarget, setBlockedTrashTarget] = useState<DuplicateCopy | null>(null);
  const [isTrashingCopy, setIsTrashingCopy] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<MediaItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  // "Replace References" edits posts, pages and settings: a Business / Professional feature (the server enforces it too).
  const replaceRefsLocked = !getProFeatures().features.duplicate_replace_refs;
  const [isReplaceUpgradeOpen, setIsReplaceUpgradeOpen] = useState(false);

  useEffect(() => {
    if (!blockedTrashTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTrashingCopy) {
        setBlockedTrashTarget(null);
        setActiveContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [blockedTrashTarget, isTrashingCopy]);

  const handleCloseBlockedModal = () => {
    if (isTrashingCopy) return;
    setBlockedTrashTarget(null);
    setActiveContextMenu(null);
  };

  useEffect(() => {
    if (showExportModal) {
      setIsExportModalOpen(true);
    }
  }, [showExportModal]);

  const handleCloseExport = () => {
    setIsExportModalOpen(false);
    if (onCloseExportModal) {
      onCloseExportModal();
    }
  };
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const scanTimestamp = lastLoadedAt ? lastLoadedAt.toLocaleString() : 'Not loaded yet';
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkConfirmAction, setBulkConfirmAction] = useState<'trash' | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const toggleSelectItem = (id: number) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    // Only copies that are verified unused and not ignored can be selected; originals never.
    const safeIds = groups.flatMap(g =>
      g.locked ? [] : g.copies.filter(c => c.isSafeToDelete).map(c => c.mediaId).filter((id): id is number => id !== undefined)
    );
    if (safeIds.length > 0 && selectedItemIds.length === safeIds.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(safeIds);
    }
  };

  const executeBulkAction = async () => {
    if (bulkConfirmAction !== 'trash' || selectedItemIds.length === 0) return;

    const idsToProcess = [...selectedItemIds];

    if (onCleanMedia) {
      const success = await onCleanMedia(idsToProcess, false);
      if (success === false) {
        showToast('Could not move the selected duplicates to Trash. Please try again.', 'error');
        setBulkConfirmAction(null);
        await fetchDuplicateGroups(true);
        return;
      }
    }

    showToast(`Moved ${idsToProcess.length} duplicate(s) to Trash.`, 'success');
    setSelectedItemIds([]);
    setBulkConfirmAction(null);
    await fetchDuplicateGroups(true);
  };

  const handleStartExport = () => {
    setIsExporting(true);
    setExportProgress(15);
    setExportStatusText('Initializing connection...');

    setTimeout(async () => {
      setExportProgress(100);
      setExportStatusText('Report generated successfully!');
      setIsExporting(false);

      if (exportFormat === 'csv') {
        const headers = ["Filename", "GroupID", "Status", "Resolution", "FileSizeKB", "UsedOnCount", "StatusBadge", "StoragePath"];
        const rows: string[] = [];

        groups.forEach((g, gIdx) => {
          if (g.locked) return;
          const groupId = `Group-${gIdx + 1}`;
          rows.push([
            csvCell(g.originalImage.filename),
            csvCell(groupId),
            csvCell("Original"),
            csvCell(g.originalImage.resolution),
            csvCell(g.originalImage.fileSize),
            csvCell(g.originalImage.usedInCount),
            csvCell("Original"),
            csvCell(g.originalImage.path)
          ].join(','));

          g.copies.forEach(c => {
            rows.push([
              csvCell(c.filename),
              csvCell(groupId),
              csvCell("Duplicate"),
              csvCell(c.resolution),
              csvCell(c.fileSize),
              csvCell(c.usedInCount),
              csvCell(c.status),
              csvCell(c.path)
            ].join(','));
          });
        });

        const csvContent = CSV_BOM + [
          headers.map(h => csvCell(h)).join(','),
          ...rows
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `imgsentry-duplicate-report-${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const { default: jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'mm', 'a4');
        let y = 20;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('IMGSENTRY - DUPLICATE REPORT', 14, y);
        y += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${scanTimestamp} | Detection Mode: ${detectionMode}`, 14, y);
        y += 6;
        doc.text(`Total Groups: ${duplicateGroupsCount} | Total Files: ${duplicateFilesCount} | Recoverable Space: ${potentialSpaceSaving} MB`, 14, y);
        y += 10;

        groups.forEach((g, gIdx) => {
          if (g.locked) return;
          if (y > 265) {
            doc.addPage();
            y = 20;
          }
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(`[Group ${gIdx + 1}: ${g.name}]`, 14, y);
          y += 6;

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(`  Original: ${g.originalImage.filename} (${g.originalImage.resolution}, ${g.originalImage.fileSize} KB, Used on ${g.originalImage.usedInCount})`, 14, y);
          y += 5;

          g.copies.forEach(c => {
            if (y > 275) {
              doc.addPage();
              y = 20;
            }
            doc.text(`  Duplicate: ${c.filename} (${c.resolution}, ${c.fileSize} KB, Status: ${c.status})`, 14, y);
            y += 5;
          });
          y += 4;
        });

        doc.save(`imgsentry-duplicate-report-${Date.now()}.pdf`);
      }

      showToast(`Successfully exported duplicate report as ${exportFormat.toUpperCase()}.`, 'success');
      handleCloseExport();
    }, 400);
  };

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [totalScannedBytesFromDashboard, setTotalScannedBytesFromDashboard] = useState<number | null>(null);

  const fetchTotalScannedBytes = async () => {
    const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const nonce = imgsentryData.nonce || imgsentryData.imgsentry_admin_nonce;
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_get_dashboard_totals');
        fd.append('nonce', nonce || '');
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success && json.data?.total_stats?.total_size !== undefined) {
          setTotalScannedBytesFromDashboard(Number(json.data.total_stats.total_size));
        }
      } catch (e) {
        // Optional figure: the page works without it.
      }
    }
  };

  // Distinct places a file is used in (a page that uses it twice counts once).
  const countDistinctPlaces = (reasons: any[] | undefined, inUse: boolean): number => {
    if (!Array.isArray(reasons) || reasons.length === 0) return inUse ? 1 : 0;
    const keys = new Set<string>();
    reasons.forEach((r: any) => {
      if (r && typeof r === 'object') {
        keys.add(r.post_id ? `p${r.post_id}` : `${r.field_type || ''}:${r.field_label || r.post_title || ''}`);
      } else {
        keys.add(String(r));
      }
    });
    return keys.size || (inUse ? 1 : 0);
  };

  const fetchDuplicateGroups = async (forceRefresh = false, modeOverride?: 'exact' | 'visual' | 'similar') => {
    setIsLoadingGroups(true);
    const targetMode = modeOverride || detectionMode;
    try {
      const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
      if (!imgsentryData?.ajax_url) {
        setLoadError('Plugin data is not loaded. Please refresh the page.');
        return;
      }

      const fd = new FormData();
      fd.append('action', 'imgsentry_get_duplicate_groups');
      fd.append('nonce', imgsentryData?.nonce || '');
      if (forceRefresh) fd.append('force_refresh', 'true');
      fd.append('detection_mode', targetMode);

      const res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
      const json: any = await res.json();

      if (!json || !json.success || !Array.isArray(json.data?.groups)) {
        // Keep the groups that are already on screen; show a retry banner instead of an empty page.
        setLoadError(json?.data?.message || 'Could not load duplicate groups.');
        return;
      }

      setLoadError(null);
      setDuplicateLimit(json.data.limit ? json.data.limit : null);

      const mappedGroups: DuplicateGroup[] = json.data.groups.map((g: any, index: number) => {
        if (g.locked) {
          return {
            id: `locked-${index}`,
            name: `Locked Duplicate Group ${index + 1}`,
            locked: true,
            lockedCount: g.item_count || 0,
            originalImage: {
              filename: 'Locked File',
              path: '',
              resolution: '',
              fileSize: 0,
              uploadedDate: '',
              usedInCount: 0,
              duplicateCount: g.item_count || 0,
              potentialSaving: 0,
              imageUrl: '',
              fileHash: '',
              originalReason: ''
            },
            copies: []
          };
        }

        const original = g.original;
        const copies: DuplicateCopy[] = g.copies.map((c: any) => {
          const isIgnored = Boolean(c.is_excluded || c.status === 'ignored');
          const isUsed = Boolean(c.in_use);
          const usageUnknown = Boolean(c.usage_unknown) && !isUsed;
          const status: DuplicateCopy['status'] = isIgnored ? 'ignored' : (isUsed ? 'used' : (usageUnknown ? 'unknown' : 'unused'));

          return {
            id: `copy-${original.id}-${c.id}`,
            mediaId: c.id,
            filename: c.filename,
            fileSize: Math.round((c.size || 0) / 1024),
            resolution: c.resolution || 'Unknown',
            uploadedDate: c.date || 'Unknown',
            usedInCount: countDistinctPlaces(c.use_reasons, isUsed),
            path: c.url,
            isUsed,
            status,
            isSafeToDelete: status === 'unused',
            usageUnknown,
            duplicateType: c.match_type === 'exact_visual' ? 'visual' : (c.match_type || 'exact'),
            fileHash: c.hash || 'N/A',
            distance: c.distance,
            inUse: isUsed,
            useReasons: c.use_reasons || []
          };
        });

        const potentialSavingBytes = copies.reduce((acc: number, c: DuplicateCopy) => acc + (c.isSafeToDelete ? c.fileSize * 1024 : 0), 0);

        return {
          id: `group-${original.id}`,
          name: original.filename,
          locked: false,
          originalImage: {
            mediaId: original.id,
            filename: original.filename,
            path: original.url,
            resolution: original.resolution || 'Unknown',
            fileSize: Math.round((original.size || 0) / 1024),
            uploadedDate: original.date || 'Unknown',
            usedInCount: countDistinctPlaces(original.use_reasons, Boolean(original.in_use)),
            duplicateCount: copies.length,
            potentialSaving: parseFloat((potentialSavingBytes / (1024 * 1024)).toFixed(2)),
            imageUrl: original.url,
            fileHash: original.hash || original.exact_hash || original.phash || '',
            originalReason: original.is_manual_original ? 'Manually set as original' : (original.in_use ? 'Primary (In Use)' : 'Primary'),
            inUse: Boolean(original.in_use),
            useReasons: original.use_reasons || [],
            usageUnknown: Boolean(original.usage_unknown) && !original.in_use
          },
          copies
        };
      });

      setGroups(mappedGroups);
      if (json.data.coverage) setCoverage(json.data.coverage);
      setLastLoadedAt(new Date());
      onDuplicatesChanged?.();
      hasLoadedOnceRef.current = true;
    } catch (e) {
      setLoadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const startScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    onScanStateChange?.(true, 0, 'Starting duplicate hash scan...');
    showToast('Starting duplicate hash scan...', 'info', false);

    let isComplete = false;
    let lastId = 0;
    let totalFailed = 0;
    let totalUnsupported = 0;
    const batchSize = 20;
    const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;

    while (!isComplete) {
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_hash_scan_batch');
        fd.append('nonce', imgsentryData?.nonce || '');
        fd.append('last_id', lastId.toString());
        fd.append('batch_size', batchSize.toString());

        if (!imgsentryData?.ajax_url) {
          showToast('Plugin data not loaded — please refresh the page', 'error');
          break;
        }
        const res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
        const json: any = await res.json();

        if (json.success) {
          isComplete = !!(json.data.done ?? json.data.is_complete);
          lastId = json.data.last_id ?? 0;
          totalFailed += (json.data.failed || 0);
          totalUnsupported += (json.data.phash_unsupported || 0);
          const total = json.data.total;
          const processed = json.data.processed ?? 0;
          
          if (total > 0) {
             const progress = Math.min(100, Math.round((processed / total) * 100));
             setScanProgress(progress);
             onScanStateChange?.(true, progress, `Scanning for duplicates... ${progress}%`);
             showToast(`Scanning for duplicates... ${progress}%`, 'info', false);
          } else {
             setScanProgress(100);
             onScanStateChange?.(true, 100, 'Scanning for duplicates... 100%');
          }
        } else {
          showToast(json.data?.message || 'Scan failed to process batch.', 'error');
          break;
        }
      } catch (e: any) {
        showToast('Scan error: ' + (e.message || 'Unknown error'), 'error');
        break;
      }
    }

    setIsScanning(false);
    onScanStateChange?.(false, 100, 'Scan complete');
    if (isComplete) {
      const totalErrors = totalFailed + totalUnsupported;
      showToast(`Scan complete${totalErrors > 0 ? `. ${totalErrors} images could not be analyzed.` : '. Loading duplicates...'}`, totalErrors > 0 ? 'info' : 'success');
      await fetchDuplicateGroups(true);
    }
  };

  useEffect(() => {
    if (registerScanFunction) {
      registerScanFunction(startScan);
    }
  }, [registerScanFunction, startScan]);

  useEffect(() => {
    fetchDuplicateGroups(false, detectionMode);
    fetchTotalScannedBytes();
  }, [detectionMode]);

  // Derived statistics whenever groups change
  useEffect(() => {
    let copiesCount = 0;
    let safeCount = 0;
    let usedCount = 0;
    let ignoredCount = 0;
    let potentialSavingBytes = 0;
    let safeBytes = 0;
    
    let duplicateBytes = 0;
    let exactBytes = 0;
    let visualBytes = 0;
    let similarBytes = 0;
    let usedBytes = 0;

    groups.forEach(g => {
      if (g.locked) return;
      copiesCount += g.copies.length;
      g.copies.forEach(c => {
        const bytes = c.fileSize * 1024;
        
        if (c.status === 'used') {
          usedCount++;
          usedBytes += bytes;
        }
        if (c.status === 'ignored') ignoredCount++;

        duplicateBytes += bytes;

        if (c.duplicateType === 'exact') {
          exactBytes += bytes;
        } else if (c.duplicateType === 'visual') {
          visualBytes += bytes;
        } else {
          similarBytes += bytes;
        }

        if (c.isSafeToDelete) {
          safeCount++;
          potentialSavingBytes += bytes;
          safeBytes += bytes;
        }
      });
    });
    
    const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
    const isWp = Boolean(imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl));
    let totalBytesScanned = 0;
    if (isWp && totalScannedBytesFromDashboard !== null) {
      totalBytesScanned = totalScannedBytesFromDashboard;
    } else {
      totalBytesScanned = mediaList.reduce((acc, m) => acc + (m.fileSize ?? 0), 0) || 0;
    }
    
    const totalDupsBytes = exactBytes + visualBytes + similarBytes;
    if (totalDupsBytes > 0) {
      setExactDupPct(parseFloat(((exactBytes / totalDupsBytes) * 100).toFixed(1)));
      setVisualDupPct(parseFloat(((visualBytes / totalDupsBytes) * 100).toFixed(1)));
      setSimilarDupPct(parseFloat(((similarBytes / totalDupsBytes) * 100).toFixed(1)));
    } else {
      setExactDupPct(0);
      setVisualDupPct(0);
      setSimilarDupPct(0);
    }
    
    setExactDupSize(parseFloat((exactBytes / (1024 * 1024)).toFixed(2)) || 0);
    setVisualDupSize(parseFloat((visualBytes / (1024 * 1024)).toFixed(2)) || 0);
    setSimilarDupSize(parseFloat((similarBytes / (1024 * 1024)).toFixed(2)) || 0);
    
    setDuplicateGroupsCount(groups.filter(g => !g.locked).length);
    setDuplicateFilesCount(copiesCount);
    setSafeFilesCount(safeCount);
    setUsedFilesCount(usedCount);
    setUsedFilesSize(parseFloat((usedBytes / (1024 * 1024)).toFixed(2)) || 0);
    setIgnoredFilesCount(ignoredCount);
    setPotentialSpaceSaving(parseFloat((potentialSavingBytes / (1024 * 1024)).toFixed(2)) || 0);
    setTotalSizeScanned(parseFloat((totalBytesScanned / (1024 * 1024)).toFixed(2)) || 0);
    setTotalDuplicateSize(parseFloat((duplicateBytes / (1024 * 1024)).toFixed(2)) || 0);
    setSafeToDeleteSize(parseFloat((safeBytes / (1024 * 1024)).toFixed(2)) || 0);
    
    if (activeGroupIndex >= groups.length && groups.length > 0) {
      setActiveGroupIndex(groups.length - 1);
    }
  }, [groups, mediaList, activeGroupIndex, totalScannedBytesFromDashboard]);

  // Auto-dismiss context menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setActiveContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Show customized toasts
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success', autoClose: boolean = true) => {
    setToast({ message, type });
    if (autoClose) {
      setTimeout(() => setToast(null), 4000);
    }
  };

  const handleNextGroup = () => {
    if (groups.length <= 1) return;
    setActiveGroupIndex((prev) => (prev + 1) % groups.length);
    setCurrentPage(1);
    setActiveContextMenu(null);
  };

  const handlePrevGroup = () => {
    if (groups.length <= 1) return;
    setActiveGroupIndex((prev) => (prev - 1 + groups.length) % groups.length);
    setCurrentPage(1);
    setActiveContextMenu(null);
  };

  // Menu action handlers
  const handleOpenReplaceModal = async (copy: DuplicateCopy) => {
    if (replaceRefsLocked) {
      setActiveContextMenu(null);
      setBlockedTrashTarget(null);
      setIsReplaceUpgradeOpen(true);
      return;
    }
    setUndoOperationId(null);
    setReplaceTargetCopy(copy);
    setIsReplacing(false);
    setReplacementProgress(0);
    setReplacementStatus('idle');
    setActiveContextMenu(null);
    setReplacementLocations([]);
    setIsLoadingPreview(true);

    try {
      const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
      if (!imgsentryData?.ajax_url) {
        showToast('Plugin data not loaded — please refresh the page', 'error');
        setReplaceTargetCopy(null);
        setReplacementLocations([]);
        return;
      }

      const data = new FormData();
      data.append('action', 'imgsentry_get_replacement_preview');
      data.append('nonce', imgsentryData?.nonce || '');
      data.append('duplicate_id', copy.mediaId?.toString() || '');


      const res = await fetch(imgsentryData.ajax_url, {
        method: 'POST',
        body: data
      });
      const json = await res.json();

      if (typeof json !== 'object' || json === null || !('success' in json)) {
        showToast(`Preview failed: ${typeof json === 'object' ? (json?.data?.message || JSON.stringify(json)) : 'Invalid server response: ' + String(json)}`, 'error');
        setReplacementLocations([]);
        return;
      }

      if (json.success && json.data && json.data.locations) {
        const typeFor = (loc: any): LocationUsage['type'] => {
          if (loc.kind === 'option') return 'Widget';
          if (loc.kind === 'termmeta') return 'Category';
          if (loc.post_type === 'post') return 'Post';
          if (loc.post_type === 'product') return 'WooCommerce';
          return 'Page';
        };
        const mappedLocs: LocationUsage[] = json.data.locations.map((loc: any, idx: number): LocationUsage => ({
          id: `loc-${idx}`,
          title: loc.post_title || 'Unknown',
          url: loc.view_url || '',
          previewUrl: loc.view_url || undefined,
          viewUrl: loc.view_url || '',
          editUrl: loc.edit_url || '',
          breadcrumb: loc.field_name,
          type: typeFor(loc),
          kind: loc.kind,
          postId: loc.post_id,
          termId: loc.term_id,
          manual: Boolean(loc.manual),
          manualReason: loc.manual_reason || '',
          isSiteWide: loc.kind === 'option',
          status: 'Pending'
        }));
        if (json.data.truncated) {
          showToast('Too many references to list. Only the first ones are shown; run the replacement again afterwards.', 'info');
        }
        setReplacementLocations(mappedLocs);
      } else {
        setReplacementLocations([]);
        showToast(`Preview failed: ${json.data?.message || 'Unknown error'}`, 'error');
      }
    } catch (err: any) {
      showToast('Could not load the references. Please try again.', 'error');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleReplaceReferences = async (copyId: string, filename: string, isBulk: boolean = false): Promise<boolean> => {
    // A new replacement must never inherit the Undo of an older one (Undo would restore the wrong places).
    if (!isBulk) {
      setUndoOperationId(null);
    }
    setIsReplacing(true);
    setReplacementStatus('running');
    setReplacementProgress(25);

    const group = currentGroup;
    const targetCopy = group?.copies.find(c => c.id === copyId) || replaceTargetCopy;
    const duplicateId = targetCopy?.mediaId;
    const originalId = group?.originalImage.mediaId;

    const finish = () => {
      if (!isBulk) {
        setReplacementStatus('completed');
        setIsReplacing(false);
      }
    };

    if (!duplicateId || !originalId) {
      showToast('Missing file IDs for the replacement.', 'error');
      finish();
      return false;
    }

    try {
      const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
      if (!imgsentryData?.ajax_url) {
        showToast('Plugin data not loaded — please refresh the page', 'error');
        finish();
        return false;
      }

      const data = new FormData();
      data.append('action', 'imgsentry_replace_references');
      data.append('nonce', imgsentryData?.nonce || '');
      data.append('duplicate_id', duplicateId.toString());
      data.append('original_id', originalId.toString());

      const res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: data });
      const json = await res.json();

      if (typeof json !== 'object' || json === null || !('success' in json)) {
        showToast('Session expired or server error — please refresh the page and try again.', 'error');
        finish();
        return false;
      }

      setReplacementProgress(100);

      if (!json.success || !json.data) {
        showToast(json.data?.message || 'Failed to replace references.', 'error');
        finish();
        return false;
      }

      const { can_mark_safe_to_delete, results, operation_id, remaining_total } = json.data;
      if (operation_id) setUndoOperationId(operation_id);

      const resultList: any[] = Array.isArray(results) ? results : [];
      const keyOf = (kind: string, postId: any, termId: any, field: string) => `${kind}|${postId || 0}|${termId || 0}|${field}`;
      const byKey = new Map<string, any>();
      resultList.forEach(r => byKey.set(keyOf(r.kind, r.post_id, r.term_id, r.location), r));

      // Immutable update: map every shown location to the server result; add results we did not list before.
      setReplacementLocations(prev => {
        const known = new Set<string>();
        const updated: LocationUsage[] = prev.map(l => {
          const k = keyOf(l.kind || '', l.postId, l.termId, l.breadcrumb);
          known.add(k);
          const r = byKey.get(k);
          if (!r) return l;
          return {
            ...l,
            status: r.status === 'success' ? 'Success' : (r.status === 'manual' ? 'Manual' : 'Failed'),
            errorDetails: r.status === 'success' ? undefined : r.message
          };
        });
        resultList.forEach((r, i) => {
          const k = keyOf(r.kind, r.post_id, r.term_id, r.location);
          if (!known.has(k)) {
            updated.push({
              id: `res-${i}-${k}`,
              title: r.post_title || r.location,
              url: '',
              breadcrumb: r.location,
              type: 'Page',
              kind: r.kind,
              postId: r.post_id,
              termId: r.term_id,
              status: r.status === 'success' ? 'Success' : (r.status === 'manual' ? 'Manual' : 'Failed'),
              errorDetails: r.status === 'success' ? undefined : r.message
            });
          }
        });
        return updated;
      });

      if (can_mark_safe_to_delete) {
        showToast(`All references of "${filename}" now point to "${group?.originalImage.filename}". It is safe to move it to Trash.`, 'success');
      } else {
        const left = Number(remaining_total || 0);
        showToast(`${left} reference(s) of "${filename}" still need manual work. It is NOT safe to delete yet.`, 'error');
      }

      // Show the real state from the server (usage, status) instead of guessing it locally.
      await fetchDuplicateGroups(true);
      return Boolean(can_mark_safe_to_delete);
    } catch (err) {
      showToast('Error executing replacement.', 'error');
      return false;
    } finally {
      if (!isBulk) {
        setReplacementStatus('completed');
        setIsReplacing(false);
      }
    }
  };

  const handleUndoReplacement = async () => {
    if (!undoOperationId) return;
    setIsUndoing(true);
    
    try {
      const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
      if (!imgsentryData?.ajax_url) {
        showToast('Plugin data not loaded — please refresh the page', 'error');
        setIsUndoing(false);
        return;
      }

      const data = new FormData();
      data.append('action', 'imgsentry_undo_replacement');
      data.append('nonce', imgsentryData?.nonce || '');
      data.append('operation_id', undoOperationId);

      const res = await fetch(imgsentryData.ajax_url, {
        method: 'POST',
        body: data
      });
      const json = await res.json();
      
      if (json.success) {
        showToast(json.data?.message || 'Successfully undid replacement.', 'success');
        setUndoOperationId(null);
        setReplaceTargetCopy(null);
        await fetchDuplicateGroups(true); // Re-fetch to reset states
      } else {
        showToast(json.data?.message || 'Failed to undo replacement.', 'error');
      }
    } catch (err) {
      showToast('Error executing undo.', 'error');
    } finally {
      setIsUndoing(false);
    }
  };

  // This page only moves files to Trash. Used or unverified files are never trashed from here.
  const handleDeleteDuplicate = async (copy: DuplicateCopy) => {
    if (copy.status === 'ignored') {
      showToast(`"${copy.filename}" is on your ignore list. Choose "Stop Ignoring" first.`, 'error');
      setActiveContextMenu(null);
      return;
    }
    if (!copy.isSafeToDelete) {
      showToast(`"${copy.filename}" cannot be trashed because its usage is not clean.`, 'error');
      setActiveContextMenu(null);
      return;
    }
    if (!copy.mediaId || !onCleanMedia) {
      showToast(`Cannot move "${copy.filename}" to Trash: missing attachment ID.`, 'error');
      setActiveContextMenu(null);
      return;
    }

    setIsTrashingCopy(true);
    try {
      const success = await onCleanMedia([copy.mediaId], false);
      if (success === false) {
        showToast('Could not move the file to Trash. It may have become used in the meantime.', 'error');
      } else {
        showToast(`Moved "${copy.filename}" to Trash.`, 'success');
      }
      setActiveContextMenu(null);
      setBlockedTrashTarget(null);
      await fetchDuplicateGroups(true);
    } finally {
      setIsTrashingCopy(false);
    }
  };

  const handleSetAsOriginal = async (copy: DuplicateCopy) => {
    const mediaId = copy.mediaId;
    const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
    if (!imgsentryData?.ajax_url || !mediaId) {
      showToast('Plugin data not loaded — please refresh the page', 'error');
      setSetOriginalTargetCopy(null);
      return;
    }

    try {
      const groupIds: number[] = [
        ...(currentGroup?.originalImage.mediaId ? [currentGroup.originalImage.mediaId] : []),
        ...(currentGroup?.copies.map(c => c.mediaId).filter((id): id is number => id !== undefined) || [])
      ];
      const fd = new FormData();
      fd.append('action', 'imgsentry_set_original');
      fd.append('nonce', imgsentryData?.nonce || '');
      fd.append('id', String(mediaId));
      groupIds.forEach(id => fd.append('group_ids[]', String(id)));

      const res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success) {
        showToast(json.data?.message || `Failed to set "${copy.filename}" as original.`, 'error');
        setSetOriginalTargetCopy(null);
        setActiveContextMenu(null);
        return;
      }

      setSetOriginalTargetCopy(null);
      setActiveContextMenu(null);
      showToast(`"${copy.filename}" is now the original of this group.`, 'success');
      await fetchDuplicateGroups(true); // The server decides the real group layout.
    } catch (e: any) {
      showToast('Could not set the original. Please try again.', 'error');
      setSetOriginalTargetCopy(null);
      setActiveContextMenu(null);
    }
  };

  const postIgnoreAction = async (action: 'imgsentry_ignore_files' | 'imgsentry_unignore_files', ids: number[]): Promise<boolean> => {
    const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
    if (!imgsentryData?.ajax_url || ids.length === 0) {
      showToast('Plugin data not loaded — please refresh the page', 'error');
      return false;
    }
    const fd = new FormData();
    fd.append('action', action);
    fd.append('nonce', imgsentryData?.nonce || '');
    ids.forEach(id => fd.append('ids[]', String(id)));
    const res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
    const json = await res.json();
    if (!json.success) {
      showToast(json.data?.message || 'The request failed.', 'error');
      return false;
    }
    return true;
  };

  const handleIgnoreFile = async (copyId: string, filename: string) => {
    const mediaId = currentGroup?.copies.find(c => c.id === copyId)?.mediaId;
    setActiveContextMenu(null);
    if (!mediaId) return;
    try {
      if (await postIgnoreAction('imgsentry_ignore_files', [mediaId])) {
        showToast(`"${filename}" will be ignored in duplicate scans.`, 'info');
        await fetchDuplicateGroups(true);
      }
    } catch (e) {
      showToast('Could not ignore the file. Please try again.', 'error');
    }
  };

  const handleStopIgnoring = async (copyId: string, filename: string) => {
    const mediaId = currentGroup?.copies.find(c => c.id === copyId)?.mediaId;
    setActiveContextMenu(null);
    if (!mediaId) return;
    try {
      if (await postIgnoreAction('imgsentry_unignore_files', [mediaId])) {
        showToast(`"${filename}" is no longer ignored.`, 'success');
        await fetchDuplicateGroups(true);
      }
    } catch (e) {
      showToast('Could not update the file. Please try again.', 'error');
    }
  };

  // Bulk actions on active group: only exact, verified-unused copies.
  const isBulkSafe = (c: DuplicateCopy) => c.isSafeToDelete && c.status === 'unused' && c.duplicateType === 'exact';

  const handleDeleteAllSafeInGroup = async () => {
    if (!currentGroup) return;
    const safeCopies = currentGroup.copies.filter(isBulkSafe);
    if (safeCopies.length === 0) {
      showToast('No safe-to-delete duplicate files found in this group.', 'info');
      return;
    }

    const totalKB = safeCopies.reduce((acc, c) => acc + (c.fileSize ?? 0), 0);
    const mediaIds = safeCopies.map(c => c.mediaId).filter((id): id is number => id !== undefined);

    if (mediaIds.length > 0 && onCleanMedia) {
      const success = await onCleanMedia(mediaIds, false);
      if (success === false) {
        showToast('Could not move the files to Trash. Please try again.', 'error');
        await fetchDuplicateGroups(true);
        return;
      }
    }

    showToast(`Moved ${safeCopies.length} exact duplicate(s) to Trash (${totalKB} KB).`, 'success');
    await fetchDuplicateGroups(true);
  };

  const handleReplaceAllReferencesInGroup = async () => {
    if (!currentGroup) return;
    if (replaceRefsLocked) {
      setIsReplaceUpgradeOpen(true);
      return;
    }
    const usedCopies = currentGroup.copies.filter(copy => copy.status === 'used');
    if (usedCopies.length === 0) {
      showToast('No in-use duplicates found in this group to replace.', 'info');
      return;
    }

    if (!window.confirm(`Replace references of ${usedCopies.length} in-use duplicate(s) with "${currentGroup.originalImage.filename}"?\n\nThis edits your posts, pages and settings. To be able to undo a change, replace the duplicates one by one.`)) {
      return;
    }

    setIsBulkReplacing(true);
    setIsReplacing(true);
    setReplacementStatus('running');
    let okCount = 0;
    try {
      for (const copy of usedCopies) {
        if (await handleReplaceReferences(copy.id, copy.filename, true)) okCount++;
      }
      showToast(`Finished: ${okCount} of ${usedCopies.length} duplicate(s) are now clean. The rest need manual work.`, okCount === usedCopies.length ? 'success' : 'info');
    } finally {
      setIsBulkReplacing(false);
      setIsReplacing(false);
      setReplacementStatus('completed');
    }
  };

  const handleIgnoreWholeGroup = async () => {
    if (!currentGroup || !currentGroup.copies || currentGroup.copies.length === 0) {
      showToast('No duplicate copies found in this group to ignore.', 'info');
      return;
    }

    const mediaIds = currentGroup.copies
      .map(c => c.mediaId)
      .filter((id): id is number => id !== undefined);

    try {
      if (!(await postIgnoreAction('imgsentry_ignore_files', mediaIds))) {
        return;
      }

      showToast(`All ${currentGroup.copies.length} copies in "${currentGroup.name}" will be ignored.`, 'info');
      await fetchDuplicateGroups(true);
      handleNextGroup();
    } catch (e: any) {
      showToast(`Error ignoring group: ${e.message || 'Unknown error'}`, 'error');
    }
  };

  // Filtering duplicate copies
  const filteredCopies = (currentGroup?.copies || []).filter(copy => {
    // Quick filter check
    if (activeQuickFilter === 'safe' && !copy.isSafeToDelete) return false;
    if (activeQuickFilter === 'used' && copy.status !== 'used') return false;
    if (activeQuickFilter === 'ignored' && copy.status !== 'ignored') return false;

    // Search query check
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (copy.filename ?? '').toLowerCase().includes(q) || (copy.path ?? '').toLowerCase().includes(q);
    }

    return true;
  });

  // Pages sizing logic
  const itemsPerPage = 12;
  const totalPages = Math.ceil(filteredCopies.length / itemsPerPage) || 1;
  const displayedCopies = filteredCopies.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const cardBg = 'bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3]';

  const handleOpenDrawer = (copy: any) => {
    const mediaItem: MediaItem = {
      id: copy.mediaId || 0,
      title: copy.filename,
      filename: copy.filename,
      url: copy.path || copy.imageUrl,
      mimeType: copy.filename?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
      category: 'images',
      extension: copy.filename?.split('.').pop() || 'jpg',
      fileSize: copy.fileSize * 1024,
      formattedSize: `${copy.fileSize} KB`,
      uploadDate: copy.uploadedDate,
      isAttached: copy.inUse || false,
      inUse: copy.inUse || false,
      useReasons: copy.useReasons || [],
      isTrashed: false,
      daysInTrash: 0,
      dimensions: copy.resolution
    } as any;
    setDrawerTarget(mediaItem);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-5 text-gray-900 dark:text-slate-100">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-slate-800 max-w-md animate-slideUp">
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0" />}
          {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Load error banner (old data stays visible) */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={() => fetchDuplicateGroups(true)}
            disabled={isLoadingGroups}
            className="px-3 py-1.5 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Pro Limit Banner */}
      {duplicateLimit?.enabled && duplicateLimit.locked_images > 0 && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-4 flex items-center justify-between text-white shadow-lg">
          <div className="flex items-center gap-3">
            <Info className="w-6 h-6 shrink-0" />
            <p className="text-sm font-bold">
              Showing {duplicateLimit.shown_images} of {duplicateLimit.total_images} duplicate images. {duplicateLimit.locked_images} more are locked — see them with Pro.
            </p>
          </div>
          {getProFeatures().upgradeUrl && (
            <button 
              onClick={() => openUpgrade('duplicate_lock', 'duplicate_unlimited')}
              className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              Upgrade to Pro
            </button>
          )}
        </div>
      )}

      {/* Grid of Key Statistics (Screenshot style matching EXACT metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1 */}
        <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none dark:text-[#8993a8]">Duplicate Groups</span>
            <strong className="text-xl font-black text-[#5850ec] dark:text-indigo-400 mt-1.5 block leading-none">{duplicateGroupsCount}</strong>
            <div className="text-[12px] font-semibold text-indigo-700 bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Groups Found
            </div>
          </div>
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center text-[#5850ec] dark:text-indigo-400 shrink-0 ml-2">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none dark:text-[#8993a8]">Duplicate Files</span>
            <strong className="text-xl font-black text-blue-600 dark:text-[#5B8DEF] mt-1.5 block leading-none">{(duplicateFilesCount ?? 0).toLocaleString()}</strong>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-[#5B8DEF]/15 dark:text-[#5B8DEF] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              Files Found
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-[#5B8DEF]/15 rounded-xl flex items-center justify-center text-blue-600 dark:text-[#5B8DEF] shrink-0 ml-2">
            <FileImage className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none dark:text-[#8993a8]">Total Duplicate Size</span>
            <strong className="text-xl font-black text-amber-600 dark:text-[#fbbf24] mt-1.5 block leading-none">{totalDuplicateSize} MB</strong>
            <div className="text-[12px] font-semibold text-amber-800 bg-amber-100 dark:bg-[#fbbf24]/15 dark:text-[#fbbf24] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              of {totalSizeScanned} MB scanned
            </div>
          </div>
          <div className="w-12 h-12 bg-amber-50 dark:bg-[#fbbf24]/15 rounded-xl flex items-center justify-center text-amber-600 dark:text-[#fbbf24] shrink-0 ml-2">
            <Gauge className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 5 */}
        <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none dark:text-[#8993a8]">Safe to Delete</span>
            <strong className="text-xl font-black text-teal-600 dark:text-teal-400 mt-1.5 block leading-none">{safeToDeleteSize} MB</strong>
            <div className="text-[12px] font-semibold text-teal-700 bg-teal-100 dark:bg-teal-950/40 dark:text-teal-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {duplicateFilesCount > 0 ? ((safeFilesCount / duplicateFilesCount) * 100).toFixed(0) : 0}% Safe
            </div>
          </div>
          <div className="w-12 h-12 bg-teal-50 dark:bg-teal-950/40 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0 ml-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Detection Mode Toolbar */}
      <div className={`${cardBg} rounded-xl p-3.5 border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label htmlFor="imgsentry-detection-mode" className="text-xs font-bold text-gray-700 dark:text-slate-200 whitespace-nowrap">
            Detection Mode:
          </label>
          <select
            id="imgsentry-detection-mode"
            value={detectionMode}
            onChange={(e) => {
              const newMode = e.target.value as 'exact' | 'visual' | 'similar';
              setDetectionMode(newMode);
              setActiveGroupIndex(0);
            }}
            className="text-xs font-semibold bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="exact">Exact duplicates</option>
            <option value="visual">Visual duplicates</option>
            <option value="similar">Similar images</option>
          </select>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {detectionMode === 'exact' && 'Byte-for-byte identical files (same content). Check usage before deleting.'}
            {detectionMode === 'visual' && 'Same image, resized or re-compressed. Recommended.'}
            {detectionMode === 'similar' && 'Includes cropped or edited versions. May include false positives — review before deleting.'}
          </span>
        </div>
      </div>
      {coverage && !isScanning && (
        <div className="space-y-2 mt-3">
          {coverage.unscanned_images > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 p-3 rounded-lg flex items-center justify-between gap-3">
              <p className="text-xs text-amber-800 dark:text-amber-200">{coverage.unscanned_images} of {coverage.total_images} images have not been scanned yet and are not included in these results.</p>
              <button type="button" onClick={startScan} className="text-xs font-bold text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-700 px-3 py-1.5 rounded-lg cursor-pointer">Run duplicate scan</button>
            </div>
          )}
          {coverage.visual_unsupported_images > 0 && detectionMode !== 'exact' && (
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 p-3 rounded-lg flex items-center gap-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">{coverage.visual_unsupported_images} images could not be analyzed visually (unsupported format, animated, or too large). They are only matched in Exact mode.</p>
            </div>
          )}
          {detectionMode !== 'exact' && (coverage.phash_outdated_images ?? 0) > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 p-3 rounded-lg flex items-center justify-between gap-3">
              <p className="text-xs text-amber-800 dark:text-amber-200">{coverage.phash_outdated_images} images need a re-scan before visual and similar detection can include them (detection method updated).</p>
              <button type="button" onClick={startScan} className="text-xs font-bold text-amber-900 dark:text-amber-100 bg-amber-200 dark:bg-amber-700 px-3 py-1.5 rounded-lg cursor-pointer">Run duplicate scan</button>
            </div>
          )}
        </div>
      )}

      {/* Main Workspace (Grid layout splitting details & controls) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left 2/3 Workspace Column */}
        <div className="xl:col-span-9 space-y-6">
          
          {/* Group Header & Pagination Controls */}
          {groups.length > 0 && (
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-[#243044] rounded-2xl p-4 shadow-3xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 dark:text-slate-400">Viewing Group</span>
              </div>
              
              <div className="text-sm font-bold text-gray-900 dark:text-white">
                Duplicate Group {activeGroupIndex + 1} of {groups.length}
              </div>

              <div className="flex items-center gap-2">
                <select 
                  value={activeGroupIndex}
                  onChange={(e) => setActiveGroupIndex(parseInt(e.target.value))}
                  className="text-[11px] font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-2 py-1.5 rounded-lg cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {groups.map((_, idx) => (
                    <option key={idx} value={idx}>Group {idx + 1}</option>
                  ))}
                </select>
                <button 
                  onClick={handlePrevGroup}
                  disabled={groups.length <= 1 || activeGroupIndex === 0}
                  className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-gray-500 dark:text-[#8993a8]" />
                  <span>Previous Group</span>
                </button>
                <button 
                  onClick={handleNextGroup}
                  disabled={groups.length <= 1 || activeGroupIndex === groups.length - 1}
                  className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-3xs text-blue-600 dark:text-blue-400"
                >
                  <span>Next Group</span>
                  <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
                </button>
                <div className="w-px h-6 bg-gray-300 dark:bg-slate-700 mx-1"></div>
                <button 
                  onClick={startScan}
                  disabled={isScanning}
                  className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all shadow-3xs"
                >
                  {isScanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {isScanning ? `Scanning... ${scanProgress}%` : 'Re-scan'}
                </button>
              </div>
            </div>
          )}

          {/* Side-by-Side: Original vs Duplicate Copies */}
          {isLoadingGroups && !hasLoadedOnceRef.current ? (
            <div className={`${cardBg} rounded-2xl p-12 border text-center space-y-4`}>
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center text-blue-500 mx-auto">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white!">Loading Duplicate Groups...</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Please wait while we retrieve your scan results from the database.
              </p>
            </div>
          ) : (
            <>
              {isLoadingGroups && hasLoadedOnceRef.current && (
                <div className="flex items-center gap-2 mb-4 px-3 py-1.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/50 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 w-fit">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                  <span>Refreshing duplicate groups...</span>
                </div>
              )}
              {groups.length > 0 && currentGroup.locked ? (
                 <div className={`${cardBg} rounded-2xl p-12 border text-center space-y-4`}>
                    <div className="flex gap-2 justify-center mb-6 overflow-hidden h-32">
                      {[1, 2, 3, 4].map((i) => (
                        <div 
                          key={i} 
                          className="w-48 h-32 bg-slate-200 dark:bg-slate-800 rounded-xl shrink-0 blur-xl animate-pulse opacity-60"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                    <h3 className="text-xl font-black text-gray-900 dark:text-white!">
                      {currentGroup.lockedCount} more images are locked
                    </h3>
                    <div className="flex justify-center">
                      <ProLockBadge />
                    </div>
                 </div>
              ) : groups.length === 0 ? (
            <div className={`${cardBg} rounded-2xl p-12 border text-center space-y-4`}>
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 rounded-full flex items-center justify-center text-emerald-500 mx-auto">
                <FileCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white!">No Duplicate Images Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                All duplicate images have been successfully reviewed and resolved. Your WordPress media library is optimized!
              </p>
              
              <button 
                 onClick={startScan} 
                 disabled={isScanning}
                 className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2">
                 {isScanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                 {isScanning ? `Scanning... ${scanProgress}%` : 'Scan for duplicates'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Original Image Card */}
              <div className="lg:col-span-4 space-y-4">
                <div className={`${cardBg} rounded-2xl border p-4 shadow-3xs flex flex-col justify-between h-full`}>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-gray-900 dark:text-white">Original Image</span>
                      <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 animate-pulse cursor-help" title={currentGroup.originalImage.originalReason}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Keep This
                      </span>
                    </div>

                    {/* Selection Reasoning Badge */}
                    <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 rounded-xl p-2.5 text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">{currentGroup.originalImage.originalReason}</span>
                    </div>

                    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-[#243044] aspect-3/2 bg-slate-100 dark:bg-[#0b1220] flex items-center justify-center">
                      <img 
                        src={currentGroup.originalImage.imageUrl} 
                        alt={currentGroup.originalImage.filename}
                        referrerPolicy="no-referrer"
                        className="object-cover w-full h-full"
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white! break-all leading-tight" title={currentGroup.originalImage.filename}>{currentGroup.originalImage.filename}</h4>
                        <span className="text-[11px] text-gray-500 dark:text-slate-400 block truncate mt-0.5">{currentGroup.originalImage.path}</span>
                      </div>

                      <div className="border-t border-gray-100 dark:border-[#243044]/80 pt-3 space-y-2">
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Layers className="w-3 h-3" /> Resolution
                          </span>
                          <span className="text-gray-900 dark:text-white font-semibold">{currentGroup.originalImage.resolution}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                            <FileImage className="w-3 h-3" /> File Size
                          </span>
                          <span className="text-gray-900 dark:text-white font-semibold">{currentGroup.originalImage.fileSize} KB</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" /> Uploaded
                          </span>
                          <span className="text-gray-900 dark:text-white font-semibold">{currentGroup.originalImage.uploadedDate}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                            <LinkIcon className="w-3 h-3" /> Used On
                          </span>
                          {currentGroup.originalImage.usedInCount > 0 ? (
                            <span 
                              className="text-blue-600 dark:text-blue-400 font-extrabold cursor-pointer underline"
                              onClick={() => handleOpenDrawer(currentGroup.originalImage)}
                            >
                              {currentGroup.originalImage.usedInCount} pages / posts
                            </span>
                          ) : (
                            <span className="text-gray-900 dark:text-white font-extrabold">0 pages / posts</span>
                          )}
                        </div>
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                            <FileImage className="w-3 h-3" /> Storage Location
                          </span>
                          <span className="text-gray-950 dark:text-slate-200 font-semibold" title={currentGroup.originalImage.path}>{(() => {
                            try {
                              const p = new URL(currentGroup.originalImage.path).pathname;
                              const match = p.match(/\/\d{4}\/\d{2}\//);
                              return match ? match[0] : (p ?? '').split('/').slice(0, -1).join('/') + '/';
                            } catch(e) {
                              return '/wp-content/uploads/';
                            }
                          })()}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Layers className="w-3 h-3" /> Duplicate Count
                          </span>
                          <span className="text-gray-950 dark:text-slate-200 font-semibold">{currentGroup.originalImage.duplicateCount}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                            <ShieldCheck className="w-3 h-3" /> Safe to Delete
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-black">{currentGroup.originalImage.potentialSaving} MB</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 rounded-xl p-3 mt-4 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-[10px] leading-relaxed text-blue-800 dark:text-blue-300">
                      <strong className="block font-bold">This is the original image.</strong>
                      All active frontend/backend media posts point to and safely query this asset.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Duplicate Copies Grid */}
              <div className="lg:col-span-8 space-y-4">
                
                {/* Section Header */}
                <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-gray-100 dark:border-[#243044]/80 rounded-xl px-4 py-2.5">
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    Duplicate Copies <span className="text-slate-400 font-medium dark:text-[#8993a8]">(Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredCopies.length)} of {filteredCopies.length})</span>
                  </span>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={toggleSelectAll}
                      className="text-[10px] font-bold px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                    >
                      {selectedItemIds.length > 0 ? 'Deselect All' : 'Select All Safe Copies'}
                    </button>
                  </div>
                </div>

                {/* Grid of duplicate file card elements */}
                {displayedCopies.length === 0 ? (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-gray-300 dark:border-[#243044] p-12 text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">No copies found matching the active filter.</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Try switching the quick filter on the right sidebar panel.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {displayedCopies.map((copy, index) => {
                      const absoluteIndex = (currentPage - 1) * itemsPerPage + index + 1;
                      const isContextOpen = activeContextMenu === copy.id;

                      return (
                        <div 
                          key={copy.id}
                          className={`${cardBg} rounded-xl border-2 p-3 shadow-2xs relative flex flex-col justify-between hover:shadow-sm transition-all group ${
                            copy.mediaId && selectedItemIds.includes(copy.mediaId) ? 'border-blue-500 bg-blue-50/10' : 'border-gray-200 dark:border-[#243044]'
                          }`}
                        >
                          {/* Selection Checkbox (only verified-unused copies) */}
                          {copy.isSafeToDelete && (
                            <div className="absolute top-2.5 right-2.5 z-20">
                              <input 
                                type="checkbox"
                                checked={!!copy.mediaId && selectedItemIds.includes(copy.mediaId)}
                                onChange={() => copy.mediaId && toggleSelectItem(copy.mediaId)}
                                className="w-4 h-4 rounded border-gray-300 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                              />
                            </div>
                          )}

                          {/* Circle Index Tag */}
                          <div className="absolute top-2.5 left-2.5 z-10 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-[10px]">
                            {absoluteIndex}
                          </div>

                          <div className="space-y-2.5">
                            {/* Thumbnail overlay */}
                            <div className="relative rounded-lg overflow-hidden border border-gray-150 dark:border-[#243044] aspect-3/2 bg-slate-100 dark:bg-[#0b1220]">
                              <img 
                                src={copy.path} 
                                alt={copy.filename}
                                referrerPolicy="no-referrer"
                                className="object-cover w-full h-full opacity-90 group-hover:scale-105 transition-transform"
                              />
                              {/* Duplicate tier overlay badge */}
                              <div className="absolute bottom-1.5 right-1.5 z-10">
                                {copy.duplicateType === 'exact' ? (
                                  <span className="text-[8px] font-black uppercase tracking-wider text-white bg-indigo-600/90 dark:bg-indigo-500/90 px-1.5 py-0.5 rounded shadow-xs" title={`Exact Match. Distance: ${copy.distance ?? 'N/A'}`}>
                                    Exact
                                  </span>
                                ) : copy.duplicateType === 'visual' ? (
                                  <span className="text-[8px] font-black uppercase tracking-wider text-white bg-blue-600/90 dark:bg-blue-500/90 px-1.5 py-0.5 rounded shadow-xs" title={`Visual Match. Distance: ${copy.distance ?? 'N/A'}`}>
                                    Visual
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-black uppercase tracking-wider text-white bg-amber-600/90 dark:bg-amber-500/90 px-1.5 py-0.5 rounded shadow-xs" title={`Similar Image. Distance: ${copy.distance ?? 'N/A'}`}>
                                    Similar
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Info labels */}
                            <div className="space-y-1">
                              <h5 className="text-xs font-bold text-gray-900 dark:text-white! truncate" title={copy.filename}>
                                {copy.filename}
                              </h5>
                              <div className="text-[11px] text-gray-500 dark:text-slate-400 font-semibold space-x-1">
                                <span>{copy.fileSize} KB</span>
                                <span>•</span>
                                <span>{copy.resolution}</span>
                              </div>
                              <div className="text-[11px] text-gray-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                                Used on: 
                                {copy.usedInCount > 0 ? (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDrawer(copy);
                                    }}
                                    className="text-blue-600 dark:text-blue-400 font-bold underline cursor-pointer flex items-center gap-0.5"
                                  >
                                    {copy.usedInCount} page{copy.usedInCount !== 1 ? 's' : ''}
                                  </button>
                                ) : (
                                  <strong className="text-slate-500 dark:text-[#8993a8]">0 pages</strong>
                                )}
                              </div>
                              <div className="text-[11px] text-gray-500 dark:text-slate-400 flex items-center gap-1 flex-wrap">
                                <span>{copy.uploadedDate}</span>
                                <span>•</span>
                                <code className="text-[10px] bg-slate-150 dark:bg-slate-900/60 px-1 py-0.5 rounded font-mono text-gray-500 dark:text-slate-400/80 cursor-help" title={`SHA-1 Hash: ${copy.fileHash}`}>
                                  {copy.fileHash.substring(0, 8)}
                                </code>
                              </div>
                            </div>
                          </div>

                          {/* Footer details row */}
                          <div className="flex justify-between items-center border-t border-gray-100 dark:border-[#243044]/80 pt-2 mt-2">
                            {/* Badge */}
                            {copy.status === 'used' ? (
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-md">Used</span>
                            ) : copy.status === 'ignored' ? (
                              <span className="text-[9px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/20 px-2 py-0.5 rounded-md">Ignored</span>
                            ) : copy.status === 'unknown' ? (
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-md" title="Usage not verified yet. Run a Media Scan before deleting this file.">Unverified</span>
                            ) : (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-md">Unused</span>
                            )}

                            {/* Three Dots Context Button */}
                            <div className="relative">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveContextMenu(isContextOpen ? null : copy.id);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-all dark:text-[#8993a8]"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>

                              {/* Dropdown Menu Overlay matching screenshot exactly */}
                              {isContextOpen && (
                                <div 
                                  ref={contextMenuRef}
                                  className="absolute right-0 bottom-7 md:bottom-auto md:top-7 z-30 w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl p-1 animate-fadeIn text-[11px]"
                                >
                                  {copy.status !== 'ignored' && (
                                    <button 
                                      onClick={() => handleOpenReplaceModal(copy)}
                                      className="w-full text-left px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-2 rounded-lg cursor-pointer"
                                    >
                                      <RefreshCw className="w-3 h-3 text-slate-400 dark:text-[#8993a8]" />
                                      <span>Replace References</span>
                                      {replaceRefsLocked && <ProLockBadge isDarkMode={isDarkMode} />}
                                    </button>
                                  )}
                                  {copy.status !== 'ignored' && (
                                    <button 
                                      onClick={() => {
                                        if (copy.status === 'unknown') {
                                          showToast('Usage for this file is not verified yet. Run a Media Scan, then try again.', 'info');
                                          setActiveContextMenu(null);
                                          return;
                                        }
                                        if (copy.status === 'used') {
                                          setBlockedTrashTarget(copy);
                                          setActiveContextMenu(null);
                                          return;
                                        }
                                        handleDeleteDuplicate(copy);
                                      }}
                                      className={`w-full text-left px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold ${copy.isSafeToDelete ? 'text-amber-600' : 'text-slate-400'} flex items-center gap-2 rounded-lg cursor-pointer`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>{copy.status === 'unknown' ? 'Verify usage first' : (copy.status === 'used' ? 'In use — cannot trash' : 'Move to Trash')}</span>
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => {
                                      setSetOriginalTargetCopy(copy);
                                      setActiveContextMenu(null);
                                    }}
                                    className="w-full text-left px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-2 rounded-lg cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                    <span>Set as Original</span>
                                  </button>
                                  {copy.status === 'ignored' ? (
                                    <button 
                                      onClick={() => handleStopIgnoring(copy.id, copy.filename)}
                                      className="w-full text-left px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-2 rounded-lg cursor-pointer"
                                    >
                                      <Shield className="w-3 h-3 text-slate-400 dark:text-[#8993a8]" />
                                      <span>Stop Ignoring</span>
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => handleIgnoreFile(copy.id, copy.filename)}
                                      className="w-full text-left px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-2 rounded-lg cursor-pointer"
                                    >
                                      <Shield className="w-3 h-3 text-slate-400 dark:text-[#8993a8]" />
                                      <span>Ignore This File</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Small inner Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1.5 pt-4">
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-[#243044] disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button 
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`w-7 h-7 text-xs font-bold rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                          currentPage === i + 1 
                            ? 'bg-[#A61E69] text-white font-extrabold' 
                            : 'border border-gray-250 dark:border-[#243044] hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-[#243044] disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Actions Bottom Bar inside Workspace (Matches screenshot) */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-[#243044] rounded-2xl p-4 mt-6">
                  <div className="flex flex-wrap gap-2.5">
                    <button 
                      onClick={handleDeleteAllSafeInGroup}
                      className="px-3 py-2 text-xs font-bold text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-500/15 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-3xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Move All Exact Safe to Trash ({currentGroup.copies.filter(isBulkSafe).length})</span>
                    </button>
                    <button 
                      onClick={handleReplaceAllReferencesInGroup}
                      disabled={isBulkReplacing}
                      className="px-3 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900/40 hover:bg-blue-50 dark:hover:bg-blue-500/15 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-3xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isBulkReplacing ? 'animate-spin' : ''}`} />
                      <span>{isBulkReplacing ? 'Replacing...' : `Replace References for All Used Duplicates (${currentGroup.copies.filter(c => c.isUsed || c.status === 'used').length})`}</span>
                      {replaceRefsLocked && <ProLockBadge isDarkMode={isDarkMode} />}
                    </button>
                    <button 
                      onClick={handleIgnoreWholeGroup}
                      className="px-3 py-2 text-xs font-bold text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-[#1e293b] rounded-xl flex items-center gap-1.5 cursor-pointer shadow-3xs"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Ignore All for This Group</span>
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold block leading-none dark:text-[#8993a8]">Safe to Delete</span>
                    <strong className="text-xl font-black text-teal-600 dark:text-teal-400 block mt-1 leading-none">
                      {safeToDeleteSize} MB
                    </strong>
                  </div>
                </div>

              </div>
              
            </div>
          )}
          </>
        )}

        </div>

        {/* Right 1/3 Analytics Sidebar Column */}
        <div className="xl:col-span-3 space-y-6">
          
          {/* Smart Summary Card with Donut Chart Visualizer (Matches screenshot) */}
          <div className={`${cardBg} rounded-2xl border p-5 shadow-3xs space-y-4`}>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-[#8993a8]!">Smart Summary</h3>
            
            <div className="flex flex-col items-center justify-center py-2 relative">
              {/* Custom SVG Ring/Donut Graph mimicking screenshot visual ratio */}
              <svg className="w-40 h-40 transform -rotate-90">
                {/* Background Ring */}
                <circle 
                  cx="80" 
                  cy="80" 
                  r="62" 
                  stroke="currentColor" 
                  className="text-slate-100 dark:text-slate-800"
                  strokeWidth="16" 
                  fill="transparent" 
                />
                {/* Purple Ring (Exact Duplicates) */}
                <circle 
                  cx="80" 
                  cy="80" 
                  r="62" 
                  stroke="#5850ec" 
                  strokeWidth="16" 
                  fill="transparent" 
                  strokeDasharray={2 * Math.PI * 62}
                  strokeDashoffset={2 * Math.PI * 62 * (1 - exactDupPct / 100)}
                />
                {/* Visual Duplicates Ring */}
                <circle 
                  cx="80" 
                  cy="80" 
                  r="62" 
                  stroke="#A61E69" 
                  strokeWidth="16" 
                  fill="transparent" 
                  strokeDasharray={2 * Math.PI * 62}
                  strokeDashoffset={2 * Math.PI * 62 * (1 - visualDupPct / 100)}
                  className="transform origin-center"
                  style={{ transform: `rotate(${(exactDupPct / 100) * 360}deg)` }}
                />
                {/* Orange Ring (Similar Images) */}
                <circle 
                  cx="80" 
                  cy="80" 
                  r="62" 
                  stroke="#f59e0b" 
                  strokeWidth="16" 
                  fill="transparent" 
                  strokeDasharray={2 * Math.PI * 62}
                  strokeDashoffset={2 * Math.PI * 62 * (1 - similarDupPct / 100)}
                  className="transform origin-center"
                  style={{ transform: `rotate(${((exactDupPct + visualDupPct) / 100) * 360}deg)` }}
                />
              </svg>

              {/* Text indicator inside Ring */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-lg font-extrabold text-gray-900 dark:text-white leading-none">{totalDuplicateSize} MB</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase mt-1 leading-none tracking-tight dark:text-[#8993a8]">Total Duplicates</span>
              </div>
            </div>

            {/* Legends list */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#5850ec] shrink-0" />
                  <span className="text-slate-600 dark:text-slate-300">Exact Duplicates</span>
                </div>
                <span className="text-gray-900 dark:text-white">
                  {exactDupSize.toFixed(2)} MB
                  <span className="text-slate-400 font-medium ml-1 dark:text-[#8993a8]">({exactDupPct}%)</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#A61E69] shrink-0" />
                  <span className="text-slate-600 dark:text-slate-300">Visual Duplicates</span>
                </div>
                <span className="text-gray-900 dark:text-white">
                  {visualDupSize.toFixed(2)} MB
                  <span className="text-slate-400 font-medium ml-1 dark:text-[#8993a8]">({visualDupPct}%)</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0" />
                  <span className="text-slate-600 dark:text-slate-300">Similar Images</span>
                </div>
                <span className="text-gray-900 dark:text-white">
                  {similarDupSize.toFixed(2)} MB
                  <span className="text-slate-400 font-medium ml-1 dark:text-[#8993a8]">({similarDupPct}%)</span>
                </span>
              </div>
            </div>
          </div>

          {/* Duplicate Health panel (Matches screenshot) */}
          <div className={`${cardBg} rounded-2xl border p-5 shadow-3xs space-y-4`}>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-[#8993a8]!">Duplicate Health</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-300">Safe to Delete</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{safeToDeleteSize} MB ({duplicateFilesCount > 0 ? ((safeFilesCount / duplicateFilesCount) * 100).toFixed(0) : 0}%)</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="text-slate-600 dark:text-slate-300">In Use</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-blue-600 dark:text-blue-400 font-extrabold">{usedFilesSize} MB ({duplicateFilesCount > 0 ? ((usedFilesCount / duplicateFilesCount) * 100).toFixed(0) : 0}%)</span>
                  <X className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 shrink-0" />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Filters Tab selectors (Matches screenshot) */}
          <div className={`${cardBg} rounded-2xl border p-5 shadow-3xs space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-[#8993a8]!">Quick Filters</h3>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search file..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-28 text-[10px] pl-5 pr-2 py-1 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md focus:outline-none focus:border-blue-500 text-gray-800 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579]"
                />
                <Search className="w-2.5 h-2.5 text-slate-400 absolute left-1.5 top-2 dark:text-[#5b6579]" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => { setActiveQuickFilter('all'); setCurrentPage(1); }}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeQuickFilter === 'all' 
                    ? 'bg-[#A61E69] text-white font-extrabold' 
                    : 'bg-gray-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span>All Duplicates</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${activeQuickFilter === 'all' ? 'bg-[#8F1B5A] text-white' : 'bg-gray-200 dark:bg-slate-700 text-slate-600'}`}>
                  {duplicateFilesCount}
                </span>
              </button>

              <button 
                onClick={() => { setActiveQuickFilter('safe'); setCurrentPage(1); }}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeQuickFilter === 'safe' 
                    ? 'bg-[#A61E69] text-white font-extrabold' 
                    : 'bg-gray-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span>Safe to Delete</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${activeQuickFilter === 'safe' ? 'bg-[#8F1B5A] text-white' : 'bg-gray-200 dark:bg-slate-700 text-slate-600'}`}>
                  {safeFilesCount}
                </span>
              </button>

              <button 
                onClick={() => { setActiveQuickFilter('used'); setCurrentPage(1); }}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeQuickFilter === 'used' 
                    ? 'bg-[#A61E69] text-white font-extrabold' 
                    : 'bg-gray-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span>In Use</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${activeQuickFilter === 'used' ? 'bg-[#8F1B5A] text-white' : 'bg-gray-200 dark:bg-slate-700 text-slate-600'}`}>
                  {usedFilesCount}
                </span>
              </button>

              <button 
                onClick={() => { setActiveQuickFilter('ignored'); setCurrentPage(1); }}
                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeQuickFilter === 'ignored' 
                    ? 'bg-[#A61E69] text-white font-extrabold' 
                    : 'bg-gray-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <span>Ignored</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${activeQuickFilter === 'ignored' ? 'bg-[#8F1B5A] text-white' : 'bg-gray-200 dark:bg-slate-700 text-slate-600'}`}>
                  {ignoredFilesCount}
                </span>
              </button>
            </div>
          </div>

          {/* Scan Information (real data from the server) */}
          <div className={`${cardBg} rounded-2xl border p-5 shadow-3xs space-y-4`}>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-[#8993a8]!">Scan Information</h3>
            
            <div className="space-y-3 text-xs font-medium">
              <div className="flex justify-between items-center py-0.5 border-b border-gray-100 dark:border-[#243044]/60">
                <span className="text-slate-400 dark:text-[#8993a8]">Results Loaded</span>
                <span className="text-gray-950 dark:text-slate-200">{scanTimestamp}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-gray-100 dark:border-[#243044]/60">
                <span className="text-slate-400 dark:text-[#8993a8]">Detection Mode</span>
                <span className="text-gray-950 dark:text-slate-200">{detectionMode === 'exact' ? 'Exact' : detectionMode === 'similar' ? 'Similar' : 'Visual'}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-gray-100 dark:border-[#243044]/60">
                <span className="text-slate-400 dark:text-[#8993a8]">Images in Library</span>
                <span className="text-gray-950 dark:text-slate-200">{coverage ? coverage.total_images.toLocaleString() : '—'}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-gray-100 dark:border-[#243044]/60">
                <span className="text-slate-400 dark:text-[#8993a8]">Scanned</span>
                <span className="text-gray-950 dark:text-slate-200">{coverage ? coverage.hashed_images.toLocaleString() : '—'}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-gray-100 dark:border-[#243044]/60">
                <span className="text-slate-400 dark:text-[#8993a8]">Not Scanned Yet</span>
                <span className="text-gray-950 dark:text-slate-200">{coverage ? coverage.unscanned_images.toLocaleString() : '—'}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400 dark:text-[#8993a8]">Visual Match Not Possible</span>
                <span className="text-gray-950 dark:text-slate-200">{coverage ? (coverage.visual_unsupported_images + (coverage.phash_outdated_images ?? 0)).toLocaleString() : '—'}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Replace References Confirmation Modal */}
      {replaceTargetCopy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-gray-200 dark:border-[#243044] p-6 space-y-4">
            
            {/* Modal Title/Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#243044]/80 pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${replacementStatus === 'completed' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600' : 'bg-blue-100 dark:bg-blue-950/60 text-blue-600'} rounded-xl flex items-center justify-center`}>
                  <RefreshCw className={`w-5 h-5 ${replacementStatus === 'running' ? 'animate-spin text-blue-600' : ''}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white!">Replace References & Clean</h3>
                  <p className="text-xs text-slate-500 dark:text-[#8993a8]">Update WordPress database references to point to original</p>
                </div>
              </div>
              {replacementStatus !== 'running' && (
                <button 
                  onClick={() => setReplaceTargetCopy(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer dark:text-[#8993a8]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Target & Primary Info Cards */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider dark:text-[#8993a8]">Duplicate File (Target)</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 truncate block max-w-full" title={replaceTargetCopy.filename}>
                  {replaceTargetCopy.filename}
                </span>
                <span className="text-[10px] text-slate-500 block dark:text-[#8993a8]">Size: {replaceTargetCopy.fileSize} KB</span>
              </div>
              <div className="space-y-1 border-l border-gray-200 dark:border-slate-700/80 pl-3">
                <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider dark:text-[#8993a8]">Original File (To Keep)</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate block max-w-full" title={currentGroup.originalImage.filename}>
                  {currentGroup.originalImage.filename}
                </span>
                <span className="text-[10px] text-slate-500 block dark:text-[#8993a8]">Size: {currentGroup.originalImage.fileSize} KB</span>
              </div>
            </div>

            {/* Live Progress Bar during active simulation */}
            {replacementStatus === 'running' && (
              <div className="space-y-2 py-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-bold text-blue-600 dark:text-blue-400 animate-pulse">Running replacement transactions...</span>
                  <span className="font-black text-gray-700 dark:text-slate-300">{replacementProgress}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${replacementProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Simulated Database Location Records List */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                {replacementStatus === 'completed' ? 'Transaction Log' : 'Affected Database References'}
              </span>
              <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-[#243044] rounded-xl bg-slate-50/50 dark:bg-slate-900/30 p-2 space-y-1.5 scrollbar-thin">
                {isLoadingPreview ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                    <p className="text-[11px] text-slate-500 dark:text-[#8993a8]">Querying database references...</p>
                  </div>
                ) : replacementLocations.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic text-center py-4 dark:text-[#8993a8]">No active-use references found.</p>
                ) : (
                  replacementLocations.map(loc => {
                    const isFailed = loc.status === 'Failed';
                    const isManualLoc = loc.status === 'Manual';
                    const isSuccess = loc.status === 'Success';
                    const isPending = loc.status === 'Pending';
                    
                    return (
                      <div 
                        key={loc.id} 
                        className={`p-2.5 rounded-xl border ${
                          isFailed 
                            ? 'bg-rose-500/5 border-rose-500/10 dark:border-rose-500/20' 
                            : isSuccess 
                            ? 'bg-emerald-500/5 border-emerald-500/10 dark:border-emerald-500/20' 
                            : 'bg-white dark:bg-slate-800/40 border-gray-200/60 dark:border-[#243044]/80'
                        } flex flex-col gap-1.5 transition-all text-xs`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate max-w-[70%]">
                            <span className="font-bold text-gray-800 dark:text-slate-200 block truncate" title={loc.title}>
                              {loc.title}
                            </span>
                            <span className="text-[9px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded-md border border-gray-200/50 dark:border-slate-700/50 shrink-0">
                              {loc.type}
                            </span>
                          </div>

                          {/* Live Status Badge */}
                          <div className="shrink-0">
                            {isPending && replacementStatus === 'running' && (
                              <span className="flex items-center gap-1 text-[10px] text-blue-500 font-bold">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span>Updating...</span>
                              </span>
                            )}
                            {isPending && replacementStatus === 'idle' && (
                              <span className={`text-[10px] font-semibold ${loc.manual ? 'text-amber-600' : 'text-slate-400'}`}>{loc.manual ? 'Manual check' : 'Will be changed'}</span>
                            )}
                            {isManualLoc && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Not changed</span>
                              </span>
                            )}
                            {isSuccess && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Swapped</span>
                              </span>
                            )}
                            {isFailed && (
                              <span className="flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Blocked</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Breadcrumb info */}
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 leading-none">
                          <span className="font-medium">DB Field:</span>
                          <span className="font-mono bg-slate-100 dark:bg-slate-800/60 px-1 py-0.5 rounded text-[9px] text-gray-700 dark:text-slate-300 truncate max-w-[200px]" title={loc.breadcrumb}>
                            {loc.breadcrumb}
                          </span>
                        </div>

                        {/* Links and manual-check label */}
                        {(loc.viewUrl || loc.editUrl || loc.manual || loc.status === 'Manual') && (
                          <div className="flex items-center flex-wrap gap-3 text-[10px]">
                            {loc.viewUrl && (
                              <a href={loc.viewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-bold underline">View</a>
                            )}
                            {loc.editUrl && (
                              <a href={loc.editUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-bold underline">Edit</a>
                            )}
                            {(loc.manual || loc.status === 'Manual') && (
                              <span className="font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md" title={loc.manualReason || loc.errorDetails || 'Check this place by hand.'}>
                                Manual check
                              </span>
                            )}
                          </div>
                        )}

                        {/* Error info details */}
                        {(isFailed || isManualLoc) && loc.errorDetails && (
                          <div className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 leading-normal font-medium bg-rose-500/5 border border-rose-500/10 p-1.5 rounded-lg flex gap-1.5 items-start">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-bounce" />
                            <span>{loc.errorDetails}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* Informative text & Warnings depending on state */}
            {replacementStatus === 'idle' && (
              <p className="text-[11px] text-slate-500 leading-relaxed dark:text-[#8993a8]">
                This changes the image URL, ID and size variants in the places listed above so they point to the original. Places marked "Manual check" are not changed; fix them yourself. You can undo the last replacement right after.
              </p>
            )}

            {replacementStatus === 'completed' && (
              <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                replacementLocations.some(l => l.status === 'Failed' || l.status === 'Manual' || (l.manual && l.status !== 'Success'))
                  ? 'bg-amber-500/5 border-amber-500/15 text-amber-800 dark:text-amber-300'
                  : 'bg-emerald-500/5 border-emerald-500/15 text-emerald-800 dark:text-emerald-300'
              }`}>
                {replacementLocations.some(l => l.status === 'Failed' || l.status === 'Manual' || (l.manual && l.status !== 'Success')) ? (
                  <div className="flex gap-2.5 items-start">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400 animate-pulse" />
                    <div>
                      <strong className="font-bold block mb-0.5 text-amber-900 dark:text-amber-200">Transaction Halted with Unresolved References</strong>
                      <span>
                        Some places could not be changed automatically. This duplicate is NOT marked safe to trash. Update those places by hand in WordPress or your page builder, then scan again.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2.5 items-start">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <strong className="font-bold block mb-0.5 text-emerald-900 dark:text-emerald-200">All Swaps Executed Successfully!</strong>
                      <span>
                        All {replacementLocations.length} database entries have been cleanly pointed to the primary image. This duplicate is now classified as "Unused" and is safe to delete.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-[#243044]/80">
              {replacementStatus === 'idle' ? (
                <>
                  <button 
                    onClick={() => setReplaceTargetCopy(null)}
                    className="px-4 py-2 text-xs font-bold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-[#1e293b] text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleReplaceReferences(replaceTargetCopy.id, replaceTargetCopy.filename)}
                    disabled={isLoadingPreview}
                    className="px-4 py-2 text-xs font-bold bg-[#A61E69] hover:bg-[#8F1B5A] text-white rounded-xl cursor-pointer shadow-md"
                  >
                    Confirm & Replace References
                  </button>
                </>
              ) : replacementStatus === 'completed' ? (
                <>
                  {undoOperationId && (
                    <button 
                      onClick={handleUndoReplacement}
                      disabled={isUndoing}
                      className="px-4 py-2 text-xs font-bold bg-amber-100 hover:bg-amber-200 dark:hover:bg-amber-500/15 text-amber-800 rounded-xl cursor-pointer shadow-md mr-auto flex items-center gap-2"
                    >
                      {isUndoing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                      {isUndoing ? 'Undoing...' : 'Undo Replacement'}
                    </button>
                  )}
                  <button 
                    onClick={() => setReplaceTargetCopy(null)}
                    className="px-4 py-2 text-xs font-bold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-[#1e293b] text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer shadow-md"
                  >
                    Close Window
                  </button>
                </>
              ) : (
                <button 
                  disabled
                  className="px-4 py-2 text-xs font-bold bg-gray-100 dark:bg-slate-800 text-slate-400 rounded-xl cursor-not-allowed flex items-center gap-2 dark:text-[#8993a8]"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Set as Original Confirmation Modal */}
      {setOriginalTargetCopy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-gray-200 dark:border-[#243044] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl flex items-center justify-center text-emerald-600">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white!">Override Primary Original</h3>
                <p className="text-xs text-slate-500 dark:text-[#8993a8]">Designate this copy as the new source of truth</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-[#8993a8]">New Original:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[200px]">{setOriginalTargetCopy.filename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 dark:text-[#8993a8]">Previous Original:</span>
                <span className="font-bold text-gray-900 dark:text-white truncate max-w-[200px]">{currentGroup.originalImage.filename}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed dark:text-[#8993a8]">
              Overriding the original changes which file is kept as the primary source. The previous original will be converted into a duplicate copy in this group and may be flagged for deletion.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                onClick={() => setSetOriginalTargetCopy(null)}
                className="px-4 py-2 text-xs font-bold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-[#1e293b] text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSetAsOriginal(setOriginalTargetCopy)}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer shadow-md"
              >
                Confirm & Set as Original
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cannot Trash — File In Use */}
      {blockedTrashTarget && (
        (() => {
          const usedCount = blockedTrashTarget.usedInCount || 1;
          const placeNoun = usedCount === 1 ? 'place' : 'places';

          return (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn font-sans box-border"
              onClick={handleCloseBlockedModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="blocked-trash-modal-title"
            >
              <div 
                className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1118] text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 bg-rose-950/60 border-rose-800/50 text-rose-400">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 id="blocked-trash-modal-title" className="font-bold text-base text-white" style={{ color: '#ffffff' }}>
                        Cannot Trash — File In Use
                      </h3>
                      <p className="text-xs text-[#8f97a9]" style={{ color: '#8f97a9' }}>
                        In-use files stay out of Trash
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseBlockedModal}
                    className="p-1.5 text-[#8f97a9] hover:text-white rounded-lg cursor-pointer transition-colors border-0 bg-transparent"
                    aria-label="Close dialog"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-[#181b25] border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#8f97a9] uppercase tracking-wider">Duplicate File</span>
                      <span className="text-[11px] font-mono text-[#d4d7df] bg-white/5 px-2 py-0.5 rounded border border-white/5">
                        Size: {blockedTrashTarget.fileSize} KB
                      </span>
                    </div>
                    <div className="font-semibold text-sm text-white truncate" title={blockedTrashTarget.filename} style={{ color: '#ffffff' }}>
                      {blockedTrashTarget.filename}
                    </div>
                    {blockedTrashTarget.path && (
                      <div className="text-[11px] text-[#8f97a9] font-mono truncate" title={blockedTrashTarget.path}>
                        {blockedTrashTarget.path}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-rose-300 text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>File is Currently In Use</span>
                    </div>
                    <p className="text-rose-200 text-xs leading-relaxed">
                      This file is used in {usedCount} {placeNoun}. Use "Replace References" to point those places to the original first. After that the copy can be moved to Trash.
                    </p>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-white/5 bg-[#111421]/90 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseBlockedModal}
                    className="px-4 py-2 text-xs font-semibold text-[#d4d7df] border border-white/15 bg-transparent hover:bg-[#202433] rounded-lg cursor-pointer transition-colors shadow-2xs"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenReplaceModal(blockedTrashTarget);
                      setBlockedTrashTarget(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] rounded-lg cursor-pointer shadow-sm flex items-center gap-2 transition-all active:scale-98 border-none"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Replace References</span>
                    {replaceRefsLocked && <ProLockBadge isDarkMode={isDarkMode} label="PRO" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Export Report Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-gray-200 dark:border-[#243044] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/60 rounded-xl flex items-center justify-center text-blue-600">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white!">Export Duplicate Scan Report</h3>
                  <p className="text-xs text-slate-500 dark:text-[#8993a8]">Generate server-side downloadable report package</p>
                </div>
              </div>
              <button 
                onClick={() => !isExporting && handleCloseExport()}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer dark:text-[#8993a8]"
              >
                &times;
              </button>
            </div>

            {/* Snapshot Summary Mirroring Top KPI Cards */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-2">
                <span className="text-[11px] font-bold uppercase text-slate-400 dark:text-[#8993a8]">Scan Snapshot Metadata</span>
                <span className="text-[10px] font-mono bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-200/50 dark:border-blue-900/50">{scanTimestamp}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold dark:text-[#8993a8]">Detection Mode</span>
                  <strong className="text-gray-900 dark:text-white font-bold">{detectionMode === 'exact' ? 'Exact duplicates' : detectionMode === 'similar' ? 'Similar images' : 'Visual duplicates'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold dark:text-[#8993a8]">Total Groups</span>
                  <strong className="text-gray-900 dark:text-white font-bold">{duplicateGroupsCount} Groups</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold dark:text-[#8993a8]">Duplicate Files</span>
                  <strong className="text-gray-900 dark:text-white font-bold">{(duplicateFilesCount ?? 0).toLocaleString()} Files</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold dark:text-[#8993a8]">Recoverable Storage</span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-black">{potentialSpaceSaving} MB</strong>
                </div>
              </div>
            </div>

            {/* Format Selection */}
            {!isExporting && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-900 dark:text-white block">Select Export Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      exportFormat === 'csv'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-2xs'
                        : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-black">CSV Spreadsheet (.csv)</span>
                    <span className="text-[10px] text-slate-500 dark:text-[#8993a8]">Row per file with path, resolution, and status</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('pdf')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      exportFormat === 'pdf'
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 shadow-2xs'
                        : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-black">PDF Document (.pdf)</span>
                    <span className="text-[10px] text-slate-500 dark:text-[#8993a8]">Formatted summary report with KPI headers</span>
                  </button>
                </div>
              </div>
            )}

            {/* Progress Bar during Export */}
            {isExporting && (
              <div className="space-y-3 py-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#A61E69]" />
                    {exportStatusText}
                  </span>
                  <span className="text-[#A61E69]">{exportProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#A61E69] h-full transition-all duration-300 rounded-full"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                onClick={() => handleCloseExport()}
                disabled={isExporting}
                className="px-4 py-2 text-xs font-bold bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-[#1e293b] text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleStartExport}
                disabled={isExporting}
                className="px-5 py-2 text-xs font-bold bg-[#A61E69] hover:bg-[#8F1B5A] text-white rounded-xl cursor-pointer shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Generating...' : `Generate & Download ${exportFormat.toUpperCase()}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions Floating Bar */}
      {selectedItemIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 pr-6 border-r border-gray-200 dark:border-[#243044]">
            <div className="w-10 h-10 bg-[#A61E69] text-white rounded-xl flex items-center justify-center font-black">
              {selectedItemIds.length}
            </div>
            <div>
              <p className="text-xs font-black text-gray-900 dark:text-white leading-none">Files Selected</p>
              <p className="text-[10px] text-slate-500 font-bold mt-1 dark:text-[#8993a8]">Ready for bulk action</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {bulkConfirmAction ? (
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-900/50">
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wider">Move {selectedItemIds.length} file(s) to Trash?</span>
                <div className="flex gap-1">
                  <button 
                    onClick={executeBulkAction}
                    className="px-3 py-1.5 bg-rose-600 text-white text-[10px] font-black rounded-lg hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    Yes, Execute
                  </button>
                  <button 
                    onClick={() => setBulkConfirmAction(null)}
                    className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-[10px] font-black rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button 
                  onClick={() => setSelectedItemIds([])}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setBulkConfirmAction('trash')}
                  className="px-5 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-500/15 rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Move to Trash</span>
                </button>
              </>
            )}
          </div>

          <button 
            onClick={() => {
              setSelectedItemIds([]);
              setBulkConfirmAction(null);
            }}
            className="ml-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer dark:text-[#8993a8]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ImageUsageDetailsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        item={drawerTarget}
        isDarkMode={isDarkMode}
      />

      <UpgradePromptModal
        open={isReplaceUpgradeOpen}
        onClose={() => setIsReplaceUpgradeOpen(false)}
        isDarkMode={isDarkMode}
        title="Replace References is a Pro Feature"
        message="Upgrade to ImgSentry Business or Professional to point every use of a duplicate image to the original with one click, with a full list of changes and Undo."
        upgradeUrl={getProFeatures().upgradeUrl}
        context="duplicate_replace_lock"
        feature="duplicate_replace_refs"
      />
    </div>
  );
};
