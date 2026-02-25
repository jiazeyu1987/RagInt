## 问答语音缓存（召回 + 小模型分类）实施方案

### 目标
- 全局共享“问题 -> 语音回答”缓存。
- 新问题先匹配历史问题：命中则直接返回历史语音。
- 未命中走现有 RAGFlow + TTS 流程，并自动入库供下次复用。
- 按 TTS 参数隔离：`tts_provider + tts_voice + tts_speed`。
- 提供管理员管理能力：查看缓存条目、硬删除（DB + 音频文件）。

### 架构总览
1. 检索层（Recall）
- 在本地 SQLite 增加向量索引表，保存历史问题 embedding。
- 查询时先按 TTS 参数过滤，再做 TopK 向量召回（cosine）。

2. 判定层（Classifier）
- 将“用户问题 + TopK 候选问题”发送给 RAGFlow 对话 LLM（小模型提示词）。
- 要求模型返回严格 JSON：`match: true/false`, `candidate_id`, `confidence`, `reason`。
- `match=true` 且 `confidence>=阈值` 才命中。

3. 命中响应层（Cache Hit Response）
- 命中后直接在 SSE 中返回 `audio_hit` 结构（音频 URL + 文本），前端直接排队播放缓存音频。
- 不触发在线 TTS，减少延迟和成本。

4. 回写层（Write Back）
- 未命中时走原流程。
- 完成后写入：问题、答案、音频路径、TTS 参数、embedding、元数据。

5. 管理层（Admin）
- 新增 ops API：分页列表、按条件筛选、硬删除。
- 删除时同时清理文件系统音频。

### 数据模型（新增）
- `qa_audio_pairs`
  - `id` (PK)
  - `question_text`
  - `answer_text`
  - `audio_rel_path` / `audio_url`
  - `tts_provider`, `tts_voice`, `tts_speed`
  - `created_at_ms`, `updated_at_ms`
  - `source_request_id`
- `qa_audio_embeddings`
  - `pair_id` (FK -> qa_audio_pairs.id)
  - `embedding_model`
  - `embedding_dim`
  - `vector_blob` (float32 bytes)

### 后端改造清单
1. `HistoryStore` 扩展为 `QaAudioCacheStore`
- 增加建表迁移逻辑与 CRUD。
- 提供：`search_candidates(...)`、`get_pair(...)`、`insert_pair(...)`、`delete_pair_hard(...)`。

2. 新增 `qa_audio_matcher` 服务
- `embed_question(question)`
- `recall_topk(question_embedding, tts_params, k)`
- `llm_classify(question, candidates)`（调用现有 RAGFlow 会话）
- `match(question, tts_params)` 统一输出命中结果。

3. `ConversationOrchestrator` 接入
- 在 `_maybe_stream_cache_shortcut` 前增加“音频缓存命中检查”。
- 命中时返回 `audio_hit` 事件并 `done`。
- 未命中继续原流程。

4. TTS 回写钩子
- 在当前 ask 结束并确认有可复用音频后，调用 `insert_pair`。
- 仅写入成功语音（非空文件、可访问路径）。

5. 管理 API（建议挂在 `/api/ops`）
- `GET /api/ops/qa_audio_pairs?limit=&offset=&provider=&voice=&speed=`
- `DELETE /api/ops/qa_audio_pairs/{id}`（硬删除）

### 前端改造清单
1. SSE 消费
- `AskWorkflowManager` 增加 `audio_hit` 事件处理：
  - 直接 `ttsMgr.enqueueAudioUrl(audio_url, { recorded: true })`
  - 更新答案文本展示（使用缓存 answer_text）

2. 管理界面
- 在 ops/设置页新增“问答音频缓存管理”面板：
  - 列表、试听、删除。

### 分类提示词规范（RAGFlow 小模型）
- 输入：
  - 用户问题
  - 候选列表（id + question_text）
  - 规则：仅判断“语义是否可复用同一答案语音”
- 输出（严格 JSON）：
  - `{"match": true|false, "candidate_id": number|null, "confidence": 0~1, "reason": "..."}`
- 若 JSON 解析失败：视为未命中（降级安全策略）。

### 阶段计划
- Phase 1（后端基础）
  - 建表、存取、删除、TopK 召回。
- Phase 2（小模型判定）
  - RAGFlow 分类提示词、解析与阈值策略。
- Phase 3（主链路接入）
  - ask 流程命中直返音频；未命中回写。
- Phase 4（管理端）
  - ops API + 前端管理页 + 删除联动。
- Phase 5（测试）
  - 命中/未命中/误判回退/删除后不可命中/参数隔离回归。

### 验收标准
- 同类问题命中后首包时延显著下降。
- `tts_provider/voice/speed` 不一致时不串音。
- 删除条目后立即失效且音频文件被移除。
- 不影响现有：录制讲解、播放存档、打断/继续讲解。
