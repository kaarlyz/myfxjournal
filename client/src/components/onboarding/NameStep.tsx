import React, { FormEvent, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Crosshair, Shield, Bot, TrendingUp, Check } from 'lucide-react';
import OnboardingLayout from './OnboardingLayout';

interface NameStepProps {
  onNext: (name: string) => void;
}

const callsignPresets = ['Apex', 'Vanguard', 'Specter', 'Ronin', 'Falcon', 'Nova'];

const tradingStyles = [
  { id: 'scalper', label: 'Scalper · M1/M5 Flow', icon: Crosshair },
  { id: 'prop', label: 'Prop Firm Challenger', icon: Shield },
  { id: 'quant', label: 'Quant · EA Automated', icon: Bot },
  { id: 'swing', label: 'Swing & Structure', icon: TrendingUp },
];

export default function NameStep({ onNext }: NameStepProps) {
  const [name, setName] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('scalper');
  const [error, setError] = useState('');

  const isValid = useMemo(() => name.trim().length >= 2, [name]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Operator callsign must be at least 2 characters.');
      return;
    }
    onNext(trimmed);
  };

  return (
    <OnboardingLayout
      step={1}
      total={2}
      title="IDENTIFY TRADER PROFILE"
      subtitle="Configure your callsign and trading focus. Your identity is saved locally for session telemetry, execution logs, and automated journals."
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-mono font-bold text-[#717182] text-center sm:text-left">
            100% on-device storage &middot; No remote auth or cloud registration
          </p>
          <motion.button
            type="submit"
            form="name-step-form"
            whileHover={{ x: 2, y: 2, boxShadow: '4px 4px 0px 0px #10B981' }}
            whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #10B981' }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border-2 border-[#121212] bg-[#121212] px-6 py-3 text-xs font-mono font-black uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_#121212] rounded-lg disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all"
            disabled={!isValid}
          >
            <span>Continue to Diagnostics</span>
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      }
    >
      <form id="name-step-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Callsign Input */}
        <div className="space-y-2">
          <label className="block text-xs font-mono font-black uppercase tracking-wider text-[#121212]" htmlFor="user-name">
            OPERATOR CALLSIGN / TRADER NAME
          </label>
          <input
            id="user-name"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError('');
            }}
            placeholder="e.g. ApexTrader, Sarah, Quantum"
            className="w-full border-2 border-[#121212] bg-slate-50 p-3 font-mono text-sm focus:shadow-[4px_4px_0px_0px_#121212] outline-none rounded text-[#121212] placeholder:text-[#888888]"
          />
          {error && <p className="text-xs font-mono font-bold text-[#DC2626]">{error}</p>}
        </div>

        {/* Quick Callsign Chips */}
        <div className="space-y-1.5">
          <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#717182]">
            Suggested Callsigns:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {callsignPresets.map((preset) => (
              <motion.button
                key={preset}
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ y: 1 }}
                onClick={() => {
                  setName(preset);
                  if (error) setError('');
                }}
                className={`px-3 py-1 text-xs font-mono font-bold border-2 border-[#121212] rounded transition-all cursor-pointer ${
                  name === preset
                    ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#1040C0]'
                    : 'bg-white text-[#121212] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#FAF9F6]'
                }`}
              >
                {preset}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Primary Trading Focus */}
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <label className="block text-xs font-mono font-black uppercase tracking-wider text-[#121212]">
            PRIMARY TRADING ARSENAL
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tradingStyles.map((style) => {
              const Icon = style.icon;
              const isSelected = selectedStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyle(style.id)}
                  className={`p-3 text-left border-2 border-[#121212] rounded-lg font-mono text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#FEF08A] text-[#121212] shadow-[3px_3px_0px_0px_#121212]'
                      : 'bg-white text-[#525252] shadow-[2px_2px_0px_0px_#121212] hover:bg-[#FAF9F6]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-[#121212]' : 'text-[#717182]'}`} />
                    <span>{style.label}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#121212] stroke-[3]" />}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </OnboardingLayout>
  );
}
