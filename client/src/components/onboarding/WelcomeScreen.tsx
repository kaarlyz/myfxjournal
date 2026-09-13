import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Terminal, Zap, Database } from 'lucide-react';

interface WelcomeScreenProps {
  onStart: () => void;
}

export default function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-4 py-12 text-[#121212] selection:bg-[#FEF08A] selection:text-[#121212]">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="w-full max-w-md mx-auto bg-white border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] p-8 rounded-xl text-center select-none"
      >
        {/* Top Window Bar */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b-2 border-[#121212]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#DC2626] border border-[#121212]" />
            <span className="w-3 h-3 rounded-full bg-[#F59E0B] border border-[#121212]" />
            <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#121212]" />
          </div>
          <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 bg-[#FEF08A] text-[#854D0E] border border-[#121212] rounded">
            LOCAL SESSION
          </span>
        </div>

        {/* Super Badge */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-[10px] font-mono font-black uppercase tracking-wider text-[#1040C0] bg-[#EBF2FF] border border-[#1040C0] px-2 py-0.5 rounded">
            WORKSPACE INITIALIZATION
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl sm:text-4xl font-black uppercase text-slate-900 tracking-tight leading-none mb-3">
          INITIALIZE WORKSPACE
        </h1>

        <p className="mt-2 text-xs font-mono text-[#525252] leading-relaxed max-w-sm mx-auto">
          High-performance tick replay simulation, automated MetaTrader 5 live synchronization, and prop firm stress-testing on your local machine.
        </p>

        {/* Terminal Specs Box */}
        <div className="mt-5 p-3.5 bg-[#FAF9F6] border-2 border-[#121212] rounded-xl text-left space-y-2">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-[10px] font-mono font-black text-[#717182]">
            <Terminal className="w-3.5 h-3.5 text-[#1040C0]" />
            <span>ENVIRONMENT VERIFICATION</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="flex items-center gap-1.5 text-[#121212]">
              <Database className="w-3.5 h-3.5 text-[#059669]" />
              <span>Local DuckDB &amp; SQLite</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#121212]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#059669]" />
              <span>100% Private On-Device</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#121212]">
              <Zap className="w-3.5 h-3.5 text-[#1040C0]" />
              <span>Zero Look-Ahead Bias</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#121212]">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
              <span>MT5 SSE Bridge Ready</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <motion.button
          type="button"
          whileHover={{ x: 2, y: 2, boxShadow: '4px 4px 0px 0px #10B981' }}
          whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #10B981' }}
          onClick={onStart}
          className="mt-6 w-full py-4 bg-[#121212] hover:bg-[#262626] text-white font-mono font-black text-xs sm:text-sm uppercase tracking-wider border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <span>GET STARTED &middot; SETUP PROFILE</span>
          <ArrowRight className="h-4 w-4" />
        </motion.button>

        <p className="mt-3 text-[10px] font-mono font-bold text-[#717182]">
          Fast 30-second setup &middot; No account or credit card required
        </p>
      </motion.div>
    </div>
  );
}
