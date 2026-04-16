# Voice QA

## 用户目标

用户希望在展厅或演示场景中，能够用文本或语音快速提出问题，并得到可播放、可打断、可继续的回答。

## 当前能力

- 文本提交
- 语音录制与识别
- 流式问答输出
- TTS 播放
- 问答历史记录
- 音频缓存命中
- agent / chat 会话切换

## 前端侧关键组织

- `fronted/src/api/backendClient.js`: 后端请求基础封装
- `fronted/src/hooks/useAskWorkflowManager.js`: 问答流程编排
- `fronted/src/hooks/useVoiceInputManager.js`: 语音输入状态
- `fronted/src/managers/AskWorkflowManager.js`: 问答流控制
- `fronted/src/managers/RagflowChatManager.js`: 会话与聊天对象管理

## 后端侧关键入口

- `/api/ask`: SSE 问答主入口
- `/api/cancel`: 取消当前请求
- `/api/text_to_speech` 及其流式变体：语音合成
- `/api/status` / `/api/events`: 请求状态与时间线

## 体验要求

- 用户提问时，不应该被之前的语音残留继续推着走。
- 被打断后的系统状态要可诊断，而不是“静默卡住”。
- 高频问答应尽量命中缓存或可复用路径，但复用结果必须可解释。

## 与导览的关系

- 问答不是独立于导览存在的，它会在讲解中途接管焦点。
- 高优先级问题、插问和继续讲解都属于同一运行编排问题。
