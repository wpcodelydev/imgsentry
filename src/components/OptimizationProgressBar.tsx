import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, Check, CheckCircle2, Loader2, X } from 'lucide-react';
import { formatBytes, formatDuration } from '../utils/optimizationFormat';

export interface BarFailedItem {
  id?: number;
  name: string;
  message: string;
}

export interface OptimizationBarData {
  /** running = work left, complete = everything processed, stopped = cancelled / quota stop */
  phase: 'running' | 'complete' | 'stopped';
  total: number;
  /** done + failed + cancelled */
  processed: number;
  percent: number;
  optimized: number;
  skipped: number;
  failed: number;
  /** null when the server does not report it */
  savedBytes: number | null;
  originalBytes: number | null;
  currentFiles: string[];
  processingCount: number;
  failedItems: BarFailedItem[];
  stopMessage: string | null;
  durationSeconds: number | null;
}

/** Queue counts as sent by imgsentry_get_queue_status (all new fields are optional: older servers only send the counts). */
export interface QueueStatusLike {
  total: number;
  pending: number;
  processing: number;
  done: number;
  failed: number;
  cancelled: number;
  percent: number;
  is_running: boolean;
  recent_errors?: Array<{ attachment_id: number; error_message: string }>;
  optimized?: number;
  skipped?: number;
  bytes_original?: number;
  bytes_saved?: number;
  started_at?: number | null;
  finished_at?: number | null;
  current_files?: Array<{ attachment_id: number; filename: string }>;
  failed_items?: Array<{
    attachment_id: number;
    title?: string;
    filename?: string;
    error_code?: string | null;
    message?: string;
  }>;
  stop_message?: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Turns the queue status from the server into what the bar needs. */
export function buildBarData(q: QueueStatusLike, resolveName?: (id: number) => string | undefined): OptimizationBarData {
  const total = Math.max(0, Number(q.total) || 0);
  const processed = (Number(q.done) || 0) + (Number(q.failed) || 0) + (Number(q.cancelled) || 0);
  const running = (Number(q.pending) || 0) > 0 || (Number(q.processing) || 0) > 0 || Boolean(q.is_running);
  const phase: OptimizationBarData['phase'] = running ? 'running' : (Number(q.cancelled) || 0) > 0 ? 'stopped' : 'complete';

  const rawPercent = typeof q.percent === 'number' ? q.percent : total > 0 ? (processed / total) * 100 : 0;
  const percent = Math.max(0, Math.min(100, Math.floor(rawPercent)));

  const skipped = num(q.skipped) ?? 0;
  const optimized = num(q.optimized) ?? Math.max(0, (Number(q.done) || 0) - skipped);

  let failedItems: BarFailedItem[] = [];
  if (Array.isArray(q.failed_items) && q.failed_items.length > 0) {
    failedItems = q.failed_items.map((f) => ({
      id: f.attachment_id,
      name: f.filename || f.title || resolveName?.(f.attachment_id) || `Image #${f.attachment_id}`,
      message: f.message || f.error_code || 'Optimization failed.',
    }));
  } else if (Array.isArray(q.recent_errors)) {
    failedItems = q.recent_errors.map((e) => ({
      id: e.attachment_id,
      name: resolveName?.(e.attachment_id) || `Image #${e.attachment_id}`,
      message: e.error_message || 'Optimization failed.',
    }));
  }

  const started = num(q.started_at);
  const finished = num(q.finished_at);

  return {
    phase,
    total,
    processed,
    percent,
    optimized,
    skipped,
    failed: Number(q.failed) || 0,
    savedBytes: num(q.bytes_saved),
    originalBytes: num(q.bytes_original),
    currentFiles: Array.isArray(q.current_files) ? q.current_files.map((f) => f.filename).filter(Boolean) : [],
    processingCount: Number(q.processing) || 0,
    failedItems,
    stopMessage: typeof q.stop_message === 'string' && q.stop_message ? q.stop_message : null,
    durationSeconds: started !== null && finished !== null && finished >= started ? finished - started : null,
  };
}

interface Props {
  data: OptimizationBarData;
  cancelling?: boolean;
  onCancel: () => void;
  onDismiss: () => void;
  onViewResults?: () => void;
}

const chipBase = 'inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap';

/**
 * Horizontal progress bar for bulk optimization (sticks to the top of the screen, like the scan bar).
 * Shows live %, finished files, saved size and a clickable list of failed images.
 */
export const OptimizationProgressBar: React.FC<Props> = ({ data, cancelling = false, onCancel, onDismiss, onViewResults }) => {
  const [showFailed, setShowFailed] = useState(false);
  const failedWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFailed) return;
    const onDown = (e: MouseEvent) => {
      if (failedWrapRef.current && !failedWrapRef.current.contains(e.target as Node)) setShowFailed(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFailed(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showFailed]);

  useEffect(() => {
    if (data.failed === 0) setShowFailed(false);
  }, [data.failed]);

  const running = data.phase === 'running';
  const complete = data.phase === 'complete';
  const stopped = data.phase === 'stopped';

  let title = 'Optimizing images';
  let subtitle = 'Working in the background. You can leave this page, optimization continues.';
  if (running) {
    if (data.currentFiles.length > 0) {
      const extra = Math.max(0, data.processingCount - 1);
      subtitle = `${data.currentFiles[0]}${extra > 0 ? `  and ${extra} more in progress` : ''}`;
    }
  } else if (complete) {
    title = 'Optimization complete';
    subtitle = `${data.total.toLocaleString()} ${data.total === 1 ? 'file' : 'files'} processed${
      data.durationSeconds !== null ? ` in ${formatDuration(data.durationSeconds)}` : ''
    }.`;
  } else {
    title = 'Optimization stopped';
    subtitle = data.stopMessage || 'The run was cancelled. Images that were already finished keep their savings.';
  }

  const cardBorder = complete
    ? 'border-emerald-200 dark:border-emerald-800/60'
    : stopped
    ? 'border-amber-200 dark:border-amber-800/60'
    : 'border-gray-200 dark:border-[#243044]';
  const iconBox = complete
    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400'
    : stopped
    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
    : 'bg-[#FBEAF3] text-[#A61E69] dark:bg-[rgba(224,86,160,0.2)] dark:text-[#F07AB8]';
  const fillStyle: React.CSSProperties = {
    width: `${data.percent}%`,
    background: complete ? '#10B981' : stopped ? '#F59E0B' : 'linear-gradient(90deg,#A61E69,#D04C9C)',
  };

  const savedPct =
    data.savedBytes && data.originalBytes && data.originalBytes > 0
      ? Math.max(0, Math.round((data.savedBytes / data.originalBytes) * 100))
      : null;
  const showSaved = data.savedBytes !== null && (data.savedBytes > 0 || !running);

  return (
    <div
      className={`rounded-[14px] border bg-white dark:bg-slate-900 px-5 py-[18px] shadow-sm ${cardBorder}`}
      role={stopped ? 'alert' : undefined}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`w-10 h-10 min-w-[40px] rounded-[10px] flex items-center justify-center shrink-0 ${iconBox}`}>
            {running ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : complete ? (
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-gray-900 dark:text-slate-100 truncate">{title}</h3>
            <p className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5 truncate" title={subtitle}>
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!complete && (
            <span className="font-mono text-[13px] font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
              {data.processed.toLocaleString()} / {data.total.toLocaleString()} files
            </span>
          )}
          {!complete && (
            <span className="text-[12px] font-bold bg-[#FBEAF3] text-[#A61E69] dark:bg-[rgba(224,86,160,0.2)] dark:text-[#F07AB8] px-2.5 py-0.5 rounded-full tabular-nums">
              {data.percent}%
            </span>
          )}
          {running ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="h-9 px-4 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[13px] font-semibold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          ) : (
            <>
              {onViewResults && (
                <button
                  type="button"
                  onClick={onViewResults}
                  className="h-9 px-4 rounded-lg bg-[#A61E69] text-white text-[13px] font-semibold hover:bg-[#8F1B5A] transition-colors cursor-pointer"
                >
                  View results
                </button>
              )}
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                title="Dismiss"
                className="h-9 w-9 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className="mt-4 h-2.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"
        role="progressbar"
        aria-label="Optimization progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={data.percent}
      >
        <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={fillStyle} />
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {showSaved && (
          <span className={`${chipBase} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300`}>
            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              <strong className="font-bold">Saved {formatBytes(data.savedBytes || 0)}</strong>
              {savedPct !== null && data.savedBytes ? <span className="font-normal"> ({savedPct}% smaller)</span> : null}
            </span>
          </span>
        )}
        <span className={`${chipBase} bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200 tabular-nums`}>
          <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
          {data.optimized.toLocaleString()} optimized
        </span>
        {data.skipped > 0 && (
          <span className={`${chipBase} bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200 tabular-nums`} title="Already optimized, so they were left as they are">
            <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-gray-400" aria-hidden="true" />
            {data.skipped.toLocaleString()} skipped
          </span>
        )}
        {data.failed > 0 && (
          <div className="relative" ref={failedWrapRef}>
            <button
              type="button"
              onClick={() => setShowFailed((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={showFailed}
              className={`${chipBase} bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40 transition-colors cursor-pointer tabular-nums`}
            >
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              {data.failed.toLocaleString()} failed
              <span className="text-[11px] font-medium underline underline-offset-2">Details</span>
            </button>
            {showFailed && (
              <div
                role="dialog"
                aria-label="Images that failed to optimize"
                className="absolute left-0 top-full mt-2 z-40 w-[min(520px,88vw)] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-800">
                  <span className="text-[12px] font-bold text-gray-900 dark:text-slate-100">
                    {data.failed.toLocaleString()} {data.failed === 1 ? 'image' : 'images'} could not be optimized
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFailed(false)}
                    aria-label="Close"
                    className="w-6 h-6 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {data.failedItems.length > 0 ? (
                  <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
                    {data.failedItems.map((f, i) => (
                      <li key={`${f.id ?? 'x'}-${i}`} className="px-4 py-2.5">
                        <div className="text-[12.5px] font-semibold text-gray-900 dark:text-slate-100 break-all">{f.name}</div>
                        <div className="text-[12px] text-red-600 dark:text-red-400 mt-0.5 break-words">{f.message}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-[12px] text-gray-500 dark:text-slate-400">
                    The server did not send details for these images. The Logs tab has the full error messages.
                  </p>
                )}
                {data.failedItems.length > 0 && data.failedItems.length < data.failed && (
                  <p className="px-4 py-2 text-[11px] text-gray-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-800">
                    Showing the first {data.failedItems.length} of {data.failed.toLocaleString()}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OptimizationProgressBar;
