import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { Boom } from '@hapi/boom';
import { logIntegration } from './../utils/logger';
import { prisma } from '../prisma';
import { handleSetupReviewCommand } from './setupReviewService';
import {
  buildMainMenu,
  createEaCommandFromIntent,
  formatHelp,
  handleEaControlCommand,
  parseEaControlIntent,
} from './eaControlService';
import { startCommandWatcher } from './eaCommandWatcher';
import { handleEaBotInput, isEaBotText } from './eaMenuService';

const QR_TTL_MS = 50000;

const BLOCKED_WA = new Set(['buy', 'sell', 'close_all', 'modify_sl', 'modify_tp', '/buy', '/sell', '/close_all', '/modify_sl', '/modify_tp']);
const VALID_CMDS = new Set([
  '/status', '/balance', '/equity', '/today', '/open_trades', '/last_trade', '/help',
  '/pending', '/detail', '/acc', '/reject',
  '/ea', '/pair', '/chart', '/attach', '/mode', '/config', '/set', '/signals', '/approve', '/screenshot',
  'status', 'balance', 'equity', 'today', 'open_trades', 'last_trade', 'help',
  'pending', 'detail', 'acc', 'reject', 'open trades', 'last trade',
  'menu', 'list ea', 'ea library', 'list terminals', 'active eas', 'cancel pending',
  'attach', 'screenshot', 'symbols', 'charts', 'cleanup', 'logs', 'config', 'set', 'pause', 'resume', 'signals',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'yes', 'cancel'
]);
const WA_SESSION_TTL_MS = 5 * 60 * 1000;
type WaSession = {
  flow: 'menu' | 'attach' | 'screenshot' | 'cleanup' | 'pause_resume' | 'signals';
  step: string;
  data: Record<string, string>;
  expiresAt: number;
};
const waSessions = new Map<string, WaSession>();

// Dedup cache by message id (prevent processing the same message twice)
const processedIds = new Set<string>();

function normalizePhoneNumber(value: string | null | undefined): string {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function textPreview(text: string) {
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

function isCommandLike(text: string) {
  const lower = text.toLowerCase().trim();
  const first = lower.split(' ')[0];
  const firstTwo = lower.split(' ').slice(0, 2).join(' ');
  return lower.startsWith('/') || VALID_CMDS.has(lower) || VALID_CMDS.has(first) || VALID_CMDS.has(firstTwo) || BLOCKED_WA.has(first) || BLOCKED_WA.has(lower);
}

function getWaSession(senderId: string | undefined) {
  if (!senderId) return null;
  const session = waSessions.get(senderId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    waSessions.delete(senderId);
    return null;
  }
  session.expiresAt = Date.now() + WA_SESSION_TTL_MS;
  return session;
}

function setWaSession(senderId: string | undefined, session: Omit<WaSession, 'expiresAt'>) {
  if (!senderId) return;
  waSessions.set(senderId, { ...session, expiresAt: Date.now() + WA_SESSION_TTL_MS });
}

function clearWaSession(senderId: string | undefined) {
  if (senderId) waSessions.delete(senderId);
}

function isReplayFxResponse(text: string) {
  const lower = text.toLowerCase().trim();
  return lower.startsWith('replayfx') || lower.startsWith('[replayfx]') || text.includes('[ReplayFX]');
}

function replayFxContextInfo() {
  return {
    externalAdReply: {
      title: 'ReplayFX Control Center',
      body: 'EA management only. Manual trading commands disabled.',
      mediaType: 1,
      renderLargerThumbnail: false,
    },
  };
}

function valueOrDash(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function buildWhatsAppPendingSignalsList(signals: any[]) {
  if (!signals.length) return 'No pending EA signals.';
  return [
    '*Pending EA Signals*',
    '',
    ...signals.map((s, index) => `${index + 1}. ${s.approvalCode}: ${s.eaName} ${s.symbol} ${s.timeframe} ${s.side} entry ${valueOrDash(s.entry)} SL ${valueOrDash(s.sl)} TP ${valueOrDash(s.tp)}`),
    '',
    'Reply with a number to open a signal.',
  ].join('\n');
}

function buildWhatsAppSignalCard(signal: any) {
  return [
    '*EA Signal Pending*',
    '',
    `EA name: ${signal.eaName}`,
    `Symbol: ${signal.symbol}`,
    `Timeframe: ${signal.timeframe}`,
    `Side: ${signal.side}`,
    `Entry: ${valueOrDash(signal.entry)}`,
    `SL: ${valueOrDash(signal.sl)}`,
    `TP: ${valueOrDash(signal.tp)}`,
    `RR: ${valueOrDash(signal.rr)}`,
    `Lot: ${valueOrDash(signal.lot)}`,
    `Risk %: ${valueOrDash(signal.riskPercent)}`,
    `Setup reason: ${valueOrDash(signal.reason)}`,
    `Approval code: ${signal.approvalCode}`,
    `Expires at: ${signal.expiresAt ? new Date(signal.expiresAt).toISOString() : '-'}`,
    '',
      '1. Confirm Entry',
      '2. Reject',
      '3. Screenshot',
      '4. Details',
      '5. Edit Lot/Risk',
  ].join('\n');
}

async function getWaSettings(): Promise<{ allowedNumbers: string[]; selfCommandsEnabled: boolean; selfCommandModeSource: 'db' | 'env' | 'default' }> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['whatsapp_allowed_numbers', 'whatsapp_self_commands_enabled', 'whatsapp:baileys:selfCommandsEnabled'] } }
  });
  const m: Record<string, string> = {};
  rows.forEach(r => (m[r.key] = r.value));
  const envValue = process.env.SELF_WHATSAPP_COMMANDS_ENABLED;
  const dbValue = m['whatsapp:baileys:selfCommandsEnabled'] ?? m['whatsapp_self_commands_enabled'];
  const source = dbValue !== undefined ? 'db' : envValue !== undefined ? 'env' : 'default';
  const enabled = dbValue !== undefined
    ? dbValue === 'true'
    : envValue !== undefined
      ? envValue !== 'false'
      : true;
  return {
    allowedNumbers: m['whatsapp_allowed_numbers'] ? m['whatsapp_allowed_numbers'].split(',').map(s => normalizePhoneNumber(s.trim())).filter(Boolean) : [],
    selfCommandsEnabled: enabled,
    selfCommandModeSource: source,
  };
}

async function handleWaSession(senderId: string | undefined, text: string): Promise<{ response: string; status: string; commandId?: string } | null> {
  const session = getWaSession(senderId);
  if (!session) return null;
  const value = text.trim();
  const lower = value.toLowerCase();
  if (['cancel', '/cancel', 'back'].includes(lower)) {
    clearWaSession(senderId);
    return { response: 'Flow cancelled.', status: 'CANCELLED' };
  }

  if (session.flow === 'menu') {
    clearWaSession(senderId);
    const map: Record<string, string> = {
      '1': 'status',
      '2': 'list ea',
      '3': 'symbols',
      '4': '__START_SCREENSHOT__',
      '5': '__START_ATTACH__',
      '6': 'config',
      '7': '__START_PAUSE_RESUME__',
      '8': 'logs',
      '9': '__START_CLEANUP__',
      '10': 'help',
    };
    const next = map[lower];
    if (!next) return { response: 'Choose a number from 1 to 10, or type `cancel`.', status: 'WAITING_INPUT' };
    if (next === '__START_ATTACH__') {
      setWaSession(senderId, { flow: 'attach', step: 'template', data: {} });
      return { response: '*Attach EA*\n\nEnter EA template name or number, for example `ERS`.', status: 'WAITING_INPUT' };
    }
    if (next === '__START_SCREENSHOT__') {
      setWaSession(senderId, { flow: 'screenshot', step: 'symbol', data: {} });
      return { response: '*Screenshot Chart*\n\nEnter symbol like `BTCUSD`, or type `current`.', status: 'WAITING_INPUT' };
    }
    if (next === '__START_PAUSE_RESUME__') {
      setWaSession(senderId, { flow: 'pause_resume', step: 'action', data: {} });
      return { response: '*Pause / Resume EA*\n\nType `pause` or `resume`.', status: 'WAITING_INPUT' };
    }
    if (next === '__START_CLEANUP__') {
      setWaSession(senderId, { flow: 'cleanup', step: 'confirm', data: {} });
      return { response: '*Cleanup Stuck Commands*\n\nReply `yes` to confirm cleanup.', status: 'CONFIRMATION_REQUIRED' };
    }
    return createEaCommandFromIntent(parseEaControlIntent(next), 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
  }

  if (session.flow === 'cleanup') {
    if (['yes', 'y', 'confirm'].includes(lower)) {
      clearWaSession(senderId);
      return createEaCommandFromIntent({ type: 'cleanup', confirmed: true }, 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP', confirmed: true });
    }
    return { response: 'Cleanup not confirmed. Reply `yes` to cleanup stuck commands or `cancel` to stop.', status: 'CONFIRMATION_REQUIRED' };
  }

  if (session.flow === 'screenshot') {
    if (session.step === 'symbol') {
      session.data.symbol = lower === 'current' ? '' : value.toUpperCase();
      session.step = 'timeframe';
      return { response: 'Enter timeframe, for example `M1`, `M5`, `H1`, or `D1`.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'timeframe') {
      clearWaSession(senderId);
      return createEaCommandFromIntent({ type: 'screenshot', symbol: session.data.symbol || undefined, timeframe: value.toUpperCase() }, 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
    }
  }

  if (session.flow === 'pause_resume') {
    if (session.step === 'action') {
      if (!['pause', 'resume'].includes(lower)) return { response: 'Type `pause` or `resume`.', status: 'WAITING_INPUT' };
      session.data.action = lower;
      session.step = 'symbol';
      return { response: 'Enter symbol, for example `BTCUSD`.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'symbol') {
      session.data.symbol = value.toUpperCase();
      session.step = 'timeframe';
      return { response: 'Enter timeframe, for example `H1`.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'timeframe') {
      clearWaSession(senderId);
      return createEaCommandFromIntent({ type: session.data.action as 'pause' | 'resume', symbol: session.data.symbol, timeframe: value.toUpperCase() }, 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
    }
  }

  if (session.flow === 'signals') {
    if (session.step === 'choose') {
      const signals = await prisma.eaSignalProposal.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10 });
      const index = Number.parseInt(lower, 10);
      if (!Number.isInteger(index) || index < 1 || index > signals.length) {
        return { response: `Choose a number from 1 to ${signals.length}, or type \`cancel\`.`, status: 'WAITING_INPUT' };
      }
      const selected = signals[index - 1];
      session.step = 'action';
      session.data.signalId = selected.id;
      session.data.signalApprovalCode = selected.approvalCode;
      return { response: buildWhatsAppSignalCard(selected), status: 'WAITING_INPUT' };
    }

    if (session.step === 'action') {
      const signalId = session.data.signalId;
      if (!signalId) {
        clearWaSession(senderId);
        return { response: 'Signal session expired. Send `signals` again.', status: 'FAILED' };
      }
      const signal = await prisma.eaSignalProposal.findUnique({ where: { id: signalId } });
      if (!signal) {
        clearWaSession(senderId);
        return { response: 'Signal not found. Send `signals` again.', status: 'FAILED' };
      }

      if (['1', 'confirm', 'confirm entry'].includes(lower)) {
        if (signal.status === 'EXPIRED' || (signal.status === 'PENDING' && signal.expiresAt && signal.expiresAt.getTime() < Date.now())) {
          await prisma.eaSignalProposal.update({ where: { id: signal.id }, data: { status: 'EXPIRED' } });
          clearWaSession(senderId);
          return { response: 'Signal expired.', status: 'FAILED' };
        }
        if (signal.status !== 'PENDING') {
          clearWaSession(senderId);
          return { response: `Signal already ${signal.status.toLowerCase()}.`, status: 'SUCCESS' };
        }
        clearWaSession(senderId);
        const updated = await prisma.eaSignalProposal.update({ where: { id: signal.id }, data: { status: 'APPROVED', decidedAt: new Date() } });
        return { response: `Signal approved: ${updated.approvalCode} ${updated.symbol} ${updated.side}`, status: 'SUCCESS' };
      }
      if (['2', 'reject'].includes(lower)) {
        if (signal.status === 'EXPIRED' || (signal.status === 'PENDING' && signal.expiresAt && signal.expiresAt.getTime() < Date.now())) {
          await prisma.eaSignalProposal.update({ where: { id: signal.id }, data: { status: 'EXPIRED' } });
          clearWaSession(senderId);
          return { response: 'Signal expired.', status: 'FAILED' };
        }
        if (signal.status !== 'PENDING') {
          clearWaSession(senderId);
          return { response: `Signal already ${signal.status.toLowerCase()}.`, status: 'SUCCESS' };
        }
        clearWaSession(senderId);
        const updated = await prisma.eaSignalProposal.update({ where: { id: signal.id }, data: { status: 'REJECTED', decidedAt: new Date() } });
        return { response: `Signal rejected: ${updated.approvalCode} ${updated.symbol} ${updated.side}`, status: 'SUCCESS' };
      }
      if (['3', 'screenshot'].includes(lower)) {
        clearWaSession(senderId);
        const command = await createEaCommandFromIntent({ type: 'screenshot', symbol: signal.symbol, timeframe: signal.timeframe }, 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
        return { response: `Screenshot queued for ${signal.approvalCode}.`, status: command.status, commandId: command.commandId };
      }
      if (['4', 'details'].includes(lower)) {
        return { response: buildWhatsAppSignalCard(signal), status: 'SUCCESS' };
      }
      if (['5', 'edit lot/risk', 'edit', 'lot', 'risk'].includes(lower)) {
        session.step = 'edit_field';
        session.data.signalId = signal.id;
        return { response: '*Edit Lot/Risk*\n\nReply `lot` or `risk` to choose which field to edit.', status: 'WAITING_INPUT' };
      }
      return { response: 'Reply `1`, `2`, `3`, `4`, or `5`, or type `cancel`.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'edit_field') {
      if (!['lot', 'risk'].includes(lower)) return { response: 'Reply `lot` or `risk`, or type `cancel`.', status: 'WAITING_INPUT' };
      session.data.editField = lower;
      session.step = 'edit_value';
      return { response: `Enter new ${lower === 'lot' ? 'lot size' : 'risk percent'} value.`, status: 'WAITING_INPUT' };
    }
    if (session.step === 'edit_value') {
      const signalId = session.data.signalId;
      const signal = signalId ? await prisma.eaSignalProposal.findUnique({ where: { id: signalId } }) : null;
      if (!signal) {
        clearWaSession(senderId);
        return { response: 'Signal session expired. Send `signals` again.', status: 'FAILED' };
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return { response: 'Enter a numeric value.', status: 'WAITING_INPUT' };
      const updated = await prisma.eaSignalProposal.update({
        where: { id: signal.id },
        data: session.data.editField === 'lot' ? { lot: numeric } : { riskPercent: numeric },
      });
      clearWaSession(senderId);
      return { response: `Signal updated: ${updated.approvalCode} ${session.data.editField}=${numeric}`, status: 'SUCCESS' };
    }
  }

  if (session.flow === 'attach') {
    if (session.step === 'template') {
      session.data.templateRef = value;
      session.step = 'symbol';
      return { response: 'Enter symbol, for example `XAUUSD` or `BTCUSD`.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'symbol') {
      session.data.symbol = value.toUpperCase();
      session.step = 'timeframe';
      return { response: 'Enter timeframe, for example `M1`, `M5`, `H1`, or `D1`.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'timeframe') {
      session.data.timeframe = value.toUpperCase();
      session.step = 'mode';
      return { response: 'Select mode: `NOTIFY_ONLY`, `AUTO`, or `PAUSED`.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'mode') {
      session.data.mode = value.toUpperCase();
      session.step = 'confirm';
      return {
        response: `*Confirm Attach EA*\n\n*Template:* ${session.data.templateRef}\n*Symbol:* ${session.data.symbol}\n*Timeframe:* ${session.data.timeframe}\n*Mode:* ${session.data.mode}\n\nReply \`yes\` to queue APPLY_TEMPLATE.`,
        status: 'CONFIRMATION_REQUIRED',
      };
    }
    if (session.step === 'confirm') {
      if (!['yes', 'y', 'confirm'].includes(lower)) return { response: 'Attach not confirmed. Reply `yes` to queue it or `cancel` to stop.', status: 'CONFIRMATION_REQUIRED' };
      clearWaSession(senderId);
      return createEaCommandFromIntent({
        type: 'attach',
        templateRef: session.data.templateRef,
        symbol: session.data.symbol,
        timeframe: session.data.timeframe,
        mode: session.data.mode,
      }, 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
    }
  }

  return null;
}

async function handleWaCommand(text: string, senderId?: string): Promise<{ response: string; status: string; commandId?: string }> {
  const raw = text.trim().toLowerCase();
  const first = raw.split(' ')[0];
  const cmd = raw.startsWith('/') ? first : raw.split(' ').slice(0, 2).join('_').replace(' ', '_');

  if (BLOCKED_WA.has(raw) || BLOCKED_WA.has(raw.split(' ')[0])) {
    return { response: 'Remote manual trade execution is disabled for safety. Use signal approval mode instead.', status: 'REJECTED' };
  }

  let response = 'Unknown command. Send /help for available commands.';
  let status = 'EXECUTED';
  let commandId: string | undefined;

  try {
    if (senderId && (isEaBotText(text) || /^\d+$/.test(raw) || ['yes', 'y', 'confirm', 'cancel', 'back'].includes(raw))) {
      const guided = await handleEaBotInput('WHATSAPP', senderId, { text });
      return { response: guided.response, status: guided.status, commandId: guided.commandId };
    }

    const sessionResult = await handleWaSession(senderId, text);
    if (sessionResult) return sessionResult;

    if (raw === 'menu' || raw === '/menu') {
      setWaSession(senderId, { flow: 'menu', step: 'choose', data: {} });
      return { response: buildMainMenu('WHATSAPP'), status: 'SUCCESS' };
    }

    if (raw === 'cleanup' || raw === '/cleanup') {
      setWaSession(senderId, { flow: 'cleanup', step: 'confirm', data: {} });
      return createEaCommandFromIntent({ type: 'cleanup', confirmed: false }, 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
    }

    if (['symbols', 'charts', 'logs', 'config'].includes(first) || raw.startsWith('symbols ') || raw.startsWith('screenshot ') || raw.startsWith('attach ') || raw.startsWith('pause ') || raw.startsWith('resume ')) {
      const ea = await createEaCommandFromIntent(parseEaControlIntent(text), 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
      if (ea.handled) return { response: ea.response, status: ea.status, commandId: ea.commandId };
    }

    if (raw === '/help' || raw === 'help') {
      response = formatHelp('WHATSAPP');
    } else if (raw === '/status' || raw === 'status') {
      const ea = await createEaCommandFromIntent({ type: 'status' }, 'WHATSAPP_BAILEYS', senderId, { channel: 'WHATSAPP' });
      response = ea.response;
      status = ea.status;
    } else if (raw === '/signals' || raw === 'signals') {
      const signals = await prisma.eaSignalProposal.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10 });
      setWaSession(senderId, { flow: 'signals', step: 'choose', data: {} });
      response = buildWhatsAppPendingSignalsList(signals);
      status = 'SUCCESS';
    } else if (raw === '/balance' || raw === 'balance' || raw === '/equity' || raw === 'equity') {
      const accounts = await prisma.tradingAccount.findMany({ where: { status: 'Active' }, take: 10 });
      response = accounts.length === 0 ? 'No active accounts.' :
        accounts.map(a => `*${a.name}*\nBalance: $${a.currentBalance}\nEquity: $${a.currentEquity ?? a.currentBalance}\nFree Margin: $${a.freeMargin ?? 0}`).join('\n\n');
    } else if (raw === '/today' || raw === 'today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const trades = await prisma.liveTrade.findMany({ where: { status: 'CLOSED', closeTime: { gte: start } } });
      const pnl = trades.reduce((s, t) => s + (t.profit || 0), 0);
      response = `*Today's Profit:* $${pnl.toFixed(2)} (${trades.length} trades)`;
    } else if (raw === '/open_trades' || raw === 'open trades' || raw === 'open_trades') {
      const trades = await prisma.liveTrade.findMany({ where: { status: 'OPEN' }, take: 20 });
      response = trades.length === 0 ? 'No open trades.' : trades.map(t => `${t.symbol} ${t.side} ${t.lot}L @ ${t.entryPrice}`).join('\n');
    } else if (raw === '/last_trade' || raw === 'last trade' || raw === 'last_trade') {
      const t = await prisma.liveTrade.findFirst({ where: { status: 'CLOSED' }, orderBy: { closeTime: 'desc' } });
      response = t ? `*Last Trade*\n${t.symbol} ${t.side} ${t.lot}L\nProfit: $${(t.profit || 0).toFixed(2)}` : 'No closed trades.';
    } else if (['/pending', 'pending', '/detail', 'detail', '/acc', 'acc', '/reject', 'reject'].includes(first)) {
      const review = await handleSetupReviewCommand(text, 'WHATSAPP_BAILEYS');
      if (review.handled) {
        response = review.response;
        status = review.status === 'IGNORED' ? 'SUCCESS' : review.status;
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_REVIEW_COMMAND', status === 'REJECTED' ? 'WARNING' : 'INFO', `Review command: ${first}`);
      }
      if (!review.handled || (first.includes('reject') && /\sSIG/i.test(text))) {
        const ea = await handleEaControlCommand(text, 'WHATSAPP_BAILEYS');
        if (ea.handled) {
          response = ea.response;
          status = ea.status;
          if (ea.commandId) commandId = ea.commandId;
        }
      }
    } else {
      const ea = await handleEaControlCommand(text, 'WHATSAPP_BAILEYS');
      if (ea.handled) {
        response = ea.response;
        status = ea.status;
        if (ea.commandId) commandId = ea.commandId;
      }
    }
  } catch (err: any) {
    response = err.message || 'Error executing command.';
    status = 'FAILED';
  }

  return { response, status, commandId };
}

export class BaileysService {
  private static instance: BaileysService;
  private sock: any = null;
  private sessionId: string = 'primary_session';

  private qrDataUrl: string | null = null;
  private qrUpdatedAt: string | null = null;
  private qrExpiresAt: number | null = null;
  private lastQrError: string | null = null;

  private status: 'not_started' | 'starting' | 'connecting' | 'qr_waiting' | 'qr_ready' | 'pairing_requested' | 'pairing_ready' | 'connected' | 'disconnected' | 'error' = 'not_started';
  private isConnected = false;
  private userJid: string | null = null;
  private phoneNumber: string | null = null;
  private pushName: string | null = null;
  private lastConnectedAt: string | null = null;
  private lastDisconnectAt: string | null = null;
  private lastError: string | null = null;

  private pairingCode: string | null = null;
  private pairingCodeExpiresAt: number | null = null;
  private lastPairingError: string | null = null;
  private lastPairingRequestAt: number | null = null;

  private lastMessageSentAt: string | null = null;
  private lastMessageError: string | null = null;
  private lastIncomingCommand: string | null = null;
  private lastIncomingAt: string | null = null;
  private lastCommandError: string | null = null;
  private lastResponse: string | null = null;
  private lastUpsertAt: string | null = null;
  private lastMessageAt: string | null = null;
  private lastCommandAt: string | null = null;
  private lastRawMessageText: string | null = null;
  private processedMessageCount = 0;
  private skippedMessageCount = 0;

  private autoReconnect = true;

  private constructor() {}

  public static getInstance(): BaileysService {
    if (!BaileysService.instance) BaileysService.instance = new BaileysService();
    return BaileysService.instance;
  }

  public getFullState() {
    const now = Date.now();
    const qrExpired = this.qrExpiresAt ? now > this.qrExpiresAt : false;
    const secondsUntilQrExpiry = this.qrExpiresAt ? Math.max(0, Math.round((this.qrExpiresAt - now) / 1000)) : null;
    const authenticatedSessionExists = fs.existsSync(this.getAuthFolder(this.sessionId));
    return {
      status: this.status,
      connected: this.isConnected,
      userJid: this.userJid,
      phoneNumber: this.phoneNumber,
      pushName: this.pushName,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectAt: this.lastDisconnectAt,
      lastError: this.lastError,
      qrAvailable: !!this.qrDataUrl && !qrExpired,
      qr: this.qrDataUrl,
      qrUpdatedAt: this.qrUpdatedAt,
      qrExpiresAt: this.qrExpiresAt,
      qrExpired,
      secondsUntilQrExpiry,
      lastQrError: this.lastQrError,
      pairingCodeAvailable: !!this.pairingCode,
      pairingCode: this.pairingCode,
      pairingCodeExpiresAt: this.pairingCodeExpiresAt,
      lastPairingError: this.lastPairingError,
      lastMessageSentAt: this.lastMessageSentAt,
      lastMessageError: this.lastMessageError,
      lastIncomingCommand: this.lastIncomingCommand,
      lastIncomingAt: this.lastIncomingAt,
      lastCommandError: this.lastCommandError,
      lastResponse: this.lastResponse,
      lastUpsertAt: this.lastUpsertAt,
      lastMessageAt: this.lastMessageAt,
      lastCommandAt: this.lastCommandAt,
      lastRawMessageText: this.lastRawMessageText,
      processedMessageCount: this.processedMessageCount,
      skippedMessageCount: this.skippedMessageCount,
      authenticatedSessionExists,
      needsQr: !this.isConnected && !authenticatedSessionExists,
    };
  }

  public async getStatusState() {
    const settings = await getWaSettings();
    return {
      ...this.getFullState(),
      selfCommandModeEnabled: settings.selfCommandsEnabled,
      selfCommandModeSource: settings.selfCommandModeSource,
      lastCommandText: this.lastIncomingCommand,
      lastCommandResponse: this.lastResponse,
    };
  }

  public async getDebugState() {
    const settings = await getWaSettings();
    return {
      ok: true,
      connected: this.isConnected,
      status: this.status,
      userJid: this.userJid,
      phoneNumber: this.phoneNumber,
      pushName: this.pushName,
      selfCommandModeEnabled: settings.selfCommandsEnabled,
      selfCommandModeSource: settings.selfCommandModeSource,
      selfCommandMode: settings.selfCommandsEnabled,
      allowedNumbers: settings.allowedNumbers,
      lastUpsertAt: this.lastUpsertAt,
      lastMessageAt: this.lastMessageAt,
      lastCommandAt: this.lastCommandAt,
      lastIncomingMessage: this.lastRawMessageText,
      lastCommandText: this.lastIncomingCommand,
      lastCommandResponse: this.lastResponse,
      lastCommandError: this.lastCommandError,
      processedMessageCount: this.processedMessageCount,
      skippedMessageCount: this.skippedMessageCount,
    };
  }

  public async setSelfCommandMode(enabled: boolean) {
    await prisma.$transaction([
      prisma.systemSetting.upsert({
        where: { key: 'whatsapp_self_commands_enabled' },
        update: { value: String(enabled) },
        create: { key: 'whatsapp_self_commands_enabled', value: String(enabled) },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'whatsapp:baileys:selfCommandsEnabled' },
        update: { value: String(enabled) },
        create: { key: 'whatsapp:baileys:selfCommandsEnabled', value: String(enabled) },
      }),
    ]);
    await logIntegration(
      'WHATSAPP_BAILEYS',
      enabled ? 'WHATSAPP_SELF_COMMAND_MODE_ENABLED' : 'WHATSAPP_SELF_COMMAND_MODE_DISABLED',
      'INFO',
      enabled ? 'WhatsApp self command mode enabled' : 'WhatsApp self command mode disabled'
    );
    return this.getDebugState();
  }

  private getAuthFolder(sid: string) {
    return path.join(process.cwd(), 'storage', 'baileys-auth', sid);
  }

  private async closeSocket() {
    this.autoReconnect = false;
    if (this.sock) {
      try { this.sock.ev.removeAllListeners(); } catch {}
      try { this.sock.ws?.close(); } catch {}
      this.sock = null;
    }
    this.autoReconnect = true;
  }

  public async connect(sessionId: string = 'primary_session') {
    if (this.status === 'starting' || this.status === 'connecting' || this.status === 'connected') return;
    this.sessionId = sessionId;
    this.status = 'starting';
    this.qrDataUrl = null;
    this.qrUpdatedAt = null;
    this.qrExpiresAt = null;
    this.pairingCode = null;
    this.lastQrError = null;

    logIntegration('WHATSAPP_BAILEYS', 'WA_START_SESSION', 'INFO', `Starting Baileys session: ${sessionId}`);

    const authFolder = this.getAuthFolder(sessionId);
    if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
    });

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (connection === 'connecting') this.status = 'connecting';

      if (qr) {
        this.status = 'qr_ready';
        try {
          this.qrDataUrl = await QRCode.toDataURL(qr);
          this.qrUpdatedAt = new Date().toISOString();
          this.qrExpiresAt = Date.now() + QR_TTL_MS;
          this.lastQrError = null;
          logIntegration('WHATSAPP_BAILEYS', 'WA_QR_READY', 'INFO', 'QR code generated');
        } catch (e: any) {
          this.lastQrError = e.message;
        }
      }

      if (connection === 'close') {
        this.isConnected = false;
        this.lastDisconnectAt = new Date().toISOString();
        const error = (lastDisconnect?.error as Boom);
        this.lastError = error?.message || 'Connection closed';
        const shouldReconnect = error?.output?.statusCode !== DisconnectReason.loggedOut;
        logIntegration('WHATSAPP_BAILEYS', 'WA_DISCONNECTED', 'WARNING', `Closed: ${this.lastError}`);

        if (shouldReconnect && this.autoReconnect) {
          this.status = 'disconnected';
          setTimeout(() => this.connect(sessionId), 5000);
        } else {
          this.status = 'not_started';
          if (!shouldReconnect) {
            const af = this.getAuthFolder(sessionId);
            if (fs.existsSync(af)) fs.rmSync(af, { recursive: true, force: true });
          }
        }
      } else if (connection === 'open') {
        this.isConnected = true;
        this.status = 'connected';
        this.lastConnectedAt = new Date().toISOString();
        this.lastError = null;
        this.qrDataUrl = null;
        this.qrExpiresAt = null;
        this.pairingCode = null;
        const id = sock.user?.id;
        if (id) {
          this.userJid = id;
          this.phoneNumber = id.split(':')[0];
          this.pushName = sock.user?.name || null;
        }
        logIntegration('WHATSAPP_BAILEYS', 'WA_CONNECTED', 'SUCCESS', `Connected as ${this.phoneNumber || this.userJid}`);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (upsert: any) => {
      this.lastUpsertAt = new Date().toISOString();
      await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_UPSERT_RECEIVED', 'INFO', `Upsert received: ${upsert.type}`, {
        upsertType: upsert.type,
        messageCount: Array.isArray(upsert.messages) ? upsert.messages.length : 0,
      });
      if (upsert.type !== 'notify') {
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_SKIPPED', 'INFO', `Non-notify upsert logged only: ${upsert.type}`, {
          upsertType: upsert.type,
          reason: 'non_notify_upsert',
        });
        return;
      }
      for (const msg of upsert.messages || []) {
        await this.processIncomingMessage(sock, msg, upsert.type);
      }
    });

    this.sock = sock;
  }

  private async processIncomingMessage(sock: any, msg: any, upsertType: string = 'notify') {
    try {
      const msgId: string = msg.key?.id || '';
      if (msgId && processedIds.has(msgId)) {
        this.skippedMessageCount++;
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_SKIPPED', 'INFO', 'Duplicate WhatsApp message skipped', { upsertType, messageId: msgId, reason: 'duplicate' });
        return;
      }
      processedIds.add(msgId);
      // Cleanup cache to prevent memory leak
      if (processedIds.size > 500) {
        const arr = Array.from(processedIds);
        arr.slice(0, 200).forEach(id => processedIds.delete(id));
      }

      const fromMe: boolean = msg.key?.fromMe || false;
      const remoteJid: string = msg.key?.remoteJid || '';
      const participant: string = msg.key?.participant || '';
      const senderJid: string = fromMe ? (this.userJid || '') : (msg.key?.participant || remoteJid);
      const senderNumber: string = normalizePhoneNumber(senderJid.split('@')[0].split(':')[0]);
      const pushName: string = msg.pushName || '';

      // Extract text
      const text: string = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ''
      ).trim();

      this.lastMessageAt = new Date().toISOString();
      this.lastRawMessageText = textPreview(text);
      if (!text) {
        this.skippedMessageCount++;
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_SKIPPED', 'INFO', 'WhatsApp message skipped: no text', { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber, reason: 'no_text' });
        return;
      }
      await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_RECEIVED', 'INFO', `Message received from ${senderNumber || remoteJid}`, {
        upsertType,
        messageId: msgId,
        remoteJid,
        participant,
        senderJid,
        senderNumber,
        fromMe,
        pushName,
        textPreview: textPreview(text),
        timestamp: msg.messageTimestamp,
      });

      const settings = await getWaSettings();

      // Determine if this message should be processed
      if (fromMe) {
        // Self-command mode: only if enabled and starts with / or is a known command
        if (!settings.selfCommandsEnabled) {
          this.skippedMessageCount++;
          await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_SELF_COMMAND_SKIPPED', 'WARNING', 'Message received, but self command mode is disabled. Enable Self Commands in Integrations > WhatsApp.', { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber, textPreview: textPreview(text), reason: 'self_mode_disabled', fix: 'Enable Self Commands in Integrations > WhatsApp' });
          await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_SKIPPED', 'INFO', 'Self command skipped because self mode disabled', { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber, textPreview: textPreview(text), reason: 'self_mode_disabled', fix: 'Enable Self Commands in Integrations > WhatsApp' });
          return;
        }
        if (!getWaSession(senderNumber || remoteJid) && !isCommandLike(text)) {
          this.skippedMessageCount++;
          await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_SKIPPED', 'INFO', 'Self message skipped because it is not command-like', { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber, textPreview: textPreview(text), reason: 'not_command_like' });
          return;
        }
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_SELF_COMMAND_ALLOWED', 'INFO', `Self command allowed: ${text.split(' ')[0]}`, { remoteJid, fromMe, senderNumber, textPreview: textPreview(text) });
        // Don't process if it looks like a bot response (contains $ signs and typical response patterns)
        if (isReplayFxResponse(text) || text.includes('Balance:') || text.includes('Available commands:') || text.includes('Server Online') || text.includes('Momentum Setup') || text.includes('Remote trading execution is disabled')) {
          this.skippedMessageCount++;
          await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_SKIPPED', 'INFO', 'ReplayFX response loop skipped', { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber, textPreview: textPreview(text), reason: 'bot_response_loop' });
          return;
        }
      } else {
        // External command: must be from allowed number (if allowedNumbers configured)
        if (settings.allowedNumbers.length > 0 && !settings.allowedNumbers.includes(senderNumber)) {
          await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_COMMAND_REJECTED', 'WARNING', `Unauthorized number: ${senderNumber}`, { allowedNumbers: settings.allowedNumbers });
          return;
        }
        // Only process if it looks like a command
        if (!getWaSession(senderNumber || remoteJid) && !isCommandLike(text)) {
          this.skippedMessageCount++;
          await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_MESSAGE_SKIPPED', 'INFO', 'External message skipped because it is not command-like', { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber, textPreview: textPreview(text), reason: 'not_command_like' });
          return;
        }
      }

      this.lastIncomingCommand = text;
      this.lastIncomingAt = new Date().toISOString();
      this.lastCommandAt = this.lastIncomingAt;

      await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_COMMAND_RECEIVED', 'INFO', `Command from ${senderNumber || remoteJid}: ${text}`, { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber, textPreview: textPreview(text) });

      const { response, status, commandId } = await handleWaCommand(text, senderNumber || remoteJid);
      const markedResponse = `[ReplayFX]\n${response}`;

      if (commandId && ['QUEUED', 'WAITING_CONTROLLER', 'BLOCKED_BY_ACTIVE_COMMAND'].includes(status)) {
        startCommandWatcher(commandId, 'WHATSAPP_BAILEYS', { chatId: senderNumber || remoteJid, jid: remoteJid });
      }

      // Send reply
      try {
        await sock.sendMessage(remoteJid, { text: markedResponse, contextInfo: replayFxContextInfo() });
        this.lastResponse = response;
        this.processedMessageCount++;
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_SEND_REPLY_SUCCESS', 'SUCCESS', `Reply sent to ${senderNumber || remoteJid}`, { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber });
        const statusLabel = status === 'QUEUED' ? 'QUEUED' : status === 'REJECTED' ? 'REJECTED' : status === 'FAILED' ? 'FAILED' : status === 'SUCCESS' ? 'SUCCESS' : 'PROCESSED';
        await logIntegration('WHATSAPP_BAILEYS', status === 'REJECTED' ? 'WHATSAPP_COMMAND_REJECTED' : 'WHATSAPP_COMMAND_PROCESSED', status === 'FAILED' ? 'ERROR' : status === 'REJECTED' ? 'WARNING' : 'INFO', status === 'REJECTED' ? `Rejected: ${text.split(' ')[0]}` : status === 'QUEUED' ? `Queued: ${text.split(' ')[0]}` : `Processed: ${text.split(' ')[0]}`, { status: statusLabel, remoteJid, fromMe, senderNumber, source: fromMe ? 'self' : 'external', response: 'sent' });
      } catch (sendErr: any) {
        this.lastCommandError = sendErr.message;
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_SEND_REPLY_FAILED', 'ERROR', `Send failed: ${sendErr.message}`, { upsertType, messageId: msgId, remoteJid, fromMe, senderNumber });
        await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_COMMAND_FAILED', 'ERROR', `Send failed: ${sendErr.message}`);
      }

      // Log to CommandLog
      await prisma.commandLog.create({
        data: {
          source: 'WHATSAPP_BAILEYS',
          senderId: senderJid,
          command: text.split(' ')[0].toLowerCase(),
          args: text.split(' ').slice(1).join(' ') || null,
          status,
          response,
        }
      });
    } catch (err: any) {
      this.lastCommandError = err.message;
      await logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_COMMAND_FAILED', 'ERROR', err.message).catch(() => {});
    }
  }

  public async simulateCommand(text: string, fromMe: boolean = true, remoteJid?: string) {
    const syntheticRemoteJid = remoteJid || this.userJid || (this.phoneNumber ? `${this.phoneNumber}@s.whatsapp.net` : 'simulate@s.whatsapp.net');
    const msg = {
      key: {
        id: `simulate-${Date.now()}`,
        remoteJid: syntheticRemoteJid,
        fromMe,
      },
      pushName: 'ReplayFX Debug',
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: text },
    };
    const fakeSock = {
      sendMessage: async (_jid: string, payload: any) => {
        this.lastMessageSentAt = new Date().toISOString();
        this.lastMessageError = null;
        this.lastResponse = String(payload?.text || '').replace(/^\[ReplayFX\]\n/, '');
        return true;
      }
    };
    await this.processIncomingMessage(fakeSock, msg, 'simulate');
    const debug = await this.getDebugState();
    return {
      command: text,
      response: this.lastResponse,
      debug,
    };
  }

  public async refreshQr(): Promise<{ ok: boolean; message?: string; error?: string }> {
    if (this.isConnected) return { ok: false, message: 'WhatsApp is already connected.' };
    logIntegration('WHATSAPP_BAILEYS', 'WA_QR_REFRESH_REQUESTED', 'INFO', 'QR refresh requested');
    await this.closeSocket();
    this.status = 'not_started';
    this.qrDataUrl = null;
    this.qrExpiresAt = null;
    await this.connect(this.sessionId);
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (this.qrDataUrl) return { ok: true, message: 'QR ready' };
    }
    return { ok: false, error: 'QR not generated in time. Try Restart Session.' };
  }

  public async restartSession(): Promise<void> {
    logIntegration('WHATSAPP_BAILEYS', 'WA_SOCKET_RESTARTED', 'INFO', 'Session restart requested');
    await this.closeSocket();
    const af = this.getAuthFolder(this.sessionId);
    if (fs.existsSync(af)) fs.rmSync(af, { recursive: true, force: true });
    this.isConnected = false;
    this.status = 'not_started';
    this.qrDataUrl = null;
    this.qrExpiresAt = null;
    this.pairingCode = null;
    this.userJid = null;
    this.phoneNumber = null;
    await this.connect(this.sessionId);
  }

  public async reconnectExistingSession(): Promise<void> {
    const authFolder = this.getAuthFolder(this.sessionId);
    if (!fs.existsSync(authFolder)) {
      throw new Error('No existing WhatsApp auth session found. Start a new session and scan QR.');
    }
    await logIntegration('WHATSAPP_BAILEYS', 'WA_RECONNECT_EXISTING_SESSION', 'INFO', 'Reconnect existing session requested');
    await this.closeSocket();
    this.status = 'not_started';
    this.qrDataUrl = null;
    this.qrExpiresAt = null;
    await this.connect(this.sessionId);
  }

  public async requestPairingCode(phone: string): Promise<string> {
    if (this.lastPairingRequestAt && Date.now() - this.lastPairingRequestAt < 60000) {
      const wait = Math.ceil((60000 - (Date.now() - this.lastPairingRequestAt)) / 1000);
      throw Object.assign(new Error(`Rate limited. Wait ${wait}s.`), { possibleCause: 'Too many requests', suggestion: `Wait ${wait}s` });
    }
    if (this.isConnected) throw Object.assign(new Error('Already connected.'), { possibleCause: 'Already connected', suggestion: 'No need for pairing code.' });
    if (!this.sock || this.status === 'error' || this.status === 'not_started') {
      await this.closeSocket();
      this.status = 'not_started';
      await this.connect(this.sessionId);
      await new Promise(r => setTimeout(r, 4000));
    }
    this.lastPairingRequestAt = Date.now();
    this.status = 'pairing_requested';
    try {
      const code = await this.sock.requestPairingCode(phone);
      this.pairingCode = code;
      this.pairingCodeExpiresAt = Date.now() + 60000;
      this.lastPairingError = null;
      this.status = 'pairing_ready';
      return code;
    } catch (err: any) {
      this.status = 'error';
      this.lastPairingError = err.message;
      throw Object.assign(new Error(err.message), { possibleCause: 'Socket not ready or rate limit', suggestion: 'Check phone format or use QR.' });
    }
  }

  public getQrDataUrl() { return this.qrDataUrl; }
  public getIsConnected() { return this.isConnected; }

  public async sendMessage(jid: string, text: string) {
    if (!this.isConnected || !this.sock) return false;
    const target = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    try {
      await this.sock.sendMessage(target, { text, contextInfo: replayFxContextInfo() });
      this.lastMessageSentAt = new Date().toISOString();
      this.lastMessageError = null;
      return true;
    } catch (error: any) {
      this.lastMessageError = error.message;
      return false;
    }
  }

  public async sendImage(jid: string, buffer: Buffer, caption?: string) {
    if (!this.isConnected || !this.sock) return false;
    const target = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    try {
      await this.sock.sendMessage(target, { image: buffer, caption: caption || '', contextInfo: replayFxContextInfo() });
      this.lastMessageSentAt = new Date().toISOString();
      this.lastMessageError = null;
      return true;
    } catch (error: any) {
      this.lastMessageError = error.message;
      return false;
    }
  }
}

export const baileysService = BaileysService.getInstance();
