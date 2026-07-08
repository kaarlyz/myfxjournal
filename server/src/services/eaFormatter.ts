import path from 'path';
import { parseJson } from './eaControlService';

export type EaFormatChannel = 'TELEGRAM' | 'WHATSAPP' | 'WHATSAPP_BAILEYS' | string;

function isTelegram(channel: EaFormatChannel) {
  return String(channel).startsWith('TELEGRAM');
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const tgEscapeHtml = escapeHtml;

export function fmtBold(channel: EaFormatChannel, value: string) {
  return isTelegram(channel) ? `<b>${escapeHtml(value)}</b>` : `*${value}*`;
}

export function fmtItalic(channel: EaFormatChannel, value: string) {
  return isTelegram(channel) ? `<i>${escapeHtml(value)}</i>` : `_${value}_`;
}

export function fmtCode(channel: EaFormatChannel, value: unknown) {
  return isTelegram(channel) ? `<code>${escapeHtml(value)}</code>` : `\`${String(value ?? '')}\``;
}

export function fmtText(channel: EaFormatChannel, value: unknown) {
  return isTelegram(channel) ? escapeHtml(value) : String(value ?? '');
}

export function shortCommandId(value: unknown) {
  return String(value || '').slice(0, 8);
}

export function statusIcon(status: string) {
  const key = String(status || '').toUpperCase();
  const icons: Record<string, string> = {
    QUEUED: '⏳',
    EXECUTING: '🔄',
    SUCCESS: '✅',
    EA_ONLINE: '✅',
    FAILED: '❌',
    REJECTED: '🚫',
    FAILED_TIMEOUT: '⏱',
    WAITING_EA_HEARTBEAT: '💓',
    WARNING: '⚠️',
    CANCELLED: '🧹',
    EXPIRED: '⏱',
  };
  return icons[key] || '•';
}

export function statusLabel(status: string) {
  const key = String(status || '').toUpperCase();
  const labels: Record<string, string> = {
    QUEUED: 'Queued',
    EXECUTING: 'Executing',
    SUCCESS: 'Success',
    EA_ONLINE: 'EA online',
    FAILED: 'Failed',
    REJECTED: 'Rejected',
    FAILED_TIMEOUT: 'Timeout',
    WAITING_EA_HEARTBEAT: 'Waiting EA heartbeat',
    WARNING: 'Warning',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  };
  return `${statusIcon(key)} ${labels[key] || key || 'Unknown'}`;
}

export function breadcrumb(channel: EaFormatChannel, parts: string[]) {
  return fmtCode(channel, parts.join(' > '));
}

export function formatCommandResult(channel: EaFormatChannel, command: any) {
  if (!isTelegram(channel)) return formatWaCommandResult(command);
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  const status = String(command?.status || '').toUpperCase();
  const isApplyTemplate = String(command?.commandType || '').toUpperCase() === 'APPLY_TEMPLATE';
  const requestedMode = String(result.requestedMode || payload.mode || payload.requestedMode || '').toUpperCase();
  const actualMode = String(result.actualMode || '').toUpperCase();
  const modeSyncQueued = String(result.modeSyncStatus || '').toUpperCase() === 'QUEUED' || Boolean(result.modeSyncQueued);
  const modeSyncFailed = String(result.modeSyncStatus || '').toUpperCase() === 'FAILED';
  const modeSyncSuccess = String(result.modeSyncStatus || '').toUpperCase() === 'SUCCESS';
  const lines = [
    fmtBold(channel, statusLabel(status || '')),
    '',
    `${fmtBold(channel, 'Command:')} ${fmtCode(channel, shortCommandId(command?.id))}`,
    `${fmtBold(channel, 'Type:')} ${fmtCode(channel, command?.commandType || '-')}`,
    `${fmtBold(channel, 'Status:')} ${statusLabel(status || '')}`,
  ];
  if (payload.symbol || result.actualSymbol || result.resolvedSymbol) lines.push(`${fmtBold(channel, 'Symbol:')} ${fmtText(channel, result.actualSymbol || result.resolvedSymbol || payload.symbol)}`);
  if (result.resolvedSymbol || payload.resolvedSymbol) lines.push(`${fmtBold(channel, 'Resolved Symbol:')} ${fmtCode(channel, result.resolvedSymbol || payload.resolvedSymbol)}`);
  if (payload.requestedSymbol && payload.requestedSymbol !== (result.resolvedSymbol || payload.symbol)) lines.push(`${fmtBold(channel, 'Requested Symbol:')} ${fmtText(channel, payload.requestedSymbol)}`);
  if (payload.timeframe || result.actualTimeframe) lines.push(`${fmtBold(channel, 'Timeframe:')} ${fmtText(channel, result.actualTimeframe || payload.timeframe)}`);
  if (isApplyTemplate && (status === 'EA_ONLINE' || status === 'SUCCESS')) {
    lines.push(`${fmtBold(channel, 'Template:')} ${fmtText(channel, 'Template applied')}`);
    lines.push(`${fmtBold(channel, 'Heartbeat:')} ${fmtText(channel, 'EA heartbeat detected')}`);
  }
  if (result.matchedInstanceId) lines.push(`${fmtBold(channel, 'Matched Instance:')} ${fmtCode(channel, result.matchedInstanceId)}`);
  if (result.matchedHeartbeatAt) lines.push(`${fmtBold(channel, 'Matched Heartbeat At:')} ${fmtCode(channel, result.matchedHeartbeatAt)}`);
  if (result.matchedEaName) lines.push(`${fmtBold(channel, 'Matched EA:')} ${fmtText(channel, result.matchedEaName)}`);
  if (requestedMode) lines.push(`${fmtBold(channel, 'Requested Mode:')} ${fmtText(channel, requestedMode)}`);
  if (actualMode) lines.push(`${fmtBold(channel, 'Actual Mode:')} ${fmtText(channel, actualMode)}`);
  if (modeSyncQueued && requestedMode) lines.push(`${fmtBold(channel, 'Mode Sync:')} ${fmtText(channel, `Applying requested mode ${requestedMode}...`)}`);
  if (modeSyncSuccess && requestedMode) lines.push(`${fmtBold(channel, 'Mode Sync:')} ${fmtText(channel, `Mode synced: ${requestedMode}`)}`);
  if (modeSyncFailed) lines.push(`${fmtBold(channel, 'Warning:')} ${fmtText(channel, result.warning || 'EA online but mode sync failed.')}`);
  if (result.selectedResult !== undefined) lines.push(`${fmtBold(channel, 'selectedResult:')} ${fmtCode(channel, String(result.selectedResult))}`);
  if (result.chartOpenError) lines.push(`${fmtBold(channel, 'ChartOpen Error:')} ${fmtCode(channel, result.chartOpenError)}`);
  if (Array.isArray(result.suggestions) && result.suggestions.length) lines.push(`${fmtBold(channel, 'Suggestions:')} ${fmtText(channel, result.suggestions.slice(0, 10).join(', '))}`);
  if (result.message) lines.push(`${fmtBold(channel, 'Message:')} ${fmtText(channel, result.message)}`);
  if (result.error) lines.push(`${fmtBold(channel, 'Error:')} ${fmtText(channel, result.error)}`);
  return lines.join('\n');
}

export function formatTgMainMenu() {
  return `${fmtBold('TELEGRAM', 'ReplayFX Control Center')}\n${breadcrumb('TELEGRAM', ['ReplayFX'])}\n\n` +
    `Pilih workflow dari tombol di bawah. Semua menu diarahkan ke aksi yang jelas.\n\n` +
    `Manual BUY, SELL, CLOSE_ALL, MODIFY_SL, dan MODIFY_TP tetap dinonaktifkan.`;
}

export function formatTgTerminalStatus(terminals: any[] = [], instances: any[] = []) {
  const terminalText = terminals.length
    ? terminals.map((t, i) => `${i + 1}. ${escapeHtml(t.terminalId || '-')} | ${t.online ? 'online' : 'offline'} | ${escapeHtml(t.broker || '-')}`).join('\n')
    : 'No controller terminal heartbeat yet.';
  const instanceText = instances.length
    ? instances.map((i, n) => `${n + 1}. ${escapeHtml(i.symbol || '-')} ${escapeHtml(i.timeframe || '-')} ${escapeHtml(i.mode || '-')} ${i.online ? 'online' : 'offline'}`).join('\n')
    : 'No EA heartbeat received yet.';
  return `${breadcrumb('TELEGRAM', ['ReplayFX', 'Terminal'])}\n\n${fmtBold('TELEGRAM', '📡 Terminal Status')}\n${terminalText}\n\n${fmtBold('TELEGRAM', 'Active EAs')}\n${instanceText}`;
}

export function formatTgEaLibrary(templates: any[] = []) {
  const lines = templates.length
    ? templates.map((t, i) => `${i + 1}. ${escapeHtml(t.name || '-')} | ${escapeHtml(t.category || 'EA')} | ${escapeHtml(t.defaultMode || 'NOTIFY_ONLY')}`)
    : ['No EA templates found.'];
  return `${breadcrumb('TELEGRAM', ['ReplayFX', 'EA Library'])}\n\n${fmtBold('TELEGRAM', 'EA Templates')}\n${lines.join('\n')}`;
}

export function formatTgAttachPreview(data: {
  terminalId?: string | null;
  ea?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  mode?: string | null;
  templateName?: string | null;
}) {
  return `${breadcrumb('TELEGRAM', ['ReplayFX', 'Attach EA', 'Preview'])}\n\n` +
    `${fmtBold('TELEGRAM', '🚀 Attach EA Preview')}\n\n` +
    `${fmtBold('TELEGRAM', 'Terminal:')} ${fmtCode('TELEGRAM', data.terminalId || '-')}\n` +
    `${fmtBold('TELEGRAM', 'EA:')} ${fmtText('TELEGRAM', data.ea || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Symbol:')} ${fmtCode('TELEGRAM', data.symbol || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Timeframe:')} ${fmtText('TELEGRAM', data.timeframe || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Mode:')} ${fmtText('TELEGRAM', data.mode || 'NOTIFY_ONLY')}\n` +
    `${fmtBold('TELEGRAM', 'Template:')} ${fmtCode('TELEGRAM', data.templateName || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Action:')} ${fmtCode('TELEGRAM', 'APPLY_TEMPLATE')}`;
}

export function formatTgScreenshotPreview(data: {
  terminalId?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  width?: number;
  height?: number;
}) {
  return `${breadcrumb('TELEGRAM', ['ReplayFX', 'Screenshot', 'Preview'])}\n\n` +
    `${fmtBold('TELEGRAM', '📸 Screenshot Preview')}\n\n` +
    `${fmtBold('TELEGRAM', 'Terminal:')} ${fmtCode('TELEGRAM', data.terminalId || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Symbol:')} ${fmtCode('TELEGRAM', data.symbol || 'current controller chart')}\n` +
    `${fmtBold('TELEGRAM', 'Timeframe:')} ${fmtText('TELEGRAM', data.timeframe || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Size:')} ${Number(data.width || 1280)}x${Number(data.height || 720)}`;
}

export function formatTgCommandResult(command: any) {
  return formatCommandResult('TELEGRAM', command);
}

export function formatTgCommandDetails(command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  return `${breadcrumb('TELEGRAM', ['ReplayFX', 'Command', shortCommandId(command?.id)])}\n\n` +
    `${fmtBold('TELEGRAM', 'Command ID:')} ${fmtCode('TELEGRAM', command?.id || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Type:')} ${fmtCode('TELEGRAM', command?.commandType || '-')}\n` +
    `${fmtBold('TELEGRAM', 'Status:')} ${statusLabel(command?.status || '')}\n` +
    `${fmtBold('TELEGRAM', 'Payload:')} ${fmtCode('TELEGRAM', JSON.stringify(payload).slice(0, 900))}\n` +
    `${fmtBold('TELEGRAM', 'Result:')} ${fmtCode('TELEGRAM', JSON.stringify(result).slice(0, 900))}`;
}

export function formatTgError(title: string, message: string, suggestions?: string[]) {
  return `${fmtBold('TELEGRAM', title)}\n\n${fmtText('TELEGRAM', message)}` +
    `${suggestions?.length ? `\n\n${fmtBold('TELEGRAM', 'Suggestions:')}\n${suggestions.slice(0, 8).map(s => `- ${escapeHtml(s)}`).join('\n')}` : ''}`;
}

export function formatScreenshotCaption(channel: EaFormatChannel, command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  if (!isTelegram(channel)) {
    return formatWaScreenshotResult({
      symbol: result.actualSymbol || result.resolvedSymbol || payload.symbol || 'current chart',
      timeframe: result.actualTimeframe || payload.timeframe || '-',
      commandId: command?.id,
      status: command?.status || 'SUCCESS',
    });
  }
  const fileName = result.fileName || (result.localFilePath ? path.basename(result.localFilePath) : result.filePath ? path.basename(result.filePath) : '');
  return `${fmtBold(channel, '✅ Screenshot Ready')}\n\n` +
    `${fmtBold(channel, 'Symbol:')} ${fmtText(channel, result.actualSymbol || result.resolvedSymbol || payload.symbol || 'current chart')}\n` +
    `${fmtBold(channel, 'Timeframe:')} ${fmtText(channel, result.actualTimeframe || payload.timeframe || '-')}\n` +
    `${fmtBold(channel, 'Command:')} ${fmtCode(channel, shortCommandId(command?.id))}\n` +
    `${fmtBold(channel, 'Status:')} ${statusLabel(command?.status || 'SUCCESS')}` +
    `${fileName ? `\n${fmtBold(channel, 'File:')} ${fmtCode(channel, fileName)}` : ''}`;
}

export function waBox(title: string, lines: Array<string | null | undefined>) {
  const clean = lines.filter(line => line !== undefined && line !== null && String(line).length > 0).map(String);
  return [`╭─「 *${title}* 」`, ...clean.map(line => `│ ${line}`), '╰───────────────'].join('\n');
}

export function formatWaMainMenu(data: {
  online?: boolean;
  accountNumber?: string | null;
  broker?: string | null;
  equity?: number | null;
  balance?: number | null;
}) {
  const equity = data.equity != null ? `$${Number(data.equity).toFixed(2)}` : data.balance != null ? `$${Number(data.balance).toFixed(2)}` : '-';
  return `${waBox('ReplayFX Control Center', [
    `📡 Terminal: ${data.online ? 'Online' : 'Offline'}`,
    `👤 Account: ${data.accountNumber || '-'}`,
    `🏦 Broker: ${data.broker || '-'}`,
    `💰 Equity: ${equity}`,
  ])}

1. 📡 Terminal Status
2. 🤖 EA Library
3. 🚀 Attach EA
4. 📸 Screenshot Chart
5. 📈 Search Symbol
6. 🖥 Active Charts
7. ⚙ Runtime Config
8. ⏸ Pause / ▶ Resume EA
9. 📜 Command Log
10. 🧹 Cleanup Stuck
11. ❓ Help

Reply with a number or type a command.`;
}

export function formatWaTerminalStatus(terminals: any[], instances: any[]) {
  const terminalLines = terminals.length
    ? terminals.map((t, index) => `${index + 1}. ${t.terminalId} — ${t.online ? 'Online' : 'Offline'} — ${t.broker || '-'}`)
    : ['No controller terminal heartbeat yet.'];
  const instanceLines = instances.length
    ? instances.map((i, index) => `${index + 1}. ${i.symbol} ${i.timeframe} — ${i.mode} — ${i.online ? 'Online' : 'Offline'}`)
    : ['No EA heartbeat received yet.'];
  return `${waBox('Terminal Status', terminalLines)}\n\n${waBox('Active EAs', instanceLines)}`;
}

export function formatWaEaLibrary(templates: any[]) {
  return waBox('EA Library', templates.length
    ? templates.map((t, index) => `${index + 1}. 🤖 ${t.name} — ${t.category || 'EA'} — ${t.defaultMode || 'NOTIFY_ONLY'}`)
    : ['No EA templates found.']);
}

export function formatWaAttachPreview(data: {
  ea?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  mode?: string | null;
  terminalId?: string | null;
  templateName?: string | null;
  resolvedLine?: string | null;
}) {
  return `${waBox('Attach EA Preview', [
    `🤖 EA: ${data.ea || '-'}`,
    `📈 Symbol: ${data.symbol || '-'}`,
    data.resolvedLine || null,
    `⏱ TF: ${data.timeframe || '-'}`,
    `⚙ Mode: ${data.mode || 'NOTIFY_ONLY'}`,
    `🖥 Terminal: ${data.terminalId || '-'}`,
    data.templateName ? `📄 Template: ${data.templateName}` : null,
  ])}

Reply *yes* to confirm or *cancel*.`;
}

export function formatWaScreenshotResult(data: {
  symbol?: string | null;
  timeframe?: string | null;
  commandId?: string | null;
  status?: string | null;
}) {
  return `✅ *Screenshot Ready*

*Symbol:* ${data.symbol || '-'}
*Timeframe:* ${data.timeframe || '-'}
*Command:* \`${shortCommandId(data.commandId)}\`
*Status:* ${data.status || 'SUCCESS'}`;
}

export function formatWaCommandResult(command: any) {
  const payload = parseJson<any>(command?.payloadJson, {});
  const result = parseJson<any>(command?.resultJson, {});
  return waBox('Command Result', [
    `${statusLabel(command?.status || '')}`,
    `Command: ${shortCommandId(command?.id)}`,
    `Type: ${command?.commandType || '-'}`,
    `Symbol: ${result.actualSymbol || result.resolvedSymbol || payload.symbol || '-'}`,
    `Timeframe: ${result.actualTimeframe || payload.timeframe || '-'}`,
    result.message ? `Message: ${result.message}` : null,
    result.error ? `Error: ${result.error}` : null,
  ]);
}

export function formatWaError(title: string, message: string, suggestions?: string[]) {
  return `${waBox(title, [
    `❌ ${message}`,
    suggestions?.length ? `Suggestions: ${suggestions.slice(0, 8).join(', ')}` : null,
  ])}`;
}

export function formatWaHelp() {
  return `${waBox('ReplayFX Help', [
    'Safe EA management only.',
    'Manual BUY, SELL, CLOSE_ALL, MODIFY_SL, MODIFY_TP are disabled.',
  ])}

Shortcuts:
\`menu\`
\`status\`
\`symbols xau\`
\`charts\`
\`screenshot BTCUSD H1\`
\`attach ERS BTCUSD H1\`
\`config\`
\`cleanup\`
\`logs\`
\`cancel\``;
}
