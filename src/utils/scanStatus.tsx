import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export interface ScanStatusContextValue {
  isRunning: boolean;
  processed: number;
  total: number;
  percent: number;
  dirtyCount: number;
  state: string;
  isStuck: boolean;
  justCompleted: boolean;
  stats: any;
  isManual: boolean;
  startTime: number;
  scanType: string;
  historyHead: string;
  start: (isManual?: boolean, scanType?: string) => void;
  restart: () => Promise<void>;
  onCompleted: (cb: (payload: { stats: any; total: number; processed: number; isManual: boolean; startTime: number; scanType: string }) => void | Promise<void>) => () => void;
  dismissCompleted: () => void;
}

const defaultContextValue: ScanStatusContextValue = {
  isRunning: false,
  processed: 0,
  total: 0,
  percent: 0,
  dirtyCount: 0,
  state: 'idle',
  isStuck: false,
  justCompleted: false,
  stats: null,
  isManual: false,
  startTime: 0,
  scanType: '',
  historyHead: '',
  start: () => {},
  restart: async () => {},
  onCompleted: () => () => {},
  dismissCompleted: () => {},
};

const ScanStatusContext = createContext<ScanStatusContextValue>(defaultContextValue);

export const useScanStatus = (): ScanStatusContextValue => {
  return useContext(ScanStatusContext);
};

export const ScanStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [processed, setProcessed] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [percent, setPercent] = useState<number>(0);
  const [dirtyCount, setDirtyCount] = useState<number>(0);
  const [state, setState] = useState<string>('idle');
  const [isStuck, setIsStuck] = useState<boolean>(false);
  const [justCompleted, setJustCompleted] = useState<boolean>(false);
  const [stats, setStats] = useState<any>(null);
  const [isManual, setIsManual] = useState<boolean>(false);
  const [scanType, setScanType] = useState<string>('');
  const [historyHead, setHistoryHead] = useState<string>('');
  const scanTypeRef = useRef<string>('');

  const isRunningRef = useRef<boolean>(false);
  const isManualRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const lastProcessedRef = useRef<number>(-1);
  const lastProcessedChangeTimeRef = useRef<number>(Date.now());
  const isFetchingRef = useRef<boolean>(false);
  const timerRef = useRef<any>(null);
  const prevRunningRef = useRef<boolean>(false);
  const callbacksRef = useRef<Set<(payload: { stats: any; total: number; processed: number; isManual: boolean; startTime: number; scanType: string }) => void | Promise<void>>>(new Set());

  isRunningRef.current = isRunning;

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }
    if (isFetchingRef.current) {
      return;
    }

    const imgsentryData = typeof window !== 'undefined' 
      ? ((window as any).imgsentry_data || (window as any).imgsentryData) 
      : null;
    const ajaxUrl = imgsentryData?.ajax_url || imgsentryData?.ajaxUrl;
    if (!ajaxUrl || !imgsentryData?.nonce) {
      return;
    }

    isFetchingRef.current = true;
    try {
      const fd = new FormData();
      fd.append('action', 'imgsentry_get_scan_progress');
      fd.append('nonce', imgsentryData.nonce);

      const res = await fetch(ajaxUrl, { method: 'POST', body: fd });
      const json = await res.json();

      if (json.success && json.data) {
        const data = json.data;
        const status = data.status || {};
        const serverRunning = Boolean(data.is_running ?? ('yes' === data.lock || status.state === 'running'));
        const serverDirty = Number(data.dirty_count ?? status.dirty ?? 0);
        const serverProcessed = Number(data.processed ?? status.processed ?? 0);
        const serverTotal = Number(data.total ?? status.total ?? 0);
        const serverState = status.state || (serverRunning ? 'running' : 'idle');
        const calcPercent = serverTotal > 0 
          ? Math.min(100, Math.round((serverProcessed / serverTotal) * 100)) 
          : (serverRunning ? 0 : 100);

        setIsRunning(serverRunning);
        isRunningRef.current = serverRunning;
        setProcessed(serverProcessed);
        setTotal(serverTotal);
        setPercent(calcPercent);
        setDirtyCount(serverDirty);
        setState(serverState);
        const serverScanType = String(data.scan_type || status.scan_type || '');
        if (serverScanType) {
          scanTypeRef.current = serverScanType;
          setScanType(serverScanType);
        }
        setHistoryHead(String(data.history_head || ''));
        if (data.stats) {
          setStats(data.stats);
        }

        // Stuck-scan detection: processed count did not change for 180 seconds while running
        if (serverRunning) {
          if (serverProcessed !== lastProcessedRef.current) {
            lastProcessedRef.current = serverProcessed;
            lastProcessedChangeTimeRef.current = Date.now();
            setIsStuck(false);
          } else if (Date.now() - lastProcessedChangeTimeRef.current >= 180000) {
            setIsStuck(true);
          }
        } else {
          setIsStuck(false);
          lastProcessedRef.current = -1;
          lastProcessedChangeTimeRef.current = Date.now();
        }

        // Detect transition running -> not running with state 'completed' once
        if (prevRunningRef.current && !serverRunning && serverState === 'completed') {
          setJustCompleted(true);
          callbacksRef.current.forEach((cb) => {
            try {
              cb({ stats: data.stats, total: serverTotal, processed: serverProcessed, isManual: isManualRef.current, startTime: startTimeRef.current, scanType: scanTypeRef.current });
            } catch (err) {
              console.error('ScanStatus onCompleted error:', err);
            }
          });
        }

        prevRunningRef.current = serverRunning;
      }
    } catch (err) {
      console.error('ScanStatus polling error:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  const scheduleNextPoll = useCallback((delayMs?: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const delay = typeof delayMs === 'number' ? delayMs : (isRunningRef.current ? 3000 : 60000);
    timerRef.current = setTimeout(async () => {
      await poll();
      scheduleNextPoll();
    }, delay);
  }, [poll]);

  const start = useCallback((manual: boolean = true, type?: string) => {
    isManualRef.current = manual;
    setIsManual(manual);
    if (type) {
      scanTypeRef.current = type;
      setScanType(type);
    }
    startTimeRef.current = Date.now();
    isRunningRef.current = true;
    setIsRunning(true);
    setJustCompleted(false);
    setIsStuck(false);
    lastProcessedRef.current = -1;
    lastProcessedChangeTimeRef.current = Date.now();
    prevRunningRef.current = true;

    // Poll immediately and switch to fast interval
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    poll().then(() => {
      scheduleNextPoll(3000);
    });
  }, [poll, scheduleNextPoll]);

  const restart = useCallback(async () => {
    const imgsentryData = typeof window !== 'undefined'
      ? ((window as any).imgsentry_data || (window as any).imgsentryData)
      : null;
    const ajaxUrl = imgsentryData?.ajax_url || imgsentryData?.ajaxUrl;
    if (ajaxUrl && imgsentryData?.nonce) {
      try {
        const fd = new FormData();
        fd.append('action', 'imgsentry_run_scan');
        fd.append('nonce', imgsentryData.nonce);
        fd.append('force', '1');
        fd.append('scan_type', scanTypeRef.current || 'smart');

        await fetch(ajaxUrl, { method: 'POST', body: fd });
      } catch (err) {
        console.error('Failed to restart scan:', err);
      }
    }
    start(true);
  }, [start]);

  const onCompleted = useCallback((cb: (payload: { stats: any; total: number; processed: number; isManual: boolean; startTime: number; scanType: string }) => void | Promise<void>) => {
    callbacksRef.current.add(cb);
    return () => {
      callbacksRef.current.delete(cb);
    };
  }, []);

  const dismissCompleted = useCallback(() => {
    setJustCompleted(false);
  }, []);

  useEffect(() => {
    const imgsentryData = typeof window !== 'undefined'
      ? ((window as any).imgsentry_data || (window as any).imgsentryData)
      : null;
    // In non-WordPress dev mode (no imgsentry_data) the provider returns an idle status and does nothing
    if (!imgsentryData || (!imgsentryData.ajax_url && !imgsentryData.ajaxUrl)) {
      return;
    }

    // Immediately on mount
    poll().then(() => {
      scheduleNextPoll();
    });

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        poll().then(() => {
          scheduleNextPoll();
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [poll, scheduleNextPoll]);

  const contextValue: ScanStatusContextValue = {
    isRunning,
    processed,
    total,
    percent,
    dirtyCount,
    state,
    isStuck,
    justCompleted,
    stats,
    isManual,
    startTime: startTimeRef.current,
    scanType,
    historyHead,
    start,
    restart,
    onCompleted,
    dismissCompleted,
  };

  return (
    <ScanStatusContext.Provider value={contextValue}>
      {children}
    </ScanStatusContext.Provider>
  );
};
