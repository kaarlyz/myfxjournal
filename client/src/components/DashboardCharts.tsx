import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  Brush,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { BarChart2, MousePointerClick } from 'lucide-react';
import { Trade, BacktestSession } from '../shared/types';
import { formatUsd, formatPercent } from '../utils/formatters';
import { downsampleData, formatCompactUsd, getNiceDomain, getNegativeDomain, getMedian } from '../utils/chartUtils';
import WidgetErrorBoundary from './WidgetErrorBoundary';
import { PremiumTooltip } from './ui/PremiumTooltip';
import { SmartSummary } from './ui/SmartSummary';
import { EmptyState } from './ui/EmptyState';

export interface DashboardChartSelection {
  kind: 'day' | 'setup' | 'trade' | 'side' | 'result';
  value: string | number;
  label: string;
}

interface ChartsProps {
  session: BacktestSession;
  trades: Trade[];
  onSelectionChange?: (selection: DashboardChartSelection | null) => void;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } }
};

export default function DashboardCharts({ session, trades, onSelectionChange }: ChartsProps) {
  const [activeChartTab, setActiveChartTab] = useState<'equity' | 'pnl' | 'time' | 'excursion'>('equity');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<DashboardChartSelection | null>(null);

  const handleSelection = (sel: DashboardChartSelection) => {
    setActiveFilter(sel);
    if (onSelectionChange) onSelectionChange(sel);
  };

  const clearSelection = () => {
    setActiveFilter(null);
    if (onSelectionChange) onSelectionChange(null);
  };

  const toggleSeries = (dataKey: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  };

  const closedTrades = useMemo(() => {
    return trades
      .filter((t) => t.status === 'CLOSED')
      .sort((a, b) => {
        const aTime = a.exitTime ? new Date(a.exitTime).getTime() : 0;
        const bTime = b.exitTime ? new Date(b.exitTime).getTime() : 0;
        return aTime - bTime;
      });
  }, [trades]);

  const chartData = useMemo(() => {
    let runningEquity = session.initialBalance;
    let peak = session.initialBalance;
    const data = [{ tradeNum: 0, equity: session.initialBalance, drawdown: 0, pnl: 0 }];

    closedTrades.forEach((t, i) => {
      const pnl = t.netPnlUsd || 0;
      runningEquity += pnl;
      if (runningEquity > peak) peak = runningEquity;
      const ddUsd = peak - runningEquity;
      const ddPct = peak > 0 ? (ddUsd / peak) * 100 : 0;

      data.push({
        tradeNum: i + 1,
        equity: runningEquity,
        drawdown: -ddPct,
        pnl: pnl,
        symbol: t.symbol,
        side: t.side,
        date: t.entryTime,
        mfe: t.favorableExcursionUsd || 0,
        mae: t.adverseExcursionUsd || 0,
        actualTradeNum: t.tradeNumber
      } as any);
    });

    return data;
  }, [closedTrades, session.initialBalance]);

  const sampledEquityData = useMemo(() => downsampleData(chartData, 1000), [chartData]);
  const equityDomain = useMemo(() => getNiceDomain(sampledEquityData.map((d) => d.equity || 0), 0.06), [sampledEquityData]);
  const drawdownDomain = useMemo(() => getNegativeDomain(sampledEquityData.map((d) => d.drawdown || 0), 0.08), [sampledEquityData]);

  const timeChartData = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const aggregated = days.map((day, idx) => ({ dayName: day, pnl: 0, tradeCount: 0, dayIdx: idx, dayNameIdr: ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][idx] }));

    closedTrades.forEach(t => {
      if (t.entryTime) {
        const dayIdx = new Date(t.entryTime).getDay();
        aggregated[dayIdx].pnl += (t.netPnlUsd || 0);
        aggregated[dayIdx].tradeCount += 1;
      }
    });
    return aggregated;
  }, [closedTrades]);

  const scatterData = useMemo(() => {
    return closedTrades.filter(t => t.adverseExcursionUsd !== undefined && t.favorableExcursionUsd !== undefined).map(t => ({
      mfe: t.favorableExcursionUsd || 0,
      mae: t.adverseExcursionUsd || 0,
      pnl: t.netPnlUsd || 0,
      num: t.tradeNumber
    }));
  }, [closedTrades]);

  const medianMfe = useMemo(() => getMedian(scatterData.map((d) => d.mfe || 0)), [scatterData]);
  const medianMae = useMemo(() => getMedian(scatterData.map((d) => d.mae || 0)), [scatterData]);

  const averageDayPnl = useMemo(() => {
    const values = timeChartData.map((d) => d.pnl);
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [timeChartData]);

  const insights = useMemo(() => {
    if (closedTrades.length === 0) return { equityInsights: [], setupInsights: [], timeInsights: [] };
    
    const maxDd = Math.abs(Math.min(...chartData.map(d => d.drawdown)));
    const finalEq = chartData[chartData.length - 1].equity;
    const isProfit = finalEq >= session.initialBalance;
    
    const equityInsights = [
      { label: 'Highest Drawdown', value: formatPercent(-maxDd), highlight: maxDd > 10 ? 'negative' : 'neutral' as any },
      { label: 'Net Profit', value: formatUsd(finalEq - session.initialBalance), highlight: isProfit ? 'positive' : 'negative' as any }
    ];

    const setupPerformance: Record<string, { pnl: number }> = {};
    closedTrades.forEach(t => {
      const tag = t.setupTag || 'Tanpa Tag';
      setupPerformance[tag] = setupPerformance[tag] || { pnl: 0 };
      setupPerformance[tag].pnl += (t.netPnlUsd || 0);
    });
    const bestSetup = Object.entries(setupPerformance).sort((a, b) => b[1].pnl - a[1].pnl)[0];
    
    const setupInsights = bestSetup ? [
      { label: 'Most Profitable Setup', value: bestSetup[0], highlight: bestSetup[1].pnl > 0 ? 'positive' : 'neutral' as any },
      { label: 'Setup Profit', value: formatUsd(bestSetup[1].pnl), highlight: bestSetup[1].pnl > 0 ? 'positive' : 'negative' as any }
    ] : [];

    const dayPerf: Record<number, number> = {};
    closedTrades.forEach(t => {
      if (t.entryTime) {
        const day = new Date(t.entryTime).getDay();
        dayPerf[day] = (dayPerf[day] || 0) + (t.netPnlUsd || 0);
      }
    });
    const daysName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const bestDayIdx = Object.entries(dayPerf).sort((a, b) => b[1] - a[1])[0];

    const timeInsights = bestDayIdx ? [
      { label: 'Best Trading Day', value: daysName[Number(bestDayIdx[0])], highlight: bestDayIdx[1] > 0 ? 'positive' : 'neutral' as any }
    ] : [];

    return { equityInsights, setupInsights, timeInsights };
  }, [closedTrades, chartData, session.initialBalance]);

  if (closedTrades.length === 0) {
    return (
      <EmptyState 
        icon={BarChart2}
        title="No Data Available"
        description="There are no closed trades in this session yet. Complete some trades to generate analytics."
      />
    );
  }

  const renderGrid = () => <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,18,18,0.06)" vertical={false} />;
  
  const renderLegend = (props: any) => {
    const { payload } = props;
    return (
      <div className="flex justify-center gap-4 mt-2">
        {payload.map((entry: any, index: number) => {
          const isHidden = hiddenSeries.has(entry.dataKey);
          return (
            <div 
              key={`item-${index}`}
              className="flex items-center gap-2 cursor-pointer transition-opacity"
              style={{ opacity: isHidden ? 0.4 : 1 }}
              onClick={() => toggleSeries(entry.dataKey)}
            >
              <div className="w-3 h-3 border-2 border-[var(--border-color)]" style={{ backgroundColor: entry.color }} />
              <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const FilterAlert = () => (
    <AnimatePresence>
      {activeFilter && (
        <motion.div 
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          className="bg-[var(--accent-blue)] text-white px-4 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider overflow-hidden shadow-[3px_3px_0px_0px_var(--bg-dark)] border-2 border-[var(--bg-dark)]"
        >
          <div className="flex items-center gap-2">
            <MousePointerClick className="w-4 h-4" />
            Active Drill-down: {activeFilter.label}
          </div>
          <button onClick={clearSelection} className="hover:text-[var(--bg-base)] transition-colors underline">Clear Filter</button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 pb-2">
        {(['equity', 'pnl', 'time', 'excursion'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveChartTab(tab)}
            className={`
              px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all
              border-2 border-[var(--border-color)] 
              ${activeChartTab === tab ? 'bg-[var(--bg-dark)] text-white shadow-[3px_3px_0px_0px_var(--accent-blue)]' : 'bg-white text-[var(--text-primary)] hover:bg-[var(--bg-base)] hover:-translate-y-0.5'}
            `}
          >
            {tab === 'equity' && 'Equity & Drawdown'}
            {tab === 'pnl' && 'Setup & PnL'}
            {tab === 'time' && 'Time Analysis'}
            {tab === 'excursion' && 'Excursion (MFE/MAE)'}
          </button>
        ))}
      </div>

      <FilterAlert />

      <AnimatePresence mode="wait">
        {activeChartTab === 'equity' && (
          <motion.div key="equity" variants={containerVariants} initial="hidden" animate="show" exit="exit" className="grid grid-cols-12 gap-5 w-full">
            <motion.div variants={itemVariants} className="col-span-12 lg:col-span-8 bg-white p-5 border-2 border-[var(--border-color)] relative shadow-[4px_4px_0px_0px_var(--shadow-color)]" style={{ '--shadow-color': 'var(--bg-dark)' } as any}>
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--accent-blue)]" />
              <SectionLabel label="Equity Growth Curve" shape="circle" color="blue" className="mt-1 mb-2" />
              <SmartSummary insights={insights.equityInsights} />
              <div className="h-[380px] w-full mt-4">
                <WidgetErrorBoundary widgetName="Equity Curve">
                  <ResponsiveContainer width="100%" height="100%">
                  <AreaChart syncId="equityGroup" data={sampledEquityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    {renderGrid()}
                      <XAxis
                      dataKey="tradeNum"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11, dy: 4 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={30}
                      interval="preserveStartEnd"
                      padding={{ left: 12, right: 12 }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickFormatter={(val) => formatCompactUsd(val)}
                      domain={equityDomain}
                      tickLine={false}
                      axisLine={false}
                      tickCount={5}
                      padding={{ top: 10, bottom: 10 }}
                    />
                    <Tooltip content={<PremiumTooltip formatMode="currency" />} cursor={{ stroke: 'rgba(16,64,192,0.18)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                    {!hiddenSeries.has('equity') && (
                      <Area
                        type="monotone"
                        dataKey="equity"
                        name="Running Equity"
                        stroke="var(--accent-blue)"
                        strokeWidth={3}
                        dot={false}
                        fillOpacity={1}
                        fill="url(#equityGlow)"
                        activeDot={{ r: 5, stroke: 'var(--bg-dark)', strokeWidth: 2 }}
                      />
                    )}
                    {sampledEquityData.length > 50 && (
                      <Brush dataKey="tradeNum" height={20} stroke="var(--bg-dark)" fill="var(--bg-base)" travellerWidth={8} />
                    )}
                    {sampledEquityData.length > 0 && (
                      <ReferenceLine
                        x={sampledEquityData[sampledEquityData.length - 1].tradeNum}
                        y={sampledEquityData[sampledEquityData.length - 1].equity}
                        stroke="rgba(16,64,192,0.35)"
                        strokeDasharray="4 4"
                      />
                    )}
                    <Legend content={renderLegend} />
                  </AreaChart>
                </ResponsiveContainer>
                </WidgetErrorBoundary>
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="col-span-12 lg:col-span-4 bg-white p-5 border-2 border-[var(--border-color)] relative shadow-[4px_4px_0px_0px_var(--shadow-color)]" style={{ '--shadow-color': 'var(--bg-dark)' } as any}>
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-[var(--loss)]" />
              <SectionLabel label="Drawdown (%)" shape="square" color="red" className="mt-1 mb-5" />
              <div className="h-[380px] w-full">
                <WidgetErrorBoundary widgetName="Drawdown Area">
                  <ResponsiveContainer width="100%" height="100%">
                  <AreaChart syncId="equityGroup" data={sampledEquityData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ddGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--loss)" stopOpacity={0.0}/>
                        <stop offset="95%" stopColor="var(--loss)" stopOpacity={0.2}/>
                      </linearGradient>
                    </defs>
                    {renderGrid()}
                    <XAxis dataKey="tradeNum" hide />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickFormatter={(val) => `${val}%`}
                      domain={drawdownDomain}
                      tickLine={false}
                      axisLine={false}
                      orientation="right"
                      tickCount={5}
                      padding={{ top: 10, bottom: 10 }}
                    />
                    <Tooltip content={<PremiumTooltip formatMode="percent" />} cursor={{ stroke: 'rgba(16,64,192,0.18)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                    <ReferenceLine y={0} stroke="rgba(18,18,18,0.18)" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="drawdown"
                      name="Drawdown"
                      stroke="var(--loss)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#ddGlow)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                </WidgetErrorBoundary>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeChartTab === 'pnl' && (
          <motion.div key="pnl" variants={containerVariants} initial="hidden" animate="show" exit="exit" className="space-y-6">
            <motion.div variants={itemVariants} className="bg-white p-5 border-2 border-[var(--border-color)] relative shadow-[4px_4px_0px_0px_var(--shadow-color)]" style={{ '--shadow-color': 'var(--bg-dark)' } as any}>
              <SectionLabel label="PnL Distribution per Trade (Interactive)" shape="square" color="dark" className="mt-1 mb-2" />
              <SmartSummary insights={insights.setupInsights} />
              <div className="h-[350px] mt-4">
                <WidgetErrorBoundary widgetName="PnL Distribution">
                  <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sampledEquityData.filter((d) => d.tradeNum > 0)}
                    margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                    barCategoryGap="24%"
                    barGap={4}
                  >
                    {renderGrid()}
                    <XAxis
                      dataKey="tradeNum"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11, dy: 4 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={20}
                      interval="preserveStartEnd"
                      padding={{ left: 10, right: 10 }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickFormatter={(val) => formatCompactUsd(val)}
                      tickLine={false}
                      axisLine={false}
                      tickCount={5}
                      padding={{ top: 10, bottom: 10 }}
                    />
                    <Tooltip content={<PremiumTooltip formatMode="currency" />} cursor={{ fill: 'rgba(16,64,192,0.08)' }} />
                    <ReferenceLine y={0} stroke="rgba(18,18,18,0.18)" />
                    <Bar
                      dataKey="pnl"
                      name="Net PnL"
                      onClick={(data) => {
                        if (data && data.payload && data.payload.actualTradeNum) {
                          handleSelection({ kind: 'trade', value: data.payload.actualTradeNum, label: `Trade #${data.payload.actualTradeNum}` });
                        }
                      }}
                      className="cursor-pointer"
                      radius={[3, 3, 0, 0]}
                      barSize={14}
                    >
                      {sampledEquityData.filter((d) => d.tradeNum > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? 'var(--profit)' : 'var(--loss)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </WidgetErrorBoundary>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeChartTab === 'time' && (
          <motion.div key="time" variants={containerVariants} initial="hidden" animate="show" exit="exit" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div variants={itemVariants} className="bg-white p-5 border-2 border-[var(--border-color)] relative col-span-1 lg:col-span-2 shadow-[4px_4px_0px_0px_var(--shadow-color)]" style={{ '--shadow-color': 'var(--bg-dark)' } as any}>
              <SectionLabel label="Performance by Day (Interactive)" shape="diamond" color="yellow" className="mt-1 mb-2" />
              <SmartSummary insights={insights.timeInsights} />
              <div className="h-[300px] mt-4">
                <WidgetErrorBoundary widgetName="Performance by Day">
                  <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={timeChartData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                    barCategoryGap="24%"
                    barGap={6}
                  >
                    {renderGrid()}
                    <XAxis
                      dataKey="dayName"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11, dy: 4 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => v.substring(0, 3)}
                      interval="preserveStartEnd"
                      padding={{ left: 10, right: 10 }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickFormatter={(val) => formatCompactUsd(val)}
                      tickLine={false}
                      axisLine={false}
                      tickCount={5}
                      padding={{ top: 10, bottom: 10 }}
                    />
                    <Tooltip
                      content={<PremiumTooltip formatMode="currency" />}
                      cursor={{ fill: 'rgba(16,64,192,0.08)' }}
                      labelFormatter={(label) => {
                        const item = timeChartData.find((d) => d.dayName === label);
                        return item ? `${label} · ${item.tradeCount} trades` : label;
                      }}
                    />
                    <ReferenceLine y={0} stroke="rgba(18,18,18,0.18)" />
                    <ReferenceLine y={averageDayPnl} stroke="rgba(16,64,192,0.18)" strokeDasharray="4 4" />
                    <Bar
                      dataKey="pnl"
                      name="Total PnL"
                      onClick={(data) => {
                        if (data && data.payload) {
                          handleSelection({ kind: 'day', value: data.payload.dayNameIdr.toLowerCase(), label: data.payload.dayName });
                        }
                      }}
                      className="cursor-pointer"
                      radius={[3, 3, 0, 0]}
                      barSize={16}
                    >
                      {timeChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? 'var(--profit)' : 'var(--loss)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeChartTab === 'excursion' && (
          <motion.div key="excursion" variants={containerVariants} initial="hidden" animate="show" exit="exit" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <motion.div variants={itemVariants} className="bg-white p-5 border-2 border-[var(--border-color)] relative col-span-1 lg:col-span-2 shadow-[4px_4px_0px_0px_var(--shadow-color)]" style={{ '--shadow-color': 'var(--bg-dark)' } as any}>
               <SectionLabel label="Correlation: MFE vs MAE" shape="square" color="dark" className="mb-2" />
               <div className="text-[var(--text-muted)] text-xs font-bold uppercase mb-6 max-w-2xl">
                 Scatter plot mapping Maximum Favorable Excursion against Maximum Adverse Excursion. 
                 Trades in the bottom right represent high execution patience (High MFE, Low MAE).
               </div>
               
               <div className="h-[350px] w-full">
                <WidgetErrorBoundary widgetName="MFE vs MAE Scatter">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 15, right: 18, bottom: 18, left: 18 }}>
                      {renderGrid()}
                      <XAxis
                        type="number"
                        dataKey="mae"
                        name="MAE"
                        unit="$"
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatCompactUsd(v)}
                        interval="preserveStartEnd"
                        padding={{ left: 8, right: 8 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="mfe"
                        name="MFE"
                        unit="$"
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => formatCompactUsd(v)}
                        interval="preserveStartEnd"
                        padding={{ top: 10, bottom: 10 }}
                      />
                        <ZAxis type="number" dataKey="pnl" name="PnL" range={[30, 80]} />
                      <Tooltip content={<PremiumTooltip formatMode="currency" />} cursor={{ stroke: 'rgba(16,64,192,0.16)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                      <ReferenceLine x={medianMae} stroke="rgba(16,64,192,0.16)" strokeDasharray="4 4" />
                      <ReferenceLine y={medianMfe} stroke="rgba(16,64,192,0.16)" strokeDasharray="4 4" />
                      <Scatter
                        name="Trades"
                        data={scatterData}
                        fill="var(--bg-dark)"
                        shape="circle"
                        fillOpacity={0.85}
                        line={{ strokeWidth: 0 }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </WidgetErrorBoundary>
               </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
