import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { logIntegration } from '../utils/logger';
import { handleSetupReviewCommand } from '../services/setupReviewService';
import {
  buildMainMenu,
  createEaCommand,
  createEaCommandFromIntent,
  formatHelp,
  handleEaControlCommand,
  parseEaControlIntent,
} from '../services/eaControlService';
import { startCommandWatcher } from '../services/eaCommandWatcher';
import { handleEaBotInput, isEaBotText } from '../services/eaMenuService';
import { getEaSession } from '../services/eaSessionService';
import { commandHasDetailedResult, writeCommandDebugNote } from '../services/eaCommandNoteService';
import { escapeHtml, fmtCode, shortCommandId } from '../services/eaFormatter';
import { buildTelegramPendingSignalsList, buildTelegramSignalButtons, buildTelegramSignalCard } from '../services/eaSignalNotifier';

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_32_chars_1234';
const ALGORITHM = 'aes-256-cbc';

function decrypt(text: string): string {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text;
    const iv = Buffer.from(parts[0], 'hex');
    const enc = Buffer.from(parts[1], 'hex');
    const d = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf-8');
  } catch { return text; }
}

async function getTelegramConfig() {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['telegram_enabled', 'telegram_bot_token', 'telegram_chat_ids', 'secretToken'] } }
  });
  const m: Record<string, string> = {};
  rows.forEach(r => (m[r.key] = r.value));
  return {
    enabled: m['telegram_enabled'] === 'true',
    botToken: decrypt(m['telegram_bot_token'] || ''),
    chatIds: m['telegram_chat_ids'] || '',
    webhookSecret: m['secretToken'] || ''
  };
}

export async function sendTelegramMessage(chatId: string | number, text: string, replyMarkup?: any) {
  const cfg = await getTelegramConfig();
  if (!cfg.botToken) throw new Error('Telegram bot token not configured');
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body || res.statusText}`);
  }
}

export async function sendTelegramPhoto(chatId: string | number, filePath: string, caption: string) {
  const cfg = await getTelegramConfig();
  const fullPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(process.env.MT5_FILES_DIR || path.join(process.cwd(), '..', 'uploads', 'ea-screenshots'), filePath);
  const exists = fs.existsSync(fullPath);
  const size = exists ? fs.statSync(fullPath).size : 0;
  const endpointPath = '/bot<redacted>/sendPhoto';

  await logIntegration('TELEGRAM', 'TELEGRAM_SEND_PHOTO_DEBUG', 'INFO', 'Telegram sendPhoto debug', {
    chatId,
    fileName: path.basename(filePath),
    fullPath,
    fileExists: exists,
    fileSize: size,
    tokenPresent: !!cfg.botToken,
    tokenPrefix: cfg.botToken ? cfg.botToken.slice(0, 8) : null,
    endpointPath,
  });

  if (!cfg.botToken) throw new Error('Telegram bot token not configured');
  if (!exists) throw new Error(`Screenshot created but file not found on backend path: ${fullPath}`);

  const boundary = `----ReplayFXTelegram${Date.now()}${Math.random().toString(16).slice(2)}`;
  const endpoint = new URL(`https://api.telegram.org/bot${cfg.botToken}/sendPhoto`);
  const fileName = path.basename(fullPath);

  const field = (name: string, value: string | number) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`);
  const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
  const contentLength = field('chat_id', chatId).length + field('caption', caption).length + field('parse_mode', 'HTML').length + fileHeader.length + size + fileFooter.length;

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
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Telegram sendPhoto failed: ${res.statusCode} ${body || res.statusMessage || ''}`.trim()));
        }
      });
    });

    req.on('error', reject);
    req.write(field('chat_id', chatId));
    req.write(field('caption', caption));
    req.write(field('parse_mode', 'HTML'));
    req.write(fileHeader);
    const stream = fs.createReadStream(fullPath);
    stream.on('error', err => {
      req.destroy(err);
      reject(err);
    });
    stream.on('end', () => req.end(fileFooter));
    stream.pipe(req, { end: false });
  });
}

export async function sendTelegramDocument(chatId: string | number, filePath: string, caption: string) {
  const cfg = await getTelegramConfig();
  const fullPath = path.resolve(filePath);
  const exists = fs.existsSync(fullPath);
  const size = exists ? fs.statSync(fullPath).size : 0;
  const endpointPath = '/bot<redacted>/sendDocument';

  await logIntegration('TELEGRAM', 'TELEGRAM_SEND_DOCUMENT_DEBUG', 'INFO', 'Telegram sendDocument debug', {
    chatId,
    filePath: fullPath,
    fileName: path.basename(fullPath),
    fileExists: exists,
    fileSize: size,
    tokenPresent: !!cfg.botToken,
    tokenPrefix: cfg.botToken ? cfg.botToken.slice(0, 8) : null,
    endpointPath,
  });

  if (!cfg.botToken) throw new Error('Telegram bot token not configured');
  if (!exists) throw new Error(`Command note file not found on backend path: ${fullPath}`);

  const boundary = `----ReplayFXTelegramDoc${Date.now()}${Math.random().toString(16).slice(2)}`;
  const endpoint = new URL(`https://api.telegram.org/bot${cfg.botToken}/sendDocument`);
  const fileName = path.basename(fullPath);
  const field = (name: string, value: string | number) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n`);
  const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
  const contentLength = field('chat_id', chatId).length + field('caption', caption).length + field('parse_mode', 'HTML').length + fileHeader.length + size + fileFooter.length;

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
        else reject(new Error(`Telegram sendDocument failed: ${res.statusCode} ${body || res.statusMessage || ''}`.trim()));
      });
    });
    req.on('error', reject);
    req.write(field('chat_id', chatId));
    req.write(field('caption', caption));
    req.write(field('parse_mode', 'HTML'));
    req.write(fileHeader);
    const stream = fs.createReadStream(fullPath);
    stream.on('error', err => {
      req.destroy(err);
      reject(err);
    });
    stream.on('end', () => req.end(fileFooter));
    stream.pipe(req, { end: false });
  });
}

const BLOCKED = new Set(['/buy', '/sell', '/close_all', '/modify_sl', '/modify_tp']);
const TELEGRAM_SESSION_TTL_MS = 5 * 60 * 1000;
type TelegramSession = {
  flow: 'attach' | 'screenshot' | 'cleanup' | 'signal_edit';
  step: string;
  data: Record<string, string>;
  expiresAt: number;
};
const telegramSessions = new Map<string, TelegramSession>();

function getTelegramSession(chatId: string | number) {
  const key = String(chatId);
  const session = telegramSessions.get(key);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    telegramSessions.delete(key);
    return null;
  }
  session.expiresAt = Date.now() + TELEGRAM_SESSION_TTL_MS;
  return session;
}

function setTelegramSession(chatId: string | number, session: Omit<TelegramSession, 'expiresAt'>) {
  telegramSessions.set(String(chatId), { ...session, expiresAt: Date.now() + TELEGRAM_SESSION_TTL_MS });
}

function clearTelegramSession(chatId: string | number) {
  telegramSessions.delete(String(chatId));
}

function eaTelegramMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📡 Terminal', callback_data: 'm:terminal' },
        { text: '🤖 EA Library', callback_data: 'm:library' },
      ],
      [
        { text: '🚀 Attach EA', callback_data: 'a:start' },
        { text: '📸 Screenshot', callback_data: 's:start' },
      ],
      [
        { text: '📈 Symbols', callback_data: 'm:symbols' },
        { text: '🖥 Charts', callback_data: 'm:charts' },
      ],
      [
        { text: '⚙ Runtime Config', callback_data: 'm:config' },
        { text: '⏸ Pause / ▶ Resume', callback_data: 'm:pause' },
      ],
      [
        { text: '📜 Command Log', callback_data: 'm:logs' },
        { text: '🧹 Cleanup', callback_data: 'm:cleanup' },
      ],
      [
        { text: '❓ Help', callback_data: 'm:help' },
      ],
    ],
  };
}

function eaCallbackToCommand(data: string, chatId?: string | number) {
  const map: Record<string, string> = {
    'ea:menu': 'm:home',
    'ea:status': 'm:terminal',
    'ea:library': 'm:library',
    'ea:symbols': 'm:symbols',
    'ea:charts': 'm:charts',
    'ea:config': 'm:config',
    'ea:logs': 'm:logs',
    'ea:help': 'm:help',
    'ea:cleanup_confirm': 'clean:confirm',
    'ea:attach': 'a:start',
    'ea:screenshot': 's:start',
    'ea:cleanup': 'm:cleanup',
    'ea:pause_resume': 'm:pause',
  };
  return map[data] || '';
}

async function handleTelegramCommandActionCallback(chatId: string | number, callbackData: string): Promise<{ handled: boolean; response: string; status: string; replyMarkup?: any; commandId?: string }> {
  const signalPrefix = 'sig:';
  const tradePrefix = 'trade:';
  const detailsPrefix = 'ea:cmd:details:';
  const retryPrefix = 'ea:cmd:retry:';
  const suggestPrefix = 'ea:symbol:suggest:';
  if (!callbackData.startsWith(signalPrefix) && !callbackData.startsWith(tradePrefix) && !callbackData.startsWith(detailsPrefix) && !callbackData.startsWith(retryPrefix) && !callbackData.startsWith(suggestPrefix)) {
    return { handled: false, response: '', status: 'IGNORED' };
  }

  if (callbackData.startsWith(signalPrefix)) {
    const [, action, signalId] = callbackData.split(':');
    if (!signalId) return { handled: true, response: 'Signal ID missing.', status: 'FAILED' };
    const signal = await prisma.eaSignalProposal.findUnique({ where: { id: signalId } });
    if (!signal) return { handled: true, response: 'Signal not found.', status: 'FAILED' };

    if (action === 'approve' || action === 'reject') {
      if (signal.status === 'EXPIRED' || (signal.status === 'PENDING' && signal.expiresAt && signal.expiresAt.getTime() < Date.now())) {
        const expired = signal.status === 'EXPIRED' ? signal : await prisma.eaSignalProposal.update({ where: { id: signal.id }, data: { status: 'EXPIRED' } });
        return { handled: true, response: `<b>Signal expired.</b>\n\n<code>${escapeHtml(expired.approvalCode)}</code> ${escapeHtml(expired.eaName)} ${escapeHtml(expired.symbol)} ${escapeHtml(expired.timeframe)} ${escapeHtml(expired.side)}`, status: 'FAILED' };
      }
      if (signal.status !== 'PENDING') {
        return {
          handled: true,
          response: `<b>Signal already ${escapeHtml(signal.status)}</b>\n\n<code>${escapeHtml(signal.approvalCode)}</code> ${escapeHtml(signal.eaName)} ${escapeHtml(signal.symbol)} ${escapeHtml(signal.timeframe)} ${escapeHtml(signal.side)}`,
          status: 'SUCCESS',
        };
      }
      const nextStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
      const updated = await prisma.eaSignalProposal.update({
        where: { id: signal.id },
        data: { status: nextStatus, decidedAt: new Date() },
      });
      return {
        handled: true,
        response: `<b>Signal ${escapeHtml(nextStatus)}</b>\n\n<code>${escapeHtml(updated.approvalCode)}</code> ${escapeHtml(updated.eaName)} ${escapeHtml(updated.symbol)} ${escapeHtml(updated.timeframe)} ${escapeHtml(updated.side)}`,
        status: 'SUCCESS',
      };
    }

    if (action === 'details') {
      return { handled: true, response: buildTelegramSignalCard(signal), status: 'SUCCESS', replyMarkup: buildTelegramSignalButtons(signal.id) };
    }

    if (action === 'edit') {
      setTelegramSession(chatId, {
        flow: 'signal_edit',
        step: 'field',
        data: { signalId: signal.id, approvalCode: signal.approvalCode },
      });
      return {
        handled: true,
        response: `<b>Edit Lot/Risk</b>\n\nSignal: <code>${escapeHtml(signal.approvalCode)}</code>\nReply <code>lot</code> or <code>risk</code> to choose the field to edit.`,
        status: 'WAITING_INPUT',
      };
    }

    if (action === 'screenshot') {
      const instance = signal.instanceId ? await prisma.eaInstance.findUnique({ where: { id: signal.instanceId } }) : null;
      const command = await createEaCommand({
        terminalId: instance?.terminalId,
        commandType: 'SCREENSHOT_CHART',
        source: 'TELEGRAM',
        payload: { signalId: signal.id, symbol: signal.symbol, timeframe: signal.timeframe, instanceId: signal.instanceId, hideGui: true },
      });
      return {
        handled: true,
        response: `<b>Screenshot queued</b>\n\nSignal: <code>${escapeHtml(signal.approvalCode)}</code>\nCommand: <code>${escapeHtml(shortCommandId(command.id))}</code>`,
        status: 'QUEUED',
        commandId: command.id,
      };
    }

    return { handled: true, response: 'Unknown signal action.', status: 'FAILED' };
  }

  if (callbackData.startsWith(tradePrefix)) {
    const [, action, tradeId] = callbackData.split(':');
    if (!tradeId) return { handled: true, response: 'Trade ID missing.', status: 'FAILED' };
    const trade = await prisma.liveTrade.findUnique({
      where: { id: tradeId },
      include: { tradingAccount: true },
    });
    if (!trade) return { handled: true, response: 'Trade not found.', status: 'FAILED' };
    if (action === 'details') {
      const lines = [
        `<b>${escapeHtml(trade.symbol)} ${escapeHtml(trade.side)}</b>`,
        '',
        `<b>Status:</b> ${escapeHtml(trade.status)}`,
        `<b>Lot:</b> <code>${escapeHtml(trade.lot)}</code>`,
        `<b>Entry:</b> <code>${escapeHtml(trade.entryPrice)}</code>`,
        `<b>Close:</b> <code>${escapeHtml(trade.closePrice ?? '-')}</code>`,
        `<b>SL:</b> <code>${escapeHtml(trade.stopLoss ?? '-')}</code>`,
        `<b>TP:</b> <code>${escapeHtml(trade.takeProfit ?? '-')}</code>`,
        `<b>Profit:</b> <code>${escapeHtml(trade.profit ?? '-')}</code>`,
        `<b>R:</b> <code>${escapeHtml(trade.rMultiple ?? '-')}</code>`,
        `<b>Open:</b> ${escapeHtml(trade.openTime.toISOString())}`,
        `<b>Close:</b> ${escapeHtml(trade.closeTime ? trade.closeTime.toISOString() : '-')}`,
        `<b>Account:</b> ${escapeHtml(trade.tradingAccount?.name || trade.tradingAccount?.accountNumber || '-')}`,
        `<b>Broker:</b> ${escapeHtml(trade.tradingAccount?.broker || '-')}`,
        trade.notes ? `<b>Notes:</b> ${escapeHtml(trade.notes)}` : '',
        trade.strategyTag ? `<b>Strategy:</b> ${escapeHtml(trade.strategyTag)}` : '',
        trade.emotionTag ? `<b>Emotion:</b> ${escapeHtml(trade.emotionTag)}` : '',
        trade.mistakeTag ? `<b>Mistake:</b> ${escapeHtml(trade.mistakeTag)}` : '',
      ].filter(Boolean).join('\n');
      return {
        handled: true,
        response: lines,
        status: 'SUCCESS',
      };
    }
    return { handled: true, response: 'Unknown trade action.', status: 'FAILED' };
  }

  const commandId = callbackData.startsWith(detailsPrefix)
    ? callbackData.slice(detailsPrefix.length)
    : callbackData.startsWith(retryPrefix)
      ? callbackData.slice(retryPrefix.length)
      : callbackData.slice(suggestPrefix.length);
  const command = await prisma.eaCommandQueue.findUnique({ where: { id: commandId } });
  if (!command) return { handled: true, response: `Command not found: ${fmtCode('TELEGRAM', shortCommandId(commandId))}`, status: 'FAILED' };

  if (callbackData.startsWith(detailsPrefix)) {
    const notePath = writeCommandDebugNote(command);
    await sendTelegramDocument(chatId, notePath, `<b>ReplayFX Command Debug Note</b>\nCommand: ${fmtCode('TELEGRAM', shortCommandId(command.id))}`);
    const limited = commandHasDetailedResult(command) ? '' : '\n\nController returned old/limited error format. Recompile and reattach ReplayFX_MT5_Controller.mq5.';
    return { handled: true, response: `Debug note sent for ${fmtCode('TELEGRAM', shortCommandId(command.id))}.${limited}`, status: 'SUCCESS' };
  }

  if (callbackData.startsWith(retryPrefix)) {
    const payload = command.payloadJson ? JSON.parse(command.payloadJson) : {};
    const retried = await createEaCommand({
      terminalId: command.terminalId,
      commandType: command.commandType,
      payload,
      source: 'TELEGRAM',
      requiresConfirmation: false,
    });
    return {
      handled: true,
      response: `<b>🔁 Retry queued</b>\n\nOriginal: ${fmtCode('TELEGRAM', shortCommandId(command.id))}\nNew: ${fmtCode('TELEGRAM', shortCommandId(retried.id))}`,
      status: 'QUEUED',
      commandId: retried.id,
    };
  }

  const result = command.resultJson ? JSON.parse(command.resultJson) : {};
  const payload = command.payloadJson ? JSON.parse(command.payloadJson) : {};
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
  const requested = result.requestedSymbol || payload.requestedSymbol || payload.symbol || '-';
  if (!suggestions.length) {
    const limited = commandHasDetailedResult(command) ? '' : '\n\nController returned old/limited error format. Recompile and reattach ReplayFX_MT5_Controller.mq5.';
    return {
      handled: true,
      response: `<b>🔎 Similar Symbols</b>\n\nRequested: ${fmtCode('TELEGRAM', requested)}\nNo suggestions returned by controller.${limited}`,
      status: 'SUCCESS',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📈 Symbols', callback_data: 'm:symbols' }, { text: '🏠 Menu', callback_data: 'm:home' }],
        ],
      },
    };
  }
  return {
    handled: true,
    response: `<b>🔎 Similar Symbols</b>\n\nRequested: ${fmtCode('TELEGRAM', requested)}\n${suggestions.slice(0, 10).map((s: string) => `• ${escapeHtml(s)}`).join('\n')}`,
    status: 'SUCCESS',
    replyMarkup: {
      inline_keyboard: [
        ...suggestions.slice(0, 8).map((s: string) => [{ text: s, callback_data: `q:${s.slice(0, 24)}` }]),
        [{ text: '📈 Symbols', callback_data: 'm:symbols' }, { text: '🏠 Menu', callback_data: 'm:home' }],
      ],
    },
  };
}

async function handleTelegramSession(chatId: string | number, text: string): Promise<{ response: string; status: string; commandId?: string } | null> {
  const session = getTelegramSession(chatId);
  if (!session) return null;
  const value = text.trim();
  const lower = value.toLowerCase();
  if (['cancel', '/cancel', 'back'].includes(lower)) {
    clearTelegramSession(chatId);
    return { response: 'Flow cancelled.', status: 'CANCELLED' };
  }

  if (session.flow === 'cleanup') {
    if (['yes', 'y', 'confirm'].includes(lower)) {
      clearTelegramSession(chatId);
      return createEaCommandFromIntent({ type: 'cleanup', confirmed: true }, 'TELEGRAM', String(chatId), { channel: 'TELEGRAM', confirmed: true });
    }
    return { response: 'Cleanup not confirmed. Reply <code>yes</code> to cleanup stuck commands or <code>cancel</code> to stop.', status: 'CONFIRMATION_REQUIRED' };
  }

  if (session.flow === 'signal_edit') {
    if (session.step === 'field') {
      if (!['lot', 'risk'].includes(lower)) return { response: 'Reply <code>lot</code> or <code>risk</code>.', status: 'WAITING_INPUT' };
      session.data.editField = lower;
      session.step = 'value';
      return { response: `Enter new ${lower === 'lot' ? 'lot size' : 'risk percent'} value.`, status: 'WAITING_INPUT' };
    }
    if (session.step === 'value') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return { response: 'Enter a numeric value.', status: 'WAITING_INPUT' };
      const signalId = session.data.signalId;
      const signal = signalId ? await prisma.eaSignalProposal.findUnique({ where: { id: signalId } }) : null;
      if (!signal) {
        clearTelegramSession(chatId);
        return { response: 'Signal session expired. Open the signal again.', status: 'FAILED' };
      }
      const updated = await prisma.eaSignalProposal.update({
        where: { id: signal.id },
        data: session.data.editField === 'lot' ? { lot: numeric } : { riskPercent: numeric },
      });
      clearTelegramSession(chatId);
      return { response: `<b>Signal updated</b>\n\n<code>${escapeHtml(updated.approvalCode)}</code> ${escapeHtml(session.data.editField || '')} set to <code>${escapeHtml(numeric)}</code>`, status: 'SUCCESS' };
    }
  }

  if (session.flow === 'screenshot') {
    if (session.step === 'symbol') {
      session.data.symbol = lower === 'current' ? '' : value.toUpperCase();
      session.step = 'timeframe';
      return { response: 'Select timeframe, for example <code>M1</code>, <code>M5</code>, <code>H1</code>, or <code>D1</code>.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'timeframe') {
      clearTelegramSession(chatId);
      return createEaCommandFromIntent({ type: 'screenshot', symbol: session.data.symbol || undefined, timeframe: value.toUpperCase(), hideGui: true }, 'TELEGRAM', String(chatId), { channel: 'TELEGRAM' });
    }
  }

  if (session.flow === 'attach') {
    if (session.step === 'template') {
      session.data.templateRef = value;
      session.step = 'symbol';
      return { response: 'Enter symbol, for example <code>XAUUSD</code> or <code>BTCUSD</code>.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'symbol') {
      session.data.symbol = value.toUpperCase();
      session.step = 'timeframe';
      return { response: 'Select timeframe, for example <code>M1</code>, <code>M5</code>, <code>H1</code>, or <code>D1</code>.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'timeframe') {
      session.data.timeframe = value.toUpperCase();
      session.step = 'mode';
      return { response: 'Select mode: <code>NOTIFY_ONLY</code>, <code>AUTO</code>, or <code>PAUSED</code>.', status: 'WAITING_INPUT' };
    }
    if (session.step === 'mode') {
      session.data.mode = value.toUpperCase();
      session.step = 'confirm';
      return {
        response: `<b>Confirm Attach EA</b>\n\nTemplate: <code>${session.data.templateRef}</code>\nSymbol: <code>${session.data.symbol}</code>\nTimeframe: <code>${session.data.timeframe}</code>\nMode: <code>${session.data.mode}</code>\n\nReply <code>yes</code> to queue APPLY_TEMPLATE.`,
        status: 'CONFIRMATION_REQUIRED',
      };
    }
    if (session.step === 'confirm') {
      if (!['yes', 'y', 'confirm'].includes(lower)) return { response: 'Attach not confirmed. Reply <code>yes</code> to queue it or <code>cancel</code> to stop.', status: 'CONFIRMATION_REQUIRED' };
      clearTelegramSession(chatId);
      return createEaCommandFromIntent({
        type: 'attach',
        templateRef: session.data.templateRef,
        symbol: session.data.symbol,
        timeframe: session.data.timeframe,
        mode: session.data.mode,
      }, 'TELEGRAM', String(chatId), { channel: 'TELEGRAM' });
    }
  }

  return null;
}

async function handleTelegramCommand(chatId: number | string, text: string): Promise<{ response: string; status: string; replyMarkup?: any; commandId?: string }> {
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.split(' ').slice(1).join(' ');
  let response = 'Unknown command. Send /help for available commands.';
  let status = 'EXECUTED';
  let replyMarkup: any;
  let commandId: string | undefined;

  if (BLOCKED.has(cmd)) {
    return { response: 'Remote manual trade execution is disabled for safety. Use signal approval mode instead.', status: 'REJECTED' };
  }

  try {
    if (cmd === '/start' || cmd === '/menu' || text.trim().toLowerCase() === 'menu') {
      const guided = await handleEaBotInput('TELEGRAM', String(chatId), { text: 'menu' });
      return { response: guided.response, status: guided.status, replyMarkup: guided.replyMarkup, commandId: guided.commandId };
    }
    if (text === '__FLOW_ATTACH__') {
      return { response: '<b>Attach EA</b>\n\nEnter EA template name or number, for example <code>ERS</code>.', status: 'WAITING_INPUT' };
    }
    if (text === '__FLOW_SCREENSHOT__') {
      return { response: '<b>Screenshot Chart</b>\n\nEnter a symbol like <code>BTCUSD</code>, or type <code>current</code> for the current controller chart.', status: 'WAITING_INPUT' };
    }
    if (text === '__FLOW_CLEANUP__') {
      return { response: '<b>Cleanup Stuck Commands</b>\n\nThis cancels queued/executing EA-control commands for the active terminal. Reply <code>yes</code> to confirm.', status: 'CONFIRMATION_REQUIRED' };
    }

    const sessionResult = await handleTelegramSession(chatId, text);
    if (sessionResult) return sessionResult;

    if (cmd === '/help') {
      const guided = await handleEaBotInput('TELEGRAM', String(chatId), { text: 'help' });
      response = guided.response;
      status = guided.status;
      replyMarkup = guided.replyMarkup;
    } else if (cmd === '/signals') {
      const signals = await prisma.eaSignalProposal.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10 });
      const pending = buildTelegramPendingSignalsList(signals);
      response = pending.text;
      replyMarkup = pending.replyMarkup;
      status = 'SUCCESS';
    } else if (['/status', '/symbols', '/charts', '/cleanup', '/logs'].includes(cmd) || ['status', 'symbols', 'charts', 'cleanup', 'logs', 'list ea', 'config'].includes(text.trim().toLowerCase())) {
      const ea = await handleEaBotInput('TELEGRAM', String(chatId), { text: text.replace(/^\//, '') });
      response = ea.response;
      status = ea.status;
      replyMarkup = ea.replyMarkup;
      if (ea.commandId) commandId = ea.commandId;
    } else if (cmd === '/status') {
      const accounts = await prisma.tradingAccount.count({ where: { status: 'Active' } });
      const open = await prisma.liveTrade.count({ where: { status: 'OPEN' } });
      response = `🟢 <b>Server Online</b>\nActive accounts: ${accounts}\nOpen trades: ${open}`;
    } else if (cmd === '/balance' || cmd === '/equity') {
      const accounts = await prisma.tradingAccount.findMany({ where: { status: 'Active' }, take: 10 });
      response = accounts.length === 0 ? 'No active accounts.' :
        accounts.map(a => `<b>${a.name}</b>\nBalance: $${a.currentBalance}\nEquity: $${a.currentEquity ?? a.currentBalance}`).join('\n\n');
    } else if (cmd === '/today') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const trades = await prisma.liveTrade.findMany({ where: { status: 'CLOSED', closeTime: { gte: start } } });
      const pnl = trades.reduce((s, t) => s + (t.profit || 0), 0);
      response = `<b>Today's Profit:</b> $${pnl.toFixed(2)} (${trades.length} trades)`;
    } else if (cmd === '/open_trades') {
      const trades = await prisma.liveTrade.findMany({ where: { status: 'OPEN' }, take: 20 });
      response = trades.length === 0 ? 'No open trades.' : trades.map(t => `${t.symbol} ${t.side} ${t.lot}L @ ${t.entryPrice}`).join('\n');
    } else if (cmd === '/last_trade') {
      const t = await prisma.liveTrade.findFirst({ where: { status: 'CLOSED' }, orderBy: { closeTime: 'desc' } });
      response = t ? `<b>Last Trade</b>\n${t.symbol} ${t.side} ${t.lot}L\nProfit: $${(t.profit || 0).toFixed(2)}` : 'No closed trades.';
    } else if (cmd === '/pending' || cmd === '/detail' || cmd === '/acc' || cmd === '/reject') {
      const review = await handleSetupReviewCommand(text, 'TELEGRAM');
      if (review.handled) {
        response = review.response;
        status = review.status === 'IGNORED' ? 'SUCCESS' : review.status;
        await logIntegration('TELEGRAM', 'TELEGRAM_REVIEW_COMMAND', status === 'REJECTED' ? 'WARNING' : 'INFO', `Review command: ${cmd}`, { chatId, command: cmd, args });
      }
      if (!review.handled || (cmd === '/reject' && /^\s*\/reject\s+SIG/i.test(text))) {
        const ea = await handleEaControlCommand(text, 'TELEGRAM', String(chatId));
        if (ea.handled) {
          response = ea.response;
          status = ea.status;
          if (ea.commandId) commandId = ea.commandId;
        }
      }
    } else {
      const ea = await handleEaControlCommand(text, 'TELEGRAM', String(chatId));
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

  return { response, status, replyMarkup, commandId };
}

async function processUpdates(updates: any[]): Promise<number> {
  const cfg = await getTelegramConfig();
  const allowed = cfg.chatIds ? cfg.chatIds.split(',').map(s => s.trim()).filter(Boolean) : [];
  let processed = 0;

  for (const u of updates) {
    await logIntegration('TELEGRAM', 'TELEGRAM_UPDATE_RECEIVED', 'INFO', 'Telegram update received', {
      updateId: u?.update_id,
      hasMessage: !!u?.message,
      chatId: u?.message?.chat?.id ?? null,
      hasText: !!u?.message?.text
    });
    lastUpdateReceivedAt = new Date().toISOString();

    const msg = u?.message;
    const callback = u?.callback_query;
    const msgOrCallbackMessage = callback?.message || u?.message;
    if (!msgOrCallbackMessage?.chat?.id) continue;
    const chatId = msgOrCallbackMessage.chat.id;
    const callbackData = callback?.data ? String(callback.data) : '';
    const callbackCommand = callbackData ? eaCallbackToCommand(callbackData, chatId) : '';
    const text: string = callbackCommand || callbackData || String(u?.message?.text || '').trim();
    if (!text) continue;
    const lowerText = text.toLowerCase();
    const hasSession = !!getTelegramSession(chatId) || !!getEaSession('TELEGRAM', String(chatId));
    if (!callbackData && !callbackCommand && !hasSession && !text.startsWith('/') && lowerText !== 'menu' && lowerText !== 'help' && lowerText !== 'status' && lowerText !== 'signals' && lowerText !== 'symbols' && lowerText !== 'charts' && lowerText !== 'cleanup' && lowerText !== 'logs' && lowerText !== 'yes' && lowerText !== 'cancel' && lowerText !== 'list ea' && !lowerText.startsWith('symbols ') && !lowerText.startsWith('attach ') && !lowerText.startsWith('screenshot ') && !lowerText.startsWith('set ') && !lowerText.startsWith('pause ') && !lowerText.startsWith('resume ') && lowerText !== 'cancel pending' && lowerText !== 'list terminals' && lowerText !== 'active eas') continue;

    const isAllowed = allowed.includes(String(chatId));
    if (!isAllowed) {
      await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: text.split(' ')[0], status: 'REJECTED', response: 'Unauthorized chat ID' } });
      await logIntegration('TELEGRAM', 'TELEGRAM_COMMAND_REJECTED', 'WARNING', 'Command rejected - chat id not allowed', {
        chatId,
        command: text.split(' ')[0],
        allowedChatIdsCount: allowed.length
      });
      lastCommandText = text.split(' ')[0].toLowerCase();
      lastCommandStatus = 'REJECTED';
      continue;
    }

    if (!callbackData && hasSession && !text.startsWith('/')) {
      const sessionResult = await handleEaBotInput('TELEGRAM', String(chatId), { text });
      if (sessionResult) {
        const { response, status, replyMarkup, commandId } = sessionResult;
        let sendError: string | null = null;
        try {
          await sendTelegramMessage(chatId, response, replyMarkup);
        } catch (err: any) {
          sendError = err.message;
          pollingLastError = err.message;
          await logIntegration('TELEGRAM', 'TELEGRAM_SEND_MESSAGE_FAILED', 'ERROR', err.message, { chatId, command: text.split(' ')[0] });
        }
        if (commandId && ['QUEUED', 'WAITING_CONTROLLER', 'BLOCKED_BY_ACTIVE_COMMAND'].includes(status)) {
          startCommandWatcher(commandId, 'TELEGRAM', { chatId: String(chatId) });
        }
        await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: text.split(' ')[0], args: text.split(' ').slice(1).join(' ') || null, status, response } });
        lastCommandText = text.split(' ')[0].toLowerCase();
        lastCommandStatus = status;
        processed++;
        continue;
      }
    }

    const cmd = text.split(' ')[0].toLowerCase();
    await logIntegration('TELEGRAM', 'TELEGRAM_UPDATE_RECEIVED', 'INFO', 'Telegram command parsed', { chatId, command: cmd });

    const commandAction = callbackData ? await handleTelegramCommandActionCallback(chatId, callbackData) : null;
    const result = commandAction?.handled
      ? commandAction
      : callbackData
        ? await handleEaBotInput('TELEGRAM', String(chatId), { callbackData: callbackCommand || callbackData })
        : isEaBotText(text)
          ? await handleEaBotInput('TELEGRAM', String(chatId), { text })
          : await handleTelegramCommand(chatId, text);
    const { response, status, replyMarkup, commandId } = result;
    let sendError: string | null = null;
    try {
      await sendTelegramMessage(chatId, response, replyMarkup);
    } catch (err: any) {
      sendError = err.message;
      pollingLastError = err.message;
      await logIntegration('TELEGRAM', 'TELEGRAM_SEND_MESSAGE_FAILED', 'ERROR', err.message, { chatId, command: cmd });
    }

    if (commandId && ['QUEUED', 'WAITING_CONTROLLER', 'BLOCKED_BY_ACTIVE_COMMAND'].includes(status)) {
      startCommandWatcher(commandId, 'TELEGRAM', { chatId: String(chatId) });
    }

    await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: cmd, args: text.split(' ').slice(1).join(' ') || null, status, response } });
    const statusLabel = status === 'QUEUED' ? 'QUEUED' : status === 'REJECTED' ? 'REJECTED' : status === 'FAILED' ? 'FAILED' : status === 'SUCCESS' ? 'SUCCESS' : 'PROCESSED';
    await logIntegration(
      'TELEGRAM',
      status === 'REJECTED' ? 'TELEGRAM_COMMAND_REJECTED' : 'TELEGRAM_COMMAND_PROCESSED',
      status === 'FAILED' || sendError ? 'ERROR' : status === 'REJECTED' ? 'WARNING' : 'INFO',
      status === 'REJECTED' ? `Rejected: ${cmd}` : status === 'QUEUED' ? `Queued: ${cmd}` : `Processed: ${cmd}`,
      { chatId, status: statusLabel, sendMessage: sendError ? 'failed' : 'success', sendError }
    );
    lastCommandText = cmd;
    lastCommandStatus = status;
    processed++;
  }
  return processed;
}

async function getUpdatesFromTelegram(token: string, offset: number): Promise<any[]> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset, timeout: 0, allowed_updates: ['message', 'callback_query'] })
  });
  const data = await res.json() as any;
  if (!data.ok) throw new Error(data.description || 'getUpdates failed');
  return Array.isArray(data.result) ? data.result : [];
}

async function getLastUpdateId(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: 'telegram:lastUpdateId' } });
  return s?.value ? Number(s.value) : 0;
}

async function saveLastUpdateId(id: number) {
  await prisma.systemSetting.upsert({
    where: { key: 'telegram:lastUpdateId' },
    create: { key: 'telegram:lastUpdateId', value: String(id) },
    update: { value: String(id) }
  });
}

// ─── Long Polling Worker ───────────────────────────────────────────────────

let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let pollingRunning = false;
let pollingStartedAt: string | null = null;
let lastPollAt: string | null = null;
let pollingLastError: string | null = null;
let lastCommandText: string | null = null;
let lastCommandStatus: string | null = null;
let lastUpdateReceivedAt: string | null = null;

async function doPollCycle() {
  if (!pollingRunning) return;
  try {
    const cfg = await getTelegramConfig();
    if (!cfg.botToken || !cfg.enabled) {
      pollingRunning = false;
      pollingLastError = 'Telegram bot token missing or integration disabled';
      await logIntegration('TELEGRAM', 'TELEGRAM_POLL_TICK', 'ERROR', pollingLastError);
      return;
    }
    lastPollAt = new Date().toISOString();
    const lastId = await getLastUpdateId();
    const updates = await getUpdatesFromTelegram(cfg.botToken, lastId + 1);
    await logIntegration('TELEGRAM', 'TELEGRAM_POLL_TICK', 'INFO', `Poll tick completed with ${updates.length} update(s)`, {
      offset: lastId + 1,
      updatesFound: updates.length
    });
    if (updates.length > 0) {
      const maxId = Math.max(...updates.map((u: any) => u.update_id));
      await processUpdates(updates);
      await saveLastUpdateId(maxId);
    }
    pollingLastError = null;
  } catch (err: any) {
    pollingLastError = err.message;
    await logIntegration('TELEGRAM', 'TELEGRAM_POLL_TICK', 'ERROR', err.message);
    // Don't crash — log and continue
  }
  if (pollingRunning) pollingTimer = setTimeout(doPollCycle, 3000);
}

function startPollingWorker() {
  if (pollingRunning) return false;
  pollingRunning = true;
  pollingStartedAt = new Date().toISOString();
  doPollCycle();
  return true;
}

function stopPollingWorker() {
  if (!pollingRunning) return false;
  pollingRunning = false;
  if (pollingTimer) { clearTimeout(pollingTimer); pollingTimer = null; }
  return true;
}

// ─── Routes ───────────────────────────────────────────────────────────────

router.get('/status', async (req: Request, res: Response) => {
  const cfg = await getTelegramConfig();
  const chatIds = cfg.chatIds ? cfg.chatIds.split(',').map(c => c.trim()).filter(Boolean) : [];
  const lastId = await getLastUpdateId();
  const lastCmd = await prisma.commandLog.findFirst({ where: { source: 'TELEGRAM' }, orderBy: { createdAt: 'desc' } });
  res.json({
    configured: cfg.enabled && !!cfg.botToken,
    enabled: cfg.enabled,
    botTokenPresent: !!cfg.botToken,
    allowedChatIdsCount: chatIds.length,
    pollingRunning,
    lastPollAt,
    lastCommand: lastCommandText || lastCmd?.command || null,
    lastCommandStatus: lastCommandStatus || lastCmd?.status || null,
    lastError: pollingLastError,
    lastUpdateId: lastId
  });
});

router.get('/debug', async (req: Request, res: Response) => {
  try {
    const cfg = await getTelegramConfig();
    const chatIds = cfg.chatIds ? cfg.chatIds.split(',').map(c => c.trim()) : [];
    const maskedIds = chatIds.map(id => id.length > 4 ? `${id.slice(0, id.length - 4)}****` : '****');
    const lastCmd = await prisma.commandLog.findFirst({ where: { source: 'TELEGRAM' }, orderBy: { createdAt: 'desc' } });
    const lastErr = await prisma.integrationLog.findFirst({ where: { source: 'TELEGRAM', status: 'ERROR' }, orderBy: { createdAt: 'desc' } });
    const lastId = await getLastUpdateId();
    res.json({
      configured: cfg.enabled && !!cfg.botToken,
      botTokenPresent: !!cfg.botToken,
      allowedChatIdsCount: chatIds.length,
      allowedChatIds: maskedIds,
      webhookSecretPresent: !!cfg.webhookSecret,
      pollingRunning,
      pollingStartedAt,
      lastPollAt,
      lastUpdateReceivedAt,
      lastUpdateId: lastId,
      lastCommand: lastCommandText || lastCmd?.command || null,
      lastCommandStatus: lastCommandStatus || lastCmd?.status || null,
      lastCommandAt: lastCmd?.createdAt || null,
      lastError: pollingLastError || (lastErr?.message ?? null)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = await getTelegramConfig();
    if (!cfg.botToken || !cfg.enabled) return res.status(400).json({ ok: false, error: 'Telegram not configured or enabled' });
    const first = cfg.chatIds.split(',')[0]?.trim();
    if (!first) return res.status(400).json({ ok: false, error: 'No allowed chat IDs configured' });
    await sendTelegramMessage(first, '🟢 <b>ReplayFX Test Message</b>\n\nThis is a test notification from your ReplayFX Journal server.');
    await logIntegration('TELEGRAM', 'TELEGRAM_SEND_TEST_SUCCESS', 'SUCCESS', 'Test message sent', { chatId: first });
    res.json({ ok: true, message: 'Test message sent' });
  } catch (err: any) {
    await logIntegration('TELEGRAM', 'TELEGRAM_SEND_TEST_FAILED', 'ERROR', err.message);
    next(err);
  }
});

router.post('/poll-once', async (req: Request, res: Response) => {
  try {
    const cfg = await getTelegramConfig();
    if (!cfg.botToken || !cfg.enabled) return res.status(400).json({ ok: false, error: 'Telegram bot token is not configured or Telegram is disabled' });
    if (!cfg.chatIds.split(',').map(c => c.trim()).filter(Boolean).length) return res.status(400).json({ ok: false, error: 'Allowed Chat IDs are not configured' });

    await logIntegration('TELEGRAM', 'TELEGRAM_POLL_ONCE_STARTED', 'INFO', 'poll-once started');

    const lastId = await getLastUpdateId();
    const updates = await getUpdatesFromTelegram(cfg.botToken, lastId + 1);
    const maxId = updates.length > 0 ? Math.max(...updates.map((u: any) => u.update_id)) : lastId;
    const processed = await processUpdates(updates);
    if (maxId > lastId) await saveLastUpdateId(maxId);

    return res.json({ ok: true, updatesFound: updates.length, processed, lastUpdateId: maxId });
  } catch (err: any) {
    await logIntegration('TELEGRAM', 'TELEGRAM_POLL_ONCE_STARTED', 'ERROR', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/start-polling', async (req: Request, res: Response) => {
  try {
    const cfg = await getTelegramConfig();
    if (!cfg.enabled) return res.status(400).json({ ok: false, error: 'Telegram integration is disabled' });
    if (!cfg.botToken) return res.status(400).json({ ok: false, error: 'Telegram bot token is missing' });
    if (!cfg.chatIds.split(',').map(c => c.trim()).filter(Boolean).length) return res.status(400).json({ ok: false, error: 'Allowed Chat IDs are missing' });

    // Delete webhook first to avoid conflict
    try {
      await fetch(`https://api.telegram.org/bot${cfg.botToken}/deleteWebhook`, { method: 'POST' });
    } catch (err: any) {
      await logIntegration('TELEGRAM', 'TELEGRAM_START_POLLING', 'WARNING', `Could not delete webhook before polling: ${err.message}`);
    }

    const started = startPollingWorker();
    await logIntegration('TELEGRAM', 'TELEGRAM_START_POLLING', 'INFO', started ? 'Long polling started' : 'Already running');
    return res.json({ ok: true, message: started ? 'Long polling started' : 'Already running', pollingRunning: true, pollingStartedAt });
  } catch (err: any) {
    await logIntegration('TELEGRAM', 'TELEGRAM_START_POLLING', 'ERROR', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/stop-polling', async (req: Request, res: Response) => {
  const stopped = stopPollingWorker();
  await logIntegration('TELEGRAM', 'TELEGRAM_STOP_POLLING', 'INFO', stopped ? 'Polling stopped' : 'Was not running');
  return res.json({ ok: true, message: stopped ? 'Polling stopped' : 'Was not running', pollingRunning: false });
});

router.post('/set-webhook', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    const cfg = await getTelegramConfig();
    if (!cfg.botToken) return res.status(400).json({ ok: false, error: 'Bot token missing' });
    if (!url || !url.startsWith('https://')) return res.status(400).json({ ok: false, error: 'Valid HTTPS URL required' });
    const webhookUrl = `${url.replace(/\/$/, '')}/api/integrations/telegram/webhook/${cfg.webhookSecret}`;
    const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl })
    });
    const data = await r.json() as any;
    if (!data.ok) return res.status(500).json({ ok: false, error: data.description });
    await logIntegration('TELEGRAM', 'SET_WEBHOOK', 'SUCCESS', 'Webhook set', { webhookUrl });
    res.json({ ok: true, message: 'Webhook set', webhookUrl });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/delete-webhook', async (req: Request, res: Response) => {
  try {
    const cfg = await getTelegramConfig();
    if (!cfg.botToken) return res.status(400).json({ ok: false, error: 'Bot token missing' });
    const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/deleteWebhook`, { method: 'POST' });
    const data = await r.json() as any;
    res.json({ ok: data.ok, message: data.description || 'Webhook deleted' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/webhook/:secret', async (req: Request, res: Response) => {
  try {
    const cfg = await getTelegramConfig();
    if (!cfg.webhookSecret || req.params.secret !== cfg.webhookSecret) return res.status(403).send('Forbidden');
    const { message, callback_query: callback } = req.body;
    const msgOrCallbackMessage = callback?.message || message;
    if (!msgOrCallbackMessage?.chat) return res.status(200).send('OK');

    const chatId = msgOrCallbackMessage.chat.id;
    const callbackData = callback?.data ? String(callback.data) : '';
    const callbackCommand = callbackData ? eaCallbackToCommand(callbackData, chatId) : '';
    const text = callbackCommand || callbackData || String(message?.text || '').trim();
    if (!text) return res.status(200).send('OK');
    const allowed = cfg.chatIds ? cfg.chatIds.split(',').map(s => s.trim()) : null;

    if (allowed && !allowed.includes(String(chatId))) {
      await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: text.split(' ')[0], status: 'REJECTED', response: 'Unauthorized' } });
      return res.status(200).send('OK');
    }

    const lowerText = text.toLowerCase();
    const hasSession = !!getTelegramSession(chatId) || !!getEaSession('TELEGRAM', String(chatId));
    if (!callbackData && !callbackCommand && !hasSession && !text.startsWith('/') && lowerText !== 'menu' && lowerText !== 'help' && lowerText !== 'status' && lowerText !== 'signals' && lowerText !== 'symbols' && lowerText !== 'charts' && lowerText !== 'cleanup' && lowerText !== 'logs' && lowerText !== 'yes' && lowerText !== 'cancel' && lowerText !== 'list ea' && !lowerText.startsWith('symbols ') && !lowerText.startsWith('attach ') && !lowerText.startsWith('screenshot ') && !lowerText.startsWith('set ') && !lowerText.startsWith('pause ') && !lowerText.startsWith('resume ')) return res.status(200).send('OK');

    const commandAction = callbackData ? await handleTelegramCommandActionCallback(chatId, callbackData) : null;
    const result = commandAction?.handled
      ? commandAction
      : callbackData
        ? await handleEaBotInput('TELEGRAM', String(chatId), { callbackData: callbackCommand || callbackData })
        : isEaBotText(text)
          ? await handleEaBotInput('TELEGRAM', String(chatId), { text })
          : await handleTelegramCommand(chatId, text);
    const { response, status, replyMarkup, commandId } = result;
    try {
      await sendTelegramMessage(chatId, response, replyMarkup);
    } catch {}

    if (commandId && ['QUEUED', 'WAITING_CONTROLLER', 'BLOCKED_BY_ACTIVE_COMMAND'].includes(status)) {
      startCommandWatcher(commandId, 'TELEGRAM', { chatId: String(chatId) });
    }

    await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: text.split(' ')[0].toLowerCase(), args: text.split(' ').slice(1).join(' ') || null, status, response } });
    return res.status(200).send('OK');
  } catch {
    return res.status(200).send('OK');
  }
});

export default router;
