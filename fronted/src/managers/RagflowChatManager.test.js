import { EXHIBIT_CHAT_NAME, RagflowChatManager } from './RagflowChatManager';

describe('RagflowChatManager', () => {
  test('prefers exhibit chat over backend default', () => {
    const manager = new RagflowChatManager({ fetchJson: jest.fn() });
    const selected = manager.resolvePreferredChatName({
      chats: [{ name: '语音问答' }, { name: EXHIBIT_CHAT_NAME }],
      default: '语音问答',
    });
    expect(selected).toBe(EXHIBIT_CHAT_NAME);
  });

  test('uses backend default when exhibit chat is absent', () => {
    const manager = new RagflowChatManager({ fetchJson: jest.fn() });
    const selected = manager.resolvePreferredChatName({
      chats: [{ name: 'Chat A' }, { name: 'Chat B' }],
      default: 'Chat B',
    });
    expect(selected).toBe('Chat B');
  });

  test('keeps real empty chat and agent arrays as valid responses', async () => {
    const fetchJson = jest.fn().mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.resolve({ chats: [], default: '' });
      if (url === '/api/ragflow/agents') return Promise.resolve({ agents: [], default: null });
      return Promise.resolve({});
    });
    const manager = new RagflowChatManager({ fetchJson });

    await expect(manager.listChats()).resolves.toEqual({ chats: [], default: '' });
    await expect(manager.listAgents()).resolves.toEqual({ agents: [], default: null });
    expect(manager.getChatNames({ chats: [] })).toEqual([]);
    expect(manager.getAgents({ agents: [] })).toEqual([]);
  });

  test('rejects ok false chat and agent responses', async () => {
    const fetchJson = jest.fn().mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.resolve({ ok: false, error: 'ragflow_not_initialized' });
      if (url === '/api/ragflow/agents') return Promise.resolve({ ok: false, error: 'ragflow_api_key_invalid' });
      return Promise.resolve({});
    });
    const manager = new RagflowChatManager({ fetchJson });

    await expect(manager.listChats()).rejects.toThrow('ragflow_not_initialized');
    await expect(manager.listAgents()).rejects.toThrow('ragflow_api_key_invalid');
  });

  test('rejects chat and agent responses with non-array schema', async () => {
    const fetchJson = jest.fn().mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.resolve({ chats: null });
      if (url === '/api/ragflow/agents') return Promise.resolve({ agents: {} });
      return Promise.resolve({});
    });
    const manager = new RagflowChatManager({ fetchJson });

    await expect(manager.listChats()).rejects.toThrow('ragflow_chats_invalid_chats');
    await expect(manager.listAgents()).rejects.toThrow('ragflow_agents_invalid_agents');
    expect(() => manager.getChatNames({ chats: null })).toThrow('ragflow_chats_invalid_chats');
    expect(() => manager.getAgents({ agents: {} })).toThrow('ragflow_agents_invalid_agents');
  });

  test('posts new session and clear sessions with normalized chat name', async () => {
    const fetchJson = jest.fn().mockResolvedValue({ ok: true });
    const manager = new RagflowChatManager({ fetchJson });

    await manager.createNewSession(' 展厅聊天 ');
    await manager.clearSessions(' 展厅聊天 ');

    expect(fetchJson).toHaveBeenNthCalledWith(
      1,
      '/api/ragflow/chats/new_session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_name: '展厅聊天' }),
      })
    );
    expect(fetchJson).toHaveBeenNthCalledWith(
      2,
      '/api/ragflow/chats/clear_sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_name: '展厅聊天' }),
      })
    );
  });

  test('rejects missing chat names before posting session mutations', async () => {
    const fetchJson = jest.fn().mockResolvedValue({ ok: true });
    const manager = new RagflowChatManager({ fetchJson });

    await expect(manager.createNewSession('   ')).rejects.toThrow('chat_name_required');
    await expect(manager.clearSessions(null)).rejects.toThrow('chat_name_required');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  test('rejects failed session mutation responses instead of treating them as success', async () => {
    const fetchJson = jest.fn().mockImplementation((url) => {
      if (url === '/api/ragflow/chats/new_session') return Promise.resolve({ ok: false, error: 'ragflow_not_initialized' });
      if (url === '/api/ragflow/chats/clear_sessions') return Promise.resolve({ ok: false, error: 'chat_id_missing' });
      return Promise.resolve({ ok: true });
    });
    const manager = new RagflowChatManager({ fetchJson });

    await expect(manager.createNewSession('展厅聊天')).rejects.toThrow('ragflow_not_initialized');
    await expect(manager.clearSessions('展厅聊天')).rejects.toThrow('chat_id_missing');
  });
});
