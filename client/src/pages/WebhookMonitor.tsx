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
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

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
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <PageHeader 
          label="Webhooks"
          title="Webhook Control"
          subtitle="Pantau request real-time webhook TradingView Pine Script dan status pemetaan event."
          labelColor="dark"
        />
        <Button onClick={fetchData} disabled={loading} variant="secondary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Segarkan
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Developer Instructions & URLs */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 bottom-0 bg-[var(--profit)]" />
            <div className="ml-2">
              <SectionLabel label="Pengaturan Koneksi" shape="square" color="dark" className="mb-6" />

              <div className="space-y-5">
                {/* Webhook Endpoint Destination */}
                <div>
                  <label className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest block mb-2">URL Webhook</label>
                  <div className="flex bg-[#F0F0F0] border-2 border-[#121212] overflow-hidden p-1 shadow-[2px_2px_0px_0px_#121212]">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="bg-transparent flex-1 text-[12px] outline-none px-2 font-mono font-bold text-[#121212]"
                    />
                    <button
                      onClick={() => copyToClipboard(webhookUrl, 'url')}
                      className="p-2 bg-[#121212] text-white hover:bg-[#1040C0] transition-colors font-extrabold text-[10px] uppercase tracking-wider"
                    >
                      {copiedText === 'url' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Secret Authorization Token */}
                <div>
                  <label className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest block mb-2">Secret Token Webhook</label>
                  <div className="flex bg-[#F0F0F0] border-2 border-[#121212] overflow-hidden p-1 shadow-[2px_2px_0px_0px_#121212]">
                    <input
                      type="text"
                      readOnly
                      value={settings?.secretToken}
                      className="bg-transparent flex-1 text-[12px] outline-none px-2 font-mono font-bold text-[#121212]"
                    />
                    <button
                      onClick={() => copyToClipboard(settings?.secretToken, 'token')}
                      className="p-2 bg-[#121212] text-white hover:bg-[#1040C0] transition-colors font-extrabold text-[10px] uppercase tracking-wider"
                    >
                      {copiedText === 'token' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[10px] font-bold text-[#717182] flex items-start space-x-1.5 mt-3 leading-tight">
                    <Lock className="w-3 h-3 text-[#121212] shrink-0 mt-0.5" />
                    <span>Masukkan token ini ke kolom JSON payload "secret" di TradingView Pine Script Anda.</span>
                  </p>
                </div>
              </div>

              {/* Mini visual summary audit counts */}
              {summary && (
                <div className="mt-8 pt-6 border-t-2 border-dashed border-[#121212] grid grid-cols-3 gap-3 text-center">
                  <div className="bg-[var(--profit-dim)] border-2 border-[var(--profit)] py-3 px-2 shadow-[2px_2px_0px_0px_var(--profit)]">
                    <span className="text-[9px] font-extrabold text-[var(--profit)] block uppercase tracking-widest">Sukses</span>
                    <span className="font-black text-[20px] text-[var(--profit)]">{summary.summaryCounts.success}</span>
                  </div>
                  <div className="bg-[var(--warning-dim)] border-2 border-[var(--warning)] py-3 px-2 shadow-[2px_2px_0px_0px_var(--warning)]">
                    <span className="text-[9px] font-extrabold text-[var(--warning)] block uppercase tracking-widest">Orphan</span>
                    <span className="font-black text-[20px] text-[var(--warning)]">{summary.summaryCounts.orphan}</span>
                  </div>
                  <div className="bg-[var(--loss-dim)] border-2 border-[var(--loss)] py-3 px-2 shadow-[2px_2px_0px_0px_var(--loss)]">
                    <span className="text-[9px] font-extrabold text-[var(--loss)] block uppercase tracking-widest">Error</span>
                    <span className="font-black text-[20px] text-[var(--loss)]">{summary.summaryCounts.error}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Webhook Active Trade Lists */}
          <div className="bg-white border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
            <SectionLabel label={`Trade Webhook Berjalan (${summary?.openTrades.length || 0})`} shape="circle" color="blue" className="mb-6" />
            
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
              {!summary || summary.openTrades.length === 0 ? (
                <div className="py-8 text-center bg-[#F0F0F0] border-2 border-dashed border-[#121212]">
                  <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wide">Tidak ada trade open.</p>
                </div>
              ) : (
                summary.openTrades.map((t) => (
                  <div key={t.id} className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#121212] transition-all group">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-black text-[14px] text-[#121212] uppercase tracking-wide">{t.symbol}</span>
                      <Badge variant={t.side === 'SELL' ? 'loss' : 'profit'} className="animate-pulse">{t.side}</Badge>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-[#717182] mb-1">
                      <span>Harga Masuk: <span className="text-[#121212] font-number">{t.entryPrice.toLocaleString()}</span></span>
                      <span>TF: <span className="text-[#121212]">{t.timeframe}</span></span>
                    </div>
                    <div className="text-[10px] font-bold text-[#717182] flex justify-between border-t border-dashed border-[#121212]/30 pt-2 mt-2">
                      <span>{formatDate(t.entryTime)}</span>
                      <span className="truncate max-w-[120px]" title={t.entrySignal}>{t.entrySignal}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Pine Script Template & Event Audit Logs */}
        <div className="lg:col-span-2 space-y-8">
          {/* Pine Script Template */}
          <div className="bg-[#121212] border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212]">
            <div className="flex justify-between items-center mb-6">
              <SectionLabel label="Contoh Pine Script v5" shape="diamond" color="blue" inverse />
              <Button
                variant="secondary"
                onClick={() => copyToClipboard(pineScriptCode, 'pine')}
              >
                <Copy className="w-4 h-4 mr-1.5" />
                {copiedText === 'pine' ? 'Copied!' : 'Copy Kode'}
              </Button>
            </div>
            <pre className="bg-[#1e1e1e] p-5 border-2 border-[#F0F0F0]/10 text-[12px] font-mono font-bold text-[#a0a0a0] overflow-x-auto max-h-[300px] custom-scrollbar shadow-inner leading-relaxed">
              <code className="text-[#dcdcaa]">{pineScriptCode}</code>
            </pre>
          </div>

          {/* Webhook Audit Log Feed */}
          <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212]">
            <div className="p-6 border-b-4 border-[#121212] bg-[#F0F0F0] flex justify-between items-center">
              <SectionLabel label="Log Aktivitas Webhook" shape="square" color="dark" />
              <Badge variant="neutral">100 Request Terakhir</Badge>
            </div>

            <div className="p-6 max-h-[450px] overflow-y-auto custom-scrollbar">
              {events.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-[#121212]">
                  <Clock className="w-10 h-10 text-[#717182] mx-auto mb-3" strokeWidth={1.5} />
                  <p className="text-[13px] font-bold text-[#717182] uppercase tracking-wide">Belum ada request webhook yang masuk.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {events.map((e) => {
                    const isSuccess = e.status === 'SUCCESS';
                    const isOrphan = e.status === 'ORPHAN';
                    
                    return (
                      <div 
                        key={e.id} 
                        className={`border-2 p-4 shadow-[4px_4px_0px_0px] transition-all hover:shadow-[6px_6px_0px_0px] ${
                          isSuccess 
                            ? 'bg-[var(--profit-dim)] border-[var(--profit)] shadow-[var(--profit)]' 
                            : isOrphan 
                            ? 'bg-[var(--warning-dim)] border-[var(--warning)] shadow-[var(--warning)]' 
                            : 'bg-[var(--loss-dim)] border-[var(--loss)] shadow-[var(--loss)]'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                          <div className="flex items-center space-x-3">
                            <span className={`px-2 py-1 border-2 font-extrabold uppercase tracking-widest text-[10px] ${
                              isSuccess 
                                ? 'bg-[var(--profit)] text-white border-[var(--profit)]' 
                                : isOrphan 
                                ? 'bg-[var(--warning)] text-[#121212] border-[var(--warning)]' 
                                : 'bg-[var(--loss)] text-white border-[var(--loss)]'
                            }`}>
                              {e.status}
                            </span>
                            <span className="font-black text-[13px] text-[#121212] uppercase tracking-wide">
                              {e.eventType} <span className="text-[#717182] ml-1">({e.tradeId})</span>
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-[#717182] uppercase tracking-wider bg-white px-2 py-1 border border-[#121212]">
                            {formatDate(e.receivedAt)}
                          </span>
                        </div>

                        {!isSuccess && e.errorMessage && (
                          <div className="mb-3 p-2 bg-white border border-[var(--loss)] flex items-start space-x-2 text-[var(--loss)]">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2.5} />
                            <span className="text-[11px] font-extrabold uppercase tracking-wider">{e.errorMessage}</span>
                          </div>
                        )}

                        <details className="group">
                          <summary className="cursor-pointer text-[#121212] font-extrabold text-[11px] uppercase tracking-widest hover:text-[#1040C0] transition outline-none select-none flex items-center">
                            <span className="group-open:hidden">+ Tampilkan Raw Payload JSON</span>
                            <span className="hidden group-open:inline">- Sembunyikan Raw Payload JSON</span>
                          </summary>
                          <div className="mt-2 p-3 bg-[#121212] border-2 border-[#121212] overflow-x-auto text-[#0ecb81] font-mono text-[11px] font-bold leading-normal shadow-inner">
                            <pre>{JSON.stringify(JSON.parse(e.rawPayload), null, 2)}</pre>
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
