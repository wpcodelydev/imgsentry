import React, { useState, useEffect } from 'react';
import { Folder, FolderTree, ChevronRight, ChevronDown, Check, X, AlertTriangle, Search, Loader2 } from 'lucide-react';

export interface DirectoryNode {
  name: string;
  path: string;
  isRecommended?: boolean;
  note?: string;
  /** Path inside the real uploads folder, without slashes at the ends (sent back to the server to load the sub-folders). */
  rel?: string;
  /** Server says this folder has sub-folders that are not loaded yet. */
  hasChildren?: boolean;
  children?: DirectoryNode[];
}

// Preview-only sample tree. It is used ONLY in standalone mode (standalone preview, no WordPress).
// Inside WordPress the real folders of the site's uploads directory are loaded from the server.
export const MOCK_SERVER_DIRECTORY_TREE: DirectoryNode[] = import.meta.env.DEV ? [
  {
    name: '2026',
    path: '/wp-content/uploads/2026/',
    children: [
      { name: '01', path: '/wp-content/uploads/2026/01/' },
      { name: '02', path: '/wp-content/uploads/2026/02/' },
      { name: '05', path: '/wp-content/uploads/2026/05/' },
      { name: '07', path: '/wp-content/uploads/2026/07/' }
    ]
  },
  {
    name: '2025',
    path: '/wp-content/uploads/2025/',
    children: [
      { name: '10', path: '/wp-content/uploads/2025/10/' },
      { name: '11', path: '/wp-content/uploads/2025/11/' },
      { name: '12', path: '/wp-content/uploads/2025/12/' }
    ]
  },
  {
    name: 'cache',
    path: '/wp-content/uploads/cache/',
    isRecommended: true,
    note: 'General cache output'
  },
  {
    name: 'backup',
    path: '/wp-content/uploads/backup/',
    isRecommended: true,
    note: 'Common backup output'
  },
  {
    name: 'backups',
    path: '/wp-content/uploads/backups/',
    isRecommended: true,
    note: 'Backup plugin output'
  },
  {
    name: 'woocommerce_uploads',
    path: '/wp-content/uploads/woocommerce_uploads/'
  },
  {
    name: 'wc-logs',
    path: '/wp-content/uploads/wc-logs/',
    isRecommended: true,
    note: 'WooCommerce log files'
  },
  {
    name: 'elementor',
    path: '/wp-content/uploads/elementor/',
    children: [
      { name: 'css', path: '/wp-content/uploads/elementor/css/', isRecommended: true, note: 'Compiled page CSS' },
      { name: 'thumbs', path: '/wp-content/uploads/elementor/thumbs/' }
    ]
  },
  {
    name: 'wpo-cache',
    path: '/wp-content/uploads/wpo-cache/',
    isRecommended: true,
    note: 'WP-Optimize cache'
  },
  {
    name: 'wp-rocket-cache',
    path: '/wp-content/uploads/wp-rocket-cache/',
    isRecommended: true,
    note: 'WP Rocket cache output'
  },
  {
    name: 'sites',
    path: '/wp-content/uploads/sites/'
  },
  {
    name: 'wpforms',
    path: '/wp-content/uploads/wpforms/',
    isRecommended: true,
    note: 'Form submission attachments'
  },
  {
    name: 'custom-imports',
    path: '/wp-content/uploads/custom-imports/'
  },
  {
    name: 'avatars',
    path: '/wp-content/uploads/avatars/'
  }
] : [];

// Helper to flatten directory paths for validation
export function getAllServerDirectoryPaths(nodes: DirectoryNode[] = MOCK_SERVER_DIRECTORY_TREE): string[] {
  let paths: string[] = [];
  for (const node of nodes) {
    paths.push(node.path);
    if (node.children) {
      paths = paths.concat(getAllServerDirectoryPaths(node.children));
    }
  }
  return paths;
}

interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFolder: (folderPath: string) => void;
  existingFolders: string[];
  isDarkMode?: boolean;
  /**
   * 'exclude' (default): picking a folder for the Exclusions list (saved as /wp-content/uploads/...).
   * 'private-folder': picking the File Manager "Separate or Private Folder" (real path of the folder inside the site).
   */
  purpose?: 'exclude' | 'private-folder';
}

const DEFAULT_UPLOADS_ROOT = '/wp-content/uploads/';

// Returns a copy of the tree where the folder with this "rel" got the given children.
function setChildrenByRel(nodes: DirectoryNode[], rel: string, children: DirectoryNode[]): DirectoryNode[] {
  return nodes.map(node => {
    if (node.rel === rel) {
      return { ...node, children, hasChildren: children.length > 0 };
    }
    if (node.children && node.children.length > 0 && rel.startsWith((node.rel || '') + '/')) {
      return { ...node, children: setChildrenByRel(node.children, rel, children) };
    }
    return node;
  });
}

export const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelectFolder,
  existingFolders,
  isDarkMode = false,
  purpose = 'exclude'
}) => {
  const isPrivateFolderMode = purpose === 'private-folder';
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [loadingRels, setLoadingRels] = useState<Record<string, boolean>>({});
  const [selectedNode, setSelectedNode] = useState<DirectoryNode | null>(null);
  const [treeNodes, setTreeNodes] = useState<DirectoryNode[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [truncatedRels, setTruncatedRels] = useState<Record<string, boolean>>({});
  const [uploadsRoot, setUploadsRoot] = useState<string>(DEFAULT_UPLOADS_ROOT);
  const [caseSensitive, setCaseSensitive] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [activeTab, setActiveTab] = useState<'tree' | 'custom'>('tree');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const getWpData = () => {
    const wpData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
    const ajaxUrl = wpData && (wpData.ajax_url || wpData.ajaxUrl);
    return ajaxUrl ? { ajaxUrl: ajaxUrl as string, nonce: wpData.nonce as string } : null;
  };

  const sameFolder = (a: string, b: string) => (caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase());

  // Loads the sub-folders of ONE folder from WordPress ('' = the uploads folder itself).
  const fetchFolders = async (parentRel: string) => {
    const wp = getWpData();
    if (!wp) throw new Error('no-wordpress');
    const fd = new FormData();
    fd.append('action', 'imgsentry_get_upload_folders');
    fd.append('nonce', wp.nonce);
    fd.append('parent', parentRel);
    const res = await fetch(wp.ajaxUrl, { method: 'POST', body: fd });
    const json = await res.json();
    if (json && json.success && json.data && Array.isArray(json.data.folders)) {
      return json.data as { folders: DirectoryNode[]; truncated?: boolean; uploads_root?: string; case_sensitive?: boolean };
    }
    throw new Error((json && json.data && json.data.message) || 'Could not load folders from the server.');
  };

  // Load the real top-level uploads folders from WordPress each time the dialog opens.
  // Standalone preview (no WordPress data) falls back to the sample tree.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedNode(null);
    setSearchTerm('');
    setTreeError(null);
    setErrorMsg(null);
    setExpandedNodes({});
    setLoadingRels({});
    setTruncatedRels({});
    setUploadsRoot(DEFAULT_UPLOADS_ROOT);

    if (!getWpData()) {
      setTreeNodes(MOCK_SERVER_DIRECTORY_TREE);
      return;
    }

    let cancelled = false;
    setIsLoadingTree(true);
    (async () => {
      try {
        const data = await fetchFolders('');
        if (cancelled) return;
        setTreeNodes(data.folders);
        if (data.uploads_root) setUploadsRoot(data.uploads_root);
        if (typeof data.case_sensitive === 'boolean') setCaseSensitive(data.case_sensitive);
        if (data.truncated) setTruncatedRels({ '': true });
      } catch (err: any) {
        if (!cancelled) {
          setTreeNodes([]);
          setTreeError((err && err.message && err.message !== 'no-wordpress')
            ? err.message
            : 'Could not load folders from the server. You can still type a path in "Enter Custom Path".');
        }
      } finally {
        if (!cancelled) setIsLoadingTree(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  // Opens / closes a folder. Its sub-folders are loaded from the server the first time it is opened.
  const toggleExpand = async (node: DirectoryNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = node.path;
    const opening = !expandedNodes[key];
    setExpandedNodes(prev => ({ ...prev, [key]: opening }));

    if (!opening || node.children !== undefined || node.rel === undefined || !getWpData()) return;

    setLoadingRels(prev => ({ ...prev, [key]: true }));
    try {
      const data = await fetchFolders(node.rel);
      setTreeNodes(prev => setChildrenByRel(prev, node.rel as string, data.folders));
      if (data.truncated) setTruncatedRels(prev => ({ ...prev, [node.rel as string]: true }));
    } catch (err: any) {
      setErrorMsg((err && err.message && err.message !== 'no-wordpress') ? err.message : 'Could not load this folder from the server.');
      setExpandedNodes(prev => ({ ...prev, [key]: false }));
    } finally {
      setLoadingRels(prev => ({ ...prev, [key]: false }));
    }
  };

  // Checks with the server that a typed folder really exists inside the uploads folder.
  const folderExistsOnServer = async (normalizedPath: string): Promise<boolean> => {
    const wp = getWpData();
    if (!wp) return true; // Standalone preview: nothing to check against.
    const fd = new FormData();
    fd.append('action', 'imgsentry_check_upload_folder');
    fd.append('nonce', wp.nonce);
    fd.append('path', normalizedPath);
    const res = await fetch(wp.ajaxUrl, { method: 'POST', body: fd });
    const json = await res.json();
    if (json && json.success && json.data) return !!json.data.exists;
    throw new Error((json && json.data && json.data.message) || 'Could not check the folder on the server.');
  };

  const validateAndAddFolder = async (pathToAdd: string, fromTree: boolean) => {
    setErrorMsg(null);
    if (!pathToAdd || !pathToAdd.trim()) {
      setErrorMsg(activeTab === 'tree' ? 'Select a folder from the list first.' : 'Enter a folder path first.');
      return;
    }
    let normalized = pathToAdd.trim().replace(/\\/g, '/');

    // File Manager "Separate or Private Folder": the server checks the folder when settings are saved.
    if (isPrivateFolderMode) {
      if (!normalized.startsWith('/')) normalized = '/' + normalized;
      if (!normalized.endsWith('/')) normalized += '/';
      onSelectFolder(normalized);
      onClose();
      return;
    }

    if (!normalized.startsWith('/')) {
      normalized = DEFAULT_UPLOADS_ROOT + normalized;
    }

    if (!normalized.endsWith('/')) {
      normalized += '/';
    }

    // 1. Guardrail: Root exclusion check
    const rootPaths = ['/wp-content/uploads/', '/wp-content/uploads', '/'];
    if (rootPaths.includes(normalized)) {
      setErrorMsg("You can't exclude the entire uploads folder — this would disable scanning completely. Exclude a specific subfolder instead.");
      return;
    }

    // 2. Guardrail: Duplicate check
    const isDuplicate = existingFolders.some(f => sameFolder(f, normalized) || sameFolder(f, normalized.replace(/\/$/, '')));
    if (isDuplicate) {
      setErrorMsg(`The folder path "${normalized}" is already in your exclusion list.`);
      return;
    }

    // 3. Guardrail: must be a subfolder of /wp-content/uploads/
    const isValidFormat = normalized.startsWith('/wp-content/uploads/') && normalized.length > '/wp-content/uploads/'.length;

    if (!isValidFormat) {
      setErrorMsg(`Invalid path. Folder exclusions must be within /wp-content/uploads/.`);
      return;
    }

    // 4. Guardrail: a typed folder must really exist on the server (folders picked from the tree already do)
    if (!fromTree) {
      setIsChecking(true);
      try {
        const exists = await folderExistsOnServer(normalized);
        if (!exists) {
          setErrorMsg(`The folder "${normalized}" was not found on the server. Check the spelling (folder names are case-sensitive on most servers).`);
          return;
        }
      } catch (err: any) {
        setErrorMsg((err && err.message) || 'Could not check the folder on the server.');
        return;
      } finally {
        setIsChecking(false);
      }
    }

    // Pass validated path
    onSelectFolder(normalized);
    onClose();
  };

  const term = searchTerm.trim().toLowerCase();
  const nodeOrDescendantMatches = (node: DirectoryNode): boolean => {
    if (!term) return true;
    if (node.name.toLowerCase().includes(term) || node.path.toLowerCase().includes(term)) return true;
    return !!node.children && node.children.some(nodeOrDescendantMatches);
  };

  const renderTree = (nodes: DirectoryNode[]) => {
    return (
      <div className="space-y-1 pl-2">
        {nodes.map(node => {
          if (!nodeOrDescendantMatches(node)) return null;
          const isExpanded = !!expandedNodes[node.path] || (!!term && !!node.children && node.children.length > 0);
          const isSelected = selectedNode?.path === node.path;
          const isAlreadyExcluded = !isPrivateFolderMode && existingFolders.some(f => sameFolder(f, node.path));
          const canExpand = node.children !== undefined ? node.children.length > 0 : !!node.hasChildren;
          const isLoadingChildren = !!loadingRels[node.path];

          return (
            <div key={node.path} className="select-none">
              <div
                onClick={() => {
                  setSelectedNode(node);
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs font-mono transition-colors ${
                  isSelected
                    ? 'bg-[#A61E69] text-white font-semibold shadow-2xs'
                    : isAlreadyExcluded
                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
                    : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-800 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {canExpand ? (
                    <button
                      type="button"
                      onClick={(e) => toggleExpand(node, e)}
                      className="p-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded"
                    >
                      {isLoadingChildren
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span className="w-4" />
                  )}
                  <Folder className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-amber-500'}`} />
                  <span className="truncate">{node.path}</span>
                  {node.isRecommended && !isPrivateFolderMode && (
                    <span className={`px-1.5 py-0.5 text-[9.5px] font-sans font-medium rounded ${
                      isSelected ? 'bg-indigo-700 text-white' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    }`}>
                      Recommended
                    </span>
                  )}
                </div>

                {isAlreadyExcluded && (
                  <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-400 shrink-0">
                    Already Excluded
                  </span>
                )}
              </div>

              {canExpand && isExpanded && node.children && node.children.length > 0 && (
                <div className="border-l-2 border-gray-200 dark:border-slate-700 ml-4 my-0.5">
                  {renderTree(node.children)}
                  {node.rel !== undefined && truncatedRels[node.rel] && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 px-2 py-1 font-sans">
                      Only the first 1000 folders are shown here. Use "Enter Custom Path" for the others.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const selectedLabel = selectedNode ? selectedNode.path : 'none';

  return (
    <div className="imgsentry-fm-folder-browser-modal imgsentry-folder-browser-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
      <div className={`w-full max-w-xl rounded-2xl border shadow-xl flex flex-col max-h-[90vh] ${
        isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-gray-200 text-gray-900'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-[#243044]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800">
              <FolderTree className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Server Directory Browser</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {isPrivateFolderMode
                  ? 'Browse and select a folder inside the uploads folder'
                  : 'Browse and select subdirectories under /wp-content/uploads/'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection & Search */}
        <div className="p-4 space-y-3 border-b border-gray-100 dark:border-[#243044] bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold bg-gray-200/60 dark:bg-slate-800 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => { setActiveTab('tree'); setErrorMsg(null); }}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  activeTab === 'tree' ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-2xs font-bold' : 'text-gray-600 dark:text-slate-400'
                }`}
              >
                Browse Tree
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('custom'); setErrorMsg(null); }}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  activeTab === 'custom' ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-2xs font-bold' : 'text-gray-600 dark:text-slate-400'
                }`}
              >
                Enter Custom Path
              </button>
            </div>

            {activeTab === 'tree' && (
              <div className="fm-folder-filter-wrap relative flex-1 max-w-xs flex items-center">
                <span className="fm-folder-filter-icon-slot absolute left-2.5 h-full flex items-center justify-center pointer-events-none z-10">
                  <Search className="fm-folder-filter-icon w-3.5 h-3.5 text-gray-400 dark:text-[#5b6579]" />
                </span>
                <input
                  type="text"
                  placeholder="Filter opened folders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="fm-folder-filter-input w-full text-xs pl-8.5 pr-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579]"
                />
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg text-xs flex items-start gap-2 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 min-h-[250px] max-h-[380px]">
          {activeTab === 'tree' ? (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2 break-all">
                Server Root: {uploadsRoot}
              </div>
              {!isPrivateFolderMode && uploadsRoot !== DEFAULT_UPLOADS_ROOT && (
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mb-2 leading-relaxed font-sans normal-case">
                  The uploads folder of this site is <code className="font-mono">{uploadsRoot}</code>. Rules are saved as <code className="font-mono">/wp-content/uploads/…</code> and always apply inside that folder.
                </p>
              )}
              {truncatedRels[''] && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2 font-sans">
                  This folder has more than 1000 sub-folders. Only the first 1000 are shown. Use "Enter Custom Path" for the others.
                </p>
              )}
              {isLoadingTree ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading folders...</span>
                </div>
              ) : treeError ? (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg text-xs">
                  {treeError}
                </div>
              ) : treeNodes.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-500 dark:text-slate-400">
                  No subfolders found inside the uploads folder yet.
                </div>
              ) : (
                renderTree(treeNodes)
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-800 dark:text-slate-200">
                  Custom Directory Path:
                </label>
                <input
                  type="text"
                  placeholder={isPrivateFolderMode ? 'wp-content/uploads/clients' : '/wp-content/uploads/my-custom-folder/'}
                  value={customPath}
                  onChange={(e) => {
                    setCustomPath(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="fm-folder-custom-input w-full text-xs font-mono p-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579]"
                />
                {isPrivateFolderMode ? (
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    Must be an existing folder inside <code className="bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">wp-content</code>. It is checked when you save the settings.
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    Must be an existing folder inside <code className="bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">/wp-content/uploads/</code>. Root folder cannot be excluded.
                  </p>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-[#243044] flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="text-xs font-mono text-gray-600 dark:text-slate-400 truncate max-w-xs">
            {activeTab === 'tree' ? `Selected: ${selectedLabel}` : `Path: ${customPath || '/wp-content/uploads/...'}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isChecking}
              onClick={() => {
                if (activeTab === 'tree') {
                  if (!selectedNode) {
                    validateAndAddFolder('', true);
                    return;
                  }
                  // Private folder: use the folder's real place inside the site (matters on multisite / custom uploads folders).
                  const target = isPrivateFolderMode && selectedNode.rel !== undefined
                    ? uploadsRoot + selectedNode.rel + '/'
                    : selectedNode.path;
                  validateAndAddFolder(target, true);
                } else {
                  validateAndAddFolder(customPath, false);
                }
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-[#A61E69] hover:bg-[#8F1B5A] disabled:opacity-60 disabled:cursor-wait rounded-lg cursor-pointer shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{isPrivateFolderMode ? 'Select Folder' : 'Exclude Folder'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
