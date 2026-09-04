import React, { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, ShieldAlert, CheckCircle2, AlertTriangle, XCircle, DollarSign, Calculator, Zap } from 'lucide-react';
import { calculatePositionSize, calculateRR, calculateTPFromRR, calculatePnL, BacktestTradeRecord, TradeSide } from '../../../../server/src/services/backtestEngine';

interface OrderPanelProps {
  currentPrice: number;
  balance: number;
  riskPercent: number;
  onRiskPercentChange: (risk: number) => void;
  activeTrade: BacktestTradeRecord | null;
  onOpenTrade: (trade: {
    side: TradeSide;
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    volume: number;
    riskAmount: number;
  }) => void;
  onCloseTrade: () => void;
  intrabarWarning?: string | null;
}

const RR_PRESETS = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0];

export const OrderPanel: React.FC<OrderPanelProps> = ({
  currentPrice,
  balance,
  riskPercent,
  onRiskPercentChange,
  activeTrade,
  onOpenTrade,
  onCloseTrade,
  intrabarWarning,
}) => {
  const [selectedSide, setSelectedSide] = useState<TradeSide>('LONG');
  const [slPrice, setSlPrice] = useState<string>('');
  const [tpPrice, setTpPrice] = useState<string>('');
  const [selectedRR, setSelectedRR] = useState<number>(2.0);

  // Initialize or update default SL/TP when current price changes and no custom SL has been typed
  useEffect(() => {
    if (currentPrice > 0 && (!slPrice || slPrice === '0')) {
      const defaultSlDist = 5.0; // 5 pts default
      if (selectedSide === 'LONG') {
        const sl = Math.round((currentPrice - defaultSlDist) * 100) / 100;
        const tp = calculateTPFromRR('LONG', currentPrice, sl, selectedRR);
        setSlPrice(sl.toFixed(2));
        setTpPrice(tp.toFixed(2));
      } else {
        const sl = Math.round((currentPrice + defaultSlDist) * 100) / 100;
        const tp = calculateTPFromRR('SHORT', currentPrice, sl, selectedRR);
        setSlPrice(sl.toFixed(2));
        setTpPrice(tp.toFixed(2));
      }
    }
  }, [currentPrice, selectedSide]);

  // Handle side switch
  const handleSideSwitch = (side: TradeSide) => {
    setSelectedSide(side);
    const defaultSlDist = 5.0;
    if (side === 'LONG') {
      const sl = Math.round((currentPrice - defaultSlDist) * 100) / 100;
      const tp = calculateTPFromRR('LONG', currentPrice, sl, selectedRR);
      setSlPrice(sl.toFixed(2));
      setTpPrice(tp.toFixed(2));
    } else {
      const sl = Math.round((currentPrice + defaultSlDist) * 100) / 100;
      const tp = calculateTPFromRR('SHORT', currentPrice, sl, selectedRR);
      setSlPrice(sl.toFixed(2));
      setTpPrice(tp.toFixed(2));
    }
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
  const lotSize = calculatePositionSize(balance, riskPercent, currentPrice, numSL);
  const rrCalc = calculateRR(selectedSide, currentPrice, numSL, numTP);

  // Active Trade Live Calculations
  let liveUnrealizedPnl = 0;
  let liveRR = 0;
  if (activeTrade && currentPrice > 0) {
    liveUnrealizedPnl = calculatePnL(
      activeTrade.side,
      activeTrade.entryPrice,
      currentPrice,
      activeTrade.volume
    );
    const priceRisk = Math.abs(activeTrade.entryPrice - activeTrade.slPrice);
    const priceCaptured = activeTrade.side === 'LONG'
      ? (currentPrice - activeTrade.entryPrice)
      : (activeTrade.entryPrice - currentPrice);
    liveRR = priceRisk > 0 ? Math.round((priceCaptured / priceRisk) * 100) / 100 : 0;
  }

  const handleExecute = () => {
    if (!rrCalc.isValid) return;
    onOpenTrade({
      side: selectedSide,
      entryPrice: currentPrice,
      slPrice: numSL,
      tpPrice: numTP,
      volume: lotSize,
      riskAmount,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow-xl">
      {/* Header: Current Market Price & Balance */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <div className="text-[11px] font-medium text-slate-400">Harga Terakhir XAUUSD</div>
          <div className="text-xl font-mono font-black text-amber-400">
            {currentPrice > 0 ? currentPrice.toFixed(2) : '--.--'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-medium text-slate-400">Saldo Akun</div>
          <div className="text-lg font-mono font-bold text-slate-100">
            ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Intrabar Ambiguity Warning Banner */}
      {intrabarWarning && (
        <div className="p-3 bg-amber-950/50 border border-amber-500/50 rounded-lg flex items-start gap-2.5 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Peringatan Ambiguity Intrabar</div>
            <div className="text-[11px] text-amber-200/90">{intrabarWarning}</div>
          </div>
        </div>
      )}

      {/* Mode A: Active Position View */}
      {activeTrade ? (
        <div className="space-y-3">
          <div className="p-3.5 bg-slate-800/80 border border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded font-bold text-xs ${
                  activeTrade.side === 'LONG'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {activeTrade.side === 'LONG' ? 'POSISI LONG' : 'POSISI SHORT'}
                </span>
                <span className="text-xs font-mono text-slate-300">
                  {activeTrade.volume.toFixed(2)} Lot (100 oz)
                </span>
              </div>
              <span className="text-[11px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-semibold border border-blue-500/30">
                ACTIVE
              </span>
            </div>

            {/* Position Price Grid */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="bg-slate-900/80 p-2 rounded border border-slate-700/50">
                <div className="text-[10px] text-slate-400 mb-0.5">Entry</div>
                <div className="font-bold text-cyan-300">{activeTrade.entryPrice.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900/80 p-2 rounded border border-slate-700/50">
                <div className="text-[10px] text-slate-400 mb-0.5">Stop Loss</div>
                <div className="font-bold text-rose-400">{activeTrade.slPrice.toFixed(2)}</div>
              </div>
              <div className="bg-slate-900/80 p-2 rounded border border-slate-700/50">
                <div className="text-[10px] text-slate-400 mb-0.5">Take Profit</div>
                <div className="font-bold text-emerald-400">{activeTrade.tpPrice.toFixed(2)}</div>
              </div>
            </div>

            {/* Live Floating PnL */}
            <div className="p-3 bg-slate-900 rounded-lg flex items-center justify-between border border-slate-700/60 font-mono">
              <div>
                <div className="text-[10px] text-slate-400">Floating PnL:</div>
                <div className={`text-lg font-bold ${liveUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {liveUnrealizedPnl >= 0 ? `+$${liveUnrealizedPnl.toFixed(2)}` : `-$${Math.abs(liveUnrealizedPnl).toFixed(2)}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">Captured R:</div>
                <div className={`text-lg font-bold ${liveRR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {liveRR >= 0 ? `+${liveRR.toFixed(2)}R` : `${liveRR.toFixed(2)}R`}
                </div>
              </div>
            </div>

            {/* Manual Close Action */}
            <button
              onClick={onCloseTrade}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-lg transition-all active:scale-98 shadow-lg flex items-center justify-center gap-2 text-xs"
            >
              <XCircle className="w-4 h-4" />
              <span>Tutup Posisi Sekarang (Manual Exit @ {currentPrice.toFixed(2)})</span>
            </button>
          </div>
        </div>
      ) : (
        /* Mode B: Order Creation Form */
        <div className="space-y-4">
          {/* Side Selector (BUY vs SELL) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSideSwitch('LONG')}
              className={`py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                selectedSide === 'LONG'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/40'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>BUY (LONG)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSideSwitch('SHORT')}
              className={`py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                selectedSide === 'SHORT'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40 border border-rose-400/40'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-750 hover:text-slate-200'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>SELL (SHORT)</span>
            </button>
          </div>

          {/* Risk % Selector */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
                <span>Risk per Trade:</span>
              </span>
              <span className="font-mono text-slate-200 font-bold">
                {riskPercent}% (${riskAmount.toFixed(2)})
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.5, 1.0, 1.5, 2.0].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onRiskPercentChange(r)}
                  className={`py-1 rounded text-xs font-mono font-semibold transition-colors ${
                    riskPercent === r
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
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
              <span className="text-slate-400 font-medium">Stop Loss Price:</span>
              <span className="text-[11px] text-rose-400 font-mono">
                {rrCalc.isValid ? `Risk: ${rrCalc.risk.toFixed(2)} pts` : ''}
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              value={slPrice}
              onChange={(e) => handleSlChange(e.target.value)}
              placeholder="e.g. 3120.00"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>

          {/* Quick RR Presets */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5 text-amber-400" />
                <span>Quick Target RR:</span>
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                {rrCalc.isValid ? `1 : ${rrCalc.rr}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {RR_PRESETS.map(rr => (
                <button
                  key={rr}
                  type="button"
                  onClick={() => handleRRPreset(rr)}
                  className={`py-1 rounded text-xs font-mono font-semibold transition-colors ${
                    selectedRR === rr
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
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
              <span className="text-slate-400 font-medium">Take Profit Price:</span>
              <span className="text-[11px] text-emerald-400 font-mono">
                {rrCalc.isValid ? `Reward: ${rrCalc.reward.toFixed(2)} pts` : ''}
              </span>
            </div>
            <input
              type="number"
              step="0.01"
              value={tpPrice}
              onChange={(e) => setTpPrice(e.target.value)}
              placeholder="e.g. 3134.00"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Sizing & Error Info */}
          {rrCalc.isValid ? (
            <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 text-xs font-mono space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Lot Size (100 oz):</span>
                <strong className="text-slate-100">{lotSize.toFixed(2)} Lot</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Max Risk:</span>
                <strong className="text-rose-400">-${riskAmount.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Profit:</span>
                <strong className="text-emerald-400">+${(riskAmount * rrCalc.rr).toFixed(2)}</strong>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-rose-950/30 border border-rose-800/40 rounded-lg text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{rrCalc.error || 'Konfigurasi SL/TP tidak valid.'}</span>
            </div>
          )}

          {/* Place Trade Button */}
          <button
            type="button"
            onClick={handleExecute}
            disabled={!rrCalc.isValid || lotSize <= 0}
            className={`w-full py-3 rounded-lg font-bold text-xs tracking-wide uppercase transition-all shadow-lg active:scale-98 ${
              selectedSide === 'LONG'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed'
                : 'bg-rose-600 hover:bg-rose-500 text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed'
            }`}
          >
            Buka Posisi {selectedSide} @ {currentPrice > 0 ? currentPrice.toFixed(2) : '--'}
          </button>
        </div>
      )}
    </div>
  );
};
