import { authBackendUrl } from '../../config/backend';
import { httpClient } from '../../shared/http/httpClient';

export const knowledgeApi = {
  listRagflowDatasets() {
    return httpClient.requestJson(authBackendUrl('/api/ragflow/datasets'), { method: 'GET' });
  },

  listLocalDocuments(params = {}) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `/api/knowledge/documents?${query}` : '/api/knowledge/documents';
    return httpClient.requestJson(authBackendUrl(path), { method: 'GET' });
  },

  uploadDocument(file, kbId = '展厅') {
    const formData = new FormData();
    formData.append('file', file);
    const url = authBackendUrl(`/api/knowledge/upload?kb_id=${encodeURIComponent(kbId)}`);
    return httpClient.requestJson(url, { method: 'POST', body: formData, includeContentType: false });
  },

  deleteLocalDocument(docId) {
    return httpClient.requestJson(authBackendUrl(`/api/knowledge/documents/${docId}`), { method: 'DELETE' });
  },

  async downloadLocalDocument(docId) {
    const response = await httpClient.request(authBackendUrl(`/api/knowledge/documents/${docId}/download`), { method: 'GET' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.detail || 'Failed to download document');
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `document_${docId}`;

    if (contentDisposition) {
      const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\s]+)/i);
      if (utf8Match && utf8Match[1]) {
        filename = decodeURIComponent(utf8Match[1]);
      } else {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return { success: true, filename };
  },

  async batchDownloadLocalDocuments(docIds) {
    const response = await httpClient.request(authBackendUrl('/api/knowledge/documents/batch/download'), {
      method: 'POST',
      body: JSON.stringify({ doc_ids: docIds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.detail || 'Failed to batch download documents');
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `documents_batch_${Date.now()}.zip`;

    if (contentDisposition) {
      const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\s]+)/i);
      if (utf8Match && utf8Match[1]) {
        filename = decodeURIComponent(utf8Match[1]);
      } else {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return { success: true, filename };
  },
};
