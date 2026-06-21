import { create } from 'zustand';

export interface TradingAccount {
  id: string;
  name: string;
  platform: string;
  broker?: string;
  brokerServer?: string;
  accountNumber?: string;
  accountType: string;
  accountModel?: string;
  centMultiplier: number;
  leverage?: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  currentEquity: number | null;
  freeMargin: number | null;
  lastSnapshotAt: string | null;
  notes: string | null;
  source: string;
  autoCreated: boolean;
  status: string;
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
  liveCharts: any | null;
  loading: boolean;
  error: string | null;
  sseStatus: 'offline' | 'connecting' | 'live';
  
  fetchAccounts: () => Promise<void>;
  createAccount: (data: any) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setActiveAccountId: (id: string | null) => void;
  
  fetchTrades: () => Promise<void>;
  fetchSummary: () => Promise<void>;
  addTrade: (data: any) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  
  listenToSSE: () => void;
}

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || '/api';

export const useLiveJournalStore = create<LiveJournalStore>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  trades: [],
  summary: null,
  liveCharts: null,
  loading: false,
  error: null,
  sseStatus: 'offline',

  listenToSSE: () => {
    set({ sseStatus: 'connecting' });
    const eventSource = new EventSource(`${API_BASE_URL}/events/stream`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CONNECTED') {
          set({ sseStatus: 'live' });
        } else if (data.type === 'ACCOUNT_SNAPSHOT') {
          if ((import.meta as any).env.DEV) console.log('[DEV] account_snapshot received', data);
          const { accountId, currentBalance, currentEquity, freeMargin, lastSnapshotAt } = data;
          
          set((state) => ({
            accounts: state.accounts.map(acc => 
              acc.id === accountId ? { ...acc, currentBalance, currentEquity, freeMargin: freeMargin ?? acc.freeMargin, lastSnapshotAt } : acc
            )
          }));
          
          get().fetchAccounts();
          if (get().activeAccountId === accountId) {
            get().fetchSummary();
          }
        } else if (data.type === 'TRADE_EVENT') {
          if ((import.meta as any).env.DEV) console.log('[DEV] trade_event received', data);
          get().fetchAccounts();
          get().fetchTrades();
          get().fetchSummary();
        }
      } catch (err) {
        console.error('SSE Error processing message', err);
      }
    };

    eventSource.onerror = () => {
      set({ sseStatus: 'offline' });
      eventSource.close();
      // Retry after 5s
      setTimeout(() => {
        get().listenToSSE();
      }, 5000);
    };
  },

  fetchAccounts: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API_BASE_URL}/accounts`);
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      const validAccounts = Array.isArray(data) ? data : [];
      const normalizedAccounts = validAccounts.map(acc => ({
        ...acc,
        currentBalance: acc.currentBalance ?? acc.initialBalance ?? 0,
        currentEquity: acc.currentEquity ?? acc.currentBalance ?? acc.initialBalance ?? 0,
        currency: acc.currency || "USD",
        status: acc.status || "Active"
      }));
      set({ accounts: normalizedAccounts, loading: false });
      if (normalizedAccounts.length > 0 && !get().activeAccountId) {
        const sorted = [...normalizedAccounts].sort((a, b) => new Date(b.lastSnapshotAt || 0).getTime() - new Date(a.lastSnapshotAt || 0).getTime());
        set({ activeAccountId: sorted[0].id });
        // Since activeAccountId changed, need to fetch trades and summary
        get().fetchTrades();
        get().fetchSummary();
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
      const validTrades = Array.isArray(data) ? data : [];
      const normalizedTrades = validTrades.map(trade => ({
        ...trade,
        lot: trade.lot ?? 0,
        entryPrice: trade.entryPrice ?? 0,
        closePrice: trade.closePrice ?? null,
        profit: trade.profit ?? 0,
        commission: trade.commission ?? 0,
        swap: trade.swap ?? 0,
        rMultiple: trade.rMultiple ?? 0,
        status: trade.closeTime ? 'CLOSED' : 'OPEN'
      }));
      set({ trades: normalizedTrades, loading: false });
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
        set({
          summary: data.summary ? { ...data.summary, ...data, summary: undefined, charts: undefined } : data,
          liveCharts: data.charts || null,
        });
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
