import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';

const router = Router();

function normalizeString(value: any): string {
  return String(value || '').trim();
}

function hasDailyNoteDelegate() {
  return Boolean((prisma as any).dailyJournalNote?.findUnique);
}

async function findDailyNote(scope: string, contextId: string, dateKey: string) {
  if (hasDailyNoteDelegate()) {
    return (prisma as any).dailyJournalNote.findUnique({
      where: { scope_contextId_dateKey: { scope, contextId, dateKey } },
    });
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(
    'SELECT * FROM "DailyJournalNote" WHERE "scope" = ? AND "contextId" = ? AND "dateKey" = ? LIMIT 1',
    scope,
    contextId,
    dateKey
  );
  return rows[0] || null;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const scope = normalizeString(req.query.scope);
    const contextId = normalizeString(req.query.contextId);
    const dateKey = normalizeString(req.query.dateKey);

    if (!scope || !contextId || !dateKey) {
      return res.status(400).json({ ok: false, error: 'scope, contextId, dan dateKey wajib diisi.' });
    }

    const note = await findDailyNote(scope, contextId, dateKey);

    return res.json({
      ok: true,
      note,
      text: note?.note || '',
      createdAt: note?.createdAt || null,
      updatedAt: note?.updatedAt || null,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message || 'Gagal memuat catatan harian.' });
  }
});

router.put('/', async (req: Request, res: Response) => {
  try {
    const scope = normalizeString(req.body?.scope);
    const contextId = normalizeString(req.body?.contextId);
    const dateKey = normalizeString(req.body?.dateKey);
    const note = String(req.body?.note ?? '');

    if (!scope || !contextId || !dateKey) {
      return res.status(400).json({ ok: false, error: 'scope, contextId, dan dateKey wajib diisi.' });
    }

    let record: any;
    if (hasDailyNoteDelegate()) {
      record = await (prisma as any).dailyJournalNote.upsert({
        where: { scope_contextId_dateKey: { scope, contextId, dateKey } },
        update: { note },
        create: { scope, contextId, dateKey, note },
      });
    } else {
      const existing = await findDailyNote(scope, contextId, dateKey);
      const now = new Date().toISOString();
      if (existing) {
        await prisma.$executeRawUnsafe(
          'UPDATE "DailyJournalNote" SET "note" = ?, "updatedAt" = ? WHERE "id" = ?',
          note,
          now,
          existing.id
        );
        record = { ...existing, note, updatedAt: now };
      } else {
        record = {
          id: crypto.randomUUID(),
          scope,
          contextId,
          dateKey,
          note,
          createdAt: now,
          updatedAt: now,
        };
        await prisma.$executeRawUnsafe(
          'INSERT INTO "DailyJournalNote" ("id", "scope", "contextId", "dateKey", "note", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
          record.id,
          scope,
          contextId,
          dateKey,
          note,
          now,
          now
        );
      }
    }

    return res.json({
      ok: true,
      note: record,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message || 'Gagal menyimpan catatan harian.' });
  }
});

export default router;
