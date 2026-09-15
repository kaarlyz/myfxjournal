import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Target, Award, Percent, AlertOctagon } from 'lucide-react';
import { BacktestStats as IBacktestStats } from '../../shared/backtestEngine';

interface BacktestStatsProps {
  stats: IBacktestStats;
}

export const BacktestStats: React.FC<BacktestStatsProps> = ({ stats }) => {
  const isProfitable = stats.netPnl >= 0;
  const pnlPct = stats.initialBalance > 0 ? (stats.netPnl / stats.initialBalance) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {/* 1. Balance / Equity */}
      <div className="bg-[#F8FAFF] border-2 border-[#121212] p-3 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#1040C0]" />
        <div className="flex items-center justify-between text-[#1040C0] text-[10px] font-black uppercase tracking-wider mb-1 mt-0.5">
          <span>Balance</span>
          <DollarSign className="w-3.5 h-3.5 stroke-[3] text-[#1040C0]" />
        </div>
        <div className="text-base sm:text-lg font-black font-mono text-[#1040C0] tracking-tight">
          ${stats.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        <div className="text-[10px] font-mono text-[#121212] font-bold mt-1">
          Eq: ${stats.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* 2. Net PnL */}
      <div className="bg-white border-2 border-[#121212] p-3 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-1 ${isProfitable ? 'bg-[#059669]' : 'bg-[#DC2626]'}`} />
        <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider mb-1 mt-0.5">
          <span>Net PnL</span>
          {isProfitable ? (
            <TrendingUp className="w-3.5 h-3.5 stroke-[3] text-[#059669]" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 stroke-[3] text-[#DC2626]" />
          )}
        </div>
        <div className={`text-base sm:text-lg font-black font-mono tracking-tight ${isProfitable ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
          {isProfitable ? `+$${stats.netPnl.toFixed(2)}` : `-$${Math.abs(stats.netPnl).toFixed(2)}`}
        </div>
        <div className={`text-[10px] font-mono font-black ${isProfitable ? 'text-[#059669]' : 'text-[#DC2626]'} mt-1`}>
          {isProfitable ? `+${pnlPct.toFixed(2)}%` : `${pnlPct.toFixed(2)}%`}
        </div>
      </div>

      {/* 3. Win Rate */}
      <div className="bg-white border-2 border-[#121212] p-3 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#F59E0B]" />
        <div className="flex items-center justify-between text-[#B45309] text-[10px] font-black uppercase tracking-wider mb-1 mt-0.5">
          <span>Win Rate</span>
          <Percent className="w-3.5 h-3.5 stroke-[3] text-[#B45309]" />
        </div>
        <div className="text-base sm:text-lg font-black font-mono text-[#B45309] tracking-tight">
          {stats.winRate.toFixed(1)}%
        </div>
        <div className="text-[10px] font-mono text-[#121212] font-bold mt-1">
          {stats.wins}W / {stats.losses}L · {stats.totalTrades} trade
        </div>
      </div>

      {/* 4. Profit Factor */}
      <div className="bg-white border-2 border-[#121212] p-3 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#1040C0]" />
        <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider mb-1 mt-0.5">
          <span>Prof. Factor</span>
          <Award className="w-3.5 h-3.5 stroke-[2.5] text-[#1040C0]" />
        </div>
        <div className="text-base sm:text-lg font-black font-mono text-[#121212] tracking-tight">
          {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
        </div>
        <div className="text-[10px] font-mono text-[#717182] font-bold mt-1">
          {stats.ambiguous > 0 ? `${stats.ambiguous} ambiguous` : 'clean exits'}
        </div>
      </div>

      {/* 5. Average RR */}
      <div className="bg-white border-2 border-[#121212] p-3 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#059669]" />
        <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider mb-1 mt-0.5">
          <span>Avg RR</span>
          <Target className="w-3.5 h-3.5 stroke-[2.5] text-[#059669]" />
        </div>
        <div className="text-base sm:text-lg font-black font-mono text-[#121212] tracking-tight">
          1 : {stats.avgRR.toFixed(2)}
        </div>
        <div className="text-[10px] font-mono text-[#717182] font-bold mt-1">
          realized avg
        </div>
      </div>

      {/* 6. Max Drawdown */}
      <div className="bg-white border-2 border-[#121212] p-3 shadow-[3px_3px_0px_0px_#121212] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#DC2626]" />
        <div className="flex items-center justify-between text-[#DC2626] text-[10px] font-black uppercase tracking-wider mb-1 mt-0.5">
          <span>Max DD</span>
          <AlertOctagon className="w-3.5 h-3.5 stroke-[2.5] text-[#DC2626]" />
        </div>
        <div className="text-base sm:text-lg font-black font-mono text-[#DC2626] tracking-tight">
          {stats.maxDrawdownPct.toFixed(1)}%
        </div>
        <div className="text-[10px] font-mono text-[#DC2626] font-bold mt-1">
          -${stats.maxDrawdownUsd.toFixed(2)}
        </div>
      </div>
    </div>
  );
};
