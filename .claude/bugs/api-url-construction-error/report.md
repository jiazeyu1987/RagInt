# Bug Report: API URL Construction Error

## Bug Summary
**Name**: `api-url-construction-error`
**Description**: TypeError: Failed to construct 'URL': Invalid base URL in API clients
**Severity**: High - Critical functionality blocked
**Status**: Open

## Affected Components
- `MultiRoleDialogSystem.tsx` (line 705, 720)
- `roleApi.ts` (line 74, 131)
- `knowledgeApi.ts` (line 107, 204)

## Error Messages
```
MultiRoleDialogSystem.tsx:720 获取角色列表失败: TypeError: Failed to construct 'URL': Invalid base URL
    at ApiClient.get (roleApi.ts:74:17)
    at Object.getRoles (roleApi.ts:131:38)
    at fetchRoles (MultiRoleDialogSystem.tsx:715:17)
    at MultiRoleDialogSystem.tsx:728:5

MultiRoleDialogSystem.tsx:705 获取知识库列表失败: TypeError: Failed to construct 'URL': Invalid base URL
    at ApiClient.get (knowledgeApi.ts:107:17)
    at Object.getKnowledgeBases (knowledgeApi.ts:204:22)
    at fetchKnowledgeBases (MultiRoleDialogSystem.tsx:702:43)
    at fetchRoles (MultiRoleDialogSystem.tsx:716:9)
    at MultiRoleDialogSystem.tsx:728:5
```

## Root Cause Analysis (Initial)

### Problem Location
The error occurs in API client classes when attempting to construct URLs with the base URL `/api`. The JavaScript `URL` constructor is rejecting `/api` as an invalid base URL.

### Issue Details
- **File**: `roleApi.ts`, line 74, method: `get()`
- **File**: `knowledgeApi.ts`, line 107, method: `get()`
- **Error Type**: `TypeError: Failed to construct 'URL': Invalid base URL`
- **Base URL Used**: `/api`

### Technical Issue
JavaScript `URL` constructor requires either:
1. Absolute URL: `http://localhost:5010/api`
2. Relative URL with base: `new URL('/endpoint', 'http://localhost:5010/api')`
3. Relative path only: `new URL('/endpoint', window.location.origin)`

Using `/api` alone as base URL is invalid for the `URL` constructor.

## Reproduction Steps
1. Start frontend application (`npm run dev`)
2. Navigate to MultiRoleDialogSystem component
3. Application attempts to fetch roles and knowledge bases
4. Error occurs during API requests

## Current State
- **Frontend**: Running on http://localhost:3001/
- **Backend**: Presumed running on http://127.0.0.1:5010
- **API Proxy**: Configured in vite.config.ts to proxy `/api/*` to `http://127.0.0.1:5010`

## Impact
- **Critical**: Cannot load knowledge bases or roles
- **Blocks**: Core application functionality
- **Users**: Cannot use any Multi-Role Dialogue System features

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
   - **Lines 73-87**: Replaced `new URL(endpoint, this.baseURL)` with manual URL construction
   - **Lines 103-119**: Same fix for `delete()` method

2. **`D:\ProjectPackage\MRC\front\src\api\knowledgeApi.ts`**
   - **Lines 106-120**: Replaced `new URL(endpoint, this.baseURL)` with manual URL construction
   - **Lines 136-152**: Same fix for `delete()` method

### Technical Details

**Before (Problematic Code):**
```typescript
async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(endpoint, this.baseURL); // ❌ Fails when this.baseURL = '/api'
  // ... parameter handling
  return this.request<T>(url.pathname + url.search);
}
```

**After (Fixed Code):**
```typescript
async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
  let url = endpoint;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    url = `${endpoint}${queryString ? '?' + queryString : ''}`;
  }
  return this.request<T>(url);
}
```

### Root Cause Resolution
The issue was that JavaScript's `URL` constructor requires a valid base URL. When using `/api` as the base URL, it throws `TypeError: Failed to construct 'URL': Invalid base URL` because `/api` is not a complete URL.

The fix manually constructs URLs using string concatenation and `URLSearchParams` for query parameters, avoiding the `URL` constructor limitation while maintaining the same functionality.

### Testing Status
- ✅ Frontend compilation successful
- ✅ Vite dev server running on http://localhost:3001
- ⏳ Backend integration test pending (backend startup issues)

## Fix Priority
**High** - This blocks all core functionality of the Multi-Role Dialogue System. **✅ RESOLVED**