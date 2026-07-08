import fs from 'fs';
import path from 'path';

export type BotMenuSendMode = 'text' | 'photo';

export type BotMenuPayload = {
  mode: BotMenuSendMode;
  text: string;
  replyMarkup?: any;
  photoPath?: string | null;
};

function resolveRootImagePath(fileName = 'pict.jpeg') {
  const candidates = [
    path.resolve(process.cwd(), fileName),
    path.resolve(process.cwd(), '..', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveBotBannerPath() {
  return resolveRootImagePath('pict.jpeg');
}

export function buildBotMenuPayload(input: {
  text: string;
  replyMarkup?: any;
  banner?: boolean;
  allowBannerFallback?: boolean;
}): BotMenuPayload {
  const photoPath = input.banner ? resolveBotBannerPath() : null;
  if (photoPath) {
    return { mode: 'photo', text: input.text, replyMarkup: input.replyMarkup, photoPath };
  }
  return { mode: 'text', text: input.text, replyMarkup: input.replyMarkup, photoPath: null };
}

export function sendBotMenuMessage(
  channel: 'TELEGRAM' | 'WHATSAPP_BAILEYS',
  recipient: string | number,
  text: string,
  replyMarkup?: any,
  status?: string,
  options?: { banner?: boolean }
) {
  return buildBotMenuPayload({
    text,
    replyMarkup,
    banner: options?.banner !== false && (status === 'SUCCESS' || status === 'QUEUED' || status === 'CONFIRMATION_REQUIRED'),
  });
}
