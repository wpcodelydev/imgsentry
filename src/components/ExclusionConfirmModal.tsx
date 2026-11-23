import React from 'react';
import { AlertTriangle, Shield, Trash2, X } from 'lucide-react';

interface ExclusionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pathOrPattern: string;
  note?: string;
  isDarkMode?: boolean;
}

export const ExclusionConfirmModal: React.FC<ExclusionConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  pathOrPattern,
  note,
  isDarkMode = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
      <div className={`w-full max-w-md rounded-2xl border shadow-xl flex flex-col p-6 space-y-4 ${
        isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'
      }`}>
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Remove Recommended Exclusion?
            </h3>
            <p className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded border border-amber-200/60 dark:border-amber-900/30 break-all">
              {pathOrPattern}
            </p>
          </div>
        </div>

        <div className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-gray-200/70 dark:border-slate-700 space-y-2">
          <p>
            This folder is commonly used by <strong>WooCommerce, backup plugins, or WordPress core asset generators</strong>.
          </p>
          <p className="text-gray-700 dark:text-slate-200">
            Removing this exclusion means the scanner may flag or delete files inside it during media cleanup routines.
          </p>
          {note && (
            <div className="text-[11px] font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5 pt-1 border-t border-gray-200 dark:border-slate-700">
              <Shield className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>{note}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Keep Exclusion
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Exclusion</span>
          </button>
        </div>
      </div>
    </div>
  );
};
