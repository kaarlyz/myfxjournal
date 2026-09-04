import { prisma } from '../../prisma';
import { defaultStorage } from './sqliteStorage';
import { MissingRange } from './types';

export class MarketDataCacheManager {
  private getTimeframeMs(timeframe?: string): number | null {
    if (!timeframe) return null;

    switch (timeframe.toUpperCase()) {
      case 'M1':
        return 60_000;
      case 'M5':
        return 5 * 60_000;
      case 'M15':
        return 15 * 60_000;
      case 'M30':
        return 30 * 60_000;
      case 'H1':
        return 60 * 60_000;
      case 'H4':
        return 4 * 60 * 60_000;
      case 'D1':
        return 24 * 60 * 60_000;
      default:
        return null;
    }
  }

  private mergeMissingRanges(ranges: MissingRange[]): MissingRange[] {
    const normalized = ranges
      .map((range) => ({
        from: new Date(range.from).getTime(),
        to: new Date(range.to).getTime(),
      }))
      .filter((range) => range.from <= range.to)
      .sort((a, b) => a.from - b.from);

    const merged: MissingRange[] = [];
    for (const range of normalized) {
      if (!merged.length) {
        merged.push({ from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() });
        continue;
      }

      const last = merged[merged.length - 1];
      const lastToMs = new Date(last.to).getTime();
      if (range.from <= lastToMs + 1000) {
        last.to = new Date(Math.max(lastToMs, range.to)).toISOString();
      } else {
        merged.push({ from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() });
      }
    }

    return merged;
  }

  private async findMissingRangesFromStoredCandles(
    symbol: string,
    timeframe: string,
    requestedFrom: Date,
    requestedTo: Date
  ): Promise<MissingRange[]> {
    const intervalMs = this.getTimeframeMs(timeframe);
    if (!intervalMs) return [];

    const candleRows = await prisma.mt5CandleData.findMany({
      where: {
        symbol,
        timeframe,
        time: { gte: requestedFrom, lte: requestedTo },
      },
      orderBy: { time: 'asc' },
      select: { time: true },
    });

    if (!candleRows.length) {
      return [
        {
          from: requestedFrom.toISOString(),
          to: requestedTo.toISOString(),
        },
      ];
    }

    const missingRanges: MissingRange[] = [];
    const requestedFromMs = requestedFrom.getTime();
    const requestedToMs = requestedTo.getTime();
    const firstTimeMs = candleRows[0].time.getTime();

    if (firstTimeMs > requestedFromMs) {
      missingRanges.push({
        from: requestedFrom.toISOString(),
        to: new Date(firstTimeMs - intervalMs).toISOString(),
      });
    }

    let previousTimeMs = firstTimeMs;
    for (let i = 1; i < candleRows.length; i++) {
      const currentTimeMs = candleRows[i].time.getTime();
      if (currentTimeMs - previousTimeMs > intervalMs + 1000) {
        missingRanges.push({
          from: new Date(previousTimeMs + intervalMs).toISOString(),
          to: new Date(currentTimeMs - intervalMs).toISOString(),
        });
      }
      previousTimeMs = currentTimeMs;
    }

    if (previousTimeMs < requestedToMs) {
      missingRanges.push({
        from: new Date(previousTimeMs + intervalMs).toISOString(),
        to: requestedTo.toISOString(),
      });
    }

    return this.mergeMissingRanges(missingRanges);
  }

  /**
   * Determine missing date ranges (gaps) for a requested symbol and date window.
   * Compares the requested [from, to] against catalog and existing DB coverage.
   */
  async findMissingRanges(
    symbol: string,
    dataType: 'TICK' | 'CANDLE',
    timeframe: string | undefined,
    requestedFrom: Date,
    requestedTo: Date
  ): Promise<{ missingRanges: MissingRange[]; hasExistingData: boolean }> {
    const sym = symbol.toUpperCase();
    const tf = timeframe ? timeframe.toUpperCase() : undefined;

    const catalog = await prisma.marketDataCatalog.findFirst({
      where: {
        symbol: sym,
        dataType,
        timeframe: tf || null,
      },
    });

    if (!catalog) {
      return {
        missingRanges: [
          {
            from: requestedFrom.toISOString(),
            to: requestedTo.toISOString(),
          },
        ],
        hasExistingData: false,
      };
    }

    const missing: MissingRange[] = [];

    const cachedFrom = catalog.dateFrom;
    const cachedTo = catalog.dateTo;
    const overlapFrom = new Date(Math.max(requestedFrom.getTime(), cachedFrom.getTime()));
    const overlapTo = new Date(Math.min(requestedTo.getTime(), cachedTo.getTime()));

    if (dataType === 'CANDLE' && tf && overlapFrom <= overlapTo) {
      const internalGaps = await this.findMissingRangesFromStoredCandles(sym, tf, overlapFrom, overlapTo);
      missing.push(...internalGaps);
    }

    if (requestedFrom < cachedFrom) {
      missing.push({
        from: requestedFrom.toISOString(),
        to: new Date(Math.min(requestedTo.getTime(), cachedFrom.getTime() - 1000)).toISOString(),
      });
    }

    if (requestedTo > cachedTo) {
      missing.push({
        from: new Date(Math.max(requestedFrom.getTime(), cachedTo.getTime() + 1000)).toISOString(),
        to: requestedTo.toISOString(),
      });
    }

    return {
      missingRanges: this.mergeMissingRanges(missing),
      hasExistingData: true,
    };
  }

  /**
   * Update catalog metadata inventory after a batch download or sync completes
   */
  async updateCatalog(
    symbol: string,
    dataType: 'TICK' | 'CANDLE',
    timeframe?: string,
    dataSourceType: string = 'REAL'
  ): Promise<void> {
    const sym = symbol.toUpperCase();
    const tf = timeframe ? timeframe.toUpperCase() : undefined;

    const coverage = await defaultStorage.getCoverage(sym, dataType, tf);
    if (!coverage.dateFrom || !coverage.dateTo) return;

    let missingRanges: MissingRange[] = [];
    if (dataType === 'CANDLE' && tf) {
      missingRanges = await this.findMissingRangesFromStoredCandles(sym, tf, coverage.dateFrom, coverage.dateTo);
    }

    const downloadStatus = missingRanges.length ? 'PARTIAL' : 'COMPLETE';

    await prisma.marketDataCatalog.upsert({
      where: {
        provider_symbol_dataType_timeframe: {
          provider: 'MT5',
          symbol: sym,
          dataType,
          timeframe: tf || '',
        },
      },
      create: {
        provider: 'MT5',
        symbol: sym,
        dataType,
        timeframe: tf || null,
        dateFrom: coverage.dateFrom,
        dateTo: coverage.dateTo,
        tickCount: dataType === 'TICK' ? coverage.count : 0,
        candleCount: dataType === 'CANDLE' ? coverage.count : 0,
        dataSourceType,
        downloadStatus,
        missingRangesJson: missingRanges.length ? JSON.stringify(missingRanges) : null,
      },
      update: {
        dateFrom: coverage.dateFrom,
        dateTo: coverage.dateTo,
        tickCount: dataType === 'TICK' ? coverage.count : 0,
        candleCount: dataType === 'CANDLE' ? coverage.count : 0,
        dataSourceType,
        lastSyncedAt: new Date(),
        downloadStatus,
        missingRangesJson: missingRanges.length ? JSON.stringify(missingRanges) : null,
      },
    });
  }
}

export const cacheManager = new MarketDataCacheManager();
