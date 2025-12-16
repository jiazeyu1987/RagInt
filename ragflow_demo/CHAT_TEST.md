# RAGFlow 聊天测试工具

本目录包含两个用于测试 RAGFlow 流式对话功能的工具：

## 🛠️ 工具说明

### 1. simple_chat_test.py (推荐新手使用)
简化的交互式聊天测试工具，易于使用。

**功能特点：**
- 简单的交互式界面
- 自动列出可用数据集
- 基本的对话功能
- 清晰的错误提示

**使用方法：**
```bash
cd ragflow_demo
python simple_chat_test.py
```

### 2. test_chat.py (高级用户使用)
功能完整的流式聊天客户端，支持更多高级功能。

**功能特点：**
- 流式响应支持（如果可用）
- 会话管理命令
- 自定义配置文件
- 命令行参数支持

**使用方法：**
```bash
# 基本使用
python test_chat.py

# 指定数据集ID
python test_chat.py --dataset-id your_dataset_id

# 使用自定义配置文件
python test_chat.py --config custom_config.json

# 列出所有可用数据集
python test_chat.py --list-datasets
```

## ⚙️ 配置要求

### 1. 设置 RAGFlow API 密钥

编辑 `ragflow_config.json` 文件（在 ragflow_demo 目录下）：

```json
{
  "api_key": "ragflow-YOUR_ACTUAL_API_KEY_HERE",
  "base_url": "http://127.0.0.1",
  "dataset_name": "知识库调研",
  "default_conversation_name": "知识库问答"
}
```

**重要：**
- 将 `ragflow-YOUR_ACTUAL_API_KEY_HERE` 替换为您的真实 API 密钥
- 确保 RAGFlow 服务器正在运行（默认地址：http://127.0.0.1）
- 如果服务器运行在其他地址，请修改 `base_url`

### 2. 获取 API 密钥的方法

1. 打开 RAGFlow Web 界面（如 http://localhost:9380）
2. 登录您的账户
3. 进入设置或 API 管理页面
4. 生成或复制 API 密钥

### 3. 准备数据集

在使用聊天功能之前，确保您有：

- 至少一个包含文档的数据集
- 文档已经成功处理和索引

如果没有数据集，您可以：

1. 通过 RAGFlow Web 界面创建数据集并上传文档
2. 使用演示工具创建：`python main.py --demo kb`

## 🚀 快速开始

### 第一步：验证配置

```bash
python main.py --check-config
```

### 第二步：创建测试数据集（如果需要）

```bash
python main.py --demo kb
```

### 第三步：运行聊天测试

```bash
python simple_chat_test.py
```

## 📝 使用示例

### 交互式聊天会话

```
cd ragflow_demo
python simple_chat_test.py

✅ Connected to RAGFlow

📚 Available datasets:
  1. my_documents
  2. product_manuals

Select dataset (1-2): 1

✅ Selected dataset: my_documents

💬 Chat session created!

==================================================
🚀 RAGFlow Streaming Chat
Type 'quit' to exit
==================================================

👤 You: What is this document about?

🤖 RAGFlow: Based on the documents in your dataset, this appears to be about...

👤 You: Can you summarize the main points?

🤖 RAGFlow: Here are the main points from your documents...

👤 You: quit

👋 Goodbye!
```

### 高级命令使用

```bash
# 查看所有可用数据集
python test_chat.py --list-datasets

# 使用特定数据集开始聊天
python test_chat.py --dataset-id abc123def456

# 在聊天中使用命令
/new      # 开始新的聊天会话
/clear    # 清除对话历史
/help     # 显示帮助信息
/quit     # 退出聊天
```

## 🔧 故障排除

### 常见问题

**Q: 提示 "API key not configured"**
A: 请检查 `configs/config.json` 中的 API 密钥是否正确设置

**Q: 提示 "No datasets found"**
A: 您需要先创建数据集并上传文档到 RAGFlow

**Q: 连接超时**
A: 检查 RAGFlow 服务器是否正在运行，以及网络连接是否正常

**Q: 流式响应不工作**
A: 流式响应需要 RAGFlow 服务器支持，会自动回退到普通响应模式

### 调试模式

如果遇到问题，可以查看详细错误信息：

```bash
# 查看配置状态
python main.py --check-config

# 运行知识库演示检查连接
python main.py --demo kb
```

## 💡 提示

- 确保您的文档已经成功处理和索引
- 使用清晰、具体的问题获得更好的回答
- 流式响应功能取决于您的 RAGFlow 服务器版本
- 可以使用 `/new` 命令在对话中途重新开始

需要更多帮助？请参考 RAGFlow 官方文档或查看演示代码中的其他示例。