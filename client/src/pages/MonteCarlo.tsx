import React, { useState, useMemo } from 'react';
import { useJournalStore } from '../store/useJournalStore';
import { Dices, AlertTriangle, TrendingUp, Activity, BookOpen, Target, Settings2 } from 'lucide-react';
import { runMonteCarlo, MonteCarloConfig } from '../lib/monteCarloEngine';
import { formatUsd, formatPercent } from '../utils/formatters';
import MetricCard from '../components/MetricCard';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SectionLabel, PageHeader } from '../components/ui/SectionLabel';
import { Badge } from '../components/ui/Badge';
import { formatCompactUsd } from '../utils/chartUtils';
import { PremiumTooltip } from '../components/ui/PremiumTooltip';

// Tooltip styles removed in favor of PremiumTooltip

export default function MonteCarlo() {
  const { activeSessionDetails, sessions, selectSession } = useJournalStore();
  
  const [config, setConfig] = useState<MonteCarloConfig>({
    simulations: 1000,
    futureTradesCount: 100,
    startingBalance: 10000,
    riskPerTradeUsd: 100,
    useHistoricalDistribution: true,
    assumedWinRate: 50,
    assumedAvgWinUsd: 200,
    assumedAvgLossUsd: 100,
  });

  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSimulate = () => {
    if (!activeSessionDetails) return;
    setIsSimulating(true);
    // Use setTimeout to allow UI to render loading state
    setTimeout(() => {
      const res = runMonteCarlo(activeSessionDetails.trades, config);
      setResult(res);
      setIsSimulating(false);
    }, 100);
  };

  // Convert array curves to recharts data
  const chartData = useMemo(() => {
    if (!result) return [];
    const data: any[] = [];
    const maxLength = Math.max(...result.simulations.map((c: any) => c.length));
    
    for (let i = 0; i < maxLength; i++) {
      const point: any = { name: `Trade ${i}` };
      result.simulations.forEach((curve: any, index: number) => {
        if (i < curve.length) {
          point[`sim${index}`] = curve[i];
        }
      });
      data.push(point);
    }
    return data;
  }, [result]);

  if (!activeSessionDetails) {
    if (sessions.length === 0) {
      return (
        <div className="space-y-6 animate-fade-in">
          <PageHeader 
            label="Simulation"
            title="Monte Carlo Simulator"
            subtitle="Project future probabilities using the mathematical principles of randomness."
            labelColor="red"
          />
          <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-8 md:p-12 text-center flex flex-col items-center">
            <div className="p-4 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] mb-5">
              <Dices className="w-8 h-8 text-[#121212]" strokeWidth={2} />
            </div>
            <p className="text-[14px] font-extrabold text-[#717182] uppercase tracking-widest">No backtest sessions available.</p>
            <p className="text-[13px] font-bold text-[#717182] mt-3 max-w-md mx-auto leading-relaxed">
              Create a backtest session first to use the Monte Carlo simulator and stress-test its mathematical robustness.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-8 animate-fade-in">
        <PageHeader 
          label="Simulation"
          title="Monte Carlo Simulator"
          subtitle="Select a backtest session to project its future probabilities."
          labelColor="red"
        />

        {/* Educational Banner */}
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] p-6 lg:p-8 flex flex-col lg:flex-row gap-6 lg:gap-8 items-start relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/3 h-full bg-[#2563EB] opacity-[0.03] border-l-4 border-[#121212] hidden lg:block" />
          
          <div className="p-4 bg-[#2563EB] border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] shrink-0 z-10">
            <BookOpen className="w-8 h-8 text-white" strokeWidth={2} />
          </div>
          
          <div className="space-y-4 relative z-10">
            <h2 className="text-2xl font-extrabold text-[#121212] uppercase tracking-tight">Why Use Monte Carlo?</h2>
            <p className="text-[14px] font-medium text-[#717182] leading-relaxed max-w-4xl">
              Trading is a game of probabilities. Even with a profitable strategy, the random distribution of wins and losses can cause catastrophic drawdowns if you're unlucky. 
              <br /><br />
              The <strong>Monte Carlo Simulator</strong> takes your historical trading data and randomly reshuffles the order of your trades thousands of times. This creates alternate realities—showing you what could happen if you face your worst losing streak right from the start. It answers the ultimate question: <strong>"Is my strategy robust enough to survive the worst possible luck?"</strong>
            </p>
          </div>
        </div>

        {/* Session Grid */}
        <div className="space-y-4">
          <SectionLabel label="Select a Session" shape="diamond" color="dark" />
          {/* Fix layout bugs here: Break words, min-w-0 on text containers, proper gap */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {sessions.map(s => (
              <div 
                key={s.id} 
                className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#121212] transition-all flex flex-col group cursor-pointer h-full" 
                onClick={() => selectSession(s.id)}
              >
                <div className="flex items-start justify-between gap-3 mb-6">
                  <div className="min-w-0 flex-1 pr-2">
                    <h3 className="text-[15px] font-extrabold text-[#121212] uppercase tracking-wide truncate group-hover:text-[#2563EB] transition-colors" title={s.name}>
                      {s.name}
                    </h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[11px] font-bold text-[#717182] uppercase tracking-wider bg-[#F0F0F0] inline-block px-2 py-0.5 border border-[#121212]/10">{s.symbol}</span>
                      <span className="text-[11px] font-bold text-[#717182] uppercase tracking-wider bg-[#F0F0F0] inline-block px-2 py-0.5 border border-[#121212]/10">{s.timeframe}</span>
                    </div>
                  </div>
                  <Badge variant="neutral" className="shrink-0">{s.tradeCount} trades</Badge>
                </div>
                <div className="mt-auto pt-4 flex items-center justify-between text-[#2563EB] border-t-2 border-dashed border-[#121212]/10">
                  <span className="text-[12px] font-extrabold uppercase tracking-widest">Select Session</span>
                  <Target className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <PageHeader 
          label="Simulation"
          title="Monte Carlo Simulator"
          subtitle="Stress-test your strategy against randomness and variance."
          labelColor="red"
        />
        
        {/* Session Selector */}
        <div className="flex items-center gap-3 bg-white border-2 border-[#121212] p-2 shadow-[4px_4px_0px_0px_#121212] md:mt-2 shrink-0">
          <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest pl-2 hidden sm:block">Active Session:</label>
          <select
            className="bg-[#F0F0F0] border-2 border-[#121212] px-3 py-1.5 font-bold text-[13px] uppercase text-[#121212] outline-none cursor-pointer hover:bg-[#E5E5E5] transition-colors w-full sm:max-w-[200px] md:max-w-xs truncate"
            value={activeSessionDetails?.session.id || ''}
            onChange={(e) => {
              selectSession(e.target.value);
              setResult(null);
            }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border-4 border-[#121212] p-4 md:p-8 shadow-[8px_8px_0px_0px_#121212] grid grid-cols-1 xl:grid-cols-4 gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-3 bg-[var(--loss)]" />
        
        <div className="space-y-6 xl:col-span-1 border-b-2 xl:border-b-0 xl:border-r-4 border-dashed border-[#121212]/20 pb-8 xl:pb-0 xl:pr-8 mt-2 flex flex-col h-full">
          <SectionLabel label="Parameters" shape="diamond" color="red" />
          
          <div className="space-y-6">
            {/* Input fields with inline educational hints */}
            <div className="space-y-1.5">
              <Input 
                label="Number of Simulations" 
                type="number" 
                value={config.simulations} 
                onChange={e => setConfig({...config, simulations: Number(e.target.value)})} 
              />
              <p className="text-[10px] font-bold text-[#717182] uppercase leading-tight pl-1">
                How many alternate realities to generate. Recommended: 1000+.
              </p>
            </div>
            
            <div className="space-y-1.5">
              <Input 
                label="Future Trades Count" 
                type="number" 
                value={config.futureTradesCount} 
                onChange={e => setConfig({...config, futureTradesCount: Number(e.target.value)})} 
              />
              <p className="text-[10px] font-bold text-[#717182] uppercase leading-tight pl-1">
                How many trades ahead to project in each reality.
              </p>
            </div>
            
            <div className="space-y-1.5">
              <Input 
                label="Starting Balance ($)" 
                type="number" 
                value={config.startingBalance} 
                onChange={e => setConfig({...config, startingBalance: Number(e.target.value)})} 
              />
              <p className="text-[10px] font-bold text-[#717182] uppercase leading-tight pl-1">
                Initial capital for the simulation.
              </p>
            </div>
          </div>
          
          <Button 
            variant="blue"
            onClick={handleSimulate} 
            disabled={isSimulating} 
            className="w-full mt-4 py-4 text-[14px]"
            fullWidth
          >
            {isSimulating ? 'Simulating Realities...' : 'Run Simulation'}
          </Button>
          
          {/* Educational Sidebar Context */}
          <div className="mt-auto pt-8">
            <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 relative">
              <div className="absolute -top-3 -left-3 bg-[#121212] text-white p-1.5 border-2 border-white">
                <Settings2 className="w-4 h-4" />
              </div>
              <h4 className="text-[13px] font-extrabold text-[#121212] uppercase mb-2 ml-4">How it works</h4>
              <p className="text-[12px] font-medium text-[#717182] leading-relaxed">
                We take your historical win rate and average win/loss sizes, then play out {config.futureTradesCount} trades {config.simulations} times in a row. This reveals the extreme boundaries of your system's performance.
              </p>
            </div>
          </div>
        </div>
        
        <div className="xl:col-span-3 mt-2">
          {!result ? (
            <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 h-full flex flex-col items-center justify-center p-8 md:p-12 min-h-[500px]">
              <div className="p-4 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] mb-6 animate-bounce" style={{ animationDuration: '3s' }}>
                <Dices className="w-10 h-10 text-[#2563EB]" strokeWidth={2} />
              </div>
              <h3 className="text-xl font-extrabold text-[#121212] uppercase tracking-wide mb-3 text-center">Ready to Test Your Luck?</h3>
              <p className="text-[13px] font-medium text-[#717182] leading-relaxed text-center max-w-md">
                Click <strong>"Run Simulation"</strong> to visualize {config.simulations} possible outcomes of your next {config.futureTradesCount} trades. See if your strategy survives the stress test.
              </p>
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                  title="Median Outcome" 
                  value={formatUsd(result.medianEndingBalance)} 
                  icon={Activity} 
                  tooltip="The most realistic expectation. 50% of realities performed worse than this, and 50% performed better."
                />
                <MetricCard 
                  title="Best Case (Max)" 
                  value={formatUsd(result.bestEndingBalance)} 
                  icon={TrendingUp} 
                  valueColorClass="profit" 
                  tooltip="The absolute best reality simulated. A perfect storm of winning streaks."
                />
                <MetricCard 
                  title="Worst Case (Min)" 
                  value={formatUsd(result.worstEndingBalance)} 
                  icon={AlertTriangle} 
                  valueColorClass="loss" 
                  tooltip="The absolute worst reality simulated. A nightmare scenario of losing streaks."
                />
                <MetricCard 
                  title="Risk of Ruin (10% DD)" 
                  value={formatPercent(result.riskOfRuinPct)} 
                  icon={AlertTriangle} 
                  valueColorClass={result.riskOfRuinPct > 5 ? 'loss' : 'profit'} 
                  tooltip="Percentage of realities where your balance dropped 10% below the starting capital. Keep this below 5%."
                />
              </div>
              
              <div className="h-[300px] sm:h-[400px] w-full bg-[#F0F0F0] border-2 border-[#121212] p-2 sm:p-4 relative group">
                <SectionLabel label="Multiverse Projection Curves" shape="circle" color="dark" className="absolute top-4 left-4 z-10 hidden sm:flex" />
                
                {/* Chart Overlay for Education on hover */}
                <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white border-2 border-[#121212] p-2 shadow-[2px_2px_0px_0px_#121212] max-w-xs pointer-events-none hidden md:block">
                  <p className="text-[10px] font-bold text-[#121212] uppercase leading-tight">
                    Each faint line is one possible alternate reality. The thick line is the first simulated reality as an example.
                  </p>
                </div>

                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 50, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(18,18,18,0.1)" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#717182" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false}
                      minTickGap={30}
                      tickFormatter={(value) => value.replace('Trade ', 'T')} 
                    />
                    <YAxis 
                      stroke="#717182" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                      domain={['auto', 'auto']}
                      tickFormatter={(value) => formatCompactUsd(value)}
                    />
                    <Tooltip 
                      content={<PremiumTooltip formatMode="currency" />} 
                      cursor={{ stroke: 'rgba(18,18,18,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} 
                    />
                    {result.simulations.map((_: any, i: number) => (
                      <Line 
                        key={i} 
                        type="monotone" 
                        dataKey={`sim${i}`} 
                        stroke={`hsla(224, 85%, 40%, ${i === 0 ? 1 : 0.05})`} 
                        dot={false} 
                        strokeWidth={i === 0 ? 3 : 1} 
                        isAnimationActive={false} 
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Explanations Grid to interpret the results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t-2 border-dashed border-[#121212]/20">
                <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 flex gap-4 items-start hover:bg-white transition-colors cursor-default">
                  <div className="bg-white p-2 border-2 border-[#121212] shrink-0 shadow-[2px_2px_0px_0px_#121212]">
                    <Activity className="w-5 h-5 text-[#2563EB]" />
                  </div>
                  <div>
                    <h5 className="text-[13px] font-extrabold text-[#121212] uppercase tracking-wide mb-1">Interpreting the Median</h5>
                    <p className="text-[12px] font-medium text-[#717182] leading-relaxed">
                      Don't look at the best case—look at the <strong>Median Outcome</strong>. That is your baseline expectation. If your median is negative, your strategy has a negative expected value and will lose money over time regardless of luck.
                    </p>
                  </div>
                </div>

                <div className="bg-[#F0F0F0] border-2 border-[#121212] p-4 flex gap-4 items-start hover:bg-white transition-colors cursor-default">
                  <div className="bg-white p-2 border-2 border-[#121212] shrink-0 shadow-[2px_2px_0px_0px_#121212]">
                    <AlertTriangle className="w-5 h-5 text-[var(--loss)]" />
                  </div>
                  <div>
                    <h5 className="text-[13px] font-extrabold text-[#121212] uppercase tracking-wide mb-1">Risk of Ruin Warning</h5>
                    <p className="text-[12px] font-medium text-[#717182] leading-relaxed">
                      If your <strong>Risk of Ruin</strong> is high (e.g. {'>'} 5%), your risk per trade is too large for your win rate. You will likely blow your account during an inevitable random string of losses. <strong className="text-[var(--loss)]">Solution: Reduce position sizing.</strong>
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
