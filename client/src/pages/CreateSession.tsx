import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, BookOpen, Settings } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';

export default function CreateSession() {
  const { createSession, settings, fetchSettings, selectSession } = useJournalStore();

  // Form states
  const [name, setName] = useState('');
  const [sourceMode, setSourceMode] = useState<'CSV' | 'WEBHOOK' | 'MANUAL'>('CSV');
  const [symbol, setSymbol] = useState('');
  const [marketType, setMarketType] = useState<'Forex' | 'Gold' | 'Crypto' | 'Index' | 'Custom'>('Forex');
  const [timeframe, setTimeframe] = useState('');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [balanceCurrency, setBalanceCurrency] = useState<'USD' | 'CENT' | 'IDR'>('USD');
  const [usdIdrRate, setUsdIdrRate] = useState('16200');
  const [riskMode, setRiskMode] = useState<'FIXED_USD' | 'FIXED_PCT' | 'NO_R'>('FIXED_USD');
  const [riskValue, setRiskValue] = useState('100');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Prepopulate form when global settings are loaded
  useEffect(() => {
    if (settings) {
      setUsdIdrRate(String(settings.usdIdrRate));
      setRiskMode(settings.defaultRiskMode);
      setRiskValue(String(settings.defaultRiskValue));
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) return setError('Nama sesi wajib diisi.');
    if (!symbol.trim()) return setError('Symbol (misal: GBPUSD) wajib diisi.');
    if (!timeframe.trim()) return setError('Timeframe utama (misal: M5, H1) wajib diisi.');
    if (!initialBalance || parseFloat(initialBalance) <= 0) return setError('Initial balance harus berupa angka positif.');
    if (riskMode !== 'NO_R' && (!riskValue || parseFloat(riskValue) < 0)) {
      return setError('Nilai resiko (risk value) harus bernilai positif.');
    }

    setIsSubmitting(true);
    const sessionData = {
      name: name.trim(),
      sourceMode,
      symbol: symbol.trim().toUpperCase(),
      marketType,
      timeframe: timeframe.trim().toUpperCase(),
      initialBalance: parseFloat(initialBalance),
      balanceCurrency,
      usdIdrRate: parseFloat(usdIdrRate),
      riskMode,
      riskValue: parseFloat(riskValue || '0'),
      notes: notes.trim(),
    };

    const newSessionId = await createSession(sessionData);
    setIsSubmitting(false);

    if (newSessionId) {
      // If CSV session, redirect to CSV import page
      if (sourceMode === 'CSV') {
        selectSession(newSessionId);
        // Switch tab to CSV Import so they can directly upload the file
        useJournalStore.getState().setTab('csv-import');
      } else {
        // If Manual/Webhook, redirect straight to dashboard
        selectSession(newSessionId);
      }
    } else {
      setError('Gagal membuat sesi backtest. Coba lagi.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Buat Sesi Backtest Baru</h1>
        <p className="text-xs text-gray-500 mt-1">
          Tentukan parameter awal sesi jurnal trading Anda seperti saldo, leverage risiko, dan deskripsi strategi.
        </p>
      </div>

      {error && (
        <div className="bg-lossRed/10 border border-lossRed/20 rounded-xl p-4 flex items-start space-x-3 text-lossRed text-xs font-semibold">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl border border-gray-800 p-6 space-y-6">
        {/* Core Settings Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Name */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Nama Sesi Backtest</label>
            <input
              type="text"
              placeholder="Contoh: SMC Gold Backtest Mei 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Symbol / Pair</label>
            <input
              type="text"
              placeholder="XAUUSD, GBPUSD, EURUSD, BTCUSD..."
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>

          {/* Timeframe */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Timeframe Utama</label>
            <input
              type="text"
              placeholder="M5, M15, H1, H4, D..."
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>

          {/* Market Type */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Kategori Market</label>
            <select
              value={marketType}
              onChange={(e: any) => setMarketType(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            >
              <option value="Forex">Forex</option>
              <option value="Gold">Gold / Metals</option>
              <option value="Crypto">Cryptocurrency</option>
              <option value="Index">Indices / Stock Index</option>
              <option value="Custom">Custom / Other</option>
            </select>
          </div>

          {/* Mode Source */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Metode Input Trade</label>
            <select
              value={sourceMode}
              onChange={(e: any) => setSourceMode(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            >
              <option value="CSV">CSV IMPORT (Unggah File Strategy Tester)</option>
              <option value="WEBHOOK">WEBHOOK / AUTO ENTRY (Otomatis dari Pine Script)</option>
              <option value="MANUAL">MANUAL (Catat Manual)</option>
            </select>
          </div>
        </div>

        {/* Currency & Balances Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-gray-800/80 pt-6">
          {/* Initial Balance */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Modal Awal (Initial Balance)</label>
            <input
              type="number"
              placeholder="10000"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Mata Uang Akun</label>
            <select
              value={balanceCurrency}
              onChange={(e: any) => setBalanceCurrency(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            >
              <option value="USD">USD ($)</option>
              <option value="CENT">CENT (Cents USD)</option>
              <option value="IDR">IDR (Rupiah)</option>
            </select>
          </div>

          {/* USD IDR Rate */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Kurs Konversi USD ke IDR</label>
            <input
              type="number"
              placeholder="16200"
              value={usdIdrRate}
              onChange={(e) => setUsdIdrRate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>
        </div>

        {/* Risk Multiples Calculator Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-gray-800/80 pt-6">
          {/* Risk Mode */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">Model Penghitungan Risiko (R)</label>
            <select
              value={riskMode}
              onChange={(e: any) => setRiskMode(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            >
              <option value="FIXED_USD">Fixed Risk USD per Trade</option>
              <option value="FIXED_PCT">Fixed Risk % dari Initial Balance</option>
              <option value="NO_R">No R Calculation (Matikan Perhitungan R)</option>
            </select>
          </div>

          {/* Risk Value */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase block">
              {riskMode === 'FIXED_USD' 
                ? 'Nominal Resiko per Trade (USD)' 
                : riskMode === 'FIXED_PCT' 
                ? 'Persentase Resiko per Trade (%)' 
                : 'Resiko Dinonaktifkan'}
            </label>
            <input
              type="number"
              placeholder={riskMode === 'FIXED_USD' ? '100' : '1'}
              disabled={riskMode === 'NO_R'}
              value={riskMode === 'NO_R' ? '' : riskValue}
              onChange={(e) => setRiskValue(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Notes Section */}
        <div className="space-y-1.5 border-t border-gray-800/80 pt-6">
          <label className="text-[10px] font-bold text-gray-500 uppercase block">Catatan / Deskripsi Strategi</label>
          <textarea
            placeholder="Tuliskan detail tentang sesi ini, misalnya rules entry (SMC, SNR, EMA cross), target RR minimum, batasan emosi, dll..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-medium leading-relaxed resize-none"
          />
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end space-x-3 border-t border-gray-800 pt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 cyan-glow transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Menyimpan...' : 'Simpan & Lanjutkan'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
