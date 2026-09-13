import React from 'react';
import { motion } from 'framer-motion';

interface OnboardingLayoutProps {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function OnboardingLayout({
  step,
  total,
  title,
  subtitle,
  children,
  footer,
}: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] text-[#121212] flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8 selection:bg-[#FEF08A] selection:text-[#121212]">
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="w-full max-w-2xl bg-white border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] rounded-2xl p-6 sm:p-8 md:p-10 text-left"
      >
        {/* Top Window Bar */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b-2 border-[#121212]">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#DC2626] border border-[#121212]" />
            <span className="w-3 h-3 rounded-full bg-[#F59E0B] border border-[#121212]" />
            <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#121212]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-black uppercase px-2.5 py-0.5 bg-[#FEF08A] text-[#854D0E] border border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212]">
              STEP {step} / {total}
            </span>
          </div>
        </div>

        {/* Brand Header */}
        <div className="flex items-center gap-3 pb-5 mb-6 border-b-2 border-[#121212]">
          <div className="w-9 h-9 bg-[#121212] border-2 border-[#121212] rounded-lg flex items-center justify-center shadow-[2px_2px_0px_0px_#1040C0]">
            <span className="font-mono font-black text-sm text-white tracking-tighter">FX</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-black uppercase tracking-wider text-[#121212]">
                REPLAY<span className="text-[#1040C0]">FX</span>
              </span>
              <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 bg-[#EBF2FF] text-[#1040C0] border border-[#1040C0] rounded">
                INITIALIZATION
              </span>
            </div>
            <p className="text-[10px] font-mono text-[#717182] font-semibold">
              LOCAL-FIRST HARDCORE TRADING ENVIRONMENT
            </p>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#121212] leading-tight font-mono">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm font-mono text-[#525252] leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {/* Body Content */}
        {children}

        {/* Footer Area */}
        {footer && (
          <div className="mt-8 pt-5 border-t-2 border-[#121212]">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}
