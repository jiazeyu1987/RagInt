# New User Onboarding

## 目标

让第一次接手 RagInt 的开发者或测试者，在不依赖口头说明的情况下完成以下事情：

- 知道前后端入口在哪里
- 知道系统有哪些主要模式
- 知道最小运行路径和最小验证路径

## 第一步：理解系统边界

- 后端在 `backend/`
- 前端在 `fronted/`
- 组合启动在 `docker-compose.yml`
- 本地一键启动入口在 `start_ragint.cmd`

## 第二步：理解三条核心体验

- 问答：文本或语音提问，后端流式返回答案，前端再接 TTS
- 导览：按站点与模板驱动连续讲解
- 录制/回放：将一次成功讲解保存为可重放资产

## 第三步：理解关键状态

- 导览断点：`breakpoints.db`
- 问答历史与缓存：`qa_history.db`
- 问答音频缓存：`qa_audio_cache.db`
- 导览控制：`tour_control.db`
- 运维台：`ops.db`
- 录制归档：`recordings.db` 和 `backend/data/recordings/`

## 第四步：最小验证

- 查看后端接口总览：`backend/openapi.json`
- 查看前端主编排：`fronted/src/app/AppShell.js`
- 查看运维与诊断接口：`backend/api/system.py`、`backend/api/ops.py`
- 查看自动化测试分布：`backend/tests/`、`fronted/e2e/`

## 常见误区

- `fronted/` 是当前实际前端目录名，不是笔误后的软链接。
- 问答、导览、录制、回放不是完全独立的应用，而是在同一 UI 与状态编排层里联动。
- 数据并不只在外部服务中，仓库内本地 SQLite 和音频目录本身就是系统事实的一部分。
