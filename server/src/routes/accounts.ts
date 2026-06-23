import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

// GET /api/accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.tradingAccount.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.json(accounts);
  } catch (error: any) {
    console.error('Error fetching accounts:', error);
    return res.status(500).json({ error: 'Gagal memuat daftar akun.' });
  }
});

// POST /api/accounts
router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      name, platform, accountNumber, broker, brokerServer, 
      accountType, accountModel, leverage, currency, initialBalance,
      currentBalance, status, notes
    } = req.body;
    
    if (!name || !platform || !currency || initialBalance === undefined) {
      return res.status(400).json({ error: 'Data akun tidak lengkap.' });
    }

    const newAccount = await prisma.tradingAccount.create({
      data: {
        name,
        platform,
        accountNumber,
        broker,
        brokerServer,
        server: brokerServer, // sync legacy field
        accountType,
        accountModel,
        leverage,
        currency,
        initialBalance: parseFloat(initialBalance),
        currentBalance: currentBalance !== undefined ? parseFloat(currentBalance) : parseFloat(initialBalance),
        status: status || 'Active',
        notes
      }
    });

    return res.json(newAccount);
  } catch (error: any) {
    console.error('Error creating account:', error);
    return res.status(500).json({ error: 'Gagal membuat akun.' });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.tradingAccount.delete({
      where: { id }
    });
    return res.json({ message: 'Akun berhasil dihapus.' });
  } catch (error: any) {
    console.error('Error deleting account:', error);
    return res.status(500).json({ error: 'Gagal menghapus akun.' });
  }
});

export default router;
