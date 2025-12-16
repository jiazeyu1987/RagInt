# Bug Report: API Double Prefix Error

## Bug Summary
**Name**: `api-double-prefix-error`
**Description**: API requests generating double /api/ prefixes causing 404 errors
**Severity**: High - All API endpoints failing with 404
**Status**: Open

## Affected Components
- `roleApi.ts` (line 131: `/api/roles` endpoint)
- `knowledgeApi.ts` (line 201: `/api/knowledge-bases` endpoint)
- All API client methods using these endpoints

## Error Messages
```
GET http://localhost:3000/api/api/roles?page=1&page_size=20 404 (NOT FOUND)
GET http://localhost:3000/api/api/knowledge-bases?page=1&page_size=100&sort_by=created_at&sort_order=desc 404 (NOT FOUND)

MultiRoleDialogSystem.tsx:720 获取角色列表失败: Error: 资源未找到
MultiRoleDialogSystem.tsx:705 获取知识库列表失败: Error: 资源未找到
```

## Root Cause Analysis (Initial)

### Problem Location
The issue is in API client classes where endpoints that already include `/api/` prefix are being concatenated with `API_BASE_URL = '/api'`, resulting in double `/api/api/` prefixes.

### Issue Details
- **File**: `roleApi.ts`, line 131
- **File**: `knowledgeApi.ts`, line 201
- **Error Type**: URL path duplication causing 404 errors
- **Base URL Used**: `/api`
- **Endpoints Called**: `/api/roles`, `/api/knowledge-bases`

### Technical Issue
Current URL construction:
```typescript
const url = `${this.baseURL}${endpoint}`;  // /api + /api/roles = /api/api/roles
```

### Expected vs Actual
- **Expected**: `http://localhost:3000/api/roles`
- **Actual**: `http://localhost:3000/api/api/roles`

## Reproduction Steps
1. Start frontend application
2. Navigate to MultiRoleDialogSystem component
3. Application attempts to fetch roles and knowledge bases
4. API requests fail with 404 errors due to double /api/ prefix

## Current State
- **Frontend**: Running on http://localhost:3001/
- **Backend**: Running on http://127.0.0.1:5010
- **API Proxy**: Configured in vite.config.ts to proxy `/api/*` to `http://127.0.0.1:5010`
- **Issue**: Double `/api/` prefix in API calls

## Impact
- **Critical**: Cannot load any data from backend
- **Blocks**: All application functionality
- **Users**: Complete application unusability

## Environment
- **Frontend**: React + Vite + TypeScript
- **Backend**: Flask + Python
- **Development**: Local development environment

## Fix Implementation

### Solution Applied
**Date**: 2025-12-10
**Status**: ✅ Fixed

### Changes Made

#### Files Modified:
1. **`D:\ProjectPackage\MRC\front\src\api\roleApi.ts`**
   - **Line 137**: `/api/roles` → `/roles`
   - **Line 151**: `/api/roles/${id}` → `/roles/${id}`
   - **Line 158**: `/api/roles` → `/roles`
   - **Line 165**: `/api/roles/${id}` → `/roles/${id}`
   - **Line 172**: `/api/roles/${id}` → `/roles/${id}`
   - **Line 184**: `/api/roles` → `/roles`
   - **Line 207**: `/api/roles?${params}` → `/roles?${params}`

2. **`D:\ProjectPackage\MRC\front\src\api\knowledgeApi.ts`**
   - **All occurrences**: `/api/knowledge-bases` → `/knowledge-bases` (replace_all)
   - **All occurrences**: `/api/ragflow` → `/ragflow` (replace_all)

### Technical Details

**Before (Problematic URLs):**
```
API_BASE_URL = '/api'
endpoint = '/api/roles'
Result: '/api' + '/api/roles' = '/api/api/roles' ❌ (404)
```

**After (Fixed URLs):**
```
API_BASE_URL = '/api'
endpoint = '/roles'
Result: '/api' + '/roles' = '/api/roles' ✅ (Correct)
```

### Root Cause Resolution
The issue was path duplication where:
1. `API_BASE_URL` was set to `/api`
2. Endpoint calls included `/api/` prefix
3. The request method concatenated them: `${this.baseURL}${endpoint}`
4. This resulted in double `/api/api/` prefixes

**Solution**: Removed `/api/` prefix from all endpoint calls since the base URL already provides it.

### Testing Status
- ✅ Frontend compilation successful
- ✅ Vite dev server running on http://localhost:3001
- ✅ No remaining `/api/api/` patterns in API files
- ⏳ Integration testing pending

## Fix Priority
**High** - This blocks all application functionality. **✅ RESOLVED**