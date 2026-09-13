import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, AlertCircle, BarChart3, Zap, CheckCircle2, Database, Info, X, HelpCircle, ArrowRight, ArrowUpRight, Activity, Sliders } from 'lucide-react';
import { formatNumber, formatPercent } from '../../utils/formatters';
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

type TabSection = 'OVERVIEW' | 'REPLAY' | 'MATRIX';

export default function RRLabTab({ metrics, trades, sessionId }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabSection>('OVERVIEW');
  const [customRR, setCustomRR] = useState<number>(2.5);
  const [backtestRR, setBacktestRR] = useState<number>(0.75);
  const [marketDataSource, setMarketDataSource] = useState<string>('PARQUET');
  const [timeframe, setTimeframe] = useState<string>('M1');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<number>(0);
  const [analyzeResult, setAnalyzeResult] = useState<ReplaySummaryResult | null>(null);
  const [rrSimData, setRrSimData] = useState<SimRow[] | null>(null);
  const [validationSummary, setValidationSummary] = useState<ReplayValidationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [showMethodologyModal, setShowMethodologyModal] = useState(false);
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


  const avgRealized = metrics?.avgRealizedRR;
  const isAvgPositive = avgRealized !== null && avgRealized >= 0;

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* ── Compact Workstation Header ── */}
      <div className="bg-white border-2 border-[#121212] p-3.5 sm:p-5 shadow-[4px_4px_0px_0px_#121212] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#121212] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#1040C0] shrink-0">
            <Activity className="w-5 h-5 text-[#F0C020]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-[#121212] uppercase tracking-wider font-display">
                Risk-to-Reward Analytics & Replay Lab
              </h2>
              <span className="px-2 py-0.5 bg-[#1040C0] text-white text-[10px] font-black uppercase tracking-wider">
                {trades.length} Trades
              </span>
            </div>
            <p className="text-xs text-[#717182] font-semibold mt-0.5">
              Multi-mode trade evaluation: broker ground truth, canonical tick replay, and what-if simulation matrix.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowMethodologyModal(true)}
          className="self-start sm:self-center flex items-center gap-1.5 px-3 py-2 bg-[#F0F0F0] hover:bg-[#E0E0E0] border-2 border-[#121212] text-xs font-black uppercase tracking-wider text-[#121212] shadow-[2px_2px_0px_0px_#121212] active:translate-y-0.5 active:shadow-none transition-all rounded-none min-h-[40px]"
        >
          <HelpCircle className="w-4 h-4 text-[#1040C0]" />
          <span>Panduan & Metodologi</span>
        </button>
      </div>

      {/* ── Segmented Navigation Bar ── */}
      <div className="flex items-center gap-1 sm:gap-2 p-1 bg-[#F0F0F0] border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('OVERVIEW')}
          className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex-1 min-h-[42px] ${
            activeTab === 'OVERVIEW'
              ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#1040C0]'
              : 'bg-white text-[#121212] hover:bg-[#E5E5E5] border border-[#121212]'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-[#F0C020]" />
          <span>Overview & Realized R</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REPLAY')}
          className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex-1 min-h-[42px] ${
            activeTab === 'REPLAY'
              ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#1040C0]'
              : 'bg-white text-[#121212] hover:bg-[#E5E5E5] border border-[#121212]'
          }`}
        >
          <Zap className="w-4 h-4 text-[#10B981]" />
          <span>Replay Engine & Validation</span>
          {validationSummary && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('MATRIX')}
          className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex-1 min-h-[42px] ${
            activeTab === 'MATRIX'
              ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#1040C0]'
              : 'bg-white text-[#121212] hover:bg-[#E5E5E5] border border-[#121212]'
          }`}
        >
          <Target className="w-4 h-4 text-[#3B82F6]" />
          <span>What-If Simulation Matrix</span>
          {rrSimData && rrSimData.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
          )}
        </button>
      </div>

      {/* ── SECTION 1: OVERVIEW & REALIZED R STAT CARDS (MODE A) ── */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {/* Stat Card 1: Realized RR */}
            <div className="bg-white border-2 border-[#121212] p-3.5 sm:p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#717182]">
                <span>Realized RR</span>
                <span className="w-2 h-2 rounded-full bg-[#1040C0]" />
              </div>
              <div className="my-2 sm:my-3">
                <div className={`text-xl sm:text-2xl md:text-3xl font-black font-number truncate ${isAvgPositive ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                  {avgRealized !== null ? `${avgRealized >= 0 ? '+' : ''}${formatNumber(avgRealized, 2)}R` : 'N/A'}
                </div>
              </div>
              <div className="text-[10px] sm:text-xs font-bold text-[#717182] pt-1.5 border-t border-[#121212]/15 flex items-center justify-between">
                <span>Median</span>
                <span className="font-extrabold text-[#121212]">
                  {metrics?.medianRR !== null ? `${formatNumber(metrics.medianRR, 2)}R` : 'N/A'}
                </span>
              </div>
            </div>

            {/* Stat Card 2: Planned RR */}
            <div className="bg-white border-2 border-[#121212] p-3.5 sm:p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#717182]">
                <span>Planned RR</span>
                <span className="w-2 h-2 rounded-full bg-[#F0C020]" />
              </div>
              <div className="my-2 sm:my-3">
                <div className="text-xl sm:text-2xl md:text-3xl font-black font-number text-[#121212] truncate">
                  {metrics?.avgPlannedRR !== null ? `1 : ${formatNumber(metrics.avgPlannedRR, 2)}` : 'N/A'}
                </div>
              </div>
              <div className="text-[10px] sm:text-xs font-bold text-[#717182] pt-1.5 border-t border-[#121212]/15 flex items-center justify-between">
                <span>Target Plan</span>
                <span className="font-extrabold text-[#1040C0]">
                  {metrics?.avgPlannedRR !== null ? `1:${formatNumber(metrics.avgPlannedRR, 3)}` : 'No data'}
                </span>
              </div>
            </div>

            {/* Stat Card 3: Win Rate */}
            <div className="bg-white border-2 border-[#121212] p-3.5 sm:p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#717182]">
                <span>Broker Win Rate</span>
                <span className="w-2 h-2 rounded-full bg-[var(--profit)]" />
              </div>
              <div className="my-2 sm:my-3">
                <div className="text-xl sm:text-2xl md:text-3xl font-black font-number text-[var(--profit)] truncate">
                  {formatPercent(metrics?.winrate || 0)}
                </div>
                <div className="w-full bg-[#E5E5E5] h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-[var(--profit)] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, metrics?.winrate || 0))}%` }}
                  />
                </div>
              </div>
              <div className="text-[10px] sm:text-xs font-bold text-[#717182] pt-1.5 border-t border-[#121212]/15 flex items-center justify-between">
                <span>Total Closed</span>
                <span className="font-extrabold text-[#121212]">{trades.length} Trades</span>
              </div>
            </div>

            {/* Stat Card 4: Strategy Profile */}
            <div className="bg-white border-2 border-[#121212] p-3.5 sm:p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#717182]">
                <span>Strategy Profile</span>
                <span className="w-2 h-2 rounded-full bg-[#121212]" />
              </div>
              <div className="my-2 sm:my-3">
                <span className="inline-block px-2 py-1 bg-[#F0F0F0] border border-[#121212] text-xs font-black uppercase tracking-wider text-[#121212] truncate max-w-full">
                  {metrics?.avgPlannedRR !== null && metrics.avgPlannedRR < 1.0 ? 'Fixed Sub-1.0 RR' : 'Standard / Dynamic RR'}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs font-bold text-[#717182] pt-1.5 border-t border-[#121212]/15 flex items-center justify-between">
                <span>SL / TP Ground Truth</span>
                <span className={`font-extrabold ${slTpStats.hasFullActual ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {slTpStats.hasFullActual ? '100% Detected' : `${slTpStats.withBoth}/${slTpStats.total}`}
                </span>
              </div>
            </div>
          </div>

          {/* Quick CTA to Replay */}
          <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#121212] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-sm sm:text-base text-[#121212] uppercase tracking-wider">
                Siap Memvalidasi Terhadap Data Pasar Riil?
              </h3>
              <p className="text-xs text-[#717182] font-semibold mt-0.5">
                Uji apakah exit strategi Anda sesuai pergerakan tick/candle canonical dan eksplorasi simulasi target RR.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('REPLAY')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#121212] hover:bg-[#333] text-white text-xs font-black uppercase tracking-wider border-2 border-[#121212] shadow-[2px_2px_0px_0px_#1040C0] active:translate-y-0.5 active:shadow-none transition-all whitespace-nowrap min-h-[42px]"
            >
              <span>Buka Replay Engine</span>
              <ArrowUpRight className="w-4 h-4 text-[#F0C020]" />
            </button>
          </div>
        </div>
      )}

      {/* ── SECTION 2: REPLAY ENGINE & VALIDATION (MODE B) ── */}
      {activeTab === 'REPLAY' && (
        <div className="space-y-4">
          {/* Controls Card */}
          <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#121212] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#121212]/10 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-[#121212] uppercase tracking-wider font-display flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#F0C020]" />
                  Replay Validation Engine
                </h3>
                <p className="text-xs text-[#717182] font-semibold mt-0.5">
                  Verifikasi eksekusi trade terhadap data pasar historis bebas look-ahead bias.
                </p>
              </div>

              {/* Inline Status Pill */}
              <div className="self-start sm:self-auto">
                {slTpStats.hasFullActual ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 border border-emerald-400 text-emerald-900 text-[11px] font-black uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    {slTpStats.withBoth}/{slTpStats.total} SL & TP Detected (Ground Truth Ready)
                  </span>
                ) : slTpStats.hasNoSLTP ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-400 text-amber-900 text-[11px] font-black uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    Target RR Diperlukan (Missing SL/TP)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 border border-blue-400 text-blue-900 text-[11px] font-black uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    Hybrid Mode ({slTpStats.withAny}/{slTpStats.total} SL/TP)
                  </span>
                )}
              </div>
            </div>

            {/* Inputs & Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#717182]">
                  Sumber Data Pasar
                </label>
                <select
                  value={marketDataSource}
                  onChange={e => setMarketDataSource(e.target.value)}
                  disabled={analyzing}
                  className="w-full bg-[#F9F9F9] border-2 border-[#121212] py-2 px-3 text-xs font-bold text-[#121212] outline-none cursor-pointer"
                >
                  <option value="PARQUET">Parquet Tick Data (725M Canonical Ticks)</option>
                  <option value="DUKASCOPY">Dukascopy (Historical Ticks / Candles)</option>
                  <option value="MT5">MT5 (Historical/Live)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#717182]">
                  Timeframe Replay
                </label>
                <select
                  value={timeframe}
                  onChange={e => setTimeframe(e.target.value)}
                  disabled={analyzing}
                  className="w-full bg-[#F9F9F9] border-2 border-[#121212] py-2 px-3 text-xs font-bold text-[#121212] outline-none cursor-pointer"
                >
                  <option value="M1">M1 (1 Menit, Disarankan)</option>
                  <option value="M5">M5 (5 Menit)</option>
                  <option value="M15">M15 (15 Menit)</option>
                  <option value="M30">M30 (30 Menit)</option>
                  <option value="H1">H1 (1 Jam)</option>
                  <option value="H4">H4 (4 Jam)</option>
                  <option value="D1">D1 (Daily)</option>
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (slTpStats.hasFullActual) {
                      runMarketAnalysis();
                    } else {
                      setShowRRModal(true);
                    }
                  }}
                  disabled={analyzing || !sessionId}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] transition-all min-h-[42px] ${
                    analyzing
                      ? 'bg-[#E5E5E5] text-[#717182] cursor-not-allowed'
                      : 'bg-[#121212] text-white hover:bg-[#333] active:translate-y-0.5 active:shadow-none'
                  }`}
                >
                  {analyzing ? (
                    <>
                      <span className="animate-spin text-sm">⟳</span>
                      <span>Sedang Memproses Replay...</span>
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
          </div>

          {/* Loading Stage */}
          {analyzing && (
            <div className="space-y-3">
              <ContextualLoading
                title="Menjalankan Replay Validation & What-If Simulation"
                subtitle={
                  replayProgress && replayProgress.total > 0
                    ? replayProgress.phase === 'persisting'
                      ? `Menyimpan hasil... ${replayProgress.total} trade selesai diproses`
                      : `Memproses Trade ${replayProgress.current.toLocaleString()} dari ${replayProgress.total.toLocaleString()}`
                    : `Memproses ${trades.length} Trade pada feed ${marketDataSource}`
                }
                description="Engine sedang menelusuri data pasar riil secara kronologis untuk memvalidasi hit SL/TP."
                stages={loadingStages}
                currentStepMessage={
                  replayProgress && replayProgress.total > 0
                    ? replayProgress.phase === 'persisting'
                      ? `Menyimpan data ke database...`
                      : replayProgress.phase === 'processing'
                      ? `Trade ${replayProgress.current} / ${replayProgress.total} · ${replayProgress.validSoFar} Valid, ${replayProgress.invalidSoFar} Rejection`
                      : `Tahap ${analysisStep} dari 3: Memproses dataset...`
                    : `Tahap ${analysisStep} dari 3: Memproses dataset...`
                }
              />
              {replayProgress && replayProgress.total > 0 && (
                <div className="border-2 border-[#121212] bg-white p-3.5 shadow-[2px_2px_0px_0px_#121212]">
                  <div className="flex justify-between items-center mb-1.5 text-[11px] font-black uppercase tracking-wider text-[#121212]">
                    <span>{replayProgress.phase === 'persisting' ? 'Menyimpan Data' : 'Progress Replay'}</span>
                    <span>{replayProgress.total > 0 ? Math.round((replayProgress.current / replayProgress.total) * 100) : 0}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-[#F0F0F0] border border-[#121212] overflow-hidden">
                    <div
                      className="h-full bg-[#1040C0] transition-all duration-300 ease-out"
                      style={{ width: `${replayProgress.total > 0 ? (replayProgress.current / replayProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] font-bold text-[#717182]">
                    <span className="text-[var(--profit)] font-black">✓ {replayProgress.validSoFar.toLocaleString()} Valid</span>
                    {replayProgress.invalidSoFar > 0 && (
                      <span className="text-[var(--loss)] font-black">✗ {replayProgress.invalidSoFar.toLocaleString()} Rejection</span>
                    )}
                    <span>{replayProgress.current.toLocaleString()} / {replayProgress.total.toLocaleString()} trades</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Feedback */}
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

          {/* Summary Result Feedback */}
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

          {/* Validation Summary Metrics */}
          {validationSummary && !analyzing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Broker WR */}
                <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col justify-between">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#717182]">Broker Win Rate</p>
                  <p className="font-black font-number text-2xl text-[#121212] my-1">
                    {formatPercent(validationSummary.broker.winRate)}
                  </p>
                  <p className="text-[11px] font-bold text-[#717182] pt-1 border-t border-[#121212]/15">
                    {validationSummary.broker.wins}W / {validationSummary.broker.losses}L · Ground Truth
                  </p>
                </div>

                {/* Replay WR */}
                <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col justify-between">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#717182]">Replay Win Rate</p>
                  <p className="font-black font-number text-2xl text-[#121212] my-1">
                    {formatPercent(validationSummary.replay.allTradesWinRate)}
                  </p>
                  <p className="text-[11px] font-bold text-[#717182] pt-1 border-t border-[#121212]/15">
                    TP Hits: {validationSummary.replay.tpHits} · {validationSummary.provider} {validationSummary.timeframe}
                  </p>
                </div>

                {/* Diff */}
                <div className={`border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] flex flex-col justify-between ${
                  Math.abs(validationSummary.replay.diffPp) < 1
                    ? 'bg-emerald-50'
                    : Math.abs(validationSummary.replay.diffPp) < 3
                    ? 'bg-amber-50'
                    : 'bg-red-50'
                }`}>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#717182]">Selisih WR</p>
                  <p className={`font-black font-number text-2xl my-1 ${
                    Math.abs(validationSummary.replay.diffPp) < 1
                      ? 'text-emerald-700'
                      : Math.abs(validationSummary.replay.diffPp) < 3
                      ? 'text-amber-700'
                      : 'text-red-700'
                  }`}>
                    {validationSummary.replay.diffPp >= 0 ? '+' : ''}{validationSummary.replay.diffPp.toFixed(2)} pp
                  </p>
                  <p className="text-[11px] font-bold text-[#717182] pt-1 border-t border-[#121212]/15">
                    {Math.abs(validationSummary.replay.diffPp) < 1 ? 'Very Close' : Math.abs(validationSummary.replay.diffPp) < 3 ? 'Slight Deviation' : 'Significant Deviation'}
                  </p>
                </div>
              </div>

              {/* Breakdown Card */}
              <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[3px_3px_0px_0px_#121212] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wider text-[#121212]">
                    Breakdown Replay ({validationSummary.broker.totalTrades} Trade Total)
                  </p>
                  <span className="text-xs font-extrabold text-emerald-700 font-number">
                    {validationSummary.replay.exactMatches} / {validationSummary.broker.totalTrades} ({formatPercent(validationSummary.replay.exactMatchPct)}) Exact Matches
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  {/* TP Hit */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-[#121212]">
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                        TP Hit First
                      </span>
                      <span className="text-emerald-700 font-number font-black">
                        {validationSummary.replay.tpHits} ({formatPercent(validationSummary.replay.tpPct)})
                      </span>
                    </div>
                    <div className="h-2.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, validationSummary.replay.tpPct)}%` }} />
                    </div>
                  </div>

                  {/* SL Hit */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-[#121212]">
                        <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                        SL Hit First
                      </span>
                      <span className="text-red-700 font-number font-black">
                        {validationSummary.replay.slHits} ({formatPercent(validationSummary.replay.slPct)})
                      </span>
                    </div>
                    <div className="h-2.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, validationSummary.replay.slPct)}%` }} />
                    </div>
                  </div>

                  {/* Neither */}
                  {validationSummary.replay.neither > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-[#717182]">
                          <span className="w-2.5 h-2.5 bg-gray-400 rounded-full" />
                          Neither (Out of Window)
                        </span>
                        <span className="text-gray-600 font-number font-black">
                          {validationSummary.replay.neither} ({formatPercent(validationSummary.replay.neitherPct)})
                        </span>
                      </div>
                      <div className="h-2.5 bg-[#E5E5E5] rounded-full overflow-hidden">
                        <div className="h-full bg-gray-400 rounded-full" style={{ width: `${Math.min(100, validationSummary.replay.neitherPct)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!validationSummary && !analyzing && !error && (
            <div className="text-center py-8 px-4 border-2 border-dashed border-[#121212]/20 bg-[#F9F9F9] space-y-2">
              <Database className="w-8 h-8 text-[#121212] mx-auto opacity-70" />
              <h4 className="font-black text-sm text-[#121212] uppercase tracking-wider">
                Replay Belum Dijalankan
              </h4>
              <p className="text-xs text-[#717182] max-w-sm mx-auto font-semibold">
                Tekan tombol "Jalankan Replay Validation" di atas untuk memulai penelusuran pasar historis.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 3: WHAT-IF SIMULATION MATRIX (MODE C) ── */}
      {activeTab === 'MATRIX' && (
        <div className="space-y-4">
          {rrSimData && rrSimData.length > 0 ? (
            <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#121212] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#121212]/10 pb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-[#121212] uppercase tracking-wider font-display flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#1040C0]" />
                    Matriks Simulasi Target RR Hipotetis
                  </h3>
                  <p className="text-xs text-[#717182] font-semibold mt-0.5">
                    Probabilitas tercapai sebelum menyentuh batas Actual SL pada {rrSimData[0]?.total ?? trades.length} trade.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-[#F0F0F0] border border-[#121212] text-xs font-black text-[#121212] uppercase tracking-wider self-start sm:self-auto">
                  {marketDataSource} {timeframe}
                </span>
              </div>

              {/* Mobile View: Cards (< md) */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {rrSimData.map(row => {
                  const isProfitable = row.expectancy > 0;
                  return (
                    <div
                      key={row.rrTarget}
                      className={`bg-[#F9F9F9] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212] space-y-2 ${
                        isProfitable ? 'border-l-4 border-l-emerald-600' : 'border-l-4 border-l-gray-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm font-display text-[#121212]">
                          Target 1 : {row.rrTarget}
                        </span>
                        <span
                          className={`text-xs font-black font-number px-2 py-0.5 border ${
                            isProfitable
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-red-50 text-red-800 border-red-300'
                          }`}
                        >
                          {row.expectancy >= 0 ? '+' : ''}{formatNumber(row.expectancy, 2)}R EV
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-[#717182]">Win Rate</span>
                          <span className={`font-black font-number ${row.winRate >= 50 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                            {formatPercent(row.winRate)}
                          </span>
                        </div>
                        <div className="h-2 bg-[#E5E5E5] rounded-full overflow-hidden w-full">
                          <div
                            className={`h-full rounded-full ${row.winRate >= 50 ? 'bg-emerald-500' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(100, Math.max(0, row.winRate))}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-[#717182] font-semibold pt-1 border-t border-[#121212]/10">
                        <span>Hasil:</span>
                        <span className="font-bold font-number">
                          <strong className="text-[var(--profit)] font-black">{row.wins} W</strong> /{' '}
                          <strong className="text-[var(--loss)] font-black">{row.losses} L</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-[13px] font-[Outfit]">
                  <thead>
                    <tr className="bg-[#121212] text-white">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Target RR</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Simulated Win Rate</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Wins / Losses</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Expectancy (EV per 1R)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-[#121212]/10">
                    {rrSimData.map(row => (
                      <tr key={row.rrTarget} className={`hover:bg-[#F0F0F0] transition-colors ${row.expectancy > 0 ? 'bg-emerald-50/40' : ''}`}>
                        <td className="px-4 py-3 font-black text-[#121212] font-display text-[14px]">
                          1 : {row.rrTarget}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`font-extrabold font-number text-[13px] w-14 ${row.winRate >= 50 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                              {formatPercent(row.winRate)}
                            </span>
                            <div className="flex-1 h-2 bg-[#E5E5E5] rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className={`h-full rounded-full ${row.winRate >= 50 ? 'bg-emerald-500' : 'bg-red-400'}`}
                                style={{ width: `${Math.min(100, Math.max(0, row.winRate))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold font-number">
                          <span className="text-[var(--profit)] font-black">{row.wins}</span>
                          <span className="text-[#717182]"> / </span>
                          <span className="text-[var(--loss)] font-black">{row.losses}</span>
                        </td>
                        <td className={`px-4 py-3 font-black font-number text-[14px] ${row.expectancy >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                          {row.expectancy >= 0 ? '+' : ''}{formatNumber(row.expectancy, 2)}R
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 px-4 border-2 border-dashed border-[#121212]/20 bg-[#F9F9F9] space-y-3">
              <Target className="w-8 h-8 text-[#121212] mx-auto opacity-70" />
              <h4 className="font-black text-sm text-[#121212] uppercase tracking-wider">
                Matriks Simulasi Belum Dihitung
              </h4>
              <p className="text-xs text-[#717182] max-w-sm mx-auto font-semibold">
                Jalankan replay validation terlebih dahulu untuk mengkalkulasi probabilitas ekskursi target RR alternatif.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('REPLAY')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#121212] text-white text-xs font-black uppercase tracking-wider border-2 border-[#121212] shadow-[2px_2px_0px_0px_#1040C0]"
              >
                <Zap className="w-3.5 h-3.5 text-[#F0C020]" />
                Ke Halaman Replay
              </button>
            </div>
          )}

          {/* Optional: CSV MFE/MAE Estimate Table */}
          {hasMfeMae && (
            <div className="bg-white border-2 border-[#121212] p-4 sm:p-5 shadow-[3px_3px_0px_0px_#121212] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-[#121212] uppercase tracking-wider">
                    Target Simulation (Estimasi MFE/MAE CSV)
                  </h4>
                  <p className="text-[11px] text-[#717182] font-medium">Berdasarkan ekskursi statis dari file CSV.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#717182]">Custom R:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={customRR}
                    onChange={e => setCustomRR(Number(e.target.value))}
                    className="border-2 border-[#121212] py-1 px-2 w-20 text-center font-bold text-xs bg-[#F9F9F9]"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-[13px] font-[Outfit]">
                  <thead>
                    <tr className="bg-[#F0F0F0] border-b-2 border-[#121212]">
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider">Target R</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider">Simulated Winrate</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider">Wins / Losses</th>
                      <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider">Expected Value (EV)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-b border-[#121212]">
                    {estimatedSims.map((sim, idx) => sim && (
                      <tr key={idx} className="hover:bg-[#F9F9F9]">
                        <td className="px-3 py-2 font-black text-[#121212] font-display">{sim.targetR}R</td>
                        <td className="px-3 py-2 font-bold font-number">{formatPercent(sim.winrate)}</td>
                        <td className="px-3 py-2 font-bold font-number">
                          <span className="text-[var(--profit)] font-black">{sim.wins}W</span> / <span className="text-[var(--loss)] font-black">{sim.losses}L</span>
                        </td>
                        <td className={`px-3 py-2 font-black font-number ${sim.ev >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
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
      )}

      {/* ── RR Reconstruction Modal Dialog (When SL/TP is missing) ── */}
      {showRRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div
            className="fixed inset-0 bg-[#121212]/70 backdrop-blur-xs transition-opacity"
            onClick={() => setShowRRModal(false)}
            aria-hidden="true"
          />
          <div
            className="relative bg-white border-3 sm:border-4 border-[#121212] p-4 sm:p-6 max-w-lg w-full shadow-[8px_8px_0px_0px_#121212] space-y-4 animate-scale-up z-10"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 border-b-2 border-[#121212]/15 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#F0C020] text-[#121212] border-2 border-[#121212] font-black text-sm">
                  📐
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-[#121212] uppercase tracking-wider font-display">
                    Tentukan Target RR Rekonstruksi
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-[#717182] font-bold uppercase tracking-wider">
                    {trades.length} Trade Tanpa Kolom SL & TP Riil
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRRModal(false)}
                className="w-8 h-8 border border-[#121212] bg-[#F0F0F0] hover:bg-[#E0E0E0] flex items-center justify-center text-[#121212]"
                aria-label="Tutup dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#3F3F46]">
              <p className="font-medium leading-relaxed">
                Tentukan target <strong>Rasio Risk-to-Reward (RR)</strong> strategi Anda agar engine dapat merekonstruksi level risiko per trade:
              </p>

              <div className="bg-[#F9F9F9] border-2 border-[#121212] p-3.5 space-y-2.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#121212]">
                  Rasio Target Risk-to-Reward (RR)
                </label>
                <div className="flex items-center gap-2 bg-white border-2 border-[#121212] px-3 py-2 shadow-[2px_2px_0px_0px_#121212]">
                  <span className="text-base font-black text-[#121212] font-mono">1 :</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.10"
                    max="10.0"
                    value={backtestRR}
                    onChange={e => setBacktestRR(parseFloat(e.target.value) || 1.0)}
                    className="w-full text-base font-black text-[#121212] outline-none bg-transparent font-mono"
                    autoFocus
                  />
                  <span className="text-[10px] font-black text-[#121212] uppercase tracking-wider bg-[#F0F0F0] px-2 py-0.5 border border-[#121212]">
                    Target
                  </span>
                </div>

                {/* Preset Badges */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#717182] mr-1">Preset:</span>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setBacktestRR(r)}
                      className={`px-2 py-0.5 text-xs font-black border-2 border-[#121212] transition-all ${
                        backtestRR === r
                          ? 'bg-[#121212] text-white shadow-[1px_1px_0px_0px_#1040C0]'
                          : 'bg-white text-[#121212] hover:bg-[#E5E5E5]'
                      }`}
                    >
                      1:{r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t-2 border-[#121212]/15">
              <button
                type="button"
                onClick={() => setShowRRModal(false)}
                className="px-4 py-2 text-xs font-bold border-2 border-[#121212] bg-white hover:bg-[#F0F0F0] text-[#121212]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRRModal(false);
                  runMarketAnalysis();
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider border-2 border-[#121212] bg-[#121212] text-white hover:bg-[#333] shadow-[2px_2px_0px_0px_#1040C0]"
              >
                <Zap className="w-4 h-4 text-[#F0C020]" />
                <span>Lanjutkan Replay (RR 1:{backtestRR})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Methodology & Guidelines Modal ── */}
      {showMethodologyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div
            className="fixed inset-0 bg-[#121212]/70 backdrop-blur-xs transition-opacity"
            onClick={() => setShowMethodologyModal(false)}
            aria-hidden="true"
          />
          <div
            className="relative bg-white border-3 sm:border-4 border-[#121212] p-4 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-[10px_10px_0px_0px_#121212] space-y-4 animate-scale-up z-10 font-[Outfit]"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 border-b-2 border-[#121212]/15 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#1040C0] text-white border-2 border-[#121212] font-black text-sm">
                  📚
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-[#121212] uppercase tracking-wider font-display">
                    Metodologi & Panduan RR Lab Pro
                  </h3>
                  <p className="text-[11px] text-[#717182] font-bold uppercase tracking-wider">
                    Arsitektur Evaluasi Tiga Mode Terpisah
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMethodologyModal(false)}
                className="w-8 h-8 border border-[#121212] bg-[#F0F0F0] hover:bg-[#E0E0E0] flex items-center justify-center text-[#121212]"
                aria-label="Tutup panduan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-[#121212] leading-relaxed">
              <div className="p-3 bg-[#F9F9F9] border-2 border-[#121212] space-y-1">
                <h4 className="font-black text-xs uppercase tracking-wider text-[#1040C0]">
                  1. Mode A: Broker Ground Truth
                </h4>
                <p className="text-[#3F3F46]">
                  Mengukur hasil riil berdasarkan data statement akun atau terminal MT5. Menghitung rata-rata dan median Realized R-Multiples serta rasio Planned RR yang direncanakan.
                </p>
              </div>

              <div className="p-3 bg-[#F9F9F9] border-2 border-[#121212] space-y-1">
                <h4 className="font-black text-xs uppercase tracking-wider text-[#059669]">
                  2. Mode B: Replay Validation Engine
                </h4>
                <p className="text-[#3F3F46]">
                  Menguji pergerakan harga kronologis tick-by-tick (Parquet 725M ticks / Dukascopy M1) dari saat order dibuka hingga ditutup. Memverifikasi apakah Stop Loss atau Take Profit riil tersentuh terlebih dahulu tanpa asumsi look-ahead bias.
                </p>
              </div>

              <div className="p-3 bg-[#F9F9F9] border-2 border-[#121212] space-y-1">
                <h4 className="font-black text-xs uppercase tracking-wider text-[#D97706]">
                  3. Mode C: What-If Target RR Matrix
                </h4>
                <p className="text-[#3F3F46]">
                  Menyimulasikan skenario alternatif jika target Take Profit diubah dari 0.25R hingga 10.0R. Setiap trade dievaluasi terhadap Maximum Favorable Excursion (MFE) sebelum menyentuh batas Actual SL.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t-2 border-[#121212]/15">
              <button
                type="button"
                onClick={() => setShowMethodologyModal(false)}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider border-2 border-[#121212] bg-[#121212] text-white hover:bg-[#333]"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

