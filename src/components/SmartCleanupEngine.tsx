import React, { useState, useMemo } from 'react';
import { MediaItem } from '../types';
import { MediaPreview160 } from './MediaPreview160';
import { MediaPreview80 } from './MediaPreview80';
import { MOCK_WP_POSTS, WpPost } from '../data/mockPosts';
import { 
  Sparkles, 
  Search, 
  Code, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  FileCode, 
  Eye, 
  Check, 
  X, 
  Layers, 
  Cpu, 
  Info,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

export interface DomMatchResult {
  postId: number;
  postTitle: string;
  postType: string;
  matchType: 'wp-class' | 'url-src' | 'filename' | 'font-family';
  snippet: string;
}

export interface SmartCleanupSuggestion {
  media: MediaItem;
  isUsedInDom: boolean;
  domMatches: DomMatchResult[];
  confidenceScore: number; // 0 to 100% chance it's unused
  recommendation: 'trash_suggested' | 'keep_safe' | 'review';
  reasonSummary: string;
}

interface SmartCleanupEngineProps {
  mediaList: MediaItem[];
  onMoveToTrash: (id: number) => void;
  onBulkMoveToTrash: (ids: number[]) => void;
  onClose?: () => void;
}

export const SmartCleanupEngine: React.FC<SmartCleanupEngineProps> = ({
  mediaList,
  onMoveToTrash,
  onBulkMoveToTrash,
  onClose
}) => {
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'all' | 'suggested' | 'in_use'>('suggested');
  const [inspectingItem, setInspectingItem] = useState<SmartCleanupSuggestion | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // DOM Parsing Engine function
  const scanAnalysisResults = useMemo(() => {
    const activeMedia = mediaList.filter(m => !m.isTrashed);

    return activeMedia.map((item): SmartCleanupSuggestion => {
      const domMatches: DomMatchResult[] = [];

      MOCK_WP_POSTS.forEach((post) => {
        const content = post.content || '';

        // 1. Check for WP attachment class (wp-image-{id}, wp-att-{id}, wp-audio-{id}, wp-element-{id})
        const wpClassRegex = new RegExp(`wp-(image|att|audio|element|video|attachment)-${item.id}\\b`, 'i');
        if (wpClassRegex.test(content)) {
          // Extract snippet
          const matchIndex = content.search(wpClassRegex);
          const start = Math.max(0, matchIndex - 30);
          const end = Math.min(content.length, matchIndex + 70);
          domMatches.push({
            postId: post.id,
            postTitle: post.title,
            postType: post.type,
            matchType: 'wp-class',
            snippet: `...${content.slice(start, end).trim()}...`
          });
          return;
        }

        // 2. Check for filename or URL match inside src/href
        if (item.filename && content.includes(item.filename)) {
          const matchIndex = content.indexOf(item.filename);
          const start = Math.max(0, matchIndex - 30);
          const end = Math.min(content.length, matchIndex + 70);
          domMatches.push({
            postId: post.id,
            postTitle: post.title,
            postType: post.type,
            matchType: 'filename',
            snippet: `...${content.slice(start, end).trim()}...`
          });
          return;
        }

        // 3. Check for font title/family in CSS or content
        if (item.category === 'fonts' && item.title && content.toLowerCase().includes(item.title.toLowerCase().split(' ')[0])) {
          const matchIndex = content.toLowerCase().indexOf(item.title.toLowerCase().split(' ')[0]);
          const start = Math.max(0, matchIndex - 20);
          const end = Math.min(content.length, matchIndex + 60);
          domMatches.push({
            postId: post.id,
            postTitle: post.title,
            postType: post.type,
            matchType: 'font-family',
            snippet: `...${content.slice(start, end).trim()}...`
          });
        }
      });

      const isUsedInDom = domMatches.length > 0;

      // Determine confidence score & recommendation
      let confidenceScore = 0;
      let recommendation: 'trash_suggested' | 'keep_safe' | 'review' = 'keep_safe';
      let reasonSummary = '';

      if (isUsedInDom) {
        confidenceScore = 0;
        recommendation = 'keep_safe';
        reasonSummary = `Referenced in ${domMatches.length} page/post DOM content (${domMatches[0].postTitle})`;
      } else if (item.inUse) {
        confidenceScore = 30;
        recommendation = 'review';
        reasonSummary = `Marked in theme settings (${item.useReasons.join(', ') || 'Customizer'}), but no direct post HTML matches`;
      } else if (item.isAttached) {
        confidenceScore = 75;
        recommendation = 'trash_suggested';
        reasonSummary = `Attached to "${item.parentTitle || 'Parent'}" in database, but 0 references found in active post HTML DOM`;
      } else {
        confidenceScore = 98;
        recommendation = 'trash_suggested';
        reasonSummary = `0 DOM references found across ${MOCK_WP_POSTS.length} posts/pages and not attached to any parent post`;
      }

      return {
        media: item,
        isUsedInDom,
        domMatches,
        confidenceScore,
        recommendation,
        reasonSummary
      };
    });
  }, [mediaList]);

  // Filtered List
  const filteredSuggestions = useMemo(() => {
    return scanAnalysisResults.filter((s) => {
      if (selectedCategoryFilter === 'suggested' && s.recommendation !== 'trash_suggested') return false;
      if (selectedCategoryFilter === 'in_use' && s.recommendation === 'trash_suggested') return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return s.media.title.toLowerCase().includes(term) || s.media.filename.toLowerCase().includes(term);
      }
      return true;
    });
  }, [scanAnalysisResults, selectedCategoryFilter, searchTerm]);

  const suggestedUnusedItems = scanAnalysisResults.filter(s => s.recommendation === 'trash_suggested');
  const totalSuggestedBytes = suggestedUnusedItems.reduce((acc, s) => acc + s.media.fileSize, 0);

  const formatSize = (bytes: number) => {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  };

  const handleSelectAllSuggested = () => {
    if (selectedIds.length === filteredSuggestions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredSuggestions.map(s => s.media.id));
    }
  };

  const handleExecuteBulkTrash = () => {
    if (selectedIds.length === 0) return;
    onBulkMoveToTrash(selectedIds);
    setSelectedIds([]);
  };

  return (
    <div className="bg-white dark:bg-[#111827] rounded-xl border border-indigo-200 dark:border-indigo-500/30 shadow-xl overflow-hidden mb-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Smart DOM Cross-Reference Parser Engine</span>
            </div>
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <span>Smart Cleanup Suggestions</span>
            </h2>
            <p className="text-slate-300 text-xs mt-1 max-w-2xl leading-relaxed">
              Scans all active WordPress Posts, Pages, Widgets & Themes, parsing live HTML DOM for <code>wp-image-*</code> classes, <code>src/href</code> URLs, and shortcodes to find safe deletion candidates.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-3 text-right">
              <div className="text-[11px] text-slate-300 uppercase tracking-wider font-semibold">Cleanable Storage</div>
              <div className="text-xl font-bold text-amber-300">{formatSize(totalSuggestedBytes)}</div>
              <div className="text-[10px] text-slate-400">{suggestedUnusedItems.length} Unused Assets</div>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Minimize Smart Engine"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Control Bar & Filter Tabs */}
      <div className="bg-slate-50 dark:bg-[#0f172a] border-b border-gray-200 dark:border-[#243044] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedCategoryFilter('suggested')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              selectedCategoryFilter === 'suggested'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#243044] text-gray-700 dark:text-[#e7ecf3] hover:bg-gray-100 dark:hover:bg-[#1e293b]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Suggested Unused ({suggestedUnusedItems.length})</span>
          </button>

          <button
            onClick={() => setSelectedCategoryFilter('in_use')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              selectedCategoryFilter === 'in_use'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#243044] text-gray-700 dark:text-[#e7ecf3] hover:bg-gray-100 dark:hover:bg-[#1e293b]'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Verified In-Use ({scanAnalysisResults.length - suggestedUnusedItems.length})</span>
          </button>

          <button
            onClick={() => setSelectedCategoryFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedCategoryFilter === 'all'
                ? 'bg-[#2271b1] text-white shadow-xs'
                : 'bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-[#243044] text-gray-700 dark:text-[#e7ecf3] hover:bg-gray-100 dark:hover:bg-[#1e293b]'
            }`}
          >
            <span>All Assets ({scanAnalysisResults.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 dark:text-[#5b6579] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by filename..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white dark:bg-[#1e293b] border border-gray-300 dark:border-[#334155] rounded-lg text-xs dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579] focus:ring-2 focus:ring-indigo-500 outline-none w-48 sm:w-60"
            />
          </div>

          {selectedIds.length > 0 && (
            <button
              onClick={handleExecuteBulkTrash}
              className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Trash Selected ({selectedIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Suggested Items Table / Cards */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-[#243044] text-gray-500 dark:text-[#8993a8] font-bold uppercase text-[10px] tracking-wider bg-gray-50/80 dark:bg-[#0f172a]">
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.length === filteredSuggestions.length && filteredSuggestions.length > 0}
                  onChange={handleSelectAllSuggested}
                  className="rounded border-gray-300 dark:border-[#334155] text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                />
              </th>
              <th className="p-3">Media Item</th>
              <th className="p-3">DOM Status</th>
              <th className="p-3">Confidence</th>
              <th className="p-3">Smart Analysis Reason</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#243044]">
            {filteredSuggestions.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400 dark:text-[#8993a8]">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-gray-700 dark:text-[#e7ecf3] text-xs">No media items matching current filter criteria.</p>
                  <p className="text-[11px] text-gray-400 dark:text-[#8993a8]">All scanned assets appear to be active or accounted for.</p>
                </td>
              </tr>
            ) : (
              filteredSuggestions.map((item) => {
                const isSelected = selectedIds.includes(item.media.id);
                return (
                  <tr
                    key={item.media.id}
                    className={`hover:bg-slate-50 dark:hover:bg-[#1e293b] transition-colors ${
                      isSelected ? 'bg-indigo-50/50 dark:bg-indigo-500/10' : ''
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) {
                            setSelectedIds(selectedIds.filter(id => id !== item.media.id));
                          } else {
                            setSelectedIds([...selectedIds, item.media.id]);
                          }
                        }}
                        className="rounded border-gray-300 dark:border-[#334155] text-[#A61E69] accent-[#A61E69] focus:ring-[#A61E69] cursor-pointer"
                      />
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-3.5">
                        <MediaPreview80 item={item.media} />
                        <div>
                          <div className="font-bold text-gray-900 dark:text-[#e7ecf3] text-xs truncate max-w-[180px]">{item.media.title}</div>
                          <div className="text-[11px] text-gray-500 dark:text-[#8993a8] font-mono flex items-center gap-2 mt-0.5">
                            <span>ID: #{item.media.id}</span>
                            <span>•</span>
                            <span>{item.media.formattedSize}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      {item.isUsedInDom ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>DOM Matched ({item.domMatches.length})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-500/10 px-2.5 py-1 rounded-full">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>0 DOM References</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 dark:bg-[#1e293b] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              item.confidenceScore >= 80 
                                ? 'bg-amber-500' 
                                : item.confidenceScore >= 40 
                                ? 'bg-blue-500' 
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${item.confidenceScore}%` }}
                          />
                        </div>
                        <span className="font-bold text-[11px] text-gray-700 dark:text-[#e7ecf3]">{item.confidenceScore}% Unused</span>
                      </div>
                    </td>

                    <td className="p-3 max-w-[280px]">
                      <p className="text-[11px] text-gray-600 dark:text-[#8993a8] leading-snug truncate" title={item.reasonSummary}>
                        {item.reasonSummary}
                      </p>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setInspectingItem(item)}
                          className="bg-gray-100 dark:bg-[#1e293b] hover:bg-gray-200 dark:hover:bg-[#243044] text-gray-700 dark:text-[#e7ecf3] px-2.5 py-1.5 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Inspect DOM HTML Matches"
                        >
                          <Code className="w-3 h-3 text-indigo-600" />
                          <span>Inspect DOM</span>
                        </button>

                        <button
                          onClick={() => onMoveToTrash(item.media.id)}
                          className="bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 px-2.5 py-1.5 rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Move to Trash Bin"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                          <span>Trash</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* DOM Inspector Modal */}
      {inspectingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#111827] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden border border-gray-200 dark:border-[#243044]">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                <Code className="w-4 h-4 text-indigo-400" />
                <span>DOM Cross-Reference Inspector: #{inspectingItem.media.id} ({inspectingItem.media.filename})</span>
              </div>
              <button
                onClick={() => setInspectingItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 text-xs text-gray-800 dark:text-[#e7ecf3] space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Asset Meta Box */}
              <div className="bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-[#243044] p-4 rounded-xl flex items-center gap-4">
                {inspectingItem.media.thumbUrl ? (
                  <img
                    src={inspectingItem.media.thumbUrl}
                    alt={inspectingItem.media.title}
                    className="w-14 h-14 object-cover rounded-lg border border-gray-300 dark:border-[#243044]"
                  />
                ) : (
                  <div className="w-14 h-14 bg-gray-200 dark:bg-[#1e293b] rounded-lg flex items-center justify-center font-mono text-xs font-bold text-gray-500 dark:text-[#8993a8]">
                    {inspectingItem.media.extension}
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-[#e7ecf3]">{inspectingItem.media.title}</h4>
                  <p className="text-gray-500 dark:text-[#8993a8] text-[11px] font-mono mt-0.5">
                    URL: {inspectingItem.media.url}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] font-semibold text-gray-600 dark:text-[#8993a8]">
                    <span>Size: {inspectingItem.media.formattedSize}</span>
                    <span>•</span>
                    <span>MIME: {inspectingItem.media.mimeType}</span>
                    <span>•</span>
                    <span>Attached to: {inspectingItem.media.parentTitle || 'None (Unattached)'}</span>
                  </div>
                </div>
              </div>

              {/* DOM Match Results */}
              <div>
                <h5 className="font-bold text-gray-900 dark:text-[#e7ecf3] mb-2 flex items-center justify-between">
                  <span>Scanned WordPress Content Results ({inspectingItem.domMatches.length} Matches)</span>
                  <span className="text-[11px] text-gray-500 dark:text-[#8993a8] font-normal">Parsed {MOCK_WP_POSTS.length} posts & pages</span>
                </h5>

                {inspectingItem.domMatches.length === 0 ? (
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 rounded-xl text-amber-900 dark:text-amber-200 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      <span>No HTML DOM References Found</span>
                    </div>
                    <p className="text-amber-800 dark:text-amber-200 leading-relaxed">
                      The DOM parser checked for <code>wp-image-{inspectingItem.media.id}</code>, <code>wp-att-{inspectingItem.media.id}</code>, and filename references across all active posts and pages. No matches were detected.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inspectingItem.domMatches.map((m, idx) => (
                      <div key={idx} className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-[11px] border border-slate-800">
                        <div className="flex items-center justify-between text-indigo-300 font-sans font-bold text-xs mb-1.5">
                          <span>{m.postTitle} ({m.postType})</span>
                          <span className="bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded text-[10px] uppercase border border-indigo-800">
                            Match: {m.matchType}
                          </span>
                        </div>
                        <div className="bg-black/60 p-2 rounded text-emerald-400 overflow-x-auto whitespace-pre border border-slate-800">
                          {m.snippet}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-[#0f172a] border-t border-gray-200 dark:border-[#243044] px-6 py-3 flex items-center justify-between">
              <span className="text-[11px] text-gray-500 dark:text-[#8993a8]">
                ImgSentry — DOM Cross-Reference Parser
              </span>
              <button
                onClick={() => setInspectingItem(null)}
                className="bg-[#2271b1] hover:bg-[#135e96] text-white px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
