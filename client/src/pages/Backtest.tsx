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
  MousePointer2,
  PanelRightOpen,
  Minimize2,
  Maximize2,
  Play,
  Pause,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { CandlestickChart, ChartCandle, ChartIndicators, DrawingItem, PlannedOrderPreview } from '../components/backtest/CandlestickChart';
import { DrawingToolbar, DrawingTool } from '../components/backtest/DrawingToolbar';
import { ReplayControls, ReplaySpeed, ChartTimeframe, AppMode } from '../components/backtest/ReplayControls';
import { ReplayTimeline } from '../components/backtest/ReplayTimeline';
import { JumpToDateDialog } from '../components/backtest/JumpToDateDialog';
import { OrderPanel } from '../components/backtest/OrderPanel';
import { BacktestStats } from '../components/backtest/BacktestStats';
import { TradeHistory } from '../components/backtest/TradeHistory';
import {
  calculatePositionSize,
  evaluateCandleHit,
  calculateBacktestStats,
  calculatePnL,
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

  const handlePlannedOrderChange = useCallback((newPlanned: { entryPrice: number; slPrice: number; tpPrice: number }) => {
    setControlledSlPrice(newPlanned.slPrice);
    setControlledTpPrice(newPlanned.tpPrice);
  }, []);

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
  const [bottomDrawerTab, setBottomDrawerTab] = useState<'NONE' | 'STATS' | 'HISTORY'>('NONE');
  const [isJumpDialogOpen, setIsJumpDialogOpen] = useState<boolean>(false);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingOlderRef = useRef<boolean>(false);
  const isFetchingNewerRef = useRef<boolean>(false);

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

      setCandles((prev) => [...prev, nextCandle]);
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
      alert('Posisi aktif sudah ada. Tutup posisi terlebih dahulu sebelum membuka posisi baru.');
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
    } catch (err: any) {
      alert(`Gagal membuka posisi: ${err.message}`);
    } finally {
      setIsSubmittingTrade(false);
    }
  };

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
        fetch(`${API_BASE}/sessions/${sessionId}/sync-to-journal`, { method: 'POST' }).catch(console.error);
      } else {
        alert(`Gagal menutup posisi: ${json.error || 'Terjadi kesalahan'}`);
      }
    } catch (err: any) {
      console.error('Manual close error:', err);
      alert(`Gagal menutup posisi: ${err.message}`);
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
      alert('Aktifkan mode Chart Replay terlebih dahulu untuk melakukan transaksi live backtest.');
      return;
    }
    if (activeTrade) {
      alert('Posisi aktif masih terbuka. Tutup posisi terlebih dahulu sebelum membuka posisi baru.');
      return;
    }
    const isLong = pos.type === 'long_position';
    const entryPrice = pos.startPrice || currentPrice;
    const slPrice = pos.slPrice;
    const tpPrice = pos.tpPrice;
    if (!slPrice || !tpPrice) {
      alert('Posisi belum memiliki SL dan TP yang valid.');
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
  const stats: IBacktestStats = calculateBacktestStats(tradeHistory, initialBalance, activeTrade, currentPrice);
  // Floating PnL for the open position, computed locally (not in BacktestStats).
  const liveFloatingPnl = activeTrade && activeTrade.status === 'OPEN' && currentPrice > 0
    ? calculatePnL(activeTrade.side, activeTrade.entryPrice, currentPrice, activeTrade.volume, getSymbolContractSize(symbol))
    : 0;

  const [isMobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetKind, setMobileSheetKind] = useState<'ORDER' | 'TOOLS' | 'STATS' | 'HISTORY'>('ORDER');

  const openMobileSheet = (kind: typeof mobileSheetKind) => {
    setMobileSheetKind(kind);
    setMobileSheetOpen(true);
  };

  const replayReset = appMode === 'replay' && replayStartTime
    ? () => { void initReplaySession(replayStartTime, timeframe); }
    : undefined;

  // ── MOBILE TERMINAL ──
  // Chart is the hero. Strip = symbol/TF/mode. Context = position info.
  // Actions = primary buy/sell (or replay controls), secondary in a sheet.
  const mobileTerminal = (
    <div className={`mobile-terminal md:hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Top strip: symbol / TF / mode. One line, scannable. */}
      <div className="mobile-terminal-strip">
        <span className="mobile-tag mobile-tag-accent">{symbol}</span>
        <select
          value={timeframe}
          onChange={(e) => handleTimeframeChange(e.target.value as ChartTimeframe)}
          aria-label="Timeframe"
          className="mobile-tag bg-transparent border-0 px-1 py-1 text-[#E6EDF3] font-mono font-semibold"
        >
          {(['M1','M5','M15','M30','H1','H4','D1'] as ChartTimeframe[]).map(tf => (
            <option key={tf} value={tf} className="bg-[#0B0E17] text-[#E6EDF3]">{tf}</option>
          ))}
        </select>
        {appMode === 'analysis' && <span className="mobile-tag mobile-tag-profit">ANALYSIS</span>}
        {appMode === 'selecting' && <span className="mobile-tag mobile-tag-warn">PICK START</span>}
        {appMode === 'replay' && <span className="mobile-tag mobile-tag-accent">REPLAY</span>}
        {appMode === 'replay' && replayTime && (
          <span className="mobile-tag font-mono">{format(replayTime, 'MM-dd HH:mm')}</span>
        )}
        <div className="flex-1" />
        {/* Only the two actions that matter before replay: start replay or jump. */}
        {appMode === 'analysis' && (
          <>
            <button
              type="button"
              onClick={() => setIsJumpDialogOpen(true)}
              className="mobile-icon-btn"
              aria-label="Jump to date"
              title="Jump to date"
            >
              <Calendar className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleActivateBarReplay}
              className="mobile-icon-btn"
              data-active="true"
              aria-label="Activate chart replay"
              title="Activate chart replay"
            >
              <Video className="w-4 h-4" />
            </button>
          </>
        )}
        {appMode === 'selecting' && selectionTime && (
          <span className="mobile-tag mobile-tag-warn font-mono">{format(selectionTime, 'HH:mm')}</span>
        )}
        {appMode === 'replay' && (
          <>
            <button
              type="button"
              onClick={() => openMobileSheet('STATS')}
              className="mobile-icon-btn"
              aria-label="Session stats"
              title="Session stats"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openMobileSheet('HISTORY')}
              className="mobile-icon-btn"
              aria-label="Trade history"
              title="Trade history"
            >
              <History className="w-4 h-4" />
            </button>
          </>
        )}
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
      <div className="mobile-terminal-chart relative">
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
        />
      </div>

      {/* Context line: current price + position info, directly under chart. */}
      <div className="mobile-terminal-context flex items-center gap-3 text-[11px] font-mono">
        <span className="text-[#F0C020] font-bold text-base">{currentPrice > 0 ? currentPrice.toFixed(2) : '--.--'}</span>
        <span className="text-[#717182]">Bal ${balance.toFixed(0)}</span>
        <div className="flex-1" />
        {activeTrade ? (
          <>
            <span className={`mobile-tag ${activeTrade.side === 'LONG' ? 'mobile-tag-profit' : 'mobile-tag-loss'}`}>
              {activeTrade.side === 'LONG' ? 'LONG' : 'SHORT'} {activeTrade.volume.toFixed(2)}L
            </span>
            <span className={`font-bold ${liveFloatingPnl >= 0 ? 'text-[#34D399]' : 'text-[#F87171]'}`}>
              {liveFloatingPnl >= 0 ? '+' : ''}{liveFloatingPnl.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-[#717182]">No position</span>
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
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="mobile-icon-btn"
              aria-label="Fullscreen"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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

        {/* Replay: step / play / speed are the primary actions. */}
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
              className="mobile-action-buy"
              style={{ flex: 2, background: isPlaying ? '#F0C020' : '#059669', color: isPlaying ? '#0B0E17' : '#FFFFFF' }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? 'Pause' : 'Play'}
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
            <button
              type="button"
              onClick={() => openMobileSheet('ORDER')}
              className="mobile-icon-btn"
              data-active={isOrderPanelOpen}
              aria-label="Order panel"
              title="Order panel"
            >
              <PanelRightOpen className="w-4 h-4" />
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
          </>
        )}
      </div>

      {/* Mobile bottom sheet: contextual, only when summoned. */}
      {isMobileSheetOpen && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSheetOpen(false)}
            aria-hidden="true"
          />
          <div className="mobile-sheet" role="dialog" aria-modal="true" aria-label="Contextual controls">
            <div className="mobile-sheet-handle" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#9DB4FF]">
                {mobileSheetKind === 'ORDER' && 'Order'}
                {mobileSheetKind === 'TOOLS' && 'Drawing Tools'}
                {mobileSheetKind === 'STATS' && 'Session Stats'}
                {mobileSheetKind === 'HISTORY' && 'Trade History'}
              </span>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="mobile-icon-btn"
                style={{ minWidth: 36, minHeight: 36, padding: 6 }}
                aria-label="Close sheet"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {mobileSheetKind === 'ORDER' && (
              <OrderPanel
                symbol={symbol}
                currentPrice={currentPrice}
                balance={balance}
                riskPercent={riskPercent}
                onRiskPercentChange={setRiskPercent}
                activeTrade={activeTrade}
                onOpenTrade={handleOpenTrade}
                onCloseTrade={handleManualClose}
                intrabarWarning={intrabarWarning}
                isSubmitting={isSubmittingTrade}
                appMode={appMode}
                onActivateReplay={handleActivateBarReplay}
                onPlannedTradeChange={setPlannedTrade}
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
          </div>
        </div>
      )}

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
    <div className={`hidden md:flex w-full min-w-0 max-w-full overflow-x-hidden flex-col gap-2 select-none ${
      isFullscreen ? 'fixed inset-0 z-50 bg-[#0B0E17] p-2 h-screen' : 'h-[calc(100vh-62px)] lg:h-[calc(100vh-58px)] pb-1'
    }`}>
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
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        isOrderPanelOpen={isOrderPanelOpen}
        onToggleOrderPanel={() => setIsOrderPanelOpen(!isOrderPanelOpen)}
        loading={loading}
        selectionTime={selectionTime}
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

      <div className="flex items-stretch gap-2 relative flex-1 min-h-0 min-w-0 max-w-full overflow-hidden">
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

        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative h-full">
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
          />
        </div>

        {isOrderPanelOpen && (
          <div className="hidden md:block md:w-80 md:shrink-0 md:h-full md:rounded-xl md:overflow-hidden">
            <OrderPanel
              symbol={symbol}
              currentPrice={currentPrice}
              balance={balance}
              riskPercent={riskPercent}
              onRiskPercentChange={setRiskPercent}
              activeTrade={activeTrade}
              onOpenTrade={handleOpenTrade}
              onCloseTrade={handleManualClose}
              intrabarWarning={intrabarWarning}
              isSubmitting={isSubmittingTrade}
              appMode={appMode}
              onActivateReplay={handleActivateBarReplay}
              onPlannedTradeChange={setPlannedTrade}
              controlledSlPrice={controlledSlPrice}
              controlledTpPrice={controlledTpPrice}
            />
          </div>
        )}
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
        <div className="bg-[#121622] border border-slate-800 rounded-xl overflow-hidden shadow-lg shrink-0 text-slate-200">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBottomDrawerTab(bottomDrawerTab === 'STATS' ? 'NONE' : 'STATS')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wider transition-colors ${
                  bottomDrawerTab === 'STATS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Statistik Sesi</span>
                <span className="font-mono text-[11px] opacity-90">
                  (${stats.currentBalance.toFixed(0)} • {stats.winRate.toFixed(0)}% WR)
                </span>
              </button>

              <button
                onClick={() => setBottomDrawerTab(bottomDrawerTab === 'HISTORY' ? 'NONE' : 'HISTORY')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wider transition-colors ${
                  bottomDrawerTab === 'HISTORY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Riwayat Trade ({tradeHistory.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenDashboard}
                disabled={isSyncingDashboard}
                title="Buka sesi ini di Dashboard utama"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 transition-colors disabled:opacity-50"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{isSyncingDashboard ? 'Sinkronisasi...' : 'Buka di Dashboard'}</span>
              </button>

              <button
                onClick={() => setBottomDrawerTab(bottomDrawerTab === 'NONE' ? 'STATS' : 'NONE')}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                aria-label="Toggle bottom drawer"
              >
                {bottomDrawerTab === 'NONE' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
    </div>
  );

  return (
    <>
      {mobileTerminal}
      {desktopWorkspace}
    </>
  );
}
