import { CloudBackupSettings } from './CloudBackupSettings';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Settings, 
  Scan, 
  FolderArchive, 
  FolderCheck,
  Trash2, 
  Zap, 
  Bell, 
  ShieldCheck, 
  SlidersHorizontal, 
  Save, 
  CheckCircle, 
  ExternalLink, 
  BookOpen, 
  MessageSquare,
  RotateCcw,
  Plus,
  Headphones,
  Globe,
  Shield,
  Info,
  Lock,
  FolderTree,
  Folder,
  FileCode,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  X,
  LayoutDashboard,
  HelpCircle,
  Clock,
  Check,
  List,
  Grid,
  FolderOpen,
  FolderSearch,
  User,
  Users,
  Key,
  Eye,
  Edit3,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  Mail
} from 'lucide-react';
import { HelpSupportTab } from './HelpSupportTab';
import PermissionsManager from './PermissionsManager';
import { PluginSettings, ExclusionItem, MediaItem, LogItem, FileManagerAclRule, FileManagerOperationRestriction } from '../types';
import { 
  DEFAULT_EXCLUDED_FOLDERS, 
  DEFAULT_EXCLUDED_FILES, 
  ALWAYS_PROTECTED_REASONS,
  normalizePath
} from '../utils/exclusionEngine';
import { 
  INTERNATIONAL_TIMEZONES, 
  formatDateWithTimeZone
} from '../utils/timeZoneUtils';
import { FolderBrowserModal, getAllServerDirectoryPaths } from './FolderBrowserModal';
import { MediaPickerModal } from './MediaPickerModal';
import { ExclusionConfirmModal } from './ExclusionConfirmModal';
import { CleanPluginDataModal } from './CleanPluginDataModal';
import { ResetConfirmModal } from './ResetConfirmModal';
import { AutoTrashDependencyModal } from './AutoTrashDependencyModal';
import { ScanFileTypesRequiredModal } from './ScanFileTypesRequiredModal';
import { BroadPatternWarningModal } from './BroadPatternWarningModal';
import { UninstallDataWarningModal } from './UninstallDataWarningModal';
import { ToggleSwitch } from './ToggleSwitch';
import { INITIAL_PLUGIN_SETTINGS } from '../data/defaultSettings';
import { MOCK_INTEGRATIONS } from '../data/mockIntegrations';
import { getProFeatures, ProLockBadge, UpgradePromptModal } from './ProLock';

import { LogsTab } from './LogsTab';
import { ScheduledActionsTab } from './ScheduledActionsTab';

const TAB_NAMES: Record<string, string> = {
  general: 'General',
  scan: 'Scan',
  schedule: 'Schedule',
  auto: 'Auto Clean',
  exclusions: 'Exclusions',
  permissions: 'Permissions',
  file_manager: 'File Manager',
  advanced: 'Optimization',
  integrations: 'Integrations',
};

// Scan File Types switches. At least one of them must stay on, otherwise a scan has nothing to check.
const SCAN_FILE_TYPE_KEYS: (keyof PluginSettings)[] = [
  'includeImages',
  'includeDocuments',
  'includeVideos',
  'includeAudio',
  'includeSvg',
  'includeOthers',
];

const TAB_FIELD_KEYS: Record<string, (keyof PluginSettings)[]> = {
  general: [
    'timeZone',
    'dateFormat',
    'enablePlugin',
    'enableUsageTracking',
    'deleteDataOnUninstall',
    'notificationEmail',
    'notificationFromEmail',
    'enableFileManager',
    'showFileManagerPromo',
  ],
  scan: [
    'defaultScanType',
    'includeImages',
    'includeDocuments',
    'includeVideos',
    'includeAudio',
    'includeSvg',
    'includeOthers',
  ],
  schedule: [
    'enableScheduledScan',
    'scheduledScanFrequency',
    'scheduledScanTime',
  ],
  auto: [
    'autoTrashUnusedFiles',
    'autoPurgeTrashEnabled',
    'retentionDays',
    'fmAutoPurgeTrashEnabled',
    'fmTrashRetentionDays',
    'minFileAgeDays',
  ],
  exclusions: [
    'excludedFolders',
    'excludedFiles',
  ],
  permissions: [
    'restrictToAdmins',
    'nonceVerification',
    'logLevel',
  ],
  file_manager: [
    'fileManagerViewMode',
    'fileManagerTheme',
    'fileManagerMaxUploadMB',
    'fileManagerAllowedDbRoles',
    'fileManagerPrivateFolderAccess',
    'fileManagerNotifyOnUpload',
    'fileManagerNotifyOnDownload',
    'fileManagerNotifyOnEdit',
    'fileManagerNotifyOnChanges',
    'fileManagerDisableLocalFs',
    'fileManagerDisableDbManager',
    'fileManagerAclRules',
  ],
  advanced: [
    'autoOptimizeOnUpload',
    'generateBackupBeforeOptimization',
    'nextGenFormat',
    'defaultCompressionLevel',
    'defaultCompressionQuality',
    'displayNextGenFormat',
    'nextGenDeliveryMethod',
    'cdnUrl',
    'backupDirectory',
    'backupRetentionDays',
    'cloudFallbackEnabled',
    'cloudFallbackDailyCap',
    'autoBackupBeforeDelete',
  ],
  integrations: ['customMetaKeys', 'webhookUrl', 'webhookSecret', 'webhookSecretClear'],
};

/**
 * Must match ImgSentry_FM_Operation_Restrictions::ALLOWED_OPERATIONS
 */
export interface OperationItem {
  key: string;
  label: string;
  note?: string;
}

export interface OperationGroup {
  label: string;
  items: OperationItem[];
}

export const OPERATION_GROUPS: OperationGroup[] = [
  {
    label: "Creation",
    items: [
      { key: 'upload', label: 'Upload', note: 'Uploading a folder that needs new sub-folders also requires Make Directory.' },
      { key: 'mkfile', label: 'Make File' },
      { key: 'mkdir', label: 'Make Directory' },
      { key: 'duplicate', label: 'Duplicate' },
    ]
  },
  {
    label: "Editing & Modification",
    items: [
      { key: 'edit', label: 'Edit', note: 'The code editor opens in read-only mode.' },
      { key: 'rename', label: 'Rename' },
      { key: 'cut', label: 'Cut (Move)' },
      { key: 'copy', label: 'Copy' },
      { key: 'paste', label: 'Paste (hides button only)' },
      { key: 'resize', label: 'Resize' },
    ]
  },
  {
    label: "Removal & Purging",
    items: [
      { key: 'delete', label: 'Delete', note: 'Moves items to the Trash. Also blocks Empty Folder.' },
      { key: 'trash', label: 'Trash Bin', note: 'Controls opening the Trash Bin and restoring items. Moving files to the trash is controlled by Delete.' },
    ]
  },
  {
    label: "Archive Compression",
    items: [
      { key: 'archive', label: 'Archive', note: 'Also blocks downloading folders or several files at once, because they are zipped.' },
      { key: 'extract', label: 'Extract' },
    ]
  },
  {
    label: "Visibility & Retrieval",
    items: [
      { key: 'info', label: 'Info', note: 'Blocks folder size and file hash only. The Info window still opens.' },
      { key: 'search', label: 'Search' },
      { key: 'download', label: 'Download', note: 'Blocks the download action only. Does not hide direct file URLs.' },
    ]
  }
];

const VALID_OPERATION_KEYS = new Set<string>(
  OPERATION_GROUPS.flatMap(g => g.items.map(i => i.key))
);

export interface ServerWarning {
  code: string;
  message: string;
  applied?: string;
}

interface PluginSettingsTabProps {
  serverWarnings?: ServerWarning[];
  onClearServerWarnings?: () => void;
  settings: PluginSettings;
  onSaveSettings: (newSettings: PluginSettings) => void | boolean | Promise<void | boolean>;
  isDarkMode?: boolean;
  activeSubTab?: 'general' | 'scan' | 'schedule' | 'auto' | 'exclusions' | 'permissions' | 'file_manager' | 'notifications' | 'advanced' | 'integrations' | 'logs' | 'scheduled_actions' | 'help';
  onSubTabChange?: (tab: 'general' | 'scan' | 'schedule' | 'auto' | 'exclusions' | 'permissions' | 'file_manager' | 'notifications' | 'advanced' | 'integrations' | 'logs' | 'scheduled_actions' | 'help') => void;
  dbStats?: {
    mediaCleanerDataMb: number;
    logDataMb: number;
    totalCleanableGb: number;
    dbOrphmetaMb?: number;
    thumbsCacheMb?: number;
    lastCleanedDate?: string | null;
  };
  onCleanPluginData?: (options: {
    cleanScans: boolean;
    cleanLogs: boolean;
    cleanTransients: boolean;
    cleanOrphanedMeta: boolean;
    cleanThumbsCache?: boolean;
  }) => void | Promise<void>;
  onGoToDashboard?: () => void;
  onGoToScanHistory?: () => void;
  mediaList?: MediaItem[];
  logs?: LogItem[];
  onExportLogs?: () => void;
  onRefreshLogs?: () => void;
  isRefreshing?: boolean;
  showLogsExport?: boolean;
  onCloseLogsExport?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const normalizeDefaultScanType = (val?: string | null): 'smart' | 'full' => {
  if (val === 'deep' || val === 'full') {
    return 'full';
  }
  if (val === 'quick' || val === 'smart') {
    return 'smart';
  }
  return 'smart';
};

export const PluginSettingsTab: React.FC<PluginSettingsTabProps> = ({
  settings,
  onSaveSettings,
  serverWarnings = [],
  onClearServerWarnings,
  isDarkMode = false,
  activeSubTab: propActiveSubTab,
  onSubTabChange,
  dbStats = { mediaCleanerDataMb: 12.8, logDataMb: 8.4, totalCleanableGb: 2.1, dbOrphmetaMb: 0.8, thumbsCacheMb: 12.5, lastCleanedDate: null },
  onCleanPluginData,
  onGoToDashboard,
  onGoToScanHistory,
  mediaList,
  logs,
  onExportLogs,
  onRefreshLogs,
  isRefreshing,
  showLogsExport,
  onCloseLogsExport,
  onShowToast,
}) => {
  const [formData, setFormData] = useState<PluginSettings>(() => ({
    ...settings,
    defaultScanType: normalizeDefaultScanType(settings?.defaultScanType),
  }));
  const [localWarnings, setLocalWarnings] = useState<ServerWarning[]>(serverWarnings || []);
  useEffect(() => {
    setLocalWarnings(serverWarnings || []);
  }, [serverWarnings]);
  const [localActiveSubTab, setLocalActiveSubTab] = useState<
    'general' | 'scan' | 'schedule' | 'auto' | 'exclusions' | 'permissions' | 'file_manager' | 'notifications' | 'advanced' | 'integrations' | 'logs' | 'scheduled_actions' | 'help'
  >('general');

  const pro = getProFeatures();
  // File Manager shows only for the Professional plan AND when the Administrator switched it ON (saved value).
  const fmActive = pro.features.file_manager && Boolean(settings.enableFileManager);
  const proAutoPurgeLocked = !pro.features.trash_auto_purge;
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  // "Auto-Optimize images on upload" is available on every plan.
  const autoOptimizeOn = Boolean(formData.autoOptimizeOnUpload);
  // "Scheduled Scan" and "Auto-Trash Unused Files" are Business / Professional features.
  const proScheduledScanLocked = !pro.features.scheduled_scan;
  const proAutoTrashLocked = !pro.features.auto_trash_unused;
  const [scheduledScanUpgradeOpen, setScheduledScanUpgradeOpen] = useState(false);
  const [autoTrashUpgradeOpen, setAutoTrashUpgradeOpen] = useState(false);
  // The scan webhook is a Business / Professional feature.
  const proWebhookLocked = !pro.features.webhook;
  const [webhookUpgradeOpen, setWebhookUpgradeOpen] = useState(false);

  const [exclusionTab, setExclusionTab] = useState<'folders' | 'files'>('folders');
  const [newExclusionInput, setNewExclusionInput] = useState('');
  const [showAddExclusionInput, setShowAddExclusionInput] = useState(false);
  const [fetchedRoles, setFetchedRoles] = useState<{slug: string, label: string}[]>([]);
  const [exclusionError, setExclusionError] = useState<string | null>(null);
  useEffect(() => {
    const imgsentryData = (window as any).imgsentry_data || (window as any).imgsentryData;
    if (imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const fd = new FormData();
      fd.append('action', 'imgsentry_fm_get_roles');
      fd.append('nonce', imgsentryData.nonce);
      fetch(ajaxUrl, { method: 'POST', body: fd })
        .then(res => res.json())
        .then(json => {
          if (json.success && json.data && json.data.roles) {
            setFetchedRoles(json.data.roles);
          }
        })
        .catch(console.error);
    }
  }, []);

  const [fmActiveTab, setFmActiveTab] = useState<'general' | 'code' | 'users' | 'roles' | 'folders'>('general');

  // Read initial code editor settings from canonical localized backend data (window.imgSentryFmData.settings) or fallback
  const getInitialCodeEditorSettings = () => {
    const win = typeof window !== 'undefined' ? (window as any) : {};
    const backendFmSettings =
      win.imgSentryFmData?.settings?.codeEditorSettings ||
      win.imgSentryFmData?.settings ||
      {};

    return {
      theme: (backendFmSettings.theme || backendFmSettings.codeEditorTheme || 'dark') as 'light' | 'dark' | 'monokai' | 'dracula' | 'solarized',
      fullscreen: Boolean(backendFmSettings.fullscreen ?? backendFmSettings.codeEditorFullscreen ?? false),
      font_size: Number(backendFmSettings.font_size ?? backendFmSettings.codeEditorFontSize ?? 14),
      tab_size: String(backendFmSettings.tab_size ?? backendFmSettings.codeEditorTabSize ?? '4') as '2' | '4' | 'tab',
      code_folding: Boolean(backendFmSettings.code_folding ?? backendFmSettings.codeEditorFolding ?? true),
    };
  };

  const initialCodeSettings = getInitialCodeEditorSettings();
  const [codeEditorTheme, setCodeEditorTheme] = useState<'light' | 'dark' | 'monokai' | 'dracula' | 'solarized'>(initialCodeSettings.theme);
  const [codeEditorFullscreen, setCodeEditorFullscreen] = useState(initialCodeSettings.fullscreen);
  const [codeEditorFontSize, setCodeEditorFontSize] = useState(initialCodeSettings.font_size);
  const [codeEditorTabSize, setCodeEditorTabSize] = useState<'2' | '4' | 'tab'>(initialCodeSettings.tab_size);
  const [codeEditorFolding, setCodeEditorFolding] = useState(initialCodeSettings.code_folding);
  const [savedCodeSettings, setSavedCodeSettings] = useState(initialCodeSettings);
  const [isSavingCodeEditor, setIsSavingCodeEditor] = useState(false);

  // Sync with global localized settings on mount if available
  useEffect(() => {
    const loaded = getInitialCodeEditorSettings();
    setCodeEditorTheme(loaded.theme);
    setCodeEditorFullscreen(loaded.fullscreen);
    setCodeEditorFontSize(loaded.font_size);
    setCodeEditorTabSize(loaded.tab_size);
    setCodeEditorFolding(loaded.code_folding);
    setSavedCodeSettings(loaded);
  }, []);

  // Operation Restrictions State (Shared between Role & User Restrictions)
  const [operationRestrictions, setOperationRestrictions] = useState<FileManagerOperationRestriction[]>([]);
  const [initialOperationRestrictions, setInitialOperationRestrictions] = useState<FileManagerOperationRestriction[]>([]);
  const [isLoadingRestrictions, setIsLoadingRestrictions] = useState<boolean>(false);
  const [isSavingRestrictions, setIsSavingRestrictions] = useState<boolean>(false);

  const [expandedFolderRules, setExpandedFolderRules] = useState<Record<string, boolean>>({});
  const [initialAclRules, setInitialAclRules] = useState<FileManagerAclRule[]>([]);
  const [isLoadingAclRules, setIsLoadingAclRules] = useState<boolean>(false);
  const [isSavingAclRules, setIsSavingAclRules] = useState<boolean>(false);

  // WordPress Real Users State (Shared between User Restrictions & Folder Access tabs)
  const getInitialWpUsers = (): Array<{ id: number; username: string; display_name: string }> => {
    const win = typeof window !== 'undefined' ? (window as any) : {};
    const localized = win.imgsentry_data?.users || win.imgSentryFmData?.users;
    if (Array.isArray(localized) && localized.length > 0) {
      return localized;
    }
    return [];
  };

  const [wpUsers, setWpUsers] = useState<Array<{ id: number; username: string; display_name: string }>>(getInitialWpUsers);
  const [isLoadingWpUsers, setIsLoadingWpUsers] = useState<boolean>(false);

  // Keep the newest toast function in a ref, so the loaders below do not run again every time the parent re-renders.
  const onShowToastRef = useRef(onShowToast);
  onShowToastRef.current = onShowToast;

  const fetchWpUsers = useCallback(async () => {
    setIsLoadingWpUsers(true);
    try {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      const ajaxUrl =
        win.imgSentryFmData?.ajax_url ||
        win.imgsentry_data?.ajax_url ||
        win.imgsentryData?.ajax_url ||
        win.ajaxurl;

      if (!ajaxUrl) {
        return;
      }

      const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';
      const payload = new URLSearchParams();
      payload.append('action', 'imgsentry_fm_get_users');
      if (nonce) {
        payload.append('_ajax_nonce', nonce);
        payload.append('nonce', nonce);
      }

      const res = await fetch(`${ajaxUrl}?${payload.toString()}`, {
        method: 'GET',
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        return;
      }

      const data = await res.json();
      if (data && data.success && Array.isArray(data.data?.users)) {
        setWpUsers(data.data.users);
        if (data.data.truncated && onShowToastRef.current) {
          onShowToastRef.current('This site has a very large number of users. Only the first 1000 are listed.', 'info');
        }
      }
    } catch {
      // Ignore network errors in standalone preview mode
    } finally {
      setIsLoadingWpUsers(false);
    }
  }, []);

  // Folder Tree Browser State
  const [folderBrowser, setFolderBrowser] = useState<{ isOpen: boolean; targetRuleId: string | null; selectedPath?: string; searchTerm?: string; customPath?: string; activeTab?: 'tree' | 'custom' }>({ isOpen: false, targetRuleId: null, selectedPath: 'wp-content/uploads', searchTerm: '', customPath: '', activeTab: 'tree' });
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({ 'wp-content': true, 'wp-content/uploads': true });
  const MOCK_FOLDERS = ['wp-content', 'wp-content/uploads', 'wp-content/uploads/2026', 'wp-content/themes', 'wp-admin'];

  // Fetch ACL rules from backend database
  const fetchAclRules = useCallback(async () => {
    setIsLoadingAclRules(true);
    try {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      const ajaxUrl =
        win.imgSentryFmData?.ajax_url ||
        win.imgsentry_data?.ajax_url ||
        win.imgsentryData?.ajax_url ||
        win.ajaxurl;

      // In standalone/dev preview mode without a WordPress AJAX endpoint, check localStorage
      if (!ajaxUrl) {
        if (typeof window !== 'undefined') {
          const localJson = localStorage.getItem('imgsentry_fm_acl_rules');
          if (localJson) {
            try {
              const localRules = JSON.parse(localJson);
              if (Array.isArray(localRules) && localRules.length > 0) {
                setFormData(prev => ({ ...prev, fileManagerAclRules: localRules }));
                setInitialAclRules(localRules);
              }
            } catch {
              // ignore
            }
          }
        }
        return;
      }

      const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';
      const payload = new URLSearchParams();
      payload.append('action', 'imgsentry_fm_acl_get_rules');
      if (nonce) {
        payload.append('_ajax_nonce', nonce);
        payload.append('nonce', nonce);
      }

      const res = await fetch(`${ajaxUrl}?${payload.toString()}`, {
        method: 'GET',
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        // On a real site never show an old browser copy of the rules as if it were current.
        if (onShowToastRef.current) {
          onShowToastRef.current('Could not load the folder access rules from the server. The list shown may be out of date.', 'error');
        }
        return;
      }

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }

      if (data && data.success && Array.isArray(data.data?.rules)) {
        const dbRules: FileManagerAclRule[] = data.data.rules.map((r: any) => ({
          id: String(r.id),
          subject_type: r.subject_type,
          subject_id: r.subject_id,
          folder_path: r.folder_path,
          permission_level: r.permission_level,
          include_subfolders: Boolean(r.include_subfolders),
          created_by: r.created_by,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));
        setFormData(prev => ({ ...prev, fileManagerAclRules: dbRules }));
        setInitialAclRules(dbRules);
        if (typeof window !== 'undefined') {
          localStorage.setItem('imgsentry_fm_acl_rules', JSON.stringify(dbRules));
        }
      }
    } catch {
      // Soft fallback for standalone/offline preview without throwing unhandled exceptions
    } finally {
      setIsLoadingAclRules(false);
    }
  }, []);

  // Save ACL rules to backend database
  const handleSaveAclRules = async (currentRules?: FileManagerAclRule[]) => {
    const rulesToSave = currentRules ?? (formData.fileManagerAclRules ?? []);

    // Validate empty folder paths
    const invalid = rulesToSave.filter(r => !r.folder_path || r.folder_path.trim() === '');
    if (invalid.length > 0) {
      if (onShowToast) {
        onShowToast('Please provide a folder path for all rules before saving.', 'error');
      }
      return false;
    }

    setIsSavingAclRules(true);
    const win = typeof window !== 'undefined' ? (window as any) : {};
    const ajaxUrl =
      win.imgSentryFmData?.ajax_url ||
      win.imgsentry_data?.ajax_url ||
      win.imgsentryData?.ajax_url ||
      win.ajaxurl;
    const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';

    try {
      const nextRules = [...rulesToSave];

      for (let i = 0; i < nextRules.length; i++) {
        const rule = nextRules[i];
        const isPersistedId = /^\d+$/.test(rule.id);

        let data: any = null;

        if (ajaxUrl) {
          const payload = new FormData();
          payload.append('action', 'imgsentry_fm_acl_save_rule');
          if (nonce) {
            payload.append('_ajax_nonce', nonce);
            payload.append('nonce', nonce);
          }

          // If it's a persisted numeric ID, send it for update; if client-generated id like "folder-rule-...", omit id to insert
          if (isPersistedId) {
            payload.append('id', rule.id);
          }

          payload.append('subject_type', rule.subject_type);
          payload.append('subject_id', rule.subject_id);
          payload.append('folder_path', rule.folder_path);
          payload.append('permission_level', rule.permission_level);
          payload.append('include_subfolders', rule.include_subfolders ? '1' : '0');

          let responseStatus = 0;
          try {
            const res = await fetch(ajaxUrl, {
              method: 'POST',
              body: payload,
            });
            responseStatus = res.status;
            const text = await res.text();
            try {
              data = JSON.parse(text);
            } catch {
              data = null;
            }
          } catch {
            throw new Error('Could not reach the server. The folder rules were not saved.');
          }
          if (!data) {
            throw new Error(`The server sent an unexpected answer (HTTP ${responseStatus}). The folder rules were not saved.`);
          }
        }

        // Standalone preview fallback: only when there is no WordPress endpoint at all
        if (!data && !ajaxUrl) {
          const generatedId = isPersistedId ? rule.id : String(Date.now() + i);
          data = {
            success: true,
            data: {
              rule: {
                id: generatedId,
                subject_type: rule.subject_type,
                subject_id: rule.subject_id,
                folder_path: rule.folder_path,
                permission_level: rule.permission_level,
                include_subfolders: Boolean(rule.include_subfolders),
                created_by: 1,
                created_at: rule.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            }
          };
        }

        if (data && data.success && data.data?.rule) {
          const newId = String(data.data.rule.id);
          const oldId = rule.id;

          nextRules[i] = {
            id: newId,
            subject_type: data.data.rule.subject_type,
            subject_id: data.data.rule.subject_id,
            folder_path: data.data.rule.folder_path,
            permission_level: data.data.rule.permission_level,
            include_subfolders: Boolean(data.data.rule.include_subfolders),
            created_by: data.data.rule.created_by,
            created_at: data.data.rule.created_at,
            updated_at: data.data.rule.updated_at,
          };

          // Preserve card expanded/collapsed state under the new DB id
          if (oldId !== newId) {
            setExpandedFolderRules(prev => {
              if (prev[oldId] === undefined) return prev;
              const updated = { ...prev };
              updated[newId] = updated[oldId];
              delete updated[oldId];
              return updated;
            });
          }
        } else {
          // Rule failed - persist in React state any earlier rules that succeeded so far to avoid duplicate inserts on retry
          setFormData(prev => ({ ...prev, fileManagerAclRules: nextRules }));
          throw new Error(`Rule #${i + 1} (${rule.folder_path || 'unnamed'}): ${data?.data?.message || 'Failed to save'}`);
        }
      }

      // The server keeps one rule per user/role and folder, so two rows can come back with the same id: keep the last one.
      const savedIds = nextRules.map((r) => r.id);
      const uniqueRules = nextRules.filter((r, idx) => savedIds.lastIndexOf(r.id) === idx);
      setFormData(prev => ({ ...prev, fileManagerAclRules: uniqueRules }));
      setInitialAclRules(uniqueRules);
      if (typeof window !== 'undefined') {
        localStorage.setItem('imgsentry_fm_acl_rules', JSON.stringify(uniqueRules));
      }
      setIsSaved(true);
      if (onShowToast) {
        onShowToast('Folder access rules saved successfully.', 'success');
      }
      setTimeout(() => setIsSaved(false), 2500);
      return true;
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(err?.message || 'Failed to save folder access rules.', 'error');
      }
      return false;
    } finally {
      setIsSavingAclRules(false);
    }
  };

  // Folder rule handlers
  const handleAddFolderRuleTop = (aclFolderRules: FileManagerAclRule[]) => {
    const newRuleId = `folder-rule-${Date.now()}-${Math.random()}`;
    const newRule: FileManagerAclRule = {
      id: newRuleId,
      subject_type: 'role',
      subject_id: 'editor',
      folder_path: '',
      permission_level: 'view',
      include_subfolders: true
    };
    setFormData(prev => ({ ...prev, fileManagerAclRules: [...aclFolderRules, newRule] }));
    setExpandedFolderRules(prev => ({ ...prev, [newRuleId]: true }));
  };

  const handleDeleteFolderRuleTop = async (ruleId: string, aclFolderRules: FileManagerAclRule[]) => {
    // If it's a persisted DB rule (numeric ID), call delete endpoint
    const isPersistedId = /^\d+$/.test(ruleId);
    if (isPersistedId) {
      try {
        const win = typeof window !== 'undefined' ? (window as any) : {};
        const ajaxUrl =
          win.imgSentryFmData?.ajax_url ||
          win.imgsentry_data?.ajax_url ||
          win.imgsentryData?.ajax_url ||
          win.ajaxurl;

        if (ajaxUrl) {
          const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';
          const payload = new FormData();
          payload.append('action', 'imgsentry_fm_acl_delete_rule');
          if (nonce) {
            payload.append('_ajax_nonce', nonce);
            payload.append('nonce', nonce);
          }
          payload.append('id', ruleId);

          let deletedOnServer = false;
          let deleteError = 'Could not delete the folder access rule. It still gives access. Please try again.';
          try {
            const res = await fetch(ajaxUrl, {
              method: 'POST',
              body: payload,
            });
            let data: any = null;
            try {
              data = JSON.parse(await res.text());
            } catch {
              data = null;
            }
            if (data && data.success) {
              deletedOnServer = true;
            } else if (res.status === 404 && data && data.data && data.data.code === 'delete_failed') {
              // The rule is already gone on the server, so removing it from the screen is correct.
              deletedOnServer = true;
            } else if (data && data.data && data.data.message) {
              deleteError = data.data.message;
            }
          } catch (err) {
            console.warn('Failed to delete ACL rule from server:', err);
          }

          if (!deletedOnServer) {
            if (onShowToast) {
              onShowToast(deleteError, 'error');
            }
            return;
          }
          if (onShowToast) {
            onShowToast('Folder access rule deleted.', 'success');
          }
        }
      } catch (err) {
        console.warn('Failed to delete ACL rule from server:', err);
        if (onShowToast) {
          onShowToast('Could not delete the folder access rule. It still gives access. Please try again.', 'error');
        }
        return;
      }
    }

    const updatedRules = aclFolderRules.filter(r => r.id !== ruleId);
    setFormData(prev => ({ ...prev, fileManagerAclRules: updatedRules }));
    setInitialAclRules(prev => prev.filter(r => r.id !== ruleId));
    if (typeof window !== 'undefined') {
      localStorage.setItem('imgsentry_fm_acl_rules', JSON.stringify(updatedRules));
    }
    setExpandedFolderRules(prev => {
      const next = { ...prev };
      delete next[ruleId];
      return next;
    });
  };

  const handleUpdateFolderRuleTop = (ruleId: string, fields: Partial<FileManagerAclRule>, aclFolderRules: FileManagerAclRule[]) => {
    setFormData(prev => ({ ...prev, fileManagerAclRules: aclFolderRules.map(r => r.id === ruleId ? { ...r, ...fields } : r) }));
  };

  // --- Shared Operation Restrictions (Role & User) Backend Handlers ---
  const fetchOperationRestrictions = useCallback(async () => {
    setIsLoadingRestrictions(true);
    try {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      const ajaxUrl =
        win.imgSentryFmData?.ajax_url ||
        win.imgsentry_data?.ajax_url ||
        win.imgsentryData?.ajax_url ||
        win.ajaxurl;

      if (!ajaxUrl) {
        if (typeof window !== 'undefined') {
          const localJson = localStorage.getItem('imgsentry_fm_operation_restrictions');
          if (localJson) {
            try {
              const localRules = JSON.parse(localJson);
              if (Array.isArray(localRules) && localRules.length > 0) {
                const cleanLocalRules = localRules.map((r: any) => {
                  const rawOps = Array.isArray(r.forbidden_operations)
                    ? r.forbidden_operations
                    : (Array.isArray(r.disabledOperations) ? r.disabledOperations : []);
                  const cleanOps = rawOps.filter((op: unknown) => typeof op === 'string' && VALID_OPERATION_KEYS.has(op));
                  return {
                    ...r,
                    forbidden_operations: cleanOps,
                    disabledOperations: cleanOps,
                  };
                });
                setOperationRestrictions(cleanLocalRules);
                setInitialOperationRestrictions(cleanLocalRules);
              }
            } catch {
              // ignore
            }
          }
        }
        return;
      }

      const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';
      const payload = new URLSearchParams();
      payload.append('action', 'imgsentry_fm_restrictions_get_rules');
      if (nonce) {
        payload.append('_ajax_nonce', nonce);
        payload.append('nonce', nonce);
      }

      const res = await fetch(`${ajaxUrl}?${payload.toString()}`, {
        method: 'GET',
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        return;
      }

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return;
      }

      if (data && data.success && Array.isArray(data.data?.rules)) {
        const dbRules: FileManagerOperationRestriction[] = data.data.rules.map((r: any) => {
          const rawOps = Array.isArray(r.forbidden_operations)
            ? r.forbidden_operations
            : (Array.isArray(r.disabledOperations) ? r.disabledOperations : []);
          const cleanOps = rawOps.filter((op: unknown) => typeof op === 'string' && VALID_OPERATION_KEYS.has(op));

          return {
            id: String(r.id),
            subject_type: r.subject_type,
            subject_id: r.subject_id,
            forbidden_operations: cleanOps,
            disabledOperations: cleanOps,
            disable_toolbar: Boolean(r.disable_toolbar ?? r.disableToolbar),
            disableToolbar: Boolean(r.disableToolbar ?? r.disable_toolbar),
            disable_context_menu: Boolean(r.disable_context_menu ?? r.disableContextMenu),
            disableContextMenu: Boolean(r.disableContextMenu ?? r.disable_context_menu),
            created_by: r.created_by,
            created_at: r.created_at,
            updated_at: r.updated_at,
            isExpanded: true,
          };
        });
        setOperationRestrictions(dbRules);
        setInitialOperationRestrictions(dbRules);
        if (typeof window !== 'undefined') {
          localStorage.setItem('imgsentry_fm_operation_restrictions', JSON.stringify(dbRules));
        }
      }
    } catch {
      // Soft fallback for standalone/offline preview
    } finally {
      setIsLoadingRestrictions(false);
    }
  }, []);

  const handleSaveOperationRestrictions = async (typeToSave?: 'role' | 'user') => {
    setIsSavingRestrictions(true);
    try {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      const ajaxUrl =
        win.imgSentryFmData?.ajax_url ||
        win.imgsentry_data?.ajax_url ||
        win.imgsentryData?.ajax_url ||
        win.ajaxurl;

      const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';
      const rulesToProcess = typeToSave
        ? operationRestrictions.filter(r => r.subject_type === typeToSave)
        : operationRestrictions;

      let nextRestrictions = [...operationRestrictions];

      for (let i = 0; i < rulesToProcess.length; i++) {
        const rule = rulesToProcess[i];
        const isNumericId = /^\d+$/.test(rule.id);
        const disabledOps = rule.disabledOperations ?? rule.forbidden_operations ?? [];

        let data: any = null;

        if (ajaxUrl) {
          const payload = new FormData();
          payload.append('action', 'imgsentry_fm_restrictions_save_rule');
          if (nonce) {
            payload.append('_ajax_nonce', nonce);
            payload.append('nonce', nonce);
          }

          if (isNumericId) {
            payload.append('id', rule.id);
          }
          payload.append('subject_type', rule.subject_type);
          payload.append('subject_id', rule.subject_id);
          disabledOps.forEach(op => {
            payload.append('forbidden_operations[]', op);
          });
          payload.append('disable_toolbar', (rule.disableToolbar ?? rule.disable_toolbar) ? '1' : '0');
          payload.append('disable_context_menu', (rule.disableContextMenu ?? rule.disable_context_menu) ? '1' : '0');

          const res = await fetch(ajaxUrl, {
            method: 'POST',
            body: payload,
          });

          const contentType = res.headers.get('content-type') || '';
          if (!res.ok || !contentType.includes('application/json')) {
            let serverMessage = '';
            try {
              const errorBody = await res.json();
              serverMessage = errorBody?.data?.message || '';
            } catch {
              serverMessage = '';
            }
            throw new Error(serverMessage || `Server returned HTTP ${res.status}`);
          }

          const text = await res.text();
          data = JSON.parse(text);
        } else {
          // Dev / Preview fallback simulation
          data = {
            success: true,
            data: {
              rule: {
                id: isNumericId ? rule.id : String(Date.now() + i),
                subject_type: rule.subject_type,
                subject_id: rule.subject_id,
                forbidden_operations: disabledOps,
                disabledOperations: disabledOps,
                disable_toolbar: Boolean(rule.disableToolbar ?? rule.disable_toolbar),
                disableToolbar: Boolean(rule.disableToolbar ?? rule.disable_toolbar),
                disable_context_menu: Boolean(rule.disableContextMenu ?? rule.disable_context_menu),
                disableContextMenu: Boolean(rule.disableContextMenu ?? rule.disable_context_menu),
                created_by: 1,
                created_at: rule.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            }
          };
        }

        if (data && data.success && data.data?.rule) {
          const newId = String(data.data.rule.id);
          const idxInAll = nextRestrictions.findIndex(r => r.id === rule.id);
          if (idxInAll !== -1) {
            nextRestrictions[idxInAll] = {
              ...nextRestrictions[idxInAll],
              id: newId,
              subject_type: data.data.rule.subject_type,
              subject_id: data.data.rule.subject_id,
              forbidden_operations: Array.isArray(data.data.rule.forbidden_operations) ? data.data.rule.forbidden_operations : [],
              disabledOperations: Array.isArray(data.data.rule.disabledOperations) ? data.data.rule.disabledOperations : (Array.isArray(data.data.rule.forbidden_operations) ? data.data.rule.forbidden_operations : []),
              disable_toolbar: Boolean(data.data.rule.disable_toolbar ?? data.data.rule.disableToolbar),
              disableToolbar: Boolean(data.data.rule.disableToolbar ?? data.data.rule.disable_toolbar),
              disable_context_menu: Boolean(data.data.rule.disable_context_menu ?? data.data.rule.disableContextMenu),
              disableContextMenu: Boolean(data.data.rule.disableContextMenu ?? data.data.rule.disable_context_menu),
              created_by: data.data.rule.created_by,
              created_at: data.data.rule.created_at,
              updated_at: data.data.rule.updated_at,
            };
          }
        } else {
          setOperationRestrictions(nextRestrictions);
          throw new Error(`Rule for ${rule.subject_id}: ${data?.data?.message || 'Failed to save'}`);
        }
      }

      setOperationRestrictions(nextRestrictions);
      setInitialOperationRestrictions(nextRestrictions);
      if (typeof window !== 'undefined') {
        localStorage.setItem('imgsentry_fm_operation_restrictions', JSON.stringify(nextRestrictions));
      }
      setIsSaved(true);
      if (onShowToast) {
        const label = typeToSave === 'role' ? 'User Role Restrictions' : (typeToSave === 'user' ? 'User Restrictions' : 'Operation Restrictions');
        onShowToast(`${label} saved successfully.`, 'success');
      }
      setTimeout(() => setIsSaved(false), 2500);
      return true;
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(err?.message || 'Failed to save operation restrictions.', 'error');
      }
      return false;
    } finally {
      setIsSavingRestrictions(false);
    }
  };

  const handleDeleteOperationRestriction = async (ruleId: string) => {
    const isPersistedId = /^\d+$/.test(ruleId);
    if (isPersistedId) {
      try {
        const win = typeof window !== 'undefined' ? (window as any) : {};
        const ajaxUrl =
          win.imgSentryFmData?.ajax_url ||
          win.imgsentry_data?.ajax_url ||
          win.imgsentryData?.ajax_url ||
          win.ajaxurl;

        if (ajaxUrl) {
          const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';
          const payload = new FormData();
          payload.append('action', 'imgsentry_fm_restrictions_delete_rule');
          if (nonce) {
            payload.append('_ajax_nonce', nonce);
            payload.append('nonce', nonce);
          }
          payload.append('id', ruleId);

          const res = await fetch(ajaxUrl, {
            method: 'POST',
            body: payload,
          });
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            const text = await res.text();
            try {
              const data = JSON.parse(text);
              if (data && data.success && onShowToast) {
                onShowToast('Operation restriction rule deleted.', 'success');
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        console.warn('Failed to delete restriction rule from server:', err);
      }
    }

    const updated = operationRestrictions.filter(r => r.id !== ruleId);
    setOperationRestrictions(updated);
    setInitialOperationRestrictions(prev => prev.filter(r => r.id !== ruleId));
    if (typeof window !== 'undefined') {
      localStorage.setItem('imgsentry_fm_operation_restrictions', JSON.stringify(updated));
    }
  };

  const openFolderBrowserTop = (ruleId: string, aclFolderRules: FileManagerAclRule[]) => {
    const currentRule = aclFolderRules.find(r => r.id === ruleId);
    const initialPath = currentRule?.folder_path?.trim() || 'wp-content/uploads';
    setFolderBrowser({
      isOpen: true,
      targetRuleId: ruleId,
      selectedPath: initialPath,
      searchTerm: '',
      customPath: initialPath,
      activeTab: 'tree'
    });
  };
  const selectFolderTop = (path: string, aclFolderRules: FileManagerAclRule[]) => {
    if (folderBrowser.targetRuleId) handleUpdateFolderRuleTop(folderBrowser.targetRuleId, { folder_path: path }, aclFolderRules);
    setFolderBrowser({ isOpen: false, targetRuleId: null, selectedPath: 'wp-content/uploads', searchTerm: '', customPath: '', activeTab: 'tree' });
  };

  // Modals state
  const [isFolderBrowserOpen, setIsFolderBrowserOpen] = useState(false);
  const [activeAclFolderRowIndex, setActiveAclFolderRowIndex] = useState<number | null>(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isCleanDataModalOpen, setIsCleanDataModalOpen] = useState(false);
  const [isResetConfirmModalOpen, setIsResetConfirmModalOpen] = useState(false);
  const [isAutoTrashDependencyModalOpen, setIsAutoTrashDependencyModalOpen] = useState(false);
  const [isFileTypesModalOpen, setIsFileTypesModalOpen] = useState(false);
  const [notificationEmailError, setNotificationEmailError] = useState(false);
  const [notificationFromEmailError, setNotificationFromEmailError] = useState(false);
  // Maximum Upload Size: text typed in the box while editing (null = not editing).
  const [fmMaxUploadDraft, setFmMaxUploadDraft] = useState<string | null>(null);
  const [isBroadPatternModalOpen, setIsBroadPatternModalOpen] = useState(false);
  const [isUninstallDataModalOpen, setIsUninstallDataModalOpen] = useState(false);
  const [broadPatternsToConfirm, setBroadPatternsToConfirm] = useState<string[]>([]);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
    isOpen: boolean;
    index: number;
    itemPath: string;
    note?: string;
    category: 'folder' | 'file';
  } | null>(null);

  const isOverlyBroadPattern = (pattern: string): boolean => {
    return /^\*\.[a-zA-Z0-9]{1,5}$/.test(pattern);
  };

  const activeSubTab = propActiveSubTab !== undefined ? propActiveSubTab : localActiveSubTab;
  const setActiveSubTab = (tab: any) => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setLocalActiveSubTab(tab);
    }
  };
  const [isSaved, setIsSaved] = useState(false);

  // Minimum File Age: text typed in the box while editing (null = not editing). Lets the field be emptied
  // and retyped without the saved value dropping to 0 in the middle of typing.
  const [minFileAgeDraft, setMinFileAgeDraft] = useState<string | null>(null);
  // Integrations: text typed in the custom fields box (null = show the saved list). Keeps invalid lines visible while typing.
  const [customKeysDraft, setCustomKeysDraft] = useState<string | null>(null);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    setMinFileAgeDraft(null);
    setFmMaxUploadDraft(null);
    setCustomKeysDraft(null);
    setWebhookTestResult(null);
  }, [activeSubTab]);
  // After a save (or a reload of the settings) the saved list is the one to show.
  useEffect(() => {
    setCustomKeysDraft(null);
  }, [settings]);

  useEffect(() => {
    setFormData({
      ...settings,
      defaultScanType: normalizeDefaultScanType(settings?.defaultScanType),
    });
  }, [settings]);

  const hasUnsavedChanges = useMemo(() => {
    if (activeSubTab === 'file_manager' && fmActiveTab === 'code') {
      return (
        codeEditorTheme !== savedCodeSettings.theme ||
        codeEditorFullscreen !== savedCodeSettings.fullscreen ||
        codeEditorFontSize !== savedCodeSettings.font_size ||
        codeEditorTabSize !== savedCodeSettings.tab_size ||
        codeEditorFolding !== savedCodeSettings.code_folding
      );
    }
    if (activeSubTab === 'file_manager' && fmActiveTab === 'folders') {
      const normalizeRules = (rules: FileManagerAclRule[]) => rules.map(r => ({
        subject_type: r.subject_type,
        subject_id: r.subject_id,
        folder_path: (r.folder_path || '').trim(),
        permission_level: r.permission_level,
        include_subfolders: Boolean(r.include_subfolders)
      }));
      return JSON.stringify(normalizeRules(formData.fileManagerAclRules ?? [])) !== JSON.stringify(normalizeRules(initialAclRules));
    }
    if (activeSubTab === 'file_manager' && (fmActiveTab === 'roles' || fmActiveTab === 'users')) {
      const targetType = fmActiveTab === 'roles' ? 'role' : 'user';
      const normalizeRestrictions = (rules: FileManagerOperationRestriction[]) => rules
        .filter(r => r.subject_type === targetType)
        .map(r => ({
          subject_type: r.subject_type,
          subject_id: r.subject_id,
          forbidden_operations: (r.disabledOperations ?? r.forbidden_operations ?? []).slice().sort(),
          disable_toolbar: Boolean(r.disableToolbar ?? r.disable_toolbar),
          disable_context_menu: Boolean(r.disableContextMenu ?? r.disable_context_menu)
        }));
      return JSON.stringify(normalizeRestrictions(operationRestrictions)) !== JSON.stringify(normalizeRestrictions(initialOperationRestrictions));
    }
    const normalizedSettings = {
      ...settings,
      defaultScanType: normalizeDefaultScanType(settings?.defaultScanType),
    };
    return JSON.stringify(formData) !== JSON.stringify(normalizedSettings);
  }, [formData, settings, activeSubTab, fmActiveTab, codeEditorTheme, codeEditorFullscreen, codeEditorFontSize, codeEditorTabSize, codeEditorFolding, savedCodeSettings, initialAclRules, operationRestrictions, initialOperationRestrictions]);

  const handleSaveCodeEditorSettings = async () => {
    setIsSavingCodeEditor(true);
    const win = typeof window !== 'undefined' ? (window as any) : {};
    const ajaxUrl =
      win.imgSentryFmData?.ajax_url ||
      win.imgsentry_data?.ajax_url ||
      win.imgsentryData?.ajax_url ||
      win.ajaxurl ||
      '/wp-admin/admin-ajax.php';
    const nonce = win.imgSentryFmData?.nonce || win.imgsentry_data?.nonce || win.imgsentryData?.nonce || '';

    const payload = new FormData();
    payload.append('action', 'imgsentry_fm_save_code_editor_settings');
    payload.append('_ajax_nonce', nonce);
    payload.append('nonce', nonce);
    payload.append('theme', codeEditorTheme);
    payload.append('fullscreen', codeEditorFullscreen ? '1' : '0');
    payload.append('font_size', String(codeEditorFontSize));
    payload.append('tab_size', codeEditorTabSize);
    payload.append('code_folding', codeEditorFolding ? '1' : '0');

    try {
      const res = await fetch(ajaxUrl, {
        method: 'POST',
        body: payload,
      });
      const data = await res.json();
      if (data && data.success) {
        const newSettings = {
          theme: codeEditorTheme,
          fullscreen: codeEditorFullscreen,
          font_size: codeEditorFontSize,
          tab_size: codeEditorTabSize,
          code_folding: codeEditorFolding,
        };
        setSavedCodeSettings(newSettings);

        // Sync with canonical global window object
        if (win.imgSentryFmData) {
          if (!win.imgSentryFmData.settings) win.imgSentryFmData.settings = {};
          win.imgSentryFmData.settings.codeEditorTheme = codeEditorTheme;
          win.imgSentryFmData.settings.codeEditorSettings = newSettings;
          win.imgSentryFmData.settings.codeEditorFullscreen = codeEditorFullscreen;
          win.imgSentryFmData.settings.codeEditorFontSize = codeEditorFontSize;
          win.imgSentryFmData.settings.codeEditorTabSize = codeEditorTabSize;
          win.imgSentryFmData.settings.codeEditorFolding = codeEditorFolding;
        }

        setIsSaved(true);
        if (onShowToast) {
          onShowToast('Code editor settings saved successfully.', 'success');
        }
        setTimeout(() => setIsSaved(false), 2500);
      } else {
        const errorMsg = data?.data?.message || 'Failed to save code editor settings.';
        if (onShowToast) {
          onShowToast(errorMsg, 'error');
        }
      }
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(err?.message || 'Error communicating with server.', 'error');
      }
    } finally {
      setIsSavingCodeEditor(false);
    }
  };

  useEffect(() => {
    fetchAclRules();
    fetchWpUsers();
    fetchOperationRestrictions();
  }, [fetchAclRules, fetchWpUsers, fetchOperationRestrictions]);

  // Reload the rules when a rules tab opens, but never replace edits that are not saved yet.
  const aclEditsPendingRef = useRef(false);
  const restrictionEditsPendingRef = useRef(false);
  {
    const sameAclRules = (a: FileManagerAclRule[], b: FileManagerAclRule[]) =>
      JSON.stringify(a.map(r => [r.subject_type, r.subject_id, (r.folder_path || '').trim(), r.permission_level, Boolean(r.include_subfolders)])) ===
      JSON.stringify(b.map(r => [r.subject_type, r.subject_id, (r.folder_path || '').trim(), r.permission_level, Boolean(r.include_subfolders)]));
    aclEditsPendingRef.current = !sameAclRules(formData.fileManagerAclRules ?? [], initialAclRules);
    restrictionEditsPendingRef.current = JSON.stringify(operationRestrictions) !== JSON.stringify(initialOperationRestrictions);
  }

  useEffect(() => {
    if (activeSubTab === 'file_manager') {
      if (fmActiveTab === 'folders' || fmActiveTab === 'users') {
        if (!aclEditsPendingRef.current) {
          fetchAclRules();
        }
        fetchWpUsers();
      }
      if (fmActiveTab === 'roles' || fmActiveTab === 'users') {
        if (!restrictionEditsPendingRef.current) {
          fetchOperationRestrictions();
        }
      }
    }
  }, [activeSubTab, fmActiveTab, fetchAclRules, fetchWpUsers, fetchOperationRestrictions]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleToggle = (key: keyof PluginSettings) => {
    if (key === 'nonceVerification') {
      return; // Locked core security setting
    }
    // Free plan: these two can never be switched on (the server enforces this too).
    if (key === 'enableScheduledScan' && proScheduledScanLocked) {
      setScheduledScanUpgradeOpen(true);
      return;
    }
    if (key === 'autoTrashUnusedFiles' && proAutoTrashLocked) {
      setAutoTrashUpgradeOpen(true);
      return;
    }
    const defaultTrueKeys: (keyof PluginSettings)[] = [
      'autoPurgeTrashEnabled',
      'generateBackupBeforeOptimization',
      'enablePlugin',
      'enableUsageTracking',
      'includeImages',
      'includeVideos',
      'includeDocuments',
      'includeAudio',
      'includeSvg',
      'includeOthers',
      'restrictToAdmins',
      'showFileManagerPromo',
    ];
    const isDefaultTrue = defaultTrueKeys.includes(key);
    const currentVal = formData[key] ?? (isDefaultTrue ? true : false);

    if (key === 'autoTrashUnusedFiles' && !currentVal) {
      if (!formData.enableScheduledScan) {
        setIsAutoTrashDependencyModalOpen(true);
        return;
      }
    }

    const updated = { ...formData, [key]: !currentVal };
    // Safety: Auto-Trash must never run with a 0-day minimum age (it could trash files uploaded today).
    if (key === 'autoTrashUnusedFiles' && updated.autoTrashUnusedFiles && (formData.minFileAgeDays ?? 7) < 1) {
      updated.minFileAgeDays = 1;
    }
    if (key === 'enableScheduledScan') {
      if (updated.enableScheduledScan && !updated.scheduledScanFrequency) {
        updated.scheduledScanFrequency = 7;
      }
      if (!updated.enableScheduledScan) {
        updated.autoTrashUnusedFiles = false;
      }
    }
    setFormData(updated);
  };

  const handleChange = (key: keyof PluginSettings, value: any) => {
    const updated = { ...formData, [key]: value };
    setFormData(updated);
    if (key === 'backupDirectory') {
      setLocalWarnings(prev => prev.filter(w => w.code !== 'backup_directory_rejected'));
      if (onClearServerWarnings) {
        onClearServerWarnings();
      }
    }
  };

  const handleConfirmUninstallData = () => {
    setIsUninstallDataModalOpen(false);
    Promise.resolve(onSaveSettings(formData)).then((saved) => {
      // A refused save already shows its own error message; do not flash "Saved" in that case.
      if (saved === false) return;
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    });
  };

  const handleCancelUninstallData = () => {
    setIsUninstallDataModalOpen(false);
    // Revert checkbox state change
    setFormData(prev => ({
      ...prev,
      deleteDataOnUninstall: Boolean(settings.deleteDataOnUninstall)
    }));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (activeSubTab === 'file_manager' && fmActiveTab === 'code') {
      handleSaveCodeEditorSettings();
      return;
    }

    if (activeSubTab === 'file_manager' && fmActiveTab === 'folders') {
      handleSaveAclRules();
      return;
    }

    if (activeSubTab === 'file_manager' && fmActiveTab === 'roles') {
      handleSaveOperationRestrictions('role');
      return;
    }

    if (activeSubTab === 'file_manager' && fmActiveTab === 'users') {
      handleSaveOperationRestrictions('user');
      return;
    }

    // At least one Scan File Type must stay enabled (every save sends all settings, so check on every tab).
    if (SCAN_FILE_TYPE_KEYS.every((key) => formData[key] === false)) {
      setIsFileTypesModalOpen(true);
      return;
    }

    // Notification Email (optional): when filled it must look like an email address.
    const notificationEmailValue = String(formData.notificationEmail ?? '').trim();
    if (notificationEmailValue !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmailValue)) {
      setNotificationEmailError(true);
      setActiveSubTab('general');
      return;
    }

    // From Email (optional): when filled it must look like an email address.
    const notificationFromEmailValue = String(formData.notificationFromEmail ?? '').trim();
    if (notificationFromEmailValue !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationFromEmailValue)) {
      setNotificationFromEmailError(true);
      setActiveSubTab('general');
      return;
    }

    // Check if deleteDataOnUninstall is being changed from false/falsy to true
    const wasDeleteDataOff = !settings.deleteDataOnUninstall;
    const isDeleteDataNowOn = Boolean(formData.deleteDataOnUninstall);

    if (wasDeleteDataOff && isDeleteDataNowOn) {
      setIsUninstallDataModalOpen(true);
      return;
    }

    Promise.resolve(onSaveSettings(formData)).then((saved) => {
      // A refused save already shows its own error message; do not flash "Saved" in that case.
      if (saved === false) return;
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    });
  };

  // An explicitly saved list (even an empty one) is the source of truth; defaults only when nothing was ever saved.
  const currentExcludedFolders = Array.isArray(formData.excludedFolders)
    ? formData.excludedFolders 
    : DEFAULT_EXCLUDED_FOLDERS;

  const currentExcludedFiles = Array.isArray(formData.excludedFiles)
    ? formData.excludedFiles 
    : DEFAULT_EXCLUDED_FILES;

  const validateAndAddExclusionItem = (rawInput: string, category: 'folder' | 'file'): boolean => {
    setExclusionError(null);
    const val = rawInput.trim();
    if (!val) return false;

    const currentFoldersList = Array.isArray(formData.excludedFolders) ? formData.excludedFolders : DEFAULT_EXCLUDED_FOLDERS;
    const currentFilesList = Array.isArray(formData.excludedFiles) ? formData.excludedFiles : DEFAULT_EXCLUDED_FILES;

    if (category === 'folder') {
      let normalized = normalizePath(val);
      if (!normalized.startsWith('/')) {
        normalized = '/wp-content/uploads/' + normalized;
      }
      if (!normalized.endsWith('/')) {
        normalized += '/';
      }

      // 1. Guardrail: Root Uploads Exclusion Check
      const rootPaths = ['/wp-content/uploads/', '/wp-content/uploads', '/'];
      if (rootPaths.includes(normalized)) {
        setExclusionError("You can't exclude the entire uploads folder — this would disable scanning completely. Exclude a specific subfolder instead.");
        return false;
      }

      // 2. Guardrail: Duplicate check
      const isDup = currentFoldersList.some(item => {
        const itemP = typeof item === 'string' ? item : item.path;
        return normalizePath(itemP) === normalized; // folder names are case-sensitive on Linux (server de-duplicates on Windows/macOS)
      });

      if (isDup) {
        setExclusionError(`The folder exclusion path "${normalized}" already exists in your list.`);
        return false;
      }

      // 3. Guardrail: Server existence / path sanity check
      const isInsideUploads = normalized.startsWith('/wp-content/uploads/') && normalized.length > '/wp-content/uploads/'.length;
      if (!isInsideUploads) {
        setExclusionError(`Folder exclusions must be valid subdirectories inside /wp-content/uploads/.`);
        return false;
      }

      // Add folder item
      const newItem: ExclusionItem = {
        id: `custom-folder-${Date.now()}`,
        path: normalized,
        isPreSeeded: false,
        category: 'folder'
      };

      const updatedList = [...currentFoldersList, newItem];
      const updated = { ...formData, excludedFolders: updatedList };
      setFormData(updated);
      return true;

    } else {
      // File Exclusion
      // 1. Guardrail: Duplicate check
      const isDup = currentFilesList.some(item => {
        const itemP = typeof item === 'string' ? item : item.path;
        return itemP.toLowerCase() === val.toLowerCase();
      });

      if (isDup) {
        setExclusionError(`The file pattern "${val}" already exists in your list.`);
        return false;
      }

      const newItem: ExclusionItem = {
        id: `custom-file-${Date.now()}`,
        path: val,
        isPreSeeded: false,
        category: 'file'
      };

      const updatedList = [...currentFilesList, newItem];
      const updated = { ...formData, excludedFiles: updatedList };
      setFormData(updated);
      return true;
    }
  };

  const handleAddExclusion = () => {
    setExclusionError(null);
    const category = exclusionTab === 'folders' ? 'folder' : 'file';
    const parts = newExclusionInput.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return;

    let updatedFolders = Array.isArray(formData.excludedFolders) ? [...formData.excludedFolders] : [...DEFAULT_EXCLUDED_FOLDERS];
    let updatedFiles = Array.isArray(formData.excludedFiles) ? [...formData.excludedFiles] : [...DEFAULT_EXCLUDED_FILES];

    let successCount = 0;
    let duplicateCount = 0;
    let errorMsg: string | null = null;
    const broadPending: string[] = [];

    for (const part of parts) {
      if (category === 'folder') {
        let normalized = normalizePath(part);
        if (!normalized.startsWith('/')) {
          normalized = '/wp-content/uploads/' + normalized;
        }
        if (!normalized.endsWith('/')) {
          normalized += '/';
        }

        // 1. Guardrail: Root Uploads Exclusion Check
        const rootPaths = ['/wp-content/uploads/', '/wp-content/uploads', '/'];
        if (rootPaths.includes(normalized)) {
          errorMsg = "You can't exclude the entire uploads folder — this would disable scanning completely. Exclude a specific subfolder instead.";
          continue;
        }

        // 2. Guardrail: Duplicate check
        const isDup = updatedFolders.some(item => {
          const itemP = typeof item === 'string' ? item : item.path;
          return normalizePath(itemP) === normalized; // folder names are case-sensitive on Linux (server de-duplicates on Windows/macOS)
        });

        if (isDup) {
          duplicateCount++;
          continue;
        }

        // 3. Guardrail: Server existence / path sanity check
        const isInsideUploads = normalized.startsWith('/wp-content/uploads/') && normalized.length > '/wp-content/uploads/'.length;
        if (!isInsideUploads) {
          errorMsg = `Folder exclusions must be valid subdirectories inside /wp-content/uploads/.`;
          continue;
        }

        const newItem: ExclusionItem = {
          id: `custom-folder-${Date.now()}-${Math.random()}`,
          path: normalized,
          isPreSeeded: false,
          category: 'folder'
        };
        updatedFolders.push(newItem);
        successCount++;

      } else {
        // File Exclusion duplicate check
        const isDup = updatedFiles.some(item => {
          const itemP = typeof item === 'string' ? item : item.path;
          return itemP.toLowerCase() === part.toLowerCase();
        });

        if (isDup) {
          duplicateCount++;
          continue;
        }

        if (isOverlyBroadPattern(part)) {
          broadPending.push(part);
          continue;
        }

        const newItem: ExclusionItem = {
          id: `custom-file-${Date.now()}-${Math.random()}`,
          path: part,
          isPreSeeded: false,
          category: 'file'
        };
        updatedFiles.push(newItem);
        successCount++;
      }
    }

    if (broadPending.length > 0) {
      setBroadPatternsToConfirm(broadPending);
      setIsBroadPatternModalOpen(true);
    }

    if (successCount > 0) {
      const updated = { 
        ...formData, 
        excludedFolders: updatedFolders, 
        excludedFiles: updatedFiles 
      };
      setFormData(updated);

      setNewExclusionInput('');
      setShowAddExclusionInput(false);

      let feedback = `${successCount} ${category === 'folder' ? 'folder(s)' : 'file pattern(s)'} added successfully.`;
      if (duplicateCount > 0) {
        feedback += ` ${duplicateCount} skipped as duplicate(s).`;
      }
      if (broadPending.length > 0) {
        feedback += ` ${broadPending.length} broad pattern(s) pending confirmation.`;
      }
      if (errorMsg) {
        setExclusionError(`${feedback} Error on other item(s): ${errorMsg}`);
      } else {
        setExclusionError(feedback);
      }
    } else {
      if (broadPending.length > 0) {
        setNewExclusionInput('');
        setShowAddExclusionInput(false);
        setExclusionError(`${broadPending.length} broad pattern(s) pending confirmation.`);
      } else if (duplicateCount > 0 && !errorMsg) {
        setExclusionError(`All items skipped (already exist in list).`);
      } else if (errorMsg) {
        setExclusionError(errorMsg);
      } else {
        setExclusionError("No valid exclusions were found to add.");
      }
    }
  };

  const handleConfirmAddBroadPatterns = () => {
    let updatedFiles = Array.isArray(formData.excludedFiles) ? [...formData.excludedFiles] : [...DEFAULT_EXCLUDED_FILES];
    let addedCount = 0;

    for (const part of broadPatternsToConfirm) {
      const isDup = updatedFiles.some(item => {
        const itemP = typeof item === 'string' ? item : item.path;
        return itemP.toLowerCase() === part.toLowerCase();
      });
      if (!isDup) {
        const newItem: ExclusionItem = {
          id: `custom-file-${Date.now()}-${Math.random()}`,
          path: part,
          isPreSeeded: false,
          category: 'file'
        };
        updatedFiles.push(newItem);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      const updated = { 
        ...formData, 
        excludedFiles: updatedFiles 
      };
      setFormData(updated);
      setExclusionError(`${addedCount} broad file pattern(s) added anyway.`);
    }

    setBroadPatternsToConfirm([]);
    setIsBroadPatternModalOpen(false);
  };

  const handleRemoveClick = (index: number, item: ExclusionItem | string, category: 'folder' | 'file') => {
    const isPreSeeded = typeof item === 'object' && item.isPreSeeded;
    const itemPath = typeof item === 'string' ? item : item.path;
    const note = typeof item === 'object' ? item.note : undefined;

    if (isPreSeeded) {
      setConfirmDeleteModal({
        isOpen: true,
        index,
        itemPath,
        note,
        category
      });
    } else {
      performRemoveExclusion(index, category);
    }
  };

  const performRemoveExclusion = (index: number, category: 'folder' | 'file') => {
    let updated: PluginSettings;
    if (category === 'folder') {
      const list = Array.isArray(formData.excludedFolders) ? formData.excludedFolders : DEFAULT_EXCLUDED_FOLDERS;
      const updatedList = list.filter((_, i) => i !== index);
      updated = { ...formData, excludedFolders: updatedList };
    } else {
      const list = Array.isArray(formData.excludedFiles) ? formData.excludedFiles : DEFAULT_EXCLUDED_FILES;
      const updatedList = list.filter((_, i) => i !== index);
      updated = { ...formData, excludedFiles: updatedList };
    }
    setFormData(updated);
  };

  const cardBg = isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-200/80 text-gray-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-gray-500';

  // Handle direct links or hash on mount (e.g. #subtab-scan or #section-scan-settings)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const cleanHash = hash.replace('#', '');
      if (cleanHash.startsWith('subtab-')) {
        const tabId = cleanHash.replace('subtab-', '');
        setActiveSubTab(tabId);
      } else if (cleanHash.startsWith('section-')) {
        const tabIdMap: Record<string, string> = {
          'section-general': 'general',
          'section-scan-settings': 'scan',
          'section-schedule': 'schedule',
          'section-auto-clean': 'auto',
          'section-scheduled-scan': 'auto',
          'section-exclusions': 'exclusions',
          'section-permissions': 'permissions',
          'section-file-manager': 'file_manager',
          'section-filemanager': 'file_manager',
          'section-notifications': 'notifications',
          'section-advanced': 'advanced',
          'section-integrations': 'integrations',
          'section-logs': 'logs',
          'section-scheduled-actions': 'scheduled_actions',
          'section-help': 'help',
        };
        const tabId = tabIdMap[cleanHash];
        if (tabId) {
          setActiveSubTab(tabId);
        }
      }
    }
  }, []);

  const handleResetDefaults = () => {
    setIsResetConfirmModalOpen(true);
  };

  const performResetDefaults = () => {
    if (activeSubTab === 'file_manager' && fmActiveTab === 'code') {
      setCodeEditorTheme('dark');
      setCodeEditorFullscreen(false);
      setCodeEditorFontSize(14);
      setCodeEditorTabSize('4');
      setCodeEditorFolding(true);
      if (typeof window !== 'undefined' && (window as any).ImgSentryFM?.setEditorTheme) {
        (window as any).ImgSentryFM.setEditorTheme('dark');
      }
      return;
    }

    const keysToReset = TAB_FIELD_KEYS[activeSubTab] || [];
    if (keysToReset.length === 0) {
      return;
    }
    if (activeSubTab === 'integrations') {
      setCustomKeysDraft(null);
      setWebhookTestResult(null);
    }

    setFormData((prev) => {
      const updated = { ...prev };
      keysToReset.forEach((key) => {
        (updated as any)[key] = INITIAL_PLUGIN_SETTINGS[key];
      });
      return updated;
    });
  };

  // ---- Integrations helpers -------------------------------------------------
  const META_KEY_PATTERN = /^[A-Za-z0-9_\-.:]+$/;
  const META_KEY_MAX_LEN = 100;
  const META_KEY_MAX_COUNT = 50;

  // Reads the box text: valid keys (what is saved) and a reason for every ignored line.
  const parseCustomKeysText = (text: string) => {
    const keys: string[] = [];
    const issues: { line: number; text: string; reason: string }[] = [];
    text.split(/\r\n|\r|\n/).forEach((raw, idx) => {
      const key = raw.trim();
      if (key === '') return;
      if (key.length > META_KEY_MAX_LEN) {
        issues.push({ line: idx + 1, text: key.slice(0, 24) + '…', reason: 'too long (max 100)' });
      } else if (!META_KEY_PATTERN.test(key)) {
        issues.push({ line: idx + 1, text: key, reason: 'invalid characters' });
      } else if (keys.includes(key)) {
        issues.push({ line: idx + 1, text: key, reason: 'duplicate' });
      } else if (keys.length >= META_KEY_MAX_COUNT) {
        issues.push({ line: idx + 1, text: key, reason: 'over the limit of 50' });
      } else {
        keys.push(key);
      }
    });
    return { keys, issues };
  };

  const handleCustomKeysChange = (text: string) => {
    setCustomKeysDraft(text);
    const { keys } = parseCustomKeysText(text);
    setFormData(prev => ({ ...prev, customMetaKeys: keys }));
  };

  const isWpMode = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData);

  const handleTestWebhook = async () => {
    if (proWebhookLocked) {
      setWebhookUpgradeOpen(true);
      return;
    }
    const url = (formData.webhookUrl || '').trim();
    if (!url) {
      setWebhookTestResult({ ok: false, message: 'Enter a webhook URL first.' });
      return;
    }
    if (!/^https:\/\//i.test(url)) {
      setWebhookTestResult({ ok: false, message: 'The webhook URL must start with https://' });
      return;
    }
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const ajaxUrl = imgsentryData ? (imgsentryData.ajax_url || imgsentryData.ajaxUrl) : '';
    if (!ajaxUrl) {
      // Standalone preview: no server, nothing is sent.
      const msg = 'Preview mode: no request was sent.';
      setWebhookTestResult({ ok: true, message: msg });
      if (onShowToast) onShowToast(msg, 'info');
      return;
    }
    setWebhookTesting(true);
    setWebhookTestResult(null);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_test_webhook');
      fd.append('nonce', imgsentryData.nonce);
      fd.append('url', url);
      fd.append('secret', formData.webhookSecret || '');
      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      const message = (json && json.data && typeof json.data.message === 'string')
        ? json.data.message
        : (json && json.success ? 'Test sent.' : 'The test could not be sent.');
      const ok = Boolean(json && json.success);
      setWebhookTestResult({ ok, message });
      if (onShowToast) onShowToast(message, ok ? 'success' : 'error');
    } catch (e) {
      const message = 'The test could not be sent. Please try again.';
      setWebhookTestResult({ ok: false, message });
      if (onShowToast) onShowToast(message, 'error');
    } finally {
      setWebhookTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    const typed = String(formData.notificationEmail ?? '').trim();
    if (typed !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) {
      setNotificationEmailError(true);
      setTestEmailResult(null);
      return;
    }
    const typedFrom = String(formData.notificationFromEmail ?? '').trim();
    if (typedFrom !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedFrom)) {
      setNotificationFromEmailError(true);
      setTestEmailResult(null);
      return;
    }
    const imgsentryData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const ajaxUrl = imgsentryData ? (imgsentryData.ajax_url || imgsentryData.ajaxUrl) : '';
    if (!ajaxUrl) {
      // Standalone preview: no server, nothing is sent.
      const msg = 'Preview mode: no email was sent.';
      setTestEmailResult({ ok: true, message: msg });
      if (onShowToast) onShowToast(msg, 'info');
      return;
    }
    setTestEmailSending(true);
    setTestEmailResult(null);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_test_email');
      fd.append('nonce', imgsentryData.nonce);
      fd.append('email', typed);
      fd.append('from', typedFrom);
      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      const ok = Boolean(json && json.success);
      const message = (json && json.data && typeof json.data.message === 'string')
        ? json.data.message
        : (ok ? 'Test email sent.' : 'The test email could not be sent.');
      setTestEmailResult({ ok, message });
      if (onShowToast) onShowToast(message, ok ? 'success' : 'error');
    } catch (e) {
      const message = 'The test email could not be sent. Please try again.';
      setTestEmailResult({ ok: false, message });
      if (onShowToast) onShowToast(message, 'error');
    } finally {
      setTestEmailSending(false);
    }
  };

  const renderSettingsActionFooter = () => (
    <div className="pt-5 border-t border-gray-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {isSaved ? (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            All changes saved!
          </span>
        ) : hasUnsavedChanges ? (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            You have unsaved changes
          </span>
        ) : (
          <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 inline-block" />
            All settings up to date
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button 
          type="button"
          onClick={handleResetDefaults}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset to defaults</span>
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSavingAclRules || isSavingRestrictions || isSavingCodeEditor}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-sm ${
            (isSavingAclRules || isSavingRestrictions || isSavingCodeEditor)
              ? 'bg-[#A61E69]/70 text-white cursor-wait opacity-90'
              : isSaved
              ? 'bg-emerald-600 text-white cursor-pointer'
              : hasUnsavedChanges
              ? 'bg-[#A61E69] hover:bg-[#8F1B5A] text-white ring-2 ring-[#A61E69]/30 font-bold cursor-pointer'
              : 'bg-[#A61E69]/80 hover:bg-[#A61E69] text-white cursor-pointer'
          }`}
        >
          {(isSavingAclRules || isSavingRestrictions || isSavingCodeEditor) ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : isSaved ? <CheckCircle className="w-3.5 h-3.5 text-emerald-100" /> : <Save className="w-3.5 h-3.5" />}
          <span>{(isSavingAclRules || isSavingRestrictions || isSavingCodeEditor) ? 'Saving...' : isSaved ? 'Saved!' : 'Save changes'}</span>
        </button>
      </div>
    </div>
  );

  const handleTabClick = (tabId: string) => {
    if (tabId === 'dashboard') {
      if (onGoToDashboard) {
        onGoToDashboard();
      }
      return;
    }
    if (tabId === 'history') {
      if (onGoToScanHistory) {
        onGoToScanHistory();
      }
      return;
    }

    setActiveSubTab(tabId);
    window.history.replaceState(null, '', '#subtab-' + tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="imgsentry-fm-settings imgsentry-settings-container space-y-6 animate-fadeIn pb-12 font-sans">
      {/* Main Two-Column Layout: Left Sidebar + Content Area */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-52 shrink-0 md:sticky md:top-[calc(var(--imgsentry-adminbar-h)+136px)] self-start space-y-1">
          {onGoToDashboard && (
            <div className="pb-1.5 mb-1.5 border-b border-gray-200/80 dark:border-[#243044]">
              <button
                type="button"
                onClick={() => onGoToDashboard()}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Dashboard</span>
              </button>
            </div>
          )}

          {/* Main Settings Sections */}
          <div className="space-y-0.5">
            {[
              { id: 'general', label: 'General', icon: Settings },
              { id: 'scan', label: 'Scan Settings', icon: Scan },
              { id: 'schedule', label: 'Schedule', icon: Clock },
              { id: 'auto', label: 'Auto Clean', icon: Zap },
              { id: 'exclusions', label: 'Exclusions', icon: FolderArchive },
              { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
              { id: 'file_manager', label: 'File Manager', icon: FolderTree },
              { id: 'advanced', label: 'Optimization', icon: SlidersHorizontal },
              { id: 'integrations', label: 'Integrations', icon: ExternalLink },
            ].filter((tab) => tab.id !== 'file_manager' || fmActive).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-tab-id={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#A61E69]/10 text-[#A61E69] dark:bg-[#A61E69]/20 dark:text-[#f39ec8] font-bold shadow-2xs'
                      : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/70 hover:text-gray-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#A61E69] dark:text-[#f39ec8]' : ''}`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Subtle Divider */}
          <div className="my-2.5 border-t border-gray-200/80 dark:border-[#243044]" />

          {/* Standalone Sections */}
          <div className="space-y-0.5">
            {[
              { id: 'logs', label: 'Logs', icon: FileText },
              { id: 'scheduled_actions', label: 'Scheduled Actions', icon: Clock },
              { id: 'help', label: 'Help & Support', icon: HelpCircle },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-tab-id={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#A61E69]/10 text-[#A61E69] dark:bg-[#A61E69]/20 dark:text-[#f39ec8] font-bold shadow-2xs'
                      : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800/70 hover:text-gray-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#A61E69] dark:text-[#f39ec8]' : ''}`} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {activeSubTab === 'logs' ? (
            /* Standalone Logs View (Full-Width Exclusive Render) */
            <div id="section-logs" className="animate-fadeIn">
              <React.Suspense fallback={<div className="p-12 text-center text-xs text-slate-500">Loading Activity & System Logs...</div>}>
                <LogsTab
                  settings={formData}
                  isDarkMode={isDarkMode}
                  logs={logs}
                  onClearLogs={() => onCleanPluginData?.({ cleanScans: false, cleanLogs: true, cleanTransients: false, cleanOrphanedMeta: false })}
                  onExportLogs={onExportLogs}
                  showExportTrigger={showLogsExport}
                  onCloseExportTrigger={onCloseLogsExport}
                  isRefreshing={isRefreshing}
                  onRefresh={onRefreshLogs}
                />
              </React.Suspense>
            </div>
          ) : activeSubTab === 'scheduled_actions' ? (
            /* Standalone Scheduled Actions View (Full-Width Exclusive Render) */
            <div id="section-scheduled-actions" className="animate-fadeIn">
              <ScheduledActionsTab 
                isDarkMode={isDarkMode} 
                onNavigateToLogs={() => handleTabClick('logs')}
              />
            </div>
          ) : activeSubTab === 'help' ? (
            /* Standalone Help & Support View (Full-Width Exclusive Render) */
            <div id="section-help" className="animate-fadeIn">
              <HelpSupportTab isDarkMode={isDarkMode} />
            </div>
          ) : (
            /* Settings Form View: Selected Section Card + Right Sidebar */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fadeIn">
              {/* Left Column Active Card */}
              <div className="lg:col-span-8 space-y-6">
              
              {/* Card 1: General Settings */}
              {activeSubTab === 'general' && (
              <div id="section-general" className={`${cardBg} rounded-xl p-6 border shadow-2xs space-y-6`}>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white!">General Settings</h3>
              <p className={`text-xs ${subText} mt-0.5`}>Basic plugin behavior.</p>
            </div>

            {/* Top Dropdowns Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#A61E69]" />
                  <span>Time Zone</span>
                </label>
                <select
                  value={formData.timeZone || 'UTC'}
                  onChange={(e) => handleChange('timeZone', e.target.value)}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg font-medium text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {(() => {
                    const effectiveTz = formData.timeZone || 'UTC';
                    const isInList = INTERNATIONAL_TIMEZONES.some(
                      (t) => t.value === effectiveTz || t.iana === effectiveTz
                    );
                    if (!isInList) {
                      return (
                        <option value={effectiveTz}>
                          {effectiveTz}
                        </option>
                      );
                    }
                    return null;
                  })()}
                  {Array.from(new Set(INTERNATIONAL_TIMEZONES.map(t => t.region))).map((region) => (
                    <optgroup key={region} label={region}>
                      {INTERNATIONAL_TIMEZONES.filter(t => t.region === region).map((tz) => (
                        <option key={tz.iana} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className={`text-[11px] ${subText}`}>Used for the scheduled scan time and scan dates.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-800 dark:text-slate-200">Date Format</label>
                <select
                  value={formData.dateFormat || 'May 24, 2024 10:30 AM'}
                  onChange={(e) => handleChange('dateFormat', e.target.value)}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg font-medium text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="May 24, 2024 10:30 AM">May 24, 2024 10:30 AM</option>
                  <option value="Y-m-d H:i">2024-05-24 10:30</option>
                  <option value="d/m/Y H:i">24/05/2024 10:30</option>
                </select>
                <p className={`text-[11px] ${subText}`}>Applies to the dates in the Logs list.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 items-start">
            <div className="space-y-1.5">
              <label htmlFor="notificationEmail" className="text-xs font-bold text-gray-800 dark:text-slate-200">Notification Email</label>
              <input
                id="notificationEmail"
                type="email"
                value={formData.notificationEmail ?? ''}
                onChange={(e) => {
                  setNotificationEmailError(false);
                  handleChange('notificationEmail', e.target.value);
                }}
                placeholder="Uses the WordPress admin email"
                aria-invalid={notificationEmailError}
                className={`w-full text-xs p-2.5 bg-white dark:bg-slate-800 border rounded-lg font-medium text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  notificationEmailError ? 'border-rose-400 dark:border-rose-500' : 'border-gray-200 dark:border-slate-700'
                }`}
              />
              {notificationEmailError ? (
                <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Enter a valid email address, or leave it empty.</p>
              ) : (
                <p className={`text-[11px] ${subText}`}>Where File Manager activity emails go. Empty = WordPress admin email.</p>
              )}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={testEmailSending}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    testEmailSending
                      ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-800 text-[#A61E69] dark:text-[#f39ec8] border-[#A61E69] hover:bg-[#A61E69]/5 cursor-pointer'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  {testEmailSending ? 'Sending...' : 'Send test email'}
                </button>
                <p className={`text-[11px] ${subText}`}>Sends one test message to the address above (or the admin email if empty).</p>
                {testEmailResult && (
                  <div
                    role="status"
                    className={`flex items-start gap-2 rounded-lg border p-2.5 text-[11px] font-medium ${
                      testEmailResult.ok
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {testEmailResult.ok ? <CheckCircle className="w-3.5 h-3.5 mt-px shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />}
                    <span>{testEmailResult.message}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="notificationFromEmail" className="text-xs font-bold text-gray-800 dark:text-slate-200">
                From Email <span className={`font-medium ${subText}`}>(optional)</span>
              </label>
              <input
                id="notificationFromEmail"
                type="email"
                value={formData.notificationFromEmail ?? ''}
                onChange={(e) => {
                  setNotificationFromEmailError(false);
                  handleChange('notificationFromEmail', e.target.value);
                }}
                placeholder="Uses the WordPress default sender"
                aria-invalid={notificationFromEmailError}
                className={`w-full text-xs p-2.5 bg-white dark:bg-slate-800 border rounded-lg font-medium text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  notificationFromEmailError ? 'border-rose-400 dark:border-rose-500' : 'border-gray-200 dark:border-slate-700'
                }`}
              />
              {notificationFromEmailError ? (
                <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Enter a valid email address, or leave it empty.</p>
              ) : (
                <p className={`text-[11px] ${subText}`}>Sender address for ImgSentry emails. Empty = WordPress default (wordpress@yoursite).</p>
              )}
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-2.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                <span>Use an address on your own domain. An address from another domain (like gmail.com) can send mails to spam. If an SMTP plugin forces its own From address, this setting is ignored.</span>
              </div>
            </div>
            </div>

            {/* Toggles */}
            <div className="space-y-5 pt-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="font-bold text-xs text-gray-800 dark:text-slate-200 block">Enable Plugin</label>
                  <p className={`text-[11px] ${subText} mt-0.5`}>Master switch. When off, automatic scans, cleanup, emails and tracking pause. Manual tools still work.</p>
                </div>
                <ToggleSwitch
                  checked={Boolean(formData.enablePlugin)}
                  onChange={() => handleToggle('enablePlugin')}
                  label="Enable Plugin"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="font-bold text-xs text-gray-800 dark:text-slate-200 block">Real-Time Media Usage Tracking</label>
                  <p className={`text-[11px] ${subText} mt-0.5`}>Updates Used/Unused status when you save posts, widgets or products. Never deletes files. Needs Enable Plugin ON.</p>
                </div>
                <ToggleSwitch
                  checked={Boolean(formData.enableUsageTracking)}
                  onChange={() => handleToggle('enableUsageTracking')}
                  label="Real-Time Media Usage Tracking"
                />
              </div>

              {pro.features.file_manager && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-bold text-xs text-gray-800 dark:text-slate-200 block">Enable File Manager</label>
                    <p className={`text-[11px] ${subText} mt-0.5`}>Professional feature. When on, the File Manager page and its settings appear. Roles you allow in Settings &gt; File Manager can use it. Save changes to apply.</p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(formData.enableFileManager)}
                    onChange={() => handleToggle('enableFileManager')}
                    label="Enable File Manager"
                  />
                </div>
              )}

              {!pro.features.file_manager && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="font-bold text-xs text-gray-800 dark:text-slate-200 block">Show Advance File Manager in the menu</label>
                    <p className={`text-[11px] ${subText} mt-0.5`}>Professional feature. When on, a locked "Advance File Manager" item with a PRO badge appears in the menu so you can see what it does. Only Administrators see it. Save changes to apply.</p>
                  </div>
                  <ToggleSwitch
                    checked={formData.showFileManagerPromo !== false}
                    onChange={() => handleToggle('showFileManagerPromo')}
                    label="Show Advance File Manager in the menu"
                  />
                </div>
              )}

              <div className="pt-4 border-t border-gray-100 dark:border-[#243044] space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-xs text-gray-800 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                      <span>Delete All Plugin Data on Uninstall</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                        <AlertTriangle className="w-3 h-3" />
                        Destructive Action
                      </span>
                    </label>
                    <p className={`text-[11px] ${subText} leading-relaxed`}>
                      Permanently deletes all ImgSentry data when the plugin is deleted. Deactivating keeps it.
                    </p>
                  </div>
                  <ToggleSwitch
                    tone="danger"
                    checked={Boolean(formData.deleteDataOnUninstall)}
                    onChange={() => handleToggle('deleteDataOnUninstall')}
                    label="Delete All Plugin Data on Uninstall"
                  />
                </div>
                {formData.deleteDataOnUninstall && (
                  <div className="p-3 rounded-xl border bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300">
                    <div className="flex items-center gap-2 font-bold text-xs mb-1">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>This cannot be undone</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Settings, database tables, plugin metadata, backups, trash and temporary folders will be removed.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {renderSettingsActionFooter()}
          </div>
          )}

          {/* Card 2: Scan Settings */}
          {activeSubTab === 'scan' && (
          <div id="section-scan-settings" className={`${cardBg} rounded-xl p-6 border shadow-2xs space-y-6`}>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white!">Scan Settings</h3>
              <p className={`text-xs ${subText} mt-0.5`}>Configure scan methods, file types, and system performance preferences.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Scan Method */}
              <div className="space-y-6">
                <div>
                  <div id="scan-method-label" className="text-xs font-bold text-gray-800 dark:text-slate-200 block mb-2">Scan Method</div>
                  <div role="radiogroup" aria-labelledby="scan-method-label" className="space-y-3">
                    {([
                      {
                        value: 'smart',
                        title: 'Smart Scan',
                        badge: '(Recommended)',
                        description: 'Checks new files, files marked unused, and files not checked for 7 days. Fast and safe for everyday use.',
                      },
                      {
                        value: 'full',
                        title: 'Deep Scan',
                        badge: '',
                        description: 'Re-checks every file in your library. Use after changing theme, page builder or plugins, or importing content. Can take longer.',
                      },
                    ] as const).map((option) => {
                      const isSelected = option.value === 'smart'
                        ? (formData.defaultScanType === 'smart' || !formData.defaultScanType)
                        : formData.defaultScanType === 'full';
                      return (
                        <label key={option.value} className="flex items-start gap-3 cursor-pointer group">
                          <input
                            type="radio"
                            name="defaultScanType"
                            value={option.value}
                            checked={isSelected}
                            onChange={() => handleChange('defaultScanType', option.value)}
                            className="sr-only peer"
                          />
                          <span
                            aria-hidden="true"
                            className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-[#A61E69] peer-focus-visible:ring-offset-1 ${isSelected ? 'border-[#A61E69] bg-white' : 'border-gray-300 dark:border-slate-600'}`}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-[#A61E69]" />}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-gray-800 dark:text-slate-200">
                              {option.title}
                              {option.badge && <span className="font-normal text-gray-500"> {option.badge}</span>}
                            </span>
                            <p className={`text-[11px] ${subText} leading-snug mt-0.5`}>{option.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Scan File Types & Server Memory */}
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-gray-800 dark:text-slate-200 block mb-2">Scan File Types</label>
                  <div className="space-y-2.5">
                    {[
                      { key: 'includeImages', label: 'Images (JPG, PNG, WebP, GIF)' },
                      { key: 'includeDocuments', label: 'Documents (PDF, DOC, DOCX, XLS, PPT)' },
                      { key: 'includeVideos', label: 'Videos (MP4, WebM, MOV, AVI)' },
                      { key: 'includeAudio', label: 'Audio (MP3, WAV, OGG)' },
                      { key: 'includeSvg', label: 'SVG Vectors (Icons & Graphics)' },
                      { key: 'includeOthers', label: 'Others' },
                    ].map((item) => {
                      const isChecked = formData[item.key as keyof PluginSettings] !== false;
                      return (
                        <div 
                          key={item.key}
                          role="checkbox"
                          aria-checked={isChecked}
                          tabIndex={0}
                          onClick={() => handleToggle(item.key as keyof PluginSettings)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              handleToggle(item.key as keyof PluginSettings);
                            }
                          }}
                          className="flex items-center gap-2.5 cursor-pointer select-none group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A61E69] rounded"
                        >
                          <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${
                            isChecked
                              ? 'border-[#A61E69] bg-[#A61E69] text-white'
                              : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }`}>
                            {isChecked && (
                              <Check className="w-3 h-3 stroke-[3] text-white" />
                            )}
                          </div>
                          <span className="text-xs font-medium text-gray-800 dark:text-slate-200 group-hover:text-gray-900 dark:group-hover:text-white">
                            {item.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {SCAN_FILE_TYPE_KEYS.every((key) => formData[key] === false) && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mt-2.5 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      <span>Select at least one file type, otherwise your settings cannot be saved.</span>
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-gray-800 dark:text-slate-200 block">Server Memory Limit</label>

                  {(() => {
                    const actualLimitRaw = formData.actual_memory_limit || settings.actual_memory_limit || '512MB';
                    const actualLimitClean = actualLimitRaw.toUpperCase().trim();
                    let actualLimitFormatted = actualLimitClean;
                    if (actualLimitClean.endsWith('M') && !actualLimitClean.endsWith('MB')) {
                      actualLimitFormatted = actualLimitClean + 'B';
                    } else if (actualLimitClean.endsWith('G')) {
                      const numGb = parseInt(actualLimitClean, 10);
                      actualLimitFormatted = (numGb * 1024) + 'MB';
                    } else if (actualLimitClean.endsWith('GB')) {
                      const numGb = parseInt(actualLimitClean, 10);
                      actualLimitFormatted = (numGb * 1024) + 'MB';
                    } else if (actualLimitClean === '-1' || actualLimitClean === 'UNLIMITED') {
                      actualLimitFormatted = 'Unlimited';
                    }

                    // Detected limit in MB (Infinity = no limit, null = could not be read).
                    let serverMb: number | null = null;
                    if (actualLimitFormatted === 'Unlimited') {
                      serverMb = Infinity;
                    } else {
                      const match = actualLimitFormatted.match(/^(\d+(?:\.\d+)?)\s*(KB|K|MB|M)?$/);
                      if (match) {
                        const amount = parseFloat(match[1]);
                        const unit = match[2];
                        serverMb = unit === 'KB' || unit === 'K' ? amount / 1024 : unit ? amount : amount / (1024 * 1024);
                      }
                    }
                    const serverLimitLabel = serverMb === null
                      ? actualLimitFormatted
                      : serverMb === Infinity
                      ? 'Unlimited'
                      : Math.round(serverMb) + 'MB';

                    let bgClasses = "bg-emerald-50/80 dark:bg-emerald-950/40 border-l-4 border-l-emerald-500 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200";
                    let iconColor = "text-emerald-600 dark:text-emerald-400";
                    let recommendationText = "Great for most websites. Easily handles medium to large libraries (up to ~10,000 images) and powers Duplicate Image Detection smoothly.";

                    if (serverMb !== null) {
                      if (serverMb <= 128) {
                        bgClasses = "bg-amber-50/80 dark:bg-amber-950/40 border-l-4 border-l-amber-500 border border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-200";
                        iconColor = "text-amber-600 dark:text-amber-400";
                        recommendationText = "Best for small sites — under 500 images. Larger scans or Duplicate Image Detection may be slow or incomplete at this limit. Ask your host to raise it for bigger libraries.";
                      } else if (serverMb <= 256) {
                        bgClasses = "bg-blue-50/80 dark:bg-blue-950/40 border-l-4 border-l-blue-500 border border-blue-200/60 dark:border-blue-900/40 text-blue-900 dark:text-blue-200";
                        iconColor = "text-blue-600 dark:text-blue-400";
                        recommendationText = "Good for small to medium sites — up to about 2,000 images. Suitable for regular scans.";
                      } else if (serverMb >= 2048) {
                        bgClasses = "bg-purple-50/80 dark:bg-purple-950/40 border-l-4 border-l-purple-500 border border-purple-200/60 dark:border-purple-900/40 text-purple-900 dark:text-purple-200";
                        iconColor = "text-purple-600 dark:text-purple-400";
                        recommendationText = "Plenty of memory — ideal for very large media libraries (25,000+ images) and intensive duplicate image hashing.";
                      } else if (serverMb >= 1024) {
                        bgClasses = "bg-indigo-50/80 dark:bg-indigo-950/40 border-l-4 border-l-indigo-500 border border-indigo-200/60 dark:border-indigo-900/40 text-indigo-900 dark:text-indigo-200";
                        iconColor = "text-indigo-600 dark:text-indigo-400";
                        recommendationText = "Great for large sites and media-heavy libraries (10,000+ images) or frequent Duplicate Image Detection scans.";
                      }
                    }

                    return (
                      <>
                        <div className="text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 px-3 py-1.5 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Current Server: <strong className="font-bold">{serverLimitLabel} (detected)</strong></span>
                        </div>
                        <p className={`text-[11px] ${subText} leading-relaxed`}>
                          This limit is managed by your hosting provider. Contact your host or update WP_MEMORY_LIMIT in your wp-config.php file to increase it.
                        </p>
                        {serverMb !== null && (
                          <div className={`p-3 rounded-lg flex items-start gap-2.5 ${bgClasses} transition-all duration-200`}>
                            <Info className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
                            <p className="text-xs leading-relaxed font-medium">
                              {recommendationText}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {renderSettingsActionFooter()}
          </div>
          )}

          {/* Card 3: Auto Clean Settings */}
          {activeSubTab === 'auto' && (
          <div id="section-auto-clean" className={`${cardBg} rounded-xl p-6 border shadow-2xs space-y-5`}>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white!">Auto Clean Settings</h3>
              <p className={`text-xs ${subText} mt-0.5`}>Configure how unused and trashed files are automatically cleaned.</p>
            </div>

            <div className="space-y-4">
              {/* 1. Auto-Trash Unused Files (toggle) */}
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <label className="font-bold text-xs text-gray-800 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                    <span>Auto-Trash Unused Files</span>
                    {proAutoTrashLocked && <ProLockBadge isDarkMode={isDarkMode} />}
                  </label>
                  <p className={`text-[11px] ${subText} mt-0.5 leading-relaxed`}>
                    Automatically move unused files to Trash after a scheduled scan. If disabled, you’ll need to review and trash them manually.
                  </p>
                </div>
                <div className={`flex items-center gap-2.5 shrink-0 ${proAutoTrashLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} onClick={() => handleToggle('autoTrashUnusedFiles')}>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${formData.autoTrashUnusedFiles ? 'bg-[#A61E69]' : 'bg-gray-300 dark:bg-slate-600'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${formData.autoTrashUnusedFiles ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <span className={`text-xs font-semibold ${formData.autoTrashUnusedFiles ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400'}`}>
                    {formData.autoTrashUnusedFiles ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* 2. Auto-Delete Media Trash (toggle) */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-[#243044]">
                <div className="pr-4 flex items-center gap-2">
                  <div>
                    <label className="font-bold text-xs text-gray-800 dark:text-slate-200 block">Auto-Delete Media Trash</label>
                    <p className={`text-[11px] ${subText} mt-0.5 leading-relaxed`}>
                      Permanently delete files in Media Trash after the set time below. If disabled, files stay in Trash until you delete them manually.
                    </p>
                  </div>
                  {proAutoPurgeLocked && <ProLockBadge isDarkMode={isDarkMode} />}
                </div>
                <div
                  className={`flex items-center gap-2.5 shrink-0 ${proAutoPurgeLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  onClick={() => {
                    if (proAutoPurgeLocked) {
                      setUpgradeModalOpen(true);
                      return;
                    }
                    handleToggle('autoPurgeTrashEnabled');
                  }}
                >
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${(!proAutoPurgeLocked && (formData.autoPurgeTrashEnabled ?? true)) ? 'bg-[#A61E69]' : 'bg-gray-300 dark:bg-slate-600'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${(!proAutoPurgeLocked && (formData.autoPurgeTrashEnabled ?? true)) ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <span className={`text-xs font-semibold ${(!proAutoPurgeLocked && (formData.autoPurgeTrashEnabled ?? true)) ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400'}`}>
                    {(!proAutoPurgeLocked && (formData.autoPurgeTrashEnabled ?? true)) ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* 3. Media Trash: Delete After (dropdown: 2/7/15/30 days) — greyed out when #2 is off */}
              {(() => {
                const isAutoDeleteOn = !proAutoPurgeLocked && (formData.autoPurgeTrashEnabled ?? true);
                return (
                  <div className="flex items-center justify-between pl-3 border-l-2 border-gray-100 dark:border-[#243044]">
                    <div>
                      <label className={`font-bold text-xs block ${isAutoDeleteOn ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500'}`}>Media Trash: Delete After</label>
                      <p className={`text-[11px] ${isAutoDeleteOn ? subText : 'text-gray-400/80 dark:text-slate-500/80'} mt-0.5`}>
                        Choose how long files stay in Media Trash before being permanently deleted.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        disabled={!isAutoDeleteOn}
                        value={formData.retentionDays || 7}
                        onChange={(e) => handleChange('retentionDays', parseInt(e.target.value))}
                        className={`text-xs p-2.5 bg-white dark:bg-slate-800 border rounded-lg font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                          isAutoDeleteOn
                            ? 'border-gray-200 dark:border-slate-700 cursor-pointer'
                            : 'border-gray-100 dark:border-[#243044] opacity-50 cursor-not-allowed text-gray-400'
                        }`}
                      >
                        <option value={2}>2 days</option>
                        <option value={7}>7 days (Default)</option>
                        <option value={15}>15 days</option>
                        <option value={30}>30 days</option>
                      </select>
                    </div>
                  </div>
                );
              })()}

              {/* 4. Minimum File Age */}
              {(() => {
                const minAgeLowest = formData.autoTrashUnusedFiles ? 1 : 0;
                const minAgeHighest = 365;
                const commitMinAge = (raw: string) => {
                  const n = parseInt(raw, 10);
                  if (Number.isNaN(n)) return;
                  handleChange('minFileAgeDays', Math.min(minAgeHighest, Math.max(minAgeLowest, n)));
                };
                return (
                  <div className="pt-3 border-t border-gray-100 dark:border-[#243044]">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-bold text-xs text-gray-800 dark:text-slate-200 block">Minimum File Age</label>
                        <p className={`text-[11px] ${subText} mt-0.5`}>Only clean files that are older than the specified number of days.</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          min={minAgeLowest}
                          max={minAgeHighest}
                          value={minFileAgeDraft ?? String(formData.minFileAgeDays ?? 7)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setMinFileAgeDraft(raw);
                            const n = parseInt(raw, 10);
                            // Apply only valid numbers inside the allowed range while typing; the rest is fixed on blur.
                            if (!Number.isNaN(n) && n >= minAgeLowest && n <= minAgeHighest) {
                              commitMinAge(raw);
                            }
                          }}
                          onBlur={() => {
                            if (minFileAgeDraft !== null) {
                              commitMinAge(minFileAgeDraft);
                            }
                            setMinFileAgeDraft(null);
                          }}
                          className="w-16 text-xs p-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg font-semibold text-center text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <span className={`text-xs ${subText}`}>days</span>
                      </div>
                    </div>
                    {formData.autoTrashUnusedFiles ? (
                      <p className={`text-[11px] ${subText} mt-1.5`}>With Auto-Trash on, at least 1 day is required so brand-new uploads are never trashed.</p>
                    ) : (formData.minFileAgeDays ?? 7) === 0 ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1.5">0 days means files uploaded today can be cleaned.</p>
                    ) : null}
                  </div>
                );
              })()}

              {/* 5. File Manager Trash Subsection (hidden unless File Manager is Professional AND switched ON) */}
              {fmActive && (
              <div className="pt-4 border-t border-gray-100 dark:border-[#243044] space-y-4">
                <div>
                  <h4 className="font-bold text-xs text-gray-900 dark:text-white! uppercase tracking-wider text-[11px]">File Manager Trash</h4>
                  <p className={`text-[11px] ${subText} mt-0.5`}>Independent auto-deletion controls for non-media files managed in File Manager.</p>
                </div>

                {/* FM Auto-Delete Toggle */}
                <div className="flex items-center justify-between">
                  <div className="pr-4">
                    <label className="font-bold text-xs text-gray-800 dark:text-slate-200 block">Enable Auto-Delete for File Manager Trash</label>
                    <p className={`text-[11px] ${subText} mt-0.5 leading-relaxed`}>
                      Files deleted via the File Manager stay in trash indefinitely until you enable this or empty trash manually. Off by default since File Manager handles general files, not just media.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => handleToggle('fmAutoPurgeTrashEnabled')}>
                    <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${formData.fmAutoPurgeTrashEnabled ? 'bg-[#A61E69]' : 'bg-gray-300 dark:bg-slate-600'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${formData.fmAutoPurgeTrashEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className={`text-xs font-semibold ${formData.fmAutoPurgeTrashEnabled ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400'}`}>
                      {formData.fmAutoPurgeTrashEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                {/* FM Trash Retention Dropdown */}
                {(() => {
                  const isFmAutoDeleteOn = !!formData.fmAutoPurgeTrashEnabled;
                  return (
                    <div className="flex items-center justify-between pl-3 border-l-2 border-gray-100 dark:border-[#243044]">
                      <div>
                        <label className={`font-bold text-xs block ${isFmAutoDeleteOn ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500'}`}>File Manager Trash: Delete After</label>
                        <p className={`text-[11px] ${isFmAutoDeleteOn ? subText : 'text-gray-400/80 dark:text-slate-500/80'} mt-0.5`}>
                          How long files deleted via the File Manager stay in trash before permanent deletion. Separate from Media Trash retention above.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          disabled={!isFmAutoDeleteOn}
                          value={formData.fmTrashRetentionDays || 7}
                          onChange={(e) => handleChange('fmTrashRetentionDays', parseInt(e.target.value))}
                          className={`text-xs p-2.5 bg-white dark:bg-slate-800 border rounded-lg font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                            isFmAutoDeleteOn
                              ? 'border-gray-200 dark:border-slate-700 cursor-pointer'
                              : 'border-gray-100 dark:border-[#243044] opacity-50 cursor-not-allowed text-gray-400'
                          }`}
                        >
                          <option value={2}>2 days</option>
                          <option value={7}>7 days (Default)</option>
                          <option value={15}>15 days</option>
                          <option value={30}>30 days</option>
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>
              )}
            </div>

            {renderSettingsActionFooter()}
          </div>
          )}
          
          {activeSubTab === 'schedule' && (
          <div id="section-schedule" className={`${cardBg} rounded-xl p-6 border shadow-2xs space-y-5 animate-fadeIn`}>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white!">Scheduled Scan</h3>
              <p className={`text-xs ${subText} mt-0.5`}>Automatically run a scan on a recurring schedule without manual action.</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-bold text-xs text-gray-800 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                    <span>Enable Scheduled Scan</span>
                    {proScheduledScanLocked && <ProLockBadge isDarkMode={isDarkMode} />}
                  </label>
                  <p className={`text-[11px] ${subText} mt-0.5`}>Enable or disable automatic recurring media scans.</p>
                </div>
                <div className={`flex items-center gap-2.5 ${proScheduledScanLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} onClick={() => handleToggle('enableScheduledScan')}>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${formData.enableScheduledScan ? 'bg-[#A61E69]' : 'bg-gray-300 dark:bg-slate-600'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${formData.enableScheduledScan ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <span className={`text-xs font-semibold ${formData.enableScheduledScan ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400'}`}>
                    {formData.enableScheduledScan ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className={`font-bold text-xs block ${formData.enableScheduledScan ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500'}`}>Scan Frequency</label>
                    <p className={`text-[11px] ${subText} mt-0.5`}>Choose how often the plugin should initiate an automatic scan.</p>
                  </div>
                  <select
                    disabled={!formData.enableScheduledScan}
                    value={formData.scheduledScanFrequency || 7}
                    onChange={(e) => handleChange('scheduledScanFrequency', parseInt(e.target.value))}
                    className={`text-xs p-2.5 bg-white dark:bg-slate-800 border rounded-lg font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      formData.enableScheduledScan 
                        ? 'border-gray-200 dark:border-slate-700 cursor-pointer' 
                        : 'border-gray-100 dark:border-[#243044] opacity-50 cursor-not-allowed text-gray-400'
                    }`}
                  >
                    <option value={7}>7 days (Default)</option>
                    <option value={15}>15 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                  </select>
                </div>
                <p className={`text-[11px] leading-relaxed ${formData.enableScheduledScan ? subText : 'text-gray-400/80 dark:text-slate-500/80'}`}>
                  The plugin will automatically run a scan every {formData.scheduledScanFrequency || 7} days using your configured Scan Method and Scan File Types in Scan Settings.
                </p>
              </div>

              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className={`font-bold text-xs block ${formData.enableScheduledScan ? 'text-gray-800 dark:text-slate-200' : 'text-gray-400 dark:text-slate-500'}`}>Preferred Scan Time</label>
                    <p className={`text-[11px] ${subText} mt-0.5`}>Choose an off-peak hour (e.g. late night) to minimize impact on site performance.</p>
                  </div>
                  <input
                    type="time"
                    disabled={!formData.enableScheduledScan}
                    value={formData.scheduledScanTime || '02:00'}
                    onChange={(e) => handleChange('scheduledScanTime', e.target.value)}
                    className={`text-xs p-2.5 bg-white dark:bg-[#1e293b] border rounded-lg font-semibold text-gray-800 dark:text-[#e7ecf3] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      formData.enableScheduledScan 
                        ? 'border-gray-200 dark:border-[#334155] cursor-pointer' 
                        : 'border-gray-100 dark:border-[#243044] opacity-50 cursor-not-allowed text-gray-400'
                    }`}
                  />
                </div>
              </div>

              {formData.enableScheduledScan && (
                <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 rounded-lg p-3 flex items-start gap-2.5 animate-fadeIn">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300 font-medium">
                    Next scheduled scan: <span className="font-extrabold text-blue-900 dark:text-blue-200">{(() => {
                      const days = formData.scheduledScanFrequency || 7;
                      const [hStr, mStr] = (formData.scheduledScanTime || '02:00').split(':');
                      const d = new Date();
                      d.setDate(d.getDate() + days);
                      d.setHours(parseInt(hStr, 10) || 2, parseInt(mStr, 10) || 0, 0, 0);
                      return formatDateWithTimeZone(d, formData.timeZone, formData.dateFormat);
                    })()}</span>
                  </div>
                </div>
              )}
            </div>

            {renderSettingsActionFooter()}
          </div>
          )}

          {/* Card 4: Exclusions (Global) */}
          {activeSubTab === 'exclusions' && (
          <div id="section-exclusions" className={`${cardBg} rounded-xl p-6 border shadow-2xs space-y-5`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white!">Exclusions (Global)</h3>
                <p className={`text-xs ${subText} mt-0.5`}>
                  Folders and wildcard file patterns excluded from scanning and deletion.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setExclusionTab('folders');
                      setExclusionError(null);
                    }}
                    className={`pb-0.5 border-b-2 transition-colors cursor-pointer ${
                      exclusionTab === 'folders' ? 'text-[#A61E69] border-[#A61E69]' : 'text-gray-400 border-transparent hover:text-gray-600 dark:hover:text-slate-300'
                    }`}
                  >
                    Exclude Folders ({currentExcludedFolders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExclusionTab('files');
                      setExclusionError(null);
                    }}
                    className={`pb-0.5 border-b-2 transition-colors cursor-pointer ${
                      exclusionTab === 'files' ? 'text-[#A61E69] border-[#A61E69]' : 'text-gray-400 border-transparent hover:text-gray-600 dark:hover:text-slate-300'
                    }`}
                  >
                    Exclude Files ({currentExcludedFiles.length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {exclusionTab === 'folders' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setExclusionError(null);
                          setIsFolderBrowserOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <FolderTree className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Browse Folder Tree</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExclusionError(null);
                          setShowAddExclusionInput(!showAddExclusionInput);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Path</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setExclusionError(null);
                          setIsMediaPickerOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Pick from Media Library</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExclusionError(null);
                          setShowAddExclusionInput(!showAddExclusionInput);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 border border-gray-200 dark:border-slate-600 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Pattern</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Inline Validation Guardrail Error Banner */}
            {exclusionError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-start justify-between gap-3 animate-fadeIn">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{exclusionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExclusionError(null)}
                  className="p-1 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {showAddExclusionInput && (
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-indigo-200 dark:border-indigo-900/60 shadow-xs">
                <input
                  type="text"
                  placeholder={
                    exclusionTab === 'folders'
                      ? '/wp-content/uploads/custom-folder/'
                      : '*-thumbnail.jpg, invoice-*.pdf, or .htaccess'
                  }
                  value={newExclusionInput}
                  onChange={(e) => {
                    setNewExclusionInput(e.target.value);
                    if (exclusionError) setExclusionError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExclusion();
                    }
                  }}
                  className="flex-1 text-xs p-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-200 dark:placeholder:text-[#5b6579] outline-none font-mono focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={handleAddExclusion}
                  className="px-3.5 py-2 bg-[#A61E69] hover:bg-[#8F1B5A] text-white text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-2xs"
                >
                  Add Rule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddExclusionInput(false);
                    setExclusionError(null);
                  }}
                  className="px-2.5 py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* List of Exclusions */}
            <div className="space-y-2.5">
              {(exclusionTab === 'folders' ? currentExcludedFolders : currentExcludedFiles).map((item, index) => {
                const itemPath = typeof item === 'string' ? item : item.path;
                const isPreSeeded = typeof item === 'object' && item.isPreSeeded;
                const note = typeof item === 'object' ? item.note : null;
                const isLocked = exclusionTab === 'folders' && /\/imgsentry\/(backups|trash)\/?$/i.test(itemPath);

                return (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-50/70 dark:bg-slate-800/60 rounded-xl border border-gray-200/80 dark:border-slate-700/70 gap-2 transition-all hover:border-gray-300 dark:hover:border-slate-600"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      {/* Icon */}
                      {exclusionTab === 'folders' ? (
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}

                      {/* Path / Wildcard */}
                      <span className="text-xs font-mono font-semibold text-gray-800 dark:text-slate-200 break-all">
                        {itemPath}
                      </span>

                      {/* Seeded Recommendation Badge Tag */}
                      {isPreSeeded && (
                        <span 
                          className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-md border border-emerald-200/80 dark:border-emerald-800/80 shrink-0 flex items-center gap-1"
                          title={note || 'Added automatically — recommended'}
                        >
                          <Shield className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Recommended</span>
                        </span>
                      )}
                    </div>

                    {isLocked ? (
                      <span
                        className="px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-900/50 rounded-md flex items-center gap-1 shrink-0"
                        title="This ImgSentry folder is always protected and cannot be removed"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Always protected</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveClick(index, item, exclusionTab === 'folders' ? 'folder' : 'file')}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-red-200/80 dark:border-red-900/40 transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                        title="Remove exclusion rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {(exclusionTab === 'folders' ? currentExcludedFolders : currentExcludedFiles).length === 0 && (
                <div className="p-4 text-center text-xs text-gray-500 dark:text-slate-400 border border-dashed border-gray-300 dark:border-slate-600 rounded-xl">
                  {exclusionTab === 'folders'
                    ? 'No folder exclusions yet. Use "Browse Folder Tree" or "Add Path" to add one.'
                    : 'No file patterns yet. Use "Pick from Media Library" or "Add Pattern" to add one.'}
                </div>
              )}
            </div>

            {/* Always-Protected System Paths (Core Enforced) */}
            <div className="mt-6 pt-5 border-t border-gray-200/80 dark:border-slate-700/80 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h4 className="font-bold text-xs text-gray-900 dark:text-white! uppercase tracking-wider">
                  Always-Protected System Paths (Core Enforced)
                </h4>
              </div>
              <p className={`text-xs ${subText} leading-relaxed`}>
                Regardless of custom rules, these critical boundaries are hard-blocked at the code level from being scanned, flagged, or deleted.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {ALWAYS_PROTECTED_REASONS.map((protectedRule, idx) => (
                  <div 
                    key={idx}
                    className="p-3 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 rounded-xl space-y-1 text-xs"
                  >
                    <div className="font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{protectedRule.title}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-slate-400 leading-relaxed">
                      {protectedRule.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {renderSettingsActionFooter()}
          </div>
          )}

          {/* Permissions: one page, one heading, one Save button (UI lives in PermissionsManager) */}
          {activeSubTab === 'permissions' && (
          <div id="section-permissions">
            <PermissionsManager
              isDarkMode={isDarkMode}
              restrictToAdmins={Boolean(formData.restrictToAdmins)}
              onToggleRestrict={() => handleToggle('restrictToAdmins')}
              settingsDirty={hasUnsavedChanges}
              onSaveSettings={() => handleSubmit()}
              onDiscardSettings={() => setFormData({
                ...settings,
                defaultScanType: normalizeDefaultScanType(settings?.defaultScanType),
              })}
            />
          </div>
          )}

          {/* Card: File Manager */}
          {activeSubTab === 'file_manager' && fmActive && (() => {
            const viewMode = formData.fileManagerViewMode ?? 'list';
            const rawTheme = formData.fileManagerTheme ?? 'light';
            const theme = ['light', 'dark', 'auto'].includes(rawTheme) ? rawTheme : 'light';
            const maxUploadMB = formData.fileManagerMaxUploadMB ?? 50;
            const privateFolder = formData.fileManagerPrivateFolderAccess ?? '';
            const notifyOnUpload = formData.fileManagerNotifyOnUpload ?? false;
            const notifyOnDownload = formData.fileManagerNotifyOnDownload ?? false;
            const notifyOnEdit = formData.fileManagerNotifyOnEdit ?? false;
            const notifyOnChanges = formData.fileManagerNotifyOnChanges ?? false;

            const BASE_USER_ROLES = [
              { slug: 'editor', label: 'Editor' },
              { slug: 'author', label: 'Author' },
              { slug: 'contributor', label: 'Contributor' },
              { slug: 'subscriber', label: 'Subscriber' },
            ];
            const ALL_USER_ROLES = fetchedRoles.length > 0 ? fetchedRoles : BASE_USER_ROLES;

            const fmTabs = [
              { id: 'general', label: 'General', icon: Settings },
              { id: 'code', label: 'Code Editor', icon: FileCode },
              { id: 'users', label: 'User Restrictions', icon: User },
              { id: 'roles', label: 'User Role Restrictions', icon: Users },
              { id: 'folders', label: 'Folder Access', icon: FolderCheck },
            ];

            return (
              <div id="section-file-manager" className="rounded-xl border border-gray-200/80 dark:border-slate-700/80 shadow-2xs overflow-hidden">
                {/* File Manager Custom Top Tab Navigation Bar - Styled matching Screenshot_232.png */}
                <div className="flex w-full overflow-hidden border-b border-gray-200 dark:border-[#243044]">
                  {fmTabs.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = fmActiveTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFmActiveTab(tab.id as any)}
                        className={`flex-1 flex flex-col items-center justify-center py-4 px-2 border-r border-gray-100/10 last:border-r-0 transition-all cursor-pointer select-none ${
                          isActive
                            ? 'bg-[#7a113f] text-white shadow-inner font-bold border-b-4 border-[#ff7ebb]'
                            : 'bg-[#A61E69] text-white/90 hover:bg-[#91185b] hover:text-white'
                        }`}
                      >
                        <TabIcon className={`w-5 h-5 text-white mb-2 ${isActive ? 'scale-110' : 'opacity-90'} transition-transform`} />
                        <span className="font-['Red_Hat_Display',sans-serif] text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center">
                          {tab.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Content Body Area */}
                <div className={`${cardBg} p-6`}>
                  
                  {/* TAB 1: GENERAL & GLOBAL ACCESS */}
                  {fmActiveTab === 'general' && (
                    <div className="space-y-8 p-1 sm:p-2">

                      {/* Who can open the File Manager */}
                      <div className="space-y-2">
                        <span className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                          Who Can Open the File Manager
                        </span>
                        <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block">
                          Administrators always can. Any other user or role can open it only after you give them a rule in the Folder Access tab.
                        </span>
                        <span className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Anyone with the <code className="font-mono font-semibold">manage_options</code> capability skips all File Manager rules.</span>
                        </span>
                      </div>


                      {/* Separate or Private Folder Access */}
                      <div className="space-y-3 pt-6 border-t border-gray-100 dark:border-[#243044]/60">
                        <div>
                          <label htmlFor="fileManagerPrivateFolderAccess" className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                            Separate or Private Folder Access
                          </label>
                          <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                            Optional. The File Manager opens only this folder. It must be inside wp-content. Leave empty for the default.
                          </span>
                        </div>
                        <div className="flex items-center gap-2 max-w-2xl">
                          <input
                            id="fileManagerPrivateFolderAccess"
                            type="text"
                            value={privateFolder}
                            onChange={(e) => handleChange('fileManagerPrivateFolderAccess', e.target.value)}
                            placeholder="wp-content/plugins"
                            className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 dark:placeholder:text-[#5b6579] px-3.5 py-2.5 text-xs font-mono focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAclFolderRowIndex(-1);
                              setIsFolderBrowserOpen(true);
                            }}
                            className="p-2.5 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-colors shrink-0 cursor-pointer flex items-center justify-center shadow-xs"
                            title="Browse Directory"
                          >
                            <FolderOpen className="w-4 h-4 text-[#A61E69] dark:text-pink-400" />
                          </button>
                        </div>
                        <div className="p-3 bg-gray-50/80 dark:bg-slate-900/40 rounded-xl border border-gray-100 dark:border-[#243044]/50 text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                          <span>Example: </span>
                          <code className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 font-semibold">wp-content/plugins</code>
                          <span className="mx-2 text-gray-300 dark:text-slate-700">|</span>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">Note:</span> <span className="italic">Valid globally for all user roles.</span>
                        </div>
                      </div>

                      {/* Global Folder & File Security */}
                      <div className="space-y-5 pt-6 border-t border-gray-100 dark:border-[#243044]/60">
                        <div className="space-y-1.5">
                          <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                            Global Folder & File Security
                          </label>
                          <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                            These restriction policies apply globally to all restricted (non-admin) workspace users across every directory, regardless of their individual permission tier.
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5 pt-0.5">
                            <Shield className="w-3.5 h-3.5 text-[#A61E69]" />
                            <span>These are pre-filled with recommended security defaults — you can edit or clear them, but we recommend keeping core system files protected.</span>
                          </span>
                        </div>

                        {/* Hidden Folders/Files Textarea */}
                        <div className="space-y-2 max-w-2xl pt-2">
                          <div className="flex items-center justify-between">
                            <label htmlFor="fileManagerGlobalHiddenPaths" className="font-sans font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                              Global Cloaked Pathways (Hidden Directories/Files)
                            </label>
                            <button
                              type="button"
                              onClick={() => handleChange('fileManagerGlobalHiddenPaths', 'wp-config.php|.htaccess|.env|.git|wp-content/themes|wp-content/plugins|wp-content/uploads/imgsentry')}
                              className="text-[11px] font-bold text-[#A61E69] hover:text-[#8F1B5A] hover:underline flex items-center gap-1 cursor-pointer transition-colors bg-transparent border-0 p-0 outline-none"
                            >
                              <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                              <span>Reset to Recommended Defaults</span>
                            </button>
                          </div>
                          <textarea
                            id="fileManagerGlobalHiddenPaths"
                            value={formData.fileManagerGlobalHiddenPaths ?? ''}
                            onChange={(e) => handleChange('fileManagerGlobalHiddenPaths', e.target.value)}
                            placeholder="wp-content/themes|wp-content/plugins"
                            rows={2}
                            className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 dark:placeholder:text-[#5b6579] px-3.5 py-2.5 text-xs font-mono focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all"
                          />
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal italic">
                            Specify directory structures or specific file paths to make completely invisible to non-admins. Separate paths with a vertical bar (|).
                          </p>
                        </div>

                        {/* Locked File Extensions Textarea */}
                        <div className="space-y-2 max-w-2xl pt-2">
                          <div className="flex items-center justify-between">
                            <label htmlFor="fileManagerGlobalLockedExtensions" className="font-sans font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                              Global Read-Only File Extensions Lock
                            </label>
                            <button
                              type="button"
                              onClick={() => handleChange('fileManagerGlobalLockedExtensions', '.php|.htaccess|.env|.sh|.sql')}
                              className="text-[11px] font-bold text-[#A61E69] hover:text-[#8F1B5A] hover:underline flex items-center gap-1 cursor-pointer transition-colors bg-transparent border-0 p-0 outline-none"
                            >
                              <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                              <span>Reset to Recommended Defaults</span>
                            </button>
                          </div>
                          <textarea
                            id="fileManagerGlobalLockedExtensions"
                            value={formData.fileManagerGlobalLockedExtensions ?? ''}
                            onChange={(e) => handleChange('fileManagerGlobalLockedExtensions', e.target.value)}
                            placeholder=".php|.png|.css"
                            rows={2}
                            className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 dark:placeholder:text-[#5b6579] px-3.5 py-2.5 text-xs font-mono focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all"
                          />
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal italic">
                            Define file extensions that remain locked/read-only for all non-admins, even in folders where they have Edit or Full Control access. Separate multiple extensions with a pipe symbol (|).
                          </p>
                        </div>
                      </div>

                      {/* Maximum Upload Size */}
                      <div className="space-y-3 pt-6 border-t border-gray-100 dark:border-[#243044]/60">
                        <div>
                          <label htmlFor="fileManagerMaxUploadMB" className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                            Maximum Upload Size
                          </label>
                          <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                            Largest file size allowed for one upload (1-2048 MB).
                          </span>
                        </div>
                        <div className="flex items-center gap-2 max-w-xs">
                          <input
                            id="fileManagerMaxUploadMB"
                            type="number"
                            min={1}
                            max={2048}
                            value={fmMaxUploadDraft ?? String(maxUploadMB)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setFmMaxUploadDraft(raw);
                              const n = parseInt(raw, 10);
                              if (!Number.isNaN(n) && n >= 1 && n <= 2048) {
                                handleChange('fileManagerMaxUploadMB', n);
                              }
                            }}
                            onBlur={() => {
                              if (fmMaxUploadDraft !== null) {
                                const n = parseInt(fmMaxUploadDraft, 10);
                                if (!Number.isNaN(n)) {
                                  handleChange('fileManagerMaxUploadMB', Math.min(2048, Math.max(1, n)));
                                }
                              }
                              setFmMaxUploadDraft(null);
                            }}
                            className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all"
                          />
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-3.5 py-2.5 bg-gray-100 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shrink-0 select-none">
                            MB
                          </span>
                        </div>
                      </div>

                      {/* Email notifications for File Manager activity */}
                      <div className="pt-6 border-t border-gray-100 dark:border-[#243044]/60 space-y-4">
                        <div>
                          <span className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                            Email Notifications
                          </span>
                          <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                            Every action is always saved in the File Manager log. Turn on an email below to also get a summary, sent as one email per day.
                          </span>
                        </div>
                        {[
                          { key: 'fileManagerNotifyOnUpload', label: 'Email me when files are uploaded', value: notifyOnUpload },
                          { key: 'fileManagerNotifyOnDownload', label: 'Email me when files are downloaded', value: notifyOnDownload },
                          { key: 'fileManagerNotifyOnEdit', label: 'Email me when files are edited', value: notifyOnEdit },
                          { key: 'fileManagerNotifyOnChanges', label: 'Email me when files are deleted, renamed, moved or extracted', value: notifyOnChanges },
                        ].map((row) => (
                          <div
                            key={row.key}
                            className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80"
                          >
                            <span className="font-['Red_Hat_Display',sans-serif] font-semibold text-[14px] text-slate-800 dark:text-slate-100">
                              {row.label}
                            </span>
                            <ToggleSwitch
                              checked={row.value}
                              onChange={() => handleChange(row.key as keyof PluginSettings, !row.value)}
                              label={row.label}
                            />
                          </div>
                        ))}
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            Sent to the Notification Email in Settings &gt; General (or the WordPress admin email if empty). Emails use WordPress <code className="font-mono font-semibold">wp_mail()</code>; if they do not arrive, install an SMTP plugin.
                          </span>
                        </p>
                      </div>
                      {/* Row: Default View Mode & Theme side-by-side (Moved under Send Notifications on edit) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100 dark:border-[#243044]/60">
                        {/* Default View Mode */}
                        <div className="space-y-3">
                          <div>
                            <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              Default Files View Mode
                            </label>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                              Choose the default layout when loading the File Manager dashboard.
                            </span>
                          </div>
                          <div className="inline-flex p-1 rounded-xl bg-gray-100/80 dark:bg-slate-900 border border-gray-200/60 dark:border-[#243044] gap-1 w-full max-w-sm">
                            <button
                              type="button"
                              onClick={() => handleChange('fileManagerViewMode', 'list')}
                              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                viewMode === 'list'
                                  ? 'bg-white dark:bg-slate-800 text-[#A61E69] dark:text-pink-400 shadow-sm font-bold'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              <List className="w-4 h-4" />
                              <span>List View</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleChange('fileManagerViewMode', 'grid')}
                              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                viewMode === 'grid'
                                  ? 'bg-white dark:bg-slate-800 text-[#A61E69] dark:text-pink-400 shadow-sm font-bold'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                              }`}
                            >
                              <Grid className="w-4 h-4" />
                              <span>Grid View</span>
                            </button>
                          </div>
                        </div>

                        {/* File Manager Theme */}
                        <div className="space-y-3">
                          <div>
                            <label htmlFor="fileManagerTheme" className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              File Manager Theme
                            </label>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                              Select a visual color theme preference for the workspace panel.
                            </span>
                          </div>
                          <select
                            id="fileManagerTheme"
                            value={theme}
                            onChange={(e) => handleChange('fileManagerTheme', e.target.value)}
                            className="w-full max-w-sm rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all cursor-pointer"
                          >
                            <option value="light">Light Mode</option>
                            <option value="dark">Dark Mode</option>
                            <option value="auto">Auto (System)</option>
                          </select>
                        </div>
                      </div>

                      {/* Coming soon: these switches have no effect yet, so they are shown locked */}
                      <div className="pt-6 border-t border-gray-100 dark:border-[#243044]/60 space-y-4">
                        {[
                          { title: 'Disable Local File System ?', hint: 'Coming soon.' },
                          { title: 'Disable Database Manager ?', hint: 'Coming soon. The Database Manager is not available yet.' },
                        ].map((item) => (
                          <div
                            key={item.title}
                            className="flex items-center justify-between gap-4 p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80"
                          >
                            <div className="space-y-1">
                              <span className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                                {item.title}
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60">
                                  Coming soon
                                </span>
                              </span>
                              <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block">{item.hint}</span>
                            </div>
                            <ToggleSwitch checked={false} disabled onChange={() => {}} label={item.title} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: CODE EDITOR SETTINGS */}
                  {fmActiveTab === 'code' && (
                    <div className="space-y-6 p-1 sm:p-2">
                      {/* 2-Column Grid of 6 Setting Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        
                        {/* Field 1: Editor Theme */}
                        <div className="p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80 hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-all space-y-3">
                          <div>
                            <label htmlFor="codeEditorTheme" className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              Editor Theme
                            </label>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                              Choose a visual syntax and interface theme for the editor canvas.
                            </span>
                          </div>
                          <select
                            id="codeEditorTheme"
                            value={codeEditorTheme}
                            onChange={(e) => {
                              const val = e.target.value as any;
                              setCodeEditorTheme(val);
                              if (typeof window !== 'undefined' && (window as any).ImgSentryFM && typeof (window as any).ImgSentryFM.setEditorTheme === 'function') {
                                (window as any).ImgSentryFM.setEditorTheme(val);
                              }
                            }}
                            className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all"
                          >
                            <option value="dark">Dark (Default)</option>
                            <option value="light">Light</option>
                            <option value="monokai">Monokai</option>
                            <option value="dracula">Dracula</option>
                            <option value="solarized">Solarized</option>
                          </select>
                        </div>

                        {/* Field 2: Allow Fullscreen Mode */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80 hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-all">
                          <div className="space-y-1">
                            <span className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              Allow Fullscreen Mode
                            </span>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block">
                              Let users expand the code editor to fullscreen while editing a file.
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-2 sm:mt-0">
                            <input
                              type="checkbox"
                              checked={codeEditorFullscreen}
                              onChange={(e) => setCodeEditorFullscreen(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200/80 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-[#A61E69]"></div>
                          </label>
                        </div>

                        {/* Field 3: Font Size */}
                        <div className="p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80 hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-all space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <label htmlFor="codeEditorFontSize" className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                                Font Size
                              </label>
                              <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                                Adjust the text size for code editing (10px – 24px).
                              </span>
                            </div>
                            <span className="text-xs font-bold font-mono text-[#A61E69] dark:text-pink-400 bg-[#A61E69]/10 dark:bg-pink-500/10 px-2.5 py-1 rounded-lg shrink-0">
                              {codeEditorFontSize}px
                            </span>
                          </div>
                          <div className="pt-1">
                            <input
                              id="codeEditorFontSize"
                              type="range"
                              min="10"
                              max="24"
                              value={codeEditorFontSize}
                              onChange={(e) => setCodeEditorFontSize(parseInt(e.target.value, 10))}
                              className="w-full accent-[#A61E69] cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Field 4: Tab Size / Indentation */}
                        <div className="p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80 hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-all space-y-3">
                          <div>
                            <label htmlFor="codeEditorTabSize" className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              Tab Size / Indentation
                            </label>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block mt-1">
                              Number of spaces or character used for indentation.
                            </span>
                          </div>
                          <select
                            id="codeEditorTabSize"
                            value={codeEditorTabSize}
                            onChange={(e) => setCodeEditorTabSize(e.target.value as any)}
                            className="w-full rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all"
                          >
                            <option value="2">2 spaces</option>
                            <option value="4">4 spaces (Default)</option>
                            <option value="tab">Tab character</option>
                          </select>
                        </div>

                        {/* Field 5: Code Folding */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80 hover:bg-gray-50/80 dark:hover:bg-slate-800/30 transition-all">
                          <div className="space-y-1">
                            <span className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              Code Folding
                            </span>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block">
                              Allow collapsing code blocks and functions to make large files easier to navigate.
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-2 sm:mt-0">
                            <input
                              type="checkbox"
                              checked={codeEditorFolding}
                              onChange={(e) => setCodeEditorFolding(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200/80 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-[#A61E69]"></div>
                          </label>
                        </div>

                      </div>
                    </div>
                  )}

                  {/* TAB 3: USER RESTRICTIONS */}
                  {fmActiveTab === 'users' && (() => {
                    const userRestrictions = operationRestrictions.filter(r => r.subject_type === 'user');

                    const handleAddUserRule = () => {
                      const defaultUserSubject = wpUsers.length > 0 ? String(wpUsers[0].id) : '';
                      const newRule: FileManagerOperationRestriction = {
                        id: `user-rule-${Date.now()}-${Math.random()}`,
                        subject_type: 'user',
                        subject_id: defaultUserSubject,
                        forbidden_operations: [],
                        disabledOperations: [],
                        disable_toolbar: false,
                        disableToolbar: false,
                        disable_context_menu: false,
                        disableContextMenu: false,
                        isExpanded: true
                      };
                      setOperationRestrictions(prev => [...prev, newRule]);
                    };

                    const handleDeleteUserRule = (ruleId: string) => {
                      handleDeleteOperationRestriction(ruleId);
                    };

                    const handleUpdateUserRule = (ruleId: string, fields: Partial<FileManagerOperationRestriction>) => {
                      setOperationRestrictions(prev => prev.map(r => r.id === ruleId ? { ...r, ...fields } : r));
                    };

                    const handleToggleUserRuleExpanded = (ruleId: string) => {
                      setOperationRestrictions(prev => prev.map(r => r.id === ruleId ? { ...r, isExpanded: r.isExpanded === false ? true : !r.isExpanded } : r));
                    };

                    return (
                      <div className="space-y-6">
                        {/* Title Block */}
                        <div className="pb-4 border-b border-gray-100 dark:border-[#243044]/80">
                          <h4 className="font-['Red_Hat_Display',sans-serif] font-bold text-sm uppercase text-slate-800 dark:text-slate-200! tracking-wider flex items-center gap-2.5">
                            <ShieldCheck className="w-4.5 h-4.5 text-[#A61E69]" />
                            <span>Disable or Ban WP File Manager Operations to Users</span>
                          </h4>
                          <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1 pl-7">
                            Select users and disable operation.
                          </p>
                        </div>

                        {/* User Restrictions Explanation Banner */}
                        <div className="p-4 rounded-2xl bg-blue-500/[0.04] dark:bg-blue-500/[0.02] border-l-4 border-l-[#A61E69] border border-gray-100 dark:border-[#243044]/80 text-[13px] text-slate-700 dark:text-slate-300 flex items-start gap-3 shadow-xs">
                          <Info className="w-4 h-4 text-[#A61E69] dark:text-pink-400 shrink-0 mt-0.5" />
                          <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                            Administrators are never restricted. A rule for a specific user replaces the rules of that user's roles completely (they are not combined). A user rule with nothing selected means that user has no restrictions at all.
                          </p>
                        </div>

                        {/* Empty Users State Callout if site has no non-admin users */}
                        {!isLoadingWpUsers && wpUsers.length === 0 && (
                          <div className="p-4 rounded-2xl bg-amber-500/[0.04] dark:bg-amber-500/[0.02] border-l-4 border-l-amber-500 border border-amber-500/20 dark:border-amber-500/10 text-[13px] text-slate-700 dark:text-slate-300 flex items-start gap-3 shadow-xs">
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-bold text-amber-800 dark:text-amber-400 mr-1.5">No other users found:</span>
                              <span className="text-[12.5px] leading-relaxed">
                                Create additional WordPress user accounts to assign user-specific rules.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Add Rule Action Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80">
                          <div className="space-y-1">
                            <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              Click to Add Rules
                            </label>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block">
                              Configure specific file manager access policies for your workspace users.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddUserRule}
                            className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] shadow-xs hover:shadow-md transition-all cursor-pointer shrink-0 mt-2 sm:mt-0"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                            <span>Add rule for Users</span>
                          </button>
                        </div>

                        {/* Rules Display Container */}
                        <div className="space-y-4">
                          {userRestrictions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-gray-200 dark:border-[#243044]/80 rounded-2xl bg-gray-50/20 dark:bg-slate-900/5 text-center">
                              <User className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2.5" />
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No active user restriction rules configured.</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Click the button above to add a new rule set.</p>
                            </div>
                          ) : (
                            userRestrictions.map((rule) => {
                              const isExpanded = rule.isExpanded !== false;
                              return (
                                <div key={rule.id} className="rounded-2xl border border-gray-100 dark:border-[#243044]/80 bg-white dark:bg-slate-900/40 overflow-hidden shadow-xs hover:shadow-sm transition-all">
                                  {/* Header area */}
                                  <div className="flex items-center justify-between p-4 bg-gray-50/30 dark:bg-slate-900/10">
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">If User is</span>
                                      <select
                                        value={rule.subject_id}
                                        onChange={(e) => handleUpdateUserRule(rule.id, { subject_id: e.target.value })}
                                        disabled={isLoadingWpUsers || wpUsers.length === 0}
                                        className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                      >
                                        {isLoadingWpUsers ? (
                                          <option value="">Loading users...</option>
                                        ) : wpUsers.length === 0 ? (
                                          <option value="">No users available</option>
                                        ) : (
                                          wpUsers.map(u => (
                                            <option key={u.id} value={String(u.id)}>
                                              {u.display_name} ({u.username})
                                            </option>
                                          ))
                                        )}
                                      </select>
                                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Then</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleUserRuleExpanded(rule.id)}
                                        className="p-1.5 text-slate-500 hover:text-[#A61E69] dark:hover:text-pink-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
                                        title={isExpanded ? "Collapse Rule Options" : "Expand Rule Options"}
                                      >
                                        <svg className={`w-4 h-4 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteUserRule(rule.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                                        title="Delete Rule"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Expandable Options Body */}
                                  {isExpanded && (
                                    <div className="p-5 border-t border-gray-100 dark:border-[#243044]/60 bg-white dark:bg-slate-900/20 space-y-5">
                                      {/* Disable Operations */}
                                      <div className="space-y-4">
                                        <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[14px] text-slate-800 dark:text-slate-100 block">
                                          Disable Operations
                                        </label>
                                        <div className="space-y-4 p-4 bg-gray-50/50 dark:bg-[#0b1220]/20 rounded-xl border border-gray-100 dark:border-[#243044]/40">
                                          {OPERATION_GROUPS.map((group) => {
                                            return (
                                              <div key={group.label} className="space-y-1.5">
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans">
                                                  {group.label}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  {group.items.map((op) => {
                                                    const disabledList = rule.disabledOperations ?? rule.forbidden_operations ?? [];
                                                    const isChecked = disabledList.includes(op.key);
                                                    const toggleOp = () => {
                                                      const updatedList = isChecked
                                                        ? disabledList.filter(k => k !== op.key)
                                                        : [...disabledList, op.key];
                                                      handleUpdateUserRule(rule.id, { disabledOperations: updatedList, forbidden_operations: updatedList });
                                                    };
                                                    return (
                                                      <label
                                                        key={op.key}
                                                        onClick={toggleOp}
                                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition-all group shrink-0 ${
                                                          isChecked
                                                            ? 'bg-[#A61E69]/[0.03] border-[#A61E69] text-[#A61E69] dark:text-pink-300 font-semibold shadow-2xs'
                                                            : 'bg-white dark:bg-slate-900 border-gray-200/80 dark:border-[#243044] text-slate-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-700'
                                                        }`}
                                                      >
                                                        {/* Compact custom modern checkbox (size ~15px) */}
                                                        <div className={`w-4 h-4 rounded-md border transition-all flex items-center justify-center shrink-0 ${
                                                          isChecked
                                                            ? 'bg-[#A61E69] border-[#A61E69] text-white'
                                                            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-gray-400'
                                                        }`}>
                                                          {isChecked && (
                                                            <svg className="w-3 h-3 text-white stroke-[4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                          )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                          <span className="text-[11px] tracking-tight">{op.label}</span>
                                                          {op.note && (
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal leading-tight">
                                                              {op.note}
                                                            </span>
                                                          )}
                                                        </div>
                                                      </label>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      {/* Disable Toolbar & Context Menu */}
                                      <div className="space-y-2.5 pt-1">
                                        <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[14px] text-slate-800 dark:text-slate-100 block">
                                          Disable Toolbar and Context Menu
                                        </label>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                          {/* Disable Toolbar */}
                                          <label
                                            onClick={() => {
                                              const currentToolbar = Boolean(rule.disableToolbar ?? rule.disable_toolbar);
                                              handleUpdateUserRule(rule.id, { disableToolbar: !currentToolbar, disable_toolbar: !currentToolbar });
                                            }}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all group flex-1 ${
                                              Boolean(rule.disableToolbar ?? rule.disable_toolbar)
                                                ? 'bg-[#A61E69]/[0.03] border-[#A61E69] text-[#A61E69] dark:text-pink-300 shadow-xs'
                                                : 'bg-white dark:bg-slate-900/60 border-gray-200 dark:border-[#243044] text-slate-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                                            }`}
                                          >
                                            <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center shrink-0 ${
                                              Boolean(rule.disableToolbar ?? rule.disable_toolbar)
                                                ? 'bg-[#A61E69] border-[#A61E69] text-white'
                                                : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-gray-400'
                                            }`}>
                                              {Boolean(rule.disableToolbar ?? rule.disable_toolbar) && (
                                                <svg className="w-3.5 h-3.5 text-white stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                              )}
                                            </div>
                                            <span className="text-xs font-semibold capitalize tracking-tight">Disable Toolbar</span>
                                          </label>

                                          {/* Disable Context Menu */}
                                          <label
                                            onClick={() => {
                                              const currentContextMenu = Boolean(rule.disableContextMenu ?? rule.disable_context_menu);
                                              handleUpdateUserRule(rule.id, { disableContextMenu: !currentContextMenu, disable_context_menu: !currentContextMenu });
                                            }}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all group flex-1 ${
                                              Boolean(rule.disableContextMenu ?? rule.disable_context_menu)
                                                ? 'bg-[#A61E69]/[0.03] border-[#A61E69] text-[#A61E69] dark:text-pink-300 shadow-xs'
                                                : 'bg-white dark:bg-slate-900/60 border-gray-200 dark:border-[#243044] text-slate-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                                            }`}
                                          >
                                            <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center shrink-0 ${
                                              Boolean(rule.disableContextMenu ?? rule.disable_context_menu)
                                                ? 'bg-[#A61E69] border-[#A61E69] text-white'
                                                : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-gray-400'
                                            }`}>
                                              {Boolean(rule.disableContextMenu ?? rule.disable_context_menu) && (
                                                <svg className="w-3.5 h-3.5 text-white stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                              )}
                                            </div>
                                            <span className="text-xs font-semibold capitalize tracking-tight">Disable Context Menu</span>
                                          </label>
                                        </div>
                                        <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                                          Disable toolbar: hides action buttons. Navigation, view switching and sort stay visible. Disable context menu: turns off the right-click menu. These two options only change what the user sees; real protection comes from Forbidden Operations and Folder Access.
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* TAB 4: USER ROLE RESTRICTIONS */}
                  {fmActiveTab === 'roles' && (() => {
                    const roleRestrictions = operationRestrictions.filter(r => r.subject_type === 'role');

                    const ALL_ROLES_OPTIONS = [
                      { value: 'editor', label: 'Editor' },
                      { value: 'author', label: 'Author' },
                      { value: 'contributor', label: 'Contributor' },
                      { value: 'subscriber', label: 'Subscriber' },
                    ];

                    const handleAddRoleRule = () => {
                      const newRule: FileManagerOperationRestriction = {
                        id: `role-rule-${Date.now()}-${Math.random()}`,
                        subject_type: 'role',
                        subject_id: 'editor',
                        forbidden_operations: [],
                        disabledOperations: [],
                        disable_toolbar: false,
                        disableToolbar: false,
                        disable_context_menu: false,
                        disableContextMenu: false,
                        isExpanded: true
                      };
                      setOperationRestrictions(prev => [...prev, newRule]);
                    };

                    const handleDeleteRoleRule = (ruleId: string) => {
                      handleDeleteOperationRestriction(ruleId);
                    };

                    const handleUpdateRoleRule = (ruleId: string, fields: Partial<FileManagerOperationRestriction>) => {
                      setOperationRestrictions(prev => prev.map(r => r.id === ruleId ? { ...r, ...fields } : r));
                    };

                    const handleToggleRoleRuleExpanded = (ruleId: string) => {
                      setOperationRestrictions(prev => prev.map(r => r.id === ruleId ? { ...r, isExpanded: r.isExpanded === false ? true : !r.isExpanded } : r));
                    };

                    return (
                      <div className="space-y-6">
                        {/* Title Block */}
                        <div className="pb-4 border-b border-gray-100 dark:border-[#243044]/80">
                          <h4 className="font-['Red_Hat_Display',sans-serif] font-bold text-sm uppercase text-slate-800 dark:text-slate-200! tracking-wider flex items-center gap-2.5">
                            <Users className="w-4.5 h-4.5 text-[#A61E69]" />
                            <span>Role-Based Workspace Governance</span>
                          </h4>
                          <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1 pl-7">
                            Establish custom interface restrictions, cloaked directories, and write locks based on membership levels.
                          </p>
                        </div>

                        {/* Role Restrictions Explanation Banner */}
                        <div className="p-4 rounded-2xl bg-blue-500/[0.04] dark:bg-blue-500/[0.02] border-l-4 border-l-[#A61E69] border border-gray-100 dark:border-[#243044]/80 text-[13px] text-slate-700 dark:text-slate-300 flex items-start gap-3 shadow-xs">
                          <Info className="w-4 h-4 text-[#A61E69] dark:text-pink-400 shrink-0 mt-0.5" />
                          <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                            Administrators are never restricted. If a user has several roles, everything blocked by any of those roles is blocked. A rule for a specific user, if one exists, takes priority over role rules.
                          </p>
                        </div>

                        {/* Add Rule Action Row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gray-50/50 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/80">
                          <div className="space-y-1">
                            <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[15px] text-slate-800 dark:text-slate-100 block">
                              Configure New Role Restriction
                            </label>
                            <span className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed block">
                              Enforce strict workspace guidelines by user role to protect original site components.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddRoleRule}
                            className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] shadow-xs hover:shadow-md transition-all cursor-pointer shrink-0 mt-2 sm:mt-0"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                            <span>Add rule for Roles</span>
                          </button>
                        </div>

                        {/* Rules Display Container */}
                        <div className="space-y-4">
                          {roleRestrictions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-gray-200 dark:border-[#243044]/80 rounded-2xl bg-gray-50/20 dark:bg-slate-900/5 text-center">
                              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2.5" />
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No role-based restriction rules configured.</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Click the button above to add a new role policy.</p>
                            </div>
                          ) : (
                            roleRestrictions.map((rule) => {
                              const isExpanded = rule.isExpanded !== false;
                              return (
                                <div key={rule.id} className="rounded-2xl border border-gray-100 dark:border-[#243044]/80 bg-white dark:bg-slate-900/40 overflow-hidden shadow-xs hover:shadow-sm transition-all">
                                  {/* Header area */}
                                  <div className="flex items-center justify-between p-4 bg-gray-50/30 dark:bg-slate-900/10">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">If User Role is</span>
                                      <select
                                        value={rule.subject_id}
                                        onChange={(e) => handleUpdateRoleRule(rule.id, { subject_id: e.target.value })}
                                        className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 px-3.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] outline-none transition-all cursor-pointer"
                                      >
                                        {ALL_ROLES_OPTIONS.map(opt => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                        {!ALL_ROLES_OPTIONS.some(opt => opt.value === rule.subject_id) && (
                                          <option key={rule.subject_id} value={rule.subject_id}>
                                            {rule.subject_id === 'administrator' ? 'Administrator' : (rule.subject_id.charAt(0).toUpperCase() + rule.subject_id.slice(1))}
                                          </option>
                                        )}
                                      </select>
                                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Then</span>
                                      {rule.subject_id === 'administrator' && (
                                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                          Administrators are never restricted, so this rule has no effect.
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleRoleRuleExpanded(rule.id)}
                                        className="p-1.5 text-slate-500 hover:text-[#A61E69] dark:hover:text-pink-400 hover:bg-gray-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
                                        title={isExpanded ? "Collapse Rule Options" : "Expand Rule Options"}
                                      >
                                        <svg className={`w-4 h-4 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRoleRule(rule.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                                        title="Delete Rule"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Expandable Options Body */}
                                  {isExpanded && (
                                    <div className="p-5 border-t border-gray-100 dark:border-[#243044]/60 bg-white dark:bg-slate-900/20 space-y-5">
                                      {/* Disable Operations */}
                                      <div className="space-y-4">
                                        <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[14px] text-slate-800 dark:text-slate-100 block">
                                          Forbidden Operations
                                        </label>
                                        <div className="space-y-4 p-4 bg-gray-50/50 dark:bg-[#0b1220]/20 rounded-xl border border-gray-100 dark:border-[#243044]/40">
                                          {OPERATION_GROUPS.map((group) => {
                                            return (
                                              <div key={group.label} className="space-y-1.5">
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans">
                                                  {group.label}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  {group.items.map((op) => {
                                                    const disabledList = rule.disabledOperations ?? rule.forbidden_operations ?? [];
                                                    const isChecked = disabledList.includes(op.key);
                                                    const toggleOp = () => {
                                                      const updatedList = isChecked
                                                        ? disabledList.filter(k => k !== op.key)
                                                        : [...disabledList, op.key];
                                                      handleUpdateRoleRule(rule.id, { disabledOperations: updatedList, forbidden_operations: updatedList });
                                                    };
                                                    return (
                                                      <label
                                                        key={op.key}
                                                        onClick={toggleOp}
                                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition-all group shrink-0 ${
                                                          isChecked
                                                            ? 'bg-[#A61E69]/[0.03] border-[#A61E69] text-[#A61E69] dark:text-pink-300 font-semibold shadow-2xs'
                                                            : 'bg-white dark:bg-slate-900 border-gray-200/80 dark:border-[#243044] text-slate-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-700'
                                                        }`}
                                                      >
                                                        {/* Compact custom modern checkbox (size ~15px) */}
                                                        <div className={`w-4 h-4 rounded-md border transition-all flex items-center justify-center shrink-0 ${
                                                          isChecked
                                                            ? 'bg-[#A61E69] border-[#A61E69] text-white'
                                                            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-gray-400'
                                                        }`}>
                                                          {isChecked && (
                                                            <svg className="w-3 h-3 text-white stroke-[4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                          )}
                                                        </div>
                                                        <div className="flex flex-col">
                                                          <span className="text-[11px] tracking-tight">{op.label}</span>
                                                          {op.note && (
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal leading-tight">
                                                              {op.note}
                                                            </span>
                                                          )}
                                                        </div>
                                                      </label>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      {/* Workspace Interface Restrictions */}
                                      <div className="space-y-2.5 pt-1">
                                        <label className="font-['Red_Hat_Display',sans-serif] font-semibold text-[14px] text-slate-800 dark:text-slate-100 block">
                                          Workspace Interface Restrictions
                                        </label>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                          {/* Disable Workstation Toolbar */}
                                          <label
                                            onClick={() => {
                                              const currentToolbar = Boolean(rule.disableToolbar ?? rule.disable_toolbar);
                                              handleUpdateRoleRule(rule.id, { disableToolbar: !currentToolbar, disable_toolbar: !currentToolbar });
                                            }}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all group flex-1 ${
                                              Boolean(rule.disableToolbar ?? rule.disable_toolbar)
                                                ? 'bg-[#A61E69]/[0.03] border-[#A61E69] text-[#A61E69] dark:text-pink-300 shadow-xs'
                                                : 'bg-white dark:bg-slate-900/60 border-gray-200 dark:border-[#243044] text-slate-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                                            }`}
                                          >
                                            <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center shrink-0 ${
                                              Boolean(rule.disableToolbar ?? rule.disable_toolbar)
                                                ? 'bg-[#A61E69] border-[#A61E69] text-white'
                                                : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-gray-400'
                                            }`}>
                                              {Boolean(rule.disableToolbar ?? rule.disable_toolbar) && (
                                                <svg className="w-3.5 h-3.5 text-white stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                              )}
                                            </div>
                                            <span className="text-xs font-semibold capitalize tracking-tight">Disable Toolbar</span>
                                          </label>

                                          {/* Block Shortcut Context Menu */}
                                          <label
                                            onClick={() => {
                                              const currentContextMenu = Boolean(rule.disableContextMenu ?? rule.disable_context_menu);
                                              handleUpdateRoleRule(rule.id, { disableContextMenu: !currentContextMenu, disable_context_menu: !currentContextMenu });
                                            }}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition-all group flex-1 ${
                                              Boolean(rule.disableContextMenu ?? rule.disable_context_menu)
                                                ? 'bg-[#A61E69]/[0.03] border-[#A61E69] text-[#A61E69] dark:text-pink-300 shadow-xs'
                                                : 'bg-white dark:bg-slate-900/60 border-gray-200 dark:border-[#243044] text-slate-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                                            }`}
                                          >
                                            <div className={`w-5 h-5 rounded-md border transition-all flex items-center justify-center shrink-0 ${
                                              Boolean(rule.disableContextMenu ?? rule.disable_context_menu)
                                                ? 'bg-[#A61E69] border-[#A61E69] text-white'
                                                : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-gray-400'
                                            }`}>
                                              {Boolean(rule.disableContextMenu ?? rule.disable_context_menu) && (
                                                <svg className="w-3.5 h-3.5 text-white stroke-[3.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                              )}
                                            </div>
                                            <span className="text-xs font-semibold capitalize tracking-tight">Disable Context Menu</span>
                                          </label>
                                        </div>
                                        <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">
                                          Disable toolbar: hides action buttons. Navigation, view switching and sort stay visible. Disable context menu: turns off the right-click menu. These two options only change what the user sees; real protection comes from Forbidden Operations and Folder Access.
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* TAB: FOLDER ACCESS RULES */}
                  {fmActiveTab === 'folders' && (() => {
                    const aclFolderRules: FileManagerAclRule[] = formData.fileManagerAclRules ?? [];
                    const ALL_FOLDER_ROLES = [
                      { value: 'editor', label: 'Editor' },
                      { value: 'author', label: 'Author' },
                      { value: 'contributor', label: 'Contributor' },
                      { value: 'subscriber', label: 'Subscriber' },
                    ];

                    const handleAddFolderRule = () => handleAddFolderRuleTop(aclFolderRules);
                    const handleDeleteFolderRule = (ruleId: string) => handleDeleteFolderRuleTop(ruleId, aclFolderRules);
                    const handleUpdateFolderRule = (ruleId: string, fields: Partial<FileManagerAclRule>) => handleUpdateFolderRuleTop(ruleId, fields, aclFolderRules);
                    const openFolderBrowser = (ruleId: string) => openFolderBrowserTop(ruleId, aclFolderRules);

                    // Validation: Identify rules with empty folder paths
                    const invalidRules = aclFolderRules.filter(r => !r.folder_path || r.folder_path.trim() === '');
                    const hasInvalidRules = invalidRules.length > 0;

                    const isAllExpanded = aclFolderRules.length > 0 && aclFolderRules.every(r => expandedFolderRules[r.id]);
                    const handleToggleAll = () => {
                      if (isAllExpanded) {
                        setExpandedFolderRules({});
                      } else {
                        const nextExpanded: Record<string, boolean> = {};
                        aclFolderRules.forEach(r => {
                          nextExpanded[r.id] = true;
                        });
                        setExpandedFolderRules(nextExpanded);
                      }
                    };

                    // Compute Stats for Summary bar
                    const rolesCount = new Set(aclFolderRules.filter(r => r.subject_type === 'role').map(r => r.subject_id)).size;
                    const usersCount = new Set(aclFolderRules.filter(r => r.subject_type === 'user').map(r => r.subject_id)).size;
                    const foldersCount = new Set(aclFolderRules.map(r => r.folder_path || '/')).size;

                    // Mock folder tree structure for the modal
                    interface FolderTreeNode {
                      name: string;
                      path: string;
                      children?: FolderTreeNode[];
                    }

                    const ACL_FOLDER_TREE: FolderTreeNode[] = [
                      {
                        name: 'wp-content',
                        path: 'wp-content',
                        children: [
                          {
                            name: 'uploads',
                            path: 'wp-content/uploads',
                            children: [
                              {
                                name: '2026',
                                path: 'wp-content/uploads/2026',
                                children: [
                                  { name: '01', path: 'wp-content/uploads/2026/01' },
                                  { name: '02', path: 'wp-content/uploads/2026/02' },
                                ]
                              },
                              {
                                name: '2025',
                                path: 'wp-content/uploads/2025'
                              }
                            ]
                          },
                          {
                            name: 'themes',
                            path: 'wp-content/themes'
                          },
                          {
                            name: 'plugins',
                            path: 'wp-content/plugins'
                          }
                        ]
                      },
                      {
                        name: 'wp-admin',
                        path: 'wp-admin'
                      }
                    ];

                    const renderFolderNode = (node: FolderTreeNode, currentRules: FileManagerAclRule[], search: string) => {
                      const isMatch = !search || 
                        node.name.toLowerCase().includes(search.toLowerCase()) || 
                        node.path.toLowerCase().includes(search.toLowerCase()) || 
                        (node.children && node.children.some(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.path.toLowerCase().includes(search.toLowerCase())));
                      
                      if (!isMatch) return null;

                      const isExpanded = !!expandedDirs[node.path];
                      const isSelected = (folderBrowser.selectedPath || '').replace(/\/$/, '') === node.path.replace(/\/$/, '');
                      const hasChildren = !!(node.children && node.children.length > 0);
                      const isAssigned = currentRules.some(
                        r => r.id !== folderBrowser.targetRuleId && r.folder_path?.trim().replace(/\/$/, '').toLowerCase() === node.path.replace(/\/$/, '').toLowerCase()
                      );

                      return (
                        <div key={node.path} className="select-none">
                          <div
                            onClick={() => setFolderBrowser(prev => ({ ...prev, selectedPath: node.path }))}
                            className={`flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs font-mono transition-all ${
                              isSelected
                                ? 'bg-[#A61E69] text-white font-semibold shadow-xs'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {hasChildren ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedDirs(prev => ({ ...prev, [node.path]: !prev[node.path] }));
                                  }}
                                  className={`p-0.5 rounded cursor-pointer transition-colors ${
                                    isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              ) : (
                                <span className="w-4.5 shrink-0" />
                              )}
                              <Folder className={`w-4 h-4 shrink-0 transition-colors ${isSelected ? 'text-white fill-white/20' : 'text-[#A61E69] dark:text-pink-400 fill-[#A61E69]/20'}`} />
                              <span className="truncate">{node.name}</span>
                            </div>

                            {isAssigned && (
                              <span className={`text-[10px] font-sans font-semibold px-2 py-0.5 rounded shrink-0 border ${
                                isSelected 
                                  ? 'bg-white/20 text-white border-white/30' 
                                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                              }`}>
                                Already assigned
                              </span>
                            )}
                          </div>

                          {hasChildren && isExpanded && (
                            <div className="border-l-2 border-slate-200 dark:border-[#243044] ml-4.5 my-1 pl-1.5 space-y-1">
                              {node.children!.map(child => renderFolderNode(child, currentRules, search))}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-6">
                        {/* Title & Action Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-[#243044]/80">
                          <div className="space-y-1">
                            <h4 className="font-['Red_Hat_Display',sans-serif] font-bold text-base text-slate-800 dark:text-slate-100! flex items-center gap-2">
                              <FolderCheck className="w-5 h-5 text-[#A61E69]" />
                              <span>Per-Folder Access Control</span>
                            </h4>
                            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                              Define exactly which folders each role or user can access, and their permission level within them. Any folder not covered by a rule stays completely hidden from that role or user.
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-3 shrink-0">
                            {aclFolderRules.length > 1 && (
                              <button
                                type="button"
                                onClick={handleToggleAll}
                                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
                              >
                                {isAllExpanded ? 'Collapse All' : 'Expand All'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleAddFolderRule}
                              className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] shadow-xs hover:shadow-md transition-all cursor-pointer shrink-0"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                              <span>Add Folder Rule</span>
                            </button>
                          </div>
                        </div>

                        {/* Validation Summary */}
                        {hasInvalidRules && (
                          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 flex items-center gap-3 text-amber-800 dark:text-amber-300 text-xs font-bold shadow-sm">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <span>
                              Attention needed: {invalidRules.map((r, i) => `Rule #${aclFolderRules.indexOf(r) + 1}`).join(', ')} {invalidRules.length === 1 ? 'needs' : 'need'} a folder path before saving.
                            </span>
                          </div>
                        )}

                        {/* Summary Stat Bar */}
                        {aclFolderRules.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 bg-gray-50/60 dark:bg-slate-900/40 border border-gray-100 dark:border-[#243044]/60 px-4 py-3 rounded-2xl text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-bold text-[#A61E69] dark:text-pink-400 mr-1 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#A61E69] animate-pulse" />
                              At-a-glance stats:
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="bg-white dark:bg-slate-850 px-2 py-0.5 rounded-md font-bold text-slate-700 dark:text-slate-300 border border-gray-100 dark:border-[#243044]">
                                {aclFolderRules.length} {aclFolderRules.length === 1 ? 'rule' : 'rules'}
                              </span>
                              <span>·</span>
                              <span className="bg-white dark:bg-slate-850 px-2 py-0.5 rounded-md font-bold text-slate-700 dark:text-slate-300 border border-gray-100 dark:border-[#243044]">
                                {rolesCount} {rolesCount === 1 ? 'role' : 'roles'}
                              </span>
                              <span>·</span>
                              <span className="bg-white dark:bg-slate-850 px-2 py-0.5 rounded-md font-bold text-slate-700 dark:text-slate-300 border border-gray-100 dark:border-[#243044]">
                                {usersCount} {usersCount === 1 ? 'user' : 'users'}
                              </span>
                              <span>·</span>
                              <span className="bg-white dark:bg-slate-850 px-2 py-0.5 rounded-md font-bold text-slate-700 dark:text-slate-300 border border-gray-100 dark:border-[#243044]">
                                {foldersCount} {foldersCount === 1 ? 'unique path' : 'unique paths'}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Rules List Container */}
                        <div className="space-y-4">
                          {isLoadingAclRules ? (
                            <div className="flex flex-col items-center justify-center p-12 border border-gray-200/80 dark:border-[#243044]/80 rounded-2xl bg-white dark:bg-slate-900/40 text-center">
                              <RotateCcw className="w-6 h-6 text-[#A61E69] animate-spin mb-2.5" />
                              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Loading folder access rules from database...</p>
                            </div>
                          ) : aclFolderRules.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-gray-200 dark:border-[#243044]/80 rounded-2xl bg-gray-50/20 dark:bg-slate-900/5 text-center">
                              <FolderOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2.5" />
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">No folder rules yet — click Add Folder Rule to create one.</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Configure path-specific read/write rule templates for roles and users.</p>
                            </div>
                          ) : (
                            aclFolderRules.map((rule, index) => {
                              const isExpanded = !!expandedFolderRules[rule.id];
                              const isPathEmpty = !rule.folder_path || rule.folder_path.trim() === '';
                              
                              // Helper for summaries and friendly labels
                              const roleLabel = ALL_FOLDER_ROLES.find(r => r.value === rule.subject_id)?.label || 'Editor';
                              const foundUser = wpUsers.find(u => String(u.id) === String(rule.subject_id) || u.username === rule.subject_id);
                              const userLabel = foundUser ? `${foundUser.display_name} (${foundUser.username})` : (rule.subject_id || 'User');
                              const subjectName = rule.subject_type === 'role' ? roleLabel : userLabel;
                              
                              const permissionLabels = {
                                view: 'View Only',
                                edit: 'Edit',
                                full: 'Full Control'
                              };
                              const permissionLabel = permissionLabels[rule.permission_level];

                              const friendlySummary = isPathEmpty 
                                ? 'Please specify a folder path' 
                                : `${subjectName} can ${permissionLabel} files in ${rule.folder_path}`;

                              if (!isExpanded) {
                                // COLLAPSED SUMMARY VIEW
                                return (
                                  <div
                                    key={rule.id}
                                    onClick={() => setExpandedFolderRules(prev => ({ ...prev, [rule.id]: true }))}
                                    className={`flex items-center justify-between p-4 rounded-2xl border ${isPathEmpty ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10' : 'border-gray-200/80 dark:border-[#243044]/80 bg-white dark:bg-slate-900/30'} hover:border-slate-300 dark:hover:border-slate-700 hover:bg-gray-50/40 dark:hover:bg-slate-900/50 shadow-xs cursor-pointer select-none transition-all group`}
                                  >
                                    <div className={`flex items-center gap-2 min-w-0 font-semibold ${isPathEmpty ? 'text-amber-800 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'} text-xs`}>
                                      {isPathEmpty ? <AlertTriangle className="w-4 h-4" /> : (rule.subject_type === 'role' ? <Users className="w-4 h-4 text-[#A61E69]" /> : <User className="w-4 h-4 text-indigo-500" />)}
                                      <span className="truncate">{friendlySummary}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteFolderRule(rule.id);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                                        title="Delete Folder Rule"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                      <div className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                                        <ChevronDown className="w-4 h-4" />
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              // EXPANDED VIEW WITH FORM
                              return (
                                <div key={rule.id} className="relative p-5 rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 shadow-md space-y-5 transition-all">
                                  
                                  {/* Top header bar */}
                                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#243044]/80">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#A61E69] dark:text-pink-400">
                                      Rule #{index + 1}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteFolderRule(rule.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                                        title="Delete Folder Rule"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setExpandedFolderRules(prev => ({ ...prev, [rule.id]: false }))}
                                        className="py-1 px-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#A61E69] dark:hover:text-pink-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                                      >
                                        <span>Collapse</span>
                                        <ChevronUp className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Sentence Structure Layout */}
                                  <div className="space-y-6">
                                    {/* Line 1: Who */}
                                    <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                                      <span className="font-medium">Apply this rule to:</span>
                                      <div className="flex rounded-lg bg-gray-100 dark:bg-slate-800/80 p-0.5 shrink-0">
                                        <button type="button" onClick={() => handleUpdateFolderRule(rule.id, { subject_type: 'role', subject_id: 'editor' })} className={`py-1 px-3 text-xs font-semibold rounded-md transition-all ${rule.subject_type === 'role' ? 'bg-white dark:bg-slate-700 text-[#A61E69] shadow-2xs' : 'text-slate-500'}`}>Role</button>
                                        <button type="button" onClick={() => handleUpdateFolderRule(rule.id, { subject_type: 'user', subject_id: wpUsers.length > 0 ? String(wpUsers[0].id) : '' })} className={`py-1 px-3 text-xs font-semibold rounded-md transition-all ${rule.subject_type === 'user' ? 'bg-white dark:bg-slate-700 text-[#A61E69] shadow-2xs' : 'text-slate-500'}`}>User</button>
                                      </div>
                                      <select
                                        value={rule.subject_id}
                                        onChange={(e) => handleUpdateFolderRule(rule.id, { subject_id: e.target.value })}
                                        disabled={rule.subject_type === 'user' && (isLoadingWpUsers || wpUsers.length === 0)}
                                        className="rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-xs font-semibold outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                      >
                                        {rule.subject_type === 'role' ? (
                                          ALL_FOLDER_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                                        ) : isLoadingWpUsers ? (
                                          <option value="">Loading users...</option>
                                        ) : wpUsers.length === 0 ? (
                                          <option value="">No users available</option>
                                        ) : (
                                          wpUsers.map(u => (
                                            <option key={u.id} value={String(u.id)}>
                                              {u.display_name} ({u.username})
                                            </option>
                                          ))
                                        )}
                                      </select>
                                    </div>

                                    {/* Line 2: Where */}
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                                        <span className="font-medium">They can access:</span>
                                        <div className="relative flex-1 max-w-sm">
                                          <input
                                            type="text"
                                            value={rule.folder_path}
                                            onChange={(e) => handleUpdateFolderRule(rule.id, { folder_path: e.target.value })}
                                            placeholder="e.g. wp-content/uploads"
                                            className={`w-full rounded-xl border ${isPathEmpty ? 'border-amber-500' : 'border-gray-300'} dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 dark:placeholder:text-[#5b6579] pl-3.5 pr-28 py-2 text-xs font-mono outline-none focus:border-[#A61E69]`}
                                          />
                                          <button 
                                            type="button" 
                                            onClick={() => openFolderBrowser(rule.id)} 
                                            className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 hover:text-[#A61E69] dark:hover:text-pink-400 border border-slate-200/80 dark:border-slate-700 hover:border-[#A61E69]/40 dark:hover:border-[#A61E69]/60 shadow-2xs hover:shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                                          >
                                            <FolderSearch className="w-3.5 h-3.5 text-[#A61E69] dark:text-pink-400" />
                                            <span>Browse</span>
                                          </button>
                                        </div>
                                      </div>

                                      {isPathEmpty && (
                                        <div className="ml-[120px] flex items-center gap-2.5 text-amber-600 dark:text-amber-500 text-xs font-semibold font-['Red_Hat_Display',sans-serif] mt-2.5">
                                          <div className="w-4 flex-shrink-0 flex justify-center">
                                            <AlertTriangle className="w-4 h-4" />
                                          </div>
                                          <span>Please specify a folder path. This field cannot be left empty.</span>
                                        </div>
                                      )}
                                      
                                      <label
                                        onClick={() => handleUpdateFolderRule(rule.id, { include_subfolders: !rule.include_subfolders })}
                                        className="flex items-center gap-2.5 cursor-pointer select-none group text-xs text-slate-500 dark:text-slate-400 ml-[120px] mt-2.5"
                                      >
                                        <div className="w-4 flex-shrink-0 flex justify-center">
                                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${rule.include_subfolders ? 'bg-[#A61E69] border-[#A61E69]' : 'border-gray-300 dark:border-slate-700'}`}>
                                            {rule.include_subfolders && <Check className="w-3 h-3 text-white" />}
                                          </div>
                                        </div>
                                        <span>Leave subfolders checked so this also covers everything inside this folder.</span>
                                      </label>
                                    </div>

                                    {/* Line 3: What */}
                                    <div className="space-y-3 pt-2">
                                      <span className="font-medium text-sm text-slate-700 dark:text-slate-200">And they are allowed to:</span>
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {[
                                          { level: 'view' as const, label: 'View Only', desc: 'Look at files, but not change anything', color: 'emerald' },
                                          { level: 'edit' as const, label: 'Edit', desc: 'Add, edit, and organize files', color: 'amber' },
                                          { level: 'full' as const, label: 'Full Control', desc: 'Do anything, including deleting files', color: 'rose' }
                                        ].map((opt) => {
                                          const isSelected = rule.permission_level === opt.level;
                                          const colorClass = isSelected ? `border-${opt.color}-500 bg-${opt.color}-50/50 dark:bg-${opt.color}-950/20 text-${opt.color}-800 dark:text-${opt.color}-300` : 'border-gray-200 bg-white dark:bg-slate-900 text-slate-600';
                                          return (
                                            <div
                                              key={opt.level}
                                              onClick={() => handleUpdateFolderRule(rule.id, { permission_level: opt.level })}
                                              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${colorClass}`}
                                            >
                                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${isSelected ? `bg-${opt.color}-600 border-${opt.color}-600` : 'border-gray-300'}`}>
                                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                              </div>
                                              <div>
                                                <div className="font-bold text-xs">{opt.label}</div>
                                                <div className="text-[10px] opacity-80 mt-0.5 leading-snug">{opt.desc}</div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Redesigned Select a Folder Modal */}
                        {folderBrowser.isOpen && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
                            <div className="w-full max-w-xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] bg-white dark:bg-slate-900 border-gray-200 dark:border-[#243044] text-gray-900 dark:text-white overflow-hidden">
                              {/* Header */}
                              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 dark:border-[#243044]">
                                <div className="flex items-center gap-3">
                                  <div className="p-2.5 rounded-xl bg-[#A61E69]/10 dark:bg-[#A61E69]/20 border border-[#A61E69]/20 dark:border-[#A61E69]/30">
                                    <FolderCheck className="w-5 h-5 text-[#A61E69] dark:text-pink-400" />
                                  </div>
                                  <div>
                                    <h3 className="font-['Red_Hat_Display',sans-serif] font-bold text-base text-slate-800 dark:text-slate-100!">Select a Folder</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Browse and select a folder to grant access to</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setFolderBrowser(prev => ({ ...prev, isOpen: false, targetRuleId: null }))}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </div>

                              {/* Tabs & Search Filter */}
                              <div className="p-4 space-y-3 border-b border-gray-100 dark:border-[#243044] bg-slate-50/60 dark:bg-slate-900/40">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                  <div className="flex items-center gap-1 text-xs font-semibold bg-gray-200/70 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setFolderBrowser(prev => ({ ...prev, activeTab: 'tree' }))}
                                      className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                                        (folderBrowser.activeTab ?? 'tree') === 'tree'
                                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                      }`}
                                    >
                                      Browse Tree
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setFolderBrowser(prev => ({ ...prev, activeTab: 'custom' }))}
                                      className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                                        folderBrowser.activeTab === 'custom'
                                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                      }`}
                                    >
                                      Enter Custom Path
                                    </button>
                                  </div>

                                  {(folderBrowser.activeTab ?? 'tree') === 'tree' && (
                                    <div className="fm-folder-filter-wrap relative flex-1 max-w-xs flex items-center">
                                      <span className="fm-folder-filter-icon-slot absolute left-3 h-full flex items-center justify-center pointer-events-none z-10">
                                        <Search className="fm-folder-filter-icon w-3.5 h-3.5 text-slate-400 dark:text-[#5b6579]" />
                                      </span>
                                      <input
                                        type="text"
                                        placeholder="Filter folders..."
                                        value={folderBrowser.searchTerm ?? ''}
                                        onChange={(e) => setFolderBrowser(prev => ({ ...prev, searchTerm: e.target.value }))}
                                        className="fm-folder-filter-input w-full text-xs pl-9 pr-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#A61E69] text-slate-900 dark:text-slate-100 dark:placeholder:text-[#5b6579]"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Body */}
                              <div className="p-4 overflow-y-auto flex-1 min-h-[260px] max-h-[380px]">
                                {(folderBrowser.activeTab ?? 'tree') === 'tree' ? (
                                  <div className="space-y-2">
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-mono">
                                      SERVER ROOT: /
                                    </div>
                                    <div className="space-y-1">
                                      {ACL_FOLDER_TREE.map(node => renderFolderNode(node, aclFolderRules, folderBrowser.searchTerm ?? ''))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-4 py-2">
                                    <div className="space-y-2">
                                      <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                        Custom Folder Path:
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="e.g. wp-content/uploads/custom-folder"
                                        value={folderBrowser.customPath ?? ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setFolderBrowser(prev => ({ ...prev, customPath: val, selectedPath: val }));
                                        }}
                                        className="w-full text-xs font-mono p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#A61E69]/20 focus:border-[#A61E69] text-slate-900 dark:text-slate-100 dark:placeholder:text-[#5b6579]"
                                      />
                                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                                        Enter any relative WordPress folder path (e.g. <code className="bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10.5px]">wp-content/uploads/...</code>, <code className="bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10.5px]">wp-content/themes</code>, or custom paths).
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Footer */}
                              <div className="p-4 border-t border-gray-100 dark:border-[#243044] flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
                                <div className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate max-w-xs">
                                  <span className="font-sans font-medium text-slate-400 dark:text-slate-500">Selected: </span>
                                  <span className="font-bold text-[#A61E69] dark:text-pink-400">
                                    {(folderBrowser.activeTab === 'custom' ? folderBrowser.customPath : folderBrowser.selectedPath) || 'None'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setFolderBrowser(prev => ({ ...prev, isOpen: false, targetRuleId: null }))}
                                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const targetPath = ((folderBrowser.activeTab === 'custom' ? folderBrowser.customPath : folderBrowser.selectedPath) || '').trim();
                                      if (folderBrowser.targetRuleId && targetPath) {
                                        handleUpdateFolderRule(folderBrowser.targetRuleId, { folder_path: targetPath });
                                      }
                                      setFolderBrowser(prev => ({ ...prev, isOpen: false, targetRuleId: null }));
                                    }}
                                    disabled={!((folderBrowser.activeTab === 'custom' ? folderBrowser.customPath : folderBrowser.selectedPath) || '').trim()}
                                    className="px-4.5 py-2 text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl cursor-pointer shadow-2xs flex items-center gap-1.5 transition-colors"
                                  >
                                    <Check className="w-4 h-4" />
                                    <span>Select Folder</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Fallback Placeholder Empty States */}
                  {fmActiveTab !== 'general' && fmActiveTab !== 'code' && fmActiveTab !== 'users' && fmActiveTab !== 'roles' && fmActiveTab !== 'folders' && (() => {
                    const currentTab = fmTabs.find(t => t.id === fmActiveTab) || { label: 'Settings' };
                    return (
                      <div className="flex flex-col items-center justify-center p-12 border border-dashed border-gray-200 dark:border-[#243044] rounded-xl bg-gray-50/50 dark:bg-slate-900/10">
                        <div className="p-3 bg-gray-100 dark:bg-slate-800 rounded-full mb-3 text-slate-400 dark:text-slate-500">
                          <Clock className="w-6 h-6 animate-pulse text-[#A61E69] dark:text-pink-400" />
                        </div>
                        <h5 className="font-bold text-sm text-gray-900 dark:text-white!">
                          {currentTab.label} Section Coming Soon
                        </h5>
                        <p className={`text-xs ${subText} mt-1 max-w-sm text-center leading-relaxed`}>
                          This settings tab will be enabled in the next stage of the rollout plan. For now, configure the global settings under the General tab.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Standard Settings Action Footer */}
                  <div className="mt-8 pt-6 border-t border-gray-100 dark:border-[#243044]">
                    {renderSettingsActionFooter()}
                  </div>

                </div>
              </div>
            );
          })()}

          {/* Card 6: Notifications (Removed) */}

          {/* Card 7: Optimization */}
          {activeSubTab === 'advanced' && (
          <div id="section-advanced" className={`${cardBg} rounded-xl p-6 border shadow-2xs space-y-6`}>
            <div className="space-y-5">
              {/* General Optimization Behavior Section - Styled exactly like Screenshot_69.png */}
              <div className="border-b border-gray-100 dark:border-[#243044] pb-5 space-y-4">
                <h4 className="font-bold text-xs uppercase text-slate-700 dark:text-slate-300! tracking-wider pb-2 border-b border-gray-200 dark:border-[#243044]">
                  GENERAL SETTINGS
                </h4>

                <div className="space-y-4">
                  {/* Item 1: Auto-Optimize images on upload (all plans) */}
                  <div
                    role="checkbox"
                    aria-checked={autoOptimizeOn}
                    tabIndex={0}
                    onClick={() => handleToggle('autoOptimizeOnUpload')}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        handleToggle('autoOptimizeOnUpload');
                      }
                    }}
                    className="flex items-start gap-3 group select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded cursor-pointer"
                  >
                    <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                      <div className={`w-5 h-5 rounded-[2px] border transition-colors flex items-center justify-center ${
                        autoOptimizeOn
                          ? 'border-slate-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs'
                          : 'border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}>
                        {autoOptimizeOn && (
                          <Check className="w-3.5 h-3.5 stroke-[2.5] text-slate-700 dark:text-slate-200" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="font-bold text-[13px] text-gray-900 dark:text-white flex items-center gap-2 group-hover:text-gray-700 dark:group-hover:text-slate-200">
                        <span>Auto-Optimize images on upload</span>
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
                        <Info className="w-3.5 h-3.5 text-[#00a0d2] shrink-0" />
                        <span>Automatically optimize every image you upload to WordPress.</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-[#243044]" />

                  {/* Item 2: Backup original images (Generate Backup Before Optimization) */}
                  <div
                    role="checkbox"
                    aria-checked={formData.generateBackupBeforeOptimization !== false}
                    tabIndex={0}
                    onClick={() => handleToggle('generateBackupBeforeOptimization')}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        handleToggle('generateBackupBeforeOptimization');
                      }
                    }}
                    className="flex items-start gap-3 cursor-pointer group select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                      <div className={`w-5 h-5 rounded-[2px] border transition-colors flex items-center justify-center ${
                        formData.generateBackupBeforeOptimization !== false
                          ? 'border-slate-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs'
                          : 'border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }`}>
                        {formData.generateBackupBeforeOptimization !== false && (
                          <Check className="w-3.5 h-3.5 stroke-[2.5] text-slate-700 dark:text-slate-200" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="font-bold text-[13px] text-gray-900 dark:text-white block group-hover:text-gray-700 dark:group-hover:text-slate-200">
                        Backup original images
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400">
                        <Info className="w-3.5 h-3.5 text-[#00a0d2] shrink-0" />
                        <span>Keep your original images in a separate folder before optimization process.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next-Gen Image Delivery Section - Styled exactly like Screenshot_56.png */}
              <div className="border-b border-gray-100 dark:border-[#243044] pb-5 space-y-4">
                <h4 className="font-bold text-xs uppercase text-slate-700 dark:text-slate-300! tracking-wider pb-2 border-b border-gray-200 dark:border-[#243044]">
                  NEXT-GEN IMAGE FORMAT
                </h4>

                {/* Segmented Format Selector: OFF | AVIF | WEBP - Clean Flat Segmented Style (600px Max Width) */}
                <div className="space-y-2.5">
                  <div className="w-full max-w-[600px] inline-flex items-stretch overflow-hidden rounded-md border border-slate-700 dark:border-slate-700 bg-[#23282d] shadow-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, nextGenFormat: 'off' as const }));
                      }}
                      className={`flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-r border-slate-700 font-sans cursor-pointer ${
                        (formData.nextGenFormat === 'off')
                          ? 'bg-[#A61E69] text-white font-extrabold'
                          : 'bg-[#23282d] hover:bg-[#2c333a] text-white font-bold'
                      }`}
                    >
                      OFF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, nextGenFormat: 'avif' as const }));
                      }}
                      className={`flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-r border-slate-700 font-sans cursor-pointer ${
                        formData.nextGenFormat === 'avif'
                          ? 'bg-[#A61E69] text-white font-extrabold'
                          : 'bg-[#23282d] hover:bg-[#2c333a] text-white font-bold'
                      }`}
                    >
                      AVIF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, nextGenFormat: 'webp' as const }));
                      }}
                      className={`flex-1 py-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors font-sans cursor-pointer ${
                        (formData.nextGenFormat === 'webp' || !formData.nextGenFormat)
                          ? 'bg-[#A61E69] text-white font-extrabold'
                          : 'bg-[#23282d] hover:bg-[#2c333a] text-white font-bold'
                      }`}
                    >
                      WEBP
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-400">
                    <Info className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    <span>Select WebP for high compatibility, AVIF for superior compression. This is the same output format shown on the Image Optimization page. Please note that the generation process will start automatically after saving the settings.</span>
                  </div>
                </div>

                {/* Default compression level: used by Auto-Optimize on upload and the Media Library "Optimize" buttons.
                    The Image Optimization page shows and saves this same setting. */}
                <div className="space-y-2.5">
                  <div className="font-bold text-[13px] text-gray-900 dark:text-white">Default compression level</div>
                  <div className="w-full max-w-[600px] inline-flex items-stretch overflow-hidden rounded-md border border-slate-700 dark:border-slate-700 bg-[#23282d] shadow-xs">
                    {([
                      { value: 'lossless', label: 'Lossless' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'aggressive', label: 'Aggressive' },
                      { value: 'custom', label: 'Custom' },
                    ] as const).map((opt, idx, all) => {
                      const active = (formData.defaultCompressionLevel || 'balanced') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, defaultCompressionLevel: opt.value }));
                          }}
                          className={`flex-1 py-2.5 px-3 text-xs font-bold uppercase tracking-wider transition-colors font-sans cursor-pointer ${
                            idx < all.length - 1 ? 'border-r border-slate-700' : ''
                          } ${
                            active
                              ? 'bg-[#A61E69] text-white font-extrabold'
                              : 'bg-[#23282d] hover:bg-[#2c333a] text-white font-bold'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {formData.defaultCompressionLevel === 'custom' && (
                    <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300">
                      <span className="font-semibold">Quality (1-100)</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={formData.defaultCompressionQuality ?? 78}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setFormData(prev => ({
                            ...prev,
                            defaultCompressionQuality: Number.isNaN(n) ? 78 : Math.max(1, Math.min(100, n)),
                          }));
                        }}
                        className="w-20 px-2 py-1 text-xs rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                      />
                    </label>
                  )}

                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-400">
                    <Info className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    <span>Used when images are optimized automatically on upload and by the Media Library "Optimize" button. Changing it here or on the Image Optimization page changes both, because it is one shared setting. Lossless keeps each image at its current quality, Balanced is the best size/quality trade-off, Aggressive gives the smallest files.</span>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-[#243044] my-3" />

                {/* Checkbox and Sub-options */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!formData.displayNextGenFormat}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData(prev => ({ ...prev, displayNextGenFormat: checked }));
                      }}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-slate-600 focus:ring-blue-500 dark:bg-slate-700"
                    />
                    <span className="font-bold text-xs text-gray-900 dark:text-white">
                      Display images in Next-Gen format on the site
                    </span>
                  </label>

                  {/* Delivery method: rewrite rules (.htaccess) or <picture> tags */}
                  {(() => {
                    const nextGenOn = !!formData.displayNextGenFormat;
                    const method: 'picture' | 'rewrite' = formData.nextGenDeliveryMethod === 'rewrite' ? 'rewrite' : 'picture';
                    const rewriteSupported = (window as any).imgsentry_data?.rewrite_supported !== false;
                    const dim = nextGenOn ? '' : ' opacity-50';
                    return (
                      <div className="ml-6 space-y-2.5">
                        <label className={`flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300${dim} ${nextGenOn ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                          <input
                            type="radio"
                            name="imgsentry-nextgen-method"
                            checked={method === 'rewrite'}
                            disabled={!nextGenOn}
                            onChange={() => setFormData(prev => ({ ...prev, nextGenDeliveryMethod: 'rewrite' }))}
                            className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-600 focus:ring-blue-500 dark:bg-slate-700"
                          />
                          <span>Use rewrite rules <em className="text-gray-500 dark:text-slate-400">(recommended for sites without a CDN)</em></span>
                        </label>

                        <label className={`flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300${dim} ${nextGenOn ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                          <input
                            type="radio"
                            name="imgsentry-nextgen-method"
                            checked={method === 'picture'}
                            disabled={!nextGenOn}
                            onChange={() => setFormData(prev => ({ ...prev, nextGenDeliveryMethod: 'picture' }))}
                            className="w-4 h-4 text-blue-600 border-gray-300 dark:border-slate-600 focus:ring-blue-500 dark:bg-slate-700"
                          />
                          <span>Use <code className="text-[11px] font-mono text-gray-700 dark:text-slate-300">&lt;picture&gt;</code> tags</span>
                        </label>

                        <div className={`ml-6 flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400${(nextGenOn && method === 'picture') ? '' : ' opacity-50'}`}>
                          <span>If you use a CDN, specify the URL:</span>
                          <input
                            type="text"
                            value={formData.cdnUrl || ''}
                            disabled={!nextGenOn || method !== 'picture'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormData(prev => ({ ...prev, cdnUrl: val }));
                            }}
                            placeholder="https://cdn.example.com"
                            className="px-2.5 py-1 border border-gray-300 dark:border-slate-700 rounded text-xs w-60 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-400 dark:placeholder:text-[#5b6579] disabled:cursor-not-allowed"
                          />
                        </div>

                        {nextGenOn && method === 'rewrite' && !rewriteSupported && (
                          <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>This server does not seem to use .htaccess files (it is not Apache or LiteSpeed). Rewrite rules will not work here, so please choose the &lt;picture&gt; tags option.</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Informational callout notice */}
                  <div className="mt-4 flex items-start gap-2 text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">
                    <Info className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p>
                        The first option adds rewrite rules to your site&apos;s configuration file (<code className="bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-1 py-0.5 rounded font-mono text-[10px] text-gray-700 dark:text-slate-300">.htaccess</code>) and does not change your page code. This does not work with a CDN though. The rules are removed again when you switch the option off or deactivate the plugin.
                      </p>
                      <p>
                        The second option replaces the <code className="bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-1 py-0.5 rounded font-mono text-[10px] text-gray-700 dark:text-slate-300">&lt;img&gt;</code> tags with <code className="bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-1 py-0.5 rounded font-mono text-[10px] text-gray-700 dark:text-slate-300">&lt;picture&gt;</code> tags. It is needed if you use a CDN, and it works when your configuration file cannot be edited. It changes your page code, so a theme, slider or page builder that is not compatible can break, and it does not cover images set in CSS, such as backgrounds. The CDN address is only used to find the WebP / AVIF files of an image; your CDN must serve the same files as this site.
                      </p>
                      <p className="font-semibold">
                        After changing this setting, clear every cache (also your caching plugin and CDN) and check your pages.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Backup & Safety Section Header */}
              <div className="space-y-4 pt-1">
                <h4 className="font-bold text-xs uppercase text-slate-700 dark:text-slate-300! tracking-wider pb-2 border-b border-gray-200 dark:border-[#243044]">
                  BACKUP & SAFETY
                </h4>
              </div>

              {/* Backup Storage Directory Location Section */}
              <div className="border-b border-gray-100 dark:border-[#243044] pb-5 space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-[13px] text-gray-800 dark:text-slate-200 block">
                      Backup Folder
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-500 dark:text-slate-400 select-none">
                    /
                  </span>
                  <input
                    type="text"
                    value={formData.backupDirectory || 'wp-content/uploads/imgsentry/backups/'}
                    onChange={(e) => handleChange('backupDirectory', e.target.value)}
                    className="w-full text-xs font-mono p-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-200 dark:placeholder:text-[#5b6579] focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="wp-content/uploads/imgsentry/backups/"
                  />
                  <button
                    type="button"
                    onClick={() => handleChange('backupDirectory', 'wp-content/uploads/imgsentry/backups/')}
                    className="px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer shrink-0 border border-indigo-200/60 dark:border-indigo-800/60"
                  >
                    Reset Default
                  </button>
                </div>
                {/* Rejected Backup Directory Warning Notice */}
                {localWarnings.filter(w => w.code === 'backup_directory_rejected').map((warning, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-xs flex items-start gap-2.5 text-amber-900 dark:text-amber-200 shadow-xs"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-amber-900 dark:text-amber-100">Backup Directory Notice</p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                        {warning.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Backup Retention Policy Section */}
              <div id="section-backup-settings" className="border-b border-gray-100 dark:border-[#243044] pb-5 space-y-3 pt-1">
                <div>
                  <label className="font-bold text-[13px] text-gray-800 dark:text-slate-200 block mb-1">
                    Keep backups for:
                  </label>
                  <p className={`text-[11px] ${subText} mb-2.5`}>
                    Configure how long original uncompressed images are kept safely backed up.
                  </p>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <select
                    name="backupRetentionDays"
                    value={formData.backupRetentionDays === undefined ? 0 : formData.backupRetentionDays}
                    onChange={(e) => handleChange('backupRetentionDays', parseInt(e.target.value))}
                    className={`text-xs p-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 min-w-[140px] focus:outline-none focus:ring-1 focus:ring-blue-500`}
                  >
                    <option value={0}>Keep until I delete them (default)</option>
                    <option value={30}>Delete after 30 days</option>
                    <option value={90}>Delete after 90 days</option>
                  </select>
                </div>

                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  (!formData.backupRetentionDays || formData.backupRetentionDays === 0)
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80'
                    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80'
                }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    (!formData.backupRetentionDays || formData.backupRetentionDays === 0)
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  }`}>
                    {(!formData.backupRetentionDays || formData.backupRetentionDays === 0) ? (
                      <FolderCheck className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {(!formData.backupRetentionDays || formData.backupRetentionDays === 0) 
                          ? 'Indefinite Retention (No Auto-Deletion)' 
                          : `${formData.backupRetentionDays} Days Auto-Deletion`}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                        (!formData.backupRetentionDays || formData.backupRetentionDays === 0)
                          ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/80'
                          : 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/80'
                      }`}>
                        {(!formData.backupRetentionDays || formData.backupRetentionDays === 0) ? 'Active Protection' : 'Auto-Delete Enabled'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                      {(!formData.backupRetentionDays || formData.backupRetentionDays === 0) ? (
                        <>Optimization and pre-trash backups are stored safely in <code className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200 font-mono text-[10px]">{formData.backupDirectory || 'wp-content/uploads/imgsentry/backups/'}</code> and persist indefinitely with no automatic time-based purging. Backups are removed strictly via user-initiated Restore Original, plugin uninstall, or attachment deletion.</>
                      ) : (
                        <>Original backups older than {formData.backupRetentionDays} days will be automatically and permanently deleted. Once deleted, you will no longer be able to restore that image to its original version.</>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <CloudBackupSettings formData={formData} handleChange={handleChange} />

              {/* Automated Stale Backup Cleanup Status */}
              <div className="pt-4 border-t border-slate-200/80 dark:border-[#243044] space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Automated Stale Backup Cleanup</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80">Daily Scheduled</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                      {(() => {
                        const wpData = typeof window !== 'undefined' ? ((window as any).imgsentryData || (window as any).imgsentry_data) : null;
                        const lastCleanOption = wpData?.last_stale_backup_cleanup || wpData?.settings?.last_stale_backup_cleanup;
                        const lastCleanCleared = wpData?.last_stale_backup_cleanup_cleared || wpData?.settings?.last_stale_backup_cleanup_cleared;

                        const lastClean = lastCleanOption ? Number(lastCleanOption) : 0;
                        const clearedCount = lastCleanCleared ? Number(lastCleanCleared) : 0;

                        if (lastClean > 0) {
                          let timeText = '';
                          const diffMs = Date.now() - (lastClean * 1000);
                          const diffSecs = Math.floor(diffMs / 1000);
                          if (diffSecs < 60) {
                            timeText = 'just now';
                          } else {
                            const diffMins = Math.floor(diffSecs / 60);
                            if (diffMins < 60) {
                              timeText = `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
                            } else {
                              const diffHours = Math.floor(diffMins / 60);
                              if (diffHours < 24) {
                                timeText = `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
                              } else {
                                const diffDays = Math.floor(diffHours / 24);
                                timeText = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
                              }
                            }
                          }

                          const resultText = clearedCount > 0 
                            ? `${clearedCount} stale ${clearedCount === 1 ? 'reference' : 'references'} removed`
                            : 'No stale references found';

                          return `Last run: ${timeText}. Result: ${resultText}. Scans metadata and purges references when original files are missing from disk continuously for 7+ days.`;
                        } else {
                          return `Not yet run — scheduled to run with tomorrow's daily maintenance. Scans metadata and purges references when original files are missing from disk continuously for 7+ days.`;
                        }
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {renderSettingsActionFooter()}
          </div>
          )}

          {/* Card 8: Integrations */}
          {activeSubTab === 'integrations' && (() => {
            const detected = Array.isArray(settings.integrations) ? settings.integrations : (isWpMode ? [] : MOCK_INTEGRATIONS);
            const keysText = customKeysDraft !== null ? customKeysDraft : (formData.customMetaKeys || []).join('\n');
            const { keys: parsedKeys, issues: keyIssues } = parseCustomKeysText(keysText);
            const webhookUrlValue = formData.webhookUrl || '';
            const webhookUrlBad = webhookUrlValue.trim() !== '' && !/^https:\/\//i.test(webhookUrlValue.trim());
            const secretStored = Boolean(settings.webhookSecretSet);
            const secretWillClear = Boolean(formData.webhookSecretClear);
            const inputCls = 'px-2.5 py-1.5 border border-gray-300 dark:border-slate-700 rounded text-xs w-full bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-400 dark:placeholder:text-[#5b6579]';
            const howTo = (children: React.ReactNode) => (
              <details className="rounded-lg border border-gray-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40 text-[11px]">
                <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  How to use
                </summary>
                <div className={`px-3 pb-3 pt-1 space-y-1.5 leading-relaxed ${subText}`}>{children}</div>
              </details>
            );
            const badge = (status: string) => {
              if (status === 'active') return { text: 'Installed', cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50', dot: 'bg-emerald-500' };
              if (status === 'builtin') return { text: 'Built into WordPress', cls: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900/50', dot: 'bg-sky-500' };
              return { text: 'Not installed', cls: 'text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700', dot: 'bg-gray-300 dark:bg-slate-600' };
            };

            return (
          <div id="section-integrations" className={`${cardBg} rounded-xl p-6 border shadow-2xs space-y-7`}>

            {/* A) Supported plugins */}
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white!">Supported plugins</h3>
                <p className={`text-xs ${subText} mt-0.5`}>What ImgSentry checks for image references on this site.</p>
              </div>
              {detected.length === 0 ? (
                <p className={`text-xs ${subText}`}>Plugin detection is not available right now.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {detected.map((plugin) => {
                    const b = badge(plugin.status);
                    return (
                      <div key={plugin.id} className="p-3 bg-slate-50/50 dark:bg-slate-800/40 border border-gray-200/60 dark:border-slate-700/60 rounded-xl space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${b.dot}`} />
                            <span className="font-bold text-gray-800 dark:text-slate-200 truncate">{plugin.name}</span>
                          </div>
                          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-md shrink-0 ${b.cls}`}>{b.text}</span>
                        </div>
                        <p className={`text-[11px] ${subText} leading-relaxed`}>{plugin.desc}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {howTo(
                <>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">Installed:</span> ImgSentry found the plugin and reads its image references during scans.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">Not installed:</span> nothing to do. That plugin is simply not on this site.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">Built into WordPress:</span> always checked.</p>
                  <p>There is nothing to set up in this section.</p>
                </>
              )}
            </div>

            {/* B) Custom image fields */}
            <div className="space-y-2.5 pt-5 border-t border-gray-200/80 dark:border-slate-700/80">
              <div>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white!">Custom image fields</h3>
                <p className={`text-xs ${subText} mt-0.5`}>Protect images stored in custom fields (JetEngine, Meta Box, Pods, theme fields).</p>
              </div>
              <textarea
                value={keysText}
                onChange={(e) => handleCustomKeysChange(e.target.value)}
                rows={5}
                spellCheck={false}
                aria-label="Custom image field names, one per line"
                placeholder={'hero_background\nteam_photo'}
                className={`${inputCls} font-mono`}
              />
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={subText}>One field name per line. Works for fields that store the image ID.</span>
                <span className={`${parsedKeys.length >= META_KEY_MAX_COUNT ? 'text-amber-600 dark:text-amber-400 font-semibold' : subText} shrink-0`}>{parsedKeys.length} / {META_KEY_MAX_COUNT}</span>
              </div>
              {keyIssues.length > 0 && (
                <div role="alert" className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2 space-y-0.5">
                  <p className="font-semibold">These lines are ignored:</p>
                  {keyIssues.slice(0, 5).map((it, i) => (
                    <p key={i} className="font-mono break-all">Line {it.line}: {it.text} <span className="font-sans">({it.reason})</span></p>
                  ))}
                  {keyIssues.length > 5 && <p>and {keyIssues.length - 5} more.</p>}
                </div>
              )}
              <p className="text-[11px] text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0" />
                After changing this list, run a Deep Scan.
              </p>
              {howTo(
                <>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">1. Find the field name.</span> Edit a post and open Custom Fields (turn it on in Screen Options if it is hidden). Or look for the "meta key" or "field name" in your field plugin (JetEngine, Meta Box, Pods) or theme options.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">2. Add it here.</span> Type one name per line, exactly as it is written, for example <code className="font-mono">hero_background</code>.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">3. Save and scan.</span> Click Save changes, then run a Deep Scan. Images used in these fields are no longer reported as unused.</p>
                  <p>Works for fields that store the image ID (one ID or a list of IDs). Fields that store only an image URL are not read.</p>
                  <p>Add only fields that really hold images.</p>
                </>
              )}
            </div>

            {/* C) Webhook */}
            <div className="space-y-2.5 pt-5 border-t border-gray-200/80 dark:border-slate-700/80">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white!">Webhook</h3>
                  {proWebhookLocked && <ProLockBadge isDarkMode={isDarkMode} />}
                </div>
                <p className={`text-xs ${subText} mt-0.5`}>Sends a short JSON message when a scan finishes. Counts and size only, no file paths.</p>
              </div>
              {proWebhookLocked && (
                <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-[#A61E69]/30 bg-[#A61E69]/5 px-3 py-2">
                  <span className={`text-[11px] ${subText}`}>The scan webhook is included in the Business and Professional plans.</span>
                  <button
                    type="button"
                    onClick={() => setWebhookUpgradeOpen(true)}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#A61E69] hover:bg-[#8c1858] text-white cursor-pointer shrink-0"
                  >
                    Upgrade
                  </button>
                </div>
              )}
              <div className={proWebhookLocked ? 'space-y-2.5 opacity-50 select-none' : 'space-y-2.5'} aria-disabled={proWebhookLocked}>
              <div className="space-y-1">
                <label htmlFor="imgsentry-webhook-url" className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">Webhook URL</label>
                <input
                  id="imgsentry-webhook-url"
                  type="text"
                  inputMode="url"
                  value={webhookUrlValue}
                  disabled={proWebhookLocked}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWebhookTestResult(null);
                    setFormData(prev => ({ ...prev, webhookUrl: val }));
                  }}
                  placeholder="https://example.com/hooks/imgsentry"
                  className={inputCls}
                />
                {webhookUrlBad && <p className="text-[11px] text-rose-600 dark:text-rose-400">The URL must start with https://</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="imgsentry-webhook-secret" className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">Secret (optional)</label>
                <input
                  id="imgsentry-webhook-secret"
                  type="password"
                  autoComplete="new-password"
                  value={formData.webhookSecret || ''}
                  disabled={proWebhookLocked}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, webhookSecret: val, webhookSecretClear: false }));
                  }}
                  placeholder={secretStored && !secretWillClear ? 'A secret is set. Leave empty to keep it.' : 'Used to sign the message'}
                  className={inputCls}
                />
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className={subText}>Signed with X-ImgSentry-Signature (HMAC SHA-256).</span>
                  {secretStored && !secretWillClear && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, webhookSecret: '', webhookSecretClear: true }))}
                      className="font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer shrink-0"
                    >
                      Remove secret
                    </button>
                  )}
                  {secretWillClear && (
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, webhookSecretClear: false }))}
                      className="font-semibold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer shrink-0"
                    >
                      Secret will be removed on save. Undo
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={handleTestWebhook}
                  disabled={proWebhookLocked || webhookTesting || webhookUrlValue.trim() === ''}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    proWebhookLocked || webhookTesting || webhookUrlValue.trim() === ''
                      ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 border-gray-200 dark:border-slate-700 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/60 cursor-pointer'
                  }`}
                >
                  {webhookTesting ? 'Sending...' : 'Send test'}
                </button>
                {webhookTestResult && (
                  <span role="status" className={`text-[11px] font-semibold flex items-center gap-1.5 ${webhookTestResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {webhookTestResult.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {webhookTestResult.message}
                  </span>
                )}
              </div>
              <p className={`text-[11px] ${subText}`}>The test uses the values above, even if they are not saved yet. Real messages are sent only when ImgSentry is enabled.</p>
              {howTo(
                <>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">1. Get a URL.</span> Create a receiving URL in the service you use (for example a Zapier "Catch Hook", a Make webhook, or your own server). To try it quickly, a free test address from webhook.site works.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">2. Paste it above.</span> It must start with https://. A secret is optional.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">3. Send test, then Save changes.</span> The test works even before you save.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">What is sent:</span> one JSON message after each finished scan with the event name (<code className="font-mono">scan.completed</code>), site URL, scan type, trigger, used and unused counts, unused size and time. No file paths, no user data. There are no retries.</p>
                  <p><span className="font-semibold text-gray-700 dark:text-slate-300">Check the signature (optional).</span> If you set a secret, the header <code className="font-mono">X-ImgSentry-Signature</code> is <code className="font-mono">sha256=</code> plus the HMAC SHA-256 of the raw message body, made with your secret. In PHP:</p>
                  <pre className="font-mono text-[10px] whitespace-pre-wrap break-all rounded-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 p-2 text-gray-700 dark:text-slate-300">{"$body = file_get_contents('php://input');\n$sig  = 'sha256=' . hash_hmac('sha256', $body, $secret);\n$ok   = hash_equals($sig, $_SERVER['HTTP_X_IMGSENTRY_SIGNATURE'] ?? '');"}</pre>
                  <p>Slack incoming webhooks expect their own message format, so send to Slack through Zapier or Make.</p>
                  <p>Private or local addresses are blocked, and redirects are not followed. Use the final URL.</p>
                </>
              )}
              </div>
            </div>

            {renderSettingsActionFooter()}
          </div>
            );
          })()}

        </div>

        {/* Right Sidebar Cards */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Card 1: About ImgSentry */}
          <div className={`${cardBg} rounded-xl p-5 border shadow-2xs space-y-4`}>
            <h4 className="font-bold text-sm text-gray-900 dark:text-white!">About ImgSentry</h4>
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-[#A61E69] rounded-xl flex items-center justify-center text-white shadow-xs shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-sm text-gray-900 dark:text-white leading-snug">ImgSentry</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">Version 1.0.0</p>
              </div>
            </div>
            <p className={`text-xs ${subText} leading-relaxed`}>
              The most advanced solution to clean unused media files and optimize your WordPress site.
            </p>
            <button 
              type="button"
              className="w-full text-xs font-semibold py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
            >
              View Changelog
            </button>
          </div>

          {/* Card 2: Quick Information */}
          <div className={`${cardBg} rounded-xl p-5 border shadow-2xs space-y-3.5`}>
            <h4 className="font-bold text-sm text-gray-900 dark:text-white!">Quick Information</h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className={subText}>Last Scan</span>
                <span className="font-medium text-gray-800 dark:text-slate-200">
                  {formatDateWithTimeZone('2024-05-24T10:30:00Z', formData.timeZone, formData.dateFormat)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={subText}>Next Scheduled Scan</span>
                <span className="font-medium text-gray-800 dark:text-slate-200">
                  {formData.enableScheduledScan ? (() => {
                    const days = formData.scheduledScanFrequency || 7;
                    const d = new Date();
                    d.setDate(d.getDate() + days);
                    return formatDateWithTimeZone(d, formData.timeZone, formData.dateFormat);
                  })() : 'Not scheduled'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={subText}>Auto Clean</span>
                <span className="px-2 py-0.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-md">
                  Enabled
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={subText}>Trash Auto Delete</span>
                <span className="font-medium text-gray-800 dark:text-slate-200">{formData.retentionDays || 7} Days</span>
              </div>
              <div className="flex justify-between items-center">
                <span className={subText}>Excluded Folders</span>
                <span className="font-semibold text-gray-800 dark:text-slate-200">{currentExcludedFolders.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className={subText}>Excluded Files</span>
                <span className="font-semibold text-gray-800 dark:text-slate-200">{currentExcludedFiles.length}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Database Information */}
          <div className={`${cardBg} rounded-xl p-5 border shadow-2xs space-y-3.5`}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white!">Database Information</h4>
              {dbStats.lastCleanedDate && (
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/70 dark:border-emerald-800/60">
                  Cleaned {dbStats.lastCleanedDate}
                </span>
              )}
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className={subText}>ImgSentry Data</span>
                <span className="font-mono font-medium text-gray-800 dark:text-slate-200">
                  {dbStats.mediaCleanerDataMb.toFixed(1)} MB
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={subText}>Log Data</span>
                <span className="font-mono font-medium text-gray-800 dark:text-slate-200">
                  {dbStats.logDataMb.toFixed(1)} MB
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={subText}>Total Cleanable Data</span>
                <span className="font-mono font-medium text-gray-800 dark:text-slate-200">
                  {dbStats.totalCleanableGb >= 1
                    ? `${dbStats.totalCleanableGb.toFixed(1)} GB`
                    : `${(dbStats.totalCleanableGb * 1024).toFixed(1)} MB`}
                </span>
              </div>
            </div>
            <div className="pt-2">
              <button 
                type="button"
                onClick={() => setIsCleanDataModalOpen(true)}
                className="w-full text-xs font-semibold py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Clean Plugin Data</span>
              </button>
            </div>
          </div>

          {/* Card 4: Need Help? */}
          <div className={`${cardBg} rounded-xl p-5 border shadow-2xs space-y-3`}>
            <h4 className="font-bold text-sm text-gray-900 dark:text-white!">Need Help?</h4>
            <p className={`text-xs ${subText} leading-relaxed`}>
              Check our documentation or contact support for any assistance.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button 
                type="button"
                className="py-2 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Documentation</span>
              </button>
              <button 
                type="button"
                className="py-2 px-3 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>Contact Support</span>
              </button>
            </div>
          </div>

        </div>
      </div>
      )}
        </main>
      </div>

      {/* Modals for Exclusion Management */}
      <FolderBrowserModal
        isOpen={isFolderBrowserOpen}
        onClose={() => {
          setIsFolderBrowserOpen(false);
          setActiveAclFolderRowIndex(null);
        }}
        onSelectFolder={(folderPath) => {
          if (activeAclFolderRowIndex === -1) {
            handleChange('fileManagerPrivateFolderAccess', folderPath);
            setActiveAclFolderRowIndex(null);
          } else if (activeAclFolderRowIndex !== null) {
            const defaultRules: FileManagerAclRule[] = [
              {
                id: 'rule_1',
                subject_type: 'role',
                subject_id: 'editor',
                folder_path: 'wp-content/uploads',
                permission_level: 'edit',
                include_subfolders: true,
              }
            ];
            const currentRules = [...(formData.fileManagerAclRules || defaultRules)];
            if (currentRules[activeAclFolderRowIndex]) {
              currentRules[activeAclFolderRowIndex] = {
                ...currentRules[activeAclFolderRowIndex],
                folder_path: folderPath,
              };
              handleChange('fileManagerAclRules', currentRules);
            }
            setActiveAclFolderRowIndex(null);
          } else {
            validateAndAddExclusionItem(folderPath, 'folder');
          }
        }}
        existingFolders={currentExcludedFolders.map(f => typeof f === 'string' ? f : f.path)}
        isDarkMode={isDarkMode}
        purpose={activeAclFolderRowIndex === -1 ? 'private-folder' : 'exclude'}
      />

      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelectPattern={(pattern) => validateAndAddExclusionItem(pattern, 'file')}
        existingFiles={currentExcludedFiles.map(f => typeof f === 'string' ? f : f.path)}
        isDarkMode={isDarkMode}
        mediaList={mediaList}
      />

      <ExclusionConfirmModal
        isOpen={!!confirmDeleteModal?.isOpen}
        onClose={() => setConfirmDeleteModal(null)}
        onConfirm={() => {
          if (confirmDeleteModal) {
            performRemoveExclusion(confirmDeleteModal.index, confirmDeleteModal.category);
          }
        }}
        pathOrPattern={confirmDeleteModal?.itemPath || ''}
        note={confirmDeleteModal?.note}
        isDarkMode={isDarkMode}
      />

      <CleanPluginDataModal
        isOpen={isCleanDataModalOpen}
        onClose={() => setIsCleanDataModalOpen(false)}
        onConfirmClean={(options) => {
          if (onCleanPluginData) {
            return onCleanPluginData(options);
          }
        }}
        currentStats={dbStats}
        isDarkMode={isDarkMode}
      />

      <ResetConfirmModal
        isOpen={isResetConfirmModalOpen}
        onClose={() => setIsResetConfirmModalOpen(false)}
        onConfirm={performResetDefaults}
        tabName={TAB_NAMES[activeSubTab] || 'Current Tab'}
        isDarkMode={isDarkMode}
      />

      <AutoTrashDependencyModal
        isOpen={isAutoTrashDependencyModalOpen}
        onClose={() => setIsAutoTrashDependencyModalOpen(false)}
        onConfirm={() => {
          setIsAutoTrashDependencyModalOpen(false);
          setActiveSubTab('schedule');
        }}
        isDarkMode={isDarkMode}
      />
      <ScanFileTypesRequiredModal
        isOpen={isFileTypesModalOpen}
        onClose={() => {
          setIsFileTypesModalOpen(false);
          setActiveSubTab('scan');
        }}
        isDarkMode={isDarkMode}
      />

      <BroadPatternWarningModal
        isOpen={isBroadPatternModalOpen}
        onClose={() => {
          setIsBroadPatternModalOpen(false);
          setBroadPatternsToConfirm([]);
        }}
        onConfirm={handleConfirmAddBroadPatterns}
        patterns={broadPatternsToConfirm}
        isDarkMode={isDarkMode}
      />

      <UninstallDataWarningModal
        isOpen={isUninstallDataModalOpen}
        onClose={handleCancelUninstallData}
        onConfirm={handleConfirmUninstallData}
        isDarkMode={isDarkMode}
      />

      <UpgradePromptModal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        isDarkMode={isDarkMode}
        title="Auto-Delete Trash is a Pro Feature"
        message="Upgrade to ImgSentry Pro to automatically delete trash files on a schedule."
        upgradeUrl={pro.upgradeUrl}
        context="settings_lock"
        feature="trash_auto_purge"
      />

      <UpgradePromptModal
        open={scheduledScanUpgradeOpen}
        onClose={() => setScheduledScanUpgradeOpen(false)}
        isDarkMode={isDarkMode}
        title="Scheduled Scan is a Pro Feature"
        message="Upgrade to ImgSentry Business or Professional to scan your media library automatically on a schedule."
        upgradeUrl={pro.upgradeUrl}
        context="settings_lock"
        feature="scheduled_scan"
      />

      <UpgradePromptModal
        open={autoTrashUpgradeOpen}
        onClose={() => setAutoTrashUpgradeOpen(false)}
        isDarkMode={isDarkMode}
        title="Auto-Trash Unused Files is a Pro Feature"
        message="Upgrade to ImgSentry Business or Professional to move unused files to Trash automatically after each scheduled scan."
        upgradeUrl={pro.upgradeUrl}
        context="settings_lock"
        feature="auto_trash_unused"
      />

      <UpgradePromptModal
        open={webhookUpgradeOpen}
        onClose={() => setWebhookUpgradeOpen(false)}
        isDarkMode={isDarkMode}
        title="Webhook is a Pro Feature"
        message="Upgrade to ImgSentry Business or Professional to send a signed message to Zapier, Make or your own server whenever a scan finishes."
        upgradeUrl={pro.upgradeUrl}
        context="settings_lock"
        feature="webhook"
      />
    </div>
  );
};
