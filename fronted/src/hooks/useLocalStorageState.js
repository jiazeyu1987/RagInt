import { useEffect, useState } from 'react';

export function useLocalStorageState(
  key,
  defaultValue,
  {
    serialize = (v) => String(v),
    deserialize = (raw) => raw,
  } = {}
) {
  const storageKey = String(key || '').trim();
  const [value, setValue] = useState(() => {
    if (!storageKey) return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw == null) return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
      return deserialize(raw);
    } catch (_) {
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
    }
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, serialize(value));
    } catch (_) {
      // ignore
    }
  }, [storageKey, value, serialize]);

  return [value, setValue];
}

