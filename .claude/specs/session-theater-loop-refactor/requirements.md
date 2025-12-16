# Requirements Document

## Introduction

This specification defines the refactoring of the session theater loop logic in the Multi-Role Dialogue System (MRC). The current implementation has issues where loop counting relies on session-level rounds rather than per-step iteration counts, leading to infinite loops when certain task types are absent from loop segments. This refactoring will ensure reliable loop execution that matches user expectations while maintaining backward compatibility.

## Alignment with Product Vision

This feature supports the product vision of creating reliable, predictable multi-role conversation environments. By fixing infinite loop issues and ensuring loop configurations work as expected, we enhance system reliability, user trust, and conversation flow predictability. This enables conversation designers to create robust automated dialogues that consistently complete within expected parameters.

## Requirements

### Requirement 1: Accurate Loop Counting

**User Story:** As a conversation designer, I want to configure maximum loop counts that are reliably enforced, so that conversations don't get stuck in infinite loops.

#### Acceptance Criteria

1. WHEN a flow with steps 1 → 2 → 3 → 4, where step 3 has `next_step_order=2` and `max_loops=2` is executed in automatic mode THEN the execution sequence shall be: 1, 2, 3, 2, 3, 4, regardless of task types in steps 2 and 3
2. IF any flow configuration with loop logic is executed THEN the system shall not execute loop steps more times than configured in `max_loops`
3. WHEN a loop segment that has reached its `max_loops` limit determines the next step THEN the system shall proceed to the next sequential step if one exists

### Requirement 2: Loop Logic Independence

**User Story:** As a system administrator, I want loop logic to work regardless of the task types in loop segments, so that I can create reliable conversation flows.

#### Acceptance Criteria

1. WHEN loop segments without `summarize` or `conclude` task types are executed THEN loop counting shall still function correctly
2. IF loop counting is implemented THEN it shall not depend on session-level `current_round` increments
3. WHEN `max_loops` configuration is evaluated THEN it shall be based on actual step execution iterations, not conversation rounds

### Requirement 3: Execution Tracking and Debugging

**User Story:** As a developer, I want to track loop iterations through execution logs, so that I can debug flow execution issues.

#### Acceptance Criteria

1. WHEN a flow with loop segments is executed THEN each step execution shall create appropriate `StepExecutionLog` records with `loop_iteration` values
2. IF loop iterations are tracked THEN the system shall maintain separate loop iteration counts for each step that has loop logic configured
3. WHEN execution logs are queried THEN loop iteration information shall be accurately persisted and retrievable

### Requirement 4: System Integration and Compatibility

**User Story:** As a user, I want conversations to progress naturally after loop segments complete, so that I can complete full conversation scenarios.

#### Acceptance Criteria

1. WHEN existing flow configurations created before this refactor are executed THEN they shall continue to function with improved loop behavior
2. IF existing frontend code calls step execution APIs THEN the interfaces and response formats shall remain unchanged
3. WHEN users configure loop settings in existing interfaces THEN the configuration process shall remain the same
4. WHEN loop segments complete successfully THEN conversations shall continue to subsequent steps naturally

### Requirement 5: Performance and Reliability

**User Story:** As a system operator, I want visibility into loop execution status, so that I can monitor conversation flow health.

#### Acceptance Criteria

1. WHEN loop counting is implemented THEN it shall not significantly impact step execution performance
2. IF loop iteration counts are maintained THEN they shall be accurately persisted and not lost
3. WHEN the system handles edge cases THEN it shall prevent infinite loops under all circumstances
4. IF loop execution fails or encounters errors THEN the system shall provide appropriate error handling and recovery

## Non-Functional Requirements

### Performance
- Loop counting shall not add more than 5% overhead to step execution time
- Database queries for loop iteration tracking shall be optimized with proper indexing
- Memory usage for loop state management shall remain minimal

### Security
- Loop counting logic shall not introduce any new security vulnerabilities
- Access to execution logs with loop information shall follow existing authorization patterns
- Loop configuration validation shall prevent malicious infinite loop attempts

### Reliability
- The system shall maintain loop state consistency across session failures
- Loop iteration counts shall be accurate even under concurrent access scenarios
- Graceful degradation shall occur if loop tracking encounters issues

### Usability
- Loop behavior shall match user expectations without requiring configuration changes
- Error messages for loop-related issues shall be clear and actionable
- Debug information for loop execution shall be accessible to developers