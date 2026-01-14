from flask import Blueprint, jsonify, request

from api.decorators import require_permission, get_current_user

review_bp = Blueprint("review_api", __name__)


def create_blueprint(deps):
    @review_bp.route("/api/knowledge/documents/<doc_id>/approve", methods=["POST"])
    @require_permission("kb_documents", "approve")
    def approve_document(doc_id):
        doc = deps.kb_store.get_document(doc_id)
        if not doc:
            return jsonify({"error": "document_not_found"}), 404

        if doc.status != "pending":
            return jsonify({"error": "document_not_pending"}), 400

        current = get_current_user()

        try:
            ragflow_doc_id = deps.ragflow_service.upload_document(
                file_path=doc.file_path,
                kb_id=doc.kb_id
            )

            updated_doc = deps.kb_store.update_document_status(
                doc_id=doc_id,
                status="approved",
                reviewed_by=current.get("user_id"),
                ragflow_doc_id=ragflow_doc_id
            )

            return jsonify({
                "doc_id": updated_doc.doc_id,
                "status": updated_doc.status,
                "ragflow_doc_id": ragflow_doc_id
            })
        except Exception as e:
            return jsonify({"error": f"upload_failed: {str(e)}"}), 500

    @review_bp.route("/api/knowledge/documents/<doc_id>/reject", methods=["POST"])
    @require_permission("kb_documents", "reject")
    def reject_document(doc_id):
        doc = deps.kb_store.get_document(doc_id)
        if not doc:
            return jsonify({"error": "document_not_found"}), 404

        if doc.status != "pending":
            return jsonify({"error": "document_not_pending"}), 400

        data = request.get_json() or {}
        current = get_current_user()

        updated_doc = deps.kb_store.update_document_status(
            doc_id=doc_id,
            status="rejected",
            reviewed_by=current.get("user_id"),
            review_notes=data.get("notes", "")
        )

        return jsonify({
            "doc_id": updated_doc.doc_id,
            "status": updated_doc.status,
            "review_notes": updated_doc.review_notes
        })

    @review_bp.route("/api/knowledge/pending", methods=["GET"])
    @require_permission("kb_documents", "review")
    def list_pending_documents():
        limit = int(request.args.get("limit", 100))
        kb_id = request.args.get("kb_id")

        docs = deps.kb_store.list_documents(
            status="pending",
            kb_id=kb_id,
            limit=limit
        )

        return jsonify({
            "documents": [
                {
                    "doc_id": d.doc_id,
                    "filename": d.filename,
                    "file_size": d.file_size,
                    "uploaded_by": d.uploaded_by,
                    "uploaded_at_ms": d.uploaded_at_ms,
                    "kb_id": d.kb_id
                }
                for d in docs
            ],
            "count": len(docs)
        })

    return review_bp
