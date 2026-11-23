import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ScanFileTypesRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const ScanFileTypesRequiredModal: React.FC<ScanFileTypesRequiredModalProps> = ({
  isOpen,
  onClose,
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
      aria-labelledby="file-types-required-title"
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
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="file-types-required-title" className="font-bold text-base text-white" style={{ color: '#ffffff' }}>
                Select at least one file type
              </h3>
              <p className="text-xs text-[#8f97a9]" style={{ color: '#8f97a9' }}>
                Settings were not saved
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
          <div className="p-4 rounded-xl border bg-amber-950/30 border-amber-900/40 text-amber-200">
            <p className="text-amber-200 text-xs leading-relaxed" style={{ color: '#fde68a' }}>
              All file types are turned off, so a scan would have nothing to check. Turn on at least one option under
              Scan Settings &gt; Scan File Types, then save again.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#111421]/90 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
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
