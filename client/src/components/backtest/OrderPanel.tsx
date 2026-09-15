import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  AlertTriangle,
  XCircle,
  Calculator,
  Lock,
  Crosshair,
  Clock,
  Trash2,
  Plus,
  Edit3,
} from 'lucide-react';
import {
  calculatePositionSize,
  calculateRR,
  calculateTPFromRR,
  calculatePnL,
  getSymbolContractSize,
  getDefaultSlDistance,
  calculateAdaptiveSlDistance,
  calculateAdaptiveOffsets,
  BacktestTradeRecord,
  TradeSide,
} from '../../shared/backtestEngine';
import type { AppMode } from './ReplayControls';
import type { PlannedOrderPreview } from './CandlestickChart';
import {
  OrderCategory,
  OrderDirection,
  OrderExecutionType,
  PendingOrderRecord,
  resolveOrderType,
  deconstructOrderType,
  getOrderTypeLabel,
  validateOrderPrices,
  getEffectiveOrderType,
  getSymbolPriceTolerance,
} from './OrderTypes';

export interface OrderPanelProps {
  symbol?: string;
  candles?: Array<{ high: number; low: number; close?: number }>;
  currentPrice: number;
  balance: number;
  riskPercent: number;
  onRiskPercentChange: (risk: number) => void;
  activeTrade?: BacktestTradeRecord | null;
  pendingOrders?: PendingOrderRecord[];
  onCancelPendingOrder?: (id: string) => void;
  onEditPendingOrder?: (id: string) => void;
  onOpenTrade: (trade: {
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => void;
  onPlaceOrder?: (order: {
    orderType: OrderExecutionType;
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => void;
  onVisualOrderSubmit?: (trade: {
    orderType?: OrderExecutionType;
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => void;
  onCloseTrade: (tradeId: string) => void;
  intrabarWarning?: string | null;
  isSubmitting?: boolean;
  appMode?: AppMode;
  onActivateReplay?: () => void;
  onPlannedTradeChange?: (planned: PlannedOrderPreview | null) => void;
  onPickChartEntry?: (orderType: OrderExecutionType) => void;
  controlledEntryPrice?: number | null;
  controlledSlPrice?: number | null;
  controlledTpPrice?: number | null;
  selectedSideOverride?: TradeSide;
  onSideChange?: (side: TradeSide) => void;
  selectedOrderTypeOverride?: OrderExecutionType;
  lockRR?: boolean;
  onToggleLockRR?: () => void;
}

const RR_PRESETS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0];

export interface OrderPanelHandle {
  executeQuick: (side: TradeSide) => void;
  getSide: () => TradeSide;
}

export const OrderPanel = forwardRef<OrderPanelHandle, OrderPanelProps>(function OrderPanel(
  {
    symbol = 'XAUUSD',
    candles,
    currentPrice,
    balance,
    riskPercent,
    onRiskPercentChange,
    activeTrade,
    pendingOrders = [],
    onCancelPendingOrder,
    onEditPendingOrder,
    onOpenTrade,
    onPlaceOrder,
    onCloseTrade,
    intrabarWarning,
    isSubmitting = false,
    onPlannedTradeChange,
    onPickChartEntry,
    controlledEntryPrice,
    controlledSlPrice,
    controlledTpPrice,
    selectedSideOverride,
    onSideChange,
    selectedOrderTypeOverride,
    onVisualOrderSubmit,
    lockRR,
    onToggleLockRR,
  }: OrderPanelProps,
  ref
) {
  const symUpper = (symbol || '').toUpperCase();
  const priceDecimals = (symUpper.includes('EUR') || symUpper.includes('GBP') || symUpper.includes('AUD') || symUpper.includes('NZD') || symUpper.includes('CAD') || symUpper.includes('CHF')) ? 4 : (symUpper.includes('JPY') ? 3 : 2);
  const priceStep = priceDecimals >= 4 ? '0.0001' : '0.01';
  const roundPrice = (p: number) => {
    const factor = Math.pow(10, priceDecimals);
    return Math.round(p * factor) / factor;
  };
  const formatPrice = (p: number) => p.toFixed(priceDecimals);

  const [internalLockRR, setInternalLockRR] = useState<boolean>(false);
  const isRRLocked = lockRR !== undefined ? lockRR : internalLockRR;

  // Order Type state: Category (MARKET / LIMIT / STOP) and Direction (BUY / SELL)
  const [orderCategory, setOrderCategory] = useState<OrderCategory>('MARKET');
  const [orderDirection, setOrderDirection] = useState<OrderDirection>(
    selectedSideOverride === 'SHORT' ? 'SELL' : 'BUY'
  );

  const [entryPriceStr, setEntryPriceStr] = useState<string>('');
  const [slPriceStr, setSlPriceStr] = useState<string>('');
  const [tpPriceStr, setTpPriceStr] = useState<string>('');
  const [selectedRR, setSelectedRR] = useState<number>(2.0);
  const [rrInputStr, setRrInputStr] = useState<string>('2');
  const [riskInputStr, setRiskInputStr] = useState<string>(String(riskPercent));
  const [showChartPlannedLines, setShowChartPlannedLines] = useState<boolean>(false);

  // Dynamic Effective Order Classification
  const parsedEntryNum = parseFloat(entryPriceStr) || currentPrice;
  const tolerance = getSymbolPriceTolerance(symbol);
  const effectiveEntry = orderCategory === 'MARKET'
    ? currentPrice
    : parsedEntryNum;

  const effectiveClassification = getEffectiveOrderType({
    direction: orderDirection,
    entryPrice: effectiveEntry,
    marketPrice: currentPrice,
    symbol,
    requestedCategory: orderCategory,
  });
  const currentOrderType = effectiveClassification.orderType;

  // Numbers & Metrics for locking and validation
  const numSL = parseFloat(slPriceStr) || 0;
  const numTP = parseFloat(tpPriceStr) || 0;
  const tradeSide: TradeSide = orderDirection === 'BUY' ? 'LONG' : 'SHORT';
  const rrCalc = calculateRR(tradeSide, effectiveEntry, numSL, numTP);

  const toggleRRLock = () => {
    if (!isRRLocked && rrCalc.isValid && rrCalc.rr > 0) {
      setSelectedRR(rrCalc.rr);
      setRrInputStr(rrCalc.rr.toFixed(1));
    }
    if (onToggleLockRR) onToggleLockRR();
    else setInternalLockRR((v) => !v);
  };

  // Sync risk % prop
  useEffect(() => {
    if (parseFloat(riskInputStr) !== riskPercent) {
      setRiskInputStr(String(riskPercent));
    }
  }, [riskPercent]);

  // Sync external side override
  useEffect(() => {
    if (selectedSideOverride) {
      const newDir: OrderDirection = selectedSideOverride === 'LONG' ? 'BUY' : 'SELL';
      setOrderDirection(newDir);
      if (slPriceStr && tpPriceStr) {
        const baseEntry = orderCategory === 'MARKET' ? currentPrice : (parseFloat(entryPriceStr) || currentPrice);
        resetLevelsForPrice(baseEntry, newDir, selectedRR);
      }
    }
  }, [selectedSideOverride]);

  // Sync external order type override (e.g. from toolbar)
  useEffect(() => {
    if (selectedOrderTypeOverride) {
      const { category, direction } = deconstructOrderType(selectedOrderTypeOverride);
      setOrderCategory(category);
      setOrderDirection(direction);
    }
  }, [selectedOrderTypeOverride]);

  // Sync external controlled Entry/SL/TP from chart drag
  useEffect(() => {
    if (controlledEntryPrice !== undefined && controlledEntryPrice !== null && controlledEntryPrice > 0) {
      setEntryPriceStr(formatPrice(controlledEntryPrice));
      if (currentPrice > 0) {
        const eff = getEffectiveOrderType({
          direction: orderDirection,
          entryPrice: controlledEntryPrice,
          marketPrice: currentPrice,
          symbol,
        });
        setOrderCategory(eff.category);
      }
    }
  }, [controlledEntryPrice, symbol]);

  useEffect(() => {
    if (controlledSlPrice !== undefined && controlledSlPrice !== null && controlledSlPrice > 0) {
      setSlPriceStr(formatPrice(controlledSlPrice));
      setShowChartPlannedLines(true);
    } else if (controlledSlPrice === null) {
      setSlPriceStr('');
    }
  }, [controlledSlPrice, symbol]);

  useEffect(() => {
    if (controlledTpPrice !== undefined && controlledTpPrice !== null && controlledTpPrice > 0) {
      setTpPriceStr(formatPrice(controlledTpPrice));
      setShowChartPlannedLines(true);
    } else if (controlledTpPrice === null) {
      setTpPriceStr('');
    }
  }, [controlledTpPrice, symbol]);

  // Helper to re-calculate clean SL/TP from price, direction, and RR
  const resetLevelsForPrice = (baseEntry: number, direction: OrderDirection, rr: number) => {
    if (baseEntry <= 0) return;
    const { slDistance } = calculateAdaptiveOffsets(candles || [], currentPrice > 0 ? currentPrice : baseEntry, symbol);
    const side: TradeSide = direction === 'BUY' ? 'LONG' : 'SHORT';
    if (direction === 'BUY') {
      const sl = roundPrice(baseEntry - slDistance);
      const tp = calculateTPFromRR(side, baseEntry, sl, rr);
      setSlPriceStr(formatPrice(sl));
      setTpPriceStr(formatPrice(tp));
    } else {
      const sl = roundPrice(baseEntry + slDistance);
      const tp = calculateTPFromRR(side, baseEntry, sl, rr);
      setSlPriceStr(formatPrice(sl));
      setTpPriceStr(formatPrice(tp));
    }
  };

  // Switch Order Category
  const handleCategorySwitch = (cat: OrderCategory) => {
    setOrderCategory(cat);
    const { pendingOffset } = calculateAdaptiveOffsets(candles || [], currentPrice, symbol);
    if (cat === 'MARKET') {
      setEntryPriceStr(currentPrice > 0 ? formatPrice(currentPrice) : '');
      if (slPriceStr && tpPriceStr) {
        resetLevelsForPrice(currentPrice, orderDirection, selectedRR);
      }
    } else if (cat === 'LIMIT') {
      // For Limit: Buy Limit < current, Sell Limit > current
      const limitEntry = orderDirection === 'BUY' ? currentPrice - pendingOffset : currentPrice + pendingOffset;
      const roundedEntry = roundPrice(limitEntry);
      setEntryPriceStr(formatPrice(roundedEntry));
      if (slPriceStr && tpPriceStr) {
        resetLevelsForPrice(roundedEntry, orderDirection, selectedRR);
      }
    } else if (cat === 'STOP') {
      // For Stop: Buy Stop > current, Sell Stop < current
      const stopEntry = orderDirection === 'BUY' ? currentPrice + pendingOffset : currentPrice - pendingOffset;
      const roundedEntry = roundPrice(stopEntry);
      setEntryPriceStr(formatPrice(roundedEntry));
      if (slPriceStr && tpPriceStr) {
        resetLevelsForPrice(stopEntry, orderDirection, selectedRR);
      }
    }
  };

  // Switch Direction (BUY / SELL)
  const handleDirectionSwitch = (dir: OrderDirection) => {
    setOrderDirection(dir);
    onSideChange?.(dir === 'BUY' ? 'LONG' : 'SHORT');

    if (orderCategory === 'MARKET') {
      if (slPriceStr && tpPriceStr) {
        resetLevelsForPrice(currentPrice, dir, selectedRR);
      }
    } else {
      // For pending orders, flip the entry level across market price so it stays valid
      const { pendingOffset } = calculateAdaptiveOffsets(candles || [], currentPrice, symbol);
      const newEntry = orderCategory === 'LIMIT'
        ? (dir === 'BUY' ? currentPrice - pendingOffset : currentPrice + pendingOffset)
        : (dir === 'BUY' ? currentPrice + pendingOffset : currentPrice - pendingOffset);
      const roundedEntry = roundPrice(newEntry);
      setEntryPriceStr(formatPrice(roundedEntry));
      if (slPriceStr && tpPriceStr) {
        resetLevelsForPrice(roundedEntry, dir, selectedRR);
      }
    }
  };

  // Sync entry price to market price when in MARKET mode
  useEffect(() => {
    if (currentPrice > 0 && orderCategory === 'MARKET') {
      setEntryPriceStr(formatPrice(currentPrice));
    }
  }, [currentPrice, orderCategory, symbol]);

  // When active trade closes, reset to market price
  useEffect(() => {
    if (!activeTrade) {
      if (currentPrice > 0 && orderCategory === 'MARKET') {
        setEntryPriceStr(formatPrice(currentPrice));
      }
    }
  }, [activeTrade]);

  // Handle Risk Input
  const handleRiskChange = (val: string) => {
    setRiskInputStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      onRiskPercentChange(parsed);
    }
  };

  const handleRiskPreset = (r: number) => {
    setRiskInputStr(String(r));
    onRiskPercentChange(r);
  };

  // Handle Target RR Input & Presets
  const handleRRInputChange = (val: string) => {
    setRrInputStr(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setSelectedRR(parsed);
      const effectiveEntry = orderCategory === 'MARKET' ? currentPrice : (parseFloat(entryPriceStr) || currentPrice);
      const numSL = parseFloat(slPriceStr);
      if (!isNaN(numSL) && numSL > 0 && effectiveEntry > 0) {
        const side: TradeSide = orderDirection === 'BUY' ? 'LONG' : 'SHORT';
        const newTP = calculateTPFromRR(side, effectiveEntry, numSL, parsed);
        setTpPriceStr(formatPrice(newTP));
      }
    }
  };

  const handleRRPreset = (rr: number) => {
    setSelectedRR(rr);
    setRrInputStr(String(rr));
    const effectiveEntry = orderCategory === 'MARKET' ? currentPrice : (parseFloat(entryPriceStr) || currentPrice);
    const numSL = parseFloat(slPriceStr);
    if (!isNaN(numSL) && numSL > 0 && effectiveEntry > 0) {
      const side: TradeSide = orderDirection === 'BUY' ? 'LONG' : 'SHORT';
      const newTP = calculateTPFromRR(side, effectiveEntry, numSL, rr);
      setTpPriceStr(formatPrice(newTP));
    } else if (effectiveEntry > 0) {
      setShowChartPlannedLines(true);
      resetLevelsForPrice(effectiveEntry, orderDirection, rr);
    }
  };

  // Handle Entry input change (for Limit / Stop)
  const handleEntryChange = (val: string) => {
    setEntryPriceStr(val);
    const parsedEntry = parseFloat(val);
    if (!isNaN(parsedEntry) && parsedEntry > 0 && currentPrice > 0) {
      const eff = getEffectiveOrderType({
        direction: orderDirection,
        entryPrice: parsedEntry,
        marketPrice: currentPrice,
        symbol,
      });
      if (eff.category !== 'MARKET') {
        setOrderCategory(eff.category);
      }
    }
    const numSL = parseFloat(slPriceStr);
    if ((isRRLocked || !tpPriceStr) && !isNaN(parsedEntry) && parsedEntry > 0 && !isNaN(numSL) && numSL > 0) {
      const side: TradeSide = orderDirection === 'BUY' ? 'LONG' : 'SHORT';
      const newTP = calculateTPFromRR(side, parsedEntry, numSL, selectedRR);
      setTpPriceStr(formatPrice(newTP));
    }
  };

  // Handle SL Change
  const handleSlChange = (val: string) => {
    setSlPriceStr(val);
    const numSL = parseFloat(val);
    if (isRRLocked && !isNaN(numSL) && numSL > 0 && effectiveEntry > 0) {
      const side: TradeSide = orderDirection === 'BUY' ? 'LONG' : 'SHORT';
      const newTP = calculateTPFromRR(side, effectiveEntry, numSL, selectedRR);
      setTpPriceStr(formatPrice(newTP));
    }
  };

  // Numbers & Metrics
  const riskAmount = (balance * riskPercent) / 100;
  const contractSize = getSymbolContractSize(symbol);
  const lotSize = calculatePositionSize(balance, riskPercent, effectiveEntry, numSL, contractSize);

  // Price validation
  const validation = validateOrderPrices(currentOrderType, currentPrice, effectiveEntry, numSL, numTP, symbol);

  const isExecutionValid = validation.isValid && lotSize > 0 && !isSubmitting;
  const canSubmitVisualOrder = onVisualOrderSubmit
    ? (validation.isValid && effectiveEntry > 0 && !isSubmitting)
    : isExecutionValid;

  // Emit planned trade preview to parent for chart tool synchronization
  useEffect(() => {
    if (!onPlannedTradeChange) return;
    if (!showChartPlannedLines || Boolean(activeTrade) || effectiveEntry <= 0) {
      onPlannedTradeChange(null);
      return;
    }
    const hasSL = numSL > 0;
    const hasTP = numTP > 0;
    const targetProfit = (hasSL && hasTP && rrCalc.isValid)
      ? riskAmount * rrCalc.rr
      : riskAmount * selectedRR;

    onPlannedTradeChange({
      orderType: currentOrderType,
      side: orderDirection,
      entryPrice: effectiveEntry,
      slPrice: hasSL ? numSL : null,
      tpPrice: hasTP ? numTP : null,
      lotSize: lotSize > 0 ? lotSize : 1.0,
      riskAmount,
      targetProfit,
      rrRatio: rrCalc.isValid ? rrCalc.rr : selectedRR,
      isValid: validation.isValid,
      validationError: validation.error,
      hasSL,
      hasTP,
    });
  }, [
    showChartPlannedLines,
    activeTrade,
    currentOrderType,
    orderDirection,
    effectiveEntry,
    numSL,
    numTP,
    lotSize,
    riskAmount,
    rrCalc.isValid,
    rrCalc.rr,
    selectedRR,
    validation.isValid,
    validation.error,
    onPlannedTradeChange,
  ]);

  const handleExecute = () => {
    if (activeTrade || !validation.isValid) return;

    if (onVisualOrderSubmit) {
      if (!effectiveClassification.isPending) {
        const { slDistance } = calculateAdaptiveOffsets(candles || [], currentPrice, symbol);
        const sl = numSL > 0 ? numSL : (orderDirection === 'BUY' ? effectiveEntry - slDistance : effectiveEntry + slDistance);
        const tp = numTP > 0 ? numTP : (orderDirection === 'BUY' ? effectiveEntry + slDistance * selectedRR : effectiveEntry - slDistance * selectedRR);
        const roundedSL = roundPrice(sl);
        const roundedTP = roundPrice(tp);
        const calcLots = calculatePositionSize(balance, riskPercent, effectiveEntry, roundedSL, contractSize);
        onVisualOrderSubmit({
          orderType: currentOrderType,
          side: tradeSide,
          entryPrice: effectiveEntry,
          slPrice: roundedSL,
          tpPrice: roundedTP,
          volume: calcLots > 0 ? calcLots : 1.0,
          riskAmount,
        });
        return;
      } else {
        // Pending order (Limit or Stop): show Entry, SL & TP added on chart confirm panel!
        const calcLots = numSL > 0 ? calculatePositionSize(balance, riskPercent, effectiveEntry, numSL, contractSize) : 1.0;
        onVisualOrderSubmit({
          orderType: currentOrderType,
          side: tradeSide,
          entryPrice: effectiveEntry,
          slPrice: numSL > 0 ? numSL : 0,
          tpPrice: numTP > 0 ? numTP : 0,
          volume: calcLots > 0 ? calcLots : 1.0,
          riskAmount,
        });
        return;
      }
    }

    if (!isExecutionValid) return;

    if (!effectiveClassification.isPending) {
      onOpenTrade({
        side: tradeSide,
        entryPrice: effectiveEntry,
        slPrice: numSL,
        tpPrice: numTP,
        volume: lotSize,
        riskAmount,
      });
    } else {
      if (onPlaceOrder) {
        onPlaceOrder({
          orderType: currentOrderType,
          side: tradeSide,
          entryPrice: effectiveEntry,
          slPrice: numSL,
          tpPrice: numTP,
          volume: lotSize,
          riskAmount,
        });
      }
    }
  };

  // Expose executeQuick for mobile quick action bar
  useImperativeHandle(
    ref,
    () => ({
      executeQuick: (side: TradeSide) => {
        if (isSubmitting || Boolean(activeTrade) || currentPrice <= 0) return;
        const dir: OrderDirection = side === 'LONG' ? 'BUY' : 'SELL';
        setOrderCategory('MARKET');
        setOrderDirection(dir);
        onSideChange?.(side);

        const { slDistance } = calculateAdaptiveOffsets(candles || [], currentPrice, symbol);
        const hasValidCurrentSL = numSL > 0 && (dir === 'BUY' ? numSL < currentPrice : numSL > currentPrice);
        const effectiveSL = hasValidCurrentSL
          ? numSL
          : (dir === 'BUY' ? roundPrice(currentPrice - slDistance) : roundPrice(currentPrice + slDistance));

        const hasValidCurrentTP = numTP > 0 && (dir === 'BUY' ? numTP > currentPrice : numTP < currentPrice);
        const effectiveTP = hasValidCurrentTP
          ? numTP
          : calculateTPFromRR(side, currentPrice, effectiveSL, selectedRR);

        const effLot = calculatePositionSize(balance, riskPercent, currentPrice, effectiveSL, contractSize);
        const effRisk = (balance * riskPercent) / 100;

        setEntryPriceStr(formatPrice(currentPrice));
        setSlPriceStr(formatPrice(effectiveSL));
        setTpPriceStr(formatPrice(effectiveTP));

        onOpenTrade({
          side,
          entryPrice: currentPrice,
          slPrice: effectiveSL,
          tpPrice: effectiveTP,
          volume: effLot > 0 ? effLot : 1.0,
          riskAmount: effRisk,
        });
      },
      getSide: () => tradeSide,
    }),
    [
      isSubmitting,
      activeTrade,
      currentPrice,
      numSL,
      numTP,
      balance,
      riskPercent,
      symbol,
      selectedRR,
      contractSize,
      tradeSide,
      onOpenTrade,
      onSideChange,
      priceDecimals,
    ]
  );

  // Active Trade calculations (if OPEN)
  const isTradeOpen = activeTrade && activeTrade.status === 'OPEN';
  const livePnl =
    isTradeOpen && currentPrice > 0
      ? calculatePnL(activeTrade.side, activeTrade.entryPrice, currentPrice, activeTrade.volume, contractSize)
      : 0;
  const hasValidSl = Boolean(activeTrade && activeTrade.slPrice && activeTrade.slPrice > 0);
  const livePriceRisk = isTradeOpen && hasValidSl ? Math.abs(activeTrade.entryPrice - activeTrade.slPrice) : 0;
  const livePriceCaptured = isTradeOpen
    ? activeTrade.side === 'LONG'
      ? currentPrice - activeTrade.entryPrice
      : activeTrade.entryPrice - currentPrice
    : 0;
  const liveRR = livePriceRisk > 0 ? Math.round((livePriceCaptured / livePriceRisk) * 100) / 100 : null;

  return (
    <div className="bg-white border-2 border-[#121212] rounded-xl p-3.5 sm:p-4 flex flex-col gap-3.5 text-[#121212] shadow-[4px_4px_0px_0px_#121212] h-full overflow-y-auto">
      {/* Header: Market Price & Account Balance */}
      <div className="grid grid-cols-2 gap-2 pb-2.5 border-b-2 border-[#121212]">
        <div className="bg-[#FFFDEB] border-2 border-[#121212] p-2 sm:p-2.5 shadow-[2px_2px_0px_0px_#121212]">
          <div className="text-[9px] font-black uppercase tracking-wider text-[#B45309] flex items-center justify-between">
            <span>Harga {symbol}</span>
            <span className="w-2 h-2 rounded-full bg-[#B45309] animate-pulse" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-[#121212] mt-0.5 tracking-tight">
            {currentPrice > 0 ? formatPrice(currentPrice) : '--.--'}
          </div>
        </div>

        <div className="bg-[#EBF2FF] border-2 border-[#121212] p-2 sm:p-2.5 shadow-[2px_2px_0px_0px_#121212]">
          <div className="text-[9px] font-black uppercase tracking-wider text-[#1040C0] flex items-center justify-between">
            <span>Saldo Akun</span>
            <span className="text-[9px] font-mono font-black text-[#1040C0]">USD</span>
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-[#1040C0] mt-0.5 tracking-tight">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Intrabar Ambiguity Warning Banner */}
      {intrabarWarning && (
        <div className="p-2.5 bg-[#FFF7D6] border-2 border-[#121212] rounded-lg text-[#121212] flex items-start gap-2 text-xs shadow-[2px_2px_0px_0px_#121212]">
          <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[11px]">Peringatan Intrabar</div>
            <div className="text-[11px] leading-tight text-[#3F3F46]">{intrabarWarning}</div>
          </div>
        </div>
      )}

      {/* ── ACTIVE TRADE POSITION VIEW ── */}
      {isTradeOpen ? (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#121212] flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-[#059669]" />
              <span>Posisi Terbuka</span>
            </span>
            <span className="text-[11px] font-mono font-bold text-[#717182]">
              #{activeTrade.id.slice(0, 6)}
            </span>
          </div>

          <div className="p-3 bg-[#F0F0F0] border-2 border-[#121212] rounded-lg space-y-3 shadow-[2px_2px_0px_0px_#121212]">
            <div className="flex items-center justify-between">
              <span
                className={`px-2.5 py-1 text-xs font-mono font-extrabold uppercase tracking-wider rounded border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] ${
                  activeTrade.side === 'LONG'
                    ? 'bg-[#E7F9F0] text-[#059669]'
                    : 'bg-[#FDECEC] text-[#DC2626]'
                }`}
              >
                {activeTrade.side === 'LONG' ? 'BUY (LONG)' : 'SELL (SHORT)'}
              </span>
              <span className="font-mono text-xs text-[#121212] font-bold">
                {activeTrade.volume.toFixed(2)} Lot
              </span>
            </div>

            {/* Entry, SL, TP Grid */}
            <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
              <div className="bg-white p-1.5 rounded border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
                <div className="text-[#717182] text-[10px] font-bold uppercase">Entry</div>
                <div className="font-extrabold text-[#121212]">{formatPrice(activeTrade.entryPrice)}</div>
              </div>
              <div className="bg-white p-1.5 rounded border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
                <div className="text-[#717182] text-[10px] font-bold uppercase">SL</div>
                <div className="font-extrabold text-[#DC2626]">
                  {activeTrade.slPrice > 0 ? formatPrice(activeTrade.slPrice) : '--'}
                </div>
              </div>
              <div className="bg-white p-1.5 rounded border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
                <div className="text-[#717182] text-[10px] font-bold uppercase">TP</div>
                <div className="font-extrabold text-[#059669]">
                  {activeTrade.tpPrice > 0 ? formatPrice(activeTrade.tpPrice) : '--'}
                </div>
              </div>
            </div>

            {/* Live Floating PnL and RR */}
            <div className="flex items-center justify-between font-mono bg-white px-3 py-2 rounded border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]">
              <div>
                <div className="text-[#717182] text-[10px] font-bold uppercase">Floating PnL</div>
                <div className={`text-base font-extrabold ${livePnl >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {livePnl >= 0 ? `+$${livePnl.toFixed(2)}` : `-$${Math.abs(livePnl).toFixed(2)}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[#717182] text-[10px] font-bold uppercase">Live R:R</div>
                <div className={`text-base font-extrabold ${liveRR !== null && liveRR >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {liveRR !== null ? (liveRR >= 0 ? `+${liveRR.toFixed(2)}R` : `${liveRR.toFixed(2)}R`) : '--'}
                </div>
              </div>
            </div>

            {/* Close Trade Action */}
            <button
              type="button"
              onClick={() => onCloseTrade(activeTrade.id)}
              disabled={isSubmitting}
              className="w-full min-h-[44px] py-2.5 px-4 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-mono font-black text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
            >
              <XCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Menutup Posisi...' : 'Tutup Posisi Sekarang'}</span>
            </button>
          </div>

          <div className="p-2.5 bg-[#F0F0F0] border-2 border-[#121212] rounded-lg flex items-center gap-2 text-xs text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
            <Lock className="w-4 h-4 text-[#121212] shrink-0" />
            <span className="font-semibold">Tutup posisi di atas untuk membuka posisi baru.</span>
          </div>
        </div>
      ) : (
        /* ── ORDER ENTRY WORKFLOW (MARKET & PENDING) ── */
        <div className="space-y-3.5">
          {/* Order Category Selector: MARKET / LIMIT / STOP */}
          <div>
            <div className="text-[9.5px] font-black uppercase tracking-wider text-[#717182] mb-1.5 flex items-center justify-between">
              <span>Tipe Order</span>
              <span className="font-mono text-[#1040C0] font-extrabold">{getOrderTypeLabel(currentOrderType)}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F0F0F0] border-2 border-[#121212] rounded-lg shadow-[1px_1px_0px_0px_#121212]">
              {(['MARKET', 'LIMIT', 'STOP'] as OrderCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategorySwitch(cat)}
                  className={`min-h-[34px] py-1 text-[11px] font-mono font-black uppercase tracking-wider rounded transition-all cursor-pointer ${
                    orderCategory === cat
                      ? 'bg-[#121212] text-white shadow-[1px_1px_0px_0px_#121212]'
                      : 'bg-transparent text-[#121212] hover:bg-white/80'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Direction Selector (BUY vs SELL) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleDirectionSwitch('BUY')}
              className={`min-h-[42px] py-2 px-3 text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-lg border-2 border-[#121212] transition-all shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer ${
                orderDirection === 'BUY'
                  ? 'bg-[#059669] text-white'
                  : 'bg-white text-[#121212] hover:bg-[#E7F9F0]'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>BUY</span>
            </button>
            <button
              type="button"
              onClick={() => handleDirectionSwitch('SELL')}
              className={`min-h-[42px] py-2 px-3 text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-lg border-2 border-[#121212] transition-all shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer ${
                orderDirection === 'SELL'
                  ? 'bg-[#DC2626] text-white'
                  : 'bg-white text-[#121212] hover:bg-[#FDECEC]'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>SELL</span>
            </button>
          </div>

          {/* Entry Price Input / Market Price indicator */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide">
                Harga Entry:
              </span>
              {orderCategory === 'MARKET' ? (
                <span className="text-[10px] font-mono text-[#059669] font-black uppercase bg-[#E7F9F0] px-1.5 py-0.5 border border-[#121212] rounded">
                  Market Execution
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => (onPickChartEntry ? onPickChartEntry(currentOrderType) : handleExecute())}
                  className="text-[10px] font-mono text-[#1040C0] font-black uppercase flex items-center gap-1 hover:underline cursor-pointer"
                  title="Klik level pada chart untuk menentukan harga entry"
                >
                  <Crosshair className="w-3 h-3 text-[#1040C0]" />
                  <span>Pilih di Chart</span>
                </button>
              )}
            </div>

            {orderCategory === 'MARKET' ? (
              <div className="w-full min-h-[38px] bg-[#F8FAFC] border-2 border-[#121212] rounded-lg px-3 py-2 text-[#121212] font-mono font-black text-sm flex items-center justify-between shadow-[2px_2px_0px_0px_#121212]">
                <span>{currentPrice > 0 ? formatPrice(currentPrice) : '--.--'}</span>
                <span className="text-[10px] font-bold text-[#717182]">Terkunci ke Harga Replay</span>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="number"
                  step={priceStep}
                  value={entryPriceStr}
                  onChange={(e) => handleEntryChange(e.target.value)}
                  placeholder="e.g. 3340.00"
                  className="w-full min-h-[38px] bg-white border-2 border-[#121212] rounded-lg px-3 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
                />
              </div>
            )}
          </div>

          {/* Risk % Input & Quick Presets */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-[#1040C0]" />
                <span>Risiko per Trade:</span>
              </span>
              <span className="font-mono text-[#121212] font-black text-xs">
                ${riskAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="100"
                  value={riskInputStr}
                  onChange={(e) => handleRiskChange(e.target.value)}
                  placeholder="e.g. 1.0"
                  className="w-full min-h-[38px] bg-white border-2 border-[#121212] rounded-lg pl-3 pr-8 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#717182] pointer-events-none">
                  %
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0.5, 1.0, 1.5, 2.0].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRiskPreset(r)}
                  className={`min-h-[28px] py-0.5 text-xs font-mono font-extrabold rounded border-2 border-[#121212] transition-all shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer ${
                    riskPercent === r && riskInputStr === String(r)
                      ? 'bg-[#1040C0] text-white'
                      : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'
                  }`}
                >
                  {r}%
                </button>
              ))}
            </div>
          </div>

          {/* Stop Loss, Target RR, and Take Profit Controls (Hidden initially until user defines them) */}
          {!slPriceStr && !tpPriceStr ? (
            <div className="p-3 bg-[#F8FAFC] border-2 border-dashed border-[#94A3B8] rounded-lg text-center space-y-2">
              <div className="text-[11px] font-bold text-[#475569]">
                Stop Loss & Take Profit belum ditentukan
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowChartPlannedLines(true);
                  resetLevelsForPrice(effectiveEntry, orderDirection, selectedRR);
                }}
                className="w-full min-h-[36px] bg-[#1040C0] text-white font-mono font-extrabold text-xs rounded-lg border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#1D4ED8]"
              >
                <Plus className="w-4 h-4" />
                <span>Tentukan Level SL & TP (1 : {selectedRR.toFixed(1)})</span>
              </button>
            </div>
          ) : (
            <>
              {/* Stop Loss Input */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide">
                    Stop Loss:
                  </span>
                  <span className="text-[11px] text-[#DC2626] font-mono font-bold">
                    {rrCalc.isValid ? `Jarak Risiko: ${rrCalc.risk.toFixed(2)} pts` : ''}
                  </span>
                </div>
                <input
                  type="number"
                  step={priceStep}
                  value={slPriceStr}
                  onChange={(e) => handleSlChange(e.target.value)}
                  placeholder="e.g. 3335.00"
                  className="w-full min-h-[38px] bg-white border-2 border-[#121212] rounded-lg px-3 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
                />
              </div>

              {/* Target RR Input & Presets */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide flex items-center gap-1">
                    <Calculator className="w-3.5 h-3.5 text-[#B45309]" />
                    <span>Target Rasio Risk / Reward (RR):</span>
                  </span>
                  <span className="text-[11px] font-mono text-[#059669] font-black">
                    {rrCalc.isValid ? `Aktual: 1 : ${rrCalc.rr.toFixed(2)}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#717182] pointer-events-none">
                      1 :
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={rrInputStr}
                      onChange={(e) => handleRRInputChange(e.target.value)}
                      placeholder="e.g. 2.0"
                      className="w-full min-h-[38px] bg-white border-2 border-[#121212] rounded-lg pl-9 pr-3 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {RR_PRESETS.map((rr) => (
                    <button
                      key={rr}
                      type="button"
                      onClick={() => handleRRPreset(rr)}
                      className={`min-h-[28px] py-0.5 text-xs font-mono font-extrabold rounded border-2 border-[#121212] transition-all shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer ${
                        selectedRR === rr && rrInputStr === String(rr)
                          ? 'bg-[#1040C0] text-white'
                          : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'
                      }`}
                    >
                      1:{rr}
                    </button>
                  ))}
                </div>

                {/* Lock Fixed R:R Checkbox Toggle */}
                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-[#121212]">
                    <input
                      type="checkbox"
                      checked={isRRLocked}
                      onChange={toggleRRLock}
                      className="w-4 h-4 rounded border-2 border-[#121212] text-[#1040C0] focus:ring-0 cursor-pointer accent-[#1040C0]"
                    />
                    <span>Kunci Rasio R:R (Lock Fixed R:R)</span>
                  </label>
                  <span className="text-[10px] font-mono font-bold text-[#717182]">
                    {isRRLocked ? 'Terkunci' : 'Bebas'}
                  </span>
                </div>
              </div>

              {/* Take Profit Input */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide">
                    Take Profit:
                  </span>
                  <span className="text-[11px] text-[#059669] font-mono font-bold">
                    {rrCalc.isValid ? `Target Reward: ${rrCalc.reward.toFixed(2)} pts` : ''}
                  </span>
                </div>
                <input
                  type="number"
                  step={priceStep}
                  value={tpPriceStr}
                  onChange={(e) => setTpPriceStr(e.target.value)}
                  placeholder="e.g. 3350.00"
                  className="w-full min-h-[38px] bg-white border-2 border-[#121212] rounded-lg px-3 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
                />
              </div>

              {/* Summary Box & Validation Feedback */}
              {validation.isValid && lotSize > 0 ? (
                <div className="p-2.5 bg-[#F8FAFC] border-2 border-[#121212] rounded-lg text-xs font-mono space-y-1 text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
                  <div className="flex justify-between">
                    <span className="text-[#717182] font-bold">Ukuran Lot ({symbol}):</span>
                    <strong className="text-[#121212] font-black">{lotSize.toFixed(2)} Lot</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#717182] font-bold">Max Risk:</span>
                    <strong className="text-[#DC2626] font-black">-${riskAmount.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#717182] font-bold">Target Profit:</span>
                    <strong className="text-[#059669] font-black">
                      +${(riskAmount * (rrCalc.isValid ? rrCalc.rr : selectedRR)).toFixed(2)}
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-[#121212]/10 pt-1">
                    <span className="text-[#717182] font-bold">Rasio R:R:</span>
                    <strong className="text-[#1040C0] font-black">1 : {rrCalc.rr.toFixed(2)}</strong>
                  </div>
                </div>
              ) : !validation.isValid ? (
                <div className="p-2.5 bg-[#FDECEC] border-2 border-[#121212] rounded-lg text-[#DC2626] text-xs flex items-start gap-2 shadow-[2px_2px_0px_0px_#121212] font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#DC2626]" />
                  <span>{validation.error || 'Konfigurasi harga tidak valid.'}</span>
                </div>
              ) : (
                <div className="p-2.5 bg-[#F8FAFC] border-2 border-[#121212] rounded-lg text-xs font-mono space-y-1 text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
                  <div className="flex justify-between">
                    <span className="text-[#717182] font-bold">Tipe Order:</span>
                    <strong className="text-[#121212] font-black">{getOrderTypeLabel(currentOrderType)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#717182] font-bold">Target Entry:</span>
                    <strong className="text-[#1040C0] font-black">${formatPrice(effectiveEntry)}</strong>
                  </div>
                  <div className="text-[10px] text-[#717182] pt-0.5">
                    Garis level Entry akan muncul di chart. SL & TP dapat diatur interaktif langsung pada chart.
                  </div>
                </div>
              )}

              {/* Interactive Chart Lines Toggle and Reset Button */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowChartPlannedLines(!showChartPlannedLines)}
                  className={`flex-1 min-h-[34px] py-1 px-2 text-[11px] font-mono font-bold uppercase tracking-wider rounded-lg border-2 border-[#121212] transition-all flex items-center justify-center gap-1.5 shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer ${
                    showChartPlannedLines
                      ? 'bg-[#EAF2FF] text-[#1040C0]'
                      : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#1040C0]" />
                  <span>{showChartPlannedLines ? 'Sembunyikan Visual' : 'Tampilkan Visual'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSlPriceStr('');
                    setTpPriceStr('');
                    setShowChartPlannedLines(false);
                    onPlannedTradeChange?.(null);
                  }}
                  className="min-h-[34px] py-1 px-3 text-[11px] font-mono font-bold uppercase rounded-lg border-2 border-[#121212] bg-white text-[#717182] hover:text-[#DC2626] hover:bg-[#FEE2E2] transition-all shadow-[1px_1px_0px_0px_#121212] cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </>
          )}

          {/* Confirm / Place Order Action Button */}
          <button
            type="button"
            onClick={handleExecute}
            disabled={!canSubmitVisualOrder}
            className={`w-full min-h-[46px] py-2.5 font-mono font-black text-xs uppercase tracking-wider rounded-lg transition-all border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-white cursor-pointer ${
              !canSubmitVisualOrder
                ? 'bg-[#CBD5E1] text-[#475569] cursor-not-allowed shadow-none'
                : orderDirection === 'BUY'
                  ? 'bg-[#059669] hover:bg-[#047857]'
                  : 'bg-[#DC2626] hover:bg-[#B91C1C]'
            }`}
          >
            {isSubmitting
              ? 'Memproses Order...'
              : !validation.isValid
                ? (validation.error || 'Harga tidak valid')
                : !effectiveClassification.isPending
                  ? `Buka Posisi Market ${orderDirection} (Atur di Chart)`
                  : `Pasang ${getOrderTypeLabel(currentOrderType)} (Atur di Chart)`}
          </button>
        </div>
      )}

      {/* ── ACTIVE PENDING ORDERS LIST (IF ANY) ── */}
      {pendingOrders.length > 0 && (
        <div className="mt-2 pt-3 border-t-2 border-[#121212] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#717182] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#1040C0]" />
              <span>Pending Orders ({pendingOrders.length})</span>
            </span>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
            {pendingOrders.map((po) => (
              <div
                key={po.id}
                className="p-2 bg-[#F8FAFC] border-2 border-[#121212] rounded-lg text-xs font-mono flex items-center justify-between gap-2 shadow-[1px_1px_0px_0px_#121212]"
              >
                <div>
                  <div className="font-black text-[11px] flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.2 text-[9px] rounded font-bold border border-[#121212] ${
                        po.side === 'LONG' ? 'bg-[#E7F9F0] text-[#059669]' : 'bg-[#FDECEC] text-[#DC2626]'
                      }`}
                    >
                      {po.orderType.replace('_', ' ')}
                    </span>
                    <span>@{formatPrice(po.entryPrice)}</span>
                  </div>
                  <div className="text-[9px] text-[#717182] mt-0.5">
                    SL: {po.slPrice > 0 ? formatPrice(po.slPrice) : '--'} | TP: {po.tpPrice > 0 ? formatPrice(po.tpPrice) : '--'} | {po.volume.toFixed(2)}L
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {onEditPendingOrder && (
                    <button
                      type="button"
                      onClick={() => onEditPendingOrder(po.id)}
                      className="p-1 text-[#1040C0] hover:bg-[#EBF2FF] border border-[#1040C0]/30 rounded cursor-pointer transition-colors"
                      title="Edit Pending Order di Chart"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {onCancelPendingOrder && (
                    <button
                      type="button"
                      onClick={() => onCancelPendingOrder(po.id)}
                      className="p-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded cursor-pointer transition-colors"
                      title="Batalkan Pending Order"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
