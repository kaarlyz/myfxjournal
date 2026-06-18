"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanNumber = cleanNumber;
exports.parseTradingViewCsv = parseTradingViewCsv;
const papaparse_1 = __importDefault(require("papaparse"));
// Helper to safely parse strings to float, stripping spaces, percentages, and currencies
function cleanNumber(val) {
    if (val === undefined || val === null)
        return 0;
    const str = String(val).trim();
    if (!str)
        return 0;
    // Remove spaces, percent signs, and currency symbols (e.g. $, Rp), but keep negative sign and decimal point
    const cleaned = str.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}
function parseTradingViewCsv(csvText) {
    const parsed = papaparse_1.default.parse(csvText, {
        header: true,
        skipEmptyLines: 'greedy',
    });
    const validTrades = [];
    const invalidTrades = [];
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
        throw new Error('Gagal membaca CSV: Format file tidak valid atau data kosong.');
    }
    // Define normalizer to map TV strategy headers to local fields
    // Columns to match: "Trade number", "Type", "Date and time", "Signal", "Price USD", "Size (qty)", "Size (value)", etc.
    const rawRows = parsed.data;
    // Group rows by trade number
    const groupedRows = {};
    rawRows.forEach((row) => {
        // Find key matches in row
        const keys = Object.keys(row);
        const tradeNumKey = keys.find(k => k.trim().toLowerCase() === 'trade number');
        if (!tradeNumKey)
            return; // Row does not contain trade number
        const tradeNumVal = row[tradeNumKey]?.trim();
        if (!tradeNumVal)
            return;
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
        // Identify standard keys across columns dynamically to account for variations (e.g., lowercase, trailing spaces)
        const findValue = (row, target) => {
            const matchKey = Object.keys(row).find(k => k.trim().toLowerCase() === target.toLowerCase());
            return matchKey ? row[matchKey] || '' : '';
        };
        // Filter entry and exit rows
        const entryRows = [];
        const exitRows = [];
        rows.forEach((row) => {
            const typeVal = findValue(row, 'Type').trim().toLowerCase();
            if (typeVal.startsWith('entry')) {
                entryRows.push(row);
            }
            else if (typeVal.startsWith('exit')) {
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
        // Take the first entry and first exit row for simplification (Strategy tester outputs 1 of each per trade)
        const entryRow = entryRows[0];
        const exitRow = exitRows[0];
        // Read attributes from entry
        const entryTypeStr = findValue(entryRow, 'Type').trim();
        const entryTimeStr = findValue(entryRow, 'Date and time').trim();
        const entryPriceVal = findValue(entryRow, 'Price USD') || findValue(entryRow, 'Price');
        const entrySignal = findValue(entryRow, 'Signal').trim();
        // Read attributes from exit
        const exitTimeStr = findValue(exitRow, 'Date and time').trim();
        const exitPriceVal = findValue(exitRow, 'Price USD') || findValue(exitRow, 'Price');
        const exitSignal = findValue(exitRow, 'Signal').trim();
        // Performance metrics (read from exit row)
        const qtyVal = findValue(exitRow, 'Size (qty)') || findValue(entryRow, 'Size (qty)');
        const valueVal = findValue(exitRow, 'Size (value)') || findValue(entryRow, 'Size (value)');
        const netPnlUsdVal = findValue(exitRow, 'Net PnL USD') || findValue(exitRow, 'Net PnL');
        const netPnlPctVal = findValue(exitRow, 'Net PnL %');
        const mfeUsdVal = findValue(exitRow, 'Favorable excursion USD') || findValue(exitRow, 'Favorable excursion');
        const mfePctVal = findValue(exitRow, 'Favorable excursion %');
        const maeUsdVal = findValue(exitRow, 'Adverse excursion USD') || findValue(exitRow, 'Adverse excursion');
        const maePctVal = findValue(exitRow, 'Adverse excursion %');
        const cumPnlUsdVal = findValue(exitRow, 'Cumulative PnL USD') || findValue(exitRow, 'Cumulative PnL');
        const cumPnlPctVal = findValue(exitRow, 'Cumulative PnL %');
        // Parse values
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
                reason: `Harga Entry tidak boleh kurang dari atau sama dengan nol: "${entryPriceVal}"`,
                rawRows: rows,
            });
            return;
        }
        if (exitPrice <= 0) {
            invalidTrades.push({
                tradeNumber,
                reason: `Harga Exit tidak boleh kurang dari atau sama dengan nol: "${exitPriceVal}"`,
                rawRows: rows,
            });
            return;
        }
        // Determine direction
        let side = 'LONG';
        if (entryTypeStr.toLowerCase().includes('short') || entryTypeStr.toLowerCase().includes('sell')) {
            side = 'SHORT';
        }
        else if (entryTypeStr.toLowerCase().includes('long') || entryTypeStr.toLowerCase().includes('buy')) {
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
