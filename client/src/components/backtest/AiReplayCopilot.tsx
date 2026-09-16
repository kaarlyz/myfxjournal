import React, { useState } from 'react';
import { Sparkles, Brain, RefreshCw, Zap, Check, ArrowUpRight, ArrowDownRight, AlertTriangle, ShieldCheck, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardBody } from '../ui/Card';
import { apiUrl, defaultHeaders } from '../../utils/api';

export interface AiCopilotSignal {
  action: 'BUY' | 'SELL' | 'WAIT';
  orderType?: 'MARKET' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | null;
  confidence: number;
  setupName: string;
  reasoning: string;
  entryPrice: number | null;
  slPrice: number | null;
  tpPrice: number | null;
  plannedRR: number | null;
  riskPercent: number | null;
  slDistancePips: number | null;
}

interface AiReplayCopilotProps {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  candles: Array<{ time: any; open: number; high: number; low: number; close: number; volume?: number }>;
  balance: number;
  onApplySignal: (signal: AiCopilotSignal) => void;
  onExecuteMarket?: (params: { side: 'LONG' | 'SHORT'; entryPrice: number; slPrice?: number | null; tpPrice?: number | null; riskPercent?: number | null }) => void;
  onPlacePending?: (params: { side: 'LONG' | 'SHORT'; orderType: string; price: number; slPrice?: number | null; tpPrice?: number | null; riskPercent?: number | null }) => void;
  onClose?: () => void;
  className?: string;
}

export function AiReplayCopilot({
  symbol,
  timeframe,
  currentPrice,
  candles,
  balance,
  onApplySignal,
  onExecuteMarket,
  onPlacePending,
  onClose,
  className = ''
}: AiReplayCopilotProps) {
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<AiCopilotSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedToast, setAppliedToast] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [autoRecalibrate, setAutoRecalibrate] = useState<boolean>(true);

  // Compute Live Market R:R if signal active
  const liveMarketRR = React.useMemo(() => {
    if (!signal || signal.action === 'WAIT' || !signal.slPrice || !signal.tpPrice) return null;
    const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
    const liveRisk = side === 'LONG' ? currentPrice - signal.slPrice : signal.slPrice - currentPrice;
    const liveReward = side === 'LONG' ? signal.tpPrice - currentPrice : currentPrice - signal.tpPrice;
    if (liveRisk <= 0 || liveReward <= 0) return { isValid: false, rr: 0, liveRisk, liveReward };
    const rr = liveReward / liveRisk;
    return { isValid: rr >= 1.0, rr, liveRisk, liveReward };
  }, [signal, currentPrice]);

  const isPullbackLimitSetup = React.useMemo(() => {
    if (!signal || signal.action === 'WAIT' || !signal.entryPrice) return false;
    const isLimitType = signal.orderType === 'BUY_LIMIT' || signal.orderType === 'SELL_LIMIT';
    const priceDiff = Math.abs(signal.entryPrice - currentPrice);
    return isLimitType || priceDiff > (currentPrice * 0.0005);
  }, [signal, currentPrice]);

  const runChartScan = async () => {
    setLoading(true);
    setError(null);
    setAppliedToast(null);

    try {
      const recentCandles = candles.slice(-40);
      const res = await fetch(apiUrl('/ai/analyze-chart'), {
        method: 'POST',
        headers: defaultHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          symbol,
          timeframe,
          currentPrice,
          recentCandles,
          balance,
          language: 'id'
        })
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Failed to generate AI Copilot signal');
      }

      setSignal(json.signal);
    } catch (err: any) {
      setError(err.message || 'Connection error with AI Copilot');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!signal || signal.action === 'WAIT') return;
    onApplySignal(signal);
    setAppliedToast('✅ Sinyal AI Diterapkan! Parameter OrderPanel terisi otomatis.');
    setTimeout(() => setAppliedToast(null), 4000);
  };

  const handleExecuteMarketDirect = () => {
    if (!signal || signal.action === 'WAIT') return;
    const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
    let targetTp = signal.tpPrice;

    // Auto-recalibrate TP if enabled and live R:R < 1.0 or setup is limit pullback
    if (autoRecalibrate && liveMarketRR && (!liveMarketRR.isValid || isPullbackLimitSetup)) {
      const slP = signal.slPrice ?? (side === 'LONG' ? currentPrice - 5 : currentPrice + 5);
      const riskDist = Math.abs(currentPrice - slP);
      const targetRR = signal.plannedRR && signal.plannedRR >= 1.5 ? signal.plannedRR : 2.0;
      targetTp = side === 'LONG'
        ? Math.round((currentPrice + riskDist * targetRR) * 100) / 100
        : Math.round((currentPrice - riskDist * targetRR) * 100) / 100;
    }

    if (onExecuteMarket) {
      onExecuteMarket({
        side,
        entryPrice: currentPrice,
        slPrice: signal.slPrice,
        tpPrice: targetTp,
        riskPercent: signal.riskPercent,
      });
      setAppliedToast(`⚡ Market Order Executed @ ${currentPrice}${autoRecalibrate ? ' (TP Auto-Recalibrated)' : ''}`);
      setTimeout(() => setAppliedToast(null), 4000);
    } else {
      handleApply();
    }
  };

  const handlePlacePendingDirect = () => {
    if (!signal || signal.action === 'WAIT' || !signal.entryPrice) return;
    const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
    let orderType = signal.orderType && signal.orderType !== 'MARKET'
      ? signal.orderType
      : (side === 'LONG'
          ? (signal.entryPrice >= currentPrice ? 'BUY_STOP' : 'BUY_LIMIT')
          : (signal.entryPrice <= currentPrice ? 'SELL_STOP' : 'SELL_LIMIT'));

    if (onPlacePending) {
      onPlacePending({
        side,
        orderType,
        price: signal.entryPrice,
        slPrice: signal.slPrice,
        tpPrice: signal.tpPrice,
        riskPercent: signal.riskPercent,
      });
      setAppliedToast(`📌 Pending Order (${orderType}) Berhasil Ditempatkan!`);
      setTimeout(() => setAppliedToast(null), 4000);
    } else {
      handleApply();
    }
  };

  return (
    <Card className={`w-[340px] sm:w-[380px] border-2 border-[#121212] bg-white shadow-[6px_6px_0px_0px_#121212] rounded-lg overflow-hidden select-none ${className}`}>
      {/* Drag & Header Bar */}
      <div className="bg-[#121212] text-white px-3 py-2 flex items-center justify-between border-b-2 border-[#121212] cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-1.5 min-w-0">
          <Brain className="w-4 h-4 text-[#FFD000] shrink-0" />
          <span className="font-black text-xs uppercase tracking-wider font-display truncate">
            ⚡ MurplyFX AI Copilot
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="yellow"
            className="h-6 text-[10px] font-black uppercase px-2 py-0 shrink-0"
            onClick={runChartScan}
            disabled={loading}
          >
            {loading ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            {loading ? 'Scanning...' : 'Scan Candle'}
          </Button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Minimize' : 'Expand'}
            className="text-[#A0A0A0] hover:text-white text-xs font-mono px-1 py-0.5 rounded hover:bg-[#2A2A2A] transition-colors cursor-pointer"
          >
            {isExpanded ? '−' : '+'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Tutup Copilot"
              className="text-[#A0A0A0] hover:text-[#FF4D4D] text-xs font-mono px-1 py-0.5 rounded hover:bg-[#2A2A2A] transition-colors cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <CardBody className="p-3 space-y-3 bg-[#F8F9FA]">
          {appliedToast && (
            <div className="bg-[#10B981] text-white p-2 text-xs font-bold border border-[#121212] flex items-center gap-1.5 animate-fade-in break-words">
              <Check className="w-4 h-4 shrink-0" />
              <span>{appliedToast}</span>
            </div>
          )}

          {!signal && !loading && !error && (
            <div className="text-center py-2 space-y-1">
              <p className="text-xs text-[#717182] font-semibold break-words leading-relaxed">
                Klik <b>Scan Candle</b> untuk mendeteksi setup SMC / Price Action pada chart.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-[#121212] break-words">
              <RefreshCw className="w-4 h-4 text-[#1040C0] animate-spin shrink-0" />
              Menganalisis pergerakan harga & liquidity pool...
            </div>
          )}

          {error && (
            <div className="bg-[#FFF0F0] border-2 border-[#D02020] p-2 text-xs font-bold text-[#D02020] flex items-center justify-between gap-2 break-words">
              <span className="break-words">{error}</span>
              <button onClick={runChartScan} className="underline text-[10px] font-mono shrink-0">Retry</button>
            </div>
          )}

          {signal && !loading && (
            <div className="space-y-2.5 animate-fade-in">
              {/* Signal Badge Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white border-2 border-[#121212] p-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  {signal.action === 'BUY' && (
                    <Badge variant="profit" className="text-[11px] font-black uppercase px-2 py-0.5 shrink-0">
                      <ArrowUpRight className="w-3.5 h-3.5 inline mr-0.5" /> 🟢 BUY SIGNAL
                    </Badge>
                  )}
                  {signal.action === 'SELL' && (
                    <Badge variant="loss" className="text-[11px] font-black uppercase px-2 py-0.5 shrink-0">
                      <ArrowDownRight className="w-3.5 h-3.5 inline mr-0.5" /> 🔴 SELL SIGNAL
                    </Badge>
                  )}
                  {signal.action === 'WAIT' && (
                    <Badge variant="neutral" className="text-[11px] font-black uppercase px-2 py-0.5 bg-[#E2E8F0] text-[#121212] shrink-0">
                      ⚪ WAIT / NO SETUP
                    </Badge>
                  )}
                  <span className="text-xs font-extrabold text-[#121212] break-words">{signal.setupName}</span>
                </div>
                <div className="text-[10px] font-mono font-bold text-[#717182] shrink-0">
                  Confidence: <b className="text-[#121212]">{signal.confidence}%</b>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-white border-2 border-[#121212] p-2.5 text-xs text-[#121212] font-medium leading-relaxed break-words">
                💡 <b>Reasoning:</b> <span className="break-words">{signal.reasoning}</span>
              </div>

              {/* R:R Protection Warning Box if Live Market R:R < 1.0 or Pullback Limit recommended */}
              {signal.action !== 'WAIT' && liveMarketRR && (!liveMarketRR.isValid || isPullbackLimitSetup) && (
                <div className="bg-[#FFFBEB] border-2 border-[#D97706] p-2 text-xs font-bold text-[#B45309] space-y-1">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
                    <span className="uppercase font-black text-[11px]">
                      {!liveMarketRR.isValid
                        ? `⚠️ R:R Hancur (${liveMarketRR.rr.toFixed(2)}R) - Harga Sudah Lari!`
                        : '📌 Setup Pullback Limit (Disarankan Limit)'}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium leading-snug text-[#92400E]">
                    {!liveMarketRR.isValid
                      ? 'Eksekusi Market di harga saat ini merusak rasio R:R. Disarankan pasang Pending Limit.'
                      : 'Harga berada di luar level ideal pullback. Gunakan Pending Limit agar entry presisi.'}
                  </p>
                </div>
              )}

              {/* Levels Grid (If Action !== WAIT) */}
              {signal.action !== 'WAIT' && signal.entryPrice && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center font-mono text-[11px]">
                  <div className="bg-white border border-[#121212] p-1.5 min-w-0">
                    <div className="text-[9px] text-[#717182] font-bold uppercase truncate">Entry</div>
                    <div className="font-black text-[#121212] truncate">{signal.entryPrice}</div>
                  </div>
                  <div className="bg-[#FFF0F0] border border-[#121212] p-1.5 min-w-0">
                    <div className="text-[9px] text-[#D02020] font-bold uppercase truncate">SL</div>
                    <div className="font-black text-[#D02020] truncate">{signal.slPrice ?? '-'}</div>
                  </div>
                  <div className="bg-[#F0FDF4] border border-[#121212] p-1.5 min-w-0">
                    <div className="text-[9px] text-[#16A34A] font-bold uppercase truncate">TP</div>
                    <div className="font-black text-[#16A34A] truncate">{signal.tpPrice ?? '-'}</div>
                  </div>
                  <div className="bg-[#FFFBEB] border border-[#121212] p-1.5 min-w-0">
                    <div className="text-[9px] text-[#D97706] font-bold uppercase truncate">RR Target</div>
                    <div className="font-black text-[#D97706] truncate">{signal.plannedRR ?? 0}R ({signal.riskPercent ?? 1}%)</div>
                  </div>
                </div>
              )}

              {/* Auto-Recalibrate TP Toggle */}
              {signal.action !== 'WAIT' && (
                <div className="flex items-center justify-between bg-white border border-[#121212] px-2.5 py-1.5 text-[11px] font-bold text-[#121212]">
                  <label htmlFor="auto-recalibrate" className="flex items-center gap-1.5 cursor-pointer">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#1040C0]" />
                    <span>Auto-Recalibrate TP jika Market Execution</span>
                  </label>
                  <input
                    id="auto-recalibrate"
                    type="checkbox"
                    checked={autoRecalibrate}
                    onChange={(e) => setAutoRecalibrate(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#1040C0] cursor-pointer"
                  />
                </div>
              )}

              {/* 1-Click Execution Action Buttons */}
              {signal.action !== 'WAIT' && (
                <div className="flex flex-col gap-2 pt-1">
                  {/* Primary Button: Highlight Pending Limit if pullback limit setup */}
                  {isPullbackLimitSetup ? (
                    <>
                      <Button
                        variant="yellow"
                        fullWidth
                        className="font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_#121212] justify-center py-2.5 h-auto"
                        onClick={handlePlacePendingDirect}
                      >
                        <Play className="w-4 h-4 mr-1.5 shrink-0 text-[#121212]" />
                        <span>📌 Pasang Pending Limit/Stop (REKOMENDASI AI)</span>
                      </Button>

                      <Button
                        variant="secondary"
                        fullWidth
                        className="font-black text-xs uppercase tracking-wider bg-white hover:bg-[#F0F0F0] text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] justify-center py-2 h-auto"
                        onClick={handleExecuteMarketDirect}
                      >
                        <Zap className="w-3.5 h-3.5 mr-1.5 shrink-0 text-[#D97706]" />
                        <span>⚡ Eksekusi Market Sekarang (Harga Lari)</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="yellow"
                        fullWidth
                        className="font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_#121212] justify-center py-2 h-auto"
                        onClick={handleExecuteMarketDirect}
                      >
                        <Zap className="w-4 h-4 mr-1.5 shrink-0" />
                        <span>⚡ Eksekusi Market Sekarang</span>
                      </Button>

                      <Button
                        variant="secondary"
                        fullWidth
                        className="font-black text-xs uppercase tracking-wider bg-white hover:bg-[#F0F0F0] text-[#121212] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] justify-center py-2 h-auto"
                        onClick={handlePlacePendingDirect}
                      >
                        <Play className="w-3.5 h-3.5 mr-1.5 shrink-0 text-[#1040C0]" />
                        <span>📌 Pasang Pending Limit/Stop</span>
                      </Button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleApply}
                    className="text-[11px] font-bold text-[#717182] hover:text-[#121212] underline text-center cursor-pointer mt-0.5"
                  >
                    Atau autofill ke Form OrderPanel saja
                  </button>
                </div>
              )}
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}
