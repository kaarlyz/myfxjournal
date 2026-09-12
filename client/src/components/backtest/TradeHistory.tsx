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
      <div className="bg-white border-2 border-[#121212] p-8 text-center text-[#717182] shadow-[4px_4px_0px_0px_#121212]">
        <History className="w-8 h-8 mx-auto mb-2 text-[#717182]" />
        <div className="text-sm font-extrabold text-[#121212] uppercase tracking-wide">No trade history yet</div>
        <div className="text-xs text-[#717182] mt-1 max-w-sm mx-auto font-semibold">
          Open a BUY or SELL position in the Order Panel during replay to test your strategy.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-[#121212] overflow-hidden text-[#121212] shadow-[4px_4px_0px_0px_#121212]">
      <div className="px-4 py-2.5 border-b-2 border-[#121212] flex items-center justify-between bg-[#F0F0F0]">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#121212]" />
          <span className="font-mono text-xs font-black text-[#121212] uppercase tracking-wider">
            Trade History ({trades.length})
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F8FAFC] text-[#717182] border-b-2 border-[#121212] font-mono font-extrabold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Side</th>
              <th className="py-2.5 px-3">Entry Time</th>
              <th className="py-2.5 px-3">Entry</th>
              <th className="py-2.5 px-3">SL</th>
              <th className="py-2.5 px-3">TP</th>
              <th className="py-2.5 px-3">Exit Time</th>
              <th className="py-2.5 px-3">Exit</th>
              <th className="py-2.5 px-3">Exit Reason</th>
              <th className="py-2.5 px-3">Lot</th>
              <th className="py-2.5 px-3 text-right">PnL ($)</th>
              <th className="py-2.5 px-3 text-right">RR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#121212]/15 font-mono text-xs">
            {trades.map((t) => {
              const isLong = t.side === 'LONG';
              const pnl = t.pnl ?? 0;
              const isWin = pnl > 0;
              const isLoss = pnl < 0;

              return (
                <tr key={t.id} className="hover:bg-[#FFFDEB] transition-colors">
                  <td className="py-2 px-3 font-bold text-[#717182]">#{t.tradeNumber}</td>
                  
                  {/* Side */}
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 font-black px-2 py-0.5 text-[10px] uppercase tracking-wider border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] ${
                      isLong
                        ? 'bg-[#E7F9F0] text-[#059669]'
                        : 'bg-[#FDECEC] text-[#DC2626]'
                    }`}>
                      {isLong ? <ArrowUpRight className="w-3 h-3 stroke-[3]" /> : <ArrowDownRight className="w-3 h-3 stroke-[3]" />}
                      {t.side}
                    </span>
                  </td>

                  {/* Entry Time */}
                  <td className="py-2 px-3 text-[#717182] font-medium">
                    {t.entryTime ? format(new Date(t.entryTime), 'yyyy-MM-dd HH:mm') : '-'}
                  </td>

                  {/* Entry Price */}
                  <td className="py-2 px-3 font-bold text-[#121212]">
                    {t.entryPrice.toFixed(2)}
                  </td>

                  {/* SL Price */}
                  <td className="py-2 px-3 font-bold text-[#DC2626]">
                    {t.slPrice.toFixed(2)}
                  </td>

                  {/* TP Price */}
                  <td className="py-2 px-3 font-bold text-[#059669]">
                    {t.tpPrice.toFixed(2)}
                  </td>

                  {/* Exit Time */}
                  <td className="py-2 px-3 text-[#717182] font-medium">
                    {t.exitTime ? format(new Date(t.exitTime), 'yyyy-MM-dd HH:mm') : '-'}
                  </td>

                  {/* Exit Price */}
                  <td className="py-2 px-3 font-bold text-[#121212]">
                    {t.exitPrice !== null ? t.exitPrice.toFixed(2) : '-'}
                  </td>

                  {/* Exit Reason */}
                  <td className="py-2 px-3">
                    {t.exitReason === 'TP' ? (
                      <span className="inline-flex items-center gap-1 text-[#059669] font-black bg-[#E7F9F0] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] px-2 py-0.5 text-[10px] uppercase">
                        <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                        TP
                      </span>
                    ) : t.exitReason === 'SL' ? (
                      <span className="inline-flex items-center gap-1 text-[#DC2626] font-black bg-[#FDECEC] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] px-2 py-0.5 text-[10px] uppercase">
                        <XCircle className="w-3 h-3 stroke-[2.5]" />
                        SL
                      </span>
                    ) : t.exitReason === 'INTRABAR_AMBIGUOUS' ? (
                      <span className="inline-flex items-center gap-1 text-[#B45309] font-black bg-[#FFF7D6] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] px-2 py-0.5 text-[10px] uppercase" title="Both SL and TP touched in same candle">
                        <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
                        Ambiguous
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#1040C0] font-black bg-[#EBF2FF] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] px-2 py-0.5 text-[10px] uppercase">
                        {t.exitReason || 'OPEN'}
                      </span>
                    )}
                  </td>

                  {/* Volume */}
                  <td className="py-2 px-3 font-bold text-[#121212]">
                    {t.volume.toFixed(2)}
                  </td>

                  {/* PnL */}
                  <td className={`py-2 px-3 text-right font-black ${
                    isWin ? 'text-[#059669]' : isLoss ? 'text-[#DC2626]' : 'text-[#717182]'
                  }`}>
                    {t.pnl !== null ? (isWin ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`) : '-'}
                  </td>

                  {/* RR */}
                  <td className="py-2 px-3 text-right font-black text-[#121212]">
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
