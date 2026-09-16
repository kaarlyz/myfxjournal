import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Activity, AlertTriangle, Bot, Camera, Check, Cpu, Pause, Play, RefreshCcw, Send, Settings2, Shield, X, Code, Terminal as TerminalIcon, Archive } from 'lucide-react';
import { PageHeader, SectionLabel } from '../components/ui/SectionLabel';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { apiUrl, defaultHeaders } from '../utils/api';

type ParamSchema = { key: string; label: string; type: 'mode' | 'number' | 'boolean' | 'text'; min?: number; step?: number };
type Template = { id: string; name: string; fileName: string; templateName?: string | null; category?: string | null; description?: string | null; defaultSymbol?: string | null; defaultTimeframe?: string | null; defaultMode?: string | null; parameterFamily?: string; parameterSchema?: ParamSchema[] };
type Instance = { id: string; symbol: string; timeframe: string; chartId?: string | null; mode: string; status: string; terminalId: string; lastHeartbeatAt?: string | null; config?: any };
type Terminal = { terminalId: string; accountNumber?: string | null; broker?: string | null; server?: string | null; balance?: number | null; equity?: number | null; freeMargin?: number | null; eaName?: string | null; symbol?: string | null; timeframe?: string | null; chartId?: string | null; timestamp: string; online: boolean; activeChartCount?: number | null; symbolCount?: number; chartCount?: number };
type SymbolData = { terminalId: string; symbols: string[]; updatedAt?: string | null };
type ChartData = { terminalId: string; charts: Array<{ chartId?: string; symbol?: string; timeframe?: string }>; updatedAt?: string | null };
type Signal = { id: string; approvalCode: string; eaName: string; symbol: string; timeframe: string; side: string; entry?: number | null; sl?: number | null; tp?: number | null; rr?: number | null; riskPercent?: number | null; lot?: number | null; reason?: string | null; status: string; expiresAt?: string | null };

function fmtDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', { hour12: false });
}

function fmtMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'USD' }).format(value);
}

function maskAccount(value?: string | null) {
  if (!value) return '-';
  return value.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function getStatusBadgeVariant(status?: string | null) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'SUCCESS' || raw === 'EXECUTED' || raw === 'ONLINE' || raw === 'EA_ONLINE') return 'profit';
  if (raw === 'FAILED' || raw === 'FAILED_TIMEOUT' || raw === 'REJECTED' || raw === 'EXPIRED' || raw === 'OFFLINE' || raw === 'CANCELLED' || raw === 'WARNING' || raw === 'BLOCKED_BY_ACTIVE_COMMAND') return 'loss';
  if (raw === 'QUEUED' || raw === 'EXECUTING' || raw === 'WAITING_MT5_CONTROLLER' || raw === 'WAITING_EA_HEARTBEAT' || raw === 'TEMPLATE_APPLY_REQUESTED' || raw === 'WAITING_CONTROLLER') return 'warning';
  return 'neutral';
}

function commandStatusLabel(status?: string | null, _requiresConfirmation?: boolean | null) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'QUEUED') return 'QUEUED';
  if (raw === 'EXECUTING') return 'EXECUTING';
  if (raw === 'TEMPLATE_APPLY_REQUESTED') return 'Template apply requested';
  if (raw === 'WAITING_EA_HEARTBEAT') return 'Waiting EA heartbeat';
  if (raw === 'EA_ONLINE') return 'EA online';
  if (raw === 'WARNING' || raw === 'FAILED' || raw === 'FAILED_TIMEOUT' || raw === 'REJECTED') return 'Failed with reason';
  if (raw === 'EXPIRED') return 'EXPIRED';
  if (raw === 'CANCELLED') return 'CANCELLED';
  if (raw === 'BLOCKED_BY_ACTIVE_COMMAND') return 'BLOCKED_BY_ACTIVE_COMMAND';
  if (raw === 'SUCCESS') return 'SUCCESS';
  return 'Command queued';
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor((seconds / 3600) % 24);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function commandAgeSeconds(command: any, now: number) {
  const pickedAt = command?.pickedAt ? new Date(command.pickedAt).getTime() : 0;
  const executedAt = command?.executedAt ? new Date(command.executedAt).getTime() : 0;
  const createdAt = command?.createdAt ? new Date(command.createdAt).getTime() : now;
  const firstActiveAt = pickedAt || executedAt;
  if (!firstActiveAt) return Math.max(0, Math.floor((now - createdAt) / 1000));
  return Math.max(0, Math.floor((firstActiveAt - createdAt) / 1000));
}

function commandTargetText(command: any) {
  const payload = command.payload || {};
  const result = command.result || {};
  const requested = `${payload.symbol || '-'} ${payload.timeframe || ''}`.trim();
  const actual = result.actualChartSymbol || result.symbol || payload.symbol || '-';
  const actualTf = result.actualChartTimeframe || result.timeframe || payload.timeframe || '';
  const target = `${requested} -> ${actual} ${actualTf}`.trim();
  const chart = result.chartId || payload.chartId ? ` · chart ${result.chartId || payload.chartId}` : '';
  const template = result.templateName || payload.templateName || payload.fileName ? ` · template ${result.templateName || payload.templateName || payload.fileName}` : '';
  return `${target}${chart}${template}`;
}

export default function EAControlCenter() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [commands, setCommands] = useState<any[]>([]);
  const [symbolData, setSymbolData] = useState<SymbolData>({ terminalId: '', symbols: [] });
  const [chartData, setChartData] = useState<ChartData>({ terminalId: '', charts: [] });
  const [symbolFilter, setSymbolFilter] = useState('');
  const [useCustomSymbol, setUseCustomSymbol] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedInstance, setSelectedInstance] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('M5');
  const [mode, setMode] = useState('NOTIFY_ONLY');
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<any>({ mode: 'NOTIFY_ONLY', riskPercent: 0.5, rr: 2, allowBuy: true, allowSell: true, takeScreenshotOnSignal: true, panelWidth: 360, compactPanel: false, showZones: true, showStats: true });
  const [now, setNow] = useState(Date.now());

  const stateRef = useRef({ selectedTerminalId, selectedInstance });
  useEffect(() => {
    stateRef.current = { selectedTerminalId, selectedInstance };
  }, [selectedTerminalId, selectedInstance]);

  const selectedTerminal = useMemo(() => terminals.find(t => t.terminalId === selectedTerminalId) || terminals[0], [terminals, selectedTerminalId]);
  const activeInstance = useMemo(() => instances.find(i => i.id === selectedInstance) || instances[0], [instances, selectedInstance]);
  const selectedTemplateRow = useMemo(() => templates.find(t => t.id === selectedTemplate) || templates[0], [templates, selectedTemplate]);
  const activeTemplate = useMemo(() => {
    const byInstance = activeInstance ? templates.find(t => activeInstance.config?.templateId === t.id || activeInstance.status?.toLowerCase().includes(t.name.toLowerCase())) : undefined;
    return byInstance || selectedTemplateRow;
  }, [activeInstance, selectedTemplateRow, templates]);
  const configSchema = activeTemplate?.parameterSchema || [];
  const runtimeConfigEnabled = Boolean(activeInstance);
  const visibleSymbols = useMemo(() => {
    const filter = symbolFilter.trim().toUpperCase();
    return (filter ? symbolData.symbols.filter(s => s.toUpperCase().includes(filter)) : symbolData.symbols).slice(0, 250);
  }, [symbolData.symbols, symbolFilter]);

  const loadSymbols = async (terminalId: string) => {
    if (!terminalId) return;
    const res = await fetch(apiUrl(`/ea-control/symbols?terminalId=${encodeURIComponent(terminalId)}`), {
      headers: defaultHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json();
    setSymbolData({ terminalId: data.terminalId || terminalId, symbols: data.symbols || [], updatedAt: data.updatedAt });
  };

  const loadCharts = async (terminalId: string) => {
    if (!terminalId) return;
    const res = await fetch(apiUrl(`/ea-control/charts?terminalId=${encodeURIComponent(terminalId)}`), {
      headers: defaultHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json();
    setChartData({ terminalId: data.terminalId || terminalId, charts: data.charts || [], updatedAt: data.updatedAt });
  };

  const load = async () => {
    setLoading(true);
    try {
      const [tplRes, terminalRes, instanceRes, signalRes, logRes, commandRes] = await Promise.all([
        fetch(apiUrl('/ea-control/templates'), { headers: defaultHeaders() }),
        fetch(apiUrl('/ea-control/terminals'), { headers: defaultHeaders() }),
        fetch(apiUrl('/ea-control/instances'), { headers: defaultHeaders() }),
        fetch(apiUrl('/ea-control/signals'), { headers: defaultHeaders() }),
        fetch(apiUrl('/ea-control/command-logs'), { headers: defaultHeaders() }),
        fetch(apiUrl('/ea-control/commands'), { headers: defaultHeaders() }),
      ]);
      
      let nextTerminalId = stateRef.current.selectedTerminalId;
      if (terminalRes.ok) {
        const data = await terminalRes.json();
        setTerminals(data.terminals || []);
        const primary = stateRef.current.selectedTerminalId || (data.terminals || [])[0]?.terminalId;
        if (primary && primary !== stateRef.current.selectedTerminalId) {
          setSelectedTerminalId(primary);
        }
        nextTerminalId = primary;
      }
      if (tplRes.ok) setTemplates((await tplRes.json()).templates || []);
      if (instanceRes.ok) {
        const data = await instanceRes.json();
        setInstances(data.instances || []);
        if (!stateRef.current.selectedInstance && data.instances?.[0]) setSelectedInstance(data.instances[0].id);
      }
      if (signalRes.ok) setSignals((await signalRes.json()).signals || []);
      if (logRes.ok) setLogs((await logRes.json()).logs || []);
      if (commandRes.ok) setCommands((await commandRes.json()).commands || []);

      if (nextTerminalId) {
        await Promise.all([loadSymbols(nextTerminalId), loadCharts(nextTerminalId)]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (selectedTerminal?.terminalId) {
      loadSymbols(selectedTerminal.terminalId);
      loadCharts(selectedTerminal.terminalId);
    }
  }, [selectedTerminalId]);
  
  const activeInstanceConfigStr = JSON.stringify(activeInstance?.config || {});
  useEffect(() => {
    if (runtimeConfigEnabled && activeInstance?.config) {
      setConfig((prev: any) => ({ ...prev, ...activeInstance.config }));
    }
  }, [activeInstance?.id, runtimeConfigEnabled, activeInstanceConfigStr]);

  const scanTemplates = async () => {
    const res = await fetch(apiUrl('/ea-control/templates/scan'), {
      method: 'POST',
      headers: defaultHeaders(),
    });
    const data = await res.json();
    setTemplates(data.templates || []);
    setMessage(`Scanned ${data.templates?.length || 0} EA templates.`);
  };

  const queueCommand = async (commandType: string, payload: any, requiresConfirmation = false) => {
    const res = await fetch(apiUrl('/ea-control/commands'), {
      method: 'POST',
      headers: defaultHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId: selectedTerminalId || activeInstance?.terminalId, commandType, payload, requiresConfirmation, source: 'WEBSITE' }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setMessage(data.error || 'Failed to queue command.');
      return;
    }
    const label = commandStatusLabel(data.command?.status, data.command?.requiresConfirmation);
    setMessage(`Command queued: ${label}.`);
    load();
  };

  const attach = async () => {
    const template = selectedTemplateRow;
    if (!selectedTerminal) return setMessage('Attach ReplayFX_MT5_Controller to one MT5 chart first.');
    if (!template) return setMessage('Scan or select an EA template first.');
    if (!useCustomSymbol && !symbolData.symbols.length) return setMessage('Load broker symbols from MT5 first, or enable Custom Symbol.');
    if (!symbol.trim()) return setMessage('Select a broker symbol first.');
    await queueCommand('APPLY_TEMPLATE', { templateId: template.id, templateName: template.templateName, fileName: template.fileName, symbol, timeframe, mode }, false);
  };

  const requestSymbols = async () => {
    if (!selectedTerminal) return setMessage('Attach ReplayFX_MT5_Controller to MT5 first to load broker symbols.');
    await queueCommand('LIST_SYMBOLS', {}, false);
  };

  const requestCharts = async () => {
    if (!selectedTerminal) return setMessage('Attach ReplayFX_MT5_Controller to MT5 first to load active charts.');
    await queueCommand('LIST_CHARTS', {}, false);
  };

  const screenshot = async () => {
    if (!selectedTerminal) return setMessage('Attach ReplayFX_MT5_Controller to MT5 first before queuing screenshots.');
    if (!symbol.trim()) return setMessage('Select a broker symbol first for screenshot target.');
    await queueCommand('SCREENSHOT_CHART', { symbol, timeframe, width: 1280, height: 720 }, false);
  };

  const saveConfig = async () => {
    if (!activeInstance) return;
    const res = await fetch(apiUrl(`/ea-control/instances/${activeInstance.id}/config`), {
      method: 'POST',
      headers: defaultHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...config, source: 'WEBSITE' }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Runtime config saved. UPDATE_CONFIG command logged: ${data.commandId || '-'}.` : data.error || 'Failed to save config.');
    load();
  };

  const decideSignal = async (signal: Signal, action: 'approve' | 'reject' | 'dismiss') => {
    await fetch(apiUrl(`/ea-control/signals/${signal.id}/${action}`), {
      method: 'POST',
      headers: defaultHeaders(),
    });
    load();
  };
  
  const dismissAllSignals = async () => {
    const pending = signals.filter(s => s.status === 'PENDING');
    if (!pending.length) return;
    await Promise.all(pending.map(s => 
      fetch(apiUrl(`/ea-control/signals/${s.id}/dismiss`), {
        method: 'POST',
        headers: defaultHeaders(),
      })
    ));
    load();
  };

  const cancelCommand = async (command: any) => {
    const res = await fetch(apiUrl(`/ea-control/commands/${command.id}/cancel`), {
      method: 'POST',
      headers: defaultHeaders(),
    });
    setMessage(res.ok ? `Command cancelled: ${command.commandType}` : 'Command cancellation failed.');
    load();
  };

  const cancelPendingCommands = async () => {
    const terminalId = selectedTerminalId || activeInstance?.terminalId;
    if (!terminalId) return setMessage('Select a terminal before cancelling pending commands.');
    const res = await fetch(apiUrl('/ea-control/commands/cancel-pending'), {
      method: 'POST',
      headers: defaultHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Cancelled ${data.count || 0} pending commands for ${terminalId}.` : data.error || 'Failed to cancel pending commands.');
    load();
  };

  const updateConfigValue = (param: ParamSchema, raw: any) => {
    const value = param.type === 'number' ? (raw === '' ? '' : Number(raw)) : param.type === 'boolean' ? Boolean(raw) : raw;
    setConfig({ ...config, [param.key]: value });
  };

  const commandResultText = (command: any) => {
    const result = command.result || {};
    const message = result.message || result.error || result.filePath || result.url || result.chartId || result.templateName || '-';
    if (command.status === 'WARNING' && (!result.message || (typeof result.message === 'string' && result.message.includes('heartbeat')))) return 'Template applied, but EA heartbeat was not detected.';
    return message;
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <PageHeader 
          label="Bridge"
          title="EA Control Center"
          subtitle="Controller infrastructure: heartbeat, symbols, charts, command queue, template attach, and screenshots."
          labelColor="dark"
        />
        <Button onClick={load} disabled={loading} variant="secondary">
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      {message && (
        <div className="bg-[var(--warning-dim)] border-4 border-[var(--warning)] text-[#121212] p-4 shadow-[4px_4px_0px_0px_var(--warning)] flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={2.5} />
          <span className="text-[13px] font-extrabold uppercase tracking-widest">{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <section className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col max-h-[600px]">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-4 border-[#121212]">
            <h2 className="font-black text-[16px] text-[#121212] uppercase tracking-wide flex items-center gap-2">
              <Bot className="w-6 h-6" /> EA Library
            </h2>
            <Button onClick={scanTemplates} variant="secondary" className="py-1 px-3 text-[10px]">
              <RefreshCcw className="w-3 h-3 mr-1" /> Scan
            </Button>
          </div>
          <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
            {templates.map(t => (
              <button 
                key={t.id} 
                onClick={() => setSelectedTemplate(t.id)} 
                className={`w-full text-left p-4 border-2 transition-all ${
                  selectedTemplate === t.id 
                    ? 'border-[#121212] bg-[#F0F0F0] shadow-[4px_4px_0px_0px_#121212] -translate-y-0.5' 
                    : 'border-[#121212] bg-white hover:bg-[#F0F0F0] hover:shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-0.5'
                }`}
              >
                <div className="font-black text-[14px] text-[#121212] uppercase tracking-wide">{t.name}</div>
                <div className="text-[10px] font-extrabold text-[#1040C0] uppercase tracking-widest mt-1">
                  {t.category || 'EA'} · {t.defaultMode || 'NOTIFY_ONLY'}
                </div>
                <div className="text-[10px] font-bold text-[#717182] font-mono mt-1 break-all bg-white border border-[#121212] px-1 py-0.5 inline-block">
                  {t.templateName || t.fileName}
                </div>
                {t.description && <p className="text-[11px] font-bold text-[#717182] mt-2">{t.description}</p>}
              </button>
            ))}
            {!templates.length && (
              <div className="text-center py-8 border-2 border-dashed border-[#121212] bg-[#F0F0F0]">
                <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wide">No templates scanned.</p>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col max-h-[600px]">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-4 border-[#121212]">
            <h2 className="font-black text-[16px] text-[#121212] uppercase tracking-wide flex items-center gap-2">
              <Cpu className="w-6 h-6" /> Terminal Status
            </h2>
          </div>
          <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
            {!terminals.length && (
              <div className="text-center py-8 border-2 border-dashed border-[#121212] bg-[#F0F0F0]">
                <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wide">Attach MT5 Controller first.</p>
              </div>
            )}
            {terminals.map(t => (
              <div key={`${t.terminalId}-${t.timestamp}`} className="border-2 border-[#121212] bg-[#F0F0F0] p-4 shadow-[4px_4px_0px_0px_#121212]">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-black text-[14px] text-[#121212] bg-white border-2 border-[#121212] px-2 py-0.5">{t.terminalId}</span>
                  <Badge variant={t.online ? 'profit' : 'loss'}>{t.online ? 'ONLINE' : 'OFFLINE'}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-[#121212] mb-3">
                  <div className="bg-white border border-[#121212] p-2">
                    <span className="block text-[9px] text-[#717182] uppercase tracking-widest font-extrabold mb-0.5">Account</span>
                    {maskAccount(t.accountNumber)}
                  </div>
                  <div className="bg-white border border-[#121212] p-2">
                    <span className="block text-[9px] text-[#717182] uppercase tracking-widest font-extrabold mb-0.5">Broker</span>
                    <span className="truncate block" title={`${t.broker || '-'} - ${t.server || '-'}`}>{t.broker || '-'}</span>
                  </div>
                  <div className="bg-white border border-[#121212] p-2">
                    <span className="block text-[9px] text-[#717182] uppercase tracking-widest font-extrabold mb-0.5">Balance / Equity</span>
                    <span className="font-number">{fmtMoney(t.balance)} / {fmtMoney(t.equity)}</span>
                  </div>
                  <div className="bg-white border border-[#121212] p-2">
                    <span className="block text-[9px] text-[#717182] uppercase tracking-widest font-extrabold mb-0.5">Symbols / Charts</span>
                    <span className="font-number">{t.symbolCount ?? symbolData.symbols.length} / {t.activeChartCount ?? t.chartCount ?? chartData.charts.length}</span>
                  </div>
                </div>
                <div className="text-[10px] text-[#717182] font-extrabold uppercase tracking-widest">
                  Last HB: <span className="text-[#121212]">{fmtDate(t.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-4 border-[#121212]">
            <h2 className="font-black text-[16px] text-[#121212] uppercase tracking-wide flex items-center gap-2">
              <Send className="w-6 h-6" /> Attach EA
            </h2>
          </div>
          <div className="bg-[var(--warning-dim)] border-2 border-[var(--warning)] p-3 mb-6 text-[11px] font-extrabold text-[#121212] uppercase tracking-wider leading-relaxed shadow-[4px_4px_0px_0px_var(--warning)]">
            <AlertTriangle className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-[var(--warning)]" strokeWidth={3} />
            EA may trade immediately. Disable AutoTrading or use PAUSED mode if testing.
          </div>
          
          <div className="space-y-4 flex-1">
            <div>
              <label className="block text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1.5">Terminal Target</label>
              <select 
                value={selectedTerminalId} 
                onChange={e => setSelectedTerminalId(e.target.value)} 
                className="w-full bg-[#F0F0F0] border-2 border-[#121212] py-2.5 px-3 text-[#121212] text-[13px] font-black uppercase tracking-wider outline-none focus:border-[#1040C0]"
              >
                <option value="">Select terminal...</option>
                {terminals.map(t => <option key={t.terminalId} value={t.terminalId}>{t.terminalId}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1.5">EA Template</label>
              <select 
                value={selectedTemplate} 
                onChange={e => setSelectedTemplate(e.target.value)} 
                className="w-full bg-[#F0F0F0] border-2 border-[#121212] py-2.5 px-3 text-[#121212] text-[13px] font-black uppercase tracking-wider outline-none focus:border-[#1040C0]"
              >
                <option value="">Select template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            
            <div className="p-4 border-2 border-dashed border-[#121212] bg-white space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-[#121212] uppercase tracking-widest">Target Symbol</label>
                <label className="flex items-center gap-2 text-[10px] font-extrabold text-[#717182] uppercase tracking-widest cursor-pointer hover:text-[#121212]">
                  <input type="checkbox" checked={useCustomSymbol} onChange={e => setUseCustomSymbol(e.target.checked)} className="accent-[#121212] w-4 h-4 cursor-pointer" />
                  Custom
                </label>
              </div>
              
              {!useCustomSymbol ? (
                <div className="space-y-3">
                  <input 
                    value={symbolFilter} 
                    onChange={e => setSymbolFilter(e.target.value)} 
                    className="w-full bg-white border-2 border-[#121212] py-2 px-3 text-[12px] font-bold text-[#121212] outline-none focus:border-[#1040C0]" 
                    placeholder="Search MT5 symbols..." 
                  />
                  <select 
                    value={symbol} 
                    onChange={e => setSymbol(e.target.value)} 
                    className="w-full bg-[#F0F0F0] border-2 border-[#121212] py-2.5 px-3 text-[#121212] text-[13px] font-black uppercase tracking-wider outline-none focus:border-[#1040C0]" 
                    disabled={!symbolData.symbols.length}
                  >
                    <option value="">{symbolData.symbols.length ? 'Select symbol...' : 'No symbols loaded.'}</option>
                    {visibleSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ) : (
                <input 
                  value={symbol} 
                  onChange={e => setSymbol(e.target.value.toUpperCase())} 
                  className="w-full bg-[#F0F0F0] border-2 border-[#121212] py-2.5 px-3 text-[#121212] text-[13px] font-black uppercase tracking-wider outline-none focus:border-[#1040C0]" 
                  placeholder="e.g. XAUUSD" 
                />
              )}
              
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button onClick={requestSymbols} disabled={!selectedTerminal} variant="secondary" className="py-1.5 px-2 text-[10px]">
                  <RefreshCcw className="w-3 h-3 mr-1" /> Load Sym
                </Button>
                <Button onClick={requestCharts} disabled={!selectedTerminal} variant="secondary" className="py-1.5 px-2 text-[10px]">
                  <Activity className="w-3 h-3 mr-1" /> Load Chart
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1.5">Timeframe</label>
                <select 
                  value={timeframe} 
                  onChange={e => setTimeframe(e.target.value)} 
                  className="w-full bg-[#F0F0F0] border-2 border-[#121212] py-2.5 px-3 text-[#121212] text-[13px] font-black uppercase tracking-wider outline-none focus:border-[#1040C0]"
                >
                  {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map(tf => <option key={tf}>{tf}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1.5">Mode</label>
                <select 
                  value={mode} 
                  onChange={e => setMode(e.target.value)} 
                  className="w-full bg-[#F0F0F0] border-2 border-[#121212] py-2.5 px-3 text-[#121212] text-[13px] font-black uppercase tracking-wider outline-none focus:border-[#1040C0]"
                >
                  {['AUTO', 'NOTIFY_ONLY', 'APPROVAL_REQUIRED', 'PAUSED'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>
          
          <div className="pt-6 mt-6 border-t-4 border-[#121212]">
            <Button 
              onClick={attach} 
              disabled={!selectedTerminal || !selectedTemplate || (!useCustomSymbol && !symbolData.symbols.length) || !symbol} 
              variant="dark" 
              className="w-full"
            >
              <Send className="w-4 h-4 mr-2" /> Queue Attach
            </Button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-4 border-[#121212]">
            <h2 className="font-black text-[16px] text-[#121212] uppercase tracking-wide flex items-center gap-2">
              <Activity className="w-6 h-6" /> Active EA Instances
            </h2>
          </div>
          <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            {!instances.length && (
              <div className="text-center py-8 border-2 border-dashed border-[#121212] bg-[#F0F0F0]">
                <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wide">No active EA instances detected.</p>
              </div>
            )}
            {instances.map(i => (
              <button 
                key={i.id} 
                onClick={() => setSelectedInstance(i.id)} 
                className={`w-full text-left p-4 border-2 transition-all ${
                  activeInstance?.id === i.id 
                    ? 'border-[#121212] bg-[#F0F0F0] shadow-[4px_4px_0px_0px_#1040C0] -translate-y-0.5' 
                    : 'border-[#121212] bg-white hover:bg-[#F0F0F0] hover:shadow-[4px_4px_0px_0px_#121212] hover:-translate-y-0.5'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-black text-[16px] text-[#121212] uppercase tracking-wide">{i.symbol} <span className="text-[#1040C0]">{i.timeframe}</span></span>
                  <Badge variant={i.mode === 'PAUSED' ? 'warning' : 'profit'}>{i.mode}</Badge>
                </div>
                <div className="text-[11px] font-extrabold text-[#717182] uppercase tracking-widest mt-2 flex justify-between">
                  <span>{i.status} · Chart {i.chartId || '-'}</span>
                  <span>{fmtDate(i.lastHeartbeatAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-[#F0F0F0] border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-4 border-[#121212]">
            <h2 className="font-black text-[16px] text-[#121212] uppercase tracking-wide flex items-center gap-2">
              <Settings2 className="w-6 h-6" /> Runtime Config
            </h2>
          </div>
          
          <div className="flex-1 space-y-6">
            {!runtimeConfigEnabled ? (
              <div className="text-center py-8 border-2 border-dashed border-[#121212] bg-white">
                <p className="text-[12px] font-bold text-[#717182] uppercase tracking-wide px-4">Config enabled after EA instance heartbeat is received.</p>
              </div>
            ) : (
              <>
                <p className="text-[12px] font-black text-[#121212] uppercase tracking-widest bg-white inline-block px-3 py-1 border-2 border-[#121212] shadow-[2px_2px_0px_0px_#121212]">
                  {activeTemplate ? `${activeTemplate.name} Options` : 'Unknown EA'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                  {configSchema.length === 0 ? (
                    <div className="col-span-2 text-[12px] font-bold text-[#717182] italic">No parameters defined.</div>
                  ) : configSchema.map(param => {
                    if (param.type === 'mode') {
                      return (
                        <div key={param.key}>
                          <label className="block text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1.5">{param.label}</label>
                          <select 
                            value={config[param.key] || 'NOTIFY_ONLY'} 
                            onChange={e => updateConfigValue(param, e.target.value)} 
                            className="w-full bg-white border-2 border-[#121212] py-2 px-3 text-[#121212] text-[12px] font-black uppercase tracking-wider outline-none focus:border-[#1040C0] shadow-[2px_2px_0px_0px_#121212]"
                          >
                            {['AUTO', 'NOTIFY_ONLY', 'APPROVAL_REQUIRED', 'PAUSED'].map(m => <option key={m}>{m}</option>)}
                          </select>
                        </div>
                      );
                    }
                    if (param.type === 'boolean') {
                      return (
                        <label key={param.key} className="flex items-center gap-3 bg-white border-2 border-[#121212] p-3 shadow-[2px_2px_0px_0px_#121212] cursor-pointer hover:bg-[#F0F0F0] transition-colors mt-auto">
                          <input 
                            type="checkbox" 
                            checked={Boolean(config[param.key])} 
                            onChange={e => updateConfigValue(param, e.target.checked)} 
                            className="accent-[#121212] w-5 h-5"
                          />
                          <span className="text-[12px] font-black text-[#121212] uppercase tracking-wider">{param.label}</span>
                        </label>
                      );
                    }
                    return (
                      <div key={param.key}>
                        <label className="block text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-1.5">{param.label}</label>
                        <input 
                          type={param.type === 'number' ? 'number' : 'text'} 
                          min={param.min} 
                          step={param.step} 
                          value={config[param.key] ?? ''} 
                          onChange={e => updateConfigValue(param, e.target.value)} 
                          className="w-full bg-white border-2 border-[#121212] py-2 px-3 text-[#121212] text-[12px] font-black font-number outline-none focus:border-[#1040C0] shadow-[2px_2px_0px_0px_#121212]" 
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          
          <div className="pt-6 mt-6 border-t-4 border-[#121212] flex flex-wrap gap-3">
            <Button onClick={saveConfig} disabled={!runtimeConfigEnabled} variant="blue" className="flex-1">
              <Check className="w-4 h-4 mr-1.5" /> Save
            </Button>
            <Button onClick={screenshot} disabled={!runtimeConfigEnabled} variant="secondary" className="flex-1">
              <Camera className="w-4 h-4 mr-1.5" /> Shot
            </Button>
            <Button 
              onClick={() => setConfig({ ...config, mode: config.mode === 'PAUSED' ? 'NOTIFY_ONLY' : 'PAUSED' })} 
              disabled={!runtimeConfigEnabled} 
              variant={config.mode === 'PAUSED' ? 'profit' : 'warning'}
              className="flex-1"
            >
              {config.mode === 'PAUSED' ? <Play className="w-4 h-4 mr-1.5" /> : <Pause className="w-4 h-4 mr-1.5" />}
              {config.mode === 'PAUSED' ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </section>
      </div>

      <section className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212]">
        <div className="flex items-center justify-between mb-6 pb-4 border-b-4 border-[#121212]">
          <h2 className="font-black text-[16px] text-[#121212] uppercase tracking-wide flex items-center gap-2">
            <Shield className="w-6 h-6" /> Signal Approval Queue
          </h2>
          <Button onClick={dismissAllSignals} disabled={!signals.some(s => s.status === 'PENDING')} variant="secondary" className="py-1.5 px-3 text-[11px]">
            <Archive className="w-3.5 h-3.5 mr-1.5" /> Dismiss All
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {signals.filter(s => s.status === 'PENDING').map(s => (
            <div key={s.id} className="bg-[#F0F0F0] border-4 border-[#121212] p-5 shadow-[6px_6px_0px_0px_#121212] flex flex-col">
              <div className="flex justify-between items-center mb-4 pb-3 border-b-2 border-dashed border-[#121212]">
                <span className="font-black text-[14px] text-[#121212] uppercase tracking-wide bg-white px-2 py-0.5 border-2 border-[#121212]">{s.eaName}</span>
                <Badge variant={s.side === 'BUY' ? 'profit' : 'loss'}>{s.side}</Badge>
              </div>
              <div className="text-[12px] font-black text-[#121212] mb-3">{s.symbol} <span className="text-[#1040C0]">{s.timeframe}</span></div>
              
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white border-2 border-[#121212] p-2 text-center">
                  <span className="block text-[8px] font-extrabold text-[#717182] uppercase tracking-widest mb-1">Entry</span>
                  <span className="font-black font-number text-[11px]">{s.entry ?? '-'}</span>
                </div>
                <div className="bg-white border-2 border-[#121212] p-2 text-center">
                  <span className="block text-[8px] font-extrabold text-[#717182] uppercase tracking-widest mb-1">SL</span>
                  <span className="font-black font-number text-[11px] text-[var(--loss)]">{s.sl ?? '-'}</span>
                </div>
                <div className="bg-white border-2 border-[#121212] p-2 text-center">
                  <span className="block text-[8px] font-extrabold text-[#717182] uppercase tracking-widest mb-1">TP</span>
                  <span className="font-black font-number text-[11px] text-[var(--profit)]">{s.tp ?? '-'}</span>
                </div>
              </div>
              
              <div className="text-[10px] font-extrabold text-[#717182] uppercase tracking-widest mb-4">
                Risk: {s.riskPercent ?? '-'}% · Lot: {s.lot ?? '-'} · RR: {s.rr ?? '-'}
              </div>
              
              <div className="bg-white border-l-4 border-l-[#1040C0] p-2 mb-6 shadow-inner text-[11px] font-bold text-[#121212]">
                "{s.reason || 'No reason provided'}"
              </div>
              
              <div className="flex gap-2 mt-auto">
                <Button onClick={() => decideSignal(s, 'approve')} variant="profit" className="flex-1 px-1">
                  <Check className="w-4 h-4 mr-1" /> Apprv
                </Button>
                <Button onClick={() => decideSignal(s, 'reject')} variant="danger" className="flex-1 px-1">
                  <X className="w-4 h-4 mr-1" /> Rjct
                </Button>
                <Button onClick={() => decideSignal(s, 'dismiss')} variant="secondary" className="flex-1 px-1">
                  <Archive className="w-4 h-4 mr-1" /> Dism
                </Button>
              </div>
            </div>
          ))}
          {!signals.some(s => s.status === 'PENDING') && (
            <div className="col-span-full py-10 border-4 border-dashed border-[#121212] bg-[#F0F0F0] text-center">
              <p className="text-[14px] font-black text-[#717182] uppercase tracking-widest">No pending signals to review.</p>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className="bg-[#121212] border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-4 border-[#333]">
            <h2 className="font-black text-[16px] text-white uppercase tracking-wide flex items-center gap-2">
              <TerminalIcon className="w-6 h-6 text-[#0ecb81]" /> Command Queue
            </h2>
            <Button onClick={cancelPendingCommands} disabled={!selectedTerminal} variant="danger" className="py-1 px-3 text-[10px]">
              <X className="w-3 h-3 mr-1" /> Clear Pending
            </Button>
          </div>
          
          <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            {!commands.length && <p className="text-[12px] font-bold text-[#717182] text-center py-6 border-2 border-dashed border-[#333]">No commands queued.</p>}
            {commands.map(c => {
              const label = commandStatusLabel(c.status, c.requiresConfirmation);
              const variant = getStatusBadgeVariant(c.status);
              const isDanger = variant === 'loss';
              const isWarn = variant === 'warning';
              
              return (
                <div key={c.id} className="bg-black border-2 border-[#333] p-4 text-[#eaecef]">
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-black text-[13px] uppercase tracking-wide text-[#1040C0] bg-[#1e2329] px-2 py-0.5">{c.commandType}</span>
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 border ${
                      isDanger ? 'border-[var(--loss)] text-[var(--loss)]' : 
                      isWarn ? 'border-[var(--warning)] text-[var(--warning)]' : 
                      'border-[var(--profit)] text-[var(--profit)]'
                    }`}>
                      {label}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono text-[#929aa5] mb-3">
                    <div>Term: <span className="text-[#eaecef]">{c.terminalId || '-'}</span></div>
                    <div>Wait: <span className="text-[#eaecef]">{formatDuration(commandAgeSeconds(c, now))}</span></div>
                    <div className="col-span-2 truncate" title={commandTargetText(c)}>Tgt: <span className="text-[#eaecef]">{commandTargetText(c)}</span></div>
                  </div>
                  
                  <div className="text-[11px] font-bold text-[#717182] bg-[#1e2329] p-2 border border-[#333] mb-3">
                    {commandResultText(c)}
                  </div>
                  
                  {['QUEUED', 'EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED', 'BLOCKED_BY_ACTIVE_COMMAND'].includes(c.status) && (
                    <button onClick={() => cancelCommand(c)} className="w-full text-center py-1.5 mt-2 bg-transparent border border-[#f6465d] text-[#f6465d] text-[10px] font-extrabold uppercase tracking-widest hover:bg-[#f6465d] hover:text-white transition-colors">
                      Cancel Command
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border-4 border-[#121212] p-6 shadow-[8px_8px_0px_0px_#121212] flex flex-col">
          <h2 className="font-black text-[16px] text-[#121212] uppercase tracking-wide flex items-center gap-2 mb-6 pb-4 border-b-4 border-[#121212]">
            <Code className="w-6 h-6" /> System Log
          </h2>
          <div className="bg-[#121212] p-4 font-mono text-[10px] h-[500px] overflow-y-auto custom-scrollbar border-4 border-[#121212] shadow-inner space-y-1.5">
            {!logs.length && <p className="text-[#717182] font-bold">No system logs.</p>}
            {logs.map(l => (
              <div key={l.id} className="flex flex-wrap gap-2 text-[#a0a0a0] leading-tight break-all border-b border-[#333] pb-1.5 last:border-0">
                <span className="text-[#717182] whitespace-nowrap">{fmtDate(l.createdAt).split(' ')[1]}</span>
                <span className="text-[#1040C0] font-bold">{l.source}</span>
                <span className={l.status === 'SUCCESS' ? 'text-[#0ecb81]' : l.status === 'ERROR' || l.status === 'FAILED' ? 'text-[var(--loss)]' : 'text-[var(--warning)]'}>[{l.status}]</span>
                <span className="text-[#eaecef]">{l.command}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      
      <section className="bg-[#F0F0F0] border-4 border-[#121212] p-8 shadow-[8px_8px_0px_0px_#121212]">
        <SectionLabel label="ReplayFX Controller Info" shape="square" color="blue" className="mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px] font-bold text-[#717182] leading-relaxed">
          <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
            Controller EA harus dipasang di satu chart MT5 dan URL backend harus diizinkan di Tools - Options - Expert Advisors - Allow WebRequest.
          </div>
          <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
            Attach EA memakai template approach: EA dikompilasi, chart dibuka manual sekali, EA dipasang dengan input, lalu chart disimpan sebagai .tpl.
          </div>
          <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
            Remote manual buy/sell, close all, dan modify SL/TP sengaja dinonaktifkan. Gunakan approval signal mode untuk kontrol yang aman.
          </div>
          <div className="bg-white border-2 border-[#121212] p-4 shadow-[4px_4px_0px_0px_#121212]">
            Runtime config hanya aktif setelah EA strategy instance mengirim heartbeat. Controller heartbeat hanya untuk infrastruktur.
          </div>
        </div>
      </section>
    </div>
  );
}
