import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Upload, Activity, BookOpen, DollarSign, Trash2,
  BarChart3, MoreVertical, FileUp, Copy, Edit3, FileText, Camera,
  FileSearch, Wallet, Link2, Zap, ShieldAlert, ArrowRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';
import JournalCalendar from '../components/JournalCalendar';
import { HelpCard, EmptyStateGuide, PageGuide } from '../components/help/HelpSystem';
import { BrandLogo } from '../components/ui/BrandLogo';
import { useOnboarding } from '../hooks/useOnboarding';

/* ── Sub-components ── */

function PortfolioMetric({
  label,
  value,
  danger,
  positive,
}: {
  label: string;
  value: string;
  danger?: boolean;
  positive?: boolean;
}) {
  const valueColor = danger
    ? 'var(--loss)'
    : positive
    ? 'var(--profit)'
    : 'var(--text-primary)';

  return (
    <div
      className="p-4 border-2 border-[#121212] bg-white"
      style={{ boxShadow: '3px 3px 0px 0px #121212' }}
    >
      <div className="metric-label mb-2">{label}</div>
      <div
        className="metric-value-lg leading-none font-number"
        style={{ color: valueColor }}
        aria-label={`${label}: ${value}`}
      >
        {value}
      </div>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  body,
  accentColor = '#D02020',
  shape = 'square',
}: {
  to: string;
  icon: React.ElementType;
  title: string;
  body: string;
  accentColor?: string;
  shape?: 'circle' | 'square' | 'diamond';
}) {
  return (
    <Link
      to={to}
      className="block bg-white p-5 border-2 border-[#121212] hover-lift group"
      style={{ boxShadow: '4px 4px 0px 0px #121212', textDecoration: 'none' }}
    >
      {/* Icon container */}
      <div
        className="w-11 h-11 flex items-center justify-center border-2 border-[#121212] mb-4 group-hover:shadow-[3px_3px_0px_0px_#121212] transition-shadow"
        style={{
          backgroundColor: accentColor,
          borderRadius: shape === 'circle' ? '50%' : '0',
          transform: shape === 'diamond' ? 'rotate(45deg)' : 'none',
        }}
      >
        <Icon
          className="w-5 h-5"
          style={{
            color: accentColor === '#F0C020' ? '#121212' : '#FFFFFF',
            transform: shape === 'diamond' ? 'rotate(-45deg)' : 'none',
          }}
          aria-hidden="true"
        />
      </div>
      <div
        className="font-bold mb-1"
        style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '0.85rem',
          fontWeight: 800,
          letterSpacing: '0.04em',
          color: '#121212',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: 'Outfit, sans-serif',
          fontSize: '0.78rem',
          fontWeight: 500,
          color: '#717182',
          lineHeight: '1.5',
        }}
      >
        {body}
      </div>
    </Link>
  );
}

/* ── Main Page ── */

export default function Home() {
  const navigate = useNavigate();
  const { sessions, fetchSessions, selectSession, deleteSession, updateSession, loading } = useJournalStore();
  const { greeting, name } = useOnboarding();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewSession, setPreviewSession] = useState<any | null>(null);
  const [previewTrades, setPreviewTrades] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    fetch('/api/accounts')
      .then(res => res.ok ? res.json() : [])
      .then(data => setAccounts(Array.isArray(data) ? data : []))
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
      .finally(() => { if (active) setPreviewLoading(false); });

    return () => { active = false; };
  }, [sessions]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenuId]);

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
    if (name && name.trim() && name.trim() !== session.name) {
      await updateSession(session.id, { name: name.trim() });
    }
  };

  const editNotes = async (session: any) => {
    const notes = prompt('Catatan sesi:', session.notes || '');
    if (notes !== null) await updateSession(session.id, { notes });
  };

  const duplicateSession = async (_session: any) => {
    alert('Duplicate Session belum diaktifkan untuk menjaga data trade tetap aman. Gunakan Import CSV untuk membuat sesi baru dari file sumber.');
  };

  const portfolio = accounts.reduce(
    (acc, account) => {
      acc.balance += Number(account.currentBalance ?? account.initialBalance ?? 0);
      acc.equity += Number(account.currentEquity ?? account.currentBalance ?? account.initialBalance ?? 0);
      acc.freeMargin += Number(account.freeMargin ?? 0);
      const sync = account.lastSnapshotAt ? new Date(account.lastSnapshotAt).getTime() : 0;
      acc.lastSync = Math.max(acc.lastSync, sync);
      return acc;
    },
    { balance: 0, equity: 0, freeMargin: 0, lastSync: 0 }
  );

  const floatingPnl = portfolio.equity - portfolio.balance;
  const latestSession = [...sessions].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime()
  )[0];

  return (
    <div className="space-y-7">
      <div className="relative overflow-hidden rounded-none border-2 border-[#121212] bg-white p-6 shadow-[4px_4px_0px_0px_#121212] sm:p-7">
        <div className="absolute inset-y-0 right-0 hidden w-24 bg-[#1040C0]/8 sm:block" />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#717182]">Welcome back</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-[#121212] font-display">{greeting}{name ? '' : ''}</h2>
            <p className="mt-3 text-sm leading-7 text-[#717182] sm:text-[15px]">
              Here’s today’s trading overview and a quick path back into your workspace.
            </p>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.14 }}
              className="mt-4 flex flex-wrap items-center gap-2"
            >
              <div className="rounded border border-[#121212]/10 bg-[#F0F0F0] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#717182]">
                built by Eka Restu Syahputra
              </div>
              <a
                href="https://instagram.com/vckmbrly"
                target="_blank"
                rel="noreferrer"
                className="rounded border border-[#1040C0]/20 bg-[#1040C0]/8 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#1040C0] transition-all hover:-translate-y-0.5 hover:bg-[#1040C0]/12"
              >
                @vckmbrly
              </a>
            </motion.div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded border border-[#121212]/10 bg-[#F0F0F0] px-3 py-2 text-sm font-semibold text-[#121212]">
              {sessions.length} session{sessions.length === 1 ? '' : 's'} ready
            </div>
          </div>
        </div>
      </div>

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <BrandLogo size={42} className="flex-shrink-0" />
            <div>
              <span
                className="block text-[10px] uppercase tracking-[0.22em] font-extrabold"
                style={{ fontFamily: 'Outfit, sans-serif', color: '#717182' }}
              >
                TRADING JOURNAL
              </span>
              <p
                className="mt-2 max-w-md"
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  color: '#717182',
                  lineHeight: '1.6',
                }}
              >
                Portfolio overview untuk backtest, MT5 report, live journal, dan integrasi trading.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <PageGuide
            title="Mulai dari mana?"
            purpose="Overview ini membantu memilih workflow yang benar: backtest TradingView, report MT5, live account, atau catatan manual."
            steps={[
              'Kalau punya CSV TradingView, klik Import CSV.',
              'Kalau punya report Strategy Tester MT5, klik Import MT5 Report.',
              'Kalau ingin pantau akun real/demo, buka Trading Accounts lalu Integrations.',
              'Kalau ingin catat cepat manual, buka Quick Logger.',
            ]}
            outputs={[
              'Portfolio cards menunjukkan ringkasan akun live/demo.',
              'Session cards membuka dashboard analisis backtest.',
              'Calendar snapshot menunjukkan bulan trading dari data aktual.',
            ]}
            warnings={[
              'TradingView webhook lokal butuh tunnel seperti cloudflared/ngrok.',
              'Remote trade execution dari Telegram/WhatsApp tetap dimatikan demi keamanan.',
            ]}
            nextAction="Pilih quick action sesuai sumber data yang kamu punya sekarang."
          />
          <Link
            to="/create-session"
            className="btn btn-primary flex items-center gap-2"
            aria-label="Buat sesi jurnal baru"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Buat Sesi
          </Link>
          <Link
            to="/csv-import"
            className="btn btn-secondary flex items-center gap-2"
            aria-label="Import CSV TradingView"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            Import CSV
          </Link>
          <Link
            to="/webhook-monitor"
            className="btn btn-secondary flex items-center gap-2"
            aria-label="Monitor webhook"
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
            Webhook
          </Link>
        </div>
      </div>

      {/* ── Portfolio Overview + Help ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Portfolio card */}
        <div
          className="xl:col-span-2 bg-white border-2 border-[#121212] p-5 relative overflow-hidden"
          style={{ boxShadow: '5px 5px 0px 0px #121212' }}
        >
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#1040C0]" aria-hidden="true" />

          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h2
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 900,
                  fontSize: '1rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#121212',
                }}
              >
                Portfolio Overview
              </h2>
              <p
                className="mt-1"
                style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.78rem', color: '#717182' }}
              >
                Ringkasan akun MT5 live/demo yang tersambung.
              </p>
            </div>
            <span
              className="border border-[#121212] px-3 py-1"
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: '10px',
                fontWeight: 700,
                color: '#717182',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
              aria-label={`${accounts.length} connected accounts`}
            >
              {accounts.length} accounts
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PortfolioMetric label="Total Balance"  value={formatUsd(portfolio.balance)} />
            <PortfolioMetric label="Total Equity"   value={formatUsd(portfolio.equity)} />
            <PortfolioMetric label="Free Margin"    value={formatUsd(portfolio.freeMargin)} />
            <PortfolioMetric
              label="Floating PnL"
              value={formatUsd(floatingPnl)}
              danger={floatingPnl < 0}
              positive={floatingPnl > 0}
            />
          </div>

          <div
            className="mt-4 border border-[rgba(18,18,18,0.12)] p-3"
            style={{ backgroundColor: '#F8F8F8' }}
          >
            <span
              style={{ fontFamily: 'Outfit, sans-serif', fontSize: '11px', color: '#717182' }}
            >
              Last sync:{' '}
              <span style={{ color: '#121212', fontWeight: 700 }}>
                {portfolio.lastSync
                  ? new Date(portfolio.lastSync).toLocaleString()
                  : 'Belum ada snapshot akun.'}
              </span>
            </span>
          </div>
        </div>

        {/* Help card */}
        <HelpCard title="Mulai dari mana?">
          <div className="space-y-1.5" style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem' }}>
            <p><strong style={{ color: '#121212' }}>TradingView backtest:</strong> Import CSV.</p>
            <p><strong style={{ color: '#121212' }}>EA MT5:</strong> Import MT5 Report + tester graph CSV.</p>
            <p><strong style={{ color: '#121212' }}>Akun real/demo:</strong> Trading Accounts + Integrations.</p>
            <p><strong style={{ color: '#121212' }}>Catatan cepat:</strong> Quick Logger.</p>
          </div>
        </HelpCard>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 bg-[#F0C020]" aria-hidden="true" />
          <span
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: '0.65rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#717182',
            }}
          >
            Quick Actions
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          <QuickAction to="/csv-import"      icon={Upload}      title="Import CSV"     body="TradingView Strategy Tester"  accentColor="#D02020" shape="square" />
          <QuickAction to="/mt5-import"      icon={FileSearch}  title="Import MT5"     body="Strategy Tester XLSX"         accentColor="#1040C0" shape="circle" />
          <QuickAction to="/live-journal"    icon={BookOpen}    title="Live Journal"   body="Pantau akun berjalan"         accentColor="#F0C020" shape="diamond" />
          <QuickAction to="/accounts"        icon={Wallet}      title="Trading Account" body="Tambah/kelola akun"          accentColor="#121212" shape="square" />
          <QuickAction to="/integrations"    icon={Link2}       title="Integrations"   body="MT5, TV, WA, Telegram"        accentColor="#D02020" shape="circle" />
          <QuickAction to="/quick-logger"    icon={Zap}         title="Quick Logger"   body="Catat trade manual"           accentColor="#1040C0" shape="square" />
        </div>
      </div>

      {/* ── Risk snapshot row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HelpCard title="Recent activity">
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem' }} className="space-y-1.5">
            <p>Latest session: <span style={{ color: '#121212', fontWeight: 700 }}>{latestSession?.name || 'Belum ada sesi.'}</span></p>
            <p>Source: <span style={{ color: '#121212', fontWeight: 700 }}>{latestSession?.sourceMode || '-'}</span></p>
            <p>Last live sync: <span style={{ color: '#121212', fontWeight: 700 }}>{portfolio.lastSync ? new Date(portfolio.lastSync).toLocaleString() : '-'}</span></p>
          </div>
        </HelpCard>
        <HelpCard title="Risk snapshot" tone={floatingPnl < 0 ? 'warning' : 'info'}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem' }}>
            <p>
              Floating PnL:{' '}
              <span
                className="font-number font-bold"
                style={{ color: floatingPnl < 0 ? 'var(--loss)' : 'var(--profit)' }}
              >
                {formatUsd(floatingPnl)}
              </span>
            </p>
            <p className="mt-1">
              {floatingPnl < 0
                ? 'Akun sedang floating loss. Hindari menambah risiko tanpa alasan setup yang jelas.'
                : 'Tidak ada floating loss agregat dari akun yang tersambung.'}
            </p>
          </div>
        </HelpCard>
        <HelpCard title="Keamanan command">
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.82rem' }}>
            Command Center dan WhatsApp/Telegram hanya untuk monitoring dan balasan aman. Perintah buy/sell/close_all tidak dieksekusi remote.
          </p>
        </HelpCard>
      </div>

      {/* ── Journal Snapshot ── */}
      {sessions.length > 0 && (
        <div
          className="bg-white border-2 border-[#121212] p-5 relative overflow-hidden"
          style={{ boxShadow: '5px 5px 0px 0px #121212' }}
        >
          {/* Accent bar */}
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{
              background: 'linear-gradient(90deg, #D02020 0%, #F0C020 50%, #1040C0 100%)',
            }}
            aria-hidden="true"
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mt-1">
            <div className="space-y-3">
              <div>
                <h2
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 900,
                    fontSize: '0.85rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: '#121212',
                  }}
                >
                  Journal Snapshot
                </h2>
                <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.78rem', color: '#717182', marginTop: 4 }}>
                  Latest session with direct access to analysis and live journal.
                </p>
              </div>

              {previewSession && (
                <div className="flex flex-wrap gap-2">
                  {[
                    previewSession.name,
                    previewSession.symbol,
                    previewSession.timeframe,
                    `${previewTrades.length} trades`,
                  ].map(tag => (
                    <span
                      key={tag}
                      className="px-3 py-1 border border-[#121212]"
                      style={{
                        fontFamily: 'Outfit, sans-serif',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#717182',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        background: '#F0F0F0',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {previewSession && (
                <button
                  onClick={() => openDashboard(previewSession.id)}
                  className="btn btn-yellow flex items-center gap-2"
                  aria-label="Open dashboard for latest session"
                >
                  <BarChart3 className="w-4 h-4" aria-hidden="true" />
                  Open Dashboard
                </button>
              )}
              <Link
                to="/live-journal"
                className="btn btn-secondary flex items-center gap-2"
                aria-label="Open Live Journal"
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                Live Journal
              </Link>
            </div>
          </div>

          <div className="mt-5">
            {previewLoading ? (
              <div
                className="border-2 border-dashed border-[rgba(18,18,18,0.2)] px-4 py-8 text-center"
                aria-live="polite"
                aria-label="Loading snapshot"
              >
                <div className="flex justify-center mb-3">
                  <div className="w-6 h-6 border-2 border-[#121212] border-t-transparent animate-spin" />
                </div>
                <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '12px', color: '#717182' }}>
                  Loading latest session snapshot...
                </p>
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
              <div className="border-2 border-dashed border-[rgba(18,18,18,0.2)] px-4 py-8 text-center">
                <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '12px', color: '#717182' }}>
                  No session data available for snapshot.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sessions Grid ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-[#121212]" aria-hidden="true" />
          <h2
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 800,
              fontSize: '0.7rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#717182',
            }}
          >
            Daftar Sesi ({sessions.length})
          </h2>
        </div>

        {loading && sessions.length === 0 ? (
          <div
            className="bg-white border-2 border-[#121212] p-12 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="flex justify-center mb-4">
              <div className="w-8 h-8 border-2 border-[#121212] border-t-transparent animate-spin" />
            </div>
            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '13px', color: '#717182' }}>
              Sedang memuat data sesi...
            </p>
          </div>
        ) : sessions.length === 0 ? (
          <EmptyStateGuide
            title="Belum Ada Sesi Jurnal"
            body="Mulai dengan Import CSV untuk backtest TradingView, Import MT5 Report untuk EA MT5, atau Buat Sesi jika ingin menyiapkan jurnal manual."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link to="/csv-import" className="btn btn-primary">Import CSV</Link>
                <Link to="/mt5-import" className="btn btn-secondary">Import MT5 Report</Link>
              </div>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sessions.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                isMenuOpen={openMenuId === s.id}
                onToggleMenu={e => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === s.id ? null : s.id);
                }}
                onOpenDashboard={() => openDashboard(s.id)}
                onImportCsv={mode => importCsv(s.id, mode)}
                onRename={() => renameSession(s)}
                onDuplicate={() => duplicateSession(s)}
                onEditNotes={() => editNotes(s)}
                onDelete={async () => {
                  if (confirm(`Hapus sesi "${s.name}"?`)) await deleteSession(s.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Session Card ── */
interface SessionCardProps {
  session: any;
  isMenuOpen: boolean;
  onToggleMenu: (e: React.MouseEvent) => void;
  onOpenDashboard: () => void;
  onImportCsv: (mode: 'SMART_MERGE' | 'APPEND') => void;
  onRename: () => void;
  onDuplicate: () => void;
  onEditNotes: () => void;
  onDelete: () => void;
}

function SessionCard({
  session: s,
  isMenuOpen,
  onToggleMenu,
  onOpenDashboard,
  onImportCsv,
  onRename,
  onDuplicate,
  onEditNotes,
  onDelete,
}: SessionCardProps) {
  const sourceColors: Record<string, string> = {
    CSV:     '#D02020',
    WEBHOOK: '#059669',
    MT5:     '#1040C0',
    MANUAL:  '#717182',
  };

  const sourceBg: Record<string, string> = {
    CSV:     'rgba(208,32,32,0.08)',
    WEBHOOK: 'rgba(5,150,105,0.08)',
    MT5:     'rgba(16,64,192,0.08)',
    MANUAL:  'rgba(113,113,130,0.08)',
  };

  const accentColor = sourceColors[s.sourceMode] ?? '#717182';

  return (
    <article
      className="bg-white border-2 border-[#121212] p-5 flex flex-col justify-between relative group"
      style={{ boxShadow: '4px 4px 0px 0px #121212', transition: 'box-shadow 0.15s ease, transform 0.15s ease' }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '6px 6px 0px 0px #D02020';
        (e.currentTarget as HTMLElement).style.transform = 'translate(-1px, -1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '4px 4px 0px 0px #121212';
        (e.currentTarget as HTMLElement).style.transform = 'translate(0, 0)';
      }}
      aria-label={`Session: ${s.name}`}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: accentColor }}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex items-start justify-between mt-1">
        {/* Source badge */}
        <span
          className="px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider"
          style={{
            fontFamily: 'Outfit, sans-serif',
            color: accentColor,
            borderColor: accentColor,
            background: sourceBg[s.sourceMode] ?? 'rgba(113,113,130,0.08)',
          }}
        >
          {s.sourceMode}
        </span>

        {/* More menu button */}
        <div className="relative">
          <button
            onClick={onToggleMenu}
            className="p-1 border border-transparent hover:border-[#121212] transition-all"
            style={{ color: '#717182' }}
            aria-label="Session actions"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical className="w-4 h-4" aria-hidden="true" />
          </button>

          {isMenuOpen && (
            <div
              className="absolute right-0 top-8 z-30 w-56 bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-1"
              role="menu"
              aria-label="Session actions menu"
            >
              {[
                { icon: BarChart3, label: 'Open Dashboard',    action: onOpenDashboard,              danger: false },
                { icon: FileUp,    label: 'Update CSV',        action: () => onImportCsv('SMART_MERGE'), danger: false },
                { icon: Upload,    label: 'Append CSV',        action: () => onImportCsv('APPEND'),  danger: false },
                { icon: Activity,  label: 'Smart Merge CSV',   action: () => onImportCsv('SMART_MERGE'), danger: false },
                { icon: Edit3,     label: 'Rename Session',    action: onRename,                     danger: false },
                { icon: Copy,      label: 'Duplicate Session', action: onDuplicate,                  danger: false },
                { icon: FileText,  label: 'Add/Edit Notes',    action: onEditNotes,                  danger: false },
                { icon: Trash2,    label: 'Delete Session',    action: onDelete,                     danger: true  },
              ].map(({ icon: MenuIcon, label, action, danger }) => (
                <button
                  key={label}
                  onClick={() => { action(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                  role="menuitem"
                  style={{
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: danger ? 'var(--loss)' : '#121212',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = danger
                      ? 'rgba(220,38,38,0.06)'
                      : '#F0F0F0';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <MenuIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Session name + meta */}
      <div className="mt-3">
        <h3
          className="truncate"
          style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 800,
            fontSize: '0.95rem',
            color: '#121212',
          }}
        >
          {s.name}
        </h3>
        <div
          className="flex items-center gap-1.5 mt-1"
          style={{ fontFamily: 'Outfit, sans-serif', fontSize: '11px', color: '#717182' }}
        >
          <span>{s.symbol}</span>
          <span>·</span>
          <span>{s.timeframe}</span>
          <span>·</span>
          <span className="capitalize">{s.marketType?.toLowerCase()}</span>
        </div>
      </div>

      {/* Metrics */}
      <div
        className="grid grid-cols-2 gap-3 py-3 my-3"
        style={{ borderTop: '2px solid rgba(18,18,18,0.08)', borderBottom: '2px solid rgba(18,18,18,0.08)' }}
      >
        <div>
          <span
            className="block mb-1"
            style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#717182' }}
          >
            NET PNL
          </span>
          <span
            className="font-bold font-number"
            style={{ fontSize: '14px', color: s.netPnlUsd >= 0 ? 'var(--profit)' : 'var(--loss)' }}
            aria-label={`Net PnL: ${s.netPnlUsd >= 0 ? '+' : ''}${s.netPnlUsd}`}
          >
            {s.netPnlUsd >= 0 ? '+' : ''}
            {formatUsd(s.netPnlUsd)}
          </span>
        </div>
        <div>
          <span
            className="block mb-1"
            style={{ fontFamily: 'Outfit, sans-serif', fontSize: '9px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#717182' }}
          >
            WIN RATE
          </span>
          <span
            className="font-bold font-number"
            style={{ fontSize: '14px', color: '#121212' }}
            aria-label={`Win rate: ${s.tradeCount > 0 ? formatPercent(s.winrate) : 'No trades'}`}
          >
            {s.tradeCount > 0 ? formatPercent(s.winrate) : '—'}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center mb-4">
        <span
          style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 700, color: '#717182', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          {s.tradeCount} Trades
        </span>
        <span
          style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 600, color: '#717182' }}
        >
          {new Date(s.updatedAt || s.createdAt).toLocaleDateString()}
        </span>
        {s.invalidTradeCount > 0 && (
          <span
            style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 700, color: 'var(--loss)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
            aria-label={`${s.invalidTradeCount} invalid trades`}
          >
            {s.invalidTradeCount} Invalid
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onOpenDashboard}
          className="btn btn-yellow flex-1 flex items-center justify-center gap-1.5"
          aria-label={`Open dashboard for ${s.name}`}
        >
          <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
          Dashboard
        </button>
        <button
          onClick={() => onImportCsv('SMART_MERGE')}
          className="btn btn-secondary flex items-center justify-center gap-1.5"
          aria-label={`Update CSV for ${s.name}`}
        >
          <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
          Update CSV
        </button>
      </div>
    </article>
  );
}
