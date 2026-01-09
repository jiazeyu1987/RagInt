from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_package_release_dry_run_outputs_ok(tmp_path):
    repo_root = Path(__file__).resolve().parents[2]
    script = repo_root / "scripts" / "package_release.py"
    assert script.exists()

    res = subprocess.run(
        [sys.executable, str(script), "--mode", "full", "--version", "0.0.0-test", "--output-dir", str(tmp_path), "--dry-run"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        check=False,
    )
    assert res.returncode == 0, res.stderr
    payload = json.loads((res.stdout or "").strip().splitlines()[-1])
    assert payload["ok"] is True
    assert payload["mode"] == "full"
    assert payload["files"] > 0

