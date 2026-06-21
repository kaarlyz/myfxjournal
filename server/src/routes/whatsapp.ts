import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { baileysService } from '../services/baileysService';
import { logIntegration } from '../utils/logger';

const router = Router();

// GET /status (Cloud or Baileys depending on setting)
router.get('/status', async (req: Request, res: Response) => {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['whatsapp_enabled', 'whatsapp_provider'] } }
  });
  const map: Record<string, string> = {};
  settings.forEach(s => (map[s.key] = s.value));

  const enabled = map['whatsapp_enabled'] === 'true';
  const provider = map['whatsapp_provider'] || 'BAILEYS';

  if (!enabled) return res.json({ configured: false, message: 'WhatsApp is not enabled' });

  if (provider === 'BAILEYS') {
    const fullState = await baileysService.getStatusState();
    return res.json({ configured: fullState.connected, message: fullState.connected ? 'Baileys Connected' : 'Waiting', baileys: fullState });
  }

  const cloudToken = await prisma.systemSetting.findUnique({ where: { key: 'whatsapp_cloud_token' } });
  return res.json({ configured: !!cloudToken?.value, message: cloudToken?.value ? 'Cloud API configured' : 'Cloud API missing token' });
});

// GET /baileys/status
router.get('/baileys/status', async (req: Request, res: Response) => {
  const fullState = await baileysService.getStatusState();
  return res.json({ ok: true, ...fullState });
});

// GET /baileys/debug
router.get('/baileys/debug', async (req: Request, res: Response) => {
  try {
    return res.json(await baileysService.getDebugState());
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /baileys/simulate-command
router.post('/baileys/simulate-command', async (req: Request, res: Response) => {
  try {
    const { text = 'balance', fromMe = true, remoteJid } = req.body || {};
    const result = await baileysService.simulateCommand(String(text), Boolean(fromMe), remoteJid);
    return res.json({ ok: true, command: result.command, response: result.response, debug: result.debug });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /baileys/self-command-mode
router.post('/baileys/self-command-mode', async (req: Request, res: Response) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const debug = await baileysService.setSelfCommandMode(enabled);
    return res.json({ ok: true, selfCommandModeEnabled: enabled, debug });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /baileys/start
router.post('/baileys/start', async (req: Request, res: Response) => {
  try {
    baileysService.connect('primary_session');
    await logIntegration('WHATSAPP_BAILEYS', 'WA_START_SESSION', 'INFO', 'Session start requested via API');
    res.json({ ok: true, message: 'Starting Baileys session' });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /baileys/reconnect
router.post('/baileys/reconnect', async (req: Request, res: Response) => {
  try {
    await baileysService.reconnectExistingSession();
    await logIntegration('WHATSAPP_BAILEYS', 'WA_RECONNECT_EXISTING_SESSION', 'INFO', 'Reconnect requested via API');
    res.json({ ok: true, message: 'Reconnecting existing WhatsApp session', state: baileysService.getFullState() });
  } catch (error: any) {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_RECONNECT_EXISTING_SESSION', 'ERROR', error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /baileys/refresh-qr
router.post('/baileys/refresh-qr', async (req: Request, res: Response) => {
  try {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_QR_REFRESH_REQUESTED', 'INFO', 'Refresh QR requested via API');
    const result = await baileysService.refreshQr();
    if (!result.ok) {
      return res.status(result.message?.includes('already connected') ? 400 : 408).json({ ok: false, error: result.error, message: result.message });
    }
    const state = baileysService.getFullState();
    return res.json({ ok: true, qr: state.qr, qrExpiresAt: state.qrExpiresAt, secondsUntilQrExpiry: state.secondsUntilQrExpiry });
  } catch (error: any) {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_QR_REFRESH_REQUESTED', 'ERROR', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /baileys/restart-session
router.post('/baileys/restart-session', async (req: Request, res: Response) => {
  try {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_SOCKET_RESTARTED', 'INFO', 'Restart session requested via API');
    await baileysService.restartSession();
    res.json({ ok: true, message: 'Session restarted. Waiting for new QR.' });
  } catch (error: any) {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_SOCKET_RESTARTED', 'ERROR', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /baileys/qr
router.get('/baileys/qr', async (req: Request, res: Response) => {
  const state = baileysService.getFullState();
  if (state.connected) return res.json({ message: 'Already connected to WhatsApp.' });
  if (state.qrAvailable && state.qr) return res.json({ qr: state.qr, qrExpiresAt: state.qrExpiresAt, secondsUntilQrExpiry: state.secondsUntilQrExpiry });

  // Not started yet — kick off connection
  baileysService.connect('primary_session');
  // Wait up to 8s
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const s = baileysService.getFullState();
    if (s.qrAvailable && s.qr) return res.json({ qr: s.qr, qrExpiresAt: s.qrExpiresAt, secondsUntilQrExpiry: s.secondsUntilQrExpiry });
  }
  res.json({ message: 'QR not ready yet. Try again or click Refresh QR.' });
});

// POST /baileys/request-pairing-code
router.post('/baileys/request-pairing-code', async (req: Request, res: Response) => {
  const { phoneNumber } = req.body;

  // Strict validation
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_PAIRING_FORMAT_INVALID', 'WARNING', 'No phone number provided');
    return res.status(400).json({
      ok: false,
      error: 'Phone number is required',
      possibleCause: 'Missing field',
      suggestion: 'Provide phoneNumber in request body (digits only, e.g. 6281234567890)'
    });
  }

  const cleaned = phoneNumber.trim();
  if (!/^[0-9]+$/.test(cleaned)) {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_PAIRING_FORMAT_INVALID', 'WARNING', `Invalid phone format: ${cleaned}`);
    return res.status(400).json({
      ok: false,
      error: 'Phone number must contain digits only. No +, spaces, dashes, or brackets.',
      possibleCause: 'Invalid format',
      suggestion: 'Use format: 6281234567890 (country code + number, no +)'
    });
  }

  if (cleaned.length < 8 || cleaned.length > 15) {
    return res.status(400).json({ ok: false, error: 'Phone number length invalid (8–15 digits)', suggestion: 'Example: 6281234567890' });
  }

  try {
    const code = await baileysService.requestPairingCode(cleaned);
    return res.json({
      ok: true,
      pairingCode: code,
      expiresAt: Date.now() + 60000,
      instructions: 'Open WhatsApp → Linked Devices → Link with phone number → enter this code'
    });
  } catch (error: any) {
    const isRateLimit = error.message?.toLowerCase().includes('rate') || error.message?.toLowerCase().includes('wait');
    if (isRateLimit) {
      await logIntegration('WHATSAPP_BAILEYS', 'WA_PAIRING_RATE_LIMITED', 'WARNING', error.message);
    } else {
      await logIntegration('WHATSAPP_BAILEYS', 'WA_PAIRING_CODE_FAILED', 'ERROR', error.message);
    }
    return res.status(500).json({
      ok: false,
      error: error.message,
      possibleCause: (error as any).possibleCause || 'Unknown',
      suggestion: (error as any).suggestion || 'Check phone format or use QR fallback'
    });
  }
});

// POST /baileys/logout
router.post('/baileys/logout', async (req: Request, res: Response) => {
  try {
    const authFolder = require('path').join(process.cwd(), 'storage', 'baileys-auth', 'primary_session');
    if (require('fs').existsSync(authFolder)) require('fs').rmSync(authFolder, { recursive: true, force: true });
    await logIntegration('WHATSAPP_BAILEYS', 'WA_LOGOUT', 'INFO', 'Session auth cleared via logout');
    res.json({ ok: true, message: 'Session cleared. Restart backend or click Start to reconnect.' });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /baileys/reset-session  (alias restart-session for frontend compat)
router.post('/baileys/reset-session', async (req: Request, res: Response) => {
  try {
    await logIntegration('WHATSAPP_BAILEYS', 'WA_SOCKET_RESTARTED', 'INFO', 'Reset-session called');
    await baileysService.restartSession();
    res.json({ ok: true, message: 'Session reset and reconnecting.' });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /baileys/send-self-test
router.post('/baileys/send-self-test', async (req: Request, res: Response) => {
  const { testNumber } = req.body;
  if (!baileysService.getIsConnected()) return res.status(400).json({ ok: false, error: 'WhatsApp is not connected' });
  const state = baileysService.getFullState();
  const target = testNumber || state.phoneNumber;
  if (!target) return res.status(400).json({ ok: false, error: 'No phone number available' });
  const success = await baileysService.sendMessage(target, '✅ ReplayFX WhatsApp integration is connected and working.');
  return success ? res.json({ ok: true, message: 'Test sent' }) : res.status(500).json({ ok: false, error: 'Failed to send' });
});

// POST /baileys/send-test
router.post('/baileys/send-test', async (req: Request, res: Response) => {
  const { to, message } = req.body;
  if (!baileysService.getIsConnected()) return res.status(400).json({ ok: false, error: 'WhatsApp is not connected' });
  if (!to || !message) return res.status(400).json({ ok: false, error: 'to and message are required' });
  const success = await baileysService.sendMessage(to, message);
  return success ? res.json({ ok: true }) : res.status(500).json({ ok: false, error: 'Failed to send' });
});

// GET /webhook (Cloud API verification)
router.get('/webhook', (req: Request, res: Response) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// POST /webhook (Cloud API incoming)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { entry } = req.body;
    if (!entry) return res.sendStatus(400);
    for (const ent of entry) {
      for (const change of (ent.changes || [])) {
        for (const msg of (change.value?.messages || [])) {
          await prisma.commandLog.create({
            data: { source: 'WHATSAPP', senderId: String(msg.from), command: msg.text?.body || 'UNKNOWN', status: 'RECEIVED', response: 'WhatsApp Cloud commands not implemented' }
          });
        }
      }
    }
    res.sendStatus(200);
  } catch { res.sendStatus(500); }
});

// POST /send-test (Cloud API mock)
router.post('/send-test', (req: Request, res: Response) => {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) return res.status(400).json({ ok: false, error: 'WhatsApp Cloud not configured' });
  res.json({ ok: true, message: 'Test message sent (mock)' });
});

export default router;
