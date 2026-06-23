import { prisma } from '../prisma';

function sanitizeDetails(details: any) {
  if (!details || typeof details !== 'object') return details;
  const blocked = new Set(['token', 'botToken', 'secret', 'password', 'authorization']);
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      blocked.has(key.toLowerCase()) ? '[redacted]' : value,
    ])
  );
}

function consoleIntegration(source: string, eventType: string, status: string, message: string, details?: any) {
  if (process.env.DEBUG_INTEGRATIONS === 'false') return;
  const tag =
    source === 'WHATSAPP_BAILEYS' ? 'WA' :
    source === 'TELEGRAM' ? 'TG' :
    source === 'MT5' ? 'MT5' :
    source === 'TRADINGVIEW' ? 'TV' :
    source;
  const clean = sanitizeDetails(details);
  const detailText = clean ? ` ${JSON.stringify(clean)}` : '';
  console.log(`[${tag}] ${eventType} status=${status} message="${message}"${detailText}`);
}

export async function logIntegration(
  source: 'MT5' | 'TELEGRAM' | 'WHATSAPP_BAILEYS' | 'WHATSAPP_CLOUD' | 'TRADINGVIEW' | 'SYSTEM',
  eventType: String,
  status: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
  message: string,
  details?: any
) {
  try {
    consoleIntegration(source, String(eventType), status, message, details);
    await prisma.integrationLog.create({
      data: {
        source,
        eventType: String(eventType),
        status,
        message,
        details: details ? JSON.stringify(details) : null
      }
    });
  } catch (error) {
    console.error('Failed to write integration log:', error);
  }
}
