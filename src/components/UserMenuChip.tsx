import React, { useState } from 'react';
import { User } from 'lucide-react';

interface UserMenuChipProps {
  isDarkMode?: boolean;
}

interface ChipUser {
  name: string;
  role: string;
  avatar: string;
  accountUrl: string;
  accountState: string;
}

// Reads the logged-in WordPress user from the data PHP passes to the page.
function readUser(): ChipUser {
  const w = typeof window !== 'undefined' ? (window as any) : {};
  const data = w.imgsentry_data || w.imgsentryData || null;
  if (!data) {
    // Dev preview (no WordPress): sample values only.
    return { name: 'John Doe', role: 'Administrator', avatar: '', accountUrl: '', accountState: 'connected' };
  }
  const u = data.current_user || {};
  return {
    name: String(u.name || ''),
    role: String(u.role || ''),
    avatar: String(u.avatar || ''),
    accountUrl: String(u.account_url || ''),
    accountState: String(u.account_state || 'connected'),
  };
}

// Header chip: avatar, name and role of the logged-in user. Click opens the Freemius Account page.
export const UserMenuChip: React.FC<UserMenuChipProps> = () => {
  const user = readUser();
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = user.avatar !== '' && !imgFailed;
  const linked = user.accountUrl !== '';
  const needsConnect = user.accountState !== 'connected';

  const className = `flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full pl-1.5 pr-4 py-1 hover:bg-slate-50 dark:hover:bg-[#1e293b] transition-all shadow-sm no-underline ${linked ? 'cursor-pointer' : 'cursor-default'}`;

  const content = (
    <>
      <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden border border-white dark:border-slate-600 flex items-center justify-center shrink-0">
        {showImg ? (
          <img src={user.avatar} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
        ) : (
          <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        )}
      </span>
      <span className="flex flex-col text-left">
        <span className="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-none">{user.name}</span>
        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter">{user.role}</span>
      </span>
      {needsConnect && (
        <span className="ml-1 px-2 py-0.5 rounded-full bg-[#A61E69] text-white text-[9px] font-black uppercase tracking-tight leading-none">Connect</span>
      )}
    </>
  );

  return linked ? (
    <a href={user.accountUrl} title={needsConnect ? 'Connect your account' : 'Open your account'} className={className}>
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
};
