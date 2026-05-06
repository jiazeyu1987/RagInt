import { useCallback } from 'react';
import { ragflowChatManager } from '../managers/RagflowChatManager';

const EXHIBIT_CHAT_NAME = '展厅聊天';

export function useClearExhibitChatSessions({
  manager = ragflowChatManager,
  confirm = typeof window !== 'undefined' ? window.confirm.bind(window) : null,
  alert = typeof window !== 'undefined' ? window.alert.bind(window) : null,
} = {}) {
  const clearExhibitChatSessions = useCallback(async () => {
    const confirmed = confirm(`确认删除“${EXHIBIT_CHAT_NAME}”的所有 session 吗？`);
    if (!confirmed) return;
    try {
      const res = await manager.clearSessions(EXHIBIT_CHAT_NAME);
      const deleted = Number((res && res.deleted) || 0);
      alert(`${deleted} 个 session 已删除`);
    } catch (error) {
      alert(String((error && error.message) || error || 'clear_chat_sessions_failed'));
    }
  }, [alert, confirm, manager]);

  return { clearExhibitChatSessions };
}
