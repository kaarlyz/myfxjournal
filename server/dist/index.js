"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const prisma_1 = __importDefault(require("./prisma"));
// Import routers
const settings_1 = __importDefault(require("./routes/settings"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const trades_1 = __importDefault(require("./routes/trades"));
const webhook_1 = __importDefault(require("./routes/webhook"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)({
    origin: '*', // For local/personal development, accept all origins
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve static assets if uploads are used
app.use('/uploads', express_1.default.static('uploads'));
// Health check endpoint
app.get('/api/health', (req, res) => {
    return res.json({ status: 'OK', message: 'ReplayFX Journal backend is online.' });
});
// Mount routes
app.use('/api/settings', settings_1.default);
app.use('/api/sessions', sessions_1.default);
app.use('/api/trades', trades_1.default);
app.use('/api/webhook', webhook_1.default);
// Initialize database check and listen
async function startServer() {
    try {
        // Check DB Connection
        await prisma_1.default.$connect();
        console.log('Database SQLite berhasil terhubung via Prisma.');
        // Seed default settings if database is empty
        const settingsCount = await prisma_1.default.systemSetting.count();
        if (settingsCount === 0) {
            await prisma_1.default.systemSetting.createMany({
                data: [
                    { key: 'usdIdrRate', value: '16200' },
                    { key: 'defaultRiskMode', value: 'FIXED_USD' },
                    { key: 'defaultRiskValue', value: '100' },
                    { key: 'secretToken', value: 'replayfx_secret_token_123' },
                ],
            });
            console.log('Pengaturan default berhasil diinisialisasi di SQLite.');
        }
        app.listen(PORT, () => {
            console.log(`Server ReplayFX Journal berjalan di: http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('Gagal memulai server:', error);
        process.exit(1);
    }
}
startServer();
