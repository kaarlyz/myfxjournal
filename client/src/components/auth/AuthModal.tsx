import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, ShieldCheck, Terminal, Zap, Lock, Mail, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BrandLogo } from '../ui/BrandLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
  onSuccess?: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'login',
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    if (mode === 'register' && name.trim().length < 2) {
      setError('Trader callsign must be at least 2 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ email: cleanEmail, password });
      } else {
        await register({ name: name.trim(), email: cleanEmail, password });
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickTestLogin = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await login({ email: 'operator@kafx.local', password: 'password123' });
      if (onSuccess) {
        onSuccess();
      }
      onClose();
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Quick login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#121212]/65 backdrop-blur-xs select-none">
        {/* Backdrop click to close */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-md mx-auto bg-white border-4 border-[#121212] shadow-[12px_12px_0px_0px_#121212] p-6 sm:p-8 rounded-xl"
        >
          {/* Top Window Bar */}
          <div className="flex items-center justify-between pb-3.5 mb-5 border-b-2 border-[#121212]">
            <div className="flex items-center gap-2">
              <BrandLogo size={24} compact className="flex-shrink-0" />
              <div className="flex items-center gap-1.5 ml-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] border border-[#121212]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] border border-[#121212]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#059669] border border-[#121212]" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 bg-[#FEF08A] text-[#854D0E] border border-[#121212] rounded">
                SECURE AUTH GATE
              </span>
              <button
                type="button"
                onClick={onClose}
                className="w-6 h-6 rounded border border-[#121212] flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5 text-[#121212]" />
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`py-2 text-xs font-mono font-black uppercase tracking-wider rounded border-2 border-[#121212] transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#121212]'
                  : 'bg-slate-100 hover:bg-slate-200 text-[#525252]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
              }}
              className={`py-2 text-xs font-mono font-black uppercase tracking-wider rounded border-2 border-[#121212] transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-[#121212] text-white shadow-[2px_2px_0px_0px_#121212]'
                  : 'bg-slate-100 hover:bg-slate-200 text-[#525252]'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Headline & Instruction */}
          <div className="text-left mb-4">
            <h2 className="text-2xl sm:text-3xl font-black uppercase text-slate-900 tracking-tight leading-none mb-1.5">
              {mode === 'login' ? 'WELCOME BACK, TRADER' : 'JOIN KAFX JOURNAL'}
            </h2>
            <p className="text-xs font-mono text-[#525252] leading-relaxed">
              {mode === 'login'
                ? 'Sign in to access your trading journal, live MT5 sync, and session replay.'
                : 'Create your trader profile to start tracking execution and backtesting your edge.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div className="space-y-1 text-left">
                <label className="block text-[11px] font-mono font-black uppercase tracking-wider text-[#121212]">
                  Trader Callsign
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#717182] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="e.g. ApexTrader, Falcon, Ronin"
                    className="w-full pl-9 pr-3 py-2.5 border-2 border-[#121212] bg-slate-50 font-mono text-xs sm:text-sm focus:shadow-[3px_3px_0px_0px_#121212] outline-none rounded"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1 text-left">
              <label className="block text-[11px] font-mono font-black uppercase tracking-wider text-[#121212]">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#717182] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="trader@domain.com"
                  className="w-full pl-9 pr-3 py-2.5 border-2 border-[#121212] bg-slate-50 font-mono text-xs sm:text-sm focus:shadow-[3px_3px_0px_0px_#121212] outline-none rounded"
                />
              </div>
            </div>

            <div className="space-y-1 text-left">
              <label className="block text-[11px] font-mono font-black uppercase tracking-wider text-[#121212]">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#717182] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2.5 border-2 border-[#121212] bg-slate-50 font-mono text-xs sm:text-sm focus:shadow-[3px_3px_0px_0px_#121212] outline-none rounded"
                />
              </div>
            </div>

            {error && (
              <div className="p-2 bg-[#FFF0F0] border border-[#DC2626] rounded text-[11px] font-mono font-bold text-[#DC2626] text-left">
                {error}
              </div>
            )}

            <div className="pt-2">
              <motion.button
                type="submit"
                disabled={isSubmitting}
                whileHover={{ x: 2, y: 2, boxShadow: '4px 4px 0px 0px #10B981' }}
                whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0px 0px #10B981' }}
                className="w-full py-3.5 bg-[#121212] hover:bg-[#262626] text-white border-2 border-[#121212] shadow-[5px_5px_0px_0px_#121212] font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer rounded transition-all"
              >
                <span>{mode === 'login' ? 'ENTER DASHBOARD' : 'CREATE ACCOUNT & ENTER'}</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </form>

          {/* Quick 1-Click Test Login Action */}
          <div className="mt-3.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleQuickTestLogin}
              disabled={isSubmitting}
              className="w-full py-2 bg-[#EBF2FF] hover:bg-[#D8E6FF] text-[#1040C0] border border-[#1040C0] rounded font-mono font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-[#1040C0]" />
              <span>Quick Demo Login (Instant Access)</span>
            </button>
          </div>

          {/* Micro Specs Footer */}
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-[#717182]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#059669]" />
              Private Trading Journal
            </span>
            <span className="flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5 text-[#1040C0]" />
              100% Private &amp; Encrypted
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
