import React, { useEffect } from 'react';
import { Lock, X } from 'lucide-react';

export interface ProFeatures {
  trash_bulk_actions: boolean;
  trash_auto_purge: boolean;
  duplicate_unlimited: boolean;
  file_manager: boolean;
  scheduled_scan: boolean;
  auto_trash_unused: boolean;
  duplicate_replace_refs: boolean;
  webhook: boolean;
  media_trends: boolean;
  local_fallback: boolean;
}

export type ImgSentryPlan = 'free' | 'business' | 'professional';

export interface ProFeaturesResult {
  isPro: boolean;
  plan: ImgSentryPlan;
  upgradeUrl: string;
  features: ProFeatures;
  connected: boolean;
}

export function getProFeatures(): ProFeaturesResult {
  const data = typeof window !== 'undefined'
    ? (window as any).imgsentry_data || (window as any).imgsentryData
    : undefined;

  const connected = Boolean(data);
  if (!connected) {
    return {
      isPro: true,
      plan: 'professional',
      upgradeUrl: '',
      features: { trash_bulk_actions: true, trash_auto_purge: true, duplicate_unlimited: true, file_manager: true, scheduled_scan: true, auto_trash_unused: true, duplicate_replace_refs: true, webhook: true, media_trends: true, local_fallback: true },
      connected: false,
    };
  }

  const raw = data.features;
  const hasFeatures = raw && typeof raw === 'object';
  const features: ProFeatures = hasFeatures
    ? {
        trash_bulk_actions: Boolean(raw.trash_bulk_actions),
        trash_auto_purge: Boolean(raw.trash_auto_purge),
        duplicate_unlimited: Boolean(raw.duplicate_unlimited),
        file_manager: Boolean(raw.file_manager),
        scheduled_scan: Boolean(raw.scheduled_scan),
        auto_trash_unused: Boolean(raw.auto_trash_unused),
        duplicate_replace_refs: Boolean(raw.duplicate_replace_refs),
        webhook: Boolean(raw.webhook),
        media_trends: Boolean(raw.media_trends),
        local_fallback: Boolean(raw.local_fallback),
      }
    : { trash_bulk_actions: true, trash_auto_purge: true, duplicate_unlimited: true, file_manager: true, scheduled_scan: true, auto_trash_unused: true, duplicate_replace_refs: true, webhook: true, media_trends: true, local_fallback: true };

  const isPro = Boolean(data.is_pro ?? data.isPro ?? (hasFeatures ? false : true));
  const upgradeUrl = typeof (data.upgrade_url ?? data.upgradeUrl) === 'string'
    ? (data.upgrade_url ?? data.upgradeUrl).trim()
    : '';

  const rawPlan = data.plan;
  const plan: ImgSentryPlan =
    rawPlan === 'business' || rawPlan === 'professional' || rawPlan === 'free'
      ? rawPlan
      : (isPro ? 'professional' : 'free');

  return { isPro, plan, upgradeUrl, features, connected: true };
}

/**
 * Build the pricing-page URL for one click: the server URL (already has utm_source, current_plan and plan)
 * plus where the click happened (utm_medium) and the locked feature (feature). Never adds personal data.
 */
export function buildUpgradeUrl(baseUrl: string, medium: string, feature?: string): string {
  if (!baseUrl) return '';
  try {
    const url = new URL(baseUrl, typeof window !== 'undefined' ? window.location.href : undefined);
    if (medium) url.searchParams.set('utm_medium', medium);
    if (feature) url.searchParams.set('feature', feature);
    return url.toString();
  } catch (e) {
    return baseUrl;
  }
}

/**
 * THE one way every Upgrade button opens the pricing page: always a NEW browser tab,
 * never inside WordPress admin.
 */
export function openUpgrade(medium: string, feature?: string, overrideBaseUrl?: string): void {
  const base = (overrideBaseUrl && overrideBaseUrl.trim()) || getProFeatures().upgradeUrl;
  const target = buildUpgradeUrl(base, medium, feature);
  if (!target || typeof window === 'undefined') return;
  window.open(target, '_blank', 'noopener,noreferrer');
}

export function isProRequiredError(json: any): boolean {
  return json?.success === false && json?.data?.code === 'pro_required';
}

export interface ProLockBadgeProps {
  isDarkMode?: boolean;
  label?: string;
}

export const ProLockBadge: React.FC<ProLockBadgeProps> = ({ isDarkMode = false, label = 'PRO' }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
        isDarkMode
          ? 'bg-[#A61E69]/20 text-[#f8fafc] border-[#A61E69]/40'
          : 'bg-[#A61E69]/10 text-[#A61E69] border-[#A61E69]/30'
      }`}
    >
      <Lock className="w-3 h-3 text-[#A61E69]" />
      <span>{label}</span>
    </span>
  );
};

export interface UpgradePromptModalProps {
  open: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  title: string;
  message: string;
  upgradeUrl?: string;
  /** Where this modal is shown (becomes utm_medium). */
  context?: string;
  /** Locked feature key (becomes the feature query arg). */
  feature?: string;
}

export const UpgradePromptModal: React.FC<UpgradePromptModalProps> = ({
  open,
  onClose,
  isDarkMode = false,
  title,
  message,
  upgradeUrl = '',
  context = 'upgrade_modal',
  feature,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const hasUpgradeUrl = Boolean(upgradeUrl && upgradeUrl.trim());

  return (
    <div
      className="fixed inset-0 z-[100000100] flex items-center justify-center p-4 font-sans"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-prompt-modal-title"
    >
      <div
        className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl relative transition-all ${
          isDarkMode ? 'bg-[#1e293b] border-[#334155] text-[#f8fafc]' : 'bg-white border-gray-200 text-gray-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors ${
            isDarkMode ? 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#334155]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          }`}
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(166, 30, 105, 0.15)', color: '#A61E69' }}
          >
            <Lock className="w-5 h-5 text-[#A61E69]" />
          </div>
          <h3 id="upgrade-prompt-modal-title" className="text-lg font-bold leading-tight">
            {title}
          </h3>
        </div>

        <p className={`text-sm mb-6 leading-relaxed ${isDarkMode ? 'text-[#94a3b8]' : 'text-gray-500'}`}>
          {message}
        </p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDarkMode
                ? 'bg-[#0f172a] text-[#94a3b8] hover:text-[#f8fafc] border border-[#334155] hover:bg-[#334155]'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
            }`}
          >
            Not now
          </button>

          {hasUpgradeUrl && (
            <button
              type="button"
              onClick={() => openUpgrade(context, feature, upgradeUrl)}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors shadow-sm inline-flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: '#A61E69' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#8F1B5A')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#A61E69')}
            >
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
