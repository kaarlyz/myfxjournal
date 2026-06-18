import React, { useEffect, useState } from 'react';
import { useJournalStore } from '../store/useJournalStore';
import { Link2, Code, ShieldCheck, CheckCircle2, AlertCircle, RefreshCcw } from 'lucide-react';

export default function Integrations() {
  const { fetchSettings } = useJournalStore();
  const [mt5Status, setMt5Status] = useState({ connected: false, lastSyncTime: null });
  const [loading, setLoading] = useState(false);
  const [secretToken, setSecretToken] = useState('...');
  
  const API_BASE_URL = (import.meta as any).env.VITE_API_URL || '/api';

  const checkStatus = async () => {
    setLoading(true);
    try {
      // First get the private token if possible
      const settingsRes = await fetch(`${API_BASE_URL}/settings/private`);
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setSecretToken(settings.secretToken || 'Not set');
        
        // Then check MT5 status
        const statusRes = await fetch(`${API_BASE_URL}/integrations/mt5/status`, {
          headers: {
            'Authorization': `Bearer ${settings.secretToken}`
          }
        });
        if (statusRes.ok) {
          const status = await statusRes.json();
          setMt5Status(status);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Integrations</h1>
        <p className="text-gray-400 text-sm">Connect ReplayFX Journal to external trading platforms for automated journaling.</p>
      </div>

      <div className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00A1E0]/20 to-[#00A1E0]/5 flex items-center justify-center border border-[#00A1E0]/20">
              <span className="font-bold text-[#00A1E0]">MT5</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">MetaTrader 5 Bridge</h2>
              <p className="text-sm text-gray-400">Automatically sync trades from your MT5 terminal using an EA webhook.</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            {mt5Status.connected ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-winGreen/10 text-winGreen text-xs font-bold border border-winGreen/20">
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
              <button 
                onClick={async () => {
                  if (secretToken === '...') return;
                  setLoading(true);
                  try {
                    const res = await fetch(`${API_BASE_URL}/integrations/mt5/test-event`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${secretToken}`,
                        'Content-Type': 'application/json'
                      }
                    });
                    if (res.ok) {
                      alert('Test event sent successfully!');
                      checkStatus();
                    } else {
                      const err = await res.json();
                      alert('Failed to send test event: ' + (err.error || 'Unknown error'));
                    }
                  } catch (e) {
                    alert('Network error sending test event');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading || secretToken === '...'} 
                className="text-xs text-gray-400 flex items-center hover:text-white transition px-2 py-1 rounded bg-white/5 border border-white/10"
              >
                Send Test Event
              </button>
              <button onClick={checkStatus} disabled={loading} className="text-xs text-gray-400 flex items-center hover:text-white transition px-2 py-1 rounded bg-white/5 border border-white/10">
                <RefreshCcw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <h3 className="text-sm font-bold text-white flex items-center mb-3">
              <ShieldCheck className="w-4 h-4 mr-2 text-accentEmerald" />
              Security Information
            </h3>
            <p className="text-sm text-gray-400 mb-4 leading-relaxed">
              We do <strong>not</strong> ask for your MT5 password. The integration works by installing a custom EA (Expert Advisor) 
              on your local MT5 terminal. This EA listens to trade events and securely pushes them to your journal via Webhooks.
            </p>
            <div className="bg-black/50 p-3 rounded-lg border border-white/5 flex flex-col space-y-2">
              <span className="text-xs text-gray-500 font-medium">Your Webhook Secret Token (Requires Private Access)</span>
              <code className="text-accentBlue font-mono text-sm">{secretToken}</code>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white flex items-center mb-4">
              <Code className="w-4 h-4 mr-2 text-gray-400" />
              Setup Instructions
            </h3>
            <ol className="list-decimal list-inside space-y-4 text-sm text-gray-400 ml-1">
              <li className="leading-relaxed">
                <strong className="text-gray-200">Whitelist Webhook URL:</strong> Open MT5, go to <em>Tools → Options → Expert Advisors</em>. Check "Allow WebRequest for listed URL" and add <code className="bg-white/10 px-1 py-0.5 rounded text-white text-xs">https://your-backend-url.com</code>.
              </li>
              <li className="leading-relaxed">
                <strong className="text-gray-200">Install EA:</strong> Place the ReplayFX Bridge EA into your MT5 <em>MQL5/Experts</em> folder.
              </li>
              <li className="leading-relaxed">
                <strong className="text-gray-200">Configure EA:</strong> Attach the EA to any chart. In the inputs tab, paste your Webhook URL and the <strong>Secret Token</strong> shown above.
              </li>
              <li className="leading-relaxed">
                <strong className="text-gray-200">Trade:</strong> Once attached, any trades you take or close in MT5 will automatically appear in your Live Journal.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
