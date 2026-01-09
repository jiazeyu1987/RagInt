import { useState } from 'react';

export function useClientId() {
  const [clientId] = useState(() => {
    try {
      const existing = localStorage.getItem('clientId');
      if (existing) return existing;
      const next =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem('clientId', next);
      return next;
    } catch (_) {
      return `cid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  });
  return clientId;
}

