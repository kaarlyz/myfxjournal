import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, BarChart3, Camera, ChevronLeft, DollarSign, FileText, Image, Percent, ShieldAlert, Target, TrendingUp } from 'lucide-react';
import MetricCard from '../components/MetricCard';
import Mt5VerdictCard from '../components/Mt5VerdictCard';
import Mt5FindingsPanel from '../components/Mt5FindingsPanel';
import { Mt5DailyPnlChart, Mt5EquityCurve } from '../components/Mt5EquityCurve';
import Mt5DealsTable from '../components/Mt5DealsTable';
import JournalCalendar from '../components/JournalCalendar';
import { useJournalStore } from '../store/useJournalStore';
import { buildExportFilename, exportElementAsPng } from '../utils/exportImage';
import { formatNumber, formatPercent, formatUsd } from '../utils/formatters';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';
import { Button } from '../components/ui/Button';
import { SectionLabel } from '../components/ui/SectionLabel';

import RiskRecalculationTab from '../components/AnalyticsTabs/RiskRecalculationTab';
import RRLabTab from '../components/AnalyticsTabs/RRLabTab';
import TimingAnalyticsTab from '../components/AnalyticsTabs/TimingAnalyticsTab';
import StreaksTab from '../components/AnalyticsTabs/StreaksTab';
import PairBreakdownTab from '../components/AnalyticsTabs/PairBreakdownTab';

export default function MT5ReportDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeSessionId, sessions, selectSession, fetchSessions } = useJournalStore();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const summaryExportRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'RISK' | 'RR_LAB' | 'TIMING' | 'STREAKS' | 'PAIR'>('OVERVIEW');

  const sessionId = searchParams.get('sessionId') || activeSessionId;

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/mt5-reports/sessions/${sessionId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'MT5 report tidak ditemukan.');
        setData(body);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const summary = data?.summary;
  const finalBalance = (summary?.initialDeposit || 0) + (summary?.totalNetProfit || 0);
  const exportLabel = `${summary?.expertName || 'mt5'}-${summary?.symbol || 'report'}-${summary?.timeframe || ''}`;
  const plDistribution = useMemo(() => {
    const trades = data?.trades || [];
    return {
      best: [...trades].sort((a, b) => Number(b.netPnlUsd || 0) - Number(a.netPnlUsd || 0)).slice(0, 8),
      worst: [...trades].sort((a, b) => Number(a.netPnlUsd || 0) - Number(b.netPnlUsd || 0)).slice(0, 8),
    };
  }, [data]);
  const tradeBreakdown = useMemo(() => {
    const trades = data?.trades || [];
    const longTrades = trades.filter((t: any) => String(t.side || '').toUpperCase() === 'LONG');
    const shortTrades = trades.filter((t: any) => String(t.side || '').toUpperCase() === 'SHORT');
    const wins = trades.filter((t: any) => Number(t.netPnlUsd || 0) > 0);
    const losses = trades.filter((t: any) => Number(t.netPnlUsd || 0) < 0);
    const pnl = (rows: any[]) => rows.reduce((sum, t) => sum + Number(t.netPnlUsd || 0), 0);
    return {
      longCount: longTrades.length,
      shortCount: shortTrades.length,
      longPnl: pnl(longTrades),
      shortPnl: pnl(shortTrades),
      wins: wins.length,
      losses: losses.length,
      averageWin: wins.length ? pnl(wins) / wins.length : 0,
      averageLoss: losses.length ? pnl(losses) / losses.length : 0,
    };
  }, [data]);

  if (!sessionId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-[#121212] font-display uppercase tracking-tight">MT5 Report Analyzer</h1>
          <p className="text-[13px] font-bold text-[#717182] mt-1">Pilih sesi MT5 report atau import report baru.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.filter((s) => s.sourceMode === 'MT5_REPORT').map((s) => (
            <button key={s.id} onClick={() => { selectSession(s.id); navigate(`/mt5-report?sessionId=${s.id}`); }} className="bg-white border-2 border-[#121212] p-5 text-left hover:bg-[#F0F0F0] hover:-translate-y-1 transition-transform shadow-[4px_4px_0px_0px_#121212]">
              <h3 className="text-[15px] font-extrabold text-[#121212] uppercase tracking-wide">{s.name}</h3>
              <p className="text-[11px] font-bold text-[#717182] uppercase tracking-wider mt-2 bg-[#F0F0F0] inline-block px-2 py-0.5 border-2 border-[#121212]/10">{s.symbol} · {s.timeframe}</p>
            </button>
          ))}
        </div>
        <Button variant="blue" onClick={() => navigate('/mt5-import')}>Import MT5 Report</Button>
      </div>
    );
  }

  if (loading) return <div className="py-20 text-center text-[#121212] font-extrabold text-xl animate-pulse font-display uppercase tracking-widest">Memuat MT5 Report Analyzer...</div>;
  if (error) return <div className="bg-[var(--loss-dim)] border-2 border-[var(--loss)] p-6 text-[13px] font-bold text-[var(--loss)] shadow-[4px_4px_0px_0px_var(--loss)] flex items-center justify-between">{error} <Link to="/mt5-import" className="text-[#121212] font-extrabold hover:underline">Import report</Link></div>;
  if (!data) return null;

  const exportPng = async (type: 'dashboard' | 'summary') => {
    const ref = type === 'dashboard' ? exportRef : summaryExportRef;
    if (!ref.current) return;
    setExporting(type);
    try {
      await exportElementAsPng(ref.current, buildExportFilename(type === 'dashboard' ? 'mt5-dashboard' : 'mt5-summary', exportLabel), type === 'summary' ? 3 : 2);
    } catch (err) {
      alert('Export PNG gagal. Coba lagi.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6" ref={exportRef} id="mt5-report-export-root">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/sessions')} className="flex items-center gap-1 text-[11px] font-bold text-[#717182] hover:text-[#121212] uppercase tracking-wider mb-3 bg-[#F0F0F0] px-2 py-1 border-2 border-[#121212]/10 w-fit transition-colors">
            <ChevronLeft className="w-3 h-3" strokeWidth={3} /> Semua Sesi
          </button>
          <h1 className="text-3xl font-extrabold text-[#121212] font-display uppercase tracking-tight">MT5 Analyzer / EA Backtest Report</h1>
          <p className="text-[13px] font-bold text-[#717182] mt-2 bg-[#F0F0F0] px-3 py-1 border-2 border-[#121212]/10 inline-flex items-center gap-2">
            <span className="text-[#121212]">{summary?.expertName || '-'}</span> • <span>{summary?.symbol || '-'}</span> • <span>{summary?.timeframe || '-'}</span> • <span>{summary?.periodStart ? String(summary.periodStart).slice(0, 10) : '-'} {'->'} {summary?.periodEnd ? String(summary.periodEnd).slice(0, 10) : '-'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-export-hide>
          <PageGuide
            title="MT5 Report Analyzer"
            purpose="Analyzer ini menilai hasil Strategy Tester MT5 seperti laporan evaluasi EA: metrics, graph, findings, daily review, orders, deals, dan rebuilt trades."
            steps={[
              'Mulai dari Verdict dan score untuk melihat kelayakan live.',
              'Cek Net Profit, Profit Factor, Expected Payoff, dan Drawdown.',
              'Gunakan graph Balance/Equity untuk melihat stabilitas kurva.',
              'Baca Findings dan Indonesian Auto Analysis untuk tahu masalah utama.',
              'Export Summary PNG untuk share cepat atau PDF Report untuk arsip review.'
            ]}
            outputs={[
              'Dangerous/Weak berarti EA belum live-ready.',
              'Orders/Deals adalah data mentah MT5, Rebuilt Trades adalah pasangan IN/OUT yang dipakai dashboard.',
              'Deposit load menunjukkan tekanan margin saat backtest.'
            ]}
            warnings={[
              'Backtest pendek confidence-nya rendah meskipun metrik terlihat bagus.',
              'Graph CSV dan report XLSX dipisah agar graph sukses tidak membuat report palsu terlihat sukses.'
            ]}
            nextAction="Kalau verdict Dangerous/Weak, optimasi filter entry/risk dulu lalu test periode lebih panjang."
          />
          <Button variant="secondary" onClick={() => exportPng('summary')} disabled={!!exporting} className="inline-flex items-center gap-2 px-3 py-2 text-[10px]"><Image className="w-4 h-4" /> {exporting === 'summary' ? 'Exporting...' : 'Export Summary PNG'}</Button>
          <Button variant="secondary" onClick={() => exportPng('dashboard')} disabled={!!exporting} className="inline-flex items-center gap-2 px-3 py-2 text-[10px]"><Camera className="w-4 h-4" /> {exporting === 'dashboard' ? 'Exporting...' : 'Export Dashboard PNG'}</Button>
          <Button variant="secondary" onClick={() => window.open(`/reports/mt5/${sessionId}/print`, '_blank')} className="inline-flex items-center gap-2 px-3 py-2 text-[10px]"><FileText className="w-4 h-4" /> Preview PDF Report</Button>
          <Button variant="blue" onClick={() => navigate(`/dashboard?sessionId=${sessionId}`)} className="px-3 py-2 text-[10px]">Analysis Dashboard</Button>
          <Button variant="secondary" onClick={() => navigate(`/dashboard?sessionId=${sessionId}#calendar`)} className="px-3 py-2 text-[10px]">Journal Calendar</Button>
        </div>
      </div>

      <SummaryPngCard refEl={summaryExportRef} summary={summary} analysis={data.analysis} equityPoints={data.equityPoints || []} />
      <HelpCard title="PDF dan PNG export">
        PDF Report cocok untuk arsip dan evaluasi mendalam. Isinya multi-page agar mudah dibaca, bukan screenshot panjang dashboard. Summary PNG cocok untuk share cepat.
      </HelpCard>
      <ProfessionalVerdictPanel summary={summary} analysis={data.analysis} />
      <Mt5VerdictCard analysis={data.analysis} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard title="Net Profit" value={formatUsd(summary?.totalNetProfit)} icon={DollarSign} valueColorClass={summary?.totalNetProfit >= 0 ? 'green' : 'red'} />
        <MetricCard title="Final Balance" value={formatUsd(finalBalance)} icon={DollarSign} valueColorClass={finalBalance >= summary?.initialDeposit ? 'green' : 'red'} />
        <MetricCard title="Profit Factor" value={formatNumber(summary?.profitFactor, 4)} icon={Target} valueColorClass={summary?.profitFactor >= 1 ? 'green' : 'red'} />
        <MetricCard title="Expected Payoff" value={formatUsd(summary?.expectedPayoff)} icon={Activity} valueColorClass={summary?.expectedPayoff >= 0 ? 'green' : 'red'} />
        <MetricCard title="Recovery Factor" value={formatNumber(summary?.recoveryFactor, 2)} icon={TrendingUp} valueColorClass={summary?.recoveryFactor >= 0 ? 'green' : 'red'} />
        <MetricCard title="Sharpe Ratio" value={formatNumber(summary?.sharpeRatio, 2)} icon={Activity} valueColorClass={summary?.sharpeRatio >= 0 ? 'green' : 'red'} />
        <MetricCard title="Max Balance DD" value={formatPercent(summary?.balanceDrawdownPct)} subtitle={formatUsd(summary?.balanceDrawdownMax)} icon={ShieldAlert} valueColorClass={summary?.balanceDrawdownPct > 30 ? 'red' : 'yellow'} />
        <MetricCard title="Max Equity DD" value={formatPercent(summary?.equityDrawdownPct)} subtitle={formatUsd(summary?.equityDrawdownMax)} icon={ShieldAlert} valueColorClass={summary?.equityDrawdownPct > 30 ? 'red' : 'yellow'} />
        <MetricCard title="Winrate" value={formatPercent(summary?.winrate)} icon={Percent} />
        <MetricCard title="Total Trades" value={summary?.totalTrades || 0} icon={BarChart3} />
        <MetricCard title="Profit Trades" value={summary?.profitTrades || 0} subtitle={formatPercent(summary?.winrate)} icon={TrendingUp} valueColorClass="green" />
        <MetricCard title="Loss Trades" value={summary?.lossTrades || 0} icon={ShieldAlert} valueColorClass="red" />
        <MetricCard title="Long Winrate" value={formatPercent(summary?.longWinrate)} subtitle={`${summary?.longTrades || 0} trades`} icon={TrendingUp} />
        <MetricCard title="Short Winrate" value={formatPercent(summary?.shortWinrate)} subtitle={`${summary?.shortTrades || 0} trades`} icon={Activity} valueColorClass={(summary?.shortWinrate || 0) < 25 ? 'red' : undefined} />
        <MetricCard title="Deals / Orders" value={`${data.deals?.length || 0} / ${data.orders?.length || 0}`} icon={BarChart3} />
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex overflow-x-auto border-b-4 border-[#121212] mt-8 mb-6 pb-2 scrollbar-hide gap-2">
        {(['OVERVIEW', 'RISK', 'RR_LAB', 'TIMING', 'STREAKS', 'PAIR'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-2 text-[12px] font-extrabold uppercase tracking-widest transition-all ${
              activeTab === tab 
                ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#1040C0]' 
                : 'bg-white text-[#717182] border-2 border-[#121212] hover:bg-[#F0F0F0] shadow-[2px_2px_0px_0px_#121212]'
            }`}
          >
            {tab === 'OVERVIEW' && 'Overview'}
            {tab === 'RISK' && 'Risk Recalculation'}
            {tab === 'RR_LAB' && 'RR Lab'}
            {tab === 'TIMING' && 'Timing Analytics'}
            {tab === 'STREAKS' && 'Streaks'}
            {tab === 'PAIR' && 'Pair Breakdown'}
          </button>
        ))}
      </div>

      {activeTab === 'RISK' && (
        <div className="animate-fade-in"><RiskRecalculationTab sessionId={sessionId!} session={data.session || {}} metrics={data.metrics} trades={data.trades || []} /></div>
      )}
      
      {activeTab === 'RR_LAB' && (
        <div className="animate-fade-in"><RRLabTab metrics={data.metrics} trades={data.trades || []} sessionId="" /></div>
      )}
      
      {activeTab === 'TIMING' && (
        <div className="animate-fade-in"><TimingAnalyticsTab metrics={data.metrics} trades={data.trades || []} /></div>
      )}
      
      {activeTab === 'STREAKS' && (
        <div className="animate-fade-in"><StreaksTab metrics={data.metrics} trades={data.trades || []} /></div>
      )}
      
      {activeTab === 'PAIR' && (
        <div className="animate-fade-in"><PairBreakdownTab metrics={data.metrics} /></div>
      )}

      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <BreakdownCard title="Long vs Short Performance" rows={[
              ['Long trades', tradeBreakdown.longCount],
              ['Long PnL', formatUsd(tradeBreakdown.longPnl)],
              ['Short trades', tradeBreakdown.shortCount],
              ['Short PnL', formatUsd(tradeBreakdown.shortPnl)],
            ]} />
            <BreakdownCard title="Profit/Loss Distribution" rows={[
              ['Winning trades', tradeBreakdown.wins],
              ['Losing trades', tradeBreakdown.losses],
              ['Average win', formatUsd(tradeBreakdown.averageWin)],
              ['Average loss', formatUsd(tradeBreakdown.averageLoss)],
            ]} />
            <BreakdownCard title="Backtest Range" rows={[
              ['EA', summary?.expertName || '-'],
              ['Symbol', summary?.symbol || '-'],
              ['Timeframe', summary?.timeframe || '-'],
              ['Period', `${summary?.periodStart ? String(summary.periodStart).slice(0, 10) : '-'} -> ${summary?.periodEnd ? String(summary.periodEnd).slice(0, 10) : '-'}`],
            ]} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <Mt5EquityCurve points={data.equityPoints || []} />
              <Mt5DailyPnlChart daily={data.analysis?.dailyReview || []} />
            </div>
            <div className="space-y-6">
              <SectionLabel label="Mistake Detector" shape="diamond" color="red" />
              <Mt5FindingsPanel findings={data.analysis?.findings || []} />
            </div>
          </div>
        </div>
      )}

      <JournalCalendar
        mode="BACKTEST"
        title="MT5 Journal Calendar"
        trades={data.trades || []}
        currency={summary?.currency || 'USD'}
        storageKey="replayfx:showMt5Calendar"
        defaultCollapsed={false}
        contextType="BACKTEST_SESSION"
        contextId={sessionId}
      />

      <div className="bg-white border-2 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212] space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-full bg-[#1040C0] opacity-10 transform skew-x-12" />
        <SectionLabel label="Auto Analysis" shape="square" color="blue" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
          {Object.entries(data.analysis?.sections || {}).map(([key, value]) => (
            <div key={key} className="bg-[#F0F0F0] border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
              <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-[#1040C0] mb-3 bg-white px-3 py-1 inline-block border-2 border-[#121212]">{key.replace(/([A-Z])/g, ' $1')}</h3>
              <p className="text-[13px] font-bold text-[#121212] leading-relaxed">{String(value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <KeyValueTable title="Settings / EA Inputs" rows={data.raw?.settings || {}} />
        <KeyValueTable title="Results Summary Table" rows={data.raw?.results || {}} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TradeList title="Best Trades" rows={plDistribution.best} />
        <TradeList title="Worst Trades" rows={plDistribution.worst} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ReviewTable title="Daily Review" rows={data.analysis?.dailyReview || []} />
        <WeeklyTable rows={data.analysis?.weeklyReview || []} />
      </div>

      <RebuiltTradesTable rows={data.trades || []} />
      <Mt5DealsTable deals={data.deals || []} />
      <OrdersTable rows={data.orders || []} />
    </div>
  );
}

function ProfessionalVerdictPanel({ summary, analysis }: { summary: any; analysis: any }) {
  const pf = Number(summary?.profitFactor || 0);
  const net = Number(summary?.totalNetProfit || 0);
  const expected = Number(summary?.expectedPayoff || 0);
  const equityDd = Number(summary?.equityDrawdownPct || 0);
  const winrate = Number(summary?.winrate || 0);
  const label = net < 0 || equityDd > 45 ? 'Dangerous / Not Live Ready' : pf < 1 || expected < 0 ? 'Weak' : 'Promising';
  const score = analysis?.rating?.score ?? (net < 0 || pf < 1 ? 0 : 60);
  const bullets = [
    net < 0 ? 'Net profit negatif, sehingga equity curve belum membuktikan edge.' : 'Net profit positif.',
    pf < 1 ? `Profit factor ${formatNumber(pf, 2)} berarti setiap $1 loss hanya dibalas sekitar $${formatNumber(pf, 2)} profit.` : `Profit factor ${formatNumber(pf, 2)} di atas 1.`,
    expected < 0 ? `Expected payoff ${formatUsd(expected)} masih negatif.` : `Expected payoff ${formatUsd(expected)} positif.`,
    equityDd > 45 ? `Equity drawdown ${formatPercent(equityDd)} hampir 50%, terlalu besar untuk live.` : `Equity drawdown ${formatPercent(equityDd)}.`,
    winrate < 40 && pf < 1 ? `Winrate ${formatPercent(winrate)} dengan PF < 1 menunjukkan kualitas entry belum cukup.` : `Winrate ${formatPercent(winrate)}.`,
  ];

  return (
    <div className="bg-[var(--loss-dim)] border-4 border-[var(--loss)] p-6 shadow-[8px_8px_0px_0px_var(--loss)] relative">
      <div className="absolute top-0 right-0 p-4 border-l-4 border-b-4 border-[var(--loss)] bg-white text-center shadow-[-4px_4px_0px_0px_var(--loss)]">
        <div className="text-[10px] text-[var(--loss)] uppercase font-extrabold tracking-widest mb-1">Score</div>
        <div className="text-3xl font-black text-[#121212] font-display">{score}/100</div>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pr-32">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#121212] bg-white px-2 py-0.5 inline-block border-2 border-[#121212] mb-3">EA Evaluation Verdict</p>
          <h2 className="text-3xl font-black text-[#121212] font-display uppercase tracking-tight leading-none">{label}</h2>
          <p className="text-[14px] font-bold text-[#121212] leading-relaxed mt-4 max-w-4xl">
            EA ini belum layak dipakai live. Net profit negatif, profit factor di bawah 1, expected payoff negatif,
            dan drawdown equity hampir 50%.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mt-6">
        {bullets.map((bullet) => (
          <div key={bullet} className="bg-white border-2 border-[var(--loss)] p-4 text-[12px] font-bold text-[#121212] shadow-[2px_2px_0px_0px_var(--loss)] leading-snug">
            {bullet}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryPngCard({ refEl, summary, analysis, equityPoints }: { refEl: React.RefObject<HTMLDivElement>; summary: any; analysis: any; equityPoints: any[] }) {
  const values = (equityPoints || []).map((p) => Number(p.equity ?? p.balance ?? 0));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = 60 + (index / Math.max(1, values.length - 1)) * 1040;
    const y = 520 - ((value - min) / range) * 220;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="fixed -left-[9999px] top-0" aria-hidden="true">
      <div ref={refEl} className="w-[1200px] h-[675px] bg-[#FFFFFF] text-[#121212] p-12 border-8 border-[#121212] font-sans">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex bg-[#1040C0] text-white border-4 border-[#121212] rounded-none px-4 py-2 text-sm font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_#121212]">KAFX Journal</div>
            <h1 className="text-5xl font-black mt-6 font-display uppercase tracking-tight">MT5 Backtest Report</h1>
            <p className="text-[#717182] font-bold mt-3 text-lg bg-[#F0F0F0] inline-block px-4 py-1 border-2 border-[#121212]">{summary?.expertName || '-'} · {summary?.symbol || '-'} · {summary?.timeframe || '-'}</p>
          </div>
          <div className="text-right border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] bg-[#F0F0F0]">
            <div className="text-sm font-bold text-[#717182] uppercase tracking-widest mb-1">Verdict</div>
            <div className="text-5xl font-black text-[var(--loss)] font-display">{analysis?.rating?.label || 'N/A'}</div>
            <div className="text-2xl font-black text-[#121212] mt-2 bg-white inline-block px-3 py-1 border-2 border-[#121212]">{analysis?.rating?.score ?? 'N/A'}/100</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-6 mt-10">
          <SummaryMetric label="Net Profit" value={formatUsd(summary?.totalNetProfit)} danger />
          <SummaryMetric label="Profit Factor" value={formatNumber(summary?.profitFactor, 4)} danger />
          <SummaryMetric label="Winrate" value={formatPercent(summary?.winrate)} />
          <SummaryMetric label="Max Equity DD" value={formatPercent(summary?.equityDrawdownPct)} danger />
        </div>
        <svg className="mt-10 w-full h-64 bg-[#F0F0F0] border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212]" viewBox="0 0 1200 280">
          <text x="60" y="38" fill="#121212" fontSize="16" fontWeight="bold" fontFamily="Outfit">MINI EQUITY CURVE</text>
          {points && <polyline points={points} fill="none" stroke="#1040C0" strokeWidth="6" />}
          <text x="60" y="258" fill="#717182" fontSize="14" fontWeight="bold" fontFamily="Outfit">GENERATED {new Date().toISOString().slice(0, 10)}</text>
        </svg>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, danger }: { label: string; value: any; danger?: boolean }) {
  return (
    <div className="bg-white border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
      <div className="text-xs font-bold uppercase tracking-widest text-[#717182]">{label}</div>
      <div className={`text-3xl font-black mt-3 font-number ${danger ? 'text-[var(--loss)]' : 'text-[#121212]'}`}>{value}</div>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<[string, any]> }) {
  return (
    <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
      <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide mb-4 border-b-2 border-[#121212] pb-2">{title}</h3>
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-[12px] font-bold">
            <span className="text-[#717182] uppercase tracking-wider">{label}</span>
            <span className="text-[#121212] text-right bg-[#F0F0F0] px-2 py-0.5 border border-[#121212]/10">{value ?? '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyValueTable({ title, rows }: { title: string; rows: Record<string, any> }) {
  const entries = Object.entries(rows || {}).filter(([, value]) => value !== null && value !== undefined && String(value) !== '');
  return (
    <div className="bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b-4 border-[#121212] bg-[#F0F0F0]">
        <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide">{title}</h3>
      </div>
      <div className="max-h-96 overflow-auto bg-white p-2 flex-1">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-2 gap-4 px-4 py-3 border-b-2 border-dashed border-[#121212]/10 text-[12px] font-bold hover:bg-[#F0F0F0] transition-colors">
            <span className="text-[#717182] uppercase tracking-wider">{key}</span>
            <span className="text-[#121212] break-words">{String(value)}</span>
          </div>
        ))}
        {!entries.length && <div className="p-6 text-center text-[11px] font-bold text-[#717182] uppercase tracking-widest bg-[#F0F0F0]">No rows parsed.</div>}
      </div>
    </div>
  );
}

function OrdersTable({ rows }: { rows: any[] }) {
  const visibleRows = (rows || []).slice(0, 250);
  return (
    <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] mt-6 mb-6 overflow-hidden relative pt-12">
      <div className="absolute top-0 left-0 right-0 h-[4px] bg-[#121212]" />
      <SectionLabel label="MT5 Raw Orders" shape="square" color="blue" className="absolute top-4 left-4" />
      <div className="absolute top-4 right-4 bg-[#F0F0F0] border-2 border-[#121212] px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
        {rows?.length || 0} rows
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {['Time', 'Order', 'Symbol', 'Type', 'Volume', 'Price', 'SL', 'TP', 'State', 'Comment'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((o) => (
              <tr key={o.id || o.orderId} className="hover:bg-[#F0F0F0] transition-colors">
                <td className="text-[11px] font-bold text-[#717182] uppercase tracking-wider whitespace-nowrap">{String(o.openTime || '').slice(0, 16) || '-'}</td>
                <td className="font-extrabold text-[#121212] font-display text-[13px]">{o.orderId || '-'}</td>
                <td className="font-extrabold text-[#121212]">{o.symbol || '-'}</td>
                <td className="text-[11px] font-bold text-[#121212] uppercase tracking-wider">{o.type || '-'}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(o.volume, 2)}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(o.price, 2)}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(o.sl, 2)}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(o.tp, 2)}</td>
                <td className="text-[11px] font-bold text-[#121212] uppercase tracking-wider bg-[#F0F0F0] px-1 border border-[#121212]/20">{o.state || '-'}</td>
                <td className="text-[12px] text-[#717182] font-semibold max-w-xs truncate">{o.comment || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradeList({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] overflow-hidden">
      <div className="px-5 py-4 border-b-4 border-[#121212] bg-[#F0F0F0]">
        <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-2 space-y-2">
        {rows.map((t) => (
          <div key={t.id} className="px-4 py-3 border-2 border-[#121212] flex justify-between items-center text-[12px] font-bold shadow-[2px_2px_0px_0px_#121212] bg-white">
            <span className="text-[#121212] bg-[#F0F0F0] px-2 py-1 uppercase tracking-wider">{String(t.exitTime || '').slice(0, 16)} · <span className={t.side === 'LONG' || t.side === 'BUY' ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}>{t.side}</span></span>
            <span className={`font-number font-extrabold text-[14px] px-2 py-1 ${Number(t.netPnlUsd || 0) >= 0 ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : 'bg-[var(--loss-dim)] text-[var(--loss)]'}`}>{formatUsd(t.netPnlUsd)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RebuiltTradesTable({ rows }: { rows: any[] }) {
  const [filter, setFilter] = useState<'ALL' | 'BEST' | 'WORST' | 'WIN' | 'LOSS' | 'LONG' | 'SHORT' | 'DAY'>('ALL');
  const filteredRows = useMemo(() => {
    const safeRows = rows || [];
    if (filter === 'BEST') return [...safeRows].sort((a, b) => Number(b.netPnlUsd || 0) - Number(a.netPnlUsd || 0)).slice(0, 10);
    if (filter === 'WORST') return [...safeRows].sort((a, b) => Number(a.netPnlUsd || 0) - Number(b.netPnlUsd || 0)).slice(0, 10);
    if (filter === 'WIN') return safeRows.filter((t) => Number(t.netPnlUsd || 0) > 0);
    if (filter === 'LOSS') return safeRows.filter((t) => Number(t.netPnlUsd || 0) < 0);
    if (filter === 'LONG') return safeRows.filter((t) => String(t.side || '').toUpperCase() === 'LONG');
    if (filter === 'SHORT') return safeRows.filter((t) => String(t.side || '').toUpperCase() === 'SHORT');
    return safeRows;
  }, [filter, rows]);
  const visibleRows = filteredRows.slice(0, 250);
  const visiblePnl = filteredRows.reduce((sum, t) => sum + Number(t.netPnlUsd || 0), 0);
  const byDay = useMemo(() => {
    return filteredRows.reduce<Record<string, { count: number; pnl: number; wins: number; losses: number }>>((acc, trade) => {
      const key = String(trade.exitTime || trade.closeTime || trade.entryTime || '').slice(0, 10) || 'Unknown';
      if (!acc[key]) acc[key] = { count: 0, pnl: 0, wins: 0, losses: 0 };
      const pnl = Number(trade.netPnlUsd || 0);
      acc[key].count += 1;
      acc[key].pnl += pnl;
      if (pnl > 0) acc[key].wins += 1;
      if (pnl < 0) acc[key].losses += 1;
      return acc;
    }, {});
  }, [filteredRows]);
  return (
    <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] mt-6 mb-6 overflow-hidden relative pt-4">
      <div className="absolute top-0 left-0 right-0 h-[4px] bg-[var(--profit)]" />
      <div className="px-5 py-4 border-b-4 border-[#121212] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel label="Rebuilt Trades Ledger" shape="diamond" color="yellow" />
          <span className="text-[11px] font-bold text-[#121212] uppercase tracking-widest bg-[#F0F0F0] px-3 py-1.5 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]">
            Showing {filteredRows.length} of {rows?.length || 0} trades · {filter} · visible PnL <span className={visiblePnl >= 0 ? 'text-[var(--profit)] font-number text-[13px] ml-1' : 'text-[var(--loss)] font-number text-[13px] ml-1'}>{formatUsd(visiblePnl)}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2 pt-2" data-export-hide>
          {(['ALL', 'BEST', 'WORST', 'WIN', 'LOSS', 'LONG', 'SHORT', 'DAY'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] transition-colors active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${filter === item ? 'bg-[#121212] text-white' : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'}`}
            >
              {item === 'DAY' ? 'Group by day' : item}
            </button>
          ))}
        </div>
      </div>
      {filter === 'DAY' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-5 bg-[#F0F0F0] border-b-4 border-[#121212]">
          {Object.entries(byDay).map(([day, stat]) => (
            <div key={day} className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
              <div className="font-extrabold text-[#121212] text-[13px] uppercase tracking-wide border-b-2 border-[#121212] pb-2 mb-2">{day}</div>
              <div className={`text-[16px] font-black font-number mb-2 ${stat.pnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>{formatUsd(stat.pnl)}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#717182] bg-[#F0F0F0] inline-block px-2 py-1 border border-[#121212]/10">{stat.count} TR · W{stat.wins}/L{stat.losses}</div>
            </div>
          ))}
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {['#', 'Entry', 'Exit', 'Side', 'Entry Price', 'Exit Price', 'Volume', 'PnL', 'R', 'Notes'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((t) => (
              <tr key={t.id || t.tradeId || t.tradeNumber} className="hover:bg-[#F0F0F0] transition-colors">
                <td className="font-extrabold text-[#121212] font-display text-[13px]">#{t.tradeNumber || '-'}</td>
                <td className="text-[11px] font-bold text-[#717182] uppercase tracking-wider whitespace-nowrap">{String(t.entryTime || '').slice(0, 16) || '-'}</td>
                <td className="text-[11px] font-bold text-[#717182] uppercase tracking-wider whitespace-nowrap">{String(t.exitTime || '').slice(0, 16) || '-'}</td>
                <td className="text-[11px] font-bold text-[#121212] uppercase tracking-wider">
                   <span className={`px-2 py-0.5 border-2 border-[#121212] ${t.side === 'LONG' || t.side === 'BUY' ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : 'bg-[var(--loss-dim)] text-[var(--loss)]'}`}>
                     {t.side || '-'}
                   </span>
                </td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(t.entryPrice, 2)}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(t.exitPrice, 2)}</td>
                <td className="font-bold text-[#121212] font-number">{formatNumber(t.qty, 2)}</td>
                <td className={`font-extrabold font-number text-[13px] ${Number(t.netPnlUsd || 0) >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>{formatUsd(t.netPnlUsd)}</td>
                <td className="font-bold text-[#121212] font-number">{t.rMultiple !== null && t.rMultiple !== undefined ? formatNumber(t.rMultiple, 2) : '-'}</td>
                <td className="text-[12px] text-[#717182] font-semibold max-w-sm truncate">{t.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(rows?.length || 0) > visibleRows.length && (
        <div className="px-5 py-4 bg-[#F0F0F0] border-t-4 border-[#121212] text-[11px] font-bold text-[#717182] uppercase tracking-wider text-center">
          Menampilkan 250 trade pertama.
        </div>
      )}
    </div>
  );
}

function ReviewTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] overflow-hidden">
      <div className="px-5 py-4 border-b-4 border-[#121212] bg-[#F0F0F0]">
        <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide">{title}</h3>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.date} className="px-5 py-4 border-b-2 border-dashed border-[#121212]/10 grid grid-cols-4 gap-4 text-[12px] font-bold items-center hover:bg-[#F0F0F0] transition-colors">
            <span className="text-[#121212] uppercase tracking-widest">{r.date}</span>
            <span className={`font-number text-[14px] px-2 py-1 inline-block text-center ${r.dailyNetChange >= 0 ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : 'bg-[var(--loss-dim)] text-[var(--loss)]'}`}>{formatUsd(r.dailyNetChange)}</span>
            <span className="text-[#717182] uppercase tracking-widest">{r.tradeCount} TR</span>
            <span className="text-[#121212] bg-white border border-[#121212]/10 p-1 px-2 truncate max-w-[150px]" title={r.comment}>{r.comment}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyTable({ rows }: { rows: any[] }) {
  return (
    <div className="bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] overflow-hidden">
      <div className="px-5 py-4 border-b-4 border-[#121212] bg-[#F0F0F0]">
        <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide">Weekly Review</h3>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.week} className="px-5 py-4 border-b-2 border-dashed border-[#121212]/10 text-[12px] font-bold space-y-3 hover:bg-[#F0F0F0] transition-colors">
            <div className="flex justify-between items-center">
              <span className="text-[#121212] uppercase tracking-widest text-[13px]">{r.week}</span>
              <span className={`font-number text-[15px] font-black px-2 py-0.5 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] ${r.totalPnl >= 0 ? 'bg-[var(--profit)] text-white' : 'bg-[var(--loss)] text-white'}`}>{formatUsd(r.totalPnl)}</span>
            </div>
            <div className="text-[10px] font-bold text-[#717182] uppercase tracking-wider bg-white border-2 border-[#121212]/10 p-2 flex items-center justify-between">
              <span>Best: <span className="text-[#121212]">{r.bestDay || '-'}</span></span>
              <span>Worst: <span className="text-[#121212]">{r.worstDay || '-'}</span></span>
              <span>Avg: <span className="text-[#121212]">{formatUsd(r.averageDailyPnl)}</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
