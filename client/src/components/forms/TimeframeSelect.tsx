import React from 'react';

const baseClass = 'w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold';

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export function TimeframeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
      <option value="">Pilih timeframe</option>
      {TIMEFRAMES.map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
    </select>
  );
}
