import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { CandlestickChart, ChartCandle, ChartIndicators, DrawingItem, PlannedOrderPreview } from '../components/backtest/CandlestickChart';
import { DrawingToolbar, DrawingTool } from '../components/backtest/DrawingToolbar';
import { ReplayControls, ReplaySpeed, ChartTimeframe, AppMode } from '../components/backtest/ReplayControls';
import { ReplayTimeline } from '../components/backtest/ReplayTimeline';
import { JumpToDateDialog } from '../components/backtest/JumpToDateDialog';
import { OrderPanel, type OrderPanelHandle } from '../components/backtest/OrderPanel';
import { BacktestStats } from '../components/backtest/BacktestStats';
import { TradeHistory } from '../components/backtest/TradeHistory';
import { TradeNotificationToast, type TradeToastItem } from '../components/backtest/TradeNotificationToast';
import {
  calculatePositionSize,
  evaluateCandleHit,
  calculateBacktestStats,
  calculatePnL,
  calculateRR,
  calculateTPFromRR,
  getDefaultSlDistance,
  getSymbolContractSize,
  BacktestTradeRecord,
  TradeSide,
  BacktestStats as IBacktestStats,
} from '../../../server/src/services/backtestEngine';

const API_BASE = '/api/backtest';

export default function Backtest() {
  // ── Mode State Machine ──
  // 'analysis' = default, full history visible, no replay cutoff
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
  const [controlledSlPrice, setControlledSlPrice] = useState<number | null>(null);
  const [controlledTpPrice, setControlledTpPrice] = useState<number | null>(null);
  const [isSyncingDashboard, setIsSyncingDashboard] = useState<boolean>(false);
  const [symbol, setSymbol] = useState<string>('XAUUSD');
  const [availableSymbols, setAvailableSymbols] = useState<Array<{ symbol: string; provider: string; candleCount: number }>>([]);
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

  const handlePlannedOrderChange = useCallback((newPlanned: { entryPrice: number; slPrice: number; tpPrice: number }) => {
    setControlledSlPrice(newPlanned.slPrice);
    setControlledTpPrice(newPlanned.tpPrice);

    setPlannedTrade((prev) => {
      if (!prev) return prev;

      const rr = calculateRR(
        prev.side === 'BUY' ? 'LONG' : 'SHORT',
        newPlanned.entryPrice,
        newPlanned.slPrice,
        newPlanned.tpPrice
      );
      const riskAmount = (balance * riskPercent) / 100;
      const lotSize = calculatePositionSize(
        balance,
        riskPercent,
        newPlanned.entryPrice,
        newPlanned.slPrice,
        getSymbolContractSize(symbol)
      );

      return {
        ...prev,
        entryPrice: newPlanned.entryPrice,
        slPrice: newPlanned.slPrice,
        tpPrice: newPlanned.tpPrice,
        lotSize,
        riskAmount,
        targetProfit: rr.isValid ? riskAmount * rr.rr : 0,
        rrRatio: rr.isValid ? rr.rr : 0,
      };
    });
  }, [balance, riskPercent, symbol]);

  const buildPlannedTrade = useCallback((side: TradeSide, entryPrice: number): PlannedOrderPreview | null => {
    if (entryPrice <= 0) return null;

    const defaultSlDistance = getDefaultSlDistance(symbol);
    const slPrice = side === 'LONG'
      ? Math.round((entryPrice - defaultSlDistance) * 100) / 100
      : Math.round((entryPrice + defaultSlDistance) * 100) / 100;
    const tpPrice = calculateTPFromRR(side, entryPrice, slPrice, 2.0);
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
  }, [balance, riskPercent, symbol]);

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
  const [isVisualOrderActive, setIsVisualOrderActive] = useState<boolean>(false);
  const [tradeSide, setTradeSide] = useState<TradeSide>('LONG');
  const [bottomDrawerTab, setBottomDrawerTab] = useState<'NONE' | 'STATS' | 'HISTORY'>('NONE');
  const [isJumpDialogOpen, setIsJumpDialogOpen] = useState<boolean>(false);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingOlderRef = useRef<boolean>(false);
  const isFetchingNewerRef = useRef<boolean>(false);
  const orderPanelRef = useRef<OrderPanelHandle | null>(null);
  const mobileOrderPanelRef = useRef<OrderPanelHandle | null>(null);

  // ── 1. Fetch Timeline Bounds & Available Symbols ──
  useEffect(() => {
    fetch(`${API_BASE}/timeline-bounds`)
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) {
          setTimelineBounds({
            dateFrom: new Date(json.data.dateFrom),
            dateTo: new Date(json.data.dateTo),
          });
        }
      })
      .catch(console.error);

    fetch(`${API_BASE}/symbols`)
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) {
          setAvailableSymbols(json.data);
        }
      })
      .catch(console.error);
  }, []);

  // ── 2. Analysis Mode: Load Latest Candles (NO replay cutoff) ──
  const loadAnalysisCandles = useCallback(async (tf: ChartTimeframe = timeframe, sym: string = symbol) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/candles?symbol=${sym}&timeframe=${tf}&provider=DUKASCOPY&limit=1500`
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to fetch candles');
      setCandles(json.data.candles);
      if (json.data.candles.length > 0) {
        setReplayTime(new Date(json.data.candles[json.data.candles.length - 1].time));
      }
    } catch (err: any) {
      console.error('Analysis load error:', err);
      setError(err.message || 'Gagal memuat data historis.');
    } finally {
      setLoading(false);
    }
  }, [timeframe, symbol]);

  // Load analysis candles on mount
  useEffect(() => {
    loadAnalysisCandles('M1', symbol);
  }, []);

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
      const replayParam = appMode === 'replay' && replayStartTime
        ? `&replayTime=${encodeURIComponent(replayStartTime.toISOString())}`
        : '';
      const res = await fetch(
        `${API_BASE}/candles?symbol=${symbol}&timeframe=${timeframe}&provider=DUKASCOPY&beforeTime=${encodeURIComponent(earliestTime)}&limit=1500${replayParam}`
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
  }, [candles, timeframe, symbol, appMode, replayStartTime, timelineBounds.dateFrom]);

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
      const res = await fetch(
        `${API_BASE}/candles?symbol=${symbol}&timeframe=${timeframe}&provider=DUKASCOPY&afterTime=${encodeURIComponent(latestTime)}&limit=500`
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
  }, [candles, timeframe, symbol, appMode, timelineBounds.dateTo]);

  // ── 2d. Timeframe Switch Handler ──
  const handleTimeframeChange = async (newTF: ChartTimeframe) => {
    setTimeframe(newTF);
    if (appMode === 'analysis') {
      loadAnalysisCandles(newTF, symbol);
    } else if (appMode === 'replay') {
      // Keep replay session, trades, and position intact!
      setIsPlaying(false);
      setLoading(true);
      try {
        const currentTargetTime = replayTime || (candles.length > 0 ? new Date(candles[candles.length - 1].time) : replayStartTime);
        if (!currentTargetTime) return;

        // 1. Update session timeframe in DB
        if (sessionId) {
          await fetch(`${API_BASE}/sessions/${sessionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeframe: newTF }),
          }).catch(console.error);
        }

        // 2. Fetch candles for newTF up to currentTargetTime (strict cutoff)
        const resCandles = await fetch(
          `${API_BASE}/candles?symbol=${symbol}&timeframe=${newTF}&provider=DUKASCOPY&replayTime=${encodeURIComponent(currentTargetTime.toISOString())}&limit=2000`
        );
        const candlesJson = await resCandles.json();
        if (candlesJson.ok && candlesJson.data && candlesJson.data.candles) {
          setCandles(candlesJson.data.candles);
        }
      } catch (err: any) {
        console.error('Error switching replay timeframe:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  // ── 2e. Symbol Switch Handler ──
  const handleSymbolChange = (newSymbol: string) => {
    setSymbol(newSymbol);
    if (appMode === 'analysis') {
      loadAnalysisCandles(timeframe, newSymbol);
    } else if (appMode === 'replay' && replayStartTime) {
      initReplaySession(replayStartTime, timeframe, newSymbol);
    }
  };

  // ── 3. Replay Mode: Initialize Session with strict cutoff ──
  const initReplaySession = useCallback(async (startTime: Date, tf: ChartTimeframe = timeframe, sym: string = symbol) => {
    setLoading(true);
    setIsPlaying(false);
    setError(null);
    setFollowReplay(true);
    try {
      const resSession = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Backtest ${sym} ${tf} (${startTime.toISOString().slice(0, 10)})`,
          symbol: sym,
          provider: 'DUKASCOPY',
          timeframe: tf,
          startTime: startTime.toISOString(),
          initialBalance,
          riskPercent,
          drawingsJson: JSON.stringify(drawings),
        }),
      });
      const sessionJson = await resSession.json();
      if (!sessionJson.ok) throw new Error(sessionJson.error || 'Failed to create session');

      const newSession = sessionJson.data;
      setSessionId(newSession.id);
      setBalance(newSession.currentBalance);
      setReplayTime(startTime);
      setReplayStartTime(startTime);
      setTrades([]);
      setIntrabarWarning(null);

      // Fetch windowed candles strictly ending at startTime (Zero Look-Ahead)
      const resCandles = await fetch(
        `${API_BASE}/candles?symbol=${sym}&timeframe=${tf}&provider=DUKASCOPY&replayTime=${encodeURIComponent(startTime.toISOString())}&limit=2000`
      );
      const candlesJson = await resCandles.json();
      if (!candlesJson.ok) throw new Error(candlesJson.error || 'Failed to fetch candles');
      setCandles(candlesJson.data.candles);
    } catch (err: any) {
      console.error('Session initialization error:', err);
      setError(err.message || 'Gagal memuat data pasar historis.');
    } finally {
      setLoading(false);
    }
  }, [initialBalance, riskPercent, timeframe, symbol, drawings]);

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

  // ── 6. Exit Replay → back to Analysis ──
  const handleExitReplay = () => {
    setAppMode('analysis');
    setIsPlaying(false);
    setSessionId(null);
    setTrades([]);
    setIntrabarWarning(null);
    setReplayStartTime(null);
    setSelectionTime(null);
    loadAnalysisCandles(timeframe);
  };

  // ── 7. Debounced Drawing Auto-Save ──
  const handleDrawingsChange = (newDrawings: DrawingItem[]) => {
    setDrawings(newDrawings);
    if (!sessionId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API_BASE}/random-start`);
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

  // ── 9. Sequential Step Forward Engine (Evaluates Active Trade) ──
  const stepForward = useCallback(async () => {
    if (candles.length === 0 || appMode !== 'replay') return;
    const lastCandle = candles[candles.length - 1];
    const lastTime = new Date(lastCandle.time).toISOString();

    try {
      const sessionParam = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
      const res = await fetch(
        `${API_BASE}/next-candle?symbol=${symbol}&timeframe=${timeframe}&provider=DUKASCOPY&afterTime=${encodeURIComponent(lastTime)}${sessionParam}`
      );
      const json = await res.json();
      if (!json.ok || !json.data) {
        setIsPlaying(false);
        return;
      }

      const nextCandle: ChartCandle = json.data;
      const nextTime = new Date(nextCandle.time);

      setCandles((prev) => {
        if (prev.length === 0) return [nextCandle];
        const lastT = new Date(prev[prev.length - 1].time).getTime();
        const nextT = new Date(nextCandle.time).getTime();
        if (nextT === lastT) {
          const updated = [...prev];
          updated[updated.length - 1] = nextCandle;
          return updated;
        }
        if (nextT < lastT) {
          return prev;
        }
        return [...prev, nextCandle];
      });
      setReplayTime(nextTime);

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
            const closeRes = await fetch(`${API_BASE}/sessions/${sessionId}/trades/${curTrade.id}/close`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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

              fetch(`${API_BASE}/sessions/${sessionId}/sync-to-journal`, { method: 'POST' }).catch(console.error);
            }
          } catch (closeErr) {
            console.error('Error closing hit trade:', closeErr);
          }
        }
      }
    } catch (err) {
      console.error('Step forward error:', err);
      setIsPlaying(false);
    }
  }, [candles, timeframe, symbol, sessionId, appMode]);

  // ── 10. Step Back Engine ──
  const stepBack = useCallback(() => {
    if (candles.length <= 1 || appMode !== 'replay') return;
    setCandles((prev) => {
      const next = prev.slice(0, prev.length - 1);
      const newT = new Date(next[next.length - 1].time);
      setReplayTime(newT);
      if (sessionId) {
        fetch(`${API_BASE}/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ replayTime: newT.toISOString() }),
        }).catch(console.error);
      }
      return next;
    });
  }, [candles, appMode, sessionId]);

  // ── 11. Replay Loop ──
  useEffect(() => {
    if (!isPlaying || appMode !== 'replay') return;
    const intervalMs = Math.max(80, 1000 / speed);
    const timer = setInterval(() => { stepForward(); }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, speed, stepForward, appMode]);

  // ── 12. Open Trade Handler (Strict Single Active Trade) ──
  const handleOpenTrade = async (tradeParams: {
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => {
    if (activeTrade) {
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
        const startTime = replayTime || (candles.length > 0 ? new Date(candles[candles.length - 1].time) : new Date());
        const resSession = await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Backtest ${symbol} ${timeframe} (${startTime.toISOString().slice(0, 10)})`,
            symbol,
            provider: 'DUKASCOPY',
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

      const tradeTime = replayTime || (candles.length > 0 ? new Date(candles[candles.length - 1].time) : new Date());

      // Ensure backend session replayTime is strictly synced to tradeTime before placing trade
      await fetch(`${API_BASE}/sessions/${curSessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replayTime: tradeTime.toISOString() }),
      });

      const res = await fetch(`${API_BASE}/sessions/${curSessionId}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tradeParams, entryTime: tradeTime.toISOString() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to open trade');
      setTrades((prev) => [json.data, ...prev.filter((t) => t.id !== json.data.id)]);
      setIntrabarWarning(null);
      showToast({
        kind: 'ENTRY',
        symbol,
        side: tradeParams.side,
        price: tradeParams.entryPrice,
        lotSize: tradeParams.volume,
      });
    } catch (err: any) {
      showToast({
        kind: 'ERROR',
        title: 'ORDER GAGAL',
        message: `Gagal membuka posisi: ${err.message}`,
      });
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  // Quick-trade from mobile bar: delegate to whichever OrderPanel instance is mounted
  const handleQuickTrade = useCallback((side: TradeSide) => {
    const ref = mobileOrderPanelRef.current || orderPanelRef.current;
    if (ref) {
      ref.executeQuick(side);
    }
  }, []);

  // ── 13. Manual Close Individual Trade ──
  const handleManualClose = async (tradeId?: string) => {
    const idToClose = tradeId || activeTrade?.id;
    if (!sessionId || !idToClose || isSubmittingTrade) return;
    setIsSubmittingTrade(true);
    try {
      const currentP = candles[candles.length - 1]?.close || activeTrade?.entryPrice || 0;
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/trades/${idToClose}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        fetch(`${API_BASE}/sessions/${sessionId}/sync-to-journal`, { method: 'POST' }).catch(console.error);
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
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/sync-to-journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const lotSize = calculatePositionSize(balance, riskPercent, entryPrice, slPrice);
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
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (appMode === 'replay') stepForward();
      } else if (e.code === 'ArrowLeft') {
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

  const [isMobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetKind, setMobileSheetKind] = useState<'MENU' | 'ORDER' | 'TOOLS' | 'STATS' | 'HISTORY'>('ORDER');
  const [activeToast, setActiveToast] = useState<TradeToastItem | null>(null);

  const showToast = useCallback((item: Omit<TradeToastItem, 'id'>) => {
    setActiveToast({ ...item, id: Math.random().toString(36).slice(2, 9) });
  }, []);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  const openMobileSheet = (kind: typeof mobileSheetKind) => {
    setMobileSheetKind(kind);
    setMobileSheetOpen(true);
  };

  const closeMobileSheet = () => {
    setMobileSheetOpen(false);
  };

  const handleMobileBack = () => {
    console.log('Executing handleMobileBack...', { isMobileSheetOpen, isVisualOrderActive });

    if (isMobileSheetOpen) {
      closeMobileSheet();
      return;
    }

    if (isVisualOrderActive) {
      setIsVisualOrderActive(false);
      return;
    }

    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
  };

  const handleChartOrderOpen = (side: TradeSide) => {
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
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => {
    if (activeTrade) {
      showToast({
        kind: 'ERROR',
        title: 'POSISI AKTIF',
        message: 'Posisi aktif masih terbuka. Tutup posisi terlebih dahulu sebelum membuka posisi baru.',
      });
      return;
    }

    const rrCalc = calculateRR(tradeParams.side, tradeParams.entryPrice, tradeParams.slPrice, tradeParams.tpPrice);
    const nextPlannedTrade: PlannedOrderPreview = {
      side: tradeParams.side === 'LONG' ? 'BUY' : 'SELL',
      entryPrice: tradeParams.entryPrice,
      slPrice: tradeParams.slPrice,
      tpPrice: tradeParams.tpPrice,
      lotSize: tradeParams.volume,
      riskAmount: tradeParams.riskAmount,
      targetProfit: rrCalc.isValid ? tradeParams.riskAmount * rrCalc.rr : 0,
      rrRatio: rrCalc.isValid ? rrCalc.rr : 0,
    };

    setTradeSide(tradeParams.side);
    setPlannedTrade(nextPlannedTrade);
    setIsVisualOrderActive(true);
    setIsOrderPanelOpen(false);
    setMobileSheetOpen(false);
  }, [activeTrade, showToast]);

  const handleConfirmVisualOrder = useCallback(async () => {
    if (!plannedTrade) return;

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
      slPrice: plannedTrade.slPrice,
      tpPrice: plannedTrade.tpPrice,
      volume: plannedTrade.lotSize,
      riskAmount: plannedTrade.riskAmount,
    });

    setIsVisualOrderActive(false);
    setPlannedTrade(null);
    setControlledSlPrice(null);
    setControlledTpPrice(null);
  }, [activeTrade, handleOpenTrade, plannedTrade, showToast]);

  const handleCancelVisualOrder = useCallback(() => {
    setIsVisualOrderActive(false);
    setPlannedTrade(null);
    setControlledSlPrice(null);
    setControlledTpPrice(null);
  }, []);


  const replayReset = appMode === 'replay' && replayStartTime
    ? () => { void initReplaySession(replayStartTime, timeframe); }
    : undefined;

  // ── MOBILE TERMINAL ──
  // Chart is the hero. Strip = symbol/TF/mode. Context = position info.
  // Actions = primary buy/sell (or replay controls), secondary in a sheet.
  const mobileTerminal = (
    <div className="mobile-terminal block md:hidden w-full h-[100dvh] flex flex-col overflow-hidden bg-slate-50">

      {/* Top strip: compact app-like header for pair / timeframe / mode. */}
      <div className="mobile-terminal-strip flex items-center px-2 py-2 border-b-2 border-[#121212] bg-[#F0F0F0]">
        <div className="flex items-center gap-1.5 w-full overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMobileBack();
            }}
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-white border-2 border-[#121212] text-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-[#FFFDEB] transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5 pointer-events-none stroke-[2.5]" />
          </button>
          
          <span className="mobile-tag mobile-tag-accent shrink-0">{symbol}</span>
          <select
            value={timeframe}
            onChange={(e) => handleTimeframeChange(e.target.value as ChartTimeframe)}
            aria-label="Timeframe"
            className="mobile-tag mobile-select shrink-0"
          >
            {(['M1','M5','M15','M30','H1','H4','D1'] as ChartTimeframe[]).map(tf => (
              <option key={tf} value={tf} className="bg-white text-slate-700">{tf}</option>
            ))}
          </select>
          {appMode === 'analysis' && <span className="mobile-tag mobile-tag-profit shrink-0">ANALYSIS</span>}
          {appMode === 'selecting' && <span className="mobile-tag mobile-tag-warn shrink-0">PICK START</span>}
          {appMode === 'replay' && <span className="mobile-tag mobile-tag-accent shrink-0">REPLAY</span>}
          {appMode === 'replay' && replayTime && (
            <span className="mobile-tag bg-[#F0F0F0] text-[#121212] border-2 border-[#121212] font-mono font-bold shrink-0">{format(replayTime, 'MM-dd HH:mm')}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="mobile-icon-btn shrink-0 w-8 h-8 p-1.5"
            aria-label="Toggle Fullscreen"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
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
      </div>

      {/* Error / hint as a thin strip, not a card. */}
      {error && (
        <div className="mobile-terminal-strip" style={{ background: 'rgba(220,38,38,0.12)', color: '#F87171' }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-semibold truncate">{error}</span>
        </div>
      )}
      {appMode === 'selecting' && (
        <div className="mobile-terminal-strip" style={{ background: 'rgba(240,192,32,0.10)', color: '#F0C020' }}>
          <Video className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-semibold truncate">Klik candle untuk mulai replay.</span>
        </div>
      )}

      {/* Chart: edge-to-edge, the largest element on the viewport. */}
      <div className="mobile-terminal-chart relative w-full h-full overflow-hidden">
        
        <CandlestickChart
          candles={candles}
          timeframe={timeframe}
          symbol={symbol}
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
          plannedOrder={plannedTrade}
          onPlannedOrderChange={handlePlannedOrderChange}
          onExecutePlannedTrade={handleExecutePlannedTrade}
          isVisualOrderActive={isVisualOrderActive}
          onConfirmVisualOrder={handleConfirmVisualOrder}
          onCancelVisualOrder={handleCancelVisualOrder}
        />

        {/* Floating Quick Actions (Mobile) - Centered flex container */}
        <AnimatePresence>
          {appMode !== 'selecting' && !isSubmittingTrade && !activeTrade && (
            <div className="pointer-events-none absolute bottom-5 inset-x-0 z-40 flex justify-center">
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto flex items-center gap-2 p-1.5 bg-white rounded-xl border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212]"
              >
                <button
                  type="button"
                  onClick={() => handleChartOrderOpen('LONG')}
                  className="bg-[#059669] hover:bg-[#047857] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-white font-mono font-black text-xs px-7 py-2.5 rounded-lg border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] transition-all cursor-pointer"
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => handleChartOrderOpen('SHORT')}
                  className="bg-[#DC2626] hover:bg-[#B91C1C] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-white font-mono font-black text-xs px-7 py-2.5 rounded-lg border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] transition-all cursor-pointer"
                >
                  SELL
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Context line: compact price + balance + active trade info. */}
      <div className="mobile-terminal-context">
        <div className="flex items-center gap-1.5 bg-[#FFFDEB] border-2 border-[#121212] px-2 py-0.5 shadow-[1px_1px_0px_0px_#121212] shrink-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-[#B45309]">Price</span>
          <span className="text-xs font-number font-black text-[#121212]">{currentPrice > 0 ? currentPrice.toFixed(2) : '--.--'}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-[#EBF2FF] border-2 border-[#121212] px-2 py-0.5 shadow-[1px_1px_0px_0px_#121212] shrink-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-[#1040C0]">Balance</span>
          <span className="text-xs font-number font-black text-[#1040C0]">${balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        </div>

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

      {/* Primary actions. Sticky bottom, thumb-reachable. */}
      <div className="mobile-terminal-actions">
        {/* Analysis: only drawing tools + fullscreen. No fake trade buttons. */}
        {appMode === 'analysis' && (
          <>
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
            <div className="flex-1" />
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

        {/* Selecting: cancel only. Chart interaction is the action. */}
        {appMode === 'selecting' && (
          <button
            type="button"
            onClick={handleExitReplay}
            className="mobile-action-sell"
            aria-label="Cancel replay selection"
          >
            <X className="w-4 h-4" /> Batal
          </button>
        )}

        {/* Replay: compact playback controls + Buy/Sell */}
        {appMode === 'replay' && (
          <>
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

            <div className="flex-1" />

            <div className="flex items-center gap-1.5 overflow-hidden">
              <button
                type="button"
                onClick={() => handleChartOrderOpen('LONG')}
                disabled={loading || isSubmittingTrade || Boolean(activeTrade)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-mono text-[11px] font-bold px-2 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 min-w-0"
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => handleChartOrderOpen('SHORT')}
                disabled={loading || isSubmittingTrade || Boolean(activeTrade)}
                className="flex-1 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-mono text-[11px] font-bold px-2 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50 min-w-0"
              >
                SELL
              </button>
            </div>

            <button
              type="button"
              onClick={() => openMobileSheet('ORDER')}
              className="mobile-icon-btn shrink-0"
              aria-label="Order settings"
              title="SL / TP / Risk"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
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
                currentPrice={currentPrice}
                balance={balance}
                riskPercent={riskPercent}
                onRiskPercentChange={setRiskPercent}
                activeTrade={activeTrade}
                onOpenTrade={handleOpenTrade}
                onCloseTrade={handleManualClose}
                selectedSideOverride={tradeSide}
                intrabarWarning={intrabarWarning}
                isSubmitting={isSubmittingTrade}
                appMode={appMode}
                onActivateReplay={handleActivateBarReplay}
                onPlannedTradeChange={setPlannedTrade}
                onVisualOrderSubmit={handleSubmitVisualOrder}
                controlledSlPrice={controlledSlPrice}
                controlledTpPrice={controlledTpPrice}
              />
            )}

            {mobileSheetKind === 'TOOLS' && (
              <div className="mobile-tool-row">
                <DrawingToolbar
                  activeTool={activeTool}
                  onToolChange={setActiveTool}
                  onDeleteSelected={handleDeleteSelectedDrawing}
                  onDeleteAll={handleDeleteAllDrawings}
                  hasSelectedDrawing={Boolean(selectedDrawingId)}
                  hasDrawings={drawings.length > 0}
                  lockRR={lockRR}
                  onToggleLockRR={() => setLockRR(!lockRR)}
                />
              </div>
            )}

            {mobileSheetKind === 'STATS' && <BacktestStats stats={stats} />}

            {mobileSheetKind === 'HISTORY' && <TradeHistory trades={tradeHistory} />}
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
          loading={loading}
          selectionTime={selectionTime}
          onBack={() => {
            if (window.history.length > 2) {
              navigate(-1);
            } else {
              navigate('/dashboard');
            }
          }}
        />

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-rose-300 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
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
          />

          <div className="relative flex-1 min-w-0 h-full overflow-hidden">
            
        <CandlestickChart
              candles={candles}
              timeframe={timeframe}
              symbol={symbol}
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
              plannedOrder={plannedTrade}
              onPlannedOrderChange={handlePlannedOrderChange}
              onExecutePlannedTrade={handleExecutePlannedTrade}
              isVisualOrderActive={isVisualOrderActive}
              onConfirmVisualOrder={handleConfirmVisualOrder}
              onCancelVisualOrder={handleCancelVisualOrder}
            />



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

      {isOrderPanelOpen && (
        <aside className="w-72 lg:w-80 flex-shrink-0 border-l-2 border-[#121212] bg-[#F4F4F0] flex flex-col h-full overflow-y-auto z-20">
          <OrderPanel
            ref={orderPanelRef}
            symbol={symbol}
            currentPrice={currentPrice}
            balance={balance}
            riskPercent={riskPercent}
            onRiskPercentChange={setRiskPercent}
            activeTrade={activeTrade}
            onOpenTrade={handleOpenTrade}
            onCloseTrade={handleManualClose}
            selectedSideOverride={tradeSide}
            intrabarWarning={intrabarWarning}
            isSubmitting={isSubmittingTrade}
            appMode={appMode}
            onActivateReplay={handleActivateBarReplay}
            onPlannedTradeChange={setPlannedTrade}
            onVisualOrderSubmit={handleSubmitVisualOrder}
            controlledSlPrice={controlledSlPrice}
            controlledTpPrice={controlledTpPrice}
          />
        </aside>
      )}
    </div>
  );

  return (
    <div ref={workspaceRef} className="w-full h-full bg-slate-900 overflow-hidden relative">
      {mobileTerminal}
      {desktopWorkspace}


      {/* Trade toast notifications — positioned fixed, non-blocking */}
      <div className="pointer-events-none fixed top-14 right-4 max-w-[calc(100vw-32px)] z-[70] flex flex-col items-end gap-2">
        <TradeNotificationToast toast={activeToast} onDismiss={dismissToast} />
      </div>
    </div>
  );
}
