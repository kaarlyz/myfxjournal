import React, { useEffect, useState } from 'react';
import { useLiveJournalStore } from '../store/useLiveJournalStore';
import { Wallet, Plus, Trash2, Shield, AlertCircle, Clock, Link as LinkIcon, Server, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { formatCurrency } from '../utils/numberUtils';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';

export default function Accounts() {
  const { accounts, loading, error, fetchAccounts, createAccount, deleteAccount, sseStatus } = useLiveJournalStore();
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    platform: 'MT5',
    accountNumber: '',
    broker: '',
    brokerServer: '',
    accountType: 'REAL',
    accountModel: 'Standard',
    leverage: '1:500',
    currency: 'USD',
    initialBalance: '',
    currentBalance: '',
    status: 'Active',
    notes: '',
    centMultiplier: 100
  });

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Fallback polling
  useEffect(() => {
    let interval: any;
    if (sseStatus === 'offline') {
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchAccounts();
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [sseStatus, fetchAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAccount({ 
      ...formData, 
      initialBalance: Number(formData.initialBalance),
      currentBalance: formData.currentBalance ? Number(formData.currentBalance) : Number(formData.initialBalance)
    });
    setIsAdding(false);
    setFormData({ 
      name: '', platform: 'MT5', accountNumber: '', broker: '', brokerServer: '', 
      accountType: 'REAL', accountModel: 'Standard', leverage: '1:500', currency: 'USD', 
      initialBalance: '', currentBalance: '', status: 'Active', notes: '', centMultiplier: 100
    });
  };

  const maskAccountNumber = (accNum: string | null | undefined) => {
    if (!accNum) return 'N/A';
    if (accNum.length <= 4) return accNum;
    const start = accNum.slice(0, 3);
    const end = accNum.slice(-3);
    return `${start}****${end}`;
  };

  const getStatusBadge = (acc: any) => {
    if (acc.platform === 'MT5') {
      if (acc.lastSnapshotAt) {
        const lastSync = new Date(acc.lastSnapshotAt).getTime();
        const now = new Date().getTime();
        if (now - lastSync < 24 * 60 * 60 * 1000) {
          return <span className="px-2 py-1 text-[10px] font-bold rounded bg-[rgba(14,203,129,0.12)] text-[#0ecb81] border border-[rgba(14,203,129,0.25)]">Connected</span>;
        }
      }
      return <span className="px-2 py-1 text-[10px] font-bold rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">Waiting for MT5</span>;
    }
    
    if (acc.status === 'Active') {
      return <span className="px-2 py-1 text-[10px] font-bold rounded bg-[rgba(14,203,129,0.12)] text-[#0ecb81] border border-[rgba(14,203,129,0.25)]">Active</span>;
    }
    return <span className="px-2 py-1 text-[10px] font-bold rounded bg-gray-500/20 text-[#929aa5] border border-gray-500/30">{acc.status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Trading Accounts</h1>
            {sseStatus === 'live' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(14,203,129,0.12)] text-[#0ecb81] border border-[rgba(14,203,129,0.25)]">
                <Wifi className="w-3 h-3 mr-1" /> Live Connected
              </span>
            )}
            {sseStatus === 'connecting' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Reconnecting
              </span>
            )}
            {sseStatus === 'offline' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[rgba(246,70,93,0.12)] text-[#f6465d] border border-[rgba(246,70,93,0.25)]">
                <WifiOff className="w-3 h-3 mr-1" /> Offline
              </span>
            )}
          </div>
          <p className="text-[#929aa5] text-sm">Manage your live and demo trading accounts.</p>
        </div>
        <div className="flex items-center space-x-3">
          <PageGuide
            title="Trading Accounts"
            purpose="Halaman ini menyimpan akun live/demo yang dibaca Live Journal dan integrasi MT5."
            steps={[
              'Tambahkan akun dengan nama, broker, server, currency, dan initial balance.',
              'Jika akun cent, pilih Account Type Cent atau Account Model Cent.',
              'Hubungkan MT5 connector dari halaman Integrations.',
              'Cek status Connected/Waiting for MT5 dari snapshot terakhir.'
            ]}
            outputs={[
              'Live Journal memakai akun ini untuk balance, equity, free margin, dan trades.',
              'Account number dimasking di UI/export agar tidak bocor.'
            ]}
            warnings={[
              'Cent account harus diberi label jelas agar balance broker tidak dikira USD normal.',
              'Data realtime baru masuk setelah MT5 connector mengirim snapshot.'
            ]}
            nextAction="Setelah akun dibuat, buka Integrations untuk setup MT5 connector."
          />
          <button onClick={() => fetchAccounts()} className="flex items-center space-x-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition text-xs text-[#929aa5] hover:text-white" title="Manual Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#fcd535]' : ''}`} />
            <span>Refresh</span>
          </button>
          <button onClick={() => setIsAdding(!isAdding)} className="px-4 py-2 bg-accentBlue text-white text-sm font-semibold rounded-lg hover:bg-accentBlue/80 transition flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      <HelpCard title="Catatan cent account">
        Jika memakai HFM/cent account atau broker yang menampilkan balance dalam cent, pilih tipe/model Cent dan tulis multiplier di notes. Jangan campur hasil cent dengan USD normal tanpa label.
      </HelpCard>

      {error && (
        <div className="bg-[rgba(246,70,93,0.08)] border border-[rgba(246,70,93,0.2)] text-[#f6465d] p-4 rounded-xl text-sm flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isAdding && (
        <div className="bn-card  border border-[#2b3139] rounded-xl p-6 relative">
          <h2 className="text-lg font-bold text-white mb-6">New Trading Account</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Account Name *</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="e.g. VTMarkets Demo 1119809" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Platform *</label>
              <select value={formData.platform} onChange={e => setFormData({...formData, platform: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm appearance-none">
                <option value="MT5">MT5</option>
                <option value="MT4">MT4</option>
                <option value="Manual">Manual</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Account Number</label>
              <input type="text" value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="e.g. 1119809" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Broker</label>
              <input type="text" value={formData.broker} onChange={e => setFormData({...formData, broker: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="e.g. VTMarkets" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Broker Server</label>
              <input type="text" value={formData.brokerServer} onChange={e => setFormData({...formData, brokerServer: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="e.g. VTMarkets-Demo" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Account Type</label>
              <select value={formData.accountType} onChange={e => setFormData({...formData, accountType: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm appearance-none">
                <option value="REAL">Real</option>
                <option value="DEMO">Demo</option>
                <option value="PROP">Prop Firm</option>
                <option value="CENT">Cent</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            {formData.accountType === 'CENT' && (
              <div>
                <label className="block text-xs font-medium text-[#929aa5] mb-1">Cent Multiplier</label>
                <input type="number" value={formData.centMultiplier} onChange={e => setFormData({...formData, centMultiplier: Number(e.target.value)})}
                  className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="e.g. 100" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Account Model</label>
              <select value={formData.accountModel} onChange={e => setFormData({...formData, accountModel: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm appearance-none">
                <option value="Standard">Standard</option>
                <option value="Raw ECN">Raw ECN</option>
                <option value="Pro">Pro</option>
                <option value="Cent">Cent</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Leverage</label>
              <input type="text" value={formData.leverage} onChange={e => setFormData({...formData, leverage: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="e.g. 1:500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Currency *</label>
              <select value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm appearance-none">
                <option value="USD">USD</option>
                <option value="CENT">US Cent</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Initial Balance *</label>
              <input type="number" step="any" required value={formData.initialBalance} onChange={e => setFormData({...formData, initialBalance: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="1000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Current Balance</label>
              <input type="number" step="any" value={formData.currentBalance} onChange={e => setFormData({...formData, currentBalance: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="Leave blank to use initial" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Status</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm appearance-none">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-[#929aa5] mb-1">Notes</label>
              <input type="text" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}
                className="w-full bg-black border border-[#2b3139] rounded-lg py-2 px-3 text-white focus:border-[#fcd535] outline-none text-sm" placeholder="Optional notes" />
            </div>
            <div className="md:col-span-3 flex justify-end space-x-3 mt-2 border-t border-[#2b3139] pt-4">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 bg-transparent text-[#929aa5] hover:text-white transition text-sm font-medium">Cancel</button>
              <button type="submit" disabled={loading} className="px-6 py-2 bg-accentBlue text-white font-semibold rounded-lg hover:bg-accentBlue/80 transition text-sm">
                Save Account
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map(acc => (
          <div key={acc.id} className="bn-card  border border-[#2b3139] rounded-xl p-5 hover:border-white/20 transition-all group flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-[rgba(252,213,53,0.08)] text-[#fcd535] rounded-xl border border-[rgba(252,213,53,0.2)]">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold">{acc.name}</h3>
                    <div className="flex items-center space-x-2 text-xs mt-1">
                      {getStatusBadge(acc)}
                      {acc.autoCreated && (
                        <span className="px-2 py-1 text-[10px] font-bold rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center">
                          <LinkIcon className="w-3 h-3 mr-1" />
                          MT5 Auto
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => {
                  if(window.confirm('Delete this account and all its trades?')) deleteAccount(acc.id);
                }} className="text-[#707a8a] hover:text-[#f6465d] opacity-0 group-hover:opacity-100 transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-3 mb-6 bg-white/5 p-4 rounded-xl border border-[#2b3139]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#707a8a]">Number</span>
                  <span className="text-gray-200 font-mono">{maskAccountNumber(acc.accountNumber)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#707a8a]">Platform</span>
                  <span className="text-gray-200">{acc.platform}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#707a8a]">Broker</span>
                  <span className="text-gray-200">{acc.broker || '-'}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-[#707a8a] flex items-center"><Server className="w-3 h-3 mr-1" /> Server</span>
                  <span className="text-gray-200 truncate max-w-[120px]" title={acc.brokerServer || '-'}>{acc.brokerServer || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#707a8a]">Type</span>
                  <span className="text-gray-200">{acc.accountType} {acc.accountModel ? `(${acc.accountModel})` : ''}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#707a8a]">Leverage</span>
                  <span className="text-gray-200">{acc.leverage || '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4">
                <div>
                  <p className="text-[10px] text-[#707a8a] mb-1 uppercase tracking-wider">Balance</p>
                  <p className={`text-sm font-bold ${acc.currentBalance >= acc.initialBalance ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {formatCurrency(acc.currentBalance, acc.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#707a8a] mb-1 uppercase tracking-wider">Equity</p>
                  <p className="text-sm font-bold text-white">
                    {formatCurrency(acc.currentEquity, acc.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#707a8a] mb-1 uppercase tracking-wider">Free Margin</p>
                  <p className="text-sm font-bold text-white">
                    {formatCurrency(acc.freeMargin, acc.currency)}
                  </p>
                </div>
              </div>
            </div>

            {acc.lastSnapshotAt && (
              <div className="mt-5 pt-4 border-t border-[#2b3139] flex items-center text-xs text-[#707a8a]">
                <Clock className="w-3 h-3 mr-1.5" />
                Last Sync: {new Date(acc.lastSnapshotAt).toLocaleString()}
              </div>
            )}
          </div>
        ))}

        {accounts.length === 0 && !isAdding && !loading && (
          <div className="col-span-full py-16 text-center text-[#707a8a] bg-white/5 rounded-xl border border-[#2b3139] border-dashed">
            <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg">No trading accounts found.</p>
            <p className="text-sm mt-1">Create one manually or send a snapshot from your MT5 EA.</p>
          </div>
        )}
      </div>
    </div>
  );
}
