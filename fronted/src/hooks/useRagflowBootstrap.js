import { useEffect, useRef } from 'react';
import { fetchJson } from '../api/backendClient';

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
        const data = await fetchJson('/api/ragflow/chats');
        if (cancelled) return;
        const chats = Array.isArray(data && data.chats) ? data.chats : [];
        const names = chats.map((c) => (c && c.name ? String(c.name) : '')).filter(Boolean);
        const nextSetters = settersRef.current || {};
        if (typeof nextSetters.setChatOptions === 'function') nextSetters.setChatOptions(names);
        const defName = (data && data.default ? String(data.default) : '').trim();
        if (defName && names.includes(defName)) {
          if (typeof nextSetters.setSelectedChat === 'function') nextSetters.setSelectedChat(defName);
        } else if (names.includes('展厅聊天')) {
          if (typeof nextSetters.setSelectedChat === 'function') nextSetters.setSelectedChat('展厅聊天');
        } else if (names.length) {
          if (typeof nextSetters.setSelectedChat === 'function') nextSetters.setSelectedChat(names[0]);
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
        const data = await fetchJson('/api/ragflow/agents');
        if (cancelled) return;
        const agents = Array.isArray(data && data.agents) ? data.agents : [];
        const nextSetters = settersRef.current || {};
        if (typeof nextSetters.setAgentOptions === 'function') nextSetters.setAgentOptions(agents);
        const defId = (data && data.default ? String(data.default) : '').trim();
        if (defId && agents.some((a) => String(a && a.id) === defId)) {
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
