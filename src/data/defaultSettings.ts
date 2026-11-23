import { PluginSettings, ScanHistoryEntry } from '../types';
import { DEFAULT_EXCLUDED_FOLDERS, DEFAULT_EXCLUDED_FILES } from '../utils/exclusionEngine';

const getBrowserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const INITIAL_PLUGIN_SETTINGS: PluginSettings = {
  // General
  enablePlugin: true,
  defaultScanType: 'smart',
  timeZone: getBrowserTimeZone(),
  dateFormat: 'May 24, 2024 10:30 AM',
  enableUsageTracking: true,
  deleteDataOnUninstall: false,

  // File Types
  includeImages: true,
  includeVideos: true,
  includeDocuments: true,
  includeAudio: true,
  includeSvg: true,
  includeOthers: true,

  // Global Exclusions
  excludedFolders: DEFAULT_EXCLUDED_FOLDERS,
  excludedFiles: DEFAULT_EXCLUDED_FILES,

  // Detection & Deletion
  autoPurgeTrashEnabled: true,
  retentionDays: 7,
  fmAutoPurgeTrashEnabled: false,
  fmTrashRetentionDays: 7,
  minFileAgeDays: 7,
  autoTrashUnusedFiles: false,

  // Backup & Safety
  autoBackupBeforeDelete: false,
  generateBackupBeforeOptimization: true,
  backupDirectory: 'wp-content/uploads/imgsentry/backups/',
  backupRetentionDays: 0, // 0 = keep until I delete them (matches PHP default)

  // Server outage fallback (optimize on the user's own site when the ImgSentry server is unreachable)
  cloudFallbackEnabled: true,
  cloudFallbackDailyCap: 200,

  // Optimization Automation
  autoOptimizeOnUpload: false,

  // Next-Gen Image Delivery
  displayNextGenFormat: false,
  nextGenFormat: 'webp',
  defaultCompressionLevel: 'balanced',
  defaultCompressionQuality: 78,
  nextGenDeliveryMethod: 'picture',
  cdnUrl: '',

  // Performance
  memoryLimit: '512MB',

  // Notifications

  // Security & Logs
  restrictToAdmins: true,
  nonceVerification: true,
  logLevel: 'info',

  // Scheduled Scan
  enableScheduledScan: false,
  scheduledScanFrequency: 7,
  scheduledScanTime: '02:00',

  // Global File Manager Security
  fileManagerGlobalHiddenPaths: 'wp-config.php|.htaccess|.env|.git|wp-content/themes|wp-content/plugins|wp-content/uploads/imgsentry',
  fileManagerGlobalLockedExtensions: '.php|.htaccess|.env|.sh|.sql',
  // Preview only: on a real site the server value (default OFF) is used.
  enableFileManager: true,
  showFileManagerPromo: true,
  fileManagerTheme: 'light',
  fileManagerViewMode: 'list',
  fileManagerMaxUploadMB: 50,
  fileManagerPrivateFolderAccess: '',
  fileManagerNotifyOnUpload: false,
  fileManagerNotifyOnDownload: false,
  fileManagerNotifyOnEdit: false,
  fileManagerNotifyOnChanges: false,
  notificationEmail: '',
  notificationFromEmail: '',
  customMetaKeys: [],
  webhookUrl: '',
  webhookSecret: '',
};

export const INITIAL_SCAN_HISTORY: ScanHistoryEntry[] = [
  {
    id: 'scan-104',
    timestamp: '2026-07-28 10:30:15',
    formattedDate: 'Today at 10:30 AM',
    scanType: 'Smart Scan',
    totalScanned: 8347,
    unusedCount: 1523,
    deletedCount: 1370,
    unusedSizeBytes: 851865600, // ~812.4 MB
    formattedUnusedSize: '812.4 MB',
    durationSeconds: 14.2,
    status: 'completed',
    isManual: false
  },
  {
    id: 'scan-103',
    timestamp: '2026-07-21 09:15:00',
    formattedDate: '7 days ago',
    scanType: 'Deep Scan',
    totalScanned: 8210,
    unusedCount: 1780,
    deletedCount: 1602,
    unusedSizeBytes: 985658880, // ~940 MB
    formattedUnusedSize: '940.0 MB',
    durationSeconds: 28.6,
    status: 'completed',
    isManual: false
  },
  {
    id: 'scan-102',
    timestamp: '2026-07-14 14:00:22',
    formattedDate: '14 days ago',
    scanType: 'Quick Scan',
    totalScanned: 8100,
    unusedCount: 1205,
    deletedCount: 1084,
    unusedSizeBytes: 650117120, // ~620 MB
    formattedUnusedSize: '620.0 MB',
    durationSeconds: 8.4,
    status: 'completed',
    isManual: true
  },
  {
    id: 'scan-101',
    timestamp: '2026-07-07 11:45:10',
    formattedDate: '21 days ago',
    scanType: 'Smart Scan',
    totalScanned: 7950,
    unusedCount: 1100,
    deletedCount: 990,
    unusedSizeBytes: 545259520, // ~520 MB
    formattedUnusedSize: '520.0 MB',
    durationSeconds: 12.1,
    status: 'completed',
    isManual: false
  },
];
