import React, { useState } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { Settings2 } from 'lucide-react';
import { formatUsd, formatPercent } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { SectionLabel } from '../ui/SectionLabel';
import { apiUrl, defaultHeaders } from '../../utils/api';

interface Props {
  sessionId: string;
  session: any;
  metrics: any;
  trades: any[];
}

export default function RiskRecalculationTab({ sessionId, session, metrics, trades }: Props) {
  const [initialBalance, setInitialBalance] = useState(session?.initialBalance || 10000);
  const [riskMode, setRiskMode] = useState<'FIXED_USD' | 'FIXED_PCT' | 'NO_R'>(session?.riskMode || 'FIXED_PCT');
  const [riskValue, setRiskValue] = useState(session?.riskValue || 1);
  const [compounding, setCompounding] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [recalcData, setRecalcData] = useState<{ metrics: any; trades: any[] } | null>(null);

  const handleRecalculate = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/sessions/${sessionId}/recalculate`), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          initialBalance,
          riskMode,
          riskValue,
          compounding
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRecalcData(data);
    } catch (e) {
      alert('Error recalculating');
    } finally {
      setLoading(false);
    }
  };

  const displayMetrics = recalcData?.metrics || metrics;
  const displayTrades = recalcData?.trades || trades;

  const chartData = displayTrades.map((t, idx) => ({
    name: `T${idx + 1}`,
    rawBalance: t.balanceAfter || displayMetrics.initialBalance,
    recalculatedBalance: t.balanceAfter || displayMetrics.initialBalance,
    rawPnl: t.netPnlUsd || 0,
    recalcPnl: t.recalculatedPnl || 0
  }));

  const tooltipStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#121212',
    borderWidth: 2,
    borderRadius: 0,
    boxShadow: '4px 4px 0px 0px #121212',
    fontFamily: 'Outfit, sans-serif',
    fontSize: '12px',
    padding: '10px 14px'
  };

  const tooltipLabelStyle = {
    color: '#717182',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    marginBottom: '4px'
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1 bg-[#F0F0F0] border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] space-y-5 h-fit">
          <SectionLabel label="What-If Settings" shape="square" color="dark" icon={<Settings2 className="w-4 h-4" />} />
          
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-[#121212] uppercase tracking-wider block mb-1.5">Initial Balance</label>
              <input 
                type="number" 
                value={initialBalance}
                onChange={e => setInitialBalance(Number(e.target.value))}
                className="input font-bold"
              />
            </div>
            
            <div>
              <label className="text-[11px] font-bold text-[#121212] uppercase tracking-wider block mb-1.5">Risk Mode</label>
              <select 
                value={riskMode}
                onChange={e => setRiskMode(e.target.value as any)}
                className="input font-bold cursor-pointer"
              >
                <option value="NO_R">No Risk (Raw PnL)</option>
                <option value="FIXED_USD">Fixed USD per Trade</option>
                <option value="FIXED_PCT">Fixed % per Trade</option>
              </select>
            </div>
            
            {riskMode !== 'NO_R' && (
              <div>
                <label className="text-[11px] font-bold text-[#121212] uppercase tracking-wider block mb-1.5">
                  Risk Value {riskMode === 'FIXED_PCT' ? '(%)' : '(USD)'}
                </label>
                <input 
                  type="number" 
                  step="0.1"
                  value={riskValue}
                  onChange={e => setRiskValue(Number(e.target.value))}
                  className="input font-bold"
                />
              </div>
            )}
            
            {riskMode === 'FIXED_PCT' && (
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  checked={compounding}
                  onChange={e => setCompounding(e.target.checked)}
                  id="compounding-toggle"
                  className="w-4 h-4 accent-[#1040C0] cursor-pointer"
                />
                <label htmlFor="compounding-toggle" className="text-[11px] font-bold text-[#121212] uppercase tracking-wider cursor-pointer">Enable Compounding</label>
              </div>
            )}
            
            <Button 
              variant="blue"
              onClick={handleRecalculate}
              disabled={loading}
              isLoading={loading}
              fullWidth
              className="mt-4"
            >
              Apply Recalculation
            </Button>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider mb-1">Recalculated Net PnL</div>
              <div className={`text-xl font-extrabold font-number ${displayMetrics.netProfitRecalculated >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                {formatUsd(displayMetrics.netProfitRecalculated)}
              </div>
            </div>
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider mb-1">Growth %</div>
              <div className={`text-xl font-extrabold font-number ${displayMetrics.growthPercent >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                {formatPercent(displayMetrics.growthPercent)}
              </div>
            </div>
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider mb-1">Recalculated Max DD</div>
              <div className="text-xl font-extrabold font-number text-[var(--loss)]">
                {formatUsd(displayMetrics.maxDrawdownRecalculated)}
              </div>
            </div>
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <div className="text-[10px] text-[#717182] uppercase font-bold tracking-wider mb-1">Profit Factor</div>
              <div className={`text-xl font-extrabold font-number ${displayMetrics.profitFactor >= 1 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                {displayMetrics.profitFactor.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#F0C020]" />
            <SectionLabel label="Recalculated Equity Curve" shape="circle" color="yellow" className="mt-1 mb-5" />
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRecalculated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F0C020" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F0C020" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(18,18,18,0.1)" vertical={false} />
                  <XAxis dataKey="name" stroke="#717182" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#717182" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="recalculatedBalance" 
                    stroke="#F0C020" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorRecalculated)" 
                    name="Equity"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
