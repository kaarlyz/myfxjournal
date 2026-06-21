import React, { useEffect, useState } from 'react';
import { useJournalStore } from '../store/useJournalStore';
import { Link2, Code, ShieldCheck, CheckCircle2, AlertCircle, RefreshCcw, MessageCircle, Phone, Bell, Terminal, Activity } from 'lucide-react';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';

export default function Integrations() {
  const { fetchSettings } = useJournalStore();
  const [activeTab, setActiveTab] = useState<'MT5' | 'TRADINGVIEW' | 'TELEGRAM' | 'WHATSAPP' | 'ALERTS' | 'COMMAND' | 'DIAGNOSTICS' | 'HEALTH'>('MT5');
  const [mt5Status, setMt5Status] = useState({ connected: false, lastSyncTime: null });
  const [telegramStatus, setTelegramStatus] = useState<any>({ configured: false });
  const [whatsappStatus, setWhatsappStatus] = useState({ configured: false });
  const [commandLogs, setCommandLogs] = useState<any[]>([]);
  const [integrationLogs, setIntegrationLogs] = useState<any[]>([]);
  const [tradingViewEvents, setTradingViewEvents] = useState<any[]>([]);
  const [tradingViewStatus, setTradingViewStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [secretToken, setSecretToken] = useState('...');
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  
  const [telegramConfig, setTelegramConfig] = useState({
    enabled: false,
    botToken: '',
    chatIds: ''
  });
  
  const [whatsappConfig, setWhatsappConfig] = useState({
    enabled: false,
    provider: 'BAILEYS',
    cloudToken: '',
    cloudPhoneId: '',
    baileysSession: '',
    allowedNumbers: '',
    selfCommandsEnabled: true
  });
  
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pollOnceResult, setPollOnceResult] = useState<any>(null);
  const [pollOnceLoading, setPollOnceLoading] = useState(false);
  const [telegramDebug, setTelegramDebug] = useState<any>(null);
  const [whatsappDebug, setWhatsappDebug] = useState<any>(null);
  const [pollingLoading, setPollingLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState<number | null>(null);
  const [qrRefreshing, setQrRefreshing] = useState(false);

  const API_BASE_URL = (import.meta as any).env.VITE_API_URL || '/api';

  const checkStatus = async () => {
    setLoading(true);
    try {
      const settingsRes = await fetch(`${API_BASE_URL}/settings/private`);
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setSecretToken(settings.secretToken || 'Not set');
        
        // MT5
        const mt5Res = await fetch(`${API_BASE_URL}/integrations/mt5/status`, {
          headers: { 'Authorization': `Bearer ${settings.secretToken}` }
        });
        if (mt5Res.ok) setMt5Status(await mt5Res.json());
        
        // Telegram
        const tgRes = await fetch(`${API_BASE_URL}/integrations/telegram/status`);
        if (tgRes.ok) setTelegramStatus(await tgRes.json());

        // WhatsApp
        const waRes = await fetch(`${API_BASE_URL}/integrations/whatsapp/status`);
        if (waRes.ok) setWhatsappStatus(await waRes.json());
        const waDebugRes = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/debug`);
        if (waDebugRes.ok) setWhatsappDebug(await waDebugRes.json());

        const tvRes = await fetch(`${API_BASE_URL}/integrations/tradingview/events`);
        if (tvRes.ok) {
          const tvData = await tvRes.json();
          setTradingViewEvents(tvData.events || []);
        }
        const tvStatusRes = await fetch(`${API_BASE_URL}/integrations/tradingview/status`);
        if (tvStatusRes.ok) setTradingViewStatus(await tvStatusRes.json());
      }
        // Integration Settings (Telegram & WhatsApp configs)
        const intRes = await fetch(`${API_BASE_URL}/integrations/settings/private`);
        if (intRes.ok) {
          const intSettings = await intRes.json();
          setTelegramConfig(intSettings.telegram);
          setWhatsappConfig(intSettings.whatsapp);
        }

        // Command logs
        const cmdRes = await fetch(`${API_BASE_URL}/events/commands`);
        if (cmdRes.ok) {
          setCommandLogs(await cmdRes.json());
        }

        // Integration logs
        const logsRes = await fetch(`${API_BASE_URL}/integrations/logs`);
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setIntegrationLogs(logsData.logs || []);
        }
        
        // Telegram Debug status
        const tgDebugRes = await fetch(`${API_BASE_URL}/integrations/telegram/debug`);
        if (tgDebugRes.ok) {
          const debugStatus = await tgDebugRes.json();
          setTelegramStatus((prev: any) => ({ ...prev, debug: debugStatus }));
          setTelegramDebug(debugStatus);
        }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTelegram = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/integrations/settings/private`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram: telegramConfig })
      });
      alert('Telegram settings saved!');
      checkStatus();
    } catch (error) {
      console.error('Failed to save Telegram settings', error);
      alert('Failed to save Telegram settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWhatsapp = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/integrations/settings/private`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: whatsappConfig })
      });
      alert('WhatsApp settings saved!');
      checkStatus();
    } catch (error) {
      console.error('Failed to save WhatsApp settings', error);
      alert('Failed to save WhatsApp settings');
    } finally {
      setSaving(false);
    }
  };

  const requestBaileysQr = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/qr`);
      const data = await res.json();
      if (data.qr) {
        setQrCode(data.qr);
        setQrCountdown(50);
      } else {
        alert(data.message || 'Already connected or waiting.');
      }
      checkStatus();
    } catch (error) {
      console.error(error);
      alert('Failed to request QR code');
    } finally {
      setLoading(false);
    }
  };

  const requestPairingCode = async () => {
    if (!pairingPhone) {
      alert('Please enter a phone number first');
      return;
    }
    setPairingLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/request-pairing-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: pairingPhone.replace(/[^0-9]/g, '') })
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to request pairing code');
      } else {
        alert(data.instructions || 'Code requested successfully');
      }
      checkStatus();
    } catch (error) {
      console.error(error);
      alert('Failed to request pairing code');
    } finally {
      setPairingLoading(false);
    }
  };

  const runPollOnce = async () => {
    setPollOnceLoading(true);
    setPollOnceResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/telegram/poll-once`, { method: 'POST' });
      const data = await res.json();
      setPollOnceResult(data);
      if (data.processed > 0) checkStatus(); // refresh command logs
    } catch (err: any) {
      setPollOnceResult({ ok: false, error: err.message });
    } finally {
      setPollOnceLoading(false);
    }
  };

  const startPolling = async () => {
    setPollingLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/telegram/start-polling`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to start polling');
      } else {
        alert(data.message || 'Long polling started. Telegram commands will now be processed automatically.');
      }
      await checkStatus();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPollingLoading(false);
    }
  };

  const stopPolling = async () => {
    setPollingLoading(true);
    try {
      await fetch(`${API_BASE_URL}/integrations/telegram/stop-polling`, { method: 'POST' });
      await checkStatus();
    } finally {
      setPollingLoading(false);
    }
  };

  const reconnectWhatsapp = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/reconnect`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.error);
      await checkStatus();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshWhatsappDebug = async () => {
    const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/debug`);
    if (res.ok) setWhatsappDebug(await res.json());
  };

  const simulateWhatsappCommand = async (text: string) => {
    const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/simulate-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, fromMe: true }),
    });
    const data = await res.json();
    if (!data.ok) alert(data.error || 'Simulation failed');
    else {
      setWhatsappDebug({ ok: true, ...data.debug });
      alert(`Simulated "${text}". Response: ${data.response || data.debug?.lastCommandResponse || 'None'}`);
      checkStatus();
    }
  };

  const setWhatsappSelfMode = async (enabled: boolean) => {
    const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/self-command-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    if (!data.ok) alert(data.error || 'Failed to update self command mode');
    else {
      setWhatsappDebug({ ok: true, ...data.debug });
      alert(enabled ? 'Self Commands enabled.' : 'Self Commands disabled.');
      await checkStatus();
    }
  };

  const refreshQr = async () => {
    setQrRefreshing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/refresh-qr`, { method: 'POST' });
      const data = await res.json();
      if (data.qr) {
        setQrCode(data.qr);
        setQrCountdown(data.secondsUntilExpiry ?? 50);
      } else {
        alert(data.error || data.message || 'Gagal refresh QR');
      }
      checkStatus();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setQrRefreshing(false);
    }
  };

  // QR countdown ticker
  useEffect(() => {
    if (qrCountdown === null || qrCountdown <= 0) return;
    const t = setTimeout(() => setQrCountdown(c => (c !== null && c > 0 ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [qrCountdown]);

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (!telegramDebug?.pollingRunning) return;
    const timer = window.setInterval(() => {
      checkStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [telegramDebug?.pollingRunning]);

  const tabs = [
    { id: 'MT5', name: 'MT5', icon: Link2 },
    { id: 'TRADINGVIEW', name: 'TradingView', icon: Activity },
    { id: 'TELEGRAM', name: 'Telegram', icon: MessageCircle },
    { id: 'WHATSAPP', name: 'WhatsApp', icon: Phone },
    { id: 'ALERTS', name: 'Alerts', icon: Bell },
    { id: 'COMMAND', name: 'Command Center', icon: Terminal },
    { id: 'DIAGNOSTICS', name: 'Diagnostics', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Integrations & Automations</h1>
          <p className="text-[#929aa5] text-sm">Connect ReplayFX Journal to external trading platforms and messaging apps.</p>
        </div>
        <PageGuide
          title="Integrations & Command Center"
          purpose="Halaman ini menyambungkan MT5, TradingView, Telegram, dan WhatsApp untuk monitoring, import otomatis, dan notifikasi."
          steps={[
            'Pilih tab sesuai integrasi yang ingin dipakai.',
            'MT5 connector mengirim account snapshot dan trade event.',
            'TradingView webhook menerima alert JSON dari Pine Script.',
            'Telegram/WhatsApp bisa dipakai untuk command aman seperti balance/status.',
            'Command Center dipakai untuk audit command dan diagnostics.'
          ]}
          outputs={[
            'Recent Events menunjukkan data yang berhasil diterima.',
            'Diagnostics membantu cek koneksi, token, dan payload.'
          ]}
          warnings={[
            'TradingView tidak bisa mengirim webhook langsung ke localhost. Pakai cloudflared/ngrok atau deploy backend.',
            'Remote trade execution dimatikan. buy/sell/close_all tidak akan dieksekusi demi keamanan.'
          ]}
          nextAction="Mulai dari MT5 jika ingin Live Journal, atau TradingView jika ingin webhook alert."
        />
      </div>

      <HelpCard title="Keamanan remote command" tone="warning">
        Command dari Telegram/WhatsApp hanya untuk monitoring dan pencatatan aman. Perintah trading seperti buy, sell, modify SL/TP, dan close_all diblokir.
      </HelpCard>

      <div className="flex space-x-2 border-b border-[#2b3139] pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isActive ? 'bg-white/10 text-white' : 'text-[#707a8a] hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'MT5' && (
        <div className="bn-card  border border-[#2b3139] rounded-xl overflow-hidden animate-fade-slide-in">
          <div className="p-6 border-b border-[#2b3139] flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00A1E0]/20 to-[#00A1E0]/5 flex items-center justify-center border border-[#00A1E0]/20">
                <span className="font-bold text-[#00A1E0]">MT5</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">MetaTrader 5 Bridge</h2>
                <p className="text-sm text-[#929aa5]">Automatically sync trades from your MT5 terminal using an EA webhook.</p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              {mt5Status.connected ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-[rgba(14,203,129,0.08)] text-[#0ecb81] text-xs font-bold border border-[rgba(14,203,129,0.2)]">
                  <CheckCircle2 className="w-3 h-3 mr-1.5" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-bold border border-yellow-500/20">
                  <AlertCircle className="w-3 h-3 mr-1.5" />
                  Waiting for Events
                </span>
              )}
              <div className="flex space-x-2 mt-2">
                <button onClick={checkStatus} disabled={loading} className="text-xs text-[#929aa5] flex items-center hover:text-white transition px-2 py-1 rounded bg-white/5 border border-[#2b3139]">
                  <RefreshCcw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-white/5 rounded-xl p-4 border border-[#2b3139]">
              <h3 className="text-sm font-bold text-white flex items-center mb-3">
                <ShieldCheck className="w-4 h-4 mr-2 text-[#0ecb81]" />
                Security Information
              </h3>
              <div className="bn-card  p-3 rounded-lg border border-[#2b3139] flex flex-col space-y-2">
                <span className="text-xs text-[#707a8a] font-medium">Your Webhook Secret Token (Requires Private Access)</span>
                <code className="text-[#fcd535] font-mono text-sm">{secretToken}</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'TRADINGVIEW' && (
        <div className="bn-card border border-[#2b3139] rounded-xl overflow-hidden animate-fade-slide-in p-6 space-y-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#fcd535]/20 to-[#fcd535]/5 flex items-center justify-center border border-[#fcd535]/20">
              <Activity className="w-6 h-6 text-[#fcd535]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">TradingView Integration</h2>
              <p className="text-sm text-[#929aa5]">Send Momentum Candle alerts to ReplayFX for review. This does not execute trades directly.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#929aa5] mb-1">Webhook URL</label>
                <div className="flex gap-2">
                  <input readOnly value={`${window.location.origin}${API_BASE_URL}/integrations/tradingview/webhook`} className="flex-1 bg-black border border-[#2b3139] rounded-lg py-2.5 px-3 text-white text-sm font-mono" />
                  <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${API_BASE_URL}/integrations/tradingview/webhook`)} className="px-4 py-2 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-xs font-bold">Copy</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#929aa5] mb-1">Secret Token</label>
                <div className="flex gap-2">
                  <code className="flex-1 bg-black border border-[#2b3139] rounded-lg py-2.5 px-3 text-[#fcd535] text-sm font-mono">{secretToken}</code>
                  <button onClick={() => navigator.clipboard.writeText(secretToken)} className="px-4 py-2 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-xs font-bold">Copy</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#929aa5] mb-1">JSON Alert Template</label>
                <pre className="bg-black border border-[#2b3139] rounded-lg p-4 text-[11px] text-[#eaecef] overflow-auto">{JSON.stringify({
                  secret: secretToken,
                  source: 'tradingview',
                  strategy: 'Momentum Candle',
                  symbol: 'XAUUSD',
                  timeframe: 'M15',
                  side: 'BUY',
                  price: 4317.2,
                  sl: 4310,
                  tp: 4330,
                  bodySize: 7.2,
                  volume: 12800,
                  reason: 'Momentum candle formed',
                  chartUrl: 'optional',
                  alertTime: '{{time}}'
                }, null, 2)}</pre>
                <button onClick={() => navigator.clipboard.writeText(JSON.stringify({
                  secret: secretToken,
                  source: 'tradingview',
                  strategy: 'Momentum Candle',
                  symbol: 'XAUUSD',
                  timeframe: 'M15',
                  side: 'BUY',
                  price: 4317.2,
                  sl: 4310,
                  tp: 4330,
                  bodySize: 7.2,
                  volume: 12800,
                  reason: 'Momentum candle formed',
                  chartUrl: 'optional',
                  alertTime: '{{time}}'
                }, null, 2))} className="mt-2 px-4 py-2 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-xs font-bold">Copy JSON Template</button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    const res = await fetch(`${API_BASE_URL}/integrations/tradingview/test-event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                    const data = await res.json();
                    alert(data.ok ? 'Test TradingView setup received.' : data.error);
                    checkStatus();
                  }}
                  className="px-4 py-2 bg-[#fcd535] hover:bg-[#f0b90b] text-black rounded-lg text-xs font-bold"
                >
                  Send Test Event
                </button>
                <button onClick={() => window.location.assign('/setup-review')} className="px-4 py-2 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-xs font-bold">
                  Open TradingView Review Queue
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3"><span className="text-[#707a8a] block">Status</span><span className="text-white font-bold">{tradingViewStatus?.configured ? 'Configured' : 'Missing secret'}</span></div>
                <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3"><span className="text-[#707a8a] block">Last Event</span><span className="text-white font-bold">{tradingViewEvents[0] ? `${tradingViewEvents[0].symbol} ${tradingViewEvents[0].status}` : 'None'}</span></div>
                <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3"><span className="text-[#707a8a] block">Last Error</span><span className="text-[#f6465d] font-bold">{integrationLogs.find((l: any) => l.source === 'TRADINGVIEW' && l.status === 'ERROR')?.message || 'None'}</span></div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4">
                <h3 className="font-bold text-white text-sm mb-3">Setup Guide</h3>
                <ol className="text-xs text-[#929aa5] space-y-2 list-decimal list-inside">
                  <li>Open TradingView Alert.</li>
                  <li>Enable Webhook URL.</li>
                  <li>Paste ReplayFX webhook URL.</li>
                  <li>Paste the JSON alert message.</li>
                  <li>Trigger alert.</li>
                  <li>ReplayFX receives event and sends review commands.</li>
                </ol>
              </div>

              <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4">
                <h3 className="font-bold text-white text-sm mb-3">Recent TradingView Alerts</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {tradingViewEvents.length === 0 ? (
                    <p className="text-xs text-[#707a8a]">No TradingView alerts yet.</p>
                  ) : tradingViewEvents.map((event: any) => (
                    <div key={event.id} className="border border-[#2b3139] rounded-lg p-3 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-bold text-white">{event.symbol} {event.timeframe}</span>
                        <span className="text-[#fcd535]">{event.status}</span>
                      </div>
                      <p className="text-[#929aa5] mt-1">{event.side} @ {event.price}</p>
                      <p className="text-[#707a8a] mt-1">{new Date(event.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'TELEGRAM' && (
        <div className="bn-card  border border-[#2b3139] rounded-xl overflow-hidden animate-fade-slide-in p-6 space-y-6">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#229ED9]/20 to-[#229ED9]/5 flex items-center justify-center border border-[#229ED9]/20">
              <MessageCircle className="w-6 h-6 text-[#229ED9]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Telegram Bot</h2>
              <p className="text-sm text-[#929aa5]">Receive trade alerts and check account status via Telegram commands.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4 max-w-2xl">
              <div className="flex items-center space-x-3 mb-6 bg-white/5 p-4 rounded-xl border border-[#2b3139]">
                <input 
                  type="checkbox" 
                  checked={telegramConfig.enabled}
                  onChange={(e) => setTelegramConfig({...telegramConfig, enabled: e.target.checked})}
                  className="w-5 h-5 rounded border-[#2b3139] bn-card  accent-[#fcd535]"
                />
                <div>
                  <h3 className="text-white font-bold text-sm">Enable Telegram Bot</h3>
                  <p className="text-xs text-[#929aa5]">Turn on to activate the bot.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#929aa5] mb-1">Bot Token (from @BotFather)</label>
                <input
                  type="password"
                  value={telegramConfig.botToken}
                  onChange={(e) => setTelegramConfig({...telegramConfig, botToken: e.target.value})}
                  placeholder="1234567890:AAH_..."
                  className="w-full bg-black border border-[#2b3139] rounded-lg py-2.5 px-3 text-white focus:border-[#229ED9] outline-none text-sm"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-[#929aa5] mb-1">Allowed Chat IDs (comma separated)</label>
                <input
                  type="text"
                  value={telegramConfig.chatIds}
                  onChange={(e) => setTelegramConfig({...telegramConfig, chatIds: e.target.value})}
                  placeholder="-100123456, 9876543"
                  className="w-full bg-black border border-[#2b3139] rounded-lg py-2.5 px-3 text-white focus:border-[#229ED9] outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#929aa5] mb-1">Webhook Secret</label>
                <code className="block w-full bg-black border border-[#2b3139] rounded-lg py-2.5 px-3 text-[#fcd535] font-mono text-sm">
                  {secretToken}
                </code>
                <p className="text-[10px] text-[#707a8a] mt-1">Random secret in the webhook URL so random users cannot hit your webhook endpoint.</p>
              </div>

              <div className="pt-4 border-t border-[#2b3139] flex items-center justify-between">
                <button 
                  onClick={async () => {
                    const url = prompt("Enter your backend public URL (e.g., https://your-domain.com):");
                    if (url) {
                      const res = await fetch(`${API_BASE_URL}/integrations/telegram/set-webhook`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                      });
                      const data = await res.json();
                      alert(data.message || data.error);
                      checkStatus();
                    }
                  }}
                  className="px-4 py-2 bg-[rgba(252,213,53,0.12)] hover:bg-[rgba(252,213,53,0.18)] text-[#fcd535] rounded-lg text-xs font-bold transition mr-2"
                >
                  Set Webhook
                </button>
                <div className="flex space-x-2">
                  <button 
                    onClick={async () => {
                      const res = await fetch(`${API_BASE_URL}/integrations/telegram/send-test`, { method: 'POST' });
                      const text = await res.text();
                      alert(text);
                    }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition text-sm"
                  >
                    Test Message
                  </button>
                  <button 
                    onClick={handleSaveTelegram} 
                    disabled={saving}
                    className="px-6 py-2 bg-[#229ED9] hover:bg-[#229ED9]/80 text-white font-bold rounded-lg transition text-sm flex items-center"
                  >
                    {saving ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save Configuration
                  </button>
                </div>
              </div>

              {/* Local Bot Mode */}
              <div className="pt-4 border-t border-[#2b3139]">
                <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Local Bot Mode <span className="text-[10px] font-normal text-[#707a8a] ml-1">Long Polling</span></h3>
                      <p className="text-[10px] text-[#707a8a] mt-1">Running locally? Use Start Polling. Telegram cannot send webhooks to localhost.</p>
                      <p className="text-[10px] text-[#707a8a] mt-1">Production mode: use Set Webhook only when your backend has a public URL, such as Render, Railway, ngrok, or Cloudflare Tunnel.</p>
                      <p className="text-[10px] text-[#707a8a] mt-1">Debug mode: Poll Once manually checks Telegram for new commands one time.</p>
                    </div>
                    <div className="flex space-x-2 ml-4 shrink-0">
                      <button onClick={checkStatus} disabled={loading} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[#eaecef] rounded-lg text-[10px] font-bold transition flex items-center">
                        <RefreshCcw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
                      </button>
                    </div>
                  </div>

                  {/* Start/Stop Polling */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {telegramDebug?.pollingRunning ? (
                      <button onClick={stopPolling} disabled={pollingLoading} className="px-4 py-1.5 bg-[rgba(246,70,93,0.12)] hover:bg-[rgba(246,70,93,0.2)] text-[#f6465d] rounded-lg text-xs font-bold transition flex items-center">
                        {pollingLoading ? <RefreshCcw className="w-3 h-3 animate-spin mr-1.5" /> : <span className="w-2 h-2 rounded-sm bg-[#f6465d] mr-1.5 inline-block" />}
                        Stop Polling
                      </button>
                    ) : (
                      <button onClick={startPolling} disabled={pollingLoading} className="px-4 py-1.5 bg-[rgba(14,203,129,0.12)] hover:bg-[rgba(14,203,129,0.2)] text-[#0ecb81] rounded-lg text-xs font-bold transition flex items-center">
                        {pollingLoading ? <RefreshCcw className="w-3 h-3 animate-spin mr-1.5" /> : <span className="w-2 h-2 rounded-full bg-[#0ecb81] mr-1.5 inline-block" />}
                        Start Polling
                      </button>
                    )}
                    {telegramDebug?.pollingRunning && (
                      <button disabled className="px-4 py-1.5 bg-[rgba(14,203,129,0.16)] text-[#0ecb81] rounded-lg text-xs font-bold transition flex items-center cursor-default">
                        <span className="w-2 h-2 rounded-full bg-[#0ecb81] mr-1.5 inline-block animate-pulse" />
                        Polling Active
                      </button>
                    )}
                    <button onClick={runPollOnce} disabled={pollOnceLoading} className="px-4 py-1.5 bg-[#229ED9] hover:bg-[#229ED9]/80 text-white rounded-lg text-xs font-bold transition flex items-center">
                      {pollOnceLoading ? <RefreshCcw className="w-3 h-3 animate-spin mr-1.5" /> : <Terminal className="w-3 h-3 mr-1.5" />}
                      Poll Once
                    </button>
                    {telegramDebug?.pollingRunning && (
                      <span className="text-[10px] text-[#0ecb81] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0ecb81] animate-pulse inline-block" />
                        Running{telegramDebug.pollingStartedAt ? ` since ${new Date(telegramDebug.pollingStartedAt).toLocaleTimeString()}` : ''}
                      </span>
                    )}
                  </div>

                  {pollOnceResult && (
                    <div className={`rounded-lg px-3 py-2 text-xs font-mono border ${pollOnceResult.ok ? 'bg-winGreen/5 border-[rgba(14,203,129,0.2)] text-[#0ecb81]' : 'bg-[rgba(246,70,93,0.08)] border-[rgba(246,70,93,0.2)] text-[#f6465d]'}`}>
                      {pollOnceResult.ok
                        ? <>✓ updates: <strong>{pollOnceResult.updatesFound}</strong> &nbsp;|&nbsp; processed: <strong>{pollOnceResult.processed}</strong> &nbsp;|&nbsp; lastUpdateId: <strong>{pollOnceResult.lastUpdateId}</strong></>
                        : <>✗ {pollOnceResult.error}</>
                      }
                    </div>
                  )}

                  {telegramDebug && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                      {[
                        { label: 'Configured', value: telegramDebug.configured ? 'Yes' : 'No', ok: telegramDebug.configured },
                        { label: 'Bot Token', value: telegramDebug.botTokenPresent ? 'Present' : 'Missing', ok: telegramDebug.botTokenPresent },
                        { label: 'Allowed Chat IDs', value: `${telegramDebug.allowedChatIdsCount} configured`, ok: telegramDebug.allowedChatIdsCount > 0 },
                        { label: 'Polling Running', value: telegramDebug.pollingRunning ? 'True' : 'False', ok: telegramDebug.pollingRunning },
                        { label: 'Last Poll Time', value: telegramDebug.lastPollAt ? new Date(telegramDebug.lastPollAt).toLocaleTimeString() : 'Never', ok: !!telegramDebug.lastPollAt },
                        { label: 'Last Command', value: telegramDebug.lastCommand ? `${telegramDebug.lastCommand}${telegramDebug.lastCommandStatus ? ` (${telegramDebug.lastCommandStatus})` : ''}` : 'Never', ok: !!telegramDebug.lastCommand },
                        { label: 'Last Error', value: telegramDebug.lastError || 'None', ok: !telegramDebug.lastError },
                        { label: 'Last Update ID', value: telegramDebug.lastUpdateId ? String(telegramDebug.lastUpdateId) : 'None', ok: !!telegramDebug.lastUpdateId },
                      ].map(item => (
                        <div key={item.label} className="bn-card  border border-[#2b3139] rounded p-2">
                          <div className="text-[#707a8a] mb-0.5">{item.label}</div>
                          <div className={item.ok ? 'text-[#0ecb81] font-bold' : 'text-yellow-400 font-bold truncate'} title={item.value}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-black/30 border border-[#2b3139] rounded-lg p-3">
                    <p className="text-[10px] font-bold text-white mb-2">Local setup steps</p>
                    <ol className="text-[10px] text-[#929aa5] space-y-1 list-decimal list-inside">
                      <li>Save Configuration.</li>
                      <li>Click Test Message to confirm backend can send messages.</li>
                      <li>Click Start Polling.</li>
                      <li>Send <code className="text-white">/balance</code> or <code className="text-white">/status</code> to the bot.</li>
                      <li>The bot should reply automatically.</li>
                      <li>Use Stop Polling when done.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-[#2b3139] rounded-xl p-5 text-sm h-fit">
              <h3 className="font-bold text-white mb-3 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2 text-[#229ED9]" />
                How to setup
              </h3>
              <p className="text-xs text-[#929aa5] mt-2">
                Start by opening Telegram and searching for <code className="text-white">@userinfobot</code> to find your Chat ID.
                Then talk to <code className="text-white">@BotFather</code> to create a new bot and get the Token.
              </p>
              <div className="mt-4 space-y-3 text-xs">
                <div className="bg-[rgba(14,203,129,0.08)] border border-[rgba(14,203,129,0.2)] rounded-lg p-3">
                  <p className="font-bold text-[#0ecb81]">Local mode</p>
                  <p className="text-[#929aa5] mt-1">Running locally? Use Start Polling. Telegram cannot send webhooks to localhost.</p>
                </div>
                <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3">
                  <p className="font-bold text-white">Production mode</p>
                  <p className="text-[#929aa5] mt-1">Use Set Webhook only when your backend has a public URL, such as Render, Railway, ngrok, or Cloudflare Tunnel.</p>
                </div>
                <div className="bg-white/5 border border-[#2b3139] rounded-lg p-3">
                  <p className="font-bold text-white">Debug mode</p>
                  <p className="text-[#929aa5] mt-1">Poll Once manually checks Telegram for new commands one time.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'WHATSAPP' && (
        <div className="bn-card  border border-[#2b3139] rounded-xl overflow-hidden animate-fade-slide-in p-6 space-y-6">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#25D366]/20 to-[#25D366]/5 flex items-center justify-center border border-[#25D366]/20">
              <Phone className="w-6 h-6 text-[#25D366]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">WhatsApp</h2>
              <p className="text-sm text-[#929aa5]">Receive read-only ReplayFX commands through Baileys or Cloud API.</p>
            </div>
          </div>

          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center space-x-3 mb-4 bg-white/5 p-4 rounded-xl border border-[#2b3139]">
              <input 
                type="checkbox" 
                checked={whatsappConfig.enabled}
                onChange={(e) => setWhatsappConfig({...whatsappConfig, enabled: e.target.checked})}
                className="w-5 h-5 rounded border-[#2b3139] bn-card  accent-[#25D366]"
              />
              <div>
                <h3 className="text-white font-bold text-sm">Enable WhatsApp Integration</h3>
                <p className="text-xs text-[#929aa5]">Turn on to activate WhatsApp.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#929aa5] mb-1">Provider</label>
              <select
                value={whatsappConfig.provider}
                onChange={(e) => setWhatsappConfig({...whatsappConfig, provider: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2.5 px-3 text-white focus:border-[#25D366] outline-none text-sm appearance-none"
              >
                <option value="BAILEYS">Baileys (Personal Web WhatsApp - Recommended)</option>
                <option value="CLOUD_API">Meta Cloud API (Official Business)</option>
              </select>
            </div>

            {whatsappConfig.provider === 'CLOUD_API' ? (
              <div className="space-y-4 mt-4 p-4 bg-white/5 border border-[#2b3139] rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-[#929aa5] mb-1">Cloud API Token</label>
                  <input
                    type="password"
                    value={whatsappConfig.cloudToken}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, cloudToken: e.target.value})}
                    placeholder="EAAB..."
                    className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#25D366] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#929aa5] mb-1">Phone Number ID</label>
                  <input
                    type="text"
                    value={whatsappConfig.cloudPhoneId}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, cloudPhoneId: e.target.value})}
                    placeholder="123456789"
                    className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#25D366] outline-none text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 mt-4 p-5 bg-white/5 border border-[#2b3139] rounded-xl">
                <div className="text-sm text-[#eaecef] mb-2 border-b border-[#2b3139] pb-4">
                  <h3 className="font-bold text-white mb-2">Connect via Baileys (Personal WhatsApp)</h3>
                  <p className="text-xs text-[#929aa5] mb-4">You can connect your WhatsApp by scanning a QR code or using a Pairing Code.</p>
                  
                  {(whatsappStatus as any).baileys?.connected ? (
                    <div className="flex flex-col space-y-4">
                      <div className="flex items-center space-x-3 bg-[rgba(14,203,129,0.08)] border border-[rgba(14,203,129,0.2)] p-4 rounded-lg">
                        <CheckCircle2 className="w-8 h-8 text-[#0ecb81]" />
                        <div>
                          <span className="font-bold text-[#0ecb81] text-lg block">WhatsApp Connected</span>
                          <span className="text-sm text-[#0ecb81]/70">
                            Connected as {(whatsappStatus as any).baileys?.phoneNumber || 'Unknown'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="bn-card  p-4 rounded-xl border border-[#2b3139] space-y-2 text-left">
                        <p className="text-xs text-[#929aa5]"><strong>Status:</strong> {(whatsappStatus as any).baileys?.status || 'Unknown'}</p>
                        <p className="text-xs text-[#929aa5]"><strong>Push Name:</strong> {(whatsappStatus as any).baileys?.pushName || 'N/A'}</p>
                        <p className="text-xs text-[#929aa5]"><strong>Last Connected At:</strong> {(whatsappStatus as any).baileys?.lastConnectedAt ? new Date((whatsappStatus as any).baileys.lastConnectedAt).toLocaleString() : 'N/A'}</p>
                        {(whatsappStatus as any).baileys?.lastError && (
                          <p className="text-xs text-[#f6465d]"><strong>Last Error:</strong> {(whatsappStatus as any).baileys.lastError}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={checkStatus} 
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition flex items-center"
                        >
                          <RefreshCcw className="w-4 h-4 mr-2" />
                          Refresh Status
                        </button>
                        <button 
                          onClick={async () => {
                            const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/send-self-test`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({}) });
                            const data = await res.json();
                            alert(data.message || data.error);
                          }}
                          className="px-4 py-2 bg-[rgba(252,213,53,0.12)] hover:bg-[rgba(252,213,53,0.18)] text-[#fcd535] rounded-lg text-xs font-bold transition"
                        >
                          Send Test to Connected WhatsApp
                        </button>
                        <button 
                          onClick={async () => {
                            const to = prompt("Enter phone number to send test to (e.g. 6281234567890):");
                            if (to) {
                              const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/send-test`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ to, message: '✅ ReplayFX WhatsApp integration is connected and working.' }) });
                              const data = await res.json();
                              alert(data.message || data.error);
                            }
                          }}
                          className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-500 rounded-lg text-xs font-bold transition"
                        >
                          Send Test to Custom Number
                        </button>
                        <button
                          onClick={() => alert("Manual internal command test:\n1. Open WhatsApp.\n2. Open your own chat / Message yourself.\n3. Send: balance or /balance.\n4. ReplayFX should reply with account balance.\n\nIf it does not reply, check Last Incoming Command and Last Error below.")}
                          className="px-4 py-2 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg text-xs font-bold transition"
                        >
                          Send Internal Test Command
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm("Are you sure you want to logout? You will need to scan QR or use Pairing Code again.")) {
                              const res = await fetch(`${API_BASE_URL}/integrations/whatsapp/baileys/logout`, { method: 'POST' });
                              const data = await res.json();
                              alert(data.message || data.error);
                              checkStatus();
                            }
                          }}
                          className="px-4 py-2 bg-[rgba(246,70,93,0.12)] hover:bg-lossRed/30 text-[#f6465d] rounded-lg text-xs font-bold transition"
                        >
                          Logout / Reset Session
                        </button>
                      </div>
                      <div className="bn-card border border-[#2b3139] rounded-xl p-4 text-left space-y-2">
                        <h4 className="text-sm font-bold text-white">WhatsApp Commands</h4>
                        <p className="text-xs text-[#929aa5]">Connected as {(whatsappStatus as any).baileys?.phoneNumber || 'Unknown'} / {(whatsappStatus as any).baileys?.pushName || 'No name'}</p>
                        <p className="text-xs text-[#929aa5]">Self command mode: <span className="text-[#0ecb81] font-bold">Enabled by default for local use</span></p>
                        <p className="text-xs text-[#929aa5]">Allowed numbers: {whatsappConfig.allowedNumbers || 'Not configured. External numbers may be rejected.'}</p>
                        <ol className="text-xs text-[#929aa5] list-decimal list-inside space-y-1">
                          <li>Open WhatsApp.</li>
                          <li>Send <code className="text-white">balance</code> or <code className="text-white">/balance</code> to your own chat or from an allowed number.</li>
                          <li>ReplayFX should reply automatically.</li>
                          <li>Try <code className="text-white">buy</code>; it must reply: Remote trading execution is disabled.</li>
                        </ol>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 text-[10px]">
                          <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Last incoming</span><span className="text-white">{(whatsappStatus as any).baileys?.lastIncomingCommand || 'None'}</span></div>
                          <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Last response</span><span className="text-white">{(whatsappStatus as any).baileys?.lastResponse || 'None'}</span></div>
                          <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Last error</span><span className="text-[#f6465d]">{(whatsappStatus as any).baileys?.lastCommandError || (whatsappStatus as any).baileys?.lastError || 'None'}</span></div>
                        </div>
                        <button onClick={() => setActiveTab('COMMAND')} className="text-xs text-[#fcd535] font-bold hover:text-white">Open Command Center</button>
                      </div>
                    </div>
                  ) : (whatsappStatus as any).baileys?.authenticatedSessionExists ? (
                    <div className="rounded-xl border border-[#2b3139] bg-white/5 p-4 space-y-3">
                      <h4 className="text-white font-bold">Existing WhatsApp session found</h4>
                      <p className="text-xs text-[#929aa5]">A Baileys auth session exists locally, but the socket is not connected. You do not need to scan QR yet.</p>
                      <button onClick={reconnectWhatsapp} disabled={loading} className="px-4 py-2 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg text-xs font-bold flex items-center">
                        {loading && <RefreshCcw className="w-3 h-3 animate-spin mr-1.5" />}
                        Reconnect Existing Session
                      </button>
                      {(whatsappStatus as any).baileys?.lastError && <p className="text-xs text-[#f6465d]">{(whatsappStatus as any).baileys.lastError}</p>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Option 1: QR Code */}
                      <div className="bn-card  p-4 rounded-xl border border-[#2b3139] flex flex-col items-center text-center">
                        <h4 className="font-bold text-white mb-1 text-sm">Option 1: QR Code</h4>
                        <p className="text-xs text-[#707a8a] mb-4">Scan QR with WhatsApp</p>
                        {qrCode ? (
                          <div className="flex flex-col items-center space-y-3">
                            <div className="bg-white p-2 rounded-lg inline-block relative">
                              <img src={qrCode} alt="WhatsApp QR Code" className="w-40 h-40" />
                              {qrCountdown !== null && qrCountdown > 0 && (
                                <div className={`absolute bottom-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${qrCountdown <= 10 ? 'bg-[#f6465d] text-white' : 'bg-black/70 text-white'}`}>
                                  {qrCountdown}s
                                </div>
                              )}
                              {qrCountdown === 0 && (
                                <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                                  <span className="text-xs font-bold text-[#f6465d]">QR Expired</span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={refreshQr}
                              disabled={qrRefreshing}
                              className="px-3 py-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg text-[10px] font-bold transition flex items-center"
                            >
                              {qrRefreshing ? <RefreshCcw className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                              Refresh QR
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={requestBaileysQr} 
                            disabled={loading}
                            className="px-4 py-2 mt-auto bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition flex items-center"
                          >
                            {loading ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <Code className="w-4 h-4 mr-2" />}
                            Generate QR
                          </button>
                        )}
                      </div>

                      {/* Option 2: Pairing Code */}
                      <div className="bn-card  p-4 rounded-xl border border-[#2b3139] flex flex-col items-center text-center">
                        <h4 className="font-bold text-white mb-1 text-sm">Option 2: Pairing Code</h4>
                        <p className="text-xs text-[#707a8a] mb-2">Enter phone to get 8-char code</p>
                        <p className="text-[10px] text-[#707a8a] mb-4">Use country code without +, spaces, brackets, or dashes.</p>
                        
                        {(whatsappStatus as any).baileys?.pairingCode ? (
                          <div className="w-full">
                            <div className="text-2xl font-mono font-bold tracking-widest text-[#25D366] bg-[#25D366]/10 py-3 rounded-lg border border-[#25D366]/20 mb-2">
                              {(whatsappStatus as any).baileys.pairingCode}
                            </div>
                            <div className="text-left bg-white/5 p-3 rounded text-[10px] text-[#eaecef] space-y-1 mb-2">
                              <p className="font-bold">Instructions:</p>
                              <ol className="list-decimal list-inside">
                                <li>Open WhatsApp</li>
                                <li>Tap Linked Devices</li>
                                <li>Tap Link with phone number</li>
                                <li>Enter the pairing code</li>
                              </ol>
                            </div>
                            <p className="text-[10px] text-yellow-500">If pairing code fails, use QR scan instead.</p>
                          </div>
                        ) : (
                          <div className="w-full flex flex-col items-center mt-auto space-y-2">
                            <input 
                              type="text" 
                              value={pairingPhone} 
                              onChange={(e) => setPairingPhone(e.target.value)} 
                              placeholder="e.g. 6281234567890" 
                              className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white text-xs text-center focus:border-[#25D366] outline-none"
                            />
                            <button 
                              onClick={requestPairingCode} 
                              disabled={pairingLoading}
                              className="w-full px-4 py-2 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg text-xs font-bold transition flex items-center justify-center"
                            >
                              {pairingLoading ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <Phone className="w-4 h-4 mr-2" />}
                              Request Pairing Code
                            </button>
                            <p className="text-[9px] text-[#707a8a] mt-2">Add a cooldown if requested multiple times.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {whatsappConfig.provider === 'BAILEYS' && (
              <div className="bg-white/5 border border-[#2b3139] rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Command Debug</h3>
                    <p className="text-xs text-[#929aa5] mt-1">
                      To test self commands, open WhatsApp and message yourself: <code className="text-white">balance</code> or <code className="text-white">/balance</code>. ReplayFX should reply in the same chat. If it does not, check Diagnostics → WhatsApp logs.
                    </p>
                  </div>
                  <button onClick={refreshWhatsappDebug} className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-[10px] font-bold">
                    Refresh WhatsApp Debug
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Connected as</span><span className="text-white">{whatsappDebug?.phoneNumber || (whatsappStatus as any).baileys?.phoneNumber || 'Unknown'} / {whatsappDebug?.pushName || (whatsappStatus as any).baileys?.pushName || 'No name'}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Self command mode</span><span className={(whatsappDebug?.selfCommandModeEnabled ?? whatsappDebug?.selfCommandMode ?? (whatsappStatus as any).baileys?.selfCommandModeEnabled) === false ? 'text-[#f6465d]' : 'text-[#0ecb81]'}>{(whatsappDebug?.selfCommandModeEnabled ?? whatsappDebug?.selfCommandMode ?? (whatsappStatus as any).baileys?.selfCommandModeEnabled) === false ? 'Disabled' : 'Enabled'} {whatsappDebug?.selfCommandModeSource ? `(${whatsappDebug.selfCommandModeSource})` : ''}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Allowed numbers</span><span className="text-white">{(whatsappDebug?.allowedNumbers || []).join(', ') || whatsappConfig.allowedNumbers || 'None configured'}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Last incoming message</span><span className="text-white">{whatsappDebug?.lastIncomingMessage || (whatsappStatus as any).baileys?.lastRawMessageText || 'None'}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Last command</span><span className="text-white">{whatsappDebug?.lastCommandText || (whatsappStatus as any).baileys?.lastIncomingCommand || 'None'}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Last response</span><span className="text-white">{whatsappDebug?.lastCommandResponse || (whatsappStatus as any).baileys?.lastResponse || 'None'}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Last error</span><span className="text-[#f6465d]">{whatsappDebug?.lastCommandError || (whatsappStatus as any).baileys?.lastCommandError || 'None'}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Processed</span><span className="text-white">{whatsappDebug?.processedMessageCount ?? (whatsappStatus as any).baileys?.processedMessageCount ?? 0}</span></div>
                  <div className="bg-black/30 border border-[#2b3139] rounded p-2"><span className="text-[#707a8a] block">Skipped</span><span className="text-white">{whatsappDebug?.skippedMessageCount ?? (whatsappStatus as any).baileys?.skippedMessageCount ?? 0}</span></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setWhatsappSelfMode(true)} className="px-3 py-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg text-xs font-bold">Enable Self Commands</button>
                  <button onClick={() => setWhatsappSelfMode(false)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[#929aa5] rounded-lg text-xs font-bold">Disable Self Commands</button>
                  <button onClick={() => simulateWhatsappCommand('balance')} className="px-3 py-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg text-xs font-bold">Simulate balance command</button>
                  <button onClick={() => simulateWhatsappCommand('buy')} className="px-3 py-1.5 bg-[rgba(246,70,93,0.12)] hover:bg-[rgba(246,70,93,0.2)] text-[#f6465d] rounded-lg text-xs font-bold">Simulate blocked buy command</button>
                  <button onClick={() => setActiveTab('COMMAND')} className="px-3 py-1.5 bg-[#2b3139] hover:bg-[#363e47] text-white rounded-lg text-xs font-bold">Open Command Center</button>
                </div>
                {(whatsappDebug?.selfCommandModeEnabled ?? whatsappDebug?.selfCommandMode ?? (whatsappStatus as any).baileys?.selfCommandModeEnabled) === false && (
                  <div className="rounded-lg border border-[rgba(246,70,93,0.25)] bg-[rgba(246,70,93,0.08)] p-3 text-xs text-[#f6465d]">
                    Message received, but self command mode is disabled. Click Enable Self Commands, then send balance or /balance to your own WhatsApp chat.
                  </div>
                )}
                <div className="rounded-lg border border-[#2b3139] bg-black/20 p-3 text-xs text-[#929aa5]">
                  <p className="font-bold text-white mb-1">Manual self-command test</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open WhatsApp.</li>
                    <li>Open your own chat / message yourself.</li>
                    <li>Send <code className="text-white">balance</code> or <code className="text-white">/balance</code>.</li>
                    <li>ReplayFX should reply with your account balance.</li>
                    <li>Send <code className="text-white">buy</code>.</li>
                    <li>ReplayFX should reply: Remote trading execution is disabled.</li>
                  </ol>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[#2b3139] flex items-center justify-between">
              <span className="text-xs text-[#707a8a]">
                Status: {whatsappStatus.configured ? <span className="text-[#0ecb81]">Configured</span> : <span className="text-yellow-500">Not Configured</span>}
                {whatsappConfig.provider === 'BAILEYS' && (whatsappStatus as any).baileys && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-white/5 border border-[#2b3139] text-[#929aa5] capitalize">
                    State: {(whatsappStatus as any).baileys.status.replace(/_/g, ' ')}
                  </span>
                )}
              </span>
              <button 
                onClick={handleSaveWhatsapp} 
                disabled={saving}
                className="px-6 py-2 bg-[#25D366] hover:bg-[#25D366]/80 text-black font-bold rounded-lg transition text-sm flex items-center"
              >
                {saving ? <RefreshCcw className="w-4 h-4 animate-spin mr-2 text-black" /> : null}
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ALERTS' && (
        <div className="bn-card  border border-[#2b3139] rounded-xl p-6 animate-fade-slide-in">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF9500]/20 to-[#FF9500]/5 flex items-center justify-center border border-[#FF9500]/20">
              <Bell className="w-6 h-6 text-[#FF9500]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Alert Rules Engine</h2>
              <p className="text-sm text-[#929aa5]">Configure automated notifications for drawdowns, margin levels, and equity changes.</p>
            </div>
          </div>
          
          <div className="bg-white/5 border border-[#2b3139] rounded-xl p-8 text-center text-[#929aa5]">
            <p className="mb-4 text-sm font-bold text-white">Alerts decide when ReplayFX sends notifications to Telegram/WhatsApp.</p>
            <p className="text-sm max-w-lg mx-auto leading-relaxed">
              Rules can be saved, but automatic delivery is still under development. Examples of events:
            </p>
            <ul className="mt-4 space-y-2 text-xs text-[#929aa5] max-w-sm mx-auto text-left list-disc list-inside">
              <li>Trade Open / Close</li>
              <li>Balance Update</li>
              <li>Daily Profit Target / Daily Loss Limit</li>
              <li>Drawdown Limit</li>
              <li>MT5 Disconnected</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === 'COMMAND' && (
        <div className="bn-card  border border-[#2b3139] rounded-xl p-6 animate-fade-slide-in">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500/20 to-gray-500/5 flex items-center justify-center border border-gray-500/20">
              <Terminal className="w-6 h-6 text-[#929aa5]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Command Center</h2>
              <p className="text-sm text-[#929aa5]">Command Center records commands received from Telegram/WhatsApp.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white/5 p-4 rounded-xl border border-[#2b3139]">
              <h3 className="font-bold text-white text-sm mb-2">Read-only Commands (Allowed)</h3>
              <ul className="text-xs text-[#929aa5] space-y-1 list-disc list-inside">
                <li><code className="text-[#fcd535]">/status</code></li>
                <li><code className="text-[#fcd535]">/balance</code></li>
                <li><code className="text-[#fcd535]">/equity</code></li>
                <li><code className="text-[#fcd535]">/today</code></li>
                <li><code className="text-[#fcd535]">/open_trades</code></li>
                <li><code className="text-[#fcd535]">/last_trade</code></li>
                <li><code className="text-[#fcd535]">/help</code></li>
              </ul>
            </div>
            
            <div className="bg-[rgba(246,70,93,0.08)] p-4 rounded-xl border border-[rgba(246,70,93,0.2)]">
              <h3 className="text-[#f6465d] font-bold text-sm mb-2 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2" />
                Blocked Commands
              </h3>
              <ul className="text-xs text-[#f6465d]/80 space-y-1 list-disc list-inside mb-3">
                <li><code className="font-bold">/buy</code></li>
                <li><code className="font-bold">/sell</code></li>
                <li><code className="font-bold">/close_all</code></li>
                <li><code className="font-bold">/modify_sl</code></li>
                <li><code className="font-bold">/modify_tp</code></li>
              </ul>
              <p className="text-xs text-[#f6465d]/90">
                Remote trade execution must stay disabled. If blocked command is received, response: "Remote trading execution is disabled."
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-[#2b3139] rounded-xl bn-card ">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-[#929aa5] text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Command</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {commandLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#707a8a]">No commands logged yet.</td>
                  </tr>
                ) : (
                  commandLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-white/5 transition">
                      <td className="px-4 py-3 whitespace-nowrap text-[#929aa5]">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-white">{log.source}</td>
                      <td className="px-4 py-3 font-mono text-[#fcd535]">{log.command}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.status === 'EXECUTED' ? 'bg-[rgba(14,203,129,0.12)] text-[#0ecb81] border border-[rgba(14,203,129,0.25)]' :
                          log.status === 'REJECTED' ? 'bg-[rgba(246,70,93,0.12)] text-[#f6465d] border border-[rgba(246,70,93,0.25)]' :
                          'bg-gray-500/20 text-[#929aa5] border border-gray-500/30'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#929aa5] max-w-xs truncate" title={log.response}>{log.response}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'DIAGNOSTICS' && (
        <div className="bn-card  border border-[#2b3139] rounded-xl p-6 animate-fade-slide-in">
          <div className="flex items-center space-x-4 mb-6 border-b border-[#2b3139] pb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center border border-purple-500/20">
              <Terminal className="w-6 h-6 text-purple-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Integration Logs</h2>
              <p className="text-sm text-[#929aa5]">Diagnostic overview of all external connections and events.</p>
            </div>
            <button onClick={async () => {
              if (window.confirm("Clear all integration logs?")) {
                await fetch(`${API_BASE_URL}/integrations/logs/clear`, { method: 'POST' });
                checkStatus();
              }
            }} className="px-4 py-2 bg-[rgba(246,70,93,0.12)] hover:bg-lossRed/30 text-[#f6465d] rounded-lg text-xs font-bold transition mr-2">
              Clear Logs
            </button>
            <button
              onClick={() => {
                const recent = integrationLogs.slice(0, 50).map((log: any) => ({
                  time: log.createdAt,
                  source: log.source,
                  eventType: log.eventType,
                  status: log.status,
                  message: log.message,
                  details: log.details,
                }));
                navigator.clipboard.writeText(JSON.stringify(recent, null, 2));
                alert('Recent integration logs copied.');
              }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition text-xs font-bold text-white"
            >
              Copy Recent Logs
            </button>
            <button onClick={checkStatus} disabled={loading} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition text-xs font-bold text-white flex items-center">
              <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto border border-[#2b3139] rounded-xl bn-card ">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-[#929aa5] text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {integrationLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[#707a8a]">No integration logs yet.</td>
                  </tr>
                ) : (
                  integrationLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-white/5 transition" onClick={() => {
                      if (log.details) {
                        alert(`Log Details:\n${log.details}`);
                      }
                    }}>
                      <td className="px-4 py-3 whitespace-nowrap text-[#929aa5]">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-white">{log.source}</td>
                      <td className="px-4 py-3 font-mono text-[#fcd535]">{log.eventType}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.status === 'SUCCESS' ? 'bg-[rgba(14,203,129,0.12)] text-[#0ecb81] border border-[rgba(14,203,129,0.25)]' :
                          log.status === 'ERROR' ? 'bg-[rgba(246,70,93,0.12)] text-[#f6465d] border border-[rgba(246,70,93,0.25)]' :
                          log.status === 'WARNING' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
                          'bg-gray-500/20 text-[#929aa5] border border-gray-500/30'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#eaecef] max-w-sm truncate" title={log.message}>{log.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
