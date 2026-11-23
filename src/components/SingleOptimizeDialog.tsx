import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Image as ImageIcon, Loader2, Maximize2, Minus, X } from 'lucide-react';
import { formatBytes } from '../utils/optimizationFormat';

export interface SingleOptimizeState {
  id: number;
  fileName: string;
  /** e.g. "2.41 MB  ·  JPG" */
  metaLine: string;
  thumbUrl?: string;
  /** null = the server has not reported progress yet (indeterminate spinner, never a fake number) */
  percent: number | null;
  step: number;
  stepsTotal: number;
  label: string;
  current: number;
  total: number;
  phase: 'running' | 'done' | 'failed';
  message: string;
  savedBytes: number | null;
  skipped: boolean;
  minimized: boolean;
}

interface Props {
  state: SingleOptimizeState;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
}

const STEP_NAMES = [
  'Backup of the original',
  'Compressing the main image',
  'Compressing thumbnails',
  'Creating WebP / AVIF and saving',
];

const Ring: React.FC<{ size: number; stroke: number; percent: number | null; phase: SingleOptimizeState['phase'] }> = ({
  size,
  stroke,
  percent,
  phase,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = phase === 'failed' ? '#DC2626' : phase === 'done' ? '#10B981' : '#A61E69';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-100 dark:stroke-slate-800" />
      {percent !== null || phase !== 'running' ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - (phase === 'done' ? 100 : percent ?? 0) / 100)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      ) : (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * 0.28} ${c}`}
          className="origin-center animate-spin"
        />
      )}
    </svg>
  );
};

/**
 * Popup for optimizing ONE image: real live percentage, the current step and a Minimize button.
 * While minimized the same information is shown in a small chip in the bottom corner. The work itself never stops.
 */
export const SingleOptimizeDialog: React.FC<Props> = ({ state, onMinimize, onRestore, onClose }) => {
  const [thumbBroken, setThumbBroken] = useState(false);
  const running = state.phase === 'running';
  const done = state.phase === 'done';
  const failed = state.phase === 'failed';

  useEffect(() => {
    if (state.minimized || !running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMinimize();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.minimized, running, onMinimize]);

  const percentText = state.percent !== null ? `${state.percent}%` : '';
  // The step counter is added below, so drop a "(5 of 8)" the server may already have put into the label
  const cleanLabel = (state.label || '').replace(/\s*\(\d+\s*(?:\/|of)\s*\d+\)\s*$/i, '').trim();

  if (state.minimized) {
    const line = running
      ? state.percent !== null
        ? `Optimizing… ${state.percent}%`
        : 'Optimizing…'
      : done
      ? 'Optimization complete'
      : 'Optimization failed';
    return (
      <button
        type="button"
        onClick={onRestore}
        aria-label={`${line}. Open details`}
        className="fixed bottom-24 right-6 z-50 flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-full border border-gray-200 dark:border-[#243044] bg-white dark:bg-slate-900 shadow-xl hover:shadow-2xl transition-shadow cursor-pointer animate-in fade-in"
      >
        <span className="relative w-9 h-9 flex items-center justify-center shrink-0">
          <Ring size={36} stroke={4} percent={state.percent} phase={state.phase} />
          <span className="absolute inset-0 flex items-center justify-center">
            {done ? (
              <Check className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            ) : failed ? (
              <AlertTriangle className="w-4 h-4 text-red-500" aria-hidden="true" />
            ) : null}
          </span>
        </span>
        <span className="text-left min-w-0">
          <span className="block text-[12px] font-bold text-gray-900 dark:text-slate-100 truncate max-w-[200px]">{state.fileName}</span>
          <span className="block text-[11px] text-gray-500 dark:text-slate-400">{line}</span>
        </span>
        <Maximize2 className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
      </button>
    );
  }

  const title = running ? 'Optimizing image…' : done ? (state.skipped ? 'Already optimized' : 'Optimization complete') : 'Optimization failed';
  let subtitle = '';
  if (running) {
    if (state.percent === null) subtitle = 'Starting… waiting for the first update from the server';
    else subtitle = `Step ${Math.max(1, Math.min(state.step || 1, state.stepsTotal))} of ${state.stepsTotal}${cleanLabel ? `  ·  ${cleanLabel}` : ''}${
      state.step === 3 && state.total > 0 ? ` (${state.current} of ${state.total})` : ''
    }`;
  } else if (done) {
    subtitle = state.skipped
      ? 'This image was optimized before, so nothing was changed.'
      : state.savedBytes && state.savedBytes > 0
      ? `Saved ${formatBytes(state.savedBytes)}`
      : 'Finished';
  }

  const showSteps = running && state.percent !== null && state.step > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="imgsentry-single-opt-title"
        className="bg-white dark:bg-slate-900 rounded-[22px] border border-gray-100 dark:border-[#243044] w-full max-w-[440px] mx-4 p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
            {state.thumbUrl && !thumbBroken ? (
              <img src={state.thumbUrl} alt="" className="w-full h-full object-cover" onError={() => setThumbBroken(true)} />
            ) : (
              <ImageIcon className="w-6 h-6 text-gray-400" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="text-[14.5px] font-bold text-gray-900 dark:text-slate-100 truncate" title={state.fileName}>
              {state.fileName}
            </div>
            <div className="text-[12.5px] text-gray-500 dark:text-slate-400 mt-0.5 truncate">{state.metaLine}</div>
          </div>
          <div className="relative w-[60px] h-[60px] shrink-0 flex items-center justify-center">
            <Ring size={60} stroke={6} percent={state.percent} phase={state.phase} />
            <span className="absolute inset-0 flex items-center justify-center text-[14px] font-bold text-gray-900 dark:text-slate-100 tabular-nums">
              {done ? <Check className="w-6 h-6 text-emerald-500" aria-hidden="true" /> : failed ? <AlertTriangle className="w-6 h-6 text-red-500" aria-hidden="true" /> : percentText}
            </span>
          </div>
          {running ? (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize"
              title="Minimize (optimization keeps running)"
              className="w-8 h-8 -mt-1 -mr-2 rounded-lg text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Minus className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close"
              className="w-8 h-8 -mt-1 -mr-2 rounded-lg text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <h3 id="imgsentry-single-opt-title" className="mt-5 text-[17px] font-bold text-gray-900 dark:text-slate-100">
          {title}
        </h3>
        {subtitle && <p className="mt-1 text-[12.5px] text-gray-500 dark:text-slate-400">{subtitle}</p>}
        <span className="sr-only" aria-live="polite">
          {running && state.percent !== null ? `Optimization ${state.percent} percent` : title}
        </span>

        {failed && (
          <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-[12.5px] text-red-700 dark:text-red-300 break-words">
            {state.message}
          </div>
        )}

        {running && (
          <div
            className="mt-4 h-2 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-label="Optimization progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.percent ?? undefined}
          >
            {state.percent !== null ? (
              <div className="h-full rounded-full bg-[#A61E69] transition-[width] duration-500 ease-out" style={{ width: `${state.percent}%` }} />
            ) : (
              <div className="h-full w-1/3 rounded-full bg-[#A61E69]/70 animate-pulse" />
            )}
          </div>
        )}

        {showSteps && (
          <ul className="mt-5 space-y-2.5">
            {STEP_NAMES.map((name, i) => {
              const n = i + 1;
              const status = n < state.step ? 'done' : n === state.step ? 'run' : 'todo';
              const text = n === 3 && state.total > 0 && status !== 'todo' ? `${name}  (${status === 'done' ? state.total : state.current} / ${state.total})` : name;
              return (
                <li key={name} className="flex items-center gap-3">
                  <span
                    className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ${
                      status === 'done'
                        ? 'bg-emerald-100 dark:bg-emerald-900/40'
                        : status === 'run'
                        ? 'bg-[#FBEAF3] dark:bg-[rgba(224,86,160,0.2)]'
                        : 'border-[1.5px] border-gray-300 dark:border-slate-600'
                    }`}
                  >
                    {status === 'done' ? (
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : status === 'run' ? (
                      <Loader2 className="w-3 h-3 text-[#A61E69] animate-spin" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span
                    className={`text-[13px] ${
                      status === 'run'
                        ? 'font-semibold text-gray-900 dark:text-slate-100'
                        : status === 'done'
                        ? 'font-medium text-gray-700 dark:text-slate-300'
                        : 'font-medium text-gray-400 dark:text-slate-500'
                    }`}
                  >
                    {text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {running && (
          <p className="mt-5 text-center text-[11.5px] text-gray-400 dark:text-slate-500">
            You can minimize this window and keep working. This window closes by itself when the image is done.
          </p>
        )}
        {failed && (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-5 rounded-lg bg-[#A61E69] text-white text-[13px] font-semibold hover:bg-[#8F1B5A] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SingleOptimizeDialog;
