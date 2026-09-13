import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/ui/BrandLogo';
import {
  Play,
  Zap,
  Crosshair,
  BarChart3,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  ExternalLink,
  Layers,
  Sparkles,
  Sliders,
  History,
  Activity,
  Maximize2,
  GripVertical,
  Bot,
  Wifi,
  Shield,
  Dices,
  Send,
  Wallet,
  Clock,
  Check,
  Award,
  DollarSign,
  Terminal,
  ShieldAlert,
  Database,
  RefreshCw,
  FileText,
  Smartphone,
  MessageSquare,
  Download
} from 'lucide-react';
import AuthModal from '../components/auth/AuthModal';

const MotionLink = motion.create(Link);

/* ── Neo-Brutalist Snappy Spring Variants ── */
const heroContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
};

const popVariant: Variants = {
  hidden: { opacity: 0, y: 35, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 420, damping: 26 },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 25 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 1, 0.5, 1] },
  },
};

const gridVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const cardVariant: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 380, damping: 24 },
  },
};

export default function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroActiveTab, setHeroActiveTab] = useState<'chart' | 'firewall' | 'prop'>('chart');
  const [heroPreviewTab, setHeroPreviewTab] = useState<'mt5' | 'firewall' | 'replay'>('mt5');
  const [mockSignalStatus, setMockSignalStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [botDecision, setBotDecision] = useState<'idle' | 'executed' | 'rejected'>('idle');
  const [bentoApproveStatus, setBentoApproveStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [bentoReplayCount, setBentoReplayCount] = useState<number>(142);
  const [bentoLiveTrades, setBentoLiveTrades] = useState<Array<{ id: number; symbol: string; type: string; lots: string; pnl: string }>>([
    { id: 1, symbol: 'XAUUSD', type: 'BUY', lots: '2.00L', pnl: '+$820.00' },
    { id: 2, symbol: 'EURUSD', type: 'SELL', lots: '1.50L', pnl: '+$240.00' },
    { id: 3, symbol: 'GBPUSD', type: 'BUY', lots: '1.00L', pnl: '+$315.00' },
  ]);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const handleSimulateFill = () => {
    const symbols = ['XAUUSD', 'NAS100', 'US30', 'EURUSD', 'GBPUSD', 'BTCUSD'];
    const types = ['BUY', 'SELL'];
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    const randomType = types[Math.floor(Math.random() * types.length)];
    const randomLots = (Math.random() * 2 + 0.5).toFixed(2) + 'L';
    const isProfit = Math.random() > 0.3;
    const amount = (Math.random() * 650 + 120).toFixed(2);
    const randomPnl = isProfit ? `+$${amount}` : `-$${(Math.random() * 180 + 40).toFixed(2)}`;

    setBentoLiveTrades(prev => [
      { id: Date.now(), symbol: randomSymbol, type: randomType, lots: randomLots, pnl: randomPnl },
      ...prev.slice(0, 3)
    ]);
  };

  useEffect(() => {
    if (location.state?.openAuth && !isAuthenticated) {
      setShowAuthModal(true);
    }
  }, [location.state, isAuthenticated]);

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      setShowAuthModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#121212] font-sans antialiased selection:bg-[#FEF08A] selection:text-[#121212]">
      {/* ── 1. STICKY NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xs border-b-2 border-[#121212]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link to="/landing" className="flex items-center group select-none">
            <BrandLogo size={36} className="flex-shrink-0" />
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-5 text-xs font-mono font-black uppercase tracking-wider text-[#404040]">
            <a href="#mt5-bridge" className="hover:text-[#121212] hover:underline underline-offset-4 transition-colors">
              MT5 Sync
            </a>
            <a href="#replay-engine" className="hover:text-[#121212] hover:underline underline-offset-4 transition-colors">
              Replay
            </a>
            <a href="#prop-simulator" className="hover:text-[#121212] hover:underline underline-offset-4 transition-colors">
              Prop Sim
            </a>
            <a href="#ea-control" className="hover:text-[#121212] hover:underline underline-offset-4 transition-colors">
              EA Firewall
            </a>
            <a href="#arsenal" className="hover:text-[#121212] hover:underline underline-offset-4 transition-colors">
              Arsenal
            </a>
            <a href="#faq" className="hover:text-[#121212] hover:underline underline-offset-4 transition-colors">
              FAQ
            </a>
            <a href="#specs" className="hover:text-[#121212] hover:underline underline-offset-4 transition-colors">
              Compare
            </a>
          </nav>

          {/* Desktop Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <motion.button
              type="button"
              onClick={handleGetStarted}
              whileHover={{ x: 1, y: 1 }}
              whileTap={{ x: 2, y: 2 }}
              className="px-3.5 py-1.5 text-xs font-mono font-black uppercase tracking-wider text-[#121212] bg-[#FEF08A] hover:bg-[#FDE047] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded cursor-pointer transition-colors"
            >
              {isAuthenticated ? 'Open Dashboard' : 'Get Started'}
            </motion.button>
            <MotionLink
              to="/dashboard"
              whileHover={{ x: 1, y: 1 }}
              whileTap={{ x: 2, y: 2 }}
              className="px-3.5 py-1.5 text-xs font-mono font-black uppercase tracking-wider text-[#121212] hover:bg-slate-100 border-2 border-transparent hover:border-[#121212] rounded transition-colors"
            >
              Dashboard
            </MotionLink>
            <MotionLink
              to="/backtest"
              whileHover={{ x: 2, y: 2, boxShadow: '0px 0px 0px 0px #121212' }}
              whileTap={{ x: 2, y: 2, boxShadow: '0px 0px 0px 0px #121212' }}
              transition={{ duration: 0.08, ease: 'easeOut' }}
              className="px-4 py-2 bg-[#121212] hover:bg-[#222222] text-white border-2 border-[#121212] rounded shadow-[2px_2px_0px_0px_#121212] font-mono font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Launch Workspace</span>
            </MotionLink>
          </div>

          {/* Mobile Menu Trigger */}
          <motion.button
            type="button"
            whileTap={{ x: 2, y: 2, boxShadow: '0px 0px 0px 0px #121212' }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-[#121212] border-2 border-[#121212] rounded shadow-[2px_2px_0px_0px_#121212]"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </motion.button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t-2 border-[#121212] bg-white p-4 space-y-3">
            <a
              href="#mt5-bridge"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-mono text-sm font-bold uppercase py-1 text-[#121212]"
            >
              MT5 Live Sync
            </a>
            <a
              href="#replay-engine"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-mono text-sm font-bold uppercase py-1 text-[#121212]"
            >
              Replay Engine
            </a>
            <a
              href="#prop-simulator"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-mono text-sm font-bold uppercase py-1 text-[#121212]"
            >
              Prop Firm Simulator
            </a>
            <a
              href="#ea-control"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-mono text-sm font-bold uppercase py-1 text-[#121212]"
            >
              EA Signal Firewall
            </a>
            <a
              href="#arsenal"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-mono text-sm font-bold uppercase py-1 text-[#121212]"
            >
              Tactical Arsenal
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-mono text-sm font-bold uppercase py-1 text-[#121212]"
            >
              FAQ
            </a>
            <a
              href="#specs"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-mono text-sm font-bold uppercase py-1 text-[#121212]"
            >
              Comparison
            </a>
            <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleGetStarted();
                }}
                className="w-full text-center py-2.5 bg-[#FEF08A] hover:bg-[#FDE047] text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] font-mono text-xs font-black uppercase cursor-pointer"
              >
                {isAuthenticated ? 'Open Dashboard' : 'Get Started'}
              </button>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 border-2 border-[#121212] font-mono text-xs font-black uppercase hover:bg-slate-50"
              >
                Dashboard
              </Link>
              <Link
                to="/backtest"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-3 bg-[#121212] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] font-mono text-xs font-black uppercase"
              >
                Open Workspace
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── 2. HERO SECTION (THE HOOK) ── */}
      <section className="pt-14 pb-20 sm:pt-20 sm:pb-28 bg-[#FAFAFA] border-b-2 border-[#121212] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-4xl"
          >
            {/* Dynamic Status Pill */}
            <motion.div
              variants={popVariant}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#E7F9F0] border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] mb-6 rounded"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#059669] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#059669]" />
              </span>
              <span className="text-[11px] font-mono font-black uppercase tracking-wider text-[#065F46]">
                KAFX ENGINE ONLINE • 725M TICKS INDEXED
              </span>
            </motion.div>

            {/* Main Trader Headline */}
            <motion.h1
              variants={popVariant}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-slate-900 leading-[0.93] uppercase"
            >
              THE ULTIMATE <br />
              <span className="text-[#1040C0]">TRADING COMMAND CENTER.</span>
            </motion.h1>

            {/* Subheadline Focused on Trader Features */}
            <motion.p
              variants={popVariant}
              className="mt-6 text-base sm:text-lg md:text-xl text-[#333333] font-medium max-w-2xl leading-relaxed"
            >
              Automate your trade journaling from MetaTrader 5, protect your capital with Prop Firm challenge rules, supervise your automated bots, and backtest your edge tick-by-tick.
            </motion.p>

            {/* Action CTAs */}
            <motion.div
              variants={popVariant}
              className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4"
            >
              <motion.button
                type="button"
                onClick={handleGetStarted}
                whileHover={{ x: 2, y: 2, boxShadow: '4px 4px 0px 0px #121212' }}
                whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                transition={{ duration: 0.08, ease: 'easeOut' }}
                className="px-7 py-4 bg-[#121212] hover:bg-[#262626] text-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer rounded"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{isAuthenticated ? 'Open Dashboard' : 'Get Started Free'}</span>
              </motion.button>
              <MotionLink
                to="/backtest"
                whileHover={{ x: 2, y: 2, boxShadow: '4px 4px 0px 0px #121212' }}
                whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                transition={{ duration: 0.08, ease: 'easeOut' }}
                className="px-7 py-4 bg-white hover:bg-slate-100 text-[#121212] border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer rounded"
              >
                <Activity className="w-4 h-4 text-[#1040C0]" />
                <span>Launch Replay Session</span>
              </MotionLink>
            </motion.div>
          </motion.div>

          {/* Interactive Multi-Tab Terminal Preview */}
          <motion.div
            id="replay"
            initial="hidden"
            animate="visible"
            variants={popVariant}
            className="mt-14 sm:mt-18"
          >
            <div className="border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] bg-white rounded-2xl overflow-hidden">
              {/* Terminal Window Chrome */}
              <div className="w-full bg-[#F4F4F0] border-b-2 border-[#121212] px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#DC2626] border border-[#121212]" />
                    <span className="w-3 h-3 rounded-full bg-[#F59E0B] border border-[#121212]" />
                    <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#121212]" />
                  </div>

                  {/* Interactive Terminal Switcher Tabs */}
                  <div className="flex items-center gap-1.5 p-1 bg-[#EBEBE8] border-2 border-[#121212] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setHeroPreviewTab('mt5')}
                      className={`px-3 py-1 text-xs font-mono font-black uppercase rounded transition-all cursor-pointer ${
                        heroPreviewTab === 'mt5'
                          ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#121212]'
                          : 'text-[#525252] hover:text-[#121212]'
                      }`}
                    >
                      [ MT5 SYNC ]
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeroPreviewTab('firewall')}
                      className={`px-3 py-1 text-xs font-mono font-black uppercase rounded transition-all cursor-pointer ${
                        heroPreviewTab === 'firewall'
                          ? 'bg-[#7C3AED] text-white shadow-[2px_2px_0px_0px_#121212]'
                          : 'text-[#525252] hover:text-[#121212]'
                      }`}
                    >
                      [ EA FIREWALL ]
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeroPreviewTab('replay')}
                      className={`px-3 py-1 text-xs font-mono font-black uppercase rounded transition-all cursor-pointer ${
                        heroPreviewTab === 'replay'
                          ? 'bg-[#1040C0] text-white shadow-[2px_2px_0px_0px_#121212]'
                          : 'text-[#525252] hover:text-[#121212]'
                      }`}
                    >
                      [ REPLAY ]
                    </button>
                  </div>
                </div>

                {/* Account Equity & Balance Metric */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] px-3 py-1 rounded">
                    <span className="text-[10px] font-mono font-black uppercase text-[#717182]">FTMO $100K ACCOUNT</span>
                    <span className="text-xs sm:text-sm font-mono font-black text-[#121212]">$104,850.00</span>
                    <span className="text-[10px] font-mono font-black px-1.5 py-0.2 bg-[#E7F9F0] text-[#059669] border border-[#059669] rounded">
                      +4.85%
                    </span>
                  </div>
                </div>
              </div>

              {/* AnimatePresence Terminal Body */}
              <div className="min-h-[380px] bg-slate-50 relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {heroPreviewTab === 'mt5' && (
                    <motion.div
                      key="mt5"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="p-4 sm:p-6 space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* MT5 Terminal Ingest */}
                        <div className="bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] rounded-xl p-4">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
                            <span className="text-xs font-mono font-black text-[#121212] uppercase flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#059669] animate-ping" />
                              MT5 CLIENT TERMINAL
                            </span>
                            <span className="text-[10px] font-mono text-[#059669] font-bold bg-[#E7F9F0] px-2 py-0.5 border border-[#059669] rounded">
                              ● STREAMING TICKS
                            </span>
                          </div>
                          <div className="space-y-2 text-xs font-mono">
                            <div className="p-2.5 bg-[#FAF9F6] border border-[#121212] rounded-lg flex justify-between items-center">
                              <div>
                                <span className="font-black text-[#121212] block">XAUUSD BUY 2.00L</span>
                                <span className="text-[10px] text-[#717182]">Ticket #982141 · Fill: 2654.50</span>
                              </div>
                              <span className="font-black text-[#059669] text-sm">+$820.00</span>
                            </div>
                            <div className="p-2.5 bg-[#FAF9F6] border border-[#121212] rounded-lg flex justify-between items-center">
                              <div>
                                <span className="font-black text-[#121212] block">EURUSD SELL 1.50L</span>
                                <span className="text-[10px] text-[#717182]">Ticket #982142 · Fill: 1.0850</span>
                              </div>
                              <span className="font-black text-[#059669] text-sm">+$180.00</span>
                            </div>
                            <div className="p-2.5 bg-[#FAF9F6] border border-[#121212] rounded-lg flex justify-between items-center">
                              <div>
                                <span className="font-black text-[#121212] block">GBPUSD BUY 1.00L</span>
                                <span className="text-[10px] text-[#717182]">Ticket #982143 · Fill: 1.2980</span>
                              </div>
                              <span className="font-black text-[#059669] text-sm">+$315.00</span>
                            </div>
                          </div>
                        </div>

                        {/* KAFX Journal Auto-Capture */}
                        <div className="bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] rounded-xl p-4">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
                            <span className="text-xs font-mono font-black text-[#121212] uppercase">
                              KAFX AUTO-JOURNAL ENTRY
                            </span>
                            <span className="text-[10px] font-mono text-[#1040C0] font-bold bg-[#EBF2FF] px-2 py-0.5 border border-[#1040C0] rounded">
                              ZERO MANUAL TYPING
                            </span>
                          </div>
                          <div className="space-y-2 text-xs font-mono">
                            <div className="p-2.5 bg-[#F0FFF8] border border-[#059669] rounded-lg flex justify-between items-center">
                              <div>
                                <span className="font-black text-[#121212] block">XAUUSD · +2.4R TARGET HIT</span>
                                <span className="text-[10px] text-[#059669]">Execution Duration: 18m · Slippage: 0.0 Pip</span>
                              </div>
                              <span className="text-[10px] font-bold bg-white px-2 py-0.5 border border-[#059669] rounded">
                                AUTO-TAGGED
                              </span>
                            </div>
                            <div className="p-2.5 bg-[#F0FFF8] border border-[#059669] rounded-lg flex justify-between items-center">
                              <div>
                                <span className="font-black text-[#121212] block">EURUSD · +1.2R RUNNING</span>
                                <span className="text-[10px] text-[#717182]">Commission: $4.50 · Swap: $0.00</span>
                              </div>
                              <span className="text-[10px] font-bold bg-white px-2 py-0.5 border border-[#059669] rounded">
                                AUTO-TAGGED
                              </span>
                            </div>
                            <div className="p-2.5 bg-[#F0FFF8] border border-[#059669] rounded-lg flex justify-between items-center">
                              <div>
                                <span className="font-black text-[#121212] block">GBPUSD · +1.5R RUNNING</span>
                                <span className="text-[10px] text-[#717182]">MFE: +2.1R · MAE: -0.3R</span>
                              </div>
                              <span className="text-[10px] font-bold bg-white px-2 py-0.5 border border-[#059669] rounded">
                                AUTO-TAGGED
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-[#EBF2FF] border-2 border-[#1040C0] rounded-xl flex items-center justify-between text-xs font-mono font-black text-[#1040C0]">
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          BROKER STREAM: 100% IN SYNC · 0 DELAY · SECURE ON-DEVICE STORAGE
                        </span>
                        <span className="hidden sm:inline bg-[#1040C0] text-white px-2 py-0.5 rounded text-[10px]">
                          ACTIVE
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {heroPreviewTab === 'firewall' && (
                    <motion.div
                      key="firewall"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="p-4 sm:p-6 space-y-4"
                    >
                      <div className="bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] rounded-xl p-4 sm:p-5">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                            <span className="text-xs sm:text-sm font-mono font-black text-[#121212] uppercase">
                              INCOMING BOT SIGNAL #7419: ScalperPro EA v4.2
                            </span>
                          </div>
                          <span className="text-[10px] font-mono px-2.5 py-1 bg-[#FEF08A] text-[#854D0E] font-black border border-[#854D0E] rounded">
                            AWAITING OPERATOR APPROVAL
                          </span>
                        </div>

                        <div className="space-y-3 text-xs font-mono">
                          <div className="p-2.5 bg-[#FAF9F6] border border-[#121212] rounded-lg flex justify-between items-center">
                            <span className="font-bold text-[#717182]">ACTION:</span>
                            <span className="font-black text-[#059669] bg-[#E7F9F0] px-2.5 py-1 rounded border border-[#059669]">
                              BUY 1.50 LOTS XAUUSD @ 2654.20
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="p-3 bg-white border border-[#121212] rounded-lg">
                              <span className="text-[#717182] block text-[10px]">ENTRY / SL / TP</span>
                              <strong className="text-[#121212] text-sm block">2654.20 / 2649.20</strong>
                              <span className="text-[#059669] font-bold">TP: 2664.20 (1:2.0 Risk:Reward)</span>
                            </div>
                            <div className="p-3 bg-white border border-[#121212] rounded-lg">
                              <span className="text-[#717182] block text-[10px]">RISK EXPOSURE</span>
                              <strong className="text-[#DC2626] text-sm block">-$750.00 (0.75% of Capital)</strong>
                              <span className="text-[#059669] font-bold">Within Daily $5,000 Limit</span>
                            </div>
                          </div>

                          <div className="p-2.5 bg-[#F0FFF8] border border-[#059669] rounded-lg flex items-center justify-between text-xs">
                            <span className="text-[#059669] font-bold flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              Rules Verified: No High-Impact News Event in Next 45 Minutes
                            </span>
                            <span className="text-[10px] font-mono text-[#717182]">Latency: 0.8ms</span>
                          </div>
                        </div>

                        {/* Interactive Approval Controls */}
                        <div className="mt-4 pt-3 border-t border-slate-200">
                          {mockSignalStatus === 'pending' && (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setMockSignalStatus('rejected')}
                                className="flex-1 py-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-mono font-black text-xs uppercase tracking-wider rounded border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] cursor-pointer"
                              >
                                Abort Signal
                              </button>
                              <button
                                type="button"
                                onClick={() => setMockSignalStatus('approved')}
                                className="flex-1 py-3 bg-[#059669] hover:bg-[#047857] text-white font-mono font-black text-xs uppercase tracking-wider rounded border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] cursor-pointer"
                              >
                                Approve &amp; Execute
                              </button>
                            </div>
                          )}
                          {mockSignalStatus === 'approved' && (
                            <div className="p-3 bg-[#E7F9F0] border-2 border-[#059669] rounded-lg flex items-center justify-between text-xs font-mono font-black text-[#059669]">
                              <span className="flex items-center gap-2">
                                <Check className="w-4 h-4" />
                                SIGNAL APPROVED: TICKET SENT TO METATRADER 5 (#108492)
                              </span>
                              <button
                                type="button"
                                onClick={() => setMockSignalStatus('pending')}
                                className="text-[11px] text-[#717182] underline cursor-pointer font-normal"
                              >
                                Reset Demo
                              </button>
                            </div>
                          )}
                          {mockSignalStatus === 'rejected' && (
                            <div className="p-3 bg-[#FFF0F0] border-2 border-[#DC2626] rounded-lg flex items-center justify-between text-xs font-mono font-black text-[#DC2626]">
                              <span className="flex items-center gap-2">
                                <X className="w-4 h-4" />
                                SIGNAL REJECTED: BLOCKED BEFORE REACHING BROKER
                              </span>
                              <button
                                type="button"
                                onClick={() => setMockSignalStatus('pending')}
                                className="text-[11px] text-[#717182] underline cursor-pointer font-normal"
                              >
                                Reset Demo
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {heroPreviewTab === 'replay' && (
                    <motion.div
                      key="replay"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="p-4 sm:p-6 space-y-4"
                    >
                      <div className="bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] rounded-xl overflow-hidden">
                        {/* Subheader */}
                        <div className="bg-[#FAF9F6] border-b border-[#121212] px-3.5 py-2 flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-[#121212]">EURUSD • M5 HISTORICAL REPLAY</span>
                            <span className="text-[#059669] font-bold bg-[#E7F9F0] px-1.5 py-0.5 rounded border border-[#059669]">
                              ZERO LOOK-AHEAD
                            </span>
                          </div>
                          <span className="font-bold text-[#717182]">PLAYHEAD: CANDLE 214 OF 500</span>
                        </div>

                        {/* Visual Candle Area */}
                        <div className="h-64 sm:h-72 bg-white relative p-4 flex flex-col justify-between overflow-hidden">
                          {/* Grid lines */}
                          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between py-6 px-4 opacity-20">
                            <div className="border-b border-dashed border-[#121212]" />
                            <div className="border-b border-dashed border-[#121212]" />
                            <div className="border-b border-dashed border-[#121212]" />
                          </div>

                          {/* Price scale */}
                          <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-between py-4 text-[9px] font-mono font-bold text-[#717182] pointer-events-none text-right">
                            <span className="text-[#059669] font-black">1.0865 TP</span>
                            <span className="text-[#1040C0] font-black">1.0835 FILL</span>
                            <span className="text-[#DC2626] font-black">1.0820 SL</span>
                          </div>

                          {/* Shaded TP / SL zones */}
                          <div className="absolute top-[20%] left-4 right-18 h-[38%] bg-[#059669]/10 border-l-2 border-[#059669] pointer-events-none rounded-r" />
                          <div className="absolute top-[58%] left-4 right-18 h-[24%] bg-[#DC2626]/10 border-l-2 border-[#DC2626] pointer-events-none rounded-r" />

                          {/* Candlesticks */}
                          <div className="relative z-10 w-full h-full flex items-end justify-around px-8 pr-16 pb-2">
                            <div className="flex flex-col items-center"><div className="w-[1.5px] h-3 bg-[#DC2626]" /><div className="w-3 h-14 bg-[#DC2626] border border-[#121212]" /><div className="w-[1.5px] h-2 bg-[#DC2626]" /></div>
                            <div className="flex flex-col items-center"><div className="w-[1.5px] h-2 bg-[#059669]" /><div className="w-3 h-10 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-8 bg-[#059669]" /></div>
                            <div className="flex flex-col items-center"><div className="w-[1.5px] h-4 bg-[#059669]" /><div className="w-3 h-20 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-3 bg-[#059669]" /></div>
                            <div className="flex flex-col items-center"><div className="w-[1.5px] h-3 bg-[#DC2626]" /><div className="w-3 h-8 bg-[#DC2626] border border-[#121212]" /><div className="w-[1.5px] h-4 bg-[#DC2626]" /></div>
                            <div className="flex flex-col items-center"><div className="w-[1.5px] h-4 bg-[#059669]" /><div className="w-3 h-24 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-2 bg-[#059669]" /></div>
                            <div className="flex flex-col items-center relative"><span className="w-2 h-2 rounded-full bg-[#059669] animate-ping absolute -top-3" /><div className="w-[2px] h-5 bg-[#059669]" /><div className="w-3.5 h-20 bg-[#059669] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]" /><div className="w-[2px] h-2 bg-[#059669]" /></div>
                          </div>
                        </div>

                        {/* Transport Footer */}
                        <div className="bg-[#FAF9F6] border-t-2 border-[#121212] p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono font-black">
                          <div className="flex items-center gap-1.5">
                            <button type="button" className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer">
                              ◀ STEP
                            </button>
                            <button type="button" className="px-3.5 py-1 bg-[#121212] text-white hover:bg-[#262626] border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer flex items-center gap-1">
                              <Play className="w-3 h-3 fill-white" /> PLAY
                            </button>
                            <button type="button" className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer">
                              STEP ▶
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            {['0.5X', '1X', '3X', '10X'].map((spd) => (
                              <span
                                key={spd}
                                className={`px-2 py-0.5 text-[10px] rounded border ${
                                  spd === '1X'
                                    ? 'bg-[#121212] text-white border-[#121212]'
                                    : 'bg-white text-[#717182] border-slate-300'
                                }`}
                              >
                                {spd}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom status strip */}
              <div className="bg-[#121212] text-white px-4 py-2 border-t-2 border-[#121212] flex flex-wrap items-center justify-between text-[11px] font-mono font-bold select-none gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-[#34D399] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    LOCAL ENGINE ONLINE
                  </span>
                  <span className="text-[#717182]">•</span>
                  <span>LOOK-AHEAD BIAS: 100% BLOCKED</span>
                </div>
                <span className="text-[#FEF08A]">100% PRIVATE · DATA NEVER LEAVES YOUR MACHINE</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 3. LIVE TRADER TICKER (THE ACTIVE VIBE) ── */}
      <div className="border-y-4 border-[#121212] bg-[#121212] text-white py-3.5 overflow-hidden whitespace-nowrap select-none flex">
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ repeat: Infinity, ease: 'linear', duration: 25 }}
          className="flex items-center shrink-0"
        >
          {/* Set 1 */}
          <div className="flex items-center gap-8 font-mono font-black text-sm sm:text-base tracking-widest pr-8">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-pulse" />
              AUTOMATED MT5 BRIDGE
            </span>
            <span className="text-[#FEF08A]">•</span>
            <span className="text-[#FEF08A]">PROP FIRM CHALLENGE GUARD</span>
            <span className="text-[#FEF08A]">•</span>
            <span>EA SIGNAL FIREWALL</span>
            <span className="text-[#38BDF8]">•</span>
            <span className="text-[#38BDF8]">TICK-BY-TICK REPLAY</span>
            <span className="text-[#38BDF8]">•</span>
            <span className="text-[#34D399]">MONTE CARLO RISK LAB</span>
            <span className="text-[#34D399]">•</span>
            <span>WHATSAPP &amp; TELEGRAM ALERTS</span>
            <span>•</span>
            <span>MULTI-BROKER TRACKING</span>
            <span>•</span>
            <span className="text-[#FEF08A]">ZERO MANUAL ENTRY</span>
            <span>•</span>
          </div>
          {/* Set 2 (Identical duplicate for seamless continuous loop) */}
          <div className="flex items-center gap-8 font-mono font-black text-sm sm:text-base tracking-widest pr-8">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-pulse" />
              AUTOMATED MT5 BRIDGE
            </span>
            <span className="text-[#FEF08A]">•</span>
            <span className="text-[#FEF08A]">PROP FIRM CHALLENGE GUARD</span>
            <span className="text-[#FEF08A]">•</span>
            <span>EA SIGNAL FIREWALL</span>
            <span className="text-[#38BDF8]">•</span>
            <span className="text-[#38BDF8]">TICK-BY-TICK REPLAY</span>
            <span className="text-[#38BDF8]">•</span>
            <span className="text-[#34D399]">MONTE CARLO RISK LAB</span>
            <span className="text-[#34D399]">•</span>
            <span>WHATSAPP &amp; TELEGRAM ALERTS</span>
            <span>•</span>
            <span>MULTI-BROKER TRACKING</span>
            <span>•</span>
            <span className="text-[#FEF08A]">ZERO MANUAL ENTRY</span>
            <span>•</span>
          </div>
        </motion.div>
      </div>

      {/* ── 4. THE ARSENAL (INTERACTIVE BENTO GRID HUB) ── */}
      <section id="arsenal" className="py-20 sm:py-28 bg-[#FAF9F6] border-b-4 border-[#121212]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={sectionVariants}
            className="text-center max-w-3xl mx-auto mb-14"
          >
            <span className="text-xs font-mono font-black uppercase tracking-widest text-[#1040C0] bg-[#EBF2FF] border border-[#1040C0] px-3 py-1 rounded inline-block mb-3 shadow-[2px_2px_0px_0px_#1040C0]">
              [ TACTICAL TRADING ARSENAL ]
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-[#121212] uppercase leading-[0.96]">
              Four Interactive Engines Built To Guard Your Edge.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-[#404040] font-medium leading-relaxed max-w-2xl mx-auto">
              Test drive the live interactive toolset right here. Simulate real-time MT5 trade fills, monitor prop firm drawdown limits, veto automated bot signals, and step through market ticks.
            </p>
          </motion.div>

          {/* Asymmetrical Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            {/* Bento Card 1: MT5 Auto-Sync (Col-Span 7) */}
            <motion.div
              variants={cardVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="lg:col-span-7 bg-white border-4 border-[#121212] rounded-2xl p-6 sm:p-8 shadow-[8px_8px_0px_0px_#121212] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-ping" />
                    <span className="text-[10px] font-mono font-black uppercase text-[#059669] bg-[#E7F9F0] px-2.5 py-1 rounded border border-[#059669]">
                      [ MT5 BRIDGE ONLINE ]
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-[#717182]">STREAM DELAY: &lt;5MS</span>
                </div>
                <h3 className="font-mono font-black text-xl sm:text-2xl text-[#121212] uppercase tracking-tight">
                  Instant MT5 Trade Synchronization
                </h3>
                <p className="text-xs sm:text-sm font-mono text-[#525252] mt-2 mb-6">
                  Every executed lot, entry price, stop loss, and exit on MetaTrader 5 streams automatically into your journal. Zero manual typing.
                </p>

                {/* Simulated Feed Display */}
                <div className="bg-[#FAF9F6] border-2 border-[#121212] rounded-xl p-4 mb-4 space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-[#121212]/15 text-[10px] font-mono font-black uppercase text-[#717182]">
                    <span>Recent Streamed Fills</span>
                    <span className="text-[#059669]">Synced to Local Journal</span>
                  </div>

                  <div className="space-y-2 min-h-[140px]">
                    <AnimatePresence initial={false}>
                      {bentoLiveTrades.map((trade) => (
                        <motion.div
                          key={trade.id}
                          initial={{ opacity: 0, y: -16, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                          className="flex items-center justify-between bg-white border-2 border-[#121212] px-3 py-2 rounded shadow-[2px_2px_0px_0px_#121212] font-mono text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-black text-[#121212]">{trade.symbol}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                trade.type === 'BUY'
                                  ? 'bg-[#E7F9F0] text-[#059669] border border-[#059669]'
                                  : 'bg-[#FEE2E2] text-[#E11D48] border border-[#E11D48]'
                              }`}
                            >
                              {trade.type}
                            </span>
                            <span className="text-[11px] text-[#717182]">{trade.lots}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-black ${
                                trade.pnl.startsWith('+') ? 'text-[#059669]' : 'text-[#E11D48]'
                              }`}
                            >
                              {trade.pnl}
                            </span>
                            <span className="text-[9px] bg-[#FAF9F6] border border-[#121212]/30 px-1 py-0.5 rounded text-[#717182]">
                              LOGGED
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <motion.button
                  type="button"
                  onClick={handleSimulateFill}
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="w-full py-3 bg-[#FEF08A] hover:bg-[#FDE047] text-[#121212] border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded-xl font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Zap className="w-4 h-4 fill-[#121212]" />
                  <span>⚡ Simulate Live MT5 Fill</span>
                </motion.button>
              </div>
            </motion.div>

            {/* Bento Card 2: Prop Firm Simulator (Col-Span 5) */}
            <motion.div
              variants={cardVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="lg:col-span-5 bg-white border-4 border-[#121212] rounded-2xl p-6 sm:p-8 shadow-[8px_8px_0px_0px_#121212] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="text-[10px] font-mono font-black uppercase text-[#1040C0] bg-[#EBF2FF] px-2.5 py-1 rounded border border-[#1040C0]">
                    [ PROP FIRM RULES ]
                  </span>
                  <span className="text-[10px] font-mono font-black text-[#059669] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    RULE COMPLIANT
                  </span>
                </div>
                <h3 className="font-mono font-black text-xl sm:text-2xl text-[#121212] uppercase tracking-tight">
                  Prop Firm Drawdown Guard
                </h3>
                <p className="text-xs sm:text-sm font-mono text-[#525252] mt-2 mb-6">
                  Live real-time monitoring of daily loss limits and maximum trailing drawdown for FTMO and FundedNext.
                </p>

                {/* Drawdown Visual Meter */}
                <div className="bg-[#FAF9F6] border-2 border-[#121212] rounded-xl p-4 space-y-4 shadow-[3px_3px_0px_0px_#121212]">
                  {/* Metric 1: Daily Loss */}
                  <div>
                    <div className="flex justify-between text-xs font-mono font-bold text-[#121212] mb-1">
                      <span>Daily Loss: -$1,200</span>
                      <span className="text-[#525252]">Max -$5,000 (24%)</span>
                    </div>
                    <div className="w-full h-3 bg-white border border-[#121212] rounded-full overflow-hidden">
                      <div className="h-full bg-[#1040C0] rounded-full w-[24%]" />
                    </div>
                  </div>

                  {/* Metric 2: Max Trailing Drawdown */}
                  <div>
                    <div className="flex justify-between text-xs font-mono font-bold text-[#121212] mb-1">
                      <span>Trailing DD: -$2,800</span>
                      <span className="text-[#525252]">Max -$10,000 (28%)</span>
                    </div>
                    <div className="w-full h-3 bg-white border border-[#121212] rounded-full overflow-hidden">
                      <div className="h-full bg-[#059669] rounded-full w-[28%]" />
                    </div>
                  </div>

                  {/* Metric 3: Target Progress */}
                  <div>
                    <div className="flex justify-between text-xs font-mono font-bold text-[#121212] mb-1">
                      <span>Challenge Target</span>
                      <span className="text-[#059669] font-black">+$8,000 / $10,000 (80%)</span>
                    </div>
                    <div className="w-full h-3 bg-white border border-[#121212] rounded-full overflow-hidden">
                      <div className="h-full bg-[#FEF08A] border-r border-[#121212] rounded-full w-[80%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t-2 border-[#121212]/15 flex items-center justify-between font-mono text-[11px] font-bold">
                <span className="text-[#525252]">Account: $100K FTMO Challenge</span>
                <span className="text-[#059669] bg-[#E7F9F0] px-2 py-0.5 rounded border border-[#059669]">
                  SAFE ZONE
                </span>
              </div>
            </motion.div>

            {/* Bento Card 3: EA Firewall & Bot Signal Interceptor (Col-Span 5) */}
            <motion.div
              variants={cardVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="lg:col-span-5 bg-white border-4 border-[#121212] rounded-2xl p-6 sm:p-8 shadow-[8px_8px_0px_0px_#121212] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="text-[10px] font-mono font-black uppercase text-[#E11D48] bg-[#FEE2E2] px-2.5 py-1 rounded border border-[#E11D48]">
                    [ BOT FIREWALL ]
                  </span>
                  <span className="text-[10px] font-mono text-[#717182] flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    TELEGRAM / WHATSAPP
                  </span>
                </div>
                <h3 className="font-mono font-black text-xl sm:text-2xl text-[#121212] uppercase tracking-tight">
                  EA Signal Interceptor
                </h3>
                <p className="text-xs sm:text-sm font-mono text-[#525252] mt-2 mb-4">
                  Require human authorization before automated trading bots or webhooks execute real money orders.
                </p>

                {/* Simulated Notification Box */}
                <div className="bg-[#FAF9F6] border-2 border-[#121212] rounded-xl p-4 mb-4 shadow-[3px_3px_0px_0px_#121212]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-[#1040C0] animate-pulse" />
                    <span className="text-[11px] font-mono font-black uppercase text-[#121212]">
                      Incoming Signal: GoldScalper v4.2
                    </span>
                  </div>
                  <div className="font-mono text-xs text-[#404040] space-y-1 bg-white border border-[#121212]/30 p-2.5 rounded">
                    <div className="flex justify-between">
                      <span className="font-bold text-[#121212]">Order:</span>
                      <span className="font-black text-[#059669]">BUY 1.50 Lots XAUUSD</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span>Entry: 2382.40</span>
                      <span>SL: 2376.00 • TP: 2398.00</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[#717182]">
                      <span>Max Risk: $960.00 (0.96%)</span>
                      <span className="text-[#059669] font-bold">News Filter Passed</span>
                    </div>
                  </div>

                  {/* Dynamic Status / Actions */}
                  <div className="mt-3">
                    {bentoApproveStatus === 'pending' && (
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          type="button"
                          onClick={() => setBentoApproveStatus('approved')}
                          whileHover={{ x: 1, y: 1 }}
                          whileTap={{ x: 2, y: 2 }}
                          className="py-2 bg-[#059669] hover:bg-[#047857] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded font-mono font-black text-xs uppercase cursor-pointer"
                        >
                          [ APPROVE ]
                        </motion.button>
                        <motion.button
                          type="button"
                          onClick={() => setBentoApproveStatus('rejected')}
                          whileHover={{ x: 1, y: 1 }}
                          whileTap={{ x: 2, y: 2 }}
                          className="py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded font-mono font-black text-xs uppercase cursor-pointer"
                        >
                          [ REJECT ]
                        </motion.button>
                      </div>
                    )}

                    {bentoApproveStatus === 'approved' && (
                      <div className="flex items-center justify-between bg-[#E7F9F0] border-2 border-[#059669] p-2 rounded text-xs font-mono">
                        <span className="text-[#059669] font-black">✓ ORDER ROUTED TO BROKER</span>
                        <button
                          type="button"
                          onClick={() => setBentoApproveStatus('pending')}
                          className="text-[10px] underline font-bold text-[#121212] cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    )}

                    {bentoApproveStatus === 'rejected' && (
                      <div className="flex items-center justify-between bg-[#FEE2E2] border-2 border-[#E11D48] p-2 rounded text-xs font-mono">
                        <span className="text-[#E11D48] font-black">🛑 EXECUTION BLOCKED</span>
                        <button
                          type="button"
                          onClick={() => setBentoApproveStatus('pending')}
                          className="text-[10px] underline font-bold text-[#121212] cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="font-mono text-[11px] text-[#717182] flex items-center justify-between">
                <span>Webhook: mt5-bridge/v1/auth</span>
                <span className="text-[#059669] font-bold">Latency: 0.8ms</span>
              </div>
            </motion.div>

            {/* Bento Card 4: Replay Canvas & Step Controls (Col-Span 7) */}
            <motion.div
              variants={cardVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="lg:col-span-7 bg-white border-4 border-[#121212] rounded-2xl p-6 sm:p-8 shadow-[8px_8px_0px_0px_#121212] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="text-[10px] font-mono font-black uppercase text-[#FEF08A] bg-[#121212] px-2.5 py-1 rounded border border-[#121212]">
                    [ TICK-BY-TICK REPLAY ]
                  </span>
                  <span className="text-[10px] font-mono font-black text-[#121212] bg-[#FEF08A] px-2 py-0.5 rounded border border-[#121212]">
                    CANDLE INDEX: #{bentoReplayCount} / 500
                  </span>
                </div>
                <h3 className="font-mono font-black text-xl sm:text-2xl text-[#121212] uppercase tracking-tight">
                  High-Fidelity Market Replay
                </h3>
                <p className="text-xs sm:text-sm font-mono text-[#525252] mt-2 mb-4">
                  Practice your edge on past market sessions without look-ahead bias. Step through each candle bar or play continuously at realistic speeds.
                </p>

                {/* Simulated Candle Canvas Graphic */}
                <div className="bg-[#FAF9F6] border-2 border-[#121212] rounded-xl p-4 mb-4 shadow-[3px_3px_0px_0px_#121212]">
                  <div className="flex items-end justify-between gap-2 h-28 px-4 pt-2 border-b border-[#121212]/20">
                    {[
                      { h: '45%', bull: true },
                      { h: '60%', bull: true },
                      { h: '35%', bull: false },
                      { h: '75%', bull: true },
                      { h: '50%', bull: false },
                      { h: '85%', bull: true },
                      { h: '65%', bull: true },
                      { h: '40%', bull: false },
                      { h: `${Math.min(95, Math.max(30, 45 + (bentoReplayCount % 20) * 2.5))}%`, bull: bentoReplayCount % 2 === 0 },
                    ].map((bar, i) => (
                      <div key={i} className="flex flex-col items-center flex-1 h-full justify-end">
                        <div
                          className="w-1 bg-[#121212]"
                          style={{ height: `calc(${bar.h} + 12px)` }}
                        />
                        <div
                          className={`w-full max-w-[28px] border-2 border-[#121212] rounded-xs ${
                            bar.bull ? 'bg-[#059669]' : 'bg-[#E11D48]'
                          }`}
                          style={{ height: bar.h }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Interactive Playback Toolbar */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBentoReplayCount((c) => Math.max(10, c - 1))}
                        className="px-2.5 py-1 text-xs font-mono font-black bg-white hover:bg-slate-100 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded cursor-pointer"
                      >
                        ◀ Step Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setBentoReplayCount((c) => c + 1)}
                        className="px-2.5 py-1 text-xs font-mono font-black bg-[#FEF08A] hover:bg-[#FDE047] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded cursor-pointer"
                      >
                        Step Forward ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => setBentoReplayCount((c) => c + 5)}
                        className="px-2.5 py-1 text-xs font-mono font-black bg-white hover:bg-slate-100 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded cursor-pointer"
                      >
                        +5 Bars
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBentoReplayCount(142)}
                      className="text-[10px] font-mono font-bold text-[#717182] hover:text-[#121212] underline cursor-pointer"
                    >
                      Reset Index
                    </button>
                  </div>
                </div>
              </div>

              <div className="font-mono text-[11px] text-[#717182] flex items-center justify-between">
                <span>LOOK-AHEAD BIAS: LOCKED</span>
                <span className="text-[#121212] font-black">SPREAD: 1.2 PIPS FIXED</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FLAGSHIP 1: AUTOMATED JOURNALING (Z-PATTERN: TEXT LEFT, MOCKUP RIGHT) ── */}
      <section id="mt5-bridge" className="py-20 sm:py-28 bg-[#FAF9F6] border-b-4 border-[#121212] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Text Column (50%) */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={sectionVariants}
              className="w-full lg:w-1/2 space-y-6"
            >
              <span className="text-xs font-mono font-black uppercase tracking-widest text-[#059669] bg-[#E7F9F0] border border-[#059669] px-2.5 py-1 rounded inline-block">
                [ 01 · AUTOMATED JOURNALING ]
              </span>
              <h3 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-[#121212] leading-[0.96]">
                Never Log Trades Manually Again.
              </h3>
              <p className="text-base sm:text-lg text-[#404040] font-medium leading-relaxed">
                Connect MetaTrader 5 to stream open positions, lot sizes, and PnL instantly. Track your real fills, commissions, and performance without ever touching a spreadsheet.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#059669] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Realtime MetaTrader Sync
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Instant ticket execution and live PnL updates sent directly to your journal with zero delay.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#059669] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Automatic Execution Tracking
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Captures entry fill, actual exit price, slippage, holding duration, and commission overhead without spreadsheets.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#059669] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Universal CSV/XLSX Broker Support
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Seamlessly ingest historical trade files from IC Markets, Pepperstone, FTMO, FundedNext, and any MT4/MT5 broker.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <MotionLink
                  to="/accounts"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="inline-flex items-center gap-2 px-7 py-4 bg-[#059669] hover:bg-[#047857] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded cursor-pointer"
                >
                  <span>Connect MT5 Broker</span>
                  <Wifi className="w-4 h-4" />
                </MotionLink>
              </div>
            </motion.div>

            {/* Visual Column (50%) - Split Pipeline Mockup */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={cardVariant}
              className="w-full lg:w-1/2"
            >
              <div className="w-full bg-white border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] rounded-2xl overflow-hidden select-none">
                {/* Header */}
                <div className="w-full bg-[#F4F4F0] border-b-2 border-[#121212] px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-[#DC2626] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#F59E0B] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#121212]" />
                    </div>
                    <span className="text-[11px] font-mono font-black px-2 py-0.5 bg-white border border-[#121212] rounded">
                      MT5 REAL-TIME BRIDGE
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-black px-2 py-0.5 bg-[#E7F9F0] text-[#059669] border border-[#059669] rounded flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-ping" />
                    MT5 LIVE SYNC
                  </span>
                </div>

                {/* Split Pipeline Visual Body */}
                <div className="p-4 sm:p-5 bg-slate-50 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Left Sub-card: MetaTrader 5 Terminal */}
                    <div className="bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded-lg p-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
                        <span className="text-[10px] font-mono font-black text-[#121212] uppercase">
                          MT5 CLIENT TERMINAL
                        </span>
                        <span className="text-[9px] font-mono text-[#059669] font-bold">● CONNECTED</span>
                      </div>
                      <div className="space-y-1.5 text-[10px] font-mono">
                        <div className="p-1.5 bg-[#FAF9F6] border border-[#121212] rounded flex justify-between items-center">
                          <div>
                            <span className="font-black text-[#121212] block">XAUUSD BUY 2.00L</span>
                            <span className="text-[9px] text-[#717182]">#982141 · @2654.50</span>
                          </div>
                          <span className="font-black text-[#059669]">+$820.00</span>
                        </div>
                        <div className="p-1.5 bg-[#FAF9F6] border border-[#121212] rounded flex justify-between items-center">
                          <div>
                            <span className="font-black text-[#121212] block">EURUSD SELL 1.50L</span>
                            <span className="text-[9px] text-[#717182]">#982142 · @1.0850</span>
                          </div>
                          <span className="font-black text-[#059669]">+$180.00</span>
                        </div>
                        <div className="p-1.5 bg-[#FAF9F6] border border-[#121212] rounded flex justify-between items-center">
                          <div>
                            <span className="font-black text-[#121212] block">GBPUSD BUY 1.00L</span>
                            <span className="text-[9px] text-[#717182]">#982143 · @1.2980</span>
                          </div>
                          <span className="font-black text-[#059669]">+$315.00</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Sub-card: KAFX Auto-Journal Table */}
                    <div className="bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded-lg p-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
                        <span className="text-[10px] font-mono font-black text-[#121212] uppercase">
                          KAFX TRADING JOURNAL
                        </span>
                        <span className="text-[9px] font-mono text-[#1040C0] font-bold">AUTO-LOGGED</span>
                      </div>
                      <div className="space-y-1.5 text-[10px] font-mono">
                        <div className="p-1.5 bg-[#F0FFF8] border border-[#059669] rounded flex justify-between items-center">
                          <div>
                            <span className="font-black text-[#121212] block">XAUUSD · +2.4R</span>
                            <span className="text-[9px] text-[#059669]">Zero manual typing</span>
                          </div>
                          <span className="text-[9px] font-bold bg-white px-1 border border-[#059669] rounded">TAGGED</span>
                        </div>
                        <div className="p-1.5 bg-[#F0FFF8] border border-[#059669] rounded flex justify-between items-center">
                          <div>
                            <span className="font-black text-[#121212] block">EURUSD · +1.2R</span>
                            <span className="text-[9px] text-[#717182]">Slippage: 0.1 Pip</span>
                          </div>
                          <span className="text-[9px] font-bold bg-white px-1 border border-[#059669] rounded">TAGGED</span>
                        </div>
                        <div className="p-1.5 bg-[#F0FFF8] border border-[#059669] rounded flex justify-between items-center">
                          <div>
                            <span className="font-black text-[#121212] block">GBPUSD · +1.5R</span>
                            <span className="text-[9px] text-[#717182]">MFE: +2.1R Tracked</span>
                          </div>
                          <span className="text-[9px] font-bold bg-white px-1 border border-[#059669] rounded">TAGGED</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Channel Broadcast Indicator */}
                  <div className="p-2 bg-[#EBF2FF] border border-[#1040C0] rounded flex items-center justify-between text-[9px] font-mono font-black text-[#1040C0]">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      REALTIME SYNC: MT5 &gt;&gt;&gt; KAFX JOURNAL
                    </span>
                    <span>100% IN SYNC</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-[#121212] text-white px-4 py-2 border-t-2 border-[#121212] flex items-center justify-between text-[10px] font-mono font-bold">
                  <span>3,842 HISTORICAL TRADES INGESTED</span>
                  <span className="text-[#34D399]">ZERO DUPLICATES · SECURE &amp; PRIVATE</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FLAGSHIP 2: REPLAY ENGINE (Z-PATTERN: MOCKUP LEFT, TEXT RIGHT) ── */}
      <section id="replay-engine" className="py-20 sm:py-28 bg-white border-b-4 border-[#121212] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-16">
            {/* Text Column (50%) */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={sectionVariants}
              className="w-full lg:w-1/2 space-y-6"
            >
              <span className="text-xs font-mono font-black uppercase tracking-widest text-[#1040C0] bg-[#EBF2FF] border border-[#1040C0] px-2.5 py-1 rounded inline-block">
                [ 02 · TICK-BY-TICK REPLAY ]
              </span>
              <h3 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-[#121212] leading-[0.96]">
                TRADINGVIEW-GRADE REPLAY SIMULATOR.
              </h3>
              <p className="text-base sm:text-lg text-[#404040] font-medium leading-relaxed">
                Step through historical price action candle-by-candle. Place visual orders and test your execution with zero look-ahead bias.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#121212] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Zero Look-Ahead Protection
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Future candlesticks and technical indicators stay completely hidden until you advance playback.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#121212] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Interactive Drag-to-Size Orders
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Drag Entry, Stop Loss, and Take Profit lines directly on the chart to auto-lock exact risk percentages.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#121212] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Granular Playback Speeds
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Step forward candle-by-candle or toggle variable playback speeds to test execution in realistic market pacing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <MotionLink
                  to="/backtest"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="inline-flex items-center gap-2 px-7 py-4 bg-[#121212] hover:bg-[#262626] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded cursor-pointer"
                >
                  <span>Launch Replay Session</span>
                  <ArrowRight className="w-4 h-4" />
                </MotionLink>
              </div>
            </motion.div>

            {/* Visual Column (50%) - Massive Mockup */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={cardVariant}
              className="w-full lg:w-1/2"
            >
              <div className="w-full bg-white border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] rounded-2xl overflow-hidden select-none">
                {/* Mockup Header */}
                <div className="w-full bg-[#F4F4F0] border-b-2 border-[#121212] px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-[#DC2626] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#F59E0B] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#121212]" />
                    </div>
                    <span className="text-[11px] font-mono font-black px-2 py-0.5 bg-white border border-[#121212] rounded">
                      EURUSD • M5 REPLAY
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-black px-2 py-0.5 bg-[#FEF08A] text-[#854D0E] border border-[#121212] rounded">
                    TICK REPLAY ACTIVE
                  </span>
                </div>

                {/* Mockup Chart Area */}
                <div className="h-72 sm:h-84 md:h-96 bg-white relative p-4 flex flex-col justify-between overflow-hidden">
                  {/* Grid lines */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-between py-6 px-4 opacity-25">
                    <div className="border-b border-dashed border-[#121212]" />
                    <div className="border-b border-dashed border-[#121212]" />
                    <div className="border-b border-dashed border-[#121212]" />
                    <div className="border-b border-dashed border-[#121212]" />
                    <div className="border-b border-dashed border-[#121212]" />
                  </div>

                  {/* Price Scale */}
                  <div className="absolute right-2 top-0 bottom-0 flex flex-col justify-between py-5 text-[9px] font-mono font-bold text-[#717182] pointer-events-none text-right">
                    <span className="text-[#059669] font-black">1.0865 TP</span>
                    <span>1.0855</span>
                    <span className="text-[#059669] font-black bg-[#E7F9F0] px-1 rounded border border-[#059669]">1.0850 BID</span>
                    <span className="text-[#1040C0] font-black">1.0835 FILL</span>
                    <span className="text-[#DC2626] font-black">1.0820 SL</span>
                  </div>

                  {/* Floating Draggable Order Pill */}
                  <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 p-1 bg-white border-2 border-[#121212] shadow-[3px_3px_0px_0px_#121212] rounded-lg">
                    <div className="p-1 text-[#717182]">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <span className="px-2 py-1 bg-[#059669] text-white font-mono font-black text-[10px] rounded border border-[#121212]">
                      BUY LIMIT
                    </span>
                    <span className="px-2 py-1 bg-[#DC2626] text-white font-mono font-black text-[10px] rounded border border-[#121212]">
                      SELL LIMIT
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#121212] px-1.5">2.50 Lots</span>
                  </div>

                  {/* Order Line: Take Profit */}
                  <div className="absolute top-[22%] left-4 right-18 border-b-2 border-dashed border-emerald-500 z-10 pointer-events-none flex items-center">
                    <span className="text-[9px] font-mono font-black text-emerald-700 bg-white px-1.5 py-0.5 border border-emerald-500 rounded -translate-y-1/2 shadow-[1px_1px_0px_0px_#121212]">
                      TP: 1.0865 (+30 Pips)
                    </span>
                  </div>

                  {/* Shaded Profit Zone */}
                  <div className="absolute top-[22%] left-4 right-18 h-[36%] bg-[#059669]/10 border-l-2 border-[#059669] pointer-events-none rounded-r" />

                  {/* Order Line: Entry Fill */}
                  <div className="absolute top-[58%] left-4 right-18 border-b-2 border-[#1040C0] z-10 pointer-events-none flex items-center">
                    <span className="text-[9px] font-mono font-black text-[#1040C0] bg-white px-1.5 py-0.5 border border-[#1040C0] rounded -translate-y-1/2 shadow-[1px_1px_0px_0px_#121212]">
                      FILL: 1.0835 (2.50 Lots)
                    </span>
                  </div>

                  {/* Shaded Risk Zone */}
                  <div className="absolute top-[58%] left-4 right-18 h-[22%] bg-[#DC2626]/10 border-l-2 border-[#DC2626] pointer-events-none rounded-r" />

                  {/* Order Line: Stop Loss */}
                  <div className="absolute top-[80%] left-4 right-18 border-b-2 border-dashed border-red-500 z-10 pointer-events-none flex items-center">
                    <span className="text-[9px] font-mono font-black text-red-700 bg-white px-1.5 py-0.5 border border-red-500 rounded -translate-y-1/2 shadow-[1px_1px_0px_0px_#121212]">
                      SL: 1.0820 (-15 Pips)
                    </span>
                  </div>

                  {/* Candlesticks visual */}
                  <div className="relative z-10 w-full h-full flex items-end justify-around px-8 pr-20 pb-4">
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-4 bg-[#DC2626]" /><div className="w-3.5 h-16 bg-[#DC2626] border border-[#121212]" /><div className="w-[1.5px] h-3 bg-[#DC2626]" /></div>
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-3 bg-[#DC2626]" /><div className="w-3.5 h-12 bg-[#DC2626] border border-[#121212]" /><div className="w-[1.5px] h-10 bg-[#DC2626]" /></div>
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-2 bg-[#059669]" /><div className="w-3.5 h-10 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-12 bg-[#059669]" /></div>
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-4 bg-[#059669]" /><div className="w-3.5 h-20 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-2 bg-[#059669]" /></div>
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-3 bg-[#DC2626]" /><div className="w-3.5 h-8 bg-[#DC2626] border border-[#121212]" /><div className="w-[1.5px] h-4 bg-[#DC2626]" /></div>
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-4 bg-[#059669]" /><div className="w-3.5 h-26 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-2 bg-[#059669]" /></div>
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-5 bg-[#059669]" /><div className="w-3.5 h-24 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-3 bg-[#059669]" /></div>
                    <div className="flex flex-col items-center"><div className="w-[1.5px] h-4 bg-[#059669]" /><div className="w-3.5 h-32 bg-[#059669] border border-[#121212]" /><div className="w-[1.5px] h-2 bg-[#059669]" /></div>
                    <div className="flex flex-col items-center relative"><span className="w-2 h-2 rounded-full bg-[#059669] animate-ping absolute -top-3" /><div className="w-[2px] h-5 bg-[#059669]" /><div className="w-4 h-22 bg-[#059669] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]" /><div className="w-[2px] h-2 bg-[#059669]" /></div>
                  </div>
                </div>

                {/* Replay Playback Transport Footer */}
                <div className="bg-[#FAF9F6] border-t-2 border-[#121212] p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono font-black">
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer">
                      ⏮ 10
                    </button>
                    <button type="button" className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer">
                      ◀ STEP
                    </button>
                    <button type="button" className="px-3.5 py-1 bg-[#121212] text-white hover:bg-[#262626] border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer flex items-center gap-1">
                      <Play className="w-3 h-3 fill-white" /> PLAY
                    </button>
                    <button type="button" className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer">
                      STEP ▶
                    </button>
                    <button type="button" className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212] cursor-pointer">
                      10 ⏭
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {['0.5X', '1X', '3X', '10X'].map((spd) => (
                      <span
                        key={spd}
                        className={`px-2 py-0.5 text-[10px] rounded border ${
                          spd === '1X'
                            ? 'bg-[#121212] text-white border-[#121212]'
                            : 'bg-white text-[#717182] border-slate-300'
                        }`}
                      >
                        {spd}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FLAGSHIP 3: PROP CHALLENGE SIMULATOR (Z-PATTERN: TEXT LEFT, MOCKUP RIGHT) ── */}
      <section id="prop-simulator" className="py-20 sm:py-28 bg-[#FAF9F6] border-b-4 border-[#121212] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Text Column (50%) */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={sectionVariants}
              className="w-full lg:w-1/2 space-y-6"
            >
              <span className="text-xs font-mono font-black uppercase tracking-widest text-[#DC2626] bg-[#FFF0F0] border border-[#DC2626] px-2.5 py-1 rounded inline-block">
                [ 03 · PROP CHALLENGE SIMULATOR ]
              </span>
              <h3 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-[#121212] leading-[0.96]">
                Pass Evaluations Before Paying Fees.
              </h3>
              <p className="text-base sm:text-lg text-[#404040] font-medium leading-relaxed">
                Stress-test your strategy against strict trailing drawdowns and daily loss limits for FTMO and other firms.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#DC2626] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Pre-Loaded Funded Firm Presets
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Instant 1-click rulesets for FTMO, FundedNext, The5ers, and custom drawdown parameters.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#DC2626] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Trailing High-Water Equity Tracking
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Monitor intraday floating drawdown in real time to prevent rule breaches before they happen.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#DC2626] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Comprehensive Evaluation Audit
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Identify high-risk periods and verify whether your trading style qualifies for funded payouts.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <MotionLink
                  to="/prop-sim"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="inline-flex items-center gap-2 px-7 py-4 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded cursor-pointer"
                >
                  <span>Launch Prop Simulator</span>
                  <ArrowRight className="w-4 h-4" />
                </MotionLink>
              </div>
            </motion.div>

            {/* Visual Column (50%) - Prop Challenge Audit Card */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={cardVariant}
              className="w-full lg:w-1/2"
            >
              <div className="w-full bg-white border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] rounded-2xl overflow-hidden select-none">
                {/* Header */}
                <div className="w-full bg-[#F4F4F0] border-b-2 border-[#121212] px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-[#DC2626] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#F59E0B] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#121212]" />
                    </div>
                    <span className="text-[11px] font-mono font-black px-2 py-0.5 bg-white border border-[#121212] rounded">
                      PROP EVALUATION AUDIT
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-black px-2 py-0.5 bg-[#FFF0F0] text-[#DC2626] border border-[#DC2626] rounded">
                    FTMO $100K RULES APPLIED
                  </span>
                </div>

                {/* Audit Body */}
                <div className="p-4 sm:p-5 bg-slate-50 space-y-4">
                  {/* Status Banner */}
                  <div className="p-3 bg-[#E7F9F0] border-2 border-[#059669] rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-[#059669] font-bold block uppercase tracking-wider">
                        EVALUATION RESULT
                      </span>
                      <span className="text-sm font-mono font-black text-[#059669]">
                        PASSED: ALL RULES COMPLIED
                      </span>
                    </div>
                    <div className="px-3 py-1 bg-[#059669] text-white font-mono font-black text-xs rounded border border-[#121212] shadow-[2px_2px_0px_0px_#121212] -rotate-2">
                      PASS STAMP
                    </div>
                  </div>

                  {/* 3 Core Gauges */}
                  <div className="space-y-2.5">
                    {/* Gauge 1: Trailing Drawdown Buffer */}
                    <div className="p-2.5 bg-[#FAF9F6] border border-[#121212] rounded-lg">
                      <div className="flex justify-between items-center text-[10px] font-mono font-black mb-1">
                        <span className="text-[#717182] uppercase">MAX TRAILING DRAWDOWN (10%)</span>
                        <span className="text-[#121212]">3.2% DD / $6,800 Buffer Remaining</span>
                      </div>
                      <div className="w-full h-3 bg-white border border-[#121212] rounded flex overflow-hidden">
                        <div className="h-full bg-[#059669] w-[68%]" />
                        <div className="h-full bg-[#DC2626] w-[32%]" />
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-[#059669] font-bold mt-1">
                        <span>Safe: 68% Intact Buffer</span>
                        <span>Hard Limit: $10,000</span>
                      </div>
                    </div>

                    {/* Gauge 2: Daily Loss Limit */}
                    <div className="p-2.5 bg-[#FAF9F6] border border-[#121212] rounded-lg">
                      <div className="flex justify-between items-center text-[10px] font-mono font-black mb-1">
                        <span className="text-[#717182] uppercase">WORST DAILY LOSS (5%)</span>
                        <span className="text-[#059669]">1.1% ($1,100) / $3,900 Buffer</span>
                      </div>
                      <div className="w-full h-3 bg-white border border-[#121212] rounded overflow-hidden">
                        <div className="h-full bg-[#059669] w-[78%]" />
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-[#717182] font-bold mt-1">
                        <span className="text-[#059669]">No Violation Recorded</span>
                        <span>Daily Limit: $5,000</span>
                      </div>
                    </div>

                    {/* Gauge 3: Profit Target */}
                    <div className="p-2.5 bg-[#FAF9F6] border border-[#121212] rounded-lg">
                      <div className="flex justify-between items-center text-[10px] font-mono font-black mb-1">
                        <span className="text-[#717182] uppercase">PROFIT TARGET ACHIEVED (10%)</span>
                        <span className="text-[#059669]">+$10,480.00 (+10.48%)</span>
                      </div>
                      <div className="w-full h-3 bg-white border border-[#121212] rounded overflow-hidden">
                        <div className="h-full bg-[#059669] w-full" />
                      </div>
                    </div>
                  </div>

                  {/* Compliance Checklist */}
                  <div className="p-2.5 bg-white border border-[#121212] rounded-lg text-[10px] font-mono font-bold space-y-1">
                    <div className="flex justify-between">
                      <span>Minimum Trading Days: 5 / 4 Days</span>
                      <span className="text-[#059669] font-black">✓ PASSED</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Single Trade Profit: 28% (&lt; 50% Rule)</span>
                      <span className="text-[#059669] font-black">✓ PASSED</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Weekend Holding Permitted</span>
                      <span className="text-[#059669] font-black">✓ COMPLIANT</span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-[#121212] text-white px-4 py-2 border-t-2 border-[#121212] flex items-center justify-between text-[10px] font-mono font-bold">
                  <span>AUDIT ID: FTMO-CERT-9941</span>
                  <span className="text-[#FEF08A]">READY FOR REAL CAPITAL ALLOCATION</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FLAGSHIP 4: EA SIGNAL FIREWALL (Z-PATTERN: MOCKUP LEFT, TEXT RIGHT) ── */}
      <section id="ea-control" className="py-20 sm:py-28 bg-white border-b-4 border-[#121212] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-16">
            {/* Text Column (50%) */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={sectionVariants}
              className="w-full lg:w-1/2 space-y-6"
            >
              <span className="text-xs font-mono font-black uppercase tracking-widest text-[#7C3AED] bg-[#F5F3FF] border border-[#7C3AED] px-2.5 py-1 rounded inline-block">
                [ 04 · EA SIGNAL FIREWALL ]
              </span>
              <h3 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-[#121212] leading-[0.96]">
                Supervise Your Automated Bots.
              </h3>
              <p className="text-base sm:text-lg text-[#404040] font-medium leading-relaxed">
                Review incoming signals from MT5 Expert Advisors and manually approve or reject execution before hitting the live market.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#7C3AED] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Human-in-the-Loop Gateway
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Filter automated signals from external MT5 EAs, webhooks, and custom algorithmic scripts.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#7C3AED] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      Instant Rule Validation
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Reject orders that violate account risk limits, excessive lot sizing, or news-event blackouts before submission.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 bg-[#7C3AED] text-white flex items-center justify-center font-mono font-black text-xs rounded border border-[#121212] shrink-0 mt-0.5 shadow-[1px_1px_0px_0px_#121212]">
                    ✓
                  </div>
                  <div>
                    <strong className="font-mono font-black text-sm text-[#121212] block">
                      One-Click Approval or Rejection
                    </strong>
                    <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mt-0.5">
                      Interactive confirmation panel with clear Risk/Reward calculation before firing to the broker.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3">
                <MotionLink
                  to="/ea-control"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="inline-flex items-center gap-2 px-7 py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded cursor-pointer"
                >
                  <span>Open Signal Firewall</span>
                  <Shield className="w-4 h-4" />
                </MotionLink>
              </div>
            </motion.div>

            {/* Visual Column (50%) - Signal Interception Mockup */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={cardVariant}
              className="w-full lg:w-1/2"
            >
              <div className="w-full bg-white border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] rounded-2xl overflow-hidden select-none">
                {/* Mockup Header */}
                <div className="w-full bg-[#F4F4F0] border-b-2 border-[#121212] px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-[#DC2626] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#F59E0B] border border-[#121212]" />
                      <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#121212]" />
                    </div>
                    <span className="text-[11px] font-mono font-black px-2 py-0.5 bg-white border border-[#121212] rounded">
                      EA FIREWALL GATEWAY
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-black px-2 py-0.5 bg-[#F5F3FF] text-[#7C3AED] border border-[#7C3AED] rounded flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    GATEWAY ACTIVE
                  </span>
                </div>

                {/* Firewall Card Body */}
                <div className="p-4 sm:p-5 bg-slate-50 space-y-3">
                  {/* Incoming Signal Panel */}
                  <div className="bg-white border-2 border-[#121212] rounded-xl p-3.5 shadow-[2px_2px_0px_0px_#121212]">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        <span className="text-[11px] font-mono font-black text-[#121212] uppercase">
                          SIGNAL #7419: ScalperPro EA v4.2
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-0.5 bg-[#FEF08A] text-[#854D0E] font-black border border-[#854D0E] rounded">
                        HOLD FOR AUDIT
                      </span>
                    </div>

                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between items-center p-2 bg-[#FAF9F6] border border-[#121212] rounded">
                        <span className="font-bold text-[#717182]">ORDER ACTION:</span>
                        <span className="font-black text-[#059669] bg-[#E7F9F0] px-2 py-0.5 rounded border border-[#059669]">
                          BUY 1.50 LOTS XAUUSD
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2 bg-white border border-[#121212] rounded">
                          <span className="text-[#717182] block">ENTRY / SL / TP</span>
                          <strong className="text-[#121212] block">2654.20 / 2649.20</strong>
                          <span className="text-[#059669] font-bold">TP: 2664.20 (1:2 R:R)</span>
                        </div>
                        <div className="p-2 bg-white border border-[#121212] rounded">
                          <span className="text-[#717182] block">RISK CAPITAL</span>
                          <strong className="text-[#DC2626] block">-$750.00 (0.75%)</strong>
                          <span className="text-[#059669] font-bold">Daily Limit Intact</span>
                        </div>
                      </div>

                      <div className="p-2 bg-[#F0FFF8] border border-[#059669] rounded flex items-center justify-between text-[10px]">
                        <span className="text-[#059669] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Risk Rules &amp; News Filters Passed
                        </span>
                        <span className="font-mono text-[9px] text-[#717182]">Latency: 0.8ms</span>
                      </div>
                    </div>

                    {/* Interactive Fire Control */}
                    <div className="mt-3 pt-2.5 border-t border-slate-200">
                      {botDecision === 'idle' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setBotDecision('rejected')}
                            className="flex-1 py-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-mono font-black text-xs uppercase tracking-wider rounded border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] cursor-pointer"
                          >
                            Reject Signal
                          </button>
                          <button
                            type="button"
                            onClick={() => setBotDecision('executed')}
                            className="flex-1 py-2 bg-[#059669] hover:bg-[#047857] text-white font-mono font-black text-xs uppercase tracking-wider rounded border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] cursor-pointer"
                          >
                            Approve &amp; Fire
                          </button>
                        </div>
                      )}
                      {botDecision === 'executed' && (
                        <div className="p-2 bg-[#E7F9F0] border-2 border-[#059669] rounded flex items-center justify-between text-xs font-mono font-black text-[#059669]">
                          <span className="flex items-center gap-1.5">
                            <Check className="w-4 h-4" />
                            ORDER SENT TO BROKER (TICKET #108492)
                          </span>
                          <button
                            type="button"
                            onClick={() => setBotDecision('idle')}
                            className="text-[10px] text-[#717182] underline cursor-pointer font-normal"
                          >
                            Reset
                          </button>
                        </div>
                      )}
                      {botDecision === 'rejected' && (
                        <div className="p-2 bg-[#FFF0F0] border-2 border-[#DC2626] rounded flex items-center justify-between text-xs font-mono font-black text-[#DC2626]">
                          <span className="flex items-center gap-1.5">
                            <X className="w-4 h-4" />
                            SIGNAL REJECTED AND LOGGED TO AUDIT
                          </span>
                          <button
                            type="button"
                            onClick={() => setBotDecision('idle')}
                            className="text-[10px] text-[#717182] underline cursor-pointer font-normal"
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="bg-[#121212] text-white px-4 py-2 border-t-2 border-[#121212] flex items-center justify-between text-[10px] font-mono font-bold">
                  <span>AIR-GAPPED SUPERVISORY GATEWAY</span>
                  <span className="text-[#A78BFA]">NO UNMONITORED TRADES REACH THE BROKER</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 5. THE EXTENDED ARSENAL (MONTE CARLO & MULTI-ACCOUNT RECAP) ── */}
      <section id="quant-arsenal" className="py-20 sm:py-28 bg-[#FAF9F6] border-b-4 border-[#121212]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={sectionVariants}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <span className="text-xs font-mono font-black uppercase tracking-widest text-[#1040C0] bg-[#EBF2FF] border border-[#1040C0] px-2.5 py-1 rounded inline-block mb-3 shadow-[2px_2px_0px_0px_#1040C0]">
              [ COMPREHENSIVE QUANT ARSENAL ]
            </span>
            <h3 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-[#121212] leading-[0.98]">
              Mathematical Rigor Meets Consolidated Portfolio Control.
            </h3>
            <p className="mt-4 text-base sm:text-lg text-[#404040] font-medium leading-relaxed max-w-2xl mx-auto">
              Replace subjective optimism with computational certainty. Stress-test trade sequence risks across 10,000 Monte Carlo runs and consolidate multi-broker accounts in one unified terminal.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            {/* Card 1: Monte Carlo Risk Lab */}
            <motion.div
              variants={cardVariant}
              whileHover={{ y: -3 }}
              transition={{ duration: 0.1 }}
              className="p-6 sm:p-8 bg-white border-4 border-[#121212] rounded-2xl shadow-[10px_10px_0px_0px_#121212] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-[#EBF2FF] border-2 border-[#121212] rounded-xl shadow-[3px_3px_0px_0px_#121212] flex items-center justify-center">
                    <Dices className="w-6 h-6 text-[#1040C0]" />
                  </div>
                  <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 bg-[#EBF2FF] text-[#1040C0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded">
                    [ 10,000 PERMUTATIONS ]
                  </span>
                </div>
                <div className="text-xs font-mono font-black text-[#1040C0] uppercase tracking-wider mb-1">
                  MONTE CARLO RISK LAB
                </div>
                <h4 className="font-black text-2xl sm:text-3xl text-[#121212] uppercase tracking-tight mb-3">
                  Know Your Real Mathematical Risk Of Ruin.
                </h4>
                <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mb-6">
                  A 65% win rate strategy can still blow up your account if consecutive losses strike early. Run 10,000 randomized trade sequence permutations to prove your maximum historical drawdown probability, longest losing streak, and capital survival rate.
                </p>

                {/* Simulation Curves Mockup */}
                <div className="bg-[#FAF9F6] border-2 border-[#121212] rounded-xl p-4 shadow-[4px_4px_0px_0px_#121212] space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#121212]/15 text-[10px] font-mono font-black">
                    <span className="text-[#121212] uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#1040C0] animate-pulse" />
                      10,000 EQUITY CURVE RUNS
                    </span>
                    <span className="px-2 py-0.5 bg-[#E7F9F0] text-[#059669] border border-[#059669] rounded font-bold">
                      RUIN RISK: 0.12% [SAFE]
                    </span>
                  </div>

                  {/* SVG Simulation Fan Curve */}
                  <div className="w-full h-36 bg-white border border-[#121212] rounded-lg p-2 relative overflow-hidden flex items-center justify-center">
                    <svg viewBox="0 0 400 140" className="w-full h-full" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      <line x1="0" y1="35" x2="400" y2="35" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="0" y1="70" x2="400" y2="70" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="2 2" />
                      <line x1="0" y1="105" x2="400" y2="105" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />

                      {/* Background Faint Permutations */}
                      <path d="M 0 70 Q 100 65, 200 50 T 400 20" fill="none" stroke="#E0E7FF" strokeWidth="1.5" />
                      <path d="M 0 70 Q 90 75, 180 60 T 400 30" fill="none" stroke="#E0E7FF" strokeWidth="1.5" />
                      <path d="M 0 70 Q 110 80, 210 65 T 400 45" fill="none" stroke="#E0E7FF" strokeWidth="1.5" />
                      <path d="M 0 70 Q 80 60, 190 70 T 400 55" fill="none" stroke="#E0E7FF" strokeWidth="1.5" />
                      <path d="M 0 70 Q 120 75, 220 85 T 400 80" fill="none" stroke="#FEE2E2" strokeWidth="1.5" />
                      <path d="M 0 70 Q 70 85, 170 95 T 400 110" fill="none" stroke="#FEE2E2" strokeWidth="1.5" />

                      {/* 95th Percentile Line (Top Green) */}
                      <path
                        d="M 0 70 C 80 55, 160 30, 260 22 S 350 15, 400 12"
                        fill="none"
                        stroke="#059669"
                        strokeWidth="2.5"
                      />

                      {/* 50th Percentile Median (Solid Blue) */}
                      <path
                        d="M 0 70 C 90 68, 170 52, 270 42 S 360 36, 400 32"
                        fill="none"
                        stroke="#1040C0"
                        strokeWidth="3.5"
                      />

                      {/* 5th Percentile Line (Bottom Red) */}
                      <path
                        d="M 0 70 C 80 88, 160 102, 250 96 S 340 92, 400 88"
                        fill="none"
                        stroke="#DC2626"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                    </svg>

                    {/* Chart Labels */}
                    <div className="absolute top-2 right-2 text-[9px] font-mono font-black text-[#059669] bg-white/90 px-1.5 py-0.5 border border-[#059669] rounded">
                      P95: +34.8%
                    </div>
                    <div className="absolute top-1/2 -translate-y-4 right-2 text-[9px] font-mono font-black text-[#1040C0] bg-white/90 px-1.5 py-0.5 border border-[#1040C0] rounded">
                      MEDIAN: +19.4%
                    </div>
                    <div className="absolute bottom-2 right-2 text-[9px] font-mono font-black text-[#DC2626] bg-white/90 px-1.5 py-0.5 border border-[#DC2626] rounded">
                      P05: +1.8%
                    </div>
                  </div>

                  {/* Quant Stat Grid */}
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono pt-1">
                    <div className="p-2 bg-white border border-[#121212] rounded">
                      <span className="text-[#717182] block text-[9px]">MAX STREAK</span>
                      <strong className="text-[#121212] font-black">5 Losses</strong>
                    </div>
                    <div className="p-2 bg-white border border-[#121212] rounded">
                      <span className="text-[#717182] block text-[9px]">WORST DD</span>
                      <strong className="text-[#DC2626] font-black">-6.40%</strong>
                    </div>
                    <div className="p-2 bg-white border border-[#121212] rounded">
                      <span className="text-[#717182] block text-[9px]">CONFIDENCE</span>
                      <strong className="text-[#059669] font-black">99.88%</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t-2 border-[#121212]/10 flex items-center justify-between">
                <MotionLink
                  to="/monte-carlo"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="w-full py-3 bg-[#121212] text-white hover:bg-[#262626] font-mono font-black text-xs uppercase tracking-wider rounded border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Launch Monte Carlo Simulator</span>
                  <ChevronRight className="w-4 h-4" />
                </MotionLink>
              </div>
            </motion.div>

            {/* Card 2: Portfolio Command */}
            <motion.div
              variants={cardVariant}
              whileHover={{ y: -3 }}
              transition={{ duration: 0.1 }}
              className="p-6 sm:p-8 bg-white border-4 border-[#121212] rounded-2xl shadow-[10px_10px_0px_0px_#121212] flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-[#FFFBEB] border-2 border-[#121212] rounded-xl shadow-[3px_3px_0px_0px_#121212] flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-[#D97706]" />
                  </div>
                  <span className="text-[10px] font-mono font-black uppercase px-2.5 py-1 bg-[#FFFBEB] text-[#D97706] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] rounded">
                    [ MULTI-BROKER ]
                  </span>
                </div>
                <div className="text-xs font-mono font-black text-[#D97706] uppercase tracking-wider mb-1">
                  PORTFOLIO COMMAND
                </div>
                <h4 className="font-black text-2xl sm:text-3xl text-[#121212] uppercase tracking-tight mb-3">
                  Unified Capital &amp; Print-Ready PDF Reports.
                </h4>
                <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed mb-6">
                  Manage Real, Demo, Prop Firm, and Cent accounts in one single view. Monitor aggregated capital exposure, compare session performances side-by-side, and generate print-ready PDF reports for tax, investor, and personal performance reviews.
                </p>

                {/* Multi-Broker Mockup Container */}
                <div className="bg-[#FAF9F6] border-2 border-[#121212] rounded-xl p-4 shadow-[4px_4px_0px_0px_#121212] space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-[#121212]/15 text-[10px] font-mono font-black">
                    <span className="text-[#121212] uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
                      CONSOLIDATED: $188,380.00
                    </span>
                    <span className="text-[#717182]">4 ACCOUNTS ACTIVE</span>
                  </div>

                  {/* Account List */}
                  <div className="space-y-2 font-mono text-[10px]">
                    {/* Row 1 */}
                    <div className="p-2.5 bg-white border border-[#121212] rounded flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-[#121212] font-black text-[11px]">FTMO $100K Challenge</strong>
                          <span className="px-1.5 py-0.2 bg-[#E7F9F0] text-[#059669] border border-[#059669] rounded text-[8px] font-bold">
                            PHASE 1
                          </span>
                        </div>
                        <span className="text-[#717182] text-[9px]">$3,580 to Target · 0 Violations</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#059669] block">+$6,420.00</span>
                        <span className="text-[9px] text-[#059669] font-bold">+6.42%</span>
                      </div>
                    </div>

                    {/* Row 2 */}
                    <div className="p-2.5 bg-white border border-[#121212] rounded flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-[#121212] font-black text-[11px]">IC Markets Raw Spread</strong>
                          <span className="px-1.5 py-0.2 bg-[#EBF2FF] text-[#1040C0] border border-[#1040C0] rounded text-[8px] font-bold">
                            LIVE PERSONAL
                          </span>
                        </div>
                        <span className="text-[#717182] text-[9px]">Equity: $24,850.00 · 0.8% Risk</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#059669] block">+$3,480.00</span>
                        <span className="text-[9px] text-[#059669] font-bold">+16.28%</span>
                      </div>
                    </div>

                    {/* Row 3 */}
                    <div className="p-2.5 bg-white border border-[#121212] rounded flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-[#121212] font-black text-[11px]">The5ers $60K High Stakes</strong>
                          <span className="px-1.5 py-0.2 bg-[#FEF08A] text-[#854D0E] border border-[#854D0E] rounded text-[8px] font-bold">
                            PHASE 2
                          </span>
                        </div>
                        <span className="text-[#717182] text-[9px]">Target Hit · Next Payout 4d</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#059669] block">+$3,100.00</span>
                        <span className="text-[9px] text-[#059669] font-bold">+5.16%</span>
                      </div>
                    </div>

                    {/* Row 4 */}
                    <div className="p-2.5 bg-white border border-[#121212] rounded flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-[#121212] font-black text-[11px]">Exness Cent Staging</strong>
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 border border-slate-400 rounded text-[8px] font-bold">
                            BOT CANARY
                          </span>
                        </div>
                        <span className="text-[#717182] text-[9px]">GridHunter v4 Live Test</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#121212] block">$4,010.00</span>
                        <span className="text-[9px] text-[#059669] font-bold">+2.4%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t-2 border-[#121212]/10 flex flex-col sm:flex-row items-center gap-3">
                <MotionLink
                  to="/mt5-report"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="w-full sm:flex-1 py-3 bg-[#D97706] hover:bg-[#B45309] text-white font-mono font-black text-xs uppercase tracking-wider rounded border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Export Audit PDF</span>
                </MotionLink>
                <MotionLink
                  to="/accounts"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-slate-100 text-[#121212] font-mono font-black text-xs uppercase tracking-wider rounded border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Accounts Hub</span>
                  <ChevronRight className="w-4 h-4" />
                </MotionLink>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 5. DEEP DIVE ANALYTICS (THE RESULTS) ── */}
      <section id="analytics" className="py-20 sm:py-28 bg-[#FAFAFA] border-b-2 border-[#121212]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Copy Column */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={sectionVariants}
              className="lg:col-span-6 space-y-6"
            >
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#DC2626] block">
                [ POST-TRADE FORENSICS ]
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#121212] uppercase leading-tight">
                Deep Analytics That Tell You Exactly Where You Make And Lose Money.
              </h2>
              <p className="text-base sm:text-lg text-[#404040] font-medium leading-relaxed">
                Raw PnL screenshots lie. Win Rate and Profit Factor are only the beginning. Discover whether you exit winners prematurely, let losers run too close to liquidation, or overtrade during low-expectancy sessions.
              </p>

              <div className="space-y-3.5 pt-2">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-[#121212] text-white flex items-center justify-center font-mono font-bold text-xs mt-0.5 rounded">
                    ✓
                  </div>
                  <p className="text-sm font-mono text-[#333333]">
                    <strong className="text-[#121212]">Maximum Excursion (MFE / MAE):</strong> Prove whether you leave significant profit on the table or absorb excessive heat on losing positions.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-[#121212] text-white flex items-center justify-center font-mono font-bold text-xs mt-0.5 rounded">
                    ✓
                  </div>
                  <p className="text-sm font-mono text-[#333333]">
                    <strong className="text-[#121212]">Hypothetical R:R Simulation Matrix:</strong> Re-simulate your entire trade history across 0.25R to 10.0R targets to find your system's mathematical sweet spot.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-[#121212] text-white flex items-center justify-center font-mono font-bold text-xs mt-0.5 rounded">
                    ✓
                  </div>
                  <p className="text-sm font-mono text-[#333333]">
                    <strong className="text-[#121212]">Session &amp; Time Filters:</strong> Isolate London Open, NY Session, and Asia Range to identify and scale your most lucrative hours.
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <MotionLink
                  to="/dashboard"
                  whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
                  whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
                  transition={{ duration: 0.08, ease: 'easeOut' }}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#121212] hover:bg-[#262626] text-white font-mono font-black text-xs uppercase tracking-wider border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded cursor-pointer"
                >
                  <span>Explore Analytics Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </MotionLink>
              </div>
            </motion.div>

            {/* Right Metric Grid Mockup */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={cardVariant}
              className="lg:col-span-6"
            >
              <div className="bg-white border-2 border-[#121212] shadow-[8px_8px_0px_0px_#121212] rounded-xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b-2 border-[#121212]">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#1040C0]" />
                    <span className="font-mono font-black text-xs uppercase text-[#121212]">
                      PORTFOLIO AUDIT · VERIFIED EXECUTION
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-[#E7F9F0] text-[#059669] border border-[#059669] rounded">
                    LIVE JOURNAL DATA
                  </span>
                </div>

                {/* 4 Core Metric Tiles */}
                <div className="grid grid-cols-2 gap-3.5">
                  <motion.div
                    whileHover={{ x: 2, y: 2, boxShadow: '1px 1px 0px 0px #121212' }}
                    whileTap={{ x: 3, y: 3, boxShadow: '0px 0px 0px 0px #121212' }}
                    className="p-3.5 bg-slate-50 border-2 border-[#121212] rounded-lg shadow-[3px_3px_0px_0px_#121212] cursor-pointer"
                  >
                    <span className="text-[10px] font-mono font-black uppercase text-[#717182] block">
                      NET PROFIT
                    </span>
                    <span className="text-xl sm:text-2xl font-mono font-black text-[#059669] mt-0.5 block">
                      +$14,850.00
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#059669]">
                      +48.20% Account Growth
                    </span>
                  </motion.div>

                  <motion.div
                    whileHover={{ x: 2, y: 2, boxShadow: '1px 1px 0px 0px #121212' }}
                    whileTap={{ x: 3, y: 3, boxShadow: '0px 0px 0px 0px #121212' }}
                    className="p-3.5 bg-slate-50 border-2 border-[#121212] rounded-lg shadow-[3px_3px_0px_0px_#121212] cursor-pointer"
                  >
                    <span className="text-[10px] font-mono font-black uppercase text-[#717182] block">
                      WIN RATE
                    </span>
                    <span className="text-xl sm:text-2xl font-mono font-black text-[#121212] mt-0.5 block">
                      68.4%
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#717182]">
                      39 Wins / 18 Losses
                    </span>
                  </motion.div>

                  <motion.div
                    whileHover={{ x: 2, y: 2, boxShadow: '1px 1px 0px 0px #121212' }}
                    whileTap={{ x: 3, y: 3, boxShadow: '0px 0px 0px 0px #121212' }}
                    className="p-3.5 bg-slate-50 border-2 border-[#121212] rounded-lg shadow-[3px_3px_0px_0px_#121212] cursor-pointer"
                  >
                    <span className="text-[10px] font-mono font-black uppercase text-[#717182] block">
                      PROFIT FACTOR
                    </span>
                    <span className="text-xl sm:text-2xl font-mono font-black text-[#1040C0] mt-0.5 block">
                      2.84
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#1040C0]">
                      High Expectancy Model
                    </span>
                  </motion.div>

                  <motion.div
                    whileHover={{ x: 2, y: 2, boxShadow: '1px 1px 0px 0px #121212' }}
                    whileTap={{ x: 3, y: 3, boxShadow: '0px 0px 0px 0px #121212' }}
                    className="p-3.5 bg-slate-50 border-2 border-[#121212] rounded-lg shadow-[3px_3px_0px_0px_#121212] cursor-pointer"
                  >
                    <span className="text-[10px] font-mono font-black uppercase text-[#717182] block">
                      MAX DRAWDOWN
                    </span>
                    <span className="text-xl sm:text-2xl font-mono font-black text-[#DC2626] mt-0.5 block">
                      3.20%
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#DC2626]">
                      Peak Drawdown -$380.00
                    </span>
                  </motion.div>
                </div>

                {/* Mini Trade Log */}
                <div className="border-2 border-[#121212] rounded-lg overflow-hidden bg-white">
                  <div className="bg-[#F4F4F0] px-3 py-1.5 border-b border-[#121212] flex items-center justify-between text-[10px] font-mono font-black uppercase">
                    <span>Recent Execution Log</span>
                    <span className="text-[#717182]">Excursion Result</span>
                  </div>
                  <div className="divide-y divide-slate-200 text-xs font-mono">
                    <motion.div
                      whileHover={{ backgroundColor: '#F8FAFC' }}
                      className="px-3 py-2 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#059669]">BUY</span>
                        <span className="font-medium text-[#121212]">XAUUSD · 0.50L</span>
                        <span className="text-[10px] text-[#717182]">RR 1:2.8 (MFE 3.2R)</span>
                      </div>
                      <span className="font-black text-[#059669]">+$350.00</span>
                    </motion.div>
                    <motion.div
                      whileHover={{ backgroundColor: '#F8FAFC' }}
                      className="px-3 py-2 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#DC2626]">SELL</span>
                        <span className="font-medium text-[#121212]">XAUUSD · 0.50L</span>
                        <span className="text-[10px] text-[#717182]">RR 1:2.0 (SL Hit)</span>
                      </div>
                      <span className="font-black text-[#DC2626]">-$100.00</span>
                    </motion.div>
                    <motion.div
                      whileHover={{ backgroundColor: '#F8FAFC' }}
                      className="px-3 py-2 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#059669]">BUY</span>
                        <span className="font-medium text-[#121212]">XAUUSD · 1.00L</span>
                        <span className="text-[10px] text-[#717182]">RR 1:3.4 (MFE 4.1R)</span>
                      </div>
                      <span className="font-black text-[#059669]">+$680.00</span>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 6. TRADER PRECISION & EXECUTION SPEED ── */}
      <section id="precision" className="py-20 sm:py-28 bg-white border-b-2 border-[#121212]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={sectionVariants}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#059669] block mb-2">
              [ TRADER PRECISION &amp; SPEED ]
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-[#121212] uppercase leading-tight">
              Designed For Zero-Lag Decision Making.
            </h2>
            <p className="mt-4 text-base sm:text-lg text-[#404040] font-medium leading-relaxed">
              When market conditions move fast, you cannot afford clumsy software that freezes or leaks future data. KAFX gives you split-second execution and reliable simulation.
            </p>
          </motion.div>

          {/* Feature Breakdown Cards */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={gridVariants}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {/* Precision 1 */}
            <motion.div
              variants={cardVariant}
              whileHover={{ x: 2, y: 2, boxShadow: '3px 3px 0px 0px #121212' }}
              whileTap={{ x: 5, y: 5, boxShadow: '0px 0px 0px 0px #121212' }}
              transition={{ duration: 0.08, ease: 'easeOut' }}
              className="p-6 bg-[#FAFAFA] border-2 border-[#121212] rounded-xl shadow-[6px_6px_0px_0px_#121212] cursor-pointer"
            >
              <div className="w-10 h-10 bg-white border-2 border-[#121212] rounded-lg shadow-[2px_2px_0px_0px_#121212] flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5 text-[#059669]" />
              </div>
              <div className="text-[10px] font-mono font-black text-[#059669] uppercase tracking-wider mb-1">
                INTEGRITY GUARANTEE
              </div>
              <h3 className="text-lg font-black uppercase text-[#121212] mb-2">
                Zero Look-Ahead Protection
              </h3>
              <p className="text-xs font-mono text-[#525252] leading-relaxed">
                Backtest with 100% integrity. Future bars and indicators are physically blocked from rendering until you step forward. No hindsight bias, no fake results, and no accidental peeking.
              </p>
            </motion.div>

            {/* Precision 2 */}
            <motion.div
              variants={cardVariant}
              whileHover={{ x: 2, y: 2, boxShadow: '3px 3px 0px 0px #121212' }}
              whileTap={{ x: 5, y: 5, boxShadow: '0px 0px 0px 0px #121212' }}
              transition={{ duration: 0.08, ease: 'easeOut' }}
              className="p-6 bg-[#FAFAFA] border-2 border-[#121212] rounded-xl shadow-[6px_6px_0px_0px_#121212] cursor-pointer"
            >
              <div className="w-10 h-10 bg-white border-2 border-[#121212] rounded-lg shadow-[2px_2px_0px_0px_#121212] flex items-center justify-center mb-4">
                <Crosshair className="w-5 h-5 text-[#1040C0]" />
              </div>
              <div className="text-[10px] font-mono font-black text-[#1040C0] uppercase tracking-wider mb-1">
                RISK MANAGEMENT
              </div>
              <h3 className="text-lg font-black uppercase text-[#121212] mb-2">
                Interactive Drag SL &amp; TP
              </h3>
              <p className="text-xs font-mono text-[#525252] leading-relaxed">
                Drag your Stop Loss and Take Profit lines directly on the chart canvas. Real-time lot size calculations automatically lock your exact risk percentage before you confirm the order.
              </p>
            </motion.div>

            {/* Precision 3 */}
            <motion.div
              variants={cardVariant}
              whileHover={{ x: 2, y: 2, boxShadow: '3px 3px 0px 0px #121212' }}
              whileTap={{ x: 5, y: 5, boxShadow: '0px 0px 0px 0px #121212' }}
              transition={{ duration: 0.08, ease: 'easeOut' }}
              className="p-6 bg-[#FAFAFA] border-2 border-[#121212] rounded-xl shadow-[6px_6px_0px_0px_#121212] cursor-pointer"
            >
              <div className="w-10 h-10 bg-white border-2 border-[#121212] rounded-lg shadow-[2px_2px_0px_0px_#121212] flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-[#121212]" />
              </div>
              <div className="text-[10px] font-mono font-black text-[#717182] uppercase tracking-wider mb-1">
                INSTANT FLUIDITY
              </div>
              <h3 className="text-lg font-black uppercase text-[#121212] mb-2">
                Silky 60fps Chart Navigation
              </h3>
              <p className="text-xs font-mono text-[#525252] leading-relaxed">
                Pan, zoom, and inspect historical swings across thousands of bars without browser lag or frozen viewports. Fast swipes, touch gestures, and mouse wheels respond instantly.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── 6. INTERACTIVE FAQ ACCORDION ── */}
      <section id="faq" className="py-20 sm:py-28 bg-white border-b-4 border-[#121212]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={sectionVariants}
            className="text-center max-w-3xl mx-auto mb-14"
          >
            <span className="text-xs font-mono font-black uppercase tracking-widest text-[#1040C0] bg-[#EBF2FF] border border-[#1040C0] px-3 py-1 rounded inline-block mb-3 shadow-[2px_2px_0px_0px_#1040C0]">
              [ FREQUENTLY ASKED QUESTIONS ]
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-[#121212] leading-[0.98]">
              Everything Traders Ask Before Getting Started.
            </h2>
            <p className="mt-3 text-sm sm:text-base font-mono text-[#525252] max-w-2xl mx-auto">
              Clear, transparent answers about MetaTrader 5 connectivity, prop firm rules, automated firewall protection, and local data security.
            </p>
          </motion.div>

          {/* Accordion List */}
          <div className="space-y-4">
            {[
              {
                q: 'How does KAFX automatically sync trades from MetaTrader 5 without manual CSV uploads?',
                a: 'KAFX uses a high-performance local Expert Advisor (EA) running directly inside your MetaTrader 5 terminal. Whenever an order is opened, modified, or closed, the execution payload streams directly to your local journal in under 5 milliseconds. No manual CSV exports, no file uploading, and zero delay.',
              },
              {
                q: 'Can I practice prop firm challenge rules before paying for an evaluation account?',
                a: 'Yes. KAFX provides built-in challenge presets for FTMO, FundedNext, The5ers, and custom prop firm parameters. The engine monitors both daily loss limits and maximum trailing drawdown in real-time, locking out new simulated executions the exact millisecond a boundary is breached so you can build true discipline before risking real challenge fees.',
              },
              {
                q: 'How does the EA Signal Firewall prevent automated trading bots from blowing up accounts?',
                a: 'The firewall functions as an intelligent human-in-the-loop bridge. When an algorithmic EA or webhook signal fires an order, KAFX intercepts the trade before it reaches the broker. An instant Telegram or WhatsApp notification prompts you with full trade details (symbol, lots, stop loss, risk percent). You click Approve to route the order or Reject to cancel execution immediately.',
              },
              {
                q: 'Is my trading account data and personal journal kept completely private?',
                a: '100% private. All your trade logs, account balances, chart screenshots, and notes are stored strictly on your local disk. KAFX does not upload your trade history or broker account credentials to any cloud database. Your edge stays entirely in your custody.',
              },
              {
                q: 'How realistic is the Tick-by-Tick Replay Engine compared to standard bar replay?',
                a: 'Most charting platforms only replay 1-minute bars using artificial OHLC interpolations. KAFX replays every recorded individual tick with realistic bid/ask spreads and slippage modeling. You can drag Stop Loss and Take Profit lines directly on the chart to test intra-candle fills under true market conditions.',
              },
            ].map((item, index) => {
              const isOpen = expandedFaq === index;
              return (
                <motion.div
                  key={index}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-40px' }}
                  variants={cardVariant}
                  className="border-2 border-[#121212] rounded-xl shadow-[4px_4px_0px_0px_#121212] bg-[#FAF9F6] overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedFaq(isOpen ? null : index)}
                    className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-white transition-colors"
                  >
                    <span className="font-mono font-black text-sm sm:text-base text-[#121212] uppercase leading-snug">
                      {item.q}
                    </span>
                    <div
                      className={`w-7 h-7 rounded border border-[#121212] bg-white flex items-center justify-center shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 bg-[#FEF08A]' : ''
                      }`}
                    >
                      <ChevronDown className="w-4 h-4 text-[#121212]" />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                        className="overflow-hidden border-t border-[#121212]/15 bg-white"
                      >
                        <div className="p-4 sm:p-6 font-mono text-xs sm:text-sm text-[#404040] leading-relaxed">
                          {item.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 7. BENCHMARKS & COMPARISON MATRIX ── */}
      <section id="specs" className="py-20 bg-[#F4F4F0] border-b-2 border-[#121212]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={sectionVariants}
            className="text-center mb-12"
          >
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#717182] block mb-1">
              [ THE HARD COMPARISON ]
            </span>
            <h2 className="text-2xl sm:text-3xl font-black uppercase text-[#121212]">
              Why Serious Traders Leave Spreadsheets &amp; Cloud Tools
            </h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={cardVariant}
            whileHover={{ boxShadow: '8px 8px 0px 0px #121212' }}
            transition={{ duration: 0.1 }}
            className="border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] bg-white rounded-xl overflow-hidden"
          >
            <div className="grid grid-cols-3 bg-[#121212] text-white p-3.5 text-xs font-mono font-black uppercase">
              <span>Capability</span>
              <span className="text-[#FDE047]">KAFX Pro</span>
              <span className="text-[#717182]">Spreadsheets / Cloud Journals</span>
            </div>
            <div className="divide-y divide-slate-200 text-xs font-mono">
              <div className="grid grid-cols-3 p-3.5 items-center">
                <span className="font-bold text-[#121212]">Trade Logging</span>
                <span className="font-bold text-[#059669]">Automated MT5 Live Sync &amp; CSV</span>
                <span className="text-[#DC2626]">Slow Manual Copy-Pasting</span>
              </div>
              <div className="grid grid-cols-3 p-3.5 items-center bg-slate-50">
                <span className="font-bold text-[#121212]">Chart Replay Quality</span>
                <span className="font-bold text-[#059669]">Full Tick Replay With Visual Orders</span>
                <span className="text-[#DC2626]">Static Screenshots Or Paywalls</span>
              </div>
              <div className="grid grid-cols-3 p-3.5 items-center">
                <span className="font-bold text-[#121212]">Prop Firm Preparation</span>
                <span className="font-bold text-[#059669]">FTMO / The5ers Drawdown Audits</span>
                <span className="text-[#DC2626]">Blind Hope &amp; Guesswork</span>
              </div>
              <div className="grid grid-cols-3 p-3.5 items-center bg-slate-50">
                <span className="font-bold text-[#121212]">Risk Stress-Testing</span>
                <span className="font-bold text-[#059669]">10K Monte Carlo Ruin Simulations</span>
                <span className="text-[#717182]">Basic PnL Averages Only</span>
              </div>
              <div className="grid grid-cols-3 p-3.5 items-center">
                <span className="font-bold text-[#121212]">Data Privacy &amp; Security</span>
                <span className="font-bold text-[#059669]">100% On-Device (Zero Cloud Snooping)</span>
                <span className="text-[#DC2626]">Stored On Third-Party Cloud Servers</span>
              </div>
              <div className="grid grid-cols-3 p-3.5 items-center bg-slate-50">
                <span className="font-bold text-[#121212]">Recurring Cost</span>
                <span className="font-bold text-[#059669]">$0 (Local-First Open Workspace)</span>
                <span className="text-[#DC2626]">$49 - $99 / Month Subscriptions</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 8. THE FINAL CTA BLOCK ── */}
      <section className="py-20 sm:py-28 bg-[#121212] text-white border-t-4 border-[#121212] relative overflow-hidden">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={sectionVariants}
          className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/10 border border-white/20 rounded mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1040C0]" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-200">
              UPGRADE YOUR TRADING ROUTINE TODAY
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black uppercase tracking-tight text-white leading-tight max-w-3xl mx-auto">
            Stop Journaling On Spreadsheets. <br />
            <span className="text-[#FEF08A]">Take Control Of Your Edge.</span>
          </h2>

          <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-xl mx-auto font-medium leading-relaxed">
            Connect your MT5 account, replay historical sessions, pass prop firm evaluations, and trade with statistical confidence. Ready to upgrade your routine?
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button
              type="button"
              onClick={() => setShowAuthModal(true)}
              whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #FFFFFF' }}
              whileTap={{ x: 5, y: 5, boxShadow: '0px 0px 0px 0px #FFFFFF' }}
              transition={{ duration: 0.08, ease: 'easeOut' }}
              className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-slate-100 text-[#121212] border-2 border-white shadow-[6px_6px_0px_0px_#FFFFFF] font-mono font-black text-sm uppercase tracking-wider cursor-pointer rounded text-center"
            >
              Get Started Free
            </motion.button>
            <motion.button
              type="button"
              onClick={handleGetStarted}
              whileHover={{ x: 2, y: 2, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
              whileTap={{ x: 4, y: 4 }}
              transition={{ duration: 0.08, ease: 'easeOut' }}
              className="w-full sm:w-auto px-8 py-4 bg-transparent text-white border-2 border-white font-mono font-black text-sm uppercase tracking-wider cursor-pointer rounded text-center"
            >
              Launch KAFX
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* ── 9. FOOTER ── */}
      <footer className="bg-[#F8F8F8] py-12 px-4 sm:px-6 lg:px-8 border-t-2 border-[#121212]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 border-b-2 border-[#121212]/10 pb-8">
          <Link to="/landing" className="flex items-center group select-none">
            <BrandLogo size={36} className="flex-shrink-0" />
          </Link>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-mono font-bold uppercase text-[#525252]">
            <Link to="/backtest" className="hover:text-[#121212] transition-colors">
              Chart Replay
            </Link>
            <Link to="/dashboard" className="hover:text-[#121212] transition-colors">
              Analytics
            </Link>
            <Link to="/ea-control" className="hover:text-[#121212] transition-colors">
              EA Control
            </Link>
            <Link to="/live-journal" className="hover:text-[#121212] transition-colors">
              Live MT5
            </Link>
            <Link to="/prop-sim" className="hover:text-[#121212] transition-colors">
              Prop Sim
            </Link>
            <Link to="/monte-carlo" className="hover:text-[#121212] transition-colors">
              Monte Carlo
            </Link>
            <Link to="/create-session" className="hover:text-[#121212] transition-colors">
              Buat Sesi
            </Link>
            <Link to="/mt5-report" className="hover:text-[#121212] transition-colors">
              MT5 Analyzer
            </Link>
            <Link to="/market-data" className="hover:text-[#121212] transition-colors">
              Market Data
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#717182]">
          <p>© {new Date().getFullYear()} KAFX Trading Journal. Professional Local-First Trading Journal &amp; Backtest Platform.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#121212] cursor-pointer">100% Data Privacy</span>
            <span>·</span>
            <span className="hover:text-[#121212] cursor-pointer">Zero Look-Ahead Guarantee</span>
            <span>·</span>
            <span className="hover:text-[#121212] cursor-pointer">Built For Traders</span>
          </div>
        </div>
      </footer>

      {/* ── 10. AUTH MODAL ── */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
