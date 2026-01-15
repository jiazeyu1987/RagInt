-- Create user_permission_groups junction table
CREATE TABLE IF NOT EXISTS user_permission_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    group_id INTEGER NOT NULL,
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES permission_groups(group_id) ON DELETE CASCADE,
    UNIQUE(user_id, group_id)
);

-- Migrate existing user-group relationships
INSERT OR IGNORE INTO user_permission_groups (user_id, group_id, created_at_ms)
SELECT user_id, group_id, created_at_ms
FROM users
WHERE group_id IS NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_upg_user_id
ON user_permission_groups(user_id);

CREATE INDEX IF NOT EXISTS idx_upg_group_id
ON user_permission_groups(group_id);
