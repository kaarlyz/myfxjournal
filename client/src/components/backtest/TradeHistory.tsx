import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, AlertTriangle, ArrowUpRight, ArrowDownRight, History } from 'lucide-react';
import { BacktestTradeRecord } from '../../../../server/src/services/backtestEngine';

interface TradeHistoryProps {
  trades: BacktestTradeRecord[];
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({ trades }) => {
  if (!trades || trades.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 shadow-sm">
        <History className="w-8 h-8 mx-auto mb-2 text-slate-400" />
        <div className="text-sm font-semibold text-slate-700">No trade history yet</div>
        <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Open a BUY or SELL position in the Order Panel during replay to test your strategy.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 overflow-hidden text-slate-800 rounded-xl shadow-sm">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <span className="font-mono text-xs text-slate-700 uppercase tracking-wider">
            Trade History ({trades.length})
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-mono font-semibold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Side</th>
              <th className="py-2 px-3">Entry Time</th>
              <th className="py-2 px-3">Entry</th>
              <th className="py-2 px-3">SL</th>
              <th className="py-2 px-3">TP</th>
              <th className="py-2 px-3">Exit Time</th>
              <th className="py-2 px-3">Exit</th>
              <th className="py-2 px-3">Exit Reason</th>
              <th className="py-2 px-3">Lot</th>
              <th className="py-2 px-3 text-right">PnL ($)</th>
              <th className="py-2 px-3 text-right">RR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono text-xs">
            {trades.map((t) => {
              const isLong = t.side === 'LONG';
              const pnl = t.pnl ?? 0;
              const isWin = pnl > 0;
              const isLoss = pnl < 0;

              return (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2 px-3 text-slate-500">#{t.tradeNumber}</td>
                  
                  {/* Side */}
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-sm ${
                      isLong
                        ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
                        : 'bg-red-900/50 text-red-400 border border-red-800'
                    }`}>
                      {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {t.side}
                    </span>
                  </td>

                  {/* Entry Time */}
                  <td className="py-2 px-3 text-slate-400">
                    {t.entryTime ? format(new Date(t.entryTime), 'yyyy-MM-dd HH:mm') : '-'}
                  </td>

                  {/* Entry Price */}
                  <td className="py-2 px-3 font-semibold text-amber-600">
                    {t.entryPrice.toFixed(2)}
                  </td>

                  {/* SL Price */}
                  <td className="py-2 px-3 text-red-400">
                    {t.slPrice.toFixed(2)}
                  </td>

                  {/* TP Price */}
                  <td className="py-2 px-3 text-emerald-400">
                    {t.tpPrice.toFixed(2)}
                  </td>

                  {/* Exit Time */}
                  <td className="py-2 px-3 text-slate-500">
                    {t.exitTime ? format(new Date(t.exitTime), 'yyyy-MM-dd HH:mm') : '-'}
                  </td>

                  {/* Exit Price */}
                  <td className="py-2 px-3 text-slate-700">
                    {t.exitPrice !== null ? t.exitPrice.toFixed(2) : '-'}
                  </td>

                  {/* Exit Reason */}
                  <td className="py-2 px-3">
                    {t.exitReason === 'TP' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-900/40 border border-emerald-800 px-2 py-0.5 text-[10px] uppercase rounded-sm">
                        <CheckCircle2 className="w-3 h-3" />
                        TP
                      </span>
                    ) : t.exitReason === 'SL' ? (
                      <span className="inline-flex items-center gap-1 text-red-400 font-semibold bg-red-900/40 border border-red-800 px-2 py-0.5 text-[10px] uppercase rounded-sm">
                        <XCircle className="w-3 h-3" />
                        SL
                      </span>
                    ) : t.exitReason === 'INTRABAR_AMBIGUOUS' ? (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-semibold bg-amber-900/40 border border-amber-800 px-2 py-0.5 text-[10px] uppercase rounded-sm" title="Both SL and TP touched in same candle">
                        <AlertTriangle className="w-3 h-3" />
                        Ambiguous
                      </span>
                    ) : (
                      <span className="text-slate-500 bg-slate-800/40 border border-slate-700 px-2 py-0.5 text-[10px] uppercase rounded-sm">
                        {t.exitReason || 'OPEN'}
                      </span>
                    )}
                  </td>

                  {/* Volume */}
                  <td className="py-2 px-3 text-slate-500">
                    {t.volume.toFixed(2)}
                  </td>

                  {/* PnL */}
                  <td className={`py-2 px-3 text-right font-bold ${
                    isWin ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {t.pnl !== null ? (isWin ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`) : '-'}
                  </td>

                  {/* RR */}
                  <td className="py-2 px-3 text-right font-semibold text-slate-300">
                    {t.rr !== null ? `${t.rr.toFixed(2)}R` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
