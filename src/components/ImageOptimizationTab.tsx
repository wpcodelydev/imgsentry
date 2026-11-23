import { csvCell, CSV_BOM } from '../utils/csv';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Sparkles, 
  ImageDown,
  Zap, 
  Settings, 
  Download, 
  Bell, 
  Sun, 
  Moon, 
  Search, 
  SlidersHorizontal, 
  Grid, 
  List, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft,
  ChevronsRight,
  Check, 
  HelpCircle, 
  Info, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  ChevronDown,
  Trash2, 
  MoreVertical,
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
  FolderCheck,
  ShieldCheck,
  Crown,
  Loader2,
  Image as ImageIcon,
  FileText,
  HardDrive,
  Maximize2,
  ArrowUpDown,
  Layers,
  Lock,
  XCircle,
  Clock
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  Tooltip,
} from 'recharts';
import { MediaItem, OptimizedMediaItem, PluginSettings } from '../types';
import { 
  simulateOptimizeImage, 
  MOCK_SERVER_SUPPORTS_AVIF
} from '../utils/simulateOptimizeImage';
import { ImageUsageDetailsDrawer } from './ImageUsageDetailsDrawer';
import { OptimizationQuotaBar, getInitialQuota, isQuotaStopCode, QuotaStatus } from './OptimizationQuotaBar';
import { openUpgrade } from './ProLock';
import { OptimizationProgressBar, buildBarData } from './OptimizationProgressBar';
import { SingleOptimizeDialog, SingleOptimizeState } from './SingleOptimizeDialog';
import { PortalHost } from './PortalHost';
import { formatBytes as formatSizeLabel } from '../utils/optimizationFormat';
import { getProFeatures } from './ProLock';
import { getUsageLocations, resolveNextGenFormats, mapPhpItemToMediaItem } from '../utils/fileUtils';

/** True when running inside WordPress (the server endpoints are available). */
const isWpRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const d = (window as any).imgsentryData || (window as any).imgsentry_data;
  return Boolean((d?.ajaxUrl || d?.ajax_url) && d?.nonce);
};

const getFormatBadgeStyle = (format: string) => {
  const fmt = format.toLowerCase().trim();
  if (fmt === 'webp') {
    return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400 border border-cyan-200/60 dark:border-cyan-800/50';
  }
  if (fmt === 'avif') {
    return 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 border border-violet-200/60 dark:border-violet-800/50';
  }
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700';
};

export const FormatBadge: React.FC<{ format: string; className?: string }> = ({ format, className = '' }) => {
  const cleanFmt = format.toLowerCase().replace('image/', '').replace('jpeg', 'jpg');
  const displayLabel = cleanFmt.toUpperCase();
  const styleClasses = getFormatBadgeStyle(cleanFmt);

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${styleClasses} ${className}`}>
      {displayLabel}
    </span>
  );
};

const CustomOptimizationTooltip = ({ active, payload, total }: { active?: boolean; payload?: any[]; total: number }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    const categoryName = data.name;
    const count = Number(data.value);
    const color = data.payload?.color || '#3b82f6';
    const key = data.payload?.key || 'ready';
    const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0';

    // Dynamic badge styles based on category key
    let textClass = 'text-blue-400';
    let bgClass = 'bg-blue-950/80';
    let borderClass = 'border-blue-800/50';

    if (key === 'large') {
      textClass = 'text-amber-400';
      bgClass = 'bg-amber-950/80';
      borderClass = 'border-amber-800/50';
    } else if (key === 'total_webp') {
      textClass = 'text-purple-400';
      bgClass = 'bg-purple-950/80';
      borderClass = 'border-purple-800/50';
    } else if (key === 'total_avif') {
      textClass = 'text-rose-400';
      bgClass = 'bg-rose-950/80';
      borderClass = 'border-rose-800/50';
    }

    return (
      <div className="bg-slate-900/95 text-white border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs min-w-[160px] z-50 pointer-events-none">
        <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-800">
          <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
          <span className="font-bold text-slate-200 text-xs">{categoryName}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <span className="text-sm font-black text-white">{count} {count === 1 ? 'image' : 'images'}</span>
          <span className={`text-[11px] font-bold ${textClass} ${bgClass} border ${borderClass} px-1.5 py-0.5 rounded`}>
            {percentage}%
          </span>
        </div>
      </div>
    );
  }
  return null;
};

interface OptimizeItem {
  id: number;
  filename: string;
  title?: string;
  originalSizeKB: number;
  optimizedSizeKB: number;
  /** Size of the file people actually get (WebP / AVIF copy when smaller, else the main file). Display only. */
  displaySizeKB?: number;
  /** Optimized by another plugin (Imagify, Smush, ShortPixel ...): ImgSentry leaves it alone and does not know the saving. */
  externallyOptimized?: boolean;
  savingPercent?: number;
  savingsUnknown?: boolean;
  savings_unknown?: boolean;
  dimensions: string;
  mimeType: string;
  usedCount: number;
  status: 'ready' | 'optimized' | 'large' | 'webp_missing' | 'avif_missing' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  optimizationError?: string;
  inUse: boolean;
  thumbnailUrl: string;
  fullUrl?: string;
  optimizedUrl?: string;
  compressionLevel?: 'lossless' | 'balanced' | 'aggressive' | 'custom';
  format?: 'original' | 'webp' | 'avif' | string;
  nextGenFormats?: {
    webp?: boolean;
    avif?: boolean;
    siblingSizeBytes?: number;
    siblingSizeKB?: number;
    siblingFormat?: string;
  };
  backupCreated?: boolean;
  originalFormat?: 'original' | 'webp' | 'avif' | string;
  display_extension?: string;
  effective_format?: string;
  outputFormat?: string;
  uploadDate?: string;
  optimizedAt?: number;
  cachedEstimate?: any;
  extension?: string;
}

type SortOption = 'savings_desc' | 'size_desc' | 'date_desc' | 'last_optimized' | 'name_asc';

export const checkIsOptimized = (item: {
  status?: string;
  optimizationStatus?: string;
  isOptimized?: boolean;
  _imgsentry_optimized?: boolean | number | string;
  mimeType?: string;
  filename?: string;
  extension?: string;
  format?: string;
}) => {
  // 1. Prioritize explicit backend DB postmeta or session optimization status flags
  if (
    item.status === 'optimized' ||
    item.optimizationStatus === 'optimized' ||
    item.isOptimized === true ||
    Boolean((item as any).externallyOptimized) ||
    Boolean((item as any)._imgsentry_optimized)
  ) {
    return true;
  }

  // 2. Prioritize explicit unoptimized status from backend or session state
  if (
    item.status === 'ready' ||
    item.status === 'large' ||
    item.status === 'failed' ||
    item.optimizationStatus === 'ready' ||
    item.optimizationStatus === 'large' ||
    item.optimizationStatus === 'failed'
  ) {
    return false;
  }

  // 3. Fallback heuristic: check extension/mime/format for raw items where server status is completely undefined
  // Note: This fallback is a heuristic for un-synced items and does not guarantee plugin processing.
  const ext = (item.extension || item.filename?.split('.').pop() || '').toLowerCase();
  const mime = (item.mimeType || '').toLowerCase();
  const fmt = (item.format || '').toLowerCase();
  return ext === 'webp' || ext === 'avif' || mime === 'image/webp' || mime === 'image/avif' || fmt === 'webp' || fmt === 'avif';
};

export const checkIsLargeImage = (item: {
  status?: string;
  originalSizeKB: number;
  dimensions?: string;
}) => {
  const isLargeSize = item.originalSizeKB >= 1024;
  let isLargeDimension = false;
  if (item.dimensions) {
    const dimMatch = item.dimensions.match(/(\d+)\s*[\*x×,;]\s*(\d+)/i);
    if (dimMatch) {
      const w = parseInt(dimMatch[1], 10) || 0;
      const h = parseInt(dimMatch[2], 10) || 0;
      if (w >= 1920 || h >= 1080) {
        isLargeDimension = true;
      }
    }
  }
  return (isLargeSize && isLargeDimension) || item.status === 'large';
};

const buildQueueFromMediaList = (list: MediaItem[]): OptimizeItem[] => {
  // Only formats the optimizer can really process (SVG, BMP, ICO, TIFF... would just fail).
  const OPTIMIZABLE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
  const images = list.filter(item => {
    if (item.category !== 'images' || item.isTrashed) return false;
    const ext = (item.extension || (item.filename ?? '').split('.').pop() || '').toLowerCase();
    const mime = (item.mimeType || '').toLowerCase();
    if (mime.startsWith('image/svg') || ext === 'svg') return false;
    return OPTIMIZABLE_EXT.includes(ext) || ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(mime);
  });
  if (images.length === 0) {
    return [];
  }

  return images.map(item => {
    const mimeType = item.mimeType || (
      item.extension === 'png' ? 'image/png' : 
      item.extension === 'webp' ? 'image/webp' : 
      item.extension === 'avif' ? 'image/avif' : 
      'image/jpeg'
    );
    const originalSizeKB = item.originalSizeKB ?? Math.max(1, Math.round((item.fileSize || 0) / 1024));
    
    // Exactly matching UsedFilesTab.tsx and fileUtils.ts
    const usageLocations = getUsageLocations(item);
    const usedCount = usageLocations.length;
    const inUse = item.inUse !== undefined ? item.inUse : (usedCount > 0);

    const ext = (item.extension || (item.filename ?? '').split('.').pop() || '').toLowerCase();
    const mime = mimeType.toLowerCase();
    const isWebpOrAvif = ext === 'webp' || ext === 'avif' || mime === 'image/webp' || mime === 'image/avif' || (item.filename ?? '').toLowerCase().endsWith('.webp') || (item.filename ?? '').toLowerCase().endsWith('.avif');

    let status: 'ready' | 'optimized' | 'large' | 'webp_missing' | 'avif_missing' | 'failed' = 'ready';
    // Optimized by another plugin: it counts as optimized (not offered again), but the saving is not known.
    const isExternallyOptimized = Boolean((item as any).externallyOptimized);
    if (item.optimizationStatus === 'optimized' || (item as any).status === 'optimized' || Boolean((item as any)._imgsentry_optimized) || Boolean((item as any).isOptimized)) {
      status = 'optimized';
    } else if (isExternallyOptimized) {
      status = 'optimized';
    } else if (item.optimizationStatus) {
      status = item.optimizationStatus;
    } else if ((item.fileSize && item.fileSize > 2 * 1024 * 1024) || (item.dimensions && parseInt(item.dimensions, 10) > 2000)) {
      status = 'large';
    }

    const nextGen = resolveNextGenFormats(item);
    const hasNextGenSibling = nextGen && (nextGen.webp || nextGen.avif) && nextGen.siblingSizeKB;
    const effectiveOptimizedKB = item.optimizedSizeKB ?? (hasNextGenSibling ? nextGen.siblingSizeKB : undefined);

    const defaultOptKB = status === 'optimized' ? (isExternallyOptimized ? originalSizeKB : (effectiveOptimizedKB || Math.round(originalSizeKB * 0.55))) : Math.round(originalSizeKB * 0.26);
    const isSavingsUnknown = Boolean(item.savingsUnknown || (item as any).savings_unknown || isExternallyOptimized);
    const defaultSavingPct = isSavingsUnknown ? undefined : (status === 'optimized' ? (item.savingPercent || (originalSizeKB > 0 && defaultOptKB < originalSizeKB ? Math.round(((originalSizeKB - defaultOptKB) / originalSizeKB) * 100) : 45)) : 74);
    const itemIdNum = typeof item.id === 'number' ? item.id : parseInt(String(item.id), 10) || 1;
    const optimizedAt = item.optimizedAt ?? (
      status === 'optimized' ? 1700000000000 + (itemIdNum * 1000) : undefined
    );

    const fullUrl = item.fullUrl || item.url || item.thumbUrl || '';
    const thumbnailUrl = item.thumbUrl || item.url || fullUrl || '';
    const optimizedUrl = item.optimizedUrl || (status === 'optimized' ? fullUrl : undefined);

    return {
      id: item.id,
      filename: item.filename,
      originalSizeKB,
      optimizedSizeKB: item.optimizedSizeKB ?? (status === 'optimized' ? defaultOptKB : 0),
      displaySizeKB: status === 'optimized' && typeof item.deliveredSizeBytes === 'number' && item.deliveredSizeBytes > 0 ? Math.max(1, Math.round(item.deliveredSizeBytes / 1024)) : undefined,
      savingPercent: isSavingsUnknown ? undefined : (item.savingPercent ?? (status === 'optimized' ? defaultSavingPct : 0)),
      savingsUnknown: isSavingsUnknown,
      savings_unknown: isSavingsUnknown,
      externallyOptimized: isExternallyOptimized,
      dimensions: item.dimensions || '',
      mimeType,
      usedCount,
      status,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage || item.optimizationError,
      optimizationError: item.optimizationError || item.errorMessage,
      inUse,
      thumbnailUrl,
      fullUrl,
      optimizedUrl,
      compressionLevel: item.compressionLevel,
      format: isWebpOrAvif ? (ext as any) : item.format,
      nextGenFormats: resolveNextGenFormats(item),
      backupCreated: item.backupCreated,
      originalFormat: item.originalFormat || (item.mimeType ? item.mimeType.split('/')[1] as any : 'jpg'),
      uploadDate: item.uploadDate || '',
      optimizedAt,
      cachedEstimate: item.cachedEstimate
    };
  });
};

interface ImageOptimizationTabProps {
  isDarkMode?: boolean;
  mediaList?: MediaItem[];
  settings?: PluginSettings;
  onAddLog?: (action: string, details: string) => void;
  onAddDetailedLog?: (
    level: 'Success' | 'Info' | 'Warning' | 'Error' | 'Critical',
    type: string,
    source: string,
    boldText: string,
    subText: string
  ) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToSettings?: (subTab?: string) => void;
  onNavigateToScanner?: () => void;
  /** Opens the Image Optimization tab (used by the progress bar's "View results" button on other tabs). */
  onNavigateToOptimization?: () => void;
  /** Re-reads the media list from the server (used once after a queue run if the server did not send the finished items). */
  onRefreshData?: () => void;
  /** Saves the shared compression level, custom quality and output format (same values as Settings > Advanced). Resolves true when the server accepted them. */
  onSaveOptimizationSettings?: (level: 'lossless' | 'balanced' | 'aggressive' | 'custom', quality: number, format: 'off' | 'webp' | 'avif') => Promise<boolean>;
  /** Lets the parent ask this page whether it has unsaved changes, and save or discard them before leaving. */
  onRegisterUnsavedGuard?: (guard: { isDirty: () => boolean; save: () => Promise<boolean>; discard: () => void } | null) => void;
  onItemRescanned?: (updatedItem: MediaItem) => void;
  onUpdateMediaItem?: (id: number, updates: Partial<MediaItem>) => void;
  onRegisterActions?: (actions: {
    optimizeSelected: () => void;
    bulkOptimizeAll: () => void;
    resetSettings: () => void;
    exportReport: () => void;
    restoreOriginals: () => void;
    removeFromQueue: () => void;
    cancelProcessing: () => void;
    enqueueBackgroundQueue?: () => void;
    cancelBackgroundQueue?: () => void;
    serverQueueStatus?: any;
    selectedCount: number;
    pendingCount: number;
    restorableCount?: number;
    hasSettingsError?: boolean;
    isProcessing: boolean;
  }) => void;
}

export const ImageOptimizationTab: React.FC<ImageOptimizationTabProps> = ({
  isDarkMode = false,
  mediaList = [],
  settings,
  onAddLog,
  onAddDetailedLog,
  onShowToast,
  onNavigateToSettings,
  onNavigateToScanner,
  onNavigateToOptimization,
  onRefreshData,
  onItemRescanned,
  onUpdateMediaItem,
  onRegisterActions,
  onSaveOptimizationSettings,
  onRegisterUnsavedGuard
}) => {
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [hoveredSliceIndex, setHoveredSliceIndex] = useState<number | null>(null);
  const [hiddenQueueIds, setHiddenQueueIds] = useState<number[]>([]);

  // Deriving the queue directly from the shared mediaList state
  const queue = useMemo(() => {
    const built = buildQueueFromMediaList(mediaList);
    return hiddenQueueIds.length === 0 ? built : built.filter(q => !hiddenQueueIds.includes(q.id));
  }, [mediaList, hiddenQueueIds]);

  // Clean up the obsolete separate cache key on mount
  useEffect(() => {
    try {
      localStorage.removeItem('wp_media_cleaner_optimize_queue_v1');
    } catch (e) {}
  }, []);

  const [selectedIds, setSelectedIds] = useState<number[]>([]); // no image auto-selected by default
  const [activeItemId, setActiveItemId] = useState<number>(1); // default mountain-lake previewed
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewOriginalError, setPreviewOriginalError] = useState<boolean>(false);
  const [previewOptimizedError, setPreviewOptimizedError] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'jpg' | 'png' | 'webp' | 'avif' | 'gif' | 'svg'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_optimized' | 'optimized' | 'pending' | 'large' | 'failed'>('not_optimized');
  const [sizeFilter, setSizeFilter] = useState<'all' | 'under_100kb' | '100_500kb' | '500kb_1mb' | '1mb_5mb' | 'over_5mb'>('all');
  const [dimensionFilter, setDimensionFilter] = useState<'all' | 'under_1920' | '1920_2560' | 'over_2560' | 'very_large_4000'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [sortBy, setSortBy] = useState<'size_desc' | 'savings_desc' | 'date_desc' | 'last_optimized' | 'name_asc'>('size_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingIds, setProcessingIds] = useState<number[]>([]);
  const cancelRef = useRef(false);

  // Restore Modal & Selection States
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreItemsToProcess, setRestoreItemsToProcess] = useState<OptimizeItem[]>([]);
  const [unrestorableCount, setUnrestorableCount] = useState(0);

  const restorableSelectedItems = useMemo(() => {
    return queue.filter(item => selectedIds.includes(item.id) && item.status === 'optimized' && item.backupCreated !== false);
  }, [queue, selectedIds]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<OptimizedMediaItem | null>(null);

  const handleOpenDrawer = (item: OptimizeItem) => {
    const found = mediaList.find(m => m.id === item.id || m.filename === item.filename);

    if (!found) {
      // Null-safety: If the file is no longer in mediaList, show the graceful 'file no longer found' state
      setDrawerItem(null);
      setDrawerOpen(true);
      return;
    }

    const isOptimized = item.status === 'optimized';

    const currentFormat = isOptimized && item.format
      ? (item.format as string).toLowerCase()
      : (found.extension || item.mimeType?.split('/')[1] || 'jpg').toLowerCase();

    const currentMimeType = 
      currentFormat === 'webp' ? 'image/webp' :
      currentFormat === 'avif' ? 'image/avif' :
      currentFormat === 'png' ? 'image/png' : 'image/jpeg';

    const currentSizeKB = isOptimized && item.optimizedSizeKB 
      ? item.optimizedSizeKB 
      : (found.fileSize ? Math.round(found.fileSize / 1024) : item.originalSizeKB);
    const formattedSize = currentSizeKB < 1024 
      ? `${currentSizeKB} KB` 
      : `${(currentSizeKB / 1024).toFixed(2)} MB`;

    const baseName = (found.filename || item.filename).replace(/\.[^/.]+$/, '');
    const currentFilename = isOptimized && currentFormat && currentFormat !== 'original' && !found.filename.toLowerCase().endsWith(`.${currentFormat.toLowerCase()}`)
      ? `${baseName}.${currentFormat}`
      : found.filename;

    // Preserve authentic MediaItem, immutably extending with optimization-specific fields via OptimizedMediaItem
    const drawerData: OptimizedMediaItem = {
      ...found,
      title: isOptimized ? currentFilename : found.title,
      filename: currentFilename,
      extension: currentFormat,
      mimeType: currentMimeType,
      fileSize: currentSizeKB * 1024,
      formattedSize: formattedSize,
      isOptimized,
      optimizedFormat: isOptimized ? currentFormat : undefined,
      optimizedSizeKB: isOptimized ? item.optimizedSizeKB : undefined,
      originalSizeKB: item.originalSizeKB,
      savingPercent: isOptimized ? item.savingPercent : undefined,
    };

    setDrawerItem(drawerData);
    setDrawerOpen(true);
  };

  // Settings persistence & initialization
  // Compression level, custom quality and output format are ONE shared setting with Settings > Advanced
  // (stored on the server, never in the browser). This page edits a DRAFT of them; "Save" writes the draft
  // to the server, and whatever is saved (here or in Settings) is what both pages show.
  type CompressionLevelValue = 'lossless' | 'balanced' | 'aggressive' | 'custom';
  type OutputFormatValue = 'original' | 'webp' | 'avif';
  const COMPRESSION_LEVELS = ['lossless', 'balanced', 'aggressive', 'custom'];
  // Settings calls "keep the original format" 'off', this page calls it 'original'.
  const toUiFormat = (v: unknown): OutputFormatValue | null => {
    if (v === 'off' || v === 'original') return 'original';
    if (v === 'avif') return 'avif';
    if (v === 'webp') return 'webp';
    return null;
  };
  const toServerFormat = (v: OutputFormatValue): 'off' | 'webp' | 'avif' => (v === 'original' ? 'off' : v);

  // The saved values (what the server has). The draft below starts from them.
  const [savedOpt, setSavedOpt] = useState<{ level: CompressionLevelValue; quality: number; format: OutputFormatValue }>(() => {
    const lvl = settings?.defaultCompressionLevel;
    const q = Number(settings?.defaultCompressionQuality);
    const wpData = typeof window !== 'undefined'
      ? ((window as any).imgsentry_data || (window as any).imgsentryData || (window as any).imgsentrySettingsBootstrap)
      : null;
    return {
      level: (lvl && COMPRESSION_LEVELS.includes(lvl) ? lvl : 'balanced') as CompressionLevelValue,
      quality: Number.isInteger(q) && q >= 1 && q <= 100 ? q : 78,
      format: toUiFormat(wpData?.settings?.nextGenFormat || settings?.nextGenFormat) ?? 'webp',
    };
  });
  const savedOptRef = useRef(savedOpt);

  const [compressionLevel, setCompressionLevel] = useState<CompressionLevelValue>(savedOpt.level);
  const [customQuality, setCustomQuality] = useState<number | string>(savedOpt.quality);

  const [maxWidth, setMaxWidth] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('imgsentry_optimization_settings_v1');
      if (saved) return JSON.parse(saved).maxWidth ?? '1920';
    } catch (e) {}
    return '1920';
  });

  const [maxHeight, setMaxHeight] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('imgsentry_optimization_settings_v1');
      if (saved) return JSON.parse(saved).maxHeight ?? '1080';
    } catch (e) {}
    return '1080';
  });

  const [resizeLargeImages, setResizeLargeImages] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('imgsentry_optimization_settings_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.resizeLargeImages === 'boolean') return parsed.resizeLargeImages;
      }
    } catch (e) {}
    return false; // Default: OFF
  });

  const [keepExif, setKeepExif] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('imgsentry_optimization_settings_v1');
      if (saved) return JSON.parse(saved).keepExif ?? false;
    } catch (e) {}
    return false;
  });

  const [stripMetadata, setStripMetadata] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('imgsentry_optimization_settings_v1');
      if (saved) return JSON.parse(saved).stripMetadata ?? true;
    } catch (e) {}
    return true;
  });

  const [preserveTransparency, setPreserveTransparency] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('imgsentry_optimization_settings_v1');
      if (saved) return JSON.parse(saved).preserveTransparency ?? true;
    } catch (e) {}
    return true;
  });

  const [outputFormat, setOutputFormat] = useState<OutputFormatValue>(savedOpt.format);

  // Take new saved values (from the server, or after Settings was saved) as both the saved baseline and the draft.
  const applySavedOpt = (next: { level?: unknown; quality?: unknown; format?: unknown }) => {
    const prev = savedOptRef.current;
    const q = Number(next.quality);
    const merged = {
      level: (typeof next.level === 'string' && COMPRESSION_LEVELS.includes(next.level) ? next.level : prev.level) as CompressionLevelValue,
      quality: next.quality !== undefined && next.quality !== null && Number.isInteger(q) && q >= 1 && q <= 100 ? q : prev.quality,
      format: toUiFormat(next.format) ?? prev.format,
    };
    savedOptRef.current = merged;
    setSavedOpt(merged);
    setCompressionLevel(merged.level);
    setCustomQuality(merged.quality);
    setOutputFormat(merged.format);
  };

  // Keep this page in step with Settings: when a saved value changes there, it changes here too.
  useEffect(() => {
    applySavedOpt({
      level: settings?.defaultCompressionLevel,
      quality: settings?.defaultCompressionQuality,
      format: settings?.nextGenFormat,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.defaultCompressionLevel, settings?.defaultCompressionQuality, settings?.nextGenFormat]);

  // Validation rules for Max Width / Height (only applicable when resizeLargeImages is ON)
  const parsedWidth = parseInt(maxWidth, 10);
  const parsedHeight = parseInt(maxHeight, 10);
  const widthError = resizeLargeImages && (!maxWidth || isNaN(parsedWidth) || parsedWidth < 10 || parsedWidth > 10000);
  const heightError = resizeLargeImages && (!maxHeight || isNaN(parsedHeight) || parsedHeight < 10 || parsedHeight > 10000);
  
  // Custom Quality Validation: strictly validate numeric 1-100 when compressionLevel is 'custom'
  const customQualityStr = String(customQuality ?? '');
  const parsedCustomQuality = customQualityStr.trim() === '' ? NaN : Number(customQualityStr);

  const customQualityError = compressionLevel === 'custom' && (
    customQualityStr === '' || 
    isNaN(parsedCustomQuality) || 
    isNaN(parsedCustomQuality) || 
    !Number.isInteger(parsedCustomQuality) || 
    parsedCustomQuality < 1 || 
    parsedCustomQuality > 100
  );

  const hasSettingsError = Boolean(widthError || heightError || customQualityError);

  // Unsaved-changes tracking for the shared settings (quality only counts while "Custom" is chosen).
  const isOptDirty =
    compressionLevel !== savedOpt.level ||
    outputFormat !== savedOpt.format ||
    (compressionLevel === 'custom' && Number(customQuality) !== savedOpt.quality);
  const [isSavingOpt, setIsSavingOpt] = useState(false);

  const saveOptimizationDraft = async (): Promise<boolean> => {
    if (!onSaveOptimizationSettings) return false;
    if (compressionLevel === 'custom' && customQualityError) return false;
    const q = compressionLevel === 'custom' ? Math.round(Number(customQuality)) : savedOptRef.current.quality;
    setIsSavingOpt(true);
    try {
      const ok = await onSaveOptimizationSettings(compressionLevel, q, toServerFormat(outputFormat));
      if (ok) {
        const next = { level: compressionLevel, quality: q, format: outputFormat };
        savedOptRef.current = next;
        setSavedOpt(next);
        setCustomQuality(q);
      }
      return ok;
    } finally {
      setIsSavingOpt(false);
    }
  };

  const discardOptimizationDraft = () => {
    const saved = savedOptRef.current;
    setCompressionLevel(saved.level);
    setCustomQuality(saved.quality);
    setOutputFormat(saved.format);
  };

  // Let the parent warn before leaving this page with unsaved changes.
  const unsavedGuardRef = useRef({ isDirty: false, save: saveOptimizationDraft, discard: discardOptimizationDraft });
  unsavedGuardRef.current = { isDirty: isOptDirty, save: saveOptimizationDraft, discard: discardOptimizationDraft };
  useEffect(() => {
    if (!onRegisterUnsavedGuard) return;
    onRegisterUnsavedGuard({
      isDirty: () => unsavedGuardRef.current.isDirty,
      save: () => unsavedGuardRef.current.save(),
      discard: () => unsavedGuardRef.current.discard(),
    });
    return () => onRegisterUnsavedGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always keep current options ref synchronized to prevent any stale closure issues
  const currentOptions = useMemo(() => ({
    compressionLevel,
    customQuality: compressionLevel === 'custom' ? (isNaN(parsedCustomQuality) ? 0 : Math.round(parsedCustomQuality)) : undefined,
    quality: compressionLevel === 'custom' ? (isNaN(parsedCustomQuality) ? 0 : Math.round(parsedCustomQuality)) : undefined,
    maxWidth: isNaN(parsedWidth) ? 0 : parsedWidth,
    maxHeight: isNaN(parsedHeight) ? 0 : parsedHeight,
    resizeWidth: resizeLargeImages && !isNaN(parsedWidth) ? parsedWidth : 0,
    resizeHeight: resizeLargeImages && !isNaN(parsedHeight) ? parsedHeight : 0,
    resizeLargeImages,
    keepExif,
    preserveTransparency,
    outputFormat,
    generateBackup: settings?.generateBackupBeforeOptimization !== false
  }), [compressionLevel, parsedCustomQuality, parsedWidth, parsedHeight, resizeLargeImages, keepExif, preserveTransparency, outputFormat, settings?.generateBackupBeforeOptimization]);

  const currentOptionsRef = useRef(currentOptions);
  useEffect(() => {
    currentOptionsRef.current = currentOptions;
  }, [currentOptions]);

  // Persist settings changes to localStorage (excluding outputFormat so it stays per-run only)
  useEffect(() => {
    try {
      localStorage.setItem('imgsentry_optimization_settings_v1', JSON.stringify({
        maxWidth,
        maxHeight,
        resizeLargeImages,
        keepExif,
        stripMetadata,
        preserveTransparency,
      }));
    } catch (e) {
      console.error('Failed to save optimization settings to localStorage:', e);
    }
  }, [maxWidth, maxHeight, resizeLargeImages, keepExif, stripMetadata, preserveTransparency]);

  // Server-Side Real ImgSentry_Optimization_Stats & Capabilities State
  const [serverStats, setServerStats] = useState<{
    total_images: number;
    optimized_count: number;
    optimized_percentage: number;
    current_storage_bytes: number;
    storage_saved_bytes: number;
    potential_saving_bytes: number;
    backup_folder_bytes?: number;
    total_storage_formatted: string;
    storage_saved_formatted: string;
    potential_saving_formatted: string;
  } | null>(null);

  const [serverCapabilities, setServerCapabilities] = useState<{
    has_imagick: boolean;
    has_gd: boolean;
    has_webp: boolean;
    has_avif: boolean;
    active_engine: string;
  } | null>(null);

  // Monthly optimization quota (Free plan). Starts from the value the server put on the page and is
  // refreshed from every stats / optimize response.
  const [quota, setQuota] = useState<QuotaStatus | null>(() => getInitialQuota());
  const quotaStopRef = useRef(false);
  // Set the moment the server says the quota is used up (the progress popup then stops claiming progress).
  const [quotaStopMessage, setQuotaStopMessage] = useState<string | null>(null);
  // Shown after a run that was stopped by the quota: what was done, what was not, and why.
  const [quotaStopResult, setQuotaStopResult] = useState<{ message: string; done: number; total: number; code?: string } | null>(null);
  // Small popup shown instead of starting a run when the account is not connected.
  const [showConnectPopup, setShowConnectPopup] = useState(false);
  // Always the freshest quota, for handlers registered once (header actions) that would otherwise see a stale value.
  const quotaRef = useRef<QuotaStatus | null>(quota);
  quotaRef.current = quota;

  // Re-read the snapshot the server put on the page (it can differ from the first render after a reconnect).
  useEffect(() => {
    const fresh = getInitialQuota();
    if (fresh) setQuota(fresh);
  }, []);

  // Optimization needs a connected account. Returns true when it may start; otherwise shows the Connect popup.
  const ensureAccountConnected = (): boolean => {
    if (quotaRef.current && quotaRef.current.account_connected === false) {
      setShowConnectPopup(true);
      return false;
    }
    return true;
  };

  const [showAvifWarningModal, setShowAvifWarningModal] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<(() => void) | null>(null);
  const [expandedErrorId, setExpandedErrorId] = useState<number | null>(null);

  // Fetch real ImgSentry_Optimization_Stats from WordPress backend via AJAX
  const fetchOptimizationStats = useCallback(async () => {
    try {
      const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
      const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
      const nonce = wpData?.nonce;

      if (ajaxUrl && nonce) {
        const formData = new FormData();
        formData.append('action', 'imgsentry_get_optimization_stats');
        formData.append('nonce', nonce);

        const res = await fetch(ajaxUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.data) {
          if (data.data.stats) {
            setServerStats(data.data.stats);
          }
          if (data.data.capabilities) {
            setServerCapabilities(data.data.capabilities);
          }
          if (data.data.quota) {
            setQuota(data.data.quota);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching optimization stats:', err);
    }
  }, []);

  // Initial stats fetch on mount
  useEffect(() => {
    fetchOptimizationStats();
  }, [fetchOptimizationStats]);

  // Fetch real global nextGenFormat setting from server on mount
  useEffect(() => {
    let isMounted = true;

    // Purge any legacy outputFormat key from saved localStorage settings
    try {
      const saved = localStorage.getItem('imgsentry_optimization_settings_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if ('outputFormat' in parsed) {
          delete parsed.outputFormat;
          localStorage.setItem('imgsentry_optimization_settings_v1', JSON.stringify(parsed));
        }
      }
    } catch (e) {}

    const fetchGlobalSetting = async () => {
      const resolveFallbackFormat = (): 'original' | 'webp' | 'avif' | null => {
        const wpData = typeof window !== 'undefined'
          ? ((window as any).imgsentry_data || (window as any).imgsentryData || (window as any).imgsentrySettingsBootstrap)
          : null;
        const fallbackFmt = wpData?.settings?.nextGenFormat || settings?.nextGenFormat;
        if (fallbackFmt === 'off' || (fallbackFmt as string) === 'original') {
          return 'original';
        } else if (fallbackFmt === 'avif') {
          return 'avif';
        } else if (fallbackFmt === 'webp') {
          return 'webp';
        }
        return null;
      };

      try {
        const wpData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
        const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
        const nonce = wpData?.nonce;

        if (ajaxUrl && nonce) {
          const formData = new FormData();
          formData.append('action', 'imgsentry_get_optimization_settings');
          formData.append('nonce', nonce);

          const res = await fetch(ajaxUrl, { method: 'POST', body: formData });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          const data = await res.json();
          if (isMounted && data.success && data.data) {
            const settingsObj = data.data.settings || data.data;
            applySavedOpt({
              level: settingsObj?.defaultCompressionLevel,
              quality: settingsObj?.defaultCompressionQuality,
              format: settingsObj?.nextGenFormat,
            });
            return;
          }
        }
        // Fallback if data was unsuccessful or missing
        const fallback = resolveFallbackFormat();
        if (isMounted && fallback) {
          applySavedOpt({ format: fallback });
        }
      } catch (err) {
        console.error('Error fetching global settings for output format, falling back to localized data:', err);
        // Fallback if network or server error occurs
        const fallback = resolveFallbackFormat();
        if (isMounted && fallback) {
          applySavedOpt({ format: fallback });
        }
      }
    };

    fetchGlobalSetting();

    return () => {
      isMounted = false;
    };
  }, []);

  // Server-Side Background Optimization Job Queue State
  const [serverQueue, setServerQueue] = useState<{
    total: number;
    pending: number;
    processing: number;
    done: number;
    failed: number;
    cancelled: number;
    percent: number;
    is_running: boolean;
    is_locked?: boolean;
    recent_errors?: Array<{ attachment_id: number; error_message: string; updated_at: string }>;
    // Added by the newer server: result totals, current files and the failed list (all optional, older servers do not send them)
    optimized?: number;
    skipped?: number;
    bytes_original?: number;
    bytes_saved?: number;
    started_at?: number | null;
    finished_at?: number | null;
    current_files?: Array<{ attachment_id: number; filename: string }>;
    failed_items?: Array<{ attachment_id: number; title?: string; filename?: string; error_code?: string | null; message?: string; attempts?: number }>;
    stop_message?: string | null;
    stop_code?: string | null;
  } | null>(null);
  const [isEnqueueingQueue, setIsEnqueueingQueue] = useState(false);
  const [isCancellingQueue, setIsCancellingQueue] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [userInitiatedBatchActive, setUserInitiatedBatchActive] = useState<boolean>(false);
  const enqueueRequestInFlightRef = useRef<boolean>(false);
  // Polling is separate from banner visibility: the banner stays (Finished / Cancelled) until the user clears it.
  const [queuePolling, setQueuePolling] = useState<boolean>(false);
  const queueSyncIdsRef = useRef<Set<number>>(new Set());
  const queuePollInFlightRef = useRef<boolean>(false);
  const queueTickInFlightRef = useRef<boolean>(false);
  const queueProgressRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const latestCallbacksRef = useRef({ onItemRescanned, onUpdateMediaItem, onShowToast, onRefreshData });
  latestCallbacksRef.current = { onItemRescanned, onUpdateMediaItem, onShowToast, onRefreshData };
  // True once the server has sent at least one finished item for the current run (then the list is already up to date)
  const queueFinishedDeliveredRef = useRef<boolean>(false);

  // Merge images the background queue has finished into the shared media list (cards + list update live)
  const applyFinishedQueueItems = useCallback((finished: any[]) => {
    if (finished.length > 0) queueFinishedDeliveredRef.current = true;
    finished.forEach((f: any) => {
      const id = Number(f?.id);
      if (!id) return;
      queueSyncIdsRef.current.delete(id);
      if ((f.state === 'done' || f.state === 'skipped') && f.item) {
        try {
          latestCallbacksRef.current.onItemRescanned?.(mapPhpItemToMediaItem(f.item));
        } catch (err) {
          console.error('Could not merge optimized item:', err);
        }
      } else if (f.state === 'failed') {
        const msg = f.error || 'Background optimization failed.';
        latestCallbacksRef.current.onUpdateMediaItem?.(id, {
          optimizationStatus: 'failed',
          errorMessage: msg,
          optimizationError: msg,
        });
      }
    });
  }, []);

  // Poll server-side queue status (also syncs finished images)
  const fetchServerQueueStatus = useCallback(async () => {
    try {
      const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
      const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
      const nonce = wpData?.nonce;

      if (ajaxUrl && nonce) {
        const formData = new FormData();
        formData.append('action', 'imgsentry_get_queue_status');
        formData.append('nonce', nonce);
        const syncIds = Array.from(queueSyncIdsRef.current).slice(0, 50);
        if (syncIds.length > 0) {
          formData.append('sync_ids', JSON.stringify(syncIds));
        }

        const res = await fetch(ajaxUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success && data.data) {
          // The server sends the counts flat in `data` (older builds wrapped them in `data.status`)
          const raw = data.data.status ?? data.data;
          const { finished: finishedInStatus, ...counts } = raw;
          const finished = data.data.finished ?? finishedInStatus;
          setServerQueue(counts);
          if (Array.isArray(finished) && finished.length > 0) {
            applyFinishedQueueItems(finished);
          }
          return counts;
        }
      }
    } catch (err) {
      console.error('Error fetching background queue status:', err);
    }
    return null;
  }, [applyFinishedQueueItems]);

  // Final sync when a run ends (finished or cancelled): pull remaining finished items, refresh stat cards
  const finalizeQueueRun = useCallback(async () => {
    let status: any = null;
    for (let guard = 0; guard < 40; guard++) {
      const before = queueSyncIdsRef.current.size;
      status = await fetchServerQueueStatus();
      const after = queueSyncIdsRef.current.size;
      if (before === 0 || after === 0 || after === before) break;
    }
    queueSyncIdsRef.current.clear();
    await fetchOptimizationStats();
    return status;
  }, [fetchServerQueueStatus, fetchOptimizationStats]);

  // If a queue is still running on the server (page reloaded / tab reopened), show its progress again
  useEffect(() => {
    let alive = true;
    (async () => {
      const status = await fetchServerQueueStatus();
      if (alive && status && (status.pending > 0 || status.processing > 0)) {
        setUserInitiatedBatchActive(true);
        setQueuePolling(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchServerQueueStatus]);

  // Progress polling: runs only while a queue is active
  useEffect(() => {
    if (!queuePolling) {
      return;
    }

    let isMounted = true;
    queueProgressRef.current = { key: '', at: Date.now() };

    const runTick = async () => {
      // Browser-driven worker tick: keeps the queue moving when WP-Cron / loopback requests are blocked.
      if (queueTickInFlightRef.current) return;
      queueTickInFlightRef.current = true;
      try {
        const wpData = (window as any).imgsentryData || (window as any).imgsentry_data;
        const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
        const nonce = wpData?.nonce;
        if (ajaxUrl && nonce) {
          const fd = new FormData();
          fd.append('action', 'imgsentry_run_queue_tick');
          fd.append('nonce', nonce);
          await fetch(ajaxUrl, { method: 'POST', body: fd });
        }
      } catch (err) {
        console.error('Queue tick request failed:', err);
      } finally {
        queueTickInFlightRef.current = false;
        queueProgressRef.current.at = Date.now();
      }
    };

    const interval = setInterval(async () => {
      // Do not evaluate completion while the enqueue request is in flight, or while a previous poll is still running
      if (enqueueRequestInFlightRef.current || queuePollInFlightRef.current) {
        return;
      }
      queuePollInFlightRef.current = true;
      try {
        const status = await fetchServerQueueStatus();
        if (!isMounted || !status) return;

        const busy = status.pending > 0 || status.processing > 0;
        if (busy) {
          const key = `${status.done}-${status.failed}-${status.pending}-${status.processing}`;
          if (key !== queueProgressRef.current.key) {
            queueProgressRef.current = { key, at: Date.now() };
          } else if (!status.is_locked && Date.now() - queueProgressRef.current.at > 6000) {
            // No progress and no worker running: drive one batch from the browser
            runTick();
          }
          return;
        }

        // Queue is empty: sync the last results, refresh the stat cards and stop polling
        setQueuePolling(false);
        const finalStatus = await finalizeQueueRun();
        const s = finalStatus || status;
        // Older servers do not send the finished items: re-read the list once so the rows show the new sizes
        if (!queueFinishedDeliveredRef.current && s.done > 0) {
          latestCallbacksRef.current.onRefreshData?.();
        }
        if (latestCallbacksRef.current.onShowToast) {
          if (s.failed > 0) {
            latestCallbacksRef.current.onShowToast(`Background optimization finished: ${s.done} optimized, ${s.failed} failed.`, 'error');
          } else if (s.done > 0) {
            latestCallbacksRef.current.onShowToast(`Background optimization finished: ${s.done} image(s) optimized.`, 'success');
          }
        }
      } finally {
        queuePollInFlightRef.current = false;
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [queuePolling, fetchServerQueueStatus, finalizeQueueRun]);


  // ---------------------------------------------------------------------------
  // Single image optimization: live progress dialog (real progress from the server) that can be minimized.
  // The work itself runs on the server, so minimizing (or leaving the page) never stops it.
  // ---------------------------------------------------------------------------
  const [singleDialog, setSingleDialog] = useState<SingleOptimizeState | null>(null);
  const singlePollRef = useRef<number | null>(null);
  const singleCloseTimerRef = useRef<number | null>(null);
  const singlePollBusyRef = useRef<boolean>(false);

  const stopSinglePolling = useCallback(() => {
    if (singlePollRef.current !== null) {
      window.clearInterval(singlePollRef.current);
      singlePollRef.current = null;
    }
  }, []);

  // Asks the server how far one or more images are. Returns null when the server does not support it or the request fails.
  const fetchOptimizeProgress = useCallback(async (ids?: number[]) => {
    try {
      const wpData = (window as any).imgsentryData || (window as any).imgsentry_data;
      const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
      const nonce = wpData?.nonce;
      if (!ajaxUrl || !nonce) return null;
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_optimize_progress');
      fd.append('nonce', nonce);
      if (ids && ids.length > 0) fd.append('ids', JSON.stringify(ids));
      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (json && json.success && json.data) {
        return json.data as { items?: Record<string, any>; active?: number[] };
      }
    } catch (err) {
      // Progress is optional: an older server or a network hiccup just means no live percentage.
    }
    return null;
  }, []);

  const applyProgressToDialog = (prev: SingleOptimizeState, p: any): SingleOptimizeState => {
    if (typeof p?.percent !== 'number') return prev;
    const pct = Math.max(0, Math.min(99, Math.round(p.percent)));
    const step = Number(p.step);
    const stepsTotal = Number(p.steps_total);
    const current = Number(p.current);
    const total = Number(p.total);
    return {
      ...prev,
      percent: Math.max(prev.percent ?? 0, pct),
      step: step > 0 ? Math.max(prev.step, step) : prev.step,
      stepsTotal: stepsTotal > 0 ? stepsTotal : prev.stepsTotal,
      label: typeof p.label === 'string' && p.label ? p.label : prev.label,
      current: current >= 0 ? current : prev.current,
      total: total >= 0 ? total : prev.total,
    };
  };

  const startSingleProgress = useCallback((t: { id: number; filename: string; fileSize: number; extension: string; url?: string }) => {
    stopSinglePolling();
    if (singleCloseTimerRef.current !== null) {
      window.clearTimeout(singleCloseTimerRef.current);
      singleCloseTimerRef.current = null;
    }
    setSingleDialog({
      id: t.id,
      fileName: t.filename,
      metaLine: `${formatSizeLabel(t.fileSize)}  ·  ${(t.extension || '').toUpperCase()}`,
      thumbUrl: t.url,
      percent: null,
      step: 0,
      stepsTotal: 4,
      label: '',
      current: 0,
      total: 0,
      phase: 'running',
      message: '',
      savedBytes: null,
      skipped: false,
      minimized: false,
    });
    let misses = 0;
    const tick = async () => {
      if (singlePollBusyRef.current) return;
      singlePollBusyRef.current = true;
      try {
        const data = await fetchOptimizeProgress([t.id]);
        if (!data) {
          misses++;
          if (misses >= 3) stopSinglePolling();
          return;
        }
        const p = data.items ? data.items[String(t.id)] : null;
        if (p && p.state === 'running') {
          setSingleDialog(prev => (prev && prev.id === t.id && prev.phase === 'running' ? applyProgressToDialog(prev, p) : prev));
        }
      } finally {
        singlePollBusyRef.current = false;
      }
    };
    singlePollRef.current = window.setInterval(tick, 700);
  }, [fetchOptimizeProgress, stopSinglePolling]);

  const finishSingleProgress = useCallback((outcome: 'done' | 'failed', info: { message?: string; savedBytes?: number | null; skipped?: boolean } = {}) => {
    stopSinglePolling();
    setSingleDialog(prev => prev ? {
      ...prev,
      phase: outcome,
      percent: outcome === 'done' ? 100 : prev.percent,
      step: outcome === 'done' ? prev.stepsTotal : prev.step,
      message: info.message || '',
      savedBytes: info.savedBytes ?? null,
      skipped: Boolean(info.skipped),
    } : prev);
    if (outcome === 'done') {
      if (singleCloseTimerRef.current !== null) window.clearTimeout(singleCloseTimerRef.current);
      singleCloseTimerRef.current = window.setTimeout(() => {
        setSingleDialog(null);
        singleCloseTimerRef.current = null;
      }, 1800);
    }
  }, [stopSinglePolling]);

  const closeSingleDialog = useCallback(() => {
    stopSinglePolling();
    if (singleCloseTimerRef.current !== null) {
      window.clearTimeout(singleCloseTimerRef.current);
      singleCloseTimerRef.current = null;
    }
    setSingleDialog(null);
  }, [stopSinglePolling]);

  // After an optimization that finished while this page was not watching: pull the fresh data of that image
  const refreshItemFromServer = useCallback(async (id: number) => {
    try {
      const wpData = (window as any).imgsentryData || (window as any).imgsentry_data;
      const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
      const nonce = wpData?.nonce;
      if (ajaxUrl && nonce) {
        const fd = new FormData();
        fd.append('action', 'imgsentry_rescan_single_item');
        fd.append('nonce', nonce);
        fd.append('item_id', String(id));
        fd.append('scan_type', 'quick');
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (json && json.success && json.data?.item) {
          latestCallbacksRef.current.onItemRescanned?.(mapPhpItemToMediaItem(json.data.item));
        }
      }
    } catch (err) {
      // Not critical: the list is correct after the next reload.
    }
    await fetchOptimizationStats();
  }, [fetchOptimizationStats]);

  // This page was opened while an image is still being optimized on the server (started on an earlier page): show it again, minimized
  const watchResumedProgress = useCallback((id: number) => {
    if (singlePollRef.current !== null) return;
    setSingleDialog({
      id,
      fileName: '',
      metaLine: '',
      percent: null,
      step: 0,
      stepsTotal: 4,
      label: '',
      current: 0,
      total: 0,
      phase: 'running',
      message: '',
      savedBytes: null,
      skipped: false,
      minimized: true,
    });
    let misses = 0;
    singlePollRef.current = window.setInterval(async () => {
      if (singlePollBusyRef.current) return;
      singlePollBusyRef.current = true;
      try {
        const data = await fetchOptimizeProgress([id]);
        if (!data) {
          misses++;
          if (misses >= 3) {
            stopSinglePolling();
            setSingleDialog(null);
          }
          return;
        }
        const p = data.items ? data.items[String(id)] : null;
        if (p && p.state === 'running') {
          setSingleDialog(prev => (prev && prev.id === id && prev.phase === 'running' ? applyProgressToDialog(prev, p) : prev));
          return;
        }
        stopSinglePolling();
        await refreshItemFromServer(id);
        if (p && p.state === 'done') {
          finishSingleProgress('done');
        } else if (p && p.state === 'failed') {
          finishSingleProgress('failed', { message: p.message || 'Optimization failed.' });
        } else {
          setSingleDialog(null);
        }
      } finally {
        singlePollBusyRef.current = false;
      }
    }, 1000);
  }, [fetchOptimizeProgress, stopSinglePolling, refreshItemFromServer, finishSingleProgress]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isWpRuntime()) return;
      const data = await fetchOptimizeProgress();
      const active = data && Array.isArray(data.active) ? data.active.map(Number).filter(n => n > 0) : [];
      if (alive && active.length > 0) {
        watchResumedProgress(active[0]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      stopSinglePolling();
      if (singleCloseTimerRef.current !== null) window.clearTimeout(singleCloseTimerRef.current);
    };
  }, [stopSinglePolling]);

  const [forceReoptimize, setForceReoptimize] = useState<boolean>(false);

  // Enqueue items to server-side background job queue
  const handleEnqueueServerQueue = async (attachmentIds: number[] = [], force: boolean = forceReoptimize) => {
    // One click = one request: ignore extra clicks while the first request is still running
    if (enqueueRequestInFlightRef.current) {
      return;
    }
    if (attachmentIds.length > 0 && !ensureAccountConnected()) {
      return;
    }
    if (attachmentIds.length === 0) {
      if (onShowToast) onShowToast('Please select at least one image to queue for background optimization.', 'error');
      return;
    }

    if (hasSettingsError) {
      if (customQualityError) {
        if (onShowToast) onShowToast('Please enter a valid Custom Quality percentage (1–100%) before queueing.', 'error');
      } else {
        if (onShowToast) onShowToast('Please correct invalid Max Width or Max Height settings before queueing.', 'error');
      }
      return;
    }

    // Mark enqueue in flight and activate user batch flag
    queueFinishedDeliveredRef.current = false;
    enqueueRequestInFlightRef.current = true;
    setUserInitiatedBatchActive(true);
    setQueuePolling(true);
    setIsEnqueueingQueue(true);
    try {
      const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
      const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
      const nonce = wpData?.nonce;
      const options = currentOptionsRef.current;

      const qualityValue = options.compressionLevel === 'custom' 
        ? (typeof options.quality === 'number' ? options.quality : (typeof options.customQuality === 'number' ? options.customQuality : Math.round(Number(customQuality))))
        : null;

      const phpOptions = {
        compression_level: options.compressionLevel || 'balanced',
        quality: qualityValue,
        resize_large: Boolean(options.resizeLargeImages),
        max_width: (options.resizeLargeImages && options.maxWidth) ? options.maxWidth : 0,
        max_height: (options.resizeLargeImages && options.maxHeight) ? options.maxHeight : 0,
        keep_exif: Boolean(options.keepExif),
        preserve_transparency: Boolean(options.preserveTransparency),
        output_format: options.outputFormat || 'original',
        force: Boolean(force),
      };

      if (ajaxUrl && nonce) {
        const formData = new FormData();
        formData.append('action', 'imgsentry_enqueue_optimization_queue');
        formData.append('nonce', nonce);
        formData.append('attachment_ids', JSON.stringify(attachmentIds));
        formData.append('options', JSON.stringify(phpOptions));

        const res = await fetch(ajaxUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          if (onShowToast) onShowToast(data.data.message || `Enqueued ${attachmentIds.length} images for background processing.`, 'success');
          if (data.data.status) {
            const { finished: _unused, ...enqueueCounts } = data.data.status;
            setServerQueue(enqueueCounts);
            // If the server skipped all items and queue is truly empty, turn off the batch
            if (data.data.status.pending === 0 && data.data.status.processing === 0) {
              setUserInitiatedBatchActive(false);
              setQueuePolling(false);
            } else {
              attachmentIds.forEach(id => queueSyncIdsRef.current.add(id));
            }
          }
          setSelectedIds([]);
        } else {
          setUserInitiatedBatchActive(false);
          setQueuePolling(false);
          if (onShowToast) onShowToast(data.data?.message || 'Failed to enqueue items.', 'error');
        }
      } else {
        // Standalone Simulator Fallback: filter already-optimized items if force is false
        let enqueuedIds = attachmentIds;
        let skippedCount = 0;
        if (!force) {
          const alreadyOptimizedSet = new Set(
            queue.filter(q => q.status === 'optimized' || checkIsOptimized(q)).map(q => q.id)
          );
          enqueuedIds = attachmentIds.filter(id => !alreadyOptimizedSet.has(id));
          skippedCount = attachmentIds.length - enqueuedIds.length;
        }

        if (enqueuedIds.length === 0 && skippedCount > 0) {
          setUserInitiatedBatchActive(false);
          setQueuePolling(false);
          if (onShowToast) onShowToast(`All ${skippedCount} selected image(s) are already optimized and were skipped. Use Force Re-optimize to reprocess.`, 'info');
          return;
        }

        setServerQueue({
          total: enqueuedIds.length,
          pending: enqueuedIds.length,
          processing: 0,
          done: 0,
          failed: 0,
          cancelled: 0,
          percent: 0,
          is_running: true,
          is_locked: true,
        });
        const msg = skippedCount > 0
          ? `${attachmentIds.length} selected, ${skippedCount} already optimized and skipped, ${enqueuedIds.length} enqueued for processing.`
          : `Enqueued ${enqueuedIds.length} image(s) into background WP-Cron queue.`;
        if (onShowToast) onShowToast(msg, 'success');
        setSelectedIds([]);
      }
    } catch (err) {
      console.error('Failed to enqueue to background queue:', err);
      setUserInitiatedBatchActive(false);
      setQueuePolling(false);
      if (onShowToast) onShowToast('Failed to queue background optimization.', 'error');
    } finally {
      enqueueRequestInFlightRef.current = false;
      setIsEnqueueingQueue(false);
    }
  };

  // Cancel background server-side queue
  const handleCancelServerQueue = async () => {
    setIsCancellingQueue(true);
    setQueuePolling(false);
    try {
      const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
      const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
      const nonce = wpData?.nonce;

      if (ajaxUrl && nonce) {
        const formData = new FormData();
        formData.append('action', 'imgsentry_cancel_optimization_queue');
        formData.append('nonce', nonce);

        const res = await fetch(ajaxUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          if (onShowToast) onShowToast(data.data.message || 'Background queue cancelled.', 'info');
          if (data.data.status) setServerQueue(data.data.status);
          // Pull in what finished before the cancel and refresh the stat cards
          await finalizeQueueRun();
        } else {
          if (onShowToast) onShowToast(data.data?.message || 'Failed to cancel queue.', 'error');
        }
      } else {
        // Simulator cancellation
        setServerQueue(prev => prev ? {
          ...prev,
          cancelled: prev.pending + prev.processing,
          pending: 0,
          processing: 0,
          is_running: false,
          is_locked: false,
        } : null);
        if (onShowToast) onShowToast('Background queue cancelled successfully.', 'info');
      }
    } catch (err) {
      console.error('Failed to cancel background queue:', err);
    } finally {
      setIsCancellingQueue(false);
    }
  };

  // Clear completed/cancelled items from the background queue table
  const handleClearServerQueue = async () => {
    try {
      const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
      const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
      const nonce = wpData?.nonce;

      if (ajaxUrl && nonce) {
        const formData = new FormData();
        formData.append('action', 'imgsentry_clear_optimization_queue');
        formData.append('nonce', nonce);

        const res = await fetch(ajaxUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
          if (onShowToast) onShowToast(data.data.message || 'Cleared historical queue records.', 'success');
          if (data.data.status) setServerQueue(data.data.status);
          setUserInitiatedBatchActive(false);
        }
      } else {
        setServerQueue(null);
        setUserInitiatedBatchActive(false);
        if (onShowToast) onShowToast('Cleared background queue history.', 'success');
      }
    } catch (err) {
      console.error('Failed to clear background queue:', err);
    }
  };

  // Interactive slider position (0 - 100)
  const [sliderPosition, setSliderPosition] = useState(50);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter Queue list
  const filteredQueue = useMemo(() => {
    const filtered = queue.filter(item => {
      // 1. Search Query
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = q === '' || 
        (item.filename ?? '').toLowerCase().includes(q) ||
        (item.mimeType && item.mimeType.toLowerCase().includes(q)) ||
        (item.dimensions && item.dimensions.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // 2. Format / FileType Filter
      const ext = (item.filename ?? '').split('.').pop()?.toLowerCase() || '';
      const fmt = (item.format || '').toLowerCase();
      const mime = (item.mimeType || '').toLowerCase();
      const effectiveFmt = (item.display_extension || item.effective_format || item.outputFormat || ext || fmt).toLowerCase();

      const matchesFormat = fileTypeFilter === 'all' ||
        (fileTypeFilter === 'jpg' && ['jpg', 'jpeg'].includes(effectiveFmt)) ||
        (fileTypeFilter === 'png' && effectiveFmt === 'png') ||
        (fileTypeFilter === 'webp' && effectiveFmt === 'webp') ||
        (fileTypeFilter === 'avif' && effectiveFmt === 'avif') ||
        (fileTypeFilter === 'gif' && effectiveFmt === 'gif') ||
        (fileTypeFilter === 'svg' && effectiveFmt === 'svg');

      if (!matchesFormat) return false;

      // 3. Status Filter
      const isItemOpt = checkIsOptimized(item);
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'not_optimized' && !isItemOpt) ||
        (statusFilter === 'optimized' && isItemOpt) ||
        (statusFilter === 'pending' && !isItemOpt && ((item.status as string) === 'ready' || (item.status as string) === 'pending')) ||
        (statusFilter === 'large' && !isItemOpt && checkIsLargeImage(item)) ||
        (statusFilter === 'failed' && item.status === 'failed');

      if (!matchesStatus) return false;

      // 4. Size Filter
      const sizeKB = isItemOpt && item.optimizedSizeKB ? item.optimizedSizeKB : item.originalSizeKB;
      const matchesSize = sizeFilter === 'all' ||
        (sizeFilter === 'under_100kb' && sizeKB < 100) ||
        (sizeFilter === '100_500kb' && sizeKB >= 100 && sizeKB <= 500) ||
        (sizeFilter === '500kb_1mb' && sizeKB > 500 && sizeKB <= 1024) ||
        (sizeFilter === '1mb_5mb' && sizeKB > 1024 && sizeKB <= 5120) ||
        (sizeFilter === 'over_5mb' && sizeKB > 5120);

      if (!matchesSize) return false;

      // 5. Dimensions Filter
      // Unknown dimensions must not be counted as 1920px: they only match "All Dimensions"
      let maxDim = 0;
      if (item.dimensions) {
        const dimMatch = item.dimensions.match(/(\d+)\s*[\*x×,;]\s*(\d+)/i);
        if (dimMatch) {
          maxDim = Math.max(parseInt(dimMatch[1], 10) || 0, parseInt(dimMatch[2], 10) || 0);
        }
      }

      const matchesDimensions = dimensionFilter === 'all' ||
        maxDim > 0 && (
        (dimensionFilter === 'under_1920' && maxDim < 1920) ||
        (dimensionFilter === '1920_2560' && maxDim >= 1920 && maxDim <= 2560) ||
        (dimensionFilter === 'over_2560' && maxDim > 2560) ||
        (dimensionFilter === 'very_large_4000' && maxDim >= 4000));

      if (!matchesDimensions) return false;

      // 6. Usage Filter
      const matchesUsage = usageFilter === 'all' ||
        (usageFilter === 'used' && item.inUse) ||
        (usageFilter === 'unused' && !item.inUse);

      if (!matchesUsage) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      // When filtering by 'optimized' or sorting by 'last_optimized'
      if (statusFilter === 'optimized' || sortBy === 'last_optimized') {
        // Honor specific user sort overrides if explicitly chosen
        if (sortBy === 'name_asc') {
          return a.filename.localeCompare(b.filename);
        }
        if (sortBy === 'size_desc') {
          const sizeA = a.status === 'optimized' && a.optimizedSizeKB ? a.optimizedSizeKB : a.originalSizeKB;
          const sizeB = b.status === 'optimized' && b.optimizedSizeKB ? b.optimizedSizeKB : b.originalSizeKB;
          return sizeB - sizeA || b.id - a.id;
        }
        if (sortBy === 'savings_desc') {
          return (b.savingPercent ?? 0) - (a.savingPercent ?? 0) || b.id - a.id;
        }
        if (sortBy === 'date_desc') {
          const timeA = Date.parse(a.uploadDate || '') || (a.id * 1000000);
          const timeB = Date.parse(b.uploadDate || '') || (b.id * 1000000);
          return timeB - timeA || b.id - a.id;
        }

        // Default sort for Already Optimized filter & Last Optimized:
        // Highest optimizedAt timestamp (most recently optimized) comes FIRST
        const isOptA = checkIsOptimized(a) ? 1 : 0;
        const isOptB = checkIsOptimized(b) ? 1 : 0;
        if (isOptA !== isOptB) return isOptB - isOptA;

        const timeA = a.optimizedAt ?? (1700000000000 + a.id * 1000);
        const timeB = b.optimizedAt ?? (1700000000000 + b.id * 1000);
        return timeB - timeA || b.id - a.id;
      }

      const sizeA = a.status === 'optimized' && a.optimizedSizeKB ? a.optimizedSizeKB : a.originalSizeKB;
      const sizeB = b.status === 'optimized' && b.optimizedSizeKB ? b.optimizedSizeKB : b.originalSizeKB;

      if (sortBy === 'size_desc') {
        return sizeB - sizeA || b.id - a.id;
      } else if (sortBy === 'savings_desc') {
        return (b.savingPercent ?? 0) - (a.savingPercent ?? 0) || b.id - a.id;
      } else if (sortBy === 'date_desc') {
        const timeA = Date.parse(a.uploadDate || '') || (a.id * 1000000);
        const timeB = Date.parse(b.uploadDate || '') || (b.id * 1000000);
        return timeB - timeA || b.id - a.id;
      } else if (sortBy === 'name_asc') {
        return a.filename.localeCompare(b.filename);
      }
      return 0;
    });
  }, [queue, searchQuery, fileTypeFilter, statusFilter, sizeFilter, dimensionFilter, usageFilter, sortBy]);

  const activeItem = filteredQueue.find(item => item.id === activeItemId) || filteredQueue[0];

  // Auto-update activeItemId if the currently selected item is no longer in the filtered list
  useEffect(() => {
    if (filteredQueue.length > 0) {
      const isStillInList = filteredQueue.some(item => item.id === activeItemId);
      if (!isStillInList) {
        setActiveItemId(filteredQueue[0].id);
      }
    }
  }, [filteredQueue, activeItemId]);

  // Reset preview loading and error states when activeItemId changes
  useEffect(() => {
    setIsPreviewLoading(true);
    setPreviewOriginalError(false);
    setPreviewOptimizedError(false);
  }, [activeItemId]);

  // Prefetch adjacent full resolution images in filtered queue for instantaneous switching
  useEffect(() => {
    if (!filteredQueue || filteredQueue.length === 0) return;
    const currentIndex = filteredQueue.findIndex(item => item.id === activeItemId);
    if (currentIndex === -1) return;

    const adjacentIndices = [
      currentIndex + 1,
      currentIndex + 2,
      currentIndex + 3,
      currentIndex - 1,
      currentIndex - 2
    ].filter(idx => idx >= 0 && idx < filteredQueue.length);

    adjacentIndices.forEach(idx => {
      const item = filteredQueue[idx];
      if (item) {
        const fullUrl = item.fullUrl || item.thumbnailUrl;
        if (fullUrl) {
          const img = new Image();
          img.src = fullUrl;
        }
        if (item.optimizedUrl) {
          const optImg = new Image();
          optImg.src = item.optimizedUrl;
        }
      }
    });
  }, [activeItemId, filteredQueue]);

  const { optimizedSizeKB, savingsPercent, optimizedDimensions } = useMemo(() => {
    if (!activeItem) {
      return { optimizedSizeKB: 0, savingsPercent: 0, optimizedDimensions: '' };
    }
    
    const isItemOptimized = checkIsOptimized(activeItem);
    if (isItemOptimized) {
      return {
        optimizedSizeKB: activeItem.optimizedSizeKB,
        savingsPercent: activeItem.savingPercent,
        optimizedDimensions: activeItem.dimensions
      };
    }
    
    return {
      optimizedSizeKB: activeItem.originalSizeKB,
      savingsPercent: 0,
      optimizedDimensions: activeItem.dimensions
    };
  }, [activeItem]);

  const isEstimate = activeItem ? !checkIsOptimized(activeItem) : false;

  // Rough size an image is expected to have AFTER optimization, from the chosen compression level and
  // output format. It is only a guide (shown with "~"); the real size is known after the image is optimized.
  const estimatedAfterSizeKB = useMemo(() => {
    if (!activeItem) return 0;
    let ratio = 0.65; // balanced
    if (compressionLevel === 'lossless') ratio = 0.9;
    else if (compressionLevel === 'aggressive') ratio = 0.5;
    else if (compressionLevel === 'custom') ratio = Math.min(0.95, Math.max(0.3, 0.3 + 0.65 * (Number(customQuality) / 100)));
    if (outputFormat === 'webp') ratio *= 0.75;
    else if (outputFormat === 'avif') ratio *= 0.6;
    return Math.max(1, Math.round(activeItem.originalSizeKB * ratio));
  }, [activeItem, compressionLevel, customQuality, outputFormat]);

  const activeFormatForTrans = activeItem
    ? (outputFormat === 'original' 
      ? (activeItem?.extension || activeItem?.filename?.split('.').pop() || '').toLowerCase() 
      : outputFormat)
    : 'webp';
  const activeSupportsTransparency = ['png', 'webp', 'avif'].includes(activeFormatForTrans);

  const previewDimensionsText = useMemo(() => {
    if (!activeItem) return '';
    const isItemOptimized = checkIsOptimized(activeItem);
    if (isItemOptimized) {
      return activeItem.dimensions;
    }
    if (activeItem.dimensions !== optimizedDimensions) {
      return `${activeItem.dimensions} × ${optimizedDimensions}`;
    }
    return activeItem.dimensions;
  }, [activeItem, optimizedDimensions]);

  // client-side representation of ImgSentry_Optimization_Stats class as single source of truth
  const ImgSentry_Optimization_Stats = useMemo(() => {
    return {
      get_total_images: (items: MediaItem[]): number => {
        return items.filter(item => item.category === 'images' && !item.isTrashed).length;
      },
      get_optimized_count: (items: MediaItem[], q: any[]): number => {
        if (q && q.length > 0) {
          return q.filter(item => checkIsOptimized(item)).length;
        }
        const images = items.filter(item => item.category === 'images' && !item.isTrashed);
        return images.filter(item => {
          const ext = (item.extension || item.filename.split('.').pop() || '').toLowerCase();
          const mime = (item.mimeType || '').toLowerCase();
          return ext === 'webp' || ext === 'avif' || mime === 'image/webp' || mime === 'image/avif';
        }).length;
      },
      get_optimized_percentage: (items: MediaItem[], q: any[]): number => {
        const total = items.filter(item => item.category === 'images' && !item.isTrashed).length || (q ? q.length : 0);
        if (total === 0) return 0;
        const optimized = ImgSentry_Optimization_Stats.get_optimized_count(items, q);
        return Number(((optimized / total) * 100).toFixed(1));
      },
      get_current_storage_bytes: (items: MediaItem[], q: any[]): number => {
        const images = items.filter(item => item.category === 'images' && !item.isTrashed);
        let totalBytes = 0;
        images.forEach(item => {
          const queueItem = q.find((qi: any) => qi.filename === item.filename);
          if (queueItem && queueItem.status === 'optimized') {
            totalBytes += queueItem.optimizedSizeKB * 1024;
          } else {
            totalBytes += item.fileSize || 0;
          }
        });
        return totalBytes;
      },
      get_storage_saved_bytes: (items: MediaItem[], q: any[]): number => {
        const images = items.filter(item => item.category === 'images' && !item.isTrashed);
        let savedBytes = 0;
        
        // Pre-optimized items
        const preOptimized = images.filter(item => item.extension === 'webp' || item.extension === 'avif');
        preOptimized.forEach(item => {
          savedBytes += Math.round((item.fileSize || 0) * 0.45);
        });

        // Actual savings from queue
        q.forEach((item: any) => {
          if (item.status === 'optimized') {
            savedBytes += Math.max(0, (item.originalSizeKB - item.optimizedSizeKB) * 1024);
          }
        });

        return savedBytes;
      },
      get_unoptimized_storage_bytes: (items: MediaItem[], q: any[]): number => {
        let unoptimizedBytes = 0;
        q.forEach((item: any) => {
          if (!checkIsOptimized(item)) {
            unoptimizedBytes += (item.originalSizeKB || 0) * 1024;
          }
        });
        return unoptimizedBytes;
      },
      get_backup_folder_bytes: (items: MediaItem[], q: any[]): number => {
        let backupBytes = 0;
        q.forEach((item: any) => {
          if (item.status === 'optimized' && item.backupCreated !== false) {
            backupBytes += (item.originalSizeKB || 0) * 1024;
          }
        });
        return backupBytes;
      }
    };
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
  };

  // 1. Total Images Count from actual Media List via ImgSentry_Optimization_Stats (or real serverStats)
  const totalImagesCount = useMemo(() => {
    if (serverStats?.total_images !== undefined) {
      return serverStats.total_images;
    }
    return ImgSentry_Optimization_Stats.get_total_images(mediaList);
  }, [mediaList, ImgSentry_Optimization_Stats, serverStats]);

  // 2. Optimized Images Count via ImgSentry_Optimization_Stats (or real serverStats)
  const optimizedImagesCount = useMemo(() => {
    if (serverStats?.optimized_count !== undefined) {
      return serverStats.optimized_count;
    }
    return ImgSentry_Optimization_Stats.get_optimized_count(mediaList, queue);
  }, [mediaList, queue, ImgSentry_Optimization_Stats, serverStats]);

  // 3. Optimized Images Percentage via ImgSentry_Optimization_Stats (or real serverStats)
  const optimizedPercentage = useMemo(() => {
    if (serverStats?.optimized_percentage !== undefined) {
      return serverStats.optimized_percentage;
    }
    return ImgSentry_Optimization_Stats.get_optimized_percentage(mediaList, queue);
  }, [mediaList, queue, ImgSentry_Optimization_Stats, serverStats]);

  // 4. Current Storage Bytes via ImgSentry_Optimization_Stats (or real serverStats)
  const currentStorageBytes = useMemo(() => {
    if (serverStats?.current_storage_bytes !== undefined) {
      return serverStats.current_storage_bytes;
    }
    return ImgSentry_Optimization_Stats.get_current_storage_bytes(mediaList, queue);
  }, [mediaList, queue, ImgSentry_Optimization_Stats, serverStats]);

  // 5. Storage Saved Bytes via ImgSentry_Optimization_Stats (or real serverStats)
  const storageSavedBytes = useMemo(() => {
    if (serverStats?.storage_saved_bytes !== undefined) {
      return serverStats.storage_saved_bytes;
    }
    return ImgSentry_Optimization_Stats.get_storage_saved_bytes(mediaList, queue);
  }, [mediaList, queue, ImgSentry_Optimization_Stats, serverStats]);

  // 6. Unoptimized Storage Bytes via ImgSentry_Optimization_Stats
  const unoptimizedStorageBytes = useMemo(() => {
    return ImgSentry_Optimization_Stats.get_unoptimized_storage_bytes(mediaList, queue);
  }, [mediaList, queue, ImgSentry_Optimization_Stats]);

  // 7. Backup Folder Bytes via ImgSentry_Optimization_Stats (or real serverStats)
  const backupFolderBytes = useMemo(() => {
    if (serverStats?.backup_folder_bytes !== undefined) {
      return serverStats.backup_folder_bytes;
    }
    return ImgSentry_Optimization_Stats.get_backup_folder_bytes(mediaList, queue);
  }, [mediaList, queue, ImgSentry_Optimization_Stats, serverStats]);

  const filterCounts = useMemo(() => {
    let jpg = 0;
    let png = 0;
    let webp = 0;
    let avif = 0;
    let used = 0;
    let unused = 0;

    queue.forEach(item => {
      const currentFormat = (item.format || '').toLowerCase();
      const mime = (item.mimeType || '').toLowerCase();
      const ext = ((item.filename ?? '').split('.').pop() || '').toLowerCase();

      if (currentFormat === 'webp' || mime === 'image/webp' || ext === 'webp') {
        webp++;
      } else if (currentFormat === 'avif' || mime === 'image/avif' || ext === 'avif') {
        avif++;
      } else if (currentFormat === 'png' || mime === 'image/png' || ext === 'png') {
        png++;
      } else {
        jpg++;
      }

      if (item.inUse) {
        used++;
      } else {
        unused++;
      }
    });

    const failed = queue.filter(item => item.status === 'failed').length;
    const allFormats = queue.length;
    const allStates = queue.length;
    const allUsage = queue.length;
    const optimized = queue.filter(item => checkIsOptimized(item)).length;
    const pending = Math.max(0, allStates - optimized - failed);

    return {
      allFormats,
      jpg,
      png,
      webp,
      avif,
      allStates,
      pending,
      optimized,
      failed,
      allUsage,
      used,
      unused,
    };
  }, [queue]);

  const totalSelectedOriginalKB = useMemo(() => {
    return queue
      .filter(q => selectedIds.includes(q.id))
      .reduce((acc, q) => acc + q.originalSizeKB, 0);
  }, [queue, selectedIds]);

  const chartData = useMemo(() => {
    const total = totalImagesCount;
    
    let readyCount = 0;
    let largeCount = 0;
    let totalWebPCount = 0;
    let totalAvifCount = 0;

    queue.forEach(item => {
      // 1. Calculate format counts independently
      const ext = (item.filename ?? '').split('.').pop()?.toLowerCase() || '';
      const mime = (item.mimeType || '').toLowerCase();
      const fmt = (item.format || '').toLowerCase();
      const isWebP = ext === 'webp' || mime.includes('webp') || fmt === 'webp';
      const isAvif = ext === 'avif' || mime.includes('avif') || fmt === 'avif';

      if (isWebP || item.nextGenFormats?.webp) {
        totalWebPCount++;
      }
      
      if (isAvif || item.nextGenFormats?.avif) {
        totalAvifCount++;
      }
      
      if (checkIsLargeImage(item)) {
        largeCount++;
      }
      
      if (!checkIsOptimized(item)) {
        readyCount++;
      }
    });

    const categories = [
      { key: 'ready', label: 'Ready to Optimize', count: readyCount, color: '#A61E69', bgClass: 'bg-[#A61E69]', isSlice: true },
      { key: 'large', label: 'Large Images', count: largeCount, color: '#f59e0b', bgClass: 'bg-amber-500', isSlice: true },
      { key: 'total_webp', label: 'Total WebP', count: totalWebPCount, color: '#a855f7', bgClass: 'bg-purple-500', isSlice: true },
      { key: 'total_avif', label: 'Total AVIF', count: totalAvifCount, color: '#f43f5e', bgClass: 'bg-rose-500', isSlice: true },
    ];

    let accumulatedPercentage = 0;
    const items = categories.map(cat => {
      const pct = total > 0 ? cat.count / total : 0;
      let startAngle = 0;
      if (cat.isSlice) {
        startAngle = accumulatedPercentage * 360;
        accumulatedPercentage += pct;
      }
      return {
        ...cat,
        pct,
        startAngle,
      };
    });

    return {
      total,
      items,
    };
  }, [queue, totalImagesCount]);

  const rechartsData = useMemo(() => {
    return chartData.items
      .filter(item => item.isSlice)
      .map(item => ({
        name: item.label,
        value: item.count,
        color: item.color,
      }));
  }, [chartData]);

  const recStats = useMemo(() => {
    let pngCount = 0;
    let jpgCount = 0;
    let webpCount = 0;
    let exceedDimensionsCount = 0;
    let additionalSavingsKB = 0;

    queue.forEach(item => {
      const ext = (item.filename ?? '').split('.').pop()?.toLowerCase() || '';
      const isOptimized = checkIsOptimized(item);
      const isPng = ext === 'png' || (item.mimeType && item.mimeType.toLowerCase().includes('png'));
      const isJpg = ext === 'jpg' || ext === 'jpeg' || (item.mimeType && (item.mimeType.toLowerCase().includes('jpeg') || item.mimeType.toLowerCase().includes('jpg')));
      const isWebp = ext === 'webp' || (item.mimeType && item.mimeType.toLowerCase().includes('webp'));

      if (!isOptimized) {
        if (isPng) {
          pngCount++;
          additionalSavingsKB += item.originalSizeKB * 0.71; // 71% average savings for PNG
        } else if (isJpg) {
          jpgCount++;
          additionalSavingsKB += item.originalSizeKB * 0.74; // 74% average savings for JPG
        }
      } else {
        if (isWebp && item.format !== 'avif') {
          webpCount++;
          additionalSavingsKB += item.originalSizeKB * 0.15; // 15% further savings for AVIF
        }
      }

      if (item.dimensions) {
        const parts = item.dimensions.split('x');
        if (parts.length === 2) {
          const w = parseInt(parts[0].trim(), 10);
          const h = parseInt(parts[1].trim(), 10);
          if (!isNaN(w) && !isNaN(h)) {
            if (w > 1920 || h > 1080) {
              exceedDimensionsCount++;
            }
          }
        }
      }
    });

    let formattedSavings = '0 KB';
    if (additionalSavingsKB > 0) {
      if (additionalSavingsKB < 1024) {
        formattedSavings = `${Math.round(additionalSavingsKB)} KB`;
      } else {
        const mb = additionalSavingsKB / 1024;
        if (mb < 1024) {
          formattedSavings = `${mb.toFixed(1)} MB`;
        } else {
          const gb = mb / 1024;
          formattedSavings = `${gb.toFixed(2)} GB`;
        }
      }
    }

    return {
      pngCount,
      jpgCount,
      webpCount,
      exceedDimensionsCount,
      formattedSavings,
    };
  }, [queue]);

  // Handle slide movement
  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    handleMove(e.clientX);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    handleMove(e.clientX);
  };

  const handleGlobalMouseUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('mouseup', handleGlobalMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isDraggingRef.current = true;
    if (e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDraggingRef.current && e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
  };

  const handleItemSelect = (id: number) => {
    setActiveItemId(id);
    // Selecting a queue row never changes the compression level: it is one shared setting.
  };

  const toggleSelectId = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredQueue.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredQueue.map(item => item.id));
    }
  };

  // Perform single/bulk optimization simulation
  const handleOptimizeAction = async (idsToOptimize: number[], force: boolean = forceReoptimize) => {
    if (idsToOptimize.length === 0) {
      if (onShowToast) onShowToast('Please select at least one image to optimize.', 'error');
      return;
    }

    if (!ensureAccountConnected()) {
      return;
    }

    if (hasSettingsError) {
      if (customQualityError) {
        if (onShowToast) onShowToast('Please enter a valid Custom Quality percentage (1–100%) before optimizing.', 'error');
      } else {
        if (onShowToast) onShowToast('Please correct invalid Max Width or Max Height settings before optimizing.', 'error');
      }
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    cancelRef.current = false;
    quotaStopRef.current = false;
    setQuotaStopMessage(null);
    setQuotaStopResult(null);
    let quotaStopText = '';
    let quotaStopCode = '';

    const concurrency = 3;
    let totalSavedKB = 0;
    let processedCount = 0;
    const allProcessedIds: number[] = [];
    const currentlyProcessing = new Set<number>();
    
    // Convert current settings to OptimizationOptions (always read from currentOptionsRef for freshest values)
    const options = currentOptionsRef.current;
    
    // Filter media items to optimize, including queue dimensions & size
    const itemsToProcess = queue
      .filter(q => idsToOptimize.includes(q.id))
      .map(q => {
        const found = mediaList.find(m => m.id === q.id || m.filename === q.filename);
        const origExt = (q.originalFormat || (q.filename ?? '').split('.').pop() || 'jpg').toLowerCase();
        return {
          mediaItem: {
            id: q.id,
            title: q.filename,
            filename: q.filename,
            url: q.thumbnailUrl,
            mimeType: q.mimeType,
            category: 'images' as const,
            extension: origExt,
            fileSize: q.originalSizeKB * 1024,
            formattedSize: `${q.originalSizeKB} KB`,
            dimensions: q.dimensions,
            uploadDate: found?.uploadDate || 'May 10, 2024',
            location: found?.location || 'Uploads',
            isAttached: true,
            inUse: q.inUse,
            isTrashed: false,
            daysInTrash: 0
          },
          cachedEstimate: q.cachedEstimate
        };
      });
    
    let currentIndex = 0;

    // One image: show the live progress dialog (percentage comes from the server). Several images: handled by the server queue + top bar.
    const singleTarget = itemsToProcess.length === 1 && isWpRuntime() ? itemsToProcess[0].mediaItem : null;
    let singleFailMessage = '';
    let singleSkipped = false;
    if (singleTarget) {
      startSingleProgress(singleTarget);
    }

    const processItem = async () => {
      while (currentIndex < itemsToProcess.length) {
        if (cancelRef.current || quotaStopRef.current) break;
        
        const index = currentIndex++;
        const { mediaItem, cachedEstimate } = itemsToProcess[index];
        const mediaItemId = mediaItem.id;
        
        currentlyProcessing.add(mediaItemId);
        setProcessingIds(Array.from(currentlyProcessing));
        // An image stopped by the quota is NOT "processed": it must not move the progress ring.
        let countThisItem = true;
        
        try {
          const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
          const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
          const nonce = wpData?.nonce;
          let result: any = null;

          if (ajaxUrl && nonce) {
            const formData = new FormData();
            formData.append('action', 'imgsentry_optimize_image');
            formData.append('nonce', nonce);
            formData.append('attachment_id', String(mediaItemId));
            
            // Format options object for PHP backend (quality sent as integer if custom)
            const qualityValue = options.compressionLevel === 'custom' 
              ? (typeof options.quality === 'number' ? options.quality : (typeof options.customQuality === 'number' ? options.customQuality : Math.round(Number(customQuality))))
              : null;

            const phpOptions = {
              compression_level: options.compressionLevel || 'balanced',
              quality: qualityValue,
              resize_large: Boolean(options.resizeLargeImages),
              max_width: (options.resizeLargeImages && options.maxWidth) ? options.maxWidth : 0,
              max_height: (options.resizeLargeImages && options.maxHeight) ? options.maxHeight : 0,
              keep_exif: Boolean(options.keepExif),
              preserve_transparency: Boolean(options.preserveTransparency),
              output_format: options.outputFormat || 'original',
              force: Boolean(force),
            };
            formData.append('options', JSON.stringify(phpOptions));
            
            const req = await fetch(ajaxUrl, {
              method: 'POST',
              body: formData
            });
            const res = await req.json();

            if (res.data && res.data.quota) {
              setQuota(res.data.quota);
            }
            
            if (res.success && res.data) {
              if (res.data.skipped) {
                result = {
                  success: true,
                  skipped: true,
                  attachmentId: res.data.attachment_id,
                  message: res.data.message || 'Attachment is already optimized. Skipped.',
                };
              } else {
                const siblingSizes = res.data.sibling_sizes || {};
                const siblingSizeBytes = res.data.next_gen_size || siblingSizes[options.outputFormat];
                result = {
                  success: true,
                  attachmentId: res.data.attachment_id,
                  originalSizeBytes: res.data.original_size,
                  optimizedSizeBytes: res.data.new_size, // Primary compressed size from PHP ($new_size)
                  primarySizeBytes: res.data.new_size,
                  nextGenSiblingSizeBytes: siblingSizeBytes,
                  bytesSaved: res.data.bytes_saved,
                  percentSaved: res.data.percent_saved,
                  newFormat: res.data.output_format,
                  newFilepath: res.data.new_filepath,
                  newUrl: res.data.new_url,
                  backupPath: res.data.backup_path,
                  hasBackup: Boolean(res.data.has_backup),
                  next_gen_formats: res.data.next_gen_formats,
                  error: null,
                  errorCode: null,
                };
              }
            } else {
              result = {
                success: false,
                errorCode: res.data?.error_code || 'optimization_failed',
                errorReason: res.data?.error || res.data?.message || 'Server image optimization failed.'
              };
            }
          } else {
            // Development fallback/simulation in standalone browser preview
            // Check if item is already optimized in simulation mode unless force is true
            const queueItem = queue.find(q => q.id === mediaItemId);
            if (!force && queueItem && (queueItem.status === 'optimized' || checkIsOptimized(queueItem))) {
              result = {
                success: true,
                skipped: true,
                attachmentId: mediaItemId,
                message: 'Attachment is already optimized. Skipped.',
              };
            } else {
              if (import.meta.env.DEV) {
                result = await simulateOptimizeImage(mediaItem as any, options);
              } else {
                result = {
                  success: false,
                  errorCode: 'optimization_failed',
                  errorReason: 'Image optimization is not available right now.'
                };
              }
            }
          }
          
          if (cancelRef.current) break;
          
          if (result.success) {
            if (result.skipped) singleSkipped = true;
            const qItem = queue.find(q => q.id === mediaItemId);
            const requestedNextGen = (options.outputFormat || result.output_format || 'original').toLowerCase();
            const serverNextGenMeta = result.next_gen_formats;
            const siblingSizeBytes = result.nextGenSiblingSizeBytes || result.next_gen_size || (serverNextGenMeta?.[requestedNextGen]?.size_bytes) || result.nextGenFormats?.siblingSizeBytes;
            const siblingSizeKB = siblingSizeBytes ? Math.round(siblingSizeBytes / 1024) : result.nextGenFormats?.siblingSizeKB;

            const primarySizeBytes = result.primarySizeBytes !== undefined ? result.primarySizeBytes : (result.new_size !== undefined ? result.new_size : (result.optimizedSizeBytes !== undefined ? result.optimizedSizeBytes : Math.round(result.originalSizeBytes * 0.9)));
            
            // Headline size/saving is the size of the main file (the file people download), not the WebP / AVIF copy
            let optSizeBytes = primarySizeBytes;
            if (result.effective_size !== undefined && result.effective_size > 0) {
              optSizeBytes = result.effective_size;
            } else if (result.effectiveSizeBytes !== undefined && result.effectiveSizeBytes > 0) {
              optSizeBytes = result.effectiveSizeBytes;
            } else if (result.optimizedSizeBytes !== undefined) {
              optSizeBytes = result.optimizedSizeBytes;
            }
            const optSizeKB = Math.round(optSizeBytes / 1024);

            const origSizeBytes = result.original_size !== undefined ? Number(result.original_size) : (result.originalSizeBytes !== undefined ? Number(result.originalSizeBytes) : (qItem?.originalSizeKB ? qItem.originalSizeKB * 1024 : optSizeBytes));
            const savedBytes = result.bytes_saved !== undefined ? Number(result.bytes_saved) : (result.bytesSaved !== undefined ? Number(result.bytesSaved) : Math.max(0, origSizeBytes - optSizeBytes));
            const savedKBMb = Math.round(savedBytes / 1024);
            totalSavedKB += savedKBMb;
            allProcessedIds.push(mediaItemId);
            
            const newFormat = (result.newFormat || options.outputFormat || 'original').toLowerCase();
            const newMimeType = newFormat === 'webp' ? 'image/webp' : newFormat === 'avif' ? 'image/avif' : (newFormat === 'png' ? 'image/png' : 'image/jpeg');

            const savingPct = typeof result.percent_saved === 'number'
              ? Math.round(result.percent_saved)
              : (typeof result.percentSaved === 'number'
                ? Math.round(result.percentSaved)
                : (origSizeBytes > 0 ? Math.round((savedBytes / origSizeBytes) * 100) : 0));

            // Size and saving of the file people actually get: the WebP / AVIF copy when it is smaller than the
            // main file, otherwise the main file (same rule as the server and the Media Library column).
            const siblingBytesNum = siblingSizeBytes ? Number(siblingSizeBytes) : 0;
            const useSibling = (requestedNextGen === 'webp' || requestedNextGen === 'avif') && siblingBytesNum > 0 && siblingBytesNum < optSizeBytes;
            const deliveredBytes = useSibling ? siblingBytesNum : optSizeBytes;
            const deliveredPct = origSizeBytes > 0
              ? Math.round(Math.max(0, Math.min(100, ((origSizeBytes - deliveredBytes) / origSizeBytes) * 100)))
              : savingPct;

            const optTimestamp = Date.now() + index;

            if (qItem) {
              const primaryFormat = qItem.originalFormat || (qItem.format as any) || (qItem.filename.split('.').pop() || 'jpg').toLowerCase();
              const primaryExtension = (qItem.filename.split('.').pop() || primaryFormat).toLowerCase();
              const primaryMimeType = qItem.mimeType || (primaryExtension === 'png' ? 'image/png' : primaryExtension === 'webp' ? 'image/webp' : primaryExtension === 'avif' ? 'image/avif' : 'image/jpeg');

              const existingNextGen = qItem.nextGenFormats || {};
              // The server says which WebP / AVIF files really exist (a copy that is not smaller than its JPG is removed).
              const serverHasNextGenMeta = Boolean(serverNextGenMeta) && typeof serverNextGenMeta === 'object';
              const nextGenFormats = {
                ...existingNextGen,
                ...(serverHasNextGenMeta
                  ? {
                      webp: Boolean(serverNextGenMeta?.webp?.exists),
                      avif: Boolean(serverNextGenMeta?.avif?.exists),
                      siblingSizeBytes: undefined,
                      siblingSizeKB: undefined,
                      siblingFormat: undefined,
                    }
                  : {
                      ...(requestedNextGen === 'webp' || result.newFormat === 'webp' || result.nextGenFormats?.webp ? { webp: true } : {}),
                      ...(requestedNextGen === 'avif' || result.newFormat === 'avif' || result.nextGenFormats?.avif ? { avif: true } : {}),
                    }),
                ...(siblingSizeBytes ? { siblingSizeBytes, siblingSizeKB, siblingFormat: requestedNextGen } : (result.nextGenFormats?.siblingSizeKB ? { siblingSizeBytes: result.nextGenFormats.siblingSizeBytes, siblingSizeKB: result.nextGenFormats.siblingSizeKB, siblingFormat: result.nextGenFormats.siblingFormat } : {})),
              };

              // The format shown is the format of the main file (the file people download).
              const effectiveDisplayExt = primaryExtension;

              onUpdateMediaItem?.(mediaItemId, {
                filename: qItem.filename,
                title: qItem.title || qItem.filename,
                optimizedSizeKB: optSizeKB,
                savingPercent: deliveredPct,
                deliveredSizeBytes: deliveredBytes,
                deliveredPercent: deliveredPct,
                deliveredFormat: useSibling ? requestedNextGen : '',
                optimizationStatus: 'optimized',
                format: primaryFormat as any,
                mimeType: primaryMimeType,
                extension: primaryExtension,
                display_extension: effectiveDisplayExt,
                effective_format: effectiveDisplayExt,
                displayExtension: effectiveDisplayExt,
                effectiveFormat: effectiveDisplayExt,
                outputFormat: requestedNextGen,
                output_format: requestedNextGen,
                next_gen_formats: serverNextGenMeta || nextGenFormats,
                nextGenFormats,
                dimensions: result.newDimensions || qItem.dimensions,
                backupCreated: typeof result.hasBackup === 'boolean' ? result.hasBackup : (qItem.backupCreated || (settings?.generateBackupBeforeOptimization !== false)),
                originalFormat: primaryFormat as any,
                optimizedAt: optTimestamp,
                fileSize: optSizeBytes,
                effective_size: optSizeBytes,
                effectiveSize: optSizeBytes,
                bytes_saved: savedBytes,
                bytesSaved: savedBytes,
                formattedSize: optSizeKB < 1024 ? `${optSizeKB} KB` : `${(optSizeKB / 1024).toFixed(2)} MB`,
                originalSizeKB: qItem.originalSizeKB,
                optimizedUrl: qItem.fullUrl || qItem.thumbnailUrl,
                fullUrl: qItem.fullUrl || qItem.thumbnailUrl
              });
            }
          } else if (isQuotaStopCode(result.errorCode)) {
            // Quota used up (or optimization not allowed on this host): this is not the image's fault.
            // Do not mark it failed; stop the rest of the run and tell the user once.
            countThisItem = false;
            if (!quotaStopRef.current) {
              quotaStopRef.current = true;
              quotaStopText = result.errorReason || 'Optimization stopped: quota reached.';
              quotaStopCode = String(result.errorCode || '');
              setQuotaStopMessage(quotaStopText);
              if (onShowToast) onShowToast(quotaStopText, 'error');
            }
          } else {
            // Real failure case with server error message
            onUpdateMediaItem?.(mediaItemId, {
              optimizationStatus: 'failed',
              errorCode: result.errorCode || 'optimization_failed',
              errorMessage: result.errorReason || 'Server image optimization failed.',
              optimizationError: result.errorReason || 'Server image optimization failed.'
            });
            const errorMsg = result.errorReason || (result.errorCode ? `Error (${result.errorCode})` : 'Unknown server error');
            singleFailMessage = errorMsg;
            if (onShowToast) onShowToast(`Failed to optimize ${mediaItem.filename}: ${errorMsg}`, 'error');
          }
        } catch (e) {
          console.error('Optimization error', e);
          singleFailMessage = 'The optimization request did not finish. Please try again.';
        } finally {
          currentlyProcessing.delete(mediaItemId);
          setProcessingIds(Array.from(currentlyProcessing));
          if (countThisItem) {
            processedCount++;
          }
          setProcessingProgress(Math.round((processedCount / itemsToProcess.length) * 100));
        }
      }
    };

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(processItem());
    }
    
    await Promise.all(workers);

    if (singleTarget) {
      if (quotaStopRef.current || cancelRef.current) {
        // The quota notice (or the cancel message) below already tells the person what happened
        closeSingleDialog();
      } else if (allProcessedIds.includes(singleTarget.id)) {
        finishSingleProgress('done', { savedBytes: Math.max(0, totalSavedKB) * 1024, skipped: singleSkipped });
      } else {
        finishSingleProgress('failed', { message: singleFailMessage || 'Optimization did not complete. Please try again.' });
      }
    }

    // Re-fetch centralized stats from server
    await fetchOptimizationStats();
    
    setProcessingIds([]);
    setIsProcessing(false);
    setSelectedIds(prev => prev.filter(id => !allProcessedIds.includes(id)));

    // Stopped by the quota: tell the person clearly what was done and what was not.
    if (quotaStopRef.current) {
      setQuotaStopMessage(null);
      setQuotaStopResult({
        message: quotaStopText || 'Optimization stopped: quota reached.',
        done: allProcessedIds.length,
        total: itemsToProcess.length,
        code: quotaStopCode,
      });
    }
    
    const fileNamesStr = allProcessedIds.map(id => queue.find(q => q.id === id)?.filename).filter(Boolean).join(', ');
    
    const alreadyOptimizedItems = queue.filter(q => idsToOptimize.includes(q.id) && q.status === 'optimized');
    const alreadyOptimizedCount = alreadyOptimizedItems.length;
    
    if (cancelRef.current) {
      if (onShowToast) onShowToast(`Optimization cancelled. Processed ${processedCount} out of ${itemsToProcess.length} images.`);
    } else {
      if (onShowToast && allProcessedIds.length > 0) {
        onShowToast(`Successfully optimized ${allProcessedIds.length} images! Saved ${(totalSavedKB < 1024) ? totalSavedKB.toFixed(0) + ' KB' : (totalSavedKB / 1024).toFixed(1) + ' MB'}.`, 'success');
      }
      
      if (onAddLog && allProcessedIds.length > 0) {
        if (alreadyOptimizedCount > 0) {
          onAddLog('Images Re-Optimized', `Compressed ${allProcessedIds.length} images (${fileNamesStr}) with output format ${outputFormat.toUpperCase()}. Reused original backup for ${alreadyOptimizedCount} already-optimized image(s).`);
        } else {
          onAddLog('Images Optimized', `Compressed ${allProcessedIds.length} images (${fileNamesStr}) with output format ${outputFormat.toUpperCase()}.`);
        }
      }
      
      if (onAddDetailedLog && allProcessedIds.length > 0) {
        const safeguardNote = alreadyOptimizedCount > 0 
          ? ` Safeguarded Multiple Optimizations: Detected ${alreadyOptimizedCount} already-optimized image(s). Reused the existing first-time uncompressed original backup to prevent duplicate backup files and disk storage bloat.` 
          : '';
        
        onAddDetailedLog(
          'Success',
          'Optimization',
          'Media Optimizer',
          'Image Compression Completed',
          `Successfully processed ${allProcessedIds.length} queue items. Modernized originals using next-gen ${outputFormat.toUpperCase()} container. Saved ${(totalSavedKB / 1024).toFixed(2)} MB of physical disk storage.${safeguardNote}`
        );
      }
    }
  };

  const handleRestoreOriginalsRequest = () => {
    const selectedItems = queue.filter(item => selectedIds.includes(item.id));
    if (selectedItems.length === 0) {
      if (onShowToast) onShowToast('Please select at least one image to restore.', 'error');
      return;
    }

    const restorable = selectedItems.filter(item => item.status === 'optimized' && item.backupCreated !== false);
    const unrestorable = selectedItems.filter(item => item.status !== 'optimized' || item.backupCreated === false);

    if (restorable.length === 0) {
      if (selectedItems.some(i => i.status === 'optimized' && i.backupCreated === false)) {
        if (onShowToast) onShowToast('Selected optimized image(s) cannot be restored because backup generation was turned off during optimization.', 'error');
      } else {
        if (onShowToast) onShowToast('None of the selected images are currently optimized with an available backup.', 'error');
      }
      return;
    }

    setRestoreItemsToProcess(restorable);
    setUnrestorableCount(unrestorable.length);
    setShowRestoreModal(true);
  };

  const executeRestoreOriginals = async (itemsToRestore: OptimizeItem[]) => {
    if (itemsToRestore.length === 0) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    cancelRef.current = false;

    const concurrency = 3;
    let processedCount = 0;
    let restoredCount = 0;
    const restoredIds: number[] = [];
    const failedItems: { filename: string; reason: string }[] = [];
    const currentlyProcessing = new Set<number>();

    let currentIndex = 0;

    const processRestoreItem = async () => {
      while (currentIndex < itemsToRestore.length) {
        if (cancelRef.current) break;

        const index = currentIndex++;
        const item = itemsToRestore[index];
        const mediaItemId = item.id;

        currentlyProcessing.add(mediaItemId);
        setProcessingIds(Array.from(currentlyProcessing));

        try {
          const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
          const ajaxUrl = wpData?.ajaxUrl || wpData?.ajax_url;
          const nonce = wpData?.nonce;

          let isSuccess = false;
          let restoreData: any = null;
          let failReason = 'Backup image archive missing or corrupted.';

          if (ajaxUrl && nonce) {
            const formData = new FormData();
            formData.append('action', 'imgsentry_restore_original');
            formData.append('nonce', nonce);
            formData.append('attachment_id', String(mediaItemId));

            const req = await fetch(ajaxUrl, {
              method: 'POST',
              body: formData,
            });
            const res = await req.json();

            if (res.success && res.data) {
              isSuccess = true;
              restoreData = res.data;
            } else {
              isSuccess = false;
              failReason = res.data?.error || res.data?.message || 'Backup image archive missing or corrupted.';
            }
          } else {
            // Standalone preview simulation fallback
            await new Promise(resolve => setTimeout(resolve, 350));
            isSuccess = true;
          }

          if (cancelRef.current) break;

          if (isSuccess) {
            restoredCount++;
            restoredIds.push(mediaItemId);

            const qItem = queue.find(q => q.id === mediaItemId);
            if (qItem) {
              const origFormat = (restoreData?.restored_format || qItem.originalFormat || 'jpg').toLowerCase();
              const baseName = (qItem.filename ?? '').replace(/\.[^/.]+$/, '');
              const originalFilename = `${baseName}.${origFormat}`;
              const originalMime = restoreData?.original_mime || (origFormat === 'png' ? 'image/png' : origFormat === 'webp' ? 'image/webp' : origFormat === 'avif' ? 'image/avif' : 'image/jpeg');
              const origSizeBytes = restoreData?.restored_size ? Number(restoreData.restored_size) : qItem.originalSizeKB * 1024;
              const origSizeKB = Math.round(origSizeBytes / 1024);
              const origFormattedSize = origSizeKB < 1024 ? `${origSizeKB} KB` : `${(origSizeKB / 1024).toFixed(2)} MB`;

              onUpdateMediaItem?.(mediaItemId, {
                optimizationStatus: 'ready',
                optimizedSizeKB: 0,
                savingPercent: 0,
                deliveredSizeBytes: undefined,
                deliveredPercent: undefined,
                deliveredFormat: undefined,
                format: origFormat as any,
                backupCreated: false, // Backup deleted upon restore
                filename: originalFilename,
                title: originalFilename,
                extension: origFormat,
                display_extension: origFormat,
                effective_format: origFormat,
                displayExtension: origFormat,
                effectiveFormat: origFormat,
                mimeType: originalMime,
                fileSize: origSizeBytes,
                formattedSize: origFormattedSize,
                outputFormat: undefined,
                output_format: undefined,
                next_gen_formats: undefined,
                nextGenFormats: { webp: false, avif: false }
              });
            }
          } else {
            failedItems.push({ filename: item.filename, reason: failReason });
            // If stale backup was detected and cleared, update item state so Restore button is removed
            onUpdateMediaItem?.(mediaItemId, {
              backupCreated: false,
            });
          }
        } catch (err) {
          failedItems.push({ filename: item.filename, reason: 'Unexpected restore error.' });
        } finally {
          currentlyProcessing.delete(mediaItemId);
          setProcessingIds(Array.from(currentlyProcessing));
          processedCount++;
          setProcessingProgress(Math.round((processedCount / itemsToRestore.length) * 100));
        }
      }
    };

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(processRestoreItem());
    }

    await Promise.all(workers);

    // Re-fetch centralized stats from server
    await fetchOptimizationStats();

    setProcessingIds([]);
    setIsProcessing(false);

    // Remove restored items from selected state
    setSelectedIds(prev => prev.filter(id => !restoredIds.includes(id)));

    if (cancelRef.current) {
      if (onShowToast) {
        onShowToast(`Restore cancelled. Restored ${restoredCount} out of ${itemsToRestore.length} images.`);
      }
    } else {
      if (failedItems.length > 0) {
        const failReasonMsg = failedItems.map(f => `${f.filename}: ${f.reason}`).join(', ');
        if (onShowToast) {
          onShowToast(`Restored ${restoredCount} images. Failed: ${failReasonMsg}`, 'error');
        }
      } else {
        if (onShowToast) {
          onShowToast(`Successfully restored ${restoredCount} image(s) to original size and format.`, 'success');
        }
      }

      if (onAddLog && restoredCount > 0) {
        onAddLog('Images Restored', `Restored ${restoredCount} images back to uncompressed original versions.`);
      }

      if (onAddDetailedLog && restoredCount > 0) {
        onAddDetailedLog(
          'Info',
          'Optimization',
          'Media Optimizer',
          'Image Restoration Completed',
          `Reverted ${restoredCount} optimized queue items back to their original recorded backup binaries.`
        );
      }
    }
  };

  const handleResetSettings = () => {
    setCompressionLevel('balanced');
    setCustomQuality(78);
    setMaxWidth('1920');
    setMaxHeight('1080');
    setResizeLargeImages(false);
    setKeepExif(false);
    setStripMetadata(true);
    setPreserveTransparency(true);
    setOutputFormat('webp');
    setSliderPosition(50);
    try {
      localStorage.setItem('imgsentry_optimization_settings_v1', JSON.stringify({
        maxWidth: '1920',
        maxHeight: '1080',
        resizeLargeImages: false,
        keepExif: false,
        stripMetadata: true,
        preserveTransparency: true
      }));
    } catch (e) {}
    if (onShowToast) onShowToast('Settings reset to recommended defaults.');
  };

  // Recommendations Quick Actions
  const handleApplyRecommendation = (type: 'png' | 'jpg' | 'webp' | 'dimensions') => {
    if (type === 'png') {
      setStatusFilter('not_optimized');
      setFileTypeFilter('png');
      setOutputFormat('webp');
      setCompressionLevel('balanced');
      if (onShowToast) onShowToast('Filtered queue for unoptimized PNG images & set output format to WebP (Recommended).');
    } else if (type === 'jpg') {
      setStatusFilter('not_optimized');
      setFileTypeFilter('jpg');
      setOutputFormat('webp');
      setCompressionLevel('balanced');
      if (onShowToast) onShowToast('Filtered queue for unoptimized JPG images & set output format to WebP (Recommended).');
    } else if (type === 'webp') {
      setStatusFilter('optimized');
      setFileTypeFilter('webp');
      setOutputFormat('avif');
      setCompressionLevel('aggressive');
      if (onShowToast) onShowToast('Filtered queue for WebP images & set output format to AVIF (Next-Gen).');
    } else if (type === 'dimensions') {
      setStatusFilter('large');
      setFileTypeFilter('all');
      setResizeLargeImages(true);
      setMaxWidth('1920');
      setMaxHeight('1080');
      if (onShowToast) onShowToast('Filtered queue for large images and enabled resizing bounds (1920x1080).');
    }
    setCurrentPage(1);
  };



  // Pagination Helper
  const totalPages = Math.ceil(filteredQueue.length / itemsPerPage) || 1;
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredQueue.length);
  const paginatedQueue = filteredQueue.slice(startIndex, endIndex);

  // True while the server queue still has work: the header then shows "Cancel Processing" instead of "Bulk Optimize"
  const queueActive = Boolean(userInitiatedBatchActive && serverQueue && (serverQueue.pending > 0 || serverQueue.processing > 0));

  // The dialog may be shown for an image started on an earlier page: fill the name / size from the list when we have them
  const singleDialogView: SingleOptimizeState | null = (() => {
    if (!singleDialog) return null;
    const qi = queue.find(q => q.id === singleDialog.id);
    return {
      ...singleDialog,
      fileName: singleDialog.fileName || qi?.filename || `Image #${singleDialog.id}`,
      metaLine: singleDialog.metaLine || (qi ? `${formatSizeLabel(qi.originalSizeKB * 1024)}  ·  ${(qi.filename.split('.').pop() || '').toUpperCase()}` : ''),
      thumbUrl: singleDialog.thumbUrl || qi?.thumbnailUrl,
    };
  })();

  // Keep parent simulator's top header synced with our states & actions
  useEffect(() => {
    if (onRegisterActions) {
      const pendingIds = filteredQueue.filter(q => q.status === 'ready' || q.status === 'failed').map(q => q.id);
      onRegisterActions({
        // Several images run on the server queue (keeps going when the page is closed). One image uses the live progress popup.
        optimizeSelected: () => (selectedIds.length > 1 && isWpRuntime() ? handleEnqueueServerQueue(selectedIds) : handleOptimizeAction(selectedIds)),
        bulkOptimizeAll: () => (pendingIds.length > 1 && isWpRuntime() ? handleEnqueueServerQueue(pendingIds) : handleOptimizeAction(pendingIds)),
        resetSettings: handleResetSettings,
        exportReport: () => {
          const itemsToExport = selectedIds.length > 0 
            ? queue.filter(item => selectedIds.includes(item.id))
            : queue;

          if (itemsToExport.length === 0) {
            if (onShowToast) onShowToast('No images available to export.', 'error');
            return;
          }

          const headers = [
            'ID',
            'Filename',
            'Original Size (KB)',
            'Optimized Size (KB)',
            'Savings (%)',
            'Dimensions',
            'MIME Type',
            'Usage Count',
            'Status',
            'Compression Level',
            'Format',
            'Backup Created',
            'Upload Date'
          ];

          const escapeCSVValue = (val: any) => {
            if (val === undefined || val === null) return '';
            const stringVal = String(val);
            if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
              return `"${stringVal.replace(/"/g, '""')}"`;
            }
            return stringVal;
          };

          const rows = itemsToExport.map(item => [
            item.id,
            csvCell(item.filename),
            item.originalSizeKB,
            typeof (item.displaySizeKB ?? item.optimizedSizeKB) === 'number' ? (item.displaySizeKB ?? item.optimizedSizeKB) : csvCell('N/A'),
            csvCell(item.savingPercent > 0 ? `${item.savingPercent.toFixed(1)}%` : '0%'),
            csvCell(item.dimensions),
            csvCell(item.mimeType),
            item.usedCount,
            csvCell(item.status),
            csvCell(item.compressionLevel || 'N/A'),
            csvCell(item.format || 'original'),
            csvCell(item.backupCreated ? 'Yes' : 'No'),
            csvCell(item.uploadDate || 'N/A')
          ]);

          const csvContent = [
            headers.map(h => csvCell(h)).join(','),
            ...rows.map(row => row.join(','))
          ].join('\n');

          try {
            const blob = new Blob([CSV_BOM, csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `image_optimization_report_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (onShowToast) {
              const msg = selectedIds.length > 0 
                ? `Exported report for ${selectedIds.length} selected image(s) (CSV).`
                : `Exported report for all ${itemsToExport.length} image(s) (CSV).`;
              onShowToast(msg);
            }
          } catch (error) {
            console.error('Failed to export CSV report:', error);
            if (onShowToast) onShowToast('Failed to export CSV report.', 'error');
          }
        },
        restoreOriginals: handleRestoreOriginalsRequest,
        removeFromQueue: () => {
          if (selectedIds.length === 0) {
            if (onShowToast) onShowToast('No selected images in queue.', 'error');
            return;
          }
          setSelectedIds([]);
          if (onShowToast) onShowToast('Cleared selection queue.');
        },
        cancelProcessing: () => {
          if (queueActive) {
            handleCancelServerQueue();
          }
          cancelRef.current = true;
        },
        enqueueBackgroundQueue: () => {
          const ids = selectedIds.length > 0 ? selectedIds : pendingIds;
          handleEnqueueServerQueue(ids);
        },
        cancelBackgroundQueue: handleCancelServerQueue,
        serverQueueStatus: serverQueue,
        selectedCount: selectedIds.length,
        pendingCount: pendingIds.length,
        restorableCount: restorableSelectedItems.length,
        hasSettingsError,
        isProcessing: isProcessing || queueActive
      });
    }
  }, [selectedIds, queue, filteredQueue, restorableSelectedItems, isProcessing, queueActive, hasSettingsError, onRegisterActions, compressionLevel, customQuality, parsedWidth, parsedHeight, resizeLargeImages, keepExif, stripMetadata, preserveTransparency, outputFormat, settings?.generateBackupBeforeOptimization, serverQueue]);

  return (
    <div className="space-y-6">

      {/* Monthly optimization quota: usage bar and notifications (Free plan) */}
      <OptimizationQuotaBar quota={quota} upgradeUrl={getProFeatures().upgradeUrl} />

      {/* 2. SUMMARY METRICS (5 Cards Row matching screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Images */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
            <Grid className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Total Images</span>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 block leading-none">
              {totalImagesCount.toLocaleString()}
            </div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded-md inline-block mt-2">
              All images in library
            </div>
          </div>
        </div>

        {/* Optimized Images */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Optimized Images</span>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block leading-none">
              {optimizedImagesCount.toLocaleString()}
            </div>
            <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-[#4ade80]/15 dark:text-[#4ade80] px-2 py-0.5 rounded-md inline-block mt-2">
              {optimizedPercentage}% of all images
            </div>
          </div>
        </div>

        {/* Backup Folder Size */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Backup Folder Size</span>
            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block leading-none">
              {formatBytes(backupFolderBytes)}
            </div>
            <div className="text-[12px] font-semibold text-indigo-700 bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-0.5 rounded-md inline-block mt-2">
              Original images preserved
            </div>
          </div>
        </div>

        {/* Current Storage */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
            <FolderCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Current Storage</span>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 block leading-none">
              {formatBytes(currentStorageBytes)}
            </div>
            <div className="text-[12px] font-semibold text-amber-800 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-md inline-block mt-2">
              Space used by images
            </div>
          </div>
        </div>

        {/* Storage Saved */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Storage Saved</span>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 block leading-none">
              {formatBytes(storageSavedBytes)}
            </div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded-md inline-block mt-2">
              So far optimized
            </div>
          </div>
        </div>
      </div>

      {/* 2.5 BULK OPTIMIZATION PROGRESS BAR: sticks to the top of the screen on every tab (shown in the host next to the scan bar) */}
      {userInitiatedBatchActive && serverQueue && (serverQueue.total > 0 || serverQueue.is_running || serverQueue.pending > 0 || serverQueue.processing > 0) && (
        <PortalHost hostId="imgsentry-optimization-bar-host">
          <OptimizationProgressBar
            data={buildBarData(serverQueue, (id) => queue.find(q => q.id === id)?.filename)}
            cancelling={isCancellingQueue}
            onCancel={handleCancelServerQueue}
            onDismiss={handleClearServerQueue}
            onViewResults={() => {
              onNavigateToOptimization?.();
              setStatusFilter('optimized');
              setSortBy('last_optimized');
              setCurrentPage(1);
              if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </PortalHost>
      )}

      {/* SINGLE IMAGE OPTIMIZATION DIALOG: live %, Minimize button, small chip while minimized */}
      {singleDialogView && (
        <PortalHost hostId="imgsentry-optimization-overlay-host">
          <SingleOptimizeDialog
            state={singleDialogView}
            onMinimize={() => setSingleDialog(prev => (prev ? { ...prev, minimized: true } : prev))}
            onRestore={() => setSingleDialog(prev => (prev ? { ...prev, minimized: false } : prev))}
            onClose={closeSingleDialog}
          />
        </PortalHost>
      )}

      {/* FILTER BAR MATCHING OTHER TABS */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value as any;
              setStatusFilter(val);
              if (val === 'optimized') {
                setSortBy('last_optimized');
              }
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="not_optimized">Not Optimized</option>
            <option value="optimized">Already Optimized</option>
            <option value="pending">Pending</option>
            <option value="large">Large Images</option>
            <option value="failed">Failed</option>
          </select>

          {/* Format Filter */}
          <select
            value={fileTypeFilter}
            onChange={(e) => {
              setFileTypeFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Formats</option>
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
            <option value="avif">AVIF</option>
            <option value="gif">GIF</option>
          </select>

          {/* Size Filter */}
          <select
            value={sizeFilter}
            onChange={(e) => {
              setSizeFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Sizes</option>
            <option value="under_100kb">Under 100 KB</option>
            <option value="100_500kb">100 KB – 500 KB</option>
            <option value="500kb_1mb">500 KB – 1 MB</option>
            <option value="1mb_5mb">1 MB – 5 MB</option>
            <option value="over_5mb">Over 5 MB</option>
          </select>

          {/* Dimensions Filter */}
          <select
            value={dimensionFilter}
            onChange={(e) => {
              setDimensionFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Dimensions</option>
            <option value="under_1920">Under 1920px</option>
            <option value="1920_2560">1920–2560px</option>
            <option value="over_2560">Over 2560px</option>
            <option value="very_large_4000">Very Large Images (4000px+)</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="size_desc">Sort: File Size (Largest)</option>
            <option value="savings_desc">Sort: Potential Saving</option>
            <option value="date_desc">Sort: Upload Date</option>
            <option value="last_optimized">Sort: Last Optimized</option>
            <option value="name_asc">Sort: Filename (A–Z)</option>
          </select>

          {/* Reset Filters Button */}
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('not_optimized');
              setFileTypeFilter('all');
              setSizeFilter('all');
              setDimensionFilter('all');
              setSortBy('size_desc');
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-[#1e293b] text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>

          {/* Search Box */}
          <div className="relative">
            <input 
              type="text"
              placeholder="Search images..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-3 pr-8 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-60 text-gray-800 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579]"
            />
            <Search className="w-4 h-4 text-gray-400 dark:text-[#5b6579] absolute right-2.5 top-2" />
          </div>
        </div>
      </div>

      {/* 3. CORE 3-COLUMN LAYOUT MATCHING SCREENSHOT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COLUMN A: OPTIMIZATION QUEUE (col-span-5) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs overflow-hidden flex flex-col h-full">
          
          <div className="p-4 border-b border-gray-100 dark:border-[#243044] flex items-center justify-between bg-gray-50/40 dark:bg-slate-800/20">
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-white! flex items-center gap-2">
              <span>Optimization Queue</span>
              <span className="bg-gray-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-xs px-2 py-0.5 rounded-md border border-gray-200/50 dark:border-slate-700/50 font-bold">
                {filteredQueue.length}
              </span>
            </h2>
            { (searchQuery || statusFilter !== 'not_optimized' || fileTypeFilter !== 'all' || sizeFilter !== 'all' || dimensionFilter !== 'all') && (
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md">
                Filtered
              </span>
            )}
          </div>

          {/* Select All / Clear Selection Sub-Bar & Skip-Optimized Toggle.
              Fixed-width pieces + no text wrapping: the bar keeps the same height whether or not
              something is selected, so the list below never jumps. */}
          {(() => {
            const allFilteredSelected = filteredQueue.length > 0 && filteredQueue.every(item => selectedIds.includes(item.id));
            const someSelected = selectedIds.length > 0;
            return (
              <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-slate-800/40 border-b border-gray-100 dark:border-[#243044] flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                  <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allFilteredSelected; }}
                      disabled={filteredQueue.length === 0}
                      onChange={() => {
                        if (allFilteredSelected) {
                          setSelectedIds([]);
                        } else {
                          setSelectedIds(filteredQueue.map(item => item.id));
                        }
                      }}
                      className="w-4 h-4 rounded-sm border-gray-300 dark:border-slate-700 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                    />
                    <span>Select all ({filteredQueue.length})</span>
                  </label>

                  <span className="min-w-[84px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    {someSelected ? <b className="text-[#A61E69]">{selectedIds.length}</b> : 0} selected
                  </span>

                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    disabled={!someSelected}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors ${
                      someSelected
                        ? 'text-red-700 bg-red-50 hover:bg-red-100 dark:text-red-300 dark:bg-red-950/40 dark:hover:bg-red-950/60 cursor-pointer'
                        : 'text-slate-400 opacity-40 cursor-default'
                    }`}
                  >
                    Clear
                  </button>
                </div>

                <div className="flex items-center gap-3 ml-auto shrink-0 whitespace-nowrap">
                  <label
                    className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none"
                    title="When enabled, previously optimized images will be re-processed rather than skipped"
                  >
                    <input
                      type="checkbox"
                      checked={forceReoptimize}
                      onChange={(e) => setForceReoptimize(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-700 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                    />
                    <span>Force Re-optimize</span>
                  </label>

                  {someSelected ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleEnqueueServerQueue(selectedIds, forceReoptimize);
                      }}
                      disabled={isEnqueueingQueue || hasSettingsError}
                      className="min-w-[176px] h-[30px] px-3 rounded-lg text-[11.5px] font-extrabold bg-[#A61E69] hover:bg-[#8F1B5A] text-white inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Queue selected images for non-blocking background optimization via WP-Cron"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Queue Background ({selectedIds.length})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const allFiltered = filteredQueue.map(i => i.id);
                        if (allFiltered.length === 0) return;
                        handleEnqueueServerQueue(allFiltered, forceReoptimize);
                      }}
                      disabled={isEnqueueingQueue || filteredQueue.length === 0 || hasSettingsError}
                      className="min-w-[176px] h-[30px] px-3 rounded-lg text-[11.5px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Queue all filtered images for background processing"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Queue All ({filteredQueue.length})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* List queue items */}
          <div className="divide-y divide-gray-100 dark:divide-[#243044] min-h-[380px]">
            {paginatedQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 h-full">
                <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                <span className="text-xs font-bold">No images match current filter criteria.</span>
                <button 
                  onClick={() => { setFileTypeFilter('all'); setStatusFilter('not_optimized'); setSearchQuery(''); }}
                  className="text-blue-600 font-bold hover:underline text-[11px] mt-1 cursor-pointer"
                >
                  Reset active filters
                </button>
              </div>
            ) : (
              paginatedQueue.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const isActive = item.id === activeItemId;
                const isItemOptimized = checkIsOptimized(item);
                const isProcessingItem = processingIds.includes(item.id);

                return (
                  <div 
                    key={item.id}
                    onClick={() => handleItemSelect(item.id)}
                    className={`p-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer hover:bg-gray-50/60 dark:hover:bg-slate-800/40 relative ${
                      isActive ? 'bg-blue-50/30 dark:bg-blue-950/10 border-l-2 border-blue-600' : ''
                    } ${isProcessingItem ? 'opacity-75' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Selection checkbox */}
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelectId(item.id);
                        }}
                        disabled={isProcessingItem}
                        className="w-4 h-4 rounded-sm border-gray-300 dark:border-slate-700 text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer disabled:opacity-50"
                      />

                      {/* Thumbnail with strict optimization */}
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-gray-100 dark:border-[#243044] bg-gray-100 dark:bg-slate-800 shrink-0 shadow-2xs">
                        <img 
                          src={item.thumbnailUrl} 
                          alt={item.filename}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        {isProcessingItem ? (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          </div>
                        ) : item.status === 'failed' || item.errorMessage ? (
                          <div className="absolute top-0 right-0 bg-red-600 text-white rounded-bl-lg p-1" title={item.errorMessage || `Error: ${item.errorCode || 'Optimization failed'}`}>
                            <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                          </div>
                        ) : isItemOptimized ? (
                          <div className="absolute top-0 right-0 bg-emerald-500 text-white rounded-bl-lg p-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : null}
                      </div>

                      {/* Metadata info */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5 leading-normal">
                          <span className="truncate">{item.filename}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                          <FormatBadge format={item.format || (item.mimeType ? item.mimeType.split('/')[1] : (item.filename.split('.').pop() || 'jpg'))} />
                          {item.nextGenFormats?.webp && (
                            <span 
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800" 
                              title={item.nextGenFormats.siblingSizeKB && (item.nextGenFormats.siblingFormat === 'webp' || !item.nextGenFormats.siblingFormat)
                                ? `WebP Next-Gen sibling: ${item.nextGenFormats.siblingSizeKB} KB (served via <picture> tag)`
                                : "WebP Next-Gen sibling available for <picture> tag delivery"}
                            >
                              + WebP
                            </span>
                          )}
                          {item.nextGenFormats?.avif && (
                            <span 
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800" 
                              title={item.nextGenFormats.siblingSizeKB && (item.nextGenFormats.siblingFormat === 'avif' || !item.nextGenFormats.siblingFormat)
                                ? `AVIF Next-Gen sibling: ${item.nextGenFormats.siblingSizeKB} KB (served via <picture> tag)`
                                : "AVIF Next-Gen sibling available for <picture> tag delivery"}
                            >
                              + AVIF
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{item.dimensions}</span>
                          
                          {/* Real Error Code & Message Pill */}
                          {(item.status === 'failed' || item.errorMessage) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedErrorId(prev => prev === item.id ? null : item.id);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-200 dark:hover:bg-red-900 transition-colors cursor-pointer"
                              title={item.errorMessage || `Error code: ${item.errorCode || 'failed'}`}
                            >
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>{item.errorCode ? `Error: ${item.errorCode}` : 'Optimization Failed'}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${expandedErrorId === item.id ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                        
                        {/* Expanded Error Details Box */}
                        {expandedErrorId === item.id && (item.errorMessage || item.errorCode) && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-900/60 text-xs text-red-800 dark:text-red-200 animate-in fade-in duration-150"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1">
                                {item.errorCode && (
                                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                                    Code: {item.errorCode}
                                  </div>
                                )}
                                <div className="font-medium text-xs leading-normal">
                                  {item.errorMessage || 'Unknown server optimization error occurred.'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOptimizeAction([item.id])}
                                disabled={isProcessingItem}
                                className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Retry
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {/* Pages Used Label */}
                        {item.inUse ? (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDrawer(item);
                            }}
                            className="flex items-center gap-1.5 cursor-pointer group/label select-none leading-tight"
                            title="Click to view image usage details"
                          >
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 group-hover/label:text-blue-600 dark:group-hover/label:text-blue-400 group-hover/label:underline transition-colors font-semibold flex items-center gap-0.5">
                              Used on {item.usedCount} {item.usedCount === 1 ? 'page' : 'pages'}
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover/label:text-blue-600 dark:group-hover/label:text-blue-400 transition-colors" />
                            </span>
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md transition-colors bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 group-hover/label:bg-blue-100 dark:group-hover/label:bg-blue-900/60">
                              Used
                            </span>
                          </div>
                        ) : (
                          <div 
                            className="flex items-center gap-1.5 select-none cursor-default leading-tight"
                          >
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              Used on {item.usedCount} {item.usedCount === 1 ? 'page' : 'pages'}
                            </span>
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
                              Unused
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Size and Savings info */}
                    <div className="text-right shrink-0 flex items-center gap-4">
                      {isItemOptimized ? (
                        <>
                          {/* Metric column 1: Optimized Size & Original Size strikethrough */}
                          <div className="flex flex-col justify-center min-w-[70px] text-right">
                            <div className="text-xs font-black text-slate-800 dark:text-white leading-4 h-4 flex items-center justify-end">
                              {((item.displaySizeKB ?? item.optimizedSizeKB) < 1024) ? (item.displaySizeKB ?? item.optimizedSizeKB) + ' KB' : ((item.displaySizeKB ?? item.optimizedSizeKB) / 1024).toFixed(2) + ' MB'}
                            </div>
                            {(!item.savingsUnknown && !item.savings_unknown && item.originalSizeKB > 0 && item.originalSizeKB !== (item.displaySizeKB ?? item.optimizedSizeKB)) ? (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold line-through leading-4 h-4 flex items-center justify-end">
                                {(item.originalSizeKB < 1024) ? item.originalSizeKB + ' KB' : (item.originalSizeKB / 1024).toFixed(2) + ' MB'}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium leading-4 h-4 flex items-center justify-end">
                                Current
                              </div>
                            )}
                          </div>

                          {/* Metric column 2: Real Savings % badge */}
                          <div className="flex flex-col justify-center min-w-[48px] text-center">
                            <div className="h-4 flex items-center justify-center">
                              {item.savingsUnknown || item.savings_unknown || item.savingPercent === undefined || item.savingPercent === null || isNaN(item.savingPercent) ? (
                                <span 
                                  title={item.externallyOptimized ? 'Optimized by another plugin: the saving is not known' : 'Original size prior to optimization unknown (no backup file exists on disk)'} 
                                  className="bg-slate-100 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold text-[10px] px-2 py-0.5 rounded-md inline-flex items-center justify-center leading-none"
                                >
                                  —
                                </span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 font-black text-[10px] px-2 py-0.5 rounded-md inline-flex items-center justify-center leading-none">
                                  {item.savingPercent}%
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-4 h-4 flex items-center justify-center">
                              Saving
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Unoptimized / Queued Item: Clean single original file size */
                        <div className="text-right min-w-[70px]">
                          <div className="text-xs font-black text-slate-800 dark:text-white">
                            {(item.originalSizeKB < 1024) ? item.originalSizeKB + ' KB' : (item.originalSizeKB / 1024).toFixed(2) + ' MB'}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        {isItemOptimized ? (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOptimizeAction([item.id], true);
                            }}
                            title="Force Re-optimize this image with current settings"
                            disabled={isProcessing}
                            className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-lg cursor-pointer transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOptimizeAction([item.id], false);
                            }}
                            title="Optimize image with current settings"
                            disabled={isProcessing}
                            className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg cursor-pointer transition-colors"
                          >
                            <Zap className="w-4 h-4" />
                          </button>
                        )}

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setHiddenQueueIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]));
                            setSelectedIds(prev => prev.filter(id => id !== item.id));
                            if (onShowToast) onShowToast(`Removed ${item.filename} from the queue. The file itself is not deleted.`);
                          }}
                          title="Remove from Queue"
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-[#e7ecf3] hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination matching Used Files Have */}
          <div className="p-4 border-t border-gray-100 dark:border-[#243044] bg-white dark:bg-slate-800/50 flex items-center justify-between gap-4 text-xs text-gray-500 dark:text-slate-400">
            {/* Left Selection Controls / Items Count */}
            <div className="flex items-center gap-3">
              <span>Total {filteredQueue.length} items</span>
            </div>

            {/* Right Pagination */}
            <div className="flex items-center gap-3 text-gray-500 dark:text-slate-400">
              {totalPages >= 1 && (
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
        </div>

        {/* COLUMN B: INTERACTIVE PREVIEW & OPTIMIZATION SETTINGS (col-span-4) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* COMPARISON SLIDER CARD */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs overflow-hidden">
            {!activeItem ? (
              <div className="p-8 text-center flex flex-col items-center justify-center min-h-[300px] text-slate-500 dark:text-slate-400">
                <EyeOff className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-3 animate-pulse" />
                <h3 className="font-extrabold text-slate-800 dark:text-white mb-1 text-sm">Select an image to preview</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[240px]">
                  No images match your current filter settings, or no image has been selected.
                </p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-[#243044] bg-gray-50/40 dark:bg-slate-800/20">
                  {/* Row 1: label on the left, status + reset on the right. Nothing here can wrap or shrink. */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <Eye className="w-4 h-4 text-blue-600" />
                      <span>Preview</span>
                    </span>

                    <div className="flex items-center gap-1.5 ml-auto shrink-0 whitespace-nowrap">
                      {activeItem.inUse ? (
                        <button
                          onClick={() => handleOpenDrawer(activeItem)}
                          className="h-[26px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors font-extrabold text-[10.5px] tracking-wide px-2.5 rounded-full uppercase cursor-pointer inline-flex items-center gap-1.5 select-none group/preview-label border border-emerald-200 dark:border-emerald-500/30 whitespace-nowrap"
                          title="Click to view usage details"
                        >
                          <Check className="w-3 h-3 shrink-0" />
                          <span className="group-hover/preview-label:underline">Used on {activeItem.usedCount} {activeItem.usedCount === 1 ? 'page' : 'pages'}</span>
                          <ChevronRight className="w-3 h-3 shrink-0 text-emerald-600 dark:text-emerald-400 transition-transform group-hover/preview-label:translate-x-0.5" />
                        </button>
                      ) : (
                        <span className="h-[26px] bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-extrabold text-[10.5px] tracking-wide px-2.5 rounded-full uppercase select-none cursor-default inline-flex items-center gap-1.5 border border-purple-200 dark:border-purple-800 whitespace-nowrap">
                          <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-dashed border-purple-500 shrink-0" />
                          Unused file
                        </span>
                      )}

                      <button
                        onClick={() => setSliderPosition(50)}
                        className="h-[26px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-[#1e293b] px-2.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-[#e7ecf3] inline-flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap"
                        title="Reset split position to 50%"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Row 2: file name on ONE line. A long name is shortened in the middle; the end (for example "-n.jpg") always stays visible. */}
                  {(() => {
                    const fullName = String(activeItem.filename || '');
                    const keep = Math.min(fullName.length, 12);
                    const head = fullName.slice(0, fullName.length - keep);
                    const tail = fullName.slice(fullName.length - keep);
                    return (
                      <h2
                        className="flex min-w-0 text-sm font-extrabold text-slate-800 dark:text-white!"
                        title={fullName}
                      >
                        <span className="truncate min-w-0">{head}</span>
                        <span className="shrink-0 whitespace-pre">{tail}</span>
                      </h2>
                    );
                  })()}
                </div>

                {/* Split Drag Box */}
                {(() => {
                  const activeOriginalUrl = previewOriginalError
                    ? activeItem.thumbnailUrl
                    : (activeItem.fullUrl || activeItem.thumbnailUrl);

                  const rawOptimizedUrl = previewOptimizedError
                    ? activeItem.thumbnailUrl
                    : (activeItem.optimizedUrl || activeItem.fullUrl || activeItem.thumbnailUrl);

                  const activeOptimizedUrl = (activeItem.status === 'optimized' && activeItem.optimizedAt && !previewOptimizedError)
                    ? `${rawOptimizedUrl}${rawOptimizedUrl.includes('?') ? '&' : '?'}v=${activeItem.optimizedAt}`
                    : rawOptimizedUrl;

                  const originalKey = `preview-orig-${activeItem.id}`;
                  const optimizedKey = `preview-opt-${activeItem.id}-${activeItem.status}-${activeItem.optimizedAt || 0}`;

                  return (
                    <div 
                      ref={containerRef}
                      onMouseDown={handleMouseDown}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className="relative z-0 isolate aspect-video bg-slate-950 select-none overflow-hidden cursor-ew-resize group"
                    >
                      {/* Low-res Blurred Background Placeholder */}
                      {activeItem.thumbnailUrl && (
                        <img 
                          src={activeItem.thumbnailUrl} 
                          alt=""
                          aria-hidden="true"
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover blur-lg scale-105 opacity-60 pointer-events-none transition-opacity duration-300"
                        />
                      )}

                      {/* Loading Skeleton / Pulse Overlay */}
                      {isPreviewLoading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 backdrop-blur-[1px] pointer-events-none transition-opacity duration-200">
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/85 text-white text-xs font-semibold shadow-lg border border-white/10 animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                            <span>Loading preview…</span>
                          </div>
                        </div>
                      )}

                      {/* Image 1: Original */}
                      <img 
                        key={originalKey}
                        src={activeOriginalUrl} 
                        alt="Original version"
                        loading="eager"
                        referrerPolicy="no-referrer"
                        onLoad={() => setIsPreviewLoading(false)}
                        onError={() => {
                          setPreviewOriginalError(true);
                          setIsPreviewLoading(false);
                        }}
                        className={`absolute inset-0 w-full h-full object-cover pointer-events-auto transition-opacity duration-200 ${
                          isPreviewLoading ? 'opacity-0' : 'opacity-100'
                        }`}
                      />
                      <div 
                        className="absolute bottom-4 left-6 text-center flex flex-col items-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] select-none z-2 whitespace-nowrap pointer-events-auto"
                        style={{ fontFamily: "'Noto Sans', 'Noto Sans Fallback', Arial, sans-serif" }}
                      >
                        <span className="font-bold text-[20px] leading-none uppercase tracking-wider">Original</span>
                        <span className="text-[14px] font-bold text-white/90 mt-1">
                          { (activeItem.originalSizeKB < 1024) ? activeItem.originalSizeKB + ' KB' : (activeItem.originalSizeKB / 1024).toFixed(1) + ' MB' }
                        </span>
                      </div>

                      {/* Image 2: Optimized (Clipped dynamically) */}
                      <div 
                        className="absolute inset-0 pointer-events-auto overflow-hidden"
                        style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
                      >
                        <img 
                          key={optimizedKey}
                          src={activeOptimizedUrl} 
                          alt="Optimized version"
                          loading="eager"
                          referrerPolicy="no-referrer"
                          onLoad={() => setIsPreviewLoading(false)}
                          onError={() => {
                            setPreviewOptimizedError(true);
                            setIsPreviewLoading(false);
                          }}
                          className={`absolute inset-0 w-full h-full object-cover pointer-events-auto transition-opacity duration-200 ${
                            isPreviewLoading ? 'opacity-0' : 'opacity-100'
                          }`}
                        />
                      </div>
                      <div 
                        className="absolute top-4 right-6 text-center flex flex-col items-center text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] select-none z-2 whitespace-nowrap pointer-events-auto"
                        style={{ fontFamily: "'Noto Sans', 'Noto Sans Fallback', Arial, sans-serif" }}
                      >
                        <span className="font-bold text-[20px] leading-none uppercase tracking-wider">
                          Optimized
                        </span>
                        <span className="text-[14px] font-bold text-white/90 mt-1">
                          {checkIsOptimized(activeItem)
                            ? (((activeItem.displaySizeKB ?? activeItem.optimizedSizeKB) < 1024) ? (activeItem.displaySizeKB ?? activeItem.optimizedSizeKB) + ' KB' : ((activeItem.displaySizeKB ?? activeItem.optimizedSizeKB) / 1024).toFixed(1) + ' MB')
                            : '~' + ((estimatedAfterSizeKB < 1024) ? estimatedAfterSizeKB + ' KB' : (estimatedAfterSizeKB / 1024).toFixed(1) + ' MB')}
                        </span>
                      </div>

                      {/* Vertical Slider Bar handle */}
                      <div 
                        className="absolute top-0 bottom-0 -translate-x-1/2 w-1 bg-white cursor-ew-resize flex items-center justify-center pointer-events-auto z-10 shadow-[0_0_8px_rgba(0,0,0,0.35)]"
                        style={{ left: `${sliderPosition}%` }}
                      >
                        <div className="flex items-center gap-4 pointer-events-auto select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
                          <svg className="w-3 h-3.5 text-white fill-current shrink-0" viewBox="0 0 10 12">
                            <path d="M10 0L0 6L10 12V0Z" />
                          </svg>
                          <svg className="w-3 h-3.5 text-white fill-current shrink-0" viewBox="0 0 10 12">
                            <path d="M0 0L10 6L0 12V0Z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* OPTIMIZATION SETTINGS CARD */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-[#243044] flex items-center justify-between bg-gray-50/40 dark:bg-slate-800/20">
              <h2 className="flex! flex-row! items-center! gap-1.5 m-0! p-0! text-sm! leading-5! font-extrabold! text-slate-800 dark:text-white!">
                <Settings className="w-4 h-4 shrink-0 text-slate-600" />
                <span>Optimization Settings</span>
              </h2>
              <div className="flex items-center gap-3">
                {isOptDirty && (
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-extrabold dark:bg-amber-950/40 dark:text-amber-400">
                    Unsaved changes
                  </span>
                )}
                <button
                  type="button"
                  onClick={saveOptimizationDraft}
                  disabled={!isOptDirty || isSavingOpt || customQualityError}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
                >
                  {isSavingOpt ? 'Saving...' : 'Save'}
                </button>
                <button 
                  onClick={() => {
                    handleResetSettings();
                    if (onShowToast) onShowToast('Settings reset to default values.');
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                >
                  Reset to Default
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              
              {/* Compression Level (one setting, shared with Settings > Default compression level) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Compression Level</span>
                  {compressionLevel === 'custom' && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.25 rounded-md font-extrabold uppercase dark:bg-blue-950/50 dark:text-blue-400">
                      CUSTOM ({customQuality}%)
                    </span>
                  )}
                </label>
                <div role="radiogroup" aria-label="Compression level" className="flex flex-wrap items-center gap-3">
                  {([
                    { value: 'lossless', label: 'Lossless' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'aggressive', label: 'Aggressive' },
                    { value: 'custom', label: 'Custom' },
                  ] as const).map((opt) => {
                    const active = compressionLevel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setCompressionLevel(opt.value)}
                        className={`px-4 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs ${
                          active
                            ? 'bg-blue-50/50 border-blue-500 text-blue-700 dark:bg-blue-950/20 dark:border-blue-500 dark:text-blue-400'
                            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#1e293b]'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                          active
                            ? 'border-blue-600 bg-white dark:bg-slate-900'
                            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                        }`}>
                          {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                        </div>
                        <span>{opt.label}</span>
                        {opt.value === 'balanced' && (
                          <span className="text-[8px] bg-emerald-50 text-emerald-700 px-1 py-0.25 rounded-sm dark:bg-emerald-950/50 dark:text-emerald-400">Recommended</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Quality Input Block (Revealed when Custom compression level is active) */}
                {compressionLevel === 'custom' && (
                  <div className={`mt-3 p-3 ${customQualityError ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/50' : 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/80 dark:border-blue-900/50'} border rounded-xl space-y-2.5 animate-in fade-in duration-150`}>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <SlidersHorizontal className={`w-3.5 h-3.5 ${customQualityError ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`} />
                        <span>Custom Quality Percentage</span>
                      </span>
                      <span className={`font-mono font-black ${customQualityError ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        {customQualityError ? 'Invalid' : `${customQuality}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range"
                        min="1"
                        max="100"
                        step="1"
                        value={isNaN(parsedCustomQuality) ? 80 : Math.min(100, Math.max(1, parsedCustomQuality))}
                        onChange={(e) => setCustomQuality(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex items-center shrink-0">
                        <input 
                          type="number"
                          min="1"
                          max="100"
                          value={customQuality}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              setCustomQuality('');
                            } else {
                              const num = parseInt(val, 10);
                              setCustomQuality(isNaN(num) ? val : num);
                            }
                          }}
                          className={`w-16 bg-white dark:bg-slate-800 border ${
                            customQualityError 
                              ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500 text-red-700 dark:text-red-300' 
                              : 'border-gray-300 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-100'
                          } rounded-lg px-2 py-1 text-xs font-bold font-mono text-center`}
                        />
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">%</span>
                      </div>
                    </div>
                    {customQualityError && (
                      <p id="custom-quality-error-msg" className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Please enter a valid numeric quality percentage between 1 and 100%.</span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Resize Large Images Toggle */}
              <div className="flex items-start justify-between p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Resize Large Images</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {resizeLargeImages 
                      ? 'Resizes images exactly to the custom Width or Height dimensions specified below.' 
                      : 'Original image dimensions will remain untouched during optimization.'}
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setResizeLargeImages(!resizeLargeImages)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 mt-0.5 cursor-pointer ${
                    resizeLargeImages ? 'bg-[#A61E69]' : 'bg-gray-200 dark:bg-slate-800'
                  }`}
                >
                  <span 
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                      resizeLargeImages ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Custom Dimensions Row with Validation */}
              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className={`text-[11px] font-bold ${resizeLargeImages ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400/60 dark:text-slate-600'}`}>Width (px)</label>
                    {widthError && (
                      <span className="text-[10px] font-bold text-red-500">10 - 10000px</span>
                    )}
                  </div>
                  <input 
                    type="number" 
                    value={maxWidth}
                    min="10"
                    max="10000"
                    disabled={!resizeLargeImages}
                    onChange={(e) => setMaxWidth(e.target.value)}
                    className={`w-full bg-white dark:bg-slate-800 border ${
                      widthError 
                        ? 'border-red-400 dark:border-red-500 ring-1 ring-red-400' 
                        : 'border-gray-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500'
                    } rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 dark:placeholder:text-[#5b6579] focus:outline-hidden disabled:opacity-50 disabled:bg-slate-100 disabled:dark:bg-slate-900/80 disabled:cursor-not-allowed`}
                    placeholder="1920"
                  />
                  {widthError && (
                    <p className="text-[10px] text-red-500 font-medium">Must be a valid integer (10-10000).</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className={`text-[11px] font-bold ${resizeLargeImages ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400/60 dark:text-slate-600'}`}>Height (px)</label>
                    {heightError && (
                      <span className="text-[10px] font-bold text-red-500">10 - 10000px</span>
                    )}
                  </div>
                  <input 
                    type="number" 
                    value={maxHeight}
                    min="10"
                    max="10000"
                    disabled={!resizeLargeImages}
                    onChange={(e) => setMaxHeight(e.target.value)}
                    className={`w-full bg-white dark:bg-slate-800 border ${
                      heightError 
                        ? 'border-red-400 dark:border-red-500 ring-1 ring-red-400' 
                        : 'border-gray-200 dark:border-slate-700 focus:ring-1 focus:ring-blue-500'
                    } rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 dark:placeholder:text-[#5b6579] focus:outline-hidden disabled:opacity-50 disabled:bg-slate-100 disabled:dark:bg-slate-900/80 disabled:cursor-not-allowed`}
                    placeholder="1080"
                  />
                  {heightError && (
                    <p className="text-[10px] text-red-500 font-medium">Must be a valid integer (10-10000).</p>
                  )}
                </div>
              </div>

              {/* Toggles Group (2-column layout matching screenshot) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-2">
                {/* Keep EXIF Metadata */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <span className="text-xs font-bold">Keep EXIF Metadata</span>
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help shrink-0" />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setKeepExif(!keepExif)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer outline-hidden shrink-0 ${
                      keepExif ? 'bg-[#A61E69]' : 'bg-gray-200 dark:bg-slate-800'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                      keepExif ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Preserve Transparency */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <span className="text-xs font-bold">Preserve Transparency</span>
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help shrink-0" />
                  </div>
                  <button 
                    type="button"
                    onClick={() => setPreserveTransparency(!preserveTransparency)}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer outline-hidden shrink-0 ${
                      preserveTransparency ? 'bg-[#A61E69]' : 'bg-gray-200 dark:bg-slate-800'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                      preserveTransparency ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Backup Storage & Persistence Info */}
                <div className="col-span-1 sm:col-span-2 mt-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      <FolderCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Backup Storage & Retention
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80">
                          Indefinite Storage
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        Backups are stored safely in <code className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200 font-mono text-[10px]">{settings?.backupDirectory || 'wp-content/uploads/imgsentry/backups/'}</code> and persist indefinitely until you restore the image or remove it from the Media Library.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToSettings) {
                        onNavigateToSettings('advanced');
                      } else {
                        window.location.hash = '#section-backup-settings';
                      }
                    }}
                    className="p-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 rounded-lg transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 text-xs font-semibold shrink-0 self-start sm:self-center"
                    title="Change Backup Settings"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600" />
                    <span>Settings</span>
                  </button>
                </div>


              </div>

              {/* Output format picker pills */}
              <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-[#243044]">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Output Format</label>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Original */}
                  <button 
                    type="button"
                    onClick={() => setOutputFormat('original')}
                    onMouseDown={() => setOutputFormat('original')}
                    onTouchStart={() => setOutputFormat('original')}
                    className={`px-4 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs ${
                      outputFormat === 'original' 
                        ? 'bg-blue-50/50 border-blue-500 text-blue-700 dark:bg-blue-950/20 dark:border-blue-500 dark:text-blue-400' 
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                      outputFormat === 'original' 
                        ? 'border-blue-600 bg-white dark:bg-slate-900' 
                        : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                    }`}>
                      {outputFormat === 'original' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <span>Original</span>
                  </button>

                  {/* WebP */}
                  <button 
                    type="button"
                    onClick={() => setOutputFormat('webp')}
                    onMouseDown={() => setOutputFormat('webp')}
                    onTouchStart={() => setOutputFormat('webp')}
                    className={`px-4 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs ${
                      outputFormat === 'webp' 
                        ? 'bg-blue-50/50 border-blue-500 text-blue-700 dark:bg-blue-950/20 dark:border-blue-500 dark:text-blue-400' 
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                      outputFormat === 'webp' 
                        ? 'border-blue-600 bg-white dark:bg-slate-900' 
                        : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                    }`}>
                      {outputFormat === 'webp' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <span>WebP</span>
                  </button>

                  {/* AVIF */}
                  <button 
                    type="button"
                    onClick={() => setOutputFormat('avif')}
                    onMouseDown={() => setOutputFormat('avif')}
                    onTouchStart={() => setOutputFormat('avif')}
                    className={`px-4 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-2xs ${
                      outputFormat === 'avif' 
                        ? 'bg-blue-50/50 border-blue-500 text-blue-700 dark:bg-blue-950/20 dark:border-blue-500 dark:text-blue-400' 
                        : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#1e293b]'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                      outputFormat === 'avif' 
                        ? 'border-blue-600 bg-white dark:bg-slate-900' 
                        : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                    }`}>
                      {outputFormat === 'avif' && (
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <span>AVIF</span>
                  </button>
                </div>

                {/* Inline warning if AVIF is selected but server environment lacks support */}
                {outputFormat === 'avif' && (serverCapabilities ? !serverCapabilities.has_avif : !MOCK_SERVER_SUPPORTS_AVIF) && (
                  <div className="mt-2.5 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5 animate-in fade-in duration-150 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">AVIF Environment Warning:</span>
                      Your server ({serverCapabilities?.active_engine || 'PHP Imagick / GD'}) lacks native AVIF delegates. Bulk optimization in AVIF output format may fail or fall back to WebP.
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

        {/* COLUMN C: CHART SUMMARY & RECOMMENDATIONS (col-span-3) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* OPTIMIZATION SUMMARY DONUT CHART */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs p-4 space-y-5 relative">
            <h2 className="m-0! p-0! text-sm! leading-5! font-extrabold! text-slate-800 dark:text-white!">Optimization Summary</h2>
            
            {/* Donut graphic with details rendered in center to avoid clipping */}
            <div className="h-48 min-h-[192px] min-w-[200px] w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <RechartsPieChart>
                  <Pie
                    data={rechartsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {rechartsData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        onMouseEnter={() => setHoveredSliceIndex(index)}
                        onMouseLeave={() => setHoveredSliceIndex(null)}
                        style={{
                          opacity: hoveredSliceIndex === null || hoveredSliceIndex === index ? 1 : 0.5,
                          cursor: 'pointer',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                      />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>

              {/* Dynamic center content with zoom-in transition */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-4">
                {hoveredSliceIndex !== null && rechartsData[hoveredSliceIndex] ? (
                  <div className="flex flex-col items-center justify-center select-none animate-in fade-in zoom-in-95 duration-150">
                    <span 
                      className="text-2xl font-black leading-none" 
                      style={{ color: rechartsData[hoveredSliceIndex].color }}
                    >
                      {rechartsData[hoveredSliceIndex].value.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-[#8993a8] font-extrabold uppercase tracking-widest mt-1.5 whitespace-nowrap">
                      {rechartsData[hoveredSliceIndex].name}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1 bg-slate-50 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-700/50">
                      {chartData.total > 0 ? ((rechartsData[hoveredSliceIndex].value / chartData.total) * 100).toFixed(1) : '0'}%
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center select-none animate-in fade-in duration-150">
                    <span className="text-2xl font-black text-slate-800 dark:text-[#e7ecf3] leading-none">
                      {chartData.total.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-[#8993a8] font-extrabold uppercase tracking-widest mt-1.5">
                      Total Images
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Category legends row synchronized with chart hover */}
            <div className="space-y-1.5 text-xs">
              {chartData.items.map((item, index) => {
                const isHovered = hoveredSliceIndex === index;
                return (
                  <div 
                    key={item.key} 
                    onMouseEnter={() => setHoveredSliceIndex(index)}
                    onMouseLeave={() => setHoveredSliceIndex(null)}
                    className={`flex items-center justify-between p-2 rounded-xl transition-all duration-200 cursor-pointer ${
                      isHovered 
                        ? 'bg-slate-50 dark:bg-slate-800/60 scale-[1.01] shadow-2xs' 
                        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${item.bgClass} shrink-0 shadow-2xs`} />
                      <span className={`font-semibold transition-colors ${
                        isHovered ? 'text-slate-900 dark:text-[#e7ecf3] font-bold' : 'text-slate-700 dark:text-[#e7ecf3]'
                      }`}>
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-[#e7ecf3]">{item.count}</span>
                      <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-extrabold transition-all duration-200 ${
                        isHovered ? 'shadow-2xs scale-105' : ''
                      } ${
                        item.key === 'ready' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' :
                        item.key === 'large' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' :
                        item.key === 'total_webp' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' :
                        'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                      }`}>
                        {(item.pct * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-2 px-3 py-2 bg-slate-50/80 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-[#243044]/60">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight text-center">
                Attributes are overlapping. Percentages are relative to total images.
              </p>
            </div>

          </div>

          {/* ACTIONABLE RECOMMENDATIONS CARD */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-[#243044] shadow-2xs overflow-hidden p-4 space-y-4">
            <h2 className="m-0! p-0! text-sm! leading-5! font-extrabold! text-slate-800 dark:text-white!">Recommendations</h2>

            <div className="space-y-3">
              {recStats.pngCount === 0 && recStats.jpgCount === 0 && recStats.webpCount === 0 && recStats.exceedDimensionsCount === 0 ? (
                <div className="p-5 rounded-xl border border-emerald-100 dark:border-emerald-950 bg-emerald-50/10 dark:bg-emerald-950/5 text-center text-xs font-bold text-emerald-800 dark:text-emerald-400">
                  🎉 All images are fully optimized using next-gen formats!
                </div>
              ) : (
                <>
                  {recStats.pngCount > 0 && (
                    <button 
                      onClick={() => handleApplyRecommendation('png')}
                      className="w-full text-left p-3.5 rounded-xl border border-purple-100 dark:border-purple-950/40 bg-purple-50/10 dark:bg-purple-950/5 hover:bg-purple-50/40 dark:hover:bg-purple-950/10 flex items-center justify-between gap-2.5 transition-all cursor-pointer text-xs font-bold text-purple-900 dark:text-purple-300 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-purple-50 dark:bg-purple-950 rounded-lg text-purple-600 shrink-0">
                          <ImageDown className="w-4 h-4" />
                        </span>
                        <span>{recStats.pngCount} PNG image{recStats.pngCount > 1 ? 's' : ''} should be converted to WebP</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-purple-500 group-hover:translate-x-1 transition-transform shrink-0" />
                    </button>
                  )}

                  {recStats.jpgCount > 0 && (
                    <button 
                      onClick={() => handleApplyRecommendation('jpg')}
                      className="w-full text-left p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-950/40 bg-indigo-50/10 dark:bg-indigo-950/5 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10 flex items-center justify-between gap-2.5 transition-all cursor-pointer text-xs font-bold text-indigo-900 dark:text-indigo-300 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-indigo-50 dark:bg-indigo-950 rounded-lg text-indigo-600 shrink-0">
                          <ImageDown className="w-4 h-4" />
                        </span>
                        <span>{recStats.jpgCount} JPG image{recStats.jpgCount > 1 ? 's' : ''} should be converted to WebP</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-indigo-500 group-hover:translate-x-1 transition-transform shrink-0" />
                    </button>
                  )}

                  {recStats.webpCount > 0 && (
                    <button 
                      onClick={() => handleApplyRecommendation('webp')}
                      className="w-full text-left p-3.5 rounded-xl border border-blue-100 dark:border-blue-950/40 bg-blue-50/10 dark:bg-blue-950/5 hover:bg-blue-50/40 dark:hover:bg-blue-950/10 flex items-center justify-between gap-2.5 transition-all cursor-pointer text-xs font-bold text-blue-900 dark:text-blue-300 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-blue-50 dark:bg-blue-950 rounded-lg text-blue-600 shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </span>
                        <span>{recStats.webpCount} WebP image{recStats.webpCount > 1 ? 's' : ''} can be converted to AVIF</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition-transform shrink-0" />
                    </button>
                  )}

                  {recStats.exceedDimensionsCount > 0 && (
                    <button 
                      onClick={() => handleApplyRecommendation('dimensions')}
                      className="w-full text-left p-3.5 rounded-xl border border-amber-100 dark:border-amber-950/40 bg-amber-50/10 dark:bg-amber-950/5 hover:bg-amber-50/40 dark:hover:bg-amber-950/10 flex items-center justify-between gap-2.5 transition-all cursor-pointer text-xs font-bold text-amber-900 dark:text-amber-300 group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-amber-50 dark:bg-amber-950 rounded-lg text-amber-600 shrink-0">
                          <AlertTriangle className="w-4 h-4" />
                        </span>
                        <span>{recStats.exceedDimensionsCount} image{recStats.exceedDimensionsCount > 1 ? 's' : ''} exceed recommended dimensions</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-amber-500 group-hover:translate-x-1 transition-transform shrink-0" />
                    </button>
                  )}

                  {recStats.formattedSavings !== '0 KB' && (
                    <div className="p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-950/40 bg-emerald-50/10 dark:bg-emerald-950/5 flex items-center justify-between gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-emerald-50 dark:bg-emerald-950 rounded-lg text-emerald-600 shrink-0">
                          <ShieldCheck className="w-4 h-4" />
                        </span>
                        <span>Estimated additional saving: {recStats.formattedSavings}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* 5. LOADING SPINNER OVERLAY DURING BULK ACTION */}
      {isProcessing && !singleDialog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-100 dark:border-[#243044] max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              {/* Circular progress track */}
              <svg className="w-16 h-16 transform -rotate-90">
                <circle cx="32" cy="32" r="28" stroke="#f1f5f9" strokeWidth="4" fill="transparent" className="dark:stroke-slate-800" />
                <circle cx="32" cy="32" r="28" stroke={quotaStopMessage ? '#d97706' : '#A61E69'} strokeWidth="4" fill="transparent" 
                        strokeDasharray={2 * Math.PI * 28}
                        strokeDashoffset={2 * Math.PI * 28 * (1 - processingProgress / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-black text-xs text-slate-800 dark:text-white">
                {processingProgress}%
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">
                {quotaStopMessage ? 'Quota reached. Stopping...' : 'Optimizing Selected Images...'}
              </h3>
              <p className="text-xs text-slate-400">
                {quotaStopMessage
                  ? 'Finishing the images already in progress. The rest will not be optimized.'
                  : 'Re-compressing, stripping headers, and deploying next-gen container files.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Account not connected: shown instead of starting a run (no progress popup) */}
      {showConnectPopup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in" role="dialog" aria-modal="true" aria-label="Connect your account">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-100 dark:border-[#243044] max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Connect your account to optimize</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Connect your free ImgSentry account to start optimizing images. Nothing was changed.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConnectPopup(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
              {quota?.account_url && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = quota.account_url!;
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[#A61E69] hover:bg-[#8F1B5A] text-white cursor-pointer"
                >
                  Connect account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Result popup when the optimization quota stopped the run */}
      {quotaStopResult && !isProcessing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in" role="dialog" aria-modal="true" aria-label="Optimization stopped">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-100 dark:border-[#243044] max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Optimization stopped</h3>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {quotaStopResult.done} of {quotaStopResult.total} image{quotaStopResult.total === 1 ? '' : 's'} optimized
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{quotaStopResult.message}</p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setQuotaStopResult(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
              {quotaStopResult.code === 'account_required' && quota?.account_url && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = quota.account_url!;
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[#A61E69] hover:bg-[#8F1B5A] text-white cursor-pointer"
                >
                  Connect account
                </button>
              )}
              {quotaStopResult.code === 'quota_exceeded' && getProFeatures().upgradeUrl && (
                <button
                  type="button"
                  onClick={() => {
                    openUpgrade('quota_stop_popup');
                    setQuotaStopResult(null);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[#A61E69] hover:bg-[#8F1B5A] text-white cursor-pointer"
                >
                  Upgrade
                </button>
              )}
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

      {/* Restore Confirmation Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#243044] rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Restore Original Images?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Are you sure you want to restore <span className="font-bold text-amber-600 dark:text-amber-400">{restoreItemsToProcess.length} image(s)</span> back to their uncompressed original size and format?
                </p>
              </div>
            </div>

            {unrestorableCount > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Note:</span> {unrestorableCount} selected image(s) will be skipped because they are not currently optimized or do not have a recorded backup.
              </div>
            )}

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              This operation will undo optimization savings and revert file sizes back to their original states.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  executeRestoreOriginals(restoreItemsToProcess);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm Restore ({restoreItemsToProcess.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AVIF Capability Warning Pre-Flight Modal */}
      {showAvifWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-[#243044] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">AVIF Server Support Warning</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Environment capability check</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Your server ({serverCapabilities?.active_engine || 'PHP Image Engine'}) reports that native <strong className="text-slate-900 dark:text-white">AVIF</strong> conversion delegates (libavif / libheif) are not installed.
            </p>

            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <span className="font-bold block">Recommended Action:</span>
              <span>Convert to <strong>WebP</strong> format instead, which has 100% full native server support and provides ~75% file size savings across all browsers.</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAvifWarningModal(false);
                  setPendingBulkAction(null);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setOutputFormat('webp');
                  setShowAvifWarningModal(false);
                  if (pendingBulkAction) {
                    const action = pendingBulkAction;
                    setPendingBulkAction(null);
                    setTimeout(() => action(), 50);
                  }
                  if (onShowToast) onShowToast('Switched output format to WebP (Recommended).', 'success');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shadow-sm"
              >
                Switch to WebP & Proceed
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAvifWarningModal(false);
                  if (pendingBulkAction) {
                    const action = pendingBulkAction;
                    setPendingBulkAction(null);
                    setTimeout(() => action(), 50);
                  }
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                Proceed with AVIF anyway
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ImageOptimizationTab;
