import React, { useEffect } from 'react';
import { AlertCircle, Calendar, X } from 'lucide-react';

interface AutoTrashDependencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDarkMode?: boolean;
}

export const AutoTrashDependencyModal: React.FC<AutoTrashDependencyModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isDarkMode = false,
}) => {
  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100000100] flex items-center justify-center bg-[rgba(17,24,39,0.65)] backdrop-blur-[5px] p-4 animate-fadeIn font-sans box-border"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dependency-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/5 bg-[#0f1118] text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-950/60 border border-indigo-800/50 text-indigo-400 rounded-xl shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="dependency-modal-title" className="font-bold text-base text-white" style={{ color: '#ffffff' }}>
                Enable Scheduled Scan Required
              </h3>
              <p className="text-xs text-[#8f97a9]" style={{ color: '#8f97a9' }}>
                Action blocked by missing dependency
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#8f97a9] hover:text-white rounded-lg cursor-pointer transition-colors border-0 bg-transparent"
            aria-label="Close dialog"
            style={{ color: '#8f97a9' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-4 rounded-xl border bg-indigo-950/30 border-indigo-900/40 text-indigo-200">
            <div className="flex items-center gap-2 font-bold text-indigo-100 text-xs" style={{ color: '#e0e7ff' }}>
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Scheduled Scan Required</span>
            </div>
            <p className="text-indigo-300 text-xs leading-relaxed mt-2" style={{ color: '#c7d2fe' }}>
              Auto-Trash Unused Files only works when Scheduled Scan is enabled, since it runs automatically during each scheduled scan. Enable Scheduled Scan now?
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#111421]/90 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#d4d7df] border border-white/15 bg-transparent hover:bg-[#202433] rounded-lg cursor-pointer transition-colors shadow-2xs"
            style={{ color: '#d4d7df' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4.5 py-2 text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] rounded-lg cursor-pointer shadow-sm flex items-center gap-2 transition-all active:scale-98 border-none"
            style={{ color: '#ffffff' }}
          >
            <span>OK</span>
          </button>
        </div>
      </div>
    </div>
  );
};
