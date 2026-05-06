import { renderHook } from '../testUtils/renderHook';
import { useRagflowConversationSelection } from './useRagflowConversationSelection';

describe('useRagflowConversationSelection', () => {
  test('builds the current label and prepares the tour conversation', () => {
    const selectedChatRef = { current: '普通聊天' };
    const setSelectedChat = jest.fn((name) => {
      selectedChatRef.current = name;
    });
    const hook = renderHook((props) => useRagflowConversationSelection(props), {
      ragflowUnavailable: false,
      useAgentMode: false,
      selectedChatRef,
      selectedChat: '普通聊天',
      chatOptions: ['展厅聊天', '其他'],
      setSelectedChat,
      isLoading: false,
      activeRagflowConversationName: '',
      setActiveRagflowConversationName: jest.fn(),
    });

    expect(hook.result().currentRagflowConversationName).toBe('普通聊天');
    expect(hook.result().ragflowConversationLabel).toBe('普通聊天');
    expect(hook.result().prepareTourRagflowConversation()).toBe('展厅聊天');
    expect(selectedChatRef.current).toBe('展厅聊天');
    expect(setSelectedChat).toHaveBeenCalledWith('展厅聊天');
  });

  test('clears active conversation while unavailable or in agent mode', () => {
    const setActiveRagflowConversationName = jest.fn();

    renderHook((props) => useRagflowConversationSelection(props), {
      ragflowUnavailable: true,
      useAgentMode: false,
      selectedChatRef: { current: '普通聊天' },
      selectedChat: '普通聊天',
      chatOptions: [],
      setSelectedChat: jest.fn(),
      isLoading: false,
      activeRagflowConversationName: '旧会话',
      setActiveRagflowConversationName,
    });

    expect(setActiveRagflowConversationName).toHaveBeenCalledWith('');
  });

  test('labels agent mode and loading states', () => {
    const agentHook = renderHook((props) => useRagflowConversationSelection(props), {
      ragflowUnavailable: false,
      useAgentMode: true,
      selectedChatRef: { current: '普通聊天' },
      selectedChat: '普通聊天',
      chatOptions: [],
      setSelectedChat: jest.fn(),
      isLoading: false,
      activeRagflowConversationName: '',
      setActiveRagflowConversationName: jest.fn(),
    });
    expect(agentHook.result().ragflowConversationLabel).toBe('Agent模式');

    const loadingHook = renderHook((props) => useRagflowConversationSelection(props), {
      ragflowUnavailable: false,
      useAgentMode: false,
      selectedChatRef: { current: '' },
      selectedChat: '',
      chatOptions: [],
      setSelectedChat: jest.fn(),
      isLoading: true,
      activeRagflowConversationName: '',
      setActiveRagflowConversationName: jest.fn(),
    });
    expect(loadingHook.result().ragflowConversationLabel).toBe('检测中');
  });
});
