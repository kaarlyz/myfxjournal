import { prisma } from '../../src/prisma';
import { logIntegration } from '../../src/utils/logger';
import { cacheManager } from './cacheManager';
import { JobStatus, SyncJobDefinition } from './types';

export class SyncJobOrchestrator {
  /**
   * Create a new background download sync job with gap detection
   */
  async createJob(params: {
    symbol: string;
    dataType: 'TICK' | 'CANDLE' | 'HISTORY';
    timeframe?: string;
    dateFrom: Date;
    dateTo: Date;
    terminalId?: string;
  }): Promise<{ job: any; gaps: any[] }> {
    const { symbol, dataType, timeframe, dateFrom, dateTo, terminalId } = params;
    const sym = symbol.toUpperCase();
    const tf = timeframe ? timeframe.toUpperCase() : null;

    // Run gap detection for TICK and CANDLE downloads
    let gaps: any[] = [];
    if (dataType === 'TICK' || dataType === 'CANDLE') {
      const gapRes = await cacheManager.findMissingRanges(sym, dataType, tf || undefined, dateFrom, dateTo);
      gaps = gapRes.missingRanges;

      if (gaps.length === 0 && gapRes.hasExistingData) {
        logIntegration('MT5', 'JOB_SKIPPED', 'INFO', `No download needed for ${sym} ${dataType}: requested range already cached in database.`);
      }
    }

    const job = await prisma.mt5SyncJob.create({
      data: {
        terminalId: terminalId || null,
        symbol: sym,
        dataType,
        timeframe: tf,
        dateFrom,
        dateTo,
        status: 'PENDING',
        progressPct: 0,
        cursorTimestamp: dateFrom,
      },
    });

    await logIntegration('MT5', 'JOB_CREATED', 'INFO', `Created sync job ${job.id} for ${sym} ${dataType}`, {
      jobId: job.id,
      terminalId: terminalId || null,
      symbol: sym,
      dataType,
      timeframe: tf,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      gaps,
    });

    await prisma.mt5SyncLog.create({
      data: {
        terminalId: terminalId || null,
        jobId: job.id,
        eventType: 'JOB_CREATED',
        status: 'INFO',
        message: `Sync job created for ${sym} ${dataType} (${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)})`,
        details: JSON.stringify({ gaps }),
      },
    });

    return { job, gaps };
  }

  /**
   * Get next pending task for a connected MT5 Terminal (Task Pull Architecture)
   */
  async getNextTaskForTerminal(terminalId: string): Promise<any | null> {
    const pendingJob = await prisma.mt5SyncJob.findFirst({
      where: {
        status: { in: ['PENDING', 'QUEUED', 'RUNNING'] },
        OR: [{ terminalId }, { terminalId: null }],
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!pendingJob) return null;

    // Lock job to this terminal if not assigned
    if (!pendingJob.terminalId || pendingJob.status === 'PENDING') {
      await prisma.mt5SyncJob.update({
        where: { id: pendingJob.id },
        data: {
          terminalId,
          status: 'RUNNING',
        },
      });

      await logIntegration('MT5', 'JOB_STARTED', 'INFO', `Job ${pendingJob.id} started by terminal ${terminalId}`, {
        jobId: pendingJob.id,
        terminalId,
        status: 'RUNNING',
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

    // Calculate estimated progress
    let pct = job.progressPct;
    if (job.dateFrom && job.dateTo && newCursor) {
      const totalSpan = job.dateTo.getTime() - job.dateFrom.getTime();
      const currentSpan = newCursor.getTime() - job.dateFrom.getTime();
      if (totalSpan > 0) {
        pct = Math.min(100, Math.max(pct, Math.round((currentSpan / totalSpan) * 100)));
      }
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

    await logIntegration('MT5', 'JOB_PROGRESS', pct >= 100 ? 'SUCCESS' : 'INFO', `Job ${jobId} progress updated to ${pct}%`, {
      jobId,
      downloadedItems: totalDownloaded,
      chunkCount: newChunkCount,
      cursorTimestamp: newCursor?.toISOString(),
      progressPct: pct,
      status: pct >= 100 ? 'FINISHED' : 'RUNNING',
    });

    if (pct >= 100) {
      await cacheManager.updateCatalog(job.symbol, job.dataType as any, job.timeframe || undefined);
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
