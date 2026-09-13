import { prisma } from '../prisma';
import * as parquetProvider from '../integrations/mt5-sync/parquetDataProvider';
import {
  normalizeSymbol,
  detectPriceDigits,
  priceToMicro,
  microToPrice,
  resampleCandles,
  OHLCCandle,
  inferSLTP,
  runRRSimulation,
  getBarOpenTime,
  detectAccountType,
  calculatePnl,
} from './replayEngineCore';

export type ReplayStatus =
  | 'VALID'                  // Replay completed successfully
  | 'INVALID_FEED'           // Provider metadata mismatch
  | 'DATASET_NOT_COMPATIBLE' // Dataset exists but is incompatible (different broker/feedId)
  | 'PRICE_SCALE_MISMATCH'   // Secondary sanity: price gap > 20% despite matching/unverified metadata
  | 'MISSING_MARKET_DATA'    // No candles at all for this symbol in window
  | 'SYMBOL_NOT_FOUND'       // Symbol not found in MarketDataCatalog
  | 'TIME_ALIGNMENT_ERROR'   // Cannot align entry to candle bar
  | 'INSUFFICIENT_HISTORY'   // < 3 candles in trade window
  | 'NO_SL_INFERABLE'        // Cannot compute SL from trade data
  | 'FAILED';                // Unexpected runtime error

export interface ReplayPipelineResult {
  tradeId: string;
  status: ReplayStatus;
  statusReason: string;
  datasetId?: string;
  provider?: string;
  broker?: string;
  priceFeedId?: string;
  timeframe?: string;
  candlesUsed?: number;
  slUsed?: number;
  tpUsed?: number;
  mfePrice?: number;
  maePrice?: number;
  mfeDistance?: number;
  maeDistance?: number;
  riskDistance?: number;
  maxPotentialRR?: number;
  capturedRR?: number;
  exitEfficiency?: number;
  alignedEntryTime?: Date;
  alignedExitTime?: Date;
  candlePriceMin?: number;
  candlePriceMax?: number;
  priceGapPct?: number;
  firstHit?: 'TP' | 'SL' | 'AMBIGUOUS' | 'NONE';
  simulatedResult?: 'WIN' | 'LOSS';
  simulatedR?: number;
}

export interface CandleCoverage {
  symbol: string;
  timeframe: string;
  provider?: string;
  firstCandle: Date | null;
  lastCandle: Date | null;
  totalCandles: number;
}

export interface PerTradeReportItem {
  tradeId: string;
  symbolOriginal: string;
  symbolNormalized: string;
  side: string;
  entryTimeOriginal: string;
  entryTimeUtc: string;
  exitTimeOriginal: string;
  exitTimeUtc: string;
  entryPrice: number;
  exitPrice: number;
  slPrice: number | null;
  tpPrice: number | null;
  riskDistance: number | null;
  actualRR: number | null;
  effectiveRR: number;
  slTpSource: 'ACTUAL' | 'MANUAL' | 'RECONSTRUCTED';
  isActualSLTP: boolean;
  provider: string;
  timeframe: string;
  candleCount: number;
  firstHit: string;
  brokerResult: string;
  simulatedResult: string;
  simulatedR: number | null;
  replayStatus: ReplayStatus;
  discrepancyReason: string | null;
}

export interface TimeframeComparisonItem {
  timeframe: string;
  totalTrades: number;
  validTrades: number;
  winRate: number;
  wins: number;
  losses: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownR: number;
}

export interface ReplayValidationSummary {
  broker: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  replay: {
    totalTrades: number;
    tpHits: number;
    tpPct: number;
    slHits: number;
    slPct: number;
    neither: number;
    neitherPct: number;
    ambiguous: number;
    ambiguousPct: number;
    decidedWins: number;
    decidedLosses: number;
    decidedWinRate: number;
    allTradesWinRate: number;
    exactMatches: number;
    exactMatchPct: number;
    mismatches: number;
    mismatchPct: number;
    diffPp: number;
  };
  provider: string;
  timeframe: string;
  engineVersion: string;
}

export interface ReplayProgress {
  sessionId: string;
  current: number;
  total: number;
  validSoFar: number;
  invalidSoFar: number;
  phase: 'idle' | 'processing' | 'persisting' | 'done';
  startedAt: number;
}

export class MarketAnalyticsService {
  /** In-memory per-session progress tracker (lives as long as server is up) */
  private replayProgress = new Map<string, ReplayProgress>();

  /** Get current replay progress for a session (null if not running) */
  getReplayProgress(sessionId: string): ReplayProgress | null {
    return this.replayProgress.get(sessionId) ?? null;
  }

  /**

   * Canonical symbol normalization using replayEngineCore map.
   */
  public normalizeSymbol(symbol: string): string {
    const info = normalizeSymbol(symbol);
    return info.canonical;
  }

  /**
   * Align timestamp to start of candle bar for given timeframe
   */
  public entryBarStart(t: Date, tf: string): Date {
    return getBarOpenTime(t, tf);
  }

  /**
   * Back-calculate SL and TP price from known RR and exit price using micro-unit arithmetic.
   */
  public inferSL(trade: any, backtestRR: number): number | null {
    const res = inferSLTP(
      trade.side,
      trade.entryPrice,
      trade.exitPrice,
      trade.result,
      backtestRR,
      trade.slPrice
    );
    return res ? res.slPrice : null;
  }

  /**
   * Get candle coverage information for a symbol.
   */
  async getCandleCoverage(symbol: string, provider?: string): Promise<CandleCoverage[]> {
    const baseSymbol = this.normalizeSymbol(symbol);

    const groups = await prisma.mt5CandleData.groupBy({
      by: ['provider', 'timeframe'],
      where: {
        symbol: { startsWith: baseSymbol },
        ...(provider ? { provider: provider.toUpperCase() } : {}),
      },
      _count: { id: true },
      _min: { time: true },
      _max: { time: true },
    });

    const coverages: CandleCoverage[] = groups.map(g => ({
      symbol: baseSymbol,
      timeframe: g.timeframe,
      provider: g.provider,
      firstCandle: g._min.time,
      lastCandle: g._max.time,
      totalCandles: g._count.id,
    }));

    if (baseSymbol === 'XAUUSD' && (!provider || provider.toUpperCase() === 'PARQUET' || provider.toUpperCase() === 'DUKASCOPY')) {
      const bounds = await parquetProvider.getTimelineBounds();
      if (bounds) {
        coverages.unshift({
          symbol: baseSymbol,
          timeframe: 'TICKS',
          provider: 'PARQUET',
          firstCandle: new Date(bounds.dateFrom),
          lastCandle: new Date(bounds.dateTo),
          totalCandles: bounds.totalTicks,
        });
      }
    }

    return coverages;
  }

  /**
   * Strict validation & replay execution pipeline for a single trade using canonical tick data.
   */
  async runTradeReplayPipeline(
    tradeIdOrTrade: string | any,
    backtestRR = 1.0,
    engineVersion = '2.1.0',
    marketDataSource?: string,
    requestedTimeframe = 'M1',
    cachedCatalogItem?: any,
    timezoneOffsetHours = 0
  ): Promise<ReplayPipelineResult> {
    let trade: any;
    if (typeof tradeIdOrTrade === 'string') {
      trade = await prisma.trade.findUnique({
        where: { id: tradeIdOrTrade },
        include: { session: true },
      });
    } else {
      trade = tradeIdOrTrade;
    }

    if (!trade) {
      console.log(`[ANALYTICS][INVALID] id=${typeof tradeIdOrTrade === 'string' ? tradeIdOrTrade : 'unknown'} reason="Trade not found in database"`);
      return {
        tradeId: typeof tradeIdOrTrade === 'string' ? tradeIdOrTrade : 'unknown',
        status: 'FAILED',
        statusReason: 'Trade not found in database.',
      };
    }

    const tradeId = trade.id;
    const { symbol, entryPrice, exitPrice, side, rMultiple, result: brokerResult } = trade;
    let entryTime: Date = trade.entryTime ? new Date(trade.entryTime) : trade.entryTime;
    let exitTime: Date = trade.exitTime ? new Date(trade.exitTime) : trade.exitTime;

    // 1. Validate required fields
    if (!entryTime || entryPrice == null || !side) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Trade missing entryTime, entryPrice, or side" entryTime=${entryTime ? entryTime.toISOString() : 'N/A'} exitTime=${exitTime ? exitTime.toISOString() : 'N/A'} entryPrice=${entryPrice ?? 'N/A'} exitPrice=${exitPrice ?? 'N/A'} tickCount=0`);
      return {
        tradeId,
        status: 'NO_SL_INFERABLE',
        statusReason: 'Trade missing entryTime, entryPrice, or side.',
      };
    }

    if (!exitTime || exitPrice == null) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Trade missing exitTime or exitPrice" entryTime=${entryTime.toISOString()} exitTime=${exitTime ? exitTime.toISOString() : 'N/A'} entryPrice=${entryPrice} exitPrice=${exitPrice ?? 'N/A'} tickCount=0`);
      return {
        tradeId,
        status: 'NO_SL_INFERABLE',
        statusReason: 'Trade missing exitTime or exitPrice.',
      };
    }

    // 2. Validate timestamps
    const entryMs = entryTime.getTime();
    const exitMs = exitTime.getTime();
    if (isNaN(entryMs) || isNaN(exitMs)) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Invalid timestamp format" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'FAILED',
        statusReason: 'Invalid entryTime or exitTime timestamp.',
      };
    }

    if (exitMs < entryMs) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="exitTime < entryTime" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'FAILED',
        statusReason: 'Exit time cannot be before entry time (exitTime < entryTime).',
      };
    }

    // Apply timezone offset to convert trade times to UTC if specified
    if (timezoneOffsetHours !== 0) {
      entryTime = new Date(entryTime.getTime() - timezoneOffsetHours * 3600000);
      exitTime = new Date(exitTime.getTime() - timezoneOffsetHours * 3600000);
    }

    // 3. Direction validation
    const isLong = side === 'LONG' || side === 'BUY';
    const isShort = side === 'SHORT' || side === 'SELL';
    if (!isLong && !isShort) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Invalid side '${side}'" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'FAILED',
        statusReason: `Invalid trade direction '${side}'. Must be LONG, BUY, SHORT, or SELL.`,
      };
    }

    // 4. Price validation
    if (typeof entryPrice !== 'number' || isNaN(entryPrice) || entryPrice <= 0 || typeof exitPrice !== 'number' || isNaN(exitPrice) || exitPrice <= 0) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Invalid entryPrice (${entryPrice}) or exitPrice (${exitPrice})" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'FAILED',
        statusReason: `Invalid trade prices: entryPrice=${entryPrice}, exitPrice=${exitPrice}.`,
      };
    }

    // 5. Symbol Normalization
    const symbolInfo = normalizeSymbol(symbol);
    if (!symbolInfo.known) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Unknown symbol '${symbol}'" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'SYMBOL_NOT_FOUND',
        statusReason: `Unknown symbol "${symbol}" cannot be mapped to canonical market catalog.`,
      };
    }
    const baseSymbol = symbolInfo.canonical;
    const tf = (requestedTimeframe || 'M1').toUpperCase();

    // 6. SL / TP Resolution & Validation
    let slPrice = trade.slPrice;
    let tpPrice = trade.tpPrice;
    let slSource: 'ACTUAL' | 'INFERRED' = 'ACTUAL';

    if (slPrice != null && slPrice > 0) {
      if (tpPrice == null || tpPrice <= 0) {
        const risk = Math.abs(entryPrice - slPrice);
        tpPrice = isLong ? entryPrice + risk * backtestRR : entryPrice - risk * backtestRR;
      }
    } else {
      const sltpResult = inferSLTP(
        side,
        entryPrice,
        exitPrice,
        brokerResult,
        backtestRR,
        trade.slPrice,
        trade.tpPrice
      );
      if (!sltpResult) {
        console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Unable to determine Stop Loss price" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
        return {
          tradeId,
          status: 'NO_SL_INFERABLE',
          statusReason: 'Unable to back-calculate Stop Loss price.',
          timeframe: tf,
          alignedEntryTime: entryTime,
          alignedExitTime: exitTime,
        };
      }
      slPrice = sltpResult.slPrice;
      tpPrice = sltpResult.tpPrice;
      slSource = 'INFERRED';
    }

    if (isLong && slPrice >= entryPrice) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="For LONG trade, SL (${slPrice}) must be below entryPrice (${entryPrice})" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'FAILED',
        statusReason: `For LONG, Stop Loss (${slPrice}) must be below entry price (${entryPrice}).`,
      };
    }
    if (isShort && slPrice <= entryPrice) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="For SHORT trade, SL (${slPrice}) must be above entryPrice (${entryPrice})" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'FAILED',
        statusReason: `For SHORT, Stop Loss (${slPrice}) must be above entry price (${entryPrice}).`,
      };
    }

    // 7. Query Canonical Historical Tick Data
    const tickResult = await parquetProvider.getTicks({
      symbol: baseSymbol,
      fromTime: entryTime,
      toTime: exitTime,
    });

    const ticks = tickResult?.ticks || [];
    if (ticks.length === 0) {
      const bounds = await parquetProvider.getTimelineBounds();
      if (bounds && (entryTime.getTime() < new Date(bounds.dateFrom).getTime() || entryTime.getTime() > new Date(bounds.dateTo).getTime())) {
        console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Trade entry time outside dataset bounds [${bounds.dateFrom} - ${bounds.dateTo}]" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
        return {
          tradeId,
          status: 'MISSING_MARKET_DATA',
          statusReason: `Trade entry time ${entryTime.toISOString()} is outside dataset bounds [${bounds.dateFrom} - ${bounds.dateTo}].`,
          timeframe: tf,
          alignedEntryTime: entryTime,
          alignedExitTime: exitTime,
        };
      }

      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="No historical tick data found in window [${entryTime.toISOString()} to ${exitTime.toISOString()}]" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=0`);
      return {
        tradeId,
        status: 'MISSING_MARKET_DATA',
        statusReason: `No historical tick data found in window [${entryTime.toISOString()} to ${exitTime.toISOString()}].`,
        timeframe: tf,
        alignedEntryTime: entryTime,
        alignedExitTime: exitTime,
      };
    }

    // 8. Price scale sanity check
    let tickPriceMin = Infinity;
    let tickPriceMax = -Infinity;
    for (const t of ticks) {
      const p = t.bid;
      if (p < tickPriceMin) tickPriceMin = p;
      if (p > tickPriceMax) tickPriceMax = p;
    }
    const midPrice = (tickPriceMin + tickPriceMax) / 2;
    const priceGapPct = (Math.abs(entryPrice - midPrice) / midPrice) * 100;
    if (priceGapPct > 20) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Price scale mismatch: entry ${entryPrice} deviates ${priceGapPct.toFixed(1)}% from tick range [${tickPriceMin} - ${tickPriceMax}]" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=${ticks.length}`);
      return {
        tradeId,
        status: 'PRICE_SCALE_MISMATCH',
        statusReason: `Price scale mismatch: Trade entry price ${entryPrice} deviates by ${priceGapPct.toFixed(1)}% from market ticks range [${tickPriceMin.toFixed(2)} - ${tickPriceMax.toFixed(2)}].`,
        timeframe: tf,
        candlesUsed: ticks.length,
        alignedEntryTime: entryTime,
        alignedExitTime: exitTime,
        candlePriceMin: tickPriceMin,
        candlePriceMax: tickPriceMax,
        priceGapPct,
      };
    }

    // 9. Strict Tick-by-Tick Simulation & Metrics (No Look-Ahead, Chronologically Ordered)
    try {
      let mfe = entryPrice;
      let mae = entryPrice;
      let firstHit: 'TP' | 'SL' | 'NONE' = 'NONE';

      for (const tick of ticks) {
        const p = isLong ? tick.bid : tick.ask;
        if (isLong) {
          if (p < mae) mae = p;
          if (p > mfe) mfe = p;
          if (slPrice > 0 && p <= slPrice) {
            firstHit = 'SL';
            break;
          }
          if (tpPrice > 0 && p >= tpPrice) {
            firstHit = 'TP';
            break;
          }
        } else {
          if (p > mae) mae = p;
          if (p < mfe) mfe = p;
          if (slPrice > 0 && p >= slPrice) {
            firstHit = 'SL';
            break;
          }
          if (tpPrice > 0 && p <= tpPrice) {
            firstHit = 'TP';
            break;
          }
        }
      }

      const riskDistance = isLong ? (entryPrice - slPrice) : (slPrice - entryPrice);
      const priceCaptured = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
      const mfeDistance = isLong ? Math.max(0, mfe - entryPrice) : Math.max(0, entryPrice - mfe);
      const maeDistance = isLong ? Math.max(0, entryPrice - mae) : Math.max(0, mae - entryPrice);
      const maxPotentialRR = riskDistance > 0 ? mfeDistance / riskDistance : 0;

      let capturedRR: number | undefined;
      if (rMultiple !== null && rMultiple !== undefined) {
        capturedRR = rMultiple;
      } else if (riskDistance > 0) {
        capturedRR = priceCaptured / riskDistance;
      }

      const exitEfficiency = (capturedRR !== undefined && maxPotentialRR > 0)
        ? (capturedRR / maxPotentialRR) * 100
        : undefined;

      const targetRR = slSource === 'ACTUAL' && riskDistance > 0 && tpPrice > 0
        ? Math.abs(tpPrice - entryPrice) / riskDistance
        : backtestRR;

      const simulatedResult: 'WIN' | 'LOSS' = (firstHit === 'TP' || (firstHit !== 'SL' && maxPotentialRR >= targetRR)) ? 'WIN' : 'LOSS';
      const simulatedR = simulatedResult === 'WIN' ? targetRR : -1;

      console.log(`[ANALYTICS][TRADE]
id=${tradeId}
direction=${side}
entryTime=${entryTime.toISOString()}
exitTime=${exitTime.toISOString()}
entryPrice=${entryPrice}
exitPrice=${exitPrice}
tickCount=${ticks.length}
dataStart=${tickResult?.dataStart ?? 'N/A'}
dataEnd=${tickResult?.dataEnd ?? 'N/A'}
valid=true`);

      return {
        tradeId,
        status: 'VALID',
        statusReason: 'Replay completed successfully from canonical tick data.',
        provider: 'PARQUET',
        timeframe: tf,
        candlesUsed: ticks.length,
        slUsed: slPrice,
        tpUsed: tpPrice,
        mfePrice: mfe,
        maePrice: mae,
        mfeDistance,
        maeDistance,
        riskDistance,
        maxPotentialRR,
        capturedRR,
        exitEfficiency,
        alignedEntryTime: entryTime,
        alignedExitTime: exitTime,
        candlePriceMin: tickPriceMin,
        candlePriceMax: tickPriceMax,
        priceGapPct,
        firstHit,
        simulatedResult,
        simulatedR,
      };
    } catch (e: any) {
      console.log(`[ANALYTICS][INVALID] id=${tradeId} reason="Replay execution error: ${e?.message || e}" entryTime=${entryTime.toISOString()} exitTime=${exitTime.toISOString()} entryPrice=${entryPrice} exitPrice=${exitPrice} tickCount=${ticks.length}`);
      return {
        tradeId,
        status: 'FAILED',
        statusReason: `Replay execution error: ${e?.message || e}`,
        candlesUsed: ticks.length,
      };
    }
  }

  /**
   * Rebuild Replay Operation:
   * Batch processing using canonical tick historical data.
   */
  async rebuildSessionReplay(
    sessionId: string,
    backtestRR = 1.0,
    engineVersion = '2.1.0',
    marketDataSource?: string,
    timeframe = 'M1',
    timezoneOffsetHours = 0
  ): Promise<{
    processed: number;
    valid: number;
    invalid: number;
    analyzed: number;
    validCount: number;
    invalidCount: number;
    total: number;
    statusCounts: Record<string, number>;
    latestReplayVersion: string;
    results: ReplayPipelineResult[];
    diagnostics: {
      tradeRange: { first: Date | null; last: Date | null };
      candleCoverage: CandleCoverage[];
    };
  }> {
    console.log(`[ANALYTICS] session analyze started: sessionId=${sessionId}, timeframe=${timeframe}, provider=${marketDataSource || 'PARQUET'}, tzOffset=${timezoneOffsetHours}h`);

    // Pre-fetch all closed trades in session
    const trades = await prisma.trade.findMany({
      where: { sessionId, status: 'CLOSED' },
      select: {
        id: true,
        sessionId: true,
        symbol: true,
        side: true,
        entryTime: true,
        exitTime: true,
        entryPrice: true,
        exitPrice: true,
        slPrice: true,
        tpPrice: true,
        result: true,
        rMultiple: true,
        session: {
          select: {
            id: true,
            symbol: true,
            timeframe: true,
            priceFeedBroker: true,
            priceFeedId: true,
          },
        },
      },
      orderBy: { entryTime: 'asc' },
    });

    console.log(`[ANALYTICS] trades=${trades.length}`);

    const results: ReplayPipelineResult[] = [];
    const statusCounts: Record<string, number> = {};
    let validCount = 0;
    let invalidCount = 0;

    // Initialize progress tracker
    this.replayProgress.set(sessionId, {
      sessionId,
      current: 0,
      total: trades.length,
      validSoFar: 0,
      invalidSoFar: 0,
      phase: 'processing',
      startedAt: Date.now(),
    });

    const tf = (timeframe || 'M1').toUpperCase();

    for (let i = 0; i < trades.length; i++) {
      const t = trades[i];

      if (i === 0 || (i + 1) % 200 === 0 || i === trades.length - 1) {
        console.log(`[ANALYTICS] processing trade=${i + 1}/${trades.length} id=${t.id}`);
      }

      const res = await this.runTradeReplayPipeline(
        t,
        backtestRR,
        engineVersion,
        marketDataSource || 'PARQUET',
        tf,
        null,
        timezoneOffsetHours
      );

      results.push(res);
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
      if (res.status === 'VALID') {
        validCount++;
      } else {
        invalidCount++;
      }

      // Update in-memory progress after every trade
      this.replayProgress.set(sessionId, {
        sessionId,
        current: i + 1,
        total: trades.length,
        validSoFar: validCount,
        invalidSoFar: invalidCount,
        phase: 'processing',
        startedAt: this.replayProgress.get(sessionId)?.startedAt ?? Date.now(),
      });
    }

    console.log(`[ANALYTICS] trade completed=${trades.length} (valid=${validCount}, invalid=${invalidCount})`);
    console.log(`[ANALYTICS] persisting analysis records and trade updates...`);

    // Mark as persisting phase
    this.replayProgress.set(sessionId, {
      ...(this.replayProgress.get(sessionId)!),
      phase: 'persisting',
    });

    // Batch persist TradeReplayAnalysis rows
    const analysisRows = results.map(res => ({
      tradeId: res.tradeId,
      engineVersion,
      datasetId: res.datasetId || null,
      provider: res.provider || null,
      broker: res.broker || null,
      priceFeedId: res.priceFeedId || null,
      status: res.status,
      statusReason: res.statusReason || null,
      timeframe: res.timeframe || null,
      candlesUsed: res.candlesUsed || null,
      slUsed: res.slUsed || null,
      mfePrice: res.mfePrice || null,
      maePrice: res.maePrice || null,
      maxPotentialRR: res.maxPotentialRR || null,
      capturedRR: res.capturedRR || null,
      exitEfficiency: res.exitEfficiency || null,
      alignedEntryTime: res.alignedEntryTime || null,
      alignedExitTime: res.alignedExitTime || null,
      candlePriceMin: res.candlePriceMin || null,
      candlePriceMax: res.candlePriceMax || null,
      priceGapPct: res.priceGapPct || null,
    }));

    const batchSize = 500;
    for (let i = 0; i < analysisRows.length; i += batchSize) {
      const chunk = analysisRows.slice(i, i + batchSize);
      await prisma.tradeReplayAnalysis.createMany({ data: chunk });
    }

    const validTrades = results.filter(r => r.status === 'VALID');
    const invalidTrades = results.filter(r => r.status !== 'VALID');

    for (let i = 0; i < validTrades.length; i += batchSize) {
      const chunk = validTrades.slice(i, i + batchSize);
      await prisma.$transaction(
        chunk.map(r =>
          prisma.trade.update({
            where: { id: r.tradeId },
            data: {
              mfePrice: r.mfePrice,
              maePrice: r.maePrice,
              maxPotentialRR: r.maxPotentialRR,
              replayStatus: r.status,
              replayStatusReason: r.statusReason,
            },
          })
        )
      );
    }

    for (let i = 0; i < invalidTrades.length; i += batchSize) {
      const chunk = invalidTrades.slice(i, i + batchSize);
      await prisma.$transaction(
        chunk.map(r =>
          prisma.trade.update({
            where: { id: r.tradeId },
            data: {
              mfePrice: null,
              maePrice: null,
              maxPotentialRR: null,
              replayStatus: r.status,
              replayStatusReason: r.statusReason,
            },
          })
        )
      );
    }

    const tradeDates = trades.map(t => t.entryTime).filter(Boolean) as Date[];
    const tradeRange = {
      first: tradeDates.length > 0 ? tradeDates[0] : null,
      last: tradeDates.length > 0 ? tradeDates[tradeDates.length - 1] : null,
    };
    const sessionSymbol = trades[0]?.symbol || '';
    const candleCoverage = sessionSymbol ? await this.getCandleCoverage(sessionSymbol, marketDataSource) : [];

    console.log(`[ANALYTICS] session analyze completed`);

    // Mark progress as done
    this.replayProgress.set(sessionId, {
      ...(this.replayProgress.get(sessionId)!),
      phase: 'done',
      current: trades.length,
    });

    return {
      processed: trades.length,
      valid: validCount,
      invalid: invalidCount,
      analyzed: validCount,
      validCount,
      invalidCount,
      total: trades.length,
      statusCounts,
      latestReplayVersion: engineVersion,
      results,
      diagnostics: {
        tradeRange,
        candleCoverage,
      },
    };
  }

  /**
   * Compute a ReplayValidationSummary for a session that has already been replayed.
   * Reads trade + replay analysis data from the DB — no re-computation needed.
   */
  async getReplayValidationSummary(sessionId: string): Promise<ReplayValidationSummary | null> {
    const allTrades = await prisma.trade.findMany({
      where: { sessionId, status: 'CLOSED' },
      select: { id: true, result: true, replayStatus: true },
    });

    if (allTrades.length === 0) return null;

    const totalTrades = allTrades.length;
    const brokerWins = allTrades.filter(t => t.result === 'WIN').length;
    const brokerLosses = allTrades.filter(t => t.result === 'LOSS').length;
    const brokerWinRate = totalTrades > 0 ? (brokerWins / totalTrades) * 100 : 0;

    // Use getPerTradeReport to get firstHit breakdown (reads from DB)
    const reportData = await this.getPerTradeReport(sessionId, { limit: 10000 });
    const validRows = reportData.trades.filter(t => t.replayStatus === 'VALID');

    const tpHits = validRows.filter(t => t.firstHit === 'TP').length;
    const slHits = validRows.filter(t => t.firstHit === 'SL').length;
    const ambiguous = validRows.filter(t => t.firstHit === 'AMBIGUOUS').length;
    const neither = validRows.filter(t => t.firstHit === 'NONE').length;
    const replayTotal = validRows.length;

    const tpPct = totalTrades > 0 ? (tpHits / totalTrades) * 100 : 0;
    const slPct = totalTrades > 0 ? (slHits / totalTrades) * 100 : 0;
    const ambiguousPct = totalTrades > 0 ? (ambiguous / totalTrades) * 100 : 0;
    const neitherPct = totalTrades > 0 ? (neither / totalTrades) * 100 : 0;

    const decidedWins = tpHits;
    const decidedLosses = slHits;
    const decidedTotal = decidedWins + decidedLosses;
    const decidedWinRate = decidedTotal > 0 ? (decidedWins / decidedTotal) * 100 : 0;
    const allTradesWinRate = totalTrades > 0 ? (tpHits / totalTrades) * 100 : 0;

    const exactMatches = validRows.filter(
      t =>
        (t.firstHit === 'TP' && t.brokerResult === 'WIN') ||
        (t.firstHit === 'SL' && t.brokerResult === 'LOSS')
    ).length;
    const mismatches = validRows.filter(
      t =>
        (t.firstHit === 'TP' && t.brokerResult === 'LOSS') ||
        (t.firstHit === 'SL' && t.brokerResult === 'WIN')
    ).length;
    const exactMatchPct = totalTrades > 0 ? (exactMatches / totalTrades) * 100 : 0;
    const mismatchPct = totalTrades > 0 ? (mismatches / totalTrades) * 100 : 0;
    const diffPp = allTradesWinRate - brokerWinRate;

    // Metadata from latest analysis
    const latestAnalysis = await prisma.tradeReplayAnalysis.findFirst({
      where: { trade: { sessionId } },
      orderBy: { replayTimestamp: 'desc' },
      select: { provider: true, timeframe: true, engineVersion: true },
    });

    const provider = latestAnalysis?.provider || 'DUKASCOPY';
    const timeframe = latestAnalysis?.timeframe || 'M1';
    const engineVersion = latestAnalysis?.engineVersion || '2.1.0';

    return {
      broker: { totalTrades, wins: brokerWins, losses: brokerLosses, winRate: brokerWinRate },
      replay: {
        totalTrades: replayTotal,
        tpHits,
        tpPct,
        slHits,
        slPct,
        neither,
        neitherPct,
        ambiguous,
        ambiguousPct,
        decidedWins,
        decidedLosses,
        decidedWinRate,
        allTradesWinRate,
        exactMatches,
        exactMatchPct,
        mismatches,
        mismatchPct,
        diffPp,
      },
      provider,
      timeframe,
      engineVersion,
    };
  }

  /**
   * Detailed Per-Trade Diagnostic Report (Item 10 from prompt).
   */
  async getPerTradeReport(
    sessionId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
      marketDataSource?: string;
      backtestRR?: number;
      timeframe?: string;
    }
  ): Promise<{
    total: number;
    limit: number;
    offset: number;
    trades: PerTradeReportItem[];
  }> {
    const limit = options?.limit ?? 1000;
    const offset = options?.offset ?? 0;
    const backtestRR = options?.backtestRR ?? 1.0;
    const tf = options?.timeframe ?? 'M1';
    const provider = options?.marketDataSource ?? 'DUKASCOPY';

    const where: any = { sessionId, status: 'CLOSED' };
    if (options?.status) {
      where.replayStatus = options.status;
    }

    const [total, dbTrades] = await Promise.all([
      prisma.trade.count({ where }),
      prisma.trade.findMany({
        where,
        orderBy: { entryTime: 'asc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const reportItems: PerTradeReportItem[] = dbTrades.map(t => {
      const normSym = this.normalizeSymbol(t.symbol);

      const sltp = (t.entryPrice != null && t.exitPrice != null)
        ? inferSLTP(t.side as any, t.entryPrice, t.exitPrice, t.result, backtestRR, t.slPrice, t.tpPrice)
        : null;

      const slPrice = t.slPrice ?? (sltp ? sltp.slPrice : null);
      const tpPrice = t.tpPrice ?? (sltp ? sltp.tpPrice : null);
      const riskDistance = sltp ? sltp.riskDistance : (t.entryPrice && slPrice ? Math.abs(t.entryPrice - slPrice) : null);
      const isActual = sltp?.source === 'ACTUAL';
      const slTpSource = sltp ? (sltp.source === 'ACTUAL' ? 'ACTUAL' : (sltp.source === 'MANUAL' ? 'MANUAL' : 'RECONSTRUCTED')) : 'RECONSTRUCTED';
      const actualRR = sltp?.actualRR ?? null;
      const effectiveRR = sltp?.effectiveRR ?? backtestRR;

      const isWin = (t.maxPotentialRR ?? 0) >= effectiveRR;
      const simResult = t.replayStatus === 'VALID' ? (isWin ? 'WIN' : 'LOSS') : 'N/A';
      const simR = t.replayStatus === 'VALID' ? (isWin ? effectiveRR : -1) : null;

      let discrepancyReason: string | null = null;
      if (t.replayStatus !== 'VALID') {
        discrepancyReason = t.replayStatusReason || t.replayStatus;
      } else if (t.result && simResult !== 'N/A' && t.result.toUpperCase() !== simResult) {
        discrepancyReason = `Broker=${t.result.toUpperCase()} vs Sim=${simResult} (maxRR=${t.maxPotentialRR?.toFixed(2)} vs target=${effectiveRR.toFixed(2)})`;
      }

      return {
        tradeId: t.id,
        symbolOriginal: t.symbol,
        symbolNormalized: normSym,
        side: t.side,
        entryTimeOriginal: t.entryTime ? t.entryTime.toISOString() : '',
        entryTimeUtc: t.entryTime ? t.entryTime.toISOString() : '',
        exitTimeOriginal: t.exitTime ? t.exitTime.toISOString() : '',
        exitTimeUtc: t.exitTime ? t.exitTime.toISOString() : '',
        entryPrice: t.entryPrice ?? 0,
        exitPrice: t.exitPrice ?? 0,
        slPrice,
        tpPrice,
        riskDistance,
        actualRR,
        effectiveRR,
        slTpSource,
        isActualSLTP: isActual,
        provider,
        timeframe: tf,
        candleCount: 0,
        firstHit: isWin ? 'TP' : 'SL',
        brokerResult: (t.result || 'UNKNOWN').toUpperCase(),
        simulatedResult: simResult,
        simulatedR: simR,
        replayStatus: (t.replayStatus as ReplayStatus) || 'VALID',
        discrepancyReason,
      };
    });

    return {
      total,
      limit,
      offset,
      trades: reportItems,
    };
  }

  /**
   * Multi-Timeframe Comparison Matrix (Item 9 from prompt)
   * Runs simulations across M1, M5, M15, H1 and compares metrics.
   */
  async getTimeframeComparison(
    sessionId: string,
    backtestRR = 1.0,
    marketDataSource = 'DUKASCOPY'
  ): Promise<TimeframeComparisonItem[]> {
    const timeframes = ['M1', 'M5', 'M15', 'H1'];
    const comparison: TimeframeComparisonItem[] = [];

    for (const tf of timeframes) {
      const rebuild = await this.rebuildSessionReplay(
        sessionId,
        backtestRR,
        '2.1.0',
        marketDataSource,
        tf
      );

      const validResults = rebuild.results.filter(r => r.status === 'VALID');

      // Fetch trade SL/TP to respect actual SL/TP priority for win classification
      const tradeIds = validResults.map(r => r.tradeId);
      const tradeSlTpMap = new Map<string, { slPrice: number | null; tpPrice: number | null; side: string | null; entryPrice: number | null; exitPrice: number | null; result: string | null }>();
      if (tradeIds.length > 0) {
        const tradeData = await prisma.trade.findMany({
          where: { id: { in: tradeIds } },
          select: { id: true, slPrice: true, tpPrice: true, side: true, entryPrice: true, exitPrice: true, result: true },
        });
        tradeData.forEach(t => tradeSlTpMap.set(t.id, t));
      }

      let wins = 0;
      let grossProfit = 0;
      let runningR = 0;
      let peakR = 0;
      let maxDdR = 0;

      for (const r of validResults) {
        const td = tradeSlTpMap.get(r.tradeId);
        let threshold = backtestRR;
        let winR = backtestRR;

        if (td?.entryPrice && td?.exitPrice) {
          const sltpResult = inferSLTP(
            td.side as any,
            td.entryPrice,
            td.exitPrice,
            td.result,
            backtestRR,
            td.slPrice,
            td.tpPrice,
          );
          if (sltpResult?.source === 'ACTUAL' && sltpResult.actualRR != null) {
            threshold = sltpResult.actualRR;
            winR = sltpResult.actualRR;
          }
        }

        const isWin = (r.maxPotentialRR ?? 0) >= threshold;
        if (isWin) {
          wins++;
          grossProfit += winR;
          runningR += winR;
        } else {
          runningR -= 1.0;
        }
        if (runningR > peakR) peakR = runningR;
        const dd = peakR - runningR;
        if (dd > maxDdR) maxDdR = dd;
      }

      const losses = validResults.length - wins;
      const winRate = validResults.length > 0 ? (wins / validResults.length) * 100 : 0;
      const grossLoss = losses * 1.0;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
      const expectancy = (winRate / 100) * backtestRR - (1 - winRate / 100) * 1.0;

      comparison.push({
        timeframe: tf,
        totalTrades: rebuild.total,
        validTrades: validResults.length,
        winRate,
        wins,
        losses,
        profitFactor,
        expectancy,
        maxDrawdownR: maxDdR,
      });
    }

    return comparison;
  }

  /**
   * Detailed debug mode for a selected trade
   */
  async runTradeReplayDebug(
    tradeId: string,
    backtestRR = 1.0,
    engineVersion = '2.1.0',
    marketDataSource = 'DUKASCOPY',
    timeframe = 'M1'
  ) {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { session: true },
    });

    if (!trade) {
      console.error(`Trade ${tradeId} not found`);
      return null;
    }

    const baseSymbol = this.normalizeSymbol(trade.symbol);
    const tf = (timeframe || 'M1').toUpperCase();
    const alignedEntryTime = this.entryBarStart(trade.entryTime!, tf);
    const alignedExitTime = trade.exitTime || new Date(trade.entryTime!.getTime() + 14 * 86400000);

    const candles = await prisma.mt5CandleData.findMany({
      where: {
        provider: marketDataSource.toUpperCase(),
        symbol: { startsWith: baseSymbol },
        timeframe: tf,
        time: { gte: alignedEntryTime, lte: alignedExitTime },
      },
      orderBy: { time: 'asc' },
    });

    const replayRes = await this.runTradeReplayPipeline(
      trade,
      backtestRR,
      engineVersion,
      marketDataSource,
      tf
    );

    const isLong = trade.side === 'LONG' || trade.side === 'BUY';
    const entryPrice = trade.entryPrice!;
    const slPrice = replayRes.slUsed || trade.slPrice || 0;
    const risk = isLong ? (entryPrice - slPrice) : (slPrice - entryPrice);

    return {
      trade,
      candles,
      replayRes,
      firstCandle: candles[0] || null,
      lastCandle: candles[candles.length - 1] || null,
    };
  }

  /**
   * Compute Hypothetical Target RR simulation matrix for a session using VALID maxPotentialRR values.
   *
   * SIMULATION MODE (Hypothetical Target RR Matrix):
   * For each target RR (0.25, 0.5, 0.75, 1.0, etc.), evaluates what the win rate would be
   * IF the trade hypothetically exited at that target RR (maxPotentialRR >= target).
   * Win rate naturally varies with target RR (higher at 0.25/0.5, lower at 1.0/2.0).
   *
   * ACTUAL MODE (Actual Strategy Analysis):
   * Uses the actual SL/TP from the order/trade, available in the session overview and trade table.
   */
  async getRRSimulation(sessionId: string) {
    const trades = await prisma.trade.findMany({
      where: { sessionId, replayStatus: 'VALID', maxPotentialRR: { not: null } },
      select: {
        maxPotentialRR: true,
        slPrice: true,
        tpPrice: true,
        side: true,
        entryPrice: true,
        exitPrice: true,
        result: true,
      },
    });

    if (trades.length === 0) return [];

    const actualCount = trades.filter(t => t.slPrice && t.tpPrice && t.slPrice > 0 && t.tpPrice > 0).length;
    const rrTargets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 8, 10];

    return rrTargets.map(target => {
      const wins = trades.filter(t => (t.maxPotentialRR ?? 0) >= target).length;
      const losses = trades.length - wins;
      const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
      const expectancy = (winRate / 100) * target - (1 - winRate / 100) * 1;
      return {
        rrTarget: target,
        wins,
        losses,
        total: trades.length,
        winRate,
        expectancy,
        actualSLTPCount: actualCount,
        reconstructedCount: trades.length - actualCount,
      };
    });
  }

  /**
   * Fetch historical replay analyses for a trade (immutable history)
   */
  async getTradeReplayHistory(tradeId: string) {
    return prisma.tradeReplayAnalysis.findMany({
      where: { tradeId },
      orderBy: { replayTimestamp: 'desc' },
    });
  }

  /**
   * Fetch historical replay analyses for a session
   */
  async getSessionReplayHistory(sessionId: string) {
    return prisma.tradeReplayAnalysis.findMany({
      where: { trade: { sessionId } },
      include: {
        trade: {
          select: { symbol: true, side: true, entryPrice: true, exitPrice: true, entryTime: true, exitTime: true },
        },
      },
      orderBy: { replayTimestamp: 'desc' },
      take: 100,
    });
  }
}

export const marketAnalytics = new MarketAnalyticsService();
