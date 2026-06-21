import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, BookOpen, Settings } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { SymbolSelect } from '../components/forms/SymbolSelect';
import { TimeframeSelect } from '../components/forms/TimeframeSelect';
import { MarketCategorySelect } from '../components/forms/MarketCategorySelect';
import { AccountTypeSelect } from '../components/forms/AccountTypeSelect';
import { HelpCard, InfoTooltip, PageGuide } from '../components/help/HelpSystem';

export default function CreateSession() {
  const { createSession, settings, fetchSettings, selectSession } = useJournalStore();

  // Form states
  const [name, setName] = useState('');
  const [sourceMode, setSourceMode] = useState<'CSV' | 'WEBHOOK' | 'MANUAL'>('CSV');
  const [symbol, setSymbol] = useState('XAUUSD');
  const [customSymbol, setCustomSymbol] = useState('');
  const [marketType, setMarketType] = useState('Metal');
  const [timeframe, setTimeframe] = useState('M5');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [balanceCurrency, setBalanceCurrency] = useState<'USD' | 'CENT' | 'IDR'>('USD');
  const [accountMode, setAccountMode] = useState('NORMAL');
  const [centMultiplier, setCentMultiplier] = useState('100');
  const [usdIdrRate, setUsdIdrRate] = useState('16200');
  const [riskMode, setRiskMode] = useState<'FIXED_USD' | 'FIXED_PCT' | 'NO_R'>('FIXED_USD');
  const [riskValue, setRiskValue] = useState('100');
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    const resolvedSymbol = symbol === 'CUSTOM' ? customSymbol.trim().toUpperCase() : symbol.trim().toUpperCase();
    if (!resolvedSymbol) return setError('Symbol wajib dipilih atau diisi.');
    if (!timeframe.trim()) return setError('Timeframe utama (misal: M5, H1) wajib diisi.');
    if (!initialBalance || parseFloat(initialBalance) <= 0) return setError('Initial balance harus berupa angka positif.');
    if (riskMode !== 'NO_R' && (!riskValue || parseFloat(riskValue) < 0)) {
      return setError('Nilai resiko (risk value) harus bernilai positif.');
    }

    setIsSubmitting(true);
    const sessionData = {
      name: name.trim(),
      sourceMode,
      symbol: resolvedSymbol,
      marketType,
      timeframe: timeframe.trim().toUpperCase(),
      initialBalance: parseFloat(initialBalance),
      balanceCurrency,
      usdIdrRate: parseFloat(usdIdrRate),
      riskMode,
      riskValue: parseFloat(riskValue || '0'),
      notes: [
        notes.trim(),
        accountMode === 'CENT' ? `Account mode: CENT. Cent multiplier: ${centMultiplier}. Broker balance may be displayed in cents.` : '',
        accountMode === 'PROP' ? 'Account mode: PROP.' : '',
        accountMode === 'DEMO' ? 'Account mode: DEMO.' : '',
      ].filter(Boolean).join('\n'),
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white tracking-tight">Buat Sesi Backtest Baru</h1>
          <PageGuide
            title="Buat Sesi Backtest"
            purpose="Halaman ini dipakai untuk membuat wadah analisis sebelum kamu import CSV, catat trade manual, atau menerima trade dari webhook."
            steps={[
              'Isi nama sesi yang mudah dikenali.',
              'Pilih symbol, timeframe, dan kategori market.',
              'Pilih mode akun agar dashboard tidak salah membaca balance cent/IDR/demo.',
              'Isi modal awal, lalu buat sesi.',
              'Setelah sesi dibuat, import CSV atau buka dashboard.'
            ]}
            outputs={[
              'Sesi baru muncul di halaman Overview/Sessions.',
              'Dashboard memakai initial balance, symbol, timeframe, dan mode akun dari form ini.'
            ]}
            warnings={[
              'Cent account tidak sama dengan USD normal. Aktifkan mode Cent agar nilainya diberi label jelas.',
              'Risk/R setting bisa diatur nanti dari Advanced Settings atau Risk Calculator.'
            ]}
            nextAction="Kalau sumber datanya TradingView Strategy Tester, lanjut ke Import CSV setelah sesi dibuat."
          />
        </div>
        <p className="text-xs text-[#707a8a] mt-1">
          Alur sederhana: nama sesi, symbol, timeframe, market, mode akun, dan modal awal.
        </p>
      </div>

      <HelpCard title="Kapan memakai halaman ini?">
        Pakai halaman ini kalau kamu ingin membuat sesi kosong lebih dulu. Kalau sudah punya file CSV TradingView atau laporan MT5, kamu juga bisa langsung masuk ke halaman import.
      </HelpCard>

      {error && (
        <div className="bg-[rgba(246,70,93,0.08)] border border-[rgba(246,70,93,0.2)] rounded-xl p-4 flex items-start space-x-3 text-[#f6465d] text-xs font-semibold">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className=" rounded-xl border border-[#2b3139] p-6 space-y-6">
        {/* Core Settings Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Name */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase tracking-wider block">Nama Sesi Backtest</label>
            <input
              type="text"
              placeholder="Contoh: SMC Gold Backtest Mei 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Symbol / Pair</label>
            <SymbolSelect value={symbol} onChange={setSymbol} customValue={customSymbol} onCustomChange={setCustomSymbol} />
          </div>

          {/* Timeframe */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Timeframe Utama</label>
            <TimeframeSelect value={timeframe} onChange={setTimeframe} />
          </div>

          {/* Market Type */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Kategori Market</label>
            <MarketCategorySelect value={marketType} onChange={setMarketType} />
          </div>

          {/* Mode Source */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Metode Input Trade</label>
            <select
              value={sourceMode}
              onChange={(e: any) => setSourceMode(e.target.value)}
              className="w-full bg-[#1e2329] border border-[#2b3139] outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            >
              <option value="CSV">CSV IMPORT (Unggah File Strategy Tester)</option>
              <option value="WEBHOOK">WEBHOOK / AUTO ENTRY (Otomatis dari Pine Script)</option>
              <option value="MANUAL">MANUAL (Catat Manual)</option>
            </select>
          </div>
        </div>

        {/* Currency & Balances Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-[#2b3139] pt-6">
          {/* Initial Balance */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Modal Awal (Initial Balance)</label>
            <input
              type="number"
              placeholder="10000"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>

          {/* Account Mode */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase flex items-center gap-1">
              Mode Akun <InfoTooltip text="Mode akun membantu dashboard memberi label nilai balance. Cent account tidak boleh dibaca diam-diam sebagai USD normal." />
            </label>
            <AccountTypeSelect
              value={accountMode}
              onChange={(value) => {
                setAccountMode(value);
                setBalanceCurrency(value === 'CENT' ? 'CENT' : value === 'IDR' ? 'IDR' : 'USD');
              }}
            />
          </div>

          {/* USD IDR Rate */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">{accountMode === 'CENT' ? 'Cent Multiplier' : 'Kurs Konversi USD ke IDR'}</label>
            <input
              type="number"
              placeholder={accountMode === 'CENT' ? '100' : '16200'}
              value={accountMode === 'CENT' ? centMultiplier : usdIdrRate}
              onChange={(e) => accountMode === 'CENT' ? setCentMultiplier(e.target.value) : setUsdIdrRate(e.target.value)}
              className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            />
          </div>
        </div>

        {accountMode === 'CENT' && (
          <HelpCard title="Catatan cent account" tone="warning">
            Cent account: broker bisa menampilkan balance dalam satuan cent. Dashboard akan memberi label CENT dan menyimpan catatan multiplier agar hasil tidak dikira USD normal.
          </HelpCard>
        )}

        {/* Risk Multiples Calculator Section */}
        <div className="border-t border-[#2b3139] pt-6">
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="flex items-center gap-2 text-xs font-bold text-[#fcd535]"
          >
            <Settings className="w-4 h-4" />
            {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
          </button>
        </div>

        {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Risk Mode */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Model Penghitungan Risiko (R)</label>
            <select
              value={riskMode}
              onChange={(e: any) => setRiskMode(e.target.value)}
              className="w-full bg-[#1e2329] border border-[#2b3139] outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
            >
              <option value="FIXED_USD">Fixed Risk USD per Trade</option>
              <option value="FIXED_PCT">Fixed Risk % dari Initial Balance</option>
              <option value="NO_R">No R Calculation (Matikan Perhitungan R)</option>
            </select>
          </div>

          {/* Risk Value */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-[#707a8a] uppercase block">
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
              className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
        )}

        {/* Notes Section */}
        <div className="space-y-1.5 border-t border-[#2b3139] pt-6">
          <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Catatan / Deskripsi Strategi</label>
          <textarea
            placeholder="Tuliskan detail tentang sesi ini, misalnya rules entry (SMC, SNR, EMA cross), target RR minimum, batasan emosi, dll..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-medium leading-relaxed resize-none"
          />
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end space-x-3 border-t border-[#2b3139] pt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5  transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Menyimpan...' : 'Simpan & Lanjutkan'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
