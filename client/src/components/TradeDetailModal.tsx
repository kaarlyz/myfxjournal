import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, Tag, FileText, Image as ImageIcon, CheckCircle, TrendingUp } from 'lucide-react';
import { Trade } from '../shared/types';
import {
  formatUsd,
  formatR,
  formatDate,
  formatDuration
} from '../utils/formatters';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { SectionLabel } from './ui/SectionLabel';

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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Black backdrop overlay */}
      <div
        className="fixed inset-0 bg-[#121212]/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Card content (Bottom sheet on mobile, centered modal on tablet/desktop) */}
      <div className="relative w-full max-w-3xl bg-white border-t-4 sm:border-4 border-[#121212] flex flex-col max-h-[92vh] sm:max-h-[90vh] z-10 animate-fade-in shadow-[0px_-4px_20px_rgba(0,0,0,0.2)] sm:shadow-[12px_12px_0px_0px_#121212] rounded-t-xl sm:rounded-none">
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-[#1040C0] rounded-t-xl sm:rounded-none" />

        {/* Header */}
        <div className="p-4 sm:p-6 border-b-2 sm:border-b-4 border-[#121212] flex justify-between items-center bg-[#F0F0F0] rounded-t-xl sm:rounded-none">
          <div className="min-w-0 flex-1 pr-2">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg sm:text-2xl font-extrabold text-[#121212] tracking-tight font-display truncate">
                Detail Trade {trade.status === 'OPEN' ? '(Active)' : `#${trade.tradeNumber || '-'}`}
              </h2>
              {trade.status === 'OPEN' ? (
                <Badge variant="blue" className="animate-pulse">OPEN</Badge>
              ) : (
                <Badge variant={trade.result === 'WIN' ? 'profit' : trade.result === 'LOSS' ? 'loss' : 'neutral'}>
                  {trade.result}
                </Badge>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-[#717182] font-bold uppercase tracking-widest truncate">
              Symbol: <span className="text-[#121212]">{trade.symbol}</span> • TF: <span className="text-[#121212]">{trade.timeframe}</span> • Sumber: <span className="text-[#121212]">{trade.source}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 border-2 border-[#121212] bg-white flex items-center justify-center text-[#121212] hover:bg-[#E0E0E0] shadow-[2px_2px_0px_0px_#121212] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all shrink-0"
            aria-label="Tutup Detail Trade"
          >
            <X className="w-5 h-5 font-bold" strokeWidth={3} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border-2 border-emerald-500 text-emerald-900 text-xs font-bold flex items-center gap-2 shadow-[2px_2px_0px_0px_#059669]">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>✓ Catatan dan screenshot trade berhasil disimpan!</span>
            </div>
          )}

          {/* Main Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <span className="text-[10px] font-bold text-[#717182] uppercase tracking-wider block mb-1">Symbol / TF</span>
              <span className="text-lg font-extrabold text-[#121212] font-display">{trade.symbol} <span className="text-[#717182] font-semibold text-sm">/ {trade.timeframe}</span></span>
            </div>
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <span className="text-[10px] font-bold text-[#717182] uppercase tracking-wider block mb-1">Arah Posisi</span>
              <span className={`text-lg font-extrabold font-display ${trade.side === 'LONG' ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                {trade.side}
              </span>
            </div>
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <span className="text-[10px] font-bold text-[#717182] uppercase tracking-wider block mb-1">Volume (Qty)</span>
              <span className="text-lg font-extrabold text-[#121212] font-number">{trade.qty ? trade.qty.toLocaleString() : '-'}</span>
            </div>
            <div className="bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212]">
              <span className="text-[10px] font-bold text-[#717182] uppercase tracking-wider block mb-1">Realized PnL</span>
              <span className={`text-lg font-extrabold font-number ${
                (trade.netPnlUsd || 0) >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'
              }`}>
                {trade.status === 'OPEN' ? 'Running' : formatUsd(trade.netPnlUsd)}
              </span>
            </div>
          </div>

          {/* Pricing and Excursions Split Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Execution Details */}
            <div className="space-y-4">
              <SectionLabel label="Rincian Eksekusi" shape="circle" color="blue" icon={<Calendar className="w-4 h-4" />} />
              <div className="bg-white border-2 border-[#121212] p-5 space-y-3 font-[Outfit] text-[13px]">
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Harga Masuk</span>
                  <span className="font-extrabold text-[#121212] font-number">{trade.entryPrice ? trade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Harga Keluar</span>
                  <span className="font-extrabold text-[#121212] font-number">{trade.exitPrice ? trade.exitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Belum Keluar'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Stop Loss (SL)</span>
                  <span className="font-extrabold text-[#121212] font-number">{trade.slPrice ? trade.slPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span className="text-[#717182] text-xs font-normal">Reconstructed</span>}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Take Profit (TP)</span>
                  <span className="font-extrabold text-[#121212] font-number">{trade.tpPrice ? trade.tpPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : <span className="text-[#717182] text-xs font-normal">Reconstructed</span>}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Tipe SL/TP</span>
                  <span>
                    {trade.slPrice && trade.tpPrice ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[11px] font-bold">
                        Actual SL/TP
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 border border-gray-300 rounded text-[11px] font-semibold">
                        Reconstructed
                      </span>
                    )}
                  </span>
                </div>
                {trade.entryPrice && trade.slPrice && trade.tpPrice && (
                  <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                    <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Actual RR</span>
                    <span className="font-extrabold text-[#121212] font-number">
                      1 : {(() => {
                        const isLong = trade.side === 'LONG';
                        const risk = isLong ? trade.entryPrice - trade.slPrice : trade.slPrice - trade.entryPrice;
                        const reward = isLong ? trade.tpPrice - trade.entryPrice : trade.entryPrice - trade.tpPrice;
                        return (risk > 0 && reward > 0) ? (reward / risk).toFixed(2) : '-';
                      })()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Tanggal Masuk</span>
                  <span className="font-bold text-[#121212]">{trade.entryTime ? formatDate(trade.entryTime) : '-'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Tanggal Keluar</span>
                  <span className="font-bold text-[#121212]">{trade.exitTime ? formatDate(trade.exitTime) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Durasi Hold</span>
                  <span className="font-bold text-[#121212]">{trade.status === 'OPEN' ? '-' : formatDuration(durationMs)}</span>
                </div>
              </div>
            </div>

            {/* Strategy / Stats details */}
            <div className="space-y-4">
              <SectionLabel label="Excursion & Multiple" shape="diamond" color="yellow" icon={<TrendingUp className="w-4 h-4" />} />
              <div className="bg-white border-2 border-[#121212] p-5 space-y-3 font-[Outfit] text-[13px]">
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">R-Multiple</span>
                  <span className={`font-extrabold font-number text-[15px] ${trade.rMultiple !== null && trade.rMultiple !== undefined ? (trade.rMultiple >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]') : 'text-[#121212]'}`}>
                    {trade.rMultiple !== null && trade.rMultiple !== undefined ? formatR(trade.rMultiple) : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Risk USD</span>
                  <span className="font-extrabold text-[#121212] font-number">{trade.riskUsd ? formatUsd(trade.riskUsd) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[var(--profit)] font-bold uppercase tracking-wider text-[10px]">MFE (Float Profit)</span>
                  <span className="font-extrabold text-[var(--profit)] font-number">{trade.favorableExcursionUsd ? formatUsd(trade.favorableExcursionUsd) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b-2 border-dashed border-[#121212]/20">
                  <span className="text-[var(--loss)] font-bold uppercase tracking-wider text-[10px]">MAE (Float Loss)</span>
                  <span className="font-extrabold text-[var(--loss)] font-number">{trade.adverseExcursionUsd ? formatUsd(trade.adverseExcursionUsd) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#717182] font-bold uppercase tracking-wider text-[10px]">Nilai Posisi</span>
                  <span className="font-bold text-[#121212] font-number">{trade.positionValue ? formatUsd(trade.positionValue) : '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form input sections */}
          <div className="space-y-6 pt-6 border-t-4 border-[#121212] border-dashed">
            <SectionLabel label="Jurnal Tambahan User" shape="square" color="dark" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Setup Tag */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#121212] uppercase tracking-wider flex items-center space-x-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Setup Tag / Kategori</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: SNR Breakout, Pullback..."
                  value={setupTag}
                  onChange={(e) => setSetupTag(e.target.value)}
                  className="input font-bold"
                />
              </div>

              {/* Screenshot URL */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#121212] uppercase tracking-wider flex items-center space-x-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>URL Gambar / Screenshot</span>
                </label>
                <input
                  type="text"
                  placeholder="https://tradingview.com/x/..."
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  className="input font-bold"
                />
              </div>
            </div>

            {/* Notes Textarea */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-[#121212] uppercase tracking-wider flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>Catatan & Analisis Jurnal</span>
              </label>
              <textarea
                placeholder="Tuliskan analisis mengapa mengambil trade ini, evaluasi psikologi, kesalahan eksekusi, dll..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full bg-white border-2 border-[#121212] focus:shadow-[4px_4px_0px_0px_#1040C0] outline-none p-3 text-[13px] text-[#121212] font-semibold leading-relaxed resize-none transition-all font-[Outfit]"
              />
            </div>

            {/* Preview Screenshot Image if exists */}
            {screenshotUrl.trim() && (
              <div className="space-y-3 bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
                <span className="text-[11px] font-bold text-[#121212] uppercase tracking-wider">Preview Gambar:</span>
                <div className="relative aspect-video max-h-64 overflow-hidden border-2 border-[#121212] flex items-center justify-center bg-[#F0F0F0]">
                  <img
                    src={screenshotUrl}
                    alt="Trade Screenshot Preview"
                    className="max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const parent = (e.target as HTMLElement).parentElement;
                      if (parent) {
                        const errText = document.createElement('div');
                        errText.className = 'text-[11px] font-bold uppercase tracking-wider text-[var(--loss)] flex items-center space-x-1';
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
        <div className="p-6 border-t-4 border-[#121212] bg-[#F0F0F0] flex justify-between items-center">
          <div className="flex items-center text-[13px]">
            {saveSuccess && (
              <span className="text-[var(--profit)] flex items-center space-x-1.5 font-bold uppercase tracking-wider">
                <CheckCircle className="w-5 h-5" strokeWidth={3} />
                <span>Berhasil disimpan!</span>
              </span>
            )}
          </div>

          <div className="flex space-x-3">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button
              variant="blue"
              onClick={handleSave}
              disabled={isSaving}
              isLoading={isSaving}
            >
              <Save className="w-4 h-4" />
              <span>Simpan Jurnal</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
