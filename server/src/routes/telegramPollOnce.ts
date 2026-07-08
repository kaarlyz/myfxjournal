// Helper module for Telegram poll-once endpoint
// Kept separate to reduce churn in telegram.ts during integration.

import { prisma } from '../prisma';

import crypto from 'crypto';

type TelegramConfig = {
  enabled: boolean;
  botToken: string;
  chatIds: string;
  webhookSecret: string;
};

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_32_chars_1234';
const ALGORITHM = 'aes-256-cbc';

function decrypt(text: string): string {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text;
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0')).slice(0, 32), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    return text;
  }
}

async function getTelegramConfig(): Promise<TelegramConfig> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['telegram_enabled', 'telegram_bot_token', 'telegram_chat_ids', 'secretToken'] } }
  });
  const map: Record<string, string> = {};
  settings.forEach(s => (map[s.key] = s.value));

  return {
    enabled: map['telegram_enabled'] === 'true',
    botToken: decrypt(map['telegram_bot_token'] || ''),
    chatIds: map['telegram_chat_ids'] || '',
    webhookSecret: map['secretToken'] || ''
  };
}

export async function isAllowedTelegramChat(chatId: number | string): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config.chatIds) return true;
  const allowedIds = config.chatIds.split(',').map(id => id.trim());
  return allowedIds.includes(String(chatId));
}

export async function sendTelegramMessage(chatId: string | number, text: string): Promise<void> {
  const config = await getTelegramConfig();
  const token = config.botToken;
  if (!token) throw new Error('Telegram bot token not configured');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API failed: ${res.status} ${err}`);
  }
}

export async function getTelegramLastUpdateId(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'telegram:lastUpdateId' } });
  if (!setting?.value) return 0;
  const parsed = Number(setting.value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function setTelegramLastUpdateId(id: number): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'telegram:lastUpdateId' },
    create: { key: 'telegram:lastUpdateId', value: String(id) },
    update: { value: String(id) }
  });
}

export async function telegramGetUpdates(offset: number): Promise<any[]> {
  const config = await getTelegramConfig();
  const token = config.botToken;
  if (!token) throw new Error('Telegram bot token not configured');

  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset, timeout: 0, allowed_updates: ['message'] })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Telegram getUpdates failed: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(`Telegram getUpdates error: ${data.description || 'unknown'}`);
  }

  return Array.isArray(data.result) ? data.result : [];
}

