import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Trade, BacktestSession } from '../shared/types';
import { formatUsd, formatPercent, formatR } from '../utils/formatters';

interface ChartsProps {
  session: BacktestSession;
  trades: Trade[];
}

export default function DashboardCharts({ session, trades }: ChartsProps) {
  const [activeChartTab, setActiveChartTab] = useState<'equity' | 'pnl' | 'time' | 'excursion'>('equity');

  const closedTrades = trades
    .filter((t) => t.status === 'CLOSED')
    .sort((a, b) => {
      const aTime = a.exitTime ? new Date(a.exitTime).getTime() : 0;
      const bTime = b.exitTime ? new Date(b.exitTime).getTime() : 0;
      return aTime - bTime;
    });

  if (closedTrades.length === 0) {
    return (
      <div className="glass-card rounded-xl p-8 text-center text-gray-500 border border-gray-800">
        Belum ada data trade yang ditutup untuk membuat visualisasi chart.
      </div>
    );
  }

  // 1. EQUITY & DRAWDOWN DATA
  let runningEquity = session.initialBalance;
  let runningR = 0;
  let peak = session.initialBalance;

  const equityData = [
    {
      tradeNum: 0,
      equity: session.initialBalance,
      drawdown: 0,
      rCumulative: 0,
      pnl: 0,
    },
  ];

  closedTrades.forEach((t, i) => {
    const pnl = t.netPnlUsd || 0;
    const rMult = t.rMultiple || 0;
    runningEquity += pnl;
    runningR += rMult;

    if (runningEquity > peak) {
      peak = runningEquity;
    }

    const ddUsd = peak - runningEquity;
    const ddPct = peak > 0 ? (ddUsd / peak) * 100 : 0;

    equityData.push({
      tradeNum: i + 1,
      equity: runningEquity,
      drawdown: -ddPct, // negative for downward chart
      rCumulative: runningR,
      pnl: pnl,
    });
  });

  // 2. SETUP TAG PERFORMANCE
  const setupPerformance: Record<string, { totalPnl: number; count: number; wins: number }> = {};
  closedTrades.forEach((t) => {
    const tag = t.setupTag || 'Tanpa Tag';
    const pnl = t.netPnlUsd || 0;
    if (!setupPerformance[tag]) {
      setupPerformance[tag] = { totalPnl: 0, count: 0, wins: 0 };
    }
    setupPerformance[tag].totalPnl += pnl;
    setupPerformance[tag].count++;
    if (pnl > 0) setupPerformance[tag].wins++;
  });

  const setupChartData = Object.entries(setupPerformance).map(([tag, stats]) => ({
    name: tag,
    PnL: stats.totalPnl,
    Winrate: (stats.wins / stats.count) * 100,
    Trades: stats.count,
  }));

  // 3. PIE CHART DATA (WIN / LOSS / BE)
  const winCount = closedTrades.filter((t) => (t.netPnlUsd || 0) > 0).length;
  const lossCount = closedTrades.filter((t) => (t.netPnlUsd || 0) < 0).length;
  const beCount = closedTrades.filter((t) => (t.netPnlUsd || 0) === 0).length;

  const pieData = [
    { name: 'Win', value: winCount, color: '#10b981' },
    { name: 'Loss', value: lossCount, color: '#ef4444' },
    { name: 'Break Even', value: beCount, color: '#6b7280' },
  ].filter((p) => p.value > 0);

  // 4. DAY OF WEEK PERFORMANCE
  const daysName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayPerformance: Record<string, { totalPnl: number; count: number; wins: number }> = {};
  
  closedTrades.forEach((t) => {
    if (!t.entryTime) return;
    const dayIndex = new Date(t.entryTime).getDay();
    const dayName = daysName[dayIndex];
    const pnl = t.netPnlUsd || 0;

    if (!dayPerformance[dayName]) {
      dayPerformance[dayName] = { totalPnl: 0, count: 0, wins: 0 };
    }
    dayPerformance[dayName].totalPnl += pnl;
    dayPerformance[dayName].count++;
    if (pnl > 0) dayPerformance[dayName].wins++;
  });

  const dayChartData = daysName
    .filter((d) => dayPerformance[d])
    .map((d) => ({
      name: d,
      PnL: dayPerformance[d].totalPnl,
      Winrate: (dayPerformance[d].wins / dayPerformance[d].count) * 100,
      Trades: dayPerformance[d].count,
    }));

  // 5. HOUR OF ENTRY PERFORMANCE
  const hourPerformance: Record<number, { totalPnl: number; count: number; wins: number }> = {};
  closedTrades.forEach((t) => {
    if (!t.entryTime) return;
    const hour = new Date(t.entryTime).getHours();
    const pnl = t.netPnlUsd || 0;

    if (!hourPerformance[hour]) {
      hourPerformance[hour] = { totalPnl: 0, count: 0, wins: 0 };
    }
    hourPerformance[hour].totalPnl += pnl;
    hourPerformance[hour].count++;
    if (pnl > 0) hourPerformance[hour].wins++;
  });

  const hourChartData = Array.from({ length: 24 })
    .map((_, i) => {
      const stats = hourPerformance[i] || { totalPnl: 0, count: 0, wins: 0 };
      return {
        hour: `${String(i).padStart(2, '0')}:00`,
        PnL: stats.totalPnl,
        Trades: stats.count,
      };
    })
    .filter((h) => h.Trades > 0);

  // 6. LONG VS SHORT PERFORMANCE
  const longTrades = closedTrades.filter((t) => t.side === 'LONG');
  const shortTrades = closedTrades.filter((t) => t.side === 'SHORT');
  
  const sideChartData = [
    {
      name: 'LONG (Beli)',
      Winrate: longTrades.length > 0 ? (longTrades.filter((t) => (t.netPnlUsd || 0) > 0).length / longTrades.length) * 100 : 0,
      Trades: longTrades.length,
      PnL: longTrades.reduce((acc, t) => acc + (t.netPnlUsd || 0), 0),
    },
    {
      name: 'SHORT (Jual)',
      Winrate: shortTrades.length > 0 ? (shortTrades.filter((t) => (t.netPnlUsd || 0) > 0).length / shortTrades.length) * 100 : 0,
      Trades: shortTrades.length,
      PnL: shortTrades.reduce((acc, t) => acc + (t.netPnlUsd || 0), 0),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Chart Tabs Navigation */}
      <div className="flex border-b border-gray-800 space-x-2">
        <button
          onClick={() => setActiveChartTab('equity')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeChartTab === 'equity'
              ? 'border-accentCyan text-accentCyan bg-accentCyan/5'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Kurva Ekuitas & DD
        </button>
        <button
          onClick={() => setActiveChartTab('pnl')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeChartTab === 'pnl'
              ? 'border-accentCyan text-accentCyan bg-accentCyan/5'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Kinerja Setup & Trades
        </button>
        <button
          onClick={() => setActiveChartTab('time')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeChartTab === 'time'
              ? 'border-accentCyan text-accentCyan bg-accentCyan/5'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Analisis Sisi & Waktu
        </button>
        <button
          onClick={() => setActiveChartTab('excursion')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            activeChartTab === 'excursion'
              ? 'border-accentCyan text-accentCyan bg-accentCyan/5'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Excursion (MFE vs MAE)
        </button>
      </div>

      {/* RENDER CHOSEN CHART BLOCK */}
      {activeChartTab === 'equity' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Equity growth curve */}
          <div className="glass-card rounded-xl p-5 border border-gray-800">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Kurva Pertumbuhan Ekuitas</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis dataKey="tradeNum" stroke="#4b5563" fontSize={11} label={{ value: 'Jumlah Trade', position: 'insideBottom', offset: -5, fill: '#4b5563' }} />
                  <YAxis stroke="#4b5563" fontSize={11} tickFormatter={(val) => `$${val.toLocaleString()}`} domain={['dataMin - 100', 'dataMax + 100']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelFormatter={(label) => `Setelah Trade #${label}`}
                    formatter={(val: any) => [formatUsd(val), 'Ekuitas']}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#equityGlow)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Drawdown chart */}
          <div className="glass-card rounded-xl p-5 border border-gray-800">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Drawdown Ekuitas (%)</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ddGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.0}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.25}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis dataKey="tradeNum" stroke="#4b5563" fontSize={11} />
                  <YAxis stroke="#4b5563" fontSize={11} tickFormatter={(val) => `${val.toFixed(1)}%`} domain={[-15, 0]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelFormatter={(label) => `Setelah Trade #${label}`}
                    formatter={(val: any) => [formatPercent(val), 'Drawdown']}
                  />
                  <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#ddGlow)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* R-multiple cumulative chart if applicable */}
          {session.riskMode !== 'NO_R' && (
            <div className="glass-card rounded-xl p-5 border border-gray-800 lg:col-span-2">
              <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Kurva Akumulasi R-Multiple</h4>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                    <XAxis dataKey="tradeNum" stroke="#4b5563" fontSize={11} />
                    <YAxis stroke="#4b5563" fontSize={11} tickFormatter={(val) => `${val}R`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                      labelFormatter={(label) => `Setelah Trade #${label}`}
                      formatter={(val: any) => [formatR(val), 'Kumulatif R']}
                    />
                    <Line type="monotone" dataKey="rCumulative" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {activeChartTab === 'pnl' && (
        <div className="space-y-6">
          {/* PNL per trade bar chart */}
          <div className="glass-card rounded-xl p-5 border border-gray-800">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Distribusi PnL USD per Trade</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equityData.filter(d => d.tradeNum > 0)} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis dataKey="tradeNum" stroke="#4b5563" fontSize={11} />
                  <YAxis stroke="#4b5563" fontSize={11} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelFormatter={(label) => `Trade #${label}`}
                    formatter={(val: any) => [formatUsd(val), 'PnL USD']}
                  />
                  <Bar dataKey="pnl">
                    {equityData.filter(d => d.tradeNum > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Setup Tag Performance */}
          <div className="glass-card rounded-xl p-5 border border-gray-800">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Performa Berdasarkan Setup Tag</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={setupChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis dataKey="name" stroke="#4b5563" fontSize={11} />
                  <YAxis stroke="#4b5563" fontSize={11} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    formatter={(val: any, name: string) => {
                      if (name === 'PnL') return [formatUsd(val), 'Total PnL'];
                      if (name === 'Winrate') return [`${val.toFixed(1)}%`, 'Win Rate'];
                      return [val, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="PnL" name="Total PnL (USD)" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                    {setupChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.PnL >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeChartTab === 'time' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Win/Loss distribution pie */}
          <div className="glass-card rounded-xl p-5 border border-gray-800 flex flex-col justify-between">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Rasio Hasil Trade</h4>
            <div className="h-[200px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    formatter={(val: any) => [val, 'Jumlah Trade']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-around text-xs text-gray-400 mt-2 font-medium">
              {pieData.map((p) => (
                <div key={p.name} className="flex items-center space-x-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  <span>{p.name}: {p.value} trades</span>
                </div>
              ))}
            </div>
          </div>

          {/* LONG vs SHORT winrates */}
          <div className="glass-card rounded-xl p-5 border border-gray-800 lg:col-span-2">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Performa Sisi Beli vs Jual</h4>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sideChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis type="number" stroke="#4b5563" fontSize={11} tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" stroke="#4b5563" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    formatter={(val: any, name: string) => {
                      if (name === 'Winrate') return [`${val.toFixed(1)}%`, 'Win Rate'];
                      if (name === 'PnL') return [formatUsd(val), 'Total PnL'];
                      return [val, name];
                    }}
                  />
                  <Bar dataKey="Winrate" fill="#06b6d4" name="Win Rate (%)" radius={[0, 4, 4, 0]} barSize={25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Day of week performance */}
          <div className="glass-card rounded-xl p-5 border border-gray-800 lg:col-span-2">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Kinerja Berdasarkan Hari Entry</h4>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dayChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis dataKey="name" stroke="#4b5563" fontSize={11} />
                  <YAxis stroke="#4b5563" fontSize={11} tickFormatter={(val) => `$${val}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    formatter={(val: any, name: string) => {
                      if (name === 'PnL') return [formatUsd(val), 'Total PnL'];
                      if (name === 'Winrate') return [`${val.toFixed(1)}%`, 'Win Rate'];
                      return [val, name];
                    }}
                  />
                  <Bar dataKey="PnL" fill="#10b981" name="PnL USD">
                    {dayChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.PnL >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hour performance */}
          <div className="glass-card rounded-xl p-5 border border-gray-800">
            <h4 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Volume & PnL Berdasarkan Jam Entry</h4>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis dataKey="hour" stroke="#4b5563" fontSize={10} />
                  <YAxis stroke="#4b5563" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    formatter={(val: any, name: string) => {
                      if (name === 'PnL') return [formatUsd(val), 'Total PnL'];
                      if (name === 'Trades') return [val, 'Jumlah Trade'];
                      return [val, name];
                    }}
                  />
                  <Bar dataKey="Trades" fill="#3b82f6" name="Trades" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeChartTab === 'excursion' && (
        <div className="glass-card rounded-xl p-5 border border-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
              Analisis MFE (Maximum Favorable Excursion) vs MAE (Maximum Adverse Excursion)
            </h4>
            <span className="text-xs text-gray-500">
              * MFE menunjukkan sejauh mana trade floating profit. MAE menunjukkan sejauh mana trade floating loss sebelum exit.
            </span>
          </div>

          {/* Scatter Excursions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="py-2.5 px-3">Trade #</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">PnL USD</th>
                  <th className="py-2.5 px-3">MFE (Float Profit)</th>
                  <th className="py-2.5 px-3">MAE (Float Loss)</th>
                  <th className="py-2.5 px-3">Setup</th>
                  <th className="py-2.5 px-3">Rasio MFE/MAE</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.slice(0, 15).map((t) => {
                  const mfe = t.favorableExcursionUsd || 0;
                  const mae = t.adverseExcursionUsd || 0;
                  const ratio = mae > 0 ? (mfe / mae).toFixed(2) : '∞';

                  return (
                    <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800/20">
                      <td className="py-2.5 px-3 font-semibold">#{t.tradeNumber || '-'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.side === 'LONG' ? 'bg-accentCyan/10 text-accentCyan' : 'bg-orange-500/10 text-orange-400'
                        }`}>
                          {t.side}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 font-medium ${(t.netPnlUsd || 0) >= 0 ? 'text-accentEmerald' : 'text-lossRed'}`}>
                        {formatUsd(t.netPnlUsd)}
                      </td>
                      <td className="py-2.5 px-3 text-accentEmerald">{formatUsd(mfe)}</td>
                      <td className="py-2.5 px-3 text-lossRed">{formatUsd(mae)}</td>
                      <td className="py-2.5 px-3 text-gray-400">{t.setupTag || '-'}</td>
                      <td className="py-2.5 px-3 font-semibold text-gray-300">
                        {ratio === '∞' ? '∞' : `${ratio}x`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {closedTrades.length > 15 && (
              <p className="text-center text-[10px] text-gray-500 mt-3 italic">
                Menampilkan 15 trade teratas. Buka tabel di bawah untuk melihat rincian lengkap.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
