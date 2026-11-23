import React from 'react';
import { FileText, FileCode, Film, Music } from 'lucide-react';

interface MediaPreview80Props {
  item: {
    title: string;
    filename: string;
    extension: string;
    thumbUrl?: string;
    url?: string;
    formattedSize?: string;
    category?: string;
  };
  className?: string;
}

export const MediaPreview80: React.FC<MediaPreview80Props> = ({ item, className = '' }) => {
  const ext = (item.extension || '').toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isDoc = ['doc', 'docx', 'txt', 'csv', 'xls', 'xlsx'].includes(ext) || item.category === 'documents';
  const isVideo = ['mp4', 'mov', 'webm', 'avi'].includes(ext) || item.category === 'video';
  const isAudio = ['mp3', 'wav', 'ogg'].includes(ext) || item.category === 'audio';

  const imageUrl = item.thumbUrl || item.url;

  if (isImage && imageUrl && imageUrl !== '#') {
    return (
      <div className={`w-[100px] h-[100px] rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 shrink-0 shadow-3xs relative group/thumb ${className}`}>
        <img
          src={imageUrl}
          alt={item.title}
          referrerPolicy="no-referrer"
          className="w-[100px] h-[100px] object-cover transition-transform duration-300 group-hover/thumb:scale-105"
        />
        <span className="absolute bottom-1 right-1 bg-black/75 text-white font-mono text-[8px] font-extrabold px-1 py-0.2 rounded-xs uppercase">
          {item.extension}
        </span>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className={`w-[100px] h-[100px] rounded-lg border border-rose-200 dark:border-rose-900/80 bg-gradient-to-br from-rose-50 via-rose-50/80 to-rose-100/60 dark:from-rose-950/60 dark:to-slate-900 shrink-0 p-1.5 flex flex-col justify-between shadow-3xs relative ${className}`}>
        <div className="flex items-center justify-between">
          <span className="bg-rose-600 text-white font-black text-[7px] px-1 py-0.2 rounded-xs uppercase">
            PDF
          </span>
          <FileText className="w-3 h-3 text-rose-500 dark:text-rose-400" />
        </div>
        <div className="text-center my-auto">
          <div className="w-6 h-7 mx-auto bg-white dark:bg-slate-800 rounded border border-rose-200 dark:border-rose-800 shadow-3xs flex flex-col justify-between p-0.5 mb-0.5">
            <div className="h-0.5 bg-rose-500 rounded-2xs w-full"></div>
            <div className="h-0.5 bg-rose-200 dark:bg-rose-900 rounded-2xs w-3/4"></div>
            <div className="h-0.5 bg-rose-200 dark:bg-rose-900 rounded-2xs w-1/2"></div>
          </div>
          <span className="text-[8px] font-bold text-gray-800 dark:text-slate-200 line-clamp-1 block w-full px-0.5 truncate" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
      </div>
    );
  }

  if (isDoc) {
    return (
      <div className={`w-[100px] h-[100px] rounded-lg border border-blue-200 dark:border-blue-900/80 bg-gradient-to-br from-blue-50 to-slate-100 dark:from-blue-950/60 dark:to-slate-900 shrink-0 p-1.5 flex flex-col justify-between shadow-3xs relative ${className}`}>
        <div className="flex items-center justify-between">
          <span className="bg-blue-600 text-white font-bold text-[7px] px-1 py-0.2 rounded-xs uppercase">
            {item.extension}
          </span>
          <FileText className="w-3 h-3 text-blue-500 dark:text-blue-400" />
        </div>
        <div className="text-center my-auto">
          <FileText className="w-5 h-5 text-blue-500 dark:text-blue-400 mx-auto mb-0.5" />
          <span className="text-[8px] font-bold text-gray-800 dark:text-slate-200 line-clamp-1 block w-full px-0.5 truncate" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={`w-[100px] h-[100px] rounded-lg border border-purple-200 dark:border-purple-900/80 bg-gradient-to-br from-purple-50 to-slate-100 dark:from-purple-950/60 dark:to-slate-900 shrink-0 p-1.5 flex flex-col justify-between shadow-3xs relative ${className}`}>
        <div className="flex items-center justify-between">
          <span className="bg-purple-600 text-white font-bold text-[7px] px-1 py-0.2 rounded-xs uppercase">
            VIDEO
          </span>
          <Film className="w-3 h-3 text-purple-500 dark:text-purple-400" />
        </div>
        <div className="text-center my-auto">
          <Film className="w-5 h-5 text-purple-500 dark:text-purple-400 mx-auto mb-0.5" />
          <span className="text-[8px] font-bold text-gray-800 dark:text-slate-200 line-clamp-1 block w-full px-0.5 truncate" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className={`w-[100px] h-[100px] rounded-lg border border-amber-200 dark:border-amber-900/80 bg-gradient-to-br from-amber-50 to-slate-100 dark:from-amber-950/60 dark:to-slate-900 shrink-0 p-1.5 flex flex-col justify-between shadow-3xs relative ${className}`}>
        <div className="flex items-center justify-between">
          <span className="bg-amber-600 text-white font-bold text-[7px] px-1 py-0.2 rounded-xs uppercase">
            AUDIO
          </span>
          <Music className="w-3 h-3 text-amber-500 dark:text-amber-400" />
        </div>
        <div className="text-center my-auto">
          <Music className="w-5 h-5 text-amber-500 dark:text-amber-400 mx-auto mb-0.5" />
          <span className="text-[8px] font-bold text-gray-800 dark:text-slate-200 line-clamp-1 block w-full px-0.5 truncate" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-[100px] h-[100px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0 p-1.5 flex flex-col justify-between shadow-3xs relative ${className}`}>
      <div className="flex items-center justify-between">
        <span className="bg-slate-700 text-white font-bold text-[7px] px-1 py-0.2 rounded-xs uppercase">
          {item.extension || 'FILE'}
        </span>
        <FileCode className="w-3 h-3 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="text-center my-auto">
        <FileText className="w-5 h-5 text-slate-400 mx-auto mb-0.5" />
        <span className="text-[8px] font-bold text-gray-800 dark:text-slate-200 line-clamp-1 block w-full px-0.5 truncate" title={item.filename || item.title}>
          {item.filename || item.title}
        </span>
      </div>
    </div>
  );
};
