import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { buildBacktestExportData, buildLiveJournalExportData, buildMt5ReportExportData } from '../utils/reportExportData';
import { formatNumber, formatUsd } from '../utils/formatters';
import { BrandLogo } from '../components/ui/BrandLogo';

type ReportKind = 'mt5' | 'session' | 'live';

export default function ReportPrint({ kind }: { kind: ReportKind }) {
  const params = useParams();
  const id = params.reportId || params.sessionId || params.accountId || '';
  const [raw, setRaw] = useState<any | null>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (kind === 'mt5') {
          const res = await fetch(`/api/mt5-reports/sessions/${id}`);
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || 'MT5 report not found');
          if (active) setRaw(body);
        } else if (kind === 'session') {
          const res = await fetch(`/api/sessions/${id}`);
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Session not found');
          if (active) setRaw(body);
        } else {
          const [accountsRes, summaryRes, tradesRes] = await Promise.all([
            fetch('/api/accounts'),
            fetch(`/api/live-trades/summary?accountId=${id}`),
            fetch(`/api/live-trades?accountId=${id}`),
          ]);
          const accounts = await accountsRes.json();
          const summary = await summaryRes.json();
          const liveTrades = await tradesRes.json();
          if (!accountsRes.ok || !summaryRes.ok || !tradesRes.ok) throw new Error('Live report data not found');
          if (active) {
            setRaw({ account: accounts.find((a: any) => a.id === id), summary });
            setTrades(Array.isArray(liveTrades) ? liveTrades : []);
          }
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load report');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [id, kind]);

  const report = useMemo(() => {
    if (!raw) return null;
    if (kind === 'mt5') return buildMt5ReportExportData(raw);
    if (kind === 'session') return buildBacktestExportData(raw);
    return buildLiveJournalExportData({ account: raw.account, summary: raw.summary, trades });
  }, [kind, raw, trades]);

  if (loading) return <div className="print-shell p-10 font-bold text-[#121212] text-xl uppercase tracking-widest text-center animate-pulse">Loading printable report...</div>;
  if (error || !report) return <div className="print-shell p-10 font-bold text-[var(--loss)] text-xl uppercase tracking-widest text-center border-4 border-[var(--loss)] bg-[var(--loss-dim)] shadow-[8px_8px_0px_0px_var(--loss)] m-10">{error || 'Report unavailable.'}</div>;

  return (
    <div className="print-shell max-w-5xl mx-auto bg-white min-h-screen text-[#121212] font-sans">
      <div className="print-toolbar no-print p-4 bg-[#121212] text-white flex items-center justify-between shadow-[0px_4px_0px_0px_rgba(0,0,0,1)] z-50 sticky top-0">
        <button onClick={() => window.print()} className="bg-white text-[#121212] px-6 py-2 font-extrabold uppercase tracking-widest text-sm hover:bg-[#1040C0] hover:text-white transition-colors border-2 border-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)]">
          Print / Save as PDF
        </button>
        <span className="font-bold text-sm tracking-wide text-gray-300">Preview report before saving.</span>
      </div>

      <div className="p-8 md:p-12 space-y-12 bg-white">
        {/* Cover Page */}
        <section className="print-page cover-page border-4 border-[#121212] p-8 shadow-[12px_12px_0px_0px_#121212] relative overflow-hidden bg-[#F0F0F0]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#1040C0] -translate-y-1/2 translate-x-1/2 rotate-45" />
          <div className="mb-8 inline-flex items-center gap-3">
            <BrandLogo size={40} compact />
            <div className="brand inline-flex bg-[#121212] text-white font-black uppercase tracking-widest px-4 py-2 text-sm border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212]">
              KAFX Journal
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-[#121212] mb-4 max-w-3xl leading-none">
            {report.title}
          </h1>
          <p className="subtitle text-xl font-bold text-[#717182] mb-12 max-w-2xl leading-snug">
            {report.subtitle}
          </p>
          
          {'verdict' in report && (
            <div className="verdict-box bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] mb-12">
              <strong className="block text-2xl font-black uppercase tracking-widest text-[#121212] mb-2">
                Verdict: <span className="text-[#1040C0]">{report.verdict?.label || 'N/A'}</span> {report.verdict?.score !== undefined ? `(${report.verdict.score}/100)` : ''}
              </strong>
              <p className="text-[#717182] font-bold text-lg">{report.verdictText || 'No verdict available.'}</p>
            </div>
          )}
          
          <div className="cover-metrics grid grid-cols-2 md:grid-cols-5 gap-4 mb-12 border-y-4 border-[#121212] py-8">
            {report.metrics.slice(0, 5).map(([label, value]: any) => (
              <div key={label} className="flex flex-col">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#717182] mb-1">{label}</span>
                <strong className="text-xl md:text-2xl font-black text-[#121212] font-number leading-none">{formatValue(value)}</strong>
              </div>
            ))}
          </div>
          
          <div className="meta-grid grid grid-cols-2 md:grid-cols-4 gap-6 bg-white border-2 border-[#121212] p-6 shadow-[4px_4px_0px_0px_#121212]">
            {report.metadata.map(([label, value]: any) => <InfoCell key={label} label={label} value={value} />)}
          </div>
          
          <p className="muted cover-note mt-12 text-xs font-bold text-[#717182] uppercase tracking-wider text-center border-t-2 border-dashed border-[#121212] pt-4">
            Generated by KAFX Journal. Account numbers are masked where applicable. For research, archive, and trading review only.
          </p>
        </section>

        {/* Key Metrics */}
        <section className="print-page border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212] bg-white">
          <h2 className="text-2xl font-black uppercase tracking-widest text-[#121212] mb-8 pb-2 border-b-4 border-[#121212] inline-block">Key Metrics</h2>
          <div className="metric-grid grid grid-cols-2 md:grid-cols-4 gap-6">
            {report.metrics.map(([label, value]: any) => <InfoCell key={label} label={label} value={formatValue(value)} />)}
          </div>
        </section>

        {/* Charts */}
        <section className="print-page border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212] bg-white break-inside-avoid">
          <h2 className="text-2xl font-black uppercase tracking-widest text-[#121212] mb-8 pb-2 border-b-4 border-[#121212] inline-block">Charts / Curves</h2>
          <div className="border-4 border-[#121212] bg-[#F0F0F0] p-4 shadow-inner">
            <CurvePreview rows={(report as any).equityPoints || []} />
          </div>
          <p className="muted text-xs font-bold text-[#717182] mt-4 uppercase tracking-wider text-right">
            {((report as any).equityPoints || []).length
              ? 'Balance/equity curve is based on tester graph points.'
              : 'Tester graph was not uploaded; curve is approximated or unavailable.'}
          </p>
        </section>

        {/* Diagnostics */}
        <section className="print-page border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212] bg-white">
          <h2 className="text-2xl font-black uppercase tracking-widest text-[#121212] mb-8 pb-2 border-b-4 border-[#121212] inline-block">Findings / Diagnostics</h2>
          {(report.findings || []).length ? (
            <div className="finding-list grid gap-4">
              {report.findings.map((finding: any, index: number) => {
                const isError = finding.severity === 'ERROR' || finding.severity === 'CRITICAL';
                const isWarn = finding.severity === 'WARNING';
                const variantClass = isError 
                  ? 'border-[var(--loss)] bg-[var(--loss-dim)]' 
                  : isWarn 
                    ? 'border-[var(--warning)] bg-[var(--warning-dim)]' 
                    : 'border-[#121212] bg-[#F0F0F0]';
                
                return (
                  <div key={`${finding.title}-${index}`} className={`finding p-4 border-2 shadow-[4px_4px_0px_0px] ${isError ? 'shadow-[var(--loss)]' : isWarn ? 'shadow-[var(--warning)]' : 'shadow-[#121212]'} ${variantClass}`}>
                    <strong className={`block text-[13px] font-black uppercase tracking-widest mb-2 ${isError ? 'text-[var(--loss)]' : isWarn ? 'text-[var(--warning)]' : 'text-[#121212]'}`}>
                      {finding.severity || 'INFO'} · {finding.title}
                    </strong>
                    <p className="text-[14px] font-bold text-[#121212] leading-snug mb-2">{finding.explanation}</p>
                    {finding.suggestedFix && <small className="text-[11px] font-extrabold uppercase tracking-wider text-[#717182] border-t-2 border-dashed border-current pt-2 block mt-2 opacity-80">{finding.suggestedFix}</small>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 border-2 border-dashed border-[#121212] bg-[#F0F0F0] text-center">
              <p className="text-[#717182] font-bold uppercase tracking-wider">No diagnostics generated for this report.</p>
            </div>
          )}
        </section>

        {/* Written Analysis */}
        <section className="print-page border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212] bg-[#F0F0F0]">
          <h2 className="text-2xl font-black uppercase tracking-widest text-[#121212] mb-8 pb-2 border-b-4 border-[#121212] inline-block">Indonesian Auto Analysis</h2>
          <div className="space-y-6">
            {Object.entries(report.analysis || {}).length ? Object.entries(report.analysis).map(([key, value]) => (
              <div key={key} className="analysis-block bg-white border-2 border-[#121212] p-6 shadow-[4px_4px_0px_0px_#121212]">
                <h3 className="text-sm font-black uppercase tracking-widest text-[#1040C0] mb-3">{key.replace(/([A-Z])/g, ' $1')}</h3>
                <p className="text-[15px] font-medium text-[#121212] leading-relaxed whitespace-pre-wrap">{String(value)}</p>
              </div>
            )) : (
              <div className="p-8 border-2 border-dashed border-[#121212] bg-white text-center">
                <p className="text-[#717182] font-bold uppercase tracking-wider">No written analysis available.</p>
              </div>
            )}
          </div>
        </section>

        {/* Calendar / Review */}
        <section className="print-page border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212] bg-white">
          <h2 className="text-2xl font-black uppercase tracking-widest text-[#121212] mb-8 pb-2 border-b-4 border-[#121212] inline-block">Calendar / Daily Review</h2>
          <DataTable
            columns={['Date', 'PnL', 'Trades', 'Winrate', 'Best', 'Worst']}
            rows={(report.daily || []).map((d: any) => [
              d.date,
              <span className={`font-black font-number ${d.totalPnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>{formatUsd(d.totalPnl)}</span>,
              d.tradeCount,
              `${formatNumber(d.winrate, 2)}%`,
              d.bestTrade ? <span className="text-[var(--profit)] font-bold">{formatUsd(d.bestTrade.netPnlUsd ?? d.bestTrade.profit)}</span> : '-',
              d.worstTrade ? <span className="text-[var(--loss)] font-bold">{formatUsd(d.worstTrade.netPnlUsd ?? d.worstTrade.profit)}</span> : '-',
            ])}
          />
        </section>

        {/* Best / Worst Trades */}
        <section className="print-page border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212] bg-white">
          <h2 className="text-2xl font-black uppercase tracking-widest text-[#121212] mb-8 pb-2 border-b-4 border-[#121212] inline-block">Best / Worst Trades</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <TradeMiniTable title="Top 10 Best Trades" rows={report.bestTrades || []} />
            <TradeMiniTable title="Top 10 Worst Trades" rows={report.worstTrades || []} />
          </div>
        </section>

        {/* Detailed Tables */}
        <section className="print-page border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212] bg-white">
          <h2 className="text-2xl font-black uppercase tracking-widest text-[#121212] mb-8 pb-2 border-b-4 border-[#121212] inline-block">Detailed Tables</h2>
          <TradeMiniTable title="Rebuilt / Session Trades" rows={(report.trades || []).slice(0, 80)} />
          {(report as any).deals?.length ? <p className="muted mt-4 text-[11px] font-extrabold text-[#717182] uppercase tracking-wider text-right">Deals rows: {(report as any).deals.length}. Orders rows: {(report as any).orders?.length || 0}.</p> : null}
          {(report as any).settings ? <div className="mt-8"><KeyValuePrint title="Settings / EA Inputs" rows={(report as any).settings} /></div> : null}
        </section>
      </div>
    </div>
  );
}

function formatValue(value: any) {
  if (typeof value === 'number') return Math.abs(value) > 20 ? formatUsd(value) : formatNumber(value, 4);
  return value ?? '-';
}

function InfoCell({ label, value }: { label: string; value: any }) {
  return (
    <div className="info-cell bg-[#F0F0F0] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
      <span className="block text-[9px] font-extrabold uppercase tracking-widest text-[#717182] mb-1">{label}</span>
      <strong className="block text-[14px] font-black text-[#121212] break-words">{String(value ?? '-')}</strong>
    </div>
  );
}

function CurvePreview({ rows }: { rows: any[] }) {
  const data = (rows || []).slice(0, 160);
  if (!data.length) return <div className="empty-chart p-8 text-center text-[#717182] font-bold uppercase tracking-widest">No graph data available.</div>;
  const values = data.map((row) => Number(row.equity ?? row.balance ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 760;
    const y = 220 - ((value - min) / range) * 190;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  
  return (
    <svg className="curve-svg w-full h-auto max-h-[300px] border-2 border-[#121212]" viewBox="0 0 800 260" role="img" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="800" height="260" fill="#ffffff" />
      
      {/* Grid lines */}
      <line x1="0" y1="20" x2="800" y2="20" stroke="#F0F0F0" strokeWidth="1" />
      <line x1="0" y1="115" x2="800" y2="115" stroke="#F0F0F0" strokeWidth="1" />
      <line x1="0" y1="210" x2="800" y2="210" stroke="#F0F0F0" strokeWidth="1" />
      
      {/* Target Line if max is positive */}
      {max > 0 && min < 0 && (
        <line x1="0" y1={220 - ((0 - min) / range) * 190} x2="800" y2={220 - ((0 - min) / range) * 190} stroke="#121212" strokeWidth="2" strokeDasharray="5,5" opacity="0.3" />
      )}
      
      <polyline points={points} fill="none" stroke="#1040C0" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" transform="translate(20 20)" />
      
      {/* End point dot */}
      {points.split(' ').length > 0 && (
        <circle 
          cx={parseFloat(points.split(' ').pop()?.split(',')[0] || '0') + 20} 
          cy={parseFloat(points.split(' ').pop()?.split(',')[1] || '0') + 20} 
          r="6" fill="#121212" 
        />
      )}
      
      <rect x="20" y="235" width="220" height="20" fill="#121212" />
      <text x="30" y="249" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">Min {min.toFixed(2)} · Max {max.toFixed(2)}</text>
    </svg>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: any[][] }) {
  return (
    <div className="overflow-x-auto border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212]">
      <table className="w-full text-left border-collapse min-w-full">
        <thead>
          <tr className="bg-[#121212] text-white">
            {columns.map((c) => (
              <th key={c} className="py-3 px-4 font-extrabold uppercase tracking-widest text-[11px] border-r-2 border-[#121212] last:border-r-0 whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white text-[13px] font-bold">
          {rows.length ? rows.map((row, index) => (
            <tr key={index} className="border-b-2 border-[#121212] last:border-b-0 hover:bg-[#F0F0F0] transition-colors">
              {row.map((cell, i) => (
                <td key={i} className="py-3 px-4 border-r-2 border-[#121212] last:border-r-0 text-[#121212] font-number">
                  {cell}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-[#717182] font-bold uppercase tracking-widest">
                No rows found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TradeMiniTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="bg-[#F0F0F0] border-4 border-[#121212] p-5 shadow-[6px_6px_0px_0px_#121212] break-inside-avoid">
      <h3 className="text-[14px] font-black uppercase tracking-widest text-[#121212] mb-4 bg-white border-2 border-[#121212] inline-block px-3 py-1 shadow-[2px_2px_0px_0px_#121212]">{title}</h3>
      <DataTable
        columns={['Time', 'Symbol', 'Side', 'PnL']}
        rows={(rows || []).map((t) => [
          String(t.exitTime || t.closeTime || t.openTime || t.entryTime || '').slice(0, 16).replace('T', ' '),
          <span className="font-black text-[#1040C0]">{t.symbol || '-'}</span>,
          <span className={`px-2 py-0.5 border-2 border-[#121212] text-[10px] font-extrabold uppercase tracking-widest bg-white ${t.side === 'BUY' || t.side === 'LONG' ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>{t.side || '-'}</span>,
          <span className={`font-black ${t.netPnlUsd >= 0 || t.profit >= 0 || t.pnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
            {formatUsd(t.netPnlUsd ?? t.profit ?? t.pnl ?? 0)}
          </span>,
        ])}
      />
    </div>
  );
}

function KeyValuePrint({ title, rows }: { title: string; rows: Record<string, any> }) {
  return (
    <div className="bg-[#F0F0F0] border-4 border-[#121212] p-5 shadow-[6px_6px_0px_0px_#121212] break-inside-avoid">
      <h3 className="text-[14px] font-black uppercase tracking-widest text-[#121212] mb-4 bg-white border-2 border-[#121212] inline-block px-3 py-1 shadow-[2px_2px_0px_0px_#121212]">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar p-2 bg-white border-2 border-[#121212] shadow-inner">
        {Object.entries(rows || {}).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center py-2 border-b border-dashed border-[#121212]/30 last:border-0 text-[11px]">
            <span className="font-extrabold uppercase tracking-wider text-[#717182]">{key}</span>
            <span className="font-black font-mono text-[#121212] break-all text-right max-w-[50%]">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
