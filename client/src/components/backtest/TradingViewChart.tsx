import { AnimatePresence, motion } from 'framer-motion';
import { GripHorizontal, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { getOrderTypeLabel } from './OrderTypes';
import { calculateAdaptiveSlDistance } from '../../shared/backtestEngine';
import React, { useRef, useEffect, useCallback, useState } from 'react';
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
  onPlannedOrderChange?: (newPlanned: { entryPrice: number; slPrice: number; tpPrice: number; lotSize?: number }) => void;
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

// Draw a single handle line + badge on the canvas
function drawHandle(
  ctx: CanvasRenderingContext2D,
  y: number,
  label: string,
  priceText: string,
  color: string,
  borderColor: string,
  shadowColor: string,
  dashed: boolean,
  badgeX: number,
  width: number,
) {
  // Horizontal line
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  if (dashed) {
    ctx.setLineDash([6, 4]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.restore();

  // Badge
  const badgeText = `↕ ${label}  (${priceText})`;
  ctx.save();
  ctx.font = 'bold 11px "JetBrains Mono", "Fira Code", monospace';
  const textW = ctx.measureText(badgeText).width;
  const padX = 8;
  const padY = 4;
  const badgeW = textW + padX * 2;
  const badgeH = 20;
  const bx = badgeX;
  const by = y - badgeH / 2;

  // Shadow (neo-brutalist 1px offset)
  ctx.fillStyle = shadowColor;
  ctx.fillRect(bx + 1, by + 1, badgeW, badgeH);

  // Badge background
  ctx.fillStyle = color;
  ctx.fillRect(bx, by, badgeW, badgeH);

  // Badge border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(bx, by, badgeW, badgeH);

  // Badge text
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, bx + padX, y);
  ctx.restore();
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
  isVisualOrderActive,
  onConfirmVisualOrder,
  onCancelVisualOrder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const dragCanvasRef = useRef<HTMLCanvasElement>(null);
  // Floating Panel State
  const overlayPosRef = useRef<{ x: number; y: number } | null>(null);
  const overlayDragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const [overlayCollapsed, setOverlayCollapsed] = useState<boolean>(false);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const [lotInputStr, setLotInputStr] = useState<string>('0.01');

  // Sync lot input string when plannedOrder changes
  useEffect(() => {
    if (plannedOrder) {
      setLotInputStr(plannedOrder.lotSize.toString());
    } else {
      overlayPosRef.current = null;
    }
  }, [plannedOrder]);

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

  // Dragging state tracking ref
  const activeDragTypeRef = useRef<'ENTRY' | 'SL' | 'TP' | null>(null);
  const prevFollowReplayRef = useRef<boolean>(followReplay);

  const plannedOrderRef = useRef<PlannedOrderPreview | null | undefined>(plannedOrder);
  useEffect(() => {
    plannedOrderRef.current = plannedOrder;
  }, [plannedOrder]);

  // ─── Canvas Redraw ────────────────────────────────────────────────────────
  const redrawDragCanvas = useCallback(() => {
    const canvas = dragCanvasRef.current;
    const series = candleSeriesRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const po = plannedOrderRef.current;
    if (!series || !po || !(po.entryPrice > 0)) return;

    const entryY = series.priceToCoordinate(po.entryPrice);
    const slY = po.slPrice && po.slPrice > 0 ? series.priceToCoordinate(po.slPrice) : null;
    const tpY = po.tpPrice && po.tpPrice > 0 ? series.priceToCoordinate(po.tpPrice) : null;

    // Shaded risk zone (entry↔sl)
    if (entryY !== null && slY !== null) {
      const zoneTop = Math.min(entryY, slY);
      const zoneH = Math.abs(entryY - slY);
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.fillRect(0, zoneTop, w, zoneH);
      ctx.restore();
    }

    // Shaded profit zone (entry↔tp)
    if (entryY !== null && tpY !== null) {
      const zoneTop = Math.min(entryY, tpY);
      const zoneH = Math.abs(entryY - tpY);
      ctx.save();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
      ctx.fillRect(0, zoneTop, w, zoneH);
      ctx.restore();
    }

    // SL line + badge
    if (slY !== null) {
      drawHandle(
        ctx, slY,
        'SL', formatPriceDisplay(po.slPrice ?? 0, symbol),
        '#EF4444', '#DC2626', '#DC2626',
        true, 140, w,
      );
    }

    // TP line + badge
    if (tpY !== null) {
      drawHandle(
        ctx, tpY,
        'TP', formatPriceDisplay(po.tpPrice ?? 0, symbol),
        '#10B981', '#059669', '#059669',
        true, 270, w,
      );
    }

    // Entry line + badge (drawn last so it's on top)
    if (entryY !== null) {
      drawHandle(
        ctx, entryY,
        'ENTRY', formatPriceDisplay(po.entryPrice, symbol),
        '#06B6D4', '#0891B2', '#0891B2',
        false, 12, w,
      );
    }
  }, [symbol]);

  // ─── Initialize Lightweight Chart Engine (v5.2) ───────────────────────────
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
        barSpacing: 10,
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
      borderVisible: false,
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

    // Redraw drag canvas on crosshair move and toggle pointer-events based on handle proximity
    const handleCrosshairMove = (param: any) => {
      redrawDragCanvas();
      // Toggle pointer-events on drag canvas: enable only when cursor is near a handle
      const canvas = dragCanvasRef.current;
      const series = candleSeriesRef.current;
      const po = plannedOrderRef.current;
      if (!canvas || !series || !po || !(po.entryPrice > 0) || activeDragTypeRef.current) return;
      const point = param?.point;
      if (!point) { canvas.style.pointerEvents = 'none'; return; }
      const mouseY = point.y;
      const HIT_RADIUS = 16;
      const entryY = series.priceToCoordinate(po.entryPrice);
      const slY = po.slPrice && po.slPrice > 0 ? series.priceToCoordinate(po.slPrice) : null;
      const tpY = po.tpPrice && po.tpPrice > 0 ? series.priceToCoordinate(po.tpPrice) : null;
      const nearHandle = (entryY !== null && Math.abs(mouseY - entryY) <= HIT_RADIUS)
        || (slY !== null && Math.abs(mouseY - slY) <= HIT_RADIUS)
        || (tpY !== null && Math.abs(mouseY - tpY) <= HIT_RADIUS);
      if (nearHandle) {
        canvas.style.pointerEvents = 'auto';
        canvas.style.cursor = 'ns-resize';
      } else {
        canvas.style.pointerEvents = 'none';
        canvas.style.cursor = 'default';
      }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.timeScale().subscribeVisibleLogicalRangeChange(redrawDragCanvas);

    // Also catch price-axis vertical scale drag (TV doesn't fire the above events for those)
    let priceAxisDragging = false;
    const onChartPointerDown = () => { priceAxisDragging = true; };
    const onChartPointerMove = () => { if (priceAxisDragging) redrawDragCanvas(); };
    const onChartPointerUp = () => { priceAxisDragging = false; };
    const chartEl = chartContainerRef.current;
    chartEl?.addEventListener('pointerdown', onChartPointerDown);
    chartEl?.addEventListener('pointermove', onChartPointerMove, { passive: true });
    chartEl?.addEventListener('pointerup', onChartPointerUp);
    chartEl?.addEventListener('pointercancel', onChartPointerUp);

    // Responsive Auto-Resize — sync both chart and drag canvas
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height });
        const canvas = dragCanvasRef.current;
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
        }
        redrawDragCanvas();
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chartEl?.removeEventListener('pointerdown', onChartPointerDown);
      chartEl?.removeEventListener('pointermove', onChartPointerMove);
      chartEl?.removeEventListener('pointerup', onChartPointerUp);
      chartEl?.removeEventListener('pointercancel', onChartPointerUp);
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(redrawDragCanvas);
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
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

  // Feed Data into Series (Deduplicated & Sorted)
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

    // Redraw drag canvas after candles update (wait for TV to compute layout)
    requestAnimationFrame(() => redrawDragCanvas());
  }, [candles, indicators, redrawDragCanvas]);

  // Redraw drag canvas when plannedOrder changes
  useEffect(() => {
    requestAnimationFrame(() => redrawDragCanvas());
  }, [plannedOrder, redrawDragCanvas]);

  // Render Active Trade Price Lines
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

  // Render Planned Order Price Lines on Right Price Scale (axis labels)
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

  // ─── Drag Capture Phase ──────────────────────────────────────────────────
  const handleContainerPointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const series = candleSeriesRef.current;
    const po = plannedOrderRef.current;
    const container = chartContainerRef.current;

    if (!container || !series || !po || !(po.entryPrice > 0)) return;

    const rect = container.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const HIT_RADIUS = 16;

    const entryY = series.priceToCoordinate(po.entryPrice);
    const slY = po.slPrice && po.slPrice > 0 ? series.priceToCoordinate(po.slPrice) : null;
    const tpY = po.tpPrice && po.tpPrice > 0 ? series.priceToCoordinate(po.tpPrice) : null;

    let hitType: 'ENTRY' | 'SL' | 'TP' | null = null;
    if (entryY !== null && Math.abs(clickY - entryY) <= HIT_RADIUS) hitType = 'ENTRY';
    else if (slY !== null && Math.abs(clickY - slY) <= HIT_RADIUS) hitType = 'SL';
    else if (tpY !== null && Math.abs(clickY - tpY) <= HIT_RADIUS) hitType = 'TP';

    if (hitType) {
      e.preventDefault();
      e.stopPropagation(); // Stop TV from receiving the drag
      activeDragTypeRef.current = hitType;
      
      // Capture pointer so we keep getting move events even if mouse leaves the container
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }, []);

  const handleContainerPointerMoveCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const series = candleSeriesRef.current;
    const po = plannedOrderRef.current;
    const container = chartContainerRef.current;
    if (!container || !series || !po) return;

    // If we are actively dragging, stop TV from getting move events so it doesn't pan
    if (activeDragTypeRef.current) {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const rawPrice = series.coordinateToPrice(relativeY);
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

      requestAnimationFrame(() => redrawDragCanvas());
      return;
    }

    // Dynamic cursor based on hover
    if (!(po.entryPrice > 0)) return;

    const rect = container.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const HIT_RADIUS = 16;

    const entryY = series.priceToCoordinate(po.entryPrice);
    const slY = po.slPrice && po.slPrice > 0 ? series.priceToCoordinate(po.slPrice) : null;
    const tpY = po.tpPrice && po.tpPrice > 0 ? series.priceToCoordinate(po.tpPrice) : null;

    const nearHandle = (entryY !== null && Math.abs(mouseY - entryY) <= HIT_RADIUS)
      || (slY !== null && Math.abs(mouseY - slY) <= HIT_RADIUS)
      || (tpY !== null && Math.abs(mouseY - tpY) <= HIT_RADIUS);

    // Apply cursor to the TV container (or child) so it overrides TV's default crosshair if possible
    // Note: TradingView uses its own cursor, so we might need to force it
    if (nearHandle) {
      container.style.cursor = 'ns-resize';
      // TV child might need it too
      const tvDiv = container.querySelector('.tv-lightweight-charts') as HTMLElement;
      if (tvDiv) tvDiv.style.cursor = 'ns-resize';
    } else {
      container.style.cursor = 'crosshair';
      const tvDiv = container.querySelector('.tv-lightweight-charts') as HTMLElement;
      if (tvDiv) tvDiv.style.cursor = '';
    }
  }, [symbol, onPlannedOrderChange, redrawDragCanvas]);

  const handleContainerPointerUpCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activeDragTypeRef.current) {
      e.stopPropagation();
      activeDragTypeRef.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] flex flex-col bg-[#FAF7EE] select-none"
      onPointerDownCapture={handleContainerPointerDownCapture}
      onPointerMoveCapture={handleContainerPointerMoveCapture}
      onPointerUpCapture={handleContainerPointerUpCapture}
      onPointerCancelCapture={handleContainerPointerUpCapture}
    >
      {/* TradingView Chart Canvas Container — TV owns this div entirely */}
      <div ref={chartContainerRef} className="w-full flex-1 min-h-0" />

      {/* Drag canvas — sibling to chartContainerRef, rendered OUTSIDE TV's container.
          Handles all Entry/SL/TP line drawing and drag interactions via Canvas 2D API. */}
      <canvas
        ref={dragCanvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ zIndex: 20 }}
      />

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

      
      {/* Visual Order Confirmation UI (RESTORED ORIGINAL UI) */}
      {isVisualOrderActive && plannedOrder && (() => {
        const isBuy = plannedOrder.side === 'BUY';
        const sideColor = isBuy ? '#059669' : '#DC2626';
        const sideBg = isBuy ? '#E7F9F0' : '#FDECEC';
        
        return (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 pointer-events-auto w-[340px] max-w-[92vw]">
            <div className="w-full bg-white/95 backdrop-blur-md border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl overflow-hidden">
              
              {/* Header Grip Row */}
              <div className="flex items-center justify-between px-2 py-1.5 bg-[#F0F0F0] border-b-2 border-[#121212] select-none">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 border border-[#121212] rounded"
                    style={{ background: sideBg, color: sideColor }}
                  >
                    {plannedOrder.side}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#717182]">
                    {plannedOrder.orderType ? getOrderTypeLabel(plannedOrder.orderType) : 'Order'}
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="p-2 space-y-1.5">
                  {/* Inline Stats & Lot Row: Entry, R:R, and Lot Size */}
                  <div className="flex items-center justify-between gap-2 border border-[#121212] bg-slate-50 rounded px-2 py-1">
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="text-[8px] font-black uppercase text-[#717182] block leading-none">Entry</span>
                        <span className="font-mono font-black text-xs text-[#121212]">{plannedOrder.entryPrice.toFixed(2)}</span>
                      </div>
                      <div className="border-l border-slate-300 pl-2">
                        <span className="text-[8px] font-black uppercase text-[#717182] block leading-none">R:R</span>
                        <span className="font-mono font-black text-xs text-[#1040C0]">
                          {plannedOrder.rrRatio && plannedOrder.rrRatio > 0 ? `1:${plannedOrder.rrRatio.toFixed(2)}` : '-'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-black uppercase text-[#121212]">Lot:</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={lotInputStr}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLotInputStr(val);
                          const num = parseFloat(val);
                          if (!isNaN(num) && num > 0) {
                            onPlannedOrderChange?.({
                              entryPrice: plannedOrder.entryPrice,
                              slPrice: plannedOrder.slPrice || 0,
                              tpPrice: plannedOrder.tpPrice || 0,
                              lotSize: Math.round(num * 100) / 100,
                            });
                          }
                        }}
                        className="w-14 bg-white border border-[#121212] rounded px-1 py-0.5 text-xs font-mono font-black text-[#121212] outline-none text-center shadow-[1px_1px_0px_0px_#121212]"
                        placeholder="0.01"
                      />
                    </div>
                  </div>

                  {/* Merged SL/Risk & TP/Target Cards */}
                  <div className="flex items-center gap-1.5">
                    {plannedOrder.slPrice && plannedOrder.slPrice > 0 ? (
                      <div className="flex-1 flex items-center justify-between bg-[#FFF0F0] border border-[#DC2626] rounded px-2 py-1 text-xs">
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] uppercase font-black text-[#DC2626]">SL</span>
                            <span className="font-mono font-bold text-xs text-[#121212]">{plannedOrder.slPrice.toFixed(2)}</span>
                          </div>
                          <div className="text-[9px] font-mono font-extrabold text-[#DC2626]">
                            -${plannedOrder.riskAmount.toFixed(2)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onPlannedOrderChange?.({ entryPrice: plannedOrder.entryPrice, slPrice: 0, tpPrice: plannedOrder.tpPrice || 0 }); }}
                          className="w-4 h-4 flex items-center justify-center text-[#DC2626] hover:bg-red-100 rounded-full cursor-pointer font-black text-[10px]"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const dist = calculateAdaptiveSlDistance(candles, plannedOrder.entryPrice, symbol);
                          const newSL = Math.round((isBuy ? plannedOrder.entryPrice - dist : plannedOrder.entryPrice + dist) * 100) / 100;
                          onPlannedOrderChange?.({ entryPrice: plannedOrder.entryPrice, slPrice: newSL, tpPrice: plannedOrder.tpPrice || 0 });
                        }}
                        className="flex-1 min-h-[30px] py-1 px-2 border border-dashed border-[#DC2626] text-[#DC2626] font-bold text-[10px] rounded flex items-center justify-center gap-1 cursor-pointer hover:bg-red-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /><span>+ SL</span>
                      </button>
                    )}

                    {plannedOrder.tpPrice && plannedOrder.tpPrice > 0 ? (
                      <div className="flex-1 flex items-center justify-between bg-[#F0FFF8] border border-[#059669] rounded px-2 py-1 text-xs">
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] uppercase font-black text-[#059669]">TP</span>
                            <span className="font-mono font-bold text-xs text-[#121212]">{plannedOrder.tpPrice.toFixed(2)}</span>
                          </div>
                          <div className="text-[9px] font-mono font-extrabold text-[#059669]">
                            +${(plannedOrder.targetProfit || 0).toFixed(2)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onPlannedOrderChange?.({ entryPrice: plannedOrder.entryPrice, slPrice: plannedOrder.slPrice || 0, tpPrice: 0 }); }}
                          className="w-4 h-4 flex items-center justify-center text-[#059669] hover:bg-green-100 rounded-full cursor-pointer font-black text-[10px]"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const dist = calculateAdaptiveSlDistance(candles, plannedOrder.entryPrice, symbol) * 2;
                          const newTP = Math.round((isBuy ? plannedOrder.entryPrice + dist : plannedOrder.entryPrice - dist) * 100) / 100;
                          onPlannedOrderChange?.({ entryPrice: plannedOrder.entryPrice, slPrice: plannedOrder.slPrice || 0, tpPrice: newTP });
                        }}
                        className="flex-1 min-h-[30px] py-1 px-2 border border-dashed border-[#059669] text-[#059669] font-bold text-[10px] rounded flex items-center justify-center gap-1 cursor-pointer hover:bg-green-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /><span>+ TP</span>
                      </button>
                    )}
                  </div>

                  {/* Validation error */}
                  {plannedOrder.isValid === false && (
                    <div className="p-1.5 bg-[#FFF0F0] border border-[#DC2626] rounded text-[9px] text-[#DC2626] font-medium leading-tight">
                      {plannedOrder.validationError || 'Level harga tidak valid untuk tipe order ini.'}
                    </div>
                  )}

                  {/* Slimmer Action buttons */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCancelVisualOrder?.(); }}
                      className="flex-1 min-h-[30px] py-1 border-2 border-[#121212] bg-white text-[#121212] font-bold text-[10px] uppercase tracking-wider rounded hover:bg-slate-50 active:translate-y-[1px] transition-transform cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={plannedOrder.isValid === false}
                      onClick={(e) => { e.stopPropagation(); onConfirmVisualOrder?.(); }}
                      className={`flex-1 min-h-[30px] py-1 border-2 border-[#121212] font-black text-[10px] uppercase tracking-wider rounded shadow-[2px_2px_0px_0px_#717182] active:shadow-none active:translate-y-[1px] transition-all cursor-pointer ${
                        plannedOrder.isValid === false
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed shadow-none'
                          : 'bg-[#121212] text-white hover:bg-[#2a2a2a]'
                      }`}
                    >
                      Konfirmasi
                    </button>
                  </div>
              </div>
            </div>
          </div>
        );
      })()}


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
