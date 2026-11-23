import { csvCell, CSV_BOM } from '../utils/csv';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas-pro';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { 
  Folder,
  Search,
  HardDrive,
  ArrowRight,
  Shield,
  Layers,
  Database,
  Calendar, 
  Download, 
  Clock, 
  FileText, 
  PieChart as PieChartIcon, 
  Trash2, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  ChevronDown, 
  Eye, 
  MoreVertical, 
  Scan, 
  GitCompare, 
  ArrowUpRight, 
  CheckCircle,
  Leaf,
  Info,
  ArrowUpDown,
  Server,
  X,
  Loader2,
  RefreshCw,
  Sparkles,
  Activity,
  Zap
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip 
} from 'recharts';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { MediaItem, ScanHistoryEntry } from '../types';
import { getProFeatures, ProLockBadge, openUpgrade } from './ProLock';

export interface HistoricalGrowthTimelineEntry {
  period_label: string;       // 'YYYY-MM' (monthly) or 'YYYY-MM-DD' (weekly start)
  uploads_count: number;      // files added in this period
  total_bytes_added: number;  // bytes added in this period
  cumulative_count: number;   // all files up to the end of this period
  cumulative_bytes: number;   // all bytes up to the end of this period
}

export interface HistoricalGrowthData {
  timeline: HistoricalGrowthTimelineEntry[];
  range: string;
}

export interface DailySnapshotEntry {
  date: string;
  total_attachments: number;
  total_bytes: number;
  unused_count: number;
  unused_bytes: number;
  optimized_count: number;
  space_saved_bytes: number;
}

interface ReportsTabProps {
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning') => void;
  mediaList: MediaItem[];
  scanHistory: ScanHistoryEntry[];
  onExportReport?: () => void;
  onNavigateToUsed?: (location?: string) => void;
  onNavigateToUnused?: (location?: string) => void;
  isDarkMode?: boolean;
  isWpConnected?: boolean;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  mediaList,
  scanHistory,
  onExportReport,
  onNavigateToUsed,
  onNavigateToUnused,
  isDarkMode = false,
  isWpConnected,
  onNotify
}) => {
  const [activeSubTab, setActiveSubTab] = useState('Overview');
  const [chartTimeframe, setChartTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  // Date filter state
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [startDate, endDate] = dateRange;

  const storageRef = useRef<HTMLDivElement>(null);

  // WordPress connection & live data state
  const isConnected = isWpConnected ?? (typeof window !== 'undefined' && Boolean((window as any).imgsentry_data || (window as any).imgsentryData));
  const wpData = typeof window !== 'undefined' ? ((window as any).imgsentry_data || (window as any).imgsentryData) : null;
  const ajaxUrl = wpData?.ajax_url || wpData?.ajaxUrl;
  const nonce = wpData?.nonce || wpData?.imgsentry_admin_nonce;

  // Media Trends (live library growth and daily snapshots) is a Business / Professional feature.
  // The server refuses these requests on the Free plan too, so nothing is fetched here.
  const trendsUnlocked = getProFeatures().features.media_trends;

  // 'YYYY-MM' -> 'Nov 2026', 'YYYY-MM-DD' -> 'Nov 4'
  const formatTrendLabel = (label: string): string => {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(label || '');
    if (!m) return label || '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1));
    return m[3]
      ? d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })
      : d.toLocaleDateString([], { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const [historicalGrowth, setHistoricalGrowth] = useState<HistoricalGrowthData | null>(null);
  const [dailySnapshots, setDailySnapshots] = useState<DailySnapshotEntry[]>([]);
  const [isLoadingGrowth, setIsLoadingGrowth] = useState<boolean>(false);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isTriggeringSnapshot, setIsTriggeringSnapshot] = useState<boolean>(false);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);
  const [growthError, setGrowthError] = useState<string | null>(null);

  // Fetch retroactive growth stats from Part 1 endpoint (imgsentry_get_historical_growth)
  const fetchHistoricalGrowth = useCallback(async (timeframe = chartTimeframe) => {
    if (!isConnected || !trendsUnlocked || !ajaxUrl) return;
    setIsLoadingGrowth(true);
    setGrowthError(null);
    try {
      const rangeParam = timeframe === 'weekly' ? '3months' : timeframe === 'monthly' ? '12months' : '6months';
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_historical_growth');
      if (nonce) fd.append('nonce', nonce);
      fd.append('range', rangeParam);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success && json.data) {
        setHistoricalGrowth(json.data);
      } else {
        setGrowthError(json.data?.message || 'Failed to fetch historical growth data');
      }
    } catch (err: any) {
      console.error('Failed to fetch historical growth stats:', err);
      setGrowthError(err.message || 'Network error fetching growth data');
    } finally {
      setIsLoadingGrowth(false);
    }
  }, [isConnected, trendsUnlocked, ajaxUrl, nonce, chartTimeframe]);

  // Fetch daily snapshots from Part 2 endpoint (imgsentry_get_daily_snapshots)
  const fetchDailySnapshots = useCallback(async () => {
    if (!isConnected || !trendsUnlocked || !ajaxUrl) return;
    setIsLoadingSnapshots(true);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_daily_snapshots');
      if (nonce) fd.append('nonce', nonce);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success && json.data?.snapshots) {
        setDailySnapshots(json.data.snapshots);
      }
    } catch (err: any) {
      console.error('Failed to fetch daily snapshots:', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [isConnected, trendsUnlocked, ajaxUrl, nonce]);

  // Trigger immediate daily snapshot via Part 2 endpoint (imgsentry_trigger_daily_snapshot)
  const handleTriggerDailySnapshot = async () => {
    if (!isConnected || !trendsUnlocked || !ajaxUrl || isTriggeringSnapshot) return;
    setIsTriggeringSnapshot(true);
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_trigger_daily_snapshot');
      if (nonce) fd.append('nonce', nonce);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();
      if (json.success) {
        if (json.data?.snapshots) {
          setDailySnapshots(json.data.snapshots);
        } else if (json.data?.snapshot) {
          setDailySnapshots(prev => {
            const date = json.data.snapshot.date;
            return [...prev.filter(s => s.date !== date), json.data.snapshot];
          });
        }
        setSnapshotToast(json.data?.message || 'Daily snapshot captured successfully for today.');
        setTimeout(() => setSnapshotToast(null), 4000);
      }
    } catch (err) {
      console.error('Failed to trigger daily snapshot:', err);
    } finally {
      setIsTriggeringSnapshot(false);
    }
  };

  useEffect(() => {
    if (isConnected && trendsUnlocked) {
      fetchHistoricalGrowth(chartTimeframe);
      fetchDailySnapshots();
    }
  }, [isConnected, trendsUnlocked, chartTimeframe, fetchHistoricalGrowth, fetchDailySnapshots]);

  const filteredHistory = useMemo(() => {
    return scanHistory.filter(h => {
      if (!startDate || !endDate) return true;
      if (!h.timestamp || typeof h.timestamp !== 'string') return false;
      const normalized = h.timestamp.includes('T') ? h.timestamp : h.timestamp.replace(' ', 'T');
      const d = new Date(normalized);
      const start = startDate;
      const end = endDate;
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    });
  }, [scanHistory, startDate, endDate]);

  const subTabs = [
    'Overview',
    'Storage Analysis',
    'Location Analysis'
  ];

  // Dynamic calculations based on live state
  const activeItems = mediaList.filter(i => !i.isTrashed);
  const totalCount = activeItems.length || 1;
  const usedCount = activeItems.filter(i => i.inUse).length;
  const unusedCount = activeItems.filter(i => !i.inUse).length;

  const totalScans = filteredHistory.length;
  const filesScanned = filteredHistory.reduce((sum, h) => sum + (h.totalScanned || 0), 0);
  const unusedFilesFound = filteredHistory.reduce((sum, h) => sum + (h.unusedCount || 0), 0);
  const usedFilesFound = filteredHistory.reduce((sum, h) => sum + (h.usedCount || 0), 0);
  const filesDeleted = filteredHistory.reduce((sum, h) => sum + (h.deletedCount || 0), 0);
  const spaceRecoveredBytes = filteredHistory.reduce((sum, h) => sum + (h.unusedSizeBytes || 0), 0);
  const formattedSpaceRecovered = (spaceRecoveredBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  const spaceUsedBytes = filteredHistory.reduce((sum, h) => sum + (h.usedSizeBytes || 0), 0);
  const formattedSpaceUsed = (spaceUsedBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  const avgScanTimeSeconds = totalScans > 0 ? filteredHistory.reduce((sum, h) => sum + (h.durationSeconds || 0), 0) / totalScans : 0;
  const avgScanTime = `${Math.floor(avgScanTimeSeconds / 60)}m ${Math.floor(avgScanTimeSeconds % 60)}s`;

  // Data for Line Chart (Files Scanned & Space Recovered)
  const lineChartData = useMemo(() => {
    if (filteredHistory.length === 0) return [];
    
    const groups: Record<string, { filesScanned: number, spaceRecovered: number, spaceUsed: number }> = {};
    
    filteredHistory.forEach(h => {
      if (!h.timestamp || typeof h.timestamp !== 'string') return;
      const normalized = h.timestamp.includes('T') ? h.timestamp : h.timestamp.replace(' ', 'T');
      const d = new Date(normalized);
      let key = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      if (chartTimeframe === 'weekly') {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = `Week ${startOfWeek.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
      } else if (chartTimeframe === 'monthly') {
        key = d.toLocaleDateString([], { month: 'short', year: 'numeric' });
      }
      
      if (!groups[key]) groups[key] = { filesScanned: 0, spaceRecovered: 0, spaceUsed: 0 };
      groups[key].filesScanned += h.totalScanned;
      groups[key].spaceRecovered += Math.round((h.unusedSizeBytes || 0) / (1024 * 1024));
      groups[key].spaceUsed += Math.round((h.usedSizeBytes || 0) / (1024 * 1024));
    });

    return Object.entries(groups).map(([date, data]) => ({
      date,
      filesScanned: data.filesScanned,
      spaceRecovered: data.spaceRecovered,
      spaceUsed: data.spaceUsed
    }));
  }, [filteredHistory, chartTimeframe]);

  // Data for File Status Overview Donut
  const fileStatusData = [
    { name: 'Used Files', value: usedCount, color: '#10B981', percentage: `${Math.round(usedCount / totalCount * 100)}%` },
    { name: 'Unused Files', value: unusedCount, color: '#EF4444', percentage: `${Math.round(unusedCount / totalCount * 100)}%` }
  ];

  // Data for Scan Type Breakdown Donut
  const scanTypesCount: Record<string, number> = {};
  if (filteredHistory.length > 0) {
    filteredHistory.forEach(s => {
      // Exclude 'Custom Scan' and 'Others'
      if (s.scanType !== 'Custom Scan' && s.scanType !== 'Others') {
        scanTypesCount[s.scanType] = (scanTypesCount[s.scanType] || 0) + 1;
      }
    });
  }
  const filteredTotalScans = Object.values(scanTypesCount).reduce((a, b) => a + b, 0) || 1;
  const scanTypeColors = ['#6366F1', '#3B82F6', '#10B981', '#EC4899'];
  const scanTypeData = Object.keys(scanTypesCount).length > 0
    ? Object.entries(scanTypesCount).map(([name, value], idx) => ({
        name,
        value,
        percentage: `${Math.round(value / filteredTotalScans * 100)}%`,
        color: scanTypeColors[idx % scanTypeColors.length]
      }))
    : [];

  // Data for Storage Recovered Bar Chart
  const storageBarData = useMemo(() => {
    if (filteredHistory.length === 0) return [];
    
    const groups: Record<string, number> = {};
    
    filteredHistory.forEach(h => {
      if (!h.timestamp || typeof h.timestamp !== 'string') return;
      const normalized = h.timestamp.includes('T') ? h.timestamp : h.timestamp.replace(' ', 'T');
      const d = new Date(normalized);
      let key = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      if (chartTimeframe === 'weekly') {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = `Week ${startOfWeek.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
      } else if (chartTimeframe === 'monthly') {
        key = d.toLocaleDateString([], { month: 'short', year: 'numeric' });
      }
      
      groups[key] = (groups[key] || 0) + Math.round(h.unusedSizeBytes / (1024 * 1024));
    });

    return Object.entries(groups).map(([day, mb]) => ({
      day,
      mb
    }));
  }, [filteredHistory, chartTimeframe]);

  // Combined Active Line Chart Data (Prefers real backend historical growth data when connected)
  const activeLineChartData = useMemo(() => {
    if (isConnected && trendsUnlocked && historicalGrowth?.timeline && historicalGrowth.timeline.length > 0) {
      if (chartTimeframe === 'daily' && dailySnapshots.length > 0) {
        return dailySnapshots.map(s => ({
          date: s.date.length > 5 ? s.date.slice(5) : s.date,
          filesScanned: s.total_attachments,
          spaceRecovered: Math.round((s.space_saved_bytes || 0) / (1024 * 1024)),
          spaceUsed: Math.round((s.total_bytes || 0) / (1024 * 1024)),
          unusedCount: s.unused_count,
          unusedMb: Math.round((s.unused_bytes || 0) / (1024 * 1024)),
          optimizedCount: s.optimized_count
        }));
      }

      return historicalGrowth.timeline.map(t => ({
        date: formatTrendLabel(t.period_label),
        filesScanned: t.cumulative_count || 0,
        spaceRecovered: Math.round((t.total_bytes_added || 0) / (1024 * 1024)),
        spaceUsed: Math.round((t.cumulative_bytes || 0) / (1024 * 1024)),
        filesAdded: t.uploads_count || 0,
        bytesAddedMb: Math.round((t.total_bytes_added || 0) / (1024 * 1024))
      }));
    }

    return lineChartData;
  }, [isConnected, trendsUnlocked, historicalGrowth, dailySnapshots, chartTimeframe, lineChartData]);

  // Combined Active Storage Bar Data (Prefers real backend data when connected)
  const activeStorageBarData = useMemo(() => {
    if (isConnected && trendsUnlocked && historicalGrowth?.timeline && historicalGrowth.timeline.length > 0) {
      if (chartTimeframe === 'daily' && dailySnapshots.length > 0) {
        return dailySnapshots.map(s => ({
          day: s.date.length > 5 ? s.date.slice(5) : s.date,
          mb: Math.max(0, Math.round((s.space_saved_bytes || s.unused_bytes || 0) / (1024 * 1024)))
        }));
      }

      return historicalGrowth.timeline.map(t => ({
        day: formatTrendLabel(t.period_label),
        mb: Math.max(0, Math.round((t.total_bytes_added || 0) / (1024 * 1024)))
      }));
    }

    return storageBarData;
  }, [isConnected, trendsUnlocked, historicalGrowth, dailySnapshots, chartTimeframe, storageBarData]);

  // Daily Snapshot Trends Data for Optimization & Space Saving
  const snapshotTrendsData = useMemo(() => {
    if (dailySnapshots.length > 0) {
      return dailySnapshots.map(s => ({
        date: s.date.length > 5 ? s.date.slice(5) : s.date,
        fullDate: s.date,
        totalFiles: s.total_attachments,
        unusedFiles: s.unused_count,
        optimizedFiles: s.optimized_count,
        totalMb: Math.round(s.total_bytes / (1024 * 1024)),
        unusedMb: Math.round(s.unused_bytes / (1024 * 1024)),
        savedMb: Number(((s.space_saved_bytes || 0) / (1024 * 1024)).toFixed(2)),
      }));
    }
    return [];
  }, [dailySnapshots]);

  // Data for File Types Distribution Donut
  const catMapping = [
    { key: 'images', label: 'Images (JPG, PNG, WebP, etc.)', color: '#6366F1' },
    { key: 'documents', label: 'Documents (PDF, DOC, etc.)', color: '#3B82F6' },
    { key: 'video', label: 'Videos (MP4, WebM, etc.)', color: '#F97316' },
    { key: 'fonts', label: 'Fonts (WOFF, TTF, etc.)', color: '#8B5CF6' },
    { key: 'audio', label: 'Audio (MP3, WAV, etc.)', color: '#10B981' },
    { key: 'other', label: 'Others (SVG, ICO, etc.)', color: '#9CA3AF' }
  ];
  const fileTypesDistData = catMapping.map(cat => {
    const count = activeItems.filter(i => i.category === cat.key).length;
    return {
      name: cat.label,
      count: count.toLocaleString(),
      percentage: `${Math.round(count / totalCount * 100)}%`,
      color: cat.color
    };
  });

  // Storage Analysis numbers (hooks live here, not inside the view, so the view keeps its state)
  const storageStats = useMemo(() => {
    const active = mediaList.filter(i => !i.isTrashed);
    const totalSize = active.reduce((sum, i) => sum + (i.fileSize || 0), 0);
    
    const categories = [
      { name: 'Images', icon: <Eye className="w-4 h-4" />, color: '#6366F1', bg: 'bg-indigo-100', text: 'text-indigo-600', matchRule: (i: MediaItem) => i.category === 'images' && i.extension !== 'svg' },
      { name: 'Videos', icon: <Scan className="w-4 h-4" />, color: '#3B82F6', bg: 'bg-blue-100', text: 'text-blue-600', matchRule: (i: MediaItem) => i.category === 'video' },
      { name: 'PDF', icon: <FileText className="w-4 h-4" />, color: '#10B981', bg: 'bg-emerald-100', text: 'text-emerald-600', matchRule: (i: MediaItem) => i.category === 'documents' && i.extension === 'pdf' },
      { name: 'SVG', icon: <PieChartIcon className="w-4 h-4" />, color: '#F59E0B', bg: 'bg-amber-100', text: 'text-amber-600', matchRule: (i: MediaItem) => i.extension === 'svg' },
      { name: 'Audio', icon: <Clock className="w-4 h-4" />, color: '#EF4444', bg: 'bg-rose-100', text: 'text-rose-600', matchRule: (i: MediaItem) => i.category === 'audio' },
      { name: 'Documents', icon: <MoreVertical className="w-4 h-4" />, color: '#94A3B8', bg: 'bg-slate-100', text: 'text-slate-600', matchRule: (i: MediaItem) => !['images', 'video', 'audio'].includes(i.category) && i.extension !== 'pdf' && i.extension !== 'svg' },
    ];

    const data = categories.map(cat => {
      const catFiles = active.filter(cat.matchRule);
      const catSize = catFiles.reduce((sum, i) => sum + (i.fileSize || 0), 0);
      const count = catFiles.length;
      const percentage = totalSize > 0 ? (catSize / totalSize * 100) : 0;
      
      let formattedSize = '';
      if (catSize >= 1024 * 1024 * 1024) {
        formattedSize = (catSize / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
      } else {
        formattedSize = (catSize / (1024 * 1024)).toFixed(0) + ' MB';
      }

      return {
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        bg: cat.bg,
        text: cat.text,
        size: catSize,
        count,
        formattedSize,
        percentageValue: percentage,
        percentage: percentage.toFixed(2) + '%'
      };
    });

    const totalFormatted = totalSize >= 1024 * 1024 * 1024 
      ? (totalSize / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
      : (totalSize / (1024 * 1024)).toFixed(1) + ' MB';

    const unusedSize = active.filter(i => !i.inUse).reduce((sum, i) => sum + (i.fileSize || 0), 0);
    const recoverableFormatted = unusedSize >= 1024 * 1024 * 1024
      ? (unusedSize / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
      : (unusedSize / (1024 * 1024)).toFixed(1) + ' MB';

    return { data, totalSize, totalFormatted, recoverableFormatted };
  }, [mediaList]);

  const storageChartRef = useRef<HTMLDivElement>(null);

  const StorageAnalysisView = () => {
    const stats = storageStats;
    const chartRef = storageChartRef;

    const handleExportPDF = async () => {
      try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        // Background
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(30, 41, 59); // slate-800
        doc.text('Storage Analysis Report', 15, 20);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 28);

        // Summary Section
        doc.setFillColor(248, 250, 252); // slate-50
        doc.roundedRect(15, 35, pageWidth - 30, 32, 3, 3, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text('OVERALL STATISTICS', 20, 43);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Total Storage Occupied:`, 20, 52);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(stats.totalFormatted, 80, 52);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Recoverable Space:`, 20, 60);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(79, 70, 229); // indigo-600
        doc.text(stats.recoverableFormatted, 80, 60);

        let currentY = 75;

        // Capture Chart
        if (chartRef.current) {
          const canvas = await html2canvas(chartRef.current, { scale: 2, logging: false });
          const imgData = canvas.toDataURL('image/png');
          const imgProps = doc.getImageProperties(imgData);
          // Scale image to fit width (leaving 15mm margin on each side)
          const pdfImgWidth = pageWidth - 30;
          const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
          
          doc.addImage(imgData, 'PNG', 15, currentY, pdfImgWidth, pdfImgHeight);
          currentY += pdfImgHeight + 10;
        }

        // Data Table
        const tableData = stats.data.map(item => [
          item.name,
          item.count.toLocaleString(),
          item.formattedSize,
          item.percentage
        ]);

        autoTable(doc, {
          head: [['FILE TYPE', 'TOTAL FILES', 'STORAGE USED', 'PERCENTAGE']],
          body: tableData,
          startY: currentY,
          theme: 'grid',
          headStyles: { 
            fillColor: [79, 70, 229], 
            fontSize: 10,
            fontStyle: 'bold',
            halign: 'center',
            cellPadding: 4
          },
          columnStyles: {
            0: { fontStyle: 'bold', halign: 'left', cellWidth: 50 },
            1: { halign: 'center' },
            2: { halign: 'right' },
            3: { halign: 'right' }
          },
          styles: {
            fontSize: 9,
            cellPadding: 4,
            lineColor: [226, 232, 240]
          },
          margin: { left: 15, right: 15 },
          didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 0) {
              const item = stats.data[data.row.index];
              if (item && item.color) {
                // Convert hex to RGB for jsPDF
                const r = parseInt(item.color.slice(1, 3), 16);
                const g = parseInt(item.color.slice(3, 5), 16);
                const b = parseInt(item.color.slice(5, 7), 16);
                doc.setFillColor(r, g, b);
                doc.rect(data.cell.x + 2, data.cell.y + 3, 3, 3, 'F');
              }
            }
          }
        });

        // Add a small insight box
        const finalY = (doc as any).lastAutoTable.finalY + 15;
        doc.setFillColor(245, 247, 255); // indigo-50
        doc.setDrawColor(224, 231, 255); // indigo-100
        doc.roundedRect(15, finalY, pageWidth - 30, 25, 3, 3, 'FD');
        
        doc.setFontSize(9);
        doc.setTextColor(79, 70, 229); // indigo-600
        doc.setFont('helvetica', 'bold');
        doc.text('ANALYTICS INSIGHT', 20, finalY + 8);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(`Your library contains ${stats.data.length} main file categories. Regular cleanup of unused files can save up to ${stats.recoverableFormatted} of server storage.`, 20, finalY + 15, { maxWidth: pageWidth - 40 });

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('ImgSentry - Media Library Analytics', pageWidth / 2, pageHeight - 10, { align: 'center' });

        doc.save(`storage-analysis-${new Date().getTime()}.pdf`);
      } catch (error) {
        console.error('Error generating PDF:', error);
        onNotify?.('Could not generate PDF. Please try again.', 'error');
      }
    };

    return (
      <div ref={storageRef} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Top Header with Export Report Button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Storage Analysis</h2>
              <button className="text-slate-400 hover:text-slate-600 dark:hover:text-[#e7ecf3] transition-colors">
                <Clock className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Distribution of storage space by file type.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExportPDF}
              className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden storage-analysis-card">
          <div className="p-4 md:p-6 flex flex-col lg:flex-row gap-8 items-start">
            {/* Left: Donut Chart */}
            <div ref={chartRef} className="lg:w-1/3 flex flex-col items-center gap-6 pt-4 storage-chart-container">
              <div className="relative w-64 h-64 min-h-[256px] min-w-[256px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                  <PieChart>
                    <Pie
                      data={stats.data}
                      cx="50%"
                      cy="50%"
                      innerRadius={85}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="size"
                      stroke="none"
                    >
                      {stats.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                      allowEscapeViewBox={{ x: true, y: true }} 
                      content={<CustomPieTooltip />} 
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Storage</span>
                  <span className="text-3xl font-black text-slate-900 dark:text-white leading-none">{stats.totalFormatted}</span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2">100%</span>
                </div>
              </div>

              {/* Explainer box */}
              <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-4 flex items-start gap-3 w-full max-w-xs">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
                  This chart shows how your media library storage is distributed across file types.
                </p>
              </div>
            </div>

            {/* Right: List */}
            <div className="flex-1 w-full pt-4">
              <div className="flex items-center text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-6 px-4">
                <div className="w-10 md:w-12"></div>
                <div className="flex-1">File Type</div>
                <div className="w-12 md:w-16 lg:w-20 text-right">Total File</div>
                <div className="w-32 md:w-40 text-right">Storage Used</div>
                <div className="hidden sm:block w-20 md:w-24 text-right">Percentage</div>
              </div>

              <div className="space-y-1">
                {stats.data.map((item) => (
                  <div key={item.name} className="group hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl p-4 transition-all flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl ${item.bg} ${item.text} flex items-center justify-center shrink-0 shadow-sm`}>
                      {item.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">{item.name}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: item.percentage }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="h-full rounded-full" 
                          style={{ backgroundColor: item.color }} 
                        />
                      </div>
                    </div>

                    <div className="w-12 md:w-16 lg:w-20 text-right font-bold text-slate-600 dark:text-slate-400 text-sm">
                      {item.count}
                    </div>

                    <div className="w-32 md:w-40 text-right font-bold text-slate-900 dark:text-white text-sm">
                      {item.formattedSize}
                    </div>

                    <div className="hidden sm:block w-20 md:w-24 text-right">
                      <span className="bg-indigo-50 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 text-[11px] font-black px-2.5 py-1 rounded-lg">
                        {item.percentage}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer: Recoverable Space */}
          <div className="bg-indigo-50 dark:bg-indigo-950 border-t border-slate-100 dark:border-slate-700 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6 divide-x divide-slate-200 dark:divide-slate-700">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
                  <GitCompare className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">Recoverable Space</span>
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{stats.recoverableFormatted}</span>
                </div>
              </div>
              <div className="pl-6 max-w-xs">
                <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-400 leading-relaxed">
                  This is the actual space you can recover by removing unused and duplicate files.
                </p>
              </div>
            </div>
            <button 
              onClick={() => onNavigateToUnused?.()}
              className="bg-[#A61E69] hover:bg-[#8F1B5A] text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-[#A61E69] transition-all hover:-translate-y-0.5 active:translate-y-0 group"
            >
              <span>View Unused Files</span>
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Calculate real location stats globally
  const locationStats = useMemo(() => {
    const active = mediaList.filter(i => !i.isTrashed);
    const totalSize = active.reduce((sum, i) => sum + (i.fileSize || 0), 0);
    const totalFiles = active.length;

    // Group by location
    const groups: { [key: string]: { name: string; path: string; files: number; size: number; unusedFiles: number; recoverable: number; color: string; icon: React.ReactNode } } = {};
    
    const locationConfigs: { [key: string]: { name: string; path: string; color: string; icon: React.ReactNode } } = {
      'uploads': { name: 'Uploads Folder', path: '/wp-content/uploads/', color: '#6366F1', icon: <Folder className="w-4 h-4" /> },
      'themes': { name: 'Themes', path: '/wp-content/themes/', color: '#3B82F6', icon: <Eye className="w-4 h-4" /> },
      'plugins': { name: 'Plugins', path: '/wp-content/plugins/', color: '#10B981', icon: <Layers className="w-4 h-4" /> },
      'cache': { name: 'Cache', path: '/wp-content/cache/', color: '#F59E0B', icon: <Database className="w-4 h-4" /> },
      'backups': { name: 'Backups', path: '/wp-content/ai1wm-backups/', color: '#EF4444', icon: <Trash2 className="w-4 h-4" /> },
      'custom': { name: 'Custom Folders', path: '/wp-content/custom/', color: '#06B6D4', icon: <Folder className="w-4 h-4" /> },
      'others': { name: 'Others', path: 'Various locations', color: '#94A3B8', icon: <MoreVertical className="w-4 h-4" /> },
    };

    active.forEach(item => {
      const loc = (item.location || 'others').toLowerCase();
      let key = 'others';
      if (loc.includes('uploads')) key = 'uploads';
      else if (loc.includes('themes')) key = 'themes';
      else if (loc.includes('plugins')) key = 'plugins';
      else if (loc.includes('cache')) key = 'cache';
      else if (loc.includes('backups') || loc.includes('ai1wm-backups')) key = 'backups';
      else if (loc.includes('custom')) key = 'custom';

      if (!groups[key]) {
        groups[key] = {
          ...locationConfigs[key],
          path: item.location || 'Various locations',
          files: 0,
          size: 0,
          unusedFiles: 0,
          recoverable: 0
        };
      }

      groups[key].files += 1;
      groups[key].size += (item.fileSize || 0);
      if (!item.inUse) {
        groups[key].unusedFiles += 1;
        groups[key].recoverable += (item.fileSize || 0);
      }
    });

    const formatSize = (bytes: number) => {
      if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const locations = Object.values(groups).map(l => ({
      ...l,
      percentage: totalSize > 0 ? ((l.size / totalSize) * 100).toFixed(1) : '0',
      formattedSize: formatSize(l.size),
      formattedRecoverable: formatSize(l.recoverable)
    })).sort((a, b) => b.size - a.size);

    const totalRecoverable = locations.reduce((sum, l) => sum + l.recoverable, 0);
    const totalRecoverableFormatted = formatSize(totalRecoverable);
    const totalStorageFormatted = formatSize(totalSize);
    const recoverablePercent = totalSize > 0 ? ((totalRecoverable / totalSize) * 100).toFixed(1) : '0';

    return { 
      locations,
      totalFiles,
      totalStorage: totalStorageFormatted,
      recoverable: totalRecoverableFormatted,
      recoverablePercent: recoverablePercent + '%',
      totalLocations: locations.length
    };
  }, [mediaList]);

  const [sortBy, setSortBy] = useState('size-desc');

  const locationSortedStats = useMemo(() => {
    const sortedLocations = [...locationStats.locations].sort((a, b) => {
      if (sortBy === 'size-desc') return b.size - a.size;
      if (sortBy === 'size-asc') return a.size - b.size;
      if (sortBy === 'files-desc') return b.files - a.files;
      if (sortBy === 'files-asc') return a.files - b.files;
      if (sortBy === 'unused-desc') return b.unusedFiles - a.unusedFiles;
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      return b.size - a.size;
    });

    return {
      ...locationStats,
      locations: sortedLocations
    };
  }, [locationStats, sortBy]);

  const locationChartRef = useRef<HTMLDivElement>(null);

  const LocationAnalysisView = () => {
    const stats = locationSortedStats;
    const chartRef = locationChartRef;

    const handleExportPDF = async () => {
      try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        // Background
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(30, 41, 59); // slate-800
        doc.text('Location Analysis Report', 15, 20);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 28);

        // Summary Section
        doc.setFillColor(248, 250, 252); // slate-50
        doc.roundedRect(15, 35, pageWidth - 30, 32, 3, 3, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text('QUICK STATS', 20, 43);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Total Locations:`, 20, 52);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(stats.totalLocations.toString(), 60, 52);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Total Storage:`, 90, 52);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(stats.totalStorage, 125, 52);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Recoverable Space:`, 20, 60);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(79, 70, 229); // indigo-600
        doc.text(`${stats.recoverable} (${stats.recoverablePercent})`, 60, 60);

        let currentY = 75;

        // Capture Chart
        if (chartRef.current) {
          const canvas = await html2canvas(chartRef.current, { scale: 2, logging: false });
          const imgData = canvas.toDataURL('image/png');
          const imgProps = doc.getImageProperties(imgData);
          const pdfImgWidth = pageWidth - 100; // Smaller chart
          const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
          
          doc.addImage(imgData, 'PNG', 50, currentY, pdfImgWidth, pdfImgHeight);
          currentY += pdfImgHeight + 10;
        }

        const tableData = stats.locations.map(l => [
          l.name,
          l.files.toLocaleString(),
          l.formattedSize,
          l.percentage + '%',
          l.unusedFiles.toLocaleString(),
          l.formattedRecoverable
        ]);

        autoTable(doc, {
          head: [['LOCATION', 'FILES', 'STORAGE', '%', 'UNUSED', 'RECOVERABLE']],
          body: tableData,
          startY: currentY,
          theme: 'grid',
          headStyles: { 
            fillColor: [99, 102, 241], 
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { fontStyle: 'bold', halign: 'left', cellWidth: 45 },
            1: { halign: 'center' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'center' },
            5: { halign: 'right', fontStyle: 'bold' }
          },
          styles: {
            fontSize: 8,
            cellPadding: 3,
            lineColor: [226, 232, 240]
          },
          margin: { left: 15, right: 15 }
        });

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('Generated by ImgSentry', pageWidth / 2, pageHeight - 10, { align: 'center' });

        doc.save(`location-analysis-${new Date().getTime()}.pdf`);
      } catch (error) {
        console.error('Error generating PDF:', error);
        onNotify?.('Could not generate PDF. Please try again.', 'error');
      }
    };

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Location Analysis</h2>
              <button className="text-slate-400 hover:text-slate-600 dark:hover:text-[#e7ecf3] transition-colors">
                <Info className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Analyze storage usage by file locations in your WordPress installation.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExportPDF}
              className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        {/* Top Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total Locations</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{stats.totalLocations}</span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Folders scanned</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-[#5B8DEF] flex items-center justify-center shadow-xs">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total Files</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-blue-600 dark:text-[#5B8DEF] leading-none">{stats.totalFiles.toLocaleString()}</span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Across all locations</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-[#4ade80] text-emerald-600 dark:text-[#4ade80] flex items-center justify-center shadow-xs">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total Storage Used</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-emerald-600 dark:text-[#4ade80] leading-none">{stats.totalStorage}</span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">100% of total</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Recoverable Space</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-orange-600 dark:text-orange-400 leading-none">{stats.recoverable}</span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{stats.recoverablePercent} can be recovered</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content: Chart + Table */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Storage by Location Pie Chart */}
          <div ref={chartRef} className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-8">Storage by Location</h3>
            
            <div className="relative w-full aspect-square max-w-[240px] min-h-[200px] min-w-[200px] mx-auto mb-10">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                <PieChart>
                  <Pie
                    data={stats.locations}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="size"
                    stroke="none"
                  >
                    {stats.locations.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                    allowEscapeViewBox={{ x: true, y: true }} 
                    content={<CustomPieTooltip />} 
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-0">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Storage</span>
                <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{stats.totalStorage}</span>
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">100%</span>
              </div>
            </div>

            <div className="space-y-3.5">
              {stats.locations.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">{item.name}</span>
                  </div>
                  <span className="text-[11px] font-black text-slate-900 dark:text-white">{item.formattedSize} ({item.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Location Details Table */}
          <div className="lg:col-span-9 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Location Details</h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-slate-400">Sort by</span>
                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#A61E69]"
                >
                  <option value="size-desc">Storage (High to Low)</option>
                  <option value="size-asc">Storage (Low to High)</option>
                  <option value="files-desc">Files (High to Low)</option>
                  <option value="files-asc">Files (Low to High)</option>
                  <option value="unused-desc">Most Unused Files</option>
                  <option value="name-asc">Name (A-Z)</option>
                </select>
              </div>
            </div>
            
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">
                    <th className="px-6 py-4">Location</th>
                    <th className="px-4 py-4 text-center">Files</th>
                    <th className="px-4 py-4">Storage Used</th>
                    <th className="px-4 py-4">Storage %</th>
                    <th className="px-4 py-4 text-center">Unused Files</th>
                    <th className="px-4 py-4 text-center">Recoverable Space</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {stats.locations.map((item) => (
                    <tr key={item.name} className="group hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs`} style={{ backgroundColor: `${item.color}15`, color: item.color }}>
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-black text-slate-900 dark:text-white truncate">{item.name}</div>
                            <div className="text-[9px] font-medium text-slate-400 truncate">{item.path}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        {item.files.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-[11px] font-black text-slate-900 dark:text-white">
                        {item.formattedSize}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3 min-w-[120px]">
                          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${item.percentage}%` }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 w-8">{item.percentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        {item.unusedFiles.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 text-[10px] font-black px-2 py-1 rounded-lg border border-emerald-100 dark:border-emerald-800">
                          {item.formattedRecoverable}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 text-slate-300 dark:text-slate-600">
                          <button 
                            onClick={() => onNavigateToUsed?.(item.name.replace(' Folder', ''))}
                            className="p-1.5 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            title="View all files in this location"
                          >
                            <Folder className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => onNavigateToUnused?.(item.name.replace(' Folder', ''))}
                            className="p-1.5 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                            title="View unused files in this location"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-900 font-black text-[11px] text-slate-900 dark:text-white">
                    <td className="px-6 py-4">Total</td>
                    <td className="px-4 py-4 text-center">{stats.totalFiles.toLocaleString()}</td>
                    <td className="px-4 py-4">{stats.totalStorage}</td>
                    <td className="px-4 py-4 text-center">100%</td>
                    <td className="px-4 py-4 text-center">{stats.locations.reduce((sum, l) => sum + l.unusedFiles, 0).toLocaleString()}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="bg-emerald-500 text-white px-2 py-1 rounded-lg font-bold">{stats.recoverable}</span>
                    </td>
                    <td className="px-6 py-4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Bottom Row: Bar Charts + Savings Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Top Locations by Files</h3>
              <button className="text-[10px] font-bold text-[#A61E69] hover:text-[#8F1B5A] hover:underline">View All</button>
            </div>
            <div className="space-y-6">
              {stats.locations.slice(0, 4).map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-900 flex items-center justify-center shadow-2xs`} style={{ color: item.color }}>
                        {item.icon}
                      </div>
                      <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-slate-900 dark:text-white">{item.files.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.files / stats.locations[0].files) * 100}%` }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Top Locations by Unused Files</h3>
              <button className="text-[10px] font-bold text-[#A61E69] hover:text-[#8F1B5A] hover:underline">View All</button>
            </div>
            <div className="space-y-6">
              {[...stats.locations].sort((a,b) => b.unusedFiles - a.unusedFiles).slice(0, 4).map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-900 flex items-center justify-center shadow-2xs`} style={{ color: item.color }}>
                        {item.icon}
                      </div>
                      <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-slate-900 dark:text-white">{item.unusedFiles.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: item.unusedFiles > 0 ? `${(item.unusedFiles / Math.max(...stats.locations.map(l => l.unusedFiles))) * 100}%` : '0%' }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 bg-emerald-50 dark:bg-emerald-950 rounded-2xl border border-emerald-100 dark:border-emerald-900 shadow-sm p-6 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-5 shadow-xs">
              <Leaf className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">Potential Savings</h3>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mb-2">{stats.recoverable}</div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-8 max-w-[180px]">
              {stats.recoverablePercent} of total storage can be recovered
            </p>
            <button 
              onClick={() => onNavigateToUnused?.()}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#A61E69] dark:text-[#E052A0] font-bold text-xs py-3 px-6 rounded-2xl flex items-center justify-between transition-all group shadow-2xs"
            >
              <span>View Unused Files</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const recentReports = filteredHistory.length > 0
    ? [...filteredHistory].reverse().map(s => {
        let typeBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
        if (s.scanType.toLowerCase().includes('deep') || s.scanType.toLowerCase().includes('full')) {
          typeBadge = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
        } else if (s.scanType.toLowerCase().includes('quick')) {
          typeBadge = 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
        } else if (s.scanType.toLowerCase().includes('smart')) {
          typeBadge = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
        }
        const hasTs = s.timestamp && typeof s.timestamp === 'string';
        const normalized = hasTs ? (s.timestamp.includes('T') ? s.timestamp : s.timestamp.replace(' ', 'T')) : '';
        const dateVal = normalized ? new Date(normalized) : new Date();
        const dateFormatted = dateVal.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + dateVal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          id: `#${s.id.toUpperCase()}`,
          type: String(s.scanType).replace(/full scan/i, 'Deep Scan'),
          typeBadge,
          startedOn: dateFormatted,
          duration: `${Math.floor(s.durationSeconds / 60)}m ${Math.floor(s.durationSeconds % 60)}s`,
          scanned: s.totalScanned.toLocaleString(),
          unused: s.unusedCount.toLocaleString(),
          used: (s.usedCount || 0).toLocaleString(),
          deleted: (s.deletedCount || 0).toLocaleString(),
          space: s.formattedUnusedSize,
          usedSpace: s.formattedUsedSize || '0 B',
          status: s.status === 'completed' ? 'Completed' : 'Failed'
        };
      })
    : [];

  // Custom styled Tooltip component for Pie and Donut Charts
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const name = data.name;
      const value = data.value;
      const color = data.payload?.color || data.color || '#3b82f6';
      const percentage = data.payload?.percentage || '';

      return (
        <div className="bg-slate-900 text-white border border-slate-700 rounded-xl p-3 shadow-2xl text-xs min-w-[150px] z-50 pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: color }} />
            <span className="font-bold text-slate-200 text-xs">{name}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-1">
            <span className="text-sm font-black text-white">
              {typeof value === 'number' ? (value > 1000 ? value.toLocaleString() : value) : value}
            </span>
            {percentage && (
              <span className="text-[11px] font-bold text-blue-400 bg-blue-950 border border-blue-800 px-1.5 py-0.5 rounded">
                {percentage.toString().includes('%') ? percentage : `${percentage}%`}
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const [selectedReportForView, setSelectedReportForView] = useState<typeof recentReports[0] | null>(null);
  const [fileSearchQuery, setFileSearchQuery] = useState('');

  const getFilesForReport = (row: typeof recentReports[0] | null) => {
    if (!row) return [];
    const scanTypeLower = (row.type || '').toLowerCase();

    if (scanTypeLower.includes('used') && !scanTypeLower.includes('unused')) {
      return mediaList.filter(m => m.inUse && !m.isTrashed);
    } else if (scanTypeLower.includes('unused')) {
      return mediaList.filter(m => !m.inUse && !m.isTrashed);
    } else if (scanTypeLower.includes('trash')) {
      return mediaList.filter(m => m.isTrashed);
    } else {
      // General scan (Smart, Quick, Deep, Scheduled, etc.): return active non-trashed files
      return mediaList.filter(m => !m.isTrashed);
    }
  };

  const overviewChart1Ref = useRef<HTMLDivElement>(null);
  const overviewChart2Ref = useRef<HTMLDivElement>(null);
  const overviewChart3Ref = useRef<HTMLDivElement>(null);

  const handleExportOverviewPDF = async () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.text('Overview Report', 15, 20);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 28);

      let currentY = 35;
      const pdfImgWidth = pageWidth - 30;
      
      const refs = [overviewChart1Ref, overviewChart2Ref, overviewChart3Ref];
      for (const ref of refs) {
        if (ref.current) {
          const canvas = await html2canvas(ref.current, { scale: 2, logging: false });
          const imgData = canvas.toDataURL('image/png');
          const imgProps = doc.getImageProperties(imgData);
          const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
          
          if (currentY + pdfImgHeight > pageHeight - 20) {
            doc.addPage();
            currentY = 20;
          }
          
          doc.addImage(imgData, 'PNG', 15, currentY, pdfImgWidth, pdfImgHeight);
          currentY += pdfImgHeight + 10;
        }
      }

      const tableData = [
        ['Total Scans', totalScans.toString()],
        ['Files Scanned', filesScanned.toLocaleString()],
        ['Unused Files Found', unusedFilesFound.toLocaleString()],
        ['Files Deleted', filesDeleted.toLocaleString()],
        ['Space Recovered', formattedSpaceRecovered],
        ['Avg. Scan Time', avgScanTime]
      ];

      if (currentY + 60 > pageHeight) {
        doc.addPage();
        currentY = 20;
      }

      autoTable(doc, {
        head: [['METRIC', 'VALUE']],
        body: tableData,
        startY: currentY,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], fontStyle: 'bold' }
      });

      doc.save(`overview-report-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      onNotify?.('Could not generate PDF. Please try again.', 'error');
    }
  };

  const handleExportScanFilesCSV = (row: typeof recentReports[0] | null) => {
    if (!row) return;

    const targetFiles = getFilesForReport(row);

    const metaHeader = [
      `"ImgSentry - Scan Report Files Export"`,
      `"Scan ID","${row.id}"`,
      `"Scan Type","${row.type}"`,
      `"Started On","${row.startedOn}"`,
      `"Duration","${row.duration}"`,
      `"Total Files Scanned","${row.scanned}"`,
      `"Unused Files Found","${row.unused}"`,
      `"Used Files Found","${row.used}"`,
      `"Files Deleted / Trashed","${row.deleted}"`,
      `"Space Recovered","${row.space}"`,
      `"Storage In Use","${row.usedSpace}"`,
      `"Status","${row.status}"`,
      `""`,
      `"=== SCAN FILES BREAKDOWN (${targetFiles.length} Records) ==="`,
      `"ID","Filename","Location / Path","Category","Size (Formatted)","Size (Bytes)","MIME Type","Status","Usage Details / Parent","Upload Date"`
    ];

    const dataRows = targetFiles.map(file => {
      const statusText = file.isTrashed ? 'Trashed' : file.inUse ? 'Used' : 'Unused';
      const usageDetail = file.useReasons && file.useReasons.length > 0 
        ? file.useReasons.join(' | ') 
        : (file.parentTitle ? `Attached to: ${file.parentTitle}` : 'No usage detected');
      return [
        file.id,
        csvCell(file.filename || file.title || ''),
        csvCell(file.location || file.url || ''),
        csvCell(file.category || ''),
        csvCell(file.formattedSize || ''),
        file.fileSize || 0,
        csvCell(file.mimeType || ''),
        csvCell(statusText),
        csvCell(usageDetail),
        csvCell(file.uploadDate || '')
      ].join(',');
    });

    const csvText = [...metaHeader, ...dataRows].join('\n');
    const blob = new Blob([CSV_BOM, csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeId = String(row.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `scan_report_${safeId}_files.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-gray-900 dark:text-slate-100">

      {/* SUB-NAVIGATION TABS BAR */}
      <div className="border-b border-gray-200 dark:border-slate-700 flex items-center gap-6 overflow-x-auto text-xs font-bold">
        {subTabs.map((tab) => {
          const isActive = activeSubTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`pb-3 transition-colors cursor-pointer whitespace-nowrap relative ${
                isActive 
                  ? 'text-[#A61E69] dark:text-[#E052A0] font-extrabold border-b-2 border-[#A61E69] dark:border-[#E052A0] -mb-[2px]' 
                  : 'text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {activeSubTab === 'Location Analysis' && LocationAnalysisView()}

      {activeSubTab === 'Overview' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Overview</h2>
              </div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">High-level summary of your media scans and cleanup history.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs font-semibold flex items-center gap-2 text-gray-700 dark:text-slate-200 shadow-sm">
                <DatePicker
                  selectsRange={true}
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(update) => setDateRange(update)}
                  isClearable={false}
                  placeholderText="Select date range"
                  className="bg-transparent border-none outline-none cursor-pointer text-gray-700 dark:text-slate-200 font-semibold w-full"
                  wrapperClassName="!w-full"
                  calendarClassName="!border-none !shadow-2xl !rounded-xl !overflow-hidden"
                  customInput={
                    <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>{startDate ? (endDate ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ...`) : "Select date range"}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  }
                />
              </div>

              <button 
                onClick={handleExportOverviewPDF}
                className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Export Report</span>
              </button>
            </div>
          </div>

          {/* TOP METRICS ROW (5 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* Card 1: Total Scans */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Total Scans</span>
                <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 block leading-none">{totalScans}</div>
                <div className="text-[12px] font-semibold text-purple-700 bg-purple-100 dark:bg-purple-950 dark:text-purple-400 px-2 py-0.5 rounded-md inline-block mt-2">
                  Executed
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Scan className="w-5 h-5" />
              </div>
            </div>

            {/* Card 2: Files Scanned */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Files Scanned</span>
                <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 block leading-none">{filesScanned.toLocaleString()}</div>
                <div className="text-[12px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-400 px-2 py-0.5 rounded-md inline-block mt-2">
                  Total scanned
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            {/* Card 3: Unused Files Found */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Unused Files Found</span>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block leading-none">{unusedFilesFound.toLocaleString()}</div>
                <div className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-[#4ade80] dark:text-[#4ade80] px-2 py-0.5 rounded-md inline-block mt-2">
                  Cleanable files
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            {/* Card 3b: Used Files (New) */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Used Files</span>
                <div className="text-xl font-black text-teal-600 dark:text-teal-400 mt-1 block leading-none">{usedFilesFound.toLocaleString()}</div>
                <div className="text-[12px] font-semibold text-teal-700 bg-teal-100 dark:bg-teal-950 dark:text-teal-400 px-2 py-0.5 rounded-md inline-block mt-2">
                  Active files
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
            </div>

            {/* Card 4: Files Deleted */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block leading-none">Files Deleted</span>
                <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 block leading-none">{filesDeleted.toLocaleString()}</div>
                <div className="text-[12px] font-semibold text-rose-700 bg-rose-100 dark:bg-[#f87171] dark:text-[#f87171] px-2 py-0.5 rounded-md inline-block mt-2">
                  Removed from server
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* MAIN DASHBOARD LAYOUT (2 Columns: Main 8 Cols, Sidebar 4 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT 8 COLUMNS: MAIN CHARTS & RECENT REPORTS */}
            <div className="lg:col-span-8 space-y-5">
              {/* ROW 1: CHARTS (Files Scanned & Space Recovered | File Status Overview) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Chart 1: Files Scanned & Space Recovered */}
                <div ref={overviewChart1Ref} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Files Scanned &amp; Space Recovered</h3>
                      {isConnected && trendsUnlocked && (
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                          Live DB
                        </span>
                      )}
                    </div>
                    <select 
                      value={chartTimeframe}
                      onChange={(e) => setChartTimeframe(e.target.value as 'daily' | 'weekly' | 'monthly')}
                      className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                      <span className="text-gray-600 dark:text-slate-300">Files Scanned</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-gray-600 dark:text-slate-300">Space Recovered (MB)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                      <span className="text-gray-600 dark:text-slate-300">Storage In Use (MB)</span>
                    </div>
                  </div>

                  {/* Line Chart / Loading / Empty State */}
                  <div className="h-48 min-h-[192px] min-w-[200px] w-full flex items-center justify-center">
                    {isLoadingGrowth ? (
                      <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-600 mb-2" />
                        <span className="text-xs font-semibold">Loading media growth data...</span>
                      </div>
                    ) : activeLineChartData.length === 0 ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-gray-50/70 dark:bg-slate-900/40 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                        <Info className="w-5 h-5 text-purple-500 mb-1" />
                        <p className="text-xs font-bold text-gray-800 dark:text-slate-200">Not enough historical data yet</p>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 max-w-xs">
                          Growth data will accumulate over time as media files are processed.
                        </p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                        <LineChart data={activeLineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <Tooltip 
                            wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                            allowEscapeViewBox={{ x: true, y: true }} 
                            contentStyle={{ borderRadius: '8px', fontSize: '11px', backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} 
                          />
                          <Line type="monotone" dataKey="filesScanned" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3, fill: '#8B5CF6' }} />
                          <Line type="monotone" dataKey="spaceRecovered" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: '#10B981' }} />
                          <Line type="monotone" dataKey="spaceUsed" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 3, fill: '#0284c7' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Chart 2: File Status Overview */}
                <div ref={overviewChart2Ref} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                  <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">File Status Overview</h3>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    {/* Donut graphic with center label */}
                    <div className="relative w-36 h-36 min-h-[144px] min-w-[144px] shrink-0 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                        <PieChart>
                          <Pie
                            data={fileStatusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={46}
                            outerRadius={64}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            {fileStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                            allowEscapeViewBox={{ x: true, y: true }} 
                            content={<CustomPieTooltip />} 
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-0">
                        <span className="text-base font-black text-gray-900 dark:text-[#e7ecf3] leading-none">{totalCount.toLocaleString()}</span>
                        <span className="text-[9px] text-gray-400 dark:text-[#8993a8] font-medium mt-0.5">Total Files</span>
                      </div>
                    </div>

                    {/* Donut Legend */}
                    <div className="space-y-3 text-xs pr-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-[#e7ecf3]">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <span>Used Files</span>
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-[#8993a8] font-medium pl-4">
                          {usedCount.toLocaleString()} ({Math.round(usedCount / totalCount * 100)}%)
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-[#e7ecf3]">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                          <span>Unused Files</span>
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-[#8993a8] font-medium pl-4">
                          {unusedCount.toLocaleString()} ({Math.round(unusedCount / totalCount * 100)}%)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ROW 2: CHARTS (Scan Type Breakdown | Storage Recovered) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Chart 3: Scan Type Breakdown */}
                <div ref={overviewChart3Ref} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                  <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Scan Type Breakdown</h3>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {/* Donut Graphic */}
                    <div className="relative w-36 h-36 min-h-[144px] min-w-[144px] shrink-0 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                        <PieChart>
                          <Pie
                            data={scanTypeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={46}
                            outerRadius={64}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            {scanTypeData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                            allowEscapeViewBox={{ x: true, y: true }} 
                            content={<CustomPieTooltip />} 
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-0">
                        <span className="text-xl font-black text-gray-900 dark:text-[#e7ecf3] leading-none">{filteredTotalScans}</span>
                        <span className="text-[9px] text-gray-400 dark:text-[#8993a8] font-medium mt-0.5">Total Scans</span>
                      </div>
                    </div>

                    {/* Legend list */}
                    <div className="space-y-2 text-[11px] pr-2">
                      {scanTypeData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-1.5 font-bold text-gray-800 dark:text-[#e7ecf3]">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span>{item.name}</span>
                          </div>
                          <span className="text-gray-500 dark:text-[#8993a8] font-semibold">{item.value} ({item.percentage})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chart 4: Storage Recovered Bar Chart */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Storage Recovered</h3>
                      {isConnected && trendsUnlocked && (
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                          Live DB
                        </span>
                      )}
                    </div>
                    <select 
                      value={chartTimeframe}
                      onChange={(e) => setChartTimeframe(e.target.value as 'daily' | 'weekly' | 'monthly')}
                      className="bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-2xl font-black text-gray-900 dark:text-white">
                      {activeStorageBarData.reduce((sum, d) => sum + d.mb, 0).toLocaleString()} MB
                    </div>
                  </div>

                  {/* Bar Chart / Loading / Empty */}
                  <div className="h-32 min-h-[128px] min-w-[200px] w-full pt-1 flex items-center justify-center">
                    {isLoadingGrowth ? (
                      <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin text-purple-600 mb-1" />
                        <span className="text-[11px] font-semibold">Updating storage data...</span>
                      </div>
                    ) : activeStorageBarData.length === 0 ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-center p-2 bg-gray-50/70 dark:bg-slate-900/40 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                        <span className="text-[11px] font-medium text-gray-500 dark:text-slate-400">No storage recovery history recorded yet.</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                        <BarChart data={activeStorageBarData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                          <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <Tooltip 
                            wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                            allowEscapeViewBox={{ x: true, y: true }} 
                            contentStyle={{ borderRadius: '8px', fontSize: '11px', backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} 
                          />
                          <Bar dataKey="mb" fill="#7C3AED" radius={[4, 4, 0, 0]} barSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* DAILY SNAPSHOTS & OPTIMIZATION TRENDS (WP-CRON SNAPSHOTS) */}
              {!trendsUnlocked ? (
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col items-center text-center gap-3">
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Media Trends &amp; Daily Snapshots</h3>
                    <ProLockBadge isDarkMode={isDarkMode} />
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 max-w-md">
                    See how your media library grows, how much is unused and how much space optimization saves, day by day.
                    Included in the Business and Professional plans.
                  </p>
                  <button
                    type="button"
                    onClick={() => openUpgrade('media_trends_card', 'media_trends')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#A61E69] hover:bg-[#8c1858] text-white cursor-pointer"
                  >
                    Upgrade to unlock
                  </button>
                </div>
              ) : (
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Daily Snapshots &amp; Optimization Trends</h3>
                      <span className="bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                        WP-Cron Daily
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                      Forward-looking historical snapshots tracking media growth, unused media overhead, and space saved via image optimization.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isConnected && (
                      <button
                        onClick={handleTriggerDailySnapshot}
                        disabled={isTriggeringSnapshot}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        title="Capture a snapshot of the current media library state right now"
                      >
                        {isTriggeringSnapshot ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>{isTriggeringSnapshot ? 'Capturing...' : 'Capture Snapshot Now'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {snapshotToast && (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-200 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{snapshotToast}</span>
                  </div>
                )}

                {/* Snapshot metrics summary */}
                {snapshotTrendsData.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        <div className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Snapshots Stored</div>
                        <div className="text-lg font-black text-gray-900 dark:text-white mt-0.5">{dailySnapshots.length} Days</div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500 font-medium mt-0.5">365-day rolling retention</div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        <div className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Latest Unused Overhead</div>
                        <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
                          {snapshotTrendsData[snapshotTrendsData.length - 1]?.unusedMb.toLocaleString() || 0} MB
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500 font-medium mt-0.5">
                          {snapshotTrendsData[snapshotTrendsData.length - 1]?.unusedFiles.toLocaleString() || 0} unused files
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        <div className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Optimized Media</div>
                        <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {snapshotTrendsData[snapshotTrendsData.length - 1]?.optimizedFiles.toLocaleString() || 0} Items
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500 font-medium mt-0.5">Compressed media files</div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        <div className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Space Saved (Optimization)</div>
                        <div className="text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
                          {snapshotTrendsData[snapshotTrendsData.length - 1]?.savedMb.toLocaleString() || 0} MB
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500 font-medium mt-0.5">Total disk savings</div>
                      </div>
                    </div>

                    {/* Snapshot Trend Chart */}
                    <div className="h-44 min-h-[176px] w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                        <AreaChart data={snapshotTrendsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="savedColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="unusedColor" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                          <Tooltip 
                            wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                            contentStyle={{ borderRadius: '8px', fontSize: '11px', backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }} 
                          />
                          <Area type="monotone" dataKey="unusedMb" name="Unused Storage (MB)" stroke="#EF4444" fillOpacity={1} fill="url(#unusedColor)" />
                          <Area type="monotone" dataKey="savedMb" name="Space Saved via Optimization (MB)" stroke="#8B5CF6" fillOpacity={1} fill="url(#savedColor)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-50/60 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950/80 flex items-center justify-center text-purple-600 dark:text-purple-300">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-slate-200">No Daily Snapshots Recorded Yet</p>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 max-w-md">
                        The WordPress cron job captures daily snapshots automatically at midnight to build accurate forward-looking optimization and space recovery graphs.
                      </p>
                    </div>
                    {isConnected && (
                      <button
                        onClick={handleTriggerDailySnapshot}
                        disabled={isTriggeringSnapshot}
                        className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {isTriggeringSnapshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        <span>Take First Snapshot Now</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* ROW 3: RECENT SCAN REPORTS TABLE */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden shadow-sm p-5 space-y-4">
                <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Recent Scan Reports</h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 font-bold bg-gray-50 dark:bg-slate-900">
                        <th className="py-2.5 px-3">Scan ID</th>
                        <th className="py-2.5 px-3">Scan Type</th>
                        <th className="py-2.5 px-3">Started On</th>
                        <th className="py-2.5 px-3">Duration</th>
                        <th className="py-2.5 px-3">Files Scanned</th>
                        <th className="py-2.5 px-3">Unused Found</th>
                        <th className="py-2.5 px-3">Used Found</th>
                        <th className="py-2.5 px-3">Deleted</th>
                        <th className="py-2.5 px-3">Space Recovered</th>
                        <th className="py-2.5 px-3">Storage In Use</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                      {recentReports.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-gray-900 dark:text-white">{row.id}</td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-current ${row.typeBadge}`}>
                              {row.type}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-gray-600 dark:text-slate-300 font-medium">{row.startedOn}</td>
                          <td className="py-3 px-3 whitespace-nowrap text-gray-600 dark:text-slate-300 font-medium">{row.duration}</td>
                          <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">{row.scanned}</td>
                          <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">{row.unused}</td>
                          <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">{row.used}</td>
                          <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">{row.deleted}</td>
                          <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">{row.space}</td>
                          <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">{row.usedSpace}</td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {row.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1 text-gray-400">
                              <button 
                                onClick={() => setSelectedReportForView(row)}
                                title="View Scan Report & Files"
                                className="p-1 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleExportScanFilesCSV(row)}
                                title="Download Scan Report Files (CSV)"
                                className="p-1 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleExportScanFilesCSV(row)}
                                title="Export Options"
                                className="p-1 hover:text-gray-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* RIGHT 4 COLUMNS: SIDEBAR SUMMARY & INSIGHTS CARDS */}
            <div className="lg:col-span-4 space-y-5">
              {/* Card 1: Summary */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Summary</h3>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-gray-600 dark:text-slate-300">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Report Period</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {startDate && endDate ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'All Time'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600 dark:text-slate-300">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Generated On</span>
                    <span className="font-bold text-gray-900 dark:text-white">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  <div className="border-t border-gray-100 dark:border-slate-700 pt-2 flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Total Scans</span>
                    <span className="font-extrabold text-gray-900 dark:text-white">{totalScans}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Files Scanned</span>
                    <span className="font-extrabold text-gray-900 dark:text-white">{(filesScanned ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Unused Files Found</span>
                    <span className="font-extrabold text-gray-900 dark:text-white">{(unusedFilesFound ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Files Deleted</span>
                    <span className="font-extrabold text-gray-900 dark:text-white">{(filesDeleted ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Space Recovered</span>
                    <span className="font-extrabold text-gray-900 dark:text-white">{formattedSpaceRecovered}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Avg. Scan Time</span>
                    <span className="font-extrabold text-gray-900 dark:text-white">{avgScanTime}</span>
                  </div>
                  <div className="border-t border-gray-100 dark:border-slate-700 pt-2 flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Scan Type</span>
                    <span className="font-bold text-gray-900 dark:text-white">All</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">Locations Scanned</span>
                    <span className="font-bold text-gray-900 dark:text-white">{locationStats.totalLocations}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-500 dark:text-slate-400">File Types Scanned</span>
                    <span className="font-bold text-gray-900 dark:text-white">{new Set(activeItems.map(i => i.category)).size}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Top Locations (by Size) */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Top Locations (by Size)</h3>

                <div className="space-y-3.5 text-xs">
                  {locationStats.locations.slice(0, 5).map((locItem, idx) => {
                    const progressColors = [
                      'bg-purple-600',
                      'bg-purple-600',
                      'bg-purple-600',
                      'bg-purple-600',
                      'bg-purple-600'
                    ];
                    return (
                      <div key={locItem.name} className="space-y-1">
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold text-gray-900 dark:text-white truncate pr-2 max-w-[150px]" title={locItem.path}>{locItem.path}</span>
                          <span className="text-gray-500 dark:text-slate-400 shrink-0">{locItem.formattedSize} ({locItem.percentage}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full ${progressColors[idx % progressColors.length]} rounded-full`} style={{ width: `${locItem.percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {locationStats.locations.length === 0 && (
                    <div className="text-gray-500 dark:text-slate-400 text-center py-4">No data available</div>
                  )}
                </div>
              </div>

              {/* Card 3: File Types Distribution */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-4">
                <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">File Types Distribution</h3>

                <div className="flex items-center gap-3">
                  {/* Donut Graphic */}
                  <div className="relative w-28 h-28 min-h-[112px] min-w-[112px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100} className="relative z-10">
                      <PieChart>
                        <Pie
                          data={fileTypesDistData}
                          cx="50%"
                          cy="50%"
                          innerRadius={32}
                          outerRadius={48}
                          paddingAngle={2}
                          dataKey="count"
                          stroke="none"
                        >
                          {fileTypesDistData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          wrapperStyle={{ zIndex: 9999, outline: 'none' }} 
                          allowEscapeViewBox={{ x: true, y: true }} 
                          content={<CustomPieTooltip />} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Donut Legend List */}
                  <div className="space-y-1.5 text-[10px] flex-1">
                    {fileTypesDistData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 font-semibold text-gray-700 dark:text-[#e7ecf3] truncate max-w-[120px]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="truncate">{item.name.split(' ')[0]}</span>
                        </div>
                        <span className="text-gray-500 dark:text-[#8993a8] font-mono font-bold">{item.count} ({item.percentage})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 4: Report Insights */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm space-y-3">
                <h3 className="font-extrabold text-xs text-gray-900 dark:text-white">Report Insights</h3>

                <div className="space-y-2.5 text-xs text-gray-700 dark:text-slate-300">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>You have <strong>{(unusedFilesFound ?? 0).toLocaleString()}</strong> unused files taking up <strong>{formattedSpaceRecovered}</strong> of space.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Your most used file type is <strong>{fileTypesDistData.sort((a, b) => parseInt(b.count.replace(/,/g, '')) - parseInt(a.count.replace(/,/g, '')))[0]?.name || 'N/A'}</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>You have performed <strong>{totalScans}</strong> scans in the selected period.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>You have recovered <strong>{formattedSpaceRecovered}</strong> space.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'Storage Analysis' && StorageAnalysisView()}

      {/* SCAN REPORT DETAILS & FILE AUDIT MODAL */}
      {selectedReportForView && (
        <div className="fixed inset-0 bg-black backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full shadow-2xl border border-gray-200 dark:border-[#243044] overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#A61E69] text-[#A61E69] flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4 text-[#A61E69]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Scan Report Details — {selectedReportForView.id}</h3>
                  <p className="text-[11px] text-slate-400">Export file-by-file audit breakdown for this scan session</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedReportForView(null)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Key Metrics Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700">
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Scan Type</span>
                  <span className={`inline-block mt-0.5 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-current ${selectedReportForView.typeBadge}`}>
                    {selectedReportForView.type}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Started On</span>
                  <strong className="font-bold text-gray-900 dark:text-white block mt-0.5">{selectedReportForView.startedOn}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Duration</span>
                  <strong className="font-bold text-gray-900 dark:text-white block mt-0.5">{selectedReportForView.duration}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Space Recovered</span>
                  <strong className="font-bold text-[#A61E69] dark:text-[#E052A0] block mt-0.5">{selectedReportForView.space}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Files Scanned</span>
                  <strong className="font-bold text-gray-900 dark:text-white block mt-0.5">{selectedReportForView.scanned}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Unused Files</span>
                  <strong className="font-bold text-amber-600 dark:text-amber-400 block mt-0.5">{selectedReportForView.unused}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Files Deleted</span>
                  <strong className="font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">{selectedReportForView.deleted}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-slate-400 block font-medium">Status</span>
                  <span className="inline-block mt-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                    {selectedReportForView.status}
                  </span>
                </div>
              </div>

              {/* File Search & Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div>
                  <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                    Scan Report Files ({getFilesForReport(selectedReportForView).length} total files)
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">All media files indexed in this scan report</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-gray-400 dark:text-[#5b6579] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={fileSearchQuery}
                    onChange={(e) => setFileSearchQuery(e.target.value)}
                    placeholder="Search files in report..."
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-800 dark:text-[#e7ecf3] dark:placeholder:text-[#5b6579] focus:outline-none focus:ring-2 focus:ring-[#A61E69]"
                  />
                </div>
              </div>

              {/* Files Table */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 font-bold sticky top-0 border-b border-gray-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3"># ID</th>
                        <th className="py-2.5 px-3">Filename</th>
                        <th className="py-2.5 px-3">Location / Path</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Size</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-[#243044]">
                      {getFilesForReport(selectedReportForView)
                        .filter(item => {
                          if (!fileSearchQuery) return true;
                          const q = fileSearchQuery.toLowerCase();
                          return (
                            (item.filename || '').toLowerCase().includes(q) ||
                            (item.title || '').toLowerCase().includes(q) ||
                            (item.location || '').toLowerCase().includes(q) ||
                            (item.category || '').toLowerCase().includes(q)
                          );
                        })
                        .map(item => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                            <td className="py-2.5 px-3 font-mono font-bold text-gray-700 dark:text-slate-300">#{item.id}</td>
                            <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white max-w-[180px] truncate" title={item.filename || item.title}>
                              {item.filename || item.title}
                            </td>
                            <td className="py-2.5 px-3 text-gray-500 dark:text-slate-400 font-mono text-[11px] max-w-[200px] truncate" title={item.location || item.url}>
                              {item.location || item.url}
                            </td>
                            <td className="py-2.5 px-3 uppercase text-[10px] font-bold text-gray-500 dark:text-slate-400">
                              {item.category}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-gray-800 dark:text-slate-200">
                              {item.formattedSize}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {item.isTrashed ? (
                                <span className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md">Trashed</span>
                              ) : item.inUse ? (
                                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md">Used</span>
                              ) : (
                                <span className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-md">Unused</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 dark:bg-slate-800 px-6 py-3.5 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-[11px] text-gray-500 dark:text-slate-400">
                Exports formatted CSV containing file names, paths, sizes & usage status
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedReportForView(null)}
                  className="bg-white hover:bg-gray-100 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-600 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => handleExportScanFilesCSV(selectedReportForView)}
                  className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Export Report</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ReportsTab;
