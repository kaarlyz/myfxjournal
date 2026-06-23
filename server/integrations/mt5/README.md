# ReplayFX MT5 Controller

This folder contains the MT5 controller infrastructure for ReplayFX Journal.

Current focus:

- `ReplayFX_RemoteSDK.mqh`
- `ReplayFX_MT5_Controller.mq5`

The controller is intentionally independent from strategy EA compilation. It handles heartbeat, broker symbol list, active chart list, safe command queue polling, template attach, and screenshot commands.

## Safety Scope

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

Remote manual market trading remains disabled.

## Bottles MT5 Paths

Experts/Advisors:

```text
"/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/Advisors/"
```

Include:

```text
"/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Include/"
```

Templates, verified on this machine:

```text
"/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/Profiles/Templates/"
```

All shell commands must quote these paths because they contain spaces.

## Copy Controller and SDK

From the ReplayFX repo root:

```bash
cp "server/integrations/mt5/ReplayFX_RemoteSDK.mqh" "/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Include/"
```

```bash
cp "server/integrations/mt5/ReplayFX_MT5_Controller.mq5" "/home/vallencia/.var/app/com.usebottles.bottles/data/bottles/bottles/mt5/drive_c/Program Files/MetaTrader 5/MQL5/Experts/Advisors/"
```

## MetaEditor Compile Steps

1. Open MetaTrader 5 through Bottles.
2. Open MetaEditor.
3. Open `ReplayFX_RemoteSDK.mqh` from `MQL5/Include/`.
4. Compile the include if MetaEditor opens it directly.
5. Open `ReplayFX_MT5_Controller.mq5` from `MQL5/Experts/Advisors/`.
6. Press `F7` or click `Compile`.
7. Confirm the log shows `0 errors`.
8. Attach `ReplayFX_MT5_Controller.mq5` to one MT5 chart.

## WebRequest URL

MT5 must allow the backend URL:

`Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL`

Add:

- `http://127.0.0.1:5000`
- or your deployed ReplayFX backend URL.

Use the same base URL in the controller input `InpReplayFXBackendURL`.

## Template Attach Workflow

The controller does not attach raw `.mq5` files directly. It applies an MT5 `.tpl` template to a chart.

To prepare a template:

1. Compile the strategy EA in MetaEditor.
2. Open a chart manually once.
3. Attach the EA to the chart.
4. Set desired EA inputs.
5. Save the chart as a template.
6. Keep the `.tpl` file in the MT5 `Profiles/Templates/` folder.
7. ReplayFX can later apply that template with `ChartApplyTemplate()`.

If the template is missing, the controller reports:

`Template not found. Create the template in MT5 first.`

## Backend Endpoints

The controller uses these endpoints:

- `POST /api/ea-control/heartbeat`
- `GET /api/ea-control/commands/poll?terminalId=...`
- `POST /api/ea-control/commands/:id/result`

The website uses these endpoints:

- `GET /api/ea-control/templates`
- `POST /api/ea-control/templates/scan`
- `GET /api/ea-control/terminals`
- `GET /api/ea-control/symbols?terminalId=...`
- `POST /api/ea-control/symbols`
- `GET /api/ea-control/charts?terminalId=...`
- `POST /api/ea-control/charts`
- `POST /api/ea-control/commands`
- `GET /api/ea-control/commands`
- `POST /api/ea-control/commands/:id/result`
- `POST /api/ea-control/screenshots`
- `GET /api/ea-control/screenshots`

## Not Included in This Folder

This folder also contains strategy EA copies under `ea-library/`, but this task does not compile, fix, copy, or modify those strategy EAs. Strategy integration remains a later task.
