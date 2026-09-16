import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export interface SymbolOption {
  symbol: string;
  provider: string;
  candleCount?: number;
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
  displayName?: string;
}

export interface SymbolPickerProps {
  value: string;
  onChange: (symbol: string) => void;
  symbols?: SymbolOption[];
  disabled?: boolean;
  align?: 'left' | 'right';
  className?: string;
}

export const DEFAULT_AVAILABLE_SYMBOLS: SymbolOption[] = [
  {
    symbol: 'XAUUSD',
    provider: 'PARQUET',
    candleCount: 725596648,
    displayName: 'Gold',
    dateFrom: '2003-05-05T00:01:03.421Z',
    dateTo: '2026-09-01T23:59:59.995Z',
  },
  {
    symbol: 'NSXUSD',
    provider: 'DUKASCOPY',
    candleCount: 2887223,
    displayName: 'Nasdaq',
    dateFrom: '2018-06-27T15:23:00.000Z',
    dateTo: '2026-09-11T19:59:00.000Z',
  },
];

/**
 * Single source of truth for symbol canonical provider mapping.
 * Matches symbol from catalog if present, otherwise defaults:
 * XAUUSD -> PARQUET, NSXUSD/Nasdaq -> DUKASCOPY.
 */
export function getCanonicalProvider(sym: string, catalog?: SymbolOption[]): string {
  const normalized = (sym || '').trim().toUpperCase();
  if (catalog && catalog.length > 0) {
    const found = catalog.find((s) => s.symbol.toUpperCase() === normalized);
    if (found && found.provider) {
      return found.provider;
    }
  }
  if (normalized === 'XAUUSD') return 'PARQUET';
  if (normalized === 'NSXUSD' || normalized.includes('NAS') || normalized.includes('USTEC') || normalized.includes('NDX')) {
    return 'DUKASCOPY';
  }
  return 'DUKASCOPY';
}

export function getSymbolLabel(sym: string, catalog?: SymbolOption[]): string | null {
  const normalized = (sym || '').trim().toUpperCase();
  if (catalog && catalog.length > 0) {
    const found = catalog.find((s) => s.symbol.toUpperCase() === normalized);
    if (found?.displayName) return found.displayName;
  }
  if (normalized === 'NSXUSD' || normalized.includes('NAS') || normalized.includes('USTEC') || normalized.includes('NDX')) {
    return 'Nasdaq';
  }
  if (normalized === 'XAUUSD') {
    return 'Gold';
  }
  return null;
}

function formatCandleCount(count?: number): string {
  if (count === undefined || count === null) return '0 data';
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}Mrd`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}jt`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}rb`;
  return `${count}`;
}

function formatDateRange(from?: string | Date | null, to?: string | Date | null): string {
  if (!from && !to) return 'Histori data';
  const getYear = (d?: string | Date | null) => {
    if (!d) return '';
    const date = new Date(d);
    return isNaN(date.getFullYear()) ? '' : `${date.getFullYear()}`;
  };
  const y1 = getYear(from);
  const y2 = getYear(to);
  if (y1 && y2) return `${y1}–${y2}`;
  return y1 || y2 || 'Histori data';
}

export const SymbolPicker: React.FC<SymbolPickerProps> = ({
  value,
  onChange,
  symbols = [],
  disabled = false,
  align = 'left',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Ensure all canonical symbols from catalog/defaults are present and fully populated
  const baseSymbols = symbols && symbols.length > 0 ? symbols : DEFAULT_AVAILABLE_SYMBOLS;
  const displaySymbols: SymbolOption[] = [...baseSymbols];

  for (const def of DEFAULT_AVAILABLE_SYMBOLS) {
    const existingIndex = displaySymbols.findIndex((s) => s.symbol.toUpperCase() === def.symbol.toUpperCase());
    if (existingIndex === -1) {
      displaySymbols.push(def);
    } else {
      displaySymbols[existingIndex] = {
        ...def,
        ...displaySymbols[existingIndex],
        provider: displaySymbols[existingIndex].provider || def.provider,
        candleCount: displaySymbols[existingIndex].candleCount || def.candleCount,
        displayName: displaySymbols[existingIndex].displayName || def.displayName,
      };
    }
  }

  // Ensure current active value exists in the display list
  if (!displaySymbols.some((s) => s.symbol.toUpperCase() === (value || '').toUpperCase())) {
    displaySymbols.unshift({
      symbol: value,
      provider: getCanonicalProvider(value, displaySymbols),
      candleCount: 0,
      displayName: getSymbolLabel(value, displaySymbols) || undefined,
    });
  }

  const selectedItem = displaySymbols.find((s) => s.symbol.toUpperCase() === (value || '').toUpperCase());

  // Sync highlightedIndex when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const activeIdx = displaySymbols.findIndex((s) => s.symbol.toUpperCase() === (value || '').toUpperCase());
      setHighlightedIndex(activeIdx >= 0 ? activeIdx : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, value]);

  // Auto-scroll highlighted item into view in listbox
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  // Lock background scroll when mobile sheet is open
  useEffect(() => {
    if (!isOpen) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (!isMobile) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isOpen]);

  // Keyboard navigation & outside click/tap handling
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent | MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          if (displaySymbols.length === 0) return -1;
          return prev < displaySymbols.length - 1 ? prev + 1 : 0;
        });
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          if (displaySymbols.length === 0) return -1;
          return prev > 0 ? prev - 1 : displaySymbols.length - 1;
        });
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < displaySymbols.length) {
          const chosen = displaySymbols[highlightedIndex];
          if (chosen) {
            onChange(chosen.symbol);
            setIsOpen(false);
          }
        }
        return;
      }

      if (e.key === 'Tab') {
        // Tab naturally moves focus outside; close panel
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, highlightedIndex, displaySymbols, onChange]);

  return (
    <div ref={dropdownRef} className={`relative select-none ${className || 'inline-block'}`}>
      {/* Trigger Button: Neo-Brutalist Badge */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (!isOpen && !disabled && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'symbol-picker-listbox' : undefined}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0
            ? `symbol-option-${displaySymbols[highlightedIndex]?.symbol}`
            : undefined
        }
        aria-label={`Pilih Instrumen Trading: ${value}`}
        className="flex items-center justify-between gap-1.5 bg-[#F0F0F0] border-2 border-[#121212] px-2 sm:px-2.5 py-1 text-xs font-black text-[#121212] shadow-[1px_1px_0px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none hover:bg-[#FFFDEB] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#1040C0] focus-visible:outline-offset-1 w-full min-w-0"
      >
        <div className="flex items-center gap-1 min-w-0 truncate">
          <span className="text-[#1040C0] font-black truncate">{value}</span>
          {selectedItem?.provider && (
            <span className="hidden sm:inline text-[10px] font-mono text-[#717182] font-semibold shrink-0">
              ({selectedItem.provider})
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#121212] stroke-[2.5] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* In-UI Popover / Sheet: Neo-Brutalist Panel */}
      {isOpen && (
        <>
          {/* Backdrop Click-Away Overlay (Mobile only, closes panel when tapped) */}
          <div
            className="fixed inset-0 bg-black/20 z-[90] md:hidden touch-none overscroll-none"
            onClick={() => setIsOpen(false)}
            onPointerDown={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            aria-hidden="true"
          />

          {/* Popover (Desktop absolute) / Sheet (Mobile fixed) */}
          <div
            className={`fixed inset-x-4 top-20 max-h-[60vh] overflow-y-auto border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] z-[100] rounded-xl p-4 bg-white md:absolute md:top-full md:mt-2 md:inset-x-auto md:w-64 md:max-h-[360px] md:border-2 md:shadow-[4px_4px_0px_0px_#121212] md:rounded-lg md:z-50 md:p-0 md:overflow-hidden ${
              align === 'right' ? 'md:right-0 md:left-auto' : 'md:left-0 md:right-auto'
            } animate-in fade-in zoom-in-95 duration-100`}
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-[#121212] md:px-3 md:py-2 md:pb-2 md:mb-0 md:bg-[#F0F0F0]">
              <div className="flex items-center gap-2">
                <span className="text-xs md:text-[10px] font-black tracking-wider uppercase text-slate-700">
                  PILIH INSTRUMEN
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 md:bg-white px-1.5 py-0.5 border border-slate-300 md:border-[#121212] rounded shadow-[1px_1px_0px_0px_#121212]">
                  {displaySymbols.length} instrumen
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="md:hidden flex items-center justify-center w-6 h-6 rounded border-2 border-[#121212] bg-white text-[#121212] hover:bg-slate-100 active:translate-x-[1px] active:translate-y-[1px] cursor-pointer shadow-[1px_1px_0px_0px_#121212]"
                aria-label="Tutup pilihan instrumen"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>

            {/* List of symbols with 44px+ tap targets & keyboard accessibility */}
            <div
              id="symbol-picker-listbox"
              className="flex flex-col gap-1.5 md:gap-1 md:p-1.5 md:max-h-[280px] md:overflow-y-auto overscroll-contain"
              role="listbox"
              tabIndex={-1}
              aria-label="Daftar Instrumen Trading"
            >
              {displaySymbols.map((item, index) => {
                const isActive = item.symbol.toUpperCase() === (value || '').toUpperCase();
                const isHighlighted = highlightedIndex === index;
                const countText = formatCandleCount(item.candleCount);
                const rangeText = formatDateRange(item.dateFrom, item.dateTo);

                return (
                  <button
                    key={`${item.symbol}-${item.provider}`}
                    id={`symbol-option-${item.symbol}`}
                    ref={(el) => (itemRefs.current[index] = el)}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => {
                      onChange(item.symbol);
                      setIsOpen(false);
                    }}
                    className={`min-h-[46px] w-full px-3 py-2 flex items-center justify-between text-left rounded-md transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-[#EAF2FF] border-2 border-[#1040C0] shadow-[1px_1px_0px_0px_#1040C0]'
                        : isHighlighted
                        ? 'bg-[#FFFDEB] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]'
                        : 'bg-white border-slate-200 hover:bg-[#FFFDEB] hover:border-[#121212] active:translate-x-[1px] active:translate-y-[1px]'
                    } focus-visible:outline-2 focus-visible:outline-[#1040C0]`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-sm text-[#121212]">
                          {item.symbol}
                        </span>
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 border border-[#121212] bg-white rounded text-slate-700 shadow-[1px_1px_0px_0px_#121212]">
                          {item.provider}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-600 truncate mt-0.5">
                        {countText} {item.provider === 'PARQUET' ? 'ticks' : 'candles'} • {rangeText}
                      </span>
                    </div>

                    {isActive && (
                      <div className="w-5 h-5 rounded-full bg-[#1040C0] text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
