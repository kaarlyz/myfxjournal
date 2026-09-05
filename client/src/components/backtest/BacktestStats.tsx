import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Target, Award, Percent, AlertOctagon } from 'lucide-react';
import { BacktestStats as IBacktestStats } from '../../../../server/src/services/backtestEngine';

interface BacktestStatsProps {
  stats: IBacktestStats;
}

export const BacktestStats: React.FC<BacktestStatsProps> = ({ stats }) => {
  const isProfitable = stats.netPnl >= 0;
  const pnlPct = stats.initialBalance > 0 ? (stats.netPnl / stats.initialBalance) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {/* 1. Balance / Equity */}
      <div className="bg-[#0D1117] border border-slate-800 p-3">
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
          <span>Balance</span>
          <DollarSign className="w-3 h-3 text-blue-500" />
        </div>
        <div className="text-sm font-bold font-mono text-white">
          ${stats.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
          Eq: ${stats.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* 2. Net PnL */}
      <div className="bg-[#0D1117] border border-slate-800 p-3">
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
          <span>Net PnL</span>
          {isProfitable ? (
            <TrendingUp className="w-3 h-3 text-emerald-500" />
          ) : (
            <TrendingDown className="w-3 h-3 text-red-500" />
          )}
        </div>
        <div className={`text-sm font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
          {isProfitable ? `+$${stats.netPnl.toFixed(2)}` : `-$${Math.abs(stats.netPnl).toFixed(2)}`}
        </div>
        <div className={`text-[10px] font-mono ${isProfitable ? 'text-emerald-500' : 'text-red-500'} mt-0.5`}>
          {isProfitable ? `+${pnlPct.toFixed(2)}%` : `${pnlPct.toFixed(2)}%`}
        </div>
      </div>

      {/* 3. Win Rate */}
      <div className="bg-[#0D1117] border border-slate-800 p-3">
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
          <span>Win Rate</span>
          <Percent className="w-3 h-3 text-amber-400" />
        </div>
        <div className="text-sm font-bold font-mono text-amber-300">
          {stats.winRate.toFixed(1)}%
        </div>
        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
          {stats.wins}W / {stats.losses}L · {stats.totalTrades} trade
        </div>
      </div>

      {/* 4. Profit Factor */}
      <div className="bg-[#0D1117] border border-slate-800 p-3">
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
          <span>Prof. Factor</span>
          <Award className="w-3 h-3 text-blue-400" />
        </div>
        <div className="text-sm font-bold font-mono text-white">
          {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {stats.ambiguous > 0 ? `${stats.ambiguous} ambiguous` : 'clean exits'}
        </div>
      </div>

      {/* 5. Average RR */}
      <div className="bg-[#0D1117] border border-slate-800 p-3">
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
          <span>Avg RR</span>
          <Target className="w-3 h-3 text-emerald-500" />
        </div>
        <div className="text-sm font-bold font-mono text-white">
          1 : {stats.avgRR.toFixed(2)}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          realized avg
        </div>
      </div>

      {/* 6. Max Drawdown */}
      <div className="bg-[#0D1117] border border-slate-800 p-3">
        <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
          <span>Max DD</span>
          <AlertOctagon className="w-3 h-3 text-red-500" />
        </div>
        <div className="text-sm font-bold font-mono text-red-400">
          {stats.maxDrawdownPct.toFixed(1)}%
        </div>
        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
          -${stats.maxDrawdownUsd.toFixed(2)}
        </div>
      </div>
    </div>
  );
};
