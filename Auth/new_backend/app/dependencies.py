from dataclasses import dataclass
from pathlib import Path

from services.chat_session_store import ChatSessionStore
from services.deletion_log_store import DeletionLogStore
from services.download_log_store import DownloadLogStore
from services.kb_store import KbStore
from services.permission_group_store import PermissionGroupStore
from services.ragflow_chat_service import RagflowChatService
from services.ragflow_service import RagflowService
from services.user_chat_permission_store import UserChatPermissionStore
from services.user_kb_permission_store import UserKbPermissionStore
from services.user_store import UserStore


@dataclass
class AppDependencies:
    user_store: UserStore
    kb_store: KbStore
    ragflow_service: RagflowService
    user_kb_permission_store: UserKbPermissionStore
    deletion_log_store: DeletionLogStore
    download_log_store: DownloadLogStore
    user_chat_permission_store: UserChatPermissionStore
    ragflow_chat_service: RagflowChatService
    chat_session_store: ChatSessionStore
    permission_group_store: PermissionGroupStore


def create_dependencies(db_path: str = None) -> AppDependencies:
    if db_path is None:
        script_dir = Path(__file__).resolve().parents[1]
        db_path = script_dir / "data" / "auth.db"

    chat_session_store = ChatSessionStore(db_path=str(db_path))

    return AppDependencies(
        user_store=UserStore(db_path=str(db_path)),
        kb_store=KbStore(db_path=str(db_path)),
        ragflow_service=RagflowService(),
        user_kb_permission_store=UserKbPermissionStore(db_path=str(db_path)),
        deletion_log_store=DeletionLogStore(db_path=str(db_path)),
        download_log_store=DownloadLogStore(db_path=str(db_path)),
        user_chat_permission_store=UserChatPermissionStore(db_path=str(db_path)),
        ragflow_chat_service=RagflowChatService(session_store=chat_session_store),
        chat_session_store=chat_session_store,
        permission_group_store=PermissionGroupStore(database_path=str(db_path)),
    )
