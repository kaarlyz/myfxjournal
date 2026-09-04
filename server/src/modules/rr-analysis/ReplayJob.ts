export interface ReplayJobState {
  sessionId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
}

export class ReplayJob {
  public state: ReplayJobState;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      status: 'QUEUED',
      progress: 0,
      startedAt: new Date(),
    };
  }

  markRunning() {
    this.state.status = 'RUNNING';
  }

  markCompleted() {
    this.state.status = 'COMPLETED';
    this.state.progress = 100;
    this.state.finishedAt = new Date();
  }

  markFailed(error: string) {
    this.state.status = 'FAILED';
    this.state.error = error;
    this.state.finishedAt = new Date();
  }
}
