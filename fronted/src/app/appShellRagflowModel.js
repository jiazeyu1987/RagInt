import { TOUR_RAGFLOW_CHAT_NAME } from './appShellState';

export function getRagflowEventSource(info) {
  const payload = info && typeof info === 'object' ? info : {};
  return String((payload && (payload.source || payload.scope)) || '').trim();
}

export function buildRagflowConnectionStatus(ragflowConnection) {
  const unavailable = !!(ragflowConnection && ragflowConnection.connected === false);
  if (unavailable) {
    return { unavailable: true, label: '\u672a\u8fde\u63a5', tone: 'status-error' };
  }
  if (ragflowConnection && ragflowConnection.connected === true) {
    return { unavailable: false, label: '\u5df2\u8fde\u63a5', tone: 'status-ok' };
  }
  return { unavailable: false, label: '\u68c0\u6d4b\u4e2d', tone: '' };
}

export function shouldMarkRagflowAvailable(info) {
  const source = getRagflowEventSource(info);
  return !(source.startsWith('bootstrap_') && source !== 'bootstrap_chats');
}

export function buildRagflowUnavailableUpdate(info) {
  const payload = info && typeof info === 'object' ? info : { error: info };
  const source = getRagflowEventSource(payload);
  const rawErr = payload && Object.prototype.hasOwnProperty.call(payload, 'error') ? payload.error : info;
  const detail = String((rawErr && rawErr.message) || rawErr || '').trim();
  const queueStatus = source.startsWith('bootstrap')
    ? 'RAGFlow \u672a\u8fde\u63a5\uff0c\u521d\u59cb\u5316\u914d\u7f6e\u52a0\u8f7d\u5931\u8d25\u3002'
    : 'RAGFlow \u672a\u8fde\u63a5\uff0c\u5df2\u505c\u6b62\u5f53\u524d\u64cd\u4f5c\u3002';

  return {
    connection: {
      connected: false,
      message: detail ? `${queueStatus} ${detail}` : queueStatus,
    },
    queueStatus,
  };
}

export function resolveCurrentRagflowConversationName({
  ragflowUnavailable = false,
  useAgentMode = false,
  selectedChatRef = null,
  selectedChat = '',
} = {}) {
  if (ragflowUnavailable || useAgentMode) return '';
  return String((selectedChatRef && selectedChatRef.current) || selectedChat || '').trim();
}

export function resolveTourRagflowConversationName({ currentName = '', chatOptions = [] } = {}) {
  const names = Array.isArray(chatOptions) ? chatOptions.map((name) => String(name || '').trim()).filter(Boolean) : [];
  if (names.includes(TOUR_RAGFLOW_CHAT_NAME)) return TOUR_RAGFLOW_CHAT_NAME;
  if (currentName) return String(currentName || '').trim();
  return TOUR_RAGFLOW_CHAT_NAME;
}

export function buildRagflowConversationLabel({
  useAgentMode = false,
  isLoading = false,
  activeRagflowConversationName = '',
  currentRagflowConversationName = '',
  rawSelectedChatName = '',
} = {}) {
  if (useAgentMode) return 'Agent\u6a21\u5f0f';
  const pending = !!isLoading && !String(activeRagflowConversationName || '').trim();
  return String(
    activeRagflowConversationName
      || (pending ? '\u68c0\u6d4b\u4e2d' : '')
      || currentRagflowConversationName
      || rawSelectedChatName
      || '\u65e0'
  ).trim();
}
