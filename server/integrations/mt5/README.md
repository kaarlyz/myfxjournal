# ReplayFX Journal - MT5 Integration

This directory contains the Expert Advisor (EA) to connect your MetaTrader 5 terminal to ReplayFX Journal.

## Requirements & Broker Limitations
- **Supported Brokers:** Any MT5 broker that allows **Expert Advisors (Algo Trading)** and **WebRequest**.
- **Not Supported:** MT4, cTrader, prop firms or brokers that strictly prohibit WebRequest/EAs, and mobile-only accounts.

## Installation & Compilation
1. **Locate the EA:** Open `ReplayFX_Journal_Connector.mq5` in this folder.
2. **Copy to MT5:** Open MetaTrader 5, go to `File -> Open Data Folder`. Navigate to `MQL5/Experts` and paste the `.mq5` file there.
3. **Compile:** Double-click the file to open **MetaEditor**. Click the **Compile** button (or press `F7`). Ensure there are `0 errors` in the log at the bottom.

## Configuration in MT5
1. **Enable Algo Trading:** In MT5, click the "Algo Trading" button on the top toolbar so it turns green.
2. **Whitelist Webhook URL:**
   - Go to `Tools -> Options` (or press `Ctrl+O`).
   - Select the `Expert Advisors` tab.
   - Check **Allow WebRequest for listed URL**.
   - Click the green `+` and add your backend URL (e.g., `https://your-backend-url.com`).
3. **Attach to Chart:** Drag the compiled `ReplayFX_Journal_Connector` EA onto any open chart.
4. **Input Parameters:**
   - **BackendURL:** Your backend URL (e.g., `https://your-backend-url.com`). Do not add `/api/...` at the end.
   - **SecretToken:** Your secure webhook token (from your environment variables or database).

## Database & Deployment Notes
- **Testing/Temporary:** The default setup uses **SQLite**. If you deploy SQLite to services like Render/Railway *without a persistent disk*, your database will reset on every deploy.
- **Production Setup:** For safe production use, it is highly recommended to use **PostgreSQL** or attach a **Persistent Disk** to your Render/Railway service so your trades are not lost.

## Testing the Connection
You can test the endpoints manually using `curl` from your terminal to ensure the backend is responding correctly. Replace the URL and Token with your actual values.

### 1. Check Status
```bash
curl -X GET http://localhost:5000/api/integrations/mt5/status \
  -H "Authorization: Bearer your_secret_token"
```

### 2. Simulate Trade Event
```bash
curl -X POST http://localhost:5000/api/integrations/mt5/trade-event \
  -H "Authorization: Bearer your_secret_token" \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "12345",
    "broker": "TestBroker",
    "symbol": "EURUSD",
    "dealId": "999888",
    "positionId": "777666",
    "eventType": "OPEN",
    "side": "BUY",
    "lot": 0.1,
    "price": 1.10000,
    "time": 1718000000
  }'
```

### 3. Simulate Account Snapshot
```bash
curl -X POST http://localhost:5000/api/integrations/mt5/account-snapshot \
  -H "Authorization: Bearer your_secret_token" \
  -H "Content-Type: application/json" \
  -d '{
    "accountNumber": "12345",
    "broker": "TestBroker",
    "balance": 10500.50,
    "equity": 10550.75,
    "freeMargin": 10400.00
  }'
```

### 4. Send Test Event (Server-side Mock)
```bash
curl -X POST http://localhost:5000/api/integrations/mt5/test-event \
  -H "Authorization: Bearer your_secret_token"
```
