import React from 'react';
import { 
  Home, 
  PlusCircle, 
  UploadCloud, 
  BarChart3, 
  Settings as SettingsIcon, 
  BookOpen, 
  TrendingUp,
  Zap,
  GitCompare,
  Layers,
  Wallet,
  Calculator,
  Link2
} from 'lucide-react';
import { useJournalStore, AppPage } from '../store/useJournalStore';

export default function Sidebar() {
  const { 
    activeTab, 
    setTab, 
    sessions, 
    activeSessionId, 
    selectSession 
  } = useJournalStore();

  const menuItems = [
    { id: 'home' as AppPage, name: 'Sesi Backtest', icon: Home, group: 'BACKTEST' },
    { id: 'create-session' as AppPage, name: 'Buat Sesi Baru', icon: PlusCircle, group: 'BACKTEST' },
    { id: 'csv-import' as AppPage, name: 'Import CSV', icon: UploadCloud, group: 'BACKTEST' },
    { id: 'quick-logger' as AppPage, name: 'Quick Logger', icon: Zap, disabled: !activeSessionId, group: 'BACKTEST' },
    { id: 'dashboard' as AppPage, name: 'Analisa Dashboard', icon: BarChart3, disabled: !activeSessionId, group: 'BACKTEST' },
    
    { id: 'live-journal' as AppPage, name: 'Live Journal', icon: BookOpen, group: 'LIVE' },
    { id: 'accounts' as AppPage, name: 'Accounts', icon: Wallet, group: 'LIVE' },
    { id: 'risk-calculator' as AppPage, name: 'Risk Calculator', icon: Calculator, group: 'TOOLS' },
    { id: 'integrations' as AppPage, name: 'MT5 Integrations', icon: Link2, group: 'TOOLS' },
    
    { id: 'settings' as AppPage, name: 'Pengaturan', icon: SettingsIcon, group: 'SYSTEM' },
  ];

  return (
    <aside className="w-64 flex flex-col min-h-screen" style={{
      background: 'rgba(6, 10, 18, 0.95)',
      borderRight: '1px solid rgba(255,255,255,0.04)',
      backdropFilter: 'blur(20px)',
    }}>
      {/* Brand Logo Header */}
      <div className="p-5 flex items-center space-x-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="relative">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            boxShadow: '0 0 20px rgba(6,182,212,0.3)',
          }}>
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          {/* Active indicator dot */}
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-accentEmerald rounded-full border-2 border-gray-950 animate-pulse" />
        </div>
        <div>
          <h1 className="font-extrabold text-base text-white tracking-tight gradient-text-cyan">
            ReplayFX
          </h1>
          <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">
            Trading Journal Pro
          </p>
        </div>
      </div>

      {/* Main Navigation Menu */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {['BACKTEST', 'LIVE', 'TOOLS', 'SYSTEM'].map(group => {
          const groupItems = menuItems.filter(item => item.group === group);
          if (groupItems.length === 0) return null;
          
          return (
            <div key={group} className="space-y-0.5">
              <p className="px-3 text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-2">{group}</p>
              {groupItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isDisabled = item.disabled;

                return (
                  <button
                    key={item.id}
                    disabled={isDisabled}
                    onClick={() => setTab(item.id)}
                    className={`sidebar-item w-full text-left ${isActive ? 'active' : ''} ${isDisabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{item.name}</span>
                    {isDisabled && (
                      <span className="ml-auto text-[8px] text-gray-600 font-bold uppercase">Pilih sesi</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Quick Session Switcher in Sidebar footer */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center space-x-1.5 px-2 mb-2.5">
          <Layers className="w-3 h-3 text-gray-600" />
          <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">
            Sesi ({sessions.length})
          </p>
        </div>
        <div className="space-y-0.5 max-h-52 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-3 py-2 text-[10px] text-gray-600 italic">Belum ada sesi</p>
          ) : (
            sessions.map((s) => {
              const isActive = activeSessionId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-[11px] transition-all duration-150 ${
                    isActive
                      ? 'bg-accentCyan/10 border border-accentCyan/20 text-white'
                      : 'text-gray-500 hover:bg-gray-800/30 hover:text-gray-200 border border-transparent'
                  }`}
                  title={`${s.name} (${s.symbol})`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate font-semibold">{s.name}</span>
                    {isActive && <div className="w-1.5 h-1.5 bg-accentCyan rounded-full flex-shrink-0 ml-1" />}
                  </div>
                  <div className="flex justify-between items-center text-[9px] mt-0.5">
                    <span className="text-gray-600">{s.symbol} · {s.timeframe}</span>
                    <span className={`font-bold ${s.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'}`}>
                      {s.netPnlUsd >= 0 ? '+' : ''}${s.netPnlUsd.toFixed(0)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom version label */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <p className="text-[9px] text-gray-700 font-medium">v2.0 · ReplayFX Journal</p>
      </div>
    </aside>
  );
}
