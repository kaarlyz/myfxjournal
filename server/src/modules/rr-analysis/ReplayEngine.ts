import { ReplayWorker } from './ReplayWorker';
import { ReplayJob } from './ReplayJob';
import { replayCache } from './ReplayCache';

export class ReplayEngine {
  private readonly jobs = new Map<string, ReplayJob>();

  constructor(private readonly worker = new ReplayWorker()) {}

  async run(sessionId: string): Promise<ReplayJob> {
    const existing = this.jobs.get(sessionId);
    if (existing) return existing;

    const job = new ReplayJob(sessionId);
    this.jobs.set(sessionId, job);
    job.markRunning();

    try {
      const { results } = await this.worker.run(sessionId);
      replayCache.set(sessionId, results);
      job.markCompleted();
      return job;
    } catch (error: any) {
      job.markFailed(error?.message || 'Replay failed');
      throw error;
    }
  }

  getJob(sessionId: string): ReplayJob | undefined {
    return this.jobs.get(sessionId);
  }
}

export const replayEngine = new ReplayEngine();
