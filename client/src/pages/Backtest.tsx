import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Activity,
  AlertTriangle,
  Video,
  ExternalLink,
  Calendar,
  Menu,
  MousePointer2,
  Crosshair,
  Minus,
  SplitSquareVertical,
  TrendingUp,
  Square,
  Binary,
  Ruler,
  Trash2,
  Eraser,
  Lock,
  Unlock,
  RotateCw,
  PanelRightOpen,
  Minimize2,
  Maximize2,
  Play,
  Pause,
  X,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  GripVertical,
  Zap,
  Info,
  BarChart2,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { CandlestickChart, ChartCandle, ChartIndicators, DrawingItem, PlannedOrderPreview } from '../components/backtest/TradingViewChart';
import { DrawingToolbar, DrawingTool } from '../components/backtest/DrawingToolbar';
import { ReplayControls, ReplaySpeed, ChartTimeframe, AppMode } from '../components/backtest/ReplayControls';
import { SymbolPicker, SymbolOption, getCanonicalProvider } from '../components/backtest/SymbolPicker';
import { getCachedCandles, setCachedCandles } from '../services/indexedDbCache';
import { ReplayTimeline } from '../components/backtest/ReplayTimeline';
import { JumpToDateDialog } from '../components/backtest/JumpToDateDialog';
import { OrderPanel, type OrderPanelHandle } from '../components/backtest/OrderPanel';
import { BacktestStats } from '../components/backtest/BacktestStats';
import { TradeHistory } from '../components/backtest/TradeHistory';
import { TradeNotificationToast, type TradeToastItem } from '../components/backtest/TradeNotificationToast';
import { AiReplayCopilot, type AiCopilotSignal } from '../components/backtest/AiReplayCopilot';
import {
  PendingOrderRecord,
  OrderExecutionType,
  OrderDirection,
  validateOrderPrices,
  getEffectiveOrderType,
  deconstructOrderType,
  calculateAdaptiveOffsets,
} from '../components/backtest/OrderTypes';
import {
  calculatePositionSize,
  evaluateCandleHit,
  calculateBacktestStats,
  calculatePnL,
  calculateRR,
  calculateTPFromRR,
  calculateAdaptiveSlDistance,
  getSymbolContractSize,
  BacktestTradeRecord,
  TradeSide,
  BacktestStats as IBacktestStats,
} from '../shared/backtestEngine';
import { apiUrl, defaultHeaders } from '../utils/api';

export default function Backtest() {
  // ── Mode State Machine ──
  const [searchParams] = useSearchParams();
  const urlSessionId = searchParams.get('sessionId');
  const SESSION_STORAGE_KEY = 'kafx_active_backtest_session';
  const [showAnalysisGuideModal, setShowAnalysisGuideModal] = useState<boolean>(false);
  const [resumePromptSession, setResumePromptSession] = useState<{
    sessionId: string;
    symbol: string;
    currentBalance: number;
  } | null>(null);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);

  // 'selecting' = chart reply cursor active on chart, user picks start candle
  // 'replay' = replay active, future candles hidden
  const [appMode, setAppMode] = useState<AppMode>('analysis');
  const [replayStartTime, setReplayStartTime] = useState<Date | null>(null);
  const [selectionTime, setSelectionTime] = useState<Date | null>(null);

  // Session & Replay State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialBalance, setInitialBalance] = useState<number>(10000);
  const [balance, setBalance] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('M1');
  const [replayTime, setReplayTime] = useState<Date | null>(null);
  const [timelineBounds, setTimelineBounds] = useState<{ dateFrom: Date; dateTo: Date }>({
    dateFrom: new Date('2021-08-23T01:00:00Z'),
    dateTo: new Date('2026-08-21T02:59:00Z'),
  });
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isTimeframeLoading, setIsTimeframeLoading] = useState<boolean>(false);
  const timeframeAbortControllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Playback & Follow State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(2);
  const [followReplay, setFollowReplay] = useState<boolean>(true);

  // ── Single Source of Truth for Trades ──
  const [trades, setTrades] = useState<BacktestTradeRecord[]>([]);
  const activeTrade = useMemo(() => trades.find((t) => t.status === 'OPEN') || null, [trades]);
  const tradeHistory = useMemo(() => trades.filter((t) => t.status === 'CLOSED'), [trades]);

  const activeTradeRef = useRef<BacktestTradeRecord | null>(activeTrade);
  activeTradeRef.current = activeTrade;

  const [intrabarWarning, setIntrabarWarning] = useState<string | null>(null);
  const [isSubmittingTrade, setIsSubmittingTrade] = useState<boolean>(false);
  const [plannedTrade, setPlannedTrade] = useState<PlannedOrderPreview | null>(null);
  const [controlledEntryPrice, setControlledEntryPrice] = useState<number | null>(null);
  const [controlledSlPrice, setControlledSlPrice] = useState<number | null>(null);
  const [controlledTpPrice, setControlledTpPrice] = useState<number | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderRecord[]>([]);
  const pendingOrdersRef = useRef<PendingOrderRecord[]>(pendingOrders);
  pendingOrdersRef.current = pendingOrders;
  const handleOpenTradeRef = useRef<any>(null);
  const [isSyncingDashboard, setIsSyncingDashboard] = useState<boolean>(false);
  const [isQuickTradeCollapsed, setIsQuickTradeCollapsed] = useState<boolean>(false);
  const getPillBounds = useCallback((elW: number, elH: number, winW: number, winH: number) => {
    const isMobile = winW < 768;
    const minX = 8;
    const maxX = Math.max(minX, winW - elW - 8);

    // Keep pill below top header strip
    const topBar = isMobile
      ? document.querySelector('.mobile-terminal-top')
      : document.querySelector('header');
    const topBottom = topBar ? topBar.getBoundingClientRect().bottom : (isMobile ? 54 : 46);
    const minY = Math.max(isMobile ? 54 : 46, Math.round(topBottom + 8));

    // Dynamic bounding: pill must strictly stay above .mobile-terminal-context with safe clearance
    const contextBar = document.querySelector('.mobile-terminal-context');
    const bottomDock = document.querySelector('.mobile-terminal-context + div');
    const dockH = bottomDock ? bottomDock.getBoundingClientRect().height : 54;
    const contextH = contextBar ? contextBar.getBoundingClientRect().height : 38;
    const reservedBottom = isMobile ? Math.round(dockH + contextH + 16) : 46;

    let maxY: number;
    if (contextBar) {
      const contextTop = contextBar.getBoundingClientRect().top;
      maxY = Math.min(
        Math.round(contextTop - elH - 16),
        winH - elH - reservedBottom
      );
    } else {
      maxY = winH - elH - reservedBottom;
    }
    maxY = Math.max(minY, maxY);

    return { minX, maxX, minY, maxY };
  }, []);

  const getInitialPillPos = useCallback(() => {
    if (typeof window === 'undefined') return { x: 20, y: 350 };
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const isMobile = winW < 768;
    const defaultW = 180;
    const defaultH = 44;
    const { minX, maxX, minY, maxY } = getPillBounds(defaultW, defaultH, winW, winH);

    if (isMobile) {
      // On mobile 384px: centered horizontally, docked cleanly above context bar
      const x = Math.max(minX, Math.min(maxX, Math.round((winW - defaultW) / 2)));
      const y = maxY;
      return { x, y };
    } else {
      // On desktop: safe left-middle viewport positioning
      const x = Math.max(minX, Math.min(maxX, 24));
      const y = Math.max(minY, Math.min(maxY, 200));
      return { x, y };
    }
  }, [getPillBounds]);

  const pillPosRef = useRef<{ x: number; y: number }>(getInitialPillPos());
  const pillDragStartRef = useRef<{ isDragging: boolean; offsetX: number; offsetY: number }>({
    isDragging: false,
    offsetX: 0,
    offsetY: 0,
  });
  const pillDragHasMovedRef = useRef<boolean>(false);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const [symbol, setSymbol] = useState<string>('XAUUSD');
  const [availableSymbols, setAvailableSymbols] = useState<SymbolOption[]>([]);
  const availableSymbolsRef = useRef<SymbolOption[]>([]);
  const currentBoundsSymbolRef = useRef<string>(symbol);

  // Helper to find canonical provider from symbols catalog for a given symbol (single source of truth with SymbolPicker)
  const getProviderForSymbol = useCallback((sym: string): string => {
    return getCanonicalProvider(sym, availableSymbolsRef.current);
  }, []);

  const hasUserSelectedSymbolRef = useRef<boolean>(Boolean(urlSessionId));
  const candlesAbortControllerRef = useRef<AbortController | null>(null);
  const candleRequestSeqRef = useRef<number>(0);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      console.log('Global Tap Target:', target?.tagName, target?.className, target?.id);
    };

    window.addEventListener('click', handler, true);
    window.addEventListener('touchstart', handler, true);

    return () => {
      window.removeEventListener('click', handler, true);
      window.removeEventListener('touchstart', handler, true);
    };
  }, []);

  const workspaceRef = useRef<HTMLDivElement>(null);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      const doc = document as any;
      const isFull = document.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;
      
      if (!isFull) {
        const el = workspaceRef.current as any;
        if (!el) return;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isFull = !!(document.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
      setIsFullscreen(isFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const handlePlannedOrderChange = useCallback((newPlanned: { entryPrice: number; slPrice: number; tpPrice: number; lotSize?: number }) => {
    setControlledEntryPrice(newPlanned.entryPrice);
    setControlledSlPrice(newPlanned.slPrice);
    setControlledTpPrice(newPlanned.tpPrice);

    setPlannedTrade((prev) => {
      if (!prev) return prev;

      const hasSL = newPlanned.slPrice > 0;
      const hasTP = newPlanned.tpPrice > 0;
      const contractSize = getSymbolContractSize(symbol);
      const slDist = hasSL ? Math.abs(newPlanned.entryPrice - newPlanned.slPrice) : 0;
      const tpDist = hasTP ? Math.abs(newPlanned.tpPrice - newPlanned.entryPrice) : 0;

      const rr = hasSL && hasTP
        ? calculateRR(
            prev.side === 'BUY' ? 'LONG' : 'SHORT',
            newPlanned.entryPrice,
            newPlanned.slPrice,
            newPlanned.tpPrice
          )
        : { isValid: true, rr: 0 };

      let lotSize: number;
      let riskAmount: number;

      if (newPlanned.lotSize != null && newPlanned.lotSize > 0) {
        // User edited lot directly: recalculate dollar risk
        lotSize = newPlanned.lotSize;
        riskAmount = (hasSL && slDist > 0) ? lotSize * slDist * contractSize : (balance * riskPercent) / 100;
      } else {
        // SL handle dragged or initial setup: calculate lot from risk %
        riskAmount = (balance * riskPercent) / 100;
        lotSize = (hasSL && slDist > 0)
          ? calculatePositionSize(
              balance,
              riskPercent,
              newPlanned.entryPrice,
              newPlanned.slPrice,
              contractSize
            )
          : 1.0;
      }

      const targetProfit = (hasTP && lotSize > 0)
        ? lotSize * tpDist * contractSize
        : (rr.isValid && hasSL && hasTP ? riskAmount * rr.rr : 0);

      const currentP = candles[candles.length - 1]?.close || 0;
      const direction: OrderDirection = prev.side === 'BUY' ? 'BUY' : 'SELL';
      const effClassification = getEffectiveOrderType({
        direction,
        entryPrice: newPlanned.entryPrice,
        marketPrice: currentP,
        symbol,
      });
      const orderType = effClassification.orderType;
      const validation = validateOrderPrices(
        orderType,
        currentP,
        newPlanned.entryPrice,
        newPlanned.slPrice,
        newPlanned.tpPrice,
        symbol
      );

      return {
        ...prev,
        orderType,
        entryPrice: newPlanned.entryPrice,
        slPrice: newPlanned.slPrice,
        tpPrice: newPlanned.tpPrice,
        lotSize: Math.round(lotSize * 100) / 100,
        riskAmount: Math.round(riskAmount * 100) / 100,
        targetProfit: Math.round(targetProfit * 100) / 100,
        rrRatio: rr.isValid && hasSL && hasTP ? rr.rr : 0,
        isValid: validation.isValid,
        validationError: validation.error,
      };
    });
  }, [balance, candles, riskPercent, symbol]);

  const buildPlannedTrade = useCallback((side: TradeSide, entryPrice: number): PlannedOrderPreview | null => {
    if (entryPrice <= 0) return null;

    const defaultSlDistance = calculateAdaptiveSlDistance(candles, entryPrice, symbol);
    const slPrice = side === 'LONG'
      ? Math.round((entryPrice - defaultSlDistance) * 100) / 100
      : Math.round((entryPrice + defaultSlDistance) * 100) / 100;
    const tpPrice = side === 'LONG'
      ? Math.round((entryPrice + defaultSlDistance * 2.0) * 100) / 100
      : Math.round((entryPrice - defaultSlDistance * 2.0) * 100) / 100;
    const riskAmount = (balance * riskPercent) / 100;
    const lotSize = calculatePositionSize(balance, riskPercent, entryPrice, slPrice, getSymbolContractSize(symbol));
    const rr = calculateRR(side, entryPrice, slPrice, tpPrice);

    return {
      side: side === 'LONG' ? 'BUY' : 'SELL',
      entryPrice,
      slPrice,
      tpPrice,
      lotSize,
      riskAmount,
      targetProfit: rr.isValid ? riskAmount * rr.rr : 0,
      rrRatio: rr.isValid ? rr.rr : 0,
    };
  }, [balance, candles, riskPercent, symbol]);

  // Chart, Drawing & Tool State
  const [activeTool, setActiveTool] = useState<DrawingTool>('cursor');
  const [drawings, setDrawings] = useState<DrawingItem[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [lockRR, setLockRR] = useState<boolean>(false);
  const [indicators, setIndicators] = useState<ChartIndicators>({
    sma20: true,
    sma50: true,
    sma200: false,
  });

  // UI Workspace State
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isOrderPanelOpen, setIsOrderPanelOpen] = useState<boolean>(true);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState<boolean>(true);
  const [isVisualOrderActive, setIsVisualOrderActive] = useState<boolean>(false);
  const [tradeSide, setTradeSide] = useState<TradeSide>('LONG');
  const [bottomDrawerTab, setBottomDrawerTab] = useState<'NONE' | 'STATS' | 'HISTORY'>('NONE');
  const [isJumpDialogOpen, setIsJumpDialogOpen] = useState<boolean>(false);

  // ── AI Auto-Pilot State ──
  const [isAutoPilotActive, setIsAutoPilotActive] = useState<boolean>(false);
  const [autoPilotSpeed, setAutoPilotSpeed] = useState<number>(1000);
  const [autoPilotStatusLog, setAutoPilotStatusLog] = useState<string>('🤖 Auto-Pilot Ready. Click Auto-Trade to start automated backtesting.');
  const isAutoPilotRunningRef = useRef<boolean>(false);
  const candlesRef = useRef<ChartCandle[]>(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const isPlayingRef = useRef<boolean>(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const speedRef = useRef<number>(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingOlderRef = useRef<boolean>(false);
  const isFetchingNewerRef = useRef<boolean>(false);
  const orderPanelRef = useRef<OrderPanelHandle | null>(null);
  const mobileOrderPanelRef = useRef<OrderPanelHandle | null>(null);
  const editingPendingOrderIdRef = useRef<string | null>(null);
  const originalPendingOrderRef = useRef<PendingOrderRecord | null>(null);
  const isSteppingRef = useRef<boolean>(false);

  // ── Client-Side Pre-Buffered Candle Engine Refs ──
  const candleBufferRef = useRef<ChartCandle[]>([]);
  const isPrefetchingRef = useRef<boolean>(false);
  const prefetchSeqRef = useRef<number>(0);

  const clearCandleBuffer = useCallback(() => {
    prefetchSeqRef.current++;
    candleBufferRef.current = [];
  }, []);

  const [activeToast, setActiveToast] = useState<TradeToastItem | null>(null);
  const showToast = useCallback((item: Omit<TradeToastItem, 'id'>) => {
    setActiveToast({ ...item, id: Math.random().toString(36).slice(2, 9) });
  }, []);
  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  const [systemBanner, setSystemBanner] = useState<{ id: string; title: string; message: string } | null>(null);
  const hasNotifiedResumeRef = useRef<string | null>(null);
  const isResumingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!systemBanner) return;
    const timer = window.setTimeout(() => {
      setSystemBanner(null);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [systemBanner]);

  // Helper to fetch timeline bounds for active symbol
  const fetchTimelineBounds = useCallback(async (sym: string = symbol, tf: ChartTimeframe = timeframe) => {
    currentBoundsSymbolRef.current = sym;
    try {
      const prov = getProviderForSymbol(sym);
      const res = await fetch(apiUrl(`/backtest/timeline-bounds?symbol=${sym}&timeframe=${tf}&provider=${prov}`), {
        headers: defaultHeaders(),
      });
      const json = await res.json();
      if (currentBoundsSymbolRef.current !== sym) return;
      if (json.ok && json.data && json.data.dateFrom && json.data.dateTo) {
        setTimelineBounds({
          dateFrom: new Date(json.data.dateFrom),
          dateTo: new Date(json.data.dateTo),
        });
      }
    } catch (e) {
      console.error('Failed to fetch timeline bounds:', e);
    }
  }, [symbol, timeframe, getProviderForSymbol]);

  // ── 2. Analysis Mode: Load Latest Candles (NO replay cutoff) ──
  const loadAnalysisCandles = useCallback(async (tf: ChartTimeframe = timeframe, sym: string = symbol) => {
    if (candlesAbortControllerRef.current) {
      candlesAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    candlesAbortControllerRef.current = controller;
    const reqSeq = ++candleRequestSeqRef.current;
    let isTimedOut = false;
    const TIMEOUT_MS = 45000; // 45 dtk timeout untuk jaringan HP / ngrok
    const timeoutId = window.setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, TIMEOUT_MS);

    setLoading(true);
    setError(null);
    const fetchStartTime = Date.now();
    try {
      // 1. Instant Cache Check via IndexedDB
      const cached = await getCachedCandles(sym, tf);
      if (cached && cached.length > 0 && candleRequestSeqRef.current === reqSeq) {
        setCandles(cached);
        setReplayTime(new Date(cached[cached.length - 1].time));
        setLoading(false);
      }

      const prov = getProviderForSymbol(sym);
      const res = await fetch(
        apiUrl(`/backtest/candles?symbol=${sym}&timeframe=${tf}&provider=${prov}&limit=1500`),
        { signal: controller.signal, headers: defaultHeaders() }
      );
      window.clearTimeout(timeoutId);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Gagal memuat candle');
      const fetchedCandles = json.data?.candles || [];
      if (candlesAbortControllerRef.current !== controller || candleRequestSeqRef.current !== reqSeq) return;
      setCandles(fetchedCandles);
      if (fetchedCandles.length > 0) {
        setReplayTime(new Date(fetchedCandles[fetchedCandles.length - 1].time));
        // Persist to IndexedDB
        setCachedCandles(sym, tf, fetchedCandles);
      } else {
        setError(`candles ${sym} kosong (${tf}). Silakan pilih instrumen lain.`);
      }
    } catch (err: any) {
      window.clearTimeout(timeoutId);
      // AbortError dari fetch sebelumnya (saat ganti symbol) atau superseding request harus diabaikan, bukan ditampilkan
      if (err.name === 'AbortError' || controller.signal.aborted || candleRequestSeqRef.current !== reqSeq) {
        if (isTimedOut && candlesAbortControllerRef.current === controller && candleRequestSeqRef.current === reqSeq) {
          const elapsedSec = Math.max(1, Math.round((Date.now() - fetchStartTime) / 1000));
          setError(`candles ${sym} gagal timeout setelah ${elapsedSec} dtk. Periksa koneksi.`);
        }
        return;
      }
      if (candlesAbortControllerRef.current !== controller || candleRequestSeqRef.current !== reqSeq) return;

      const elapsedSec = Math.max(1, Math.round((Date.now() - fetchStartTime) / 1000));
      console.error('Analysis load error:', err);
      setError(`candles ${sym} gagal setelah ${elapsedSec} dtk: ${err.message || 'Gagal memuat data historis'}`);
    } finally {
      window.clearTimeout(timeoutId);
      if (candlesAbortControllerRef.current === controller) {
        candlesAbortControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [timeframe, symbol, getProviderForSymbol]);

  // ── 1. Fetch Timeline Bounds & Available Symbols ──
  useEffect(() => {
    if (!urlSessionId) {
      fetchTimelineBounds(symbol, timeframe);
    }

    fetch(apiUrl('/backtest/symbols'), { headers: defaultHeaders() })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
          availableSymbolsRef.current = json.data;
          setAvailableSymbols(json.data);
          // ponytail: auto-select entry with LARGEST candleCount if user hasn't chosen manually AND not loading a session from URL
          if (!hasUserSelectedSymbolRef.current && !urlSessionId) {
            const largestEntry = json.data.slice().sort((a: any, b: any) => (b.candleCount || 0) - (a.candleCount || 0))[0];
            if (largestEntry && largestEntry.symbol && largestEntry.symbol !== symbol) {
              setSymbol(largestEntry.symbol);
              fetchTimelineBounds(largestEntry.symbol, timeframe);
              loadAnalysisCandles(timeframe, largestEntry.symbol);
            }
          }
        }
      })
      .catch(console.error);
  }, [urlSessionId]);

  // Load analysis candles on mount (skip if loading an existing session from URL)
  useEffect(() => {
    if (urlSessionId) {
      // Sesi dari URL akan dimuat oleh resumeSession, skip mount analysis load default
      return;
    }
    loadAnalysisCandles('M1', symbol);
  }, [urlSessionId]);

  // ── 2b. Load Older Candles (Pan Left — Analysis & Replay) ──
  const handleLoadOlderCandles = useCallback(async () => {
    if (candles.length === 0 || isFetchingOlderRef.current) return;
    const earliest = candles[0];
    const earliestTime = new Date(earliest.time).toISOString();

    if (new Date(earliest.time).getTime() <= new Date(timelineBounds.dateFrom).getTime()) {
      return;
    }

    try {
      isFetchingOlderRef.current = true;
      const prov = getProviderForSymbol(symbol);
      const replayParam = appMode === 'replay' && replayStartTime
        ? `&replayTime=${encodeURIComponent(replayStartTime.toISOString())}`
        : '';
      const res = await fetch(
        apiUrl(`/backtest/candles?symbol=${symbol}&timeframe=${timeframe}&provider=${prov}&beforeTime=${encodeURIComponent(earliestTime)}&limit=1500${replayParam}`),
        { headers: defaultHeaders() }
      );
      const json = await res.json();
      if (json.ok && json.data && json.data.candles.length > 0) {
        setCandles((prev) => {
          const existingTimes = new Set(prev.map((c) => new Date(c.time).getTime()));
          const uniqueOlder = json.data.candles.filter(
            (c: ChartCandle) => !existingTimes.has(new Date(c.time).getTime())
          );
          if (uniqueOlder.length === 0) return prev;
          return [...uniqueOlder, ...prev];
        });
      }
    } catch (err) {
      console.error('Error fetching older history:', err);
    } finally {
      isFetchingOlderRef.current = false;
    }
  }, [candles, timeframe, symbol, appMode, replayStartTime, timelineBounds.dateFrom, getProviderForSymbol]);

  // ── 2c. Load Newer Candles (Pan Right in Analysis Mode) ──
  const handleLoadNewerCandles = useCallback(async () => {
    if (candles.length === 0 || isFetchingNewerRef.current) return;
    if (appMode === 'replay') return;
    const latest = candles[candles.length - 1];
    const latestTime = new Date(latest.time).toISOString();

    if (new Date(latest.time).getTime() >= new Date(timelineBounds.dateTo).getTime()) {
      return;
    }

    try {
      isFetchingNewerRef.current = true;
      const prov = getProviderForSymbol(symbol);
      const res = await fetch(
        apiUrl(`/backtest/candles?symbol=${symbol}&timeframe=${timeframe}&provider=${prov}&afterTime=${encodeURIComponent(latestTime)}&limit=500`),
        { headers: defaultHeaders() }
      );
      const json = await res.json();
      if (json.ok && json.data && json.data.candles.length > 0) {
        setCandles((prev) => {
          const existingTimes = new Set(prev.map((c) => new Date(c.time).getTime()));
          const uniqueNewer = json.data.candles.filter(
            (c: ChartCandle) => !existingTimes.has(new Date(c.time).getTime())
          );
          if (uniqueNewer.length === 0) return prev;
          return [...prev, ...uniqueNewer];
        });
      }
    } catch (err) {
      console.error('Error fetching newer candles:', err);
    } finally {
      isFetchingNewerRef.current = false;
    }
  }, [candles, timeframe, symbol, appMode, timelineBounds.dateTo, getProviderForSymbol]);

  // ── 2d. Timeframe Switch Handler ──
  const handleTimeframeChange = async (newTF: ChartTimeframe) => {
    clearCandleBuffer();
    if (timeframeAbortControllerRef.current) {
      timeframeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    timeframeAbortControllerRef.current = controller;

    setTimeframe(newTF);
    setIsTimeframeLoading(true);

    try {
      const prov = getProviderForSymbol(symbol);
      if (appMode === 'analysis') {
        const res = await fetch(
          apiUrl(`/backtest/candles?symbol=${symbol}&timeframe=${newTF}&provider=${prov}`),
          { signal: controller.signal, headers: defaultHeaders() }
        );
        const json = await res.json();
        if (timeframeAbortControllerRef.current !== controller) return;
        if (json.ok && json.data && json.data.candles) {
          setCandles(json.data.candles);
          if (json.data.candles.length > 0) {
            setReplayTime(new Date(json.data.candles[json.data.candles.length - 1].time));
          }
        }
      } else if (appMode === 'replay') {
        // Keep replay session, trades, and position intact!
        setIsPlaying(false);
        const currentTargetTime = replayTime || (candles.length > 0 ? new Date(candles[candles.length - 1].time) : replayStartTime);
        if (!currentTargetTime) return;

        // 1. Update session timeframe in DB
        if (sessionId) {
          fetch(apiUrl(`/backtest/sessions/${sessionId}`), {
            method: 'PUT',
            headers: defaultHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ timeframe: newTF }),
            signal: controller.signal,
          }).catch(() => {});
        }

        // 2. Fetch candles for newTF up to currentTargetTime (strict cutoff with backend adaptive limit)
        const resCandles = await fetch(
          apiUrl(`/backtest/candles?symbol=${symbol}&timeframe=${newTF}&provider=${prov}&replayTime=${encodeURIComponent(currentTargetTime.toISOString())}`),
          { signal: controller.signal, headers: defaultHeaders() }
        );
        const candlesJson = await resCandles.json();
        if (timeframeAbortControllerRef.current !== controller) return;
        if (candlesJson.ok && candlesJson.data && candlesJson.data.candles) {
          setCandles(candlesJson.data.candles);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error switching timeframe:', err);
      }
    } finally {
      if (timeframeAbortControllerRef.current === controller) {
        setIsTimeframeLoading(false);
        timeframeAbortControllerRef.current = null;
      }
    }
  };

  // ── 2e. Symbol Switch Handler ──
  const handleSymbolChange = (newSymbol: string) => {
    clearCandleBuffer();
    hasUserSelectedSymbolRef.current = true;
    setSymbol(newSymbol);
    fetchTimelineBounds(newSymbol, timeframe);
    if (appMode === 'analysis') {
      loadAnalysisCandles(timeframe, newSymbol);
    } else if (appMode === 'replay' && replayStartTime) {
      initReplaySession(replayStartTime, timeframe, newSymbol);
    }
  };

  // ── 3. Replay Mode: Initialize Session with strict cutoff ──
  const initReplaySession = useCallback(async (startTime: Date, tf: ChartTimeframe = timeframe, sym: string = symbol) => {
    clearCandleBuffer();
    if (candlesAbortControllerRef.current) {
      candlesAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    candlesAbortControllerRef.current = controller;
    const reqSeq = ++candleRequestSeqRef.current;

    setLoading(true);
    setIsPlaying(false);
    setError(null);
    setFollowReplay(true);
    try {
      const prov = getProviderForSymbol(sym);
      const resSession = await fetch(apiUrl('/backtest/sessions'), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: `Backtest ${sym} ${tf} (${startTime.toISOString().slice(0, 10)})`,
          symbol: sym,
          provider: prov,
          timeframe: tf,
          startTime: startTime.toISOString(),
          initialBalance,
          riskPercent,
          drawingsJson: JSON.stringify(drawings),
        }),
        signal: controller.signal,
      });
      const sessionJson = await resSession.json();
      if (!sessionJson.ok) throw new Error(sessionJson.error || 'Failed to create session');
      if (candlesAbortControllerRef.current !== controller || candleRequestSeqRef.current !== reqSeq) return;

      const newSession = sessionJson.data;
      setSessionId(newSession.id);
      hasNotifiedResumeRef.current = newSession.id;
      setBalance(newSession.currentBalance);
      setReplayTime(startTime);
      setReplayStartTime(startTime);
      setTrades([]);
      setIntrabarWarning(null);

      // Fetch windowed candles strictly ending at startTime (Zero Look-Ahead)
      const resCandles = await fetch(
        apiUrl(`/backtest/candles?symbol=${sym}&timeframe=${tf}&provider=${prov}&replayTime=${encodeURIComponent(startTime.toISOString())}&limit=2000`),
        { signal: controller.signal, headers: defaultHeaders() }
      );
      const candlesJson = await resCandles.json();
      if (!candlesJson.ok) throw new Error(candlesJson.error || 'Failed to fetch candles');
      if (candlesAbortControllerRef.current !== controller || candleRequestSeqRef.current !== reqSeq) return;
      setCandles(candlesJson.data.candles);
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted || candleRequestSeqRef.current !== reqSeq) {
        return;
      }
      console.error('Session initialization error:', err);
      setError(err.message || 'Gagal memuat data pasar historis.');
    } finally {
      if (candlesAbortControllerRef.current === controller) {
        candlesAbortControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [initialBalance, riskPercent, timeframe, symbol, drawings, getProviderForSymbol]);

  // ── 4. Activate Chart Replay (enter 'selecting' mode) ──
  const handleActivateBarReplay = () => {
    setAppMode('selecting');
    setSelectionTime(null);
    setIsPlaying(false);
  };

  // ── 5. User confirms replay start from selection cursor ──
  const handleConfirmReplayStart = async (time: Date) => {
    setAppMode('replay');
    setSelectionTime(null);
    await initReplaySession(time, timeframe);
  };

  // ── 5b. Start replay at current bar or pick point from analysis guidance ──
  const handleStartReplayAtCurrentBar = () => {
    setShowAnalysisGuideModal(false);
    const targetCandle = candles[candles.length - 1];
    if (targetCandle) {
      handleConfirmReplayStart(new Date(targetCandle.time));
    } else {
      handleActivateBarReplay();
    }
  };

  const handlePickReplayPoint = () => {
    setShowAnalysisGuideModal(false);
    handleActivateBarReplay();
  };

  // ── 6. Exit Replay → back to Analysis ──
  const handleExitReplay = () => {
    clearCandleBuffer();
    hasNotifiedResumeRef.current = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_) {}
    setAppMode('analysis');
    setIsPlaying(false);
    setSessionId(null);
    setTrades([]);
    setIntrabarWarning(null);
    setReplayStartTime(null);
    setSelectionTime(null);
    loadAnalysisCandles(timeframe);
  };

  // ── 6b. Resume Saved Replay Session ──
  const resumeSession = useCallback(async (targetSessionId: string) => {
    clearCandleBuffer();
    if (isResumingRef.current) return;
    isResumingRef.current = true;
    hasUserSelectedSymbolRef.current = true;

    // Batalkan fetch candle yang sedang berjalan (misal analysis load)
    if (candlesAbortControllerRef.current) {
      candlesAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    candlesAbortControllerRef.current = controller;
    const reqSeq = ++candleRequestSeqRef.current;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/backtest/sessions/${targetSessionId}`), {
        signal: controller.signal,
        headers: defaultHeaders(),
      });
      const json = await res.json();
      if (!json.ok || !json.data) {
        throw new Error(json.error || 'Sesi replay tidak ditemukan');
      }
      if (candlesAbortControllerRef.current !== controller || candleRequestSeqRef.current !== reqSeq) return;

      const s = json.data;
      const targetSymbol = s.symbol || 'XAUUSD';
      const targetTf = (s.timeframe as ChartTimeframe) || 'M1';

      setSessionId(s.id);
      setSymbol(targetSymbol);
      setTimeframe(targetTf);
      setBalance(s.currentBalance || s.initialBalance || 10000);
      setInitialBalance(s.initialBalance || 10000);
      setRiskPercent(s.riskPercent || 1.0);
      if (s.drawingsJson) {
        try {
          setDrawings(JSON.parse(s.drawingsJson));
        } catch {
          // ignore
        }
      }

      const repTime = s.replayTime ? new Date(s.replayTime) : (s.startTime ? new Date(s.startTime) : new Date());
      setReplayTime(repTime);
      setReplayStartTime(s.startTime ? new Date(s.startTime) : repTime);
      setAppMode('replay');
      setFollowReplay(true);

      // Fetch timeline bounds yang tepat untuk instrumen sesi (bukan default XAUUSD)
      fetchTimelineBounds(targetSymbol, targetTf);

      // Fetch windowed candles strictly ending at repTime (Zero Look-Ahead) lewat controller ber-guard
      const prov = s.provider || getProviderForSymbol(targetSymbol);
      const resCandles = await fetch(
        apiUrl(`/backtest/candles?symbol=${targetSymbol}&timeframe=${targetTf}&provider=${prov}&replayTime=${encodeURIComponent(repTime.toISOString())}&limit=2000`),
        { signal: controller.signal, headers: defaultHeaders() }
      );
      const candlesJson = await resCandles.json();
      if (!candlesJson.ok) throw new Error(candlesJson.error || 'Failed to fetch candles');
      if (candlesAbortControllerRef.current !== controller || candleRequestSeqRef.current !== reqSeq) return;

      if (candlesJson.data && candlesJson.data.candles) {
        setCandles(candlesJson.data.candles);
      }

      // Restore trades
      if (Array.isArray(s.trades)) {
        setTrades(s.trades.map((t: any) => ({
          ...t,
          entryTime: new Date(t.entryTime),
          exitTime: t.exitTime ? new Date(t.exitTime) : undefined,
        })));
      }

      setResumePromptSession(null);
      if (hasNotifiedResumeRef.current !== s.id) {
        hasNotifiedResumeRef.current = s.id;
        setSystemBanner({
          id: Math.random().toString(36).slice(2, 9),
          title: 'SESI DIPULIHKAN',
          message: `Sesi replay ${s.name} berhasil dilanjutkan.`,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted || candleRequestSeqRef.current !== reqSeq) {
        return;
      }
      console.error('Failed to resume session:', err);
      setError(err.message || 'Gagal memulihkan sesi replay.');
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch (_) {}
      setResumePromptSession(null);
    } finally {
      if (candlesAbortControllerRef.current === controller) {
        candlesAbortControllerRef.current = null;
        setLoading(false);
      }
      isResumingRef.current = false;
    }
  }, [fetchTimelineBounds, getProviderForSymbol]);

  // Auto-Save active replay session snapshot
  useEffect(() => {
    if (appMode === 'replay' && sessionId) {
      const snapshot = {
        sessionId,
        symbol,
        timeframe,
        replayTime: replayTime ? replayTime.toISOString() : null,
        currentBalance: balance,
        initialBalance,
        riskPercent,
        tradesCount: trades.length,
        updatedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
      } catch (e) {
        console.error('Failed to save session snapshot', e);
      }
    }
  }, [appMode, sessionId, symbol, timeframe, replayTime, balance, initialBalance, riskPercent, trades.length]);

  // Check ongoing session on mount
  useEffect(() => {
    if (urlSessionId) {
      hasUserSelectedSymbolRef.current = true;
      if (hasNotifiedResumeRef.current !== urlSessionId && !isResumingRef.current) {
        resumeSession(urlSessionId);
      }
      return;
    }

    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.sessionId) {
          setResumePromptSession({
            sessionId: parsed.sessionId,
            symbol: parsed.symbol || 'XAUUSD',
            currentBalance: parsed.currentBalance || 10000,
          });
        }
      }
    } catch (e) {
      // ignore
    }
  }, [searchParams, resumeSession]);

  // ── 7. Debounced Drawing Auto-Save ──
  const handleDrawingsChange = (newDrawings: DrawingItem[]) => {
    setDrawings(newDrawings);
    if (!sessionId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(apiUrl(`/backtest/sessions/${sessionId}`), {
        method: 'PUT',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ drawingsJson: JSON.stringify(newDrawings) }),
      }).catch(console.error);
    }, 400);
  };

  const handleDeleteSelectedDrawing = () => {
    if (!selectedDrawingId) return;
    handleDrawingsChange(drawings.filter((d) => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  };

  const handleDeleteAllDrawings = () => {
    handleDrawingsChange([]);
    setSelectedDrawingId(null);
  };

  // ── 8. Random Start Handler ──
  const handleRandomStart = async () => {
    try {
      setLoading(true);
      const prov = getProviderForSymbol(symbol);
      const res = await fetch(
        apiUrl(`/backtest/random-start?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&provider=${encodeURIComponent(prov)}`),
        { headers: defaultHeaders() }
      );
      const json = await res.json();
      if (json.ok && json.data) {
        const time = new Date(json.data.time);
        setAppMode('replay');
        await initReplaySession(time, timeframe);
      }
    } catch (err) {
      console.error('Random start error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Client-Side Pre-Buffered Candle Engine ──
  const prefetchFutureCandles = useCallback(async (afterTime: string) => {
    if (isPrefetchingRef.current) return;
    isPrefetchingRef.current = true;
    const seq = prefetchSeqRef.current;
    try {
      const prov = getProviderForSymbol(symbol);
      const sessionParam = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
      // Adaptive batch size: smaller for higher timeframes to avoid massive M1 resampling queries
      const batchSize = timeframe === 'D1' ? 30 : timeframe === 'H4' ? 60 : timeframe === 'H1' ? 120 : 300;
      const res = await fetch(
        apiUrl(`/backtest/candles?symbol=${symbol}&timeframe=${timeframe}&provider=${prov}&afterTime=${encodeURIComponent(afterTime)}&limit=${batchSize}${sessionParam}`),
        { headers: defaultHeaders() }
      );
      const json = await res.json();
      if (prefetchSeqRef.current !== seq) return;
      if (json.ok && json.data && Array.isArray(json.data.candles)) {
        const newCandles: ChartCandle[] = json.data.candles;
        if (newCandles.length > 0) {
          const existingTimes = new Set(candleBufferRef.current.map((c) => new Date(c.time).getTime()));
          const filtered = newCandles.filter((c) => !existingTimes.has(new Date(c.time).getTime()));
          candleBufferRef.current = [...candleBufferRef.current, ...filtered];
        }
      }
    } catch (err) {
      console.error('Prefetch candles error:', err);
    } finally {
      if (prefetchSeqRef.current === seq) {
        isPrefetchingRef.current = false;
      }
    }
  }, [symbol, timeframe, sessionId, getProviderForSymbol]);

  // ── 9. Sequential Step Forward Engine (Evaluates Active Trade) ──
  const stepForward = useCallback(async () => {
    const currentCandles = candlesRef.current;
    if (currentCandles.length === 0 || appMode !== 'replay' || isSteppingRef.current) return;
    isSteppingRef.current = true;
    const lastCandle = currentCandles[currentCandles.length - 1];
    const lastTime = new Date(lastCandle.time).toISOString();
    const lastT = new Date(lastCandle.time).getTime();

    try {
      // Discard stale candles in buffer that are <= lastT
      while (candleBufferRef.current.length > 0) {
        const bufTime = candleBufferRef.current[0].time;
        const bufT = typeof bufTime === 'number' ? bufTime : new Date(bufTime).getTime();
        if (bufT <= lastT) {
          candleBufferRef.current.shift();
        } else {
          break;
        }
      }

      // Background prefetch when buffer drops below threshold (adaptive per timeframe)
      const refillThreshold = timeframe === 'D1' ? 10 : timeframe === 'H4' ? 20 : 50;
      if (candleBufferRef.current.length < refillThreshold && !isPrefetchingRef.current) {
        const prefetchStartTime = candleBufferRef.current.length > 0
          ? new Date(candleBufferRef.current[candleBufferRef.current.length - 1].time).toISOString()
          : lastTime;
        void prefetchFutureCandles(prefetchStartTime);
      }

      let nextCandle: ChartCandle;
      if (candleBufferRef.current.length > 0) {
        nextCandle = candleBufferRef.current.shift()!;
      } else {
        const prov = getProviderForSymbol(symbol);
        const sessionParam = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
        const res = await fetch(
          apiUrl(`/backtest/next-candle?symbol=${symbol}&timeframe=${timeframe}&provider=${prov}&afterTime=${encodeURIComponent(lastTime)}${sessionParam}`),
          { headers: defaultHeaders() }
        );
        const json = await res.json();
        if (!json.ok || !json.data) {
          setIsPlaying(false);
          showToast({
            kind: 'INFO',
            symbol,
            title: 'AKHIR DATASET',
            message: 'Telah mencapai akhir data historis yang tersedia.',
          });
          return;
        }
        nextCandle = json.data;
      }

      // FIX 4: Cache Date & timestamp once for reuse
      const nextTime = new Date(nextCandle.time);
      const nextT = nextTime.getTime();

      setCandles((prev) => {
        if (prev.length === 0) return [nextCandle];
        const lastCandleT = new Date(prev[prev.length - 1].time).getTime();
        if (nextT === lastCandleT) {
          const updated = prev.slice();
          updated[updated.length - 1] = nextCandle;
          return updated;
        }
        if (nextT < lastCandleT) {
          return prev;
        }
        // FIX 3: Efficient single-element concat without spread operator
        return [...prev, nextCandle];
      });
      setReplayTime(nextTime);

      // 9a. Evaluate Pending Orders against incoming candle
      const curPending = pendingOrdersRef.current;
      if (curPending.length > 0 && !activeTradeRef.current) {
        const remaining: PendingOrderRecord[] = [];
        let triggered: PendingOrderRecord | null = null;
        for (const po of curPending) {
          if (triggered) {
            remaining.push(po);
            continue;
          }
          let isHit = false;
          if (po.orderType === 'BUY_LIMIT' && nextCandle.low <= po.entryPrice) isHit = true;
          else if (po.orderType === 'BUY_STOP' && nextCandle.high >= po.entryPrice) isHit = true;
          else if (po.orderType === 'SELL_LIMIT' && nextCandle.high >= po.entryPrice) isHit = true;
          else if (po.orderType === 'SELL_STOP' && nextCandle.low <= po.entryPrice) isHit = true;

          if (isHit) {
            triggered = po;
          } else {
            remaining.push(po);
          }
        }

        if (triggered) {
          // Atomic transition: remove from pending and appear as active position in the same render batch
          const optimisticTrade: BacktestTradeRecord = {
            id: triggered.id,
            tradeNumber: trades.length + 1,
            orderType: triggered.orderType,
            side: triggered.side,
            entryPrice: triggered.entryPrice,
            slPrice: triggered.slPrice,
            tpPrice: triggered.tpPrice,
            volume: triggered.volume,
            riskAmount: triggered.riskAmount,
            status: 'OPEN',
            entryTime: nextTime,
            exitPrice: null,
            exitTime: null,
            exitReason: null,
            pnl: null,
            rr: null,
          };
          setPendingOrders(remaining);
          setTrades((prev) => [optimisticTrade, ...prev.filter((t) => t.id !== triggered!.id)]);

          void handleOpenTradeRef.current?.({
            side: triggered.side,
            entryPrice: triggered.entryPrice,
            slPrice: triggered.slPrice,
            tpPrice: triggered.tpPrice,
            volume: triggered.volume,
            riskAmount: triggered.riskAmount,
            tradeTime: nextTime,
            optimisticId: triggered.id,
            orderType: triggered.orderType,
            status: 'OPEN',
            triggeredOrder: triggered,
          });
          showToast({
            kind: 'ENTRY',
            symbol,
            title: `${triggered.orderType.replace('_', ' ')} TERPICU`,
            message: `Order ${triggered.orderType.replace('_', ' ')} di harga $${triggered.entryPrice.toFixed(2)} dieksekusi.`,
          });
        }
      }

      // Evaluate active position if open
      const curTrade = activeTradeRef.current;
      if (curTrade && curTrade.status === 'OPEN' && sessionId) {
        const hitResult = evaluateCandleHit(
          {
            side: curTrade.side,
            entryPrice: curTrade.entryPrice,
            slPrice: curTrade.slPrice,
            tpPrice: curTrade.tpPrice,
          },
          { time: nextTime, open: nextCandle.open, high: nextCandle.high, low: nextCandle.low, close: nextCandle.close }
        );

        if (hitResult.type !== 'NONE') {
          if (hitResult.type === 'INTRABAR_AMBIGUOUS') {
            setIntrabarWarning(`Peringatan: Candle ${format(nextTime, 'HH:mm')} menyentuh SL & TP posisi.`);
          }

          const exitPrice = hitResult.exitPrice ||
            (hitResult.type === 'TP' ? curTrade.tpPrice : curTrade.slPrice);

          try {
            const closeRes = await fetch(apiUrl(`/backtest/sessions/${sessionId}/trades/${curTrade.id}/close`), {
              method: 'POST',
              headers: defaultHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                exitTime: nextTime.toISOString(),
                exitPrice,
                exitReason: hitResult.reason || hitResult.type,
              }),
            });
            const closeJson = await closeRes.json();
            if (closeJson.ok && closeJson.data) {
              const closed = closeJson.data.trade;
              setTrades((prev) => prev.map((t) => (t.id === closed.id ? closed : t)));
              setBalance(closeJson.data.session.currentBalance);

              if (hitResult.type === 'TP' || hitResult.type === 'SL') {
                showToast({
                  kind: hitResult.type,
                  symbol,
                  amount: typeof closed.pnl === 'number' ? closed.pnl : 0,
                  rr: typeof closed.rr === 'number' ? closed.rr : null,
                });
              }

              fetch(apiUrl(`/backtest/sessions/${sessionId}/sync-to-journal`), {
                method: 'POST',
                headers: defaultHeaders(),
              }).catch(console.error);
            }
          } catch (closeErr) {
            console.error('Error closing hit trade:', closeErr);
          }
        }
      }
    } catch (err) {
      console.error('Step forward error:', err);
      setIsPlaying(false);
    } finally {
      isSteppingRef.current = false;
    }
  }, [timeframe, symbol, sessionId, appMode, showToast, getProviderForSymbol, prefetchFutureCandles]);

  // ── 10. Step Back Engine ──
  const stepBack = useCallback(() => {
    clearCandleBuffer();
    const currentCandles = candlesRef.current;
    if (currentCandles.length <= 1 || appMode !== 'replay') return;
    setCandles((prev) => {
      const next = prev.slice(0, prev.length - 1);
      const newT = new Date(next[next.length - 1].time);
      setReplayTime(newT);
      if (sessionId) {
        fetch(apiUrl(`/backtest/sessions/${sessionId}`), {
          method: 'PUT',
          headers: defaultHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ replayTime: newT.toISOString() }),
        }).catch(console.error);
      }
      return next;
    });
  }, [appMode, sessionId, clearCandleBuffer]);

  // ── 11. Replay Loop ──
  useEffect(() => {
    if (!isPlaying || appMode !== 'replay') return;
    let timer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const tick = () => {
      if (isCancelled || !isPlayingRef.current || appMode !== 'replay') return;
      void stepForward().finally(() => {
        if (isCancelled || !isPlayingRef.current || appMode !== 'replay') return;
        const curSpeed = speedRef.current;
        const intervalMs = curSpeed === 10 ? 30 : curSpeed === 5 ? 80 : Math.max(100, 1000 / curSpeed);
        timer = setTimeout(tick, intervalMs);
      });
    };

    const curSpeed = speedRef.current;
    const initialMs = curSpeed === 10 ? 30 : curSpeed === 5 ? 80 : Math.max(100, 1000 / curSpeed);
    timer = setTimeout(tick, initialMs);

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPlaying, speed, stepForward, appMode]);

  // ── 12. Open Trade Handler (Strict Single Active Trade) ──
  const handleOpenTrade = async (tradeParams: {
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
    tradeTime?: Date;
    optimisticId?: string;
    orderType?: OrderExecutionType;
    status?: 'OPEN' | 'PENDING';
    triggeredOrder?: PendingOrderRecord;
  }) => {
    if (appMode === 'analysis') {
      setShowAnalysisGuideModal(true);
      return;
    }
    if (activeTrade && activeTrade.id !== tradeParams.optimisticId) {
      showToast({
        kind: 'ERROR',
        title: 'POSISI AKTIF',
        message: 'Posisi aktif sudah ada. Tutup posisi terlebih dahulu sebelum membuka posisi baru.',
      });
      return;
    }
    if (isSubmittingTrade) return;
    setIsSubmittingTrade(true);
    try {
      let curSessionId = sessionId;
      // Auto-initialize session if not created yet
      if (!curSessionId) {
        const startTime = tradeParams.tradeTime || replayTime || (candles.length > 0 ? new Date(candles[candles.length - 1].time) : new Date());
        const prov = getProviderForSymbol(symbol);
        const resSession = await fetch(apiUrl('/backtest/sessions'), {
          method: 'POST',
          headers: defaultHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            name: `Backtest ${symbol} ${timeframe} (${startTime.toISOString().slice(0, 10)})`,
            symbol,
            provider: prov,
            timeframe,
            startTime: startTime.toISOString(),
            initialBalance,
            riskPercent,
            drawingsJson: JSON.stringify(drawings),
          }),
        });
        const sessionJson = await resSession.json();
        if (!sessionJson.ok) throw new Error(sessionJson.error || 'Failed to create session');
        curSessionId = sessionJson.data.id;
        setSessionId(curSessionId);
        setBalance(sessionJson.data.currentBalance);
        setReplayTime(startTime);
        setReplayStartTime(startTime);
        setAppMode('replay');
      }

      const tradeTime = tradeParams.tradeTime || replayTime || (candles.length > 0 ? new Date(candles[candles.length - 1].time) : new Date());

      // Ensure backend session replayTime is strictly synced to tradeTime before placing trade
      await fetch(apiUrl(`/backtest/sessions/${curSessionId}`), {
        method: 'PUT',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ replayTime: tradeTime.toISOString() }),
      });

      const res = await fetch(apiUrl(`/backtest/sessions/${curSessionId}/trades`), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          side: tradeParams.side,
          entryPrice: tradeParams.entryPrice,
          slPrice: tradeParams.slPrice,
          tpPrice: tradeParams.tpPrice,
          volume: tradeParams.volume,
          riskAmount: tradeParams.riskAmount,
          entryTime: tradeTime.toISOString(),
          ...(tradeParams.orderType ? { orderType: tradeParams.orderType } : {}),
          ...(tradeParams.status ? { status: tradeParams.status } : {}),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to open trade');
      setTrades((prev) => [
        json.data,
        ...prev.filter((t) => t.id !== json.data.id && t.id !== tradeParams.optimisticId),
      ]);
      setIntrabarWarning(null);
      showToast({
        kind: 'ENTRY',
        symbol,
        side: tradeParams.side,
        price: tradeParams.entryPrice,
        lotSize: tradeParams.volume,
      });
    } catch (err: any) {
      if (tradeParams.optimisticId) {
        setTrades((prev) => prev.filter((t) => t.id !== tradeParams.optimisticId));
        if (tradeParams.triggeredOrder) {
          setPendingOrders((prev) => [...prev.filter((p) => p.id !== tradeParams.triggeredOrder!.id), tradeParams.triggeredOrder!]);
        }
      }
      showToast({
        kind: 'ERROR',
        title: 'ORDER GAGAL',
        message: `Gagal membuka posisi: ${err.message}`,
      });
    } finally {
      setIsSubmittingTrade(false);
    }
  };
  handleOpenTradeRef.current = handleOpenTrade;

  // Quick-trade from mobile bar: delegate to whichever OrderPanel instance is mounted
  const handleQuickTrade = useCallback((side: TradeSide) => {
    if (appMode === 'analysis') {
      setShowAnalysisGuideModal(true);
      return;
    }
    const ref = mobileOrderPanelRef.current || orderPanelRef.current;
    if (ref) {
      ref.executeQuick(side);
    }
  }, [appMode]);

  // ── 13. Manual Close Individual Trade ──
  const handleManualClose = async (tradeId?: string) => {
    const idToClose = tradeId || activeTrade?.id;
    if (!sessionId || !idToClose || isSubmittingTrade) return;
    setIsSubmittingTrade(true);
    try {
      const currentP = candles[candles.length - 1]?.close || activeTrade?.entryPrice || 0;
      const res = await fetch(apiUrl(`/backtest/sessions/${sessionId}/trades/${idToClose}/close`), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          exitTime: replayTime?.toISOString(),
          exitPrice: currentP,
          exitReason: 'MANUAL_CLOSE',
        }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        const closed = json.data.trade;
        setTrades((prev) => prev.map((t) => (t.id === closed.id ? closed : t)));
        setBalance(json.data.session.currentBalance);
        showToast({
          kind: 'CLOSE',
          symbol,
          amount: typeof closed.pnl === 'number' ? closed.pnl : undefined,
          rr: typeof closed.rr === 'number' ? closed.rr : undefined,
        });
        fetch(apiUrl(`/backtest/sessions/${sessionId}/sync-to-journal`), {
          method: 'POST',
          headers: defaultHeaders(),
        }).catch(console.error);
      } else {
        showToast({
          kind: 'ERROR',
          title: 'GAGAL MENUTUP',
          message: json.error || 'Terjadi kesalahan saat menutup posisi',
        });
      }
    } catch (err: any) {
      console.error('Manual close error:', err);
      showToast({
        kind: 'ERROR',
        title: 'GAGAL MENUTUP',
        message: err.message,
      });
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  // ── 13c. Sync & Open in Main Dashboard ──
  const handleOpenDashboard = async () => {
    if (!sessionId) {
      navigate('/dashboard');
      return;
    }
    try {
      setIsSyncingDashboard(true);
      const res = await fetch(apiUrl(`/backtest/sessions/${sessionId}/sync-to-journal`), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
      });
      const json = await res.json();
      if (json.ok && json.data && json.data.journalSessionId) {
        navigate(`/dashboard?sessionId=${json.data.journalSessionId}`);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Failed to sync replay session to journal:', err);
      navigate('/dashboard');
    } finally {
      setIsSyncingDashboard(false);
    }
  };

  // ── 13d. Execute Planned Position from Drawing Tool ──
  const handleExecutePlannedTrade = (pos: DrawingItem) => {
    if (appMode !== 'replay' || !sessionId) {
      showToast({
        kind: 'INFO',
        title: 'MODE REPLAY',
        message: 'Aktifkan mode Chart Replay terlebih dahulu untuk melakukan transaksi live backtest.',
      });
      return;
    }
    if (activeTrade) {
      showToast({
        kind: 'ERROR',
        title: 'POSISI AKTIF',
        message: 'Posisi aktif masih terbuka. Tutup posisi terlebih dahulu sebelum membuka posisi baru.',
      });
      return;
    }
    const isLong = pos.type === 'long_position';
    const entryPrice = pos.startPrice || currentPrice;
    const slPrice = pos.slPrice;
    const tpPrice = pos.tpPrice;
    if (!slPrice || !tpPrice) {
      showToast({
        kind: 'ERROR',
        title: 'SL / TP INVALID',
        message: 'Posisi belum memiliki SL dan TP yang valid.',
      });
      return;
    }
    const lotSize = calculatePositionSize(balance, riskPercent, entryPrice, slPrice, getSymbolContractSize(symbol));
    const riskAmount = (balance * riskPercent) / 100;
    handleOpenTrade({
      side: isLong ? 'LONG' : 'SHORT',
      entryPrice,
      slPrice,
      tpPrice,
      volume: lotSize,
      riskAmount,
    });
  };

  // ── 14. Jump to Current Replay Candle ──
  const handleJumpToCurrent = () => { setFollowReplay(true); };

  // ── 15. Keyboard Shortcuts ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (appMode === 'replay') setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowRight' || (e.shiftKey && e.key === 'Tab') || e.code === 'KeyD' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (appMode === 'replay') stepForward();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (appMode === 'replay') stepBack();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        if (appMode === 'replay' && !followReplay) {
          handleJumpToCurrent();
        } else {
          setIsJumpDialogOpen(true);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDrawingId) {
          e.preventDefault();
          handleDeleteSelectedDrawing();
        }
      } else if (e.key === 'Escape') {
        if (appMode === 'selecting') {
          handleExitReplay();
        } else if (selectedDrawingId) {
          setSelectedDrawingId(null);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepForward, stepBack, isFullscreen, selectedDrawingId, followReplay, appMode, drawings]);

  // Current market price from latest visible candle
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const buyPriceLabel = currentPrice > 0 ? currentPrice.toFixed(2) : '--.--';
  const sellPriceLabel = currentPrice > 0 ? Math.max(currentPrice - 0.02, 0).toFixed(2) : '--.--';
  const stats: IBacktestStats = calculateBacktestStats(tradeHistory, initialBalance, activeTrade, currentPrice);
  // Floating PnL for the open position, computed locally (not in BacktestStats).
  const liveFloatingPnl = activeTrade && activeTrade.status === 'OPEN' && currentPrice > 0
    ? calculatePnL(activeTrade.side, activeTrade.entryPrice, currentPrice, activeTrade.volume, getSymbolContractSize(symbol))
    : 0;

  const liveFloatingR = activeTrade && activeTrade.status === 'OPEN' && activeTrade.slPrice && activeTrade.slPrice > 0 && Math.abs(activeTrade.entryPrice - activeTrade.slPrice) > 0
    ? (activeTrade.side === 'LONG'
        ? (currentPrice - activeTrade.entryPrice) / Math.abs(activeTrade.entryPrice - activeTrade.slPrice)
        : (activeTrade.entryPrice - currentPrice) / Math.abs(activeTrade.entryPrice - activeTrade.slPrice))
    : undefined;

  const [isMobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetKind, setMobileSheetKind] = useState<'MENU' | 'ORDER' | 'TOOLS' | 'STATS' | 'HISTORY' | 'AI'>('ORDER');

  const openMobileSheet = (kind: typeof mobileSheetKind) => {
    setMobileSheetKind(kind);
    setMobileSheetOpen(true);
  };

  const closeMobileSheet = () => {
    setMobileSheetOpen(false);
  };

  const executeSmartBack = useCallback(() => {
    // Structural exit route: always return to internal session hub (/sessions)
    // Never allow falling back to public routes like /landing via navigate(-1)
    navigate('/sessions', { replace: true });
  }, [navigate]);

  const handleSmartBack = useCallback(() => {
    if (isMobileSheetOpen) {
      closeMobileSheet();
      return;
    }

    if (isVisualOrderActive) {
      setIsVisualOrderActive(false);
      return;
    }

    if (appMode === 'selecting') {
      setAppMode('analysis');
      return;
    }

    const hasActiveModifiedSession =
      (appMode === 'replay' || Boolean(sessionId)) &&
      (Boolean(activeTrade) || trades.length > 0);

    if (hasActiveModifiedSession) {
      setShowExitConfirmModal(true);
      return;
    }

    executeSmartBack();
  }, [isMobileSheetOpen, isVisualOrderActive, appMode, sessionId, activeTrade, trades.length, executeSmartBack]);

  const handleChartOrderOpen = (side: TradeSide) => {
    if (appMode === 'analysis') {
      setShowAnalysisGuideModal(true);
      return;
    }
    setTradeSide(side);
    setIsVisualOrderActive(false);
    setPlannedTrade(null);
    setIsOrderPanelOpen(true);
    const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    if (isMobileViewport) {
      openMobileSheet('ORDER');
    }
  };

  const handleSubmitVisualOrder = useCallback((tradeParams: {
    orderType?: OrderExecutionType;
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => {
    if (appMode === 'analysis') {
      setShowAnalysisGuideModal(true);
      return;
    }
    if (activeTrade) {
      showToast({
        kind: 'ERROR',
        title: 'POSISI AKTIF',
        message: 'Posisi aktif masih terbuka. Tutup posisi terlebih dahulu sebelum membuka posisi baru.',
      });
      return;
    }

    const hasSL = tradeParams.slPrice > 0;
    const hasTP = tradeParams.tpPrice > 0;
    const rrCalc = hasSL && hasTP
      ? calculateRR(tradeParams.side, tradeParams.entryPrice, tradeParams.slPrice, tradeParams.tpPrice)
      : { isValid: true, rr: 0 };

    const direction: OrderDirection = tradeParams.side === 'LONG' ? 'BUY' : 'SELL';
    const currentP = candles[candles.length - 1]?.close || 0;
    const effectiveClassification = getEffectiveOrderType({
      direction,
      entryPrice: tradeParams.entryPrice,
      marketPrice: currentP,
      symbol,
    });
    const resolvedType = effectiveClassification.orderType;
    const validation = validateOrderPrices(
      resolvedType,
      currentP,
      tradeParams.entryPrice,
      tradeParams.slPrice,
      tradeParams.tpPrice,
      symbol
    );

    const nextPlannedTrade: PlannedOrderPreview = {
      orderType: resolvedType,
      side: tradeParams.side === 'LONG' ? 'BUY' : 'SELL',
      entryPrice: tradeParams.entryPrice,
      slPrice: tradeParams.slPrice,
      tpPrice: tradeParams.tpPrice,
      lotSize: tradeParams.volume,
      riskAmount: tradeParams.riskAmount,
      targetProfit: rrCalc.isValid && hasSL && hasTP ? tradeParams.riskAmount * rrCalc.rr : 0,
      rrRatio: rrCalc.isValid && hasSL && hasTP ? rrCalc.rr : 0,
      isValid: validation.isValid,
      validationError: validation.error,
    };

    setTradeSide(tradeParams.side);
    setPlannedTrade(nextPlannedTrade);
    setControlledEntryPrice(tradeParams.entryPrice);
    setControlledSlPrice(tradeParams.slPrice);
    setControlledTpPrice(tradeParams.tpPrice);
    setIsVisualOrderActive(true);
    setIsOrderPanelOpen(false);
    setMobileSheetOpen(false);
  }, [activeTrade, candles, showToast, appMode]);

  const handleCancelPendingOrder = useCallback((id: string) => {
    setPendingOrders((prev) => prev.filter((o) => o.id !== id));
    if (editingPendingOrderIdRef.current === id) {
      editingPendingOrderIdRef.current = null;
      originalPendingOrderRef.current = null;
      setIsVisualOrderActive(false);
      setPlannedTrade(null);
      setControlledEntryPrice(null);
      setControlledSlPrice(null);
      setControlledTpPrice(null);
    }
    showToast({
      kind: 'INFO',
      symbol,
      title: 'ORDER DIBATALKAN',
      message: 'Pending order berhasil dibatalkan.',
    });
  }, [showToast, symbol]);

  const handleEditPendingOrder = useCallback((orderOrId: PendingOrderRecord | string) => {
    const po = typeof orderOrId === 'string'
      ? pendingOrdersRef.current.find((p) => p.id === orderOrId)
      : orderOrId;
    if (!po) return;

    editingPendingOrderIdRef.current = po.id;
    originalPendingOrderRef.current = { ...po };

    // Remove from active list while editing
    setPendingOrders((prev) => prev.filter((p) => p.id !== po.id));

    const currentP = candles[candles.length - 1]?.close || 0;
    const validation = validateOrderPrices(
      po.orderType,
      currentP,
      po.entryPrice,
      po.slPrice,
      po.tpPrice,
      symbol
    );

    const editPreview: PlannedOrderPreview = {
      orderType: po.orderType,
      side: po.side === 'LONG' ? 'BUY' : 'SELL',
      entryPrice: po.entryPrice,
      slPrice: po.slPrice,
      tpPrice: po.tpPrice,
      lotSize: po.volume,
      riskAmount: po.riskAmount,
      targetProfit: po.targetProfit,
      rrRatio: po.rrRatio,
      isValid: validation.isValid,
      validationError: validation.error,
    };

    setTradeSide(po.side);
    setPlannedTrade(editPreview);
    setControlledEntryPrice(po.entryPrice);
    setControlledSlPrice(po.slPrice);
    setControlledTpPrice(po.tpPrice);
    setIsVisualOrderActive(true);
    setIsOrderPanelOpen(false);
    setMobileSheetOpen(false);

    showToast({
      kind: 'INFO',
      symbol,
      title: 'EDIT PENDING ORDER',
      message: `Atur level ${po.orderType.replace('_', ' ')} pada chart lalu tekan Confirm Order untuk menyimpan.`,
    });
  }, [candles, showToast, symbol]);

  const handlePickChartEntry = useCallback((orderType: OrderExecutionType) => {
    if (appMode === 'analysis') {
      setShowAnalysisGuideModal(true);
      return;
    }
    const { direction } = deconstructOrderType(orderType);
    const side: TradeSide = direction === 'BUY' ? 'LONG' : 'SHORT';
    const currentP = candles.length > 0 ? candles[candles.length - 1].close : currentPrice;
    const entry = controlledEntryPrice && controlledEntryPrice > 0 ? controlledEntryPrice : currentP;
    if (entry <= 0) return;

    const { slDistance } = calculateAdaptiveOffsets(candles || [], entry, symbol);
    const sl = controlledSlPrice && controlledSlPrice > 0
      ? controlledSlPrice
      : (direction === 'BUY' ? entry - slDistance : entry + slDistance);
    const tp = controlledTpPrice && controlledTpPrice > 0
      ? controlledTpPrice
      : calculateTPFromRR(side, entry, sl, 2.0);
    const roundedSL = Math.round(sl * 100) / 100;
    const roundedTP = Math.round(tp * 100) / 100;
    const calcLots = calculatePositionSize(balance, riskPercent, entry, roundedSL, getSymbolContractSize(symbol));

    handleSubmitVisualOrder({
      orderType,
      side,
      entryPrice: entry,
      slPrice: roundedSL,
      tpPrice: roundedTP,
      volume: calcLots > 0 ? calcLots : 1.0,
      riskAmount: (balance * riskPercent) / 100,
    });
  }, [appMode, controlledEntryPrice, candles, currentPrice, symbol, controlledSlPrice, controlledTpPrice, balance, riskPercent, handleSubmitVisualOrder]);

  const handlePlaceOrder = useCallback((order: {
    orderType: OrderExecutionType;
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => {
    if (order.orderType === 'MARKET_BUY' || order.orderType === 'MARKET_SELL') {
      void handleOpenTrade({
        side: order.side,
        entryPrice: order.entryPrice,
        slPrice: order.slPrice,
        tpPrice: order.tpPrice,
        volume: order.volume,
        riskAmount: order.riskAmount,
      });
      return;
    }

    const isEdit = Boolean(editingPendingOrderIdRef.current);
    const pendingId = editingPendingOrderIdRef.current || `po-${Date.now()}`;
    editingPendingOrderIdRef.current = null;
    originalPendingOrderRef.current = null;

    const hasSL = order.slPrice > 0;
    const hasTP = order.tpPrice > 0;
    const rrCalc = (hasSL && hasTP)
      ? calculateRR(order.side, order.entryPrice, order.slPrice, order.tpPrice)
      : { isValid: false, rr: 0 };
    const contractSize = getSymbolContractSize(symbol);
    const tpDist = hasTP ? Math.abs(order.tpPrice - order.entryPrice) : 0;
    const targetProfit = (hasTP && order.volume > 0)
      ? order.volume * tpDist * contractSize
      : (rrCalc.isValid ? order.riskAmount * rrCalc.rr : order.riskAmount * 2);
    const rrRatio = rrCalc.isValid ? rrCalc.rr : 2.0;

    const newPending: PendingOrderRecord = {
      id: pendingId,
      orderType: order.orderType as 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP',
      side: order.side,
      entryPrice: order.entryPrice,
      slPrice: order.slPrice,
      tpPrice: order.tpPrice,
      volume: order.volume,
      riskAmount: order.riskAmount,
      targetProfit: Math.round(targetProfit * 100) / 100,
      rrRatio: Math.round(rrRatio * 100) / 100,
      placedTime: new Date(),
    };
    setPendingOrders((prev) => [...prev, newPending]);
    setIsVisualOrderActive(false);
    setPlannedTrade(null);
    setControlledEntryPrice(null);
    setControlledSlPrice(null);
    setControlledTpPrice(null);
    showToast({
      kind: 'ENTRY',
      symbol,
      title: isEdit ? 'ORDER DIPERBARUI' : 'PENDING ORDER DITEMPATKAN',
      message: `${order.orderType.replace('_', ' ')} @ $${order.entryPrice.toFixed(2)} ${isEdit ? 'berhasil diperbarui' : 'ditempatkan pada chart'}.`,
    });
  }, [handleOpenTrade, showToast, symbol]);

  const handleConfirmVisualOrder = useCallback(async () => {
    if (!plannedTrade) return;

    if (plannedTrade.orderType && plannedTrade.orderType !== 'MARKET_BUY' && plannedTrade.orderType !== 'MARKET_SELL') {
      handlePlaceOrder({
        orderType: plannedTrade.orderType,
        side: plannedTrade.side === 'BUY' ? 'LONG' : 'SHORT',
        entryPrice: plannedTrade.entryPrice,
        slPrice: plannedTrade.slPrice || 0,
        tpPrice: plannedTrade.tpPrice || 0,
        volume: plannedTrade.lotSize,
        riskAmount: plannedTrade.riskAmount,
      });
      return;
    }

    if (activeTrade) {
      showToast({
        kind: 'ERROR',
        title: 'POSISI AKTIF',
        message: 'Posisi aktif masih terbuka. Tutup posisi terlebih dahulu sebelum membuka posisi baru.',
      });
      return;
    }

    await handleOpenTrade({
      side: plannedTrade.side === 'BUY' ? 'LONG' : 'SHORT',
      entryPrice: plannedTrade.entryPrice,
      slPrice: plannedTrade.slPrice || 0,
      tpPrice: plannedTrade.tpPrice || 0,
      volume: plannedTrade.lotSize,
      riskAmount: plannedTrade.riskAmount,
    });

    setIsVisualOrderActive(false);
    setPlannedTrade(null);
    setControlledEntryPrice(null);
    setControlledSlPrice(null);
    setControlledTpPrice(null);
  }, [activeTrade, handleOpenTrade, handlePlaceOrder, plannedTrade, showToast]);

  const handleCancelVisualOrder = useCallback(() => {
    if (editingPendingOrderIdRef.current && originalPendingOrderRef.current) {
      const orig = originalPendingOrderRef.current;
      setPendingOrders((prev) => [...prev.filter((p) => p.id !== orig.id), orig]);
      editingPendingOrderIdRef.current = null;
      originalPendingOrderRef.current = null;
    }
    setIsVisualOrderActive(false);
    setPlannedTrade(null);
    setControlledEntryPrice(null);
    setControlledSlPrice(null);
    setControlledTpPrice(null);
  }, []);

  // ── AI Auto-Pilot Runner Engine (Automatic Step & AI Trading) ──
  const runAutoPilotStep = useCallback(async () => {
    if (!isAutoPilotActive) return;
    if (appMode !== 'replay') {
      setIsAutoPilotActive(false);
      return;
    }
    if (isAutoPilotRunningRef.current) return;
    isAutoPilotRunningRef.current = true;

    try {
      // 1. Step replay forward by 1 candle
      await stepForward();

      // 2. Check if a position or pending order is active
      const active = activeTradeRef.current;
      const pending = pendingOrdersRef.current;

      if (active && active.status === 'OPEN') {
        setAutoPilotStatusLog(`🤖 Posisi ${active.side} Aktif @ ${active.entryPrice.toFixed(2)} — Memantau Candle #${candlesRef.current.length}...`);
        return;
      }

      if (pending && pending.length > 0) {
        setAutoPilotStatusLog(`🤖 Pending Order ${pending[0].orderType} Aktif @ ${pending[0].entryPrice.toFixed(2)} — Menunggu Entry...`);
        return;
      }

      // 3. Flat market: Scan AI for setup on latest candle
      const curCandles = candlesRef.current;
      if (curCandles.length === 0) return;
      const curPrice = curCandles[curCandles.length - 1].close;
      const recent = curCandles.slice(-60);

      setAutoPilotStatusLog(`🤖 Menganalisis Candle #${curCandles.length} @ ${curPrice.toFixed(2)}...`);

      const controller = new AbortController();
      const tOut = setTimeout(() => controller.abort(), 9000);

      try {
        const res = await fetch(apiUrl('/ai/analyze-chart'), {
          method: 'POST',
          headers: defaultHeaders({ 'Content-Type': 'application/json' }),
          signal: controller.signal,
          body: JSON.stringify({
            symbol,
            timeframe,
            currentPrice: curPrice,
            recentCandles: recent,
            balance,
            language: 'id'
          })
        });
        clearTimeout(tOut);

        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          setAutoPilotStatusLog(`🤖 Bar #${curCandles.length} — Respon AI tidak valid, melewatinya...`);
          return;
        }

        if (json.ok && json.signal) {
          const sig: AiCopilotSignal = json.signal;
          if ((sig.action === 'BUY' || sig.action === 'SELL') && sig.confidence >= 60) {
            const side = sig.action === 'BUY' ? 'LONG' : 'SHORT';
            setTradeSide(side);
            const rPct = sig.riskPercent && sig.riskPercent > 0 ? sig.riskPercent : riskPercent;
            const slP = sig.slPrice ?? (side === 'LONG' ? curPrice - 5 : curPrice + 5);
            const tpP = sig.tpPrice ?? (side === 'LONG' ? curPrice + 10 : curPrice - 10);
            const isLimit = sig.orderType === 'BUY_LIMIT' || sig.orderType === 'SELL_LIMIT' || sig.orderType === 'BUY_STOP' || sig.orderType === 'SELL_STOP';

            if (isLimit && sig.entryPrice && Math.abs(sig.entryPrice - curPrice) > (curPrice * 0.0003)) {
              const volume = slP > 0 ? calculatePositionSize(balance, rPct, sig.entryPrice, slP, getSymbolContractSize(symbol)) : 1.0;
              const riskAmount = (balance * rPct) / 100;
              handlePlaceOrder({
                orderType: sig.orderType as OrderExecutionType,
                entryPrice: sig.entryPrice,
                slPrice: slP,
                tpPrice: tpP,
                side,
                volume: volume > 0 ? volume : 1.0,
                riskAmount
              });
              setAutoPilotStatusLog(`🤖 AUTO-EXECUTE PENDING: ${sig.orderType} ${side} @ ${sig.entryPrice.toFixed(2)} (${sig.setupName})`);
              showToast({
                kind: 'ENTRY',
                symbol,
                title: '🤖 AUTO-PILOT ENTRY',
                side,
                price: sig.entryPrice,
                lotSize: volume > 0 ? volume : 1.0,
                message: `${sig.orderType} ${side} @ $${sig.entryPrice.toFixed(2)} (${sig.setupName || 'AI Confluence'})`
              });
            } else {
              const volume = slP > 0 ? calculatePositionSize(balance, rPct, curPrice, slP, getSymbolContractSize(symbol)) : 1.0;
              const riskAmount = (balance * rPct) / 100;
              handleOpenTrade({
                side,
                entryPrice: curPrice,
                slPrice: slP,
                tpPrice: tpP,
                volume: volume > 0 ? volume : 1.0,
                riskAmount,
                orderType: side === 'LONG' ? 'MARKET_BUY' : 'MARKET_SELL',
                status: 'OPEN'
              });
              setAutoPilotStatusLog(`🤖 AUTO-EXECUTE MARKET: ${side} @ ${curPrice.toFixed(2)} (${sig.setupName})`);
              showToast({
                kind: 'ENTRY',
                symbol,
                title: '🤖 AUTO-PILOT ENTRY',
                side,
                price: curPrice,
                lotSize: volume > 0 ? volume : 1.0,
                message: `${side} @ $${curPrice.toFixed(2)} (${sig.setupName || 'AI Confluence'})`
              });
            }
          } else {
            setAutoPilotStatusLog(`🤖 Bar #${curCandles.length} — AI Signal: WAIT (${sig.reasoning || 'Tunggu momentum'})`);
          }
        }
      } catch (e: any) {
        clearTimeout(tOut);
        setAutoPilotStatusLog(`🤖 Bar #${curCandles.length} — Scanning timeout / skipping.`);
      }
    } finally {
      isAutoPilotRunningRef.current = false;
    }
  }, [isAutoPilotActive, appMode, stepForward, symbol, timeframe, balance, riskPercent, handlePlaceOrder, handleOpenTrade, showToast]);

  useEffect(() => {
    if (!isAutoPilotActive || appMode !== 'replay') return;
    const interval = setInterval(() => {
      runAutoPilotStep();
    }, autoPilotSpeed);
    return () => clearInterval(interval);
  }, [isAutoPilotActive, appMode, autoPilotSpeed, runAutoPilotStep]);


  const replayReset = appMode === 'replay' && replayStartTime
    ? () => { void initReplaySession(replayStartTime, timeframe); }
    : undefined;

  // ── Draggable Quick Trade Floating Action Pill (GPU-Accelerated Ref-Based Dragging) ──
  // On mount and window resize: keep pill positioned via translate3d within safe viewport bounds
  useEffect(() => {
    const handleResize = () => {
      const el = pillRef.current;
      if (!el) return;
      const elW = el.offsetWidth || 180;
      const elH = el.offsetHeight || 44;
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const { minX, maxX, minY, maxY } = getPillBounds(elW, elH, winW, winH);

      const clampedX = Math.max(minX, Math.min(maxX, pillPosRef.current.x));
      const clampedY = Math.max(minY, Math.min(maxY, pillPosRef.current.y));
      pillPosRef.current = { x: clampedX, y: clampedY };
      el.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    };

    const initPos = getInitialPillPos();
    pillPosRef.current = initPos;
    if (pillRef.current) {
      pillRef.current.style.transform = `translate3d(${initPos.x}px, ${initPos.y}px, 0)`;
    }

    window.addEventListener('resize', handleResize);
    // Double-check clamp when layout elements finish initial layout calculations
    const t1 = setTimeout(handleResize, 60);
    const t2 = setTimeout(handleResize, 300);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [urlSessionId, getInitialPillPos, getPillBounds]);

  // Re-clamp position whenever loading finishes (chart & header layout stabilized)
  useEffect(() => {
    if (!loading) {
      const el = pillRef.current;
      if (!el) return;
      const elW = el.offsetWidth || 180;
      const elH = el.offsetHeight || 44;
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const { minX, maxX, minY, maxY } = getPillBounds(elW, elH, winW, winH);
      const clampedX = Math.max(minX, Math.min(maxX, pillPosRef.current.x));
      const clampedY = Math.max(minY, Math.min(maxY, pillPosRef.current.y));
      pillPosRef.current = { x: clampedX, y: clampedY };
      el.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
    }
  }, [loading, getPillBounds]);

  // Keep pill clamped safely when expanding/collapsing
  useEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const elW = el.offsetWidth || 180;
    const elH = el.offsetHeight || 44;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const { minX, maxX, minY, maxY } = getPillBounds(elW, elH, winW, winH);

    const clampedX = Math.max(minX, Math.min(maxX, pillPosRef.current.x));
    const clampedY = Math.max(minY, Math.min(maxY, pillPosRef.current.y));
    pillPosRef.current = { x: clampedX, y: clampedY };
    el.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
  }, [isQuickTradeCollapsed, getPillBounds]);

  const handlePillPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;

    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    pillDragStartRef.current.isDragging = true;
    pillDragHasMovedRef.current = false;

    // CRITICAL FIX: Calculate the offset between the pointer and the CURRENT transform position
    pillDragStartRef.current.offsetX = e.clientX - pillPosRef.current.x;
    pillDragStartRef.current.offsetY = e.clientY - pillPosRef.current.y;
  };

  const handlePillPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pillDragStartRef.current.isDragging || !pillRef.current) return;
    let hasCapture = true;
    try {
      hasCapture = e.currentTarget.hasPointerCapture(e.pointerId);
    } catch {}
    if (!hasCapture) return;

    e.stopPropagation();
    if (e.cancelable) e.preventDefault(); // Stop mobile scroll and pull-to-refresh

    // Calculate new raw position based on pointer offset
    let newX = e.clientX - pillDragStartRef.current.offsetX;
    let newY = e.clientY - pillDragStartRef.current.offsetY;

    if (Math.hypot(newX - pillPosRef.current.x, newY - pillPosRef.current.y) > 4) {
      pillDragHasMovedRef.current = true;
    }

    const el = pillRef.current;
    const elW = el.offsetWidth || 180;
    const elH = el.offsetHeight || 44;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 600;

    // Strict boundary clamping so the pill NEVER covers the info bar / context dock
    const { minX, maxX, minY, maxY } = getPillBounds(elW, elH, winW, winH);

    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));

    // Update ref and DOM directly (Zero React re-renders during active drag)
    pillPosRef.current = { x: newX, y: newY };
    el.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
  };

  const handlePillPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pillDragStartRef.current.isDragging) return;
    e.stopPropagation();
    pillDragStartRef.current.isDragging = false;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    setTimeout(() => {
      pillDragHasMovedRef.current = false;
    }, 60);
  };

  const renderQuickTradePill = () => {
    const pillStyle: React.CSSProperties = {
      position: 'fixed',
      top: 0,
      left: 0,
      transform: `translate3d(${pillPosRef.current.x}px, ${pillPosRef.current.y}px, 0)`,
      touchAction: 'none',
      margin: 0,
    };

    return (
      <AnimatePresence>
        {appMode !== 'selecting' && !isSubmittingTrade && !activeTrade && (
          <div
            ref={pillRef}
            style={pillStyle}
            className="fixed top-0 left-0 z-20 w-fit pointer-events-auto select-none touch-none will-change-transform"
          >
            {isQuickTradeCollapsed ? (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1 p-0.5 bg-white/95 backdrop-blur-sm rounded-full border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]"
              >
                {/* Drag handle with generous mobile touch target */}
                <div
                  onPointerDown={handlePillPointerDown}
                  onPointerMove={handlePillPointerMove}
                  onPointerUp={handlePillPointerUp}
                  onPointerCancel={handlePillPointerUp}
                  className="flex items-center justify-center pl-3 pr-2 py-2 cursor-grab active:cursor-grabbing touch-none text-[#717182] hover:text-[#121212] active:bg-slate-100 transition-colors select-none rounded-l-full -ml-0.5 -my-0.5"
                  style={{ touchAction: 'none' }}
                  title="Geser posisi widget"
                  aria-label="Geser posisi widget"
                >
                  <GripVertical className="w-4 h-4 pointer-events-none text-[#717182]" />
                </div>

                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (pillDragHasMovedRef.current) return;
                    setIsQuickTradeCollapsed(false);
                  }}
                  className="touch-auto flex items-center gap-1.5 pr-3 py-1.5 text-[#121212] text-[10px] font-black tracking-wider uppercase cursor-pointer transition-all active:translate-x-[1px] active:translate-y-[1px] select-none"
                  title="Buka Tombol Order Cepat"
                  aria-label="Buka Tombol Order Cepat"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono">ORDER</span>
                  <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-1.5 p-1 bg-white/95 backdrop-blur-sm rounded-xl border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212]"
              >
                {/* Dedicated Drag Handle with Large Hitbox */}
                <div
                  onPointerDown={handlePillPointerDown}
                  onPointerMove={handlePillPointerMove}
                  onPointerUp={handlePillPointerUp}
                  onPointerCancel={handlePillPointerUp}
                  className="flex items-center justify-center px-3.5 py-2.5 sm:px-4 sm:py-3 cursor-grab active:cursor-grabbing touch-none text-[#717182] hover:text-[#121212] active:bg-slate-100 transition-colors select-none rounded-l-lg -ml-1 -my-1"
                  style={{ touchAction: 'none' }}
                  title="Geser posisi widget"
                  aria-label="Geser posisi widget"
                >
                  <GripVertical className="w-5 h-5 pointer-events-none text-[#717182]" />
                </div>

                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (pillDragHasMovedRef.current) return;
                    handleChartOrderOpen('LONG');
                  }}
                  className="touch-auto bg-[#059669] hover:bg-[#047857] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-white font-mono font-black text-xs px-3.5 py-1.5 rounded-lg border-2 border-[#121212] shadow-[1.5px_1.5px_0px_0px_#121212] transition-all cursor-pointer select-none"
                >
                  BUY
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (pillDragHasMovedRef.current) return;
                    handleChartOrderOpen('SHORT');
                  }}
                  className="touch-auto bg-[#DC2626] hover:bg-[#B91C1C] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-white font-mono font-black text-xs px-3.5 py-1.5 rounded-lg border-2 border-[#121212] shadow-[1.5px_1.5px_0px_0px_#121212] transition-all cursor-pointer select-none"
                >
                  SELL
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (pillDragHasMovedRef.current) return;
                    setIsQuickTradeCollapsed(true);
                  }}
                  className="touch-auto p-1.5 hover:bg-slate-100 rounded-md text-slate-500 hover:text-slate-900 transition-colors cursor-pointer select-none"
                  title="Sembunyikan Tombol Order (Minimize)"
                  aria-label="Sembunyikan Tombol Order"
                >
                  <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                </button>
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>
    );
  };

  // ── MOBILE TERMINAL ──
  // Chart is the hero. Strip = symbol/TF/mode. Context = position info.
  // Actions = primary buy/sell (or replay controls), secondary in a sheet.
  const mobileTerminal = (
    <div className="mobile-terminal block md:hidden w-full h-full flex flex-col overflow-hidden bg-slate-50 overscroll-none select-none">

      {/* Top strip: compact app-like header for pair / timeframe / mode. */}
      <div className="mobile-terminal-strip flex items-center justify-between gap-1.5 px-2 py-1.5 border-b-2 border-[#121212] bg-[#F0F0F0] w-full max-w-full overflow-x-hidden box-border">
        {/* Back button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSmartBack();
          }}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-white border-2 border-[#121212] text-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-[#FFFDEB] transition-colors cursor-pointer"
          aria-label="Back"
          title="Back"
        >
          <ChevronLeft className="w-5 h-5 pointer-events-none stroke-[2.5]" />
        </button>
        
        {/* Pair dropdown flex-1 */}
        <SymbolPicker
          value={symbol}
          onChange={handleSymbolChange}
          symbols={availableSymbols}
          disabled={appMode === 'replay'}
          className="flex-1 min-w-0"
        />

        {/* Timeframe dropdown */}
        <select
          value={timeframe}
          disabled={isTimeframeLoading || loading}
          onChange={(e) => handleTimeframeChange(e.target.value as ChartTimeframe)}
          aria-label="Timeframe"
          className="mobile-tag mobile-select shrink-0 px-1 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {(['M1','M5','M15','M30','H1','H4','D1'] as ChartTimeframe[]).map(tf => (
            <option key={tf} value={tf} className="bg-white text-slate-700">{tf}</option>
          ))}
        </select>

        {/* Stats icon-only on mobile */}
        <button
          type="button"
          onClick={() => openMobileSheet('STATS')}
          className="mobile-icon-btn shrink-0 w-8 h-8 p-1.5"
          aria-label="Session Stats"
          title="Session Stats"
        >
          <BarChart2 className="w-4 h-4" />
        </button>

        {/* Fullscreen / Expand */}
        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="mobile-icon-btn shrink-0 w-8 h-8 p-1.5"
          aria-label="Toggle Fullscreen"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Menu */}
        <button
          type="button"
          onClick={() => openMobileSheet('MENU')}
          className="mobile-icon-btn shrink-0 w-8 h-8 p-1.5"
          aria-label="Open mobile menu"
          title="Open mobile menu"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Error / hint as a thin strip with retry button */}
      {error && (
        <div className="mobile-terminal-strip flex items-center justify-between gap-2 px-2 py-1.5" style={{ background: 'rgba(220,38,38,0.12)', color: '#DC2626' }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
            <span className="text-[11px] font-semibold truncate text-red-700">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (appMode === 'replay' && replayStartTime) {
                initReplaySession(replayStartTime, timeframe, symbol);
              } else {
                loadAnalysisCandles(timeframe, symbol);
              }
            }}
            className="px-2 py-0.5 text-[10px] font-mono font-bold bg-white border border-[#121212] text-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none shrink-0 cursor-pointer"
          >
            Coba lagi
          </button>
        </div>
      )}
      {appMode === 'selecting' && (
        <div className="mobile-terminal-strip" style={{ background: 'rgba(240,192,32,0.10)', color: '#F0C020' }}>
          <Video className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-semibold truncate">Klik candle untuk mulai replay.</span>
        </div>
      )}

      {/* Chart: edge-to-edge, the largest element on the viewport. */}
      <div className="mobile-terminal-chart relative w-full flex-1 min-h-0 overflow-hidden touch-none overscroll-none select-none">
        
        <CandlestickChart
          candles={candles}
          timeframe={timeframe}
          symbol={symbol}
          isLoading={loading}
          error={error}
          appMode={appMode}
          activeTrade={
            activeTrade
              ? {
                  side: activeTrade.side,
                  entryPrice: activeTrade.entryPrice,
                  slPrice: activeTrade.slPrice,
                  tpPrice: activeTrade.tpPrice,
                  volume: activeTrade.volume,
                }
              : null
          }
          indicators={indicators}
          onIndicatorsChange={setIndicators}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          drawings={drawings}
          onDrawingsChange={handleDrawingsChange}
          selectedDrawingId={selectedDrawingId}
          onSelectDrawing={setSelectedDrawingId}
          onReplaySelectionClick={handleConfirmReplayStart}
          onSelectionTimeChange={setSelectionTime}
          onLoadOlderCandles={handleLoadOlderCandles}
          onLoadNewerCandles={handleLoadNewerCandles}
          followReplay={followReplay}
          onDisableFollowReplay={() => setFollowReplay(false)}
          lockRR={lockRR}
          isFullscreen={isFullscreen}
          pendingOrders={pendingOrders}
          onCancelPendingOrder={handleCancelPendingOrder}
          onEditPendingOrder={handleEditPendingOrder}
          onCloseActiveTrade={handleManualClose}
          plannedOrder={plannedTrade}
          onPlannedOrderChange={handlePlannedOrderChange}
          onExecutePlannedTrade={handleExecutePlannedTrade}
          isVisualOrderActive={isVisualOrderActive}
          onConfirmVisualOrder={handleConfirmVisualOrder}
          onCancelVisualOrder={handleCancelVisualOrder}
          isTimeframeLoading={isTimeframeLoading}
          balance={balance}
          equity={balance + liveFloatingPnl}
          floatingPnL={liveFloatingPnl}
          floatingR={liveFloatingR}
          hasOpenPositions={Boolean(activeTrade && activeTrade.status === 'OPEN')}
        />
      </div>

      {/* Context line: compact price + session trades + active trade info. */}
      <div className="mobile-terminal-context relative z-30">
        <div className="flex items-center gap-1.5 bg-[#FFFDEB] border-2 border-[#121212] px-2 py-0.5 shadow-[1px_1px_0px_0px_#121212] shrink-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-[#B45309]">Price</span>
          <span className="text-xs font-number font-black text-[#121212]">{currentPrice > 0 ? currentPrice.toFixed(2) : '--.--'}</span>
        </div>

        <div className="flex items-center gap-1 bg-white border-2 border-[#121212] px-2 py-0.5 shadow-[1px_1px_0px_0px_#121212] shrink-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-[#717182]">Trades</span>
          <span className="text-xs font-mono font-bold text-[#121212]">{tradeHistory.length}</span>
        </div>

        {appMode === 'replay' && replayTime && (
          <div className="flex items-center gap-1 bg-[#F0F0F0] border-2 border-[#121212] px-2 py-0.5 shadow-[1px_1px_0px_0px_#121212] shrink-0">
            <span className="text-[9px] font-black uppercase tracking-wider text-[#717182]">Time</span>
            <span className="text-xs font-mono font-bold text-[#121212]">{format(replayTime, 'MM-dd HH:mm')}</span>
          </div>
        )}

        <div className="flex-1" />

        {activeTrade ? (
          <>
            <span className={`mobile-tag ${activeTrade.side === 'LONG' ? 'mobile-tag-profit' : 'mobile-tag-loss'}`}>
              {activeTrade.side === 'LONG' ? 'LONG' : 'SHORT'} {activeTrade.volume.toFixed(2)}L
            </span>
            <span className={`text-xs font-number font-bold ${liveFloatingPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {liveFloatingPnl >= 0 ? '+' : ''}{liveFloatingPnl.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-xs font-semibold text-slate-500">Flat</span>
        )}
      </div>

      {/* Primary actions. Bounded bottom shell dock, thumb-reachable. */}
      <div className="relative z-30 w-full box-border border-t-2 border-[#121212] bg-white px-3 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-1.5 overflow-x-auto scrollbar-none shrink-0 select-none">
        {/* Analysis: drawing tools & order panel on left, Replay CTA on right */}
        {appMode === 'analysis' && (
          <>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openMobileSheet('AI')}
                className="mobile-icon-btn shrink-0 bg-[#FFD000] border-2 border-[#121212] text-[#121212]"
                aria-label="AI Copilot"
                title="AI Copilot"
              >
                <Sparkles className="w-4 h-4 text-[#1040C0]" />
              </button>
              <button
                type="button"
                onClick={() => openMobileSheet('TOOLS')}
                className="mobile-icon-btn"
                data-active={activeTool !== 'cursor'}
                aria-label="Drawing tools"
                title="Drawing tools"
              >
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => openMobileSheet('ORDER')}
                className="mobile-icon-btn"
                aria-label="Order panel"
                title="Order panel"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={handleActivateBarReplay}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1040C0] hover:bg-[#0D3399] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              title="Aktifkan Chart Replay"
            >
              <Video className="w-4 h-4 stroke-[2.5]" />
              <span>Chart Replay</span>
            </button>
          </>
        )}

        {/* Selecting: cancel only. Symmetrical edge-to-edge */}
        {appMode === 'selecting' && (
          <button
            type="button"
            onClick={handleExitReplay}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 border-2 border-[#121212] bg-[#DC2626] text-white font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            aria-label="Cancel replay selection"
          >
            <X className="w-4 h-4" /> Batal
          </button>
        )}

        {/* Replay: Playback controls on left, shortcuts on right - distributed symmetrically */}
        {appMode === 'replay' && (
          <>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={stepBack}
                disabled={loading || candles.length <= 1}
                className="mobile-icon-btn"
                aria-label="Step back"
                title="Step back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying((prev) => !prev)}
                disabled={loading}
                className="mobile-icon-btn"
                style={{ minWidth: 44, background: isPlaying ? '#fef3c7' : '#e2e8f0' }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 text-amber-700" /> : <Play className="w-4 h-4 text-slate-700" />}
              </button>
              <button
                type="button"
                onClick={stepForward}
                disabled={loading}
                className="mobile-icon-btn"
                aria-label="Step forward"
                title="Step forward"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              {/* Replay Speed Toggle */}
              <button
                type="button"
                onClick={() => {
                  const speeds: ReplaySpeed[] = [1, 2, 5, 10];
                  const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
                  setSpeed(next);
                }}
                className="mobile-icon-btn font-mono font-black text-xs min-w-[36px] bg-white border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                aria-label={`Kecepatan replay: ${speed}x`}
                title="Ganti Kecepatan Replay (1x, 2x, 5x, 10x)"
              >
                {speed}x
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openMobileSheet('AI')}
                className="mobile-icon-btn shrink-0 bg-[#FFD000] border-2 border-[#121212] text-[#121212]"
                aria-label="AI Copilot"
                title="AI Copilot"
              >
                <Sparkles className="w-4 h-4 text-[#1040C0]" />
              </button>
              <button
                type="button"
                onClick={() => openMobileSheet('ORDER')}
                className="mobile-icon-btn shrink-0"
                aria-label="Order panel"
                title="Order panel"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => openMobileSheet('TOOLS')}
                className="mobile-icon-btn shrink-0"
                data-active={activeTool !== 'cursor'}
                aria-label="Drawing tools"
                title="Drawing tools"
              >
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => openMobileSheet('STATS')}
                className="mobile-icon-btn shrink-0"
                aria-label="Session stats"
                title="Session stats"
              >
                <Activity className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Mobile bottom sheet: contextual, only when summoned. */}
      <AnimatePresence>
        {isMobileSheetOpen && (
          <div className="md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileSheetOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="mobile-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Contextual controls"
            >
              <div className="mobile-sheet-handle" />
              <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[#121212]">
                <span className="text-xs font-black uppercase tracking-wider text-[#121212] font-mono">
                  {mobileSheetKind === 'MENU' && 'Terminal Menu'}
                  {mobileSheetKind === 'ORDER' && 'Order Execution'}
                  {mobileSheetKind === 'TOOLS' && 'Drawing Tools'}
                  {mobileSheetKind === 'STATS' && 'Session Stats'}
                  {mobileSheetKind === 'HISTORY' && 'Trade History'}
                  {mobileSheetKind === 'AI' && '⚡ MurplyFX AI Copilot'}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  className="mobile-icon-btn"
                  style={{ minWidth: 32, minHeight: 32, padding: 4 }}
                  aria-label="Close sheet"
                >
                  <X className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

            {mobileSheetKind === 'MENU' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileSheetOpen(false);
                    setIsJumpDialogOpen(true);
                  }}
                  className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-white px-3.5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider text-[#121212] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#F0F0F0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#EAF2FF] flex items-center justify-center text-[#1040C0] shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span>Jump to date</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#121212]" />
                </button>

                {appMode === 'analysis' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSheetOpen(false);
                      handleActivateBarReplay();
                    }}
                    className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-[#EAF2FF] px-3.5 py-2.5 text-left text-xs font-black uppercase tracking-wider text-[#1040C0] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#D5E5FF] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                  >
                    <span className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#1040C0] flex items-center justify-center text-white shrink-0">
                        <Video className="w-4 h-4" />
                      </div>
                      <span>Activate Chart Replay</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#1040C0]" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMobileSheetOpen(false);
                    openMobileSheet('ORDER');
                  }}
                  className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-white px-3.5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider text-[#121212] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#F0F0F0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#F0F0F0] flex items-center justify-center text-[#121212] shrink-0">
                      <PanelRightOpen className="w-4 h-4" />
                    </div>
                    <span>Order Entry</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#121212]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileSheetOpen(false);
                    openMobileSheet('TOOLS');
                  }}
                  className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-white px-3.5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider text-[#121212] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#F0F0F0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#F0F0F0] flex items-center justify-center text-[#121212] shrink-0">
                      <MousePointer2 className="w-4 h-4" />
                    </div>
                    <span>Drawing Tools</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#121212]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileSheetOpen(false);
                    openMobileSheet('STATS');
                  }}
                  className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-white px-3.5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider text-[#121212] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#F0F0F0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#F0F0F0] flex items-center justify-center text-[#121212] shrink-0">
                      <Activity className="w-4 h-4" />
                    </div>
                    <span>Session Stats</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#121212]" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileSheetOpen(false);
                    openMobileSheet('HISTORY');
                  }}
                  className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-white px-3.5 py-2.5 text-left text-xs font-extrabold uppercase tracking-wider text-[#121212] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#F0F0F0] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                  <span className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#F0F0F0] flex items-center justify-center text-[#121212] shrink-0">
                      <History className="w-4 h-4" />
                    </div>
                    <span>Trade History</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#121212]" />
                </button>

                {appMode === 'replay' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSheetOpen(false);
                      handleOpenDashboard();
                    }}
                    className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-[#F0EEFF] px-3.5 py-2.5 text-left text-xs font-black uppercase tracking-wider text-[#6366F1] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#E4DEFF] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                  >
                    <span className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#6366F1] flex items-center justify-center text-white shrink-0">
                        <ExternalLink className="w-4 h-4" />
                      </div>
                      <span>Open Dashboard</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#6366F1]" />
                  </button>
                )}

                {appMode === 'replay' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSheetOpen(false);
                      handleExitReplay();
                    }}
                    className="w-full flex items-center justify-between rounded-lg border-2 border-[#121212] bg-[#FDECEC] px-3.5 py-2.5 text-left text-xs font-black uppercase tracking-wider text-[#DC2626] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#FBD5D5] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                  >
                    <span className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md border-2 border-[#121212] bg-[#DC2626] flex items-center justify-center text-white shrink-0">
                        <X className="w-4 h-4" strokeWidth={3} />
                      </div>
                      <span>Exit Replay</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#DC2626]" />
                  </button>
                )}
              </div>
            )}

            {mobileSheetKind === 'ORDER' && (
              <OrderPanel
                ref={mobileOrderPanelRef}
                symbol={symbol}
                candles={candles}
                currentPrice={currentPrice}
                balance={balance}
                riskPercent={riskPercent}
                onRiskPercentChange={setRiskPercent}
                activeTrade={activeTrade}
                pendingOrders={pendingOrders}
                onCancelPendingOrder={handleCancelPendingOrder}
                onEditPendingOrder={handleEditPendingOrder}
                onOpenTrade={handleOpenTrade}
                onPlaceOrder={handlePlaceOrder}
                onCloseTrade={handleManualClose}
                selectedSideOverride={tradeSide}
                onSideChange={setTradeSide}
                intrabarWarning={intrabarWarning}
                isSubmitting={isSubmittingTrade}
                appMode={appMode}
                onActivateReplay={handleActivateBarReplay}
                onPlannedTradeChange={setPlannedTrade}
                onPickChartEntry={handlePickChartEntry}
                onVisualOrderSubmit={handleSubmitVisualOrder}
                controlledEntryPrice={controlledEntryPrice}
                controlledSlPrice={controlledSlPrice}
                controlledTpPrice={controlledTpPrice}
                lockRR={lockRR}
                onToggleLockRR={() => setLockRR(!lockRR)}
              />
            )}

            {mobileSheetKind === 'TOOLS' && (
              <div className="space-y-4 pb-2">
                {/* Pointer / Navigasi */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#717182] mb-1.5 flex items-center gap-1.5">
                    <MousePointer2 className="w-3.5 h-3.5" />
                    <span>Pointer & Navigasi</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setActiveTool('cursor'); setMobileSheetOpen(false); }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer ${
                        activeTool === 'cursor'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <div className="w-7 h-7 rounded border border-[#121212] bg-[#F0F0F0] flex items-center justify-center shrink-0">
                        <MousePointer2 className="w-4 h-4 text-[#121212]" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider">Cursor / Pan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTool('crosshair'); setMobileSheetOpen(false); }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer ${
                        activeTool === 'crosshair'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <div className="w-7 h-7 rounded border border-[#121212] bg-[#F0F0F0] flex items-center justify-center shrink-0">
                        <Crosshair className="w-4 h-4 text-[#121212]" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider">Crosshair</span>
                    </button>
                  </div>
                </div>

                {/* Garis / Lines */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#717182] mb-1.5 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Garis (Lines)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setActiveTool('trendline'); setMobileSheetOpen(false); }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer text-center min-h-[64px] ${
                        activeTool === 'trendline'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 mb-1 text-[#121212]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Trendline</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTool('hline'); setMobileSheetOpen(false); }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer text-center min-h-[64px] ${
                        activeTool === 'hline'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <Minus className="w-4 h-4 mb-1 text-[#121212]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Horizontal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTool('vline'); setMobileSheetOpen(false); }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer text-center min-h-[64px] ${
                        activeTool === 'vline'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <SplitSquareVertical className="w-4 h-4 mb-1 text-[#121212]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Vertical</span>
                    </button>
                  </div>
                </div>

                {/* Geometri & Fibonacci */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#717182] mb-1.5 flex items-center gap-1.5">
                    <Square className="w-3.5 h-3.5" />
                    <span>Geometri & Fibonacci</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setActiveTool('rect'); setMobileSheetOpen(false); }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer ${
                        activeTool === 'rect'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <div className="w-7 h-7 rounded border border-[#121212] bg-[#F0F0F0] flex items-center justify-center shrink-0">
                        <Square className="w-4 h-4 text-[#121212]" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider">Rectangle (Zone)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTool('fibonacci'); setMobileSheetOpen(false); }}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer ${
                        activeTool === 'fibonacci'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <div className="w-7 h-7 rounded border border-[#121212] bg-[#F0F0F0] flex items-center justify-center shrink-0">
                        <Binary className="w-4 h-4 text-[#121212]" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider">Fibonacci</span>
                    </button>
                  </div>
                </div>

                {/* Analisis / Positions & Measurement */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#717182] mb-1.5 flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5" />
                    <span>Analisis & Posisi</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setActiveTool('measure'); setMobileSheetOpen(false); }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer text-center min-h-[64px] ${
                        activeTool === 'measure'
                          ? 'bg-[#EBF2FF] text-[#1040C0] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#121212] hover:bg-[#FFFDEB] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <Ruler className="w-4 h-4 mb-1 text-[#121212]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Ruler</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTool('long_position'); setMobileSheetOpen(false); }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer text-center min-h-[64px] ${
                        activeTool === 'long_position'
                          ? 'bg-[#E7F9F0] text-[#059669] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#059669] hover:bg-[#F0FDF4] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4 mb-1 stroke-[2.5]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Long Pos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTool('short_position'); setMobileSheetOpen(false); }}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-lg border-2 border-[#121212] transition-all cursor-pointer text-center min-h-[64px] ${
                        activeTool === 'short_position'
                          ? 'bg-[#FDECEC] text-[#DC2626] shadow-[2px_2px_0px_0px_#121212]'
                          : 'bg-white text-[#DC2626] hover:bg-[#FEF2F2] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
                      }`}
                    >
                      <ArrowDownRight className="w-4 h-4 mb-1 stroke-[2.5]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Short Pos</span>
                    </button>
                  </div>
                </div>

                {/* Utilities / Aksi */}
                <div className="pt-2 border-t-2 border-[#121212] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLockRR(!lockRR)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border-2 border-[#121212] text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                      lockRR
                        ? 'bg-[#FEF3C7] text-[#D97706] shadow-[2px_2px_0px_0px_#121212]'
                        : 'bg-white text-[#121212] hover:bg-[#F0F0F0] shadow-[2px_2px_0px_0px_#121212]'
                    }`}
                  >
                    {lockRR ? <Lock className="w-3.5 h-3.5 stroke-[2.5]" /> : <Unlock className="w-3.5 h-3.5 stroke-[2.5]" />}
                    <span>Lock R:R {lockRR ? 'ON' : 'OFF'}</span>
                  </button>

                  {selectedDrawingId && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteSelectedDrawing();
                        setMobileSheetOpen(false);
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 border-[#DC2626] bg-[#FDECEC] text-[#DC2626] text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Hapus</span>
                    </button>
                  )}

                  {drawings.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteAllDrawings();
                        setMobileSheetOpen(false);
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border-2 border-[#121212] bg-white text-[#DC2626] hover:bg-red-50 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                    >
                      <Eraser className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Hapus Semua</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {mobileSheetKind === 'STATS' && <BacktestStats stats={stats} />}

            {mobileSheetKind === 'HISTORY' && <TradeHistory trades={tradeHistory} />}

            {mobileSheetKind === 'AI' && (
              <AiReplayCopilot
                symbol={symbol}
                timeframe={timeframe}
                currentPrice={currentPrice}
                candles={candles}
                balance={balance}
                recentTrades={tradeHistory.slice(-5)}
                isAutoPilotActive={isAutoPilotActive}
                onToggleAutoPilot={(active) => {
                  setIsPlaying(false);
                  setIsAutoPilotActive(active);
                  if (active && appMode !== 'replay') {
                    setAppMode('replay');
                  }
                }}
                autoPilotSpeed={autoPilotSpeed}
                onChangeAutoPilotSpeed={setAutoPilotSpeed}
                autoPilotStatusLog={autoPilotStatusLog}
                onClose={() => setMobileSheetOpen(false)}
                onApplySignal={(sig: AiCopilotSignal) => {
                  if (sig.action === 'BUY') {
                    setTradeSide('LONG');
                  } else if (sig.action === 'SELL') {
                    setTradeSide('SHORT');
                  }
                  if (sig.entryPrice != null && sig.entryPrice > 0) setControlledEntryPrice(sig.entryPrice);
                  if (sig.slPrice != null && sig.slPrice > 0) setControlledSlPrice(sig.slPrice);
                  if (sig.tpPrice != null && sig.tpPrice > 0) setControlledTpPrice(sig.tpPrice);
                  if (sig.riskPercent != null && sig.riskPercent > 0) setRiskPercent(sig.riskPercent);
                  setMobileSheetOpen(false);
                  showToast({
                    kind: 'INFO',
                    title: '⚡ SINYAL AI DITERAPKAN',
                    message: `${sig.action} ${symbol} @ ${sig.entryPrice ?? '-'} (SL ${sig.slPrice ?? '-'} / TP ${sig.tpPrice ?? '-'})`,
                  });
                }}
                onExecuteMarket={({ side, slPrice, tpPrice, riskPercent: rPct }) => {
                  setTradeSide(side);
                  const activeRisk = (rPct != null && rPct > 0) ? rPct : riskPercent;
                  if (rPct != null && rPct > 0) setRiskPercent(rPct);
                  const entryP = currentPrice;
                  const slP = slPrice ?? 0;
                  const tpP = tpPrice ?? 0;
                  const riskAmount = (balance * activeRisk) / 100;
                  const volume = slP > 0 ? calculatePositionSize(balance, activeRisk, entryP, slP, getSymbolContractSize(symbol)) : 1.0;
                  setMobileSheetOpen(false);
                  handleOpenTrade({
                    side,
                    entryPrice: entryP,
                    slPrice: slP,
                    tpPrice: tpP,
                    volume: volume > 0 ? volume : 1.0,
                    riskAmount,
                    orderType: side === 'LONG' ? 'MARKET_BUY' : 'MARKET_SELL',
                    status: 'OPEN',
                  });
                }}
                onPlacePending={({ side, orderType, price, slPrice, tpPrice, riskPercent: rPct }) => {
                  setTradeSide(side);
                  const activeRisk = (rPct != null && rPct > 0) ? rPct : riskPercent;
                  if (rPct != null && rPct > 0) setRiskPercent(rPct);
                  const slP = slPrice ?? 0;
                  const tpP = tpPrice ?? 0;
                  const riskAmount = (balance * activeRisk) / 100;
                  const volume = slP > 0 ? calculatePositionSize(balance, activeRisk, price, slP, getSymbolContractSize(symbol)) : 1.0;
                  setMobileSheetOpen(false);
                  handlePlaceOrder({
                    orderType: orderType as OrderExecutionType,
                    entryPrice: price,
                    slPrice: slP,
                    tpPrice: tpP,
                    side,
                    volume: volume > 0 ? volume : 1.0,
                    riskAmount,
                  });
                }}
              />
            )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Jump dialog reused */}
      <JumpToDateDialog
        isOpen={isJumpDialogOpen}
        onClose={() => setIsJumpDialogOpen(false)}
        onJump={(targetDate) => {
          setAppMode('replay');
          initReplaySession(targetDate, timeframe);
        }}
        onRandomStart={handleRandomStart}
        currentReplayTime={replayTime || new Date()}
      />
    </div>
  );

  // ── DESKTOP WORKSPACE ──
  // Adapted from the mobile terminal: same components, but side-by-side.
  // Mobile is the source of truth; desktop reuses it on a wider canvas.
  const desktopWorkspace = (
    <div className="hidden md:flex h-full w-full overflow-hidden bg-slate-900 text-slate-100">
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative bg-slate-900">
        <ReplayControls
          appMode={appMode}
          isPlaying={isPlaying}
          onPlayToggle={() => setIsPlaying((prev) => !prev)}
          onStepForward={stepForward}
          onStepBack={stepBack}
          onReset={replayReset ?? (() => {})}
          speed={speed}
          onSpeedChange={setSpeed}
          timeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          symbol={symbol}
          onSymbolChange={handleSymbolChange}
          availableSymbols={availableSymbols}
          replayTime={replayTime}
          candleCount={candles.length}
          followReplay={followReplay}
          onToggleFollowReplay={() => setFollowReplay((prev) => !prev)}
          onJumpToCurrent={handleJumpToCurrent}
          onOpenJumpDialog={() => setIsJumpDialogOpen(true)}
          onRandomStart={handleRandomStart}
          onActivateBarReplay={handleActivateBarReplay}
          onExitReplay={handleExitReplay}
          onOpenDashboard={handleOpenDashboard}
          isSyncingDashboard={isSyncingDashboard}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          isOrderPanelOpen={isOrderPanelOpen}
          onToggleOrderPanel={() => setIsOrderPanelOpen(!isOrderPanelOpen)}
          isAiCopilotOpen={isAiCopilotOpen}
          onToggleAiCopilot={() => setIsAiCopilotOpen((prev) => !prev)}
          loading={loading}
          selectionTime={selectionTime}
          onBack={handleSmartBack}
        />

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-rose-700 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (appMode === 'replay' && replayStartTime) {
                  initReplaySession(replayStartTime, timeframe, symbol);
                } else {
                  loadAnalysisCandles(timeframe, symbol);
                }
              }}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-white border-2 border-[#121212] text-[#121212] rounded shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none shrink-0 cursor-pointer"
            >
              Coba lagi
            </button>
          </div>
        )}

        {appMode === 'selecting' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-center gap-2 shrink-0 animate-pulse">
            <Video className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Chart Replay:</strong> Klik candle manapun untuk memulai replay. Candle setelahnya disembunyikan.
            </span>
          </div>
        )}

        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <DrawingToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onDeleteSelected={handleDeleteSelectedDrawing}
            onDeleteAll={handleDeleteAllDrawings}
            hasSelectedDrawing={Boolean(selectedDrawingId)}
            hasDrawings={drawings.length > 0}
            lockRR={lockRR}
            onToggleLockRR={() => setLockRR(!lockRR)}
            isAiCopilotOpen={isAiCopilotOpen}
            onToggleAiCopilot={() => setIsAiCopilotOpen((prev) => !prev)}
          />

          <div className="relative flex-1 min-w-0 h-full overflow-hidden touch-none overscroll-none select-none">
            
            <CandlestickChart
              candles={candles}
              timeframe={timeframe}
              symbol={symbol}
              isLoading={loading}
              error={error}
              appMode={appMode}
              activeTrade={
                activeTrade
                  ? {
                      side: activeTrade.side,
                      entryPrice: activeTrade.entryPrice,
                      slPrice: activeTrade.slPrice,
                      tpPrice: activeTrade.tpPrice,
                      volume: activeTrade.volume,
                    }
                  : null
              }
              indicators={indicators}
              onIndicatorsChange={setIndicators}
              activeTool={activeTool}
              onToolChange={setActiveTool}
              drawings={drawings}
              onDrawingsChange={handleDrawingsChange}
              selectedDrawingId={selectedDrawingId}
              onSelectDrawing={setSelectedDrawingId}
              onReplaySelectionClick={handleConfirmReplayStart}
              onSelectionTimeChange={setSelectionTime}
              onLoadOlderCandles={handleLoadOlderCandles}
              onLoadNewerCandles={handleLoadNewerCandles}
              followReplay={followReplay}
              onDisableFollowReplay={() => setFollowReplay(false)}
              lockRR={lockRR}
              isFullscreen={isFullscreen}
              pendingOrders={pendingOrders}
              onCancelPendingOrder={handleCancelPendingOrder}
              onEditPendingOrder={handleEditPendingOrder}
              onCloseActiveTrade={handleManualClose}
              plannedOrder={plannedTrade}
              onPlannedOrderChange={handlePlannedOrderChange}
              onExecutePlannedTrade={handleExecutePlannedTrade}
              isVisualOrderActive={isVisualOrderActive}
              onConfirmVisualOrder={handleConfirmVisualOrder}
              onCancelVisualOrder={handleCancelVisualOrder}
              isTimeframeLoading={isTimeframeLoading}
              balance={balance}
              equity={balance + liveFloatingPnl}
              floatingPnL={liveFloatingPnl}
              floatingR={liveFloatingR}
              hasOpenPositions={Boolean(activeTrade && activeTrade.status === 'OPEN')}
            />

            {/* ── Floating Draggable AI Replay Copilot Overlay ── */}
            <AnimatePresence>
              {isAiCopilotOpen && (
                <motion.div
                  drag
                  dragMomentum={false}
                  dragConstraints={{ left: -600, right: 50, top: 0, bottom: 450 }}
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="hidden sm:block absolute top-14 right-4 z-30 max-h-[calc(100vh-140px)] overflow-y-auto pointer-events-auto"
                >
                  <AiReplayCopilot
                    symbol={symbol}
                    timeframe={timeframe}
                    currentPrice={currentPrice}
                    candles={candles}
                    balance={balance}
                    recentTrades={tradeHistory.slice(-5)}
                    isAutoPilotActive={isAutoPilotActive}
                    onToggleAutoPilot={(active) => {
                      setIsPlaying(false);
                      setIsAutoPilotActive(active);
                      if (active && appMode !== 'replay') {
                        setAppMode('replay');
                      }
                    }}
                    autoPilotSpeed={autoPilotSpeed}
                    onChangeAutoPilotSpeed={setAutoPilotSpeed}
                    autoPilotStatusLog={autoPilotStatusLog}
                    onClose={() => setIsAiCopilotOpen(false)}
                    onApplySignal={(sig: AiCopilotSignal) => {
                      if (sig.action === 'BUY') {
                        setTradeSide('LONG');
                      } else if (sig.action === 'SELL') {
                        setTradeSide('SHORT');
                      }
                      if (sig.entryPrice != null && sig.entryPrice > 0) setControlledEntryPrice(sig.entryPrice);
                      if (sig.slPrice != null && sig.slPrice > 0) setControlledSlPrice(sig.slPrice);
                      if (sig.tpPrice != null && sig.tpPrice > 0) setControlledTpPrice(sig.tpPrice);
                      if (sig.riskPercent != null && sig.riskPercent > 0) setRiskPercent(sig.riskPercent);
                      showToast({
                        kind: 'INFO',
                        title: '⚡ SINYAL AI DITERAPKAN',
                        message: `${sig.action} ${symbol} @ ${sig.entryPrice ?? '-'} (SL ${sig.slPrice ?? '-'} / TP ${sig.tpPrice ?? '-'})`,
                      });
                    }}
                    onExecuteMarket={({ side, slPrice, tpPrice, riskPercent: rPct }) => {
                      setTradeSide(side);
                      const activeRisk = (rPct != null && rPct > 0) ? rPct : riskPercent;
                      if (rPct != null && rPct > 0) setRiskPercent(rPct);
                      const entryP = currentPrice;
                      const slP = slPrice ?? 0;
                      const tpP = tpPrice ?? 0;
                      const riskAmount = (balance * activeRisk) / 100;
                      const volume = slP > 0 ? calculatePositionSize(balance, activeRisk, entryP, slP, getSymbolContractSize(symbol)) : 1.0;
                      handleOpenTrade({
                        side,
                        entryPrice: entryP,
                        slPrice: slP,
                        tpPrice: tpP,
                        volume: volume > 0 ? volume : 1.0,
                        riskAmount,
                        orderType: side === 'LONG' ? 'MARKET_BUY' : 'MARKET_SELL',
                        status: 'OPEN',
                      });
                    }}
                    onPlacePending={({ side, orderType, price, slPrice, tpPrice, riskPercent: rPct }) => {
                      setTradeSide(side);
                      const activeRisk = (rPct != null && rPct > 0) ? rPct : riskPercent;
                      if (rPct != null && rPct > 0) setRiskPercent(rPct);
                      const slP = slPrice ?? 0;
                      const tpP = tpPrice ?? 0;
                      const riskAmount = (balance * activeRisk) / 100;
                      const volume = slP > 0 ? calculatePositionSize(balance, activeRisk, price, slP, getSymbolContractSize(symbol)) : 1.0;
                      handlePlaceOrder({
                        orderType: orderType as OrderExecutionType,
                        entryPrice: price,
                        slPrice: slP,
                        tpPrice: tpP,
                        side,
                        volume: volume > 0 ? volume : 1.0,
                        riskAmount,
                      });
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <ReplayTimeline
          dateFrom={timelineBounds.dateFrom}
          dateTo={timelineBounds.dateTo}
          currentReplayTime={replayTime || timelineBounds.dateTo}
          onSeek={(targetDate) => {
            if (appMode === 'replay') {
              initReplaySession(targetDate, timeframe);
            } else {
              setIsJumpDialogOpen(false);
            }
          }}
          disabled={loading}
        />

        {appMode === 'replay' && (
          <div className="bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] overflow-hidden shrink-0 text-[#121212]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#F0F0F0] border-b-2 border-[#121212] text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBottomDrawerTab(bottomDrawerTab === 'STATS' ? 'NONE' : 'STATS')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase tracking-wider border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer ${
                    bottomDrawerTab === 'STATS'
                      ? 'bg-[#1040C0] text-white'
                      : 'bg-white text-[#121212] hover:bg-[#FFFDEB]'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Statistik Sesi</span>
                  <span className={`font-mono text-[11px] font-black px-1.5 py-0.5 border ${
                    bottomDrawerTab === 'STATS'
                      ? 'bg-white/20 text-white border-white/40'
                      : 'bg-[#EBF2FF] text-[#1040C0] border-[#121212]'
                  }`}>
                    ${stats.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} • {stats.winRate.toFixed(0)}% WR
                  </span>
                </button>

                <button
                  onClick={() => setBottomDrawerTab(bottomDrawerTab === 'HISTORY' ? 'NONE' : 'HISTORY')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase tracking-wider border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer ${
                    bottomDrawerTab === 'HISTORY'
                      ? 'bg-[#1040C0] text-white'
                      : 'bg-white text-[#121212] hover:bg-[#FFFDEB]'
                  }`}
                >
                  <History className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Riwayat Trade ({tradeHistory.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenDashboard}
                  disabled={isSyncingDashboard}
                  title="Buka sesi ini di Dashboard utama"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-black uppercase bg-[#EBF2FF] hover:bg-[#D6E4FF] text-[#1040C0] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-50 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isSyncingDashboard ? 'Sinkronisasi...' : 'Buka di Dashboard'}</span>
                </button>

                <button
                  onClick={() => setBottomDrawerTab(bottomDrawerTab === 'NONE' ? 'STATS' : 'NONE')}
                  className="p-1 text-[#121212] hover:bg-white border border-transparent hover:border-[#121212] transition-colors cursor-pointer"
                  aria-label="Toggle bottom drawer"
                >
                  {bottomDrawerTab === 'NONE' ? <ChevronUp className="w-4 h-4 stroke-[2.5]" /> : <ChevronDown className="w-4 h-4 stroke-[2.5]" />}
                </button>
              </div>
            </div>

            {bottomDrawerTab === 'STATS' && (
              <div className="p-3 max-h-48 overflow-y-auto">
                <BacktestStats stats={stats} />
              </div>
            )}

            {bottomDrawerTab === 'HISTORY' && (
              <div className="p-3 max-h-48 overflow-y-auto">
                <TradeHistory trades={tradeHistory} />
              </div>
            )}
          </div>
        )}

        <JumpToDateDialog
          isOpen={isJumpDialogOpen}
          onClose={() => setIsJumpDialogOpen(false)}
          onJump={(targetDate) => {
            setAppMode('replay');
            initReplaySession(targetDate, timeframe);
          }}
          onRandomStart={handleRandomStart}
          currentReplayTime={replayTime || new Date()}
        />
      </main>

      <AnimatePresence>
        {isOrderPanelOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex-shrink-0 border-l-2 border-[#121212] bg-[#F4F4F0] flex flex-col h-full overflow-hidden z-20"
          >
            <div className="w-72 lg:w-80 h-full flex flex-col overflow-y-auto">
              <OrderPanel
                ref={orderPanelRef}
                symbol={symbol}
                candles={candles}
                currentPrice={currentPrice}
                balance={balance}
                riskPercent={riskPercent}
                onRiskPercentChange={setRiskPercent}
                activeTrade={activeTrade}
                pendingOrders={pendingOrders}
                onCancelPendingOrder={handleCancelPendingOrder}
                onEditPendingOrder={handleEditPendingOrder}
                onOpenTrade={handleOpenTrade}
                onPlaceOrder={handlePlaceOrder}
                onCloseTrade={handleManualClose}
                selectedSideOverride={tradeSide}
                onSideChange={setTradeSide}
                intrabarWarning={intrabarWarning}
                isSubmitting={isSubmittingTrade}
                appMode={appMode}
                onActivateReplay={handleActivateBarReplay}
                onPlannedTradeChange={setPlannedTrade}
                onPickChartEntry={handlePickChartEntry}
                onVisualOrderSubmit={handleSubmitVisualOrder}
                controlledEntryPrice={controlledEntryPrice}
                controlledSlPrice={controlledSlPrice}
                controlledTpPrice={controlledTpPrice}
                lockRR={lockRR}
                onToggleLockRR={() => setLockRR(!lockRR)}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div
      ref={workspaceRef}
      className="fixed inset-0 w-full h-[100dvh] max-h-[100dvh] overflow-hidden overscroll-none select-none flex flex-col bg-white"
    >
      {mobileTerminal}
      {desktopWorkspace}

      {/* Quick Trade Floating Actions - Rendered once at root to prevent multi-mount ref hijacking */}
      {renderQuickTradePill()}

      {/* ── Konfirmasi Keluar Replay Dialog ── */}
      <AnimatePresence>
        {showExitConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-6 relative select-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="exit-confirm-title"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded border-2 border-[#121212] bg-[#FEF08A] flex items-center justify-center text-[#854D0E] shrink-0 shadow-[2px_2px_0px_0px_#121212]">
                    <AlertTriangle className="w-4 h-4 text-[#854D0E]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#717182] block">
                      Konfirmasi Keluar
                    </span>
                    <h3 id="exit-confirm-title" className="text-base font-black uppercase tracking-tight text-[#121212]">
                      Keluar dari Sesi Replay?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExitConfirmModal(false)}
                  className="p-1 text-[#717182] hover:text-[#121212] hover:bg-[#F0F0F0] border border-transparent hover:border-[#121212] transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#333333] font-medium leading-relaxed mb-6">
                Progres sesi tersimpan otomatis. Anda dapat melanjutkannya kembali kapan saja dari menu sesi.
              </p>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowExitConfirmModal(false)}
                  className="w-full py-2.5 px-4 bg-[#1040C0] hover:bg-[#0D3399] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <span>Lanjut Trading</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowExitConfirmModal(false);
                    executeSmartBack();
                  }}
                  className="w-full py-2.5 px-4 bg-white hover:bg-[#F0F0F0] text-[#DC2626] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Keluar</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Mode Analisis Onboarding Guidance Modal ── */}
      <AnimatePresence>
        {showAnalysisGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-6 relative select-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="analysis-guide-title"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded border-2 border-[#121212] bg-[#EAF2FF] flex items-center justify-center text-[#1040C0] shrink-0 shadow-[2px_2px_0px_0px_#121212]">
                    <Video className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#717182] block">
                      Panduan Eksekusi
                    </span>
                    <h3 id="analysis-guide-title" className="text-base font-black uppercase tracking-tight text-[#121212]">
                      Mode Analisis (Data Historis)
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAnalysisGuideModal(false)}
                  className="p-1 text-[#717182] hover:text-[#121212] hover:bg-[#F0F0F0] border border-transparent hover:border-[#121212] transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#333333] font-medium leading-relaxed mb-6">
                Ini adalah data historis bursa. Untuk mulai mengeksekusi order, aktifkan sesi replay terlebih dahulu.
              </p>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleStartReplayAtCurrentBar}
                  className="w-full py-2.5 px-4 bg-[#1040C0] hover:bg-[#0D3399] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Mulai Replay di Bar Aktif</span>
                </button>

                <button
                  type="button"
                  onClick={handlePickReplayPoint}
                  className="w-full py-2.5 px-4 bg-[#F4F4F0] hover:bg-[#EAEAE6] text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Crosshair className="w-4 h-4" />
                  <span>Pilih Titik Replay di Chart</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAnalysisGuideModal(false)}
                  className="w-full py-2 px-4 text-center text-xs font-bold text-[#717182] hover:text-[#121212] transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Sesi Replay Persisten Resume Prompt Modal ── */}
      <AnimatePresence>
        {resumePromptSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-6 relative select-none"
              role="dialog"
              aria-modal="true"
              aria-labelledby="resume-session-title"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded border-2 border-[#121212] bg-[#FEF08A] flex items-center justify-center text-[#854D0E] shrink-0 shadow-[2px_2px_0px_0px_#121212]">
                    <Zap className="w-4 h-4 fill-[#854D0E]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#717182] block">
                      Pemulihan Sesi
                    </span>
                    <h3 id="resume-session-title" className="text-base font-black uppercase tracking-tight text-[#121212]">
                      Sesi Replay Ditemukan
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setResumePromptSession(null)}
                  className="p-1 text-[#717182] hover:text-[#121212] hover:bg-[#F0F0F0] border border-transparent hover:border-[#121212] transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#333333] font-medium leading-relaxed mb-6">
                Ditemukan sesi replay yang belum selesai ({resumePromptSession.symbol} · Saldo ${resumePromptSession.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Apakah Anda ingin melanjutkan sesi ini?
              </p>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const targetId = resumePromptSession.sessionId;
                    setResumePromptSession(null);
                    resumeSession(targetId);
                  }}
                  className="w-full py-2.5 px-4 bg-[#059669] hover:bg-[#047857] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Lanjutkan Sesi</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem(SESSION_STORAGE_KEY);
                    } catch (_) {}
                    setResumePromptSession(null);
                  }}
                  className="w-full py-2.5 px-4 bg-white hover:bg-[#F0F0F0] text-[#DC2626] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Mulai Sesi Baru</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast notifications container */}
      <div className="pointer-events-none fixed top-14 right-4 max-w-[calc(100vw-32px)] z-[80] flex flex-col items-end gap-2">
        <AnimatePresence>
          {systemBanner && (
            <motion.div
              key={systemBanner.id}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-[340px] max-w-[calc(100vw-32px)] bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] p-3 flex items-start gap-3 select-none"
            >
              <div className="w-7 h-7 shrink-0 bg-[#F0F0F0] border-2 border-[#121212] flex items-center justify-center shadow-[1px_1px_0px_0px_#121212]">
                <Info className="w-4 h-4 text-[#121212] stroke-[2.5]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono font-black tracking-wider uppercase text-[#121212]">
                    {systemBanner.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSystemBanner(null)}
                    className="text-[#717182] hover:text-[#121212] p-0.5 transition-colors cursor-pointer"
                    title="Tutup notifikasi"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
                <p className="mt-1 text-xs font-mono text-[#525252] leading-snug break-words">
                  {systemBanner.message}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <TradeNotificationToast toast={activeToast} onDismiss={dismissToast} />
      </div>
    </div>
  );
}
