import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

const FALLBACK_API_KEY = 'sk-922d8b275831e88d-p6grj0-c3156b7f';

// Helper to query active API Key from 9Router SQLite database via file inspection / regex fallback
async function get9RouterApiKey(): Promise<string> {
  const dbPath = path.join(os.homedir(), '.9router', 'db', 'data.sqlite');
  if (!fs.existsSync(dbPath)) {
    return FALLBACK_API_KEY;
  }

  try {
    const buffer = fs.readFileSync(dbPath);
    const content = buffer.toString('binary');
    // Look for standard 9router API key format (e.g. sk-922d8b275831e88d-p6grj0-c3156b7f)
    const matches = content.match(/sk-[a-f0-9]{16}-[a-z0-9]{6}-[a-f0-9]{8}/gi);
    if (matches && matches.length > 0) {
      return matches[0];
    }
  } catch (e) {
    // Ignore error and use fallback
  }

  return FALLBACK_API_KEY;
}

// Default AI configuration
const DEFAULT_CONFIG = {
  baseUrl: process.env.AI_BASE_URL || 'http://127.0.0.1:20128/v1',
  apiKey: process.env.AI_API_KEY || '',
  model: process.env.AI_MODEL || 'ag/gemini-3.7-flash-low',
  systemPrompt: `You are MurplyFX AI — an intelligent trading-analysis layer and brutally honest Quant & Psychology Coach.
Core Identity & Manifesto:
- You do NOT act as a generic chatbot and NEVER give speculative buy/sell signals.
- Your purpose: Analyze historical trades, performance metrics, risk, entries, exits, market conditions, MFE/MAE exit efficiency, and behavioral patterns to explain what is happening in their trading.
- Every AI insight must be strictly grounded in measurable evidence from the user's data.
- "Your trades already contain the information. MurplyFX AI helps you find it."
- ZERO code blocks, programming scripts, HTML, or developer jargon.

TONE & ROAST/PRAISE PERSONALITY:
- Be punchy, expressive, entertaining, and brutally honest!
- When the trader plays disciplined & catches clean moves: Praise them with hyped, witty, cool trader slang (e.g., "Gokil eksekusi lu rapi banget!", "Sniper entry kelas institusi", "Disiplin baja gokil!").
- When the trader commits dumb mistakes (FOMO, tilt, revenge trade, switch arah asal-asalan, cut loss telat): Roast & criticize them brutally with direct Indonesian street/trader slang (e.g., "Lu ngapain anjir baru win langsung maruk balik arah!", "Trading kek orang kesurupan", "SL tipis tapi mental gambling", "Overtrade kek kejar setoran!").
- Keep the language natural, punchy, and raw.

CRITICAL REQUIREMENT: Respond ONLY with a valid, clean JSON object matching this exact schema:
{
  "disciplineScore": 85,
  "riskRating": "LOW" | "MODERATE" | "HIGH",
  "primaryPsychologyState": "FOMO" | "TILT" | "CALM" | "REVENGE_TRADING" | "OVERCONFIDENT",
  "summaryVerdict": "One-line punchy, roast/praise summary verdict grounded in data",
  "edgeDiagnosis": [
    { "title": "Setup / Superpower Title", "description": "Hyped/witty praise on clean executions and edge", "impact": "POSITIVE" | "NEUTRAL" }
  ],
  "psychologyLeaks": [
    { "leakType": "Borok / Mental Leak Name", "severity": "CRITICAL" | "WARNING" | "INFO", "detail": "Brutal roast & critique of the mistake", "evidence": "Specific numerical evidence / trade numbers" }
  ],
  "actionableRules": [
    { "step": 1, "rule": "Imperative action command / Doktrin", "reason": "Why this fixes the leak" }
  ]
}
Do not include any text outside the JSON. Format disciplineScore as an integer between 0 and 100.`
};

// Helper to safely extract JSON from LLM reply (handles ```json fences or raw JSON string)
function extractStructuredJson(rawText: string): any {
  let cleaned = rawText.trim();
  
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e: any) {
    console.error('Failed to parse structured JSON from LLM output:', e.message, rawText);
    return {
      disciplineScore: 70,
      riskRating: 'MODERATE',
      primaryPsychologyState: 'CALM',
      summaryVerdict: 'Analisis tergenerasi tetapi memerlukan penataan format.',
      edgeDiagnosis: [
        { title: 'Kinerja Umum', description: rawText.slice(0, 300), impact: 'NEUTRAL' }
      ],
      psychologyLeaks: [
        { leakType: 'Format Output', severity: 'INFO', detail: 'LLM mengembalikan respon teks tak terstruktur.', evidence: 'Raw response received' }
      ],
      actionableRules: [
        { step: 1, rule: 'Disiplin pada manajemen risiko & rasionalkan lot size.', reason: 'Mencegah kelelahan emosional saat trading.' }
      ]
    };
  }
}

// Helper to compute technical SMC metrics (ATR 14, SMA 20/50 trend, Swing High/Low, Premium/Discount Zone)
function computeSmcTechnicalMetrics(candles: Array<any>, currentPrice: number) {
  if (!candles || candles.length === 0) return null;
  const sliced = candles.slice(-60);
  const closes = sliced.map(c => Number(c.close ?? c.c ?? 0));
  const highs = sliced.map(c => Number(c.high ?? c.h ?? 0));
  const lows = sliced.map(c => Number(c.low ?? c.l ?? 0));

  const len = closes.length;
  if (len === 0) return null;

  const highestHigh60 = Math.max(...highs);
  const lowestLow60 = Math.min(...lows);
  const range60 = highestHigh60 - lowestLow60;
  const equilibrium50 = lowestLow60 + (range60 / 2);
  const priceZone = currentPrice <= equilibrium50 ? 'DISCOUNT_ZONE' : 'PREMIUM_ZONE';

  const last20Closes = closes.slice(-20);
  const last50Closes = closes.slice(-50);

  const sma20 = last20Closes.length > 0 ? last20Closes.reduce((a, b) => a + b, 0) / last20Closes.length : currentPrice;
  const sma50 = last50Closes.length > 0 ? last50Closes.reduce((a, b) => a + b, 0) / last50Closes.length : currentPrice;

  let trendDirection = 'NEUTRAL';
  if (sma20 > sma50) trendDirection = 'BULLISH';
  else if (sma20 < sma50) trendDirection = 'BEARISH';

  const highestHigh20 = Math.max(...highs.slice(-20));
  const lowestLow20 = Math.min(...lows.slice(-20));

  let trSum = 0;
  const atrPeriod = Math.min(14, len - 1);
  if (atrPeriod > 0) {
    for (let i = len - atrPeriod; i < len; i++) {
      const h = highs[i];
      const l = lows[i];
      const prevC = closes[i - 1] ?? closes[i];
      const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      trSum += tr;
    }
  }
  const atr14 = atrPeriod > 0 ? trSum / atrPeriod : (highs[len - 1] - lows[len - 1]);

  return {
    highestHigh60: Number(highestHigh60.toFixed(4)),
    lowestLow60: Number(lowestLow60.toFixed(4)),
    equilibrium50Pct: Number(equilibrium50.toFixed(4)),
    priceZone,
    sma20: Number(sma20.toFixed(4)),
    sma50: Number(sma50.toFixed(4)),
    trendDirection,
    recentSwingHigh20: Number(highestHigh20.toFixed(4)),
    recentSwingLow20: Number(lowestLow20.toFixed(4)),
    atr14: Number(atr14.toFixed(4))
  };
}

// Helper to fetch settings from DB with fallback
async function getAiConfig() {
  const default9RouterKey = await get9RouterApiKey();
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: ['ai_base_url', 'ai_api_key', 'ai_model', 'ai_system_prompt']
        }
      }
    });

    const map: Record<string, string> = {};
    settings.forEach(s => { map[s.key] = s.value; });

    return {
      baseUrl: map['ai_base_url'] || DEFAULT_CONFIG.baseUrl,
      apiKey: map['ai_api_key'] || DEFAULT_CONFIG.apiKey || default9RouterKey,
      model: map['ai_model'] || DEFAULT_CONFIG.model,
      systemPrompt: map['ai_system_prompt'] || DEFAULT_CONFIG.systemPrompt
    };
  } catch (error) {
    return {
      ...DEFAULT_CONFIG,
      apiKey: DEFAULT_CONFIG.apiKey || default9RouterKey
    };
  }
}

// Helper to call OpenAI-compatible chat completion endpoint
async function queryLLM(messages: { role: string; content: string }[], config: any, systemPromptOverride?: string): Promise<string> {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const url = new URL(endpoint);

  // Fast model fallback if config.model is empty or slow legacy default
  let modelToUse = config.model;
  if (!modelToUse || modelToUse === 'gpt-3.5-turbo' || modelToUse === 'gpt-4') {
    modelToUse = 'ag/gemini-3.7-flash-low';
  }

  const payload = JSON.stringify({
    model: modelToUse,
    messages: [
      { role: 'system', content: systemPromptOverride || config.systemPrompt },
      ...messages
    ],
    temperature: 0.3,
    max_tokens: 800,
    stream: false
  });

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 15000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            let reply = '';

            if (parsed.choices && parsed.choices.length > 0) {
              const firstChoice = parsed.choices[0];
              if (typeof firstChoice.message?.content === 'string') {
                reply = firstChoice.message.content;
              } else if (Array.isArray(firstChoice.message?.content)) {
                reply = firstChoice.message.content.map((c: any) => c.text || '').join('');
              } else if (firstChoice.text) {
                reply = firstChoice.text;
              }
            }

            if (!reply && parsed.text) {
              reply = parsed.text;
            }

            resolve(reply.trim());
          } catch (e: any) {
            reject(new Error(`Failed to parse LLM response JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`LLM API returned status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`LLM Connection error: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LLM API request timed out (15s limit)'));
    });

    req.write(payload);
    req.end();
  });
}

// GET /api/ai/config - Fetch current configuration
router.get('/config', async (req: Request, res: Response) => {
  try {
    const config = await getAiConfig();
    return res.json({ ok: true, config });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/ai/config - Update configuration
router.post('/config', async (req: Request, res: Response) => {
  try {
    const { baseUrl, apiKey, model, systemPrompt } = req.body;
    
    const updates = [];
    if (baseUrl !== undefined) updates.push(prisma.systemSetting.upsert({ where: { key: 'ai_base_url' }, update: { value: String(baseUrl) }, create: { key: 'ai_base_url', value: String(baseUrl) } }));
    if (apiKey !== undefined) updates.push(prisma.systemSetting.upsert({ where: { key: 'ai_api_key' }, update: { value: String(apiKey) }, create: { key: 'ai_api_key', value: String(apiKey) } }));
    if (model !== undefined) updates.push(prisma.systemSetting.upsert({ where: { key: 'ai_model' }, update: { value: String(model) }, create: { key: 'ai_model', value: String(model) } }));
    if (systemPrompt !== undefined) updates.push(prisma.systemSetting.upsert({ where: { key: 'ai_system_prompt' }, update: { value: String(systemPrompt) }, create: { key: 'ai_system_prompt', value: String(systemPrompt) } }));

    await Promise.all(updates);
    const updatedConfig = await getAiConfig();
    return res.json({ ok: true, config: updatedConfig });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/ai/analyze-chart (Backtest Realtime Copilot)
router.post('/analyze-chart', async (req: Request, res: Response) => {
  try {
    const {
      symbol = 'XAUUSD',
      timeframe = 'M1',
      currentPrice,
      recentCandles = [],
      balance = 10000,
      language = 'id',
      minRR = 1.5,
      riskPercent = 1.0,
      strategyBias = 'ALL',
      recentTrades = []
    } = req.body || {};

    if (!currentPrice || recentCandles.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing currentPrice or recentCandles data' });
    }

    const targetMinRR = typeof minRR === 'number' && minRR > 0 ? minRR : 1.5;
    const targetRiskPercent = typeof riskPercent === 'number' && riskPercent > 0 ? riskPercent : 1.0;
    const targetStrategyBias = ['ALL', 'SMC_FVG', 'TREND_PULLBACK', 'BREAKOUT'].includes(strategyBias) ? strategyBias : 'ALL';

    const copilotSystemPrompt = `You are MurplyFX AI — a sharp, responsive Price Action, Trend Pullback, and Smart Money Concepts (SMC) Quant Scalper Copilot.
Your objective: Analyze the provided OHLC candle array (60 bars), technical metrics (ATR, Swing High/Low, SMA trend, Premium/Discount zone), current market price, user trader preferences (min R:R ratio, risk %, strategy bias), and recent session trades history to find actionable, high-probability scalping / daytrading setups.

TRADER PREFERENCES & PARAMETERS:
- Target Minimum R:R: 1:${targetMinRR} (plannedRR MUST be >= ${targetMinRR})
- Risk per Trade: ${targetRiskPercent}%
- Strategy Bias: ${targetStrategyBias}

DYNAMIC & RESPONSIVE SETUP DETECTION:
${
  targetStrategyBias === 'SMC_FVG'
    ? 'Focus strictly on SMC Liquidity Sweeps & FVG/Order Block Retests (BSL/SSL sweep + FVG/OB pullback).'
    : targetStrategyBias === 'TREND_PULLBACK'
    ? 'Focus strictly on Trend Continuation & Pullback setups (strong SMA trend + EMA/price pullback rejection).'
    : targetStrategyBias === 'BREAKOUT'
    ? 'Focus strictly on Breakout & Displacement Momentum (clear structural breakout with strong candle bodies).'
    : 'Look for ANY of these valid price action triggers:\n1. SMC Liquidity Sweep & Retest (BSL/SSL sweep + FVG/OB pullback).\n2. Trend Continuation & Pullback (strong SMA trend + EMA/price pullback rejection).\n3. Breakout & Displacement Momentum (clear structural breakout with strong candle bodies).'
}

ADAPTIVE TECHNICAL TRADE EVALUATION & RECENT TRADES CONTEXT:
Incorporate recentTrades into your technical evaluation context:
- Analyze if previous trades were stopped out prematurely (SL hit due to noise/tight SL), counter-trend, or hit TP cleanly.
- Adapt current entry, SL, and TP structure to avoid repeating previous technical mistakes (e.g. widening SL if recent trades suffered wick stop-outs, aligning with macro SMA trend if recent counter-trend trades failed, or adjusting TP placement to satisfy minimum R:R).

SIGNAL RULES & PARAMETERS:
- If there is clear directional momentum or a valid pullback/breakout rejection aligned with Strategy Bias:
  - Output "action": "BUY" or "SELL".
  - Set "confidence": 65-95 depending on setup clarity.
  - Set "orderType": "MARKET" for immediate entries, or "BUY_LIMIT" / "SELL_LIMIT" / "BUY_STOP" / "SELL_STOP" for pending pullback/breakout entries.
  - Provide exact entryPrice, logical structural slPrice, and tpPrice with R:R of AT LEAST 1:${targetMinRR} (plannedRR >= ${targetMinRR}).
  - Set "riskPercent": ${targetRiskPercent}.
- If price is tightly ranging in a dead zone with zero momentum or direction, output "action": "WAIT" with confidence: 40.

CRITICAL REQUIREMENT: Respond ONLY with a valid, clean JSON object matching this exact schema:
{
  "action": "BUY" | "SELL" | "WAIT",
  "orderType": "MARKET" | "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP",
  "confidence": 75,
  "setupName": "M1 Trend Pullback & Order Block Rejection",
  "reasoning": "Short 1-2 sentence sharp technical reasoning in natural trader slang.",
  "technicalEvaluation": "1-2 sentences explaining technical adjustments made relative to recent trade outcomes, strategy bias, and target RR.",
  "entryPrice": 2725.50,
  "slPrice": 2722.00,
  "tpPrice": 2730.75,
  "plannedRR": 1.75,
  "riskPercent": ${targetRiskPercent},
  "slDistancePips": 3.5
}

Rules:
1. If "action" is "WAIT", set confidence to 40, set orderType, entryPrice, slPrice, tpPrice, plannedRR, slDistancePips to null, and technicalEvaluation to explanation of market state.
2. If "action" is "BUY" or "SELL", ensure plannedRR >= ${targetMinRR}.
3. Calculate slDistancePips based on symbol (for XAUUSD 1.0 = 10 pips, for Forex 0.0010 = 10 pips).
4. Do not include any text outside the JSON. Format numbers cleanly.`;

    let langInstruction = 'OUTPUT LANGUAGE: Indonesian trader slang (Bahasa Indonesia santai/profesional untuk trader). Use terms like "Liquidity Sweep", "Fair Value Gap", "Order Block", "Breakout", "Retest" naturally.';
    if (language === 'en') {
      langInstruction = 'OUTPUT LANGUAGE: Sharp, professional English quant trader terminology.';
    }

    const sampleCandles = recentCandles.slice(-60);
    const smcMetrics = computeSmcTechnicalMetrics(sampleCandles, currentPrice);

    const payloadSample = {
      symbol,
      timeframe,
      currentPrice,
      accountBalance: balance,
      traderPreferences: {
        minRR: targetMinRR,
        riskPercent: targetRiskPercent,
        strategyBias: targetStrategyBias
      },
      recentTrades: Array.isArray(recentTrades) ? recentTrades : [],
      candleCount: sampleCandles.length,
      smcMetrics,
      candles: sampleCandles.map((c: any) => ({
        t: c.time ? new Date(c.time).toISOString().slice(11, 19) : '',
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume
      }))
    };

    const prompt = `Analyze this realtime chart cursor payload and detect if there is a high-probability SMC/Price Action setup:
${langInstruction}

Chart & Indicator Metrics:
${JSON.stringify(payloadSample, null, 2)}`;

    const config = await getAiConfig();
    const rawAnalysis = await queryLLM([{ role: 'user', content: prompt }], config, copilotSystemPrompt);
    const structuredData = extractStructuredJson(rawAnalysis);

    return res.json({
      ok: true,
      signal: structuredData,
      rawText: rawAnalysis,
      meta: {
        symbol,
        timeframe,
        currentPrice,
        modelUsed: config.model
      }
    });
  } catch (error: any) {
    console.error('Chart AI Copilot Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to analyze chart candles' });
  }
});

// POST /api/ai/analyze-session/:id
router.post('/analyze-session/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id;
    const session = await prisma.backtestSession.findUnique({
      where: { id: sessionId },
      include: { trades: true }
    });

    if (!session) {
      return res.status(404).json({ ok: false, error: 'Backtest session not found' });
    }

    const trades = session.trades || [];
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    const winTrades = closedTrades.filter(t => (t.netPnlUsd || 0) > 0 || t.result === 'WIN');
    const lossTrades = closedTrades.filter(t => (t.netPnlUsd || 0) < 0 || t.result === 'LOSS');
    const beTrades = closedTrades.filter(t => t.result === 'BE' || (t.netPnlUsd === 0));

    const totalPnlUsd = closedTrades.reduce((acc, t) => acc + (t.netPnlUsd || 0), 0);
    const winrate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0;
    const grossProfit = winTrades.reduce((acc, t) => acc + (t.netPnlUsd || 0), 0);
    const grossLoss = Math.abs(lossTrades.reduce((acc, t) => acc + (t.netPnlUsd || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    let peak = session.initialBalance;
    let balance = session.initialBalance;
    let maxDdUsd = 0;
    let maxDdPct = 0;

    closedTrades.forEach(t => {
      balance += (t.netPnlUsd || 0);
      if (balance > peak) peak = balance;
      const ddUsd = peak - balance;
      const ddPct = peak > 0 ? (ddUsd / peak) * 100 : 0;
      if (ddUsd > maxDdUsd) maxDdUsd = ddUsd;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
    });

    const mistakeCounts: Record<string, number> = {};
    const setupCounts: Record<string, { total: number; wins: number; pnl: number }> = {};
    const emotionCounts: Record<string, number> = {};

    closedTrades.forEach(t => {
      if (t.mistakeTag) mistakeCounts[t.mistakeTag] = (mistakeCounts[t.mistakeTag] || 0) + 1;
      if (t.emotionTag) emotionCounts[t.emotionTag] = (emotionCounts[t.emotionTag] || 0) + 1;
      
      const setup = t.setupTag || 'Untagged';
      if (!setupCounts[setup]) setupCounts[setup] = { total: 0, wins: 0, pnl: 0 };
      setupCounts[setup].total += 1;
      if ((t.netPnlUsd || 0) > 0) setupCounts[setup].wins += 1;
      setupCounts[setup].pnl += (t.netPnlUsd || 0);
    });

    const summaryPayload = {
      sessionName: session.name,
      symbol: session.symbol,
      timeframe: session.timeframe,
      initialBalance: session.initialBalance,
      endingBalance: balance,
      netPnlUsd: totalPnlUsd,
      netPnlPct: session.initialBalance > 0 ? (totalPnlUsd / session.initialBalance) * 100 : 0,
      totalTrades: trades.length,
      closedTrades: closedTrades.length,
      winratePct: winrate.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      maxDrawdownUsd: maxDdUsd.toFixed(2),
      maxDrawdownPct: maxDdPct.toFixed(2),
      mistakeDistribution: mistakeCounts,
      setupPerformance: setupCounts,
      emotionDistribution: emotionCounts,
      recentTradesSample: closedTrades.slice(-10).map(t => ({
        tradeNum: t.tradeNumber,
        side: t.side,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        pnlUsd: t.netPnlUsd,
        rMultiple: t.rMultiple,
        durationMinutes: t.durationMinutes,
        setup: t.setupTag,
        mistake: t.mistakeTag,
        emotion: t.emotionTag
      }))
    };

    const { language = 'id' } = req.body || {};

    let langInstruction = 'OUTPUT LANGUAGE & TONE REQUIREMENT:\nYou MUST generate all textual fields in expressive, punchy, brutally honest Indonesian trader slang (Bahasa Indonesia santai/gaul/trader forex). Praise clean entries enthusiastically ("Gokil!", "Sniper institusi") and ROAST dumb mistakes brutally ("Lu ngapain anjir baru win langsung maruk balik arah", "Trading kek orang kesurupan"). Use real numbers/trade numbers as evidence.';
    if (language === 'en') {
      langInstruction = 'OUTPUT LANGUAGE & TONE REQUIREMENT:\nYou MUST generate all textual fields in punchy, brutally honest, witty English trader slang. Praise clean entries and roast dumb mistakes ruthlessly based on trade evidence.';
    }

    const prompt = `Analyze this trading session metrics payload and provide a comprehensive performance & psychology audit as an elite trading mentor.
${langInstruction}

Session Data Payload:
${JSON.stringify(summaryPayload, null, 2)}`;

    const config = await getAiConfig();
    const rawAnalysis = await queryLLM([{ role: 'user', content: prompt }], config);
    const structuredData = extractStructuredJson(rawAnalysis);

    return res.json({
      ok: true,
      data: structuredData,
      rawText: rawAnalysis,
      meta: {
        sessionId: session.id,
        sessionName: session.name,
        totalTrades: closedTrades.length,
        modelUsed: config.model,
        language
      }
    });

  } catch (error: any) {
    console.error('Session AI Analysis Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to generate session AI analysis' });
  }
});

// POST /api/ai/analyze-trade/:id
router.post('/analyze-trade/:id', async (req: Request, res: Response) => {
  try {
    const tradeId = req.params.id;
    const { language = 'id' } = req.body || {};

    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { session: true }
    });

    if (!trade) {
      return res.status(404).json({ ok: false, error: 'Trade record not found' });
    }

    const tradePayload = {
      tradeId: trade.id,
      tradeNumber: trade.tradeNumber,
      symbol: trade.symbol,
      side: trade.side,
      timeframe: trade.timeframe,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      slPrice: trade.slPrice,
      tpPrice: trade.tpPrice,
      qty: trade.qty,
      pnlUsd: trade.netPnlUsd,
      pnlPct: trade.netPnlPct,
      rMultiple: trade.rMultiple,
      plannedRR: trade.plannedRR,
      maxPotentialRR: trade.maxPotentialRR,
      durationMinutes: trade.durationMinutes,
      setupTag: trade.setupTag,
      mistakeTag: trade.mistakeTag,
      emotionTag: trade.emotionTag,
      notes: trade.notes,
      sessionName: trade.session?.name
    };

    let langInstruction = 'OUTPUT LANGUAGE & TONE REQUIREMENT:\nYou MUST generate all textual fields in expressive, punchy, brutally honest Indonesian trader slang (Bahasa Indonesia santai/gaul/trader forex). Praise clean entries enthusiastically ("Gokil!", "Sniper institusi") and ROAST dumb mistakes brutally ("Lu ngapain anjir baru win langsung maruk balik arah", "Trading kek orang kesurupan"). Use real numbers/trade numbers as evidence.';
    if (language === 'en') {
      langInstruction = 'OUTPUT LANGUAGE & TONE REQUIREMENT:\nYou MUST generate all textual fields in punchy, brutally honest, witty English trader slang. Praise clean entries and roast dumb mistakes ruthlessly based on trade evidence.';
    }

    const prompt = `Audit this single trade execution context and evaluate if SL/TP positioning, risk management, and entry timing were optimal:
${langInstruction}

Trade Data Payload:
${JSON.stringify(tradePayload, null, 2)}`;

    const config = await getAiConfig();
    const rawAnalysis = await queryLLM([{ role: 'user', content: prompt }], config);
    const structuredData = extractStructuredJson(rawAnalysis);

    return res.json({
      ok: true,
      data: structuredData,
      rawText: rawAnalysis,
      meta: {
        tradeId: trade.id,
        tradeNumber: trade.tradeNumber,
        modelUsed: config.model,
        language
      }
    });
  } catch (error: any) {
    console.error('Trade AI Analysis Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to generate trade AI analysis' });
  }
});

export default router;
