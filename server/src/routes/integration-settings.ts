import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import crypto from 'crypto';

const router = Router();

// Retrieve ENCRYPTION_KEY from env, fallback to a default if not set for dev
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_32_chars_1234'; 
const ALGORITHM = 'aes-256-cbc';

function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(text: string): string {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text; // Not encrypted
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf-8');
  } catch (error) {
    console.error('Decryption failed, returning raw', error);
    return text;
  }
}

// Helper to get raw settings
async function getIntegrationSettingsRaw() {
  const settingsList = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: ['telegram_bot_token', 'telegram_chat_ids', 'telegram_enabled', 'whatsapp_provider', 'whatsapp_cloud_token', 'whatsapp_cloud_phone_id', 'whatsapp_baileys_session', 'whatsapp_enabled', 'whatsapp_allowed_numbers', 'whatsapp_self_commands_enabled', 'whatsapp:baileys:selfCommandsEnabled']
      }
    }
  });
  
  const map: Record<string, string> = {};
  settingsList.forEach(s => map[s.key] = s.value);
  return map;
}

// GET /api/integrations/settings/private
router.get('/private', async (req: Request, res: Response) => {
  try {
    const raw = await getIntegrationSettingsRaw();
    
    // Decrypt sensitive fields
    const response = {
      telegram: {
        enabled: raw.telegram_enabled === 'true',
        botToken: decrypt(raw.telegram_bot_token || ''),
        chatIds: raw.telegram_chat_ids || ''
      },
      whatsapp: {
        enabled: raw.whatsapp_enabled === 'true',
        provider: raw.whatsapp_provider || 'BAILEYS',
        cloudToken: decrypt(raw.whatsapp_cloud_token || ''),
        cloudPhoneId: decrypt(raw.whatsapp_cloud_phone_id || ''),
        baileysSession: raw.whatsapp_baileys_session || '',
        allowedNumbers: raw.whatsapp_allowed_numbers || '',
        selfCommandsEnabled: (raw['whatsapp:baileys:selfCommandsEnabled'] ?? raw.whatsapp_self_commands_enabled) !== 'false',
      }
    };
    
    return res.json(response);
  } catch (error: any) {
    console.error('Error fetching integration settings:', error);
    return res.status(500).json({ error: 'Gagal memuat integrasi' });
  }
});

// POST /api/integrations/settings/private
router.post('/private', async (req: Request, res: Response) => {
  try {
    const { telegram, whatsapp } = req.body;
    
    const updates = [];
    
    if (telegram) {
      if (telegram.enabled !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'telegram_enabled' },
          update: { value: String(telegram.enabled) },
          create: { key: 'telegram_enabled', value: String(telegram.enabled) }
        }));
      }
      if (telegram.botToken !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'telegram_bot_token' },
          update: { value: encrypt(telegram.botToken) },
          create: { key: 'telegram_bot_token', value: encrypt(telegram.botToken) }
        }));
      }
      if (telegram.chatIds !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'telegram_chat_ids' },
          update: { value: telegram.chatIds },
          create: { key: 'telegram_chat_ids', value: telegram.chatIds }
        }));
      }
    }
    
    if (whatsapp) {
      if (whatsapp.enabled !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'whatsapp_enabled' },
          update: { value: String(whatsapp.enabled) },
          create: { key: 'whatsapp_enabled', value: String(whatsapp.enabled) }
        }));
      }
      if (whatsapp.provider !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'whatsapp_provider' },
          update: { value: whatsapp.provider },
          create: { key: 'whatsapp_provider', value: whatsapp.provider }
        }));
      }
      if (whatsapp.cloudToken !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'whatsapp_cloud_token' },
          update: { value: encrypt(whatsapp.cloudToken) },
          create: { key: 'whatsapp_cloud_token', value: encrypt(whatsapp.cloudToken) }
        }));
      }
      if (whatsapp.cloudPhoneId !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'whatsapp_cloud_phone_id' },
          update: { value: encrypt(whatsapp.cloudPhoneId) },
          create: { key: 'whatsapp_cloud_phone_id', value: encrypt(whatsapp.cloudPhoneId) }
        }));
      }
      if (whatsapp.allowedNumbers !== undefined) {
        updates.push(prisma.systemSetting.upsert({
          where: { key: 'whatsapp_allowed_numbers' },
          update: { value: whatsapp.allowedNumbers },
          create: { key: 'whatsapp_allowed_numbers', value: whatsapp.allowedNumbers }
        }));
      }
      if (whatsapp.selfCommandsEnabled !== undefined) {
        updates.push(
          prisma.systemSetting.upsert({
            where: { key: 'whatsapp_self_commands_enabled' },
            update: { value: String(whatsapp.selfCommandsEnabled) },
            create: { key: 'whatsapp_self_commands_enabled', value: String(whatsapp.selfCommandsEnabled) }
          }),
          prisma.systemSetting.upsert({
            where: { key: 'whatsapp:baileys:selfCommandsEnabled' },
            update: { value: String(whatsapp.selfCommandsEnabled) },
            create: { key: 'whatsapp:baileys:selfCommandsEnabled', value: String(whatsapp.selfCommandsEnabled) }
          })
        );
      }
    }
    
    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }
    
    return res.json({ ok: true, message: 'Settings saved' });
  } catch (error: any) {
    console.error('Error saving integration settings:', error);
    return res.status(500).json({ error: 'Gagal menyimpan integrasi' });
  }
});

export default router;
