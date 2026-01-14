from dataclasses import dataclass
from pathlib import Path

from services.user_store import UserStore
from services.auth_store import AuthStore
from services.kb_store import KbStore
from services.ragflow_service import RagflowService
from infra.casbin_enforcer import CasbinEnforcer
from infra.jwt_manager import JwtManager


@dataclass
class AppDependencies:
    user_store: UserStore
    auth_store: AuthStore
    kb_store: KbStore
    ragflow_service: RagflowService
    casbin_enforcer: CasbinEnforcer
    jwt_manager: JwtManager


def create_dependencies(db_path: str = None) -> AppDependencies:
    script_dir = Path(__file__).parent

    if db_path is None:
        db_path = script_dir / "data" / "auth.db"

    model_path = script_dir / "config" / "casbin_model.conf"
    policy_path = script_dir / "data" / "casbin_policy.csv"

    return AppDependencies(
        user_store=UserStore(db_path=str(db_path)),
        auth_store=AuthStore(db_path=str(db_path)),
        kb_store=KbStore(db_path=str(db_path)),
        ragflow_service=RagflowService(),
        casbin_enforcer=CasbinEnforcer(
            model_path=str(model_path),
            policy_path=str(policy_path)
        ),
        jwt_manager=JwtManager()
    )
