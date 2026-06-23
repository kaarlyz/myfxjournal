import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Bot, Camera, Check, Clock, Cpu, FileText, Pause, Play, RefreshCcw, Send, Settings2, Shield, X } from 'lucide-react';

const API_BASE_URL = (import.meta as any).env.VITE_API_URL || '/api';

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

function statusClass(status?: string | null) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'SUCCESS' || raw === 'EXECUTED' || raw === 'ONLINE' || raw === 'EA_ONLINE') return 'text-[#0ecb81]';
  if (raw === 'FAILED' || raw === 'FAILED_TIMEOUT' || raw === 'REJECTED' || raw === 'EXPIRED' || raw === 'OFFLINE' || raw === 'CANCELLED' || raw === 'WARNING' || raw === 'BLOCKED_BY_ACTIVE_COMMAND') return 'text-[#f6465d]';
  if (raw === 'QUEUED' || raw === 'EXECUTING' || raw === 'WAITING_MT5_CONTROLLER' || raw === 'WAITING_EA_HEARTBEAT' || raw === 'TEMPLATE_APPLY_REQUESTED' || raw === 'WAITING_CONTROLLER') return 'text-[#fcd535]';
  return 'text-[#929aa5]';
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

function statusAgeSeconds(command: any, now: number) {
  const statusAt =
    command?.resultAt ? new Date(command.resultAt).getTime() :
    command?.cancelledAt ? new Date(command.cancelledAt).getTime() :
    command?.expiredAt ? new Date(command.expiredAt).getTime() :
    command?.executedAt ? new Date(command.executedAt).getTime() :
    command?.pickedAt ? new Date(command.pickedAt).getTime() :
    command?.createdAt ? new Date(command.createdAt).getTime() : now;
  return Math.max(0, Math.floor((now - statusAt) / 1000));
}

function expiryCountdown(command: any, now: number) {
  if (!command?.expiresAt) return '';
  const expiresAt = new Date(command.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return '';
  const remaining = Math.ceil((expiresAt - now) / 1000);
  return remaining > 0 ? `Expiry countdown: ${formatDuration(remaining)}` : 'Expiry countdown: expired';
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
  const [screenshots, setScreenshots] = useState<any[]>([]);
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

  const loadSymbols = async (terminalId?: string) => {
    const id = terminalId || selectedTerminalId || selectedTerminal?.terminalId;
    if (!id) return;
    const res = await fetch(`${API_BASE_URL}/ea-control/symbols?terminalId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = await res.json();
    setSymbolData({ terminalId: data.terminalId || id, symbols: data.symbols || [], updatedAt: data.updatedAt });
  };

  const loadCharts = async (terminalId?: string) => {
    const id = terminalId || selectedTerminalId || selectedTerminal?.terminalId;
    if (!id) return;
    const res = await fetch(`${API_BASE_URL}/ea-control/charts?terminalId=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = await res.json();
    setChartData({ terminalId: data.terminalId || id, charts: data.charts || [], updatedAt: data.updatedAt });
  };

  const load = async () => {
    setLoading(true);
    try {
      const [tplRes, terminalRes, instanceRes, signalRes, logRes, commandRes, screenshotRes] = await Promise.all([
        fetch(`${API_BASE_URL}/ea-control/templates`),
        fetch(`${API_BASE_URL}/ea-control/terminals`),
        fetch(`${API_BASE_URL}/ea-control/instances`),
        fetch(`${API_BASE_URL}/ea-control/signals`),
        fetch(`${API_BASE_URL}/ea-control/command-logs`),
        fetch(`${API_BASE_URL}/ea-control/commands`),
        fetch(`${API_BASE_URL}/ea-control/screenshots`),
      ]);
      if (tplRes.ok) setTemplates((await tplRes.json()).templates || []);
      if (terminalRes.ok) {
        const data = await terminalRes.json();
        setTerminals(data.terminals || []);
        const primary = selectedTerminalId || (data.terminals || [])[0]?.terminalId;
        if (primary) setSelectedTerminalId(primary);
      }
      if (instanceRes.ok) {
        const data = await instanceRes.json();
        setInstances(data.instances || []);
        if (!selectedInstance && data.instances?.[0]) setSelectedInstance(data.instances[0].id);
      }
      if (signalRes.ok) setSignals((await signalRes.json()).signals || []);
      if (logRes.ok) setLogs((await logRes.json()).logs || []);
      if (commandRes.ok) setCommands((await commandRes.json()).commands || []);
      if (screenshotRes.ok) setScreenshots((await screenshotRes.json()).screenshots || []);
      const terminalId = selectedTerminalId || selectedTerminal?.terminalId;
      if (terminalId) {
        await Promise.all([loadSymbols(terminalId), loadCharts(terminalId)]);
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
  useEffect(() => {
    if (runtimeConfigEnabled && activeInstance?.config) setConfig({ ...config, ...activeInstance.config });
  }, [activeInstance?.id, runtimeConfigEnabled]);

  const scanTemplates = async () => {
    const res = await fetch(`${API_BASE_URL}/ea-control/templates/scan`, { method: 'POST' });
    const data = await res.json();
    setTemplates(data.templates || []);
    setMessage(`Scanned ${data.templates?.length || 0} EA templates.`);
  };

  const queueCommand = async (commandType: string, payload: any, requiresConfirmation = false) => {
    const res = await fetch(`${API_BASE_URL}/ea-control/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API_BASE_URL}/ea-control/instances/${activeInstance.id}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, source: 'WEBSITE' }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Runtime config saved. UPDATE_CONFIG command logged: ${data.commandId || '-'}.` : data.error || 'Failed to save config.');
    load();
  };

  const decideSignal = async (signal: Signal, action: 'approve' | 'reject') => {
    await fetch(`${API_BASE_URL}/ea-control/signals/${signal.id}/${action}`, { method: 'POST' });
    load();
  };

  const cancelCommand = async (command: any) => {
    const res = await fetch(`${API_BASE_URL}/ea-control/commands/${command.id}/cancel`, { method: 'POST' });
    setMessage(res.ok ? `Command cancelled: ${command.commandType}` : 'Command cancellation failed.');
    load();
  };

  const cancelPendingCommands = async () => {
    const terminalId = selectedTerminalId || activeInstance?.terminalId;
    if (!terminalId) return setMessage('Select a terminal before cancelling pending commands.');
    const res = await fetch(`${API_BASE_URL}/ea-control/commands/cancel-pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Cancelled ${data.count || 0} pending commands for ${terminalId}.` : data.error || 'Failed to cancel pending commands.');
    load();
  };

  const downloadCommandDebugNote = (command: any) => {
    window.open(`${API_BASE_URL}/ea-control/commands/${command.id}/debug-note`, '_blank', 'noopener,noreferrer');
  };

  const updateConfigValue = (param: ParamSchema, raw: any) => {
    const value = param.type === 'number' ? (raw === '' ? '' : Number(raw)) : param.type === 'boolean' ? Boolean(raw) : raw;
    setConfig({ ...config, [param.key]: value });
  };

  const commandReason = (command: any) => {
    const label = commandStatusLabel(command.status, command.requiresConfirmation);
    const pendingAge = commandAgeSeconds(command, now);
    const result = command.result || {};
    const reason = result.error || result.message || '';
    if (label === 'BLOCKED_BY_ACTIVE_COMMAND') return `Blocked by active command. Waiting for active command to finish.`;
    if (label === 'QUEUED') {
      if (pendingAge > 15) return 'MT5 Controller has not picked this command yet.';
      return `Waiting MT5 controller. Expires ${fmtDate(command.expiresAt)}.`;
    }
    if (label === 'Template apply requested') return 'Template apply requested. Waiting EA heartbeat.';
    if (label === 'Waiting EA heartbeat') return 'Template apply requested. Waiting EA heartbeat.';
    if (label === 'EA online') return 'EA online.';
    if (label === 'Failed with reason') return `Failed with reason: ${reason || 'No detailed error returned by controller.'}`;
    if (label === 'EXPIRED') return `Failed with reason: Command expired ${fmtDate(command.expiresAt)}.`;
    if (label === 'CANCELLED') return 'Failed with reason: Command cancelled.';
    return '';
  };

  const commandResultText = (command: any) => {
    const result = command.result || {};
    const message = result.message || result.error || result.filePath || result.url || result.chartId || result.templateName || '-';
    if (command.status === 'WARNING' && (!result.message || String(result.message).includes('heartbeat'))) return 'Template applied, but EA heartbeat was not detected.';
    return message;
  };

  const heartbeatDiagnostics = (command: any) => {
    const result = command.result || {};
    if (command.commandType !== 'APPLY_TEMPLATE' || command.status !== 'WARNING') return null;
    const hasHeartbeatMessage = String(result.message || result.warning || '').toLowerCase().includes('heartbeat');
    if (!hasHeartbeatMessage) return null;
    const causes = Array.isArray(result.possibleReasons) && result.possibleReasons.length
      ? result.possibleReasons
      : [
        'Template does not contain the integrated EA',
        'EA .ex5 is missing/not compiled',
        'EA input token/backend URL is wrong',
        'EA failed OnInit',
        'EA heartbeat endpoint returned 401/400',
      ];
    return {
      requestedSymbol: result.requestedSymbol || command.payload?.symbol || '-',
      resolvedSymbol: result.resolvedSymbol || result.actualSymbol || command.payload?.resolvedSymbol || '-',
      chartId: result.chartId || command.payload?.chartId || '-',
      templateName: result.templateName || command.payload?.templateName || command.payload?.fileName || '-',
      expectedEaName: result.expectedEaName || '-',
      expectedFileName: result.expectedFileName || '-',
      possibleReasons: causes,
      lastKnownEaHeartbeats: Array.isArray(result.lastKnownEaHeartbeats) ? result.lastKnownEaHeartbeats : [],
      matchingHeartbeatCandidates: Array.isArray(result.matchingHeartbeatCandidates) ? result.matchingHeartbeatCandidates : [],
      controllerResultJson: result.controllerResultJson || null,
    };
  };

  const commandErrorText = (command: any) => {
    const result = command.result || {};
    return result.error || (command.status === 'FAILED' || command.status === 'WARNING' ? 'No detailed error returned by controller.' : '');
  };

  const commandTargetText = (command: any) => {
    const payload = command.payload || {};
    const result = command.result || {};
    const requested = `${payload.symbol || '-'} ${payload.timeframe || ''}`.trim();
    const actual = result.actualChartSymbol || result.symbol || payload.symbol || '-';
    const actualTf = result.actualChartTimeframe || result.timeframe || payload.timeframe || '';
    const target = `${requested} -> ${actual} ${actualTf}`.trim();
    const chart = result.chartId || payload.chartId ? ` · chart ${result.chartId || payload.chartId}` : '';
    const template = result.templateName || payload.templateName || payload.fileName ? ` · template ${result.templateName || payload.templateName || payload.fileName}` : '';
    return `${target}${chart}${template}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#eaecef]">EA Control Center</h1>
          <p className="text-sm text-[#929aa5] mt-1">Controller infrastructure only: heartbeat, symbols, charts, command queue, template attach, and screenshots.</p>
        </div>
        <button onClick={load} className="btn-secondary h-10 px-4 gap-2"><RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>

      {message && <div className="rounded-md border border-[#2b3139] bg-[#1e2329] px-4 py-3 text-sm text-[#fcd535]">{message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="bn-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4 text-[#fcd535]" />EA Library</h2>
            <button onClick={scanTemplates} className="btn-secondary h-8 px-3 text-xs gap-2"><RefreshCcw className="w-3.5 h-3.5" />Scan</button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {templates.map(t => (
              <button key={t.id} onClick={() => setSelectedTemplate(t.id)} className="w-full text-left rounded-md border p-3" style={{ borderColor: selectedTemplate === t.id ? '#fcd535' : '#2b3139', background: '#181a20' }}>
                <div className="font-semibold text-sm">{t.name}</div>
                <div className="text-xs text-[#929aa5] mt-1">{t.category || 'EA'} · {t.defaultMode || 'NOTIFY_ONLY'} · {t.templateName || t.fileName}</div>
                <p className="text-xs text-[#707a8a] mt-1">{t.description || 'Template mapping for controller attach.'}</p>
              </button>
            ))}
            {!templates.length && <p className="text-sm text-[#707a8a]">No templates scanned yet.</p>}
          </div>
        </section>

        <section className="bn-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold flex items-center gap-2"><Cpu className="w-4 h-4 text-[#fcd535]" />Terminal Status</h2>
            <button onClick={cancelPendingCommands} disabled={!selectedTerminal} className="btn-secondary h-8 px-3 text-xs gap-2 disabled:opacity-50"><X className="w-3.5 h-3.5" />Cancel pending commands</button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {!terminals.length && <p className="text-sm text-[#707a8a]">Attach ReplayFX_MT5_Controller to one MT5 chart first.</p>}
            {terminals.map(t => (
              <div key={`${t.terminalId}-${t.timestamp}`} className="rounded-md border border-[#2b3139] bg-[#181a20] p-3">
                <div className="flex justify-between text-sm font-semibold"><span>{t.terminalId}</span><span className={t.online ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{t.online ? 'online' : 'offline'}</span></div>
                <div className="text-xs text-[#929aa5] mt-1">Account {maskAccount(t.accountNumber)} · {t.broker || '-'} · {t.server || '-'}</div>
                <div className="text-xs text-[#707a8a] mt-1">{fmtMoney(t.balance)} / {fmtMoney(t.equity)} · free {fmtMoney(t.freeMargin)}</div>
                <div className="text-xs text-[#707a8a] mt-1">Symbols {t.symbolCount ?? symbolData.symbols.length} · charts {t.chartCount ?? chartData.charts.length} · active {t.activeChartCount ?? '-'}</div>
                <div className="text-xs text-[#707a8a] mt-1">Controller chart {t.chartId ? `${t.symbol || '-'} ${t.timeframe || ''} · ${t.chartId}` : '-'}</div>
                <div className="text-xs text-[#707a8a] mt-1">Last heartbeat {fmtDate(t.timestamp)} · {t.eaName || '-'}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bn-card p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-3"><Send className="w-4 h-4 text-[#fcd535]" />Attach EA</h2>
          <div className="rounded-md border border-[#fcd535] bg-[#1e2329] px-3 py-2 text-xs text-[#fcd535]">
            This EA may trade immediately after attach. Turn off AutoTrading or use PAUSED mode when testing.
          </div>
          <div className="space-y-3 mt-3">
            <label className="space-y-1 text-xs text-[#929aa5]">
              Terminal
              <select value={selectedTerminalId} onChange={e => setSelectedTerminalId(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2 text-sm">
                <option value="">Select terminal</option>
                {terminals.map(t => <option key={t.terminalId} value={t.terminalId}>{t.terminalId}</option>)}
              </select>
            </label>
            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2 text-sm">
              <option value="">Select EA template</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="rounded-md border border-[#2b3139] bg-[#181a20] p-3 space-y-2">
              {!selectedTerminal && <p className="text-xs text-[#fcd535]">Attach ReplayFX_MT5_Controller to MT5 first to load broker symbols.</p>}
              {selectedTerminal && !symbolData.symbols.length && <p className="text-xs text-[#fcd535]">No broker symbol list exists yet. Click Load Symbols From MT5.</p>}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-[#929aa5]">Broker Symbol</label>
                <label className="flex items-center gap-2 text-xs text-[#929aa5]"><input type="checkbox" checked={useCustomSymbol} onChange={e => setUseCustomSymbol(e.target.checked)} />Custom Symbol</label>
              </div>
              {!useCustomSymbol ? (
                <>
                  <input value={symbolFilter} onChange={e => setSymbolFilter(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2 text-sm" placeholder="Search broker symbol" />
                  <select value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2 text-sm" disabled={!symbolData.symbols.length}>
                    <option value="">{symbolData.symbols.length ? 'Select symbol' : 'No symbols loaded'}</option>
                    {visibleSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </>
              ) : (
                <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2 text-sm" placeholder="Custom symbol" />
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={requestSymbols} disabled={!selectedTerminal} className="btn-secondary h-8 px-3 text-xs gap-2 disabled:opacity-50"><RefreshCcw className="w-3.5 h-3.5" />Load Symbols</button>
                <button onClick={requestCharts} disabled={!selectedTerminal} className="btn-secondary h-8 px-3 text-xs gap-2 disabled:opacity-50"><Activity className="w-3.5 h-3.5" />Load Charts</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2 text-sm">
                {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map(tf => <option key={tf}>{tf}</option>)}
              </select>
              <select value={mode} onChange={e => setMode(e.target.value)} className="bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2 text-sm">
                {['AUTO', 'NOTIFY_ONLY', 'APPROVAL_REQUIRED', 'PAUSED'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={attach} disabled={!selectedTerminal || !selectedTemplate || (!useCustomSymbol && !symbolData.symbols.length) || !symbol} className="btn-primary w-full gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Send className="w-4 h-4" />Queue Attach Command</button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="bn-card p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-[#fcd535]" />Active EA Instances</h2>
          <div className="space-y-2">
            {instances.map(i => (
              <button key={i.id} onClick={() => setSelectedInstance(i.id)} className="w-full rounded-md border p-3 text-left" style={{ borderColor: activeInstance?.id === i.id ? '#fcd535' : '#2b3139', background: '#181a20' }}>
                <div className="flex justify-between text-sm font-semibold"><span>{i.symbol} {i.timeframe}</span><span>{i.mode}</span></div>
                <div className="text-xs text-[#929aa5] mt-1">{i.status} · chart {i.chartId || '-'} · {fmtDate(i.lastHeartbeatAt)}</div>
              </button>
            ))}
            {!instances.length && <p className="text-sm text-[#707a8a]">No integrated EA heartbeat yet. Controller heartbeat alone does not enable runtime config.</p>}
          </div>
        </section>

        <section className="bn-card p-4">
          <h2 className="font-semibold flex items-center gap-2 mb-3"><Settings2 className="w-4 h-4 text-[#fcd535]" />Runtime Config</h2>
          {!runtimeConfigEnabled && <p className="text-sm text-[#fcd535] mb-3">Runtime config will be enabled after an EA instance reports heartbeat.</p>}
          {runtimeConfigEnabled && <p className="text-xs text-[#929aa5] mb-3">{activeTemplate ? `${activeTemplate.name} supported params` : 'Select an EA template or active instance.'}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {runtimeConfigEnabled && configSchema.map(param => {
              if (param.type === 'mode') {
                return <label key={param.key} className="space-y-1"><span className="text-xs text-[#929aa5]">{param.label}</span><select value={config[param.key] || 'NOTIFY_ONLY'} onChange={e => updateConfigValue(param, e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2">{['AUTO', 'NOTIFY_ONLY', 'APPROVAL_REQUIRED', 'PAUSED'].map(m => <option key={m}>{m}</option>)}</select></label>;
              }
              if (param.type === 'boolean') {
                return <label key={param.key} className="flex items-center gap-2 rounded-md border border-[#2b3139] bg-[#181a20] px-3 py-2 mt-5"><input type="checkbox" checked={Boolean(config[param.key])} onChange={e => updateConfigValue(param, e.target.checked)} /><span>{param.label}</span></label>;
              }
              return <label key={param.key} className="space-y-1"><span className="text-xs text-[#929aa5]">{param.label}</span><input type={param.type === 'number' ? 'number' : 'text'} min={param.min} step={param.step} value={config[param.key] ?? ''} onChange={e => updateConfigValue(param, e.target.value)} className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-md px-3 py-2" /></label>;
            })}
            {runtimeConfigEnabled && !configSchema.length && <p className="text-sm text-[#707a8a]">No parameter schema available for this EA.</p>}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={saveConfig} disabled={!runtimeConfigEnabled} className="btn-primary gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Check className="w-4 h-4" />Save Config</button>
            <button onClick={screenshot} className="btn-secondary gap-2"><Camera className="w-4 h-4" />Screenshot</button>
            <button onClick={() => setConfig({ ...config, mode: config.mode === 'PAUSED' ? 'NOTIFY_ONLY' : 'PAUSED' })} disabled={!runtimeConfigEnabled} className="btn-secondary gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{config.mode === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}{config.mode === 'PAUSED' ? 'Resume' : 'Pause'}</button>
          </div>
        </section>
      </div>

      <section className="bn-card p-4">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Camera className="w-4 h-4 text-[#fcd535]" />Screenshots</h2>
        <div className="space-y-2 text-xs">
          {screenshots.map(s => (
            <div key={s.id} className="rounded-md bg-[#181a20] border border-[#2b3139] p-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{s.symbol || '-'} {s.timeframe || ''}</span>
                <span className={statusClass(s.status)}>{s.status || 'SUCCESS'}</span>
              </div>
              <div className="text-[#929aa5] mt-1">Terminal {s.terminalId || '-'} · Command {s.commandId || '-'} · Source {s.source || '-'}</div>
              <div className="text-[#707a8a] mt-1">Requested: {s.requestedSymbol || '-'} {s.requestedTimeframe || ''} → Actual: {s.actualSymbol || '-'} {s.actualTimeframe || ''}</div>
              {s.commandId && <div className="mt-1"><img src={`${API_BASE_URL}/ea-control/commands/${s.commandId}/screenshot`} alt="screenshot" className="max-w-full h-auto rounded border border-[#2b3139] bg-black" style={{ maxHeight: '240px' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}
              <div className="text-[#707a8a] mt-1">{s.localFilePath || s.filePath || s.url || 'Screenshot saved locally in MT5 MQL5/Files. Upload preview not available yet.'}</div>
              <div className="text-[#707a8a] mt-1">{fmtDate(s.createdAt)}</div>
            </div>
          ))}
          {!screenshots.length && <p className="text-[#707a8a]">No screenshot metadata yet.</p>}
        </div>
      </section>

      <section className="bn-card p-4">
        <h2 className="font-semibold flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-[#fcd535]" />Signal Approval Queue</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {signals.filter(s => s.status === 'PENDING').map(s => (
            <div key={s.id} className="rounded-md border border-[#2b3139] bg-[#181a20] p-3">
              <div className="flex justify-between font-semibold text-sm"><span>{s.eaName}</span><span className={s.side === 'BUY' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{s.side}</span></div>
              <div className="text-xs text-[#929aa5] mt-1">{s.symbol} {s.timeframe} · Code {s.approvalCode}</div>
              <div className="font-mono text-xs mt-2">Entry {s.entry ?? '-'} · SL {s.sl ?? '-'} · TP {s.tp ?? '-'}</div>
              <div className="text-xs text-[#707a8a] mt-1">RR {s.rr ?? '-'} · Risk {s.riskPercent ?? '-'} · Lot {s.lot ?? '-'}</div>
              <p className="text-xs text-[#929aa5] mt-2">{s.reason || '-'}</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => decideSignal(s, 'approve')} className="btn-primary h-8 px-3 text-xs gap-1"><Check className="w-3.5 h-3.5" />Approve</button>
                <button onClick={() => decideSignal(s, 'reject')} className="btn-secondary h-8 px-3 text-xs gap-1"><X className="w-3.5 h-3.5" />Reject</button>
              </div>
            </div>
          ))}
          {!signals.some(s => s.status === 'PENDING') && <p className="text-sm text-[#707a8a]">No pending signals.</p>}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="bn-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">Command Queue</h2>
            <button onClick={cancelPendingCommands} disabled={!selectedTerminal} className="btn-secondary h-8 px-3 text-xs gap-2 disabled:opacity-50"><X className="w-3.5 h-3.5" />Cancel pending commands</button>
          </div>
          <div className="space-y-2 text-xs">
            {commands.map(c => {
              const label = commandStatusLabel(c.status, c.requiresConfirmation);
              const result = c.result || {};
              const reason = result.error || result.message || '';
              const blockedBy = c.blockedBy || c.activeCommandId || null;
              const blockedStatus = c.blockedStatus || c.status || null;
              return (
                <div key={c.id} className="rounded-md bg-[#181a20] border border-[#2b3139] p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{c.commandType} · <span className={statusClass(c.status)}>{label}</span></div>
                      <div className="text-[#929aa5] mt-1">Controller {c.terminalId || '-'}</div>
                      {blockedBy && <div className="text-[#f6465d] mt-1">Blocked by active command: {blockedBy} ({blockedStatus})</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {heartbeatDiagnostics(c) && <button onClick={() => downloadCommandDebugNote(c)} className="btn-secondary h-7 px-2 text-[11px] gap-1"><FileText className="w-3 h-3" />Debug .txt</button>}
                      {['QUEUED', 'EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED', 'BLOCKED_BY_ACTIVE_COMMAND'].includes(c.status) && <button onClick={() => cancelCommand(c)} className="btn-secondary h-7 px-2 text-[11px]">Cancel</button>}
                    </div>
                  </div>
                  <div className="text-[#929aa5] mt-1">Target {commandTargetText(c)}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[#707a8a] mt-1">
                    <div>CreatedAt {fmtDate(c.createdAt)}</div>
                    <div>PickedAt {fmtDate(c.pickedAt)}</div>
                    <div>ExecutedAt {fmtDate(c.executedAt)}</div>
                    <div>ResultAt {fmtDate(c.resultAt)}</div>
                    <div>ExpiredAt {fmtDate(c.expiredAt)}</div>
                    <div>Pending age {formatDuration(commandAgeSeconds(c, now))}</div>
                    <div>Status age {formatDuration(statusAgeSeconds(c, now))}</div>
                    <div>{expiryCountdown(c, now)}</div>
                  </div>
                  <div className="text-[#707a8a] mt-1">Result message: {commandResultText(c)}</div>
                  {heartbeatDiagnostics(c) && (() => {
                    const diag = heartbeatDiagnostics(c)!;
                    return (
                      <div className="mt-2 rounded-md border border-[#3b2f12] bg-[#181a20] p-3 text-[#929aa5] space-y-2">
                        <div className="font-semibold text-[#fcd535]">Template applied, but EA heartbeat was not detected.</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
                          <div>requestedSymbol: <span className="text-[#eaecef]">{diag.requestedSymbol}</span></div>
                          <div>resolvedSymbol: <span className="text-[#eaecef]">{diag.resolvedSymbol}</span></div>
                          <div>chartId: <span className="text-[#eaecef]">{diag.chartId}</span></div>
                          <div>templateName: <span className="text-[#eaecef]">{diag.templateName}</span></div>
                          <div>expectedEaName: <span className="text-[#eaecef]">{diag.expectedEaName}</span></div>
                          <div>expectedFileName: <span className="text-[#eaecef]">{diag.expectedFileName}</span></div>
                        </div>
                        <div>
                          <div className="font-semibold text-[#eaecef]">Possible causes:</div>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {diag.possibleReasons.slice(0, 8).map((reason: string) => <li key={reason}>{reason}</li>)}
                          </ul>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <div className="font-semibold text-[#eaecef]">Last known EA heartbeats</div>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-[#0b0e11] p-2 text-[11px] text-[#707a8a]">{JSON.stringify(diag.lastKnownEaHeartbeats, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="font-semibold text-[#eaecef]">Matching heartbeat candidates</div>
                            <pre className="mt-1 max-h-32 overflow-auto rounded bg-[#0b0e11] p-2 text-[11px] text-[#707a8a]">{JSON.stringify(diag.matchingHeartbeatCandidates, null, 2)}</pre>
                          </div>
                        </div>
                        <details>
                          <summary className="cursor-pointer text-[#fcd535]">Controller result JSON</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-[#0b0e11] p-2 text-[11px] text-[#707a8a]">{JSON.stringify(diag.controllerResultJson, null, 2)}</pre>
                        </details>
                      </div>
                    );
                  })()}
                  {commandReason(c) && <div className={label === 'EA online' ? 'text-[#0ecb81] mt-1' : label.includes('Failed') || label === 'EXPIRED' || label === 'CANCELLED' || label === 'BLOCKED_BY_ACTIVE_COMMAND' ? 'text-[#f6465d] mt-1' : 'text-[#fcd535] mt-1'}>{commandReason(c)}</div>}
                  {commandErrorText(c) && <div className="text-[#f6465d] mt-1">Error: {commandErrorText(c)}</div>}
                </div>
              );
            })}
            {!commands.length && <p className="text-[#707a8a]">No EA commands queued yet.</p>}
          </div>
        </section>
        <section className="bn-card p-4">
          <h2 className="font-semibold mb-3">Command Log</h2>
          <div className="space-y-2 text-xs max-h-52 overflow-y-auto">
            {logs.map(l => <div key={l.id} className="rounded-md bg-[#181a20] border border-[#2b3139] p-2">{fmtDate(l.createdAt)} · {l.source} · {l.command} · <span className={statusClass(l.status)}>{l.status}</span></div>)}
            {!logs.length && <p className="text-[#707a8a]">No EA command logs yet.</p>}
          </div>
        </section>
      </div>

      <section className="bn-card p-4">
        <h2 className="font-semibold mb-3">Panduan Singkat</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-[#929aa5]">
          <p>Controller EA harus dipasang di satu chart MT5 dan URL backend harus diizinkan di Tools - Options - Expert Advisors - Allow WebRequest.</p>
          <p>Attach EA memakai template approach: EA dikompilasi, chart dibuka manual sekali, EA dipasang dengan input, lalu chart disimpan sebagai .tpl.</p>
          <p>Remote manual buy/sell, close all, dan modify SL/TP sengaja dinonaktifkan. Gunakan approval signal mode untuk kontrol yang aman.</p>
          <p>Runtime config hanya aktif setelah EA strategy instance mengirim heartbeat. Controller heartbeat hanya untuk infrastruktur.</p>
        </div>
      </section>
    </div>
  );
}
