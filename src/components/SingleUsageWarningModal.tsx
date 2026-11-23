import React from 'react';
import { AlertTriangle, ShieldCheck, RefreshCw, X, FileWarning } from 'lucide-react';
import { UsageCheckItem, UsageCheckLocation } from '../types';

interface SingleUsageWarningModalProps {
  isOpen: boolean;
  item: UsageCheckItem | null;
  lastScanFormatted?: string;
  onConfirmTrash: () => void;
  onCancel: () => void;
  onRescanNow?: () => void;
  isTrashing?: boolean;
  isDarkMode?: boolean;
}

export const SingleUsageWarningModal: React.FC<SingleUsageWarningModalProps> = ({
  isOpen,
  item,
  lastScanFormatted = 'Never scanned',
  onConfirmTrash,
  onCancel,
  onRescanNow,
  isTrashing = false,
  isDarkMode = false,
}) => {
  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className={`border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] ${
          isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="single-usage-modal-title"
      >
        {/* Header */}
        <div className={`px-6 pt-5 pb-4 border-b flex items-start justify-between ${
          isDarkMode ? 'border-slate-800' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="single-usage-modal-title" className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                File Is Currently in Use
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Trashing this file may cause broken images or missing assets on your site.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isTrashing}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 rounded-lg p-3">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Target Media</span>
            <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {item.title || item.filename}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {item.filename} (ID: {item.attachment_id})
            </div>
          </div>

          <div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
              <span>Used in the following locations ({item.locations?.length || item.usage_count || 1}):</span>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {item.locations && item.locations.length > 0 ? (
                item.locations.map((loc: UsageCheckLocation, idx: number) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="font-medium text-amber-950 dark:text-amber-200 truncate mr-2">
                      {loc.title || loc.name || 'Site Content'}
                    </div>
                    <span className="bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-bold shrink-0">
                      {loc.type || 'Page'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  Active reference detected in site content.
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-200 flex items-center justify-between">
            <span className="font-medium">
              Based on your last scan: <span className="font-bold">{lastScanFormatted}</span>
            </span>
            {onRescanNow && (
              <button
                type="button"
                onClick={onRescanNow}
                className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Rescan Now</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isTrashing}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={onConfirmTrash}
            disabled={isTrashing}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isTrashing ? 'Moving to Trash...' : 'Trash Anyway'}
          </button>
        </div>
      </div>
    </div>
  );
};
