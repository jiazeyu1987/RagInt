# RAGFlow 优化流式聊天工具

## 功能特点

✅ **直接流式对话** - 无菜单选项，直接开始聊天
✅ **纯内容输出** - 仅显示对话内容，无元数据
✅ **智能去重** - 自动过滤重复内容，避免文字重叠
✅ **实时流式** - 逐字显示回复，提供流畅体验

## 使用方法

### 1. 配置设置
确保 `ragflow_config.json` 文件包含正确的 API 密钥：
```json
{
  "api_key": "your_ragflow_api_key",
  "base_url": "http://127.0.0.1"
}
```

### 2. 运行聊天工具
```bash
cd ragflow_demo
python optimized_streaming_chat.py
```

### 3. 交互对话
```
RAGFlow Streaming Chat Ready
Type your message and press Enter. Type 'quit' to exit.
--------------------------------------------------

You: 你好
RAGFlow: 你好！很高兴见到你。有什么我可以帮助你的吗？

You: 讲个笑话
RAGFlow: 为什么程序员不喜欢大自然？
因为大自然里有太多的 bugs！

You: quit
```

## 优化说明

### 解决的问题
1. **重复内容显示** - 之前会显示多次相同文字
2. **元数据显示** - 之前会显示 `{'content': '...', 'id': None, ...}`
3. **菜单系统复杂** - 之前需要选择各种选项

### 技术实现
- **内容提取**: 从 RAGFlow 的 Message 对象中提取 `content` 字段
- **智能去重**: 比较相邻响应，只显示新增部分
- **流式输出**: 实时显示，逐字符刷新

## 文件说明

- `optimized_streaming_chat.py` - 优化后的流式聊天主程序
- `ragflow_config.json` - 配置文件（包含 API 密钥）
- `STREAMING_CHAT_README.md` - 本说明文档

## 与其他工具对比

| 工具 | 菜单选项 | 元数据显示 | 重复内容 | 流式体验 |
|------|----------|------------|----------|----------|
| simple_chat_test.py | ✓ | ✗ | ✗ | ✗ |
| test_chat.py | ✓ | ✗ | ✗ | ✓ |
| streaming_chat_demo.py | ✓ | ✗ | ✗ | ✓ |
| **optimized_streaming_chat.py** | **✗** | **✓** | **✓** | **✓** |

## 故障排除

### 问题: "ragflow_config.json not found"
**解决**: 确保 `ragflow_config.json` 文件位于 `ragflow_demo` 目录下

### 问题: "Please set your RAGFlow API key"
**解决**: 编辑 `ragflow_config.json`，将 `api_key` 替换为您的真实 API 密钥

### 问题: "RAGFlow SDK not installed"
**解决**: 运行 `pip install ragflow-sdk`

## 技术细节

### 去重算法
```python
last_complete_content = ""

for chunk in response:
    content = extract_content(chunk)

    if len(content) > len(last_complete_content):
        if content.startswith(last_complete_content):
            new_part = content[len(last_complete_content):]
            print(new_part, end="", flush=True)

        last_complete_content = content
```

### 内容提取
```python
def extract_content(chunk):
    if hasattr(chunk, 'content'):
        return chunk.content
    elif hasattr(chunk, 'get'):
        return chunk.get('content', '')
    # ... 其他提取逻辑
```

这个优化版本提供了最干净、最高效的 RAGFlow 流式聊天体验！