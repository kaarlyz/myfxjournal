import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
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
      title={`Welcome, ${name} 👋`}
      subtitle="Your analytics workspace is ready."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#717182]">Fast, personal, and ready to explore.</p>
          <motion.button
            onClick={onFinish}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 border-2 border-[#121212] bg-[#121212] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.22em] text-white shadow-[3px_3px_0px_0px_#1040C0]"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      }
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="rounded-none border-2 border-[#121212] bg-[#FCFCFC] p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center border-2 border-[#121212] bg-[#F0F0F0]">
            <Sparkles className="h-5 w-5 text-[#1040C0]" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#717182]">Personalized workspace</p>
            <p className="mt-1 text-sm font-semibold text-[#121212]">Nice to meet you, {name}. Your analytics workspace is ready.</p>
          </div>
        </div>
      </motion.div>
    </OnboardingLayout>
  );
}
