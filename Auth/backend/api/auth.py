from flask import Blueprint, jsonify, request

from services.user_store import UserStore, hash_password
from services.auth_store import AuthStore, hash_token
from api.decorators import require_auth, get_current_user

auth_bp = Blueprint("auth_api", __name__)


def create_blueprint(deps):
    @auth_bp.route("/api/auth/login", methods=["POST"])
    def login():
        data = request.get_json()
        if not data or not data.get("username") or not data.get("password"):
            return jsonify({"error": "missing_credentials"}), 400

        username = data["username"]
        password = data["password"]

        user = deps.user_store.get_by_username(username)
        if not user:
            return jsonify({"error": "invalid_credentials"}), 401

        if hash_password(password) != user.password_hash:
            return jsonify({"error": "invalid_credentials"}), 401

        if user.status != "active":
            return jsonify({"error": "account_disabled"}), 403

        token = deps.jwt_manager.create_token(
            user_id=user.user_id,
            username=user.username,
            role=user.role
        )

        deps.auth_store.create_session(
            user_id=user.user_id,
            token=token
        )

        deps.casbin_enforcer.ensure_user_role(user.user_id, user.role)
        deps.user_store.update_last_login(user.user_id)

        return jsonify({
            "token": token,
            "user": {
                "user_id": user.user_id,
                "username": user.username,
                "email": user.email,
                "role": user.role
            }
        })

    @auth_bp.route("/api/auth/logout", methods=["POST"])
    @require_auth
    def logout():
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        token_hash = hash_token(token)
        deps.auth_store.revoke_session(token_hash)
        return jsonify({"ok": True})

    @auth_bp.route("/api/auth/verify", methods=["POST"])
    @require_auth
    def verify():
        payload = get_current_user()

        resource = request.json.get("resource", "") if request.json else ""
        action = request.json.get("action", "") if request.json else ""

        deps.casbin_enforcer.ensure_user_role(payload.get("user_id"), payload.get("role"))
        allowed = deps.casbin_enforcer.check_permission(payload.get("user_id"), resource, action) if resource and action else True
        if resource and action and not allowed:
            allowed = deps.casbin_enforcer.check_permission(payload.get("role", "guest"), resource, action)

        return jsonify({
            "allowed": allowed,
            "user": {
                "user_id": payload.get("user_id"),
                "username": payload.get("username"),
                "role": payload.get("role")
            }
        })

    @auth_bp.route("/api/auth/me", methods=["GET"])
    @require_auth
    def get_current_user_info():
        payload = get_current_user()
        user = deps.user_store.get_by_user_id(payload.get("user_id"))

        if not user:
            return jsonify({"error": "user_not_found"}), 404

        return jsonify({
            "user_id": user.user_id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "created_at_ms": user.created_at_ms,
            "last_login_at_ms": user.last_login_at_ms
        })

    return auth_bp
