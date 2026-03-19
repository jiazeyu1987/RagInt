import { useEffect, useRef } from 'react';
import { ragflowChatManager } from '../managers/RagflowChatManager';

export function useRagflowBootstrap({
  setChatOptions,
  setSelectedChat,
  setAgentOptions,
  setSelectedAgentId,
  onBootstrapSuccess,
  onBootstrapError,
} = {}) {
  const settersRef = useRef({
    setChatOptions,
    setSelectedChat,
    setAgentOptions,
    setSelectedAgentId,
    onBootstrapSuccess,
    onBootstrapError,
  });

  useEffect(() => {
    settersRef.current = {
      setChatOptions,
      setSelectedChat,
      setAgentOptions,
      setSelectedAgentId,
      onBootstrapSuccess,
      onBootstrapError,
    };
  }, [onBootstrapError, onBootstrapSuccess, setAgentOptions, setChatOptions, setSelectedAgentId, setSelectedChat]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await ragflowChatManager.listChats();
        if (cancelled) return;
        const names = ragflowChatManager.getChatNames(data);
        const nextSetters = settersRef.current || {};
        if (typeof nextSetters.setChatOptions === 'function') nextSetters.setChatOptions(names);
        const preferredName = ragflowChatManager.resolvePreferredChatName(data);
        if (preferredName && typeof nextSetters.setSelectedChat === 'function') {
          nextSetters.setSelectedChat(preferredName);
        }
        if (typeof nextSetters.onBootstrapSuccess === 'function') {
          nextSetters.onBootstrapSuccess({ scope: 'chats', data });
        }
      } catch (error) {
        const nextSetters = settersRef.current || {};
        if (!cancelled && typeof nextSetters.setChatOptions === 'function') nextSetters.setChatOptions([]);
        if (!cancelled && typeof nextSetters.onBootstrapError === 'function') {
          nextSetters.onBootstrapError({ scope: 'chats', error });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await ragflowChatManager.listAgents();
        if (cancelled) return;
        const agents = Array.isArray(data && data.agents) ? data.agents : [];
        const nextSetters = settersRef.current || {};
        if (typeof nextSetters.setAgentOptions === 'function') nextSetters.setAgentOptions(agents);
        const defId = ragflowChatManager.resolveDefaultAgentId(data);
        if (defId) {
          if (typeof nextSetters.setSelectedAgentId === 'function') nextSetters.setSelectedAgentId(defId);
        } else if (typeof nextSetters.setSelectedAgentId === 'function') {
          nextSetters.setSelectedAgentId('');
        }
        if (typeof nextSetters.onBootstrapSuccess === 'function') {
          nextSetters.onBootstrapSuccess({ scope: 'agents', data });
        }
      } catch (error) {
        const nextSetters = settersRef.current || {};
        if (!cancelled && typeof nextSetters.setAgentOptions === 'function') nextSetters.setAgentOptions([]);
        if (!cancelled && typeof nextSetters.onBootstrapError === 'function') {
          nextSetters.onBootstrapError({ scope: 'agents', error });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}


