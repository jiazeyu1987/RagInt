from typing import Annotated

from fastapi import Depends

from authx import TokenPayload
from core.security import auth


# Reusable permission dependencies using Annotated
# These can be used directly in endpoint signatures

# Admin permissions
AdminRequired = Annotated[TokenPayload, Depends(auth.scopes_required("users:*"))]

# User management permissions
UsersViewRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("users:view"))
]
UsersManageRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("users:manage"))
]

# Knowledge base permissions
KbViewRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("kb_documents:view"))
]
KbUploadRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("kb_documents:upload"))
]
KbDeleteRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("kb_documents:delete"))
]
KbApproveRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("kb_documents:approve"))
]
KbRejectRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("kb_documents:reject"))
]

# RAGFlow permissions
RagflowViewRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("ragflow_documents:view"))
]
RagflowDeleteRequired = Annotated[
    TokenPayload, Depends(auth.scopes_required("ragflow_documents:delete"))
]
