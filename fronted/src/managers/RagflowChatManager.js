import { fetchJson as defaultFetchJson } from '../api/backendClient';

export const EXHIBIT_CHAT_NAME = '展厅聊天';

function safeTrim(value) {
  return String(value == null ? '' : value).trim();
}

function requireObjectPayload(payload, scope) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`ragflow_${scope}_invalid_response`);
  }
  if (payload.ok === false) {
    const detail = safeTrim(payload.error || payload.detail || `ragflow_${scope}_failed`);
    throw new Error(detail);
  }
  return payload;
}

function requireArrayField(payload, field, scope) {
  const checked = requireObjectPayload(payload, scope);
  if (!Array.isArray(checked[field])) {
    throw new Error(`ragflow_${scope}_invalid_${field}`);
  }
  return checked[field];
}

function requireChatName(chatName) {
  const name = safeTrim(chatName);
  if (!name) throw new Error('chat_name_required');
  return name;
}

function requireSuccessPayload(payload, scope) {
  const checked = requireObjectPayload(payload, scope);
  if (checked.ok !== true) {
    throw new Error(`ragflow_${scope}_invalid_success`);
  }
  return checked;
}

export class RagflowChatManager {
  constructor({ fetchJson = defaultFetchJson } = {}) {
    this._fetchJson = fetchJson;
  }

  async listChats() {
    const payload = await this._fetchJson('/api/ragflow/chats');
    requireArrayField(payload, 'chats', 'chats');
    return payload;
  }

  async listAgents() {
    const payload = await this._fetchJson('/api/ragflow/agents');
    requireArrayField(payload, 'agents', 'agents');
    return payload;
  }

  async createNewSession(chatName) {
    const name = requireChatName(chatName);
    const payload = await this._fetchJson('/api/ragflow/chats/new_session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_name: name }),
    });
    return requireSuccessPayload(payload, 'new_session');
  }

  async clearSessions(chatName) {
    const name = requireChatName(chatName);
    const payload = await this._fetchJson('/api/ragflow/chats/clear_sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_name: name }),
    });
    return requireSuccessPayload(payload, 'clear_sessions');
  }

  getChatNames(payload) {
    const chats = requireArrayField(payload, 'chats', 'chats');
    return chats.map((item) => safeTrim(item && item.name)).filter(Boolean);
  }

  getAgents(payload) {
    return requireArrayField(payload, 'agents', 'agents');
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
    const agents = this.getAgents(payload);
    const defaultId = safeTrim(payload && payload.default);
    if (defaultId && agents.some((item) => safeTrim(item && item.id) === defaultId)) return defaultId;
    return '';
  }
}

export const ragflowChatManager = new RagflowChatManager();
