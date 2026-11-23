import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ShieldCheck,
  Search,
  X,
  Plus,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Save,
  ChevronDown,
  Lock,
  Trash2,
} from 'lucide-react';

interface Capability {
  key: string;
  label: string;
}

interface Role {
  slug: string;
  label: string;
}

interface PermissionUser {
  id: number;
  display_name: string;
  user_login: string;
  role?: string;
  role_slug?: string;
}

interface Rules {
  version?: number;
  roles: Record<string, string[]>;
  users: Record<string, Record<string, boolean>>;
}

interface PermissionsManagerProps {
  isDarkMode: boolean;
  restrictToAdmins?: boolean;
  onToggleRestrict?: () => void;
  settingsDirty?: boolean;
  onSaveSettings?: () => void;
  onDiscardSettings?: () => void;
}

export default function PermissionsManager({
  isDarkMode,
  restrictToAdmins,
  onToggleRestrict,
  settingsDirty,
  onSaveSettings,
  onDiscardSettings,
}: PermissionsManagerProps) {
  // Theme palette based on isDarkMode (no dark: variant classes)
  const cardBg = isDarkMode ? 'bg-[#1e293b]' : 'bg-white';
  const borderColor = isDarkMode ? 'border-[#334155]' : 'border-gray-200';
  const textColor = isDarkMode ? 'text-[#f8fafc]' : 'text-gray-900';
  const mutedTextColor = isDarkMode ? 'text-[#94a3b8]' : 'text-gray-500';

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [adminOnly, setAdminOnly] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rules, setRules] = useState<Rules>({ roles: {}, users: {} });
  const [savedRulesJson, setSavedRulesJson] = useState<string>('');

  // Map of userId -> PermissionUser info for UI display
  const [userMap, setUserMap] = useState<Record<string, PermissionUser>>({});

  // User search state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PermissionUser[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // UI state: picker for a new override, which user cards are expanded
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [userOptions, setUserOptions] = useState<PermissionUser[]>([]);
  const [userOptionsState, setUserOptionsState] = useState<'idle' | 'loading' | 'ready' | 'search'>('idle');
  const [openUsers, setOpenUsers] = useState<Record<string, boolean>>({});

  // Saving state & feedback
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const getImgSentryData = () => {
    return typeof window !== 'undefined'
      ? ((window as any).imgsentry_data || (window as any).imgsentryData)
      : null;
  };

  // Clean empty arrays/objects before saving or comparing
  const cleanRules = useCallback((rawRules: Rules): Rules => {
    const cleaned: Rules = {
      version: 1,
      roles: {},
      users: {},
    };

    if (rawRules.roles) {
      Object.entries(rawRules.roles).forEach(([roleSlug, caps]) => {
        if (Array.isArray(caps)) {
          const uniqueCaps = Array.from(new Set(caps.filter(Boolean)));
          if (uniqueCaps.length > 0) {
            cleaned.roles[roleSlug] = uniqueCaps;
          }
        }
      });
    }

    if (rawRules.users) {
      Object.entries(rawRules.users).forEach(([userId, userCaps]) => {
        if (userCaps && typeof userCaps === 'object') {
          const cleanCaps: Record<string, boolean> = {};
          Object.entries(userCaps).forEach(([capKey, val]) => {
            if (typeof val === 'boolean') {
              cleanCaps[capKey] = val;
            }
          });
          if (Object.keys(cleanCaps).length > 0) {
            cleaned.users[userId] = cleanCaps;
          }
        }
      });
    }

    return cleaned;
  }, []);

  // Compute dirty state
  const isDirty = useMemo(() => {
    if (!savedRulesJson) return false;
    return JSON.stringify(cleanRules(rules)) !== savedRulesJson;
  }, [rules, savedRulesJson, cleanRules]);

  // Window beforeunload warning when dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // Fetch initial permissions
  const fetchPermissions = useCallback(async () => {
    const dataObj = getImgSentryData();
    const ajaxUrl = dataObj?.ajax_url || dataObj?.ajaxUrl;
    const nonce = dataObj?.nonce || '';

    if (!ajaxUrl) {
      setIsLoading(false);
      setLoadError('WordPress AJAX endpoint not found (window.imgsentry_data).');
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setFeedback(null);

    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_permissions');
      fd.append('nonce', nonce);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();

      if (json.success && json.data) {
        const d = json.data;
        setCapabilities(d.capabilities || []);
        setAdminOnly(d.admin_only || []);
        setRoles(d.roles || []);

        const initialRules: Rules = {
          version: d.rules?.version || 1,
          roles: d.rules?.roles || {},
          users: d.rules?.users || {},
        };
        setRules(initialRules);
        setSavedRulesJson(JSON.stringify(cleanRules(initialRules)));

        const newMap: Record<string, PermissionUser> = {};
        if (Array.isArray(d.users)) {
          d.users.forEach((u: PermissionUser) => {
            newMap[String(u.id)] = u;
          });
        }
        setUserMap(newMap);
      } else {
        setLoadError(json.data?.message || 'Failed to load permissions configuration.');
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Network error loading permissions.');
    } finally {
      setIsLoading(false);
    }
  }, [cleanRules]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Debounced search for non-admin users
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      const dataObj = getImgSentryData();
      const ajaxUrl = dataObj?.ajax_url || dataObj?.ajaxUrl;
      const nonce = dataObj?.nonce || '';
      if (!ajaxUrl) return;

      setIsSearching(true);
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_search_permission_users');
        fd.append('nonce', nonce);
        fd.append('term', query);

        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();

        if (json.success && Array.isArray(json.data)) {
          setSearchResults(json.data);
          setUserMap((prev) => {
            const updated = { ...prev };
            json.data.forEach((u: PermissionUser) => {
              updated[String(u.id)] = u;
            });
            return updated;
          });
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchTerm]);

  // Load the user list for the "Add user override" dropdown (falls back to search for big sites)
  const userListRequestedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!pickerOpen || userListRequestedRef.current) return;
    userListRequestedRef.current = true;
    const dataObj = getImgSentryData();
    const ajaxUrl = dataObj?.ajax_url || dataObj?.ajaxUrl;
    const nonce = dataObj?.nonce || '';
    if (!ajaxUrl) {
      setUserOptionsState('search');
      return;
    }
    setUserOptionsState('loading');
    (async () => {
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_list_permission_users');
        fd.append('nonce', nonce);
        const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success && json.data && Array.isArray(json.data.users) && !json.data.truncated) {
          setUserOptions(json.data.users);
          setUserOptionsState('ready');
        } else {
          setUserOptionsState('search');
        }
      } catch {
        setUserOptionsState('search');
      }
    })();
  }, [pickerOpen]);

  // Role capability toggle
  const handleRoleCapToggle = (roleSlug: string, capKey: string) => {
    setRules((prev) => {
      const currentCaps = prev.roles[roleSlug] || [];
      const hasCap = currentCaps.includes(capKey);
      const updatedCaps = hasCap
        ? currentCaps.filter((k) => k !== capKey)
        : [...currentCaps, capKey];

      return {
        ...prev,
        roles: {
          ...prev.roles,
          [roleSlug]: updatedCaps,
        },
      };
    });
  };

  // Add user to override list
  const handleAddUser = (user: PermissionUser) => {
    const idStr = String(user.id);
    setUserMap((prev) => ({ ...prev, [idStr]: user }));
    setRules((prev) => ({
      ...prev,
      users: {
        ...prev.users,
        [idStr]: prev.users[idStr] || {},
      },
    }));
    setSearchTerm('');
    setSearchResults([]);
    setPickerOpen(false);
    setOpenUsers((prev) => ({ ...prev, [idStr]: true }));
  };

  // Remove user from override list
  const handleRemoveUser = (userId: string) => {
    setRules((prev) => {
      const updatedUsers = { ...prev.users };
      delete updatedUsers[userId];
      return { ...prev, users: updatedUsers };
    });
  };

  // Change user capability 3-state setting
  const handleUserCapChange = (userId: string, capKey: string, value: 'inherit' | 'allow' | 'deny') => {
    setRules((prev) => {
      const userCaps = { ...(prev.users[userId] || {}) };
      if (value === 'inherit') {
        delete userCaps[capKey];
      } else if (value === 'allow') {
        userCaps[capKey] = true;
      } else if (value === 'deny') {
        userCaps[capKey] = false;
      }
      return {
        ...prev,
        users: {
          ...prev.users,
          [userId]: userCaps,
        },
      };
    });
  };

  // Save rules
  const handleSave = async () => {
    const dataObj = getImgSentryData();
    const ajaxUrl = dataObj?.ajax_url || dataObj?.ajaxUrl;
    const nonce = dataObj?.nonce || '';

    if (!ajaxUrl) {
      setFeedback({ type: 'error', message: 'AJAX endpoint unavailable.' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const cleaned = cleanRules(rules);
      const fd = new FormData();
      fd.append('action', 'imgsentry_save_permissions');
      fd.append('nonce', nonce);
      fd.append('rules', JSON.stringify(cleaned));

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();

      if (json.success) {
        const returnedRules: Rules = json.data?.rules || cleaned;
        setRules(returnedRules);
        setSavedRulesJson(JSON.stringify(cleanRules(returnedRules)));
        setFeedback({
          type: 'success',
          message: json.data?.message || 'Permissions saved successfully.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: json.data?.message || 'Failed to save permissions.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Network error saving permissions.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`p-8 rounded-lg border ${cardBg} ${borderColor} flex flex-col items-center justify-center min-h-[300px]`}>
        <Loader2 className="w-8 h-8 text-[#A61E69] animate-spin mb-3" />
        <span className={`text-sm ${mutedTextColor}`}>Loading permissions configuration...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`p-6 rounded-lg border ${cardBg} ${borderColor} flex flex-col items-center justify-center min-h-[250px] text-center`}>
        <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
        <p className={`text-sm font-medium ${textColor} mb-1`}>Failed to Load Permissions</p>
        <p className={`text-xs ${mutedTextColor} max-w-md mb-4`}>{loadError}</p>
        <button
          onClick={fetchPermissions}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[#A61E69] hover:bg-[#8F1B5A] text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const configuredUserIds = Object.keys(rules.users || {});
  const anyDirty = isDirty || Boolean(settingsDirty);
  const busy = isSaving;

  // Group capabilities for the table (display only; keys come from the server).
  const groupOf = (key: string): string => {
    if (key === 'dashboard') return 'Overview';
    if (key.startsWith('trash') || key === 'unused_trash') return 'Trash';
    if (['scanner', 'used_files', 'unused_files', 'duplicate', 'optimization'].includes(key)) return 'Scanning & files';
    return 'Other';
  };
  const GROUP_ORDER = ['Overview', 'Scanning & files', 'Trash', 'Other'];
  const capGroups = GROUP_ORDER
    .map((g) => ({ name: g, items: capabilities.filter((c) => groupOf(c.key) === g) }))
    .filter((g) => g.items.length > 0);

  const handleRoleSelectAll = (roleSlug: string) => {
    setRules((prev) => {
      const current = prev.roles[roleSlug] || [];
      const allOn = capabilities.length > 0 && capabilities.every((c) => current.includes(c.key));
      return {
        ...prev,
        roles: { ...prev.roles, [roleSlug]: allOn ? [] : capabilities.map((c) => c.key) },
      };
    });
  };

  const handleSaveAll = async () => {
    if (settingsDirty && onSaveSettings) {
      onSaveSettings();
      if (!isDirty) {
        setFeedback({ type: 'success', message: 'Settings saved.' });
      }
    }
    if (isDirty) {
      await handleSave();
    }
  };

  const handleDiscardAll = () => {
    if (savedRulesJson) {
      try {
        setRules(JSON.parse(savedRulesJson));
      } catch {
        /* keep current rules */
      }
    }
    if (settingsDirty && onDiscardSettings) onDiscardSettings();
    setFeedback(null);
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const titleCls = 'font-bold text-gray-900 dark:text-white!';
  const subCls = 'text-gray-500 dark:text-slate-400';
  const cardCls = 'rounded-2xl border border-gray-200 dark:border-[#243044] bg-white dark:bg-[#111827] shadow-2xs';
  const lineCls = 'border-gray-100 dark:border-[#1a2436]';

  const CheckBox = ({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] inline-flex items-center justify-center align-middle cursor-pointer transition-colors p-0 ${
        checked
          ? 'bg-[#A61E69] border-[#A61E69]'
          : 'bg-white dark:bg-[#1e293b] border-slate-300 dark:border-slate-600 hover:border-[#A61E69]'
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* One heading for the whole page */}
      <div>
        <h2 className={`text-xl ${titleCls}`}>Permissions</h2>
        <p className={`text-[13px] mt-0.5 ${subCls}`}>
          Choose who can open ImgSentry and what each role or person is allowed to do.
        </p>
      </div>

      {/* Inline feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-75 cursor-pointer" aria-label="Dismiss feedback">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Access */}
      <section className={cardCls}>
        <div className="flex items-center justify-between gap-5 px-5 py-3.5">
          <div>
            <div className="text-[13px] font-semibold text-gray-900 dark:text-slate-100">Restrict access to Administrators only</div>
            <p className={`text-xs mt-0.5 ${subCls}`}>Only the Administrator role can open this ImgSentry panel.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(restrictToAdmins)}
            aria-label="Restrict access to Administrators only"
            onClick={onToggleRestrict}
            className={`w-10 h-[22px] rounded-full relative shrink-0 cursor-pointer transition-colors p-0 border-0 ${
              restrictToAdmins ? 'bg-[#A61E69]' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white transition-transform ${restrictToAdmins ? 'translate-x-[18px]' : ''}`} />
          </button>
        </div>
        <div className={`flex items-center justify-between gap-5 px-5 py-3.5 border-t ${lineCls}`}>
          <div>
            <div className="text-[13px] font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
              <span>Nonce verification</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Lock className="w-2.5 h-2.5" />
                Always on
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${subCls}`}>CSRF protection is a core security rule and cannot be turned off.</p>
          </div>
          <span
            className="w-10 h-[22px] rounded-full relative shrink-0 bg-[#A61E69] opacity-50 cursor-not-allowed"
            title="Always enabled"
            aria-hidden="true"
          >
            <span className="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white translate-x-[18px]" />
          </span>
        </div>
      </section>

      {/* 2. Role access */}
      <section className={cardCls}>
        <div className={`px-5 py-4 border-b ${lineCls}`}>
          <h3 className={`text-sm ${titleCls}`}>Role access</h3>
          <p className={`text-xs mt-0.5 ${subCls}`}>Tick what each role may do. No tick means no access.</p>
        </div>
        <div className="mx-5 mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border-l-[3px] border-l-[#A61E69] bg-pink-50/70 dark:bg-[#A61E69]/10 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-[#A61E69] shrink-0 mt-0.5" />
          <span>
            Administrators always have full access. Settings, Logs and Reports are Administrator-only. File Manager access is managed
            in the File Manager settings. A rule for one person overrides the role rule.
          </span>
        </div>
        <div className="px-5 pt-4 pb-2 overflow-x-auto">
          <table className="w-full border-collapse min-w-[520px]">
            <thead>
              <tr>
                <th className="text-left text-[11px] uppercase tracking-wider font-bold text-slate-400 py-2 px-1.5">Capability</th>
                {roles.map((role) => (
                  <th key={role.slug} className="text-center text-[11px] uppercase tracking-wider font-bold text-slate-400 py-2 px-1.5">
                    {role.label}
                    <button
                      type="button"
                      onClick={() => handleRoleSelectAll(role.slug)}
                      className="block w-full mt-1 text-[10px] font-semibold normal-case tracking-normal text-[#A61E69] dark:text-pink-400 cursor-pointer bg-transparent border-0 p-0"
                    >
                      select all
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {capGroups.map((group) => (
                <React.Fragment key={group.name}>
                  <tr>
                    <td
                      colSpan={roles.length + 1}
                      className="bg-slate-50 dark:bg-[#1a2436] text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2.5 py-1.5"
                    >
                      {group.name}
                    </td>
                  </tr>
                  {group.items.map((cap) => (
                    <tr key={cap.key} className={`border-t ${lineCls}`}>
                      <td className="py-2.5 px-1.5">
                        <div className="text-[13px] font-semibold text-gray-900 dark:text-slate-100">{cap.label}</div>
                        <div className="text-[10.5px] font-mono text-slate-400">{cap.key}</div>
                      </td>
                      {roles.map((role) => (
                        <td key={role.slug} className="text-center py-2.5 px-1.5">
                          <CheckBox
                            checked={Boolean(rules.roles[role.slug]?.includes(cap.key))}
                            onClick={() => handleRoleCapToggle(role.slug, cap.key)}
                            label={`Grant ${cap.label} to ${role.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. User overrides */}
      <section className={cardCls}>
        <div className={`flex items-center justify-between gap-4 px-5 py-4 border-b ${lineCls}`}>
          <div>
            <h3 className={`text-sm ${titleCls}`}>User overrides</h3>
            <p className={`text-xs mt-0.5 ${subCls}`}>Give one person different access than their role. Administrators are not listed.</p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={pickerOpen}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add user override</span>
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* New override: pick a user */}
          {pickerOpen && (
            <div className="rounded-2xl border border-gray-200 dark:border-[#243044] bg-white dark:bg-[#111827]">
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-[#1a2436] rounded-2xl">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">If user is</span>
                {userOptionsState === 'loading' || userOptionsState === 'idle' ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A61E69]" />
                    <span>Loading users...</span>
                  </div>
                ) : userOptionsState === 'ready' ? (
                  userOptions.filter((u) => !configuredUserIds.includes(String(u.id))).length === 0 ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      No more users to add. Administrators are never listed.
                    </span>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => {
                        const picked = userOptions.find((u) => String(u.id) === e.target.value);
                        if (picked) handleAddUser(picked);
                      }}
                      className="text-xs flex-1 max-w-sm"
                      aria-label="Choose a user"
                    >
                      <option value="">Select a user…</option>
                      {userOptions
                        .filter((u) => !configuredUserIds.includes(String(u.id)))
                        .map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.display_name} ({u.user_login}){u.role ? ` — ${u.role}` : ''}
                          </option>
                        ))}
                    </select>
                  )
                ) : (
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Type a name or username (min 2 letters)"
                    style={{ paddingLeft: 34, paddingRight: 30, height: 34 }}
                    className="w-full text-xs rounded-lg border focus:outline-none"
                  />
                  {isSearching && <Loader2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#A61E69]" />}

                  {searchTerm.trim().length >= 2 && !isSearching && (
                    <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-[#243044] bg-white dark:bg-[#111827] shadow-lg max-h-60 overflow-y-auto">
                      {searchResults.length === 0 ? (
                        <div className="p-3 text-xs text-center text-slate-500 dark:text-slate-400">No eligible non-administrator users found.</div>
                      ) : (
                        searchResults.map((user) => {
                          const added = configuredUserIds.includes(String(user.id));
                          return (
                            <button
                              key={user.id}
                              type="button"
                              disabled={added}
                              onClick={() => handleAddUser(user)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-[#1a2436] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-transparent border-0"
                            >
                              <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                                {initials(user.display_name || user.user_login)}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="font-semibold text-gray-900 dark:text-slate-100">{user.display_name}</span>{' '}
                                <span className="text-slate-500 dark:text-slate-400">@{user.user_login}</span>
                              </span>
                              {added && <span className="text-[11px] text-slate-400">Added</span>}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => { setPickerOpen(false); setSearchTerm(''); setSearchResults([]); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/50 cursor-pointer bg-transparent border-0"
                  title="Cancel"
                  aria-label="Cancel adding a user"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {configuredUserIds.length === 0 && !pickerOpen && (
            <div className="text-center px-4 py-8 rounded-2xl border border-dashed border-gray-200 dark:border-[#243044] text-xs text-slate-500 dark:text-slate-400">
              No user overrides yet. Everyone follows their role. Click “Add user override” to change one person.
            </div>
          )}

          {configuredUserIds.map((userId) => {
            const userInfo = userMap[userId] || {
              id: Number(userId),
              display_name: `User #${userId}`,
              user_login: `user_${userId}`,
            };
            const userCaps = rules.users[userId] || {};
            const vals = Object.values(userCaps);
            const allowed = vals.filter((v) => v === true).length;
            const denied = vals.filter((v) => v === false).length;
            const isOpen = openUsers[userId] === true;

            return (
              <div key={userId} className="rounded-2xl border border-gray-200 dark:border-[#243044] overflow-hidden bg-white dark:bg-[#111827]">
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-[#1a2436] cursor-pointer"
                  onClick={() => setOpenUsers((p) => ({ ...p, [userId]: !isOpen }))}
                >
                  <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                    {initials(userInfo.display_name || userInfo.user_login)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-gray-900 dark:text-slate-100 truncate">
                      {userInfo.display_name}
                      {userInfo.role && (
                        <span className="ml-1.5 align-middle px-1.5 py-px rounded-md text-[10px] font-bold uppercase tracking-wide bg-pink-50 text-[#A61E69] dark:bg-[#A61E69]/15 dark:text-pink-300">
                          {userInfo.role}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">@{userInfo.user_login}</div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {allowed > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{allowed} allowed</span>}
                    {denied > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{denied} denied</span>}
                    {allowed === 0 && denied === 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Same as role</span>}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveUser(userId); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer bg-transparent border-0 shrink-0"
                    title="Remove override for this user"
                    aria-label={`Remove override for ${userInfo.display_name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {isOpen && (
                  <div className={`px-4 pb-3 border-t ${lineCls}`}>
                    {capabilities.map((cap, idx) => {
                      const val = userCaps[cap.key];
                      const state: 'inherit' | 'allow' | 'deny' = val === true ? 'allow' : val === false ? 'deny' : 'inherit';
                      const opts: { v: 'inherit' | 'allow' | 'deny'; label: string; on: string }[] = [
                        { v: 'inherit', label: 'Inherit', on: 'bg-slate-200 text-slate-900 dark:bg-slate-600 dark:text-white' },
                        { v: 'allow', label: 'Allow', on: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
                        { v: 'deny', label: 'Deny', on: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
                      ];
                      return (
                        <div key={cap.key} className={`flex items-center justify-between gap-3 py-2.5 ${idx > 0 ? `border-t ${lineCls}` : ''}`}>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-gray-900 dark:text-slate-100 truncate">{cap.label}</div>
                            <div className="text-[11px] text-slate-400">
                              {state === 'inherit'
                                ? userInfo.role_slug
                                  ? `Follows role · role ${rules.roles[userInfo.role_slug]?.includes(cap.key) ? 'allows' : 'denies'}`
                                  : 'Follows the role'
                                : state === 'allow'
                                ? 'Allowed for this user'
                                : 'Denied for this user'}
                            </div>
                          </div>
                          <div role="group" aria-label={`${cap.label} for ${userInfo.display_name}`} className="inline-flex rounded-[10px] border border-gray-200 dark:border-[#243044] overflow-hidden shrink-0">
                            {opts.map((o, i) => (
                              <button
                                key={o.v}
                                type="button"
                                aria-pressed={state === o.v}
                                onClick={() => handleUserCapChange(userId, cap.key, o.v)}
                                className={`px-3 py-1.5 text-[11px] font-bold cursor-pointer border-0 ${i > 0 ? 'border-l border-gray-200 dark:border-[#243044]' : ''} ${
                                  state === o.v ? o.on : 'bg-white dark:bg-[#111827] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a2436]'
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* One Save button for the whole page */}
      <div className="sticky bottom-4 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4 w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-[#243044] bg-white dark:bg-[#111827] shadow-xl pl-5 pr-3 py-2.5">
          <div className="flex-1 flex items-center gap-2 text-[13px] font-semibold text-gray-800 dark:text-slate-100">
            <span className={`w-2 h-2 rounded-full ${anyDirty ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            <span>{anyDirty ? 'You have unsaved changes' : 'All changes saved'}</span>
          </div>
          <button
            type="button"
            onClick={handleDiscardAll}
            disabled={!anyDirty || busy}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 dark:border-[#243044] bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={!anyDirty || busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{busy ? 'Saving...' : 'Save permissions'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
