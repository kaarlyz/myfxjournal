import { prisma } from '../../prisma';
import { TradeReplayInput, TradeReplayResult, ReplayPoint, ReplaySource, ReplayDataQuality, ReplayCoverage } from './types';
import { TradeReconstructor } from './TradeReconstructor';

export class ReplayCalculator {
  constructor(private readonly reconstructor = new TradeReconstructor()) {}

  async calculate(input: TradeReplayInput): Promise<TradeReplayResult> {
    const assumption = this.reconstructor.buildAssumption(input);
    const isLong = input.side === 'LONG';
    const normalizedSymbol = this.normalizeSymbol(input.symbol);
    const analysisWindowEndTime = this.getAnalysisWindowEndTime(input);

    const ticks = await prisma.mt5TickData.findMany({
      where: {
        symbol: { startsWith: normalizedSymbol },
        time: { gte: input.entryTime, lte: analysisWindowEndTime },
      },
      orderBy: { time: 'asc' },
      take: 50000,
    });

    const preferredTimeframes = ['M5', 'M1', 'M15', 'M30', 'H1', 'H4', 'D1'];
    let selectedTimeframe: string | null = null;
    let candles: Array<{ time: Date; high: number; low: number; close: number }> = [];

    for (const timeframe of preferredTimeframes) {
      const rows = await prisma.mt5CandleData.findMany({
        where: {
          symbol: { startsWith: normalizedSymbol },
          timeframe,
          time: { gte: input.entryTime, lte: analysisWindowEndTime },
        },
        orderBy: { time: 'asc' },
        take: 10000,
      });

      if (rows.length > 0) {
        selectedTimeframe = timeframe;
        candles = rows;
        break;
      }
    }

    const replaySource: ReplaySource = ticks.length > 0 ? 'TICK' : 'CANDLE';
    const sourceItems = replaySource === 'TICK'
      ? ticks.map((row) => ({ timestamp: row.time, price: (row.ask + row.bid) / 2, source: 'TICK' as const }))
      : candles.map((row) => ({ timestamp: row.time, price: isLong ? row.high : row.low, source: 'CANDLE' as const }));
    const coverage = this.buildCoverage(input, sourceItems, selectedTimeframe, analysisWindowEndTime);

    let maxRR = 0;
    let maxRRPrice = input.entryPrice;
    let maxRRTime: Date | null = input.entryTime;
    let maxRRPointIndex = 0;
    let mfePrice = input.entryPrice;
    let maePrice = input.entryPrice;
    const points: ReplayPoint[] = [];

    for (const [index, item] of sourceItems.entries()) {
      const price = item.price;
      const currentRR = this.computeRR(input.entryPrice, assumption.riskDistance, price, isLong);
      if (currentRR > maxRR) {
        maxRR = currentRR;
        maxRRPrice = price;
        maxRRTime = item.timestamp;
        maxRRPointIndex = index;
      }

      if (isLong) {
        if (price < maePrice) maePrice = price;
        if (price > mfePrice) mfePrice = price;
      } else {
        if (price > maePrice) maePrice = price;
        if (price < mfePrice) mfePrice = price;
      }

      points.push({
        timestamp: item.timestamp,
        price,
        isExit: index === sourceItems.length - 1,
        rr: currentRR,
        mfe: mfePrice,
        mae: maePrice,
        source: replaySource,
        candleIndex: index,
      });
    }

    const actualExitRR = this.computeRR(input.entryPrice, assumption.riskDistance, input.exitPrice, isLong);
    const capturedRR = Math.max(0, actualExitRR);
    const potentialRRLost = Math.max(0, maxRR - capturedRR);
    const timeToMaxRR = maxRRTime ? Math.max(0, maxRRTime.getTime() - input.entryTime.getTime()) : 0;
    const timeAfterExit = Math.max(0, input.exitTime.getTime() - (maxRRTime?.getTime() ?? input.exitTime.getTime()));
    const exitEfficiencyPct = maxRR > 0 && assumption.riskDistance > 0 ? (capturedRR / Math.max(maxRR, 1e-9)) * 100 : 0;
    const dataQuality = this.getDataQuality(sourceItems, input.entryTime, input.exitTime);

    return {
      tradeId: input.tradeId,
      symbol: input.symbol,
      side: input.side,
      replaySource,
      assumption,
      maxRR,
      maxRRPrice,
      maxRRTime,
      maxRRPointIndex,
      mfePrice,
      maePrice,
      timeToMaxRR,
      timeAfterExit,
      exitEfficiencyPct,
      capturedRR,
      potentialRRLost,
      replayPoints: points,
      usedTickData: replaySource === 'TICK',
      usedCandleData: replaySource === 'CANDLE',
      dataQuality,
      selectedTimeframe,
      dataPointCount: sourceItems.length,
      dataStartTime: sourceItems[0]?.timestamp ?? null,
      dataEndTime: sourceItems[sourceItems.length - 1]?.timestamp ?? null,
      coverageGapCount: this.countCoverageGaps(sourceItems),
      coverage,
    };
  }

  private computeRR(entryPrice: number, riskDistance: number, price: number, isLong: boolean): number {
    if (riskDistance <= 0) return 0;
    const move = isLong ? price - entryPrice : entryPrice - price;
    return move / riskDistance;
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 6);
  }

  private getDataQuality(sourceItems: Array<{ timestamp: Date }>, entryTime: Date, exitTime: Date): ReplayDataQuality {
    if (sourceItems.length === 0) return 'NO_DATA';

    const first = sourceItems[0]?.timestamp;
    const last = sourceItems[sourceItems.length - 1]?.timestamp;

    if (first && last && first <= entryTime && last >= exitTime) {
      return sourceItems.length >= 20 ? 'FULL' : 'PARTIAL';
    }

    return 'PARTIAL';
  }

  private countCoverageGaps(sourceItems: Array<{ timestamp: Date }>): number {
    if (sourceItems.length < 2) return 0;

    let gaps = 0;
    for (let index = 1; index < sourceItems.length; index += 1) {
      const previous = sourceItems[index - 1].timestamp.getTime();
      const current = sourceItems[index].timestamp.getTime();
      if (current - previous > 24 * 60 * 60 * 1000) {
        gaps += 1;
      }
    }
    return gaps;
  }

  private getAnalysisWindowEndTime(input: TradeReplayInput): Date {
    if (!input.includePostExitPotential) {
      return input.exitTime;
    }

    const intervalMs = this.timeframeToMs(input.timeframe ?? 'M5');
    return new Date(input.exitTime.getTime() + intervalMs);
  }

  private buildCoverage(input: TradeReplayInput, sourceItems: Array<{ timestamp: Date }>, selectedTimeframe: string | null, analysisWindowEndTime: Date): ReplayCoverage {
    if (!selectedTimeframe) {
      const expectedPointCount = Math.max(1, Math.round((analysisWindowEndTime.getTime() - input.entryTime.getTime()) / (5 * 60 * 1000)) + 1);
      return {
        coveragePct: sourceItems.length > 0 ? Math.min(100, (sourceItems.length / expectedPointCount) * 100) : 0,
        expectedPointCount,
        coveredPointCount: sourceItems.length,
        missingTimestamps: [],
      };
    }

    const intervalMs = this.timeframeToMs(selectedTimeframe);
    const expectedPointCount = Math.max(1, Math.round((analysisWindowEndTime.getTime() - input.entryTime.getTime()) / intervalMs) + 1);
    const expectedTimestamps = Array.from({ length: expectedPointCount }, (_, index) => new Date(input.entryTime.getTime() + index * intervalMs));
    const expectedSet = new Set(expectedTimestamps.map((timestamp) => timestamp.toISOString()));
    const coveredPointCount = sourceItems.filter((item) => expectedSet.has(item.timestamp.toISOString())).length;
    const missingTimestamps = expectedTimestamps
      .filter((timestamp) => !sourceItems.some((item) => item.timestamp.toISOString() === timestamp.toISOString()))
      .map((timestamp) => timestamp.toISOString());

    return {
      coveragePct: expectedPointCount > 0 ? Math.round((coveredPointCount / expectedPointCount) * 1000) / 10 : 0,
      expectedPointCount,
      coveredPointCount,
      missingTimestamps,
    };
  }

  private timeframeToMs(timeframe: string): number {
    const map: Record<string, number> = {
      M1: 60_000,
      M5: 5 * 60_000,
      M15: 15 * 60_000,
      M30: 30 * 60_000,
      H1: 60 * 60_000,
      H4: 4 * 60 * 60_000,
      D1: 24 * 60 * 60_000,
    };
    return map[timeframe] ?? 5 * 60_000;
  }
}
