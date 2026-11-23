import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Trash2, CloudOff } from 'lucide-react';
import type { PluginSettings } from '../types';
import { getProFeatures, ProLockBadge, openUpgrade } from './ProLock';

interface Props {
  formData: PluginSettings;
  handleChange: (key: keyof PluginSettings, value: any) => void;
}

interface Usage {
  count: number;
  bytes: number;
}

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const getWpData = (): any =>
  typeof window !== 'undefined' ? (window as any).imgsentry_data || (window as any).imgsentryData : null;

const callAjax = async (action: string): Promise<any> => {
  const wp = getWpData();
  if (!wp || !(wp.ajax_url || wp.ajaxUrl) || !wp.nonce) return null;
  const fd = new FormData();
  fd.append('action', action);
  fd.append('nonce', wp.nonce);
  const res = await fetch(wp.ajax_url || wp.ajaxUrl, { method: 'POST', body: fd });
  return res.json();
};

/**
 * Settings block for the cloud optimizer:
 * - how much disk the original-image backups use, and a "delete all backups" button
 * - what to do when the ImgSentry server cannot be reached
 */
export const CloudBackupSettings: React.FC<Props> = ({ formData, handleChange }) => {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  const loadUsage = useCallback(async () => {
    try {
      const json = await callAjax('imgsentry_get_backup_usage');
      if (json && json.success && json.data) setUsage(json.data as Usage);
    } catch (e) {
      /* ignore: the box simply stays empty */
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const deleteAll = async () => {
    setBusy(true);
    setMessage('');
    try {
      const json = await callAjax('imgsentry_delete_all_backups');
      if (json && json.success) {
        setUsage(json.data.usage as Usage);
        setMessage(`Deleted ${json.data.deleted} backup file(s).`);
      } else {
        setMessage((json && json.data && json.data.message) || 'Could not delete the backups.');
      }
    } catch (e) {
      setMessage('Could not delete the backups.');
    }
    setBusy(false);
    setConfirming(false);
  };

  // Optimizing on the site when the server is unreachable is a Business / Professional feature.
  const fallbackLocked = !getProFeatures().features.local_fallback;
  const fallbackOn = !fallbackLocked && formData.cloudFallbackEnabled !== false;

  return (
    <div className="pt-4 border-t border-slate-200/80 dark:border-[#243044] space-y-4">
      {/* Backup disk usage */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <HardDrive className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Original image backups on your site</div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal mt-0.5">
              Before an image is replaced, ImgSentry keeps the original on your own site, so you can restore it. Backups never leave your site.
            </p>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1.5">
              {usage ? `${usage.count} backup file(s) using ${formatSize(usage.bytes)}` : 'Checking disk usage…'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!confirming ? (
            <button
              type="button"
              disabled={busy || !usage || usage.count === 0}
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete all backups
            </button>
          ) : (
            <>
              <span className="text-[11px] text-red-700 dark:text-red-300 font-semibold">
                Images stay optimized, but you can no longer restore the originals. Delete all backups?
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={deleteAll}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? 'Deleting…' : 'Yes, delete all'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300"
              >
                Cancel
              </button>
            </>
          )}
          {message && <span className="text-[11px] text-slate-600 dark:text-slate-400">{message}</span>}
        </div>
      </div>

      {/* Server outage fallback */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <CloudOff className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <span>If the ImgSentry server is not reachable</span>
              {fallbackLocked && <ProLockBadge />}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal mt-0.5">
              ImgSentry first retries for a few minutes. If the server is still down, it can optimize on your own site with your hosting&apos;s image library (slower, uses your server resources, and the results can differ). This is turned on by default on the Business and Professional plans.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={fallbackOn}
            onChange={(e) => {
              // Free plan: can never be switched on (the Free build has no fallback code).
              if (fallbackLocked) {
                openUpgrade('settings_lock', 'local_fallback');
                return;
              }
              handleChange('cloudFallbackEnabled' as keyof PluginSettings, e.target.checked);
            }}
          />
          Optimize on my site when the server is unreachable
        </label>
        {fallbackOn && (
          <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
            Daily limit for this:
            <select
              value={formData.cloudFallbackDailyCap ?? 200}
              onChange={(e) => handleChange('cloudFallbackDailyCap' as keyof PluginSettings, parseInt(e.target.value, 10))}
              className="text-xs p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value={50}>50 images</option>
              <option value={200}>200 images (default)</option>
              <option value={500}>500 images</option>
              <option value={2000}>2,000 images</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
};