import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './prisma';

// Import routers
import settingsRouter from './routes/settings';
import sessionsRouter from './routes/sessions';
import tradesRouter from './routes/trades';
import webhookRouter from './routes/webhook';
import accountsRouter from './routes/accounts';
import liveTradesRouter from './routes/live-trades';
import mt5IntegrationRouter from './routes/mt5-integration';
import integrationSettingsRouter from './routes/integration-settings';
import eventsRouter from './routes/events';
import telegramRouter from './routes/telegram';
import whatsappRouter from './routes/whatsapp';
import integrationLogsRouter from './routes/integration-logs';
import tradingViewRouter from './routes/tradingview';
import journalNotesRouter from './routes/journal-notes';
import mt5ReportsRouter from './routes/mt5-reports';
import { logIntegration } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // For local/personal development, accept all origins
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve static assets if uploads are used
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  return res.json({ status: 'OK', message: 'ReplayFX Journal backend is online.' });
});

// Mount routes
app.use('/api/settings', settingsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/live-trades', liveTradesRouter);
app.use('/api/integrations/mt5', mt5IntegrationRouter);
app.use('/api/integrations/settings', integrationSettingsRouter);
app.use('/api/integrations/telegram', telegramRouter);
app.use('/api/integrations/whatsapp', whatsappRouter);
app.use('/api/integrations/logs', integrationLogsRouter);
app.use('/api/integrations/tradingview', tradingViewRouter);
app.use('/api/journal-notes', journalNotesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/mt5-reports', mt5ReportsRouter);

// Handle 404 for API routes
app.use('/api', (req: Request, res: Response) => {
  logIntegration('SYSTEM', 'API_NOT_FOUND', 'WARNING', `Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    ok: false, 
    error: 'API route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Global Error Handler:', err);
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || 'Internal Server Error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Initialize database check and listen
async function startServer() {
  try {
    // Check DB Connection
    await prisma.$connect();
    console.log('Database SQLite berhasil terhubung via Prisma.');

    // Seed default settings if database is empty
    const settingsCount = await prisma.systemSetting.count();
    if (settingsCount === 0) {
      await prisma.systemSetting.createMany({
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
  } catch (error) {
    console.error('Gagal memulai server:', error);
    process.exit(1);
  }
}

startServer();
