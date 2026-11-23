import React from 'react';
import { Gauge, AlertTriangle, Lock, Info } from 'lucide-react';
import { openUpgrade } from './ProLock';

export interface QuotaStatus {
  plan: 'free' | 'business' | 'professional';
  unlimited: boolean;
  images_used: number;
  images_limit: number | null;
  bytes_used: number;
  bytes_limit: number | null;
  percent: number;
  exhausted: boolean;
  domain_blocked: boolean;
  account_connected?: boolean;
  account_url?: string;
  /** 'connected' | 'skipped' (user chose Skip) | 'pending' (waiting for e-mail confirmation) | 'disconnected'. */
  account_state?: 'connected' | 'skipped' | 'pending' | 'disconnected';
  /** false when the Premium code runs but the license is not active (e.g. after "Deactivate License"). */
  license_active?: boolean;
  domain?: string;
  cycle_start?: number;
  cycle_end?: number;
  cloud?: {
    down: boolean;
    fallback_active: boolean;
    fallback_used_today: number;
  };
}

/** Quota snapshot the server put on the page (window.imgsentry_data.quota), or null (standalone preview). */
export function getInitialQuota(): QuotaStatus | null {
  if (typeof window === 'undefined') return null;
  const data = (window as any).imgsentry_data || (window as any).imgsentryData;
  const q = data && data.quota;
  return q && typeof q === 'object' ? (q as QuotaStatus) : null;
}

/** Error codes the server sends when optimization must stop for everybody in the current run. */
export function isQuotaStopCode(code: unknown): boolean {
  return (
    code === 'quota_exceeded' ||
    code === 'domain_not_allowed' ||
    code === 'account_required' ||
    code === 'invalid_license' ||
    code === 'license_inactive' ||
    code === 'plan_not_allowed' ||
    code === 'site_mismatch' ||
    code === 'cloud_unreachable' ||
    code === 'cloud_fallback_cap'
  );
}

const formatMb = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
};

const formatDate = (ts?: number): string => {
  if (!ts) return '';
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
};

interface Props {
  quota: QuotaStatus | null;
  upgradeUrl?: string;
  onUpgradeClick?: () => void;
}

/**
 * Usage bar + notification for the monthly optimization quota (Free / Business plans).
 * Shows nothing for Professional / unlimited sites and in the standalone preview.
 */
const QuotaBarInner: React.FC<Props> = ({ quota, upgradeUrl = '', onUpgradeClick }) => {
  if (!quota) return null;

  if (quota.domain_blocked) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4" role="alert">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-bold text-amber-900 dark:text-amber-200">Optimization is off on this site</div>
          <div className="text-amber-800 dark:text-amber-300 mt-0.5">
            Image optimization does not run on local, test and staging sites. It works on your live domain.
          </div>
        </div>
      </div>
    );
  }

  if (quota.account_connected === false) {
    const pending = quota.account_state === 'pending';
    return (
      <div className="flex items-start justify-between gap-3 flex-wrap rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4" role="alert">
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-bold text-amber-900 dark:text-amber-200">
              {pending ? 'Check your email to finish connecting' : 'Connect your free ImgSentry account to optimize images'}
            </div>
            <div className="text-amber-800 dark:text-amber-300 mt-0.5">
              {pending
                ? 'We are waiting for your email confirmation. If it did not arrive, connect again to resend it. All other features work without it.'
                : 'Connect your free ImgSentry account to start optimizing images. All other features work without it.'}
            </div>
          </div>
        </div>
        {quota.account_url ? (
          <button
            type="button"
            onClick={() => {
              window.location.href = quota.account_url!;
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8e1958] transition-colors self-center sm:self-auto shrink-0"
          >
            Connect account
          </button>
        ) : null}
      </div>
    );
  }

  if (quota.unlimited) return null;

  const imagesPct = quota.images_limit ? Math.min(100, (quota.images_used / quota.images_limit) * 100) : 0;
  const bytesPct = quota.bytes_limit ? Math.min(100, (quota.bytes_used / quota.bytes_limit) * 100) : 0;
  const percent = Math.max(imagesPct, bytesPct);
  const critical = quota.exhausted || percent >= 100;
  const warning = !critical && percent >= 80;

  const barColor = critical ? 'bg-red-500' : warning ? 'bg-amber-500' : 'bg-[#A61E69]';
  const renews = formatDate(quota.cycle_end);

  const upgradeBtnText = critical
    ? (quota.plan === 'business' ? 'Upgrade to Professional' : 'Upgrade')
    : (quota.plan === 'business' ? 'Upgrade to Professional' : 'Upgrade to Pro');

  const handleUpgrade = () => {
    if (onUpgradeClick) {
      onUpgradeClick();
    } else if (upgradeUrl) {
      openUpgrade('quota_bar', undefined, upgradeUrl);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-4 ${
        critical
          ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30'
          : 'border-gray-100 dark:border-[#243044] bg-white dark:bg-slate-900'
      }`}
      role={critical ? 'alert' : undefined}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {critical ? (
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          ) : (
            <Gauge className="w-4 h-4 text-[#A61E69] shrink-0" />
          )}
          <span className="text-sm font-bold text-gray-900 dark:text-slate-100">
            {critical ? 'Optimization quota used up' : 'Optimization quota'}
          </span>
        </div>
        {(critical || warning) && (upgradeUrl || onUpgradeClick) && (
          <button
            type="button"
            onClick={handleUpgrade}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8e1958] transition-colors"
          >
            <Lock className="w-3 h-3" />
            {upgradeBtnText}
          </button>
        )}
      </div>

      <div className="mt-3 h-2.5 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap text-xs text-gray-600 dark:text-slate-400">
        <span>
          <strong className="text-gray-900 dark:text-slate-200">{quota.images_used.toLocaleString()}</strong>
          {quota.images_limit ? ` / ${quota.images_limit.toLocaleString()} image files` : ' image files'}
          {'  ·  '}
          <strong className="text-gray-900 dark:text-slate-200">{formatMb(quota.bytes_used)}</strong>
          {quota.bytes_limit ? ` / ${formatMb(quota.bytes_limit)}` : ''}
        </span>
        {renews && <span>Renews {renews}</span>}
      </div>
      <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-500">
        Every WordPress image size counts as a file (approx. 5–8 per upload). Re-optimizing within the same month is free.
      </p>

      {critical && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-300">
          Image optimization is temporarily paused until your quota renews. All other ImgSentry features will continue to work normally.
        </p>
      )}
      {warning && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          You have used {Math.floor(percent)}% of this month&apos;s {quota.plan === 'business' ? 'Business' : 'Free'} quota.
        </p>
      )}
    </div>
  );
};


/**
 * Quota bar plus a notice while the ImgSentry server cannot be reached.
 */
export const OptimizationQuotaBar: React.FC<Props> = (props) => {
  const cloud = props.quota && props.quota.cloud;
  return (
    <>
      {cloud && (cloud.fallback_active || cloud.down) && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 mb-3" role="status">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-bold text-amber-900 dark:text-amber-200">
              {cloud.fallback_active ? 'Server unreachable, optimizing on your site' : 'Server not reachable, retrying'}
            </div>
            <div className="text-amber-800 dark:text-amber-300 mt-0.5">
              {cloud.fallback_active
                ? `The ImgSentry server cannot be reached, so images are optimized with your hosting's image library (${cloud.fallback_used_today} today). ImgSentry switches back to the server automatically as soon as it answers.`
                : 'The ImgSentry server did not answer. ImgSentry will retry in a few minutes before it optimizes on your site.'}
            </div>
          </div>
        </div>
      )}
      {props.quota &&
        props.quota.account_connected !== false &&
        props.quota.license_active === false &&
        props.quota.plan === 'free' && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/30 px-4 py-2.5 mb-3" role="status">
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="font-bold text-sky-900 dark:text-sky-200">Your license is inactive</span>
              <span className="text-sky-800 dark:text-sky-300">Please open your account settings to reactivate it.</span>
            </div>
            {props.quota.account_url ? (
              <button
                type="button"
                onClick={() => {
                  window.location.href = props.quota!.account_url!;
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8e1958] transition-colors shrink-0"
              >
                Manage account
              </button>
            ) : null}
          </div>
        )}
      <QuotaBarInner {...props} />
    </>
  );
};

export default OptimizationQuotaBar;
