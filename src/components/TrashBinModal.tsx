import React, { useState, useEffect } from 'react';
import { PLACEHOLDER_IMAGE_URL } from '../data/placeholderImage';
import { 
  Trash2, 
  X, 
  RefreshCw, 
  AlertTriangle, 
  FileText, 
  Folder, 
  CheckCircle, 
  RotateCcw, 
  Search, 
  ChevronDown, 
  ChevronsUpDown, 
  Archive, 
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export interface FileTrashItem {
  id: string;
  name: string;
  original_path: string;
  original_dir?: string;
  trash_path?: string;
  deleted_at?: string;
  deleted_by?: string;
  size?: number;
  size_formatted?: string;
  is_folder?: boolean;
  extension?: string;
  is_image?: boolean;
  thumbnail_url?: string;
  days_in_trash?: number;
  exists_on_disk?: boolean;
}

interface TrashBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

// 6 precise mock items matching the user's uploaded screenshot perfectly
const MOCK_TRASH_ITEMS: FileTrashItem[] = import.meta.env.DEV ? [
  {
    id: 'trash_item_1',
    name: 'banner-hero.jpg',
    original_path: 'wp-content/uploads/2026/03/banner-hero.jpg',
    size: 250880,
    size_formatted: '245 KB',
    deleted_at: '2026-09-14 11:24:00',
    is_folder: false,
    extension: 'jpg',
    is_image: true,
    thumbnail_url: PLACEHOLDER_IMAGE_URL,
    days_in_trash: 0,
    exists_on_disk: true
  },
  {
    id: 'trash_item_2',
    name: 'old-invoice-template.docx',
    original_path: 'wp-content/uploads/2025/11/old-invoice-template.docx',
    size: 1258291,
    size_formatted: '1.2 MB',
    deleted_at: '2026-09-12 15:17:00',
    is_folder: false,
    extension: 'docx',
    is_image: false,
    days_in_trash: 2,
    exists_on_disk: true
  },
  {
    id: 'trash_item_3',
    name: 'product-shot.webp',
    original_path: 'wp-content/uploads/2025/10/product-shot.webp',
    size: 851968,
    size_formatted: '832 KB',
    deleted_at: '2026-09-10 09:42:00',
    is_folder: false,
    extension: 'webp',
    is_image: true,
    thumbnail_url: PLACEHOLDER_IMAGE_URL,
    days_in_trash: 4,
    exists_on_disk: true
  },
  {
    id: 'trash_item_4',
    name: 'backup-2025-09.zip',
    original_path: 'wp-content/backups/backup-2025-09.zip',
    size: 5033164,
    size_formatted: '4.8 MB',
    deleted_at: '2026-09-08 18:21:00',
    is_folder: false,
    extension: 'zip',
    is_image: false,
    days_in_trash: 6,
    exists_on_disk: true
  },
  {
    id: 'trash_item_5',
    name: 'logo-old.png',
    original_path: 'wp-content/uploads/2025/06/logo-old.png',
    size: 159744,
    size_formatted: '156 KB',
    deleted_at: '2026-09-06 13:05:00',
    is_folder: false,
    extension: 'png',
    is_image: true,
    thumbnail_url: PLACEHOLDER_IMAGE_URL,
    days_in_trash: 8,
    exists_on_disk: true
  },
  {
    id: 'trash_item_6',
    name: 'data-export.csv',
    original_path: 'wp-content/uploads/2025/05/data-export.csv',
    size: 100352,
    size_formatted: '98 KB',
    deleted_at: '2026-09-04 10:33:00',
    is_folder: false,
    extension: 'csv',
    is_image: false,
    days_in_trash: 10,
    exists_on_disk: true
  }
] : [];

export const TrashBinModal: React.FC<TrashBinModalProps> = ({
  isOpen,
  onClose,
  isDarkMode = true
}) => {
  const [items, setItems] = useState<FileTrashItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [isEmptying, setIsEmptying] = useState<boolean>(false);

  // Collision state
  const [collisionItem, setCollisionItem] = useState<{
    item: FileTrashItem;
    targetPath: string;
    existingFileSize: number;
    existingFileDate: string;
  } | null>(null);

  // States for enhanced table features matching mock design
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<'name' | 'deleted_at' | 'size'>('deleted_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Track broken/failed image loads to fallback to colorful icons automatically
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [perPage, setPerPage] = useState<number>(50);

  useEffect(() => {
    if (isOpen) {
      fetchTrashItems();
      setSelectedIds([]);
      setCurrentPage(1);
    }
  }, [isOpen]);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortField, sortOrder, perPage]);

  const fetchTrashItems = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const win = typeof window !== 'undefined' ? (window as any) : {};
    const wpData = win.imgSentryFmData || win.imgsentry_data;
    if (wpData && wpData.ajax_url) {
      try {
        const formData = new FormData();
        formData.append('action', 'imgsentry_fm_list_trash');
        const nonce = wpData.nonce || '';
        formData.append('_ajax_nonce', nonce);
        formData.append('nonce', nonce);
        formData.append('page', '1');
        formData.append('per_page', '500'); // Load all so client-side pagination works perfectly

        const response = await fetch(wpData.ajax_url, {
          method: 'POST',
          body: formData,
        });

        const json = await response.json();
        if (json && json.success) {
          setItems(json.data?.items || []);
        } else {
          setErrorMsg(json?.data?.message || 'Failed to retrieve File Manager trash items.');
        }
      } catch (err: any) {
        console.error('AJAX list trash error:', err);
        setErrorMsg('Network error while communicating with the server.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Standalone preview mode fallback
      setTimeout(() => {
        setItems(MOCK_TRASH_ITEMS);
        setIsLoading(false);
      }, 300);
    }
  };

  const handleRestore = async (item: FileTrashItem, mode: 'cancel' | 'overwrite' | 'rename' = 'cancel') => {
    setActiveActionId(`restore-${item.id}`);
    setErrorMsg(null);
    setSuccessMsg(null);

    const win = typeof window !== 'undefined' ? (window as any) : {};
    const wpData = win.imgSentryFmData || win.imgsentry_data;
    if (wpData && wpData.ajax_url) {
      try {
        const formData = new FormData();
        formData.append('action', 'imgsentry_fm_restore_trash');
        const nonce = wpData.nonce || '';
        formData.append('_ajax_nonce', nonce);
        formData.append('nonce', nonce);
        formData.append('id', item.id);
        if (mode !== 'cancel') {
          formData.append('mode', mode);
        }

        const response = await fetch(wpData.ajax_url, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          let errJson: any = null;
          try {
            errJson = await response.json();
          } catch (_) {}

          if (errJson && errJson.data?.collision) {
            setCollisionItem({
              item,
              targetPath: errJson.data.target_path || item.original_path,
              existingFileSize: errJson.data.existing_file_size || 0,
              existingFileDate: errJson.data.existing_file_date || '',
            });
            return;
          }

          const errorText = await response.text();
          console.error('Server error restoring trash item:', response.status, errorText);
          setErrorMsg(`Server error restoring "${item.name}" (HTTP ${response.status}).`);
          return;
        }

        let json: any;
        try {
          json = await response.json();
        } catch (parseErr) {
          console.error('Failed to parse JSON response:', parseErr);
          setErrorMsg(`Invalid server response format when restoring "${item.name}".`);
          return;
        }

        if (json && json.success) {
          setItems(prev => prev.filter(i => i.id !== item.id));
          setSelectedIds(prev => prev.filter(id => id !== item.id));
          setSuccessMsg(json.data?.message || `"${item.name}" restored to original location.`);

          // Invalidate File Manager cache and reload view
          if (win.ImgSentryFM) {
            if (typeof win.ImgSentryFM.invalidateDirCache === 'function') {
              win.ImgSentryFM.invalidateDirCache();
            }
            if (typeof win.ImgSentryFM.loadDirectory === 'function' && win.ImgSentryFM.currentPath) {
              win.ImgSentryFM.loadDirectory(win.ImgSentryFM.currentPath);
            }
          }
        } else if (json && json.data?.collision) {
          setCollisionItem({
            item,
            targetPath: json.data.target_path || item.original_path,
            existingFileSize: json.data.existing_file_size || 0,
            existingFileDate: json.data.existing_file_date || '',
          });
        } else {
          setErrorMsg(json?.data?.message || `Failed to restore "${item.name}".`);
        }
      } catch (err: any) {
        setErrorMsg(`Network error restoring "${item.name}".`);
      } finally {
        setActiveActionId(null);
      }
    } else {
      // Mock mode
      setTimeout(() => {
        setItems(prev => prev.filter(i => i.id !== item.id));
        setSelectedIds(prev => prev.filter(id => id !== item.id));
        setSuccessMsg(`"${item.name}" restored successfully (Preview Mode).`);
        setActiveActionId(null);
      }, 300);
    }
  };

  const handleDeletePermanent = async (item: FileTrashItem) => {
    const runDelete = async () => {
      setActiveActionId(`delete-${item.id}`);
      setErrorMsg(null);
      setSuccessMsg(null);

      const win = typeof window !== 'undefined' ? (window as any) : {};
      const wpData = win.imgSentryFmData || win.imgsentry_data;
      if (wpData && wpData.ajax_url) {
        try {
          const formData = new FormData();
          formData.append('action', 'imgsentry_fm_delete_trash_permanent');
          const nonce = wpData.nonce || '';
          formData.append('_ajax_nonce', nonce);
          formData.append('nonce', nonce);
          formData.append('id', item.id);

          const response = await fetch(wpData.ajax_url, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error deleting trash item:', response.status, errorText);
            setErrorMsg(`Server error deleting "${item.name}" (HTTP ${response.status}).`);
            return;
          }

          let json: any;
          try {
            json = await response.json();
          } catch (parseErr) {
            console.error('Failed to parse JSON response:', parseErr);
            setErrorMsg(`Invalid server response format when deleting "${item.name}".`);
            return;
          }

          if (json && json.success) {
            setItems(prev => prev.filter(i => i.id !== item.id));
            setSelectedIds(prev => prev.filter(id => id !== item.id));
            setSuccessMsg(`"${item.name}" permanently deleted.`);
          } else {
            setErrorMsg(json?.data?.message || `Failed to delete "${item.name}".`);
          }
        } catch (err: any) {
          console.error('Network error deleting trash item:', err);
          setErrorMsg(`Network connection error deleting "${item.name}".`);
        } finally {
          setActiveActionId(null);
        }
      } else {
        // Mock mode
        setTimeout(() => {
          setItems(prev => prev.filter(i => i.id !== item.id));
          setSelectedIds(prev => prev.filter(id => id !== item.id));
          setSuccessMsg(`"${item.name}" deleted permanently (Preview Mode).`);
          setActiveActionId(null);
        }, 300);
      }
    };

    const win = typeof window !== 'undefined' ? (window as any) : {};
    if (win.imgsentryShowConfirmModal) {
      win.imgsentryShowConfirmModal({
        title: `Delete "${item.name}" permanently?`,
        description: "This file will be permanently removed. This action can't be undone.",
        confirmText: 'Delete permanently',
        onConfirm: (_modal: any, closeModal: () => void) => {
          closeModal();
          runDelete();
        }
      });
    } else {
      runDelete();
    }
  };

  const handleEmptyTrash = async () => {
    const runEmpty = async () => {
      setIsEmptying(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const win = typeof window !== 'undefined' ? (window as any) : {};
      const wpData = win.imgSentryFmData || win.imgsentry_data;
      if (wpData && wpData.ajax_url) {
        try {
          const formData = new FormData();
          formData.append('action', 'imgsentry_fm_empty_trash');
          const nonce = wpData.nonce || '';
          formData.append('_ajax_nonce', nonce);
          formData.append('nonce', nonce);

          const response = await fetch(wpData.ajax_url, {
            method: 'POST',
            body: formData,
          });

          const json = await response.json();
          if (json && json.success) {
            setItems([]);
            setSelectedIds([]);
            setSuccessMsg('File Manager Trash emptied successfully.');
          } else {
            setErrorMsg(json?.data?.message || 'Failed to empty trash.');
          }
        } catch (err: any) {
          setErrorMsg('Network error emptying trash.');
        } finally {
          setIsEmptying(false);
        }
      } else {
        // Mock mode
        setTimeout(() => {
          setItems([]);
          setSelectedIds([]);
          setSuccessMsg('File Manager Trash emptied (Preview Mode).');
          setIsEmptying(false);
        }, 400);
      }
    };

    const win = typeof window !== 'undefined' ? (window as any) : {};
    if (win.imgsentryShowConfirmModal) {
      win.imgsentryShowConfirmModal({
        title: 'Empty Trash Bin permanently?',
        description: "All items in the trash bin will be permanently removed. This action can't be undone.",
        confirmText: 'Delete permanently',
        onConfirm: (_modal: any, closeModal: () => void) => {
          closeModal();
          runEmpty();
        }
      });
    } else {
      runEmpty();
    }
  };

  // Bulk operation handlers
  const handleBulkRestore = async () => {
    if (selectedIds.length === 0) return;

    const runBulkRestore = async () => {
      const idsToRestore = [...selectedIds];
      setSelectedIds([]);
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      let restoredCount = 0;
      let failedCount = 0;

      const win = typeof window !== 'undefined' ? (window as any) : {};
      const wpData = win.imgSentryFmData || win.imgsentry_data;
      if (wpData && wpData.ajax_url) {
        try {
          for (const id of idsToRestore) {
            const formData = new FormData();
            formData.append('action', 'imgsentry_fm_restore_trash');
            const nonce = wpData.nonce || '';
            formData.append('_ajax_nonce', nonce);
            formData.append('nonce', nonce);
            formData.append('id', id);

            const response = await fetch(wpData.ajax_url, {
              method: 'POST',
              body: formData,
            });
            const json = await response.json();
            if (json && json.success) {
              restoredCount++;
              setItems(prev => prev.filter(i => i.id !== id));
            } else {
              failedCount++;
            }
          }

          if (restoredCount > 0) {
            setSuccessMsg(`Successfully restored ${restoredCount} items.`);
          }
          if (failedCount > 0) {
            setErrorMsg(`Failed to restore ${failedCount} items.`);
          }

          if (win.ImgSentryFM) {
            if (typeof win.ImgSentryFM.invalidateDirCache === 'function') {
              win.ImgSentryFM.invalidateDirCache();
            }
            if (typeof win.ImgSentryFM.loadDirectory === 'function' && win.ImgSentryFM.currentPath) {
              win.ImgSentryFM.loadDirectory(win.ImgSentryFM.currentPath);
            }
          }
        } catch (err) {
          setErrorMsg('Network error occurred during bulk restore.');
        } finally {
          setIsLoading(false);
        }
      } else {
        setTimeout(() => {
          setItems(prev => prev.filter(i => !idsToRestore.includes(i.id)));
          setSuccessMsg(`Restored ${idsToRestore.length} items successfully (Preview Mode).`);
          setIsLoading(false);
        }, 500);
      }
    };

    const win = typeof window !== 'undefined' ? (window as any) : {};
    if (win.imgsentryShowConfirmModal) {
      win.imgsentryShowConfirmModal({
        title: `Restore ${selectedIds.length} selected items?`,
        description: `These ${selectedIds.length} items will be restored to their original paths.`,
        confirmText: 'Restore items',
        onConfirm: (_modal: any, closeModal: () => void) => {
          closeModal();
          runBulkRestore();
        }
      });
    } else {
      runBulkRestore();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const runBulkDelete = async () => {
      const idsToDelete = [...selectedIds];
      setSelectedIds([]);
      setIsLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      let deletedCount = 0;
      let failedCount = 0;

      const win = typeof window !== 'undefined' ? (window as any) : {};
      const wpData = win.imgSentryFmData || win.imgsentry_data;
      if (wpData && wpData.ajax_url) {
        try {
          for (const id of idsToDelete) {
            const formData = new FormData();
            formData.append('action', 'imgsentry_fm_delete_trash_permanent');
            const nonce = wpData.nonce || '';
            formData.append('_ajax_nonce', nonce);
            formData.append('nonce', nonce);
            formData.append('id', id);

            const response = await fetch(wpData.ajax_url, {
              method: 'POST',
              body: formData,
            });
            const json = await response.json();
            if (json && json.success) {
              deletedCount++;
              setItems(prev => prev.filter(i => i.id !== id));
            } else {
              failedCount++;
            }
          }

          if (deletedCount > 0) {
            setSuccessMsg(`Successfully deleted ${deletedCount} items permanently.`);
          }
          if (failedCount > 0) {
            setErrorMsg(`Failed to delete ${failedCount} items.`);
          }
        } catch (err) {
          setErrorMsg('Network error occurred during bulk delete.');
        } finally {
          setIsLoading(false);
        }
      } else {
        setTimeout(() => {
          setItems(prev => prev.filter(i => !idsToDelete.includes(i.id)));
          setSuccessMsg(`Permanently deleted ${idsToDelete.length} items (Preview Mode).`);
          setIsLoading(false);
        }, 500);
      }
    };

    const win = typeof window !== 'undefined' ? (window as any) : {};
    if (win.imgsentryShowConfirmModal) {
      win.imgsentryShowConfirmModal({
        title: `Delete ${selectedIds.length} items permanently?`,
        description: `These ${selectedIds.length} files will be permanently removed. This action can't be undone.`,
        confirmText: 'Delete permanently',
        onConfirm: (_modal: any, closeModal: () => void) => {
          closeModal();
          runBulkDelete();
        }
      });
    } else {
      runBulkDelete();
    }
  };

  // Helper to resolve directory paths precisely
  const getDirectoryPath = (originalPath: string, filename: string) => {
    if (!originalPath) return '';
    if (originalPath.endsWith(filename)) {
      const parent = originalPath.slice(0, originalPath.length - filename.length);
      return parent.replace(/\/$/, '') || '/';
    }
    return originalPath;
  };

  // Renders beautiful, solid-gradient rounded colorful icons exactly matching the user's design image
  const renderColorfulIcon = (item: FileTrashItem) => {
    const ext = (item.extension || '').toLowerCase() || (item.name.split('.').pop() || '').toLowerCase();
    
    if (item.is_folder) {
      return (
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shrink-0 text-white shadow-md border border-amber-400/20" title="Folder">
          <Folder className="w-5 h-5 text-white" />
        </div>
      );
    }

    if (ext === 'docx' || ext === 'doc') {
      return (
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 font-bold text-white text-base font-sans select-none shadow-md border border-blue-400/20" title="Word Document">
          W
        </div>
      );
    }

    if (ext === 'zip' || ext === 'rar' || ext === 'tar' || ext === 'gz') {
      return (
        <div className="w-11 h-11 rounded-xl bg-[#8e24aa] flex items-center justify-center shrink-0 text-white shadow-md border border-purple-400/20" title="Archive Zip File">
          <Archive className="w-5 h-5 text-white" />
        </div>
      );
    }

    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      return (
        <div className="w-11 h-11 rounded-xl bg-[#0f9d58] flex items-center justify-center shrink-0 text-white shadow-md border border-emerald-400/20" title="Spreadsheet Table">
          <FileSpreadsheet className="w-5 h-5 text-white" />
        </div>
      );
    }

    // Default Fallback
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shrink-0 text-white shadow-md border border-slate-500/20" title="Document File">
        <FileText className="w-5 h-5 text-white" />
      </div>
    );
  };

  // Checkbox select action utilities
  const handleSelectAll = (visibleItems: FileTrashItem[]) => {
    const visibleIds = visibleItems.map(i => i.id);
    const allSelected = visibleIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const union = new Set([...prev, ...visibleIds]);
        return Array.from(union);
      });
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Interactive Sorting & Searching
  const handleToggleSort = (field: 'name' | 'deleted_at' | 'size') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.original_path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedItems = [...filteredItems].sort((a, b) => {
    let factor = sortOrder === 'asc' ? 1 : -1;
    if (sortField === 'size') {
      const sizeA = a.size || 0;
      const sizeB = b.size || 0;
      return (sizeA - sizeB) * factor;
    }
    const valA = (a[sortField] || '').toString().toLowerCase();
    const valB = (b[sortField] || '').toString().toLowerCase();
    return valA.localeCompare(valB) * factor;
  });

  // Calculate Paginated items to fulfill user's pagination request
  const totalPages = Math.ceil(sortedItems.length / perPage) || 1;
  const startIndex = (currentPage - 1) * perPage;
  const paginatedItems = sortedItems.slice(startIndex, startIndex + perPage);

  if (!isOpen) return null;

  return (
    <div 
      className="absolute inset-0 z-[100000100] flex items-start justify-center bg-[#030712]/90 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn font-sans box-border"
      onClick={onClose}
    >
      {/* 
        Main Modal Frame: Highly optimized, flat grid architecture centering pure CSS styling 
        designed to remain unbroken inside any WordPress Admin or generic stylesheet environment.
      */}
      <div 
        className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-[#080d16] text-slate-100 flex flex-col max-h-[calc(100%-24px)] shadow-2xl overflow-hidden mt-2"
        onClick={(e) => e.stopPropagation()}
        style={{ boxSizing: 'border-box' }}
      >
        {/* Header Section */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-800 bg-[#0b111e]/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="flex items-center">
              {/* Overriding WP Core H3 color presets with inline white styling to fix the dark title issue */}
              <span 
                style={{ 
                  color: '#ffffff', 
                  fontSize: '18px', 
                  fontWeight: 'bold',
                  letterSpacing: '-0.025em',
                  fontFamily: 'inherit'
                }}
              >
                File Manager Trash
              </span>
              <span className="bg-[#162235] border border-[#1e2e4a] text-[#a4b5cf] font-semibold rounded-full text-xs px-2.5 py-0.5 ml-2.5 font-sans">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 rounded-lg cursor-pointer transition-colors border-0 bg-transparent"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Controls Bar */}
        <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-slate-800/50 bg-[#080d16]">
          {/* 
            Bulletproof Custom Search input style: Match background to popup box color perfectly,
            center the search placeholder vertically, and override WP global stylesheet inputs entirely.
          */}
          <div className="relative flex items-center" style={{ height: '42px' }}>
            <Search 
              className="w-4 h-4 text-slate-500" 
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                margin: 0,
                zIndex: 10
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="font-sans"
              style={{
                backgroundColor: '#080d16', // Matches with popup box color exactly!
                color: '#f8fafc',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                height: '42px',
                paddingLeft: '38px',
                paddingRight: '38px',
                fontSize: '13px',
                lineHeight: '1.5',
                margin: '0',
                boxShadow: 'none',
                width: '320px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                }}
                className="text-slate-500 hover:text-slate-300"
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  margin: 0,
                  zIndex: 10
                }}
              >
                <X className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* Empty Trash Button (Crimson border outline) */}
          <button
            type="button"
            onClick={handleEmptyTrash}
            disabled={items.length === 0 || isEmptying || isLoading || activeActionId !== null}
            className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all bg-transparent"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isEmptying ? 'Emptying...' : 'Empty Trash'}</span>
          </button>
        </div>

        {/* Banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{successMsg}</span>
          </div>
        )}

        {/* Table Content Body: Rendered with IMMUNE Grid DIV layout to bypass WordPress native table override styles */}
        <div className="flex-1 overflow-y-auto p-0 flex flex-col min-h-[300px] bg-[#080d16]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2.5">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-semibold">Retrieving File Manager Trash items...</p>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-rose-400">
              <div className="w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center mb-3.5 border border-rose-500/20">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-sm text-slate-200">Unable to Load Trash items</h4>
              <p className="text-xs mt-1.5 max-w-sm text-slate-500">
                Please check the error banner details above or verify your administrative privileges.
              </p>
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500">
              <div className="w-14 h-14 rounded-full bg-slate-800/40 flex items-center justify-center mb-3.5 border border-slate-800">
                <Trash2 className="w-7 h-7 text-slate-400" />
              </div>
              <h4 className="font-bold text-sm text-slate-300">Trash is empty</h4>
              <p className="text-xs mt-1 max-w-xs text-slate-500 leading-normal">
                No files or folders are currently stored inside the File Manager Trash.
              </p>
            </div>
          ) : (
            <div className="flex flex-col w-full">
              {/* Grid Header Row - Actions column resized to 200px due to View button removal */}
              <div className="grid grid-cols-[50px_1fr_200px_100px_200px] items-center px-6 py-3 border-b border-slate-800 text-slate-400 text-xs font-semibold bg-[#0c1322]/40 select-none">
                {/* Select All Checkbox */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={paginatedItems.length > 0 && paginatedItems.every(i => selectedIds.includes(i.id))}
                    onChange={() => handleSelectAll(paginatedItems)}
                    className="w-4 h-4 rounded border-slate-700 bg-[#0c121e] text-indigo-500 focus:ring-indigo-500/40 cursor-pointer"
                  />
                </div>

                {/* Name header sort */}
                <button
                  type="button"
                  onClick={() => handleToggleSort('name')}
                  className="flex items-center gap-1.5 text-left cursor-pointer hover:text-slate-200 bg-transparent border-0 p-0 font-semibold"
                >
                  <span>Name</span>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {/* Deleted header sort */}
                <button
                  type="button"
                  onClick={() => handleToggleSort('deleted_at')}
                  className="flex items-center gap-1.5 text-left cursor-pointer hover:text-slate-200 bg-transparent border-0 p-0 font-semibold"
                >
                  <span>Deleted</span>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {/* Size header sort */}
                <button
                  type="button"
                  onClick={() => handleToggleSort('size')}
                  className="flex items-center gap-1.5 text-left cursor-pointer hover:text-slate-200 bg-transparent border-0 p-0 font-semibold"
                >
                  <span>Size</span>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {/* Actions header */}
                <div className="text-right pr-4">Actions</div>
              </div>

              {/* Grid Body Rows (Paginated dynamically) */}
              <div className="flex flex-col divide-y divide-slate-800/40">
                {paginatedItems.map((item) => {
                  const isRestoring = activeActionId === `restore-${item.id}`;
                  const isDeleting = activeActionId === `delete-${item.id}`;
                  const isSelected = selectedIds.includes(item.id);

                  // Decide if thumbnail is loaded and valid
                  const hasValidThumbnail = item.is_image && item.thumbnail_url && !failedImages[item.id];

                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[50px_1fr_200px_100px_200px] items-center px-6 py-4 transition-colors ${
                        isSelected ? 'bg-[#0f192b]/50' : 'hover:bg-[#0c1322]/40'
                      }`}
                    >
                      {/* Row Checkbox */}
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectItem(item.id)}
                          className="w-4 h-4 rounded border-slate-700 bg-[#0c121e] text-indigo-500 focus:ring-indigo-500/40 cursor-pointer"
                        />
                      </div>

                      {/* File Icon & Identity Column */}
                      <div className="flex items-center gap-3.5 min-w-0 pr-4">
                        {hasValidThumbnail ? (
                          <img
                            src={item.thumbnail_url}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-xl object-cover bg-slate-900 border border-slate-800 shrink-0 shadow-md"
                            onError={() => {
                              // Dynamically fallback to colorful representation if asset fails to load
                              setFailedImages(prev => ({ ...prev, [item.id]: true }));
                            }}
                          />
                        ) : (
                          renderColorfulIcon(item)
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-slate-100 truncate tracking-tight font-sans">
                            {item.name}
                          </div>
                          <div className="text-[#50607a] text-[10.5px] font-mono truncate mt-0.5" title={item.original_path}>
                            {getDirectoryPath(item.original_path, item.name)}
                          </div>
                        </div>
                      </div>

                      {/* Deleted Date/Time */}
                      <div className="text-slate-300 text-xs font-mono font-medium truncate">
                        {item.deleted_at || 'Recently'}
                      </div>

                      {/* File Size */}
                      <div className="text-slate-300 text-xs font-mono font-medium">
                        {item.size_formatted || '0 KB'}
                      </div>

                      {/* Outlined Action Buttons (View completely removed) */}
                      <div className="flex items-center justify-end gap-2.5 pr-1 shrink-0">
                        {/* Restore Action (Outlined emerald) */}
                        <button
                          type="button"
                          onClick={() => handleRestore(item)}
                          disabled={activeActionId === `restore-${item.id}` || activeActionId === `delete-${item.id}` || isLoading || isEmptying}
                          className="h-8.5 px-4 rounded-xl border border-[#10b981]/25 hover:border-[#10b981]/50 bg-[#064e3b]/10 text-[#10b981] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isRestoring ? 'Restoring' : 'Restore'}</span>
                        </button>

                        {/* Delete Permanently Action (Outlined red) */}
                        <button
                          type="button"
                          onClick={() => handleDeletePermanent(item)}
                          disabled={activeActionId === `restore-${item.id}` || activeActionId === `delete-${item.id}` || isLoading || isEmptying}
                          className="h-8.5 px-4 rounded-xl border border-[#f43f5e]/25 hover:border-[#f43f5e]/50 bg-[#7f1d1d]/10 text-[#f43f5e] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isDeleting ? 'Deleting' : 'Delete'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bulk Action Panel Overlay */}
        {selectedIds.length > 0 && (
          <div className="mx-6 my-4 p-3.5 rounded-xl bg-[#0d162a] border border-indigo-500/25 flex items-center justify-between text-indigo-200 text-xs font-semibold animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0"></span>
              <span>{selectedIds.length} {selectedIds.length === 1 ? 'item selected' : 'items selected'} from the list</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBulkRestore}
                disabled={isLoading || isEmptying || activeActionId !== null}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Bulk Restore</span>
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isLoading || isEmptying || activeActionId !== null}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bulk Delete</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-2.5 py-1.5 text-slate-400 hover:text-slate-200 transition-colors bg-transparent border-0 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Footer Section: Adding beautifully styled Page Pagination */}
        <div className="flex items-center justify-between px-6 py-4.5 border-t border-slate-800 bg-[#060b13]">
          {/* Pagination status/indicator (left side) */}
          <div className="text-[#64748b] text-xs font-medium font-sans">
            {sortedItems.length > 0 ? (
              <span>
                Showing <strong className="text-slate-300 font-semibold">{startIndex + 1}</strong> to{' '}
                <strong className="text-slate-300 font-semibold">
                  {Math.min(startIndex + perPage, sortedItems.length)}
                </strong>{' '}
                of <strong className="text-slate-300 font-semibold">{sortedItems.length}</strong> items
              </span>
            ) : (
              <span>0 items</span>
            )}
          </div>

          {/* Interactive Page Numbers Pagination (center/right area) */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-800 bg-[#0e1626]/40 text-slate-400 hover:text-slate-200 disabled:opacity-20 disabled:pointer-events-none cursor-pointer transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Number keys */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
                const isPageActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 min-w-[32px] px-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      isPageActive
                        ? 'border border-indigo-500/30 bg-indigo-600/20 text-indigo-400 font-bold'
                        : 'border border-slate-800/80 bg-[#0e1626]/20 text-slate-400 hover:bg-[#121926] hover:text-slate-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-800 bg-[#0e1626]/40 text-slate-400 hover:text-slate-200 disabled:opacity-20 disabled:pointer-events-none cursor-pointer transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Page size selector and Close button (right) */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="appearance-none pl-3.5 pr-8 py-1.5 rounded-xl text-xs font-semibold cursor-pointer outline-none font-sans"
                style={{
                  backgroundColor: '#080d16', // Matches with popup box color exactly!
                  color: '#cbd5e1',
                  border: '1px solid #1e293b',
                  boxShadow: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none'
                }}
              >
                <option value={10} style={{ backgroundColor: '#080d16', color: '#cbd5e1' }}>10 / page</option>
                <option value={25} style={{ backgroundColor: '#080d16', color: '#cbd5e1' }}>25 / page</option>
                <option value={50} style={{ backgroundColor: '#080d16', color: '#cbd5e1' }}>50 / page</option>
                <option value={100} style={{ backgroundColor: '#080d16', color: '#cbd5e1' }}>100 / page</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2 rounded-xl border border-slate-800 bg-[#0e1626] hover:bg-[#141d31] text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Collision Resolution Overlay */}
      {collisionItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#0b1220] border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-100">File Already Exists</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  An item already exists at <code className="text-amber-300/90 bg-amber-950/40 px-1.5 py-0.5 rounded font-mono text-[11px]">{collisionItem.targetPath}</code>.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Existing File Size:</span>
                <span className="font-mono">{collisionItem.existingFileSize ? `${(collisionItem.existingFileSize / 1024).toFixed(1)} KB` : 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Modified:</span>
                <span>{collisionItem.existingFileDate || 'Unknown'}</span>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              Please choose how you would like to proceed:
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const target = collisionItem.item;
                  setCollisionItem(null);
                  handleRestore(target, 'overwrite');
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
              >
                Overwrite existing file
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = collisionItem.item;
                  setCollisionItem(null);
                  handleRestore(target, 'rename');
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
              >
                Restore as copy (auto-rename)
              </button>
              <button
                type="button"
                onClick={() => setCollisionItem(null)}
                className="w-full px-4 py-2 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
