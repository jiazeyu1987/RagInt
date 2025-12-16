# Implementation Plan

## Task Overview
This implementation plan breaks down the session theater loop logic refactor into atomic, agent-friendly tasks that can be executed sequentially to implement per-step loop counting while maintaining full backward compatibility.

## Steering Document Compliance
The tasks follow existing project structure patterns in `backend/app/services/`, leverage current database models, and maintain API compatibility as established in the project conventions.

## Atomic Task Requirements
**Each task must meet these criteria for optimal agent execution:**
- **File Scope**: Touches 1-3 related files maximum
- **Time Boxing**: Completable in 15-30 minutes
- **Single Purpose**: One testable outcome per task
- **Specific Files**: Must specify exact files to create/modify
- **Agent-Friendly**: Clear input/output with minimal context switching

## Task Format Guidelines
- Use checkbox format: `- [ ] Task number. Task description`
- **Specify files**: Always include exact file paths to create/modify
- **Include implementation details** as bullet points
- Reference requirements using: `_Requirements: X.Y, Z.A_`
- Reference existing code to leverage using: `_Leverage: path/to/file.ts, path/to/component.tsx_`
- Focus only on coding tasks (no deployment, user testing, etc.)
- **Avoid broad terms**: No "system", "integration", "complete" in task titles

## Good vs Bad Task Examples
❌ **Bad Examples (Too Broad)**:
- "Implement authentication system" (affects many files, multiple purposes)
- "Add user management features" (vague scope, no file specification)
- "Build complete dashboard" (too large, multiple components)

✅ **Good Examples (Atomic)**:
- "Create User model in models/user.py with email/password fields"
- "Add password hashing utility in utils/auth.py using bcrypt"
- "Create LoginForm component in components/LoginForm.tsx with email/password inputs"

## Tasks

- [ ] 1. Add loop iteration counting utility in FlowEngineService
  - File: backend/app/services/flow_engine_service.py
  - Add static method `_get_step_loop_iteration(session, step)` for StepExecutionLog-based counting
  - Implement database query to count existing executions for given session_id and step_id
  - Add optional Session JSON caching support for performance
  - Purpose: Provide accurate per-step loop iteration counting
  - _Leverage: existing FlowEngineService structure, StepExecutionLog model_
  - _Requirements: 1.1, 1.2, 3.1, 3.2_

- [ ] 2. Create LoopConfig dataclass in FlowEngineService
  - File: backend/app/services/flow_engine_service.py (add to top of file)
  - Define LoopConfig dataclass with next_step_order, max_loops, and loop_mode fields
  - Add class methods: from_step(), is_loop_configured(), should_continue_loop()
  - Add validation for loop configuration parameters
  - Purpose: Centralize loop configuration parsing and validation
  - _Leverage: existing dataclass patterns in service files_
  - _Requirements: 1.1, 2.1, 2.2, 2.3_

- [ ] 3. Enhance StepExecutionLog model with loop utility methods
  - File: backend/app/models/step_execution_log.py
  - Add class method `get_step_iteration_count(session_id, step_id)` for efficient counting
  - Enhance `is_loop_iteration()` method to better distinguish initial vs loop executions
  - Add constants for loop-related result_type values ('loop_continue', 'loop_break')
  - Purpose: Provide database-level support for accurate loop counting
  - _Leverage: existing StepExecutionLog model structure, SQLAlchemy patterns_
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Refactor _determine_next_step_v2 loop logic in FlowEngineService
  - File: backend/app/services/flow_engine_service.py (modify existing method)
  - Replace session.current_round-based loop checking with _get_step_loop_iteration() calls
  - Implement LoopConfig.from_step() to extract loop parameters
  - Add loop_mode support for backward compatibility with round-based counting
  - Purpose: Enable per-step loop counting while preserving legacy behavior
  - _Leverage: existing _determine_next_step_v2() method, new LoopConfig dataclass_
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 4.1_

- [ ] 5. Enhance execute_next_step with loop tracking
  - File: backend/app/services/flow_engine_service.py (modify existing method)
  - Add StepExecutionLog creation with proper loop_iteration values after message creation
  - Set result_type to 'loop_continue' or 'loop_break' based on next step determination
  - Maintain existing session update logic with new loop-aware state
  - Purpose: Ensure comprehensive loop execution tracking
  - _Leverage: existing execute_next_step() method, enhanced StepExecutionLog model_
  - _Requirements: 3.1, 3.2, 5.1, 5.2_

- [ ] 6. Add loop status to API response structure
  - File: backend/app/api/sessions.py (modify SessionExecution.post() method)
  - Enhance execution_info.flow_logic_applied with executed_loops, max_loops_reached fields
  - Add loop_mode and max_loops to response for frontend visibility
  - Maintain backward compatibility of response structure
  - Purpose: Provide loop status information to frontend components
  - _Leverage: existing API response patterns, ExecutionInfo structure_
  - _Requirements: 4.2, 5.1, 5.3_

- [ ] 7. Create loop iteration counting unit tests
  - File: tests/services/test_flow_engine_loop_logic.py (create new file)
  - Test _get_step_loop_iteration() with various database states and edge cases
  - Create mock StepExecutionLog data for different iteration scenarios
  - Validate counting accuracy with empty logs, single entries, multiple iterations
  - Purpose: Ensure loop counting logic reliability and correctness
  - _Leverage: existing test patterns, test utilities, and fixtures_
  - _Requirements: 1.1, 1.2, 3.1, 3.2_

- [ ] 8. Create LoopConfig parsing unit tests
  - File: tests/services/test_flow_engine_loop_logic.py (continue from task 7)
  - Test LoopConfig.from_step() with various logic_config JSON structures
  - Test validation of invalid next_step_order and max_loops values
  - Test is_loop_configured() and should_continue_loop() methods
  - Purpose: Validate loop configuration parsing and edge case handling
  - _Leverage: existing test patterns, FlowEngineService test utilities_
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 9. Create next step determination unit tests
  - File: tests/services/test_flow_engine_loop_logic.py (continue from task 8)
  - Test _determine_next_step_v2() with iteration vs round mode switching
  - Test loop entry, continuation, and exit scenarios with different max_loops values
  - Test boundary conditions: max_loops=0, max_loops=1, invalid next_step_order
  - Purpose: Validate loop decision logic in all scenarios
  - _Leverage: existing test patterns, FlowEngineService test utilities_
  - _Requirements: 1.1, 1.2, 1.3, 4.1_

- [ ] 10. Create basic loop execution API integration test
  - File: tests/api/test_session_loop_integration.py (create new file)
  - Test single loop segment execution using POST /api/sessions/{id}/run-next-step
  - Validate response structure includes executed_loops and max_loops_reached fields
  - Test loop exit behavior when max_loops is reached
  - Purpose: Ensure basic loop logic works in full API context
  - _Leverage: existing API test patterns, session management utilities_
  - _Requirements: 1.1, 1.3, 4.2, 4.3_

- [ ] 11. Create loop execution database query performance test
  - File: tests/performance/test_loop_counting_performance.py (create new file)
  - Test StepExecutionLog query performance with large execution histories (1000+ records)
  - Measure query execution time for get_step_iteration_count() method
  - Validate database query performance remains under 100ms threshold
  - Purpose: Ensure loop counting queries are performant at scale
  - _Leverage: existing performance testing patterns, database benchmarks_
  - _Requirements: 5.1, 5.2_

- [ ] 12. Add loop status display to SessionTheater frontend component
  - File: front/src/components/SessionTheater.tsx (modify existing component)
  - Add display of loop iteration count when execution_info includes loop data
  - Show "Loop X/Y" or similar indicator for loop segments
  - Enhance debug panel with loop execution details
  - Purpose: Provide users with visibility into loop execution status
  - _Leverage: existing SessionTheater component structure, round display logic_
  - _Requirements: 4.2, 5.3, 5.4_

- [ ] 13. Update TypeScript interfaces for enhanced API responses
  - File: front/src/api/sessionApi.ts (modify existing interfaces)
  - Update ExecutionInfo interface to include loop-specific fields
  - Add types for executed_loops, max_loops_reached, loop_mode
  - Ensure backward compatibility with existing response handling
  - Purpose: Provide TypeScript support for enhanced loop API responses
  - _Leverage: existing API interface patterns, TypeScript conventions_
  - _Requirements: 4.2, 4.3_

- [ ] 14. Add database index optimization for StepExecutionLog
  - File: backend/app/models/step_execution_log.py (enhance existing)
  - Add database index on (session_id, step_id) for efficient loop counting
  - Optimize get_step_iteration_count() query with proper indexing hints
  - Add query performance monitoring and logging
  - Purpose: Ensure loop counting queries are performant at scale
  - _Leverage: existing database optimization patterns, SQLAlchemy index definitions_
  - _Requirements: 5.1, 5.2_

- [ ] 15. Add loop error handling in FlowEngineService
  - File: backend/app/services/flow_engine_service.py (enhance existing error handling)
  - Add graceful handling for invalid next_step_order configurations
  - Add recovery logic for database query failures during loop counting
  - Add logging for loop-related errors and warnings
  - Purpose: Ensure robust error handling in loop execution scenarios
  - _Leverage: existing error handling patterns, logging infrastructure_
  - _Requirements: 5.3, 5.4_

## Implementation Notes

### Task Dependencies
- Tasks 1-6 must be completed before testing tasks 7-10
- Frontend tasks 12-13 depend on backend tasks 1-6
- Performance task 11 depends on core implementation (tasks 1-6)
- Database optimization task 14 depends on StepExecutionLog enhancements (task 3)
- Error handling task 15 depends on core implementation (tasks 1-6)

### Testing Strategy
- Each implementation task should include corresponding test updates
- Run existing test suite after each task to ensure no regressions
- Performance validation should be done after core implementation (tasks 1-6)

### Risk Mitigation
- Implement legacy mode first to ensure backward compatibility
- Add comprehensive logging before deploying to production
- Use feature flags for gradual rollout of new loop counting logic