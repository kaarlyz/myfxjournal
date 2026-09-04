import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Target, Award, Percent, BarChart3, AlertOctagon } from 'lucide-react';
import { BacktestStats as IBacktestStats } from '../../../../server/src/services/backtestEngine';

interface BacktestStatsProps {
  stats: IBacktestStats;
}

export const BacktestStats: React.FC<BacktestStatsProps> = ({ stats }) => {
  const isProfitable = stats.netPnl >= 0;
  const pnlPct = stats.initialBalance > 0 ? (stats.netPnl / stats.initialBalance) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Saldo / Equity */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Balance / Equity</span>
          <DollarSign className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <div className="text-base font-bold font-mono text-slate-100">
          ${stats.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
          Eq: ${stats.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* 2. Net PnL */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Net PnL</span>
          {isProfitable ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          )}
        </div>
        <div className={`text-base font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isProfitable ? `+$${stats.netPnl.toFixed(2)}` : `-$${Math.abs(stats.netPnl).toFixed(2)}`}
        </div>
        <div className={`text-[11px] font-mono font-medium ${isProfitable ? 'text-emerald-500' : 'text-rose-500'} mt-0.5`}>
          {isProfitable ? `+${pnlPct.toFixed(2)}%` : `${pnlPct.toFixed(2)}%`}
        </div>
      </div>

      {/* 3. Win Rate */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Win Rate</span>
          <Percent className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="text-base font-bold font-mono text-amber-300">
          {stats.winRate.toFixed(1)}%
        </div>
        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
          {stats.wins}W / {stats.losses}L ({stats.totalTrades} Trade)
        </div>
      </div>

      {/* 4. Profit Factor */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Profit Factor</span>
          <Award className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <div className="text-base font-bold font-mono text-purple-300">
          {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {stats.ambiguous > 0 ? `${stats.ambiguous} Ambiguous` : 'Clean SL/TP'}
        </div>
      </div>

      {/* 5. Average RR */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Avg Realized RR</span>
          <Target className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="text-base font-bold font-mono text-cyan-300">
          1 : {stats.avgRR.toFixed(2)}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Risk/Reward Rata2
        </div>
      </div>

      {/* 6. Max Drawdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow">
        <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
          <span>Max Drawdown</span>
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
        </div>
        <div className="text-base font-bold font-mono text-rose-400">
          {stats.maxDrawdownPct.toFixed(1)}%
        </div>
        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
          -${stats.maxDrawdownUsd.toFixed(2)}
        </div>
      </div>
    </div>
  );
};
