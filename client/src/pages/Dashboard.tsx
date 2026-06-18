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
  Hash
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import MetricCard from '../components/MetricCard';
import DashboardCharts from '../components/DashboardCharts';
import TradeTable from '../components/TradeTable';
import TradeDetailModal from '../components/TradeDetailModal';
import { 
  formatUsd, 
  formatIdr, 
  formatPercent, 
  formatR, 
  formatDuration, 
  formatNumber 
} from '../utils/formatters';

export default function Dashboard() {
  const { 
    activeSessionId, 
    activeSessionDetails, 
    fetchActiveSession, 
    selectSession, 
    updateTrade, 
    deleteTrade,
    updateSessionCsv,
    loading 
  } = useJournalStore();

  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  
  // CSV Update Panel State
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [updateMode, setUpdateMode] = useState<'REPLACE' | 'APPEND'>('REPLACE');
  const [csvUpdateFile, setCsvUpdateFile] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ ok: boolean; validCount?: number; invalidCount?: number; error?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeSessionId) {
      fetchActiveSession(activeSessionId);
    }
  }, [activeSessionId, fetchActiveSession]);

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
        <p className="text-xs text-gray-500 font-semibold animate-pulse">Memuat analisa sesi...</p>
      </div>
    );
  }

  if (!activeSessionDetails) {
    return (
      <div className="text-center py-12 space-y-4 glass-card rounded-2xl border border-gray-800 p-8">
        <p className="text-gray-500">Tidak ada sesi backtest aktif yang terpilih.</p>
        <button
          onClick={() => selectSession(null)}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-semibold"
        >
          Kembali ke Beranda
        </button>
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
    <div className="space-y-8">
      {/* Session Breadcrumb & Title Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-gray-800/60">
        <div className="space-y-2">
          <button 
            onClick={() => selectSession(null)}
            className="flex items-center space-x-1.5 text-xs text-gray-500 hover:text-accentCyan transition font-semibold group"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Semua Sesi</span>
          </button>
          
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2 flex-wrap">
            <span>{session.name}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider ${
              session.sourceMode === 'CSV' 
                ? 'bg-accentCyan/15 text-accentCyan border border-accentCyan/20' 
                : session.sourceMode === 'WEBHOOK' 
                ? 'bg-accentEmerald/15 text-accentEmerald border border-accentEmerald/20' 
                : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
            }`}>
              {session.sourceMode}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
              {currencyLabel}
            </span>
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 font-medium">
            <span>Symbol: <strong className="text-gray-300">{session.symbol}</strong></span>
            <span>•</span>
            <span>TF: <strong className="text-gray-300">{session.timeframe}</strong></span>
            <span>•</span>
            <span>Kurs: <strong className="text-gray-300">1 USD = {formatIdr(session.usdIdrRate)}</strong></span>
            <span>•</span>
            <span className="text-gray-500">Market: <strong className="text-gray-300">{session.marketType}</strong></span>
            {session.notes && (
              <>
                <span>•</span>
                <span className="truncate max-w-xs md:max-w-md italic text-gray-600" title={session.notes}>{session.notes}</span>
              </>
            )}
          </div>
        </div>

        {/* Update CSV Button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { setShowUpdatePanel(!showUpdatePanel); setUpdateResult(null); }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition border ${
              showUpdatePanel 
                ? 'bg-accentCyan/20 border-accentCyan/40 text-accentCyan' 
                : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:border-accentCyan/30 hover:text-accentCyan'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${showUpdatePanel ? 'animate-spin-once' : ''}`} />
            <span>Update CSV</span>
          </button>
        </div>
      </div>

      {/* Inline CSV Update Panel */}
      {showUpdatePanel && (
        <div className="glass-card rounded-2xl border border-accentCyan/20 p-5 space-y-4 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-gradient-to-br from-accentCyan/5 to-transparent pointer-events-none" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-accentCyan/10 rounded-lg">
                <Upload className="w-4 h-4 text-accentCyan" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Update Data CSV</h4>
                <p className="text-[10px] text-gray-500 font-medium">Upload ulang CSV untuk sesi <span className="text-accentCyan">{session.name}</span></p>
              </div>
            </div>
            <button onClick={() => setShowUpdatePanel(false)} className="p-1.5 hover:bg-gray-800 rounded-lg transition text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Mode Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mode Update</label>
              <select
                value={updateMode}
                onChange={(e: any) => setUpdateMode(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold focus:border-accentCyan/50 transition"
              >
                <option value="REPLACE">Ganti Semua (Replace)</option>
                <option value="APPEND">Tambahkan (Append)</option>
              </select>
            </div>

            {/* File Picker */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">File CSV Baru</label>
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
                  className="flex items-center space-x-2 w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs cursor-pointer hover:border-accentCyan/40 transition"
                >
                  <Upload className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  <span className={`truncate ${csvUpdateFile ? 'text-gray-200 font-semibold' : 'text-gray-500'}`}>
                    {csvUpdateFile ? csvUpdateFile.name : 'Pilih file .csv...'}
                  </span>
                </label>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleCsvUpdate}
              disabled={!csvUpdateFile || isUpdating}
              className="w-full py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition cyan-glow"
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
                ? 'bg-accentEmerald/10 border-accentEmerald/20 text-accentEmerald' 
                : 'bg-lossRed/10 border-lossRed/20 text-lossRed'
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
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-1.5">
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
              valueColorClass={metrics.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'}
              icon={metrics.netPnlUsd >= 0 ? TrendingUp : TrendingDown}
            />
            <MetricCard 
              title="Net PnL IDR" 
              value={`${metrics.netPnlIdr >= 0 ? '+' : ''}${formatIdr(metrics.netPnlIdr)}`} 
              valueColorClass={metrics.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'}
              icon={DollarSign}
            />
            <MetricCard 
              title="Net PnL (%)" 
              value={`${metrics.netPnlUsd >= 0 ? '+' : ''}${formatPercent(metrics.netPnlPct)}`} 
              valueColorClass={metrics.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'}
              icon={Percent}
            />
          </div>
        </div>

        {/* GROUP 2: LEDGER DISTRIBUTION & FINANCIAL AVERAGES */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-1.5">
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
              valueColorClass="text-accentEmerald"
              subtitle={`Loss Rate: ${formatPercent(metrics.lossrate)}`}
            />
            <MetricCard 
              title="Profit Factor" 
              value={metrics.profitFactor === Infinity ? '∞' : formatNumber(metrics.profitFactor, 2)} 
              valueColorClass={metrics.profitFactor >= 1.5 ? 'text-accentEmerald' : metrics.profitFactor >= 1.0 ? 'text-accentCyan' : 'text-lossRed'}
              subtitle="GP / GL Ratio"
            />
            <MetricCard 
              title="Gross Profit" 
              value={formatUsd(metrics.grossProfit)} 
              valueColorClass="text-accentEmerald"
            />
            <MetricCard 
              title="Gross Loss" 
              value={formatUsd(-metrics.grossLoss)} 
              valueColorClass="text-lossRed"
            />
            <MetricCard 
              title="Avg Trade PnL" 
              value={`${metrics.averageTrade >= 0 ? '+' : ''}${formatUsd(metrics.averageTrade)}`} 
              valueColorClass={metrics.averageTrade >= 0 ? 'text-accentEmerald' : 'text-lossRed'}
              subtitle={`Win: ${formatUsd(metrics.averageWin)} | Loss: ${formatUsd(-metrics.averageLoss)}`}
            />
          </div>
        </div>

        {/* GROUP 3: RISK, R:R & EXPECTANCY */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-1.5">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Risiko, R:R & Harapan Imbal Balik</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <MetricCard 
              title="Best Trade" 
              value={formatUsd(metrics.bestTrade)} 
              valueColorClass="text-accentEmerald"
            />
            <MetricCard 
              title="Worst Trade" 
              value={formatUsd(metrics.worstTrade)} 
              valueColorClass="text-lossRed"
            />
            <MetricCard 
              title="Max Drawdown" 
              value={formatUsd(-metrics.maxDrawdownUsd)} 
              valueColorClass="text-lossRed"
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
              valueColorClass={avgRR !== null ? (avgRR >= 1 ? 'text-accentEmerald' : avgRR >= 0 ? 'text-accentCyan' : 'text-lossRed') : 'text-gray-500'}
              subtitle={metrics.netR !== null ? `Net R: ${formatR(metrics.netR)}` : session.riskMode === 'NO_R' ? 'R Calc: Off' : 'Belum ada R'}
              icon={Target}
            />
            <MetricCard 
              title="Expectancy" 
              value={formatUsd(metrics.expectancyUsd)}
              valueColorClass={metrics.expectancyUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'}
              subtitle={metrics.expectancyR !== null ? `E(R): ${formatR(metrics.expectancyR)}` : 'R Term: N/A'}
            />
          </div>
        </div>

        {/* GROUP 4: HOLD TIMES & DIRECTIONAL RATIOS */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-1.5">
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
              valueColorClass="text-accentEmerald"
            />
            <MetricCard 
              title="Avg Adv Excursion (MAE)" 
              value={formatUsd(metrics.averageAdverseExcursionUsd)} 
              icon={ShieldAlert}
              valueColorClass="text-lossRed"
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
      <div className="glass-card rounded-2xl border border-gray-800 p-6">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6 flex items-center space-x-1.5">
          <BarChart3 className="w-4 h-4 text-accentCyan" />
          <span>Visualisasi Grafik Performa</span>
        </h3>
        <DashboardCharts session={session} trades={trades} />
      </div>

      {/* TRADE TABLE LEDGER COMPONENT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-2">
            <Hash className="w-4 h-4 text-gray-500" />
            <span>Ledger Transaksi Backtest</span>
          </h3>
          {/* Quick R summary badge */}
          {avgRR !== null && (
            <div className={`flex items-center space-x-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border ${
              avgRR >= 1 ? 'bg-accentEmerald/10 border-accentEmerald/20 text-accentEmerald'
              : avgRR >= 0 ? 'bg-accentCyan/10 border-accentCyan/20 text-accentCyan'
              : 'bg-lossRed/10 border-lossRed/20 text-lossRed'
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
