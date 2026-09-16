import React, { useEffect, useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Download, 
  Key, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Server, 
  Activity, 
  Copy, 
  ShieldCheck, 
  Terminal as TerminalIcon 
} from 'lucide-react';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardBody } from '../components/ui/Card';
import { apiUrl, defaultHeaders } from '../utils/api';

interface MT5Terminal {
  id: string;
  terminalId: string;
  accountNumber?: string;
  broker?: string;
  brokerServer?: string;
  platformVersion?: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY' | 'SYNCING';
  lastHeartbeatAt?: string;
  lastSyncAt?: string;
  balance?: number;
  equity?: number;
  leverage?: string;
  currency?: string;
}

export default function MT5Connections() {
  const [terminals, setTerminals] = useState<MT5Terminal[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [apiKey, setApiKey] = useState('replayfx_secret_token_123');

  const fetchTerminals = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/mt5/terminals'), { headers: defaultHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTerminals(data.terminals || []);
      }
    } catch (err) {
      console.error('Failed to fetch MT5 terminals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTerminals();
    const interval = setInterval(fetchTerminals, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleDownloadEa = () => {
    window.location.href = '/api/mt5/download-ea';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHeader
        label="LIVE INTEGRATION"
        labelColor="blue"
        title="MT5 Live Sync Connections"
        subtitle="Automatic 1-click MetaTrader 5 synchronization engine. Replaces manual CSV imports."
        actions={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={fetchTerminals} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="primary" onClick={handleDownloadEa}>
              <Download className="w-4 h-4 mr-2" />
              Download Sync EA (.mq5)
            </Button>
          </div>
        }
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Connection Credentials Card */}
        <Card className="lg:col-span-1 border-2 border-[#121212] bg-white">
          <CardBody className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-lg text-[#121212]">Connection Credentials</h3>
            </div>
            
            <p className="text-xs text-[#717182]">
              Use these credentials inside the <strong>ReplayFX_LiveSync.mq5</strong> EA settings in MetaTrader 5.
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#717182] mb-1">
                  API Server URL (InpApiUrl)
                </label>
                <div className="px-3 py-2 bg-[#F0F0F0] border border-[#121212]/20 font-mono text-xs font-bold text-[#121212] select-all">
                  http://127.0.0.1:5000/api/mt5
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#717182] mb-1">
                  API Master Key (InpApiKey)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={apiKey}
                    className="flex-1 px-3 py-2 bg-[#F0F0F0] border border-[#121212]/20 font-mono text-xs font-bold text-[#121212]"
                  />
                  <Button variant="secondary" size="sm" onClick={handleCopyKey}>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    {copiedKey ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#121212]/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#121212]">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Security & Rate Limiting Active</span>
              </div>
              <p className="text-[11px] text-[#717182]">
                Requests are authenticated via Bearer headers. Live trade transactions stream in real time.
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Connected Terminals Overview */}
        <Card className="lg:col-span-2 border-2 border-[#121212] bg-white">
          <CardBody className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-lg text-[#121212]">Active MT5 Terminals</h3>
              </div>
              <Badge variant={terminals.some(t => t.status === 'ONLINE') ? 'profit' : 'neutral'}>
                {terminals.filter(t => t.status === 'ONLINE').length} Online
              </Badge>
            </div>

            {terminals.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#121212]/20 rounded space-y-3">
                <WifiOff className="w-10 h-10 text-[#717182] mx-auto opacity-50" />
                <h4 className="font-bold text-sm text-[#121212]">No MT5 Terminals Connected Yet</h4>
                <p className="text-xs text-[#717182] max-w-md mx-auto">
                  Download <strong>ReplayFX_LiveSync.mq5</strong>, attach it to any chart in MetaTrader 5, and enter your API Server URL & Key.
                </p>
                <Button variant="primary" size="sm" onClick={handleDownloadEa}>
                  <Download className="w-4 h-4 mr-2" />
                  Download EA Now
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {terminals.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 border-2 border-[#121212] bg-[#FCFCFC] flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-[#121212]">
                          Account #{t.accountNumber || t.terminalId}
                        </span>
                        <Badge variant={t.status === 'ONLINE' ? 'profit' : 'loss'}>
                          {t.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE'}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#717182] font-semibold">
                        {t.broker || 'MetaTrader 5'} {t.brokerServer ? `(${t.brokerServer})` : ''} • Leverage: {t.leverage || '1:100'}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <span className="block text-[10px] font-bold text-[#717182] uppercase">Balance</span>
                        <span className="font-black text-sm text-[#121212]">${t.balance?.toFixed(2) || '0.00'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-[#717182] uppercase">Equity</span>
                        <span className="font-black text-sm text-emerald-600">${t.equity?.toFixed(2) || '0.00'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Setup Guide */}
      <Card className="border-2 border-[#121212] bg-[#F8F9FA]">
        <CardBody className="p-6 space-y-4">
          <SectionLabel label="QUICK SETUP GUIDE" shape="square" color="blue" />
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-white border border-[#121212]/15 space-y-1">
              <span className="font-extrabold text-indigo-600">1. Download EA</span>
              <p className="text-[#717182]">Click 'Download Sync EA' and save <code>ReplayFX_LiveSync.mq5</code>.</p>
            </div>
            <div className="p-3 bg-white border border-[#121212]/15 space-y-1">
              <span className="font-extrabold text-indigo-600">2. Copy to MT5</span>
              <p className="text-[#717182]">Open MT5 &gt; File &gt; Open Data Folder &gt; MQL5 &gt; Experts. Paste the EA.</p>
            </div>
            <div className="p-3 bg-white border border-[#121212]/15 space-y-1">
              <span className="font-extrabold text-indigo-600">3. Allow WebRequest</span>
              <p className="text-[#717182]">In MT5 Tools &gt; Options &gt; Expert Advisors, enable 'Allow WebRequest' for <code>{window.location.origin}</code>.</p>
            </div>
            <div className="p-3 bg-white border border-[#121212]/15 space-y-1">
              <span className="font-extrabold text-indigo-600">4. Attach & Sync</span>
              <p className="text-[#717182]">Attach EA to any chart, enter API URL and Key. Realtime sync starts automatically!</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
