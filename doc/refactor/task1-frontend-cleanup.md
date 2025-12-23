# Task 1：前端瘦身与单一路径（去除 legacy / fallback）

## 目标

让前端的问答与播报链路收敛到**唯一编排入口**与**唯一播放入口**，降低重复逻辑导致的隐性差异与回归风险。

- 问答编排：仅通过 `fronted/src/managers/AskWorkflowManager.js`
- 播放入口：仅通过 `fronted/src/audio/ttsAudio.js`（`playWavStreamViaWebAudio` 等）
- `fronted/src/App.js` 只保留页面状态与组件组合，不再保留大段 legacy 音频/ask fallback 实现

## 范围

- `fronted/src/App.js`
- `fronted/src/audio/ttsAudio.js`
- `fronted/src/managers/AskWorkflowManager.js`
- `fronted/src/managers/TtsQueueManager.js`

## 具体工作

1. 删除 `fronted/src/App.js` 中未使用的 `_legacyPlayWavStreamViaWebAudio`（如仍存在）。
2. 删除 `fronted/src/App.js` 中 `askQuestion()` 的旧 fallback 实现（目前已优先走 manager，但仍保留旧代码）。
3. 将必要的依赖（如 `isLoading/historySort` 等动态数据）通过 `AskWorkflowManager.setDeps()` 更新，避免 manager 引用过期闭包。
4. 在 `ttsAudio.js` 中保留稳定播放策略（当前已改为“预缓冲+调度”），并补充关键 debug 日志开关（可选：按 localStorage flag 输出）。

## 验收标准

- `cd fronted; npm run build` 通过
- 场景验证：
  - 文本提问→流式回答→语音播报正常
  - 连续讲解模式可连续播放，多站切换无明显卡顿（允许轻微停顿）
  - “打断”按钮可立即停止当前播报并能继续提问

## 回滚策略

- 所有删除操作基于 git diff 可回滚；若出现回归，优先回滚到“删除前”的提交点再拆小排查。

