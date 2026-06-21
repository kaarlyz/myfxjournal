import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home, PlusCircle, UploadCloud, BarChart3, Settings as SettingsIcon,
  BookOpen, TrendingUp, Zap, Layers, Wallet, Calculator, Link2, FileSearch
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatPnL } from '../utils/numberUtils';

export default function Sidebar() {
  const { sessions, activeSessionId, selectSession } = useJournalStore();

  const menuItems = [
    { path: '/',               name: 'Sesi Backtest',    icon: Home,          group: 'BACKTEST' },
    { path: '/create-session', name: 'Buat Sesi',        icon: PlusCircle,    group: 'BACKTEST' },
    { path: '/csv-import',     name: 'Import CSV',       icon: UploadCloud,   group: 'BACKTEST' },
    { path: '/mt5-import',     name: 'Import MT5 Report',icon: FileSearch,    group: 'BACKTEST' },
    { path: '/mt5-report',     name: 'MT5 Analyzer',     icon: BarChart3,     group: 'BACKTEST' },
    { path: '/quick-logger',   name: 'Quick Logger',     icon: Zap,           group: 'BACKTEST' },
    { path: '/dashboard',      name: 'Analisa',          icon: BarChart3,     group: 'BACKTEST' },
    { path: '/live-journal',   name: 'Live Journal',     icon: BookOpen,      group: 'LIVE'     },
    { path: '/accounts',       name: 'Accounts',         icon: Wallet,        group: 'LIVE'     },
    { path: '/risk-calculator',name: 'Risk Calculator',  icon: Calculator,    group: 'TOOLS'    },
    { path: '/integrations',   name: 'Integrations',     icon: Link2,         group: 'TOOLS'    },
    { path: '/settings',       name: 'Pengaturan',       icon: SettingsIcon,  group: 'SYSTEM'   },
  ];

  const groups: Array<{ key: string; label: string }> = [
    { key: 'BACKTEST', label: 'Backtest' },
    { key: 'LIVE',     label: 'Live'     },
    { key: 'TOOLS',    label: 'Tools'    },
    { key: 'SYSTEM',   label: 'System'   },
  ];

  return (
    <aside
      className="w-56 flex flex-col min-h-screen flex-shrink-0"
      style={{ background: '#0b0e11', borderRight: '1px solid #2b3139' }}
    >
      {/* Brand */}
      <div className="px-4 py-5" style={{ borderBottom: '1px solid #2b3139' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#fcd535' }}
          >
            <TrendingUp className="w-4 h-4" style={{ color: '#181a20' }} />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight" style={{ color: '#fcd535' }}>
              ReplayFX
            </span>
            <p className="text-[9px] font-medium uppercase tracking-widest" style={{ color: '#707a8a', marginTop: 1 }}>
              Trading Journal
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {groups.map(({ key, label }) => {
          const items = menuItems.filter(i => i.group === key);
          if (!items.length) return null;
          return (
            <div key={key}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#707a8a' }}>
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `sidebar-item w-full${isActive ? ' active' : ''}`
                      }
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Session switcher */}
      <div className="px-2 pb-2" style={{ borderTop: '1px solid #2b3139', paddingTop: 8 }}>
        <div className="flex items-center gap-1.5 px-2 mb-1.5">
          <Layers className="w-3 h-3" style={{ color: '#707a8a' }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#707a8a' }}>
            Sesi ({sessions.length})
          </span>
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-3 py-2 text-[11px] italic" style={{ color: '#707a8a' }}>Belum ada sesi</p>
          ) : (
            sessions.map(s => {
              const isActive = activeSessionId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className="w-full text-left px-2.5 py-2 rounded-md transition-all"
                  style={{
                    background: isActive ? 'rgba(252,213,53,0.08)' : 'transparent',
                    border: isActive ? '1px solid rgba(252,213,53,0.2)' : '1px solid transparent',
                    color: isActive ? '#eaecef' : '#707a8a',
                  }}
                  title={`${s.name} (${s.symbol})`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[11px] font-semibold">{s.name}</span>
                    {isActive && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#fcd535' }} />}
                  </div>
                  <div className="flex justify-between text-[10px] mt-0.5">
                    <span style={{ color: '#707a8a' }}>{s.symbol} · {s.timeframe}</span>
                    <span className="font-bold font-number" style={{ color: s.netPnlUsd >= 0 ? '#0ecb81' : '#f6465d' }}>
                      {formatPnL(s.netPnlUsd, 'USD')}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="px-4 py-2.5" style={{ borderTop: '1px solid #2b3139' }}>
        <p className="text-[9px]" style={{ color: '#3a4149' }}>v2.0 · ReplayFX Journal</p>
      </div>
    </aside>
  );
}
