import React, { useRef, useEffect } from 'react';
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
  onPlannedOrderChange?: (newPlanned: any) => void;
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
  plannedOrder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
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

  // 1. Initialize Chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 450,
      layout: {
        background: { type: ColorType.Solid, color: '#FAF7EE' }, // Paper ledger cream
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
        rightOffset: 15,
        fixLeftEdge: false,
        fixRightEdge: false,
        shiftVisibleRangeOnNewBar: true,
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

    // Add Candlestick Series (TradingView v5.2 Standard Colors)
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

    // Add Volume Histogram Series (Overlay at bottom)
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
      color: '#3B82F6', // Blue
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const sma50 = chart.addSeries(LineSeries, {
      color: '#F97316', // Orange
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const sma200 = chart.addSeries(LineSeries, {
      color: '#8B5CF6', // Purple
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

    // Responsive Auto-Resize
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // 2. Feed Data into Series
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    // Deduplicate and strictly sort ascending
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

    if (followReplay && chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [candles, indicators, followReplay]);

  // 3. Render Active Trade Price Lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const s = candleSeriesRef.current;

    // Clean up old lines
    if (activeEntryLineRef.current) { s.removePriceLine(activeEntryLineRef.current); activeEntryLineRef.current = null; }
    if (activeSlLineRef.current) { s.removePriceLine(activeSlLineRef.current); activeSlLineRef.current = null; }
    if (activeTpLineRef.current) { s.removePriceLine(activeTpLineRef.current); activeTpLineRef.current = null; }

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

  // 4. Render Planned Order Price Lines
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const s = candleSeriesRef.current;

    if (plannedEntryLineRef.current) { s.removePriceLine(plannedEntryLineRef.current); plannedEntryLineRef.current = null; }
    if (plannedSlLineRef.current) { s.removePriceLine(plannedSlLineRef.current); plannedSlLineRef.current = null; }
    if (plannedTpLineRef.current) { s.removePriceLine(plannedTpLineRef.current); plannedTpLineRef.current = null; }

    if (plannedOrder) {
      plannedEntryLineRef.current = s.createPriceLine({
        price: plannedOrder.entryPrice,
        color: '#F59E0B',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `PLAN ${plannedOrder.side} ${plannedOrder.lotSize}L`,
      });
      if (plannedOrder.slPrice) {
        plannedSlLineRef.current = s.createPriceLine({
          price: plannedOrder.slPrice,
          color: '#EF4444',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'PLAN SL',
        });
      }
      if (plannedOrder.tpPrice) {
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

  return (
    <div className="relative w-full h-full min-h-[400px] flex flex-col bg-[#FAF7EE] select-none">
      {/* Chart Canvas Container */}
      <div ref={containerRef} className="w-full flex-1 min-h-0 relative" />

      {/* Loading & Status Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#FAF7EE]/60 backdrop-blur-[1px] flex items-center justify-center z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-[#FFFDEB] border-2 border-[#121212] px-3 py-1.5 shadow-[2px_2px_0px_0px_#121212]">
            <div className="w-3 h-3 border-2 border-[#121212] border-t-transparent animate-spin rounded-full" />
            <span className="text-xs font-bold text-[#121212] uppercase tracking-wider">Loading {symbol} ({timeframe})...</span>
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
