import React, { useState, useMemo, useEffect } from 'react';
import { useJournalStore } from '../store/useJournalStore';
import { Shield, AlertTriangle, DollarSign, Activity, Settings2, Save, Trash2, Edit3, Plus, Target, Info } from 'lucide-react';
import { simulatePropFirm, PropFirmConfig } from '../lib/propFirmEngine';
import { formatUsd, formatPercent } from '../utils/formatters';
import MetricCard from '../components/MetricCard';
import { Button } from '../components/ui/Button';
import { SectionLabel, PageHeader } from '../components/ui/SectionLabel';
import { Badge } from '../components/ui/Badge';

// ── Default config (generic, not tied to any specific prop firm) ────────────
const DEFAULT_CONFIG: PropFirmConfig = {
  accountSize: 100000,
  targetProfitPct: 10,
  maxDailyDrawdownPct: 5,
  maxTotalDrawdownPct: 10,
  payoutSplitPct: 80,
  minTradingDays: 3,
};

// ── Preset persistence ─────────────────────────────────────────────────────
interface SavedPreset {
  id: string;
  name: string;
  config: PropFirmConfig;
}

const STORAGE_KEY = 'replayfx_propfirm_presets';

function loadPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function savePresets(presets: SavedPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

// ── Component ──────────────────────────────────────────────────────────────
export default function PropFirmSimulator() {
  const { activeSessionDetails, sessions, selectSession } = useJournalStore();
  const [config, setConfig] = useState<PropFirmConfig>(DEFAULT_CONFIG);
  const [riskPerTrade, setRiskPerTrade] = useState(1);

  // Preset management
  const [presets, setPresets] = useState<SavedPreset[]>(loadPresets);
  const [presetName, setPresetName] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [showPresetPanel, setShowPresetPanel] = useState(false);

  // Persist presets
  useEffect(() => { savePresets(presets); }, [presets]);

  const result = useMemo(() => {
    if (!activeSessionDetails) return null;
    return simulatePropFirm(activeSessionDetails.trades, config, true, riskPerTrade);
  }, [activeSessionDetails, config, riskPerTrade]);

  const handleRiskChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setRiskPerTrade(isNaN(val) ? 0 : val);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    if (editingPresetId) {
      setPresets(prev => prev.map(p => p.id === editingPresetId ? { ...p, name, config: { ...config } } : p));
      setEditingPresetId(null);
    } else {
      setPresets(prev => [...prev, { id: Date.now().toString(), name, config: { ...config } }]);
    }
    setPresetName('');
  };

  const handleDeletePreset = (id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id));
    if (editingPresetId === id) setEditingPresetId(null);
  };

  const handleEditPreset = (preset: SavedPreset) => {
    setConfig({ ...preset.config });
    setPresetName(preset.name);
    setEditingPresetId(preset.id);
    setShowPresetPanel(true);
  };

  const handleLoadPreset = (preset: SavedPreset) => {
    setConfig({ ...preset.config });
  };

  const updateConfig = (key: keyof PropFirmConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  // ── No session selected ──────────────────────────────────────────────────
  if (!activeSessionDetails) {
    if (sessions.length === 0) {
      return (
        <div className="space-y-6 animate-fade-in">
          <PageHeader
            label="Simulation"
            title="Prop Firm Simulator"
            subtitle="Test your strategy's eligibility against strict prop firm rules."
            labelColor="blue"
          />
          <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-8 md:p-12 text-center flex flex-col items-center max-w-full overflow-hidden">
            <div className="p-4 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] mb-5">
              <Shield className="w-8 h-8 text-[#121212]" strokeWidth={2} />
            </div>
            <p className="text-[14px] font-extrabold text-[#717182] uppercase tracking-widest">No backtest sessions available.</p>
            <p className="text-[13px] font-bold text-[#717182] mt-3 max-w-md mx-auto leading-relaxed">
              Create a backtest session first, then come back here to simulate your performance against prop firm rules.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-8 animate-fade-in max-w-full overflow-hidden">
        <PageHeader
          label="Simulation"
          title="Prop Firm Simulator"
          subtitle="Select a session to test its prop firm eligibility."
          labelColor="blue"
        />

        {/* Educational Banner */}
        <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] p-6 lg:p-8 flex flex-col lg:flex-row gap-6 items-start relative overflow-hidden">
          <div className="p-4 bg-[#1040C0] border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] shrink-0">
            <Info className="w-8 h-8 text-white" strokeWidth={2} />
          </div>
          <div className="space-y-3 min-w-0">
            <h2 className="text-2xl font-extrabold text-[#121212] uppercase tracking-tight">What is a Prop Firm Simulator?</h2>
            <p className="text-[14px] font-medium text-[#717182] leading-relaxed">
              Proprietary trading firms give you capital to trade, but you must pass strict challenges first.
              This simulator takes your backtest trades and replays them against configurable rules—target profit,
              daily drawdown limits, and total drawdown limits—to see if you would pass or fail.
              <strong> You can customize every parameter to match any prop firm's rules.</strong>
            </p>
          </div>
        </div>

        {/* Session Grid */}
        <div className="space-y-4">
          <SectionLabel label="Select a Session" shape="diamond" color="dark" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
            {sessions.map(s => (
              <div
                key={s.id}
                className="bg-white border-2 border-[#121212] p-4 md:p-5 shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_#121212] transition-all flex flex-col group cursor-pointer h-full"
                onClick={() => selectSession(s.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-4 md:mb-6 min-w-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] md:text-[15px] font-extrabold text-[#121212] uppercase tracking-wide truncate group-hover:text-[#1040C0] transition-colors" title={s.name}>
                      {s.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] md:text-[11px] font-bold text-[#717182] uppercase tracking-wider bg-[#F0F0F0] px-2 py-0.5 border border-[#121212]/10">{s.symbol}</span>
                      <span className="text-[10px] md:text-[11px] font-bold text-[#717182] uppercase tracking-wider bg-[#F0F0F0] px-2 py-0.5 border border-[#121212]/10">{s.timeframe}</span>
                    </div>
                  </div>
                  <Badge variant="neutral" className="shrink-0 text-[10px]">{s.tradeCount} trades</Badge>
                </div>
                <div className="mt-auto pt-3 md:pt-4 flex items-center justify-between text-[#1040C0] border-t-2 border-dashed border-[#121212]/10">
                  <span className="text-[11px] md:text-[12px] font-extrabold uppercase tracking-widest">Simulate</span>
                  <Target className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Active simulation ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in max-w-full overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <PageHeader
          label="Simulation"
          title="Prop Firm Simulator"
          subtitle="Test your strategy against configurable prop firm rules."
          labelColor="blue"
        />
        <div className="flex items-center gap-3 bg-white border-2 border-[#121212] p-2 shadow-[4px_4px_0px_0px_#121212] shrink-0 max-w-full">
          <label className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest pl-2 hidden sm:block whitespace-nowrap">Active:</label>
          <select
            className="bg-[#F0F0F0] border-2 border-[#121212] px-3 py-1.5 font-bold text-[13px] uppercase text-[#121212] outline-none cursor-pointer hover:bg-[#E5E5E5] transition-colors w-full sm:max-w-[220px] truncate"
            value={activeSessionDetails.session?.id || ''}
            onChange={(e) => selectSession(e.target.value)}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.symbol})</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Configuration Panel ──────────────────────────────────────────── */}
      <div className="bg-white border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-3 bg-[#1040C0]" />

        <div className="p-4 md:p-6 mt-2">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6 pb-4 border-b-2 border-dashed border-[#121212]/20">
            <div className="flex items-center gap-3">
              <Settings2 className="w-5 h-5 text-[#121212]" />
              <h3 className="text-[14px] font-extrabold text-[#121212] uppercase tracking-wide">Challenge Rules</h3>
            </div>
            <Button variant="secondary" onClick={() => setShowPresetPanel(!showPresetPanel)} className="text-[11px] px-3 py-1.5">
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {showPresetPanel ? 'Hide Presets' : 'Presets'}
            </Button>
          </div>

          {/* Config Inputs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Account Size ($)</label>
              <input type="number" min="100" step="100"
                className="w-full px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-black text-[#121212] text-sm focus:bg-white transition-colors font-number"
                value={config.accountSize || ''} onChange={(e) => updateConfig('accountSize', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Target Profit (%)</label>
              <input type="number" min="0.1" step="0.1" max="100"
                className="w-full px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-black text-[#121212] text-sm focus:bg-white transition-colors font-number"
                value={config.targetProfitPct || ''} onChange={(e) => updateConfig('targetProfitPct', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Daily DD (%)</label>
              <input type="number" min="0.1" step="0.1" max="100"
                className="w-full px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-black text-[#121212] text-sm focus:bg-white transition-colors font-number"
                value={config.maxDailyDrawdownPct || ''} onChange={(e) => updateConfig('maxDailyDrawdownPct', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Total DD (%)</label>
              <input type="number" min="0.1" step="0.1" max="100"
                className="w-full px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-black text-[#121212] text-sm focus:bg-white transition-colors font-number"
                value={config.maxTotalDrawdownPct || ''} onChange={(e) => updateConfig('maxTotalDrawdownPct', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Payout Split (%)</label>
              <input type="number" min="0" step="1" max="100"
                className="w-full px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-black text-[#121212] text-sm focus:bg-white transition-colors font-number"
                value={config.payoutSplitPct || ''} onChange={(e) => updateConfig('payoutSplitPct', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Risk/Trade (%)</label>
              <input type="number" min="0.1" step="0.1" max="100"
                className="w-full px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-black text-[#121212] text-sm focus:bg-white transition-colors font-number"
                value={riskPerTrade || ''} onChange={handleRiskChange}
                onBlur={() => { if (!riskPerTrade || riskPerTrade <= 0) setRiskPerTrade(1); }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Min Trading Days</label>
              <input type="number" min="0" step="1" max="365"
                className="w-full px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-black text-[#121212] text-sm focus:bg-white transition-colors font-number"
                value={config.minTradingDays || ''} onChange={(e) => updateConfig('minTradingDays', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Preset Panel */}
          {showPresetPanel && (
            <div className="mt-6 pt-6 border-t-4 border-[#121212]">
              <SectionLabel label="Custom Presets" shape="square" color="blue" className="mb-4" />

              {/* Save / Edit Preset */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <input
                  type="text"
                  placeholder="Preset name (e.g. MyFundedNext 50k)"
                  className="flex-1 px-3 py-2.5 bg-[#F0F0F0] border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212] outline-none font-bold text-[#121212] text-sm focus:bg-white transition-colors"
                  value={presetName} onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                />
                <Button variant="blue" onClick={handleSavePreset} disabled={!presetName.trim()} className="whitespace-nowrap">
                  <Save className="w-4 h-4 mr-1.5" />
                  {editingPresetId ? 'Update Preset' : 'Save Current Rules'}
                </Button>
                {editingPresetId && (
                  <Button variant="secondary" onClick={() => { setEditingPresetId(null); setPresetName(''); }}>Cancel</Button>
                )}
              </div>

              {/* Preset List */}
              {presets.length === 0 ? (
                <div className="bg-[#F0F0F0] border-2 border-dashed border-[#121212]/20 p-6 text-center">
                  <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wider">No saved presets yet. Configure rules above and save them.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {presets.map(preset => (
                    <div key={preset.id} className="bg-[#F0F0F0] border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212] flex flex-col">
                      <h4 className="text-[13px] font-extrabold text-[#121212] uppercase tracking-wide mb-3 truncate" title={preset.name}>{preset.name}</h4>
                      <div className="space-y-1.5 text-[11px] font-bold text-[#717182] mb-4 flex-1">
                        <div className="flex justify-between"><span>Account:</span><span className="text-[#121212] font-number">${preset.config.accountSize.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span>Target:</span><span className="text-[#121212] font-number">{preset.config.targetProfitPct}%</span></div>
                        <div className="flex justify-between"><span>Daily DD:</span><span className="text-[#121212] font-number">{preset.config.maxDailyDrawdownPct}%</span></div>
                        <div className="flex justify-between"><span>Total DD:</span><span className="text-[#121212] font-number">{preset.config.maxTotalDrawdownPct}%</span></div>
                        <div className="flex justify-between"><span>Payout:</span><span className="text-[#121212] font-number">{preset.config.payoutSplitPct}%</span></div>
                      </div>
                      <div className="flex gap-2 mt-auto">
                        <Button variant="blue" onClick={() => handleLoadPreset(preset)} className="flex-1 text-[11px] px-2">
                          <Plus className="w-3.5 h-3.5 mr-1" /> Load
                        </Button>
                        <Button variant="secondary" onClick={() => handleEditPreset(preset)} className="px-2">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="danger" onClick={() => handleDeletePreset(preset.id)} className="px-2">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Simulation Results ────────────────────────────────────────────── */}
      {!result ? null : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Status Card */}
            <div className={`bg-white border-4 border-[#121212] p-4 md:p-6 shadow-[8px_8px_0px_0px_#121212] relative md:col-span-2 overflow-hidden`}>
              <div className={`absolute top-0 left-0 right-0 h-3 ${result.status === 'PASSED' ? 'bg-[var(--profit)]' : result.status === 'FAILED' ? 'bg-[var(--loss)]' : 'bg-[#1040C0]'}`} />

              <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-6 md:mb-8 mt-2">
                <div className="min-w-0">
                  <h2 className="text-lg md:text-xl font-extrabold text-[#121212] uppercase tracking-wide">Challenge Status</h2>
                  <p className="text-[11px] md:text-[12px] font-bold text-[#717182] uppercase tracking-wider mt-1 bg-[#F0F0F0] px-2 py-0.5 inline-block border-2 border-[#121212]/10">
                    ${config.accountSize.toLocaleString()} account · {riskPerTrade}% risk
                  </p>
                </div>
                <div className={`px-4 py-2 border-2 border-[#121212] text-[14px] md:text-[15px] font-black uppercase tracking-widest shadow-[2px_2px_0px_0px_#121212] shrink-0 ${result.status === 'PASSED' ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : result.status === 'FAILED' ? 'bg-[var(--loss-dim)] text-[var(--loss)]' : 'bg-[#F0F0F0] text-[#121212]'}`}>
                  {result.status}
                </div>
              </div>

              <div className="space-y-6 md:space-y-8">
                <div className="bg-[#F0F0F0] p-4 md:p-5 border-2 border-[#121212]">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-end mb-3 gap-2">
                    <span className="text-[11px] font-extrabold text-[#121212] uppercase tracking-widest">Target Profit ({config.targetProfitPct}%)</span>
                    <span className="font-black text-[#121212] text-[14px] md:text-[15px] font-number bg-white px-2 py-0.5 border-2 border-[#121212]">{formatUsd(result.netProfit)} <span className="text-[#717182] font-bold mx-1">/</span> {formatUsd(result.targetProfitAmount)}</span>
                  </div>
                  <div className="h-4 bg-white border-2 border-[#121212] relative overflow-hidden">
                    <div className={`absolute top-0 left-0 bottom-0 ${result.passedTarget ? 'bg-[var(--profit)]' : 'bg-[#1040C0]'} transition-all duration-1000`} style={{ width: `${Math.min(100, Math.max(0, (result.netProfit / result.targetProfitAmount) * 100))}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="bg-[#F0F0F0] p-4 md:p-5 border-2 border-[#121212]">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-end mb-3 gap-2">
                      <span className="text-[11px] font-extrabold text-[#121212] uppercase tracking-widest">Daily DD Guard</span>
                      <span className={`font-black text-[14px] md:text-[15px] font-number bg-white px-2 py-0.5 border-2 border-[#121212] ${result.failedDailyDrawdown ? 'text-[var(--loss)]' : 'text-[#121212]'}`}>-{formatUsd(result.maxDailyDrawdownUsd)}</span>
                    </div>
                    <div className="h-4 bg-white border-2 border-[#121212] relative overflow-hidden">
                      <div className={`absolute top-0 left-0 bottom-0 ${result.failedDailyDrawdown ? 'bg-[var(--loss)]' : 'bg-[var(--warning)]'} transition-all duration-1000`} style={{ width: `${Math.min(100, Math.max(0, (result.maxDailyDrawdownUsd / result.dailyDrawdownLimit) * 100))}%` }} />
                    </div>
                  </div>

                  <div className="bg-[#F0F0F0] p-4 md:p-5 border-2 border-[#121212]">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-end mb-3 gap-2">
                      <span className="text-[11px] font-extrabold text-[#121212] uppercase tracking-widest">Total DD Guard</span>
                      <span className={`font-black text-[14px] md:text-[15px] font-number bg-white px-2 py-0.5 border-2 border-[#121212] ${result.failedTotalDrawdown ? 'text-[var(--loss)]' : 'text-[#121212]'}`}>-{formatUsd(result.maxTotalDrawdownUsd)}</span>
                    </div>
                    <div className="h-4 bg-white border-2 border-[#121212] relative overflow-hidden">
                      <div className={`absolute top-0 left-0 bottom-0 ${result.failedTotalDrawdown ? 'bg-[var(--loss)]' : 'bg-[var(--warning)]'} transition-all duration-1000`} style={{ width: `${Math.min(100, Math.max(0, (result.maxTotalDrawdownUsd / result.totalDrawdownLimit) * 100))}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Readiness Card */}
            <div className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col items-center justify-center text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-full bg-[#1040C0] opacity-5 transform skew-x-12" />
              <SectionLabel label="Prop Readiness" shape="circle" color="dark" className="mb-6 md:mb-8" />
              <div className="relative mb-4 md:mb-6">
                <svg className="w-28 h-28 md:w-32 md:h-32 transform -rotate-90">
                  <circle cx="50%" cy="50%" r="44%" stroke="rgba(18,18,18,0.1)" strokeWidth="12" fill="none" />
                  <circle cx="50%" cy="50%" r="44%" stroke={result.readinessScore >= 80 ? 'var(--profit)' : result.readinessScore >= 50 ? 'var(--warning)' : 'var(--loss)'} strokeWidth="12" fill="none" strokeDasharray="351.8" strokeDashoffset={351.8 - (351.8 * result.readinessScore) / 100} className="transition-all duration-1000 ease-out" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-3xl md:text-4xl font-black text-[#121212] font-display">{result.readinessScore}</span>
                </div>
              </div>
              <div className={`px-3 py-1.5 border-2 border-[#121212] text-[11px] md:text-[12px] font-extrabold uppercase tracking-widest shadow-[2px_2px_0px_0px_#121212] ${result.readinessScore >= 80 ? 'bg-[var(--profit-dim)] text-[var(--profit)]' : result.readinessScore >= 50 ? 'bg-[var(--warning-dim)] text-[var(--warning)]' : 'bg-[var(--loss-dim)] text-[var(--loss)]'}`}>
                {result.readinessLabel}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <MetricCard title="Estimated Payout" value={result.estimatedPayout ? formatUsd(result.estimatedPayout) : '$0.00'} icon={DollarSign} valueColorClass="profit" subtitle={`${config.payoutSplitPct}% Split`} />
            <MetricCard title="Min. Trading Days" value={`${result.tradingDaysCount} / ${config.minTradingDays}`} icon={Activity} valueColorClass={result.passedMinDays ? 'profit' : 'warning'} />
            <MetricCard title="Simulated Balance" value={formatUsd(result.currentBalance)} icon={DollarSign} glow={true} />
            <MetricCard title="Max Drawdown" value={formatPercent(-result.maxTotalDrawdownPct)} icon={AlertTriangle} valueColorClass={result.failedTotalDrawdown ? 'loss' : 'dark'} subtitle={`Limit: -${config.maxTotalDrawdownPct}%`} />
          </div>
        </>
      )}
    </div>
  );
}
