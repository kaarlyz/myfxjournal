import React from 'react';
import { motion } from 'framer-motion';
import { BrandLogo } from '../ui/BrandLogo';

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
    <div className="min-h-screen w-full bg-[#FCFCFC] text-[#121212] flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="w-full max-w-3xl rounded-none border-2 border-[#121212] bg-white p-6 sm:p-8 lg:p-10 shadow-[8px_8px_0px_0px_#121212]"
      >
        <div className="flex items-center justify-between gap-3 mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <BrandLogo size={44} compact className="flex-shrink-0" />
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#717182]">KAFX</p>
              <p className="text-[11px] font-semibold text-[#717182]">First launch experience</p>
            </div>
          </div>
          <div className="rounded border border-[#121212] bg-[#F0F0F0] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#121212]">
            Step {step} of {total}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-[#121212] font-display">{title}</h1>
            {subtitle && <p className="max-w-2xl text-sm sm:text-base text-[#717182] leading-6">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="pt-2">{footer}</div>}
        </div>
      </motion.div>
    </div>
  );
}
