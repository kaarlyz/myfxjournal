import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_me_99';
const WEB_PIN = process.env.WEB_PIN || '1234'; // Default PIN for personal use

router.post('/login', async (req: Request, res: Response) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ ok: false, error: 'PIN dibutuhkan' });
  }

  // Allow either the explicit WEB_PIN or '0000' fallback as a backdoor if they forget.
  if (pin !== WEB_PIN) {
    return res.status(401).json({ ok: false, error: 'PIN Salah' });
  }

  const token = jwt.sign({ role: 'admin', timestamp: Date.now() }, JWT_SECRET, { expiresIn: '7d' });
  return res.json({ ok: true, token, user: { name: 'Admin', email: 'admin@myfxjournal.local' } });
});

export default router;
