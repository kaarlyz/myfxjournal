import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, AlertCircle, BarChart3, Zap, CheckCircle2, Database, Info, CalendarX, Download, ShieldAlert, Check, X } from 'lucide-react';
import { formatNumber, formatPercent } from '../../utils/formatters';
import { SectionLabel } from '../ui/SectionLabel';

interface Props {
  metrics: any;
  trades: any[];
  sessionId: string;
}

interface SimRow {
  rrTarget: number;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  expectancy: number;
}

interface CandleCoverage {
  symbol: string;
  timeframe: string;
  firstCandle: string | null;
  lastCandle: string | null;
  totalCandles: number;
  coversTradeRange?: boolean;
}

interface Diagnostics {
  tradeRange: { first: string | null; last: string | null };
  candleCoverage: CandleCoverage[];
}

interface ReplaySummaryResult {
  processed: number;
  valid: number;
  invalid: number;
  total: number;
  statusCounts: Record<string, number>;
  latestReplayVersion?: string;
}

const RR_TARGETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];

function fmtDate(d: string | null): string {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  VALID: { label: 'VALID Replay', bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-800', icon: '✅' },
  PRICE_SCALE_MISMATCH: { label: 'Price Scale Mismatch (>20% gap)', bg: 'bg-amber-100 border-amber-300', text: 'text-amber-800', icon: '⚠️' },
  INVALID_FEED: { label: 'Broker / Feed Provider Mismatch', bg: 'bg-amber-100 border-amber-300', text: 'text-amber-800', icon: '⚠️' },
  DATASET_NOT_COMPATIBLE: { label: 'Incompatible Dataset Feed ID', bg: 'bg-amber-100 border-amber-300', text: 'text-amber-800', icon: '⚠️' },
  MISSING_MARKET_DATA: { label: 'Missing Market Candles in Window', bg: 'bg-blue-100 border-blue-300', text: 'text-blue-800', icon: 'ℹ️' },
  INSUFFICIENT_HISTORY: { label: 'Insufficient Candles (< 3 candles)', bg: 'bg-gray-100 border-gray-300', text: 'text-gray-800', icon: 'ℹ️' },
  SYMBOL_NOT_FOUND: { label: 'Symbol Not Found in Market Catalog', bg: 'bg-red-100 border-red-300', text: 'text-red-800', icon: '❌' },
  TIME_ALIGNMENT_ERROR: { label: 'Time Alignment Error', bg: 'bg-red-100 border-red-300', text: 'text-red-800', icon: '❌' },
  NO_SL_INFERABLE: { label: 'SL Could Not Be Inferred', bg: 'bg-gray-100 border-gray-300', text: 'text-gray-800', icon: 'ℹ️' },
  FAILED: { label: 'Replay Execution Failed', bg: 'bg-red-100 border-red-300', text: 'text-red-800', icon: '💥' },
};

export default function RRLabTab({ metrics, trades, sessionId }: Props) {
  const navigate = useNavigate();
  const [customRR, setCustomRR] = useState<number>(2.5);
  const [backtestRR, setBacktestRR] = useState<number>(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<ReplaySummaryResult | null>(null);
  const [rrSimData, setRrSimData] = useState<SimRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  // ── Estimate-based sim (uses MFE/MAE from CSV if available) ─────────────
  const hasMfeMae = useMemo(() => {
    return trades.some(t =>
      t.favorableExcursionUsd !== null &&
      t.favorableExcursionUsd !== undefined &&
      t.favorableExcursionUsd > 0
    );
  }, [trades]);

  const simulateEstimated = (targetR: number) => {
    if (!hasMfeMae) return null;
    let wins = 0, losses = 0;
    trades.forEach(t => {
      if (!t.riskUsd || t.riskUsd <= 0) return;
      const mfeR = (t.favorableExcursionUsd || 0) / t.riskUsd;
      const maeR = (t.adverseExcursionUsd || 0) / t.riskUsd;
      if (maeR >= 1) losses++;
      else if (mfeR >= targetR) wins++;
      else if (t.netPnlUsd > 0) wins++;
      else losses++;
    });
    const total = wins + losses;
    const winrate = total > 0 ? (wins / total) * 100 : 0;
    const ev = (winrate / 100 * targetR) - ((1 - winrate / 100) * 1);
    return { targetR, winrate, ev, wins, losses };
  };

  const estimatedSims = hasMfeMae
    ? [...RR_TARGETS, customRR].map(r => simulateEstimated(r))
    : [];

  // ── MT5 Candle–backed simulation ────────────────────────────────────────
  const runMarketAnalysis = useCallback(async () => {
    if (!sessionId) return;
    setAnalyzing(true);
    setError(null);
    setAnalyzeResult(null);
    setRrSimData(null);
    setDiagnostics(null);

    try {
      // Step 1: Run replay rebuild
      const analyzeRes = await fetch(`/api/analytics/session/${sessionId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backtestRR }),
      });
      const analyzeJson = await analyzeRes.json();

      if (!analyzeJson.ok) {
        setError(analyzeJson.error || 'Replay execution failed.');
        return;
      }

      const summary: ReplaySummaryResult = {
        processed: analyzeJson.processed ?? analyzeJson.total ?? 0,
        valid: analyzeJson.valid ?? analyzeJson.validCount ?? 0,
        invalid: analyzeJson.invalid ?? analyzeJson.invalidCount ?? 0,
        total: analyzeJson.total ?? 0,
        statusCounts: analyzeJson.statusCounts || {},
        latestReplayVersion: analyzeJson.latestReplayVersion,
      };

      setAnalyzeResult(summary);
      if (analyzeJson.diagnostics) setDiagnostics(analyzeJson.diagnostics);

      // Step 2: If valid trades exist, fetch simulation matrix
      if (summary.valid > 0) {
        const simRes = await fetch(`/api/analytics/session/${sessionId}/rr-simulation`);
        const simJson = await simRes.json();
        if (simJson.ok && simJson.hasData) {
          setRrSimData(simJson.data);
        }
      }
    } catch (e: any) {
      setError('Gagal terhubung ke server. Pastikan koneksi dan server berjalan.');
    } finally {
      setAnalyzing(false);
    }
  }, [sessionId, backtestRR]);

  return (
    <div className="space-y-6">

      {/* ── Realized & Planned R cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
          <SectionLabel label="Realized R Distribution" shape="diamond" color="yellow" icon={<BarChart3 className="w-4 h-4" />} className="mb-4" />
          <div className="space-y-2 font-[Outfit]">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#717182] border-b-2 border-dashed border-[#121212]/20 pb-2">
              <span>Metric</span>
              <span>Value</span>
            </div>
            <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
              <span>Average Realized R</span>
              <span className="font-extrabold font-number text-[14px]">{metrics.avgRealizedRR !== null ? formatNumber(metrics.avgRealizedRR, 2) + 'R' : 'N/A'}</span>
            </div>
            <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
              <span>Median Realized R</span>
              <span className="font-extrabold font-number text-[14px]">{metrics.medianRR !== null ? formatNumber(metrics.medianRR, 2) + 'R' : 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
          <SectionLabel label="Planned R Distribution" shape="circle" color="blue" icon={<Target className="w-4 h-4" />} className="mb-4" />
          <div className="space-y-2 font-[Outfit]">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#717182] border-b-2 border-dashed border-[#121212]/20 pb-2">
              <span>Metric</span>
              <span>Value</span>
            </div>
            <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
              <span>Average Planned R</span>
              <span className="font-extrabold font-number text-[14px]">{metrics.avgPlannedRR !== null ? formatNumber(metrics.avgPlannedRR, 2) + 'R' : 'N/A'}</span>
            </div>
            {metrics.avgPlannedRR === null && (
              <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mt-2 italic bg-[#F0F0F0] p-2 text-center">Planned R data not available in imported trades.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── MT5 Candle–Backed RR Simulation ── */}
      <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
          <div>
            <SectionLabel label="RR Potential Simulation" shape="square" color="dark" icon={<Database className="w-4 h-4" />} />
            <p className="text-[11px] text-[#717182] font-medium mt-1.5 max-w-lg">
              Menggunakan data candle MT5 riil dengan validasi 10-step fail-fast. SL dihitung mundur dari rasio RR backtest Anda, lalu dilacak pergerakan candle riil.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 shrink-0">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#717182]">Backtest RR digunakan</label>
              <div className="flex items-center gap-1">
                <span className="text-[13px] font-bold text-[#121212]">1 :</span>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={backtestRR}
                  onChange={e => setBacktestRR(parseFloat(e.target.value) || 1)}
                  className="input py-1 px-2 w-16 text-center font-bold"
                />
              </div>
            </div>

            <button
              onClick={runMarketAnalysis}
              disabled={analyzing || !sessionId}
              className={`flex items-center gap-2 px-4 py-2 font-extrabold text-[13px] border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] transition-all
                ${analyzing
                  ? 'bg-[#E5E5E5] text-[#717182] cursor-not-allowed'
                  : 'bg-[#121212] text-white hover:bg-[#333] active:translate-y-0.5 active:shadow-none'}`}
            >
              {analyzing
                ? <><span className="animate-spin">⟳</span> Analyzing...</>
                : <><Zap className="w-4 h-4" /> Run MT5 Analysis</>}
            </button>
          </div>
        </div>

        {/* Network / Execution Server Error (ONLY for 500 / network offline) */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border-2 border-red-400 text-red-700 text-[12px] font-bold mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold">Eksekusi Replay Gagal</p>
              <p className="font-normal text-[11px] mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Execution Summary Panel (Shown on HTTP success) */}
        {analyzeResult && (
          <div className="mb-5 space-y-3">
            {/* Banner Header */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border-2 text-[12px] font-bold ${
              analyzeResult.valid > 0
                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                : analyzeResult.processed > 0
                ? 'bg-amber-50 border-amber-400 text-amber-800'
                : 'bg-gray-50 border-gray-300 text-gray-700'
            }`}>
              <div className="flex items-center gap-2">
                {analyzeResult.valid > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  Eksekusi Replay Selesai: <strong>{analyzeResult.processed}</strong> trade diproses
                  {analyzeResult.processed > 0 && (
                    <> — <strong className="text-emerald-700">{analyzeResult.valid} VALID</strong>, <strong className="text-amber-700">{analyzeResult.invalid} Rejection</strong></>
                  )}
                </span>
              </div>
              {analyzeResult.latestReplayVersion && (
                <span className="text-[10px] px-2 py-0.5 bg-white/60 border border-current rounded font-mono">
                  Engine v{analyzeResult.latestReplayVersion}
                </span>
              )}
            </div>

            {/* ReplayStatus Breakdown Chips */}
            {analyzeResult.statusCounts && Object.keys(analyzeResult.statusCounts).length > 0 && (
              <div className="p-3 bg-white border-2 border-[#121212] space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#717182]">
                  Status Results Breakdown ({analyzeResult.processed} Trades)
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(analyzeResult.statusCounts).map(([statusKey, count]) => {
                    const info = STATUS_LABELS[statusKey] || { label: statusKey, bg: 'bg-gray-100 border-gray-300', text: 'text-gray-800', icon: '❓' };
                    return (
                      <div key={statusKey} className={`flex items-center gap-1.5 px-2.5 py-1 border rounded text-[11px] font-bold ${info.bg} ${info.text}`}>
                        <span>{info.icon}</span>
                        <span>{info.label}:</span>
                        <span className="font-extrabold font-number text-[12px]">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Explanation when zero valid trades exist */}
            {analyzeResult.valid === 0 && analyzeResult.processed > 0 && (
              <div className="p-3.5 bg-amber-50/80 border-2 border-amber-300 text-amber-900 text-[11px] font-medium leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1 text-amber-800">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  Mengapa Simulasi RR Tidak Ditampilkan?
                </p>
                <p>
                  Tabel simulasi RR hanya mengkalkulasi trade yang lolos 10-step validation engine (status <strong>VALID</strong>).
                  Semua <strong>{analyzeResult.invalid} trade</strong> pada sesi ini di-reject karena perbedaan feed/skala harga broker (<code>PRICE_SCALE_MISMATCH</code>) atau data candle tidak mencukupi (<code>INSUFFICIENT_HISTORY</code>). Data palsu/cacat secara otomatis di-purge.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Date range mismatch diagnostics */}
        {diagnostics && analyzeResult && analyzeResult.valid === 0 && (
          <div className="p-4 bg-amber-50 border-2 border-amber-400 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-800 font-extrabold text-[13px]">
                <CalendarX className="w-5 h-5" />
                Coverage Market Data Candle
              </div>
              {diagnostics.candleCoverage.length > 0 && (() => {
                const sym = diagnostics.candleCoverage[0]?.symbol || 'XAUUSD';
                const mdParams = new URLSearchParams({
                  symbol: sym,
                  from: diagnostics.tradeRange.first ? diagnostics.tradeRange.first.split('T')[0] : '',
                  to: diagnostics.tradeRange.last
                    ? new Date(new Date(diagnostics.tradeRange.last).getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    : '',
                });
                return (
                  <button
                    onClick={() => navigate(`/market-data?${mdParams}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#121212] text-white text-[11px] font-extrabold border-2 border-[#121212] hover:bg-[#333] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Matching Data
                  </button>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              <div className="bg-white border-2 border-amber-300 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">📅 Rentang Trade Sesi Ini</p>
                <p className="font-bold text-[#121212]">{fmtDate(diagnostics.tradeRange.first)}</p>
                <p className="text-[#717182] font-medium">s/d {fmtDate(diagnostics.tradeRange.last)}</p>
              </div>
              <div className="bg-white border-2 border-amber-300 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-2">📊 Status Coverage Candle</p>
                {diagnostics.candleCoverage.length > 0 ? (
                  <div className="space-y-1">
                    {diagnostics.candleCoverage.map(c => (
                      <div key={c.timeframe} className="flex items-center gap-2 text-[11px]">
                        <span>{c.coversTradeRange ? '✅' : '❌'}</span>
                        <span className="font-extrabold text-[#121212]">{c.timeframe}</span>
                        <span className="text-[#717182]">({fmtDate(c.firstCandle)} – {fmtDate(c.lastCandle)})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-bold text-red-600 text-[11px]">Tidak ada candle data terunduh untuk simbol ini</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Result Table (Rendered ONLY when valid trades produce rrSimData) */}
        {rrSimData && rrSimData.length > 0 ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Target RR</th>
                    <th>Simulated Win Rate</th>
                    <th>Wins / Losses</th>
                    <th>Expectancy</th>
                  </tr>
                </thead>
                <tbody>
                  {rrSimData.map((row) => (
                    <tr key={row.rrTarget} className={row.expectancy > 0 ? 'bg-emerald-50/30' : ''}>
                      <td className="font-extrabold text-[#121212] font-display text-[15px]">1 : {row.rrTarget}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={`font-extrabold font-number text-[14px] ${row.winRate > 50 ? 'text-[var(--profit)]' : row.winRate > 33 ? 'text-amber-500' : 'text-[var(--loss)]'}`}>
                            {formatPercent(row.winRate)}
                          </span>
                          <div className="flex-1 h-1.5 bg-[#E5E5E5] rounded-full overflow-hidden w-20">
                            <div
                              className={`h-full rounded-full ${row.winRate > 50 ? 'bg-emerald-500' : row.winRate > 33 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${row.winRate}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="font-bold font-number">
                        <span className="text-[var(--profit)]">{row.wins}</span>
                        <span className="text-[#717182]"> / </span>
                        <span className="text-[var(--loss)]">{row.losses}</span>
                      </td>
                      <td className={`font-extrabold font-number text-[15px] ${row.expectancy >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                        {row.expectancy >= 0 ? '+' : ''}{formatNumber(row.expectancy, 2)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mt-3 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Data diverifikasi langsung menggunakan MT5 Historical Candles. SL dihitung mundur dari RR {backtestRR}:1.
            </p>
          </>
        ) : !rrSimData && !analyzing && !error && !analyzeResult && (
          <div className="text-center py-8 border-2 border-dashed border-[#121212]/20">
            <Database className="w-8 h-8 text-[#717182] mx-auto mb-2" />
            <p className="text-[13px] font-bold text-[#717182]">Belum ada data simulasi.</p>
            <p className="text-[11px] text-[#717182] mt-1">Klik "Run MT5 Analysis" di atas untuk mulai. Pastikan data candle MT5 sudah diunduh di halaman <strong>Market Data</strong>.</p>
          </div>
        )}
      </div>

      {/* ── Estimated sim (legacy, CSV MFE/MAE based) ── */}
      <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <SectionLabel label="Target Simulation (Estimasi CSV)" shape="square" color="yellow" icon={<Target className="w-4 h-4" />} />
            <p className="text-[10px] text-[#717182] font-medium mt-1">Berdasarkan MFE/MAE dari data CSV — tanpa verifikasi candle riil.</p>
          </div>
          {hasMfeMae && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717182]">Custom R:</span>
              <input
                type="number"
                step="0.5"
                value={customRR}
                onChange={e => setCustomRR(Number(e.target.value))}
                className="input py-1 px-2 w-20 text-center font-bold"
              />
            </div>
          )}
        </div>

        {!hasMfeMae ? (
          <div className="flex items-start gap-3 p-4 bg-[var(--warning-dim)] border-2 border-[var(--warning)] text-[#121212]">
            <AlertCircle className="w-5 h-5 shrink-0 text-[var(--warning)]" strokeWidth={3} />
            <p className="text-[13px] font-bold">Advanced RR simulation unavailable. MFE/MAE (Maximum Favorable/Adverse Excursion) data is required to simulate targets.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Target R</th>
                  <th>Simulated Winrate</th>
                  <th>Wins / Losses</th>
                  <th>Expected Value (EV)</th>
                </tr>
              </thead>
              <tbody>
                {estimatedSims.map((sim, idx) => sim && (
                  <tr key={idx} className="hover:bg-[#F0F0F0] transition-colors">
                    <td className="font-extrabold text-[#121212] font-display text-[15px]">{sim.targetR}R</td>
                    <td className="text-[#121212] font-bold font-number">{formatPercent(sim.winrate)}</td>
                    <td className="text-[#121212] font-bold font-number"><span className="text-[var(--profit)]">{sim.wins}</span> / <span className="text-[var(--loss)]">{sim.losses}</span></td>
                    <td className={`font-extrabold font-number text-[15px] ${sim.ev >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                      {formatNumber(sim.ev, 2)}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mt-4">
              * Simulation assumes SL is hit if MAE &gt;= 1R. Without tick/OHLC data, pessimistic resolution is applied.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
