import fs from 'node:fs';

async function import100TradesToSession() {
  const resultData = JSON.parse(fs.readFileSync('./backtest_100_trades_result.json', 'utf-8'));
  const trades = resultData.trades;

  // 1. Create Backtest Session via POST /api/backtest/sessions
  const sessionPayload = {
    name: "AI Auto-Pilot 100-Trade Gold M1 (Fixed R:R 1:1)",
    symbol: "XAUUSD",
    provider: "DUKASCOPY",
    timeframe: "M1",
    initialBalance: 10000,
    riskPercent: 1.0,
    startTime: new Date().toISOString()
  };

  const createRes = await fetch('http://127.0.0.1:5000/api/backtest/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionPayload)
  });

  const createJson = await createRes.json();
  const session = createJson.data;
  console.log("✅ Created Backtest Session:", session.id, session.name);

  // 2. Insert all 100 trades into backtest session via POST /api/backtest/sessions/:id/trades
  let successCount = 0;
  let baseTime = Math.floor((Date.now() - (100 * 15 * 60 * 1000)) / 1000);

  for (const t of trades) {
    const entryTime = baseTime;
    const exitTime = baseTime + (10 * 60);
    baseTime += 15 * 60;

    const tradePayload = {
      side: t.side,
      entryPrice: t.entry,
      exitPrice: t.exit,
      slPrice: t.sl,
      tpPrice: t.tp,
      lotSize: t.lot,
      riskPercent: 1.0,
      riskAmount: 100,
      pnlUsd: t.pnl,
      pnlPips: t.side === 'BUY' ? (t.exit - t.entry) * 10 : (t.entry - t.exit) * 10,
      entryTime,
      exitTime,
      status: 'CLOSED',
      setupName: t.setup || "AI SMC Auto-Pilot",
      notes: `Exit: ${t.reason} (Fixed 1:1 RR)`
    };

    const tRes = await fetch(`http://127.0.0.1:5000/api/backtest/sessions/${session.id}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tradePayload)
    });

    if (tRes.ok) successCount++;
  }

  console.log(`🎉 Successfully imported ${successCount}/100 trades into Backtest Session ${session.id}!`);

  // 3. Sync to main Journal Session for Analytics Dashboard view
  const syncRes = await fetch(`http://127.0.0.1:5000/api/backtest/sessions/${session.id}/sync-to-journal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  const syncData = await syncRes.json();
  console.log("📊 Sync to Journal Analytics Response:", syncData);
  const journalSessionId = syncData.journalSession?.id || syncData.sessionId || syncData.data?.id;
  console.log(`🎯 Journal Session ID: ${journalSessionId}`);
}

import100TradesToSession().catch(console.error);
