"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const router = (0, express_1.Router)();
// PUT /api/trades/:id - Update trade details (setupTag, notes, screenshotUrl)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { setupTag, notes, screenshotUrl } = req.body;
        const trade = await prisma_1.prisma.trade.findUnique({ where: { id } });
        if (!trade) {
            return res.status(404).json({ error: 'Trade tidak ditemukan.' });
        }
        const updatedTrade = await prisma_1.prisma.trade.update({
            where: { id },
            data: {
                setupTag: setupTag !== undefined ? setupTag : trade.setupTag,
                notes: notes !== undefined ? notes : trade.notes,
                screenshotUrl: screenshotUrl !== undefined ? screenshotUrl : trade.screenshotUrl,
            },
        });
        return res.json({ message: 'Trade berhasil diperbarui.', trade: updatedTrade });
    }
    catch (error) {
        console.error('Error updating trade:', error);
        return res.status(500).json({ error: 'Gagal memperbarui data trade.' });
    }
});
// DELETE /api/trades/:id - Delete a trade
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const trade = await prisma_1.prisma.trade.findUnique({ where: { id } });
        if (!trade) {
            return res.status(404).json({ error: 'Trade tidak ditemukan.' });
        }
        await prisma_1.prisma.trade.delete({ where: { id } });
        return res.json({ message: 'Trade berhasil dihapus.' });
    }
    catch (error) {
        console.error('Error deleting trade:', error);
        return res.status(500).json({ error: 'Gagal menghapus data trade.' });
    }
});
exports.default = router;
