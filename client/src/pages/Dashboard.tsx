import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown,
  Clock, Activity, ChevronLeft, Upload, RefreshCw, CheckCircle2,
  AlertTriangle, X, Target, Camera, FileText, Shield, Wallet, Info
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useJournalStore } from '../store/useJournalStore';
import MetricCard from '../components/MetricCard';
import DashboardCharts, { DashboardChartSelection } from '../components/DashboardCharts';
import TradeTable from '../components/TradeTable';
import TradeDetailModal from '../components/TradeDetailModal';
import JournalCalendar from '../components/JournalCalendar';
import { exportElementAsPng, buildExportFilename } from '../utils/exportImage';
import { formatUsd, formatIdr, formatPercent, formatR, formatDuration, formatNumber } from '../utils/formatters';

import RiskRecalculationTab from '../components/AnalyticsTabs/RiskRecalculationTab';
import RRLabTab from '../components/AnalyticsTabs/RRLabTab';
import TimingAnalyticsTab from '../components/AnalyticsTabs/TimingAnalyticsTab';
import StreaksTab from '../components/AnalyticsTabs/StreaksTab';
import PairBreakdownTab from '../components/AnalyticsTabs/PairBreakdownTab';

import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ActionFeedback } from '../components/ui/ActionFeedback';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { EmptyStateGuide } from '../components/help/HelpSystem';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { t } = useTranslation(['dashboard', 'common', 'home']);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    activeSessionId, activeSessionDetails, fetchActiveSession, selectSession,
    updateTrade, deleteTrade, updateSessionCsv, loading, sessions
  } = useJournalStore();

  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  const [analyticsSelection, setAnalyticsSelection] = useState<DashboardChartSelection | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useLocalStorage<'OVERVIEW' | 'RISK' | 'RR_LAB' | 'TIMING' | 'STREAKS' | 'PAIR'>('dashboard_active_tab', 'OVERVIEW');
  const [displayMode, setDisplayMode] = useLocalStorage<'RAW' | 'SIMULATED'>('dashboard_display_mode', 'RAW');

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

  const activeTrades = activeSessionDetails?.trades ?? [];
  const focusedLedgerTrades = useMemo(() => {
    if (!analyticsSelection) return activeTrades;

    const selectionValue = String(analyticsSelection.value).toLowerCase();

    return activeTrades.filter((trade) => {
      if (analyticsSelection.kind === 'trade') {
        return trade.tradeNumber === Number(analyticsSelection.value);
      }

      if (analyticsSelection.kind === 'setup') {
        return (trade.setupTag || 'Tanpa Tag').toLowerCase() === selectionValue;
      }

      if (analyticsSelection.kind === 'day') {
        const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
        const tradeDay = trade.entryTime ? dayNames[new Date(trade.entryTime).getDay()] : '';
        return tradeDay === selectionValue;
      }

      if (analyticsSelection.kind === 'side') {
        return trade.side?.toLowerCase() === selectionValue;
      }

      if (analyticsSelection.kind === 'result') {
        const result = (trade.result || '').toLowerCase();
        return result === selectionValue;
      }

      return true;
    });
  }, [analyticsSelection, activeTrades]);

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
        <div className="w-10 h-10 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
        <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '13px', color: '#717182', fontWeight: 600 }}>
          {t('loading')}
        </p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyStateGuide
        title={t('title')}
        body={t('no_session')}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => navigate('/create-session')}>{t('create_session')}</Button>
            <Button variant="secondary" onClick={() => navigate('/csv-import')}>{t('import_csv')}</Button>
          </div>
        }
      />
    );
  }

  if (!activeSessionId) {
    return (
      <div className="space-y-6">
        <PageHeader
          label={t('session_label')}
          title={t('select_session_title')}
          subtitle={t('select_session_subtitle')}
          labelColor="blue"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sessions.map(s => (
            <div
              key={s.id}
              className="bg-white border border-slate-200 p-5 flex flex-col justify-between hover-lift relative group rounded-xl shadow-sm"
            >
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ backgroundColor: s.sourceMode === 'CSV' ? '#D02020' : s.sourceMode === 'MT5_REPORT' ? '#1040C0' : '#121212' }}
              />
              <div className="flex items-start justify-between gap-3 mt-1 min-w-0">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-[#121212] text-lg font-display truncate" title={s.name}>{s.name}</h3>
                  <p className="text-xs text-[#717182] font-medium mt-1 truncate">
                    {s.symbol} · {s.timeframe} · {s.marketType}
                  </p>
                </div>
                <Badge variant="neutral" className="shrink-0 whitespace-nowrap">{t('home:trades_plural', { count: s.tradeCount })}</Badge>
              </div>
              <Button
                variant="yellow"
                className="mt-6"
                fullWidth
                onClick={() => { selectSession(s.id); navigate(`/dashboard?sessionId=${s.id}`); }}
              >
                {t('open_dashboard')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!activeSessionDetails) {
    return (
      <div className="space-y-6">
        <PageHeader
          label={t('session_label')}
          title={t('loading_detail')}
          subtitle={t('loading_detail_subtitle')}
          labelColor="blue"
        />
        <div className="bg-white border-2 border-[#121212] p-6 shadow-[4px_4px_0px_0px_#121212]">
          <p className="text-sm font-semibold text-[#717182]">{t('loading_incomplete')}</p>
          <Button variant="secondary" className="mt-4" onClick={() => activeSessionId && fetchActiveSession(activeSessionId)}>
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  const { session, trades, metrics } = activeSessionDetails;
  const tradesWithR = trades.filter(t => t.rMultiple !== null && t.rMultiple !== undefined && t.status === 'CLOSED');
  const avgRR = tradesWithR.length > 0 ? tradesWithR.reduce((sum, t) => sum + (t.rMultiple || 0), 0) / tradesWithR.length : null;

  const currentPnl = displayMode === 'RAW' ? metrics.netPnlUsd : metrics.netProfitRecalculated;
  const currentGrowth = displayMode === 'RAW' ? metrics.netPnlPct : metrics.growthPercent;
  const currentEndingBalance = displayMode === 'RAW' ? metrics.endingBalance : metrics.initialBalance + metrics.netProfitRecalculated;
  const currentDrawdown = displayMode === 'RAW' ? metrics.maxDrawdownUsd : metrics.maxDrawdownRecalculated;
  const currentDrawdownPct = displayMode === 'RAW' ? metrics.maxDrawdownPct : metrics.maxDrawdownRecalculatedPct;
  const currentProfitFactor = metrics.profitFactor;

  return (
    <div ref={exportRef} className="space-y-6 animate-fade-in w-full pb-10">
      {/* ── TOP HEADER ── */}
      <div className="flex flex-col gap-4 pb-4 border-b-2 border-[#121212]/10">
        {/* ROW 1: Back + Title + Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5">
            <button
              onClick={() => navigate('/sessions')}
              className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#717182] hover:text-[#121212] transition-colors py-1"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('common:back')}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#121212] tracking-tight font-display">
                {session.name}
              </h1>
              <Badge variant={session.sourceMode === 'CSV' ? 'yellow' : session.sourceMode === 'WEBHOOK' ? 'profit' : 'blue'}>
                {session.sourceMode}
              </Badge>
              <Badge variant="neutral">{session.balanceCurrency === 'CENT' ? 'CENT' : session.balanceCurrency === 'IDR' ? 'IDR' : 'USD'}</Badge>
            </div>
          </div>

          <div className="mode-toggle self-stretch sm:self-auto flex items-stretch">
            <button
              onClick={() => setDisplayMode('RAW')}
              className={`mode-toggle-btn flex-1 sm:flex-initial flex items-center justify-center gap-1.5 min-h-[40px] text-xs font-bold ${displayMode === 'RAW' ? 'active-raw' : ''}`}
            >
              <Wallet className="w-3.5 h-3.5" /> {t('display_mode_raw')}
            </button>
            <button
              onClick={() => setDisplayMode('SIMULATED')}
              className={`mode-toggle-btn flex-1 sm:flex-initial flex items-center justify-center gap-1.5 min-h-[40px] text-xs font-bold ${displayMode === 'SIMULATED' ? 'active-sim' : ''}`}
            >
              <Shield className="w-3.5 h-3.5" /> {t('display_mode_simulated')}
            </button>
          </div>
        </div>

        {/* ROW 2: Session Metadata & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium bg-white px-3.5 py-2 border border-slate-200 rounded-lg shadow-sm">
            <span className="text-[#717182]">Symbol: <strong className="text-[#121212] font-bold">{session.symbol}</strong></span>
            <span className="text-[#121212]/20">|</span>
            <span className="text-[#717182]">TF: <strong className="text-[#121212] font-bold">{session.timeframe}</strong></span>
            <span className="text-[#121212]/20">|</span>
            <span className="text-[#717182]">Kurs: <strong className="text-[#121212] font-bold">{formatIdr(session.usdIdrRate)}</strong></span>
            <span className="text-[#121212]/20">|</span>
            <span className="text-[#717182]">Market: <strong className="text-[#121212] font-bold">{session.marketType}</strong></span>
            {session.notes && (
              <>
                <span className="text-[#121212]/20">|</span>
                <span className="truncate max-w-xs italic text-[#717182]" title={session.notes}>{session.notes}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <Button variant="secondary" onClick={() => setShowUpdatePanel(!showUpdatePanel)} className="text-xs font-bold whitespace-nowrap min-h-[38px]">
              <RefreshCw className="w-3.5 h-3.5" /> {t('update_csv')}
            </Button>
            <Button variant="secondary" onClick={() => window.open(`/reports/session/${session.id}/print`, '_blank')} className="text-xs font-bold whitespace-nowrap min-h-[38px]">
              <FileText className="w-3.5 h-3.5" /> PDF
            </Button>
            <Button variant="secondary" onClick={async () => {
              if (!exportRef.current) return;
              setIsExporting(true);
              try { await exportElementAsPng(exportRef.current, buildExportFilename('analysis', session.name)); }
              catch (e) { alert('Export gagal.'); }
              finally { setIsExporting(false); }
            }} disabled={isExporting} className="text-xs font-bold whitespace-nowrap min-h-[38px]">
              <Camera className="w-3.5 h-3.5" /> {isExporting ? t('exporting') : t('export_png')}
            </Button>
          </div>
        </div>
      </div>

      {/* CSV Update Panel */}
      {showUpdatePanel && (
        <Card variant="default" className="border-[var(--accent-blue)]">
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-widest text-[#121212]">{t('update_csv')}</h3>
              <button onClick={() => setShowUpdatePanel(false)} className="text-[#717182] hover:text-[#121212] p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs sm:text-sm bg-white p-3 border-2 border-[#121212]">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="radio"
                  name="updateMode"
                  value="REPLACE"
                  checked={updateMode === 'REPLACE'}
                  onChange={() => setUpdateMode('REPLACE')}
                  className="w-4 h-4 accent-[#1040C0]"
                />
                {t('update_mode_smart')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="radio"
                  name="updateMode"
                  value="APPEND"
                  checked={updateMode === 'APPEND'}
                  onChange={() => setUpdateMode('APPEND')}
                  className="w-4 h-4 accent-[#1040C0]"
                />
                {t('update_mode_append')}
              </label>
            </div>
            <p className="text-xs text-[#717182]">
              {updateMode === 'REPLACE'
                ? "Smart Merge: Update PnL/Exit Time trade yang sudah ada berdasarkan Ticket ID, dan tambahkan trade baru yang belum ada."
                : "Append Only: Tambahkan trade baru dari CSV ke sesi saat ini. Trade lama tidak akan diubah."}
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFileSelect}
                ref={fileInputRef}
                className="block w-full text-xs sm:text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:border-2 file:border-[#121212]
                  file:text-xs file:font-bold file:uppercase file:tracking-wider
                  file:bg-[#F0F0F0] file:text-[#121212]
                  hover:file:bg-[#E0E0E0] file:cursor-pointer file:transition-colors"
              />
              <Button
                variant="blue"
                onClick={handleCsvUpdate}
                disabled={!csvUpdateFile || isUpdating}
                isLoading={isUpdating}
                className="w-full sm:w-auto whitespace-nowrap text-xs font-black"
              >
                <Upload className="w-4 h-4" /> {t('update_csv')}
              </Button>
            </div>

            {/* Structured Action Feedback for CSV Update */}
            {updateResult && (
              <ActionFeedback
                type={updateResult.ok ? 'SUCCESS' : 'ERROR'}
                title={updateResult.ok ? 'Update Sesi CSV Berhasil' : 'Gagal Memperbarui CSV'}
                description={
                  updateResult.ok
                    ? `${updateResult.validCount || 0} trade berhasil diproses dan disinkronkan ke sesi ini.`
                    : updateResult.error || 'Terjadi kesalahan saat memproses file CSV.'
                }
                metrics={updateResult.ok ? [
                  { label: 'Trade Valid', value: updateResult.validCount || 0, color: 'profit' },
                  { label: 'Invalid / Skipped', value: updateResult.invalidCount || 0, color: 'neutral' },
                  { label: 'Mode', value: updateMode, color: 'blue' },
                ] : undefined}
                primaryAction={updateResult.ok ? {
                  label: 'Segarkan Dashboard',
                  onClick: () => {
                    if (activeSessionId) fetchActiveSession(activeSessionId);
                    setShowUpdatePanel(false);
                  },
                  variant: 'primary',
                } : undefined}
              />
            )}
          </CardBody>
        </Card>
      )}

      {/* ── TABS NAVIGATION (Mobile Scrollable) ── */}
      <div className="flex gap-2 pb-2 overflow-x-auto no-scrollbar scroll-smooth">
        {(['OVERVIEW', 'RISK', 'RR_LAB', 'TIMING', 'STREAKS', 'PAIR'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-3.5 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 min-h-[40px]
              border-2 border-[#121212] 
              ${activeTab === tab ? 'bg-[#121212] text-white shadow-[3px_3px_0px_0px_#D02020]' : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'}
            `}
          >
            {tab === 'OVERVIEW' && t('tab_overview')}
            {tab === 'RISK' && t('tab_risk')}
            {tab === 'RR_LAB' && t('tab_rr_lab')}
            {tab === 'TIMING' && t('tab_timing')}
            {tab === 'STREAKS' && t('tab_streaks')}
            {tab === 'PAIR' && t('tab_pair')}
          </button>
        ))}
      </div>

      {activeTab === 'RISK' && <RiskRecalculationTab sessionId={session.id} session={session} metrics={metrics} trades={trades} />}
      {activeTab === 'RR_LAB' && <RRLabTab metrics={metrics} trades={trades} sessionId={session.id} />}
      {activeTab === 'TIMING' && <TimingAnalyticsTab metrics={metrics} trades={trades} />}
      {activeTab === 'STREAKS' && <StreaksTab metrics={metrics} trades={trades} />}
      {activeTab === 'PAIR' && <PairBreakdownTab metrics={metrics} />}

      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-12 gap-4 w-full">

          {/* ── HEADER DIAGNOSTIC MICRO-STRIP ── */}
          <div className="col-span-12 flex flex-wrap items-center justify-between gap-2 pb-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F0F0F0] border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] rounded-md text-[10px] font-mono font-black uppercase tracking-wider text-[#121212]">
                <Info className="w-3 h-3 text-[#1040C0]" />
                <span>{displayMode === 'RAW' ? t('raw_broker_pnl_active', 'Raw Broker Data') : t('risk_simulation_active', 'Risk Simulation')}</span>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 border-2 border-[#121212] shadow-[1px_1px_0px_0px_#121212] rounded-md text-[10px] font-mono font-black uppercase tracking-wider ${
                  metrics.usedAssumedRR
                    ? 'bg-[#FEF3C7] text-[#92400E]'
                    : 'bg-[#E7F9F0] text-[#059669]'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>{metrics.usedAssumedRR ? t('low_confidence', 'Assumed RR (Low Conf)') : t('high_confidence', 'High Confidence')}</span>
              </div>
            </div>

            <div className="text-[11px] font-mono text-[#717182] font-bold hidden sm:flex items-center gap-2">
              <span>Ending Equity: <strong className="text-[#121212]">{formatUsd(currentEndingBalance)}</strong></span>
              <span>•</span>
              <span>Growth: <strong className={currentGrowth >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}>{currentGrowth >= 0 ? '+' : ''}{formatPercent(currentGrowth)}</strong></span>
            </div>
          </div>

          {/* ── COMPACT 5-TILE PRIMARY PERFORMANCE ROW ── */}
          <div className="col-span-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {/* Tile 1: Net PnL (Hero Tile — featured double-column on mobile) */}
            <div className="col-span-2 md:col-span-1 lg:col-span-1 bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] p-3 rounded-lg flex flex-col justify-between min-w-0">
              <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider gap-1">
                <span className="truncate">{t('net_profit', 'Net Profit')}</span>
                <DollarSign className="w-3.5 h-3.5 text-[#121212] shrink-0" />
              </div>
              <div className={`text-xl sm:text-2xl font-black font-number mt-1 truncate ${currentPnl >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`} title={`${currentPnl >= 0 ? '+' : ''}${formatUsd(currentPnl)}`}>
                {currentPnl >= 0 ? '+' : ''}{formatUsd(currentPnl)}
              </div>
              <div className="text-[10px] font-mono font-semibold text-[#717182] mt-1 truncate" title={`Equity: ${formatUsd(currentEndingBalance)} (${currentGrowth >= 0 ? '+' : ''}{formatPercent(currentGrowth)})`}>
                Equity: {formatUsd(currentEndingBalance)} ({currentGrowth >= 0 ? '+' : ''}{formatPercent(currentGrowth)})
              </div>
            </div>

            {/* Tile 2: Win Rate */}
            <div className="bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] p-3 rounded-lg flex flex-col justify-between min-w-0">
              <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider gap-1">
                <span className="truncate">{t('metric_win_rate', 'Win Rate')}</span>
                <TrendingUp className="w-3.5 h-3.5 text-[#059669] shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-number text-[#059669] mt-1 truncate" title={formatPercent(metrics.winrate)}>
                {formatPercent(metrics.winrate)}
              </div>
              <div className="text-[10px] font-mono font-semibold text-[#717182] mt-1 truncate">
                {metrics.totalTrades} Trades • Loss: {formatPercent(metrics.lossrate)}
              </div>
            </div>

            {/* Tile 3: Profit Factor */}
            <div className="bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] p-3 rounded-lg flex flex-col justify-between min-w-0">
              <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider gap-1">
                <span className="truncate">{t('metric_profit_factor', 'Profit Factor')}</span>
                <Target className="w-3.5 h-3.5 text-[#1040C0] shrink-0" />
              </div>
              <div className={`text-xl sm:text-2xl font-black font-number mt-1 truncate ${currentProfitFactor >= 1.0 ? 'text-[#059669]' : 'text-[#DC2626]'}`} title={currentProfitFactor === Infinity ? '∞' : formatNumber(currentProfitFactor, 2)}>
                {currentProfitFactor === Infinity ? '∞' : formatNumber(currentProfitFactor, 2)}
              </div>
              <div className="text-[10px] font-mono font-semibold text-[#717182] mt-1 truncate">
                Gross Profit / Loss
              </div>
            </div>

            {/* Tile 4: Max Drawdown */}
            <div className="bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] p-3 rounded-lg flex flex-col justify-between min-w-0">
              <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider gap-1">
                <span className="truncate">{t('metric_max_dd', 'Max Drawdown')}</span>
                <TrendingDown className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-black font-number text-[#DC2626] mt-1 truncate" title={formatUsd(-currentDrawdown)}>
                {formatUsd(-currentDrawdown)}
              </div>
              <div className="text-[10px] font-mono font-semibold text-[#DC2626] mt-1 truncate">
                {formatPercent(-currentDrawdownPct)}
              </div>
            </div>

            {/* Tile 5: Avg R:R */}
            <div className="bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] p-3 rounded-lg flex flex-col justify-between min-w-0">
              <div className="flex items-center justify-between text-[#717182] text-[10px] font-black uppercase tracking-wider gap-1">
                <span className="truncate">{t('metric_avg_rr', 'Avg R:R')}</span>
                <Target className="w-3.5 h-3.5 text-[#121212] shrink-0" />
              </div>
              <div className={`text-xl sm:text-2xl font-black font-number mt-1 truncate ${avgRR !== null ? (avgRR >= 1 ? 'text-[#059669]' : 'text-[#DC2626]') : 'text-[#717182]'}`} title={avgRR !== null ? formatR(avgRR) : 'N/A'}>
                {avgRR !== null ? formatR(avgRR) : 'N/A'}
              </div>
              <div className="text-[10px] font-mono font-semibold text-[#717182] mt-1 truncate">
                {tradesWithR.length} Trades with SL
              </div>
            </div>
          </div>

          {/* ── PERFORMANCE VISUALIZER GRID ── */}
          <div className="col-span-12 w-full mt-2">
            <DashboardCharts session={session} trades={trades} onSelectionChange={setAnalyticsSelection} />
          </div>

          {/* ── SECONDARY METRICS GRID ── */}
          <div className="col-span-12 mt-6 space-y-4">
            <SectionLabel label={t('distribution_expectation', 'Distribusi & Harapan Imbal Balik')} shape="diamond" color="yellow" />
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
              <MetricCard title={t('gross_profit', 'Gross Profit')} value={formatUsd(metrics.grossProfit)} valueColorClass="profit" />
              <MetricCard title={t('gross_loss', 'Gross Loss')} value={formatUsd(-metrics.grossLoss)} valueColorClass="loss" />
              <MetricCard title={t('avg_trade_pnl', 'Avg Trade PnL')} value={`${metrics.averageTrade >= 0 ? '+' : ''}${formatUsd(metrics.averageTrade)}`} valueColorClass={metrics.averageTrade >= 0 ? 'profit' : 'loss'} />
              <MetricCard title={t('metric_best_trade')} value={formatUsd(metrics.bestTrade)} valueColorClass="profit" />
              <MetricCard title={t('metric_worst_trade')} value={formatUsd(metrics.worstTrade)} valueColorClass="loss" />

              <MetricCard title={t('win_loss_streak', 'Win / Loss Streak')} value={`W:${metrics.maxConsecutiveWins} / L:${metrics.maxConsecutiveLosses}`} subtitle="Maximum Streak" />
              <MetricCard title={t('metric_expectancy')} value={formatUsd(metrics.expectancyUsd)} valueColorClass={metrics.expectancyUsd >= 0 ? 'profit' : 'loss'} subtitle={metrics.expectancyR !== null ? `E(R): ${formatR(metrics.expectancyR)}` : 'R Term: N/A'} />
              <MetricCard title={t('avg_hold_time', 'Avg Hold Time')} value={formatDuration(metrics.averageTradeDurationMs)} icon={Clock} />
              <MetricCard title={t('mfe_favorable', 'MFE (Favorable)')} value={formatUsd(metrics.averageFavorableExcursionUsd)} valueColorClass="profit" subtitle="Avg Fav Excursion" />
              <MetricCard title={t('mae_adverse', 'MAE (Adverse)')} value={formatUsd(metrics.averageAdverseExcursionUsd)} valueColorClass="loss" subtitle="Avg Adv Excursion" />
            </div>
          </div>
        </div>
      )}

      {/* ── SHARED COMPONENTS (CALENDAR & LEDGER) ── */}
      <div id="calendar" className="w-full mt-8">
        <JournalCalendar mode="BACKTEST" title={t('calendar_title')} trades={trades} currency="USD" storageKey="replayfx:showBacktestCalendar" defaultCollapsed={true} contextType="BACKTEST_SESSION" contextId={session.id} />
      </div>

      <div className="w-full mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel label={analyticsSelection ? `${t('ledger_focus', 'Ledger Fokus')} · ${analyticsSelection.label}` : t('ledger_backtest', 'Ledger Transaksi Backtest')} shape="square" color="blue" />
          {analyticsSelection && (
            <div className="rounded border border-[#121212] bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#121212] shadow-[2px_2px_0px_0px_#121212]">
              {t(focusedLedgerTrades.length === 1 ? 'home:trades' : 'home:trades_plural', { count: focusedLedgerTrades.length })} · {analyticsSelection.value}
            </div>
          )}
        </div>
        <TradeTable trades={focusedLedgerTrades} onSelectTrade={setSelectedTrade} onDeleteTrade={async (id) => await deleteTrade(id)} />
      </div>

      {selectedTrade && (
        <TradeDetailModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} onSave={async (id, up) => await updateTrade(id, up)} />
      )}
    </div>
  );
}
