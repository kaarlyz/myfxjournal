import React, { useState, useEffect } from 'react';
import { Calculator, DollarSign, Percent, Info } from 'lucide-react';

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
    <div className="bg-dark/80 backdrop-blur-md rounded-2xl border border-white/5 p-6 shadow-2xl relative overflow-hidden">
      {/* Decorative glows */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-accentEmerald/20 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accentBlue/20 blur-[80px] rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-accentBlue/20 to-accentEmerald/20 rounded-xl border border-white/10">
            <Calculator className="w-5 h-5 text-accentEmerald" />
          </div>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Risk & Lot Calculator
          </h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Account Balance</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="number" value={balance} onChange={e => setBalance(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-white text-sm focus:border-accentBlue focus:ring-1 focus:ring-accentBlue/50 transition-all outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Risk Mode</label>
              <select value={riskMode} onChange={e => setRiskMode(e.target.value as any)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-white text-sm focus:border-accentBlue focus:ring-1 focus:ring-accentBlue/50 transition-all outline-none appearance-none">
                <option value="PERCENT">% of Balance</option>
                <option value="MONEY">Fixed Money</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Risk Amount</label>
              <div className="relative">
                {riskMode === 'PERCENT' ? <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" /> : <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />}
                <input type="number" value={riskValue} onChange={e => setRiskValue(Number(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-white text-sm focus:border-accentBlue transition-all outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Symbol</label>
              <input type="text" value={symbol} onChange={e => setSymbol(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-white text-sm focus:border-accentBlue transition-all outline-none uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Entry Price</label>
              <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value ? Number(e.target.value) : '')} placeholder="Optional"
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-white text-sm focus:border-accentBlue transition-all outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Stop Loss Price</label>
              <input type="number" value={stopLoss} onChange={e => { setStopLoss(e.target.value ? Number(e.target.value) : ''); setSlPips(''); }} placeholder="Optional"
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-white text-sm focus:border-accentBlue transition-all outline-none" />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex-1 border-t border-white/10"></div>
            <span className="text-xs text-gray-500 font-medium">OR</span>
            <div className="flex-1 border-t border-white/10"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">SL in Pips</label>
              <input type="number" value={slPips} onChange={e => { setSlPips(e.target.value ? Number(e.target.value) : ''); setStopLoss(''); }} placeholder="e.g. 20"
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-white text-sm focus:border-accentBlue transition-all outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Reward : Risk (R:R)</label>
              <input type="number" value={rrTarget} onChange={e => setRrTarget(Number(e.target.value))} step="0.1"
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-white text-sm focus:border-accentBlue transition-all outline-none" />
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="bg-black/60 rounded-xl border border-white/5 p-5 flex flex-col justify-center space-y-6">
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-gray-400">Recommended Lot Size</p>
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-accentBlue to-accentEmerald">
              {results.finalLot.toFixed(2)}
            </h1>
            <p className="text-xs text-gray-500">Raw calculation: {results.rawLot.toFixed(3)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">Risk Amount</p>
              <p className="text-lg font-bold text-lossRed">${results.riskMoney.toFixed(2)}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">Potential Profit</p>
              <p className="text-lg font-bold text-winGreen">${results.potentialProfit.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">SL Distance</p>
              <p className="text-lg font-semibold text-white">{results.slDistancePips.toFixed(1)} Pips</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">Take Profit Price</p>
              <p className="text-lg font-semibold text-white">{results.tpPrice > 0 ? results.tpPrice.toFixed(5) : '-'}</p>
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
