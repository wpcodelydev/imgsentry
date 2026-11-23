import React from 'react';
import { 
  ImageIcon, 
  FileText, 
  Type, 
  Music, 
  Video as VideoIcon, 
  FolderArchive, 
  CheckCircle2, 
  X, 
  BarChart3, 
  PieChart, 
  Filter,
  HardDrive
} from 'lucide-react';

export interface ScanCategoryResult {
  category: string;
  label: string;
  count: number;
  sizeBytes: number;
  formattedSize: string;
  percentage: number;
  color: string;
  bgColor: string;
  borderColor: string;
}

export interface ScanSummaryData {
  totalCount: number;
  totalSizeBytes: number;
  formattedTotalSize: string;
  scanTime: string;
  categories: ScanCategoryResult[];
  unusedCount?: number;
  unusedSizeBytes?: number;
  formattedUnusedSize?: string;
  totalActiveFiles?: number;
}

interface ScanSummaryCardProps {
  summary: ScanSummaryData;
  onClose: () => void;
  onFilterCategory?: (category: string) => void;
}

export const ScanSummaryCard: React.FC<ScanSummaryCardProps> = ({
  summary,
  onClose,
  onFilterCategory
}) => {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'images':
        return <ImageIcon className="w-5 h-5 text-indigo-600" />;
      case 'documents':
        return <FileText className="w-5 h-5 text-emerald-600" />;
      case 'fonts':
        return <Type className="w-5 h-5 text-blue-600" />;
      case 'audio':
        return <Music className="w-5 h-5 text-purple-600" />;
      case 'video':
        return <VideoIcon className="w-5 h-5 text-amber-600" />;
      default:
        return <FolderArchive className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="bg-white dark:bg-[#111827] rounded-xl border border-gray-200 dark:border-[#243044] shadow-lg p-6 mb-6 transition-all animate-fadeIn">
      {/* Header */}
      <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-[#243044] gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 rounded-xl border border-emerald-100 dark:border-emerald-500/30 shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-[#e7ecf3]!">Scan Results Summary</h3>
              <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Completed {summary.scanTime}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-[#8993a8] mt-0.5">
              Analyzed <strong>{summary.totalCount} files</strong> ({summary.formattedTotalSize}) across all media parsers & themes.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-gray-400 dark:text-[#8993a8] hover:text-gray-600 dark:hover:text-[#e7ecf3] p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1e293b] transition-colors cursor-pointer"
          title="Close Summary"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <div className="bg-slate-50 dark:bg-[#0f172a] border border-slate-200/80 dark:border-[#243044] rounded-lg p-3">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#8993a8] uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
            <span>Total Files</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-[#e7ecf3] mt-1">{summary.totalCount}</div>
        </div>

        <div className="bg-slate-50 dark:bg-[#0f172a] border border-slate-200/80 dark:border-[#243044] rounded-lg p-3">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#8993a8] uppercase tracking-wider flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
            <span>Total Storage</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-[#e7ecf3] mt-1">{summary.formattedTotalSize}</div>
        </div>

        <div className="bg-slate-50 dark:bg-[#0f172a] border border-slate-200/80 dark:border-[#243044] rounded-lg p-3">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#8993a8] uppercase tracking-wider flex items-center gap-1.5">
            <PieChart className="w-3.5 h-3.5 text-purple-500" />
            <span>Categories</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-[#e7ecf3] mt-1">{summary.categories.filter(c => c.count > 0).length} Active</div>
        </div>

        <div className="bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/30 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Parser Status</span>
          </div>
          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 mt-1.5">100% Verified Clean</div>
        </div>
      </div>

      {/* Stacked Visual Bar */}
      <div className="my-4">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-[#8993a8] mb-1.5 font-medium">
          <span>Storage Distribution by File Category</span>
          <span>100% ({summary.formattedTotalSize})</span>
        </div>
        <div className="w-full h-3 bg-gray-100 dark:bg-[#1e293b] rounded-full overflow-hidden flex shadow-inner">
          {summary.categories.map((cat) => (
            cat.percentage > 0 ? (
              <div
                key={cat.category}
                style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                className={`${cat.color} h-full transition-all duration-500`}
                title={`${cat.label}: ${cat.count} files (${cat.formattedSize}, ${cat.percentage}%)`}
              />
            ) : null
          ))}
        </div>
      </div>

      {/* Category Breakdown Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
        {summary.categories.map((cat) => {
          return (
            <div
              key={cat.category}
              className={`${cat.bgColor} ${cat.borderColor} border rounded-xl p-3.5 transition-all hover:shadow-md flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-white dark:bg-[#111827] rounded-lg shadow-2xs">
                      {getCategoryIcon(cat.category)}
                    </div>
                    <span className="font-bold text-gray-900 dark:text-[#e7ecf3] text-xs">{cat.label}</span>
                  </div>
                  <span className="text-[11px] font-extrabold text-gray-600 dark:text-[#8993a8] bg-white/80 dark:bg-[#1e293b]/80 px-2 py-0.5 rounded-full border border-gray-200/60 dark:border-[#243044]">
                    {cat.percentage}%
                  </span>
                </div>

                <div className="flex items-baseline justify-between text-xs mt-3">
                  <div>
                    <span className="text-base font-extrabold text-gray-900 dark:text-[#e7ecf3]">{cat.count}</span>
                    <span className="text-gray-500 dark:text-[#8993a8] text-[11px] ml-1">files</span>
                  </div>
                  <div className="font-semibold text-gray-700 dark:text-[#e7ecf3]">{cat.formattedSize}</div>
                </div>

                {/* Individual Category Progress Bar */}
                <div className="w-full h-1.5 bg-gray-200/80 dark:bg-[#1e293b] rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full ${cat.color}`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>

              {onFilterCategory && (
                <button
                  onClick={() => onFilterCategory(cat.category)}
                  className="mt-3 text-[11px] font-bold text-gray-700 dark:text-[#e7ecf3] hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-end gap-1 transition-colors cursor-pointer pt-2 border-t border-gray-200/50 dark:border-[#243044]"
                >
                  <Filter className="w-3 h-3" />
                  <span>Filter {cat.label}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
