# Task 4：引入编排层（Conversation Orchestrator）

## 目标

把“单次问答”的复杂编排从路由与零散 service 调用中收敛到一个编排层：
- 统一状态：request 生命周期、阶段打点、错误处理、取消传播
- 统一产出：流式文本段落、最终文本、可选的 debug 信息

## 范围

- `backend/orchestrators/conversation_orchestrator.py`（新增）
- 路由 `/api/ask` 改为调用 orchestrator
- service 保持纯能力，不做跨域编排

## 具体工作

1. 定义 orchestrator 输入：
   - question、request_id、client_id、conversation/agent 选择、guide 参数等
2. 输出：
   - generator：逐段 yield（与前端现有协议一致：chunk/segment/done/meta）
3. 错误与降级：
   - RAG 失败 → 返回错误段或 fallback 文本
   - TTS 不在此层做（仍由前端 TTS pipeline 拉取）

## 验收标准

- /api/ask 协议保持兼容（前端无需改动或仅最小改动）
- 日志中可看到完整阶段：submit→rag_first→rag_done
- cancel 生效（依赖 Task 3）

