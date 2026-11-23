import React from 'react';
import { Check, Eye, Trash2, Loader2, FileText, FileCode, Film, Music, File as FileIcon } from 'lucide-react';

export interface MediaGridCardItem {
  id: number;
  title: string;
  filename: string;
  extension: string;
  previewUrl?: string;
  thumbUrl?: string;
  url?: string;
  formattedSize?: string;
  dimensions?: string;
  category?: string;
}

interface MediaGridCardProps {
  item: MediaGridCardItem;
  status: 'unused' | 'used' | 'checking';
  selected: boolean;
  selectDisabled?: boolean;
  onToggleSelect: () => void;
  onInspect: () => void;
  onTrash?: () => void;
  trashDisabled?: boolean;
  trashTitle?: string;
  /** Extra content under the image (e.g. "Used in" details). Not clipped, so dropdowns work. */
  footer?: React.ReactNode;
  raised?: boolean;
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico'];

const placeholderFor = (ext: string, category?: string) => {
  if (ext === 'pdf') return { Icon: FileText, bg: 'from-rose-500 to-rose-800' };
  if (category === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'].includes(ext)) return { Icon: Film, bg: 'from-indigo-500 to-indigo-900' };
  if (category === 'audio' || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return { Icon: Music, bg: 'from-emerald-500 to-emerald-900' };
  if (category === 'fonts' || ['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return { Icon: FileCode, bg: 'from-violet-500 to-violet-900' };
  if (category === 'documents' || ['doc', 'docx', 'txt', 'csv', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return { Icon: FileText, bg: 'from-sky-500 to-sky-900' };
  return { Icon: FileIcon, bg: 'from-slate-500 to-slate-800' };
};

const PILL = {
  unused: { label: 'Unused', cls: 'text-[#f87171]' },
  used: { label: 'Used', cls: 'text-[#4ade80]' },
  checking: { label: 'Checking…', cls: 'text-[#93c5fd]' },
} as const;

/**
 * Media card for the grid view (Unused Files / Used Files).
 * Same look in light and dark mode: full-bleed image, glass info panel, round select button.
 */
export const MediaGridCard: React.FC<MediaGridCardProps> = ({
  item, status, selected, selectDisabled, onToggleSelect, onInspect, onTrash, trashDisabled, trashTitle, footer, raised,
}) => {
  const ext = (item.extension || '').toLowerCase();
  const imageUrl = item.previewUrl || item.thumbUrl || item.url;
  const isImage = IMAGE_EXT.includes(ext) && !!imageUrl && imageUrl !== '#';
  const ph = placeholderFor(ext, item.category);
  const pill = PILL[status];
  const format = (item.extension || '').toUpperCase();
  const hasFooter = !!footer;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`relative rounded-2xl border-2 bg-white dark:bg-[#111827] transition-shadow ${raised ? 'z-30' : ''} ${
        selected
          ? 'border-[#A61E69] ring-4 ring-[#A61E69]/20 dark:ring-[#A61E69]/35'
          : 'border-slate-200 dark:border-[#243044] hover:shadow-lg'
      }`}
    >
      {/* Image area */}
      <div
        className={`relative aspect-square overflow-hidden cursor-pointer ${hasFooter ? 'rounded-t-[14px]' : 'rounded-[14px]'}`}
        onClick={onInspect}
      >
        {isImage ? (
          <img
            src={imageUrl}
            alt={item.title || item.filename}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${ph.bg} flex items-start justify-center pt-[18%]`}>
            <ph.Icon className="w-16 h-16 text-white/70" strokeWidth={1.4} />
          </div>
        )}

        {selected && <div className="absolute inset-0 bg-[#A61E69]/20 dark:bg-[#A61E69]/30 pointer-events-none" />}
        <div className="absolute inset-x-0 top-0 h-[70px] bg-gradient-to-b from-black/35 to-transparent pointer-events-none" />

        {/* Round select button */}
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${item.filename}`}
          disabled={selectDisabled}
          onClick={(e) => { stop(e); onToggleSelect(); }}
          className={`absolute top-3 left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            selected ? 'bg-[#A61E69] border-[#A61E69] text-white' : 'bg-black/30 border-white text-transparent hover:bg-black/45'
          } ${selectDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3.5} />
        </button>

        {/* Status pill */}
        <span className={`absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[#0f172a]/90 px-2.5 py-[3px] text-[11px] font-bold shadow-md ${pill.cls}`}>
          {status === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
          {pill.label}
        </span>

        {/* Glass info panel */}
        <div
          className="absolute inset-x-2.5 bottom-2.5 rounded-xl border border-white/15 bg-[#0b1220]/30 backdrop-blur-[12px] p-3 text-white"
          onClick={stop}
        >
          <div className="text-[13.5px] font-semibold truncate [text-shadow:0_1px_2px_rgba(0,0,0,.45)]" title={item.filename}>
            {item.filename}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,.45)]">
            <span className="truncate">
              {item.formattedSize}
              {item.dimensions ? ` · ${item.dimensions}` : ''}
            </span>
            {format && (
              <span className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white [text-shadow:none]">
                {format}
              </span>
            )}
          </div>

          <div className={`mt-2.5 grid gap-2 ${onTrash ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={onInspect}
              className="h-9 rounded-[9px] border border-white/25 bg-white/15 hover:bg-white/25 text-white text-[12.5px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              title="Inspect file"
            >
              <Eye className="w-3.5 h-3.5" />
              Inspect
            </button>
            {onTrash && (
              <button
                type="button"
                onClick={onTrash}
                disabled={trashDisabled}
                title={trashTitle || 'Move to Trash'}
                className={`h-9 rounded-[9px] border border-red-200/40 bg-red-400/30 text-red-100 text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  trashDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-400/45 cursor-pointer'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Trash
              </button>
            )}
          </div>
        </div>
      </div>

      {hasFooter && (
        <div className="px-3 py-2.5 border-t border-slate-200 dark:border-[#243044]" onClick={stop}>
          {footer}
        </div>
      )}
    </div>
  );
};
