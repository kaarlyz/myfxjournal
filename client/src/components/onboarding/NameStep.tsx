import React, { FormEvent, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import OnboardingLayout from './OnboardingLayout';

interface NameStepProps {
  onNext: (name: string) => void;
}

export default function NameStep({ onNext }: NameStepProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const isValid = useMemo(() => name.trim().length >= 2, [name]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Please enter at least 2 characters.');
      return;
    }
    onNext(trimmed);
  };

  return (
    <OnboardingLayout
      step={2}
      total={2}
      title="What should we call you?"
      subtitle="A personal greeting helps KAFX feel more like your own workspace."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#717182]">We’ll use this for your personal greeting.</p>
          <motion.button
            type="submit"
            form="name-step-form"
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 border-2 border-[#121212] bg-[#121212] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.22em] text-white shadow-[3px_3px_0px_0px_#1040C0] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!isValid}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      }
    >
      <form id="name-step-form" onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#717182]" htmlFor="user-name">
          Your name
        </label>
        <input
          id="user-name"
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError('');
          }}
          placeholder="Enter your name"
          className="w-full border-2 border-[#121212] bg-[#FCFCFC] px-4 py-3 text-sm font-semibold text-[#121212] outline-none focus:shadow-[4px_4px_0px_0px_#1040C0]"
        />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#717182]">
          <span className="rounded border border-[#121212]/20 bg-[#F0F0F0] px-2.5 py-1">Eka</span>
          <span className="rounded border border-[#121212]/20 bg-[#F0F0F0] px-2.5 py-1">John</span>
          <span className="rounded border border-[#121212]/20 bg-[#F0F0F0] px-2.5 py-1">Sarah</span>
        </div>
        {error && <p className="text-sm font-semibold text-[#D02020]">{error}</p>}
      </form>
    </OnboardingLayout>
  );
}
