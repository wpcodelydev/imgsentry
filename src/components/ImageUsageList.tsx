import React, { useState } from 'react';
import { 
  FileText, 
  ExternalLink, 
  AlertTriangle, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  ShoppingCart,
  Layers,
  Palette,
  SlidersHorizontal,
  Globe,
  File,
  ShieldCheck
} from 'lucide-react';
import { MediaItem } from '../types';

export interface LocationUsageItem {
  title: string;
  context?: string | null;
  url?: string;
  editUrl?: string;
  breadcrumb: string;
  placements?: string[];
  type: 'Page' | 'Post' | 'Widget' | 'WooCommerce' | 'Theme' | 'Category' | 'Elementor' | 'Settings' | string;
  postId: number | null;
  fieldType: string;
  isDraft?: boolean;
  isDeleted?: boolean;
  isSiteWide?: boolean;
  isFeaturedImage?: boolean;
  previewUrl?: string;
  note?: string;
}

interface ImageUsageListProps {
  locations: LocationUsageItem[];
  item: MediaItem;
  itemsPerPage?: number;
  isRescanning?: boolean;
  onRescan?: (scanType: 'quick' | 'smart') => void;
  onNavigateToScanner?: () => void;
  rescanMessage?: string | null;
  onCloseDrawer?: () => void;
  isDarkMode?: boolean;
}

export const ImageUsageList: React.FC<ImageUsageListProps> = ({
  locations,
  item,
  itemsPerPage = 5,
  isRescanning = false,
  onRescan,
  onNavigateToScanner,
  rescanMessage,
  onCloseDrawer,
  isDarkMode = false
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(locations.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedLocations = locations.slice(startIndex, startIndex + itemsPerPage);

  const siteBase = (typeof window !== 'undefined' && ((window as any).imgsentry_data?.site_url || (window as any).imgsentry_data?.home_url)) || '';

  if (locations.length === 0) {
    return (
      <div className="p-8 text-center space-y-3">
        {item.inUse ? (
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center border border-amber-200 dark:border-amber-900/60">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-white text-sm">
                Usage details unavailable
              </h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                This file was flagged as in-use, but specific locations are not indexed or may be outdated from a previous scan. Run a fresh scan to trace exact pages, posts, or widgets.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
              {onRescan && (
                <button
                  onClick={() => onRescan('smart')}
                  disabled={isRescanning}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-3xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                  <span>{isRescanning ? 'Scanning File...' : 'Rescan This File'}</span>
                </button>
              )}
              {onNavigateToScanner && (
                <button
                  onClick={() => {
                    if (onCloseDrawer) onCloseDrawer();
                    onNavigateToScanner();
                  }}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Go to Scanner
                </button>
              )}
            </div>
            {rescanMessage && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {rescanMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="text-slate-500 dark:text-slate-400 text-xs font-medium">
            No active usage locations found for this file. It is currently unreferenced.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Locations Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {paginatedLocations.map((loc, idx) => {
          const isPost = loc.type === 'Post';
          const isWoo = loc.type === 'WooCommerce';
          const isCat = loc.type === 'Category';
          const isWidget = loc.type === 'Widget';
          const isTheme = loc.type === 'Theme';
          const isElementor = loc.type === 'Elementor';
          const isSettings = loc.type === 'Settings';

          let buttonLabel = 'Open Page';
          if (isPost) buttonLabel = 'Open Post';
          else if (isWoo) buttonLabel = 'Open Product';
          else if (isCat) buttonLabel = 'Open Category';
          else if (isWidget) buttonLabel = 'Open Page';

          let rawTargetUrl = loc.isDraft 
            ? (loc.previewUrl || (loc.url ? `${loc.url}?preview=true` : '')) 
            : (loc.url || '');

          if (rawTargetUrl && rawTargetUrl.startsWith('/') && siteBase) {
            rawTargetUrl = `${siteBase.replace(/\/$/, '')}${rawTargetUrl}`;
          }

          const targetUrl = rawTargetUrl || '';

          let editTargetUrl = loc.editUrl || '';
          if (editTargetUrl && editTargetUrl.startsWith('/') && siteBase) {
            editTargetUrl = `${siteBase.replace(/\/$/, '')}${editTargetUrl}`;
          }

          return (
            <div key={idx} className="p-4 flex items-start justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
              <div className="flex items-start gap-3 min-w-0">
                {/* Icon Box */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                  isSettings
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800/50'
                    : isPost 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800/50' 
                    : isWoo || isCat
                    ? 'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800/50'
                    : isWidget || isTheme
                    ? 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800/50'
                    : isElementor
                    ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800/50'
                    : 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800/50'
                }`}>
                  {isSettings ? <ShieldCheck className="w-4 h-4" /> :
                   isWoo ? <ShoppingCart className="w-4 h-4" /> :
                   isElementor ? <Layers className="w-4 h-4" /> :
                   isTheme ? <Palette className="w-4 h-4" /> :
                   isWidget ? <SlidersHorizontal className="w-4 h-4" /> :
                   isPost || loc.type === 'Page' ? <Globe className="w-4 h-4" /> :
                   <FileText className="w-4 h-4" />}
                </div>

                {/* Title & Context */}
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs truncate" title={loc.title}>
                    {loc.title}
                  </h4>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title={loc.context || (isTheme ? 'Used site-wide as the site logo/icon' : loc.breadcrumb)}>
                    {loc.context ? (
                      <span>{loc.context}</span>
                    ) : isTheme ? (
                      <span className="italic">Used site-wide as the site logo/icon</span>
                    ) : (
                      <span>{loc.breadcrumb}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Type Badge & Action Buttons */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  {loc.isDraft && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                      Draft
                    </span>
                  )}
                  <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded ${
                    isSettings
                      ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300'
                      : isPost
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : isWoo || isCat
                      ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                      : isWidget || isTheme
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      : isElementor
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  }`}>
                    {loc.type}
                  </span>
                </div>

                {/* Dynamic Action Buttons or Status */}
                {loc.isDeleted ? (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 italic font-medium py-0.5">
                    This page no longer exists
                  </span>
                ) : (targetUrl || editTargetUrl) ? (
                  <div className="flex items-center gap-1.5">
                    {targetUrl && (
                      <button
                        type="button"
                        onClick={() => window.open(targetUrl, '_blank', 'noopener,noreferrer')}
                        className="px-2.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all shadow-3xs cursor-pointer"
                        title="View Page"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                    {editTargetUrl && (
                      <button
                        type="button"
                        onClick={() => window.open(editTargetUrl, '_blank', 'noopener,noreferrer')}
                        className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                        title={isSettings ? 'Configure in ImgSentry Settings' : 'Edit in WP Admin'}
                      >
                        <span>{isSettings ? 'Settings' : 'Edit'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Footer */}
      {locations.length > itemsPerPage && (
        <div className="bg-slate-50/80 dark:bg-slate-800/80 px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="text-[11px]">
            Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {Math.min(startIndex + itemsPerPage, locations.length)}
            </span>{' '}
            of <span className="font-semibold text-slate-700 dark:text-slate-300">{locations.length}</span> locations
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-6 h-6 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      safeCurrentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
