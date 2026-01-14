# RagInt Auth Permission System

独立的权限管理系统，用于管理知识库文档的上传和审核。

## 架构概述

```
Auth/
├── backend/          # Flask后端 (端口: 8001)
│   ├── api/         # API endpoints
│   ├── services/    # Business logic
│   ├── infra/       # Infrastructure (JWT, Casbin)
│   ├── data/        # SQLite database + uploads
│   └── config/      # Configuration files
│
└── fronted/         # React前端 (端口: 3001)
    └── src/
        ├── pages/      # Page components
        ├── components/ # Reusable components
        ├── hooks/      # React hooks
        └── api/        # API client
```

## 快速开始

### 1. 安装依赖

**Backend:**
```bash
cd Auth/backend
pip install -r requirements.txt
```

**Frontend:**
```bash
cd Auth/fronted
npm install
```

### 2. 初始化数据库

```bash
cd Auth/backend
python -m scripts.init_db
```

或者使用根目录的初始化脚本：
```bash
python init_auth_db.py
```

**默认管理员账号:**
- 用户名: `admin`
- 密码: `admin123`

### 3. 启动服务

**启动Backend (端口 8001):**
```bash
cd Auth/backend
python -m app
```

**启动Frontend (端口 3001):**
```bash
cd Auth/fronted
npm start
```

### 4. 访问应用

打开浏览器访问: http://localhost:3001

## 用户角色

| 角色 | 权限 |
|-----|------|
| **admin** (管理员) | 所有权限 |
| **reviewer** (审核员) | 查看文档、审核文档（通过/驳回） |
| **operator** (操作员) | 查看文档、上传文档 |
| **viewer** (查看者) | 仅查看文档 |
| **guest** (访客) | 仅查看文档 |

## 功能特性

### Backend API (端口 8001)

**认证:**
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息

**用户管理:**
- `GET /api/users` - 列出用户
- `POST /api/users` - 创建用户
- `PUT /api/users/{id}` - 更新用户
- `DELETE /api/users/{id}` - 删除用户

**知识库管理:**
- `POST /api/knowledge/upload` - 上传文档
- `GET /api/knowledge/documents` - 列出文档
- `GET /api/knowledge/stats` - 获取统计信息

**文档审核:**
- `POST /api/knowledge/documents/{id}/approve` - 审核通过
- `POST /api/knowledge/documents/{id}/reject` - 驳回文档

### Frontend (端口 3001)

- 登录页面
- 仪表盘 (Dashboard)
- 用户管理 (UserManagement)
- 文档上传 (KnowledgeUpload)
- 文档审核 (DocumentReview)

## 数据库结构

**SQLite数据库:** `Auth/backend/data/auth.db`

**表:**
- `users` - 用户信息
- `user_sessions` - 会话管理 (JWT黑名单)
- `kb_documents` - 知识库文档
- `auth_audit` - 审计日志

## 配置文件

**Casbin模型:** `Auth/backend/config/casbin_model.conf`
**Casbin策略:** `Auth/backend/data/casbin_policy.csv`
**RAGFlow配置:** 复用原系统的 `ragflow_demo/ragflow_config.json`

## 安全特性

- 密码SHA-256哈希存储
- JWT令牌（24小时过期）
- 令牌黑名单机制（支持登出）
- Casbin权限控制
- 文件类型白名单验证
- 文件大小限制（16MB）

## 部署说明

### 环境变量

**Frontend (.env):**
```
REACT_APP_AUTH_URL=http://localhost:8001
```

### 端口分配

| 服务 | 端口 |
|-----|------|
| Auth Backend | 8001 |
| Auth Frontend | 3001 |
| RagInt Backend | 8000 |
| RagInt Frontend | 3000 |

## 开发计划

- [x] Week 1: Auth Backend (数据库、用户管理、认证)
- [x] Week 2: Knowledge Management (上传、审核API)
- [x] Week 3: Auth Frontend (所有页面)

## 故障排查

**问题:** Python exit code 49
**解决:** 安装完整的Python（不是Windows Store stub）

**问题:** CORS错误
**解决:** 检查 `Flask-CORS` 配置和前端 `REACT_APP_AUTH_URL`

**问题:** RAGFlow连接失败
**解决:** 确保 `ragflow_demo/ragflow_config.json` 配置正确

## 许可证

与主项目相同
