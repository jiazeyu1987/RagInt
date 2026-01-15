-- 直接在SQLite中执行这个SQL脚本

CREATE TABLE IF NOT EXISTS deletion_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    kb_id TEXT NOT NULL,
    deleted_by TEXT NOT NULL,
    deleted_at_ms INTEGER NOT NULL,
    original_uploader TEXT,
    original_reviewer TEXT,
    ragflow_doc_id TEXT,
    FOREIGN KEY (deleted_by) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_deletion_logs_kb ON deletion_logs(kb_id);
CREATE INDEX IF NOT EXISTS idx_deletion_logs_time ON deletion_logs(deleted_at_ms);
