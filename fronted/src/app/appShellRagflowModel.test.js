import {
  buildRagflowConnectionStatus,
  buildRagflowConversationLabel,
  buildRagflowUnavailableUpdate,
  resolveCurrentRagflowConversationName,
  resolveTourRagflowConversationName,
  shouldMarkRagflowAvailable,
} from './appShellRagflowModel';

describe('appShellRagflowModel', () => {
  test('builds connection status labels', () => {
    expect(buildRagflowConnectionStatus({ connected: false })).toEqual({
      unavailable: true,
      label: '\u672a\u8fde\u63a5',
      tone: 'status-error',
    });
    expect(buildRagflowConnectionStatus({ connected: true })).toEqual({
      unavailable: false,
      label: '\u5df2\u8fde\u63a5',
      tone: 'status-ok',
    });
    expect(buildRagflowConnectionStatus({ connected: null })).toEqual({
      unavailable: false,
      label: '\u68c0\u6d4b\u4e2d',
      tone: '',
    });
  });

  test('decides when bootstrap success can mark RAGFlow available', () => {
    expect(shouldMarkRagflowAvailable({ source: 'bootstrap_chats' })).toBe(true);
    expect(shouldMarkRagflowAvailable({ scope: 'ask' })).toBe(true);
    expect(shouldMarkRagflowAvailable({ source: 'bootstrap_agents' })).toBe(false);
  });

  test('builds unavailable connection and queue status messages', () => {
    expect(buildRagflowUnavailableUpdate({ source: 'bootstrap_chats', error: new Error('bad token') })).toEqual({
      connection: {
        connected: false,
        message: 'RAGFlow \u672a\u8fde\u63a5\uff0c\u521d\u59cb\u5316\u914d\u7f6e\u52a0\u8f7d\u5931\u8d25\u3002 bad token',
      },
      queueStatus: 'RAGFlow \u672a\u8fde\u63a5\uff0c\u521d\u59cb\u5316\u914d\u7f6e\u52a0\u8f7d\u5931\u8d25\u3002',
    });
    expect(buildRagflowUnavailableUpdate({ source: 'tour_start', error: 'offline' })).toEqual({
      connection: {
        connected: false,
        message: 'RAGFlow \u672a\u8fde\u63a5\uff0c\u5df2\u505c\u6b62\u5f53\u524d\u64cd\u4f5c\u3002 offline',
      },
      queueStatus: 'RAGFlow \u672a\u8fde\u63a5\uff0c\u5df2\u505c\u6b62\u5f53\u524d\u64cd\u4f5c\u3002',
    });
  });

  test('resolves current and tour conversation names', () => {
    expect(
      resolveCurrentRagflowConversationName({
        ragflowUnavailable: false,
        useAgentMode: false,
        selectedChatRef: { current: ' ref-chat ' },
        selectedChat: 'selected-chat',
      })
    ).toBe('ref-chat');
    expect(resolveCurrentRagflowConversationName({ ragflowUnavailable: true, selectedChat: 'chat' })).toBe('');
    expect(resolveCurrentRagflowConversationName({ useAgentMode: true, selectedChat: 'chat' })).toBe('');
    expect(resolveTourRagflowConversationName({ currentName: 'chat-a', chatOptions: ['\u5c55\u5385\u804a\u5929'] })).toBe(
      '\u5c55\u5385\u804a\u5929'
    );
    expect(resolveTourRagflowConversationName({ currentName: 'chat-a', chatOptions: ['other'] })).toBe('chat-a');
  });

  test('builds conversation label by mode and loading state', () => {
    expect(buildRagflowConversationLabel({ useAgentMode: true })).toBe('Agent\u6a21\u5f0f');
    expect(
      buildRagflowConversationLabel({
        isLoading: true,
        activeRagflowConversationName: '',
        currentRagflowConversationName: '',
        rawSelectedChatName: '',
      })
    ).toBe('\u68c0\u6d4b\u4e2d');
    expect(buildRagflowConversationLabel({ currentRagflowConversationName: 'chat-x' })).toBe('chat-x');
    expect(buildRagflowConversationLabel({ rawSelectedChatName: 'raw-chat' })).toBe('raw-chat');
    expect(buildRagflowConversationLabel({})).toBe('\u65e0');
  });
});
