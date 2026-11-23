import { csvCell, CSV_BOM } from '../utils/csv';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Calendar, 
  RefreshCw, 
  RotateCcw,
  Settings, 
  Download, 
  Trash2, 
  Info, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ShieldAlert, 
  Search, 
  Filter, 
  Eye, 
  Copy, 
  MoreVertical, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Shield, 
  Scan, 
  Server, 
  HardDrive, 
  FileCheck, 
  User, 
  KeyRound, 
  Check, 
  AlertCircle,
  List,
  Grid,
  FileText,
  X,
  Clock,
  Globe,
  Zap
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip 
} from 'recharts';

import { PluginSettings, LogItem, LogStats } from '../types';
import { formatDateWithTimeZone, formatSiteLogTime } from '../utils/timeZoneUtils';

export type { LogItem, LogStats };

interface LogsTabProps {
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning') => void;
  settings?: PluginSettings;
  onExportLogs?: () => void;
  isDarkMode?: boolean;
  logs?: LogItem[];
  onClearLogs?: () => void;
  showExportTrigger?: boolean;
  onCloseExportTrigger?: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

// ---- Helpers: map the WordPress (PHP) response shape to what this component renders ----

type ServerStats = LogStats & {
  dailySeries?: Array<{ date: string; key: string; count: number }>;
  distinctSources?: string[];
  distinctTypes?: string[];
  distinctUsers?: string[];
  retentionDays?: number;
};

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toStrList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : undefined;

// PHP sends info_count / logs_over_time / top_sources / distinct_* ; the UI reads info / timeline / topSources.
const normalizeStats = (raw: any): ServerStats => ({
  total: toNum(raw?.total),
  info: toNum(raw?.info_count ?? raw?.info),
  success: toNum(raw?.success_count ?? raw?.success),
  warning: toNum(raw?.warning_count ?? raw?.warning),
  error: toNum(raw?.error_count ?? raw?.error),
  critical: toNum(raw?.critical_count ?? raw?.critical),
  topSources: Array.isArray(raw?.top_sources)
    ? raw.top_sources.map((s: any) => ({
        source: String(s?.source ?? 'System'),
        count: toNum(s?.raw_count ?? s?.count),
        percentage: toNum(s?.percentage)
      }))
    : undefined,
  dailySeries: Array.isArray(raw?.logs_over_time)
    ? raw.logs_over_time.map((d: any) => ({
        date: String(d?.date ?? ''),
        key: String(d?.key ?? ''),
        count: toNum(d?.count)
      }))
    : undefined,
  distinctSources: toStrList(raw?.distinct_sources),
  distinctTypes: toStrList(raw?.distinct_types),
  distinctUsers: toStrList(raw?.distinct_users),
  retentionDays: raw?.log_retention_days != null ? toNum(raw.log_retention_days) : undefined
});

const normalizeLogItem = (raw: any): LogItem => ({
  ...raw,
  details: raw?.details ?? raw?.raw_details ?? undefined
});

// Daily = last 14 days, Weekly = 7-day buckets (newest last), Monthly = calendar months.
const groupDailySeries = (
  series: Array<{ date: string; key: string; count: number }>,
  grouping: 'daily' | 'weekly' | 'monthly'
): Array<{ date: string; count: number }> => {
  if (grouping === 'daily') {
    return series.slice(-14).map(d => ({ date: d.date, count: d.count }));
  }
  if (grouping === 'weekly') {
    const buckets: Array<{ date: string; count: number }> = [];
    for (let end = series.length; end > 0; end -= 7) {
      const chunk = series.slice(Math.max(0, end - 7), end);
      buckets.unshift({ date: chunk[0].date, count: chunk.reduce((sum, d) => sum + d.count, 0) });
    }
    return buckets.slice(-12);
  }
  const months: Array<{ date: string; count: number }> = [];
  let currentKey = '';
  series.forEach(d => {
    const monthKey = d.key.substring(0, 7);
    if (monthKey !== currentKey) {
      currentKey = monthKey;
      months.push({ date: `${d.date.split(' ')[0]} ${monthKey.substring(0, 4)}`, count: 0 });
    }
    months[months.length - 1].count += d.count;
  });
  return months;
};

const buildOptions = (
  serverList: string[] | undefined,
  fallback: string[],
  selected: string,
  useServer: boolean
): string[] => {
  const base = useServer && serverList !== undefined ? serverList : fallback;
  const out = [...base];
  if (selected !== 'all' && !out.some(o => o.toLowerCase() === selected.toLowerCase())) {
    out.push(selected);
  }
  return out;
};

const prettyDetails = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export const LogsTab: React.FC<LogsTabProps> = ({
  settings,
  onExportLogs,
  isDarkMode = false,
  logs: propLogs,
  onClearLogs,
  showExportTrigger,
  onCloseExportTrigger,
  isRefreshing: propIsRefreshing,
  onRefresh,
  onNotify
}) => {
  // Check if running in WordPress environment
  const getImgSentryData = () => {
    return typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
  };

  const isWpConnected = Boolean(getImgSentryData()?.ajax_url || getImgSentryData()?.ajaxUrl);

  const initialLogs = propLogs !== undefined ? propLogs : [];

  const [logsList, setLogsList] = useState<LogItem[]>(initialLogs);
  const [totalServerCount, setTotalServerCount] = useState<number>(initialLogs.length);
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasFetchedOnce, setHasFetchedOnce] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState('all');
  const [logTypeFilter, setLogTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [timelineGrouping, setTimelineGrouping] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [localIsRefreshing, setLocalIsRefreshing] = useState(false);
  const [selectedLogDetail, setSelectedLogDetail] = useState<LogItem | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const requestSeqRef = useRef(0);

  const isRefreshing = localIsRefreshing || propIsRefreshing || isLoading;

  const notify = (text: string, type: 'success' | 'error' | 'warning' = 'error') => {
    setNotice({ type, text });
    onNotify?.(text, type);
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Debounce typing in the search box so every keystroke does not hit the server
  useEffect(() => {
    if (searchInput === searchQuery) return;
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, searchQuery]);

  // Fetch logs from WordPress AJAX backend
  const fetchLogsFromBackend = useCallback(async () => {
    const imgsentryData = getImgSentryData();
    if (!imgsentryData || (!imgsentryData.ajax_url && !imgsentryData.ajaxUrl)) {
      return false;
    }

    const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
    const nonce = imgsentryData.nonce || '';

    // Only the newest request may update the screen (older, slower responses are ignored)
    const requestId = ++requestSeqRef.current;
    setIsLoading(true);
    let ok = false;
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_logs');
      fd.append('nonce', nonce);
      fd.append('page', String(currentPage));
      fd.append('per_page', String(itemsPerPage));
      if (searchQuery.trim()) fd.append('search', searchQuery.trim());
      if (logLevelFilter !== 'all') fd.append('level', logLevelFilter);
      if (logTypeFilter !== 'all') fd.append('type', logTypeFilter);
      if (sourceFilter !== 'all') fd.append('source', sourceFilter);
      if (userFilter !== 'all') fd.append('user', userFilter);
      if (dateFilter !== 'all') fd.append('date_range', dateFilter);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();

      if (requestId !== requestSeqRef.current) {
        return true; // superseded by a newer request, not a failure
      }

      if (data.success && data.data) {
        setLogsList((data.data.items || []).map(normalizeLogItem));
        setTotalServerCount(toNum(data.data.total));
        if (data.data.stats) {
          setServerStats(normalizeStats(data.data.stats));
        }
        ok = true;
      }
    } catch (err) {
      console.error('Failed to fetch logs from WordPress backend:', err);
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
        setHasFetchedOnce(true);
      }
    }
    return ok;
  }, [currentPage, itemsPerPage, searchQuery, logLevelFilter, logTypeFilter, sourceFilter, userFilter, dateFilter]);

  // Initial load and filter change trigger
  useEffect(() => {
    fetchLogsFromBackend();
  }, [fetchLogsFromBackend]);

  // If the current page no longer exists (filters narrowed the result / entries were deleted), step back
  useEffect(() => {
    if (!isWpConnected || !hasFetchedOnce || isLoading) return;
    const lastPage = Math.max(1, Math.ceil(totalServerCount / itemsPerPage));
    if (currentPage > lastPage) {
      setCurrentPage(lastPage);
    }
  }, [isWpConnected, hasFetchedOnce, isLoading, totalServerCount, itemsPerPage, currentPage]);

  // Trigger export from parent if requested
  useEffect(() => {
    if (showExportTrigger) {
      handleExportCSV();
      if (onCloseExportTrigger) {
        onCloseExportTrigger();
      }
    }
  }, [showExportTrigger]);

  const handleRefresh = async () => {
    setLocalIsRefreshing(true);
    const backendSuccess = await fetchLogsFromBackend();
    if (!backendSuccess && onRefresh) {
      onRefresh();
    }
    setLocalIsRefreshing(false);
  };

  // Helper functions for dynamic icons
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Scan': return <Scan className="w-3.5 h-3.5 text-blue-500" />;
      case 'Delete': return <Trash2 className="w-3.5 h-3.5 text-rose-500" />;
      case 'Restore': return <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />;
      case 'Optimize': return <Zap className="w-3.5 h-3.5 text-amber-500" />;
      case 'Reference': return <FileCheck className="w-3.5 h-3.5 text-purple-500" />;
      case 'System': return <HardDrive className="w-3.5 h-3.5 text-indigo-500" />;
      case 'File': return <FileCheck className="w-3.5 h-3.5 text-teal-500" />;
      case 'Login': return <KeyRound className="w-3.5 h-3.5 text-orange-500" />;
      default: return <Info className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  // On a live site the server already sends the time in the site's own timezone: no timezone conversion here
  // (re-parsing it in the browser and converting it again shifted it by the timezone difference).
  // Only the Date Format setting is applied.
  const displayTime = (t: string) =>
    isWpConnected ? formatSiteLogTime(t, settings?.dateFormat) : formatDateWithTimeZone(t, settings?.timeZone || 'UTC', settings?.dateFormat);

  const getSourceIcon = (source: string) => {
    return <Server className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />;
  };

  // Helper for Level Pill Styling
  const getLevelBadgeClass = (level: string) => {
    const l = level.toLowerCase();
    switch (l) {
      case 'success':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'warning':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'error':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      case 'critical':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'info':
      default:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800';
    }
  };

  // Fallback client-side filtering for standalone preview
  const displayLogs = useMemo(() => {
    if (isWpConnected) {
      return logsList;
    }
    return initialLogs.filter(item => {
      const matchesSearch = searchQuery === '' || 
        item.boldText.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.subText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.source.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel = logLevelFilter === 'all' || item.level.toLowerCase() === logLevelFilter.toLowerCase();
      const matchesType = logTypeFilter === 'all' || item.type.toLowerCase() === logTypeFilter.toLowerCase();
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
      const matchesUser = userFilter === 'all' || item.user === userFilter;
      return matchesSearch && matchesLevel && matchesType && matchesSource && matchesUser;
    });
  }, [isWpConnected, logsList, initialLogs, searchQuery, logLevelFilter, logTypeFilter, sourceFilter, userFilter]);

  const totalLogsCount = serverStats?.total ?? (isWpConnected ? totalServerCount : displayLogs.length);
  const infoCount = serverStats?.info ?? displayLogs.filter(l => l.level.toLowerCase() === 'info').length;
  const successCount = serverStats?.success ?? displayLogs.filter(l => l.level.toLowerCase() === 'success').length;
  const warningCount = serverStats?.warning ?? displayLogs.filter(l => l.level.toLowerCase() === 'warning').length;
  const errorCount = serverStats?.error ?? displayLogs.filter(l => l.level.toLowerCase() === 'error').length;
  const criticalCount = serverStats?.critical ?? displayLogs.filter(l => l.level.toLowerCase() === 'critical').length;

  const getPercentage = (count: number) => {
    if (!totalLogsCount || totalLogsCount === 0) return '0%';
    return ((count / totalLogsCount) * 100).toFixed(1) + '%';
  };

  // Line Chart Data: Logs Over Time (Aggregated from real data or server stats)
  const logsOverTimeData = useMemo(() => {
    if (serverStats?.dailySeries && serverStats.dailySeries.length > 0) {
      return groupDailySeries(serverStats.dailySeries, timelineGrouping);
    }
    const counts: Record<string, number> = {};
    displayLogs.forEach(log => {
      const datePart = log.time.includes(',') ? log.time.split(',')[0] : log.time.substring(0, 10);
      counts[datePart] = (counts[datePart] || 0) + 1;
    });
    
    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [serverStats, displayLogs, timelineGrouping]);

  // Donut Chart Data: Logs by Level
  const logsByLevelData = useMemo(() => [
    { name: 'Info', value: infoCount, color: '#3B82F6' },
    { name: 'Success', value: successCount, color: '#10B981' },
    { name: 'Warning', value: warningCount, color: '#F97316' },
    { name: 'Error', value: errorCount, color: '#EF4444' },
    { name: 'Critical', value: criticalCount, color: '#8B5CF6' }
  ].map(item => ({
    ...item,
    percentage: totalLogsCount > 0 ? ((item.value / totalLogsCount) * 100).toFixed(1) + '%' : '0%'
  })), [infoCount, successCount, warningCount, errorCount, criticalCount, totalLogsCount]);

  // Top Log Sources Data
  const topSourcesData = useMemo(() => {
    if (serverStats?.topSources && serverStats.topSources.length > 0) {
      return serverStats.topSources.map(s => ({
        source: s.source,
        count: (s.count ?? 0).toLocaleString(),
        percentage: s.percentage,
        width: `${s.percentage}%`
      }));
    }
    const counts: Record<string, number> = {};
    displayLogs.forEach(log => {
      counts[log.source] = (counts[log.source] || 0) + 1;
    });
    
    return Object.entries(counts)
      .map(([source, count]) => ({
        source,
        count: (count ?? 0).toLocaleString(),
        percentage: totalLogsCount > 0 ? Math.round((count / totalLogsCount) * 100) : 0,
        width: totalLogsCount > 0 ? ((count / totalLogsCount) * 100).toFixed(1) + '%' : '0%'
      }))
      .sort((a, b) => parseFloat(b.count.replace(/,/g, '')) - parseFloat(a.count.replace(/,/g, '')))
      .slice(0, 5);
  }, [serverStats, displayLogs, totalLogsCount]);

  // Filter dropdowns list the values that really exist in the log table (static lists only in the standalone preview)
  const typeOptions = buildOptions(
    serverStats?.distinctTypes,
    ['Scan', 'Delete', 'Restore', 'Optimize', 'Reference', 'System', 'File', 'Login'],
    logTypeFilter,
    isWpConnected
  );
  const sourceOptions = buildOptions(
    serverStats?.distinctSources,
    ['Media Scanner', 'ImgSentry', 'Optimizer Engine', 'Reference Replacer', 'System'],
    sourceFilter,
    isWpConnected
  );
  const userOptions = buildOptions(
    serverStats?.distinctUsers,
    ['admin', 'system_cron'],
    userFilter,
    isWpConnected
  );

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setLogLevelFilter('all');
    setLogTypeFilter('all');
    setSourceFilter('all');
    setUserFilter('all');
    setDateFilter('all');
    setCurrentPage(1);
  };

  const handleCopyLog = async (id: string, text: string) => {
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      // Fallback for non-HTTPS admin pages where the Clipboard API is unavailable
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      notify('Could not copy to the clipboard.', 'error');
    }
  };

  // Delete single log entry
  const handleDeleteLog = async (id: string) => {
    if (isDeletingId) return;
    const imgsentryData = getImgSentryData();
    const ajaxUrl = imgsentryData?.ajax_url || imgsentryData?.ajaxUrl;

    if (!ajaxUrl) {
      // Standalone preview: no backend
      setLogsList(prev => prev.filter(l => l.id !== id));
      if (selectedLogDetail?.id === id) {
        setSelectedLogDetail(null);
      }
      return;
    }

    setIsDeletingId(id);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_delete_single_log');
      fd.append('nonce', imgsentryData.nonce || '');
      fd.append('log_id', id);
      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.data?.message || 'Could not delete this log entry.');
      }
      if (selectedLogDetail?.id === id) {
        setSelectedLogDetail(null);
      }
      if (logsList.length <= 1 && currentPage > 1) {
        setCurrentPage(prev => Math.max(1, prev - 1)); // page change triggers the reload
      } else {
        await fetchLogsFromBackend();
      }
    } catch (e: any) {
      console.error('Failed to delete log from backend:', e);
      notify(e?.message || 'Could not delete this log entry.', 'error');
      fetchLogsFromBackend();
    } finally {
      setIsDeletingId(null);
    }
  };

  // Clear all logs handler
  const handleConfirmClearLogs = async () => {
    setShowClearModal(false);
    const imgsentryData = getImgSentryData();
    const ajaxUrl = imgsentryData?.ajax_url || imgsentryData?.ajaxUrl;

    if (!ajaxUrl) {
      // Standalone preview: no backend
      setLogsList([]);
      setTotalServerCount(0);
      setServerStats({ total: 0, info: 0, success: 0, warning: 0, error: 0, critical: 0 });
      if (onClearLogs) {
        onClearLogs();
      }
      return;
    }

    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_clear_logs');
      fd.append('nonce', imgsentryData.nonce || '');
      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.data?.message || 'Failed to clear logs.');
      }
      // The server has already cleared the table (and recorded one "logs cleared" audit entry),
      // so the parent's separate database-cleanup call is not needed here.
      setSelectedLogDetail(null);
      notify('Logs cleared successfully.', 'success');
      if (currentPage !== 1) {
        setCurrentPage(1); // page change triggers the reload
      } else {
        await fetchLogsFromBackend();
      }
    } catch (e: any) {
      console.error('Failed to clear logs on backend:', e);
      notify(e?.message || 'Failed to clear logs.', 'error');
      fetchLogsFromBackend();
    }
  };

  const handleExportCSV = () => {
    const imgsentryData = getImgSentryData();
    if (isWpConnected && imgsentryData && (imgsentryData.ajax_url || imgsentryData.ajaxUrl)) {
      const ajaxUrl = imgsentryData.ajax_url || imgsentryData.ajaxUrl;
      const nonce = imgsentryData.nonce || '';

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = ajaxUrl;

      const params: Record<string, string> = {
        action: 'imgsentry_export_logs',
        nonce: nonce,
        search: searchInput.trim(),
        level: logLevelFilter,
        type: logTypeFilter,
        source: sourceFilter,
        user: userFilter,
        date_range: dateFilter
      };

      for (const [key, val] of Object.entries(params)) {
        if (val) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = val;
          form.appendChild(input);
        }
      }

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
      return;
    }

    const targetLogs = displayLogs;
    if (targetLogs.length === 0) {
      notify('No logs available to export for the selected filters.', 'warning');
      return;
    }

    const headers = ['ID', 'Timestamp', 'Level', 'Type', 'Source', 'User', 'IP Address', 'Action / Message', 'Details'];
    const rows = targetLogs.map(log => [
      csvCell(log.id),
      csvCell(log.time),
      csvCell(log.level),
      csvCell(log.type),
      csvCell(log.source),
      csvCell(log.user),
      csvCell(log.ip),
      csvCell(log.boldText),
      csvCell(log.subText || '')
    ]);

    const csvContent = [
      headers.map(h => csvCell(h)).join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([CSV_BOM, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `imgsentry_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pagination calculation
  const filteredTotal = isWpConnected ? totalServerCount : displayLogs.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / itemsPerPage));
  const paginatedLogs = isWpConnected ? displayLogs : displayLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTotal);
  const pageStart = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const pageEnd = Math.min(totalPages, pageStart + 4);
  const pageNumbers = Array.from({ length: pageEnd - pageStart + 1 }, (_, i) => pageStart + i);

  // Custom styled Tooltip for Pie Chart
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const name = data.name;
      const value = data.value;
      const color = data.payload?.color || '#3b82f6';
      const percentage = data.payload?.percentage || '';

      return (
        <div className="bg-slate-900/95 text-white border border-slate-700/80 rounded-xl p-2.5 shadow-xl backdrop-blur-md text-xs min-w-[130px] z-50 pointer-events-none">
          <div className="flex items-center gap-2 mb-1 pb-1 border-b border-slate-800">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="font-bold text-slate-200">{name}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-0.5">
            <span className="text-xs font-black text-white">{(value ?? 0).toLocaleString()} logs</span>
            {percentage && (
              <span className="text-[10px] font-bold text-purple-400 bg-purple-950/80 border border-purple-800/40 px-1 py-0.5 rounded">
                {percentage}
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 text-gray-900 dark:text-slate-100">
      
      {notice && (
        <div
          id="imgsentry-logs-notice"
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-xs font-semibold ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : notice.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          <span>{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TOP METRICS ROW (6 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
        
        {/* Card 1: All Logs */}
        <div id="imgsentry-card-all-logs" className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">ALL LOGS</span>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1.5 block leading-none">{(totalLogsCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              All time logs
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 ml-2">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Info */}
        <div id="imgsentry-card-info-logs" className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">INFO</span>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1.5 block leading-none">{(infoCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {getPercentage(infoCount)} of all logs
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 ml-2">
            <Info className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Success */}
        <div id="imgsentry-card-success-logs" className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">SUCCESS</span>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 block leading-none">{(successCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {getPercentage(successCount)} of all logs
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ml-2">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Warning */}
        <div id="imgsentry-card-warning-logs" className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">WARNING</span>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1.5 block leading-none">{(warningCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {getPercentage(warningCount)} of all logs
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 ml-2">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 5: Error */}
        <div id="imgsentry-card-error-logs" className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">ERROR</span>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1.5 block leading-none">{(errorCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-rose-700 bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {getPercentage(errorCount)} of all logs
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 ml-2">
            <XCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Card 6: Critical */}
        <div id="imgsentry-card-critical-logs" className="bg-white dark:bg-[#111827] border-gray-200 dark:border-[#243044] text-gray-900 dark:text-[#e7ecf3] rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex items-center justify-between h-full min-h-[96px]">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">CRITICAL</span>
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1.5 block leading-none">{(criticalCount ?? 0).toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-purple-700 bg-purple-100 dark:bg-purple-950/40 dark:text-purple-400 px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full leading-tight">
              {getPercentage(criticalCount)} of all logs
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 ml-2">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* FILTERS & SEARCH ROW */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center text-xs border border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
            <button 
              id="imgsentry-btn-logs-view-list"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 flex items-center gap-1.5 font-bold cursor-pointer transition-colors ${
                viewMode === 'list' 
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-r border-purple-200 dark:border-purple-800' 
                  : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button 
              id="imgsentry-btn-logs-view-grid"
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 flex items-center gap-1.5 font-bold cursor-pointer transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' 
                  : 'text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Card</span>
            </button>
          </div>

          {/* Search Field */}
          <div className="relative">
            <input
              id="imgsentry-input-logs-search"
              type="text"
              placeholder="Search logs..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-3 pr-8 py-1.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-xs font-medium text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-[#5b6579] outline-none focus:ring-2 focus:ring-purple-500 w-44 sm:w-56"
            />
            <Search className="w-4 h-4 text-gray-400 dark:text-[#5b6579] absolute right-2.5 top-2" />
          </div>

          {/* Filter 1: Log Levels */}
          <select
            id="imgsentry-select-log-level"
            value={logLevelFilter}
            onChange={(e) => {
              setLogLevelFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Log Levels ▾</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>

          {/* Filter 2: Log Types */}
          <select
            id="imgsentry-select-log-type"
            value={logTypeFilter}
            onChange={(e) => {
              setLogTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Log Types ▾</option>
            {typeOptions.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

          {/* Filter 3: Sources */}
          <select 
            id="imgsentry-select-log-source"
            value={sourceFilter}
            onChange={(e) => { 
              setSourceFilter(e.target.value); 
              setCurrentPage(1); 
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Sources ▾</option>
            {sourceOptions.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
  
          {/* Filter 4: Users */}
          <select 
            id="imgsentry-select-log-user"
            value={userFilter}
            onChange={(e) => { 
              setUserFilter(e.target.value); 
              setCurrentPage(1); 
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Users ▾</option>
            {userOptions.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
  
          {/* Filter 5: Dates */}
          <select 
            id="imgsentry-select-log-date"
            value={dateFilter}
            onChange={(e) => { 
              setDateFilter(e.target.value); 
              setCurrentPage(1); 
            }}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="all">All Dates ▾</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
          </select>

          {/* Clear Filters Button */}
          <button 
            id="imgsentry-btn-logs-clear-filters"
            onClick={handleClearFilters}
            className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-[#1e293b] text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear Filters</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button 
            id="imgsentry-btn-logs-refresh"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh logs from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {/* Export Report Button */}
          <button 
            id="imgsentry-btn-logs-export"
            onClick={handleExportCSV}
            className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Export CSV</span>
          </button>

          {/* Clear Logs Button */}
          <button 
            id="imgsentry-btn-logs-clear-all"
            onClick={() => setShowClearModal(true)}
            className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        </div>

      </div>

      {/* MAIN GRID LAYOUT (8 Cols Table, 4 Cols Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* LEFT 8 COLUMNS: MAIN LOGS TABLE OR CARD VIEW */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/90 dark:border-slate-700 shadow-2xs overflow-hidden flex flex-col justify-between">
          
          {viewMode === 'list' ? (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 font-bold bg-gray-50/60 dark:bg-slate-900/40">
                    <th className="py-3 px-3.5 whitespace-nowrap">Time</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Level</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Type</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Source</th>
                    <th className="py-3 px-3.5">Action / Details</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">User</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">IP Address</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-gray-100 dark:divide-slate-700/60 transition-opacity duration-200 ${isLoading && hasFetchedOnce ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
                  {isWpConnected && !hasFetchedOnce && isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-gray-500 dark:text-slate-400">
                        <RefreshCw className="w-7 h-7 mx-auto mb-3 animate-spin text-purple-600 dark:text-purple-400" />
                        <p className="font-bold text-sm text-gray-800 dark:text-slate-200">Loading log records...</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Fetching latest activity logs from WordPress backend</p>
                      </td>
                    </tr>
                  ) : paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400 dark:text-slate-500">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-semibold text-sm">No log entries found.</p>
                        <p className="text-xs mt-1">Try clearing active filters or running a scan.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log, index) => (
                      <tr 
                        key={`${log.id}-${index}`} 
                        id={`imgsentry-log-row-${log.id}`}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                      >
                        
                        {/* Time */}
                        <td className="py-3 px-3.5 whitespace-nowrap text-gray-600 dark:text-slate-300 font-medium">
                          {displayTime(log.time)}
                        </td>

                        {/* Level */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border ${getLevelBadgeClass(log.level)}`}>
                            {log.level}
                          </span>
                        </td>

                        {/* Type */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-slate-200">
                            {getTypeIcon(log.type)}
                            <span>{log.type}</span>
                          </div>
                        </td>

                        {/* Source */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-semibold text-gray-800 dark:text-slate-200">
                            {getSourceIcon(log.source)}
                            <span>{log.source}</span>
                          </div>
                        </td>

                        {/* Message */}
                        <td className="py-3 px-3.5 max-w-xs">
                          <div className="font-bold text-gray-900 dark:text-white truncate" title={log.boldText}>
                            {log.boldText}
                          </div>
                          {log.subText && (
                            <div className="text-[11px] text-gray-500 dark:text-slate-400 font-normal truncate mt-0.5" title={log.subText}>
                              {log.subText}
                            </div>
                          )}
                        </td>

                        {/* User */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-mono text-gray-700 dark:text-slate-300">
                          {log.user}
                        </td>

                        {/* IP Address */}
                        <td className="py-3 px-3.5 whitespace-nowrap font-mono text-gray-500 dark:text-slate-400">
                          {log.ip}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 text-gray-400">
                            <button 
                              id={`imgsentry-btn-view-log-${log.id}`}
                              onClick={() => setSelectedLogDetail(log)}
                              className="p-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer" 
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              id={`imgsentry-btn-copy-log-${log.id}`}
                              onClick={() => handleCopyLog(log.id, `${log.time} [${log.level}] ${log.boldText} - ${log.subText || ''}`)}
                              className="p-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer" 
                              title="Copy log entry"
                            >
                              {copiedId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button 
                              id={`imgsentry-btn-delete-log-${log.id}`}
                              onClick={() => handleDeleteLog(log.id)}
                              disabled={isDeletingId === log.id}
                              className="p-1 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer disabled:opacity-50" 
                              title="Delete log record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={`p-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5 min-h-[300px] transition-opacity duration-200 ${isLoading && hasFetchedOnce ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
              {isWpConnected && !hasFetchedOnce && isLoading ? (
                <div className="col-span-2 py-16 text-center text-gray-500 dark:text-slate-400">
                  <RefreshCw className="w-7 h-7 mx-auto mb-3 animate-spin text-purple-600 dark:text-purple-400" />
                  <p className="font-bold text-sm text-gray-800 dark:text-slate-200">Loading log records...</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Fetching latest activity logs from WordPress backend</p>
                </div>
              ) : paginatedLogs.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-gray-400 dark:text-slate-500">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-sm">No log entries found.</p>
                </div>
              ) : (
                paginatedLogs.map((log, index) => (
                  <div 
                    key={`${log.id}-${index}`}
                    id={`imgsentry-log-card-${log.id}`}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200/90 dark:border-slate-700/80 p-3.5 flex flex-col justify-between space-y-3 shadow-2xs hover:shadow-md transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border ${getLevelBadgeClass(log.level)}`}>
                          {log.level}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 dark:text-slate-300">
                          {getTypeIcon(log.type)}
                          <span>{log.type}</span>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-xs text-gray-900 dark:text-white line-clamp-1" title={log.boldText}>
                          {log.boldText}
                        </h4>
                        {log.subText && (
                          <p className="text-[11px] text-gray-500 dark:text-slate-400 font-normal line-clamp-2 mt-0.5" title={log.subText}>
                            {log.subText}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-gray-100 dark:border-[#243044] flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-400">
                      <div className="space-y-0.5">
                        <div className="font-medium text-gray-600 dark:text-slate-300">
                          {displayTime(log.time)}
                        </div>
                        <div className="font-mono text-[10px] text-gray-400">
                          {log.source} • {log.user} ({log.ip})
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-gray-400 shrink-0">
                        <button 
                          onClick={() => setSelectedLogDetail(log)}
                          className="p-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer" 
                          title="View details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleCopyLog(log.id, `${log.time} [${log.level}] ${log.boldText} - ${log.subText || ''}`)}
                          className="p-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer" 
                          title="Copy log entry"
                        >
                          {copiedId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-1 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer" 
                          title="Delete log"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TABLE PAGINATION FOOTER */}
          <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-gray-500 dark:text-slate-400">
            <div>
              Showing {filteredTotal > 0 ? startIndex + 1 : 0} to {endIndex} of {filteredTotal.toLocaleString()} logs
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select 
                id="imgsentry-select-logs-per-page"
                value={itemsPerPage}
                onChange={(e) => { 
                  setItemsPerPage(Number(e.target.value)); 
                  setCurrentPage(1); 
                }}
                className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value={10}>10 per page ▾</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>

              <div className="flex items-center gap-1 font-medium">
                <button 
                  id="imgsentry-btn-logs-first-page"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button 
                  id="imgsentry-btn-logs-prev-page"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {pageStart > 1 && (
                  <>
                    <button 
                      id="imgsentry-btn-logs-page-1"
                      onClick={() => setCurrentPage(1)}
                      className="w-7 h-7 rounded-lg font-bold flex items-center justify-center cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
                    >
                      1
                    </button>
                    {pageStart > 2 && <span className="px-1 font-bold">...</span>}
                  </>
                )}

                {pageNumbers.map((pageNum) => (
                  <button 
                    key={pageNum}
                    id={`imgsentry-btn-logs-page-${pageNum}`}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg font-extrabold flex items-center justify-center cursor-pointer transition-colors ${currentPage === pageNum ? 'bg-[#A61E69] text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                  >
                    {pageNum}
                  </button>
                ))}

                {pageEnd < totalPages && (
                  <>
                    {pageEnd < totalPages - 1 && <span className="px-1 font-bold">...</span>}
                    <button 
                      id={`imgsentry-btn-logs-page-${totalPages}`}
                      onClick={() => setCurrentPage(totalPages)}
                      className="w-7 h-7 rounded-lg font-bold flex items-center justify-center cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
                    >
                      {totalPages}
                    </button>
                  </>
                )}

                <button 
                  id="imgsentry-btn-logs-next-page"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button 
                  id="imgsentry-btn-logs-last-page"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT 4 COLUMNS: SIDEBAR CHARTS & STATS */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* Card 1: Logs Over Time */}
          <div id="imgsentry-card-logs-timeline" className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200/90 dark:border-slate-700 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-xs text-gray-900 dark:text-white!">Logs Over Time</h3>
              <select 
                value={timelineGrouping}
                onChange={(e) => setTimelineGrouping(e.target.value as any)}
                className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="daily">Daily ▾</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Line Chart */}
            <div className="h-44 min-h-[176px] min-w-[200px] w-full pt-1">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <LineChart data={logsOverTimeData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                    allowEscapeViewBox={{ x: true, y: true }} 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px', backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} 
                  />
                  <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3, fill: '#8B5CF6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card 2: Logs by Level (Donut) */}
          <div id="imgsentry-card-logs-by-level" className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200/90 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-xs text-gray-900 dark:text-white!">Logs by Level</h3>

            <div className="flex items-center justify-between gap-2 pt-1">
              {/* Donut graphic */}
              <div className="relative w-32 h-32 min-h-[128px] min-w-[128px] shrink-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                  <PieChart>
                    <Pie
                      data={logsByLevelData}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={52}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {logsByLevelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                      allowEscapeViewBox={{ x: true, y: true }} 
                      content={<CustomPieTooltip />} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 text-[11px] pr-2 flex-1">
                {logsByLevelData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800 dark:text-[#e7ecf3]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span>{item.name}</span>
                    </div>
                    <span className="text-gray-500 dark:text-[#8993a8] font-semibold">{(item.value ?? 0).toLocaleString()} ({item.percentage})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 3: Top Log Sources */}
          <div id="imgsentry-card-top-sources" className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200/90 dark:border-slate-700 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-xs text-gray-900 dark:text-white!">Top Log Sources</h3>

            <div className="space-y-3.5 text-xs">
              {topSourcesData.length === 0 ? (
                <p className="text-gray-400 text-xs py-2">No source data recorded.</p>
              ) : (
                topSourcesData.map((item) => (
                  <div key={item.source} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 dark:text-white">{item.source}</span>
                      <span className="text-gray-500 dark:text-slate-400 font-semibold">{item.count} ({item.percentage}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-600 rounded-full" 
                        style={{ width: item.width }} 
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 4: Log Insights */}
          <div id="imgsentry-card-log-insights" className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200/90 dark:border-slate-700 shadow-2xs space-y-3">
            <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Log Insights</h3>

            <div className="space-y-3 text-xs text-gray-700 dark:text-slate-300">
              <div className="flex items-center gap-2.5">
                <AlertCircle className={`w-4 h-4 shrink-0 ${criticalCount > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
                <span className="font-semibold text-gray-900 dark:text-white">
                  {criticalCount > 0 ? `${criticalCount} critical logs require immediate attention` : 'No critical issues found'}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <XCircle className={`w-4 h-4 shrink-0 ${errorCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
                <span className="font-semibold text-gray-900 dark:text-white">
                  {errorCount > 0 ? `${errorCount} error logs recorded in database` : 'Zero operational errors'}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="font-semibold text-gray-900 dark:text-white">
                  {successCount} automated & manual tasks completed
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="font-semibold text-gray-900 dark:text-white">Log retention: active ({serverStats?.retentionDays ?? 30} days)</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* DETAIL MODAL */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            id="imgsentry-modal-log-detail"
            className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-[#243044] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-xs"
          >
            <div className="p-4 border-b border-gray-100 dark:border-[#243044] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border ${getLevelBadgeClass(selectedLogDetail.level)}`}>
                  {selectedLogDetail.level}
                </span>
                <span className="font-bold text-gray-900 dark:text-white">Log Entry #{selectedLogDetail.id}</span>
              </div>
              <button 
                id="imgsentry-btn-close-log-modal"
                onClick={() => setSelectedLogDetail(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Action / Event</label>
                <div className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-xl font-bold text-gray-900 dark:text-white text-sm">
                  {selectedLogDetail.boldText}
                </div>
              </div>

              {selectedLogDetail.subText && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Details & Message</label>
                  <div className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-xl text-gray-700 dark:text-slate-300 font-mono text-xs whitespace-pre-wrap">
                    {selectedLogDetail.subText}
                  </div>
                </div>
              )}

              {selectedLogDetail.details && selectedLogDetail.details !== selectedLogDetail.subText && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">Full Details</label>
                  <pre className="p-3 bg-gray-50 dark:bg-slate-800/80 rounded-xl text-gray-700 dark:text-slate-300 font-mono text-[11px] whitespace-pre-wrap break-all max-h-56 overflow-auto">
                    {prettyDetails(selectedLogDetail.details)}
                  </pre>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-400 block font-semibold">Timestamp</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">
                    {displayTime(selectedLogDetail.time)}
                  </span>
                </div>
                <div className="p-2.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-400 block font-semibold">Source Subsystem</span>
                  <span className="font-bold text-gray-800 dark:text-slate-200">{selectedLogDetail.source}</span>
                </div>
                <div className="p-2.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-400 block font-semibold">Initiated By (User)</span>
                  <span className="font-bold font-mono text-gray-800 dark:text-slate-200">{selectedLogDetail.user}</span>
                </div>
                <div className="p-2.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-400 block font-semibold">Client IP</span>
                  <span className="font-bold font-mono text-gray-800 dark:text-slate-200">{selectedLogDetail.ip}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-[#243044] bg-gray-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              <button 
                id="imgsentry-btn-delete-from-modal"
                onClick={() => handleDeleteLog(selectedLogDetail.id)}
                className="text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Log</span>
              </button>
              <div className="flex items-center gap-2">
                <button 
                  id="imgsentry-btn-copy-from-modal"
                  onClick={() => handleCopyLog(selectedLogDetail.id, JSON.stringify(selectedLogDetail, null, 2))}
                  className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1.5 rounded-lg font-bold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1e293b] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedId === selectedLogDetail.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy JSON</span>
                </button>
                <button 
                  id="imgsentry-btn-dismiss-modal"
                  onClick={() => setSelectedLogDetail(null)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR LOGS CONFIRMATION MODAL */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            id="imgsentry-modal-confirm-clear"
            className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-[#243044] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden p-5 space-y-4 text-xs"
          >
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Clear All Audit Logs?</h3>
              <p className="text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                This will permanently delete all activity log records from the database table. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-[#243044]">
              <button 
                id="imgsentry-btn-cancel-clear"
                onClick={() => setShowClearModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 font-bold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#1e293b] cursor-pointer"
              >
                Cancel
              </button>
              <button 
                id="imgsentry-btn-confirm-clear-logs"
                onClick={handleConfirmClearLogs}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Clear All</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LogsTab;
