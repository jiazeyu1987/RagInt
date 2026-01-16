import { authBackendUrl } from '../../config/backend';
import { httpClient } from '../../shared/http/httpClient';

export const reviewApi = {
  approve(docId, reviewNotes = null) {
    return httpClient.requestJson(authBackendUrl(`/api/knowledge/documents/${docId}/approve`), {
      method: 'POST',
      body: JSON.stringify({ review_notes: reviewNotes }),
    });
  },

  reject(docId, reviewNotes = null) {
    return httpClient.requestJson(authBackendUrl(`/api/knowledge/documents/${docId}/reject`), {
      method: 'POST',
      body: JSON.stringify({ review_notes: reviewNotes }),
    });
  },
};

