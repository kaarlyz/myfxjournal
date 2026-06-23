# ReplayFX EA Control Center

ReplayFX EA Control Center is the safe infrastructure bridge between ReplayFX Journal and MetaTrader 5. The current scope is intentionally limited to controller infrastructure:

- MT5 controller heartbeat
- Account snapshot from MT5
- Broker symbol list
- Active chart list
- Safe command queue
- Template attach command
- Screenshot command
- Website EA Control Center UI
- No remote manual market buy/sell
- No close-all
- No remote SL/TP modification

The controller does **not** depend on any specific strategy EA compiling for this phase.

## Files

- SDK include: `server/integrations/mt5/ReplayFX_RemoteSDK.mqh`
- Controller EA: `server/integrations/mt5/ReplayFX_MT5_Controller.mq5`
- Backend routes: `server/src/routes/ea-control.ts`
- Backend service: `server/src/services/eaControlService.ts`
- Website page: `client/src/pages/EAControlCenter.tsx`
- Website route: `/ea-control`

Original strategy EA files are not modified in this task.

## Bottles MT5 Paths

Your MT5 installation is through Bottles. These paths are used by the install commands:

- Experts/Advisors:
  `"/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/Advisors/"`
- Include:
  `"/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Include/"`
- Templates, verified on this machine:
  `"/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/Profiles/Templates/"`

Because these paths contain spaces, quote every shell path.

## Copy Updated Controller and SDK to Bottles

Run these commands from the ReplayFX repo root:

```bash
cp "server/integrations/mt5/ReplayFX_RemoteSDK.mqh" "/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Include/"
```

```bash
cp "server/integrations/mt5/ReplayFX_MT5_Controller.mq5" "/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/Advisors/"
```

Do not copy strategy EA files in this phase unless you explicitly decide to resume strategy integration later.

## MT5 Manual Install Steps

1. Open MetaTrader 5 through Bottles.
2. Go to `Tools -> Options -> Expert Advisors`.
3. Enable `Allow WebRequest for listed URL`.
4. Add the backend URL, for example:
   - `http://127.0.0.1:5000`
   - or your deployed ReplayFX backend URL.
5. Open MetaEditor.
6. Open `ReplayFX_RemoteSDK.mqh` from the MT5 `MQL5/Include/` folder.
7. Compile the SDK include if MetaEditor opens it directly.
8. Open `ReplayFX_MT5_Controller.mq5` from the MT5 `MQL5/Experts/Advisors/` folder.
9. Click `Compile` or press `F7`.
10. Confirm the compile log shows `0 errors`.
11. Attach `ReplayFX_MT5_Controller.mq5` to one MT5 chart.
12. Check the ReplayFX website: `EA Control Center -> Terminal Status`.

## Command-Line Compile via Bottles

Try this first from the ReplayFX repo root:

```bash
flatpak run --command=bottles-cli com.usebottles.bottles shell -b mt5 -i '"C:\Program Files\MetaTrader 5\MetaEditor64.exe" /compile:"C:\Program Files\MetaTrader 5\MQL5\Experts\Advisors\ReplayFX_MT5_Controller.mq5" /log'
```

If Bottles CLI cannot run MetaEditor headlessly, use the manual MetaEditor steps above.

## Controller Responsibilities

`ReplayFX_MT5_Controller.mq5` currently does only safe infrastructure work:

- Sends heartbeat to:
  `POST /api/ea-control/heartbeat`
- Heartbeat includes:
  - `terminalId`
  - `accountNumber`
  - `broker`
  - `server`
  - `balance`
  - `equity`
  - `freeMargin`
  - `timestamp`
- Lists broker symbols using:
  - `SymbolsTotal()`
  - `SymbolName()`
- Lists active charts when feasible:
  - `ChartFirst()`
  - `ChartNext()`
  - `ChartSymbol()`
  - `ChartPeriod()`
- Polls command queue:
  `GET /api/ea-control/commands/poll?terminalId=...`
- Reports command result:
  `POST /api/ea-control/commands/:id/result`

Supported controller commands:

- `LIST_SYMBOLS`
- `LIST_CHARTS`
- `OPEN_CHART`
- `APPLY_TEMPLATE`
- `SCREENSHOT_CHART`

Disabled commands:

- `BUY`
- `SELL`
- `CLOSE_ALL`
- `MODIFY_SL`
- `MODIFY_TP`

## Template Attach Approach

Do not attach raw `.mq5` strategy files directly from the website.

The website queues a controller command. The controller opens a chart and applies an MT5 `.tpl` template with `ChartApplyTemplate()`.

Template names currently mapped by the backend:

- `CRT_CandleRangeTheory_EA_ReplayFX.tpl`
- `Momentumcandle_ReplayFX.tpl`
- `ERS_Simple_StopGrid_v3_ReplayFX.tpl`
- `BreakoutRR_DebugEA_v2_00_ReplayFX.tpl`

If the `.tpl` file is missing in MT5, the controller reports:

`Template not found. Create the template in MT5 first.`

To prepare an EA template manually in MT5:

1. Compile the strategy EA in MetaEditor.
2. Open a chart manually once.
3. Attach the EA to that chart.
4. Set the desired EA inputs.
5. Save the chart as a template.
6. Make sure the `.tpl` file exists in:
   `"/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/Profiles/Templates/"`
7. Use the same template name in ReplayFX EA Control Center.

## Website EA Control Center Behavior

The frontend now treats the controller as infrastructure only.

Terminal Status shows:

- online/offline
- `terminalId`
- broker
- masked account number
- balance/equity/free margin
- last heartbeat
- symbol count
- chart count

If no controller heartbeat exists, it shows:

`Attach ReplayFX_MT5_Controller to one MT5 chart first.`

Broker Symbol Dropdown:

- Loads symbols from the backend based on the selected terminal.
- Uses a searchable dropdown.
- Does not default to hardcoded `XAUUSD`.
- Shows a warning if no symbol list exists yet.
- Provides Custom Symbol only when the user explicitly enables it.

Attach EA flow:

1. Select terminal.
2. Select EA template.
3. Select broker symbol from the loaded broker list.
4. Select timeframe.
5. Select mode.
6. Click `Queue Attach Command`.

The command appears in Command Queue with:

- command type
- symbol
- timeframe
- template
- status
- result/error
- expiry/confirmation reason when pending or executing

Screenshot:

- Click `Screenshot` to queue `SCREENSHOT_CHART`.
- The controller saves a local PNG in the MT5 Files folder.
- Command result shows local file path or uploaded URL when available.

Runtime Config:

- Disabled until an actual EA strategy instance reports heartbeat.
- Controller heartbeat alone does not enable runtime config.
- When no instance exists, the UI shows:
  `Runtime config will be enabled after an EA instance reports heartbeat.`

## Backend EA Control Endpoints

Implemented endpoints are under `/api/ea-control`:

Templates:

- `GET /api/ea-control/templates`
- `POST /api/ea-control/templates/scan`

Terminal heartbeat:

- `POST /api/ea-control/heartbeat`
- `GET /api/ea-control/terminals`

Symbols:

- `GET /api/ea-control/symbols?terminalId=...`
- `POST /api/ea-control/symbols`

Charts:

- `GET /api/ea-control/charts?terminalId=...`
- `POST /api/ea-control/charts`

Command queue:

- `POST /api/ea-control/commands`
- `GET /api/ea-control/commands`
- `GET /api/ea-control/commands/poll?terminalId=...`
- `POST /api/ea-control/commands/:id/result`

Screenshots:

- `POST /api/ea-control/screenshots`
- `GET /api/ea-control/screenshots`

Stored data uses existing models where possible:

- `EaTerminalHeartbeat` for latest controller heartbeats
- `SystemSetting` for broker symbol and chart lists
- `EaCommandQueue` for command queue
- `EaCommandLog` for command logs
- `EaScreenshot` for screenshot metadata
- `EaInstance` only for real EA strategy heartbeats, not controller-only heartbeats

## Intentionally Skipped for This Phase

- BreakoutRR Debug EA compile fix
- CRT strategy logic integration
- Momentum strategy logic integration
- Grid strategy logic integration
- Approval insertion inside strategy entry functions
- Full runtime mapping of every strategy parameter
- Copying or compiling strategy EA files
- Remote manual buy/sell trading
- Database reset
- `prisma db push --force-reset`

## Safety Notes

- Manual remote trading commands are disabled in the controller and backend.
- Backend rejects website commands for `BUY`, `SELL`, `CLOSE_ALL`, `MODIFY_SL`, and `MODIFY_TP`.
- Controller rejects unsafe command types before execution.
- Runtime config is not applied unless an EA strategy instance exists.
- Database reset is not required.
- Use `npm run prisma:push` only if schema changes are added later. Do not use `--force-reset`.
