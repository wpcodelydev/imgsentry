import React, { useState, useMemo } from 'react';
import { AlertTriangle, X, Clock, CircleCheck, RefreshCw, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { UsageCheckItem } from '../types';

interface BulkUsageWarningModalProps {
  isOpen: boolean;
  totalSelected: number;
  safeItems: UsageCheckItem[];
  usedItems: UsageCheckItem[];
  lastScanFormatted?: string;
  onTrashSafeOnly: () => void;
  onTrashUsedAnyway: (includeProtected: boolean) => void;
  onCancel: () => void;
  onRescanNow?: () => void;
  isTrashing?: boolean;
}

const isProtectedOnly = (item: UsageCheckItem): boolean => {
  if (!item.locations || item.locations.length === 0) return false;
  return item.locations.every(loc => loc.field_type === 'min_age_rule' || loc.field_type === 'exclusion_rule');
};

export const BulkUsageWarningModal: React.FC<BulkUsageWarningModalProps> = ({
  isOpen,
  totalSelected,
  safeItems,
  usedItems,
  lastScanFormatted = 'Never scanned',
  onTrashSafeOnly,
  onTrashUsedAnyway,
  onCancel,
  onRescanNow,
  isTrashing = false,
}) => {
  const [showList, setShowList] = useState<boolean>(true);
  const [includeProtected, setIncludeProtected] = useState<boolean>(false);

  const { genuineUsedItems, protectedOnlyItems } = useMemo(() => {
    const genuine: UsageCheckItem[] = [];
    const protectedOnly: UsageCheckItem[] = [];
    usedItems.forEach(item => {
      if (isProtectedOnly(item)) {
        protectedOnly.push(item);
      } else {
        genuine.push(item);
      }
    });
    return { genuineUsedItems: genuine, protectedOnlyItems: protectedOnly };
  }, [usedItems]);

  if (!isOpen) return null;

  const safeCount = safeItems.length;
  const genuineCount = genuineUsedItems.length;
  const protectedCount = protectedOnlyItems.length;
  const trashAnywayCount = genuineCount + (includeProtected ? protectedCount : 0);
  const atRiskItems = [...genuineUsedItems, ...protectedOnlyItems];

  return (
    <div
      className="fixed inset-0 z-[100000100] flex items-center justify-center bg-[rgba(17,24,39,0.65)] backdrop-blur-[5px] p-4 animate-fadeIn font-sans box-border"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-usage-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/5 bg-[#0f1118] text-white shadow-[0_30px_70px_rgba(0,0,0,0.45)] flex flex-col max-h-[90vh] overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-white/5 bg-[#111421] flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800/50 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="bulk-usage-modal-title" className="font-bold text-base text-white">
                Review before trashing
              </h3>
              <p className="text-xs text-[#8f97a9] mt-0.5">
                {genuineCount + protectedCount} of {totalSelected} selected files need a closer look
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isTrashing}
            className="p-1.5 text-[#8f97a9] hover:text-white rounded-lg cursor-pointer transition-colors border-0 bg-transparent"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[rgba(99,153,34,0.10)] border border-[rgba(99,153,34,0.35)] rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-[#97C459] font-semibold text-xs">
                <CircleCheck className="w-3.5 h-3.5" />
                <span>Safe to trash</span>
              </div>
              <div className="text-xl font-bold mt-2 text-white">
                {safeCount} <span className="text-[11px] font-normal text-[#8fae6f]">file{safeCount === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div className="bg-[rgba(226,75,74,0.09)] border border-[rgba(163,45,45,0.35)] rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 text-[#F09595] font-semibold text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>In active use</span>
              </div>
              <div className="text-xl font-bold mt-2 text-white">
                {genuineCount} <span className="text-[11px] font-normal text-[#c98787]">file{genuineCount === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>

          {protectedCount > 0 && (
            <div className="bg-[rgba(250,199,117,0.09)] border border-[rgba(186,117,23,0.35)] rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[#FAC775] font-semibold text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>Newly uploaded, still protected</span>
              </div>
              <div className="text-base font-bold text-white">
                {protectedCount} <span className="text-[11px] font-normal text-[#cdb384]">file{protectedCount === 1 ? '' : 's'}</span>
              </div>
            </div>
          )}

          {atRiskItems.length > 0 && (
            <div className="border border-white/[0.07] rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowList(prev => !prev)}
                className="w-full px-4 py-2.5 bg-white/[0.02] flex items-center justify-between text-left font-semibold text-[#9aa1b1] text-xs cursor-pointer"
              >
                <span>Files at risk ({atRiskItems.length})</span>
                {showList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showList && (
                <div className="max-h-48 overflow-y-auto">
                  {atRiskItems.map((item) => {
                    const protectedItem = isProtectedOnly(item);
                    return (
                      <div key={item.attachment_id} className="px-4 py-3 border-t border-white/5 flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${protectedItem ? 'bg-[rgba(250,199,117,0.12)]' : 'bg-[rgba(226,75,74,0.12)]'}`}>
                          <ImageIcon className={`w-4 h-4 ${protectedItem ? 'text-[#FAC775]' : 'text-[#F09595]'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-white truncate">{item.title || item.filename}</div>
                          <div className="text-[11px] text-[#8f97a9] mt-0.5 truncate">
                            {protectedItem
                              ? (item.locations.find(l => l.field_type === 'min_age_rule')?.field_label || 'Protected by settings')
                              : (item.locations?.[0]?.title || item.locations?.[0]?.name || 'Active in use')}
                          </div>
                        </div>
                        <span className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${protectedItem ? 'bg-[rgba(250,199,117,0.16)] text-[#FAC775]' : 'bg-[rgba(226,75,74,0.14)] text-[#F09595]'}`}>
                          {protectedItem ? 'Protected' : 'In use'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {protectedCount > 0 && (
            <div className="flex items-center justify-between p-3 border border-white/[0.07] rounded-xl">
              <div>
                <div className="text-xs font-semibold text-white">Include protected files too</div>
                <div className="text-[11px] text-[#8f97a9] mt-0.5">Overrides the minimum file age rule</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeProtected}
                onClick={() => setIncludeProtected(prev => !prev)}
                className="w-[38px] h-[22px] rounded-full relative shrink-0 border-0 cursor-pointer transition-colors"
                style={{ background: includeProtected ? '#A61E69' : 'rgba(255,255,255,0.12)' }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white block transition-transform"
                  style={{ transform: includeProtected ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </button>
            </div>
          )}

          <div className="bg-[rgba(55,138,221,0.08)] border border-[rgba(55,138,221,0.2)] rounded-xl p-3 flex items-center justify-between text-[11px] text-[#8fb2e8]">
            <span>Based on your last scan: <span className="font-semibold text-white">{lastScanFormatted}</span></span>
            {onRescanNow && (
              <button
                type="button"
                onClick={onRescanNow}
                className="font-semibold text-[#8fb2e8] hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-2 bg-transparent border-0"
              >
                <RefreshCw className="w-3 h-3" />
                Rescan
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#111421]/90 flex gap-2.5 shrink-0">
          {safeCount > 0 && (
            <button
              type="button"
              onClick={onTrashSafeOnly}
              disabled={isTrashing}
              className="flex-1 px-3 py-3 text-[13px] font-bold rounded-[11px] bg-[#97C459] text-[#173404] cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap border-0"
            >
              Trash safe
              <span className="bg-[rgba(23,52,4,0.18)] text-[11px] font-semibold px-2 py-0.5 rounded-full">{safeCount}</span>
            </button>
          )}
          {(genuineCount > 0 || protectedCount > 0) && (
            <button
              type="button"
              onClick={() => onTrashUsedAnyway(includeProtected)}
              disabled={isTrashing || trashAnywayCount === 0}
              className="flex-1 px-3 py-3 text-[13px] font-bold rounded-[11px] bg-[#A61E69] hover:bg-[#8F1B5A] text-white cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap border-0"
            >
              {isTrashing ? 'Moving...' : 'Trash anyway'}
              <span className="bg-white/20 text-[11px] font-semibold px-2 py-0.5 rounded-full">{trashAnywayCount}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
