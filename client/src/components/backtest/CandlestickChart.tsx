import React, { useRef, useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Settings, Trash2, Plus, X, RotateCcw, Check, Zap, Edit3, XCircle } from 'lucide-react';
import {
  calculateFibonacciLevels,
  calculatePositionToolGeometry,
  updatePositionToolHandle,
  getDefaultSlDistance,
  ChartTimeframe,
  TradeSide,
} from '../../../../server/src/services/backtestEngine';
import {
  OrderExecutionType,
  PendingOrderRecord,
  getOrderTypeLabel,
} from './OrderTypes';

export type AppMode = 'analysis' | 'selecting' | 'replay';

export interface ChartCandle {
  time: string | Date;
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

export type DrawingTool =
  | 'cursor'
  | 'crosshair'
  | 'hline'
  | 'vline'
  | 'trendline'
  | 'rect'
  | 'fibonacci'
  | 'measure'
  | 'long_position'
  | 'short_position';

export interface FibLevelConfig {
  value: number;
  visible: boolean;
  color?: string;
}

export const DEFAULT_FIBONACCI_LEVELS: FibLevelConfig[] = [
  { value: 0.0, visible: true, color: '#787B86' },
  { value: 0.236, visible: true, color: '#F23645' },
  { value: 0.382, visible: true, color: '#FF9800' },
  { value: 0.5, visible: true, color: '#4CAF50' },
  { value: 0.618, visible: true, color: '#089981' },
  { value: 0.705, visible: true, color: '#2962FF' },
  { value: 0.786, visible: true, color: '#AB47BC' },
  { value: 1.0, visible: true, color: '#787B86' },
];

export interface DrawingItem {
  id: string;
  type: DrawingTool;
  startTime?: number;
  startPrice?: number;
  endTime?: number;
  endPrice?: number;
  price?: number;
  time?: number;
  slPrice?: number;
  tpPrice?: number;
  lockRR?: boolean;
  color?: string;
  fibLevels?: FibLevelConfig[];
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

interface CandlestickChartProps {
  candles: ChartCandle[];
  timeframe?: ChartTimeframe;
  appMode?: AppMode;
  activeTrade?: ActiveTradeMarker | null;
  activeTrades?: ActiveTradeMarker[];
  pendingOrders?: PendingOrderRecord[];
  onCancelPendingOrder?: (id: string) => void;
  onEditPendingOrder?: (order: PendingOrderRecord) => void;
  onCloseActiveTrade?: () => void;
  plannedOrder?: PlannedOrderPreview | null;
  onPlannedOrderChange?: (newPlanned: { entryPrice: number; slPrice: number; tpPrice: number }) => void;
  symbol?: string;
  indicators?: ChartIndicators;
  onIndicatorsChange?: (indicators: ChartIndicators) => void;
  activeTool?: DrawingTool;
  onToolChange?: (tool: DrawingTool) => void;
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
  onExecutePlannedTrade?: (position: DrawingItem) => void;
  isVisualOrderActive?: boolean;
  onConfirmVisualOrder?: () => void;
  onCancelVisualOrder?: () => void;
}

interface DraggingHandleState {
  drawingId: string;
  handleType: 'P1' | 'P2' | 'ENTRY' | 'SL' | 'TP' | 'WIDTH' | 'MOVE_ALL';
  initialDrawing: DrawingItem;
  startMousePrice: number;
  startMouseTime: number;
}

interface VP {
  cssW: number;
  cssH: number;
  priceScaleW: number;
  timeScaleH: number;
  volH: number;
  chartW: number;
  mainH: number;
  candleH: number;
  cw: number;
  slot: number;
  rightMargin: number;
  startIdx: number;
  endIdx: number;
  paddedMin: number;
  paddedMax: number;
  totalRange: number;
  priceZoom: number;
  pricePanOffset: number;
  panOffsetX: number;
  getX: (gIdx: number) => number;
  getY: (price: number) => number;
  timeToGIdx: (ms: number) => number;
  timeToX: (ms: number) => number;
  xToGIdx: (x: number) => number;
  xToTime: (x: number) => number;
  yToPrice: (y: number) => number;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles,
  timeframe = 'M1',
  appMode = 'analysis',
  activeTrade,
  activeTrades,
  pendingOrders = [],
  onCancelPendingOrder,
  onEditPendingOrder,
  onCloseActiveTrade,
  plannedOrder,
  onPlannedOrderChange,
  symbol = 'XAUUSD',
  indicators = { sma20: true, sma50: true, sma200: false },
  onIndicatorsChange,
  activeTool = 'cursor',
  onToolChange,
  drawings = [],
  onDrawingsChange,
  selectedDrawingId = null,
  onSelectDrawing,
  onReplaySelectionClick,
  onSelectionTimeChange,
  onLoadOlderCandles,
  onLoadNewerCandles,
  followReplay = true,
  onDisableFollowReplay,
  lockRR = false,
  isFullscreen = false,
  onExecutePlannedTrade,
  isVisualOrderActive = false,
  onConfirmVisualOrder,
  onCancelVisualOrder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vpRef = useRef<VP | null>(null);
  const plannedDragHandleRef = useRef<{
    type: 'ENTRY' | 'SL' | 'TP';
    startMousePrice: number;
    startEntry: number;
    startSL: number;
    startTP: number;
  } | null>(null);

  // Container dimensions tracked by ResizeObserver
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 900, height: 500 });

  // Camera & Viewport State (Canonical Pixel-Based Viewport)
  const [candleWidth, setCandleWidth] = useState<number>(8);
  const [panOffsetX, setPanOffsetX] = useState<number>(0);
  const [priceZoom, setPriceZoom] = useState<number>(1.0);
  const [pricePanOffset, setPricePanOffset] = useState<number>(0);

  const cwRef = useRef<number>(8);
  const panXRef = useRef<number>(0);
  const pzRef = useRef<number>(1.0);
  const poRef = useRef<number>(0);
  const lastFetchCheckRef = useRef<number>(0);

  cwRef.current = candleWidth;
  panXRef.current = panOffsetX;
  pzRef.current = priceZoom;
  poRef.current = pricePanOffset;

  // Multi-Touch & Pinch Zoom Tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartCWRef = useRef<number>(8);
  const pinchMidRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interaction Drag States
  const dragModeRef = useRef<'NONE' | 'PAN_CHART' | 'SCALE_PRICE' | 'SCALE_TIME' | 'DRAWING_HANDLE' | 'PINCH_ZOOM' | 'PLANNED_ORDER_HANDLE'>('NONE');
  const panStartRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const priceScaleStartRef = useRef<{ startY: number; startPZ: number } | null>(null);
  const timeScaleStartRef = useRef<{ startX: number; startCW: number } | null>(null);

  // Drawings in ref for real-time pointer interactions
  const drawingsRef = useRef<DrawingItem[]>(drawings);
  drawingsRef.current = drawings;

  // Active Draft
  const [drawingDraft, setDrawingDraft] = useState<DrawingItem | null>(null);
  const draftRef = useRef<DrawingItem | null>(null);
  draftRef.current = drawingDraft;
  const draftStartMouseRef = useRef<{ x: number; y: number } | null>(null);

  // Active Handle Drag
  const draggingHandleRef = useRef<DraggingHandleState | null>(null);

  // Cursor & Hover
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<ChartCandle | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string>('default');

  // Context Menu & Double Click
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chartTime: number; chartPrice: number } | null>(null);
  const [dblConfirm, setDblConfirm] = useState<{ time: Date; price: number } | null>(null);
  const [fibSettingsOpen, setFibSettingsOpen] = useState<boolean>(false);

  // Selected Placed Order on Chart (for Edit / Delete)
  const [selectedPendingOrderId, setSelectedPendingOrderId] = useState<string | null>(null);
  const [isActiveTradeSelected, setIsActiveTradeSelected] = useState<boolean>(false);
  const selectedPendingOrder = pendingOrders.find((p) => p.id === selectedPendingOrderId) || null;

  const candlesRef = useRef<ChartCandle[]>(candles);
  candlesRef.current = candles;

  const tradesList: ActiveTradeMarker[] = (activeTrades && activeTrades.length > 0)
    ? activeTrades
    : (activeTrade ? [activeTrade] : []);
  const activeTradesRef = useRef(tradesList);
  activeTradesRef.current = tradesList;
  const activeTradeRef = useRef(activeTrade);
  activeTradeRef.current = activeTrade;

   const prevCandlesRef = useRef<ChartCandle[]>(candles);
   const lastPanAnchorRef = useRef<{ time: number; x: number } | null>(null);


  // Preserve user's viewport on data prepend / append
  useEffect(() => {
    const prev = prevCandlesRef.current;
    prevCandlesRef.current = candles;

    if (prev.length === 0 || candles.length === 0) return;

    const prevFirstTime = new Date(prev[0].time).getTime();
    const prevLastTime = new Date(prev[prev.length - 1].time).getTime();
    const curFirstTime = new Date(candles[0].time).getTime();
    const curLastTime = new Date(candles[candles.length - 1].time).getTime();

    // Case 1: Newer candles appended at the end
    if (curLastTime > prevLastTime) {
      let appendedCount = 0;
      for (let i = candles.length - 1; i >= 0; i--) {
        if (new Date(candles[i].time).getTime() === prevLastTime) {
          appendedCount = candles.length - 1 - i;
          break;
        }
      }

      if (appendedCount > 0) {
        if (appMode === 'replay' && followReplay) {
          panXRef.current = 0;
          setPanOffsetX(0);
        } else {
          const cw = cwRef.current;
          const slot = cw + Math.max(1, cw * 0.2);
          const deltaPixels = appendedCount * slot;
          // If actively dragging, compensate startPanX so mouse tracking never skips!
          if (panStartRef.current) {
            panStartRef.current.startPanX += deltaPixels;
          }
          panXRef.current += deltaPixels;
          setPanOffsetX((cur) => cur + deltaPixels);
        }
      }
    }
    // Case 2: Prepending older candles to index 0.
    // In our canonical projection formula, (gIdx - lastGlobalIdx) is invariant when items
    // are prepended to the array (both gIdx and lastGlobalIdx increase by prependedCount).
    // Hence, no pixel offset adjustment is needed and zero teleport occurs.
  }, [candles, appMode, followReplay]);

  // When toggling followReplay explicitly in replay mode
  useEffect(() => {
    if (appMode === 'replay' && followReplay) {
      panXRef.current = 0;
      setPanOffsetX(0);
    }
  }, [followReplay, appMode]);

  // ResizeObserver on the canvas wrapper element to guarantee exact viewport dimensions (excluding HUD)
  useEffect(() => {
    const target = canvasWrapperRef.current || containerRef.current;
    if (!target) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // SMAs calculated strictly without look-ahead
  const computeSMA = useCallback((period: number): Array<number | null> => {
    const out: Array<number | null> = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close;
      if (i >= period) sum -= candles[i - period].close;
      out.push(i >= period - 1 ? sum / period : null);
    }
    return out;
  }, [candles]);

  const sma20v = indicators.sma20 ? computeSMA(20) : [];
  const sma50v = indicators.sma50 ? computeSMA(50) : [];
  const sma200v = indicators.sma200 ? computeSMA(200) : [];

  // ── Build Viewport Projection (Canonical Pixel-Based Viewport) ──
  const buildVP = useCallback((cssW: number, cssH: number): VP => {
    const cw = cwRef.current;
    const panX = panXRef.current;
    const pz = pzRef.current;
    const po = poRef.current;

    const priceScaleW = 76;
    const timeScaleH = 26;
    const volH = Math.min(60, (cssH - timeScaleH) * 0.13);
    const chartW = Math.max(50, cssW - priceScaleW);
    const mainH = Math.max(50, cssH - timeScaleH);
    const candleH = Math.max(40, mainH - volH);

    const spacing = Math.max(1, cw * 0.2);
    const slot = cw + spacing;
    const rightMargin = Math.max(35, slot * 6);

    const lastGlobalIdx = Math.max(0, candles.length - 1);

    // Canonical Projection:
    // 1 px pointer movement = 1 px visual chart movement.
    const getX = (gIdx: number): number => {
      return chartW - rightMargin + (gIdx - lastGlobalIdx) * slot + panX + slot / 2;
    };

    // Inverse Projection: exact mathematical inverse
    const xToGIdx = (x: number): number => {
      return lastGlobalIdx + (x - (chartW - rightMargin) - panX - slot / 2) / slot;
    };

    // Derived visible index bounds directly from screen boundaries:
    const gIdxLeft = xToGIdx(0);
    const gIdxRight = xToGIdx(chartW);
    const startIdx = Math.max(0, Math.floor(gIdxLeft) - 5);
    const endIdx = Math.min(lastGlobalIdx, Math.ceil(gIdxRight) + 5);
    const vis = candles.slice(startIdx, Math.min(candles.length, endIdx + 1));

    // Dynamic Price Range Calculation
    let minP = Infinity, maxP = -Infinity;
    for (const c of vis) {
      if (c.low > 0 && c.low < minP) minP = c.low;
      if (c.high > 0 && c.high > maxP) maxP = c.high;
    }
    if (!isFinite(minP) || minP <= 0 || maxP <= minP) {
      const fallbackPrice = candles.length > 0 ? candles[candles.length - 1].close : 3000;
      minP = fallbackPrice * 0.99;
      maxP = fallbackPrice * 1.01;
    }

    if (tradesList.length > 0) {
      const mid = (maxP + minP) / 2;
      const span = Math.max(1, maxP - minP);
      for (const t of tradesList) {
        if (t.entryPrice > 0 && Math.abs(t.entryPrice - mid) < span * 4) {
          minP = Math.min(minP, t.entryPrice);
          maxP = Math.max(maxP, t.entryPrice);
        }
        if (t.slPrice > 0 && Math.abs(t.slPrice - mid) < span * 4) {
          minP = Math.min(minP, t.slPrice);
          maxP = Math.max(maxP, t.slPrice);
        }
        if (t.tpPrice > 0 && Math.abs(t.tpPrice - mid) < span * 4) {
          minP = Math.min(minP, t.tpPrice);
          maxP = Math.max(maxP, t.tpPrice);
        }
      }
    }

    const midPrice = (maxP + minP) / 2;
    const baseRange = Math.max(0.5, maxP - minP);
    const scaledRange = (baseRange * 1.16) / Math.max(0.1, pz);
    const paddedMin = midPrice - scaledRange / 2 + po;
    const paddedMax = midPrice + scaledRange / 2 + po;
    const totalRange = Math.max(0.1, paddedMax - paddedMin);

    const getY = (price: number) => {
      return ((paddedMax - price) / totalRange) * (candleH - 20) + 10;
    };

    const yToPrice = (y: number) => {
      return paddedMax - ((y - 10) / (candleH - 20)) * totalRange;
    };

    const timeToGIdx = (ms: number): number => {
      if (candles.length === 0) return 0;
      if (candles.length === 1) return 0;
      const t0 = new Date(candles[0].time).getTime();
      const tEnd = new Date(candles[candles.length - 1].time).getTime();
      const avgInterval = Math.max(1000, (tEnd - t0) / Math.max(1, candles.length - 1));

      if (ms <= t0) return (ms - t0) / avgInterval;
      if (ms >= tEnd) return (candles.length - 1) + (ms - tEnd) / avgInterval;

      let low = 0, high = candles.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const tMid = new Date(candles[mid].time).getTime();
        if (tMid === ms) return mid;
        if (tMid < ms) low = mid + 1;
        else high = mid - 1;
      }
      const i1 = Math.max(0, Math.min(candles.length - 1, high));
      const i2 = Math.max(0, Math.min(candles.length - 1, low));
      const t1 = new Date(candles[i1].time).getTime();
      const t2 = new Date(candles[i2].time).getTime();
      if (t2 === t1) return i1;
      return i1 + ((ms - t1) / (t2 - t1)) * (i2 - i1);
    };

    const timeToX = (ms: number): number => {
      const gIdx = timeToGIdx(ms);
      return getX(gIdx);
    };

    const xToTime = (x: number): number => {
      const gIdx = xToGIdx(x);
      if (candles.length === 0) return Date.now();
      const t0 = new Date(candles[0].time).getTime();
      const tEnd = new Date(candles[candles.length - 1].time).getTime();
      const avgInterval = Math.max(1000, (tEnd - t0) / Math.max(1, candles.length - 1));

      if (gIdx <= 0) {
        return t0 + gIdx * avgInterval;
      }
      if (gIdx >= candles.length - 1) {
        return tEnd + (gIdx - (candles.length - 1)) * avgInterval;
      }
      const base = Math.floor(gIdx);
      const frac = gIdx - base;
      const t1 = new Date(candles[base].time).getTime();
      const t2 = new Date(candles[base + 1].time).getTime();
      return Math.round(t1 + frac * (t2 - t1));
    };

    return {
      cssW, cssH, priceScaleW, timeScaleH, volH, chartW, mainH, candleH,
      cw, slot, rightMargin, startIdx, endIdx, paddedMin, paddedMax, totalRange,
      priceZoom: pz, pricePanOffset: po, panOffsetX: panX,
      getX, getY, timeToGIdx, timeToX, xToGIdx, xToTime, yToPrice,
    };
  }, [candles, activeTrade, activeTrades]);

  // ── Main Render Loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = dimensions.width || 900;
    const cssH = dimensions.height || 500;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.scale(dpr, dpr);

    const vp = buildVP(cssW, cssH);
    vpRef.current = vp;
    const { priceScaleW, timeScaleH, volH, chartW, mainH, cw, startIdx, endIdx, paddedMin, paddedMax, totalRange, getX, getY, timeToX } = vp;

    const vis = candles.slice(startIdx, Math.min(candles.length, endIdx + 1));
    let maxVol = 0;
    for (const c of vis) { if ((c.tickVolume || 0) > maxVol) maxVol = c.tickVolume || 0; }

    // 1. Chart Background
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, cssW, cssH);

    // Price Scale & Time Scale Backgrounds
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(chartW, 0, priceScaleW, cssH);
    ctx.fillRect(0, mainH, chartW, timeScaleH);

    if (candles.length === 0) {
      ctx.fillStyle = '#64748B'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Memuat data Dukascopy XAUUSD...', cssW / 2, cssH / 2);
      return;
    }

    // 2. Adaptive TradingView-style Price Grid Lines & Complete Right Price Scale
    const targetTickCount = Math.max(10, Math.min(24, Math.floor(mainH / 32)));
    const rawStep = totalRange / targetTickCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep > 0 ? rawStep : 1)));
    const norm = rawStep / mag;
    let niceNorm = 1;
    if (norm > 5) niceNorm = 10;
    else if (norm > 2.5) niceNorm = 5;
    else if (norm > 1.5) niceNorm = 2;
    else niceNorm = 1;
    const priceStep = Math.max(0.05, niceNorm * mag);
    const firstTick = Math.ceil(paddedMin / priceStep) * priceStep;
    const decimals = priceStep < 0.1 ? 3 : priceStep < 1 ? 2 : (priceStep % 1 !== 0 ? 1 : 2);

    for (let p = firstTick; p <= paddedMax + priceStep * 0.01; p += priceStep) {
      const y = getY(p);
      if (y < 0 || y > mainH) continue;

      // Subtle horizontal grid line across the chart
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();

      // Tick notch mark on the right scale border
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartW, y);
      ctx.lineTo(chartW + 4, y);
      ctx.stroke();

      // Complete, crisp price scale label
      ctx.fillStyle = '#475569';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(decimals), chartW + 7, y + 3.5);
    }

    // Scale separator borders
    ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, cssH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, mainH); ctx.lineTo(cssW, mainH); ctx.stroke();

    // 3. Adaptive Time Scale Labels
    const tStep = Math.max(1, Math.floor(vis.length / 7));
    for (let i = 0; i < vis.length; i += tStep) {
      const x = getX(startIdx + i);
      if (x < 0 || x > chartW) continue;
      ctx.strokeStyle = '#E2E8F0';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
      ctx.fillStyle = '#64748B'; ctx.font = '10px monospace'; ctx.textAlign = 'center';

      // Adaptive format depending on candle width
      const labelFmt = cw > 12 ? 'MM/dd HH:mm' : cw > 5 ? 'dd HH:mm' : 'MM/dd';
      ctx.fillText(format(new Date(vis[i].time), labelFmt), x, cssH - 7);
    }

    // 4. Volume Separator & Bars (Clipped strictly to chart viewport)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartW, mainH);
    ctx.clip();

    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mainH - volH); ctx.lineTo(chartW, mainH - volH); ctx.stroke();

    for (let i = 0; i < vis.length; i++) {
      const c = vis[i];
      const x = getX(startIdx + i);
      if (x < -cw || x > chartW + cw) continue;
      const vol = c.tickVolume || 0;
      const h = maxVol > 0 ? (vol / maxVol) * (volH - 6) : 0;
      ctx.fillStyle = c.close >= c.open ? 'rgba(16,185,129,.22)' : 'rgba(239,68,68,.22)';
      ctx.fillRect(x - cw / 2, mainH - h, cw, h);
    }

    // 5. Candlesticks (OHLC)
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i];
      const x = getX(startIdx + i);
      if (x < -cw || x > chartW) continue;
      const oY = getY(c.open), cY = getY(c.close);
      const hY = getY(c.high), lY = getY(c.low);
      const bull = c.close >= c.open;
      const col = bull ? '#10B981' : '#EF4444';
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.lineWidth = Math.max(0.8, cw * 0.1);
      ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();
      ctx.fillRect(x - cw / 2, Math.min(oY, cY), cw, Math.max(1, Math.abs(cY - oY)));
    }

    // 6. Indicators (SMAs)
    const drawSMA = (vals: (number | null)[], color: string, lw: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); let started = false;
      for (let i = 0; i < vis.length; i++) {
        const v = vals[startIdx + i];
        if (v == null) continue;
        const x = getX(startIdx + i), y = getY(v);
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      }
      if (started) ctx.stroke();
    };
    if (sma20v.length) drawSMA(sma20v, '#F59E0B', 1.5);
    if (sma50v.length) drawSMA(sma50v, '#38BDF8', 1.5);
    if (sma200v.length) drawSMA(sma200v, '#C084FC', 2);

    // 7. Interactive Drawings
    const allDrawings = draftRef.current ? [...drawings, draftRef.current] : drawings;
    for (const d of allDrawings) {
      const isSel = selectedDrawingId === d.id;
      ctx.strokeStyle = d.color || (isSel ? '#60A5FA' : '#FCD34D');
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.setLineDash([]);

      if (d.type === 'hline' && d.price != null) {
        const y = getY(d.price);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
        ctx.fillStyle = isSel ? '#1D4ED8' : '#92400E';
        ctx.fillRect(chartW + 2, y - 9, priceScaleW - 4, 18);
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(d.price.toFixed(2), chartW + priceScaleW / 2, y + 4);

        if (isSel) {
          ctx.fillStyle = '#60A5FA';
          ctx.beginPath(); ctx.arc(chartW / 2, y, 6, 0, Math.PI * 2); ctx.fill();
        }
      } else if (d.type === 'vline' && d.time != null) {
        const x = timeToX(d.time);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
        if (isSel) {
          ctx.fillStyle = '#60A5FA';
          ctx.beginPath(); ctx.arc(x, mainH / 2, 6, 0, Math.PI * 2); ctx.fill();
        }
      } else if ((d.type === 'trendline' || d.type === 'rect' || d.type === 'fibonacci' || d.type === 'measure') &&
        d.startTime != null && d.startPrice != null && d.endTime != null && d.endPrice != null) {
        const x1 = timeToX(d.startTime), y1 = getY(d.startPrice);
        const x2 = timeToX(d.endTime),   y2 = getY(d.endPrice);

        if (d.type === 'trendline') {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          if (isSel) {
            [{ x: x1, y: y1 }, { x: x2, y: y2 }].forEach(({ x, y }) => {
              ctx.fillStyle = '#60A5FA';
              ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5; ctx.stroke();
            });
          }
        } else if (d.type === 'rect') {
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          ctx.fillStyle = isSel ? 'rgba(96,165,250,.2)' : 'rgba(252,211,77,.12)';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
          if (isSel) {
            [{ x: x1, y: y1 }, { x: x2, y: y2 }].forEach(({ x, y }) => {
              ctx.fillStyle = '#60A5FA';
              ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5; ctx.stroke();
            });
          }
        } else if (d.type === 'measure') {
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          ctx.fillStyle = 'rgba(56,189,248,0.18)';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = '#38BDF8';
          ctx.strokeRect(rx, ry, rw, rh);

          // Measure stats
          const dPrice = d.endPrice - d.startPrice;
          const pPct = ((dPrice / d.startPrice) * 100).toFixed(2);
          const pPips = (dPrice * 10).toFixed(1);
          const dBars = Math.abs(Math.round((x2 - x1) / vp.slot));

          ctx.fillStyle = '#0F172A';
          ctx.fillRect((x1 + x2) / 2 - 60, (y1 + y2) / 2 - 20, 120, 40);
          ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 1;
          ctx.strokeRect((x1 + x2) / 2 - 60, (y1 + y2) / 2 - 20, 120, 40);
          ctx.fillStyle = dPrice >= 0 ? '#34D399' : '#F87171';
          ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
          ctx.fillText(`${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(2)} (${pPct}%)`, (x1 + x2) / 2, (y1 + y2) / 2 - 4);
          ctx.fillStyle = '#94A3B8'; ctx.font = '9px monospace';
          ctx.fillText(`${dBars} bars • ${pPips} pips`, (x1 + x2) / 2, (y1 + y2) / 2 + 10);
        } else {
          // TradingView-Style Fibonacci Retracement
          const levels: FibLevelConfig[] = d.fibLevels && d.fibLevels.length > 0 ? d.fibLevels : DEFAULT_FIBONACCI_LEVELS;
          const diff = d.endPrice - d.startPrice;
          const lx = Math.min(x1, x2);
          const rx = Math.max(x1, x2);
          const rightExtent = Math.min(chartW - 4, Math.max(rx + 40, rx + (rx - lx) * 0.25));

          // 1. Subtle diagonal trendline between anchor points
          ctx.save();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();

          // 2. Shaded bands between key adjacent visible levels
          const visLevels = levels.filter((l) => l.visible).sort((a, b) => a.value - b.value);
          for (let bi = 0; bi < visLevels.length - 1; bi++) {
            const lA = visLevels[bi];
            const lB = visLevels[bi + 1];
            const pA = d.startPrice + diff * lA.value;
            const pB = d.startPrice + diff * lB.value;
            const yA = getY(pA);
            const yB = getY(pB);
            const topY = Math.min(yA, yB);
            const bandH = Math.abs(yA - yB);

            // Golden pocket highlight (around 0.5 to 0.618 or 0.705)
            if (Math.abs(lA.value - 0.5) < 0.02 && Math.abs(lB.value - 0.618) < 0.02) {
              ctx.fillStyle = 'rgba(8, 153, 129, 0.16)';
            } else if (lA.value >= 0.382 && lB.value <= 0.786) {
              ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
            } else {
              ctx.fillStyle = 'rgba(148, 163, 184, 0.025)';
            }
            ctx.fillRect(lx, topY, rightExtent - lx, bandH);
          }

          // 3. Level lines & Ratio/Price labels
          visLevels.forEach((fl) => {
            const price = d.startPrice! + diff * fl.value;
            const fy = getY(price);
            const color = fl.color || '#F59E0B';

            ctx.strokeStyle = color;
            ctx.lineWidth = isSel ? 1.5 : 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(lx, fy);
            ctx.lineTo(rightExtent, fy);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label: Ratio + Price
            ctx.fillStyle = color;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'left';
            const labelText = `${fl.value.toFixed(3)}  ${price.toFixed(2)}`;
            ctx.fillText(labelText, lx + 6, fy - 3);
          });

          // 4. Anchor Handles when selected
          if (isSel) {
            [{ x: x1, y: y1, label: 'P1' }, { x: x2, y: y2, label: 'P2' }].forEach(({ x, y, label }) => {
              ctx.fillStyle = '#2563EB';
              ctx.beginPath();
              ctx.arc(x, y, 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 2;
              ctx.stroke();

              ctx.fillStyle = '#93C5FD';
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'center';
              ctx.fillText(label, x, y - 9);
            });
          }
        }
      } else if ((d.type === 'long_position' || d.type === 'short_position') &&
        d.startTime != null && d.startPrice != null && d.slPrice != null && d.tpPrice != null) {
        const isLong = d.type === 'long_position';
        const eY = getY(d.startPrice);
        const slY = getY(d.slPrice);
        const tpY = getY(d.tpPrice);
        const px = timeToX(d.startTime);
        const endX = d.endTime ? timeToX(d.endTime) : px + 150;
        const boxW = Math.min(240, Math.max(120, endX - px));

        const rPts = Math.abs(d.startPrice - d.slPrice);
        const rwPts = Math.abs(d.tpPrice - d.startPrice);
        const rr = rPts > 0 ? (rwPts / rPts).toFixed(2) : '0.00';

        // 1. Shaded Profit Zone
        const profTop = Math.min(eY, tpY);
        const profH = Math.max(1, Math.abs(tpY - eY));
        ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
        ctx.fillRect(px, profTop, boxW, profH);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(px, profTop, boxW, profH);

        // 2. Shaded Risk Zone
        const riskTop = Math.min(eY, slY);
        const riskH = Math.max(1, Math.abs(slY - eY));
        ctx.fillStyle = 'rgba(239, 68, 68, 0.16)';
        ctx.fillRect(px, riskTop, boxW, riskH);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(px, riskTop, boxW, riskH);

        // 3. Entry Line (Prominent)
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, eY);
        ctx.lineTo(px + boxW, eY);
        ctx.stroke();

        // 4. Compact Non-Intrusive Risk:Reward Badge
        const centerX = px + boxW / 2;
        const totalTop = Math.min(tpY, slY, eY);
        const totalBottom = Math.max(tpY, slY, eY);
        const centerY = (totalTop + totalBottom) / 2;

        const badgeW = 74;
        const badgeH = 20;
        ctx.save();
        ctx.fillStyle = '#0F172A';
        const rx = centerX - badgeW / 2, ry = centerY - badgeH / 2;
        ctx.beginPath();
        ctx.roundRect(rx, ry, badgeW, badgeH, 3);
        ctx.fill();
        ctx.strokeStyle = isSel ? '#38BDF8' : '#334155';
        ctx.lineWidth = isSel ? 1.5 : 1;
        ctx.stroke();

        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 9.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`RR 1 : ${rr}`, centerX, ry + 14);
        ctx.restore();

        // 5. Profit Area Metrics Tag (inside profit zone)
        const profMidY = (eY + tpY) / 2;
        if (profH > 22) {
          ctx.save();
          ctx.font = 'bold 9.5px monospace';
          ctx.fillStyle = '#34D399';
          ctx.textAlign = 'left';
          ctx.fillText(`Target: +${rwPts.toFixed(2)} pts`, px + 8, profMidY + 3);
          ctx.restore();
        }

        // 6. Risk Area Metrics Tag (inside risk zone)
        const riskMidY = (eY + slY) / 2;
        if (riskH > 22) {
          ctx.save();
          ctx.font = 'bold 9.5px monospace';
          ctx.fillStyle = '#F87171';
          ctx.textAlign = 'left';
          ctx.fillText(`Stop: -${rPts.toFixed(2)} pts`, px + 8, riskMidY + 3);
          ctx.restore();
        }

        // 7. Right-Edge Price Pills with Intelligent Collision Avoidance
        const drawPricePill = (yPos: number, text: string, bgColor: string, textColor: string) => {
          ctx.save();
          ctx.font = 'bold 9px monospace';
          const txtW = ctx.measureText(text).width;
          const pW = txtW + 10;
          const pH = 17;
          const pillX = px + boxW - pW - 4;
          const pillY = yPos - pH / 2;
          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pW, pH, 3);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = textColor;
          ctx.textAlign = 'center';
          ctx.fillText(text, pillX + pW / 2, pillY + 12);
          ctx.restore();
        };

        // Calculate anti-collision Y offsets
        let tpPillY = tpY;
        let entryPillY = eY;
        let slPillY = slY;
        const minGap = 20;

        if (isLong) {
          if (entryPillY - tpPillY < minGap) tpPillY = entryPillY - minGap;
          if (slPillY - entryPillY < minGap) slPillY = entryPillY + minGap;
        } else {
          if (entryPillY - slPillY < minGap) slPillY = entryPillY - minGap;
          if (tpPillY - entryPillY < minGap) tpPillY = entryPillY + minGap;
        }

        drawPricePill(tpPillY, `TP ${d.tpPrice.toFixed(2)}`, '#065F46', '#34D399');
        drawPricePill(entryPillY, `ENTRY ${d.startPrice.toFixed(2)}`, '#0369A1', '#7DD3FC');
        drawPricePill(slPillY, `SL ${d.slPrice.toFixed(2)}`, '#881337', '#FDA4AF');

        // 8. Draggable Handles when Selected
        if (isSel) {
          const handles = [
            { y: tpY, color: '#10B981', label: 'TP' },
            { y: eY, color: '#38BDF8', label: 'ENTRY' },
            { y: slY, color: '#EF4444', label: 'SL' },
          ];
          const hx = px + 28;
          handles.forEach(({ y: hy, color, label }) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(hx, hy, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(label, hx, hy + 2.5);
          });

          // Width handle at right edge
          ctx.fillStyle = '#2563EB';
          ctx.beginPath();
          ctx.arc(px + boxW, eY, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // 8. Active Trades Overlay with Risk/Reward Zones
    if (tradesList.length > 0) {
      tradesList.forEach((trade, tIdx) => {
        const eY = getY(trade.entryPrice);
        const slY = getY(trade.slPrice);
        const tpY = getY(trade.tpPrice);
        const prefix = tradesList.length > 1 ? `#${tIdx + 1} ` : '';

        // Shaded Profit Zone
        ctx.fillStyle = 'rgba(16,185,129,0.10)';
        ctx.fillRect(0, Math.min(eY, tpY), chartW, Math.abs(tpY - eY));

        // Shaded Risk Zone
        ctx.fillStyle = 'rgba(239,68,68,0.10)';
        ctx.fillRect(0, Math.min(eY, slY), chartW, Math.abs(slY - eY));

        ctx.setLineDash([4, 4]);
        const lines = [
          { p: trade.entryPrice, c: '#06B6D4', l: `${prefix}ENTRY (${trade.volume}L)` },
          { p: trade.slPrice,    c: '#EF4444', l: `${prefix}SL ${trade.slPrice.toFixed(2)}` },
          { p: trade.tpPrice,    c: '#10B981', l: `${prefix}TP ${trade.tpPrice.toFixed(2)}` },
        ];
        lines.forEach(({ p, c, l }) => {
          const y = getY(p);
          ctx.strokeStyle = c; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
          ctx.fillStyle = c; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'right';
          ctx.fillText(l, chartW - 6, y - 3);
        });
        ctx.setLineDash([]);
      });
    }

    // 8a. Pending Orders Overlay (Distinct dashed lines with Order Type badge)
    if (pendingOrders.length > 0) {
      pendingOrders.forEach((po) => {
        const isSelected = po.id === selectedPendingOrderId;
        const eY = getY(po.entryPrice);
        const hasSL = po.slPrice > 0;
        const hasTP = po.tpPrice > 0;
        const slY = hasSL ? getY(po.slPrice) : null;
        const tpY = hasTP ? getY(po.tpPrice) : null;

        const isLong = po.side === 'LONG';
        const entryColor = isLong ? '#0284C7' : '#E11D48';

        // Shaded pending zones
        if (tpY !== null) {
          ctx.fillStyle = isLong ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)';
          ctx.fillRect(0, Math.min(eY, tpY), chartW, Math.abs(tpY - eY));
        }

        if (slY !== null) {
          ctx.fillStyle = isLong ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)';
          ctx.fillRect(0, Math.min(eY, slY), chartW, Math.abs(slY - eY));
        }

        // Dashed entry line
        ctx.save();
        if (isSelected) {
          ctx.shadowColor = entryColor;
          ctx.shadowBlur = 8;
        }
        ctx.setLineDash([8, 5]);
        ctx.strokeStyle = entryColor;
        ctx.lineWidth = isSelected ? 2.8 : 1.8;
        ctx.beginPath();
        ctx.moveTo(0, eY);
        ctx.lineTo(chartW, eY);
        ctx.stroke();

        // Dotted SL & TP lines
        if (slY !== null) {
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = '#EF4444';
          ctx.lineWidth = isSelected ? 2.0 : 1.2;
          ctx.beginPath();
          ctx.moveTo(0, slY);
          ctx.lineTo(chartW, slY);
          ctx.stroke();
        }

        if (tpY !== null) {
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = isSelected ? 2.0 : 1.2;
          ctx.beginPath();
          ctx.moveTo(0, tpY);
          ctx.lineTo(chartW, tpY);
          ctx.stroke();
        }
        ctx.restore();

        // Badge on left
        const badgeText = `${po.orderType.replace('_', ' ')} @ ${po.entryPrice.toFixed(2)} (${po.volume.toFixed(2)}L)${isSelected ? ' • DIPILIH' : ''}`;
        ctx.save();
        ctx.font = 'bold 9px monospace';
        const bW = ctx.measureText(badgeText).width + 12;
        const bH = 18;
        ctx.fillStyle = isSelected ? '#121212' : entryColor;
        ctx.beginPath();
        ctx.roundRect(8, eY - bH / 2, bW, bH, 3);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, 8 + bW / 2, eY + 3.5);

        // SL & TP labels on right
        if (slY !== null) {
          ctx.fillStyle = '#EF4444';
          ctx.textAlign = 'right';
          ctx.fillText(`SL ${po.slPrice.toFixed(2)}`, chartW - 8, slY - 3);
        }

        if (tpY !== null) {
          ctx.fillStyle = '#10B981';
          ctx.textAlign = 'right';
          ctx.fillText(`TP ${po.tpPrice.toFixed(2)} (1:${po.rrRatio.toFixed(1)})`, chartW - 8, tpY - 3);
        }
        ctx.restore();
      });
    }

    // 8b. Planned Order Live Preview ("Ancang-Ancang" before entry)
    if (tradesList.length === 0 && plannedOrder && plannedOrder.entryPrice > 0) {
      const eY = getY(plannedOrder.entryPrice);
      const hasSL = Boolean(plannedOrder.slPrice && plannedOrder.slPrice > 0);
      const hasTP = Boolean(plannedOrder.tpPrice && plannedOrder.tpPrice > 0);
      const slY = hasSL ? getY(plannedOrder.slPrice!) : null;
      const tpY = hasTP ? getY(plannedOrder.tpPrice!) : null;

      // Shaded Profit Zone (only when TP exists)
      if (tpY !== null) {
        ctx.fillStyle = 'rgba(16,185,129,0.12)';
        ctx.fillRect(0, Math.min(eY, tpY), chartW, Math.abs(tpY - eY));
      }

      // Shaded Risk Zone (only when SL exists)
      if (slY !== null) {
        ctx.fillStyle = 'rgba(239,68,68,0.12)';
        ctx.fillRect(0, Math.min(eY, slY), chartW, Math.abs(slY - eY));
      }

      // Setup lines
      const orderTypeBadge = plannedOrder.orderType
        ? getOrderTypeLabel(plannedOrder.orderType).toUpperCase()
        : plannedOrder.side;

      ctx.setLineDash([5, 4]);
      const pLines: Array<{
        type: 'ENTRY' | 'SL' | 'TP';
        p: number;
        c: string;
        l: string;
        pillText: string;
        badgeBg: string;
      }> = [
        {
          type: 'ENTRY',
          p: plannedOrder.entryPrice,
          c: '#06B6D4',
          l: `${orderTypeBadge} (${plannedOrder.lotSize.toFixed(2)}L)`,
          pillText: '↕ GESER ENTRY',
          badgeBg: '#0891B2',
        },
      ];

      if (hasSL) {
        pLines.push({
          type: 'SL',
          p: plannedOrder.slPrice!,
          c: '#EF4444',
          l: `TARGET SL ${plannedOrder.slPrice!.toFixed(2)} (-$${plannedOrder.riskAmount.toFixed(0)})`,
          pillText: '↕ GESER SL',
          badgeBg: '#DC2626',
        });
      }

      if (hasTP) {
        const rewardText = plannedOrder.targetProfit ? `+$${plannedOrder.targetProfit.toFixed(0)}` : '';
        const rrText = plannedOrder.rrRatio ? ` • 1:${plannedOrder.rrRatio.toFixed(1)}` : '';
        pLines.push({
          type: 'TP',
          p: plannedOrder.tpPrice!,
          c: '#10B981',
          l: `TARGET TP ${plannedOrder.tpPrice!.toFixed(2)} (${rewardText}${rrText})`,
          pillText: '↕ GESER TP',
          badgeBg: '#059669',
        });
      }

      pLines.forEach(({ p, c, l, pillText, badgeBg }) => {
        const y = getY(p);
        if (y >= 0 && y <= mainH) {
          ctx.strokeStyle = c;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartW, y);
          ctx.stroke();

          // Draggable handle grip pill on left
          const pillW = 88;
          const pillH = 18;
          ctx.fillStyle = badgeBg;
          ctx.beginPath();
          ctx.roundRect(10, y - pillH / 2, pillW, pillH, 4);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 8.5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(pillText, 10 + pillW / 2, y + 3);

          // Circular drag handle grip
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(10 + pillW + 12, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Label inside chart on right
          ctx.fillStyle = c;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(l, chartW - 6, y - 4);

          // Axis badge on price scale
          ctx.fillStyle = badgeBg;
          ctx.fillRect(chartW + 1, y - 8, priceScaleW - 2, 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9.5px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(p.toFixed(2), chartW + 5, y + 3.5);
        }
      });
      ctx.setLineDash([]);
    }

    // 9b. Current / Latest Price Line
    const latestC = candles[candles.length - 1];
    if (latestC) {
      const lastY = getY(latestC.close);
      if (lastY >= 0 && lastY <= mainH) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, lastY);
        ctx.lineTo(chartW, lastY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tag on price axis
        ctx.fillStyle = '#0284C7';
        ctx.fillRect(chartW + 1, lastY - 9, priceScaleW - 2, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(latestC.close.toFixed(2), chartW + 6, lastY + 3.5);
      }
    }

    // 9c. Replay Selection Cursor (in 'selecting' mode)
    if (appMode === 'selecting' && mousePos && mousePos.x <= chartW && mousePos.y <= mainH) {
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, mainH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#B45309';
      ctx.fillRect(mousePos.x - 70, 10, 140, 22);
      ctx.strokeStyle = '#FCD34D';
      ctx.lineWidth = 1;
      ctx.strokeRect(mousePos.x - 70, 10, 140, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Klik Mulai Replay', mousePos.x, 25);
    }

    // 10. Crosshair & HUD
    if (mousePos && mousePos.x <= chartW && mousePos.y <= mainH) {
      ctx.strokeStyle = 'rgba(148,163,184,.5)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(mousePos.x, 0); ctx.lineTo(mousePos.x, mainH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, mousePos.y); ctx.lineTo(chartW, mousePos.y); ctx.stroke();
      ctx.setLineDash([]);

      const hp = vp.yToPrice(mousePos.y);
      ctx.fillStyle = '#334155'; ctx.fillRect(chartW + 1, mousePos.y - 10, priceScaleW - 2, 20);
      ctx.fillStyle = '#F0F9FF'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(hp.toFixed(2), chartW + 6, mousePos.y + 4);

      const hIdx = Math.round(vp.xToGIdx(mousePos.x));
      if (hIdx >= 0 && hIdx < candles.length) {
        const t = new Date(candles[hIdx].time);
        ctx.fillStyle = '#334155'; ctx.fillRect(mousePos.x - 45, cssH - timeScaleH, 90, timeScaleH);
        ctx.fillStyle = '#F0F9FF'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(format(t, 'MM/dd HH:mm'), mousePos.x, cssH - 8);
      }
    }
  }, [
    candles, candleWidth, panOffsetX, priceZoom, pricePanOffset, dimensions,
    activeTrade, activeTrades, plannedOrder, indicators, drawings, drawingDraft, selectedDrawingId, mousePos,
    sma20v, sma50v, sma200v, buildVP, appMode,
  ]);

  // Wheel Zoom & Touchpad Pan Listener (Cursor-Centered Zoom without heuristic flaws)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? dimensions.width / rect.width : 1;
      const scaleY = rect.height > 0 ? dimensions.height / rect.height : 1;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;
      const vp = vpRef.current;
      if (!vp) return;

      // Check if event is within canvas bounds
      if (mouseX < 0 || mouseX > dimensions.width || mouseY < 0 || mouseY > dimensions.height) return;

      const candlesList = candlesRef.current;
      const lastGlobalIdx = candlesList.length - 1;
      if (lastGlobalIdx < 0) return;

      // Case A: Touchpad two-finger horizontal swipe -> horizontal pan only
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.15 && Math.abs(e.deltaX) > 1.5) {
        e.preventDefault();
        e.stopPropagation();
        const dx = -e.deltaX;
        const minPanX = -Math.round(vp.chartW * 0.35);
        const maxPanX = Math.max(0, lastGlobalIdx * vp.slot + 100);
        const newPanX = Math.max(minPanX, Math.min(maxPanX, panXRef.current + dx));
        panXRef.current = newPanX;
        setPanOffsetX(newPanX);
        return;
      }

      // Case B: Vertical scroll outside the main chart body (e.g. price scale or time scale) -> allow natural page scroll
      if (mouseX > vp.chartW || mouseY > vp.candleH) {
        return;
      }

      // Case C: Zoom (Mouse wheel or touchpad pinch/ctrl+wheel inside chart area)
      e.preventDefault();
      e.stopPropagation();

      onDisableFollowReplay?.();

      const delta = e.deltaY;
      if (Math.abs(delta) < 0.1) return;

      const zoomFactor = delta < 0 ? 1.12 : 0.89;
      const curCW = cwRef.current;
      const newCW = Math.min(45, Math.max(2, curCW * zoomFactor));
      if (Math.abs(newCW - curCW) < 0.001) return;

      // Cursor-Centered Zoom:
      // 1. Find global fractional candle index directly under mouseX before zoom
      const anchorGIdx = vp.xToGIdx(mouseX);

      // 2. Compute new slot & right margin with newCW
      const newSpacing = Math.max(1, newCW * 0.2);
      const newSlot = newCW + newSpacing;
      const newRightMargin = Math.max(35, newSlot * 6);

      // 3. Solve for newPanX so that getX(anchorGIdx) === mouseX:
      // mouseX = vp.chartW - newRightMargin + (anchorGIdx - lastGlobalIdx) * newSlot + newPanX + newSlot / 2
      let newPanX = mouseX - (vp.chartW - newRightMargin) - (anchorGIdx - lastGlobalIdx) * newSlot - newSlot / 2;

      const minPanX = -Math.round(vp.chartW * 0.35);
      const maxPanX = Math.max(0, lastGlobalIdx * newSlot + 100);
      newPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));

      cwRef.current = newCW;
      panXRef.current = newPanX;
      setCandleWidth(newCW);
      setPanOffsetX(newPanX);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [dimensions.width, dimensions.height, onDisableFollowReplay]);

  const clientToCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? dimensions.width / rect.width : 1;
    const scaleY = rect.height > 0 ? dimensions.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // ── Hit-Testing Planned Order Lines (Pre-Entry Setup Dragging) ──
  const hitTestPlannedOrder = (clientX: number, clientY: number): 'ENTRY' | 'SL' | 'TP' | null => {
    if (tradesList.length > 0 || !plannedOrder || plannedOrder.entryPrice <= 0) return null;
    const vp = vpRef.current;
    if (!vp) return null;
    const { x, y } = clientToCanvas(clientX, clientY);
    if (x > vp.chartW + 15 || x < 0 || y < 0 || y > vp.mainH) return null;

    const eY = vp.getY(plannedOrder.entryPrice);
    const hasSL = Boolean(plannedOrder.slPrice && plannedOrder.slPrice > 0);
    const hasTP = Boolean(plannedOrder.tpPrice && plannedOrder.tpPrice > 0);
    const slY = hasSL ? vp.getY(plannedOrder.slPrice!) : -99999;
    const tpY = hasTP ? vp.getY(plannedOrder.tpPrice!) : -99999;

    let closest: 'ENTRY' | 'SL' | 'TP' | null = null;
    let minDist = 18;

    if (hasTP && Math.abs(y - tpY) < minDist) {
      minDist = Math.abs(y - tpY);
      closest = 'TP';
    }
    if (hasSL && Math.abs(y - slY) < minDist) {
      minDist = Math.abs(y - slY);
      closest = 'SL';
    }
    if (Math.abs(y - eY) < minDist) {
      minDist = Math.abs(y - eY);
      closest = 'ENTRY';
    }
    return closest;
  };

  // ── Hit-Testing Placed Pending Orders (Click to Edit / Delete) ──
  const hitTestPendingOrder = (clientX: number, clientY: number): PendingOrderRecord | null => {
    if (pendingOrders.length === 0) return null;
    const vp = vpRef.current;
    if (!vp) return null;
    const { x, y } = clientToCanvas(clientX, clientY);
    if (x > vp.chartW + 20 || x < 0 || y < 0 || y > vp.mainH) return null;

    for (const po of pendingOrders) {
      const eY = vp.getY(po.entryPrice);
      if (Math.abs(y - eY) <= 15) return po;
      if (po.slPrice && po.slPrice > 0) {
        const slY = vp.getY(po.slPrice);
        if (Math.abs(y - slY) <= 15) return po;
      }
      if (po.tpPrice && po.tpPrice > 0) {
        const tpY = vp.getY(po.tpPrice);
        if (Math.abs(y - tpY) <= 15) return po;
      }
    }
    return null;
  };

  // ── Hit-Testing Active Trade Lines (Click to Close / Manage) ──
  const hitTestActiveTrade = (clientX: number, clientY: number): boolean => {
    if (tradesList.length === 0) return false;
    const vp = vpRef.current;
    if (!vp) return false;
    const { x, y } = clientToCanvas(clientX, clientY);
    if (x > vp.chartW + 20 || x < 0 || y < 0 || y > vp.mainH) return false;

    for (const tr of tradesList) {
      const eY = vp.getY(tr.entryPrice);
      if (Math.abs(y - eY) <= 15) return true;
      if (tr.slPrice && tr.slPrice > 0) {
        const slY = vp.getY(tr.slPrice);
        if (Math.abs(y - slY) <= 15) return true;
      }
      if (tr.tpPrice && tr.tpPrice > 0) {
        const tpY = vp.getY(tr.tpPrice);
        if (Math.abs(y - tpY) <= 15) return true;
      }
    }
    return false;
  };

  // ── Hit-Testing Handles for Dragging ──
  const hitTestDrawing = (clientX: number, clientY: number): {
    drawing: DrawingItem;
    handleType: 'P1' | 'P2' | 'ENTRY' | 'SL' | 'TP' | 'WIDTH' | 'MOVE_ALL';
  } | null => {
    const vp = vpRef.current;
    if (!vp) return null;
    const { x, y } = clientToCanvas(clientX, clientY);
    const mousePrice = vp.yToPrice(y);
    const mouseTime = vp.xToTime(x);
    const THRESH_PX = 20;
    const PRICE_THRESH = (vp.totalRange) * 0.025;

    // Check selected drawing first for handles
    if (selectedDrawingId) {
      const sel = drawingsRef.current.find((d) => d.id === selectedDrawingId);
      if (sel) {
        if (sel.type === 'long_position' || sel.type === 'short_position') {
          const px = vp.timeToX(sel.startTime!);
          const endX = sel.endTime ? vp.timeToX(sel.endTime) : px + 180;
          const boxW = Math.max(120, endX - px);
          const eY = vp.getY(sel.startPrice!);
          const slY = vp.getY(sel.slPrice!);
          const tpY = vp.getY(sel.tpPrice!);
          const hx = px + 28;

          // Check handle anchors (dots) and lines across whole box width
          if (Math.hypot(x - hx, y - tpY) < 22 || (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - tpY) < THRESH_PX)) {
            return { drawing: sel, handleType: 'TP' };
          }
          if (Math.hypot(x - hx, y - slY) < 22 || (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - slY) < THRESH_PX)) {
            return { drawing: sel, handleType: 'SL' };
          }
          if (Math.hypot(x - hx, y - eY) < 22 || (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - eY) < THRESH_PX)) {
            return { drawing: sel, handleType: 'ENTRY' };
          }
          // Check Width Handle at right edge
          if (Math.hypot(x - (px + boxW), y - ((tpY + slY) / 2)) < 22 || (Math.abs(x - (px + boxW)) < THRESH_PX && y >= Math.min(tpY, slY) - 10 && y <= Math.max(tpY, slY) + 10)) {
            return { drawing: sel, handleType: 'WIDTH' };
          }
          // Check Body Move
          if (x >= px && x <= px + boxW && y >= Math.min(tpY, slY) && y <= Math.max(tpY, slY)) {
            return { drawing: sel, handleType: 'MOVE_ALL' };
          }
        } else if (sel.type === 'fibonacci') {
          const x1 = vp.timeToX(sel.startTime!), y1 = vp.getY(sel.startPrice!);
          const x2 = vp.timeToX(sel.endTime!),   y2 = vp.getY(sel.endPrice!);

          if (Math.hypot(x - x1, y - y1) < THRESH_PX) return { drawing: sel, handleType: 'P1' };
          if (Math.hypot(x - x2, y - y2) < THRESH_PX) return { drawing: sel, handleType: 'P2' };

          const levels = sel.fibLevels && sel.fibLevels.length > 0 ? sel.fibLevels : DEFAULT_FIBONACCI_LEVELS;
          const diff = sel.endPrice! - sel.startPrice!;
          const lx = Math.min(x1, x2);
          const rx = Math.max(x1, x2);
          const rightExtent = Math.min(vp.chartW - 4, Math.max(rx + 40, rx + (rx - lx) * 0.25));

          if (x >= lx - 10 && x <= rightExtent + 10) {
            for (const fl of levels) {
              if (!fl.visible) continue;
              const fy = vp.getY(sel.startPrice! + diff * fl.value);
              if (Math.abs(y - fy) < THRESH_PX) {
                return { drawing: sel, handleType: 'MOVE_ALL' };
              }
            }
            const yMin = Math.min(y1, y2) - 10;
            const yMax = Math.max(y1, y2) + 10;
            if (y >= yMin && y <= yMax) {
              return { drawing: sel, handleType: 'MOVE_ALL' };
            }
          }
        } else if (sel.type === 'trendline' || sel.type === 'rect' || sel.type === 'measure') {
          const x1 = vp.timeToX(sel.startTime!), y1 = vp.getY(sel.startPrice!);
          const x2 = vp.timeToX(sel.endTime!),   y2 = vp.getY(sel.endPrice!);

          if (Math.hypot(x - x1, y - y1) < THRESH_PX) return { drawing: sel, handleType: 'P1' };
          if (Math.hypot(x - x2, y - y2) < THRESH_PX) return { drawing: sel, handleType: 'P2' };
          const pMin = Math.min(sel.startPrice!, sel.endPrice!) - PRICE_THRESH;
          const pMax = Math.max(sel.startPrice!, sel.endPrice!) + PRICE_THRESH;
          const tMin = Math.min(sel.startTime!, sel.endTime!);
          const tMax = Math.max(sel.startTime!, sel.endTime!);
          if (mousePrice >= pMin && mousePrice <= pMax && mouseTime >= tMin - 60000 && mouseTime <= tMax + 60000) {
            return { drawing: sel, handleType: 'MOVE_ALL' };
          }
        } else if (sel.type === 'hline') {
          if (Math.abs(mousePrice - sel.price!) < PRICE_THRESH) return { drawing: sel, handleType: 'MOVE_ALL' };
        } else if (sel.type === 'vline') {
          if (Math.abs(x - vp.timeToX(sel.time!)) < THRESH_PX) return { drawing: sel, handleType: 'MOVE_ALL' };
        }
      }
    }

    // Check all other drawings for selection / moving
    for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
      const d = drawingsRef.current[i];
      if (d.type === 'hline' && d.price != null) {
        if (Math.abs(mousePrice - d.price) < PRICE_THRESH) return { drawing: d, handleType: 'MOVE_ALL' };
      } else if (d.type === 'vline' && d.time != null) {
        if (Math.abs(x - vp.timeToX(d.time)) < THRESH_PX) return { drawing: d, handleType: 'MOVE_ALL' };
      } else if (d.type === 'long_position' || d.type === 'short_position') {
        const px = vp.timeToX(d.startTime!);
        const endX = d.endTime ? vp.timeToX(d.endTime) : px + 180;
        const boxW = Math.max(120, endX - px);
        const eY = vp.getY(d.startPrice!);
        const slY = vp.getY(d.slPrice!);
        const tpY = vp.getY(d.tpPrice!);
        const hx = px + 28;

        if (Math.hypot(x - hx, y - tpY) < 22 || (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - tpY) < THRESH_PX)) return { drawing: d, handleType: 'TP' };
        if (Math.hypot(x - hx, y - slY) < 22 || (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - slY) < THRESH_PX)) return { drawing: d, handleType: 'SL' };
        if (Math.hypot(x - hx, y - eY) < 22 || (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - eY) < THRESH_PX)) return { drawing: d, handleType: 'ENTRY' };
        if (x >= px && x <= px + boxW && y >= Math.min(tpY, slY) && y <= Math.max(tpY, slY)) {
          return { drawing: d, handleType: 'MOVE_ALL' };
        }
      } else if (d.type === 'fibonacci' && d.startTime != null && d.startPrice != null && d.endTime != null && d.endPrice != null) {
        const x1 = vp.timeToX(d.startTime), y1 = vp.getY(d.startPrice);
        const x2 = vp.timeToX(d.endTime),   y2 = vp.getY(d.endPrice);
        if (Math.hypot(x - x1, y - y1) < THRESH_PX) return { drawing: d, handleType: 'P1' };
        if (Math.hypot(x - x2, y - y2) < THRESH_PX) return { drawing: d, handleType: 'P2' };
        const levels = d.fibLevels && d.fibLevels.length > 0 ? d.fibLevels : DEFAULT_FIBONACCI_LEVELS;
        const diff = d.endPrice - d.startPrice;
        const lx = Math.min(x1, x2);
        const rx = Math.max(x1, x2);
        const rightExtent = Math.min(vp.chartW - 4, Math.max(rx + 40, rx + (rx - lx) * 0.25));
        if (x >= lx - 10 && x <= rightExtent + 10) {
          for (const fl of levels) {
            if (!fl.visible) continue;
            const fy = vp.getY(d.startPrice + diff * fl.value);
            if (Math.abs(y - fy) < THRESH_PX) {
              return { drawing: d, handleType: 'MOVE_ALL' };
            }
          }
          const yMin = Math.min(y1, y2) - 10;
          const yMax = Math.max(y1, y2) + 10;
          if (y >= yMin && y <= yMax) {
            return { drawing: d, handleType: 'MOVE_ALL' };
          }
        }
      } else if (d.startTime != null && d.startPrice != null && d.endTime != null && d.endPrice != null) {
        const pMin = Math.min(d.startPrice, d.endPrice) - PRICE_THRESH;
        const pMax = Math.max(d.startPrice, d.endPrice) + PRICE_THRESH;
        const tMin = Math.min(d.startTime, d.endTime);
        const tMax = Math.max(d.startTime, d.endTime);
        if (mousePrice >= pMin && mousePrice <= pMax && mouseTime >= tMin - 60000 && mouseTime <= tMax + 60000) {
          return { drawing: d, handleType: 'MOVE_ALL' };
        }
      }
    }

    return null;
  };

  // ── Reset Auto-Scale ──
  const handleResetAutoScale = () => {
    setPriceZoom(1.0);
    setPricePanOffset(0);
  };

  // ── Pointer Down Handler ──
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setContextMenu(null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    activePointersRef.current.set(e.pointerId, { x, y });

    // Multi-touch Pinch Zoom Initialization (2 fingers)
    if (activePointersRef.current.size === 2) {
      dragModeRef.current = 'PINCH_ZOOM';
      panStartRef.current = null;
      draggingHandleRef.current = null;
      const pts = Array.from(activePointersRef.current.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartDistRef.current = Math.max(10, dist);
      pinchStartCWRef.current = cwRef.current;
      pinchMidRef.current = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      return;
    }
    if (activePointersRef.current.size > 2) return;

    const vp = vpRef.current;
    if (!vp) return;

    // 1. Right Price Scale Dragging (Vertical Price Stretch / Zoom)
    if (x >= vp.chartW) {
      dragModeRef.current = 'SCALE_PRICE';
      priceScaleStartRef.current = { startY: y, startPZ: pzRef.current };
      return;
    }

    // 2. Bottom Time Scale Dragging (Horizontal Time Zoom)
    if (y >= vp.mainH) {
      dragModeRef.current = 'SCALE_TIME';
      timeScaleStartRef.current = { startX: x, startCW: cwRef.current };
      return;
    }

    const price = Math.round(vp.yToPrice(y) * 1000) / 1000;
    const time = vp.xToTime(x);

    // 2b. Replay Selection Mode: clicking on chart selects replay start time
    if (appMode === 'selecting') {
      onReplaySelectionClick?.(new Date(time));
      return;
    }

    // 3. Cursor / Crosshair Mode: Check drawings or Pan
    if (activeTool === 'cursor' || activeTool === 'crosshair') {
      const plannedHit = hitTestPlannedOrder(e.clientX, e.clientY);
      if (plannedHit && plannedOrder) {
        dragModeRef.current = 'PLANNED_ORDER_HANDLE';
        plannedDragHandleRef.current = {
          type: plannedHit,
          startMousePrice: price,
          startEntry: plannedOrder.entryPrice,
          startSL: plannedOrder.slPrice || 0,
          startTP: plannedOrder.tpPrice || 0,
        };
        return;
      }

      // Check if user clicked on a placed Pending Order on chart
      const poHit = hitTestPendingOrder(e.clientX, e.clientY);
      if (poHit) {
        setSelectedPendingOrderId(poHit.id);
        setIsActiveTradeSelected(false);
        onSelectDrawing?.(null);
        return;
      }

      // Check if user clicked on Active Trade lines on chart
      if (hitTestActiveTrade(e.clientX, e.clientY)) {
        setIsActiveTradeSelected(true);
        setSelectedPendingOrderId(null);
        onSelectDrawing?.(null);
        return;
      }

      const hit = hitTestDrawing(e.clientX, e.clientY);
      if (hit) {
        onSelectDrawing?.(hit.drawing.id);
        setSelectedPendingOrderId(null);
        setIsActiveTradeSelected(false);
        dragModeRef.current = 'DRAWING_HANDLE';
        draggingHandleRef.current = {
          drawingId: hit.drawing.id,
          handleType: hit.handleType,
          initialDrawing: { ...hit.drawing },
          startMousePrice: price,
          startMouseTime: time,
        };
        return;
      }

      // Empty chart clicked -> deselect and initiate pan (X and Y)
      onSelectDrawing?.(null);
      setSelectedPendingOrderId(null);
      setIsActiveTradeSelected(false);
      dragModeRef.current = 'PAN_CHART';
      panStartRef.current = { startX: x, startY: y, startPanX: panXRef.current, startPanY: poRef.current };
      return;
    }

    // 4. Single-Click Drawing Tools
    if (activeTool === 'hline') {
      const nd: DrawingItem = { id: `d-${Date.now()}`, type: 'hline', price };
      onDrawingsChange?.([...drawingsRef.current, nd]);
      onSelectDrawing?.(nd.id);
      onToolChange?.('cursor');
      return;
    }

    if (activeTool === 'vline') {
      const nd: DrawingItem = { id: `d-${Date.now()}`, type: 'vline', time };
      onDrawingsChange?.([...drawingsRef.current, nd]);
      onSelectDrawing?.(nd.id);
      onToolChange?.('cursor');
      return;
    }

    if (activeTool === 'long_position') {
      const defaultDist = 5.0;
      const nd: DrawingItem = {
        id: `d-${Date.now()}`,
        type: 'long_position',
        startTime: time,
        startPrice: price,
        slPrice: Math.round((price - defaultDist) * 100) / 100,
        tpPrice: Math.round((price + defaultDist * 2) * 100) / 100,
        lockRR,
      };
      onDrawingsChange?.([...drawingsRef.current, nd]);
      onSelectDrawing?.(nd.id);
      onToolChange?.('cursor');
      return;
    }

    if (activeTool === 'short_position') {
      const defaultDist = 5.0;
      const nd: DrawingItem = {
        id: `d-${Date.now()}`,
        type: 'short_position',
        startTime: time,
        startPrice: price,
        slPrice: Math.round((price + defaultDist) * 100) / 100,
        tpPrice: Math.round((price - defaultDist * 2) * 100) / 100,
        lockRR,
      };
      onDrawingsChange?.([...drawingsRef.current, nd]);
      onSelectDrawing?.(nd.id);
      onToolChange?.('cursor');
      return;
    }

    // 5. Multi-point / Dragging Drawing Tools (trendline, rect, fibonacci, measure)
    if (activeTool === 'trendline' || activeTool === 'rect' || activeTool === 'fibonacci' || activeTool === 'measure') {
      if (!draftRef.current) {
        const nd: DrawingItem = {
          id: `d-${Date.now()}`,
          type: activeTool,
          startTime: time,
          startPrice: price,
          endTime: time,
          endPrice: price,
          ...(activeTool === 'fibonacci' ? { fibLevels: DEFAULT_FIBONACCI_LEVELS.map((l) => ({ ...l })) } : {}),
        };
        setDrawingDraft(nd);
        draftStartMouseRef.current = { x, y };
      } else {
        const completed: DrawingItem = {
          ...draftRef.current,
          endTime: time,
          endPrice: price,
        };
        if (activeTool !== 'measure') {
          onDrawingsChange?.([...drawingsRef.current, completed]);
          onSelectDrawing?.(completed.id);
        }
        setDrawingDraft(null);
        draftStartMouseRef.current = null;
        onToolChange?.('cursor');
      }
    }
  };

  // ── Pointer Move Handler ──
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    setMousePos({ x, y });
    activePointersRef.current.set(e.pointerId, { x, y });

    const vp = vpRef.current;
    if (!vp) return;

    // 0. Multi-touch Pinch Zoom
    if (dragModeRef.current === 'PINCH_ZOOM' && activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const curDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const ratio = curDist / (pinchStartDistRef.current || 1);

      const newCW = Math.min(45, Math.max(2, pinchStartCWRef.current * ratio));
      if (Math.abs(newCW - cwRef.current) > 0.05) {
        const midX = pinchMidRef.current.x;
        const midY = pinchMidRef.current.y;
        const candlesList = candlesRef.current;
        const lastGlobalIdx = candlesList.length - 1;
        if (lastGlobalIdx > 0) {
          const anchorGIdx = vp.xToGIdx(midX);
          const anchorPrice = vp.yToPrice(midY);
          const newSpacing = Math.max(1, newCW * 0.2);
          const newSlot = newCW + newSpacing;
          const newRightMargin = Math.max(35, newSlot * 6);

          let newPanX = midX - (vp.chartW - newRightMargin) - (anchorGIdx - lastGlobalIdx) * newSlot - newSlot / 2;
          const minPanX = -Math.round(vp.chartW * 0.35);
          const maxPanX = Math.max(0, lastGlobalIdx * newSlot + 100);
          newPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));

          // Vertical Anchor Compensation
          const newGIdxLeft = lastGlobalIdx + (0 - (vp.chartW - newRightMargin) - newPanX - newSlot / 2) / newSlot;
          const newGIdxRight = lastGlobalIdx + (vp.chartW - (vp.chartW - newRightMargin) - newPanX - newSlot / 2) / newSlot;
          const newStartIdx = Math.max(0, Math.floor(newGIdxLeft) - 5);
          const newEndIdx = Math.min(lastGlobalIdx, Math.ceil(newGIdxRight) + 5);

          let minP = Infinity, maxP = -Infinity;
          for (let i = newStartIdx; i <= newEndIdx && i < candlesList.length; i++) {
            const c = candlesList[i];
            if (c.low < minP) minP = c.low;
            if (c.high > maxP) maxP = c.high;
          }
          if (!isFinite(minP)) { minP = 3000; maxP = 3100; }
          for (const t of activeTradesRef.current) {
            minP = Math.min(minP, t.slPrice, t.entryPrice);
            maxP = Math.max(maxP, t.tpPrice, t.entryPrice);
          }
          const newMidPrice = (maxP + minP) / 2;
          const newBaseRange = (maxP - minP) || 1;
          const newScaledRange = (newBaseRange * 1.16) / Math.max(0.1, pzRef.current);
          const newTotalRange = newScaledRange;
          if (vp.candleH > 20) {
            const clampedY = Math.max(10, Math.min(vp.candleH - 10, midY));
            const newPO = anchorPrice + ((clampedY - 10) / (vp.candleH - 20)) * newTotalRange - (newMidPrice + newScaledRange / 2);
            poRef.current = newPO;
            setPricePanOffset(newPO);
          }

          cwRef.current = newCW;
          panXRef.current = newPanX;
          setCandleWidth(newCW);
          setPanOffsetX(newPanX);
        }
      }
      return;
    }

    // 1. Right Price Scale Dragging (Scale Y)
    if (dragModeRef.current === 'SCALE_PRICE' && priceScaleStartRef.current) {
      const dy = y - priceScaleStartRef.current.startY;
      const factor = 1 - dy * 0.008;
      const newPZ = Math.min(8.0, Math.max(0.15, priceScaleStartRef.current.startPZ * factor));
      setPriceZoom(newPZ);
      return;
    }

    // 2. Bottom Time Scale Dragging (Scale X)
    if (dragModeRef.current === 'SCALE_TIME' && timeScaleStartRef.current) {
      const dx = x - timeScaleStartRef.current.startX;
      const factor = 1 + dx * 0.008;
      const newCW = Math.min(45, Math.max(2, timeScaleStartRef.current.startCW * factor));
      setCandleWidth(newCW);
      return;
    }

    const price = Math.round(vp.yToPrice(y) * 1000) / 1000;
    const time = vp.xToTime(x);

    // Replay Selection Cursor Hover Update
    if (appMode === 'selecting' && x <= vp.chartW && y <= vp.mainH) {
      onSelectionTimeChange?.(new Date(time));
    }

    // 3. Handle or Drawing Dragging
    const dh = draggingHandleRef.current;
    if (dragModeRef.current === 'DRAWING_HANDLE' && dh) {
      const dInit = dh.initialDrawing;
      const dPrice = price - dh.startMousePrice;
      const dTime = time - dh.startMouseTime;

      const updated = drawingsRef.current.map((d) => {
        if (d.id !== dh.drawingId) return d;

        if (dh.handleType === 'MOVE_ALL') {
          if (d.type === 'hline') return { ...d, price: Math.round((dInit.price! + dPrice) * 1000) / 1000 };
          if (d.type === 'vline') return { ...d, time: dInit.time! + dTime };
          if (d.type === 'long_position' || d.type === 'short_position') {
            return {
              ...d,
              startTime: dInit.startTime! + dTime,
              endTime: dInit.endTime ? dInit.endTime + dTime : undefined,
              startPrice: Math.round((dInit.startPrice! + dPrice) * 1000) / 1000,
              slPrice: Math.round((dInit.slPrice! + dPrice) * 1000) / 1000,
              tpPrice: Math.round((dInit.tpPrice! + dPrice) * 1000) / 1000,
            };
          }
          return {
            ...d,
            startTime: dInit.startTime! + dTime,
            endTime: dInit.endTime! + dTime,
            startPrice: Math.round((dInit.startPrice! + dPrice) * 1000) / 1000,
            endPrice: Math.round((dInit.endPrice! + dPrice) * 1000) / 1000,
          };
        }

        if (dh.handleType === 'P1') return { ...d, startTime: time, startPrice: price };
        if (dh.handleType === 'P2') return { ...d, endTime: time, endPrice: price };
        if (dh.handleType === 'WIDTH') return { ...d, endTime: time };

        if (dh.handleType === 'ENTRY') {
          // Draggable Entry line: Moves Entry, SL, and TP together by exactly dPrice
          // Strictly preserving risk distance, reward distance, and RR ratio!
          const newEntry = Math.round((dInit.startPrice! + dPrice) * 1000) / 1000;
          const newSL = Math.round((dInit.slPrice! + dPrice) * 1000) / 1000;
          const newTP = Math.round((dInit.tpPrice! + dPrice) * 1000) / 1000;
          return {
            ...d,
            startPrice: newEntry,
            slPrice: newSL,
            tpPrice: newTP,
          };
        }

        if (dh.handleType === 'SL') {
          const isLong = d.type === 'long_position';
          // Clamping: SL cannot cross Entry
          const clampedSL = isLong
            ? Math.min(d.startPrice! - 0.1, price)
            : Math.max(d.startPrice! + 0.1, price);
          const newSL = Math.round(clampedSL * 1000) / 1000;
          let newTP = d.tpPrice!;
          const shouldLockRR = d.lockRR ?? lockRR;
          if (shouldLockRR) {
            const initRisk = isLong ? (dInit.startPrice! - dInit.slPrice!) : (dInit.slPrice! - dInit.startPrice!);
            const initReward = isLong ? (dInit.tpPrice! - dInit.startPrice!) : (dInit.startPrice! - dInit.tpPrice!);
            const initRR = initRisk > 0 ? initReward / initRisk : 2.0;
            const newRisk = isLong ? (d.startPrice! - newSL) : (newSL - d.startPrice!);
            const newReward = newRisk * initRR;
            newTP = Math.round((isLong ? (d.startPrice! + newReward) : (d.startPrice! - newReward)) * 1000) / 1000;
          }
          return {
            ...d,
            slPrice: newSL,
            tpPrice: newTP,
          };
        }

        if (dh.handleType === 'TP') {
          const isLong = d.type === 'long_position';
          // Clamping: TP cannot cross Entry
          const clampedTP = isLong
            ? Math.max(d.startPrice! + 0.1, price)
            : Math.min(d.startPrice! - 0.1, price);
          const newTP = Math.round(clampedTP * 1000) / 1000;
          return {
            ...d,
            tpPrice: newTP,
          };
        }

        return d;
      });

      onDrawingsChange?.(updated);
      return;
    }

    // 3b. Planned Order Handle Dragging (100% Independent Dragging: Entry moves Entry, SL moves SL, TP moves TP)
    const ph = plannedDragHandleRef.current;
    if (dragModeRef.current === 'PLANNED_ORDER_HANDLE' && ph && plannedOrder) {
      if (ph.type === 'ENTRY') {
        const newEntry = Math.round(price * 100) / 100;
        onPlannedOrderChange?.({
          entryPrice: newEntry,
          slPrice: plannedOrder.slPrice || 0,
          tpPrice: plannedOrder.tpPrice || 0,
        });
      } else if (ph.type === 'SL') {
        const newSL = Math.round(price * 100) / 100;
        onPlannedOrderChange?.({
          entryPrice: plannedOrder.entryPrice,
          slPrice: newSL,
          tpPrice: plannedOrder.tpPrice || 0,
        });
      } else if (ph.type === 'TP') {
        const newTP = Math.round(price * 100) / 100;
        onPlannedOrderChange?.({
          entryPrice: plannedOrder.entryPrice,
          slPrice: plannedOrder.slPrice || 0,
          tpPrice: newTP,
        });
      }
      return;
    }

    // 4. Draft drawing preview
    if (draftRef.current) {
      setDrawingDraft((prev) => (prev ? { ...prev, endTime: time, endPrice: price } : null));
      return;
    }

    // 5. Chart Pan (X and Y)
    if (dragModeRef.current === 'PAN_CHART' && panStartRef.current) {
      const dx = x - panStartRef.current.startX;
      const dy = y - panStartRef.current.startY;

      // 1 px pointer movement = 1 px visual chart movement!
      const newPanX = panStartRef.current.startPanX + dx;
      const minPanX = -Math.round(vp.chartW * 0.35);
      const maxPanX = Math.max(0, (candles.length - 2) * vp.slot);
      const clampedPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));

      panXRef.current = clampedPanX;
      setPanOffsetX(clampedPanX);

      if (appMode === 'replay' && clampedPanX > 20 && onDisableFollowReplay) {
        onDisableFollowReplay();
      }

      // Y Shift: Drag down -> shift price pan offset
      const priceShift = (dy / (vp.candleH - 20)) * vp.totalRange;
      setPricePanOffset(panStartRef.current.startPanY + priceShift);

      // Debounced Prefetch: trigger only when approaching boundaries and not spamming during active drag
      const now = Date.now();
      if (now - lastFetchCheckRef.current > 400) {
        lastFetchCheckRef.current = now;
        if (vp.startIdx < 40) {
          onLoadOlderCandles?.();
        }
        if (appMode === 'analysis' && vp.endIdx >= candles.length - 10) {
          onLoadNewerCandles?.();
        }
      }
      return;
    }

    // 6. Update hover cursor style
    if (x >= vp.chartW) {
      setHoverCursor('ns-resize');
    } else if (y >= vp.mainH) {
      setHoverCursor('ew-resize');
    } else if (activeTool === 'cursor') {
      const plannedHit = hitTestPlannedOrder(e.clientX, e.clientY);
      if (plannedHit) {
        setHoverCursor('ns-resize');
      } else {
        const hit = hitTestDrawing(e.clientX, e.clientY);
        if (hit) {
          if (hit.handleType === 'TP' || hit.handleType === 'SL' || hit.handleType === 'ENTRY') setHoverCursor('ns-resize');
          else if (hit.handleType === 'WIDTH') setHoverCursor('ew-resize');
          else if (hit.handleType === 'P1' || hit.handleType === 'P2') setHoverCursor('crosshair');
          else setHoverCursor('move');
        } else {
          setHoverCursor('default');
        }
      }
    } else {
      setHoverCursor('crosshair');
    }

      // 7. Update hovered candle for HUD
      if (x <= vp.chartW && y <= vp.mainH) {
        const idx = Math.round(vp.xToGIdx(x));
        setHoveredCandle(idx >= 0 && idx < candles.length ? candles[idx] : null);
      } else {
        setHoveredCandle(null);
      }

  };

  // ── Pointer Up Handler ──
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2 && dragModeRef.current === 'PINCH_ZOOM') {
      dragModeRef.current = 'NONE';
    }
    if (activePointersRef.current.size === 0) {
      dragModeRef.current = 'NONE';
      panStartRef.current = null;
      priceScaleStartRef.current = null;
      timeScaleStartRef.current = null;
      draggingHandleRef.current = null;
      plannedDragHandleRef.current = null;
    }
    // Note: Do not auto-close active drawing draft on pointerUp.
    // Preserves drafting preview ("mode geser") until deliberate second tap/click.
  };

  // ── Double Click: Price Scale Auto-Reset or Replay Start ──
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    const vp = vpRef.current;
    if (!vp) return;

    if (x >= vp.chartW) {
      handleResetAutoScale();
      return;
    }

    if (y >= vp.mainH) {
      setCandleWidth(8);
      panXRef.current = 0;
      setPanOffsetX(0);
      return;
    }

    const price = Math.round(vp.yToPrice(y) * 1000) / 1000;
    const time = vp.xToTime(x);

    if (e.shiftKey) {
      onReplaySelectionClick?.(new Date(time));
    } else {
      setDblConfirm({ time: new Date(time), price });
    }
  };

  // ── Context Menu (Right Click) ──
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    const vp = vpRef.current;
    if (!vp) return;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      chartTime: vp.xToTime(x),
      chartPrice: Math.round(vp.yToPrice(y) * 1000) / 1000,
    });
  };

  const latestC = candles[candles.length - 1];
  const activeC = hoveredCandle || latestC;
  const isCustomScaled = priceZoom !== 1.0 || pricePanOffset !== 0;

  const m = activeC ? (() => {
    const diff = activeC.close - activeC.open;
    const diffPct = activeC.open > 0 ? (diff / activeC.open) * 100 : 0;
    const range = activeC.high - activeC.low;
    const body = Math.abs(diff);
    const upperWick = activeC.high - Math.max(activeC.open, activeC.close);
    const lowerWick = Math.min(activeC.open, activeC.close) - activeC.low;
    const isBull = activeC.close >= activeC.open;
    return { diff, diffPct, range, body, upperWick, lowerWick, isBull };
  })() : null;

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-w-0 min-h-0 flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden select-none touch-none overscroll-contain shadow-sm"
    >
      {/* Top HUD: Asset, Timeframe, OHLC Values & SMA Toggles */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 pr-28 bg-slate-50 border-b border-slate-200 text-xs z-10 gap-2 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-bold text-[#121212] bg-white px-2 py-0.5 border border-slate-200 rounded-lg text-xs font-mono tracking-tight shadow-sm">
            XAUUSD • {timeframe}
          </span>
          {activeC && m && (
            <span className="flex items-center gap-2 font-mono text-[11px] text-[#121212] flex-wrap">
              <span>
                O:
                <span className={m.isBull ? ' text-[#059669] font-bold' : ' text-[#DC2626] font-bold'}>
                  {' '}{activeC.open.toFixed(2)}
                </span>
              </span>
              <span>H: <span className="text-[#121212] font-bold">{activeC.high.toFixed(2)}</span></span>
              <span>L: <span className="text-[#121212] font-bold">{activeC.low.toFixed(2)}</span></span>
              <span>
                C:
                <span className={m.isBull ? ' text-[#059669] font-bold' : ' text-[#DC2626] font-bold'}>
                  {' '}{activeC.close.toFixed(2)}
                </span>
              </span>
              <span className={m.diff >= 0 ? 'text-[#059669] font-bold' : 'text-[#DC2626] font-bold'}>
                {m.diff >= 0 ? `+${m.diff.toFixed(2)}` : m.diff.toFixed(2)} ({m.diff >= 0 ? `+${m.diffPct.toFixed(2)}%` : `${m.diffPct.toFixed(2)}%`})
              </span>
              <span className="text-[#717182] hidden xl:inline">
                R: <span className="text-[#121212] font-bold">{m.range.toFixed(2)}</span>
              </span>
              <span className="text-[#717182] hidden xl:inline">
                B: <span className="text-[#121212] font-bold">{m.body.toFixed(2)}</span>
              </span>
              {activeC.tickVolume != null && (
                <span className="text-[#717182] hidden lg:inline">
                  Vol: <span className="text-[#B45309] font-bold">{activeC.tickVolume.toLocaleString()}</span>
                </span>
              )}
              <span className="text-[#717182] text-[10px]">{format(new Date(activeC.time), 'yyyy-MM-dd HH:mm')}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(['sma20', 'sma50', 'sma200'] as const).map((k) => {
            const labels: Record<string, string> = { sma20: 'SMA 20', sma50: 'SMA 50', sma200: 'SMA 200' };
            const on = indicators[k];
            return (
              <button
                key={k}
                onClick={() => onIndicatorsChange?.({ ...indicators, [k]: !on })}
                className={`px-2 py-0.5 text-[10px] font-bold font-mono border rounded-md transition-all ${
                  on
                    ? 'bg-[#1040C0] text-white border-blue-500 shadow-sm'
                    : 'bg-white text-[#121212] border-slate-200 hover:bg-[#EAF2FF]'
                }`}
              >
                {labels[k]}
              </button>
            );
          })}

          {/* Auto-Scale Reset Button */}
          {isCustomScaled && (
            <button
              onClick={handleResetAutoScale}
              title="Reset Skala Harga Otomatis"
              className="px-2 py-0.5 text-[10px] font-black font-mono bg-amber-100 text-[#121212] border border-amber-200 rounded-md shadow-sm hover:bg-amber-200 transition-all"
            >
              AUTO
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Canvas Wrapper */}
      <div ref={canvasWrapperRef} className="w-full flex-1 relative min-w-0 min-h-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none overscroll-none block min-w-0 min-h-0"
          style={{
            cursor: dragModeRef.current === 'SCALE_PRICE'
              ? 'ns-resize'
              : dragModeRef.current === 'SCALE_TIME'
              ? 'ew-resize'
              : dragModeRef.current === 'PAN_CHART'
              ? 'grabbing'
              : hoverCursor !== 'default'
              ? hoverCursor
              : activeTool === 'cursor'
              ? 'default'
              : 'crosshair',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={(e) => {
            activePointersRef.current.delete(e.pointerId);
            if (activePointersRef.current.size === 0) {
              setMousePos(null);
              setHoveredCandle(null);
              dragModeRef.current = 'NONE';
              panStartRef.current = null;
              draggingHandleRef.current = null;
              plannedDragHandleRef.current = null;
            }
          }}
          onPointerCancel={(e) => {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size === 0) {
        dragModeRef.current = 'NONE';
        panStartRef.current = null;
        priceScaleStartRef.current = null;
        timeScaleStartRef.current = null;
        draggingHandleRef.current = null;
        plannedDragHandleRef.current = null;
      }
      lastPanAnchorRef.current = null;

          }}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* Double Click Confirmation Dialog */}
      {dblConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl space-y-3 max-w-xs text-xs">
            <div className="font-bold text-slate-100 text-sm">Mulai Replay di Titik Ini?</div>
            <div className="font-mono text-amber-300 bg-slate-950 p-2 rounded border border-slate-800 space-y-1">
              <div>⏱ {format(dblConfirm.time, 'yyyy-MM-dd HH:mm')}</div>
              <div>📍 {dblConfirm.price.toFixed(2)}</div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setDblConfirm(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  onReplaySelectionClick?.(dblConfirm.time);
                  setDblConfirm(null);
                }}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold"
              >
                Set Replay Start
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 text-xs text-slate-200 min-w-[200px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Tambah Gambar
          </div>
          {(['hline', 'vline', 'trendline', 'rect', 'fibonacci', 'measure'] as DrawingTool[]).map((t) => {
            const labels: Record<string, string> = {
              hline: 'Horizontal Line (H)',
              vline: 'Vertical Line (V)',
              trendline: 'Trendline (T)',
              rect: 'Rectangle Zone (R)',
              fibonacci: 'Fibonacci (F)',
              measure: 'Measure Tool (M)',
            };
            return (
              <button
                key={t}
                onClick={() => onToolChange?.(t)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-800 rounded"
              >
                {labels[t]}
              </button>
            );
          })}
          <button
            onClick={() => onToolChange?.('long_position')}
            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-800 text-emerald-400 rounded font-medium"
          >
            Long Position (L)
          </button>
          <button
            onClick={() => onToolChange?.('short_position')}
            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-800 text-rose-400 rounded font-medium"
          >
            Short Position (S)
          </button>
          <div className="h-px bg-slate-800 my-1" />
          <button
            onClick={() => onReplaySelectionClick?.(new Date(contextMenu.chartTime))}
            className="w-full text-left px-2.5 py-1.5 hover:bg-amber-600/40 text-amber-300 rounded font-semibold"
          >
            Set Replay Start Di Sini
          </button>
          {isCustomScaled && (
            <button
              onClick={handleResetAutoScale}
              className="w-full text-left px-2.5 py-1.5 hover:bg-blue-900/40 text-blue-300 rounded"
            >
              Reset Skala Harga (Auto)
            </button>
          )}
          {drawings.length > 0 && (
            <>
              <div className="h-px bg-slate-800 my-1" />
              <button
                onClick={() => onDrawingsChange?.([])}
                className="w-full text-left px-2.5 py-1.5 hover:bg-rose-900/40 text-rose-400 rounded"
              >
                Hapus Semua Gambar
              </button>
            </>
          )}
        </div>
      )}

      {/* Visual Order Confirmation Overlay */}
      {isVisualOrderActive && plannedOrder && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 w-[min(94%,350px)] rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-sm p-3">
          <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b border-slate-100">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                {plannedOrder.orderType ? getOrderTypeLabel(plannedOrder.orderType) : 'Pending Order'}
              </div>
              <div className="text-sm font-bold text-slate-900">
                {plannedOrder.side} • ${plannedOrder.entryPrice.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">R:R</div>
              <div className="text-sm font-bold text-[#1040C0]">
                {plannedOrder.rrRatio && plannedOrder.rrRatio > 0 ? `1 : ${plannedOrder.rrRatio.toFixed(2)}` : '-'}
              </div>
            </div>
          </div>

          {/* Quick +SL and +TP action buttons */}
          <div className="flex items-center gap-2 mb-2">
            {plannedOrder.slPrice && plannedOrder.slPrice > 0 ? (
              <div className="flex-1 flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1 text-xs">
                <div>
                  <span className="text-[9px] uppercase font-bold text-rose-600 block">SL</span>
                  <span className="font-mono font-bold text-rose-700">${plannedOrder.slPrice.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onPlannedOrderChange?.({
                    entryPrice: plannedOrder.entryPrice,
                    slPrice: 0,
                    tpPrice: plannedOrder.tpPrice || 0,
                  })}
                  title="Hapus SL"
                  className="w-4 h-4 rounded-full bg-rose-200 hover:bg-rose-300 text-rose-800 flex items-center justify-center font-bold text-[10px] cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const isLong = plannedOrder.side === 'BUY';
                  const dist = getDefaultSlDistance(symbol);
                  const newSL = Math.round((isLong ? plannedOrder.entryPrice - dist : plannedOrder.entryPrice + dist) * 100) / 100;
                  onPlannedOrderChange?.({
                    entryPrice: plannedOrder.entryPrice,
                    slPrice: newSL,
                    tpPrice: plannedOrder.tpPrice || 0,
                  });
                }}
                className="flex-1 min-h-[30px] py-1 px-2 border border-dashed border-rose-400 text-rose-600 bg-rose-50/70 hover:bg-rose-100 font-bold text-[10px] rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ SL</span>
              </button>
            )}

            {plannedOrder.tpPrice && plannedOrder.tpPrice > 0 ? (
              <div className="flex-1 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 text-xs">
                <div>
                  <span className="text-[9px] uppercase font-bold text-emerald-600 block">TP</span>
                  <span className="font-mono font-bold text-emerald-700">${plannedOrder.tpPrice.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onPlannedOrderChange?.({
                    entryPrice: plannedOrder.entryPrice,
                    slPrice: plannedOrder.slPrice || 0,
                    tpPrice: 0,
                  })}
                  title="Hapus TP"
                  className="w-4 h-4 rounded-full bg-emerald-200 hover:bg-emerald-300 text-emerald-800 flex items-center justify-center font-bold text-[10px] cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const isLong = plannedOrder.side === 'BUY';
                  const dist = getDefaultSlDistance(symbol) * 2;
                  const newTP = Math.round((isLong ? plannedOrder.entryPrice + dist : plannedOrder.entryPrice - dist) * 100) / 100;
                  onPlannedOrderChange?.({
                    entryPrice: plannedOrder.entryPrice,
                    slPrice: plannedOrder.slPrice || 0,
                    tpPrice: newTP,
                  });
                }}
                className="flex-1 min-h-[30px] py-1 px-2 border border-dashed border-emerald-400 text-emerald-600 bg-emerald-50/70 hover:bg-emerald-100 font-bold text-[10px] rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ TP</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Risk</div>
              <div className="mt-1 font-mono font-bold text-rose-600">
                {plannedOrder.slPrice && plannedOrder.slPrice > 0 ? `-$${plannedOrder.riskAmount.toFixed(2)}` : 'Tanpa SL'}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Target Profit</div>
              <div className="mt-1 font-mono font-bold text-emerald-600">
                {plannedOrder.tpPrice && plannedOrder.tpPrice > 0 ? `+$${(plannedOrder.targetProfit || 0).toFixed(2)}` : 'Tanpa TP'}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Lot Size</div>
              <div className="mt-1 font-mono font-bold text-slate-900">{plannedOrder.lotSize.toFixed(2)} Lot</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">SL / TP</div>
              <div className="mt-1 font-mono font-bold text-slate-900">
                {plannedOrder.slPrice && plannedOrder.slPrice > 0 ? plannedOrder.slPrice.toFixed(2) : '-'} / {plannedOrder.tpPrice && plannedOrder.tpPrice > 0 ? plannedOrder.tpPrice.toFixed(2) : '-'}
              </div>
            </div>
          </div>

          {/* Inline Validation Warning if invalid */}
          {plannedOrder.isValid === false && (
            <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-[10px] text-rose-600 font-medium leading-tight">
              {plannedOrder.validationError || 'Level harga tidak valid untuk tipe order ini.'}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={onCancelVisualOrder}
              className="flex-1 min-h-[38px] rounded-lg border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={plannedOrder.isValid === false}
              onClick={onConfirmVisualOrder}
              className={`flex-1 min-h-[38px] rounded-lg border font-bold text-[11px] uppercase tracking-wider shadow-sm transition-colors cursor-pointer ${
                plannedOrder.isValid === false
                  ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                  : 'border-emerald-300 bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              Confirm Order
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Selected Pending Order on Chart (Edit or Delete) */}
      {selectedPendingOrder && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl px-3.5 py-2 flex items-center gap-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 pr-3 border-r border-[#121212]/15">
            <span
              className={`px-2 py-0.5 text-[10px] rounded font-black font-mono border border-[#121212] ${
                selectedPendingOrder.side === 'LONG'
                  ? 'bg-[#E7F9F0] text-[#059669]'
                  : 'bg-[#FDECEC] text-[#DC2626]'
              }`}
            >
              {selectedPendingOrder.orderType.replace('_', ' ')}
            </span>
            <span className="font-mono font-black text-xs text-[#121212]">
              @{selectedPendingOrder.entryPrice.toFixed(2)}
            </span>
          </div>

          <div className="text-[10px] font-mono text-[#717182] hidden sm:flex items-center gap-2">
            <span>SL: {selectedPendingOrder.slPrice > 0 ? `$${selectedPendingOrder.slPrice.toFixed(2)}` : 'None'}</span>
            <span>•</span>
            <span>TP: {selectedPendingOrder.tpPrice > 0 ? `$${selectedPendingOrder.tpPrice.toFixed(2)}` : 'None'}</span>
            <span>•</span>
            <span>{selectedPendingOrder.volume.toFixed(2)}L</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {onEditPendingOrder && (
              <button
                type="button"
                onClick={() => {
                  onEditPendingOrder(selectedPendingOrder);
                  setSelectedPendingOrderId(null);
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#1040C0] hover:bg-[#0D3399] text-white font-bold text-xs rounded border border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                title="Edit Entry, SL, atau TP pada Chart"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            {onCancelPendingOrder && (
              <button
                type="button"
                onClick={() => {
                  onCancelPendingOrder(selectedPendingOrder.id);
                  setSelectedPendingOrderId(null);
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#DC2626] font-bold text-xs rounded border border-[#DC2626] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                title="Hapus / Batalkan Pending Order Ini"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedPendingOrderId(null)}
              className="p-1 text-[#717182] hover:text-[#121212] hover:bg-slate-100 rounded cursor-pointer transition-colors"
              title="Tutup Menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Bar for Selected Active Position on Chart */}
      {isActiveTradeSelected && activeTrade && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl px-3.5 py-2 flex items-center gap-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 pr-3 border-r border-[#121212]/15">
            <span
              className={`px-2 py-0.5 text-[10px] rounded font-black font-mono border border-[#121212] ${
                activeTrade.side === 'LONG'
                  ? 'bg-[#E7F9F0] text-[#059669]'
                  : 'bg-[#FDECEC] text-[#DC2626]'
              }`}
            >
              POSISI {activeTrade.side === 'LONG' ? 'BUY' : 'SELL'}
            </span>
            <span className="font-mono font-black text-xs text-[#121212]">
              @{activeTrade.entryPrice.toFixed(2)} ({activeTrade.volume.toFixed(2)}L)
            </span>
          </div>

          <div className="text-[10px] font-mono text-[#717182] hidden sm:flex items-center gap-2">
            <span>SL: {activeTrade.slPrice > 0 ? `$${activeTrade.slPrice.toFixed(2)}` : 'None'}</span>
            <span>•</span>
            <span>TP: {activeTrade.tpPrice > 0 ? `$${activeTrade.tpPrice.toFixed(2)}` : 'None'}</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {onCloseActiveTrade && (
              <button
                type="button"
                onClick={() => {
                  onCloseActiveTrade();
                  setIsActiveTradeSelected(false);
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs rounded border border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                title="Tutup Posisi Ini Sekarang"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Tutup Posisi</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsActiveTradeSelected(false)}
              className="p-1 text-[#717182] hover:text-[#121212] hover:bg-slate-100 rounded cursor-pointer transition-colors"
              title="Tutup Menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Drawing Action Bar for Selected Drawing */}
      {selectedDrawing && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-slate-700/80 shadow-lg rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs backdrop-blur-sm">
          <span className="text-slate-300 font-semibold uppercase text-[10px] tracking-wider pr-2 border-r border-slate-700">
            {selectedDrawing.type.replace('_', ' ')}
          </span>
          {(selectedDrawing.type === 'long_position' || selectedDrawing.type === 'short_position') && onExecutePlannedTrade && (
            <button
              onClick={() => onExecutePlannedTrade(selectedDrawing)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase rounded transition-colors shadow-xs"
              title="Buka Posisi Langsung dari Tool Ini"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Buka Posisi</span>
            </button>
          )}
          {selectedDrawing.type === 'fibonacci' && (
            <button
              onClick={() => setFibSettingsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs uppercase border border-slate-700 rounded transition-colors"
              title="Pengaturan Level Fibonacci"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          )}
          <button
            onClick={() => {
              onDrawingsChange?.(drawings.filter((d) => d.id !== selectedDrawing.id));
              onSelectDrawing?.(null);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white font-semibold text-xs uppercase border border-rose-500/30 rounded transition-colors"
            title="Hapus Gambar (Del / Backspace)"
          >
            <Trash2 className="w-3.5 h-3.5 text-current" />
            <span>Hapus</span>
          </button>
        </div>
      )}

      {/* Fibonacci Settings Modal */}
      {fibSettingsOpen && selectedDrawing && selectedDrawing.type === 'fibonacci' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-4 space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                <Settings className="w-4 h-4 text-blue-400" />
                <span>Pengaturan Level Fibonacci</span>
              </div>
              <button
                onClick={() => setFibSettingsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {(selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS).map((lvl, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-950/50 p-1.5 rounded border border-slate-800/80">
                  <input
                    type="checkbox"
                    checked={lvl.visible}
                    onChange={(e) => {
                      const curLevels = [...(selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS)];
                      curLevels[idx] = { ...curLevels[idx], visible: e.target.checked };
                      const updated = drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, fibLevels: curLevels } : d
                      );
                      onDrawingsChange?.(updated);
                    }}
                    className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0 cursor-pointer"
                  />
                  <input
                    type="number"
                    step="0.001"
                    value={lvl.value}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isNaN(val)) return;
                      const curLevels = [...(selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS)];
                      curLevels[idx] = { ...curLevels[idx], value: val };
                      const updated = drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, fibLevels: curLevels } : d
                      );
                      onDrawingsChange?.(updated);
                    }}
                    className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-100 font-mono text-xs focus:border-blue-500 outline-none"
                  />
                  <input
                    type="color"
                    value={lvl.color || '#F59E0B'}
                    onChange={(e) => {
                      const curLevels = [...(selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS)];
                      curLevels[idx] = { ...curLevels[idx], color: e.target.value };
                      const updated = drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, fibLevels: curLevels } : d
                      );
                      onDrawingsChange?.(updated);
                    }}
                    className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-400 font-mono flex-1">
                    {(lvl.value * 100).toFixed(1)}%
                  </span>
                  <button
                    onClick={() => {
                      const curLevels = (selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS).filter((_, i) => i !== idx);
                      const updated = drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, fibLevels: curLevels } : d
                      );
                      onDrawingsChange?.(updated);
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="Hapus level"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const curLevels = [...(selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS)];
                    curLevels.push({ value: 0.705, color: '#2962FF', visible: true });
                    const updated = drawings.map((d) =>
                      d.id === selectedDrawing.id ? { ...d, fibLevels: curLevels } : d
                    );
                    onDrawingsChange?.(updated);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-xs font-semibold"
                >
                  <Plus className="w-3 h-3 text-emerald-400" />
                  <span>Tambah Level</span>
                </button>
                <button
                  onClick={() => {
                    const updated = drawings.map((d) =>
                      d.id === selectedDrawing.id ? { ...d, fibLevels: DEFAULT_FIBONACCI_LEVELS.map((l) => ({ ...l })) } : d
                    );
                    onDrawingsChange?.(updated);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-slate-200 text-xs"
                  title="Kembalikan ke level default TradingView"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Default</span>
                </button>
              </div>
              <button
                onClick={() => setFibSettingsOpen(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-xs"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
