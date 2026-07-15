<div align="center">

<img src="pict.jpeg" alt="KAFX Journal" width="100%" />

# KAFX Journal

### Professional Trading Journal & Analytics Platform

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)
[![SQLite](https://img.shields.io/badge/SQLite-embedded-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)
[![i18n](https://img.shields.io/badge/i18n-ID%20%7C%20EN-1040C0?style=flat-square)](https://www.i18next.com)

> **KAFX Journal** adalah trading journal yang dibangun khusus untuk trader aktif — mendukung backtest TradingView, live monitoring MT5, integrasi Telegram & WhatsApp, EA signal approval, Monte Carlo simulation, dan Prop Firm challenge tracking — semua dalam satu aplikasi lokal yang berjalan di mesinmu sendiri.

[Fitur](#-fitur-utama) · [🏗 Arsitektur](#-arsitektur) · [🚀 Quick Start](#-quick-start) · [📡 API Reference](#-api-reference) · [🌍 Multi-Bahasa](#-multi-bahasa)

</div>

---

## Fitur Utama

###  Backtest Analytics
| Fitur | Deskripsi |
|-------|-----------|
| **Import CSV** | Import langsung dari TradingView Strategy Tester dengan mode Replace / Append / Smart Merge |
| **Import MT5 XLSX** | Parse report Strategy Tester MT5 format XLSX secara otomatis |
| **Dashboard Analisa** | 6 tab analitik: Overview, Risk Recalc, RR Lab, Timing, Streaks, Pair Breakdown |
| **Journal Calendar** | Kalender bulanan dengan snapshot PnL harian dan catatan jurnal persisten per hari |
| **Compare Sessions** | Bandingkan 2 sesi backtest side-by-side dengan synchronized crosshair Recharts |
| **Report Print** | Export laporan profesional siap cetak ke PDF |
| **Setup Review** | Filter dan review trade berdasarkan setup tag |

### Live Trading & MT5
| Fitur | Deskripsi |
|-------|-----------|
| **Live Journal** | Pantau posisi terbuka & histori trade dari akun MT5 real/demo secara real-time |
| **Trading Accounts** | Kelola multiple akun MT5 (Real, Demo, Prop Firm, Cent) |
| **MT5 Sync** | Sinkronisasi otomatis balance, equity, margin, floating PnL per akun |
| **Portfolio Overview** | Aggregasi balance, equity, dan floating dari semua akun tersambung |

### Integrations & Automation
| Fitur | Deskripsi |
|-------|-----------|
| **TradingView Webhook** | Terima sinyal dari TradingView Alert via webhook lokal (butuh tunnel untuk akses publik) |
| **EA Control Center** | Approve/reject sinyal dari MT5 Expert Advisor secara manual dengan riwayat keputusan |
| **Telegram Bot** | Notifikasi trade dan monitoring balance/equity via bot Telegram (polling mode) |
| **WhatsApp (Twilio)** | Notifikasi monitoring via WhatsApp menggunakan Twilio API |
| **Webhook Monitor** | Pantau, debug, dan test semua sinyal masuk secara real-time via SSE |

### Tools & Simulator
| Fitur | Deskripsi |
|-------|-----------|
| **Risk Calculator** | Kalkulasi lot size, SL dalam pips, dan risk dalam USD/persen real-time |
| **Monte Carlo Simulator** | Simulasi ribuan skenario berdasarkan histori trade, hitung Risk of Ruin, Best/Worst Case |
| **Prop Firm Simulator** | Cek apakah histori backtest lulus aturan prop firm (FTMO, MFF, The5ers, dll.) |
| **Quick Logger** | Catat trade manual dengan cepat tanpa perlu membuat sesi terlebih dahulu |

---

## Arsitektur

```
myfxjournal/
├── client/                       # React + Vite frontend (port 3000)
│   └── src/
│       ├── App.tsx               # Router, layout, AnimatePresence
│       ├── pages/                # 18 halaman aplikasi
│       │   ├── Home.tsx                  # Dashboard utama + session list
│       │   ├── Dashboard.tsx             # Analitik backtest 6-tab
│       │   ├── LiveJournal.tsx           # Live MT5 monitoring
│       │   ├── Accounts.tsx              # Kelola akun trading
│       │   ├── EAControlCenter.tsx       # Approve/reject EA signals
│       │   ├── Integrations.tsx          # Setup semua integrasi
│       │   ├── WebhookMonitor.tsx        # Monitor sinyal masuk
│       │   ├── MonteCarlo.tsx            # Monte Carlo simulator
│       │   ├── PropFirmSimulator.tsx     # Prop firm challenge sim
│       │   ├── MT5ReportDashboard.tsx    # MT5 XLSX analytics
│       │   ├── CSVImport.tsx             # Import + merge CSV
│       │   ├── CreateSession.tsx         # Buat sesi baru
│       │   ├── CompareSessions.tsx       # Bandingkan 2 sesi
│       │   ├── Settings.tsx              # Pengaturan app
│       │   ├── QuickLogger.tsx           # Input trade cepat
│       │   ├── SetupReview.tsx           # Review by setup tag
│       │   └── ReportPrint.tsx           # Print-ready report
│       ├── components/           # Komponen reusable
│       │   ├── Sidebar.tsx               # Navigasi utama + LanguageSwitcher
│       │   ├── DashboardCharts.tsx       # Recharts analytics (6 tab)
│       │   ├── TradeTable.tsx            # Tabel trade interaktif + filter
│       │   ├── JournalCalendar.tsx       # Kalender PnL bulanan
│       │   ├── LanguageSwitcher.tsx      # Toggle bahasa ID/EN
│       │   ├── RiskCalculator.tsx        # Kalkulator risiko inline
│       │   ├── TradeDetailModal.tsx      # Modal detail trade
│       │   ├── WidgetErrorBoundary.tsx   # Error isolation per widget
│       │   ├── MetricCard.tsx            # Kartu metrik ringkasan
│       │   └── ui/                       # Primitives: Button, Input, dll.
│       ├── store/                # Zustand global state
│       │   ├── useJournalStore.ts        # Session & backtest state
│       │   └── useLiveJournalStore.ts    # Live account state
│       ├── i18n/                 # Internationalization
│       │   ├── config.ts                 # i18next + LanguageDetector setup
│       │   └── locales/
│       │       ├── id/                   # 18 namespace JSON (Bahasa Indonesia)
│       │       └── en/                   # 18 namespace JSON (English)
│       ├── hooks/                # Custom React hooks
│       └── utils/                # Helper: numberUtils, calendarStats, dll.
│
├── server/                       # Express.js + Prisma backend (port 5000)
│   └── src/
│       ├── index.ts              # Entry point, middleware, route mounting
│       ├── prisma.ts             # Prisma client singleton
│       └── routes/               # 17 route modules
│           ├── sessions.ts               # CRUD backtest sessions + CSV import
│           ├── trades.ts                 # CRUD individual trades
│           ├── accounts.ts               # Trading account management
│           ├── live-trades.ts            # MT5 live position snapshot
│           ├── webhook.ts                # TradingView webhook receiver
│           ├── tradingview.ts            # TradingView integration settings
│           ├── ea-control.ts             # EA signal approval workflow
│           ├── telegram.ts               # Telegram bot + polling
│           ├── whatsapp.ts               # WhatsApp via Twilio
│           ├── mt5-integration.ts        # MT5 sync service
│           ├── mt5-reports.ts            # XLSX report parser
│           ├── integration-settings.ts   # Konfigurasi integrasi
│           ├── journal-notes.ts          # Daily journal notes
│           ├── settings.ts               # App settings
│           ├── events.ts                 # SSE stream untuk real-time
│           └── integration-logs.ts       # Log semua event integrasi
│
├── shared/
│   └── types.ts                  # TypeScript types shared client & server
│
└── package.json                  # Root: dev, prisma:push, prisma:studio
```

### Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Frontend Framework** | React 18 + TypeScript 5 + Vite 5 |
| **Styling** | Tailwind CSS v3 (Bauhaus design system) |
| **Animations** | Framer Motion (page transitions + micro-animations) |
| **Charts** | Recharts (equity curves, bar charts, scatter plots) |
| **Routing** | React Router v7 |
| **State Management** | Zustand |
| **Internationalization** | react-i18next + i18next-browser-languagedetector |
| **Backend** | Node.js 18 + Express.js |
| **ORM** | Prisma |
| **Database** | SQLite (embedded, zero config, file-based) |
| **Bot** | node-telegram-bot-api |
| **Notifications** | Twilio SDK (WhatsApp) |
| **CSV Parser** | PapaParse |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** — [download](https://nodejs.org)
- **npm 9+**

### 1. Clone & Install

```bash
git clone https://github.com/kaarlyz/myfxjournal.git
cd myfxjournal
npm install
```

> Script `postinstall` secara otomatis menginstall dependencies untuk `client/` dan `server/`.

### 2. Setup Database

```bash
# Generate Prisma client (wajib setelah clone pertama kali)
npm run prisma:generate

# Apply schema ke SQLite (file database dibuat otomatis di server/prisma/dev.db)
npm run prisma:push
```

### 3. Environment Variables (Opsional)

Buat file `server/.env` untuk mengaktifkan integrasi eksternal:

```env
# Server port (default: 5000)
PORT=5000

# Telegram Bot (opsional — dari @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Twilio WhatsApp (opsional)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

> **Tanpa `.env`** aplikasi tetap berjalan normal. Hanya fitur Telegram dan WhatsApp yang membutuhkan konfigurasi ini.

### 4. Jalankan Development Server

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| 🖥 Frontend (React) | http://localhost:3000 |
| 🔌 Backend API (Express) | http://localhost:5000 |
| 🏥 Health Check | http://localhost:5000/api/health |

---

## 📡 API Reference

### Sessions & Trades
```http
GET    /api/sessions              # Daftar semua sesi backtest
POST   /api/sessions              # Buat sesi baru
GET    /api/sessions/:id          # Detail sesi lengkap + trades
PUT    /api/sessions/:id          # Update nama / catatan sesi
DELETE /api/sessions/:id          # Hapus sesi beserta semua tradenya
POST   /api/sessions/:id/import   # Import CSV ke sesi (replace/append/smart-merge)

GET    /api/trades/:sessionId     # Semua trade dalam sesi
POST   /api/trades                # Tambah trade manual
PUT    /api/trades/:id            # Update trade
DELETE /api/trades/:id            # Hapus trade
```

### Accounts & Live Trading
```http
GET    /api/accounts              # Daftar akun trading
POST   /api/accounts              # Tambah akun baru
PUT    /api/accounts/:id          # Update detail akun
DELETE /api/accounts/:id          # Hapus akun

POST   /api/live-trades/sync/:id  # Trigger snapshot sync dari MT5
GET    /api/live-trades/:id       # Posisi terbuka + histori trade akun
```

### Integrations
```http
GET    /api/webhook               # Status webhook server
POST   /api/webhook/tradingview   # Endpoint penerima sinyal TradingView

GET    /api/integrations/settings # Baca semua konfigurasi integrasi
PUT    /api/integrations/settings # Simpan konfigurasi integrasi

POST   /api/integrations/telegram/test      # Test koneksi Telegram bot
POST   /api/integrations/whatsapp/test      # Test koneksi WhatsApp
POST   /api/integrations/mt5/sync/:id       # Trigger MT5 sync manual
GET    /api/integrations/logs               # Log event semua integrasi

GET    /api/events                # SSE stream untuk real-time updates
```

### EA Control Center
```http
GET    /api/ea-control/signals              # Daftar pending signals
POST   /api/ea-control/signals/:id/decide  # Approve / reject signal
DELETE /api/ea-control/signals              # Clear semua pending signals
```

### Misc
```http
GET    /api/journal-notes/:scope/:contextId/:dateKey  # Baca catatan harian
POST   /api/journal-notes                             # Simpan catatan harian
GET    /api/settings                                  # Baca app settings
PUT    /api/settings                                  # Update app settings
GET    /api/health                                    # Health check
```

---

## 🌍 Multi-Bahasa

KAFX Journal mendukung:
- 🇮🇩 **Bahasa Indonesia** (default)
- 🇺🇸 **English**

Ganti bahasa via tombol **🇮🇩 ID / 🇺🇸 EN** di pojok kiri bawah sidebar. Pilihan tersimpan otomatis.

Locale files ada di `client/src/i18n/locales/` — 18 namespace JSON per bahasa:

```
locales/
├── id/  (Indonesian)    └── en/  (English)
    ├── common.json           ├── common.json
    ├── home.json             ├── home.json
    ├── sidebar.json          ├── sidebar.json
    ├── dashboard.json        ├── dashboard.json
    ├── settings.json         ├── settings.json
    ├── accounts.json         ├── accounts.json
    ├── createSession.json    ├── createSession.json
    ├── csvImport.json        ├── csvImport.json
    ├── liveJournal.json      ├── liveJournal.json
    ├── eaControl.json        ├── eaControl.json
    ├── webhook.json          ├── webhook.json
    ├── integrations.json     ├── integrations.json
    ├── monteCarlo.json       ├── monteCarlo.json
    ├── propFirm.json         ├── propFirm.json
    ├── compareSessions.json  ├── compareSessions.json
    ├── mt5.json              ├── mt5.json
    ├── tradeModal.json       ├── tradeModal.json
    └── quickLogger.json      └── quickLogger.json
```

---

## 🗄 Database Schema

```prisma
model Session {
  id, name, symbol, timeframe, accountMode, initialBalance
  notes, tags, createdAt, trades Trade[]
}

model Trade {
  id, sessionId, symbol, side, lots
  entryPrice, exitPrice, entryTime, exitTime
  sl, tp, pnl, commission, swap, netPnlUsd
  setupTag, notes, status
}

model TradingAccount {
  id, name, accountNumber, broker, server
  accountType (DEMO/REAL/PROP), currency, leverage
  balance, equity, margin, floatingPnl, lastSync
}

model LiveTrade {
  id, accountId, symbol, type, lots
  openPrice, currentPrice, sl, tp
  floatingPnl, openTime, status
}

model EASignal {
  id, symbol, action, price, sl, tp, lots
  status (PENDING/APPROVED/REJECTED/DISMISSED)
  receivedAt, decidedAt
}

model IntegrationSetting { key, value }
model DailyJournalNote   { scope, contextId, dateKey, content }
model IntegrationLog     { id, source, message, level, createdAt }
model MT5Report          { id, filename, rawData, createdAt }
```

---

## 🛠 Scripts

```bash
# Development (server + client bersamaan via concurrently)
npm run dev

# Database management
npm run prisma:generate    # Regenerate Prisma client (wajib setelah clone)
npm run prisma:push        # Apply schema changes ke database
npm run prisma:studio      # Buka Prisma Studio (database GUI visual)

# Build
cd client && npm run build   # Build React app ke dist/
cd server && npm run build   # Compile TypeScript server
```

---

## 🔒 Security & Privacy

| Aspek | Status |
|-------|--------|
| Data tersimpan lokal (SQLite) | ✅ Tidak ada cloud |
| Remote trade execution | ❌ Sengaja dinonaktifkan |
| EA signal auto-execution | ❌ Selalu butuh approve manual |
| Tracking / analytics | ❌ Tidak ada |
| Webhook akses publik | ⚠️ Butuh tunnel (cloudflared / ngrok) |

---

## 📦 Changelog

| Versi | Perubahan |
|-------|-----------|
| v2.1 | Multi-bahasa ID/EN (react-i18next), LanguageSwitcher, 36 locale files |
| v2.0 | Bauhaus Design System, full page migration dari dark ke flat light |
| v1.9 | EA Control Center improvements, signal dismiss & clear all |
| v1.8 | Journal Calendar, Daily Notes persistence via SQLite |
| v1.7 | Framer Motion page transitions, cross-filtering charts, scatter plots |
| v1.6 | MT5 Report Analyzer, XLSX import, MT5 equity curve dashboard |
| v1.5 | Onboarding flow, Compare Sessions, synchronized crosshair |
| v1.0 | Initial release: CSV import, backtest analytics, live journal |

---

## 👤 Author

**Eka Restu Syahputra**

"bang ko projectnya jelek?"

---

<div align="center">

**KAFX Journal v2.1** · React + Express + SQLite + Prisma  
*ngapain ngoding mending scrool fesnuk*

</div>

