import { authBackendUrl } from '../../config/backend';
import { httpClient } from '../../shared/http/httpClient';

export const agentsApi = {
  getAvailableDatasets() {
    return httpClient.requestJson(authBackendUrl('/api/datasets'), { method: 'GET' });
  },

  searchChunks(payload) {
    return httpClient.requestJson(authBackendUrl('/api/search'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

