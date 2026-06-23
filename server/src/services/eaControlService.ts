import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../prisma';

export const EA_MODES = ['AUTO', 'NOTIFY_ONLY', 'APPROVAL_REQUIRED', 'PAUSED'] as const;
const BLOCKED_REMOTE_TRADING = new Set(['/buy', '/sell', '/close_all', '/modify_sl', '/modify_tp', 'buy', 'sell', 'close_all', 'modify_sl', 'modify_tp']);
const BLOCKED_EA_COMMAND_TYPES = new Set(['BUY', 'SELL', 'CLOSE_ALL', 'MODIFY_SL', 'MODIFY_TP']);
const DEFAULT_TERMINAL_ID = 'default';
export type EaControlChannel = 'TELEGRAM' | 'WHATSAPP' | 'WHATSAPP_BAILEYS';
export type EaControlIntent =
  | { type: 'menu' | 'help' | 'status' | 'library' | 'charts' | 'config' | 'logs' }
  | { type: 'symbols'; query?: string }
  | { type: 'screenshot'; symbol?: string; timeframe?: string; hideGui?: boolean }
  | { type: 'attach'; templateRef?: string; symbol?: string; timeframe?: string; mode?: string }
  | { type: 'pause' | 'resume'; symbol?: string; timeframe?: string }
  | { type: 'cleanup'; confirmed?: boolean }
  | { type: 'blocked_manual_trade' | 'unknown' };

export function isEaControlCommand(text: string) {
  const trimmed = text.trim().toLowerCase();
  const first = trimmed.split(/\s+/)[0];
  if (BLOCKED_REMOTE_TRADING.has(first)) return true;
  if (['/ea', '/pair', '/chart', '/attach', '/mode', '/config', '/set', '/signals', '/approve', '/reject', '/screenshot', '/start', '/help', '/status', '/symbols', '/charts', '/cleanup', '/logs'].includes(first)) return true;
  return trimmed === 'menu' ||
    trimmed === '/menu' ||
    trimmed === 'help' ||
    trimmed === 'symbols' ||
    trimmed === 'charts' ||
    trimmed === 'cleanup' ||
    trimmed === 'logs' ||
    trimmed === 'list ea' ||
    trimmed === 'ea library' ||
    trimmed === 'list terminals' ||
    trimmed === 'active eas' ||
    trimmed === 'status' ||
    trimmed === 'cancel pending' ||
    trimmed.startsWith('symbols ') ||
    trimmed.startsWith('charts ') ||
    trimmed.startsWith('list ea ') ||
    trimmed.startsWith('attach ') ||
    trimmed.startsWith('screenshot ') ||
    trimmed.startsWith('set mode ') ||
    trimmed.startsWith('set ') ||
    trimmed.startsWith('pause ') ||
    trimmed.startsWith('resume ');
}

export function isBlockedManualTradeCommand(text: string) {
  const first = text.trim().toLowerCase().split(/\s+/)[0];
  const upper = text.trim().toUpperCase().split(/\s+/)[0];
  return BLOCKED_REMOTE_TRADING.has(first) || BLOCKED_EA_COMMAND_TYPES.has(upper);
}

export function parseJson<T = any>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function makeApprovalCode(prefix = 'EA') {
  return `${prefix}${crypto.randomInt(100000, 1000000)}`;
}

function stringify(value: unknown) {
  return JSON.stringify(value ?? {});
}

type EaParameterSchemaItem = {
  key: string;
  parameterKey: string;
  rawName: string;
  label: string;
  type: 'mode' | 'number' | 'boolean' | 'text' | 'enum';
  defaultValue?: any;
  sourceFile?: string;
  lineNumber?: number;
  safeEditable: boolean;
  enumName?: string;
  options?: string[];
  group?: string | null;
  comment?: string | null;
  liveEditable: boolean;
};

const schemaCache = new Map<string, { mtimeMs: number; size: number; schema: EaParameterSchemaItem[] }>();

function normalizeInputKey(rawName: string) {
  const stripped = rawName.replace(/^Inp/, '').replace(/^ReplayFX_/, '').replace(/^_+|_+$/g, '');
  if (!stripped) return rawName;
  const split = stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!split.length) return rawName;
  return split.map((part, index) => {
    const lower = part.toLowerCase();
    if (index === 0) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');
}

function schemaTypeFromMql(typeName: string): EaParameterSchemaItem['type'] {
  const t = typeName.trim();
  if (t === 'bool') return 'boolean';
  if (['int', 'long', 'double', 'float'].includes(t)) return 'number';
  if (t === 'ENUM_REPLAYFX_MODE') return 'mode';
  if (t === 'string') return 'text';
  if (t.startsWith('ENUM_')) return 'enum';
  return 'text';
}

function parseDefaultValue(raw: string, type: EaParameterSchemaItem['type']) {
  const value = raw.trim().replace(/;$/, '');
  if (type === 'boolean') return /^true$/i.test(value) ? true : /^false$/i.test(value) ? false : value;
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value.replace(/^"|"$/g, '');
}

function isSafeEditableParameter(rawName: string) {
  const lower = rawName.toLowerCase();
  if (lower.includes('secret') || lower.includes('token') || lower.includes('backendurl') || lower.includes('password')) return false;
  return true;
}

function findEaLibraryFile(fileName?: string | null) {
  if (!fileName) return null;
  for (const dir of getEaLibraryDirs()) {
    const fullPath = path.resolve(dir, fileName);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

export function scanEaParameterSchemaFromFile(filePath: string): EaParameterSchemaItem[] {
  const stat = fs.statSync(filePath);
  const cacheKey = path.resolve(filePath);
  const cached = schemaCache.get(cacheKey);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.schema;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const enumOptionsByName = new Map<string, string[]>();
  let currentEnum: { name: string; values: string[] } | null = null;
  for (const line of lines) {
    const enumStart = line.match(/^\s*enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
    if (enumStart) {
      currentEnum = { name: enumStart[1], values: [] };
      const afterBrace = line.split('{', 2)[1] || '';
      if (afterBrace.includes('}')) {
        const body = afterBrace.split('}', 1)[0];
        currentEnum.values.push(...body.split(',').map(v => v.split('//')[0].trim()).filter(Boolean));
        enumOptionsByName.set(currentEnum.name, currentEnum.values.map(v => v.replace(/=.*/, '').trim()));
        currentEnum = null;
        continue;
      }
      const body = afterBrace.split('}', 1)[0];
      if (body.trim()) currentEnum.values.push(...body.split(',').map(v => v.split('//')[0].trim()).filter(Boolean));
      continue;
    }
    if (currentEnum) {
      const closing = line.includes('}');
      const body = closing ? line.split('}', 1)[0] : line;
      if (body.trim()) currentEnum.values.push(...body.split(',').map(v => v.split('//')[0].trim()).filter(Boolean));
      if (closing) {
        enumOptionsByName.set(currentEnum.name, currentEnum.values.map(v => v.replace(/=.*/, '').trim()));
        currentEnum = null;
      }
    }
  }

  const schema: EaParameterSchemaItem[] = [];
  let currentGroup: string | null = null;
  let pendingComment: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const groupMatch = line.match(/^\s*input\s+group\s+"([^"]+)"/i);
    if (groupMatch) {
      currentGroup = groupMatch[1];
      pendingComment = null;
      continue;
    }
    const commentOnly = line.match(/^\s*\/\/\s*(.+)$/);
    if (commentOnly) {
      pendingComment = commentOnly[1].trim();
      continue;
    }
    if (!line.trim()) {
      pendingComment = null;
      continue;
    }
    const match = line.match(/^\s*input\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?);\s*(?:\/\/\s*(.*))?$/);
    if (!match) continue;
    const typeName = match[1];
    const rawName = match[2];
    const defaultRaw = match[3] || '';
    const inlineComment = (match[4] || '').trim();
    const type = schemaTypeFromMql(typeName);
    const safeEditable = isSafeEditableParameter(rawName);
    const comment = inlineComment || pendingComment || null;
    const options = typeName === 'ENUM_REPLAYFX_MODE'
      ? [...EA_MODES]
      : typeName === 'ENUM_TIMEFRAMES'
        ? ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1']
        : enumOptionsByName.get(typeName) || undefined;
    schema.push({
      key: normalizeInputKey(rawName),
      parameterKey: rawName,
      rawName,
      label: comment || rawName.replace(/^Inp/, '').replace(/^ReplayFX_/, '').replace(/_/g, ' '),
      type,
      defaultValue: parseDefaultValue(defaultRaw, type),
      sourceFile: path.basename(filePath),
      lineNumber: i + 1,
      safeEditable,
      enumName: typeName.startsWith('ENUM_') || enumOptionsByName.has(typeName) ? typeName : undefined,
      options,
      group: currentGroup,
      comment,
      liveEditable: false,
    });
    pendingComment = null;
  }
  schemaCache.set(cacheKey, { mtimeMs: stat.mtimeMs, size: stat.size, schema });
  return schema;
}

function sourceLookupDirs() {
  return [
    path.resolve(process.cwd(), 'integrations', 'mt5', 'ea-library'),
    path.resolve(process.cwd(), 'integrations', 'mt5'),
    '/home/vallencia/ea list/replayfx-integrated',
  ];
}

export function resolveEaSourceFile(fileName?: string | null) {
  if (!fileName) return null;
  const normalized = path.basename(fileName);
  for (const dir of sourceLookupDirs()) {
    const candidate = path.resolve(dir, normalized);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function getTemplateFamily(input?: { fileName?: string | null; name?: string | null; category?: string | null } | null) {
  const text = `${input?.fileName || ''} ${input?.name || ''} ${input?.category || ''}`.toLowerCase();
  if (text.includes('breakout')) return 'breakout';
  if (text.includes('crt') || text.includes('candle range')) return 'crt';
  if (text.includes('grid') || text.includes('ers')) return 'grid';
  if (text.includes('momentum')) return 'momentum';
  return 'breakout';
}

export function attachParameterSchema<T extends { fileName?: string | null; name?: string | null; category?: string | null }>(template: T) {
  const family = getTemplateFamily(template);
  const filePath = resolveEaSourceFile(template.fileName);
  const scanned = filePath ? scanEaParameterSchemaFromFile(filePath) : [];
  return { ...template, parameterFamily: family, parameterSchema: scanned };
}

export async function getEaParametersByFileName(fileName: string) {
  const filePath = resolveEaSourceFile(fileName);
  if (!filePath) {
    throw new Error(`EA source file not found: ${fileName}`);
  }
  const params = scanEaParameterSchemaFromFile(filePath);
  return {
    fileName: path.basename(filePath),
    sourceFile: filePath,
    eaName: path.basename(filePath).replace(/_ReplayFX\.mq5$/i, '').replace(/\.mq5$/i, '').replace(/[_-]+/g, ' ').trim(),
    parameters: params,
  };
}

export async function getEaParametersByTemplateId(templateId: string) {
  const template = await prisma.eaTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error('Template not found.');
  const result = await getEaParametersByFileName(template.fileName);
  return { ...result, template };
}

export function generateRuntimeBridgePatch(sourceFile: string, parameters: EaParameterSchemaItem[]) {
  const lines: string[] = [];
  lines.push(`// ReplayFX runtime bridge generated from ${path.basename(sourceFile)}`);
  lines.push(`// Use these runtime variables instead of input variables where live editing is required.`);
  lines.push('');
  for (const param of parameters) {
    if (!param.safeEditable) continue;
    const runtimeName = `Runtime${param.rawName}`;
    lines.push(`// ${param.parameterKey || param.rawName}`);
    lines.push(`// input ${param.rawName} -> ${runtimeName}`);
    lines.push(`// OnInit: ${runtimeName} = ${param.rawName};`);
    lines.push(`// ApplyCustomConfig: if ReplayFX_ConfigHas("${param.rawName}") ${runtimeName} = ReplayFX_ConfigValue("${param.rawName}", ${runtimeName});`);
    lines.push('');
  }
  return lines.join('\n');
}

export function mergeConfigCustomParams(config: any) {
  if (!config) return config;
  const custom = parseJson<Record<string, any>>(config.customParamsJson, {});
  return { ...config, ...custom };
}

function sortObject(value: any): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.keys(value).sort().reduce((acc: Record<string, any>, key) => {
    const current = value[key];
    if (current === undefined) return acc;
    acc[key] = sortObject(current);
    return acc;
  }, {});
}

function extractHeartbeatActualConfig(heartbeat: any) {
  const payload = parseJson<any>(heartbeat?.payloadJson, {});
  const candidate = payload?.currentConfig || payload?.config || payload?.eaConfig || null;
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
  return null;
}

function compareConfigs(stored: Record<string, any> | null | undefined, actual: Record<string, any> | null | undefined) {
  const storedClean = sortObject(stored || {});
  const actualClean = sortObject(actual || {});
  const storedJson = JSON.stringify(storedClean);
  const actualJson = JSON.stringify(actualClean);
  const synced = !!storedJson && !!actualJson && storedJson === actualJson;
  const keys = new Set([...Object.keys(storedClean || {}), ...Object.keys(actualClean || {})]);
  const diffs = [...keys].filter(key => {
    const s = storedClean?.[key];
    const a = actualClean?.[key];
    return JSON.stringify(sortObject(s)) !== JSON.stringify(sortObject(a));
  }).map(key => ({
    key,
    stored: storedClean?.[key] ?? null,
    actual: actualClean?.[key] ?? null,
  }));
  return { synced, diffs };
}

export async function getEaConfigSnapshot(instanceId: string) {
  const instance = await prisma.eaInstance.findUnique({ where: { id: instanceId } }).catch(() => null);
  if (!instance) return null;
  const storedConfig = mergeConfigCustomParams(await prisma.eaRuntimeConfig.findUnique({ where: { instanceId } }).catch(() => null)) || null;
  const heartbeat = await prisma.eaTerminalHeartbeat.findFirst({
    where: instance.chartId
      ? { terminalId: instance.terminalId, chartId: instance.chartId }
      : { terminalId: instance.terminalId, symbol: instance.symbol, timeframe: instance.timeframe },
    orderBy: { timestamp: 'desc' },
  });
  const actualConfig = extractHeartbeatActualConfig(heartbeat);
  const comparison = compareConfigs(storedConfig, actualConfig);
  return {
    instance,
    storedConfig,
    actualConfig,
    heartbeat: heartbeat || null,
    syncStatus: heartbeat && actualConfig ? (comparison.synced ? 'SYNCED' : 'DRIFT') : 'UNKNOWN',
    comparison,
  };
}

export async function syncEaRuntimeConfigFromActual(instanceId: string) {
  const snapshot = await getEaConfigSnapshot(instanceId);
  if (!snapshot?.instance) {
    throw new Error('EA instance not found.');
  }
  if (!snapshot.actualConfig) {
    throw new Error('EA heartbeat has not reported currentConfig yet.');
  }
  const config = await upsertRuntimeConfig(instanceId, snapshot.actualConfig);
  return { snapshot, config };
}

export async function applyEaStoredConfigToController(instanceId: string, source = 'SYSTEM') {
  const instance = await prisma.eaInstance.findUnique({ where: { id: instanceId } }).catch(() => null);
  if (!instance) throw new Error('EA instance not found.');
  const stored = mergeConfigCustomParams(await prisma.eaRuntimeConfig.findUnique({ where: { instanceId } }).catch(() => null));
  if (!stored) throw new Error('Stored runtime config not found.');
  const payload = {
    instanceId: instance.id,
    symbol: instance.symbol,
    timeframe: instance.timeframe,
    ...stored,
    config: stored,
  };
  const command = await createEaCommand({
    terminalId: instance.terminalId,
    commandType: 'UPDATE_CONFIG',
    source,
    payload,
    requiresConfirmation: false,
  });
  await prisma.eaCommandQueue.update({
    where: { id: command.id },
    data: {
      status: 'SUCCESS',
      executedAt: new Date(),
      resultAt: new Date(),
      resultJson: stringify({ message: 'Stored config queued to EA.', instanceId: instance.id, terminalId: instance.terminalId }),
    },
  });
  return { instance, storedConfig: stored, command };
}

function templateNameFromFile(fileName: string) {
  return fileName.replace(/_ReplayFX\.mq5$/i, '').replace(/\.mq5$/i, '').replace(/[_-]+/g, ' ').trim();
}

function describeTemplate(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes('crt')) return { category: 'Candle Range Theory', description: 'CRT range and execution EA with ReplayFX remote approval hooks.' };
  if (lower.includes('momentum')) return { category: 'Momentum', description: 'Momentum candle EA with ReplayFX heartbeat/config and guarded approval hooks.' };
  if (lower.includes('breakout')) return { category: 'Breakout', description: 'Breakout RR EA with ReplayFX approval before market order send.' };
  if (lower.includes('grid') || lower.includes('ers')) return { category: 'Grid', description: 'Stop-grid EA with ReplayFX heartbeat/config and grid notification guard.' };
  return { category: 'EA', description: 'ReplayFX integrated MetaTrader 5 Expert Advisor.' };
}

export function getEaLibraryDirs() {
  return [
    path.resolve(process.cwd(), 'integrations', 'mt5', 'ea-library'),
    '/home/vallencia/ea list/replayfx-integrated',
  ];
}

export async function scanEaTemplates() {
  const files: string[] = [];
  for (const dir of getEaLibraryDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.toLowerCase().endsWith('.mq5')) files.push(file);
    }
  }

  const unique = [...new Set(files)].sort((a, b) => a.localeCompare(b));
  const templates = [];
  for (const fileName of unique) {
    const meta = describeTemplate(fileName);
    const row = await prisma.eaTemplate.upsert({
      where: { fileName },
      create: {
        fileName,
        name: templateNameFromFile(fileName),
        templateName: fileName.replace(/\.mq5$/i, '.tpl'),
        category: meta.category,
        description: meta.description,
        defaultSymbol: null,
        defaultTimeframe: 'M5',
        defaultMode: 'NOTIFY_ONLY',
      },
      update: {
        category: meta.category,
        description: meta.description,
        defaultSymbol: null,
      },
    });
    templates.push(row);
  }
  return templates;
}

export async function listTemplates() {
  const existing = await prisma.eaTemplate.findMany({ orderBy: { name: 'asc' } });
  return existing.length ? existing : scanEaTemplates();
}

export async function findTemplate(ref: string) {
  const templates = await listTemplates();
  const index = Number(ref);
  if (Number.isInteger(index) && index > 0 && index <= templates.length) return templates[index - 1];
  const lower = ref.toLowerCase();
  return templates.find(t => t.name.toLowerCase().includes(lower) || t.fileName.toLowerCase().includes(lower)) || null;
}

export async function getPrimaryTerminalId() {
  const hb = await prisma.eaTerminalHeartbeat.findFirst({ orderBy: { timestamp: 'desc' } });
  return hb?.terminalId || DEFAULT_TERMINAL_ID;
}

export async function createEaCommand(input: {
  terminalId?: string;
  commandType: string;
  payload?: any;
  source?: string;
  requiresConfirmation?: boolean;
}) {
  const normalizedCommand = String(input.commandType).toUpperCase();
  if (BLOCKED_EA_COMMAND_TYPES.has(normalizedCommand)) {
    throw new Error('Remote manual trading commands are disabled.');
  }
  const requiresConfirmation = input.requiresConfirmation === true;
  const initialStatus = 'QUEUED';
  const confirmationCode = null;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const executionId = crypto.randomUUID();
  const command = await prisma.eaCommandQueue.create({
    data: {
      terminalId: input.terminalId || await getPrimaryTerminalId(),
      commandType: normalizedCommand,
      payloadJson: stringify(input.payload),
      source: input.source || 'WEBSITE',
      status: initialStatus,
      requiresConfirmation,
      confirmationCode,
      executionId,
      expiresAt,
    },
  });
  console.log('[EA Control] command created', {
    id: command.id,
    terminalId: command.terminalId,
    commandType: command.commandType,
    status: command.status,
    expiresAt,
    source: command.source,
  });
  await prisma.eaCommandLog.create({
    data: {
      source: input.source || 'WEBSITE',
      command: normalizedCommand,
      status: command.status,
      terminalId: command.terminalId,
      payloadJson: command.payloadJson,
    },
  });
  return command;
}

export async function upsertRuntimeConfig(instanceId: string, patch: Record<string, any>) {
  const allowed = new Set(['mode', 'riskPercent', 'rr', 'allowBuy', 'allowSell', 'maxSpread', 'maxDailyLoss', 'maxTradesPerDay', 'takeScreenshotOnSignal', 'panelWidth', 'compactPanel', 'showZones', 'showStats', 'customParamsJson']);
  const customAllowed = new Set([
    'useSpreadFilter', 'entryMode', 'lookback', 'breakBufferPips', 'manualSLPips', 'onePositionOnly', 'oneEntryPerBar',
    'rangeTimeframe', 'executionTimeframe',
    'lot', 'gridDistance', 'gridDistancePips', 'layers', 'multiplier', 'maxFloatingLoss', 'targetProfit', 'showPanel',
    'minBodyPips', 'minBodyPercent', 'atrFilter',
  ]);
  const data: Record<string, any> = {};
  const existing = await prisma.eaRuntimeConfig.findUnique({ where: { instanceId } }).catch(() => null);
  const custom = parseJson<Record<string, any>>(existing?.customParamsJson, {});
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (allowed.has(key)) {
      if (key === 'mode' && !EA_MODES.includes(String(value).toUpperCase() as any)) continue;
      data[key] = key === 'mode' ? String(value).toUpperCase() : value;
    } else if ((customAllowed.has(key) || /^[A-Za-z][A-Za-z0-9_]*$/.test(key)) && !/secret|token|password|backendurl/i.test(key)) {
      custom[key] = value;
    }
  }
  if (Object.keys(custom).length) data.customParamsJson = stringify(custom);
  const config = await prisma.eaRuntimeConfig.upsert({
    where: { instanceId },
    create: { instanceId, ...data },
    update: data,
  });
  if (data.mode) await prisma.eaInstance.updateMany({ where: { id: instanceId }, data: { mode: data.mode } });
  const versionKey = `ea-runtime-config-version:${instanceId}`;
  const currentVersion = await prisma.systemSetting.findUnique({ where: { key: versionKey } }).catch(() => null);
  const configVersion = String((Number(currentVersion?.value || '0') || 0) + 1);
  await prisma.systemSetting.upsert({
    where: { key: versionKey },
    create: { key: versionKey, value: configVersion },
    update: { value: configVersion },
  });
  return { ...mergeConfigCustomParams(config), configVersion };
}

export async function getRuntimeConfigVersion(instanceId: string) {
  const row = await prisma.systemSetting.findUnique({ where: { key: `ea-runtime-config-version:${instanceId}` } }).catch(() => null);
  return row?.value || '1';
}

export async function storeTerminalSymbols(terminalId: string, symbols: string[]) {
  const clean = [...new Set(symbols.map(s => String(s).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  await prisma.systemSetting.upsert({
    where: { key: `ea-control:symbols:${terminalId}` },
    create: { key: `ea-control:symbols:${terminalId}`, value: stringify({ terminalId, symbols: clean, updatedAt: new Date().toISOString() }) },
    update: { value: stringify({ terminalId, symbols: clean, updatedAt: new Date().toISOString() }) },
  });
  return clean;
}

export async function getTerminalSymbols(terminalId?: string) {
  const keyTerminal = terminalId || await getPrimaryTerminalId();
  const row = await prisma.systemSetting.findUnique({ where: { key: `ea-control:symbols:${keyTerminal}` } }).catch(() => null);
  const parsed = parseJson<any>(row?.value, {});
  return {
    terminalId: keyTerminal,
    symbols: Array.isArray(parsed.symbols) ? parsed.symbols : [],
    updatedAt: parsed.updatedAt || null,
  };
}

export async function resolveBrokerSymbol(requestedSymbol: string, terminalId?: string) {
  const requested = String(requestedSymbol || '').trim();
  const symbolData = await getTerminalSymbols(terminalId);
  const symbols: string[] = symbolData.symbols.map((s: any) => String(s).trim()).filter(Boolean);
  const requestedUpper = requested.toUpperCase();
  const exact = symbols.find((s: string) => s.toUpperCase() === requestedUpper);
  const starts = symbols.find((s: string) => s.toUpperCase().startsWith(requestedUpper));
  const contains = symbols.find((s: string) => s.toUpperCase().includes(requestedUpper));
  const resolvedSymbol = exact || starts || contains || requested;
  const suggestions = symbols
    .filter((s: string) => {
      const upper = s.toUpperCase();
      const prefix = requestedUpper.slice(0, Math.min(3, requestedUpper.length));
      return prefix ? upper.includes(prefix) || upper.startsWith(requestedUpper.slice(0, 1)) : false;
    })
    .slice(0, 10);

  return {
    terminalId: symbolData.terminalId,
    requestedSymbol: requested,
    resolvedSymbol,
    resolved: !!requested && resolvedSymbol.toUpperCase() !== requestedUpper,
    exact: !!exact,
    found: !!(exact || starts || contains),
    suggestions,
  };
}

export async function storeTerminalCharts(terminalId: string, charts: Array<{ chartId?: string; symbol?: string; timeframe?: string } | any>) {
  const clean = charts
    .map(chart => ({
      chartId: chart.chartId ? String(chart.chartId) : '',
      symbol: chart.symbol ? String(chart.symbol) : '',
      timeframe: chart.timeframe ? String(chart.timeframe) : '',
    }))
    .filter(chart => chart.chartId || chart.symbol || chart.timeframe)
    .sort((a, b) => `${a.symbol} ${a.timeframe} ${a.chartId}`.localeCompare(`${b.symbol} ${b.timeframe} ${b.chartId}`));
  await prisma.systemSetting.upsert({
    where: { key: `ea-control:charts:${terminalId}` },
    create: { key: `ea-control:charts:${terminalId}`, value: stringify({ terminalId, charts: clean, updatedAt: new Date().toISOString() }) },
    update: { value: stringify({ terminalId, charts: clean, updatedAt: new Date().toISOString() }) },
  });
  return clean;
}

export async function getTerminalCharts(terminalId?: string) {
  const keyTerminal = terminalId || await getPrimaryTerminalId();
  const row = await prisma.systemSetting.findUnique({ where: { key: `ea-control:charts:${keyTerminal}` } }).catch(() => null);
  const parsed = parseJson<any>(row?.value, {});
  return {
    terminalId: keyTerminal,
    charts: Array.isArray(parsed.charts) ? parsed.charts : [],
    updatedAt: parsed.updatedAt || null,
  };
}

export async function resolveInstance(ref: string) {
  const instances = await prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 });
  const lower = ref.toLowerCase();
  return instances.find(i => i.id === ref || i.symbol.toLowerCase() === lower || `${i.symbol}${i.timeframe}`.toLowerCase() === lower) ||
    instances.find(i => i.id.toLowerCase().startsWith(lower)) ||
    null;
}

function channelKind(channel: EaControlChannel | string) {
  return String(channel).startsWith('TELEGRAM') ? 'telegram' : 'whatsapp';
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bold(channel: EaControlChannel | string, value: string) {
  return channelKind(channel) === 'telegram' ? `<b>${escapeHtml(value)}</b>` : `*${value}*`;
}

function code(channel: EaControlChannel | string, value: unknown) {
  return channelKind(channel) === 'telegram' ? `<code>${escapeHtml(value)}</code>` : `\`${String(value ?? '')}\``;
}

export function shortCommandId(value: unknown) {
  return String(value || '').slice(0, 8);
}

export function statusLabel(status: string) {
  const key = String(status || '').toUpperCase();
  const labels: Record<string, string> = {
    QUEUED: '⏳ Queued',
    EXECUTING: '🔄 Executing',
    SUCCESS: '✅ Success',
    FAILED: '❌ Failed',
    REJECTED: '🚫 Rejected',
    FAILED_TIMEOUT: '⏱ Timeout',
    WAITING_EA_HEARTBEAT: '💓 Waiting EA heartbeat',
    WAITING_CONTROLLER: '⏳ Waiting controller',
    BLOCKED_BY_ACTIVE_COMMAND: '⏸ Blocked by active command',
    CANCELLED: '🧹 Cancelled',
    EXPIRED: '⏱ Expired',
  };
  return labels[key] || key || 'Unknown';
}

export function buildMainMenu(channel: EaControlChannel | string) {
  if (channelKind(channel) === 'telegram') {
    return `${bold(channel, 'ReplayFX Control Center')}\n\n` +
      `Use the buttons below or type shortcuts like ${code(channel, '/screenshot BTCUSD H1')} and ${code(channel, '/attach ERS BTCUSD H1')}.\n\n` +
      `Manual BUY, SELL, CLOSE_ALL, MODIFY_SL, and MODIFY_TP commands are disabled.`;
  }
  return `*ReplayFX Control Center*\n\n` +
    `1. Terminal Status\n` +
    `2. EA Library\n` +
    `3. Search Symbol\n` +
    `4. Screenshot Chart\n` +
    `5. Attach EA\n` +
    `6. Runtime Config\n` +
    `7. Pause / Resume EA\n` +
    `8. Command Log\n` +
    `9. Cleanup Stuck\n` +
    `10. Help`;
}

export function formatHelp(channel: EaControlChannel | string) {
  const lines = [
    `${bold(channel, 'ReplayFX EA Control Help')}`,
    '',
    `${code(channel, '/status')} - terminal and EA heartbeat status`,
    `${code(channel, '/symbols')} or ${code(channel, 'symbols xau')} - broker symbols`,
    `${code(channel, '/charts')} - open MT5 charts`,
    `${code(channel, '/screenshot BTCUSD H1')} - screenshot chart`,
    `${code(channel, '/attach ERS BTCUSD H1')} - attach EA template`,
    `${code(channel, '/pause BTCUSD H1')} / ${code(channel, '/resume BTCUSD H1')} - change EA mode`,
    `${code(channel, '/config')} - runtime config help`,
    `${code(channel, '/cleanup')} - cleanup stuck commands with confirmation`,
    `${code(channel, '/logs')} - latest command log`,
    '',
    'Manual BUY, SELL, CLOSE_ALL, MODIFY_SL, and MODIFY_TP commands are disabled.',
  ];
  return lines.join('\n');
}

export function formatTerminalStatus(channel: EaControlChannel | string, data: { terminals?: any[]; instances?: any[] }) {
  const terminals = data.terminals || [];
  const instances = data.instances || [];
  const terminalLines = terminals.length
    ? terminals.map((t: any, n: number) => {
      const online = t.timestamp && Date.now() - new Date(t.timestamp).getTime() < 90_000 ? 'online' : 'offline';
      return `${n + 1}. ${t.terminalId} ${online} ${t.broker || ''} ${t.accountNumber || ''}`.trim();
    }).join('\n')
    : 'No controller terminal heartbeat yet.';
  const instanceLines = instances.length
    ? instances.map((i: any, n: number) => {
      const online = i.lastHeartbeatAt && Date.now() - new Date(i.lastHeartbeatAt).getTime() < 90_000 ? 'online' : 'offline';
      return `${n + 1}. ${i.symbol} ${i.timeframe} ${i.mode} ${online} chart ${i.chartId || '-'}`;
    }).join('\n')
    : 'No integrated EA heartbeat yet.';
  return `${bold(channel, '📡 Terminal Status')}\n\n${bold(channel, 'Terminals')}\n${terminalLines}\n\n${bold(channel, 'Active EAs')}\n${instanceLines}`;
}

export function formatSymbolList(channel: EaControlChannel | string, data: { symbols?: string[]; updatedAt?: string | null; terminalId?: string }, query?: string) {
  const symbols = (data.symbols || []).map(s => String(s)).filter(Boolean);
  const filtered = query ? symbols.filter(s => s.toLowerCase().includes(query.toLowerCase())).slice(0, 80) : symbols.slice(0, 80);
  const title = query ? `📈 Symbols matching ${query}` : '📈 Symbols';
  if (!symbols.length) return `${bold(channel, title)}\n\nNo cached broker symbols yet. Use LIST_SYMBOLS from the controller or send ${code(channel, 'symbols')} again after the controller reports.`;
  return `${bold(channel, title)}\n\n${filtered.length ? filtered.join(', ') : 'No matching symbols.'}\n\nTerminal: ${code(channel, data.terminalId || '-')}${data.updatedAt ? `\nUpdated: ${code(channel, data.updatedAt)}` : ''}`;
}

export function formatCommandResult(channel: EaControlChannel | string, command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  const status = String(command?.status || '');
  const lines = [
    `${bold(channel, statusLabel(status))}`,
    '',
    `${bold(channel, 'Command:')} ${code(channel, shortCommandId(command?.id))}`,
    `${bold(channel, 'Type:')} ${code(channel, command?.commandType || '-')}`,
    `${bold(channel, 'Status:')} ${statusLabel(status)}`,
  ];
  if (payload.symbol || result.actualSymbol || result.resolvedSymbol) lines.push(`${bold(channel, 'Symbol:')} ${escapeForChannel(channel, result.actualSymbol || result.resolvedSymbol || payload.symbol)}`);
  if (payload.timeframe || result.actualTimeframe) lines.push(`${bold(channel, 'Timeframe:')} ${escapeForChannel(channel, result.actualTimeframe || payload.timeframe)}`);
  if (result.message) lines.push(`${bold(channel, 'Message:')} ${escapeForChannel(channel, result.message)}`);
  if (result.error) lines.push(`${bold(channel, 'Error:')} ${escapeForChannel(channel, result.error)}`);
  return lines.join('\n');
}

function escapeForChannel(channel: EaControlChannel | string, value: unknown) {
  return channelKind(channel) === 'telegram' ? escapeHtml(value) : String(value ?? '');
}

export function formatScreenshotCaption(channel: EaControlChannel | string, data: any) {
  const payload = parseJson<any>(data?.payloadJson, data?.payload || {});
  const result = parseJson<any>(data?.resultJson, data?.result || data || {});
  const symbol = result.actualSymbol || result.resolvedSymbol || payload.symbol || '-';
  const timeframe = result.actualTimeframe || payload.timeframe || '-';
  const fileName = result.fileName || (result.localFilePath ? path.basename(result.localFilePath) : result.filePath ? path.basename(result.filePath) : '');
  return `${bold(channel, '✅ Screenshot Ready')}\n\n` +
    `${bold(channel, 'Symbol:')} ${escapeForChannel(channel, symbol)}\n` +
    `${bold(channel, 'Timeframe:')} ${escapeForChannel(channel, timeframe)}\n` +
    `${bold(channel, 'Command:')} ${code(channel, shortCommandId(data?.id || data?.commandId))}\n` +
    `${bold(channel, 'Status:')} ${statusLabel(data?.status || 'SUCCESS')}` +
    `${fileName ? `\n${bold(channel, 'File:')} ${code(channel, fileName)}` : ''}`;
}

export function formatScreenshotResult(channel: EaControlChannel | string, command: any) {
  return formatScreenshotCaption(channel, command);
}

export function formatAttachResult(channel: EaControlChannel | string, command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  const resolved = result.resolvedSymbol || payload.resolvedSymbol || payload.symbol || payload.requestedSymbol || '-';
  return `${bold(channel, '🚀 Attach EA')}\n\n` +
    `${bold(channel, 'Template:')} ${escapeForChannel(channel, payload.templateName || payload.fileName || '-')}\n` +
    `${bold(channel, 'Symbol:')} ${escapeForChannel(channel, resolved)}\n` +
    `${bold(channel, 'Timeframe:')} ${escapeForChannel(channel, payload.timeframe || '-')}\n` +
    `${bold(channel, 'Command:')} ${code(channel, shortCommandId(command?.id))}\n` +
    `${bold(channel, 'Status:')} ${statusLabel(command?.status || 'QUEUED')}`;
}

export function parseEaControlIntent(text: string): EaControlIntent {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const clean = lower.startsWith('/') ? lower.slice(1) : lower;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = clean.split(/\s+/)[0] || '';

  if (!trimmed) return { type: 'unknown' };
  if (isBlockedManualTradeCommand(trimmed)) return { type: 'blocked_manual_trade' };
  if (['start', 'menu'].includes(first)) return { type: 'menu' };
  if (['help', '?'].includes(first)) return { type: 'help' };
  if (first === 'status' || clean === 'terminal status' || clean === 'list terminals' || clean === 'active eas') return { type: 'status' };
  if (first === 'symbols' || clean.startsWith('pair list')) return { type: 'symbols', query: parts[1] };
  if (first === 'charts' || clean.startsWith('chart list')) return { type: 'charts' };
  if (first === 'logs' || clean === 'command log') return { type: 'logs' };
  if (first === 'cleanup' || clean === 'cancel pending') return { type: 'cleanup', confirmed: /\b(confirm|yes|y)\b/i.test(trimmed) };
  if (first === 'config') return { type: 'config' };
  if (first === 'ea' && parts[1]?.toLowerCase() === 'list') return { type: 'library' };
  if (clean === 'list ea' || clean === 'ea library' || first === 'library') return { type: 'library' };
  if (first === 'screenshot') return { type: 'screenshot', symbol: parts[1], timeframe: parts[2] || 'M5' };
  if (first === 'attach') return { type: 'attach', templateRef: parts[1], symbol: parts[2], timeframe: parts[3] || 'M5', mode: parts[4] };
  if (first === 'pause' || first === 'resume') return { type: first as 'pause' | 'resume', symbol: parts[1], timeframe: parts[2] };
  return { type: 'unknown' };
}

async function listLatestTerminals() {
  const heartbeats = await prisma.eaTerminalHeartbeat.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
  const latest = new Map<string, any>();
  for (const hb of heartbeats) if (!latest.has(hb.terminalId)) latest.set(hb.terminalId, hb);
  return [...latest.values()];
}

export async function createEaCommandFromIntent(
  intent: EaControlIntent,
  source: string,
  senderId?: string,
  options?: { channel?: EaControlChannel | string; confirmed?: boolean }
): Promise<{ handled: boolean; response: string; status: string; commandId?: string }> {
  const channel = options?.channel || source;
  const confirmed = options?.confirmed === true || ('confirmed' in intent && intent.confirmed === true);

  if (intent.type === 'blocked_manual_trade') {
    return { handled: true, response: 'Remote manual trade execution is disabled for safety. Use EA signal approval or runtime mode controls instead.', status: 'REJECTED' };
  }
  if (intent.type === 'unknown') return { handled: false, response: '', status: 'IGNORED' };
  if (intent.type === 'menu') return { handled: true, response: buildMainMenu(channel), status: 'SUCCESS' };
  if (intent.type === 'help') return { handled: true, response: formatHelp(channel), status: 'SUCCESS' };

  if (intent.type === 'status') {
    const [terminals, instances] = await Promise.all([
      listLatestTerminals(),
      prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 }),
    ]);
    await prisma.eaCommandLog.create({ data: { source, senderId, command: 'TERMINAL_STATUS', status: 'SUCCESS' } });
    return { handled: true, response: formatTerminalStatus(channel, { terminals, instances }), status: 'SUCCESS' };
  }

  if (intent.type === 'library') {
    const templates = await listTemplates();
    const instances = await prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 });
    const active = instances.map((i, n) => `${n + 1}. ${i.symbol} ${i.timeframe} ${i.mode} ${i.status}`).join('\n');
    const lines = templates.map((t, i) => `${i + 1}. ${t.name} (${t.defaultMode})`);
    await prisma.eaCommandLog.create({ data: { source, senderId, command: 'LIST_EAS', status: 'SUCCESS' } });
    return { handled: true, response: `${active ? `${bold(channel, 'Active EAs')}\n${active}\n\n` : ''}${lines.length ? `${bold(channel, '🤖 EA Library')}\n\n${lines.join('\n')}` : 'EA Library is empty. Run template scan first.'}`, status: 'SUCCESS' };
  }

  if (intent.type === 'symbols') {
    const data = await getTerminalSymbols();
    if (data.symbols.length) return { handled: true, response: formatSymbolList(channel, data, intent.query), status: 'SUCCESS' };
    const command = await createEaCommand({ commandType: 'LIST_SYMBOLS', source, requiresConfirmation: false });
    return { handled: true, response: `${bold(channel, '📈 Symbols')}\n\nPair list requested from MT5 Controller.\nCommand: ${code(channel, shortCommandId(command.id))}\nStatus: ${statusLabel(command.status)}`, status: 'QUEUED', commandId: command.id };
  }

  if (intent.type === 'charts') {
    const command = await createEaCommand({ commandType: 'LIST_CHARTS', source, requiresConfirmation: false });
    return { handled: true, response: `${bold(channel, '🖥 Charts')}\n\nChart list requested from MT5 Controller.\nCommand: ${code(channel, shortCommandId(command.id))}\nStatus: ${statusLabel(command.status)}`, status: 'QUEUED', commandId: command.id };
  }

  if (intent.type === 'logs') {
    const rows = await prisma.eaCommandQueue.findMany({ orderBy: { createdAt: 'desc' }, take: 8 });
    if (!rows.length) return { handled: true, response: `${bold(channel, '📜 Command Log')}\n\nNo EA commands yet.`, status: 'SUCCESS' };
    const lines = rows.map((row: any) => `${shortCommandId(row.id)} ${row.commandType} ${statusLabel(row.status)}`);
    return { handled: true, response: `${bold(channel, '📜 Command Log')}\n\n${lines.join('\n')}`, status: 'SUCCESS' };
  }

  if (intent.type === 'config') {
    return {
      handled: true,
      response: `${bold(channel, '⚙ Runtime Config')}\n\nUse ${code(channel, '/config <symbol>')} to view config, or ${code(channel, '/set <instance> risk 0.5')} for safe runtime parameters. Manual trade execution controls remain disabled.`,
      status: 'SUCCESS',
    };
  }

  if (intent.type === 'cleanup') {
    if (!confirmed) {
      return {
        handled: true,
        response: `${bold(channel, 'Confirm Cleanup Stuck Commands')}\n\nThis cancels queued/executing EA-control commands for the active terminal. Reply ${code(channel, 'yes')} to confirm.`,
        status: 'CONFIRMATION_REQUIRED',
      };
    }
    const terminalId = await getPrimaryTerminalId();
    const command = await createEaCommand({ terminalId, commandType: 'CANCEL_PENDING', source, payload: { terminalId } });
    const now = new Date();
    const result = await (prisma.eaCommandQueue as any).updateMany({
      where: { terminalId, status: { in: ['QUEUED', 'EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED'] }, id: { not: command.id } },
      data: { status: 'CANCELLED', cancelledAt: now, resultAt: now, resultJson: stringify({ message: 'Command cancelled.' }) },
    });
    const updated = await (prisma.eaCommandQueue as any).update({
      where: { id: command.id },
      data: { status: 'SUCCESS', executedAt: now, resultAt: now, resultJson: stringify({ terminalId, cancelled: result.count, message: 'Pending EA commands cancelled.' }) },
    });
    await prisma.eaCommandLog.create({ data: { source, senderId, command: 'CANCEL_PENDING', status: 'SUCCESS', terminalId, payloadJson: stringify({ terminalId }), resultJson: updated.resultJson } });
    return { handled: true, response: `${bold(channel, '🧹 Cleanup Stuck')}\n\nCancelled ${result.count} pending command(s) for ${code(channel, terminalId)}.`, status: 'SUCCESS', commandId: command.id };
  }

  if (intent.type === 'attach') {
    if (!intent.templateRef || !intent.symbol) return { handled: true, response: `Format: ${code(channel, 'attach <ea> <symbol> <timeframe>')}`, status: 'REJECTED' };
    const template = await findTemplate(intent.templateRef);
    if (!template) return { handled: true, response: 'Template not found. Use EA Library first.', status: 'REJECTED' };
    const symbolResolution = await resolveBrokerSymbol(intent.symbol);
    const mode = String(intent.mode || template.defaultMode || 'NOTIFY_ONLY').toUpperCase();
    const safeMode = EA_MODES.includes(mode as any) ? mode : 'NOTIFY_ONLY';
    const command = await createEaCommand({
      commandType: 'APPLY_TEMPLATE',
      source,
      terminalId: symbolResolution.terminalId,
      payload: {
        templateId: template.id,
        templateName: template.templateName,
        fileName: template.fileName,
        symbol: intent.symbol,
        requestedSymbol: intent.symbol,
        resolvedSymbol: symbolResolution.found ? symbolResolution.resolvedSymbol : undefined,
        timeframe: String(intent.timeframe || 'M5').toUpperCase(),
        mode: safeMode,
      },
    });
    const resolutionMessage = symbolResolution.resolved ? `Resolved ${escapeForChannel(channel, intent.symbol)} → ${escapeForChannel(channel, symbolResolution.resolvedSymbol)}\n` : '';
    return { handled: true, response: `${resolutionMessage}${formatAttachResult(channel, command)}`, status: 'QUEUED', commandId: command.id };
  }

  if (intent.type === 'screenshot') {
    const timeframe = String(intent.timeframe || 'M5').toUpperCase();
    const command = await createEaCommand({ commandType: 'SCREENSHOT_CHART', source, payload: { symbol: intent.symbol, timeframe, hideGui: true } });
    return {
      handled: true,
      response: `${bold(channel, '📸 Screenshot Queued')}\n\n${bold(channel, 'Symbol:')} ${escapeForChannel(channel, intent.symbol || 'current chart')}\n${bold(channel, 'Timeframe:')} ${escapeForChannel(channel, timeframe)}\n${bold(channel, 'Command:')} ${code(channel, shortCommandId(command.id))}\n${bold(channel, 'Status:')} ${statusLabel(command.status)}`,
      status: 'QUEUED',
      commandId: command.id,
    };
  }

  if (intent.type === 'pause' || intent.type === 'resume') {
    const ref = `${intent.symbol || ''}${intent.timeframe || ''}`;
    const instance = await resolveInstance(ref || intent.symbol || '');
    if (!instance) return { handled: true, response: 'EA instance not found. Use Terminal Status or EA Library first.', status: 'REJECTED' };
    const mode = intent.type === 'pause' ? 'PAUSED' : 'NOTIFY_ONLY';
    await upsertRuntimeConfig(instance.id, { mode });
    const command = await createEaCommand({ terminalId: instance.terminalId, commandType: intent.type === 'pause' ? 'PAUSE_EA' : 'RESUME_EA', source, payload: { instanceId: instance.id, symbol: instance.symbol, timeframe: instance.timeframe, mode }, requiresConfirmation: false });
    return { handled: true, response: `${bold(channel, intent.type === 'pause' ? '⏸ Pause EA' : '▶ Resume EA')}\n\n${instance.symbol} ${instance.timeframe}\nCommand: ${code(channel, shortCommandId(command.id))}\nStatus: ${statusLabel(command.status)}`, status: 'QUEUED', commandId: command.id };
  }

  return { handled: false, response: '', status: 'IGNORED' };
}

export async function handleEaControlCommand(text: string, source: string, senderId?: string): Promise<{ handled: boolean; response: string; status: string; commandId?: string }> {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (isBlockedManualTradeCommand(trimmed)) {
    return { handled: true, response: 'Remote manual trade execution is disabled for safety. Use signal approval mode instead.', status: 'REJECTED' };
  }
  if (!isEaControlCommand(trimmed)) return { handled: false, response: '', status: 'IGNORED' };

  try {
    const shared = await createEaCommandFromIntent(parseEaControlIntent(trimmed), source, senderId, { channel: source });
    if (shared.handled) return shared;

    if (cmd === '/menu' || trimmed.toLowerCase() === 'menu') {
      await prisma.eaCommandLog.create({ data: { source, senderId, command: 'MENU', status: 'SUCCESS' } });
      return {
        handled: true,
        response: `ReplayFX EA Control Menu\n\n1. List terminals\n2. Active EAs\n3. Attach EA\n4. Screenshot\n5. Set params\n6. Pause/Resume\n7. Cancel pending\n8. Status\n\nExamples:\nlist ea\nlist terminals\nattach ERS XAUUSD-ECN M5\nscreenshot XAUUSD-ECN M5\nset ERS XAUUSD-ECN lot 0.01\npause ERS XAUUSD-ECN\nresume ERS XAUUSD-ECN\ncancel pending`,
        status: 'SUCCESS',
      };
    }

    if (trimmed.toLowerCase() === 'list terminals') {
      const heartbeats = await prisma.eaTerminalHeartbeat.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
      const latest = new Map<string, any>();
      for (const hb of heartbeats) if (!latest.has(hb.terminalId)) latest.set(hb.terminalId, hb);
      await prisma.eaCommandLog.create({ data: { source, senderId, command: 'LIST_TERMINALS', status: 'SUCCESS' } });
      const lines = [...latest.values()].map((t: any, n) => {
        const online = Date.now() - new Date(t.timestamp).getTime() < 90_000 ? 'online' : 'offline';
        return `${n + 1}. ${t.terminalId} ${online} ${t.broker || ''} ${t.accountNumber || ''}`.trim();
      });
      return { handled: true, response: lines.length ? `Terminals:\n${lines.join('\n')}` : 'No controller terminal heartbeat yet.', status: 'SUCCESS' };
    }

    if (trimmed.toLowerCase() === 'active eas' || trimmed.toLowerCase() === 'status') {
      const instances = await prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 });
      await prisma.eaCommandLog.create({ data: { source, senderId, command: 'LIST_ACTIVE_EAS', status: 'SUCCESS' } });
      const lines = instances.map((i, n) => {
        const online = i.lastHeartbeatAt && Date.now() - new Date(i.lastHeartbeatAt).getTime() < 90_000 ? 'online' : 'offline';
        return `${n + 1}. ${i.symbol} ${i.timeframe} ${i.mode} ${online} chart ${i.chartId || '-'}`;
      });
      return { handled: true, response: lines.length ? `Active EAs:\n${lines.join('\n')}` : 'No integrated EA heartbeat yet.', status: 'SUCCESS' };
    }

    if (trimmed.toLowerCase() === 'cancel pending') {
      const terminalId = await getPrimaryTerminalId();
      const command = await createEaCommand({ terminalId, commandType: 'CANCEL_PENDING', source, payload: { terminalId } });
      const now = new Date();
      const result = await (prisma.eaCommandQueue as any).updateMany({
        where: { terminalId, status: { in: ['QUEUED', 'EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED'] }, id: { not: command.id } },
        data: { status: 'CANCELLED', cancelledAt: now, resultAt: now, resultJson: stringify({ message: 'Command cancelled.' }) },
      });
      const updated = await (prisma.eaCommandQueue as any).update({
        where: { id: command.id },
        data: { status: 'SUCCESS', executedAt: now, resultAt: now, resultJson: stringify({ terminalId, cancelled: result.count, message: 'Pending EA commands cancelled.' }) },
      });
      await prisma.eaCommandLog.create({ data: { source, senderId, command: 'CANCEL_PENDING', status: 'SUCCESS', terminalId, payloadJson: stringify({ terminalId }), resultJson: updated.resultJson } });
      return { handled: true, response: `Cancelled ${result.count} pending command(s) for ${terminalId}.`, status: 'SUCCESS', commandId: command.id };
    }

    if ((cmd === '/ea' && parts[1]?.toLowerCase() === 'list') || trimmed.toLowerCase() === 'list ea') {
      const templates = await listTemplates();
      const instances = await prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 });
      await prisma.eaCommandLog.create({ data: { source, senderId, command: 'LIST_EAS', status: 'SUCCESS' } });
      const active = instances.map((i, n) => `${n + 1}. ${i.symbol} ${i.timeframe} ${i.mode} ${i.status}`).join('\n');
      const lines = templates.map((t, i) => `${i + 1}. ${t.name} (${t.defaultMode})`);
      return { handled: true, response: `${active ? `Active EAs:\n${active}\n\n` : ''}${lines.length ? `EA Library:\n\n${lines.join('\n')}` : 'EA Library is empty. Run template scan first.'}`, status: 'SUCCESS' };
    }

    if (cmd === '/pair' && parts[1]?.toLowerCase() === 'list') {
      const latest = await prisma.eaCommandQueue.findFirst({ where: { commandType: 'LIST_SYMBOLS', status: 'SUCCESS' }, orderBy: { createdAt: 'desc' } });
      const data = parseJson<any>(latest?.resultJson, {});
      const symbols = data.symbols || data.result?.symbols || [];
      if (symbols.length) return { handled: true, response: `Pairs from MT5:\n${symbols.slice(0, 80).join(', ')}`, status: 'SUCCESS' };
      const command = await createEaCommand({ commandType: 'LIST_SYMBOLS', source, requiresConfirmation: false });
      return { handled: true, response: `Pair list requested from MT5 Controller. Command: ${command.id.slice(0, 8)}`, status: 'QUEUED', commandId: command.id };
    }

    if (cmd === '/chart' && parts[1]?.toLowerCase() === 'list') {
      const command = await createEaCommand({ commandType: 'LIST_CHARTS', source, requiresConfirmation: false });
      return { handled: true, response: `Chart list requested from MT5 Controller. Command: ${command.id.slice(0, 8)}`, status: 'QUEUED', commandId: command.id };
    }

    if (cmd === '/attach' || cmd === 'attach') {
      const templateRef = cmd === '/attach' ? parts[1] : parts[1];
      const symbol = cmd === '/attach' ? parts[2] : parts[2];
      const timeframe = cmd === '/attach' ? (parts[3] || 'M5') : (parts[3] || 'M5');
      if (!templateRef || !symbol) return { handled: true, response: 'Format: /attach <eaNumberOrName> <symbol> <timeframe>', status: 'REJECTED' };
      const template = await findTemplate(templateRef);
      if (!template) return { handled: true, response: 'EA template not found. Use /ea list first.', status: 'REJECTED' };
      const symbolResolution = await resolveBrokerSymbol(symbol);
      const command = await createEaCommand({
        commandType: 'APPLY_TEMPLATE',
        source,
        terminalId: symbolResolution.terminalId,
        payload: {
          templateId: template.id,
          templateName: template.templateName,
          fileName: template.fileName,
          symbol,
          requestedSymbol: symbol,
          resolvedSymbol: symbolResolution.found ? symbolResolution.resolvedSymbol : undefined,
          timeframe: timeframe.toUpperCase(),
        },
      });
      const resolutionMessage = symbolResolution.resolved ? `Resolved ${symbol} → ${symbolResolution.resolvedSymbol}\n` : '';
      return { handled: true, response: `${resolutionMessage}Command queued: ${template.name} on ${symbolResolution.found ? symbolResolution.resolvedSymbol : symbol} ${timeframe.toUpperCase()}. Status: ${command.status}.`, status: 'QUEUED', commandId: command.id };
    }

    if (cmd === '/mode' || trimmed.toLowerCase().startsWith('set mode ')) {
      const ref = cmd === '/mode' ? parts[1] : (parts.length >= 5 ? parts[3] : parts[2]);
      const modeRaw = cmd === '/mode' ? parts[2] : parts[parts.length - 1];
      const mode = String(modeRaw || '').toUpperCase();
      const normalized = mode === 'APPROVAL' ? 'APPROVAL_REQUIRED' : mode;
      if (!ref || !EA_MODES.includes(normalized as any)) return { handled: true, response: 'Format: /mode <eaNameOrInstance> auto|notify|approval|paused', status: 'REJECTED' };
      const instance = await resolveInstance(ref);
      if (!instance) return { handled: true, response: 'EA instance not found.', status: 'REJECTED' };
      await upsertRuntimeConfig(instance.id, { mode: normalized });
      const command = await createEaCommand({ terminalId: instance.terminalId, commandType: 'SET_MODE', source, payload: { instanceId: instance.id, symbol: instance.symbol, timeframe: instance.timeframe, mode: normalized }, requiresConfirmation: false });
      await prisma.eaCommandLog.create({ data: { source, senderId, command: 'SET_MODE', status: 'QUEUED', payloadJson: stringify({ instanceId: instance.id, mode: normalized }) } });
      return { handled: true, response: `Mode queued: ${instance.symbol} ${instance.timeframe} -> ${normalized}`, status: 'QUEUED', commandId: command.id };
    }

    if (cmd === '/config') {
      const instance = await resolveInstance(parts[1] || '');
      if (!instance) return { handled: true, response: 'EA instance not found.', status: 'REJECTED' };
      const snapshot = await getEaConfigSnapshot(instance.id);
      const config = snapshot?.storedConfig || await prisma.eaRuntimeConfig.findUnique({ where: { instanceId: instance.id } });
      const actual = snapshot?.actualConfig || null;
      const syncStatus = snapshot?.syncStatus || 'UNKNOWN';
      const diffText = snapshot?.comparison?.diffs?.length
        ? snapshot.comparison.diffs.slice(0, 8).map(d => `${d.key}: stored=${d.stored ?? '-'} actual=${d.actual ?? '-'}`).join('\n')
        : 'No diff detected or EA has not reported currentConfig yet.';
      return {
        handled: true,
        response: `Config ${instance.symbol} ${instance.timeframe}\nSync: ${syncStatus}\nMode: ${config?.mode || instance.mode}\nRisk: ${config?.riskPercent ?? '-'}\nRR: ${config?.rr ?? '-'}\nAllowBuy: ${config?.allowBuy ?? true}\nAllowSell: ${config?.allowSell ?? true}\nPanelWidth: ${config?.panelWidth ?? '-'}\nActualMode: ${actual?.mode ?? '-'}\n\nDiff:\n${diffText}`,
        status: 'SUCCESS'
      };
    }

    if (cmd === '/set' || trimmed.toLowerCase().startsWith('set ')) {
      const ref = cmd === '/set' ? parts[1] : (parts.length >= 5 ? parts[2] : parts[1]);
      const keyRaw = cmd === '/set' ? parts[2] : (parts.length >= 5 ? parts[3] : parts[2]);
      const valueRaw = cmd === '/set' ? parts[3] : (parts.length >= 5 ? parts[4] : parts[3]);
      if (!ref || !keyRaw || valueRaw === undefined) return { handled: true, response: 'Format: /set <eaNameOrInstance> risk 0.5', status: 'REJECTED' };
      const instance = await resolveInstance(ref);
      if (!instance) return { handled: true, response: 'EA instance not found.', status: 'REJECTED' };
      const keyMap: Record<string, string> = { risk: 'riskPercent', rr: 'rr', allowbuy: 'allowBuy', allowsell: 'allowSell', maxspread: 'maxSpread', panelwidth: 'panelWidth' };
      const key = keyMap[keyRaw.toLowerCase()] || keyRaw;
      const boolValue = ['on', 'true', 'yes'].includes(valueRaw.toLowerCase()) ? true : ['off', 'false', 'no'].includes(valueRaw.toLowerCase()) ? false : undefined;
      const value = boolValue !== undefined ? boolValue : Number.isFinite(Number(valueRaw)) ? Number(valueRaw) : valueRaw;
      await upsertRuntimeConfig(instance.id, { [key]: value });
      const command = await createEaCommand({ terminalId: instance.terminalId, commandType: 'UPDATE_CONFIG', source, payload: { instanceId: instance.id, symbol: instance.symbol, timeframe: instance.timeframe, [key]: value }, requiresConfirmation: false });
      return { handled: true, response: `Config updated: ${key} = ${valueRaw}`, status: 'QUEUED', commandId: command.id };
    }

    if (cmd === 'pause' || cmd === 'resume') {
      const ref = parts[2] || parts[1] || '';
      const instance = await resolveInstance(ref);
      if (!instance) return { handled: true, response: 'EA instance not found.', status: 'REJECTED' };
      const mode = cmd === 'pause' ? 'PAUSED' : 'NOTIFY_ONLY';
      await upsertRuntimeConfig(instance.id, { mode });
      const command = await createEaCommand({ terminalId: instance.terminalId, commandType: cmd === 'pause' ? 'PAUSE_EA' : 'RESUME_EA', source, payload: { instanceId: instance.id, symbol: instance.symbol, timeframe: instance.timeframe, mode }, requiresConfirmation: false });
      return { handled: true, response: `${cmd === 'pause' ? 'Paused' : 'Resumed'} ${instance.symbol} ${instance.timeframe}`, status: 'QUEUED', commandId: command.id };
    }

    if (cmd === '/signals') {
      const signals = await prisma.eaSignalProposal.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10 });
      if (!signals.length) return { handled: true, response: 'No pending EA signals.', status: 'SUCCESS' };
      return { handled: true, response: signals.map(s => `${s.approvalCode}: ${s.eaName} ${s.symbol} ${s.timeframe} ${s.side} entry ${s.entry ?? '-'} SL ${s.sl ?? '-'} TP ${s.tp ?? '-'}`).join('\n'), status: 'SUCCESS' };
    }

    if (cmd === '/approve' || cmd === '/reject') {
      const code = parts[1];
      if (!code) return { handled: true, response: `Format: ${cmd} <code>`, status: 'REJECTED' };
      const status = cmd === '/approve' ? 'APPROVED' : 'REJECTED';
      const signal = await prisma.eaSignalProposal.update({
        where: { approvalCode: code },
        data: { status, decidedAt: new Date() },
      });
      return { handled: true, response: `Signal ${code} ${status}: ${signal.symbol} ${signal.side}`, status: 'SUCCESS' };
    }

    if (cmd === '/screenshot' || cmd === 'screenshot') {
      const symbol = cmd === '/screenshot' ? parts[1] : parts[1];
      const timeframe = cmd === '/screenshot' ? (parts[2] || 'M5') : (parts[2] || 'M5');
      const command = await createEaCommand({ commandType: 'SCREENSHOT_CHART', source, payload: { symbol, timeframe: timeframe.toUpperCase(), hideGui: true } });
      return { handled: true, response: `Command queued: Screenshot ${symbol || 'controller chart'} ${timeframe.toUpperCase()}.`, status: 'QUEUED', commandId: command.id };
    }
  } catch (error: any) {
    return { handled: true, response: error.message || 'EA command failed.', status: 'FAILED' };
  }

  return { handled: true, response: 'Unknown EA command. Use /help.', status: 'REJECTED' };
}
