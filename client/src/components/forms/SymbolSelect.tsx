import React from 'react';

const baseClass = 'w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold';

export const COMMON_SYMBOLS = ['XAUUSD', 'XAUUSD-ECN', 'GBPUSD', 'EURUSD', 'USDJPY', 'BTCUSD', 'US30', 'NAS100', 'ETHUSD', 'CUSTOM'];

export function SymbolSelect({ value, onChange, customValue, onCustomChange }: {
  value: string;
  onChange: (value: string) => void;
  customValue?: string;
  onCustomChange?: (value: string) => void;
}) {
  const selected = COMMON_SYMBOLS.includes(value) ? value : 'CUSTOM';
  return (
    <div className="space-y-2">
      <select value={selected} onChange={(e) => onChange(e.target.value)} className={baseClass}>
        {COMMON_SYMBOLS.map((symbol) => (
          <option key={symbol} value={symbol}>{symbol === 'CUSTOM' ? 'Other / Custom symbol' : symbol}</option>
        ))}
      </select>
      {selected === 'CUSTOM' && (
        <input
          value={customValue ?? (COMMON_SYMBOLS.includes(value) ? '' : value)}
          onChange={(e) => onCustomChange ? onCustomChange(e.target.value) : onChange(e.target.value)}
          placeholder="Ketik symbol custom, contoh: GER40"
          className={baseClass}
        />
      )}
    </div>
  );
}
