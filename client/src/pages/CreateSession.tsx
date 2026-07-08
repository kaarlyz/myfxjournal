import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, BookOpen, Settings } from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { SymbolSelect } from '../components/forms/SymbolSelect';
import { TimeframeSelect } from '../components/forms/TimeframeSelect';
import { MarketCategorySelect } from '../components/forms/MarketCategorySelect';
import { AccountTypeSelect } from '../components/forms/AccountTypeSelect';
import { HelpCard, InfoTooltip, PageGuide } from '../components/help/HelpSystem';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';

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

  const inputClass = "w-full bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] focus:border-[#1040C0] focus:shadow-[4px_4px_0px_0px_#1040C0] outline-none rounded-none p-3 text-[13px] text-[#121212] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const labelClass = "text-[10px] font-extrabold text-[#717182] uppercase tracking-widest block mb-2";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader 
          label="New Session"
          title="Buat Sesi Backtest Baru"
          subtitle="Buat sesi backtest kosong sebelum mengunggah CSV atau input trade manual."
          labelColor="blue"
        />
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

      <HelpCard title="Kapan memakai halaman ini?">
        Pakai halaman ini kalau kamu ingin membuat sesi kosong lebih dulu. Kalau sudah punya file CSV TradingView atau laporan MT5, kamu juga bisa langsung masuk ke halaman import.
      </HelpCard>

      {error && (
        <div className="bg-[var(--loss-dim)] border-2 border-[var(--loss)] text-[var(--loss)] p-4 shadow-[4px_4px_0px_0px_var(--loss)] flex items-center gap-3">
          <AlertCircle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          <span className="text-[13px] font-extrabold uppercase tracking-widest">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />
        
        <div className="p-6 md:p-8 space-y-8 mt-2">
          <SectionLabel label="Informasi Dasar" shape="square" color="blue" />

          {/* Core Settings Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#F0F0F0] p-6 border-2 border-[#121212]">
            {/* Name */}
            <div className="md:col-span-2">
              <label className={labelClass}>Nama Sesi Backtest</label>
              <input
                type="text"
                placeholder="Contoh: SMC Gold Backtest Mei 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Symbol */}
            <div>
              <label className={labelClass}>Symbol / Pair</label>
              <SymbolSelect value={symbol} onChange={setSymbol} customValue={customSymbol} onCustomChange={setCustomSymbol} />
            </div>

            {/* Timeframe */}
            <div>
              <label className={labelClass}>Timeframe Utama</label>
              <TimeframeSelect value={timeframe} onChange={setTimeframe} />
            </div>

            {/* Market Type */}
            <div>
              <label className={labelClass}>Kategori Market</label>
              <MarketCategorySelect value={marketType} onChange={setMarketType} />
            </div>

            {/* Mode Source */}
            <div>
              <label className={labelClass}>Metode Input Trade</label>
              <select
                value={sourceMode}
                onChange={(e: any) => setSourceMode(e.target.value)}
                className={inputClass}
              >
                <option value="CSV">CSV IMPORT (Unggah File Strategy Tester)</option>
                <option value="WEBHOOK">WEBHOOK / AUTO ENTRY</option>
                <option value="MANUAL">MANUAL (Catat Manual)</option>
              </select>
            </div>
          </div>

          <SectionLabel label="Pengaturan Akun & Saldo" shape="circle" color="dark" />
          
          {/* Currency & Balances Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[#F0F0F0] p-6 border-2 border-[#121212]">
            {/* Initial Balance */}
            <div>
              <label className={labelClass}>Modal Awal (Initial Balance)</label>
              <input
                type="number"
                placeholder="10000"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Account Mode */}
            <div>
              <label className={`${labelClass} flex items-center gap-1`}>
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
            <div>
              <label className={labelClass}>{accountMode === 'CENT' ? 'Cent Multiplier' : 'Kurs Konversi USD ke IDR'}</label>
              <input
                type="number"
                placeholder={accountMode === 'CENT' ? '100' : '16200'}
                value={accountMode === 'CENT' ? centMultiplier : usdIdrRate}
                onChange={(e) => accountMode === 'CENT' ? setCentMultiplier(e.target.value) : setUsdIdrRate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {accountMode === 'CENT' && (
            <HelpCard title="Catatan cent account" tone="warning">
              Cent account: broker bisa menampilkan balance dalam satuan cent. Dashboard akan memberi label CENT dan menyimpan catatan multiplier agar hasil tidak dikira USD normal.
            </HelpCard>
          )}

          {/* Risk Multiples Calculator Section */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="flex items-center gap-2 text-[12px] font-extrabold text-[#121212] uppercase tracking-wider hover:text-[#1040C0] transition-colors"
            >
              <Settings className="w-4 h-4" />
              {showAdvanced ? 'Sembunyikan Pengaturan Lanjut' : 'Tampilkan Pengaturan Lanjut (Risk)'}
            </button>
          </div>

          {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border-2 border-[#121212] border-dashed p-6">
            {/* Risk Mode */}
            <div>
              <label className={labelClass}>Model Penghitungan Risiko (R)</label>
              <select
                value={riskMode}
                onChange={(e: any) => setRiskMode(e.target.value)}
                className={inputClass}
              >
                <option value="FIXED_USD">Fixed Risk USD per Trade</option>
                <option value="FIXED_PCT">Fixed Risk % dari Initial Balance</option>
                <option value="NO_R">No R Calculation (Matikan Perhitungan R)</option>
              </select>
            </div>

            {/* Risk Value */}
            <div>
              <label className={labelClass}>
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
                className={inputClass}
              />
            </div>
          </div>
          )}

          <SectionLabel label="Catatan Tambahan" shape="diamond" color="dark" />
          
          {/* Notes Section */}
          <div>
            <label className={labelClass}>Catatan / Deskripsi Strategi</label>
            <textarea
              placeholder="Tuliskan detail tentang sesi ini, misalnya rules entry (SMC, SNR, EMA cross), target RR minimum, batasan emosi, dll..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className={`${inputClass} resize-none leading-relaxed`}
            />
          </div>
        </div>

        {/* Submit Actions */}
        <div className="bg-[#F0F0F0] border-t-4 border-[#121212] p-6 flex justify-end">
          <Button
            type="submit"
            variant="blue"
            disabled={isSubmitting}
            className="w-full md:w-auto py-3 px-8 text-base"
          >
            <Save className="w-5 h-5 mr-2" />
            <span>{isSubmitting ? 'Menyimpan...' : 'Simpan & Lanjutkan'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
