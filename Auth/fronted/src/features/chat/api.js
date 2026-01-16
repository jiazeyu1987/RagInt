import { authBackendUrl } from '../../config/backend';
import { httpClient } from '../../shared/http/httpClient';

export const chatApi = {
  listMyChats() {
    return httpClient.requestJson(authBackendUrl('/api/chats/my'), { method: 'GET' });
  },

  listChatSessions(chatId) {
    return httpClient.requestJson(authBackendUrl(`/api/chats/${chatId}/sessions`), { method: 'GET' });
  },

  createChatSession(chatId, name = '新会话') {
    return httpClient.requestJson(authBackendUrl(`/api/chats/${chatId}/sessions`), {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  deleteChatSessions(chatId, ids) {
    return httpClient.requestJson(authBackendUrl(`/api/chats/${chatId}/sessions`), {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    });
  },
};

