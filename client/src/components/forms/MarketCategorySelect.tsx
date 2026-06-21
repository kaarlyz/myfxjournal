import React from 'react';

const baseClass = 'w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold';

export const MARKET_CATEGORIES = ['Forex', 'Metal', 'Crypto', 'Index', 'Stock', 'Commodity', 'Synthetic', 'Other'];

export function MarketCategorySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
      <option value="">Pilih Market</option>
      {MARKET_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
    </select>
  );
}
