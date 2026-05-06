import { useEffect } from 'react';

export function useScrollChatToBottom({ messagesEndRef, lastQuestion, answer, isLoading, queueStatus } = {}) {
  useEffect(() => {
    if (!messagesEndRef.current) return;
    try {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    } catch (_) {
      // ignore
    }
  }, [messagesEndRef, lastQuestion, answer, isLoading, queueStatus]);
}
