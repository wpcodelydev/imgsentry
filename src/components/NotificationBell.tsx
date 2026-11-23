import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CalendarClock,
  Gauge,
  Info,
  FolderOpen,
  ShieldAlert,
  Server,
  Trash2,
  Zap,
} from 'lucide-react';
import type { ScanHistoryEntry } from '../types';
import { getInitialQuota } from './OptimizationQuotaBar';

export interface NotificationBellWarning {
  code: string;
  message: string;
}

type Severity = 'success' | 'warning' | 'error' | 'info';

interface NotificationItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  target: string;
  kind: 'scan' | 'quota' | 'schedule' | 'warning' | 'account' | 'security' | 'file' | 'system' | 'trash' | 'optimize';
}

interface NotificationBellProps {
  scanHistory: ScanHistoryEntry[];
  serverWarnings?: NotificationBellWarning[];
  /** Called with a main-nav page key ('unused', 'image_optimization', 'scheduled_actions', 'settings', 'trash', 'wp_file_manager'). */
  onNavigate: (page: string) => void;
  isDarkMode?: boolean;
  /** Matches the two header styles that use the bell. */
  rounded?: 'rounded-lg' | 'rounded-xl';
}

const STORAGE_KEY = 'imgsentry_read_notifications_v1';

/** Read-state key of a notification id: only letters, digits and . _ : - (the server accepts nothing else). */
const keyOf = (id: string): string => id.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 120);

function loadReadIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').map(keyOf) : [];
  } catch (e) {
    return [];
  }
}

/** Save "read" on the server (per user), so it is the same in every browser and on every device. */
function postRead(keys: string[]) {
  if (!isWp() || keys.length === 0) return;
  const data = (window as any).imgsentry_data || {};
  const ajaxUrl = data.ajax_url || (window as any).ajaxurl;
  const nonce = data.nonce || '';
  if (!ajaxUrl || !nonce) return;
  try {
    const fd = new FormData();
    fd.append('action', 'imgsentry_bell_mark_read');
    fd.append('nonce', nonce);
    fd.append('ids', JSON.stringify(keys.slice(-100)));
    fetch(ajaxUrl, { method: 'POST', body: fd }).catch(() => {
      /* the browser copy still works if the server cannot be reached */
    });
  } catch (e) {
    /* ignore */
  }
}

function saveReadIds(ids: string[]) {
  try {
    // Keep the list small so it never grows forever.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-300)));
  } catch (e) {
    /* storage unavailable: the bell still works for this page view */
  }
}

const isWp = (): boolean => typeof window !== 'undefined' && !!(window as any).imgsentry_data;

const SEVERITIES: Severity[] = ['success', 'warning', 'error', 'info'];
const KINDS: NotificationItem['kind'][] = ['scan', 'quota', 'schedule', 'warning', 'account', 'security', 'file', 'system', 'trash', 'optimize'];

/** Notifications built by the server (File Manager events, scheduled tasks, optimization, Trash): check the shape before showing them. */
function normalizeServerItem(raw: any): NotificationItem | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string' || raw.id === '') return null;
  return {
    // The prefix keeps server ids apart from the ids this component builds itself.
    id: `srv-${raw.id}`,
    severity: SEVERITIES.includes(raw.severity) ? raw.severity : 'info',
    kind: KINDS.includes(raw.kind) ? raw.kind : 'system',
    title: raw.title,
    detail: typeof raw.detail === 'string' ? raw.detail : '',
    target: typeof raw.target === 'string' && raw.target !== '' ? raw.target : 'dashboard',
  };
}

/** Sample entries for the Google AI Studio preview only (no WordPress there, so no server to ask). */
const PREVIEW_ITEMS: NotificationItem[] = [
  {
    id: 'srv-preview-denied',
    severity: 'warning',
    kind: 'security',
    title: '3 blocked File Manager attempts',
    detail: 'editor tried an action without permission. Last: wp-config.php',
    target: 'wp_file_manager',
  },
  {
    id: 'srv-preview-job',
    severity: 'success',
    kind: 'file',
    title: 'File Manager zip job finished',
    detail: 'Job #12, 24 items.',
    target: 'wp_file_manager',
  },
  {
    id: 'srv-preview-cron',
    severity: 'warning',
    kind: 'system',
    title: 'Scheduled tasks are not running on time',
    detail: 'Scheduled scans, Trash auto-delete and cleanup tasks are running late.',
    target: 'scheduled_actions',
  },
];

export const NotificationBell: React.FC<NotificationBellProps> = ({
  scanHistory,
  serverWarnings = [],
  onNavigate,
  isDarkMode = false,
  rounded = 'rounded-xl',
}) => {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => loadReadIds());
  const [failedActions, setFailedActions] = useState<number>(0);
  const [serverItems, setServerItems] = useState<NotificationItem[]>(() => (isWp() ? [] : PREVIEW_ITEMS));
  const readIdsRef = useRef<string[]>(readIds);
  readIdsRef.current = readIds;
  const wrapRef = useRef<HTMLDivElement>(null);

  // Failed scheduled actions (real WordPress only; the preview has no server).
  useEffect(() => {
    if (!isWp()) return;
    let cancelled = false;
    const data = (window as any).imgsentry_data || {};
    const ajaxUrl = data.ajax_url || (window as any).ajaxurl;
    const nonce = data.nonce || '';
    if (!ajaxUrl || !nonce) return;

    const load = async () => {
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_get_scheduled_actions');
        fd.append('nonce', nonce);
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (cancelled || !json || !json.success) return;
        const counts = json.data && json.data.status_counts;
        let failed = counts && typeof counts.failed === 'number' ? counts.failed : null;
        if (failed === null && Array.isArray(json.data && json.data.actions)) {
          failed = json.data.actions.filter((a: any) => a && a.status === 'failed').length;
        }
        setFailedActions(Number(failed) || 0);
      } catch (e) {
        /* no notification if the server cannot be reached */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Notifications from the server: File Manager events (only while it is active), late scheduled tasks,
  // optimization results and Trash. Refreshed when the bell opens and every 2 minutes while the page is visible.
  useEffect(() => {
    if (!isWp()) return;
    let cancelled = false;
    const data = (window as any).imgsentry_data || {};
    const ajaxUrl = data.ajax_url || (window as any).ajaxurl;
    const nonce = data.nonce || '';
    if (!ajaxUrl || !nonce) return;

    const load = async () => {
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_get_notifications');
        fd.append('nonce', nonce);
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (cancelled || !json || !json.success || !json.data || !Array.isArray(json.data.items)) return;
        const next = json.data.items
          .map(normalizeServerItem)
          .filter((x: NotificationItem | null): x is NotificationItem => x !== null);
        setServerItems(next);

        // Read state lives on the server (per user). Join it with this browser's copy, and send the server
        // whatever only this browser knew (read before the state was kept on the server).
        const serverRead: string[] = Array.isArray(json.data.read_ids)
          ? json.data.read_ids.filter((x: unknown): x is string => typeof x === 'string')
          : [];
        const local = readIdsRef.current;
        const merged = Array.from(new Set([...serverRead, ...local])).slice(-300);
        if (merged.some((k) => !local.includes(k))) {
          setReadIds(merged);
          saveReadIds(merged);
        }
        const missing = local.filter((k) => !serverRead.includes(k));
        if (missing.length > 0) postRead(missing);
      } catch (e) {
        /* no server notifications if the server cannot be reached */
      }
    };

    load();
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load();
    }, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = [];

    // 1) Latest scan result.
    const latest = [...(scanHistory || [])]
      .filter((s) => s && (s.status === 'completed' || s.status === 'failed'))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
    if (latest) {
      if (latest.status === 'failed') {
        list.push({
          id: `scan-${latest.id}`,
          severity: 'error',
          kind: 'scan',
          title: 'Last scan failed',
          detail: `${latest.scanType || 'Scan'} on ${latest.formattedDate || latest.timestamp} did not finish. Please run it again.`,
          target: 'scanner',
        });
      } else {
        const unused = Number(latest.unusedCount) || 0;
        list.push({
          id: `scan-${latest.id}`,
          severity: unused > 0 ? 'info' : 'success',
          kind: 'scan',
          title: 'Scan completed',
          detail:
            unused > 0
              ? `${unused.toLocaleString()} unused file${unused === 1 ? '' : 's'} found (${latest.formattedUnusedSize || '0 B'}) on ${latest.formattedDate || latest.timestamp}.`
              : `No unused files found on ${latest.formattedDate || latest.timestamp}.`,
          target: unused > 0 ? 'unused' : 'scanner',
        });
      }
    }

    // 2) Account / license state. target 'url:<link>' opens that link instead of an app page.
    const quota = getInitialQuota();
    if (quota && quota.account_connected === false && quota.account_url) {
      list.push({
        id: `account-not-connected-${quota.account_state || 'disconnected'}`,
        severity: 'warning',
        kind: 'account',
        title: 'Account not connected',
        detail: 'Connect your free account to optimize images',
        target: `url:${quota.account_url}`,
      });
    } else if (quota && quota.account_connected !== false && quota.license_active === false && quota.plan === 'free' && quota.account_url) {
      // The server only sends license_active=false when the Premium code runs without an active license.
      list.push({
        id: 'account-license-inactive',
        severity: 'warning',
        kind: 'account',
        title: 'Your license is inactive.',
        detail: 'Please open your account settings to reactivate it.',
        target: `url:${quota.account_url}`,
      });
    }

    // 3) Optimization quota.
    if (quota && !quota.unlimited) {
      const cycle = quota.cycle_start || 0;
      if (quota.exhausted) {
        list.push({
          id: `quota-exhausted-${cycle}`,
          severity: 'error',
          kind: 'quota',
          title: 'Optimization quota used up',
          detail: 'You have used all optimization credits for this period. Upgrade to keep optimizing images.',
          target: 'image_optimization',
        });
      } else if ((Number(quota.percent) || 0) >= 80) {
        list.push({
          id: `quota-80-${cycle}`,
          severity: 'warning',
          kind: 'quota',
          title: 'Optimization quota almost used',
          detail: `${Math.round(Number(quota.percent) || 0)}% of your optimization quota is used.`,
          target: 'image_optimization',
        });
      }
    }

    // 4) Failed scheduled actions.
    if (failedActions > 0) {
      list.push({
        id: `schedule-failed-${failedActions}`,
        severity: 'error',
        kind: 'schedule',
        title: `${failedActions} scheduled action${failedActions === 1 ? '' : 's'} failed`,
        detail: 'Open Scheduled Actions to see the error and run them again.',
        target: 'scheduled_actions',
      });
    }

    // 5) Server warnings (settings the server had to change).
    (serverWarnings || []).forEach((w, i) => {
      if (!w || !w.message) return;
      list.push({
        id: `warning-${w.code || i}`,
        severity: 'warning',
        kind: 'warning',
        title: 'Settings warning',
        detail: w.message,
        target: 'settings',
      });
    });

    // 6) Server notifications (the server only sends File Manager events while the File Manager is active).
    serverItems.forEach((n) => list.push(n));

    return list;
  }, [scanHistory, serverWarnings, failedActions, serverItems, open]);

  const unreadCount = notifications.filter((n) => !readIds.includes(keyOf(n.id))).length;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = (ids: string[]) => {
    const fresh = ids.map(keyOf).filter((k) => !readIds.includes(k));
    if (fresh.length === 0) return;
    const next = Array.from(new Set([...readIds, ...fresh])).slice(-300);
    setReadIds(next);
    saveReadIds(next);
    postRead(fresh);
  };

  const iconFor = (n: NotificationItem) => {
    const cls = 'w-4 h-4';
    if (n.kind === 'schedule') return <CalendarClock className={cls} />;
    if (n.kind === 'quota') return <Gauge className={cls} />;
    if (n.kind === 'security') return <ShieldAlert className={cls} />;
    if (n.kind === 'file') return <FolderOpen className={cls} />;
    if (n.kind === 'trash') return <Trash2 className={cls} />;
    if (n.kind === 'optimize') return <Zap className={cls} />;
    if (n.kind === 'system') return <Server className={cls} />;
    if (n.severity === 'success') return <CheckCircle2 className={cls} />;
    if (n.severity === 'error') return <XCircle className={cls} />;
    if (n.severity === 'warning') return <AlertTriangle className={cls} />;
    return <Info className={cls} />;
  };

  const toneFor = (s: Severity) =>
    s === 'success'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
      : s === 'error'
      ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
      : s === 'warning'
      ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
      : 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        className={`p-2 ${rounded} border transition-colors cursor-pointer relative ${
          isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-gray-300 text-gray-700'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 bg-rose-600 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] z-50 bg-white dark:bg-[#111827] border border-gray-200 dark:border-[#243044] rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#243044]">
            <h3 className="text-xs font-extrabold text-gray-900 dark:text-white uppercase tracking-wide">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead(notifications.map((n) => n.id))}
                className="text-[11px] font-bold text-[#A61E69] dark:text-pink-400 hover:underline cursor-pointer"
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
              <p className="text-xs font-bold text-gray-800 dark:text-slate-200">You're all caught up</p>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Nothing needs your attention right now.</p>
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-[#243044]">
              {notifications.map((n) => {
                const unread = !readIds.includes(keyOf(n.id));
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        markRead([n.id]);
                        setOpen(false);
                        if (n.target.startsWith('url:')) {
                          window.location.href = n.target.slice(4);
                        } else {
                          onNavigate(n.target);
                        }
                      }}
                      className="w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${toneFor(n.severity)}`}>
                        {iconFor(n)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">{n.title}</span>
                          {unread && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" aria-hidden="true" />}
                        </span>
                        <span className="block text-[11px] leading-snug text-gray-500 dark:text-slate-400 mt-0.5">{n.detail}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
