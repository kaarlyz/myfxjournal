/**
 * replayEngineCore.ts
 *
 * Core utilities for the ReplayFX Engine:
 *   A. Symbol Normalization
 *   B. Price Precision & Micro-Unit Arithmetic
 *   C. Account Type (Standard vs Cent) Detection & Conversion
 *   D. P&L Calculation
 *   E. Spread / Bid-Ask Policy
 *   F. M1 → Multi-Timeframe Resampling
 *
 * All monetary/price calculations use micro-units (integers) internally
 * to avoid IEEE-754 floating-point drift.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A. SYMBOL NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canonical symbol map: alias → canonical ticker stored in DB.
 * Extend this map whenever a new broker variant is encountered.
 */
const SYMBOL_ALIAS_MAP: Record<string, string> = {
  // Gold / XAUUSD variants
  XAUUSD: 'XAUUSD',
  XAUUSDC: 'XAUUSD',      // XAUUSDc  (Dukascopy / cTrader)
  XAUUSDECN: 'XAUUSD',   // XAUUSD-ECN
  GOLD: 'XAUUSD',
  XAUUSDM: 'XAUUSD',     // XAUUSD.m micro-lot variant
  XAUUSDPRO: 'XAUUSD',
  XAUUSDRAW: 'XAUUSD',
  GOLDSPOT: 'XAUUSD',
  XAUUSDFX: 'XAUUSD',

  // Silver (XAGUSD) – add more as needed
  XAGUSD: 'XAGUSD',
  SILVER: 'XAGUSD',

  // Bitcoin
  BTCUSD: 'BTCUSD',
  BTCUSDT: 'BTCUSD',

  // Forex pairs
  EURUSD: 'EURUSD',
  GBPUSD: 'GBPUSD',
  USDJPY: 'USDJPY',
  USDCHF: 'USDCHF',
  AUDUSD: 'AUDUSD',
  NZDUSD: 'NZDUSD',
  USDCAD: 'USDCAD',
};

export interface SymbolInfo {
  canonical: string;       // Canonical ticker, e.g. "XAUUSD"
  base: string;            // Base currency, e.g. "XAU"
  quote: string;           // Quote currency, e.g. "USD"
  known: boolean;          // False if symbol was not found in alias map
  rawInput: string;        // Original string before normalization
  alias?: string;          // The cleaned intermediate form used for lookup
}

/**
 * Normalize an arbitrary broker symbol string to its canonical form.
 * Strips non-alphanumeric chars (/, -, ., spaces), uppercases,
 * then looks up in SYMBOL_ALIAS_MAP.
 *
 * If the symbol is not recognized, returns an object with known=false
 * and logs a warning — does NOT silently fall back to XAUUSD.
 */
export function normalizeSymbol(symbol: string): SymbolInfo {
  const rawInput = symbol;
  const alias = symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const canonical = SYMBOL_ALIAS_MAP[alias];

  if (!canonical) {
    console.warn(
      `[ReplayCore] WARNING: Unknown symbol "${rawInput}" (cleaned: "${alias}"). ` +
      `Not falling back to XAUUSD. Please add this symbol to SYMBOL_ALIAS_MAP.`
    );
    // Return the alias itself as canonical, but flag it as unknown
    return { canonical: alias, base: alias.slice(0, 3), quote: alias.slice(3, 6), known: false, rawInput, alias };
  }

  const base = canonical.slice(0, 3);
  const quote = canonical.slice(3, 6);
  return { canonical, base, quote, known: true, rawInput, alias };
}

/**
 * Returns the canonical ticker string (for use in DB queries).
 * Throws if the symbol is unknown and strict=true (default).
 */
export function getCanonicalSymbol(symbol: string, strict = false): string {
  const info = normalizeSymbol(symbol);
  if (!info.known && strict) {
    throw new Error(`Unknown symbol "${symbol}". Cannot proceed with unknown feed.`);
  }
  return info.canonical;
}

// ═══════════════════════════════════════════════════════════════════════════
// B. PRICE PRECISION & MICRO-UNIT ARITHMETIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect the number of decimal places in a price string or number.
 * Example: 3355.123 → 3,  3355.12 → 2,  3355 → 0
 */
export function detectPriceDigits(price: number | string): number {
  const str = String(price);
  const dotIdx = str.indexOf('.');
  if (dotIdx === -1) return 0;
  // Remove trailing zeros that may be artefacts of JS float repr
  const decimals = str.slice(dotIdx + 1).replace(/0+$/, '');
  return decimals.length;
}

/**
 * Convert a floating-point price to an integer micro-unit.
 * priceToMicro(3355.123, 3) = 3355123
 * priceToMicro(3355.12,  2) = 335512
 */
export function priceToMicro(price: number, digits: number): bigint {
  // Use string manipulation to avoid float rounding drift
  const factor = Math.pow(10, digits);
  return BigInt(Math.round(price * factor));
}

/**
 * Convert micro-units back to a floating-point price.
 * microToPrice(3355123n, 3) = 3355.123
 */
export function microToPrice(micro: bigint, digits: number): number {
  const factor = Math.pow(10, digits);
  return Number(micro) / factor;
}

/**
 * Compare two prices using micro-units to avoid ==, <, > on floats.
 * Returns -1, 0, or 1.
 */
export function comparePrices(a: number, b: number, digits: number): -1 | 0 | 1 {
  const ma = priceToMicro(a, digits);
  const mb = priceToMicro(b, digits);
  if (ma < mb) return -1;
  if (ma > mb) return 1;
  return 0;
}

/** Is price a <= price b (micro-safe)? */
export function priceLte(a: number, b: number, digits: number): boolean {
  return comparePrices(a, b, digits) <= 0;
}

/** Is price a >= price b (micro-safe)? */
export function priceGte(a: number, b: number, digits: number): boolean {
  return comparePrices(a, b, digits) >= 0;
}

/** Is price a < price b (micro-safe)? */
export function priceLt(a: number, b: number, digits: number): boolean {
  return comparePrices(a, b, digits) < 0;
}

/** Is price a > price b (micro-safe)? */
export function priceGt(a: number, b: number, digits: number): boolean {
  return comparePrices(a, b, digits) > 0;
}

/**
 * Calculate price distance in micro-units.
 * Returns absolute difference as bigint.
 */
export function microDistance(a: number, b: number, digits: number): bigint {
  const ma = priceToMicro(a, digits);
  const mb = priceToMicro(b, digits);
  return ma > mb ? ma - mb : mb - ma;
}

// ═══════════════════════════════════════════════════════════════════════════
// C. ACCOUNT TYPE DETECTION & CENT CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

export type AccountType = 'STANDARD' | 'CENT' | 'UNKNOWN';

export interface AccountInfo {
  type: AccountType;
  centMultiplier: number;        // 100 for standard cent (1 cent USD = 0.01 USD)
  normalizedBalanceUsd: number;  // Balance converted to USD
  currency: string;
}

/**
 * Detect account type from session metadata.
 *
 * Rules:
 *   - If balanceCurrency is 'USC' or 'CENT' → CENT account
 *   - If centMultiplier != 100 (non-default) and balance is large → likely CENT
 *   - Otherwise STANDARD
 *
 * centMultiplier from the DB schema: default 100 (100 cents = 1 USD)
 */
export function detectAccountType(
  balanceCurrency: string | null,
  initialBalance: number | null,
  centMultiplier: number | null
): AccountInfo {
  const currency = (balanceCurrency || 'USD').toUpperCase().trim();
  const mult = centMultiplier ?? 100;

  const isCentCurrency = ['USC', 'CENT', 'CENTS', 'USCENT', 'USD_CENT'].includes(currency);
  const isCentBalance = !isCentCurrency && (initialBalance ?? 0) > 500_000;

  const type: AccountType = isCentCurrency || isCentBalance ? 'CENT' : 'STANDARD';
  const normalizedBalanceUsd = type === 'CENT'
    ? (initialBalance ?? 0) / mult
    : (initialBalance ?? 0);

  return { type, centMultiplier: mult, normalizedBalanceUsd, currency };
}

/**
 * Convert a P&L value from the session's native currency to USD.
 * For cent accounts: divide by centMultiplier.
 * For standard accounts: no conversion (already USD for XAUUSD).
 */
export function convertPnlToUsd(
  pnlNative: number,
  accountInfo: AccountInfo
): number {
  if (accountInfo.type === 'CENT') {
    return pnlNative / accountInfo.centMultiplier;
  }
  return pnlNative;
}

// ═══════════════════════════════════════════════════════════════════════════
// D. P&L CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Contract specifications per symbol.
 * contractSize = number of units per standard lot.
 * For XAUUSD: 1 lot = 100 troy ounces.
 */
const CONTRACT_SIZES: Record<string, number> = {
  XAUUSD: 100,   // 100 oz per lot
  XAGUSD: 5000,  // 5000 oz per lot (silver)
  EURUSD: 100000,
  GBPUSD: 100000,
  USDJPY: 100000,
  USDCHF: 100000,
  AUDUSD: 100000,
  NZDUSD: 100000,
  USDCAD: 100000,
  BTCUSD: 1,
};

/**
 * Get contract size for a canonical symbol.
 * Returns 100000 (standard forex lot) as default if unknown.
 */
export function getContractSize(canonicalSymbol: string): number {
  return CONTRACT_SIZES[canonicalSymbol] ?? 100000;
}

export interface PnlResult {
  pnlUsd: number;
  pnlMicro: bigint;
  direction: 1 | -1;
  contractSize: number;
  lotSize: number;
  priceDiff: number;
  priceDiffMicro: bigint;
  priceDigits: number;
  formula: string;  // Human-readable explanation
}

/**
 * Calculate P&L for a trade.
 *
 * Formula: PnL = (exitPrice - entryPrice) * direction * contractSize * lotSize
 *
 * For XAUUSD (quote = USD): no additional conversion needed.
 * For pairs where quote ≠ USD: caller must supply quoteToUsdRate.
 *
 * Uses micro-units internally for precise arithmetic.
 */
export function calculatePnl(
  symbol: string,
  side: 'LONG' | 'SHORT' | 'BUY' | 'SELL',
  entryPrice: number,
  exitPrice: number,
  lotSize: number,
  quoteToUsdRate = 1.0   // For USD-quoted pairs this is always 1.0
): PnlResult {
  const info = normalizeSymbol(symbol);
  const contractSize = getContractSize(info.canonical);
  const direction: 1 | -1 = (side === 'LONG' || side === 'BUY') ? 1 : -1;

  const digits = Math.max(detectPriceDigits(entryPrice), detectPriceDigits(exitPrice));
  const entryMicro = priceToMicro(entryPrice, digits);
  const exitMicro = priceToMicro(exitPrice, digits);

  // diff in micro-units
  const diffMicro = exitMicro - entryMicro;
  const priceDiff = microToPrice(diffMicro < 0n ? -diffMicro : diffMicro, digits) * (diffMicro < 0n ? -1 : 1);

  // PnL in USD (micro-units)
  const factor = Math.pow(10, digits);
  // pnlMicro = diffMicro * direction * contractSize * lotSize * quoteToUsdRate / factor
  // We keep it as a float since lot/contractSize can be fractional
  const pnlRaw = (Number(diffMicro) / factor) * direction * contractSize * lotSize * quoteToUsdRate;
  const pnlMicro = BigInt(Math.round(pnlRaw * 100)); // store as cents

  const formula =
    `PnL = (${exitPrice} - ${entryPrice}) * ${direction} * ${contractSize}oz * ${lotSize}lot * ${quoteToUsdRate}` +
    ` = ${pnlRaw.toFixed(5)} USD`;

  return {
    pnlUsd: pnlRaw,
    pnlMicro,
    direction,
    contractSize,
    lotSize,
    priceDiff,
    priceDiffMicro: diffMicro < 0n ? -diffMicro : diffMicro,
    priceDigits: digits,
    formula,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// E. SPREAD / BID-ASK POLICY  (documented)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * POLICY (documented, not runtime-enforced since Dukascopy M1 is mid-price):
 *
 *   BUY  entry  → ASK  (ask = mid + spread/2)
 *   BUY  exit   → BID  (bid = mid - spread/2)
 *   SELL entry  → BID
 *   SELL exit   → ASK
 *
 * Since Dukascopy M1 OHLC data provides mid-market prices (no bid/ask split),
 * all SL/TP detection uses mid-price OHLC High/Low.
 * This introduces a slight conservative bias (real execution would differ by
 * 0.5 * spread per side).
 *
 * For XAUUSD on Dukascopy, typical spread is ~$0.20-0.40/oz.
 * This is captured in `priceGapPct` in the replay result for transparency.
 *
 * To apply spread adjustment, use adjustForSpread() below.
 */

/**
 * Adjust a price for half-spread.
 * side: direction of the trade (LONG/BUY or SHORT/SELL)
 * action: 'ENTRY' or 'EXIT'
 * midPrice: the mid-market price
 * halfSpread: half the broker spread (e.g. 0.10 for 0.20 spread)
 */
export function adjustForSpread(
  side: 'LONG' | 'SHORT' | 'BUY' | 'SELL',
  action: 'ENTRY' | 'EXIT',
  midPrice: number,
  halfSpread: number
): number {
  const isLong = side === 'LONG' || side === 'BUY';
  if (action === 'ENTRY') {
    return isLong ? midPrice + halfSpread : midPrice - halfSpread;
  } else {
    return isLong ? midPrice - halfSpread : midPrice + halfSpread;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// F. MULTI-TIMEFRAME M1 RESAMPLING
// ═══════════════════════════════════════════════════════════════════════════

export interface OHLCCandle {
  time: Date;        // UTC bar open time
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  realVolume?: number;
}

/**
 * Timeframe definitions (minutes per bar)
 */
export const TF_MINUTES: Record<string, number> = {
  M1:  1,
  M5:  5,
  M15: 15,
  M30: 30,
  H1:  60,
  H4:  240,
  D1:  1440,
  W1:  10080,
};

/**
 * Get the aligned bar open time for a given UTC timestamp and timeframe.
 * Policy: bar begins at the floor of the period boundary (UTC).
 *
 * Examples:
 *   M5 at 18:03 → 18:00
 *   H1 at 18:47 → 18:00
 *   D1 at 03:45 → 00:00
 */
export function getBarOpenTime(timestamp: Date, timeframe: string): Date {
  const tf = timeframe.toUpperCase();
  const ms = timestamp.getTime();
  const tfMs = (TF_MINUTES[tf] ?? 1) * 60_000;
  const barMs = Math.floor(ms / tfMs) * tfMs;
  return new Date(barMs);
}

/**
 * Resample an array of M1 candles (or any lower timeframe) into the target timeframe.
 *
 * Resampling rules (UTC-based):
 *   - Open  = first M1 candle's open within the bar
 *   - High  = max of all M1 highs
 *   - Low   = min of all M1 lows
 *   - Close = last M1 candle's close
 *   - Volume = sum of all M1 volumes
 *
 * Input candles must be sorted ascending by time.
 * Output candles are sorted ascending.
 *
 * NOTE: This is a pure in-memory function — it does NOT query the DB.
 * For large datasets, stream batches of M1 candles and call repeatedly.
 */
export function resampleCandles(
  m1Candles: OHLCCandle[],
  targetTimeframe: string
): OHLCCandle[] {
  if (m1Candles.length === 0) return [];

  const tf = targetTimeframe.toUpperCase();
  if (tf === 'M1') return [...m1Candles]; // No resampling needed

  const buckets = new Map<number, OHLCCandle[]>();

  for (const c of m1Candles) {
    const barOpen = getBarOpenTime(c.time, tf);
    const key = barOpen.getTime();
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(c);
  }

  const result: OHLCCandle[] = [];

  for (const [barMs, candles] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    const open = candles[0].open;
    const close = candles[candles.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let tickVolume = 0;
    let realVolume = 0;

    for (const c of candles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      tickVolume += c.tickVolume ?? 0;
      realVolume += c.realVolume ?? 0;
    }

    result.push({
      time: new Date(barMs),
      open,
      high,
      low,
      close,
      tickVolume,
      realVolume,
    });
  }

  return result;
}

/**
 * Entry bar alignment for a trade entry that falls mid-bar.
 *
 * POLICY (Option B — documented):
 *   Use the ACTUAL trade entry price (not the bar open) as the excursion
 *   reference. Start checking SL/TP from the NEXT bar after the entry bar.
 *   This avoids lookahead: you cannot have been filled on an earlier bar's
 *   open if your actual timestamp is mid-bar.
 *
 * "Option A" (conservative) would use the bar's open price — rejected here
 * because TradingView CSV provides the real broker fill price.
 */
export const ENTRY_POLICY = 'OPTION_B_USE_ACTUAL_ENTRY_PRICE' as const;

/**
 * Given a list of resampled candles and a trade entry time, split them into:
 *   - entryCandle: the bar containing the entry timestamp
 *   - subsequentCandles: all bars strictly AFTER the entry bar
 *
 * For SL/TP detection with OPTION_B:
 *   - The entry candle should NOT be used for SL/TP detection
 *     (you were filled mid-bar; the bar's H/L before fill is unknown)
 *   - SL/TP detection starts from subsequentCandles[0]
 *
 * Returns null entryCandle if no bar contains the entry timestamp.
 */
export function splitCandlesByEntry(
  candles: OHLCCandle[],
  entryTime: Date,
  timeframe: string
): {
  entryBarTime: Date;
  entryCandle: OHLCCandle | null;
  subsequentCandles: OHLCCandle[];
} {
  const entryBarTime = getBarOpenTime(entryTime, timeframe);
  const entryBarMs = entryBarTime.getTime();

  let entryCandle: OHLCCandle | null = null;
  const subsequentCandles: OHLCCandle[] = [];

  for (const c of candles) {
    const cMs = c.time.getTime();
    if (cMs === entryBarMs) {
      entryCandle = c;
    } else if (cMs > entryBarMs) {
      subsequentCandles.push(c);
    }
  }

  return { entryBarTime, entryCandle, subsequentCandles };
}

// ═══════════════════════════════════════════════════════════════════════════
// G. RR SIMULATION CORE (micro-unit safe, multi-timeframe)
// ═══════════════════════════════════════════════════════════════════════════

export type FirstHit = 'TP' | 'SL' | 'AMBIGUOUS' | 'NONE';

export interface RRSimResult {
  firstHit: FirstHit;
  firstHitCandle: OHLCCandle | null;
  mfePrice: number;
  maePrice: number;
  mfeMicro: bigint;
  maeMicro: bigint;
  riskMicro: bigint;
  riskDistance: number;
  mfeDistance: number;
  maeDistance: number;
  maxPotentialRR: number;
  candlesScanned: number;
  priceDigits: number;
}

/**
 * Run the RR simulation over a sequence of OHLC candles.
 *
 * Parameters:
 *   side: LONG or SHORT
 *   entryPrice: actual broker fill price
 *   slPrice: stop-loss level (micro-safe comparison)
 *   tpPrice: take-profit level (micro-safe comparison)
 *   exitTime: hard cutoff — never scan candles after this timestamp
 *   candles: sorted ascending, must NOT include the entry candle
 *             (for OPTION_B policy — start from next bar after entry)
 *
 * Intrabar ambiguity policy (when BOTH SL and TP are within same candle):
 *   → Mark as AMBIGUOUS (not LOSS, not WIN — let caller decide)
 *   → Conservative analysis should count AMBIGUOUS as LOSS
 */
export function runRRSimulation(
  side: 'LONG' | 'SHORT' | 'BUY' | 'SELL',
  entryPrice: number,
  slPrice: number,
  tpPrice: number,
  exitTime: Date,
  candles: OHLCCandle[]
): RRSimResult {
  const isLong = side === 'LONG' || side === 'BUY';
  const digits = Math.max(
    detectPriceDigits(entryPrice),
    detectPriceDigits(slPrice),
    detectPriceDigits(tpPrice)
  );

  const entryMicro = priceToMicro(entryPrice, digits);
  const slMicro = priceToMicro(slPrice, digits);
  const tpMicro = priceToMicro(tpPrice, digits);
  const riskMicro = isLong ? entryMicro - slMicro : slMicro - entryMicro;
  const riskDistance = microToPrice(riskMicro < 0n ? 0n : riskMicro, digits);

  let mfeMicro = entryMicro;
  let maeMicro = entryMicro;
  let firstHit: FirstHit = 'NONE';
  let firstHitCandle: OHLCCandle | null = null;
  let candlesScanned = 0;
  const exitMs = exitTime.getTime();

  for (const c of candles) {
    // Hard stop: never scan past exit time
    if (c.time.getTime() > exitMs) break;

    candlesScanned++;
    const highMicro = priceToMicro(c.high, digits);
    const lowMicro = priceToMicro(c.low, digits);

    if (isLong) {
      // Update MAE (lowest low)
      if (lowMicro < maeMicro) maeMicro = lowMicro;

      const hitSL = lowMicro <= slMicro;
      const hitTP = highMicro >= tpMicro;

      if (hitSL && hitTP) {
        firstHit = 'AMBIGUOUS';
        firstHitCandle = c;
        // Still update MFE before breaking (for partial capture analysis)
        if (highMicro > mfeMicro) mfeMicro = highMicro;
        break;
      }
      if (hitSL) {
        firstHit = 'SL';
        firstHitCandle = c;
        break;
      }
      if (hitTP) {
        firstHit = 'TP';
        firstHitCandle = c;
        if (highMicro > mfeMicro) mfeMicro = highMicro;
        break;
      }

      if (highMicro > mfeMicro) mfeMicro = highMicro;
    } else {
      // SHORT
      // Update MAE (highest high)
      if (highMicro > maeMicro) maeMicro = highMicro;

      const hitSL = highMicro >= slMicro;
      const hitTP = lowMicro <= tpMicro;

      if (hitSL && hitTP) {
        firstHit = 'AMBIGUOUS';
        firstHitCandle = c;
        if (lowMicro < mfeMicro) mfeMicro = lowMicro;
        break;
      }
      if (hitSL) {
        firstHit = 'SL';
        firstHitCandle = c;
        break;
      }
      if (hitTP) {
        firstHit = 'TP';
        firstHitCandle = c;
        if (lowMicro < mfeMicro) mfeMicro = lowMicro;
        break;
      }

      if (lowMicro < mfeMicro) mfeMicro = lowMicro;
    }
  }

  const mfeDistance = isLong
    ? microToPrice(mfeMicro > entryMicro ? mfeMicro - entryMicro : 0n, digits)
    : microToPrice(entryMicro > mfeMicro ? entryMicro - mfeMicro : 0n, digits);

  const maeDistance = isLong
    ? microToPrice(entryMicro > maeMicro ? entryMicro - maeMicro : 0n, digits)
    : microToPrice(maeMicro > entryMicro ? maeMicro - entryMicro : 0n, digits);

  const mfeMicroDist = isLong
    ? (mfeMicro > entryMicro ? mfeMicro - entryMicro : 0n)
    : (entryMicro > mfeMicro ? entryMicro - mfeMicro : 0n);

  const maxPotentialRR = riskMicro > 0n
    ? Number(mfeMicroDist) / Number(riskMicro)
    : 0;

  return {
    firstHit,
    firstHitCandle,
    mfePrice: microToPrice(mfeMicro, digits),
    maePrice: microToPrice(maeMicro, digits),
    mfeMicro: mfeMicroDist,
    maeMicro: isLong
      ? (entryMicro > maeMicro ? entryMicro - maeMicro : 0n)
      : (maeMicro > entryMicro ? maeMicro - entryMicro : 0n),
    riskMicro: riskMicro < 0n ? 0n : riskMicro,
    riskDistance,
    mfeDistance,
    maeDistance,
    maxPotentialRR,
    candlesScanned,
    priceDigits: digits,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// H. SYNTHETIC SL/TP INFERENCE (from backtestRR)
// ═══════════════════════════════════════════════════════════════════════════

export interface SLTPResult {
  slPrice: number;
  tpPrice: number;
  riskDistance: number;
  rewardDistance: number;
  actualRR: number | null;
  effectiveRR: number;
  source: 'ACTUAL' | 'MANUAL' | 'INFERRED_FROM_LOSS' | 'INFERRED_FROM_WIN';
  priceDigits: number;
}

/**
 * Infer or validate SL and TP for a trade.
 *
 * Priority 1: Actual SL and TP present on trade (bukan 0/kosong/null)
 *   - For LONG:  risk = entry - SL, reward = TP - entry, actualRR = (TP - entry) / (entry - SL)
 *   - For SHORT: risk = SL - entry, reward = entry - TP, actualRR = (entry - TP) / (SL - entry)
 *   - Ignores input backtestRR.
 *
 * Priority 2: Manual SL only or Manual TP only
 *
 * Priority 3: Reconstruction based on exit price and backtestRR (synthetic SL/TP)
 */
export function inferSLTP(
  side: 'LONG' | 'SHORT' | 'BUY' | 'SELL',
  entryPrice: number,
  exitPrice: number,
  result: string | null,
  backtestRR: number,
  actualSL?: number | null,
  actualTP?: number | null
): SLTPResult | null {
  const isLong = side === 'LONG' || side === 'BUY';
  const digits = Math.max(
    detectPriceDigits(entryPrice),
    detectPriceDigits(exitPrice),
    actualSL ? detectPriceDigits(actualSL) : 0,
    actualTP ? detectPriceDigits(actualTP) : 0
  );

  const entryMicro = priceToMicro(entryPrice, digits);

  // Priority 1: Both actual SL and actual TP are valid (> 0)
  if (actualSL != null && actualSL > 0 && actualTP != null && actualTP > 0) {
    const slMicro = priceToMicro(actualSL, digits);
    const tpMicro = priceToMicro(actualTP, digits);

    const riskMicro = isLong ? entryMicro - slMicro : slMicro - entryMicro;
    const rewardMicro = isLong ? tpMicro - entryMicro : entryMicro - tpMicro;

    if (riskMicro > 0n && rewardMicro > 0n) {
      const riskDist = microToPrice(riskMicro, digits);
      const rewardDist = microToPrice(rewardMicro, digits);
      const actualRR = riskDist > 0 ? rewardDist / riskDist : backtestRR;

      return {
        slPrice: actualSL,
        tpPrice: actualTP,
        riskDistance: riskDist,
        rewardDistance: rewardDist,
        actualRR,
        effectiveRR: actualRR,
        source: 'ACTUAL',
        priceDigits: digits,
      };
    }
  }

  // Priority 2a: Only actual SL is provided (> 0)
  if (actualSL != null && actualSL > 0) {
    const slMicro = priceToMicro(actualSL, digits);
    const riskMicro = isLong ? entryMicro - slMicro : slMicro - entryMicro;
    if (riskMicro > 0n) {
      const rewardMicro = BigInt(Math.round(Number(riskMicro) * backtestRR));
      const tpMicro = isLong ? entryMicro + rewardMicro : entryMicro - rewardMicro;
      const riskDist = microToPrice(riskMicro, digits);
      const rewardDist = microToPrice(rewardMicro, digits);

      return {
        slPrice: actualSL,
        tpPrice: microToPrice(tpMicro, digits),
        riskDistance: riskDist,
        rewardDistance: rewardDist,
        actualRR: null,
        effectiveRR: backtestRR,
        source: 'MANUAL',
        priceDigits: digits,
      };
    }
  }

  // Priority 2b: Only actual TP is provided (> 0)
  if (actualTP != null && actualTP > 0) {
    const tpMicro = priceToMicro(actualTP, digits);
    const rewardMicro = isLong ? tpMicro - entryMicro : entryMicro - tpMicro;
    if (rewardMicro > 0n) {
      const riskMicro = BigInt(Math.round(Number(rewardMicro) / backtestRR));
      const validRiskMicro = riskMicro > 0n ? riskMicro : 1n;
      const slMicro = isLong ? entryMicro - validRiskMicro : entryMicro + validRiskMicro;
      const riskDist = microToPrice(validRiskMicro, digits);
      const rewardDist = microToPrice(rewardMicro, digits);

      return {
        slPrice: microToPrice(slMicro, digits),
        tpPrice: actualTP,
        riskDistance: riskDist,
        rewardDistance: rewardDist,
        actualRR: null,
        effectiveRR: backtestRR,
        source: 'MANUAL',
        priceDigits: digits,
      };
    }
  }

  // Priority 3: Reconstruction from exitPrice and backtestRR
  const resultUpper = (result ?? '').toUpperCase();
  if (resultUpper === 'LOSS') {
    const rawDiffMicro = isLong
      ? priceToMicro(entryPrice, digits) - priceToMicro(exitPrice, digits)
      : priceToMicro(exitPrice, digits) - priceToMicro(entryPrice, digits);
    const absDiffMicro = rawDiffMicro > 0n ? rawDiffMicro : (rawDiffMicro < 0n ? -rawDiffMicro : priceToMicro(entryPrice * 0.001, digits));
    const riskMicro = absDiffMicro > 0n ? absDiffMicro : 1n;

    const rewardMicro = BigInt(Math.round(Number(riskMicro) * backtestRR));
    const slMicro = isLong
      ? priceToMicro(entryPrice, digits) - riskMicro
      : priceToMicro(entryPrice, digits) + riskMicro;
    const tpMicro = isLong
      ? priceToMicro(entryPrice, digits) + rewardMicro
      : priceToMicro(entryPrice, digits) - rewardMicro;

    return {
      slPrice: microToPrice(slMicro, digits),
      tpPrice: microToPrice(tpMicro, digits),
      riskDistance: microToPrice(riskMicro, digits),
      rewardDistance: microToPrice(rewardMicro, digits),
      actualRR: null,
      effectiveRR: backtestRR,
      source: 'INFERRED_FROM_LOSS',
      priceDigits: digits,
    };
  }

  // WIN trade — exit is used to infer reward, back-calculate risk
  const rawRewardMicro = isLong
    ? priceToMicro(exitPrice, digits) - priceToMicro(entryPrice, digits)
    : priceToMicro(entryPrice, digits) - priceToMicro(exitPrice, digits);
  const absRewardMicro = rawRewardMicro > 0n ? rawRewardMicro : (rawRewardMicro < 0n ? -rawRewardMicro : priceToMicro(entryPrice * 0.001, digits));
  const rewardMicro = absRewardMicro > 0n ? absRewardMicro : 1n;

  const riskMicro = BigInt(Math.round(Number(rewardMicro) / backtestRR));
  const validRiskMicro = riskMicro > 0n ? riskMicro : 1n;

  const slMicro = isLong
    ? priceToMicro(entryPrice, digits) - validRiskMicro
    : priceToMicro(entryPrice, digits) + validRiskMicro;
  const tpMicro = isLong
    ? priceToMicro(entryPrice, digits) + rewardMicro
    : priceToMicro(entryPrice, digits) - rewardMicro;

  return {
    slPrice: microToPrice(slMicro, digits),
    tpPrice: microToPrice(tpMicro, digits),
    riskDistance: microToPrice(validRiskMicro, digits),
    rewardDistance: microToPrice(rewardMicro, digits),
    actualRR: null,
    effectiveRR: backtestRR,
    source: 'INFERRED_FROM_WIN',
    priceDigits: digits,
  };
}
