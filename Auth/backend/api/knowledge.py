import os
import uuid
from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from api.decorators import require_permission, get_current_user

knowledge_bp = Blueprint("knowledge_api", __name__)

ALLOWED_EXTENSIONS = {".txt", ".pdf", ".doc", ".docx", ".md"}
MAX_FILE_SIZE = 16 * 1024 * 1024


def create_blueprint(deps):
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "data", "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    def allowed_file(filename):
        return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS

    @knowledge_bp.route("/api/knowledge/upload", methods=["POST"])
    @require_permission("kb_documents", "upload")
    def upload_document():
        if "file" not in request.files:
            return jsonify({"error": "no_file"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "no_filename"}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": "file_type_not_allowed"}), 400

        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        if file_size > MAX_FILE_SIZE:
            return jsonify({"error": "file_too_large"}), 400

        current = get_current_user()
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(upload_dir, unique_filename)

        file.save(file_path)

        kb_id = request.form.get("kb_id", "展厅")

        doc = deps.kb_store.create_document(
            filename=filename,
            file_path=file_path,
            file_size=file_size,
            mime_type=file.mimetype,
            uploaded_by=current.get("user_id"),
            kb_id=kb_id,
            status="pending"
        )

        return jsonify({
            "doc_id": doc.doc_id,
            "filename": doc.filename,
            "file_size": doc.file_size,
            "status": doc.status,
            "uploaded_at_ms": doc.uploaded_at_ms
        }), 201

    @knowledge_bp.route("/api/knowledge/documents", methods=["GET"])
    @require_permission("kb_documents", "view")
    def list_documents():
        status = request.args.get("status")
        kb_id = request.args.get("kb_id")
        uploaded_by = request.args.get("uploaded_by")
        limit = int(request.args.get("limit", 100))

        current = get_current_user()

        if current.get("role") == "operator":
            uploaded_by = current.get("user_id")

        docs = deps.kb_store.list_documents(
            status=status,
            kb_id=kb_id,
            uploaded_by=uploaded_by,
            limit=limit
        )

        return jsonify({
            "documents": [
                {
                    "doc_id": d.doc_id,
                    "filename": d.filename,
                    "file_size": d.file_size,
                    "mime_type": d.mime_type,
                    "uploaded_by": d.uploaded_by,
                    "status": d.status,
                    "uploaded_at_ms": d.uploaded_at_ms,
                    "reviewed_by": d.reviewed_by,
                    "reviewed_at_ms": d.reviewed_at_ms,
                    "review_notes": d.review_notes,
                    "ragflow_doc_id": d.ragflow_doc_id,
                    "kb_id": d.kb_id
                }
                for d in docs
            ],
            "count": len(docs)
        })

    @knowledge_bp.route("/api/knowledge/documents/<doc_id>", methods=["GET"])
    @require_permission("kb_documents", "view")
    def get_document(doc_id):
        doc = deps.kb_store.get_document(doc_id)
        if not doc:
            return jsonify({"error": "document_not_found"}), 404

        return jsonify({
            "doc_id": doc.doc_id,
            "filename": doc.filename,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "uploaded_by": doc.uploaded_by,
            "status": doc.status,
            "uploaded_at_ms": doc.uploaded_at_ms,
            "reviewed_by": doc.reviewed_by,
            "reviewed_at_ms": doc.reviewed_at_ms,
            "review_notes": doc.review_notes,
            "ragflow_doc_id": doc.ragflow_doc_id,
            "kb_id": doc.kb_id
        })

    @knowledge_bp.route("/api/knowledge/documents/<doc_id>", methods=["DELETE"])
    @require_permission("kb_documents", "delete")
    def delete_document(doc_id):
        doc = deps.kb_store.get_document(doc_id)
        if not doc:
            return jsonify({"error": "document_not_found"}), 404

        if doc.status in ("approved", "processing"):
            return jsonify({"error": "cannot_delete_approved_document"}), 400

        try:
            if os.path.exists(doc.file_path):
                os.remove(doc.file_path)
        except Exception:
            pass

        success = deps.kb_store.delete_document(doc_id)
        if success:
            return jsonify({"ok": True})

        return jsonify({"error": "delete_failed"}), 500

    @knowledge_bp.route("/api/knowledge/stats", methods=["GET"])
    @require_permission("kb_documents", "view")
    def get_stats():
        current = get_current_user()

        stats = {
            "pending": deps.kb_store.count_documents(status="pending"),
            "approved": deps.kb_store.count_documents(status="approved"),
            "rejected": deps.kb_store.count_documents(status="rejected"),
            "total": deps.kb_store.count_documents()
        }

        if current.get("role") == "operator":
            stats["pending"] = deps.kb_store.count_documents(
                status="pending",
                uploaded_by=current.get("user_id")
            )
            stats["approved"] = deps.kb_store.count_documents(
                status="approved",
                uploaded_by=current.get("user_id")
            )
            stats["rejected"] = deps.kb_store.count_documents(
                status="rejected",
                uploaded_by=current.get("user_id")
            )
            stats["total"] = deps.kb_store.count_documents(
                uploaded_by=current.get("user_id")
            )

        return jsonify(stats)

    return knowledge_bp
