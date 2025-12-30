## 三种模式与统一运行控制

系统有三种用户可见模式（由设置项决定）：

1) **普通模式**：站点讲解使用 RagFlow + TTS 实时生成；用户随时可提问。
2) **录制模式**：站点讲解仍使用 RagFlow + TTS 实时生成，但会把 RagFlow 的 `chunk/segment/done` 与对应的 TTS 音频落盘形成存档；用户随时可提问。
3) **回播模式**：站点讲解使用存档中的“文字 + 音频 URL”播放，不再调用 RagFlow/TTS；用户提问仍走 RagFlow + TTS（提问不录制）。

为了让“打断 / 发送 / 继续讲解”在三种模式下行为一致，前端做了两层统一：

### 1) 统一中断 epoch（InterruptManager）

- `InterruptManager` 维护一个全局 `epoch`。
- 每次 `interruptCurrentRun(reason)` 都会 `bump(epoch)`：
  - 所有异步回调（SSE 解析、存档 stop 拉取、prefetch 等）在 enqueue 前都会检查 `epoch` 是否仍然匹配。
  - 旧 `epoch` 的迟到回调会直接变成 no-op，避免“打断后又被迟到回调推进到下一站”。

### 2) 统一中断策略（RunPolicies.classifyInterrupt）

不同的 interrupt reason 会被归类为两种策略：

- **pause（可继续）**：保留 tour 的缓存与断点，允许用户点击“继续讲解”续播。
  - 典型：`user_stop` / `escape` / `new_question` / `queue_takeover` / `high_priority`
  - 行为：`TourPipelineManager.pause()` + 捕获当前 stop 的剩余 TTS 片段到 `tourResumeRef`
- **hard（不可续）**：清空 tour 的缓存与断点，通常用于重新开始或重置。
  - 典型：`tour_start` / `tour_reset`
  - 行为：`TourPipelineManager.interrupt()`（清空 prefetch store）

### 发送/打断/继续的统一行为

- UI 侧通过 `RunCoordinator` 作为单入口触发 `start/continue/send/interrupt`，避免散落的 reason 字符串与不一致的调用顺序。

- **打断按钮（user_stop）**：
  - pause 策略 + 捕获断点 + bump epoch
- **发送（text submit / ASR submit）**：
  - 若正在讲解/播放：会触发 `new_question` interrupt（pause 策略 + 捕获断点 + bump epoch）
  - 然后执行一次新的 `ask()`（普通/录制：实时；回播：仍实时）
  - 群问模式下由 `RunCoordinator.submitUserText()` 统一负责入队/抢占/自动轮询下一条
- **继续讲解**：
  - 优先从 `tourResumeRef` 续播同一 stop 的剩余片段
  - 若没有断点片段：按当前 stopIndex 重新发起讲解（普通/录制实时；回播取存档）
