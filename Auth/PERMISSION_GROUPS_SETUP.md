# 权限组系统部署指南

本文档说明如何部署和使用基于权限组的权限管理系统。

## 📋 概述

权限组系统将原有的基于角色的权限管理升级为更加灵活的权限组管理：

- **权限组 (Permission Group)**: 包含多个权限的集合
- **权限 (Permission)**: 具体的操作权限，格式为 `resource:action`
- **用户**: 分配给权限组，自动获得该组的所有权限

## 🚀 部署步骤

### 1. 备份现有数据库

```bash
cd D:\ProjectPackage\RagInt\Auth\new_backend
copy data\auth.db data\auth.db.backup
```

### 2. 执行数据库迁移脚本

**重要**: 请确保后端服务已停止，然后再执行迁移脚本。

```bash
# 使用 Python 运行迁移脚本
cd D:\ProjectPackage\RagInt\Auth\new_backend
python scripts\migrate_to_permission_groups.py
```

迁移脚本将自动完成以下操作：

1. ✅ 创建 `permission_groups` 表（权限组信息）
2. ✅ 创建 `group_permissions` 表（权限组-权限关联）
3. ✅ 为 `users` 表添加 `group_id` 字段
4. ✅ 插入5个默认权限组
5. ✅ 为权限组分配默认权限
6. ✅ 迁移现有用户到对应的权限组

### 3. 默认权限组说明

迁移脚本会创建以下系统权限组：

| 权限组名称 | 描述 | 权限数量 | 对应原角色 |
|-----------|------|---------|-----------|
| **admin** | 系统管理员，拥有所有权限 | 通过Casbin通配符 | admin |
| **reviewer** | 文档审核员 | 4个权限 | reviewer |
| **operator** | 操作员 | 3个权限 | operator |
| **viewer** | 查看者 | 1个权限 | viewer |
| **guest** | 访客 | 1个权限 | guest |

### 4. 验证迁移结果

迁移完成后，可以检查数据库：

```bash
# 打开数据库
sqlite3 data\auth.db

# 检查权限组表
SELECT * FROM permission_groups;

# 检查权限分配
SELECT * FROM group_permissions;

# 检查用户权限组分配
SELECT user_id, username, group_id FROM users;

# 退出
.quit
```

### 5. 启动后端服务

```bash
cd D:\ProjectPackage\RagInt\Auth\new_backend
python -m app
# 或使用 uvicorn
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### 6. 启动前端服务

```bash
cd D:\ProjectPackage\RagInt\Auth\fronted
npm start
```

## 🔧 使用权限组系统

### 访问权限组管理页面

1. 使用管理员账号登录
2. 点击左侧菜单的 "权限组管理"
3. 即可查看、创建、编辑和删除权限组

### 创建自定义权限组

1. 点击 "创建权限组" 按钮
2. 填写权限组名称和描述
3. 勾选该权限组需要的权限
4. 点击保存

**可用权限分类**:

| 资源 (Resource) | 可用操作 (Actions) |
|----------------|-------------------|
| **kb_documents** | view, upload, delete, approve, reject |
| **users** | view, create, update, delete |
| **permission_groups** | view, create, update, delete |
| **ragflow_documents** | view, download |

### 为用户分配权限组

1. 进入 "用户管理" 页面
2. 创建新用户时选择权限组
3. 或编辑现有用户修改其权限组

**注意**: 系统权限组（标记为"系统权限组"）不能被删除，但可以编辑其权限。

## 📝 API 接口

权限组管理提供以下API接口（已在后端自动注册）：

### 获取所有权限组
```
GET /api/permission-groups
```

### 获取单个权限组
```
GET /api/permission-groups/{group_id}
```

### 创建权限组
```
POST /api/permission-groups
Body: {
  "group_name": "string",
  "description": "string",
  "permissions": ["string"]
}
```

### 更新权限组
```
PUT /api/permission-groups/{group_id}
Body: {
  "group_name": "string",
  "description": "string",
  "permissions": ["string"]
}
```

### 删除权限组
```
DELETE /api/permission-groups/{group_id}
```

### 获取权限组的权限列表
```
GET /api/permission-groups/{group_id}/permissions
```

### 添加权限到权限组
```
POST /api/permission-groups/{group_id}/permissions
Body: {
  "permission": "string"
}
```

### 从权限组移除权限
```
DELETE /api/permission-groups/{group_id}/permissions/{permission}
```

### 获取所有可用权限
```
GET /api/permissions/available
```

## 🔒 权限检查

系统会在以下位置自动检查权限：

### 前端路由守卫
- 使用 `<PermissionGuard>` 组件保护路由
- 示例：
  ```jsx
  <PermissionGuard permission={{ resource: 'permission_groups', action: 'view' }}>
    <PermissionGroupManagement />
  </PermissionGuard>
  ```

### 后端API端点
- 使用 `@require_permission` 装饰器
- 示例：
  ```python
  @router.get("/permission-groups")
  @require_permission("permission_groups:view")
  async def list_permission_groups(...):
      ...
  ```

## 🎯 权限继承规则

1. **系统内置权限组**（admin, reviewer, operator, viewer, guest）不可删除
2. **自定义权限组**可以完全自定义权限
3. **用户权限** = 用户所属权限组的所有权限
4. **Admin特殊处理**: admin权限组通过Casbin通配符拥有所有权限

## 🐛 故障排查

### 问题1: 迁移脚本执行失败

**解决方案**:
- 确保Python环境正确
- 检查数据库文件路径是否正确
- 查看错误日志了解具体原因

### 问题2: 权限组页面无法访问

**解决方案**:
- 确认使用的是管理员账号登录
- 检查 `permission_groups:view` 权限是否正确分配
- 查看浏览器控制台是否有错误

### 问题3: 用户无法登录

**解决方案**:
- 确认迁移脚本已正确执行
- 检查数据库中的用户数据
- 验证用户是否已正确分配到权限组

### 问题4: 权限检查失败

**解决方案**:
- 确认权限格式正确（resource:action）
- 检查权限组的权限列表
- 验证Casbin策略是否正确加载

## 🔄 回滚方案

如需回滚到原有权限系统：

1. **恢复数据库备份**:
   ```bash
   copy data\auth.db.backup data\auth.db
   ```

2. **恢复代码**:
   - 回退后端代码到迁移前的版本
   - 回退前端代码到迁移前的版本

3. **重启服务**

## 📊 数据库表结构

### permission_groups 表
```sql
CREATE TABLE permission_groups (
    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system INTEGER DEFAULT 0,  -- 是否系统内置
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### group_permissions 表
```sql
CREATE TABLE group_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    permission TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES permission_groups(group_id) ON DELETE CASCADE,
    UNIQUE(group_id, permission)
);
```

### users 表变更
```sql
ALTER TABLE users ADD COLUMN group_id INTEGER;
ALTER TABLE users ADD FOREIGN KEY (group_id) REFERENCES permission_groups(group_id);
```

## ✅ 迁移检查清单

- [ ] 已备份现有数据库
- [ ] 已停止后端服务
- [ ] 已执行迁移脚本
- [ ] 已验证权限组创建成功
- [ ] 已验证用户迁移成功
- [ ] 已重启后端服务
- [ ] 已测试权限组管理页面
- [ ] 已测试用户权限组分配
- [ ] 已验证权限检查正常工作

## 📞 技术支持

如遇到问题，请检查：
1. 后端日志
2. 浏览器控制台
3. 数据库数据
4. API响应

## 🎉 完成

部署完成后，您现在可以：
- ✅ 通过权限组统一管理权限
- ✅ 创建自定义权限组
- ✅ 灵活分配权限给用户
- ✅ 通过界面管理权限和权限组
- ✅ 享受更灵活的权限控制体验
