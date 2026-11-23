import React, { useState } from 'react';
import { FileText, Search, X, Check, Image as ImageIcon, AlertTriangle, Shield } from 'lucide-react';
import { INITIAL_MOCK_MEDIA } from '../data/mockMedia';
import { MediaItem } from '../types';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPattern: (pattern: string) => void;
  existingFiles: string[];
  isDarkMode?: boolean;
  mediaList?: MediaItem[];
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectPattern,
  existingFiles,
  isDarkMode = false,
  mediaList
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [excludeType, setExcludeType] = useState<'exact' | 'wildcard'>('exact');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isWp = typeof window !== 'undefined' && Boolean((window as any).imgsentry_data && (window as any).imgsentry_data.ajax_url);
  const sourceItems = mediaList && mediaList.length > 0 ? mediaList : isWp ? [] : INITIAL_MOCK_MEDIA;

  const filteredMedia = sourceItems.filter(item => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      item.filename.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.extension.toLowerCase().includes(q)
    );
  });

  const generatePattern = (item: MediaItem, type: 'exact' | 'wildcard'): string => {
    if (type === 'exact') {
      return item.filename;
    }
    // Wildcard based on prefix or extension
    const nameWithoutExt = item.filename.substring(0, item.filename.lastIndexOf('.')) || item.filename;
    const ext = item.filename.split('.').pop() || 'jpg';
    
    // Create sensible wildcard e.g. logo-*.png or beauty-item-*.jpg
    const parts = nameWithoutExt.split(/[-_]/);
    if (parts.length > 1) {
      return `${parts[0]}-*.${ext}`;
    }
    return `*${nameWithoutExt}*.${ext}`;
  };

  const handleConfirm = () => {
    if (!selectedMedia) {
      setErrorMsg('Please select a media file first.');
      return;
    }

    const pattern = generatePattern(selectedMedia, excludeType);
    
    // Check duplicate
    const isDup = existingFiles.some(f => f.toLowerCase() === pattern.toLowerCase());
    if (isDup) {
      setErrorMsg(`The pattern "${pattern}" is already in your exclusion list.`);
      return;
    }

    onSelectPattern(pattern);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
      <div className={`w-full max-w-2xl rounded-2xl border shadow-xl flex flex-col max-h-[90vh] ${
        isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#243044]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
              <ImageIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Pick File from Media Library</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">Select an existing media asset to exclude by filename or pattern</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100 dark:border-[#243044] bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400 dark:text-[#5b6579]" />
            <input
              type="text"
              placeholder="Search media library by filename or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579]"
            />
          </div>

          {errorMsg && (
            <div className="mt-3 p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Grid of Media Items */}
        <div className="p-4 overflow-y-auto flex-1 max-h-[350px]">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredMedia.map((item) => {
              const isSelected = selectedMedia?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedMedia(item);
                    setErrorMsg(null);
                  }}
                  className={`p-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-indigo-300'
                  }`}
                >
                  <div className="relative aspect-square rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden mb-2 border border-gray-200 dark:border-slate-600">
                    <img
                      src={item.url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/70 text-white font-bold">
                      {item.extension.toUpperCase()}
                    </span>
                  </div>

                  <span className="text-xs font-bold text-gray-800 dark:text-slate-200 truncate">
                    {item.title}
                  </span>
                  <span className="text-[10px] font-mono text-gray-400 truncate mt-0.5">
                    {item.filename}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Pattern Config & Footer */}
        {selectedMedia && (
          <div className="p-4 border-t border-gray-200 dark:border-[#243044] bg-slate-50/70 dark:bg-slate-900/70 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-gray-800 dark:text-slate-200 block">Exclusion Rule Type:</span>
                <span className="text-[11px] text-gray-500">Choose exact filename match or wildcard pattern</span>
              </div>
              <div className="flex items-center gap-2 bg-gray-200/70 dark:bg-slate-800 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setExcludeType('exact')}
                  className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer ${
                    excludeType === 'exact' ? 'bg-white dark:bg-slate-700 font-bold shadow-2xs text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-slate-400'
                  }`}
                >
                  Exact Filename
                </button>
                <button
                  type="button"
                  onClick={() => setExcludeType('wildcard')}
                  className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer ${
                    excludeType === 'wildcard' ? 'bg-white dark:bg-slate-700 font-bold shadow-2xs text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-slate-400'
                  }`}
                >
                  Wildcard Pattern
                </button>
              </div>
            </div>

            <div className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 font-mono text-xs flex items-center justify-between">
              <span className="text-gray-500 dark:text-slate-400">Generated Pattern:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                {generatePattern(selectedMedia, excludeType)}
              </span>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-gray-200 dark:border-[#243044] flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-xs text-gray-500 dark:text-slate-400">
            {selectedMedia ? `Selected: ${selectedMedia.filename}` : 'Select a media file to proceed'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedMedia}
              onClick={handleConfirm}
              className="px-4 py-2 text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] disabled:opacity-50 rounded-lg cursor-pointer shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Exclude Selected File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
