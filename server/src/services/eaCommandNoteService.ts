import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { parseJson } from './eaControlService';
import { shortCommandId } from './eaFormatter';

const NOTE_DIR = path.resolve(process.cwd(), 'uploads', 'ea-command-notes');

export const APPLY_TEMPLATE_HEARTBEAT_CAUSES = [
  'Template does not contain the integrated EA',
  'EA .ex5 is missing/not compiled',
  'EA input token/backend URL is wrong',
  'EA failed OnInit',
  'EA heartbeat endpoint returned 401/400',
];

function value(result: any, payload: any, key: string) {
  return result?.[key] ?? payload?.[key] ?? '';
}

function toIso(value: any) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.toISOString === 'function') return value.toISOString();
  return String(value);
}

function simplifyHeartbeat(heartbeat: any) {
  return {
    heartbeatId: heartbeat?.id || '',
    timestamp: toIso(heartbeat?.timestamp),
    terminalId: heartbeat?.terminalId || '',
    chartId: heartbeat?.chartId || '',
    symbol: heartbeat?.symbol || '',
    timeframe: heartbeat?.timeframe || '',
    eaName: heartbeat?.eaName || '',
    mode: heartbeat?.mode || '',
    accountNumber: heartbeat?.accountNumber || '',
    status: heartbeat?.status || '',
  };
}

function isControllerHeartbeat(heartbeat: any) {
  const payload = parseJson<any>(heartbeat?.payloadJson, {});
  return payload.instanceId === 'controller' || String(heartbeat?.eaName || '').toLowerCase() === 'replayfx mt5 controller';
}

function simplifyInstance(instance: any) {
  return {
    id: instance?.id || '',
    terminalId: instance?.terminalId || '',
    templateId: instance?.templateId || '',
    chartId: instance?.chartId || '',
    symbol: instance?.symbol || '',
    timeframe: instance?.timeframe || '',
    mode: instance?.mode || '',
    status: instance?.status || '',
    lastHeartbeatAt: toIso(instance?.lastHeartbeatAt),
    accountNumber: instance?.accountNumber || '',
    templateName: instance?.templateName || '',
  };
}

function normalizeMatchText(value: any) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getCommandReferenceTime(command: any) {
  const ref = command?.pickedAt || command?.executedAt || command?.createdAt || null;
  const date = ref ? new Date(ref) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function scoreHeartbeatCandidate(command: any, candidate: any, requestedSymbol: string, resolvedSymbol: string, requestedTimeframe: string, expectedEaName: string) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  const chartId = String(value(result, payload, 'chartId') || '').trim();
  const candidateChartId = String(candidate?.chartId || '').trim();
  const candidateSymbol = String(candidate?.symbol || '').trim();
  const candidateTimeframe = String(candidate?.timeframe || '').trim();
  const candidateEaName = normalizeMatchText(candidate?.eaName || '');
  const expectedName = normalizeMatchText(expectedEaName || '');
  const commandReferenceTime = getCommandReferenceTime(command);
  const lastHeartbeatAt = candidate?.lastHeartbeatAt ? new Date(candidate.lastHeartbeatAt) : null;
  const freshWindowMs = 5 * 60_000;

  if (!lastHeartbeatAt || Number.isNaN(lastHeartbeatAt.getTime())) return -Infinity;
  if (commandReferenceTime && lastHeartbeatAt.getTime() < commandReferenceTime.getTime() - freshWindowMs) return -Infinity;
  if (!['ONLINE', 'INIT'].includes(String(candidate?.status || '').toUpperCase())) return -Infinity;
  if (command?.terminalId && candidate?.terminalId && String(command.terminalId) !== String(candidate.terminalId)) return -Infinity;

  const symbolMatches = [requestedSymbol, resolvedSymbol].filter(Boolean).some(sym => String(sym).toUpperCase() === candidateSymbol.toUpperCase());
  const timeframeMatches = requestedTimeframe && candidateTimeframe.toUpperCase() === String(requestedTimeframe).toUpperCase();
  const chartMatches = chartId && candidateChartId === chartId;
  const eaNameMatches = expectedName && candidateEaName && (candidateEaName === expectedName || candidateEaName.includes(expectedName) || expectedName.includes(candidateEaName));

  if (!chartMatches && !symbolMatches && !timeframeMatches) return -Infinity;

  let score = 0;
  if (chartMatches) score += 100;
  if (symbolMatches) score += 40;
  if (timeframeMatches) score += 20;
  if (eaNameMatches) score += 15;
  if (candidate?.status === 'ONLINE') score += 10;
  score += Math.min(20, Math.max(0, Math.floor((Date.now() - lastHeartbeatAt.getTime()) / 10_000)));
  return score;
}

function chooseMatchingHeartbeatCandidate(command: any, diagnostics: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = diagnostics?.controllerResultJson || parseJson<any>(command?.resultJson, {});
  const requestedSymbol = String(diagnostics?.requestedSymbol || payload.symbol || '').trim();
  const resolvedSymbol = String(diagnostics?.resolvedSymbol || result.resolvedSymbol || result.actualSymbol || payload.resolvedSymbol || payload.symbol || requestedSymbol || '').trim();
  const requestedTimeframe = String(diagnostics?.requestedTimeframe || payload.timeframe || '').trim();
  const expectedEaName = String(diagnostics?.expectedEaName || result.expectedEaName || payload.templateName || payload.fileName || '').trim();

  const candidates = Array.isArray(diagnostics?.matchingHeartbeatCandidates) ? diagnostics.matchingHeartbeatCandidates : [];
  const scored = candidates
    .map((candidate: any) => ({
      candidate,
      score: scoreHeartbeatCandidate(command, candidate, requestedSymbol, resolvedSymbol, requestedTimeframe, expectedEaName),
    }))
    .filter((item: { candidate: any; score: number }) => Number.isFinite(item.score) && item.score > -Infinity)
    .sort((a: { candidate: any; score: number }, b: { candidate: any; score: number }) => b.score - a.score);
  return scored[0]?.candidate || null;
}

function expectedEx5FileName(template: any, payload: any, templateName: string) {
  const source = String(template?.fileName || payload?.fileName || template?.name || templateName || '').trim();
  if (!source) return '';
  return path.basename(source).replace(/\.(mq5|tpl|ex5)$/i, '.ex5');
}

export function commandHasDetailedResult(command: any) {
  const result = parseJson<any>(command?.resultJson, {});
  const keys = [
    'requestedSymbol',
    'resolvedSymbol',
    'actualSymbol',
    'requestedTimeframe',
    'actualTimeframe',
    'chartId',
    'templateName',
    'chartOpenError',
    'selectedResult',
    'mt5Error',
    'suggestions',
  ];
  return keys.some(key => result?.[key] !== undefined);
}

export function buildCommandDebugNote(command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  const oldFormatNote = commandHasDetailedResult(command)
    ? ''
    : '\nnextExpected: Controller returned old/limited error format. Recompile and reattach ReplayFX_MT5_Controller.mq5.\n';

  const fields: Array<[string, any]> = [
    ['commandId', command?.id],
    ['terminalId', command?.terminalId],
    ['commandType', command?.commandType],
    ['status', command?.status],
    ['source', command?.source],
    ['createdAt', command?.createdAt?.toISOString?.() || command?.createdAt],
    ['pickedAt', command?.pickedAt?.toISOString?.() || command?.pickedAt],
    ['executedAt', command?.executedAt?.toISOString?.() || command?.executedAt],
    ['resultAt', command?.resultAt?.toISOString?.() || command?.resultAt],
    ['payloadJson', command?.payloadJson || ''],
    ['resultJson', command?.resultJson || ''],
    ['requestedSymbol', value(result, payload, 'requestedSymbol') || payload.symbol],
    ['resolvedSymbol', value(result, payload, 'resolvedSymbol')],
    ['actualSymbol', value(result, payload, 'actualSymbol')],
    ['requestedTimeframe', value(result, payload, 'requestedTimeframe') || payload.timeframe],
    ['actualTimeframe', value(result, payload, 'actualTimeframe')],
    ['chartId', value(result, payload, 'chartId')],
    ['templateName', value(result, payload, 'templateName')],
    ['expectedEaName', result.expectedEaName || ''],
    ['expectedFileName', result.expectedFileName || ''],
    ['message', result.message || ''],
    ['error', result.error || ''],
    ['chartOpenError', result.chartOpenError || ''],
    ['selectedResult', result.selectedResult ?? ''],
    ['mt5Error', result.mt5Error || ''],
    ['suggestions', Array.isArray(result.suggestions) ? result.suggestions.join(', ') : result.suggestions || ''],
    ['possibleReasons', Array.isArray(result.possibleReasons) ? result.possibleReasons.join(' | ') : result.possibleReasons || ''],
    ['lastKnownEaHeartbeats', Array.isArray(result.lastKnownEaHeartbeats) ? JSON.stringify(result.lastKnownEaHeartbeats) : result.lastKnownEaHeartbeats || ''],
    ['matchingHeartbeatCandidates', Array.isArray(result.matchingHeartbeatCandidates) ? JSON.stringify(result.matchingHeartbeatCandidates) : result.matchingHeartbeatCandidates || ''],
    ['controllerResultJson', result.controllerResultJson ? JSON.stringify(result.controllerResultJson) : ''],
    ['nextExpected', result.nextExpected || (commandHasDetailedResult(command) ? '' : 'Controller returned old/limited error format. Recompile and reattach ReplayFX_MT5_Controller.mq5.')],
  ];

  return [
    'ReplayFX EA Command Debug Note',
    '================================',
    '',
    ...fields.map(([key, val]) => `${key}: ${typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}`),
    oldFormatNote,
    '',
    'raw result JSON:',
    JSON.stringify(result, null, 2),
  ].join('\n');
}

export function writeCommandDebugNote(command: any) {
  fs.mkdirSync(NOTE_DIR, { recursive: true });
  const shortId = shortCommandId(command?.id) || 'unknown';
  const filePath = path.join(NOTE_DIR, `replayfx-command-${shortId}.txt`);
  fs.writeFileSync(filePath, buildCommandDebugNote(command), 'utf8');
  return filePath;
}

export async function buildApplyTemplateHeartbeatDiagnostics(command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  const templateSearch = [
    payload.templateId ? String(payload.templateId) : '',
    payload.fileName ? String(payload.fileName) : '',
    payload.templateName ? String(payload.templateName) : '',
    result.templateName ? String(result.templateName) : '',
  ].filter(Boolean);

  const template = templateSearch.length ? await prisma.eaTemplate.findFirst({
    where: {
      OR: [
        ...(payload.templateId ? [{ id: String(payload.templateId) }] : []),
        ...(payload.fileName ? [{ fileName: String(payload.fileName) }] : []),
        ...(payload.templateName ? [{ templateName: String(payload.templateName) }] : []),
        ...(result.templateName ? [{ templateName: String(result.templateName) }] : []),
      ],
    },
  }).catch(() => null) : null;

  const requestedSymbol = String(value(result, payload, 'requestedSymbol') || payload.symbol || '').trim();
  const resolvedSymbol = String(value(result, payload, 'resolvedSymbol') || value(result, payload, 'actualSymbol') || payload.resolvedSymbol || payload.symbol || requestedSymbol || '').trim();
  const requestedTimeframe = String(value(result, payload, 'requestedTimeframe') || payload.timeframe || '').trim();
  const actualTimeframe = String(value(result, payload, 'actualTimeframe') || payload.actualTimeframe || '').trim();
  const chartId = String(value(result, payload, 'chartId') || payload.chartId || '').trim();
  const templateName = String(value(result, payload, 'templateName') || payload.templateName || template?.templateName || template?.fileName || '').trim();
  const expectedEaName = String(template?.name || template?.templateName || templateName || '').trim();
  const expectedFileName = expectedEx5FileName(template, payload, templateName);
  const referenceTime = getCommandReferenceTime(command);
  const freshnessCutoff = referenceTime ? new Date(referenceTime.getTime() - 5 * 60_000) : new Date(Date.now() - 5 * 60_000);

  const lastKnownEaHeartbeats = await prisma.eaTerminalHeartbeat.findMany({
    where: { terminalId: command?.terminalId },
    orderBy: { timestamp: 'desc' },
    take: 50,
  }).then(rows => rows.filter(row => !isControllerHeartbeat(row)).slice(0, 10).map(simplifyHeartbeat)).catch(() => []);

  const matchingHeartbeatCandidates = await prisma.eaInstance.findMany({
    where: {
      terminalId: command?.terminalId,
      status: { in: ['ONLINE', 'INIT'] },
      OR: [
        ...(chartId ? [{ chartId }] : []),
        ...(resolvedSymbol ? [{ symbol: resolvedSymbol }] : []),
        ...(requestedSymbol && requestedSymbol !== resolvedSymbol ? [{ symbol: requestedSymbol }] : []),
      ],
      ...(referenceTime ? { lastHeartbeatAt: { gte: freshnessCutoff } } : {}),
      ...(requestedTimeframe ? { timeframe: requestedTimeframe } : {}),
    },
    orderBy: [
      { lastHeartbeatAt: 'desc' },
      { updatedAt: 'desc' },
    ],
    take: 10,
  }).then(rows => rows.map(simplifyInstance)).catch(() => []);

  const matchingHeartbeatCandidatesFiltered = matchingHeartbeatCandidates.filter(candidate => {
    const heartbeatAt = candidate.lastHeartbeatAt ? new Date(candidate.lastHeartbeatAt) : null;
    if (!heartbeatAt || Number.isNaN(heartbeatAt.getTime())) return false;
    if (referenceTime && heartbeatAt.getTime() < freshnessCutoff.getTime()) return false;
    return true;
  });

  const lastHeartbeatAt = lastKnownEaHeartbeats[0]?.timestamp || '';
  const staleHint = lastHeartbeatAt ? `Last terminal heartbeat: ${lastHeartbeatAt}` : 'No terminal heartbeat recorded during the watch window.';
  const hasMatchingInstance = matchingHeartbeatCandidatesFiltered.length > 0;
  const hasAnyHeartbeat = lastKnownEaHeartbeats.length > 0;

  const possibleReasons = [...APPLY_TEMPLATE_HEARTBEAT_CAUSES];

  if (!hasAnyHeartbeat) {
    possibleReasons.unshift('No EA heartbeat was seen on this terminal while the command was waiting.');
  } else if (!hasMatchingInstance) {
    possibleReasons.unshift('Other EA heartbeats exist on this terminal, but none matched the requested chart/symbol/timeframe.');
  } else {
    possibleReasons.unshift('Matching EA instance exists, but it stopped sending heartbeat updates before the timeout.');
  }

  if (result.chartOpenError) {
    possibleReasons.unshift(`Controller reported ChartOpen error ${result.chartOpenError}.`);
  }
  if (result.mt5Error) {
    possibleReasons.unshift(`Controller reported MT5 error: ${result.mt5Error}.`);
  }
  if (result.error && !String(result.error).includes('heartbeat')) {
    possibleReasons.unshift(`Controller reported: ${result.error}`);
  }

  return {
    requestedSymbol,
    resolvedSymbol,
    actualSymbol: String(value(result, payload, 'actualSymbol') || resolvedSymbol || requestedSymbol || '').trim(),
    requestedTimeframe,
    actualTimeframe,
    chartId,
    templateName,
    expectedEaName,
    expectedFileName,
    possibleReasons,
    lastKnownEaHeartbeats,
    matchingHeartbeatCandidates: matchingHeartbeatCandidatesFiltered,
    controllerResultJson: result,
    diagnosticSummary: {
      terminalId: command?.terminalId || '',
      staleHint,
      hasAnyHeartbeat,
      hasMatchingInstance,
      referenceTime: referenceTime ? referenceTime.toISOString() : '',
    },
  };
}

export async function buildApplyTemplateHeartbeatOutcome(command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const existingResult = parseJson<any>(command?.resultJson, {});
  const diagnostics = await buildApplyTemplateHeartbeatDiagnostics(command);
  const candidate = chooseMatchingHeartbeatCandidate(command, diagnostics);
  const hasMatch = Boolean(candidate || diagnostics.diagnosticSummary?.hasMatchingInstance);
  const requestedMode = String(payload.mode || existingResult.requestedMode || payload.requestedMode || '').toUpperCase();
  const actualMode = String(candidate?.mode || existingResult.actualMode || '').toUpperCase();
  const modeMismatch = Boolean(requestedMode && actualMode && requestedMode !== actualMode);

  if (!hasMatch) {
    const warning = {
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
      possibleReasons: diagnostics.possibleReasons || APPLY_TEMPLATE_HEARTBEAT_CAUSES,
      lastKnownEaHeartbeats: diagnostics.lastKnownEaHeartbeats || [],
      matchingHeartbeatCandidates: diagnostics.matchingHeartbeatCandidates || [],
      controllerResultJson: diagnostics.controllerResultJson || existingResult,
      diagnosticSummary: diagnostics.diagnosticSummary || null,
      nextExpected: 'Recompile and reattach ReplayFX_MT5_Controller.mq5, then verify the EA heartbeat endpoint and terminal/chart match.',
    };
    return { hasMatch: false, status: 'WARNING', result: warning, diagnostics, candidate: null, modeMismatch: false, modeSyncQueued: false };
  }

  const modeSyncQueued = Boolean(modeMismatch && requestedMode);
  const result = {
    message: 'Template applied and EA heartbeat detected.',
    warning: '',
    requestedSymbol: diagnostics.requestedSymbol || payload.symbol || null,
    resolvedSymbol: diagnostics.resolvedSymbol || candidate?.symbol || existingResult.resolvedSymbol || existingResult.actualSymbol || payload.resolvedSymbol || null,
    actualSymbol: candidate?.symbol || diagnostics.actualSymbol || existingResult.actualSymbol || existingResult.actualChartSymbol || payload.actualSymbol || null,
    requestedTimeframe: diagnostics.requestedTimeframe || payload.timeframe || null,
    actualTimeframe: candidate?.timeframe || diagnostics.actualTimeframe || existingResult.actualTimeframe || existingResult.actualChartTimeframe || payload.actualTimeframe || null,
    chartId: diagnostics.chartId || candidate?.chartId || existingResult.chartId || payload.chartId || null,
    templateName: diagnostics.templateName || existingResult.templateName || payload.templateName || null,
    expectedEaName: diagnostics.expectedEaName || null,
    expectedFileName: diagnostics.expectedFileName || null,
    matchedInstanceId: candidate?.id || null,
    matchedHeartbeatAt: candidate?.lastHeartbeatAt || candidate?.updatedAt || null,
    matchedEaName: candidate?.eaName || diagnostics.expectedEaName || null,
    requestedMode: requestedMode || null,
    actualMode: actualMode || candidate?.mode || null,
    modeSyncQueued,
    modeSyncStatus: modeSyncQueued ? 'QUEUED' : 'NONE',
    modeSyncRequestedMode: requestedMode || null,
    modeSyncActualMode: actualMode || candidate?.mode || null,
    modeSyncMessage: modeSyncQueued
      ? `Applying requested mode ${requestedMode || 'AUTO'}...`
      : '',
    possibleReasons: [],
    lastKnownEaHeartbeats: diagnostics.lastKnownEaHeartbeats || [],
    matchingHeartbeatCandidates: diagnostics.matchingHeartbeatCandidates || [],
    controllerResultJson: diagnostics.controllerResultJson || existingResult,
    diagnosticSummary: diagnostics.diagnosticSummary || null,
    nextExpected: modeSyncQueued
      ? `Applying requested mode ${requestedMode || 'AUTO'}...`
      : 'EA heartbeat detected. Template attachment complete.',
  };
  return { hasMatch: true, status: 'EA_ONLINE', result, diagnostics, candidate, modeMismatch, modeSyncQueued };
}
