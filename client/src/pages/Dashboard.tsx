import React, { useState, useRef, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Percent, 
  BarChart3, 
  Layers, 
  Clock, 
  Activity, 
  ShieldAlert, 
  Award,
  ChevronLeft,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  Target,
  Zap,
  Hash,
  Camera,
  FileText
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useJournalStore } from '../store/useJournalStore';
import MetricCard from '../components/MetricCard';
import DashboardCharts from '../components/DashboardCharts';
import TradeTable from '../components/TradeTable';
import TradeDetailModal from '../components/TradeDetailModal';
import JournalCalendar from '../components/JournalCalendar';
import { exportElementAsPng, buildExportFilename } from '../utils/exportImage';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';
import { 
  formatUsd, 
  formatIdr, 
  formatPercent, 
  formatR, 
  formatDuration, 
  formatNumber 
} from '../utils/formatters';

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { 
    activeSessionId, 
    activeSessionDetails, 
    fetchActiveSession, 
    selectSession, 
    updateTrade, 
    deleteTrade,
    updateSessionCsv,
    loading,
    sessions
  } = useJournalStore();

  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  
  // CSV Update Panel State
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [updateMode, setUpdateMode] = useState<'REPLACE' | 'APPEND'>('REPLACE');
  const [csvUpdateFile, setCsvUpdateFile] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ ok: boolean; validCount?: number; invalidCount?: number; error?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const querySessionId = searchParams.get('sessionId');
    if (querySessionId && querySessionId !== activeSessionId) {
      selectSession(querySessionId);
      return;
    }
    if (!querySessionId && activeSessionId) {
      fetchActiveSession(activeSessionId);
    }
  }, [searchParams, activeSessionId, fetchActiveSession, selectSession]);

  const openSessionDashboard = (id: string) => {
    selectSession(id);
    navigate(`/dashboard?sessionId=${id}`);
  };

  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setCsvUpdateFile(f); setUpdateResult(null); }
  };

  const handleCsvUpdate = async () => {
    if (!csvUpdateFile || !activeSessionId) return;
    setIsUpdating(true);
    setUpdateResult(null);
    const result = await updateSessionCsv(activeSessionId, csvUpdateFile, updateMode);
    setUpdateResult(result);
    setIsUpdating(false);
    if (result.ok) {
      setCsvUpdateFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading && !activeSessionDetails) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-10 h-10 border-4 border-accentCyan border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-[#707a8a] font-semibold animate-pulse">Memuat analisa sesi...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="p-4 bg-[#2b3139]/40 rounded-full">
          <BarChart3 className="w-12 h-12 text-[#707a8a]" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Analisa Dashboard</h2>
          <p className="text-[#929aa5] max-w-md">Anda belum memiliki sesi backtest. Buat sesi baru atau import CSV untuk melihat analisa kinerja trading.</p>
        </div>
        <div className="flex items-center space-x-4">
          <Link to="/create-session" className="px-6 py-2.5 bg-accentCyan text-white font-bold rounded-xl hover:bg-accentCyan/80 transition">
            Create Session
          </Link>
          <Link to="/csv-import" className="px-6 py-2.5 bg-[#2b3139] text-white font-bold rounded-xl hover:bg-[#363e47] transition">
            Import CSV
          </Link>
        </div>
      </div>
    );
  }

  if (!activeSessionId || !activeSessionDetails) {
    return (
      <div className="py-12 space-y-6">
        <div className="text-center space-y-4">
          <BarChart3 className="w-12 h-12 text-[#707a8a] mx-auto" />
          <h2 className="text-2xl font-bold text-white">Pilih Sesi Backtest</h2>
          <p className="text-[#929aa5]">Pilih sesi untuk melihat Dashboard Analisa.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessions.map(s => (
            <div key={s.id} className="bn-card border border-[#2b3139] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{s.name}</h3>
                  <p className="text-xs text-[#707a8a] mt-1">{s.symbol} · {s.timeframe} · {s.marketType}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#929aa5]">{s.tradeCount} trades</span>
              </div>
              <button
                onClick={() => openSessionDashboard(s.id)}
                className="mt-4 w-full px-4 py-2 bg-[#fcd535] hover:bg-[#f0b90b] text-[#181a20] rounded-lg text-xs font-bold"
              >
                Open Dashboard
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { session, trades, metrics } = activeSessionDetails;

  // Compute average R:R from trades that have rMultiple set
  const tradesWithR = trades.filter(t => t.rMultiple !== null && t.rMultiple !== undefined && t.status === 'CLOSED');
  const avgRR = tradesWithR.length > 0 
    ? tradesWithR.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / tradesWithR.length
    : null;

  // Handler functions
  const handleSaveTradeJournal = async (tradeId: string, updates: any) => {
    return await updateTrade(tradeId, updates);
  };

  const handleDeleteTradeRecord = async (tradeId: string) => {
    await deleteTrade(tradeId);
  };

  const currencyLabel = session.balanceCurrency === 'CENT' ? 'CENT' 
    : session.balanceCurrency === 'IDR' ? 'IDR' : 'USD';

  return (
    <div ref={exportRef} className="space-y-8">
      {/* Session Breadcrumb & Title Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <button 
            onClick={() => navigate('/sessions')}
            className="flex items-center space-x-1.5 text-xs text-[#707a8a] hover:text-[#0ecb81] transition font-semibold group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Semua Sesi</span>
          </button>
          
          <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2 flex-wrap">
            <span>{session.name}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider ${
              session.sourceMode === 'CSV' 
                ? 'bg-[rgba(14,203,129,0.1)] text-[#0ecb81] border border-[rgba(14,203,129,0.2)]' 
                : session.sourceMode === 'WEBHOOK' 
                ? 'bg-accentEmerald/15 text-[#0ecb81] border border-accentEmerald/20' 
                : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
            }`}>
              {session.sourceMode}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#2b3139] text-[#929aa5] border border-[#3a4149]">
              {currencyLabel}
            </span>
          </h1>
          <PageGuide
            title="Backtest Analysis Dashboard"
            purpose="Dashboard ini membaca trade dari CSV/manual/webhook lalu mengubahnya menjadi analisis performa, calendar, dan ledger."
            steps={[
              'Baca ringkasan Net PnL, winrate, profit factor, dan drawdown.',
              'Cek chart untuk melihat apakah equity curve stabil atau banyak penurunan tajam.',
              'Klik calendar day untuk melihat detail harian.',
              'Gunakan trade table untuk review entry, exit, setup, dan catatan.',
              'Export PNG untuk share cepat atau Preview PDF Report untuk arsip.'
            ]}
            outputs={[
              'Key metrics menunjukkan performa matematis strategi.',
              'Calendar membantu menemukan hari overtrade, loss day, dan recovery day.',
              'Ledger dipakai untuk audit trade satu per satu.'
            ]}
            warnings={[
              'Winrate tinggi belum tentu bagus jika average loss lebih besar dari average win.',
              'CSV yang salah format bisa menghasilkan invalid rows. Cek Import History jika data terasa aneh.'
            ]}
            nextAction="Jika data backtest bertambah, gunakan Update CSV atau Smart Merge dari session card."
          />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#707a8a] font-medium">
            <span>Symbol: <strong className="text-[#eaecef]">{session.symbol}</strong></span>
            <span>•</span>
            <span>TF: <strong className="text-[#eaecef]">{session.timeframe}</strong></span>
            <span>•</span>
            <span>Kurs: <strong className="text-[#eaecef]">1 USD = {formatIdr(session.usdIdrRate)}</strong></span>
            <span>•</span>
            <span className="text-[#707a8a]">Market: <strong className="text-[#eaecef]">{session.marketType}</strong></span>
            {session.notes && (
              <>
                <span>•</span>
                <span className="truncate max-w-xs md:max-w-md italic text-[#707a8a]" title={session.notes}>{session.notes}</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            data-export-hide
            onClick={async () => {
              if (!exportRef.current) return;
              setIsExporting(true);
              try {
                await exportElementAsPng(
                  exportRef.current,
                  buildExportFilename('analysis', session.name)
                );
              } catch (e) {
                alert('Export gagal. Coba lagi.');
              } finally {
                setIsExporting(false);
              }
            }}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition border bg-[#2b3139] border-[#3a4149] text-[#eaecef] hover:border-[rgba(252,213,53,0.3)] hover:text-[#fcd535]"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Generating...' : 'Export PNG'}</span>
          </button>
          <button
            data-export-hide
            onClick={() => window.open(`/reports/session/${session.id}/print`, '_blank')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition border bg-[#2b3139] border-[#3a4149] text-[#eaecef] hover:border-[rgba(252,213,53,0.3)] hover:text-[#fcd535]"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Preview PDF Report</span>
          </button>
          <button
            onClick={() => { setShowUpdatePanel(!showUpdatePanel); setUpdateResult(null); }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition border ${
              showUpdatePanel 
                ? 'bg-[rgba(14,203,129,0.12)] border-[rgba(14,203,129,0.3)] text-[#0ecb81]' 
                : 'bg-[#2b3139]/80 border-[#3a4149] text-[#eaecef] hover:border-[rgba(14,203,129,0.25)] hover:text-[#0ecb81]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${showUpdatePanel ? 'animate-spin-once' : ''}`} />
            <span>Update CSV</span>
          </button>
        </div>
      </div>

      <HelpCard title="Cara membaca dashboard">
        Fokus pertama pada kombinasi Net PnL, Profit Factor, Drawdown, dan Expected/R multiple. Strategi yang terlihat menang banyak tetap berisiko kalau drawdown besar atau loss day terkonsentrasi.
      </HelpCard>

      {/* Inline CSV Update Panel */}
      {showUpdatePanel && (
        <div className=" rounded-xl border border-[rgba(14,203,129,0.2)] p-5 space-y-4 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-gradient-to-br from-accentCyan/5 to-transparent pointer-events-none" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-[rgba(14,203,129,0.08)] rounded-lg">
                <Upload className="w-4 h-4 text-[#0ecb81]" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Update Data CSV</h4>
                <p className="text-[10px] text-[#707a8a] font-medium">Upload ulang CSV untuk sesi <span className="text-[#0ecb81]">{session.name}</span></p>
              </div>
            </div>
            <button onClick={() => setShowUpdatePanel(false)} className="p-1.5 hover:bg-[#2b3139] rounded-lg transition text-[#707a8a] hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Mode Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#707a8a] uppercase tracking-wider">Mode Update</label>
              <select
                value={updateMode}
                onChange={(e: any) => setUpdateMode(e.target.value)}
                className="w-full bg-[#1e2329] border border-[#3a4149] outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold focus:border-[#fcd535]/50 transition"
              >
                <option value="REPLACE">Ganti Semua (Replace)</option>
                <option value="APPEND">Tambahkan (Append)</option>
              </select>
            </div>

            {/* File Picker */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#707a8a] uppercase tracking-wider">File CSV Baru</label>
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvFileSelect}
                  className="hidden"
                  id="dashboard-csv-update"
                />
                <label
                  htmlFor="dashboard-csv-update"
                  className="flex items-center space-x-2 w-full bg-[#1e2329] border border-[#3a4149] rounded-lg p-2.5 text-xs cursor-pointer hover:border-[rgba(14,203,129,0.3)] transition"
                >
                  <Upload className="w-3.5 h-3.5 text-[#707a8a] flex-shrink-0" />
                  <span className={`truncate ${csvUpdateFile ? 'text-gray-200 font-semibold' : 'text-[#707a8a]'}`}>
                    {csvUpdateFile ? csvUpdateFile.name : 'Pilih file .csv...'}
                  </span>
                </label>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleCsvUpdate}
              disabled={!csvUpdateFile || isUpdating}
              className="w-full py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition "
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Jalankan Update</span>
                </>
              )}
            </button>
          </div>

          {/* Result feedback */}
          {updateResult && (
            <div className={`relative flex items-center space-x-2 px-4 py-3 rounded-xl text-xs font-semibold border ${
              updateResult.ok 
                ? 'bg-[rgba(14,203,129,0.08)] border-accentEmerald/20 text-[#0ecb81]' 
                : 'bg-[rgba(246,70,93,0.08)] border-[rgba(246,70,93,0.2)] text-[#f6465d]'
            }`}>
              {updateResult.ok 
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <AlertTriangle className="w-4 h-4 shrink-0" />
              }
              <span>
                {updateResult.ok 
                  ? `✓ CSV berhasil diperbarui — ${updateResult.validCount} trade valid, ${updateResult.invalidCount} invalid.`
                  : `✗ ${updateResult.error}`
                }
              </span>
            </div>
          )}

          {updateMode === 'REPLACE' && !updateResult && (
            <div className="relative flex items-start space-x-2 px-3 py-2.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-[10px] text-orange-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Mode Replace akan menghapus semua data trade lama di sesi ini sebelum mengimport.</span>
            </div>
          )}
        </div>
      )}

      {/* METRICS DISPLAY GRIDS */}
      <div className="space-y-6">
        
        {/* GROUP 1: CAPITAL ACCOUNT SUMMARY */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-[#707a8a] uppercase tracking-widest flex items-center space-x-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Modal & Saldo Akun</span>
            {session.balanceCurrency === 'CENT' && (
              <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-bold">CENT → USD Converted</span>
            )}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard 
              title="Modal Awal" 
              value={formatUsd(metrics.initialBalance)} 
              icon={DollarSign}
            />
            <MetricCard 
              title="Saldo Akhir" 
              value={formatUsd(metrics.endingBalance)} 
              icon={Layers}
              glow={true}
            />
            <MetricCard 
              title="Net PnL USD" 
              value={`${metrics.netPnlUsd >= 0 ? '+' : ''}${formatUsd(metrics.netPnlUsd)}`} 
              valueColorClass={metrics.netPnlUsd >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}
              icon={metrics.netPnlUsd >= 0 ? TrendingUp : TrendingDown}
            />
            <MetricCard 
              title="Net PnL IDR" 
              value={`${metrics.netPnlIdr >= 0 ? '+' : ''}${formatIdr(metrics.netPnlIdr)}`} 
              valueColorClass={metrics.netPnlUsd >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}
              icon={DollarSign}
            />
            <MetricCard 
              title="Net PnL (%)" 
              value={`${metrics.netPnlUsd >= 0 ? '+' : ''}${formatPercent(metrics.netPnlPct)}`} 
              valueColorClass={metrics.netPnlUsd >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}
              icon={Percent}
            />
          </div>
        </div>

        {/* GROUP 2: LEDGER DISTRIBUTION & FINANCIAL AVERAGES */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-[#707a8a] uppercase tracking-widest flex items-center space-x-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Kinerja & Distribusi Transaksi</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <MetricCard 
              title="Total Trades" 
              value={metrics.totalTrades} 
              subtitle={`Win: ${metrics.win} | Loss: ${metrics.loss} | BE: ${metrics.breakEven}`}
            />
            <MetricCard 
              title="Win Rate" 
              value={formatPercent(metrics.winrate)} 
              valueColorClass="text-[#0ecb81]"
              subtitle={`Loss Rate: ${formatPercent(metrics.lossrate)}`}
            />
            <MetricCard 
              title="Profit Factor" 
              value={metrics.profitFactor === Infinity ? '∞' : formatNumber(metrics.profitFactor, 2)} 
              valueColorClass={metrics.profitFactor >= 1.5 ? 'text-[#0ecb81]' : metrics.profitFactor >= 1.0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}
              subtitle="GP / GL Ratio"
            />
            <MetricCard 
              title="Gross Profit" 
              value={formatUsd(metrics.grossProfit)} 
              valueColorClass="text-[#0ecb81]"
            />
            <MetricCard 
              title="Gross Loss" 
              value={formatUsd(-metrics.grossLoss)} 
              valueColorClass="text-[#f6465d]"
            />
            <MetricCard 
              title="Avg Trade PnL" 
              value={`${metrics.averageTrade >= 0 ? '+' : ''}${formatUsd(metrics.averageTrade)}`} 
              valueColorClass={metrics.averageTrade >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}
              subtitle={`Win: ${formatUsd(metrics.averageWin)} | Loss: ${formatUsd(-metrics.averageLoss)}`}
            />
          </div>
        </div>

        {/* GROUP 3: RISK, R:R & EXPECTANCY */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-[#707a8a] uppercase tracking-widest flex items-center space-x-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Risiko, R:R & Harapan Imbal Balik</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <MetricCard 
              title="Best Trade" 
              value={formatUsd(metrics.bestTrade)} 
              valueColorClass="text-[#0ecb81]"
            />
            <MetricCard 
              title="Worst Trade" 
              value={formatUsd(metrics.worstTrade)} 
              valueColorClass="text-[#f6465d]"
            />
            <MetricCard 
              title="Max Drawdown" 
              value={formatUsd(-metrics.maxDrawdownUsd)} 
              valueColorClass="text-[#f6465d]"
              subtitle={formatPercent(-metrics.maxDrawdownPct)}
            />
            <MetricCard 
              title="Beruntun Win/Loss" 
              value={`W:${metrics.maxConsecutiveWins} / L:${metrics.maxConsecutiveLosses}`}
              subtitle="Streak Maksimum"
            />
            {/* Average R:R — computed from trades with rMultiple */}
            <MetricCard 
              title={`Avg R:R (${tradesWithR.length} trades)`}
              value={avgRR !== null ? formatR(avgRR) : 'N/A'}
              valueColorClass={avgRR !== null ? (avgRR >= 1 ? 'text-[#0ecb81]' : avgRR >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]') : 'text-[#707a8a]'}
              subtitle={metrics.netR !== null ? `Net R: ${formatR(metrics.netR)}` : session.riskMode === 'NO_R' ? 'R Calc: Off' : 'Belum ada R'}
              icon={Target}
            />
            <MetricCard 
              title="Expectancy" 
              value={formatUsd(metrics.expectancyUsd)}
              valueColorClass={metrics.expectancyUsd >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}
              subtitle={metrics.expectancyR !== null ? `E(R): ${formatR(metrics.expectancyR)}` : 'R Term: N/A'}
            />
          </div>
        </div>

        {/* GROUP 4: HOLD TIMES & DIRECTIONAL RATIOS */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-[#707a8a] uppercase tracking-widest flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Excursion & Sisi Winrate</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
              title="Avg Hold Time" 
              value={formatDuration(metrics.averageTradeDurationMs)} 
              icon={Clock}
            />
            <MetricCard 
              title="Avg Fav Excursion (MFE)" 
              value={formatUsd(metrics.averageFavorableExcursionUsd)} 
              icon={Award}
              valueColorClass="text-[#0ecb81]"
            />
            <MetricCard 
              title="Avg Adv Excursion (MAE)" 
              value={formatUsd(metrics.averageAdverseExcursionUsd)} 
              icon={ShieldAlert}
              valueColorClass="text-[#f6465d]"
            />
            <MetricCard 
              title="Winrate LONG vs SHORT" 
              value={`L:${formatPercent(metrics.longWinrate)} / S:${formatPercent(metrics.shortWinrate)}`}
              icon={Activity}
            />
          </div>
        </div>
      </div>

      {/* RECHARTS PLOTS COMPONENT */}
      <div className=" rounded-xl border border-[#2b3139] p-6">
        <h3 className="text-xs font-bold text-[#929aa5] uppercase tracking-wider mb-6 flex items-center space-x-1.5">
          <BarChart3 className="w-4 h-4 text-[#0ecb81]" />
          <span>Visualisasi Grafik Performa</span>
        </h3>
        <DashboardCharts session={session} trades={trades} />
      </div>

      <div id="calendar">
        <JournalCalendar
          mode="BACKTEST"
          title="Journal Calendar"
          trades={trades}
          currency="USD"
          storageKey="replayfx:showBacktestCalendar"
          defaultCollapsed={true}
          contextType="BACKTEST_SESSION"
          contextId={session.id}
        />
      </div>

      {/* TRADE TABLE LEDGER COMPONENT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#929aa5] uppercase tracking-widest flex items-center space-x-2">
            <Hash className="w-4 h-4 text-[#707a8a]" />
            <span>Ledger Transaksi Backtest</span>
          </h3>
          {/* Quick R summary badge */}
          {avgRR !== null && (
            <div className={`flex items-center space-x-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border ${
              avgRR >= 1 ? 'bg-[rgba(14,203,129,0.08)] border-accentEmerald/20 text-[#0ecb81]'
              : avgRR >= 0 ? 'bg-[rgba(14,203,129,0.08)] border-[rgba(14,203,129,0.2)] text-[#0ecb81]'
              : 'bg-[rgba(246,70,93,0.08)] border-[rgba(246,70,93,0.2)] text-[#f6465d]'
            }`}>
              <Target className="w-3 h-3" />
              <span>Avg R:R — {formatR(avgRR)} dari {tradesWithR.length} trade</span>
            </div>
          )}
        </div>
        <TradeTable 
          trades={trades} 
          onSelectTrade={(t) => setSelectedTrade(t)}
          onDeleteTrade={handleDeleteTradeRecord}
        />
      </div>

      {/* DETAIL MODAL EDITOR */}
      {selectedTrade && (
        <TradeDetailModal 
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onSave={handleSaveTradeJournal}
        />
      )}
    </div>
  );
}
