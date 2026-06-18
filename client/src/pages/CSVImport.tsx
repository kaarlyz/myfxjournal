import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Play, 
  Trash2, 
  HelpCircle 
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';

export default function CSVImport() {
  const { sessions, fetchSessions, selectSession, settings, fetchSettings } = useJournalStore();

  // CSV parsing states
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{
    validTrades: any[];
    invalidTrades: any[];
    validCount: number;
    invalidCount: number;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Import destination configuration states
  const [importMode, setImportMode] = useState<'NEW' | 'REPLACE' | 'APPEND'>('NEW');
  const [existingSessionId, setExistingSessionId] = useState<string>('');
  
  // New session details state (in case importMode === 'NEW')
  const [sessionName, setSessionName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [marketType, setMarketType] = useState<'Forex' | 'Gold' | 'Crypto' | 'Index' | 'Custom'>('Forex');
  const [timeframe, setTimeframe] = useState('');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [balanceCurrency, setBalanceCurrency] = useState<'USD' | 'CENT' | 'IDR'>('USD');
  const [usdIdrRate, setUsdIdrRate] = useState('16200');
  const [riskMode, setRiskMode] = useState<'FIXED_USD' | 'FIXED_PCT' | 'NO_R'>('FIXED_USD');
  const [riskValue, setRiskValue] = useState('100');
  const [notes, setNotes] = useState('');

  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<'valid' | 'invalid'>('valid');

  useEffect(() => {
    fetchSessions();
    fetchSettings();
  }, [fetchSessions, fetchSettings]);

  // Prepopulate rate and risk parameters when global settings load
  useEffect(() => {
    if (settings) {
      setUsdIdrRate(String(settings.usdIdrRate));
      setRiskMode(settings.defaultRiskMode);
      setRiskValue(String(settings.defaultRiskValue));
    }
  }, [settings]);

  // Prepopulate active existing session option if sessions list is not empty
  useEffect(() => {
    if (sessions.length > 0 && !existingSessionId) {
      setExistingSessionId(sessions[0].id);
    }
  }, [sessions, existingSessionId]);

  // Handle Drag-and-Drop file uploads
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      processFile(droppedFiles[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFiles = e.target.files;
    if (chosenFiles && chosenFiles.length > 0) {
      processFile(chosenFiles[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      setParseError('File harus bertipe CSV (.csv)');
      return;
    }

    setFile(selectedFile);
    setParseError(null);
    setParseResult(null);
    setIsParsing(true);

    const formData = new FormData();
    formData.append('csvFile', selectedFile);

    try {
      const res = await fetch('/api/sessions/parse-csv', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal memproses parsing file CSV.');
      }

      const data = await res.json();
      setParseResult(data);
      
      // Default new session name to file name (sans extension)
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
      setSessionName(`Backtest ${baseName}`);

      // Try to guess symbol from file name (e.g. "XAUUSD_Strategy" -> XAUUSD)
      const guessSymbol = baseName.split(/[_\-\s]/)[0]?.toUpperCase();
      if (guessSymbol && guessSymbol.length >= 6 && guessSymbol.length <= 8) {
        setSymbol(guessSymbol);
      }
    } catch (err: any) {
      setParseError(err.message || 'Gagal mengupload dan memproses file CSV.');
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parseResult) return;
    setImportError(null);

    // Validation for new session details
    if (importMode === 'NEW') {
      if (!sessionName.trim()) return setImportError('Nama sesi baru wajib diisi.');
      if (!symbol.trim()) return setImportError('Symbol (misal: GBPUSD) wajib diisi.');
      if (!timeframe.trim()) return setImportError('Timeframe (misal: H1) wajib diisi.');
      if (!initialBalance || parseFloat(initialBalance) <= 0) return setImportError('Initial balance harus berupa angka positif.');
    } else {
      if (!existingSessionId) return setImportError('Pilih sesi tujuan import terlebih dahulu.');
    }

    setIsImporting(true);

    const payload = {
      importMode,
      existingSessionId: importMode !== 'NEW' ? existingSessionId : undefined,
      sessionDetails: importMode === 'NEW' ? {
        name: sessionName.trim(),
        symbol: symbol.trim().toUpperCase(),
        marketType,
        timeframe: timeframe.trim().toUpperCase(),
        initialBalance: parseFloat(initialBalance),
        balanceCurrency,
        usdIdrRate: parseFloat(usdIdrRate),
        riskMode,
        riskValue: parseFloat(riskValue || '0'),
        notes: notes.trim(),
      } : undefined,
      validTrades: parseResult.validTrades,
      invalidTrades: parseResult.invalidTrades,
    };

    try {
      const res = await fetch('/api/sessions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Gagal menyimpan hasil import.');
      }

      const data = await res.json();
      
      // Reset state and select the imported session
      setFile(null);
      setParseResult(null);
      selectSession(data.sessionId);
    } catch (err: any) {
      setImportError(err.message || 'Kesalahan saat menyimpan hasil import.');
    } finally {
      setIsImporting(false);
    }
  };

  const clearUpload = () => {
    setFile(null);
    setParseResult(null);
    setParseError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Import CSV TradingView</h1>
        <p className="text-xs text-gray-500 mt-1">
          Unggah file CSV hasil export list of trades Strategy Tester TradingView untuk diolah secara otomatis.
        </p>
      </div>

      {parseError && (
        <div className="bg-lossRed/10 border border-lossRed/20 rounded-xl p-4 text-xs font-semibold text-lossRed flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {importError && (
        <div className="bg-lossRed/10 border border-lossRed/20 rounded-xl p-4 text-xs font-semibold text-lossRed flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Step 1: Upload Zone */}
      {!parseResult && !isParsing && (
        <div 
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="glass-card rounded-2xl border-2 border-dashed border-gray-800 hover:border-accentCyan/40 p-12 text-center transition duration-300 group cursor-pointer max-w-2xl mx-auto space-y-4"
        >
          <input 
            type="file" 
            id="csv-file-input"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="csv-file-input" className="cursor-pointer block space-y-4">
            <div className="w-16 h-16 bg-gray-900/60 text-gray-400 group-hover:text-accentCyan rounded-full flex items-center justify-center mx-auto transition duration-300">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-white group-hover:text-accentCyan transition">
                Tarik & Lepas File CSV di Sini
              </h3>
              <p className="text-xs text-gray-500">
                Atau klik untuk menelusuri file dari penyimpanan lokal
              </p>
            </div>
            <div className="text-[10px] text-gray-600 bg-gray-900/30 border border-gray-850 rounded-lg p-2 max-w-sm mx-auto flex items-center space-x-1.5 justify-center">
              <FileSpreadsheet className="w-3.5 h-3.5 text-gray-500" />
              <span>Format: Trade number, Type, Date and time, Price USD...</span>
            </div>
          </label>
        </div>
      )}

      {/* Parsing progress loader */}
      {isParsing && (
        <div className="glass-card rounded-2xl border border-gray-800 p-12 text-center max-w-md mx-auto space-y-4">
          <div className="w-10 h-10 border-4 border-accentCyan border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-400 font-semibold animate-pulse">
            Membaca dan memproses struktur kolom CSV Strategy Tester...
          </p>
        </div>
      )}

      {/* Step 2: Show preview & Session configuration details */}
      {parseResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel: Preview & Audit table */}
          <div className="lg:col-span-2 space-y-6">
            {/* Visual Header Summary */}
            <div className="glass-card rounded-2xl p-5 border border-gray-800 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-accentCyan/10 text-accentCyan p-3 rounded-xl cyan-glow">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white truncate max-w-xs md:max-w-md">
                    {file?.name}
                  </h4>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase mt-0.5">
                    Hasil parsing: {parseResult.validCount} Valid • {parseResult.invalidCount} Invalid
                  </p>
                </div>
              </div>
              <button 
                onClick={clearUpload}
                className="text-xs font-semibold text-gray-500 hover:text-lossRed hover:bg-gray-800 px-3 py-1.5 rounded-lg transition"
              >
                Ganti File
              </button>
            </div>

            {/* Preview Tabs */}
            <div className="glass-card rounded-2xl border border-gray-800 overflow-hidden">
              <div className="flex border-b border-gray-800 bg-gray-900/20">
                <button
                  onClick={() => setActivePreviewTab('valid')}
                  className={`flex-1 py-3 text-xs font-bold border-b-2 flex items-center justify-center space-x-1.5 transition ${
                    activePreviewTab === 'valid'
                      ? 'border-accentEmerald text-accentEmerald bg-accentEmerald/5'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <CheckCircle className="w-4 h-4 text-accentEmerald" />
                  <span>Trade Valid ({parseResult.validCount})</span>
                </button>
                <button
                  onClick={() => setActivePreviewTab('invalid')}
                  className={`flex-1 py-3 text-xs font-bold border-b-2 flex items-center justify-center space-x-1.5 transition ${
                    activePreviewTab === 'invalid'
                      ? 'border-transparent text-gray-400 hover:text-gray-200'
                      : 'border-orange-500 text-orange-400 bg-orange-500/5'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  <span>Trade Bermasalah ({parseResult.invalidCount})</span>
                </button>
              </div>

              <div className="p-4 max-h-[400px] overflow-y-auto">
                {activePreviewTab === 'valid' ? (
                  parseResult.validCount === 0 ? (
                    <p className="text-center text-xs text-gray-500 py-8">Tidak ada trade valid.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="border-b border-gray-800 text-gray-500">
                            <th className="pb-2">No. Trade</th>
                            <th className="pb-2">Arah</th>
                            <th className="pb-2 text-right">Harga Entry</th>
                            <th className="pb-2 text-right">Harga Exit</th>
                            <th className="pb-2 text-right">PnL USD</th>
                            <th className="pb-2 text-right">PnL %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parseResult.validTrades.slice(0, 30).map((t: any) => (
                            <tr key={t.tradeNumber} className="border-b border-gray-900/60 py-1 text-gray-300 hover:bg-gray-800/20">
                              <td className="py-1.5 font-semibold">#{t.tradeNumber}</td>
                              <td className="py-1.5">
                                <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                  t.side === 'LONG' ? 'bg-accentCyan/10 text-accentCyan' : 'bg-orange-500/10 text-orange-400'
                                }`}>
                                  {t.side}
                                </span>
                              </td>
                              <td className="py-1.5 text-right font-medium">{t.entryPrice.toLocaleString()}</td>
                              <td className="py-1.5 text-right font-medium">{t.exitPrice.toLocaleString()}</td>
                              <td className={`py-1.5 text-right font-bold ${t.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'}`}>
                                {t.netPnlUsd >= 0 ? '+' : ''}{t.netPnlUsd.toFixed(2)}
                              </td>
                              <td className={`py-1.5 text-right font-semibold ${t.netPnlUsd >= 0 ? 'text-accentEmerald' : 'text-lossRed'}`}>
                                {t.netPnlPct.toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parseResult.validCount > 30 && (
                        <p className="text-center text-[10px] text-gray-600 italic mt-3">
                          Hanya menampilkan 30 trade teratas di kolom preview.
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  parseResult.invalidCount === 0 ? (
                    <p className="text-center text-xs text-gray-500 py-8">Semua trade terbaca lengkap!</p>
                  ) : (
                    <div className="space-y-3">
                      {parseResult.invalidTrades.map((it: any, index: number) => (
                        <div key={index} className="bg-orange-500/5 border border-orange-500/10 rounded-xl p-3.5 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-orange-400">Trade #{it.tradeNumber || 'Tidak Diketahui'}</span>
                            <span className="text-[10px] text-gray-500 font-medium bg-gray-900 border border-gray-850 px-2 py-0.5 rounded">
                              Invalid Row
                            </span>
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed font-medium">
                            <span className="text-gray-500">Alasan:</span> {it.reason}
                          </p>
                          <div className="text-[10px] text-gray-600 bg-black/30 p-2 rounded border border-gray-900 font-mono overflow-x-auto truncate">
                            {JSON.stringify(it.rawRows)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Right panel: Destination Session Form settings */}
          <div className="space-y-6">
            <div className="glass-card rounded-2xl border border-gray-800 p-5 space-y-5">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Tujuan Jurnal</h3>

              {/* Destination Mode */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Tindakan</label>
                <select
                  value={importMode}
                  onChange={(e: any) => setImportMode(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                >
                  <option value="NEW">Buat Sesi Backtest Baru</option>
                  {sessions.length > 0 && (
                    <>
                      <option value="REPLACE">Tumpuk / Ganti Sesi Terpilih</option>
                      <option value="APPEND">Tambahkan ke Sesi Terpilih</option>
                    </>
                  )}
                </select>
              </div>

              {/* Choose Existing Session */}
              {importMode !== 'NEW' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Pilih Sesi Terdaftar</label>
                  <select
                    value={existingSessionId}
                    onChange={(e) => setExistingSessionId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
                    ))}
                  </select>
                  {importMode === 'REPLACE' && (
                    <div className="bg-lossRed/10 border border-lossRed/20 text-lossRed p-3 rounded-lg text-[10px] font-semibold leading-relaxed flex items-start space-x-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>PERINGATAN: Opsi ini akan menghapus permanen semua data trade lama di sesi terpilih sebelum mengunggah.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Session Settings form (only visible if NEW session is selected) */}
              {importMode === 'NEW' && (
                <div className="space-y-4 border-t border-gray-850 pt-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Nama Sesi Baru</label>
                    <input
                      type="text"
                      placeholder="Simpan dengan nama..."
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                    />
                  </div>

                  {/* Symbol & Timeframe */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Symbol</label>
                      <input
                        type="text"
                        placeholder="GBPUSD"
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Timeframe</label>
                      <input
                        type="text"
                        placeholder="H1"
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                      />
                    </div>
                  </div>

                  {/* Balance details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Modal Awal</label>
                      <input
                        type="number"
                        value={initialBalance}
                        onChange={(e) => setInitialBalance(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Kategori Market</label>
                      <select
                        value={marketType}
                        onChange={(e: any) => setMarketType(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                      >
                        <option value="Forex">Forex</option>
                        <option value="Gold">Gold</option>
                        <option value="Crypto">Crypto</option>
                        <option value="Index">Index</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                  </div>

                  {/* Risk Parameters */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Model Resiko (R)</label>
                    <select
                      value={riskMode}
                      onChange={(e: any) => setRiskMode(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                    >
                      <option value="FIXED_USD">Fixed Risk USD per Trade</option>
                      <option value="FIXED_PCT">Fixed Risk % dari Initial Balance</option>
                      <option value="NO_R">No R Calculation</option>
                    </select>
                  </div>

                  {riskMode !== 'NO_R' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">
                        Nilai Resiko ({riskMode === 'FIXED_USD' ? 'USD' : '%'})
                      </label>
                      <input
                        type="number"
                        value={riskValue}
                        onChange={(e) => setRiskValue(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                      />
                    </div>
                  )}

                  {/* Currency converter */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Mata Uang Sesi</label>
                      <select
                        value={balanceCurrency}
                        onChange={(e: any) => setBalanceCurrency(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                      >
                        <option value="USD">USD</option>
                        <option value="CENT">CENT (Cents)</option>
                        <option value="IDR">IDR</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Kurs USD ke IDR</label>
                      <input
                        type="number"
                        value={usdIdrRate}
                        onChange={(e) => setUsdIdrRate(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg p-2.5 text-xs text-gray-200 font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Commit Action trigger */}
              <button
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="w-full py-3 bg-gradient-to-r from-accentCyan to-accentBlue hover:from-accentCyan/90 hover:to-accentBlue/90 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 cyan-glow transition disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                <span>{isImporting ? 'Mengimpor Data...' : 'Konfirmasi Import'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
