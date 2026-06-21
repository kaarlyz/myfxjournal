import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import SetupReview from './pages/SetupReview';
import MT5ReportImport from './pages/MT5ReportImport';
import MT5ReportDashboard from './pages/MT5ReportDashboard';
import ReportPrint from './pages/ReportPrint';
import RiskCalculator from './components/RiskCalculator';
import { useJournalStore } from './store/useJournalStore';
import { useLiveJournalStore } from './store/useLiveJournalStore';
import { AlertTriangle, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const { error, fetchSettings, fetchSessions } = useJournalStore();
  const { listenToSSE, sseStatus } = useLiveJournalStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    fetchSettings();
    fetchSessions();
    listenToSSE();
  }, [fetchSettings, fetchSessions, listenToSSE]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const padZ = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${padZ(time.getHours())}:${padZ(time.getMinutes())}:${padZ(time.getSeconds())}`;
  const dateStr = time.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Router>
      <div className="flex min-h-screen relative overflow-hidden">
        {/* No ambient glow — flat color blocks per Binance design */}

        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Layout Container */}
        <main className="flex-1 flex flex-col min-h-screen relative z-10">
          
          {/* Top Bar */}
          <div
            className="flex items-center justify-between px-6 py-2.5 flex-shrink-0"
            style={{ borderBottom: '1px solid #2b3139', background: '#0b0e11' }}
          >
            <div className="flex items-center gap-2 text-xs font-medium">
              {sseStatus === 'live' && (
                <div className="flex items-center gap-1.5" style={{ color: '#0ecb81' }}>
                  <Wifi className="w-3 h-3" />
                  <span>Realtime Live</span>
                </div>
              )}
              {sseStatus === 'connecting' && (
                <div className="flex items-center gap-1.5" style={{ color: '#fcd535' }}>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Connecting...</span>
                </div>
              )}
              {sseStatus === 'offline' && (
                <div className="flex items-center gap-1.5" style={{ color: '#f6465d' }}>
                  <WifiOff className="w-3 h-3" />
                  <span>Offline</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono text-xs" style={{ color: '#707a8a' }}>
              <Clock className="w-3 h-3" />
              <span className="font-bold" style={{ color: '#eaecef' }}>{timeStr}</span>
              <span style={{ color: '#3a4149' }}>·</span>
              <span>{dateStr}</span>
            </div>
          </div>

          {/* Error notification banner */}
          {error && (
            <div className="text-xs font-semibold flex items-center gap-2 justify-center px-4 py-2.5"
              style={{ background: 'rgba(246,70,93,0.08)', borderBottom: '1px solid rgba(246,70,93,0.2)', color: '#f6465d' }}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Scrollable Page Body */}
          <div className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto overflow-y-auto animate-fade-slide-in">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/sessions" element={<Home />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/create-session" element={<CreateSession />} />
                <Route path="/csv-import" element={<CSVImport />} />
                <Route path="/mt5-import" element={<MT5ReportImport />} />
                <Route path="/mt5-report" element={<MT5ReportDashboard />} />
                <Route path="/reports/mt5/:reportId/print" element={<ReportPrint kind="mt5" />} />
                <Route path="/reports/session/:sessionId/print" element={<ReportPrint kind="session" />} />
                <Route path="/reports/live/:accountId/print" element={<ReportPrint kind="live" />} />
                <Route path="/quick-logger" element={<QuickLogger />} />
                <Route path="/compare-sessions" element={<CompareSessions />} />
                <Route path="/webhook-monitor" element={<WebhookMonitor />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/live-journal" element={<LiveJournal />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/setup-review" element={<SetupReview />} />
                <Route path="/risk-calculator" element={<RiskCalculator />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </Router>
  );
}
