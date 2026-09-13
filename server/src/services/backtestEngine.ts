/**
 * ReplayFX Journal — XAUUSD M1 Backtest Engine (Pure Logic)
 * 
 * Strict Look-Ahead Bias Protected Replay & Trade Engine.
 * 
 * Rules:
 * 1. At replay index N, VISIBLE data is ONLY candles[0 ... N].
 * 2. Contract size for XAUUSD = 100 oz / lot.
 * 3. Intrabar ambiguity occurs when low <= SL and high >= TP in the same M1 candle.
 */

export interface BacktestCandle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  realVolume?: number;
}

export type TradeSide = 'LONG' | 'SHORT';
export type TradeStatus = 'PENDING' | 'OPEN' | 'CLOSED' | 'CANCELLED';
export type ExitReason = 'TP' | 'SL' | 'MANUAL' | 'INTRABAR_AMBIGUOUS';

export type OrderCategory = 'MARKET' | 'LIMIT' | 'STOP';
export type OrderDirection = 'BUY' | 'SELL';
export type OrderExecutionType =
  | 'MARKET_BUY'
  | 'MARKET_SELL'
  | 'BUY_LIMIT'
  | 'SELL_LIMIT'
  | 'BUY_STOP'
  | 'SELL_STOP';

export interface EffectiveOrderClassification {
  category: OrderCategory;
  orderType: OrderExecutionType;
  isPending: boolean;
  tolerance: number;
}

export interface OrderValidationResult {
  isValid: boolean;
  error?: string;
}

export interface BacktestTradeInput {
  id?: string;
  tradeNumber?: number;
  orderType?: OrderExecutionType;
  side: TradeSide;
  entryPrice: number;
  entryTime: Date;
  slPrice: number;
  tpPrice: number;
  volume: number;
  riskAmount?: number;
  status?: TradeStatus;
}

export interface BacktestTradeRecord {
  id: string;
  tradeNumber: number;
  orderType?: OrderExecutionType | null;
  side: TradeSide;
  entryPrice: number;
  entryTime: Date;
  slPrice: number;
  tpPrice: number;
  exitPrice: number | null;
  exitTime: Date | null;
  exitReason: ExitReason | null;
  volume: number;
  riskAmount: number;
  pnl: number | null;
  rr: number | null;
  status: TradeStatus;
}

export interface HitEvaluation {
  type: 'NONE' | 'TP' | 'SL' | 'INTRABAR_AMBIGUOUS';
  exitPrice: number | null;
  exitTime: Date | null;
  reason: ExitReason | null;
  message?: string;
}

export interface BacktestStats {
  initialBalance: number;
  currentBalance: number;
  equity: number;
  netPnl: number;
  totalTrades: number;
  wins: number;
  losses: number;
  ambiguous: number;
  winRate: number;
  profitFactor: number;
  avgRR: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
}

export const XAUUSD_CONTRACT_SIZE = 100; // 100 troy ounces per lot

/**
 * Returns the contract size multiplier for a given financial symbol.
 * - XAUUSD / Gold: 100 oz per lot ($100/point for 1.00 lot)
 * - NSXUSD / NAS100 / USTEC: 1 index point = $1 per lot (standard CFD contract)
 * - Forex majors (EURUSD, GBPUSD): 100,000 units per lot
 */
export function getSymbolContractSize(symbol?: string): number {
  const sym = (symbol || '').toUpperCase();
  if (sym === 'XAUUSD' || sym === 'GOLD') return 100;
  if (sym.includes('NSX') || sym.includes('NAS') || sym.includes('USTEC') || sym.includes('US100') || sym.includes('NDX')) return 1;
  if (sym.includes('EUR') || sym.includes('GBP') || sym.includes('JPY') || sym.includes('AUD')) return 100000;
  return 100;
}

/**
 * Returns reasonable default SL distance in points based on price scale of the symbol.
 * - XAUUSD: ~1.5 points (micro-distance for M1/M5 charts)
 * - NSXUSD / Nasdaq: ~25.0 points
 * - Forex: ~0.0020 (20 pips)
 */
export function getDefaultSlDistance(symbol?: string): number {
  const sym = (symbol || '').toUpperCase();
  if (sym === 'XAUUSD' || sym === 'GOLD') return 1.5;
  if (sym.includes('NSX') || sym.includes('NAS') || sym.includes('USTEC') || sym.includes('US100') || sym.includes('NDX')) return 25.0;
  if (sym.includes('EUR') || sym.includes('GBP') || sym.includes('AUD')) return 0.0020;
  return 1.5;
}

/**
 * Calculates adaptive pending entry offset and SL distance based on recent candle volatility.
 */
export function calculateAdaptiveOffsets(
  candles: Array<{ high: number; low: number; close?: number }>,
  currentPrice: number,
  symbol?: string
): { pendingOffset: number; slDistance: number } {
  const sym = (symbol || '').toUpperCase();
  const isGold = sym.includes('XAU') || sym.includes('GOLD');
  const isNasdaq = sym.includes('NSX') || sym.includes('NAS') || sym.includes('USTEC') || sym.includes('US100') || sym.includes('NDX');
  const isForex = sym.includes('EUR') || sym.includes('GBP') || sym.includes('AUD');

  const recentBars = candles && candles.length > 0 ? candles.slice(-5) : [];
  const avgBarRange = recentBars.length > 0
    ? recentBars.reduce((acc, c) => acc + Math.max(0, c.high - c.low), 0) / recentBars.length
    : (isGold ? 1.0 : isNasdaq ? 15.0 : 0.0010);

  if (isGold) {
    const pendingOffset = Math.max(0.5, Math.min(Math.max(avgBarRange * 1.5, 0.5), currentPrice > 0 ? Math.max(0.5, currentPrice * 0.0005) : 1.5));
    const slDistance = Math.max(1.0, Math.min(Math.max(avgBarRange * 2.0, 1.0), currentPrice > 0 ? Math.max(1.0, currentPrice * 0.001) : 2.5));
    return {
      pendingOffset: Math.round(pendingOffset * 100) / 100,
      slDistance: Math.round(slDistance * 100) / 100,
    };
  } else if (isNasdaq) {
    const pendingOffset = Math.max(5.0, Math.min(Math.max(avgBarRange * 1.5, 5.0), currentPrice > 0 ? currentPrice * 0.002 : 25.0));
    const slDistance = Math.max(10.0, Math.min(Math.max(avgBarRange * 2.0, 10.0), currentPrice > 0 ? currentPrice * 0.005 : 50.0));
    return {
      pendingOffset: Math.round(pendingOffset * 10) / 10,
      slDistance: Math.round(slDistance * 10) / 10,
    };
  } else if (isForex) {
    const pendingOffset = Math.max(0.0005, Math.min(Math.max(avgBarRange * 1.5, 0.0005), 0.0020));
    const slDistance = Math.max(0.0010, Math.min(Math.max(avgBarRange * 2.0, 0.0010), 0.0050));
    return {
      pendingOffset: Math.round(pendingOffset * 100000) / 100000,
      slDistance: Math.round(slDistance * 100000) / 100000,
    };
  }

  const pendingOffset = Math.max(0.5, Math.min(Math.max(avgBarRange * 1.5, 0.5), currentPrice > 0 ? currentPrice * 0.001 : 2.0));
  const slDistance = Math.max(1.0, Math.min(Math.max(avgBarRange * 2.0, 1.0), currentPrice > 0 ? currentPrice * 0.002 : 5.0));
  return {
    pendingOffset: Math.round(pendingOffset * 100) / 100,
    slDistance: Math.round(slDistance * 100) / 100,
  };
}

/**
 * Calculates adaptive SL distance based on recent candle price range.
 */
export function calculateAdaptiveSlDistance(
  candles: Array<{ high: number; low: number; close?: number }>,
  currentPrice: number,
  symbol?: string
): number {
  return calculateAdaptiveOffsets(candles, currentPrice, symbol).slDistance;
}

/**
 * Returns the precision tolerance in price points for classification of market vs pending.
 * - XAUUSD / GOLD: 0.02 (2 cents / minimal price step)
 * - NSXUSD / Indices: 0.1
 * - EURUSD / Forex majors: 0.0001 (1 pip)
 */
export function getSymbolPriceTolerance(symbol?: string): number {
  const sym = (symbol || '').toUpperCase();
  if (sym.includes('NSX') || sym.includes('NAS') || sym.includes('USTEC') || sym.includes('US100') || sym.includes('NDX') || sym.includes('US30') || sym.includes('DJI') || sym.includes('SPX') || sym.includes('US500')) return 0.1;
  if (sym.includes('XAU') || sym.includes('GOLD')) return 0.02;
  if (sym.includes('EUR') || sym.includes('GBP') || sym.includes('AUD') || sym.includes('USD')) {
    if (sym.includes('JPY')) return 0.02;
    return 0.0001;
  }
  return 0.02;
}

/**
 * Centralized Domain Logic for Effective Order Type Auto-Classification:
 *
 * For SELL:
 * |entry - market| <= tolerance -> MARKET_SELL (category: MARKET, isPending: false)
 * entry > market + tolerance    -> SELL_LIMIT (category: LIMIT, isPending: true)
 * entry < market - tolerance    -> SELL_STOP  (category: STOP, isPending: true)
 *
 * For BUY:
 * |entry - market| <= tolerance -> MARKET_BUY  (category: MARKET, isPending: false)
 * entry < market - tolerance    -> BUY_LIMIT   (category: LIMIT, isPending: true)
 * entry > market + tolerance    -> BUY_STOP    (category: STOP, isPending: true)
 */
export function getEffectiveOrderType(params: {
  direction: OrderDirection;
  entryPrice: number;
  marketPrice: number;
  symbol?: string;
  requestedCategory?: OrderCategory;
}): EffectiveOrderClassification {
  const { direction, entryPrice, marketPrice, symbol, requestedCategory } = params;
  const tolerance = getSymbolPriceTolerance(symbol);

  if (entryPrice <= 0 || marketPrice <= 0) {
    const cat = requestedCategory || 'MARKET';
    return {
      category: cat,
      orderType: (cat === 'MARKET'
        ? (direction === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL')
        : cat === 'LIMIT'
          ? (direction === 'BUY' ? 'BUY_LIMIT' : 'SELL_LIMIT')
          : (direction === 'BUY' ? 'BUY_STOP' : 'SELL_STOP')),
      isPending: cat !== 'MARKET',
      tolerance,
    };
  }

  const diff = Math.round((entryPrice - marketPrice) * 10000) / 10000;

  if (Math.abs(diff) <= tolerance) {
    return {
      category: 'MARKET',
      orderType: direction === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL',
      isPending: false,
      tolerance,
    };
  }

  if (direction === 'BUY') {
    if (diff < -tolerance) {
      return {
        category: 'LIMIT',
        orderType: 'BUY_LIMIT',
        isPending: true,
        tolerance,
      };
    } else {
      return {
        category: 'STOP',
        orderType: 'BUY_STOP',
        isPending: true,
        tolerance,
      };
    }
  } else {
    // SELL
    if (diff > tolerance) {
      return {
        category: 'LIMIT',
        orderType: 'SELL_LIMIT',
        isPending: true,
        tolerance,
      };
    } else {
      return {
        category: 'STOP',
        orderType: 'SELL_STOP',
        isPending: true,
        tolerance,
      };
    }
  }
}

/**
 * Checks whether a candle hits a pending order's entry level
 */
export function evaluatePendingOrderTrigger(
  order: { orderType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | OrderExecutionType; entryPrice: number },
  candle: { high: number; low: number }
): boolean {
  switch (order.orderType) {
    case 'BUY_LIMIT':
      return candle.low <= order.entryPrice;
    case 'BUY_STOP':
      return candle.high >= order.entryPrice;
    case 'SELL_LIMIT':
      return candle.high >= order.entryPrice;
    case 'SELL_STOP':
      return candle.low <= order.entryPrice;
    default:
      return false;
  }
}

/**
 * Validates price relationships according to professional broker rules
 */
export function validateOrderPrices(
  orderType: OrderExecutionType,
  currentPrice: number,
  entryPrice: number,
  slPrice?: number | null,
  tpPrice?: number | null,
  symbol?: string
): OrderValidationResult {
  if (entryPrice <= 0) {
    return { isValid: false, error: 'Harga Entry harus lebih besar dari 0.' };
  }

  const tolerance = getSymbolPriceTolerance(symbol);
  const pricePrecision = (symbol && (symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('AUD'))) ? 4 : 2;
  const curStr = currentPrice.toFixed(pricePrecision);
  const entStr = entryPrice.toFixed(pricePrecision);

  const numSL = slPrice && slPrice > 0 ? slPrice : 0;
  const numTP = tpPrice && tpPrice > 0 ? tpPrice : 0;

  switch (orderType) {
    case 'MARKET_BUY':
      if (currentPrice > 0 && Math.abs(entryPrice - currentPrice) > tolerance) {
        return {
          isValid: false,
          error: `Market Buy tidak valid: Entry ($${entStr}) berada di luar harga market ($${curStr}). Gunakan Pending Order.`,
        };
      }
      if (numSL > 0 && numSL >= entryPrice) {
        return { isValid: false, error: 'Market Buy: Stop Loss harus berada di bawah harga Entry.' };
      }
      if (numTP > 0 && numTP <= entryPrice) {
        return { isValid: false, error: 'Market Buy: Take Profit harus berada di atas harga Entry.' };
      }
      return { isValid: true };

    case 'MARKET_SELL':
      if (currentPrice > 0 && Math.abs(entryPrice - currentPrice) > tolerance) {
        return {
          isValid: false,
          error: `Market Sell tidak valid: Entry ($${entStr}) berada di luar harga market ($${curStr}). Gunakan Pending Order.`,
        };
      }
      if (numSL > 0 && numSL <= entryPrice) {
        return { isValid: false, error: 'Market Sell: Stop Loss harus berada di atas harga Entry.' };
      }
      if (numTP > 0 && numTP >= entryPrice) {
        return { isValid: false, error: 'Market Sell: Take Profit harus berada di bawah harga Entry.' };
      }
      return { isValid: true };

    case 'BUY_LIMIT':
      if (currentPrice > 0 && entryPrice > currentPrice - tolerance) {
        return {
          isValid: false,
          error: `Buy Limit: Entry ($${entStr}) harus berada di bawah harga saat ini ($${curStr}).`,
        };
      }
      if (numSL > 0 && numSL >= entryPrice) {
        return { isValid: false, error: 'Buy Limit: Stop Loss harus berada di bawah harga Entry.' };
      }
      if (numTP > 0 && numTP <= entryPrice) {
        return { isValid: false, error: 'Buy Limit: Take Profit harus berada di atas harga Entry.' };
      }
      return { isValid: true };

    case 'BUY_STOP':
      if (currentPrice > 0 && entryPrice < currentPrice + tolerance) {
        return {
          isValid: false,
          error: `Buy Stop: Entry ($${entStr}) harus berada di atas harga saat ini ($${curStr}).`,
        };
      }
      if (numSL > 0 && numSL >= entryPrice) {
        return { isValid: false, error: 'Buy Stop: Stop Loss harus berada di bawah harga Entry.' };
      }
      if (numTP > 0 && numTP <= entryPrice) {
        return { isValid: false, error: 'Buy Stop: Take Profit harus berada di atas harga Entry.' };
      }
      return { isValid: true };

    case 'SELL_LIMIT':
      if (currentPrice > 0 && entryPrice < currentPrice + tolerance) {
        return {
          isValid: false,
          error: `Sell Limit: Entry ($${entStr}) harus berada di atas harga saat ini ($${curStr}).`,
        };
      }
      if (numSL > 0 && numSL <= entryPrice) {
        return { isValid: false, error: 'Sell Limit: Stop Loss harus berada di atas harga Entry.' };
      }
      if (numTP > 0 && numTP >= entryPrice) {
        return { isValid: false, error: 'Sell Limit: Take Profit harus berada di bawah harga Entry.' };
      }
      return { isValid: true };

    case 'SELL_STOP':
      if (currentPrice > 0 && entryPrice > currentPrice - tolerance) {
        return {
          isValid: false,
          error: `Sell Stop: Entry ($${entStr}) harus berada di bawah harga saat ini ($${curStr}).`,
        };
      }
      if (numSL > 0 && numSL <= entryPrice) {
        return { isValid: false, error: 'Sell Stop: Stop Loss harus berada di atas harga Entry.' };
      }
      if (numTP > 0 && numTP <= entryPrice) {
        return { isValid: false, error: 'Sell Stop: Take Profit harus berada di bawah harga Entry.' };
      }
      return { isValid: true };
  }
}

/**
 * Returns ONLY candles up to replayIndex.
 * Throws an explicit error if replayIndex attempts to exceed available boundary.
 */
export function getVisibleCandles(candles: BacktestCandle[], replayIndex: number): BacktestCandle[] {
  if (!candles || candles.length === 0) return [];
  if (replayIndex < 0) return [];
  if (replayIndex >= candles.length) {
    throw new Error(`Look-ahead guard: replayIndex (${replayIndex}) exceeds available candles length (${candles.length}).`);
  }
  return candles.slice(0, replayIndex + 1);
}

/**
 * Advances replay position by exactly 1 candle.
 */
export function advanceReplay(currentIndex: number, maxIndex: number): number {
  if (currentIndex < 0) return 0;
  if (currentIndex >= maxIndex) return maxIndex;
  return currentIndex + 1;
}

/**
 * Steps back replay position by 1 candle.
 */
export function stepBackReplay(currentIndex: number): number {
  if (currentIndex <= 0) return 0;
  return currentIndex - 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. POSITION SIZING & RISK/REWARD CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate lot size for XAUUSD (100 oz/lot).
 * Lot Size = (Balance * Risk% / 100) / (|Entry - SL| * ContractSize)
 */
export function calculatePositionSize(
  balance: number,
  riskPercent: number,
  entryPrice: number,
  slPrice: number,
  contractSize = XAUUSD_CONTRACT_SIZE
): number {
  if (balance <= 0 || riskPercent <= 0 || entryPrice <= 0 || slPrice <= 0 || contractSize <= 0) {
    return 0;
  }
  const riskAmount = (balance * riskPercent) / 100;
  const priceRisk = Math.abs(entryPrice - slPrice);

  if (priceRisk <= 0.000001 || !Number.isFinite(priceRisk) || !Number.isFinite(riskAmount)) {
    return 0;
  }

  const rawLots = riskAmount / (priceRisk * contractSize);
  if (!Number.isFinite(rawLots) || rawLots <= 0) return 0;

  // Standard 2-decimal precision for lots (0.01 step)
  return Math.max(0.01, Math.round(rawLots * 100) / 100);
}

/**
 * Validate and calculate Risk, Reward, and Risk-to-Reward ratio (RR).
 */
export function calculateRR(
  side: TradeSide,
  entryPrice: number,
  slPrice: number,
  tpPrice: number
): { risk: number; reward: number; rr: number; isValid: boolean; error?: string } {
  if (entryPrice <= 0 || slPrice <= 0 || tpPrice <= 0) {
    return { risk: 0, reward: 0, rr: 0, isValid: false, error: 'Harga harus lebih besar dari 0' };
  }

  if (side === 'LONG') {
    if (slPrice >= entryPrice) {
      return { risk: 0, reward: 0, rr: 0, isValid: false, error: 'Untuk LONG, Stop Loss harus berada di bawah harga Entry.' };
    }
    if (tpPrice <= entryPrice) {
      return { risk: 0, reward: 0, rr: 0, isValid: false, error: 'Untuk LONG, Take Profit harus berada di atas harga Entry.' };
    }
    const risk = entryPrice - slPrice;
    const reward = tpPrice - entryPrice;
    const rr = risk > 0 ? reward / risk : 0;
    return { risk, reward, rr: Math.round(rr * 100) / 100, isValid: true };
  } else {
    // SHORT
    if (slPrice <= entryPrice) {
      return { risk: 0, reward: 0, rr: 0, isValid: false, error: 'Untuk SHORT, Stop Loss harus berada di atas harga Entry.' };
    }
    if (tpPrice >= entryPrice) {
      return { risk: 0, reward: 0, rr: 0, isValid: false, error: 'Untuk SHORT, Take Profit harus berada di bawah harga Entry.' };
    }
    const risk = slPrice - entryPrice;
    const reward = entryPrice - tpPrice;
    const rr = risk > 0 ? reward / risk : 0;
    return { risk, reward, rr: Math.round(rr * 100) / 100, isValid: true };
  }
}

/**
 * Quick RR helper: Calculate target TP from target RR ratio.
 */
export function calculateTPFromRR(
  side: TradeSide,
  entryPrice: number,
  slPrice: number,
  targetRR: number
): number {
  if (entryPrice <= 0 || slPrice <= 0 || targetRR <= 0) return 0;
  const risk = Math.abs(entryPrice - slPrice);
  const reward = risk * targetRR;

  if (side === 'LONG') {
    return Math.round((entryPrice + reward) * 1000) / 1000;
  } else {
    return Math.round((entryPrice - reward) * 1000) / 1000;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. CANDLE EVALUATION (SL / TP / INTRABAR AMBIGUITY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluates whether the current candle hits SL, TP, or both (Intrabar Ambiguity).
 */
export function evaluateCandleHit(
  trade: { side: TradeSide; entryPrice: number; slPrice: number; tpPrice: number },
  candle: BacktestCandle
): HitEvaluation {
  const { side, slPrice, tpPrice } = trade;

  if (side === 'LONG') {
    const hitSL = slPrice > 0 && candle.low <= slPrice;
    const hitTP = tpPrice > 0 && candle.high >= tpPrice;

    if (hitSL && hitTP) {
      return {
        type: 'INTRABAR_AMBIGUOUS',
        exitPrice: candle.close,
        exitTime: candle.time,
        reason: 'INTRABAR_AMBIGUOUS',
        message: 'Both SL and TP were reached inside the same M1 candle. Intrabar order cannot be determined from OHLC data.',
      };
    }
    if (hitSL) {
      return {
        type: 'SL',
        exitPrice: slPrice,
        exitTime: candle.time,
        reason: 'SL',
      };
    }
    if (hitTP) {
      return {
        type: 'TP',
        exitPrice: tpPrice,
        exitTime: candle.time,
        reason: 'TP',
      };
    }
  } else {
    // SHORT
    const hitSL = slPrice > 0 && candle.high >= slPrice;
    const hitTP = tpPrice > 0 && candle.low <= tpPrice;

    if (hitSL && hitTP) {
      return {
        type: 'INTRABAR_AMBIGUOUS',
        exitPrice: candle.close,
        exitTime: candle.time,
        reason: 'INTRABAR_AMBIGUOUS',
        message: 'Both SL and TP were reached inside the same M1 candle. Intrabar order cannot be determined from OHLC data.',
      };
    }
    if (hitSL) {
      return {
        type: 'SL',
        exitPrice: slPrice,
        exitTime: candle.time,
        reason: 'SL',
      };
    }
    if (hitTP) {
      return {
        type: 'TP',
        exitPrice: tpPrice,
        exitTime: candle.time,
        reason: 'TP',
      };
    }
  }

  return { type: 'NONE', exitPrice: null, exitTime: null, reason: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PNL & ACCOUNT TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate trade PnL in USD.
 * Formula for XAUUSD:
 *   LONG:  (exitPrice - entryPrice) * volume * contractSize
 *   SHORT: (entryPrice - exitPrice) * volume * contractSize
 */
export function calculatePnL(
  side: TradeSide,
  entryPrice: number,
  exitPrice: number,
  volume: number,
  contractSize = XAUUSD_CONTRACT_SIZE
): number {
  if (volume <= 0 || contractSize <= 0) return 0;

  const rawPnl = side === 'LONG'
    ? (exitPrice - entryPrice) * volume * contractSize
    : (entryPrice - exitPrice) * volume * contractSize;

  return Math.round(rawPnl * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. INDICATORS (ZERO LOOK-AHEAD)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculates Simple Moving Average (SMA) strictly up to each candle.
 * SMA at candle N = average of closes [N - period + 1 ... N].
 */
export function calculateSMA(
  candles: BacktestCandle[],
  period: number
): Array<{ time: Date; value: number | null }> {
  if (!candles || candles.length === 0 || period <= 0) return [];

  const result: Array<{ time: Date; value: number | null }> = [];
  let runningSum = 0;

  for (let i = 0; i < candles.length; i++) {
    runningSum += candles[i].close;

    if (i >= period) {
      runningSum -= candles[i - period].close;
    }

    if (i >= period - 1) {
      result.push({
        time: candles[i].time,
        value: Math.round((runningSum / period) * 1000) / 1000,
      });
    } else {
      result.push({
        time: candles[i].time,
        value: null,
      });
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. BACKTEST SESSION STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export function calculateBacktestStats(
  trades: BacktestTradeRecord[],
  initialBalance: number,
  activeTrade?: BacktestTradeRecord | null | BacktestTradeRecord[],
  currentPrice?: number
): BacktestStats {
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  let currentBalance = initialBalance;
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let ambiguous = 0;
  let totalRR = 0;
  let rrCount = 0;

  let peakBalance = initialBalance;
  let maxDrawdownUsd = 0;

  for (const t of closedTrades) {
    const pnl = t.pnl ?? 0;
    currentBalance += pnl;

    if (currentBalance > peakBalance) peakBalance = currentBalance;
    const dd = peakBalance - currentBalance;
    if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;

    if (t.exitReason === 'INTRABAR_AMBIGUOUS') {
      ambiguous++;
    } else if (pnl > 0) {
      wins++;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses++;
      grossLoss += Math.abs(pnl);
    }

    if (t.rr !== null && Number.isFinite(t.rr)) {
      totalRR += t.rr;
      rrCount++;
    }
  }

  let equity = currentBalance;
  const openTradesList: BacktestTradeRecord[] = Array.isArray(activeTrade)
    ? activeTrade.filter(t => t.status === 'OPEN')
    : (activeTrade && activeTrade.status === 'OPEN' ? [activeTrade] : []);

  if (openTradesList.length > 0 && currentPrice && currentPrice > 0) {
    let totalUnrealized = 0;
    for (const ot of openTradesList) {
      totalUnrealized += calculatePnL(ot.side, ot.entryPrice, currentPrice, ot.volume);
    }
    equity = currentBalance + totalUnrealized;
  }

  const netPnl = currentBalance - initialBalance;
  const evaluatedTrades = wins + losses;
  const winRate = evaluatedTrades > 0 ? (wins / evaluatedTrades) * 100 : 0;
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
  const avgRR = rrCount > 0 ? totalRR / rrCount : 0;
  const maxDrawdownPct = peakBalance > 0 ? (maxDrawdownUsd / peakBalance) * 100 : 0;

  return {
    initialBalance,
    currentBalance: Math.round(currentBalance * 100) / 100,
    equity: Math.round(equity * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
    totalTrades: closedTrades.length,
    wins,
    losses,
    ambiguous,
    winRate: Math.round(winRate * 10) / 10,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgRR: Math.round(avgRR * 100) / 100,
    maxDrawdownUsd: Math.round(maxDrawdownUsd * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 10) / 10,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. FIBONACCI & POSITION ANALYSIS TOOLS HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export interface FibonacciLevel {
  level: number;
  price: number;
  label: string;
}

export const FIBONACCI_STANDARD_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0];

export function calculateFibonacciLevels(
  startPrice: number,
  endPrice: number,
  levels = FIBONACCI_STANDARD_LEVELS
): FibonacciLevel[] {
  const diff = endPrice - startPrice;
  return levels.map((lvl) => ({
    level: lvl,
    price: Math.round((startPrice + diff * lvl) * 1000) / 1000,
    label: `${(lvl * 100).toFixed(1)}%`,
  }));
}

export interface PositionToolGeometry {
  side: TradeSide;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  riskDistance: number;
  rewardDistance: number;
  rr: number;
  lockRR: boolean;
  isValid: boolean;
  error?: string;
}

export function calculatePositionToolGeometry(
  side: TradeSide,
  entryPrice: number,
  slPrice: number,
  tpPrice: number,
  lockRR = false
): PositionToolGeometry {
  const rrValidation = calculateRR(side, entryPrice, slPrice, tpPrice);
  return {
    side,
    entryPrice: Math.round(entryPrice * 1000) / 1000,
    slPrice: Math.round(slPrice * 1000) / 1000,
    tpPrice: Math.round(tpPrice * 1000) / 1000,
    riskDistance: rrValidation.risk,
    rewardDistance: rrValidation.reward,
    rr: rrValidation.rr,
    lockRR,
    isValid: rrValidation.isValid,
    error: rrValidation.error,
  };
}

export function updatePositionToolHandle(
  current: PositionToolGeometry,
  handle: 'ENTRY' | 'SL' | 'TP',
  newPrice: number
): PositionToolGeometry {
  let { side, entryPrice, slPrice, tpPrice, lockRR, rr } = current;

  if (handle === 'ENTRY') {
    const slDiff = entryPrice - slPrice;
    const tpDiff = tpPrice - entryPrice;
    entryPrice = newPrice;
    slPrice = entryPrice - slDiff;
    tpPrice = entryPrice + tpDiff;
  } else if (handle === 'SL') {
    slPrice = newPrice;
    if (lockRR && rr > 0) {
      tpPrice = calculateTPFromRR(side, entryPrice, slPrice, rr);
    }
  } else if (handle === 'TP') {
    tpPrice = newPrice;
    if (lockRR) {
      const risk = side === 'LONG' ? entryPrice - slPrice : slPrice - entryPrice;
      const reward = side === 'LONG' ? tpPrice - entryPrice : entryPrice - tpPrice;
      if (risk > 0) {
        rr = Math.round((reward / risk) * 100) / 100;
      }
    }
  }

  return calculatePositionToolGeometry(side, entryPrice, slPrice, tpPrice, lockRR);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. MULTI-TIMEFRAME RESAMPLING ENGINE (M1 -> M5, M15, M30, H1, H4, D1)
// ═══════════════════════════════════════════════════════════════════════════

export type ChartTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export const TIMEFRAME_MINUTES: Record<ChartTimeframe, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
};

export function resampleM1Candles(m1Candles: BacktestCandle[], targetTF: ChartTimeframe): BacktestCandle[] {
  if (targetTF === 'M1' || m1Candles.length === 0) return m1Candles;
  const tfMinutes = TIMEFRAME_MINUTES[targetTF] || 1;
  const tfMs = tfMinutes * 60 * 1000;

  const buckets = new Map<number, BacktestCandle[]>();

  for (const c of m1Candles) {
    const t = new Date(c.time).getTime();
    const bucketTime = Math.floor(t / tfMs) * tfMs;
    let list = buckets.get(bucketTime);
    if (!list) {
      list = [];
      buckets.set(bucketTime, list);
    }
    list.push(c);
  }

  const resampled: BacktestCandle[] = [];
  for (const [bucketTime, list] of buckets.entries()) {
    if (list.length === 0) continue;
    const open = list[0].open;
    let high = -Infinity;
    let low = Infinity;
    let tickVolume = 0;
    let realVolume = 0;

    for (const item of list) {
      if (item.high > high) high = item.high;
      if (item.low < low) low = item.low;
      tickVolume += item.tickVolume || 0;
      realVolume += item.realVolume || 0;
    }
    const close = list[list.length - 1].close;

    resampled.push({
      time: new Date(bucketTime),
      open,
      high,
      low,
      close,
      tickVolume: tickVolume || undefined,
      realVolume: realVolume || undefined,
    });
  }

  return resampled.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CANDLE METRICS & ADVANCED OHLC ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export interface CandleMetrics {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  range: number;
  body: number;
  upperWick: number;
  lowerWick: number;
  direction: 'BULLISH' | 'BEARISH';
}

export function calculateCandleMetrics(
  candle: { open: number; high: number; low: number; close: number; tickVolume?: number },
  prevCandle?: { close: number } | null
): CandleMetrics {
  const { open, high, low, close } = candle;
  const volume = candle.tickVolume || 0;
  const range = Math.round((high - low) * 1000) / 1000;
  const body = Math.round(Math.abs(close - open) * 1000) / 1000;
  const upperWick = Math.round((high - Math.max(open, close)) * 1000) / 1000;
  const lowerWick = Math.round((Math.min(open, close) - low) * 1000) / 1000;

  const basePrice = prevCandle ? prevCandle.close : open;
  const change = Math.round((close - basePrice) * 1000) / 1000;
  const changePercent = basePrice > 0 ? Math.round(((close - basePrice) / basePrice) * 100000) / 1000 : 0;
  const direction = close >= open ? 'BULLISH' : 'BEARISH';

  return {
    open,
    high,
    low,
    close,
    volume,
    change,
    changePercent,
    range,
    body,
    upperWick,
    lowerWick,
    direction,
  };
}
