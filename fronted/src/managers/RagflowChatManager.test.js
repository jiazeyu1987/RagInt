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
});

