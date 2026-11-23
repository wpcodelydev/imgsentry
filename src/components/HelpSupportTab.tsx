import React, { useState } from 'react';
import { HelpCircle, Cpu, Mail, Send, CheckCircle2, MessageSquare, ChevronDown, ExternalLink } from 'lucide-react';

interface HelpSupportTabProps {
  isDarkMode?: boolean;
}

export const HelpSupportTab: React.FC<HelpSupportTabProps> = ({ isDarkMode }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const cardBg = isDarkMode ? 'bg-slate-800/80 border-slate-700/80 text-white' : 'bg-white border-gray-100 text-gray-900';
  const subText = isDarkMode ? 'text-slate-400' : 'text-gray-500';

  const systemStatus = (typeof window !== 'undefined' && (window as any).imgsentry_data?.system_status) || null;

  const renderPhpStatus = () => {
    if (!systemStatus) return <span className="font-mono font-bold text-gray-400">Not available</span>;
    const current = systemStatus.php_version;
    const minPhp = systemStatus.min_php || '7.4';
    const compare = (a: string, b: string) => {
      const pa = a.split(/[-.]/).map(Number);
      const pb = b.split(/[-.]/).map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
      }
      return 0;
    };
    const ok = compare(current, minPhp) >= 0;
    return (
      <span className={`font-mono font-bold ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {current} {ok ? '(OK)' : '(Update needed)'}
      </span>
    );
  };

  const renderWpStatus = () => {
    if (!systemStatus) return <span className="font-mono font-bold text-gray-400">Not available</span>;
    const current = systemStatus.wp_version;
    const minWp = systemStatus.min_wp || '5.8';
    const compare = (a: string, b: string) => {
      const pa = a.split(/[-.]/).map(Number);
      const pb = b.split(/[-.]/).map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
      }
      return 0;
    };
    const ok = compare(current, minWp) >= 0;
    return (
      <span className={`font-mono font-bold ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {current} {ok ? '(OK)' : '(Update needed)'}
      </span>
    );
  };

  const renderMemoryStatus = () => {
    if (!systemStatus) return <span className="font-mono font-bold text-gray-400">Not available</span>;
    const memStr = systemStatus.memory_limit || '512M';
    let bytes = 512 * 1024 * 1024;
    if (memStr === '-1') {
      return (
        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
          {memStr} (Unlimited, OK)
        </span>
      );
    }
    const upper = memStr.toUpperCase();
    const num = parseFloat(upper);
    if (upper.includes('G')) bytes = num * 1024 * 1024 * 1024;
    else if (upper.includes('M')) bytes = num * 1024 * 1024;
    else if (upper.includes('K')) bytes = num * 1024;
    else bytes = num;

    const isLow = bytes < 128 * 1024 * 1024;
    return (
      <span className="font-mono font-bold flex items-center gap-1.5">
        <span className={isLow ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
          {memStr} {isLow ? '(Low, 128M or more recommended)' : '(OK)'}
        </span>
      </span>
    );
  };

  const renderUploadsStatus = () => {
    if (!systemStatus) return <span className="font-mono font-bold text-gray-400">Not available</span>;
    const writable = systemStatus.uploads_writable;
    return (
      <span className={`font-mono font-bold ${writable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {writable ? 'Yes' : 'No'}
      </span>
    );
  };

  const renderCronStatus = () => {
    if (!systemStatus) return <span className="font-mono font-bold text-gray-400">Not available</span>;
    const disabled = systemStatus.cron_disabled;
    return (
      <span className={`font-mono font-bold ${!disabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        {!disabled ? 'Active' : 'Disabled (DISABLE_WP_CRON), use a server cron for scheduled tasks'}
      </span>
    );
  };

  const faqs = [
    {
      q: 'How does ImgSentry decide a file is unused?',
      a: 'ImgSentry checks where every media file is used: posts, pages, widgets, customizer settings, the site logo and icon, and supported page builders and WooCommerce data. It looks for attachment IDs and file paths in content and settings before it marks a file as unused.'
    },
    {
      q: 'Is it safe to delete files marked as Unused?',
      a: 'Trashing is reversible. Files go to the Trash Bin first and stay there for your retention period (default 7 days), so you can restore them with one click. Only Delete Permanently or an emptied trash removes them for good.'
    },
    {
      q: 'Can I set up automatic scheduled scans?',
      a: 'Yes. Open Settings, find the Scheduled Scan section, turn it on and choose how often it runs (every 7, 15, 30 or 60 days) and at what time. Scans run in the background through WP-Cron. If your host disables WP-Cron, set up a real server cron. The Enable Plugin switch must be ON.'
    },
    {
      q: 'What if a file is used somewhere ImgSentry cannot see?',
      a: 'Run a Deep Scan for the most thorough check. For files used in places outside WordPress content, such as theme files or external pages, add them to the exclusions in Settings so they are never marked unused.'
    }
  ];

  return (
    <div className="space-y-6">
      <div className={`${cardBg} rounded-2xl p-6 border shadow-xs flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold dark:text-[#e7ecf3]!">Help, System Status & Support</h2>
            <p className={`text-xs ${subText} mt-0.5`}>
              Find answers to common questions, inspect server environment readiness, or contact our support team.
            </p>
          </div>
        </div>
      </div>
      {/* System Readiness Checklist & FAQs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* System Readiness Checks (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className={`${cardBg} rounded-2xl p-5 border shadow-xs space-y-4`}>
            <h3 className="font-bold text-sm dark:text-[#e7ecf3]! border-b pb-3 border-gray-100 dark:border-slate-700 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-500" />
              <span>System & Environment Status</span>
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
                <span className="font-semibold">PHP Version</span>
                {renderPhpStatus()}
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
                <span className="font-semibold">WordPress Version</span>
                {renderWpStatus()}
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
                <span className="font-semibold">PHP Memory Limit</span>
                {renderMemoryStatus()}
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
                <span className="font-semibold">Uploads Directory Writable</span>
                {renderUploadsStatus()}
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl">
                <span className="font-semibold">WP-Cron Status</span>
                {renderCronStatus()}
              </div>
            </div>
          </div>
          {/* Need help? Card */}
          <div className={`${cardBg} rounded-2xl p-5 border shadow-xs space-y-3`}>
            <h3 className="font-bold text-sm dark:text-[#e7ecf3]! flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <span>Need help?</span>
            </h3>
            <div className="space-y-2 text-xs">
              <a
                href="https://wordpress.org/support/plugin/imgsentry/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold transition-colors"
              >
                <span>Support forum on WordPress.org</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://github.com/wpcodelydev/imgsentry/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold transition-colors"
              >
                <span>Report an issue on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
        {/* FAQs Accordion (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <h3 className="font-bold text-sm dark:text-[#e7ecf3]! flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-500" />
            <span>Frequently Asked Questions</span>
          </h3>
          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className={`${cardBg} rounded-2xl border shadow-2xs overflow-hidden transition-all`}>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-4 text-left font-bold text-xs flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-xs leading-relaxed text-gray-600 dark:text-slate-300 border-t border-gray-100 dark:border-slate-700/80 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpSupportTab;
