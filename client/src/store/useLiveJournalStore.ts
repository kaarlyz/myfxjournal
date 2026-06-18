import { create } from 'zustand';

interface TradingAccount {
  id: string;
  name: string;
  broker: string | null;
  server: string | null;
  accountType: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
}

interface LiveTrade {
  id: string;
  tradingAccountId: string;
  source: string;
  symbol: string;
  side: string;
  lot: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  closePrice: number | null;
  openTime: string;
  closeTime: string | null;
  profit: number | null;
  riskMoney: number | null;
  strategyTag: string | null;
  emotionTag: string | null;
  mistakeTag: string | null;
  notes: string | null;
  screenshots: string | null;
}

interface LiveJournalStore {
  accounts: TradingAccount[];
  activeAccountId: string | null;
  trades: LiveTrade[];
  summary: any | null;
  loading: boolean;
  error: string | null;
  
  fetchAccounts: () => Promise<void>;
  createAccount: (data: any) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setActiveAccountId: (id: string | null) => void;
  
  fetchTrades: () => Promise<void>;
  fetchSummary: () => Promise<void>;
  addTrade: (data: any) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
}

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || '/api';

export const useLiveJournalStore = create<LiveJournalStore>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  trades: [],
  summary: null,
  loading: false,
  error: null,

  fetchAccounts: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/accounts`);
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      set({ accounts: data, loading: false });
      if (data.length > 0 && !get().activeAccountId) {
        set({ activeAccountId: data[0].id });
      }
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  createAccount: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create account');
      await get().fetchAccounts();
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteAccount: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account');
      if (get().activeAccountId === id) {
        set({ activeAccountId: null });
      }
      await get().fetchAccounts();
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  setActiveAccountId: (id) => {
    set({ activeAccountId: id });
    get().fetchTrades();
    get().fetchSummary();
  },

  fetchTrades: async () => {
    const { activeAccountId } = get();
    set({ loading: true, error: null });
    try {
      const url = activeAccountId 
        ? `${API_BASE_URL}/live-trades?accountId=${activeAccountId}`
        : `${API_BASE_URL}/live-trades`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch trades');
      const data = await res.json();
      set({ trades: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchSummary: async () => {
    const { activeAccountId } = get();
    try {
      const url = activeAccountId 
        ? `${API_BASE_URL}/live-trades/summary?accountId=${activeAccountId}`
        : `${API_BASE_URL}/live-trades/summary`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        set({ summary: data });
      }
    } catch (err) {
      console.error(err);
    }
  },

  addTrade: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/live-trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to save trade');
      await get().fetchTrades();
      await get().fetchSummary();
      await get().fetchAccounts(); // Update balance
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  deleteTrade: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/live-trades/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete trade');
      await get().fetchTrades();
      await get().fetchSummary();
      await get().fetchAccounts();
    } catch (err: any) {
      set({ error: err.message, loading: false });
      throw err;
    }
  }
}));
