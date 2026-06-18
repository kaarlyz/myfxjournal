"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
const express_1 = require("express");
const prisma_1 = require("../prisma");
const seeder_1 = require("../utils/seeder");
const router = (0, express_1.Router)();
// Helper to get all settings key-values as a structured object
async function getSettings() {
    const settingsList = await prisma_1.prisma.systemSetting.findMany();
    const settingsMap = {};
    settingsList.forEach((s) => {
        settingsMap[s.key] = s.value;
    });
    // Supply default fallbacks if database is empty
    return {
        usdIdrRate: parseFloat(settingsMap['usdIdrRate'] || '16200'),
        defaultRiskMode: settingsMap['defaultRiskMode'] || 'FIXED_USD',
        defaultRiskValue: parseFloat(settingsMap['defaultRiskValue'] || '100'),
        secretToken: settingsMap['secretToken'] || 'replayfx_secret_token_123',
    };
}
// GET /api/settings
router.get('/', async (req, res) => {
    try {
        const settings = await getSettings();
        return res.json(settings);
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        return res.status(500).json({ error: 'Gagal memuat pengaturan.' });
    }
});
// POST /api/settings
router.post('/', async (req, res) => {
    try {
        const { usdIdrRate, defaultRiskMode, defaultRiskValue, secretToken } = req.body;
        // Update settings in database
        const updates = [
            prisma_1.prisma.systemSetting.upsert({
                where: { key: 'usdIdrRate' },
                update: { value: String(usdIdrRate || '16200') },
                create: { key: 'usdIdrRate', value: String(usdIdrRate || '16200') },
            }),
            prisma_1.prisma.systemSetting.upsert({
                where: { key: 'defaultRiskMode' },
                update: { value: String(defaultRiskMode || 'FIXED_USD') },
                create: { key: 'defaultRiskMode', value: String(defaultRiskMode || 'FIXED_USD') },
            }),
            prisma_1.prisma.systemSetting.upsert({
                where: { key: 'defaultRiskValue' },
                update: { value: String(defaultRiskValue || '100') },
                create: { key: 'defaultRiskValue', value: String(defaultRiskValue || '100') },
            }),
            prisma_1.prisma.systemSetting.upsert({
                where: { key: 'secretToken' },
                update: { value: String(secretToken || 'replayfx_secret_token_123') },
                create: { key: 'secretToken', value: String(secretToken || 'replayfx_secret_token_123') },
            }),
        ];
        await prisma_1.prisma.$transaction(updates);
        // Also, if usdIdrRate is updated, we update ALL existing trades' netPnlIdr!
        // This allows the currency rates changes to propagate immediately through the entire journal history.
        if (usdIdrRate) {
            const rate = parseFloat(usdIdrRate);
            const trades = await prisma_1.prisma.trade.findMany({
                where: { netPnlUsd: { not: null } }
            });
            const tradeUpdates = trades.map((t) => prisma_1.prisma.trade.update({
                where: { id: t.id },
                data: { netPnlIdr: (t.netPnlUsd || 0) * rate }
            }));
            if (tradeUpdates.length > 0) {
                await prisma_1.prisma.$transaction(tradeUpdates);
            }
        }
        const newSettings = await getSettings();
        return res.json({ message: 'Pengaturan berhasil diperbarui.', settings: newSettings });
    }
    catch (error) {
        console.error('Error updating settings:', error);
        return res.status(500).json({ error: 'Gagal memperbarui pengaturan.' });
    }
});
// POST /api/settings/seed-demo
router.post('/seed-demo', async (req, res) => {
    try {
        await (0, seeder_1.seedDemoData)(prisma_1.prisma);
        return res.json({ message: 'Database berhasil diisi dengan data demo.' });
    }
    catch (error) {
        console.error('Error seeding demo data:', error);
        return res.status(500).json({ error: 'Gagal mengisi data demo: ' + error.message });
    }
});
// POST /api/settings/reset
router.post('/reset', async (req, res) => {
    try {
        await prisma_1.prisma.trade.deleteMany({});
        await prisma_1.prisma.invalidTrade.deleteMany({});
        await prisma_1.prisma.backtestSession.deleteMany({});
        await prisma_1.prisma.webhookEvent.deleteMany({});
        await prisma_1.prisma.systemSetting.deleteMany({});
        // Reset default settings
        await prisma_1.prisma.systemSetting.createMany({
            data: [
                { key: 'usdIdrRate', value: '16200' },
                { key: 'defaultRiskMode', value: 'FIXED_USD' },
                { key: 'defaultRiskValue', value: '100' },
                { key: 'secretToken', value: 'replayfx_secret_token_123' },
            ],
        });
        return res.json({ message: 'Database berhasil di-reset sepenuhnya.' });
    }
    catch (error) {
        console.error('Error resetting database:', error);
        return res.status(500).json({ error: 'Gagal mereset database.' });
    }
});
exports.default = router;
