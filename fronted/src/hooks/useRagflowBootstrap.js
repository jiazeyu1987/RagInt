import { useEffect } from 'react';
import { fetchJson } from '../api/backendClient';

export function useRagflowBootstrap({
  setChatOptions,
  setSelectedChat,
  setAgentOptions,
  setSelectedAgentId,
} = {}) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson('/api/ragflow/chats');
        if (cancelled) return;
        const chats = Array.isArray(data && data.chats) ? data.chats : [];
        const names = chats.map((c) => (c && c.name ? String(c.name) : '')).filter(Boolean);
        if (typeof setChatOptions === 'function') setChatOptions(names);
        const defName = (data && data.default ? String(data.default) : '').trim();
        if (defName && names.includes(defName)) {
          if (typeof setSelectedChat === 'function') setSelectedChat(defName);
        } else if (names.includes('展厅聊天')) {
          if (typeof setSelectedChat === 'function') setSelectedChat('展厅聊天');
        } else if (names.length) {
          if (typeof setSelectedChat === 'function') {
            setSelectedChat(names[0]);
          }
        }
      } catch (_) {
        if (!cancelled && typeof setChatOptions === 'function') setChatOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setChatOptions, setSelectedChat]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson('/api/ragflow/agents');
        if (cancelled) return;
        const agents = Array.isArray(data && data.agents) ? data.agents : [];
        if (typeof setAgentOptions === 'function') setAgentOptions(agents);
        const defId = (data && data.default ? String(data.default) : '').trim();
        if (defId && agents.some((a) => String(a && a.id) === defId)) {
          if (typeof setSelectedAgentId === 'function') setSelectedAgentId(defId);
        } else {
          if (typeof setSelectedAgentId === 'function') setSelectedAgentId('');
        }
      } catch (_) {
        if (!cancelled && typeof setAgentOptions === 'function') setAgentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAgentOptions, setSelectedAgentId]);
}
