import casbin
from pathlib import Path
from typing import List, Optional


class CasbinEnforcer:
    def __init__(self, model_path: str = None, policy_path: str = None):
        if model_path is None:
            script_dir = Path(__file__).parent.parent
            model_path = script_dir / "config" / "casbin_model.conf"

        if policy_path is None:
            script_dir = Path(__file__).parent.parent
            policy_path = script_dir / "data" / "casbin_policy.csv"

        self.model_path = Path(model_path)
        self.policy_path = Path(policy_path)
        self.policy_path.parent.mkdir(parents=True, exist_ok=True)

        if not self.policy_path.exists():
            self.policy_path.touch()

        self.enforcer = casbin.Enforcer(str(self.model_path), str(self.policy_path))
        self._ensure_seed_policies()

    def _ensure_seed_policies(self):
        existing = set(tuple(p) for p in self.enforcer.get_policy())
        added_any = False

        for sub, obj, act in self._role_permissions():
            if (sub, obj, act) in existing:
                continue
            self.enforcer.add_policy([sub, obj, act])
            added_any = True

        if added_any:
            self.enforcer.save_policy()

    def _role_permissions(self):
        permissions = [
            ("admin", "*", "*"),
            ("reviewer", "kb_documents", "view"),
            ("reviewer", "kb_documents", "review"),
            ("reviewer", "kb_documents", "approve"),
            ("reviewer", "kb_documents", "reject"),
            ("reviewer", "kb_documents", "delete"),
            ("reviewer", "ragflow_documents", "view"),
            ("reviewer", "ragflow_documents", "delete"),
            ("operator", "kb_documents", "view"),
            ("operator", "kb_documents", "upload"),
            ("operator", "ragflow_documents", "view"),
            ("viewer", "ragflow_documents", "view"),
            ("guest", "ragflow_documents", "view"),
            ("reviewer", "users", "view"),
            ("admin", "users", "view"),
            ("admin", "users", "manage"),
        ]
        return permissions

    def check_permission(self, user_id: str, resource: str, action: str) -> bool:
        return self.enforcer.enforce(user_id, resource, action)

    def ensure_user_role(self, user_id: Optional[str], role: Optional[str]) -> None:
        if not user_id or not role:
            return

        current_roles = self.enforcer.get_roles_for_user(user_id)
        if current_roles == [role]:
            return

        for current_role in current_roles:
            self.enforcer.delete_role_for_user(user_id, current_role)

        self.enforcer.add_role_for_user(user_id, role)
        self.enforcer.save_policy()

    def add_role_for_user(self, user_id: str, role: str) -> bool:
        return self.enforcer.add_role_for_user(user_id, role)

    def delete_role_for_user(self, user_id: str, role: str) -> bool:
        return self.enforcer.delete_role_for_user(user_id, role)

    def get_roles_for_user(self, user_id: str) -> List[str]:
        return self.enforcer.get_roles_for_user(user_id)

    def get_users_for_role(self, role: str) -> List[str]:
        return self.enforcer.get_users_for_role(role)

    def add_policy(self, sub: str, obj: str, act: str) -> bool:
        return self.enforcer.add_policy([sub, obj, act])

    def remove_policy(self, sub: str, obj: str, act: str) -> bool:
        return self.enforcer.remove_policy([sub, obj, act])

    def get_all_policies(self) -> List[List[str]]:
        return self.enforcer.get_policy()

    def has_role_for_user(self, user_id: str, role: str) -> bool:
        return self.enforcer.has_role_for_user(user_id, role)

    def get_all_roles(self) -> List[str]:
        return self.enforcer.get_all_roles()
