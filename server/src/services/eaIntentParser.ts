import { isBlockedManualTradeCommand } from './eaControlService';

export type EaParsedIntent =
  | { type: 'menu' | 'help' | 'status' | 'library' | 'charts' | 'config' | 'logs' }
  | { type: 'symbols'; query?: string }
  | { type: 'screenshot'; symbol?: string; timeframe?: string }
  | { type: 'attach'; templateRef?: string; symbol?: string; timeframe?: string; mode?: string }
  | { type: 'pause' | 'resume'; symbol?: string; timeframe?: string }
  | { type: 'cleanup'; confirmed?: boolean }
  | { type: 'blocked_manual_trade' | 'unknown' };

export function parseEaControlIntent(text: string): EaParsedIntent {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const clean = lower.startsWith('/') ? lower.slice(1) : lower;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = clean.split(/\s+/)[0] || '';

  if (!trimmed) return { type: 'unknown' };
  if (isBlockedManualTradeCommand(trimmed)) return { type: 'blocked_manual_trade' };
  if (['start', 'menu'].includes(first)) return { type: 'menu' };
  if (['help', '?'].includes(first)) return { type: 'help' };
  if (first === 'status' || clean === 'terminal status' || clean === 'list terminals' || clean === 'active eas') return { type: 'status' };
  if (first === 'symbols' || clean.startsWith('pair list')) return { type: 'symbols', query: parts[1] };
  if (first === 'charts' || clean.startsWith('chart list')) return { type: 'charts' };
  if (first === 'logs' || clean === 'command log') return { type: 'logs' };
  if (first === 'cleanup' || clean === 'cancel pending') return { type: 'cleanup', confirmed: /\b(confirm|yes|y)\b/i.test(trimmed) };
  if (first === 'config') return { type: 'config' };
  if (first === 'ea' && parts[1]?.toLowerCase() === 'list') return { type: 'library' };
  if (clean === 'list ea' || clean === 'ea library' || first === 'library') return { type: 'library' };
  if (first === 'screenshot') return { type: 'screenshot', symbol: parts[1], timeframe: parts[2] || 'M5' };
  if (first === 'attach') return { type: 'attach', templateRef: parts[1], symbol: parts[2], timeframe: parts[3] || 'M5', mode: parts[4] };
  if (first === 'pause' || first === 'resume') return { type: first as 'pause' | 'resume', symbol: parts[1], timeframe: parts[2] };
  return { type: 'unknown' };
}
