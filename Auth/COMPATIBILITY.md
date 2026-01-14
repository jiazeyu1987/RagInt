# 前后端兼容性对比

## 🔴 当前状态：不兼容

| 组件 | 旧版本 (Flask) | 新版本 (FastAPI) | 兼容性 |
|------|---------------|-----------------|--------|
| **后端框架** | Flask | FastAPI | ❌ 不同 |
| **认证库** | PyJWT + Casbin | AuthX | ❌ 不同 |
| **令牌类型** | 单一访问令牌 | 访问令牌 + 刷新令牌 | ❌ 不同 |
| **令牌有效期** | 24 小时 | 15 分钟 (访问) + 7 天 (刷新) | ❌ 不同 |
| **登录响应** | `{token, user}` | `{access_token, refresh_token, scopes}` | ❌ 不同 |
| **权限验证** | 前端调用 `/api/auth/verify` | 后端自动检查 scopes | ❌ 不同 |
| **API 端点路径** | `/api/*` | `/api/*` | ✅ 相同 |
| **HTTP 方法** | GET/POST/PUT/DELETE | GET/POST/PUT/DELETE | ✅ 相同 |
| **业务逻辑** | UserStore, KbStore, RagflowService | 相同的类 | ✅ 相同 |
| **数据库结构** | users, kb_documents, user_sessions, auth_audit | users, kb_documents | ⚠️ 部分相同 |

## 📋 详细差异对比

### 1. 登录流程

**旧后端**:
```bash
POST /api/auth/login
Body: {"username": "admin", "password": "admin123"}

Response:
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "user_id": "xxx",
    "username": "admin",
    "role": "admin",
    ...
  }
}
```

**新后端**:
```bash
POST /api/auth/login
Body: {"username": "admin", "password": "admin123"}

Response:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "scopes": ["users:*", "kb_documents:*", "ragflow_documents:*"]
}

# 需要额外调用获取用户信息
GET /api/auth/me
Headers: Authorization: Bearer <access_token>

Response:
{
  "user_id": "xxx",
  "username": "admin",
  "role": "admin",
  "scopes": [...],
  ...
}
```

### 2. 令牌刷新

**旧后端**: 不支持，需要重新登录

**新后端**:
```bash
POST /api/auth/refresh
Headers: Authorization: Bearer <refresh_token>

Response:
{
  "access_token": "新的访问令牌",
  "token_type": "bearer"
}
```

### 3. 权限检查

**旧后端**:
```javascript
// 前端需要调用验证
await authClient.verifyPermission('kb_documents', 'upload');
// → POST /api/auth/verify
// → Casbin 检查权限
```

**新后端**:
```javascript
// 后端自动检查，前端只需 UI 控制
authClient.can('operator', 'kb_documents', 'upload');

// 后端端点自动验证：
@router.post("/upload")
async def upload_document(
    payload: KbUploadRequired,  // 自动检查 scope
    ...
):
```

### 4. 令牌存储

**旧后端**:
```javascript
localStorage.setItem('authToken', token);
```

**新后端**:
```javascript
localStorage.setItem('accessToken', access_token);
localStorage.setItem('refreshToken', refresh_token);
```

## ✅ 如何使前端兼容

### 快速方案（5分钟）

```bash
cd fronted/src/api
mv authClient.js authClient.old.js
mv authClient.new.js authClient.js
```

### 手动方案（30分钟）

参考 `fronted/MIGRATION_GUIDE.md` 详细步骤。

## 🧪 测试兼容性

### 测试 1: 登录功能

```bash
# 旧后端
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'

# 新后端
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### 测试 2: 令牌刷新

```bash
# 旧后端 - 不支持
# 新后端
curl -X POST http://localhost:8001/api/auth/refresh \
  -H "Authorization: Bearer <refresh_token>"
```

### 测试 3: API 访问

```bash
# 旧后端
curl http://localhost:8000/api/users \
  -H "Authorization: Bearer <token>"

# 新后端
curl http://localhost:8001/api/users \
  -H "Authorization: Bearer <access_token>"
```

## 📊 迁移影响评估

| 影响范围 | 影响 | 工作量 |
|---------|------|--------|
| 登录/登出 | 需要修改 | 中 |
| API 调用 | 需要修改（自动刷新） | 中 |
| 权限检查 | 需要修改（简化） | 低 |
| 用户界面 | 无需修改 | 无 |
| 业务逻辑 | 无需修改 | 无 |
| 数据库 | 需要迁移 | 低 |

**总估工作量**: 2-4 小时

## 🎯 推荐迁移策略

### 选项 A: 直接切换（推荐）

1. 备份前端代码
2. 替换 `authClient.js`
3. 更新 `storageKeys.js`（已完成）
4. 测试所有功能
5. 部署

**优点**: 简单直接，获得所有新功能
**缺点**: 短时间内不可用

### 选项 B: 并行运行

1. 保留旧后端（端口 8000）
2. 新后端（端口 8001）
3. 前端通过环境变量切换
4. 逐步测试和迁移

**优点**: 风险低，可以逐步验证
**缺点**: 需要维护两套系统

### 选项 C: 功能开关

```javascript
// 在 authClient.js 中
const USE_NEW_BACKEND = true;

if (USE_NEW_BACKEND) {
  // 新后端逻辑
} else {
  // 旧后端逻辑
}
```

**优点**: 灵活，可以随时切换
**缺点**: 代码复杂度增加

## 🚨 注意事项

1. **数据库迁移**: 使用 `migrate_db.py` 迁移数据
2. **端口冲突**: 新旧后端使用不同端口（8000 vs 8001）
3. **令牌格式**: 刷新令牌是新增的，需要前端存储
4. **权限缓存**: 新后端不需要前端缓存权限
5. **自动刷新**: 401 响应时自动刷新令牌

## 📞 支持

- 后端文档: `new_backend/README.md`
- 前端迁移: `fronted/MIGRATION_GUIDE.md`
- API 文档: http://localhost:8001/docs (新后端)
