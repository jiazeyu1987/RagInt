# Requirements Specification - Step Subject Names

## Introduction

This feature adds step subject names and context information to the Session Theater dialogue interface, providing users with clear visibility into what each step in the conversation is about. Currently, the Session Theater shows role names and round numbers but lacks specific step descriptions or task context. This enhancement will display step descriptions, task types, and subject information throughout the conversation flow, making the dialogue system more transparent and user-friendly.

## Alignment with Product Vision

This feature supports the Multi-Role Dialogue System's goal of creating configurable, transparent, and user-friendly conversation environments. By showing step subjects and context, users can better understand the conversation flow, track progress through structured dialogue flows, and identify the purpose of each interaction. This enhances the system's educational value and debugging capabilities.

## Requirements

### Requirement 1 - Display Current Step Information in Header

**User Story:** As a user observing a session, I want to see the current step description and task type in the session header, so that I can understand what specific task is being executed at any point in the conversation.

#### Acceptance Criteria

1. WHEN a session is active THEN the session header SHALL display the current step description
2. WHEN a session is active THEN the session header SHALL display the current step task type
3. WHEN a session transitions to a new step THEN the header SHALL update to show the new step information
4. WHEN a session is finished THEN the header SHALL show completion status instead of step information
5. IF step description is unavailable THEN the header SHALL display a generic "Step #{number}" fallback

### Requirement 2 - Show Step Context in Auto/Manual Mode Controls

**User Story:** As a user controlling session execution, I want to see the current step subject in the control area, so that I can understand what action will be taken when executing the next step.

#### Acceptance Criteria

1. WHEN in auto-execution mode THEN the control area SHALL display "🤖 自动执行中: [step description]"
2. WHEN in manual mode THEN the control area SHALL display "下一步: [step description]"
3. WHEN a step completes THEN the control area SHALL update to show the next step description
4. WHEN no more steps are available THEN the control area SHALL show completion message
5. IF step description is unavailable THEN the control area SHALL show "步骤 #{number}" fallback

### Requirement 3 - Add Step Information to Message Display

**User Story:** As a user reading conversation messages, I want to see which step each message belongs to, so that I can understand the context and purpose of each interaction within the overall conversation flow.

#### Acceptance Criteria

1. WHEN displaying messages THEN each message SHALL show the associated step description if available
2. WHEN a message has step context THEN the step SHALL be displayed after the target role name
3. WHEN multiple messages belong to the same step THEN they SHALL share the same step identifier
4. WHEN step context is not available for a message THEN no step information SHALL be displayed
5. IF step description is too long THEN it SHALL be truncated with ellipsis after 30 characters

### Requirement 4 - Provide Step Type Visual Indicators

**User Story:** As a user observing the conversation, I want to see visual indicators for different step types, so that I can quickly identify the nature of each step (question, answer, review, etc.).

#### Acceptance Criteria

1. WHEN displaying step information THEN each step type SHALL have a distinct visual indicator
2. WHEN step type is "ask_question" THEN a question mark icon SHALL be displayed
3. WHEN step type is "answer_question" THEN an answer/check icon SHALL be displayed
4. WHEN step type is "review_answer" THEN a review/eye icon SHALL be displayed
5. WHEN step type is "summarize" THEN a summary/document icon SHALL be displayed
6. IF step type is unrecognized THEN a default step icon SHALL be displayed

### Requirement 5 - Support Debugging and Development Workflow

**User Story:** As a developer debugging conversation flows, I want to see detailed step context and type indicators, so that I can quickly identify issues in flow execution and step transitions.

#### Acceptance Criteria

1. WHEN displaying step information THEN step IDs SHALL be available in development mode for debugging
2. WHEN step API calls fail THEN error messages SHALL be displayed to help with troubleshooting
3. WHEN step transitions occur THEN step execution order SHALL be logged for debugging analysis
4. IF corrupted step descriptions are detected THEN fallback handling SHALL be implemented
5. WHEN development mode is active THEN additional step metadata SHALL be available for inspection

## Non-Functional Requirements

### Performance
- Step information shall be cached after initial fetch to avoid repeated API calls
- UI updates for step changes shall occur within 500ms of backend response
- Adding step display shall not increase page load time by more than 100ms

### Security
- Step information access shall follow existing session authorization patterns
- No additional authentication requirements beyond current session access controls

### Reliability
- Step information shall display correctly even if backend step data is incomplete
- UI shall gracefully handle missing or corrupted step descriptions
- System shall continue to function if step information API calls fail

### Usability
- Step information shall be clearly readable with appropriate font sizes and colors
- Step indicators shall be intuitive and consistent with existing UI design patterns
- Step context shall not clutter the interface or distract from main conversation flow
- Step information shall be visible without requiring additional user actions or clicks

### Accessibility
- Step information shall be compatible with screen readers using proper ARIA labels
- Step type icons shall include alt text for visual impairment users
- Step information shall have sufficient color contrast (minimum WCAG AA compliance)
- Step indicators shall be keyboard navigable for users who cannot use mouse
- Step information shall remain functional when high contrast mode is enabled