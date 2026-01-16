import { authBackendUrl } from '../../config/backend';
import tokenStore from '../auth/tokenStore';

const isAbsoluteUrl = (url) => /^https?:\/\//i.test(url);

const buildUrl = (pathOrUrl) => (isAbsoluteUrl(pathOrUrl) ? pathOrUrl : authBackendUrl(pathOrUrl));

const parseMaybeJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

let refreshPromise = null;

const refreshAccessToken = async () => {
  if (refreshPromise) return refreshPromise;

  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    tokenStore.clearAuth();
    throw new Error('No refresh token available');
  }

  refreshPromise = (async () => {
    const response = await fetch(buildUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refreshToken}`,
      },
    });

    if (!response.ok) {
      tokenStore.clearAuth();
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    tokenStore.setAccessToken(data.access_token);
    return data.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const withAuthHeaders = (headers, includeContentType, body, skipAuth) => {
  const merged = { ...(headers || {}) };
  const hasAuth = Object.keys(merged).some((k) => k.toLowerCase() === 'authorization');
  if (!skipAuth && !hasAuth) {
    const accessToken = tokenStore.getAccessToken();
    if (accessToken) merged['Authorization'] = `Bearer ${accessToken}`;
  }

  if (includeContentType) {
    const hasContentType = Object.keys(merged).some((k) => k.toLowerCase() === 'content-type');
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (!hasContentType && !isForm) merged['Content-Type'] = 'application/json';
  }

  return merged;
};

const request = async (pathOrUrl, options = {}) => {
  const url = buildUrl(pathOrUrl);
  const includeContentType = options.includeContentType !== false;
  const headers = withAuthHeaders(options.headers, includeContentType, options.body, options.skipAuth);

  const response = await fetch(url, { ...options, headers });

  if (response.status !== 401) return response;

  if (options.skipRefresh) return response;
  if (url.endsWith('/api/auth/refresh')) return response;

  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return response;

  try {
    await refreshAccessToken();
  } catch {
    return response;
  }

  const retryHeaders = withAuthHeaders(options.headers, includeContentType, options.body, options.skipAuth);
  return fetch(url, { ...options, headers: retryHeaders });
};

const requestJson = async (pathOrUrl, options = {}) => {
  const response = await request(pathOrUrl, options);
  if (response.ok) return response.json();

  const data = await parseMaybeJson(response);
  const message = data?.detail || data?.message || data?.error || `Request failed (${response.status})`;
  const error = new Error(message);
  error.status = response.status;
  error.data = data;
  throw error;
};

export const httpClient = {
  request,
  requestJson,
  refreshAccessToken,
};
