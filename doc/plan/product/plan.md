# 最终版技术方案（生产级）

## 1. 总体设计原则
- 全链路流式
- 硬件与软件协同优化
- 状态机驱动的可中断 Pipeline
- 模块化、可替换、可扩展

## 2. 系统总体架构
Mic Array  
→ AEC / Beamforming / DOA  
→ Trigger  
→ ASR（实时流式）  
→ Semantic Cache  
→ RAG Retriever  
→ LLM（流式生成）  
→ Text Normalizer  
→ TTS（推流桶）  
→ Audio Queue → Speaker  

前后端通过 WebSocket 全双工通信。

## 3. 硬件音频层
- 4/6 麦环形阵列
- 支持远端参考信号的 AEC
- 波束成形 + 声源角度过滤
- 输出 Processed Mono + Raw 多通道

## 4. 后端架构
- Python FastAPI
- WebSocket 音频与事件流
- Session + State Machine
- Cancel Token / Session Version 控制打断

### 状态定义
- IDLE
- LISTENING
- THINKING
- SPEAKING
- INTERRUPTED
- ERROR

## 5. 流式处理与推流桶
- ASR 实时 partial 输出
- LLM token 级流式生成
- 推流桶策略：
  - ≥5 字 或 标点 即送 TTS
- TTS 并行生成，降低首字延迟

## 6. 文本归一化
- 数字、日期、单位强规则转换
- 专有名词读音表
- LLM 输出二次校正

## 7. 缓存与加速
### 7.1 语义缓存
- Redis + Embedding
- 高频问题直接返回预生成 MP3
- 延迟 < 0.2 秒

### 7.2 本地灾备
- 本地部署 Qwen2.5-7B
- API 超时或断网自动切换
- 降级 Prompt 防幻觉

## 8. 文档解析与 RAG
- PDF 结构解析（段落/表格）
- Chunk + Metadata 检索
- 引用可追溯

## 9. 打断机制（Barge-in）
- 播放中持续监听（AEC 后信号）
- 高置信人声触发 interrupt
- 后端取消生成
- 前端 AudioQueue.clear()

## 10. 可观测性与运维
- 延迟、命中率、打断率监控
- 资源与内存监控
- 自动重启与热更新

## 11. 扩展能力
- 数字人驱动
- 多语言
- 多展厅/多知识库
- 云-边-端混合部署
