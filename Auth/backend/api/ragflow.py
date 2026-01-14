from flask import Blueprint, jsonify, request, Response, send_file
import os

from api.decorators import require_permission

ragflow_bp = Blueprint("ragflow_api", __name__)


def create_blueprint(deps):
    @ragflow_bp.route("/api/ragflow/datasets", methods=["GET"])
    @require_permission("ragflow_documents", "view")
    def list_datasets():
        try:
            datasets = deps.ragflow_service.list_datasets()
            return jsonify({"datasets": datasets})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @ragflow_bp.route("/api/ragflow/documents", methods=["GET"])
    @require_permission("ragflow_documents", "view")
    def list_documents():
        dataset_name = request.args.get("dataset", "展厅")

        try:
            documents = deps.ragflow_service.list_documents(dataset_name=dataset_name)
            return jsonify({"documents": documents, "dataset": dataset_name})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @ragflow_bp.route("/api/ragflow/documents/<doc_id>/status", methods=["GET"])
    @require_permission("ragflow_documents", "view")
    def get_document_status(doc_id):
        dataset_name = request.args.get("dataset", "展厅")

        try:
            status = deps.ragflow_service.get_document_status(doc_id, dataset_name=dataset_name)
            if status is None:
                return jsonify({"error": "document_not_found"}), 404
            return jsonify({"document_id": doc_id, "status": status})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @ragflow_bp.route("/api/ragflow/documents/<doc_id>", methods=["GET"])
    @require_permission("ragflow_documents", "view")
    def get_document_detail(doc_id):
        dataset_name = request.args.get("dataset", "展厅")

        try:
            detail = deps.ragflow_service.get_document_detail(doc_id, dataset_name=dataset_name)
            if detail:
                return jsonify(detail)
            return jsonify({"error": "document_not_found"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @ragflow_bp.route("/api/ragflow/documents/<doc_id>/download", methods=["GET"])
    @require_permission("ragflow_documents", "view")
    def download_document(doc_id):
        dataset_name = request.args.get("dataset", "展厅")
        client_filename = request.args.get("filename")
        dataset_name = request.args.get("dataset") or "展厅"

        try:
            file_content, ragflow_filename = deps.ragflow_service.download_document(doc_id, dataset_name=dataset_name)

            if file_content:
                from flask import send_file, Response
                import io
                import urllib.parse

                filename = client_filename or ragflow_filename or f"document_{doc_id}"

                file_obj = io.BytesIO(file_content)
                file_obj.seek(0)

                try:
                    filename.encode('ascii')
                    content_disposition = f'attachment; filename="{filename}"'
                except UnicodeEncodeError:
                    ascii_filename = filename.encode('ascii', 'replace').decode('ascii')
                    encoded_filename = urllib.parse.quote(filename)
                    content_disposition = (
                        f"attachment; filename=\"{ascii_filename}\"; "
                        f"filename*=UTF-8''{encoded_filename}"
                    )

                response = send_file(
                    file_obj,
                    as_attachment=True,
                    download_name=filename,
                    mimetype='application/octet-stream'
                )

                response.headers['Content-Disposition'] = content_disposition

                return response

            return jsonify({"error": "download_failed"}), 404
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @ragflow_bp.route("/api/ragflow/documents/<doc_id>", methods=["DELETE"])
    @require_permission("ragflow_documents", "delete")
    def delete_document(doc_id):
        import logging
        logger = logging.getLogger(__name__)

        dataset_name = request.args.get("dataset", "展厅")

        dataset_name = request.args.get("dataset") or "展厅"
        logger.info(f"Received DELETE request for document {doc_id} in dataset '{dataset_name}'")

        try:
            success = deps.ragflow_service.delete_document(doc_id, dataset_name=dataset_name)

            if success:
                logger.info(f"✓ Successfully deleted document {doc_id}")
                return jsonify({"ok": True, "message": "Document deleted successfully"})
            else:
                logger.error(f"✗ Failed to delete document {doc_id}")
                return jsonify({"error": "document_not_found"}), 404
        except Exception as e:
            logger.error(f"Exception deleting document {doc_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({"error": str(e)}), 500

    @ragflow_bp.route("/api/ragflow/documents/batch/download", methods=["POST"])
    @require_permission("ragflow_documents", "view")
    def batch_download_documents():
        import logging
        logger = logging.getLogger(__name__)

        data = request.get_json()
        documents = data.get("documents", [])

        logger.info(f"Received batch download request with {len(documents)} documents")
        logger.info(f"Request data: {documents}")

        if not documents:
            logger.warning("No documents in request")
            return jsonify({"error": "no_documents_selected"}), 400

        try:
            zip_content, filename = deps.ragflow_service.batch_download_documents(documents)

            if zip_content:
                import io
                logger.info(f"Sending zip file: {filename}, size: {len(zip_content)} bytes")
                return send_file(
                    io.BytesIO(zip_content),
                    mimetype='application/zip',
                    as_attachment=True,
                    download_name=filename
                )
            else:
                logger.error("Failed to create zip - service returned None")
                return jsonify({"error": "failed_to_create_zip"}), 500

        except Exception as e:
            logger.error(f"Exception in batch download: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({"error": str(e)}), 500

    return ragflow_bp
