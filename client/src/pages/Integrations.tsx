import React, { useEffect, useState } from 'react';
import { useJournalStore } from '../store/useJournalStore';
import { Link2, ShieldCheck, CheckCircle2, AlertCircle, RefreshCcw, MessageCircle, Phone, Bell, Terminal, Activity, Server, Database } from 'lucide-react';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input, Select } from '../components/ui/Input';

export default function Integrations() {
  const { } = useJournalStore();
  const [activeTab, setActiveTab] = useState<'MT5' | 'TRADINGVIEW' | 'TELEGRAM' | 'WHATSAPP' | 'ALERTS' | 'COMMAND' | 'DIAGNOSTICS' | 'HEALTH'>('MT5');
  const [mt5Status, setMt5Status] = useState({ connected: false, lastSyncTime: null });
  const [telegramStatus, setTelegramStatus] = useState<any>({ configured: false });
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
        // if (waRes.ok) setWhatsappStatus(await waRes.json());
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
    { id: 'COMMAND', name: 'Commands', icon: Terminal },
    { id: 'DIAGNOSTICS', name: 'Diagnostics', icon: ShieldCheck },
    { id: 'ALERTS', name: 'Alerts', icon: Bell },
    { id: 'HEALTH', name: 'Health', icon: Server },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <PageHeader 
          label="Connections"
          title="Integrations & Automations"
          subtitle="Hubungkan ReplayFX Journal dengan platform trading eksternal dan aplikasi pesan instan."
          labelColor="dark"
        />
        <div className="flex items-center gap-3">
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
      </div>

      <HelpCard title="Keamanan remote command" tone="warning">
        Command dari Telegram/WhatsApp hanya untuk monitoring dan pencatatan aman. Perintah trading seperti buy, sell, modify SL/TP, dan close_all diblokir.
      </HelpCard>

      <div className="flex space-x-2 border-b-4 border-[#121212] overflow-x-auto custom-scrollbar pb-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-6 py-3 font-extrabold uppercase tracking-widest text-[12px] transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-[#121212] text-white shadow-[4px_4px_0px_0px_#121212] translate-y-0 translate-x-0' 
                  : 'bg-white text-[#717182] border-2 border-[#121212] hover:bg-[#F0F0F0] hover:text-[#121212] translate-y-1'
              }`}
              style={{ zIndex: isActive ? 10 : 1 }}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'MT5' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-start justify-between bg-[#F0F0F0] mt-2">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
                <span className="font-black text-[#1040C0] text-[18px]">MT5</span>
              </div>
              <div>
                <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">MetaTrader 5 Bridge</h2>
                <p className="text-[13px] font-bold text-[#717182] mt-1">Sinkronisasi trade otomatis dari terminal MT5 melalui EA webhook.</p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              {mt5Status.connected ? (
                <Badge variant="profit" className="mb-3 border-2 border-[var(--profit)]">
                  <CheckCircle2 className="w-3 h-3 mr-1.5" /> Connected
                </Badge>
              ) : (
                <Badge variant="warning" className="mb-3 border-2 border-[var(--warning)]">
                  <AlertCircle className="w-3 h-3 mr-1.5" /> Waiting for Events
                </Badge>
              )}
              <Button onClick={checkStatus} disabled={loading} variant="secondary" className="px-3 py-1 text-[11px]">
                <RefreshCcw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>

          <div className="p-6 md:p-8 space-y-8">
            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
              <h3 className="text-[14px] font-black text-[#121212] uppercase tracking-wide flex items-center mb-4 border-b-2 border-[#121212] pb-2 inline-block">
                <ShieldCheck className="w-5 h-5 mr-2 text-[var(--profit)]" strokeWidth={2.5} />
                Security Information
              </h3>
              <div className="bg-white border-2 border-[#121212] p-5 shadow-[4px_4px_0px_0px_#121212] flex flex-col space-y-2">
                <span className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest">Your Webhook Secret Token (Requires Private Access)</span>
                <code className="text-[#121212] font-mono font-black text-[16px] tracking-widest bg-[#F0F0F0] p-2 border border-[#121212] select-all w-fit">{secretToken}</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'TRADINGVIEW' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#121212]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-center space-x-4 bg-[#F0F0F0] mt-2">
            <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
              <Activity className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">TradingView Integration</h2>
              <p className="text-[13px] font-bold text-[#717182] mt-1">Kirim alert Momentum Candle ke ReplayFX untuk di-review. Fitur ini tidak mengeksekusi trade secara langsung.</p>
            </div>
          </div>

          <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212] space-y-6">
                <div>
                  <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Webhook URL</label>
                  <div className="flex gap-2 bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] p-1">
                    <input readOnly value={`${window.location.origin}${API_BASE_URL}/integrations/tradingview/webhook`} className="flex-1 bg-transparent py-2 px-3 text-[#121212] text-[12px] font-mono font-bold outline-none" />
                    <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}${API_BASE_URL}/integrations/tradingview/webhook`)} className="px-4 py-2 bg-[#121212] hover:bg-[#1040C0] text-white font-extrabold text-[10px] uppercase tracking-widest transition-colors">Copy</button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Secret Token</label>
                  <div className="flex gap-2 bg-white border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] p-1">
                    <code className="flex-1 bg-transparent py-2 px-3 text-[#1040C0] text-[14px] font-mono font-black outline-none">{secretToken}</code>
                    <button onClick={() => navigator.clipboard.writeText(secretToken)} className="px-4 py-2 bg-[#121212] hover:bg-[#1040C0] text-white font-extrabold text-[10px] uppercase tracking-widest transition-colors">Copy</button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">JSON Alert Template</label>
                  <div className="bg-[#121212] border-2 border-[#121212] p-4 text-[11px] text-[#0ecb81] font-mono font-bold overflow-auto shadow-inner h-64">
                    <pre>{JSON.stringify({
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
                  </div>
                  <Button onClick={() => navigator.clipboard.writeText(JSON.stringify({
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
                  }, null, 2))} variant="secondary" className="mt-4">Copy JSON Template</Button>
                </div>

                <div className="flex flex-wrap gap-3 pt-4 border-t-2 border-dashed border-[#121212]">
                  <Button
                    onClick={async () => {
                      const res = await fetch(`${API_BASE_URL}/integrations/tradingview/test-event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                      const data = await res.json();
                      alert(data.ok ? 'Test TradingView setup received.' : data.error);
                      checkStatus();
                    }}
                    variant="blue"
                  >
                    Send Test Event
                  </Button>
                  <Button onClick={() => window.location.assign('/setup-review')} variant="dark">
                    Open TradingView Review Queue
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] pt-4">
                  <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]"><span className="text-[#717182] font-extrabold uppercase tracking-widest text-[10px] block mb-1">Status</span><span className="text-[#121212] font-black">{tradingViewStatus?.configured ? 'Configured' : 'Missing secret'}</span></div>
                  <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]"><span className="text-[#717182] font-extrabold uppercase tracking-widest text-[10px] block mb-1">Last Event</span><span className="text-[#121212] font-black">{tradingViewEvents[0] ? `${tradingViewEvents[0].symbol} ${tradingViewEvents[0].status}` : 'None'}</span></div>
                  <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]"><span className="text-[#717182] font-extrabold uppercase tracking-widest text-[10px] block mb-1">Last Error</span><span className="text-[var(--loss)] font-black">{integrationLogs.find((l: any) => l.source === 'TRADINGVIEW' && l.status === 'ERROR')?.message || 'None'}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
                <SectionLabel label="Setup Guide" shape="square" color="blue" className="mb-4" />
                <ol className="text-[13px] font-bold text-[#717182] space-y-3 list-decimal list-inside">
                  <li>Open TradingView Alert.</li>
                  <li>Enable Webhook URL.</li>
                  <li>Paste ReplayFX webhook URL.</li>
                  <li>Paste the JSON alert message.</li>
                  <li>Trigger alert.</li>
                  <li>ReplayFX receives event and sends review commands.</li>
                </ol>
              </div>

              <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
                <SectionLabel label="Recent TradingView Alerts" shape="diamond" color="dark" className="mb-4" />
                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                  {tradingViewEvents.length === 0 ? (
                    <p className="text-[12px] font-bold text-[#717182] italic text-center py-6 border-2 border-dashed border-[#121212]">No TradingView alerts yet.</p>
                  ) : tradingViewEvents.map((event: any) => (
                    <div key={event.id} className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
                      <div className="flex justify-between gap-2 mb-2">
                        <span className="font-black text-[#121212] uppercase tracking-wide">{event.symbol} <span className="text-[#1040C0]">{event.timeframe}</span></span>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 bg-[#121212] text-white">{event.status}</span>
                      </div>
                      <p className="text-[12px] font-bold text-[#717182] mb-1 uppercase">{event.side} @ <span className="text-[#121212] font-number">{event.price}</span></p>
                      <p className="text-[10px] font-bold text-[#717182]">{new Date(event.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TELEGRAM */}
      {activeTab === 'TELEGRAM' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-center space-x-4 bg-[#F0F0F0] mt-2">
            <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">Telegram Bot</h2>
              <p className="text-[13px] font-bold text-[#717182] mt-1">Terima alert trade dan cek status akun melalui Telegram command.</p>
            </div>
          </div>

          <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6 max-w-2xl">
              <div className="flex items-center space-x-4 bg-[#F0F0F0] p-5 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212]">
                <input 
                  type="checkbox" 
                  checked={telegramConfig.enabled}
                  onChange={(e) => setTelegramConfig({...telegramConfig, enabled: e.target.checked})}
                  className="w-6 h-6 border-2 border-[#121212] accent-[#1040C0] cursor-pointer"
                />
                <div>
                  <h3 className="text-[#121212] font-black text-[14px] uppercase tracking-wide">Enable Telegram Bot</h3>
                  <p className="text-[12px] font-bold text-[#717182]">Nyalakan untuk mengaktifkan bot.</p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Bot Token (from @BotFather)"
                  type="password"
                  value={telegramConfig.botToken}
                  onChange={(e) => setTelegramConfig({...telegramConfig, botToken: e.target.value})}
                  placeholder="1234567890:AAH_..."
                />
                
                <Input
                  label="Allowed Chat IDs (comma separated)"
                  type="text"
                  value={telegramConfig.chatIds}
                  onChange={(e) => setTelegramConfig({...telegramConfig, chatIds: e.target.value})}
                  placeholder="-100123456, 9876543"
                />

                <div className="bg-[#F0F0F0] p-5 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212]">
                  <label className="block text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mb-2">Webhook Secret</label>
                  <code className="block w-full bg-white border-2 border-[#121212] p-3 text-[#121212] font-mono font-black text-[14px] shadow-[2px_2px_0px_0px_#121212]">
                    {secretToken}
                  </code>
                  <p className="text-[10px] font-bold text-[#717182] mt-3 uppercase tracking-wider">Random secret in the webhook URL so random users cannot hit your webhook endpoint.</p>
                </div>
              </div>

              <div className="pt-6 border-t-4 border-[#121212] flex flex-wrap items-center justify-between gap-4">
                <Button 
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
                  variant="secondary"
                >
                  Set Webhook
                </Button>
                <div className="flex space-x-3">
                  <Button 
                    onClick={async () => {
                      const res = await fetch(`${API_BASE_URL}/integrations/telegram/send-test`, { method: 'POST' });
                      const text = await res.text();
                      alert(text);
                    }}
                    variant="dark"
                  >
                    Test Message
                  </Button>
                  <Button 
                    onClick={handleSaveTelegram} 
                    disabled={saving}
                    variant="blue"
                  >
                    {saving ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save Config
                  </Button>
                </div>
              </div>

              {/* Local Bot Mode */}
              <div className="pt-6 border-t-4 border-[#121212]">
                <div className="bg-white border-4 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-[16px] font-black text-[#121212] uppercase tracking-wide flex items-center gap-2">
                        Local Bot Mode
                        <Badge variant="neutral">Long Polling</Badge>
                      </h3>
                      <p className="text-[11px] font-bold text-[#717182] mt-2 uppercase tracking-wider leading-relaxed border-l-2 border-[#121212] pl-2">
                        Running locally? Use Start Polling. Telegram cannot send webhooks to localhost.<br/>
                        Production mode: use Set Webhook only when your backend has a public URL.<br/>
                        Debug mode: Poll Once manually checks Telegram for new commands one time.
                      </p>
                    </div>
                    <Button onClick={checkStatus} disabled={loading} variant="secondary" className="px-2 py-1 text-[10px]">
                      <RefreshCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>

                  {/* Start/Stop Polling */}
                  <div className="flex items-center gap-3 flex-wrap bg-[#F0F0F0] p-4 border-2 border-[#121212]">
                    {telegramDebug?.pollingRunning ? (
                      <Button onClick={stopPolling} disabled={pollingLoading} variant="danger">
                        {pollingLoading ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <div className="w-2 h-2 bg-white mr-2" />}
                        Stop Polling
                      </Button>
                    ) : (
                      <Button onClick={startPolling} disabled={pollingLoading} variant="profit">
                        {pollingLoading ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <div className="w-2 h-2 rounded-full bg-white mr-2" />}
                        Start Polling
                      </Button>
                    )}
                    
                    {telegramDebug?.pollingRunning && (
                      <Badge variant="profit" className="animate-pulse py-2 px-3 text-[12px]">
                        Polling Active
                      </Badge>
                    )}
                    
                    <Button onClick={runPollOnce} disabled={pollOnceLoading} variant="blue">
                      {pollOnceLoading ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <Terminal className="w-4 h-4 mr-2" />}
                      Poll Once
                    </Button>
                    
                    {telegramDebug?.pollingRunning && (
                      <span className="text-[11px] font-extrabold text-[var(--profit)] flex items-center gap-1 uppercase tracking-widest border-2 border-[var(--profit)] px-2 py-1 bg-[var(--profit-dim)]">
                        <span className="w-2 h-2 bg-[var(--profit)] animate-pulse block" />
                        Running{telegramDebug.pollingStartedAt ? ` since ${new Date(telegramDebug.pollingStartedAt).toLocaleTimeString()}` : ''}
                      </span>
                    )}
                  </div>

                  {pollOnceResult && (
                    <div className={`p-4 font-mono font-bold text-[14px] border-4 shadow-[4px_4px_0px_0px_#121212] ${
                      pollOnceResult.ok 
                        ? 'bg-[#0ecb81] border-[#121212] text-[#121212]' 
                        : 'bg-[#f6465d] border-[#121212] text-white'
                    }`}>
                      {pollOnceResult.ok
                        ? <>✓ updates: <strong className="text-xl">{pollOnceResult.updatesFound}</strong> &nbsp;|&nbsp; processed: <strong className="text-xl">{pollOnceResult.processed}</strong> &nbsp;|&nbsp; lastUpdateId: <strong>{pollOnceResult.lastUpdateId}</strong></>
                        : <>✗ {pollOnceResult.error}</>
                      }
                    </div>
                  )}

                  {telegramDebug && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Configured', value: telegramDebug.configured ? 'Yes' : 'No', ok: telegramDebug.configured },
                        { label: 'Bot Token', value: telegramDebug.botTokenPresent ? 'Present' : 'Missing', ok: telegramDebug.botTokenPresent },
                        { label: 'Chat IDs', value: `${telegramDebug.allowedChatIdsCount} configured`, ok: telegramDebug.allowedChatIdsCount > 0 },
                        { label: 'Polling', value: telegramDebug.pollingRunning ? 'True' : 'False', ok: telegramDebug.pollingRunning },
                        { label: 'Last Poll', value: telegramDebug.lastPollAt ? new Date(telegramDebug.lastPollAt).toLocaleTimeString() : 'Never', ok: !!telegramDebug.lastPollAt },
                        { label: 'Last Cmd', value: telegramDebug.lastCommand ? `${telegramDebug.lastCommand}${telegramDebug.lastCommandStatus ? ` (${telegramDebug.lastCommandStatus})` : ''}` : 'Never', ok: !!telegramDebug.lastCommand },
                        { label: 'Last Error', value: telegramDebug.lastError || 'None', ok: !telegramDebug.lastError },
                        { label: 'Update ID', value: telegramDebug.lastUpdateId ? String(telegramDebug.lastUpdateId) : 'None', ok: !!telegramDebug.lastUpdateId },
                      ].map(item => (
                        <div key={item.label} className="bg-[#F0F0F0] border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212]">
                          <div className="text-[9px] font-extrabold text-[#717182] uppercase tracking-widest mb-1">{item.label}</div>
                          <div className={`text-[12px] font-black truncate ${item.ok ? 'text-[var(--profit)]' : 'text-[var(--warning)]'}`} title={item.value}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212] h-fit">
              <SectionLabel label="How to setup" shape="diamond" color="blue" className="mb-4" />
              <p className="text-[12px] font-bold text-[#717182] leading-relaxed mb-6">
                Start by opening Telegram and searching for <code className="text-[#121212] bg-white px-1 border border-[#121212] font-black">@userinfobot</code> to find your Chat ID.
                Then talk to <code className="text-[#121212] bg-white px-1 border border-[#121212] font-black">@BotFather</code> to create a new bot and get the Token.
              </p>
              
              <div className="space-y-4">
                <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] border-l-4 border-l-[var(--profit)]">
                  <p className="font-black text-[#121212] text-[13px] uppercase tracking-wide mb-1">Local mode</p>
                  <p className="text-[11px] font-bold text-[#717182]">Running locally? Use Start Polling. Telegram cannot send webhooks to localhost.</p>
                </div>
                <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] border-l-4 border-l-[#1040C0]">
                  <p className="font-black text-[#121212] text-[13px] uppercase tracking-wide mb-1">Production mode</p>
                  <p className="text-[11px] font-bold text-[#717182]">Use Set Webhook only when your backend has a public URL (Render, ngrok, Cloudflare).</p>
                </div>
                <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] border-l-4 border-l-[#121212]">
                  <p className="font-black text-[#121212] text-[13px] uppercase tracking-wide mb-1">Debug mode</p>
                  <p className="text-[11px] font-bold text-[#717182]">Poll Once manually checks Telegram for new commands one time.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP */}
      {activeTab === 'WHATSAPP' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#121212]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-center space-x-4 bg-[#F0F0F0] mt-2">
            <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
              <Phone className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">WhatsApp Integration</h2>
              <p className="text-[13px] font-bold text-[#717182] mt-1">Receive alerts and commands via WhatsApp using Baileys or Cloud API.</p>
            </div>
          </div>
          
          <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between space-x-4 bg-[#F0F0F0] p-5 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212]">
                <div className="flex items-center gap-4">
                  <input 
                    type="checkbox" 
                    checked={whatsappConfig.enabled}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, enabled: e.target.checked})}
                    className="w-6 h-6 border-2 border-[#121212] accent-[#1040C0] cursor-pointer"
                  />
                  <div>
                    <h3 className="text-[#121212] font-black text-[14px] uppercase tracking-wide">Enable WhatsApp</h3>
                    <p className="text-[12px] font-bold text-[#717182]">Turn on to activate WhatsApp connectivity.</p>
                  </div>
                </div>
                <Button onClick={handleSaveWhatsapp} disabled={saving} variant="blue">
                  {saving ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Config
                </Button>
              </div>

              <div className="bg-white border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212] space-y-6">
                <div>
                  <label className="block text-[11px] font-extrabold text-[#121212] uppercase tracking-widest mb-2">Provider</label>
                  <Select
                    value={whatsappConfig.provider}
                    onChange={(e) => setWhatsappConfig({...whatsappConfig, provider: e.target.value})}
                  >
                    <option value="BAILEYS">Baileys (Local Device)</option>
                    <option value="CLOUD">Cloud API (Meta)</option>
                  </Select>
                </div>
                
                {whatsappConfig.provider === 'CLOUD' && (
                  <>
                    <Input
                      label="Cloud Token"
                      value={whatsappConfig.cloudToken}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, cloudToken: e.target.value})}
                      placeholder="EAxxxx..."
                      type="password"
                    />
                    <Input
                      label="Cloud Phone ID"
                      value={whatsappConfig.cloudPhoneId}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, cloudPhoneId: e.target.value})}
                      placeholder="1023456789"
                    />
                  </>
                )}

                {whatsappConfig.provider === 'BAILEYS' && (
                  <div className="space-y-6">
                    <Input
                      label="Allowed Numbers (comma separated)"
                      value={whatsappConfig.allowedNumbers}
                      onChange={(e) => setWhatsappConfig({...whatsappConfig, allowedNumbers: e.target.value})}
                      placeholder="628123456, 628987654"
                    />
                    
                    <div className="flex items-center space-x-4 bg-white border-2 border-[#121212] p-4">
                      <input 
                        type="checkbox" 
                        checked={whatsappConfig.selfCommandsEnabled}
                        onChange={(e) => {
                          setWhatsappConfig({...whatsappConfig, selfCommandsEnabled: e.target.checked});
                          setWhatsappSelfMode(e.target.checked);
                        }}
                        className="w-5 h-5 border-2 border-[#121212] accent-[#121212]"
                      />
                      <div>
                        <h3 className="text-[#121212] font-black text-[12px] uppercase tracking-wide">Self Commands</h3>
                        <p className="text-[10px] font-bold text-[#717182] uppercase">Allow executing commands from your own number.</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t-2 border-dashed border-[#121212]">
                      <h4 className="text-[12px] font-black uppercase mb-4 text-[#121212]">Device Pairing</h4>
                      
                      <div className="flex gap-4 flex-wrap mb-6">
                        <Button onClick={requestBaileysQr} disabled={loading} variant="dark">Request QR Code</Button>
                        <Button onClick={reconnectWhatsapp} disabled={loading} variant="secondary">Reconnect</Button>
                        <Button onClick={refreshWhatsappDebug} variant="secondary">Refresh Debug</Button>
                      </div>

                      {qrCode && (
                        <div className="bg-[#F0F0F0] border-2 border-[#121212] p-6 flex flex-col items-center">
                          <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 border-4 border-[#121212] bg-white p-2" />
                          <div className="mt-4 flex items-center gap-4">
                            <span className="text-[14px] font-black text-[#121212] uppercase">
                              Expires in: <span className="text-[#1040C0]">{qrCountdown}s</span>
                            </span>
                            <Button onClick={refreshQr} disabled={qrRefreshing} variant="blue" className="px-3 py-1">
                              {qrRefreshing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : 'Refresh QR'}
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="mt-6 flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                          <Input
                            label="Pairing Phone Number"
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(e.target.value)}
                            placeholder="628123456789"
                          />
                        </div>
                        <Button onClick={requestPairingCode} disabled={pairingLoading} variant="dark" className="whitespace-nowrap">
                          {pairingLoading ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : null}
                          Request Code
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {whatsappDebug && (
                <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
                  <SectionLabel label="Debug Status" shape="diamond" color="dark" className="mb-4" />
                  <div className="space-y-3 font-mono text-[11px] font-bold">
                    <div className="flex justify-between border-b-2 border-[#121212] pb-1">
                      <span className="text-[#717182] uppercase">Status</span>
                      <span className={whatsappDebug.status === 'CONNECTED' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{whatsappDebug.status || 'UNKNOWN'}</span>
                    </div>
                    <div className="flex justify-between border-b-2 border-[#121212] pb-1">
                      <span className="text-[#717182] uppercase">Provider</span>
                      <span className="text-[#121212]">{whatsappConfig.provider}</span>
                    </div>
                    <div className="flex justify-between border-b-2 border-[#121212] pb-1">
                      <span className="text-[#717182] uppercase">Phone</span>
                      <span className="text-[#121212]">{whatsappDebug.phoneNumber || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-white border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
                <SectionLabel label="Simulate Command" shape="circle" color="blue" className="mb-4" />
                <div className="flex flex-col gap-3">
                  <Input 
                    label="Command Text"
                    placeholder="/ping" 
                    id="simCmd"
                  />
                  <Button onClick={() => {
                    const el = document.getElementById('simCmd') as HTMLInputElement;
                    if(el && el.value) simulateWhatsappCommand(el.value);
                  }} variant="blue">
                    Simulate
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMMAND CENTER */}
      {activeTab === 'COMMAND' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#121212]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-center space-x-4 bg-[#F0F0F0] mt-2">
            <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
              <Terminal className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">Command Center</h2>
              <p className="text-[13px] font-bold text-[#717182] mt-1">Audit log of all commands received via Telegram and WhatsApp.</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
              {commandLogs.length === 0 ? (
                <p className="text-[12px] font-bold text-[#717182] italic text-center py-6 border-2 border-dashed border-[#121212]">No commands logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-4 border-[#121212]">
                        <th className="p-3 text-[11px] font-black text-[#121212] uppercase tracking-widest">Time</th>
                        <th className="p-3 text-[11px] font-black text-[#121212] uppercase tracking-widest">Source</th>
                        <th className="p-3 text-[11px] font-black text-[#121212] uppercase tracking-widest">Command</th>
                        <th className="p-3 text-[11px] font-black text-[#121212] uppercase tracking-widest">Status</th>
                        <th className="p-3 text-[11px] font-black text-[#121212] uppercase tracking-widest">Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commandLogs.map((log, i) => (
                        <tr key={i} className="border-b-2 border-[#121212] bg-white hover:bg-[#F0F0F0] transition-colors">
                          <td className="p-3 text-[11px] font-bold text-[#717182]">{new Date(log.createdAt).toLocaleString()}</td>
                          <td className="p-3"><Badge variant="neutral">{log.source}</Badge></td>
                          <td className="p-3 font-mono font-black text-[#121212] text-[13px]">{log.command}</td>
                          <td className="p-3">
                            <Badge variant={log.status === 'SUCCESS' ? 'profit' : 'loss'}>{log.status}</Badge>
                          </td>
                          <td className="p-3 text-[12px] font-bold text-[#121212] max-w-xs truncate" title={log.response}>{log.response || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DIAGNOSTICS */}
      {activeTab === 'DIAGNOSTICS' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-center space-x-4 bg-[#F0F0F0] mt-2">
            <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">System Diagnostics</h2>
              <p className="text-[13px] font-bold text-[#717182] mt-1">Check the health of all integrations and services.</p>
            </div>
          </div>
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[4px_4px_0px_0px_#121212]">
              <h3 className="font-black text-[#121212] uppercase tracking-wide text-[16px] mb-4 border-b-2 border-[#121212] pb-2">MT5 Connection</h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[12px] font-bold text-[#717182]">Status</span>
                <span className={`font-black ${mt5Status.connected ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{mt5Status.connected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-[#717182]">Last Sync</span>
                <span className="font-bold text-[#121212] text-[12px]">{mt5Status.lastSyncTime ? new Date(mt5Status.lastSyncTime).toLocaleString() : 'Never'}</span>
              </div>
            </div>

            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[4px_4px_0px_0px_#121212]">
              <h3 className="font-black text-[#121212] uppercase tracking-wide text-[16px] mb-4 border-b-2 border-[#121212] pb-2">Telegram Bot</h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[12px] font-bold text-[#717182]">Configured</span>
                <span className={`font-black ${telegramStatus?.configured ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{telegramStatus?.configured ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[12px] font-bold text-[#717182]">Polling</span>
                <span className={`font-black ${telegramDebug?.pollingRunning ? 'text-[#0ecb81]' : 'text-[#717182]'}`}>{telegramDebug?.pollingRunning ? 'Active' : 'Stopped'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-[#717182]">Last Command</span>
                <span className="font-bold text-[#121212] text-[12px] truncate max-w-[150px]">{telegramDebug?.lastCommand || 'None'}</span>
              </div>
            </div>

            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[4px_4px_0px_0px_#121212]">
              <h3 className="font-black text-[#121212] uppercase tracking-wide text-[16px] mb-4 border-b-2 border-[#121212] pb-2">WhatsApp</h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[12px] font-bold text-[#717182]">Status</span>
                <span className={`font-black ${whatsappDebug?.status === 'CONNECTED' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{whatsappDebug?.status || 'Unknown'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-[#717182]">Provider</span>
                <span className="font-bold text-[#121212] text-[12px]">{whatsappConfig.provider || 'None'}</span>
              </div>
            </div>

            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[4px_4px_0px_0px_#121212]">
              <h3 className="font-black text-[#121212] uppercase tracking-wide text-[16px] mb-4 border-b-2 border-[#121212] pb-2">TradingView</h3>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[12px] font-bold text-[#717182]">Configured</span>
                <span className={`font-black ${tradingViewStatus?.configured ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{tradingViewStatus?.configured ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-[#717182]">Last Event</span>
                <span className="font-bold text-[#121212] text-[12px] truncate max-w-[150px]">{tradingViewEvents[0] ? tradingViewEvents[0].symbol : 'None'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ALERTS */}
      {activeTab === 'ALERTS' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#f6465d]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-center space-x-4 bg-[#F0F0F0] mt-2">
            <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
              <Bell className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">System Alerts</h2>
              <p className="text-[13px] font-bold text-[#717182] mt-1">Integration logs and system warnings.</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <div className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212]">
              {integrationLogs.length === 0 ? (
                <p className="text-[12px] font-bold text-[#717182] italic text-center py-6 border-2 border-dashed border-[#121212]">No alerts or logs found.</p>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                  {integrationLogs.map((log, i) => (
                    <div key={i} className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] flex flex-col md:flex-row justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="neutral">{log.source}</Badge>
                          <Badge variant={log.status === 'ERROR' ? 'loss' : 'neutral'}>{log.status}</Badge>
                        </div>
                        <p className="text-[13px] font-bold text-[#121212]">{log.message}</p>
                        {log.details && (
                          <pre className="mt-2 text-[10px] font-mono bg-[#F0F0F0] p-2 border border-[#121212] text-[#717182] overflow-x-auto">
                            {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                          </pre>
                        )}
                      </div>
                      <div className="text-[11px] font-extrabold text-[#717182] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HEALTH */}
      {activeTab === 'HEALTH' && (
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] animate-fade-in relative">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#0ecb81]" />
          <div className="p-6 md:p-8 border-b-4 border-[#121212] flex items-center space-x-4 bg-[#F0F0F0] mt-2">
            <div className="w-16 h-16 bg-white border-4 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center">
              <Server className="w-8 h-8 text-[#121212]" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[20px] font-black text-[#121212] uppercase tracking-wide">Platform Health</h2>
              <p className="text-[13px] font-bold text-[#717182] mt-1">Backend service and database connectivity.</p>
            </div>
          </div>
          <div className="p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border-4 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-6 flex items-center gap-6">
                <Database className="w-12 h-12 text-[#1040C0]" strokeWidth={1.5} />
                <div>
                  <h3 className="font-black text-[#121212] uppercase tracking-widest text-[16px]">Database</h3>
                  <p className="text-[#0ecb81] font-bold text-[14px]">Online & Synchronized</p>
                </div>
              </div>
              <div className="bg-white border-4 border-[#121212] shadow-[6px_6px_0px_0px_#121212] p-6 flex items-center gap-6">
                <Server className="w-12 h-12 text-[#121212]" strokeWidth={1.5} />
                <div>
                  <h3 className="font-black text-[#121212] uppercase tracking-widest text-[16px]">API Server</h3>
                  <p className="text-[#0ecb81] font-bold text-[14px]">Online & Responsive</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
