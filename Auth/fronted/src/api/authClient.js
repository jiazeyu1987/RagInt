import { authBackendUrl } from '../config/backend';
import { STORAGE_KEYS } from '../constants/storageKeys';

/**
 * AuthClient - FastAPI + AuthX 适配版本
 *
 * 主要变更：
 * 1. 支持 access_token 和 refresh_token
 * 2. 自动刷新令牌机制
 * 3. 移除 verifyPermission（后端自动检查）
 * 4. 适配新的登录响应格式
 */
class AuthClient {
  constructor() {
    this.baseURL = authBackendUrl('');
    this.accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    this.refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    try {
      this.user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null');
    } catch {
      this.user = null;
    }

    if (!this.accessToken) {
      this.user = null;
    }
  }

  setAuth(accessToken, refreshToken, user) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.user = user;
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  clearAuth() {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }

  getAuthHeaders(includeContentType = true) {
    if (!this.accessToken) {
      this.accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    }
    const headers = {
      ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {})
    };
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  /**
   * 自动刷新访问令牌
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(authBackendUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.refreshToken}`
      },
    });

    if (!response.ok) {
      // 刷新失败，清除所有令牌并跳转登录
      this.clearAuth();
      window.location.href = '/login';
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
    return data.access_token;
  }

  /**
   * 带自动刷新的 fetch 封装
   */
  async fetchWithAuth(url, options = {}) {
    // 如果 options.headers 已经包含 Authorization，不需要添加
    const hasAuthHeader = options.headers && options.headers['Authorization'];
    const headers = hasAuthHeader
      ? options.headers
      : { ...options.headers, ...this.getAuthHeaders() };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 如果 401，尝试刷新令牌一次
    if (response.status === 401 && this.refreshToken) {
      try {
        await this.refreshAccessToken();
        // 重试原请求（保留原始 headers，只更新 Authorization）
        const retryHeaders = hasAuthHeader
          ? { ...options.headers, 'Authorization': `Bearer ${this.accessToken}` }
          : { ...options.headers, ...this.getAuthHeaders() };

        return fetch(url, {
          ...options,
          headers: retryHeaders,
        });
      } catch (refreshError) {
        // 刷新失败，已在 refreshAccessToken 中处理
        throw refreshError;
      }
    }

    return response;
  }

  /**
   * 登录
   * 新响应格式：{ access_token, refresh_token, token_type, scopes }
   */
  async login(username, password) {
    const response = await fetch(authBackendUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data = await response.json();

    // 获取用户信息（新后端不返回 user 字段）
    const userResponse = await fetch(authBackendUrl('/api/auth/me'), {
      headers: {
        'Authorization': `Bearer ${data.access_token}`
      }
    });

    const user = await userResponse.json();

    // 存储两种令牌
    this.setAuth(data.access_token, data.refresh_token, user);

    return {
      ...data,
      user  // 为了兼容旧代码
    };
  }

  /**
   * 登出
   */
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

  /**
   * 获取当前用户信息
   */
  async getCurrentUser() {
    const response = await this.fetchWithAuth(authBackendUrl('/api/auth/me'), {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to get current user');
    }

    return response.json();
  }

  /**
   * 权限检查（简化版）
   * 新后端不再需要调用 verify 端点
   * 这里仅用于前端 UI 显示控制
   */
  can(role, resource, action) {
    if (!this.user || !this.user.role) {
      return false;
    }

    // 简单的 role-based 检查（用于 UI 控制）
    // 实际权限检查由后端自动完成
    const rolePermissions = {
      admin: ['*'],
      reviewer: ['kb_documents:*', 'users:view'],
      operator: ['kb_documents:upload'],
      viewer: [],
      guest: [],
    };

    const permissions = rolePermissions[this.user.role] || [];

    // 检查是否有通配符权限
    if (permissions.includes('*')) {
      return true;
    }

    // 检查具体权限
    const requiredPermission = `${resource}:${action}`;
    return permissions.some(p => {
      if (p.endsWith(':*')) {
        return requiredPermission.startsWith(p.split(':')[0]);
      }
      return p === requiredPermission;
    });
  }

  /**
   * 以下方法使用 fetchWithAuth 自动处理令牌刷新
   */

  async listUsers(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users?${queryParams}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to list users');
    }

    return response.json();
  }

  async createUser(userData) {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/users'),
      {
        method: 'POST',
        body: JSON.stringify(userData),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create user');
    }

    return response.json();
  }

  async updateUser(userId, userData) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}`),
      {
        method: 'PUT',
        body: JSON.stringify(userData),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update user');
    }

    return response.json();
  }

  async deleteUser(userId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}`),
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error('Failed to delete user');
    }

    return response.json();
  }

  async resetPassword(userId, newPassword) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}/password`),
      {
        method: 'PUT',
        body: JSON.stringify({ new_password: newPassword }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to reset password');
    }

    return response.json();
  }

  async listDocuments(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/knowledge/documents?${queryParams}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to list documents');
    }

    return response.json();
  }

  async uploadDocument(file, kbId = '展厅') {
    console.log('[authClient] Step 6 - uploadDocument called');
    console.log('[authClient] Step 7 - Parameters:', {
      fileName: file.name,
      fileSize: file.size,
      kbId: kbId,
      kbIdType: typeof kbId,
      kbIdLength: kbId?.length
    });

    const formData = new FormData();
    formData.append('file', file);

    const url = authBackendUrl(`/api/knowledge/upload?kb_id=${encodeURIComponent(kbId)}`);
    console.log('[authClient] Step 8 - Sending request to:', url);

    const response = await this.fetchWithAuth(
      url,
      {
        method: 'POST',
        body: formData,
        headers: this.getAuthHeaders(false)
      }
    );

    console.log('[authClient] Step 9 - Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const error = await response.json();
      console.log('[authClient] Step 9a - Error response:', error);
      throw new Error(error.detail || 'Failed to upload document');
    }

    const result = await response.json();
    console.log('[authClient] Step 9b - Success response:', result);
    return result;
  }

  async getStats() {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/knowledge/stats'),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to get stats');
    }

    return response.json();
  }

  async approveDocument(docId, reviewNotes = null) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/knowledge/documents/${docId}/approve`),
      {
        method: 'POST',
        body: JSON.stringify({ review_notes: reviewNotes }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to approve document');
    }

    return response.json();
  }

  async rejectDocument(docId, reviewNotes = null) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/knowledge/documents/${docId}/reject`),
      {
        method: 'POST',
        body: JSON.stringify({ review_notes: reviewNotes }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to reject document');
    }

    return response.json();
  }

  async deleteDocument(docId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/knowledge/documents/${docId}`),
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error('Failed to delete document');
    }

    return response.json();
  }

  async downloadLocalDocument(docId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/knowledge/documents/${docId}/download`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to download document');
    }

    // Extract filename from Content-Disposition header
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

    // Trigger download
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

  async batchDownloadLocalDocuments(docIds) {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/knowledge/documents/batch/download'),
      {
        method: 'POST',
        body: JSON.stringify({ doc_ids: docIds }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to batch download documents');
    }

    // Extract filename from Content-Disposition header
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

    // Trigger download
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

  async listDeletions(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/knowledge/deletions?${queryParams}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to list deletions');
    }

    return response.json();
  }

  async listDownloads(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/ragflow/downloads?${queryParams}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to list downloads');
    }

    return response.json();
  }

  async listDatasets() {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/ragflow/datasets'),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to list datasets');
    }

    return response.json();
  }

  async listRagflowDocuments(datasetName = '展厅') {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/ragflow/documents?dataset_name=${encodeURIComponent(datasetName)}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to list documents');
    }

    return response.json();
  }

  async downloadDocument(docId, datasetName = '展厅') {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/ragflow/documents/${docId}/download?dataset_name=${encodeURIComponent(datasetName)}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to download document');
    }

    return response.blob();
  }

  async downloadRagflowDocument(docId, dataset = '展厅', docName = null) {
    const params = new URLSearchParams({ dataset });
    if (docName) {
      params.append('filename', docName);
    }

    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/ragflow/documents/${docId}/download?${params}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to download document');
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

  async previewDocument(docId, dataset = '展厅') {
    const params = new URLSearchParams({ dataset });

    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/ragflow/documents/${docId}/preview?${params}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to preview document');
    }

    return await response.json();
  }

  async previewRagflowDocument(docId, dataset = '展厅', docName = null) {
    const params = new URLSearchParams({ dataset });
    if (docName) {
      params.append('filename', docName);
    }

    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/ragflow/documents/${docId}/download?${params}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to preview document');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    return url;
  }

  async batchDownload(documentsInfo) {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/ragflow/documents/batch/download'),
      {
        method: 'POST',
        body: JSON.stringify({ documents_info: documentsInfo }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to batch download');
    }

    return response.blob();
  }

  async batchDownloadRagflowDocuments(selectedDocs) {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/ragflow/documents/batch/download'),
      {
        method: 'POST',
        body: JSON.stringify({ documents: selectedDocs }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to batch download documents');
    }

    // Extract filename from Content-Disposition header
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

    // Get blob and trigger download
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

  async deleteRagflowDocument(docId, datasetName = '展厅') {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/ragflow/documents/${docId}?dataset_name=${encodeURIComponent(datasetName)}`),
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error('Failed to delete document');
    }

    return response.json();
  }

  // Alias for backwards compatibility
  async listRagflowDatasets() {
    return this.listDatasets();
  }

  // ==================== 知识库权限相关 API ====================

  /**
   * 获取用户的知识库权限列表（管理员）
   */
  async getUserKnowledgeBases(userId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}/kbs`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get user KBs');
    }

    return response.json();  // { kb_ids: [...] }
  }

  /**
   * 授予用户知识库权限
   */
  async grantKnowledgeBaseAccess(userId, kbId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}/kbs/${encodeURIComponent(kbId)}`),
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to grant KB access');
    }

    return response.json();
  }

  /**
   * 撤销用户知识库权限
   */
  async revokeKnowledgeBaseAccess(userId, kbId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}/kbs/${encodeURIComponent(kbId)}`),
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to revoke KB access');
    }

    return response.json();
  }

  /**
   * 批量授权多个用户多个知识库
   */
  async batchGrantKnowledgeBases(userIds, kbIds) {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/users/batch-grant'),
      {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds, kb_ids: kbIds })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to batch grant');
    }

    return response.json();
  }

  /**
   * 获取当前用户可访问的知识库列表
   */
  async getMyKnowledgeBases() {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/me/kbs'),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get my KBs');
    }

    return response.json();  // { kb_ids: [...] }
  }

  // ==================== Chat 相关 API ====================

  /**
   * 获取用户有权限的聊天助手列表
   */
  async listMyChats() {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/chats/my'),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get my chats');
    }

    return response.json();  // { chat_ids: [...] }
  }

  /**
   * 获取聊天助手详情
   */
  async getChat(chatId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/chats/${chatId}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get chat');
    }

    return response.json();
  }

  /**
   * 创建聊天会话
   */
  async createChatSession(chatId, name = '新会话') {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/chats/${chatId}/sessions`),
      {
        method: 'POST',
        body: JSON.stringify({ name })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create session');
    }

    return response.json();
  }

  /**
   * 列出聊天助手的所有会话
   */
  async listChatSessions(chatId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/chats/${chatId}/sessions`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to list sessions');
    }

    return response.json();
  }

  /**
   * 删除聊天会话
   */
  async deleteChatSessions(chatId, sessionIds = null) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/chats/${chatId}/sessions`),
      {
        method: 'DELETE',
        body: JSON.stringify(sessionIds ? { ids: sessionIds } : {})
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete sessions');
    }

    return response.json();
  }

  // ==================== 聊天助手权限相关 API ====================

  /**
   * 获取用户的聊天助手权限列表（管理员）
   */
  async getUserChats(userId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}/chats`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get user chats');
    }

    return response.json();  // { chat_ids: [...] }
  }

  /**
   * 授予用户聊天助手权限
   */
  async grantChatAccess(userId, chatId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}/chats/${encodeURIComponent(chatId)}`),
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to grant chat access');
    }

    return response.json();
  }

  /**
   * 撤销用户聊天助手权限
   */
  async revokeChatAccess(userId, chatId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/users/${userId}/chats/${encodeURIComponent(chatId)}`),
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to revoke chat access');
    }

    return response.json();
  }

  /**
   * 批量授权多个用户多个聊天助手
   */
  async batchGrantChats(userIds, chatIds) {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/users/batch-grant-chats'),
      {
        method: 'POST',
        body: JSON.stringify({ user_ids: userIds, chat_ids: chatIds })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to batch grant chats');
    }

    return response.json();
  }

  /**
   * 获取当前用户可访问的聊天助手列表
   */
  async getMyChats() {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/me/chats'),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get my chats');
    }

    return response.json();  // { chat_ids: [...] }
  }

  // ==================== Agent/搜索体相关 API ====================

  /**
   * 列出所有搜索体
   */
  async listAgents(params = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/agents?${queryParams}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to list agents');
    }

    return response.json();  // { agents: [...], count: N }
  }

  /**
   * 获取单个搜索体详情
   */
  async getAgent(agentId) {
    const response = await this.fetchWithAuth(
      authBackendUrl(`/api/agents/${agentId}`),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get agent');
    }

    return response.json();
  }

  /**
   * 与搜索体对话（返回 EventSource 用于流式响应）
   */
  createAgentCompletionStream(agentId, question, sessionId = null) {
    const token = localStorage.getItem('access_token');
    if (!token) {
      throw new Error('No access token');
    }

    const url = new URL(authBackendUrl(`/api/agents/${agentId}/completions`));
    url.searchParams.append('question', question);
    if (sessionId) {
      url.searchParams.append('session_id', sessionId);
    }

    return new EventSource(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }

  // ==================== 知识库检索相关 API ====================

  /**
   * 在知识库中检索文本块
   * @param {Object} searchParams - 搜索参数
   * @param {string} searchParams.question - 查询问题或关键词
   * @param {string[]} searchParams.dataset_ids - 知识库ID列表（可选，默认使用所有可用知识库）
   * @param {number} searchParams.page - 页码，默认1
   * @param {number} searchParams.page_size - 每页数量，默认30
   * @param {number} searchParams.similarity_threshold - 相似度阈值（0-1），默认0.2
   * @param {number} searchParams.top_k - 向量计算参与的chunk数量，默认30
   * @param {boolean} searchParams.keyword - 是否启用关键词匹配，默认false
   * @param {boolean} searchParams.highlight - 是否高亮匹配词，默认false
   */
  async searchChunks(searchParams) {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/search'),
      {
        method: 'POST',
        body: JSON.stringify(searchParams)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to search chunks');
    }

    return response.json();  // { chunks: [...], total: N, page: N, page_size: N }
  }

  /**
   * 获取当前用户可用的知识库列表
   */
  async getAvailableDatasets() {
    const response = await this.fetchWithAuth(
      authBackendUrl('/api/datasets'),
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get datasets');
    }

    return response.json();  // { datasets: [...], count: N }
  }
}

export default new AuthClient();
