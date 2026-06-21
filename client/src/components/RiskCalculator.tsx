import React, { useState, useEffect } from 'react';
import { Calculator, AlertTriangle, ShieldCheck, TrendingUp, Info } from 'lucide-react';
import { formatCurrency, formatNumber } from '../utils/numberUtils';

interface RiskCalculatorProps {
  onClose?: () => void;
}

export default function RiskCalculator({ onClose }: RiskCalculatorProps) {
  const [balance, setBalance] = useState<number>(1000);
  const [currency, setCurrency] = useState<'USD' | 'CENT' | 'IDR'>('USD');
  const [riskMode, setRiskMode] = useState<'PERCENT' | 'MONEY'>('PERCENT');
  const [riskValue, setRiskValue] = useState<number>(1);
  const [symbol, setSymbol] = useState<string>('XAUUSD');
  const [entryPrice, setEntryPrice] = useState<number | ''>('');
  const [stopLoss, setStopLoss] = useState<number | ''>('');
  const [slPips, setSlPips] = useState<number | ''>('');
  const [rrTarget, setRrTarget] = useState<number>(2);
  
  // Advanced Settings
  const [pipValuePerLot, setPipValuePerLot] = useState<number>(10);
  const [lotStep, setLotStep] = useState<number>(0.01);
  const [minLot, setMinLot] = useState<number>(0.01);
  const [maxLot, setMaxLot] = useState<number>(100);

  // Results
  const [results, setResults] = useState<{
    slDistancePips: number;
    riskMoney: number;
    rawLot: number;
    finalLot: number;
    tpPrice: number;
    potentialProfit: number;
    warnings: string[];
  }>({
    slDistancePips: 0,
    riskMoney: 0,
    rawLot: 0,
    finalLot: 0,
    tpPrice: 0,
    potentialProfit: 0,
    warnings: [],
  });

  useEffect(() => {
    // Basic pip value defaults
    if (symbol.includes('XAU')) setPipValuePerLot(10);
    else if (symbol.includes('JPY')) setPipValuePerLot(6.5);
    else setPipValuePerLot(10);
  }, [symbol]);

  useEffect(() => {
    calculateRisk();
  }, [balance, riskMode, riskValue, entryPrice, stopLoss, slPips, rrTarget, pipValuePerLot, lotStep, minLot, maxLot]);

  const calculateRisk = () => {
    let currentRiskMoney = 0;
    
    if (riskMode === 'PERCENT') {
      currentRiskMoney = balance * (riskValue / 100);
    } else {
      currentRiskMoney = riskValue;
    }

    let calculatedSlPips = 0;
    let slPrice = 0;

    if (slPips !== '') {
      calculatedSlPips = Number(slPips);
      if (entryPrice !== '') {
        // Assume Long for simplicity if entry given but no SL price
        slPrice = Number(entryPrice) - (calculatedSlPips * 0.1); // Depends on asset, rough approx
      }
    } else if (entryPrice !== '' && stopLoss !== '') {
      const dist = Math.abs(Number(entryPrice) - Number(stopLoss));
      // Forex standard: 1 pip = 0.0001 (except JPY 0.01)
      // Gold standard: 1 pip = 0.1
      let multiplier = 10000;
      if (symbol.includes('JPY')) multiplier = 100;
      if (symbol.includes('XAU')) multiplier = 10;
      
      calculatedSlPips = dist * multiplier;
      slPrice = Number(stopLoss);
    }

    let finalLot = 0;
    let rawLot = 0;
    let potentialProfit = 0;
    let tpPrice = 0;
    const warnings: string[] = [];

    if (calculatedSlPips > 0 && currentRiskMoney > 0) {
      const lossPerLot = calculatedSlPips * pipValuePerLot;
      rawLot = currentRiskMoney / lossPerLot;
      
      // Normalize
      finalLot = Math.round(rawLot / lotStep) * lotStep;
      
      if (finalLot < minLot) {
        warnings.push(`Lot too small! Minimum is ${minLot}. Try risking more or smaller SL.`);
        finalLot = minLot;
      }
      if (finalLot > maxLot) {
        warnings.push(`Lot exceeds maximum ${maxLot}!`);
        finalLot = maxLot;
      }

      potentialProfit = currentRiskMoney * rrTarget;

      if (entryPrice !== '') {
        const entry = Number(entryPrice);
        const isLong = slPrice < entry;
        const rewardDist = Math.abs(entry - slPrice) * rrTarget;
        tpPrice = isLong ? entry + rewardDist : entry - rewardDist;
      }
    }

    setResults({
      slDistancePips: calculatedSlPips,
      riskMoney: currentRiskMoney,
      rawLot,
      finalLot,
      tpPrice,
      potentialProfit,
      warnings
    });
  };

  return (
    <div className="bg-dark/80 backdrop-blur-md rounded-xl border border-[#2b3139] p-6 shadow-2xl relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-[rgba(14,203,129,0.12)] blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[rgba(252,213,53,0.12)] blur-[80px] rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-accentBlue/20 to-accentEmerald/20 rounded-xl border border-[#2b3139]">
            <Calculator className="w-5 h-5 text-[#0ecb81]" />
          </div>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Risk & Lot Calculator
          </h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[#929aa5] hover:text-white transition-colors">
            ✕
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Account Balance</label>
              <div className="relative">
                <input type="number" value={balance} onChange={e => setBalance(Number(e.target.value))}
                  className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] focus:ring-1 focus:ring-accentBlue/50 transition-all outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Risk Mode</label>
              <select value={riskMode} onChange={e => setRiskMode(e.target.value as any)}
                className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] focus:ring-1 focus:ring-accentBlue/50 transition-all outline-none appearance-none">
                <option value="PERCENT">% of Balance</option>
                <option value="MONEY">Fixed Money</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Risk Amount</label>
              <div className="relative">
                <input type="number" value={riskValue} onChange={e => setRiskValue(Number(e.target.value))}
                  className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] transition-all outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Symbol</label>
              <input type="text" value={symbol} onChange={e => setSymbol(e.target.value)}
                className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] transition-all outline-none uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Entry Price</label>
              <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value ? Number(e.target.value) : '')} placeholder="Optional"
                className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] transition-all outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Stop Loss Price</label>
              <input type="number" value={stopLoss} onChange={e => { setStopLoss(e.target.value ? Number(e.target.value) : ''); setSlPips(''); }} placeholder="Optional"
                className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] transition-all outline-none" />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex-1 border-t border-[#2b3139]"></div>
            <span className="text-xs text-[#707a8a] font-medium">OR</span>
            <div className="flex-1 border-t border-[#2b3139]"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">SL in Pips</label>
              <input type="number" value={slPips} onChange={e => { setSlPips(e.target.value ? Number(e.target.value) : ''); setStopLoss(''); }} placeholder="e.g. 20"
                className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] transition-all outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Reward : Risk (R:R)</label>
              <input type="number" value={rrTarget} onChange={e => setRrTarget(Number(e.target.value))} step="0.1"
                className="w-full bn-card  border border-[#2b3139] rounded-xl py-2 px-3 text-white text-sm focus:border-[#fcd535] transition-all outline-none" />
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-6 flex flex-col justify-center">
          <div className="bn-card  border border-[#2b3139] rounded-xl p-6 text-center shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-accentBlue/5 to-transparent opacity-0 group-hover:opacity-100 transition duration-500 pointer-events-none"></div>
            <h3 className="text-sm font-bold text-[#929aa5] mb-2 uppercase tracking-wider">Recommended Lot Size</h3>
            <div className="text-5xl md:text-6xl font-black text-white mb-2 tracking-tight">
              {formatNumber(results.finalLot, 2)}
            </div>
            <p className="text-xs text-[#707a8a]">Raw calculation: {formatNumber(results.rawLot, 3)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4">
              <p className="text-xs text-[#707a8a] mb-1">Money at Risk</p>
              <p className="text-lg font-bold text-[#f6465d]">{formatCurrency(results.riskMoney, currency)}</p>
            </div>
            
            <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4">
              <p className="text-xs text-[#707a8a] mb-1">Potential Profit</p>
              <p className="text-lg font-bold text-[#0ecb81]">{formatCurrency(results.potentialProfit, currency)}</p>
            </div>
            
            <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4">
              <p className="text-xs text-[#707a8a] mb-1">Stop Loss Distance</p>
              <div className="flex items-end space-x-2">
                <p className="text-lg font-semibold text-white">{formatNumber(results.slDistancePips, 1)} Pips</p>
              </div>
            </div>
            
            <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4">
              <p className="text-xs text-[#707a8a] mb-1">Target Price (TP)</p>
              <p className="text-lg font-semibold text-white">{results.tpPrice > 0 ? formatNumber(results.tpPrice, 5) : '-'}</p>
            </div>
          </div>

          {results.warnings.map((w, i) => (
            <div key={i} className="flex items-start space-x-2 text-xs text-yellow-500 bg-yellow-500/10 p-2 rounded-lg">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
