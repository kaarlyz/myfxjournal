import React from 'react';
import { formatDate, formatNumber } from '../utils/formatters';

export default function Mt5DealsTable({ deals }: { deals: any[] }) {
  const rows = (deals || []).slice(0, 250);
  return (
    <div className="bn-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2b3139] flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Deals</h3>
        <span className="text-xs text-[#707a8a]">{deals?.length || 0} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#181a20] text-[#707a8a]">
            <tr>
              {['Time', 'Deal', 'Type', 'Dir', 'Volume', 'Price', 'Order', 'Profit', 'Balance', 'Comment'].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id || d.dealId} className="border-t border-[#2b3139] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-[#929aa5] whitespace-nowrap">{formatDate(d.time)}</td>
                <td className="px-3 py-2 text-white">{d.dealId || '-'}</td>
                <td className="px-3 py-2 text-[#eaecef]">{d.type || '-'}</td>
                <td className="px-3 py-2 text-[#929aa5]">{d.direction || '-'}</td>
                <td className="px-3 py-2 font-number">{formatNumber(d.volume, 2)}</td>
                <td className="px-3 py-2 font-number">{formatNumber(d.price, 2)}</td>
                <td className="px-3 py-2">{d.orderId || '-'}</td>
                <td className="px-3 py-2 font-number font-bold" style={{ color: Number(d.profit || 0) >= 0 ? '#0ecb81' : '#f6465d' }}>
                  {formatNumber(d.profit, 2)}
                </td>
                <td className="px-3 py-2 font-number">{formatNumber(d.balance, 2)}</td>
                <td className="px-3 py-2 text-[#707a8a] max-w-xs truncate">{d.comment || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(deals?.length || 0) > rows.length && (
        <div className="px-4 py-2 text-xs text-[#707a8a] border-t border-[#2b3139]">
          Menampilkan 250 deal pertama.
        </div>
      )}
    </div>
  );
}
