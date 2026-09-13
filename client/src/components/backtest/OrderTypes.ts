/**
 * Order Type System & Price Relationship Validation
 * Strict rules for Market and Pending Orders (Buy/Sell Limit, Buy/Sell Stop).
 */

export type OrderCategory = 'MARKET' | 'LIMIT' | 'STOP';
export type OrderDirection = 'BUY' | 'SELL';

export type OrderExecutionType =
  | 'MARKET_BUY'
  | 'MARKET_SELL'
  | 'BUY_LIMIT'
  | 'SELL_LIMIT'
  | 'BUY_STOP'
  | 'SELL_STOP';

export interface PendingOrderRecord {
  id: string;
  orderType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  volume: number;
  riskAmount: number;
  targetProfit: number;
  rrRatio: number;
  placedTime: Date;
}

export interface OrderValidationResult {
  isValid: boolean;
  error?: string;
}

export interface EffectiveOrderClassification {
  category: OrderCategory;
  orderType: OrderExecutionType;
  isPending: boolean;
  tolerance: number;
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
      orderType: resolveOrderType(cat, direction),
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
  order: { orderType: 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP'; entryPrice: number },
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
  }
}

/**
 * Resolve OrderExecutionType from category and direction
 */
export function resolveOrderType(category: OrderCategory, direction: OrderDirection): OrderExecutionType {
  if (category === 'MARKET') {
    return direction === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL';
  }
  if (category === 'LIMIT') {
    return direction === 'BUY' ? 'BUY_LIMIT' : 'SELL_LIMIT';
  }
  return direction === 'BUY' ? 'BUY_STOP' : 'SELL_STOP';
}

/**
 * Deconstruct OrderExecutionType to category and direction
 */
export function deconstructOrderType(type: OrderExecutionType): { category: OrderCategory; direction: OrderDirection } {
  switch (type) {
    case 'MARKET_BUY':
      return { category: 'MARKET', direction: 'BUY' };
    case 'MARKET_SELL':
      return { category: 'MARKET', direction: 'SELL' };
    case 'BUY_LIMIT':
      return { category: 'LIMIT', direction: 'BUY' };
    case 'SELL_LIMIT':
      return { category: 'LIMIT', direction: 'SELL' };
    case 'BUY_STOP':
      return { category: 'STOP', direction: 'BUY' };
    case 'SELL_STOP':
      return { category: 'STOP', direction: 'SELL' };
  }
}

/**
 * Human-readable label for order execution type
 */
export function getOrderTypeLabel(type: OrderExecutionType): string {
  switch (type) {
    case 'MARKET_BUY':
      return 'Market Buy';
    case 'MARKET_SELL':
      return 'Market Sell';
    case 'BUY_LIMIT':
      return 'Buy Limit';
    case 'SELL_LIMIT':
      return 'Sell Limit';
    case 'BUY_STOP':
      return 'Buy Stop';
    case 'SELL_STOP':
      return 'Sell Stop';
  }
}

/**
 * Validates price relationships according to professional broker rules:
 *
 * BUY LIMIT:  Entry < currentPrice; SL < Entry; TP > Entry
 * BUY STOP:   Entry > currentPrice; SL < Entry; TP > Entry
 * SELL LIMIT: Entry > currentPrice; TP < Entry; SL > Entry
 * SELL STOP:  Entry < currentPrice; TP < Entry; SL > Entry
 * MARKET BUY: SL < Entry < TP (Entry = currentPrice)
 * MARKET SELL: TP < Entry < SL (Entry = currentPrice)
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
