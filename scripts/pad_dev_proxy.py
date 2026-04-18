from __future__ import annotations

import http.client
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1] / "pad-frontend"
TARGET_HOST = os.environ.get("PAD_PROXY_TARGET_HOST", "127.0.0.1")
TARGET_PORT = int(os.environ.get("PAD_PROXY_TARGET_PORT", "8101"))
LISTEN_HOST = os.environ.get("PAD_PROXY_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("PAD_PROXY_LISTEN_PORT", "4990"))


class PadProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/") or self.path == "/health":
            self._proxy_request("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy_request("POST")
            return
        self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._proxy_request("DELETE")
            return
        self.send_error(405, "Method Not Allowed")

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._proxy_request("PUT")
            return
        self.send_error(405, "Method Not Allowed")

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self._proxy_request("OPTIONS")
            return
        self.send_response(204)
        self.end_headers()

    def _proxy_request(self, method: str) -> None:
        parsed = urlsplit(self.path)
        upstream_path = parsed.path
        if parsed.query:
            upstream_path += "?" + parsed.query
        body = None
        length = int(self.headers.get("Content-Length") or 0)
        if length > 0:
            body = self.rfile.read(length)
        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in {"host", "connection", "content-length"}
        }
        conn = http.client.HTTPConnection(TARGET_HOST, TARGET_PORT, timeout=30)
        try:
            conn.request(method, upstream_path, body=body, headers=headers)
            upstream = conn.getresponse()
            payload = upstream.read()
            self.send_response(upstream.status)
            for key, value in upstream.getheaders():
                lower = key.lower()
                if lower in {"transfer-encoding", "connection", "content-encoding"}:
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if payload:
                self.wfile.write(payload)
        except Exception as exc:
            message = ("proxy_error: " + str(exc)).encode("utf-8", errors="replace")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
        finally:
            conn.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), PadProxyHandler)
    try:
        server.serve_forever()
    finally:
        server.server_close()
