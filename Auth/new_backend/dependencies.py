from dataclasses import dataclass
from pathlib import Path

from services.user_store import UserStore
from services.kb_store import KbStore
from services.ragflow_service import RagflowService
from services.user_kb_permission_store import UserKbPermissionStore
from services.deletion_log_store import DeletionLogStore


@dataclass
class AppDependencies:
    user_store: UserStore
    kb_store: KbStore
    ragflow_service: RagflowService
    user_kb_permission_store: UserKbPermissionStore
    deletion_log_store: DeletionLogStore


def create_dependencies(db_path: str = None) -> AppDependencies:
    if db_path is None:
        script_dir = Path(__file__).parent
        db_path = script_dir / "data" / "auth.db"

    return AppDependencies(
        user_store=UserStore(db_path=str(db_path)),
        kb_store=KbStore(db_path=str(db_path)),
        ragflow_service=RagflowService(),
        user_kb_permission_store=UserKbPermissionStore(db_path=str(db_path)),
        deletion_log_store=DeletionLogStore(db_path=str(db_path)),
    )
