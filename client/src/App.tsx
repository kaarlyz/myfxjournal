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
import Backtest from './pages/Backtest';
import Landing from './pages/Landing';
import { useJournalStore } from './store/useJournalStore';
import { useLiveJournalStore } from './store/useLiveJournalStore';
import { AlertTriangle, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import WidgetErrorBoundary from './components/WidgetErrorBoundary';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { useOnboarding } from './hooks/useOnboarding';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';

interface AnimatedRoutesProps {
  isAuthenticated: boolean;
}

function AnimatedRoutes({ isAuthenticated }: AnimatedRoutesProps) {
  const location = useLocation();
  const isLanding = location.pathname === '/landing' || (location.pathname === '/' && !isAuthenticated);
  const isFullBleed = location.pathname === '/backtest' || isLanding;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={
          isFullBleed
            ? "w-full max-w-none p-0 flex-1 flex flex-col min-w-0 min-h-0 overflow-x-hidden"
            : "w-full max-w-none px-3.5 sm:px-6 lg:px-8 2xl:px-12 py-4 md:py-6 pb-24 md:pb-8"
        }
      >
        <WidgetErrorBoundary>
          <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                isAuthenticated ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Landing />
                )
              }
            />
            <Route path="/landing"                       element={<Landing />} />
            <Route path="/sessions"                     element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/dashboard"                    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/create-session"               element={<ProtectedRoute><CreateSession /></ProtectedRoute>} />
            <Route path="/csv-import"                   element={<ProtectedRoute><CSVImport /></ProtectedRoute>} />
            <Route path="/mt5-import"                   element={<ProtectedRoute><MT5ReportImport /></ProtectedRoute>} />
            <Route path="/mt5-report"                   element={<ProtectedRoute><MT5ReportDashboard /></ProtectedRoute>} />
            <Route path="/reports/mt5/:reportId/print"     element={<ProtectedRoute><ReportPrint kind="mt5" /></ProtectedRoute>} />
            <Route path="/reports/session/:sessionId/print" element={<ProtectedRoute><ReportPrint kind="session" /></ProtectedRoute>} />
            <Route path="/reports/live/:accountId/print"   element={<ProtectedRoute><ReportPrint kind="live" /></ProtectedRoute>} />
            <Route path="/quick-logger"                 element={<ProtectedRoute><QuickLogger /></ProtectedRoute>} />
            <Route path="/compare-sessions"             element={<ProtectedRoute><CompareSessions /></ProtectedRoute>} />
            <Route path="/webhook-monitor"              element={<ProtectedRoute><WebhookMonitor /></ProtectedRoute>} />
            <Route path="/settings"                     element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/live-journal"                 element={<ProtectedRoute><LiveJournal /></ProtectedRoute>} />
            <Route path="/accounts"                     element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
            <Route path="/mt5-connections"              element={<ProtectedRoute><MT5Connections /></ProtectedRoute>} />
            <Route path="/market-data"                  element={<ProtectedRoute><MarketData /></ProtectedRoute>} />
            <Route path="/integrations"                 element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
            <Route path="/ea-control"                   element={<ProtectedRoute><EAControlCenter /></ProtectedRoute>} />
            <Route path="/setup-review"                 element={<ProtectedRoute><SetupReview /></ProtectedRoute>} />
            <Route path="/risk-calculator"              element={<ProtectedRoute><RiskCalculator /></ProtectedRoute>} />
            <Route path="/prop-sim"                     element={<ProtectedRoute><PropFirmSimulator /></ProtectedRoute>} />
            <Route path="/monte-carlo"                  element={<ProtectedRoute><MonteCarlo /></ProtectedRoute>} />
            <Route path="/backtest"                     element={<ProtectedRoute><Backtest /></ProtectedRoute>} />
            <Route path="*"                             element={<Navigate to="/" replace />} />
          </Routes>
        </WidgetErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );
}

function AppContent() {
  const location = useLocation();
  const isPublicRoute = location.pathname === '/' || location.pathname === '/landing';
  const { error, fetchSettings, fetchSessions } = useJournalStore();
  const { listenToSSE, sseStatus } = useLiveJournalStore();
  const { completed, isReady, completeOnboarding } = useOnboarding();
  const { isAuthenticated } = useAuth();
  const [time, setTime] = useState(new Date());
  const [transitioning, setTransitioning] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
      fetchSessions();
      listenToSSE();
    }
  }, [isAuthenticated, fetchSettings, fetchSessions, listenToSSE]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleOnboardingComplete = (userName: string) => {
    completeOnboarding(userName);
    setTransitioning(true);
    window.setTimeout(() => {
      setTransitioning(false);
    }, 240);
  };

  const padZ = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${padZ(time.getHours())}:${padZ(time.getMinutes())}:${padZ(time.getSeconds())}`;
  const dateStr = time.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  // Onboarding guard: only intercept internal protected routes when authenticated
  if (!isPublicRoute && isAuthenticated) {
    if (!isReady) {
      return <div className="min-h-screen bg-[#FAF9F6]" />;
    }

    if (!completed) {
      return (
        <div className="min-h-screen bg-[#FAF9F6]">
          <OnboardingFlow onComplete={handleOnboardingComplete} />
          {transitioning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              className="fixed inset-0 z-50 bg-[#FAF9F6]"
            />
          )}
        </div>
      );
    }
  }

  const isBacktestPath = (pathname: string) => pathname === '/backtest';

  return (
    <AppShell
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
      isBacktestPath={isBacktestPath}
      sseStatus={sseStatus}
      error={error}
      timeStr={timeStr}
      dateStr={dateStr}
      isAuthenticated={isAuthenticated}
    />
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Router>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </MotionConfig>
  );
}

interface AppShellProps {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  isBacktestPath: (pathname: string) => boolean;
  sseStatus: string;
  error: string | null;
  timeStr: string;
  dateStr: string;
  isAuthenticated: boolean;
}

function AppShell({ mobileNavOpen, setMobileNavOpen, isBacktestPath, sseStatus, error, timeStr, dateStr, isAuthenticated }: AppShellProps) {
  const location = useLocation();
  const isLanding = location.pathname === '/landing' || (location.pathname === '/' && !isAuthenticated);
  const hideChrome = isBacktestPath(location.pathname) || isLanding;

  return (
    <div className={`app-shell ${isLanding ? '!block min-h-screen bg-white' : ''}`}>
      {!isLanding && (
        <Sidebar mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen} />
      )}

      <main className={`main-shell relative z-10 ${isLanding ? '!overflow-y-auto !h-auto !min-h-screen bg-white' : ''}`}>
        {!hideChrome && (
          <div className="topbar" aria-label="Application toolbar">
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {sseStatus === 'live' && (
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 border border-[var(--profit)] text-[10px] sm:text-xs"
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
                  className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 border border-[var(--warning)] text-[10px] sm:text-xs"
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
                  className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 border border-[var(--loss)] text-[10px] sm:text-xs"
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
              className="flex items-center gap-1.5 sm:gap-2 font-number text-[11px] sm:text-xs"
              style={{ color: 'var(--text-secondary)' }}
              aria-label={`Current time: ${timeStr}`}
            >
              <Clock className="w-3 h-3" aria-hidden="true" />
              <span className="font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                {timeStr}
              </span>
              <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>·</span>
              <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{dateStr}</span>
            </div>
          </div>
        )}

        {error && (
          <div
            className="banner-danger flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <AnimatedRoutes isAuthenticated={isAuthenticated} />
      </main>

      {!hideChrome && (
        <MobileBottomNav onToggleMenu={() => setMobileNavOpen(!mobileNavOpen)} isMenuOpen={mobileNavOpen} />
      )}
    </div>
  );
}
