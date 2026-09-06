import React, { useState, useEffect } from 'react';
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
  controlledSlPrice?: number | null;
  controlledTpPrice?: number | null;
}

const RR_PRESETS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0];

export const OrderPanel: React.FC<OrderPanelProps> = ({
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
  controlledSlPrice,
  controlledTpPrice,
}) => {
  const [selectedSide, setSelectedSide] = useState<TradeSide>('LONG');
  const [slPrice, setSlPrice] = useState<string>('');
  const [tpPrice, setTpPrice] = useState<string>('');
  const [selectedRR, setSelectedRR] = useState<number>(2.0);
  const [showChartPlannedLines, setShowChartPlannedLines] = useState<boolean>(false);

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

  // Handle Quick RR Preset Click
  const handleRRPreset = (rr: number) => {
    setSelectedRR(rr);
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
    onOpenTrade({
      side: selectedSide,
      entryPrice: currentPrice,
      slPrice: numSL,
      tpPrice: numTP,
      volume: lotSize,
      riskAmount,
    });
  };

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
    <div className="bg-[#121622] border border-slate-800 rounded-xl p-4 flex flex-col gap-4 text-white shadow-lg h-full">
      {/* Header: Market Price & Account Balance */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Harga Terakhir {symbol}
          </div>
          <div className="text-xl font-mono font-bold text-amber-400">
            {currentPrice > 0 ? currentPrice.toFixed(2) : '--.--'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Saldo Akun
          </div>
          <div className="text-lg font-mono font-bold text-slate-100">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Intrabar Ambiguity Warning Banner */}
      {intrabarWarning && (
        <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-lg text-amber-200 flex items-start gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[11px]">Peringatan Intrabar</div>
            <div className="text-[11px] leading-tight text-amber-300/90">{intrabarWarning}</div>
          </div>
        </div>
      )}

      {/* ── STATE B: ACTIVE POSITION VIEW ── */}
      {isTradeOpen ? (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Open position</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              #{activeTrade.id.slice(0, 6)}
            </span>
          </div>

          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span
                className={`px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded ${
                  activeTrade.side === 'LONG'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {activeTrade.side === 'LONG' ? 'BUY (LONG)' : 'SELL (SHORT)'}
              </span>
              <span className="font-mono text-xs text-slate-300 font-semibold">
                {activeTrade.volume.toFixed(2)} Lot
              </span>
            </div>

            {/* Entry, SL, TP Grid */}
            <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <div className="text-slate-500 text-[10px]">Entry</div>
                <div className="font-bold text-slate-200">{activeTrade.entryPrice.toFixed(2)}</div>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <div className="text-slate-500 text-[10px]">SL</div>
                <div className="font-bold text-rose-400">{activeTrade.slPrice.toFixed(2)}</div>
              </div>
              <div className="bg-slate-950/80 p-1.5 rounded border border-slate-800">
                <div className="text-slate-500 text-[10px]">TP</div>
                <div className="font-bold text-emerald-400">{activeTrade.tpPrice.toFixed(2)}</div>
              </div>
            </div>

            {/* Live Floating PnL and RR */}
            <div className="flex items-center justify-between font-mono bg-slate-950/80 px-3 py-2 rounded border border-slate-800">
              <div>
                <div className="text-slate-500 text-[10px]">Floating PnL</div>
                <div className={`text-base font-bold ${livePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {livePnl >= 0 ? `+$${livePnl.toFixed(2)}` : `-$${Math.abs(livePnl).toFixed(2)}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-slate-500 text-[10px]">Live R:R</div>
                <div className={`text-base font-bold ${liveRR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {liveRR >= 0 ? `+${liveRR.toFixed(2)}R` : `${liveRR.toFixed(2)}R`}
                </div>
              </div>
            </div>

            {/* Close Trade Action */}
            <button
              type="button"
              onClick={() => onCloseTrade(activeTrade.id)}
              disabled={isSubmitting}
              className="w-full min-h-[44px] py-2.5 px-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <XCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Menutup Posisi...' : 'Tutup Posisi Sekarang'}</span>
            </button>
          </div>

          <div className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-lg flex items-center gap-2 text-xs text-slate-400">
            <Lock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Tutup posisi di atas terlebih dahulu untuk membuka posisi baru.</span>
          </div>
        </div>
      ) : (
        /* ── STATE A: FLAT / NEW ORDER FORM ── */
        <div className="space-y-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Entry order
          </div>

          {/* Side Selector (BUY vs SELL) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSideSwitch('LONG')}
              className={`min-h-[44px] py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-lg border transition-colors ${
                selectedSide === 'LONG'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>BUY (LONG)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSideSwitch('SHORT')}
              className={`min-h-[44px] py-2 px-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-lg border transition-colors ${
                selectedSide === 'SHORT'
                  ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>SELL (SHORT)</span>
            </button>
          </div>

          {/* Risk % Selector */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wide flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                <span>Risk per Trade:</span>
              </span>
              <span className="font-mono text-slate-200 font-bold text-xs">
                {riskPercent}% (${riskAmount.toFixed(2)})
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.5, 1.0, 1.5, 2.0].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onRiskPercentChange(r)}
                  className={`min-h-[36px] py-1 text-xs font-mono font-semibold rounded border transition-colors ${
                    riskPercent === r
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
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
              <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wide">
                Stop Loss:
              </span>
              <span className="text-[11px] text-rose-400 font-mono font-medium">
                {rrCalc.isValid ? `Risk: ${rrCalc.risk.toFixed(2)} pts` : ''}
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              value={slPrice}
              onChange={(e) => handleSlChange(e.target.value)}
              placeholder="e.g. 3000.00"
              className="w-full min-h-[40px] bg-slate-900 border border-slate-800 focus:border-rose-500 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none transition-colors"
            />
          </div>

          {/* Quick RR Presets */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wide flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5 text-amber-400" />
                <span>Target RR Preset:</span>
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                {rrCalc.isValid ? `1 : ${rrCalc.rr}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {RR_PRESETS.map((rr) => (
                <button
                  key={rr}
                  type="button"
                  onClick={() => handleRRPreset(rr)}
                  className={`min-h-[36px] py-1 text-xs font-mono font-semibold rounded border transition-colors ${
                    selectedRR === rr
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
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
              <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wide">
                Take Profit:
              </span>
              <span className="text-[11px] text-emerald-400 font-mono font-medium">
                {rrCalc.isValid ? `Reward: ${rrCalc.reward.toFixed(2)} pts` : ''}
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              value={tpPrice}
              onChange={(e) => setTpPrice(e.target.value)}
              placeholder="e.g. 3020.00"
              className="w-full min-h-[40px] bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none transition-colors"
            />
          </div>

          {/* Sizing & Calculation Box */}
          {rrCalc.isValid ? (
            <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-mono space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">
                  Lot Size ({symbol.toUpperCase().includes('XAU') ? '100 oz' : symbol.toUpperCase().includes('NSX') || symbol.toUpperCase().includes('NAS') ? '1 pt/$' : `${contractSize} units`}):
                </span>
                <strong className="text-slate-100">{lotSize.toFixed(2)} Lot</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Max Risk:</span>
                <strong className="text-rose-400">-${riskAmount.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Profit:</span>
                <strong className="text-emerald-400">+${(riskAmount * rrCalc.rr).toFixed(2)}</strong>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{rrCalc.error || 'Konfigurasi SL/TP tidak valid.'}</span>
            </div>
          )}

          {/* Toggle Interactive SL/TP Lines on Chart */}
          <button
            type="button"
            onClick={() => setShowChartPlannedLines(!showChartPlannedLines)}
            className={`w-full min-h-[38px] py-2 px-3 text-xs font-semibold rounded-lg border transition-all flex items-center justify-center gap-2 ${
              showChartPlannedLines
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-xs'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            {showChartPlannedLines ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Sembunyikan garis SL dan TP</span>
              </>
            ) : (
              <>
                <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                <span>Tampilkan garis SL dan TP</span>
              </>
            )}
          </button>

          {/* Place Trade Button */}
          <button
            type="button"
            onClick={handleExecute}
            disabled={!rrCalc.isValid || lotSize <= 0 || isSubmitting}
            className={`w-full min-h-[44px] py-3 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors shadow-sm ${
              selectedSide === 'LONG'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed'
                : 'bg-rose-600 hover:bg-rose-500 text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed'
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
};
