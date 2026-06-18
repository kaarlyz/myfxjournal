"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const settings_1 = require("./settings");
const router = (0, express_1.Router)();
// GET /api/webhook/events - List Webhook Events logs for Webhook Monitor
router.get('/events', async (req, res) => {
    try {
        const events = await prisma_1.prisma.webhookEvent.findMany({
            orderBy: { receivedAt: 'desc' },
            take: 100, // limit to 100 logs
        });
        return res.json(events);
    }
    catch (error) {
        console.error('Error fetching webhook events:', error);
        return res.status(500).json({ error: 'Gagal memuat log webhook.' });
    }
});
// GET /api/webhook/summary - Get summary of webhooks, open trades, and resolved trades
router.get('/summary', async (req, res) => {
    try {
        const openTrades = await prisma_1.prisma.trade.findMany({
            where: { source: 'WEBHOOK', status: 'OPEN' },
            orderBy: { entryTime: 'desc' },
        });
        const closedTrades = await prisma_1.prisma.trade.findMany({
            where: { source: 'WEBHOOK', status: 'CLOSED' },
            orderBy: { exitTime: 'desc' },
            take: 20,
        });
        const eventCounts = await prisma_1.prisma.webhookEvent.groupBy({
            by: ['status'],
            _count: {
                id: true,
            },
        });
        const summaryCounts = {
            success: eventCounts.find((e) => e.status === 'SUCCESS')?._count.id || 0,
            error: eventCounts.find((e) => e.status === 'ERROR')?._count.id || 0,
            orphan: eventCounts.find((e) => e.status === 'ORPHAN')?._count.id || 0,
        };
        return res.json({
            openTrades,
            closedTrades,
            summaryCounts,
        });
    }
    catch (error) {
        console.error('Error fetching webhook summary:', error);
        return res.status(500).json({ error: 'Gagal memuat ringkasan webhook.' });
    }
});
// POST /api/webhook/tradingview - Endpoint for TradingView alerts
router.post('/tradingview', async (req, res) => {
    let eventStatus = 'SUCCESS';
    let errorMessage = null;
    const rawPayload = JSON.stringify(req.body);
    const receivedAt = new Date();
    // Extract common fields
    const { secret, event, trade_id, symbol, timeframe, side, fill_price, sl, tp, rr, risk_usd, setup, bar_time, } = req.body;
    try {
        // 1. Verify Authentication Token
        const settings = await (0, settings_1.getSettings)();
        if (!secret || secret !== settings.secretToken) {
            eventStatus = 'ERROR';
            errorMessage = 'Token rahasia (secret token) webhook tidak valid.';
            // Save raw event for review
            await prisma_1.prisma.webhookEvent.create({
                data: {
                    receivedAt,
                    rawPayload,
                    eventType: event || 'UNKNOWN',
                    tradeId: trade_id || 'UNKNOWN',
                    status: eventStatus,
                    errorMessage,
                },
            });
            return res.status(401).json({ error: errorMessage });
        }
        // 2. Validate payload details
        if (!event || !trade_id) {
            eventStatus = 'ERROR';
            errorMessage = 'Payload tidak lengkap. Bidang "event" dan "trade_id" wajib diisi.';
            await prisma_1.prisma.webhookEvent.create({
                data: {
                    receivedAt,
                    rawPayload,
                    eventType: event || 'UNKNOWN',
                    tradeId: trade_id || 'UNKNOWN',
                    status: eventStatus,
                    errorMessage,
                },
            });
            return res.status(400).json({ error: errorMessage });
        }
        if (event !== 'ENTRY' && event !== 'EXIT') {
            eventStatus = 'ERROR';
            errorMessage = 'Nilai "event" tidak valid. Harus berupa "ENTRY" atau "EXIT".';
            await prisma_1.prisma.webhookEvent.create({
                data: {
                    receivedAt,
                    rawPayload,
                    eventType: event,
                    tradeId: trade_id,
                    status: eventStatus,
                    errorMessage,
                },
            });
            return res.status(400).json({ error: errorMessage });
        }
        // 3. Find or Create default Webhook Session
        let session = await prisma_1.prisma.backtestSession.findFirst({
            where: { sourceMode: 'WEBHOOK' },
            orderBy: { createdAt: 'desc' },
        });
        if (!session) {
            // Create a default session if none exists
            session = await prisma_1.prisma.backtestSession.create({
                data: {
                    name: 'TradingView Webhook Session',
                    sourceMode: 'WEBHOOK',
                    symbol: symbol || 'XAUUSD',
                    marketType: 'Custom',
                    timeframe: timeframe || 'M5',
                    initialBalance: 10000.0,
                    balanceCurrency: 'USD',
                    usdIdrRate: settings.usdIdrRate,
                    riskMode: settings.defaultRiskMode,
                    riskValue: settings.defaultRiskValue,
                    notes: 'Dibuat otomatis untuk menampung event webhook masuk dari TradingView.',
                },
            });
        }
        // 4. Handle ENTRY Event
        if (event === 'ENTRY') {
            const entryPrice = parseFloat(fill_price || 0);
            const stopLoss = sl ? parseFloat(sl) : null;
            const takeProfit = tp ? parseFloat(tp) : null;
            const plannedRR = rr ? parseFloat(rr) : null;
            const setupTag = setup || 'Webhook Alert';
            const parsedSide = side === 'buy' || side === 'long' || side === 'LONG' ? 'LONG' : 'SHORT';
            const entryTime = bar_time ? new Date(parseInt(bar_time, 10)) : new Date();
            // Check if trade already exists
            const existingTrade = await prisma_1.prisma.trade.findFirst({
                where: { tradeId: trade_id, source: 'WEBHOOK', sessionId: session.id },
            });
            if (existingTrade) {
                eventStatus = 'ERROR';
                errorMessage = `Trade dengan trade_id "${trade_id}" sudah ada di dalam database.`;
                await prisma_1.prisma.webhookEvent.create({
                    data: {
                        receivedAt,
                        rawPayload,
                        eventType: event,
                        tradeId: trade_id,
                        status: eventStatus,
                        errorMessage,
                    },
                });
                return res.status(400).json({ error: errorMessage });
            }
            // Calculate quantity based on risk_usd and stop-loss if possible
            let riskAmount = risk_usd ? parseFloat(risk_usd) : null;
            if (!riskAmount) {
                // Fallback to session risk mode
                if (session.riskMode === 'FIXED_USD') {
                    riskAmount = session.riskValue;
                }
                else if (session.riskMode === 'FIXED_PCT') {
                    riskAmount = (session.initialBalance * session.riskValue) / 100;
                }
            }
            let qty = 1.0;
            if (entryPrice > 0 && stopLoss && riskAmount) {
                const diff = Math.abs(entryPrice - stopLoss);
                if (diff > 0) {
                    qty = riskAmount / diff;
                }
            }
            // Create OPEN trade
            await prisma_1.prisma.trade.create({
                data: {
                    sessionId: session.id,
                    source: 'WEBHOOK',
                    tradeId: trade_id,
                    symbol: symbol || session.symbol,
                    timeframe: timeframe || session.timeframe,
                    side: parsedSide,
                    entryTime,
                    entryPrice,
                    qty,
                    positionValue: entryPrice * qty,
                    entrySignal: setupTag,
                    setupTag,
                    status: 'OPEN',
                    plannedRR,
                    riskUsd: riskAmount,
                },
            });
            await prisma_1.prisma.webhookEvent.create({
                data: {
                    receivedAt,
                    rawPayload,
                    eventType: event,
                    tradeId: trade_id,
                    status: 'SUCCESS',
                },
            });
            return res.status(201).json({ message: 'Trade ENTRY berhasil didaftarkan.', tradeId: trade_id });
        }
        // 5. Handle EXIT Event
        if (event === 'EXIT') {
            const exitPrice = parseFloat(fill_price || 0);
            const exitTime = bar_time ? new Date(parseInt(bar_time, 10)) : new Date();
            const exitSignal = setup || 'Exit Trigger';
            // Find the corresponding OPEN trade
            const trade = await prisma_1.prisma.trade.findFirst({
                where: { tradeId: trade_id, source: 'WEBHOOK', status: 'OPEN', sessionId: session.id },
            });
            if (!trade) {
                eventStatus = 'ORPHAN';
                errorMessage = `Gagal mencocokkan trade_id "${trade_id}" karena event ENTRY tidak ditemukan atau trade sudah CLOSED.`;
                await prisma_1.prisma.webhookEvent.create({
                    data: {
                        receivedAt,
                        rawPayload,
                        eventType: event,
                        tradeId: trade_id,
                        status: eventStatus,
                        errorMessage,
                    },
                });
                return res.status(404).json({ error: errorMessage });
            }
            // Perform exit calculations
            const entryPrice = trade.entryPrice || 0;
            const sideFactor = trade.side === 'LONG' ? 1.0 : -1.0;
            const priceDiff = exitPrice - entryPrice;
            const qty = trade.qty || 1.0;
            const netPnlUsd = priceDiff * qty * sideFactor;
            const netPnlPct = (netPnlUsd / session.initialBalance) * 100;
            const netPnlIdr = netPnlUsd * session.usdIdrRate;
            const result = netPnlUsd > 0 ? 'WIN' : netPnlUsd < 0 ? 'LOSS' : 'BE';
            // Compute R-Multiple
            let rMultiple = null;
            if (trade.riskUsd && trade.riskUsd > 0) {
                rMultiple = netPnlUsd / trade.riskUsd;
            }
            // Update trade to CLOSED
            await prisma_1.prisma.trade.update({
                where: { id: trade.id },
                data: {
                    exitPrice,
                    exitTime,
                    exitSignal,
                    netPnlUsd,
                    netPnlPct,
                    netPnlIdr,
                    status: 'CLOSED',
                    result,
                    rMultiple,
                },
            });
            // Recalculate cumulative PnLs for all trades in this webhook session
            const allSessionTrades = await prisma_1.prisma.trade.findMany({
                where: { sessionId: session.id, status: 'CLOSED' },
                orderBy: { exitTime: 'asc' },
            });
            let runningPnlUsd = 0;
            const updates = allSessionTrades.map((t) => {
                runningPnlUsd += t.netPnlUsd || 0;
                return prisma_1.prisma.trade.update({
                    where: { id: t.id },
                    data: {
                        cumulativePnlUsd: runningPnlUsd,
                        cumulativePnlPct: (runningPnlUsd / session.initialBalance) * 100,
                    },
                });
            });
            if (updates.length > 0) {
                await prisma_1.prisma.$transaction(updates);
            }
            await prisma_1.prisma.webhookEvent.create({
                data: {
                    receivedAt,
                    rawPayload,
                    eventType: event,
                    tradeId: trade_id,
                    status: 'SUCCESS',
                },
            });
            return res.json({ message: 'Trade EXIT berhasil diproses.', tradeId: trade_id, netPnlUsd });
        }
    }
    catch (error) {
        console.error('Error handling webhook:', error);
        eventStatus = 'ERROR';
        errorMessage = error.message || 'Kesalahan backend internal saat memproses webhook.';
        try {
            await prisma_1.prisma.webhookEvent.create({
                data: {
                    receivedAt,
                    rawPayload,
                    eventType: event || 'UNKNOWN',
                    tradeId: trade_id || 'UNKNOWN',
                    status: eventStatus,
                    errorMessage,
                },
            });
        }
        catch (dbErr) {
            console.error('Failed to log error event to db:', dbErr);
        }
        return res.status(500).json({ error: errorMessage });
    }
});
exports.default = router;
