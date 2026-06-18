import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import CreateSession from './pages/CreateSession';
import CSVImport from './pages/CSVImport';
import Dashboard from './pages/Dashboard';
import QuickLogger from './pages/QuickLogger';
import CompareSessions from './pages/CompareSessions';
import Settings from './pages/Settings';
import WebhookMonitor from './pages/WebhookMonitor';
import LiveJournal from './pages/LiveJournal';
import Accounts from './pages/Accounts';
import Integrations from './pages/Integrations';
import RiskCalculator from './components/RiskCalculator';
import { useJournalStore } from './store/useJournalStore';
import { AlertTriangle, Clock } from 'lucide-react';

export default function App() {
  const { activeTab, error, fetchSettings, fetchSessions } = useJournalStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    fetchSettings();
    fetchSessions();
  }, [fetchSettings, fetchSessions]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const renderActivePage = () => {
    switch (activeTab) {
      case 'home': return <Home />;
      case 'create-session': return <CreateSession />;
      case 'csv-import': return <CSVImport />;
      case 'dashboard': return <Dashboard />;
      case 'quick-logger': return <QuickLogger />;
      case 'compare-sessions': return <CompareSessions />;
      case 'webhook-monitor': return <WebhookMonitor />;
      case 'settings': return <Settings />;
      case 'live-journal': return <LiveJournal />;
      case 'accounts': return <Accounts />;
      case 'integrations': return <Integrations />;
      case 'risk-calculator': return <RiskCalculator />;
      default: return <Home />;
    }
  };

  const padZ = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${padZ(time.getHours())}:${padZ(time.getMinutes())}:${padZ(time.getSeconds())}`;
  const dateStr = time.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex min-h-screen relative overflow-hidden">
      {/* Premium ambient background glows */}
      <div className="fixed top-0 right-0 w-[700px] h-[700px] pointer-events-none blur-[120px] opacity-60"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)' }} />
      <div className="fixed bottom-0 left-64 w-[600px] h-[600px] pointer-events-none blur-[120px] opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.04) 0%, transparent 70%)' }} />
      <div className="fixed top-1/2 left-1/2 w-[800px] h-[400px] pointer-events-none blur-[100px] opacity-20"
        style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.03) 0%, transparent 70%)', transform: 'translate(-50%,-50%)' }} />

      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Layout Container */}
      <main className="flex-1 flex flex-col min-h-screen relative z-10">
        
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(6,10,18,0.6)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center space-x-2 text-[10px] text-gray-600 font-medium">
            <div className="w-1.5 h-1.5 bg-accentEmerald rounded-full animate-pulse" />
            <span>System Online</span>
          </div>
          <div className="flex items-center space-x-2 text-[10px] text-gray-500 font-mono">
            <Clock className="w-3 h-3 text-gray-600" />
            <span className="text-gray-400 font-bold">{timeStr}</span>
            <span className="text-gray-600">·</span>
            <span>{dateStr}</span>
          </div>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="bg-lossRed/10 border-b border-lossRed/20 text-lossRed p-3 text-xs font-semibold flex items-center space-x-2 justify-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Scrollable Page Body */}
        <div className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto overflow-y-auto animate-fade-slide-in">
          {renderActivePage()}
        </div>
      </main>
    </div>
  );
}
