import { prisma } from '../../prisma';
import { TradeReplayInput, TradeReplayResult, ReplaySummaryMetrics } from './types';
import { ReplayCalculator } from './ReplayCalculator';

export class RREngine {
  constructor(private readonly calculator = new ReplayCalculator()) {}

  async analyzeSession(sessionId: string): Promise<{ results: TradeReplayResult[]; summary: ReplaySummaryMetrics }> {
    const trades = await prisma.trade.findMany({
      where: { sessionId, status: 'CLOSED' },
      select: {
        id: true,
        symbol: true,
        side: true,
        entryPrice: true,
        exitPrice: true,
        entryTime: true,
        exitTime: true,
        result: true,
        slPrice: true,
        tpPrice: true,
      },
      orderBy: { entryTime: 'asc' },
    });

    const inputs: TradeReplayInput[] = trades.filter((trade) => trade.entryPrice != null && trade.exitPrice != null && trade.entryTime && trade.exitTime).map((trade) => ({
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side === 'SHORT' ? 'SHORT' : 'LONG',
      entryPrice: Number(trade.entryPrice),
      exitPrice: Number(trade.exitPrice),
      entryTime: trade.entryTime as Date,
      exitTime: trade.exitTime as Date,
      result: trade.result ?? 'UNKNOWN',
      slPrice: trade.slPrice ? Number(trade.slPrice) : null,
      tpPrice: trade.tpPrice ? Number(trade.tpPrice) : null,
      riskValue: null,
      riskMode: null,
      timeframe: 'H1',
    }));

    const results = await Promise.all(inputs.map(async (input) => {
      const result = await this.calculator.calculate(input);
      await prisma.trade.update({
        where: { id: input.tradeId },
        data: {
          plannedRR: result.assumption.plannedRR,
          maxPotentialRR: result.maxRR,
          mfePrice: result.mfePrice,
          maePrice: result.maePrice,
        },
      });
      return result;
    }));

    const summary = this.buildSummary(results);
    return { results, summary };
  }

  private buildSummary(results: TradeReplayResult[]): ReplaySummaryMetrics {
    const maxRRs = results.map((r) => r.maxRR);
    const averageMaxRR = maxRRs.reduce((a, b) => a + b, 0) / (maxRRs.length || 1);
    const medianMaxRR = this.median(maxRRs);
    const captureEfficiencyAvg = results.reduce((a, b) => a + b.exitEfficiencyPct, 0) / (results.length || 1);
    const averageLostOpportunity = results.reduce((a, b) => a + b.potentialRRLost, 0) / (results.length || 1);
    const topMissedTrades = [...results]
      .sort((a, b) => b.potentialRRLost - a.potentialRRLost)
      .slice(0, 20)
      .map((r) => ({ tradeId: r.tradeId, maxRR: r.maxRR, capturedRR: r.capturedRR, potentialRRLost: r.potentialRRLost }));

    return {
      averageMaxRR,
      medianMaxRR,
      topMissedTrades,
      captureEfficiencyAvg,
      averageLostOpportunity,
      rrDistribution: this.buildDistribution(results),
      potentialEquityCurve: [],
      actualEquityCurve: [],
    };
  }

  private buildDistribution(results: TradeReplayResult[]) {
    const buckets = ['0-1R', '1-2R', '2-3R', '3-4R', '4R+'];
    const counts = buckets.map((bucket) => ({ bucket, count: 0 }));
    for (const result of results) {
      if (result.maxRR < 1) counts[0].count += 1;
      else if (result.maxRR < 2) counts[1].count += 1;
      else if (result.maxRR < 3) counts[2].count += 1;
      else if (result.maxRR < 4) counts[3].count += 1;
      else counts[4].count += 1;
    }
    return counts;
  }

  private median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
    return sorted[mid];
  }
}

export const rrEngine = new RREngine();
