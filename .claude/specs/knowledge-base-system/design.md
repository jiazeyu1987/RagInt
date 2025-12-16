# Design Document - Knowledge Base System

## Overview

The Knowledge Base System extends the Multi-Role Dialogue System (MRC) with RAGFlow integration capabilities. This design provides a comprehensive architecture for managing external knowledge bases, conducting test conversations, and integrating knowledge retrieval into multi-role dialogues. The system follows existing MRC patterns while adding new external service integration capabilities.

The implementation consists of:
- **Frontend**: New tab interface in the main MRC application with knowledge base management UI
- **Backend**: RAGFlow integration service, knowledge base models, and API endpoints
- **Integration**: Connection between knowledge bases and existing role/flow systems

## Steering Document Alignment

### Technical Standards
Since no formal tech.md or structure.md documents exist, this design follows the established patterns from the existing codebase:
- **Frontend**: React + TypeScript with Tailwind CSS, following existing component patterns
- **Backend**: Flask + SQLAlchemy with service layer architecture
- **API**: RESTful endpoints following existing resource patterns
- **Database**: SQLite with migration support following existing model patterns

### Project Structure Conventions
The implementation follows the observed MRC structure:
- **Frontend components** in `front/src/` with consistent naming patterns
- **Backend services** in `backend/app/services/` with business logic separation
- **API resources** in `backend/app/api/` with Flask-RESTful patterns
- **Models** in `backend/app/models/` with SQLAlchemy conventions

## Code Reuse Analysis

### Existing Components to Leverage
- **`MultiRoleDialogSystem.tsx`**: Extend navigation system with new knowledge base tab
- **API Client Patterns**: Follow `roleApi.ts` patterns for RAGFlow API integration
- **Theme System**: Use existing `theme.tsx` for consistent UI styling
- **Error Handling**: Leverage `errorHandler.ts` for comprehensive error management
- **Service Architecture**: Follow `role_service.py` patterns for business logic
- **Database Models**: Use `Role.py` patterns for SQLAlchemy model implementation

### Integration Points
- **Navigation System**: Add knowledge base tab to existing tab navigation
- **API Registration**: Register new endpoints in `app/__init__.py`
- **Configuration Management**: Extend `.env` system for RAGFlow settings
- **Monitoring Integration**: Add RAGFlow API calls to existing monitoring systems
- **Role System Enhancement**: Extend role models to support knowledge base associations

## Architecture

```mermaid
graph TD
    subgraph "Frontend Layer"
        A[MRC Main App] --> B[Knowledge Base Tab]
        B --> C[KnowledgeBaseManagement Component]
        C --> D[KnowledgeBaseList Component]
        C --> E[KnowledgeBaseDetails Component]
        C --> F[TestConversation Component]
    end

    subgraph "API Layer"
        G[Vite Proxy] --> H[Knowledge Base API Endpoints]
        H --> I[/api/knowledge_bases]
        H --> J[/api/knowledge-bases/:id/test]
    end

    subgraph "Service Layer"
        I --> K[KnowledgeBaseService]
        J --> K
        K --> L[RAGFlowService]
        K --> M[CacheService Extended]
        K --> N[MonitoringService Integration]
    end

    subgraph "External Services"
        L --> O[RAGFlow Instance]
        O --> P[Dataset Management]
        O --> Q[Chat Assistant API]
        O --> R[Document Retrieval]
    end

    subgraph "Data Layer"
        K --> S[KnowledgeBase Model]
        K --> T[KnowledgeBaseConversation Model]
        K --> U[RoleKnowledgeBase Junction]
        S --> V[SQLite Database]
        T --> V
        U --> V
        W[Existing Role Model] --> U
    end

    subgraph "Integration Points"
        X[Existing Flow Engine] --> Y[Knowledge Base Context Retrieval]
        Y --> K
        Z[Existing Role Management] --> AA[Role-Knowledge Base Integration]
        AA --> K
        BB[Existing LLM Service] --> CC[Enhanced with Knowledge Context]
        CC --> X
    end

    subgraph "Support Services"
        M --> DD[Redis/File Cache]
        N --> EE[Health Monitoring]
        FF[Configuration Manager] --> L
        GG[Error Handler] --> K
    end

    C --> G
    F --> H
```

## Components and Interfaces

### Frontend Components

#### Component 1: KnowledgeBaseManagement
- **Purpose**: Main knowledge base interface component
- **File**: `front/src/components/KnowledgeBaseManagement.tsx`
- **Interfaces**: Props for theme configuration and error handling
- **Dependencies**: React hooks, knowledge base API client, theme context
- **Reuses**: Existing tab structure patterns, theme system, error handling

#### Component 2: KnowledgeBaseList
- **Purpose**: Display and manage list of RAGFlow datasets
- **File**: `front/src/components/KnowledgeBaseList.tsx`
- **Interfaces**: Props for dataset list and selection handling
- **Dependencies**: Knowledge base types, API client
- **Reuses**: List component patterns from role management, loading states

#### Component 3: KnowledgeBaseDetails
- **Purpose**: Show detailed information about selected knowledge base
- **File**: `front/src/components/KnowledgeBaseDetails.tsx`
- **Interfaces**: Props for dataset details and statistics
- **Dependencies**: Knowledge base types, theme context
- **Reuses**: Detail view patterns, statistics display components

#### Component 4: TestConversation
- **Purpose**: Interface for testing conversations with knowledge bases
- **File**: `front/src/components/TestConversation.tsx`
- **Interfaces**: Props for conversation state and message handling
- **Dependencies**: WebSocket or streaming support, message history
- **Reuses**: Chat interface patterns, message display components

### Backend Services

#### Service 1: KnowledgeBaseService
- **Purpose**: Business logic for knowledge base management
- **File**: `backend/app/services/knowledge_base_service.py`
- **Interfaces**: Methods for CRUD operations, caching, and validation
- **Dependencies**: RAGFlow service, cache service, database models
- **Reuses**: Service layer patterns from `role_service.py`

#### Service 2: RAGFlowService
- **Purpose**: External RAGFlow API integration
- **File**: `backend/app/services/ragflow_service.py`
- **Interfaces**: Dataset management, chat assistant integration, document retrieval
- **Dependencies**: RAGFlow SDK, HTTP client, configuration
- **Reuses**: External service patterns from existing LLM integration

#### Service 3: CacheService (Extended)
- **Purpose**: Performance optimization for knowledge base data
- **File**: `backend/app/services/cache_service.py` (extend existing)
- **Interfaces**: Caching methods for dataset lists and conversation history
- **Dependencies**: Redis or file-based caching system
- **Reuses**: Existing cache service architecture

### API Resources

#### Resource 1: KnowledgeBaseList
- **Purpose**: RESTful endpoint for knowledge base collection operations
- **File**: `backend/app/api/knowledge_bases.py`
- **Interfaces**: GET for listing, POST for refresh operations
- **Dependencies**: KnowledgeBaseService, request validation
- **Reuses**: Flask-RESTful patterns from existing API resources

#### Resource 2: KnowledgeBaseDetail
- **Purpose**: RESTful endpoint for individual knowledge base operations
- **File**: `backend/app/api/knowledge_bases.py`
- **Interfaces**: GET for details, POST for test conversations
- **Dependencies**: KnowledgeBaseService, RAGFlowService
- **Reuses**: Detail resource patterns from role/flow APIs

## Data Models

### Model 1: KnowledgeBase
**File**: `backend/app/models/knowledge_base.py`

```python
class KnowledgeBase(db.Model):
    __tablename__ = 'knowledge_bases'

    id = db.Column(db.Integer, primary_key=True)
    ragflow_dataset_id = db.Column(db.String(100), nullable=False, unique=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    document_count = db.Column(db.Integer, default=0)
    total_size = db.Column(db.BigInteger, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_sync_at = db.Column(db.DateTime)
    status = db.Column(db.String(20), default='active')  # active, error, syncing

    # Relationships
    roles = db.relationship('Role', secondary='role_knowledge_bases', back_populates='knowledge_bases')
    conversations = db.relationship('KnowledgeBaseConversation', backref='knowledge_base', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'ragflow_dataset_id': self.ragflow_dataset_id,
            'name': self.name,
            'description': self.description,
            'document_count': self.document_count,
            'total_size': self.total_size,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'last_sync_at': self.last_sync_at.isoformat() if self.last_sync_at else None,
            'status': self.status
        }
```

### Model 2: KnowledgeBaseConversation
**File**: `backend/app/models/knowledge_base_conversation.py`

```python
class KnowledgeBaseConversation(db.Model):
    __tablename__ = 'knowledge_base_conversations'

    id = db.Column(db.Integer, primary_key=True)
    knowledge_base_id = db.Column(db.Integer, db.ForeignKey('knowledge_bases.id'), nullable=False)
    session_id = db.Column(db.String(100), nullable=False)
    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    references = db.Column(db.JSON)  # Store RAGFlow references
    confidence_score = db.Column(db.Float)
    response_time_ms = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'question': self.question,
            'answer': self.answer,
            'references': self.references,
            'confidence_score': self.confidence_score,
            'response_time_ms': self.response_time_ms,
            'created_at': self.created_at.isoformat()
        }
```

### Model 3: RoleKnowledgeBase (Junction Table)
**File**: `backend/app/models/role_knowledge_base.py`

```python
class RoleKnowledgeBase(db.Model):
    __tablename__ = 'role_knowledge_bases'

    id = db.Column(db.Integer, primary_key=True)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    knowledge_base_id = db.Column(db.Integer, db.ForeignKey('knowledge_bases.id'), nullable=False)
    priority = db.Column(db.Integer, default=1)
    retrieval_config = db.Column(db.JSON)  # RAGFlow retrieval configuration
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    role = db.relationship('Role', back_populates='knowledge_bases')
    knowledge_base = db.relationship('KnowledgeBase', back_populates='roles')
```

### TypeScript Interfaces (Frontend)
**File**: `front/src/types/knowledge.ts`

```typescript
export interface KnowledgeBase {
  id: number;
  ragflow_dataset_id: string;
  name: string;
  description?: string;
  document_count: number;
  total_size: number;
  created_at: string;
  updated_at: string;
  last_sync_at?: string;
  status: 'active' | 'error' | 'syncing';
}

export interface KnowledgeBaseConversation {
  id: number;
  session_id: string;
  question: string;
  answer: string;
  references?: Reference[];
  confidence_score?: number;
  response_time_ms?: number;
  created_at: string;
}

export interface Reference {
  document_name: string;
  page_number?: number;
  similarity_score: number;
  content_snippet: string;
}

export interface TestConversationRequest {
  knowledge_base_id: number;
  question: string;
  session_id?: string;
  retrieval_config?: RetrievalConfig;
}

export interface RetrievalConfig {
  top_k?: number;
  similarity_threshold?: number;
  rerank?: boolean;
}
```

## Error Handling

### Error Scenarios

1. **RAGFlow API Unavailable**
   - **Handling**: Implement retry mechanism with exponential backoff (max 3 attempts), integrate with existing monitoring system for failure tracking
   - **User Impact**: Display error message with retry option and connection status indicator in the knowledge base interface

2. **Invalid RAGFlow Configuration**
   - **Handling**: Validate configuration on startup using existing configuration validation patterns, provide setup guidance through system settings
   - **User Impact**: Show configuration wizard with step-by-step instructions and validation feedback

3. **Dataset Not Found**
   - **Handling**: Refresh knowledge base list and remove stale entries, log removal events for audit purposes
   - **User Impact**: Display "Dataset no longer available" message with automatic refresh option

4. **Conversation Timeouts**
   - **Handling**: Implement 30-second timeout with cancellation option using existing timeout patterns from LLM services
   - **User Impact**: Show timeout message with ability to retry or modify question, maintain conversation context

5. **Large Response Handling**
   - **Handling**: Implement streaming for long responses using existing WebSocket patterns, pagination for conversation history
   - **User Impact**: Display streaming responses with option to stop generation, maintain responsive UI

6. **Database Connection Failures**
   - **Handling**: Use existing database error handling patterns, implement connection pooling and retry logic
   - **User Impact**: Show "Service temporarily unavailable" message with automatic retry

## Testing Strategy

### Unit Testing
- Test RAGFlow service integration with mock responses using existing test patterns from `simple_test.py`
- Validate knowledge base model operations and relationships following SQLAlchemy testing patterns
- Test API endpoints with various request scenarios using Flask testing framework
- Verify error handling and retry mechanisms with controlled failure scenarios
- Test configuration validation and security measures

### Integration Testing
- Test complete knowledge base discovery workflow with real RAGFlow instance
- Validate test conversation functionality with streaming and error recovery
- Test role-knowledge base integration in conversation execution with existing flow engine
- Verify configuration management and validation using existing configuration systems
- Test caching mechanisms and performance optimization features

### End-to-End Testing
- Test complete user journey from knowledge base discovery to conversation integration
- Validate error scenarios and recovery paths including API failures and timeouts
- Test performance under load with multiple concurrent users (target: 10 datasets loading within 10 seconds)
- Verify responsive design across different screen sizes following existing theme patterns
- Test knowledge base integration with existing multi-role conversation flows

## Database Migration Strategy

### Phase 1: New Tables Creation
```python
# Migration: add_knowledge_base_tables.py
def upgrade():
    # Create knowledge_bases table
    op.create_table('knowledge_bases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ragflow_dataset_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('document_count', sa.Integer(), nullable=True),
        sa.Column('total_size', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ragflow_dataset_id')
    )

    # Create junction table
    op.create_table('role_knowledge_bases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=False),
        sa.Column('knowledge_base_id', sa.Integer(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=True),
        sa.Column('retrieval_config', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['knowledge_base_id'], ['knowledge_bases.id']),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id']),
        sa.PrimaryKeyConstraint('id')
    )
```

### Phase 2: Extend Existing Role Model
```python
# Add to existing Role model in backend/app/models/role.py
class Role(db.Model):
    # ... existing fields ...

    # New relationships
    knowledge_bases = db.relationship('KnowledgeBase', secondary='role_knowledge_bases', back_populates='roles')
```

## Performance Considerations

### Caching Strategy (15-minute cache requirement)
- Cache knowledge base list for 15 minutes with manual refresh capability (meets Requirement 1.5)
- Cache conversation history during user session using existing session patterns
- Implement RAGFlow response caching for identical queries with TTL
- Cache RAGFlow configuration status and connection validation results

### Optimization Techniques
- Implement lazy loading for conversation history following existing pagination patterns
- Use virtual scrolling for large knowledge base lists (target: 100+ datasets)
- Optimize RAGFlow API calls with request batching and connection pooling
- Implement database query optimization with proper indexing on ragflow_dataset_id and role_id

## Security Implementation

### Credential Storage
- RAGFlow API credentials stored in environment variables following existing .env patterns
- Implement encryption for sensitive configuration data using existing security utilities
- Add audit logging for all knowledge base operations following existing logging patterns

### Access Control
- Leverage existing user authentication and authorization systems
- Implement role-based access control for knowledge base management
- Validate all user inputs using existing validation patterns before sending to RAGFlow APIs

## API Integration Details

### Response Format Alignment
```python
# Following existing API response patterns from roles.py
{
    'success': True,
    'data': {
        'knowledge_bases': [...],
        'total': 10,
        'page': 1,
        'page_size': 20
    }
}

# Error response format
{
    'success': False,
    'error_code': 'RAGFLOW_CONNECTION_ERROR',
    'message': 'Unable to connect to RAGFlow instance',
    'details': 'Connection timeout after 30 seconds'
}
```

### Error Code Standards
- `RAGFLOW_CONNECTION_ERROR`: RAGFlow API unavailable
- `DATASET_NOT_FOUND`: Requested dataset no longer exists
- `INVALID_CONFIGURATION`: RAGFlow configuration validation failed
- `CONVERSATION_TIMEOUT`: Test conversation exceeded timeout limit