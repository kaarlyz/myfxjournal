import React, { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home, PlusCircle, UploadCloud, BarChart3, Settings as SettingsIcon,
  BookOpen, Zap, Layers, Wallet, Calculator, Link2,
  FileSearch, Bot, Shield, Dices, X, Menu, Trophy, Flame
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatPnL } from '../utils/numberUtils';
import { BrandLogo } from './ui/BrandLogo';
import { useOnboarding } from '../hooks/useOnboarding';

const menuItems = [
  { path: '/',                name: 'Sesi Backtest',    icon: Home,          group: 'BACKTEST' },
  { path: '/create-session',  name: 'Buat Sesi',        icon: PlusCircle,    group: 'BACKTEST' },
  { path: '/csv-import',      name: 'Import CSV',       icon: UploadCloud,   group: 'BACKTEST' },
  { path: '/mt5-import',      name: 'Import MT5',       icon: FileSearch,    group: 'BACKTEST' },
  { path: '/mt5-report',      name: 'MT5 Analyzer',     icon: BarChart3,     group: 'BACKTEST' },
  { path: '/quick-logger',    name: 'Quick Logger',     icon: Zap,           group: 'BACKTEST' },
  { path: '/dashboard',       name: 'Analisa',          icon: BarChart3,     group: 'BACKTEST' },
  { path: '/live-journal',    name: 'Live Journal',     icon: BookOpen,      group: 'LIVE'     },
  { path: '/accounts',        name: 'Accounts',         icon: Wallet,        group: 'LIVE'     },
  { path: '/risk-calculator', name: 'Risk Calculator',  icon: Calculator,    group: 'TOOLS'    },
  { path: '/prop-sim',        name: 'Prop Simulator',   icon: Shield,        group: 'TOOLS'    },
  { path: '/monte-carlo',     name: 'Monte Carlo',      icon: Dices,         group: 'TOOLS'    },
  { path: '/ea-control',      name: 'EA Control',       icon: Bot,           group: 'TOOLS'    },
  { path: '/integrations',    name: 'Integrations',     icon: Link2,         group: 'TOOLS'    },
  { path: '/settings',        name: 'Pengaturan',       icon: SettingsIcon,  group: 'SYSTEM'   },
];

const groups: Array<{ key: string; label: string; accentColor: string }> = [
  { key: 'BACKTEST', label: 'Backtest', accentColor: '#D02020' },
  { key: 'LIVE',     label: 'Live',    accentColor: '#1040C0' },
  { key: 'TOOLS',    label: 'Tools',   accentColor: '#F0C020' },
  { key: 'SYSTEM',   label: 'System',  accentColor: '#121212' },
];

export default function Sidebar() {
  const { sessions, activeSessionId, activeSessionDetails, selectSession } = useJournalStore();
  const { greeting } = useOnboarding();
  const [mobileOpen, setMobileOpen] = useState(false);

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
        style={{ borderBottom: '2px solid #121212' }}
      >
        <BrandLogo size={50} compact className="text-left" />
        <div className="mt-3 rounded border border-[#121212]/10 bg-[#F0F0F0] px-3 py-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#717182]">Welcome</p>
          <p className="mt-1 text-sm font-semibold text-[#121212]">{greeting}</p>
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
                  {label}
                </p>
              </div>

              <div className="space-y-0.5">
                {items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                      aria-current={undefined}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                      <span>{item.name}</span>
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
        style={{ borderTop: '2px solid #121212' }}
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
            Session ({sessions.length})
          </span>
        </div>

        {/* Session selector dropdown */}
        {sessions.length > 0 ? (
          <div className="px-1 mb-3">
            <select
              className="w-full text-xs font-bold text-[#121212] bg-[#F0F0F0] border-2 border-[#121212] px-2 py-2 outline-none cursor-pointer hover:bg-[#E5E5E5] transition-colors truncate"
              style={{ fontFamily: 'Outfit, sans-serif' }}
              value={activeSessionId || ''}
              onChange={(e) => selectSession(e.target.value || null)}
            >
              <option value="">— Select session —</option>
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
            Belum ada sesi
          </p>
        )}

        {/* Stats Widget */}
        {sessionStats && (
          <div className="px-1 space-y-2">
            {/* Session name + total PnL */}
            <div
              className="p-2.5 border-2 border-[#121212]"
              style={{ background: '#121212' }}
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
                  {sessionStats.totalTrades} trades
                </span>
                <span className="text-[10px] font-extrabold text-white/80" style={{ fontFamily: 'Outfit' }}>
                  <Trophy className="w-3 h-3 inline mr-0.5 -mt-0.5" style={{ color: '#F0C020' }} />
                  {sessionStats.winRate.toFixed(1)}% WR
                </span>
              </div>
            </div>

            {/* Today + Streak row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 border-2 border-[#121212] bg-[#F0F0F0]">
                <span className="block text-[8px] font-extrabold uppercase tracking-widest text-[#717182]" style={{ fontFamily: 'Outfit' }}>
                  Today
                </span>
                <span
                  className="block font-black font-number text-[12px] mt-0.5"
                  style={{ color: sessionStats.todayPnl >= 0 ? '#059669' : '#DC2626' }}
                >
                  {sessionStats.todayCount > 0 ? formatPnL(sessionStats.todayPnl, 'USD') : '—'}
                </span>
                <span className="block text-[8px] font-bold text-[#717182] mt-0.5" style={{ fontFamily: 'Outfit' }}>
                  {sessionStats.todayCount} trade{sessionStats.todayCount !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="p-2 border-2 border-[#121212] bg-[#F0F0F0]">
                <span className="block text-[8px] font-extrabold uppercase tracking-widest text-[#717182]" style={{ fontFamily: 'Outfit' }}>
                  Streak
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
                    {sessionStats.streakType === 'win' ? 'wins' : 'losses'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick nav */}
            <div className="flex gap-1.5">
              <NavLink to="/dashboard" className="flex-1 text-center py-1.5 text-[8px] font-extrabold uppercase tracking-widest border-2 border-[#121212] bg-white hover:bg-[#F0F0F0] transition-colors text-[#121212]" style={{ fontFamily: 'Outfit' }}>
                Analytics
              </NavLink>
              <NavLink to="/prop-sim" className="flex-1 text-center py-1.5 text-[8px] font-extrabold uppercase tracking-widest border-2 border-[#121212] bg-white hover:bg-[#F0F0F0] transition-colors text-[#121212]" style={{ fontFamily: 'Outfit' }}>
                Prop Sim
              </NavLink>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 flex-shrink-0"
        style={{ borderTop: '2px solid #121212', background: '#F0F0F0' }}
      >
        <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '10px', fontWeight: 600, color: '#717182' }}>
          v2.1 · KAFX Journal
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar" aria-label="Application sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile Hamburger Button */}
      <button
        className="fixed top-3 left-3 z-50 flex h-11 w-11 items-center justify-center border-2 border-[#121212] bg-[#121212] text-white shadow-[3px_3px_0px_0px_#1040C0] transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#1040C0] active:translate-y-0.5 active:shadow-none md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation menu"
        aria-expanded={mobileOpen}
      >
        <Menu className="h-5 w-5" strokeWidth={2.3} />
      </button>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[#121212]/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-white overflow-y-auto"
            style={{ borderRight: '4px solid #121212' }}
            aria-label="Mobile navigation sidebar"
          >
            {/* Close button */}
            <button
              className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center border-2 border-[#121212] bg-[#121212] text-white shadow-[3px_3px_0px_0px_#1040C0] transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#1040C0] active:translate-y-0.5 active:shadow-none"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
