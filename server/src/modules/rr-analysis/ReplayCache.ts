import { TradeReplayResult } from './types';

export class ReplayCache {
  private readonly cache = new Map<string, TradeReplayResult[]>();

  set(sessionId: string, value: TradeReplayResult[]) {
    this.cache.set(sessionId, value);
  }

  get(sessionId: string): TradeReplayResult[] | undefined {
    return this.cache.get(sessionId);
  }

  clear(sessionId?: string) {
    if (sessionId) {
      this.cache.delete(sessionId);
      return;
    }

    this.cache.clear();
  }
}

export const replayCache = new ReplayCache();
