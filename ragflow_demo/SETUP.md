# RAGFlow Demo 配置指南

## 📝 快速配置步骤

### 1. 启动 RAGFlow 服务器

确保您的 RAGFlow 服务器正在运行，默认地址通常是：
- Web 界面: http://localhost:9380
- API 端点: http://localhost:9380

### 2. 获取 API 密钥

1. 访问您的 RAGFlow Web 界面 (http://localhost:9380)
2. 登录或注册账户
3. 在设置或 API 管理页面生成 API 密钥
4. 复制 API 密钥

### 3. 配置 Demo

编辑 `configs/config.json` 文件：

```json
{
  "ragflow": {
    "api_key": "YOUR_ACTUAL_API_KEY_HERE",
    "base_url": "http://localhost:9380"
  }
}
```

**重要**: 将 `YOUR_ACTUAL_API_KEY_HERE` 替换为您在第2步中获取的真实 API 密钥。

### 4. 验证配置

运行以下命令验证配置是否正确：

```bash
python main.py --check-config
```

如果配置正确，您应该看到：
```
[OK] Configuration loaded successfully
[INFO] Using RAGFlow server: http://localhost:9380
```

### 5. 运行演示

配置完成后，运行演示：

```bash
# 运行所有演示
python main.py --demo all

# 或运行特定演示
python main.py --demo chat
python main.py --demo kb
python main.py --demo retrieval
python main.py --demo docs
python main.py --demo advanced
```

## 🛠️ 配置选项

### 完整配置示例

```json
{
  "ragflow": {
    "api_key": "ragflow-your-actual-api-key-string",
    "base_url": "http://localhost:9380"
  },
  "knowledge_base": {
    "default_vs_type": "chromadb",
    "default_embed_model": "text2vec",
    "chunk_size": 512,
    "chunk_overlap": 50
  },
  "chat": {
    "temperature": 0.7,
    "max_tokens": 1000,
    "top_k": 3,
    "similarity_threshold": 0.0,
    "rerank": true,
    "stream": false
  }
}
```

### 参数说明

- `api_key`: 您的 RAGFlow API 密钥 (必需)
- `base_url`: RAGFlow 服务器地址 (必需)
- `knowledge_base`: 知识库配置选项 (可选)
- `chat`: 聊天功能配置参数 (可选)

## ❓ 常见问题

### Q: 在哪里获取 API 密钥？
A: 登录 RAGFlow Web 界面，在设置或 API 管理页面生成。

### Q: 演示报告认证错误？
A: 检查 config.json 中的 API 密钥是否正确设置。

### Q: 如何更改服务器地址？
A: 修改 config.json 中的 `base_url` 字段。

### Q: 可以在没有 RAGFlow 服务器的情况下运行演示吗？
A: 是的，演示包含模拟模式，无需真实服务器即可运行。

## 💡 提示

- 确保 API 密钥不要包含空格或特殊字符
- 检查防火墙是否阻止了对 RAGFlow 服务器的访问
- 如果使用 Docker 运行 RAGFlow，确保端口映射正确

需要更多帮助？请参考 [RAGFlow 官方文档](https://ragflow.io/docs)。