import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// GET /api/integrations/logs
router.get('/', async (req: Request, res: Response) => {
  try {
    const { source, limit = 100 } = req.query;
    
    const where: any = {};
    if (source && source !== 'ALL') {
      where.source = String(source);
    }

    const logs = await prisma.integrationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit)
    });

    res.json({ ok: true, logs });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/integrations/logs/clear
router.post('/clear', async (req: Request, res: Response) => {
  try {
    await prisma.integrationLog.deleteMany({});
    res.json({ ok: true, message: 'Logs cleared successfully' });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
