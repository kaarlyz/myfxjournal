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
  const details = [
    { label: 'Trade', value: ext.actualTradeNum || ext.tradeNum || ext.num },
    { label: 'Date', value: ext.date || ext.entryTime || ext.time ? formatDate(ext.date || ext.entryTime || ext.time) : undefined },
    { label: 'Symbol', value: ext.symbol },
    { label: 'Side', value: ext.side },
    { label: 'Trades', value: ext.tradeCount },
    { label: 'MFE', value: ext.mfe !== undefined ? formatUsd(ext.mfe) : undefined },
    { label: 'MAE', value: ext.mae !== undefined ? formatUsd(ext.mae) : undefined },
    { label: 'PnL', value: ext.pnl !== undefined ? formatUsd(ext.pnl) : undefined },
    { label: 'Running Equity', value: ext.equity !== undefined ? formatUsd(ext.equity) : undefined },
    { label: 'Drawdown', value: ext.drawdown !== undefined ? formatPercent(ext.drawdown) : undefined },
    { label: 'Risk %', value: ext.riskPercent !== undefined ? formatPercent(ext.riskPercent) : undefined },
    { label: 'RR', value: ext.riskRewardRatio !== undefined ? Number(ext.riskRewardRatio).toFixed(2) : undefined },
    { label: 'Win Rate', value: ext.winRate !== undefined ? `${formatPercent(ext.winRate)}` : undefined },
    { label: 'Holding Time', value: ext.holdingTime !== undefined ? formatDuration(ext.holdingTime) : undefined }
  ].filter((row) => row.value !== undefined && row.value !== null);

  return (
    <div className="bg-white border-2 border-[#121212] p-3 shadow-[4px_4px_0px_0px_#121212] min-w-[220px] pointer-events-none">
      {(label || title) && (
        <div className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-2 border-b border-[#121212]/10 pb-2">
          {title || label}
        </div>
      )}
      <div className="space-y-2">
        {payload.map((entry: any, index: number) => {
          let valStr = entry.value;
          if (formatMode === 'currency' || (formatMode === 'auto' && entry.name && entry.name.toLowerCase().includes('pnl'))) {
            valStr = formatUsd(entry.value);
          } else if (formatMode === 'percent' || (formatMode === 'auto' && entry.name && entry.name.toLowerCase().includes('rate'))) {
            valStr = formatPercent(entry.value);
          } else if (formatMode === 'number') {
            valStr = Number(entry.value).toLocaleString();
          }

          return (
            <div key={index} className="flex justify-between items-center gap-3">
              <span className="text-[11px] font-bold text-[#717182] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || '#121212' }} />
                {entry.name || 'Value'}
              </span>
              <span className="text-[13px] font-extrabold text-[#121212]">{valStr}</span>
            </div>
          );
        })}

        {details.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#121212]/10 space-y-1 text-[10px] font-bold text-[#717182]">
            {details.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <span>{row.label}</span>
                <span className={row.label === 'Side' ? (row.value === 'LONG' ? 'text-[var(--profit)]' : row.value === 'SHORT' ? 'text-[var(--loss)]' : 'text-[#121212]') : 'text-[#121212]'}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
