import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { logIntegration } from '../utils/logger';

export const SETUP_STATUSES = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  EXECUTED: 'EXECUTED',
} as const;

type SetupPayload = {
  secret?: string;
  source?: string;
  strategy?: string;
  symbol?: string;
  timeframe?: string;
  side?: string;
  price?: number | string;
  sl?: number | string;
  tp?: number | string;
  bodySize?: number | string;
  volume?: number | string;
  reason?: string;
  chartUrl?: string;
  alertTime?: string;
};

type TradingViewSetupRow = {
  id: string;
  source: string;
  symbol: string;
  timeframe: string;
  side: string;
  price: number;
  sl: number | null;
  tp: number | null;
  bodySize: number | null;
  volume: number | null;
  reason: string | null;
  chartUrl: string | null;
  previewUrl: string | null;
  payload: string;
  status: string;
  expiresAt: Date | string;
  reviewSource: string | null;
  reviewNote: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const TIMEFRAME_EXPIRY_MINUTES: Record<string, number> = {
  M1: 3,
  '1': 3,
  M5: 10,
  '5': 10,
  M15: 20,
  '15': 20,
  H1: 75,
  '60': 75,
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getSetupExpiry(timeframe: string, now = new Date()) {
  const normalized = timeframe.trim().toUpperCase();
  const minutes = TIMEFRAME_EXPIRY_MINUTES[normalized] ?? 20;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function getPreviewDir() {
  return path.join(process.cwd(), 'uploads', 'setup-previews');
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPreviewSvg(setup: {
  id: string;
  symbol: string;
  timeframe: string;
  side: string;
  price: number;
  sl?: number | null;
  tp?: number | null;
  bodySize?: number | null;
  volume?: number | null;
  status: string;
}) {
  const sideColor = setup.side === 'SELL' ? '#f6465d' : '#0ecb81';
  const body = Math.max(48, Math.min(160, Math.abs(setup.bodySize ?? 80) * 10));
  const wickTop = 82;
  const bodyTop = 120 - body / 2;
  const bodyBottom = bodyTop + body;
  const volumeHeight = Math.max(24, Math.min(110, Math.log10(Math.max(10, setup.volume ?? 1000)) * 24));
  const candles = [54, 82, 110, 138, 166, 194].map((x, idx) => {
    const up = idx % 2 === 0;
    const color = up ? '#0ecb81' : '#f6465d';
    const y = 108 + (idx % 3) * 8;
    return `<line x1="${x}" y1="${y - 28}" x2="${x}" y2="${y + 38}" stroke="${color}" stroke-width="3"/>
      <rect x="${x - 8}" y="${y}" width="16" height="32" rx="2" fill="${color}" opacity="0.55"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <rect width="960" height="540" fill="#0b0e11"/>
    <rect x="28" y="28" width="904" height="484" rx="18" fill="#181a20" stroke="#2b3139"/>
    <text x="56" y="72" fill="#eaecef" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700">${escapeXml(setup.symbol)} ${escapeXml(setup.timeframe)}</text>
    <text x="56" y="104" fill="${sideColor}" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700">${escapeXml(setup.side)} momentum setup</text>
    <text x="56" y="138" fill="#929aa5" font-family="Inter,Arial,sans-serif" font-size="15">Generated ${escapeXml(new Date().toLocaleString())}</text>
    <rect x="52" y="170" width="570" height="250" rx="12" fill="#0b0e11" stroke="#2b3139"/>
    <g transform="translate(300 55)">${candles}</g>
    <line x1="500" y1="${wickTop}" x2="500" y2="${bodyBottom + 48}" stroke="${sideColor}" stroke-width="5"/>
    <rect x="462" y="${bodyTop + 55}" width="76" height="${body}" rx="6" fill="${sideColor}"/>
    <line x1="52" y1="342" x2="622" y2="342" stroke="#2b3139"/>
    <rect x="102" y="${421 - volumeHeight}" width="40" height="${volumeHeight}" fill="#fcd535" opacity="0.45"/>
    <rect x="168" y="${421 - volumeHeight * 0.7}" width="40" height="${volumeHeight * 0.7}" fill="#fcd535" opacity="0.35"/>
    <rect x="234" y="${421 - volumeHeight * 0.5}" width="40" height="${volumeHeight * 0.5}" fill="#fcd535" opacity="0.25"/>
    <text x="666" y="184" fill="#707a8a" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700">PRICE</text>
    <text x="666" y="216" fill="#eaecef" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700">${setup.price}</text>
    <text x="666" y="264" fill="#707a8a" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700">SL / TP</text>
    <text x="666" y="296" fill="#eaecef" font-family="Inter,Arial,sans-serif" font-size="20">${setup.sl ?? '-'} / ${setup.tp ?? '-'}</text>
    <text x="666" y="344" fill="#707a8a" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700">BODY / VOLUME</text>
    <text x="666" y="376" fill="#eaecef" font-family="Inter,Arial,sans-serif" font-size="20">${setup.bodySize ?? '-'} / ${setup.volume ?? '-'}</text>
    <text x="666" y="438" fill="#707a8a" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700">STATUS</text>
    <text x="666" y="470" fill="#fcd535" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="700">${escapeXml(setup.status)}</text>
  </svg>`;
}

export async function createSetupPreview(setup: {
  id: string;
  symbol: string;
  timeframe: string;
  side: string;
  price: number;
  sl?: number | null;
  tp?: number | null;
  bodySize?: number | null;
  volume?: number | null;
  status: string;
}) {
  const dir = getPreviewDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = `${setup.id}.svg`;
  fs.writeFileSync(path.join(dir, fileName), buildPreviewSvg(setup), 'utf8');
  return `/uploads/setup-previews/${fileName}`;
}

export async function expireStaleSetups() {
  const count = await prisma.$executeRaw`
    UPDATE TradingViewSetup
    SET status = ${SETUP_STATUSES.EXPIRED}, updatedAt = ${new Date()}
    WHERE status IN (${SETUP_STATUSES.PENDING_REVIEW}, ${SETUP_STATUSES.APPROVED})
      AND expiresAt < ${new Date()}
  `;
  if (count > 0) {
    await logIntegration('SYSTEM', 'SETUP_EXPIRED', 'INFO', `${count} TradingView setup(s) expired`);
  }
  return count;
}

export async function createTradingViewSetup(payload: SetupPayload) {
  const symbol = String(payload.symbol || '').trim().toUpperCase();
  const timeframe = String(payload.timeframe || '').trim().toUpperCase();
  const side = String(payload.side || '').trim().toUpperCase();
  const price = toNumber(payload.price);

  if (!symbol) throw new Error('symbol is required');
  if (!timeframe) throw new Error('timeframe is required');
  if (!['BUY', 'SELL'].includes(side)) throw new Error('side must be BUY or SELL');
  if (price === null) throw new Error('price is required');

  const id = crypto.randomUUID();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO TradingViewSetup (
      id, source, symbol, timeframe, side, price, sl, tp, bodySize, volume,
      reason, chartUrl, payload, status, expiresAt, createdAt, updatedAt
    ) VALUES (
      ${id}, ${payload.source || 'tradingview'}, ${symbol}, ${timeframe}, ${side}, ${price},
      ${toNumber(payload.sl)}, ${toNumber(payload.tp)}, ${toNumber(payload.bodySize)}, ${toNumber(payload.volume)},
      ${payload.reason || payload.strategy || 'Momentum candle formed'}, ${payload.chartUrl || null}, ${JSON.stringify(payload)},
      ${SETUP_STATUSES.PENDING_REVIEW}, ${getSetupExpiry(timeframe)}, ${now}, ${now}
    )
  `;

  const setup = await getSetupOrThrow(id);

  const previewUrl = await createSetupPreview(setup);
  await prisma.$executeRaw`UPDATE TradingViewSetup SET previewUrl = ${previewUrl}, updatedAt = ${new Date()} WHERE id = ${setup.id}`;
  const updated = await getSetupOrThrow(id);

  await logIntegration('SYSTEM', 'TRADINGVIEW_SETUP_RECEIVED', 'SUCCESS', `${symbol} ${timeframe} ${side} setup received`, { setupId: setup.id });
  await logIntegration('SYSTEM', 'SETUP_PENDING_REVIEW', 'INFO', `Setup pending review: ${setup.id}`, { setupId: setup.id, expiresAt: setup.expiresAt });
  return updated;
}

export async function getSetupOrThrow(id: string) {
  await expireStaleSetups();
  const rows = await prisma.$queryRaw<TradingViewSetupRow[]>`SELECT * FROM TradingViewSetup WHERE id = ${id} LIMIT 1`;
  const setup = rows[0];
  if (!setup) throw Object.assign(new Error('Setup not found'), { statusCode: 404 });
  return setup;
}

export async function approveSetup(id: string, reviewSource: string, reviewNote?: string) {
  const setup = await getSetupOrThrow(id);
  if (setup.status === SETUP_STATUSES.EXPIRED || new Date(setup.expiresAt) < new Date()) {
    await prisma.$executeRaw`UPDATE TradingViewSetup SET status = ${SETUP_STATUSES.EXPIRED}, updatedAt = ${new Date()} WHERE id = ${id}`;
    await logIntegration('SYSTEM', 'SETUP_EXPIRED', 'WARNING', `Expired setup cannot be approved: ${id}`, { setupId: id });
    throw Object.assign(new Error('Setup has expired and cannot be approved'), { statusCode: 409 });
  }
  if (setup.status !== SETUP_STATUSES.PENDING_REVIEW) {
    throw Object.assign(new Error(`Setup is ${setup.status} and cannot be approved`), { statusCode: 409 });
  }

  await prisma.$executeRaw`
    UPDATE TradingViewSetup
    SET status = ${SETUP_STATUSES.APPROVED}, reviewSource = ${reviewSource}, reviewNote = ${reviewNote || null}, updatedAt = ${new Date()}
    WHERE id = ${id}
  `;
  const updated = await getSetupOrThrow(id);
  await createSetupPreview(updated);
  await logIntegration('SYSTEM', 'SETUP_APPROVED', 'SUCCESS', `Setup approved: ${id}`, { setupId: id, reviewSource });
  return updated;
}

export async function rejectSetup(id: string, reviewSource: string, reviewNote?: string) {
  const setup = await getSetupOrThrow(id);
  if (setup.status === SETUP_STATUSES.EXECUTED) {
    throw Object.assign(new Error('Executed setup cannot be rejected'), { statusCode: 409 });
  }
  if (setup.status === SETUP_STATUSES.EXPIRED || new Date(setup.expiresAt) < new Date()) {
    await prisma.$executeRaw`UPDATE TradingViewSetup SET status = ${SETUP_STATUSES.EXPIRED}, updatedAt = ${new Date()} WHERE id = ${id}`;
    await logIntegration('SYSTEM', 'SETUP_EXPIRED', 'WARNING', `Expired setup cannot be rejected: ${id}`, { setupId: id });
    throw Object.assign(new Error('Setup has expired'), { statusCode: 409 });
  }

  await prisma.$executeRaw`
    UPDATE TradingViewSetup
    SET status = ${SETUP_STATUSES.REJECTED}, reviewSource = ${reviewSource}, reviewNote = ${reviewNote || null}, updatedAt = ${new Date()}
    WHERE id = ${id}
  `;
  const updated = await getSetupOrThrow(id);
  await createSetupPreview(updated);
  await logIntegration('SYSTEM', 'SETUP_REJECTED', 'INFO', `Setup rejected: ${id}`, { setupId: id, reviewSource });
  return updated;
}

export async function markSetupExecuted(id: string, reviewSource = 'EA') {
  const setup = await getSetupOrThrow(id);
  if (setup.status !== SETUP_STATUSES.APPROVED) {
    throw Object.assign(new Error(`Setup is ${setup.status}; only APPROVED setups can be marked executed`), { statusCode: 409 });
  }
  if (new Date(setup.expiresAt) < new Date()) {
    await prisma.$executeRaw`UPDATE TradingViewSetup SET status = ${SETUP_STATUSES.EXPIRED}, updatedAt = ${new Date()} WHERE id = ${id}`;
    throw Object.assign(new Error('Setup has expired'), { statusCode: 409 });
  }
  await prisma.$executeRaw`
    UPDATE TradingViewSetup
    SET status = ${SETUP_STATUSES.EXECUTED}, reviewSource = ${reviewSource}, updatedAt = ${new Date()}
    WHERE id = ${id}
  `;
  return getSetupOrThrow(id);
}

export async function listSetups(status?: string) {
  await expireStaleSetups();
  if (status && status !== 'ALL') {
    return prisma.$queryRaw<TradingViewSetupRow[]>`SELECT * FROM TradingViewSetup WHERE status = ${status} ORDER BY createdAt DESC LIMIT 200`;
  }
  return prisma.$queryRaw<TradingViewSetupRow[]>`SELECT * FROM TradingViewSetup ORDER BY createdAt DESC LIMIT 200`;
}

export async function listApprovedSetups() {
  await expireStaleSetups();
  return prisma.$queryRaw<TradingViewSetupRow[]>`
    SELECT * FROM TradingViewSetup
    WHERE status = ${SETUP_STATUSES.APPROVED}
      AND expiresAt > ${new Date()}
    ORDER BY createdAt ASC
    LIMIT 50
  `;
}

export function formatSetupSummary(setup: any) {
  const shortId = setup.id.slice(0, 8);
  const lines = [
    `Momentum Setup ${shortId}`,
    `${setup.symbol} ${setup.timeframe} ${setup.side}`,
    `Price: ${setup.price}`,
    `SL/TP: ${setup.sl ?? '-'} / ${setup.tp ?? '-'}`,
    `Body/Volume: ${setup.bodySize ?? '-'} / ${setup.volume ?? '-'}`,
    `Status: ${setup.status}`,
    `Expires: ${new Date(setup.expiresAt).toLocaleString()}`,
  ];
  if (setup.reason) lines.push(`Reason: ${setup.reason}`);
  if (setup.chartUrl) lines.push(`Open chart: ${setup.chartUrl}`);
  lines.push(`Commands: /detail ${setup.id} | /acc ${setup.id} | /reject ${setup.id}`);
  return lines.join('\n');
}

export async function handleSetupReviewCommand(text: string, reviewSource: string) {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].replace(/^\//, '').toLowerCase();
  const id = parts[1];

  if (command === 'pending') {
    const setups = await listSetups(SETUP_STATUSES.PENDING_REVIEW);
    if (setups.length === 0) return { handled: true, status: 'EXECUTED', response: 'No pending momentum setups.' };
    return {
      handled: true,
      status: 'EXECUTED',
    response: setups.slice(0, 10).map((s: TradingViewSetupRow) => `${s.id} | ${s.symbol} ${s.timeframe} ${s.side} @ ${s.price} | expires ${new Date(s.expiresAt).toLocaleTimeString()}`).join('\n'),
    };
  }

  if (['detail', 'acc', 'reject'].includes(command) && !id) {
    return { handled: true, status: 'REJECTED', response: `Missing setup id. Use ${command} <setupId>.` };
  }

  if (command === 'detail') {
    const setup = await getSetupOrThrow(id);
    return { handled: true, status: 'EXECUTED', response: formatSetupSummary(setup) };
  }

  if (command === 'acc') {
    const setup = await approveSetup(id, reviewSource);
    return { handled: true, status: 'EXECUTED', response: `Setup approved.\n${formatSetupSummary(setup)}` };
  }

  if (command === 'reject') {
    const note = parts.slice(2).join(' ') || undefined;
    const setup = await rejectSetup(id, reviewSource, note);
    return { handled: true, status: 'EXECUTED', response: `Setup rejected.\n${formatSetupSummary(setup)}` };
  }

  return { handled: false, status: 'IGNORED', response: '' };
}

export function stableSetupKey(payload: unknown) {
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}
