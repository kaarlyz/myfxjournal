import React from 'react';

const baseClass = 'w-full bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] focus:border-[#1040C0] focus:shadow-[4px_4px_0px_0px_#1040C0] outline-none rounded-none p-3 text-[13px] text-[#121212] font-bold transition-all';

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export function TimeframeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
      <option value="">Pilih timeframe</option>
      {TIMEFRAMES.map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
    </select>
  );
}
