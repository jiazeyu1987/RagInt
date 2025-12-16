# Design Document - Knowledge Base Document Management

## Overview

This feature extends the existing knowledge base system in the Multi-Role Dialogue System (MRC) to provide comprehensive document management capabilities. The design builds upon the existing RAGFlow integration, service layer architecture, and React component patterns to add document upload, processing, management, and retrieval functionality above the existing test conversation interface. The implementation leverages the existing KnowledgeBase model, KnowledgeBaseDetails component, and knowledge_base_service.py architecture while introducing new document-specific components and services.

## Steering Document Alignment

### Technical Standards (tech.md)
The design follows established MRC technical patterns:
- **Service Layer Pattern**: Extends existing `knowledge_base_service.py` and `ragflow_service.py` with new document-specific services
- **Database Patterns**: Uses existing SQLAlchemy models and migration scripts for new document tables
- **API Architecture**: Follows RESTful patterns established in `knowledge_bases.py` with consistent error handling
- **Frontend Architecture**: Builds on existing React components with TypeScript interfaces and Tailwind CSS styling
- **Error Handling**: Utilizes existing error utilities and RAGFlow API error patterns

### Project Structure (structure.md)
The implementation respects existing project organization:
- **Backend Models**: New models in `backend/app/models/` following existing naming conventions
- **Backend Services**: New services in `backend/app/services/` extending existing patterns
- **Backend API**: New endpoints in `backend/app/api/knowledge_bases.py` maintaining RESTful structure
- **Frontend Components**: New components in `front/src/components/` following existing patterns
- **Frontend API Client**: Extensions to `front/src/api/knowledgeApi.ts` maintaining consistent interfaces

## Code Reuse Analysis

### Existing Components to Leverage
- **KnowledgeBaseDetails.tsx**: Will be extended with document management tabs above test conversation
- **TestConversation.tsx**: Enhanced to show document references and chunk details
- **knowledgeApi.ts**: Extended with document management methods following existing patterns
- **knowledge_base_service.py**: Extended with document operations and RAGFlow integration
- **ragflow_service.py**: Enhanced with document upload, parsing, and chunk retrieval methods
- **Theme System**: Existing Tailwind CSS theme system and Lucide React icons
- **Error Handling**: Existing error utilities and user feedback patterns

### Integration Points
- **KnowledgeBase Model**: Extended with document relationships and statistics
- **RAGFlow API Integration**: Leverages existing authentication and API patterns for document operations
- **Database Schema**: New tables with foreign key relationships to existing knowledge_base table
- **API Endpoints**: New routes under existing `/api/knowledge-bases/{id}/` structure
- **Component State Management**: Extends existing React state patterns with document-specific state

## Architecture

The document management feature follows a layered architecture that integrates seamlessly with the existing MRC system:

```mermaid
graph TD
    A[Frontend Components] --> B[API Layer]
    B --> C[Service Layer]
    C --> D[Database Layer]
    C --> E[RAGFlow API]

    subgraph "Frontend Layer"
        A1[KnowledgeBaseDetails]
        A2[DocumentUpload]
        A3[DocumentList]
        A4[DocumentView]
        A5[TestConversation Enhanced]
        A --> A1
        A1 --> A2
        A1 --> A3
        A1 --> A4
        A1 --> A5
    end

    subgraph "Backend API Layer"
        B1[knowledge_bases.py Extended]
        B2[File Upload Endpoints]
        B3[Document Management Endpoints]
        B --> B1
        B1 --> B2
        B1 --> B3
    end

    subgraph "Service Layer"
        C1[knowledge_base_service.py Extended]
        C2[document_service.py New]
        C3[upload_service.py New]
        C4[chunk_service.py New]
        C5[ragflow_service.py Enhanced]
        C --> C1
        C1 --> C2
        C1 --> C3
        C1 --> C4
        C1 --> C5
    end

    subgraph "Data Layer"
        D1[SQLite Database]
        D2[KnowledgeBase Model]
        D3[Document Model New]
        D4[DocumentChunk Model New]
        D --> D1
        D1 --> D2
        D1 --> D3
        D1 --> D4
    end

    subgraph "External Services"
        E1[RAGFlow Document API]
        E2[RAGFlow Chat API]
        E3[RAGFlow Retrieval API]
        E --> E1
        E --> E2
        E --> E3
    end
```

### Component Architecture Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as KnowledgeBaseDetails
    participant API as DocumentAPI
    participant DS as DocumentService
    participant RFS as RAGFlowService
    participant DB as Database
    participant RF as RAGFlow API

    U->>UI: Select Knowledge Base
    UI->>API: GET /api/knowledge-bases/{id}/documents
    API->>DS: get_documents(knowledge_base_id)
    DS->>DB: Query Document table
    DB-->>DS: Document list
    DS-->>API: Document data
    API-->>UI: Document list response
    UI-->>U: Display document management interface

    U->>UI: Upload document
    UI->>API: POST /api/knowledge-bases/{id}/documents/upload
    API->>DS: upload_document(file, knowledge_base_id)
    DS->>RFS: upload_to_ragflow(file, dataset_id)
    RFS->>RF: POST /datasets/{id}/documents
    RF-->>RFS: Document created
    RFS-->>DS: RAGFlow document_id
    DS->>DB: Save document record
    DS->>RFS: parse_document(document_id)
    RFS->>RF: POST /documents/{id}/parse
    RF-->>RFS: Parse initiated
    DS-->>API: Upload response
    API-->>UI: Document status
    UI-->>U: Show upload progress and status
```

## Components and Interfaces

### Backend Components

#### DocumentService (backend/app/services/document_service.py)
- **Purpose**: Core document management operations and lifecycle management
- **Interfaces**:
  - `get_documents(knowledge_base_id, filters)` - Retrieve document list with filtering
  - `get_document(document_id)` - Get single document details
  - `delete_document(document_id)` - Remove document from system and RAGFlow
  - `update_document_status(document_id, status)` - Update processing status
  - `sync_with_ragflow(knowledge_base_id)` - Sync documents with RAGFlow dataset
- **Dependencies**: SQLAlchemy models, RAGFlowService, CacheService
- **Reuses**: Existing database session patterns from knowledge_base_service.py, existing error handling utilities

#### UploadService (backend/app/services/upload_service.py)
- **Purpose**: Handle file upload operations with validation and progress tracking
- **Interfaces**:
  - `validate_file(file)` - Validate file type, size, and security
  - `process_upload(file, knowledge_base_id)` - Process file upload with progress tracking
  - `get_upload_status(upload_id)` - Get upload progress and status
- **Dependencies**: Flask file handling, validation utilities, security middleware
- **Reuses**: Existing file validation patterns, security middleware, error handling

#### ChunkService (backend/app/services/chunk_service.py)
- **Purpose**: Manage document chunk retrieval and search operations
- **Interfaces**:
  - `search_chunks(knowledge_base_id, query, filters)` - Search document chunks
  - `get_document_chunks(document_id)` - Get all chunks for a document
  - `get_chunk_details(chunk_id)` - Get detailed chunk information
- **Dependencies**: RAGFlowService, DocumentService, CacheService
- **Reuses**: Existing caching patterns, RAGFlow API integration, search utilities

#### Enhanced RAGFlowService (backend/app/services/ragflow_service.py)
- **Purpose**: Extended RAGFlow integration for document operations
- **New Interfaces**:
  - `upload_document(dataset_id, file)` - Upload file to RAGFlow dataset
  - `parse_document(document_id)` - Trigger document parsing
  - `get_document_chunks(document_id)` - Retrieve processed chunks
  - `delete_document(document_id)` - Remove document from RAGFlow
  - `search_chunks(dataset_id, query)` - Search within document chunks
- **Dependencies**: Existing RAGFlow client, authentication utilities
- **Reuses**: Existing RAGFlow authentication, error handling, retry mechanisms

### Frontend Components

#### DocumentUpload (front/src/components/DocumentUpload.tsx)
- **Purpose**: File upload interface with drag-and-drop and progress tracking
- **Interfaces**:
  - `onFileSelect(files: File[])` - Handle file selection
  - `onUploadProgress(progress: number)` - Display upload progress
  - `onUploadComplete(document: Document)` - Handle successful upload
- **Dependencies**: knowledgeApi, existing UI components, theme system
- **Reuses**: Existing button components, progress indicators, error handling patterns

#### DocumentList (front/src/components/DocumentList.tsx)
- **Purpose**: Document listing with search, filtering, and pagination
- **Interfaces**:
  - `documents: Document[]` - Document data array
  - `onDocumentSelect(document: Document)` - Handle document selection
  - `onDocumentDelete(document: Document)` - Handle document deletion
- **Dependencies**: knowledgeApi, existing list components, search utilities
- **Reuses**: Existing table/list components, pagination patterns, search functionality

#### DocumentView (front/src/components/DocumentView.tsx)
- **Purpose**: Detailed document view with chunk visualization and management
- **Interfaces**:
  - `document: Document` - Document details
  - `chunks: DocumentChunk[]` - Document chunks
  - `onChunkAction(chunk: DocumentChunk, action: string)` - Handle chunk operations
- **Dependencies**: knowledgeApi, existing modal components, visualization utilities
- **Reuses**: Existing modal patterns, detail view layouts, action button components

#### Enhanced KnowledgeBaseDetails (front/src/components/KnowledgeBaseDetails.tsx)
- **Purpose**: Extended knowledge base details with document management tabs
- **Modifications**:
  - Add document management tab above test conversation
  - Integrate document upload, list, and view components
  - Enhance statistics with document metrics
  - Add document-related actions and status indicators
- **Reuses**: Existing tab system, statistics cards, layout patterns, theme system

#### Enhanced TestConversation (front/src/components/TestConversation.tsx)
- **Purpose**: Enhanced test conversation with document references and chunk details
- **Modifications**:
  - Display document references alongside responses
  - Add clickable links to view contributing chunks
  - Highlight specific content used in responses
  - Handle missing document references gracefully
- **Reuses**: Existing conversation display, message formatting, reference handling

### API Client Extensions (front/src/api/knowledgeApi.ts)

#### New Document Management Methods
- `getDocuments(knowledgeBaseId: string, filters?: DocumentFilters): Promise<DocumentList>`
- `uploadDocument(knowledgeBaseId: string, file: File): Promise<UploadResponse>`
- `deleteDocument(knowledgeBaseId: string, documentId: string): Promise<void>`
- `getDocumentChunks(documentId: string): Promise<DocumentChunk[]>`
- `searchChunks(knowledgeBaseId: string, query: string, filters?: ChunkSearchFilters): Promise<ChunkSearchResult>`

## Data Models

### Document Model (backend/app/models/document.py)

```python
class Document(db.Model):
    __tablename__ = 'documents'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    knowledge_base_id = db.Column(db.String(36), db.ForeignKey('knowledge_bases.id'), nullable=False)
    ragflow_document_id = db.Column(db.String(255), nullable=True)  # RAGFlow document ID
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    file_type = db.Column(db.String(50), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    upload_status = db.Column(db.String(20), default='uploading')  # uploading, uploaded, failed
    processing_status = db.Column(db.String(20), default='pending')  # pending, processing, completed, failed
    chunk_count = db.Column(db.Integer, default=0)
    error_message = db.Column(db.Text, nullable=True)
    ragflow_metadata = db.Column(db.JSON, nullable=True)  # RAGFlow response metadata

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    uploaded_at = db.Column(db.DateTime, nullable=True)
    processed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    knowledge_base = db.relationship('KnowledgeBase', backref='documents')
    chunks = db.relationship('DocumentChunk', backref='document', cascade='all, delete-orphan')
    processing_logs = db.relationship('ProcessingLog', backref='document', cascade='all, delete-orphan')
```

### DocumentChunk Model (backend/app/models/document_chunk.py)

```python
class DocumentChunk(db.Model):
    __tablename__ = 'document_chunks'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = db.Column(db.String(36), db.ForeignKey('documents.id'), nullable=False)
    ragflow_chunk_id = db.Column(db.String(255), nullable=True)  # RAGFlow chunk ID
    chunk_index = db.Column(db.Integer, nullable=False)
    content = db.Column(db.Text, nullable=False)
    content_preview = db.Column(db.String(500), nullable=True)  # Preview for list views
    word_count = db.Column(db.Integer, default=0)
    character_count = db.Column(db.Integer, default=0)

    # Metadata from RAGFlow
    ragflow_metadata = db.Column(db.JSON, nullable=True)  # RAGFlow chunk metadata
    embedding_vector_id = db.Column(db.String(255), nullable=True)  # RAGFlow embedding reference
    position_start = db.Column(db.Integer, nullable=True)  # Position in document
    position_end = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    references = db.relationship('ChunkReference', backref='chunk', cascade='all, delete-orphan')
```

### ProcessingLog Model (backend/app/models/processing_log.py)

```python
class ProcessingLog(db.Model):
    __tablename__ = 'processing_logs'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = db.Column(db.String(36), db.ForeignKey('documents.id'), nullable=False)
    step = db.Column(db.String(50), nullable=False)  # upload, parse, chunk, index
    status = db.Column(db.String(20), nullable=False)  # pending, running, completed, failed
    progress = db.Column(db.Integer, default=0)  # 0-100 percentage
    message = db.Column(db.Text, nullable=True)
    error_details = db.Column(db.JSON, nullable=True)

    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    document = db.relationship('Document', backref='logs')
```

### TypeScript Interfaces (front/src/types/document.ts)

```typescript
export interface Document {
  id: string;
  knowledgeBaseId: string;
  ragflowDocumentId?: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  fileType: string;
  mimeType: string;
  uploadStatus: 'uploading' | 'uploaded' | 'failed';
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  errorMessage?: string;
  ragflowMetadata?: Record<string, any>;

  createdAt: string;
  updatedAt: string;
  uploadedAt?: string;
  processedAt?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  ragflowChunkId?: string;
  chunkIndex: number;
  content: string;
  contentPreview?: string;
  wordCount: number;
  characterCount: number;

  ragflowMetadata?: Record<string, any>;
  embeddingVectorId?: string;
  positionStart?: number;
  positionEnd?: number;

  createdAt: string;
  updatedAt: string;
}

export interface DocumentFilters {
  search?: string;
  status?: string;
  fileType?: string;
  sortBy?: 'filename' | 'uploadDate' | 'fileSize' | 'status';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ChunkSearchFilters {
  documentId?: string;
  minRelevanceScore?: number;
  maxResults?: number;
}

export interface ChunkSearchResult {
  chunks: DocumentChunk[];
  totalCount: number;
  searchTime: number;
  query: string;
}

export interface UploadResponse {
  documentId: string;
  uploadId: string;
  status: 'started' | 'processing' | 'completed' | 'failed';
  message?: string;
}
```

## Error Handling and Recovery

### Error Scenarios

#### 1. File Upload Errors
- **Scenario**: Invalid file type or size (>50MB)
  - **Handling**: Client-side validation using existing security middleware, server-side validation as fallback
  - **User Impact**: Clear error message with supported formats (PDF, DOC, DOCX, TXT, MD, HTML) and size limits
  - **Retry Strategy**: Immediate feedback, allow re-upload with different file

#### 2. RAGFlow Service Unavailable
- **Scenario**: RAGFlow API timeout or connection failure
  - **Handling**: Queue operations with existing retry patterns from ragflow_service.py, display service status
  - **User Impact**: Graceful degradation with clear status indicators, retry buttons
  - **Retry Strategy**: Exponential backoff (1s, 2s, 4s, 8s, 16s) up to 3 attempts

#### 3. Document Processing Failures
- **Scenario**: Document parsing fails due to corrupted file or unsupported content
  - **Handling**: Detailed error logging with ProcessingLog model, user notification with RAGFlow error details
  - **User Impact**: Clear error message with suggested actions (re-upload, format conversion)
  - **Retry Strategy**: Automatic retry up to 3 times with 30-second intervals

#### 4. Storage Limit Exceeded
- **Scenario**: Knowledge base exceeds storage limits
  - **Handling**: Pre-upload validation using existing knowledge_base_service.py patterns
  - **User Impact**: Clear notification with storage usage and management options
  - **Retry Strategy**: Allow upload after cleanup or suggest contacting administrator

#### 5. Concurrent Operation Conflicts
- **Scenario**: Multiple users modifying same document simultaneously
  - **Handling**: Optimistic locking with version checking in Document model, operation queuing
  - **User Impact**: Transparent conflict resolution with minimal disruption
  - **Retry Strategy**: Automatic conflict resolution with user notification for manual intervention

### RAGFlow API Error Recovery

```mermaid
sequenceDiagram
    participant Client as Frontend
    participant API as DocumentAPI
    participant DS as DocumentService
    participant RFS as RAGFlowService
    participant RF as RAGFlow API

    Client->>API: Upload document
    API->>DS: process_upload()
    DS->>RFS: upload_to_ragflow()
    RFS->>RF: POST /datasets/{id}/documents

    alt RAGFlow Success
        RF-->>RFS: Document created
        RFS-->>DS: Success response
    else RAGFlow Error (5xx)
        RF-->>RFS: Server Error
        RFS->>RFS: Log error, start retry (1s)
        RFS->>RF: Retry upload
    else RAGFlow Error (4xx)
        RF-->>RFS: Client Error
        RFS-->>DS: Immediate failure
        DS-->>API: Error with details
        API-->>Client: User-friendly error
    end

    Note over RFS: Max 3 retries with exponential backoff
```

### Data Consistency Management

- **Transaction Boundaries**: All database operations wrapped in transactions with rollback on RAGFlow failures
- **Sync Validation**: Periodic consistency checks between local Document table and RAGFlow dataset
- **Cleanup Jobs**: Background tasks to clean up orphaned records and failed uploads

## Database Migration and Schema Integration

### Migration Requirements

New database tables will be added using existing migration patterns from the MRC codebase:

#### Migration Script: add_document_management_tables.py
```python
# Follows existing pattern from add_knowledge_base_tables.py
def add_document_management_tables():
    """Add document management tables to existing database"""

    # Create documents table
    db.engine.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id VARCHAR(36) PRIMARY KEY,
            knowledge_base_id VARCHAR(36) NOT NULL,
            ragflow_document_id VARCHAR(255),
            filename VARCHAR(255) NOT NULL,
            original_filename VARCHAR(255) NOT NULL,
            file_size INTEGER NOT NULL,
            file_type VARCHAR(50) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            upload_status VARCHAR(20) DEFAULT 'uploading',
            processing_status VARCHAR(20) DEFAULT 'pending',
            chunk_count INTEGER DEFAULT 0,
            error_message TEXT,
            ragflow_metadata JSON,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            uploaded_at DATETIME,
            processed_at DATETIME,
            FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
        )
    ''')

    # Create document_chunks table
    db.engine.execute('''
        CREATE TABLE IF NOT EXISTS document_chunks (
            id VARCHAR(36) PRIMARY KEY,
            document_id VARCHAR(36) NOT NULL,
            ragflow_chunk_id VARCHAR(255),
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_preview VARCHAR(500),
            word_count INTEGER DEFAULT 0,
            character_count INTEGER DEFAULT 0,
            ragflow_metadata JSON,
            embedding_vector_id VARCHAR(255),
            position_start INTEGER,
            position_end INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )
    ''')

    # Create processing_logs table
    db.engine.execute('''
        CREATE TABLE IF NOT EXISTS processing_logs (
            id VARCHAR(36) PRIMARY KEY,
            document_id VARCHAR(36) NOT NULL,
            step VARCHAR(50) NOT NULL,
            status VARCHAR(20) NOT NULL,
            progress INTEGER DEFAULT 0,
            message TEXT,
            error_details JSON,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )
    ''')

    # Add indexes for performance
    db.engine.execute('CREATE INDEX IF NOT EXISTS idx_documents_kb_id ON documents(knowledge_base_id)')
    db.engine.execute('CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status)')
    db.engine.execute('CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks(document_id)')
    db.engine.execute('CREATE INDEX IF NOT EXISTS idx_logs_doc_id ON processing_logs(document_id)')
```

### KnowledgeBase Model Extensions

The existing KnowledgeBase model will be extended with new relationships:

```python
# backend/app/models/knowledge_base.py (extension)
class KnowledgeBase(db.Model):
    # ... existing fields ...

    # New relationships for document management
    documents = db.relationship('Document', backref='knowledge_base', lazy='dynamic')

    @property
    def document_count(self):
        """Get total document count"""
        return self.documents.count()

    @property
    def total_document_size(self):
        """Get total size of all documents"""
        result = db.session.query(db.func.sum(Document.file_size)).filter_by(knowledge_base_id=self.id).scalar()
        return result or 0

    def get_processing_status_counts(self):
        """Get counts by processing status"""
        return db.session.query(
            Document.processing_status,
            db.func.count(Document.id).label('count')
        ).filter_by(knowledge_base_id=self.id).group_by(Document.processing_status).all()
```

## API Endpoints Specification

### Extended Knowledge Base API Endpoints

All new endpoints follow the existing RESTful pattern from `knowledge_bases.py`:

```python
# backend/app/api/knowledge_bases.py (extensions)

@ns.route('/<string:knowledge_base_id>/documents')
class DocumentListResource(Resource):
    @ns.expect(document_list_model)
    def get(self, knowledge_base_id):
        """Get documents for a knowledge base"""
        # Leverages existing error handling patterns
        # Integrates with existing knowledge_base_service.py

    @ns.expect(document_upload_model)
    def post(self, knowledge_base_id):
        """Upload document to knowledge base"""
        # Uses existing file validation and security middleware
        # Follows existing response format patterns

@ns.route('/<string:knowledge_base_id>/documents/upload')
class DocumentUploadResource(Resource):
    def post(self, knowledge_base_id):
        """Handle file upload with progress tracking"""
        # Leverages existing upload handling patterns
        # Integrates with ragflow_service.py for RAGFlow upload

@ns.route('/<string:knowledge_base_id>/documents/<string:document_id>')
class DocumentResource(Resource):
    def get(self, knowledge_base_id, document_id):
        """Get document details"""

    def delete(self, knowledge_base_id, document_id):
        """Delete document from system and RAGFlow"""
        # Uses existing transaction patterns for data consistency

@ns.route('/<string:knowledge_base_id>/chunks/search')
class ChunkSearchResource(Resource):
    def post(self, knowledge_base_id):
        """Search document chunks"""
        # Integrates with existing search patterns
        # Leverages existing caching from cache_service.py

@ns.route('/<string:knowledge_base_id>/documents/<string:document_id>/chunks')
class DocumentChunksResource(Resource):
    def get(self, knowledge_base_id, document_id):
        """Get all chunks for a document"""
        # Follows existing pagination patterns
```

## WebSocket Integration for Real-Time Updates

### Progress Tracking Implementation

Real-time progress updates will be implemented using WebSocket patterns consistent with existing MRC architecture:

```python
# backend/app/services/progress_service.py (new)
class ProgressService:
    def __init__(self):
        self.active_uploads = {}  # Track active upload sessions

    def start_upload_tracking(self, upload_id, document_id):
        """Start tracking upload progress"""
        self.active_uploads[upload_id] = {
            'document_id': document_id,
            'progress': 0,
            'status': 'uploading',
            'start_time': datetime.utcnow()
        }

    def update_progress(self, upload_id, progress, status=None):
        """Update and broadcast progress"""
        if upload_id in self.active_uploads:
            self.active_uploads[upload_id]['progress'] = progress
            if status:
                self.active_uploads[upload_id]['status'] = status
            # Broadcast to connected clients via WebSocket
            self.broadcast_progress(upload_id, self.active_uploads[upload_id])
```

### Frontend WebSocket Integration

```typescript
// front/src/hooks/useDocumentProgress.ts (new)
export const useDocumentProgress = (uploadId: string) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('uploading');

  useEffect(() => {
    // Connect to WebSocket for progress updates
    const ws = new WebSocket(`${WS_BASE_URL}/progress/${uploadId}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data.progress);
      setStatus(data.status);
    };

    return () => ws.close();
  }, [uploadId]);

  return { progress, status };
};
```

## Testing Strategy

### Unit Testing
- **Service Layer Testing**: Test document and chunk services with mocked RAGFlow API
- **Model Testing**: Test database models, relationships, and validation rules
- **Component Testing**: Test React components with Jest and React Testing Library
- **API Testing**: Test API endpoints with various scenarios and error conditions

### Integration Testing
- **RAGFlow Integration**: Test document upload, processing, and retrieval with actual RAGFlow instance
- **Database Integration**: Test model relationships, migrations, and data consistency
- **Frontend-Backend Integration**: Test API client integration and error handling
- **File Upload Integration**: Test complete file upload workflow with various file types

### End-to-End Testing
- **Complete Document Lifecycle**: Test upload → process → manage → retrieve workflow
- **User Scenarios**: Test common user workflows and edge cases
- **Performance Testing**: Test with large files and high document counts
- **Error Recovery Testing**: Test system recovery from various failure scenarios