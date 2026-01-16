import { STORAGE_KEYS } from '../../constants/storageKeys';

const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const tokenStore = {
  getAccessToken() {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  },

  setAccessToken(token) {
    if (token) localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
    else localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  },

  getRefreshToken() {
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  },

  setRefreshToken(token) {
    if (token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
    else localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  },

  getUser() {
    return safeJsonParse(localStorage.getItem(STORAGE_KEYS.USER) || 'null', null);
  },

  setUser(user) {
    if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEYS.USER);
  },

  setAuth(accessToken, refreshToken, user) {
    this.setAccessToken(accessToken);
    this.setRefreshToken(refreshToken);
    this.setUser(user);
  },

  clearAuth() {
    this.setAccessToken(null);
    this.setRefreshToken(null);
    this.setUser(null);
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  },
};

export default tokenStore;
