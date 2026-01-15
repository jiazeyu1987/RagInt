-- 权限组系统数据库迁移脚本

-- 1. 创建权限组表
CREATE TABLE IF NOT EXISTS permission_groups (
    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system INTEGER DEFAULT 0,  -- 是否系统内置权限组（0=否，1=是）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建权限组-权限关联表
CREATE TABLE IF NOT EXISTS group_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    permission TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES permission_groups(group_id) ON DELETE CASCADE,
    UNIQUE(group_id, permission)
);

-- 3. 修改用户表，添加权限组字段（保留role字段以便迁移）
ALTER TABLE users ADD COLUMN group_id INTEGER;
ALTER TABLE users ADD FOREIGN KEY (group_id) REFERENCES permission_groups(group_id);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_group_permissions_group_id ON group_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);

-- 5. 插入默认权限组（对应原有的角色）
-- 管理员组（所有权限）
INSERT INTO permission_groups (group_name, description, is_system) VALUES
('admin', '系统管理员，拥有所有权限', );

-- 获取管理员组的group_id
-- 在应用代码中动态获取并插入权限

-- 审核员组
INSERT INTO permission_groups (group_name, description, is_system) VALUES
('reviewer', '文档审核员，可以审核文档', 0);

-- 操作员组
INSERT INTO permission_groups (group_name, description, is_system) VALUES
('operator', '操作员，可以上传和查看文档', 0);

-- 查看者组
INSERT INTO permission_groups (group_name, description, is_system) VALUES
('viewer', '查看者，只能查看文档', 0);

-- 访客组
INSERT INTO permission_groups (group_name, description, is_system) VALUES
('guest', '访客，只能查看文档', 0);

-- 6. 为默认权限组分配权限
-- 注意：这里使用group_name，实际应用中应该使用group_id
-- 由于SQLite的AUTOINCREMENT特性，我们假设ID从1开始

-- 管理员组（假设group_id=1）- 所有权限（通过Casbin通配符）
-- 不需要在group_permissions中插入，Casbin会处理 "*"

-- 审核员组（假设group_id=2）
INSERT INTO group_permissions (group_id, permission) VALUES
(2, 'kb_documents:approve'),
(2, 'kb_documents:reject'),
(2, 'kb_documents:view'),
(2, 'users:view');

-- 操作员组（假设group_id=3）
INSERT INTO group_permissions (group_id, permission) VALUES
(3, 'kb_documents:upload'),
(3, 'kb_documents:view'),
(3, 'kb_documents:delete');

-- 查看者组（假设group_id=4）
INSERT INTO group_permissions (group_id, permission) VALUES
(4, 'kb_documents:view');

-- 访客组（假设group_id=5）
INSERT INTO group_permissions (group_id, permission) VALUES
(5, 'kb_documents:view');

-- 7. 更新现有用户的group_id（基于role字段）
-- 这部分会在应用代码中执行，因为需要匹配group_name和role
