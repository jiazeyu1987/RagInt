# FastAPI + AuthX Backend

这是使用 FastAPI 和 AuthX 重写的新后端系统，替代原有的 Flask + JWT + Casbin 架构。

## 主要变更

- **框架**: Flask → FastAPI
- **认证**: 自定义 JWT + Casbin → AuthX（访问令牌 + 刷新令牌）
- **权限**: Casbin RBAC → AuthX scopes（如 `kb_documents:upload`）
- **数据库**: 移除 `user_sessions` 和 `auth_audit` 表

## 目录结构

```
new_backend/
├── main.py                     # FastAPI 应用入口
├── config.py                   # 配置管理
├── dependencies.py             # 依赖注入
├── requirements.txt            # Python 依赖
│
├── api/                        # API 路由
│   ├── auth.py                 # 认证端点
│   ├── users.py                # 用户管理
│   ├── knowledge.py            # 知识库
│   ├── review.py               # 文档审核
│   └── ragflow.py              # RAGFlow 集成
│
├── core/                       # 核心功能
│   ├── security.py             # AuthX 配置
│   ├── scopes.py               # 角色→scopes 映射
│   └── permissions.py          # 权限依赖
│
├── models/                     # Pydantic 模型
│   ├── auth.py                 # 认证模型
│   ├── user.py                 # 用户模型
│   └── document.py             # 文档模型
│
├── services/                   # 业务逻辑
│   ├── user_store.py           # 用户存储
│   ├── kb_store.py             # 知识库存储
│   └── ragflow_service.py      # RAGFlow 服务
│
├── database/
│   └── init_db.py              # 数据库初始化
│
├── migrate_db.py               # 数据库迁移脚本
└── data/                       # 运行时数据
    ├── auth.db                 # SQLite 数据库
    └── uploads/                # 上传文件
```

## 快速开始

### 1. 安装依赖

```bash
cd new_backend
pip install -r requirements.txt
```

**重要**: 如果遇到 `Exit code 49` 错误，说明你安装的是 Windows Store Python stub。请从 [python.org](https://www.python.org/downloads/) 下载并安装完整的 Python。

### 2. 初始化数据库

```bash
cd new_backend/database
python init_db.py
```

这将创建 `data/auth.db` 数据库和默认管理员账户：
- 用户名: `admin`
- 密码: `admin123`

### 3. 启动服务

```bash
cd new_backend
python -m app
```

或者使用 uvicorn：

```bash
cd new_backend
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

服务将在 `http://localhost:8001` 启动。

### 4. 访问 API 文档

- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## API 端点

### 认证 (`/api/auth`)

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新访问令牌
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息

### 用户管理 (`/api/users`)

- `GET /api/users` - 列出用户 (需要 `users:view`)
- `POST /api/users` - 创建用户 (需要 `users:manage`)
- `GET /api/users/{user_id}` - 获取用户 (需要 `users:view`)
- `PUT /api/users/{user_id}` - 更新用户 (需要 `users:manage`)
- `DELETE /api/users/{user_id}` - 删除用户 (需要 `users:manage`)
- `PUT /api/users/{user_id}/password` - 重置密码 (需要 `users:manage`)

### 知识库 (`/api/knowledge`)

- `POST /api/knowledge/upload` - 上传文档 (需要 `kb_documents:upload`)
- `GET /api/knowledge/documents` - 列出文档 (需要 `kb_documents:view`)
- `GET /api/knowledge/stats` - 获取统计信息 (需要 `kb_documents:view`)
- `DELETE /api/knowledge/documents/{doc_id}` - 删除文档 (需要 `kb_documents:delete`)

### 文档审核 (`/api/knowledge`)

- `POST /api/knowledge/documents/{doc_id}/approve` - 批准文档 (需要 `kb_documents:approve`)
- `POST /api/knowledge/documents/{doc_id}/reject` - 驳回文档 (需要 `kb_documents:reject`)

### RAGFlow 集成 (`/api/ragflow`)

- `GET /api/ragflow/datasets` - 列出数据集 (需要 `ragflow_documents:view`)
- `GET /api/ragflow/documents` - 列出文档 (需要 `ragflow_documents:view`)
- `GET /api/ragflow/documents/{doc_id}/status` - 获取文档状态 (需要 `ragflow_documents:view`)
- `GET /api/ragflow/documents/{doc_id}` - 获取文档详情 (需要 `ragflow_documents:view`)
- `GET /api/ragflow/documents/{doc_id}/download` - 下载文档 (需要 `ragflow_documents:view`)
- `DELETE /api/ragflow/documents/{doc_id}` - 删除文档 (需要 `ragflow_documents:delete`)
- `POST /api/ragflow/documents/batch/download` - 批量下载 (需要 `ragflow_documents:view`)

## 权限系统

### 角色和 Scopes

| 角色 | Scopes |
|------|--------|
| **admin** | `users:*`, `kb_documents:*`, `ragflow_documents:*` |
| **reviewer** | `kb_documents:view`, `kb_documents:review`, `kb_documents:approve`, `kb_documents:reject`, `kb_documents:delete`, `ragflow_documents:view`, `ragflow_documents:delete`, `users:view` |
| **operator** | `kb_documents:view`, `kb_documents:upload`, `ragflow_documents:view` |
| **viewer** | `ragflow_documents:view` |
| **guest** | `ragflow_documents:view` |

### Scope 格式

- `resource:action` - 例如 `kb_documents:upload`
- `resource:*` - 通配符，表示所有操作 - 例如 `users:*`

## 令牌机制

### 访问令牌 (Access Token)

- 有效期：15 分钟
- 用于 API 认证
- 通过 `Authorization: Bearer <token>` header 传递

### 刷新令牌 (Refresh Token)

- 有效期：7 天
- 用于获取新的访问令牌
- 当访问令牌过期时，使用刷新令牌调用 `/api/auth/refresh`

### 登录响应示例

```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "scopes": ["users:*", "kb_documents:*", "ragflow_documents:*"]
}
```

## 数据库迁移

如果你有旧数据库（使用 Flask + Casbin），可以使用迁移脚本：

```bash
cd new_backend
python migrate_db.py --old-db ../backend/data/auth.db
```

这将：
1. 备份旧数据库到 `auth.db.backup`
2. 创建新 schema（移除 `user_sessions` 和 `auth_audit`）
3. 迁移用户和文档数据

**注意**: `user_sessions` 和 `auth_audit` 表中的数据不会被迁移，因为新系统不再需要它们。

## 配置

### 环境变量 (可选)

创建 `.env` 文件：

```env
JWT_SECRET_KEY=your-secret-key-here
DATABASE_PATH=data/auth.db
UPLOAD_DIR=data/uploads
MAX_FILE_SIZE=16777216
CORS_ORIGINS=["http://localhost:3001"]
```

### RAGFlow 配置

RAGFlow 配置从 `../../ragflow_demo/ragflow_config.json` 读取。

确保配置文件包含：

```json
{
  "api_key": "your-ragflow-api-key",
  "base_url": "http://localhost:9380"
}
```

## 健康检查

- `GET /health` - 健康检查端点
- `GET /` - 服务信息端点

## 开发

### 启用调试模式

编辑 `config.py`：

```python
DEBUG = True
```

然后使用 `--reload` 启动：

```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 查看日志

日志输出到控制台，包括：
- 依赖初始化
- RAGFlow 连接状态
- API 请求和错误

## 故障排查

### Python Exit code 49

**问题**: Windows Store Python stub

**解决方案**: 从 [python.org](https://www.python.org/downloads/) 下载并安装完整的 Python。

### CORS 错误

**问题**: 前端无法访问 API

**解决方案**: 检查 `config.py` 中的 `CORS_ORIGINS` 配置。

### RAGFlow 连接失败

**问题**: 无法连接到 RAGFlow

**解决方案**:
1. 确保 `ragflow_config.json` 配置正确
2. 检查 RAGFlow 服务是否运行
3. 验证 API key 是否有效

### 导入错误

**问题**: `ModuleNotFoundError: No module named 'authx'`

**解决方案**:
```bash
pip install -r requirements.txt
```

## 测试

### 使用 curl 测试登录

```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### 使用访问令牌测试 API

```bash
curl http://localhost:8001/api/users \
  -H "Authorization: Bearer <your-access-token>"
```

### 刷新令牌

```bash
curl -X POST http://localhost:8001/api/auth/refresh \
  -H "Authorization: Bearer <your-refresh-token>"
```

## 与旧版本的主要差异

1. **无会话表**: 令牌是无状态的，不需要存储
2. **刷新令牌**: 用户无需频繁登录
3. **简化的权限**: 使用 scopes 而非 Casbin 策略文件
4. **自动 API 文档**: FastAPI 自动生成 OpenAPI 文档
5. **类型提示**: 使用 Pydantic 模型进行请求/响应验证

## 生产部署

1. **更改 JWT 密钥**:
   ```python
   # config.py
   JWT_SECRET_KEY = "your-production-secret-key"
   ```

2. **配置 CORS**:
   ```python
   CORS_ORIGINS = ["https://your-frontend-domain.com"]
   ```

3. **使用生产级 WSGI 服务器**:
   ```bash
   gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
   ```

4. **启用 HTTPS**: 使用 Nginx 或 Caddy 作为反向代理

## 许可证

与主项目相同
