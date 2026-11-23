import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  isSaving?: boolean;
  onSaveAndLeave: () => void;
  onDiscardAndLeave: () => void;
  onStay: () => void;
  isDarkMode?: boolean;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  isSaving = false,
  onSaveAndLeave,
  onDiscardAndLeave,
  onStay,
}) => {
  // Escape = stay on the page
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStay();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onStay]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000100] flex items-center justify-center bg-[rgba(17,24,39,0.65)] backdrop-blur-[5px] p-4 animate-fadeIn font-sans box-border"
      onClick={onStay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/5 bg-[#0f1118] text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-950/60 border border-amber-800/50 text-amber-400 rounded-xl shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 id="unsaved-changes-modal-title" className="font-bold text-base text-white" style={{ color: '#ffffff' }}>
              Unsaved changes
            </h3>
          </div>
          <button
            type="button"
            onClick={onStay}
            className="p-1.5 text-[#8f97a9] hover:text-white rounded-lg cursor-pointer transition-colors border-0 bg-transparent"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 text-xs">
          <div className="p-4 rounded-xl border bg-amber-950/30 border-amber-900/40 text-amber-300 leading-relaxed">
            You changed the compression level or output format on this page but have not saved it. Save the changes before leaving?
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 bg-[#111421]/90 flex flex-wrap items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onStay}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-[#d4d7df] border border-white/15 bg-transparent hover:bg-[#202433] rounded-lg cursor-pointer transition-colors disabled:opacity-50"
          >
            Stay on page
          </button>
          <button
            type="button"
            onClick={onDiscardAndLeave}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-[#d4d7df] border border-white/15 bg-transparent hover:bg-[#202433] rounded-lg cursor-pointer transition-colors disabled:opacity-50"
          >
            Discard &amp; leave
          </button>
          <button
            type="button"
            onClick={onSaveAndLeave}
            disabled={isSaving}
            className="px-4.5 py-2 text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] rounded-lg cursor-pointer shadow-sm transition-all border-none disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save & leave'}
          </button>
        </div>
      </div>
    </div>
  );
};
