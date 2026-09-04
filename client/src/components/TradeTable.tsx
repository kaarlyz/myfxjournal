import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  Trash2,
  Edit3,
  Download,
  ExternalLink,
  Filter,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Layers,
  LayoutList,
  Table as TableIcon
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

import { Button } from './ui/Button';
import { Select } from './ui/Input';
import { Badge } from './ui/Badge';
import { ConfirmationModal } from './ui/ConfirmationModal';

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'auto' | 'cards' | 'table'>('auto');

  // Delete modal confirmation state
  const [tradeToDelete, setTradeToDelete] = useState<Trade | null>(null);

  // Sorting States
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination / Load More state
  const [displayCount, setDisplayCount] = useState<number>(100);

  // Unique lists for filters
  const uniqueSymbols = useMemo(() => Array.from(new Set(trades.map(t => t.symbol))), [trades]);
  const uniqueTimeframes = useMemo(() => Array.from(new Set(trades.map(t => t.timeframe))), [trades]);
  const uniqueSetups = useMemo(() => Array.from(new Set(trades.map(t => t.setupTag).filter(Boolean))), [trades]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (filterSource !== 'ALL') count++;
    if (filterSymbol !== 'ALL') count++;
    if (filterTimeframe !== 'ALL') count++;
    if (filterResult !== 'ALL') count++;
    if (filterSide !== 'ALL') count++;
    if (filterSetup !== 'ALL') count++;
    return count;
  }, [search, filterSource, filterSymbol, filterTimeframe, filterResult, filterSide, filterSetup]);

  const resetAllFilters = () => {
    setSearch('');
    setFilterSource('ALL');
    setFilterSymbol('ALL');
    setFilterTimeframe('ALL');
    setFilterResult('ALL');
    setFilterSide('ALL');
    setFilterSetup('ALL');
  };

  // Handle sorting toggle
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
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
  }, [
    trades,
    search,
    filterSource,
    filterSymbol,
    filterTimeframe,
    filterResult,
    filterSide,
    filterSetup,
    sortField,
    sortOrder
  ]);

  const visibleTrades = useMemo(() => {
    return filteredAndSortedTrades.slice(0, displayCount);
  }, [filteredAndSortedTrades, displayCount]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredAndSortedTrades.length) return;

    const headers = [
      'Trade #',
      'Symbol',
      'Timeframe',
      'Side',
      'Source',
      'Entry Time',
      'Exit Time',
      'Entry Price',
      'Exit Price',
      'SL Price',
      'TP Price',
      'Net PnL (USD)',
      'Net PnL (%)',
      'R-Multiple',
      'Result',
      'Setup Tag',
      'Notes'
    ];

    const rows = filteredAndSortedTrades.map((t) => [
      t.tradeNumber || '',
      t.symbol,
      t.timeframe,
      t.side,
      t.source,
      t.entryTime ? new Date(t.entryTime).toISOString() : '',
      t.exitTime ? new Date(t.exitTime).toISOString() : '',
      t.entryPrice || '',
      t.exitPrice || '',
      t.slPrice || '',
      t.tpPrice || '',
      t.netPnlUsd || '',
      t.netPnlPct || '',
      t.rMultiple || '',
      t.result || '',
      t.setupTag || '',
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `trades_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* ── Top Bar: Search & Action Controls ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#717182] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari Trade #, Symbol, Setup, atau Catatan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border-2 border-[#121212] py-2 pl-9 pr-3 text-xs font-bold text-[#121212] outline-none shadow-[2px_2px_0px_0px_#121212]"
          />
        </div>

        {/* Buttons & Toggles */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile Filter Toggle Button */}
          <button
            type="button"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] transition-colors ${
              activeFilterCount > 0
                ? 'bg-[#1040C0] text-white'
                : 'bg-white text-[#121212] hover:bg-[#F0F0F0]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-[#F0C020] text-[#121212] text-[10px] font-black rounded-full">
                {activeFilterCount}
              </span>
            )}
            {showMobileFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Export CSV */}
          <Button
            variant="secondary"
            onClick={handleExportCSV}
            disabled={!filteredAndSortedTrades.length}
            className="text-xs font-bold py-2 shadow-[2px_2px_0px_0px_#121212]"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* ── Collapsible Filter Panel ── */}
      {showMobileFilters && (
        <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] space-y-3 animate-scale-up">
          <div className="flex items-center justify-between border-b border-[#121212]/15 pb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#717182]">
              Filter & Kategori ({activeFilterCount} aktif)
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-800"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Semua
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            <Select label="Sumber" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
              <option value="ALL">Semua Sumber</option>
              <option value="CSV">CSV</option>
              <option value="WEBHOOK">Webhook</option>
              <option value="MT5">MT5</option>
              <option value="MANUAL">Manual</option>
            </Select>

            <Select label="Symbol" value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)}>
              <option value="ALL">Semua Symbol</option>
              {uniqueSymbols.map((sym) => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </Select>

            <Select label="Timeframe" value={filterTimeframe} onChange={(e) => setFilterTimeframe(e.target.value)}>
              <option value="ALL">Semua TF</option>
              {uniqueTimeframes.map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </Select>

            <Select label="Hasil" value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
              <option value="ALL">Semua Hasil</option>
              <option value="WIN">WIN</option>
              <option value="LOSS">LOSS</option>
              <option value="BE">BE (Break Even)</option>
            </Select>

            <Select label="Arah" value={filterSide} onChange={(e) => setFilterSide(e.target.value)}>
              <option value="ALL">Semua Arah</option>
              <option value="LONG">LONG (Beli)</option>
              <option value="SHORT">SHORT (Jual)</option>
            </Select>

            <Select label="Setup Tag" value={filterSetup} onChange={(e) => setFilterSetup(e.target.value)}>
              <option value="ALL">Semua Setup</option>
              {uniqueSetups.map((s) => (
                <option key={s || ''} value={s || ''}>{s}</option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* ── Active Filter Summary & Result Count ── */}
      <div className="flex items-center justify-between text-xs font-bold text-[#717182] px-1">
        <span>
          Menampilkan <strong>{visibleTrades.length}</strong> dari <strong>{filteredAndSortedTrades.length}</strong> trade
        </span>
        {activeFilterCount > 0 && !showMobileFilters && (
          <button
            type="button"
            onClick={resetAllFilters}
            className="text-[11px] text-[#1040C0] font-bold hover:underline"
          >
            Hapus Filter ({activeFilterCount})
          </button>
        )}
      </div>

      {/* ── Empty State ── */}
      {filteredAndSortedTrades.length === 0 ? (
        <div className="bg-white border-2 border-[#121212] p-8 text-center shadow-[4px_4px_0px_0px_#121212] space-y-3">
          <p className="font-extrabold text-sm text-[#121212]">Tidak Ada Trade yang Cocok</p>
          <p className="text-xs text-[#717182] max-w-sm mx-auto">
            Tidak ditemukan trade dengan kriteria filter atau pencarian saat ini.
          </p>
          {activeFilterCount > 0 && (
            <Button variant="secondary" onClick={resetAllFilters} className="text-xs font-bold">
              Reset Semua Filter
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* ── 1. Mobile Card List View (< md) ── */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {visibleTrades.map((t) => {
              const isLong = t.side === 'LONG';
              const isWin = (t.netPnlUsd || 0) > 0;
              const isLoss = (t.netPnlUsd || 0) < 0;
              const durationMs = t.entryTime && t.exitTime
                ? new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()
                : 0;

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTrade(t)}
                  className={`bg-white border-2 border-[#121212] p-4 shadow-[3px_3px_0px_0px_#121212] space-y-3 cursor-pointer active:translate-y-0.5 active:shadow-none transition-all ${
                    t.status === 'OPEN'
                      ? 'border-l-4 border-l-[#1040C0]'
                      : isWin
                      ? 'border-l-4 border-l-[var(--profit)]'
                      : isLoss
                      ? 'border-l-4 border-l-[var(--loss)]'
                      : ''
                  }`}
                >
                  {/* Top Row: Trade #, Side, Result, Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-[#121212] font-display">
                        #{t.tradeNumber || '-'}
                      </span>
                      <span className="font-extrabold text-xs text-[#121212]">{t.symbol}</span>
                      <span className="text-[10px] font-bold text-[#717182]">{t.timeframe}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant={isLong ? 'profit' : 'loss'}>
                        {isLong ? 'BUY' : 'SELL'}
                      </Badge>
                      {t.status === 'OPEN' ? (
                        <Badge variant="blue" className="animate-pulse">OPEN</Badge>
                      ) : (
                        <Badge variant={isWin ? 'profit' : isLoss ? 'loss' : 'neutral'}>
                          {t.result || (isWin ? 'WIN' : isLoss ? 'LOSS' : 'BE')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Middle Row: Entry, Exit, SL, TP Prices */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#F9F9F9] p-2.5 border border-[#121212]/10 font-number">
                    <div>
                      <span className="block text-[9px] font-extrabold uppercase text-[#717182]">Entry</span>
                      <span className="font-bold text-[#121212]">{formatNumber(t.entryPrice, 2)}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] font-extrabold uppercase text-[#717182]">Exit</span>
                      <span className="font-bold text-[#121212]">{t.exitPrice ? formatNumber(t.exitPrice, 2) : 'Running'}</span>
                    </div>
                    {t.slPrice && (
                      <div>
                        <span className="block text-[9px] font-extrabold uppercase text-red-700">SL</span>
                        <span className="font-semibold text-red-800">{formatNumber(t.slPrice, 2)}</span>
                      </div>
                    )}
                    {t.tpPrice && (
                      <div>
                        <span className="block text-[9px] font-extrabold uppercase text-emerald-700">TP</span>
                        <span className="font-semibold text-emerald-800">{formatNumber(t.tpPrice, 2)}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Net PnL, R-Multiple, Duration & Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#121212]/10">
                    <div>
                      <span className={`block font-black font-number text-[15px] ${
                        isWin ? 'text-[var(--profit)]' : isLoss ? 'text-[var(--loss)]' : 'text-[#717182]'
                      }`}>
                        {isWin ? '+' : ''}{formatUsd(t.netPnlUsd)}
                      </span>
                      {t.rMultiple !== null && t.rMultiple !== undefined && (
                        <span className={`text-[11px] font-extrabold font-number ${t.rMultiple >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                          {formatR(t.rMultiple)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#717182] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t.status === 'OPEN' ? 'Running' : formatDuration(durationMs)}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTradeToDelete(t);
                        }}
                        className="p-1.5 text-[#717182] hover:text-red-600 transition-colors"
                        title="Hapus Trade"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── 2. Desktop Table View (>= md) ── */}
          <div className="hidden md:block bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] overflow-hidden">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('number')} className="cursor-pointer hover:text-[#121212] transition">
                      <div className="flex items-center space-x-1">
                        <span>Trade #</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th>Info</th>
                    <th>Arah</th>
                    <th onClick={() => toggleSort('date')} className="cursor-pointer hover:text-[#121212] transition">
                      <div className="flex items-center space-x-1">
                        <span>Waktu Exit</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="text-right">Harga Entry / Exit</th>
                    <th onClick={() => toggleSort('pnl')} className="text-right cursor-pointer hover:text-[#121212] transition">
                      <div className="flex items-center space-x-1 justify-end">
                        <span>PnL USD</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="text-right">PnL % / IDR</th>
                    <th onClick={() => toggleSort('r')} className="text-right cursor-pointer hover:text-[#121212] transition">
                      <div className="flex items-center space-x-1 justify-end">
                        <span>R</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th onClick={() => toggleSort('duration')} className="cursor-pointer hover:text-[#121212] transition">
                      <div className="flex items-center space-x-1">
                        <span>Durasi</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th>Setup</th>
                    <th className="text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrades.map((t) => {
                    const durationMs = t.entryTime && t.exitTime
                      ? new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()
                      : 0;

                    return (
                      <tr
                        key={t.id}
                        className={`cursor-pointer ${t.status === 'OPEN' ? 'bg-[var(--accent-blue)]/5 border-l-4 border-l-[var(--accent-blue)]' : ''}`}
                        onClick={() => onSelectTrade(t)}
                      >
                        {/* Trade Number */}
                        <td className="font-extrabold text-[#121212]">
                          {t.status === 'OPEN' ? (
                            <Badge variant="blue" className="animate-pulse">OPEN</Badge>
                          ) : (
                            `#${t.tradeNumber || '-'}`
                          )}
                        </td>

                        {/* Info Symbol & Timeframe */}
                        <td>
                          <div className="font-extrabold text-[#121212] font-display">{t.symbol}</div>
                          <div className="flex items-center space-x-1 text-[10px] text-[#717182] mt-0.5 font-bold uppercase tracking-wider">
                            <span>{t.timeframe}</span>
                            <span>•</span>
                            <span className="text-[#1040C0]">{t.source}</span>
                          </div>
                        </td>

                        {/* Side */}
                        <td>
                          <Badge variant={t.side === 'LONG' ? 'profit' : 'loss'}>
                            {t.side}
                          </Badge>
                        </td>

                        {/* Exit Time */}
                        <td className="text-[#717182] font-semibold text-[11px]">
                          {t.exitTime ? formatDate(t.exitTime) : (t.entryTime ? `Open: ${formatDate(t.entryTime)}` : '-')}
                        </td>

                        {/* Entry & Exit Prices */}
                        <td className="text-right font-number">
                          <div className="font-bold text-[#121212]">{formatNumber(t.entryPrice, 2)}</div>
                          <div className="text-[10px] text-[#717182] font-bold mt-0.5">{t.exitPrice ? formatNumber(t.exitPrice, 2) : 'Running'}</div>
                          {t.slPrice && t.tpPrice && (
                            <div className="text-[9px] font-bold text-emerald-700 mt-0.5 bg-emerald-50 px-1 py-0.2 inline-block rounded border border-emerald-200">
                              Actual SL/TP
                            </div>
                          )}
                        </td>

                        {/* Net PnL USD */}
                        <td className="text-right font-number">
                          {t.status === 'OPEN' ? (
                            <span className="text-[#717182] italic text-[11px] font-bold">Running</span>
                          ) : (
                            <span className={`font-bold text-[15px] ${
                              (t.netPnlUsd || 0) > 0
                                ? 'text-[var(--profit)]'
                                : (t.netPnlUsd || 0) < 0
                                ? 'text-[var(--loss)]'
                                : 'text-[var(--text-muted)]'
                            }`}>
                              {(t.netPnlUsd || 0) > 0 ? '+' : ''}{formatUsd(t.netPnlUsd)}
                            </span>
                          )}
                        </td>

                        {/* Net PnL % / IDR */}
                        <td className="text-right font-number">
                          {t.status === 'OPEN' ? (
                            <span className="text-[#717182]">-</span>
                          ) : (
                            <>
                              <div className={`font-bold text-[11px] ${
                                (t.netPnlUsd || 0) >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'
                              }`}>
                                {(t.netPnlUsd || 0) > 0 ? '+' : ''}{formatPercent(t.netPnlPct)}
                              </div>
                              <div className="text-[10px] text-[#717182] font-bold mt-0.5">{formatIdr(t.netPnlIdr)}</div>
                            </>
                          )}
                        </td>

                        {/* R-multiple */}
                        <td className="text-right font-extrabold font-number text-[14px]">
                          {t.rMultiple !== null && t.rMultiple !== undefined ? (
                            <span className={t.rMultiple >= 0 ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}>
                              {formatR(t.rMultiple)}
                            </span>
                          ) : (
                            <span className="text-[#717182]">-</span>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="text-[#717182] font-bold text-[11px] uppercase tracking-wider">
                          {t.status === 'OPEN' ? '-' : formatDuration(durationMs)}
                        </td>

                        {/* Setup Tag */}
                        <td>
                          {t.setupTag ? (
                            <Badge variant="neutral">{t.setupTag}</Badge>
                          ) : (
                            <span className="text-[#717182] font-bold italic text-[10px]">TANPA TAG</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-1">
                            {t.screenshotUrl && (
                              <a
                                href={t.screenshotUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 hover:bg-[#E0E0E0] text-[#1040C0] rounded transition"
                                title="Lihat Screenshot"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              onClick={() => onSelectTrade(t)}
                              className="p-1.5 hover:bg-[#E0E0E0] text-[#717182] hover:text-[#121212] rounded transition"
                              title="Edit Catatan"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setTradeToDelete(t)}
                              className="p-1.5 hover:bg-[#E0E0E0] text-[#717182] hover:text-[var(--loss)] rounded transition"
                              title="Hapus Trade"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Load More Button */}
          {displayCount < filteredAndSortedTrades.length && (
            <div className="p-4 border-2 border-[#121212] bg-[#F0F0F0] text-center shadow-[3px_3px_0px_0px_#121212]">
              <Button
                variant="secondary"
                onClick={() => setDisplayCount(d => d + 100)}
                className="w-full sm:w-auto px-8 text-xs font-extrabold"
              >
                Muat Lebih Banyak Trade ({displayCount} dari {filteredAndSortedTrades.length})
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Confirmation Modal for Delete Trade ── */}
      <ConfirmationModal
        isOpen={!!tradeToDelete}
        title="Hapus Trade Ini?"
        objectName={tradeToDelete ? `Trade #${tradeToDelete.tradeNumber} (${tradeToDelete.symbol} ${tradeToDelete.side})` : ''}
        impactItems={[
          'Catatan trade dan hasil kalkulasi PnL',
          'Data metrik sesi dan kurva ekuitas akan dihitung ulang secara otomatis'
        ]}
        confirmLabel="Hapus Trade"
        onConfirm={() => {
          if (tradeToDelete) {
            onDeleteTrade(tradeToDelete.id);
            setTradeToDelete(null);
          }
        }}
        onCancel={() => setTradeToDelete(null)}
      />
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
