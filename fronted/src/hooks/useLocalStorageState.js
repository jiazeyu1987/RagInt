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
    const raw = localStorage.getItem(storageKey);
    if (raw == null) return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
    return deserialize(raw);
  });

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, serialize(value));
  }, [storageKey, value, serialize]);

  return [value, setValue];
}
