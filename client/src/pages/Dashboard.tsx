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
              className="bg-white border-2 border-[#121212] p-5 flex flex-col justify-between hover-lift relative group"
              style={{ boxShadow: '4px 4px 0px 0px #121212' }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ backgroundColor: s.sourceMode === 'CSV' ? '#D02020' : s.sourceMode === 'MT5_REPORT' ? '#1040C0' : '#121212' }}
              />
              <div className="flex items-start justify-between mt-1">
                <div>
                  <h3 className="font-bold text-[#121212] text-lg font-display truncate">{s.name}</h3>
                  <p className="text-xs text-[#717182] font-medium mt-1">
                    {s.symbol} · {s.timeframe} · {s.marketType}
                  </p>
                </div>
                <Badge variant="neutral">{t('home:trades_plural', { count: s.tradeCount })}</Badge>
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
      <div className="flex flex-col gap-4 pb-5 border-b-2 border-[#121212]/10">
        {/* ROW 1 */}
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div className="space-y-3">
            <button
              onClick={() => navigate('/sessions')}
              className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#717182] hover:text-[#121212] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('common:back')}
            </button>
            <h1 className="text-3xl md:text-4xl font-extrabold text-[#121212] tracking-tight flex items-center gap-3 font-display">
              {session.name}
              <Badge variant={session.sourceMode === 'CSV' ? 'yellow' : session.sourceMode === 'WEBHOOK' ? 'profit' : 'blue'}>
                {session.sourceMode}
              </Badge>
              <Badge variant="neutral">{session.balanceCurrency === 'CENT' ? 'CENT' : session.balanceCurrency === 'IDR' ? 'IDR' : 'USD'}</Badge>
            </h1>
          </div>

          <div className="mode-toggle">
            <button
              onClick={() => setDisplayMode('RAW')}
              className={`mode-toggle-btn flex items-center gap-1.5 ${displayMode === 'RAW' ? 'active-raw' : ''}`}
            >
              <Wallet className="w-3.5 h-3.5" /> {t('display_mode_raw')}
            </button>
            <button
              onClick={() => setDisplayMode('SIMULATED')}
              className={`mode-toggle-btn flex items-center gap-1.5 ${displayMode === 'SIMULATED' ? 'active-sim' : ''}`}
            >
              <Shield className="w-3.5 h-3.5" /> {t('display_mode_simulated')}
            </button>
          </div>
        </div>

        {/* ROW 2 */}
        <div className="flex flex-wrap justify-between items-start gap-4 mt-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium bg-white px-4 py-2 border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212]">
            <span className="text-[#717182]">Symbol: <strong className="text-[#121212] font-bold">{session.symbol}</strong></span>
            <span className="text-[#121212]/20">|</span>
            <span className="text-[#717182]">TF: <strong className="text-[#121212] font-bold">{session.timeframe}</strong></span>
            <span className="text-[#121212]/20">|</span>
            <span className="text-[#717182]">Kurs: <strong className="text-[#121212] font-bold">1 USD = {formatIdr(session.usdIdrRate)}</strong></span>
            <span className="text-[#121212]/20">|</span>
            <span className="text-[#717182]">Market: <strong className="text-[#121212] font-bold">{session.marketType}</strong></span>
            {session.notes && (
              <>
                <span className="text-[#121212]/20">|</span>
                <span className="truncate max-w-xs italic text-[#717182]" title={session.notes}>{session.notes}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setShowUpdatePanel(!showUpdatePanel)}>
              <RefreshCw className="w-3.5 h-3.5" /> {t('update_csv')}
            </Button>
            <Button variant="secondary" onClick={() => window.open(`/reports/session/${session.id}/print`, '_blank')}>
              <FileText className="w-3.5 h-3.5" /> PDF
            </Button>
            <Button variant="secondary" onClick={async () => {
              if (!exportRef.current) return;
              setIsExporting(true);
              try { await exportElementAsPng(exportRef.current, buildExportFilename('analysis', session.name)); }
              catch (e) { alert('Export gagal.'); }
              finally { setIsExporting(false); }
            }} disabled={isExporting}>
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
              <button onClick={() => setShowUpdatePanel(false)} className="text-[#717182] hover:text-[#121212]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 text-sm bg-white p-3 border-2 border-[#121212]">
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
                className="block w-full text-sm text-gray-500
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
                className="whitespace-nowrap"
              >
                <Upload className="w-4 h-4" /> {t('update_csv')}
              </Button>
            </div>

            {updateResult && (
              <div className={`p-4 border-2 ${updateResult.ok ? 'border-[var(--profit)] bg-[var(--profit-dim)]' : 'border-[var(--loss)] bg-[var(--loss-dim)]'}`}>
                <div className="flex items-start gap-2">
                  {updateResult.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-[var(--profit)] shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-[var(--loss)] shrink-0" />
                  )}
                  <div>
                    <p className={`text-sm font-bold ${updateResult.ok ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                      {updateResult.ok ? t('common:success') : t('common:error')}
                    </p>
                    {updateResult.ok ? (
                      <p className="text-xs mt-1">{t('update_success', { count: updateResult.validCount })} | Invalid: {updateResult.invalidCount}</p>
                    ) : (
                      <p className="text-xs mt-1">{updateResult.error}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── TABS NAVIGATION ── */}
      <div className="flex flex-wrap gap-2 pb-4">
        {(['OVERVIEW', 'RISK', 'RR_LAB', 'TIMING', 'STREAKS', 'PAIR'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all
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
      {activeTab === 'RR_LAB' && <RRLabTab metrics={metrics} trades={trades} />}
      {activeTab === 'TIMING' && <TimingAnalyticsTab metrics={metrics} trades={trades} />}
      {activeTab === 'STREAKS' && <StreaksTab metrics={metrics} trades={trades} />}
      {activeTab === 'PAIR' && <PairBreakdownTab metrics={metrics} />}

      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-12 gap-5 w-full">

          {/* ── HERO & RIGHT RAIL ── */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-5">
            <div className="card-hero p-6 md:p-8 relative overflow-hidden group h-full min-h-[220px] flex flex-col justify-between">
              {/* Note: card-hero already handles the top accent line and thick border */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#1040C0] opacity-[0.04] rounded-full pointer-events-none" />
              <p className="text-[#717182] text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                {displayMode === 'RAW' ? <Wallet className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                {displayMode === 'RAW' ? t('current_broker_equity', 'Current Broker Equity') : t('simulated_equity_model', 'Simulated Equity Model')}
              </p>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10 flex-1">
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-4 mb-2">
                    <h2 className="text-4xl lg:text-6xl font-extrabold text-[#121212] tracking-tight font-number">
                      {formatUsd(currentEndingBalance)}
                    </h2>
                    <div className={`flex items-center gap-1 text-lg font-bold font-number px-2.5 py-1 border-2 ${currentPnl >= 0 ? 'bg-[var(--profit-dim)] text-[var(--profit)] border-[var(--profit)]' : 'bg-[var(--loss-dim)] text-[var(--loss)] border-[var(--loss)]'}`}>
                      {currentPnl >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      {currentPnl >= 0 ? '+' : ''}{formatPercent(currentGrowth)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <Badge variant={displayMode === 'RAW' ? 'neutral' : 'blue'}>
                      {displayMode === 'RAW' ? t('raw_market_data', 'Raw Market Data') : metrics.usedAssumedRR ? `Assumed RR ${metrics.assumedRRValue} Active` : 'Fixed Risk Active'}
                    </Badge>
                    <span className="text-xs text-[#717182] font-bold uppercase tracking-wider">
                      {t('home:trades_plural', { count: metrics.totalTrades })}
                    </span>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end md:items-end w-full md:w-auto p-4 bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212]">
                  <p className="text-[#717182] text-[9px] font-bold uppercase tracking-widest mb-1">{t('net_profit', 'Net Profit')}</p>
                  <p className={`text-3xl font-bold font-number ${currentPnl >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                    {currentPnl >= 0 ? '+' : ''}{formatUsd(currentPnl)}
                  </p>
                  <div className="mt-2 text-[10px] text-[#717182] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    {t('realized_pnl', 'Realized PnL')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
            <div className="bg-white border-2 border-[#121212] p-5 relative">
              <div className="absolute top-0 left-0 bottom-0 w-[4px] bg-[#1040C0]" />
              <h4 className="text-[10px] font-bold text-[#717182] uppercase tracking-widest mb-1 flex items-center gap-1.5 ml-2">
                <Info className="w-3.5 h-3.5" /> {t('mode_status', 'Mode Status')}
              </h4>
              <p className="text-sm font-extrabold text-[#121212] ml-2">
                {displayMode === 'RAW' ? t('raw_broker_pnl_active', 'Raw Broker PnL Active') : t('risk_simulation_active', 'Risk Simulation Active')}
              </p>
              <p className="text-xs text-[#717182] mt-1 ml-2 font-medium">
                {displayMode === 'RAW'
                  ? t('display_mode_raw_desc', 'Menampilkan performa berdasarkan data riil dari broker/sumber asli.')
                  : t('display_mode_simulated_desc', 'Menampilkan performa berdasarkan model risiko statis (Fixed Risk/Assumed RR).')}
              </p>
            </div>

            <div className="bg-white border-2 border-[#121212] p-5 relative">
              <div className={`absolute top-0 left-0 bottom-0 w-[4px] ${metrics.usedAssumedRR ? 'bg-[var(--warning)]' : 'bg-[var(--profit)]'}`} />
              <h4 className="text-[10px] font-bold text-[#717182] uppercase tracking-widest mb-1 flex items-center gap-1.5 ml-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('calculation_confidence', 'Calculation Confidence')}
              </h4>
              <p className={`text-sm font-extrabold ml-2 ${metrics.usedAssumedRR ? 'text-[var(--warning)]' : 'text-[var(--profit)]'}`}>
                {metrics.usedAssumedRR ? t('low_confidence', 'Low Confidence (Assumed RR)') : t('high_confidence', 'High Confidence')}
              </p>
              <p className="text-xs text-[#717182] mt-1 ml-2 font-medium">
                {metrics.usedAssumedRR
                  ? t('calculation_confidence_low_desc', 'Data import tidak memiliki Stop Loss. Menggunakan rasio asumsi untuk simulasi risiko.')
                  : t('calculation_confidence_high_desc', 'Data lengkap dengan rasio Reward:Risk yang presisi.')}
              </p>
            </div>
          </div>

          {/* ── PRIMARY PERFORMANCE ROW ── */}
          <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            <MetricCard title={t('initial_balance', 'Initial Balance')} value={formatUsd(metrics.initialBalance)} icon={DollarSign} accent="dark" />
            <MetricCard
              title={t('metric_max_dd')}
              value={formatUsd(-currentDrawdown)}
              subtitle={formatPercent(-currentDrawdownPct)}
              valueColorClass="loss"
              icon={TrendingDown}
              accent="loss"
            />
            <MetricCard
              title={t('metric_profit_factor')}
              value={currentProfitFactor === Infinity ? '∞' : formatNumber(currentProfitFactor, 2)}
              valueColorClass={currentProfitFactor >= 1.5 ? 'profit' : currentProfitFactor >= 1.0 ? 'profit' : 'loss'}
              subtitle="Gross Profit / Gross Loss"
              accent={currentProfitFactor >= 1.0 ? 'profit' : 'loss'}
            />
            <MetricCard
              title={t('metric_win_rate')}
              value={formatPercent(metrics.winrate)}
              valueColorClass="profit"
              subtitle={`Loss Rate: ${formatPercent(metrics.lossrate)}`}
              accent="profit"
            />
            <MetricCard
              title={t('metric_avg_rr')}
              value={avgRR !== null ? formatR(avgRR) : 'N/A'}
              valueColorClass={avgRR !== null ? (avgRR >= 1 ? 'profit' : 'loss') : 'neutral'}
              icon={Target}
              accent={avgRR !== null && avgRR >= 1 ? 'profit' : avgRR !== null ? 'loss' : 'dark'}
            />
          </div>

          {/* ── PERFORMANCE VISUALIZER GRID ── */}
          <div className="col-span-12 w-full mt-4">
            <DashboardCharts session={session} trades={trades} onSelectionChange={setAnalyticsSelection} />
          </div>

          {/* ── SECONDARY METRICS GRID ── */}
          <div className="col-span-12 mt-6 space-y-4">
            <SectionLabel label={t('distribution_expectation', 'Distribusi & Harapan Imbal Balik')} shape="diamond" color="yellow" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-5">
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
