import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { mt5Events } from './mt5-integration';

const router = Router();

// GET /api/events/stream
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Connection established' })}\n\n`);

  const onUpdate = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  mt5Events.on('trade-update', onUpdate);
  mt5Events.on('account-snapshot', onUpdate);

  req.on('close', () => {
    mt5Events.off('trade-update', onUpdate);
    mt5Events.off('account-snapshot', onUpdate);
  });
});

// GET /api/events/commands
router.get('/commands', async (req: Request, res: Response) => {
  try {
    const commands = await prisma.commandLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
});

// GET /api/events/alerts
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    // Just mock for now since Alert schema is basic
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

export default router;
