import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { APPLY_TEMPLATE_HEARTBEAT_CAUSES, buildApplyTemplateHeartbeatDiagnostics, buildApplyTemplateHeartbeatOutcome, writeCommandDebugNote } from '../services/eaCommandNoteService';
import { notifySignalCreated } from '../services/eaSignalNotifier';
import { logIntegration } from '../utils/logger';
import {
  attachParameterSchema,
  createEaCommand,
  findTemplate,
  generateRuntimeBridgePatch,
  getEaConfigSnapshot,
  getEaParametersByFileName,
  getEaParametersByTemplateId,
  getRuntimeConfigVersion,
  getTerminalCharts,
  getTerminalSymbols,
  mergeConfigCustomParams,
  parseJson,
  scanEaTemplates,
  storeTerminalCharts,
  storeTerminalSymbols,
  applyEaStoredConfigToController,
  syncEaRuntimeConfigFromActual,
  upsertRuntimeConfig,
} from '../services/eaControlService';

const router = Router();
const SAFE_WEBSITE_EA_COMMANDS = new Set(['LIST_EAS', 'LIST_SYMBOLS', 'LIST_CHARTS', 'OPEN_CHART', 'APPLY_TEMPLATE', 'SCREENSHOT_CHART', 'UPDATE_CONFIG', 'SET_MODE', 'PAUSE_EA', 'RESUME_EA', 'CANCEL_COMMAND', 'CANCEL_PENDING', 'SELF_TEST_RESULT']);
const BLOCKED_EA_COMMANDS = new Set(['BUY', 'SELL', 'CLOSE_ALL', 'MODIFY_SL', 'MODIFY_TP']);
const PICKUP_STATUSES = ['QUEUED'];
const CANCELABLE_COMMAND_STATUSES = ['QUEUED', 'EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED'];
const EXPIRABLE_COMMAND_STATUSES = ['PENDING', 'WAITING_CONFIRMATION', 'CONFIRMED', 'QUEUED', 'EXECUTING', 'TEMPLATE_APPLY_REQUESTED', 'WAITING_EA_HEARTBEAT'];
const ACTIVE_COMMAND_STATUSES = ['EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED'];
const FINAL_COMMAND_STATUSES = new Set(['SUCCESS', 'FAILED', 'FAILED_TIMEOUT', 'REJECTED', 'EA_ONLINE', 'EXPIRED', 'CANCELLED']);
const PROGRESS_COMMAND_STATUSES = new Set(['EXECUTING', 'TEMPLATE_APPLY_REQUESTED', 'WAITING_EA_HEARTBEAT', 'WARNING']);

async function getSecretToken() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'secretToken' } });
  return row?.value || process.env.REPLAYFX_SECRET_TOKEN || process.env.SECRET_TOKEN || process.env.WEBHOOK_SECRET || '';
}

async function requireEaToken(req: Request, res: Response, next: NextFunction) {
  const expected = await getSecretToken();
  if (!expected) return next();
  const provided = String(req.headers['x-replayfx-token'] || req.headers.authorization || req.query.token || req.body?.secretToken || '').replace(/^Bearer\s+/i, '');
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: 'Invalid ReplayFX token' });
  next();
}

function json(value: unknown) {
  return JSON.stringify(value ?? {});
}

function normalizeMode(mode: unknown, fallback = 'NOTIFY_ONLY') {
  const raw = String(mode || fallback).toUpperCase();
  if (raw === 'APPROVAL') return 'APPROVAL_REQUIRED';
  return ['AUTO', 'NOTIFY_ONLY', 'APPROVAL_REQUIRED', 'PAUSED'].includes(raw) ? raw : fallback;
}

function normalizeEaCommandType(commandType: string) {
  return String(commandType || '').trim().toUpperCase();
}

function traceEaCommand(event: string, details: Record<string, unknown>) {
  console.log(`[EA Control] ${event}`, details);
}

router.get('/templates', async (_req, res) => {
  const templates = await prisma.eaTemplate.findMany({ orderBy: { name: 'asc' } });
  res.json({ ok: true, templates: templates.map(attachParameterSchema) });
});

router.post('/templates/scan', async (_req, res) => {
  const templates = await scanEaTemplates();
  res.json({ ok: true, templates: templates.map(attachParameterSchema) });
});

router.get('/templates/:id/parameters', async (req, res) => {
  try {
    const result = await getEaParametersByTemplateId(req.params.id);
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(404).json({ ok: false, error: error?.message || 'Template parameters not found' });
  }
});

router.get('/templates/:id/bridge', async (req, res) => {
  try {
    const result = await getEaParametersByTemplateId(req.params.id);
    res.json({
      ok: true,
      template: result.template,
      sourceFile: result.sourceFile,
      bridge: generateRuntimeBridgePatch(result.sourceFile, result.parameters),
      parameters: result.parameters,
    });
  } catch (error: any) {
    res.status(404).json({ ok: false, error: error?.message || 'Template bridge not found' });
  }
});

router.get('/eas/:fileName/parameters', async (req, res) => {
  try {
    const result = await getEaParametersByFileName(req.params.fileName);
    res.json({ ok: true, ...result });
  } catch (error: any) {
    res.status(404).json({ ok: false, error: error?.message || 'EA parameters not found' });
  }
});

router.get('/eas/:fileName/bridge', async (req, res) => {
  try {
    const result = await getEaParametersByFileName(req.params.fileName);
    res.json({
      ok: true,
      sourceFile: result.sourceFile,
      bridge: generateRuntimeBridgePatch(result.sourceFile, result.parameters),
      parameters: result.parameters,
    });
  } catch (error: any) {
    res.status(404).json({ ok: false, error: error?.message || 'EA bridge not found' });
  }
});

router.get('/terminals', async (_req, res) => {
  const heartbeats = await prisma.eaTerminalHeartbeat.findMany({
    orderBy: { timestamp: 'desc' },
    take: 200,
  });
  const latest = new Map<string, any>();
  for (const hb of heartbeats) if (!latest.has(hb.terminalId)) latest.set(hb.terminalId, hb);

  const terminals = await Promise.all([...latest.values()].map(async (hb: any) => {
    const payload = parseJson<any>(hb.payloadJson, {});
    const symbolData = await getTerminalSymbols(hb.terminalId);
    const chartData = await getTerminalCharts(hb.terminalId);
    return {
      ...hb,
      server: payload.server || null,
      activeChartCount: payload.activeChartCount || chartData.charts.length || null,
      symbolCount: symbolData.symbols.length,
      chartCount: chartData.charts.length,
      online: Date.now() - new Date(hb.timestamp).getTime() < 90_000,
    };
  }));
  res.json({ ok: true, terminals });
});

router.get('/symbols', async (req, res) => {
  const terminalId = req.query.terminalId ? String(req.query.terminalId) : undefined;
  const data = await getTerminalSymbols(terminalId);
  res.json({ ok: true, ...data });
});

router.post('/symbols', requireEaToken, async (req, res) => {
  const body = req.body || {};
  const terminalId = String(body.terminalId || 'default');
  const symbols = Array.isArray(body.symbols) ? body.symbols : parseJson<any[]>(body.payloadJson, []);
  const clean = await storeTerminalSymbols(terminalId, symbols);
  res.json({ ok: true, terminalId, symbols: clean, count: clean.length });
});

router.get('/charts', async (req, res) => {
  const terminalId = req.query.terminalId ? String(req.query.terminalId) : undefined;
  const data = await getTerminalCharts(terminalId);
  res.json({ ok: true, ...data });
});

router.post('/charts', requireEaToken, async (req, res) => {
  const body = req.body || {};
  const terminalId = String(body.terminalId || 'default');
  const charts = Array.isArray(body.charts) ? body.charts : parseJson<any[]>(body.payloadJson, []);
  const clean = await storeTerminalCharts(terminalId, charts);
  res.json({ ok: true, terminalId, charts: clean, count: clean.length });
});

router.get('/instances', async (_req, res) => {
  const [instances, configs, heartbeats, screenshots] = await Promise.all([
    prisma.eaInstance.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.eaRuntimeConfig.findMany(),
    prisma.eaTerminalHeartbeat.findMany({ orderBy: { timestamp: 'desc' }, take: 500 }),
    prisma.eaScreenshot.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
  ]);
  const configByInstance = new Map(configs.map(c => [c.instanceId, c]));
  const heartbeatByInstance = new Map<string, any>();
  for (const hb of heartbeats) {
    if (!hb.symbol || !hb.timeframe) continue;
    const key = `${hb.terminalId}|${hb.chartId || ''}|${hb.symbol}|${hb.timeframe}`;
    if (!heartbeatByInstance.has(key)) heartbeatByInstance.set(key, hb);
  }
  const screenshotByInstance = new Map<string, any>();
  for (const shot of screenshots) {
    const key = `${shot.terminalId || ''}|${shot.symbol || ''}|${shot.timeframe || ''}`;
    if (!screenshotByInstance.has(key)) screenshotByInstance.set(key, shot);
  }
  res.json({
    ok: true,
    instances: await Promise.all(instances.map(async i => {
      const hb = heartbeatByInstance.get(`${i.terminalId}|${i.chartId || ''}|${i.symbol}|${i.timeframe}`) ||
        heartbeatByInstance.get(`${i.terminalId}||${i.symbol}|${i.timeframe}`);
      const shot = screenshotByInstance.get(`${i.terminalId}|${i.symbol}|${i.timeframe}`) || null;
      const lastHeartbeatAt = i.lastHeartbeatAt || hb?.timestamp || null;
      const snapshot = await getEaConfigSnapshot(i.id).catch(() => null);
      return {
        ...i,
        eaName: hb?.eaName || null,
        balance: hb?.balance || null,
        equity: hb?.equity || null,
        freeMargin: hb?.freeMargin || null,
        lastHeartbeatAt,
        online: lastHeartbeatAt ? Date.now() - new Date(lastHeartbeatAt).getTime() < 90_000 : false,
        config: mergeConfigCustomParams(configByInstance.get(i.id)) || null,
        actualConfig: snapshot?.actualConfig || null,
        storedConfig: snapshot?.storedConfig || null,
        configSyncStatus: snapshot?.syncStatus || 'UNKNOWN',
        configDiffs: snapshot?.comparison?.diffs || [],
        lastScreenshot: shot,
      };
    })),
  });
});

router.get('/config', requireEaToken, async (req, res) => {
  const terminalId = String(req.query.terminalId || '');
  const instanceId = String(req.query.instanceId || '');
  const instance = instanceId
    ? await prisma.eaInstance.findUnique({ where: { id: instanceId } }).catch(() => null)
    : await prisma.eaInstance.findFirst({ where: { terminalId }, orderBy: { updatedAt: 'desc' } });
  if (!instance) {
    return res.json({
      ok: true,
      config: { mode: 'NOTIFY_ONLY', allowBuy: true, allowSell: true, takeScreenshotOnSignal: true, showZones: true, showStats: true },
      actualConfig: null,
      storedConfig: null,
      configSyncStatus: 'UNKNOWN',
      configDiffs: [],
    });
  }
  const snapshot = await getEaConfigSnapshot(instance.id);
  const configVersion = await getRuntimeConfigVersion(instance.id);
  const fallbackStored = mergeConfigCustomParams(await prisma.eaRuntimeConfig.findUnique({ where: { instanceId: instance.id } })) || {
    instanceId: instance.id,
    mode: instance.mode,
    allowBuy: true,
    allowSell: true,
    takeScreenshotOnSignal: true,
    showZones: true,
    showStats: true,
  };
  res.json({
    ok: true,
    instanceId: instance.id,
    chartId: instance.chartId,
    terminalId: instance.terminalId,
    configVersion,
    config: { ...(snapshot?.storedConfig || fallbackStored), configVersion },
    customConfig: snapshot?.storedConfig || fallbackStored,
    storedConfig: snapshot?.storedConfig || fallbackStored,
    actualConfig: snapshot?.actualConfig || null,
    configSyncStatus: snapshot?.syncStatus || 'UNKNOWN',
    configDiffs: snapshot?.comparison?.diffs || [],
    heartbeat: snapshot?.heartbeat || null,
  });
});

router.post('/config', async (req, res) => {
  const { instanceId, ...patch } = req.body || {};
  if (!instanceId) return res.status(400).json({ ok: false, error: 'instanceId is required' });
  const config = await upsertRuntimeConfig(String(instanceId), patch);
  await prisma.eaCommandLog.create({ data: { source: 'WEBSITE', command: 'UPDATE_CONFIG', status: 'EXECUTED', payloadJson: json({ instanceId, patch }) } });
  res.json({ ok: true, config });
});

router.post('/instances/:id/config', async (req, res) => {
  const instance = await prisma.eaInstance.findUnique({ where: { id: req.params.id } });
  if (!instance) return res.status(404).json({ ok: false, error: 'EA instance not found' });
  const config = await upsertRuntimeConfig(instance.id, req.body || {});
  const configVersion = String((config as any).configVersion || await getRuntimeConfigVersion(instance.id));
  const command = await createEaCommand({
    terminalId: instance.terminalId,
    commandType: 'UPDATE_CONFIG',
    payload: {
      terminalId: instance.terminalId,
      instanceId: instance.id,
      chartId: instance.chartId,
      symbol: instance.symbol,
      timeframe: instance.timeframe,
      configVersion,
      config,
      customConfig: config,
    },
    source: req.body?.source || 'WEBSITE',
    requiresConfirmation: false,
  });
  await prisma.eaCommandLog.create({ data: { source: req.body?.source || 'WEBSITE', command: 'UPDATE_CONFIG', status: 'QUEUED', terminalId: instance.terminalId, payloadJson: json({ instanceId: instance.id, chartId: instance.chartId, configVersion, config }) } });
  res.json({ ok: true, config, configVersion, commandId: command.id, status: command.status, message: 'Config saved to backend and queued for exact EA instance. Wait for the next heartbeat to confirm currentConfig changed.' });
});

router.post('/instances/:id/sync-from-actual', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await syncEaRuntimeConfigFromActual(id);
    await prisma.eaCommandLog.create({
      data: {
        source: req.body?.source || 'WEBSITE',
        command: 'SYNC_FROM_ACTUAL',
        status: 'SUCCESS',
        terminalId: result.snapshot.instance.terminalId,
        payloadJson: json({ instanceId: id }),
        resultJson: json({ config: result.config, syncStatus: result.snapshot.syncStatus }),
      },
    });
    return res.json({ ok: true, instanceId: id, config: result.config, actualConfig: result.snapshot.actualConfig, syncStatus: result.snapshot.syncStatus });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error.message || 'Failed to sync from actual config' });
  }
});

router.post('/instances/:id/apply-stored', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await applyEaStoredConfigToController(id, req.body?.source || 'WEBSITE');
    await prisma.eaCommandLog.create({
      data: {
        source: req.body?.source || 'WEBSITE',
        command: 'APPLY_STORED_CONFIG',
        status: 'SUCCESS',
        terminalId: result.instance.terminalId,
        payloadJson: json({ instanceId: id, config: result.storedConfig }),
        resultJson: json({ commandId: result.command.id, terminalId: result.instance.terminalId }),
      },
    });
    return res.json({ ok: true, instanceId: id, commandId: result.command.id, storedConfig: result.storedConfig });
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: error.message || 'Failed to apply stored config' });
  }
});

router.post('/heartbeat', requireEaToken, async (req, res) => {
  const body = req.body || {};
  const terminalId = String(body.terminalId || 'default');
  const accountNumber = body.accountNumber !== undefined ? String(body.accountNumber) : null;
  const symbol = String(body.symbol || '');
  const timeframe = String(body.timeframe || '');
  const chartId = body.chartId !== undefined ? String(body.chartId) : null;
  const mode = normalizeMode(body.mode);
  const isControllerHeartbeat = body.instanceId === 'controller' || String(body.eaName || '').toLowerCase() === 'replayfx mt5 controller';

  const heartbeat = await prisma.eaTerminalHeartbeat.create({
    data: {
      terminalId,
      accountNumber,
      broker: body.broker ? String(body.broker) : null,
      eaName: body.eaName ? String(body.eaName) : null,
      symbol,
      timeframe,
      chartId,
      mode,
      status: body.status ? String(body.status) : 'ONLINE',
      balance: body.balance !== undefined ? Number(body.balance) : null,
      equity: body.equity !== undefined ? Number(body.equity) : null,
      freeMargin: body.freeMargin !== undefined ? Number(body.freeMargin) : null,
      payloadJson: json(body),
      timestamp: new Date(),
    },
  });

  if (!isControllerHeartbeat && (body.instanceId || body.eaName)) {
    const instanceId = body.instanceId ? String(body.instanceId) : undefined;
    const existing = instanceId ? await prisma.eaInstance.findUnique({ where: { id: instanceId } }).catch(() => null) : null;
    const template = body.templateId
      ? await prisma.eaTemplate.findUnique({ where: { id: String(body.templateId) } }).catch(() => null)
      : await findTemplate(String(body.eaName || '')).catch(() => null);
    const templateId = template?.id || undefined;
    if (existing) {
      await prisma.eaInstance.update({
        where: { id: existing.id },
        data: { terminalId, accountNumber, symbol, timeframe, chartId, mode, status: body.status || 'ONLINE', lastHeartbeatAt: new Date(), ...(templateId ? { templateId } : {}) },
      });
    } else {
      const match = await prisma.eaInstance.findFirst({ where: { terminalId, chartId: chartId || undefined, symbol, timeframe } });
      if (match) {
        await prisma.eaInstance.update({ where: { id: match.id }, data: { accountNumber, mode, status: body.status || 'ONLINE', lastHeartbeatAt: new Date(), ...(templateId ? { templateId } : {}) } });
      } else if (symbol && timeframe) {
        await prisma.eaInstance.create({ data: { terminalId, accountNumber, symbol, timeframe, chartId, mode, status: body.status || 'ONLINE', lastHeartbeatAt: new Date(), ...(templateId ? { templateId } : {}) } });
      }
    }
  }

  await markMatchingCommandsEaOnline(heartbeat);

  res.json({ ok: true, heartbeatId: heartbeat.id });
});

router.post('/commands', async (req, res) => {
  const body = req.body || {};
  const commandType = normalizeEaCommandType(String(body.commandType || ''));
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  if (!commandType) return res.status(400).json({ ok: false, error: 'commandType is required' });
  if (BLOCKED_EA_COMMANDS.has(commandType)) return res.status(400).json({ ok: false, error: 'Remote manual trading commands are disabled.' });
  if (!SAFE_WEBSITE_EA_COMMANDS.has(commandType)) return res.status(400).json({ ok: false, error: 'Unsupported EA Control command.' });
  if (commandType === 'CANCEL_PENDING') {
    const terminalId = body.terminalId ? String(body.terminalId) : '';
    if (!terminalId) return res.status(400).json({ ok: false, error: 'terminalId is required for CANCEL_PENDING.' });
    const result = await cancelPendingEaCommands(terminalId);
    return res.json({ ok: true, status: 'CANCELLED', count: result.count, terminalId });
  }
  if (commandType === 'CANCEL_COMMAND') {
    const commandId = payload.commandId ? String(payload.commandId) : '';
    if (!commandId) return res.status(400).json({ ok: false, error: 'payload.commandId is required for CANCEL_COMMAND.' });
    const command = await prisma.eaCommandQueue.findUnique({ where: { id: commandId } });
    if (!command) return res.status(404).json({ ok: false, error: 'Command not found' });
    if (!CANCELABLE_COMMAND_STATUSES.includes(command.status)) {
      return res.status(400).json({ ok: false, error: `Command cannot be cancelled while status is ${command.status}` });
    }
    const now = new Date();
    const updated = await (prisma.eaCommandQueue as any).update({ where: { id: command.id }, data: { status: 'CANCELLED', cancelledAt: now, resultAt: now, resultJson: json({ message: 'Command cancelled.' }) } });
    traceEaCommand('command cancelled', { id: command.id, terminalId: command.terminalId, commandType: command.commandType });
    await prisma.eaCommandLog.create({ data: { source: body.source || 'WEBSITE', command: command.commandType, status: 'CANCELLED', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson: command.resultJson } });
    return res.json({ ok: true, command: commandResponse(updated) });
  }
  try {
    const command = await createEaCommand({ terminalId: body.terminalId ? String(body.terminalId) : undefined, commandType, payload, requiresConfirmation: false, source: body.source || 'WEBSITE' });
    res.json({ ok: true, command: { ...command, payload: parseJson(command.payloadJson, {}), result: parseJson(command.resultJson, null) } });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message || 'Failed to queue command.' });
  }
});

router.get('/commands', async (req, res) => {
  const terminalId = req.query.terminalId ? String(req.query.terminalId) : undefined;
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  await cleanupStaleCommands(terminalId);
  const limit = Math.min(Number(req.query.limit || 50), 250);
  const where: any = {};
  if (terminalId) where.terminalId = terminalId;
  if (status) where.status = status;
  const commands = await prisma.eaCommandQueue.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });

  const activeByTerminal = new Map<string, any>();
  for (const cmd of commands) {
    if (!terminalId && cmd.status === 'QUEUED') {
      const active = await getActiveTerminalCommand(cmd.terminalId);
      if (active) activeByTerminal.set(cmd.terminalId, active);
    }
  }
  if (terminalId) {
    const active = await getActiveTerminalCommand(terminalId);
    if (active) activeByTerminal.set(terminalId, active);
  }

  res.json({ ok: true, commands: commands.map(command => {
    const resp = commandResponse(command);
    const blocker = activeByTerminal.get(command.terminalId);
    if (blocker && command.status === 'QUEUED') {
      (resp as any).blockedBy = blocker.id;
      (resp as any).blockedStatus = blocker.status;
      (resp as any).blockedReason = `Waiting for active command ${blocker.id} to finish.`;
    }
    return resp;
  }) });
});

router.post('/commands/cleanup-stuck', async (req, res) => {
  const body = req.body || {};
  const terminalId = body.terminalId ? String(body.terminalId) : undefined;
  const before = await prisma.eaCommandQueue.count({
    where: terminalId ? { terminalId, status: { in: ['EXECUTING', 'WAITING_EA_HEARTBEAT', 'QUEUED'] } } : { status: { in: ['EXECUTING', 'WAITING_EA_HEARTBEAT', 'QUEUED'] } },
  });
  await cleanupStaleCommands(terminalId);
  const after = await prisma.eaCommandQueue.count({
    where: terminalId ? { terminalId, status: { in: ['EXECUTING', 'WAITING_EA_HEARTBEAT', 'QUEUED'] } } : { status: { in: ['EXECUTING', 'WAITING_EA_HEARTBEAT', 'QUEUED'] } },
  });
  const updated = before - after;
  const changed = await prisma.eaCommandQueue.findMany({
    where: terminalId ? { terminalId, status: { in: ['FAILED_TIMEOUT', 'WARNING', 'EXPIRED'] }, resultAt: { gte: new Date(Date.now() - 60000) } } : { status: { in: ['FAILED_TIMEOUT', 'WARNING', 'EXPIRED'] }, resultAt: { gte: new Date(Date.now() - 60000) } },
    orderBy: { resultAt: 'desc' },
    take: 50,
  });
  res.json({ ok: true, updated, commands: changed.map(commandResponse) });
});

router.get('/commands/debug', async (req, res) => {
  const terminalId = String(req.query.terminalId || '');
  if (!terminalId) return res.status(400).json({ ok: false, error: 'terminalId is required' });
  await cleanupStaleCommands(terminalId);

  const [activeCommands, queuedCommands, expiredCommands, logs, heartbeat, screenshotCount] = await Promise.all([
    prisma.eaCommandQueue.findMany({ where: { terminalId, status: { in: ACTIVE_COMMAND_STATUSES } }, orderBy: { pickedAt: 'asc' }, take: 20 }),
    prisma.eaCommandQueue.findMany({ where: { terminalId, status: 'QUEUED', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' }, take: 20 }),
    prisma.eaCommandQueue.findMany({ where: { terminalId, status: { in: ['EXPIRED', 'FAILED_TIMEOUT', 'WARNING', 'FAILED'] } }, orderBy: { resultAt: 'desc' }, take: 20 }),
    prisma.eaCommandLog.findMany({ where: { terminalId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.eaTerminalHeartbeat.findFirst({ where: { terminalId }, orderBy: { timestamp: 'desc' } }),
    prisma.eaScreenshot.count({ where: { terminalId } }),
  ]);
  const active = activeCommands[0] || null;
  const allowedToPoll = !active;
  res.json({
    ok: true,
    terminalId,
    allowedToPoll,
    blockedReason: active ? `Active command still ${active.status}` : null,
    controllerLastHeartbeatAt: heartbeat?.timestamp || null,
    terminalOnline: heartbeat ? Date.now() - new Date(heartbeat.timestamp).getTime() < 90_000 : false,
    lastHeartbeatAt: heartbeat?.timestamp || null,
    activeCommand: active ? commandResponse(active) : null,
    queuedCount: queuedCommands.length,
    executingCount: activeCommands.filter(c => c.status === 'EXECUTING').length,
    waitingHeartbeatCount: activeCommands.filter(c => c.status === 'WAITING_EA_HEARTBEAT').length,
    blockedBy: active ? { id: active.id, type: active.commandType, status: active.status, ageSeconds: Math.max(0, Math.floor((Date.now() - new Date(active.pickedAt || active.createdAt).getTime()) / 1000)) } : null,
    screenshotCount,
    last20Logs: logs,
  });
});

function commandFlatPayload(command: any) {
  const payload = parseJson<any>(command.payloadJson, {});
  const pairs: Record<string, string> = {
    empty: 'false',
    id: command.id,
    commandType: command.commandType,
    terminalId: command.terminalId,
    executionId: command.executionId || '',
    pickToken: command.pickToken || '',
    symbol: payload.symbol || '',
    timeframe: payload.timeframe || '',
    templateName: payload.templateName || '',
    fileName: payload.fileName || '',
    chartId: payload.chartId || '',
    width: payload.width !== undefined && payload.width !== null && payload.width !== '' ? String(payload.width) : '1280',
    height: payload.height !== undefined && payload.height !== null && payload.height !== '' ? String(payload.height) : '720',
    autoOpenChart: payload.autoOpenChart === true ? 'true' : 'false',
    fallbackToControllerChart: payload.fallbackToControllerChart === true ? 'true' : 'false',
  };
  return Object.entries(pairs)
    .map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`)
    .join('\n');
}

function commandPayload(command: any) {
  return parseJson<any>(command.payloadJson, {});
}

function commandResponse(command: any) {
  return { ...command, payload: commandPayload(command), result: parseJson(command.resultJson, null) };
}

function getApplyTemplateTarget(command: any) {
  const payload = commandPayload(command);
  const result = parseJson<any>(command?.resultJson, {});
  return {
    commandId: command?.id || result.waitingCommandId || null,
    terminalId: command?.terminalId || result.waitingTerminalId || null,
    chartId: String(result.waitingChartId || result.chartId || payload.chartId || '').trim() || null,
    resolvedSymbol: String(result.waitingResolvedSymbol || result.resolvedSymbol || result.actualSymbol || payload.resolvedSymbol || payload.symbol || '').trim() || null,
    symbol: String(result.waitingSymbol || result.requestedSymbol || payload.symbol || '').trim() || null,
    timeframe: String(result.waitingTimeframe || result.requestedTimeframe || payload.timeframe || '').trim() || null,
    templateName: String(result.waitingTemplateName || result.templateName || payload.templateName || payload.fileName || '').trim() || null,
    requestedMode: String(result.waitingRequestedMode || result.requestedMode || payload.mode || '').trim().toUpperCase() || null,
    createdAt: String(command?.createdAt || command?.pickedAt || command?.executedAt || result.waitingCreatedAt || new Date().toISOString()),
  };
}

function normalizeForTemplateMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\.tpl$/i, '')
    .replace(/\.mq5$/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function templateMatchesHeartbeat(command: any, heartbeat: any) {
  const payload = commandPayload(command);
  const templateRefs = [payload.templateName, payload.fileName, payload.templateId]
    .filter(Boolean)
    .map(value => normalizeForTemplateMatch(String(value)));
  const eaName = normalizeForTemplateMatch(String(heartbeat.eaName || ''));
  if (!templateRefs.length || !eaName) return true;
  return templateRefs.some(ref => eaName.includes(ref) || ref.includes(eaName));
}

async function markExpiredCommands(terminalId?: string) {
  const now = new Date();
  const where: any = {
    status: { in: EXPIRABLE_COMMAND_STATUSES },
    expiresAt: { lt: now },
  };
  if (terminalId) where.terminalId = terminalId;
  const expired = await prisma.eaCommandQueue.findMany({ where, take: 250 });
  if (!expired.length) return;
  const ids = expired.map(command => command.id);
  const result = await (prisma.eaCommandQueue as any).updateMany({
    where: {
      id: { in: ids },
      status: { in: EXPIRABLE_COMMAND_STATUSES },
    },
    data: { status: 'EXPIRED', expiredAt: now, resultAt: now, resultJson: json({ error: 'COMMAND_EXPIRED', message: 'Command expired before completion.' }) },
  });
  traceEaCommand('commands expired', { terminalId: terminalId || 'all', count: result.count, ids });
  for (const command of expired) {
    await prisma.eaCommandLog.create({
      data: { source: 'SYSTEM', command: command.commandType, status: 'EXPIRED', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson: json({ message: 'Command expired before completion.' }) },
    });
  }
}

async function markExecutingTimeouts(terminalId?: string) {
  const now = new Date();
  const timedOutAt = new Date(Date.now() - 30_000);
  const where: any = {
    status: 'EXECUTING',
    OR: [
      { pickedAt: { not: null, lt: timedOutAt } },
      { pickedAt: null, createdAt: { lt: timedOutAt } },
    ],
  };
  if (terminalId) where.terminalId = terminalId;
  const timedOut = await prisma.eaCommandQueue.findMany({ where, take: 100 });
  if (!timedOut.length) return;
  const ids = timedOut.map(command => command.id);
  const resultJson = json({ error: 'Controller did not report result within 30 seconds' });
  const result = await (prisma.eaCommandQueue as any).updateMany({
    where: { id: { in: ids }, status: 'EXECUTING' },
    data: { status: 'FAILED_TIMEOUT', resultAt: now, resultJson },
  });
  traceEaCommand('executing commands timed out', { terminalId: terminalId || 'all', count: result.count, ids });
  for (const command of timedOut) {
    await prisma.eaCommandLog.create({
      data: { source: 'SYSTEM', command: command.commandType, status: 'FAILED_TIMEOUT', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson },
    });
  }
}

async function markStaleTemplateCommands(terminalId?: string) {
  const staleAt = new Date(Date.now() - 30_000);
  const where: any = {
    commandType: 'APPLY_TEMPLATE',
    status: { in: ['WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED'] },
    executedAt: { not: null, lt: staleAt },
  };
  if (terminalId) where.terminalId = terminalId;
  const stale = await prisma.eaCommandQueue.findMany({ where, take: 100 });
  for (const command of stale) {
    const outcome = await buildApplyTemplateHeartbeatOutcome(command);
    const payload = commandPayload(command);
    const existingResult = parseJson<any>(command.resultJson, {});
    const diagnostics = outcome.diagnostics || await buildApplyTemplateHeartbeatDiagnostics(command);
    const result = outcome.hasMatch ? outcome.result : {
      warning: 'Template applied but EA heartbeat was not detected',
      message: [
        'Template applied, but EA heartbeat was not detected.',
        '',
        'Possible causes:',
        ...APPLY_TEMPLATE_HEARTBEAT_CAUSES.map((reason: string) => `- ${reason}`),
      ].join('\n'),
      requestedSymbol: diagnostics.requestedSymbol || payload.symbol || null,
      resolvedSymbol: diagnostics.resolvedSymbol || existingResult.resolvedSymbol || existingResult.actualSymbol || payload.resolvedSymbol || null,
      actualSymbol: diagnostics.actualSymbol || existingResult.actualSymbol || existingResult.actualChartSymbol || payload.actualSymbol || null,
      requestedTimeframe: diagnostics.requestedTimeframe || payload.timeframe || null,
      actualTimeframe: diagnostics.actualTimeframe || existingResult.actualTimeframe || existingResult.actualChartTimeframe || payload.actualTimeframe || null,
      chartId: diagnostics.chartId || existingResult.chartId || payload.chartId || null,
      templateName: diagnostics.templateName || existingResult.templateName || payload.templateName || null,
      expectedEaName: diagnostics.expectedEaName || null,
      expectedFileName: diagnostics.expectedFileName || null,
      possibleReasons: diagnostics.possibleReasons || [],
      lastKnownEaHeartbeats: diagnostics.lastKnownEaHeartbeats || [],
      matchingHeartbeatCandidates: diagnostics.matchingHeartbeatCandidates || [],
      controllerResultJson: diagnostics.controllerResultJson || existingResult,
      diagnosticSummary: diagnostics.diagnosticSummary || null,
      nextExpected: 'Recompile and reattach ReplayFX_MT5_Controller.mq5, then verify the EA heartbeat endpoint and terminal/chart match.',
    };
    await (prisma.eaCommandQueue as any).update({
      where: { id: command.id },
      data: { status: outcome.hasMatch ? outcome.status : 'WARNING', resultJson: json(result), resultAt: new Date() },
    });
    traceEaCommand('command waiting heartbeat timed out', { id: command.id, terminalId: command.terminalId, status: outcome.hasMatch ? outcome.status : 'WARNING' });
  }
}

async function cleanupStaleCommands(terminalId?: string) {
  await markExecutingTimeouts(terminalId);
  await markExpiredCommands(terminalId);
  await markStaleTemplateCommands(terminalId);
}

async function markMatchingCommandsEaOnline(heartbeat: any) {
  if (!heartbeat.terminalId || !heartbeat.symbol || !heartbeat.timeframe) return;
  const heartbeatTimestamp = heartbeat.timestamp ? new Date(heartbeat.timestamp) : new Date();
  const commands = await prisma.eaCommandQueue.findMany({
    where: {
      terminalId: heartbeat.terminalId,
      status: { in: ['WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED', 'WARNING'] },
    },
    orderBy: [
      { pickedAt: 'desc' },
      { createdAt: 'desc' },
      { resultAt: 'desc' },
    ],
    take: 20,
  });
  const scored = commands.map(command => {
    const payload = commandPayload(command);
    const existingResult = parseJson<any>(command.resultJson, {});
    const target = getApplyTemplateTarget(command);
    const heartbeatSymbol = String(heartbeat.symbol || '').toUpperCase();
    const heartbeatTimeframe = String(heartbeat.timeframe || '').toUpperCase();
    const heartbeatChartId = String(heartbeat.chartId || '').trim();
    const targetChartId = String(target.chartId || payload.chartId || existingResult.chartId || '').trim();
    const commandSymbols = [
      target.symbol,
      target.resolvedSymbol,
      payload.symbol,
      payload.requestedSymbol,
      payload.resolvedSymbol,
      existingResult.resolvedSymbol,
      existingResult.actualSymbol,
      existingResult.actualChartSymbol,
    ].filter(Boolean).map(value => String(value).toUpperCase());
    const chartMatch = Boolean(heartbeatChartId && targetChartId && heartbeatChartId === targetChartId);
    const symbolMatch = commandSymbols.includes(heartbeatSymbol) &&
      String(target.timeframe || payload.timeframe || existingResult.requestedTimeframe || '').toUpperCase() === heartbeatTimeframe;
    if (!chartMatch && !symbolMatch) return { command, score: -Infinity };
    const commandTime = new Date(command.pickedAt || command.createdAt || command.resultAt || Date.now()).getTime();
    const agePenalty = Math.max(0, Math.floor(Math.abs(heartbeatTimestamp.getTime() - commandTime) / 1000));
    let score = chartMatch ? 1000 : 600;
    score += Math.max(0, 200 - agePenalty);
    if (String(existingResult.waitingCommandId || '') === String(command.id)) score += 250;
    if (String(command.status || '').toUpperCase() === 'WAITING_EA_HEARTBEAT') score += 25;
    return { command, score, chartMatch, symbolMatch, target, payload, existingResult };
  });
  const eligible = scored.filter(item => Number.isFinite(item.score) && item.score > -Infinity).sort((a, b) => b.score - a.score);
  const match = eligible[0]?.command;
  if (!match) return;
  const top = eligible[0];
  const newerActive = eligible.find(item => item.command.id !== match.id && item.score === top.score);
  if (newerActive) {
    traceEaCommand('Heartbeat matched stale command; ignored because newer active APPLY_TEMPLATE exists.', {
      heartbeatTerminalId: heartbeat.terminalId,
      heartbeatChartId: heartbeat.chartId || null,
      heartbeatSymbol: heartbeat.symbol,
      heartbeatTimeframe: heartbeat.timeframe,
      selectedCommandId: match.id,
      newerActiveCommandId: newerActive.command.id,
    });
  }
  const outcome: any = await buildApplyTemplateHeartbeatOutcome(match);
  const payload = commandPayload(match);
  let result: any = outcome.hasMatch ? { ...outcome.result } : {
    message: 'EA online',
    requestedSymbol: payload.symbol || null,
    requestedTimeframe: payload.timeframe || null,
    actualChartSymbol: heartbeat.symbol,
    actualChartTimeframe: heartbeat.timeframe,
    heartbeatId: heartbeat.id,
    terminalId: heartbeat.terminalId,
    symbol: heartbeat.symbol,
    timeframe: heartbeat.timeframe,
    chartId: heartbeat.chartId || null,
    eaName: heartbeat.eaName || null,
    mode: heartbeat.mode || null,
  };
  await (prisma.eaCommandQueue as any).update({
    where: { id: match.id },
    data: { status: outcome.hasMatch ? outcome.status : 'EA_ONLINE', resultJson: json(result), resultAt: new Date() },
  });
  traceEaCommand('command marked EA_ONLINE', {
    id: match.id,
    terminalId: match.terminalId,
    symbol: heartbeat.symbol,
    timeframe: heartbeat.timeframe,
    eaName: heartbeat.eaName || null,
    status: outcome.hasMatch ? outcome.status : 'EA_ONLINE',
    oldStatus: 'WAITING_EA_HEARTBEAT',
    newStatus: outcome.hasMatch ? outcome.status : 'EA_ONLINE',
    matchedInstanceId: outcome.candidate?.id || null,
    matchedHeartbeatAt: outcome.result?.matchedHeartbeatAt || heartbeat.timestamp || null,
  });
  await prisma.eaCommandLog.create({
    data: { source: 'MT5_HEARTBEAT', command: match.commandType, status: outcome.hasMatch ? outcome.status : 'EA_ONLINE', terminalId: match.terminalId, payloadJson: match.payloadJson, resultJson: json(result) },
  });

  if (outcome.hasMatch && outcome.modeSyncQueued) {
    const requestedMode = String((outcome.result as any)?.modeSyncRequestedMode || (outcome.result as any)?.requestedMode || payload.mode || payload.requestedMode || '').toUpperCase();
    if (requestedMode && outcome.candidate?.id) {
      await upsertRuntimeConfig(outcome.candidate.id, { mode: requestedMode });
      const modeSyncCommand = await createEaCommand({
        terminalId: match.terminalId,
        commandType: 'SET_MODE',
        source: match.source || 'SYSTEM',
        payload: {
          instanceId: outcome.candidate.id,
          symbol: result.actualSymbol || result.resolvedSymbol || result.requestedSymbol || payload.symbol || '',
          timeframe: result.actualTimeframe || result.requestedTimeframe || payload.timeframe || '',
          mode: requestedMode,
        },
        requiresConfirmation: false,
      });
      const queuedResult = {
        ...result,
        modeSyncCommandId: modeSyncCommand.id,
        modeSyncStatus: 'QUEUED',
        modeSyncStartedAt: new Date().toISOString(),
        modeSyncRequestedMode: requestedMode,
        modeSyncActualMode: String(result.actualMode || '').toUpperCase(),
        modeSyncMessage: `Applying requested mode ${requestedMode}...`,
        nextExpected: `Applying requested mode ${requestedMode}...`,
        message: `Template applied and EA heartbeat detected.\n\nApplying requested mode ${requestedMode}...`,
      };
      await (prisma.eaCommandQueue as any).update({
        where: { id: match.id },
        data: { resultJson: json(queuedResult), resultAt: new Date() },
      });
      await prisma.eaCommandLog.create({
        data: { source: 'SYSTEM', command: 'SET_MODE', status: 'QUEUED', terminalId: match.terminalId, payloadJson: json({ instanceId: outcome.candidate.id, mode: requestedMode }), resultJson: json({ commandId: modeSyncCommand.id, mode: requestedMode }) },
      });
    }
  }
}

function isUniqueApprovalCodeError(err: any) {
  const code = String(err?.code || '');
  if (code !== 'P2002') return false;
  const target = err?.meta?.target;
  if (!target) return true;
  const values = Array.isArray(target) ? target : [target];
  return values.map((value: any) => String(value)).some((value: string) => value.toLowerCase().includes('approvalcode'));
}

async function generateUniqueApprovalCode(prefix = 'SIG', attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const code = `${prefix}${crypto.randomInt(100000, 1000000)}`;
    const existing = await prisma.eaSignalProposal.findUnique({ where: { approvalCode: code } }).catch(() => null);
    if (!existing) return code;
  }
  throw new Error('Unable to generate unique approval code');
}

async function cancelPendingEaCommands(terminalId: string) {
  const now = new Date();
  const result = await (prisma.eaCommandQueue as any).updateMany({
    where: {
      terminalId,
      status: { in: CANCELABLE_COMMAND_STATUSES },
    },
    data: { status: 'CANCELLED', cancelledAt: now, resultAt: now, resultJson: json({ message: 'Command cancelled.' }) },
  });
  traceEaCommand('commands cancelled', { terminalId, count: result.count });
  await prisma.eaCommandLog.create({ data: { source: 'WEBSITE', command: 'CANCEL_PENDING_COMMANDS', status: 'CANCELLED', terminalId, payloadJson: json({ terminalId, count: result.count }) } });
  return result;
}

async function getActiveTerminalCommand(terminalId: string) {
  return prisma.eaCommandQueue.findFirst({
    where: { terminalId, status: { in: ACTIVE_COMMAND_STATUSES } },
    orderBy: { pickedAt: 'asc' },
  });
}

router.get('/commands/poll', requireEaToken, async (req, res) => {
  const terminalId = String(req.query.terminalId || '');
  const flat = String(req.query.format || '').toLowerCase() === 'flat';
  if (!terminalId) return res.status(400).json({ ok: false, error: 'terminalId is required' });
  await cleanupStaleCommands(terminalId);

  const active = await getActiveTerminalCommand(terminalId);
  if (active) {
    const activeAgeSeconds = Math.max(0, Math.floor((Date.now() - new Date(active.pickedAt || active.createdAt).getTime()) / 1000));
    traceEaCommand('poll blocked by active command', { terminalId, activeCommandId: active.id, status: active.status, commandType: active.commandType, activeAgeSeconds });
    const blockedMsg = `Waiting for active command ${active.id} to finish.`;
    if (flat) {
      const body = [
        'empty=true',
        `blocked=true`,
        `blockedBy=${active.id}`,
        `blockedStatus=${active.status}`,
        `activeCommandId=${active.id}`,
        `activeCommandType=${active.commandType}`,
        `activeCommandAgeSeconds=${activeAgeSeconds}`,
        `message=${blockedMsg}`,
      ].join('\n');
      traceEaCommand('poll flat response', { terminalId, body });
      return res.type('text/plain').send(body);
    }
    return res.json({ ok: true, commands: [], blocked: true, blockedBy: active.id, blockedStatus: active.status, activeCommandId: active.id, activeCommandType: active.commandType, activeCommandAgeSeconds: activeAgeSeconds, message: blockedMsg, activeCommand: commandResponse(active) });
  }

  const command = await prisma.eaCommandQueue.findFirst({
    where: {
      terminalId,
      status: 'QUEUED',
      requiresConfirmation: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!command) {
    const body = 'empty=true';
    traceEaCommand('poll flat response', { terminalId, body });
    return flat ? res.type('text/plain').send(body) : res.json({ ok: true, commands: [] });
  }

  const pickedAt = new Date();
  const pickToken = crypto.randomUUID();
  const picked = await (prisma.eaCommandQueue as any).updateMany({
    where: { id: command.id, status: 'QUEUED', requiresConfirmation: false },
    data: { status: 'EXECUTING', pickedAt, pickToken },
  });
  if (picked.count === 0) {
    const body = 'empty=true';
    traceEaCommand('poll flat response', { terminalId, body });
    return flat ? res.type('text/plain').send(body) : res.json({ ok: true, commands: [] });
  }

  const updated = await prisma.eaCommandQueue.findUnique({ where: { id: command.id } });
  if (!updated) {
    const body = 'empty=true';
    traceEaCommand('poll flat response', { terminalId, body });
    return flat ? res.type('text/plain').send(body) : res.json({ ok: true, commands: [] });
  }
  traceEaCommand('command picked by terminal', { id: updated.id, terminalId, commandType: updated.commandType, pickToken, pickedAt });
  await prisma.eaCommandLog.create({
    data: { source: 'MT5_CONTROLLER', command: updated.commandType, status: 'EXECUTING', terminalId: updated.terminalId, payloadJson: updated.payloadJson, resultJson: json({ pickToken, pickedAt }) },
  });
  const commandPayload = commandResponse(updated);
  if (flat) {
    const body = commandFlatPayload(commandPayload);
    traceEaCommand('poll flat response', { terminalId, body });
    return res.type('text/plain').send(body);
  }
  res.json({ ok: true, commands: [commandPayload] });
});

router.post('/commands/:id/confirm', async (req, res) => {
  const { code } = req.body || {};
  const command = await prisma.eaCommandQueue.findUnique({ where: { id: req.params.id } });
  if (!command) return res.status(404).json({ ok: false, error: 'Command not found' });
  if (command.confirmationCode !== code) return res.status(400).json({ ok: false, error: 'Invalid confirmation code' });
  if (!command.requiresConfirmation) return res.status(400).json({ ok: false, error: 'Command does not require confirmation' });
  if (command.status !== 'WAITING_CONFIRMATION') return res.status(400).json({ ok: false, error: `Command cannot be confirmed while status is ${command.status}` });
  if (command.expiresAt && command.expiresAt.getTime() < Date.now()) {
    await prisma.eaCommandQueue.update({ where: { id: command.id }, data: { status: 'EXPIRED' } });
    return res.status(400).json({ ok: false, error: 'Command expired before confirmation.' });
  }
  const updated = await (prisma.eaCommandQueue as any).update({
    where: { id: command.id },
    data: { status: 'CONFIRMED', requiresConfirmation: false, confirmationCode: null },
  });
  await prisma.eaCommandLog.create({ data: { source: 'WEBSITE', command: command.commandType, status: 'CONFIRMED', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson: command.resultJson } });
  res.json({ ok: true, command: commandResponse(updated) });
});

router.post('/commands/:id/cancel', async (req, res) => {
  const command = await prisma.eaCommandQueue.findUnique({ where: { id: req.params.id } });
  if (!command) return res.status(404).json({ ok: false, error: 'Command not found' });
  if (!CANCELABLE_COMMAND_STATUSES.includes(command.status)) return res.status(400).json({ ok: false, error: `Command cannot be cancelled while status is ${command.status}` });
  const now = new Date();
  const updated = await (prisma.eaCommandQueue as any).update({ where: { id: command.id }, data: { status: 'CANCELLED', cancelledAt: now, resultAt: now, resultJson: json({ message: 'Command cancelled.' }) } });
  traceEaCommand('command cancelled', { id: command.id, terminalId: command.terminalId, commandType: command.commandType });
  await prisma.eaCommandLog.create({ data: { source: 'WEBSITE', command: command.commandType, status: 'CANCELLED', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson: command.resultJson } });
  res.json({ ok: true, command: commandResponse(updated) });
});

router.post('/commands/cancel-pending', async (req, res) => {
  const body = req.body || {};
  const terminalId = String(body.terminalId || '');
  if (!terminalId) return res.status(400).json({ ok: false, error: 'terminalId is required' });
  const result = await cancelPendingEaCommands(terminalId);
  res.json({ ok: true, count: result.count, terminalId });
});

router.post('/commands/:id/result', requireEaToken, async (req, res) => {
  const rawStatus = String(req.body?.status || 'SUCCESS').toUpperCase();
  const resultPayload = req.body?.result && typeof req.body.result === 'object' && !Array.isArray(req.body.result) ? req.body.result : { ...(req.body || {}), status: undefined };
  const resultJson = json(resultPayload);
  const command = await prisma.eaCommandQueue.findUnique({ where: { id: req.params.id } });
  if (!command) return res.status(404).json({ ok: false, error: 'Command not found' });
  if (command.status === 'CANCELLED' || command.status === 'EXPIRED') {
    return res.status(409).json({ ok: false, error: `Command was already ${command.status} and cannot be updated.` });
  }
  if (FINAL_COMMAND_STATUSES.has(command.status)) {
    return res.json({ ok: true, command: commandResponse(command) });
  }
  const providedPickToken = String(req.body?.pickToken || req.body?.result?.pickToken || '');
  if ((command as any).pickToken && providedPickToken !== (command as any).pickToken) {
    traceEaCommand('command result rejected pickToken mismatch', { id: command.id, terminalId: command.terminalId, commandType: command.commandType });
    return res.status(409).json({ ok: false, error: 'Command pickToken mismatch. Ignoring stale controller result.' });
  }
  if (!['EXECUTING', 'WAITING_EA_HEARTBEAT', 'TEMPLATE_APPLY_REQUESTED'].includes(command.status) && !FINAL_COMMAND_STATUSES.has(command.status)) {
    return res.status(409).json({ ok: false, error: `Command result not accepted while status is ${command.status}` });
  }

  let normalizedStatus = rawStatus;
  if (command.commandType === 'APPLY_TEMPLATE' && (normalizedStatus === 'SUCCESS' || normalizedStatus === 'TEMPLATE_APPLY_REQUESTED')) {
    normalizedStatus = 'WAITING_EA_HEARTBEAT';
  }
  const isFinalStatus = FINAL_COMMAND_STATUSES.has(normalizedStatus);
  const isProgressStatus = PROGRESS_COMMAND_STATUSES.has(normalizedStatus);
  if (!isFinalStatus && !isProgressStatus) normalizedStatus = 'SUCCESS';

  if (FINAL_COMMAND_STATUSES.has(command.status) && isProgressStatus) {
    return res.json({ ok: true, command: commandResponse(command) });
  }

  const now = new Date();
  const updateData: any = { status: normalizedStatus, resultJson, resultAt: now };
  if (isFinalStatus || normalizedStatus === 'WAITING_EA_HEARTBEAT' || normalizedStatus === 'TEMPLATE_APPLY_REQUESTED') updateData.executedAt = now;

  const updated = await (prisma.eaCommandQueue as any).update({ where: { id: command.id }, data: updateData });
  traceEaCommand('command result received', { id: updated.id, terminalId: updated.terminalId, commandType: updated.commandType, status: updated.status });
  if (updated.commandType === 'APPLY_TEMPLATE' && updated.status === 'WAITING_EA_HEARTBEAT') {
    const target = getApplyTemplateTarget(updated);
    const waitingResult = {
      ...resultPayload,
      waitingCommandId: updated.id,
      waitingTerminalId: updated.terminalId,
      waitingChartId: target.chartId,
      waitingResolvedSymbol: target.resolvedSymbol,
      waitingSymbol: target.symbol,
      waitingTimeframe: target.timeframe,
      waitingTemplateName: target.templateName,
      waitingRequestedMode: target.requestedMode,
      waitingCreatedAt: updated.createdAt?.toISOString?.() || new Date().toISOString(),
      waitingTarget: target,
    };
    await (prisma.eaCommandQueue as any).update({
      where: { id: updated.id },
      data: { resultJson: json(waitingResult) },
    });
    traceEaCommand('command waiting EA heartbeat', { id: updated.id, terminalId: updated.terminalId, result: waitingResult, waitingTarget: target });
  }

  const parsedResult = parseJson<any>(resultJson, {});
  if (updated.commandType === 'LIST_SYMBOLS' && updated.terminalId) {
    const symbols = Array.isArray(parsedResult.symbols) ? parsedResult.symbols : Array.isArray(parsedResult.result?.symbols) ? parsedResult.result.symbols : [];
    if (symbols.length) await storeTerminalSymbols(updated.terminalId, symbols);
  }
  if (updated.commandType === 'LIST_CHARTS' && updated.terminalId) {
    const charts = Array.isArray(parsedResult.charts) ? parsedResult.charts : Array.isArray(parsedResult.result?.charts) ? parsedResult.result.charts : [];
    if (charts.length) await storeTerminalCharts(updated.terminalId, charts);
  }
  if (updated.commandType === 'SCREENSHOT_CHART' && normalizedStatus === 'SUCCESS') {
    const screenshot = parsedResult.result && typeof parsedResult.result === 'object' ? parsedResult.result : parsedResult;
    await prisma.eaScreenshot.create({
      data: {
        terminalId: updated.terminalId,
        commandId: updated.id,
        filePath: screenshot.filePath || null,
        localFilePath: screenshot.filePath || null,
        url: screenshot.url || null,
        requestedSymbol: screenshot.requestedSymbol || null,
        requestedTimeframe: screenshot.requestedTimeframe || null,
        actualSymbol: screenshot.actualSymbol || screenshot.symbol || null,
        actualTimeframe: screenshot.actualTimeframe || screenshot.timeframe || null,
        chartId: screenshot.chartId || null,
        symbol: screenshot.actualSymbol || screenshot.symbol || null,
        timeframe: screenshot.actualTimeframe || screenshot.timeframe || null,
        status: 'SUCCESS',
      } as any,
    });
  }

  await prisma.eaCommandLog.create({ data: { source: 'MT5', command: updated.commandType, status: updated.status, terminalId: updated.terminalId, payloadJson: updated.payloadJson, resultJson } });
  res.json({ ok: true, command: commandResponse(updated) });
});

router.post('/screenshots', requireEaToken, async (req, res) => {
  const body = req.body || {};
  let filePath = body.filePath ? String(body.filePath) : null;
  let url = body.url ? String(body.url) : null;
  if (body.base64 && body.fileName) {
    const uploadDir = path.resolve(process.cwd(), '..', 'uploads', 'ea-screenshots');
    fs.mkdirSync(uploadDir, { recursive: true });
    const safeName = String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = path.join(uploadDir, safeName);
    fs.writeFileSync(fullPath, Buffer.from(String(body.base64), 'base64'));
    filePath = fullPath;
    url = `/uploads/ea-screenshots/${safeName}`;
  }
  const screenshot = await prisma.eaScreenshot.create({
    data: {
      instanceId: body.instanceId ? String(body.instanceId) : null,
      signalId: body.signalId ? String(body.signalId) : null,
      filePath,
      url,
      requestedSymbol: body.requestedSymbol ? String(body.requestedSymbol) : null,
      requestedTimeframe: body.requestedTimeframe ? String(body.requestedTimeframe) : null,
      actualSymbol: body.actualSymbol ? String(body.actualSymbol) : body.symbol ? String(body.symbol) : null,
      actualTimeframe: body.actualTimeframe ? String(body.actualTimeframe) : body.timeframe ? String(body.timeframe) : null,
      chartId: body.chartId ? String(body.chartId) : null,
      symbol: body.symbol ? String(body.symbol) : null,
      timeframe: body.timeframe ? String(body.timeframe) : null,
    } as any,
  });
  if (screenshot.signalId) await prisma.eaSignalProposal.updateMany({ where: { id: screenshot.signalId }, data: { screenshotId: screenshot.id } });
  res.json({ ok: true, screenshot });
});

router.get('/screenshots', async (_req, res) => {
  const screenshots = await prisma.eaScreenshot.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ ok: true, screenshots });
});

function resolveScreenshotPath(screenshot: any): string | null {
  const mt5FilesDir = process.env.MT5_FILES_DIR;
  let filePath = screenshot.localFilePath || screenshot.filePath || screenshot.url || null;
  if (!filePath) return null;

  if (filePath.startsWith('http://') || filePath.startsWith('https://')) return null;

  const allowedBase = mt5FilesDir ? path.resolve(mt5FilesDir) : path.resolve(process.cwd(), '..', 'uploads', 'ea-screenshots');
  let resolved: string;
  if (filePath.startsWith('/')) {
    resolved = path.resolve(filePath);
  } else {
    resolved = path.resolve(allowedBase, filePath);
  }

  const relative = path.relative(allowedBase, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  if (!fs.existsSync(resolved)) {
    const fallback = path.resolve(allowedBase, path.basename(filePath));
    if (fs.existsSync(fallback)) return fallback;
    return null;
  }
  return resolved;
}

router.get('/screenshots/:id/file', async (req, res) => {
  const id = String(req.params.id);
  const screenshot = await prisma.eaScreenshot.findUnique({ where: { id } });
  if (!screenshot) return res.status(404).json({ ok: false, error: 'Screenshot not found' });

  const filePath = resolveScreenshotPath(screenshot);
  if (!filePath) return res.status(404).json({ ok: false, error: 'Screenshot file not found or access denied' });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

router.get('/commands/:id/screenshot', async (req, res) => {
  const commandId = String(req.params.id);
  const screenshot = await prisma.eaScreenshot.findFirst({ where: { commandId } });
  if (!screenshot) return res.status(404).json({ ok: false, error: 'Screenshot not found for this command' });

  const filePath = resolveScreenshotPath(screenshot);
  if (!filePath) return res.status(404).json({ ok: false, error: 'Screenshot file not found or access denied' });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

router.get('/commands/:id/debug-note', async (req, res) => {
  const command = await prisma.eaCommandQueue.findUnique({ where: { id: String(req.params.id) } });
  if (!command) return res.status(404).json({ ok: false, error: 'Command not found' });
  const filePath = writeCommandDebugNote(command);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  res.sendFile(filePath);
});

router.post('/signals', requireEaToken, async (req, res) => {
  try {
    const body = req.body || {};
    const instanceId = body.instanceId ? String(body.instanceId) : null;
    const eaName = String(body.eaName || 'EA');
    const symbol = String(body.symbol || '');
    const timeframe = String(body.timeframe || '');
    const side = String(body.side || '');
    const pendingSince = new Date(Date.now() - 60_000);

    const existing = await prisma.eaSignalProposal.findFirst({
      where: {
        status: 'PENDING',
        createdAt: { gte: pendingSince },
        ...(instanceId ? { instanceId } : {}),
        eaName,
        symbol,
        timeframe,
        side,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return res.json({ ok: true, signalId: existing.id, id: existing.id, approvalCode: existing.approvalCode, status: existing.status, deduped: true });
    }

    let approvalCode = await generateUniqueApprovalCode('SIG', 10);
    let signal = null as any;
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        signal = await prisma.eaSignalProposal.create({
          data: {
            instanceId,
            eaName,
            symbol,
            timeframe,
            side,
            entry: body.entry !== undefined ? Number(body.entry) : null,
            sl: body.sl !== undefined ? Number(body.sl) : null,
            tp: body.tp !== undefined ? Number(body.tp) : null,
            rr: body.rr !== undefined ? Number(body.rr) : null,
            riskPercent: body.riskPercent !== undefined ? Number(body.riskPercent) : null,
            lot: body.lot !== undefined ? Number(body.lot) : null,
            reason: body.reason ? String(body.reason) : null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 5 * 60 * 1000),
            approvalCode,
          },
        });
        break;
      } catch (err: any) {
        if (!isUniqueApprovalCodeError(err) || attempt === 10) {
          const statusCode = isUniqueApprovalCodeError(err) ? 409 : 500;
          return res.status(statusCode).json({ ok: false, error: isUniqueApprovalCodeError(err) ? 'Duplicate approval code collision. Please retry.' : (err?.message || 'Failed to create signal proposal') });
        }
        approvalCode = await generateUniqueApprovalCode('SIG', 10);
      }
    }
    if (!signal) return res.status(500).json({ ok: false, error: 'Failed to create signal proposal' });
    await logIntegration('MT5', 'SIGNAL_CREATED', 'INFO', `Signal created: ${signal.eaName} ${signal.symbol} ${signal.timeframe} ${signal.side}`, { signalId: signal.id, approvalCode: signal.approvalCode });
    const notifications = await notifySignalCreated(signal);
    return res.json({ ok: true, signalId: signal.id, id: signal.id, approvalCode, status: signal.status, notifications });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to create signal proposal' });
  }
});

router.get('/signals', async (_req, res) => {
  const signals = await prisma.eaSignalProposal.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ ok: true, signals });
});

router.get('/signals/:id/status', requireEaToken, async (req, res) => {
  const signal = await prisma.eaSignalProposal.findUnique({ where: { id: req.params.id } });
  if (!signal) return res.status(404).json({ ok: false, error: 'Signal not found' });
  if (signal.status === 'PENDING' && signal.expiresAt && signal.expiresAt.getTime() < Date.now()) {
    const expired = await prisma.eaSignalProposal.update({ where: { id: signal.id }, data: { status: 'EXPIRED' } });
    return res.json({ ok: true, status: expired.status, signal: expired });
  }
  res.json({ ok: true, status: signal.status, signal });
});

router.post('/signals/:id/resolve', requireEaToken, async (req, res) => {
  try {
    const signal = await prisma.eaSignalProposal.findUnique({ where: { id: req.params.id } });
    if (!signal) return res.status(404).json({ ok: false, error: 'Signal not found' });

    const requestedStatus = String(req.body?.status || req.body?.result || '').trim().toUpperCase();
    const nextStatus = requestedStatus === 'FAILED' ? 'FAILED' : requestedStatus === 'EXECUTED' ? 'EXECUTED' : '';
    if (!nextStatus) {
      return res.status(400).json({ ok: false, error: 'status must be EXECUTED or FAILED' });
    }

    if (!['APPROVED', 'EXECUTED', 'FAILED'].includes(signal.status)) {
      return res.status(409).json({ ok: false, error: `Signal is ${signal.status} and cannot be resolved` });
    }

    if (signal.status === nextStatus) {
      return res.json({ ok: true, signal, deduped: true });
    }

    const resolved = await prisma.eaSignalProposal.update({
      where: { id: signal.id },
      data: { status: nextStatus, decidedAt: signal.decidedAt || new Date() },
    });

    await logIntegration(
      'MT5',
      'SIGNAL_RESOLVED',
      nextStatus === 'EXECUTED' ? 'SUCCESS' : 'WARNING',
      `Signal ${nextStatus.toLowerCase()}: ${resolved.eaName} ${resolved.symbol} ${resolved.timeframe} ${resolved.side}`,
      {
        signalId: resolved.id,
        approvalCode: resolved.approvalCode,
        status: nextStatus,
        note: String(req.body?.note || req.body?.message || ''),
      },
    );

    return res.json({ ok: true, signal: resolved });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to resolve signal' });
  }
});

router.post('/signals/:id/notify', requireEaToken, async (req, res) => {
  try {
    const signal = await prisma.eaSignalProposal.findUnique({ where: { id: req.params.id } });
    if (!signal) return res.status(404).json({ ok: false, error: 'Signal not found' });
    const notifications = await notifySignalCreated(signal);
    res.json({ ok: true, signalId: signal.id, status: signal.status, notifications });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to notify signal' });
  }
});

router.post('/signals/:id/approve', async (req, res) => {
  try {
    const signal = await prisma.eaSignalProposal.update({ where: { id: req.params.id }, data: { status: 'APPROVED', decidedAt: new Date() } });
    res.json({ ok: true, signal });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to approve signal' });
  }
});

router.post('/signals/:id/reject', async (req, res) => {
  try {
    const signal = await prisma.eaSignalProposal.update({ where: { id: req.params.id }, data: { status: 'REJECTED', decidedAt: new Date() } });
    res.json({ ok: true, signal });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Failed to reject signal' });
  }
});

router.get('/command-logs', async (_req, res) => {
  const logs = await prisma.eaCommandLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ ok: true, logs });
});

export default router;
