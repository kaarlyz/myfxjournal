import * as fs from 'fs';
import * as readline from 'readline';
import * as crypto from 'crypto';
import { prisma } from '../../prisma';

export interface DukascopyImportOptions {
  filePath: string;
  symbol?: string;
  timeframe?: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  batchSize?: number;
  onProgress?: (processed: number, inserted: number, totalEst?: number) => void;
}

export interface DukascopyImportResult {
  symbol: string;
  timeframe: string;
  provider: string;
  totalLinesRead: number;
  insertedCount: number;
  dateFrom: Date | null;
  dateTo: Date | null;
  durationMs: number;
  catalogId: string;
}

export class DukascopyImporter {
  /**
   * Import Dukascopy CSV (Date,Time,Open,High,Low,Close,Volume)
   * Example row: 20210823,01:00:00,1779.598,1781.203,1779.598,1780.883,46430
   */
  async importCsv(options: DukascopyImportOptions): Promise<DukascopyImportResult> {
    const startTime = Date.now();
    const symbol = (options.symbol || 'XAUUSD').toUpperCase();
    const timeframe = (options.timeframe || 'M1').toUpperCase();
    const provider = 'DUKASCOPY';
    const batchSize = options.batchSize || 5000;

    if (!fs.existsSync(options.filePath)) {
      throw new Error(`Dukascopy CSV file not found at: ${options.filePath}`);
    }

    const fileStream = fs.createReadStream(options.filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let totalLinesRead = 0;
    let insertedCount = 0;
    let isHeader = true;
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;

    let batch: Array<{
      id: string;
      provider: string;
      symbol: string;
      timeframe: string;
      time: Date;
      open: number;
      high: number;
      low: number;
      close: number;
      tickVolume: number;
      realVolume: number;
      spread: number;
    }> = [];

    const flushBatch = async () => {
      if (batch.length === 0) return;

      const currentBatch = batch;
      batch = [];

      // Use raw SQL with INSERT OR IGNORE for maximum speed and safety
      // SQLite parameter limit: up to 32766 parameters, so chunking in sub-batches of 1000 rows (13 cols = 13,000 params)
      const subBatchSize = 1000;
      for (let i = 0; i < currentBatch.length; i += subBatchSize) {
        const sub = currentBatch.slice(i, i + subBatchSize);
        const placeholders: string[] = [];
        const params: any[] = [];

        for (const row of sub) {
          placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          params.push(
            row.id,
            row.provider,
            row.symbol,
            row.timeframe,
            row.time.getTime(),
            row.open,
            row.high,
            row.low,
            row.close,
            row.tickVolume,
            row.realVolume,
            row.spread,
            Date.now()
          );
        }

        const sql = `INSERT OR IGNORE INTO Mt5CandleData (id, provider, symbol, timeframe, time, open, high, low, close, tickVolume, realVolume, spread, createdAt) VALUES ${placeholders.join(', ')}`;
        await prisma.$executeRawUnsafe(sql, ...params);
        insertedCount += sub.length;
      }

      if (options.onProgress) {
        options.onProgress(totalLinesRead, insertedCount);
      }
    };

    for await (const line of rl) {
      if (!line.trim()) continue;
      if (isHeader) {
        isHeader = false;
        continue;
      }

      totalLinesRead++;
      const parts = line.split(',');
      if (parts.length < 6) continue;

      const dStr = parts[0].trim(); // YYYYMMDD
      const tStr = parts[1].trim(); // HH:mm:ss
      if (dStr.length < 8) continue;

      const y = parseInt(dStr.slice(0, 4), 10);
      const m = parseInt(dStr.slice(4, 6), 10) - 1;
      const d = parseInt(dStr.slice(6, 8), 10);
      const timeParts = tStr.split(':');
      const hh = parseInt(timeParts[0] || '0', 10);
      const mm = parseInt(timeParts[1] || '0', 10);
      const ss = parseInt(timeParts[2] || '0', 10);

      const time = new Date(Date.UTC(y, m, d, hh, mm, ss));
      if (isNaN(time.getTime())) continue;

      if (options.fromTimestamp && time < options.fromTimestamp) continue;
      if (options.toTimestamp && time > options.toTimestamp) continue;

      if (!firstDate || time < firstDate) firstDate = time;
      if (!lastDate || time > lastDate) lastDate = time;

      const open = parseFloat(parts[2]);
      const high = parseFloat(parts[3]);
      const low = parseFloat(parts[4]);
      const close = parseFloat(parts[5]);
      const volume = parts[6] ? parseFloat(parts[6]) : 0;

      batch.push({
        id: crypto.randomUUID(),
        provider,
        symbol,
        timeframe,
        time,
        open,
        high,
        low,
        close,
        tickVolume: volume,
        realVolume: volume,
        spread: 10,
      });

      if (batch.length >= batchSize) {
        await flushBatch();
      }
    }

    // Flush any remaining batch
    await flushBatch();

    // Query exact count and range from DB to ensure precision
    const count = await prisma.mt5CandleData.count({
      where: { provider, symbol, timeframe },
    });

    const range = await prisma.mt5CandleData.aggregate({
      where: { provider, symbol, timeframe },
      _min: { time: true },
      _max: { time: true },
    });

    const actualDateFrom = range._min.time || firstDate || new Date();
    const actualDateTo = range._max.time || lastDate || new Date();

    // Upsert MarketDataCatalog record for DUKASCOPY
    const catalog = await prisma.marketDataCatalog.upsert({
      where: {
        provider_symbol_dataType_timeframe: {
          provider,
          symbol,
          dataType: 'CANDLE',
          timeframe,
        },
      },
      create: {
        provider,
        broker: 'Dukascopy',
        symbol,
        dataType: 'CANDLE',
        timeframe,
        dateFrom: actualDateFrom,
        dateTo: actualDateTo,
        candleCount: count,
        dataSourceType: 'REAL',
        downloadStatus: 'COMPLETE',
        lastSyncedAt: new Date(),
      },
      update: {
        dateFrom: actualDateFrom,
        dateTo: actualDateTo,
        candleCount: count,
        dataSourceType: 'REAL',
        downloadStatus: 'COMPLETE',
        lastSyncedAt: new Date(),
      },
    });

    const durationMs = Date.now() - startTime;

    return {
      symbol,
      timeframe,
      provider,
      totalLinesRead,
      insertedCount: count,
      dateFrom: actualDateFrom,
      dateTo: actualDateTo,
      durationMs,
      catalogId: catalog.id,
    };
  }
}

export const dukascopyImporter = new DukascopyImporter();
