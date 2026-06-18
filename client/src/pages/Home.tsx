import React, { useEffect } from 'react';
import { 
  Plus, 
  Upload, 
  Activity, 
  Settings as SettingsIcon, 
  BookOpen, 
  DollarSign, 
  Trash2, 
  Play, 
  Percent, 
  Info 
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';

export default function Home() {
  const { 
    sessions, 
    fetchSessions, 
    selectSession, 
    deleteSession, 
    setTab, 
    seedDemo, 
    loading 
  } = useJournalStore();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="space-y-8">
      {/* Welcome & Quick Actions Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            ReplayFX Journal
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Catat, evaluasi, dan analisis hasil backtest strategi trading Anda secara mandiri.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setTab('create-session')}
            className="px-4 py-2.5 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 cyan-glow transition"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Sesi</span>
          </button>
          <button
            onClick={() => setTab('csv-import')}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
          >
            <Upload className="w-4 h-4 text-accentCyan" />
            <span>Import CSV</span>
          </button>
          <button
            onClick={() => setTab('webhook-monitor')}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
          >
            <Activity className="w-4 h-4 text-accentEmerald" />
            <span>Webhook</span>
          </button>
        </div>
      </div>

      {/* Main Grid View of Sessions */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-gray-500" />
          <span>Daftar Sesi Backtest Anda ({sessions.length})</span>
        </h2>

        {loading && sessions.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center text-gray-400 border border-gray-850">
            Sedang memuat data sesi...
          </div>
        ) : sessions.length === 0 ? (
          /* Empty state banner with Quick Demo Mode option */
          <div className="glass-card rounded-2xl p-8 border border-gray-800 text-center max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 bg-accentCyan/10 text-accentCyan rounded-full flex items-center justify-center mx-auto cyan-glow">
              <DollarSign className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Belum Ada Sesi Jurnal</h3>
              <p className="text-xs text-gray-400 leading-relaxed max-w-md mx-auto">
                Anda dapat membuat sesi manual baru, mengunggah file CSV Strategy Tester TradingView, atau menyetel bot webhook otomatis.
              </p>
            </div>
            
            <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-850 flex items-start space-x-3 text-left text-xs max-w-md mx-auto">
              <Info className="w-5 h-5 text-accentCyan shrink-0 mt-0.5" />
              <p className="text-gray-400 leading-relaxed">
                <span className="font-semibold text-gray-200">Mode Demo:</span> Jika ingin mencoba melihat fungsionalitas visualisasi chart dan analisis jurnal, Anda bisa mengklik tombol di bawah untuk mengisi database dengan sampel data backtest simulasi secara otomatis.
              </p>
            </div>

            <button
              onClick={async () => {
                if (confirm('Database akan diisi dengan data simulasi. Lanjutkan?')) {
                  await seedDemo();
                }
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-accentCyan/20 to-accentEmerald/20 hover:from-accentCyan/30 hover:to-accentEmerald/30 border border-accentCyan/40 text-accentCyan hover:text-white rounded-xl text-xs font-bold inline-flex items-center space-x-1.5 transition"
            >
              <Play className="w-4 h-4" />
              <span>Jalankan Demo Mode (Seed Data)</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((s) => {
              const pnlColor = s.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed';

              return (
                <div
                  key={s.id}
                  onClick={() => selectSession(s.id)}
                  className="glass-card rounded-2xl p-5 border border-gray-800/80 glass-card-hover cursor-pointer relative flex flex-col justify-between"
                >
                  {/* Top Header Card */}
                  <div>
                    <div className="flex justify-between items-start">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider ${
                        s.sourceMode === 'CSV' 
                          ? 'bg-accentCyan/15 text-accentCyan' 
                          : s.sourceMode === 'WEBHOOK' 
                          ? 'bg-accentEmerald/15 text-accentEmerald' 
                          : 'bg-orange-500/15 text-orange-400'
                      }`}>
                        {s.sourceMode}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Hapus sesi "${s.name}"? Ini akan menghapus semua trades di dalamnya.`)) {
                            await deleteSession(s.id);
                          }
                        }}
                        className="p-1 text-gray-500 hover:text-lossRed hover:bg-gray-800/60 rounded transition"
                        title="Hapus Sesi"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="font-bold text-white text-base mt-3 group-hover:text-accentCyan transition truncate">
                      {s.name}
                    </h3>

                    <div className="flex items-center space-x-2 text-xs text-gray-400 mt-1 font-medium">
                      <span>{s.symbol}</span>
                      <span>•</span>
                      <span>{s.timeframe}</span>
                      <span>•</span>
                      <span className="capitalize">{s.marketType.toLowerCase()}</span>
                    </div>
                  </div>

                  {/* Body Mini Stats */}
                  <div className="grid grid-cols-2 gap-3 border-t border-b border-gray-800/50 py-3.5 my-4 text-xs font-semibold">
                    <div>
                      <span className="text-[10px] text-gray-500 block">NET PNL</span>
                      <span className={`font-bold ${pnlColor}`}>
                        {s.netPnlUsd >= 0 ? '+' : ''}{formatUsd(s.netPnlUsd)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">WIN RATE</span>
                      <span className="text-gray-200">
                        {s.tradeCount > 0 ? formatPercent(s.winrate) : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Footer Card */}
                  <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    <span>{s.tradeCount} Trades</span>
                    {s.invalidTradeCount > 0 && (
                      <span className="text-orange-400 flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full inline-block" />
                        <span>{s.invalidTradeCount} Invalid</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
