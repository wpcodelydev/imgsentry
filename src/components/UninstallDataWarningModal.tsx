import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X, ShieldAlert } from 'lucide-react';

interface UninstallDataWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDarkMode?: boolean;
}

export const UNINSTALL_DATA_DELETION_LIST = [
  "Plugin settings, transients, and database tables (logs, scan history, optimization data, ACL rules, operation restrictions)",
  "All plugin post-meta entries",
  "Backup and storage directories (wp-content/uploads/ImgsentryBackups/, wp-content/uploads/imgsentry/, wp-content/uploads/.imgsentry-trash/, wp-content/.imgsentry-fm-trash/)",
  "Temporary processing directories (imgsentry-temp, imgsentry-fm-temp, imgsentry-fm-uploads)"
];

export const UninstallDataWarningModal: React.FC<UninstallDataWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
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
      aria-labelledby="uninstall-data-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/5 bg-[#0f1118] text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-950/60 border border-rose-800/50 text-rose-400 rounded-xl shrink-0">
              <Trash2 className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 id="uninstall-data-modal-title" className="font-bold text-base text-white" style={{ color: '#ffffff' }}>
                Confirm Data Deletion
              </h3>
              <p className="text-xs text-[#8f97a9]" style={{ color: '#8f97a9' }}>
                Uninstall behavior warning
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
          <div className="p-4 rounded-xl border bg-rose-950/30 border-rose-900/40 text-rose-200">
            <div className="flex items-center gap-2 font-bold text-rose-100 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Permanent Deletion Setting Enabled</span>
            </div>
            <p className="text-rose-300 text-xs leading-relaxed mt-2">
              When this setting is enabled, deleting this plugin from the WordPress Plugins screen will <strong>permanently delete ALL plugin data</strong>:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {UNINSTALL_DATA_DELETION_LIST.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            <p className="text-rose-300 text-xs leading-relaxed mt-2">
              This action cannot be restored and happens only when DELETED from the Plugins screen, not when deactivated.
            </p>
          </div>

          <div className="p-3.5 bg-[#181b25] border border-white/5 rounded-xl text-[#8f97a9] space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-white">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Irreversible Action</span>
            </div>
            <p className="text-[11px] text-[#8f97a9] leading-normal">
              Once uninstalled with this option active, all plugin database tables and stored media indices cannot be recovered.
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
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg cursor-pointer transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Confirm &amp; Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};
