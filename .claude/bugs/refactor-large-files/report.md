# Bug Report: Large File Refactoring

## 基本信息
- **Bug ID**: refactor-large-files
- **严重程度**: Medium (代码质量问题，影响可维护性)
- **优先级**: High (技术债务积累，影响开发效率)
- **状态**: Fix (P0+P1+P2阶段完成，P3待进行)
- **创建时间**: 2025-12-10
- **报告人**: User

## 问题描述
代码库中存在多个超大文件，违反了单一职责原则，导致代码难以维护、测试和扩展。主要问题包括：

1. **前端超大组件** - MultiRoleDialogSystem.tsx (~2,500行)
2. **后端超大API文件** - app/api/knowledge_bases.py (~1,950行)
3. **后端超大服务文件** - ragflow_service.py (~1,580行), flow_engine_service.py (~1,550行)
4. **前端API客户端** - knowledgeApi.ts (~690行)
5. **对话界面组件** - ConversationInterface.tsx (~820行)

## 影响范围
- **前端**: 组件复杂度高，难以复用和测试
- **后端**: 职责混乱，违反SRP原则
- **整体**: 代码可维护性差，新人理解成本高

## 重构目标与验收标准

### 阶段1: MultiRoleDialogSystem.tsx 拆分
**目标**: 拆成"页面容器 + UI 组件 + hooks + service 层"
**验收标准**:
- [ ] 单个组件/文件不超过 ~300 行
- [ ] UI 组件与业务逻辑基本解耦（可在 Storybook 或独立渲染中复用）
- [ ] 页面行为通过 hooks/service 进行编排

### 阶段2: app/api/knowledge_bases.py 拆分
**目标**: 按资源边界划分模块（datasets, documents, indexes, settings等）
**验收标准**:
- [ ] 每个模块有独立的 serializer/schema 与 service
- [ ] API path 不变（向后兼容），只是内部调用重定向到新的 service
- [ ] 新旧逻辑在测试中表现一致（回归测试通过）

### 阶段3: 服务层拆分 (ragflow_service.py / flow_engine_service.py)
**目标**: 拆出"客户端封装 + 认证/重试 + 纯业务 orchestrator"
**验收标准**:
- [ ] HTTP/SDK 调用集中在 client 层，业务函数不直接操作底层请求
- [ ] 重试、超时、日志等横切逻辑统一封装

### 阶段4: 前端API和对话组件拆分
**目标**: 形成清晰的"前端 API 层 + 对话 UI 组件树 + 状态管理"结构
**验收标准**:
- [ ] API 方法按资源/功能分组，可独立 mock
- [ ] ConversationInterface.tsx 只负责布局 & 页面级状态，不直接堆业务细节

## 重构方法
1. **增量式重构**: 每次只完成一种"切割"（抽UI组件 → 抽hooks → 抽service）
2. **绞杀者模式**: 保持对外接口不变，内部增加新模块，逐步迁移
3. **依赖方向**: UI → hooks → service → client → infra，避免反向引用
4. **测试驱动**: 对每个抽离的单元加最小单元测试/集成测试

## 度量标准
- 单文件行数减少到300行以内
- 圈复杂度降低
- 测试覆盖率提升
- 代码重复率降低
- 构建时间优化

## 环境信息
- **项目**: Multi-Role Dialogue System (MRC)
- **技术栈**: React + TypeScript + Flask + SQLAlchemy
- **代码库大小**: 约50个主要文件

## 附件
- task/info1.txt - 详细的重构建议和操作指导

## 备注
这是技术债务清理工作，需要系统性地规划和执行。建议从MultiRoleDialogSystem.tsx开始，因为它是最常被修改的组件，拆分后能立即提升开发体验。