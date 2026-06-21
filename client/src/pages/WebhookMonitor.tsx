import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  Terminal, 
  Copy, 
  CheckCircle, 
  AlertTriangle, 
  Info, 
  RefreshCw, 
  Clock, 
  Lock 
} from 'lucide-react';
import { useJournalStore } from '../store/useJournalStore';
import { formatDate, formatUsd, formatR } from '../utils/formatters';

interface WebhookSummary {
  openTrades: any[];
  closedTrades: any[];
  summaryCounts: {
    success: number;
    error: number;
    orphan: number;
  };
}

export default function WebhookMonitor() {
  const { settings, fetchSettings } = useJournalStore();
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<WebhookSummary | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState<'url' | 'token' | 'pine' | null>(null);

  // Determine local API URL
  const webhookUrl = `${window.location.origin}/api/webhook/tradingview`;

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch settings for token
      await fetchSettings();
      
      // Fetch events logs
      const eventsRes = await fetch('/api/webhook/events');
      const eventsData = await eventsRes.json();
      setEvents(eventsData);

      // Fetch open/closed trades and counts
      const summaryRes = await fetch('/api/webhook/summary');
      const summaryData = await summaryRes.json();
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to refresh webhook monitor data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string, type: 'url' | 'token' | 'pine') => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const pineScriptCode = `//@version=5
strategy("ReplayFX Webhook Template", overlay=true)

// Webhook Settings
secretToken = "replayfx_secret_token_123" // Ganti dengan token Anda
symbol = syminfo.ticker
tf = timeframe.period
riskUsd = 50.0 // nominal resiko dalam USD

// Parameter SL / TP
slTicks = 300
tpTicks = 600

// Kondisi Entry (Contoh Sederhana)
longCondition = ta.crossover(ta.ema(close, 9), ta.ema(close, 21))
shortCondition = ta.crossunder(ta.ema(close, 9), ta.ema(close, 21))

// Trade ID unik untuk mencocokkan ENTRY dan EXIT
var string activeTradeId = ""

if (longCondition and strategy.position_size == 0)
    activeTradeId := "trade_" + str.tostring(time)
    strategy.entry("LONG", strategy.long)
    
    // Kirim Webhook Entry ke backend ReplayFX
    alert('{"secret": "' + secretToken + '", "source": "tradingview", "event": "ENTRY", "trade_id": "' + activeTradeId + '", "symbol": "' + symbol + '", "timeframe": "' + tf + '", "side": "buy", "fill_price": ' + str.tostring(close) + ', "sl": ' + str.tostring(close - (slTicks * syminfo.mintick)) + ', "tp": ' + str.tostring(close + (tpTicks * syminfo.mintick)) + ', "rr": 2.0, "risk_usd": ' + str.tostring(riskUsd) + ', "setup": "EMA Cross LONG"}', alert.freq_once_per_bar)

if (shortCondition and strategy.position_size == 0)
    activeTradeId := "trade_" + str.tostring(time)
    strategy.entry("SHORT", strategy.short)
    
    // Kirim Webhook Entry ke backend ReplayFX
    alert('{"secret": "' + secretToken + '", "source": "tradingview", "event": "ENTRY", "trade_id": "' + activeTradeId + '", "symbol": "' + symbol + '", "timeframe": "' + tf + '", "side": "sell", "fill_price": ' + str.tostring(close) + ', "sl": ' + str.tostring(close + (slTicks * syminfo.mintick)) + ', "tp": ' + str.tostring(close - (slTicks * syminfo.mintick)) + ', "rr": 2.0, "risk_usd": ' + str.tostring(riskUsd) + ', "setup": "EMA Cross SHORT"}', alert.freq_once_per_bar)

// Kondisi Exit (Close Posisi)
if (strategy.position_size > 0 and ta.crossunder(close, ta.ema(close, 9)))
    strategy.close("LONG")
    alert('{"secret": "' + secretToken + '", "source": "tradingview", "event": "EXIT", "trade_id": "' + activeTradeId + '", "fill_price": ' + str.tostring(close) + ', "setup": "EMA Close LONG"}', alert.freq_once_per_bar)

if (strategy.position_size < 0 and ta.crossover(close, ta.ema(close, 9)))
    strategy.close("SHORT")
    alert('{"secret": "' + secretToken + '", "source": "tradingview", "event": "EXIT", "trade_id": "' + activeTradeId + '", "fill_price": ' + str.tostring(close) + ', "setup": "EMA Close SHORT"}', alert.freq_once_per_bar)`;

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Webhook Developer Control</h1>
          <p className="text-xs text-[#707a8a] mt-1">
            Gunakan panel ini untuk memantau request real-time webhook TradingView Pine Script dan status mapping event.
          </p>
        </div>
        
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 bg-[#2b3139] hover:bg-[#363e47] text-[#eaecef] rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan ({loading ? '...' : 'Refresh'})</span>
        </button>
      </div>

      {/* Integration configurations grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Developer Instructions & URLs */}
        <div className="lg:col-span-1 space-y-6">
          <div className=" rounded-xl p-5 border border-[#2b3139] space-y-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
              <Terminal className="w-4 h-4 text-[#0ecb81]" />
              <span>Pengaturan Koneksi</span>
            </h3>

            {/* Webhook Endpoint Destination */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#707a8a] uppercase block">URL Webhook</label>
              <div className="flex bg-gray-950 border border-gray-850 rounded-lg overflow-hidden p-1">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="bg-transparent flex-1 text-xs outline-none px-2 font-mono text-[#eaecef]"
                />
                <button
                  onClick={() => copyToClipboard(webhookUrl, 'url')}
                  className="p-1.5 bg-[#1e2329] hover:bg-[#2b3139] rounded text-[#929aa5] hover:text-white transition"
                >
                  {copiedText === 'url' ? <span className="text-[10px] text-[#0ecb81] font-semibold px-1">Copied!</span> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Secret Authorization Token */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#707a8a] uppercase block">Secret Token Webhook</label>
              <div className="flex bg-gray-950 border border-gray-850 rounded-lg overflow-hidden p-1">
                <input
                  type="text"
                  readOnly
                  value={settings?.secretToken}
                  className="bg-transparent flex-1 text-xs outline-none px-2 font-mono text-[#eaecef]"
                />
                <button
                  onClick={() => copyToClipboard(settings?.secretToken, 'token')}
                  className="p-1.5 bg-[#1e2329] hover:bg-[#2b3139] rounded text-[#929aa5] hover:text-white transition"
                >
                  {copiedText === 'token' ? <span className="text-[10px] text-[#0ecb81] font-semibold px-1">Copied!</span> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-[#707a8a] flex items-start space-x-1">
                <Lock className="w-3 h-3 text-[#707a8a] shrink-0 mt-0.5" />
                <span>Masukkan token ini ke kolom JSON payload "secret" di TradingView Pine Script Anda.</span>
              </p>
            </div>

            {/* Mini visual summary audit counts */}
            {summary && (
              <div className="border-t border-gray-850 pt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-accentEmerald/5 border border-accentEmerald/10 rounded-lg py-2">
                  <span className="text-[10px] text-[#707a8a] block uppercase">Sukses</span>
                  <span className="font-bold text-[#0ecb81]">{summary.summaryCounts.success}</span>
                </div>
                <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg py-2">
                  <span className="text-[10px] text-[#707a8a] block uppercase">Orphan</span>
                  <span className="font-bold text-orange-400">{summary.summaryCounts.orphan}</span>
                </div>
                <div className="bg-lossRed/5 border border-lossRed/10 rounded-lg py-2">
                  <span className="text-[10px] text-[#707a8a] block uppercase">Error</span>
                  <span className="font-bold text-[#f6465d]">{summary.summaryCounts.error}</span>
                </div>
              </div>
            )}
          </div>

          {/* Webhook Active Trade Lists */}
          <div className=" rounded-xl p-5 border border-[#2b3139] space-y-4">
            <h3 className="text-xs font-bold text-[#929aa5] uppercase tracking-wider">
              Trade Webhook Berjalan ({summary?.openTrades.length || 0})
            </h3>
            
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {!summary || summary.openTrades.length === 0 ? (
                <p className="text-xs text-[#707a8a] italic py-4 text-center">Tidak ada trade open.</p>
              ) : (
                summary.openTrades.map((t) => (
                  <div key={t.id} className="bg-accentCyan/5 border border-accentCyan/15 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-gray-200">{t.symbol}</span>
                      <span className="text-[9px] font-bold bg-[rgba(14,203,129,0.12)] text-[#0ecb81] px-1.5 py-0.5 rounded animate-pulse">
                        {t.side}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-[#929aa5]">
                      <span>Harga Masuk: {t.entryPrice.toLocaleString()}</span>
                      <span>TF: {t.timeframe}</span>
                    </div>
                    <div className="text-[10px] text-[#707a8a] flex justify-between">
                      <span>{formatDate(t.entryTime)}</span>
                      <span>Setup: {t.entrySignal}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Pine Script Template & Event Audit Logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pine Script Template */}
          <div className=" rounded-xl p-5 border border-[#2b3139] space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <Terminal className="w-4 h-4 text-[#0ecb81]" />
                <span>Contoh Pine Script v5</span>
              </h3>
              <button
                onClick={() => copyToClipboard(pineScriptCode, 'pine')}
                className="px-2.5 py-1 bg-[#2b3139] hover:bg-[#363e47] text-[#eaecef] rounded text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                {copiedText === 'pine' ? <span>Copied!</span> : <span>Copy Kode</span>}
              </button>
            </div>
            <pre className="bg-gray-950 p-4 rounded-xl text-[10px] font-mono text-[#929aa5] overflow-x-auto border border-gray-850 max-h-48 leading-normal">
              {pineScriptCode}
            </pre>
          </div>

          {/* Webhook Audit Log Feed */}
          <div className=" rounded-xl border border-[#2b3139] overflow-hidden">
            <div className="p-5 border-b border-[#2b3139] bg-[#1e2329]/10 flex justify-between items-center">
              <h3 className="text-xs font-bold text-[#929aa5] uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-[#929aa5]" />
                <span>Log Aktivitas Webhook Terbaru</span>
              </h3>
              <span className="text-[9px] bg-[#2b3139] px-2 py-0.5 rounded text-[#707a8a] font-semibold uppercase">
                100 Request Terakhir
              </span>
            </div>

            <div className="p-4 max-h-[300px] overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-center text-xs text-[#707a8a] py-12 italic">Belum ada request webhook yang masuk.</p>
              ) : (
                <div className="space-y-3">
                  {events.map((e) => {
                    const isSuccess = e.status === 'SUCCESS';
                    const isOrphan = e.status === 'ORPHAN';
                    
                    return (
                      <div 
                        key={e.id} 
                        className={`border rounded-xl p-3 text-xs space-y-2 ${
                          isSuccess 
                            ? 'bg-accentEmerald/5 border-accentEmerald/10' 
                            : isOrphan 
                            ? 'bg-orange-500/5 border-orange-500/10' 
                            : 'bg-lossRed/5 border-lossRed/10'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isSuccess 
                                ? 'bg-accentEmerald/25 text-[#0ecb81]' 
                                : isOrphan 
                                ? 'bg-orange-500/25 text-orange-400' 
                                : 'bg-lossRed/25 text-[#f6465d]'
                            }`}>
                              {e.status}
                            </span>
                            <span className="font-semibold text-[#eaecef]">
                              {e.eventType} (ID: {e.tradeId})
                            </span>
                          </div>
                          <span className="text-[10px] text-[#707a8a]">{formatDate(e.receivedAt)}</span>
                        </div>

                        {!isSuccess && e.errorMessage && (
                          <p className="text-[11px] text-[#f6465d] font-semibold flex items-center space-x-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{e.errorMessage}</span>
                          </p>
                        )}

                        <details className="text-[10px] text-[#707a8a] font-mono">
                          <summary className="cursor-pointer hover:text-[#eaecef] transition outline-none select-none font-semibold">
                            Tampilkan Raw Payload JSON
                          </summary>
                          <div className="mt-1.5 p-2 bn-card  rounded border border-gray-900 overflow-x-auto whitespace-pre-wrap leading-normal">
                            {JSON.stringify(JSON.parse(e.rawPayload), null, 2)}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
