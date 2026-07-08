import React, { useState, useMemo } from 'react';
import {
  Search,
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

import { Button } from './ui/Button';
import { Select } from './ui/Input';
import { Badge } from './ui/Badge';

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

  // Pagination state
  const [displayCount, setDisplayCount] = useState(100);

  // Reset display count when filters or search change
  React.useEffect(() => {
    setDisplayCount(100);
  }, [search, filterSource, filterSymbol, filterTimeframe, filterResult, filterSide, filterSetup, sortField, sortOrder]);

  const visibleTrades = filteredAndSortedTrades.slice(0, displayCount);

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
    <div className="space-y-4 animate-fade-in">
      {/* Search & Export Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-2.5 w-4.5 h-4.5 text-[#717182]" />
          <input
            type="text"
            placeholder="Cari trade number, symbol, signal, setup..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 border-2 border-[#121212] focus:shadow-[4px_4px_0px_0px_#1040C0]"
          />
        </div>

        {/* Exports */}
        <div className="flex items-center space-x-2 self-end md:self-auto">
          <Button variant="secondary" onClick={exportToCSV} title="Ekspor ke CSV" size="sm">
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </Button>
          <Button variant="secondary" onClick={exportToJSON} title="Ekspor ke JSON" size="sm">
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </Button>
        </div>
      </div>

      {/* Grid Multi-Filter Section */}
      <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] grid grid-cols-2 md:grid-cols-6 gap-3">
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

        <Select label="Sisi" value={filterSide} onChange={(e) => setFilterSide(e.target.value)}>
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

      {/* Trade Table Ledger */}
      <div className="bg-white border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] overflow-hidden">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th
                  onClick={() => toggleSort('number')}
                  className="cursor-pointer hover:text-[#121212] transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Trade #</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th>Info</th>
                <th>Arah</th>
                <th
                  onClick={() => toggleSort('date')}
                  className="cursor-pointer hover:text-[#121212] transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Waktu Exit (Lokal)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="text-right">Harga Entry / Exit</th>
                <th
                  onClick={() => toggleSort('pnl')}
                  className="text-right cursor-pointer hover:text-[#121212] transition"
                >
                  <div className="flex items-center space-x-1 justify-end">
                    <span>PnL USD</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="text-right">PnL % / IDR</th>
                <th
                  onClick={() => toggleSort('r')}
                  className="text-right cursor-pointer hover:text-[#121212] transition"
                >
                  <div className="flex items-center space-x-1 justify-end">
                    <span>R</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('duration')}
                  className="cursor-pointer hover:text-[#121212] transition"
                >
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
              {filteredAndSortedTrades.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#717182] font-medium font-[Outfit]">
                    Tidak ditemukan data trade yang cocok dengan kriteria pencarian/filter.
                  </td>
                </tr>
              ) : (
                visibleTrades.map((t) => {
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

                      {/* Info Symbol & Timeframe & Source */}
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
                        <Badge variant={t.side === 'LONG' ? 'profit' : 'loss'}>{t.side}</Badge>
                      </td>

                      {/* Exit Time */}
                      <td className="text-[#717182] font-semibold text-[11px]">
                        {t.exitTime ? formatDate(t.exitTime) : (t.entryTime ? `Open: ${formatDate(t.entryTime)}` : '-')}
                      </td>

                      {/* Entry & Exit Prices */}
                      <td className="text-right font-number">
                        <div className="font-bold text-[#121212]">{formatNumber(t.entryPrice, 4)}</div>
                        <div className="text-[10px] text-[#717182] font-bold mt-0.5">{t.exitPrice ? formatNumber(t.exitPrice, 4) : 'Running'}</div>
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
                            onClick={() => {
                              if (confirm(`Hapus trade ini? Tindakan ini tidak dapat dibatalkan.`)) {
                                onDeleteTrade(t.id);
                              }
                            }}
                            className="p-1.5 hover:bg-[#E0E0E0] text-[#717182] hover:text-[var(--loss)] rounded transition"
                            title="Hapus Trade"
                          >
                            <Trash2 className="w-4 h-4" />
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
        {/* Load More Button */}
        {displayCount < filteredAndSortedTrades.length && (
          <div className="p-4 border-t-2 border-[#121212] bg-[#F0F0F0] text-center">
            <Button
              variant="secondary"
              onClick={() => setDisplayCount(d => d + 100)}
              className="px-8"
            >
              Load More Trades (Showing {displayCount} of {filteredAndSortedTrades.length})
            </Button>
          </div>
        )}
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
