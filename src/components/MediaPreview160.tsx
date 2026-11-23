import React from 'react';
import { FileText, FileCode, Film, Music } from 'lucide-react';

interface MediaPreview160Props {
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

export const MediaPreview160: React.FC<MediaPreview160Props> = ({ item, className = '' }) => {
  const ext = (item.extension || '').toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isDoc = ['doc', 'docx', 'txt', 'csv', 'xls', 'xlsx'].includes(ext) || item.category === 'documents';
  const isVideo = ['mp4', 'mov', 'webm', 'avi'].includes(ext) || item.category === 'video';
  const isAudio = ['mp3', 'wav', 'ogg'].includes(ext) || item.category === 'audio';

  const imageUrl = item.thumbUrl || item.url;

  if (isImage && imageUrl && imageUrl !== '#') {
    return (
      <div className={`w-[250px] h-[230px] rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 shrink-0 shadow-2xs relative group/thumb ${className}`}>
        <img
          src={imageUrl}
          alt={item.title}
          className="w-[250px] h-[230px] object-cover transition-transform duration-300 group-hover/thumb:scale-105"
        />
        <span className="absolute bottom-1.5 right-1.5 bg-black/75 text-white font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded backdrop-blur-xs uppercase">
          {item.extension}
        </span>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className={`w-[250px] h-[230px] rounded-xl border border-rose-200 dark:border-rose-900/80 bg-gradient-to-br from-rose-50 via-rose-50/80 to-rose-100/60 dark:from-rose-950/60 dark:to-slate-900 shrink-0 p-3 flex flex-col justify-between shadow-2xs relative ${className}`}>
        <div className="flex items-center justify-between border-b border-rose-200/80 dark:border-rose-900/60 pb-1.5">
          <span className="bg-rose-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded shadow-2xs uppercase">
            PDF
          </span>
          <FileText className="w-4 h-4 text-rose-500 dark:text-rose-400" />
        </div>
        <div className="text-center my-auto px-1">
          <div className="w-10 h-12 mx-auto bg-white dark:bg-slate-800 rounded border border-rose-200 dark:border-rose-800 shadow-xs flex flex-col justify-between p-1.5 mb-1">
            <div className="h-1 bg-rose-500 rounded w-full"></div>
            <div className="h-1 bg-rose-200 dark:bg-rose-900 rounded w-3/4"></div>
            <div className="h-1 bg-rose-200 dark:bg-rose-900 rounded w-1/2"></div>
            <div className="h-1 bg-rose-300 dark:bg-rose-800 rounded w-5/6"></div>
          </div>
          <span className="text-[10px] font-extrabold text-gray-800 dark:text-slate-200 line-clamp-1 block" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
        {item.formattedSize && (
          <div className="text-[9px] font-mono text-rose-700 dark:text-rose-300 font-bold text-center border-t border-rose-200/60 dark:border-rose-900/40 pt-1">
            {item.formattedSize}
          </div>
        )}
      </div>
    );
  }

  if (isDoc) {
    return (
      <div className={`w-[250px] h-[230px] rounded-xl border border-blue-200 dark:border-blue-900/80 bg-gradient-to-br from-blue-50 to-slate-100 dark:from-blue-950/60 dark:to-slate-900 shrink-0 p-3 flex flex-col justify-between shadow-2xs relative ${className}`}>
        <div className="flex items-center justify-between border-b border-blue-200 dark:border-blue-900/60 pb-1.5">
          <span className="bg-blue-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase">
            {item.extension}
          </span>
          <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" />
        </div>
        <div className="text-center my-auto px-1">
          <FileText className="w-8 h-8 text-blue-500 dark:text-blue-400 mx-auto mb-1" />
          <span className="text-[10px] font-extrabold text-gray-800 dark:text-slate-200 line-clamp-1 block" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
        {item.formattedSize && (
          <div className="text-[9px] font-mono text-blue-700 dark:text-blue-300 font-bold text-center border-t border-blue-200 dark:border-blue-900/40 pt-1">
            {item.formattedSize}
          </div>
        )}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={`w-[250px] h-[230px] rounded-xl border border-purple-200 dark:border-purple-900/80 bg-gradient-to-br from-purple-50 to-slate-100 dark:from-purple-950/60 dark:to-slate-900 shrink-0 p-3 flex flex-col justify-between shadow-2xs relative ${className}`}>
        <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-900/60 pb-1.5">
          <span className="bg-purple-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase">
            VIDEO
          </span>
          <Film className="w-4 h-4 text-purple-500 dark:text-purple-400" />
        </div>
        <div className="text-center my-auto px-1">
          <Film className="w-8 h-8 text-purple-500 dark:text-purple-400 mx-auto mb-1" />
          <span className="text-[10px] font-extrabold text-gray-800 dark:text-slate-200 line-clamp-1 block" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
        {item.formattedSize && (
          <div className="text-[9px] font-mono text-purple-700 dark:text-purple-300 font-bold text-center border-t border-purple-200 dark:border-purple-900/40 pt-1">
            {item.formattedSize}
          </div>
        )}
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className={`w-[250px] h-[230px] rounded-xl border border-amber-200 dark:border-amber-900/80 bg-gradient-to-br from-amber-50 to-slate-100 dark:from-amber-950/60 dark:to-slate-900 shrink-0 p-3 flex flex-col justify-between shadow-2xs relative ${className}`}>
        <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-900/60 pb-1.5">
          <span className="bg-amber-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase">
            AUDIO
          </span>
          <Music className="w-4 h-4 text-amber-500 dark:text-amber-400" />
        </div>
        <div className="text-center my-auto px-1">
          <Music className="w-8 h-8 text-amber-500 dark:text-amber-400 mx-auto mb-1" />
          <span className="text-[10px] font-extrabold text-gray-800 dark:text-slate-200 line-clamp-1 block" title={item.filename || item.title}>
            {item.filename || item.title}
          </span>
        </div>
        {item.formattedSize && (
          <div className="text-[9px] font-mono text-amber-700 dark:text-amber-300 font-bold text-center border-t border-amber-200 dark:border-amber-900/40 pt-1">
            {item.formattedSize}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`w-[250px] h-[230px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0 p-3 flex flex-col justify-between shadow-2xs relative ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#243044] pb-1.5">
        <span className="bg-slate-700 text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase">
          {item.extension || 'FILE'}
        </span>
        <FileCode className="w-4 h-4 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="text-center my-auto px-1">
        <FileText className="w-8 h-8 text-slate-400 mx-auto mb-1" />
        <span className="text-[10px] font-extrabold text-gray-800 dark:text-slate-200 line-clamp-1 block" title={item.filename || item.title}>
          {item.filename || item.title}
        </span>
      </div>
      {item.formattedSize && (
        <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 font-bold text-center border-t border-slate-200 dark:border-[#243044] pt-1">
          {item.formattedSize}
        </div>
      )}
    </div>
  );
};
