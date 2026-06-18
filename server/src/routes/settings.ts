import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { seedDemoData } from '../utils/seeder';

const router = Router();

// Helper to get all settings
export async function getSettings(includePrivate: boolean = false) {
  const settingsList = await prisma.systemSetting.findMany();
  const settingsMap: Record<string, string> = {};
  settingsList.forEach((s) => {
    settingsMap[s.key] = s.value;
  });

  const settings: any = {
    usdIdrRate: parseFloat(settingsMap['usdIdrRate'] || '16200'),
    defaultRiskMode: settingsMap['defaultRiskMode'] || 'FIXED_USD',
    defaultRiskValue: parseFloat(settingsMap['defaultRiskValue'] || '100'),
  };

  if (includePrivate) {
    settings.secretToken = settingsMap['secretToken'] || 'replayfx_secret_token_123';
  }

  return settings;
}

// GET /api/settings/public
router.get('/public', async (req: Request, res: Response) => {
  try {
    const settings = await getSettings(false);
    return res.json(settings);
  } catch (error: any) {
    console.error('Error fetching public settings:', error);
    return res.status(500).json({ error: 'Gagal memuat pengaturan publik.' });
  }
});

// GET /api/settings/private
// In a real production app, this would be protected by JWT admin auth.
router.get('/private', async (req: Request, res: Response) => {
  try {
    const settings = await getSettings(true);
    return res.json(settings);
  } catch (error: any) {
    console.error('Error fetching private settings:', error);
    return res.status(500).json({ error: 'Gagal memuat pengaturan privat.' });
  }
});

// POST /api/settings
// We'll leave this unprotected for personal use, but it handles private tokens.
router.post('/', async (req: Request, res: Response) => {
  try {
    const { usdIdrRate, defaultRiskMode, defaultRiskValue, secretToken } = req.body;

    const updates = [
      prisma.systemSetting.upsert({
        where: { key: 'usdIdrRate' },
        update: { value: String(usdIdrRate || '16200') },
        create: { key: 'usdIdrRate', value: String(usdIdrRate || '16200') },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'defaultRiskMode' },
        update: { value: String(defaultRiskMode || 'FIXED_USD') },
        create: { key: 'defaultRiskMode', value: String(defaultRiskMode || 'FIXED_USD') },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'defaultRiskValue' },
        update: { value: String(defaultRiskValue || '100') },
        create: { key: 'defaultRiskValue', value: String(defaultRiskValue || '100') },
      }),
    ];

    if (secretToken) {
      updates.push(
        prisma.systemSetting.upsert({
          where: { key: 'secretToken' },
          update: { value: String(secretToken) },
          create: { key: 'secretToken', value: String(secretToken) },
        })
      );
    }

    await prisma.$transaction(updates);
    
    if (usdIdrRate) {
      const rate = parseFloat(usdIdrRate);
      const trades = await prisma.trade.findMany({
        where: { netPnlUsd: { not: null } }
      });
      
      const tradeUpdates = trades.map((t) =>
        prisma.trade.update({
          where: { id: t.id },
          data: { netPnlIdr: (t.netPnlUsd || 0) * rate }
        })
      );
      
      if (tradeUpdates.length > 0) {
        await prisma.$transaction(tradeUpdates);
      }
    }

    const newSettings = await getSettings(false);
    return res.json({ message: 'Pengaturan berhasil diperbarui.', settings: newSettings });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return res.status(500).json({ error: 'Gagal memperbarui pengaturan.' });
  }
});

// POST /api/settings/seed-demo
router.post('/seed-demo', async (req: Request, res: Response) => {
  try {
    await seedDemoData(prisma);
    return res.json({ message: 'Database berhasil diisi dengan data demo.' });
  } catch (error: any) {
    console.error('Error seeding demo data:', error);
    return res.status(500).json({ error: 'Gagal mengisi data demo: ' + error.message });
  }
});

// POST /api/settings/reset
router.post('/reset', async (req: Request, res: Response) => {
  try {
    await prisma.trade.deleteMany({});
    await prisma.invalidTrade.deleteMany({});
    await prisma.backtestSession.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.liveTrade.deleteMany({});
    await prisma.tradingAccount.deleteMany({});
    await prisma.systemSetting.deleteMany({});

    await prisma.systemSetting.createMany({
      data: [
        { key: 'usdIdrRate', value: '16200' },
        { key: 'defaultRiskMode', value: 'FIXED_USD' },
        { key: 'defaultRiskValue', value: '100' },
        { key: 'secretToken', value: 'replayfx_secret_token_123' },
      ],
    });

    return res.json({ message: 'Database berhasil di-reset sepenuhnya.' });
  } catch (error: any) {
    console.error('Error resetting database:', error);
    return res.status(500).json({ error: 'Gagal mereset database.' });
  }
});

// Maintain legacy GET /api/settings route for older clients but don't expose token
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await getSettings(false);
    return res.json(settings);
  } catch (error: any) {
    return res.status(500).json({ error: 'Gagal memuat pengaturan.' });
  }
});

export default router;
