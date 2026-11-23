import React, { useState } from 'react';
import { Database, Trash2, AlertTriangle, X, RefreshCw, HardDrive, ShieldAlert, Check } from 'lucide-react';

interface CleanPluginDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClean: (options: {
    cleanOrphanedScans: boolean;
    cleanScans: boolean;
    cleanLogs: boolean;
    cleanTransients: boolean;
    cleanOrphanedMeta: boolean;
    cleanThumbsCache: boolean;
  }) => void | Promise<void>;
  currentStats: {
    mediaCleanerDataMb: number;
    logDataMb: number;
    totalCleanableGb: number;
    dbOrphmetaMb?: number;
    dbOrphanedScansMb?: number;
    thumbsCacheMb?: number;
    lastCleanedDate?: string | null;
  };
  isDarkMode?: boolean;
}

export const CleanPluginDataModal: React.FC<CleanPluginDataModalProps> = ({
  isOpen,
  onClose,
  onConfirmClean,
  currentStats,
  isDarkMode = false
}) => {
  const [cleanOrphanedScans, setCleanOrphanedScans] = useState(true);
  const [cleanScans, setCleanScans] = useState(false);
  const [cleanLogs, setCleanLogs] = useState(true);
  const [cleanTransients, setCleanTransients] = useState(true);
  const [cleanOrphanedMeta, setCleanOrphanedMeta] = useState(true);
  const [cleanThumbsCache, setCleanThumbsCache] = useState(true);

  const [isExecuting, setIsExecuting] = useState(false);

  if (!isOpen) return null;

  const dbOrphmetaMb = currentStats.dbOrphmetaMb !== undefined ? currentStats.dbOrphmetaMb : 0;
  const dbOrphanedScansMb = currentStats.dbOrphanedScansMb !== undefined ? currentStats.dbOrphanedScansMb : 0;
  const thumbsCacheMb = currentStats.thumbsCacheMb !== undefined ? currentStats.thumbsCacheMb : 0;

  const totalSelectedMb = 
    (cleanOrphanedScans ? dbOrphanedScansMb : 0) +
    (cleanScans ? currentStats.mediaCleanerDataMb : 0) +
    (cleanLogs ? currentStats.logDataMb : 0) +
    (cleanTransients ? currentStats.totalCleanableGb * 1024 : 0) +
    (cleanOrphanedMeta ? dbOrphmetaMb : 0) +
    (cleanThumbsCache ? thumbsCacheMb : 0);

  const formattedSelectedSize = totalSelectedMb >= 1024
    ? `${(totalSelectedMb / 1024).toFixed(2)} GB`
    : `${totalSelectedMb.toFixed(1)} MB`;

  const handleStartCleanup = async () => {
    setIsExecuting(true);
    const startedAt = Date.now();
    try {
      // Wait for the real cleanup to finish (the parent returns the server request).
      await onConfirmClean({
        cleanOrphanedScans,
        cleanScans,
        cleanLogs,
        cleanTransients,
        cleanOrphanedMeta,
        cleanThumbsCache
      });
    } catch (err) {
      console.error('Clean Plugin Data failed:', err);
    } finally {
      // Keep the progress view on screen for a moment so it does not just flash.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 600) {
        await new Promise<void>((resolve) => setTimeout(resolve, 600 - elapsed));
      }
      setIsExecuting(false);
      onClose();
    }
  };

  // Only the tasks that were actually selected are listed while the cleanup runs.
  const stepsList = [
    cleanScans
      ? { title: 'Resetting the media scan index', detail: 'usage table + scan history' }
      : cleanOrphanedScans
      ? { title: 'Removing orphaned scan records', detail: 'usage table' }
      : null,
    cleanTransients ? { title: 'Flushing cached next-gen image URLs', detail: 'transients' } : null,
    cleanLogs ? { title: 'Clearing activity logs & scan history', detail: 'imgsentry_logs' } : null,
    cleanOrphanedMeta ? { title: 'Removing orphaned ImgSentry postmeta', detail: '_imgsentry_*' } : null,
    cleanThumbsCache ? { title: 'Clearing File Manager thumbnail cache', detail: 'cache/thumbs/' } : null
  ].filter((step): step is { title: string; detail: string } => step !== null);

  return (
    <div 
      className="fixed inset-0 z-[100000100] flex items-center justify-center bg-[#030712]/90 backdrop-blur-xs p-4 animate-fadeIn font-sans box-border"
      onClick={!isExecuting ? onClose : undefined}
    >
      <div 
        className={`w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-all ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-gray-200 text-gray-900'
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Modal Header */}
        <div className={`px-6 py-4.5 border-b flex items-center justify-between shrink-0 ${
          isDarkMode ? 'border-slate-800 bg-[#0b111e]/60' : 'border-gray-100 bg-slate-50/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-base flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Clean Plugin Data
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Database maintenance & table cleanup
              </p>
            </div>
          </div>
          {!isExecuting && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors border-0 bg-transparent"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isExecuting ? (
            <div className="py-6 space-y-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-slate-300">
                <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
                <span>Cleaning plugin data... please keep this window open.</span>
              </div>

              {/* Indeterminate progress bar (the server reports one result when everything is done) */}
              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden border border-gray-200/50 dark:border-slate-700">
                <div className="bg-[#A61E69] h-full w-full rounded-full animate-pulse" />
              </div>

              <div className="space-y-2.5 pt-2">
                {stepsList.map((step) => (
                  <div
                    key={step.title}
                    className="p-2.5 rounded-xl border text-xs flex items-center justify-between bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 font-medium"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
                      <span className="truncate">{step.title}</span>
                    </div>
                    <span className="text-[10px] font-mono shrink-0 opacity-75">{step.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Notice Banner */}
              <div className="p-4 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-100 text-xs">
                  <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Strict Safety Guarantees</span>
                </div>
                <ul className="text-emerald-800 dark:text-emerald-300 text-[11px] leading-relaxed space-y-1 list-disc pl-4">
                  <li><strong>Zero Media File Impact:</strong> Never touches, modifies, or deletes files in <code className="bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.5 rounded font-mono">/wp-content/uploads/</code>.</li>
                  <li><strong>Preserves Settings:</strong> Exclusions, scan methods, memory limits, and auto-clean rules are strictly preserved.</li>
                  <li><strong>Preserves Active Trash State:</strong> Items in the ImgSentry Trash keep their tracking data intact.</li>
                  <li><strong>Scan Guard:</strong> Scan-index cleanups are blocked while a scan is running, so scan data is never reset mid-scan.</li>
                </ul>
              </div>

              {/* Checkboxes List */}
              <div className="space-y-2.5">
                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                  cleanOrphanedScans
                    ? isDarkMode ? 'bg-slate-800/90 border-indigo-500/60' : 'bg-indigo-50/30 border-indigo-200'
                    : isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/50 border-gray-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={cleanOrphanedScans}
                    onChange={(e) => setCleanOrphanedScans(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#A61E69] focus:ring-[#A61E69] accent-[#A61E69] cursor-pointer"
                  />
                  <div className="space-y-0.5 text-xs flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 dark:text-slate-100">
                        Clean Orphaned Scan Records (Recommended)
                      </span>
                      <span className="font-mono text-gray-600 dark:text-slate-300 font-semibold">
                        {dbOrphanedScansMb.toFixed(1)} MB
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-[11px]">
                      Safely purges usage tracking index entries where the referenced media files or posts no longer exist, leaving valid indices fully intact.
                    </p>
                  </div>
                </label>

                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                  cleanScans
                    ? isDarkMode ? 'bg-slate-800/90 border-rose-500/60' : 'bg-rose-50/30 border-rose-200'
                    : isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/50 border-gray-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={cleanScans}
                    onChange={(e) => setCleanScans(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#A61E69] focus:ring-[#A61E69] accent-[#A61E69] cursor-pointer"
                  />
                  <div className="space-y-0.5 text-xs flex-1">
                    <div className="flex justify-between items-center flex-wrap gap-x-2">
                      <span className="font-semibold text-red-600 dark:text-rose-400 flex items-center gap-1">
                        Reset Media Scan Index (Nuclear Reset)
                      </span>
                      <span className="font-mono text-gray-600 dark:text-slate-300 font-semibold ml-auto">
                        {currentStats.mediaCleanerDataMb.toFixed(1)} MB
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-[11px]">
                      Clears the entire usage tracking index unconditionally. It will be automatically rebuilt on your next scan, but Used/Unused file data will be temporarily unavailable until then.
                    </p>
                  </div>
                </label>

                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                  cleanLogs
                    ? isDarkMode ? 'bg-slate-800/90 border-indigo-500/60' : 'bg-indigo-50/30 border-indigo-200'
                    : isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/50 border-gray-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={cleanLogs}
                    onChange={(e) => setCleanLogs(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#A61E69] focus:ring-[#A61E69] accent-[#A61E69] cursor-pointer"
                  />
                  <div className="space-y-0.5 text-xs flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 dark:text-slate-100">
                        Activity Logs & Scan History
                      </span>
                      <span className="font-mono text-gray-600 dark:text-slate-300 font-semibold">
                        {currentStats.logDataMb.toFixed(1)} MB
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-[11px]">
                      Purges audit log tables (<code className="text-indigo-600 dark:text-indigo-400">imgsentry_logs</code>) and historic scan summaries.
                    </p>
                  </div>
                </label>

                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                  cleanTransients
                    ? isDarkMode ? 'bg-slate-800/90 border-indigo-500/60' : 'bg-indigo-50/30 border-indigo-200'
                    : isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/50 border-gray-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={cleanTransients}
                    onChange={(e) => setCleanTransients(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#A61E69] focus:ring-[#A61E69] accent-[#A61E69] cursor-pointer"
                  />
                  <div className="space-y-0.5 text-xs flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 dark:text-slate-100">
                        Plugin Transients & DB Cache
                      </span>
                      <span className="font-mono text-gray-600 dark:text-slate-300 font-semibold">
                        {currentStats.totalCleanableGb >= 1 ? `${currentStats.totalCleanableGb.toFixed(1)} GB` : `${(currentStats.totalCleanableGb * 1024).toFixed(1)} MB`}
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-[11px]">
                      Flushes cached next-gen image URLs (<code className="text-indigo-600 dark:text-indigo-400">_transient_imgsentry_ng_url_%</code>). They are rebuilt automatically when needed. Scan locks are never touched.
                    </p>
                  </div>
                </label>

                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                  cleanOrphanedMeta
                    ? isDarkMode ? 'bg-slate-800/90 border-indigo-500/60' : 'bg-indigo-50/30 border-indigo-200'
                    : isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/50 border-gray-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={cleanOrphanedMeta}
                    onChange={(e) => setCleanOrphanedMeta(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#A61E69] focus:ring-[#A61E69] accent-[#A61E69] cursor-pointer"
                  />
                  <div className="space-y-0.5 text-xs flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 dark:text-slate-100">
                        Orphaned Plugin Postmeta (<code className="text-indigo-600 dark:text-indigo-400">_imgsentry_*</code>)
                      </span>
                      <span className="font-mono text-gray-600 dark:text-slate-300 font-semibold">
                        {dbOrphmetaMb.toFixed(1)} MB
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-[11px]">
                      Deletes leftover metadata keys (for example <code className="text-indigo-600 dark:text-indigo-400">_imgsentry_trashed</code>, <code className="text-indigo-600 dark:text-indigo-400">_imgsentry_phash</code>) only for attachments that no longer exist.
                    </p>
                  </div>
                </label>

                <label className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors ${
                  cleanThumbsCache
                    ? isDarkMode ? 'bg-slate-800/90 border-indigo-500/60' : 'bg-indigo-50/30 border-indigo-200'
                    : isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50/50 border-gray-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={cleanThumbsCache}
                    onChange={(e) => setCleanThumbsCache(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-[#A61E69] focus:ring-[#A61E69] accent-[#A61E69] cursor-pointer"
                  />
                  <div className="space-y-0.5 text-xs flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 dark:text-slate-100">
                        File Manager Thumbnail Cache
                      </span>
                      <span className="font-mono text-gray-600 dark:text-slate-300 font-semibold">
                        {thumbsCacheMb >= 1024 ? `${(thumbsCacheMb / 1024).toFixed(2)} GB` : `${thumbsCacheMb.toFixed(1)} MB`}
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-slate-400 text-[11px]">
                      Purges cached 150x150 thumbnail previews in <code className="text-indigo-600 dark:text-indigo-400">cache/thumbs/</code>. Safely regenerated on-demand when browsing folders.
                    </p>
                  </div>
                </label>
              </div>

              {/* Total Summary */}
              <div className="p-3 bg-gray-50 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs font-semibold">
                <span className="text-gray-700 dark:text-slate-300">Total Selected for Cleanup:</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold text-sm">
                  {formattedSelectedSize}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!isExecuting && (
          <div className={`px-6 py-4 border-t flex items-center justify-between gap-3 shrink-0 ${
            isDarkMode ? 'border-slate-800 bg-slate-900/90' : 'border-gray-100 bg-slate-50/50'
          }`}>
            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2.5 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-gray-200 dark:border-[#243044] bg-transparent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartCleanup}
              disabled={totalSelectedMb === 0}
              className={`px-4.5 py-2.5 text-xs font-bold text-white rounded-xl flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                totalSelectedMb === 0
                  ? 'bg-gray-400 dark:bg-slate-800 cursor-not-allowed opacity-50'
                  : 'bg-[#A61E69] hover:bg-[#8F1B5A] active:scale-98 shadow-rose-500/10'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Execute Database Cleanup</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
