import React from 'react';

const baseClass = 'w-full bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] focus:border-[#1040C0] focus:shadow-[4px_4px_0px_0px_#1040C0] outline-none rounded-none p-3 text-[13px] text-[#121212] font-bold transition-all';

export const MARKET_CATEGORIES = ['Forex', 'Metal', 'Crypto', 'Index', 'Stock', 'Commodity', 'Synthetic', 'Other'];

export function MarketCategorySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
      <option value="">Pilih Market</option>
      {MARKET_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
    </select>
  );
}
