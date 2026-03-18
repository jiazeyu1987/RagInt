import { renderHook } from '../testUtils/renderHook';
import { useRagflowBootstrap } from './useRagflowBootstrap';
import { fetchJson } from '../api/backendClient';

jest.mock('../api/backendClient', () => ({
  fetchJson: jest.fn(),
}));

describe('useRagflowBootstrap', () => {
  beforeEach(() => {
    fetchJson.mockReset();
  });

  test('loads chats and agents and applies defaults', async () => {
    fetchJson.mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.resolve({ chats: [{ name: 'Chat A' }, { name: 'Chat B' }], default: 'Chat B' });
      if (url === '/api/ragflow/agents') return Promise.resolve({ agents: [{ id: 'a1', name: 'Agent 1' }], default: 'a1' });
      return Promise.resolve({});
    });

    const setChatOptions = jest.fn();
    const setSelectedChat = jest.fn();
    const setAgentOptions = jest.fn();
    const setSelectedAgentId = jest.fn();

    const hook = renderHook((p) => {
      useRagflowBootstrap(p);
      return null;
    }, {
      setChatOptions,
      setSelectedChat,
      setAgentOptions,
      setSelectedAgentId,
    });

    await hook.flush();
    await hook.flush();

    expect(fetchJson).toHaveBeenCalledWith('/api/ragflow/chats');
    expect(fetchJson).toHaveBeenCalledWith('/api/ragflow/agents');
    expect(setChatOptions).toHaveBeenCalledWith(['Chat A', 'Chat B']);
    expect(setSelectedChat).toHaveBeenCalledWith('Chat B');
    expect(setAgentOptions).toHaveBeenCalledWith([{ id: 'a1', name: 'Agent 1' }]);
    expect(setSelectedAgentId).toHaveBeenCalledWith('a1');

    hook.unmount();
  });

  test('reports bootstrap errors via callback instead of silent fallback only', async () => {
    fetchJson.mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.reject(new Error('HTTP 500 /api/ragflow/chats'));
      if (url === '/api/ragflow/agents') return Promise.reject(new Error('HTTP 500 /api/ragflow/agents'));
      return Promise.resolve({});
    });

    const setChatOptions = jest.fn();
    const setSelectedChat = jest.fn();
    const setAgentOptions = jest.fn();
    const setSelectedAgentId = jest.fn();
    const onBootstrapError = jest.fn();

    const hook = renderHook(
      (p) => {
        useRagflowBootstrap(p);
        return null;
      },
      {
        setChatOptions,
        setSelectedChat,
        setAgentOptions,
        setSelectedAgentId,
        onBootstrapError,
      }
    );

    await hook.flush();
    await hook.flush();

    expect(setChatOptions).toHaveBeenCalledWith([]);
    expect(setAgentOptions).toHaveBeenCalledWith([]);
    expect(onBootstrapError).toHaveBeenCalledWith(expect.objectContaining({ scope: 'chats' }));
    expect(onBootstrapError).toHaveBeenCalledWith(expect.objectContaining({ scope: 'agents' }));
    hook.unmount();
  });
});

