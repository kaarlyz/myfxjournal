async function benchmarkTimeframes() {
  console.log("⏱️ Benchmarking Backend Endpoint /api/backtest/candles Latency & Payload Size...");

  const timeframes = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'];
  const results = [];

  for (const tf of timeframes) {
    const start = performance.now();
    const res = await fetch(`http://127.0.0.1:5000/api/backtest/candles?symbol=XAUUSD&timeframe=${tf}&provider=DUKASCOPY`);
    const end = performance.now();
    const text = await res.text();
    const durationMs = (end - start).toFixed(2);
    const sizeKb = (text.length / 1024).toFixed(2);
    const json = JSON.parse(text);
    const candleCount = json.data?.candles?.length || 0;

    results.push({
      timeframe: tf,
      latency: `${durationMs} ms`,
      payloadSize: `${sizeKb} KB`,
      candlesReceived: candleCount,
      status: res.status
    });
  }

  console.log("\n=======================================================");
  console.log("📊 REAL BENCHMARK RESULTS (AFTER OPTIMIZATION)");
  console.log("=======================================================");
  console.table(results);
}

benchmarkTimeframes().catch(console.error);
