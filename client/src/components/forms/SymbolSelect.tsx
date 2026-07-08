import React from 'react';

const baseClass = 'w-full bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] focus:border-[#1040C0] focus:shadow-[4px_4px_0px_0px_#1040C0] outline-none rounded-none p-3 text-[13px] text-[#121212] font-bold transition-all';

export const COMMON_SYMBOLS = ['XAUUSD', 'XAUUSD-ECN', 'GBPUSD', 'EURUSD', 'USDJPY', 'BTCUSD', 'US30', 'NAS100', 'ETHUSD', 'CUSTOM'];

export function SymbolSelect({ value, onChange, customValue, onCustomChange }: {
  value: string;
  onChange: (value: string) => void;
  customValue?: string;
  onCustomChange?: (value: string) => void;
}) {
  const selected = COMMON_SYMBOLS.includes(value) ? value : 'CUSTOM';
  return (
    <div className="space-y-4">
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
