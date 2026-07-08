import React, { useMemo } from 'react';
import { Clock, Calendar, Sun, Moon } from 'lucide-react';
import { formatDuration, formatUsd, formatNumber } from '../../utils/formatters';
import { SectionLabel } from '../ui/SectionLabel';

interface Props {
  metrics: any;
  trades: any[];
}

export default function TimingAnalyticsTab({ metrics, trades }: Props) {
  const sessionStats = useMemo(() => {
    const stats: Record<string, { count: number; netPnl: number; wins: number }> = {};
    trades.forEach(t => {
      const s = t.tradingSession || 'UNKNOWN';
      if (!stats[s]) stats[s] = { count: 0, netPnl: 0, wins: 0 };
      stats[s].count++;
      stats[s].netPnl += (t.recalculatedPnl !== undefined ? t.recalculatedPnl : (t.netPnlUsd || 0));
      if ((t.recalculatedPnl !== undefined ? t.recalculatedPnl : (t.netPnlUsd || 0)) > 0) stats[s].wins++;
    });
    return Object.entries(stats).map(([session, data]) => ({
      session,
      ...data,
      winrate: data.count > 0 ? (data.wins / data.count) * 100 : 0
    })).sort((a, b) => b.netPnl - a.netPnl);
  }, [trades]);

  const bestSession = sessionStats[0];
  const worstSession = sessionStats[sessionStats.length - 1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-[#1040C0]" /> Avg Holding Time</div>
          <div className="text-xl font-extrabold mt-1 text-[#121212] uppercase tracking-wider">
            {formatDuration(metrics.avgHoldingMinutes * 60000)}
          </div>
        </div>
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><Calendar className="w-3.5 h-3.5 text-[#F0C020]" /> Avg Time Between Entries</div>
          <div className="text-xl font-extrabold mt-1 text-[#121212] uppercase tracking-wider">
            {formatDuration(metrics.avgTimeBetweenEntries * 60000)}
          </div>
        </div>
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><Sun className="w-3.5 h-3.5 text-[var(--profit)]" /> Trades per Day</div>
          <div className="text-2xl font-extrabold mt-1 text-[#121212] font-number">
            {formatNumber(metrics.tradesPerDay, 1)}
          </div>
        </div>
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
          <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider flex items-center gap-1.5 mb-1"><Moon className="w-3.5 h-3.5 text-[var(--loss)]" /> Best / Worst Session</div>
          <div className="text-sm font-extrabold mt-1 text-[#121212] truncate font-display tracking-wide">
            <span className="text-[var(--profit)]">{bestSession?.session || '-'}</span> <span className="text-[#121212]/30 px-1">/</span> <span className="text-[var(--loss)]">{worstSession?.session || '-'}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
        <SectionLabel label="Trading Session Breakdown" shape="circle" color="red" className="mt-1 mb-4" />
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Trades</th>
                <th>Winrate</th>
                <th>Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {sessionStats.map((s, idx) => (
                <tr key={idx} className="hover:bg-[#F0F0F0] transition-colors">
                  <td className="font-extrabold text-[#121212] font-display tracking-wide">{s.session}</td>
                  <td className="text-[#121212] font-bold font-number text-[14px]">{s.count}</td>
                  <td className="text-[#121212] font-bold font-number text-[14px]">{s.winrate.toFixed(1)}%</td>
                  <td className={`font-extrabold font-number text-[15px] ${s.netPnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                    {formatUsd(s.netPnl)}
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
