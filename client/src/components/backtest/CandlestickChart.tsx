import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Settings, Trash2, Plus, X, RotateCcw, RotateCw, Check, Zap, Edit3, XCircle, ChevronDown, ChevronUp, GripHorizontal, Minimize2, Maximize2, Video } from 'lucide-react';
import {
  calculateFibonacciLevels,
  calculatePositionToolGeometry,
  updatePositionToolHandle,
  getDefaultSlDistance,
  calculateAdaptiveSlDistance,
  ChartTimeframe,
  TradeSide,
} from '../../shared/backtestEngine';
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
  onPlannedOrderChange?: (newPlanned: { entryPrice: number; slPrice: number; tpPrice: number; lotSize?: number }) => void;
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
  isTimeframeLoading?: boolean;
  isLoading?: boolean;
  error?: string | null;
  balance?: number;
  equity?: number;
  floatingPnL?: number;
  floatingR?: number;
  hasOpenPositions?: boolean;
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
  paddingTop: number;
  paddingBottom: number;
  drawableHeight: number;
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
  isTimeframeLoading = false,
  isLoading = false,
  error = null,
  balance,
  equity,
  floatingPnL,
  floatingR,
  hasOpenPositions,
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
  const [isAutoScale, setIsAutoScale] = useState<boolean>(true);
  const [manualPriceRange, setManualPriceRange] = useState<{ min: number; max: number } | null>(null);

  const cwRef = useRef<number>(8);
  const panXRef = useRef<number>(0);
  const pzRef = useRef<number>(1.0);
  const poRef = useRef<number>(0);
  const isAutoScaleRef = useRef<boolean>(true);
  const manualPriceRangeRef = useRef<{ min: number; max: number } | null>(null);
  const lastAutoBoundsRef = useRef<{ min: number; max: number }>({ min: 0, max: 100 });
  const lastFetchCheckRef = useRef<number>(0);

  cwRef.current = candleWidth;
  panXRef.current = panOffsetX;
  pzRef.current = priceZoom;
  poRef.current = pricePanOffset;
  isAutoScaleRef.current = isAutoScale;
  manualPriceRangeRef.current = manualPriceRange;

  // Multi-Touch & Pinch Zoom Tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartCWRef = useRef<number>(8);
  const pinchMidRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interaction Drag States
  const dragModeRef = useRef<'NONE' | 'PAN_CHART' | 'SCALE_PRICE' | 'SCALE_TIME' | 'DRAWING_HANDLE' | 'PINCH_ZOOM' | 'PLANNED_ORDER_HANDLE'>('NONE');
  const panStartRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    startMin?: number;
    startMax?: number;
  } | null>(null);
  const priceScaleStartRef = useRef<{
    startY: number;
    anchorPrice: number;
    startMin: number;
    startMax: number;
    startPZ: number;
  } | null>(null);
  const timeScaleStartRef = useRef<{ startX: number; startCW: number } | null>(null);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const axisDragStartRef = useRef<{ y: number; isDragging: boolean } | null>(null);
  const lastAxisDragEndTimeRef = useRef<number>(0);
  const lastTouchMoveTimeRef = useRef<number>(0);
  const inertiaAnimIdRef = useRef<number | null>(null);
  const velocityRef = useRef<{ vx: number; vy: number; timestamp: number } | null>(null);
  const lastPanAnchorRef = useRef<{ x: number; y: number; time: number } | null>(null);

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

  // Long-press Touch Support for Mobile
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);
  const menuOpenedAtRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Selected Placed Order on Chart (for Edit / Delete)
  const [selectedPendingOrderId, setSelectedPendingOrderId] = useState<string | null>(null);
  const [isActiveTradeSelected, setIsActiveTradeSelected] = useState<boolean>(false);
  const selectedPendingOrder = pendingOrders.find((p) => p.id === selectedPendingOrderId) || null;

  // Draggable order overlay state (GPU-Accelerated Ref-Based Dragging)
  const overlayPosRef = useRef<{ x: number; y: number } | null>(null);
  const overlayDragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const [overlayCollapsed, setOverlayCollapsed] = useState<boolean>(false);
  const [lotInputStr, setLotInputStr] = useState<string>('0.01');
  useEffect(() => {
    if (plannedOrder) {
      setLotInputStr(plannedOrder.lotSize.toFixed(2));
    }
  }, [plannedOrder?.lotSize]);
  const overlayContainerRef = useRef<HTMLDivElement>(null);

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


  // Preserve user's viewport on data prepend / append
  // Reset overlay position and collapse when order panel is closed
  useEffect(() => {
    if (!isVisualOrderActive) {
      overlayPosRef.current = null;
      setOverlayCollapsed(false);
    }
  }, [isVisualOrderActive]);

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
          const slot = cw;
          const deltaPixels = appendedCount * slot;
          // If actively dragging, compensate startPanX so mouse tracking never skips!
          if (panStartRef.current) {
            panStartRef.current.startPanX += deltaPixels;
          }
          panXRef.current += deltaPixels;
          setPanOffsetX((cur) => cur + deltaPixels);
        }
      } else {
        // Disjoint dataset (different range or symbol): reset viewport to latest
        panXRef.current = 0;
        setPanOffsetX(0);
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

  // Track previous symbol and timeframe to reset viewport on transitions
  const prevSymbolRef = useRef(symbol);
  const prevTimeframeRef = useRef(timeframe);

  // When symbol or timeframe changes, reset pan offset, price scaling, and set adaptive initial candleWidth
  useEffect(() => {
    const isSymbolChanged = prevSymbolRef.current !== symbol;
    const isTfChanged = prevTimeframeRef.current !== timeframe;
    prevSymbolRef.current = symbol;
    prevTimeframeRef.current = timeframe;

    if (isSymbolChanged || isTfChanged) {
      panXRef.current = 0;
      setPanOffsetX(0);
      let initialCw = 8;
      if (timeframe === 'M1' || timeframe === 'M5' || timeframe === 'M15' || timeframe === 'M30') {
        initialCw = 8;
      } else if (timeframe === 'H1' || timeframe === 'H4') {
        initialCw = 10;
      } else if (timeframe === 'D1') {
        initialCw = 12;
      }
      cwRef.current = initialCw;
      setCandleWidth(initialCw);

      // Invalidate manual price scaling and zoom so new symbol/TF data is immediately centered and auto-scaled
      setIsAutoScale(true);
      isAutoScaleRef.current = true;
      setManualPriceRange(null);
      manualPriceRangeRef.current = null;
      setPriceZoom(1.0);
      setPricePanOffset(0);
      pzRef.current = 1.0;
      poRef.current = 0;
      prevCandlesRef.current = [];
    }
  }, [symbol, timeframe]);

  // When candles first arrive for a freshly selected instrument or session, ensure viewport is clean and centered
  useEffect(() => {
    if (candles.length > 0 && prevCandlesRef.current.length === 0) {
      panXRef.current = 0;
      setPanOffsetX(0);
      setIsAutoScale(true);
      isAutoScaleRef.current = true;
      setManualPriceRange(null);
      manualPriceRangeRef.current = null;
    }
  }, [candles]);

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

  const sma20v = useMemo(() => (indicators.sma20 ? computeSMA(20) : []), [indicators.sma20, computeSMA]);
  const sma50v = useMemo(() => (indicators.sma50 ? computeSMA(50) : []), [indicators.sma50, computeSMA]);
  const sma200v = useMemo(() => (indicators.sma200 ? computeSMA(200) : []), [indicators.sma200, computeSMA]);

  // ── Build Viewport Projection (Canonical Pixel-Based Viewport) ──
  const buildVP = useCallback((cssW: number, cssH: number): VP => {
    const cw = cwRef.current;
    let panX = panXRef.current;
    const pz = pzRef.current;
    const po = poRef.current;

    const priceScaleW = 76;
    const timeScaleH = 26;
    const volH = Math.min(60, (cssH - timeScaleH) * 0.13);
    const chartW = Math.max(50, cssW - priceScaleW);
    const mainH = Math.max(50, cssH - timeScaleH);
    const candleH = Math.max(40, mainH - volH);

    // Padding ensuring wicks never penetrate top toolbar or bottom volume area
    const paddingTop = 36;
    const paddingBottom = 16;
    // Ensure drawableHeight subtracts paddingTop, TIME_AXIS_HEIGHT, and volume indicator height
    const drawableHeight = Math.max(20, mainH - volH - paddingTop - paddingBottom);

    const slot = cw;
    const rightMargin = Math.max(35, cw * 5);
    const lastGlobalIdx = Math.max(0, candles.length - 1);

    // Clamp panX within allowable bounds to prevent all candles from vanishing off-screen
    if (candles.length > 0) {
      const minPanX = -Math.round(chartW * 0.35);
      const maxPanX = Math.max(0, (candles.length - 1) * cw);
      if (panX < minPanX || panX > maxPanX + chartW) {
        panX = Math.max(minPanX, Math.min(maxPanX, panX));
        panXRef.current = panX;
      }
    }

    // Canonical Projection: Pure sequential integer index within dense array
    // candlesFromRight = (candles.length - 1) - i
    // x = (chartW - rightMargin) - (candlesFromRight * cw) + panX
    const getX = (i: number): number => {
      const candlesFromRight = lastGlobalIdx - i;
      return (chartW - rightMargin) - (candlesFromRight * cw) + panX;
    };

    // Inverse Projection: exact mathematical inverse
    const xToGIdx = (x: number): number => {
      return lastGlobalIdx + (x - (chartW - rightMargin) - panX) / cw;
    };

    // Derived visible index bounds directly from screen boundaries (0 to chartW):
    const idxLeft = xToGIdx(0);
    const idxRight = xToGIdx(chartW);
    const startIdx = Math.max(0, Math.min(lastGlobalIdx, Math.floor(Math.min(idxLeft, idxRight)) - 5));
    const endIdx = Math.max(startIdx, Math.min(lastGlobalIdx, Math.ceil(Math.max(idxLeft, idxRight)) + 5));

    // Dynamic Price Range Calculation strictly across visible viewport candles (+5 bar margin)
    let rawMin = Infinity, rawMax = -Infinity;
    let visibleCount = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const c = candles[i];
      if (!c) continue;
      visibleCount++;
      if (isFinite(c.low) && c.low > 0 && c.low < rawMin) rawMin = c.low;
      if (isFinite(c.high) && c.high > 0 && c.high > rawMax) rawMax = c.high;
    }

    // Auto-fit fallback if no candles fall in visible viewport or prices are invalid
    if ((visibleCount === 0 || !isFinite(rawMin) || !isFinite(rawMax) || rawMax <= rawMin || rawMin <= 0) && candles.length > 0) {
      const sample = candles.slice(-Math.min(60, candles.length));
      for (const c of sample) {
        if (isFinite(c.low) && c.low > 0 && c.low < rawMin) rawMin = c.low;
        if (isFinite(c.high) && c.high > 0 && c.high > rawMax) rawMax = c.high;
      }
    }

    // Guard against minPrice === maxPrice, NaN, or non-positive values
    if (!isFinite(rawMin) || !isFinite(rawMax) || rawMin <= 0 || rawMax <= rawMin) {
      const fallbackPrice = candles.length > 0 && isFinite(candles[candles.length - 1]?.close) && candles[candles.length - 1].close > 0
        ? candles[candles.length - 1].close
        : 3000;
      rawMin = fallbackPrice * 0.99;
      rawMax = fallbackPrice * 1.01;
    }

    if (tradesList.length > 0) {
      const mid = (rawMax + rawMin) / 2;
      const span = Math.max(1, rawMax - rawMin);
      for (const t of tradesList) {
        if (t.entryPrice > 0 && Math.abs(t.entryPrice - mid) < span * 3) {
          rawMin = Math.min(rawMin, t.entryPrice);
          rawMax = Math.max(rawMax, t.entryPrice);
        }
        if (t.slPrice > 0 && Math.abs(t.slPrice - mid) < span * 3) {
          rawMin = Math.min(rawMin, t.slPrice);
          rawMax = Math.max(rawMax, t.slPrice);
        }
        if (t.tpPrice > 0 && Math.abs(t.tpPrice - mid) < span * 3) {
          rawMin = Math.min(rawMin, t.tpPrice);
          rawMax = Math.max(rawMax, t.tpPrice);
        }
      }
    }

    if (plannedOrder && plannedOrder.entryPrice > 0) {
      const mid = (rawMax + rawMin) / 2;
      const span = Math.max(1, rawMax - rawMin);
      if (Math.abs(plannedOrder.entryPrice - mid) < span * 3) {
        rawMin = Math.min(rawMin, plannedOrder.entryPrice);
        rawMax = Math.max(rawMax, plannedOrder.entryPrice);
      }
      if (plannedOrder.slPrice && plannedOrder.slPrice > 0 && Math.abs(plannedOrder.slPrice - mid) < span * 3) {
        rawMin = Math.min(rawMin, plannedOrder.slPrice);
        rawMax = Math.max(rawMax, plannedOrder.slPrice);
      }
      if (plannedOrder.tpPrice && plannedOrder.tpPrice > 0 && Math.abs(plannedOrder.tpPrice - mid) < span * 3) {
        rawMin = Math.min(rawMin, plannedOrder.tpPrice);
        rawMax = Math.max(rawMax, plannedOrder.tpPrice);
      }
    }

    // Robust 15% vertical buffer above and below so NO wick touches boundaries:
    const priceRange = Math.max(rawMax - rawMin, 0.01);
    const bufferedMax = rawMax + priceRange * 0.15;
    const bufferedMin = rawMin - priceRange * 0.15;
    lastAutoBoundsRef.current = { min: bufferedMin, max: bufferedMax };

    // Invalidate disjoint or NaN manual price range (e.g. leftover from switching symbol)
    if (manualPriceRangeRef.current) {
      const m = manualPriceRangeRef.current;
      if (!isFinite(m.min) || !isFinite(m.max) || m.max <= m.min || m.min <= 0 || m.max < rawMin * 0.5 || m.min > rawMax * 2.0) {
        manualPriceRangeRef.current = null;
        isAutoScaleRef.current = true;
      }
    }

    // When auto-scale is ON, the buffered range from visible candles IS the final viewport range.
    // When auto-scale is OFF, use the frozen manualPriceRange for independent Y scaling and free panning.
    let paddedMin: number, paddedMax: number;
    if (isAutoScaleRef.current || !manualPriceRangeRef.current) {
      paddedMin = bufferedMin;
      paddedMax = bufferedMax;
    } else {
      paddedMin = manualPriceRangeRef.current.min;
      paddedMax = manualPriceRangeRef.current.max;
    }
    const totalRange = Math.max(0.01, paddedMax - paddedMin);

    const getY = (price: number) => {
      return paddingTop + ((paddedMax - price) / totalRange) * drawableHeight;
    };

    const yToPrice = (y: number) => {
      return paddedMax - ((y - paddingTop) / drawableHeight) * totalRange;
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
      paddingTop, paddingBottom, drawableHeight,
      cw, slot, rightMargin, startIdx, endIdx, paddedMin, paddedMax, totalRange,
      priceZoom: pz, pricePanOffset: po, panOffsetX: panX,
      getX, getY, timeToGIdx, timeToX, xToGIdx, xToTime, yToPrice,
    };
  }, [candles, activeTrade, activeTrades, plannedOrder, isAutoScale, manualPriceRange]);

  // ── Main Render Loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = dimensions.width || 900;
      const cssH = dimensions.height || 500;
      const targetW = Math.floor(cssW * dpr);
      const targetH = Math.floor(cssH * dpr);

      // Cache canvas dimensions to avoid context reset and flickering
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const vp = buildVP(cssW, cssH);
      vpRef.current = vp;
      const { priceScaleW, timeScaleH, volH, chartW, mainH, cw, rightMargin, paddedMin, paddedMax, totalRange, getY, timeToX } = vp;
      const panX = vp.panOffsetX;
      const total = candles.length;
      const rightBoundary = chartW - rightMargin + panX;

      // Optimize volume scanning with viewport bounding box [vp.startIdx, vp.endIdx]
      let maxVol = 0;
      const sIdx = vp.startIdx;
      const eIdx = vp.endIdx;
      for (let i = sIdx; i <= eIdx; i++) {
        const c = candles[i];
        if (!c) continue;
        if ((c.tickVolume || 0) > maxVol) maxVol = c.tickVolume || 0;
      }

    // 1. Chart Background
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, cssW, cssH);

    // Price Scale & Time Scale Backgrounds
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(chartW, 0, priceScaleW, cssH);
    ctx.fillRect(0, mainH, chartW, timeScaleH);

    if (candles.length === 0) {
      ctx.fillStyle = '#64748B'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      if (error) {
        ctx.fillText(error, cssW / 2, cssH / 2);
      } else if (isLoading || isTimeframeLoading) {
        ctx.fillText(`Memuat data Dukascopy ${symbol}...`, cssW / 2, cssH / 2);
      } else {
        ctx.fillText(`Tidak ada data candle untuk ${symbol} (${timeframe})`, cssW / 2, cssH / 2);
      }
      ctx.restore();
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

    // 3. Adaptive Time Scale Labels (Pure dense candle indexing with deduplication)
    const isDaily = timeframe === 'D1';
    const labelFmt = isDaily
      ? (cw > 14 ? 'yyyy-MM-dd' : 'MM/dd')
      : (cw > 14 ? 'MM/dd HH:mm' : 'HH:mm');
    const minPixelGap = isDaily ? (cw > 14 ? 75 : 55) : (cw > 14 ? 80 : 60);
    const tStep = Math.max(1, Math.ceil(minPixelGap / cw));
    let lastLabelX = -999;
    let lastLabelStr = '';

    for (let i = 0; i < total; i += tStep) {
      const c = candles[i];
      if (!c) continue;
      const barsFromRight = (total - 1) - i;
      const x = rightBoundary - (barsFromRight * cw);
      if (x < 25 || x > chartW - 25) continue;
      if (x - lastLabelX < minPixelGap) continue;

      const labelStr = format(new Date(c.time), labelFmt);
      if (labelStr === lastLabelStr) continue;

      lastLabelX = x;
      lastLabelStr = labelStr;

      ctx.strokeStyle = '#E2E8F0';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
      ctx.fillStyle = '#64748B'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(labelStr, x, cssH - 7);
    }

    // 4. Volume Separator & Bars (Clipped strictly to volume viewport)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, mainH - volH, chartW, volH);
    ctx.clip();

    ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mainH - volH); ctx.lineTo(chartW, mainH - volH); ctx.stroke();

    for (let i = 0; i < total; i++) {
      const c = candles[i];
      if (!c) continue;
      const barsFromRight = (total - 1) - i;
      const rawX = rightBoundary - (barsFromRight * cw);
      if (rawX < -cw * 2 || rawX > chartW + cw * 2) continue;
      const centerX = Math.round(rawX);
      const vol = c.tickVolume || 0;
      const h = maxVol > 0 ? (vol / maxVol) * (volH - 6) : 0;
      const calcVolW = Math.max(3, Math.round(cw * 0.75));
      const volW = calcVolW % 2 === 0 ? calcVolW + 1 : calcVolW;
      const volX = centerX - Math.floor(volW / 2);
      const isBull = c.close >= c.open;
      const volColor = isBull ? 'rgba(22, 163, 74, 0.35)' : 'rgba(220, 38, 38, 0.35)';
      ctx.fillStyle = volColor;
      const vY = mainH - h;
      const radius = Math.min(2, Math.floor(volW / 2), Math.floor(h / 2));
      if (typeof (ctx as any).roundRect === 'function' && radius > 0 && h > 2) {
        ctx.beginPath();
        (ctx as any).roundRect(volX, vY, volW, h, [radius, radius, 0, 0]);
        ctx.fill();
      } else {
        ctx.fillRect(volX, vY, volW, h);
      }
    }
    ctx.restore();

    // 5. Candlesticks (OHLC) - TradingView Standard Candlestick Geometry
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartW, mainH - volH);
    ctx.clip();

    for (let i = 0; i < total; i++) {
      const candle = candles[i];
      if (!candle) continue;
      // Strict distance from the latest bar:
      const barsFromRight = (total - 1) - i;
      const rawX = rightBoundary - (barsFromRight * cw);

      // Culling guard: only skip drawing operations if completely offscreen,
      // but NEVER use startIdx / endIdx to bound the loop
      if (rawX < -cw * 2 || rawX > chartW + cw * 2) continue;

      // 1. Center of the candle slot:
      const centerX = Math.round(rawX);

      // 2. Proportional body width (at least 75% of available bar slot):
      // Ensure bodyWidth is an odd integer so centerX is the exact mathematical middle pixel
      const calcWidth = Math.max(3, Math.round(cw * 0.75));
      const bodyWidth = calcWidth % 2 === 0 ? calcWidth + 1 : calcWidth;
      const bodyLeft = centerX - Math.floor(bodyWidth / 2);

      // 3. Y-coordinates:
      const yOpen = getY(candle.open);
      const yClose = getY(candle.close);
      const yHigh = getY(candle.high);
      const yLow = getY(candle.low);

      const topY = Math.min(yOpen, yClose);
      const rawHeight = Math.abs(yClose - yOpen);
      // Guarantee Dojis and flat bars are always visible as a solid 1.5px-2px slab:
      const bodyHeight = Math.max(1.5, Math.round(rawHeight));
      const bodyTop = rawHeight < 1.5 ? Math.round(topY) - 0.75 : Math.round(topY);

      const isBullish = candle.close >= candle.open;
      const bodyColor = isBullish ? '#16A34A' : '#DC2626';
      const borderColor = isBullish ? '#15803D' : '#B91C1C';

      // 4. Sharp, Perfectly Centered Wicks (on +0.5 half-pixel offset for crisp 1px line)
      const wickX = Math.floor(centerX) + 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = borderColor;
      ctx.beginPath();
      ctx.moveTo(wickX, Math.round(yHigh));
      ctx.lineTo(wickX, Math.round(yLow));
      ctx.stroke();

      // 5. Render Solid Bodies Over Wicks with 1px crisp outline border
      ctx.fillStyle = bodyColor;
      ctx.fillRect(bodyLeft, bodyTop, bodyWidth, bodyHeight);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(bodyLeft, bodyTop, bodyWidth, bodyHeight);
    }

    // 6. Indicators (SMAs) - Aligned to the exact same sequential X coordinates
    const drawSMA = (vals: (number | null)[], color: string, lw: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); let started = false;
      for (let i = 0; i < total; i++) {
        const v = vals[i];
        if (v == null) {
          started = false;
          continue;
        }
        const barsFromRight = (total - 1) - i;
        const x = rightBoundary - (barsFromRight * cw);
        if (x < -cw * 4 || x > chartW + cw * 4) {
          started = false;
          continue;
        }
        const y = getY(v);
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      }
      if (started) ctx.stroke();
    };
    if (sma20v.length) drawSMA(sma20v, '#F59E0B', 1.5);
    if (sma50v.length) drawSMA(sma50v, '#38BDF8', 1.5);
    if (sma200v.length) drawSMA(sma200v, '#C084FC', 2);
    ctx.restore();

    // 7. Interactive Drawings
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartW, mainH);
    ctx.clip();
    const allDrawings = draftRef.current ? [...drawings, draftRef.current] : drawings;
    for (const d of allDrawings) {
      const isSel = selectedDrawingId === d.id;
      ctx.strokeStyle = d.color || (isSel ? '#60A5FA' : '#FCD34D');
      ctx.lineWidth = isSel ? 2 : 1.5;
      ctx.setLineDash([]);

      if (d.type === 'hline' && d.price != null) {
        const y = getY(d.price);
        if (y < -50 || y > mainH + 50) continue;
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
        if (x < -50 || x > chartW + 50) continue;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
        if (isSel) {
          ctx.fillStyle = '#60A5FA';
          ctx.beginPath(); ctx.arc(x, mainH / 2, 6, 0, Math.PI * 2); ctx.fill();
        }
      } else if ((d.type === 'trendline' || d.type === 'rect' || d.type === 'fibonacci' || d.type === 'measure') &&
        d.startTime != null && d.startPrice != null && d.endTime != null && d.endPrice != null) {
        const x1 = timeToX(d.startTime), y1 = getY(d.startPrice);
        const x2 = timeToX(d.endTime),   y2 = getY(d.endPrice);
        if (Math.max(x1, x2) < -50 || Math.min(x1, x2) > chartW + 50 ||
            Math.max(y1, y2) < -50 || Math.min(y1, y2) > mainH + 50) continue;

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

    // 9b. Current / Latest Price Line & Live Pulsing Beacon
    const latestC = candles[candles.length - 1];
    if (latestC) {
      const lastY = getY(latestC.close);
      if (lastY >= 0 && lastY <= mainH) {
        const isBull = latestC.close >= latestC.open;
        const lineAccent = isBull ? '#16A34A' : '#DC2626';
        const borderAccent = isBull ? '#15803D' : '#B91C1C';

        // 1. Dashed horizontal price line across chart
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = lineAccent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, lastY);
        ctx.lineTo(chartW, lastY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Realtime Pulsing Halo Dot on the active candle price
        const lastCandleX = Math.round(rightBoundary);
        if (lastCandleX >= -10 && lastCandleX <= chartW + 10) {
          const now = performance.now();
          const pulse = (Math.sin(now / 180) + 1) / 2; // Smooth 0 to 1 oscillation
          const haloRadius = 4 + pulse * 6; // 4px to 10px
          const haloAlpha = 0.4 - pulse * 0.3; // 0.4 to 0.1

          // Pulsing Outer Halo
          ctx.fillStyle = isBull ? `rgba(22, 163, 74, ${haloAlpha})` : `rgba(220, 38, 38, ${haloAlpha})`;
          ctx.beginPath();
          ctx.arc(lastCandleX, lastY, haloRadius, 0, Math.PI * 2);
          ctx.fill();

          // Inner Solid Dot with white border
          ctx.fillStyle = lineAccent;
          ctx.beginPath();
          ctx.arc(lastCandleX, lastY, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // 3. HD Price Tag Badge on right Y axis with rounded container & subtle shadow
        const tagX = chartW + 2;
        const tagY = lastY - 10;
        const tagW = priceScaleW - 4;
        const tagH = 20;

        // Subtle Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        if (typeof (ctx as any).roundRect === 'function') {
          ctx.beginPath();
          (ctx as any).roundRect(tagX + 1, tagY + 1.5, tagW, tagH, 4);
          ctx.fill();
        }

        // Container Badge
        ctx.fillStyle = lineAccent;
        if (typeof (ctx as any).roundRect === 'function') {
          ctx.beginPath();
          (ctx as any).roundRect(tagX, tagY, tagW, tagH, 4);
          ctx.fill();
          ctx.strokeStyle = borderAccent;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillRect(tagX, tagY, tagW, tagH);
        }

        // Price Text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(latestC.close.toFixed(2), tagX + tagW / 2, lastY + 3.5);
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
      ctx.fillStyle = '#121212'; ctx.fillRect(chartW + 1, mousePos.y - 10, priceScaleW - 2, 20);
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(hp.toFixed(2), chartW + 6, mousePos.y + 4);

      const hIdx = Math.round(vp.xToGIdx(mousePos.x));
      if (hIdx >= 0 && hIdx < candles.length) {
        const t = new Date(candles[hIdx].time);
        const isDaily = timeframe === 'D1';
        const crosshairFmt = isDaily ? 'yyyy-MM-dd' : 'MM/dd HH:mm';
        const badgeW = isDaily ? 84 : 90;
        ctx.fillStyle = '#121212'; ctx.fillRect(mousePos.x - badgeW / 2, cssH - timeScaleH, badgeW, timeScaleH);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(format(t, crosshairFmt), mousePos.x, cssH - 8);
      }
    }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [
    candles, candleWidth, panOffsetX, priceZoom, pricePanOffset, dimensions,
    activeTrade, activeTrades, plannedOrder, indicators, drawings, drawingDraft, selectedDrawingId, mousePos,
    sma20v, sma50v, sma200v, buildVP, appMode, isAutoScale, manualPriceRange,
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
      if (mouseX > vp.chartW || mouseY > vp.mainH - vp.volH) {
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

      // 2. Compute new right margin with newCW
      const newRightMargin = Math.max(35, newCW * 5);

      // 3. Solve for newPanX so that getX(anchorGIdx) === mouseX:
      // mouseX = (vp.chartW - newRightMargin) - (lastGlobalIdx - anchorGIdx) * newCW + newPanX
      let newPanX = mouseX - (vp.chartW - newRightMargin) + (lastGlobalIdx - anchorGIdx) * newCW;

      const minPanX = -Math.round(vp.chartW * 0.35);
      const maxPanX = Math.max(0, lastGlobalIdx * newCW + 100);
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

  // ── Reset Auto-Scale & View ──
  const handleResetAutoScale = () => {
    setIsAutoScale(true);
    isAutoScaleRef.current = true;
    setManualPriceRange(null);
    manualPriceRangeRef.current = null;
    setPriceZoom(1.0);
    setPricePanOffset(0);
    pzRef.current = 1.0;
    poRef.current = 0;
  };

  const handleResetView = () => {
    panXRef.current = 0;
    setPanOffsetX(0);
    let defaultCw = 8;
    if (timeframe === 'H1' || timeframe === 'H4') {
      defaultCw = 10;
    } else if (timeframe === 'D1') {
      defaultCw = 12;
    }
    cwRef.current = defaultCw;
    setCandleWidth(defaultCw);
    setIsAutoScale(true);
    isAutoScaleRef.current = true;
    setManualPriceRange(null);
    manualPriceRangeRef.current = null;
    setPriceZoom(1.0);
    setPricePanOffset(0);
    pzRef.current = 1.0;
    poRef.current = 0;
  };

  // ── Pointer Down Handler ──
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (inertiaAnimIdRef.current) {
      cancelAnimationFrame(inertiaAnimIdRef.current);
      inertiaAnimIdRef.current = null;
    }
    velocityRef.current = null;
    lastPanAnchorRef.current = null;

    setContextMenu(null);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    activePointersRef.current.set(e.pointerId, { x, y });

    // Multi-touch Pinch Zoom Initialization (2 fingers)
    if (activePointersRef.current.size === 2) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
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
    if (activePointersRef.current.size > 2) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartPosRef.current = null;
      return;
    }

    // Touch Long-Press detection for Mobile
    if (e.pointerType === 'touch' && activePointersRef.current.size === 1) {
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };
      lastTouchRef.current = { x: e.clientX, y: e.clientY };
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        if (!touchStartPosRef.current) return;
        isLongPressTriggeredRef.current = true;
        menuOpenedAtRef.current = Date.now();
        dragModeRef.current = 'NONE';
        panStartRef.current = null;
        triggerContextMenu(touchStartPosRef.current.x, touchStartPosRef.current.y);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate(40); } catch (_) {}
        }
      }, 500);
    }

    const vp = vpRef.current;
    if (!vp) return;

    // 1. Right Price Scale Dragging (Vertical Price Stretch / Zoom)
    if (x >= vp.chartW) {
      dragModeRef.current = 'SCALE_PRICE';
      axisDragStartRef.current = { y: e.clientY, isDragging: false };
      const baseRange = manualPriceRangeRef.current || lastAutoBoundsRef.current;
      priceScaleStartRef.current = {
        startY: y,
        anchorPrice: Math.round(vp.yToPrice(y) * 1000) / 1000,
        startMin: baseRange.min,
        startMax: baseRange.max,
        startPZ: pzRef.current,
      };
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
      const currentBounds = manualPriceRangeRef.current || lastAutoBoundsRef.current;
      panStartRef.current = {
        startX: x,
        startY: y,
        startPanX: panXRef.current,
        startPanY: poRef.current,
        startMin: currentBounds.min,
        startMax: currentBounds.max,
      };
      lastPanAnchorRef.current = { x, y, time: performance.now() };
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
    if (e.pointerType !== 'touch') {
      setMousePos({ x, y });
    }
    activePointersRef.current.set(e.pointerId, { x, y });

    // Cancel long-press timer if movement exceeds threshold (> 8px) or multiple pointers
    if (touchStartPosRef.current) {
      if (activePointersRef.current.size === 1) {
        const dx = e.clientX - touchStartPosRef.current.x;
        const dy = e.clientY - touchStartPosRef.current.y;
        if (Math.hypot(dx, dy) > 8) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
      } else {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }

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
          const newRightMargin = Math.max(35, newCW * 5);

          let newPanX = midX - (vp.chartW - newRightMargin) + (lastGlobalIdx - anchorGIdx) * newCW;
          const minPanX = -Math.round(vp.chartW * 0.35);
          const maxPanX = Math.max(0, lastGlobalIdx * newCW + 100);
          newPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));

          // Vertical Anchor Compensation
          const newIdxLeft = lastGlobalIdx + (0 - (vp.chartW - newRightMargin) - newPanX) / newCW;
          const newIdxRight = lastGlobalIdx + (vp.chartW - (vp.chartW - newRightMargin) - newPanX) / newCW;
          const newStartIdx = Math.max(0, Math.floor(Math.min(newIdxLeft, newIdxRight)) - 5);
          const newEndIdx = Math.min(lastGlobalIdx, Math.ceil(Math.max(newIdxLeft, newIdxRight)) + 5);

          let minP = Infinity, maxP = -Infinity;
          for (let i = newStartIdx; i <= newEndIdx && i < candlesList.length; i++) {
            const c = candlesList[i];
            if (c.low > 0 && c.low < minP) minP = c.low;
            if (c.high > 0 && c.high > maxP) maxP = c.high;
          }
          if (!isFinite(minP)) { minP = 3000; maxP = 3100; }
          for (const t of activeTradesRef.current) {
            minP = Math.min(minP, t.slPrice, t.entryPrice);
            maxP = Math.max(maxP, t.tpPrice, t.entryPrice);
          }
          const newMidPrice = (maxP + minP) / 2;
          const newBaseRange = Math.max(0.01, maxP - minP);
          const newBuffer = newBaseRange * 0.10;
          const newScaledRange = (newBaseRange + newBuffer * 2) / Math.max(0.1, pzRef.current);
          const newTotalRange = newScaledRange;
          if (vp.drawableHeight > 10) {
            const clampedY = Math.max(vp.paddingTop, Math.min(vp.paddingTop + vp.drawableHeight, midY));
            const newPO = anchorPrice + ((clampedY - vp.paddingTop) / vp.drawableHeight) * newTotalRange - (newMidPrice + newScaledRange / 2);
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
      if (axisDragStartRef.current) {
        const deltaY = e.clientY - axisDragStartRef.current.y;
        if (Math.abs(deltaY) > 5) {
          axisDragStartRef.current.isDragging = true;
        }
      }
      // Require > 5px movement before turning off auto-scale or modifying price scale
      if (axisDragStartRef.current && !axisDragStartRef.current.isDragging) {
        return;
      }

      if (isAutoScaleRef.current) {
        setIsAutoScale(false);
        isAutoScaleRef.current = false;
      }
      const pss = priceScaleStartRef.current;
      const dy = y - pss.startY;
      // Moving pointer down (dy > 0) compresses price scale; moving up (dy < 0) expands it
      const factor = 1 - dy * 0.008;
      const clampedFactor = Math.min(8.0, Math.max(0.15, factor));
      const startSpan = pss.startMax - pss.startMin;
      const newSpan = startSpan / clampedFactor;
      const anchorRatio = (pss.anchorPrice - pss.startMin) / Math.max(0.001, startSpan);
      const newMin = pss.anchorPrice - anchorRatio * newSpan;
      const newMax = newMin + newSpan;
      const newRange = { min: newMin, max: newMax };
      manualPriceRangeRef.current = newRange;
      setManualPriceRange(newRange);
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
        let newTP = plannedOrder.tpPrice || 0;
        if (lockRR) {
          const isBuy = plannedOrder.side === 'BUY';
          const targetRR = (plannedOrder.rrRatio && plannedOrder.rrRatio > 0) ? plannedOrder.rrRatio : 2.0;
          const riskDist = Math.abs(plannedOrder.entryPrice - newSL);
          newTP = Math.round((plannedOrder.entryPrice + (isBuy ? 1 : -1) * riskDist * targetRR) * 100) / 100;
        }
        onPlannedOrderChange?.({
          entryPrice: plannedOrder.entryPrice,
          slPrice: newSL,
          tpPrice: newTP,
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
      // If touchmove event already handled this touch frame, skip to prevent double pan
      if (e.pointerType === 'touch' && Date.now() - lastTouchMoveTimeRef.current < 50) {
        return;
      }
      const dx = x - panStartRef.current.startX;
      const dy = y - panStartRef.current.startY;

      const nowPerf = performance.now();
      if (lastPanAnchorRef.current) {
        const dt = Math.max(1, nowPerf - lastPanAnchorRef.current.time);
        const vx = (x - lastPanAnchorRef.current.x) / dt;
        const vy = (y - lastPanAnchorRef.current.y) / dt;
        velocityRef.current = { vx, vy, timestamp: nowPerf };
      }
      lastPanAnchorRef.current = { x, y, time: nowPerf };

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

      // Vertical Pan / Mode Breaker
      if (isAutoScaleRef.current) {
        // Mode breaker: if vertical movement > 5px, transition to manual mode!
        if (Math.abs(dy) > 5) {
          setIsAutoScale(false);
          isAutoScaleRef.current = false;
          // Smooth seamless transition to manual pan without visual jump
          const currentBounds = lastAutoBoundsRef.current;
          panStartRef.current.startY = y;
          panStartRef.current.startMin = currentBounds.min;
          panStartRef.current.startMax = currentBounds.max;
          manualPriceRangeRef.current = { ...currentBounds };
          setManualPriceRange({ ...currentBounds });
        }
      } else if (panStartRef.current.startMin !== undefined && panStartRef.current.startMax !== undefined) {
        const span = panStartRef.current.startMax - panStartRef.current.startMin;
        const priceShift = (dy / vp.drawableHeight) * span;
        const newRange = {
          min: panStartRef.current.startMin + priceShift,
          max: panStartRef.current.startMax + priceShift,
        };
        manualPriceRangeRef.current = newRange;
        setManualPriceRange(newRange);
      }

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

    // 6. Update hover cursor style (desktop mouse only)
    if (e.pointerType !== 'touch') {
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
    }
  };

  // ── Pointer Up Handler ──
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
    lastTouchRef.current = null;

    if (axisDragStartRef.current?.isDragging) {
      lastAxisDragEndTimeRef.current = Date.now();
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
    axisDragStartRef.current = null;

    // Inertia Momentum Panning on release with Rubber-Band Elastic Damping
    if (dragModeRef.current === 'PAN_CHART' && velocityRef.current && (Math.abs(velocityRef.current.vx) > 0.05 || Math.abs(velocityRef.current.vy) > 0.05)) {
      let vx = velocityRef.current.vx * 15;
      let vy = velocityRef.current.vy * 15;
      velocityRef.current = null;

      const runInertia = () => {
        if (Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) {
          if (inertiaAnimIdRef.current) {
            cancelAnimationFrame(inertiaAnimIdRef.current);
            inertiaAnimIdRef.current = null;
          }
          return;
        }
        const vp = vpRef.current;
        if (vp && candlesRef.current.length > 0) {
          const minPanX = -Math.round(vp.chartW * 0.35);
          const maxPanX = Math.max(0, (candlesRef.current.length - 2) * vp.slot);
          const currentPanX = panXRef.current;
          let targetPanX = currentPanX + vx;

          // Soft elastic rubber-band damping at limits
          if (targetPanX < minPanX) {
            const overshoot = minPanX - targetPanX;
            targetPanX = minPanX - overshoot * 0.35;
            vx *= 0.5;
          } else if (targetPanX > maxPanX) {
            const overshoot = targetPanX - maxPanX;
            targetPanX = maxPanX + overshoot * 0.35;
            vx *= 0.5;
          }

          panXRef.current = targetPanX;
          setPanOffsetX(targetPanX);

          if (!isAutoScaleRef.current && manualPriceRangeRef.current && vp.drawableHeight > 10) {
            const span = manualPriceRangeRef.current.max - manualPriceRangeRef.current.min;
            const priceShift = (vy / vp.drawableHeight) * span;
            const newRange = {
              min: manualPriceRangeRef.current.min + priceShift,
              max: manualPriceRangeRef.current.max + priceShift,
            };
            manualPriceRangeRef.current = newRange;
            setManualPriceRange(newRange);
          }

          vx *= 0.94; // Weighted tactile feel
          vy *= 0.94;
          inertiaAnimIdRef.current = requestAnimationFrame(runInertia);
        }
      };
      inertiaAnimIdRef.current = requestAnimationFrame(runInertia);
    }

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
  };

  // ── Double Click: Price Scale Auto-Reset or Replay Start ──
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    const vp = vpRef.current;
    if (!vp) return;

    if (x >= vp.chartW) {
      if (axisDragStartRef.current?.isDragging || Date.now() - lastAxisDragEndTimeRef.current < 400) {
        return;
      }
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

  // ── Context Menu (Right Click & Mobile Long-Press Clamping) ──
  const triggerContextMenu = useCallback((clientX: number, clientY: number, customTime?: number, customPrice?: number) => {
    const { x, y } = clientToCanvas(clientX, clientY);
    const vp = vpRef.current;
    if (!vp) return;

    const menuWidth = 250;
    const menuHeight = 380;
    const clampedX = Math.min(Math.max(8, clientX), (window.innerWidth || 360) - menuWidth - 12);
    const clampedY = Math.min(Math.max(50, clientY), (window.innerHeight || 640) - menuHeight - 12);

    const safeCandle = hoveredCandle || candles[candles.length - 1];
    const chartTime = customTime !== undefined
      ? customTime
      : (x >= 0 && x <= vp.chartW && y >= 0 && y <= vp.mainH)
      ? vp.xToTime(x)
      : (safeCandle ? new Date(safeCandle.time).getTime() : Date.now());
    const chartPrice = customPrice !== undefined
      ? customPrice
      : (x >= 0 && x <= vp.chartW && y >= 0 && y <= vp.mainH)
      ? Math.round(vp.yToPrice(y) * 1000) / 1000
      : (safeCandle ? safeCandle.close : 0);

    setContextMenu({
      x: clampedX,
      y: clampedY,
      chartTime,
      chartPrice,
    });
  }, [clientToCanvas, hoveredCandle, candles]);

  const openContextMenuAt = (clientX: number, clientY: number, customTime?: number, customPrice?: number) => {
    triggerContextMenu(clientX, clientY, customTime, customPrice);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    triggerContextMenu(e.clientX, e.clientY);
  };

  const latestC = candles[candles.length - 1];
  const activeC = hoveredCandle || latestC;
  const isCustomScaled = !isAutoScale || manualPriceRange !== null || priceZoom !== 1.0 || pricePanOffset !== 0;

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
  const hasAccountInfo = balance !== undefined || equity !== undefined;
  const effectiveEquity = equity ?? balance ?? 0;
  const isPositionOpen = hasOpenPositions ?? Boolean(activeTrade);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-w-0 min-h-0 flex-1 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden select-none touch-none overscroll-none shadow-sm"
    >
      {/* Top Chart Header Overlay / Dock */}
      <div className="w-full max-w-full overflow-x-hidden px-2 pt-2 pb-1.5 flex items-center justify-between gap-1 pointer-events-none z-20 box-border bg-slate-50 border-b border-slate-200">
        {/* Left: Symbol & Options triggers */}
        <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto min-w-0 shrink">
          <span className="font-bold text-[#121212] bg-white px-1.5 sm:px-2 py-0.5 border border-slate-200 rounded-lg text-[11px] sm:text-xs font-mono tracking-tight shadow-sm truncate">
            {symbol} • {timeframe}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (contextMenu) {
                setContextMenu(null);
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              const latest = candles[candles.length - 1];
              triggerContextMenu(
                rect.left,
                rect.bottom + 6,
                latest ? new Date(latest.time).getTime() : undefined,
                latest ? latest.close : undefined
              );
            }}
            title="Menu Opsi Chart (Set Replay, Reset View, Alat Gambar)"
            aria-label="Menu Opsi Chart"
            className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 text-xs font-bold font-mono bg-white text-[#121212] border-2 border-[#121212] rounded-lg shadow-[2px_2px_0px_0px_#121212] hover:bg-[#EAF2FF] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-[#1040C0]" />
            <span className="text-[10px] font-black uppercase tracking-wider">OPSI</span>
            <ChevronDown className="w-3 h-3 text-[#121212]" />
          </button>
        </div>

        {/* Right: Inner metric card nested safely inside parent */}
        {hasAccountInfo && (
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] px-2 sm:px-3 py-0.5 sm:py-1 rounded-md shrink-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase text-slate-500 tracking-wider">
              {isPositionOpen ? 'EQUITY' : 'BALANCE'}
            </span>
            <span className="text-xs sm:text-sm md:text-base font-black font-mono text-slate-900 leading-none">
              ${effectiveEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {isPositionOpen && floatingPnL !== undefined && (
              <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black border ${
                floatingPnL >= 0 
                  ? 'bg-[#E7F9F0] text-[#059669] border-[#059669]' 
                  : 'bg-[#FDECEC] text-[#DC2626] border-[#DC2626]'
              }`}>
                {floatingPnL >= 0 ? `+$${floatingPnL.toFixed(2)}` : `-$${Math.abs(floatingPnL).toFixed(2)}`}
                {floatingR !== undefined && ` (${floatingR >= 0 ? '+' : ''}${floatingR.toFixed(1)}R)`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Lower Indicator & OHLC Info Row (AUTO Row) */}
      <div className="w-full px-2 py-1 flex flex-wrap items-center justify-between bg-slate-50/80 border-b border-slate-200 text-xs z-10 gap-2 shrink-0 box-border">
        <div className="flex items-center gap-2 flex-wrap">
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
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
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
      <div ref={canvasWrapperRef} className="w-full flex-1 relative min-w-0 min-h-0 overflow-hidden touch-none overscroll-none select-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none overscroll-none block min-w-0 min-h-0 select-none"
          style={{
            touchAction: 'none',
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
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            touchStartPosRef.current = null;
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
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            touchStartPosRef.current = null;
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

      {/* Bauhaus Floating Timeframe Loader Overlay */}
      <AnimatePresence>
        {isTimeframeLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94 }}
            transition={{ duration: 0.16 }}
            className="absolute top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded-lg text-[#121212] font-mono font-black text-xs uppercase tracking-wider"
          >
            <RotateCw className="w-3.5 h-3.5 animate-spin text-[#1040C0] stroke-[2.5]" />
            <span>MEMUAT TIMEFRAME {timeframe}...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Double Click Confirmation Dialog */}
      <AnimatePresence>
        {dblConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setDblConfirm(null)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-lg p-4 max-w-[280px] w-[90%] space-y-3"
            >
              <div className="font-black text-[#121212] text-sm uppercase tracking-wide">
                Mulai Replay di Titik Ini?
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between border border-[#121212] bg-slate-50 rounded px-2.5 py-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#717182]">Waktu</span>
                  <span className="text-xs font-mono font-bold text-[#121212]">{format(dblConfirm.time, 'yyyy-MM-dd HH:mm')}</span>
                </div>
                <div className="flex items-center justify-between border border-[#121212] bg-slate-50 rounded px-2.5 py-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#717182]">Harga</span>
                  <span className="text-xs font-mono font-bold text-[#121212]">{dblConfirm.price.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDblConfirm(null)}
                  className="flex-1 border-2 border-[#121212] bg-white text-[#121212] font-bold text-xs px-3 py-1.5 rounded hover:bg-slate-50 active:translate-y-[1px] transition-transform cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onReplaySelectionClick?.(dblConfirm.time);
                    setDblConfirm(null);
                  }}
                  className="flex-1 border-2 border-[#121212] bg-[#121212] text-white font-bold text-xs px-3 py-1.5 rounded hover:bg-[#2a2a2a] active:translate-y-[1px] shadow-[2px_2px_0px_0px_#717182] active:shadow-none transition-all cursor-pointer"
                >
                  Set Replay Start
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Screen-Clamped Neo-Brutalist Compact Floating Popover Menu */}
      <AnimatePresence>
        {contextMenu && (
          <>
            {/* Backdrop click to dismiss */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="fixed inset-0 z-50 bg-black/20"
              onClick={() => {
                if (Date.now() - menuOpenedAtRef.current < 250) return;
                setContextMenu(null);
              }}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: -4 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              style={{ top: contextMenu.y, left: contextMenu.x }}
              role="menu"
              aria-label="Menu Opsi Chart"
              className="fixed z-50 w-[250px] bg-white/95 backdrop-blur-md border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl p-2 select-none"
            >
              {/* Header: Title + Close Icon */}
              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b-2 border-[#121212]">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#121212] font-mono">
                  Menu Opsi Chart
                </span>
                <button
                  type="button"
                  onClick={() => setContextMenu(null)}
                  className="p-1 text-slate-400 hover:text-[#121212] rounded hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>

              {/* Primary Action: Set Replay Start */}
              <button
                type="button"
                onClick={() => {
                  onReplaySelectionClick?.(new Date(contextMenu.chartTime));
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-black bg-amber-50 hover:bg-amber-100 text-amber-950 border-2 border-amber-400 rounded-lg shadow-[1px_1px_0px_0px_#B45309] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-between cursor-pointer transition-all mb-1.5"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Video className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">Set Replay Di Sini</span>
                </span>
                <span className="text-[9px] font-mono font-bold bg-amber-200 text-amber-900 px-1 py-0.5 rounded uppercase shrink-0">
                  Replay
                </span>
              </button>

              {/* Dedicated Action: Reset View (Default Zoom & Pan) */}
              <button
                type="button"
                onClick={() => {
                  handleResetView();
                  setContextMenu(null);
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-black bg-[#EBF2FF] hover:bg-[#DBEAFE] text-[#1040C0] border-2 border-blue-400 rounded-lg shadow-[1px_1px_0px_0px_#1040C0] active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-between cursor-pointer transition-all mb-2"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <RotateCcw className="w-3.5 h-3.5 text-[#1040C0] shrink-0" />
                  <span className="truncate">Reset View (Zoom & Pan)</span>
                </span>
                <span className="text-[9px] font-mono font-bold bg-blue-100 text-[#1040C0] px-1 py-0.5 rounded uppercase shrink-0">
                  Auto
                </span>
              </button>

              {/* Quick Tools Header */}
              <div className="text-[9px] font-black tracking-wider uppercase px-1 py-0.5 text-slate-500 font-mono">
                Alat Gambar
              </div>

              {/* Quick Tools List */}
              <div className="space-y-0.5 max-h-[190px] overflow-y-auto pr-0.5">
                {(['hline', 'vline', 'trendline', 'rect', 'fibonacci', 'measure'] as DrawingTool[]).map((t) => {
                  const labels: Record<string, { name: string; key: string }> = {
                    hline: { name: 'Horizontal Line', key: 'H' },
                    vline: { name: 'Vertical Line', key: 'V' },
                    trendline: { name: 'Trendline', key: 'T' },
                    rect: { name: 'Rectangle Zone', key: 'R' },
                    fibonacci: { name: 'Fibonacci', key: 'F' },
                    measure: { name: 'Measure Tool', key: 'M' },
                  };
                  const info = labels[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        onToolChange?.(t);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2 py-1 text-xs font-bold hover:bg-slate-100 flex items-center justify-between cursor-pointer rounded transition-colors text-slate-800"
                    >
                      <span className="truncate">{info.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 font-normal shrink-0">({info.key})</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    onToolChange?.('long_position');
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 text-xs font-bold hover:bg-emerald-50 text-[#059669] flex items-center justify-between cursor-pointer rounded transition-colors"
                >
                  <span>Long Position</span>
                  <span className="text-[10px] font-mono text-emerald-600 font-normal">(L)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToolChange?.('short_position');
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-2 py-1 text-xs font-bold hover:bg-rose-50 text-[#DC2626] flex items-center justify-between cursor-pointer rounded transition-colors"
                >
                  <span>Short Position</span>
                  <span className="text-[10px] font-mono text-rose-600 font-normal">(S)</span>
                </button>

                {drawings.length > 0 && (
                  <>
                    <div className="h-px bg-slate-200 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        onDrawingsChange?.([]);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2 py-1 text-xs font-bold hover:bg-rose-50 text-[#DC2626] flex items-center justify-between cursor-pointer rounded transition-colors"
                    >
                      <span>Hapus Semua Gambar</span>
                      <span className="text-[10px] font-mono text-rose-500 font-normal">({drawings.length})</span>
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Visual Order Confirmation Overlay — draggable, collapsible, safely clamped */}
      <AnimatePresence>
        {isVisualOrderActive && plannedOrder && (() => {
          const isBuy = plannedOrder.side === 'BUY';
          const sideColor = isBuy ? '#059669' : '#DC2626';
          const sideBg = isBuy ? '#E7F9F0' : '#FDECEC';

          const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
          const winW = typeof window !== 'undefined' ? window.innerWidth : 800;
          const winH = typeof window !== 'undefined' ? window.innerHeight : 600;
          const defaultW = overlayCollapsed ? 320 : 340;
          const defaultH = overlayCollapsed ? 48 : 240;
          const defaultX = Math.max(8, Math.min(winW - defaultW - 8, Math.round((winW - defaultW) / 2)));
          const defaultY = isMobile ? 65 : 20;

          const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;
            // Don't initiate drag if user tapped an interactive button, input, or link
            if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;

            e.stopPropagation();
            const el = overlayContainerRef.current;
            if (!el) return;

            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}

            const rect = el.getBoundingClientRect();
            overlayDragState.current = {
              isDragging: true,
              startX: e.clientX - rect.left,
              startY: e.clientY - rect.top,
              currentX: rect.left,
              currentY: rect.top,
            };
          };

          const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
            if (!overlayDragState.current.isDragging || !overlayContainerRef.current) return;
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.stopPropagation();
            e.preventDefault(); // Stop mobile scroll and pull-to-refresh

            const el = overlayContainerRef.current;
            const elW = el.offsetWidth || 340;
            const elH = el.offsetHeight || 180;
            const currentWinW = typeof window !== 'undefined' ? window.innerWidth : 800;
            const currentWinH = typeof window !== 'undefined' ? window.innerHeight : 600;

            const rawX = e.clientX - overlayDragState.current.startX;
            const rawY = e.clientY - overlayDragState.current.startY;

            const minX = 8;
            const maxX = Math.max(minX, currentWinW - elW - 8);
            const minY = 8;
            const maxY = Math.max(minY, currentWinH - elH - 8);

            const clampedX = Math.max(minX, Math.min(maxX, rawX));
            const clampedY = Math.max(minY, Math.min(maxY, rawY));

            overlayDragState.current.currentX = clampedX;
            overlayDragState.current.currentY = clampedY;

            // DIRECT GPU ACCELERATED DOM TRANSFORM (ZERO REACT RE-RENDERS)
            el.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
          };

          const handleOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
            if (!overlayDragState.current.isDragging) return;
            e.stopPropagation();
            overlayDragState.current.isDragging = false;

            try {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            } catch {}

            const el = overlayContainerRef.current;
            if (el) {
              const rect = el.getBoundingClientRect();
              overlayPosRef.current = { x: rect.left, y: rect.top };
            }
          };

          const curPos = overlayPosRef.current || { x: defaultX, y: defaultY };
          const posStyle: React.CSSProperties = {
            position: 'fixed',
            top: 0,
            left: 0,
            transform: `translate3d(${curPos.x}px, ${curPos.y}px, 0)`,
            margin: 0,
            touchAction: 'none',
          };

          return (
            <div
              ref={overlayContainerRef}
              style={posStyle}
              className={`fixed z-50 pointer-events-auto select-none touch-none will-change-transform ${
                overlayCollapsed ? 'w-auto max-w-[min(96vw,460px)]' : 'w-[min(92vw,340px)] max-w-[340px]'
              }`}
              onPointerDown={handleOverlayPointerDown}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              onPointerCancel={handleOverlayPointerUp}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="w-full bg-white/95 backdrop-blur-md border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl overflow-hidden"
              >
                {/* Collapsed single-row horizontal pill: [ ⠿ BUY | {lot}L | SL {sl} | TP {tp} | BATAL | KONFIRMASI | ⌵ ] */}
                {overlayCollapsed ? (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/95">
                    {/* Drag Grip */}
                    <div
                      className="cursor-grab active:cursor-grabbing p-1 text-[#717182] hover:text-[#121212] select-none touch-none"
                      title="Geser posisi bar"
                    >
                      <GripHorizontal className="w-3.5 h-3.5 pointer-events-none" />
                    </div>

                {/* Side badge */}
                <span
                  className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 border border-[#121212] rounded font-mono shrink-0"
                  style={{ background: sideBg, color: sideColor }}
                >
                  {plannedOrder.side}
                </span>

                {/* Lot size */}
                <span className="text-[11px] font-mono text-[#1040C0] font-black shrink-0">
                  {plannedOrder.lotSize.toFixed(2)}L
                </span>

                {/* SL / TP Badges */}
                <div className="hidden xs:flex items-center gap-1.5 text-[10px] font-mono font-bold shrink-0">
                  <span className="text-[#DC2626]">
                    SL {plannedOrder.slPrice && plannedOrder.slPrice > 0 ? plannedOrder.slPrice.toFixed(1) : '-'}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-[#059669]">
                    TP {plannedOrder.tpPrice && plannedOrder.tpPrice > 0 ? plannedOrder.tpPrice.toFixed(1) : '-'}
                  </span>
                </div>

                <div className="flex-1 min-w-0" />

                {/* Action: Batal */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCancelVisualOrder?.(); }}
                  className="px-2 py-0.5 border border-slate-300 hover:border-[#121212] text-slate-600 hover:text-[#121212] font-black text-[10px] uppercase rounded transition-all cursor-pointer shrink-0"
                >
                  Batal
                </button>

                {/* Action: Konfirmasi */}
                <button
                  type="button"
                  disabled={plannedOrder.isValid === false}
                  onClick={(e) => { e.stopPropagation(); onConfirmVisualOrder?.(); }}
                  className={`px-2.5 py-1 border-2 border-[#121212] font-black text-[10px] uppercase tracking-wider rounded transition-all cursor-pointer shrink-0 ${
                    plannedOrder.isValid === false
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-[#121212] text-white hover:bg-[#2a2a2a] shadow-[1.5px_1.5px_0px_0px_#717182] active:shadow-none active:translate-y-[1px]'
                  }`}
                >
                  Konfirmasi
                </button>

                {/* Expand Chevron ⌵ */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOverlayCollapsed(false); }}
                  className="p-1 text-[#717182] hover:text-[#121212] hover:bg-slate-100 rounded transition-colors cursor-pointer shrink-0"
                  title="Perluas panel"
                  aria-label="Perluas panel"
                >
                  <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            ) : (
              <>
                {/* Drag handle */}
                <div
                  className="flex items-center justify-between px-2 py-1 bg-[#F0F0F0] border-b-2 border-[#121212] cursor-grab active:cursor-grabbing select-none touch-none"
                >
                  <div className="flex items-center gap-1.5">
                    <GripHorizontal className="w-3.5 h-3.5 text-[#717182] pointer-events-none" />
                    <span
                      className="text-[9px] font-black uppercase tracking-wider px-1 py-0.2 border border-[#121212] rounded"
                      style={{ background: sideBg, color: sideColor }}
                    >
                      {plannedOrder.side}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#717182]">
                      {plannedOrder.orderType ? getOrderTypeLabel(plannedOrder.orderType) : 'Order'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setOverlayCollapsed(true); }}
                      className="p-0.5 text-[#717182] hover:text-[#121212] hover:bg-white/60 rounded transition-colors cursor-pointer"
                      aria-label="Ciutkan panel"
                      title="Ciutkan panel (Minimize)"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCancelVisualOrder?.(); }}
                      className="p-0.5 text-[#717182] hover:text-[#DC2626] hover:bg-red-50 rounded transition-colors cursor-pointer"
                      aria-label="Batal"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded — compact details */}
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
              </>
            )}
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Floating Action Bar for Selected Pending Order on Chart (Edit or Delete) */}
      <AnimatePresence>
        {selectedPendingOrder && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="fixed sm:absolute top-20 sm:top-16 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-20px)] max-w-[480px] bg-white/95 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex items-center justify-between gap-1.5 sm:gap-3 backdrop-blur-sm overflow-hidden box-border"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 pr-1.5 sm:pr-3 border-r border-[#121212]/15 shrink min-w-0 overflow-hidden">
              <span
                className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] rounded font-black font-mono border border-[#121212] shrink-0 ${
                  selectedPendingOrder.side === 'LONG'
                    ? 'bg-[#E7F9F0] text-[#059669]'
                    : 'bg-[#FDECEC] text-[#DC2626]'
                }`}
              >
                {selectedPendingOrder.orderType.replace('_', ' ')}
              </span>
              <span className="font-mono font-black text-xs text-[#121212] truncate">
                @{selectedPendingOrder.entryPrice.toFixed(2)}
              </span>
              <span className="font-mono font-bold text-[10px] sm:text-xs text-[#717182] bg-slate-100 px-1 py-0.5 rounded shrink-0">
                {selectedPendingOrder.volume.toFixed(2)}L
              </span>
            </div>

            <div className="text-[10px] font-mono text-[#717182] hidden md:flex items-center gap-2 shrink-0">
              <span>SL: {selectedPendingOrder.slPrice > 0 ? `$${selectedPendingOrder.slPrice.toFixed(2)}` : 'None'}</span>
              <span>•</span>
              <span>TP: {selectedPendingOrder.tpPrice > 0 ? `$${selectedPendingOrder.tpPrice.toFixed(2)}` : 'None'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 ml-auto shrink-0">
              {onEditPendingOrder && (
                <button
                  type="button"
                  onClick={() => {
                    onEditPendingOrder(selectedPendingOrder);
                    setSelectedPendingOrderId(null);
                  }}
                  className="flex items-center gap-1 px-1.5 sm:px-2 py-1 bg-[#1040C0] hover:bg-[#0D3399] text-white font-bold text-xs rounded border border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer whitespace-nowrap"
                  title="Edit Entry, SL, atau TP pada Chart"
                >
                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Edit</span>
                </button>
              )}

              {onCancelPendingOrder && (
                <button
                  type="button"
                  onClick={() => {
                    onCancelPendingOrder(selectedPendingOrder.id);
                    setSelectedPendingOrderId(null);
                  }}
                  className="flex items-center gap-1 px-1.5 sm:px-2 py-1 bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#DC2626] font-bold text-xs rounded border border-[#DC2626] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer whitespace-nowrap"
                  title="Hapus / Batalkan Pending Order Ini"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">Hapus</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedPendingOrderId(null)}
                className="p-1 text-[#717182] hover:text-[#121212] hover:bg-slate-100 rounded cursor-pointer transition-colors shrink-0"
                title="Tutup Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Bar for Selected Active Position on Chart */}
      <AnimatePresence>
        {isActiveTradeSelected && activeTrade && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="fixed sm:absolute top-20 sm:top-16 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-20px)] max-w-[480px] bg-white/95 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex items-center justify-between gap-1.5 sm:gap-3 backdrop-blur-sm overflow-hidden box-border"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 pr-1.5 sm:pr-3 border-r border-[#121212]/15 shrink min-w-0 overflow-hidden">
              <span
                className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] rounded font-black font-mono border border-[#121212] shrink-0 ${
                  activeTrade.side === 'LONG'
                    ? 'bg-[#E7F9F0] text-[#059669]'
                    : 'bg-[#FDECEC] text-[#DC2626]'
                }`}
              >
                POSISI {activeTrade.side === 'LONG' ? 'BUY' : 'SELL'}
              </span>
              <span className="font-mono font-black text-xs text-[#121212] truncate">
                @{activeTrade.entryPrice.toFixed(2)}
              </span>
              <span className="font-mono font-bold text-[10px] sm:text-xs text-[#717182] bg-slate-100 px-1 py-0.5 rounded shrink-0">
                {activeTrade.volume.toFixed(2)}L
              </span>
            </div>

            <div className="text-[10px] font-mono text-[#717182] hidden md:flex items-center gap-2 shrink-0">
              <span>SL: {activeTrade.slPrice > 0 ? `$${activeTrade.slPrice.toFixed(2)}` : 'None'}</span>
              <span>•</span>
              <span>TP: {activeTrade.tpPrice > 0 ? `$${activeTrade.tpPrice.toFixed(2)}` : 'None'}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 ml-auto shrink-0">
              {onCloseActiveTrade && (
                <button
                  type="button"
                  onClick={() => {
                    onCloseActiveTrade();
                    setIsActiveTradeSelected(false);
                  }}
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs rounded border border-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer whitespace-nowrap"
                  title="Tutup Posisi Ini Sekarang"
                >
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Tutup</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsActiveTradeSelected(false)}
                className="p-1 text-[#717182] hover:text-[#121212] hover:bg-slate-100 rounded cursor-pointer transition-colors shrink-0"
                title="Tutup Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Drawing Action Bar for Selected Drawing with Boundary Clamping */}
      <AnimatePresence>
        {selectedDrawing && (() => {
          const vp = vpRef.current;
          let rawX = ((dimensions.width || 800) - 280) / 2;
          let rawY = 48;

          if (vp) {
            const d = selectedDrawing;
            if (d.type === 'hline' && d.price != null) {
              rawX = (vp.chartW - 280) / 2;
              rawY = vp.getY(d.price) - 52;
            } else if (d.type === 'vline' && d.time != null) {
              rawX = vp.timeToX(d.time) - 140;
              rawY = 48;
            } else if (d.startTime != null && d.startPrice != null) {
              const x1 = vp.timeToX(d.startTime);
              const y1 = vp.getY(d.startPrice);
              if (d.endTime != null && d.endPrice != null) {
                const x2 = vp.timeToX(d.endTime);
                const y2 = vp.getY(d.endPrice);
                const midX = (x1 + x2) / 2;
                const minY = Math.min(y1, y2);
                rawX = midX - 140;
                rawY = minY - 52;
                if (rawY < 48) {
                  rawY = Math.max(y1, y2) + 18;
                }
              } else {
                rawX = x1 - 140;
                rawY = y1 - 52;
              }
            } else if (d.type === 'long_position' || d.type === 'short_position') {
              if (d.startTime != null) {
                const x1 = vp.timeToX(d.startTime);
                const x2 = d.endTime ? vp.timeToX(d.endTime) : x1 + 180;
                rawX = (x1 + x2) / 2 - 140;
                const topPrice = Math.max(d.startPrice || 0, d.slPrice || 0, d.tpPrice || 0);
                rawY = vp.getY(topPrice) - 52;
              }
            }
          }

          const TOOLBAR_WIDTH = 280;
          const TOOLBAR_HEIGHT = 45;

          const containerW = dimensions.width || (typeof window !== 'undefined' ? window.innerWidth : 800);
          const containerH = dimensions.height || (typeof window !== 'undefined' ? window.innerHeight : 500);
          const winW = typeof window !== 'undefined' ? window.innerWidth : containerW;
          const winH = typeof window !== 'undefined' ? window.innerHeight : containerH;
          const maxSafeW = Math.min(containerW, winW);
          const maxSafeH = Math.min(containerH, winH);

          // Clamp X to ensure it never bleeds past the right edge (leaving a 12px safe margin)
          const safeX = Math.min(Math.max(12, rawX), maxSafeW - TOOLBAR_WIDTH - 12);
          // Clamp Y to ensure it doesn't bleed off the top or bottom
          const safeY = Math.min(Math.max(12, rawY), maxSafeH - TOOLBAR_HEIGHT - 12);

          return (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              style={{ left: `${safeX}px`, top: `${safeY}px` }}
              className="absolute z-50 bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] rounded-lg p-1 flex items-center gap-1 text-slate-900 select-none whitespace-nowrap"
            >
              <span className="px-2 py-1 text-[10px] font-black tracking-wider uppercase text-slate-500 border-r-2 border-slate-200 shrink-0">
                {selectedDrawing.type.replace('_', ' ')}
              </span>

              {(selectedDrawing.type === 'long_position' || selectedDrawing.type === 'short_position') && onExecutePlannedTrade && (
                <button
                  type="button"
                  onClick={() => onExecutePlannedTrade(selectedDrawing)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md bg-[#121212] text-white hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                  title="Buka Posisi Langsung dari Tool Ini"
                >
                  <Zap className="w-3.5 h-3.5 fill-current text-amber-400" />
                  <span>Buka Posisi</span>
                </button>
              )}

              {selectedDrawing.type === 'fibonacci' && (
                <button
                  type="button"
                  onClick={() => setFibSettingsOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md hover:bg-slate-100 transition-colors text-[#121212] cursor-pointer"
                  title="Pengaturan Level Fibonacci"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-600" />
                  <span>Settings</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onDrawingsChange?.(drawings.filter((d) => d.id !== selectedDrawing.id));
                  onSelectDrawing?.(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Hapus Gambar (Del / Backspace)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Fibonacci Settings Modal (Neo-Brutalist Bauhaus) */}
      <AnimatePresence>
        {fibSettingsOpen && selectedDrawing && selectedDrawing.type === 'fibonacci' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
              onClick={() => setFibSettingsOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 bg-white border-2 border-[#121212] rounded-xl shadow-[6px_6px_0px_0px_#121212] w-full max-w-md p-4 space-y-4 text-xs text-[#121212]"
            >
              <div className="flex items-center justify-between border-b-2 border-[#121212] pb-2.5">
                <div className="flex items-center gap-2 font-black text-sm text-[#121212]">
                  <Settings className="w-4 h-4 text-[#1040C0]" />
                  <span>Pengaturan Level Fibonacci</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFibSettingsOpen(false)}
                  className="p-1 text-slate-500 hover:text-[#121212] rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {(selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS).map((lvl, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
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
                      className="w-4 h-4 rounded border-2 border-[#121212] text-[#1040C0] focus:ring-0 cursor-pointer"
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
                      className="w-20 bg-white border-2 border-[#121212] rounded px-2 py-0.5 text-[#121212] font-mono font-bold text-xs focus:border-[#1040C0] outline-none"
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
                    <span className="text-[11px] text-slate-600 font-mono font-bold flex-1">
                      {(lvl.value * 100).toFixed(1)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const curLevels = (selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS).filter((_, i) => i !== idx);
                        const updated = drawings.map((d) =>
                          d.id === selectedDrawing.id ? { ...d, fibLevels: curLevels } : d
                        );
                        onDrawingsChange?.(updated);
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                      title="Hapus level"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t-2 border-[#121212]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const curLevels = [...(selectedDrawing.fibLevels || DEFAULT_FIBONACCI_LEVELS)];
                      curLevels.push({ value: 0.705, color: '#2962FF', visible: true });
                      const updated = drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, fibLevels: curLevels } : d
                      );
                      onDrawingsChange?.(updated);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 text-[#121212] border-2 border-[#121212] rounded-lg font-bold text-xs shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#059669]" />
                    <span>Tambah Level</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = drawings.map((d) =>
                        d.id === selectedDrawing.id ? { ...d, fibLevels: DEFAULT_FIBONACCI_LEVELS.map((l) => ({ ...l })) } : d
                      );
                      onDrawingsChange?.(updated);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-slate-600 hover:text-[#121212] text-xs font-bold transition-colors cursor-pointer"
                    title="Kembalikan ke level default TradingView"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Default</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setFibSettingsOpen(false)}
                  className="px-4 py-1.5 bg-[#121212] hover:bg-[#2a2a2a] text-white border-2 border-[#121212] rounded-lg font-black text-xs shadow-[2px_2px_0px_0px_#717182] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
