# Bug Report: step_execution_logs table missing

## Basic Information

- **Bug Name**: step-execution-logs-table-missing
- **Severity**: High (blocking flow execution)
- **Report Date**: 2025-12-11
- **Environment**: Development (localhost:3000/5010)
- **Reporter**: System

## Error Details

### Error Message
```
执行步骤失败: This Session's transaction has been rolled back due to a previous exception during flush. To begin a new transaction with this Session, first issue Session.rollback(). Original exception was: (sqlite3.OperationalError) no such table: step_execution_logs
```

### SQL Error
```
[SQL: INSERT INTO step_execution_logs (session_id, step_id, parent_log_id, execution_order, round_index, loop_iteration, attempt_count, status, result_type, result_data, condition_evaluation, loop_check_result, error_message, duration_ms, memory_usage_mb, created_at, started_at, completed_at, step_snapshot, context_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)]
```

### HTTP Status
- **Status**: 400 BAD REQUEST
- **Endpoint**: `POST /api/sessions/51/run-next-step`
- **Error Code**: `FLOW_EXECUTION_ERROR`

## Reproduction Steps

1. Start a session (Session ID: 51)
2. Enable auto mode and auto execution
3. Attempt to execute next step
4. System tries to insert into `step_execution_logs` table
5. Database throws "no such table" error
6. Transaction rolls back, causing flow execution failure

## Current Behavior

- Flow execution fails completely when trying to log step execution
- SQLAlchemy transaction becomes unusable after error
- Frontend shows repeated 400 errors
- Auto mode continues attempting steps but all fail

## Expected Behavior

- Step execution should be logged successfully
- Flow should continue normally
- Step execution logs should be tracked for debugging

## Context

The error occurs in the FlowEngineService when attempting to create step execution logs. This suggests the `step_execution_logs` table exists in the model definition but not in the actual database schema, indicating a missing database migration.

## Impact Assessment

- **Severity**: High - Blocks all flow execution
- **Scope**: Affects all sessions with step execution logging
- **Frequency**: Consistent - Every step execution attempt fails

## Technical Details

### Stack Trace
```
at ApiClient.request (roleApi.ts:27:23)
at async Object.executeNextStep (sessionApi.ts:59:22)
at async handleNextStep (SessionTheater.tsx:81:22)
at async executeNextStepWithAuto (SessionTheater.tsx:144:7)
```

### Database Context
- **Database Type**: SQLite
- **Table Missing**: `step_execution_logs`
- **Expected Columns**: 20 columns including session_id, step_id, etc.

### Backend Context
- **Service**: FlowEngineService
- **Operation**: Step execution logging
- **Model**: `StepExecutionLog`

## Related Files/Components

- `backend/app/models/step_execution_log.py` - Model definition
- `backend/app/services/flow_engine_service.py` - Service using the table
- `front/src/api/sessionApi.ts` - API endpoint caller
- `front/src/components/SessionTheater.tsx` - Frontend component

## Environment Information

- **Frontend**: React/Vite on port 3000
- **Backend**: Flask on port 5010
- **Database**: SQLite
- **Browser Error**: Console shows repeated 400 errors

## Possible Root Causes

1. **Missing Migration**: Database migration for step_execution_logs table not applied
2. **Migration Failure**: Migration exists but failed to execute
3. **Model Definition**: Model exists but table creation was skipped
4. **Database State**: Database was reset/recreated after model addition

## Attachments

### Full Error Message
```
API Error: {message: "执行步骤失败: This Session's transaction has been rolled back due to a previous exception during flush. To begin a new transaction with this Session, first issue Session.rollback(). Original exception was: (sqlite3.OperationalError) no such table: step_execution_logs\n[SQL: INSERT INTO step_execution_logs (session_id, step_id, parent_log_id, execution_order, round_index, loop_iteration, attempt_count, status, result_type, result_data, condition_evaluation, loop_check_result, error_message, duration_ms, memory_usage_mb, created_at, started_at, completed_at, step_snapshot, context_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)]\n[parameters: (51, 21, None, 1, 1, 0, 1, 'completed', 'success', None, None, None, None, None, None, '2025-12-11 10:03:16.210626', None, None, None, None)]\n(Background on this error at: https://sqlalche.me/e/14/e3q8) (Background on this error at: https://sqlalche.me/e/14/7s2a)", code: 'FLOW_EXECUTION_ERROR', status: 400, details: undefined}
```