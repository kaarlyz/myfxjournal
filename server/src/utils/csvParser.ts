import Papa from 'papaparse';

export interface ParsedCsvRow {
  tradeNumber: number;
  type: string;
  dateTimeStr: string;
  dateTime: Date;
  signal: string;
  price: number;
  qty: number;
  value: number;
  netPnlUsd?: number;
  netPnlPct?: number;
  favExcursionUsd?: number;
  favExcursionPct?: number;
  advExcursionUsd?: number;
  advExcursionPct?: number;
  cumPnlUsd?: number;
  cumPnlPct?: number;
}

export interface ValidTradeData {
  tradeNumber: number;
  side: 'LONG' | 'SHORT';
  entryTime: Date;
  exitTime: Date;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  positionValue: number;
  netPnlUsd: number;
  netPnlPct: number;
  favorableExcursionUsd: number;
  favorableExcursionPct: number;
  adverseExcursionUsd: number;
  adverseExcursionPct: number;
  cumulativePnlUsd: number;
  cumulativePnlPct: number;
  entrySignal: string;
  exitSignal: string;
  status: 'CLOSED';
}

export interface InvalidTradeData {
  tradeNumber: number;
  reason: string;
  rawRows: any[];
}

// Helper to safely parse strings to float, stripping spaces, percentages, and currencies
export function cleanNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val).trim();
  if (!str) return 0;
  
  // Remove spaces, percent signs, and currency symbols (e.g. $, Rp), but keep negative sign and decimal point
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Flexible column finder. Tries multiple candidate names in order and returns the first match.
 * For monetary columns (Price, PnL, Excursion, etc.) the CSV may have any currency suffix:
 * "Price USD", "Price JPY", "Price EUR", "Net PnL JPY", "Favorable excursion JPY", etc.
 */
function findFlexible(row: Record<string, string>, ...candidates: string[]): string {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const matchKey = keys.find(k => k.trim().toLowerCase() === candidate.toLowerCase());
    if (matchKey) return row[matchKey] || '';
  }
  return '';
}

/**
 * Find a value in a row by matching exact key or any key with a currency suffix.
 * e.g., findWithCurrencySuffix(row, 'Price') matches "Price", "Price USD", "Price JPY", "Price EUR", etc.
 */
function findWithCurrencySuffix(row: Record<string, string>, baseKey: string): string {
  const keys = Object.keys(row);
  const base = baseKey.toLowerCase();

  // 1. Try exact match first
  const exact = keys.find(k => k.trim().toLowerCase() === base);
  if (exact) return row[exact] || '';

  // 2. Try "BaseKey USD" first (most common)
  const usd = keys.find(k => k.trim().toLowerCase() === `${base} usd`);
  if (usd) return row[usd] || '';

  // 3. Try any key that starts with the base key followed by a space (e.g., "Price JPY")
  const suffixed = keys.find(k => k.trim().toLowerCase().startsWith(`${base} `));
  if (suffixed) return row[suffixed] || '';

  return '';
}

export function parseTradingViewCsv(csvText: string): {
  validTrades: ValidTradeData[];
  invalidTrades: InvalidTradeData[];
} {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  const validTrades: ValidTradeData[] = [];
  const invalidTrades: InvalidTradeData[] = [];

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error('Gagal membaca CSV: Format file tidak valid atau data kosong.');
  }

  const rawRows = parsed.data as Record<string, string>[];

  // Group rows by trade number
  const groupedRows: Record<string, Record<string, string>[]> = {};

  rawRows.forEach((row) => {
    const keys = Object.keys(row);
    const tradeNumKey = keys.find(k => k.trim().toLowerCase() === 'trade number');
    
    if (!tradeNumKey) return;

    const tradeNumVal = row[tradeNumKey]?.trim();
    if (!tradeNumVal) return;

    if (!groupedRows[tradeNumVal]) {
      groupedRows[tradeNumVal] = [];
    }
    groupedRows[tradeNumVal].push(row);
  });

  // Process each group
  Object.entries(groupedRows).forEach(([tradeNumStr, rows]) => {
    const tradeNumber = parseInt(tradeNumStr, 10);
    if (isNaN(tradeNumber)) {
      invalidTrades.push({
        tradeNumber: 0,
        reason: `Nomor trade tidak valid: "${tradeNumStr}"`,
        rawRows: rows,
      });
      return;
    }

    // Filter entry and exit rows
    const entryRows: Record<string, string>[] = [];
    const exitRows: Record<string, string>[] = [];

    rows.forEach((row) => {
      const typeVal = findFlexible(row, 'Type').trim().toLowerCase();
      if (typeVal.startsWith('entry')) {
        entryRows.push(row);
      } else if (typeVal.startsWith('exit')) {
        exitRows.push(row);
      }
    });

    // Valid trade must have at least one Entry and one Exit
    if (entryRows.length === 0 && exitRows.length === 0) {
      invalidTrades.push({
        tradeNumber,
        reason: 'Trade tidak memiliki baris Entry maupun Exit.',
        rawRows: rows,
      });
      return;
    }
    if (entryRows.length === 0) {
      invalidTrades.push({
        tradeNumber,
        reason: 'Trade kehilangan baris Entry (Hanya ada Exit).',
        rawRows: rows,
      });
      return;
    }
    if (exitRows.length === 0) {
      invalidTrades.push({
        tradeNumber,
        reason: 'Trade kehilangan baris Exit (Hanya ada Entry).',
        rawRows: rows,
      });
      return;
    }

    const entryRow = entryRows[0];
    const exitRow = exitRows[0];

    // Read attributes from entry
    const entryTypeStr = findFlexible(entryRow, 'Type').trim();
    const entryTimeStr = findFlexible(entryRow, 'Date and time').trim();
    // Price: try "Price USD", then any "Price XXX" (e.g., "Price JPY", "Price EUR")
    const entryPriceVal = findWithCurrencySuffix(entryRow, 'Price');
    const entrySignal = findFlexible(entryRow, 'Signal').trim();

    // Read attributes from exit
    const exitTimeStr = findFlexible(exitRow, 'Date and time').trim();
    const exitPriceVal = findWithCurrencySuffix(exitRow, 'Price');
    const exitSignal = findFlexible(exitRow, 'Signal').trim();
    
    // Performance metrics (read from exit row, fallback to entry)
    const qtyVal = findFlexible(exitRow, 'Size (qty)') || findFlexible(entryRow, 'Size (qty)');
    const valueVal = findFlexible(exitRow, 'Size (value)') || findFlexible(entryRow, 'Size (value)');
    
    // Net PnL — support "Net PnL USD", "Net PnL JPY", "Net PnL EUR", etc.
    const netPnlUsdVal = findWithCurrencySuffix(exitRow, 'Net PnL') || findWithCurrencySuffix(entryRow, 'Net PnL');
    const netPnlPctVal = findFlexible(exitRow, 'Net PnL %') || findFlexible(entryRow, 'Net PnL %');
    
    // Favorable excursion — support any currency suffix
    const mfeUsdVal = findWithCurrencySuffix(exitRow, 'Favorable excursion') || findWithCurrencySuffix(entryRow, 'Favorable excursion');
    const mfePctVal = findFlexible(exitRow, 'Favorable excursion %') || findFlexible(entryRow, 'Favorable excursion %');
    
    // Adverse excursion — support any currency suffix
    const maeUsdVal = findWithCurrencySuffix(exitRow, 'Adverse excursion') || findWithCurrencySuffix(entryRow, 'Adverse excursion');
    const maePctVal = findFlexible(exitRow, 'Adverse excursion %') || findFlexible(entryRow, 'Adverse excursion %');
    
    // Cumulative PnL — support any currency suffix
    const cumPnlUsdVal = findWithCurrencySuffix(exitRow, 'Cumulative PnL') || findWithCurrencySuffix(entryRow, 'Cumulative PnL');
    const cumPnlPctVal = findFlexible(exitRow, 'Cumulative PnL %') || findFlexible(entryRow, 'Cumulative PnL %');

    // Parse time values
    const entryTime = new Date(entryTimeStr);
    const exitTime = new Date(exitTimeStr);

    if (isNaN(entryTime.getTime())) {
      invalidTrades.push({
        tradeNumber,
        reason: `Format tanggal Entry tidak valid: "${entryTimeStr}"`,
        rawRows: rows,
      });
      return;
    }
    if (isNaN(exitTime.getTime())) {
      invalidTrades.push({
        tradeNumber,
        reason: `Format tanggal Exit tidak valid: "${exitTimeStr}"`,
        rawRows: rows,
      });
      return;
    }

    const entryPrice = cleanNumber(entryPriceVal);
    const exitPrice = cleanNumber(exitPriceVal);

    if (entryPrice <= 0) {
      invalidTrades.push({
        tradeNumber,
        reason: `Harga Entry tidak valid atau nol: "${entryPriceVal}" — pastikan kolom "Price USD" atau "Price [currency]" tersedia.`,
        rawRows: rows,
      });
      return;
    }
    if (exitPrice <= 0) {
      invalidTrades.push({
        tradeNumber,
        reason: `Harga Exit tidak valid atau nol: "${exitPriceVal}" — pastikan kolom "Price USD" atau "Price [currency]" tersedia.`,
        rawRows: rows,
      });
      return;
    }

    // Determine direction
    let side: 'LONG' | 'SHORT' = 'LONG';
    if (entryTypeStr.toLowerCase().includes('short') || entryTypeStr.toLowerCase().includes('sell')) {
      side = 'SHORT';
    } else if (entryTypeStr.toLowerCase().includes('long') || entryTypeStr.toLowerCase().includes('buy')) {
      side = 'LONG';
    }

    const qty = cleanNumber(qtyVal);
    const positionValue = cleanNumber(valueVal);
    const netPnlUsd = cleanNumber(netPnlUsdVal);
    const netPnlPct = cleanNumber(netPnlPctVal);
    const favorableExcursionUsd = cleanNumber(mfeUsdVal);
    const favorableExcursionPct = cleanNumber(mfePctVal);
    const adverseExcursionUsd = cleanNumber(maeUsdVal);
    const adverseExcursionPct = cleanNumber(maePctVal);
    const cumulativePnlUsd = cleanNumber(cumPnlUsdVal);
    const cumulativePnlPct = cleanNumber(cumPnlPctVal);

    validTrades.push({
      tradeNumber,
      side,
      entryTime,
      exitTime,
      entryPrice,
      exitPrice,
      qty,
      positionValue,
      netPnlUsd,
      netPnlPct,
      favorableExcursionUsd,
      favorableExcursionPct,
      adverseExcursionUsd,
      adverseExcursionPct,
      cumulativePnlUsd,
      cumulativePnlPct,
      entrySignal,
      exitSignal,
      status: 'CLOSED',
    });
  });

  // Sort valid trades by trade number ascending
  validTrades.sort((a, b) => a.tradeNumber - b.tradeNumber);

  return {
    validTrades,
    invalidTrades,
  };
}
