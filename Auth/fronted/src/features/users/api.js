import { authBackendUrl } from '../../config/backend';
import { httpClient } from '../../shared/http/httpClient';

export const usersApi = {
  list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `/api/users?${query}` : '/api/users';
    return httpClient.requestJson(authBackendUrl(path), { method: 'GET' });
  },

  create(payload) {
    return httpClient.requestJson(authBackendUrl('/api/users'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(userId, payload) {
    return httpClient.requestJson(authBackendUrl(`/api/users/${userId}`), {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  remove(userId) {
    return httpClient.requestJson(authBackendUrl(`/api/users/${userId}`), {
      method: 'DELETE',
    });
  },

  resetPassword(userId, newPassword) {
    return httpClient.requestJson(authBackendUrl(`/api/users/${userId}/password`), {
      method: 'PUT',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },
};

