import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Save, 
  Trash2, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw 
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';

export default function Settings() {
  const { 
    settings, 
    fetchSettings, 
    updateSettings, 
    resetDatabase, 
    seedDemo, 
    loading 
  } = useJournalStore();

  // Form states
  const [usdIdrRate, setUsdIdrRate] = useState('16200');
  const [defaultRiskMode, setDefaultRiskMode] = useState<'FIXED_USD' | 'FIXED_PCT' | 'NO_R'>('FIXED_USD');
  const [defaultRiskValue, setDefaultRiskValue] = useState('100');

  // Alert message states
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Hard Reset confirmation states
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Prepopulate form once global settings are fetched
  useEffect(() => {
    if (settings) {
      setUsdIdrRate(String(settings.usdIdrRate));
      setDefaultRiskMode(settings.defaultRiskMode);
      setDefaultRiskValue(String(settings.defaultRiskValue));
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsSaving(true);

    const success = await updateSettings({
      usdIdrRate: parseFloat(usdIdrRate),
      defaultRiskMode,
      defaultRiskValue: parseFloat(defaultRiskValue || '0'),
    });

    setIsSaving(false);

    if (success) {
      setMessage({ type: 'success', text: 'Pengaturan default berhasil disimpan.' });
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: 'error', text: 'Gagal memperbarui pengaturan.' });
    }
  };

  const handleHardReset = async () => {
    if (resetConfirmInput !== 'HAPUS') {
      alert('Konfirmasi tulisan tidak cocok. Reset dibatalkan.');
      return;
    }

    setIsResetting(true);
    const success = await resetDatabase();
    setIsResetting(false);
    setResetConfirmInput('');

    if (success) {
      alert('Database berhasil di-reset sepenuhnya ke pengaturan pabrik.');
    } else {
      alert('Gagal mereset database.');
    }
  };

  const handleSeedDemo = async () => {
    if (confirm('Fungsi ini akan menghapus semua data saat ini dan mengisi database dengan sesi backtest simulasi. Lanjutkan?')) {
      const success = await seedDemo();
      if (success) {
        alert('Database berhasil diisi dengan data demo.');
      } else {
        alert('Gagal mengisi data demo.');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Pengaturan Aplikasi</h1>
        <p className="text-xs text-[#707a8a] mt-1">
          Atur parameter default untuk backtest journal Anda, termasuk kurs USD/IDR dan mode risk management.
        </p>
      </div>

      {message && (
        <div className={`rounded-xl p-4 flex items-start space-x-3 text-xs font-semibold ${
          message.type === 'success' 
            ? 'bg-[rgba(14,203,129,0.08)] border border-accentEmerald/20 text-[#0ecb81]' 
            : 'bg-[rgba(246,70,93,0.08)] border border-[rgba(246,70,93,0.2)] text-[#f6465d]'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns: Config Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className=" rounded-xl border border-[#2b3139] p-6 space-y-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
              <SettingsIcon className="w-4 h-4 text-[#0ecb81]" />
              <span>General Defaults</span>
            </h3>

            {/* USD IDR Exchange Rate */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Kurs USD ke IDR Manual</label>
              <input
                type="number"
                value={usdIdrRate}
                onChange={(e) => setUsdIdrRate(e.target.value)}
                className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
              />
              <p className="text-[10px] text-[#707a8a]">
                Nilai ini akan digunakan saat menghitung PnL dalam mata uang Rupiah (IDR).
              </p>
            </div>

            {/* Risk Mode and Value */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Model Resiko Bawaan (R)</label>
                <select
                  value={defaultRiskMode}
                  onChange={(e: any) => setDefaultRiskMode(e.target.value)}
                  className="w-full bg-[#1e2329] border border-[#2b3139] outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                >
                  <option value="FIXED_USD">Fixed USD per Trade</option>
                  <option value="FIXED_PCT">Fixed % dari Initial Balance</option>
                  <option value="NO_R">No R Calculation</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#707a8a] uppercase block">
                  Nilai Resiko Bawaan ({defaultRiskMode === 'FIXED_USD' ? 'USD' : '%'})
                </label>
                <input
                  type="number"
                  disabled={defaultRiskMode === 'NO_R'}
                  value={defaultRiskMode === 'NO_R' ? '' : defaultRiskValue}
                  onChange={(e) => setDefaultRiskValue(e.target.value)}
                  className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-[#fcd535]/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-850">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5  transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Database Tools & Resets */}
        <div className="space-y-6">
          {/* Seed Data Tool - development only */}
          {((import.meta as any).env?.DEV) && <div className=" rounded-xl border border-[#2b3139] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
              <Database className="w-4 h-4 text-[#0ecb81]" />
              <span>Seeder Data Demo</span>
            </h3>
            <p className="text-xs text-[#929aa5] leading-relaxed">
              Isi database SQLite Anda dengan sesi backtest dan trade simulasi (Wins, Losses, Webhooks) secara instan.
            </p>
            <button
              onClick={handleSeedDemo}
              className="w-full py-2.5 bg-gradient-to-r from-accentEmerald/20 to-accentCyan/20 hover:from-accentEmerald/30 hover:to-accentCyan/30 border border-accentEmerald/30 text-[#0ecb81] hover:text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Jalankan Seeder Demo</span>
            </button>
          </div>}

          {/* Hard Reset database */}
          <div className=" rounded-xl border border-rose-500/20 p-5 space-y-4 bg-gradient-to-br from-rose-500/[0.02] to-transparent">
            <h3 className="text-xs font-extrabold text-[#f6465d] uppercase tracking-widest flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-[#f6465d]" />
              <span>Zona Bahaya (Hard Reset)</span>
            </h3>
            <p className="text-xs text-[#929aa5] leading-relaxed">
              Tindakan ini akan <span className="font-semibold text-[#f6465d]">menghapus semua sesi backtest, riwayat trade, webhook, dan logs</span> dari database SQLite secara permanen.
            </p>

            <div className="space-y-2 border-t border-gray-850 pt-3">
              <label className="text-[9px] font-bold text-[#707a8a] uppercase block">
                Ketik tulisan <span className="text-[#f6465d] font-extrabold">"HAPUS"</span> untuk mengonfirmasi:
              </label>
              <input
                type="text"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                placeholder="Ketik HAPUS..."
                className="w-full bg-[#1e2329] border border-[#2b3139] focus:border-rose-500/50 outline-none rounded-lg p-2 text-xs text-gray-200 font-semibold"
              />
            </div>

            <button
              onClick={handleHardReset}
              disabled={resetConfirmInput !== 'HAPUS' || isResetting}
              className="w-full py-2.5 bg-lossRed hover:bg-lossRed/95 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition  disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isResetting ? 'Mereset...' : 'Wipe Database Permanen'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
