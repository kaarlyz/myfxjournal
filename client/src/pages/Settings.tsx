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
import { Input, Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';

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
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader 
        label="Configuration"
        title="Pengaturan Aplikasi"
        subtitle="Atur parameter default untuk backtest journal Anda, termasuk kurs USD/IDR dan mode risk management."
        labelColor="dark"
      />

      {message && (
        <div className={`p-4 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center gap-3 mb-6 ${
          message.type === 'success' 
            ? 'bg-[var(--profit-dim)] text-[var(--profit)]' 
            : 'bg-[var(--loss-dim)] text-[var(--loss)]'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-6 h-6 shrink-0" strokeWidth={2.5} /> : <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />}
          <span className="text-[13px] font-extrabold uppercase tracking-widest">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Columns: Config Form */}
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleSave} className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] relative">
            <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />
            <SectionLabel label="General Defaults" shape="circle" color="blue" className="mb-6 mt-2" />

            <div className="space-y-6 bg-[#F0F0F0] p-5 border-2 border-[#121212]">
              {/* USD IDR Exchange Rate */}
              <div>
                <Input
                  label="Kurs USD ke IDR Manual"
                  type="number"
                  value={usdIdrRate}
                  onChange={(e) => setUsdIdrRate(e.target.value)}
                  hint="Nilai ini akan digunakan saat menghitung PnL dalam mata uang Rupiah (IDR)."
                />
              </div>

              {/* Risk Mode and Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Model Resiko Bawaan (R)"
                  value={defaultRiskMode}
                  onChange={(e: any) => setDefaultRiskMode(e.target.value)}
                >
                  <option value="FIXED_USD">Fixed USD per Trade</option>
                  <option value="FIXED_PCT">Fixed % dari Initial Balance</option>
                  <option value="NO_R">No R Calculation</option>
                </Select>

                <Input
                  label={`Nilai Resiko Bawaan (${defaultRiskMode === 'FIXED_USD' ? 'USD' : '%'})`}
                  type="number"
                  disabled={defaultRiskMode === 'NO_R'}
                  value={defaultRiskMode === 'NO_R' ? '' : defaultRiskValue}
                  onChange={(e) => setDefaultRiskValue(e.target.value)}
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-6">
              <Button
                type="submit"
                variant="blue"
                disabled={isSaving}
                className="w-full md:w-auto py-3 px-8"
              >
                <Save className="w-5 h-5 mr-2" />
                {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
              </Button>
            </div>
          </form>
        </div>

        {/* Right Column: Database Tools & Resets */}
        <div className="space-y-8">
          {/* Seed Data Tool - development only */}
          {((import.meta as any).env?.DEV) && (
            <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] border-l-8 border-l-[var(--profit)]">
              <SectionLabel label="Seeder Data Demo" shape="square" color="dark" className="mb-3" />
              <p className="text-[12px] font-bold text-[#717182] mb-5">
                Isi database SQLite Anda dengan sesi backtest dan trade simulasi (Wins, Losses, Webhooks) secara instan.
              </p>
              <Button
                variant="secondary"
                onClick={handleSeedDemo}
                fullWidth
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Jalankan Seeder Demo
              </Button>
            </div>
          )}

          {/* Hard Reset database */}
          <div className="bg-[#F0F0F0] border-4 border-[#121212] p-5 shadow-[6px_6px_0px_0px_#121212] relative overflow-hidden">
            <div className="absolute top-0 left-0 bottom-0 w-2 bg-[var(--loss)]" />
            <div className="ml-3">
              <SectionLabel label="Zona Bahaya (Hard Reset)" shape="diamond" color="red" className="mb-3" />
              <p className="text-[12px] font-bold text-[#717182] mb-5">
                Tindakan ini akan <span className="text-[var(--loss)] font-black uppercase">menghapus semua sesi</span> backtest, riwayat trade, webhook, dan logs dari database SQLite secara permanen.
              </p>

              <div className="space-y-3 p-4 bg-white border-2 border-[#121212] mb-5">
                <label className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest block">
                  Ketik <span className="text-[var(--loss)] bg-[var(--loss-dim)] px-1 border border-[var(--loss)]">"HAPUS"</span> untuk mengonfirmasi:
                </label>
                <Input
                  type="text"
                  value={resetConfirmInput}
                  onChange={(e) => setResetConfirmInput(e.target.value)}
                  placeholder="Ketik HAPUS..."
                  className="font-black tracking-widest text-center uppercase"
                />
              </div>

              <Button
                variant="danger"
                onClick={handleHardReset}
                disabled={resetConfirmInput !== 'HAPUS' || isResetting}
                fullWidth
                className="py-3"
              >
                <Trash2 className="w-5 h-5 mr-2" />
                {isResetting ? 'Mereset...' : 'Wipe Database Permanen'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
