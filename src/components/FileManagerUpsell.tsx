import React from 'react';
import { ArrowUpRight, FileCode, FolderOpen, History, Lock, ShieldCheck, Trash2, Users } from 'lucide-react';
import { ProLockBadge, openUpgrade } from './ProLock';

interface FileManagerUpsellProps {
  isDarkMode?: boolean;
}

const FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }[] = [
  {
    icon: FolderOpen,
    title: 'Manage all your files',
    text: 'Browse, upload, download, rename and organize files and folders without leaving WordPress.',
  },
  {
    icon: FileCode,
    title: 'Built-in code editor',
    text: 'Open and edit text and code files with syntax highlighting, themes and code folding.',
  },
  {
    icon: Users,
    title: 'Roles and folder rules',
    text: 'Choose which roles and users can open it, and which folders each person can see.',
  },
  {
    icon: ShieldCheck,
    title: 'Protected paths',
    text: 'Hide sensitive folders, lock risky file types and block chosen operations for specific users.',
  },
  {
    icon: Trash2,
    title: 'Safe delete',
    text: 'Deleted files go to a separate File Manager Trash first, so a mistake can be undone.',
  },
  {
    icon: History,
    title: 'Activity log and alerts',
    text: 'Every upload, download and edit is logged, with optional email summaries.',
  },
];

/**
 * Locked "Advance File Manager" page.
 * Shown only to Administrators on a plan that does not include the File Manager.
 * It loads no File Manager code or data; it only explains the feature and opens the pricing page.
 */
export const FileManagerUpsell: React.FC<FileManagerUpsellProps> = ({ isDarkMode = false }) => {
  const card = isDarkMode ? 'bg-[#111827] border-[#243044]' : 'bg-white border-gray-200';
  const title = isDarkMode ? 'text-white' : 'text-gray-900';
  const muted = isDarkMode ? 'text-slate-400' : 'text-gray-600';

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className={`rounded-xl border p-8 shadow-2xs text-center ${card}`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#A61E69]/10">
          <Lock className="h-6 w-6 text-[#A61E69]" />
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <h2 className={`text-xl font-bold ${title}`}>Advance File Manager</h2>
          <ProLockBadge isDarkMode={isDarkMode} label="PRO" />
        </div>
        <p className={`mt-2 text-sm max-w-xl mx-auto ${muted}`}>
          A full file manager inside your WordPress admin, with access rules, a code editor and a safe trash.
          It is included in the Professional plan.
        </p>
        <button
          type="button"
          onClick={() => openUpgrade('file_manager_page', 'file_manager')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#A61E69] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8c1858] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A61E69] focus-visible:ring-offset-2 cursor-pointer"
        >
          Upgrade to Professional
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className={`rounded-xl border p-5 shadow-2xs ${card}`}>
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#A61E69]/10">
                <Icon className="h-5 w-5 text-[#A61E69]" />
              </div>
              <h3 className={`text-sm font-bold ${title}`}>{feature.title}</h3>
              <p className={`mt-1 text-xs leading-relaxed ${muted}`}>{feature.text}</p>
            </div>
          );
        })}
      </div>

      <p className={`text-center text-[11px] ${muted}`}>
        You can hide this item from the menu in Settings &gt; General &gt; Show Advance File Manager in the menu.
      </p>
    </div>
  );
};

export default FileManagerUpsell;
