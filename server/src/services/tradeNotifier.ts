import crypto from 'crypto';
import { prisma } from '../prisma';
import { logIntegration } from '../utils/logger';
import { baileysService } from './baileysService';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_32_chars_1234';
const ALGORITHM = 'aes-256-cbc';

export type TradeNotificationInput = {
  id: string;
  symbol: string;
  side: string;
  lot?: number | null;
  entryPrice?: number | null;
  closePrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openTime?: Date | string | null;
  closeTime?: Date | string | null;
  profit?: number | null;
  profitCurrency?: string | null;
  riskMoney?: number | null;
  riskPercent?: number | null;
  rMultiple?: number | null;
  result?: string | null;
  status?: string | null;
  notes?: string | null;
  strategyTag?: string | null;
  emotionTag?: string | null;
  mistakeTag?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  broker?: string | null;
  source?: string | null;
  positionId?: string | null;
  closeReason?: string | null;
  eventType?: 'OPEN' | 'CLOSE' | 'TP' | 'PARTIAL_CLOSE';
};

type NotifyResult = {
  channel: 'TELEGRAM' | 'WHATSAPP_BAILEYS';
  target?: string;
  ok: boolean;
  error?: string;
};

function decrypt(text: string): string {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text;
    const iv = Buffer.from(parts[0], 'hex');
    const enc = Buffer.from(parts[1], 'hex');
    const d = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf-8');
  } catch {
    return text;
  }
}

function valueOrDash(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value: TradeNotificationInput['openTime']) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toISOString();
}

function normalizePhoneNumber(value: string | null | undefined): string {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

async function getSettings(keys: string[]) {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  rows.forEach(row => { map[row.key] = row.value; });
  return map;
}

function isTpHit(trade: TradeNotificationInput) {
  const close = trade.closePrice;
  const tp = trade.takeProfit;
  if (trade.closeReason && /tp|take profit/i.test(trade.closeReason)) return true;
  if (trade.result === 'TP') return true;
  if (close == null || tp == null) return false;
  const tolerance = Math.max(Math.abs(tp) * 0.0002, 0.00001);
  return Math.abs(close - tp) <= tolerance;
}

function eventLabel(trade: TradeNotificationInput) {
  if (trade.eventType === 'OPEN') return 'Trade Open';
  if (trade.eventType === 'PARTIAL_CLOSE') return 'Partial Close';
  if (trade.eventType === 'TP' || isTpHit(trade)) return 'Take Profit Hit';
  return 'Trade Closed';
}

function buildTradeTitle(trade: TradeNotificationInput) {
  return `${trade.symbol} ${trade.side}`.trim();
}

function buildTradeDetailLines(trade: TradeNotificationInput) {
  const lines = [
    `<b>${escapeHtml(eventLabel(trade))}</b>`,
    '',
    `<b>Symbol:</b> ${escapeHtml(trade.symbol)}`,
    `<b>Side:</b> ${escapeHtml(trade.side)}`,
    `<b>Lot:</b> <code>${escapeHtml(valueOrDash(trade.lot))}</code>`,
    `<b>Entry:</b> <code>${escapeHtml(valueOrDash(trade.entryPrice))}</code>`,
    `<b>Close:</b> <code>${escapeHtml(valueOrDash(trade.closePrice))}</code>`,
    `<b>SL:</b> <code>${escapeHtml(valueOrDash(trade.stopLoss))}</code>`,
    `<b>TP:</b> <code>${escapeHtml(valueOrDash(trade.takeProfit))}</code>`,
    `<b>Profit:</b> <code>${escapeHtml(valueOrDash(trade.profit))}</code>`,
    `<b>R:</b> <code>${escapeHtml(valueOrDash(trade.rMultiple))}</code>`,
    `<b>Risk %:</b> <code>${escapeHtml(valueOrDash(trade.riskPercent))}</code>`,
    `<b>Risk Money:</b> <code>${escapeHtml(valueOrDash(trade.riskMoney))}</code>`,
    `<b>Account:</b> ${escapeHtml(trade.accountName || trade.accountNumber || '-')}`,
    `<b>Broker:</b> ${escapeHtml(trade.broker || '-')}`,
    `<b>Source:</b> ${escapeHtml(trade.source || '-')}`,
    `<b>Open Time:</b> <code>${escapeHtml(formatDate(trade.openTime))}</code>`,
    `<b>Close Time:</b> <code>${escapeHtml(formatDate(trade.closeTime))}</code>`,
    `<b>Result:</b> ${escapeHtml(trade.result || (isTpHit(trade) ? 'TP' : trade.status || '-'))}`,
    trade.closeReason ? `<b>Close Reason:</b> ${escapeHtml(trade.closeReason)}` : null,
    trade.strategyTag ? `<b>Strategy:</b> ${escapeHtml(trade.strategyTag)}` : null,
    trade.emotionTag ? `<b>Emotion:</b> ${escapeHtml(trade.emotionTag)}` : null,
    trade.mistakeTag ? `<b>Mistake:</b> ${escapeHtml(trade.mistakeTag)}` : null,
    trade.notes ? `<b>Notes:</b> ${escapeHtml(trade.notes)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function buildWhatsAppTradeCard(trade: TradeNotificationInput) {
  const event = eventLabel(trade);
  return [
    `*${event}*`,
    '',
    `Symbol: ${trade.symbol}`,
    `Side: ${trade.side}`,
    `Lot: ${valueOrDash(trade.lot)}`,
    `Entry: ${valueOrDash(trade.entryPrice)}`,
    `Close: ${valueOrDash(trade.closePrice)}`,
    `SL: ${valueOrDash(trade.stopLoss)}`,
    `TP: ${valueOrDash(trade.takeProfit)}`,
    `Profit: ${valueOrDash(trade.profit)}`,
    `R: ${valueOrDash(trade.rMultiple)}`,
    `Risk %: ${valueOrDash(trade.riskPercent)}`,
    `Risk Money: ${valueOrDash(trade.riskMoney)}`,
    `Account: ${trade.accountName || trade.accountNumber || '-'}`,
    `Broker: ${trade.broker || '-'}`,
    `Source: ${trade.source || '-'}`,
    `Open Time: ${formatDate(trade.openTime)}`,
    `Close Time: ${formatDate(trade.closeTime)}`,
    `Result: ${trade.result || (isTpHit(trade) ? 'TP' : trade.status || '-')}`,
    trade.closeReason ? `Close Reason: ${trade.closeReason}` : null,
    trade.strategyTag ? `Strategy: ${trade.strategyTag}` : null,
    trade.emotionTag ? `Emotion: ${trade.emotionTag}` : null,
    trade.mistakeTag ? `Mistake: ${trade.mistakeTag}` : null,
    trade.notes ? `Notes: ${trade.notes}` : null,
  ].filter(Boolean).join('\n');
}

async function sendTelegramTradeCard(trade: TradeNotificationInput): Promise<NotifyResult[]> {
  const settings = await getSettings(['telegram_enabled', 'telegram_bot_token', 'telegram_chat_ids']);
  if (settings.telegram_enabled !== 'true') return [];
  const token = decrypt(settings.telegram_bot_token || '');
  const chatIds = (settings.telegram_chat_ids || '').split(',').map(c => c.trim()).filter(Boolean);
  if (!token) throw new Error('Telegram bot token not configured');
  if (!chatIds.length) throw new Error('Telegram chat IDs not configured');

  const results: NotifyResult[] = [];
  for (const chatId of chatIds) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildTradeDetailLines(trade),
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Details', callback_data: `trade:details:${trade.id}` }],
            ],
          },
        }),
      });
      if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
      await logIntegration('TELEGRAM', `${trade.eventType === 'TP' || isTpHit(trade) ? 'TRADE_TP_NOTIFICATION_SENT' : 'TRADE_CLOSE_NOTIFICATION_SENT'}`, 'SUCCESS', `Trade notification sent to Telegram ${chatId}`, { tradeId: trade.id, chatId, eventType: trade.eventType || eventLabel(trade) });
      results.push({ channel: 'TELEGRAM', target: chatId, ok: true });
    } catch (err: any) {
      const error = err?.message || 'Telegram trade notification failed';
      await logIntegration('TELEGRAM', `${trade.eventType === 'TP' || isTpHit(trade) ? 'TRADE_TP_NOTIFICATION_FAILED' : 'TRADE_CLOSE_NOTIFICATION_FAILED'}`, 'ERROR', error, { tradeId: trade.id, chatId, error });
      results.push({ channel: 'TELEGRAM', target: chatId, ok: false, error });
    }
  }
  return results;
}

async function sendWhatsAppTradeCard(trade: TradeNotificationInput): Promise<NotifyResult[]> {
  const settings = await getSettings(['whatsapp_enabled', 'whatsapp_provider', 'whatsapp_allowed_numbers', 'whatsapp_self_commands_enabled']);
  if (settings.whatsapp_enabled !== 'true' || (settings.whatsapp_provider || 'BAILEYS') !== 'BAILEYS') return [];
  if (!baileysService.getIsConnected()) throw new Error('WhatsApp is not connected');

  const state = baileysService.getFullState();
  const targets = new Set<string>((settings.whatsapp_allowed_numbers || '').split(',').map(n => normalizePhoneNumber(n.trim())).filter(Boolean));
  if (settings.whatsapp_self_commands_enabled === 'true' && state.phoneNumber) targets.add(normalizePhoneNumber(state.phoneNumber));
  if (!targets.size) throw new Error('WhatsApp targets not configured');

  const results: NotifyResult[] = [];
  for (const target of targets) {
    const sent = await baileysService.sendMessage(target, buildWhatsAppTradeCard(trade));
    if (sent) {
      await logIntegration('WHATSAPP_BAILEYS', `${trade.eventType === 'TP' || isTpHit(trade) ? 'TRADE_TP_NOTIFICATION_SENT' : 'TRADE_CLOSE_NOTIFICATION_SENT'}`, 'SUCCESS', `Trade notification sent to WhatsApp ${target}`, { tradeId: trade.id, target, eventType: trade.eventType || eventLabel(trade) });
      results.push({ channel: 'WHATSAPP_BAILEYS', target, ok: true });
    } else {
      const error = 'WhatsApp sendMessage returned false';
      await logIntegration('WHATSAPP_BAILEYS', `${trade.eventType === 'TP' || isTpHit(trade) ? 'TRADE_TP_NOTIFICATION_FAILED' : 'TRADE_CLOSE_NOTIFICATION_FAILED'}`, 'ERROR', error, { tradeId: trade.id, target, error });
      results.push({ channel: 'WHATSAPP_BAILEYS', target, ok: false, error });
    }
  }
  return results;
}

export async function notifyTradeLifecycle(trade: TradeNotificationInput): Promise<NotifyResult[]> {
  const telegram = sendTelegramTradeCard(trade).catch(async (err: any) => {
    const error = err?.message || 'Telegram trade notification failed';
    await logIntegration('TELEGRAM', `${trade.eventType === 'TP' || isTpHit(trade) ? 'TRADE_TP_NOTIFICATION_FAILED' : 'TRADE_CLOSE_NOTIFICATION_FAILED'}`, 'ERROR', error, { tradeId: trade.id, error });
    return [{ channel: 'TELEGRAM' as const, ok: false, error }];
  });
  const whatsapp = sendWhatsAppTradeCard(trade).catch(async (err: any) => {
    const error = err?.message || 'WhatsApp trade notification failed';
    await logIntegration('WHATSAPP_BAILEYS', `${trade.eventType === 'TP' || isTpHit(trade) ? 'TRADE_TP_NOTIFICATION_FAILED' : 'TRADE_CLOSE_NOTIFICATION_FAILED'}`, 'ERROR', error, { tradeId: trade.id, error });
    return [{ channel: 'WHATSAPP_BAILEYS' as const, ok: false, error }];
  });

  const settled = await Promise.allSettled([telegram, whatsapp]);
  const results: NotifyResult[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      results.push(...item.value);
      continue;
    }
    const error = item.reason?.message || 'Trade notification failed';
    await logIntegration('SYSTEM', `${trade.eventType === 'TP' || isTpHit(trade) ? 'TRADE_TP_NOTIFICATION_FAILED' : 'TRADE_CLOSE_NOTIFICATION_FAILED'}`, 'ERROR', error, { tradeId: trade.id, error });
    results.push({ channel: 'TELEGRAM', ok: false, error });
  }
  return results;
}
