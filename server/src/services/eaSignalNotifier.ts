import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { prisma } from '../prisma';
import { logIntegration } from '../utils/logger';
import { baileysService } from './baileysService';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_32_chars_1234';
const ALGORITHM = 'aes-256-cbc';

type SignalLike = {
  id: string;
  eaName: string;
  symbol: string;
  timeframe: string;
  side: string;
  entry?: number | null;
  sl?: number | null;
  tp?: number | null;
  rr?: number | null;
  lot?: number | null;
  riskPercent?: number | null;
  reason?: string | null;
  approvalCode: string;
  expiresAt?: Date | string | null;
  screenshotId?: string | null;
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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function valueOrDash(value: unknown) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

function formatDate(value: SignalLike['expiresAt']) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toISOString();
}

function formatScreenshotError(message: string) {
  return `<b>Screenshot:</b> ${escapeHtml(message)}`;
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

async function resolveSignalScreenshot(signal: SignalLike) {
  if (!signal.screenshotId) return { resolvedPath: null as string | null, error: 'No screenshot attached yet.' };
  const screenshot = await prisma.eaScreenshot.findUnique({ where: { id: signal.screenshotId } }).catch(() => null);
  if (!screenshot) return { resolvedPath: null as string | null, error: 'Screenshot record not found.' };
  const mt5FilesDir = process.env.MT5_FILES_DIR;
  const allowedBase = mt5FilesDir ? path.resolve(mt5FilesDir) : path.resolve(process.cwd(), '..', 'uploads', 'ea-screenshots');
  const filePath = screenshot.localFilePath || screenshot.filePath || screenshot.url || null;
  if (!filePath || /^https?:\/\//i.test(filePath)) {
    return { resolvedPath: null as string | null, error: 'Screenshot file path is unavailable.' };
  }
  const resolvedPath = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(allowedBase, filePath);
  if (fs.existsSync(resolvedPath)) return { resolvedPath, error: null as string | null };
  const fallback = path.resolve(allowedBase, path.basename(filePath));
  if (fs.existsSync(fallback)) return { resolvedPath: fallback, error: null as string | null };
  return {
    resolvedPath: null as string | null,
    error: `Screenshot file not found. MT5_FILES_DIR: ${mt5FilesDir || '-'} fileName: ${path.basename(filePath)} resolvedPath: ${resolvedPath} exists: false`,
  };
}

async function sendTelegramPhoto(chatId: string | number, filePath: string, caption: string, replyMarkup?: any) {
  const settings = await getSettings(['telegram_bot_token']);
  const token = decrypt(settings.telegram_bot_token || '');
  if (!token) throw new Error('Telegram bot token not configured');

  const boundary = `----ReplayFXTelegram${Date.now()}${Math.random().toString(16).slice(2)}`;
  const endpoint = new URL(`https://api.telegram.org/bot${token}/sendPhoto`);
  const fileName = path.basename(filePath);
  const field = (name: string, value: string | number) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`);
  const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
  const size = fs.statSync(filePath).size;
  const replyMarkupBody = replyMarkup ? field('reply_markup', JSON.stringify(replyMarkup)) : Buffer.alloc(0);
  const contentLength = field('chat_id', chatId).length + field('caption', caption).length + field('parse_mode', 'HTML').length + replyMarkupBody.length + fileHeader.length + size + fileFooter.length;

  await new Promise<void>((resolve, reject) => {
    const req = https.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': contentLength,
      },
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Telegram sendPhoto failed: ${res.statusCode} ${body || res.statusMessage || ''}`.trim()));
      });
    });
    req.on('error', reject);
    req.write(field('chat_id', chatId));
    req.write(field('caption', caption));
    req.write(field('parse_mode', 'HTML'));
    if (replyMarkupBody.length) req.write(replyMarkupBody);
    req.write(fileHeader);
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => {
      req.destroy(err);
      reject(err);
    });
    stream.on('end', () => req.end(fileFooter));
    stream.pipe(req, { end: false });
  });
}

function signalTitle(signal: SignalLike) {
  return `${signal.eaName} ${signal.symbol} ${signal.timeframe} ${signal.side}`.trim();
}

export function buildTelegramSignalCard(signal: SignalLike) {
  const lines = [
    '<b>EA Signal Pending</b>',
    '',
    `<b>EA name:</b> ${escapeHtml(signal.eaName)}`,
    `<b>Symbol:</b> ${escapeHtml(signal.symbol)}`,
    `<b>Timeframe:</b> ${escapeHtml(signal.timeframe)}`,
    `<b>Side:</b> ${escapeHtml(signal.side)}`,
    `<b>Entry:</b> <code>${escapeHtml(valueOrDash(signal.entry))}</code>`,
    `<b>SL:</b> <code>${escapeHtml(valueOrDash(signal.sl))}</code>`,
    `<b>TP:</b> <code>${escapeHtml(valueOrDash(signal.tp))}</code>`,
    `<b>RR:</b> <code>${escapeHtml(valueOrDash(signal.rr))}</code>`,
    `<b>Lot:</b> <code>${escapeHtml(valueOrDash(signal.lot))}</code>`,
    `<b>Risk %:</b> <code>${escapeHtml(valueOrDash(signal.riskPercent))}</code>`,
    `<b>Setup reason:</b> ${escapeHtml(valueOrDash(signal.reason))}`,
    `<b>Approval code:</b> <code>${escapeHtml(signal.approvalCode)}</code>`,
    `<b>Expires at:</b> <code>${escapeHtml(formatDate(signal.expiresAt))}</code>`,
  ];
  return lines.join('\n');
}

export function buildTelegramSignalButtons(signalId: string) {
  return {
    inline_keyboard: [
      [
        { text: '\u2705 Confirm Entry', callback_data: `sig:approve:${signalId}` },
        { text: '\u274C Reject', callback_data: `sig:reject:${signalId}` },
      ],
      [
        { text: '\uD83D\uDCF8 Screenshot', callback_data: `sig:screenshot:${signalId}` },
        { text: '\uD83D\uDCC4 Details', callback_data: `sig:details:${signalId}` },
      ],
      [
        { text: 'Edit Lot/Risk', callback_data: `sig:edit:${signalId}` },
      ],
    ],
  };
}

export function buildWhatsAppSignalCard(signal: SignalLike) {
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
    `Expires at: ${formatDate(signal.expiresAt)}`,
    '',
    '1. Confirm Entry',
    '2. Reject',
    '3. Screenshot',
    '4. Details',
    '5. Edit Lot/Risk',
  ].join('\n');
}

export function buildTelegramPendingSignalsList(signals: SignalLike[]) {
  const text = signals.length
    ? ['<b>Pending EA Signals</b>', '', ...signals.map((s, index) => `${index + 1}. <code>${escapeHtml(s.approvalCode)}</code> ${escapeHtml(signalTitle(s))} entry <code>${escapeHtml(valueOrDash(s.entry))}</code>`)].join('\n')
    : 'No pending EA signals.';
  const replyMarkup = signals.length
    ? {
        inline_keyboard: signals.flatMap(s => [
          [
            { text: `Confirm ${s.approvalCode}`, callback_data: `sig:approve:${s.id}` },
            { text: `Reject ${s.approvalCode}`, callback_data: `sig:reject:${s.id}` },
          ],
          [
            { text: `Screenshot ${s.approvalCode}`, callback_data: `sig:screenshot:${s.id}` },
            { text: `Details ${s.approvalCode}`, callback_data: `sig:details:${s.id}` },
          ],
        ]),
      }
    : undefined;
  return { text, replyMarkup };
}

export function buildWhatsAppPendingSignalsList(signals: SignalLike[]) {
  if (!signals.length) return 'No pending EA signals.';
  return [
    '*Pending EA Signals*',
    '',
    ...signals.map((s, index) => `${index + 1}. ${s.approvalCode}: ${signalTitle(s)} entry ${valueOrDash(s.entry)} SL ${valueOrDash(s.sl)} TP ${valueOrDash(s.tp)}`),
    '',
    'Open a signal by approval code:',
    '/approve <code>',
    '/reject <code>',
    '/screenshot <symbol> <timeframe>',
  ].join('\n');
}

export async function sendTelegramSignalCard(signal: SignalLike): Promise<NotifyResult[]> {
  const settings = await getSettings(['telegram_enabled', 'telegram_bot_token', 'telegram_chat_ids']);
  if (settings.telegram_enabled !== 'true') return [];
  const token = decrypt(settings.telegram_bot_token || '');
  const chatIds = (settings.telegram_chat_ids || '').split(',').map(c => c.trim()).filter(Boolean);
  if (!token) throw new Error('Telegram bot token not configured');
  if (!chatIds.length) throw new Error('Telegram chat IDs not configured');

  const results: NotifyResult[] = [];
  const screenshot = await resolveSignalScreenshot(signal);
  for (const chatId of chatIds) {
    try {
      if (screenshot.resolvedPath) {
        await sendTelegramPhoto(chatId, screenshot.resolvedPath, buildTelegramSignalCard(signal), buildTelegramSignalButtons(signal.id));
      } else {
        const message = screenshot.error ? `${buildTelegramSignalCard(signal)}\n\n${formatScreenshotError(screenshot.error)}` : buildTelegramSignalCard(signal);
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            reply_markup: buildTelegramSignalButtons(signal.id),
          }),
        });
        if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
      }
      await logIntegration('TELEGRAM', 'SIGNAL_NOTIFICATION_SENT', 'SUCCESS', `Signal notification sent to Telegram ${chatId}`, { signalId: signal.id, approvalCode: signal.approvalCode, chatId });
      results.push({ channel: 'TELEGRAM', target: chatId, ok: true });
    } catch (err: any) {
      const error = err?.message || 'Telegram signal notification failed';
      await logIntegration('TELEGRAM', 'SIGNAL_NOTIFICATION_FAILED', 'ERROR', error, { signalId: signal.id, approvalCode: signal.approvalCode, chatId, error });
      results.push({ channel: 'TELEGRAM', target: chatId, ok: false, error });
    }
  }
  return results;
}

export async function sendWhatsAppSignalCard(signal: SignalLike): Promise<NotifyResult[]> {
  const settings = await getSettings(['whatsapp_enabled', 'whatsapp_provider', 'whatsapp_allowed_numbers', 'whatsapp_self_commands_enabled']);
  if (settings.whatsapp_enabled !== 'true' || (settings.whatsapp_provider || 'BAILEYS') !== 'BAILEYS') return [];
  if (!baileysService.getIsConnected()) throw new Error('WhatsApp is not connected');

  const state = baileysService.getFullState();
  const targets = new Set<string>((settings.whatsapp_allowed_numbers || '').split(',').map(n => normalizePhoneNumber(n.trim())).filter(Boolean));
  if (settings.whatsapp_self_commands_enabled === 'true' && state.phoneNumber) targets.add(normalizePhoneNumber(state.phoneNumber));
  if (!targets.size) throw new Error('WhatsApp targets not configured');

  const results: NotifyResult[] = [];
  const screenshot = await resolveSignalScreenshot(signal);
  for (const target of targets) {
    const sent = screenshot.resolvedPath
      ? await baileysService.sendImage(target, fs.readFileSync(screenshot.resolvedPath), buildWhatsAppSignalCard(signal))
      : await baileysService.sendMessage(target, screenshot.error ? `${buildWhatsAppSignalCard(signal)}\n\nScreenshot: ${screenshot.error}` : buildWhatsAppSignalCard(signal));
    if (sent) {
      await logIntegration('WHATSAPP_BAILEYS', 'SIGNAL_NOTIFICATION_SENT', 'SUCCESS', `Signal notification sent to WhatsApp ${target}`, { signalId: signal.id, approvalCode: signal.approvalCode, target });
      results.push({ channel: 'WHATSAPP_BAILEYS', target, ok: true });
    } else {
      const error = 'WhatsApp sendMessage returned false';
      await logIntegration('WHATSAPP_BAILEYS', 'SIGNAL_NOTIFICATION_FAILED', 'ERROR', error, { signalId: signal.id, approvalCode: signal.approvalCode, target, error });
      results.push({ channel: 'WHATSAPP_BAILEYS', target, ok: false, error });
    }
  }
  return results;
}

export async function notifySignalCreated(signal: SignalLike): Promise<NotifyResult[]> {
  const telegram = sendTelegramSignalCard(signal).catch(async (err: any) => {
    const error = err?.message || 'Telegram signal notification failed';
    await logIntegration('TELEGRAM', 'SIGNAL_NOTIFICATION_FAILED', 'ERROR', error, { signalId: signal.id, approvalCode: signal.approvalCode, error });
    return [{ channel: 'TELEGRAM' as const, ok: false, error }];
  });
  const whatsapp = sendWhatsAppSignalCard(signal).catch(async (err: any) => {
    const error = err?.message || 'WhatsApp signal notification failed';
    await logIntegration('WHATSAPP_BAILEYS', 'SIGNAL_NOTIFICATION_FAILED', 'ERROR', error, { signalId: signal.id, approvalCode: signal.approvalCode, error });
    return [{ channel: 'WHATSAPP_BAILEYS' as const, ok: false, error }];
  });

  const settled = await Promise.allSettled([telegram, whatsapp]);

  const results: NotifyResult[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      results.push(...item.value);
      continue;
    }
    const error = item.reason?.message || 'Signal notification failed';
    await logIntegration('SYSTEM', 'SIGNAL_NOTIFICATION_FAILED', 'ERROR', error, { signalId: signal.id, approvalCode: signal.approvalCode, error });
    results.push({ channel: 'TELEGRAM', ok: false, error });
  }
  return results;
}
