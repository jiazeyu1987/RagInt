from flask import Flask
from flask_cors import CORS
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app_deps import create_dependencies
from api.auth import create_blueprint as create_auth_blueprint
from api.users import create_blueprint as create_users_blueprint
from api.knowledge import create_blueprint as create_knowledge_blueprint
from api.review import create_blueprint as create_review_blueprint
from api.ragflow import create_blueprint as create_ragflow_blueprint


def create_app():
    app = Flask(__name__)
    CORS(app)

    deps = create_dependencies()
    app.deps = deps

    app.register_blueprint(create_auth_blueprint(deps))
    app.register_blueprint(create_users_blueprint(deps))
    app.register_blueprint(create_knowledge_blueprint(deps))
    app.register_blueprint(create_review_blueprint(deps))
    app.register_blueprint(create_ragflow_blueprint(deps))

    @app.route("/health")
    def health():
        return {"status": "ok", "service": "auth-backend"}

    @app.route("/")
    def index():
        return {"service": "Auth Backend", "version": "1.0.0"}

    return app


if __name__ == "__main__":
    app = create_app()
    print("=" * 50)
    print("Auth Backend starting...")
    print("URL: http://localhost:8001")
    print("Health: http://localhost:8001/health")
    print("=" * 50)
    app.run(host="0.0.0.0", port=8001, debug=True)
