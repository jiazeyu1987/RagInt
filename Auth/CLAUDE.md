# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Auth** is a standalone authentication and authorization system for managing knowledge base document uploads and reviews in the RagInt ecosystem. It provides a role-based access control (RBAC) system with JWT authentication, Casbin authorization, and a document approval workflow.

## Architecture Overview

```
Auth/
├── backend/          # Flask backend (port: 8001)
│   ├── api/         # API endpoints (auth, users, knowledge, review, ragflow)
│   ├── services/    # Business logic stores (user, auth, kb, ragflow)
│   ├── infra/       # Infrastructure (JWT manager, Casbin enforcer)
│   ├── data/        # SQLite database + uploads + Casbin policies
│   ├── config/      # Casbin model configuration
│   └── scripts/     # Database initialization scripts
│
└── fronted/         # React frontend (port: 3001)
    └── src/
        ├── pages/      # Page components (login, dashboard, users, documents)
        ├── components/ # Reusable components (Layout, PermissionGuard)
        ├── hooks/      # React hooks (useAuth)
        └── api/        # API client (authClient)
```

## Development Commands

### Initial Setup

**Install Backend Dependencies:**
```bash
cd backend
pip install -r requirements.txt
```

**Install Frontend Dependencies:**
```bash
cd fronted
npm install
```

**Initialize Database:**
```bash
# From Auth/backend directory
python -m scripts.init_db

# Or from Auth root directory
python init_auth_db.py
```

**Default Admin Credentials:**
- Username: `admin`
- Password: `admin123`

### Running the Application

**Start Backend (port 8001):**
```bash
cd backend
python -m app
```

**Start Frontend (port 3001):**
```bash
cd fronted
npm start
```

**Access the Application:**
- Frontend URL: http://localhost:3001
- Backend API: http://localhost:8001
- Health Check: http://localhost:8001/health

### Building Frontend

```bash
cd fronted
npm run build
```

## Backend Architecture

### Application Factory Pattern

The backend follows Flask's application factory pattern with dependency injection:

**Entry Points:**
- `backend/__main__.py` - Enables `python -m backend` execution
- `backend/app.py` - `create_app()` function that configures Flask app
- `backend/app_deps.py` - `create_dependencies()` creates dependency injection container

**Dependency Injection:**
```python
@dataclass
class AppDependencies:
    user_store: UserStore
    auth_store: AuthStore
    kb_store: KbStore
    ragflow_service: RagflowService
    casbin_enforcer: CasbinEnforcer
    jwt_manager: JwtManager
```

### Blueprint Organization

API endpoints are organized into domain-specific blueprints:

| Blueprint | Purpose | Key Endpoints |
|-----------|---------|---------------|
| `api/auth.py` | Authentication | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/verify` |
| `api/users.py` | User management | `/api/users` (CRUD) |
| `api/knowledge.py` | Document upload | `/api/knowledge/upload`, `/api/knowledge/documents`, `/api/knowledge/stats` |
| `api/review.py` | Document review | `/api/knowledge/documents/{id}/approve`, `/api/knowledge/documents/{id}/reject` |
| `api/ragflow.py` | RAGFlow integration | `/api/ragflow/datasets`, `/api/ragflow/documents` |

All blueprints receive `deps` (AppDependencies) parameter via `create_blueprint(deps)` function.

### Authentication Layer

**JWT Manager** (`infra/jwt_manager.py`):
- HMAC-SHA256 signing algorithm
- 24-hour token expiration
- Token payload: `user_id`, `username`, `role`, `exp`
- Methods: `create_token()`, `verify_token()`, `decode_token()`

**Auth Store** (`services/auth_store.py`):
- Stores SHA256 hashes of tokens (not raw tokens for security)
- Session tracking with expiration and revocation
- Methods: `create_session()`, `validate_session()`, `revoke_session()`, `cleanup_expired()`

### Authorization Layer

**Casbin Enforcer** (`infra/casbin_enforcer.py`):
- RBAC with fine-grained permissions
- Model file: `config/casbin_model.conf`
- Policy file: `data/casbin_policy.csv`
- Permission format: `(subject, object, action)`
- Supports wildcards: `("*", "*", "*")` for admin

**User Roles:**
| Role | Permissions |
|------|-------------|
| `admin` | All permissions (wildcard) |
| `reviewer` | `kb_documents:approve`, `kb_documents:reject`, `kb_documents:view`, `users:view` |
| `operator` | `kb_documents:upload`, `kb_documents:view`, `kb_documents:delete` |
| `viewer` | `kb_documents:view` |
| `guest` | `kb_documents:view` |

**Authorization Decorators** (`api/decorators.py`):
- `@require_auth` - Validates JWT token and injects `current_user`
- `@require_role` - Role-based access control
- `@require_permission` - Fine-grained permission checking

### Data Layer

**SQLite Database:** `backend/data/auth.db`

**Tables:**
- `users` - User accounts (user_id, username, password_hash, email, role, status, timestamps)
- `user_sessions` - Session management (session_id, user_id, token_hash, expiration, revocation)
- `kb_documents` - Knowledge base documents (doc_id, filename, file_path, status, review info)
- `auth_audit` - Security audit logs

**Data Stores** (Repository Pattern):
- `services/user_store.py` - User CRUD, password hashing (SHA256), login tracking
- `services/auth_store.py` - Session management
- `services/kb_store.py` - Document metadata, status tracking
- `services/ragflow_service.py` - RAGFlow API integration

### Security Features

- **Password Hashing:** SHA256 with UUID4 salt
- **Token Storage:** SHA256 hashes only (never raw tokens)
- **Session Management:** Token revocation and expiration tracking
- **Casbin Authorization:** Policy-based access control
- **File Validation:** Type whitelist (.txt, .pdf, .doc, .docx, .md), size limit (16MB)
- **Audit Logging:** All authentication events logged

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
1. User uploads document → Stored in `backend/data/uploads/`
2. Document marked as "pending" in local database
3. Reviewer approves/rejects document via review interface
4. Approved documents synced to RAGFlow knowledge base
5. Documents can be browsed and downloaded from RAGFlow

### Port Allocation

| Service | Port | Purpose |
|---------|------|---------|
| Auth Backend | 8001 | Auth API |
| Auth Frontend | 3001 | Auth UI |
| RagInt Backend | 8000 | Main system API |
| RagInt Frontend | 3000 | Main system UI |

### Environment Configuration

**Frontend (.env):**
```
REACT_APP_AUTH_URL=http://localhost:8001
```

**Backend Configuration:**
- Database path: `backend/data/auth.db`
- Casbin model: `backend/config/casbin_model.conf`
- Casbin policy: `backend/data/casbin_policy.csv`
- Upload directory: `backend/data/uploads/`

## Common Development Tasks

### Adding a New API Endpoint

1. Create blueprint file in `backend/api/your_feature.py`:
   ```python
   from flask import Blueprint

   def create_blueprint(deps):
       bp = Blueprint("your_feature_api", __name__)

       @bp.route("/api/your_endpoint", methods=["POST"])
       @require_auth
       @require_permission("your_resource:action")
       def your_endpoint(current_user):
           return jsonify({"ok": True})

       return bp
   ```

2. Register in `backend/app.py:create_app()`:
   ```python
   from api.your_feature import create_blueprint as create_your_feature_blueprint
   app.register_blueprint(create_your_feature_blueprint(deps))
   ```

### Adding a New Permission

1. Add permission to Casbin policy: `backend/data/casbin_policy.csv`
2. Update `casbin_enforcer.py` to seed new permission on startup
3. Use `@require_permission("your_resource:action")` decorator in API

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

### Modifying Casbin Policy

Edit `backend/data/casbin_policy.csv`:
```csv
p, admin, *, *
p, reviewer, kb_documents, approve
p, reviewer, kb_documents, reject
g, alice, admin
```

**Policy Format:**
- `p, subject, object, action` - Permission definition
- `g, user, role` - Role assignment

## Database Initialization

**Initialization Script:** `backend/scripts/init_db.py`

Creates:
1. SQLite database with all tables
2. Default admin user (username: `admin`, password: `admin123`)
3. Casbin policies for all roles
4. Required directories (data, uploads)

**Re-initialization:**
```bash
# Backup existing data first
cp backend/data/auth.db backend/data/auth.db.backup

# Re-run initialization
python -m scripts.init_db
```

## Technology Stack

**Backend:**
- Flask 2.3.0 - Web framework
- Flask-CORS 4.0.0 - Cross-origin support
- casbin 1.34.0 - Authorization library
- casbin-sqlalchemy-adapter 1.0.0 - Casbin SQLAlchemy adapter
- PyJWT 2.8.0 - JWT token handling
- ragflow-sdk >= 0.12.0 - RAGFlow integration

**Frontend:**
- React 18.2.0 - UI framework
- React Router DOM 6.20.0 - Routing
- Axios 1.6.0 - HTTP client
- React Scripts 5.0.1 - Build tool

## File Naming Convention

**Important:** The frontend directory is `fronted/` (not `frontend/`) - maintain this naming convention throughout the codebase.

## Architecture Patterns

1. **Factory Pattern:** `create_app()` for Flask application creation
2. **Dependency Injection:** `AppDependencies` container for service management
3. **Blueprint Pattern:** Modular API organization by domain
4. **Repository Pattern:** Data stores abstract database operations
5. **Middleware Pattern:** Decorators for cross-cutting concerns (auth, permissions)
6. **Context API:** Centralized authentication state in React
7. **Custom Hooks:** Encapsulate business logic (useAuth)

## Security Considerations

- Tokens are stored as SHA256 hashes in the database (never raw tokens)
- Passwords use SHA256 with UUID4 salt
- JWT tokens expire after 24 hours
- Session revocation supported via token blacklist
- All API endpoints (except login) require authentication
- File uploads validated for type and size
- Audit logging for security compliance
