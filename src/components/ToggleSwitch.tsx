import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  /** Accessible name read by screen readers, e.g. "Enable Plugin". */
  label: string;
  /** 'danger' uses a red track (for destructive options). */
  tone?: 'brand' | 'danger';
  disabled?: boolean;
}

/**
 * Accessible on/off switch (real button, role="switch", keyboard friendly).
 * Looks the same as the previous div-based toggles: track + "Enabled / Disabled" text.
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  tone = 'brand',
  disabled = false,
}) => {
  const trackOn = tone === 'danger' ? 'bg-rose-600' : 'bg-[#A61E69]';
  const textOn = tone === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-800 dark:text-slate-200';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`flex items-center gap-2.5 shrink-0 rounded-full border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A61E69]/60 focus-visible:ring-offset-2 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
          checked ? trackOn : 'bg-gray-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
      <span className={`text-xs font-semibold ${checked ? textOn : 'text-gray-400'}`}>
        {checked ? 'Enabled' : 'Disabled'}
      </span>
    </button>
  );
};
