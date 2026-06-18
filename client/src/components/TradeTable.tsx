import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Trash2, 
  Edit3, 
  Download, 
  ExternalLink 
} from 'lucide-react';
import { Trade } from '../shared/types';
import { 
  formatUsd, 
  formatIdr, 
  formatPercent, 
  formatR, 
  formatDate, 
  formatDuration 
} from '../utils/formatters';

interface TradeTableProps {
  trades: Trade[];
  onSelectTrade: (trade: Trade) => void;
  onDeleteTrade: (tradeId: string) => void;
}

type SortField = 'date' | 'pnl' | 'r' | 'duration' | 'number';
type SortOrder = 'asc' | 'desc';

export default function TradeTable({ trades, onSelectTrade, onDeleteTrade }: TradeTableProps) {
  // Search and Filter States
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState<string>('ALL');
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterTimeframe, setFilterTimeframe] = useState<string>('ALL');
  const [filterResult, setFilterResult] = useState<string>('ALL');
  const [filterSide, setFilterSide] = useState<string>('ALL');
  const [filterSetup, setFilterSetup] = useState<string>('ALL');
  
  // Sorting States
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Unique lists for filters
  const uniqueSymbols = useMemo(() => Array.from(new Set(trades.map(t => t.symbol))), [trades]);
  const uniqueTimeframes = useMemo(() => Array.from(new Set(trades.map(t => t.timeframe))), [trades]);
  const uniqueSetups = useMemo(() => Array.from(new Set(trades.map(t => t.setupTag).filter(Boolean))), [trades]);

  // Handle sorting toggle
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // Default to descending
    }
  };

  // Filtered and Sorted Trades
  const filteredAndSortedTrades = useMemo(() => {
    let resultTrades = [...trades];

    // 1. Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      resultTrades = resultTrades.filter(
        (t) =>
          String(t.tradeNumber).includes(q) ||
          t.symbol.toLowerCase().includes(q) ||
          (t.entrySignal && t.entrySignal.toLowerCase().includes(q)) ||
          (t.exitSignal && t.exitSignal.toLowerCase().includes(q)) ||
          (t.setupTag && t.setupTag.toLowerCase().includes(q)) ||
          (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    // 2. Dropdown filters
    if (filterSource !== 'ALL') {
      resultTrades = resultTrades.filter((t) => t.source === filterSource);
    }
    if (filterSymbol !== 'ALL') {
      resultTrades = resultTrades.filter((t) => t.symbol === filterSymbol);
    }
    if (filterTimeframe !== 'ALL') {
      resultTrades = resultTrades.filter((t) => t.timeframe === filterTimeframe);
    }
    if (filterResult !== 'ALL') {
      resultTrades = resultTrades.filter((t) => t.result === filterResult);
    }
    if (filterSide !== 'ALL') {
      resultTrades = resultTrades.filter((t) => t.side === filterSide);
    }
    if (filterSetup !== 'ALL') {
      resultTrades = resultTrades.filter((t) => t.setupTag === filterSetup);
    }

    // 3. Sorting
    resultTrades.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortField === 'number') {
        valA = a.tradeNumber || 0;
        valB = b.tradeNumber || 0;
      } else if (sortField === 'date') {
        valA = a.exitTime ? new Date(a.exitTime).getTime() : (a.entryTime ? new Date(a.entryTime).getTime() : 0);
        valB = b.exitTime ? new Date(b.exitTime).getTime() : (b.entryTime ? new Date(b.entryTime).getTime() : 0);
      } else if (sortField === 'pnl') {
        valA = a.netPnlUsd || 0;
        valB = b.netPnlUsd || 0;
      } else if (sortField === 'r') {
        valA = a.rMultiple || 0;
        valB = b.rMultiple || 0;
      } else if (sortField === 'duration') {
        const durA = a.entryTime && a.exitTime ? new Date(a.exitTime).getTime() - new Date(a.entryTime).getTime() : 0;
        const durB = b.entryTime && b.exitTime ? new Date(b.exitTime).getTime() - new Date(b.entryTime).getTime() : 0;
        valA = durA;
        valB = durB;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return resultTrades;
  }, [trades, search, filterSource, filterSymbol, filterTimeframe, filterResult, filterSide, filterSetup, sortField, sortOrder]);

  // Export handlers
  const exportToCSV = () => {
    const headers = 'Trade Number,Source,Symbol,Timeframe,Side,Status,Entry Time,Exit Time,Entry Price,Exit Price,Net PnL (USD),Net PnL (%),Net PnL (IDR),R Multiple,Setup,Notes\n';
    const rows = filteredAndSortedTrades.map(t => {
      return `"${t.tradeNumber || ''}","${t.source}","${t.symbol}","${t.timeframe}","${t.side}","${t.status}","${t.entryTime || ''}","${t.exitTime || ''}","${t.entryPrice || ''}","${t.exitPrice || ''}","${t.netPnlUsd || ''}","${t.netPnlPct || ''}","${t.netPnlIdr || ''}","${t.rMultiple || ''}","${t.setupTag || ''}","${(t.notes || '').replace(/"/g, '""')}"`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ReplayFX_Trades_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    const blob = new Blob([JSON.stringify(filteredAndSortedTrades, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ReplayFX_Trades_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Search & Export Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 w-4.5 h-4.5 text-gray-500" />
          <input
            type="text"
            placeholder="Cari trade number, symbol, signal, setup, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-900/60 border border-gray-800 focus:border-accentCyan/50 outline-none rounded-lg py-2 pl-10 pr-4 text-sm text-gray-200 transition-all font-medium"
          />
        </div>

        {/* Exports */}
        <div className="flex items-center space-x-2 self-end md:self-auto">
          <button
            onClick={exportToCSV}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
            title="Ekspor ke CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            onClick={exportToJSON}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
            title="Ekspor ke JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Grid Multi-Filter Section */}
      <div className="glass-card rounded-xl p-4 border border-gray-800 grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* Source */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Sumber</label>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 outline-none rounded p-1.5 text-xs text-gray-300 font-medium"
          >
            <option value="ALL">Semua Sumber</option>
            <option value="CSV">CSV</option>
            <option value="WEBHOOK">Webhook</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        {/* Symbol */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Symbol</label>
          <select
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 outline-none rounded p-1.5 text-xs text-gray-300 font-medium"
          >
            <option value="ALL">Semua Symbol</option>
            {uniqueSymbols.map((sym) => (
              <option key={sym} value={sym}>{sym}</option>
            ))}
          </select>
        </div>

        {/* Timeframe */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Timeframe</label>
          <select
            value={filterTimeframe}
            onChange={(e) => setFilterTimeframe(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 outline-none rounded p-1.5 text-xs text-gray-300 font-medium"
          >
            <option value="ALL">Semua TF</option>
            {uniqueTimeframes.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </select>
        </div>

        {/* Result */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Hasil</label>
          <select
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 outline-none rounded p-1.5 text-xs text-gray-300 font-medium"
          >
            <option value="ALL">Semua Hasil</option>
            <option value="WIN">WIN</option>
            <option value="LOSS">LOSS</option>
            <option value="BE">BE (Break Even)</option>
          </select>
        </div>

        {/* Side */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Sisi</label>
          <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 outline-none rounded p-1.5 text-xs text-gray-300 font-medium"
          >
            <option value="ALL">Semua Arah</option>
            <option value="LONG">LONG (Beli)</option>
            <option value="SHORT">SHORT (Jual)</option>
          </select>
        </div>

        {/* Setup */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Setup Tag</label>
          <select
            value={filterSetup}
            onChange={(e) => setFilterSetup(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 outline-none rounded p-1.5 text-xs text-gray-300 font-medium"
          >
            <option value="ALL">Semua Setup</option>
            {uniqueSetups.map((s) => (
              <option key={s || ''} value={s || ''}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trade Table Ledger */}
      <div className="glass-card rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-900/40 border-b border-gray-800 text-gray-400 font-semibold select-none">
                <th 
                  onClick={() => toggleSort('number')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Trade #</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Info</th>
                <th className="py-3.5 px-4">Arah</th>
                <th 
                  onClick={() => toggleSort('date')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Waktu Exit (Lokal)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">Harga Entry / Exit</th>
                <th 
                  onClick={() => toggleSort('pnl')}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center space-x-1 justify-end">
                    <span>PnL USD</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4 text-right">PnL % / IDR</th>
                <th 
                  onClick={() => toggleSort('r')}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center space-x-1 justify-end">
                    <span>R</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort('duration')}
                  className="py-3.5 px-4 cursor-pointer hover:text-white transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Durasi</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Setup</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTrades.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-500 font-medium">
                    Tidak ditemukan data trade yang cocok dengan kriteria pencarian/filter.
                  </td>
                </tr>
              ) : (
                filteredAndSortedTrades.map((t) => {
                  const durationMs = t.entryTime && t.exitTime 
                    ? new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime() 
                    : 0;

                  return (
                    <tr 
                      key={t.id} 
                      className={`border-b border-gray-800/80 hover:bg-gray-800/25 transition cursor-pointer ${
                        t.status === 'OPEN' ? 'bg-accentCyan/5 border-l-2 border-l-accentCyan' : ''
                      }`}
                      onClick={() => onSelectTrade(t)}
                    >
                      {/* Trade Number */}
                      <td className="py-3.5 px-4 font-semibold text-gray-300">
                        {t.status === 'OPEN' ? (
                          <span className="px-1.5 py-0.5 rounded bg-accentCyan/15 text-accentCyan text-[9px] font-extrabold uppercase animate-pulse">
                            OPEN
                          </span>
                        ) : (
                          `#${t.tradeNumber || '-'}`
                        )}
                      </td>

                      {/* Info Symbol & Timeframe & Source */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-200">{t.symbol}</div>
                        <div className="flex items-center space-x-1 text-[10px] text-gray-500 mt-0.5 font-medium">
                          <span>{t.timeframe}</span>
                          <span>•</span>
                          <span className="capitalize">{t.source.toLowerCase()}</span>
                        </div>
                      </td>

                      {/* Side */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider ${
                          t.side === 'LONG' 
                            ? 'bg-accentCyan/10 text-accentCyan border border-accentCyan/20' 
                            : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        }`}>
                          {t.side}
                        </span>
                      </td>

                      {/* Exit Time */}
                      <td className="py-3.5 px-4 text-gray-400">
                        {t.exitTime ? formatDate(t.exitTime) : (t.entryTime ? `Open: ${formatDate(t.entryTime)}` : '-')}
                      </td>

                      {/* Entry & Exit Prices */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-gray-300">{formatNumber(t.entryPrice, 4)}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{t.exitPrice ? formatNumber(t.exitPrice, 4) : 'Running'}</div>
                      </td>

                      {/* Net PnL USD */}
                      <td className="py-3.5 px-4 text-right">
                        {t.status === 'OPEN' ? (
                          <span className="text-gray-500 italic text-[11px]">Running</span>
                        ) : (
                          <span className={`font-bold text-sm ${
                            (t.netPnlUsd || 0) > 0 
                              ? 'text-accentEmerald' 
                              : (t.netPnlUsd || 0) < 0 
                              ? 'text-lossRed' 
                              : 'text-gray-400'
                          }`}>
                            {(t.netPnlUsd || 0) > 0 ? '+' : ''}{formatUsd(t.netPnlUsd)}
                          </span>
                        )}
                      </td>

                      {/* Net PnL % / IDR */}
                      <td className="py-3.5 px-4 text-right">
                        {t.status === 'OPEN' ? (
                          <span className="text-gray-600">-</span>
                        ) : (
                          <>
                            <div className={`font-semibold text-[11px] ${
                              (t.netPnlUsd || 0) >= 0 ? 'text-accentEmerald' : 'text-lossRed'
                            }`}>
                              {(t.netPnlUsd || 0) > 0 ? '+' : ''}{formatPercent(t.netPnlPct)}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">{formatIdr(t.netPnlIdr)}</div>
                          </>
                        )}
                      </td>

                      {/* R-multiple */}
                      <td className="py-3.5 px-4 text-right font-bold text-gray-300">
                        {t.rMultiple !== null && t.rMultiple !== undefined ? (
                          <span className={t.rMultiple >= 0 ? 'text-accentEmerald' : 'text-lossRed'}>
                            {formatR(t.rMultiple)}
                          </span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 text-gray-400 font-medium">
                        {t.status === 'OPEN' ? '-' : formatDuration(durationMs)}
                      </td>

                      {/* Setup Tag */}
                      <td className="py-3.5 px-4">
                        {t.setupTag ? (
                          <span className="px-2 py-1 rounded bg-gray-800 text-gray-300 text-[10px] font-medium border border-gray-700">
                            {t.setupTag}
                          </span>
                        ) : (
                          <span className="text-gray-600 font-medium italic text-[11px]">Tanpa Tag</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-2">
                          {t.screenshotUrl && (
                            <a
                              href={t.screenshotUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-accentCyan rounded transition"
                              title="Lihat Screenshot"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => onSelectTrade(t)}
                            className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded transition"
                            title="Edit Catatan"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Hapus trade ini? Tindakan ini tidak dapat dibatalkan.`)) {
                                onDeleteTrade(t.id);
                              }
                            }}
                            className="p-1.5 hover:bg-gray-800 text-gray-500 hover:text-lossRed rounded transition"
                            title="Hapus Trade"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Inline helper for formatting plain numbers
function formatNumber(val: number | null | undefined, decimals = 2): string {
  if (val === undefined || val === null) return '0';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
