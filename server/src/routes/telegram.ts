import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import crypto from 'crypto';
import { logIntegration } from '../utils/logger';
import { handleSetupReviewCommand } from '../services/setupReviewService';

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

async function sendTelegramMessage(chatId: string | number, text: string) {
  const cfg = await getTelegramConfig();
  if (!cfg.botToken) throw new Error('Telegram bot token not configured');
  const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body || res.statusText}`);
  }
}

const BLOCKED = new Set(['/buy', '/sell', '/close_all', '/modify_sl', '/modify_tp']);

async function handleTelegramCommand(chatId: number | string, text: string): Promise<{ response: string; status: string }> {
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.split(' ').slice(1).join(' ');
  let response = 'Unknown command. Send /help for available commands.';
  let status = 'EXECUTED';

  if (BLOCKED.has(cmd)) {
    return { response: 'Remote trading execution is disabled.', status: 'REJECTED' };
  }

  try {
    if (cmd === '/help' || cmd === '/start') {
      response = `<b>ReplayFX Command Center</b>\n\n/status\n/balance\n/equity\n/today\n/open_trades\n/last_trade\n/pending\n/detail &lt;setupId&gt;\n/acc &lt;setupId&gt;\n/reject &lt;setupId&gt;\n/help`;
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
        status = review.status === 'IGNORED' ? 'EXECUTED' : review.status;
        await logIntegration('TELEGRAM', 'TELEGRAM_REVIEW_COMMAND', status === 'REJECTED' ? 'WARNING' : 'INFO', `Review command: ${cmd}`, { chatId, command: cmd, args });
      }
    }
  } catch (err: any) {
    response = err.message || 'Error executing command.';
    status = 'FAILED';
  }

  return { response, status };
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
    if (!msg?.text || !msg?.chat?.id) continue;
    const chatId = msg.chat.id;
    const text: string = msg.text.trim();
    if (!text.startsWith('/')) continue;

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

    const cmd = text.split(' ')[0].toLowerCase();
    await logIntegration('TELEGRAM', 'TELEGRAM_UPDATE_RECEIVED', 'INFO', 'Telegram command parsed', { chatId, command: cmd });

    const { response, status } = await handleTelegramCommand(chatId, text);
    let sendError: string | null = null;
    try {
      await sendTelegramMessage(chatId, response);
    } catch (err: any) {
      sendError = err.message;
      pollingLastError = err.message;
      await logIntegration('TELEGRAM', 'TELEGRAM_SEND_MESSAGE_FAILED', 'ERROR', err.message, { chatId, command: cmd });
    }

    await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: cmd, args: text.split(' ').slice(1).join(' ') || null, status, response } });
    await logIntegration(
      'TELEGRAM',
      status === 'REJECTED' ? 'TELEGRAM_COMMAND_REJECTED' : 'TELEGRAM_COMMAND_EXECUTED',
      status === 'FAILED' || sendError ? 'ERROR' : status === 'REJECTED' ? 'WARNING' : 'INFO',
      status === 'REJECTED' ? `Rejected: ${cmd}` : `Executed: ${cmd}`,
      { chatId, status, sendMessage: sendError ? 'failed' : 'success', sendError }
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
    body: JSON.stringify({ offset, timeout: 0, allowed_updates: ['message'] })
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
    const { message } = req.body;
    if (!message?.text || !message?.chat) return res.status(200).send('OK');

    const chatId = message.chat.id;
    const text = message.text.trim();
    const allowed = cfg.chatIds ? cfg.chatIds.split(',').map(s => s.trim()) : null;

    if (allowed && !allowed.includes(String(chatId))) {
      await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: text.split(' ')[0], status: 'REJECTED', response: 'Unauthorized' } });
      return res.status(200).send('OK');
    }

    if (!text.startsWith('/')) return res.status(200).send('OK');

    const { response, status } = await handleTelegramCommand(chatId, text);
    try { await sendTelegramMessage(chatId, response); } catch {}
    await prisma.commandLog.create({ data: { source: 'TELEGRAM', senderId: String(chatId), command: text.split(' ')[0].toLowerCase(), args: text.split(' ').slice(1).join(' ') || null, status, response } });
    return res.status(200).send('OK');
  } catch {
    return res.status(200).send('OK');
  }
});

export default router;
