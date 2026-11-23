import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface BroadPatternWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  patterns: string[];
  isDarkMode?: boolean;
}

export const BroadPatternWarningModal: React.FC<BroadPatternWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  patterns,
  isDarkMode = false,
}) => {
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
      aria-labelledby="broad-pattern-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/5 bg-[#0f1118] text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-950/60 border border-amber-800/50 text-amber-400 rounded-xl shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="broad-pattern-modal-title" className="font-bold text-base text-white" style={{ color: '#ffffff' }}>
                Broad Exclusion Pattern Detected
              </h3>
              <p className="text-xs text-[#8f97a9]" style={{ color: '#8f97a9' }}>
                Caution: High impact configuration warning
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

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-4 rounded-xl border bg-amber-950/30 border-amber-900/40 text-amber-200">
            <p className="text-amber-300 text-xs leading-relaxed">
              The following pattern(s) will exclude <strong>EVERY</strong> file with that extension across your entire site from scanning, duplicate-detection, and optimization:
            </p>
            
            <ul className="list-disc pl-5 font-mono text-xs text-amber-300 font-bold space-y-1 my-2">
              {patterns.map((pat, idx) => (
                <li key={idx}>{pat}</li>
              ))}
            </ul>

            <p className="text-amber-400 text-[11px] leading-relaxed pt-1.5 border-t border-amber-900/40">
              This will disable crucial features like media reference indexing and optimizations for these file types entirely. It is rarely what you want.
            </p>
          </div>

          <p className="text-[#8f97a9] leading-relaxed text-xs">
            Are you sure you want to add these bare extension wildcard patterns? It is highly recommended to use more specific prefix/suffix patterns (like <code>*-thumbnail.jpg</code> or <code>invoice-*.pdf</code>) instead.
          </p>
        </div>

        {/* Footer */}
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
            <span>Add Anyway</span>
          </button>
        </div>
      </div>
    </div>
  );
};
