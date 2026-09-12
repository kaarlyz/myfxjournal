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
  tpPrice?: number | null
): OrderValidationResult {
  if (entryPrice <= 0) {
    return { isValid: false, error: 'Harga Entry harus lebih besar dari 0.' };
  }

  const pricePrecision = 2;
  const curStr = currentPrice.toFixed(pricePrecision);
  const entStr = entryPrice.toFixed(pricePrecision);

  const numSL = slPrice && slPrice > 0 ? slPrice : 0;
  const numTP = tpPrice && tpPrice > 0 ? tpPrice : 0;

  switch (orderType) {
    case 'MARKET_BUY':
      if (numSL > 0 && numSL >= entryPrice) {
        return { isValid: false, error: 'Market Buy: Stop Loss harus berada di bawah harga Entry.' };
      }
      if (numTP > 0 && numTP <= entryPrice) {
        return { isValid: false, error: 'Market Buy: Take Profit harus berada di atas harga Entry.' };
      }
      return { isValid: true };

    case 'MARKET_SELL':
      if (numSL > 0 && numSL <= entryPrice) {
        return { isValid: false, error: 'Market Sell: Stop Loss harus berada di atas harga Entry.' };
      }
      if (numTP > 0 && numTP >= entryPrice) {
        return { isValid: false, error: 'Market Sell: Take Profit harus berada di bawah harga Entry.' };
      }
      return { isValid: true };

    case 'BUY_LIMIT':
      if (currentPrice > 0 && entryPrice >= currentPrice) {
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
      if (currentPrice > 0 && entryPrice <= currentPrice) {
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
      if (currentPrice > 0 && entryPrice <= currentPrice) {
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
      if (currentPrice > 0 && entryPrice >= currentPrice) {
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
