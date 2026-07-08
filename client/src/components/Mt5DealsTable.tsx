import React from 'react';
import { formatDate, formatNumber } from '../utils/formatters';
import { SectionLabel } from './ui/SectionLabel';

export default function Mt5DealsTable({ deals }: { deals: any[] }) {
  const rows = (deals || []).slice(0, 250);
  return (
    <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] mt-6 mb-6 overflow-hidden relative pt-12">
      <div className="absolute top-0 left-0 right-0 h-[4px] bg-[#121212]" />
      <SectionLabel label="MT5 Raw Deals" shape="circle" color="dark" className="absolute top-4 left-4" />
      <div className="absolute top-4 right-4 bg-[#F0F0F0] border-2 border-[#121212] px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
        {deals?.length || 0} rows
      </div>
      
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {['Time', 'Deal', 'Type', 'Dir', 'Volume', 'Price', 'Order', 'Profit', 'Balance', 'Comment'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id || d.dealId} className="hover:bg-[#F0F0F0] transition-colors">
                <td className="text-[11px] font-bold text-[#717182] uppercase tracking-wider whitespace-nowrap">{formatDate(d.time)}</td>
                <td className="font-extrabold text-[#121212] font-display text-[13px]">{d.dealId || '-'}</td>
                <td className="text-[12px] font-bold text-[#121212] uppercase tracking-wider">{d.type || '-'}</td>
                <td className="text-[11px] font-bold text-[#717182] uppercase tracking-wider">{d.direction || '-'}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(d.volume, 2)}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(d.price, 2)}</td>
                <td className="font-bold text-[#121212]">{d.orderId || '-'}</td>
                <td className={`font-extrabold font-number text-[13px] ${Number(d.profit || 0) >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                  {formatNumber(d.profit, 2)}
                </td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(d.balance, 2)}</td>
                <td className="text-[12px] text-[#717182] font-semibold max-w-xs truncate">{d.comment || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-[11px] font-bold text-[#717182] uppercase tracking-widest bg-[#F0F0F0] py-8">
                  No deals found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(deals?.length || 0) > rows.length && (
        <div className="px-4 py-3 bg-white border-t-2 border-[#121212] text-[11px] font-bold text-[#717182] uppercase tracking-wider text-center">
          Menampilkan 250 deal pertama.
        </div>
      )}
    </div>
  );
}
