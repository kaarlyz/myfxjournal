import React from 'react';
import { formatUsd, formatPercent, formatDate, formatDuration } from '../../utils/formatters';

interface PremiumTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  formatMode?: 'currency' | 'percent' | 'number' | 'auto';
  title?: string;
}

export function PremiumTooltip({ active, payload, label, formatMode = 'auto', title }: PremiumTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const primary = payload[0];
  const ext = primary.payload || {};
  const tradeNo = ext.actualTradeNum ?? ext.tradeNum ?? ext.num ?? ext.tradeIndex;

  const side = ext.side || ext.type;
  const sideUpper = side ? String(side).toUpperCase() : undefined;

  const rawDate = ext.date || ext.entryTime || ext.time || ext.dateKey;
  const formattedDate = rawDate ? formatDate(rawDate) : undefined;

  const tradeTitle = tradeNo !== undefined && tradeNo !== null && tradeNo !== 0 ? `Trade #${tradeNo}` : undefined;
  const headerTitle = title || tradeTitle || (typeof label === 'number' ? `Trade #${label}` : label);

  const details = [
    { label: 'Trade', value: tradeNo !== undefined && tradeNo !== null ? `#${tradeNo}` : undefined },
    { label: 'Date / Time', value: formattedDate },
    { label: 'Symbol', value: ext.symbol },
    { label: 'Side', value: sideUpper, isSide: true },
    { label: 'Trades Count', value: ext.tradeCount },
    { label: 'MFE', value: ext.mfe !== undefined ? formatUsd(ext.mfe) : undefined },
    { label: 'MAE', value: ext.mae !== undefined ? formatUsd(ext.mae) : undefined },
    { label: 'Net PnL', value: ext.pnl !== undefined ? formatUsd(ext.pnl) : undefined },
    { label: 'Running Equity', value: ext.equity !== undefined ? formatUsd(ext.equity) : undefined },
    { label: 'Drawdown', value: ext.drawdown !== undefined ? `${Number(ext.drawdown).toFixed(2)}%` : undefined },
    { label: 'Risk %', value: ext.riskPercent !== undefined ? formatPercent(ext.riskPercent) : undefined },
    { label: 'RR Ratio', value: ext.riskRewardRatio !== undefined ? Number(ext.riskRewardRatio).toFixed(2) : undefined },
    { label: 'Win Rate', value: ext.winRate !== undefined ? formatPercent(ext.winRate) : undefined },
    { label: 'Holding Time', value: ext.holdingTime !== undefined ? formatDuration(ext.holdingTime) : undefined }
  ].filter((row) => row.value !== undefined && row.value !== null);

  return (
    <div className="bg-white border-2 border-[#121212] p-3 shadow-[4px_4px_0px_0px_#121212] min-w-[220px] pointer-events-none z-50">
      {headerTitle && (
        <div className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-2 border-b border-[#121212]/10 pb-1.5 flex items-center justify-between gap-2">
          <span>{headerTitle}</span>
          {sideUpper && (
            <span className={`px-1.5 py-0.5 text-[9px] font-black border border-[#121212] shadow-[1px_1px_0px_0px_#121212] ${
              sideUpper === 'BUY' || sideUpper === 'LONG' ? 'bg-[#E7F9F0] text-[#059669]' : 'bg-[#FDECEC] text-[#DC2626]'
            }`}>
              {sideUpper}
            </span>
          )}
        </div>
      )}
      <div className="space-y-2">
        {payload.map((entry: any, index: number) => {
          let valStr = entry.value;
          if (formatMode === 'currency' || (formatMode === 'auto' && entry.name && (entry.name.toLowerCase().includes('pnl') || entry.name.toLowerCase().includes('equity') || entry.name.toLowerCase().includes('balance')))) {
            valStr = formatUsd(entry.value);
          } else if (formatMode === 'percent' || (formatMode === 'auto' && entry.name && (entry.name.toLowerCase().includes('drawdown') || entry.name.toLowerCase().includes('rate')))) {
            const numVal = Number(entry.value);
            valStr = Number.isFinite(numVal) ? `${numVal.toFixed(2)}%` : `${entry.value}%`;
          } else if (formatMode === 'number') {
            valStr = Number(entry.value).toLocaleString();
          }

          return (
            <div key={index} className="flex justify-between items-center gap-3">
              <span className="text-[11px] font-bold text-[#717182] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 border border-[#121212]" style={{ backgroundColor: entry.color || '#121212' }} />
                {entry.name || 'Value'}
              </span>
              <span className="text-[13px] font-extrabold text-[#121212] font-mono">{valStr}</span>
            </div>
          );
        })}

        {details.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-[#121212]/10 space-y-1 text-[10px] font-bold text-[#717182]">
            {details.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 items-center">
                <span>{row.label}</span>
                {row.isSide ? (
                  <span className={`px-1.5 py-0.2 text-[9px] font-black border border-[#121212] ${
                    row.value === 'BUY' || row.value === 'LONG' ? 'bg-[#E7F9F0] text-[#059669]' : 'bg-[#FDECEC] text-[#DC2626]'
                  }`}>
                    {row.value}
                  </span>
                ) : (
                  <span className="text-[#121212] font-mono">{row.value}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
