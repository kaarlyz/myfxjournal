import React from 'react';

const baseClass = 'w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold';

export const ACCOUNT_MODES = ['NORMAL', 'CENT', 'IDR', 'PROP', 'DEMO'];

export function AccountTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
      <option value="NORMAL">Normal USD</option>
      <option value="CENT">Cent account</option>
      <option value="IDR">IDR converted</option>
      <option value="PROP">Prop account</option>
      <option value="DEMO">Demo</option>
    </select>
  );
}
