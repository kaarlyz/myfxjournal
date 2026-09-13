import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, CheckCircle, FileSpreadsheet, UploadCloud,
  AlertTriangle, Check, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatNumber, formatPercent, formatUsd } from '../utils/formatters';
import { PageGuide } from '../components/help/HelpSystem';
import { Button } from '../components/ui/Button';

interface DropzoneProps {
  label: string;
  sublabel: string;
  badge: string;
  accept: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  icon: React.ElementType;
  required?: boolean;
}

function MT5Dropzone({
  label,
  sublabel,
  badge,
  accept,
  file,
  onFileSelect,
  icon: Icon,
  required,
}: DropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      onFileSelect(droppedFile);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onFileSelect(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />

      {file ? (
        <div className="bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] p-5 rounded-lg flex flex-col justify-between min-h-[170px] relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-md border-2 border-[#121212] bg-[#E7F9F0] text-[#059669] flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#121212]">
                <Icon className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-black uppercase tracking-wider px-1.5 py-0.5 bg-[#121212] text-white rounded">
                    {badge}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#059669] bg-[#E7F9F0] px-2 py-0.5 border border-[#059669] rounded-full inline-flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" /> Siap di-parse
                  </span>
                  {required && (
                    <span className="text-[9px] font-bold text-[#DC2626] uppercase">
                      *Wajib
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-extrabold text-[#121212] truncate mt-1.5" title={file.name}>
                  {file.name}
                </h3>
                <p className="text-[11px] font-mono text-[#717182] font-semibold mt-0.5">
                  {formatFileSize(file.size)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onFileSelect(null)}
              className="p-1.5 text-[#717182] hover:text-[#DC2626] hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded transition-colors cursor-pointer"
              title="Hapus file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#121212]/10 text-xs">
            <span className="text-[11px] font-bold text-[#717182]">{label}</span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#1040C0] hover:bg-blue-50 border border-[#1040C0] rounded shadow-[1px_1px_0px_0px_#1040C0] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
            >
              Ganti File
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`group cursor-pointer rounded-lg border-2 border-dashed transition-all p-5 flex flex-col items-center justify-center text-center min-h-[170px] ${
            isDragOver
              ? 'border-[#1040C0] bg-blue-50/50 scale-[0.99]'
              : 'border-[#121212]/30 bg-white hover:border-[#121212] hover:bg-slate-50 shadow-[2px_2px_0px_0px_#121212]/5 hover:shadow-[3px_3px_0px_0px_#121212]'
          }`}
        >
          <div className="w-11 h-11 rounded-md border-2 border-[#121212] bg-[#F0F0F0] text-[#121212] flex items-center justify-center mb-2.5 shadow-[2px_2px_0px_0px_#121212] group-hover:bg-[#1040C0] group-hover:text-white transition-colors">
            <UploadCloud className="w-5 h-5" strokeWidth={2.2} />
          </div>

          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-black text-[#121212] uppercase tracking-wide">
              {label}
            </span>
            <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 bg-slate-100 border border-[#121212]/20 rounded text-[#121212]">
              {badge}
            </span>
          </div>

          <p className="text-xs font-bold text-[#1040C0] group-hover:underline">
            Klik untuk memilih file atau seret file ke sini
          </p>
          <p className="text-[11px] font-medium text-[#717182] mt-0.5">
            {sublabel}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MT5ReportImport() {
  const navigate = useNavigate();
  const { fetchSessions, selectSession } = useJournalStore();
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [graphFile, setGraphFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [success, setSuccess] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const buildForm = () => {
    const fd = new FormData();
    if (reportFile) fd.append('reportFile', reportFile);
    if (graphFile) fd.append('graphFile', graphFile);
    return fd;
  };

  const parsePreview = async () => {
    if (!reportFile) return setError('Upload report MT5 .xlsx terlebih dahulu.');
    setLoading(true);
    setError(null);
    setPreview(null);
    setDebugInfo(null);
    try {
      const res = await fetch('/api/mt5-reports/preview', { method: 'POST', body: buildForm() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal parsing report MT5.');
      setPreview(data);
      if (data.reportPreview?.parseStatus !== 'OK') {
        await loadParserDebug();
      }
    } catch (err: any) {
      setError(err.message);
      await loadParserDebug();
    } finally {
      setLoading(false);
    }
  };

  const loadParserDebug = async () => {
    if (!reportFile) return;
    try {
      const res = await fetch('/api/mt5-reports/debug-parse', { method: 'POST', body: buildForm() });
      const data = await res.json();
      if (res.ok) setDebugInfo(data);
    } catch {
      // Debug is best-effort and should not hide the primary parser error.
    }
  };

  const confirmImport = async () => {
    if (!reportFile) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mt5-reports/import', { method: 'POST', body: buildForm() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal import report MT5.');
      await fetchSessions();
      selectSession(data.sessionId);
      setSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const s = preview?.summary || success?.summary;
  const reportReady = preview?.reportPreview?.parseStatus === 'OK';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#121212] uppercase tracking-tight font-display">MT5 Strategy Tester Report Import</h1>
          <p className="text-[13px] font-bold text-[#717182] mt-1">Import report .xlsx dan tester graph UTF-16 TSV untuk membuat sesi backtest MT5.</p>
        </div>
        <PageGuide
          title="Import MT5 Strategy Tester"
          purpose="Halaman ini membaca laporan Strategy Tester MT5 agar EA bisa dinilai seperti professional backtest report."
          steps={[
            'Upload file XLSX report dari Strategy Tester MT5.',
            'Upload tester graph CSV/TSV jika tersedia untuk kurva balance/equity asli.',
            'Klik Parse Preview dan pastikan Settings/Results terdeteksi.',
            'Klik Confirm Import untuk membuat sesi backtest lengkap.'
          ]}
          outputs={[
            'XLSX memberi statistik EA, settings, results, orders, dan deals.',
            'Tester graph memberi balance/equity/deposit load curve.',
            'Analyzer akan membuat verdict, findings, daily review, dan rebuilt trades.'
          ]}
          warnings={[
            'Graph sukses tidak berarti report sukses. Panel report dan graph sengaja dipisah.',
            'Kalau Settings/Results tidak terdeteksi, import dikunci agar tidak membuat metrik palsu.'
          ]}
          nextAction="Setelah import, buka MT5 Report Analyzer dan export PDF untuk arsip evaluasi."
        />
      </div>

      {/* Collapsible Help & File Specs Accordion */}
      <div className="border-2 border-[#121212] bg-white shadow-[2px_2px_0px_0px_#121212] rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setIsHelpOpen(prev => !prev)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full border border-[#121212] bg-blue-50 text-[#1040C0] flex items-center justify-center font-black text-[11px]">
              ?
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-[#121212]">
              Panduan & Format File yang Dibutuhkan
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#717182]">
            <span>{isHelpOpen ? 'Tutup' : 'Lihat Panduan'}</span>
            {isHelpOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isHelpOpen && (
          <div className="p-4 border-t-2 border-[#121212] bg-[#F9F9F8] text-xs space-y-3 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-3 border border-[#121212] rounded">
                <div className="font-black text-[#121212] uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669]" />
                  <span>1. File Report (.xlsx)</span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold">Wajib</span>
                </div>
                <p className="text-[#717182] leading-relaxed">
                  Laporan hasil Strategy Tester MT5 dalam format spreadsheet XML / Excel (.xlsx). File ini memuat parameter EA, Settings, Results, Orders, dan Deals untuk analisis menyeluruh.
                </p>
              </div>

              <div className="bg-white p-3 border border-[#121212] rounded">
                <div className="font-black text-[#121212] uppercase tracking-wider text-[11px] flex items-center gap-1.5 mb-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-[#1040C0]" />
                  <span>2. Tester Graph (.csv / .tsv)</span>
                  <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">Opsional</span>
                </div>
                <p className="text-[#717182] leading-relaxed">
                  Data kurva grafik balance, equity, dan margin deposit load (format teks tab-separated UTF-16). Jika tidak diunggah, analyzer tetap menghitung metrik namun kurva visual terbatas.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-[#717182] font-medium">
              <span className="font-bold text-[#121212]">Langkah Cepat:</span>
              <span>1. Pilih atau seret file ke kotak di bawah</span>
              <span>•</span>
              <span>2. Klik <strong>Parse Preview</strong></span>
              <span>•</span>
              <span>3. Verifikasi hasil lalu klik <strong>Confirm Import</strong></span>
            </div>
          </div>
        )}
      </div>

      {success && (
        <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] space-y-5 animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--profit)]" />
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-[var(--profit)]" strokeWidth={3} />
            <div>
              <h2 className="text-xl font-extrabold text-[#121212] font-display uppercase tracking-wide">MT5 report imported successfully</h2>
              <p className="text-[13px] text-[var(--profit)] font-bold">{success.sessionName}</p>
            </div>
          </div>
          <SummaryGrid summary={success.summary} analysis={success.analysis} />
          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="blue" onClick={() => navigate(`/mt5-report?sessionId=${success.sessionId}`)}>
              View MT5 Report Analyzer
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/dashboard?sessionId=${success.sessionId}`)}>
              View Analysis Dashboard
            </Button>
            <Button variant="secondary" onClick={() => { setSuccess(null); setPreview(null); setReportFile(null); setGraphFile(null); }}>
              Import Another Report
            </Button>
          </div>
        </div>
      )}

      {!success && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <MT5Dropzone
              label="MT5 Strategy Tester Report"
              sublabel="Spreadsheet .xlsx dari hasil backtest MT5"
              badge=".XLSX"
              accept=".xlsx"
              file={reportFile}
              onFileSelect={(f) => { setReportFile(f); setPreview(null); }}
              icon={FileSpreadsheet}
              required
            />
            <MT5Dropzone
              label="Tester Graph Curve"
              sublabel="Opsional, file .csv / .txt UTF-16 tab-separated"
              badge=".CSV / .TSV"
              accept=".csv,.txt"
              file={graphFile}
              onFileSelect={(f) => { setGraphFile(f); setPreview(null); }}
              icon={BarChart3}
            />
          </div>

          {error && (
            <div className="bg-[var(--loss-dim)] border-2 border-[var(--loss)] p-4 text-[13px] font-bold text-[#121212] flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 shrink-0 text-[var(--loss)]" strokeWidth={3} />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-4 pt-2">
            <Button disabled={loading || !reportFile} isLoading={loading} onClick={parsePreview} variant="secondary">
              <UploadCloud className="w-4 h-4 mr-2" /> {loading ? 'Processing...' : 'Parse Preview'}
            </Button>
            {preview && (
              <Button disabled={loading || !reportReady} isLoading={loading && reportReady} onClick={confirmImport} variant="blue">
                Confirm Import
              </Button>
            )}
          </div>

          {preview && (
            <div className="space-y-6 mt-8">
              <div className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212]">
                <h2 className="text-xl font-extrabold text-[#121212] uppercase tracking-wide font-display mb-6 border-b-4 border-[#121212] pb-4">Detected Preview</h2>
                <SummaryGrid summary={s} analysis={preview.analysis} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="bg-[#F0F0F0] border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 w-2 bg-[#121212]" />
                  <div className="flex items-center justify-between mb-5 ml-4">
                    <h2 className="text-[15px] font-extrabold text-[#121212] uppercase tracking-wide">Strategy Tester Report</h2>
                    <StatusPill status={preview.reportPreview?.parseStatus} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs ml-4">
                    <InfoBox label="Settings detected" value={preview.reportPreview?.settingsDetected ? 'Yes' : 'No'} />
                    <InfoBox label="Results detected" value={preview.reportPreview?.resultsDetected ? 'Yes' : 'No'} />
                    <InfoBox label="Orders" value={preview.reportPreview?.ordersCount ?? 0} />
                    <InfoBox label="Deals" value={preview.reportPreview?.dealsCount ?? 0} />
                    <InfoBox label="EA" value={preview.reportPreview?.expertName || '-'} />
                    <InfoBox label="Symbol/TF" value={`${preview.reportPreview?.symbol || '-'} · ${preview.reportPreview?.timeframe || '-'}`} />
                    <InfoBox label="Net profit" value={moneyOrDash(preview.reportPreview?.netProfit)} />
                    <InfoBox label="Profit factor" value={numberOrDash(preview.reportPreview?.profitFactor, 4)} />
                    <InfoBox label="Total trades" value={preview.reportPreview?.totalTrades ?? '-'} />
                  </div>
                  {!!preview.reportPreview?.warnings?.length && (
                    <p className="mt-4 text-[11px] font-bold text-[var(--warning)] bg-[var(--warning-dim)] p-2 border-2 border-[var(--warning)] ml-4">{preview.reportPreview.warnings.join(' ')}</p>
                  )}
                  {!reportReady && (
                    <p className="mt-4 text-[11px] font-bold text-[var(--loss)] bg-[var(--loss-dim)] p-2 border-2 border-[var(--loss)] ml-4">
                      Strategy Tester report metrics were not detected. Confirm Import is disabled.
                    </p>
                  )}
                </div>

                <div className="bg-[#F0F0F0] border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] relative overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 w-2 bg-[#121212]" />
                  <div className="flex items-center justify-between mb-5 ml-4">
                    <h2 className="text-[15px] font-extrabold text-[#121212] uppercase tracking-wide">Tester Graph</h2>
                    <StatusPill status={preview.graphPreview?.parseStatus} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs ml-4">
                    <InfoBox label="Graph points" value={preview.graphPreview?.points ?? 0} />
                    <InfoBox label="First timestamp" value={dateOrDash(preview.graphPreview?.firstTimestamp)} />
                    <InfoBox label="Last timestamp" value={dateOrDash(preview.graphPreview?.lastTimestamp)} />
                    <InfoBox label="Min balance" value={moneyOrDash(preview.graphPreview?.minBalance)} />
                    <InfoBox label="Max balance" value={moneyOrDash(preview.graphPreview?.maxBalance)} />
                    <InfoBox label="Min equity" value={moneyOrDash(preview.graphPreview?.minEquity)} />
                    <InfoBox label="Max equity" value={moneyOrDash(preview.graphPreview?.maxEquity)} />
                    <InfoBox label="Max deposit load" value={percentOrDash(preview.graphPreview?.maxDepositLoad)} />
                  </div>
                </div>
              </div>
              {debugInfo && <ParserDebugPanel debug={debugInfo} />}
            </div>
          )}
          {!preview && debugInfo && <ParserDebugPanel debug={debugInfo} />}
        </>
      )}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
      <div className="text-[#717182] font-bold uppercase tracking-wider text-[9px] mb-1">{label}</div>
      <div className="text-[#121212] font-extrabold text-[13px] font-number truncate">{value ?? '-'}</div>
    </div>
  );
}

function StatusPill({ status }: { status?: string }) {
  const ok = status === 'OK';
  const colorClass = ok ? 'bg-[var(--profit-dim)] text-[var(--profit)] border-[var(--profit)]' : status === 'INCOMPLETE' ? 'bg-[var(--loss-dim)] text-[var(--loss)] border-[var(--loss)]' : 'bg-[#F0F0F0] text-[#717182] border-[#717182]';
  return <span className={`px-2 py-0.5 border-2 text-[10px] font-extrabold uppercase tracking-widest ${colorClass}`}>{status || 'UNKNOWN'}</span>;
}

function moneyOrDash(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : formatUsd(value);
}

function numberOrDash(value: number | null | undefined, decimals = 2) {
  return value === null || value === undefined ? '-' : formatNumber(value, decimals);
}

function percentOrDash(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : formatPercent(value);
}

function dateOrDash(value: string | null | undefined) {
  return value ? String(value).slice(0, 19).replace('T', ' ') : '-';
}

function ParserDebugPanel({ debug }: { debug: any }) {
  return (
    <div className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212]">
      <div className="flex items-center justify-between mb-4 border-b-4 border-[#121212] pb-3">
        <h2 className="text-[15px] font-extrabold text-[#121212] uppercase tracking-wide font-display">Parser Debug</h2>
        <span className="text-[11px] font-bold text-[#717182] bg-[#F0F0F0] px-2 py-1 border-2 border-[#121212]/10">{debug.fileName || 'uploaded file'}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
        <InfoBox label="Buffer" value={debug.bufferLength || 0} />
        <InfoBox label="Zip" value={debug.isZip ? 'Yes' : 'No'} />
        <InfoBox label="Sheets" value={debug.sheetNames?.join(', ') || '-'} />
        <InfoBox label="Shared strings" value={debug.sharedStringsCount ?? 0} />
        <InfoBox label="Selected sheet" value={debug.selectedSheetName || '-'} />
        <InfoBox label="Worksheets" value={debug.worksheetFiles?.length ?? 0} />
        <InfoBox label="Settings row" value={debug.detectedSectionRows?.settings ?? '-'} />
        <InfoBox label="Results row" value={debug.detectedSectionRows?.results ?? '-'} />
      </div>
      {!!debug.warnings?.length && <p className="text-[11px] font-bold text-[var(--warning)] bg-[var(--warning-dim)] p-2 border-2 border-[var(--warning)] mb-4">{debug.warnings.join(' ')}</p>}
      <details className="text-[11px] font-bold text-[#717182] uppercase tracking-wider mt-4">
        <summary className="cursor-pointer text-[#121212] hover:text-[#1040C0] transition-colors p-2 bg-[#F0F0F0] inline-block border-2 border-[#121212]">Show raw parser diagnostics</summary>
        <pre className="mt-3 max-h-96 overflow-auto bg-white border-2 border-[#121212] p-4 font-mono text-[#121212] shadow-[4px_4px_0px_0px_#121212]">
          {JSON.stringify(debug, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SummaryGrid({ summary, analysis }: { summary: any; analysis?: any }) {
  const incomplete = analysis?.rating?.label === 'Incomplete';
  const items = [
    ['EA', summary?.expertName],
    ['Symbol/TF', `${summary?.symbol || '-'} · ${summary?.timeframe || '-'}`],
    ['Period', `${summary?.periodStart ? String(summary.periodStart).slice(0, 10) : '-'} -> ${summary?.periodEnd ? String(summary.periodEnd).slice(0, 10) : '-'}`],
    ['Initial Deposit', moneyOrDash(summary?.initialDeposit)],
    ['Final Balance', moneyOrDash(summary?.finalBalance ?? (summary?.initialDeposit !== undefined && summary?.totalNetProfit !== undefined ? summary.initialDeposit + summary.totalNetProfit : null))],
    ['Net Profit', moneyOrDash(summary?.totalNetProfit)],
    ['Profit Factor', numberOrDash(summary?.profitFactor, 4)],
    ['Expected Payoff', moneyOrDash(summary?.expectedPayoff)],
    ['Balance DD', `${moneyOrDash(summary?.balanceDrawdownMax)} (${percentOrDash(summary?.balanceDrawdownPct)})`],
    ['Max Equity DD', `${moneyOrDash(summary?.equityDrawdownMax)} (${percentOrDash(summary?.equityDrawdownPct)})`],
    ['Winrate', percentOrDash(summary?.winrate)],
    ['Total Trades', summary?.totalTrades ?? '-'],
    ['Deals Inserted', summary?.insertedDeals],
    ['Trades Rebuilt', summary?.reconstructedTrades],
    ['Graph Points', summary?.graphPointsImported],
    ['Findings', summary?.findingsCount],
    ['Verdict', analysis?.rating ? `${analysis.rating.label} ${incomplete ? 'N/A' : `${analysis.rating.score}/100`}` : '-'],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map(([label, value]) => <InfoBox key={label} label={String(label)} value={value} />)}
    </div>
  );
}
