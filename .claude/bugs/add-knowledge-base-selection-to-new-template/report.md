# Bug Report: Add Knowledge Base Selection to New Template

**Bug ID**: add-knowledge-base-selection-to-new-template
**Date Created**: 2025-12-09
**Status**: Report
**Priority**: Medium

## Description
The "New Template" feature in the MRC system lacks knowledge base selection functionality. Users need the ability to associate multiple knowledge bases with newly created templates.

## Requirements to Fix
Based on `task\task2\info.txt`:
1. 在【新建模板】的预设议题下，增加知识库选择
2. 知识库是知识库的知识库列表里的知识库
3. 可以支持多选

Translation:
1. Add knowledge base selection under the "New Template" preset topics
2. Knowledge bases should come from the knowledge base list
3. Support multiple selection

## Current Behavior
- The new template creation form does not include knowledge base selection options
- Users cannot associate templates with knowledge bases during creation
- Missing functionality to link conversation templates with relevant knowledge bases
- **Backend Support Already Exists**: The `FlowStep` model already has `knowledge_base_config` field with full RAGFlow integration
- **Frontend Types Missing**: TypeScript interfaces in `flowApi.ts` don't include knowledge base configuration
- **No Template Creation UI**: No dedicated template creation interface exists in the frontend

## Expected Behavior
- The new template form should include a knowledge base selection field for each step
- Users should be able to select multiple knowledge bases from a dropdown or multi-select component
- Selected knowledge bases should be associated with specific steps in the created template
- The knowledge base list should be populated from the existing knowledge base system
- Knowledge base configuration should include retrieval parameters (top_k, similarity_threshold, etc.)
- Template creation UI should integrate with existing `FlowTemplate` and `FlowStep` models

## Reproduction Steps
1. Navigate to the template creation interface
2. Look for knowledge base selection options
3. Observe that no such functionality exists

## Files Likely to Need Modification

### Frontend Files
- `front/src/api/flowApi.ts` - Update `FlowStep` interface to include knowledge base configuration
- `front/src/components/` - Create new template creation component with knowledge base selection
- `front/src/types/` - Add knowledge base configuration types

### Backend Files
- `backend/app/schemas/flow.py` - Update `FlowStepSchema` to include knowledge base config validation
- `backend/app/api/flows.py` - Ensure flow creation API handles knowledge base configuration
- `backend/app/services/flow_service.py` - May need updates for knowledge base validation in template creation

### Files That Already Support Knowledge Bases (No Changes Needed)
- `backend/app/models/flow.py` - `FlowStep` model already has `knowledge_base_config` field
- `backend/app/models/knowledge_base.py` - Complete knowledge base system exists
- `backend/app/services/knowledge_base_service.py` - Full knowledge base management available

## Acceptance Criteria
- [ ] Knowledge base selection field added to new template form for each step
- [ ] Multi-select functionality implemented for knowledge base selection
- [ ] Knowledge base list populated from existing system via API
- [ ] Selected knowledge bases saved with template steps using existing `knowledge_base_config` field
- [ ] Knowledge base configuration supports retrieval parameters (top_k, similarity_threshold, max_context_length)
- [ ] TypeScript interfaces updated to include knowledge base configuration
- [ ] Backend schema validation handles knowledge base configuration
- [ ] UI is intuitive and user-friendly with proper error handling
- [ ] Knowledge base references validated before template creation

## Additional Notes
This enhancement will improve the integration between the template system and the knowledge base system, allowing for more context-aware conversations.

## Implementation Complexity Assessment
- **Backend Complexity**: Low - Knowledge base support already exists in `FlowStep` model
- **Frontend Complexity**: Medium - Requires creating new template creation UI and updating types
- **Integration Complexity**: Low - Can leverage existing knowledge base API and components
- **Estimated Effort**: 4-6 hours for complete implementation

## Technical Considerations
- The existing `knowledge_base_config` field in `FlowStep` model uses JSON storage
- Knowledge base selection should be per-step, not per-template (for granular control)
- Need to leverage existing knowledge base management components for selection UI
- Should integrate with existing theme and component patterns in the MRC system