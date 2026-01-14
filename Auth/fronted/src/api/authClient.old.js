import { authBackendUrl } from '../config/backend';
import { STORAGE_KEYS } from '../constants/storageKeys';

class AuthClient {
  constructor() {
    this.baseURL = authBackendUrl('');
    this.token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    try {
      this.user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null');
    } catch {
      this.user = null;
    }

    if (!this.token) {
      this.user = null;
    }
  }

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }

  getAuthHeaders() {
    if (!this.token) {
      this.token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    }
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
    };
  }

  async login(username, password) {
    const response = await fetch(authBackendUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    this.setAuth(data.token, data.user);
    return data;
  }

  async logout() {
    try {
      await fetch(authBackendUrl('/api/auth/logout'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearAuth();
    }
  }

  async getCurrentUser() {
    const response = await fetch(authBackendUrl('/api/auth/me'), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    return response.json();
  }

  async verifyPermission(resource, action) {
    const response = await fetch(authBackendUrl('/api/auth/verify'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ resource, action }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to verify permission');
    }

    return response.json();
  }

  async listUsers(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await fetch(authBackendUrl(`/api/users?${queryParams}`), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list users');
    }

    return response.json();
  }

  async createUser(userData) {
    const response = await fetch(authBackendUrl('/api/users'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create user');
    }

    return response.json();
  }

  async updateUser(userId, userData) {
    const response = await fetch(authBackendUrl(`/api/users/${userId}`), {
      method: 'PATCH',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update user');
    }

    return response.json();
  }

  async deleteUser(userId) {
    const response = await fetch(authBackendUrl(`/api/users/${userId}`), {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete user');
    }

    return response.json();
  }

  async uploadDocument(file, kbId = '展厅') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kb_id', kbId);

    const response = await fetch(authBackendUrl('/api/knowledge/upload'), {
      method: 'POST',
      headers: {
        ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to upload document');
    }

    return response.json();
  }

  async listDocuments(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await fetch(authBackendUrl(`/api/knowledge/documents?${queryParams}`), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list documents');
    }

    return response.json();
  }

  async approveDocument(docId) {
    const response = await fetch(authBackendUrl(`/api/knowledge/documents/${docId}/approve`), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to approve document');
    }

    return response.json();
  }

  async rejectDocument(docId, notes = '') {
    const response = await fetch(authBackendUrl(`/api/knowledge/documents/${docId}/reject`), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ notes }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reject document');
    }

    return response.json();
  }

  async getStats() {
    const response = await fetch(authBackendUrl('/api/knowledge/stats'), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get stats');
    }

    return response.json();
  }

  async listRagflowDatasets() {
    const response = await fetch(authBackendUrl('/api/ragflow/datasets'), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list RAGFlow datasets');
    }

    return response.json();
  }

  async listRagflowDocuments(dataset = '展厅') {
    const params = new URLSearchParams({ dataset }).toString();
    const response = await fetch(authBackendUrl(`/api/ragflow/documents?${params}`), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list RAGFlow documents');
    }

    return response.json();
  }

  async getRagflowDocumentStatus(docId, dataset = '展厅') {
    const params = new URLSearchParams({ dataset }).toString();
    const response = await fetch(authBackendUrl(`/api/ragflow/documents/${docId}/status?${params}`), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get document status');
    }

    return response.json();
  }

  async getRagflowDocumentDetail(docId, dataset = '展厅') {
    const params = new URLSearchParams({ dataset }).toString();
    const response = await fetch(authBackendUrl(`/api/ragflow/documents/${docId}?${params}`), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get document detail');
    }

    return response.json();
  }

  async downloadRagflowDocument(docId, dataset = '展厅', docName = null) {
    const params = new URLSearchParams({ dataset });
    if (docName) {
      params.append('filename', docName);
    }

    const response = await fetch(authBackendUrl(`/api/ragflow/documents/${docId}/download?${params}`), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to download document');
    }

    let filename = docName || `document_${docId}`;

    const contentDisposition = response.headers.get('Content-Disposition');
    if (contentDisposition && !docName) {
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
  }

  async previewRagflowDocument(docId, dataset = '展厅', docName = null) {
    const params = new URLSearchParams({ dataset });
    if (docName) {
      params.append('filename', docName);
    }

    const response = await fetch(authBackendUrl(`/api/ragflow/documents/${docId}/download?${params}`), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch document for preview');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    return url;
  }

  async deleteRagflowDocument(docId, dataset = '展厅') {
    const params = new URLSearchParams({ dataset }).toString();
    const response = await fetch(authBackendUrl(`/api/ragflow/documents/${docId}?${params}`), {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete document');
    }

    return response.json();
  }

  async batchDownloadRagflowDocuments(selectedDocs) {
    console.log('Sending batch download request with documents:', selectedDocs);
    console.log('Sample document structure:', selectedDocs[0]);

    const response = await fetch(authBackendUrl('/api/ragflow/documents/batch/download'), {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        documents: selectedDocs
      }),
    });

    console.log('Response status:', response.status, response.statusText);

    if (!response.ok) {
      let errorInfo = { error: 'Failed to batch download documents' };
      try {
        errorInfo = await response.json();
        console.error('Batch download error:', errorInfo);
      } catch (e) {
        console.error('Could not parse error response');
      }
      throw new Error(errorInfo.error || errorInfo.message || 'Failed to batch download documents');
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

    console.log('Downloading file as:', filename);

    const blob = await response.blob();
    console.log('Blob size:', blob.size, 'bytes');

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    return { success: true, filename };
  }
}

const authClient = new AuthClient();
export default authClient;
