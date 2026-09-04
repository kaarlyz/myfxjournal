import { prisma } from '../../prisma';
import { logIntegration } from '../../utils/logger';
import { cacheManager } from './cacheManager';
import { defaultStorage } from './sqliteStorage';
import { JobStatus } from './types';

export class SyncJobOrchestrator {
  /**
   * Create a new background download sync job with gap detection and auto-fulfillment fallback
   */
  async createJob(params: {
    symbol: string;
    dataType: 'TICK' | 'CANDLE' | 'HISTORY';
    timeframe?: string;
    dateFrom: Date;
    dateTo: Date;
    terminalId?: string;
    allowSynthetic?: boolean;
  }): Promise<{ job: any; gaps: any[]; error?: string; code?: string; message?: string }> {
    const { symbol, dataType, timeframe, dateFrom, dateTo, terminalId, allowSynthetic } = params;
    const sym = symbol.toUpperCase();
    const tf = timeframe ? timeframe.toUpperCase() : null;

    // Run gap detection for TICK and CANDLE downloads
    let gaps: any[] = [];
    let isAlreadyCached = false;

    if (dataType === 'TICK' || dataType === 'CANDLE') {
      const gapRes = await cacheManager.findMissingRanges(sym, dataType, tf || undefined, dateFrom, dateTo);
      gaps = gapRes.missingRanges;

      if (gaps.length === 0 && gapRes.hasExistingData) {
        isAlreadyCached = true;
        logIntegration('MT5', 'JOB_SKIPPED', 'INFO', `No download needed for ${sym} ${dataType}: requested range already cached in database.`);
      }
    }

    // Queue the job as QUEUED so any polling ONLINE EA terminal can pick it up.
    // We do NOT reject the job if no terminal is currently registered as ONLINE in the DB,
    // because the EA may be polling and will upsert itself to ONLINE on the next /tasks/next call.
    // Only reject if allowSynthetic is NOT set — we simply don't auto-generate fake data.
    if (!isAlreadyCached && allowSynthetic) {
      // allowSynthetic path: only used for explicit testing — terminal check not needed.
    }

    // Always queue a real download job for EA pickup. It transitions: QUEUED → RUNNING (when EA picks it) → FINISHED
    const initialStatus: JobStatus = isAlreadyCached ? 'FINISHED' : 'QUEUED';
    const initialProgress = isAlreadyCached ? 100 : 0;

    const job = await prisma.mt5SyncJob.create({
      data: {
        terminalId: terminalId || null,
        symbol: sym,
        dataType,
        timeframe: tf,
        dateFrom,
        dateTo,
        status: initialStatus,
        progressPct: initialProgress,
        cursorTimestamp: dateFrom,
      },
    });

    await prisma.mt5SyncLog.create({
      data: {
        terminalId: terminalId || null,
        jobId: job.id,
        eventType: 'JOB_CREATED',
        status: 'INFO',
        message: `Sync job queued for ${sym} ${dataType} (${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)}) — waiting for EA terminal to pick up`,
        details: JSON.stringify({ gaps, isAlreadyCached }),
      },
    });

    logIntegration('MT5', 'JOB_QUEUED', 'INFO',
      `Download job queued for ${sym} ${tf || ''} ${dataType}. Waiting for ONLINE EA terminal to process.`);

    // allowSynthetic: explicit testing path only
    if (!isAlreadyCached && allowSynthetic) {
      this.autoFulfillOfflineJob(job.id, sym, dataType, tf || 'H1', dateFrom, dateTo).catch(err => {
        console.error('[MT5 Sync Job] Auto fulfill error:', err);
      });
    }

    return { job, gaps };
  }

  /**
   * Auto-generate fallback market data when MT5 EA is offline so jobs don't stay pending (Explicit Test Mode Only)
   */
  private async autoFulfillOfflineJob(
    jobId: string,
    symbol: string,
    dataType: string,
    timeframe: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<void> {
    try {
      logIntegration('MT5', 'OFFLINE_AUTO_FULFILL', 'INFO', `Auto-generating synthetic test data for offline job ${jobId} (${symbol} ${dataType})`);

      if (dataType === 'CANDLE') {
        const candles = this.generateSyntheticCandles(symbol, timeframe, dateFrom, dateTo);
        const count = await defaultStorage.saveCandles(candles);
        await cacheManager.updateCatalog(symbol, 'CANDLE', timeframe, 'SYNTHETIC');
        
        await prisma.mt5SyncJob.update({
          where: { id: jobId },
          data: {
            downloadedItems: count,
            chunkCount: 1,
            progressPct: 100,
            status: 'FINISHED',
            cursorTimestamp: dateTo,
          },
        });
      } else if (dataType === 'TICK') {
        const ticks = this.generateSyntheticTicks(symbol, dateFrom, dateTo);
        const count = await defaultStorage.saveTicks(ticks);
        await cacheManager.updateCatalog(symbol, 'TICK', timeframe, 'SYNTHETIC');

        await prisma.mt5SyncJob.update({
          where: { id: jobId },
          data: {
            downloadedItems: count,
            chunkCount: 1,
            progressPct: 100,
            status: 'FINISHED',
            cursorTimestamp: dateTo,
          },
        });
      }

      await cacheManager.updateCatalog(symbol, dataType as any, timeframe);
    } catch (err: any) {
      console.error('Failed to auto fulfill offline job:', err);
      await prisma.mt5SyncJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: err?.message || 'Offline data generation failed',
        },
      });
    }
  }

  /**
   * Generate realistic synthetic candles for offline market data testing
   */
  private generateSyntheticCandles(symbol: string, timeframe: string, from: Date, to: Date) {
    const candles = [];
    let tfMinutes = 60;
    if (timeframe === 'M1') tfMinutes = 1;
    else if (timeframe === 'M5') tfMinutes = 5;
    else if (timeframe === 'M15') tfMinutes = 15;
    else if (timeframe === 'M30') tfMinutes = 30;
    else if (timeframe === 'H1') tfMinutes = 60;
    else if (timeframe === 'H4') tfMinutes = 240;
    else if (timeframe === 'D1') tfMinutes = 1440;

    let basePrice = symbol.includes('XAU') ? 2650.0 : symbol.includes('JPY') ? 155.00 : 1.0850;
    const intervalMs = tfMinutes * 60 * 1000;
    let curr = new Date(from.getTime());

    // Limit to max 100000 candles per offline generation batch
    const maxCandles = 100000;
    let count = 0;

    while (curr <= to && count < maxCandles) {
      const volatility = basePrice * 0.003;
      const change = (Math.random() - 0.49) * volatility;
      const open = basePrice;
      const close = basePrice + change;
      const high = Math.max(open, close) + Math.random() * volatility * 0.5;
      const low = Math.min(open, close) - Math.random() * volatility * 0.5;

      candles.push({
        symbol,
        timeframe,
        time: new Date(curr),
        open: Number(open.toFixed(5)),
        high: Number(high.toFixed(5)),
        low: Number(low.toFixed(5)),
        close: Number(close.toFixed(5)),
        tickVolume: Math.floor(Math.random() * 500) + 100,
        realVolume: Math.floor(Math.random() * 1000) + 200,
        spread: 12,
      });

      basePrice = close;
      curr = new Date(curr.getTime() + intervalMs);
      count++;
    }

    return candles;
  }

  /**
   * Generate realistic synthetic ticks for offline tick testing
   */
  private generateSyntheticTicks(symbol: string, from: Date, to: Date) {
    const ticks = [];
    let basePrice = symbol.includes('XAU') ? 2650.0 : 1.0850;
    const intervalMs = 60 * 1000; // 1 tick per minute sample
    let curr = new Date(from.getTime());
    const maxTicks = 2000;
    let count = 0;

    while (curr <= to && count < maxTicks) {
      const change = (Math.random() - 0.49) * (basePrice * 0.001);
      basePrice += change;
      const spread = basePrice * 0.00015;

      ticks.push({
        symbol,
        time: new Date(curr),
        bid: Number(basePrice.toFixed(5)),
        ask: Number((basePrice + spread).toFixed(5)),
        last: Number(basePrice.toFixed(5)),
        volume: 1,
        flags: 6,
      });

      curr = new Date(curr.getTime() + intervalMs);
      count++;
    }

    return ticks;
  }

  /**
   * Get next pending task for a connected MT5 Terminal (Task Pull Architecture)
   */
  async getNextTaskForTerminal(terminalId: string): Promise<any | null> {
    const pendingJob = await prisma.mt5SyncJob.findFirst({
      where: {
        status: { in: ['PENDING', 'QUEUED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!pendingJob) return null;

    if (terminalId && terminalId !== 'default') {
      await prisma.mt5Terminal.upsert({
        where: { terminalId },
        create: { terminalId, status: 'ONLINE' },
        update: { status: 'ONLINE' },
      });
    }

    if (!pendingJob.terminalId || pendingJob.status === 'PENDING' || pendingJob.status === 'QUEUED') {
      await prisma.mt5SyncJob.update({
        where: { id: pendingJob.id },
        data: {
          terminalId,
          status: 'RUNNING',
        },
      });
    }

    return {
      taskId: pendingJob.id,
      symbol: pendingJob.symbol,
      dataType: pendingJob.dataType,
      timeframe: pendingJob.timeframe,
      dateFrom: pendingJob.cursorTimestamp || pendingJob.dateFrom,
      dateTo: pendingJob.dateTo,
      chunkSize: 5000,
    };
  }

  /**
   * Update progress for an ongoing sync job (Resume & Cursor tracking)
   */
  async updateJobProgress(
    jobId: string,
    downloadedCount: number,
    lastItemTime?: Date | string
  ): Promise<void> {
    const job = await prisma.mt5SyncJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const totalDownloaded = job.downloadedItems + downloadedCount;
    const newChunkCount = job.chunkCount + 1;
    let newCursor = job.cursorTimestamp;

    if (lastItemTime) {
      newCursor = new Date(lastItemTime);
    }

    let pct = job.progressPct;
    if (job.dateFrom && job.dateTo && newCursor) {
      const totalSpan = job.dateTo.getTime() - job.dateFrom.getTime();
      const currentSpan = newCursor.getTime() - job.dateFrom.getTime();
      if (totalSpan > 0) {
        pct = Math.min(100, Math.max(pct, Math.round((currentSpan / totalSpan) * 100)));
      }
    }
    if (downloadedCount > 0 && pct < 100) {
      pct = Math.max(pct, 100); // Mark complete when chunk ingested
    }

    await prisma.mt5SyncJob.update({
      where: { id: jobId },
      data: {
        downloadedItems: totalDownloaded,
        chunkCount: newChunkCount,
        cursorTimestamp: newCursor,
        progressPct: pct,
        status: pct >= 100 ? 'FINISHED' : 'RUNNING',
      },
    });

    if (pct >= 100) {
      // Tag as REAL since this was fulfilled by a live EA terminal (not synthetic generator)
      await cacheManager.updateCatalog(job.symbol, job.dataType as any, job.timeframe || undefined, 'REAL');
      logIntegration('MT5', 'CATALOG_UPDATED', 'SUCCESS',
        `Catalog updated: ${job.symbol} ${job.timeframe} ${job.dataType} marked as REAL`);
    }
  }

  /**
   * Update Job Action (Pause, Resume, Cancel)
   */
  async setJobStatus(jobId: string, status: JobStatus): Promise<any> {
    const updated = await prisma.mt5SyncJob.update({
      where: { id: jobId },
      data: { status },
    });

    await prisma.mt5SyncLog.create({
      data: {
        jobId,
        eventType: `JOB_${status}`,
        status: status === 'FAILED' ? 'ERROR' : 'INFO',
        message: `Sync job status changed to ${status}`,
      },
    });

    return updated;
  }
}

export const jobOrchestrator = new SyncJobOrchestrator();
