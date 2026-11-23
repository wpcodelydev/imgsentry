import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  XCircle, 
  RotateCw, 
  Search, 
  ChevronRight, 
  RefreshCw,
  Loader2,
  Info,
  Trash2
} from 'lucide-react';

export interface ScheduledAction {
  id: number | string;
  hook: string;
  status: 'pending' | 'in-progress' | 'complete' | 'failed' | 'canceled' | 'disabled';
  args: Record<string, any> | any[];
  group: string;
  recurrence: string;
  scheduledDate: string;
  claimId?: number | null;
  priority: number;
  source: 'wp_cron' | 'action_scheduler';
  /** Set by the backend: whether Run / Cancel / Re-enable are allowed for this row. Undefined = allowed (demo data). */
  can_run?: boolean;
  can_cancel?: boolean;
  can_enable?: boolean;
  logs: Array<{ timestamp: string; message: string }>;
}

export interface ScheduledActionStatusCounts {
  all: number;
  pending: number;
  'in-progress': number;
  complete: number;
  failed: number;
  canceled: number;
}

const DEFAULT_REAL_ACTIONS: ScheduledAction[] = [
  {
    id: 1042,
    hook: 'imgsentry_daily_trash_purge',
    status: 'pending',
    args: {},
    group: 'imgsentry_cron_group',
    recurrence: '1 day',
    scheduledDate: new Date(Date.now() + 86400000).toISOString().replace('T', ' ').substring(0, 19) + ' +0000',
    claimId: null,
    priority: 10,
    source: 'wp_cron',
    logs: [
      { timestamp: 'Scheduled', message: 'Registered with WP-Cron scheduler via wp_schedule_event()' }
    ]
  },
  {
    id: 1043,
    hook: 'imgsentry_scheduled_scan',
    status: 'pending',
    args: { scan_type: 'smart' },
    group: 'imgsentry_cron_group',
    recurrence: 'Daily',
    scheduledDate: new Date(Date.now() + 43200000).toISOString().replace('T', ' ').substring(0, 19) + ' +0000',
    claimId: null,
    priority: 10,
    source: 'wp_cron',
    logs: [
      { timestamp: 'Scheduled', message: 'Automatic media cleanup scan scheduled' }
    ]
  },
  {
    id: 1046,
    hook: 'imgsentry_fm_process_chunk',
    status: 'complete',
    args: { job_id: 18, chunk_index: 0, batch_size: 100 },
    group: 'imgsentry_fm_jobs',
    recurrence: 'Non-repeating',
    scheduledDate: new Date(Date.now() - 3600000).toISOString().replace('T', ' ').substring(0, 19) + ' +0000',
    claimId: 42,
    priority: 10,
    source: 'action_scheduler',
    logs: [
      { timestamp: '1 hour ago', message: 'Action created via as_enqueue_async_action()' },
      { timestamp: '58 mins ago', message: 'Action claimed by ActionScheduler_QueueRunner (claim ID: 42)' },
      { timestamp: '57 mins ago', message: 'Successfully processed 100 media records' }
    ]
  },
  {
    id: 1047,
    hook: 'imgsentry_fm_watchdog_cron',
    status: 'complete',
    args: [],
    group: 'imgsentry_fm_jobs',
    recurrence: '1 hour',
    scheduledDate: new Date(Date.now() - 900000).toISOString().replace('T', ' ').substring(0, 19) + ' +0000',
    claimId: 44,
    priority: 10,
    source: 'action_scheduler',
    logs: [
      { timestamp: '15 mins ago', message: 'Watchdog check executed: 0 stale locks detected' }
    ]
  }
];

const isWp = typeof window !== 'undefined' && !!(window as any).imgsentry_data;

export const ScheduledActionsTab: React.FC<{ 
  isDarkMode?: boolean;
  onNavigateToLogs?: () => void;
}> = ({ isDarkMode = false, onNavigateToLogs }) => {
  const [actions, setActions] = useState<ScheduledAction[]>(isWp ? [] : DEFAULT_REAL_ACTIONS);
  const [statusCounts, setStatusCounts] = useState<ScheduledActionStatusCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingId, setIsProcessingId] = useState<number | string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in-progress' | 'complete' | 'failed' | 'canceled' | 'disabled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  
  const [selectedAction, setSelectedAction] = useState<ScheduledAction | null>(null);
  const [actionToCancel, setActionToCancel] = useState<ScheduledAction | null>(null);
  const [modalLogs, setModalLogs] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearingActions, setIsClearingActions] = useState(false);

  const ajaxUrl = (window as any).imgsentry_data?.ajax_url || (window as any).ajaxurl || '/wp-admin/admin-ajax.php';
  const nonce = (window as any).imgsentry_data?.nonce || '';

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, isError = false) => {
    setToastIsError(isError);
    setToastMessage(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToastMessage(null), isError ? 8000 : 5000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Fetch real scheduled actions from backend AJAX
  const fetchScheduledActions = useCallback(async () => {
    setIsLoading(true);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_scheduled_actions');
      fd.append('nonce', nonce);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success && Array.isArray(data.data?.actions)) {
        setLoadError(null);
        setActions(data.data.actions);
        if (data.data?.status_counts) {
          setStatusCounts(data.data.status_counts);
        }
      } else if (isWp) {
        // Real WordPress: show the real reason (e.g. permission error) instead of an empty table.
        setLoadError(data?.data?.message || 'Could not load scheduled actions from the server.');
      }
    } catch (err) {
      if (!isWp) {
        console.warn('Backend connection unavailable, utilizing active scheduled actions queue:', err);
      } else {
        console.error('Failed to fetch scheduled actions:', err);
        setLoadError('Could not reach the server. Check your connection and press Refresh Queue.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [ajaxUrl, nonce]);

  useEffect(() => {
    fetchScheduledActions();
  }, [fetchScheduledActions]);

  // Handle running an action via real backend AJAX.
  // In a real WordPress install the UI only ever reports what the server actually did.
  const handleRunAction = async (action: ScheduledAction) => {
    setIsProcessingId(action.id);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_run_scheduled_action');
      fd.append('nonce', nonce);
      fd.append('action_id', String(action.id));
      fd.append('hook', action.hook);
      fd.append('source', action.source || 'wp_cron');

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        showToast(data.data?.message || `Triggered action "${action.hook}" successfully!`);
      } else if (isWp) {
        showToast(data?.data?.message || `Could not run "${action.hook}".`, true);
      } else {
        // Demo / preview mode only (no WordPress backend): simulate locally.
        setActions(prev => prev.map(act => {
          if (act.id !== action.id) return act;
          return {
            ...act,
            status: act.recurrence === 'Non-repeating' ? 'complete' : 'pending',
            logs: [...(act.logs || []), { timestamp: 'Just now', message: `Executed callback for ${action.hook} (demo)` }]
          };
        }));
        showToast(`Triggered action "${action.hook}" (demo).`);
      }
    } catch (err) {
      if (isWp) {
        showToast(`Could not run "${action.hook}": the server did not respond.`, true);
      } else {
        showToast(`Triggered action "${action.hook}" (demo).`);
      }
    } finally {
      setIsProcessingId(null);
      fetchScheduledActions();
    }
  };

  // Handle canceling an action via real backend AJAX
  const handleCancelClick = (action: ScheduledAction) => {
    // Recurring tasks need confirmation (they stay disabled until re-enabled). A one-time run is simply removed.
    if (action.recurrence !== 'Non-repeating') {
      setActionToCancel(action);
    } else {
      executeCancelAction(action);
    }
  };

  const executeCancelAction = async (action: ScheduledAction) => {
    setIsProcessingId(action.id);
    setActionToCancel(null);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_cancel_scheduled_action');
      fd.append('nonce', nonce);
      fd.append('action_id', String(action.id));
      fd.append('hook', action.hook);
      fd.append('source', action.source || 'wp_cron');
      fd.append('args', JSON.stringify(action.args || {}));

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        const hint = data.data?.reenable_hint ? ` ${data.data.reenable_hint}` : '';
        showToast((data.data?.message || `Canceled action "${action.hook}".`) + hint);
      } else if (isWp) {
        showToast(data?.data?.message || `Could not cancel "${action.hook}".`, true);
      } else {
        // Demo / preview mode only
        setActions(prev => prev.map(act => {
          if (act.id !== action.id) return act;
          return {
            ...act,
            status: 'disabled',
            can_enable: true,
            logs: [...(act.logs || []), { timestamp: 'Just now', message: 'Action disabled by administrator (demo)' }]
          };
        }));
        showToast(`Canceled action "${action.hook}" (demo).`);
      }
    } catch (err) {
      if (isWp) {
        showToast(`Could not cancel "${action.hook}": the server did not respond.`, true);
      } else {
        showToast(`Canceled action "${action.hook}" (demo).`);
      }
    } finally {
      setIsProcessingId(null);
      fetchScheduledActions();
    }
  };

  // Re-enable a disabled plugin task (schedules it again on the server)
  const handleEnableAction = async (action: ScheduledAction) => {
    setIsProcessingId(action.id);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_enable_scheduled_action');
      fd.append('nonce', nonce);
      fd.append('hook', action.hook);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        showToast(data.data?.message || `Re-enabled "${action.hook}".`);
      } else {
        showToast(data?.data?.message || `Could not re-enable "${action.hook}".`, true);
      }
    } catch (err) {
      showToast(`Could not re-enable "${action.hook}": the server did not respond.`, true);
    } finally {
      setIsProcessingId(null);
      fetchScheduledActions();
    }
  };

  // Handle loading real logs for action modal
  const handleOpenLogs = async (action: ScheduledAction) => {
    setSelectedAction(action);
    setModalLogs(action.logs || []);
    setIsLogsLoading(true);

    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_scheduled_action_logs');
      fd.append('nonce', nonce);
      fd.append('action_id', String(action.id));
      fd.append('hook', action.hook);
      fd.append('source', action.source || 'wp_cron');

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      // Generic placeholder lines (is_fallback) never replace the row's own information
      // (e.g. why a task is disabled, or when a WP-Cron event runs next).
      if (data.success && Array.isArray(data.data?.logs) && !data.data?.is_fallback) {
        const fetched = data.data.logs;
        setModalLogs(action.source === 'wp_cron' ? [...(action.logs || []), ...fetched] : fetched);
      }
    } catch (err) {
      console.warn('Using local cached logs:', err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  // Handle manually clearing old complete/failed/canceled actions
  const handleClearOldActions = async () => {
    setIsClearingActions(true);
    setShowClearConfirm(false);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_clear_old_scheduled_actions');
      fd.append('nonce', nonce);
      fd.append('status', 'all');
      fd.append('older_than_days', '0');

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        const deletedCount = data.data?.deleted_count ?? 0;
        showToast(`Cleared ${deletedCount} old action${deletedCount === 1 ? '' : 's'}.`);
      } else {
        showToast(data.data?.message || 'Failed to clear old actions.', true);
      }
    } catch (err) {
      showToast('Error occurred while clearing old actions.', true);
    } finally {
      setIsClearingActions(false);
      fetchScheduledActions();
    }
  };

  // Filter actions
  const filteredActions = actions.filter(act => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'canceled') {
        if (act.status !== 'canceled' && act.status !== 'disabled') return false;
      } else if (act.status !== statusFilter) {
        return false;
      }
    }
    if (groupFilter !== 'all' && act.group !== groupFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchHook = act.hook.toLowerCase().includes(q);
      const matchGroup = (act.group || '').toLowerCase().includes(q);
      const matchArgs = JSON.stringify(act.args || {}).toLowerCase().includes(q);
      const matchId = String(act.id).includes(q);
      if (!matchHook && !matchGroup && !matchArgs && !matchId) return false;
    }
    return true;
  });

  const counts = useMemo(() => {
    if (statusCounts) {
      return statusCounts;
    }
    return {
      all: actions.length,
      pending: actions.filter(a => a.status === 'pending').length,
      'in-progress': actions.filter(a => a.status === 'in-progress').length,
      complete: actions.filter(a => a.status === 'complete').length,
      failed: actions.filter(a => a.status === 'failed').length,
      canceled: actions.filter(a => a.status === 'canceled' || a.status === 'disabled').length,
    };
  }, [statusCounts, actions]);

  const renderedCompleteCount = useMemo(() => {
    return actions.filter(a => a.status === 'complete').length;
  }, [actions]);

  const isCompleteTruncated = counts.complete > renderedCompleteCount;

  return (
    <div className={`space-y-6 max-w-7xl mx-auto ${isDarkMode ? 'dark text-slate-100' : 'text-slate-800'}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          {toastIsError ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* WordPress Settings Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-[#243044]">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            <span>Settings</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-[#A61E69] dark:text-pink-400 font-semibold">Scheduled Actions</span>
          </div>
          <h1 className="imgsentry-sa-title text-2xl font-bold text-slate-900 dark:text-white! tracking-tight flex items-center gap-3">
            <Clock className="imgsentry-sa-title-icon w-6 h-6 text-[#A61E69] dark:text-pink-400 shrink-0" />
            <span>Scheduled Actions</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Monitors real recurring background events from WP-Cron and Action Scheduler queues (media scans, trash purges, and directory indexers).
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={isLoading || isClearingActions}
            className="px-3 py-2 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-[#A61E69] dark:text-pink-400 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            title="Manually clear Complete, Failed, and Canceled action history for File Manager background jobs"
          >
            {isClearingActions ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Clear Old Actions</span>
          </button>

          <button
            onClick={fetchScheduledActions}
            disabled={isLoading}
            className="px-3 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            title="Refresh scheduled actions queue from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-[#243044] rounded-xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-gray-100 dark:border-[#243044]">
          <div className="flex items-center gap-1 overflow-x-auto text-xs font-semibold">
            {(['all', 'pending', 'in-progress', 'complete', 'failed', 'canceled'] as const).map(st => {
              const isActive = statusFilter === st;
              return (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-[#A61E69] text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{st.replace('-', ' ')}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}>
                    {counts[st]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* Group Filter */}
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="text-xs bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#A61E69]"
            >
              <option value="all">All Groups</option>
              <option value="imgsentry_cron_group">imgsentry_cron_group</option>
              <option value="imgsentry_fm_jobs">imgsentry_fm_jobs</option>
            </select>

            {/* Search Box */}
            <div className="imgsentry-sa-search-wrap">
              <input
                type="text"
                placeholder="Search hook, group, args or ID"
                aria-label="Search scheduled actions by hook, group, arguments or ID"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="imgsentry-sa-search text-xs bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 dark:placeholder:text-[#5b6579] focus:outline-none focus:ring-1 focus:ring-[#A61E69]"
              />
              <Search className="imgsentry-sa-search-icon w-4 h-4 text-slate-400 dark:text-[#5b6579]" />
            </div>
          </div>
        </div>

        {/* Complete Actions Truncation Banner */}
        {isCompleteTruncated && (statusFilter === 'complete' || statusFilter === 'all') && (
          <div className="mt-3 p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-blue-900 dark:text-blue-200 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                Showing {renderedCompleteCount} most recent completed {renderedCompleteCount === 1 ? 'action' : 'actions'} (out of {counts.complete.toLocaleString()} total in queue). Full history is preserved in system activity logs.
              </span>
            </div>
            {onNavigateToLogs && (
              <button
                type="button"
                onClick={onNavigateToLogs}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] whitespace-nowrap cursor-pointer transition-colors shrink-0 shadow-2xs self-start sm:self-auto"
              >
                View Logs
              </button>
            )}
          </div>
        )}

        {loadError && (
          <div className="mt-3 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Action Scheduler WP List Table */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#243044] text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-50/50 dark:bg-slate-900/50">
                <th className="py-2.5 px-3">Hook</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Arguments</th>
                <th className="py-2.5 px-3">Group</th>
                <th className="py-2.5 px-3">Recurrence</th>
                <th className="py-2.5 px-3">Scheduled Date</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#243044]/80">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#A61E69]" />
                      <span>Fetching scheduled actions from database...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredActions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No scheduled actions found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredActions.map(act => (
                  <tr 
                    key={act.id} 
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[#A61E69] dark:text-pink-400 break-all">{act.hook}</span>
                        {act.source === 'wp_cron' && (
                          <span className="text-[9px] bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.2 rounded font-sans font-semibold border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                            WP-Cron
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">ID: #{act.id}</div>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                        act.status === 'complete' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' :
                        act.status === 'pending' ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' :
                        act.status === 'in-progress' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' :
                        act.status === 'failed' ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800' :
                        act.status === 'disabled' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {act.status === 'complete' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                        {act.status === 'pending' && <Clock className="w-3 h-3 text-amber-500" />}
                        {act.status === 'in-progress' && <RotateCw className="w-3 h-3 text-blue-500 animate-spin" />}
                        {act.status === 'failed' && <AlertCircle className="w-3 h-3 text-rose-500" />}
                        {act.status === 'canceled' && <XCircle className="w-3 h-3 text-slate-500" />}
                        {act.status === 'disabled' && <XCircle className="w-3 h-3 text-slate-400" />}
                        <span>{act.status}</span>
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 max-w-xs truncate" title={JSON.stringify(act.args)}>
                      {JSON.stringify(act.args)}
                    </td>

                    <td className="py-3 px-3">
                      <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300">
                        {act.group || 'imgsentry_cron_group'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {act.recurrence}
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {act.scheduledDate}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {act.status === 'pending' && act.can_run !== false && (
                          <button
                            onClick={() => handleRunAction(act)}
                            disabled={isProcessingId === act.id}
                            className="p-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                            title="Run immediately"
                          >
                            {isProcessingId === act.id ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Play className="w-2.5 h-2.5" />
                            )}
                            <span>Run</span>
                          </button>
                        )}
                        {act.status === 'disabled' && act.can_enable && (
                          <button
                            onClick={() => handleEnableAction(act)}
                            disabled={isProcessingId === act.id}
                            className="p-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                            title="Schedule this task again"
                          >
                            {isProcessingId === act.id ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RotateCw className="w-2.5 h-2.5" />
                            )}
                            <span>Re-enable</span>
                          </button>
                        )}
                        {act.status === 'pending' && act.can_cancel !== false && (
                          <button
                            onClick={() => handleCancelClick(act)}
                            disabled={isProcessingId === act.id}
                            className="p-1 px-2 border border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-50"
                            title="Cancel and unschedule action"
                          >
                            <span>Cancel</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenLogs(act)}
                          className="p-1 px-2 border border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] font-medium cursor-pointer transition-colors whitespace-nowrap"
                          title="View Action Details & Logs"
                        >
                          Log ({(act.logs || []).length})
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {actionToCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl text-slate-100">
            <div className="flex items-center gap-3 mb-4 text-amber-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white" style={{ color: '#ffffff' }}>Disable Recurring Task?</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              This will disable <span className="font-mono font-bold text-pink-400">{actionToCancel.hook}</span> ({actionToCancel.recurrence}). It stays disabled until you press <strong className="text-slate-200">Re-enable</strong> on this page. Continue?
            </p>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 mb-6 flex items-start gap-2">
              <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                A disabled task shows up in the list with a <strong className="text-slate-200">Re-enable</strong> button. Disabling the Scheduled Media Scan also turns off <strong className="text-slate-200">Enable Scheduled Scan</strong> in Settings.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setActionToCancel(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Keep Active
              </button>
              <button
                onClick={() => executeCancelAction(actionToCancel)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                <XCircle className="w-4 h-4" />
                <span>Confirm & Disable Task</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl text-slate-100">
            <div className="flex items-center gap-3 mb-4 text-rose-500">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white" style={{ color: '#ffffff' }}>Clear Old Actions?</h3>
            </div>
            
            <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs text-slate-300 leading-relaxed mb-6 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#A61E69] dark:text-pink-400 shrink-0 mt-0.5" />
              <span>
                This will permanently delete Complete, Failed, and Canceled File Manager job history (<strong className="text-slate-200">imgsentry_fm_jobs</strong> queue only — other plugins' scheduled actions are not affected). Pending and in-progress actions stay untouched. This can't be undone.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearOldActions}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Old Actions</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Detail & Log Modal */}
      {selectedAction && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-[#243044] shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-[#243044]">
              <div>
                <div className="text-xs font-mono text-[#A61E69] dark:text-pink-400 font-bold flex items-center gap-2">
                  <span>Action #{selectedAction.id}</span>
                  {selectedAction.source === 'wp_cron' && (
                    <span className="text-[10px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.2 rounded font-sans font-medium">
                      WP-Cron Event
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedAction.hook}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAction(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-[#e7ecf3] cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Status</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 capitalize mt-1">
                  {selectedAction.status}
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Group</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono mt-1">
                  {selectedAction.group || 'imgsentry_cron_group'}
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Claim ID</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono mt-1">
                  {selectedAction.claimId ? `#${selectedAction.claimId}` : 'None (Unclaimed)'}
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-slate-400">Priority</div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                  {selectedAction.priority || 10} (Default)
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Payload Arguments</label>
              <pre className="p-3 bg-slate-100 dark:bg-[#0b1220] rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto border border-gray-200 dark:border-[#243044]">
                {JSON.stringify(selectedAction.args, null, 2)}
              </pre>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Execution Log Trail</label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {isLogsLoading ? (
                  <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A61E69]" />
                    <span>Loading logs from database...</span>
                  </div>
                ) : modalLogs.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400 bg-gray-50 dark:bg-slate-800/40 rounded-lg">
                    No log entries found for this scheduled task.
                  </div>
                ) : (
                  modalLogs.map((log, idx) => (
                    <div key={idx} className="p-2.5 bg-gray-50 dark:bg-slate-800/40 border border-gray-100 dark:border-[#243044] rounded-lg text-xs flex items-start gap-2">
                      <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap pt-0.5">{log.timestamp}</span>
                      <span className="text-slate-700 dark:text-slate-200 font-mono text-[11px]">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedAction(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduledActionsTab;
