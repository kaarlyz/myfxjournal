import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import readline from 'readline';
import fs from 'fs';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParquetCandle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

export interface ParquetTick {
  time: string;
  bid: number;
  ask: number;
  volume: number;
}

export interface GetTicksResult {
  symbol: string;
  count: number;
  dataStart: string | null;
  dataEnd: string | null;
  ticks: ParquetTick[];
  latencyMs?: number;
}

export interface TimelineBounds {
  dateFrom: string;
  dateTo: string;
  provider: string;
  symbol: string;
  totalTicks: number;
}

export interface GetCandlesOpts {
  symbol?: string;
  timeframe?: string;
  limit?: number;
  beforeTime?: Date | string | null;
  afterTime?: Date | string | null;
  fromTime?: Date | string | null;
  toTime?: Date | string | null;
  replayTime?: Date | string | null;
}

interface RpcResponse {
  id: number;
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// ── Daemon Manager ─────────────────────────────────────────────────────────

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const PYTHON_SCRIPT = process.env.PARQUET_SCRIPT_PATH || path.join(SERVER_ROOT, 'src', 'services', 'parquetTickService.py');

function resolveParquetPath(symbol: string = 'XAUUSD'): string {
  const env = process.env.PARQUET_TICK_PATH?.trim().replace(/^["']|["']$/g, '');
  const dataDir = path.join(SERVER_ROOT, 'data', 'market-data');
  const sym = symbol.toUpperCase();
  const candidates = [
    env,
    env && path.resolve(SERVER_ROOT, env),
    env && path.resolve(SERVER_ROOT, '..', env),
    env?.startsWith('server/') ? path.resolve(SERVER_ROOT, env.replace(/^server\//, '')) : null,
    path.join(dataDir, `${sym}_Tick.parquet`),
    path.join(dataDir, `${sym}_Tick_Parquet.parquet`),
    path.join(dataDir, `${sym}_M1.parquet`),
    path.join(dataDir, `${sym}_M5.parquet`),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }

  // Look for any file matching {SYMBOL}_*.parquet
  if (fs.existsSync(dataDir)) {
    const symMatch = fs.readdirSync(dataDir).find((f) => f.toUpperCase().startsWith(`${sym}_`) && f.toLowerCase().endsWith('.parquet'));
    if (symMatch) return path.join(dataDir, symMatch);
  }

  return env || path.join(dataDir, `${sym}_Tick.parquet`);
}

function resolvePythonBin(): string {
  if (process.env.PYTHON_BIN && fs.existsSync(process.env.PYTHON_BIN)) return process.env.PYTHON_BIN;
  const venvCandidates = [
    path.join(SERVER_ROOT, '..', '.venv', 'bin', 'python3'),
    path.join(SERVER_ROOT, '..', '.venv', 'bin', 'python'),
    path.join(SERVER_ROOT, '.venv', 'bin', 'python3'),
    path.join(SERVER_ROOT, '.venv', 'bin', 'python'),
  ];
  for (const v of venvCandidates) {
    if (fs.existsSync(v)) return v;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

class ParquetDaemon {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, { resolve: (v: RpcResponse) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private nextId = 1;
  private startPromise: Promise<void> | null = null;

  ensureRunning(): Promise<void> {
    if (this.proc && !this.proc.killed && this.startPromise) return this.startPromise;
    this.startPromise = new Promise((resolve, reject) => {
      const parquetPath = resolveParquetPath();
      const pythonBin = resolvePythonBin();

      const startupTimer = setTimeout(() => {
        this.startPromise = null;
        reject(new Error('Parquet daemon startup timeout (5s)'));
      }, 5000);

      this.proc = spawn(pythonBin, [PYTHON_SCRIPT, '--daemon'], {
        cwd: SERVER_ROOT,
        env: { ...process.env, PARQUET_TICK_PATH: parquetPath },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.proc.on('error', (err) => {
        clearTimeout(startupTimer);
        this.startPromise = null;
        reject(err);
      });

      const rl = readline.createInterface({ input: this.proc.stdout });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        try {
          const msg: RpcResponse = JSON.parse(line);
          if (msg.id === 0) {
            clearTimeout(startupTimer);
            return resolve();
          }
          const h = this.pending.get(msg.id);
          if (h) {
            clearTimeout(h.timer);
            this.pending.delete(msg.id);
            msg.ok ? h.resolve(msg) : h.reject(new Error(msg.error || 'Daemon error'));
          }
        } catch {}
      });

      this.proc.on('close', (code) => {
        clearTimeout(startupTimer);
        this.startPromise = null;
        reject(new Error(`Daemon process closed with code ${code}`));
        for (const [, h] of this.pending) {
          clearTimeout(h.timer);
          h.reject(new Error('Daemon process closed'));
        }
        this.pending.clear();
      });

      this.proc.stdin.write(JSON.stringify({ id: 0, action: 'ping' }) + '\n');
    });

    return this.startPromise;
  }

  async call(request: Record<string, unknown>): Promise<RpcResponse> {
    await this.ensureRunning();
    const id = this.nextId++;
    return new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout (action=${request.action})`));
      }, 30_000);

      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin.write(JSON.stringify({ ...request, id }) + '\n');
    });
  }

  shutdown(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.stdin.end();
      this.proc.kill();
    }
    this.startPromise = null;
  }
}

const daemon = new ParquetDaemon();
process.on('exit', () => daemon.shutdown());

// ── Helpers ────────────────────────────────────────────────────────────────

const toIso = (v: Date | string | null | undefined) => (!v ? undefined : v instanceof Date ? v.toISOString() : v);

const mapRawCandle = (c: Record<string, unknown>): ParquetCandle => ({
  time: new Date(c.time as string),
  open: Number(c.open),
  high: Number(c.high),
  low: Number(c.low),
  close: Number(c.close),
  tickVolume: Number(c.tick_volume ?? c.tickVolume ?? 0),
});

async function query<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await daemon.call({ action, ...payload });
    return res.ok ? (res as unknown as T) : null;
  } catch (err: any) {
    console.error(`[parquetDataProvider] ${action} error:`, err.message);
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getCandles(opts: GetCandlesOpts): Promise<ParquetCandle[]> {
  const res = await query<{ candles?: Record<string, unknown>[] }>('candles', {
    symbol: opts.symbol ?? 'XAUUSD',
    timeframe: opts.timeframe ?? 'M1',
    limit: opts.limit ?? 1500,
    beforeTime: toIso(opts.beforeTime),
    afterTime: toIso(opts.afterTime),
    fromTime: toIso(opts.fromTime),
    toTime: toIso(opts.toTime),
    replayTime: toIso(opts.replayTime),
  });
  return Array.isArray(res?.candles) ? res.candles.map(mapRawCandle) : [];
}

export async function getNextCandle(opts: {
  symbol?: string;
  timeframe?: string;
  afterTime: Date | string;
}): Promise<ParquetCandle | null> {
  const res = await query<{ candle?: Record<string, unknown> }>('next-candle', {
    symbol: opts.symbol ?? 'XAUUSD',
    timeframe: opts.timeframe ?? 'M1',
    afterTime: toIso(opts.afterTime),
  });
  return res?.candle ? mapRawCandle(res.candle) : null;
}

export async function getTicks(opts: {
  symbol?: string;
  fromTime: Date | string;
  toTime: Date | string;
  limit?: number;
}): Promise<GetTicksResult | null> {
  const res = await query<GetTicksResult>('ticks', {
    symbol: opts.symbol ?? 'XAUUSD',
    fromTime: toIso(opts.fromTime),
    toTime: toIso(opts.toTime),
    limit: opts.limit ?? 100000,
  });
  return res && Array.isArray(res.ticks) ? res : null;
}

export async function getTimelineBounds(symbol?: string): Promise<TimelineBounds | null> {
  const res = await query<{ data?: Record<string, unknown> } & Record<string, unknown>>('bounds', {
    symbol: symbol ?? 'XAUUSD',
  });
  if (!res) return null;
  const d = (res.data ?? res) as Record<string, unknown>;
  return {
    dateFrom: d.dateFrom as string,
    dateTo: d.dateTo as string,
    provider: (d.provider as string) || 'PARQUET',
    symbol: (d.symbol as string) || (symbol ?? 'XAUUSD').toUpperCase(),
    totalTicks: Number(d.totalTicks || 0),
  };
}

export async function listAvailableSymbols(): Promise<string[]> {
  const res = await query<{ symbols?: string[]; result?: { symbols?: string[] } }>('symbols');
  const syms = res?.symbols ?? res?.result?.symbols;
  return Array.isArray(syms) ? syms : [];
}

export async function validateData(filepath: string): Promise<{ valid: boolean; columns: string[]; issues: string[] }> {
  const res = await query<{ result?: { valid: boolean; columns: string[]; issues: string[] }; valid?: boolean; columns?: string[]; issues?: string[] }>('validate', { filepath });
  const d = res?.result ?? res;
  return {
    valid: Boolean(d?.valid),
    columns: Array.isArray(d?.columns) ? d.columns : [],
    issues: Array.isArray(d?.issues) ? d.issues : [],
  };
}

export async function isParquetAvailable(): Promise<boolean> {
  try {
    await daemon.ensureRunning();
    return true;
  } catch {
    return false;
  }
}
