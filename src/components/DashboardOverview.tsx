import React, { useState, useEffect, useRef } from 'react';
import { 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip 
} from 'recharts';
import { 
  CheckCircle2, 
  Trash2, 
  Clock, 
  Zap, 
  FolderCheck, 
  AlertTriangle, 
  Play, 
  FolderOpen, 
  Calendar, 
  Settings, 
  FileText, 
  ArrowRight, 
  Sparkles,
  Crown,
  Info,
  ShieldCheck,
  TrendingDown,
  PieChart,
  Search,
  Copy,
  Gauge,
  BarChart3,
  ChevronRight,
  X,
  Check,
  Layers,
  Image,
  RefreshCw
} from 'lucide-react';
import { MediaItem, AuditLogEntry, PluginSettings, ScanHistoryEntry, SystemStorageBreakdown } from '../types';
import { useScanStatus } from '../utils/scanStatus';
import { getProFeatures, openUpgrade, ProLockBadge } from './ProLock';
import { formatDateWithTimeZone, formatDateOnlyWithTimeZone, formatTimeOnlyWithTimeZone } from '../utils/timeZoneUtils';

export interface UpgradeToProCardProps {
  onUpgrade?: () => void;
  isDarkMode?: boolean;
  /** Current plan. Business sites see "Upgrade to Professional". */
  plan?: 'free' | 'business' | 'professional';
}

export const UpgradeToProCard: React.FC<UpgradeToProCardProps> = ({
  onUpgrade,
  isDarkMode = false,
  plan = 'free'
}) => {
  const isBusiness = plan === 'business';
  const handleUpgradeClick = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Single helper: always opens the pricing page in a new tab (fallback URL is only for the standalone preview).
      openUpgrade('dashboard_card', undefined, getProFeatures().upgradeUrl || 'https://wpcodely.com/plugin/imgsentry/');
    }
  };

  return (
    <div className={`w-full rounded-2xl p-5 flex flex-col justify-between relative shadow-xs border ${
      isDarkMode
        ? 'bg-[#8F1B5A]/[0.10] border-[#8F1B5A]/35 text-[#e7ecf3]'
        : 'bg-[#8F1B5A]/[0.06] border-[#8F1B5A]/25 text-gray-900'
    }`}>
      {/* Top Header: Icon Badge & Title */}
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-[30px] h-[30px] rounded-[8px] bg-[#8F1B5A] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Crown className="w-4 h-4" />
          </div>
          <span className={`text-sm font-bold ${isDarkMode ? 'text-[#f48cb9]' : 'text-[#8F1B5A]'}`}>
            {isBusiness ? 'Upgrade to Professional' : 'Upgrade to Pro'}
          </span>
        </div>

        {/* One line descriptive copy */}
        <p className={`text-xs leading-relaxed mb-4 ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-700'}`}>
          {isBusiness
            ? 'Remove the monthly optimization limit with unlimited images and file size.'
            : 'Automate your media cleanup and get more from your optimization plan.'}
        </p>

        {/* Short checklist of 3 real Pro features */}
        {!isBusiness && (
        <ul className="space-y-2.5 mb-5">
          <li className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-800'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-[#8F1B5A]/30' : 'bg-[#8F1B5A]/15'
            }`}>
              <Check className={`w-2.5 h-2.5 stroke-[3] ${isDarkMode ? 'text-[#f48cb9]' : 'text-[#8F1B5A]'}`} />
            </div>
            <span><strong className={`font-semibold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Scheduled scans</strong> with auto-move of unused files to Trash</span>
          </li>
          <li className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-800'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-[#8F1B5A]/30' : 'bg-[#8F1B5A]/15'
            }`}>
              <Check className={`w-2.5 h-2.5 stroke-[3] ${isDarkMode ? 'text-[#f48cb9]' : 'text-[#8F1B5A]'}`} />
            </div>
            <span><strong className={`font-semibold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Bulk Trash actions</strong> and scheduled auto-delete</span>
          </li>
          <li className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-800'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-[#8F1B5A]/30' : 'bg-[#8F1B5A]/15'
            }`}>
              <Check className={`w-2.5 h-2.5 stroke-[3] ${isDarkMode ? 'text-[#f48cb9]' : 'text-[#8F1B5A]'}`} />
            </div>
            <span><strong className={`font-semibold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Replace duplicate references</strong></span>
          </li>
          <li className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-800'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-[#8F1B5A]/30' : 'bg-[#8F1B5A]/15'
            }`}>
              <Check className={`w-2.5 h-2.5 stroke-[3] ${isDarkMode ? 'text-[#f48cb9]' : 'text-[#8F1B5A]'}`} />
            </div>
            <span><strong className={`font-semibold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Media Trends</strong> and scan webhook</span>
          </li>
          <li className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-800'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-[#8F1B5A]/30' : 'bg-[#8F1B5A]/15'
            }`}>
              <Check className={`w-2.5 h-2.5 stroke-[3] ${isDarkMode ? 'text-[#f48cb9]' : 'text-[#8F1B5A]'}`} />
            </div>
            <span><strong className={`font-semibold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Optimize on your own site</strong> when the server is down</span>
          </li>
          <li className={`flex items-start gap-2 text-xs ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-800'}`}>
            <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-[#8F1B5A]/30' : 'bg-[#8F1B5A]/15'
            }`}>
              <Check className={`w-2.5 h-2.5 stroke-[3] ${isDarkMode ? 'text-[#f48cb9]' : 'text-[#8F1B5A]'}`} />
            </div>
            <span><strong className={`font-semibold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Higher optimization limits</strong> (Business and Professional)</span>
          </li>
        </ul>
        )}
      </div>

      {/* Upgrade Now Button */}
      <button
        onClick={handleUpgradeClick}
        className="w-full bg-[#8F1B5A] hover:bg-[#781449] active:bg-[#68103e] text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs group"
      >
        <span>{isBusiness ? 'Upgrade to Professional' : 'Upgrade Now'}</span>
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
};

interface DashboardOverviewProps {
  mediaList: MediaItem[];
  auditLog: AuditLogEntry[];
  settings: PluginSettings;
  scanHistory: ScanHistoryEntry[];
  onNavigate: (tab: string, subTab?: string) => void;
  onStartScan: () => void;
  onOpenSmartCleanup: () => void;
  isDarkMode?: boolean;
  duplicateFilesCount?: number;
  duplicateTotalSizeBytes?: number;
  isPro?: boolean;
  onUpgradeToPro?: () => void;
  systemStorage?: SystemStorageBreakdown | null;
  isSystemStorageLoading?: boolean;
  fmTrashTotalBytes?: number;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  mediaList,
  auditLog,
  settings,
  scanHistory,
  onNavigate,
  onStartScan,
  onOpenSmartCleanup,
  isDarkMode = false,
  duplicateFilesCount = 0,
  duplicateTotalSizeBytes = 0,
  isPro = false,
  onUpgradeToPro,
  systemStorage: propSystemStorage,
  isSystemStorageLoading: propIsSystemStorageLoading = false,
  fmTrashTotalBytes
}) => {
  const scanStatus = useScanStatus();
  // License check: defaults to isPro prop (false), fallback to window.imgsentry_data?.is_pro
  // The Upgrade to Pro card is non-removable and always visible for free/non-Pro installs
  const effectiveIsPro = isPro || Boolean(typeof window !== 'undefined' && ((window as any).imgsentry_data?.is_pro || (window as any).imgsentryData?.is_pro));
  const wpPlan = typeof window !== 'undefined' ? (window as any).imgsentry_data?.plan : undefined;
  // Free sites see "Upgrade to Pro"; Business sites see "Upgrade to Professional"; Professional sites see nothing.
  const showUpgradeCard = !effectiveIsPro || wpPlan === 'business';

  // Real System Storage Breakdown from WordPress backend
  const [localSystemStorage, setLocalSystemStorage] = useState<SystemStorageBreakdown | null>(() => {
    if (propSystemStorage !== undefined && propSystemStorage !== null) return propSystemStorage;
    if (typeof window !== 'undefined' && (window as any).imgsentry_data?.system_storage) {
      return (window as any).imgsentry_data.system_storage;
    }
    return null;
  });
  const [isLocalLoading, setIsLocalLoading] = useState<boolean>(false);
  const [isRefreshingStats, setIsRefreshingStats] = useState<boolean>(false);
  const [dashboardTotals, setDashboardTotals] = useState<any>(null);

  const fetchedTotalsRef = useRef<boolean>(false);
  const fetchedStorageRef = useRef<boolean>(false);

  // Auto-fetch dashboard totals and system storage on mount with retry for window.imgsentry_data
  useEffect(() => {
    if (propSystemStorage !== undefined && propSystemStorage !== null) {
      setLocalSystemStorage(propSystemStorage);
    }

    let intervalId: any = null;
    let timeoutId: any = null;

    const executeAutoFetch = () => {
      const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
      if (!imgsentryData || !(imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
        return false;
      }

      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const nonce = imgsentryData.nonce || imgsentryData.imgsentry_admin_nonce;

      // 1. Auto-fetch dashboard totals if not already fetched
      if (!fetchedTotalsRef.current) {
        fetchedTotalsRef.current = true;
        const fdTotals = new FormData();
        fdTotals.append('action', 'imgsentry_get_dashboard_totals');
        fdTotals.append('nonce', nonce || '');

        fetch(ajaxUrl, {
          method: 'POST',
          body: fdTotals
        })
          .then(res => res.json())
          .then(resData => {
            if (resData.success && resData.data) {
              setDashboardTotals(resData.data);
              if (resData.data.system_storage) {
                setLocalSystemStorage(resData.data.system_storage);
                fetchedStorageRef.current = true;
              }
            }
          })
          .catch(err => {
            console.error('Failed to auto-fetch dashboard totals in DashboardOverview:', err);
          });
      }

      // 2. Auto-fetch system storage if not passed via props and not already fetched
      if ((propSystemStorage === undefined || propSystemStorage === null) && !fetchedStorageRef.current) {
        fetchedStorageRef.current = true;
        setIsLocalLoading(true);
        const fdStorage = new FormData();
        fdStorage.append('action', 'imgsentry_get_system_storage');
        fdStorage.append('nonce', nonce || '');

        fetch(ajaxUrl, {
          method: 'POST',
          body: fdStorage
        })
          .then(res => res.json())
          .then(resData => {
            if (resData.success && resData.data?.system_storage) {
              setLocalSystemStorage(resData.data.system_storage);
            }
          })
          .catch(err => {
            console.error('Failed to fetch system storage in DashboardOverview:', err);
          })
          .finally(() => {
            setIsLocalLoading(false);
          });
      }

      return true;
    };

    // Attempt immediately on mount
    const success = executeAutoFetch();

    // If window.imgsentry_data / ajax_url was not yet ready, retry every 150ms up to 5000ms
    if (!success) {
      intervalId = setInterval(() => {
        if (executeAutoFetch()) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 150);

      timeoutId = setTimeout(() => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 5000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [propSystemStorage]);

  const handleRefreshStats = async () => {
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const nonce = imgsentryData.nonce || imgsentryData.imgsentry_admin_nonce;
      setIsRefreshingStats(true);
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_get_dashboard_totals');
        fd.append('force_refresh', 'true');
        fd.append('nonce', nonce || '');

        const res = await fetch(ajaxUrl, {
          method: 'POST',
          body: fd
        });
        const resData = await res.json();
        if (resData.success && resData.data) {
          setDashboardTotals(resData.data);
          if (resData.data.system_storage) {
            setLocalSystemStorage(resData.data.system_storage);
          }
        }
      } catch (err) {
        console.error('Failed to force refresh dashboard totals:', err);
      } finally {
        setIsRefreshingStats(false);
      }
    } else {
      // In standalone / preview mode, simulate refresh cycle
      setIsRefreshingStats(true);
      setTimeout(() => {
        setIsRefreshingStats(false);
      }, 500);
    }
  };

  const systemStorage = (propSystemStorage !== undefined && propSystemStorage !== null) ? propSystemStorage : localSystemStorage;
  const isStorageLoading = propIsSystemStorageLoading || isLocalLoading;

  const activeItems = mediaList.filter(i => !i.isTrashed);
  const trashedItems = mediaList.filter(i => i.isTrashed);

  const unusedItems = activeItems.filter(i => !i.inUse);
  const usedItems = activeItems.filter(i => i.inUse);

  const totalCount = dashboardTotals?.dashboard_stats?.total_attachments ?? activeItems.length;
  const usedCount = dashboardTotals?.dashboard_stats?.used_count ?? usedItems.length;
  const unusedCount = dashboardTotals?.dashboard_stats?.unused_count ?? unusedItems.length;

  // Item 4: Fix Ghost File Bug - detect files missing from disk and exclude phantom sizes (Approach a)
  const missingFilesCount = activeItems.filter(i => i.fileMissing || i.file_missing).length;

  // Item 1: Thumbnail / Sub-size Volumes aggregated across active media
  const totalThumbnailsBytes = activeItems.reduce((acc, i) => acc + (i.thumbnailSizesBytes || 0), 0);

  // Active original primary file sizes on disk (excluding missing/ghost files)
  const totalOriginalSizeBytes = activeItems.reduce((acc, i) => {
    if (i.fileMissing || i.file_missing) return acc;
    return acc + (i.fileSize || 0);
  }, 0);

  // Active Library Total = Primary files on disk + intermediate generated thumbnails
  const totalActiveMediaBytes = totalOriginalSizeBytes + totalThumbnailsBytes;

  const usedSizeBytes = usedItems.reduce((acc, i) => {
    if (i.fileMissing || i.file_missing) return acc;
    return acc + (i.fileSize || 0) + (i.thumbnailSizesBytes || 0);
  }, 0);
  const unusedSizeBytes = unusedItems.reduce((acc, i) => {
    if (i.fileMissing || i.file_missing) return acc;
    return acc + (i.fileSize || 0) + (i.thumbnailSizesBytes || 0);
  }, 0);

  // Item 3: System & Hidden Storage Breakdown Calculations
  // 1. Active Library (with time-budget calculation_incomplete detection)
  const isCalculationIncomplete = Boolean(dashboardTotals?.calculation_incomplete || systemStorage?.calculation_incomplete);
  const displayedActiveMediaBytes = systemStorage?.active_library_bytes !== undefined
    ? systemStorage.active_library_bytes
    : totalActiveMediaBytes;

  // 2. Trash & Quarantine (Media Trash + File Manager Trash)
  // Double-counting safe: uses real trash_quarantine_bytes from backend when available
  const mediaTrashBytes = trashedItems.reduce((acc, i) => {
    if (i.fileMissing || i.file_missing) return acc;
    return acc + (i.fileSize || 0) + (i.thumbnailSizesBytes || 0);
  }, 0);
  // Real FM trash bytes from prop or backend breakdown (never fall back to fake hardcoded values)
  const fmTrashBytes = fmTrashTotalBytes ?? (systemStorage?.trash_fm_bytes ?? 0);
  const localTrashBytes = mediaTrashBytes + fmTrashBytes;
  const displayedTrashQuarantineBytes = systemStorage?.trash_quarantine_bytes !== undefined
    ? systemStorage.trash_quarantine_bytes
    : localTrashBytes;

  // 3. Optimization Backups (tracked via _imgsentry_backup_path / _imgsentry_backup_original_path)
  const totalOptimizationBackupsBytes = mediaList.reduce((acc, i) => {
    if (i.backupSizeBytes && i.backupSizeBytes > 0) {
      return acc + i.backupSizeBytes;
    }
    if (i.backupCreated) {
      const origBytes = i.originalSizeKB ? i.originalSizeKB * 1024 : i.fileSize;
      return acc + origBytes;
    }
    return acc;
  }, 0);
  const displayedOptimizationBackupsBytes = systemStorage?.optimization_backups_bytes !== undefined
    ? systemStorage.optimization_backups_bytes
    : totalOptimizationBackupsBytes;

  // 4. Next-Gen Sibling Formats (sum of WebP/AVIF sibling file sizes tracked via _imgsentry_nextgen_formats)
  const totalNextGenSiblingBytes = mediaList.reduce((acc, item) => {
    let size = 0;
    if (item.nextgenSizesBytes && item.nextgenSizesBytes > 0) {
      size += item.nextgenSizesBytes;
    } else if (item.nextGenFormats?.siblingSizeBytes) {
      size += item.nextGenFormats.siblingSizeBytes;
    } else if (item.next_gen_formats && typeof item.next_gen_formats === 'object') {
      if (item.next_gen_formats.webp?.size_bytes && item.next_gen_formats.webp?.exists) {
        size += Number(item.next_gen_formats.webp.size_bytes);
      }
      if (item.next_gen_formats.avif?.size_bytes && item.next_gen_formats.avif?.exists) {
        size += Number(item.next_gen_formats.avif.size_bytes);
      }
    }
    return acc + size;
  }, 0);
  const displayedNextGenSiblingBytes = systemStorage?.nextgen_siblings_bytes !== undefined
    ? systemStorage.nextgen_siblings_bytes
    : totalNextGenSiblingBytes;

  const localWebpCopiesCount = mediaList.reduce((acc, item) => {
    if (item.next_gen_formats && typeof item.next_gen_formats === 'object') {
      const w = item.next_gen_formats.webp;
      if (w && (w.exists || w.path || w.file_path)) {
        return acc + 1;
      }
    }
    return acc;
  }, 0);

  const localAvifCopiesCount = mediaList.reduce((acc, item) => {
    if (item.next_gen_formats && typeof item.next_gen_formats === 'object') {
      const a = item.next_gen_formats.avif;
      if (a && (a.exists || a.path || a.file_path)) {
        return acc + 1;
      }
    }
    return acc;
  }, 0);

  const localNextGenSiblingCount = localWebpCopiesCount + localAvifCopiesCount;

  const displayedNextGenSiblingCount = systemStorage?.nextgen_siblings_count !== undefined
    ? systemStorage.nextgen_siblings_count
    : localNextGenSiblingCount;

  const displayedWebpCopiesCount = systemStorage?.webp_copies_count !== undefined
    ? systemStorage.webp_copies_count
    : localWebpCopiesCount;

  const displayedAvifCopiesCount = systemStorage?.avif_copies_count !== undefined
    ? systemStorage.avif_copies_count
    : localAvifCopiesCount;

  const localOptimizedCount = mediaList.filter(i => !i.isTrashed && i.optimizationStatus === 'optimized').length;
  const displayedOptimizedCount = dashboardTotals?.optimization?.optimized_count !== undefined
    ? dashboardTotals.optimization.optimized_count
    : localOptimizedCount;

  const latestScan = scanHistory && scanHistory.length > 0 ? scanHistory[0] : null;
  const lastScanType = latestScan ? latestScan.scanType : 'No scan history';

  const lastScanDateText = latestScan 
    ? formatDateOnlyWithTimeZone(latestScan.timestamp, settings.timeZone) 
    : 'Never';
  const lastScanTimeText = latestScan 
    ? formatTimeOnlyWithTimeZone(latestScan.timestamp, settings.timeZone) 
    : '';

  const usedPercentage = totalCount > 0 ? Math.round((usedCount / totalCount) * 100) : 0;
  const unusedPercentage = totalCount > 0 ? Math.round((unusedCount / totalCount) * 100) : 0;

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0 || !Number.isFinite(bytes) || bytes < 1) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
    return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(2)) + ' ' + sizes[safeIndex];
  };

  // Item 1: Category breakdown for Storage Donut Chart, now including "Thumbnails" category
  const imagesPrimaryBytes = activeItems
    .filter(i => i.category === 'images' && !i.fileMissing && !i.file_missing)
    .reduce((a, b) => a + (b.fileSize || 0), 0);

  const categorySource = dashboardTotals?.category_sizes;
  const imagesBytes = categorySource ? categorySource.images : imagesPrimaryBytes;
  const thumbnailsBytes = categorySource ? (systemStorage?.active_thumbnails_bytes ?? totalThumbnailsBytes) : totalThumbnailsBytes;
  const videosBytes = categorySource ? categorySource.video : activeItems.filter(i => i.category === 'video' && !i.fileMissing && !i.file_missing).reduce((a, b) => a + (b.fileSize || 0), 0);
  const documentsBytes = categorySource ? categorySource.documents : activeItems.filter(i => i.category === 'documents' && !i.fileMissing && !i.file_missing).reduce((a, b) => a + (b.fileSize || 0), 0);
  const audioBytes = categorySource ? categorySource.audio : activeItems.filter(i => i.category === 'audio' && !i.fileMissing && !i.file_missing).reduce((a, b) => a + (b.fileSize || 0), 0);
  const fontsOtherBytes = categorySource ? (categorySource.fonts + categorySource.other) : activeItems.filter(i => (i.category === 'fonts' || i.category === 'other') && !i.fileMissing && !i.file_missing).reduce((a, b) => a + (b.fileSize || 0), 0);

  const categoryStorageColors: Record<string, string> = isDarkMode ? {
    'Images': '#60a5fa',
    'Thumbnails': '#22d3ee',
    'Videos': '#fbbf24',
    'Documents': '#4ade80',
    'Audio': '#a78bfa',
    'Fonts & Other': '#94a3b8',
  } : {
    'Images': '#5B8DEF',
    'Thumbnails': '#06B6D4',
    'Videos': '#F5A524',
    'Documents': '#34D399',
    'Audio': '#A78BFA',
    'Fonts & Other': '#8B93A3',
  };

  const categoryStorageData = [
    { name: 'Images', value: imagesBytes, color: categoryStorageColors['Images'] },
    { name: 'Thumbnails', value: thumbnailsBytes, color: categoryStorageColors['Thumbnails'] },
    { name: 'Videos', value: videosBytes, color: categoryStorageColors['Videos'] },
    { name: 'Documents', value: documentsBytes, color: categoryStorageColors['Documents'] },
    { name: 'Audio', value: audioBytes, color: categoryStorageColors['Audio'] },
    { name: 'Fonts & Other', value: fontsOtherBytes, color: categoryStorageColors['Fonts & Other'] },
  ].filter(d => d.value > 0);

  // File type count breakdown for File Type Pie Chart
  const fileTypeGroups: Record<string, number> = {
    'WEBP': 0,
    'AVIF': 0,
    'SVG': 0,
    'JPG/JPEG': 0,
    'PNG': 0,
    'Videos': 0,
    'Documents': 0,
    'Archives': 0,
    'Others': 0
  };

  const fileTypeCountsSource = dashboardTotals?.file_type_counts;

  if (fileTypeCountsSource) {
    fileTypeGroups['WEBP'] = fileTypeCountsSource['WEBP'] ?? 0;
    fileTypeGroups['AVIF'] = fileTypeCountsSource['AVIF'] ?? 0;
    fileTypeGroups['SVG'] = fileTypeCountsSource['SVG'] ?? 0;
    fileTypeGroups['JPG/JPEG'] = fileTypeCountsSource['JPG/JPEG'] ?? 0;
    fileTypeGroups['PNG'] = fileTypeCountsSource['PNG'] ?? 0;
    fileTypeGroups['Videos'] = fileTypeCountsSource['Videos'] ?? 0;
    fileTypeGroups['Documents'] = fileTypeCountsSource['Documents'] ?? 0;
    fileTypeGroups['Archives'] = fileTypeCountsSource['Archives'] ?? 0;
    fileTypeGroups['Others'] = fileTypeCountsSource['Others'] ?? 0;
  } else {
    activeItems.forEach(item => {
      const rawExt = item.display_extension || item.effective_format || item.displayExtension || item.effectiveFormat || item.extension || '';
      const ext = rawExt.toUpperCase();
      if (ext === 'WEBP') {
        fileTypeGroups['WEBP']++;
      } else if (ext === 'AVIF') {
        fileTypeGroups['AVIF']++;
      } else if (ext === 'SVG') {
        fileTypeGroups['SVG']++;
      } else if (ext === 'JPG' || ext === 'JPEG') {
        fileTypeGroups['JPG/JPEG']++;
      } else if (ext === 'PNG') {
        fileTypeGroups['PNG']++;
      } else if (['MP4', 'WEBM', 'MOV', 'AVI', 'MKV'].includes(ext)) {
        fileTypeGroups['Videos']++;
      } else if (['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PPT', 'PPTX', 'TXT', 'CSV'].includes(ext)) {
        fileTypeGroups['Documents']++;
      } else if (['ZIP', 'TAR', 'GZ', 'RAR', '7Z'].includes(ext)) {
        fileTypeGroups['Archives']++;
      } else {
        fileTypeGroups['Others']++;
      }
    });
  }

  const fileTypeColors: Record<string, string> = isDarkMode ? {
    'JPG/JPEG': '#60a5fa',
    'PNG': '#818cf8',
    'Videos': '#f472b6',
    'AVIF': '#22d3ee',
    'SVG': '#fb923c',
    'Documents': '#a78bfa',
    'WEBP': '#34d399',
    'Archives': '#f87171',
    'Others': '#94a3b8',
  } : {
    'WEBP': '#10B981',      // Emerald
    'AVIF': '#06B6D4',      // Cyan/Teal
    'SVG': '#F59E0B',       // Amber/Orange
    'JPG/JPEG': '#3B82F6',  // Blue
    'PNG': '#6366F1',       // Indigo
    'Videos': '#EC4899',    // Pink
    'Documents': '#8B5CF6', // Purple
    'Archives': '#EF4444',  // Rose
    'Others': '#6B7280',    // Gray
  };

  const fileTypeData = Object.entries(fileTypeGroups)
    .filter(([_, count]) => count > 0)
    .map(([name, count]) => ({
      name,
      value: count,
      percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
      color: fileTypeColors[name] || (isDarkMode ? '#94a3b8' : '#6B7280')
    }))
    .sort((a, b) => b.value - a.value);

  const duplicateFilesPercentage = totalCount > 0 ? Math.round((duplicateFilesCount / totalCount) * 100) : 0;

  const cardBg = isDarkMode 
    ? 'bg-[#111827] border-[#243044] text-[#e7ecf3]' 
    : 'bg-white border-gray-200 text-gray-900';
  const subText = isDarkMode ? 'text-[#8993a8]' : 'text-gray-500';

  // Custom styled Tooltip component for Storage Usage Donut Chart
  const CustomStorageTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const categoryName = data.name;
      const valueInBytes = Number(data.value);
      const color = data.payload?.color || (isDarkMode ? '#60a5fa' : '#3b82f6');
      const tooltipDenominator = displayedActiveMediaBytes > 0 ? displayedActiveMediaBytes : totalActiveMediaBytes;
      const percentage = tooltipDenominator > 0 ? ((valueInBytes / tooltipDenominator) * 100).toFixed(1) : '0';

      return (
        <div className={`${isDarkMode ? 'bg-[#1e293b] text-[#e7ecf3] border-[#334155]' : 'bg-slate-900/95 text-white border-slate-700/80'} border rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs min-w-[160px] z-50 pointer-events-none`}>
          <div className={`flex items-center gap-2 mb-1.5 pb-1.5 border-b ${isDarkMode ? 'border-[#334155]' : 'border-slate-800'}`}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
            <span className={`font-bold text-xs ${isDarkMode ? 'text-[#e7ecf3]' : 'text-slate-200'}`}>{categoryName}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-1">
            <span className={`text-sm font-black ${isDarkMode ? 'text-[#e7ecf3]' : 'text-white'}`}>{formatSize(valueInBytes)}</span>
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-[#8993a8] bg-[#0f172a] border-[#334155]' : 'text-blue-400 bg-blue-950/80 border-blue-800/50'}`}>
              {percentage}%
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom styled Tooltip component for File Type Distribution Chart
  const CustomFileTypeTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const extName = data.name;
      const count = data.value;
      const color = data.payload?.color || (isDarkMode ? '#60a5fa' : '#2271b1');
      const percentage = data.payload?.percentage || 0;

      return (
        <div className={`${isDarkMode ? 'bg-[#1e293b] text-[#e7ecf3] border-[#334155]' : 'bg-slate-900/95 text-white border-slate-700/80'} border rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs min-w-[150px] z-50 pointer-events-none`}>
          <div className={`flex items-center gap-2 mb-1.5 pb-1.5 border-b ${isDarkMode ? 'border-[#334155]' : 'border-slate-800'}`}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
            <span className={`font-bold text-xs ${isDarkMode ? 'text-[#e7ecf3]' : 'text-slate-200'}`}>{extName} Format</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-1">
            <span className={`text-sm font-black ${isDarkMode ? 'text-[#e7ecf3]' : 'text-white'}`}>{count} {count === 1 ? 'file' : 'files'}</span>
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-[#8993a8] bg-[#0f172a] border-[#334155]' : 'text-emerald-400 bg-emerald-950/80 border-emerald-800/50'}`}>
              {percentage}%
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Optimization Stats: prioritize backend dashboardTotals, fall back to mediaList calculations
  const optStats = React.useMemo(() => {
    if (dashboardTotals?.optimization && dashboardTotals?.category_sizes) {
      const optimizedBytes = Number(dashboardTotals.category_sizes.images || 0);
      const savedBytes = Number(dashboardTotals.optimization.total_bytes_saved || 0);
      const originalBytes = optimizedBytes + savedBytes;
      const savingsPct = originalBytes > 0 ? parseFloat(((savedBytes / originalBytes) * 100).toFixed(1)) : 0;

      return {
        originalBytes,
        optimizedBytes,
        savedBytes,
        savingsPct
      };
    }

    const images = mediaList.filter(item => item.category === 'images' && !item.isTrashed);
    
    let currentStorageBytes = 0;
    let storageSavedBytes = 0;

    images.forEach(item => {
      if (item.optimizationStatus === 'optimized') {
        let itemSavedBytes = 0;
        if (typeof item.bytesSaved === 'number' && item.bytesSaved > 0) {
          itemSavedBytes = item.bytesSaved;
        } else if (typeof item.bytes_saved === 'number' && item.bytes_saved > 0) {
          itemSavedBytes = item.bytes_saved;
        } else if (item.originalSizeKB && item.optimizedSizeKB && item.originalSizeKB > item.optimizedSizeKB) {
          itemSavedBytes = (item.originalSizeKB - item.optimizedSizeKB) * 1024;
        } else if (item.originalSizeKB && (item.fileSize || 0) > 0 && (item.originalSizeKB * 1024) > item.fileSize) {
          itemSavedBytes = (item.originalSizeKB * 1024) - item.fileSize;
        } else if (item.optimizedSizeKB && (item.fileSize || 0) > (item.optimizedSizeKB * 1024)) {
          itemSavedBytes = (item.fileSize || 0) - (item.optimizedSizeKB * 1024);
        } else if (item.savingPercent && item.savingPercent > 0 && (item.fileSize || 0) > 0) {
          const original = item.fileSize / (1 - item.savingPercent / 100);
          itemSavedBytes = Math.round(original - item.fileSize);
        }

        let itemEffectiveSize = item.effective_size || item.effectiveSize || (item.optimizedSizeKB ? item.optimizedSizeKB * 1024 : undefined);
        if (itemEffectiveSize === undefined || itemEffectiveSize <= 0) {
          if (item.originalSizeKB) {
            itemEffectiveSize = Math.max(0, (item.originalSizeKB * 1024) - itemSavedBytes);
          } else {
            itemEffectiveSize = item.fileSize || 0;
          }
        }

        currentStorageBytes += itemEffectiveSize;
        storageSavedBytes += itemSavedBytes;
      } else {
        currentStorageBytes += item.fileSize || 0;
      }
    });

    const originalBytes = currentStorageBytes + storageSavedBytes;
    const savingsPct = originalBytes > 0 ? (storageSavedBytes / originalBytes) * 100 : 0;

    return {
      originalBytes,
      optimizedBytes: currentStorageBytes,
      savedBytes: storageSavedBytes,
      savingsPct: parseFloat(savingsPct.toFixed(1))
    };
  }, [mediaList, dashboardTotals]);

  // Circular progress dimensions
  const radius = 38;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (optStats.savingsPct / 100) * circumference;

  const displayTotalScanned = totalCount;
  const displayUnusedCount = unusedCount;
  const displayUsedCount = usedCount;
  const displayDuplicates = duplicateFilesCount;
  const displayRecoverableSpace = formatSize(unusedSizeBytes);

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  };

  const isDataLoading = !dashboardTotals && mediaList.length === 0;

  return (
    <div className={`space-y-5 ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
      {/* KPI Metric Cards Grid (5 Cards) */}
      {isDataLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {[...Array(5)].map((_, i) => (
            <div 
              key={i} 
              className={`${cardBg} rounded-xl p-4 border shadow-2xs h-full min-h-[96px] animate-pulse flex items-center justify-between`}
            >
              <div className="space-y-2.5 flex-1 min-w-0">
                <div className="h-2.5 w-16 bg-slate-200 dark:bg-slate-700/60 rounded" />
                <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700/60 rounded-md" />
                <div className="h-4 w-28 bg-slate-100 dark:bg-slate-800/60 rounded" />
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800/60 shrink-0 ml-2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Total Media */}
          <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
            <div className="space-y-1 min-w-0 flex-1">
              <span className={`text-[10px] uppercase tracking-wider font-extrabold block leading-none ${isDarkMode ? 'text-[#8993a8]' : 'text-slate-400'}`}>Total Files</span>
              <div className={`text-xl font-black mt-1.5 block leading-none ${isDarkMode ? 'text-[#60a5fa]' : 'text-blue-600'}`}>{totalCount.toLocaleString()}</div>
              <div className={`text-[12px] font-semibold px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight ${isDarkMode ? 'bg-[#60a5fa]/15 text-[#60a5fa]' : 'text-blue-700 bg-blue-100'}`}>
                All files in media library
              </div>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ml-2 ${isDarkMode ? 'bg-[#60a5fa]/15 text-[#60a5fa]' : 'bg-blue-50 text-blue-600'}`}>
              <FolderCheck className="w-6 h-6" />
            </div>
          </div>

          {/* Used Files */}
          <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
            <div className="space-y-1 min-w-0 flex-1">
              <span className={`text-[10px] uppercase tracking-wider font-extrabold block leading-none ${isDarkMode ? 'text-[#8993a8]' : 'text-slate-400'}`}>Used Files</span>
              <div className={`text-xl font-black mt-1.5 block leading-none ${scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] font-normal' : 'text-gray-400') : (isDarkMode ? 'text-[#4ade80]' : 'text-emerald-600')}`}>
                {scanStatus.isRunning ? 'Calculating…' : usedCount.toLocaleString()}
              </div>
              <div className={`text-[12px] font-semibold px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight ${scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] bg-[#1e293b]' : 'text-gray-400 bg-gray-100') : (isDarkMode ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'text-emerald-700 bg-emerald-100')}`}>
                {scanStatus.isRunning ? 'Calculating…' : `${usedPercentage}% of total files`}
              </div>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ml-2 ${isDarkMode ? 'bg-[#4ade80]/15 text-[#4ade80]' : 'bg-emerald-50 text-emerald-600'}`}>
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          {/* Unused Files */}
          <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
            <div className="space-y-1 min-w-0 flex-1">
              <span className={`text-[10px] uppercase tracking-wider font-extrabold block leading-none ${isDarkMode ? 'text-[#8993a8]' : 'text-slate-400'}`}>Unused Files</span>
              <div className={`text-xl font-black mt-1.5 block leading-none ${scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] font-normal' : 'text-gray-400') : (isDarkMode ? 'text-[#fbbf24]' : 'text-amber-600')}`}>
                {scanStatus.isRunning ? 'Calculating…' : unusedCount.toLocaleString()}
              </div>
              <div className={`text-[12px] font-semibold px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight ${scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] bg-[#1e293b]' : 'text-gray-400 bg-gray-100') : (isDarkMode ? 'bg-[#fbbf24]/15 text-[#fbbf24]' : 'text-amber-800 bg-amber-100')}`}>
                {scanStatus.isRunning ? 'Calculating…' : `${unusedPercentage}% can be cleaned`}
              </div>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ml-2 ${isDarkMode ? 'bg-[#fbbf24]/15 text-[#fbbf24]' : 'bg-amber-50 text-amber-600'}`}>
              <Trash2 className="w-6 h-6" />
            </div>
          </div>

          {/* Total Duplicate Files */}
          <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
            <div className="space-y-1 min-w-0 flex-1">
              <span className={`text-[10px] uppercase tracking-wider font-extrabold block leading-none ${isDarkMode ? 'text-[#8993a8]' : 'text-slate-400'}`}>Duplicate Files</span>
              <div className={`text-xl font-black mt-1.5 block leading-none ${isDarkMode ? 'text-[#f87171]' : 'text-rose-600'}`}>{duplicateFilesCount.toLocaleString()}</div>
              <div className={`text-[12px] font-semibold px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight ${isDarkMode ? 'bg-[#f87171]/15 text-[#f87171]' : 'text-rose-700 bg-rose-100'}`}>
                {formatSize(duplicateTotalSizeBytes)}
              </div>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ml-2 ${isDarkMode ? 'bg-[#f87171]/15 text-[#f87171]' : 'bg-rose-50 text-rose-600'}`}>
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>

          {/* Last Scan */}
          <div className={`${cardBg} rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]`}>
            <div className="space-y-1 min-w-0 flex-1">
              <span className={`text-[10px] uppercase tracking-wider font-extrabold block leading-none ${isDarkMode ? 'text-[#8993a8]' : 'text-slate-400'}`}>Last Scan</span>
              <div className={`text-xl font-black mt-1.5 block leading-none truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-indigo-600'}`}>{lastScanDateText}</div>
              {lastScanTimeText ? (
                <div className={`text-[12px] font-semibold px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight ${isDarkMode ? 'bg-[#1e293b] text-[#8993a8]' : 'text-indigo-700 bg-indigo-50'}`}>
                  {lastScanTimeText} · {lastScanType}
                </div>
              ) : (
                <div className={`text-[12px] font-semibold px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight ${isDarkMode ? 'bg-[#1e293b] text-[#8993a8]' : 'text-indigo-700 bg-indigo-50'}`}>
                  No scans yet
                </div>
              )}
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ml-2 ${isDarkMode ? 'bg-[#1e293b] text-[#8993a8]' : 'bg-indigo-50 text-indigo-600'}`}>
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Row A: Space Usage & File Type Distribution (2-Column Grid) */}
      {isDataLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Space Usage Skeleton */}
          <div className={`${cardBg} rounded-2xl p-5 border shadow-sm animate-pulse min-h-[360px] flex flex-col justify-between`}>
            <div className="space-y-4">
              <div className={`flex items-center justify-between pb-3 border-b ${isDarkMode ? 'border-[#243044]' : 'border-gray-100'}`}>
                <div className="space-y-1.5">
                  <div className="h-4 w-28 bg-slate-200 dark:bg-slate-700/60 rounded" />
                  <div className="h-3 w-48 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
                <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700/60 rounded-md" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4 py-6">
                <div className="flex items-center justify-center">
                  <div className={`w-36 h-36 rounded-full border-8 ${isDarkMode ? 'border-[#243044]' : 'border-slate-200'}`} />
                </div>
                <div className="space-y-3">
                  {[...Array(4)].map((_, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700/60 rounded" />
                      <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800/60 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* File Type Distribution Skeleton */}
          <div className={`${cardBg} rounded-2xl p-5 border shadow-sm animate-pulse min-h-[360px] flex flex-col justify-between`}>
            <div className="space-y-4">
              <div className={`flex items-center justify-between pb-3 border-b ${isDarkMode ? 'border-[#243044]' : 'border-gray-100'}`}>
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-slate-200 dark:bg-slate-700/60 rounded" />
                  <div className="h-3 w-44 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700/60 rounded-md" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4 py-6">
                <div className="flex items-center justify-center">
                  <div className={`w-36 h-36 rounded-full border-8 ${isDarkMode ? 'border-[#243044]' : 'border-slate-200'}`} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(6)].map((_, idx) => (
                    <div key={idx} className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Storage Usage Donut Chart & System Storage Card */}
          <div className={`${cardBg} rounded-2xl p-5 border shadow-sm flex flex-col justify-between relative z-10`}>
            <div>
              <div className={`flex flex-wrap items-center justify-between gap-2 pb-3 border-b mb-4 ${isDarkMode ? 'border-[#243044]' : 'border-gray-100'}`}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`font-bold text-sm ${isDarkMode ? '!text-[#e7ecf3]' : 'text-gray-900'}`}>Space Usage</h3>
                    {missingFilesCount > 0 && (
                      <span 
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${isDarkMode ? 'text-[#fbbf24] bg-[#fbbf24]/10 border-[#fbbf24]/30' : 'text-amber-700 bg-amber-50 border-amber-200'}`}
                        title={`${missingFilesCount} database attachment records have no physical file on disk (FTP/SSH deleted). Their sizes are excluded (0 B).`}
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        {missingFilesCount} Broken / Missing on Disk
                      </span>
                    )}
                    {Boolean(dashboardTotals?.calculation_incomplete) && (
                      <span 
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${isDarkMode ? 'text-[#fbbf24] bg-[#fbbf24]/10 border-[#fbbf24]/30' : 'text-amber-700 bg-amber-50 border-amber-200'}`}
                        title="Some totals may be incomplete due to server execution limits — recalculating in background."
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        Some totals may be incomplete — recalculating in background
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${subText}`}>Distribution of physical space across media categories & sub-sizes</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${isDarkMode ? 'text-[#60a5fa] bg-[#60a5fa]/15 border-[#60a5fa]/30' : 'text-indigo-600 bg-indigo-50 border-indigo-200/50'}`}>
                    {formatSize(displayedActiveMediaBytes)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4 py-2">
                <div className="h-48 min-h-[192px] min-w-[200px] w-full relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <RechartsPieChart>
                      <Pie
                        data={categoryStorageData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        stroke={isDarkMode ? '#111827' : '#ffffff'}
                      >
                        {categoryStorageData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke={isDarkMode ? '#111827' : '#ffffff'} />
                        ))}
                      </Pie>
                      <Tooltip 
                        wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                        allowEscapeViewBox={{ x: true, y: true }} 
                        content={<CustomStorageTooltip />} 
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className={`text-base font-extrabold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{formatSize(displayedActiveMediaBytes)}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}`}>Active Media</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  {categoryStorageData.map((cat, idx) => {
                    const pctDenominator = displayedActiveMediaBytes > 0 ? displayedActiveMediaBytes : totalActiveMediaBytes;
                    const pct = pctDenominator > 0 ? ((cat.value / pctDenominator) * 100).toFixed(1) : '0';
                    return (
                      <div key={idx} className="flex items-center justify-between py-0.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className={`font-medium ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-700'}`}>{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{formatSize(cat.value)}</span>
                          <span className={`text-[11px] ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-500'}`}>({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Item 3: Secondary "System / Hidden Storage" Breakdown */}
              <div className={`mt-4 pt-3.5 border-t ${isDarkMode ? 'border-[#243044]' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}`}>
                    System & Hidden Storage Footprint
                  </span>
                  <span className={`text-[11px] ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>
                    Tracked on disk
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Active Library */}
                  <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-indigo-950/60 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>Active Library</p>
                        <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Originals + Sub-sizes</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-2">
                      {isStorageLoading && !systemStorage ? (
                        <span className={`text-xs italic animate-pulse ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                      ) : (
                        <span className={`font-mono font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                          {formatSize(displayedActiveMediaBytes)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Trash & Quarantine */}
                  <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-rose-950/60 text-rose-400' : 'bg-rose-100 text-rose-600'}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>Trash & Quarantine</p>
                        <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Media & File Trash</p>
                      </div>
                    </div>
                    {isStorageLoading && !systemStorage ? (
                      <span className={`text-xs italic animate-pulse shrink-0 ml-2 ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                    ) : (
                      <span className={`font-mono font-bold shrink-0 ml-2 ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                        {formatSize(displayedTrashQuarantineBytes)}
                      </span>
                    )}
                  </div>

                  {/* Optimization Backups */}
                  <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-amber-950/60 text-amber-400' : 'bg-amber-100 text-amber-600'}`}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>Optimization Backups</p>
                        <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Pre-compression copies</p>
                      </div>
                    </div>
                    {isStorageLoading && !systemStorage ? (
                      <span className={`text-xs italic animate-pulse shrink-0 ml-2 ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                    ) : (
                      <span className={`font-mono font-bold shrink-0 ml-2 ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                        {formatSize(displayedOptimizationBackupsBytes)}
                      </span>
                    )}
                  </div>

                  {/* Next-Gen Sibling Formats */}
                  <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-emerald-950/60 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Image className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>Next-Gen Siblings</p>
                        <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>WebP & AVIF formats</p>
                      </div>
                    </div>
                    {isStorageLoading && !systemStorage ? (
                      <span className={`text-xs italic animate-pulse shrink-0 ml-2 ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                    ) : (
                      <span className={`font-mono font-bold shrink-0 ml-2 ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                        {formatSize(displayedNextGenSiblingBytes)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* File Type Distribution Chart */}
          <div className={`${cardBg} rounded-2xl p-5 border shadow-sm flex flex-col justify-between relative z-10`}>
            <div>
              <div className={`flex items-center justify-between pb-3 border-b mb-4 ${isDarkMode ? 'border-[#243044]' : 'border-gray-100'}`}>
                <div>
                  <h3 className={`font-bold text-sm ${isDarkMode ? '!text-[#e7ecf3]' : 'text-gray-900'}`}>File Type Distribution</h3>
                  <p className={`text-xs ${subText}`}>Count of files by format extension</p>
                </div>
                <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${isDarkMode ? 'text-[#4ade80] bg-[#4ade80]/15 border-[#4ade80]/30' : 'text-emerald-600 bg-emerald-50 border-emerald-200/50'}`}>
                  {totalCount} Total
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4 py-2">
                <div className="h-48 min-h-[192px] min-w-[200px] w-full relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <RechartsPieChart>
                      <Pie
                        data={fileTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        stroke={isDarkMode ? '#111827' : '#ffffff'}
                      >
                        {fileTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke={isDarkMode ? '#111827' : '#ffffff'} />
                        ))}
                      </Pie>
                      <Tooltip 
                        wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                        allowEscapeViewBox={{ x: true, y: true }} 
                        content={<CustomFileTypeTooltip />} 
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className={`text-base font-extrabold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{totalCount}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}`}>Files</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  {fileTypeData.map((ft, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ft.color }} />
                        <span className={`font-mono font-bold truncate ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-700'}`} title={ft.name}>{ft.name}</span>
                      </div>
                      <div className="flex items-center gap-1 font-mono shrink-0 ml-1">
                        <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{ft.value}</span>
                        <span className={`text-[10px] ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-500'}`}>({ft.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Next-Gen & Optimized Files Counts Section */}
            <div className={`mt-4 pt-3.5 border-t ${isDarkMode ? 'border-[#243044]' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}`}>
                  Next-Gen & Optimized Files
                </span>
                <span className={`text-[11px] ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>
                  Total copy counts
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Optimized Originals */}
                <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-amber-950/60 text-amber-400' : 'bg-amber-100 text-amber-600'}`}>
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>Optimized Originals</p>
                      <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Standard optimization</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    {isStorageLoading && !systemStorage ? (
                      <span className={`text-xs italic animate-pulse ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                    ) : (
                      <span className={`font-mono font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                        {displayedOptimizedCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Total Sibling Copies */}
                <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-indigo-950/60 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>Total Sibling Copies</p>
                      <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Next-gen duplicates</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    {isStorageLoading && !systemStorage ? (
                      <span className={`text-xs italic animate-pulse ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                    ) : (
                      <span className={`font-mono font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                        {displayedNextGenSiblingCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* WebP Sibling Copies */}
                <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-emerald-950/60 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                      <Image className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>WebP Sibling Copies</p>
                      <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Lossy lightweight format</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    {isStorageLoading && !systemStorage ? (
                      <span className={`text-xs italic animate-pulse ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                    ) : (
                      <span className={`font-mono font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                        {displayedWebpCopiesCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* AVIF Sibling Copies */}
                <div className={`flex items-center justify-between p-2 rounded-lg border ${isDarkMode ? 'bg-[#131c2e] border-[#243044]' : 'bg-gray-50/80 border-gray-100'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-emerald-950/60 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                      <Image className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <p className={`font-semibold truncate ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-800'}`}>AVIF Sibling Copies</p>
                      <p className={`text-[10px] truncate ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Next-gen highly compressed</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    {isStorageLoading && !systemStorage ? (
                      <span className={`text-xs italic animate-pulse ${isDarkMode ? 'text-[#5b6579]' : 'text-gray-400'}`}>Calculating...</span>
                    ) : (
                      <span className={`font-mono font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                        {displayedAvifCopiesCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Row B: Quick Actions (left ~62%) & Upgrade to Pro (right ~38%) */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        {/* Quick Actions Panel (~62% width or 100% if upgrade card dismissed/pro) */}
        <div className={`${cardBg} rounded-2xl p-5 border shadow-sm flex flex-col justify-between relative z-10 transition-all ${
          showUpgradeCard ? 'w-full lg:w-[62%]' : 'w-full'
        }`}>
          <div>
            <h3 className={`font-extrabold text-sm mb-4 ${isDarkMode ? '!text-[#e7ecf3]' : 'text-gray-900'}`}>Quick Actions</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Scan Media Library */}
              <button
                onClick={onStartScan}
                className={`flex items-center justify-between px-4 py-3.5 border rounded-xl w-full text-left transition-all cursor-pointer group ${
                  isDarkMode
                    ? 'bg-[#111827] border-[#243044] hover:border-blue-500/50'
                    : 'bg-white border-gray-100 hover:border-blue-500/50 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 group-hover:scale-105 transition-transform ${
                    isDarkMode ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}>
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-[12px] leading-snug ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Scan Media Library</h4>
                    <p className={`text-[10px] ${subText}`}>Start a new scan</p>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-[#5b6579]' : 'text-slate-400'}`} />
              </button>

              {/* Remove Unused Files */}
              <button
                onClick={() => onNavigate('unused')}
                className={`flex items-center justify-between px-4 py-3.5 border rounded-xl w-full text-left transition-all cursor-pointer group ${
                  isDarkMode
                    ? 'bg-[#111827] border-[#243044] hover:border-red-500/50'
                    : 'bg-white border-gray-100 hover:border-red-500/50 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 group-hover:scale-105 transition-transform ${
                    isDarkMode ? 'bg-red-950/40 text-red-400' : 'bg-red-50 text-red-600'
                  }`}>
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-[12px] leading-snug ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Remove Unused Files</h4>
                    <p className={`text-[10px] ${subText}`}>Clean unused files</p>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-[#5b6579]' : 'text-slate-400'}`} />
              </button>

              {/* View Duplicates */}
              <button
                onClick={() => onNavigate('duplicate')}
                className={`flex items-center justify-between px-4 py-3.5 border rounded-xl w-full text-left transition-all cursor-pointer group ${
                  isDarkMode
                    ? 'bg-[#111827] border-[#243044] hover:border-purple-500/50'
                    : 'bg-white border-gray-100 hover:border-purple-500/50 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 group-hover:scale-105 transition-transform ${
                    isDarkMode ? 'bg-purple-950/40 text-purple-400' : 'bg-purple-50 text-purple-600'
                  }`}>
                    <Copy className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-[12px] leading-snug ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>View Duplicates</h4>
                    <p className={`text-[10px] ${subText}`}>Find & manage duplicates</p>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-[#5b6579]' : 'text-slate-400'}`} />
              </button>

              {/* Optimize Images */}
              <button
                onClick={() => onNavigate('image_optimization')}
                className={`flex items-center justify-between px-4 py-3.5 border rounded-xl w-full text-left transition-all cursor-pointer group ${
                  isDarkMode
                    ? 'bg-[#111827] border-[#243044] hover:border-emerald-500/50'
                    : 'bg-white border-gray-100 hover:border-emerald-500/50 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 group-hover:scale-105 transition-transform ${
                    isDarkMode ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    <Gauge className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-[12px] leading-snug ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>Optimize Images</h4>
                    <p className={`text-[10px] ${subText}`}>Compress & optimize</p>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-[#5b6579]' : 'text-slate-400'}`} />
              </button>

              {/* View Reports - Spanning full width on last row */}
              <button
                onClick={() => onNavigate('reports')}
                className={`flex items-center justify-between px-4 py-3.5 border rounded-xl w-full text-left transition-all cursor-pointer group sm:col-span-2 ${
                  isDarkMode
                    ? 'bg-[#111827] border-[#243044] hover:border-indigo-500/50'
                    : 'bg-white border-gray-100 hover:border-indigo-500/50 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 group-hover:scale-105 transition-transform ${
                    isDarkMode ? 'bg-indigo-950/40 text-[#5B8DEF]' : 'bg-blue-50 text-blue-600'
                  }`}>
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`font-bold text-[12px] leading-snug ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>View Reports</h4>
                    <p className={`text-[10px] ${subText}`}>See detailed reports</p>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-[#5b6579]' : 'text-slate-400'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Upgrade to Pro Card (right ~38% width, non-removable for free users) */}
        {showUpgradeCard && (
          <div className="w-full lg:w-[38%] flex">
            <UpgradeToProCard
              onUpgrade={onUpgradeToPro}
              isDarkMode={isDarkMode}
              plan={wpPlan === 'business' ? 'business' : 'free'}
            />
          </div>
        )}
      </div>

      {/* Alert & Optimization Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`border rounded-2xl p-4 flex items-start gap-3.5 ${
          isDarkMode
            ? 'bg-[#fbbf24]/10 border-[#fbbf24]/30'
            : 'bg-amber-50/50 border-amber-200'
        }`}>
          <div className={`p-2.5 rounded-xl shrink-0 ${
            isDarkMode
              ? 'bg-[#fbbf24]/15 text-[#fbbf24]'
              : 'bg-amber-500 text-white'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h4 className={`font-bold text-sm ${isDarkMode ? 'text-[#e7ecf3]' : 'text-amber-900'}`}>High Number of Unused Files Detected</h4>
            <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-[#8993a8]' : 'text-amber-800/90'}`}>
              You have <strong className={scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] font-normal' : 'text-gray-400 font-normal') : (isDarkMode ? 'text-[#fbbf24]' : 'text-amber-950')}>{scanStatus.isRunning ? 'Calculating…' : `${unusedCount} unused media files`}</strong> occupying <strong className={scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] font-normal' : 'text-gray-400 font-normal') : (isDarkMode ? 'text-[#fbbf24]' : 'text-amber-950')}>{scanStatus.isRunning ? 'Calculating…' : formatSize(unusedSizeBytes)}</strong>. We recommend running Smart Cleanup to safely move them to trash.
            </p>
            <button
              onClick={() => onNavigate('unused')}
              className={`mt-3 text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
                isDarkMode
                  ? 'bg-[#fbbf24] hover:bg-[#d98e1d] text-[#1a1200]'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              <span>View Unused Files</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {(() => {
          const purgeAllowed = getProFeatures().features.trash_auto_purge;
          const purgeOn = purgeAllowed && settings.autoPurgeTrashEnabled !== false;
          return (
        <div className={`border rounded-2xl p-4 flex items-start gap-3.5 ${
          isDarkMode
            ? 'bg-[#A61E69]/10 border-[#A61E69]/20'
            : 'bg-[#A61E69]/5 border-[#A61E69]/20'
        }`}>
          <div className="p-2.5 bg-[#A61E69] text-white rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h4 className={`font-bold text-sm flex items-center gap-2 flex-wrap ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
              <span>Automatic Trash Cleanup</span>
              {!purgeAllowed && <ProLockBadge isDarkMode={isDarkMode} />}
            </h4>
            <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-[#8993a8]' : 'text-slate-600'}`}>
              {!purgeAllowed ? (
                <>Paid plans can delete old Trash items automatically after a number of days you choose.</>
              ) : purgeOn ? (
                <>Trash items older than <strong className={isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}>{settings.retentionDays} days</strong> are deleted permanently and automatically.</>
              ) : (
                <>Automatic cleanup is turned off. Turn it on in Settings to delete old Trash items automatically.</>
              )}
            </p>
            <button
              onClick={() => {
                if (!purgeAllowed) {
                  openUpgrade('dashboard_card', 'trash_auto_purge', getProFeatures().upgradeUrl || 'https://wpcodely.com/plugin/imgsentry/');
                  return;
                }
                onNavigate('settings', 'auto');
              }}
              className="mt-3 bg-[#A61E69] hover:bg-[#8F1B5A] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <span>{purgeAllowed ? 'Go to Settings' : 'See paid plans'}</span>
              {purgeAllowed ? <Settings className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
          );
        })()}
      </div>

      {/* Last Scan Summary & Optimization Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Last Scan Summary Card */}
        <div className={`${cardBg} rounded-2xl p-5 border shadow-sm flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between pb-3 mb-4">
              <h3 className={`font-extrabold text-sm ${isDarkMode ? '!text-[#e7ecf3]' : 'text-gray-900'}`}>Last Scan Summary</h3>
              <button
                onClick={() => onNavigate('reports')}
                className={`text-xs border rounded-lg px-2.5 py-1.5 font-semibold cursor-pointer transition-all ${
                  isDarkMode
                    ? 'bg-[#111827] border-[#243044] text-[#e7ecf3] hover:bg-[#1e293b]'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                View Reports
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Left Column */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Scan Type</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{lastScanType ? lastScanType.replace(/full scan/i, 'Deep Scan') : 'Deep Scan'}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Start Time</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{latestScan ? formatDateWithTimeZone(latestScan.timestamp, settings.timeZone, 'MMM DD, YYYY h:mm A') : 'May 20, 2025 10:30 AM'}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Duration</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                    {latestScan ? formatDuration(latestScan.durationSeconds) : '2m 45s'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Status</span>
                  <div className={`flex items-center gap-1.5 font-bold ${isDarkMode ? 'text-[#4ade80]' : 'text-emerald-600'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${isDarkMode ? 'fill-[#4ade80]/20 text-[#4ade80]' : 'fill-emerald-50 text-emerald-600'}`} />
                    <span>Completed</span>
                  </div>
                </div>
              </div>

              {/* Right Column (with vertical border on md/lg screens) */}
              <div className={`space-y-3 md:pl-6 md:border-l ${isDarkMode ? 'border-[#243044]' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Total Files Scanned</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{(displayTotalScanned ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Used Files Found</span>
                  <span className={`font-bold ${scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] font-normal' : 'text-gray-400 font-normal') : (isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900')}`}>
                    {scanStatus.isRunning ? 'Calculating…' : (displayUsedCount ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Unused Files Found</span>
                  <span className={`font-bold ${scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] font-normal' : 'text-gray-400 font-normal') : (isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900')}`}>
                    {scanStatus.isRunning ? 'Calculating…' : (displayUnusedCount ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Duplicates Found</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{(displayDuplicates ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Recoverable Space</span>
                  <span className={`font-bold ${scanStatus.isRunning ? (isDarkMode ? 'text-[#5b6579] font-normal' : 'text-gray-400 font-normal') : (isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900')}`}>
                    {scanStatus.isRunning ? 'Calculating…' : displayRecoverableSpace}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Optimization Overview Card */}
        <div className={`${cardBg} rounded-2xl p-5 border shadow-sm flex flex-col justify-between`}>
          <div>
            <div className="flex items-center justify-between pb-3 mb-4">
              <h3 className={`font-extrabold text-sm ${isDarkMode ? '!text-[#e7ecf3]' : 'text-gray-900'}`}>Optimization Overview</h3>
              <div className="relative">
                <select
                  onChange={(e) => {
                    if (e.target.value === 'optimization') {
                      onNavigate('image_optimization');
                    } else if (e.target.value === 'settings') {
                      onNavigate('settings', 'advanced');
                    }
                    e.target.value = 'default';
                  }}
                  className={`text-xs border rounded-lg px-2.5 py-1.5 font-semibold cursor-pointer transition-all outline-none appearance-none pr-8 relative ${
                    isDarkMode
                      ? 'bg-[#111827] border-[#243044] text-[#e7ecf3] hover:bg-[#1e293b]'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                  value="default"
                >
                  <option value="default" disabled hidden>View Optimization</option>
                  <option value="optimization">Optimize Images</option>
                  <option value="settings">Compression Settings</option>
                </select>
                <div className={`pointer-events-none absolute inset-y-0 right-0 flex flex-center flex items-center px-2.5 ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}`}>
                  <svg className="fill-current h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4">
              {/* Left Group */}
              <div className="space-y-4 w-full md:flex-1">
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Original Size</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{formatSize(optStats.originalBytes)}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Optimized Size</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>{formatSize(optStats.optimizedBytes)}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-0.5">
                  <span className={isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}>Savings</span>
                  <span className={`font-bold ${isDarkMode ? 'text-[#4ade80]' : 'text-emerald-600'}`}>
                    {formatSize(optStats.savedBytes)} ({optStats.savingsPct}%)
                  </span>
                </div>
              </div>

              {/* Right Group: Circular Progress Chart */}
              <div className="flex items-center justify-center shrink-0 w-36 h-36 relative">
                <svg className="w-28 h-28 transform -rotate-90">
                  {/* Track Circle */}
                  <circle
                    cx="56"
                    cy="56"
                    r={radius}
                    className={isDarkMode ? 'stroke-[#243044]' : 'stroke-slate-100'}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                  />
                  {/* Progress Circle */}
                  <circle
                    cx="56"
                    cy="56"
                    r={radius}
                    className="stroke-emerald-500"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Center Text */}
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className={`text-lg font-black leading-none ${isDarkMode ? 'text-[#e7ecf3]' : 'text-gray-900'}`}>
                    {optStats.savingsPct}%
                  </span>
                  <span className={`text-[10px] font-medium mt-0.5 ${isDarkMode ? 'text-[#8993a8]' : 'text-gray-500'}`}>
                    Savings
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
