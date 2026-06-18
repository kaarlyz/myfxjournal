"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../prisma");
const csvParser_1 = require("../utils/csvParser");
const calculations_1 = require("../utils/calculations");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// GET /api/sessions - List all sessions with summarized metrics
router.get('/', async (req, res) => {
    try {
        const sessions = await prisma_1.prisma.backtestSession.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { trades: true, invalidTrades: true },
                },
            },
        });
        // Attach basic overview data to each session
        const sessionsWithSummaries = await Promise.all(sessions.map(async (session) => {
            const trades = await prisma_1.prisma.trade.findMany({
                where: { sessionId: session.id },
            });
            const metrics = (0, calculations_1.calculateMetrics)(session.initialBalance, session.usdIdrRate, trades);
            return {
                ...session,
                tradeCount: session._count.trades,
                invalidTradeCount: session._count.invalidTrades,
                endingBalance: metrics.endingBalance,
                netPnlUsd: metrics.netPnlUsd,
                netPnlPct: metrics.netPnlPct,
                winrate: metrics.winrate,
            };
        }));
        return res.json(sessionsWithSummaries);
    }
    catch (error) {
        console.error('Error fetching sessions:', error);
        return res.status(500).json({ error: 'Gagal memuat daftar sesi.' });
    }
});
// GET /api/sessions/:id - Get session details, trades, and full dashboard metrics
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const session = await prisma_1.prisma.backtestSession.findUnique({
            where: { id },
            include: {
                invalidTrades: true,
            },
        });
        if (!session) {
            return res.status(404).json({ error: 'Sesi backtest tidak ditemukan.' });
        }
        const trades = await prisma_1.prisma.trade.findMany({
            where: { sessionId: id },
            orderBy: [
                { exitTime: 'asc' },
                { entryTime: 'asc' },
            ],
        });
        const metrics = (0, calculations_1.calculateMetrics)(session.initialBalance, session.usdIdrRate, trades);
        return res.json({
            session,
            trades,
            metrics,
        });
    }
    catch (error) {
        console.error('Error fetching session details:', error);
        return res.status(500).json({ error: 'Gagal memuat detail sesi.' });
    }
});
// POST /api/sessions - Create session manually
router.post('/', async (req, res) => {
    try {
        const { name, sourceMode, symbol, marketType, timeframe, initialBalance, balanceCurrency, usdIdrRate, riskMode, riskValue, notes, } = req.body;
        if (!name || !symbol || !marketType || !timeframe || initialBalance === undefined) {
            return res.status(400).json({ error: 'Informasi utama sesi tidak lengkap.' });
        }
        const session = await prisma_1.prisma.backtestSession.create({
            data: {
                name,
                sourceMode: sourceMode || 'MANUAL',
                symbol,
                marketType,
                timeframe,
                initialBalance: parseFloat(initialBalance),
                balanceCurrency: balanceCurrency || 'USD',
                usdIdrRate: parseFloat(usdIdrRate || '16200'),
                riskMode: riskMode || 'NO_R',
                riskValue: parseFloat(riskValue || '0'),
                notes,
            },
        });
        return res.status(201).json(session);
    }
    catch (error) {
        console.error('Error creating session:', error);
        return res.status(500).json({ error: 'Gagal membuat sesi.' });
    }
});
// POST /api/sessions/parse-csv - Parse uploaded CSV file and return list of valid & invalid trades
router.post('/parse-csv', upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File CSV tidak ditemukan.' });
        }
        const csvText = req.file.buffer.toString('utf8');
        const { validTrades, invalidTrades } = (0, csvParser_1.parseTradingViewCsv)(csvText);
        return res.json({
            validTrades,
            invalidTrades,
            totalParsed: validTrades.length + invalidTrades.length,
            validCount: validTrades.length,
            invalidCount: invalidTrades.length,
        });
    }
    catch (error) {
        console.error('Error parsing CSV:', error);
        return res.status(400).json({ error: error.message || 'Gagal memproses file CSV.' });
    }
});
// POST /api/sessions/import - Commit parsed trades to database (create session, replace or append)
router.post('/import', async (req, res) => {
    try {
        const { sessionDetails, importMode, // 'NEW' | 'REPLACE' | 'APPEND'
        existingSessionId, validTrades, invalidTrades, } = req.body;
        if (!importMode) {
            return res.status(400).json({ error: 'Import mode harus ditentukan.' });
        }
        let session;
        if (importMode === 'NEW') {
            const { name, symbol, marketType, timeframe, initialBalance, balanceCurrency, usdIdrRate, riskMode, riskValue, notes, } = sessionDetails;
            if (!name || !symbol || !marketType || !timeframe || initialBalance === undefined) {
                return res.status(400).json({ error: 'Detil sesi baru tidak lengkap.' });
            }
            session = await prisma_1.prisma.backtestSession.create({
                data: {
                    name,
                    sourceMode: 'CSV',
                    symbol,
                    marketType,
                    timeframe,
                    initialBalance: parseFloat(initialBalance),
                    balanceCurrency: balanceCurrency || 'USD',
                    usdIdrRate: parseFloat(usdIdrRate || '16200'),
                    riskMode: riskMode || 'NO_R',
                    riskValue: parseFloat(riskValue || '0'),
                    notes,
                },
            });
        }
        else {
            if (!existingSessionId) {
                return res.status(400).json({ error: 'Sesi tujuan tidak ditentukan.' });
            }
            session = await prisma_1.prisma.backtestSession.findUnique({
                where: { id: existingSessionId },
            });
            if (!session) {
                return res.status(404).json({ error: 'Sesi tujuan tidak ditemukan.' });
            }
            if (importMode === 'REPLACE') {
                // Delete existing trades & invalid trades in this session
                await prisma_1.prisma.trade.deleteMany({ where: { sessionId: session.id } });
                await prisma_1.prisma.invalidTrade.deleteMany({ where: { sessionId: session.id } });
            }
        }
        // Determine Risk Usd for R calculations
        let riskUsd = null;
        if (session.riskMode === 'FIXED_USD') {
            riskUsd = session.riskValue;
        }
        else if (session.riskMode === 'FIXED_PCT') {
            riskUsd = (session.initialBalance * session.riskValue) / 100;
        }
        // Process valid trades
        const tradesToCreate = (validTrades || []).map((vt) => {
            const netPnlUsd = (0, csvParser_1.cleanNumber)(vt.netPnlUsd);
            // Calculate R-Multiple
            let rMultiple = null;
            if (riskUsd && riskUsd > 0) {
                rMultiple = netPnlUsd / riskUsd;
            }
            const result = netPnlUsd > 0 ? 'WIN' : netPnlUsd < 0 ? 'LOSS' : 'BE';
            return {
                sessionId: session.id,
                source: 'CSV',
                tradeNumber: vt.tradeNumber,
                symbol: session.symbol,
                timeframe: session.timeframe,
                side: vt.side,
                entryTime: vt.entryTime ? new Date(vt.entryTime) : null,
                exitTime: vt.exitTime ? new Date(vt.exitTime) : null,
                entryPrice: (0, csvParser_1.cleanNumber)(vt.entryPrice),
                exitPrice: (0, csvParser_1.cleanNumber)(vt.exitPrice),
                qty: (0, csvParser_1.cleanNumber)(vt.qty),
                positionValue: (0, csvParser_1.cleanNumber)(vt.positionValue),
                netPnlUsd,
                netPnlPct: (0, csvParser_1.cleanNumber)(vt.netPnlPct),
                netPnlIdr: netPnlUsd * session.usdIdrRate,
                favorableExcursionUsd: (0, csvParser_1.cleanNumber)(vt.favorableExcursionUsd),
                favorableExcursionPct: (0, csvParser_1.cleanNumber)(vt.favorableExcursionPct),
                adverseExcursionUsd: (0, csvParser_1.cleanNumber)(vt.adverseExcursionUsd),
                adverseExcursionPct: (0, csvParser_1.cleanNumber)(vt.adverseExcursionPct),
                cumulativePnlUsd: (0, csvParser_1.cleanNumber)(vt.cumulativePnlUsd),
                cumulativePnlPct: (0, csvParser_1.cleanNumber)(vt.cumulativePnlPct),
                entrySignal: vt.entrySignal,
                exitSignal: vt.exitSignal,
                status: 'CLOSED',
                result,
                rMultiple,
                riskUsd,
            };
        });
        // Process invalid trades
        const invalidTradesToCreate = (invalidTrades || []).map((it) => ({
            sessionId: session.id,
            tradeNumber: it.tradeNumber,
            reason: it.reason,
            rawRows: JSON.stringify(it.rawRows),
        }));
        // Perform database insertion in transaction
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.trade.createMany({ data: tradesToCreate }),
            prisma_1.prisma.invalidTrade.createMany({ data: invalidTradesToCreate }),
        ]);
        return res.json({
            message: 'Data berhasil di-import.',
            sessionId: session.id,
            importedValid: tradesToCreate.length,
            importedInvalid: invalidTradesToCreate.length,
        });
    }
    catch (error) {
        console.error('Error importing session data:', error);
        return res.status(500).json({ error: 'Gagal mengimpor data sesi: ' + error.message });
    }
});
// DELETE /api/sessions/:id - Delete a session and its associated trades (Cascaded)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Verify session exists
        const session = await prisma_1.prisma.backtestSession.findUnique({ where: { id } });
        if (!session) {
            return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
        }
        await prisma_1.prisma.backtestSession.delete({ where: { id } });
        return res.json({ message: 'Sesi berhasil dihapus.' });
    }
    catch (error) {
        console.error('Error deleting session:', error);
        return res.status(500).json({ error: 'Gagal menghapus sesi.' });
    }
});
exports.default = router;
