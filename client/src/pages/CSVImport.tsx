import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  Play, 
  BarChart3
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatUsd, formatPercent } from '../utils/formatters';
import { formatPnL } from '../utils/numberUtils';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';
import { SymbolSelect } from '../components/forms/SymbolSelect';
import { TimeframeSelect } from '../components/forms/TimeframeSelect';
import { MarketCategorySelect } from '../components/forms/MarketCategorySelect';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';

export default function CSVImport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sessions, fetchSessions, selectSession, settings, fetchSettings } = useJournalStore();

  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{
    validTrades: any[];
    invalidTrades: any[];
    validCount: number;
    invalidCount: number;
    earliestTradeDate?: string | null;
    latestTradeDate?: string | null;
    dateSource?: string | null;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [importMode, setImportMode] = useState<'NEW' | 'REPLACE' | 'APPEND' | 'SMART_MERGE'>('NEW');
  const [existingSessionId, setExistingSessionId] = useState<string>('');
  
  const [sessionName, setSessionName] = useState('');
  const [symbol, setSymbol] = useState('XAUUSD');
  const [customSymbol, setCustomSymbol] = useState('');
  const [marketType, setMarketType] = useState('Forex');
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

  useEffect(() => {
    const sessionId = searchParams.get('sessionId');
    const mode = searchParams.get('mode') as 'NEW' | 'REPLACE' | 'APPEND' | 'SMART_MERGE' | null;
    if (sessionId) {
      setExistingSessionId(sessionId);
      setImportMode(mode && ['REPLACE', 'APPEND', 'SMART_MERGE'].includes(mode) ? mode : 'SMART_MERGE');
    }
  }, [searchParams]);

  useEffect(() => {
    if (settings) {
      setUsdIdrRate(String(settings.usdIdrRate));
      setRiskMode(settings.defaultRiskMode);
      setRiskValue(String(settings.defaultRiskValue));
    }
  }, [settings]);

  useEffect(() => {
    if (sessions.length > 0 && !existingSessionId) {
      setExistingSessionId(sessions[0].id);
    }
  }, [sessions, existingSessionId]);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) processFile(droppedFiles[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFiles = e.target.files;
    if (chosenFiles && chosenFiles.length > 0) processFile(chosenFiles[0]);
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
      
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
      setSessionName(`Backtest ${baseName}`);

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

  const [importSuccess, setImportSuccess] = useState<any | null>(null);

  const handleConfirmImport = async () => {
    if (!parseResult) return;
    setImportError(null);
    const resolvedSymbol = symbol === 'CUSTOM' ? customSymbol.trim().toUpperCase() : symbol.trim().toUpperCase();

    if (importMode === 'NEW') {
      if (!sessionName.trim()) return setImportError('Nama sesi baru wajib diisi.');
      if (!resolvedSymbol) return setImportError('Symbol wajib dipilih atau diisi.');
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
        symbol: resolvedSymbol,
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
      fileName: file?.name,
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
      await fetchSessions();
      selectSession(data.sessionId);
      setImportSuccess(data);
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
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <PageHeader 
          label="Data Import"
          title="Import CSV TradingView"
          subtitle="Unggah file CSV hasil export list of trades Strategy Tester TradingView untuk diolah secara otomatis."
          labelColor="blue"
        />
        <PageGuide
          title="Import CSV TradingView"
          purpose="Gunakan halaman ini untuk memasukkan hasil Strategy Tester TradingView ke ReplayFX agar bisa dianalisis sebagai dashboard backtest."
          steps={[
            'Upload file CSV dari tab List of Trades TradingView.',
            'Cek preview valid dan invalid trade.',
            'Pilih New Session, Replace, Append, atau Smart Merge.',
            'Klik import lalu buka dashboard analisis.'
          ]}
          outputs={[
            'Dashboard menampilkan net PnL, winrate, equity curve, calendar, dan ledger.',
            'Invalid rows disimpan sebagai referensi agar sumber error bisa dicek.'
          ]}
          warnings={[
            'Pilih Smart Merge kalau trade number TradingView reset tapi data lama ingin tetap aman.',
            'Jangan Replace kecuali memang ingin mengganti seluruh isi sesi.'
          ]}
          nextAction="Setelah import selesai, buka Analysis Dashboard untuk evaluasi performa."
        />
      </div>

      <HelpCard title="CSV vs MT5 Report" tone="neutral">
        CSV TradingView cocok untuk strategi Pine/TradingView. Untuk EA MT5, gunakan Import MT5 Report karena file XLSX berisi statistik Strategy Tester dan graph CSV berisi kurva balance/equity asli.
      </HelpCard>

      {importSuccess && (
        <div className="bg-white border-4 border-[var(--profit)] p-6 md:p-8 shadow-[8px_8px_0px_0px_var(--profit)] flex flex-col space-y-6">
          <div className="flex items-center space-x-4">
            <div className="bg-[var(--profit)] text-white p-3 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]">
              <CheckCircle className="w-8 h-8 shrink-0" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">CSV Imported Successfully</h2>
              <p className="text-[14px] text-[var(--profit)] font-bold">{importSuccess.sessionName}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Mode', value: importSuccess.mode },
              { label: 'Previous Trades', value: importSuccess.previousTradeCount ?? 0 },
              { label: 'Valid Trades', value: importSuccess.validTrades },
              { label: 'Inserted', value: importSuccess.insertedTrades },
              { label: 'Skipped', value: importSuccess.skippedDuplicates ?? 0 },
              { label: 'Invalid Rows', value: importSuccess.invalidRows },
              { label: 'Total Trades', value: importSuccess.newTotalTrades },
              { label: 'Winrate', value: importSuccess.winrate !== undefined ? formatPercent(importSuccess.winrate) : '-' },
              { label: 'Net PnL', value: importSuccess.netPnlUsd !== undefined ? formatUsd(importSuccess.netPnlUsd) : '-' },
              { label: 'Date Range', value: importSuccess.earliestTradeDate && importSuccess.latestTradeDate ? `${importSuccess.earliestTradeDate} -> ${importSuccess.latestTradeDate}` : '-' },
              { label: 'Date Source', value: importSuccess.dateSource || '-' },
            ].map(item => (
              <div key={item.label} className="bg-white border-2 border-[#121212] p-3 shadow-[4px_4px_0px_0px_#121212] flex flex-col justify-center">
                <div className="text-[10px] text-[#717182] font-extrabold uppercase tracking-widest mb-1">{item.label}</div>
                <div className="text-[14px] font-black text-[#121212] leading-none">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 pt-4 border-t-4 border-[#121212]">
            <Button variant="profit" onClick={() => { selectSession(importSuccess.sessionId); navigate(`/dashboard?sessionId=${importSuccess.sessionId}`); }}>
              <BarChart3 className="w-4 h-4 mr-2" /> View Dashboard
            </Button>
            <Button variant="secondary" onClick={() => { selectSession(importSuccess.sessionId); navigate(`/sessions`); }}>
              View Session
            </Button>
            <Button variant="secondary" onClick={() => { setImportSuccess(null); setFile(null); setParseResult(null); setParseError(null); setImportError(null); }}>
              Import Another
            </Button>
            <Link to={`/csv-import?sessionId=${importSuccess.sessionId}&history=1`} className="px-6 py-3 bg-white border-2 border-[#121212] text-[#121212] font-extrabold uppercase tracking-widest text-[12px] shadow-[4px_4px_0px_0px_#121212] hover:bg-[#F0F0F0] hover:-translate-y-0.5 transition-all">
              View History
            </Link>
          </div>
        </div>
      )}

      {parseError && (
        <div className="bg-[var(--loss)] border-4 border-[#121212] p-5 text-[14px] font-bold text-white shadow-[4px_4px_0px_0px_#121212] flex items-center space-x-3">
          <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          <span>{parseError}</span>
        </div>
      )}

      {importError && (
        <div className="bg-[var(--loss)] border-4 border-[#121212] p-5 text-[14px] font-bold text-white shadow-[4px_4px_0px_0px_#121212] flex items-center space-x-3">
          <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          <span>{importError}</span>
        </div>
      )}

      {!parseResult && !isParsing && !importSuccess && (
        <div 
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="bg-white border-4 border-dashed border-[#121212] hover:border-[#1040C0] p-16 text-center transition-colors group cursor-pointer max-w-3xl mx-auto shadow-[8px_8px_0px_0px_#121212]"
        >
          <input 
            type="file" 
            id="csv-file-input"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="csv-file-input" className="cursor-pointer block space-y-6">
            <div className="w-20 h-20 bg-[#F0F0F0] border-4 border-[#121212] text-[#121212] group-hover:bg-[#1040C0] group-hover:text-white group-hover:border-[#1040C0] shadow-[6px_6px_0px_0px_#121212] group-hover:shadow-none group-hover:translate-x-[6px] group-hover:translate-y-[6px] flex items-center justify-center mx-auto transition-all">
              <Upload className="w-10 h-10" strokeWidth={2.5} />
            </div>
            <div className="space-y-2">
              <h3 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">
                Drag & Drop CSV File Here
              </h3>
              <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wider">
                Or click to browse
              </p>
            </div>
            <div className="text-[11px] font-bold text-[#717182] uppercase tracking-wider bg-[#F0F0F0] border-2 border-[#121212] p-3 max-w-sm mx-auto flex items-center space-x-2 justify-center shadow-[4px_4px_0px_0px_#121212]">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Format: Trade number, Type, Date...</span>
            </div>
          </label>
        </div>
      )}

      {isParsing && !importSuccess && (
        <div className="bg-white border-4 border-[#121212] p-16 text-center max-w-md mx-auto space-y-6 shadow-[8px_8px_0px_0px_#121212]">
          <div className="w-12 h-12 border-4 border-[#1040C0] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[14px] font-black text-[#121212] uppercase tracking-widest animate-pulse">
            Reading CSV...
          </p>
        </div>
      )}

      {parseResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center space-x-5">
                <div className="bg-[#1040C0] text-white p-4 border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212]">
                  <FileSpreadsheet className="w-8 h-8" strokeWidth={2.5} />
                </div>
                <div>
                  <h4 className="text-[18px] font-black text-[#121212] truncate max-w-xs md:max-w-md uppercase tracking-wide">
                    {file?.name}
                  </h4>
                  <p className="text-[12px] text-[#717182] font-extrabold uppercase tracking-widest mt-1">
                    Found: <span className="text-[var(--profit)]">{parseResult.validCount} Valid</span> • <span className="text-[var(--warning)]">{parseResult.invalidCount} Invalid</span>
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={clearUpload}>
                Change File
              </Button>
            </div>

            <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] flex flex-col">
              <div className="flex border-b-4 border-[#121212] bg-[#F0F0F0]">
                <button
                  onClick={() => setActivePreviewTab('valid')}
                  className={`flex-1 py-4 text-[12px] font-black uppercase tracking-widest flex items-center justify-center space-x-2 transition-all ${
                    activePreviewTab === 'valid'
                      ? 'bg-white text-[#121212] shadow-inner border-b-4 border-b-[var(--profit)]'
                      : 'text-[#717182] hover:bg-white hover:text-[#121212]'
                  }`}
                >
                  <CheckCircle className={`w-5 h-5 ${activePreviewTab === 'valid' ? 'text-[var(--profit)]' : ''}`} />
                  <span>Valid Trades ({parseResult.validCount})</span>
                </button>
                <div className="w-1 bg-[#121212]" />
                <button
                  onClick={() => setActivePreviewTab('invalid')}
                  className={`flex-1 py-4 text-[12px] font-black uppercase tracking-widest flex items-center justify-center space-x-2 transition-all ${
                    activePreviewTab === 'invalid'
                      ? 'bg-white text-[#121212] shadow-inner border-b-4 border-b-[var(--warning)]'
                      : 'text-[#717182] hover:bg-white hover:text-[#121212]'
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 ${activePreviewTab === 'invalid' ? 'text-[var(--warning)]' : ''}`} />
                  <span>Invalid Trades ({parseResult.invalidCount})</span>
                </button>
              </div>

              <div className="max-h-[600px] overflow-y-auto custom-scrollbar p-0">
                {activePreviewTab === 'valid' ? (
                  parseResult.validCount === 0 ? (
                    <p className="text-center text-[12px] font-bold text-[#717182] uppercase tracking-widest py-12 bg-white">No valid trades found.</p>
                  ) : (
                    <div>
                      <table className="w-full text-left border-collapse font-outfit text-[13px]">
                        <thead>
                          <tr>
                            <th className="p-4 text-[10px] font-extrabold text-[#717182] uppercase tracking-widest border-b-4 border-[#121212] bg-[#F0F0F0] sticky top-0 z-10">Trade #</th>
                            <th className="p-4 text-[10px] font-extrabold text-[#717182] uppercase tracking-widest border-b-4 border-[#121212] bg-[#F0F0F0] sticky top-0 z-10">Side</th>
                            <th className="p-4 text-[10px] font-extrabold text-[#717182] uppercase tracking-widest border-b-4 border-[#121212] bg-[#F0F0F0] text-right sticky top-0 z-10">Entry</th>
                            <th className="p-4 text-[10px] font-extrabold text-[#717182] uppercase tracking-widest border-b-4 border-[#121212] bg-[#F0F0F0] text-right sticky top-0 z-10">Exit</th>
                            <th className="p-4 text-[10px] font-extrabold text-[#717182] uppercase tracking-widest border-b-4 border-[#121212] bg-[#F0F0F0] text-right sticky top-0 z-10">PnL USD</th>
                            <th className="p-4 text-[10px] font-extrabold text-[#717182] uppercase tracking-widest border-b-4 border-[#121212] bg-[#F0F0F0] text-right sticky top-0 z-10">PnL %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parseResult.validTrades.slice(0, 50).map((t: any) => (
                            <tr key={t.tradeNumber} className="border-b-2 border-[#121212]/10 hover:bg-[#F0F0F0]">
                              <td className="p-4 font-black text-[#121212] text-[14px]">#{t.tradeNumber}</td>
                              <td className="p-4">
                                <span className={`px-2 py-1 border-2 border-[#121212] text-[10px] font-black uppercase tracking-widest ${
                                  t.side === 'LONG' || t.side === 'BUY' ? 'bg-[var(--profit)] text-white' : 'bg-[var(--loss)] text-white'
                                }`}>
                                  {t.side}
                                </span>
                              </td>
                              <td className="p-4 text-right font-black text-[#121212] font-number">{t.entryPrice.toLocaleString()}</td>
                              <td className="p-4 text-right font-black text-[#121212] font-number">{t.exitPrice.toLocaleString()}</td>
                              <td className={`p-4 text-right font-black font-number text-[14px] ${t.netPnlUsd >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                                {formatPnL(t.netPnlUsd, 'USD')}
                              </td>
                              <td className={`p-4 text-right font-black font-number text-[14px] ${t.netPnlUsd >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                                {formatPercent(t.netPnlPct)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parseResult.validCount > 50 && (
                        <div className="bg-[#F0F0F0] p-4 border-t-4 border-[#121212] text-center">
                          <p className="text-[11px] font-black text-[#717182] uppercase tracking-wider">
                            Showing top 50 trades in preview.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  parseResult.invalidCount === 0 ? (
                    <p className="text-center text-[12px] font-bold text-[#717182] uppercase tracking-widest py-12 bg-white">All trades parsed perfectly!</p>
                  ) : (
                    <div className="p-6 space-y-4 bg-white">
                      {parseResult.invalidTrades.map((it: any, index: number) => (
                        <div key={index} className="bg-[#F0F0F0] border-4 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] flex flex-col space-y-3">
                          <div className="flex justify-between items-center border-b-2 border-[#121212] pb-3">
                            <span className="font-black text-[14px] text-[#121212] uppercase tracking-wide">Trade #{it.tradeNumber || '?'}</span>
                            <span className="text-[10px] text-white font-black bg-[var(--warning)] px-2 py-1 border-2 border-[#121212] uppercase tracking-widest shadow-[2px_2px_0px_0px_#121212]">
                              Invalid Row
                            </span>
                          </div>
                          <p className="text-[13px] text-[#121212] font-bold">
                            <span className="text-[#1040C0] uppercase text-[10px] tracking-widest font-black mr-2">Reason:</span> 
                            {it.reason}
                          </p>
                          <div className="text-[11px] text-[#121212] font-bold bg-white p-3 border-2 border-[#121212] font-mono overflow-x-auto shadow-inner">
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

          <div className="space-y-6">
            <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] p-6 md:p-8 space-y-8">
              <h3 className="text-[18px] font-black text-[#121212] uppercase tracking-wide border-b-4 border-[#121212] pb-4">Import Settings</h3>

              <div className="space-y-2">
                <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Action</label>
                <select
                  value={importMode}
                  onChange={(e: any) => setImportMode(e.target.value)}
                  className="w-full bg-[#F0F0F0] border-4 border-[#121212] py-3 px-4 text-[#121212] font-black uppercase tracking-wider outline-none focus:border-[#1040C0] cursor-pointer appearance-none shadow-[4px_4px_0px_0px_#121212]"
                >
                  <option value="NEW">Create New Session</option>
                  {sessions.length > 0 && (
                    <>
                      <option value="REPLACE">Replace Selected Session</option>
                      <option value="APPEND">Append to Selected Session</option>
                      <option value="SMART_MERGE">Smart Merge (Skip Duplicates)</option>
                    </>
                  )}
                </select>
              </div>

              {importMode !== 'NEW' && (
                <div className="space-y-2">
                  <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Target Session</label>
                  <select
                    value={existingSessionId}
                    onChange={(e) => setExistingSessionId(e.target.value)}
                    className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black uppercase tracking-wider outline-none focus:border-[#1040C0] cursor-pointer appearance-none shadow-[4px_4px_0px_0px_#121212]"
                  >
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
                    ))}
                  </select>
                  {importMode === 'REPLACE' && (
                    <div className="bg-[var(--loss)] border-4 border-[#121212] text-white p-4 text-[12px] font-bold mt-4 shadow-[4px_4px_0px_0px_#121212] flex gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                      <span>WARNING: This will permanently overwrite all existing trades in the selected session.</span>
                    </div>
                  )}
                  {importMode === 'SMART_MERGE' && (
                    <div className="bg-[var(--warning)] border-4 border-[#121212] text-[#121212] p-4 text-[12px] font-bold mt-4 shadow-[4px_4px_0px_0px_#121212] flex gap-3">
                      <Info className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                      <span>Smart Merge: New trades will be added. Duplicates will be skipped.</span>
                    </div>
                  )}
                </div>
              )}

              {importMode === 'NEW' && (
                <div className="space-y-6 border-t-4 border-[#121212] pt-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Session Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Breakout Strategy v1"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black outline-none focus:border-[#1040C0] shadow-[4px_4px_0px_0px_#121212]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Symbol</label>
                      <div className="border-4 border-[#121212] bg-white shadow-[4px_4px_0px_0px_#121212] focus-within:border-[#1040C0] transition-colors">
                        <SymbolSelect value={symbol} onChange={setSymbol} customValue={customSymbol} onCustomChange={setCustomSymbol} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Timeframe</label>
                      <div className="border-4 border-[#121212] bg-white shadow-[4px_4px_0px_0px_#121212] focus-within:border-[#1040C0] transition-colors">
                        <TimeframeSelect value={timeframe} onChange={setTimeframe} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Init Balance</label>
                      <input
                        type="number"
                        value={initialBalance}
                        onChange={(e) => setInitialBalance(e.target.value)}
                        className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] shadow-[4px_4px_0px_0px_#121212]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Market</label>
                      <div className="border-4 border-[#121212] bg-white shadow-[4px_4px_0px_0px_#121212] focus-within:border-[#1040C0] transition-colors">
                        <MarketCategorySelect value={marketType} onChange={setMarketType} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Risk Model</label>
                    <select
                      value={riskMode}
                      onChange={(e: any) => setRiskMode(e.target.value)}
                      className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black uppercase tracking-wider outline-none focus:border-[#1040C0] cursor-pointer appearance-none shadow-[4px_4px_0px_0px_#121212]"
                    >
                      <option value="FIXED_USD">Fixed Risk USD / Trade</option>
                      <option value="FIXED_PCT">Fixed Risk % of Init Balance</option>
                      <option value="NO_R">No R Calculation</option>
                    </select>
                  </div>

                  {riskMode !== 'NO_R' && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">
                        Risk Value ({riskMode === 'FIXED_USD' ? 'USD' : '%'})
                      </label>
                      <input
                        type="number"
                        value={riskValue}
                        onChange={(e) => setRiskValue(e.target.value)}
                        className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] shadow-[4px_4px_0px_0px_#121212]"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">Currency</label>
                      <select
                        value={balanceCurrency}
                        onChange={(e: any) => setBalanceCurrency(e.target.value)}
                        className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black uppercase tracking-wider outline-none focus:border-[#1040C0] cursor-pointer appearance-none shadow-[4px_4px_0px_0px_#121212]"
                      >
                        <option value="USD">USD</option>
                        <option value="CENT">CENT</option>
                        <option value="IDR">IDR</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest block">USD-IDR Rate</label>
                      <input
                        type="number"
                        value={usdIdrRate}
                        onChange={(e) => setUsdIdrRate(e.target.value)}
                        className="w-full bg-white border-4 border-[#121212] py-3 px-4 text-[#121212] font-black font-number outline-none focus:border-[#1040C0] shadow-[4px_4px_0px_0px_#121212]"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t-4 border-[#121212]">
                <Button
                  variant="dark"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  isLoading={isImporting}
                  fullWidth
                  className="py-4 text-[14px]"
                >
                  <Play className="w-5 h-5 mr-2" />
                  <span>Confirm Import</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
