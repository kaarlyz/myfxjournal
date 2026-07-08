import React, { useEffect, useState } from 'react';
import { useLiveJournalStore } from '../store/useLiveJournalStore';
import { Wallet, Plus, Trash2, Shield, AlertCircle, Clock, Link as LinkIcon, Server, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { formatCurrency } from '../utils/numberUtils';
import { HelpCard, PageGuide } from '../components/help/HelpSystem';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';

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
          return <Badge variant="profit">Connected</Badge>;
        }
      }
      return <Badge variant="warning">Waiting for MT5</Badge>;
    }
    
    if (acc.status === 'Active') {
      return <Badge variant="profit">Active</Badge>;
    }
    return <Badge variant="neutral">{acc.status}</Badge>;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <h1 className="text-3xl font-extrabold text-[#121212] font-display uppercase tracking-wide">Trading Accounts</h1>
            {sseStatus === 'live' && (
              <Badge variant="profit" className="animate-pulse flex items-center gap-1"><Wifi className="w-3 h-3" /> Live Connected</Badge>
            )}
            {sseStatus === 'connecting' && (
              <Badge variant="warning" className="flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Reconnecting</Badge>
            )}
            {sseStatus === 'offline' && (
              <Badge variant="loss" className="flex items-center gap-1"><WifiOff className="w-3 h-3" /> Offline</Badge>
            )}
          </div>
          <p className="text-[13px] font-bold text-[#717182]">Manage your live and demo trading accounts.</p>
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
          <Button variant="secondary" onClick={() => fetchAccounts()} disabled={loading} title="Manual Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="blue" onClick={() => setIsAdding(!isAdding)}>
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </Button>
        </div>
      </div>

      <HelpCard title="Catatan cent account" tone="warning">
        Jika memakai HFM/cent account atau broker yang menampilkan balance dalam cent, pilih tipe/model Cent dan tulis multiplier di notes. Jangan campur hasil cent dengan USD normal tanpa label.
      </HelpCard>

      {error && (
        <div className="bg-[var(--loss-dim)] border-2 border-[var(--loss)] text-[var(--loss)] p-4 shadow-[4px_4px_0px_0px_var(--loss)] flex items-center gap-3">
          <AlertCircle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          <span className="text-[13px] font-extrabold uppercase tracking-widest">{error}</span>
        </div>
      )}

      {isAdding && (
        <div className="bg-white border-4 border-[#121212] p-6 md:p-8 shadow-[8px_8px_0px_0px_#121212] relative animate-fade-in">
          <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />
          <SectionLabel label="New Trading Account" shape="square" color="blue" className="mb-6 mt-2" />
          
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[#F0F0F0] p-6 border-2 border-[#121212]">
            <Input 
              label="Account Name *" 
              required 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="e.g. VTMarkets Demo 1119809" 
            />
            <Select 
              label="Platform *" 
              value={formData.platform} 
              onChange={e => setFormData({...formData, platform: e.target.value})}
            >
              <option value="MT5">MT5</option>
              <option value="MT4">MT4</option>
              <option value="Manual">Manual</option>
              <option value="Other">Other</option>
            </Select>
            <Input 
              label="Account Number" 
              value={formData.accountNumber} 
              onChange={e => setFormData({...formData, accountNumber: e.target.value})}
              placeholder="e.g. 1119809" 
            />
            <Input 
              label="Broker" 
              value={formData.broker} 
              onChange={e => setFormData({...formData, broker: e.target.value})}
              placeholder="e.g. VTMarkets" 
            />
            <Input 
              label="Broker Server" 
              value={formData.brokerServer} 
              onChange={e => setFormData({...formData, brokerServer: e.target.value})}
              placeholder="e.g. VTMarkets-Demo" 
            />
            <Select 
              label="Account Type" 
              value={formData.accountType} 
              onChange={e => setFormData({...formData, accountType: e.target.value})}
            >
              <option value="REAL">Real</option>
              <option value="DEMO">Demo</option>
              <option value="PROP">Prop Firm</option>
              <option value="CENT">Cent</option>
              <option value="OTHER">Other</option>
            </Select>

            {formData.accountType === 'CENT' && (
              <Input 
                label="Cent Multiplier" 
                type="number" 
                value={formData.centMultiplier} 
                onChange={e => setFormData({...formData, centMultiplier: Number(e.target.value)})}
                placeholder="e.g. 100" 
              />
            )}
            
            <Select 
              label="Account Model" 
              value={formData.accountModel} 
              onChange={e => setFormData({...formData, accountModel: e.target.value})}
            >
              <option value="Standard">Standard</option>
              <option value="Raw ECN">Raw ECN</option>
              <option value="Pro">Pro</option>
              <option value="Cent">Cent</option>
              <option value="Other">Other</option>
            </Select>
            <Input 
              label="Leverage" 
              value={formData.leverage} 
              onChange={e => setFormData({...formData, leverage: e.target.value})}
              placeholder="e.g. 1:500" 
            />
            <Select 
              label="Currency *" 
              value={formData.currency} 
              onChange={e => setFormData({...formData, currency: e.target.value})}
            >
              <option value="USD">USD</option>
              <option value="CENT">US Cent</option>
              <option value="IDR">IDR</option>
            </Select>
            <Input 
              label="Initial Balance *" 
              type="number" 
              step="any" 
              required 
              value={formData.initialBalance} 
              onChange={e => setFormData({...formData, initialBalance: e.target.value})}
              placeholder="1000" 
            />
            <Input 
              label="Current Balance" 
              type="number" 
              step="any" 
              value={formData.currentBalance} 
              onChange={e => setFormData({...formData, currentBalance: e.target.value})}
              placeholder="Leave blank to use initial" 
            />
            <Select 
              label="Status" 
              value={formData.status} 
              onChange={e => setFormData({...formData, status: e.target.value})}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Archived">Archived</option>
            </Select>
            <div className="md:col-span-3">
              <Input 
                label="Notes" 
                value={formData.notes} 
                onChange={e => setFormData({...formData, notes: e.target.value})}
                placeholder="Optional notes" 
              />
            </div>
            <div className="md:col-span-3 flex justify-end gap-3 mt-4 pt-4 border-t-2 border-dashed border-[#121212]/20">
              <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button type="submit" variant="blue" disabled={loading}>
                Save Account
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-white border-4 border-[#121212] p-6 shadow-[6px_6px_0px_0px_#121212] hover:-translate-y-1 hover:shadow-[8px_8px_0px_0px_#121212] transition-all flex flex-col group relative">
            <div className={`absolute top-0 left-0 right-0 h-2 ${acc.currentBalance >= acc.initialBalance ? 'bg-[var(--profit)]' : 'bg-[var(--loss)]'}`} />
            
            <div className="flex items-start justify-between mb-5 mt-1">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]">
                  <Wallet className="w-6 h-6 text-[#121212]" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-[15px] font-extrabold text-[#121212] uppercase tracking-wide">{acc.name}</h3>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {getStatusBadge(acc)}
                    {acc.autoCreated && (
                      <Badge variant="blue" className="flex items-center"><LinkIcon className="w-3 h-3 mr-1" /> MT5 Auto</Badge>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => {
                if(window.confirm('Delete this account and all its trades?')) deleteAccount(acc.id);
              }} className="text-[#717182] hover:text-[var(--loss)] opacity-0 group-hover:opacity-100 transition-all p-1 bg-[#F0F0F0] border-2 border-transparent hover:border-[var(--loss)] shadow-none hover:shadow-[2px_2px_0px_0px_var(--loss)]">
                <Trash2 className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>
            
            <div className="space-y-3 mb-6 bg-[#F0F0F0] p-4 border-2 border-[#121212]">
              <div className="flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#717182] uppercase tracking-wider">Number</span>
                <span className="text-[#121212] font-number bg-white px-2 py-0.5 border border-[#121212]/20">{maskAccountNumber(acc.accountNumber)}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#717182] uppercase tracking-wider">Platform</span>
                <span className="text-[#121212]">{acc.platform}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#717182] uppercase tracking-wider">Broker</span>
                <span className="text-[#121212]">{acc.broker || '-'}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#717182] uppercase tracking-wider flex items-center"><Server className="w-3 h-3 mr-1" /> Server</span>
                <span className="text-[#121212] truncate max-w-[120px]" title={acc.brokerServer || '-'}>{acc.brokerServer || '-'}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#717182] uppercase tracking-wider">Type</span>
                <span className="text-[#121212]">{acc.accountType} {acc.accountModel ? `(${acc.accountModel})` : ''}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] font-bold">
                <span className="text-[#717182] uppercase tracking-wider">Leverage</span>
                <span className="text-[#121212] font-number">{acc.leverage || '-'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 mt-auto border-t-2 border-dashed border-[#121212]/20 pt-4">
              <div className="flex justify-between items-end">
                <p className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest">Balance</p>
                <p className={`text-[16px] font-black font-number ${acc.currentBalance >= acc.initialBalance ? 'text-[var(--profit)]' : 'text-[var(--loss)]'}`}>
                  {formatCurrency(acc.currentBalance, acc.currency)}
                </p>
              </div>
              <div className="flex justify-between items-end">
                <p className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest">Equity</p>
                <p className="text-[14px] font-bold text-[#121212] font-number">
                  {formatCurrency(acc.currentEquity, acc.currency)}
                </p>
              </div>
              <div className="flex justify-between items-end">
                <p className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest">Free Margin</p>
                <p className="text-[14px] font-bold text-[#121212] font-number">
                  {formatCurrency(acc.freeMargin, acc.currency)}
                </p>
              </div>
            </div>

            {acc.lastSnapshotAt && (
              <div className="mt-5 pt-3 border-t-2 border-[#121212]/10 flex items-center text-[10px] font-bold text-[#717182] uppercase tracking-widest">
                <Clock className="w-3 h-3 mr-1.5" />
                Sync: {new Date(acc.lastSnapshotAt).toLocaleString()}
              </div>
            )}
          </div>
        ))}

        {accounts.length === 0 && !isAdding && !loading && (
          <div className="col-span-full py-16 bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 flex flex-col items-center justify-center">
            <div className="p-4 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] mb-5">
              <Shield className="w-10 h-10 text-[#121212]" strokeWidth={2} />
            </div>
            <p className="text-[16px] font-extrabold text-[#121212] uppercase tracking-wide mb-2">No trading accounts found.</p>
            <p className="text-[13px] font-bold text-[#717182]">Create one manually or send a snapshot from your MT5 EA.</p>
          </div>
        )}
      </div>
    </div>
  );
}
