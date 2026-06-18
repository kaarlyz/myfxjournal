import { create } from 'zustand';
import { BacktestSession, Trade, DashboardMetrics } from '../shared/types';

export type AppPage = 'home' | 'create-session' | 'csv-import' | 'dashboard' | 'quick-logger' | 'compare-sessions' | 'settings' | 'webhook-monitor' | 'live-journal' | 'accounts' | 'integrations' | 'risk-calculator';

interface SystemSettings {
  usdIdrRate: number;
  defaultRiskMode: 'FIXED_USD' | 'FIXED_PCT' | 'NO_R';
  defaultRiskValue: number;
  secretToken: string;
}

interface ActiveSessionDetails {
  session: BacktestSession;
  trades: Trade[];
  metrics: DashboardMetrics;
}

interface JournalStore {
  // State
  activeTab: AppPage;
  sessions: (BacktestSession & { tradeCount: number; invalidTradeCount: number; endingBalance: number; netPnlUsd: number; netPnlPct: number; winrate: number })[];
  activeSessionId: string | null;
  activeSessionDetails: ActiveSessionDetails | null;
  settings: SystemSettings;
  loading: boolean;
  error: string | null;

  // Actions
  setTab: (tab: AppPage) => void;
  fetchSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<SystemSettings>) => Promise<boolean>;
  fetchSessions: () => Promise<void>;
  fetchActiveSession: (id: string) => Promise<void>;
  selectSession: (id: string | null) => void;
  createSession: (sessionData: any) => Promise<string | null>;
  deleteSession: (id: string) => Promise<boolean>;
  resetDatabase: () => Promise<boolean>;
  seedDemo: () => Promise<boolean>;
  updateTrade: (tradeId: string, updates: { setupTag?: string; notes?: string; screenshotUrl?: string }) => Promise<boolean>;
  deleteTrade: (tradeId: string) => Promise<boolean>;
  updateSession: (id: string, updates: any) => Promise<boolean>;
  updateSessionCsv: (id: string, csvFile: File, mode: 'REPLACE' | 'APPEND') => Promise<{ ok: boolean; validCount?: number; invalidCount?: number; error?: string }>;
}

export const useJournalStore = create<JournalStore>((set, get) => ({
  // Initial State
  activeTab: 'home',
  sessions: [],
  activeSessionId: null,
  activeSessionDetails: null,
  settings: {
    usdIdrRate: 16200,
    defaultRiskMode: 'FIXED_USD',
    defaultRiskValue: 100,
    secretToken: 'replayfx_secret_token_123',
  },
  loading: false,
  error: null,

  // Actions
  setTab: (tab) => set({ activeTab: tab }),

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Gagal memuat pengaturan.');
      const data = await res.json();
      set({ settings: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  updateSettings: async (newSettings) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (!res.ok) throw new Error('Gagal memperbarui pengaturan.');
      const data = await res.json();
      set({ settings: data.settings, loading: false });
      
      // If active session is selected, refresh it since USD/IDR rate could affect IDR calculations
      const activeId = get().activeSessionId;
      if (activeId) {
        get().fetchActiveSession(activeId);
      }
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('Gagal mengambil daftar sesi.');
      const data = await res.json();
      set({ sessions: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchActiveSession: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error('Sesi tidak ditemukan.');
      const data = await res.json();
      set({
        activeSessionDetails: data,
        activeSessionId: id,
        loading: false,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false, activeSessionDetails: null, activeSessionId: null });
    }
  },

  selectSession: (id) => {
    if (id === null) {
      set({ activeSessionId: null, activeSessionDetails: null, activeTab: 'home' });
    } else {
      set({ activeSessionId: id, activeTab: 'dashboard' });
      get().fetchActiveSession(id);
    }
  },

  createSession: async (sessionData) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });
      if (!res.ok) throw new Error('Gagal membuat sesi backtest baru.');
      const data = await res.json();
      
      await get().fetchSessions();
      set({ loading: false });
      return data.id;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  deleteSession: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus sesi backtest.');
      
      await get().fetchSessions();
      
      if (get().activeSessionId === id) {
        set({ activeSessionId: null, activeSessionDetails: null, activeTab: 'home' });
      }
      
      set({ loading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  resetDatabase: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/settings/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Gagal mereset database.');
      
      set({
        sessions: [],
        activeSessionId: null,
        activeSessionDetails: null,
        activeTab: 'home',
        loading: false,
      });
      
      await get().fetchSettings();
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  seedDemo: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/settings/seed-demo', { method: 'POST' });
      if (!res.ok) throw new Error('Gagal mengisi data demo.');
      
      await get().fetchSessions();
      await get().fetchSettings();
      
      // Auto-select first session
      const sessions = get().sessions;
      if (sessions.length > 0) {
        get().selectSession(sessions[0].id);
      }
      
      set({ loading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  updateTrade: async (tradeId, updates) => {
    try {
      const res = await fetch(`/api/trades/${tradeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Gagal memperbarui metadata trade.');
      
      // Refresh current session
      const activeId = get().activeSessionId;
      if (activeId) {
        await get().fetchActiveSession(activeId);
      }
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  },

  deleteTrade: async (tradeId) => {
    try {
      const res = await fetch(`/api/trades/${tradeId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus trade.');
      
      // Refresh current session
      const activeId = get().activeSessionId;
      if (activeId) {
        await get().fetchActiveSession(activeId);
      }
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  },

  updateSession: async (id, updates) => {
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Gagal memperbarui sesi.');
      await get().fetchSessions();
      if (get().activeSessionId === id) {
        await get().fetchActiveSession(id);
      }
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  },

  updateSessionCsv: async (id, csvFile, mode) => {
    try {
      const formData = new FormData();
      formData.append('csvFile', csvFile);

      const res = await fetch(`/api/sessions/${id}/update-csv?mode=${mode}`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.error || 'Gagal memperbarui CSV.' };
      }

      // Refresh current session after successful update
      await get().fetchActiveSession(id);
      await get().fetchSessions();

      return { ok: true, validCount: data.importedValid, invalidCount: data.importedInvalid };
    } catch (err: any) {
      console.error(err);
      return { ok: false, error: err.message };
    }
  },
}));
