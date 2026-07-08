import React from 'react';
import { Layers } from 'lucide-react';
import { formatUsd, formatPercent, formatNumber } from '../../utils/formatters';
import { SectionLabel } from '../ui/SectionLabel';

interface Props {
  metrics: any;
}

export default function PairBreakdownTab({ metrics }: Props) {
  const breakdown = Object.entries(metrics.pairBreakdown || {}).map(([symbol, stats]: [string, any]) => ({
    symbol,
    ...stats
  })).sort((a, b) => b.netPnl - a.netPnl);

  if (breakdown.length === 0) {
    return (
      <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-8 text-center text-[#717182] font-bold text-[13px] uppercase tracking-widest">
        No pair data available for breakdown.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
        <SectionLabel label="Performance by Pair / Symbol" shape="circle" color="blue" icon={<Layers className="w-4 h-4" />} className="mb-4 mt-1" />
        
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Trades</th>
                <th>Winrate</th>
                <th>Profit Factor</th>
                <th>Gross Profit</th>
                <th>Gross Loss</th>
                <th>Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((b, idx) => (
                <tr key={idx} className="hover:bg-[#F0F0F0] transition-colors">
                  <td className="font-extrabold text-[#121212] font-display">{b.symbol}</td>
                  <td className="text-[#121212] font-bold">{b.trades}</td>
                  <td className="text-[#121212] font-bold">{formatPercent(b.winrate)}</td>
                  <td className={`font-extrabold font-number text-[14px] ${b.profitFactor >= 1 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                    {b.profitFactor === Infinity ? '∞' : formatNumber(b.profitFactor, 2)}
                  </td>
                  <td className="font-bold text-[var(--profit)] font-number">{formatUsd(b.gp)}</td>
                  <td className="font-bold text-[var(--loss)] font-number">{formatUsd(b.gl)}</td>
                  <td className={`font-extrabold font-number text-[15px] ${b.netPnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                    {formatUsd(b.netPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
