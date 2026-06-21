import React, { useEffect, useState } from 'react';
import { Plus, Upload, Activity, BookOpen, DollarSign, Trash2, Info, BarChart3, MoreVertical, FileUp, Copy, Edit3, FileText, Camera, FileSearch, Wallet, Link2, Zap, ShieldAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';
import JournalCalendar from '../components/JournalCalendar';
import { HelpCard, EmptyStateGuide, PageGuide } from '../components/help/HelpSystem';

export default function Home() {
  const navigate = useNavigate();
  const { sessions, fetchSessions, selectSession, deleteSession, updateSession, loading } = useJournalStore();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewSession, setPreviewSession] = useState<any | null>(null);
  const [previewTrades, setPreviewTrades] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => {
    fetch('/api/accounts')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    let active = true;
    const latestSession = [...sessions].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    })[0];

    if (!latestSession) {
      setPreviewSession(null);
      setPreviewTrades([]);
      return;
    }

    setPreviewLoading(true);
    fetch(`/api/sessions/${latestSession.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!active || !data) return;
        setPreviewSession(data.session || latestSession);
        setPreviewTrades(Array.isArray(data.trades) ? data.trades : []);
      })
      .catch(() => {
        if (!active) return;
        setPreviewSession(latestSession);
        setPreviewTrades([]);
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessions]);

  const openDashboard = (id: string) => {
    selectSession(id);
    navigate(`/dashboard?sessionId=${id}`);
  };

  const importCsv = (id: string, mode: 'SMART_MERGE' | 'APPEND') => {
    selectSession(id);
    navigate(`/csv-import?sessionId=${id}&mode=${mode}`);
  };

  const renameSession = async (session: any) => {
    const name = prompt('Nama sesi baru:', session.name);
    if (name && name.trim() && name.trim() !== session.name) await updateSession(session.id, { name: name.trim() });
  };

  const editNotes = async (session: any) => {
    const notes = prompt('Catatan sesi:', session.notes || '');
    if (notes !== null) await updateSession(session.id, { notes });
  };

  const duplicateSession = async (session: any) => {
    alert('Duplicate Session belum diaktifkan untuk menjaga data trade tetap aman. Gunakan Import CSV untuk membuat sesi baru dari file sumber.');
  };

  const portfolio = accounts.reduce((acc, account) => {
    acc.balance += Number(account.currentBalance ?? account.initialBalance ?? 0);
    acc.equity += Number(account.currentEquity ?? account.currentBalance ?? account.initialBalance ?? 0);
    acc.freeMargin += Number(account.freeMargin ?? 0);
    const sync = account.lastSnapshotAt ? new Date(account.lastSnapshotAt).getTime() : 0;
    acc.lastSync = Math.max(acc.lastSync, sync);
    return acc;
  }, { balance: 0, equity: 0, freeMargin: 0, lastSync: 0 });
  const floatingPnl = portfolio.equity - portfolio.balance;
  const latestSession = [...sessions].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#eaecef' }}>ReplayFX Journal</h1>
          <p className="text-sm mt-1" style={{ color: '#707a8a' }}>
            Portfolio overview untuk backtest, MT5 report, live journal, dan integrasi trading.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageGuide
            title="Mulai dari mana?"
            purpose="Overview ini membantu memilih workflow yang benar: backtest TradingView, report MT5, live account, atau catatan manual."
            steps={[
              'Kalau punya CSV TradingView, klik Import CSV.',
              'Kalau punya report Strategy Tester MT5, klik Import MT5 Report.',
              'Kalau ingin pantau akun real/demo, buka Trading Accounts lalu Integrations.',
              'Kalau ingin catat cepat manual, buka Quick Logger.'
            ]}
            outputs={[
              'Portfolio cards menunjukkan ringkasan akun live/demo.',
              'Session cards membuka dashboard analisis backtest.',
              'Calendar snapshot menunjukkan bulan trading dari data aktual.'
            ]}
            warnings={[
              'TradingView webhook lokal butuh tunnel seperti cloudflared/ngrok.',
              'Remote trade execution dari Telegram/WhatsApp tetap dimatikan demi keamanan.'
            ]}
            nextAction="Pilih quick action sesuai sumber data yang kamu punya sekarang."
          />
          <Link to="/create-session" className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Buat Sesi
          </Link>
          <Link to="/csv-import"
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" style={{ color: '#fcd535' }} /> Import CSV
          </Link>
          <Link to="/webhook-monitor"
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Activity className="w-4 h-4" style={{ color: '#0ecb81' }} /> Webhook
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bn-card p-5 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Portfolio Overview</h2>
              <p className="text-xs text-[#707a8a] mt-1">Ringkasan akun MT5 live/demo yang tersambung. Account number tetap dimasking di halaman detail.</p>
            </div>
            <span className="rounded-full border border-[#2b3139] bg-[#181a20] px-3 py-1 text-[10px] font-bold text-[#929aa5]">
              {accounts.length} connected accounts
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PortfolioMetric label="Total Balance" value={formatUsd(portfolio.balance)} />
            <PortfolioMetric label="Total Equity" value={formatUsd(portfolio.equity)} />
            <PortfolioMetric label="Free Margin" value={formatUsd(portfolio.freeMargin)} />
            <PortfolioMetric label="Floating PnL" value={formatUsd(floatingPnl)} danger={floatingPnl < 0} positive={floatingPnl > 0} />
          </div>
          <div className="mt-4 rounded-lg border border-[#2b3139] bg-[#181a20] p-3 text-xs text-[#929aa5]">
            Last sync: <span className="text-white">{portfolio.lastSync ? new Date(portfolio.lastSync).toLocaleString() : 'Belum ada snapshot akun.'}</span>
          </div>
        </div>

        <HelpCard title="Mulai dari mana?">
          <div className="space-y-1">
            <p><strong className="text-white">TradingView backtest:</strong> Import CSV.</p>
            <p><strong className="text-white">EA MT5:</strong> Import MT5 Report + tester graph CSV.</p>
            <p><strong className="text-white">Akun real/demo:</strong> Trading Accounts + Integrations.</p>
            <p><strong className="text-white">Catatan cepat:</strong> Quick Logger.</p>
          </div>
        </HelpCard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <QuickAction to="/csv-import" icon={Upload} title="Import CSV" body="TradingView Strategy Tester" />
        <QuickAction to="/mt5-import" icon={FileSearch} title="Import MT5" body="Strategy Tester XLSX" />
        <QuickAction to="/live-journal" icon={BookOpen} title="Live Journal" body="Pantau akun berjalan" />
        <QuickAction to="/accounts" icon={Wallet} title="Trading Account" body="Tambah/kelola akun" />
        <QuickAction to="/integrations" icon={Link2} title="Integrations" body="MT5, TV, WA, Telegram" />
        <QuickAction to="/quick-logger" icon={Zap} title="Quick Logger" body="Catat trade manual" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HelpCard title="Recent activity">
          <p>Latest session: <span className="text-white">{latestSession?.name || 'Belum ada sesi.'}</span></p>
          <p>Latest import/source: <span className="text-white">{latestSession?.sourceMode || '-'}</span></p>
          <p>Latest live sync: <span className="text-white">{portfolio.lastSync ? new Date(portfolio.lastSync).toLocaleString() : '-'}</span></p>
        </HelpCard>
        <HelpCard title="Risk snapshot" tone={floatingPnl < 0 ? 'warning' : 'info'}>
          <p>Floating PnL: <span className={floatingPnl < 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}>{formatUsd(floatingPnl)}</span></p>
          <p>{floatingPnl < 0 ? 'Akun sedang floating loss. Hindari menambah risiko tanpa alasan setup yang jelas.' : 'Tidak ada floating loss agregat dari akun yang tersambung.'}</p>
        </HelpCard>
        <HelpCard title="Keamanan command">
          <p>Command Center dan WhatsApp/Telegram hanya untuk monitoring dan balasan aman. Perintah buy/sell/close_all tidak dieksekusi remote.</p>
        </HelpCard>
      </div>

      {sessions.length > 0 && (
        <div className="bn-card relative overflow-hidden p-5 space-y-4 border border-[#2b3139]">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#fcd535] via-[#0ecb81] to-transparent" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-[0.2em]">Journal Snapshot</h2>
                <p className="text-xs text-[#707a8a] mt-1 max-w-xl">
                  A quick view of the latest session with direct access to the main analysis and live journal.
                </p>
              </div>
              {previewSession && (
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-[#929aa5]">
                  <span className="rounded-full border border-[#2b3139] bg-[#181a20] px-3 py-1">{previewSession.name}</span>
                  <span className="rounded-full border border-[#2b3139] bg-[#181a20] px-3 py-1">{previewSession.symbol}</span>
                  <span className="rounded-full border border-[#2b3139] bg-[#181a20] px-3 py-1">{previewSession.timeframe}</span>
                  <span className="rounded-full border border-[#2b3139] bg-[#181a20] px-3 py-1">{previewTrades.length} trades</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {previewSession && (
                <button
                  onClick={() => openDashboard(previewSession.id)}
                  className="px-3 py-2 bg-[#fcd535] hover:bg-[#f0b90b] text-[#181a20] rounded-lg text-xs font-bold"
                >
                  Open Dashboard
                </button>
              )}
              <Link to="/live-journal" className="px-3 py-2 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-xs font-bold">
                Open Live Journal
              </Link>
            </div>
          </div>

          {previewLoading ? (
            <div className="rounded-xl border border-dashed border-[#2b3139] bg-[#181a20] px-4 py-6 text-xs text-[#707a8a]">
              Loading latest session snapshot...
            </div>
          ) : previewSession ? (
            <JournalCalendar
              mode="BACKTEST"
              title="Monthly Snapshot"
              trades={previewTrades}
              currency={previewSession.balanceCurrency || 'USD'}
              compact
              storageKey="replayfx:showHomeCalendar"
              defaultCollapsed={true}
              contextType="BACKTEST_SESSION"
              contextId={previewSession.id}
              hideSummaryCards
              hideLegend
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[#2b3139] bg-[#181a20] px-4 py-6 text-xs text-[#707a8a]">
              No session data available for snapshot.
            </div>
          )}
        </div>
      )}

      {/* Sessions */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest flex items-center gap-2" style={{ color: '#707a8a' }}>
          <BookOpen className="w-3.5 h-3.5" />
          Daftar Sesi ({sessions.length})
        </h2>

        {loading && sessions.length === 0 ? (
          <div className="bn-card p-12 text-center text-sm" style={{ color: '#707a8a' }}>
            Sedang memuat data sesi...
          </div>
        ) : sessions.length === 0 ? (
          <EmptyStateGuide
            title="Belum Ada Sesi Jurnal"
            body="Mulai dengan Import CSV untuk backtest TradingView, Import MT5 Report untuk EA MT5, atau Buat Sesi jika ingin menyiapkan jurnal manual."
            action={<div className="flex flex-wrap justify-center gap-2"><Link to="/csv-import" className="btn-primary text-sm">Import CSV</Link><Link to="/mt5-import" className="btn-secondary text-sm">Import MT5 Report</Link></div>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map(s => (
              <div
                key={s.id}
                className="bn-card p-5 flex flex-col justify-between relative"
                style={{ transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(252,213,53,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#2b3139')}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                      style={{
                        background: s.sourceMode === 'CSV' ? 'rgba(252,213,53,0.1)' : s.sourceMode === 'WEBHOOK' ? 'rgba(14,203,129,0.1)' : 'rgba(112,122,138,0.1)',
                        color: s.sourceMode === 'CSV' ? '#fcd535' : s.sourceMode === 'WEBHOOK' ? '#0ecb81' : '#929aa5',
                      }}>
                      {s.sourceMode}
                    </span>
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === s.id ? null : s.id);
                      }}
                      className="p-1 rounded transition"
                      style={{ color: '#707a8a' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#eaecef')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#707a8a')}
                      title="Advanced actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenuId === s.id && (
                      <div className="absolute right-4 top-11 z-20 w-56 rounded-lg border border-[#2b3139] bg-[#181a20] shadow-xl p-1 text-xs">
                        <button onClick={() => openDashboard(s.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><BarChart3 className="w-3.5 h-3.5" /> Open Dashboard</button>
                        <button onClick={() => importCsv(s.id, 'SMART_MERGE')} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><FileUp className="w-3.5 h-3.5" /> Update CSV</button>
                        <button onClick={() => importCsv(s.id, 'APPEND')} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><Upload className="w-3.5 h-3.5" /> Append CSV</button>
                        <button onClick={() => importCsv(s.id, 'SMART_MERGE')} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><Activity className="w-3.5 h-3.5" /> Smart Merge CSV</button>
                        <Link to={`/csv-import?sessionId=${s.id}&history=1`} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><FileText className="w-3.5 h-3.5" /> View Import History</Link>
                        <button onClick={() => renameSession(s)} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><Edit3 className="w-3.5 h-3.5" /> Rename Session</button>
                        <button onClick={() => duplicateSession(s)} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><Copy className="w-3.5 h-3.5" /> Duplicate Session</button>
                        <button onClick={() => editNotes(s)} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><FileText className="w-3.5 h-3.5" /> Add/Edit Notes</button>
                        <button onClick={() => openDashboard(s.id)} className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 text-left text-[#eaecef]"><Camera className="w-3.5 h-3.5" /> Export Dashboard PNG</button>
                        <button
                          onClick={async () => {
                            if (confirm(`Hapus sesi "${s.name}"?`)) await deleteSession(s.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-[rgba(246,70,93,0.1)] text-left text-[#f6465d]"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete Session
                        </button>
                      </div>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm mt-3 truncate" style={{ color: '#eaecef' }}>{s.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: '#707a8a' }}>
                    <span>{s.symbol}</span><span>·</span>
                    <span>{s.timeframe}</span><span>·</span>
                    <span className="capitalize">{s.marketType.toLowerCase()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 py-3 my-3 text-xs"
                  style={{ borderTop: '1px solid #2b3139', borderBottom: '1px solid #2b3139' }}>
                  <div>
                    <span className="text-[10px] font-medium block mb-0.5" style={{ color: '#707a8a' }}>NET PNL</span>
                    <span className="font-bold font-number" style={{ color: s.netPnlUsd >= 0 ? '#0ecb81' : '#f6465d' }}>
                      {s.netPnlUsd >= 0 ? '+' : ''}{formatUsd(s.netPnlUsd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium block mb-0.5" style={{ color: '#707a8a' }}>WIN RATE</span>
                    <span className="font-bold font-number" style={{ color: '#eaecef' }}>
                      {s.tradeCount > 0 ? formatPercent(s.winrate) : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#707a8a' }}>
                  <span>{s.tradeCount} Trades</span>
                  <span>{new Date(s.updatedAt || s.createdAt).toLocaleDateString()}</span>
                  {s.invalidTradeCount > 0 && (
                    <span style={{ color: '#f6465d' }}>{s.invalidTradeCount} Invalid</span>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => openDashboard(s.id)}
                    className="flex-1 px-3 py-2 bg-[#fcd535] hover:bg-[#f0b90b] text-[#181a20] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <BarChart3 className="w-3.5 h-3.5" /> Open Dashboard
                  </button>
                  <button
                    onClick={() => importCsv(s.id, 'SMART_MERGE')}
                    className="px-3 py-2 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <FileUp className="w-3.5 h-3.5" /> Update CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PortfolioMetric({ label, value, danger, positive }: { label: string; value: string; danger?: boolean; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-[#2b3139] bg-[#181a20] p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#707a8a]">{label}</div>
      <div className={`mt-2 text-lg font-black ${danger ? 'text-[#f6465d]' : positive ? 'text-[#0ecb81]' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, body }: { to: string; icon: any; title: string; body: string }) {
  return (
    <Link to={to} className="rounded-xl border border-[#2b3139] bg-[#181a20] p-4 hover:border-[#fcd535] transition">
      <Icon className="h-5 w-5 text-[#fcd535]" />
      <div className="mt-3 text-sm font-bold text-white">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-[#707a8a]">{body}</div>
    </Link>
  );
}
