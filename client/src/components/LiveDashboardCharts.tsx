import React, { useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts';
import { motion } from 'framer-motion';
import { formatTradeTime } from '../utils/timeUtils';
import { formatCompactUsd, downsampleData } from '../utils/chartUtils';
import { SectionLabel } from './ui/SectionLabel';
import { PremiumTooltip } from './ui/PremiumTooltip';
import { EmptyState } from './ui/EmptyState';
import { Activity } from 'lucide-react';

interface Props {
  trades: any[];
}

export default function LiveDashboardCharts({ trades }: Props) {
  const chartData = useMemo(() => {
    const sortedTrades = [...trades].sort((a, b) => {
      const timeA = new Date(a.closeTime || a.openTime).getTime();
      const timeB = new Date(b.closeTime || b.openTime).getTime();
      return timeA - timeB;
    });

    let cumulative = 0;
    return sortedTrades.filter(t => t.profit !== null).map((t, index) => {
      cumulative += t.profit;
      return {
        tradeNum: index + 1,
        name: `T${index + 1}`,
        time: formatTradeTime(t.closeTime || t.openTime),
        profit: t.profit,
        equity: cumulative,
        symbol: t.symbol,
        side: t.type === 0 ? 'LONG' : t.type === 1 ? 'SHORT' : 'UNKNOWN' // MT5 types
      };
    });
  }, [trades]);

  const sampledData = useMemo(() => downsampleData(chartData, 500), [chartData]);

  if (chartData.length === 0) {
    return (
      <EmptyState 
        icon={Activity}
        title="Waiting for Live Trades"
        description="Connect your MT5 terminal to see real-time streaming equity and performance analytics."
        className="mt-6 mb-6"
      />
    );
  }

  const renderGrid = () => <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,18,18,0.06)" vertical={false} />;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 mb-6">
      
      {/* Live Equity Curve */}
      <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#1040C0]" />
        <SectionLabel label="Live Equity Curve (Net PnL)" shape="circle" color="blue" className="mt-1 mb-5" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart syncId="liveGroup" data={sampledData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorEquityLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1040C0" stopOpacity={0.28}/>
                  <stop offset="65%" stopColor="#1040C0" stopOpacity={0.09}/>
                  <stop offset="100%" stopColor="#1040C0" stopOpacity={0}/>
                </linearGradient>
              </defs>
              {renderGrid()}
              <XAxis
                dataKey="name"
                tick={{ fill: '#717182', fontSize: 11, dy: 4 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                interval="preserveStartEnd"
                padding={{ left: 10, right: 10 }}
              />
              <YAxis
                tick={{ fill: '#717182', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatCompactUsd(value)}
                tickCount={5}
                padding={{ top: 10, bottom: 10 }}
              />
              <Tooltip
                content={<PremiumTooltip formatMode="currency" />}
                cursor={{ stroke: 'rgba(16,64,192,0.18)', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              <Area
                type="monotone"
                dataKey="equity"
                name="Running PnL"
                stroke="#1040C0"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorEquityLive)"
                dot={false}
                activeDot={{ r: 6, stroke: 'var(--bg-dark)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trade PnL Distribution */}
      <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#121212]" />
        <SectionLabel label="Trade PnL Distribution" shape="square" color="dark" className="mt-1 mb-5" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              syncId="liveGroup"
              data={sampledData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              barCategoryGap="26%"
              barGap={6}
            >
              {renderGrid()}
              <XAxis
                dataKey="name"
                tick={{ fill: '#717182', fontSize: 11, dy: 4 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                interval="preserveStartEnd"
                padding={{ left: 10, right: 10 }}
              />
              <YAxis
                tick={{ fill: '#717182', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatCompactUsd(value)}
                tickCount={5}
                padding={{ top: 10, bottom: 10 }}
              />
              <Tooltip
                content={<PremiumTooltip formatMode="currency" />}
                cursor={{ fill: 'rgba(16,64,192,0.08)' }}
              />
              <ReferenceLine y={0} stroke="rgba(18,18,18,0.18)" strokeDasharray="3 3" />
              <Bar dataKey="profit" name="Trade PnL" barSize={16} radius={[4, 4, 0, 0]}>
                {sampledData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? 'var(--profit)' : 'var(--loss)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
