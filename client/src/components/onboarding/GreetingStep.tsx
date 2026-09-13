import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Database, ShieldCheck, Zap, Activity, CheckCircle2 } from 'lucide-react';
import OnboardingLayout from './OnboardingLayout';

interface GreetingStepProps {
  name: string;
  onFinish: () => void;
}

export default function GreetingStep({ name, onFinish }: GreetingStepProps) {
  return (
    <OnboardingLayout
      step={2}
      total={2}
      title={`TERMINAL READY, ${name.toUpperCase()}`}
      subtitle="Your local high-performance workspace has been configured and validated. Ready for tick-by-tick simulation."
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-mono font-bold text-[#717182] text-center sm:text-left">
            Runtime initialized · Ready for zero-bias execution
          </p>
          <motion.button
            onClick={onFinish}
            whileHover={{ x: 2, y: 2, boxShadow: '2px 2px 0px 0px #121212' }}
            whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #121212' }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border-2 border-[#121212] bg-[#121212] px-8 py-3.5 text-xs sm:text-sm font-mono font-black uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#1040C0] rounded-lg cursor-pointer transition-all"
          >
            <span>Launch Terminal · Enter Workspace</span>
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Welcome Callout */}
        <div className="p-4 bg-[#FAF9F6] border-2 border-[#121212] rounded-xl shadow-[3px_3px_0px_0px_#121212]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E7F9F0] border-2 border-[#059669] flex items-center justify-center text-[#059669] shrink-0">
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <p className="text-xs font-mono font-black uppercase text-[#121212]">
                Profile Registered: <span className="text-[#1040C0]">{name}</span>
              </p>
              <p className="text-[11px] font-mono text-[#525252] mt-0.5">
                Local SQLite journal mounted. Your sessions and trades remain 100% private.
              </p>
            </div>
          </div>
        </div>

        {/* Runtime Diagnostics */}
        <div className="p-4 bg-white border-2 border-[#121212] rounded-xl space-y-3 shadow-[2px_2px_0px_0px_#121212]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-[#717182]">
              SYSTEM HEALTH CHECK
            </span>
            <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 bg-[#E7F9F0] text-[#059669] border border-[#059669] rounded">
              ALL SUBSYSTEMS GREEN
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-slate-200 rounded">
              <Database className="w-4 h-4 text-[#059669] shrink-0" />
              <div>
                <span className="block font-bold text-[#121212]">DuckDB &amp; SQLite</span>
                <span className="text-[10px] text-[#717182]">0ms local read latency</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-slate-200 rounded">
              <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0" />
              <div>
                <span className="block font-bold text-[#121212]">Zero Look-Ahead Bias</span>
                <span className="text-[10px] text-[#717182]">Tick-exact ordinal guard</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-slate-200 rounded">
              <Activity className="w-4 h-4 text-[#1040C0] shrink-0" />
              <div>
                <span className="block font-bold text-[#121212]">MT5 SSE Live Bridge</span>
                <span className="text-[10px] text-[#717182]">Auto sync listener standby</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-slate-200 rounded">
              <Zap className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <div>
                <span className="block font-bold text-[#121212]">Prop Firm Rules Engine</span>
                <span className="text-[10px] text-[#717182]">Drawdown monitor loaded</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </OnboardingLayout>
  );
}
