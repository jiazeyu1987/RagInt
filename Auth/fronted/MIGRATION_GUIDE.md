# 前端迁移指南：从 Flask 后端到 FastAPI 后端

## 概述

新的 `new_backend/` (FastAPI + AuthX) 与现有前端**不直接兼容**。需要进行以下修改。

## 主要变更

### 1. 令牌机制

| 旧后端 | 新后端 |
|--------|--------|
| 单一令牌 (24h) | 访问令牌 (15min) + 刷新令牌 (7天) |
| `response.token` | `response.access_token` + `response.refresh_token` |
| 手动重新登录 | 自动刷新令牌 |

### 2. 登录响应格式

**旧格式**:
```json
{
  "token": "xxx",
  "user": {...}
}
```

**新格式**:
```json
{
  "access_token": "xxx",
  "refresh_token": "xxx",
  "token_type": "bearer",
  "scopes": ["users:*", "kb_documents:*"]
}
```

注意：新后端不直接返回 `user` 字段，需要额外调用 `/api/auth/me`

### 3. 权限检查

**旧方式**:
```javascript
// 调用后端验证
await authClient.verifyPermission('kb_documents', 'upload');
```

**新方式**:
```javascript
// 后端自动检查，前端只需简单的 role-based UI 控制
authClient.can('admin') || authClient.can('operator', 'kb_documents', 'upload');
```

## 迁移步骤

### 步骤 1: 更新 storageKeys.js

已完成 ✅ - 添加了 `ACCESS_TOKEN` 和 `REFRESH_TOKEN` keys

### 步骤 2: 替换 authClient.js

**选项 A: 直接替换**（推荐）

```bash
cd fronted/src/api
mv authClient.js authClient.old.js
mv authClient.new.js authClient.js
```

**选项 B: 手动合并**

1. 在 `authClient.js` 中添加以下方法：
   - `refreshAccessToken()` - 刷新令牌
   - `fetchWithAuth()` - 自动刷新的 fetch 封装

2. 修改 `login()` 方法：
   ```javascript
   async login(username, password) {
     const response = await fetch(...);
     const data = await response.json();

     // 获取用户信息
     const userResponse = await fetch('/api/auth/me', {
       headers: { 'Authorization': `Bearer ${data.access_token}` }
     });
     const user = await userResponse.json();

     // 存储两种令牌
     this.setAuth(data.access_token, data.refresh_token, user);
     return { ...data, user };
   }
   ```

3. 移除 `verifyPermission()` 方法（不再需要）

4. 将所有 API 调用改为使用 `fetchWithAuth()`

### 步骤 3: 更新 useAuth.js Hook

需要修改 `useAuth.js` 中的 `can` 方法：

```javascript
// 旧代码
const can = useCallback(async (resource, action) => {
  const response = await authClient.verifyPermission(resource, action);
  return response.ok;
}, [authClient]);

// 新代码（简化版）
const can = useCallback((role, resource, action) => {
  if (!user) return false;

  // 基于 role 的简单检查
  const rolePermissions = {
    admin: ['*'],
    reviewer: ['kb_documents:*', 'users:view'],
    operator: ['kb_documents:upload'],
    viewer: [],
    guest: [],
  };

  const permissions = rolePermissions[user.role] || [];
  if (permissions.includes('*')) return true;

  const requiredPermission = `${resource}:${action}`;
  return permissions.some(p =>
    p.endsWith(':*')
      ? requiredPermission.startsWith(p.split(':')[0])
      : p === requiredPermission
  );
}, [user]);
```

### 步骤 4: 更新 config/backend.js

如果后端端口从 8000 改为 8001：

```javascript
// 检查是否需要更新
const AUTH_BACKEND_URL = process.env.REACT_APP_AUTH_URL || 'http://localhost:8001';
```

### 步骤 5: 创建 .env 文件（可选）

```env
REACT_APP_AUTH_URL=http://localhost:8001
```

## 测试清单

迁移完成后，测试以下功能：

- [ ] 登录功能正常
- [ ] 15分钟后自动刷新令牌（无需重新登录）
- [ ] 用户管理 CRUD 操作
- [ ] 文档上传
- [ ] 文档审核（批准/驳回）
- [ ] RAGFlow 文档浏览
- [ ] 权限控制（不同角色看到不同功能）
- [ ] 登出功能

## 兼容性策略

如果需要同时支持旧后端和新后端：

```javascript
class AuthClient {
  constructor() {
    this.isNewBackend = process.env.REACT_APP_AUTH_URL.includes('8001');
    // ...
  }

  async login(username, password) {
    const response = await fetch(...);
    const data = await response.json();

    if (this.isNewBackend) {
      // 新后端逻辑
      const user = await this.getCurrentUser();
      this.setAuth(data.access_token, data.refresh_token, user);
    } else {
      // 旧后端逻辑
      this.setAuth(data.token, null, data.user);
    }
    return data;
  }
}
```

## 常见问题

### Q: 为什么要迁移？

**A**: 新后端提供：
- ✅ 更好的令牌管理（自动刷新）
- ✅ 现代化的框架（FastAPI）
- ✅ 简化的权限系统（Scopes）
- ✅ 自动 API 文档（Swagger UI）

### Q: 可以保留旧后端吗？

**A**: 可以，但会失去新功能。建议：
- 开发环境使用新后端
- 生产环境逐步迁移

### Q: 迁移需要多久？

**A**: 预计 2-4 小时：
- 更新 storageKeys.js: 5 分钟
- 替换 authClient.js: 30 分钟
- 更新 useAuth.js: 30 分钟
- 测试调试: 1-2 小时

### Q: 旧数据会丢失吗？

**A**: 不会！使用迁移脚本：
```bash
cd new_backend
python migrate_db.py --old-db ../backend/data/auth.db
```

## 回滚方案

如果迁移出现问题：

1. 恢复旧 authClient.js:
   ```bash
   cd fronted/src/api
   mv authClient.old.js authClient.js
   ```

2. 切换回旧后端（端口 8000）

3. 清除浏览器 localStorage:
   ```javascript
   localStorage.clear();
   ```

## 支持

如有问题，检查：
1. 浏览器控制台错误
2. Network 标签查看 API 请求
3. 新后端日志
4. Swagger UI 测试 API: http://localhost:8001/docs
