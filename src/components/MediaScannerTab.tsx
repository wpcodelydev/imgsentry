import React from 'react';
import { MediaItem, ScanHistoryEntry, PluginSettings } from '../types';
import { useScanStatus } from '../utils/scanStatus';
import {
  formatDateOnlyWithTimeZone,
  formatTimeOnlyWithTimeZone
} from '../utils/timeZoneUtils';
import {
  FileText,
  CheckCircle,
  Trash2,
  Calendar,
  Play,
  Settings,
  Clock,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Layers,
  Zap,
  Loader2
} from 'lucide-react';

type ScanKind = 'smart' | 'full';

interface MediaScannerTabProps {
  mediaList: MediaItem[];
  settings: PluginSettings;
  scanHistory?: ScanHistoryEntry[];
  isScanning?: boolean;
  onRestore: (id: number) => void;
  onStartScan: (scanType?: ScanKind) => void;
  onAddScanHistory?: (scan: ScanHistoryEntry) => void;
  onUpdateSettings?: (newSettings: Partial<PluginSettings>) => void;
  onNavigateToSettings: (subTab?: 'general' | 'scan' | 'types' | 'delete' | 'backup' | 'schedule' | 'performance' | 'notification' | 'security' | 'advanced') => void;
  onNavigateTab?: (tab: 'unused' | 'used') => void;
  onExportCSV: (selectedIds: number[]) => void;
  isDarkMode?: boolean;
}

const formatDuration = (seconds?: number): string => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m}m ${rest}s` : `${m}m`;
};

const typeBadgeClass = (label: string): string => {
  const l = (label || '').toLowerCase();
  if (l.includes('full') || l.includes('deep')) {
    return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800';
  }
  return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
};

const triggerLabel = (entry: ScanHistoryEntry): string => {
  const by = String((entry as any).triggered_by || '');
  if (by === 'scheduled') return 'Scheduled';
  if (by === 'auto') return 'Automatic';
  if (by === 'manual' || entry.isManual) return 'Manual';
  return entry.isManual === false ? 'Scheduled' : 'Manual';
};

export const MediaScannerTab: React.FC<MediaScannerTabProps> = ({
  mediaList,
  settings,
  scanHistory,
  isScanning = false,
  onStartScan,
  onNavigateToSettings,
  onNavigateTab,
  isDarkMode = false
}) => {
  const scanStatus = useScanStatus();

  const timeZone = settings?.timeZone || 'UTC';
  const savedType = String(settings?.defaultScanType || 'smart');
  const defaultKind: ScanKind = savedType === 'full' || savedType === 'deep' ? 'full' : 'smart';

  const running = isScanning || scanStatus.isRunning;
  const runningKind: ScanKind | '' = scanStatus.isRunning ? (scanStatus.scanType === 'smart' ? 'smart' : 'full') : '';

  // Numbers come from the server. The browser list is only a fallback (preview mode).
  const serverStats =
    scanStatus.stats && typeof scanStatus.stats.total_attachments !== 'undefined' ? scanStatus.stats : null;
  const activeItems = mediaList.filter((i) => !i.isTrashed);
  const totalFiles = serverStats ? Number(serverStats.total_attachments) || 0 : activeItems.length;
  const usedCount = serverStats ? Number(serverStats.used_count) || 0 : activeItems.filter((i) => i.inUse).length;
  const unusedCount = serverStats ? Number(serverStats.unused_count) || 0 : activeItems.filter((i) => !i.inUse).length;
  const checkingCount = serverStats ? Number(serverStats.unverified_count) || 0 : 0;
  const usedPct = totalFiles > 0 ? Math.round((usedCount / totalFiles) * 100) : 0;
  const unusedPct = totalFiles > 0 ? Math.round((unusedCount / totalFiles) * 100) : 0;

  const history = Array.isArray(scanHistory) ? scanHistory : [];
  const latestScan = history.length > 0 ? history[0] : null;
  const lastScanDate = latestScan ? formatDateOnlyWithTimeZone(latestScan.timestamp, timeZone) : 'Never';
  const lastScanTime = latestScan ? formatTimeOnlyWithTimeZone(latestScan.timestamp, timeZone) : '';
  const visibleHistory = history.slice(0, 10);

  const card = 'bg-white dark:bg-[#111827] border border-gray-200 dark:border-[#243044] rounded-xl shadow-2xs';
  const labelCls = 'text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none';

  const renderScanButton = (kind: ScanKind, primary: boolean) => {
    const isThisRunning = runningKind === kind;
    const text = kind === 'smart' ? 'Run Smart Scan' : 'Run Deep Scan';
    const base = 'px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer';
    const style = primary
      ? 'bg-[#A61E69] hover:bg-[#8F1B5A] text-white'
      : 'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-100 border border-gray-300 dark:border-slate-600';
    return (
      <button
        onClick={() => onStartScan(kind)}
        disabled={running}
        title={running && !isThisRunning ? 'Another scan is running. Please wait for it to finish.' : undefined}
        className={`${base} ${style}`}
      >
        {isThisRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        <span>{isThisRunning ? 'Scan running…' : text}</span>
      </button>
    );
  };

  return (
    <div className="space-y-5 text-gray-900 dark:text-slate-100">
      {/* 1. SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className={`${card} p-4 flex items-center justify-between min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className={labelCls}>Total Files</span>
            <div className="text-xl font-black text-blue-600 dark:text-[#5B8DEF] mt-1.5 leading-none">{totalFiles.toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-[#5B8DEF]/15 dark:text-[#5B8DEF] px-2 py-0.5 rounded-md inline-block mt-2">In your library</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-[#5B8DEF]/15 text-blue-600 dark:text-[#5B8DEF] flex items-center justify-center shrink-0 ml-2">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className={`${card} p-4 flex items-center justify-between min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className={labelCls}>Used Files</span>
            <div className="text-xl font-black text-emerald-600 dark:text-[#4ade80] mt-1.5 leading-none">{usedCount.toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-[#4ade80]/15 dark:text-[#4ade80] px-2 py-0.5 rounded-md inline-block mt-2">{usedPct}% of total</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-[#4ade80]/15 text-emerald-600 dark:text-[#4ade80] flex items-center justify-center shrink-0 ml-2">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className={`${card} p-4 flex items-center justify-between min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className={labelCls}>Unused Files</span>
            <div className="text-xl font-black text-rose-600 dark:text-[#f87171] mt-1.5 leading-none">{unusedCount.toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-rose-700 bg-rose-100 dark:bg-[#f87171]/15 dark:text-[#f87171] px-2 py-0.5 rounded-md inline-block mt-2">{unusedPct}% of total</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-[#f87171]/15 text-rose-500 dark:text-[#f87171] flex items-center justify-center shrink-0 ml-2">
            <Trash2 className="w-6 h-6" />
          </div>
        </div>

        <div className={`${card} p-4 flex items-center justify-between min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1">
            <span className={labelCls}>Still Being Checked</span>
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1.5 leading-none">{checkingCount.toLocaleString()}</div>
            <div className="text-[12px] font-semibold text-purple-700 bg-purple-100 dark:bg-purple-950/40 dark:text-purple-400 px-2 py-0.5 rounded-md inline-block mt-2">
              {checkingCount > 0 ? 'Not listed as unused yet' : 'All files verified'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 ml-2">
            <RefreshCw className={`w-6 h-6 ${running ? 'animate-spin motion-reduce:animate-none' : ''}`} />
          </div>
        </div>

        <div className={`${card} p-4 flex items-center justify-between min-h-[96px]`}>
          <div className="space-y-1 min-w-0 flex-1 select-none">
            <span className={labelCls}>Last Scan</span>
            <div className="text-xl font-black text-amber-600 dark:text-[#fbbf24] mt-1.5 leading-none truncate">{lastScanDate}</div>
            <div className="text-[12px] font-semibold text-amber-800 bg-amber-100 dark:bg-[#fbbf24]/15 dark:text-[#fbbf24] px-2 py-0.5 rounded-md inline-block mt-2 truncate max-w-full">
              {latestScan ? `${lastScanTime ? lastScanTime + ' · ' : ''}${String(latestScan.scanType).replace(/full scan/i, 'Deep Scan')}` : 'No scan yet'}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-[#fbbf24]/15 text-amber-600 dark:text-[#fbbf24] flex items-center justify-center shrink-0 ml-2">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 2. SCAN TYPES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${card} p-5 flex flex-col justify-between gap-4 ${defaultKind === 'smart' ? 'ring-1 ring-[#A61E69]/30' : ''}`}>
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-[10px] bg-[#FBEAF3] text-[#A61E69] dark:bg-[rgba(224,86,160,0.16)] dark:text-[#F07AB8] flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white!">Smart Scan</h3>
                <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">Recommended</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                Fast. Re-checks new files, files marked unused, and files not checked for 7 days. Best for everyday cleanups.
              </p>
            </div>
          </div>
          <div>{renderScanButton('smart', true)}</div>
        </div>

        <div className={`${card} p-5 flex flex-col justify-between gap-4 ${defaultKind === 'full' ? 'ring-1 ring-[#A61E69]/30' : ''}`}>
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-[10px] bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white!">Deep Scan</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                Thorough. Re-checks every file from scratch. Run it after changing your theme, page builder or plugins, or after importing content. Can take several minutes on large libraries.
              </p>
            </div>
          </div>
          <div>{renderScanButton('full', false)}</div>
        </div>
      </div>

      {/* 3. INFO ROW */}
      <div className={`${card} p-4 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 dark:text-slate-200">Scans only read your site. They never delete anything.</p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              New uploads and edited pages are checked automatically in the background. A file moves to Trash only from the Unused Files page, after one more live check.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Scheduled scans use <strong className="text-gray-900 dark:text-white">{defaultKind === 'full' ? 'Deep Scan' : 'Smart Scan'}</strong>
          </span>
          <button
            onClick={() => onNavigateToSettings('scan')}
            className="text-blue-600 hover:text-blue-800 border border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/60 px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors"
          >
            Change
          </button>
          <button
            onClick={() => onNavigateToSettings('schedule')}
            className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span>Schedule</span>
          </button>
          <button
            onClick={() => onNavigateToSettings('scan')}
            className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-gray-500" />
            <span>Scan Settings</span>
          </button>
        </div>
      </div>

      {/* 4. RESULTS SHORTCUTS */}
      {onNavigateTab && (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigateTab('unused')}
            className="bg-[#A61E69] hover:bg-[#8F1B5A] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <span>Review Unused Files ({unusedCount.toLocaleString()})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNavigateTab('used')}
            className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span>View Used Files ({usedCount.toLocaleString()})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. SCAN HISTORY */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#243044] flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white!">Scan History</h3>
          <span className="text-[11px] text-gray-500 dark:text-slate-400">Latest {visibleHistory.length} of {history.length}</span>
        </div>
        {visibleHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500 dark:text-slate-400">
            No scans yet. Run a Smart Scan to check your media library.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-[#243044] text-gray-700 dark:text-slate-300 font-bold bg-gray-50/70 dark:bg-slate-900/40">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Started by</th>
                  <th className="py-2.5 px-3 text-right">Files checked</th>
                  <th className="py-2.5 px-3 text-right">Unused found</th>
                  <th className="py-2.5 px-3 text-right">Auto-trashed</th>
                  <th className="py-2.5 px-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {visibleHistory.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-slate-200">{formatDateOnlyWithTimeZone(entry.timestamp, timeZone)}</div>
                      <div className="text-[11px] text-gray-500 dark:text-slate-400">{formatTimeOnlyWithTimeZone(entry.timestamp, timeZone)}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`font-bold text-[11px] px-2.5 py-1 rounded-md border ${typeBadgeClass(entry.scanType)}`}>{String(entry.scanType).replace(/full scan/i, 'Deep Scan')}</span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-gray-700 dark:text-slate-300">{triggerLabel(entry)}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-mono text-gray-700 dark:text-slate-300">{(entry.totalScanned ?? 0).toLocaleString()}</td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-mono text-gray-700 dark:text-slate-300">
                      {(entry.unusedCount ?? 0).toLocaleString()}
                      {entry.formattedUnusedSize ? <span className="text-gray-400 dark:text-slate-500"> · {entry.formattedUnusedSize}</span> : null}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-mono text-gray-700 dark:text-slate-300">
                      {entry.deletedCount > 0 ? entry.deletedCount.toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-mono text-gray-700 dark:text-slate-300">{formatDuration(entry.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
