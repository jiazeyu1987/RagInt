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
const APP_VERSION = '6';  // 强制清除所有缓存

export const AuthProvider = ({ children }) => {
  // 使用新的令牌名称
  const [user, setUser] = useState(null);  // 初始为null，等待checkAuth完成
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessibleKbs, setAccessibleKbs] = useState([]);  // 用户可访问的知识库列表

  const invalidateAuth = useCallback(() => {
    authClient.clearAuth();
    setUser(null);
    setAccessibleKbs([]);
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
          console.log(`[App Version Update] ${lastVersion} -> ${APP_VERSION}, clearing all caches`);
          localStorage.setItem(STORAGE_KEYS.APP_VERSION, APP_VERSION);

          // 清除所有认证相关的localStorage数据
          localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);

          // 清除Cache Storage
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
            if (authClient.refreshToken) {
              try {
                await authClient.refreshAccessToken();
                const currentUser = await authClient.getCurrentUser();
                setUser(currentUser);
              } catch (refreshErr) {
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
        invalidateAuth();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [invalidateAuth]);

  // 加载用户的知识库权限
  useEffect(() => {
    const fetchAccessibleKbs = async () => {
      if (user) {
        try {
          const data = await authClient.getMyKnowledgeBases();
          setAccessibleKbs(data.kb_ids || []);
        } catch (err) {
          console.error('Failed to fetch accessible KBs:', err);
          setAccessibleKbs([]);
        }
      } else {
        setAccessibleKbs([]);
      }
    };

    fetchAccessibleKbs();
  }, [user]);

  const login = async (username, password) => {
    try {
      setError(null);
      const data = await authClient.login(username, password);
      // 新后端的 login 方法已经在内部调用了 /me 并设置 user
      console.log('[Login] Logged in user:', data.user);
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
   * 使用后端返回的实际scopes，而不是硬编码的角色权限
   *
   * @param {string} resource - 资源名称 (如 'kb_documents')
   * @param {string} action - 操作名称 (如 'upload')
   * @returns {boolean} 是否有权限
   */
  const can = useCallback((resource, action) => {
    if (!user) return false;

    // 使用后端返回的实际scopes
    const permissions = user.scopes || [];

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

  /**
   * 检查用户是否有某个知识库的访问权限
   * @param {string} kbId - 知识库ID
   * @returns {boolean} 是否有权限
   */
  const canAccessKb = useCallback((kbId) => {
    if (!user) return false;
    if (user.role === 'admin') return true;  // 管理员自动拥有所有权限
    return accessibleKbs.includes(kbId);
  }, [user, accessibleKbs]);

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
    accessibleKbs,      // 用户可访问的知识库列表
    canAccessKb,        // 知识库权限检查方法
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
