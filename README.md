# ReplayFX Journal 📈

ReplayFX Journal adalah aplikasi fullstack web untuk mencatat, mengolah, dan menganalisis hasil backtest TradingView secara mandiri, didesain dengan visualisasi premium dark mode mirip Myfxbook pribadi.

## 🚀 Fitur Utama

1. **Mode CSV Import**:
   - Unggah file CSV Strategy Tester / List of Trades langsung hasil export TradingView.
   - Mengelompokkan transaksi otomatis berdasarkan kolom `Trade number` (Entry & Exit row).
   - Mendeteksi dan mengisolasi baris transaksi bermasalah (Invalid/Incomplete Trades) agar tidak merusak kalkulasi utama.
   - Pilihan overwrite (replace) sesi lama atau buat sesi baru saat upload ulang.

2. **Mode Webhook / Auto Entry**:
   - Endpoint backend `/api/webhook/tradingview` untuk menerima ENTRY dan EXIT dari TradingView Pine Script.
   - Menghitung posisi ukuran (quantity) adaptif berdasarkan resiko USD dan Stop Loss yang dipasang.
   - Menyimpan seluruh history log payload webhook (Sukses, Error, Orphan) untuk kebutuhan audit.
   - Halaman **Webhook Monitor** interaktif untuk melihat antrean open trades, closed trades, dan log error.

3. **Dashboard Statistik Lengkap**:
   - Lebih dari 30+ metrik finansial: Ending Balance, Winrate, Profit Factor, Gross Profit/Loss, Drawdowns, Expectancy (USD & R), streaks beruntun, Hold time, dan MFE/MAE excursions.
   - Chart interaktif Recharts: Kurva Ekuitas, Drawdown Curve, Distribusi PnL per trade, Setup Tag Performance, Sisi LONG vs SHORT, serta analisis waktu (Hari & Jam entry).
   - Filter, ledger pencarian, detail jurnal modal, dan fitur ekspor ke CSV/JSON.

---

## 📂 Struktur Folder Project

```
/ayra
├── package.json                   # Root package.json (concurrent runner)
├── README.md                      # Dokumentasi petunjuk aplikasi
├── shared/
│   └── types.ts                   # Type definition TypeScript bersama
├── examples/
│   ├── sample.csv                 # Sampel export Strategy Tester TradingView
│   ├── webhook_payload.json       # Contoh payload JSON untuk testing Webhook
│   └── replayfx_webhook.pine      # Template Pine Script TradingView Webhook
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Express Server Entrypoint
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── routes/                # Route controllers (sessions, trades, settings, webhook)
│   │   └── utils/                 # CsvParser & calculations engine
│   └── prisma/
│       ├── schema.prisma          # Prisma SQLite Models
│       └── dev.db                 # Database file SQLite lokal (dibuat saat init)
└── client/
    ├── package.json
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── index.css              # Custom styling (glassmorphism & scrollbar)
    │   ├── App.tsx                # Main router layout
    │   ├── store/                 # Zustand global store
    │   ├── components/            # Sidebar, MetricsCard, charts, ledger tables
    │   └── pages/                 # Home, CreateSession, CSVImport, WebhookMonitor, Settings
```

---

## 🛠️ Instalasi & Cara Menjalankan

Ikuti langkah mudah berikut untuk menjalankan aplikasi di lingkungan lokal Anda:

### Prasyarat
- Node.js versi 18 ke atas.
- NPM versi 9 ke atas.

### Langkah-langkah
1. **Buka folder root project**:
   ```bash
   cd /home/vallencia/Documents/ayra
   ```

2. **Instalasi Dependensi**:
   Instal semua modul server dan client secara otomatis dengan perintah berikut di root:
   ```bash
   npm install
   ```

3. **Migrasi Database SQLite**:
   Sinkronisasikan skema Prisma ke SQLite lokal dengan menjalankan:
   ```bash
   npm run prisma:push
   ```

4. **Jalankan Aplikasi Development**:
   Mulai server backend (port 5000) dan client frontend (port 3000) secara bersamaan:
   ```bash
   npm run dev
   ```
   Buka peramban (browser) Anda dan akses `http://localhost:3000`.

---

## 📈 Panduan Penggunaan Aplikasi

### 1. Cara Mengisi Data Demo (Instan)
- Pada saat pertama kali dijalankan, jika database masih kosong, Anda akan diarahkan ke halaman utama.
- Anda dapat mengklik tombol **"Jalankan Demo Mode (Seed Data)"** untuk mengisi SQLite dengan sampel transaksi backtest trend-following XAUUSD (15 trades) dan webhook log (open/closed/orphan) secara otomatis.

### 2. Cara Mengunggah File CSV TradingView
- Klik **"Import CSV TV"** di sidebar.
- Tarik (drag-and-drop) file CSV TradingView Strategy Tester Anda atau klik untuk memilih file. Anda bisa menggunakan file sampel yang ada di `/examples/sample.csv`.
- Aplikasi akan memproses file secara otomatis dan menampilkan pembagian trade yang valid serta log baris transaksi bermasalah (Invalid).
- Pada panel konfigurasi di sebelah kanan, pilih apakah Anda ingin membuat **Sesi Baru** atau **Menimpa/Menambah** ke sesi yang sudah ada.
- Klik **"Konfirmasi Import"** untuk menyimpan.

### 3. Cara Menggunakan Webhook TradingView
- Masuk ke menu **"Webhook Monitor"** di sidebar.
- Salin URL Webhook Anda (biasanya `http://localhost:5000/api/webhook/tradingview` saat dijalankan lokal).
- Salin **Secret Token Webhook** Anda (default: `replayfx_secret_token_123`).
- Pada editor chart TradingView, buat script menggunakan script template yang ada di `/examples/replayfx_webhook.pine`.
- Konfigurasikan alert TradingView Anda dengan metode webhook URL, lalu tempelkan URL Webhook yang Anda salin.
- Untuk pengetesan lokal tanpa TradingView, Anda dapat menembakkan JSON payload di `/examples/webhook_payload.json` menggunakan Postman atau cURL.

---

## 🔒 Konfigurasi Keamanan (Secret Token)
- Secret token divalidasi pada backend. Anda dapat mengubah token rahasia ini di menu **Pengaturan (Settings)**.
- Di halaman Pengaturan, Anda juga dapat mengubah nilai default kurs USD ke IDR dan melakukan **Wipe Database Permanen** dengan cara mengetik kata konfirmasi **"HAPUS"** terlebih dahulu.
# myfxjournal
