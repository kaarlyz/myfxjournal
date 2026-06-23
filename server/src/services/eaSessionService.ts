export type EaBotChannel = 'TELEGRAM' | 'WHATSAPP';

export type EaBotSession = {
  channel: EaBotChannel;
  flow: string;
  step: string;
  selectedTerminalId?: string;
  selectedTemplateId?: string;
  selectedSymbol?: string;
  selectedTimeframe?: string;
  selectedMode?: string;
  selectedChartIndex?: number;
  selectedInstanceId?: string;
  selectedConfigKey?: string;
  page: number;
  searchQuery?: string;
  data: Record<string, any>;
  history: string[];
  expiresAt: number;
};

const SESSION_TTL_MS = 5 * 60 * 1000;
const sessions = new Map<string, EaBotSession>();

function key(channel: EaBotChannel, senderId: string) {
  return `${channel}:${senderId}`;
}

export function getEaSession(channel: EaBotChannel, senderId: string) {
  const session = sessions.get(key(channel, senderId));
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(key(channel, senderId));
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

export function setEaSession(channel: EaBotChannel, senderId: string, patch: Partial<EaBotSession>) {
  const existing = getEaSession(channel, senderId);
  const has = (key: keyof EaBotSession) => Object.prototype.hasOwnProperty.call(patch, key);
  const next: EaBotSession = {
    channel,
    flow: patch.flow || existing?.flow || 'menu',
    step: patch.step || existing?.step || 'home',
    selectedTerminalId: has('selectedTerminalId') ? patch.selectedTerminalId : existing?.selectedTerminalId,
    selectedTemplateId: has('selectedTemplateId') ? patch.selectedTemplateId : existing?.selectedTemplateId,
    selectedSymbol: has('selectedSymbol') ? patch.selectedSymbol : existing?.selectedSymbol,
    selectedTimeframe: has('selectedTimeframe') ? patch.selectedTimeframe : existing?.selectedTimeframe,
    selectedMode: has('selectedMode') ? patch.selectedMode : existing?.selectedMode,
    selectedChartIndex: has('selectedChartIndex') ? patch.selectedChartIndex : existing?.selectedChartIndex,
    selectedInstanceId: has('selectedInstanceId') ? patch.selectedInstanceId : existing?.selectedInstanceId,
    selectedConfigKey: has('selectedConfigKey') ? patch.selectedConfigKey : existing?.selectedConfigKey,
    page: patch.page ?? existing?.page ?? 0,
    searchQuery: has('searchQuery') ? patch.searchQuery : existing?.searchQuery,
    data: { ...(existing?.data || {}), ...(patch.data || {}) },
    history: patch.history || existing?.history || [],
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(key(channel, senderId), next);
  return next;
}

export function pushEaSession(channel: EaBotChannel, senderId: string, patch: Partial<EaBotSession>) {
  const current = getEaSession(channel, senderId);
  const history = current ? [...current.history, `${current.flow}:${current.step}`] : [];
  return setEaSession(channel, senderId, { ...patch, history });
}

export function popEaSession(channel: EaBotChannel, senderId: string) {
  const current = getEaSession(channel, senderId);
  if (!current || !current.history.length) return null;
  const previous = current.history[current.history.length - 1];
  const [flow, step] = previous.split(':');
  return setEaSession(channel, senderId, { flow, step, history: current.history.slice(0, -1) });
}

export function clearEaSession(channel: EaBotChannel, senderId: string) {
  sessions.delete(key(channel, senderId));
}
