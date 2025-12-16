# Demo版技术方案（与最终版统一骨架）

## 1. 统一设计原则
- 与最终产品 **共用 Pipeline / 会话模型 / 状态机**
- Demo 仅做能力降级，不改变架构
- 所有升级都通过“替换模块”完成

## 2. 总体架构
Audio In  
→ VAD Trigger  
→ ASR  
→ Fixed QA / RAG  
→ LLM（流式）  
→ Text Normalizer  
→ TTS（分段）  
→ Audio Queue → 播放  

前后端通过 **事件协议** 通信。

## 3. 前后端架构
- 后端：Python FastAPI
- 前端：Web 页面（或 Streamlit）
- 通信方式：HTTP + 轮询（Demo），协议与 WebSocket 版一致

### 3.1 核心接口
- POST /api/qa/start
- POST /api/qa/stop
- POST /api/qa/interrupt
- GET  /api/qa/status
- GET  /api/qa/events

## 4. 会话与状态机
每轮问答一个 session_id：

- IDLE
- LISTENING
- THINKING
- SPEAKING
- INTERRUPTED
- ERROR

打断 = 取消当前 session 并清空音频队列。

## 5. 音频方案（Demo版）
- 输入：电脑麦克风 / 简单会议麦
- VAD：Silero VAD
- 播放期间暂停监听（软件门控，避免回声）

> 与最终版保持接口一致，未来替换为麦克风阵列 + AEC。

## 6. ASR
- 本地或轻量 ASR（整句）
- 接口预留 partial（流式）输出

## 7. 知识与生成
### 7.1 Fixed QA
- 20 条核心问答
- 命中即直接返回标准答案

### 7.2 RAG + LLM
- RAGFlow + DeepSeek V3
- 流式 token 输出

## 8. 文本归一化
- 数字：1980 → 一九八零
- 小数：2.5 → 两点五
- 单位：米 / 年 / 次

## 9. TTS 与播放
- GPT-SoVITS
- 标点或字数切段
- AudioQueue 顺序播放
- interrupt 时 clear 队列

## 10. 可观测性
- 每轮记录：ASR / LLM / TTS / 总延迟
- 错误事件上报前端

## 11. Demo → 最终版升级点
| 模块 | Demo | 最终版 |
|----|----|----|
| 音频 | 单麦 + VAD | 阵列 + AEC + DOA |
| 通信 | HTTP | WebSocket |
| ASR | 整句 | 实时流式 |
| TTS | 分段 | 推流桶 |
| 打断 | 按钮 | 人声检测 |
| 缓存 | 固定QA | Redis语义缓存 |
| 灾备 | 兜底文案 | 本地LLM |

---

