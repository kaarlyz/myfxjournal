import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import readline from 'readline';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParquetCandle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

export interface TimelineBounds {
  dateFrom: string;
  dateTo: string;
  provider: string;
  symbol: string;
  totalTicks: number;
}

interface RpcRequest {
  id: number;
  action: string;
  [key: string]: unknown;
}

interface RpcResponse {
  id: number;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// ── Daemon Process Manager ─────────────────────────────────────────────────

// __dirname is 3 levels deep from server root in both src/ and dist/ layouts
const SERVER_ROOT = path.resolve(__dirname, '../../..');
const PYTHON_SCRIPT = process.env.PARQUET_SCRIPT_PATH ||
  path.join(SERVER_ROOT, 'src', 'services', 'parquetTickService.py');
const PARQUET_PATH = process.env.PARQUET_TICK_PATH || 'C:\\Users\\ekare\\Documents\\XAUUSD_Tick_Parquet.parquet';

class ParquetDaemon {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: readline.Interface | null = null;
  private pending = new Map<number, { resolve: (v: RpcResponse) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private nextId = 1;
  private ready = false;
  private starting = false;
  private startPromise: Promise<void> | null = null;
  private readonly REQUEST_TIMEOUT_MS = 30_000;

  async ensureRunning(): Promise<void> {
    if (this.ready) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._start();
    return this.startPromise;
  }

  private _start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.starting) return;
      this.starting = true;

      const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
      this.proc = spawn(pythonBin, [PYTHON_SCRIPT, '--daemon'], {
        env: { ...process.env, PARQUET_TICK_PATH: PARQUET_PATH },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.proc.on('error', (err) => {
        console.error('[ParquetDaemon] Failed to start Python process:', err.message);
        this.ready = false;
        this.starting = false;
        this.startPromise = null;
        reject(err);
      });

      this.proc.stderr.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error('[ParquetDaemon] stderr:', msg);
      });

      this.rl = readline.createInterface({ input: this.proc.stdout });
      this.rl.on('line', (line) => {
        if (!line.trim()) return;
        let msg: RpcResponse;
        try {
          msg = JSON.parse(line);
        } catch {
          console.error('[ParquetDaemon] Bad JSON from daemon:', line.slice(0, 200));
          return;
        }

        // First response (id=0) is the startup ping
        if (!this.ready && msg.id === 0) {
          this.ready = true;
          resolve();
          return;
        }

        const handler = this.pending.get(msg.id);
        if (handler) {
          clearTimeout(handler.timer);
          this.pending.delete(msg.id);
          if (msg.ok) {
            handler.resolve(msg);
          } else {
            handler.reject(new Error(msg.error || 'Daemon error'));
          }
        }
      });

      this.rl.on('close', () => {
        this.ready = false;
        this.starting = false;
        this.startPromise = null;
        for (const [, h] of this.pending) {
          clearTimeout(h.timer);
          h.reject(new Error('Daemon process closed'));
        }
        this.pending.clear();
      });

      // Send startup ping
      this.proc.stdin.write(JSON.stringify({ id: 0, action: 'ping' }) + '\n');
    });
  }

  async call(request: Omit<RpcRequest, 'id'>): Promise<RpcResponse> {
    await this.ensureRunning();
    const id = this.nextId++;
    const msg = JSON.stringify({ ...request, id }) + '\n';

    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Parquet daemon request timed out (action=${request.action})`));
      }, this.REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      if (!this.proc || this.proc.killed) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('Parquet daemon not running'));
        return;
      }

      this.proc.stdin.write(msg);
    });
  }

  shutdown(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.stdin.end();
      this.proc.kill();
    }
    this.ready = false;
    this.starting = false;
    this.startPromise = null;
  }
}

const daemon = new ParquetDaemon();

process.on('exit', () => daemon.shutdown());
process.on('SIGINT', () => { daemon.shutdown(); process.exit(0); });
process.on('SIGTERM', () => { daemon.shutdown(); process.exit(0); });

// ── Helpers ────────────────────────────────────────────────────────────────

function toIso(v: Date | string | null | undefined): string | undefined {
  if (!v) return undefined;
  return v instanceof Date ? v.toISOString() : v;
}

function mapRawCandle(c: Record<string, unknown>): ParquetCandle {
  return {
    time: new Date(c.time as string),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    tickVolume: Number(c.tick_volume ?? c.tickVolume ?? 0),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getCandles(opts: {
  symbol?: string;
  timeframe?: string;
  limit?: number;
  beforeTime?: Date | string | null;
  afterTime?: Date | string | null;
  fromTime?: Date | string | null;
  toTime?: Date | string | null;
  replayTime?: Date | string | null;
}): Promise<ParquetCandle[]> {
  try {
    const res = await daemon.call({
      action: 'candles',
      symbol: opts.symbol ?? 'XAUUSD',
      timeframe: opts.timeframe ?? 'M1',
      limit: opts.limit ?? 1500,
      beforeTime: toIso(opts.beforeTime),
      afterTime: toIso(opts.afterTime),
      fromTime: toIso(opts.fromTime),
      toTime: toIso(opts.toTime),
      replayTime: toIso(opts.replayTime),
    });
    if (!res.ok || !Array.isArray(res.candles)) return [];
    return (res.candles as Record<string, unknown>[]).map(mapRawCandle);
  } catch (err: any) {
    console.error('[parquetDataProvider] getCandles error:', err.message);
    return [];
  }
}

export async function getNextCandle(opts: {
  symbol?: string;
  timeframe?: string;
  afterTime: Date | string;
}): Promise<ParquetCandle | null> {
  try {
    const res = await daemon.call({
      action: 'next-candle',
      symbol: opts.symbol ?? 'XAUUSD',
      timeframe: opts.timeframe ?? 'M1',
      afterTime: toIso(opts.afterTime),
    });
    if (!res.ok || !res.candle) return null;
    return mapRawCandle(res.candle as Record<string, unknown>);
  } catch (err: any) {
    console.error('[parquetDataProvider] getNextCandle error:', err.message);
    return null;
  }
}

export async function getTimelineBounds(): Promise<TimelineBounds | null> {
  try {
    const res = await daemon.call({ action: 'bounds' });
    if (!res.ok) return null;
    // Python wraps bounds in 'data'; support both wrapped and flat
    const d = (res.data ?? res) as Record<string, unknown>;
    return {
      dateFrom: d.dateFrom as string,
      dateTo: d.dateTo as string,
      provider: d.provider as string,
      symbol: d.symbol as string,
      totalTicks: d.totalTicks as number,
    };
  } catch (err: any) {
    console.error('[parquetDataProvider] getTimelineBounds error:', err.message);
    return null;
  }
}

export async function isParquetAvailable(): Promise<boolean> {
  try {
    await daemon.ensureRunning();
    return true;
  } catch {
    return false;
  }
}

