import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface AgeProtectedTrashConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  ageLabel: string;
}

export const AgeProtectedTrashConfirmModal: React.FC<AgeProtectedTrashConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  ageLabel,
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
      aria-labelledby="age-protected-confirm-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/5 bg-[#0f1118] text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-950/60 border border-amber-800/50 text-amber-400 rounded-xl shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="age-protected-confirm-modal-title" className="font-bold text-base text-white" style={{ color: '#ffffff' }}>
                Trash this file?
              </h3>
              <p className="text-xs text-[#8f97a9]" style={{ color: '#8f97a9' }}>
                This file is newly uploaded
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#8f97a9] hover:text-white rounded-lg cursor-pointer transition-colors border-0 bg-transparent"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 text-xs">
          <div className="p-4 rounded-xl border bg-amber-950/30 border-amber-900/40 text-amber-200">
            <div className="flex items-center gap-2 font-bold text-amber-100 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Minimum File Age Protection</span>
            </div>
            <p className="text-amber-300 text-xs leading-relaxed mt-2">
              {ageLabel}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#111421]/90 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#d4d7df] border border-white/15 bg-transparent hover:bg-[#202433] rounded-lg cursor-pointer transition-colors shadow-2xs"
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
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
};
