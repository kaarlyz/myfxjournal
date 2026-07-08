import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, ReferenceDot, Cell } from 'recharts';
import { Maximize2, X } from 'lucide-react';
import { SectionLabel } from './ui/SectionLabel';
import { Button } from './ui/Button';

const tick = (value: string) => String(value).slice(5, 10);

import { EmptyState } from './ui/EmptyState';
import { PremiumTooltip } from './ui/PremiumTooltip';
import { formatCompactUsd, downsampleData } from '../utils/chartUtils';
import { Activity } from 'lucide-react';
import { motion } from 'framer-motion';

// Old tooltips removed.

export function Mt5EquityCurve({ points }: { points: any[] }) {
  const [curveMode, setCurveMode] = useState<'BALANCE' | 'EQUITY' | 'BOTH'>('BOTH');
  const [expanded, setExpanded] = useState(false);
  const data = useMemo(() => (points || []).map((p) => ({
    date: String(p.time).slice(0, 10),
    time: p.time,
    balance: Number(p.balance || 0),
    equity: Number(p.equity || 0),
    depositLoad: Number(p.depositLoad || 0),
  })).map((point, index, rows) => {
    const peak = Math.max(...rows.slice(0, index + 1).map((row) => row.equity));
    return {
      ...point,
      drawdown: peak > 0 ? point.equity - peak : 0,
    };
  }), [points]);
  const worstDrawdown = data.reduce<any | null>((worst, row) => !worst || row.drawdown < worst.drawdown ? row : worst, null);
  
  const sampledData = useMemo(() => downsampleData(data, 1000), [data]);

  if (!data.length) return (
    <EmptyState 
      icon={Activity} 
      title="No Graph Data" 
      description="Tester graph hasn't been imported yet." 
    />
  );

  const curveChart = (heightClass = 'h-80') => (
    <div className={`bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative ${heightClass}`}>
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#1040C0]" />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6 mt-1">
        <SectionLabel label="Balance & Equity Curve" shape="circle" color="blue" />
        <div className="flex items-center gap-2" data-export-hide>
          {(['BALANCE', 'EQUITY', 'BOTH'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setCurveMode(mode)}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest border-2 border-[#121212] transition-colors shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${curveMode === mode ? 'bg-[#121212] text-white' : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'}`}
            >
              {mode}
            </button>
          ))}
          <button onClick={() => setExpanded(true)} className="p-1 border-2 border-[#121212] bg-white hover:bg-[#F0F0F0] transition-colors shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ml-2" title="Expand chart">
            <Maximize2 className="w-4 h-4 text-[#121212]" strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="75%">
        <LineChart data={sampledData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(18,18,18,0.1)" vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="date" tickFormatter={tick} stroke="#717182" fontSize={11} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis stroke="#717182" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => formatCompactUsd(val)} />
          <Tooltip content={<PremiumTooltip formatMode="currency" />} cursor={{ stroke: 'rgba(18,18,18,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
          {(curveMode === 'BALANCE' || curveMode === 'BOTH') && <Line type="monotone" dataKey="balance" stroke="#1040C0" dot={false} strokeWidth={3} />}
          {(curveMode === 'EQUITY' || curveMode === 'BOTH') && <Line type="monotone" dataKey="equity" stroke="var(--profit)" dot={false} strokeWidth={3} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const drawdownChart = (heightClass = 'h-80') => (
    <div className={`bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative ${heightClass}`}>
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--loss)]" />
      <div className="flex items-start justify-between gap-3 mb-6 mt-1">
        <div>
          <SectionLabel label="Drawdown & Deposit Load" shape="diamond" color="red" />
          {worstDrawdown && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--loss)] mt-3 bg-[var(--loss-dim)] px-2 py-1 inline-block border-2 border-[var(--loss)]">
              Worst DD {Number(worstDrawdown.drawdown).toFixed(2)} on {String(worstDrawdown.time || worstDrawdown.date).slice(0, 16)}
            </p>
          )}
        </div>
        <span className="text-[10px] font-bold text-[#121212] uppercase tracking-widest bg-[#F0F0F0] px-2 py-1 border-2 border-[#121212] mt-1 shadow-[2px_2px_0px_0px_#121212]">Load included</span>
      </div>
      <ResponsiveContainer width="100%" height={worstDrawdown ? '60%' : '75%'}>
        <AreaChart data={sampledData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(18,18,18,0.1)" vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="date" tickFormatter={tick} stroke="#717182" fontSize={11} tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis stroke="#717182" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => formatCompactUsd(val)} />
          <Tooltip content={<PremiumTooltip formatMode="currency" />} cursor={{ stroke: 'rgba(18,18,18,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="drawdown" stroke="var(--loss)" strokeWidth={2} fill="var(--loss-dim)" />
          <Area type="monotone" dataKey="depositLoad" stroke="var(--warning)" strokeWidth={2} fill="var(--warning-dim)" />
          {worstDrawdown && <ReferenceDot x={worstDrawdown.date} y={worstDrawdown.drawdown} r={6} fill="var(--loss)" stroke="#fff" strokeWidth={2} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {curveChart()}
      {drawdownChart()}
      {expanded && (
        <div className="fixed inset-0 z-50 bg-[#121212]/80 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center animate-fade-in" data-export-hide>
          <div className="w-full max-w-6xl h-full max-h-[90vh] bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[16px_16px_0px_0px_#121212] flex flex-col relative">
            <div className="absolute top-0 left-0 right-0 h-2 bg-[#1040C0]" />
            <div className="flex items-center justify-between mb-6 shrink-0 mt-2">
              <div>
                <h2 className="text-2xl font-extrabold text-[#121212] font-display uppercase tracking-wide">Expanded Tester Graph</h2>
                <p className="text-[13px] font-bold text-[#717182] mt-1">Balance, equity, drawdown, and deposit load from tester graph CSV.</p>
              </div>
              <button onClick={() => setExpanded(false)} className="p-2 border-2 border-[#121212] bg-white hover:bg-[#E0E0E0] transition-colors shadow-[4px_4px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                <X className="w-6 h-6 text-[#121212]" strokeWidth={2.5} />
              </button>
            </div>
            <div className="space-y-6 overflow-y-auto flex-1 pr-2 pb-6">
              {curveChart('h-[400px] md:h-[520px] shrink-0')}
              {drawdownChart('h-[350px] md:h-[420px] shrink-0')}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function Mt5DailyPnlChart({ daily }: { daily: any[] }) {
  const data = (daily || []).map((d) => ({ date: d.date, pnl: Number(d.dailyNetChange || 0) }));
  if (!data.length) return null;
  return (
    <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] h-72 relative">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#121212]" />
      <SectionLabel label="Daily PnL / Balance Change" shape="square" color="dark" className="mt-1 mb-6" />
      <ResponsiveContainer width="100%" height="75%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(18,18,18,0.1)" vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="date" tickFormatter={tick} stroke="#717182" fontSize={11} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis stroke="#717182" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => formatCompactUsd(val)} />
          <Tooltip content={<PremiumTooltip formatMode="currency" />} cursor={{ fill: 'rgba(18,18,18,0.05)' }} />
          <Bar dataKey="pnl">
            {
              data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? 'var(--profit)' : 'var(--loss)'} />
              ))
            }
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
