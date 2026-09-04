import { RREngine } from './RREngine';

export class ReplayWorker {
  constructor(private readonly engine = new RREngine()) {}

  async run(sessionId: string) {
    return this.engine.analyzeSession(sessionId);
  }
}
