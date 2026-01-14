import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import authClient from '../api/authClient';
import { STORAGE_KEYS } from '../constants/storageKeys';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 应用版本号，每次更新权限相关代码时递增
const APP_VERSION = '4';  // 更新版本以清除旧缓存

export const AuthProvider = ({ children }) => {
  // 使用新的令牌名称
  const [user, setUser] = useState(authClient.accessToken ? authClient.user : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const invalidateAuth = useCallback(() => {
    authClient.clearAuth();
    setUser(null);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 迁移/清理旧 key，避免跨账号角色缓存干扰
        localStorage.removeItem('lastUserRole');
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);  // 清除旧令牌

        // 检查应用版本
        const lastVersion = localStorage.getItem(STORAGE_KEYS.APP_VERSION);
        if (lastVersion !== APP_VERSION) {
          localStorage.setItem(STORAGE_KEYS.APP_VERSION, APP_VERSION);
          if ('caches' in window) {
            try {
              const names = await caches.keys();
              await Promise.all(names.map((name) => caches.delete(name)));
            } catch (e) {
              console.warn('Failed to clear Cache Storage:', e);
            }
          }
        }

        // 检查是否有新的访问令牌
        if (authClient.accessToken) {
          try {
            const currentUser = await authClient.getCurrentUser();
            // 更新用户信息
            authClient.setAuth(authClient.accessToken, authClient.refreshToken, currentUser);
            setUser(currentUser);
          } catch (err) {
            // 令牌可能已过期，尝试刷新
            console.warn('Auth check failed, trying to refresh...', err);
            if (authClient.refreshToken) {
              try {
                await authClient.refreshAccessToken();
                const currentUser = await authClient.getCurrentUser();
                setUser(currentUser);
              } catch (refreshErr) {
                console.error('Token refresh failed:', refreshErr);
                invalidateAuth();
              }
            } else {
              invalidateAuth();
            }
          }
        } else {
          if (authClient.user) {
            invalidateAuth();
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        invalidateAuth();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [invalidateAuth]);

  const login = async (username, password) => {
    try {
      setError(null);
      const data = await authClient.login(username, password);
      // 新后端的 login 方法已经在内部调用了 /me 并设置 user
      setUser(data.user);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    try {
      await authClient.logout();
      setUser(null);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const hasRole = (roles) => {
    if (!user) return false;
    if (Array.isArray(roles)) {
      return roles.includes(user.role);
    }
    return user.role === roles;
  };

  const isAdmin = () => user?.role === 'admin';
  const isReviewer = () => ['admin', 'reviewer'].includes(user?.role);
  const isOperator = () => ['admin', 'reviewer', 'operator'].includes(user?.role);

  /**
   * 简化的权限检查方法（同步）
   * 新后端自动检查 scopes，这里只用于前端 UI 控制
   *
   * @param {string} resource - 资源名称 (如 'kb_documents')
   * @param {string} action - 操作名称 (如 'upload')
   * @returns {boolean} 是否有权限
   */
  const can = useCallback((resource, action) => {
    if (!user) return false;

    // 基于角色的简单权限映射（用于 UI 显示控制）
    // 实际权限检查由后端自动完成
    const rolePermissions = {
      admin: ['*'],  // 所有权限
      reviewer: [
        'kb_documents:view',
        'kb_documents:review',
        'kb_documents:approve',
        'kb_documents:reject',
        'kb_documents:delete',
        'ragflow_documents:view',
        'ragflow_documents:delete',
        'users:view',
      ],
      operator: [
        'kb_documents:view',
        'kb_documents:upload',
        'ragflow_documents:view',
      ],
      viewer: [
        'ragflow_documents:view',
      ],
      guest: [
        'ragflow_documents:view',
      ],
    };

    const permissions = rolePermissions[user.role] || [];

    // 检查是否有通配符权限
    if (permissions.includes('*')) {
      return true;
    }

    // 检查具体权限
    const requiredPermission = `${resource}:${action}`;
    return permissions.some(p => {
      if (p.endsWith(':*')) {
        // 通配符匹配：'kb_documents:*' 匹配 'kb_documents:upload'
        const prefix = p.split(':')[0];
        return requiredPermission === `${prefix}:${action}` || requiredPermission.startsWith(`${prefix}:`);
      }
      return p === requiredPermission;
    });
  }, [user]);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    hasRole,
    isAdmin,
    isReviewer,
    isOperator,
    can,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
