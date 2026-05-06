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

  test('keeps real empty chats and agents as successful bootstrap responses', async () => {
    fetchJson.mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.resolve({ chats: [], default: '' });
      if (url === '/api/ragflow/agents') return Promise.resolve({ agents: [], default: null });
      return Promise.resolve({});
    });

    const setChatOptions = jest.fn();
    const setSelectedChat = jest.fn();
    const setAgentOptions = jest.fn();
    const setSelectedAgentId = jest.fn();
    const onBootstrapSuccess = jest.fn();
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
        onBootstrapSuccess,
        onBootstrapError,
      }
    );

    await hook.flush();
    await hook.flush();

    expect(setChatOptions).toHaveBeenCalledWith([]);
    expect(setSelectedChat).not.toHaveBeenCalled();
    expect(setAgentOptions).toHaveBeenCalledWith([]);
    expect(setSelectedAgentId).toHaveBeenCalledWith('');
    expect(onBootstrapSuccess).toHaveBeenCalledWith(expect.objectContaining({ scope: 'chats' }));
    expect(onBootstrapSuccess).toHaveBeenCalledWith(expect.objectContaining({ scope: 'agents' }));
    expect(onBootstrapError).not.toHaveBeenCalled();
    hook.unmount();
  });

  test('reports fetch failures without replacing state with empty arrays', async () => {
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

    expect(setChatOptions).not.toHaveBeenCalled();
    expect(setAgentOptions).not.toHaveBeenCalled();
    expect(setSelectedChat).not.toHaveBeenCalled();
    expect(setSelectedAgentId).not.toHaveBeenCalled();
    expect(onBootstrapError).toHaveBeenCalledWith(expect.objectContaining({ scope: 'chats' }));
    expect(onBootstrapError).toHaveBeenCalledWith(expect.objectContaining({ scope: 'agents' }));
    hook.unmount();
  });

  test('reports ok false responses without applying empty chat or agent state', async () => {
    fetchJson.mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.resolve({ ok: false, error: 'ragflow_not_initialized' });
      if (url === '/api/ragflow/agents') return Promise.resolve({ ok: false, error: 'ragflow_api_key_invalid' });
      return Promise.resolve({});
    });

    const setChatOptions = jest.fn();
    const setAgentOptions = jest.fn();
    const onBootstrapSuccess = jest.fn();
    const onBootstrapError = jest.fn();

    const hook = renderHook(
      (p) => {
        useRagflowBootstrap(p);
        return null;
      },
      {
        setChatOptions,
        setAgentOptions,
        onBootstrapSuccess,
        onBootstrapError,
      }
    );

    await hook.flush();
    await hook.flush();

    expect(setChatOptions).not.toHaveBeenCalled();
    expect(setAgentOptions).not.toHaveBeenCalled();
    expect(onBootstrapSuccess).not.toHaveBeenCalled();
    expect(onBootstrapError).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'chats', error: expect.objectContaining({ message: 'ragflow_not_initialized' }) })
    );
    expect(onBootstrapError).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'agents', error: expect.objectContaining({ message: 'ragflow_api_key_invalid' }) })
    );
    hook.unmount();
  });

  test('reports invalid chat and agent schema without applying empty state', async () => {
    fetchJson.mockImplementation((url) => {
      if (url === '/api/ragflow/chats') return Promise.resolve({ chats: 'not-array' });
      if (url === '/api/ragflow/agents') return Promise.resolve({ agents: null });
      return Promise.resolve({});
    });

    const setChatOptions = jest.fn();
    const setAgentOptions = jest.fn();
    const onBootstrapSuccess = jest.fn();
    const onBootstrapError = jest.fn();

    const hook = renderHook(
      (p) => {
        useRagflowBootstrap(p);
        return null;
      },
      {
        setChatOptions,
        setAgentOptions,
        onBootstrapSuccess,
        onBootstrapError,
      }
    );

    await hook.flush();
    await hook.flush();

    expect(setChatOptions).not.toHaveBeenCalled();
    expect(setAgentOptions).not.toHaveBeenCalled();
    expect(onBootstrapSuccess).not.toHaveBeenCalled();
    expect(onBootstrapError).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'chats', error: expect.objectContaining({ message: 'ragflow_chats_invalid_chats' }) })
    );
    expect(onBootstrapError).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'agents', error: expect.objectContaining({ message: 'ragflow_agents_invalid_agents' }) })
    );
    hook.unmount();
  });
});

