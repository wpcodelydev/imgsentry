export interface MediaItem {
  id: number;
  title: string;
  filename: string;
  url: string;
  fullUrl?: string;
  optimizedUrl?: string;
  thumbUrl?: string;
  previewUrl?: string;
  mimeType: string;
  category: 'images' | 'fonts' | 'documents' | 'audio' | 'video' | 'other';
  extension: string;
  display_extension?: string;
  effective_format?: string;
  displayExtension?: string;
  effectiveFormat?: string;
  fileSize: number; // bytes
  formattedSize: string;
  sizeUnknown?: boolean;
  uploadDate: string;
  dimensions?: string;
  location?: string;
  originalPath?: string;
  original_path?: string;
  isAttached: boolean;
  parentId?: number;
  parentTitle?: string;
  parentType?: string;
  extraUsageCount?: number;
  inUse: boolean;
  useReasons: (string | Record<string, any>)[];
  lastScanTime?: string | null;
  lastScanType?: 'smart' | 'full' | 'cache' | string | null; // smart | full
  isTrashed: boolean;
  trashedDate?: string;
  daysInTrash: number;
  pending?: boolean;

  // Image Optimization Fields
  isOptimized?: boolean;
  externallyOptimized?: boolean;
  optimizationStatus?: 'ready' | 'optimized' | 'large' | 'webp_missing' | 'avif_missing' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  optimizationError?: string;
  originalSizeKB?: number;
  optimizedSizeKB?: number;
  effective_size?: number;
  effectiveSize?: number;
  bytesSaved?: number;
  bytes_saved?: number;
  savingPercent?: number;
  /** Size (bytes), format and saving of the file people actually get: the WebP / AVIF copy when it is smaller, else the main file. Display only. */
  deliveredSizeBytes?: number;
  deliveredPercent?: number;
  deliveredFormat?: string;
  percentSaved?: number;
  percent_saved?: number;
  savingsUnknown?: boolean;
  savings_unknown?: boolean;
  compressionLevel?: 'lossless' | 'balanced' | 'aggressive' | 'custom';
  format?: 'original' | 'webp' | 'avif' | string;
  outputFormat?: string;
  output_format?: string;
  next_gen_formats?: any;
  nextGenFormats?: {
    webp?: boolean;
    avif?: boolean;
    siblingSizeBytes?: number;
    siblingSizeKB?: number;
    siblingFormat?: string;
  };
  backupCreated?: boolean;
  originalFormat?: 'original' | 'webp' | 'avif';
  optimizedAt?: number;
  cachedEstimate?: any;

  // Disk Verification & Sub-Sizes
  fileMissing?: boolean;
  file_missing?: boolean;
  thumbnailSizesBytes?: number;
  thumbnail_sizes_bytes?: number;
  subSizesCount?: number;
  backupSizeBytes?: number;
  backup_size_bytes?: number;
  nextgenSizesBytes?: number;
  nextgen_sizes_bytes?: number;
}

export interface SystemStorageBreakdown {
  active_library_bytes: number;
  active_primary_bytes?: number;
  active_thumbnails_bytes?: number;
  trash_quarantine_bytes: number;
  trash_media_bytes?: number;
  trash_fm_bytes?: number;
  optimization_backups_bytes: number;
  nextgen_siblings_bytes: number;
  nextgen_siblings_count?: number;
  webp_copies_count?: number;
  avif_copies_count?: number;
  calculation_incomplete?: boolean;
}

export interface OptimizedMediaItem extends MediaItem {
  isOptimized?: boolean;
  optimizedFormat?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

export interface ExclusionItem {
  id: string;
  path: string;
  isPreSeeded?: boolean;
  note?: string;
  category?: 'folder' | 'file';
}

export interface FileManagerAclRule {
  id: string;
  subject_type: 'role' | 'user';
  subject_id: string;
  folder_path: string;
  permission_level: 'view' | 'edit' | 'full';
  include_subfolders: boolean;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FileManagerOperationRestriction {
  id: string;
  subject_type: 'role' | 'user';
  subject_id: string;
  forbidden_operations?: string[];
  disabledOperations?: string[];
  disable_toolbar?: boolean;
  disableToolbar?: boolean;
  disable_context_menu?: boolean;
  disableContextMenu?: boolean;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  isExpanded?: boolean;
}

export interface PluginSettings {
  // General
  enablePlugin: boolean;
  defaultScanType: 'smart' | 'full';
  timeZone: string;
  dateFormat: string;
  enableUsageTracking: boolean;
  deleteDataOnUninstall?: boolean;

  // File Manager Settings
  notificationEmail?: string;
  notificationFromEmail?: string;
  enableFileManager?: boolean;
  showFileManagerPromo?: boolean;
  fileManagerViewMode?: 'list' | 'grid';
  fileManagerTheme?: 'light' | 'dark' | 'auto';
  fileManagerMaxUploadMB?: number;
  fileManagerAllowedRoles?: string[];
  fileManagerAllowedDbRoles?: string[];
  fileManagerPrivateFolderAccess?: string;
  fileManagerNotifyOnUpload?: boolean;
  fileManagerNotifyOnDownload?: boolean;
  fileManagerNotifyOnEdit?: boolean;
  fileManagerNotifyOnChanges?: boolean;
  fileManagerDisableLocalFs?: boolean;
  fileManagerDisableDbManager?: boolean;
  fileManagerAclRules?: FileManagerAclRule[];
  fileManagerGlobalHiddenPaths?: string;
  fileManagerGlobalLockedExtensions?: string;

  // Included File Types
  includeImages: boolean;
  includeVideos: boolean;
  includeDocuments: boolean;
  includeAudio: boolean;
  includeSvg: boolean;
  includeOthers: boolean;

  // Global Exclusions
  excludedFolders: ExclusionItem[];
  excludedFiles: ExclusionItem[];

  // Detection & Deletion
  autoPurgeTrashEnabled?: boolean;
  retentionDays: number;
  fmAutoPurgeTrashEnabled?: boolean;
  fmTrashRetentionDays?: number;
  minFileAgeDays?: number;
  autoTrashUnusedFiles?: boolean;

  // Backup & Safety
  autoBackupBeforeDelete?: boolean;
  generateBackupBeforeOptimization?: boolean;
  backupDirectory?: string;
  backupRetentionDays?: number;
  cloudFallbackEnabled?: boolean;
  cloudFallbackDailyCap?: number;

  // Optimization Automation
  autoOptimizeOnUpload?: boolean;

  // Next-Gen Image Delivery
  displayNextGenFormat?: boolean;
  nextGenFormat?: 'off' | 'webp' | 'avif';
  defaultCompressionLevel?: 'lossless' | 'balanced' | 'aggressive' | 'custom';
  defaultCompressionQuality?: number;
  nextGenDeliveryMethod?: 'picture' | 'rewrite';
  cdnUrl?: string;

  // Performance
  memoryLimit: string;

  // Notifications

  // Security & Logs
  restrictToAdmins: boolean;
  nonceVerification: boolean;
  logLevel: 'info' | 'debug' | 'error';

  // Scheduled Scan
  enableScheduledScan?: boolean;
  scheduledScanFrequency?: number;
  scheduledScanTime?: string;
  actual_memory_limit?: string;

  // Integrations
  /** Extra post-meta keys that hold image IDs (searched during scans). */
  customMetaKeys?: string[];
  /** https URL called when a scan finishes. Empty = off. */
  webhookUrl?: string;
  /** Typed secret. Always '' from the server: an empty field keeps the stored secret. */
  webhookSecret?: string;
  /** Read-only (server): a secret is stored. */
  webhookSecretSet?: boolean;
  /** UI only: remove the stored secret on the next save. */
  webhookSecretClear?: boolean;
  /** Read-only (server): detected plugins. Never posted back. */
  integrations?: IntegrationInfo[];
}

export interface IntegrationInfo {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'builtin';
  desc: string;
}

export interface ScanHistoryEntry {
  id: string;
  timestamp: string;
  formattedDate: string;
  scanType: string;
  totalScanned: number;
  unusedCount: number;
  deletedCount: number;
  unusedSizeBytes: number;
  formattedUnusedSize: string;
  usedCount?: number;
  usedSizeBytes?: number;
  formattedUsedSize?: string;
  durationSeconds: number;
  status: 'completed' | 'failed' | 'in_progress';
  isManual?: boolean;
  triggered_by?: 'scheduled' | 'manual';
}

export interface DashboardTotals {
  totalCount: number;
  usedCount: number;
  unusedCount: number;
  trashedCount: number;
  totalSizeBytes: number;
  usedSizeBytes: number;
  unusedSizeBytes: number;
  trashedSizeBytes: number;
  categorySizes?: Record<string, number>;
  fileTypeCounts?: Record<string, number>;
  optimization?: {
    optimizedCount: number;
    totalBytesSaved: number;
  };
  lastScannedAt?: string | null;
  lastScanHuman?: string;
  isScanRunning?: boolean;
}

export interface BackupMappingRecord {
  originalId: number | string;
  originalPath: string;
  backupPath: string;
  optimizedPath?: string;
  createdDate: string;
  status: 'backup_created' | 'restored' | 'purged';
}

export interface PluginFile {
  path: string;
  name: string;
  category: string;
  language: string;
  content: string;
}

export interface LogItem {
  id: string;
  time: string;
  level: string;
  levelBg?: string;
  type: string;
  source: string;
  boldText: string;
  subText: string;
  user: string;
  ip: string;
  objectId?: number | null;
  userAgent?: string;
  details?: string;
}

export interface LogStats {
  total: number;
  info: number;
  success: number;
  warning: number;
  error: number;
  critical: number;
  topSources?: Array<{ source: string; count: number; percentage: number }>;
  timeline?: Array<{ date: string; count: number }>;
}

export interface UsageCheckLocation {
  post_id?: number | null;
  title: string;
  name?: string;
  type: string;
  field_type?: string;
  field_label?: string;
  display: string;
  edit_url?: string | null;
}

export interface UsageCheckItem {
  attachment_id: number;
  title: string;
  filename: string;
  is_used: boolean;
  usage_count: number;
  locations: UsageCheckLocation[];
  last_scanned_at?: string | null;
}

export interface UsageCheckResult {
  items: UsageCheckItem[];
  last_scan_time: string | null;
  last_scan_formatted: string;
  total_checked: number;
  used_count: number;
  unused_count: number;
}