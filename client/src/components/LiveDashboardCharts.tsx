import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { formatTradeTime } from '../utils/timeUtils';
import { formatCurrency } from '../utils/numberUtils';

interface Props {
  trades: any[];
}

export default function LiveDashboardCharts({ trades }: Props) {
  // Sort trades by close time (or open time if not closed)
  const sortedTrades = [...trades].sort((a, b) => {
    const timeA = new Date(a.closeTime || a.openTime).getTime();
    const timeB = new Date(b.closeTime || b.openTime).getTime();
    return timeA - timeB;
  });

  // Calculate cumulative PnL
  let cumulative = 0;
  const equityData = sortedTrades.filter(t => t.profit !== null).map((t, index) => {
    cumulative += t.profit;
    return {
      name: `T${index + 1}`,
      time: formatTradeTime(t.closeTime || t.openTime),
      profit: t.profit,
      equity: cumulative
    };
  });

  if (equityData.length === 0) {
    return <div className="text-[#707a8a] text-sm italic py-4">Not enough closed trades to generate charts.</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 mb-6">
      <div className="bn-card  border border-[#2b3139] rounded-xl p-6">
        <h3 className="text-sm font-bold text-[#929aa5] mb-4 uppercase tracking-wider">Equity Curve (Net PnL)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData}>
              <defs>
                <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#888', marginBottom: '4px' }}
                formatter={(value: any) => [formatCurrency(value, 'USD'), 'Cumulative PnL']}
              />
              <Area type="monotone" dataKey="equity" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorEquity)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bn-card  border border-[#2b3139] rounded-xl p-6">
        <h3 className="text-sm font-bold text-[#929aa5] mb-4 uppercase tracking-wider">Trade PnL Distribution</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={equityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
              <Tooltip 
                cursor={{ fill: '#ffffff05' }}
                contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }}
                formatter={(value: any) => [formatCurrency(value, 'USD'), 'Profit/Loss']}
              />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                {
                  equityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} />
                  ))
                }
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
