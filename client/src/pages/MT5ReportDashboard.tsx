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
          <h1 className="text-2xl font-bold text-white">MT5 Report Analyzer</h1>
          <p className="text-xs text-[#707a8a] mt-1">Pilih sesi MT5 report atau import report baru.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.filter((s) => s.sourceMode === 'MT5_REPORT').map((s) => (
            <button key={s.id} onClick={() => { selectSession(s.id); navigate(`/mt5-report?sessionId=${s.id}`); }} className="bn-card p-4 text-left hover:border-[#fcd535]">
              <h3 className="text-sm font-bold text-white">{s.name}</h3>
              <p className="text-xs text-[#707a8a] mt-1">{s.symbol} · {s.timeframe}</p>
            </button>
          ))}
        </div>
        <Link to="/mt5-import" className="btn-primary inline-flex">Import MT5 Report</Link>
      </div>
    );
  }

  if (loading) return <div className="py-20 text-center text-[#707a8a]">Memuat MT5 Report Analyzer...</div>;
  if (error) return <div className="bn-card p-6 text-[#f6465d]">{error} <Link to="/mt5-import" className="text-[#fcd535] ml-2">Import report</Link></div>;
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/sessions')} className="flex items-center gap-1 text-xs text-[#707a8a] hover:text-[#fcd535] mb-2">
            <ChevronLeft className="w-4 h-4" /> Semua Sesi
          </button>
          <h1 className="text-2xl font-bold text-white">MT5 Report Analyzer / EA Backtest Report</h1>
          <p className="text-xs text-[#707a8a] mt-1">
            {summary?.expertName || '-'} · {summary?.symbol || '-'} · {summary?.timeframe || '-'} · {summary?.periodStart ? String(summary.periodStart).slice(0, 10) : '-'} {'->'} {summary?.periodEnd ? String(summary.periodEnd).slice(0, 10) : '-'}
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
          <button onClick={() => exportPng('summary')} disabled={!!exporting} className="btn-secondary inline-flex items-center gap-2"><Image className="w-4 h-4" /> {exporting === 'summary' ? 'Exporting...' : 'Export Summary PNG'}</button>
          <button onClick={() => exportPng('dashboard')} disabled={!!exporting} className="btn-secondary inline-flex items-center gap-2"><Camera className="w-4 h-4" /> {exporting === 'dashboard' ? 'Exporting...' : 'Export Dashboard PNG'}</button>
          <button onClick={() => window.open(`/reports/mt5/${sessionId}/print`, '_blank')} className="btn-secondary inline-flex items-center gap-2"><FileText className="w-4 h-4" /> Preview PDF Report</button>
          <button onClick={() => navigate(`/dashboard?sessionId=${sessionId}`)} className="btn-secondary">Analysis Dashboard</button>
          <button onClick={() => navigate(`/dashboard?sessionId=${sessionId}#calendar`)} className="btn-secondary">Journal Calendar</button>
          <button onClick={() => navigate('/mt5-import')} className="btn-primary">Import Another</button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <Mt5EquityCurve points={data.equityPoints || []} />
          <Mt5DailyPnlChart daily={data.analysis?.dailyReview || []} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Mistake Detector</h2>
          <Mt5FindingsPanel findings={data.analysis?.findings || []} />
        </div>
      </div>

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

      <div className="bn-card p-5 space-y-4">
        <h2 className="text-lg font-bold text-white">Auto Analysis</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(data.analysis?.sections || {}).map(([key, value]) => (
            <div key={key} className="bg-[#181a20] border border-[#2b3139] rounded-lg p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#fcd535] mb-2">{key.replace(/([A-Z])/g, ' $1')}</h3>
              <p className="text-sm text-[#eaecef] leading-6">{String(value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <KeyValueTable title="Settings / EA Inputs" rows={data.raw?.settings || {}} />
        <KeyValueTable title="Results Summary Table" rows={data.raw?.results || {}} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TradeList title="Best Trades" rows={plDistribution.best} />
        <TradeList title="Worst Trades" rows={plDistribution.worst} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
    <div className="bn-card p-5 border border-[rgba(246,70,93,0.35)] bg-[rgba(246,70,93,0.04)]">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#f6465d]">EA Evaluation Verdict</p>
          <h2 className="text-2xl font-bold text-white mt-1">{label}</h2>
          <p className="text-sm text-[#eaecef] leading-6 mt-2 max-w-4xl">
            EA ini belum layak dipakai live. Net profit negatif, profit factor di bawah 1, expected payoff negatif,
            dan drawdown equity hampir 50%.
          </p>
        </div>
        <div className="rounded-xl border border-[#2b3139] bg-[#181a20] p-4 min-w-36 text-center">
          <div className="text-[10px] text-[#707a8a] uppercase font-bold">Score</div>
          <div className="text-3xl font-black text-[#f6465d]">{score}/100</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 mt-4">
        {bullets.map((bullet) => (
          <div key={bullet} className="rounded-lg border border-[#2b3139] bg-[#181a20] p-3 text-xs text-[#c7ccd4] leading-5">
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
      <div ref={refEl} className="w-[1200px] h-[675px] bg-[#0b0e11] text-white p-12 border border-[#2b3139]">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex bg-[#fcd535] text-[#181a20] rounded-lg px-4 py-2 text-sm font-black">ReplayFX Journal</div>
            <h1 className="text-4xl font-black mt-5">MT5 Backtest Report</h1>
            <p className="text-[#929aa5] mt-2">{summary?.expertName || '-'} · {summary?.symbol || '-'} · {summary?.timeframe || '-'}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-[#707a8a]">Verdict</div>
            <div className="text-4xl font-black text-[#f6465d]">{analysis?.rating?.label || 'N/A'}</div>
            <div className="text-[#929aa5]">{analysis?.rating?.score ?? 'N/A'}/100</div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-10">
          <SummaryMetric label="Net Profit" value={formatUsd(summary?.totalNetProfit)} danger />
          <SummaryMetric label="Profit Factor" value={formatNumber(summary?.profitFactor, 4)} danger />
          <SummaryMetric label="Winrate" value={formatPercent(summary?.winrate)} />
          <SummaryMetric label="Max Equity DD" value={formatPercent(summary?.equityDrawdownPct)} danger />
        </div>
        <svg className="mt-10 w-full h-64 rounded-xl bg-[#181a20] border border-[#2b3139]" viewBox="0 0 1200 280">
          <text x="60" y="38" fill="#929aa5" fontSize="16">Mini equity curve</text>
          {points && <polyline points={points} fill="none" stroke="#fcd535" strokeWidth="4" />}
          <text x="60" y="258" fill="#707a8a" fontSize="14">Generated {new Date().toISOString().slice(0, 10)}</text>
        </svg>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, danger }: { label: string; value: any; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-[#181a20] border border-[#2b3139] p-5">
      <div className="text-xs uppercase tracking-widest text-[#707a8a]">{label}</div>
      <div className={`text-2xl font-black mt-2 ${danger ? 'text-[#f6465d]' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<[string, any]> }) {
  return (
    <div className="bn-card p-4">
      <h3 className="text-sm font-bold text-white mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-[#2b3139] pb-2 text-xs">
            <span className="text-[#929aa5]">{label}</span>
            <span className="font-semibold text-white text-right">{value ?? '-'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyValueTable({ title, rows }: { title: string; rows: Record<string, any> }) {
  const entries = Object.entries(rows || {}).filter(([, value]) => value !== null && value !== undefined && String(value) !== '');
  return (
    <div className="bn-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2b3139] text-sm font-bold text-white">{title}</div>
      <div className="max-h-96 overflow-auto">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-2 gap-3 px-4 py-2 border-b border-[#2b3139] text-xs">
            <span className="text-[#929aa5]">{key}</span>
            <span className="text-[#eaecef] break-words">{String(value)}</span>
          </div>
        ))}
        {!entries.length && <div className="p-4 text-xs text-[#707a8a]">No rows parsed.</div>}
      </div>
    </div>
  );
}

function OrdersTable({ rows }: { rows: any[] }) {
  const visibleRows = (rows || []).slice(0, 250);
  return (
    <div className="bn-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2b3139] flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Orders</h3>
        <span className="text-xs text-[#707a8a]">{rows?.length || 0} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#181a20] text-[#707a8a]">
            <tr>
              {['Time', 'Order', 'Symbol', 'Type', 'Volume', 'Price', 'SL', 'TP', 'State', 'Comment'].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((o) => (
              <tr key={o.id || o.orderId} className="border-t border-[#2b3139] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-[#929aa5] whitespace-nowrap">{String(o.openTime || '').slice(0, 16) || '-'}</td>
                <td className="px-3 py-2 text-white">{o.orderId || '-'}</td>
                <td className="px-3 py-2">{o.symbol || '-'}</td>
                <td className="px-3 py-2">{o.type || '-'}</td>
                <td className="px-3 py-2 font-number">{formatNumber(o.volume, 2)}</td>
                <td className="px-3 py-2 font-number">{formatNumber(o.price, 2)}</td>
                <td className="px-3 py-2 font-number">{formatNumber(o.sl, 2)}</td>
                <td className="px-3 py-2 font-number">{formatNumber(o.tp, 2)}</td>
                <td className="px-3 py-2">{o.state || '-'}</td>
                <td className="px-3 py-2 max-w-xs truncate text-[#707a8a]">{o.comment || '-'}</td>
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
    <div className="bn-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2b3139] text-sm font-bold text-white">{title}</div>
      {rows.map((t) => (
        <div key={t.id} className="px-4 py-2 border-b border-[#2b3139] flex justify-between text-xs">
          <span className="text-[#929aa5]">{String(t.exitTime || '').slice(0, 16)} · {t.side}</span>
          <span className="font-number font-bold" style={{ color: Number(t.netPnlUsd || 0) >= 0 ? '#0ecb81' : '#f6465d' }}>{formatUsd(t.netPnlUsd)}</span>
        </div>
      ))}
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
    <div className="bn-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2b3139] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white">Rebuilt Trades Ledger</h3>
          <span className="text-xs text-[#707a8a]">
            Showing {filteredRows.length} of {rows?.length || 0} trades · {filter} · visible PnL <span className={visiblePnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{formatUsd(visiblePnl)}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2" data-export-hide>
          {(['ALL', 'BEST', 'WORST', 'WIN', 'LOSS', 'LONG', 'SHORT', 'DAY'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${filter === item ? 'bg-[#fcd535] text-[#181a20]' : 'bg-[#2b3139] text-[#929aa5] hover:text-white'}`}
            >
              {item === 'DAY' ? 'Group by day' : item}
            </button>
          ))}
        </div>
      </div>
      {filter === 'DAY' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 p-4 border-b border-[#2b3139]">
          {Object.entries(byDay).map(([day, stat]) => (
            <div key={day} className="rounded-lg border border-[#2b3139] bg-[#181a20] p-3 text-xs">
              <div className="font-bold text-white">{day}</div>
              <div className={stat.pnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{formatUsd(stat.pnl)}</div>
              <div className="text-[#707a8a]">{stat.count} trades · W{stat.wins}/L{stat.losses}</div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#181a20] text-[#707a8a]">
            <tr>
              {['#', 'Entry', 'Exit', 'Side', 'Entry Price', 'Exit Price', 'Volume', 'PnL', 'R', 'Notes'].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((t) => (
              <tr key={t.id || t.tradeId || t.tradeNumber} className="border-t border-[#2b3139] hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-white">{t.tradeNumber || '-'}</td>
                <td className="px-3 py-2 text-[#929aa5] whitespace-nowrap">{String(t.entryTime || '').slice(0, 16) || '-'}</td>
                <td className="px-3 py-2 text-[#929aa5] whitespace-nowrap">{String(t.exitTime || '').slice(0, 16) || '-'}</td>
                <td className="px-3 py-2">{t.side || '-'}</td>
                <td className="px-3 py-2 font-number">{formatNumber(t.entryPrice, 2)}</td>
                <td className="px-3 py-2 font-number">{formatNumber(t.exitPrice, 2)}</td>
                <td className="px-3 py-2 font-number">{formatNumber(t.qty, 2)}</td>
                <td className="px-3 py-2 font-number font-bold" style={{ color: Number(t.netPnlUsd || 0) >= 0 ? '#0ecb81' : '#f6465d' }}>{formatUsd(t.netPnlUsd)}</td>
                <td className="px-3 py-2 font-number">{t.rMultiple !== null && t.rMultiple !== undefined ? formatNumber(t.rMultiple, 2) : '-'}</td>
                <td className="px-3 py-2 text-[#707a8a] max-w-sm truncate">{t.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(rows?.length || 0) > visibleRows.length && (
        <div className="px-4 py-2 text-xs text-[#707a8a] border-t border-[#2b3139]">
          Menampilkan 250 trade pertama.
        </div>
      )}
    </div>
  );
}

function ReviewTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="bn-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2b3139] text-sm font-bold text-white">{title}</div>
      {rows.map((r) => (
        <div key={r.date} className="px-4 py-2 border-b border-[#2b3139] grid grid-cols-4 gap-2 text-xs">
          <span className="text-white">{r.date}</span>
          <span className="font-number" style={{ color: r.dailyNetChange >= 0 ? '#0ecb81' : '#f6465d' }}>{formatUsd(r.dailyNetChange)}</span>
          <span className="text-[#929aa5]">{r.tradeCount} trades</span>
          <span className="text-[#707a8a]">{r.comment}</span>
        </div>
      ))}
    </div>
  );
}

function WeeklyTable({ rows }: { rows: any[] }) {
  return (
    <div className="bn-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2b3139] text-sm font-bold text-white">Weekly Review</div>
      {rows.map((r) => (
        <div key={r.week} className="px-4 py-2 border-b border-[#2b3139] text-xs space-y-1">
          <div className="flex justify-between"><span className="text-white">{r.week}</span><span className="font-number" style={{ color: r.totalPnl >= 0 ? '#0ecb81' : '#f6465d' }}>{formatUsd(r.totalPnl)}</span></div>
          <div className="text-[#707a8a]">Best {r.bestDay || '-'} · Worst {r.worstDay || '-'} · Avg {formatUsd(r.averageDailyPnl)}</div>
        </div>
      ))}
    </div>
  );
}
