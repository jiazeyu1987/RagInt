import { fetchJson as defaultFetchJson } from '../api/backendClient';

export const EXHIBIT_CHAT_NAME = '展厅聊天';

function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

export class RagflowChatManager {
  constructor({ fetchJson = defaultFetchJson } = {}) {
    this._fetchJson = fetchJson;
  }

  async listChats() {
    return this._fetchJson('/api/ragflow/chats');
  }

  async listAgents() {
    return this._fetchJson('/api/ragflow/agents');
  }

  async createNewSession(chatName) {
    return this._fetchJson('/api/ragflow/chats/new_session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_name: safeTrim(chatName) }),
    });
  }

  async clearSessions(chatName) {
    return this._fetchJson('/api/ragflow/chats/clear_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_name: safeTrim(chatName) }),
    });
  }

  getChatNames(payload) {
    const chats = Array.isArray(payload && payload.chats) ? payload.chats : [];
    return chats.map((item) => safeTrim(item && item.name)).filter(Boolean);
  }

  resolvePreferredChatName(payload, preferredName = EXHIBIT_CHAT_NAME) {
    const names = this.getChatNames(payload);
    const preferred = safeTrim(preferredName);
    const defaultName = safeTrim(payload && payload.default);
    if (preferred && names.includes(preferred)) return preferred;
    if (defaultName && names.includes(defaultName)) return defaultName;
    return names.length ? names[0] : '';
  }

  resolveDefaultAgentId(payload) {
    const agents = Array.isArray(payload && payload.agents) ? payload.agents : [];
    const defaultId = safeTrim(payload && payload.default);
    if (defaultId && agents.some((item) => safeTrim(item && item.id) === defaultId)) return defaultId;
    return '';
  }
}

export const ragflowChatManager = new RagflowChatManager();
