import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, AlertCircle, BarChart3, Zap, CheckCircle2, Database, Info, CalendarX, Download, ShieldAlert, Check, X, HelpCircle, ArrowRight } from 'lucide-react';
import { formatNumber, formatPercent } from '../../utils/formatters';
import { SectionLabel } from '../ui/SectionLabel';
import { ContextualLoading, ProgressStage } from '../ui/ContextualLoading';
import { ActionFeedback } from '../ui/ActionFeedback';

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
  actualSLTPCount?: number;
  reconstructedCount?: number;
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

interface ReplayValidationSummary {
  broker: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  replay: {
    totalTrades: number;
    tpHits: number;
    tpPct: number;
    slHits: number;
    slPct: number;
    neither: number;
    neitherPct: number;
    ambiguous: number;
    ambiguousPct: number;
    decidedWins: number;
    decidedLosses: number;
    decidedWinRate: number;
    allTradesWinRate: number;
    exactMatches: number;
    exactMatchPct: number;
    mismatches: number;
    mismatchPct: number;
    diffPp: number;
  };
  provider: string;
  timeframe: string;
  engineVersion: string;
}

export default function RRLabTab({ metrics, trades, sessionId }: Props) {
  const navigate = useNavigate();
  const [customRR, setCustomRR] = useState<number>(2.5);
  const [backtestRR, setBacktestRR] = useState<number>(0.75);
  const [marketDataSource, setMarketDataSource] = useState<string>('DUKASCOPY');
  const [timeframe, setTimeframe] = useState<string>('M1');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<number>(0);
  const [analyzeResult, setAnalyzeResult] = useState<ReplaySummaryResult | null>(null);
  const [rrSimData, setRrSimData] = useState<SimRow[] | null>(null);
  const [validationSummary, setValidationSummary] = useState<ReplayValidationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [showTerminologyHelp, setShowTerminologyHelp] = useState(false);
  const [showCustomRRInput, setShowCustomRRInput] = useState(false);
  const [showRRModal, setShowRRModal] = useState(false);
  const [replayProgress, setReplayProgress] = useState<{
    current: number;
    total: number;
    validSoFar: number;
    invalidSoFar: number;
    phase: 'idle' | 'processing' | 'persisting' | 'done';
  } | null>(null);

  // Pre-check: Analyze SL/TP completeness across trades in the session
  const slTpStats = useMemo(() => {
    if (!trades || trades.length === 0) {
      return { total: 0, withBoth: 0, withSlOnly: 0, withTpOnly: 0, withAny: 0, none: 0, hasFullActual: false, hasNoSLTP: true };
    }
    let withBoth = 0;
    let withSlOnly = 0;
    let withTpOnly = 0;
    let none = 0;

    trades.forEach(t => {
      const hasSl = t.slPrice != null && Number(t.slPrice) > 0;
      const hasTp = t.tpPrice != null && Number(t.tpPrice) > 0;
      if (hasSl && hasTp) withBoth++;
      else if (hasSl) withSlOnly++;
      else if (hasTp) withTpOnly++;
      else none++;
    });

    const withAny = withBoth + withSlOnly + withTpOnly;
    const hasFullActual = withBoth > 0 && withBoth >= Math.floor(trades.length * 0.7); // 70%+ have both
    const hasNoSLTP = withAny === 0;

    return {
      total: trades.length,
      withBoth,
      withSlOnly,
      withTpOnly,
      withAny,
      none,
      hasFullActual,
      hasNoSLTP,
    };
  }, [trades]);

  // Auto-fetch existing simulation data if trades have already been replayed
  useEffect(() => {
    let isMounted = true;
    async function loadExistingSim() {
      if (!sessionId) return;
      try {
        const [simRes, valRes] = await Promise.all([
          fetch(`/api/analytics/session/${sessionId}/rr-simulation`),
          fetch(`/api/analytics/session/${sessionId}/validation-summary`),
        ]);
        if (simRes.ok) {
          const simJson = await simRes.json();
          if (isMounted) {
            const simData = simJson.data ?? simJson;
            if (Array.isArray(simData) && simData.length > 0) setRrSimData(simData);
          }
        }
        if (valRes.ok) {
          const valJson = await valRes.json();
          if (isMounted && valJson.ok && valJson.data) {
            setValidationSummary(valJson.data);
          }
        }
      } catch (e) {
        // silent fallback
      }
    }
    loadExistingSim();
    return () => { isMounted = false; };
  }, [sessionId]);

  // Poll replay progress every 500ms while analyzing
  useEffect(() => {
    if (!analyzing || !sessionId) return;
    setReplayProgress(null);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analytics/session/${sessionId}/replay-progress`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.ok && json.progress) {
          setReplayProgress(json.progress);
        }
      } catch (_) {
        // silent
      }
    }, 500);
    return () => clearInterval(interval);
  }, [analyzing, sessionId]);


  // Estimate-based sim (uses MFE/MAE from CSV if available)
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

  // Market Candle–backed simulation
  const runMarketAnalysis = useCallback(async () => {
    if (!sessionId) return;
    setAnalyzing(true);
    setAnalysisStep(1);
    setError(null);
    setAnalyzeResult(null);
    setRrSimData(null);
    setValidationSummary(null);
    setDiagnostics(null);

    try {
      setAnalysisStep(2);
      // Step 1: Run replay rebuild
      const analyzeRes = await fetch(`/api/analytics/session/${sessionId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backtestRR, marketDataSource, timeframe }),
      });
      const analyzeJson = await analyzeRes.json();

      if (!analyzeJson.ok) {
        setError(analyzeJson.error || 'Replay execution failed.');
        setAnalyzing(false);
        return;
      }

      setAnalysisStep(3);
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

      // Step 2: Fetch simulation matrix + validation summary in parallel
      if (summary.valid > 0) {
        const [simRes, valRes] = await Promise.all([
          fetch(`/api/analytics/session/${sessionId}/rr-simulation`),
          fetch(`/api/analytics/session/${sessionId}/validation-summary`),
        ]);
        const simJson = await simRes.json();
        const simData = simJson.data ?? simJson;
        if (Array.isArray(simData) && simData.length > 0) setRrSimData(simData);

        if (valRes.ok) {
          const valJson = await valRes.json();
          if (valJson.ok && valJson.data) setValidationSummary(valJson.data);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal menghubungi server untuk eksekusi replay.');

    } finally {
      setAnalyzing(false);
      setAnalysisStep(0);
    }
  }, [sessionId, backtestRR, marketDataSource, timeframe]);

  const loadingStages: ProgressStage[] = [
    {
      id: 'candles',
      label: `Memuat Data Candle Pasar (${marketDataSource} ${timeframe})`,
      detail: 'Mengecek ketersediaan candle M1 dan mengurutkan rentang waktu secara kronologis',
      status: analysisStep > 1 ? 'completed' : analysisStep === 1 ? 'active' : 'pending',
    },
    {
      id: 'replay',
      label: replayProgress && replayProgress.total > 0
        ? `Menganalisis Trade ${replayProgress.current.toLocaleString()} dari ${replayProgress.total.toLocaleString()} (${Math.round((replayProgress.current / replayProgress.total) * 100)}%)`
        : `Menelusuri Pergerakan ${trades.length} Trade Pasar`,
      detail: replayProgress && replayProgress.total > 0
        ? `${replayProgress.validSoFar} Terverifikasi Valid, ${replayProgress.invalidSoFar} Rejection`
        : slTpStats.hasFullActual
          ? 'Memverifikasi titik hit SL & TP riil langsung dari data broker MT5'
          : `Menguji titik hit SL & TP dengan asumsi rekonstruksi Target RR 1:${backtestRR}`,
      status: analysisStep > 2 ? 'completed' : analysisStep === 2 ? 'active' : 'pending',
    },
    {
      id: 'matrix',
      label: 'Menghitung Matriks Target RR What-If (0.25R s/d 10.0R)',
      detail: 'Mengkalkulasi win rate decay dan expectancy per rasio target',
      status: analysisStep === 3 ? 'active' : 'pending',
    },
  ];


  return (
    <div className="space-y-6">

      {/* ── Mode Guide Banner & Terminology Helper ── */}
      <div className="bg-gradient-to-r from-[#121212] to-[#1E293B] text-white p-4 md:p-5 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#1040C0]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-[#D02020] text-white text-[10px] font-black uppercase tracking-wider">
                RR Lab Pro
              </span>
              <h2 className="font-black text-base sm:text-lg font-display tracking-tight text-white">
                Analisa Tiga Mode: Broker, Replay & What-If
              </h2>
            </div>
            <p className="text-xs text-white/75 font-medium mt-1 leading-relaxed max-w-2xl">
              Memisahkan secara ketat performa historis broker riil (Mode A), validasi pergerakan candle M1 (Mode B), dan eksplorasi target RR alternatif (Mode C).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowTerminologyHelp(!showTerminologyHelp)}
            className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-colors rounded-sm"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showTerminologyHelp ? 'Tutup Panduan' : 'Panduan Istilah'}</span>
          </button>
        </div>

        {/* Expandable Terminology Explanation */}
        {showTerminologyHelp && (
          <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-white/5 border border-white/10 rounded">
              <p className="font-extrabold text-[#F0C020] uppercase tracking-wider text-[10px] mb-1">
                Mode A — Broker Ground Truth
              </p>
              <p className="text-white/80 leading-snug">
                Data murni dari laporan broker MT5. Menampilkan hasil riil tanpa ada simulasi candle eksternal.
              </p>
            </div>

            <div className="p-3 bg-white/5 border border-white/10 rounded">
              <p className="font-extrabold text-[#60A5FA] uppercase tracking-wider text-[10px] mb-1">
                Mode B — Replay Validation
              </p>
              <p className="text-white/80 leading-snug">
                Menguji apakah data candle independen (Dukascopy M1) mereproduksi exit SL/TP broker dengan persis.
              </p>
            </div>

            <div className="p-3 bg-white/5 border border-white/10 rounded">
              <p className="font-extrabold text-[#34D399] uppercase tracking-wider text-[10px] mb-1">
                Mode C — What-If RR Matrix
              </p>
              <p className="text-white/80 leading-snug">
                Simulasi "bagaimana jika TP diubah". Target diuji berdasarkan MFE maksimal sebelum menyentuh batas Actual SL.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 1. BROKER GROUND TRUTH: Realized & Planned R cards ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 bg-[#121212] text-white text-[11px] font-black uppercase tracking-wider">
            Mode A
          </span>
          <h3 className="font-extrabold text-[15px] text-[#121212] font-display">
            1. Broker Ground Truth (Performa Strategi Riil)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#121212]">
            <SectionLabel label="Realized R Distribution" shape="diamond" color="yellow" icon={<BarChart3 className="w-4 h-4" />} className="mb-4" />
            <div className="space-y-2 font-[Outfit]">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#717182] border-b-2 border-dashed border-[#121212]/20 pb-2">
                <span>Metrik Broker</span>
                <span>Nilai Riil</span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
                <span>Average Realized R</span>
                <span className="font-extrabold font-number text-[14px]">
                  {metrics.avgRealizedRR !== null ? formatNumber(metrics.avgRealizedRR, 2) + 'R' : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
                <span>Median Realized R</span>
                <span className="font-extrabold font-number text-[14px]">
                  {metrics.medianRR !== null ? formatNumber(metrics.medianRR, 2) + 'R' : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2">
                <span>Broker Win Rate (Ground Truth)</span>
                <span className="font-extrabold font-number text-[14px] text-[var(--profit)]">
                  {formatPercent(metrics.winrate || 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#121212]">
            <SectionLabel label="Planned R Distribution" shape="circle" color="blue" icon={<Target className="w-4 h-4" />} className="mb-4" />
            <div className="space-y-2 font-[Outfit]">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#717182] border-b-2 border-dashed border-[#121212]/20 pb-2">
                <span>Rencana Trade Order</span>
                <span>Rasio Target</span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
                <span>Average Planned RR</span>
                <span className="font-extrabold font-number text-[14px]">
                  {metrics.avgPlannedRR !== null ? `1 : ${formatNumber(metrics.avgPlannedRR, 3)}` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold text-[#121212] py-2 border-b-2 border-dashed border-[#121212]/20">
                <span>Profil Strategi</span>
                <span className="font-extrabold text-[12px] text-blue-700">
                  {metrics.avgPlannedRR !== null && metrics.avgPlannedRR < 1.0 ? 'Fixed Sub-1.0 RR Bracket (~1:0.75)' : 'Standard / Dynamic RR'}
                </span>
              </div>
              {metrics.avgPlannedRR === null && (
                <p className="text-[10px] font-bold text-[#717182] uppercase tracking-wider mt-2 italic bg-[#F0F0F0] p-2 text-center">
                  Planned R data tidak tersedia pada trade yang diimpor.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. REPLAY VALIDATION & 3. WHAT-IF SIMULATION ── */}
      <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#121212] space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider">
              Mode B & C
            </span>
            <SectionLabel label="Replay Validation & What-If Simulation" shape="square" color="dark" icon={<Database className="w-4 h-4" />} />
          </div>
          <p className="text-xs text-[#717182] font-medium mt-1 leading-relaxed">
            Jalankan engine pergerakan candle pasar riil ({marketDataSource}) untuk menguji kecocokan strategi asli dan mensimulasikan target RR alternatif (0.25 s/d 10.0).
          </p>
        </div>

        {/* ── 2a. Pre-Check Data Completeness Banner ── */}
        {slTpStats.hasFullActual ? (
          <div className="bg-emerald-50 border-2 border-[#121212] p-3.5 flex items-start gap-3 shadow-[2px_2px_0px_0px_#059669]">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black text-emerald-950 uppercase tracking-wide font-[Outfit]">
                  Data SL & TP Asli Terdeteksi ({slTpStats.withBoth} / {slTpStats.total} Trade — 100%)
                </span>
                <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 text-[10px] font-black uppercase tracking-wider self-start sm:self-auto">
                  Ground Truth Ready
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium mt-1 leading-relaxed">
                Setiap trade memiliki level Stop Loss & Take Profit riil dari broker. Replay engine akan memvalidasi pergerakan candle tanpa memerlukan asumsi RR manual.
              </p>
            </div>
          </div>
        ) : slTpStats.hasNoSLTP ? (
          <div className="bg-amber-50 border-2 border-[#121212] p-3.5 flex items-start gap-3 shadow-[2px_2px_0px_0px_#D97706]">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black text-amber-950 uppercase tracking-wide font-[Outfit]">
                  Data SL & TP Asli Tidak Ditemukan pada Sesi Ini
                </span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider self-start sm:self-auto">
                  Target RR Diperlukan
                </span>
              </div>
              <p className="text-[11px] text-amber-800 font-medium mt-1 leading-relaxed">
                Data trade sesi ini tidak memiliki kolom SL/TP riil. Tentukan target <strong>Rasio RR (Risk-to-Reward)</strong> strategi di bawah agar engine dapat merekonstruksi batas risiko & reward setiap trade.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border-2 border-[#121212] p-3.5 flex items-start gap-3 shadow-[2px_2px_0px_0px_#1040C0]">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs font-black text-blue-950 uppercase tracking-wide font-[Outfit]">
                  Sebagian Trade Memiliki Data SL/TP ({slTpStats.withAny} / {slTpStats.total} Trade)
                </span>
                <span className="px-2 py-0.5 bg-blue-200 text-blue-900 text-[10px] font-black uppercase tracking-wider self-start sm:self-auto">
                  Hybrid Mode
                </span>
              </div>
              <p className="text-[11px] text-blue-800 font-medium mt-1 leading-relaxed">
                Trade dengan data asli akan menggunakan SL/TP riil, sedangkan trade tanpa SL/TP akan direkonstruksi menggunakan rasio RR target.
              </p>
            </div>
          </div>
        )}

        {/* ── Mobile-First Controls Card ── */}
        <div className="bg-[#F9F9F9] border-2 border-[#121212] p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Market Data Source */}
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#717182]">
                Sumber Data Pasar
              </label>
              <select
                value={marketDataSource}
                onChange={e => setMarketDataSource(e.target.value)}
                disabled={analyzing}
                className="w-full bg-white border-2 border-[#121212] py-2 px-2.5 text-xs font-bold text-[#121212] outline-none cursor-pointer"
              >
                <option value="DUKASCOPY">Dukascopy (M1 CSV)</option>
                <option value="MT5">MT5 (Historical/Live)</option>
              </select>
              <p className="text-[10px] text-[#717182] font-medium">Data feed independen</p>
            </div>

            {/* Timeframe */}
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[#717182]">
                Timeframe Replay
              </label>
              <select
                value={timeframe}
                onChange={e => setTimeframe(e.target.value)}
                disabled={analyzing}
                className="w-full bg-white border-2 border-[#121212] py-2 px-2.5 text-xs font-bold text-[#121212] outline-none cursor-pointer"
              >
                <option value="M1">M1 (1 Menit — Disarankan)</option>
                <option value="M5">M5 (5 Menit)</option>
                <option value="M15">M15 (15 Menit)</option>
                <option value="M30">M30 (30 Menit)</option>
                <option value="H1">H1 (1 Jam)</option>
                <option value="H4">H4 (4 Jam)</option>
                <option value="D1">D1 (Daily)</option>
              </select>
              <p className="text-[10px] text-[#717182] font-medium">Resolusi candle analisis</p>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#121212]/15">
            <p className="text-[11px] text-[#717182] font-medium">
              Akan mereplay <strong>{trades.length} trade</strong> terhadap feed <strong>{marketDataSource} ({timeframe})</strong>.
            </p>
            <button
              onClick={() => {
                if (slTpStats.hasFullActual) {
                  runMarketAnalysis();
                } else {
                  setShowRRModal(true);
                }
              }}
              disabled={analyzing || !sessionId}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] transition-all min-h-[44px]
                ${analyzing
                  ? 'bg-[#E5E5E5] text-[#717182] cursor-not-allowed'
                  : 'bg-[#121212] text-white hover:bg-[#333] active:translate-y-0.5 active:shadow-none'}`}
            >
              {analyzing ? (
                <>
                  <span className="animate-spin text-sm">⟳</span>
                  <span>Sedang Menjalankan Replay...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-[#F0C020]" />
                  <span>Jalankan Replay Validation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── RR Reconstruction Modal Dialog (When SL/TP is missing) ── */}
        {showRRModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-[#121212]/70 backdrop-blur-xs transition-opacity"
              onClick={() => setShowRRModal(false)}
              aria-hidden="true"
            />

            {/* Dialog Box */}
            <div
              className="relative bg-white border-4 border-[#121212] p-6 md:p-7 max-w-lg w-full shadow-[8px_8px_0px_0px_#121212] space-y-5 animate-scale-up z-10"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-start justify-between gap-3 border-b-2 border-[#121212]/15 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#F0C020] text-[#121212] border-2 border-[#121212] shrink-0 font-black text-base">
                    📐
                  </div>
                  <div>
                    <h3 className="font-black text-base md:text-lg text-[#121212] font-display tracking-tight">
                      Tentukan Target RR Rekonstruksi
                    </h3>
                    <p className="text-[11px] text-[#717182] font-bold uppercase tracking-wider">
                      {trades.length} Trade Tanpa SL & TP Asli Terdeteksi
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRRModal(false)}
                  className="text-[#717182] hover:text-[#121212] transition-colors p-1"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-[#3F3F46] font-medium leading-relaxed">
                  Karena dataset sesi ini tidak memiliki kolom Stop Loss & Take Profit riil, tentukan <strong>Target Risk-to-Reward (RR)</strong> yang diasumsikan saat Anda melakukan backtest:
                </p>

                {/* Big Visible High-Contrast Input Box */}
                <div className="bg-[#F9F9F9] border-2 border-[#121212] p-4 space-y-3">
                  <label className="block text-[11px] font-black uppercase tracking-wider text-[#121212]">
                    Rasio Target Risk-to-Reward (RR)
                  </label>
                  <div className="flex items-center gap-2 bg-white border-2 border-[#121212] px-3.5 py-2.5 shadow-[3px_3px_0px_0px_#121212]">
                    <span className="text-lg font-black text-[#121212] font-mono">1 :</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.10"
                      max="10.0"
                      value={backtestRR}
                      onChange={e => setBacktestRR(parseFloat(e.target.value) || 1.0)}
                      className="w-full text-lg font-black text-[#121212] outline-none bg-transparent font-mono"
                      autoFocus
                    />
                    <span className="text-xs font-black text-[#121212] uppercase tracking-wider bg-[#F0F0F0] px-2 py-1 border border-[#121212]">
                      Target
                    </span>
                  </div>

                  {/* Quick Preset Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182] mr-1">Preset:</span>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setBacktestRR(r)}
                        className={`px-2.5 py-1 text-xs font-black border-2 border-[#121212] transition-all ${
                          backtestRR === r
                            ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#1040C0]'
                            : 'bg-white text-[#121212] hover:bg-[#E5E5E5]'
                        }`}
                      >
                        1:{r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reconstruction Mathematical Explanation */}
                <div className="bg-blue-50 border-2 border-blue-200 p-3 text-xs text-blue-950 space-y-1">
                  <p className="font-extrabold text-[11px] uppercase tracking-wider text-blue-900">
                    💡 Logika Rekonstruksi Fixed RR 1:{backtestRR}:
                  </p>
                  <ul className="text-[11px] text-blue-800 list-disc list-inside space-y-0.5 leading-relaxed font-medium">
                    <li><strong>Trade WIN:</strong> Titik Exit menjadi Take Profit (TP). Stop Loss diasumsikan di: <code className="bg-blue-100 px-1 py-0.5 font-bold">SL = Entry ∓ (Profit / {backtestRR})</code>.</li>
                    <li><strong>Trade LOSS:</strong> Titik Exit menjadi Stop Loss (SL). Target TP diasumsikan di: <code className="bg-blue-100 px-1 py-0.5 font-bold">TP = Entry ± (Loss × {backtestRR})</code>.</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t-2 border-[#121212]/15">
                <button
                  type="button"
                  onClick={() => setShowRRModal(false)}
                  className="px-4 py-2.5 text-xs font-bold border-2 border-[#121212] bg-white hover:bg-[#F0F0F0] text-[#121212] transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRRModal(false);
                    runMarketAnalysis();
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider border-2 border-[#121212] bg-[#121212] text-white hover:bg-[#333] shadow-[3px_3px_0px_0px_#1040C0] active:translate-y-0.5 active:shadow-none transition-all"
                >
                  <Zap className="w-4 h-4 text-[#F0C020]" />
                  <span>Lanjutkan Replay (RR 1:{backtestRR})</span>
                </button>
              </div>
            </div>
          </div>
        )}



        {/* ── Contextual Loading State ── */}
        {analyzing && (
          <>
            <ContextualLoading
              title="Menjalankan Replay Validation & What-If Simulation"
              subtitle={
                replayProgress && replayProgress.total > 0
                  ? replayProgress.phase === 'persisting'
                    ? `Menyimpan hasil... ${replayProgress.total} trade selesai diproses`
                    : `Memproses Trade ${replayProgress.current.toLocaleString()} dari ${replayProgress.total.toLocaleString()}`
                  : `Memproses ${trades.length} Trade pada feed ${marketDataSource}`
              }
              description="Engine sedang menelusuri candle pasar riil secara kronologis untuk menguji hit SL/TP dan menghitung pergerakan harga maksimal (MFE) sebelum batas SL tersentuh."
              stages={loadingStages}
              currentStepMessage={
                replayProgress && replayProgress.total > 0
                  ? replayProgress.phase === 'persisting'
                    ? `Menyimpan data ke database...`
                    : replayProgress.phase === 'processing'
                    ? `Trade ${replayProgress.current} / ${replayProgress.total} — ${replayProgress.validSoFar} Valid, ${replayProgress.invalidSoFar} Rejection`
                    : `Tahap ${analysisStep} dari 3: Memproses dataset...`
                  : `Tahap ${analysisStep} dari 3: Memproses dataset...`
              }
            />
            {/* Live progress bar */}
            {replayProgress && replayProgress.total > 0 && (
              <div className="mt-3 border-2 border-[#121212] bg-white p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#717182]" style={{ fontFamily: 'Outfit' }}>
                    {replayProgress.phase === 'persisting' ? 'Menyimpan Data' : 'Progress Replay'}
                  </span>
                  <span className="text-[11px] font-black text-[#121212]" style={{ fontFamily: 'Outfit' }}>
                    {replayProgress.total > 0 ? Math.round((replayProgress.current / replayProgress.total) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full h-2 bg-[#F0F0F0] border border-[#121212] overflow-hidden">
                  <div
                    className="h-full bg-[#1040C0] transition-all duration-300 ease-out"
                    style={{ width: `${replayProgress.total > 0 ? (replayProgress.current / replayProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] font-bold text-[#059669]" style={{ fontFamily: 'Outfit' }}>
                    ✓ {replayProgress.validSoFar.toLocaleString()} Valid
                  </span>
                  {replayProgress.invalidSoFar > 0 && (
                    <span className="text-[10px] font-bold text-[#DC2626]" style={{ fontFamily: 'Outfit' }}>
                      ✗ {replayProgress.invalidSoFar.toLocaleString()} Rejection
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-[#717182]" style={{ fontFamily: 'Outfit' }}>
                    {replayProgress.current.toLocaleString()} / {replayProgress.total.toLocaleString()} trade
                  </span>
                </div>
              </div>
            )}
          </>
        )}


        {/* ── Error State ── */}
        {error && !analyzing && (
          <ActionFeedback
            type="ERROR"
            title="Eksekusi Replay Gagal"
            description={error}
            primaryAction={{
              label: 'Coba Lagi',
              onClick: runMarketAnalysis,
              variant: 'primary',
            }}
          />
        )}

        {/* ── Replay Result Summary Feedback ── */}
        {analyzeResult && !analyzing && (
          <ActionFeedback
            type={analyzeResult.valid > 0 ? 'SUCCESS' : 'WARNING'}
            title={analyzeResult.valid > 0 ? 'Replay Validation Selesai' : 'Replay Selesai dengan Catatan'}
            subtitle={analyzeResult.latestReplayVersion ? `Engine v${analyzeResult.latestReplayVersion}` : undefined}
            description={
              analyzeResult.valid > 0
                ? `${analyzeResult.valid} dari ${analyzeResult.processed} trade berhasil diverifikasi dan dihitung terhadap pergerakan pasar riil.`
                : 'Tidak ada trade yang lolos kriteria validasi pasar. Periksa ketersediaan candle pasar untuk simbol dan rentang waktu sesi ini.'
            }
            metrics={[
              { label: 'Trade Diproses', value: analyzeResult.processed, color: 'neutral' },
              { label: 'Trade Valid', value: analyzeResult.valid, color: 'profit' },
              { label: 'Rejection', value: analyzeResult.invalid, color: analyzeResult.invalid > 0 ? 'loss' : 'neutral' },
              { label: 'Provider', value: marketDataSource, color: 'blue' },
            ]}
          />
        )}

        {/* ── MODE B: Replay Validation Result ── */}
        {validationSummary && !analyzing && (
          <div className="space-y-4 pt-1">
            {/* Mode B Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-emerald-50 border-2 border-emerald-400 text-emerald-950">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider">
                  Mode B — Replay Result
                </span>
                <p className="text-xs font-extrabold font-display">
                  Hasil Validasi: Apakah Candle {validationSummary.provider} {validationSummary.timeframe} mereproduksi exit broker?
                </p>
              </div>
              <p className="text-[11px] text-emerald-800 font-semibold italic shrink-0">
                {slTpStats.hasFullActual
                  ? 'Replay menggunakan SL & TP aktual dari broker. Tidak membuat ulang SL/TP.'
                  : `Replay menggunakan estimasi SL & TP berbasis asumsi Fixed RR 1:${backtestRR}.`}
              </p>
            </div>

            {/* Broker vs Replay Comparison Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Broker WR */}
              <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col gap-1">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182]">Broker Win Rate</p>
                <p className="font-black font-number text-2xl text-[#121212]">
                  {formatPercent(validationSummary.broker.winRate)}
                </p>
                <p className="text-[11px] font-semibold text-[#717182]">
                  {validationSummary.broker.wins}W / {validationSummary.broker.losses}L dari {validationSummary.broker.totalTrades} trade
                </p>
                <div className="mt-1 pt-1 border-t border-dashed border-[#121212]/15 text-[10px] font-bold text-[#717182] uppercase tracking-wider">Ground Truth (MT5)</div>
              </div>

              {/* Replay WR */}
              <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col gap-1">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182]">Replay Win Rate</p>
                <p className="font-black font-number text-2xl text-[#121212]">
                  {formatPercent(validationSummary.replay.allTradesWinRate)}
                </p>
                <p className="text-[11px] font-semibold text-[#717182]">
                  TP hits: {validationSummary.replay.tpHits} dari {validationSummary.broker.totalTrades} trade total
                </p>
                <div className="mt-1 pt-1 border-t border-dashed border-[#121212]/15 text-[10px] font-bold text-[#717182] uppercase tracking-wider">
                  {validationSummary.provider} {validationSummary.timeframe}
                </div>
              </div>

              {/* Difference */}
              <div className={`border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col gap-1 ${
                Math.abs(validationSummary.replay.diffPp) < 1
                  ? 'bg-emerald-50'
                  : Math.abs(validationSummary.replay.diffPp) < 3
                  ? 'bg-amber-50'
                  : 'bg-red-50'
              }`}>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182]">Selisih WR</p>
                <p className={`font-black font-number text-2xl ${
                  Math.abs(validationSummary.replay.diffPp) < 1
                    ? 'text-emerald-700'
                    : Math.abs(validationSummary.replay.diffPp) < 3
                    ? 'text-amber-700'
                    : 'text-red-700'
                }`}>
                  {validationSummary.replay.diffPp >= 0 ? '+' : ''}{validationSummary.replay.diffPp.toFixed(2)} pp
                </p>
                <p className="text-[11px] font-semibold text-[#717182]">
                  {Math.abs(validationSummary.replay.diffPp) < 1 ? '✅ VERY CLOSE' : Math.abs(validationSummary.replay.diffPp) < 3 ? '⚠️ SLIGHT DEVIATION' : '❌ SIGNIFICANT DEVIATION'}
                </p>
                <div className="mt-1 pt-1 border-t border-dashed border-[#121212]/15 text-[10px] font-bold text-[#717182] uppercase tracking-wider">vs Broker Ground Truth</div>
              </div>
            </div>

            {/* Exact Match Card */}
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182] mb-0.5">Exact Match — Replay vs Broker Exit</p>
                  <p className="text-xs text-[#717182] font-medium max-w-lg">
                    Berapa banyak trade dimana replay (candle {validationSummary.provider} {validationSummary.timeframe}) menghasilkan keputusan yang <strong>sama persis</strong> dengan exit broker riil?
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black font-number text-xl text-[#121212]">
                    {validationSummary.replay.exactMatches} / {validationSummary.broker.totalTrades}
                  </p>
                  <p className="font-extrabold font-number text-sm text-emerald-700">
                    {formatPercent(validationSummary.replay.exactMatchPct)} Match
                  </p>
                </div>
              </div>

              {/* Visual Breakdown Bar */}
              <div className="space-y-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#717182]">Breakdown Candle Replay ({validationSummary.broker.totalTrades} Trade Total)</p>

                {/* TP Hit First */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      TP Hit First
                    </span>
                    <span className="font-black font-number text-emerald-700">
                      {validationSummary.replay.tpHits} ({formatPercent(validationSummary.replay.tpPct)})
                    </span>
                  </div>
                  <div className="h-3 bg-[#E5E5E5] rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, validationSummary.replay.tpPct)}%` }}
                    />
                  </div>
                </div>

                {/* SL Hit First */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      SL Hit First
                    </span>
                    <span className="font-black font-number text-red-700">
                      {validationSummary.replay.slHits} ({formatPercent(validationSummary.replay.slPct)})
                    </span>
                  </div>
                  <div className="h-3 bg-[#E5E5E5] rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, validationSummary.replay.slPct)}%` }}
                    />
                  </div>
                </div>

                {/* Neither */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-gray-400 shrink-0" />
                      Neither (SL/TP tidak tersentuh dalam window)
                    </span>
                    <span className="font-black font-number text-gray-600">
                      {validationSummary.replay.neither} ({formatPercent(validationSummary.replay.neitherPct)})
                    </span>
                  </div>
                  <div className="h-3 bg-[#E5E5E5] rounded-full overflow-hidden w-full">
                    <div
                      className="h-full bg-gray-400 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, validationSummary.replay.neitherPct)}%` }}
                    />
                  </div>
                </div>

                {/* Ambiguous */}
                {validationSummary.replay.ambiguous > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                        Intrabar Ambiguous (SL &amp; TP pada candle yang sama)
                      </span>
                      <span className="font-black font-number text-amber-700">
                        {validationSummary.replay.ambiguous} ({formatPercent(validationSummary.replay.ambiguousPct)})
                      </span>
                    </div>
                    <div className="h-3 bg-[#E5E5E5] rounded-full overflow-hidden w-full">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, validationSummary.replay.ambiguousPct)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Semantic Disclaimer */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3.5 text-xs font-medium text-blue-950 space-y-1.5 font-[Outfit]">
              <p className="font-extrabold text-blue-900 uppercase tracking-wider text-[11px]">
                ℹ️ Memahami Hasil Validasi Mode B ({validationSummary.provider} {validationSummary.timeframe})
              </p>
              {slTpStats.hasFullActual ? (
                <p className="leading-relaxed text-blue-900">
                  Mode B menguji apakah pergerakan candle independen ({validationSummary.provider} {validationSummary.timeframe}) menyentuh Stop Loss atau Take Profit riil broker secara kronologis. Replay tidak memodifikasi atau merekonstruksi SL/TP — 100% menggunakan titik SL/TP pembukaan order MT5 Anda.
                </p>
              ) : (
                <p className="leading-relaxed text-blue-900">
                  Karena sesi ini tidak mencatat kolom Stop Loss asli, engine menguji pergerakan candle pasar dengan <strong>asumsi Fixed RR 1:{backtestRR}</strong> (Level Stop Loss dihitung dari jarak Take Profit / Profit riil yang dicapai). Jika terdapat perbedaan Win Rate ({validationSummary.replay.slHits} trade SL Hit First), hal ini menunjukkan bahwa pada data candle pasar riil M1, fluktuasi/wick harga sempat menyentuh level Stop Loss asumsi tersebut sebelum batas profit tercapai.
                </p>
              )}
              {validationSummary.replay.neither > 0 && (
                <p className="leading-relaxed text-blue-800 text-[11px]">
                  <strong>Neither ({validationSummary.replay.neither} Trade):</strong> Baik SL maupun TP tidak tersentuh pada seluruh candle dalam window trade — ini terjadi jika data candle pada feed tidak mencakup seluruh durasi trade.
                </p>
              )}
            </div>
          </div>
        )}


        {/* ── Mode C: What-If Simulation Matrix ── */}

        {rrSimData && rrSimData.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-blue-50 border-2 border-blue-300 text-blue-950">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-[#1040C0] text-white text-[10px] font-black uppercase tracking-wider">
                  Mode C
                </span>
                <p className="text-xs font-extrabold font-display">
                  Matriks Simulasi Target RR Hipotetis ({rrSimData[0]?.total ?? trades.length} Trade)
                </p>
              </div>
              <p className="text-[11px] text-blue-800 font-medium">
                Probabilitas tercapai sebelum menyentuh batas Actual SL
              </p>
            </div>

            {/* Mobile Card List View (< md) */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {rrSimData.map((row) => {
                const isProfitable = row.expectancy > 0;
                const isBreakEven = Math.abs(row.expectancy) <= 0.02;

                return (
                  <div
                    key={row.rrTarget}
                    className={`bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] space-y-3 ${
                      isProfitable ? 'border-l-4 border-l-emerald-600' : 'border-l-4 border-l-gray-400'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm font-display text-[#121212]">
                          1 : {row.rrTarget}
                        </span>
                        <span className="text-[10px] font-bold text-[#717182] uppercase tracking-wider">
                          Target RR
                        </span>
                      </div>
                      <span
                        className={`text-xs font-black font-number px-2 py-0.5 border ${
                          isProfitable
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : isBreakEven
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-red-50 text-red-800 border-red-300'
                        }`}
                      >
                        {row.expectancy >= 0 ? '+' : ''}{formatNumber(row.expectancy, 2)}R EV
                      </span>
                    </div>

                    {/* Win Rate Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-[#717182]">Simulated Win Rate</span>
                        <span
                          className={`font-black font-number ${
                            row.winRate >= 50
                              ? 'text-[var(--profit)]'
                              : row.winRate >= 35
                              ? 'text-amber-600'
                              : 'text-[var(--loss)]'
                          }`}
                        >
                          {formatPercent(row.winRate)}
                        </span>
                      </div>
                      <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden w-full">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            row.winRate >= 50
                              ? 'bg-emerald-500'
                              : row.winRate >= 35
                              ? 'bg-amber-400'
                              : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, row.winRate))}%` }}
                        />
                      </div>
                    </div>

                    {/* Breakdown */}
                    <div className="flex justify-between items-center text-[11px] text-[#717182] font-semibold pt-1 border-t border-[#121212]/10">
                      <span>Kemenangan / Kekalahan:</span>
                      <span className="font-bold font-number">
                        <strong className="text-[var(--profit)] font-black">{row.wins} Wins</strong> /{' '}
                        <strong className="text-[var(--loss)] font-black">{row.losses} Losses</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Target RR</th>
                    <th>Simulated Win Rate</th>
                    <th>Wins / Losses</th>
                    <th>Expectancy (EV per 1R)</th>
                  </tr>
                </thead>
                <tbody>
                  {rrSimData.map((row) => (
                    <tr key={row.rrTarget} className={row.expectancy > 0 ? 'bg-emerald-50/40' : ''}>
                      <td className="font-extrabold text-[#121212] font-display text-[15px]">
                        1 : {row.rrTarget}
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className={`font-extrabold font-number text-[14px] w-14 ${row.winRate >= 50 ? 'text-[var(--profit)]' : row.winRate >= 35 ? 'text-amber-600' : 'text-[var(--loss)]'}`}>
                            {formatPercent(row.winRate)}
                          </span>
                          <div className="flex-1 h-2 bg-[#E5E5E5] rounded-full overflow-hidden max-w-[140px]">
                            <div
                              className={`h-full rounded-full ${row.winRate >= 50 ? 'bg-emerald-500' : row.winRate >= 35 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(100, Math.max(0, row.winRate))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="font-bold font-number">
                        <span className="text-[var(--profit)] font-black">{row.wins}</span>
                        <span className="text-[#717182]"> / </span>
                        <span className="text-[var(--loss)] font-black">{row.losses}</span>
                      </td>
                      <td className={`font-extrabold font-number text-[14px] ${row.expectancy >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                        {row.expectancy >= 0 ? '+' : ''}{formatNumber(row.expectancy, 2)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-[#717182] font-medium flex items-center gap-1.5 pt-1">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                Probabilitas simulasi dihitung dari pergerakan candle pasar riil murni ({marketDataSource} {timeframe}) dari titik entry hingga menyentuh target atau Actual SL.
              </span>
            </p>
          </div>
        )}

        {/* Empty State when no simulation run yet */}
        {!rrSimData && !analyzing && !error && !analyzeResult && (
          <div className="text-center py-10 px-4 border-2 border-dashed border-[#121212]/20 bg-[#F9F9F9] space-y-3">
            <div className="w-12 h-12 bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] flex items-center justify-center mx-auto">
              <Database className="w-6 h-6 text-[#121212]" />
            </div>
            <h4 className="font-extrabold text-sm text-[#121212] font-display">
              Belum Ada Data Simulasi Replay
            </h4>
            <p className="text-xs text-[#717182] max-w-sm mx-auto leading-relaxed">
              Klik tombol "Jalankan Replay Validation" di atas untuk menganalisa seluruh {trades.length} trade sesi ini terhadap data candle pasar riil.
            </p>
            <button
              onClick={runMarketAnalysis}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#121212] text-white text-xs font-extrabold border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] hover:bg-[#333] transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-[#F0C020]" />
              Jalankan Analisis Sekarang
            </button>
          </div>
        )}
      </div>

      {/* ── Estimated sim (legacy, CSV MFE/MAE based) ── */}
      {hasMfeMae && (
        <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#121212] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <SectionLabel label="Target Simulation (Estimasi CSV)" shape="square" color="yellow" icon={<Target className="w-4 h-4" />} />
              <p className="text-[11px] text-[#717182] font-medium mt-1">Berdasarkan MFE/MAE dari data CSV — tanpa verifikasi candle riil.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#717182]">Custom R:</span>
              <input
                type="number"
                step="0.5"
                value={customRR}
                onChange={e => setCustomRR(Number(e.target.value))}
                className="input py-1 px-2 w-20 text-center font-bold text-xs"
              />
            </div>
          </div>

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
                    <td className="text-[#121212] font-bold font-number">
                      <span className="text-[var(--profit)] font-black">{sim.wins}</span> / <span className="text-[var(--loss)] font-black">{sim.losses}</span>
                    </td>
                    <td className={`font-extrabold font-number text-[15px] ${sim.ev >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                      {formatNumber(sim.ev, 2)}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
