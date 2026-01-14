import functools
from flask import request, jsonify, current_app
from infra.jwt_manager import JwtManager


jwt_manager = JwtManager()


def get_token_from_request():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


def get_current_user():
    token = get_token_from_request()
    if not token:
        return None

    payload = jwt_manager.decode_token(token)
    if not payload:
        return None

    return payload


def require_role(*allowed_roles):
    def decorator(f):
        @functools.wraps(f)
        def wrapped(*args, **kwargs):
            token = get_token_from_request()
            if not token:
                return jsonify({"error": "missing_token"}), 401

            valid, payload, error = jwt_manager.verify_token(token)
            if not valid:
                if error == "token_expired":
                    return jsonify({"error": "token_expired"}), 401
                return jsonify({"error": "invalid_token"}), 401

            user_role = payload.get("role", "guest")
            if user_role not in allowed_roles and "*" not in allowed_roles:
                return jsonify({"error": "insufficient_permissions"}), 403

            request.current_user = payload
            return f(*args, **kwargs)
        return wrapped
    return decorator


def require_permission(resource: str, action: str):
    def decorator(f):
        @functools.wraps(f)
        def wrapped(*args, **kwargs):
            token = get_token_from_request()
            if not token:
                return jsonify({"error": "missing_token"}), 401

            valid, payload, error = jwt_manager.verify_token(token)
            if not valid:
                if error == "token_expired":
                    return jsonify({"error": "token_expired"}), 401
                return jsonify({"error": "invalid_token"}), 401

            deps = getattr(current_app, "deps", None)
            if deps is None or not hasattr(deps, "casbin_enforcer"):
                return jsonify({"error": "permission_system_unavailable"}), 500

            deps.casbin_enforcer.ensure_user_role(payload.get("user_id"), payload.get("role"))
            allowed = deps.casbin_enforcer.check_permission(payload.get("user_id"), resource, action)

            if not allowed:
                # Fallback: allow role-based direct match (covers cases where user-role mapping isn't persisted yet)
                allowed = deps.casbin_enforcer.check_permission(payload.get("role", "guest"), resource, action)

            if not allowed:
                return jsonify({"error": "insufficient_permissions"}), 403

            request.current_user = payload
            return f(*args, **kwargs)
        return wrapped
    return decorator


def require_auth(f):
    @functools.wraps(f)
    def wrapped(*args, **kwargs):
        token = get_token_from_request()
        if not token:
            return jsonify({"error": "missing_token"}), 401

        valid, payload, error = jwt_manager.verify_token(token)
        if not valid:
            if error == "token_expired":
                return jsonify({"error": "token_expired"}), 401
            return jsonify({"error": "invalid_token"}), 401

        request.current_user = payload
        return f(*args, **kwargs)
    return wrapped
