import React, { useRef, useEffect, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import { ChartTimeframe, TradeSide } from '../../shared/backtestEngine';
import { PendingOrderRecord, OrderExecutionType } from './OrderTypes';

export type AppMode = 'analysis' | 'selecting' | 'replay';

export interface ChartCandle {
  time: string | Date | number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
}

export interface ActiveTradeMarker {
  side: TradeSide;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  volume: number;
}

export interface ChartIndicators {
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
}

export interface PlannedOrderPreview {
  orderType?: OrderExecutionType;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  slPrice?: number | null;
  tpPrice?: number | null;
  lotSize: number;
  riskAmount: number;
  targetProfit?: number;
  rrRatio?: number;
  isValid?: boolean;
  validationError?: string;
  hasSL?: boolean;
  hasTP?: boolean;
}

export interface DrawingItem {
  id: string;
  type: string;
  [key: string]: any;
}

export interface CandlestickChartProps {
  candles: ChartCandle[];
  timeframe?: ChartTimeframe;
  symbol?: string;
  isLoading?: boolean;
  error?: string | null;
  appMode?: AppMode;
  activeTrade?: ActiveTradeMarker | null;
  activeTrades?: ActiveTradeMarker[];
  indicators?: ChartIndicators;
  onIndicatorsChange?: (indicators: ChartIndicators) => void;
  activeTool?: string;
  onToolChange?: (tool: any) => void;
  drawings?: DrawingItem[];
  onDrawingsChange?: (drawings: DrawingItem[]) => void;
  selectedDrawingId?: string | null;
  onSelectDrawing?: (id: string | null) => void;
  onReplaySelectionClick?: (time: Date) => void;
  onSelectionTimeChange?: (time: Date | null) => void;
  onLoadOlderCandles?: () => void;
  onLoadNewerCandles?: () => void;
  followReplay?: boolean;
  onDisableFollowReplay?: () => void;
  lockRR?: boolean;
  isFullscreen?: boolean;
  pendingOrders?: PendingOrderRecord[];
  onCancelPendingOrder?: (id: string) => void;
  onEditPendingOrder?: (order: PendingOrderRecord) => void;
  onCloseActiveTrade?: () => void;
  plannedOrder?: PlannedOrderPreview | null;
  onPlannedOrderChange?: (newPlanned: { entryPrice: number; slPrice: number; tpPrice: number }) => void;
  onExecutePlannedTrade?: (pos?: any) => void;
  isVisualOrderActive?: boolean;
  onConfirmVisualOrder?: () => void;
  onCancelVisualOrder?: () => void;
  isTimeframeLoading?: boolean;
  balance?: number;
  equity?: number;
  floatingPnL?: number;
  floatingR?: number;
  hasOpenPositions?: boolean;
}

// Convert any ISO string / Date / timestamp to Unix seconds integer (UTCTimestamp)
function toUtcTimestamp(timeInput: string | Date | number): UTCTimestamp {
  if (typeof timeInput === 'number') {
    return (timeInput > 10000000000 ? Math.floor(timeInput / 1000) : timeInput) as UTCTimestamp;
  }
  const d = typeof timeInput === 'string' ? new Date(timeInput) : timeInput;
  return Math.floor(d.getTime() / 1000) as UTCTimestamp;
}

// Calculate simple moving average
function calculateSMAData(candles: { time: UTCTimestamp; close: number }[], period: number) {
  const result: { time: UTCTimestamp; value: number }[] = [];
  if (candles.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  result.push({ time: candles[period - 1].time, value: sum / period });

  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    result.push({ time: candles[i].time, value: sum / period });
  }
  return result;
}

// Format price stepping based on symbol
function formatPriceStep(price: number, symbol?: string): number {
  const sym = (symbol || '').toUpperCase();
  if (
    sym.includes('EUR') ||
    sym.includes('GBP') ||
    sym.includes('AUD') ||
    sym.includes('NZD') ||
    (sym.includes('USD') && !sym.includes('XAU') && !sym.includes('JPY'))
  ) {
    return Math.round(price * 100000) / 100000;
  }
  return Math.round(price * 100) / 100;
}

// Format price display text
function formatPriceDisplay(price: number, symbol?: string): string {
  if (!price || isNaN(price)) return '0.00';
  const sym = (symbol || '').toUpperCase();
  if (
    sym.includes('EUR') ||
    sym.includes('GBP') ||
    sym.includes('AUD') ||
    sym.includes('NZD') ||
    (sym.includes('USD') && !sym.includes('XAU') && !sym.includes('JPY'))
  ) {
    return price.toFixed(5);
  }
  return price.toFixed(2);
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles,
  timeframe = 'M1',
  symbol = 'XAUUSD',
  isLoading = false,
  error = null,
  appMode = 'analysis',
  activeTrade,
  indicators = { sma20: true, sma50: true, sma200: false },
  onReplaySelectionClick,
  followReplay = true,
  onDisableFollowReplay,
  plannedOrder,
  onPlannedOrderChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const sma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sma200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Price lines for Active Trade & Planned Order
  const activeEntryLineRef = useRef<any>(null);
  const activeSlLineRef = useRef<any>(null);
  const activeTpLineRef = useRef<any>(null);
  const plannedEntryLineRef = useRef<any>(null);
  const plannedSlLineRef = useRef<any>(null);
  const plannedTpLineRef = useRef<any>(null);

  // Overlay Y pixel coordinates — use refs for zero-delay DOM manipulation
  const overlayEntryRef = useRef<HTMLDivElement>(null);
  const overlaySlRef = useRef<HTMLDivElement>(null);
  const overlayTpRef = useRef<HTMLDivElement>(null);
  const overlayRiskZoneRef = useRef<HTMLDivElement>(null);
  const overlayProfitZoneRef = useRef<HTMLDivElement>(null);
  const overlayContainerRef = useRef<HTMLDivElement>(null);

  // Dragging state tracking ref
  const activeDragTypeRef = useRef<'ENTRY' | 'SL' | 'TP' | null>(null);
  const prevFollowReplayRef = useRef<boolean>(followReplay);

  const plannedOrderRef = useRef<PlannedOrderPreview | null | undefined>(plannedOrder);
  useEffect(() => {
    plannedOrderRef.current = plannedOrder;
  }, [plannedOrder]);

  // Direct DOM update — zero React re-render, zero delay
  const syncOverlayDOM = useCallback(() => {
    const po = plannedOrderRef.current;
    const series = candleSeriesRef.current;
    const container = overlayContainerRef.current;
    if (!container) return;

    if (!series || !po || !(po.entryPrice > 0)) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    const entryY = series.priceToCoordinate(po.entryPrice);
    const slY = po.slPrice && po.slPrice > 0 ? series.priceToCoordinate(po.slPrice) : null;
    const tpY = po.tpPrice && po.tpPrice > 0 ? series.priceToCoordinate(po.tpPrice) : null;

    // Entry line
    if (overlayEntryRef.current) {
      if (entryY !== null) {
        overlayEntryRef.current.style.display = '';
        overlayEntryRef.current.style.top = `${entryY}px`;
      } else {
        overlayEntryRef.current.style.display = 'none';
      }
    }
    // SL line
    if (overlaySlRef.current) {
      if (slY !== null) {
        overlaySlRef.current.style.display = '';
        overlaySlRef.current.style.top = `${slY}px`;
      } else {
        overlaySlRef.current.style.display = 'none';
      }
    }
    // TP line
    if (overlayTpRef.current) {
      if (tpY !== null) {
        overlayTpRef.current.style.display = '';
        overlayTpRef.current.style.top = `${tpY}px`;
      } else {
        overlayTpRef.current.style.display = 'none';
      }
    }
    // Risk zone (entry↔sl)
    if (overlayRiskZoneRef.current) {
      if (entryY !== null && slY !== null) {
        overlayRiskZoneRef.current.style.display = '';
        overlayRiskZoneRef.current.style.top = `${Math.min(entryY, slY)}px`;
        overlayRiskZoneRef.current.style.height = `${Math.abs(entryY - slY)}px`;
      } else {
        overlayRiskZoneRef.current.style.display = 'none';
      }
    }
    // Profit zone (entry↔tp)
    if (overlayProfitZoneRef.current) {
      if (entryY !== null && tpY !== null) {
        overlayProfitZoneRef.current.style.display = '';
        overlayProfitZoneRef.current.style.top = `${Math.min(entryY, tpY)}px`;
        overlayProfitZoneRef.current.style.height = `${Math.abs(entryY - tpY)}px`;
      } else {
        overlayProfitZoneRef.current.style.display = 'none';
      }
    }
  }, []);

  // 1. Initialize Lightweight Chart Engine (v5.2)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 450,
      layout: {
        background: { type: ColorType.Solid, color: '#FAF7EE' },
        textColor: '#1E293B',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(0, 0, 0, 0.05)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(0, 0, 0, 0.05)', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#94A3B8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1E293B',
        },
        horzLine: {
          color: '#94A3B8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1E293B',
        },
      },
      rightPriceScale: {
        borderColor: '#CBD5E1',
        scaleMargins: {
          top: 0.12,
          bottom: 0.15,
        },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#CBD5E1',
        timeVisible: true,
        secondsVisible: timeframe === 'M1',
        barSpacing: 8,
        minBarSpacing: 1.5,
        rightOffset: 18,
        fixLeftEdge: false,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar: followReplay,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Add Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Add Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(8, 153, 129, 0.35)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_scale',
    });

    chart.priceScale('volume_scale').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0.0,
      },
    });

    // Add SMA Series
    const sma20 = chart.addSeries(LineSeries, {
      color: '#3B82F6',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const sma50 = chart.addSeries(LineSeries, {
      color: '#F97316',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const sma200 = chart.addSeries(LineSeries, {
      color: '#8B5CF6',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    sma20SeriesRef.current = sma20;
    sma50SeriesRef.current = sma50;
    sma200SeriesRef.current = sma200;

    // Click handler for Replay 'selecting' mode
    chart.subscribeClick((param) => {
      if (param.time && onReplaySelectionClick) {
        const timeSec = param.time as number;
        onReplaySelectionClick(new Date(timeSec * 1000));
      }
    });

    // Subscribe visible logical range and crosshair move for overlay line sync
    const handleRangeOrCrosshair = () => {
      syncOverlayDOM();
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeOrCrosshair);
    chart.subscribeCrosshairMove(handleRangeOrCrosshair);

    // rAF loop: keeps overlay in sync during price-axis drag/zoom (TV doesn't fire events for that)
    let rafId = 0;
    const rafLoop = () => {
      syncOverlayDOM();
      rafId = requestAnimationFrame(rafLoop);
    };
    rafId = requestAnimationFrame(rafLoop);

    // Responsive Auto-Resize
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height });
        syncOverlayDOM();
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeOrCrosshair);
        chart.unsubscribeCrosshairMove(handleRangeOrCrosshair);
      } catch (_) {}
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update timeScale options dynamically when followReplay changes
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      timeScale: {
        shiftVisibleRangeOnNewBar: followReplay,
      },
    });

    // Only scrollToPosition when followReplay is explicitly toggled ON by user
    if (followReplay && !prevFollowReplayRef.current) {
      chartRef.current.timeScale().scrollToPosition(18, false);
    }
    prevFollowReplayRef.current = followReplay;
  }, [followReplay]);

  // 2. Feed Data into Series (Deduplicated & Sorted)
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const timeMap = new Map<number, ChartCandle>();
    for (const c of candles) {
      const ts = toUtcTimestamp(c.time);
      timeMap.set(ts, c);
    }
    const sortedTimestamps = Array.from(timeMap.keys()).sort((a, b) => a - b);

    const formattedCandles = sortedTimestamps.map((ts) => {
      const c = timeMap.get(ts)!;
      return {
        time: ts as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });

    const formattedVolume = sortedTimestamps.map((ts) => {
      const c = timeMap.get(ts)!;
      const isUp = c.close >= c.open;
      return {
        time: ts as UTCTimestamp,
        value: c.tickVolume || Math.round(Math.abs(c.close - c.open) * 100) || 10,
        color: isUp ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)',
      };
    });

    candleSeriesRef.current.setData(formattedCandles);
    volumeSeriesRef.current.setData(formattedVolume);

    // Update SMAs
    if (sma20SeriesRef.current) {
      if (indicators.sma20) {
        sma20SeriesRef.current.setData(calculateSMAData(formattedCandles, 20));
      } else {
        sma20SeriesRef.current.setData([]);
      }
    }
    if (sma50SeriesRef.current) {
      if (indicators.sma50) {
        sma50SeriesRef.current.setData(calculateSMAData(formattedCandles, 50));
      } else {
        sma50SeriesRef.current.setData([]);
      }
    }
    if (sma200SeriesRef.current) {
      if (indicators.sma200) {
        sma200SeriesRef.current.setData(calculateSMAData(formattedCandles, 200));
      } else {
        sma200SeriesRef.current.setData([]);
      }
    }

    // Sync overlay coordinates when candles update
    syncOverlayDOM();
  }, [candles, indicators, syncOverlayDOM]);

  // 3. Sync Overlay Coordinates when plannedOrder changes
  useEffect(() => {
    syncOverlayDOM();
  }, [plannedOrder, syncOverlayDOM]);

  // 4. Render Active Trade Price Lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const s = candleSeriesRef.current;

    if (activeEntryLineRef.current) {
      s.removePriceLine(activeEntryLineRef.current);
      activeEntryLineRef.current = null;
    }
    if (activeSlLineRef.current) {
      s.removePriceLine(activeSlLineRef.current);
      activeSlLineRef.current = null;
    }
    if (activeTpLineRef.current) {
      s.removePriceLine(activeTpLineRef.current);
      activeTpLineRef.current = null;
    }

    if (activeTrade) {
      activeEntryLineRef.current = s.createPriceLine({
        price: activeTrade.entryPrice,
        color: '#2563EB',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `OPEN ${activeTrade.side} ${activeTrade.volume}L`,
      });
      if (activeTrade.slPrice > 0) {
        activeSlLineRef.current = s.createPriceLine({
          price: activeTrade.slPrice,
          color: '#DC2626',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SL',
        });
      }
      if (activeTrade.tpPrice > 0) {
        activeTpLineRef.current = s.createPriceLine({
          price: activeTrade.tpPrice,
          color: '#16A34A',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP',
        });
      }
    }
  }, [activeTrade]);

  // 5. Render Planned Order Price Lines on Right Price Scale
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const s = candleSeriesRef.current;

    if (plannedEntryLineRef.current) {
      s.removePriceLine(plannedEntryLineRef.current);
      plannedEntryLineRef.current = null;
    }
    if (plannedSlLineRef.current) {
      s.removePriceLine(plannedSlLineRef.current);
      plannedSlLineRef.current = null;
    }
    if (plannedTpLineRef.current) {
      s.removePriceLine(plannedTpLineRef.current);
      plannedTpLineRef.current = null;
    }

    if (plannedOrder && plannedOrder.entryPrice > 0) {
      plannedEntryLineRef.current = s.createPriceLine({
        price: plannedOrder.entryPrice,
        color: '#06B6D4',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `PLAN ${plannedOrder.side} ${plannedOrder.lotSize}L`,
      });
      if (plannedOrder.slPrice && plannedOrder.slPrice > 0) {
        plannedSlLineRef.current = s.createPriceLine({
          price: plannedOrder.slPrice,
          color: '#EF4444',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'PLAN SL',
        });
      }
      if (plannedOrder.tpPrice && plannedOrder.tpPrice > 0) {
        plannedTpLineRef.current = s.createPriceLine({
          price: plannedOrder.tpPrice,
          color: '#10B981',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'PLAN TP',
        });
      }
    }
  }, [plannedOrder]);

  // Global pointer move & up listeners to guarantee smooth, continuous drag tracking
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      const po = plannedOrderRef.current;
      if (!activeDragTypeRef.current || !candleSeriesRef.current || !po || !chartContainerRef.current) {
        return;
      }

      const rect = chartContainerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const rawPrice = candleSeriesRef.current.coordinateToPrice(relativeY);
      if (rawPrice === null || isNaN(rawPrice) || rawPrice <= 0) return;

      const newPrice = formatPriceStep(rawPrice, symbol);
      const type = activeDragTypeRef.current;

      let newEntry = po.entryPrice;
      let newSl = po.slPrice || 0;
      let newTp = po.tpPrice || 0;

      if (type === 'ENTRY') newEntry = newPrice;
      else if (type === 'SL') newSl = newPrice;
      else if (type === 'TP') newTp = newPrice;

      onPlannedOrderChange?.({
        entryPrice: newEntry,
        slPrice: newSl,
        tpPrice: newTp,
      });
    };

    const handleGlobalPointerUp = () => {
      if (activeDragTypeRef.current) {
        activeDragTypeRef.current = null;
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: true });
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [symbol, onPlannedOrderChange]);

  // Handle Drag Interactions for Entry, SL, and TP handles
  const handleDragStart = (type: 'ENTRY' | 'SL' | 'TP', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    activeDragTypeRef.current = type;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] flex flex-col bg-[#FAF7EE] select-none"
    >
      {/* TradingView Chart Canvas Container + Order Overlay (MUST share same parent for coordinate alignment) */}
      <div ref={chartContainerRef} className="w-full flex-1 min-h-0 relative">

      {/* Interactive Draggable Order Overlay — INSIDE chartContainerRef so Y coords match priceToCoordinate */}
      {plannedOrder && plannedOrder.entryPrice > 0 && (
        <div ref={overlayContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 50 }}>
          {/* Shaded Risk Zone (Entry↔SL) */}
          <div
            ref={overlayRiskZoneRef}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.18)', display: 'none' }}
          />

          {/* Shaded Profit Zone (Entry↔TP) */}
          <div
            ref={overlayProfitZoneRef}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.18)', display: 'none' }}
          />

          {/* Entry Line (Cyan) */}
          <div
            ref={overlayEntryRef}
            className="absolute left-0 right-0 flex items-center pointer-events-none"
            style={{ transform: 'translateY(-50%)', display: 'none' }}
          >
            <div className="w-full border-t-2 border-[#06B6D4] border-solid opacity-90" />
            <div
              onPointerDown={(e) => handleDragStart('ENTRY', e)}
              className="absolute left-3 bg-[#06B6D4] text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 cursor-ns-resize pointer-events-auto select-none touch-none"
            >
              <span>↕ ENTRY</span>
              <span className="opacity-90 font-normal">
                ({formatPriceDisplay(plannedOrder.entryPrice, symbol)})
              </span>
            </div>
          </div>

          {/* SL Line (Red) */}
          {plannedOrder.slPrice && plannedOrder.slPrice > 0 && (
            <div
              ref={overlaySlRef}
              className="absolute left-0 right-0 flex items-center pointer-events-none"
              style={{ transform: 'translateY(-50%)', display: 'none' }}
            >
              <div className="w-full border-t-2 border-[#EF4444] border-dashed opacity-90" />
              <div
                onPointerDown={(e) => handleDragStart('SL', e)}
                className="absolute left-[140px] bg-[#EF4444] text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 cursor-ns-resize pointer-events-auto select-none touch-none"
              >
                <span>↕ SL</span>
                <span className="opacity-90 font-normal">
                  ({formatPriceDisplay(plannedOrder.slPrice, symbol)})
                </span>
              </div>
            </div>
          )}

          {/* TP Line (Green) */}
          {plannedOrder.tpPrice && plannedOrder.tpPrice > 0 && (
            <div
              ref={overlayTpRef}
              className="absolute left-0 right-0 flex items-center pointer-events-none"
              style={{ transform: 'translateY(-50%)', display: 'none' }}
            >
              <div className="w-full border-t-2 border-[#10B981] border-dashed opacity-90" />
              <div
                onPointerDown={(e) => handleDragStart('TP', e)}
                className="absolute left-[270px] bg-[#10B981] text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1.5 cursor-ns-resize pointer-events-auto select-none touch-none"
              >
                <span>↕ TP</span>
                <span className="opacity-90 font-normal">
                  ({formatPriceDisplay(plannedOrder.tpPrice, symbol)})
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      </div>{/* end chartContainerRef */}

      {/* Loading & Status Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#FAF7EE]/60 backdrop-blur-[1px] flex items-center justify-center z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-[#FFFDEB] border-2 border-[#121212] px-3 py-1.5 shadow-[2px_2px_0px_0px_#121212]">
            <div className="w-3 h-3 border-2 border-[#121212] border-t-transparent animate-spin rounded-full" />
            <span className="text-xs font-bold text-[#121212] uppercase tracking-wider">
              Loading {symbol} ({timeframe})...
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-4 left-4 right-4 bg-[#FEE2E2] border-2 border-[#991B1B] p-2 text-xs font-bold text-[#991B1B] shadow-[2px_2px_0px_0px_#991B1B] z-20">
          ⚠️ {error}
        </div>
      )}

      {appMode === 'selecting' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#FEF08A] border-2 border-[#121212] px-3 py-1 text-xs font-bold text-[#121212] shadow-[2px_2px_0px_0px_#121212] z-20 animate-pulse">
          📍 Klik candle pada chart untuk memilih titik awal Replay
        </div>
      )}
    </div>
  );
};
