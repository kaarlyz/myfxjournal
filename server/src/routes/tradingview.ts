import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { baileysService } from '../services/baileysService';
import {
  approveSetup,
  createTradingViewSetup,
  formatSetupSummary,
  getSetupOrThrow,
  listApprovedSetups,
  listSetups,
  markSetupExecuted,
  rejectSetup,
} from '../services/setupReviewService';
import { logIntegration } from '../utils/logger';

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
  } catch {
    return text;
  }
}

function absoluteUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  const base = process.env.PUBLIC_BACKEND_URL || process.env.APP_PUBLIC_URL || '';
  return base ? `${base.replace(/\/$/, '')}${pathOrUrl}` : pathOrUrl;
}

function toPublicSetup(setup: any) {
  return {
    ...setup,
    payload: setup.payload ? JSON.parse(setup.payload) : null,
    previewUrl: setup.previewUrl,
    previewAbsoluteUrl: absoluteUrl(setup.previewUrl),
  };
}

async function getSecretToken() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'secretToken' } });
  return setting?.value || '';
}

async function validateBridgeSecret(req: Request) {
  const secret = await getSecretToken();
  const auth = req.header('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = bearer || req.header('x-replayfx-secret') || (typeof req.query.secret === 'string' ? req.query.secret : '');
  return !!secret && provided === secret;
}

async function sendTelegramSetup(setup: any) {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['telegram_enabled', 'telegram_bot_token', 'telegram_chat_ids'] } },
  });
  const map: Record<string, string> = {};
  rows.forEach(r => (map[r.key] = r.value));
  if (map.telegram_enabled !== 'true') return;

  const token = decrypt(map.telegram_bot_token || '');
  const chatIds = (map.telegram_chat_ids || '').split(',').map(c => c.trim()).filter(Boolean);
  if (!token || chatIds.length === 0) return;

  const preview = absoluteUrl(setup.previewUrl);
  const reviewLink = absoluteUrl(`/setup-review?setupId=${setup.id}`);
  const text = [
    'Momentum Candle Review',
    formatSetupSummary(setup),
    preview && preview.startsWith('http') ? `Preview: ${preview}` : null,
    reviewLink && reviewLink.startsWith('http') ? `Review page: ${reviewLink}` : null,
  ].filter(Boolean).join('\n\n');

  for (const chatId of chatIds) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      await logIntegration('TELEGRAM', 'TELEGRAM_SETUP_SENT', 'SUCCESS', `Setup sent to Telegram chat ${chatId}`, { setupId: setup.id });
    } catch (err: any) {
      await logIntegration('TELEGRAM', 'TELEGRAM_SETUP_SENT', 'ERROR', err.message, { setupId: setup.id, chatId });
    }
  }
}

async function sendWhatsAppSetup(setup: any) {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['whatsapp_enabled', 'whatsapp_provider', 'whatsapp_allowed_numbers', 'whatsapp_self_commands_enabled'] } },
  });
  const map: Record<string, string> = {};
  rows.forEach(r => (map[r.key] = r.value));
  if (map.whatsapp_enabled !== 'true' || (map.whatsapp_provider || 'BAILEYS') !== 'BAILEYS') return;
  if (!baileysService.getIsConnected()) return;

  const state = baileysService.getFullState();
  const allowed = (map.whatsapp_allowed_numbers || '').split(',').map(n => n.trim()).filter(Boolean);
  const targets = new Set<string>(allowed);
  if (map.whatsapp_self_commands_enabled === 'true' && state.phoneNumber) targets.add(state.phoneNumber);
  if (targets.size === 0) return;

  const preview = absoluteUrl(setup.previewUrl);
  const text = [
    '*Momentum Candle Review*',
    formatSetupSummary(setup).replace(/\//g, '/'),
    preview && preview.startsWith('http') ? `Preview: ${preview}` : null,
  ].filter(Boolean).join('\n\n');

  for (const target of targets) {
    const sent = await baileysService.sendMessage(target, text);
    await logIntegration(
      'WHATSAPP_BAILEYS',
      'WHATSAPP_SETUP_SENT',
      sent ? 'SUCCESS' : 'ERROR',
      sent ? `Setup sent to WhatsApp ${target}` : `Failed to send setup to WhatsApp ${target}`,
      { setupId: setup.id, target }
    );
  }
}

async function notifyReviewChannels(setup: any) {
  await Promise.allSettled([sendTelegramSetup(setup), sendWhatsAppSetup(setup)]);
}

function sendRouteError(res: Response, error: any) {
  const status = error.statusCode || 500;
  return res.status(status).json({ ok: false, error: error.message || 'Internal Server Error' });
}

router.get('/status', async (req: Request, res: Response) => {
  try {
    const secret = await getSecretToken();
    const setups = await listSetups('ALL');
    const pending = setups.filter((s: any) => s.status === 'PENDING_REVIEW').length;
    const approved = setups.filter((s: any) => s.status === 'APPROVED').length;
    return res.json({
      ok: true,
      configured: !!secret,
      webhookPath: '/api/integrations/tradingview/webhook',
      totalSetups: setups.length,
      pending,
      approved,
    });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.get('/events', async (req: Request, res: Response) => {
  try {
    const setups = await listSetups('ALL');
    return res.json({ ok: true, events: setups.slice(0, 25).map(toPublicSetup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.post('/test-event', async (req: Request, res: Response) => {
  try {
    const secret = await getSecretToken();
    const setup = await createTradingViewSetup({
      secret,
      source: 'tradingview',
      strategy: 'Momentum Candle',
      symbol: req.body?.symbol || 'XAUUSD',
      timeframe: req.body?.timeframe || 'M15',
      side: req.body?.side || 'BUY',
      price: req.body?.price || 4317.2,
      sl: req.body?.sl || 4310,
      tp: req.body?.tp || 4330,
      bodySize: req.body?.bodySize || 7.2,
      volume: req.body?.volume || 12800,
      reason: req.body?.reason || 'Test Momentum candle formed',
      chartUrl: req.body?.chartUrl || '',
      alertTime: new Date().toISOString(),
    });
    await notifyReviewChannels(setup);
    return res.status(201).json({ ok: true, setup: toPublicSetup(setup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const secret = await getSecretToken();
    if (!req.body?.secret || req.body.secret !== secret) {
      await logIntegration('TRADINGVIEW', 'TRADINGVIEW_SETUP_RECEIVED', 'WARNING', 'Rejected TradingView setup webhook: invalid secret');
      return res.status(401).json({ ok: false, error: 'Invalid secret' });
    }

    const setup = await createTradingViewSetup(req.body);
    await notifyReviewChannels(setup);
    return res.status(201).json({ ok: true, setup: toPublicSetup(setup) });
  } catch (error: any) {
    await logIntegration('TRADINGVIEW', 'TRADINGVIEW_SETUP_RECEIVED', 'ERROR', error.message);
    return sendRouteError(res, error);
  }
});

router.get('/setups', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const setups = await listSetups(status);
    return res.json({ ok: true, setups: setups.map(toPublicSetup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.get('/setups/:id', async (req: Request, res: Response) => {
  try {
    const setup = await getSetupOrThrow(req.params.id);
    return res.json({ ok: true, setup: toPublicSetup(setup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.post('/setups/:id/approve', async (req: Request, res: Response) => {
  try {
    const setup = await approveSetup(req.params.id, req.body?.reviewSource || 'WEB', req.body?.reviewNote);
    return res.json({ ok: true, setup: toPublicSetup(setup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.post('/setups/:id/reject', async (req: Request, res: Response) => {
  try {
    const setup = await rejectSetup(req.params.id, req.body?.reviewSource || 'WEB', req.body?.reviewNote);
    return res.json({ ok: true, setup: toPublicSetup(setup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.get('/approved-setups', async (req: Request, res: Response) => {
  try {
    if (!(await validateBridgeSecret(req))) return res.status(401).json({ ok: false, error: 'Invalid secret' });
    const setups = await listApprovedSetups();
    return res.json({ ok: true, setups: setups.map(toPublicSetup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

router.post('/setups/:id/mark-executed', async (req: Request, res: Response) => {
  try {
    if (!(await validateBridgeSecret(req))) return res.status(401).json({ ok: false, error: 'Invalid secret' });
    const setup = await markSetupExecuted(req.params.id, req.body?.reviewSource || 'EA');
    await logIntegration('TRADINGVIEW', 'SETUP_EXECUTED', 'SUCCESS', `Setup marked executed: ${setup.id}`, { setupId: setup.id });
    return res.json({ ok: true, setup: toPublicSetup(setup) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

export default router;
