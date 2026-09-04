import React, { useRef, useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import {
  calculateFibonacciLevels,
  calculatePositionToolGeometry,
  updatePositionToolHandle,
  ChartTimeframe,
  TradeSide,
} from '../../../../server/src/services/backtestEngine';

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
}

export interface ChartIndicators {
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
}

interface CandlestickChartProps {
  candles: ChartCandle[];
  timeframe?: ChartTimeframe;
  appMode?: AppMode;
  activeTrade?: ActiveTradeMarker | null;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vpRef = useRef<VP | null>(null);

  // Container dimensions tracked by ResizeObserver
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 900, height: 500 });

  // Camera & Viewport State
  const [candleWidth, setCandleWidth] = useState<number>(8);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [priceZoom, setPriceZoom] = useState<number>(1.0);
  const [pricePanOffset, setPricePanOffset] = useState<number>(0);

  const cwRef = useRef<number>(8);
  const soRef = useRef<number>(0);
  const pzRef = useRef<number>(1.0);
  const poRef = useRef<number>(0);

  cwRef.current = candleWidth;
  soRef.current = scrollOffset;
  pzRef.current = priceZoom;
  poRef.current = pricePanOffset;

  // Interaction Drag States
  const dragModeRef = useRef<'NONE' | 'PAN_CHART' | 'SCALE_PRICE' | 'SCALE_TIME' | 'DRAWING_HANDLE'>('NONE');
  const panStartRef = useRef<{ startX: number; startY: number; startSO: number; startPO: number } | null>(null);
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

  // Follow replay: when true, keep viewport snapped to latest replay candle
  useEffect(() => {
    if (followReplay) {
      setScrollOffset(0);
    }
  }, [candles.length, followReplay]);

  // ResizeObserver on the container element to guarantee exact viewport dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(container);
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

  // ── Build Viewport Projection (Right-Pinned Continuous Transform) ──
  const buildVP = useCallback((cssW: number, cssH: number): VP => {
    const cw = cwRef.current;
    const so = soRef.current;
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
    const rightMargin = Math.max(35, slot * 8);

    // Visible index bounds calculated from screen width and right margin
    const lastGlobalIdx = candles.length - 1;
    const endIdx = Math.min(lastGlobalIdx, Math.max(0, Math.ceil(lastGlobalIdx - so + rightMargin / slot)));
    const startIdx = Math.max(0, Math.floor(lastGlobalIdx - so - (chartW - rightMargin) / slot) - 4);
    const vis = candles.slice(startIdx, Math.min(candles.length, endIdx + 1));

    // Dynamic Price Range Calculation
    let minP = Infinity, maxP = -Infinity;
    for (const c of vis) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }
    if (!isFinite(minP)) { minP = 3000; maxP = 3100; }

    if (activeTrade) {
      minP = Math.min(minP, activeTrade.slPrice, activeTrade.entryPrice);
      maxP = Math.max(maxP, activeTrade.tpPrice, activeTrade.entryPrice);
    }

    const midPrice = (maxP + minP) / 2;
    const baseRange = (maxP - minP) || 1;
    const scaledRange = (baseRange * 1.16) / Math.max(0.1, pz);
    const paddedMin = midPrice - scaledRange / 2 + po;
    const paddedMax = midPrice + scaledRange / 2 + po;
    const totalRange = paddedMax - paddedMin;

    // Stable Right-Aligned Projection Formula
    const getX = (gIdx: number) => {
      const distFromEnd = lastGlobalIdx - gIdx + so;
      return chartW - rightMargin - distFromEnd * slot + slot / 2;
    };

    const getY = (price: number) => {
      return ((paddedMax - price) / totalRange) * (candleH - 20) + 10;
    };

    const yToPrice = (y: number) => {
      return paddedMax - ((y - 10) / (candleH - 20)) * totalRange;
    };

    const xToGIdx = (x: number): number => {
      const distFromEnd = (chartW - rightMargin - x + slot / 2) / slot;
      return lastGlobalIdx + so - distFromEnd;
    };

    const timeToGIdx = (ms: number): number => {
      if (candles.length === 0) return 0;
      if (candles.length === 1) return 0;
      const t0 = new Date(candles[0].time).getTime();
      const tEnd = new Date(candles[candles.length - 1].time).getTime();
      if (ms <= t0) return (ms - t0) / 60000;
      if (ms >= tEnd) return (candles.length - 1) + (ms - tEnd) / 60000;

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
      if (gIdx <= 0) {
        const t0 = new Date(candles[0].time).getTime();
        return t0 + gIdx * 60000;
      }
      if (gIdx >= candles.length - 1) {
        const tEnd = new Date(candles[candles.length - 1].time).getTime();
        return tEnd + (gIdx - (candles.length - 1)) * 60000;
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
      priceZoom: pz, pricePanOffset: po,
      getX, getY, timeToGIdx, timeToX, xToGIdx, xToTime, yToPrice,
    };
  }, [candles, activeTrade]);

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
    ctx.fillStyle = '#0B101B';
    ctx.fillRect(0, 0, cssW, cssH);

    // Price Scale & Time Scale Backgrounds
    ctx.fillStyle = '#070C16';
    ctx.fillRect(chartW, 0, priceScaleW, cssH);
    ctx.fillRect(0, mainH, chartW, timeScaleH);

    if (candles.length === 0) {
      ctx.fillStyle = '#64748B'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Memuat data Dukascopy XAUUSD...', cssW / 2, cssH / 2);
      return;
    }

    // 2. Price Grid Lines & Right Price Scale Text
    ctx.strokeStyle = '#151D2C'; ctx.lineWidth = 1;
    for (let i = 0; i <= 7; i++) {
      const price = paddedMin + (i / 7) * totalRange;
      const y = getY(price);
      if (y < 0 || y > mainH) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();

      ctx.fillStyle = '#64748B'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(2), chartW + 6, y + 3.5);
    }

    // Scale separator borders
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, cssH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, mainH); ctx.lineTo(cssW, mainH); ctx.stroke();

    // 3. Adaptive Time Scale Labels
    const tStep = Math.max(1, Math.floor(vis.length / 7));
    for (let i = 0; i < vis.length; i += tStep) {
      const x = getX(startIdx + i);
      if (x < 0 || x > chartW) continue;
      ctx.strokeStyle = '#151D2C';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
      ctx.fillStyle = '#64748B'; ctx.font = '10px monospace'; ctx.textAlign = 'center';

      // Adaptive format depending on candle width
      const labelFmt = cw > 12 ? 'MM/dd HH:mm' : cw > 5 ? 'dd HH:mm' : 'MM/dd';
      ctx.fillText(format(new Date(vis[i].time), labelFmt), x, cssH - 7);
    }

    // 4. Volume Separator & Bars
    ctx.strokeStyle = '#151D2C'; ctx.lineWidth = 1;
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
      if (x < -cw || x > chartW + cw) continue;
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
          // Fibonacci Retracement + Extension
          const fibLevels = calculateFibonacciLevels(d.startPrice, d.endPrice);
          const lx = Math.min(x1, x2);
          const rx2 = Math.max(chartW, x1, x2);
          const colors = ['#F59E0B','#3B82F6','#10B981','#A78BFA','#EC4899','#8B5CF6','#14B8A6','#F97316'];
          fibLevels.forEach((fl, fi) => {
            const fy = getY(fl.price);
            ctx.strokeStyle = colors[fi % colors.length];
            ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(lx, fy); ctx.lineTo(rx2, fy); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = colors[fi % colors.length];
            ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
            ctx.fillText(`${fl.label}  ${fl.price.toFixed(2)}`, lx + 6, fy - 3);
          });
          if (isSel) {
            [{ x: x1, y: y1 }, { x: x2, y: y2 }].forEach(({ x, y }) => {
              ctx.fillStyle = '#F59E0B';
              ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5; ctx.stroke();
            });
          }
        }
      } else if ((d.type === 'long_position' || d.type === 'short_position') &&
        d.startTime != null && d.startPrice != null && d.slPrice != null && d.tpPrice != null) {
        const isLong = d.type === 'long_position';
        const eY = getY(d.startPrice), slY = getY(d.slPrice), tpY = getY(d.tpPrice);
        const px = timeToX(d.startTime);
        const endX = d.endTime ? timeToX(d.endTime) : px + 180;
        const boxW = Math.max(120, endX - px);

        // Profit zone
        const profTop = Math.min(eY, tpY);
        ctx.fillStyle = 'rgba(16,185,129,.2)'; ctx.fillRect(px, profTop, boxW, Math.abs(tpY - eY));
        ctx.strokeStyle = '#10B981'; ctx.lineWidth = 1; ctx.strokeRect(px, profTop, boxW, Math.abs(tpY - eY));

        // Risk zone
        const riskTop = Math.min(eY, slY);
        ctx.fillStyle = 'rgba(239,68,68,.2)'; ctx.fillRect(px, riskTop, boxW, Math.abs(slY - eY));
        ctx.strokeStyle = '#EF4444'; ctx.strokeRect(px, riskTop, boxW, Math.abs(slY - eY));

        // Entry line
        ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, eY); ctx.lineTo(px + boxW, eY); ctx.stroke();

        // Info Tag Box
        const rPts = Math.abs(d.startPrice - d.slPrice);
        const rwPts = Math.abs(d.tpPrice - d.startPrice);
        const rr = rPts > 0 ? (rwPts / rPts).toFixed(2) : '0';
        ctx.fillStyle = '#0F172A'; ctx.fillRect(px + 4, eY - 18, 180, 30);
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 1; ctx.strokeRect(px + 4, eY - 18, 180, 30);
        ctx.fillStyle = isLong ? '#34D399' : '#F87171';
        ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`${isLong ? 'LONG' : 'SHORT'}  1:${rr} RR`, px + 10, eY - 4);
        ctx.fillStyle = '#94A3B8'; ctx.font = '9px monospace';
        ctx.fillText(`Risk: ${rPts.toFixed(2)}  Rwd: ${rwPts.toFixed(2)}`, px + 10, eY + 8);

        // Draggable handles (TP, Entry, SL, Width)
        if (isSel) {
          const handles = [
            { y: tpY, color: '#10B981', label: 'TP' },
            { y: eY, color: '#38BDF8', label: 'ENTRY' },
            { y: slY, color: '#EF4444', label: 'SL' },
          ];
          const hx = px + boxW / 2;
          handles.forEach(({ y: hy, color, label }) => {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#FFF'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
            ctx.fillText(label, hx, hy + 3);
          });

          // Width handle at right edge
          ctx.fillStyle = '#60A5FA';
          ctx.beginPath(); ctx.arc(px + boxW, eY, 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }

    // 8. Active Trade Overlay with Risk/Reward Zones
    if (activeTrade) {
      const eY = getY(activeTrade.entryPrice);
      const slY = getY(activeTrade.slPrice);
      const tpY = getY(activeTrade.tpPrice);
      const isLong = activeTrade.side === 'LONG';

      // Shaded Profit Zone
      ctx.fillStyle = 'rgba(16,185,129,0.12)';
      ctx.fillRect(0, Math.min(eY, tpY), chartW, Math.abs(tpY - eY));

      // Shaded Risk Zone
      ctx.fillStyle = 'rgba(239,68,68,0.12)';
      ctx.fillRect(0, Math.min(eY, slY), chartW, Math.abs(slY - eY));

      ctx.setLineDash([4, 4]);
      const lines = [
        { p: activeTrade.entryPrice, c: '#06B6D4', l: `ENTRY (${activeTrade.volume} lot)` },
        { p: activeTrade.slPrice,    c: '#EF4444', l: `SL ${activeTrade.slPrice.toFixed(2)}` },
        { p: activeTrade.tpPrice,    c: '#10B981', l: `TP ${activeTrade.tpPrice.toFixed(2)}` },
      ];
      lines.forEach(({ p, c, l }) => {
        const y = getY(p);
        ctx.strokeStyle = c; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
        ctx.fillStyle = c; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'right';
        ctx.fillText(l, chartW - 6, y - 3);
      });
      ctx.setLineDash([]);
    }

    // 9. Replay Frontier Boundary
    const fx = getX(candles.length - 1);
    if (fx > 0 && fx < chartW) {
      ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, mainH); ctx.stroke();
      ctx.setLineDash([]);
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
    candles, candleWidth, scrollOffset, priceZoom, pricePanOffset, dimensions,
    activeTrade, indicators, drawings, drawingDraft, selectedDrawingId, mousePos,
    sma20v, sma50v, sma200v, buildVP,
  ]);

  // Wheel Zoom Listener (Centered Zoom)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setCandleWidth((prev) => Math.min(45, Math.max(2, prev * zoomFactor)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const clientToCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
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
    const THRESH_PX = 16;
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

          // Check TP line across whole box width
          if (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - tpY) < THRESH_PX) {
            return { drawing: sel, handleType: 'TP' };
          }
          // Check SL line across whole box width
          if (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - slY) < THRESH_PX) {
            return { drawing: sel, handleType: 'SL' };
          }
          // Check Entry line across whole box width
          if (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - eY) < THRESH_PX) {
            return { drawing: sel, handleType: 'ENTRY' };
          }
          // Check Width Handle at right edge
          if (Math.abs(x - (px + boxW)) < THRESH_PX && y >= Math.min(tpY, slY) - 10 && y <= Math.max(tpY, slY) + 10) {
            return { drawing: sel, handleType: 'WIDTH' };
          }
          // Check Body Move
          if (x >= px && x <= px + boxW && y >= Math.min(tpY, slY) && y <= Math.max(tpY, slY)) {
            return { drawing: sel, handleType: 'MOVE_ALL' };
          }
        } else if (sel.type === 'trendline' || sel.type === 'rect' || sel.type === 'fibonacci' || sel.type === 'measure') {
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
        if (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - tpY) < THRESH_PX) return { drawing: d, handleType: 'TP' };
        if (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - slY) < THRESH_PX) return { drawing: d, handleType: 'SL' };
        if (x >= px - 10 && x <= px + boxW + 10 && Math.abs(y - eY) < THRESH_PX) return { drawing: d, handleType: 'ENTRY' };
        if (x >= px && x <= px + boxW && y >= Math.min(tpY, slY) && y <= Math.max(tpY, slY)) {
          return { drawing: d, handleType: 'MOVE_ALL' };
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

    // 3. Cursor / Crosshair Mode: Check drawings or Pan
    if (activeTool === 'cursor' || activeTool === 'crosshair') {
      const hit = hitTestDrawing(e.clientX, e.clientY);
      if (hit) {
        onSelectDrawing?.(hit.drawing.id);
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
      dragModeRef.current = 'PAN_CHART';
      panStartRef.current = { startX: x, startY: y, startSO: soRef.current, startPO: poRef.current };
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
      const nd: DrawingItem = {
        id: `d-${Date.now()}`,
        type: 'long_position',
        startTime: time,
        startPrice: price,
        slPrice: Math.round((price - 10) * 1000) / 1000,
        tpPrice: Math.round((price + 20) * 1000) / 1000,
        lockRR,
      };
      onDrawingsChange?.([...drawingsRef.current, nd]);
      onSelectDrawing?.(nd.id);
      onToolChange?.('cursor');
      return;
    }

    if (activeTool === 'short_position') {
      const nd: DrawingItem = {
        id: `d-${Date.now()}`,
        type: 'short_position',
        startTime: time,
        startPrice: price,
        slPrice: Math.round((price + 10) * 1000) / 1000,
        tpPrice: Math.round((price - 20) * 1000) / 1000,
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

    const vp = vpRef.current;
    if (!vp) return;

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

        if (dh.handleType === 'ENTRY' || dh.handleType === 'SL' || dh.handleType === 'TP') {
          const geo = calculatePositionToolGeometry(
            d.type === 'long_position' ? 'LONG' : 'SHORT',
            d.startPrice!,
            d.slPrice!,
            d.tpPrice!,
            d.lockRR ?? lockRR
          );
          const ng = updatePositionToolHandle(geo, dh.handleType, price);
          return {
            ...d,
            startPrice: ng.entryPrice,
            slPrice: ng.slPrice,
            tpPrice: ng.tpPrice,
          };
        }

        return d;
      });

      onDrawingsChange?.(updated);
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

      // X Shift: Drag right -> move back in history -> increase offset
      // Drag left -> scroll toward latest candle -> decrease offset
      const shift = dx / vp.slot;

      // CLAMP: scrollOffset >= 0 means oldest visible direction
      // scrollOffset max = candles.length - visibleCount/2 (don't show blank left area)
      // scrollOffset min = -(rightMargin/slot) means right edge shows empty future space
      // We allow a small negative so the right margin is honored but no further
      const minOffset = -(vp.rightMargin / vp.slot);
      const maxOffset = Math.max(0, candles.length - 2);
      const newOffset = Math.max(minOffset, Math.min(maxOffset, panStartRef.current.startSO + shift));
      setScrollOffset(newOffset);

      if (newOffset > 2 && onDisableFollowReplay) {
        onDisableFollowReplay();
      }

      // Y Shift: Drag down -> shift price pan offset
      const priceShift = (dy / (vp.candleH - 20)) * vp.totalRange;
      setPricePanOffset(panStartRef.current.startPO + priceShift);

      // Trigger older candle prefetch when approaching left boundary
      if (vp.startIdx < 80) {
        onLoadOlderCandles?.();
      }

      // In Analysis mode: trigger newer candle prefetch when near right edge
      if (appMode === 'analysis' && newOffset < 10) {
        onLoadNewerCandles?.();
      }
      return;
    }

    // 6. Update hover cursor style
    if (x >= vp.chartW) {
      setHoverCursor('ns-resize');
    } else if (y >= vp.mainH) {
      setHoverCursor('ew-resize');
    } else if (activeTool === 'cursor') {
      const hit = hitTestDrawing(e.clientX, e.clientY);
      if (hit) {
        if (hit.handleType === 'TP' || hit.handleType === 'SL' || hit.handleType === 'ENTRY') setHoverCursor('ns-resize');
        else if (hit.handleType === 'WIDTH') setHoverCursor('ew-resize');
        else if (hit.handleType === 'P1' || hit.handleType === 'P2') setHoverCursor('crosshair');
        else setHoverCursor('move');
      } else {
        setHoverCursor('default');
      }
    } else {
      setHoverCursor('crosshair');
    }

    // 7. Update hovered candle for HUD
    if (x <= vp.chartW) {
      const idx = Math.round(vp.xToGIdx(x));
      setHoveredCandle(idx >= 0 && idx < candles.length ? candles[idx] : null);
    }
  };

  // ── Pointer Up Handler ──
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragModeRef.current = 'NONE';
    panStartRef.current = null;
    priceScaleStartRef.current = null;
    timeScaleStartRef.current = null;
    draggingHandleRef.current = null;

    if (draftRef.current && draftStartMouseRef.current) {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      const dist = Math.hypot(x - draftStartMouseRef.current.x, y - draftStartMouseRef.current.y);
      if (dist > 6) {
        const vp = vpRef.current;
        if (vp) {
          const price = Math.round(vp.yToPrice(y) * 1000) / 1000;
          const time = vp.xToTime(x);
          const completed: DrawingItem = {
            ...draftRef.current,
            endTime: time,
            endPrice: price,
          };
          if (draftRef.current.type !== 'measure') {
            onDrawingsChange?.([...drawingsRef.current, completed]);
            onSelectDrawing?.(completed.id);
          }
          setDrawingDraft(null);
          draftStartMouseRef.current = null;
          onToolChange?.('cursor');
        }
      }
    }
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
      setScrollOffset(0);
      return;
    }

    const price = Math.round(vp.yToPrice(y) * 1000) / 1000;
    const time = vp.xToTime(x);

    if (e.shiftKey) {
      onSetReplayStart?.(new Date(time));
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

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-w-0 min-h-0 flex-1 flex flex-col bg-[#0B101B] border border-slate-800 rounded-xl overflow-hidden select-none touch-none overscroll-none"
    >
      {/* Top HUD: Asset, Timeframe, OHLC Values & SMA Toggles */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1 bg-slate-900/90 backdrop-blur border-b border-slate-800 text-xs z-10 gap-2 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
            XAUUSD • {timeframe}
          </span>
          {activeC && (
            <span className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
              <span>
                O:
                <span className={activeC.close >= activeC.open ? ' text-emerald-400 font-bold' : ' text-rose-400 font-bold'}>
                  {' '}{activeC.open.toFixed(2)}
                </span>
              </span>
              <span>H: <span className="text-slate-100">{activeC.high.toFixed(2)}</span></span>
              <span>L: <span className="text-slate-100">{activeC.low.toFixed(2)}</span></span>
              <span>
                C:
                <span className={activeC.close >= activeC.open ? ' text-emerald-400 font-bold' : ' text-rose-400 font-bold'}>
                  {' '}{activeC.close.toFixed(2)}
                </span>
              </span>
              <span className="text-slate-500">{format(new Date(activeC.time), 'yyyy-MM-dd HH:mm')}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(['sma20', 'sma50', 'sma200'] as const).map((k) => {
            const labels: Record<string, string> = { sma20: 'SMA 20', sma50: 'SMA 50', sma200: 'SMA 200' };
            const colors: Record<string, string> = { sma20: 'amber', sma50: 'sky', sma200: 'purple' };
            const on = indicators[k];
            const c = colors[k];
            return (
              <button
                key={k}
                onClick={() => onIndicatorsChange?.({ ...indicators, [k]: !on })}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  on
                    ? `bg-${c}-500/20 text-${c}-300 border border-${c}-500/40`
                    : 'bg-slate-800 text-slate-500 hover:text-slate-300'
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
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/30 text-blue-300 border border-blue-500/50 hover:bg-blue-600/50 transition-all"
            >
              AUTO
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full flex-1 touch-none overscroll-none block min-w-0 min-h-0"
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
        onPointerLeave={() => {
          setMousePos(null);
          setHoveredCandle(null);
          dragModeRef.current = 'NONE';
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

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
                  onSetReplayStart?.(dblConfirm.time);
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
            onClick={() => onSetReplayStart?.(new Date(contextMenu.chartTime))}
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
    </div>
  );
};
