import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  AlertTriangle,
  XCircle,
  Calculator,
  Lock,
  Video,
  Crosshair,
} from 'lucide-react';
import {
  calculatePositionSize,
  calculateRR,
  calculateTPFromRR,
  calculatePnL,
  getSymbolContractSize,
  getDefaultSlDistance,
  BacktestTradeRecord,
  TradeSide,
} from '../../../../server/src/services/backtestEngine';
import type { AppMode } from './ReplayControls';
import type { PlannedOrderPreview } from './CandlestickChart';

interface OrderPanelProps {
  symbol?: string;
  currentPrice: number;
  balance: number;
  riskPercent: number;
  onRiskPercentChange: (risk: number) => void;
  activeTrade?: BacktestTradeRecord | null;
  onOpenTrade: (trade: {
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
  onVisualOrderSubmit?: (trade: {
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => void;
  controlledSlPrice?: number | null;
  controlledTpPrice?: number | null;
  selectedSideOverride?: TradeSide;
}

const RR_PRESETS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0];

export interface OrderPanelHandle {
  executeQuick: (side: TradeSide) => void;
  getSide: () => TradeSide;
}

export const OrderPanel = forwardRef<OrderPanelHandle, OrderPanelProps>(function OrderPanel(
  {
    symbol = 'XAUUSD',
    currentPrice,
    balance,
    riskPercent,
    onRiskPercentChange,
    activeTrade,
    onOpenTrade,
    onCloseTrade,
    intrabarWarning,
    isSubmitting = false,
    appMode = 'replay',
    onActivateReplay,
    onPlannedTradeChange,
    onVisualOrderSubmit,
    controlledSlPrice,
    controlledTpPrice,
    selectedSideOverride,
  }: OrderPanelProps,
  ref
) {
  const [selectedSide, setSelectedSide] = useState<TradeSide>(selectedSideOverride ?? 'LONG');
  const [slPrice, setSlPrice] = useState<string>('');
  const [tpPrice, setTpPrice] = useState<string>('');
  const [selectedRR, setSelectedRR] = useState<number>(2.0);
  const [rrInputStr, setRrInputStr] = useState<string>('2');
  const [riskInputStr, setRiskInputStr] = useState<string>(String(riskPercent));
  const [showChartPlannedLines, setShowChartPlannedLines] = useState<boolean>(false);

  useEffect(() => {
    if (parseFloat(riskInputStr) !== riskPercent) {
      setRiskInputStr(String(riskPercent));
    }
  }, [riskPercent]);

  useEffect(() => {
    if (selectedSideOverride) {
      setSelectedSide(selectedSideOverride);
      resetSlTpForPrice(currentPrice, selectedSideOverride, selectedRR);
    }
  }, [selectedSideOverride, currentPrice, selectedRR]);

  // Sync external controlled SL/TP from chart drag
  useEffect(() => {
    if (controlledSlPrice !== undefined && controlledSlPrice !== null && controlledSlPrice > 0) {
      setSlPrice(controlledSlPrice.toFixed(2));
    }
  }, [controlledSlPrice]);

  useEffect(() => {
    if (controlledTpPrice !== undefined && controlledTpPrice !== null && controlledTpPrice > 0) {
      setTpPrice(controlledTpPrice.toFixed(2));
    }
  }, [controlledTpPrice]);

  // Helper to re-calculate clean SL/TP from price and RR
  const resetSlTpForPrice = (price: number, side: TradeSide, rr: number) => {
    if (price <= 0) return;
    const defaultSlDist = getDefaultSlDistance(symbol);
    if (side === 'LONG') {
      const sl = Math.round((price - defaultSlDist) * 100) / 100;
      const tp = calculateTPFromRR('LONG', price, sl, rr);
      setSlPrice(sl.toFixed(2));
      setTpPrice(tp.toFixed(2));
    } else {
      const sl = Math.round((price + defaultSlDist) * 100) / 100;
      const tp = calculateTPFromRR('SHORT', price, sl, rr);
      setSlPrice(sl.toFixed(2));
      setTpPrice(tp.toFixed(2));
    }
  };

  // Reset SL/TP when activeTrade closes (transitions from OPEN to null)
  useEffect(() => {
    if (!activeTrade && currentPrice > 0) {
      resetSlTpForPrice(currentPrice, selectedSide, selectedRR);
    }
  }, [activeTrade]);

  // Initial calculation or when currentPrice appears
  useEffect(() => {
    if (currentPrice > 0 && (!slPrice || slPrice === '0')) {
      resetSlTpForPrice(currentPrice, selectedSide, selectedRR);
    }
  }, [currentPrice]);

  // Recalculate default SL/TP when symbol changes
  useEffect(() => {
    if (currentPrice > 0) {
      resetSlTpForPrice(currentPrice, selectedSide, selectedRR);
    }
  }, [symbol]);

  // Handle Side Switch (BUY / SELL)
  const handleSideSwitch = (side: TradeSide) => {
    setSelectedSide(side);
    resetSlTpForPrice(currentPrice, side, selectedRR);
  };

  // Handle Risk Input & Presets
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
      const numSL = parseFloat(slPrice);
      if (!isNaN(numSL) && numSL > 0 && currentPrice > 0) {
        const newTP = calculateTPFromRR(selectedSide, currentPrice, numSL, parsed);
        setTpPrice(newTP.toFixed(2));
      }
    }
  };

  // Handle Quick RR Preset Click
  const handleRRPreset = (rr: number) => {
    setSelectedRR(rr);
    setRrInputStr(String(rr));
    const numSL = parseFloat(slPrice);
    if (!isNaN(numSL) && numSL > 0 && currentPrice > 0) {
      const newTP = calculateTPFromRR(selectedSide, currentPrice, numSL, rr);
      setTpPrice(newTP.toFixed(2));
    }
  };

  // Manual SL Change
  const handleSlChange = (val: string) => {
    setSlPrice(val);
    const numSL = parseFloat(val);
    if (!isNaN(numSL) && numSL > 0 && currentPrice > 0) {
      const newTP = calculateTPFromRR(selectedSide, currentPrice, numSL, selectedRR);
      setTpPrice(newTP.toFixed(2));
    }
  };

  const numSL = parseFloat(slPrice) || 0;
  const numTP = parseFloat(tpPrice) || 0;
  const riskAmount = (balance * riskPercent) / 100;
  const contractSize = getSymbolContractSize(symbol);
  const lotSize = calculatePositionSize(balance, riskPercent, currentPrice, numSL, contractSize);
  const rrCalc = calculateRR(selectedSide, currentPrice, numSL, numTP);

  const handleExecute = () => {
    if (!rrCalc.isValid || lotSize <= 0 || isSubmitting || Boolean(activeTrade)) return;
    setShowChartPlannedLines(false);
    onVisualOrderSubmit?.({
      side: selectedSide,
      entryPrice: currentPrice,
      slPrice: numSL,
      tpPrice: numTP,
      volume: lotSize,
      riskAmount,
    });
  };

  // Expose executeQuick for the mobile quick-trade bar
  useImperativeHandle(ref, () => ({
    executeQuick: (side: TradeSide) => {
      if (isSubmitting || Boolean(activeTrade)) return;
      // If side changed, recalculate SL/TP first then execute synchronously
      if (side !== selectedSide) {
        setSelectedSide(side);
        const defaultSlDist = getDefaultSlDistance(symbol);
        const newSl = side === 'LONG'
          ? Math.round((currentPrice - defaultSlDist) * 100) / 100
          : Math.round((currentPrice + defaultSlDist) * 100) / 100;
        const newTp = calculateTPFromRR(side, currentPrice, newSl, selectedRR);
        const newLot = calculatePositionSize(balance, riskPercent, currentPrice, newSl, contractSize);
        const newRisk = (balance * riskPercent) / 100;
        setSlPrice(newSl.toFixed(2));
        setTpPrice(newTp.toFixed(2));
        setShowChartPlannedLines(false);
        onOpenTrade({ side, entryPrice: currentPrice, slPrice: newSl, tpPrice: newTp, volume: newLot, riskAmount: newRisk });
      } else {
        handleExecute();
      }
    },
    getSide: () => selectedSide,
  }), [selectedSide, isSubmitting, activeTrade, currentPrice, numSL, numTP, lotSize, riskAmount, balance, riskPercent, symbol, selectedRR, contractSize]);

  // Active Trade calculations (if OPEN)
  const isTradeOpen = activeTrade && activeTrade.status === 'OPEN';
  const livePnl = isTradeOpen && currentPrice > 0
    ? calculatePnL(activeTrade.side, activeTrade.entryPrice, currentPrice, activeTrade.volume, contractSize)
    : 0;
  const livePriceRisk = isTradeOpen ? Math.abs(activeTrade.entryPrice - activeTrade.slPrice) : 0;
  const livePriceCaptured = isTradeOpen
    ? activeTrade.side === 'LONG'
      ? currentPrice - activeTrade.entryPrice
      : activeTrade.entryPrice - currentPrice
    : 0;
  const liveRR = livePriceRisk > 0 ? Math.round((livePriceCaptured / livePriceRisk) * 100) / 100 : 0;

  // Emit planned trade preview ("Ancang-Ancang") to parent for live chart visualization ONLY when explicitly toggled on
  useEffect(() => {
    if (!onPlannedTradeChange) return;
    if (!showChartPlannedLines || isTradeOpen || currentPrice <= 0 || !numSL || !numTP || !rrCalc.isValid || lotSize <= 0) {
      onPlannedTradeChange(null);
      return;
    }
    const targetProfit = riskAmount * rrCalc.rr;
    onPlannedTradeChange({
      side: selectedSide === 'LONG' ? 'BUY' : 'SELL',
      entryPrice: currentPrice,
      slPrice: numSL,
      tpPrice: numTP,
      lotSize,
      riskAmount,
      targetProfit,
      rrRatio: rrCalc.rr,
    });
  }, [
    showChartPlannedLines,
    isTradeOpen,
    currentPrice,
    numSL,
    numTP,
    selectedSide,
    lotSize,
    riskAmount,
    rrCalc.isValid,
    rrCalc.rr,
    onPlannedTradeChange,
  ]);

  return (
    <div className="bg-white border-2 border-[#121212] rounded-xl p-4 flex flex-col gap-4 text-[#121212] shadow-[4px_4px_0px_0px_#121212] h-full">
      {/* Header: Market Price & Account Balance */}
      <div className="grid grid-cols-2 gap-2 pb-3 border-b-2 border-[#121212]">
        <div className="bg-[#FFFDEB] border-2 border-[#121212] p-2.5 shadow-[2px_2px_0px_0px_#121212]">
          <div className="text-[9px] font-black uppercase tracking-wider text-[#B45309] flex items-center justify-between">
            <span>Harga {symbol}</span>
            <span className="w-2 h-2 rounded-full bg-[#B45309] animate-pulse" />
          </div>
          <div className="text-xl font-mono font-black text-[#121212] mt-0.5 tracking-tight">
            {currentPrice > 0 ? currentPrice.toFixed(2) : '--.--'}
          </div>
        </div>

        <div className="bg-[#EBF2FF] border-2 border-[#121212] p-2.5 shadow-[2px_2px_0px_0px_#121212]">
          <div className="text-[9px] font-black uppercase tracking-wider text-[#1040C0] flex items-center justify-between">
            <span>Saldo Akun</span>
            <span className="text-[9px] font-mono font-black text-[#1040C0]">USD</span>
          </div>
          <div className="text-xl font-mono font-black text-[#1040C0] mt-0.5 tracking-tight">
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

      {/* ── STATE B: ACTIVE POSITION VIEW ── */}
      {isTradeOpen ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#121212] flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-[#059669]" />
              <span>Open position</span>
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
                <div className="font-extrabold text-[#121212]">{activeTrade.entryPrice.toFixed(2)}</div>
              </div>
              <div className="bg-white p-1.5 rounded border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
                <div className="text-[#717182] text-[10px] font-bold uppercase">SL</div>
                <div className="font-extrabold text-[#DC2626]">{activeTrade.slPrice.toFixed(2)}</div>
              </div>
              <div className="bg-white p-1.5 rounded border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212]">
                <div className="text-[#717182] text-[10px] font-bold uppercase">TP</div>
                <div className="font-extrabold text-[#059669]">{activeTrade.tpPrice.toFixed(2)}</div>
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
                <div className={`text-base font-extrabold ${liveRR >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {liveRR >= 0 ? `+${liveRR.toFixed(2)}R` : `${liveRR.toFixed(2)}R`}
                </div>
              </div>
            </div>

            {/* Close Trade Action */}
            <button
              type="button"
              onClick={() => onCloseTrade(activeTrade.id)}
              disabled={isSubmitting}
              className="w-full min-h-[44px] py-2.5 px-4 bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 text-white font-mono font-black text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <XCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Menutup Posisi...' : 'Tutup Posisi Sekarang'}</span>
            </button>
          </div>

          <div className="p-2.5 bg-[#F0F0F0] border-2 border-[#121212] rounded-lg flex items-center gap-2 text-xs text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
            <Lock className="w-4 h-4 text-[#121212] shrink-0" />
            <span className="font-semibold">Tutup posisi di atas terlebih dahulu untuk membuka posisi baru.</span>
          </div>
        </div>
      ) : (
        /* ── STATE A: FLAT / NEW ORDER FORM ── */
        <div className="space-y-4">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182]">
            Entry order
          </div>

          {/* Side Selector (BUY vs SELL) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSideSwitch('LONG')}
              className={`min-h-[44px] py-2 px-3 text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-lg border-2 border-[#121212] transition-all shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                selectedSide === 'LONG'
                  ? 'bg-[#059669] text-white'
                  : 'bg-white text-[#121212] hover:bg-[#E7F9F0]'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>BUY (LONG)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSideSwitch('SHORT')}
              className={`min-h-[44px] py-2 px-3 text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-lg border-2 border-[#121212] transition-all shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                selectedSide === 'SHORT'
                  ? 'bg-[#DC2626] text-white'
                  : 'bg-white text-[#121212] hover:bg-[#FDECEC]'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>SELL (SHORT)</span>
            </button>
          </div>

          {/* Risk % Input & Quick Presets */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-[#1040C0]" />
                <span>Risk per Trade:</span>
              </span>
              <span className="font-mono text-[#121212] font-black text-xs">
                ${riskAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="100"
                  value={riskInputStr}
                  onChange={(e) => handleRiskChange(e.target.value)}
                  placeholder="e.g. 1.0"
                  className="w-full min-h-[40px] bg-white border-2 border-[#121212] rounded-lg pl-3 pr-8 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#717182] pointer-events-none">
                  %
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.5, 1.0, 1.5, 2.0].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRiskPreset(r)}
                  className={`min-h-[32px] py-1 text-xs font-mono font-extrabold rounded border-2 border-[#121212] transition-all shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
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

          {/* Stop Loss Input */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide">
                Stop Loss:
              </span>
              <span className="text-[11px] text-[#DC2626] font-mono font-bold">
                {rrCalc.isValid ? `Risk: ${rrCalc.risk.toFixed(2)} pts` : ''}
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              value={slPrice}
              onChange={(e) => handleSlChange(e.target.value)}
              placeholder="e.g. 3000.00"
              className="w-full min-h-[40px] bg-white border-2 border-[#121212] rounded-lg px-3 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
            />
          </div>

          {/* Target RR Input & Quick Presets */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5 text-[#B45309]" />
                <span>Target Risk / Reward (RR):</span>
              </span>
              <span className="text-[11px] font-mono text-[#059669] font-black">
                {rrCalc.isValid ? `Actual: 1 : ${rrCalc.rr}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
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
                  className="w-full min-h-[40px] bg-white border-2 border-[#121212] rounded-lg pl-9 pr-3 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
                />
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {RR_PRESETS.map((rr) => (
                <button
                  key={rr}
                  type="button"
                  onClick={() => handleRRPreset(rr)}
                  className={`min-h-[32px] py-1 text-xs font-mono font-extrabold rounded border-2 border-[#121212] transition-all shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
                    selectedRR === rr && rrInputStr === String(rr)
                      ? 'bg-[#1040C0] text-white'
                      : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'
                  }`}
                >
                  1:{rr}
                </button>
              ))}
            </div>
          </div>

          {/* Take Profit Input */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[#121212] font-bold uppercase text-[10px] tracking-wide">
                Take Profit:
              </span>
              <span className="text-[11px] text-[#059669] font-mono font-bold">
                {rrCalc.isValid ? `Reward: ${rrCalc.reward.toFixed(2)} pts` : ''}
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              value={tpPrice}
              onChange={(e) => setTpPrice(e.target.value)}
              placeholder="e.g. 3020.00"
              className="w-full min-h-[40px] bg-white border-2 border-[#121212] rounded-lg px-3 py-2 text-[#121212] font-mono font-extrabold text-sm shadow-[2px_2px_0px_0px_#121212] focus:outline-none focus:bg-[#FFFDEB] transition-colors"
            />
          </div>

          {/* Sizing & Calculation Box */}
          {rrCalc.isValid ? (
            <div className="p-3 bg-[#F0F0F0] border-2 border-[#121212] rounded-lg text-xs font-mono space-y-1.5 text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
              <div className="flex justify-between">
                <span className="text-[#717182] font-bold">
                  Lot Size ({symbol.toUpperCase().includes('XAU') ? '100 oz' : symbol.toUpperCase().includes('NSX') || symbol.toUpperCase().includes('NAS') ? '1 pt/$' : `${contractSize} units`}):
                </span>
                <strong className="text-[#121212] font-black">{lotSize.toFixed(2)} Lot</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#717182] font-bold">Max Risk:</span>
                <strong className="text-[#DC2626] font-black">-${riskAmount.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#717182] font-bold">Target Profit:</span>
                <strong className="text-[#059669] font-black">+${(riskAmount * rrCalc.rr).toFixed(2)}</strong>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-[#FDECEC] border-2 border-[#121212] rounded-lg text-[#DC2626] text-xs flex items-center gap-2 shadow-[2px_2px_0px_0px_#121212] font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#DC2626]" />
              <span>{rrCalc.error || 'Konfigurasi SL/TP tidak valid.'}</span>
            </div>
          )}

          {/* Toggle Interactive SL/TP Lines on Chart */}
          <button
            type="button"
            onClick={() => setShowChartPlannedLines(!showChartPlannedLines)}
            className={`w-full min-h-[38px] py-2 px-3 text-xs font-mono font-bold uppercase tracking-wider rounded-lg border-2 border-[#121212] transition-all flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
              showChartPlannedLines
                ? 'bg-[#EAF2FF] text-[#1040C0]'
                : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'
            }`}
          >
            {showChartPlannedLines ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-[#F0C020] animate-pulse" />
                <span>Sembunyikan garis SL dan TP</span>
              </>
            ) : (
              <>
                <Crosshair className="w-3.5 h-3.5 text-[#B45309]" />
                <span>Tampilkan garis SL dan TP</span>
              </>
            )}
          </button>

          {/* Place Trade Button */}
          <button
            type="button"
            onClick={handleExecute}
            disabled={!rrCalc.isValid || lotSize <= 0 || isSubmitting}
            className={`w-full min-h-[46px] py-3 font-mono font-black text-xs uppercase tracking-wider rounded-lg transition-all border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-white ${
              selectedSide === 'LONG'
                ? 'bg-[#059669] hover:bg-[#047857] disabled:bg-[#CBD5E1] disabled:text-[#475569] disabled:cursor-not-allowed'
                : 'bg-[#DC2626] hover:bg-[#B91C1C] disabled:bg-[#CBD5E1] disabled:text-[#475569] disabled:cursor-not-allowed'
            }`}
          >
            {isSubmitting
              ? 'Membuka Posisi...'
              : `Buka Posisi ${selectedSide} @ ${currentPrice > 0 ? currentPrice.toFixed(2) : '--'}`}
          </button>
        </div>
      )}
    </div>
  );
});
