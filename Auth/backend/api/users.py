from flask import Blueprint, jsonify, request

from api.decorators import require_permission, get_current_user

users_bp = Blueprint("users_api", __name__)


def create_blueprint(deps):
    @users_bp.route("/api/users", methods=["GET"])
    @require_permission("users", "view")
    def list_users():
        role = request.args.get("role")
        status = request.args.get("status")
        limit = int(request.args.get("limit", 100))

        users = deps.user_store.list_users(role=role, status=status, limit=limit)

        return jsonify({
            "users": [
                {
                    "user_id": u.user_id,
                    "username": u.username,
                    "email": u.email,
                    "role": u.role,
                    "status": u.status,
                    "created_at_ms": u.created_at_ms,
                    "last_login_at_ms": u.last_login_at_ms,
                    "created_by": u.created_by
                }
                for u in users
            ],
            "count": len(users)
        })

    @users_bp.route("/api/users", methods=["POST"])
    @require_permission("users", "manage")
    def create_user():
        data = request.get_json()
        if not data or not data.get("username") or not data.get("password"):
            return jsonify({"error": "missing_fields"}), 400

        current = get_current_user()

        try:
            user = deps.user_store.create_user(
                username=data["username"],
                password=data["password"],
                email=data.get("email"),
                role=data.get("role", "viewer"),
                status=data.get("status", "active"),
                created_by=current.get("user_id")
            )

            deps.casbin_enforcer.add_role_for_user(user.user_id, user.role)

            return jsonify({
                "user_id": user.user_id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "status": user.status
            }), 201
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    @users_bp.route("/api/users/<user_id>", methods=["GET"])
    @require_permission("users", "view")
    def get_user(user_id):
        user = deps.user_store.get_by_user_id(user_id)
        if not user:
            return jsonify({"error": "user_not_found"}), 404

        return jsonify({
            "user_id": user.user_id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "created_at_ms": user.created_at_ms,
            "last_login_at_ms": user.last_login_at_ms,
            "created_by": user.created_by
        })

    @users_bp.route("/api/users/<user_id>", methods=["PUT", "PATCH"])
    @require_permission("users", "manage")
    def update_user(user_id):
        data = request.get_json()
        user = deps.user_store.get_by_user_id(user_id)

        if not user:
            return jsonify({"error": "user_not_found"}), 404

        old_role = user.role
        updated_user = deps.user_store.update_user(
            user_id=user_id,
            email=data.get("email"),
            role=data.get("role"),
            status=data.get("status")
        )

        new_role = data.get("role")
        if new_role and new_role != old_role:
            deps.casbin_enforcer.delete_role_for_user(user_id, old_role)
            deps.casbin_enforcer.add_role_for_user(user_id, new_role)

        if updated_user:
            return jsonify({
                "user_id": updated_user.user_id,
                "username": updated_user.username,
                "email": updated_user.email,
                "role": updated_user.role,
                "status": updated_user.status
            })

        return jsonify({"error": "update_failed"}), 500

    @users_bp.route("/api/users/<user_id>", methods=["DELETE"])
    @require_permission("users", "manage")
    def delete_user(user_id):
        success = deps.user_store.delete_user(user_id)
        if success:
            return jsonify({"ok": True})
        return jsonify({"error": "user_not_found"}), 404

    @users_bp.route("/api/users/<user_id>/password", methods=["PUT"])
    @require_permission("users", "manage")
    def reset_user_password(user_id):
        data = request.get_json()
        if not data or not data.get("new_password"):
            return jsonify({"error": "missing_password"}), 400

        user = deps.user_store.get_by_user_id(user_id)
        if not user:
            return jsonify({"error": "user_not_found"}), 404

        deps.user_store.update_password(user_id, data["new_password"])
        deps.auth_store.revoke_all_user_sessions(user_id)

        return jsonify({"ok": True})

    return users_bp
