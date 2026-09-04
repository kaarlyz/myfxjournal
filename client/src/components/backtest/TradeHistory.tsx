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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 shadow">
        <History className="w-8 h-8 mx-auto mb-2 text-slate-600" />
        <div className="text-sm font-medium text-slate-400">Belum Ada Riwayat Trade Manual</div>
        <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Buka posisi LONG atau SHORT pada Order Panel ketika replay berjalan untuk menguji strategi manual Anda.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          <span className="font-bold text-xs text-slate-200 uppercase tracking-wide">
            Riwayat Trade Backtest ({trades.length})
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Side</th>
              <th className="py-2.5 px-3">Waktu Entry</th>
              <th className="py-2.5 px-3">Entry</th>
              <th className="py-2.5 px-3">SL</th>
              <th className="py-2.5 px-3">TP</th>
              <th className="py-2.5 px-3">Waktu Exit</th>
              <th className="py-2.5 px-3">Exit</th>
              <th className="py-2.5 px-3">Alasan Exit</th>
              <th className="py-2.5 px-3">Lot</th>
              <th className="py-2.5 px-3 text-right">PnL ($)</th>
              <th className="py-2.5 px-3 text-right">RR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {trades.map((t) => {
              const isLong = t.side === 'LONG';
              const pnl = t.pnl ?? 0;
              const isWin = pnl > 0;
              const isLoss = pnl < 0;

              return (
                <tr key={t.id} className="hover:bg-slate-850 transition-colors">
                  <td className="py-2.5 px-3 text-slate-500">#{t.tradeNumber}</td>
                  
                  {/* Side */}
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${
                      isLong
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {t.side}
                    </span>
                  </td>

                  {/* Entry Time */}
                  <td className="py-2.5 px-3 text-slate-300">
                    {t.entryTime ? format(new Date(t.entryTime), 'yyyy-MM-dd HH:mm') : '-'}
                  </td>

                  {/* Entry Price */}
                  <td className="py-2.5 px-3 font-semibold text-cyan-300">
                    {t.entryPrice.toFixed(2)}
                  </td>

                  {/* SL Price */}
                  <td className="py-2.5 px-3 text-rose-400">
                    {t.slPrice.toFixed(2)}
                  </td>

                  {/* TP Price */}
                  <td className="py-2.5 px-3 text-emerald-400">
                    {t.tpPrice.toFixed(2)}
                  </td>

                  {/* Exit Time */}
                  <td className="py-2.5 px-3 text-slate-400">
                    {t.exitTime ? format(new Date(t.exitTime), 'yyyy-MM-dd HH:mm') : '-'}
                  </td>

                  {/* Exit Price */}
                  <td className="py-2.5 px-3 text-slate-200">
                    {t.exitPrice !== null ? t.exitPrice.toFixed(2) : '-'}
                  </td>

                  {/* Exit Reason */}
                  <td className="py-2.5 px-3">
                    {t.exitReason === 'TP' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40 text-[11px]">
                        <CheckCircle2 className="w-3 h-3" />
                        TP Hit
                      </span>
                    ) : t.exitReason === 'SL' ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-bold bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40 text-[11px]">
                        <XCircle className="w-3 h-3" />
                        SL Hit
                      </span>
                    ) : t.exitReason === 'INTRABAR_AMBIGUOUS' ? (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-bold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 text-[11px]" title="Both SL and TP touched in same candle">
                        <AlertTriangle className="w-3 h-3" />
                        Ambiguous
                      </span>
                    ) : (
                      <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                        {t.exitReason || 'OPEN'}
                      </span>
                    )}
                  </td>

                  {/* Volume */}
                  <td className="py-2.5 px-3 text-slate-300">
                    {t.volume.toFixed(2)}
                  </td>

                  {/* PnL */}
                  <td className={`py-2.5 px-3 text-right font-bold ${
                    isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {t.pnl !== null ? (isWin ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`) : '-'}
                  </td>

                  {/* RR */}
                  <td className="py-2.5 px-3 text-right font-bold text-slate-200">
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
