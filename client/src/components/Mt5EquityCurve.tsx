import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, ReferenceDot } from 'recharts';
import { Maximize2, X } from 'lucide-react';

const tick = (value: string) => String(value).slice(5, 10);

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
  if (!data.length) return <div className="chart-container h-72 flex items-center justify-center text-sm text-[#707a8a]">Tester graph belum diimport.</div>;

  const curveChart = (heightClass = 'h-80') => (
    <div className={`chart-container ${heightClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-white">Balance & Equity Curve</h3>
        <div className="flex items-center gap-2" data-export-hide>
          {(['BALANCE', 'EQUITY', 'BOTH'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setCurveMode(mode)}
              className={`px-2 py-1 rounded text-[10px] font-bold ${curveMode === mode ? 'bg-[#fcd535] text-[#181a20]' : 'bg-[#2b3139] text-[#929aa5]'}`}
            >
              {mode === 'BOTH' ? 'Both' : mode[0] + mode.slice(1).toLowerCase()}
            </button>
          ))}
          <button onClick={() => setExpanded(true)} className="p-1.5 rounded bg-[#2b3139] text-[#eaecef] hover:text-[#fcd535]" title="Expand chart">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="88%">
        <LineChart data={data}>
          <CartesianGrid stroke="#2b3139" />
          <XAxis dataKey="date" tickFormatter={tick} stroke="#707a8a" fontSize={11} />
          <YAxis stroke="#707a8a" fontSize={11} />
          <Tooltip contentStyle={{ background: '#1e2329', border: '1px solid #2b3139', color: '#eaecef' }} />
          {(curveMode === 'BALANCE' || curveMode === 'BOTH') && <Line type="monotone" dataKey="balance" stroke="#fcd535" dot={false} strokeWidth={2} />}
          {(curveMode === 'EQUITY' || curveMode === 'BOTH') && <Line type="monotone" dataKey="equity" stroke="#0ecb81" dot={false} strokeWidth={2} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  const drawdownChart = (heightClass = 'h-80') => (
    <div className={`chart-container ${heightClass}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-white">Drawdown & Deposit Load</h3>
          {worstDrawdown && (
            <p className="text-[10px] text-[#f6465d] mt-1">
              Worst DD {Number(worstDrawdown.drawdown).toFixed(2)} on {String(worstDrawdown.time || worstDrawdown.date).slice(0, 16)}
            </p>
          )}
        </div>
        <span className="text-[10px] text-[#707a8a]">Deposit load included</span>
      </div>
      <ResponsiveContainer width="100%" height="86%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#2b3139" />
          <XAxis dataKey="date" tickFormatter={tick} stroke="#707a8a" fontSize={11} />
          <YAxis stroke="#707a8a" fontSize={11} />
          <Tooltip contentStyle={{ background: '#1e2329', border: '1px solid #2b3139', color: '#eaecef' }} />
          <Area type="monotone" dataKey="drawdown" stroke="#f6465d" fill="rgba(246,70,93,0.16)" />
          <Area type="monotone" dataKey="depositLoad" stroke="#f0b90b" fill="rgba(240,185,11,0.16)" />
          {worstDrawdown && <ReferenceDot x={worstDrawdown.date} y={worstDrawdown.drawdown} r={5} fill="#f6465d" stroke="#fff" />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {curveChart()}
      {drawdownChart()}
      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/75 p-4 md:p-8" data-export-hide>
          <div className="h-full rounded-xl border border-[#2b3139] bg-[#0b0e11] p-4 md:p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Expanded Tester Graph</h2>
                <p className="text-xs text-[#707a8a]">Balance, equity, drawdown, and deposit load from tester graph CSV.</p>
              </div>
              <button onClick={() => setExpanded(false)} className="p-2 rounded-lg bg-[#2b3139] text-[#eaecef] hover:text-[#fcd535]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {curveChart('h-[520px]')}
              {drawdownChart('h-[420px]')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Mt5DailyPnlChart({ daily }: { daily: any[] }) {
  const data = (daily || []).map((d) => ({ date: d.date, pnl: Number(d.dailyNetChange || 0) }));
  if (!data.length) return null;
  return (
    <div className="chart-container h-72">
      <h3 className="text-sm font-bold text-white mb-3">Daily PnL / Balance Change</h3>
      <ResponsiveContainer width="100%" height="88%">
        <BarChart data={data}>
          <CartesianGrid stroke="#2b3139" />
          <XAxis dataKey="date" tickFormatter={tick} stroke="#707a8a" fontSize={11} />
          <YAxis stroke="#707a8a" fontSize={11} />
          <Tooltip contentStyle={{ background: '#1e2329', border: '1px solid #2b3139', color: '#eaecef' }} />
          <Bar dataKey="pnl" fill="#fcd535" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
