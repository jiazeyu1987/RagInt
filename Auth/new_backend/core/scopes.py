from typing import Dict, List

# Role to Scopes Mapping
# Scope format: resource:action (e.g., "kb_documents:upload")
# Wildcard * matches any action for that resource

ROLE_SCOPES: Dict[str, List[str]] = {
    "admin": [
        "users:*",  # Full user management
        "kb_documents:*",  # Full document management
        "ragflow_documents:*",  # Full RAGFlow management
    ],
    "reviewer": [
        "kb_documents:view",
        "kb_documents:review",
        "kb_documents:approve",
        "kb_documents:reject",
        "kb_documents:delete",
        "ragflow_documents:view",
        "ragflow_documents:delete",
        "users:view",
    ],
    "operator": [
        "kb_documents:view",
        "kb_documents:upload",
        "ragflow_documents:view",
    ],
    "viewer": [
        "ragflow_documents:view",
    ],
    "guest": [
        "ragflow_documents:view",
    ],
}


def get_scopes_for_role(role: str) -> List[str]:
    """
    Get scopes for a given role.

    Args:
        role: User role (admin, reviewer, operator, viewer, guest)

    Returns:
        List of scopes for the role
    """
    return ROLE_SCOPES.get(role, [])
