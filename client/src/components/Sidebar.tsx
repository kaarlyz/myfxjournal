import React, { useState, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home, PlusCircle, UploadCloud, BarChart3, Settings as SettingsIcon,
  BookOpen, Zap, Layers, Wallet, Calculator, Link2,
  FileSearch, Bot, Shield, Dices, Trophy, Flame, Wifi, WifiOff, RefreshCw, Database, PlayCircle, Globe, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useJournalStore } from '../store/useJournalStore';
import { formatPnL } from '../utils/numberUtils';
import { BrandLogo } from './ui/BrandLogo';
import { useOnboarding } from '../hooks/useOnboarding';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';

import { useTranslation } from 'react-i18next';

const menuItems = [
  { path: '/sessions',        name: 'Sesi Backtest',    icon: Home,          group: 'BACKTEST', key: 'sessions_home' },
  { path: '/backtest',        name: 'Chart Replay',     icon: PlayCircle,    group: 'BACKTEST', key: 'bar_replay' },

  { path: '/create-session',  name: 'Buat Sesi',        icon: PlusCircle,    group: 'BACKTEST', key: 'create_session' },
  { path: '/csv-import',      name: 'Import CSV',       icon: UploadCloud,   group: 'BACKTEST', key: 'import_csv' },
  { path: '/mt5-import',      name: 'Import MT5',       icon: FileSearch,    group: 'BACKTEST', key: 'import_mt5' },
  { path: '/mt5-report',      name: 'MT5 Analyzer',     icon: BarChart3,     group: 'BACKTEST', key: 'mt5_analyzer' },
  { path: '/quick-logger',    name: 'Quick Logger',     icon: Zap,           group: 'BACKTEST', key: 'quick_logger' },
  { path: '/dashboard',       name: 'Analisa',          icon: BarChart3,     group: 'BACKTEST', key: 'analytics' },
  { path: '/live-journal',    name: 'Live Journal',     icon: BookOpen,      group: 'LIVE',     key: 'live_journal' },
  { path: '/accounts',        name: 'Accounts',         icon: Wallet,        group: 'LIVE',     key: 'accounts' },
  { path: '/mt5-connections', name: 'MT5 Connections', icon: Wifi,          group: 'LIVE',     key: 'mt5_connections' },
  { path: '/market-data',     name: 'Market Data',      icon: Database,      group: 'TOOLS',    key: 'market_data' },
  { path: '/risk-calculator', name: 'Risk Calculator',  icon: Calculator,    group: 'TOOLS',    key: 'risk_calculator' },
  { path: '/prop-sim',        name: 'Prop Simulator',   icon: Shield,        group: 'TOOLS',    key: 'prop_simulator' },
  { path: '/monte-carlo',     name: 'Monte Carlo',      icon: Dices,         group: 'TOOLS',    key: 'monte_carlo' },
  { path: '/ea-control',      name: 'EA Control',       icon: Bot,           group: 'TOOLS',    key: 'ea_control' },
  { path: '/integrations',    name: 'Integrations',     icon: Link2,         group: 'TOOLS',    key: 'integrations' },
  { path: '/landing',         name: 'Landing Page',     icon: Globe,         group: 'SYSTEM',   key: 'landing_page' },
  { path: '/settings',        name: 'Pengaturan',       icon: SettingsIcon,  group: 'SYSTEM',   key: 'settings' },
];

const groups: Array<{ key: string; label: string; accentColor: string }> = [
  { key: 'BACKTEST', label: 'Backtest', accentColor: '#D02020' },
  { key: 'LIVE',     label: 'Live',    accentColor: '#1040C0' },
  { key: 'TOOLS',    label: 'Tools',   accentColor: '#F0C020' },
  { key: 'SYSTEM',   label: 'System',  accentColor: '#121212' },
];

interface SidebarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  connectionStatus?: 'live' | 'api_connected' | 'connecting' | 'offline';
}

export default function Sidebar({ mobileOpen: externalMobileOpen, setMobileOpen: externalSetMobileOpen, connectionStatus }: SidebarProps = {}) {
  const { t } = useTranslation(['sidebar', 'common']);
  const { sessions, activeSessionId, activeSessionDetails, selectSession } = useJournalStore();
  const { greeting } = useOnboarding();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/landing', { replace: true });
  };

  const mobileOpen = externalMobileOpen !== undefined ? externalMobileOpen : internalMobileOpen;
  const setMobileOpen = externalSetMobileOpen || setInternalMobileOpen;

  // ── Compute active session stats ──
  const sessionStats = useMemo(() => {
    if (!activeSessionDetails?.trades?.length) return null;
    const trades = activeSessionDetails.trades.filter((t: any) => t.status === 'CLOSED');
    if (!trades.length) return null;

    const totalPnl = trades.reduce((sum: number, t: any) => sum + (t.netPnlUsd || 0), 0);
    const wins = trades.filter((t: any) => (t.netPnlUsd || 0) > 0).length;
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    // Today's trades
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = trades.filter((t: any) => {
      const exitDate = t.exitTime ? new Date(t.exitTime).toISOString().slice(0, 10) : '';
      return exitDate === today;
    });
    const todayPnl = todayTrades.reduce((sum: number, t: any) => sum + (t.netPnlUsd || 0), 0);
    const todayWins = todayTrades.filter((t: any) => (t.netPnlUsd || 0) > 0).length;
    const todayWinRate = todayTrades.length > 0 ? (todayWins / todayTrades.length) * 100 : 0;

    // Current streak
    let streak = 0;
    let streakType: 'win' | 'loss' | null = null;
    for (let i = trades.length - 1; i >= 0; i--) {
      const pnl = trades[i].netPnlUsd || 0;
      const isWin = pnl > 0;
      if (streakType === null) {
        streakType = isWin ? 'win' : 'loss';
        streak = 1;
      } else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) {
        streak++;
      } else {
        break;
      }
    }

    return {
      totalTrades: trades.length,
      totalPnl,
      winRate,
      todayCount: todayTrades.length,
      todayPnl,
      todayWinRate,
      streak,
      streakType,
      symbol: activeSessionDetails.session?.symbol || '-',
      name: activeSessionDetails.session?.name || '-',
    };
  }, [activeSessionDetails]);

  const sidebarContent = (
    <>
      {/* Brand */}
      <div
        className="px-5 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.7)' }}
      >
        <BrandLogo size={50} compact className="text-left" />
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#717182]">{t('welcome')}</p>
            {connectionStatus && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase tracking-wider border ${
                  connectionStatus === 'live' || connectionStatus === 'api_connected'
                    ? 'border-[var(--profit)] bg-[var(--profit-dim)] text-[var(--profit)]'
                    : connectionStatus === 'connecting'
                    ? 'border-[var(--warning)] bg-[var(--warning-dim)] text-[var(--warning)]'
                    : 'border-[var(--loss)] bg-[var(--loss-dim)] text-[var(--loss)]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connectionStatus === 'live' || connectionStatus === 'api_connected'
                      ? 'bg-[var(--profit)]'
                      : connectionStatus === 'connecting'
                      ? 'bg-[var(--warning)] animate-pulse'
                      : 'bg-[var(--loss)]'
                  }`}
                />
                {connectionStatus === 'live'
                  ? 'LIVE'
                  : connectionStatus === 'api_connected'
                  ? 'API'
                  : connectionStatus === 'connecting'
                  ? 'CONNECTING'
                  : 'OFFLINE'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-semibold text-[#121212]">{user?.name || greeting}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 px-3 py-4 space-y-5 overflow-y-auto overflow-x-hidden"
        aria-label="Main navigation"
      >
        {groups.map(({ key, label, accentColor }) => {
          const items = menuItems.filter(i => i.group === key);
          if (!items.length) return null;

          return (
            <div key={key}>
              {/* Section Label */}
              <div className="flex items-center gap-2 px-3 mb-2">
                <div
                  className="w-2 h-2 flex-shrink-0"
                  style={{
                    backgroundColor: accentColor,
                    borderRadius: key === 'LIVE' ? '50%' : '0',
                    transform: key === 'TOOLS' ? 'rotate(45deg)' : 'none',
                  }}
                />
                <p className="nav-section-label" style={{ padding: 0, color: '#717182' }}>
                  {t('nav_label_' + key.toLowerCase(), label)}
                </p>
              </div>

              <div className="space-y-0.5">
                {items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                      aria-current={undefined}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                      <span>{t(item.key, item.name)}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Active Session Productivity Widget ── */}
      <div
        className="px-3 py-4 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(148, 163, 184, 0.7)' }}
      >
        {/* Session Switcher Header */}
        <div className="flex items-center gap-2 px-3 mb-3">
          <Layers className="w-3 h-3 flex-shrink-0" style={{ color: '#717182' }} aria-hidden="true" />
          <span
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '9px',
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#717182',
            }}
          >
            {t('session_count', { count: sessions.length })}
          </span>
        </div>

        {/* Session selector dropdown */}
        {sessions.length > 0 ? (
          <div className="px-1 mb-3">
            <select
              className="w-full text-xs font-bold text-[#121212] bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none cursor-pointer hover:bg-slate-100 transition-colors truncate"
              style={{ fontFamily: 'Outfit, sans-serif' }}
              value={activeSessionId || ''}
              onChange={(e) => selectSession(e.target.value || null)}
            >
              <option value="">{t('select_session')}</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
              ))}
            </select>
          </div>
        ) : (
          <p
            className="px-3 py-2 italic"
            style={{ fontFamily: 'Outfit, sans-serif', fontSize: '11px', color: '#717182' }}
          >
            {t('no_session')}
          </p>
        )}

        {/* Stats Widget */}
        {sessionStats && (
          <div className="px-1 space-y-2">
            {/* Session name + total PnL */}
            <div
              className="p-2.5 rounded-xl border border-slate-700"
              style={{ background: '#0F172A' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/50" style={{ fontFamily: 'Outfit' }}>
                  {sessionStats.symbol}
                </span>
                <span
                  className="font-black font-number text-[13px]"
                  style={{ color: sessionStats.totalPnl >= 0 ? '#0ecb81' : '#f6465d' }}
                >
                  {formatPnL(sessionStats.totalPnl, 'USD')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-white/60" style={{ fontFamily: 'Outfit' }}>
                  {t('common:trades', { count: sessionStats.totalTrades })}
                </span>
                <span className="text-[10px] font-extrabold text-white/80" style={{ fontFamily: 'Outfit' }}>
                  <Trophy className="w-3 h-3 inline mr-0.5 -mt-0.5" style={{ color: '#F0C020' }} />
                  {sessionStats.winRate.toFixed(1)}% WR
                </span>
              </div>
            </div>

            {/* Today + Streak row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg border border-slate-200 bg-slate-50">
                <span className="block text-[8px] font-extrabold uppercase tracking-widest text-[#717182]" style={{ fontFamily: 'Outfit' }}>
                  {t('today')}
                </span>
                <span
                  className="block font-black font-number text-[12px] mt-0.5"
                  style={{ color: sessionStats.todayPnl >= 0 ? '#059669' : '#DC2626' }}
                >
                  {sessionStats.todayCount > 0 ? formatPnL(sessionStats.todayPnl, 'USD') : '-'}
                </span>
                <span className="block text-[8px] font-bold text-[#717182] mt-0.5" style={{ fontFamily: 'Outfit' }}>
                  {t('common:trades', { count: sessionStats.todayCount })}
                </span>
              </div>

              <div className="p-2 rounded-lg border border-slate-200 bg-slate-50">
                <span className="block text-[8px] font-extrabold uppercase tracking-widest text-[#717182]" style={{ fontFamily: 'Outfit' }}>
                  {t('streak')}
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <Flame className="w-3 h-3" style={{ color: sessionStats.streakType === 'win' ? '#059669' : '#DC2626' }} />
                  <span
                    className="font-black font-number text-[12px]"
                    style={{ color: sessionStats.streakType === 'win' ? '#059669' : '#DC2626' }}
                  >
                    {sessionStats.streak}
                  </span>
                  <span className="text-[8px] font-bold text-[#717182] uppercase" style={{ fontFamily: 'Outfit' }}>
                    {t(sessionStats.streakType === 'win' ? 'wins' : 'losses')}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick nav */}
            <div className="flex gap-1.5">
              <NavLink
                to="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex-1 text-center py-1.5 text-[8px] font-extrabold uppercase tracking-widest border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-[#121212] rounded-lg"
                style={{ fontFamily: 'Outfit' }}
              >
                {t('analytics_btn')}
              </NavLink>
              <NavLink
                to="/prop-sim"
                onClick={() => setMobileOpen(false)}
                className="flex-1 text-center py-1.5 text-[8px] font-extrabold uppercase tracking-widest border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-[#121212] rounded-lg"
                style={{ fontFamily: 'Outfit' }}
              >
                {t('prop_sim_btn')}
              </NavLink>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-3 flex-shrink-0 flex flex-col gap-2.5"
        style={{ borderTop: '1px solid rgba(148, 163, 184, 0.7)', background: '#F8FAFC' }}
      >
        {connectionStatus && (
          <div className="flex items-center justify-between px-1 text-[10px] font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <span className="text-[9px] uppercase tracking-wider text-[#717182]">Koneksi</span>
            {connectionStatus === 'live' && (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 border border-[var(--profit)] text-[9px] font-mono rounded"
                style={{ background: 'var(--profit-dim)', color: 'var(--profit)' }}
                role="status"
                aria-label="Realtime connection active"
              >
                <Wifi className="w-2.5 h-2.5" aria-hidden="true" />
                <span>REALTIME LIVE</span>
              </div>
            )}
            {connectionStatus === 'api_connected' && (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 border border-[var(--profit)] text-[9px] font-mono rounded"
                style={{ background: 'var(--profit-dim)', color: 'var(--profit)' }}
                role="status"
                aria-label="API connection active"
              >
                <Wifi className="w-2.5 h-2.5" aria-hidden="true" />
                <span>API CONNECTED</span>
              </div>
            )}
            {connectionStatus === 'connecting' && (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 border border-[var(--warning)] text-[9px] font-mono rounded"
                style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}
                role="status"
                aria-label="Connecting to server"
              >
                <RefreshCw className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                <span>CONNECTING</span>
              </div>
            )}
            {connectionStatus === 'offline' && (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 border border-[var(--loss)] text-[9px] font-mono rounded"
                style={{ background: 'var(--loss-dim)', color: 'var(--loss)' }}
                role="status"
                aria-label="Connection offline"
              >
                <WifiOff className="w-2.5 h-2.5" aria-hidden="true" />
                <span>OFFLINE</span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="w-full py-1.5 px-2 bg-white hover:bg-[#FFF0F0] text-[#DC2626] border border-slate-200 hover:border-[#DC2626] rounded text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>

        <div className="flex items-center justify-between pt-1">
          <LanguageSwitcher compact />
          <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 600, color: '#717182' }}>
            {t('version')}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar" aria-label="Application sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar: animated slide-in, triggered only by bottom nav Menu button */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-0 z-40 bg-[#121212]/50 backdrop-blur-[2px] md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer */}
            <motion.aside
              key="sidebar-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.32, 0, 0.16, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-white overflow-y-auto md:hidden shadow-xl"
              style={{ borderRight: '1px solid rgba(148, 163, 184, 0.7)' }}
              aria-label="Mobile navigation sidebar"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
