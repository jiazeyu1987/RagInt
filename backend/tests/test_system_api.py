from __future__ import annotations

import json
import os
import zipfile
from io import BytesIO

from backend.app import create_app


def test_api_version():
    os.environ["RAGINT_VERSION"] = "1.2.3-test"
    app = create_app()
    c = app.test_client()
    r = c.get("/api/version")
    assert r.status_code == 200
    payload = r.get_json()
    assert payload["name"] == "ragint-backend"
    assert payload["version"] == "1.2.3-test"


def test_api_diagnostics_zip():
    os.environ["RAGINT_DIAGNOSTICS_KEY"] = "diag-test-key"
    os.environ["RAGINT_DIAGNOSTICS_ALLOW_NO_KEY"] = "0"
    os.environ["RAGINT_VERSION"] = "0.0.0-test"
    app = create_app()
    c = app.test_client()

    r = c.get("/api/diagnostics", headers={"X-Diagnostics-Key": "diag-test-key"})
    assert r.status_code == 200
    assert (r.headers.get("content-type") or "").lower().startswith("application/zip")

    z = zipfile.ZipFile(BytesIO(r.data))
    names = set(z.namelist())
    assert "version.json" in names
    assert "events_recent.json" in names
    assert "asr_timeline_recent.json" in names

    ver = json.loads(z.read("version.json").decode("utf-8"))
    assert ver["version"] == "0.0.0-test"

    asr_timeline = json.loads(z.read("asr_timeline_recent.json").decode("utf-8"))
    assert "items" in asr_timeline


def test_api_diagnostics_requires_key_when_configured():
    os.environ["RAGINT_DIAGNOSTICS_KEY"] = "diag-test-key-required"
    os.environ["RAGINT_DIAGNOSTICS_ALLOW_NO_KEY"] = "0"
    app = create_app()
    c = app.test_client()
    r = c.get("/api/diagnostics")
    assert r.status_code == 403
