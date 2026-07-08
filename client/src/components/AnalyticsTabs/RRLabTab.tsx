import React, { useMemo, useState } from 'react';
import { Target, AlertCircle, BarChart3 } from 'lucide-react';
import { formatNumber, formatPercent } from '../../utils/formatters';
import { SectionLabel } from '../ui/SectionLabel';

interface Props {
  metrics: any;
  trades: any[];
}

export default function RRLabTab({ metrics, trades }: Props) {
  const [customRR, setCustomRR] = useState<number>(2.5);

  const hasMfeMae = useMemo(() => {
    return trades.some(t => t.favorableExcursionUsd !== null && t.favorableExcursionUsd !== undefined && t.favorableExcursionUsd > 0);
  }, [trades]);

  const simulateRR = (targetR: number) => {
    if (!hasMfeMae) return null;
    let wins = 0;
    let losses = 0;
    let be = 0;
    
    trades.forEach(t => {
      // Very basic simulation using MFE / MAE.
      // If we don't know riskUsd, we can't reliably simulate R targets unless we use the MFE % or something.
      // Assuming MAE/MFE are in USD, and we know riskUsd:
      if (!t.riskUsd || t.riskUsd <= 0) return;
      
      const mfeR = (t.favorableExcursionUsd || 0) / t.riskUsd;
      const maeR = (t.adverseExcursionUsd || 0) / t.riskUsd; // adverse is usually positive number in our DB representing how far it went against us
      
      // If it hit target before hitting -1R SL
      // Note: without OHLC sequence we don't know which it hit first.
      // Standard pessimistic assumption: if MAE <= -1R, it's a loss (hit SL first).
      // Otherwise if MFE >= targetR, it's a win.
      
      if (maeR >= 1) {
        losses++; // Hit 1R Stop Loss
      } else if (mfeR >= targetR) {
        wins++; // Hit Target
      } else {
        // Time exit or manual exit before hitting either
        if (t.netPnlUsd > 0) wins++; // Or count as BE/partial? Let's just say loss for strict RR simulation
        else losses++;
      }
    });

    const total = wins + losses + be;
    const winrate = total > 0 ? (wins / total) * 100 : 0;
    const ev = (winrate / 100 * targetR) - ((1 - winrate / 100) * 1);
    
    return { targetR, winrate, ev, wins, losses };
  };

  const sims = hasMfeMae ? [1, 1.5, 2, 3, customRR].map(r => simulateRR(r)) : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
          <SectionLabel label="Realized R Distribution" shape="diamond" color="yellow" icon={<BarChart3 className="w-4 h-4" />} className="mb-4" />
          <div className="space-y-2 font-[Outfit]">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#717182] border-b-2 border-dashed border-[#121212]/20 pb-2">
              <span>Metric</span>
              <span>Value</span>
            </div>
            <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
              <span>Average Realized R</span>
              <span className="font-extrabold font-number text-[14px]">{metrics.avgRealizedRR !== null ? formatNumber(metrics.avgRealizedRR, 2) + 'R' : 'N/A'}</span>
            </div>
            <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
              <span>Median Realized R</span>
              <span className="font-extrabold font-number text-[14px]">{metrics.medianRR !== null ? formatNumber(metrics.medianRR, 2) + 'R' : 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
          <SectionLabel label="Planned R Distribution" shape="circle" color="blue" icon={<Target className="w-4 h-4" />} className="mb-4" />
          <div className="space-y-2 font-[Outfit]">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#717182] border-b-2 border-dashed border-[#121212]/20 pb-2">
              <span>Metric</span>
              <span>Value</span>
            </div>
            <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
              <span>Average Planned R</span>
              <span className="font-extrabold font-number text-[14px]">{metrics.avgPlannedRR !== null ? formatNumber(metrics.avgPlannedRR, 2) + 'R' : 'N/A'}</span>
            </div>
            {metrics.avgPlannedRR === null && (
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mt-2 italic bg-[#F0F0F0] p-2 text-center">Planned R data not available in imported trades.</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <SectionLabel label="Advanced Target Simulation" shape="square" color="dark" icon={<Target className="w-4 h-4" />} />
          {hasMfeMae && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717182]">Custom R:</span>
              <input 
                type="number" 
                step="0.5" 
                value={customRR} 
                onChange={e => setCustomRR(Number(e.target.value))}
                className="input py-1 px-2 w-20 text-center font-bold"
              />
            </div>
          )}
        </div>

        {!hasMfeMae ? (
          <div className="flex items-start gap-3 p-4 bg-[var(--warning-dim)] border-2 border-[var(--warning)] text-[#121212]">
            <AlertCircle className="w-5 h-5 shrink-0 text-[var(--warning)]" strokeWidth={3} />
            <p className="text-[13px] font-bold">Advanced RR simulation unavailable. MFE/MAE (Maximum Favorable/Adverse Excursion) data is required to simulate targets.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Target R</th>
                  <th>Simulated Winrate</th>
                  <th>Wins / Losses</th>
                  <th>Expected Value (EV)</th>
                </tr>
              </thead>
              <tbody>
                {sims.map((sim, idx) => sim && (
                  <tr key={idx} className="hover:bg-[#F0F0F0] transition-colors">
                    <td className="font-extrabold text-[#121212] font-display text-[15px]">{sim.targetR}R</td>
                    <td className="text-[#121212] font-bold font-number">{formatPercent(sim.winrate)}</td>
                    <td className="text-[#121212] font-bold font-number"><span className="text-[var(--profit)]">{sim.wins}</span> / <span className="text-[var(--loss)]">{sim.losses}</span></td>
                    <td className={`font-extrabold font-number text-[15px] ${sim.ev >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                      {formatNumber(sim.ev, 2)}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mt-4">
              * Simulation assumes SL is hit if MAE &gt;= 1R. Without tick/OHLC data, pessimistic resolution is applied.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
