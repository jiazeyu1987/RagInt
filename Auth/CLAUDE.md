# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Auth** is a standalone authentication and authorization system for managing knowledge base document uploads and reviews in the RagInt ecosystem. It provides a role-based access control (RBAC) system with JWT authentication and a document approval workflow.

**NOTE:** This codebase contains two backend implementations:
- `backend/` - Legacy Flask implementation (deprecated, uses Casbin)
- `new_backend/` - Current FastAPI + AuthX implementation (active)

**Always work with `new_backend/` unless specifically maintaining the legacy Flask backend.**

## Architecture Overview

```
Auth/
├── new_backend/     # FastAPI backend (port: 8001) - ACTIVE
│   ├── api/         # API endpoints (auth, users, knowledge, review, ragflow, user_kb_permissions)
│   ├── services/    # Business logic stores (user, kb, ragflow, user_kb_permission, deletion_log, download_log)
│   ├── core/        # Security (AuthX JWT), scopes configuration
│   ├── models/      # Pydantic models (user, document, auth)
│   ├── database/    # Database initialization
│   ├── data/        # SQLite database + uploads
│   ├── config.py    # Configuration (pydantic-settings)
│   ├── main.py      # FastAPI app factory
│   └── dependencies.py  # Dependency injection container
│
├── backend/         # Flask backend (DEPRECATED - uses Casbin)
│
└── fronted/         # React frontend (port: 3001)
    └── src/
        ├── pages/      # Page components (login, dashboard, users, documents, audit)
        ├── components/ # Reusable components (Layout, PermissionGuard)
        ├── hooks/      # React hooks (useAuth)
        └── api/        # API client (authClient)
```

## Development Commands

### Initial Setup

**Install Backend Dependencies:**
```bash
cd new_backend
pip install -r requirements.txt
```

**Install Frontend Dependencies:**
```bash
cd fronted
npm install
```

**Initialize Database:**
```bash
cd new_backend
python -m database.init_db
```

**Default Admin Credentials:**
- Username: `admin`
- Password: `admin123`

### Running the Application

**Start Backend (port 8001):**
```bash
cd new_backend
python -m main
# Or directly:
uvicorn main:app --reload --port 8001
```

**Start Frontend (port 3001):**
```bash
cd fronted
npm start
```

**Access the Application:**
- Frontend URL: http://localhost:3001
- Backend API: http://localhost:8001
- API Documentation: http://localhost:8001/docs
- Health Check: http://localhost:8001/health

### Building Frontend

```bash
cd fronted
npm run build
```

## Backend Architecture (FastAPI)

### Application Structure

The backend follows FastAPI best practices with lifespan-managed dependencies:

**Entry Points:**
- `new_backend/__main__.py` - Enables `python -m new_backend` execution
- `new_backend/main.py` - `create_app()` function that configures FastAPI app
- `new_backend/dependencies.py` - `create_dependencies()` creates dependency injection container

**Dependency Injection:**
```python
@dataclass
class AppDependencies:
    user_store: UserStore
    kb_store: KbStore
    ragflow_service: RagflowService
    user_kb_permission_store: UserKbPermissionStore
    deletion_log_store: DeletionLogStore
    download_log_store: DownloadLogStore
```

Dependencies are stored in `app.state.deps` and accessed via `get_deps()` function in each router.

### Router Organization

API endpoints are organized into domain-specific routers:

| Router | Purpose | Key Endpoints |
|-----------|---------|---------------|
| `api/auth.py` | Authentication | `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me` |
| `api/users.py` | User management | `/api/users` (CRUD) |
| `api/knowledge.py` | Document upload | `/api/knowledge/upload`, `/api/knowledge/documents`, `/api/knowledge/stats` |
| `api/review.py` | Document review | `/api/knowledge/documents/{id}/approve`, `/api/knowledge/documents/{id}/reject` |
| `api/ragflow.py` | RAGFlow integration | `/api/ragflow/datasets`, `/api/ragflow/documents`, `/api/ragflow/download` |
| `api/user_kb_permissions.py` | KB permissions | `/api/user-kb-permissions` |

All routers access dependencies via `Depends(get_deps)`.

### Authentication Layer

**AuthX Integration** (`core/security.py`):
- JWT-based authentication with access and refresh tokens
- Token storage in httpOnly cookies + Authorization header
- Access token expiration: 15 minutes
- Refresh token expiration: 7 days
- Token payload: `sub` (user_id), `scopes`, `exp`

**Scopes-based Authorization** (`core/scopes.py`):
- Scopes format: `resource:action` (e.g., `kb_documents:upload`)
- Wildcard support: `kb_documents:*` for all actions on a resource
- Scopes are assigned based on user role

**Token Endpoints:**
- `POST /api/auth/login` - Returns access_token and refresh_token, sets cookies
- `POST /api/auth/refresh` - Refresh access token using refresh token
- `POST /api/auth/logout` - Clears cookies
- `GET /api/auth/me` - Returns current user info with scopes

### Authorization Layer

**Role to Scopes Mapping** (`core/scopes.py`):

| Role | Scopes |
|------|-------------|
| `admin` | `users:*`, `kb_documents:*`, `ragflow_documents:*` |
| `reviewer` | `kb_documents:view`, `kb_documents:upload`, `kb_documents:review`, `kb_documents:approve`, `kb_documents:reject`, `kb_documents:delete`, `ragflow_documents:view`, `ragflow_documents:delete` |
| `operator` | `kb_documents:upload`, `ragflow_documents:view` |
| `viewer` | `ragflow_documents:view` |
| `guest` | `ragflow_documents:view` |

**Permission Checking:**
- Scopes are embedded in JWT tokens during login
- Backend validates scopes using AuthX's `@auth.required()` decorator
- Frontend receives scopes in login response and caches them

### Data Layer

**SQLite Database:** `new_backend/data/auth.db`

**Tables:**
- `users` - User accounts (user_id, username, password_hash, email, role, status, created_at_ms, last_login_at_ms, created_by)
- `kb_documents` - Knowledge base documents (doc_id, filename, file_path, file_size, mime_type, uploaded_by, status, uploaded_at_ms, reviewed_by, reviewed_at_ms, review_notes, ragflow_doc_id, kb_id)
- `user_kb_permissions` - Knowledge base access permissions (user_id, kb_id, granted_by, granted_at_ms)
- `deletion_logs` - Document deletion audit (doc_id, filename, kb_id, deleted_by, deleted_at_ms, original_uploader, original_reviewer, ragflow_doc_id)
- `download_logs` - Document download audit (doc_id, filename, downloaded_by, downloaded_at_ms)

**Data Stores** (Repository Pattern):
- `services/user_store.py` - User CRUD, password hashing (SHA256), login tracking
- `services/kb_store.py` - Document metadata, status tracking, statistics
- `services/ragflow_service.py` - RAGFlow API integration
- `services/user_kb_permission_store.py` - KB permission management
- `services/deletion_log_store.py` - Deletion audit logging
- `services/download_log_store.py` - Download audit logging

**Password Hashing:**
- SHA256 without salt (for simplicity)
- Function: `hashlib.sha256(password.encode()).hexdigest()`

### Security Features

- **Password Hashing:** SHA256
- **JWT Tokens:** Short-lived access tokens (15 min) + long-lived refresh tokens (7 days)
- **httpOnly Cookies:** Prevents XSS attacks on tokens
- **CORS:** Configurable origins (default: `*` for development)
- **File Validation:** Type whitelist (.txt, .pdf, .doc, .docx, .md), size limit (16MB)
- **Audit Logging:** Deletion and download logs for compliance

## Frontend Architecture

### React Router v6 Structure

**Entry Point:** `fronted/src/App.js` - Main routing with AuthProvider wrapper

**Routes:**
| Path | Component | Permission Required |
|------|-----------|---------------------|
| `/login` | `LoginPage` | None |
| `/` | `Dashboard` | None (shows stats based on permissions) |
| `/users` | `UserManagement` | `users:view` |
| `/upload` | `KnowledgeUpload` | `kb_documents:upload` |
| `/documents` | `DocumentReview` | `kb_documents:view` |
| `/browser` | `DocumentBrowser` | `ragflow_documents:view` |
| `/unauthorized` | `Unauthorized` | None |

### State Management

**Context API:**
- `AuthProvider` (context/AuthContext.js) - Provides authentication state
- `useAuth` hook - Manages login/logout, token storage, user data, permissions

**Permission System:**
- Permission caching to reduce API calls
- Helper methods: `isAdmin()`, `isReviewer()`, `isOperator()`, `hasPermission()`
- Automatic token refresh and logout on expiry

**Route Protection:**
- `PermissionGuard` component - HOC for protecting routes based on permissions
- Redirects to `/unauthorized` if permission check fails
- Supports both role-based and permission-based access control

### API Client

**authClient** (`src/api/authClient.js`):
Centralized API client with automatic authorization headers

**Methods:**
- Authentication: `login()`, `logout()`, `getCurrentUser()`
- User Management: `listUsers()`, `createUser()`, `updateUser()`, `deleteUser()`
- Documents: `uploadDocument()`, `listDocuments()`, `approveDocument()`, `rejectDocument()`
- RAGFlow: `listDatasets()`, `listDatasetDocuments()`, `downloadDocument()`, `downloadBatch()`

**Error Handling:**
- User-friendly error messages
- Automatic 401 redirect to login
- Confirmation dialogs for destructive actions

### Key Components

**Layout System:**
- `components/Layout.js` - Sidebar navigation with collapsible menu
- Dynamic navigation based on user permissions
- Responsive design with user info display

**Pages:**
- `pages/LoginPage.js` - Login form with error handling
- `pages/Dashboard.js` - Home with statistics and quick actions
- `pages/UserManagement.js` - User CRUD operations
- `pages/KnowledgeUpload.js` - Document upload with progress tracking
- `pages/DocumentReview.js` - Document approval/rejection workflow
- `pages/DocumentBrowser.js` - Browse RAGFlow documents

## Integration with RagInt

### RAGFlow Integration

The Auth system integrates with RAGFlow for knowledge base management:

**Ragflow Service** (`services/ragflow_service.py`):
- Uses `ragflow-sdk` for RAGFlow API calls
- Configuration from parent's `ragflow_demo/ragflow_config.json`
- Document synchronization between local review workflow and RAGFlow

**Document Workflow:**
1. User uploads document → Stored in `new_backend/data/uploads/`
2. Document marked as "pending" in local database
3. Reviewer approves/rejects document via review interface
4. Approved documents synced to RAGFlow knowledge base
5. Documents can be browsed and downloaded from RAGFlow
6. All deletions and downloads are logged for audit purposes

### Port Allocation

| Service | Port | Purpose |
|---------|------|---------|
| Auth Backend (FastAPI) | 8001 | Auth API |
| Auth Frontend | 3001 | Auth UI |
| RagInt Backend | 8000 | Main system API |
| RagInt Frontend | 3000 | Main system UI |

### Environment Configuration

**Frontend (.env):**
```
REACT_APP_AUTH_URL=http://localhost:8001
```

**Backend Configuration** (`new_backend/config.py`):
- All settings use pydantic-settings BaseSettings
- Database path: `data/auth.db` (relative to new_backend/)
- Upload directory: `data/uploads/`
- JWT secret, token expiration, CORS origins configurable via env vars
- Create `.env` file in `new_backend/` for production settings

## Common Development Tasks

### Adding a New API Endpoint

1. Create router file in `new_backend/api/your_feature.py`:
   ```python
   from fastapi import APIRouter, Depends
   from core.security import auth

   router = APIRouter()

   def get_deps(request: Request) -> AppDependencies:
       return request.app.state.deps

   @router.post("/api/your-endpoint")
   async def your_endpoint(
       request: Request,
       deps: AppDependencies = Depends(get_deps)
   ):
       # Access deps.user_store, deps.kb_store, etc.
       return {"ok": True}
   ```

2. Register in `new_backend/main.py:create_app()`:
   ```python
   from api import your_feature
   app.include_router(your_feature.router, prefix="/api", tags=["Your Feature"])
   ```

### Adding a New Scope

1. Update `core/scopes.py` ROLE_SCOPES dictionary:
   ```python
   ROLE_SCOPES: Dict[str, List[str]] = {
       "admin": ["your_resource:*", ...],
       "reviewer": ["your_resource:view", "your_resource:action"],
   }
   ```

2. Use scope-based access control in endpoints with AuthX decorators.

### Creating a New Frontend Page

1. Create page component in `fronted/src/pages/YourPage.js`
2. Add route in `fronted/src/App.js`:
   ```jsx
   <Route path="/yourpage" element={
     <PermissionGuard permission="your_resource:view">
       <YourPage />
     </PermissionGuard>
   } />
   ```
3. Add navigation link in `components/Layout.js` if needed

### Database Migration

**Migrations are in `new_backend/migrations/` directory:**
- Example: `migrations/migrate_user_kb_permissions.py`

**To run a migration:**
```bash
cd new_backend
python migrations/migrate_your_migration.py
```

**To create a new migration:**
1. Create Python script in `migrations/`
2. Connect to database using `sqlite3.connect(db_path)`
3. Execute ALTER TABLE or other SQL commands
4. Commit changes and close connection

## Database Initialization

**Initialization Script:** `new_backend/database/init_db.py`

Creates:
1. SQLite database with all tables
2. Default admin user (username: `admin`, password: `admin123`)
3. Required directories (data, uploads)

**Re-initialization:**
```bash
# Backup existing data first
cp new_backend/data/auth.db new_backend/data/auth.db.backup

# Re-run initialization
cd new_backend
python -m database.init_db
```

## Technology Stack

**Backend (FastAPI):**
- FastAPI >= 0.109.0 - Modern web framework
- Uvicorn >= 0.27.0 - ASGI server
- AuthX >= 1.2.0 - JWT authentication
- Pydantic >= 2.5.0 - Data validation
- pydantic-settings >= 2.1.0 - Configuration management
- ragflow-sdk >= 0.12.0 - RAGFlow integration
- python-multipart >= 0.0.6 - File upload support

**Frontend:**
- React 18.2.0 - UI framework
- React Router DOM 6.20.0 - Routing
- Axios 1.6.0 - HTTP client
- React Scripts 5.0.1 - Build tool

## File Naming Convention

**Important:** The frontend directory is `fronted/` (not `frontend/`) - maintain this naming convention throughout the codebase.

## Architecture Patterns

1. **FastAPI App Factory:** `create_app()` for application creation with lifespan context manager
2. **Dependency Injection:** `AppDependencies` container stored in `app.state.deps`
3. **Router Pattern:** FastAPI routers for modular API organization by domain
4. **Repository Pattern:** Data stores abstract database operations
5. **Pydantic Models:** Request/response validation with automatic OpenAPI docs
6. **Context API:** Centralized authentication state in React
7. **Custom Hooks:** Encapsulate business logic (useAuth)
8. **Scopes-based Authorization:** JWT tokens embed user scopes for stateless API authorization

## Security Considerations

- **JWT Access Tokens:** 15-minute expiration for security
- **JWT Refresh Tokens:** 7-day expiration for convenience
- **httpOnly Cookies:** Tokens stored in httpOnly cookies prevent XSS access
- **SHA256 Password Hashing:** No salt (simplicity trade-off)
- **CORS:** Configurable origins (default `*` for development)
- **File Validation:** Type whitelist and size limits
- **Audit Logging:** Deletion and download logs for compliance
- **Stateless Authorization:** Scopes embedded in JWT, no server-side session storage needed
