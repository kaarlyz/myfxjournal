import { prisma } from '../prisma';
import {
  EA_MODES,
  attachParameterSchema,
  applyEaStoredConfigToController,
  createEaCommand,
  findTemplate,
  getEaConfigSnapshot,
  getTerminalCharts,
  getTerminalSymbols,
  listTemplates,
  parseJson,
  resolveBrokerSymbol,
  syncEaRuntimeConfigFromActual,
  upsertRuntimeConfig,
} from './eaControlService';
import { parseEaControlIntent } from './eaIntentParser';
import { EaBotChannel, clearEaSession, getEaSession, popEaSession, pushEaSession, setEaSession } from './eaSessionService';
import {
  breadcrumb,
  fmtBold,
  fmtCode,
  fmtItalic,
  fmtText,
  formatWaAttachPreview,
  formatWaEaLibrary,
  formatWaHelp,
  formatWaMainMenu,
  formatWaTerminalStatus,
  escapeHtml,
  shortCommandId,
  statusLabel,
  waBox,
} from './eaFormatter';

export type EaBotResponse = {
  response: string;
  status: string;
  replyMarkup?: any;
  commandId?: string;
};

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const MODES = ['NOTIFY_ONLY', 'AUTO', 'PAUSED'];
const PAGE_SIZE = 10;
const CONFIG_PAGE_SIZE = 8;
const CONFIG_PRIORITY_KEYS = [
  'mode',
  'riskPercent',
  'rr',
  'allowBuy',
  'allowSell',
  'maxSpread',
  'maxDailyLoss',
  'maxTradesPerDay',
  'takeScreenshotOnSignal',
  'panelWidth',
  'compactPanel',
  'showZones',
  'showStats',
  'useSpreadFilter',
  'entryMode',
  'lookback',
  'breakBufferPips',
  'manualSLPips',
  'onePositionOnly',
  'oneEntryPerBar',
  'lot',
  'gridDistance',
  'gridDistancePips',
  'layers',
  'multiplier',
  'maxFloatingLoss',
  'targetProfit',
  'minBodyPips',
  'minBodyPercent',
  'atrFilter',
  'showPanel',
];
const CONFIG_BLOCKED_KEYS = new Set([
  'ReplayFX_SecretToken',
  'ReplayFX_BackendURL',
  'secret',
  'secretToken',
  'token',
  'botToken',
  'authorization',
  'password',
]);

function isTelegram(channel: EaBotChannel) {
  return channel === 'TELEGRAM';
}

function rows(buttons: Array<Array<{ text: string; id: string }>>) {
  return {
    inline_keyboard: buttons.map(row => row.map(button => ({ text: button.text, callback_data: button.id }))),
  };
}

function navRows(includeRefresh = false) {
  const row = [
    { text: '⬅ Back', id: 'nav:back' },
    { text: '🏠 Menu', id: 'm:home' },
    { text: '❌ Cancel', id: 'nav:cancel' },
  ];
  return includeRefresh ? [row, [{ text: '🔄 Refresh', id: 'nav:refresh' }]] : [row];
}

function withKeyboard(channel: EaBotChannel, text: string, buttons: Array<Array<{ text: string; id: string }>> = [], status = 'SUCCESS', commandId?: string): EaBotResponse {
  return {
    response: text,
    status,
    commandId,
    replyMarkup: isTelegram(channel) ? rows(buttons) : undefined,
  };
}

function waNumbered(channel: EaBotChannel, title: string, options: Array<{ label: string }>, footer?: string) {
  if (isTelegram(channel)) return title;
  const body = options.map((option, index) => `${index + 1}. ${option.label}`).join('\n');
  return `${title}\n\n${body}${footer ? `\n\n${footer}` : ''}`;
}

function waScreen(channel: EaBotChannel, title: string, lines: string[], options?: Array<{ label: string }>, footer?: string) {
  if (isTelegram(channel)) return `${breadcrumb(channel, ['ReplayFX', title])}\n\n${fmtBold(channel, title)}`;
  const box = waBox(title, lines);
  if (!options?.length) return `${box}${footer ? `\n\n${footer}` : ''}`;
  return `${box}\n\n${options.map((option, index) => `${index + 1}. ${option.label}`).join('\n')}${footer ? `\n\n${footer}` : ''}`;
}

type ConfigFieldMeta = {
  key: string;
  parameterKey: string;
  rawName: string;
  label: string;
  type: 'mode' | 'number' | 'boolean' | 'text' | 'enum';
  min?: number;
  step?: number;
  stored: any;
  actual: any;
  source: 'actual' | 'stored' | 'detected' | 'heartbeat' | 'inferred';
  group?: string | null;
  comment?: string | null;
  sourceFile?: string | null;
  lineNumber?: number | null;
  liveEditable: boolean;
  detected?: boolean;
  liveConfig?: boolean;
  defaultValue?: any;
  options?: string[];
  safeEditable?: boolean;
};

function extractHeartbeatConfigSchema(snapshot: any) {
  const payload = parseJson<any>(snapshot?.heartbeat?.payloadJson, {});
  return Array.isArray(payload?.configSchema) ? payload.configSchema : [];
}

function normalizeConfigLookup(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function fieldAliases(field: any) {
  const aliases = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    aliases.add(trimmed);
    aliases.add(normalizeConfigLookup(trimmed));
  };
  add(field?.key);
  add(field?.parameterKey);
  add(field?.rawName);
  if (field?.parameterKey) add(String(field.parameterKey).replace(/^Inp/, ''));
  if (field?.rawName) add(String(field.rawName).replace(/^Inp/, '').replace(/^ReplayFX_/, ''));
  return [...aliases];
}

function findConfigValue(source: Record<string, any> | null | undefined, aliases: string[]) {
  if (!source) return undefined;
  const keys = Object.keys(source);
  for (const alias of aliases) {
    if (!alias) continue;
    if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
    const normalizedAlias = normalizeConfigLookup(alias);
    const matchKey = keys.find(key => normalizeConfigLookup(key) === normalizedAlias);
    if (matchKey !== undefined) return source[matchKey];
  }
  return undefined;
}

function humanizeConfigKey(key: string) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase())
    .trim();
}

function isBlockedConfigKey(key: string) {
  const lower = key.toLowerCase();
  return CONFIG_BLOCKED_KEYS.has(key) || CONFIG_BLOCKED_KEYS.has(lower) || lower.includes('token') || lower.includes('secret') || lower.includes('password') || lower.includes('backendurl');
}

function inferConfigType(key: string, value: any, schemaType?: 'mode' | 'number' | 'boolean' | 'text'): ConfigFieldMeta['type'] {
  if (schemaType) return schemaType;
  if (key === 'mode') return 'mode';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'false', 'yes', 'no', 'on', 'off'].includes(normalized)) return 'boolean';
  if (!Number.isNaN(Number(normalized)) && normalized !== '') return 'number';
  return 'text';
}

function configFieldValue(meta: ConfigFieldMeta) {
  return meta.actual !== undefined && meta.actual !== null ? meta.actual : meta.stored;
}

function isConfigFresh(snapshot: any) {
  return Boolean(snapshot?.heartbeat && snapshot?.actualConfig && snapshot?.syncStatus !== 'UNKNOWN');
}

async function buildConfigFieldMeta(instance: any, snapshot: any): Promise<ConfigFieldMeta[]> {
  const actual = snapshot?.actualConfig || {};
  const stored = snapshot?.storedConfig || {};
  const heartbeatPayload = parseJson<any>(snapshot?.heartbeat?.payloadJson, {});
  const template = instance?.templateId
    ? await prisma.eaTemplate.findUnique({ where: { id: instance.templateId } }).catch(() => null)
    : await findTemplate(String(heartbeatPayload?.fileName || snapshot?.heartbeat?.eaName || instance?.eaName || '')).catch(() => null);
  const detectedSchema = template ? attachParameterSchema(template as any).parameterSchema || [] : [];
  const heartbeatSchema = extractHeartbeatConfigSchema(snapshot);
  const liveSchemaByKey = new Map<string, any>();
  for (const item of heartbeatSchema) {
    const key = String(item?.key || item?.parameterKey || item?.rawName || '').trim();
    if (!key) continue;
    liveSchemaByKey.set(normalizeConfigLookup(key), item);
  }
  const allDetected = new Map<string, any>();
  for (const item of detectedSchema) {
    const aliases = fieldAliases(item);
    for (const alias of aliases) {
      allDetected.set(normalizeConfigLookup(alias), item);
    }
  }

  const keys = new Map<string, { key: string; detected?: any; live?: any }>();
  const pushKey = (key: string, detected?: any, live?: any) => {
    const normalized = normalizeConfigLookup(key);
    if (!normalized || isBlockedConfigKey(key)) return;
    const existing = keys.get(normalized) || { key };
    keys.set(normalized, { key: existing.key || key, detected: existing.detected || detected, live: existing.live || live });
  };

  for (const item of detectedSchema) {
    pushKey(String(item.key || item.parameterKey || item.rawName), item, undefined);
  }
  for (const [normalized, item] of liveSchemaByKey.entries()) {
    pushKey(String(item?.key || item?.parameterKey || item?.rawName || normalized), undefined, item);
  }
  for (const key of Object.keys(actual || {})) pushKey(key);
  for (const key of Object.keys(stored || {})) pushKey(key);

  const ordered = [...keys.values()].map(entry => entry.key).sort((a, b) => {
    const pa = CONFIG_PRIORITY_KEYS.indexOf(a);
    const pb = CONFIG_PRIORITY_KEYS.indexOf(b);
    if (pa >= 0 || pb >= 0) return (pa >= 0 ? pa : 999) - (pb >= 0 ? pb : 999);
    return a.localeCompare(b);
  });
  return ordered.map(key => {
    const normalized = normalizeConfigLookup(key);
    const detectedItem = allDetected.get(normalized) || null;
    const liveItem = liveSchemaByKey.get(normalized) || null;
    const aliases = fieldAliases(detectedItem || liveItem || { key });
    const actualValue = findConfigValue(actual, aliases);
    const storedValue = findConfigValue(stored, aliases);
    const schemaType = liveItem?.type || detectedItem?.type;
    const inferredType = inferConfigType(key, actualValue ?? storedValue ?? detectedItem?.defaultValue, schemaType);
    return {
      key,
      parameterKey: String(detectedItem?.parameterKey || liveItem?.parameterKey || detectedItem?.rawName || liveItem?.rawName || key),
      rawName: String(detectedItem?.rawName || liveItem?.rawName || detectedItem?.parameterKey || liveItem?.parameterKey || key),
      label: liveItem?.label || detectedItem?.label || humanizeConfigKey(key),
      type: inferredType,
      min: liveItem?.min,
      step: liveItem?.step,
      stored: storedValue,
      actual: actualValue,
      source: actualValue !== undefined ? 'actual' : storedValue !== undefined ? 'stored' : liveItem ? 'heartbeat' : detectedItem ? 'detected' : 'inferred',
      group: detectedItem?.group || null,
      comment: detectedItem?.comment || null,
      sourceFile: detectedItem?.sourceFile || null,
      lineNumber: detectedItem?.lineNumber || null,
      liveEditable: !!liveItem || actualValue !== undefined,
      detected: !!detectedItem,
      liveConfig: !!liveItem || actualValue !== undefined,
      defaultValue: detectedItem?.defaultValue,
      options: liveItem?.options || detectedItem?.options,
      safeEditable: detectedItem?.safeEditable !== false,
    };
  });
}

function formatConfigValue(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseConfigInputValue(input: string, meta: ConfigFieldMeta) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Value is required.' };
  if (meta.type === 'boolean') {
    const lower = raw.toLowerCase();
    if (['true', 'yes', 'on', '1'].includes(lower)) return { ok: true, value: true };
    if (['false', 'no', 'off', '0'].includes(lower)) return { ok: true, value: false };
    return { ok: false, error: 'Use true/false, yes/no, on/off, or 1/0.' };
  }
  if (meta.type === 'mode') {
    const mode = raw.toUpperCase() === 'APPROVAL' ? 'APPROVAL_REQUIRED' : raw.toUpperCase();
    if (!MODES.includes(mode as any)) return { ok: false, error: `Mode must be one of: ${MODES.join(', ')}.` };
    return { ok: true, value: mode };
  }
  if (meta.type === 'number') {
    const numeric = Number(raw);
    if (Number.isNaN(numeric)) return { ok: false, error: 'Numeric value required.' };
    const integerLike = meta.step === 1 || Number.isInteger(meta.stored) || Number.isInteger(meta.actual) || ['panelWidth', 'maxTradesPerDay', 'layers', 'lookback', 'onePositionOnly'].includes(meta.key);
    return { ok: true, value: integerLike ? Math.round(numeric) : numeric };
  }
  return { ok: true, value: raw };
}

function configHeaderLines(instance: any, snapshot: any) {
  const actual = snapshot?.actualConfig || {};
  const stored = snapshot?.storedConfig || {};
  const syncStatus = snapshot?.syncStatus || 'UNKNOWN';
  const primaryMode = actual?.mode || stored?.mode || instance?.mode || 'NOTIFY_ONLY';
  const heartbeatAge = snapshot?.heartbeat?.timestamp ? `${Math.max(1, Math.round(heartbeatAgeMs(snapshot.heartbeat.timestamp) / 1000))}s ago` : '-';
  return {
    primaryMode,
    syncStatus,
    lines: [
      `EA: ${snapshot?.heartbeat?.eaName || instance?.eaName || instance?.templateName || 'EA'}`,
      `Symbol: ${instance?.symbol || '-'}`,
      `TF: ${instance?.timeframe || '-'}`,
      `Mode: ${primaryMode}`,
      `Instance: ${String(instance?.id || '-').slice(0, 8)}`,
      `Chart: ${instance?.chartId || '-'}`,
      `Heartbeat: ${heartbeatAge}`,
      `syncStatus: ${syncStatus}`,
      `Stored Mode: ${stored?.mode || instance?.mode || '-'}`,
      `Actual Mode: ${actual?.mode || '-'}`,
    ],
    warning: syncStatus === 'DRIFT' ? '⚠ Stored config differs from actual EA config.' : null,
  };
}

async function latestTerminals() {
  const heartbeats = await prisma.eaTerminalHeartbeat.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
  const latest = new Map<string, any>();
  for (const hb of heartbeats) if (!latest.has(hb.terminalId)) latest.set(hb.terminalId, hb);
  return [...latest.values()];
}

function heartbeatAgeMs(value?: Date | string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : Date.now() - date.getTime();
}

function isFreshHeartbeat(value?: Date | string | null) {
  return heartbeatAgeMs(value) < 90_000;
}

function dedupeActiveInstances(instances: any[]) {
  const seen = new Map<string, any>();
  for (const instance of instances) {
    const key = instance.chartId ? `${instance.terminalId}|${instance.chartId}` : `${instance.terminalId}|${instance.symbol}|${instance.timeframe}`;
    const existing = seen.get(key);
    const currentAge = heartbeatAgeMs(instance.lastHeartbeatAt || instance.updatedAt);
    const existingAge = existing ? heartbeatAgeMs(existing.lastHeartbeatAt || existing.updatedAt) : Number.POSITIVE_INFINITY;
    if (!existing || currentAge < existingAge) seen.set(key, instance);
  }
  return [...seen.values()].sort((a, b) => heartbeatAgeMs(a.lastHeartbeatAt || a.updatedAt) - heartbeatAgeMs(b.lastHeartbeatAt || b.updatedAt));
}

function filterActiveInstances(instances: any[], session: any) {
  const filter = session?.data?.activeInstanceFilter || { onlineOnly: true, showStale: false, ea: '', symbol: '', timeframe: '' };
  return instances.filter(instance => {
    const fresh = isFreshHeartbeat(instance.lastHeartbeatAt);
    if (filter.onlineOnly && !fresh) return false;
    if (!filter.showStale && !fresh) return false;
    if (filter.ea && String(instance.eaName || '').toLowerCase().indexOf(String(filter.ea).toLowerCase()) === -1) return false;
    if (filter.symbol && String(instance.symbol || '').toLowerCase().indexOf(String(filter.symbol).toLowerCase()) === -1) return false;
    if (filter.timeframe && String(instance.timeframe || '').toLowerCase().indexOf(String(filter.timeframe).toLowerCase()) === -1) return false;
    return true;
  });
}

function activeInstanceLabel(instance: any) {
  const ageMs = heartbeatAgeMs(instance.lastHeartbeatAt || instance.updatedAt);
  const ageLabel = Number.isFinite(ageMs) ? `${Math.max(1, Math.round(ageMs / 1000))}s ago` : 'stale';
  const chart = instance.chartId ? `chart ${String(instance.chartId).slice(0, 8)}` : 'chart -';
  const status = isFreshHeartbeat(instance.lastHeartbeatAt) ? 'online' : 'offline';
  return `${instance.eaName || instance.templateName || 'EA'} | ${instance.symbol} ${instance.timeframe} | ${instance.mode || '-'} | ${status} | ${chart} | hb ${ageLabel}`;
}

function terminalOnline(terminal: any) {
  return terminal?.timestamp && Date.now() - new Date(terminal.timestamp).getTime() < 90_000;
}

async function requireOnlineTerminal(terminalId?: string) {
  const terminals = await latestTerminals();
  const terminal = terminals.find(t => t.terminalId === terminalId) || terminals[0];
  if (!terminal) throw new Error('No active controller terminal. Start MT5 Controller first.');
  if (!terminalOnline(terminal)) throw new Error(`Terminal offline: ${terminal.terminalId}. Wait for controller heartbeat before queueing commands.`);
  return terminal;
}

async function mainMenu(channel: EaBotChannel) {
  const title = `${fmtBold(channel, 'ReplayFX Control Center')}\n${breadcrumb(channel, ['ReplayFX'])}`;
  const telegramButtons = [
    [{ text: '📡 Terminal', id: 'm:terminal' }, { text: '🤖 EA Library', id: 'm:library' }],
    [{ text: '🚀 Attach EA', id: 'a:start' }, { text: '📸 Screenshot', id: 's:start' }],
    [{ text: '📈 Symbols', id: 'm:symbols' }, { text: '🖥 Charts', id: 'm:charts' }],
    [{ text: '⚙ Runtime Config', id: 'm:config' }, { text: '⏸ Pause / ▶ Resume', id: 'm:pause' }],
    [{ text: '📜 Command Log', id: 'm:logs' }, { text: '🧹 Cleanup', id: 'm:cleanup' }],
    [{ text: '❓ Help', id: 'm:help' }],
  ];
  if (isTelegram(channel)) {
    return withKeyboard(channel, `${title}\n\nChoose what you want to manage. Manual BUY/SELL/CLOSE_ALL/MODIFY_SL/MODIFY_TP commands are disabled.`, telegramButtons);
  }
  const terminals = await latestTerminals();
  const terminal = terminals[0];
  return withKeyboard(channel, formatWaMainMenu({
    online: terminalOnline(terminal),
    accountNumber: terminal?.accountNumber,
    broker: terminal?.broker,
    balance: terminal?.balance,
    equity: terminal?.equity,
  }));
}

async function terminalScreen(channel: EaBotChannel, senderId: string, flow: string) {
  const terminals = await latestTerminals();
  setEaSession(channel, senderId, { flow, step: 'select_terminal', page: 0, data: { terminals: terminals.map(t => t.terminalId) } });
  if (!terminals.length) return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', flowLabel(flow), 'Select Terminal'])}\n\nNo controller terminal heartbeat yet. Start MT5 Controller first.`, navRows(true), 'FAILED');

  const title = `${breadcrumb(channel, ['ReplayFX', flowLabel(flow), 'Select Terminal'])}\n\n${fmtBold(channel, 'Select terminal')}`;
  const options = terminals.map((t: any) => {
    const online = terminalOnline(t) ? 'online' : 'offline';
    const money = [t.balance != null ? `bal ${t.balance}` : '', t.equity != null ? `eq ${t.equity}` : ''].filter(Boolean).join(' / ');
    return { label: `${t.terminalId} | ${online} | ${t.broker || '-'}${money ? ` | ${money}` : ''}` };
  });
  const buttons = terminals.map((t: any, index: number) => [{ text: `${terminalOnline(t) ? '🟢' : '🔴'} ${t.terminalId}`, id: `t:${index}` }]);
  const body = isTelegram(channel) ? waNumbered(channel, title, options, 'Reply with a number.') : waScreen(channel, 'Select Terminal', ['Choose a terminal for this workflow.'], options, 'Reply with a number.');
  return withKeyboard(channel, body, [...buttons, ...navRows(true)]);
}

function flowLabel(flow: string) {
  if (flow === 'attach') return 'Attach EA';
  if (flow === 'screenshot') return 'Screenshot';
  if (flow === 'charts') return 'Charts';
  if (flow === 'config') return 'Runtime Config';
  if (flow === 'pause') return 'Pause / Resume';
  if (flow === 'cleanup') return 'Cleanup';
  return 'Menu';
}

async function selectTerminal(channel: EaBotChannel, senderId: string, index: number) {
  const session = getEaSession(channel, senderId);
  const terminals = await latestTerminals();
  const terminal = terminals[index];
  if (!terminal) return terminalScreen(channel, senderId, session?.flow || 'menu');
  setEaSession(channel, senderId, { selectedTerminalId: terminal.terminalId });
  if (session?.flow === 'attach') return session.selectedTemplateId ? symbolScreen(channel, senderId, 'attach') : templateScreen(channel, senderId);
  if (session?.flow === 'screenshot') return screenshotSourceScreen(channel, senderId);
  if (session?.flow === 'charts') return chartsScreen(channel, senderId);
  if (session?.flow === 'config') return instanceScreen(channel, senderId, 'config');
  if (session?.flow === 'pause') return instanceScreen(channel, senderId, 'pause');
  return await mainMenu(channel);
}

async function templateScreen(channel: EaBotChannel, senderId: string) {
  const templates = (await listTemplates()).map(attachParameterSchema);
  setEaSession(channel, senderId, { flow: 'attach', step: 'select_template', data: { templates: templates.map(t => t.id) } });
  const title = `${breadcrumb(channel, ['ReplayFX', 'Attach EA', 'Select EA'])}\n\n${fmtBold(channel, 'Select EA template')}`;
  if (!templates.length) {
    return withKeyboard(channel, `${title}\n\nNo templates found. Copy ReplayFX EA .mq5 templates into the EA library folder and run template scan.`, navRows(true), 'FAILED');
  }
  const options = templates.map((t: any) => ({ label: `${t.name} | ${t.category || 'EA'} | ${t.defaultMode || 'NOTIFY_ONLY'}` }));
  const buttons = templates.slice(0, 12).map((t: any, i: number) => [{ text: `${t.name}`, id: `e:${i}` }]);
  const body = isTelegram(channel) ? waNumbered(channel, title, options, 'Reply with a number.') : `${formatWaEaLibrary(templates)}\n\nReply with a number.`;
  return withKeyboard(channel, body, [...buttons, ...navRows()]);
}

async function selectTemplate(channel: EaBotChannel, senderId: string, index: number) {
  const session = getEaSession(channel, senderId);
  const templates = await listTemplates();
  const template = templates[index];
  if (!template) return templateScreen(channel, senderId);
  setEaSession(channel, senderId, { selectedTemplateId: template.id, selectedMode: template.defaultMode || 'NOTIFY_ONLY' });
  if (session?.selectedSymbol && session?.selectedTimeframe) return modeScreen(channel, senderId);
  return symbolScreen(channel, senderId, 'attach');
}

function filterSymbols(symbols: string[], query?: string) {
  const clean = String(query || '').trim().toUpperCase();
  if (!clean) return symbols;
  if (clean === 'METALS') return symbols.filter(symbol => /XAU|XAG|GOLD|SILVER/i.test(symbol));
  if (clean === 'CRYPTO') return symbols.filter(symbol => /BTC|ETH|XRP|BNB|SOL|ADA|DOGE|CRYPTO/i.test(symbol));
  if (clean === 'STOCK' || clean === 'STOCKS') return symbols.filter(symbol => /AMD|AAPL|MSFT|NVDA|TSLA|META|GOOG|AMZN|US30|NAS|SPX|DOW/i.test(symbol));
  return symbols.filter(symbol => symbol.toUpperCase().includes(clean));
}

async function symbolScreen(channel: EaBotChannel, senderId: string, flow: string, query?: string, page = 0) {
  const session = getEaSession(channel, senderId);
  const data = await getTerminalSymbols(session?.selectedTerminalId);
  if (!data.symbols.length) {
    const terminal = await requireOnlineTerminal(session?.selectedTerminalId);
    const command = await createEaCommand({ terminalId: terminal.terminalId, commandType: 'LIST_SYMBOLS', source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS' });
    setEaSession(channel, senderId, { flow, step: 'select_symbol', selectedTerminalId: terminal.terminalId, page: 0, searchQuery: query ?? session?.searchQuery });
    return withKeyboard(
      channel,
      `${breadcrumb(channel, ['ReplayFX', flowLabel(flow), 'Select Symbol'])}\n\nNo cached broker symbols yet. Refresh requested from MT5 Controller.\nCommand: ${fmtCode(channel, shortCommandId(command.id))}`,
      navRows(true),
      'QUEUED',
      command.id,
    );
  }
  const symbols = filterSymbols(data.symbols, query ?? session?.searchQuery);
  const pageCount = Math.max(1, Math.ceil(symbols.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const shown = symbols.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  setEaSession(channel, senderId, { flow, step: 'select_symbol', page: safePage, searchQuery: query ?? session?.searchQuery, data: { symbolOptions: shown } });
  const title = `${breadcrumb(channel, ['ReplayFX', flowLabel(flow), 'Select Symbol'])}\n\n${fmtBold(channel, 'Search or select symbol')}\nType part of a symbol, e.g. ${fmtCode(channel, 'xau')}, ${fmtCode(channel, 'btc')}, ${fmtCode(channel, 'usd')}, ${fmtCode(channel, 'jp')}.`;
  const quick = [
    [{ text: 'XAU', id: 'q:XAU' }, { text: 'BTC', id: 'q:BTC' }, { text: 'USD', id: 'q:USD' }, { text: 'JPY', id: 'q:JPY' }],
    [{ text: 'EUR', id: 'q:EUR' }, { text: 'GBP', id: 'q:GBP' }, { text: 'Stocks', id: 'q:STOCKS' }, { text: 'Crypto', id: 'q:CRYPTO' }, { text: 'Metals', id: 'q:METALS' }],
  ];
  const symbolButtons = shown.map((symbol, i) => [{ text: symbol, id: `sym:${i}` }]);
  const pager = [[
    { text: '◀ Prev', id: 'pg:prev' },
    { text: `Page ${safePage + 1}/${pageCount}`, id: 'noop' },
    { text: 'Next ▶', id: 'pg:next' },
  ], [{ text: '🔎 Search Again', id: 'q:' }]];
  const options = shown.map(symbol => ({ label: symbol }));
  const body = isTelegram(channel)
    ? (shown.length ? waNumbered(channel, title, options, `Page ${safePage + 1}/${pageCount}. Reply number or type a search.`) : `${title}\n\nNo matching symbols. Type another search.`)
    : (shown.length ? waScreen(channel, 'Search Symbol', [`Query: ${(query ?? session?.searchQuery) || 'all'}`, `Page ${safePage + 1}/${pageCount}`], options, 'Reply number or type another search like xau, btc, usd.') : waBox('Search Symbol', ['No matching symbols.', 'Type another search like xau, btc, usd.']));
  return withKeyboard(channel, body, [...quick, ...symbolButtons, ...pager, ...navRows(true)]);
}

async function selectSymbol(channel: EaBotChannel, senderId: string, index: number) {
  const session = getEaSession(channel, senderId);
  const symbol = session?.data?.symbolOptions?.[index];
  if (!symbol) return symbolScreen(channel, senderId, session?.flow || 'attach');
  setEaSession(channel, senderId, { selectedSymbol: symbol });
  if (session?.flow === 'screenshot') return timeframeScreen(channel, senderId, 'screenshot');
  return timeframeScreen(channel, senderId, 'attach');
}

function timeframeScreen(channel: EaBotChannel, senderId: string, flow: string) {
  setEaSession(channel, senderId, { flow, step: 'select_timeframe', data: { options: TIMEFRAMES } });
  const title = `${breadcrumb(channel, ['ReplayFX', flowLabel(flow), 'Select Timeframe'])}\n\n${fmtBold(channel, 'Select timeframe')}`;
  const buttons = [
    [{ text: 'M1', id: 'tf:M1' }, { text: 'M5', id: 'tf:M5' }, { text: 'M15', id: 'tf:M15' }, { text: 'M30', id: 'tf:M30' }],
    [{ text: 'H1', id: 'tf:H1' }, { text: 'H4', id: 'tf:H4' }, { text: 'D1', id: 'tf:D1' }],
  ];
  const body = isTelegram(channel) ? waNumbered(channel, title, TIMEFRAMES.map(label => ({ label })), 'Reply with a number.') : waScreen(channel, 'Select Timeframe', ['Choose the chart timeframe.'], TIMEFRAMES.map(label => ({ label })), 'Reply with a number.');
  return withKeyboard(channel, body, [...buttons, ...navRows()]);
}

function modeScreen(channel: EaBotChannel, senderId: string) {
  setEaSession(channel, senderId, { flow: 'attach', step: 'select_mode', data: { options: MODES } });
  const title = `${breadcrumb(channel, ['ReplayFX', 'Attach EA', 'Select Mode'])}\n\n${fmtBold(channel, 'Select mode')}`;
  const buttons = MODES.map(mode => [{ text: mode, id: `mode:${mode}` }]);
  const body = isTelegram(channel) ? waNumbered(channel, title, MODES.map(label => ({ label })), 'Reply with a number.') : waScreen(channel, 'Select Mode', ['NOTIFY_ONLY is safest for monitoring.', 'AUTO lets the EA follow its own configured logic.', 'PAUSED attaches without running.'], MODES.map(label => ({ label })), 'Reply with a number.');
  return withKeyboard(channel, body, [...buttons, ...navRows()]);
}

async function attachPreview(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  const templates = await listTemplates();
  const template = templates.find(t => t.id === session?.selectedTemplateId);
  const resolution = session?.selectedSymbol ? await resolveBrokerSymbol(session.selectedSymbol, session.selectedTerminalId) : null;
  if (resolution?.found && resolution.resolvedSymbol !== session?.selectedSymbol) setEaSession(channel, senderId, { selectedSymbol: resolution.resolvedSymbol });
  const symbolLine = resolution?.resolved && session?.selectedSymbol ? `\n${fmtBold(channel, 'Resolved:')} ${fmtText(channel, resolution.requestedSymbol)} → ${fmtCode(channel, resolution.resolvedSymbol)}` : '';
  setEaSession(channel, senderId, { flow: 'attach', step: 'confirm_attach' });
  const text = isTelegram(channel) ? `${breadcrumb(channel, ['ReplayFX', 'Attach EA', 'Preview'])}\n\n` +
    `${fmtBold(channel, '🚀 Attach EA Preview')}\n\n` +
    `${fmtBold(channel, 'Terminal:')} ${fmtCode(channel, session?.selectedTerminalId || '-')}\n` +
    `${fmtBold(channel, 'EA:')} ${fmtText(channel, template?.name || '-')}\n` +
    `${fmtBold(channel, 'Symbol:')} ${fmtCode(channel, resolution?.resolvedSymbol || session?.selectedSymbol || '-')}${symbolLine}\n` +
    `${fmtBold(channel, 'Timeframe:')} ${fmtText(channel, session?.selectedTimeframe || '-')}\n` +
    `${fmtBold(channel, 'Mode:')} ${fmtText(channel, session?.selectedMode || 'NOTIFY_ONLY')}\n` +
    `${fmtBold(channel, 'Template:')} ${fmtCode(channel, template?.templateName || '-')}\n` +
    `${fmtBold(channel, 'Action:')} ${fmtCode(channel, 'APPLY_TEMPLATE')}\n\n` +
    `${fmtItalic(channel, 'This will apply template to the selected chart and wait for EA heartbeat.')}`
    : formatWaAttachPreview({
      ea: template?.name,
      symbol: resolution?.resolvedSymbol || session?.selectedSymbol,
      resolvedLine: resolution?.resolved ? `🔁 Resolved: ${resolution.requestedSymbol} → ${resolution.resolvedSymbol}` : null,
      timeframe: session?.selectedTimeframe,
      mode: session?.selectedMode || 'NOTIFY_ONLY',
      terminalId: session?.selectedTerminalId,
      templateName: template?.templateName,
    });
  return withKeyboard(channel, text, [
    [{ text: '✅ Confirm Attach', id: 'a:confirm' }],
    [{ text: '✏ Change Symbol', id: 'a:change_symbol' }, { text: '✏ Change Timeframe', id: 'a:change_tf' }],
    [{ text: '✏ Change EA', id: 'a:change_ea' }],
    ...navRows(),
  ]);
}

async function confirmAttach(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  const terminal = await requireOnlineTerminal(session?.selectedTerminalId);
  const templates = await listTemplates();
  const template = templates.find(t => t.id === session?.selectedTemplateId);
  if (!template) return withKeyboard(channel, 'Template missing. Use EA Library and make sure the template file exists.', navRows(), 'REJECTED');
  if (!session?.selectedSymbol) return symbolScreen(channel, senderId, 'attach');
  const resolution = await resolveBrokerSymbol(session.selectedSymbol, terminal.terminalId);
  if (!resolution.found) {
    return withKeyboard(channel, `${fmtBold(channel, 'Symbol not found')}\n\nRequested: ${fmtCode(channel, session.selectedSymbol)}\nSuggestions:\n${resolution.suggestions.map(s => `• ${fmtText(channel, s)}`).join('\n') || '-'}`, navRows(true), 'REJECTED');
  }
  const command = await createEaCommand({
    terminalId: terminal.terminalId,
    commandType: 'APPLY_TEMPLATE',
    source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS',
    payload: {
      templateId: template.id,
      templateName: template.templateName,
      fileName: template.fileName,
      symbol: resolution.resolvedSymbol,
      requestedSymbol: session.selectedSymbol,
      resolvedSymbol: resolution.resolvedSymbol,
      timeframe: session.selectedTimeframe || template.defaultTimeframe || 'M5',
      mode: EA_MODES.includes((session.selectedMode || '') as any) ? session.selectedMode : 'NOTIFY_ONLY',
    },
  });
  clearEaSession(channel, senderId);
  const queued = isTelegram(channel)
    ? `${fmtBold(channel, '⏳ Command queued')}\n\n${fmtBold(channel, 'Action:')} APPLY_TEMPLATE\n${fmtBold(channel, 'Command:')} ${fmtCode(channel, shortCommandId(command.id))}`
    : waBox('Command Queued', [`⏳ APPLY_TEMPLATE`, `Command: ${shortCommandId(command.id)}`, 'Waiting for MT5 Controller result.']);
  return withKeyboard(channel, queued, [], 'QUEUED', command.id);
}

function screenshotSourceScreen(channel: EaBotChannel, senderId: string) {
  setEaSession(channel, senderId, { flow: 'screenshot', step: 'select_source' });
  const text = isTelegram(channel)
    ? `${breadcrumb(channel, ['ReplayFX', 'Screenshot', 'Source'])}\n\n${fmtBold(channel, 'Select screenshot source')}`
    : waScreen(channel, 'Screenshot Source', ['Choose where the screenshot should come from.']);
  const options = [
    { label: 'Current controller chart' },
    { label: 'Select from open charts' },
    { label: 'Search symbol' },
  ];
  return withKeyboard(channel, waNumbered(channel, text, options, 'Reply with a number.'), [
    [{ text: 'Current controller chart', id: 'ss:current' }],
    [{ text: 'Select from open charts', id: 'ss:charts' }],
    [{ text: 'Search symbol', id: 'ss:search' }],
    ...navRows(),
  ]);
}

async function screenshotPreview(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  setEaSession(channel, senderId, { flow: 'screenshot', step: 'confirm_screenshot' });
  const text = isTelegram(channel) ? `${breadcrumb(channel, ['ReplayFX', 'Screenshot', 'Preview'])}\n\n` +
    `${fmtBold(channel, '📸 Screenshot Preview')}\n\n` +
    `${fmtBold(channel, 'Terminal:')} ${fmtCode(channel, session?.selectedTerminalId || '-')}\n` +
    `${fmtBold(channel, 'Symbol:')} ${fmtCode(channel, session?.selectedSymbol || 'current controller chart')}\n` +
    `${fmtBold(channel, 'Timeframe:')} ${fmtText(channel, session?.selectedTimeframe || '-')}\n` +
    `${fmtBold(channel, 'Size:')} 1280x720`
    : `${waBox('Screenshot Preview', [
      `📈 Symbol: ${session?.selectedSymbol || 'current controller chart'}`,
      `⏱ TF: ${session?.selectedTimeframe || '-'}`,
      `🖥 Terminal: ${session?.selectedTerminalId || '-'}`,
      '🖼 Size: 1280x720',
    ])}\n\nReply *yes* to confirm or *cancel*.`;
  return withKeyboard(channel, text, [[{ text: '✅ Confirm Screenshot', id: 's:confirm' }], ...navRows()]);
}

async function confirmScreenshot(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  const terminal = await requireOnlineTerminal(session?.selectedTerminalId);
  const command = await createEaCommand({
    terminalId: terminal.terminalId,
    commandType: 'SCREENSHOT_CHART',
    source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS',
    payload: {
      symbol: session?.selectedSymbol || undefined,
      timeframe: session?.selectedTimeframe || undefined,
      width: 1280,
      height: 720,
      hideGui: true,
    },
  });
  clearEaSession(channel, senderId);
  const queued = isTelegram(channel)
    ? `${fmtBold(channel, '⏳ Command queued')}\n\n${fmtBold(channel, 'Action:')} SCREENSHOT_CHART\n${fmtBold(channel, 'Command:')} ${fmtCode(channel, shortCommandId(command.id))}`
    : waBox('Command Queued', [`⏳ SCREENSHOT_CHART`, `Command: ${shortCommandId(command.id)}`, 'Waiting for screenshot image.']);
  return withKeyboard(channel, queued, [], 'QUEUED', command.id);
}

async function chartsScreen(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  const data = await getTerminalCharts(session?.selectedTerminalId);
  const instances = await prisma.eaInstance.findMany({ where: session?.selectedTerminalId ? { terminalId: session.selectedTerminalId } : undefined, orderBy: { updatedAt: 'desc' }, take: 100 });
  const charts = data.charts || [];
  setEaSession(channel, senderId, { flow: 'charts', step: 'chart_list', data: { charts } });
  if (!charts.length) {
    const terminal = await requireOnlineTerminal(session?.selectedTerminalId);
    const command = await createEaCommand({ terminalId: terminal.terminalId, commandType: 'LIST_CHARTS', source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS' });
    return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Charts'])}\n\nNo cached open charts. Refresh requested from MT5 Controller.\nCommand: ${fmtCode(channel, shortCommandId(command.id))}`, navRows(true), 'QUEUED', command.id);
  }
  const options = charts.slice(0, 12).map((chart: any) => {
    const instance = instances.find(i => i.symbol === chart.symbol && i.timeframe === chart.timeframe);
    return { label: `${chart.symbol || '-'} ${chart.timeframe || '-'} — ${instance?.templateId ? 'EA attached' : instance ? instance.mode : 'No EA'}` };
  });
  const buttons = charts.slice(0, 12).map((chart: any, i: number) => [{ text: `${chart.symbol || '-'} ${chart.timeframe || '-'}`, id: `ch:${i}` }]);
  const body = isTelegram(channel)
    ? waNumbered(channel, `${breadcrumb(channel, ['ReplayFX', 'Charts'])}\n\n${fmtBold(channel, '🖥 Open Charts')}`, options, 'Open a chart for screenshot, attach, config, pause, or resume.')
    : waScreen(channel, 'Open Charts', ['Choose a chart to open actions.'], options, 'Reply chart number to open actions.');
  return withKeyboard(channel, body, [...buttons, ...navRows(true)]);
}

async function chartDetail(channel: EaBotChannel, senderId: string, index: number) {
  const session = getEaSession(channel, senderId);
  const chart = session?.data?.charts?.[index];
  if (!chart) return chartsScreen(channel, senderId);
  const instance = await prisma.eaInstance.findFirst({ where: { symbol: chart.symbol || '', timeframe: chart.timeframe || '' }, orderBy: { updatedAt: 'desc' } });
  setEaSession(channel, senderId, { flow: 'charts', step: 'chart_detail', selectedChartIndex: index, selectedSymbol: chart.symbol, selectedTimeframe: chart.timeframe, selectedInstanceId: instance?.id });
  const online = instance?.lastHeartbeatAt && Date.now() - new Date(instance.lastHeartbeatAt).getTime() < 90_000 ? 'Online' : 'Offline';
  const text = isTelegram(channel) ? `${breadcrumb(channel, ['ReplayFX', 'Charts', 'Detail'])}\n\n` +
    `${fmtBold(channel, 'Chart Detail')}\n` +
    `${fmtBold(channel, 'Symbol:')} ${fmtCode(channel, chart.symbol || '-')}\n` +
    `${fmtBold(channel, 'Timeframe:')} ${fmtText(channel, chart.timeframe || '-')}\n` +
    `${fmtBold(channel, 'EA:')} ${fmtText(channel, instance ? instance.mode : 'No EA')}\n` +
    `${fmtBold(channel, 'Status:')} ${fmtText(channel, instance ? online : 'No EA')}`
    : `${waBox('Chart Detail', [
      `📈 Symbol: ${chart.symbol || '-'}`,
      `⏱ TF: ${chart.timeframe || '-'}`,
      `🤖 EA: ${instance ? instance.mode : 'No EA'}`,
      `📡 Status: ${instance ? online : 'No EA'}`,
    ])}

1. 📸 Screenshot
2. 🚀 Attach/Replace EA
3. ⚙ Config EA
4. ⏸ Pause EA
5. ▶ Resume EA
6. Back`;
  return withKeyboard(channel, text, [
    [{ text: '📸 Screenshot', id: 'cd:screenshot' }, { text: '🚀 Attach/Replace EA', id: 'cd:attach' }],
    [{ text: '⚙ Config', id: 'cd:config' }, { text: '⏸ Pause', id: 'cd:pause' }, { text: '▶ Resume', id: 'cd:resume' }],
    ...navRows(true),
  ]);
}

async function instanceScreen(channel: EaBotChannel, senderId: string, flow: 'config' | 'pause') {
  const session = getEaSession(channel, senderId);
  const instances = dedupeActiveInstances(await prisma.eaInstance.findMany({ where: session?.selectedTerminalId ? { terminalId: session.selectedTerminalId } : undefined, orderBy: { updatedAt: 'desc' }, take: 100 }));
  const filter = session?.data?.activeInstanceFilter || { onlineOnly: true, showStale: false, ea: '', symbol: '', timeframe: '' };
  const visible = filterActiveInstances(instances, session);
  setEaSession(channel, senderId, { flow, step: 'select_instance', data: { instances: visible.map(i => i.id), activeInstanceIds: instances.map(i => i.id), activeInstanceFilter: filter } });
  const title = `${breadcrumb(channel, ['ReplayFX', flowLabel(flow), 'Select EA'])}\n\n${fmtBold(channel, 'Select active EA')}`;
  if (!instances.length) return withKeyboard(channel, `${title}\n\nNo EA heartbeat received yet.`, navRows(true), 'FAILED');
  const visibleButtons = visible.slice(0, 12).map((instance, i) => [{ text: `${isFreshHeartbeat(instance.lastHeartbeatAt) ? '🟢' : '🟡'} ${instance.symbol} ${instance.timeframe}`, id: `inst:${i}` }]);
  const options = visible.slice(0, 12).map(i => ({ label: activeInstanceLabel(i) }));
  const body = isTelegram(channel)
    ? `${title}\n\n${fmtBold(channel, `Filters`)}\n${fmtText(channel, `onlineOnly=${String(filter.onlineOnly)} showStale=${String(filter.showStale)} EA=${filter.ea || '-'} Symbol=${filter.symbol || '-'} TF=${filter.timeframe || '-'}`)}\n\n${options.length ? options.map((option, index) => `${index + 1}. ${escapeHtml(option.label)}`).join('\n') : 'No matching EA instance.'}\n\nReply with a number or use filters.`
    : waScreen(channel, 'Select Active EA', [`Filters: onlineOnly=${String(filter.onlineOnly)} showStale=${String(filter.showStale)}`, `EA=${filter.ea || '-'} Symbol=${filter.symbol || '-'} TF=${filter.timeframe || '-'}`], options, 'Reply with a number or use the buttons.');
  const filterRow = [
    { text: filter.onlineOnly ? 'Online only: ON' : 'Online only: OFF', id: 'instf:online' },
    { text: filter.showStale ? 'Show stale: ON' : 'Show stale: OFF', id: 'instf:stale' },
  ];
  const searchRow = [
    { text: 'By EA', id: 'instf:ea' },
    { text: 'By Symbol', id: 'instf:symbol' },
    { text: 'By Timeframe', id: 'instf:timeframe' },
  ];
  const cleanupRow = [
    { text: 'Cleanup stale instances', id: 'instf:cleanup' },
    { text: 'Refresh', id: 'nav:refresh' },
  ];
  return withKeyboard(channel, body, [...visibleButtons, filterRow, searchRow, cleanupRow, ...navRows(true)]);
}

async function configDetail(channel: EaBotChannel, senderId: string, index?: number) {
  const session = getEaSession(channel, senderId);
  const ids = session?.data?.instances || [];
  const instanceId = index != null ? ids[index] : session?.selectedInstanceId;
  const instance = await prisma.eaInstance.findUnique({ where: { id: instanceId || '' } }).catch(() => null);
  if (!instance) return instanceScreen(channel, senderId, 'config');

  const snapshot = await getEaConfigSnapshot(instance.id).catch(() => null);
  const fields = await buildConfigFieldMeta(instance, snapshot);
  const header = configHeaderLines(instance, snapshot);
  const liveFields = fields.filter(field => field.liveEditable);
  const detectedFields = fields.filter(field => field.detected);
  const pageCount = Math.max(1, Math.ceil(fields.length / CONFIG_PAGE_SIZE));
  const page = Math.min(Math.max(0, session?.data?.configPage || 0), pageCount - 1);
  const visible = fields.slice(page * CONFIG_PAGE_SIZE, page * CONFIG_PAGE_SIZE + CONFIG_PAGE_SIZE);

  setEaSession(channel, senderId, {
    flow: 'config',
    step: 'config_detail',
    selectedInstanceId: instance.id,
    selectedConfigKey: undefined,
    page,
    data: {
      instances: ids,
      selectedEaName: snapshot?.heartbeat?.eaName || null,
      selectedChartId: instance.chartId || null,
      selectedInstanceIdentity: {
        terminalId: instance.terminalId,
        instanceId: instance.id,
        chartId: instance.chartId,
        eaName: snapshot?.heartbeat?.eaName || null,
        symbol: instance.symbol,
        timeframe: instance.timeframe,
        templateId: instance.templateId,
        lastHeartbeatAt: instance.lastHeartbeatAt,
      },
      currentConfig: snapshot?.actualConfig || null,
      storedConfig: snapshot?.storedConfig || null,
      configSchema: fields.map(field => ({ key: field.key, label: field.label, type: field.type, source: field.source })),
      detectedSchema: detectedFields,
      liveEditableSchema: liveFields,
      selectedParameter: undefined,
      pendingEdit: undefined,
      previousSchema: undefined,
      previousConfig: undefined,
      cachedParameterList: undefined,
      pendingConfigPatch: undefined,
      pendingConfigReason: undefined,
      configFieldMeta: undefined,
      configKeys: fields.map(field => field.key),
      configPage: page,
    },
  });

  const diffLines = snapshot?.comparison?.diffs?.length
    ? snapshot.comparison.diffs.slice(0, 10).map((d: any) => `${d.key}: stored=${formatConfigValue(d.stored)} actual=${formatConfigValue(d.actual)}`)
    : ['No diff detected or EA has not reported currentConfig yet.'];
  const diffText = diffLines.join('\n');
  const liveText = liveFields.length
    ? liveFields.slice(0, 12).map((field, idx) => {
      const value = configFieldValue(field);
      const suffix = field.actual !== undefined && field.stored !== undefined && JSON.stringify(field.actual) !== JSON.stringify(field.stored)
        ? ` (stored ${formatConfigValue(field.stored)})`
        : '';
      return `${idx + 1}. ${field.parameterKey}: ${formatConfigValue(value)}${suffix} [${field.sourceFile || 'heartbeat'}:${field.lineNumber || '-'}]`;
    }).join('\n')
    : 'No live editable parameters were reported by heartbeat.';
  const detectedText = detectedFields.length
    ? detectedFields.slice(0, 12).map((field, idx) => {
      const liveState = field.liveEditable ? 'liveEditable=yes' : 'liveEditable=no';
      return `${idx + 1}. ${field.parameterKey}: ${formatConfigValue(field.defaultValue)} (${liveState}) [${field.sourceFile || '-'}:${field.lineNumber || '-'}]`;
    }).join('\n')
    : 'No detected source inputs were found in the selected EA file.';
  const storedText = Object.keys(snapshot?.storedConfig || {}).length
    ? Object.entries(snapshot?.storedConfig || {}).slice(0, 20).map(([k, v]) => `${k}: ${formatConfigValue(v)}`).join('\n')
    : 'No stored config.';
  const actualText = Object.keys(snapshot?.actualConfig || {}).length
    ? Object.entries(snapshot?.actualConfig || {}).slice(0, 20).map(([k, v]) => `${k}: ${formatConfigValue(v)}`).join('\n')
    : 'No actual heartbeat currentConfig yet.';
  const body = isTelegram(channel)
    ? `${breadcrumb(channel, ['ReplayFX', 'Runtime Config'])}\n\n${fmtBold(channel, `${instance.symbol} ${instance.timeframe}`)}\n${header.lines.map(line => escapeHtml(line)).join('\n')}\n\n${fmtBold(channel, 'Live Editable Parameters')}\n${fmtCode(channel, liveText.slice(0, 1200))}\n\n${fmtBold(channel, 'Detected Source Inputs')}\n${fmtCode(channel, detectedText.slice(0, 1200))}\n\n${fmtBold(channel, 'Stored Config')}\n${fmtCode(channel, storedText.slice(0, 800))}\n\n${fmtBold(channel, 'Actual EA Config')}\n${fmtCode(channel, actualText.slice(0, 800))}\n\n${header.warning ? `${fmtBold(channel, header.warning)}\n\n` : ''}${fmtBold(channel, 'Drift')}\n${fmtCode(channel, diffText.slice(0, 1200))}`
    : `${waBox('Runtime Config', [
      `${instance.symbol} ${instance.timeframe}`,
      ...header.lines,
      header.warning || null,
      'Live Editable Parameters',
      liveText,
      'Detected Source Inputs',
      detectedText,
      'Stored Config',
      storedText,
      'Actual EA Config',
      actualText,
    ])}

1. Change Mode
2. Edit Parameter
3. Sync DB from EA
4. Apply Stored to EA
5. Refresh
6. Back

Actual EA config:
${JSON.stringify(snapshot?.actualConfig || {}, null, 2).slice(0, 900)}

Diff:
${diffText.slice(0, 900)}`;

  const telegramButtons = [
    [{ text: 'Change Mode', id: 'cfg:mode' }, { text: 'Edit Parameter', id: `cfg:edit:${page}` }],
    [{ text: 'Sync DB from EA', id: 'cfg:sync' }, { text: 'Apply Stored to EA', id: 'cfg:apply' }],
    [{ text: 'Refresh', id: 'nav:refresh' }, { text: 'Clear Drift', id: 'cfg:clear' }],
    [{ text: 'Back', id: 'nav:back' }],
  ];
  if (!isTelegram(channel)) {
    return withKeyboard(channel, body, [
      [{ text: 'Change Mode', id: 'cfg:mode' }, { text: 'Edit Parameter', id: `cfg:edit:${page}` }],
      [{ text: 'Sync DB from EA', id: 'cfg:sync' }, { text: 'Apply Stored to EA', id: 'cfg:apply' }],
      [{ text: 'Refresh', id: 'nav:refresh' }, { text: 'Clear Drift', id: 'cfg:clear' }],
      [{ text: 'Back', id: 'nav:back' }],
      ...navRows(true),
    ]);
  }
  return withKeyboard(channel, body, telegramButtons);
}

async function configParamScreen(channel: EaBotChannel, senderId: string, page = 0) {
  const session = getEaSession(channel, senderId);
  const instance = await prisma.eaInstance.findUnique({ where: { id: session?.selectedInstanceId || '' } }).catch(() => null);
  if (!instance) return instanceScreen(channel, senderId, 'config');
  const snapshot = await getEaConfigSnapshot(instance.id).catch(() => null);
  const fields = await buildConfigFieldMeta(instance, snapshot);
  const pageCount = Math.max(1, Math.ceil(fields.length / CONFIG_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const visible = fields.slice(safePage * CONFIG_PAGE_SIZE, safePage * CONFIG_PAGE_SIZE + CONFIG_PAGE_SIZE);
  setEaSession(channel, senderId, {
    flow: 'config',
    step: 'config_select',
    selectedInstanceId: instance.id,
    page: safePage,
    data: {
      configKeys: fields.map(field => field.key),
      configPage: safePage,
      currentConfig: snapshot?.actualConfig || null,
      storedConfig: snapshot?.storedConfig || null,
      configSchema: fields.map(field => ({ key: field.key, label: field.label, type: field.type, source: field.source })),
      selectedParameter: undefined,
      pendingEdit: undefined,
      previousSchema: undefined,
      previousConfig: undefined,
      cachedParameterList: undefined,
      pendingConfigPatch: undefined,
      pendingConfigReason: undefined,
      configFieldMeta: undefined,
    },
  });
  const title = `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Edit Parameter'])}\n\n${fmtBold(channel, 'Select parameter')}`;
  const options = visible.map((field, index) => ({ label: `${field.key}: ${formatConfigValue(configFieldValue(field))} [${field.liveEditable ? 'live' : 'detected'}]` }));
  const buttons = visible.map((field, index) => [{ text: `${index + 1}. ${field.key}`, id: `cfgk:${safePage}:${index}` }]);
  const pager = [[
    { text: '◀ Prev', id: 'cfgpage:prev' },
    { text: `Page ${safePage + 1}/${pageCount}`, id: 'noop' },
    { text: 'Next ▶', id: 'cfgpage:next' },
  ], [{ text: 'Back to Config', id: 'cfg:back' }]];
  const body = isTelegram(channel)
    ? `${title}\n\n${options.map((option, index) => `${index + 1}. ${escapeHtml(option.label)}`).join('\n')}\n\nReply with a number or use the buttons.`
    : waScreen(channel, 'Edit Parameter', ['Select the parameter to edit.'], options, 'Reply with a number.');
  return withKeyboard(channel, body, [...buttons, ...pager]);
}

async function configDecisionScreen(channel: EaBotChannel, senderId: string, patch: Record<string, any>, reason: string) {
  const session = getEaSession(channel, senderId);
  const instance = await prisma.eaInstance.findUnique({ where: { id: session?.selectedInstanceId || '' } }).catch(() => null);
  if (!instance) return instanceScreen(channel, senderId, 'config');
  const snapshot = await getEaConfigSnapshot(instance.id).catch(() => null);
  setEaSession(channel, senderId, {
    flow: 'config',
    step: 'config_confirm',
    selectedInstanceId: instance.id,
    data: {
      pendingConfigPatch: patch,
      pendingConfigReason: reason,
      configKeys: session?.data?.configKeys || [],
      configPage: session?.data?.configPage || 0,
    },
  });
  const lines = Object.entries(patch).map(([key, value]) => `${key}: ${value}`);
  const drift = snapshot?.syncStatus === 'DRIFT';
  const body = isTelegram(channel)
    ? `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Confirm'])}\n\n${fmtBold(channel, drift ? 'Stored config differs from actual EA config.' : 'Confirm config update')}\n${fmtText(channel, reason)}\n\n${lines.map(line => fmtCode(channel, line)).join('\n')}\n\n${drift ? 'Choose what to do next:' : `Reply ${fmtCode(channel, 'yes')} to queue UPDATE_CONFIG.`}`
    : `${waBox('Confirm Config Update', [
      `Instance: ${instance.symbol} ${instance.timeframe}`,
      drift ? 'Stored config differs from actual EA config.' : 'Confirm the config update.',
      reason,
      ...lines,
    ])}\n\n${drift ? '1. Apply Stored to EA\n2. Sync DB from EA\n3. Cancel' : 'Reply yes to confirm or cancel.'}`;
  const buttons = drift
    ? [
        [{ text: 'Apply Stored to EA', id: 'cfgconfirm:apply' }, { text: 'Sync DB from EA', id: 'cfgconfirm:sync' }],
        [{ text: 'Cancel', id: 'nav:cancel' }],
      ]
    : [[{ text: 'Confirm Save', id: 'cfgconfirm:apply' }], ...navRows()];
  return withKeyboard(channel, body, buttons, drift ? 'CONFIRMATION_REQUIRED' : 'CONFIRMATION_REQUIRED');
}

async function executeConfigApply(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  const instance = await prisma.eaInstance.findUnique({ where: { id: session?.selectedInstanceId || '' } }).catch(() => null);
  const patch = session?.data?.pendingConfigPatch || {};
  if (!instance || !Object.keys(patch).length) return configDetail(channel, senderId);
  await upsertRuntimeConfig(instance.id, patch);
  const command = await createEaCommand({
    terminalId: instance.terminalId,
    commandType: 'UPDATE_CONFIG',
    source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS',
    payload: { terminalId: instance.terminalId, instanceId: instance.id, chartId: instance.chartId, symbol: instance.symbol, timeframe: instance.timeframe, config: { ...patch }, customConfig: { ...patch }, ...patch },
  });
  clearEaSession(channel, senderId);
  const body = isTelegram(channel)
    ? `${fmtBold(channel, 'Config update queued')}\n${fmtBold(channel, 'Command:')} ${fmtCode(channel, shortCommandId(command.id))}`
    : waBox('Config Update Queued', [`Command: ${shortCommandId(command.id)}`, ...Object.entries(patch).map(([key, value]) => `${key}: ${value}`)]);
  return withKeyboard(channel, body, [], 'QUEUED', command.id);
}

async function executeConfigSync(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  const instance = await prisma.eaInstance.findUnique({ where: { id: session?.selectedInstanceId || '' } }).catch(() => null);
  if (!instance) return instanceScreen(channel, senderId, 'config');
  try {
    const result = await syncEaRuntimeConfigFromActual(instance.id);
    clearEaSession(channel, senderId);
    const body = isTelegram(channel)
      ? `${fmtBold(channel, 'DB synced from EA')}\n${fmtBold(channel, 'Mode:')} ${fmtCode(channel, result.config?.mode || '-')}\n${fmtBold(channel, 'Sync status:')} ${fmtCode(channel, result.snapshot.syncStatus || 'UNKNOWN')}`
      : waBox('Sync DB from EA', [
        `Mode: ${result.config?.mode || '-'}`,
        `Sync status: ${result.snapshot.syncStatus || 'UNKNOWN'}`,
      ]);
    return withKeyboard(channel, body, [[{ text: 'Refresh', id: 'nav:refresh' }], ...navRows(true)], 'SUCCESS');
  } catch (error: any) {
    return withKeyboard(channel, error.message || 'Failed to sync DB from EA.', navRows(true), 'FAILED');
  }
}

async function executeApplyStored(channel: EaBotChannel, senderId: string) {
  const session = getEaSession(channel, senderId);
  const instance = await prisma.eaInstance.findUnique({ where: { id: session?.selectedInstanceId || '' } }).catch(() => null);
  if (!instance) return instanceScreen(channel, senderId, 'config');
  try {
    const result = await applyEaStoredConfigToController(instance.id, channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS');
    clearEaSession(channel, senderId);
    const body = isTelegram(channel)
      ? `${fmtBold(channel, 'Stored config queued to EA')}\n${fmtBold(channel, 'Command:')} ${fmtCode(channel, shortCommandId(result.command.id))}`
      : waBox('Apply Stored to EA', [
        `Command: ${shortCommandId(result.command.id)}`,
        `Terminal: ${result.instance.terminalId}`,
      ]);
    return withKeyboard(channel, body, [[{ text: 'Refresh', id: 'nav:refresh' }], ...navRows(true)], 'QUEUED', result.command.id);
  } catch (error: any) {
    return withKeyboard(channel, error.message || 'Failed to apply stored config.', navRows(true), 'FAILED');
  }
}

async function commandLogScreen(channel: EaBotChannel, senderId: string) {
  const commands = await prisma.eaCommandQueue.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  setEaSession(channel, senderId, { flow: 'logs', step: 'list', data: { commands: commands.map(c => c.id) } });
  const title = `${breadcrumb(channel, ['ReplayFX', 'Command Log'])}\n\n${fmtBold(channel, 'Last 10 Commands')}`;
  if (!commands.length) return withKeyboard(channel, `${title}\n\nNo commands yet.`, navRows(true));
  const options = commands.map(c => ({ label: `${statusLabel(c.status)} ${c.commandType} ${shortCommandId(c.id)}` }));
  const buttons = commands.map((c, i) => [{ text: `${statusLabel(c.status)} ${c.commandType}`, id: `log:${i}` }]);
  const body = isTelegram(channel) ? waNumbered(channel, title, options, 'Open a command for payload/result and retry actions.') : waScreen(channel, 'Command Log', ['Last 10 EA Control commands.'], options, 'Reply number to open details.');
  return withKeyboard(channel, body, [...buttons, ...navRows(true)]);
}

async function commandDetail(channel: EaBotChannel, senderId: string, index: number) {
  const session = getEaSession(channel, senderId);
  const id = session?.data?.commands?.[index];
  const command = await prisma.eaCommandQueue.findUnique({ where: { id: id || '' } }).catch(() => null);
  if (!command) return commandLogScreen(channel, senderId);
  const payload = parseJson<any>(command.payloadJson, {});
  const result = parseJson<any>(command.resultJson, {});
  setEaSession(channel, senderId, { flow: 'logs', step: 'detail', data: { selectedCommandId: command.id } });
  const text = isTelegram(channel) ? `${breadcrumb(channel, ['ReplayFX', 'Command Log', shortCommandId(command.id)])}\n\n` +
    `${fmtBold(channel, 'Command ID:')} ${fmtCode(channel, command.id)}\n` +
    `${fmtBold(channel, 'Status:')} ${statusLabel(command.status)}\n` +
    `${fmtBold(channel, 'Source:')} ${fmtText(channel, command.source)}\n` +
    `${fmtBold(channel, 'Terminal:')} ${fmtCode(channel, command.terminalId)}\n` +
    `${fmtBold(channel, 'Created:')} ${fmtText(channel, command.createdAt.toISOString())}\n` +
    `${fmtBold(channel, 'Payload:')} ${fmtCode(channel, JSON.stringify(payload).slice(0, 800))}\n` +
    `${fmtBold(channel, 'Result:')} ${fmtCode(channel, JSON.stringify(result).slice(0, 800))}`
    : `${waBox('Command Detail', [
      `ID: ${shortCommandId(command.id)}`,
      `Status: ${statusLabel(command.status)}`,
      `Type: ${command.commandType}`,
      `Source: ${command.source}`,
      `Terminal: ${command.terminalId}`,
      `Created: ${command.createdAt.toISOString()}`,
    ])}

Payload: \`${JSON.stringify(payload).slice(0, 500)}\`
Result: \`${JSON.stringify(result).slice(0, 500)}\`

1. Retry
2. Screenshot related chart
3. Back`;
  return withKeyboard(channel, text, [
    [{ text: 'Retry', id: 'log:retry' }, { text: 'Screenshot related chart', id: 'log:ss' }],
    ...navRows(true),
  ]);
}

async function cleanupScreen(channel: EaBotChannel, senderId: string) {
  setEaSession(channel, senderId, { flow: 'cleanup', step: 'confirm' });
  return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Cleanup'])}\n\n${fmtBold(channel, 'Confirm Cleanup')}\nThis cancels queued/executing EA-control commands.`, [[{ text: '✅ Confirm Cleanup', id: 'clean:confirm' }], ...navRows()]);
}

async function confirmCleanup(channel: EaBotChannel, senderId: string) {
  const terminal = await requireOnlineTerminal(getEaSession(channel, senderId)?.selectedTerminalId);
  const command = await createEaCommand({ terminalId: terminal.terminalId, commandType: 'CANCEL_PENDING', source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS', payload: { terminalId: terminal.terminalId } });
  const now = new Date();
  const result = await (prisma.eaCommandQueue as any).updateMany({
    where: { terminalId: terminal.terminalId, status: { in: ['QUEUED', 'EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED'] }, id: { not: command.id } },
    data: { status: 'CANCELLED', cancelledAt: now, resultAt: now, resultJson: JSON.stringify({ message: 'Command cancelled.' }) },
  });
  await (prisma.eaCommandQueue as any).update({ where: { id: command.id }, data: { status: 'SUCCESS', executedAt: now, resultAt: now, resultJson: JSON.stringify({ terminalId: terminal.terminalId, cancelled: result.count, message: 'Pending EA commands cancelled.' }) } });
  clearEaSession(channel, senderId);
  return withKeyboard(channel, `${fmtBold(channel, '🧹 Cleanup Complete')}\n\nCancelled ${result.count} pending command(s).`, [], 'SUCCESS', command.id);
}

async function processShortcut(channel: EaBotChannel, senderId: string, text: string) {
  const intent = parseEaControlIntent(text);
  if (intent.type === 'blocked_manual_trade') return withKeyboard(channel, 'Remote manual trade execution is disabled for safety. Use EA management controls only.', [], 'REJECTED');
  if (intent.type === 'menu') return await mainMenu(channel);
  if (intent.type === 'help') return helpScreen(channel);
  if (intent.type === 'status') return statusScreen(channel);
  if (intent.type === 'library') return libraryScreen(channel, senderId);
  if (intent.type === 'symbols') return symbolScreen(channel, senderId, 'symbols', intent.query);
  if (intent.type === 'charts') {
    setEaSession(channel, senderId, { flow: 'charts', step: 'chart_list' });
    return chartsScreen(channel, senderId);
  }
  if (intent.type === 'logs') return commandLogScreen(channel, senderId);
  if (intent.type === 'cleanup') return cleanupScreen(channel, senderId);
  if (intent.type === 'attach' && intent.templateRef && intent.symbol) {
    const templates = await listTemplates();
    const template = templates.find(t => t.name.toLowerCase().includes(intent.templateRef!.toLowerCase()) || t.fileName.toLowerCase().includes(intent.templateRef!.toLowerCase()));
    setEaSession(channel, senderId, { flow: 'attach', step: 'confirm_attach', selectedTerminalId: (await requireOnlineTerminal()).terminalId, selectedTemplateId: template?.id, selectedSymbol: intent.symbol, selectedTimeframe: intent.timeframe || 'M5', selectedMode: intent.mode || template?.defaultMode || 'NOTIFY_ONLY' });
    return attachPreview(channel, senderId);
  }
  if (intent.type === 'screenshot') {
    setEaSession(channel, senderId, { flow: 'screenshot', step: 'confirm_screenshot', selectedTerminalId: (await requireOnlineTerminal()).terminalId, selectedSymbol: intent.symbol, selectedTimeframe: intent.timeframe || 'M5' });
    return screenshotPreview(channel, senderId);
  }
  if (intent.type === 'config') return instanceScreen(channel, senderId, 'config');
  if (intent.type === 'pause' || intent.type === 'resume') return queuePauseResume(channel, senderId, intent.type, intent.symbol, intent.timeframe);
  return null;
}

async function queuePauseResume(channel: EaBotChannel, senderId: string, action: 'pause' | 'resume', symbol?: string, timeframe?: string) {
  const instance = await prisma.eaInstance.findFirst({
    where: symbol ? { symbol: { contains: symbol }, ...(timeframe ? { timeframe: timeframe.toUpperCase() } : {}) } : { id: getEaSession(channel, senderId)?.selectedInstanceId || '' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!instance) return withKeyboard(channel, 'EA instance not found. Open Runtime Config or Charts first.', navRows(true), 'REJECTED');
  await requireOnlineTerminal(instance.terminalId);
  const mode = action === 'pause' ? 'PAUSED' : 'NOTIFY_ONLY';
  await upsertRuntimeConfig(instance.id, { mode });
  const command = await createEaCommand({ terminalId: instance.terminalId, commandType: action === 'pause' ? 'PAUSE_EA' : 'RESUME_EA', source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS', payload: { instanceId: instance.id, symbol: instance.symbol, timeframe: instance.timeframe, mode } });
  clearEaSession(channel, senderId);
  return withKeyboard(channel, `${fmtBold(channel, action === 'pause' ? '⏸ Pause queued' : '▶ Resume queued')}\n\n${instance.symbol} ${instance.timeframe}\nCommand: ${fmtCode(channel, shortCommandId(command.id))}`, [], 'QUEUED', command.id);
}

async function libraryScreen(channel: EaBotChannel, senderId: string) {
  const templates = (await listTemplates()).map(attachParameterSchema);
  setEaSession(channel, senderId, { flow: 'library', step: 'list', data: { templates: templates.map(t => t.id) } });
  const title = `${breadcrumb(channel, ['ReplayFX', 'EA Library'])}\n\n${fmtBold(channel, 'EA Templates')}`;
  if (!templates.length) return withKeyboard(channel, `${title}\n\nNo templates found. Copy ReplayFX EA .mq5 templates into the EA library folder.`, navRows(true), 'FAILED');
  const options = templates.map((t: any) => ({ label: `${t.name} | ${t.category || 'EA'} | ${t.defaultMode}` }));
  const buttons = templates.slice(0, 12).map((t: any, i: number) => [{ text: t.name, id: `lib:${i}` }]);
  return withKeyboard(channel, waNumbered(channel, title, options, 'Open an EA for details or attach.'), [...buttons, ...navRows(true)]);
}

async function libraryDetail(channel: EaBotChannel, senderId: string, index: number) {
  const templates = (await listTemplates()).map(attachParameterSchema);
  const template = templates[index] as any;
  if (!template) return libraryScreen(channel, senderId);
  setEaSession(channel, senderId, { flow: 'library', step: 'detail', selectedTemplateId: template.id });
  const fields = (template.parameterSchema || []).map((f: any) => f.key).slice(0, 20).join(', ');
  const text = `${breadcrumb(channel, ['ReplayFX', 'EA Library', template.name])}\n\n` +
    `${fmtBold(channel, template.name)}\n` +
    `${fmtBold(channel, 'fileName:')} ${fmtCode(channel, template.fileName)}\n` +
    `${fmtBold(channel, 'templateName:')} ${fmtCode(channel, template.templateName || '-')}\n` +
    `${fmtBold(channel, 'category:')} ${fmtText(channel, template.category || '-')}\n` +
    `${fmtBold(channel, 'default timeframe:')} ${fmtText(channel, template.defaultTimeframe || '-')}\n` +
    `${fmtBold(channel, 'supported config:')} ${fmtText(channel, fields || '-')}`;
  return withKeyboard(channel, text, [[{ text: '🚀 Attach this EA', id: 'lib:attach' }, { text: '⚙ Default config', id: 'lib:config' }], [{ text: '📄 Details', id: 'lib:details' }], ...navRows()]);
}

async function statusScreen(channel: EaBotChannel) {
  const [terminals, instances] = await Promise.all([latestTerminals(), prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 })]);
  const deduped = dedupeActiveInstances(instances);
  const visible = deduped.filter(i => isFreshHeartbeat(i.lastHeartbeatAt));
  const terminalText = terminals.length ? terminals.map((t, i) => `${i + 1}. ${t.terminalId} | ${terminalOnline(t) ? 'online' : 'offline'} | ${t.broker || '-'}`).join('\n') : 'No controller terminal heartbeat yet.';
  const instanceText = visible.length ? visible.slice(0, 12).map((i, n) => `${n + 1}. ${activeInstanceLabel(i)}`).join('\n') : 'No online EA instances yet.';
  const staleCount = deduped.length - visible.length;
  const body = isTelegram(channel)
    ? `${breadcrumb(channel, ['ReplayFX', 'Terminal'])}\n\n${fmtBold(channel, '📡 Terminal Status')}\n${terminalText}\n\n${fmtBold(channel, 'Active EAs')}\n${instanceText}\n${staleCount > 0 ? `\n${fmtBold(channel, 'Stale EA Instances')}\n${staleCount} hidden stale instance(s). Open Runtime Config to view filters.` : ''}`
    : formatWaTerminalStatus(
      terminals.map(t => ({ ...t, online: terminalOnline(t) })),
      visible.map(i => ({ ...i, online: !!(i.lastHeartbeatAt && Date.now() - new Date(i.lastHeartbeatAt).getTime() < 90_000) })),
    );
  return withKeyboard(channel, body, [[{ text: 'Active EAs', id: 'm:config' }, { text: 'Refresh', id: 'nav:refresh' }], ...navRows(true)]);
}

function helpScreen(channel: EaBotChannel) {
  const body = isTelegram(channel)
    ? `${breadcrumb(channel, ['ReplayFX', 'Help'])}\n\n${fmtBold(channel, 'Safe EA management only')}\n\nShortcuts:\n${fmtCode(channel, 'status')}\n${fmtCode(channel, 'symbols xau')}\n${fmtCode(channel, 'charts')}\n${fmtCode(channel, 'screenshot BTCUSD H1')}\n${fmtCode(channel, 'attach ERS BTCUSD H1')}\n${fmtCode(channel, 'config')}\n${fmtCode(channel, 'cleanup')}\n\nManual BUY, SELL, CLOSE_ALL, MODIFY_SL, and MODIFY_TP commands are disabled.`
    : formatWaHelp();
  return withKeyboard(channel, body, navRows());
}

async function handleCallback(channel: EaBotChannel, senderId: string, id: string): Promise<EaBotResponse> {
  const legacyMap: Record<string, string> = {
    'ea:menu': 'm:home',
    'ea:status': 'm:terminal',
    'ea:library': 'm:library',
    'ea:symbols': 'm:symbols',
    'ea:charts': 'm:charts',
    'ea:attach': 'a:start',
    'ea:screenshot': 's:start',
    'ea:config': 'm:config',
    'ea:pause_resume': 'm:pause',
    'ea:cleanup': 'm:cleanup',
    'ea:logs': 'm:logs',
    'ea:help': 'm:help',
  };
  id = legacyMap[id] || id;
  const session = getEaSession(channel, senderId);
  if (id === 'noop') return await mainMenu(channel);
  if (id === 'm:home') {
    clearEaSession(channel, senderId);
    return await mainMenu(channel);
  }
  if (id === 'nav:cancel') {
    clearEaSession(channel, senderId);
    return withKeyboard(channel, 'Cancelled.', [[{ text: '🏠 Menu', id: 'm:home' }]]);
  }
  if (id === 'nav:back') {
    const previous = popEaSession(channel, senderId);
    if (!previous) return await mainMenu(channel);
    return renderCurrent(channel, senderId);
  }
  if (id === 'nav:refresh') return renderCurrent(channel, senderId, true);
  if (id === 'm:terminal') return statusScreen(channel);
  if (id === 'm:library') return libraryScreen(channel, senderId);
  if (id === 'a:start') return terminalScreen(channel, senderId, 'attach');
  if (id === 's:start') return terminalScreen(channel, senderId, 'screenshot');
  if (id === 'm:symbols') return symbolScreen(channel, senderId, 'symbols');
  if (id === 'm:charts') return terminalScreen(channel, senderId, 'charts');
  if (id === 'm:config') return terminalScreen(channel, senderId, 'config');
  if (id === 'm:pause') return terminalScreen(channel, senderId, 'pause');
  if (id === 'm:logs') return commandLogScreen(channel, senderId);
  if (id === 'm:cleanup') return cleanupScreen(channel, senderId);
  if (id === 'm:help') return helpScreen(channel);
  if (id.startsWith('t:')) return selectTerminal(channel, senderId, Number(id.slice(2)));
  if (id.startsWith('e:')) return selectTemplate(channel, senderId, Number(id.slice(2)));
  if (id.startsWith('instf:')) {
    const filter = { ...(session?.data?.activeInstanceFilter || { onlineOnly: true, showStale: false, ea: '', symbol: '', timeframe: '' }) };
    const key = id.slice('instf:'.length);
    if (key === 'online') filter.onlineOnly = !filter.onlineOnly;
    if (key === 'stale') filter.showStale = !filter.showStale;
    if (key === 'ea') {
      setEaSession(channel, senderId, { flow: 'config', step: 'select_instance_filter', data: { activeInstanceFilter: { ...filter, inputKey: 'ea' } } });
      return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Filter by EA'])}\n\nType part of EA name.`, navRows(true));
    }
    if (key === 'symbol') {
      setEaSession(channel, senderId, { flow: 'config', step: 'select_instance_filter', data: { activeInstanceFilter: { ...filter, inputKey: 'symbol' } } });
      return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Filter by Symbol'])}\n\nType part of symbol, e.g. ${fmtCode(channel, 'BTC')}.`, navRows(true));
    }
    if (key === 'timeframe') {
      setEaSession(channel, senderId, { flow: 'config', step: 'select_instance_filter', data: { activeInstanceFilter: { ...filter, inputKey: 'timeframe' } } });
      return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Filter by Timeframe'])}\n\nType timeframe like ${fmtCode(channel, 'M5')} or ${fmtCode(channel, 'H1')}.`, navRows(true));
    }
    if (key === 'cleanup') {
      const stale = dedupeActiveInstances(await prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 })).filter(i => !isFreshHeartbeat(i.lastHeartbeatAt));
      setEaSession(channel, senderId, { flow: 'config', step: 'cleanup_stale_confirm', data: { staleInstanceIds: stale.map(i => i.id) } });
      return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Cleanup Stale'])}\n\n${stale.length} stale instance(s) detected. This will not delete records; it only removes stale entries from the current selector view. Reply yes to clear the filter cache.`, [[{ text: 'Confirm Cleanup', id: 'instf:cleanup_confirm' }], ...navRows()]);
    }
    if (key === 'cleanup_confirm') {
      setEaSession(channel, senderId, { flow: 'config', step: 'select_instance', data: { activeInstanceFilter: { onlineOnly: true, showStale: false, ea: '', symbol: '', timeframe: '' } } });
      return instanceScreen(channel, senderId, 'config');
    }
    setEaSession(channel, senderId, { flow: 'config', step: 'select_instance', data: { activeInstanceFilter: filter } });
    return instanceScreen(channel, senderId, 'config');
  }
  if (id.startsWith('lib:')) {
    if (id === 'lib:attach') {
      setEaSession(channel, senderId, { flow: 'attach', step: 'select_terminal' });
      return terminalScreen(channel, senderId, 'attach');
    }
    if (id === 'lib:config' || id === 'lib:details') return libraryDetail(channel, senderId, 0);
    return libraryDetail(channel, senderId, Number(id.slice(4)));
  }
  if (id.startsWith('q:')) return symbolScreen(channel, senderId, session?.flow || 'symbols', id.slice(2), 0);
  if (id === 'pg:prev') return symbolScreen(channel, senderId, session?.flow || 'symbols', session?.searchQuery, (session?.page || 0) - 1);
  if (id === 'pg:next') return symbolScreen(channel, senderId, session?.flow || 'symbols', session?.searchQuery, (session?.page || 0) + 1);
  if (id.startsWith('sym:')) return selectSymbol(channel, senderId, Number(id.slice(4)));
  if (id.startsWith('tf:')) {
    setEaSession(channel, senderId, { selectedTimeframe: id.slice(3) });
    return session?.flow === 'screenshot' ? screenshotPreview(channel, senderId) : modeScreen(channel, senderId);
  }
  if (id.startsWith('mode:')) {
    setEaSession(channel, senderId, { selectedMode: id.slice(5) });
    return attachPreview(channel, senderId);
  }
  if (id === 'a:change_symbol') return symbolScreen(channel, senderId, 'attach');
  if (id === 'a:change_tf') return timeframeScreen(channel, senderId, 'attach');
  if (id === 'a:change_ea') return templateScreen(channel, senderId);
  if (id === 'a:confirm') return confirmAttach(channel, senderId);
  if (id === 'ss:current') {
    setEaSession(channel, senderId, { selectedSymbol: undefined, selectedTimeframe: undefined });
    return screenshotPreview(channel, senderId);
  }
  if (id === 'ss:charts') return chartsScreen(channel, senderId);
  if (id === 'ss:search') return symbolScreen(channel, senderId, 'screenshot');
  if (id === 's:confirm') return confirmScreenshot(channel, senderId);
  if (id.startsWith('ch:')) return chartDetail(channel, senderId, Number(id.slice(3)));
  if (id === 'cd:screenshot') {
    setEaSession(channel, senderId, { flow: 'screenshot', step: 'confirm_screenshot' });
    return screenshotPreview(channel, senderId);
  }
  if (id === 'cd:attach') {
    setEaSession(channel, senderId, { flow: 'attach', step: 'select_template' });
    return templateScreen(channel, senderId);
  }
  if (id === 'cd:config') return configDetail(channel, senderId);
  if (id === 'cd:pause') return queuePauseResume(channel, senderId, 'pause');
  if (id === 'cd:resume') return queuePauseResume(channel, senderId, 'resume');
  if (id.startsWith('inst:')) return session?.flow === 'pause' ? queuePauseResume(channel, senderId, 'pause', undefined, undefined) : configDetail(channel, senderId, Number(id.slice(5)));
  if (id.startsWith('cfgmode:')) {
    const mode = id.slice('cfgmode:'.length);
    if (session?.selectedInstanceId && EA_MODES.includes(mode as any)) {
      const instance = await prisma.eaInstance.findUnique({ where: { id: session.selectedInstanceId } }).catch(() => null);
      const snapshot = instance ? await getEaConfigSnapshot(instance.id).catch(() => null) : null;
      if (snapshot?.syncStatus === 'DRIFT') return configDecisionScreen(channel, senderId, { mode }, `Mode changed to ${mode}.`);
      return configConfirmScreen(channel, senderId, { mode });
    }
    return configDetail(channel, senderId);
  }
  if (id.startsWith('cfg:')) return handleConfigCallback(channel, senderId, id.slice(4));
  if (id === 'cfgpage:prev') return handleConfigCallback(channel, senderId, `page:${Math.max(0, (session?.data?.configPage || 0) - 1)}`);
  if (id === 'cfgpage:next') return handleConfigCallback(channel, senderId, `page:${(session?.data?.configPage || 0) + 1}`);
  if (id.startsWith('cfgk:')) {
    const [, pageStr, indexStr] = id.split(':');
    const page = Number(pageStr);
    const index = Number(indexStr);
    const configKeys = session?.data?.configKeys || [];
    const key = configKeys[page * CONFIG_PAGE_SIZE + index];
    if (!key) return configDetail(channel, senderId);
    return handleConfigCallback(channel, senderId, key);
  }
  if (id.startsWith('cfgconfirm:')) return confirmConfigUpdate(channel, senderId, id.slice('cfgconfirm:'.length) as 'apply' | 'sync');
  if (id.startsWith('log:')) {
    if (id === 'log:retry') return withKeyboard(channel, 'Retry is available from the original workflow screen for safety. Open Attach/Screenshot and confirm again.', navRows(), 'SUCCESS');
    if (id === 'log:ss') return terminalScreen(channel, senderId, 'screenshot');
    return commandDetail(channel, senderId, Number(id.slice(4)));
  }
  if (id === 'clean:confirm') return confirmCleanup(channel, senderId);
  return await mainMenu(channel);
}

async function handleConfigCallback(channel: EaBotChannel, senderId: string, key: string) {
  const session = getEaSession(channel, senderId);
  if (!session?.selectedInstanceId) return instanceScreen(channel, senderId, 'config');
  if (key === 'sync') return executeConfigSync(channel, senderId);
  if (key === 'clear') return executeConfigSync(channel, senderId);
  if (key === 'apply') return executeApplyStored(channel, senderId);
  if (key.startsWith('edit')) {
    const page = key.includes(':') ? Number(key.split(':')[1]) : session.page || 0;
    return configParamScreen(channel, senderId, Number.isFinite(page) ? page : 0);
  }
  if (key === 'back') return configDetail(channel, senderId);
  if (key.startsWith('page:')) return configParamScreen(channel, senderId, Number(key.slice(5)) || 0);
  if (key === 'save') {
    return executeApplyStored(channel, senderId);
  }
  if (key === 'mode') {
    setEaSession(channel, senderId, { step: 'config_mode', selectedConfigKey: 'mode', data: { options: MODES } });
    return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Change Mode'])}\n\nSelect mode.`, MODES.map(mode => [{ text: mode, id: `cfgmode:${mode}` }]).concat(navRows()));
  }
  if (key === 'allowBuy' || key === 'allowSell') {
    const config = await prisma.eaRuntimeConfig.findUnique({ where: { instanceId: session.selectedInstanceId } }).catch(() => null);
    const next = !(key === 'allowBuy' ? config?.allowBuy ?? true : config?.allowSell ?? true);
    const instance = await prisma.eaInstance.findUnique({ where: { id: session.selectedInstanceId } }).catch(() => null);
    const snapshot = instance ? await getEaConfigSnapshot(instance.id).catch(() => null) : null;
    if (snapshot?.syncStatus === 'DRIFT') return configDecisionScreen(channel, senderId, { [key]: next }, `${key} changed to ${next}.`);
    return configConfirmScreen(channel, senderId, { [key]: next });
  }
  const instance = await prisma.eaInstance.findUnique({ where: { id: session.selectedInstanceId } }).catch(() => null);
  if (!instance) return instanceScreen(channel, senderId, 'config');
  const snapshot = await getEaConfigSnapshot(instance.id).catch(() => null);
  const fields = await buildConfigFieldMeta(instance, snapshot);
  const meta = fields.find(field => field.key === key);
  if (!meta) return configDetail(channel, senderId);
  if (!meta.liveEditable) {
    const message = `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', meta.key])}\n\n${fmtBold(channel, 'Detected from source, but this EA does not apply it live yet.')}\n${fmtText(channel, 'Rebuild the EA with ReplayFX runtime bridge to edit this parameter live.')}\n${fmtCode(channel, `${meta.parameterKey} = ${formatConfigValue(meta.defaultValue)}`)}\n\n${fmtBold(channel, 'Source:')} ${fmtText(channel, `${meta.sourceFile || '-'}:${meta.lineNumber || '-'}`)}`;
    return withKeyboard(channel, message, [[{ text: 'Back to Config', id: 'cfg:back' }], ...navRows(true)], 'REJECTED');
  }
  setEaSession(channel, senderId, { step: 'config_value', selectedConfigKey: key, data: { configFieldMeta: meta, configKeys: session.data.configKeys || fields.map(field => field.key), configPage: session.data.configPage || 0 } });
  const valueHint = meta.type === 'boolean' ? 'true/false' : meta.type === 'mode' ? `one of ${MODES.join(', ')}` : meta.type === 'number' ? 'numeric value' : 'text value';
  return withKeyboard(channel, `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', meta.key])}\n\nCurrent value: ${fmtCode(channel, formatConfigValue(configFieldValue(meta)))}\nType a new ${valueHint} for ${fmtCode(channel, meta.key)}.`, navRows(true));
}

function configConfirmScreen(channel: EaBotChannel, senderId: string, patch: Record<string, any>) {
  const session = setEaSession(channel, senderId, { step: 'config_confirm', data: { pendingConfigPatch: patch } });
  const lines = Object.entries(patch).map(([key, value]) => `${key}: ${value}`);
  const body = isTelegram(channel)
    ? `${breadcrumb(channel, ['ReplayFX', 'Runtime Config', 'Confirm'])}\n\n${fmtBold(channel, 'Confirm config update')}\n${lines.map(line => fmtCode(channel, line)).join('\n')}\n\nReply ${fmtCode(channel, 'yes')} to queue UPDATE_CONFIG.`
    : `${waBox('Confirm Config Update', [
      `Instance: ${session.selectedInstanceId || '-'}`,
      ...lines,
    ])}\n\nReply *yes* to confirm or *cancel*.`;
  return withKeyboard(channel, body, [[{ text: 'Confirm Save', id: 'cfgconfirm:apply' }], ...navRows()], 'CONFIRMATION_REQUIRED');
}

async function confirmConfigUpdate(channel: EaBotChannel, senderId: string, action: 'apply' | 'sync' = 'apply') {
  const session = getEaSession(channel, senderId);
  const patch = session?.data?.pendingConfigPatch || {};
  if (!session?.selectedInstanceId || !Object.keys(patch).length) return configDetail(channel, senderId);
  if (action === 'sync') return executeConfigSync(channel, senderId);
  const instance = await prisma.eaInstance.findUnique({ where: { id: session.selectedInstanceId } }).catch(() => null);
  if (!instance) return instanceScreen(channel, senderId, 'config');
  await upsertRuntimeConfig(session.selectedInstanceId, patch);
  const command = await createEaCommand({
    terminalId: instance.terminalId,
    commandType: 'UPDATE_CONFIG',
    source: channel === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS',
    payload: { instanceId: session.selectedInstanceId, symbol: instance.symbol, timeframe: instance.timeframe, ...patch },
  });
  clearEaSession(channel, senderId);
  const body = isTelegram(channel)
    ? `${fmtBold(channel, 'Config update queued')}\n${fmtBold(channel, 'Command:')} ${fmtCode(channel, shortCommandId(command.id))}`
    : waBox('Config Update Queued', [`Command: ${shortCommandId(command.id)}`, ...Object.entries(patch).map(([key, value]) => `${key}: ${value}`)]);
  return withKeyboard(channel, body, [], 'QUEUED', command.id);
}

async function renderCurrent(channel: EaBotChannel, senderId: string, refresh = false): Promise<EaBotResponse> {
  const session = getEaSession(channel, senderId);
  if (!session) return await mainMenu(channel);
  if (session.flow === 'attach') {
    if (session.step === 'select_terminal') return terminalScreen(channel, senderId, 'attach');
    if (session.step === 'select_template') return templateScreen(channel, senderId);
    if (session.step === 'select_symbol') return symbolScreen(channel, senderId, 'attach', session.searchQuery, session.page);
    if (session.step === 'select_timeframe') return timeframeScreen(channel, senderId, 'attach');
    if (session.step === 'select_mode') return modeScreen(channel, senderId);
    if (session.step === 'confirm_attach') return attachPreview(channel, senderId);
  }
  if (session.flow === 'screenshot') {
    if (session.step === 'select_terminal') return terminalScreen(channel, senderId, 'screenshot');
    if (session.step === 'select_source') return screenshotSourceScreen(channel, senderId);
    if (session.step === 'select_symbol') return symbolScreen(channel, senderId, 'screenshot', session.searchQuery, session.page);
    if (session.step === 'select_timeframe') return timeframeScreen(channel, senderId, 'screenshot');
    if (session.step === 'confirm_screenshot') return screenshotPreview(channel, senderId);
  }
  if (session.flow === 'charts') return session.step === 'chart_detail' && !refresh ? chartDetail(channel, senderId, session.selectedChartIndex || 0) : chartsScreen(channel, senderId);
  if (session.flow === 'library') return libraryScreen(channel, senderId);
  if (session.flow === 'config') {
    if (!session.selectedInstanceId) return instanceScreen(channel, senderId, 'config');
    if (session.step === 'config_select') return configParamScreen(channel, senderId, session.page || 0);
    if (session.step === 'config_confirm' && session.data?.pendingConfigPatch) return configDecisionScreen(channel, senderId, session.data.pendingConfigPatch, session.data.pendingConfigReason || 'Confirm config update.');
    return configDetail(channel, senderId);
  }
  if (session.flow === 'logs') return commandLogScreen(channel, senderId);
  if (session.flow === 'cleanup') return cleanupScreen(channel, senderId);
  return await mainMenu(channel);
}

async function handleTypedSession(channel: EaBotChannel, senderId: string, text: string): Promise<EaBotResponse | null> {
  const session = getEaSession(channel, senderId);
  if (!session) return null;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (['cancel', '/cancel'].includes(lower)) {
    clearEaSession(channel, senderId);
    return withKeyboard(channel, 'Cancelled.', [[{ text: '🏠 Menu', id: 'm:home' }]]);
  }
  if (lower === 'back') {
    popEaSession(channel, senderId);
    return renderCurrent(channel, senderId);
  }
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    if (session.flow === 'menu' && session.step === 'home') {
      if (index === 0) return statusScreen(channel);
      if (index === 1) return libraryScreen(channel, senderId);
      if (index === 2) return terminalScreen(channel, senderId, 'attach');
      if (index === 3) return terminalScreen(channel, senderId, 'screenshot');
      if (index === 4) return symbolScreen(channel, senderId, 'symbols');
      if (index === 5) return terminalScreen(channel, senderId, 'charts');
      if (index === 6) return terminalScreen(channel, senderId, 'config');
      if (index === 7) return terminalScreen(channel, senderId, 'pause');
      if (index === 8) return commandLogScreen(channel, senderId);
      if (index === 9) return cleanupScreen(channel, senderId);
      if (index === 10) return helpScreen(channel);
    }
    if (session.step === 'select_terminal') return selectTerminal(channel, senderId, index);
    if (session.step === 'select_template') return selectTemplate(channel, senderId, index);
    if (session.step === 'select_symbol') return selectSymbol(channel, senderId, index);
    if (session.step === 'select_timeframe') {
      const tf = TIMEFRAMES[index];
      if (tf) {
        setEaSession(channel, senderId, { selectedTimeframe: tf });
        return session.flow === 'screenshot' ? screenshotPreview(channel, senderId) : modeScreen(channel, senderId);
      }
    }
    if (session.step === 'select_mode') {
      const mode = MODES[index];
      if (mode) {
        setEaSession(channel, senderId, { selectedMode: mode });
        return attachPreview(channel, senderId);
      }
    }
    if (session.step === 'select_source') {
      if (index === 0) return handleCallback(channel, senderId, 'ss:current');
      if (index === 1) return handleCallback(channel, senderId, 'ss:charts');
      if (index === 2) return handleCallback(channel, senderId, 'ss:search');
    }
    if (session.step === 'chart_list') return chartDetail(channel, senderId, index);
    if (session.step === 'chart_detail') {
      if (index === 0) return screenshotPreview(channel, senderId);
      if (index === 1) return templateScreen(channel, senderId);
      if (index === 2) return configDetail(channel, senderId);
      if (index === 3) return queuePauseResume(channel, senderId, 'pause');
      if (index === 4) return queuePauseResume(channel, senderId, 'resume');
      if (index === 5) return chartsScreen(channel, senderId);
    }
    if (session.step === 'select_instance') return session.flow === 'pause' ? queuePauseResume(channel, senderId, 'pause') : configDetail(channel, senderId, index);
    if (session.step === 'config_select') {
      const keys = session.data.configKeys || [];
      const page = session.data.configPage || 0;
      const key = keys[page * CONFIG_PAGE_SIZE + index];
      if (key) return handleConfigCallback(channel, senderId, key);
    }
    if (session.step === 'config_confirm') {
      if (index === 0) return confirmConfigUpdate(channel, senderId, 'apply');
      if (index === 1) return confirmConfigUpdate(channel, senderId, 'sync');
      if (index === 2) return withKeyboard(channel, 'Cancelled.', [[{ text: '🏠 Menu', id: 'm:home' }]]);
    }
    if (session.step === 'config_detail') {
      const keys = session.data.configKeys || [];
      const page = session.data.configPage || 0;
      const key = keys[page * CONFIG_PAGE_SIZE + index];
      if (key) return handleConfigCallback(channel, senderId, key);
      if (index === 0) return handleConfigCallback(channel, senderId, 'mode');
      if (index === 1) return handleConfigCallback(channel, senderId, 'edit');
      if (index === 2) return handleConfigCallback(channel, senderId, 'sync');
      if (index === 3) return handleConfigCallback(channel, senderId, 'apply');
      if (index === 4) return renderCurrent(channel, senderId, true);
    }
    if (session.flow === 'logs' && session.step === 'list') return commandDetail(channel, senderId, index);
    if (session.flow === 'logs' && session.step === 'detail') {
      if (index === 0) return withKeyboard(channel, 'Retry is available from the original workflow screen for safety. Open Attach/Screenshot and confirm again.', navRows(), 'SUCCESS');
      if (index === 1) return terminalScreen(channel, senderId, 'screenshot');
      if (index === 2) return commandLogScreen(channel, senderId);
    }
  }
  if (['yes', 'y', 'confirm'].includes(lower)) {
    if (session.step === 'confirm_attach') return confirmAttach(channel, senderId);
    if (session.step === 'confirm_screenshot') return confirmScreenshot(channel, senderId);
    if (session.step === 'config_confirm') return confirmConfigUpdate(channel, senderId);
    if (session.flow === 'cleanup') return confirmCleanup(channel, senderId);
  }
  if (session.step === 'select_symbol') return symbolScreen(channel, senderId, session.flow, trimmed, 0);
  if (session.step === 'select_instance_filter') {
    const filter = { ...(session.data.activeInstanceFilter || { onlineOnly: true, showStale: false, ea: '', symbol: '', timeframe: '' }) };
    const key = filter.inputKey || 'ea';
    filter[key] = trimmed;
    delete filter.inputKey;
    setEaSession(channel, senderId, { flow: 'config', step: 'select_instance', data: { activeInstanceFilter: filter } });
    return instanceScreen(channel, senderId, 'config');
  }
    if (session.step === 'config_value' && session.selectedConfigKey && session.selectedInstanceId) {
      const meta = session.data?.configFieldMeta || null;
      const parsed = meta ? parseConfigInputValue(trimmed, meta) : { ok: true, value: trimmed };
      if (!parsed.ok) return withKeyboard(channel, parsed.error || 'Invalid value.', navRows(true), 'REJECTED');
      const patch = { [session.selectedConfigKey]: parsed.value };
      const snapshot = await getEaConfigSnapshot(session.selectedInstanceId).catch(() => null);
      if (snapshot?.syncStatus === 'DRIFT') {
        return configDecisionScreen(channel, senderId, patch, `Parameter ${session.selectedConfigKey} changed from ${formatConfigValue(configFieldValue(meta || { stored: null, actual: null, key: session.selectedConfigKey } as any))} to ${formatConfigValue(parsed.value)}.`);
      }
      return configConfirmScreen(channel, senderId, patch);
    }
  return null;
}

export async function handleEaBotInput(channel: EaBotChannel, senderId: string, input: { text?: string; callbackData?: string }): Promise<EaBotResponse> {
  try {
    if (input.callbackData) return handleCallback(channel, senderId, input.callbackData);
    const text = input.text || '';
    const active = await handleTypedSession(channel, senderId, text);
    if (active) return active;
    if (!isTelegram(channel) && text.trim().toLowerCase() === 'menu') {
      setEaSession(channel, senderId, { flow: 'menu', step: 'home' });
      return await mainMenu(channel);
    }
    const shortcut = await processShortcut(channel, senderId, text);
    if (shortcut) return shortcut;
    return await mainMenu(channel);
  } catch (error: any) {
    return withKeyboard(channel, `${fmtBold(channel, 'Error')}\n${fmtText(channel, error.message || 'EA Control failed.')}`, navRows(true), 'FAILED');
  }
}

export function isEaBotText(text: string) {
  const lower = text.trim().toLowerCase();
  const first = lower.split(/\s+/)[0];
  return lower === 'menu' || lower === 'help' || lower === 'status' || lower === 'charts' || lower === 'config' || lower === 'cleanup' || lower === 'logs' ||
    lower.startsWith('/') || ['symbols', 'screenshot', 'attach', 'pause', 'resume'].includes(first);
}
