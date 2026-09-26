import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_me_99';

async function getSecretToken() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'secretToken' } });
  return row?.value || process.env.REPLAYFX_SECRET_TOKEN || process.env.SECRET_TOKEN || process.env.WEBHOOK_SECRET || '';
}

export const requireWebAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Missing Bearer token' });
  }

  const token = authHeader.substring(7);

  // 1. Check if it's an EA Token
  const eaToken = await getSecretToken();
  if (eaToken && token === eaToken) {
    return next();
  }

  // 2. Check if it's a valid Web JWT
  try {
    jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid or expired token' });
  }
};
