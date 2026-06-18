import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, Tag, FileText, Image as ImageIcon, CheckCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { Trade } from '../shared/types';
import { 
  formatUsd, 
  formatIdr, 
  formatPercent, 
  formatR, 
  formatDate, 
  formatDuration 
} from '../utils/formatters';

interface TradeDetailModalProps {
  trade: Trade;
  onClose: () => void;
  onSave: (tradeId: string, updates: { setupTag: string; notes: string; screenshotUrl: string }) => Promise<boolean>;
}

export default function TradeDetailModal({ trade, onClose, onSave }: TradeDetailModalProps) {
  // Input fields state
  const [setupTag, setSetupTag] = useState(trade.setupTag || '');
  const [notes, setNotes] = useState(trade.notes || '');
  const [screenshotUrl, setScreenshotUrl] = useState(trade.screenshotUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    // Reset values when trade changes
    setSetupTag(trade.setupTag || '');
    setNotes(trade.notes || '');
    setScreenshotUrl(trade.screenshotUrl || '');
    setSaveSuccess(false);
  }, [trade]);

  const handleSave = async () => {
    setIsSaving(true);
    const success = await onSave(trade.id, {
      setupTag: setupTag.trim(),
      notes: notes.trim(),
      screenshotUrl: screenshotUrl.trim(),
    });
    setIsSaving(false);
    
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1000);
    }
  };

  const durationMs = trade.entryTime && trade.exitTime 
    ? new Date(trade.exitTime).getTime() - new Date(trade.entryTime).getTime() 
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Black backdrop overlay */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={onClose} 
      />

      {/* Modal Card content */}
      <div className="relative w-full max-w-3xl glass-card rounded-2xl border border-gray-800 overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/20">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Detail Trade {trade.status === 'OPEN' ? '(Active)' : `#${trade.tradeNumber || '-'}`}
              </h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                trade.status === 'OPEN' 
                  ? 'bg-accentCyan/15 text-accentCyan animate-pulse' 
                  : trade.result === 'WIN' 
                  ? 'bg-accentEmerald/15 text-accentEmerald' 
                  : trade.result === 'LOSS' 
                  ? 'bg-lossRed/15 text-lossRed' 
                  : 'bg-gray-800 text-gray-400'
              }`}>
                {trade.status === 'OPEN' ? 'OPEN' : trade.result}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ID Sesi: {trade.sessionId} • Sumber: {trade.source}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Main Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-900/35 border border-gray-800/80 rounded-xl p-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Symbol / TF</span>
              <span className="text-sm font-bold text-gray-200">{trade.symbol} / {trade.timeframe}</span>
            </div>
            <div className="bg-gray-900/35 border border-gray-800/80 rounded-xl p-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Arah Posisi</span>
              <span className={`text-sm font-extrabold ${trade.side === 'LONG' ? 'text-accentCyan' : 'text-orange-400'}`}>
                {trade.side}
              </span>
            </div>
            <div className="bg-gray-900/35 border border-gray-800/80 rounded-xl p-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Volume (Qty)</span>
              <span className="text-sm font-bold text-gray-200">{trade.qty ? trade.qty.toLocaleString() : '-'}</span>
            </div>
            <div className="bg-gray-900/35 border border-gray-800/80 rounded-xl p-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Realized PnL</span>
              <span className={`text-sm font-bold ${
                (trade.netPnlUsd || 0) >= 0 ? 'text-accentEmerald' : 'text-lossRed'
              }`}>
                {trade.status === 'OPEN' ? 'Running' : formatUsd(trade.netPnlUsd)}
              </span>
            </div>
          </div>

          {/* Pricing and Excursions Split Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Execution Details */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-accentCyan" />
                <span>Rincian Eksekusi</span>
              </h3>
              
              <div className="glass-card rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Harga Masuk</span>
                  <span className="font-semibold text-gray-300">{trade.entryPrice ? trade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Harga Keluar</span>
                  <span className="font-semibold text-gray-300">{trade.exitPrice ? trade.exitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Belum Keluar'}</span>
                </div>
                <div className="flex justify-between border-t border-gray-800/50 pt-2.5">
                  <span className="text-gray-500">Tanggal Masuk</span>
                  <span className="font-semibold text-gray-300">{trade.entryTime ? formatDate(trade.entryTime) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tanggal Keluar</span>
                  <span className="font-semibold text-gray-300">{trade.exitTime ? formatDate(trade.exitTime) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Durasi Hold</span>
                  <span className="font-semibold text-gray-300">{trade.status === 'OPEN' ? '-' : formatDuration(durationMs)}</span>
                </div>
              </div>
            </div>

            {/* Strategy / Stats details */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center space-x-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-accentEmerald" />
                <span>Excursion & Multiple</span>
              </h3>
              
              <div className="glass-card rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">R-Multiple</span>
                  <span className="font-semibold text-gray-300">
                    {trade.rMultiple !== null && trade.rMultiple !== undefined ? formatR(trade.rMultiple) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Risk USD</span>
                  <span className="font-semibold text-gray-300">{trade.riskUsd ? formatUsd(trade.riskUsd) : 'N/A'}</span>
                </div>
                <div className="flex justify-between border-t border-gray-800/50 pt-2.5">
                  <span className="text-gray-500 text-accentEmerald">MFE (Float Profit Terbesar)</span>
                  <span className="font-semibold text-accentEmerald">{trade.favorableExcursionUsd ? formatUsd(trade.favorableExcursionUsd) : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-lossRed">MAE (Float Loss Terbesar)</span>
                  <span className="font-semibold text-lossRed">{trade.adverseExcursionUsd ? formatUsd(trade.adverseExcursionUsd) : 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nilai Posisi</span>
                  <span className="font-semibold text-gray-300">{trade.positionValue ? formatUsd(trade.positionValue) : '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form input sections */}
          <div className="space-y-4 border-t border-gray-800 pt-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Jurnal Tambahan User
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Setup Tag */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center space-x-1">
                  <Tag className="w-3 h-3" />
                  <span>Setup Tag / Kategori</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: SNR Breakout, Pullback..."
                  value={setupTag}
                  onChange={(e) => setSetupTag(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-medium"
                />
              </div>

              {/* Screenshot URL */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center space-x-1">
                  <ImageIcon className="w-3 h-3" />
                  <span>URL Gambar / Screenshot</span>
                </label>
                <input
                  type="text"
                  placeholder="https://tradingview.com/x/..."
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-medium"
                />
              </div>
            </div>

            {/* Notes Textarea */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center space-x-1">
                <FileText className="w-3 h-3" />
                <span>Catatan & Analisis Jurnal</span>
              </label>
              <textarea
                placeholder="Tuliskan analisis mengapa mengambil trade ini, evaluasi psikologi, kesalahan eksekusi, dll..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-medium leading-relaxed resize-none"
              />
            </div>

            {/* Preview Screenshot Image if exists */}
            {screenshotUrl.trim() && (
              <div className="space-y-2 border border-gray-800 rounded-xl p-3 bg-gray-900/10">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Preview Gambar:</span>
                <div className="relative aspect-video max-h-48 overflow-hidden rounded-lg border border-gray-800 flex items-center justify-center bg-gray-950">
                  <img 
                    src={screenshotUrl} 
                    alt="Trade Screenshot Preview" 
                    className="max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const parent = (e.target as HTMLElement).parentElement;
                      if (parent) {
                        const errText = document.createElement('div');
                        errText.className = 'text-xs text-gray-600 flex items-center space-x-1';
                        errText.innerHTML = `<span>Gagal memuat URL gambar</span>`;
                        parent.appendChild(errText);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-800 bg-gray-900/10 flex justify-between items-center">
          <div className="flex items-center text-xs">
            {saveSuccess && (
              <span className="text-accentEmerald flex items-center space-x-1 font-semibold">
                <CheckCircle className="w-4 h-4" />
                <span>Berhasil disimpan!</span>
              </span>
            )}
          </div>

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-gray-800 text-gray-400 hover:text-white rounded-lg text-xs font-semibold hover:bg-gray-800/40 transition disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 cyan-glow transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Jurnal'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
