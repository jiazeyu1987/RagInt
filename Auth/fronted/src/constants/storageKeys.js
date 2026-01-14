export const STORAGE_KEYS = Object.freeze({
  // 新后端 (FastAPI + AuthX) 使用的 keys
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',

  // 旧后端 (Flask + Casbin) 使用的 keys (保留向后兼容)
  AUTH_TOKEN: 'authToken',

  // 通用 keys
  USER: 'user',
  APP_VERSION: 'appVersion',
  LAST_ROLE_MAP: 'lastUserRoleMap',
});

