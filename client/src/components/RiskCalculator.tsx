import React, { useState, useEffect } from 'react';
import { Calculator, Info } from 'lucide-react';
import { formatCurrency, formatNumber } from '../utils/numberUtils';
import { Input, Select } from './ui/Input';
import { SectionLabel } from './ui/SectionLabel';

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
    <div className="bg-white border-4 border-[#121212] p-6 md:p-8 shadow-[8px_8px_0px_0px_#121212] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />

      <div className="flex items-center justify-between mb-8 mt-2">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212]">
            <Calculator className="w-6 h-6 text-[#121212]" strokeWidth={2.5} />
          </div>
          <div>
            <SectionLabel label="Tool" shape="square" color="blue" />
            <h2 className="text-2xl font-extrabold text-[#121212] font-display uppercase tracking-wide">
              Risk & Lot Calculator
            </h2>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="bg-white border-2 border-[#121212] p-2 hover:bg-[#F0F0F0] active:translate-y-1 active:shadow-none transition-all shadow-[2px_2px_0px_0px_#121212]">
            <span className="font-extrabold text-[#121212]">✕</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-5 bg-[#F0F0F0] p-6 border-2 border-[#121212]">
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Account Balance" 
              type="number" 
              value={balance} 
              onChange={e => setBalance(Number(e.target.value))} 
            />
            <Select 
              label="Risk Mode" 
              value={riskMode} 
              onChange={e => setRiskMode(e.target.value as any)}
            >
              <option value="PERCENT">% of Balance</option>
              <option value="MONEY">Fixed Money</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Risk Amount" 
              type="number" 
              value={riskValue} 
              onChange={e => setRiskValue(Number(e.target.value))} 
            />
            <Input 
              label="Symbol" 
              type="text" 
              value={symbol} 
              onChange={e => setSymbol(e.target.value)} 
              className="uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Entry Price" 
              type="number" 
              value={entryPrice} 
              onChange={e => setEntryPrice(e.target.value ? Number(e.target.value) : '')} 
              placeholder="Optional" 
            />
            <Input 
              label="Stop Loss Price" 
              type="number" 
              value={stopLoss} 
              onChange={e => { setStopLoss(e.target.value ? Number(e.target.value) : ''); setSlPips(''); }} 
              placeholder="Optional" 
            />
          </div>
          
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 border-t-2 border-dashed border-[#121212]/20"></div>
            <span className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest bg-white px-2 py-1 border-2 border-[#121212]/10">OR</span>
            <div className="flex-1 border-t-2 border-dashed border-[#121212]/20"></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="SL in Pips" 
              type="number" 
              value={slPips} 
              onChange={e => { setSlPips(e.target.value ? Number(e.target.value) : ''); setStopLoss(''); }} 
              placeholder="e.g. 20" 
            />
            <Input 
              label="Reward : Risk (R:R)" 
              type="number" 
              value={rrTarget} 
              onChange={e => setRrTarget(Number(e.target.value))} 
              step="0.1" 
            />
          </div>
          
          <div className="flex items-center gap-4 py-2 mt-2">
            <div className="flex-1 border-t-2 border-[#121212]"></div>
            <span className="text-[10px] font-extrabold text-[#121212] uppercase tracking-widest bg-white px-2 py-1 border-2 border-[#121212]">Advanced Settings</span>
            <div className="flex-1 border-t-2 border-[#121212]"></div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Select 
              label="Currency" 
              value={currency} 
              onChange={e => setCurrency(e.target.value as any)}
            >
              <option value="USD">USD</option>
              <option value="CENT">USC (Cent)</option>
              <option value="IDR">IDR</option>
            </Select>
            <Input 
              label="Lot Step" 
              type="number" 
              value={lotStep} 
              onChange={e => setLotStep(Number(e.target.value))} 
              step="0.01" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Min Lot" 
              type="number" 
              value={minLot} 
              onChange={e => setMinLot(Number(e.target.value))} 
              step="0.01" 
            />
            <Input 
              label="Max Lot" 
              type="number" 
              value={maxLot} 
              onChange={e => setMaxLot(Number(e.target.value))} 
              step="1" 
            />
          </div>
        </div>

        {/* Results Panel */}
        <div className="space-y-6 flex flex-col justify-center">
          <div className="bg-white border-4 border-[#121212] p-8 text-center shadow-[6px_6px_0px_0px_#121212] relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-2 bg-[#121212]" />
            <h3 className="text-[12px] font-extrabold text-[#717182] mb-3 uppercase tracking-widest">Recommended Lot Size</h3>
            <div className="text-6xl md:text-7xl font-black text-[#121212] mb-2 font-display">
              {formatNumber(results.finalLot, 2)}
            </div>
            <p className="text-[11px] font-bold text-[#717182] uppercase tracking-wider bg-[#F0F0F0] inline-block px-3 py-1 border-2 border-[#121212]/10 mt-2">Raw: {formatNumber(results.rawLot, 3)}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-widest mb-1">Money at Risk</p>
              <p className="text-xl font-black text-[var(--loss)] font-number">{formatCurrency(results.riskMoney, currency)}</p>
            </div>
            
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-widest mb-1">Potential Profit</p>
              <p className="text-xl font-black text-[var(--profit)] font-number">{formatCurrency(results.potentialProfit, currency)}</p>
            </div>
            
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-widest mb-1">Stop Loss Distance</p>
              <p className="text-xl font-black text-[#121212] font-number">{formatNumber(results.slDistancePips, 1)} <span className="text-[12px] font-bold text-[#717182]">Pips</span></p>
            </div>
            
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-widest mb-1">Target Price (TP)</p>
              <p className="text-xl font-black text-[#121212] font-number">{results.tpPrice > 0 ? formatNumber(results.tpPrice, 5) : '-'}</p>
            </div>
          </div>

          {results.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 bg-[var(--warning-dim)] border-2 border-[var(--warning)] p-3 shadow-[2px_2px_0px_0px_var(--warning)]">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--warning)]" strokeWidth={3} />
              <span className="text-[12px] font-bold text-[var(--warning)]">{w}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
