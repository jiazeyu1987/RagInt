文档：根含AGENTS、ARCHITECTURE；docs分设计、产品、生成、参考、计划。代码：backend为Flask，含api/services/orchestrators；fronted为React18，核心AppShell、hooks、managers、voice；compose编排redis/backend/fronted。

全局BDD约束：
- 涉及用户可见行为、接口契约、跨服务流程、回归敏感路径或验收标准不清的任务，先用Given/When/Then写出最小可观察场景，再进入测试和实现。
- BDD场景只描述业务结果和可观察行为，不写内部类名、临时实现、mock成功或隐式降级。
- 缺失前置条件、服务不可用、权限不足、数据不存在等失败路径必须在场景中明确暴露，遵循“无fallback、快速失败”策略。
- 已有任务目录时，BDD场景优先写入对应的prd/test-plan/execution-log；没有任务目录时，在答复或新建计划文档中先列场景。
- 纯重构且不改变行为时不强制使用BDD，但必须说明“不改变既有行为”的验证方式。
