import React, { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const PermissionGuard = ({ children, allowedRoles, permission, permissions, fallback }) => {
  const { user, loading, hasRole, can } = useAuth();

  const requiredPermissions = useMemo(() => {
    if (Array.isArray(permissions) && permissions.length > 0) return permissions;
    if (permission) return [permission];
    return [];
  }, [permission, permissions]);

  // 同步检查权限（can 是同步函数）
  const permissionAllowed = useMemo(() => {
    if (!user || requiredPermissions.length === 0) {
      return true; // 没有权限要求时允许访问
    }

    return requiredPermissions.every((p) => can(p.resource, p.action));
  }, [user, requiredPermissions, can]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !hasRole(allowedRoles)) {
    return fallback !== undefined ? fallback : <Navigate to="/unauthorized" replace />;
  }

  if (requiredPermissions.length > 0 && !permissionAllowed) {
    return fallback !== undefined ? fallback : <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default PermissionGuard;
