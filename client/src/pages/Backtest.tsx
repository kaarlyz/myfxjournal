import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  History,
  Activity,
  AlertTriangle,
  Loader2,
  Video,
} from 'lucide-react';
import { format } from 'date-fns';
import { CandlestickChart, ChartCandle, ChartIndicators, DrawingItem } from '../components/backtest/CandlestickChart';
import { DrawingToolbar, DrawingTool } from '../components/backtest/DrawingToolbar';
import { ReplayControls, ReplaySpeed, ChartTimeframe, AppMode } from '../components/backtest/ReplayControls';
import { ReplayTimeline } from '../components/backtest/ReplayTimeline';
import { JumpToDateDialog } from '../components/backtest/JumpToDateDialog';
import { OrderPanel } from '../components/backtest/OrderPanel';
import { BacktestStats } from '../components/backtest/BacktestStats';
import { TradeHistory } from '../components/backtest/TradeHistory';
import {
  evaluateCandleHit,
  calculateBacktestStats,
  BacktestTradeRecord,
  TradeSide,
  BacktestStats as IBacktestStats,
} from '../../../server/src/services/backtestEngine';

const API_BASE = '/api/backtest';

export default function Backtest() {
  // ── Mode State Machine ──
  // 'analysis' = default, full history visible, no replay cutoff
  // 'selecting' = bar replay cursor active on chart, user picks start candle
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

  // Trade & History State
  const [activeTrade, setActiveTrade] = useState<BacktestTradeRecord | null>(null);
  const [tradeHistory, setTradeHistory] = useState<BacktestTradeRecord[]>([]);
  const [intrabarWarning, setIntrabarWarning] = useState<string | null>(null);

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

  // ── 1. Fetch Timeline Bounds ──
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
  }, []);

  // ── 2. Analysis Mode: Load Latest Candles (NO replay cutoff) ──
  const loadAnalysisCandles = useCallback(async (tf: ChartTimeframe = timeframe) => {
    setLoading(true);
    setError(null);
    try {
      // No replayTime — backend returns latest candles with no cutoff
      const res = await fetch(
        `${API_BASE}/candles?symbol=XAUUSD&timeframe=${tf}&provider=DUKASCOPY&limit=1500`
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to fetch candles');
      setCandles(json.data.candles);
      if (json.data.candles.length > 0) {
        setReplayTime(new Date(json.data.candles[json.data.candles.length - 1].time));
      }
    } catch (err: any) {
      console.error('Analysis load error:', err);
      setError(err.message || 'Gagal memuat data historis Dukascopy.');
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  // Load analysis candles on mount
  useEffect(() => {
    loadAnalysisCandles('M1');
  }, []);

  // ── 2b. Load Older Candles (Pan Left — Analysis & Replay) ──
  const handleLoadOlderCandles = useCallback(async () => {
    if (candles.length === 0 || isFetchingOlderRef.current) return;
    const earliest = candles[0];
    const earliestTime = new Date(earliest.time).toISOString();

    try {
      isFetchingOlderRef.current = true;
      // In replay mode: still enforce replayTime upper boundary
      const replayParam = appMode === 'replay' && replayStartTime
        ? `&replayTime=${encodeURIComponent(replayStartTime.toISOString())}`
        : '';
      const res = await fetch(
        `${API_BASE}/candles?symbol=XAUUSD&timeframe=${timeframe}&provider=DUKASCOPY&beforeTime=${encodeURIComponent(earliestTime)}&limit=1500${replayParam}`
      );
      const json = await res.json();
      if (json.ok && json.data && json.data.candles.length > 0) {
        setCandles((prev) => [...json.data.candles, ...prev]);
      }
    } catch (err) {
      console.error('Error fetching older history:', err);
    } finally {
      isFetchingOlderRef.current = false;
    }
  }, [candles, timeframe, appMode, replayStartTime]);

  // ── 2c. Load Newer Candles (Pan Right in Analysis Mode) ──
  const handleLoadNewerCandles = useCallback(async () => {
    if (candles.length === 0 || isFetchingNewerRef.current) return;
    if (appMode === 'replay') return; // Never load future candles in replay
    const latest = candles[candles.length - 1];
    const latestTime = new Date(latest.time).toISOString();

    try {
      isFetchingNewerRef.current = true;
      const res = await fetch(
        `${API_BASE}/candles?symbol=XAUUSD&timeframe=${timeframe}&provider=DUKASCOPY&afterTime=${encodeURIComponent(latestTime)}&limit=500`
      );
      const json = await res.json();
      if (json.ok && json.data && json.data.candles.length > 0) {
        setCandles((prev) => [...prev, ...json.data.candles]);
      }
    } catch (err) {
      console.error('Error fetching newer candles:', err);
    } finally {
      isFetchingNewerRef.current = false;
    }
  }, [candles, timeframe, appMode]);

  // ── 2d. Timeframe Switch Handler ──
  const handleTimeframeChange = (newTF: ChartTimeframe) => {
    setTimeframe(newTF);
    if (appMode === 'analysis') {
      loadAnalysisCandles(newTF);
    } else if (appMode === 'replay' && replayStartTime) {
      initReplaySession(replayStartTime, newTF);
    }
  };

  // ── 3. Replay Mode: Initialize Session with strict cutoff ──
  const initReplaySession = useCallback(async (startTime: Date, tf: ChartTimeframe = timeframe) => {
    setLoading(true);
    setIsPlaying(false);
    setError(null);
    setFollowReplay(true);
    try {
      // Create backend session
      const resSession = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Backtest XAUUSD ${tf} (${startTime.toISOString().slice(0, 10)})`,
          symbol: 'XAUUSD',
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
      setActiveTrade(null);
      setTradeHistory([]);
      setIntrabarWarning(null);

      // Fetch windowed candles strictly ending at startTime (Zero Look-Ahead)
      const resCandles = await fetch(
        `${API_BASE}/candles?symbol=XAUUSD&timeframe=${tf}&provider=DUKASCOPY&replayTime=${encodeURIComponent(startTime.toISOString())}&limit=2000`
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
  }, [initialBalance, riskPercent, timeframe, drawings]);

  // ── 4. Activate Bar Replay (enter 'selecting' mode) ──
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
    setActiveTrade(null);
    setTradeHistory([]);
    setIntrabarWarning(null);
    setReplayStartTime(null);
    setSelectionTime(null);
    // Reload fresh analysis candles
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
        if (appMode === 'analysis') {
          // In analysis mode: jump chart to that date, then activate replay
          setAppMode('replay');
          await initReplaySession(time, timeframe);
        } else {
          await initReplaySession(time, timeframe);
        }
      }
    } catch (err) {
      console.error('Random start error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── 9. Sequential Step Forward Engine ──
  const stepForward = useCallback(async () => {
    if (candles.length === 0 || appMode !== 'replay') return;
    const lastCandle = candles[candles.length - 1];
    const lastTime = new Date(lastCandle.time).toISOString();

    try {
      const res = await fetch(
        `${API_BASE}/next-candle?symbol=XAUUSD&timeframe=${timeframe}&provider=DUKASCOPY&afterTime=${encodeURIComponent(lastTime)}`
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
      if (activeTrade && activeTrade.status === 'OPEN') {
        const hitResult = evaluateCandleHit(
          {
            side: activeTrade.side,
            entryPrice: activeTrade.entryPrice,
            slPrice: activeTrade.slPrice,
            tpPrice: activeTrade.tpPrice,
          },
          { time: nextTime, open: nextCandle.open, high: nextCandle.high, low: nextCandle.low, close: nextCandle.close }
        );

        if (hitResult.type !== 'NONE') {
          if (hitResult.type === 'INTRABAR_AMBIGUOUS') {
            setIntrabarWarning(`Peringatan: Candle ${format(nextTime, 'HH:mm')} menyentuh SL & TP sekaligus.`);
          }

          const exitPrice = hitResult.exitPrice ||
            (hitResult.type === 'TP' ? activeTrade.tpPrice : activeTrade.slPrice);

          const closeRes = await fetch(`${API_BASE}/sessions/${sessionId}/trades/${activeTrade.id}/close`, {
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
            setActiveTrade(null);
            setTradeHistory((prev) => [closeJson.data.trade, ...prev]);
            setBalance(closeJson.data.session.currentBalance);
          }
        }
      }
    } catch (err) {
      console.error('Step forward error:', err);
      setIsPlaying(false);
    }
  }, [candles, timeframe, activeTrade, sessionId, appMode]);

  // ── 10. Step Back Engine ──
  const stepBack = useCallback(() => {
    if (candles.length <= 1 || appMode !== 'replay') return;
    setCandles((prev) => {
      const next = prev.slice(0, prev.length - 1);
      setReplayTime(new Date(next[next.length - 1].time));
      return next;
    });
  }, [candles, appMode]);

  // ── 11. Replay Loop ──
  useEffect(() => {
    if (!isPlaying || appMode !== 'replay') return;
    const intervalMs = Math.max(80, 1000 / speed);
    const timer = setInterval(() => { stepForward(); }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, speed, stepForward, appMode]);

  // ── 12. Open Trade Handler (only in replay mode) ──
  const handleOpenTrade = async (tradeParams: {
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => {
    if (!sessionId || appMode !== 'replay') return;
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tradeParams, entryTime: replayTime?.toISOString() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to open trade');
      setActiveTrade(json.data);
      setIntrabarWarning(null);
    } catch (err: any) {
      alert(`Gagal membuka posisi: ${err.message}`);
    }
  };

  // ── 13. Manual Close Handler ──
  const handleManualClose = async () => {
    if (!sessionId || !activeTrade) return;
    const currentPrice = candles[candles.length - 1]?.close || activeTrade.entryPrice;
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/trades/${activeTrade.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exitTime: replayTime?.toISOString(),
          exitPrice: currentPrice,
          exitReason: 'MANUAL_CLOSE',
        }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setActiveTrade(null);
        setTradeHistory((prev) => [json.data.trade, ...prev]);
        setBalance(json.data.session.currentBalance);
      }
    } catch (err) {
      console.error('Manual close error:', err);
    }
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
  }, [stepForward, stepBack, isFullscreen, selectedDrawingId, followReplay, appMode]);

  // Current market price from latest visible candle
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const stats: IBacktestStats = calculateBacktestStats(tradeHistory, initialBalance, activeTrade, currentPrice);

  return (
    <div
      className={`w-full min-w-0 max-w-full overflow-x-hidden flex flex-col gap-2 select-none ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#070B13] p-2 h-screen'
          : 'h-[calc(100vh-62px)] md:h-[calc(100vh-58px)] pb-1'
      }`}
    >
      {/* Top Control Deck */}
      <ReplayControls
        appMode={appMode}
        isPlaying={isPlaying}
        onPlayToggle={() => setIsPlaying((prev) => !prev)}
        onStepForward={stepForward}
        onStepBack={stepBack}
        onReset={() => appMode === 'replay' && replayStartTime ? initReplaySession(replayStartTime, timeframe) : undefined}
        speed={speed}
        onSpeedChange={setSpeed}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        replayTime={replayTime}
        candleCount={candles.length}
        followReplay={followReplay}
        onToggleFollowReplay={() => setFollowReplay((prev) => !prev)}
        onJumpToCurrent={handleJumpToCurrent}
        onOpenJumpDialog={() => setIsJumpDialogOpen(true)}
        onRandomStart={handleRandomStart}
        onActivateBarReplay={handleActivateBarReplay}
        onExitReplay={handleExitReplay}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        isOrderPanelOpen={isOrderPanelOpen}
        onToggleOrderPanel={() => setIsOrderPanelOpen(!isOrderPanelOpen)}
        loading={loading}
        selectionTime={selectionTime}
      />

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-1.5 text-xs text-rose-300 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Selecting Mode Hint Banner */}
      {appMode === 'selecting' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-300 flex items-center gap-2 shrink-0 animate-pulse">
          <Video className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Bar Replay:</strong> Gerakkan kursor ke atas chart dan klik candle manapun untuk memulai replay dari titik tersebut.
            Semua candle setelah titik yang dipilih akan disembunyikan.
          </span>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex items-stretch gap-2 relative flex-1 min-h-0 min-w-0 max-w-full overflow-hidden">
        {/* Left: Drawing Toolbar */}
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

        {/* Center: Candlestick Chart */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col relative h-full">
          <CandlestickChart
            candles={candles}
            timeframe={timeframe}
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
          />
        </div>

        {/* Right: Order Panel — only visible in replay mode */}
        {appMode === 'replay' && isOrderPanelOpen && (
          <div className="w-72 sm:w-80 shrink-0 h-full overflow-y-auto z-10 min-h-0 bg-slate-900 border border-slate-800 rounded-xl">
            <OrderPanel
              currentPrice={currentPrice}
              balance={balance}
              riskPercent={riskPercent}
              onRiskPercentChange={setRiskPercent}
              activeTrade={activeTrade}
              onOpenTrade={handleOpenTrade}
              onCloseTrade={handleManualClose}
              intrabarWarning={intrabarWarning}
            />
          </div>
        )}

        {/* Analysis mode: show compact price info panel instead of order panel */}
        {appMode === 'analysis' && (
          <div className="w-56 shrink-0 h-full flex flex-col gap-2">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs flex flex-col gap-2">
              <div className="text-slate-400 font-semibold uppercase tracking-wide text-[10px]">Analysis Mode</div>
              <div className="text-slate-300 text-[11px] leading-relaxed">
                Chart mode aktif. Kamu bisa pan, zoom, dan gambar secara bebas.
              </div>
              <div className="text-[11px] font-mono">
                <div className="text-slate-400">Latest price</div>
                <div className="text-amber-400 font-bold text-base">{currentPrice > 0 ? currentPrice.toFixed(2) : '--'}</div>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="text-slate-500 text-[10px]">Klik <strong className="text-blue-400">Bar Replay</strong> di toolbar untuk memulai backtesting.</div>
            </div>
          </div>
        )}

        {/* Selecting mode: show instruction panel */}
        {appMode === 'selecting' && (
          <div className="w-56 shrink-0 h-full flex flex-col gap-2">
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 text-xs flex flex-col gap-2">
              <div className="text-amber-400 font-bold uppercase tracking-wide text-[10px]">Pilih Start Replay</div>
              <div className="text-slate-300 text-[11px] leading-relaxed">
                Gerakkan kursor ke chart. Garis vertikal oranye akan mengikuti kursor.
              </div>
              <div className="text-slate-300 text-[11px]">
                Klik pada candle yang kamu inginkan sebagai titik awal replay.
              </div>
              {selectionTime && (
                <div className="mt-1 p-2 bg-amber-500/10 rounded border border-amber-500/20">
                  <div className="text-amber-400 font-mono text-[11px] font-bold">
                    {format(selectionTime, 'yyyy-MM-dd HH:mm')}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Replay Timeline */}
      <ReplayTimeline
        dateFrom={timelineBounds.dateFrom}
        dateTo={timelineBounds.dateTo}
        currentReplayTime={replayTime || timelineBounds.dateTo}
        onSeek={(targetDate) => {
          if (appMode === 'replay') {
            initReplaySession(targetDate, timeframe);
          } else {
            // In analysis mode, jump chart view to that date
            setIsJumpDialogOpen(false);
          }
        }}
        disabled={loading}
      />

      {/* Bottom Statistics Drawer */}
      {appMode === 'replay' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl shrink-0">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBottomDrawerTab(bottomDrawerTab === 'STATS' ? 'NONE' : 'STATS')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  bottomDrawerTab === 'STATS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Statistik Sesi</span>
                <span className="font-mono text-[11px] opacity-80">
                  (${stats.currentBalance.toFixed(0)} • {stats.winRate.toFixed(0)}% WR)
                </span>
              </button>

              <button
                onClick={() => setBottomDrawerTab(bottomDrawerTab === 'HISTORY' ? 'NONE' : 'HISTORY')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  bottomDrawerTab === 'HISTORY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Riwayat Trade ({tradeHistory.length})</span>
              </button>
            </div>

            <button
              onClick={() => setBottomDrawerTab(bottomDrawerTab === 'NONE' ? 'STATS' : 'NONE')}
              className="p-1 rounded text-slate-400 hover:text-slate-200"
            >
              {bottomDrawerTab === 'NONE' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
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

      {/* Jump To Date Dialog */}
      <JumpToDateDialog
        isOpen={isJumpDialogOpen}
        onClose={() => setIsJumpDialogOpen(false)}
        onJump={(targetDate) => {
          if (appMode === 'replay') {
            initReplaySession(targetDate, timeframe);
          } else {
            // In analysis mode, activate replay from selected date
            setAppMode('replay');
            initReplaySession(targetDate, timeframe);
          }
        }}
        onRandomStart={handleRandomStart}
        currentReplayTime={replayTime || new Date()}
      />
    </div>
  );
}
