import { csvCell, CSV_BOM } from '../utils/csv';
import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { MediaItem, AuditLogEntry, PluginSettings, ScanHistoryEntry, LogItem, SystemStorageBreakdown } from '../types';
import { INITIAL_MOCK_MEDIA } from '../data/mockMedia';
import { INITIAL_PLUGIN_SETTINGS, INITIAL_SCAN_HISTORY } from '../data/defaultSettings';
import { checkFileExclusion } from '../utils/exclusionEngine';
import { ScanSummaryData } from './ScanSummaryCard';
import { SmartCleanupEngine } from './SmartCleanupEngine';
import { DashboardOverview } from './DashboardOverview';
import { PluginSettingsTab, ServerWarning } from './PluginSettingsTab';
import { NotificationBell } from './NotificationBell';
import { getProFeatures, ProLockBadge } from './ProLock';
import { HelpSupportTab } from './HelpSupportTab';
import { MediaScannerTab } from './MediaScannerTab';
import { TrashTab } from './TrashTab';
import { UnusedFilesTab } from './UnusedFilesTab';
import { UsedFilesTab } from './UsedFilesTab';
import { DuplicateImageTab } from './DuplicateImageTab';
import { ErrorBoundary } from './ErrorBoundary';
import { getUsageLocations, resolveNextGenFormats, mapPhpItemToMediaItem } from '../utils/fileUtils';

import { ReportsTab } from './ReportsTab';
import { ImageOptimizationTab } from './ImageOptimizationTab';
// The File Manager screen is a Pro feature. It is loaded as its own file (assets/WpFileManagerTab.js), which the
// free zip does not contain; the free build never opens it because the File Manager is not active there.
const WpFileManagerTab = lazy(() => import('./WpFileManagerTab').then((m) => ({ default: m.WpFileManagerTab })));
import { FileManagerUpsell } from './FileManagerUpsell';
import { ScanStatusProvider, useScanStatus } from '../utils/scanStatus';
import { ScanProgressBar } from './ScanProgressBar';
import { UserMenuChip } from './UserMenuChip';
import { UnsavedChangesModal } from './UnsavedChangesModal';

// Reusable elegant loading spinner fallback for lazy tabs
const TabLoadingFallback: React.FC<{ title?: string }> = ({ title = 'Loading tab contents...' }) => (
  <div className="flex flex-col items-center justify-center p-16 min-h-[360px] w-full text-slate-500 dark:text-slate-400">
    <div className="w-9 h-9 border-3 border-[#A61E69]/30 border-t-[#A61E69] rounded-full animate-spin mb-3.5" />
    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 tracking-wide">{title}</p>
    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Fetching tab modules and dependencies on demand</p>
  </div>
);

import { 
  Trash2, 
  RefreshCw, 
  Filter, 
  Grid, 
  List, 
  AlertTriangle, 
  Settings, 
  CheckCircle, 
  FileText, 
  Type, 
  Music, 
  Video as VideoIcon, 
  Image as ImageIcon, 
  Clock, 
  FolderCheck,
  FolderOpen,
  ShieldAlert,
  Calendar,
  Search,
  RotateCcw,
  Zap,
  Scan,
  HardDrive,
  Puzzle,
  ShieldCheck,
  X,
  PieChart,
  BarChart3,
  Sparkles,
  ImageDown,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  CheckCircle2,
  Sun,
  Moon,
    Play,
  ArrowRight,
  User,
  ExternalLink,
  Crown,
  Cpu,
  AlertCircle,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';

const buildInitialScanHistory = (items: MediaItem[]): ScanHistoryEntry[] => {
  const activeItems = items.filter(i => !i.isTrashed);
  const totalCount = activeItems.length;
  const unusedItems = activeItems.filter(i => !i.inUse);
  const unusedCount = unusedItems.length;
  const unusedSizeBytes = unusedItems.reduce((acc, i) => acc + i.fileSize, 0);

  const localFormatSize = (bytes: number) => {
    if (!bytes || bytes <= 0 || !Number.isFinite(bytes) || bytes < 1) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
    return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(2)) + ' ' + sizes[safeIndex];
  };

  const formattedUnusedSize = localFormatSize(unusedSizeBytes);

  const now = new Date();
  const scan4Date = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const scan3Date = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const scan2Date = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago
  const scan1Date = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000); // 21 days ago

  const toTimestampStr = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const formatToFriendlyDate = (d: Date, label: string) => {
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${label} at ${timeStr}`;
  };

  return [
    {
      id: 'scan-104',
      timestamp: toTimestampStr(scan4Date),
      formattedDate: formatToFriendlyDate(scan4Date, 'Today'),
      scanType: 'Smart Scan',
      totalScanned: totalCount,
      unusedCount: unusedCount,
      deletedCount: Math.floor(unusedCount * 0.9),
      unusedSizeBytes: unusedSizeBytes,
      formattedUnusedSize: formattedUnusedSize,
      durationSeconds: 14.2,
      status: 'completed',
    },
    {
      id: 'scan-103',
      timestamp: toTimestampStr(scan3Date),
      formattedDate: '7 days ago',
      scanType: 'Deep Scan',
      totalScanned: Math.round(totalCount * 0.98),
      unusedCount: Math.round(unusedCount * 1.1),
      deletedCount: Math.floor(Math.round(unusedCount * 1.1) * 0.9),
      unusedSizeBytes: Math.round(unusedSizeBytes * 1.1),
      formattedUnusedSize: localFormatSize(Math.round(unusedSizeBytes * 1.1)),
      durationSeconds: 28.6,
      status: 'completed',
    },
    {
      id: 'scan-102',
      timestamp: toTimestampStr(scan2Date),
      formattedDate: '14 days ago',
      scanType: 'Quick Scan',
      totalScanned: Math.round(totalCount * 0.95),
      unusedCount: Math.round(unusedCount * 0.95),
      deletedCount: Math.floor(Math.round(unusedCount * 0.95) * 0.9),
      unusedSizeBytes: Math.round(unusedSizeBytes * 0.9),
      formattedUnusedSize: localFormatSize(Math.round(unusedSizeBytes * 0.9)),
      durationSeconds: 8.4,
      status: 'completed',
    },
    {
      id: 'scan-101',
      timestamp: toTimestampStr(scan1Date),
      formattedDate: '21 days ago',
      scanType: 'Smart Scan',
      totalScanned: Math.round(totalCount * 0.92),
      unusedCount: Math.round(unusedCount * 0.85),
      deletedCount: Math.floor(Math.round(unusedCount * 0.85) * 0.9),
      unusedSizeBytes: Math.round(unusedSizeBytes * 0.8),
      formattedUnusedSize: localFormatSize(Math.round(unusedSizeBytes * 0.8)),
      durationSeconds: 12.1,
      status: 'completed',
    },
  ];
};

const WpAdminSimulatorContent: React.FC = () => {
  const scanStatus = useScanStatus();
  const scanStartTimeRef = useRef<number>(0);
  const mediaListRef = useRef<MediaItem[]>([]);
  // Master State with WordPress / Fallback initialization
  const [dataRevision, setDataRevision] = useState(0);
  const [trashRefreshSignal, setTrashRefreshSignal] = useState<number>(0);
  const [mediaList, setMediaList] = useState<MediaItem[]>(() => {
    const isWp = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData);
    if (!isWp && (import.meta as any).env?.DEV) {
      return INITIAL_MOCK_MEDIA;
    }
    return [];
  });

  const [isLoadingMedia, setIsLoadingMedia] = useState<boolean>(false);
  const [mediaFetchError, setMediaFetchError] = useState<string | null>(null);

  const [serverWarnings, setServerWarnings] = useState<ServerWarning[]>([]);
  const [pluginSettings, setPluginSettings] = useState<PluginSettings>(() => {
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const bootstrap = typeof window !== 'undefined' ? ((window as any).imgsentrySettingsBootstrap) : null;
    if (bootstrap && bootstrap.settings) {
      const merged = { ...bootstrap.settings };
      if (bootstrap.actual_memory_limit) {
        merged.actual_memory_limit = bootstrap.actual_memory_limit;
      }
      return merged;
    }
    if (imgsentryData && imgsentryData.settings) {
      const merged = { ...imgsentryData.settings };
      if (imgsentryData.actual_memory_limit) {
        merged.actual_memory_limit = imgsentryData.actual_memory_limit;
      }
      return merged;
    }
    if (imgsentryData && imgsentryData.actual_memory_limit) {
      return { ...INITIAL_PLUGIN_SETTINGS, actual_memory_limit: imgsentryData.actual_memory_limit };
    }
    try {
      const saved = localStorage.getItem('wp_media_cleaner_settings_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse settings from localStorage', e);
    }
    return { ...INITIAL_PLUGIN_SETTINGS };
  });

  // Applied scan settings
  const [appliedPluginSettings, setAppliedPluginSettings] = useState<PluginSettings>(pluginSettings);
  const [isMemoryNoticeDismissed, setIsMemoryNoticeDismissed] = useState<boolean>(false);

  useEffect(() => {
    mediaListRef.current = mediaList;
  }, [mediaList]);

  useEffect(() => {
    setAppliedPluginSettings(pluginSettings);
    // Reset notice dismissal when settings change so live status updates immediately
    setIsMemoryNoticeDismissed(false);
  }, [pluginSettings]);

  // Duplicate Statistics State lifted to WpAdminSimulator as single source of truth
  const [duplicateFilesCount, setDuplicateFilesCount] = useState<number>(0);
  const [duplicateTotalSizeBytes, setDuplicateTotalSizeBytes] = useState<number>(0);

  const fetchDuplicateCounts = async () => {
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_get_duplicate_groups');
        fd.append('nonce', imgsentryData.nonce || '');
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success && json.data?.groups) {
          let count = 0;
          let sizeBytes = 0;
          json.data.groups.forEach((g: any) => {
            if (Array.isArray(g.copies)) {
              count += g.copies.length;
              g.copies.forEach((c: any) => {
                sizeBytes += (c.size || (c.fileSize ? c.fileSize * 1024 : 0));
              });
            }
          });
          setDuplicateFilesCount(count);
          setDuplicateTotalSizeBytes(sizeBytes);
        }
      } catch (e) {
        console.error('Failed to fetch duplicate counts from WP backend:', e);
      }
    } else {
      // Standalone simulator fallback
      setDuplicateFilesCount(2);
      setDuplicateTotalSizeBytes(1074000);
    }
  };

  // Helper function to fetch media from WordPress backend
  const fetchMediaList = async (): Promise<MediaItem[] | undefined> => {
    const imgsentryData = (window as any).imgsentry_data || (window as any).imgsentryData;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      setIsLoadingMedia(true);
      setMediaFetchError(null);
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_fetch_media');
        fd.append('per_page', '-1');
        fd.append('status', 'all');
        fd.append('nonce', imgsentryData.nonce);

        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();

        if (json.success && json.data) {
          const phpItems = json.data.items || [];
          const realList: MediaItem[] = phpItems.map((item: any) => mapPhpItemToMediaItem(item));
          setMediaList(realList);
          return realList;
        } else {
          throw new Error(json.data?.message || json.message || 'Server returned invalid response');
        }
      } catch (e: any) {
        console.error('Initial WordPress media fetch error:', e);
        setMediaFetchError(e.message || 'Failed to load media library from server.');
      } finally {
        setIsLoadingMedia(false);
      }
    }
  };

  // Helper function to fetch plugin settings from WordPress database
  const fetchPluginSettings = async () => {
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_get_settings');
        fd.append('nonce', imgsentryData.nonce);

        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success && json.data && json.data.settings) {
          const merged = { ...json.data.settings };
          if (json.data.actual_memory_limit) {
            merged.actual_memory_limit = json.data.actual_memory_limit;
          }
          setPluginSettings(merged);
        }
      } catch (e) {
        console.error('Failed to fetch real settings from WordPress backend:', e);
      }
    }
  };

  // Mount-time useEffect: fetch real settings and duplicate counts without full media library fetch
  useEffect(() => {
    fetchPluginSettings();
    fetchDuplicateCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Parse server memory limit string (e.g., '256M', '1G', '512MB', '-1', 'unlimited') into numeric megabytes.
  // Returns null if the value is missing/unloaded or invalid, and Infinity if unlimited.
  const parseServerMemoryMb = (limitStr?: string): number | null => {
    if (!limitStr) return null;
    const clean = limitStr.toUpperCase().trim();
    if (clean === '-1' || clean === 'UNLIMITED') {
      return Infinity;
    }
    if (clean.endsWith('G') || clean.endsWith('GB')) {
      const numGb = parseInt(clean, 10);
      return isNaN(numGb) ? null : numGb * 1024;
    }
    if (clean.endsWith('M') || clean.endsWith('MB')) {
      const numMb = parseInt(clean, 10);
      return isNaN(numMb) ? null : numMb;
    }
    if (clean.endsWith('K') || clean.endsWith('KB')) {
      const numKb = parseInt(clean, 10);
      return isNaN(numKb) ? null : Math.round(numKb / 1024);
    }
    const num = parseInt(clean, 10);
    return isNaN(num) ? null : num;
  };

  const selectedMemoryMb = parseInt(pluginSettings.memoryLimit?.replace(/[^0-9]/g, '') || '512', 10);
  const rawActualMemory = pluginSettings.actual_memory_limit || (typeof window !== 'undefined' ? ((window as any).imgsentry_data?.actual_memory_limit || (window as any).imgsentryData?.actual_memory_limit) : undefined);
  const serverCapMb = parseServerMemoryMb(rawActualMemory);
  const effectiveMemoryMb = serverCapMb !== null ? Math.min(selectedMemoryMb, serverCapMb) : selectedMemoryMb;

  const mapLegacySubTab = (subTab?: string): any => {
    if (!subTab) return 'general';
    switch (subTab) {
      case 'security':
        return 'permissions';
      case 'notification':
        return 'notifications';
      case 'schedule':
        return 'schedule';
      case 'delete':
        return 'auto';
      case 'backup':
      case 'performance':
        return 'advanced';
      case 'types':
        return 'scan';
      default:
        return subTab;
    }
  };

  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>(() => {
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const isWp = Boolean(imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl));

    if (isWp) {
      if (imgsentryData && Array.isArray(imgsentryData.scan_history) && imgsentryData.scan_history.length > 0) {
        return imgsentryData.scan_history;
      }
      return [];
    }

    try {
      const saved = localStorage.getItem('wp_media_cleaner_history_v3');
      if (saved) {
        const parsed: ScanHistoryEntry[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          return parsed.filter((scan) => {
             if (!scan.timestamp || typeof scan.timestamp !== 'string') return false;
             const scanDate = new Date(scan.timestamp.replace(' ', 'T'));
             return scanDate >= thirtyDaysAgo;
          });
        }
      }
    } catch (e) {
      console.error('Failed to parse scanHistory from localStorage', e);
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return buildInitialScanHistory(INITIAL_MOCK_MEDIA).filter((scan) => {
           if (!scan.timestamp || typeof scan.timestamp !== 'string') return false;
           const scanDate = new Date(scan.timestamp.replace(' ', 'T'));
           return scanDate >= thirtyDaysAgo;
    });
  });

  // Audit Log State
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem('wp_media_cleaner_audit_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse auditLog from localStorage', e);
    }
    return [
      {
        id: '1',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        user: 'admin',
        action: 'Plugin Initialized',
        details: 'ImgSentry active.'
      }
    ];
  });

  // Detailed Logs State for LogsTab
  const [detailedLogs, setDetailedLogs] = useState<LogItem[]>([]);

  // Sync to WordPress Backend / LocalStorage on state changes
  useEffect(() => {
    const isWp = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData);
    if (!isWp && (import.meta as any).env?.DEV) {
      try {
        localStorage.setItem('wp_media_cleaner_list_v3', JSON.stringify(mediaList));
      } catch (e) {
        console.error('Failed to save mediaList to localStorage', e);
      }
    }
  }, [mediaList]);

  // Saves ONLY the three settings shared between the Image Optimization page and Settings > Advanced:
  // compression level, custom quality and output format. Uses the small whitelisted endpoint (not the full settings save).
  const saveOptimizationSettings = async (
    level: 'lossless' | 'balanced' | 'aggressive' | 'custom',
    quality: number,
    format: 'off' | 'webp' | 'avif'
  ): Promise<boolean> => {
    const changes = { nextGenFormat: format, defaultCompressionLevel: level, defaultCompressionQuality: quality };
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_save_optimization_settings');
        fd.append('nonce', imgsentryData.nonce);
        fd.append('settings', JSON.stringify(changes));
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (json && json.success) {
          const saved = json.data && json.data.settings ? json.data.settings : changes;
          setPluginSettings(prev => ({ ...prev, ...saved }));
          // Keep the page's bootstrap data in step so nothing reads the old value later.
          try {
            const win = window as any;
            ['imgsentry_data', 'imgsentryData'].forEach(k => {
              if (win[k] && win[k].settings && typeof win[k].settings === 'object') {
                Object.assign(win[k].settings, saved);
              }
            });
          } catch (e) {}
          showToastMsg('Optimization settings saved.');
          return true;
        }
        const serverMessage = json && json.data && typeof json.data.message === 'string' ? json.data.message : 'Settings could not be saved.';
        showToastMsg(serverMessage, 'error');
        return false;
      } catch (e) {
        console.error('Failed to save optimization settings:', e);
        showToastMsg('Settings could not be saved. Please try again.', 'error');
        return false;
      }
    }
    // Standalone preview (no WordPress): keep it in the same local copy the simulator already uses.
    try {
      const next = { ...pluginSettings, ...changes };
      setPluginSettings(next);
      localStorage.setItem('wp_media_cleaner_settings_v1', JSON.stringify(next));
      showToastMsg('Optimization settings saved.');
      return true;
    } catch (e) {
      showToastMsg('Settings could not be saved. Please try again.', 'error');
      return false;
    }
  };

  // Explicit function to save settings directly to WordPress backend and local state
  const saveSettingsToServer = async (newSettings: PluginSettings): Promise<boolean> => {
    const previousSettings = pluginSettings;
    setPluginSettings(newSettings);
    
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_save_settings');
        fd.append('nonce', imgsentryData.nonce);
        // Read-only fields that only travel from the server to the browser are not posted back.
        const { integrations: _roIntegrations, webhookSecretSet: _roSecretSet, ...settingsToPost } = newSettings as any;
        fd.append('settings', JSON.stringify(settingsToPost));
        
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success) {
          const serverSettings = json.data && json.data.settings ? json.data.settings : null;
          if (serverSettings) {
            setPluginSettings(serverSettings);
          }
          const warnings: ServerWarning[] = (json.data && Array.isArray(json.data.warnings)) ? json.data.warnings : [];
          setServerWarnings(warnings);
          warnings.forEach(w => {
            if (w.message) {
              showToastMsg(w.message, 'warning');
            }
          });

          // Update global window data after successful save
          try {
            const rawTheme = serverSettings ? serverSettings.fileManagerTheme : newSettings.fileManagerTheme;
            const validTheme = rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'auto' ? rawTheme : 'light';
            if (typeof window !== 'undefined') {
              const win = window as any;
              if (win.imgsentry_data) {
                if (!win.imgsentry_data.settings || typeof win.imgsentry_data.settings !== 'object') {
                  win.imgsentry_data.settings = {};
                }
                win.imgsentry_data.settings.fileManagerTheme = validTheme;
              }
              if (win.imgSentryFmData) {
                if (!win.imgSentryFmData.settings || typeof win.imgSentryFmData.settings !== 'object') {
                  win.imgSentryFmData.settings = {};
                }
                win.imgSentryFmData.settings.fileManagerTheme = validTheme;
              }
            }
          } catch (e) {
            console.error('Failed to update window theme settings:', e);
          }
          return true;
        }
        // The server refused the save (for example an invalid value): tell the user and undo the early update.
        const serverMessage = json && json.data && typeof json.data.message === 'string' ? json.data.message : 'Settings could not be saved.';
        showToastMsg(serverMessage, 'error');
        setPluginSettings(previousSettings);
        return false;
      } catch (e) {
        console.error('Failed to sync settings to WP backend:', e);
        showToastMsg('Settings could not be saved. Please try again.', 'error');
        setPluginSettings(previousSettings);
        return false;
      }
    } else {
      try {
        const submittedBackup = newSettings.backupDirectory || '';
        let simWarnings: ServerWarning[] = [];
        let effectiveSettings = { ...newSettings };
        const trimmedBackup = submittedBackup.trim();
        if (trimmedBackup !== '') {
          const normalized = trimmedBackup.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/?$/, '/');
          const isBad = normalized.includes('/../') || normalized.startsWith('../') || !normalized.startsWith('wp-content/uploads/') || normalized === 'wp-content/uploads/';
          if (isBad) {
            const applied = 'wp-content/uploads/imgsentry/backups/';
            effectiveSettings.backupDirectory = applied;
            simWarnings.push({
              code: 'backup_directory_rejected',
              message: `The backup folder was rejected and reset to "${applied}". Backups must be inside the uploads directory.`,
              applied: applied,
            });
          }
        }
        setServerWarnings(simWarnings);
        simWarnings.forEach(w => showToastMsg(w.message, 'warning'));
        setPluginSettings(effectiveSettings);
        localStorage.setItem('wp_media_cleaner_settings_v1', JSON.stringify(effectiveSettings));

        // Update global window data after successful save in dev mode / simulator
        try {
          const rawTheme = newSettings.fileManagerTheme;
          const validTheme = rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'auto' ? rawTheme : 'light';
          if (typeof window !== 'undefined') {
            const win = window as any;
            if (win.imgsentry_data) {
              if (!win.imgsentry_data.settings || typeof win.imgsentry_data.settings !== 'object') {
                win.imgsentry_data.settings = {};
              }
              win.imgsentry_data.settings.fileManagerTheme = validTheme;
            }
            if (win.imgSentryFmData) {
              if (!win.imgSentryFmData.settings || typeof win.imgSentryFmData.settings !== 'object') {
                win.imgSentryFmData.settings = {};
              }
              win.imgSentryFmData.settings.fileManagerTheme = validTheme;
            }
          }
        } catch (e) {
          console.error('Failed to update window theme settings in dev mode:', e);
        }
      } catch (e) {
        console.error('Failed to save settings to localStorage in dev mode', e);
      }
    }
    return true;
  };

  const isInitialScanHistoryMount = useRef(true);

  useEffect(() => {
    if (isInitialScanHistoryMount.current) {
      isInitialScanHistoryMount.current = false;
      return;
    }

    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const isWp = Boolean(imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl));
    if (isWp && imgsentryData) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const fd = new FormData();
      fd.append('action', 'imgsentry_save_scan_history');
      fd.append('nonce', imgsentryData.nonce);
      fd.append('scan_history', JSON.stringify(scanHistory));
      fetch(ajaxUrl, { method: 'POST', body: fd }).catch(e => console.error('Failed to sync scan history to WP backend:', e));
    } else if ((import.meta as any).env?.DEV) {
      try {
        localStorage.setItem('wp_media_cleaner_history_v3', JSON.stringify(scanHistory));
      } catch (e) {
        console.error('Failed to save scanHistory to localStorage in dev mode', e);
      }
    }
  }, [scanHistory]);

  useEffect(() => {
    const isWp = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData);
    if (!isWp && (import.meta as any).env?.DEV) {
      try {
        localStorage.setItem('wp_media_cleaner_audit_v1', JSON.stringify(auditLog));
      } catch (e) {
        console.error('Failed to save auditLog to localStorage in dev mode', e);
      }
    }
  }, [auditLog]);

  // Database Stats State
  const [dbStats, setDbStats] = useState<{
    mediaCleanerDataMb: number;
    logDataMb: number;
    totalCleanableGb: number;
    dbOrphmetaMb: number;
    dbOrphanedScansMb: number;
    thumbsCacheMb: number;
    lastCleanedDate?: string | null;
  }>(() => {
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && imgsentryData.stats) {
      const stats = imgsentryData.stats;
      const dbUsageBytes = Number(stats.db_usage_bytes ?? 0);
      const dbLogsBytes = Number(stats.db_logs_bytes ?? 0);
      const dbTransientsBytes = Number(stats.db_transients_bytes ?? 0);
      const dbOrphmetaBytes = Number(stats.db_orphmeta_bytes ?? 0);
      const dbOrphanedScansBytes = Number(stats.db_orphaned_scans_bytes ?? 0);
      const thumbsCacheBytes = Number(stats.thumbs_cache_bytes ?? 0);

      return {
        mediaCleanerDataMb: dbUsageBytes / (1024 * 1024),
        logDataMb: dbLogsBytes / (1024 * 1024),
        totalCleanableGb: dbTransientsBytes / (1024 * 1024 * 1024),
        dbOrphmetaMb: dbOrphmetaBytes / (1024 * 1024),
        dbOrphanedScansMb: dbOrphanedScansBytes / (1024 * 1024),
        thumbsCacheMb: thumbsCacheBytes / (1024 * 1024),
        lastCleanedDate: stats.last_cleaned_date || null
      };
    }

    try {
      const saved = localStorage.getItem('wp_media_cleaner_db_stats_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.dbOrphanedScansMb === 'undefined') {
          parsed.dbOrphanedScansMb = 1.4;
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse dbStats from localStorage', e);
    }
    return {
      mediaCleanerDataMb: 12.8,
      logDataMb: 8.4,
      totalCleanableGb: 2.1,
      dbOrphmetaMb: 0.8,
      dbOrphanedScansMb: 1.4,
      thumbsCacheMb: 12.5,
      lastCleanedDate: null
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('wp_media_cleaner_db_stats_v1', JSON.stringify(dbStats));
    } catch (e) {
      console.error('Failed to save dbStats to localStorage', e);
    }
  }, [dbStats]);

  const isWordPress = typeof window !== 'undefined' && (window as any).imgsentry_data;

  const fetchedStorageRef = useRef<boolean>(false);

  // Real System Storage Breakdown from WordPress backend (Single Source of Truth)
  const [systemStorage, setSystemStorage] = useState<SystemStorageBreakdown | null>(() => {
    if (typeof window !== 'undefined' && (window as any).imgsentry_data?.system_storage) {
      return (window as any).imgsentry_data.system_storage;
    }
    return null;
  });
  const [isSystemStorageLoading, setIsSystemStorageLoading] = useState<boolean>(false);

  const fetchSystemStorage = () => {
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const nonce = imgsentryData.nonce || imgsentryData.imgsentry_admin_nonce;
      setIsSystemStorageLoading(true);
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_system_storage');
      fd.append('nonce', nonce || '');

      fetch(ajaxUrl, {
        method: 'POST',
        body: fd
      })
        .then(res => res.json())
        .then(resData => {
          if (resData.success && resData.data?.system_storage) {
            setSystemStorage(resData.data.system_storage);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch system storage breakdown in WpAdminSimulator:', err);
        })
        .finally(() => {
          setIsSystemStorageLoading(false);
        });
    }
  };

  useEffect(() => {
    let intervalId: any = null;
    let timeoutId: any = null;

    const tryFetch = () => {
      const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
      if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
        if (!fetchedStorageRef.current) {
          fetchedStorageRef.current = true;
          fetchSystemStorage();
        }
        return true;
      }
      return false;
    };

    const success = tryFetch();
    if (!success) {
      intervalId = setInterval(() => {
        if (tryFetch()) {
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
  }, []);

  // Page permissions: PHP sends `allowed_pages` for non-administrators (missing/null = everything allowed).
  // File Manager: Professional plan AND switched ON by the Administrator (saved setting).
  const fileManagerActive = getProFeatures().features.file_manager && Boolean(pluginSettings.enableFileManager);
  // Locked "Advance File Manager" entry: PHP sends `file_manager_promo` only to Administrators on a plan without the File Manager.
  const fileManagerPromo = (() => {
    const d = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : undefined;
    return Boolean(d && d.file_manager_promo);
  })();
  const getAllowedPages = (): string[] | null => {
    const d = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : undefined;
    return d && Array.isArray(d.allowed_pages) ? d.allowed_pages : null;
  };
  const isPageAllowed = (id: string): boolean => {
    if (id === 'wp_file_manager' && !fileManagerActive && !fileManagerPromo) return false;
    const allowed = getAllowedPages();
    return allowed === null ? true : allowed.includes(id);
  };

  // Active Navigation Tab
  const [mainNav, setMainNavState] = useState<
    'dashboard' | 'scanner' | 'unused' | 'used' | 'duplicate' | 'image_optimization' | 'wp_file_manager' | 'scheduled_actions' | 'trash' | 'reports' | 'settings' | 'help' | 'about'
  >(() => {
    if (typeof window !== 'undefined' && (window as any).imgsentry_data && (window as any).imgsentry_data.active_tab) {
      const activeTab = (window as any).imgsentry_data.active_tab;
      let initialTab: any = activeTab;
      if (activeTab === 'logs') initialTab = 'settings';
      else if (activeTab === 'file-manager' || activeTab === 'file_manager') initialTab = 'dashboard';
      if (!isPageAllowed(initialTab)) {
        const allowedList = getAllowedPages();
        return (allowedList && allowedList.length > 0 ? allowedList[0] : 'no_access') as any;
      }
      return initialTab;
    }
    return 'settings';
  });

  // Image Optimization page: unsaved shared settings (compression level / output format) must not be lost silently.
  const optUnsavedGuardRef = useRef<{ isDirty: () => boolean; save: () => Promise<boolean>; discard: () => void } | null>(null);
  const [pendingNav, setPendingNav] = useState<any>(null);
  const [isSavingBeforeLeave, setIsSavingBeforeLeave] = useState(false);

  const setMainNav = (value: any) => {
    // Pages the user has no permission for cannot be opened (this also disables Settings links for non-admins).
    if (!isPageAllowed(String(value))) {
      return;
    }
    if (mainNav === 'image_optimization' && value !== 'image_optimization' && optUnsavedGuardRef.current?.isDirty()) {
      setPendingNav(value);
      return;
    }
    setMainNavState(value);
  };

  const leaveImageOptimization = async (mode: 'save' | 'discard') => {
    const target = pendingNav;
    const guard = optUnsavedGuardRef.current;
    if (target === null || !guard) {
      setPendingNav(null);
      return;
    }
    if (mode === 'save') {
      setIsSavingBeforeLeave(true);
      const ok = await guard.save();
      setIsSavingBeforeLeave(false);
      if (!ok) {
        // Not saved (the error toast is already shown): stay on the page so nothing is lost.
        setPendingNav(null);
        return;
      }
    } else {
      guard.discard();
    }
    setPendingNav(null);
    setMainNavState(target);
  };

  // Closing or reloading the browser tab with unsaved Image Optimization changes.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (optUnsavedGuardRef.current?.isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // If the File Manager gets switched off (or the plan no longer allows it) while its page is open, leave the page.
  useEffect(() => {
    if (!fileManagerActive && !fileManagerPromo && mainNav === 'wp_file_manager') {
      setMainNavState('dashboard');
    }
  }, [fileManagerActive, fileManagerPromo, mainNav]);

  // Visited state for keep-alive tabs (mount once, toggle visibility)
  const [hasVisitedTrash, setHasVisitedTrash] = useState(mainNav === 'trash');
  const [hasVisitedUnused, setHasVisitedUnused] = useState(mainNav === 'unused');
  const [hasVisitedUsed, setHasVisitedUsed] = useState(mainNav === 'used');
  const [hasVisitedDuplicate, setHasVisitedDuplicate] = useState(mainNav === 'duplicate');
  const [hasVisitedImageOptimization, setHasVisitedImageOptimization] = useState(mainNav === 'image_optimization');

  useEffect(() => {
    if (mainNav === 'trash') setHasVisitedTrash(true);
    else if (mainNav === 'unused') setHasVisitedUnused(true);
    else if (mainNav === 'used') setHasVisitedUsed(true);
    else if (mainNav === 'duplicate') setHasVisitedDuplicate(true);
    else if (mainNav === 'image_optimization') setHasVisitedImageOptimization(true);
  }, [mainNav]);
  const [settingsSubTab, setSettingsSubTab] = useState<
    'general' | 'scan' | 'types' | 'delete' | 'backup' | 'schedule' | 'performance' | 'notification' | 'security' | 'advanced' | 'auto' | 'exclusions' | 'permissions' | 'file_manager' | 'notifications' | 'integrations' | 'logs' | 'scheduled_actions' | 'help'
  >(() => {
    if (typeof window !== 'undefined' && (window as any).imgsentry_data && (window as any).imgsentry_data.active_tab === 'logs') {
      return 'logs';
    }
    return 'general';
  });
  const [navLocationFilter, setNavLocationFilter] = useState<string>('all');

  // Lazy fetch mediaList only when navigating to tabs that consume it
  useEffect(() => {
    const tabsRequiringMedia = ['scanner', 'image_optimization'];
    if (tabsRequiringMedia.includes(mainNav)) {
      if (mediaList.length === 0 && !isLoadingMedia) {
        fetchMediaList();
      }
    }
  }, [mainNav]);

  const handleNavigateToSettings = (subTab?: string) => {
    setMainNav('settings');
    if (subTab) {
      const mapped = mapLegacySubTab(subTab);
      setSettingsSubTab(mapped);
      try {
        window.history.replaceState(null, '', '#subtab-' + mapped);
      } catch (e) {}
    }
  };

  // UI Theme & Top Bar State
  // Remembered in this browser, so a reload or coming back from another WP page keeps the choice.
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('imgsentry_dark_mode') === '1';
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('imgsentry_dark_mode', isDarkMode ? '1' : '0');
    } catch (e) {}
  }, [isDarkMode]);

  // Tailwind's dark: variant is class-based (see index.css). Keep body.dark in sync with the toggle.
  useEffect(() => {
    document.body.classList.toggle('dark', isDarkMode);
    return () => { document.body.classList.remove('dark'); };
  }, [isDarkMode]);
  const [usedSearchQuery, setUsedSearchQuery] = useState('');
  const [unusedSearchQuery, setUnusedSearchQuery] = useState('');
  const handleNotificationNavigate = (page: string) => {
    setMainNav(page);
  };
  const [isWelcomeNoticeDismissed, setIsWelcomeNoticeDismissed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('imgsentry_welcome_notice_dismissed');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });

  // Filters & Search
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<string>('');

  // Modals & Notifications
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);
  const [deleteAllConfirmInput, setDeleteAllConfirmInput] = useState<string>('');
  const [deleteAllTarget, setDeleteAllTarget] = useState<'trash' | 'permanent'>('trash');
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState<boolean>(false);

  // Scan & Safety Checklist Modal State
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStatusText, setScanStatusText] = useState<string>('');
  const [scanSummary, setScanSummary] = useState<ScanSummaryData | null>(null);
  const [showScanSummary, setShowScanSummary] = useState<boolean>(false);
  const [showSmartCleanup, setShowSmartCleanup] = useState<boolean>(false);
  const [showDuplicateExport, setShowDuplicateExport] = useState<boolean>(false);
  const [showLogsExport, setShowLogsExport] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  const [optActions, setOptActions] = useState<{
    optimizeSelected: () => void;
    bulkOptimizeAll: () => void;
    resetSettings: () => void;
    exportReport: () => void;
    restoreOriginals: () => void;
    removeFromQueue: () => void;
    cancelProcessing?: () => void;
    selectedCount: number;
    pendingCount?: number;
    restorableCount?: number;
    hasSettingsError?: boolean;
    isProcessing: boolean;
  } | null>(null);

  const addLog = (action: string, details: string) => {
    const newEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      user: 'admin',
      action,
      details
    };
    setAuditLog(prev => [newEntry, ...prev]);
  };

  const addDetailedLog = (
    level: 'Success' | 'Info' | 'Warning' | 'Error' | 'Critical',
    type: string,
    source: string,
    boldText: string,
    subText: string
  ) => {
    const levelBgs = {
      Success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      Info: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      Warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      Error: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
      Critical: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    };
    
    const newLog: LogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      time: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) + ' ' + new Date().toLocaleTimeString('en-US'),
      level,
      levelBg: levelBgs[level],
      type,
      source,
      boldText,
      subText,
      user: 'admin',
      ip: '192.168.1.1'
    };
    setDetailedLogs(prev => [newLog, ...prev]);
  };

  const showToastMsg = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Derived Media Calculations
  const activeItems = mediaList.filter(i => !i.isTrashed);
  const trashedItems = mediaList.filter(i => i.isTrashed);
  const unusedItems = activeItems.filter(i => !i.inUse);
  const usedItems = activeItems.filter(i => i.inUse);

  const unoptimizedImageCount = useMemo(() => {
    const images = mediaList.filter(item => item.category === 'images' && !item.isTrashed);
    let savedQueue: any[] = [];
    try {
      const saved = localStorage.getItem('wp_media_cleaner_optimize_queue_v1');
      if (saved) savedQueue = JSON.parse(saved);
    } catch (e) {}

    const preOptimizedCount = images.filter(item => item.extension === 'webp' || item.extension === 'avif').length;
    const queueOptimizedCount = savedQueue.filter(item => item.status === 'optimized' && item.mimeType !== 'image/webp' && item.mimeType !== 'image/avif').length;
    const totalOptimized = preOptimizedCount + queueOptimizedCount;
    return Math.max(0, images.length - totalOptimized);
  }, [mediaList]);

  const totalSizeBytes = activeItems.reduce((acc, i) => acc + i.fileSize, 0);
  const usedSizeBytes = usedItems.reduce((acc, i) => acc + i.fileSize, 0);
  const unusedSizeBytes = unusedItems.reduce((acc, i) => acc + i.fileSize, 0);

  // Let's add a simulated server free space of 15% of total, so the disk capacity is (totalSizeBytes / 0.85)
  const simulatedTotalDisk = totalSizeBytes > 0 ? (totalSizeBytes / 0.85) : (10 * 1024 * 1024);
  const freeSizeBytes = simulatedTotalDisk - totalSizeBytes;

  const usedPercent = simulatedTotalDisk > 0 ? Math.round((usedSizeBytes / simulatedTotalDisk) * 100) : 0;
  const unusedPercent = simulatedTotalDisk > 0 ? Math.round((unusedSizeBytes / simulatedTotalDisk) * 100) : 0;
  const freePercent = 100 - usedPercent - unusedPercent;
  const occupiedPercent = usedPercent + unusedPercent;

  // Display Items depending on mainNav context
  const displayedItems = mediaList.filter(item => {
    // Nav Context filter
    if (mainNav === 'unused' && (item.isTrashed || item.inUse)) return false;
    if (mainNav === 'used' && (item.isTrashed || !item.inUse)) return false;
    if (mainNav === 'trash' && !item.isTrashed) return false;
    if ((mainNav === 'dashboard' || mainNav === 'scanner') && item.isTrashed) return false;

    // Applied scan settings scope filter
    if (!item.isTrashed) {
      const isSvg = item.extension === 'svg' || item.mimeType === 'image/svg+xml';
      if (isSvg && appliedPluginSettings.includeSvg === false) return false;
      if (!isSvg && item.category === 'images' && appliedPluginSettings.includeImages === false) return false;
      if (item.category === 'video' && appliedPluginSettings.includeVideos === false) return false;
      if (item.category === 'documents' && appliedPluginSettings.includeDocuments === false) return false;
      if (item.category === 'audio' && appliedPluginSettings.includeAudio === false) return false;
      if ((item.category === 'fonts' || item.category === 'other') && appliedPluginSettings.includeOthers === false) return false;
    }

    // Category filter
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;

    // Search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchFile = item.filename.toLowerCase().includes(q);
      if (!matchTitle && !matchFile) return false;
    }

    // Date range filter
    if (dateFrom && item.uploadDate < dateFrom) return false;
    if (dateTo && item.uploadDate > dateTo + ' 23:59:59') return false;

    return true;
  });

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0 || !Number.isFinite(bytes) || bytes < 1) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
    return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(2)) + ' ' + sizes[safeIndex];
  };

  // Selection Handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(displayedItems.map(i => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Helper to increment deleted count on latest scan entry
  const incrementScanDeletedCount = (count: number) => {
    if (count <= 0) return;
    setScanHistory(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[0] = {
        ...updated[0],
        deletedCount: (updated[0].deletedCount || 0) + count
      };
      return updated;
    });
  };

  // Single Actions
  const handleMoveToTrash = async (idOrIds: number | number[], force = false, forceProtected = false, source?: 'duplicates'): Promise<boolean> => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (ids.length === 0) return false;

    let processedIds: number[] = ids;
    let failedIds: number[] = [];
    let skippedNowUsedIds: number[] = [];
    let skippedUsedIds: number[] = [];
    let skippedProtectedIds: number[] = [];
    let serverMessage: string | null = null;

    const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
    if (imgsentryData && imgsentryData.ajax_url) {
      try {
        let res;
        if (ids.length === 1 && !force) {
          const fd = new FormData();
          fd.append('action', 'imgsentry_move_to_trash');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('id', String(ids[0]));
          if (source) fd.append('source', source);
          res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
        } else {
          const fd = new FormData();
          fd.append('action', 'imgsentry_bulk_action');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('bulk_action', 'trash');
          if (force) {
            fd.append('force', '1');
          }
          if (forceProtected) {
            fd.append('force_protected', '1');
          }
          if (source) fd.append('source', source);
          ids.forEach(id => fd.append('ids[]', String(id)));
          res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
        }
        
        const json = await res.json();
        if (!json.success) {
          const errorMsg = json.data?.message || 'Cannot move item to trash because it is currently in use.';
          if (json.data) {
            if (Array.isArray(json.data.skipped_now_used_ids)) {
              skippedNowUsedIds = json.data.skipped_now_used_ids;
            } else if (json.data.is_used && json.data.item_id) {
              skippedNowUsedIds = [json.data.item_id];
            }

            if (Array.isArray(json.data.skipped_used_ids)) {
              skippedUsedIds = json.data.skipped_used_ids;
            } else if (json.data.is_used && json.data.item_id) {
              skippedUsedIds = [json.data.item_id];
            }

            if (Array.isArray(json.data.skipped_protected_ids)) {
              skippedProtectedIds = json.data.skipped_protected_ids;
            }

            const idsToMark = skippedUsedIds.length > 0 ? skippedUsedIds : skippedNowUsedIds.filter(id => !skippedProtectedIds.includes(id));
            if (idsToMark.length > 0) {
              setMediaList(prev => prev.map(i => {
                if (idsToMark.includes(i.id)) {
                  return { ...i, inUse: true, isTrashed: false };
                }
                return i;
              }));
            }
          }
          if (typeof window !== 'undefined' && (window as any).imgsentryShowToast) {
            (window as any).imgsentryShowToast(errorMsg, 'error');
          }
          return false;
        }

        if (json.data) {
          if (Array.isArray(json.data.processed_ids)) processedIds = json.data.processed_ids;
          if (Array.isArray(json.data.failed_ids)) failedIds = json.data.failed_ids;
          if (Array.isArray(json.data.skipped_now_used_ids)) skippedNowUsedIds = json.data.skipped_now_used_ids;
          if (Array.isArray(json.data.skipped_used_ids)) skippedUsedIds = json.data.skipped_used_ids;
          if (Array.isArray(json.data.skipped_protected_ids)) skippedProtectedIds = json.data.skipped_protected_ids;
          if (json.data.message) serverMessage = json.data.message;
        }
      } catch (e) {
        console.error('WordPress AJAX move_to_trash error:', e);
        return false;
      }
    }

    setMediaList(prev => prev.map(i => {
      if (processedIds.includes(i.id)) {
        const computedPath = i.originalPath || i.original_path || (i.location && i.location.includes('/') ? i.location : `/wp-content/uploads/2024/${(i.uploadDate || '').includes('Apr') ? '04' : '05'}/${i.filename}`);
        return {
          ...i,
          isTrashed: true,
          originalPath: computedPath,
          original_path: computedPath,
          trashedDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
          daysInTrash: 0
        };
      } else if (skippedUsedIds.includes(i.id)) {
        return {
          ...i,
          inUse: true,
          isTrashed: false
        };
      } else if (skippedProtectedIds.includes(i.id)) {
        return {
          ...i,
          isTrashed: false
        };
      } else if (skippedNowUsedIds.includes(i.id) && !skippedProtectedIds.includes(i.id)) {
        return {
          ...i,
          inUse: true,
          isTrashed: false
        };
      }
      return i;
    }));

    setDataRevision(prev => prev + 1);

    setSelectedIds(prev => prev.filter(i => !ids.includes(i)));
    incrementScanDeletedCount(processedIds.length);
    fetchDuplicateCounts();
    
    if (ids.length === 1) {
      const item = mediaList.find(i => i.id === ids[0]);
      if (item) {
        if (skippedNowUsedIds.includes(ids[0])) {
          showToastMsg(`"${item.title}" was skipped because it is currently in use.`, 'warning');
          addLog('Skipped Trashing Used File', `Item ID ${ids[0]}: ${item.filename}`);
        } else {
          showToastMsg(`"${item.title}" moved to Trash.`);
          addLog('Moved to Trash', `Item ID ${ids[0]}: ${item.filename}`);
        }
      }
    } else {
      let toastText = serverMessage;
      if (!toastText) {
        const parts = [];
        parts.push(`${processedIds.length} items moved to Trash`);
        if (skippedNowUsedIds.length > 0) {
          parts.push(`${skippedNowUsedIds.length} skipped (became used since last scan)`);
        }
        if (failedIds.length > 0) {
          parts.push(`${failedIds.length} failed`);
        }
        toastText = parts.join(', ') + '.';
      }
      const toastType = skippedNowUsedIds.length > 0 || failedIds.length > 0 ? 'warning' : 'success';
      showToastMsg(toastText, toastType);
      addLog('Bulk Moved to Trash', `Processed: ${processedIds.length}, Skipped (used): ${skippedNowUsedIds.length}, Failed: ${failedIds.length}`);
    }

    return true;
  };

  const handleRestore = async (id: number) => {
    const item = mediaList.find(i => i.id === id);

    setMediaList(prev => prev.map(i => {
      if (i.id === id) {
        return {
          ...i,
          isTrashed: false,
          trashedDate: undefined,
          daysInTrash: 0
        };
      }
      return i;
    }));

    setDataRevision(prev => prev + 1);

    setSelectedIds(prev => prev.filter(i => i !== id));
    fetchDuplicateCounts();

    const imgsentryData = (window as any).imgsentry_data;
    if (imgsentryData && imgsentryData.ajax_url) {
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_restore_media');
        fd.append('nonce', imgsentryData.nonce);
        fd.append('id', String(id));
        await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
      } catch (e) {
        console.error('WordPress AJAX restore_media error:', e);
      }
    }

    if (item) {
      showToastMsg(`"${item.title}" restored successfully.`);
      addLog('Restored from Trash', `Item ID ${id}: ${item.filename}`);
    }
  };

  const handleUpdateMediaItem = (id: number, updates: Partial<MediaItem>) => {
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    setDataRevision(prev => prev + 1);
  };

  const handleDeletePermanently = async (idOrIds: number | number[]): Promise<boolean> => {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    if (ids.length === 0) return false;

    const firstItem = mediaList.find(i => ids.includes(i.id));

    const imgsentryData = (window as any).imgsentryData || (window as any).imgsentry_data;
    if (imgsentryData && imgsentryData.ajax_url) {
      try {
        let res;
        if (ids.length === 1) {
          const fd = new FormData();
          fd.append('action', 'imgsentry_delete_permanently');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('id', String(ids[0]));
          res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
        } else {
          const fd = new FormData();
          fd.append('action', 'imgsentry_bulk_action');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('bulk_action', 'delete_permanent');
          ids.forEach(id => fd.append('ids[]', String(id)));
          res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
        }
        
        const json = await res.json();
        if (!json.success) {
          return false;
        }
      } catch (e) {
        console.error('WordPress AJAX delete_permanently error:', e);
        return false;
      }
    }

    setMediaList(prev => prev.filter(i => !ids.includes(i.id)));
    setSelectedIds(prev => prev.filter(i => !ids.includes(i)));
    incrementScanDeletedCount(ids.length);
    fetchDuplicateCounts();

    if (ids.length === 1 && firstItem) {
      showToastMsg(`"${firstItem.title}" permanently deleted from disk and database.`);
      addLog('Deleted Permanently', `Item ID ${firstItem.id}: ${firstItem.filename} (${firstItem.formattedSize})`);
    } else {
      showToastMsg(`${ids.length} items permanently deleted.`);
      addLog('Bulk Permanently Deleted', `IDs: ${ids.join(', ')}`);
    }

    return true;
  };

  // Bulk Actions
  const handleApplyBulk = async () => {
    if (selectedIds.length === 0) {
      showToastMsg('Please select at least one item.', 'error');
      return;
    }

    if (!bulkAction) {
      showToastMsg('Please choose a bulk action.', 'error');
      return;
    }

    const idsToProcess = [...selectedIds];

    if (bulkAction === 'trash') {
      setMediaList(prev => prev.map(i => {
        if (idsToProcess.includes(i.id)) {
          const computedPath = i.originalPath || i.original_path || (i.location && i.location.includes('/') ? i.location : `/wp-content/uploads/2024/${(i.uploadDate || '').includes('Apr') ? '04' : '05'}/${i.filename}`);
          return {
            ...i,
            isTrashed: true,
            originalPath: computedPath,
            original_path: computedPath,
            trashedDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
            daysInTrash: 0
          };
        }
        return i;
      }));
      incrementScanDeletedCount(idsToProcess.length);
      showToastMsg(`${idsToProcess.length} items moved to Trash.`);
      addLog('Bulk Moved to Trash', `IDs: ${idsToProcess.join(', ')}`);
    } else if (bulkAction === 'restore') {
      setMediaList(prev => prev.map(i => {
        if (idsToProcess.includes(i.id)) {
          return { ...i, isTrashed: false, trashedDate: undefined, daysInTrash: 0 };
        }
        return i;
      }));
      showToastMsg(`${idsToProcess.length} items restored.`);
      addLog('Bulk Restored', `IDs: ${idsToProcess.join(', ')}`);
    } else if (bulkAction === 'delete_permanent') {
      setMediaList(prev => prev.filter(i => !idsToProcess.includes(i.id)));
      incrementScanDeletedCount(idsToProcess.length);
      showToastMsg(`${idsToProcess.length} items permanently deleted.`);
      addLog('Bulk Permanently Deleted', `IDs: ${idsToProcess.join(', ')}`);
    }

    setSelectedIds([]);
    setBulkAction('');
    fetchDuplicateCounts();

    const imgsentryData = (window as any).imgsentry_data;
    if (imgsentryData && imgsentryData.ajax_url) {
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_bulk_action');
        fd.append('nonce', imgsentryData.nonce);
        fd.append('bulk_action', bulkAction);
        idsToProcess.forEach(id => fd.append('ids[]', String(id)));
        await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
      } catch (e) {
        console.error('WordPress AJAX bulk_action error:', e);
      }
    }
  };

  // Empty Trash & Danger Modal
  const handleExecuteDeleteAllModal = async () => {
    if (deleteAllConfirmInput.toUpperCase() !== 'CONFIRM') {
      showToastMsg('Please type CONFIRM to execute.', 'error');
      return;
    }

    const imgsentryData = (window as any).imgsentry_data;

    if (deleteAllTarget === 'trash') {
      await handleEmptyTrash();
      setIsDeleteAllModalOpen(false);
      return;
    } else {
      const totalCount = mediaList.length;
      setMediaList([]);
      incrementScanDeletedCount(totalCount);

      if (imgsentryData && imgsentryData.ajax_url) {
        try {
          const fd = new FormData();
          fd.append('action', 'imgsentry_delete_all');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('confirm_text', 'DELETE');
          fd.append('target_type', 'permanent');
          fd.append('status_scope', 'active');
          await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
        } catch (e) {
          console.error('WordPress AJAX delete_all error:', e);
        }
      }

      addLog('Purged Entire Library', `DELETED ALL ${totalCount} media items permanently.`);
      showToastMsg(`Wiped entire media library (${totalCount} files).`);
    }

    setIsDeleteAllModalOpen(false);
    setDeleteAllConfirmInput('');
  };

  // Clean Plugin Database Data Handler
  const handleCleanPluginData = async (options: {
    cleanOrphanedScans?: boolean;
    cleanScans: boolean;
    cleanLogs: boolean;
    cleanTransients: boolean;
    cleanOrphanedMeta: boolean;
    cleanThumbsCache?: boolean;
  }) => {
    if (isScanning) {
      showToastMsg('Cannot clean plugin database data while a media scan is currently in progress.');
      return;
    }

    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_clean_plugin_data');
        fd.append('nonce', imgsentryData.nonce);
        fd.append('options', JSON.stringify(options));

        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();

        if (json.success && json.data) {
          const freed = json.data.freed || { orphaned_scans: 0, scans: 0, logs: 0, transients: 0, meta: 0, thumbs: 0 };
          
          if (options.cleanScans) {
            setScanHistory([]);
          }
          if (options.cleanLogs) {
            setAuditLog([
              {
                id: `log-${Date.now()}`,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                user: 'admin',
                action: 'Cleaned Plugin Database Footprint',
                details: `Truncated wp_imgsentry_logs table (${freed.logs} rows) and updated scan indices.`
              }
            ]);
            setDetailedLogs([]);
          }

          const nowStr = new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const backendStats = json.data.stats;
          const updatedStats = backendStats ? {
            mediaCleanerDataMb: Number(backendStats.db_usage_bytes ?? 0) / (1024 * 1024),
            logDataMb: Number(backendStats.db_logs_bytes ?? 0) / (1024 * 1024),
            totalCleanableGb: Number(backendStats.db_transients_bytes ?? 0) / (1024 * 1024 * 1024),
            dbOrphmetaMb: Number(backendStats.db_orphmeta_bytes ?? 0) / (1024 * 1024),
            dbOrphanedScansMb: Number(backendStats.db_orphaned_scans_bytes ?? 0) / (1024 * 1024),
            thumbsCacheMb: Number(backendStats.thumbs_cache_bytes ?? 0) / (1024 * 1024),
            lastCleanedDate: nowStr
          } : {
            mediaCleanerDataMb: options.cleanScans ? 0.0 : dbStats.mediaCleanerDataMb,
            logDataMb: options.cleanLogs ? 0.0 : dbStats.logDataMb,
            totalCleanableGb: options.cleanTransients ? 0.0 : dbStats.totalCleanableGb,
            dbOrphmetaMb: options.cleanOrphanedMeta ? 0.0 : dbStats.dbOrphmetaMb,
            dbOrphanedScansMb: options.cleanOrphanedScans ? 0.0 : dbStats.dbOrphanedScansMb,
            thumbsCacheMb: options.cleanThumbsCache ? 0.0 : dbStats.thumbsCacheMb,
            lastCleanedDate: nowStr
          };
          setDbStats(updatedStats);

          const parts = [];
          if (freed.orphaned_scans) parts.push(`${freed.orphaned_scans} orphaned scan records`);
          if (freed.scans) parts.push(`scan index reset (${freed.scans} records — will rebuild on next scan)`);
          if (freed.logs) parts.push(`${freed.logs} logs`);
          if (freed.transients) parts.push(`${freed.transients} transients`);
          if (freed.meta) parts.push(`${freed.meta} orphaned meta rows`);
          if (freed.thumbs) parts.push(`${freed.thumbs} thumbnail previews`);
          const freedSummary = parts.length > 0 ? `Cleared ${parts.join(', ')}.` : 'Cleanup completed.';
          showToastMsg(`Plugin data cleaned successfully! ${freedSummary}`);
          
          if (!options.cleanLogs) {
            addLog('Cleaned Plugin Overhead', freedSummary);
          }
        } else {
          throw new Error(json.data?.message || 'Database cleanup action failed on server.');
        }
      } catch (e: any) {
        console.error('Failed to clean plugin data on backend:', e);
        showToastMsg(`Failed to clean plugin data: ${e.message}`);
      }
    } else {
      // Offline/Dev fallback
      let freedMb = 0;
      if (options.cleanOrphanedScans) {
        freedMb += dbStats.dbOrphanedScansMb;
      }
      if (options.cleanScans) {
        freedMb += dbStats.mediaCleanerDataMb;
        setScanHistory([]);
      }
      if (options.cleanLogs) {
        freedMb += dbStats.logDataMb;
        setAuditLog([
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: 'admin',
            action: 'Cleaned Plugin Database Footprint',
            details: 'Cleared scan records and logs (Simulated).'
          }
        ]);
        setDetailedLogs([]);
      }
      if (options.cleanTransients) {
        freedMb += dbStats.totalCleanableGb * 1024;
      }
      if (options.cleanOrphanedMeta) {
        freedMb += dbStats.dbOrphmetaMb;
      }
      if (options.cleanThumbsCache) {
        freedMb += dbStats.thumbsCacheMb;
      }

      const nowStr = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const updatedStats = {
        mediaCleanerDataMb: options.cleanScans ? 0.0 : dbStats.mediaCleanerDataMb,
        logDataMb: options.cleanLogs ? 0.0 : dbStats.logDataMb,
        totalCleanableGb: options.cleanTransients ? 0.0 : dbStats.totalCleanableGb,
        dbOrphmetaMb: options.cleanOrphanedMeta ? 0.0 : dbStats.dbOrphmetaMb,
        dbOrphanedScansMb: options.cleanOrphanedScans ? 0.0 : dbStats.dbOrphanedScansMb,
        thumbsCacheMb: options.cleanThumbsCache ? 0.0 : dbStats.thumbsCacheMb,
        lastCleanedDate: nowStr
      };
      setDbStats(updatedStats);

      const freedDisplay = freedMb >= 1024
        ? `${(freedMb / 1024).toFixed(2)} GB`
        : `${freedMb.toFixed(1)} MB`;

      const toastMessage = options.cleanScans
        ? `Scan index reset — will rebuild on next scan (${freedDisplay} freed).`
        : `Plugin data cleaned successfully (Simulated ${freedDisplay} freed).`;

      showToastMsg(toastMessage);
    }
  };

  // Execute Scan
  /**
   * BEST-PRACTICE MEMORY SAFEGUARDS FOR MEDIA SCANNING & DUPLICATE DETECTION:
   * 
   * Even at the maximum 1024MB memory_limit setting, do NOT rely on memory limit alone for large libraries!
   * A single PHP request handling thousands of full-resolution decoded images can easily exceed 1GB —
   * memory_limit is a safety ceiling, not a green light to load everything into memory at once.
   * 
   * SAFEGUARD BATCHING RULES:
   * - Quick Scan: Negligible memory needs (database index query only) — no special handling required.
   * - Smart Scan: Moderate — process usage-detection queries in batches of ~200 attachments at a time.
   * - Deep Scan: Batch filesystem operations in chunks of 50–100 files per AJAX request, regardless of memory_limit.
   * - Duplicate Image Detection: Process images in batches of 20–30 at a time, immediately free each GD resource
   *   (`imagedestroy($img)`) after computing pHash/dHash, and store only hash strings in transients.
   */
  const duplicateScanFnRef = useRef<(() => void) | null>(null);

  const handleStartScanExecution = (scanTypeArg?: unknown) => {
    if (mainNav === 'duplicate' && duplicateScanFnRef.current) {
      duplicateScanFnRef.current();
      return;
    }

    // 'smart' | 'full' when called from the Media Scanner buttons; otherwise (Dashboard button, click events) use the saved default.
    const savedDefaultType = String(pluginSettings.defaultScanType);
    const requestedScanType: 'smart' | 'full' =
      scanTypeArg === 'full' || scanTypeArg === 'smart'
        ? scanTypeArg
        : (savedDefaultType === 'full' || savedDefaultType === 'deep' ? 'full' : 'smart');

    setIsMemoryNoticeDismissed(false); // Re-check memory notice live each time a scan is about to run
    setIsScanning(true);
    setScanProgress(0);
    setScanStatusText('Initializing scan engine & verifying PHP memory ceiling...');
    showToastMsg(
      mainNav === 'used'
        ? 'Executing Used Files Scan...'
        : mainNav === 'duplicate'
        ? 'Executing Duplicate Image Scan...'
        : 'Executing Media Scan...'
    );

    const scanStartTime = Date.now();

    const imgsentryData = (window as any).imgsentry_data || (window as any).imgsentryData;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const executeRealAjaxScan = async () => {
        try {
          const fd = new FormData();
          fd.append('action', 'imgsentry_run_scan');
          fd.append('scan_type', requestedScanType);
          fd.append('nonce', imgsentryData.nonce);

          const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
          const json = await res.json();

          if (!json.success) {
            throw new Error(json.data?.message || 'Failed to start scan.');
          }

          setIsScanning(false);
          scanStartTimeRef.current = Date.now();
          if (json.data?.already_running) {
            showToastMsg('A scan is already running. Showing its progress.');
          }
          scanStatus.start(true, String(json.data?.scan_type || requestedScanType));
        } catch (e: any) {
          console.error('AJAX scan execution error:', e);
          setIsScanning(false);
          showToastMsg('Scan error: ' + (e.message || 'Network request failed'), 'error');
        }
      };

      executeRealAjaxScan();
      return;
    }

    const scanType: string = requestedScanType === 'full' ? 'deep' : 'smart';
    let currentProgress = 0;
    const batchIncrement = scanType === 'deep' ? 10 : scanType === 'quick' ? 50 : 20;

    const runBatch = () => {
      currentProgress += batchIncrement;
      if (currentProgress > 100) currentProgress = 100;
      setScanProgress(currentProgress);
      
      if (mainNav === 'used') {
        setScanStatusText(`Used Files Scan: Analyzing database references and tracking page attachments (${currentProgress}%)...`);
      } else if (mainNav === 'duplicate') {
        setScanStatusText(`Duplicate Image Scan: Calculating md5 hashes & comparing perceptual visual vectors (${currentProgress}%)...`);
      } else if (scanType === 'quick') {
        setScanStatusText(`Quick Scan: Negligible memory load. Querying DB indexes (${currentProgress}%)...`);
      } else if (scanType === 'deep') {
        const chunkNum = Math.floor(currentProgress / 10);
        setScanStatusText(`Deep Scan: Processing filesystem chunk ${chunkNum}/10 (50–100 files per AJAX request)...`);
      } else {
        setScanStatusText(`Smart Scan: Querying postmeta in batches of 200 attachments (${currentProgress}%)...`);
      }

      if (currentProgress >= 100) {
        setIsScanning(false);
        fetchDuplicateCounts();
        setAppliedPluginSettings(pluginSettings);
        const summary = computeScanSummary(mediaList, pluginSettings);
        setScanSummary(summary);
        setShowScanSummary(true);

        const now = new Date();
        const localTimestamp = now.toISOString();

        const getScanTypeLabel = (type: string) => {
          if (mainNav === 'used') return 'Used Files Scan';
          if (type === 'deep' || type === 'full') return 'Deep Scan';
          return 'Smart Scan';
        };

        const usedItems = mediaList.filter(i => i.inUse && !i.isTrashed);
        const usedCount = usedItems.length;
        const usedSizeBytes = usedItems.reduce((sum, item) => sum + (item.fileSize || 0), 0);
        const formattedUsedSize = formatSize(usedSizeBytes);

        const newScan: ScanHistoryEntry = {
          id: `scan-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          timestamp: localTimestamp,
          formattedDate: 'Today',
          scanType: getScanTypeLabel(scanType),
          totalScanned: mediaList.filter(i => !i.isTrashed).length,
          unusedCount: summary.unusedCount,
          deletedCount: 0,
          unusedSizeBytes: summary.unusedSizeBytes,
          formattedUnusedSize: summary.formattedUnusedSize,
          usedCount: usedCount,
          usedSizeBytes: usedSizeBytes,
          formattedUsedSize: formattedUsedSize,
          durationSeconds: scanType === 'deep' ? 45.2 : scanType === 'quick' ? 1.5 : 12.4,
          status: 'completed',
          isManual: true
        };
        setScanHistory(prev => [newScan, ...prev]);

        if (mainNav === 'used') {
          const usedItems = mediaList.filter(i => i.inUse && !i.isTrashed);
          const usedCount = usedItems.length;
          const usedSizeBytes = usedItems.reduce((a, b) => a + b.fileSize, 0);
          const formattedUsedSize = formatSize(usedSizeBytes);

          addLog('Scan Completed', `Scanned used files. Identified ${usedCount} files (${formattedUsedSize}) actively in use on your site.`);
          addDetailedLog(
            'Success',
            'Scan',
            'Media Scanner',
            'Used files scan completed successfully',
            `Scanned used files. Identified ${usedCount} files (${formattedUsedSize}) actively in use on your site.`
          );
          showToastMsg(`Scan Complete! Found ${usedCount} used files (${formattedUsedSize}) in use across your site.`);
        } else if (mainNav === 'unused') {
          const unusedItems = mediaList.filter(i => !i.inUse && !i.isTrashed);
          const unusedCount = unusedItems.length;
          const unusedSizeBytes = unusedItems.reduce((a, b) => a + b.fileSize, 0);
          const formattedUnusedSize = formatSize(unusedSizeBytes);

          addLog('Scan Completed', `Scanned ${unusedCount} active items in safe batches. Found ${unusedCount} unused files (${formattedUnusedSize}).`);
          addDetailedLog(
            'Success',
            'Scan',
            'Media Scanner',
            'Smart media scan completed successfully',
            `Scanned ${unusedCount} active items in safe batches. Found ${unusedCount} unused files (${formattedUnusedSize}).`
          );
          showToastMsg(`Scan Complete! Found ${unusedCount} unused files (${formattedUnusedSize}).`);
        } else if (mainNav === 'duplicate') {
          addLog('Scan Completed', `Initiated duplicate scan hash task.`);
          addDetailedLog(
            'Success',
            'Scan',
            'Media Scanner',
            'Duplicate image scan initiated',
            `Started perceptual hash scanning across media library.`
          );
          showToastMsg(`Initiating perceptual hash duplicate scan...`);
        } else {
          addLog('Scan Completed', `Scanned ${summary.totalActiveFiles} active items in safe batches. Found ${summary.unusedCount} unused files (${summary.formattedUnusedSize}).`);
          addDetailedLog(
            'Success',
            'Scan',
            'Media Scanner',
            'Smart media scan completed successfully',
            `Scanned ${summary.totalActiveFiles} active items in safe batches. Found ${summary.unusedCount} unused files (${summary.formattedUnusedSize}).`
          );
          showToastMsg(`Scan Complete! Found ${summary.unusedCount} unused files (${summary.formattedUnusedSize}).`);
        }
      } else {
        setTimeout(runBatch, scanType === 'deep' ? 400 : scanType === 'quick' ? 150 : 250);
      }
    };

    setTimeout(runBatch, 400);
  };

  // Load the scan history written by the server (manual, scheduled and automatic scans).
  const syncScanHistoryFromServer = async () => {
    const d = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const url = d?.ajax_url || d?.ajaxUrl;
    if (!url || !d?.nonce) return;
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_scan_history');
      fd.append('nonce', d.nonce);
      const res = await fetch(url, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.history)) {
        setScanHistory(json.data.history);
      }
    } catch (err) {
      console.error('Failed to load scan history:', err);
    }
  };

  // A scan finished somewhere else (scheduled run, another tab): pick up its history entry.
  useEffect(() => {
    if (!scanStatus.historyHead) return;
    if (scanHistory.some((h) => h.id === scanStatus.historyHead)) return;
    syncScanHistoryFromServer();
  }, [scanStatus.historyHead]);

  // Register completion handler with useScanStatus
  useEffect(() => {
    const unsubscribe = scanStatus.onCompleted(async (payload) => {
      try {
        setIsScanning(false);
        const freshList = await fetchMediaList();
        const finalList = freshList || mediaListRef.current;

        const usedItems = finalList.filter(i => i.inUse && !i.isTrashed);
        const clientUsedCount = usedItems.length;
        const usedSizeBytes = usedItems.reduce((sum, item) => sum + (item.fileSize || 0), 0);
        const formattedUsedSize = formatSize(usedSizeBytes);

        const unusedItems = finalList.filter(i => !i.inUse && !i.isTrashed);
        const clientUnusedCount = unusedItems.length;
        const unusedSizeBytes = unusedItems.reduce((sum, item) => sum + (item.fileSize || 0), 0);
        const formattedUnusedSize = formatSize(unusedSizeBytes);

        const unusedCount = payload.stats?.unused_count !== undefined 
          ? Number(payload.stats.unused_count) 
          : clientUnusedCount;

        const usedCount = payload.stats?.used_count !== undefined 
          ? Number(payload.stats.used_count) 
          : clientUsedCount;

        const total = payload.total || (usedCount + unusedCount);
        const effectiveStartTime = payload.startTime || scanStartTimeRef.current;
        const elapsedSeconds = effectiveStartTime 
          ? Math.max(0.1, Number(((Date.now() - effectiveStartTime) / 1000).toFixed(1)))
          : 0.1;

        await fetchDuplicateCounts();

        // The server writes the scan history entry when a scan finishes. Load it so the history is always correct.
        await syncScanHistoryFromServer();

        if (payload.isManual) {
          const doneLabel = payload.scanType === 'smart' ? 'Smart scan' : 'Deep scan';
          addLog('Real Scan Completed', `${doneLabel} finished in ${elapsedSeconds}s.`);
          showToastMsg(`${doneLabel} complete (${elapsedSeconds}s).`);
        }
      } catch (err) {
        console.error('Error handling scan completion:', err);
      }
    });

    return unsubscribe;
  }, [scanStatus.onCompleted]);

  // Run Cron Now Simulation
  const handleRunCronNow = () => {
    const expiredItems = mediaList.filter(i => i.isTrashed && i.daysInTrash >= pluginSettings.retentionDays);
    const count = expiredItems.length;

    setMediaList(prev => prev.filter(i => !(i.isTrashed && i.daysInTrash >= pluginSettings.retentionDays)));
    showToastMsg(`WP-Cron executed. Purged ${count} files exceeding ${pluginSettings.retentionDays} days retention.`);
    addLog('WP-Cron Auto-Purge Executed', `Threshold: ${pluginSettings.retentionDays} days. Purged ${count} files.`);
  };

  // Empty Trash direct handler (batched & server-verified)
  const handleEmptyTrash = async () => {
    const initialTrashedCount = trashedItems.length;
    if (initialTrashedCount === 0) {
      showToastMsg('Trash bin is already empty.');
      return;
    }

    const imgsentryData = (window as any).imgsentry_data;

    if (imgsentryData && imgsentryData.ajax_url) {
      const batchSize = 50;
      let isComplete = false;
      let totalDeleted = 0;
      const allFailedIds: number[] = [];

      const currentTrashedIds = trashedItems.map(i => i.id);

      try {
        showToastMsg(`Emptying Trash... (0/${initialTrashedCount} processed)`);

        while (!isComplete) {
          const fd = new FormData();
          fd.append('action', 'imgsentry_empty_trash');
          fd.append('nonce', imgsentryData.nonce);
          fd.append('batch_size', String(batchSize));
          fd.append('trashed_ids', JSON.stringify(currentTrashedIds));
          if (allFailedIds.length > 0) {
            fd.append('failed_ids', JSON.stringify(allFailedIds));
          }

          const response = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const json = await response.json();
          if (!json || !json.success) {
            const errorMsg = json?.data?.message || 'Server error while emptying trash.';
            throw new Error(errorMsg);
          }

          const data = json.data || {};
          const batchDeletedCount = Number(data.deleted_count || 0);
          const batchDeletedIds: number[] = Array.isArray(data.deleted_ids) ? data.deleted_ids : [];
          const batchFailedIds: number[] = Array.isArray(data.failed_ids) ? data.failed_ids : [];

          totalDeleted += batchDeletedCount;
          if (batchFailedIds.length > 0) {
            // Keep unique list of failed IDs
            batchFailedIds.forEach(id => {
              if (!allFailedIds.includes(id)) {
                allFailedIds.push(id);
              }
            });
          }

          // Update local state for items confirmed deleted by the server
          if (batchDeletedIds.length > 0) {
            setMediaList(prev => prev.filter(i => !batchDeletedIds.includes(i.id)));
          } else if (batchDeletedCount > 0) {
            // Fallback: remove trashed items up to batchDeletedCount if explicit IDs array missing
            setMediaList(prev => {
              const trashedInPrev = prev.filter(i => i.isTrashed);
              const idsToRemove = new Set(trashedInPrev.slice(0, batchDeletedCount).map(i => i.id));
              return prev.filter(i => !idsToRemove.has(i.id));
            });
          }

          incrementScanDeletedCount(batchDeletedCount);

          isComplete = !!data.is_complete;

          if (!isComplete) {
            showToastMsg(`Emptying Trash... (${totalDeleted}/${data.total || initialTrashedCount} processed)`);
          }
        }

        // Clean up any remaining trashed items from local state if complete
        setMediaList(prev => prev.filter(i => !i.isTrashed));
        fetchDuplicateCounts();
        const finalCount = totalDeleted > 0 ? totalDeleted : initialTrashedCount;

        // Final completion state
        if (allFailedIds.length > 0) {
          addLog('Emptied Trash Bin (Partial)', `Purged ${totalDeleted} files. Failed to delete ${allFailedIds.length} items (IDs: ${allFailedIds.join(', ')}).`);
          showToastMsg(
            `Empty Trash completed with warnings: ${totalDeleted} deleted, ${allFailedIds.length} failed to delete (IDs: ${allFailedIds.join(', ')}).`,
            'error'
          );
        } else {
          addLog('Emptied Trash Bin', `Purged ${finalCount} trashed items permanently.`);
          showToastMsg(`Successfully emptied Trash Bin (${finalCount} files deleted).`);
        }
      } catch (e: any) {
        console.error('WordPress AJAX empty_trash error:', e);
        showToastMsg(`Failed to empty trash: ${e.message || 'Network error'}`, 'error');
        addLog('Empty Trash Failed', e.message || 'Network or server error during execution.');
      }
    } else {
      // Standalone simulation mode
      const trashedCount = trashedItems.length;
      setMediaList(prev => prev.filter(i => !i.isTrashed));
      incrementScanDeletedCount(trashedCount);
      fetchDuplicateCounts();
      addLog('Emptied Trash Bin', `Purged ${trashedCount} trashed items permanently.`);
      showToastMsg(`Emptied Trash Bin (${trashedCount} files deleted).`);
    }
  };

  // Refresh data handler (cheap read-only update of stored scan results with 8-second request timeout guard)
  const handleRefreshData = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    let isCompleted = false;
    const TIMEOUT_THRESHOLD_MS = 60000; // Increased to 60 seconds for deep scans

    // 1. Request Timeout Guard with Graceful Failure
    const timeoutTimer = setTimeout(() => {
      if (isCompleted) return;
      isCompleted = true;
      setIsRefreshing(false);

      showToastMsg('Refresh timed out. Existing filters and view preserved.', 'error');
      addLog('Refresh Timed Out', 'Data refresh request timed out. Active view state preserved.');
      addDetailedLog(
        'Warning',
        'Refresh',
        'Database Sync',
        'Refresh Request Timed Out',
        'The refresh operation exceeded the safety threshold. Active filters, selections, and page state were gracefully preserved.'
      );
    }, TIMEOUT_THRESHOLD_MS);

    const imgsentryData = (window as any).imgsentry_data;
    if (imgsentryData && imgsentryData.ajax_url) {
      try {
        let phpItems: any[] = [];
        
        const fd = new FormData();
        fd.append('action', 'imgsentry_fetch_media');
        fd.append('scan_type', 'cache');
        fd.append('per_page', '-1');
        fd.append('status', 'all');
        fd.append('nonce', imgsentryData.nonce);

        const res = await fetch(imgsentryData.ajax_url, { method: 'POST', body: fd });
        const json = await res.json();
        
        if (json.success && json.data) {
           phpItems = json.data.items || [];
        } else {
           throw new Error(json.data?.message || 'Server returned invalid response');
        }

        if (isCompleted) return; // if timeout hit
        isCompleted = true;
        clearTimeout(timeoutTimer);
        
        const updatedMediaList = phpItems.map(item => mapPhpItemToMediaItem(item));
        
        setMediaList(prevList => {
          const updatedMap = new Map(updatedMediaList.map(item => [item.id, item]));
          return prevList.map(item => updatedMap.get(item.id) || item)
            .concat(updatedMediaList.filter(item => !prevList.some(p => p.id === item.id)));
        });
        showToastMsg(`Refreshed Media Data (${updatedMediaList.length} items synced).`);
        addLog('Data Refreshed', `Re-read stored scan transients and database records from backend.`);
        fetchDuplicateCounts();
        fetchSystemStorage();
        setIsRefreshing(false);
      } catch (e: any) {
        if (isCompleted) return;
        isCompleted = true;
        clearTimeout(timeoutTimer);
        setIsRefreshing(false);
        showToastMsg('Refresh error: ' + (e.message || 'Network request failed'), 'error');
      }
    } else {
      // 2. Perform cheap read-only update of stored scan results
      setTimeout(() => {
        if (isCompleted) return;
        isCompleted = true;
        clearTimeout(timeoutTimer);

        // Find missing items from the stored transient database cache
        const existingIds = new Set(mediaList.map(i => i.id));
        const missingItems = INITIAL_MOCK_MEDIA.filter(i => !existingIds.has(i.id));

        if (missingItems.length > 0) {
          setMediaList(prev => [...prev, ...missingItems]);
          showToastMsg(`Refreshed Media Data (${missingItems.length} stored record updates synced).`);
          addLog('Data Refreshed', `Re-read stored scan transients and database records (${missingItems.length} synced without re-scanning).`);
        } else {
          showToastMsg('Refreshed Media Data. All records up to date.');
        }
        setIsRefreshing(false);
      }, 400);
    }
  };

  // Export CSV Audit Report
  const handleExportCSV = (exportType?: 'all' | 'unused' | 'used' | 'trash', selectedIds?: number[]) => {
    let filteredList = mediaList;
    let filenamePrefix = 'media-cleanup-report';
    let logMsg = 'Exported CSV audit report';

    if (exportType === 'unused') {
      filteredList = mediaList.filter(item => !item.inUse && !item.isTrashed);
      filenamePrefix = 'media-cleanup-unused';
      logMsg = 'Exported CSV unused files list';
    } else if (exportType === 'used') {
      filteredList = mediaList.filter(item => item.inUse && !item.isTrashed);
      filenamePrefix = 'media-cleanup-used';
      logMsg = 'Exported CSV used files list';
    } else if (exportType === 'trash') {
      filteredList = mediaList.filter(item => item.isTrashed);
      filenamePrefix = 'media-cleanup-trash';
      logMsg = 'Exported CSV trashed files list';
    }

    if (selectedIds && selectedIds.length > 0) {
      filteredList = filteredList.filter(item => selectedIds.includes(item.id));
      filenamePrefix += '-selected';
      logMsg = `Exported selected files (${selectedIds.length} items) from ${exportType || 'all'} list`;
    }

    // Guard: Do not export empty CSV if no files exist in target scope
    if (filteredList.length === 0) {
      showToastMsg('No files to export.', 'error');
      return;
    }

    // Define headers and rows based on export type
    let headers: string[] = [];
    let rows: any[][] = [];

    if (exportType === 'used') {
      // Special Headers for Used Files (as per user request)
      headers = [
        'Media ID',
        'Filename',
        'Category',
        'Extension',
        'Media URL',
        'File Size (Formatted)',
        'Status',
        'Attached Parent',
        'Usage Reasons',
        'Upload Date',
        'Used In Place URL'
      ];

            // Row Duplication logic for multiple usages
      filteredList.forEach((item) => {
        const usageLocs = getUsageLocations(item);
        usageLocs.forEach((loc, index) => {
          const locUrl = loc.viewUrl || loc.editUrl || '';
          if (index === 0) {
            rows.push([
              item.id,
              csvCell(item.filename || ''),
              csvCell(item.category),
              csvCell(item.extension),
              csvCell(item.url),
              csvCell(item.formattedSize),
              csvCell(item.isTrashed ? "Trashed" : "In Use"),
              csvCell(item.parentTitle || 'Unattached'),
              csvCell(item.useReasons ? item.useReasons.join('; ') : 'None'),
              csvCell(item.uploadDate),
              csvCell(locUrl)
            ]);
          } else {
            // Empty fields for subsequent rows as per requested format
            rows.push([
              csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''),
              csvCell(''), csvCell(''), csvCell(''), csvCell(''), csvCell(''),
              csvCell(locUrl)
            ]);
          }
        });
      });
    } else {
      // Default Headers for other types
      headers = [
        'Media ID',
        'Title',
        'Filename',
        'Category',
        'Extension',
        'File Size (Bytes)',
        'File Size (Formatted)',
        'Status',
        'Attached Parent',
        'In Use Status',
        'Usage Reasons',
        'Upload Date',
        'Days in Trash'
      ];

      rows = filteredList.map((item) => [
        item.id,
        csvCell(item.title || ''),
        csvCell(item.filename || ''),
        csvCell(item.category),
        csvCell(item.extension),
        item.fileSize,
        csvCell(item.formattedSize),
        csvCell(item.isTrashed ? 'Trashed' : 'Active'),
        csvCell(item.parentTitle || 'Unattached'),
        csvCell(item.inUse ? 'In Use' : 'Unused'),
        csvCell(item.useReasons ? item.useReasons.join('; ') : 'None'),
        csvCell(item.uploadDate),
        item.isTrashed ? item.daysInTrash : 0
      ]);
    }

    const csvContent = [headers.map(h => csvCell(h)).join(','), ...rows.map(row => row.map(cell => typeof cell === 'number' ? String(cell) : cell).join(','))].join('\n');
    const blob = new Blob([CSV_BOM, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addLog('Export Report (CSV)', `${logMsg} containing ${filteredList.length} media records.`);
    showToastMsg(`${logMsg} with ${filteredList.length} media records.`);
  };

  // Compute Scan Summary Breakdown
  const computeScanSummary = (items: MediaItem[], settingsObj: PluginSettings = appliedPluginSettings): ScanSummaryData => {
    const activeItems = items.filter(i => {
      if (i.isTrashed) return false;
      const isSvg = i.extension === 'svg' || i.mimeType === 'image/svg+xml';
      if (isSvg && settingsObj.includeSvg === false) return false;
      if (!isSvg && i.category === 'images' && settingsObj.includeImages === false) return false;
      if (i.category === 'video' && settingsObj.includeVideos === false) return false;
      if (i.category === 'documents' && settingsObj.includeDocuments === false) return false;
      if (i.category === 'audio' && settingsObj.includeAudio === false) return false;
      if ((i.category === 'fonts' || i.category === 'other') && settingsObj.includeOthers === false) return false;
      return true;
    });
    const totalActiveFiles = activeItems.length;
    const totalActiveBytes = activeItems.reduce((a, b) => a + b.fileSize, 0);

    const unusedItems = activeItems.filter(i => {
      if (i.inUse) return false;
      const exclusion = checkFileExclusion(
        i.filename,
        settingsObj.excludedFolders,
        settingsObj.excludedFiles,
        {
          isOutsideUploads: i.location === 'Themes' || i.location === 'Plugins',
          isThemeAsset: i.parentType === 'Theme',
          isSystemLogoOrIcon: i.title?.includes('site_icon') || i.title?.includes('logo') || i.filename?.includes('logo')
        }
      );
      if (exclusion.isExcluded) return false;
      return true;
    });
    const unusedCount = unusedItems.length;
    const unusedSizeBytes = unusedItems.reduce((a, b) => a + b.fileSize, 0);

    const catList = [
      { id: 'images', label: 'Images', color: 'bg-blue-500', bg: 'bg-blue-50/70', border: 'border-blue-200' },
      { id: 'video', label: 'Videos', color: 'bg-purple-500', bg: 'bg-purple-50/70', border: 'border-purple-200' },
      { id: 'audio', label: 'Audio', color: 'bg-emerald-500', bg: 'bg-emerald-50/70', border: 'border-emerald-200' },
      { id: 'documents', label: 'Documents', color: 'bg-amber-500', bg: 'bg-amber-50/70', border: 'border-amber-200' },
      { id: 'fonts', label: 'Fonts', color: 'bg-rose-500', bg: 'bg-rose-50/70', border: 'border-rose-200' },
    ];

    const categories = catList.map(c => {
      const catItems = activeItems.filter(i => i.category === c.id);
      const size = catItems.reduce((a, b) => a + b.fileSize, 0);
      return {
        category: c.id,
        label: c.label,
        count: catItems.length,
        sizeBytes: size,
        formattedSize: formatSize(size),
        percentage: totalActiveFiles > 0 ? Math.round((catItems.length / totalActiveFiles) * 100) : 0,
        color: c.color,
        bgColor: c.bg,
        borderColor: c.border
      };
    });

    return {
      totalCount: totalActiveFiles,
      totalSizeBytes: totalActiveBytes,
      formattedTotalSize: formatSize(totalActiveBytes),
      scanTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      categories,
      unusedCount,
      unusedSizeBytes,
      formattedUnusedSize: formatSize(unusedSizeBytes),
      totalActiveFiles
    };
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'images': return <ImageIcon className="w-4 h-4 text-blue-500" />;
      case 'video': return <VideoIcon className="w-4 h-4 text-purple-500" />;
      case 'audio': return <Music className="w-4 h-4 text-emerald-500" />;
      case 'documents': return <FileText className="w-4 h-4 text-amber-500" />;
      case 'fonts': return <Type className="w-4 h-4 text-rose-500" />;
      default: return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const mainBgClass = isDarkMode ? 'bg-[#0b1220] text-[#e7ecf3]' : 'bg-slate-50 text-gray-900';
  const sidebarBg = isDarkMode ? 'bg-[#111827] border-[#243044]' : 'bg-[#0f172a] text-slate-100';

  return (
    <div className={`${isWordPress ? 'min-h-[calc(100vh_-_var(--imgsentry-html-pad))]' : 'min-h-screen'} flex flex-col font-sans transition-colors ${mainBgClass}`}>
      {/* Single image optimization dialog / minimized chip is shown here (portal target of the Image Optimization tab) */}
      <div id="imgsentry-optimization-overlay-host" />

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className={`px-5 py-3 rounded-xl shadow-2xl text-xs font-extrabold flex items-center gap-2 border text-white ${
            toast.type === 'success' 
              ? 'bg-emerald-600 border-emerald-500' 
              : toast.type === 'warning'
              ? 'bg-amber-600 border-amber-500'
              : toast.type === 'info'
              ? 'bg-blue-600 border-blue-500'
              : 'bg-red-600 border-red-500'
          }`}>
            <CheckCircle className="w-4 h-4" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className={`flex flex-1 ${isWordPress ? 'min-h-[calc(100vh_-_var(--imgsentry-html-pad))]' : 'min-h-screen'}`}>
        {/* MAIN WORKSPACE AREA */}
        <div 
          className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#0b1220]"
          style={isDarkMode ? { background: 'radial-gradient(1200px 600px at 15% -10%, #111827 0%, #0b1220 45%), #0b1220' } : {}}
        >
          {/* Unified Sticky Top Header & Navigation Container */}
          <div className={`sticky ${isWordPress ? 'top-[var(--imgsentry-adminbar-h)]' : 'top-0'} z-40 shadow-xs`}>
            {/* Top Bar Controls */}
            <header className={`relative z-30 min-h-[72px] py-3 border-b px-8 flex items-center justify-between backdrop-blur-md ${
              isDarkMode ? 'bg-[#111827]/95 border-[#243044]' : 'bg-white/95 border-gray-200'
            }`}>
              {mainNav === 'used' || mainNav === 'unused' ? (
                <div className="flex items-center justify-between w-full gap-6">
                  <div className="flex items-center gap-6">
                    <div>
                      <h1 className="page-title text-[24px] font-bold text-[#A61E69] uppercase tracking-[0.09em] leading-tight">
                        {mainNav === 'used' ? 'Used Files' : 'Unused Files'}
                      </h1>

                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 mr-2">
                      <button 
                        onClick={handleRefreshData}
                        disabled={isRefreshing}
                        className="bg-[#A61E69] hover:bg-[#8F1B5A] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Refresh Media Cache"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span className="whitespace-nowrap">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                      </button>

                      <button 
                        onClick={() => setMainNav('scanner')}
                        className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#A61E69] dark:hover:text-[#f87171] transition-colors flex items-center gap-1 cursor-pointer px-2 py-1.5"
                        title="Navigate to Media Scanner page to run a new scan"
                      >
                        <span>Run a new scan</span>
                        <span className="text-sm">→</span>
                      </button>
                    </div>

                    <button 
                      onClick={() => handleExportCSV(mainNav === 'used' ? 'used' : 'unused', selectedIds)}
                      className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>Export Report</span>
                    </button>

                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1"></div>

                    <div className="flex items-center gap-2.5">
                      <NotificationBell
                        scanHistory={scanHistory}
                        serverWarnings={serverWarnings}
                        onNavigate={handleNotificationNavigate}
                        isDarkMode={isDarkMode}
                        rounded="rounded-xl"
                      />

                      <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                          isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-white border-gray-200 text-slate-500'
                        }`}
                      >
                        {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      </button>

                      <UserMenuChip isDarkMode={isDarkMode} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h1 className="page-title text-[24px] font-bold text-[#A61E69] uppercase tracking-[0.09em] leading-tight">
                      {mainNav === 'trash' 
                        ? 'Trash' 
                        : mainNav === 'scanner' 
                        ? 'Media Scanner' 
                        : (mainNav as string) === 'unused'
                        ? 'Unused Files'
                        : (mainNav as string) === 'used'
                        ? 'Used Files'
                        : (mainNav as string) === 'file_manager' || (mainNav as string) === 'file-manager' || mainNav === 'wp_file_manager'
                        ? 'Advance File Manager'
                        : mainNav === 'duplicate'
                        ? 'Duplicate Images'
                        : mainNav === 'image_optimization'
                        ? 'Image Optimization'
                        : mainNav === 'reports'
                        ? 'Reports'
                        : mainNav === 'settings'
                        ? 'Settings'
                        : mainNav === 'help'
                        ? 'Help & Support'
                        : mainNav === 'about'
                        ? 'About'
                        : mainNav === 'dashboard'
                        ? 'Dashboard'
                        : (mainNav as string).replace('_', ' ')
                      }
                    </h1>

                  </div>

                  <div className="flex items-center gap-3">
                    {mainNav === 'image_optimization' && (
                      <div className="flex items-center gap-2.5 mr-2">
                        <button 
                          onClick={() => optActions?.optimizeSelected()}
                          disabled={!optActions || optActions.selectedCount === 0 || optActions.isProcessing || Boolean(optActions.hasSettingsError)}
                          className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current text-blue-500" />
                          <span>Optimize Selected {optActions && optActions.selectedCount > 0 ? `(${optActions.selectedCount})` : ''}</span>
                        </button>

                        <button 
                          onClick={() => optActions?.restoreOriginals()}
                          disabled={!optActions || (optActions.restorableCount !== undefined ? optActions.restorableCount === 0 : optActions.selectedCount === 0) || optActions.isProcessing}
                          className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title={optActions && optActions.restorableCount === 0 && optActions.selectedCount > 0 ? "None of the selected images can be restored (only optimized images with backups can be restored)" : undefined}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                          <span>Restore Originals {optActions && optActions.restorableCount !== undefined && optActions.restorableCount > 0 ? `(${optActions.restorableCount})` : ''}</span>
                        </button>

                        {optActions?.isProcessing ? (
                          <button 
                            onClick={() => optActions.cancelProcessing()}
                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg>
                            <span>Cancel Processing</span>
                          </button>
                        ) : (
                          <button 
                            onClick={() => optActions?.bulkOptimizeAll()}
                            disabled={!optActions || (optActions.pendingCount ?? 0) === 0 || Boolean(optActions.hasSettingsError)}
                            className="bg-[#A61E69] hover:bg-[#8F1B5A] text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Zap className="w-3.5 h-3.5 fill-current" />
                            <span>Bulk Optimize {optActions && optActions.pendingCount !== undefined && optActions.pendingCount > 0 ? `(${optActions.pendingCount})` : ''}</span>
                          </button>
                        )}

                        <button 
                          onClick={() => optActions?.resetSettings()}
                          className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-[#1e293b] text-slate-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 p-2 rounded-lg text-xs font-bold flex items-center justify-center shadow-2xs transition-colors cursor-pointer"
                          title="Reset to default settings"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-500" />
                        </button>

                        <button 
                          onClick={() => optActions?.exportReport()}
                          className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Export Report</span>
                        </button>
                      </div>
                    )}

                    {mainNav === 'duplicate' && (
                      <div className="flex items-center gap-2.5 mr-2">
                        <button 
                          onClick={() => {
                            setMainNav('settings');
                            setSettingsSubTab('scan');
                          }}
                          className="px-4 py-2 text-xs font-bold bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-[#1e293b] rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-400" />
                          <span>Scan Settings</span>
                        </button>
                        <button 
                          onClick={handleStartScanExecution}
                          className="bg-[#A61E69] hover:bg-[#8F1B5A] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Start New Scan</span>
                        </button>
                        <button 
                          onClick={() => setShowDuplicateExport(true)}
                          className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Export Report</span>
                        </button>
                      </div>
                    )}
                    {mainNav === 'trash' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            handleRefreshData();
                            setTrashRefreshSignal(prev => prev + 1);
                          }}
                          disabled={isRefreshing}
                          className="w-[114px] min-w-[114px] max-w-[114px] shrink-0 bg-white dark:bg-slate-800 border border-[#C13D8B] hover:bg-gray-50 dark:hover:bg-[#1e293b] text-gray-700 dark:text-slate-200 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-[#A61E69] shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} style={{ color: '#A61E69' }} />
                          <span className="whitespace-nowrap">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>

                        <button
                          onClick={() => handleExportCSV('trash')}
                          className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Export CSV</span>
                        </button>
                      </div>
                    )}

                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1"></div>

                    <div className="flex items-center gap-2.5">
                      {/* Notification Bell */}
                      <NotificationBell
                        scanHistory={scanHistory}
                        serverWarnings={serverWarnings}
                        onNavigate={handleNotificationNavigate}
                        isDarkMode={isDarkMode}
                        rounded="rounded-lg"
                      />

                      <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                          isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-white border-gray-300 text-slate-500'
                        }`}
                      >
                        {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      </button>

                      <UserMenuChip isDarkMode={isDarkMode} />
                    </div>
                  </div>
                </>
              )}
            </header>

            {/* Horizontal Navigation Bar */}
            <div className={`border-b backdrop-blur-md sticky top-0 z-20 ${isDarkMode ? 'bg-[#111827]/95 border-[#243044]' : 'bg-white/95 border-gray-200'}`}>
              <div className="w-full px-4 sm:px-6 flex justify-center">
                <nav className="flex items-center justify-center gap-1 sm:gap-1.5 overflow-x-auto py-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-700" aria-label="Tabs">
                  {[
                    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                    { id: 'scanner', label: 'Media Scanner', icon: Scan },
                    { id: 'unused', label: 'Unused Files', icon: AlertTriangle },
                    { id: 'used', label: 'Used Files', icon: FolderCheck },
                    { id: 'duplicate', label: 'Duplicate Images', icon: ImageIcon, badge: String(duplicateFilesCount), badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
                    { id: 'image_optimization', label: 'Image Optimization', icon: ImageDown },
                    { id: 'wp_file_manager', label: 'Advance File Manager', icon: FolderOpen, locked: !fileManagerActive },
                    { id: 'trash', label: 'Trash', icon: Trash2 },
                    { id: 'settings', label: 'Settings', icon: Settings },
                  ].filter((tab) => isPageAllowed(tab.id)).map((tab) => {
                    const Icon = tab.icon;
                    const isActive = mainNav === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setMainNav(tab.id as any);
                          setNavLocationFilter('all');
                        }}
                        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 text-[11px] sm:text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'border-[#A61E69] text-[#A61E69] dark:border-[#A61E69] dark:text-pink-400 font-bold'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                        <span>{tab.label}</span>
                        {tab.locked && <ProLockBadge isDarkMode={isDarkMode} />}
                        {tab.badge !== undefined && Number(tab.badge) > 0 && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ${tab.badgeColor || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>

          {/* MAIN PAGE CONTENT BASED ON SELECTED NAV */}
          <main className="p-8 flex-1 space-y-6">
            <ScanProgressBar onReviewUnused={() => setMainNav('unused')} />
            <UnsavedChangesModal
              isOpen={pendingNav !== null}
              isSaving={isSavingBeforeLeave}
              isDarkMode={isDarkMode}
              onSaveAndLeave={() => leaveImageOptimization('save')}
              onDiscardAndLeave={() => leaveImageOptimization('discard')}
              onStay={() => setPendingNav(null)}
            />
            {/* Bulk optimization progress bar is shown here (rendered by the Image Optimization tab through a portal, so it stays visible on every tab) */}
            <div id="imgsentry-optimization-bar-host" className="sticky top-[calc(var(--imgsentry-adminbar-h)+128px)] z-30 empty:hidden" />
            {/* WORDPRESS WELCOME/CLEANUP NOTICE */}
            {!isWelcomeNoticeDismissed && (
              <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-[#243044] rounded-xl p-4 flex items-center justify-between gap-4 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 dark:bg-[#2271b1]/10 text-[#2271b1] dark:text-blue-400 rounded-full flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                      Optimize, compress and organize your WordPress media library with ImgSentry!
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Convert to WebP/AVIF, clean unused attachments, and remove duplicates all in one dashboard.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsWelcomeNoticeDismissed(true);
                    try {
                      localStorage.setItem('imgsentry_welcome_notice_dismissed', 'true');
                    } catch (e) {}
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Dismiss notice"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {(mainNav as string) === 'no_access' && (
              <div className={`rounded-xl border p-8 text-center ${isDarkMode ? 'bg-[#1e293b] border-[#334155] text-[#f8fafc]' : 'bg-white border-gray-200 text-gray-900'}`}>
                <h2 className="text-base font-bold mb-2">You don't have access to any ImgSentry page</h2>
                <p className={`text-sm ${isDarkMode ? 'text-[#94a3b8]' : 'text-gray-500'}`}>
                  Ask a site Administrator to give you access in ImgSentry &gt; Settings &gt; Permissions.
                </p>
              </div>
            )}
            {/* DASHBOARD TAB */}
            {mainNav === 'dashboard' && (
              <ErrorBoundary key="dashboard" componentName="Dashboard" onReset={() => setMainNav('dashboard')}>
                <DashboardOverview
                  mediaList={mediaList}
                  auditLog={auditLog}
                  settings={pluginSettings}
                  scanHistory={scanHistory}
                  onNavigate={(tab, subTab) => {
                    setMainNav(tab as any);
                    setNavLocationFilter('all');
                    if (subTab) {
                      const mapped = mapLegacySubTab(subTab);
                      setSettingsSubTab(mapped);
                      if (tab === 'settings') {
                        try {
                          window.history.replaceState(null, '', '#subtab-' + mapped);
                        } catch (e) {}
                      }
                    }
                  }}
                  onStartScan={handleStartScanExecution}
                  onOpenSmartCleanup={() => setShowSmartCleanup(true)}
                  isDarkMode={isDarkMode}
                  duplicateFilesCount={duplicateFilesCount}
                  duplicateTotalSizeBytes={duplicateTotalSizeBytes}
                  systemStorage={systemStorage}
                  isSystemStorageLoading={isSystemStorageLoading}
                  fmTrashTotalBytes={systemStorage?.trash_fm_bytes}
                />
              </ErrorBoundary>
            )}

            {/* SCANNER TAB MATCHING SCREENSHOT */}
            {mainNav === 'scanner' && (
              <ErrorBoundary key="scanner" componentName="Media Scanner" onReset={() => setMainNav('dashboard')}>
                <MediaScannerTab
                  mediaList={mediaList}
                  settings={pluginSettings}
                  scanHistory={scanHistory}
                  isScanning={isScanning || scanStatus.isRunning}
                  onRestore={(id) => handleRestore(id)}
                  onStartScan={handleStartScanExecution}
                  onNavigateTab={(tab) => setMainNav(tab)}
                  onAddScanHistory={(scan) => setScanHistory(prev => [scan, ...prev])}
                  onUpdateSettings={(newSet) => saveSettingsToServer({ ...pluginSettings, ...newSet })}
                  onNavigateToSettings={handleNavigateToSettings}
                  onExportCSV={(selectedIds) => handleExportCSV('all', selectedIds)}
                  isDarkMode={isDarkMode}
                />
              </ErrorBoundary>
            )}

            {/* WP FILE MANAGER DEMO TAB */}
            {mainNav === 'wp_file_manager' && fileManagerActive && (
              <ErrorBoundary key="wp_file_manager" componentName="Advance File Manager" onReset={() => setMainNav('dashboard')}>
                <Suspense fallback={<TabLoadingFallback title="Loading File Manager..." />}>
                  <WpFileManagerTab isDarkMode={isDarkMode} />
                </Suspense>
              </ErrorBoundary>
            )}

            {/* ADVANCE FILE MANAGER: locked upgrade page (Administrators on a plan without the File Manager) */}
            {mainNav === 'wp_file_manager' && !fileManagerActive && fileManagerPromo && (
              <ErrorBoundary key="wp_file_manager_upsell" componentName="Advance File Manager" onReset={() => setMainNav('dashboard')}>
                <FileManagerUpsell isDarkMode={isDarkMode} />
              </ErrorBoundary>
            )}

            {/* TRASH TAB MATCHING SCREENSHOT EXACTLY */}
            {hasVisitedTrash && (
              <div style={{ display: mainNav === 'trash' ? 'block' : 'none' }}>
                <ErrorBoundary key="trash" componentName="Trash" onReset={() => setMainNav('dashboard')}>
                  <TrashTab
                    mediaList={mediaList}
                    onRestore={(id) => handleRestore(id)}
                    onDeletePermanently={(id) => handleDeletePermanently(id)}
                    onEmptyTrash={handleEmptyTrash}
                    onExportCSV={(selectedIds) => handleExportCSV('trash', selectedIds)}
                    onNavigateToSettings={handleNavigateToSettings}
                    isDarkMode={isDarkMode}
                    settings={pluginSettings}
                    isRefreshing={isRefreshing}
                    onRefresh={handleRefreshData}
                    dataRevision={dataRevision}
                    isActive={mainNav === 'trash'}
                    refreshSignal={trashRefreshSignal}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* UNUSED FILES TAB MATCHING SCREENSHOT EXACTLY */}
            {hasVisitedUnused && (
              <div style={{ display: mainNav === 'unused' ? 'block' : 'none' }}>
                <ErrorBoundary key="unused" componentName="Unused Files" onReset={() => setMainNav('dashboard')}>
                  <UnusedFilesTab
                    mediaList={mediaList}
                    externalSearchQuery={unusedSearchQuery}
                    onMoveToTrash={(id) => handleMoveToTrash(id)}
                    onMoveSelectedToTrash={(ids, force, forceProtected) => handleMoveToTrash(ids, force, forceProtected)}
                    onRefresh={handleRefreshData}
                    isRefreshing={isRefreshing}
                    onNavigateToSettings={handleNavigateToSettings}
                    onExportCSV={(selectedIds) => handleExportCSV('unused', selectedIds)}
                    isDarkMode={isDarkMode}
                    initialLocationFilter={navLocationFilter}
                    selectedIds={selectedIds}
                    setSelectedIds={setSelectedIds}
                    dataRevision={dataRevision}
                    isActive={mainNav === 'unused'}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* USED FILES TAB MATCHING SCREENSHOT EXACTLY */}
            {hasVisitedUsed && (
              <div style={{ display: mainNav === 'used' ? 'block' : 'none' }}>
                <ErrorBoundary key="used" componentName="Used Files" onReset={() => setMainNav('dashboard')}>
                  <UsedFilesTab
                    mediaList={mediaList}
                    externalSearchQuery={usedSearchQuery}
                    onRefresh={handleRefreshData}
                    isRefreshing={isRefreshing}
                    onNavigateToSettings={handleNavigateToSettings}
                    onNavigateToScanner={() => setMainNav('scanner')}
                    onItemRescanned={(updatedItem) => {
                      setMediaList(prev => {
                        const next = prev.map(m => m.id === updatedItem.id ? { ...m, ...updatedItem } : m);
                        // Standalone dev preview only: never store the site's media list in the browser when running inside WordPress.
                        if (import.meta.env.DEV && !(window as any).imgsentry_data && !(window as any).imgsentryData) {
                          try {
                            localStorage.setItem('wp_media_cleaner_list_v3', JSON.stringify(next));
                          } catch (e) {}
                        }
                        return next;
                      });
                    }}
                    onExportCSV={(ids) => handleExportCSV('used', ids)}
                    isDarkMode={isDarkMode}
                    initialLocationFilter={navLocationFilter}
                    selectedIds={selectedIds}
                    setSelectedIds={setSelectedIds}
                    dataRevision={dataRevision}
                    isActive={mainNav === 'used'}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* DUPLICATE IMAGE TAB MATCHING SCREENSHOT */}
            {hasVisitedDuplicate && (
              <div style={{ display: mainNav === 'duplicate' ? 'block' : 'none' }}>
                <ErrorBoundary key="duplicate" componentName="Duplicate Images" onReset={() => setMainNav('dashboard')}>
                  <DuplicateImageTab
                    isDarkMode={isDarkMode}
                    mediaList={mediaList}
                    onCleanMedia={async (idsToRemove) => {
                      // The Duplicate Images page only moves files to Trash (never permanent delete, never forced).
                      const res = await handleMoveToTrash(idsToRemove, false, false, 'duplicates');
                      fetchDuplicateCounts();
                      return res;
                    }}
                    onDuplicatesChanged={fetchDuplicateCounts}
                    onRescan={handleStartScanExecution}
                    registerScanFunction={(fn) => { duplicateScanFnRef.current = fn; }}
                    onScanStateChange={(scanning, progress, statusText) => {
                      setIsScanning(scanning);
                      setScanProgress(progress);
                      if (statusText) setScanStatusText(statusText);

                    }}
                    onNavigateToSettings={handleNavigateToSettings}
                    showExportModal={showDuplicateExport}
                    onCloseExportModal={() => setShowDuplicateExport(false)}
                  />
                </ErrorBoundary>
              </div>
            )}

            {/* IMAGE OPTIMIZATION TAB MATCHING SCREENSHOT */}
            {hasVisitedImageOptimization && (
              <div style={{ display: mainNav === 'image_optimization' ? 'block' : 'none' }}>
                <ErrorBoundary key="image_optimization" componentName="Image Optimization" onReset={() => setMainNav('dashboard')}>
                  <Suspense fallback={<TabLoadingFallback title="Loading Image Optimization..." />}>
                    <ImageOptimizationTab
                      isDarkMode={isDarkMode}
                      mediaList={mediaList}
                      settings={pluginSettings}
                      onAddLog={addLog}
                      onAddDetailedLog={addDetailedLog}
                      onShowToast={showToastMsg}
                      onRegisterActions={setOptActions}
                      onUpdateMediaItem={handleUpdateMediaItem}
                      onNavigateToSettings={handleNavigateToSettings}
                      onNavigateToScanner={() => setMainNav('scanner')}
                      onNavigateToOptimization={() => setMainNav('image_optimization')}
                      onRefreshData={handleRefreshData}
                      onSaveOptimizationSettings={saveOptimizationSettings}
                      onRegisterUnsavedGuard={(guard) => { optUnsavedGuardRef.current = guard; }}
                      onItemRescanned={(updatedItem) => {
                        setMediaList(prev => {
                          const next = prev.map(m => m.id === updatedItem.id ? { ...m, ...updatedItem } : m);
                          // Standalone dev preview only: never store the site's media list in the browser when running inside WordPress.
                          if (import.meta.env.DEV && !(window as any).imgsentry_data && !(window as any).imgsentryData) {
                            try {
                              localStorage.setItem('wp_media_cleaner_list_v3', JSON.stringify(next));
                            } catch (e) {}
                          }
                          return next;
                        });
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}

            {/* REPORTS TAB MATCHING SCREENSHOT EXACTLY */}
            {mainNav === 'reports' && (
              <ErrorBoundary key="reports" componentName="Reports" onReset={() => setMainNav('dashboard')}>
                <Suspense fallback={<TabLoadingFallback title="Loading Reports & Analytics..." />}>
                  <ReportsTab onNotify={(msg, type) => showToastMsg(msg, type)}
                    mediaList={mediaList}
                    scanHistory={scanHistory}
                    onExportReport={handleExportCSV}
                    onNavigateToUsed={(loc) => {
                      setMainNav('used');
                      setNavLocationFilter(loc || 'all');
                    }}
                    onNavigateToUnused={(loc) => {
                      setMainNav('unused');
                      setNavLocationFilter(loc || 'all');
                    }}
                    isDarkMode={isDarkMode}
                    isWpConnected={Boolean(isWordPress)}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {/* SETTINGS TAB */}
            {mainNav === 'settings' && (
              <ErrorBoundary key="settings" componentName="Plugin Settings" onReset={() => setMainNav('dashboard')}>
                <PluginSettingsTab
                  settings={pluginSettings}
                  serverWarnings={serverWarnings}
                  onClearServerWarnings={() => setServerWarnings([])}
                  onSaveSettings={(newSettings) => {
                    saveSettingsToServer(newSettings);
                    addLog('Updated Plugin Settings', 'Saved configuration changes across options tabs.');
                    showToastMsg('Plugin Settings updated successfully!');
                  }}
                  isDarkMode={isDarkMode}
                  activeSubTab={settingsSubTab as any}
                  onSubTabChange={(tab) => setSettingsSubTab(tab as any)}
                  dbStats={dbStats}
                  onCleanPluginData={handleCleanPluginData}
                  onGoToDashboard={() => {
                    setMainNav('dashboard');
                    setNavLocationFilter('all');
                  }}
                  onGoToScanHistory={() => {
                    setMainNav('reports');
                    setNavLocationFilter('all');
                  }}
                  mediaList={mediaList}
                  logs={detailedLogs}
                  onExportLogs={handleExportCSV}
                  onRefreshLogs={handleRefreshData}
                  isRefreshing={isRefreshing}
                  showLogsExport={showLogsExport}
                  onCloseLogsExport={() => setShowLogsExport(false)}
                />
              </ErrorBoundary>
            )}

            {/* HELP TAB */}
            {mainNav === 'help' && (
              <ErrorBoundary key="help" componentName="Help & Support" onReset={() => setMainNav('dashboard')}>
                <HelpSupportTab isDarkMode={isDarkMode} />
              </ErrorBoundary>
            )}
          </main>
        </div>
      </div>

      {/* EMPTY TRASH CONFIRMATION MODAL (TOP BAR TRIGGER) */}
      {showEmptyTrashModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 dark:border-[#243044] overflow-hidden">
            <div className="bg-[#A61E69] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-white" />
                <span>Empty Trash Confirmation</span>
              </div>
              <button 
                onClick={() => setShowEmptyTrashModal(false)} 
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-rose-800 dark:text-rose-200 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">This action cannot be undone!</p>
                  <p className="mt-1 text-rose-700 dark:text-rose-300">
                    The physical files, thumbnail sub-sizes, and all WordPress database attachment records will be permanently erased from disk and database.
                  </p>
                </div>
              </div>

              <p className="text-gray-700 dark:text-slate-300 font-medium">
                Are you sure you want to empty the entire trash? All <strong className="text-rose-600 dark:text-rose-400">{trashedItems.length} files ({formatSize(trashedItems.reduce((acc, i) => acc + (i.fileSize || 0), 0))})</strong> will be permanently deleted from the disk and database.
              </p>

              <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-[#243044]">
                <button
                  onClick={() => setShowEmptyTrashModal(false)}
                  className="flex-1 bg-white hover:bg-gray-100 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 border border-gray-300 dark:border-slate-600 font-bold py-2.5 rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowEmptyTrashModal(false);
                    handleEmptyTrash();
                  }}
                  className="flex-1 bg-[#A61E69] hover:bg-[#8F1B5A] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Yes, Empty Trash</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ALL DANGER CONFIRMATION MODAL */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full shadow-2xl border border-red-200 dark:border-red-900/50 overflow-hidden">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-300" />
                <span>Confirm Destructive Bulk Action</span>
              </div>
              <button onClick={() => setIsDeleteAllModalOpen(false)} className="text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-gray-800 dark:text-slate-200">
              <p className="leading-relaxed">
                You are about to <strong className="text-red-600">
                  {deleteAllTarget === 'trash' ? 'empty the entire Trash Bin' : 'purge ALL media files in your library'}
                </strong>. This operation cannot be undone.
              </p>

              <div className="space-y-2">
                <label className="font-bold block">Type "CONFIRM" to authorize:</label>
                <input
                  type="text"
                  placeholder="CONFIRM"
                  value={deleteAllConfirmInput}
                  onChange={(e) => setDeleteAllConfirmInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-red-300 dark:border-red-800 rounded-xl p-2.5 font-mono text-center font-bold tracking-widest text-red-600 dark:placeholder:text-[#5b6579] focus:ring-2 focus:ring-red-500 outline-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-t border-gray-200 dark:border-[#243044] flex items-center justify-end gap-3">
              <button
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDeleteAllModal}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Execute Bulk Purge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const WpAdminSimulator: React.FC = () => {
  return (
    <ScanStatusProvider>
      <WpAdminSimulatorContent />
    </ScanStatusProvider>
  );
};
