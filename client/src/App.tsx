import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
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
import EAControlCenter from './pages/EAControlCenter';
import MT5Connections from './pages/MT5Connections';
import MarketData from './pages/MarketData';
import RiskCalculator from './components/RiskCalculator';
import PropFirmSimulator from './pages/PropFirmSimulator';
import MonteCarlo from './pages/MonteCarlo';
import { useJournalStore } from './store/useJournalStore';
import { useLiveJournalStore } from './store/useLiveJournalStore';
import { AlertTriangle, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import WidgetErrorBoundary from './components/WidgetErrorBoundary';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { useOnboarding } from './hooks/useOnboarding';

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-none px-6 lg:px-8 2xl:px-12 py-6"
      >
        <WidgetErrorBoundary>
          <Routes location={location} key={location.pathname}>
            <Route path="/"                              element={<Home />} />
            <Route path="/sessions"                     element={<Home />} />
            <Route path="/dashboard"                    element={<Dashboard />} />
            <Route path="/create-session"               element={<CreateSession />} />
            <Route path="/csv-import"                   element={<CSVImport />} />
            <Route path="/mt5-import"                   element={<MT5ReportImport />} />
            <Route path="/mt5-report"                   element={<MT5ReportDashboard />} />
            <Route path="/reports/mt5/:reportId/print"     element={<ReportPrint kind="mt5" />} />
            <Route path="/reports/session/:sessionId/print" element={<ReportPrint kind="session" />} />
            <Route path="/reports/live/:accountId/print"   element={<ReportPrint kind="live" />} />
            <Route path="/quick-logger"                 element={<QuickLogger />} />
            <Route path="/compare-sessions"             element={<CompareSessions />} />
            <Route path="/webhook-monitor"              element={<WebhookMonitor />} />
            <Route path="/settings"                     element={<Settings />} />
            <Route path="/live-journal"                 element={<LiveJournal />} />
            <Route path="/accounts"                     element={<Accounts />} />
            <Route path="/mt5-connections"              element={<MT5Connections />} />
            <Route path="/market-data"                  element={<MarketData />} />
            <Route path="/integrations"                 element={<Integrations />} />
            <Route path="/ea-control"                   element={<EAControlCenter />} />
            <Route path="/setup-review"                 element={<SetupReview />} />
            <Route path="/risk-calculator"              element={<RiskCalculator />} />
            <Route path="/prop-sim"                     element={<PropFirmSimulator />} />
            <Route path="/monte-carlo"                  element={<MonteCarlo />} />
            <Route path="*"                             element={<Navigate to="/" replace />} />
          </Routes>
        </WidgetErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const { error, fetchSettings, fetchSessions } = useJournalStore();
  const { listenToSSE, sseStatus } = useLiveJournalStore();
  const { completed, isReady, completeOnboarding } = useOnboarding();
  const [time, setTime] = useState(new Date());
  const [showOnboarding, setShowOnboarding] = useState(!completed);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (isReady) {
      setShowOnboarding(!completed);
    }
  }, [completed, isReady]);

  useEffect(() => {
    fetchSettings();
    fetchSessions();
    listenToSSE();
  }, [fetchSettings, fetchSessions, listenToSSE]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleOnboardingComplete = (userName: string) => {
    completeOnboarding(userName);
    setTransitioning(true);
    window.setTimeout(() => {
      setShowOnboarding(false);
      setTransitioning(false);
    }, 240);
  };

  const padZ = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${padZ(time.getHours())}:${padZ(time.getMinutes())}:${padZ(time.getSeconds())}`;
  const dateStr = time.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  if (!isReady) {
    return null;
  }

  if (showOnboarding) {
    return (
      <MotionConfig reducedMotion="user">
        <div className="min-h-screen bg-[#FCFCFC]">
          <OnboardingFlow onComplete={handleOnboardingComplete} />
          {transitioning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="fixed inset-0 z-50 bg-[#FCFCFC]"
            />
          )}
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Router>
        <div className="app-shell">
          <Sidebar />

          <main className="main-shell relative z-10">
            <div className="topbar" aria-label="Application toolbar">
              <div className="flex items-center gap-2 text-xs font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {sseStatus === 'live' && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 border border-[var(--profit)]"
                    style={{ background: 'var(--profit-dim)', color: 'var(--profit)' }}
                    role="status"
                    aria-label="Realtime connection active"
                  >
                    <Wifi className="w-3 h-3" aria-hidden="true" />
                    <span>REALTIME LIVE</span>
                  </div>
                )}
                {sseStatus === 'connecting' && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 border border-[var(--warning)]"
                    style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}
                    role="status"
                    aria-label="Connecting to server"
                  >
                    <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
                    <span>CONNECTING</span>
                  </div>
                )}
                {sseStatus === 'offline' && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 border border-[var(--loss)]"
                    style={{ background: 'var(--loss-dim)', color: 'var(--loss)' }}
                    role="status"
                    aria-label="Connection offline"
                  >
                    <WifiOff className="w-3 h-3" aria-hidden="true" />
                    <span>OFFLINE</span>
                  </div>
                )}
              </div>

              <div className="flex-1" />

              <div
                className="flex items-center gap-2 font-number text-xs"
                style={{ color: 'var(--text-secondary)' }}
                aria-label={`Current time: ${timeStr}`}
              >
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span className="font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                  {timeStr}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ color: 'var(--text-muted)' }}>{dateStr}</span>
              </div>
            </div>

            {error && (
              <div
                className="banner-danger flex items-center gap-2 px-6 py-3 text-sm"
                role="alert"
                aria-live="assertive"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <AnimatedRoutes />
          </main>
        </div>
      </Router>
    </MotionConfig>
  );
}
