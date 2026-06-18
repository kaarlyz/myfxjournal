import React, { useEffect, useState } from 'react';
import { useLiveJournalStore } from '../store/useLiveJournalStore';
import { Wallet, Plus, Trash2, Shield, AlertCircle } from 'lucide-react';

export default function Accounts() {
  const { accounts, loading, error, fetchAccounts, createAccount, deleteAccount } = useLiveJournalStore();
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    broker: '',
    server: '',
    accountType: 'REAL',
    currency: 'USD',
    initialBalance: ''
  });

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAccount({ ...formData, initialBalance: Number(formData.initialBalance) });
    setIsAdding(false);
    setFormData({ name: '', broker: '', server: '', accountType: 'REAL', currency: 'USD', initialBalance: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trading Accounts</h1>
          <p className="text-gray-400 text-sm">Manage your live and demo trading accounts.</p>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} className="px-4 py-2 bg-accentBlue text-white text-sm font-semibold rounded-lg hover:bg-accentBlue/80 transition flex items-center space-x-2">
          <Plus className="w-4 h-4" />
          <span>Add Account</span>
        </button>
      </div>

      {error && (
        <div className="bg-lossRed/10 border border-lossRed/20 text-lossRed p-4 rounded-xl text-sm flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isAdding && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 relative">
          <h2 className="text-lg font-bold text-white mb-4">New Account</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Account Name</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white focus:border-accentBlue outline-none text-sm" placeholder="e.g. HFM Cent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Broker</label>
              <input type="text" value={formData.broker} onChange={e => setFormData({...formData, broker: e.target.value})}
                className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white focus:border-accentBlue outline-none text-sm" placeholder="e.g. HF Markets" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Account Type</label>
              <select value={formData.accountType} onChange={e => setFormData({...formData, accountType: e.target.value})}
                className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white focus:border-accentBlue outline-none text-sm appearance-none">
                <option value="REAL">Real</option>
                <option value="DEMO">Demo</option>
                <option value="CENT">Cent</option>
                <option value="PROP">Prop Firm</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Currency</label>
              <select value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})}
                className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white focus:border-accentBlue outline-none text-sm appearance-none">
                <option value="USD">USD</option>
                <option value="CENT">US Cent</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Initial Balance</label>
              <input type="number" required value={formData.initialBalance} onChange={e => setFormData({...formData, initialBalance: e.target.value})}
                className="w-full bg-black/40 border border-white/10 rounded-lg py-2 px-3 text-white focus:border-accentBlue outline-none text-sm" placeholder="1000" />
            </div>
            <div className="md:col-span-2 flex justify-end space-x-3 mt-4">
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 bg-transparent text-gray-400 hover:text-white transition text-sm">Cancel</button>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition text-sm">
                Save Account
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-black/40 border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-accentBlue/20 text-accentBlue rounded-lg">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-white font-bold">{acc.name}</h3>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>{acc.broker || 'Unknown Broker'}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{acc.accountType}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => {
                if(window.confirm('Delete this account and all its trades?')) deleteAccount(acc.id);
              }} className="text-gray-500 hover:text-lossRed opacity-0 group-hover:opacity-100 transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div>
                <p className="text-xs text-gray-500 mb-1">Initial Balance</p>
                <p className="text-lg font-semibold text-white">{acc.currency} {acc.initialBalance.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Balance</p>
                <p className={`text-lg font-bold ${acc.currentBalance >= acc.initialBalance ? 'text-winGreen' : 'text-lossRed'}`}>
                  {acc.currency} {acc.currentBalance.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        ))}

        {accounts.length === 0 && !isAdding && !loading && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white/5 rounded-xl border border-white/5 border-dashed">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No trading accounts found. Create one to start journaling live trades.</p>
          </div>
        )}
      </div>
    </div>
  );
}
