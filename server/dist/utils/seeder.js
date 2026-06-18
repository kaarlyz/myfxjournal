"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDemoData = seedDemoData;
async function seedDemoData(prisma) {
    // Clear all data
    await prisma.trade.deleteMany({});
    await prisma.invalidTrade.deleteMany({});
    await prisma.backtestSession.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.systemSetting.deleteMany({});
    // Setup default settings
    await prisma.systemSetting.createMany({
        data: [
            { key: 'usdIdrRate', value: '16350' },
            { key: 'defaultRiskMode', value: 'FIXED_USD' },
            { key: 'defaultRiskValue', value: '50' },
            { key: 'secretToken', value: 'replayfx_secret_token_123' },
        ],
    });
    const now = new Date();
    // 1. CREATE CSV BACKTEST SESSION (Trend Following Strategy on Gold)
    const csvSession = await prisma.backtestSession.create({
        data: {
            name: 'TV Trend-Following Gold Backtest (Demo)',
            sourceMode: 'CSV',
            symbol: 'XAUUSD',
            marketType: 'Gold',
            timeframe: 'H1',
            initialBalance: 10000.0,
            balanceCurrency: 'USD',
            usdIdrRate: 16350.0,
            riskMode: 'FIXED_PCT',
            riskValue: 1.0, // 1% of initial balance = $100 per trade
            notes: 'Demo backtest data uploaded via CSV parsing simulating a trend breakout strategy on XAUUSD.',
        },
    });
    // Risk amount is 1% of 10,000 = $100
    const riskAmount = 100.0;
    // Let's generate a sequence of trades with varying P&L, MFE, MAE
    // Trade template: (tradeNumber, side, pnlMultiplier, durationHours, signal, tag)
    const tradeTemplates = [
        { num: 1, side: 'SHORT', mult: -1.0, dur: 3.5, entrySig: 'Sell Breakout', exitSig: 'Stop Loss', mfe: 0.15, mae: 1.0, tag: 'Breakout' },
        { num: 2, side: 'LONG', mult: 2.5, dur: 12.0, entrySig: 'Buy Support', exitSig: 'Take Profit', mfe: 2.7, mae: 0.25, tag: 'Pullback' },
        { num: 3, side: 'LONG', mult: 1.2, dur: 8.5, entrySig: 'Buy Support', exitSig: 'Manual Exit', mfe: 1.8, mae: 0.35, tag: 'Pullback' },
        { num: 4, side: 'SHORT', mult: -1.0, dur: 2.0, entrySig: 'Sell Breakout', exitSig: 'Stop Loss', mfe: 0.05, mae: 1.05, tag: 'Breakout' },
        { num: 5, side: 'SHORT', mult: 0.0, dur: 4.0, entrySig: 'Sell Breakout', exitSig: 'Trailing Stop', mfe: 0.5, mae: 0.45, tag: 'Breakout' },
        { num: 6, side: 'LONG', mult: 3.5, dur: 24.5, entrySig: 'Buy Breakout', exitSig: 'Take Profit', mfe: 3.6, mae: 0.15, tag: 'Breakout' },
        { num: 7, side: 'LONG', mult: -1.0, dur: 1.5, entrySig: 'Buy Support', exitSig: 'Stop Loss', mfe: 0.1, mae: 1.0, tag: 'Pullback' },
        { num: 8, side: 'SHORT', mult: 2.1, dur: 15.0, entrySig: 'Sell Resistance', exitSig: 'Trailing Stop', mfe: 2.3, mae: 0.3, tag: 'Mean Reversion' },
        { num: 9, side: 'SHORT', mult: -0.5, dur: 5.5, entrySig: 'Sell Resistance', exitSig: 'Trailing Stop', mfe: 0.8, mae: 0.9, tag: 'Mean Reversion' },
        { num: 10, side: 'LONG', mult: 4.2, dur: 36.0, entrySig: 'Buy Breakout', exitSig: 'Take Profit', mfe: 4.5, mae: 0.2, tag: 'Breakout' },
        { num: 11, side: 'LONG', mult: -1.0, dur: 3.0, entrySig: 'Buy Support', exitSig: 'Stop Loss', mfe: 0.2, mae: 1.0, tag: 'Pullback' },
        { num: 12, side: 'SHORT', mult: -1.0, dur: 2.5, entrySig: 'Sell Breakout', exitSig: 'Stop Loss', mfe: 0.1, mae: 1.0, tag: 'Breakout' },
        { num: 13, side: 'LONG', mult: 1.8, dur: 10.0, entrySig: 'Buy Breakout', exitSig: 'Trailing Stop', mfe: 2.2, mae: 0.4, tag: 'Breakout' },
        { num: 14, side: 'SHORT', mult: 0.0, dur: 6.0, entrySig: 'Sell Resistance', exitSig: 'Trailing Stop', mfe: 0.4, mae: 0.5, tag: 'Mean Reversion' },
        { num: 15, side: 'LONG', mult: 3.0, dur: 18.0, entrySig: 'Buy Support', exitSig: 'Take Profit', mfe: 3.1, mae: 0.1, tag: 'Pullback' },
    ];
    let cumulativePnl = 0;
    const tradesData = [];
    for (let i = 0; i < tradeTemplates.length; i++) {
        const t = tradeTemplates[i];
        const netPnlUsd = t.mult * riskAmount;
        cumulativePnl += netPnlUsd;
        // Build timestamps
        const entryTime = new Date(now.getTime() - (30 - i) * 24 * 60 * 60 * 1000); // spread over 30 days
        const exitTime = new Date(entryTime.getTime() + t.dur * 60 * 60 * 1000);
        // Entry and exit prices
        const entryPrice = t.side === 'LONG' ? 2300 + i * 5 : 2350 - i * 5;
        // PnL = (exit - entry) * qty for buy.
        // Let's deduce qty based on $100 risk. If stop loss is $10 away, qty is 10.
        const stopLossDistance = 10.0;
        const qty = riskAmount / stopLossDistance;
        const exitPrice = t.side === 'LONG'
            ? entryPrice + (netPnlUsd / qty)
            : entryPrice - (netPnlUsd / qty);
        const result = netPnlUsd > 0 ? 'WIN' : netPnlUsd < 0 ? 'LOSS' : 'BE';
        tradesData.push({
            sessionId: csvSession.id,
            source: 'CSV',
            tradeNumber: t.num,
            symbol: csvSession.symbol,
            timeframe: csvSession.timeframe,
            side: t.side,
            entryTime,
            exitTime,
            entryPrice,
            exitPrice,
            qty,
            positionValue: entryPrice * qty,
            netPnlUsd,
            netPnlPct: (netPnlUsd / csvSession.initialBalance) * 100,
            netPnlIdr: netPnlUsd * csvSession.usdIdrRate,
            favorableExcursionUsd: t.mfe * riskAmount,
            favorableExcursionPct: ((t.mfe * riskAmount) / (entryPrice * qty)) * 100,
            adverseExcursionUsd: t.mae * riskAmount,
            adverseExcursionPct: ((t.mae * riskAmount) / (entryPrice * qty)) * 100,
            cumulativePnlUsd: cumulativePnl,
            cumulativePnlPct: (cumulativePnl / csvSession.initialBalance) * 100,
            entrySignal: t.entrySig,
            exitSignal: t.exitSig,
            setupTag: t.tag,
            status: 'CLOSED',
            result,
            rMultiple: t.mult,
            plannedRR: t.side === 'LONG' ? 3.0 : 2.0,
            riskUsd: riskAmount,
            notes: `Demo Trade #${t.num} showing a ${result} result for ${t.side} breakout/pullback setup.`,
        });
    }
    await prisma.trade.createMany({ data: tradesData });
    // Generate 2 invalid trade records for demonstrating the error log
    await prisma.invalidTrade.createMany({
        data: [
            {
                sessionId: csvSession.id,
                tradeNumber: 16,
                reason: 'Trade kehilangan baris Exit (Hanya ada Entry).',
                rawRows: JSON.stringify([
                    {
                        'Trade number': '16',
                        Type: 'Entry long',
                        'Date and time': new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                        Signal: 'Buy Breakout',
                        'Price USD': '2380.50',
                        'Size (qty)': '10',
                    },
                ]),
            },
            {
                sessionId: csvSession.id,
                tradeNumber: 17,
                reason: 'Format tanggal Entry tidak valid: "INVALID_DATE_TIME"',
                rawRows: JSON.stringify([
                    {
                        'Trade number': '17',
                        Type: 'Entry short',
                        'Date and time': 'INVALID_DATE_TIME',
                        Signal: 'Sell Resistance',
                        'Price USD': '2395.00',
                        'Size (qty)': '10',
                    },
                    {
                        'Trade number': '17',
                        Type: 'Exit short',
                        'Date and time': new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                        Signal: 'Stop Loss',
                        'Price USD': '2405.00',
                        'Size (qty)': '10',
                    },
                ]),
            },
        ],
    });
    // 2. CREATE WEBHOOK SESSION
    const webhookSession = await prisma.backtestSession.create({
        data: {
            name: 'TradingView Webhook Session',
            sourceMode: 'WEBHOOK',
            symbol: 'GBPUSD',
            marketType: 'Forex',
            timeframe: 'M5',
            initialBalance: 5000.0,
            balanceCurrency: 'USD',
            usdIdrRate: 16350.0,
            riskMode: 'FIXED_USD',
            riskValue: 50.0, // $50 risk per trade
            notes: 'This session receives real-time signals from TradingView Pine Script alert webhooks.',
        },
    });
    // Generate some closed and open webhook trades
    const webhookTrades = [
        {
            sessionId: webhookSession.id,
            source: 'WEBHOOK',
            tradeId: 'demo_web_001',
            symbol: 'GBPUSD',
            timeframe: 'M5',
            side: 'LONG',
            entryTime: new Date(now.getTime() - 5 * 60 * 60 * 1000),
            exitTime: new Date(now.getTime() - 4 * 60 * 60 * 1000),
            entryPrice: 1.27250,
            exitPrice: 1.27550, // Win: +30 pips
            qty: 16666, // position size for $50 risk with 30 pip (0.0030) SL
            positionValue: 1.27250 * 16666,
            netPnlUsd: 50.0, // 1R Win
            netPnlPct: 1.0,
            netPnlIdr: 50.0 * 16350,
            cumulativePnlUsd: 50.0,
            cumulativePnlPct: 1.0,
            entrySignal: 'SNR Entry',
            exitSignal: 'Target Hit',
            setupTag: 'SNR + MTF confirmation',
            status: 'CLOSED',
            result: 'WIN',
            rMultiple: 1.0,
            plannedRR: 2.0,
            riskUsd: 50.0,
            notes: 'First webhook closed trade. Nice win on SNR retest.',
        },
        {
            sessionId: webhookSession.id,
            source: 'WEBHOOK',
            tradeId: 'demo_web_002',
            symbol: 'GBPUSD',
            timeframe: 'M5',
            side: 'SHORT',
            entryTime: new Date(now.getTime() - 3 * 60 * 60 * 1000),
            exitTime: new Date(now.getTime() - 2.5 * 60 * 60 * 1000),
            entryPrice: 1.27600,
            exitPrice: 1.27800, // Loss: -20 pips
            qty: 25000, // $50 risk for 20 pip SL
            positionValue: 1.27600 * 25000,
            netPnlUsd: -50.0,
            netPnlPct: -1.0,
            netPnlIdr: -50.0 * 16350,
            cumulativePnlUsd: 0.0,
            cumulativePnlPct: 0.0,
            entrySignal: 'Fibo Retest',
            exitSignal: 'Stop Hit',
            setupTag: 'Fibo 61.8',
            status: 'CLOSED',
            result: 'LOSS',
            rMultiple: -1.0,
            plannedRR: 3.0,
            riskUsd: 50.0,
            notes: 'Stopped out quickly as market rallied.',
        },
        // Open Trade
        {
            sessionId: webhookSession.id,
            source: 'WEBHOOK',
            tradeId: 'demo_web_003',
            symbol: 'GBPUSD',
            timeframe: 'M5',
            side: 'LONG',
            entryTime: new Date(now.getTime() - 30 * 60 * 1000), // 30 minutes ago
            entryPrice: 1.27400,
            qty: 16666,
            positionValue: 1.27400 * 16666,
            entrySignal: 'EMA Cross',
            setupTag: 'EMA 50/200 Cross',
            status: 'OPEN',
            plannedRR: 2.5,
            riskUsd: 50.0,
            notes: 'Currently active trade opened by webhook.',
        },
    ];
    for (const wt of webhookTrades) {
        await prisma.trade.create({ data: wt });
    }
    // Create WebhookEvents logs for debugging demonstration
    await prisma.webhookEvent.createMany({
        data: [
            {
                receivedAt: new Date(now.getTime() - 5.1 * 60 * 60 * 1000),
                eventType: 'ENTRY',
                tradeId: 'demo_web_001',
                status: 'SUCCESS',
                rawPayload: JSON.stringify({
                    secret: 'replayfx_secret_token_123',
                    source: 'tradingview',
                    event: 'ENTRY',
                    trade_id: 'demo_web_001',
                    symbol: 'GBPUSD',
                    timeframe: 'M5',
                    side: 'buy',
                    order_id: 'LONG',
                    action: 'buy',
                    fill_price: 1.27250,
                    planned_entry: 1.27250,
                    sl: 1.26950,
                    tp: 1.27850,
                    rr: 2.0,
                    risk_usd: 50,
                    setup: 'SNR + MTF confirmation',
                    bar_time: now.getTime() - 5.1 * 60 * 60 * 1000,
                }),
            },
            {
                receivedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
                eventType: 'EXIT',
                tradeId: 'demo_web_001',
                status: 'SUCCESS',
                rawPayload: JSON.stringify({
                    secret: 'replayfx_secret_token_123',
                    source: 'tradingview',
                    event: 'EXIT',
                    trade_id: 'demo_web_001',
                    symbol: 'GBPUSD',
                    timeframe: 'M5',
                    side: 'buy',
                    action: 'sell',
                    fill_price: 1.27550,
                    bar_time: now.getTime() - 4 * 60 * 60 * 1000,
                }),
            },
            // Orphan event demo
            {
                receivedAt: new Date(now.getTime() - 10 * 60 * 1000),
                eventType: 'EXIT',
                tradeId: 'orphan_trade_999',
                status: 'ORPHAN',
                errorMessage: 'Gagal mencocokkan trade_id "orphan_trade_999" karena event ENTRY tidak ditemukan.',
                rawPayload: JSON.stringify({
                    secret: 'replayfx_secret_token_123',
                    source: 'tradingview',
                    event: 'EXIT',
                    trade_id: 'orphan_trade_999',
                    symbol: 'GBPUSD',
                    timeframe: 'M5',
                    side: 'sell',
                    action: 'buy',
                    fill_price: 1.27100,
                    bar_time: now.getTime() - 10 * 60 * 1000,
                }),
            },
            // Error authentication demo
            {
                receivedAt: new Date(now.getTime() - 5 * 60 * 1000),
                eventType: 'ENTRY',
                tradeId: 'error_trade_888',
                status: 'ERROR',
                errorMessage: 'Token rahasia (secret token) webhook tidak valid.',
                rawPayload: JSON.stringify({
                    secret: 'WRONG_TOKEN_ALERT',
                    source: 'tradingview',
                    event: 'ENTRY',
                    trade_id: 'error_trade_888',
                    symbol: 'GBPUSD',
                    fill_price: 1.27100,
                }),
            },
        ],
    });
}
