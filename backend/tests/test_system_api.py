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
    os.environ.pop("RAGINT_DIAGNOSTICS_KEY", None)
    os.environ["RAGINT_VERSION"] = "0.0.0-test"
    app = create_app()
    c = app.test_client()

    r = c.get("/api/diagnostics")
    assert r.status_code == 200
    assert (r.headers.get("content-type") or "").lower().startswith("application/zip")

    z = zipfile.ZipFile(BytesIO(r.data))
    names = set(z.namelist())
    assert "version.json" in names
    assert "events_recent.json" in names

    ver = json.loads(z.read("version.json").decode("utf-8"))
    assert ver["version"] == "0.0.0-test"

