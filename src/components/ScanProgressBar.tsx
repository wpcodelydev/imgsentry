import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { useScanStatus } from '../utils/scanStatus';

export interface ScanProgressBarProps {
  onReviewUnused?: () => void;
}

export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({ onReviewUnused }) => {
  const {
    isRunning,
    processed,
    total,
    percent,
    dirtyCount,
    isStuck,
    restart,
    justCompleted,
    state,
    stats,
    scanType,
    dismissCompleted,
  } = useScanStatus();

  const isSmart = scanType === 'smart';
  const scanLabel = isSmart ? 'Smart scan' : 'Deep scan';

  const isFirstScanNotShown = useMemo(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem('imgsentry_first_scan_summary_shown') === null;
      }
    } catch {
      return false;
    }
    return false;
  }, []);

  const [dismissedFirstScan, setDismissedFirstScan] = useState<boolean>(false);

  const showComplete = !isRunning && (
    justCompleted || (state === 'completed' && isFirstScanNotShown && !dismissedFirstScan)
  );

  useEffect(() => {
    if (showComplete && state === 'completed' && isFirstScanNotShown) {
      try {
        localStorage.setItem('imgsentry_first_scan_summary_shown', '1');
      } catch {
        // ignore
      }
    }
  }, [showComplete, state, isFirstScanNotShown]);

  const handleDismiss = () => {
    setDismissedFirstScan(true);
    try {
      localStorage.setItem('imgsentry_first_scan_summary_shown', '1');
    } catch {
      // ignore
    }
    dismissCompleted();
  };

  // c) STUCK (isStuck)
  if (isRunning && isStuck) {
    return (
      <div className="sticky top-[calc(var(--imgsentry-adminbar-h)+128px)] z-30 mb-6 rounded-[14px] border border-[#FDE68A] bg-[#FFFBEB] px-5 py-[18px] shadow-sm dark:bg-amber-950/30 dark:border-amber-800/60">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 min-w-[40px] rounded-[10px] bg-[#FEF3C7] text-[#B45309] dark:bg-amber-900/40 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-[#78350F] dark:text-amber-200! truncate">
                Scan is slow right now
              </h3>
              <p className="text-[12px] text-[#92400E] dark:text-amber-300/80 mt-0.5 truncate">
                No progress for 3 minutes. You can restart the scan. Files already checked are kept.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-[13px] font-semibold text-gray-700 dark:text-gray-300">
              {processed.toLocaleString()} / {total.toLocaleString()} files
            </span>
            <span className="text-[12px] font-bold bg-[#FBEAF3] text-[#A61E69] dark:bg-[rgba(224,86,160,0.2)] dark:text-[#F07AB8] px-2.5 py-0.5 rounded-full">
              {percent}%
            </span>
            <button
              onClick={() => restart()}
              className="h-9 px-4 rounded-lg bg-[#A61E69] text-white text-[13px] font-semibold hover:bg-[#8F1B5A] transition-colors cursor-pointer"
              aria-label="Restart scan"
            >
              Restart scan
            </button>
          </div>
        </div>
        <div
          className="mt-3.5 w-full h-2 rounded-full bg-[#FDE68A] dark:bg-amber-900/40 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full bg-[#B45309] transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  // a) RUNNING
  if (isRunning) {
    return (
      <div className="sticky top-[calc(var(--imgsentry-adminbar-h)+128px)] z-30 mb-6 rounded-[14px] border border-gray-200 bg-white px-5 py-[18px] shadow-sm dark:bg-[#111827] dark:border-[#243044]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 min-w-[40px] rounded-[10px] bg-[#FBEAF3] text-[#A61E69] dark:bg-[rgba(224,86,160,0.16)] dark:text-[#F07AB8] flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-gray-900 dark:text-white! truncate">
                {isSmart ? 'Smart scan in progress' : 'Deep scan in progress'}
              </h3>
              <p className="text-[12px] text-gray-500 dark:text-[#8993a8] mt-0.5 truncate">
                {isSmart
                  ? 'Checking new, unused and older files. You can leave this page. Results appear automatically.'
                  : 'Checking every file in your library. You can leave this page. Results appear automatically.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-[13px] font-semibold text-gray-700 dark:text-gray-300">
              {processed.toLocaleString()} / {total.toLocaleString()} files
            </span>
            <span className="text-[12px] font-bold bg-[#FBEAF3] text-[#A61E69] dark:bg-[rgba(224,86,160,0.2)] dark:text-[#F07AB8] px-2.5 py-0.5 rounded-full">
              {percent}%
            </span>
          </div>
        </div>
        <div
          className="mt-3.5 w-full h-2 rounded-full bg-[#EEF0F4] dark:bg-[#243044] overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full bg-[#A61E69] dark:bg-[#E056A0] transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  // COMPLETE state (checked AFTER running/stuck and BEFORE checking new files; never shown while isRunning)
  if (showComplete) {
    const displayTotal = total || Number(stats?.total_attachments || 0);
    const unusedCount = stats?.unused_count !== undefined ? Number(stats.unused_count) : 0;

    return (
      <div className="sticky top-[calc(var(--imgsentry-adminbar-h)+128px)] z-30 mb-6 rounded-[14px] border border-gray-200 bg-white px-5 py-[18px] shadow-sm dark:bg-[#111827] dark:border-[#243044]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 min-w-[40px] rounded-[10px] bg-[#ECFDF5] text-[#047857] dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-gray-900 dark:text-white! truncate">
                {scanType ? `${scanLabel} complete` : 'Scan complete'}
              </h3>
              <p className="text-[12px] text-gray-500 dark:text-[#8993a8] mt-0.5 truncate">
                {displayTotal.toLocaleString()} files checked.{' '}
                {unusedCount > 0 ? (
                  <>
                    <span className="font-semibold text-[#B45309]">
                      {unusedCount.toLocaleString()} unused files
                    </span>{' '}
                    are ready to review.
                  </>
                ) : (
                  'No unused files found.'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={onReviewUnused}
              className="h-9 px-4 rounded-lg bg-[#A61E69] text-white text-[13px] font-semibold hover:bg-[#8F1B5A] transition-colors cursor-pointer"
            >
              Review unused files
            </button>
            <button
              onClick={handleDismiss}
              className="w-9 h-9 flex items-center justify-center border border-gray-200 dark:border-[#243044] rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // b) CHECKING NEW FILES (not running, dirtyCount > 0)
  if (dirtyCount > 0) {
    return (
      <div className="sticky top-[calc(var(--imgsentry-adminbar-h)+128px)] z-30 mb-6 rounded-[14px] border border-gray-200 bg-white px-5 py-[18px] shadow-sm dark:bg-[#111827] dark:border-[#243044]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 min-w-[40px] rounded-[10px] bg-[#FBEAF3] text-[#A61E69] dark:bg-[rgba(224,86,160,0.16)] dark:text-[#F07AB8] flex items-center justify-center shrink-0">
              <RefreshCw className="w-5 h-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold text-gray-900 dark:text-white! truncate">
                Checking {dirtyCount.toLocaleString()} new files
              </h3>
              <p className="text-[12px] text-gray-500 dark:text-[#8993a8] mt-0.5 truncate">
                New uploads are checked automatically.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-[13px] font-semibold text-gray-700 dark:text-gray-300">
              {dirtyCount.toLocaleString()} files
            </span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
