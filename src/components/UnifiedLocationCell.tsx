import React, { useState } from 'react';
import { MediaItem } from '../types';
import { getUsageLocations, getRealFilePath, UsageLocation } from '../utils/fileUtils';
import { ExternalLink } from 'lucide-react';

interface UnifiedLocationCellProps {
  item: MediaItem;
  pageContext: 'trash' | 'used' | 'unused';
  onOpenUsageDrawer?: (item: MediaItem) => void;
}

export const UnifiedLocationCell: React.FC<UnifiedLocationCellProps> = ({ 
  item, 
  pageContext, 
  onOpenUsageDrawer 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const locations = getUsageLocations(item);
  const realPath = getRealFilePath(item);

  // Get badge color classes depending on type
  const getBadgeStyleClasses = (type: string) => {
    const cleanType = type.toLowerCase();
    if (cleanType === 'woocommerce') {
      return 'bg-purple-50 text-purple-700 border-purple-200/60 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/40';
    } else if (cleanType === 'elementor') {
      return 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40';
    } else if (cleanType === 'theme') {
      return 'bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/40';
    } else if (cleanType === 'widget') {
      return 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40';
    } else if (cleanType === 'settings') {
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60';
    } else if (cleanType === 'post') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40';
    } else if (cleanType === 'page') {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/40';
    }
    return 'bg-slate-50 text-slate-600 border-slate-200/60 dark:bg-slate-900 dark:text-slate-400 dark:border-[#243044]';
  };

  const extraCount = locations.length - 1;

  const renderLocationItem = (loc: UsageLocation, key: React.Key) => (
    <div key={key} className="flex flex-col gap-0.5 text-gray-700 dark:text-slate-300">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="truncate max-w-[150px] font-bold text-gray-900 dark:text-slate-100" title={loc.title || loc.name}>
          {loc.title || loc.name}
        </span>
        {loc.type && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${getBadgeStyleClasses(loc.type)}`}>
            {loc.type}
          </span>
        )}
        {loc.viewUrl && (
          <a 
            href={loc.viewUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
            title="View"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        )}
        {loc.editUrl && (
          <a 
            href={loc.editUrl} 
            target="_blank" 
            rel="noreferrer" 
            className="inline-flex text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
            title="Edit in WordPress Admin"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        )}
      </div>
      {loc.context && (
        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate max-w-[180px]" title={loc.context}>
          {loc.context}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-1 min-w-[180px] max-w-[320px]">
      {/* 1. SECONDARY LINE (USED IN) */}
      <div className="text-[11px] font-medium">
        {locations.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {/* First location (always rendered) */}
            {renderLocationItem(locations[0], 0)}

            {/* Expandable additional locations link -> Opens Image Usage Details Drawer */}
            {extraCount > 0 && (
              <div className="flex flex-col gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenUsageDrawer) {
                      onOpenUsageDrawer(item);
                    } else {
                      setIsExpanded(!isExpanded);
                    }
                  }}
                  className="text-[10px] text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-medium hover:underline text-left cursor-pointer w-fit"
                  title="View all usage details in drawer"
                >
                  {onOpenUsageDrawer 
                    ? `Also used in ${extraCount} more place${extraCount > 1 ? 's' : ''}` 
                    : (isExpanded ? 'Show less' : `Also used in ${extraCount} more place${extraCount > 1 ? 's' : ''}`)
                  }
                </button>

                {!onOpenUsageDrawer && isExpanded && (
                  <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-slate-200 dark:border-slate-700 my-0.5">
                    {locations.slice(1).map((loc, idx) => renderLocationItem(loc, idx + 1))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            {pageContext === 'trash' ? (
              <span className="text-rose-500/80 dark:text-rose-400/80 text-[11px] font-semibold flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-rose-500"></span>
                Quarantined
              </span>
            ) : pageContext === 'unused' ? (
              <span className="text-slate-400 dark:text-slate-500 text-[11px] font-medium italic">
                Not Used
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 text-[11px] font-medium italic">
                Unreferenced
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. TERTIARY LINE (PHYSICAL FILE PATH) */}
      {realPath && (
        <span 
          className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block truncate max-w-[240px] select-all cursor-help hover:text-slate-600 dark:hover:text-slate-400"
          title={`Physical location: ${realPath}`}
        >
          {realPath}
        </span>
      )}
    </div>
  );
};
