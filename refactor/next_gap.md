# Next Gap（上线后下一阶段缺口清单）

范围说明：不包含硬件采购/阵列麦克风选型/机器人外观统一/采购策略（数量>N 自研、数量<N 外采）等纯硬件或采购决策项；仅列软件系统侧仍缺失或仅做到 MVP 的部分。

## P0（必须补齐，才能“可上线可交接”）

### 1) 设备与权限（多设备/多实例）
- 目标：支持“多机器人/多场景/多操作者”的最小权限闭环；避免任意人可下发运维指令。
- 缺口：
  - 设备身份：device_id 可信校验（签名/预共享 key/证书）与注册流程
  - 租户/项目/场地维度隔离（至少 project_id）
  - 运维鉴权：`RAGINT_OPS_TOKEN` 仅是单一 token，缺少角色/权限粒度（只读/运维/发布）
  - 审计：谁在什么时间对什么设备下发了什么配置/升级指令
- 建议落地：
  - 后端新增：设备注册表 + token/签名校验 + RBAC（最小：viewer/operator/admin）
  - OpenAPI：补齐 `/api/ops/*` schema + auth header 约束说明
  - 最小 UI：`/ops` 页面增加登录/切换项目/设备分组
- 验收（示例）：
  - `pytest -q backend/tests/test_ops_*`
  - 未带 token 的写操作返回 401；带 token 成功并写入审计表

### 2) 远程升级闭环（“升级包 + 下发 + 进度 + 回滚”）
- 目标：现场可控升级，失败可回退。
- 缺口：
  - 仅有 `scripts/package_release.py` 打包与回滚说明；无“下发/执行/进度/失败原因/回滚触发”闭环
  - 无升级前检查（磁盘/端口/依赖/版本兼容）
  - 无升级包签名/校验（防篡改）
- 建议落地：
  - 增加 `/api/ops/upgrade/*`：创建升级任务、查询进度、取消/回滚
  - Agent/端侧执行器：拉取升级包、校验 sha256、灰度切换、失败回滚
  - 统一版本展示：UI + `/api/version` + 设备上报 version 对齐
- 验收（示例）：
  - `pytest -q backend/tests/test_ops_upgrade_*`
  - 通过模拟升级任务状态机：queued/running/succeeded/failed/rolled_back

### 3) 端到端回归脚本（可回归）
- 目标：交付给多人维护时，有可复现的回归步骤和脚本。
- 缺口：
  - 当前是单元/接口级 pytest + 前端 build；缺少端到端“核心流程回归”
- 建议落地：
  - 新增 `scripts/regression_smoke.ps1`（或 python）：覆盖
    - `/api/ask` SSE 基本链路（mock ragflow）
    - TTS/ASR 基本链路（mock provider）
    - 导览模板/个性化计划、控场命令、断点恢复
  - CI 增加 smoke job
- 验收（示例）：
  - `scripts/regression_smoke.ps1` 输出 `OK` 并给出耗时汇总

## P1（强烈建议，显著降低现场风险）

### 1) 真正的“语音唤醒”端侧能力
- 目标：不依赖手工点击/文本输入，支持稳定唤醒+抗噪。
- 缺口：
  - 目前为“软件 wake-word 检测/链路”，不等同阵列麦/端侧唤醒（AEC/NS/AGC/热词/声学模型）
- 建议落地：
  - 抽象 `WakeWordProvider`：支持端侧 SDK/云端/Mock
  - 唤醒后录音窗口、取消语、噪声门限自适应
- 验收：
  - Provider contract 测试 + 录音窗口/冷却策略回归

### 2) 导航/展柜切换的生产级对接
- 目标：语音/面板指令与真实导航系统一致、可观测、可恢复。
- 缺口：
  - 需要与底盘/导航服务协议对齐：到点确认、超时、避障失败、重试/人工接管
- 建议落地：
  - 统一 `NavProvider` contract + 状态机（moving/arrived/failed/cancelled）
  - `/api/events` 记录导航关键状态，诊断包可导出

### 3) 内容治理扩展到“讲解脚本/站点内容/KB”
- 目标：内容系统与能力系统解耦，支持编辑-审核-发布-回滚。
- 缺口：
  - 当前只对“卖点库”做了分级与审核流 MVP
- 建议落地：
  - 引入 CMS 表：tour templates / stops / prompts / kb index meta
  - 发布后生成 `kb_version` 与回放对齐

## P2（优化项/体验项）

### 1) 安全合规增强
- 目标：更可控的敏感策略与告警。
- 缺口：
  - 已有敏感词黑名单拦截，但缺少告警渠道与审计联动
- 建议落地：
  - 将 safety 事件写入审计表 + 可配置告警（webhook/邮件/企业微信）
  - 增加“内容分级 + 权限”联动（internal/sensitive 需要授权）

### 2) 多人协作维护体验
- 目标：新同事/第三方接手成本低。
- 建议落地：
  - 补齐 OpenAPI schema（目前部分 endpoints 仅有 description）
  - 增加 devcontainer / 统一 Makefile/Taskfile
  - 增强日志结构化（request_id/client_id/device_id 贯穿）

## 当前仓库已具备（作为基线能力）
- 导览：20 分钟档位、基础/个性化模式、语音指令导览、卖点 TopN 注入
- 断点：站点/状态持久化
- QA：KB version 对齐、缓存命中与回写、敏感词黑名单拦截
- 运维：版本号、诊断包、Dockerfile + docker-compose、MVP ops（设备心跳/配置下发/简易控制台 `/ops`）
- 可验证：pytest（`backend/tests`）+ 前端 build

