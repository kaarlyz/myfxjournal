# ReplayFX & MyFxJournal — Comprehensive Technical Context Document

> **Classification:** Project Architectural Blueprint & Technical Memory  
> **Target Audience:** Autonomous Coding Agents & Large Language Models  
> **Source of Truth:** Repository Implementation Codebase (September 2026)  
> **Primary Symbol / Asset:** `XAUUSD` (Spot Gold / US Dollar)  
> **Canonical Tick Dataset:** `data/market-data/XAUUSD_Tick_Parquet.parquet` (725,596,648 ticks, 6.3 GB)

---

## 1. PRODUCT OVERVIEW

### 1.1 What is ReplayFX?
**ReplayFX** (integrated within **MyFxJournal**) is an institutional-grade, high-fidelity Forex and CFD trade journaling and manual backtesting platform. It enables retail and systematic traders to replay historical market conditions tick-by-tick or candle-by-candle with strict protection against **look-ahead bias**, execute manual orders (Market and Pending: Limit / Stop), manage risk with professional TradingView-style position tools, and perform deep mathematical analytics on trade performance (R-Multiples, Maximum Favorable Excursion [MFE], Maximum Adverse Excursion [MAE], and R:R Simulation Matrices).

### 1.2 Problems Solved
1. **Look-Ahead Bias in Traditional Charting:** Conventional backtesting platforms often expose future bar information or calculate indicators using future data points. ReplayFX enforces an authoritative `replayTime` temporal barrier at the database, query, and rendering layers.
2. **Candle Inaccuracy vs. Real Tick Reality:** Most backtest engines evaluate Stop Loss (SL) and Take Profit (TP) against aggregated M1 OHLC bars, causing false SL/TP triggers or "intrabar ambiguity" (when both SL and TP lie within the same bar's High-Low range). ReplayFX utilizes a canonical dataset of **~725 Million real ticks** queried via DuckDB in milliseconds to provide true tick-level execution and excursion analytics.
3. **Clumsy Order Placement UX:** Traditional journaling tools require tedious manual text entry of Entry, SL, and TP prices. ReplayFX provides a fluid, TradingView-grade interactive chart tool where lines and risk/reward zones can be adjusted visually with instant lot size, risk currency, and R-Multiple calculations before confirmation.
4. **Disconnected Journaling & Post-Trade Analytics:** Manual backtests can be synced directly to the primary trading journal in a single click, allowing Monte Carlo simulations, R-Multiple sensitivity analysis, and comparison across multiple sessions.

### 1.3 User Personas & Target Workflows
- **Manual Discretionary Traders:** Testing mechanical price action setups (Order Blocks, Liquidity Sweeps, Support/Resistance) bar-by-bar without knowing the future outcome.
- **Prop Firm Candidates:** Practicing strict risk management (1% fixed risk, maximum drawdown limits, profit targets) with realistic lot sizing.
- **Systematic Researchers:** Evaluating hypothetical "what-if" scenarios (e.g., "What if I took profit at 1.5R vs 2.0R vs 3.0R across my last 100 trades?").
- **Live MT5 Traders:** Synchronizing live MT5 terminal trades in real-time via `LiveSync.mq5` and receiving push updates through Server-Sent Events (SSE).

### 1.4 Analysis Mode vs. Chart Reply / Replay Mode
| Dimension | Normal Analysis Mode (`replayActive = false`) | Chart Reply / Replay Mode (`replayActive = true`) |
| :--- | :--- | :--- |
| **Viewport & History** | Free scrolling to the latest historical candle. Infinite forward/backward pan. | Strict temporal cutoff at `session.replayTime`. All data after `replayTime` is inaccessible. |
| **Stepping Controls** | Disabled. Chart acts as standard static charting workspace. | Active step buttons (`Next Bar`, `Prev Bar`, `Jump to Date`, `Auto Play` at 0.5s–3.0s speed). |
| **Order Execution** | Orders placed at the latest visible bar or custom timestamp. | Orders executed strictly at `replayTime` market price or placed as pending orders at historical levels. |
| **Pending Order Triggering** | Static. | Evaluated sequentially as new bars/ticks arrive via `Step Forward` or `Auto Play`. |

---

## 2. TECH STACK

### 2.1 Frontend
- **Framework:** React 18.3 (`react`, `react-dom`)
- **Language:** TypeScript 5.5 (strict type definitions throughout)
- **Bundler & Dev Server:** Vite 5.4 with `@vitejs/plugin-react`
- **Styling:** Tailwind CSS 3.4 with custom Neo-Brutalist / Bauhaus tokens
- **Charting Engine:** Custom HTML5 Canvas 2D engine (`CandlestickChart.tsx`, 2,700+ lines, zero third-party chart library dependencies)
- **State Management:**
  - `useJournalStore` (Zustand): Primary journal sessions, settings, trades, filter state.
  - `useLiveJournalStore` (Zustand): Live MT5 SSE streaming, connection status.
  - React Component State & Refs in `Backtest.tsx` (authoritative orchestrator for backtest state).
- **Icons & Animation:** `lucide-react`, `framer-motion` (page transitions)
- **Data Visualization:** `recharts` (for dashboard metrics and simulation curves)

### 2.2 Backend
- **Runtime:** Node.js (v18+) with `tsx` / `ts-node`
- **Framework:** Express 4.19
- **Language:** TypeScript 5.5
- **ORM:** Prisma 5.19
- **API Architecture:** RESTful JSON endpoints + Server-Sent Events (SSE for live terminal sync) + Persistent Stdio JSON-RPC IPC with Python daemon.

### 2.3 Data & Computation Engine
- **Embedded OLAP Database:** DuckDB (Python `duckdb` library)
- **Inter-Process Communication:** Persistent JSON-RPC stdio daemon (`parquetTickService.py`) managed by Node.js child process (`parquetDataProvider.ts`).
- **Primary Relational DB:** SQLite 3 (`server/prisma/dev.db`).

### 2.4 Infrastructure & Ports
- **Backend Port:** `5000` (configurable via `.env` `PORT`)
- **Frontend Port:** `5173` (Vite dev server)
- **Vite Proxy:** Forwards `/api` and `/uploads` directly to `http://localhost:5000`
- **Build Commands:**
  - Client: `npm run build --prefix client` (`tsc && vite build`)
  - Server: `npm run build --prefix server` (`tsc`)

---

## 3. REPOSITORY MAP

```
myfxjournal/
├── CONTEXT.md                            # Complete Technical Memory Document (This file)
├── AGENTS.md / GEMINI.md                 # Agent instructions and Anti-Slop design guidelines
├── client/                               # Frontend Single Page Application (SPA)
│   ├── src/
│   │   ├── App.tsx                       # Main route registry & layout container
│   │   ├── main.tsx                      # Vite React root mounting point
│   │   ├── pages/
│   │   │   ├── Backtest.tsx              # God component for Chart Reply & ReplayFX
│   │   │   ├── Dashboard.tsx             # Performance Analytics, Winrate, Profit Factor
│   │   │   ├── Home.tsx                  # Session Manager / Session List
│   │   │   ├── LiveJournal.tsx           # Real-time streaming MT5 trades
│   │   │   ├── EAControlCenter.tsx       # MT5 EA remote configuration & license management
│   │   │   ├── Simulation.tsx            # Monte Carlo & RR Simulation Lab
│   │   │   ├── CreateSession.tsx         # New session modal / wizard
│   │   │   └── QuickLogger.tsx           # Rapid manual trade entry form
│   │   ├── components/
│   │   │   ├── backtest/
│   │   │   │   ├── CandlestickChart.tsx  # Core Canvas 2D Charting & Interaction Engine
│   │   │   │   ├── OrderPanel.tsx        # Buy/Sell order form & Pending Orders manager
│   │   │   │   └── OrderTypes.ts         # TypeScript interfaces for orders & positions
│   │   │   ├── AnalyticsTabs/
│   │   │   │   └── RRLabTab.tsx          # R-Multiple simulation & validation diagnostics tab
│   │   │   ├── Sidebar.tsx               # Primary Bauhaus navigation sidebar
│   │   │   └── Toast.tsx                 # Neo-Brutalist notification toast system
│   │   └── store/
│   │       ├── useJournalStore.ts        # Zustand store for sessions, settings, journal trades
│   │       └── useLiveJournalStore.ts    # Zustand store for SSE live streaming
├── server/                               # Backend API Server & Analytics Pipeline
│   ├── prisma/
│   │   ├── schema.prisma                 # Complete database schema definitions
│   │   └── dev.db                        # SQLite database file
│   ├── src/
│   │   ├── index.ts                      # Express app initialization, middleware, routes mounting
│   │   ├── routes/
│   │   │   ├── backtest.ts               # Replay sessions, candles, next-candle, trade lifecycle
│   │   │   ├── analytics.ts              # RR simulation, replay rebuild, validation summary
│   │   │   ├── sessions.ts               # Journal session CRUD & aggregated stats
│   │   │   ├── trades.ts                 # Journal trade CRUD & filters
│   │   │   ├── mt5-sync.ts               # Terminal push endpoint (/api/mt5/push)
│   │   │   └── ea-control.ts             # EA remote settings & heartbeat
│   │   ├── services/
│   │   │   ├── backtestEngine.ts         # Pure mathematical trade execution & hit detection
│   │   │   ├── marketAnalytics.ts        # Tick-based RR validation & rebuild pipeline
│   │   │   ├── replayEngineCore.ts       # Micro-unit integer arithmetic, symbol mapping, resampling
│   │   │   └── parquetTickService.py     # Persistent DuckDB daemon for 725M tick queries
│   │   ├── integrations/
│   │   │   └── mt5-sync/
│   │   │       ├── parquetDataProvider.ts# Node.js RPC client to Python DuckDB daemon
│   │   │       ├── ReplayFX_LiveSync.mq5 # MetaTrader 5 Expert Advisor for real-time sync
│   │   │       └── sqliteStorage.ts      # Local MT5 candle storage handler
│   │   └── tests/
│   │       ├── rrAnalyticsTick.test.ts   # 13 mandatory regression tests for tick RR pipeline
│   │       ├── backtestEngine.test.ts    # 54 unit & E2E tests for backtest engine
│   │       └── backtestWorkspace.test.ts # Workspace & timeline bounds integration tests
│   └── data/
│       └── market-data/
│           └── XAUUSD_Tick_Parquet.parquet # 725M canonical historical tick dataset
```

---

## 4. APPLICATION FLOW

```
1. Client Boot
   App.tsx → Router → WidgetErrorBoundary → useOnboarding & useJournalStore
   ↓
2. Route Navigation to /backtest
   Backtest.tsx mounts → fetches /api/backtest/timeline-bounds & /api/backtest/sessions
   ↓
3. Session Initialization
   Active session loaded → replayTime established → fetch initial 1,500 candles via /api/backtest/candles
   ↓
4. Chart Canvas Rendering
   CandlestickChart.tsx receives candles → computes visibleRange based on panOffset & candleWidth
   → renders Background, Grid, Candles (Body & Wicks), Drawings, Pending Orders, Active Trade, Crosshair
   ↓
5. User Order Planning & Interaction
   User selects Buy/Sell in OrderPanel → handleSubmitVisualOrder activates visual planning mode
   → Draggable Entry, SL, TP lines appear on chart with interactive +SL/+TP buttons and soft floating confirm panel
   ↓
6. Order Confirmation
   User clicks "Confirm" → POST /api/backtest/sessions/:id/trades (Market) or added to pendingOrders state (Limit/Stop)
   ↓
7. Replay Progression
   User clicks "Next Bar" or Auto-Play → GET /api/backtest/next-candle → appends candle → updates replayTime
   → evaluateCandleHit tests active trade and pending orders against candle High/Low
   → if SL/TP hit: POST /api/backtest/sessions/:id/trades/:tradeId/close
   ↓
8. Journal Sync & Analytics
   User clicks "Sync to Journal" → POST /api/backtest/sessions/:id/sync-to-journal
   → Navigates to Dashboard / RR Lab → POST /api/analytics/session/:id/analyze
   → marketAnalytics.ts queries DuckDB for exact [entryTime, exitTime] ticks
   → Computes Max Potential RR, MFE, MAE, Win/Loss Matrix → renders simulation tables
```

---

## 5. CHART SYSTEM DEEP DIVE (`CandlestickChart.tsx`)

The charting system is a 100% custom, hardware-accelerated Canvas 2D engine built without external charting libraries.

### 5.1 Coordinate Systems & Transformations
All chart coordinates translate between **Screen Pixel Space `(x, y)`** and **Market Space `(timestamp, price)`**:

```
                  ┌───────────────────────────────────────────────┐  y = 0
                  │                   CHART VIEWPORT              │
  Price (High) ───┼───────────────────────────────────────────────┤  y = priceToY(high)
                  │                                               │
  Price (Low)  ───┼───────────────────────────────────────────────┤  y = priceToY(low)
                  └───────────────────────────────────────────────┘  y = height - TIME_AXIS_HEIGHT
                  x = 0                                           x = width - PRICE_AXIS_WIDTH
                  t = visibleRange.from                           t = visibleRange.to
```

- **Price to Y:**
  $$\text{y} = \text{paddingTop} + \frac{\text{maxPrice} - \text{price}}{\text{maxPrice} - \text{minPrice}} \times (\text{canvasHeight} - \text{paddingTop} - \text{paddingBottom} - \text{TIME\_AXIS\_HEIGHT})$$
- **Y to Price:**
  $$\text{price} = \text{maxPrice} - \frac{\text{y} - \text{paddingTop}}{\text{drawableHeight}} \times (\text{maxPrice} - \text{minPrice})$$
- **Time to X:**
  $$\text{index} = \text{findCandleIndexByTime}(\text{timestamp})$$
  $$\text{x} = \text{canvasWidth} - \text{PRICE\_AXIS\_WIDTH} - \text{panOffset} - (\text{candles.length} - 1 - \text{index}) \times \text{candleWidth}$$
- **X to Time:**
  $$\text{index} = \text{candles.length} - 1 - \text{Math.round}\left(\frac{\text{canvasWidth} - \text{PRICE\_AXIS\_WIDTH} - \text{panOffset} - \text{x}}{\text{candleWidth}}\right)$$

### 5.2 Viewport & Pagination Mechanics
- **`panOffset`:** Distance in pixels scrolled away from the right edge. `panOffset = 0` means the chart is pinned to the newest visible candle.
- **`candleWidth`:** Spacing per candle in pixels (default: `8px`, min: `2px`, max: `50px`). Zooming modifies `candleWidth` while adjusting `panOffset` to keep the mouse cursor price/time pinned.
- **`isFetchingOlderRef`:** Prevents duplicate network requests when panning left to load historical bars (`beforeTime`).
- **`isFetchingNewerRef`:** Prevents duplicate network requests when panning right in Analysis Mode (`afterTime`).
- **Price Axis Bounds Buffer:** High and Low of the visible candles are padded by 8% (`range * 0.08`) to prevent candle wicks from touching the top or bottom edges.

### 5.3 Drawing Tools & Object Layering
Drawing tools render on the same Canvas pass in strict z-index sequence:
1. Canvas Background & Grid lines (`#E5E5E5` dashed)
2. Candlestick Bodies & Wicks (Green: `#10B981`, Red: `#EF4444`)
3. User Drawings (Ray, Trendline, Rectangle, Fibonacci)
4. Long / Short Position Tool Risk & Reward Polygons
5. Pending Order Lines (Limit / Stop dotted lines with order badges)
6. Active Position Lines (Entry solid blue, SL solid red, TP solid green)
7. Crosshair & Dynamic Cursor Badges (Time & Price tooltips)
8. Price Axis (Right) & Time Axis (Bottom) with crisp divider borders

---

## 6. DATA ARCHITECTURE & SOURCE OF TRUTH

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CANONICAL HISTORICAL SOURCE OF TRUTH                 │
│               XAUUSD_Tick_Parquet.parquet (~725M Ticks)                │
│             Schema: DateTime (VARCHAR), Bid (DOUBLE), Volume (BIGINT)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                stdio JSON-RPC IPC │ (Persistent Python Daemon)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│              server/src/services/parquetTickService.py                 │
│         DuckDB in-memory OLAP: time_bucket aggregation & range query   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              Node.js RPC Client   │ (parquetDataProvider.ts)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│               EXPRESS API LAYER (/api/backtest, /api/analytics)        │
│  - /api/backtest/candles: M1..D1 aggregated candles                    │
│  - /api/backtest/next-candle: Strictly next chronological bar          │
│  - /api/analytics/session/:id/analyze: Bounded [entry, exit] ticks     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                SQLITE RELATIONAL DATABASE (dev.db)                     │
│  - ManualBacktestSession & ManualBacktestTrade (Replay trades)         │
│  - BacktestSession & Trade (Journal & Analytics records)               │
│  - TradeReplayAnalysis (Immutable tick execution forensics)            │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Data Sources & Status
- **Parquet Tick Data (`ACTIVE - CANONICAL`):** The primary historical source for all chart replay and RR analytics. 100% deterministic, zero look-ahead bias.
- **SQLite Database (`ACTIVE`):** Stores user sessions, journal trades, settings, and immutable replay analysis records.
- **Dukascopy CSV / SQLite Mt5CandleData (`LEGACY / OPTIONAL CACHE`):** Previously used for M1 candle storage. Now bypassed in favor of direct DuckDB Parquet queries.
- **Live MT5 Stream (`ACTIVE`):** Real-time tick and trade events pushed via HTTP from `LiveSync.mq5`.

---

## 7. REPLAY & CHART REPLY ENGINE

### 7.1 Replay Lifecycle
1. **Creation:** Session created with `symbol`, `timeframe`, `initialBalance`, `riskPercent`, and start timestamp (`replayTime`).
2. **Strict Cutoff:** Every candle fetch passes `replayTime`. The DuckDB query contains:
   ```sql
   WHERE DateTime <= 'YYYYMMDD HH:MM:SS'
   HAVING candle_time <= TIMESTAMP 'YYYY-MM-DD HH:MM:SS'
   ```
3. **Step Forward:** Client calls `/api/backtest/next-candle?afterTime=${replayTime}`. DuckDB computes the exact next bar. Client advances `replayTime` to the new candle's timestamp.
4. **Playback Speed:** Controlled via interval timer supporting 0.5s, 1.0s, 2.0s, and 3.0s per step.
5. **No Look-Ahead Guarantee:** No candle or tick after `replayTime` exists in memory or can be queried by the client.

---

## 8. ORDER SYSTEM & LIFECYCLE

### 8.1 Order Types & Effective Resolution
When placing orders from the chart or OrderPanel, the system distinguishes between **Market** and **Pending** orders based on price relations:

| Side | Desired Price vs Current Market Price | Effective Order Type | Execution Timing |
| :--- | :--- | :--- | :--- |
| **BUY** | At Market Price | `MARKET BUY` | Immediate on current candle close/tick |
| **BUY** | Below Market Price | `BUY LIMIT` | Pending (triggers when `Low <= limitPrice`) |
| **BUY** | Above Market Price | `BUY STOP` | Pending (triggers when `High >= stopPrice`) |
| **SELL**| At Market Price | `MARKET SELL`| Immediate on current candle close/tick |
| **SELL**| Above Market Price | `SELL LIMIT` | Pending (triggers when `High >= limitPrice`) |
| **SELL**| Below Market Price | `SELL STOP` | Pending (triggers when `Low <= stopPrice`) |

### 8.2 Hit Detection & Execution Semantics (`backtestEngine.ts`)
On every new candle step, `evaluateCandleHit` checks the active trade:
- **LONG (BUY):**
  - $\text{SL Hit if } \text{Low} \le \text{slPrice}$ (Exit price: `slPrice`, Reason: `'SL'`)
  - $\text{TP Hit if } \text{High} \ge \text{tpPrice}$ (Exit price: `tpPrice`, Reason: `'TP'`)
  - $\text{Intrabar Ambiguity if } \text{Low} \le \text{slPrice} \text{ and } \text{High} \ge \text{tpPrice}$
- **SHORT (SELL):**
  - $\text{SL Hit if } \text{High} \ge \text{slPrice}$ (Exit price: `slPrice`, Reason: `'SL'`)
  - $\text{TP Hit if } \text{Low} \le \text{tpPrice}$ (Exit price: `tpPrice`, Reason: `'TP'`)
  - $\text{Intrabar Ambiguity if } \text{High} \ge \text{slPrice} \text{ and } \text{Low} \le \text{tpPrice}$

*Note: In the tick analytics engine (`marketAnalytics.ts`), intrabar ambiguity is eliminated because ticks are evaluated sequentially in millisecond order.*

---

## 9. POSITION TOOL & UX WORKFLOW

### 9.1 Visual Planning Flow
1. User clicks **Order Button** in `OrderPanel.tsx`.
2. `handleSubmitVisualOrder` enters visual planning mode (`isVisualOrderActive = true`).
3. Draggable horizontal lines appear on `CandlestickChart.tsx`:
   - **Entry Line (Blue/Amber):** Drag to set pending price.
   - **Stop Loss Line (Red):** Drag to adjust risk distance.
   - **Take Profit Line (Green):** Drag to adjust target reward.
4. If SL or TP are omitted, interactive **`+ SL`** / **`+ TP`** buttons appear on the floating confirm panel to add them on-the-fly.
5. Soft floating confirm panel displays real-time:
   - **Risk Currency ($ and %)**
   - **Target Profit ($)**
   - **Calculated Lot Size**
   - **Risk : Reward Ratio (R:R)**
6. User clicks **"Konfirmasi Order"**:
   - If Market: API creates open trade.
   - If Pending: Added to `pendingOrders` state array with visible badges.
7. **Edit / Delete on Chart:** Clicking any placed pending order or active position line displays a floating action bar with **Edit** (re-opens confirm panel) and **Hapus / Tutup** buttons.

---

## 10. PROFIT, RISK & R-MULTIPLE MATHEMATICS

### 10.1 Key Formulas
- **Contract Size:** `100` troy ounces per standard lot for `XAUUSD`.
- **Price Risk (Points):** $\text{riskPoints} = |\text{entryPrice} - \text{slPrice}|$
- **Reward Distance (Points):** $\text{rewardPoints} = |\text{tpPrice} - \text{entryPrice}|$
- **Lot Sizing Formula:**
  $$\text{Volume (Lots)} = \frac{\text{Account Balance} \times (\text{Risk \%} / 100)}{\text{riskPoints} \times \text{Contract Size}}$$
- **Monetary PnL (Closed Trade):**
  - Long: $(\text{exitPrice} - \text{entryPrice}) \times \text{volume} \times 100$
  - Short: $(\text{entryPrice} - \text{exitPrice}) \times \text{volume} \times 100$
- **R-Multiple (Realized):**
  $$\text{Realized RR} = \frac{\text{Actual Exit PnL}}{\text{Initial Cash Risk}}$$
- **Maximum Potential RR (Tick-based MFE):**
  $$\text{Max Potential RR} = \frac{\text{MFE Distance}}{\text{Risk Distance}}$$
- **Capture Efficiency:**
  $$\text{Capture Efficiency (\%)} = \left(\frac{\text{Captured RR}}{\text{Max Potential RR}}\right) \times 100$$

### 10.2 Micro-Unit Integer Arithmetic (`replayEngineCore.ts`)
To completely eliminate JavaScript IEEE-754 floating-point rounding errors (e.g., `4078.355 - 4073.36 = 4.995000000000346`), all internal price comparisons in `replayEngineCore.ts` convert prices to `BigInt` micro-units:
$$\text{microPrice} = \text{BigInt}(\text{Math.round}(\text{price} \times 10^{\text{digits}}))$$

---

## 11. RR ANALYTICS PIPELINE (`marketAnalytics.ts`)

### 11.1 Replay Rebuild Engine
When analyzing a session, `rebuildSessionReplay` processes all closed trades:
1. Queries DuckDB for canonical ticks in the exact range `[trade.entryTime, trade.exitTime]`.
2. Validates directional and price constraints (SL below entry for Long, SL above entry for Short).
3. Iterates through chronological ticks to identify exact `firstHit` (`TP`, `SL`, or `NONE`).
4. Computes true tick `MFE` and `MAE`.
5. Inserts immutable audit rows into `TradeReplayAnalysis` in Prisma.
6. Computes the **Hypothetical Target RR Simulation Matrix** across standard targets ($0.25R, 0.5R, 0.75R, 1.0R, 1.25R, 1.5R, 2.0R, 2.5R, 3.0R, 4.0R, 5.0R, 8.0R, 10.0R$).

### 11.2 Replay Status Enum
- `VALID`: Replay completed successfully from canonical tick data.
- `NO_SL_INFERABLE`: Missing entry/exit or unable to calculate SL.
- `MISSING_MARKET_DATA`: Trade timestamps fall outside available tick data.
- `PRICE_SCALE_MISMATCH`: Trade price deviates by $>20\%$ from historical market prices.
- `FAILED`: Invalid timestamps or runtime execution failure.

---

## 12. MT5 INTEGRATION ARCHITECTURE

- **`ReplayFX_LiveSync.mq5` (`ACTIVE`):** MQL5 Expert Advisor attached to MetaTrader 5 charts. On every tick/bar close or trade event, it sends JSON payloads via `WebRequest()` to `http://localhost:5000/api/mt5/push`.
- **Live Streaming (`ACTIVE`):** Backend broadcasts incoming trade events via Server-Sent Events (`/api/events/live-trades`) to `LiveJournal.tsx`.
- **EA Remote Control (`ACTIVE`):** `/api/ea-control` manages remote parameter profiles (risk %, max spread, allowed symbols) sent down to the EA during heartbeat pings.

---

## 13. UI ARCHITECTURE & DESIGN LANGUAGE

### 13.1 Neo-Brutalist / Bauhaus Design Tokens
- **Borders:** High-contrast `border-2 border-[#121212]` on all cards, buttons, and containers.
- **Hard Drop Shadows:** `shadow-[2px_2px_0px_0px_#121212]` (or `3px_3px` on prominent cards).
- **Press Micro-Interaction:** `active:translate-x-[1px] active:translate-y-[1px] active:shadow-none`.
- **Typography:** Bold, geometric sans-serif fonts with heavy weights (`font-black`, `font-extrabold`, uppercase tracking).
- **Modern Floating Overlays:** Floating confirm panels and action bars utilize soft modern aesthetics (`rounded-xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-sm`) to distinguish interactive controls from the brutalist chart borders.

### 13.2 Anti-Slop System Rules
- **Contrast:** Minimum 4.5:1 text-to-background contrast ratio everywhere.
- **Labels:** Crisp, professional trading terminology without generic AI boilerplate.
- **Mobile First:** Responsive flexboxes that reflow gracefully down to small smartphone viewports.

---

## 14. KNOWN BUGS & RESOLVED EDGE CASES

### BUG-001: False SL/TP Triggers on Zero-Price Guards (`RESOLVED`)
- **Status:** FIXED
- **Root Cause:** In `backtestEngine.ts`, `evaluateCandleHit` lacked `slPrice > 0` checks, causing trades with SL unset (`slPrice = 0`) to trigger false SL hits on every positive candle.
- **Fix:** Added strict `slPrice > 0` and `tpPrice > 0` guards.

### BUG-002: RR Analytics Rejected All Trades as INVALID (`RESOLVED`)
- **Status:** FIXED
- **Root Cause:** `marketAnalytics.ts` looked for `dataType: 'CANDLE'` in the empty SQLite `MarketDataCatalog` table instead of querying Parquet ticks.
- **Fix:** Refactored pipeline to query DuckDB Parquet ticks directly in bounded memory ranges `[entryTime, exitTime]`.

### BUG-003: Accidental Ref Deletion During Order UX Update (`RESOLVED`)
- **Status:** FIXED
- **Root Cause:** `isFetchingNewerRef` in `Backtest.tsx` was deleted during a previous refactoring.
- **Fix:** Restored `isFetchingNewerRef` definition.

---

## 15. TECHNICAL DEBT & MIGRATION STATUS

1. **Dual Session Models (`ManualBacktestSession` vs `BacktestSession`):**
   - Manual chart replays are stored in `ManualBacktestSession` / `ManualBacktestTrade`.
   - General journal analytics use `BacktestSession` / `Trade`.
   - The "Sync to Journal" endpoint bridges these two models. A future migration could consolidate them into a unified polymorphic schema.
2. **Legacy `Mt5CandleData` SQLite Table:**
   - Remains in schema for backward compatibility with older CSV imports, but is superseded by DuckDB Parquet querying.

---

## 16. TESTING & VERIFICATION SUMMARY

| Test Suite | File Path | Scope | Verification Status |
| :--- | :--- | :--- | :--- |
| **Tick RR Analytics** | `server/src/tests/rrAnalyticsTick.test.ts` | 13 mandatory tests (BUY, SELL, no-lookahead, bounds, negative RR, 16-trade session) | ✅ UNIT & INTEGRATION VERIFIED (13/13 PASS) |
| **Backtest Engine** | `server/src/tests/backtestEngine.test.ts` | 54 tests (lot sizing, hit evaluation, PnL, SMA calculations, micro-unit math) | ✅ UNIT & INTEGRATION VERIFIED (54/54 PASS) |
| **Workspace & Bounds** | `server/src/tests/backtestWorkspace.test.ts` | Timeline bounds, next-candle stepping, replay bounds | ✅ INTEGRATION VERIFIED |
| **Client Production Build** | `npm run build --prefix client` | TypeScript compilation, Vite bundling, asset minification | ✅ BUILD VERIFIED |
| **Server Production Build** | `npm run build --prefix server` | TypeScript backend compilation | ✅ BUILD VERIFIED |

---

## 17. IMPORTANT FILE INDEX

| File Path | Responsibility & Architectural Importance | Dependencies |
| :--- | :--- | :--- |
| [`CandlestickChart.tsx`](file:///home/vallencia/Documents/myfxjournal/client/src/components/backtest/CandlestickChart.tsx) | Complete Canvas 2D charting engine, drawing tools, order line overlays, coordinate math. | React, Lucide Icons, OrderTypes |
| [`Backtest.tsx`](file:///home/vallencia/Documents/myfxjournal/client/src/pages/Backtest.tsx) | God orchestrator component managing replay state, pending orders, execution, stepping. | CandlestickChart, OrderPanel, API |
| [`OrderPanel.tsx`](file:///home/vallencia/Documents/myfxjournal/client/src/components/backtest/OrderPanel.tsx) | Order placement form, risk calculator, pending order list manager. | OrderTypes, backtestEngine |
| [`marketAnalytics.ts`](file:///home/vallencia/Documents/myfxjournal/server/src/services/marketAnalytics.ts) | Canonical tick-based RR analysis, simulation matrix generation, validation forensics. | parquetDataProvider, Prisma |
| [`parquetTickService.py`](file:///home/vallencia/Documents/myfxjournal/server/src/services/parquetTickService.py) | High-speed DuckDB daemon querying 725M Parquet ticks in millisecond time windows. | duckdb, python3 |
| [`parquetDataProvider.ts`](file:///home/vallencia/Documents/myfxjournal/server/src/integrations/mt5-sync/parquetDataProvider.ts) | Node.js child process manager & stdio RPC client for DuckDB daemon. | child_process, readline |
| [`backtestEngine.ts`](file:///home/vallencia/Documents/myfxjournal/server/src/services/backtestEngine.ts) | Pure mathematical calculation engine for lot sizes, PnL, SL/TP candle hit testing. | replayEngineCore |
| [`schema.prisma`](file:///home/vallencia/Documents/myfxjournal/server/prisma/schema.prisma) | Relational database schema definitions for SQLite. | Prisma |

---

## 18. SYSTEM RELATIONSHIP & DATA FLOW DIAGRAMS

### Architectural Data Flow
```
[User on Browser]
       │
       ▼ (Canvas 2D Interaction & Dragging)
[CandlestickChart.tsx] ◄──► [Backtest.tsx] ◄──► [OrderPanel.tsx]
                                 │
                     HTTP REST   │ (Vite Proxy :5173 -> :5000)
                                 ▼
                    [Express Backend Routes]
                    (/api/backtest, /api/analytics)
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
[Prisma ORM -> SQLite dev.db]           [parquetDataProvider.ts]
(Sessions, Trades, Analytics Records)                  │
                                           JSON-RPC    │ (stdio daemon)
                                                       ▼
                                          [parquetTickService.py]
                                                       │
                                              DuckDB   │ (C++ Engine)
                                                       ▼
                                        [XAUUSD_Tick_Parquet.parquet]
                                            (725,596,648 Real Ticks)
```

---

# 19. AI HANDOFF & INVARIANTS

When taking over this codebase, every AI agent must strictly respect the following architectural invariants:

1. **Do NOT Modify the Viewport Coordinate Math in `CandlestickChart.tsx`:** The `timeToX`, `priceToY`, `xToTime`, and `yToPrice` equations are mathematically calibrated to support high-DPI canvas screens, zoom levels, and time pagination. Modifying these without rigorous unit tests will break crosshair alignment, drawing placement, and drag accuracy.
2. **Never Query Full Parquet into Memory:** The dataset has 725M rows (6.3 GB). Always use bounded temporal queries `[fromTime, toTime]` or `[beforeTime / afterTime]` with appropriate `limit` clauses via `parquetDataProvider`.
3. **Preserve Micro-Unit Integer Arithmetic:** Always use integer / BigInt micro-units when comparing prices or calculating fractional R:R in `replayEngineCore.ts` to prevent floating-point drift.
4. **Preserve Look-Ahead Bias Guarantees:** In Replay mode, never return, render, or calculate anything using timestamps after `session.replayTime`.
5. **Pending Order Types Depend on Market Price:** Always ensure effective order types (Limit vs Stop) are resolved relative to the current market price at time of placement.
6. **Losing Trades Can Have Negative RR:** Never force R-Multiple to `0` for losing trades; negative values (e.g. `-1.0R`, `-0.5R`) are required for accurate expectancy calculations.
