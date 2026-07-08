import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { BrandLogo } from '../ui/BrandLogo';

interface WelcomeScreenProps {
  onStart: () => void;
}

export default function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FCFCFC] px-4 py-10 text-[#121212]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        className="w-full max-w-2xl text-center"
      >
        <motion.div
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-6 flex justify-center"
        >
          <BrandLogo size={96} ariaLabel="KAFX welcome logo" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22 }}
          className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#121212] font-display"
        >
          Welcome to KAFX
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.22 }}
          className="mt-3 text-base sm:text-lg text-[#717182]"
        >
          Professional Trading Journal & Analytics
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.22 }}
          className="mx-auto mt-5 max-w-xl text-sm sm:text-[15px] leading-7 text-[#717182]"
        >
          Analyze your performance. Discover your edge. Trade with confidence.
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26, duration: 0.22 }}
          onClick={onStart}
          className="mt-8 inline-flex items-center gap-2 border-2 border-[#121212] bg-[#121212] px-5 py-3 text-sm font-extrabold uppercase tracking-[0.22em] text-white shadow-[4px_4px_0px_0px_#1040C0] transition-transform hover:-translate-y-0.5"
        >
          Get Started
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      </motion.div>
    </div>
  );
}
