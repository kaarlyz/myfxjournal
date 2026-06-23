import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { sendTelegramMessage, sendTelegramPhoto } from '../routes/telegram';
import { baileysService } from './baileysService';
import { logIntegration } from '../utils/logger';
import { escapeHtml, fmtCode, formatCommandResult, formatScreenshotCaption, shortCommandId, statusLabel } from './eaFormatter';
import { createEaCommand, upsertRuntimeConfig } from './eaControlService';
import { APPLY_TEMPLATE_HEARTBEAT_CAUSES, buildApplyTemplateHeartbeatDiagnostics, buildApplyTemplateHeartbeatOutcome, commandHasDetailedResult } from './eaCommandNoteService';

export type WatcherSource = 'TELEGRAM' | 'WHATSAPP_BAILEYS';
export type WatcherTarget = { chatId: string; jid?: string };

const MAX_ATTEMPTS = 22;
const POLL_INTERVAL_MS = 2000;

const watchers = new Map<string, { source: WatcherSource; target: WatcherTarget; commandId: string; attempts: number; timeout: NodeJS.Timeout; heartbeatNoticeSent?: boolean; modeSyncNoticeSent?: boolean }>();

export function startCommandWatcher(commandId: string, source: WatcherSource, target: WatcherTarget) {
  stopCommandWatcher(commandId);
  const watcher = { source, target, commandId, attempts: 0, timeout: null as any, heartbeatNoticeSent: false, modeSyncNoticeSent: false };
  watchers.set(commandId, watcher);
  logIntegration(source === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP_BAILEYS', 'COMMAND_WATCHER_STARTED', 'INFO', `Watcher started for command ${commandId}`, { commandId, source });
  pollCommandStatus(watcher);
}

export function stopCommandWatcher(commandId: string) {
  const existing = watchers.get(commandId);
  if (existing?.timeout) clearTimeout(existing.timeout);
  watchers.delete(commandId);
}

async function pollCommandStatus(watcher: { source: WatcherSource; target: WatcherTarget; commandId: string; attempts: number; timeout: NodeJS.Timeout; heartbeatNoticeSent?: boolean; modeSyncNoticeSent?: boolean }) {
  try {
    const command = await prisma.eaCommandQueue.findUnique({ where: { id: watcher.commandId } });
    if (!command) {
      stopCommandWatcher(watcher.commandId);
      return;
    }

    const status = String(command.status || '').toUpperCase();
    const payload = JSON.parse(command.payloadJson || '{}');
    const result: any = JSON.parse(command.resultJson || '{}');

    if (command.commandType === 'APPLY_TEMPLATE' && status === 'EA_ONLINE' && String(result.modeSyncStatus || '').toUpperCase() === 'QUEUED') {
      const syncState = await pollApplyTemplateModeSync(watcher, command, payload, result);
      if (syncState === 'done') {
        stopCommandWatcher(watcher.commandId);
        return;
      }
      watcher.attempts++;
      watcher.timeout = setTimeout(() => pollCommandStatus(watcher), POLL_INTERVAL_MS);
      return;
    }

    if (['SUCCESS', 'FAILED', 'FAILED_TIMEOUT', 'EXPIRED', 'CANCELLED', 'WARNING', 'EA_ONLINE'].includes(status)) {
      await handleFinalStatus(watcher, command, status, payload, result);
      stopCommandWatcher(watcher.commandId);
      return;
    }

    if (status === 'WAITING_EA_HEARTBEAT') {
      if (!watcher.heartbeatNoticeSent) {
        await sendChatMessage(watcher.source, watcher.target, `Template applied. Waiting for EA heartbeat.\nCommand: ${watcher.commandId.slice(0, 8)}`);
        watcher.heartbeatNoticeSent = true;
      }
      if (watcher.attempts >= MAX_ATTEMPTS) {
        const updated = await markWatcherHeartbeatTimeout(command);
        const finalCommand = updated || command;
        await handleFinalStatus(watcher, finalCommand, String(finalCommand.status || 'WARNING').toUpperCase(), JSON.parse(finalCommand.payloadJson || '{}'), JSON.parse(finalCommand.resultJson || '{}'));
        stopCommandWatcher(watcher.commandId);
        return;
      }
      watcher.attempts++;
      watcher.timeout = setTimeout(() => pollCommandStatus(watcher), POLL_INTERVAL_MS);
      return;
    }

    if (watcher.attempts >= MAX_ATTEMPTS) {
      await sendChatMessage(watcher.source, watcher.target, `Command ${watcher.commandId.slice(0, 8)} timed out waiting for status update.`);
      stopCommandWatcher(watcher.commandId);
      return;
    }

    watcher.attempts++;
    watcher.timeout = setTimeout(() => pollCommandStatus(watcher), POLL_INTERVAL_MS);
  } catch (err: any) {
    logIntegration('SYSTEM', 'COMMAND_WATCHER_ERROR', 'ERROR', `Watcher error for ${watcher.commandId}`, { commandId: watcher.commandId, error: err.message });
    stopCommandWatcher(watcher.commandId);
  }
}

async function markWatcherHeartbeatTimeout(command: any) {
  if (command.commandType !== 'APPLY_TEMPLATE') return null;
  const outcome = await buildApplyTemplateHeartbeatOutcome(command);
  if (outcome.hasMatch) {
    const payload = JSON.parse(command.payloadJson || '{}');
    const requestedMode = String((outcome.result as any)?.modeSyncRequestedMode || (outcome.result as any)?.requestedMode || payload.mode || payload.requestedMode || '').toUpperCase();
    let result: any = outcome.result || {};

    const updated = await (prisma.eaCommandQueue as any).update({
      where: { id: command.id },
      data: { status: outcome.status, resultJson: JSON.stringify(result), resultAt: new Date() },
    });
    await prisma.eaCommandLog.create({
      data: {
        source: 'SYSTEM',
        command: command.commandType,
        status: outcome.status,
        terminalId: command.terminalId,
        payloadJson: command.payloadJson,
        resultJson: JSON.stringify(result),
      },
    });

    if (outcome.modeSyncQueued && requestedMode && outcome.candidate?.id) {
      await upsertRuntimeConfig(outcome.candidate.id, { mode: requestedMode });
      const modeSyncCommand = await createEaCommand({
        terminalId: command.terminalId,
        commandType: 'SET_MODE',
        source: command.source || 'SYSTEM',
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
        warning: '',
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
        where: { id: command.id },
        data: { resultJson: JSON.stringify(queuedResult), resultAt: new Date() },
      });
      await prisma.eaCommandLog.create({
        data: {
          source: 'SYSTEM',
          command: 'SET_MODE',
          status: 'QUEUED',
          terminalId: command.terminalId,
          payloadJson: command.payloadJson,
          resultJson: JSON.stringify({ commandId: modeSyncCommand.id, mode: requestedMode }),
        },
      });
    }
    return updated;
  }

  const payload = JSON.parse(command.payloadJson || '{}');
  const existingResult = JSON.parse(command.resultJson || '{}');
  const diagnostics = outcome.diagnostics || await buildApplyTemplateHeartbeatDiagnostics(command);
  const result = outcome.result || {
    warning: 'Template applied but EA heartbeat was not detected',
    message: [
      'Template applied, but EA heartbeat was not detected.',
      '',
      'Possible causes:',
      ...APPLY_TEMPLATE_HEARTBEAT_CAUSES.map(reason => `- ${reason}`),
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
    possibleReasons: diagnostics.possibleReasons || APPLY_TEMPLATE_HEARTBEAT_CAUSES,
    lastKnownEaHeartbeats: diagnostics.lastKnownEaHeartbeats || [],
    matchingHeartbeatCandidates: diagnostics.matchingHeartbeatCandidates || [],
    controllerResultJson: diagnostics.controllerResultJson || existingResult,
    diagnosticSummary: diagnostics.diagnosticSummary || null,
    nextExpected: 'Recompile and reattach ReplayFX_MT5_Controller.mq5, then verify the EA heartbeat endpoint and terminal/chart match.',
  };
  const updated = await (prisma.eaCommandQueue as any).update({
    where: { id: command.id },
    data: { status: 'WARNING', resultJson: JSON.stringify(result), resultAt: new Date() },
  });
  await prisma.eaCommandLog.create({
    data: { source: 'SYSTEM', command: command.commandType, status: 'WARNING', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson: JSON.stringify(result) },
  });
  return updated;
}

async function pollApplyTemplateModeSync(
  watcher: { source: WatcherSource; target: WatcherTarget; commandId: string; attempts: number; timeout: NodeJS.Timeout; heartbeatNoticeSent?: boolean; modeSyncNoticeSent?: boolean },
  command: any,
  payload: any,
  result: any,
) {
  const requestedMode = String((result as any).modeSyncRequestedMode || (result as any).requestedMode || payload.mode || payload.requestedMode || '').toUpperCase();
  const matchedInstanceId = String(result.matchedInstanceId || payload.instanceId || '');
  const startedAt = result.modeSyncStartedAt ? new Date(result.modeSyncStartedAt) : new Date(command.resultAt || command.executedAt || command.pickedAt || command.createdAt || Date.now());
  const timeoutMs = 120_000;

  const instance = matchedInstanceId ? await prisma.eaInstance.findUnique({ where: { id: matchedInstanceId } }).catch(() => null) : null;
  const actualMode = String(instance?.mode || result.actualMode || '').toUpperCase();
  const desiredLabel = requestedMode || 'AUTO';

  if (requestedMode && actualMode === requestedMode) {
    const syncedResult = {
      ...result,
      warning: '',
      actualMode,
      modeSyncStatus: 'SUCCESS',
      modeSyncMessage: `Mode synced: ${requestedMode}`,
      message: `Template applied and EA heartbeat detected.\n\nMode synced: ${requestedMode}.`,
      nextExpected: 'EA heartbeat detected. Template attachment complete.',
    };
    await (prisma.eaCommandQueue as any).update({
      where: { id: command.id },
      data: { status: 'SUCCESS', resultJson: JSON.stringify(syncedResult), resultAt: new Date() },
    });
    await prisma.eaCommandLog.create({
      data: { source: 'SYSTEM', command: command.commandType, status: 'SUCCESS', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson: JSON.stringify(syncedResult) },
    });
    await handleFinalStatus(watcher, { ...command, status: 'SUCCESS', resultJson: JSON.stringify(syncedResult) }, 'SUCCESS', payload, syncedResult);
    return 'done';
  }

  if (Date.now() - startedAt.getTime() > timeoutMs) {
    const failedResult = {
      ...result,
      warning: `EA online but mode sync failed. requested ${requestedMode || 'UNKNOWN'}, actual ${actualMode || 'UNKNOWN'}.`,
      modeSyncStatus: 'FAILED',
      modeSyncMessage: `EA online but mode sync failed.`,
      message: `Template applied and EA heartbeat detected.\n\nEA online but mode sync failed.`,
      nextExpected: `Requested ${requestedMode || 'UNKNOWN'} but EA remained ${actualMode || 'UNKNOWN'}. Use Runtime Config to switch manually.`,
    };
    await (prisma.eaCommandQueue as any).update({
      where: { id: command.id },
      data: { status: 'WARNING', resultJson: JSON.stringify(failedResult), resultAt: new Date() },
    });
    await prisma.eaCommandLog.create({
      data: { source: 'SYSTEM', command: command.commandType, status: 'WARNING', terminalId: command.terminalId, payloadJson: command.payloadJson, resultJson: JSON.stringify(failedResult) },
    });
    await handleFinalStatus(watcher, { ...command, status: 'WARNING', resultJson: JSON.stringify(failedResult) }, 'WARNING', payload, failedResult);
    return 'done';
  }

  if (!watcher.modeSyncNoticeSent) {
    const interim = requestedMode
      ? `✅ Template applied\n✅ EA heartbeat detected\n🔄 Applying requested mode ${desiredLabel}...`
      : '✅ Template applied\n✅ EA heartbeat detected';
    await sendChatMessage(watcher.source, watcher.target, interim);
    watcher.modeSyncNoticeSent = true;
  }
  return 'waiting';
}

async function handleFinalStatus(watcher: { source: WatcherSource; target: WatcherTarget; commandId: string }, command: any, status: string, payload: any, result: any) {
  if (command.commandType === 'SCREENSHOT_CHART' && status === 'SUCCESS') {
    await sendScreenshotToChat(watcher.source, watcher.target, command, payload, result);
    return;
  }
  if (command.commandType === 'APPLY_TEMPLATE' && status === 'WARNING' && isHeartbeatTimeoutResult(result)) {
    await sendTemplateHeartbeatTimeoutSummary(watcher.source, watcher.target, command, payload, result);
    return;
  }
  if (watcher.source === 'TELEGRAM' && ['FAILED', 'REJECTED', 'FAILED_TIMEOUT', 'EXPIRED'].includes(status)) {
    await sendTelegramFailureSummary(watcher.target, command, status, payload, result);
    return;
  }
  const channel = watcher.source === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP';
  await sendChatMessage(watcher.source, watcher.target, formatCommandResult(channel, command));
}

async function sendTelegramFailureSummary(target: WatcherTarget, command: any, status: string, payload: any, result: any) {
  const reason = result.error || result.message || (status === 'FAILED_TIMEOUT' ? 'Controller did not report result in time.' : 'Command failed.');
  const symbol = result.requestedSymbol || payload.requestedSymbol || payload.symbol || '-';
  const resolved = result.resolvedSymbol || payload.resolvedSymbol || '-';
  const timeframe = result.requestedTimeframe || payload.timeframe || '-';
  const limited = commandHasDetailedResult(command) ? '' : '\n\nController returned old/limited error format. Recompile and reattach ReplayFX_MT5_Controller.mq5.';
  const text = `<b>❌ EA Command Failed</b>\n\n` +
    `<b>Command:</b> ${fmtCode('TELEGRAM', shortCommandId(command.id))}\n` +
    `<b>Type:</b> ${fmtCode('TELEGRAM', command.commandType)}\n` +
    `<b>Status:</b> ${escapeHtml(statusLabel(status))}\n` +
    `<b>Symbol:</b> ${fmtCode('TELEGRAM', symbol)}\n` +
    `<b>Resolved:</b> ${fmtCode('TELEGRAM', resolved)}\n` +
    `<b>Timeframe:</b> ${escapeHtml(timeframe)}\n` +
    `${result.selectedResult !== undefined ? `<b>selectedResult:</b> ${fmtCode('TELEGRAM', String(result.selectedResult))}\n` : ''}` +
    `${result.chartOpenError ? `<b>chartOpenError:</b> ${fmtCode('TELEGRAM', result.chartOpenError)}\n` : ''}` +
    `${Array.isArray(result.suggestions) && result.suggestions.length ? `<b>Suggestions:</b> ${escapeHtml(result.suggestions.slice(0, 8).join(', '))}\n` : ''}` +
    `<b>Reason:</b> ${escapeHtml(reason)}${limited}`;
  await sendChatMessage('TELEGRAM', target, text, {
    inline_keyboard: [
      [
        { text: '📄 Details', callback_data: `ea:cmd:details:${command.id}` },
        { text: '🔁 Retry', callback_data: `ea:cmd:retry:${command.id}` },
      ],
      [
        { text: '🔎 Pick Similar Symbol', callback_data: `ea:symbol:suggest:${command.id}` },
        { text: '📈 Symbols', callback_data: 'm:symbols' },
      ],
      [
        { text: '🏠 Menu', callback_data: 'm:home' },
      ],
    ],
  });
}

function isHeartbeatTimeoutResult(result: any) {
  const text = `${result?.message || ''} ${result?.warning || ''}`.toLowerCase();
  return text.includes('heartbeat was not detected') || text.includes('waiting ea heartbeat');
}

async function sendTemplateHeartbeatTimeoutSummary(source: WatcherSource, target: WatcherTarget, command: any, payload: any, result: any) {
  const causes = Array.isArray(result?.possibleReasons) && result.possibleReasons.length
    ? result.possibleReasons.slice(0, 8)
    : APPLY_TEMPLATE_HEARTBEAT_CAUSES;
  if (source !== 'TELEGRAM') {
    await sendChatMessage(source, target, [
      'EA Command Failed',
      '',
      `Command: ${shortCommandId(command.id)}`,
      `Type: ${command.commandType}`,
      `Status: ${statusLabel('WARNING')}`,
      `Symbol: ${result.requestedSymbol || payload.requestedSymbol || payload.symbol || '-'}`,
      `Resolved: ${result.resolvedSymbol || result.actualSymbol || payload.resolvedSymbol || '-'}`,
      `Timeframe: ${result.requestedTimeframe || payload.timeframe || '-'}`,
      `Chart: ${result.chartId || payload.chartId || '-'}`,
      `Template: ${result.templateName || payload.templateName || payload.fileName || '-'}`,
      result.selectedResult !== undefined ? `selectedResult: ${result.selectedResult}` : '',
      result.chartOpenError ? `chartOpenError: ${result.chartOpenError}` : '',
      '',
      'Template applied, but EA heartbeat was not detected.',
      '',
      'Possible causes:',
      ...causes.map((cause: string) => `- ${cause}`),
    ].join('\n'));
    return;
  }
  const lines = [
    `<b>❌ EA Command Failed</b>`,
    '',
    `<b>Command:</b> ${fmtCode('TELEGRAM', shortCommandId(command.id))}`,
    `<b>Type:</b> ${fmtCode('TELEGRAM', command.commandType)}`,
    `<b>Status:</b> ${escapeHtml(statusLabel('WARNING'))}`,
    `<b>Symbol:</b> ${fmtCode('TELEGRAM', result.requestedSymbol || payload.requestedSymbol || payload.symbol || '-')}`,
    `<b>Resolved:</b> ${fmtCode('TELEGRAM', result.resolvedSymbol || result.actualSymbol || payload.resolvedSymbol || '-')}`,
    `<b>Timeframe:</b> ${escapeHtml(result.requestedTimeframe || payload.timeframe || '-')}`,
    `<b>Chart:</b> ${fmtCode('TELEGRAM', result.chartId || payload.chartId || '-')}`,
    `<b>Template:</b> ${fmtCode('TELEGRAM', result.templateName || payload.templateName || payload.fileName || '-')}`,
    ...(result.selectedResult !== undefined ? [`<b>selectedResult:</b> ${fmtCode('TELEGRAM', String(result.selectedResult))}`] : []),
    ...(result.chartOpenError ? [`<b>chartOpenError:</b> ${fmtCode('TELEGRAM', result.chartOpenError)}`] : []),
    '',
    `<b>Template applied, but EA heartbeat was not detected.</b>`,
    '',
    `<b>Possible causes:</b>`,
    ...causes.map((cause: string) => `- ${escapeHtml(cause)}`),
  ];
  await sendChatMessage('TELEGRAM', target, lines.join('\n'), {
    inline_keyboard: [
      [
        { text: '📄 Details', callback_data: `ea:cmd:details:${command.id}` },
        { text: '🔁 Retry', callback_data: `ea:cmd:retry:${command.id}` },
      ],
      [
        { text: '🔎 Pick Similar Symbol', callback_data: `ea:symbol:suggest:${command.id}` },
        { text: '📈 Symbols', callback_data: 'm:symbols' },
      ],
      [
        { text: '🏠 Menu', callback_data: 'm:home' },
      ],
    ],
  });
}

async function sendScreenshotToChat(source: WatcherSource, target: WatcherTarget, command: any, payload: any, result: any) {
  const mt5FilesDir = process.env.MT5_FILES_DIR;
  let filePath = result.localFilePath || result.filePath || result.url || null;
  const fileName = result.fileName || (filePath ? path.basename(filePath) : payload.fileName || '');
  let resolvedPath: string | null = null;

  if (filePath && !filePath.startsWith('/') && !filePath.startsWith('http://') && !filePath.startsWith('https://')) {
    if (mt5FilesDir) {
      filePath = path.join(mt5FilesDir, filePath);
    } else {
      filePath = path.resolve(process.cwd(), '..', 'uploads', 'ea-screenshots', path.basename(filePath));
    }
  }

  if (filePath && (filePath.startsWith('/') || path.isAbsolute(filePath))) {
    resolvedPath = path.resolve(filePath);
  } else if (filePath) {
    resolvedPath = mt5FilesDir ? path.resolve(mt5FilesDir, filePath) : path.resolve(process.cwd(), '..', 'uploads', 'ea-screenshots', path.basename(filePath));
  }

  if (resolvedPath && !fs.existsSync(resolvedPath) && fileName) {
    const fallbackBase = mt5FilesDir ? path.resolve(mt5FilesDir) : path.resolve(process.cwd(), '..', 'uploads', 'ea-screenshots');
    const fallback = path.resolve(fallbackBase, path.basename(fileName));
    if (fs.existsSync(fallback)) resolvedPath = fallback;
  }

  const channel = source === 'TELEGRAM' ? 'TELEGRAM' : 'WHATSAPP';
  const caption = formatScreenshotCaption(channel, command);

  if (source === 'TELEGRAM') {
    try {
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        await sendTelegramPhoto(target.chatId, resolvedPath, caption);
      } else {
        await sendChatMessage(source, target, `${caption}\nScreenshot created but file not found on backend path.\nMT5_FILES_DIR: ${mt5FilesDir || '-'}\nfileName: ${fileName || '-'}\nresolvedPath: ${resolvedPath || filePath || '-'}\nexists: false`);
      }
    } catch (err: any) {
      await sendChatMessage(source, target, `${caption}\n(Send failed: ${err.message})`);
    }
  } else if (source === 'WHATSAPP_BAILEYS') {
    try {
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const buffer = fs.readFileSync(resolvedPath);
        await baileysService.sendImage(target.jid || target.chatId, buffer, caption);
      } else {
        await sendChatMessage(source, target, `${caption}\n(File not found)\nMT5_FILES_DIR: ${mt5FilesDir || '-'}\nfileName: ${fileName || '-'}\nresolvedPath: ${resolvedPath || filePath || '-'}\nexists: false`);
      }
    } catch (err: any) {
      await sendChatMessage(source, target, `${caption}\n(Send failed: ${err.message})`);
    }
  }
}

async function sendChatMessage(source: WatcherSource, target: WatcherTarget, text: string, replyMarkup?: any) {
  if (source === 'TELEGRAM') {
    try {
      await sendTelegramMessage(target.chatId, text, replyMarkup);
    } catch (err: any) {
      logIntegration('TELEGRAM', 'TELEGRAM_WATCHER_SEND_FAILED', 'ERROR', `Watcher send failed: ${err.message}`, { chatId: target.chatId, error: err.message });
    }
  } else if (source === 'WHATSAPP_BAILEYS') {
    try {
      await baileysService.sendMessage(target.jid || target.chatId, text);
    } catch (err: any) {
      logIntegration('WHATSAPP_BAILEYS', 'WHATSAPP_WATCHER_SEND_FAILED', 'ERROR', `Watcher send failed: ${err.message}`, { jid: target.jid, chatId: target.chatId, error: err.message });
    }
  }
}
