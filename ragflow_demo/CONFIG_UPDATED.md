# 配置文件更新说明

## ragflow_config.json 新增字段

```json
{
  "api_key": "YOUR_RAGFLOW_API_KEY_HERE",
  "base_url": "http://127.0.0.1",
  "dataset_name": "知识库调研",
  "default_conversation_name": "知识库问答",
  "timeout": 10,
  "log_level": "INFO",
  "log_file": "/log",
  "max_retries": 3,
  "retry_delay": 1.0
}
```

> 交付建议：`api_key` 等密钥请使用环境变量注入（例如 `RAGFLOW_API_KEY`、`BAILIAN_API_KEY`），配置文件保留占位符即可。

### 新增字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `default_conversation_name` | string | 否 | 默认对话名称，用于查找现有的Chat实体。默认值: "知识库问答" |

### chat_agent_chat.py 的更新

**之前的行为**：
- 每次运行都创建新的Chat实体：`"Chat Session {timestamp}"`

**现在的行为**：
- 首先尝试查找名为 `default_conversation_name` 的现有Chat实体
- 如果找到，使用现有Chat实体
- 如果未找到，创建名为 `default_conversation_name` 的新Chat实体

### 优势

1. **对话连续性** - 使用固定的Chat实体，保持对话历史和配置
2. **资源管理** - 避免创建大量临时Chat实体
3. **配置复用** - Chat实体的LLM设置、提示词等配置可以复用
4. **灵活配置** - 可以通过修改配置文件来使用不同的Chat实体

### 使用示例

```bash
# 使用默认的 "知识库问答" Chat实体
python chat_agent_chat.py

# 如果想使用不同的Chat实体，修改配置文件中的 default_conversation_name
```

这样修改后，chat_agent_chat.py 现在会使用配置文件中指定的现有Chat实体，而不是每次都创建新的临时Chat实体。
