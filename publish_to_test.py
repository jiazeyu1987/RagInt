from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

DEFAULT_PROFILE_REL = Path("scripts") / "deploy" / "publish.profile.local.json"


@dataclass
class DeployContext:
    repo_root: Path
    compose_template: Path
    local_logs_dir: Path


def _ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _tag_now() -> str:
    return time.strftime("%Y%m%d_%H%M%S", time.localtime())


def log(msg: str) -> None:
    print(f"[{_ts()}] {msg}", flush=True)


def sh_quote(value: str) -> str:
    return "'" + str(value).replace("'", "'\"'\"'") + "'"


def run_cmd(argv: list[str], *, cwd: Path | None = None, timeout_s: int | None = None, check: bool = True) -> tuple[bool, str]:
    proc = subprocess.run(
        argv,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_s,
    )
    output = ((proc.stdout or "") + (proc.stderr or "")).strip()
    if check and proc.returncode != 0:
        cmd = " ".join(argv)
        raise RuntimeError(f"command failed ({proc.returncode}): {cmd}\n{output}")
    return proc.returncode == 0, output


def require_cmd(name: str) -> None:
    if shutil.which(name):
        return
    raise RuntimeError(f"required command not found: {name}")


def ssh_common_options(*, ssh_key: str | None, ssh_port: int) -> list[str]:
    opts = [
        "-o",
        "BatchMode=yes",
        "-o",
        "NumberOfPasswordPrompts=0",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ControlMaster=no",
        "-o",
        "LogLevel=ERROR",
    ]
    if os.name == "nt":
        opts = ["-F", "NUL", *opts, "-o", "UserKnownHostsFile=NUL", "-o", "GlobalKnownHostsFile=NUL"]
    else:
        opts = [*opts, "-o", "UserKnownHostsFile=/dev/null", "-o", "GlobalKnownHostsFile=/dev/null"]
    if ssh_key:
        opts.extend(["-i", ssh_key])
    opts.extend(["-p", str(int(ssh_port))])
    return opts


def scp_common_options(*, ssh_key: str | None, ssh_port: int) -> list[str]:
    opts = [
        "-o",
        "BatchMode=yes",
        "-o",
        "NumberOfPasswordPrompts=0",
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ControlMaster=no",
        "-o",
        "LogLevel=ERROR",
    ]
    if os.name == "nt":
        opts = ["-F", "NUL", *opts, "-o", "UserKnownHostsFile=NUL", "-o", "GlobalKnownHostsFile=NUL"]
    else:
        opts = [*opts, "-o", "UserKnownHostsFile=/dev/null", "-o", "GlobalKnownHostsFile=/dev/null"]
    if ssh_key:
        opts.extend(["-i", ssh_key])
    opts.extend(["-P", str(int(ssh_port))])
    return opts


def ssh_exec(args, command: str, *, check: bool = True, timeout_s: int = 900) -> tuple[bool, str]:
    host = f"{args.user}@{args.host}"
    remote_cmd = f"sh -lc {sh_quote(command)}"
    argv = ["ssh", *ssh_common_options(ssh_key=args.ssh_key, ssh_port=args.ssh_port), host, remote_cmd]
    return run_cmd(argv, timeout_s=timeout_s, check=check)


def scp_upload(args, local_path: Path, remote_path: str, *, timeout_s: int = 1800) -> None:
    host = f"{args.user}@{args.host}:{remote_path}"
    argv = ["scp", *scp_common_options(ssh_key=args.ssh_key, ssh_port=args.ssh_port), str(local_path), host]
    run_cmd(argv, timeout_s=timeout_s)


def wait_http_ok(url: str, timeout_s: int) -> None:
    deadline = time.time() + timeout_s
    last_error = ""
    while time.time() < deadline:
        req = Request(url, method="GET")
        try:
            with urlopen(req, timeout=4) as resp:
                status = int(getattr(resp, "status", 0) or 0)
                if 200 <= status < 500:
                    return
                last_error = f"http_status={status}"
        except URLError as exc:
            last_error = str(exc)
        except Exception as exc:  # pragma: no cover
            last_error = str(exc)
        time.sleep(2)
    raise RuntimeError(f"health check timeout for {url}: {last_error}")


def clean_ssh_output_lines(output: str) -> list[str]:
    cleaned: list[str] = []
    for raw in (output or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith("close - io is still pending on closed socket."):
            continue
        if lower.startswith("read:") and "io:" in lower:
            continue
        cleaned.append(line)
    return cleaned


def read_remote_env_value(args, env_file: str, key: str) -> str:
    cmd = (
        f"if [ -f {sh_quote(env_file)} ]; then "
        f"grep -E '^{key}=' {sh_quote(env_file)} | head -n1 | cut -d= -f2-; "
        f"fi"
    )
    _, out = ssh_exec(args, cmd, check=False, timeout_s=60)
    lines = clean_ssh_output_lines(out or "")
    if not lines:
        return ""
    return lines[0]


def write_remote_state(args, state_file: str, *, current_tag: str, previous_tag: str) -> None:
    body = "\n".join(
        [
            f"CURRENT_TAG={current_tag}",
            f"PREVIOUS_TAG={previous_tag}",
            f"UPDATED_AT={_ts()}",
            "",
        ]
    )
    cmd = f"cat > {sh_quote(state_file)} <<'EOF'\n{body}EOF"
    ssh_exec(args, cmd, timeout_s=60)


def update_remote_env(args, runtime_dir: str, *, image_tag: str, frontend_port: int, backend_port: int) -> None:
    ts = time.strftime("%Y%m%d_%H%M%S", time.localtime())
    script = f"""
set -eu
cd {sh_quote(runtime_dir)}
if [ -f .env ]; then cp .env .env.bak.{ts}; fi
touch .env
set_kv() {{
  key="$1"
  val="$2"
  if grep -q "^${{key}}=" .env; then
    sed -i "s|^${{key}}=.*|${{key}}=${{val}}|" .env
  else
    printf '%s=%s\\n' "${{key}}" "${{val}}" >> .env
  fi
}}
set_default() {{
  key="$1"
  val="$2"
  if ! grep -q "^${{key}}=" .env; then
    printf '%s=%s\\n' "${{key}}" "${{val}}" >> .env
  fi
}}
drop_kv() {{
  key="$1"
  if grep -q "^${{key}}=" .env; then
    sed -i "/^${{key}}=/d" .env
  fi
}}
set_kv IMAGE_TAG {sh_quote(image_tag)}
set_kv FRONTEND_PORT {sh_quote(str(frontend_port))}
set_kv BACKEND_PORT {sh_quote(str(backend_port))}
set_kv BACKEND_DATA_DIR ./data/backend
set_default RAGINT_HOST 0.0.0.0
set_default RAGINT_PORT 8000
set_default RAGINT_DEBUG 0
set_default RAGINT_STATE_BACKEND redis
set_default RAGINT_REDIS_URL redis://redis:6379/0
set_default RAGINT_CORS_ORIGINS http://localhost:{frontend_port},http://127.0.0.1:{frontend_port}
set_default RAGINT_ENABLE_LEGACY_FILE_BOOTSTRAP 0
set_default BAILIAN_TTS_VOICE longxiaochun
drop_kv RAGINT_CONFIG_FILE
drop_kv RAGINT_CONFIG_PATH
"""
    ssh_exec(args, script, timeout_s=90)


def ensure_remote_layout(args, remote_dir: str) -> None:
    cmd = (
        f"mkdir -p {sh_quote(remote_dir)}/releases "
        f"{sh_quote(remote_dir)}/runtime "
        f"{sh_quote(remote_dir)}/runtime/data/backend"
    )
    ssh_exec(args, cmd, timeout_s=90)


def normalize_rel_path(raw: str) -> Path:
    text = str(raw or "").strip()
    if not text:
        raise RuntimeError("path value is empty")
    p = Path(text.replace("\\", "/"))
    if p.is_absolute():
        raise RuntimeError(f"path must be relative: {text}")
    parts = [seg for seg in p.parts if seg not in ("", ".")]
    if not parts or any(seg == ".." for seg in parts):
        raise RuntimeError(f"path must not contain parent traversal: {text}")
    return Path(*parts)


def resolve_local_data_dir(args, ctx: DeployContext) -> Path:
    raw = str(args.local_data_dir or "backend/data").strip()
    p = Path(raw)
    if not p.is_absolute():
        p = (ctx.repo_root / p).resolve()
    else:
        p = p.resolve()
    return p


def list_sync_db_rel_paths(*, local_data_dir: Path, explicit_paths: list[str], all_db: bool) -> list[Path]:
    items: list[Path] = []
    seen: set[str] = set()

    def add_path(p: Path) -> None:
        key = p.as_posix()
        if key in seen:
            return
        seen.add(key)
        items.append(p)

    if all_db:
        for db in sorted(local_data_dir.rglob("*.db"), key=lambda x: x.as_posix().lower()):
            if not db.is_file():
                continue
            add_path(db.relative_to(local_data_dir))

    for raw in explicit_paths:
        add_path(normalize_rel_path(raw))

    if not items:
        add_path(Path("app_settings.db"))

    return items


def run_sync_db(args, ctx: DeployContext) -> None:
    require_cmd("ssh")
    require_cmd("scp")

    local_data_dir = resolve_local_data_dir(args, ctx)
    if not local_data_dir.exists() or not local_data_dir.is_dir():
        raise RuntimeError(f"local data directory not found: {local_data_dir}")

    rel_paths = list_sync_db_rel_paths(
        local_data_dir=local_data_dir,
        explicit_paths=list(args.db or []),
        all_db=bool(args.all_db),
    )

    remote_dir = args.remote_dir.rstrip("/")
    runtime_dir = f"{remote_dir}/runtime"
    remote_data_dir = f"{runtime_dir}/data/backend"
    ensure_remote_layout(args, remote_dir)

    synced: list[str] = []
    skipped: list[str] = []
    ts = time.strftime("%Y%m%d_%H%M%S", time.localtime())
    for rel in rel_paths:
        local_path = (local_data_dir / rel).resolve()
        try:
            local_path.relative_to(local_data_dir)
        except Exception as exc:
            raise RuntimeError(f"db path escaped local data dir: {local_path}") from exc

        rel_posix = rel.as_posix()
        remote_path = f"{remote_data_dir}/{rel_posix}"
        remote_parent = f"{remote_data_dir}/{rel.parent.as_posix()}" if rel.parent != Path(".") else remote_data_dir

        if not local_path.exists() or not local_path.is_file():
            if args.skip_missing:
                log(f"[sync-db] skip missing local file: {local_path}")
                skipped.append(rel_posix)
                continue
            raise RuntimeError(f"local db file not found: {local_path}")

        ssh_exec(args, f"mkdir -p {sh_quote(remote_parent)}", timeout_s=60)
        if args.backup_remote:
            backup = f"{remote_path}.bak.{ts}"
            ssh_exec(
                args,
                f"if [ -f {sh_quote(remote_path)} ]; then cp {sh_quote(remote_path)} {sh_quote(backup)}; fi",
                timeout_s=60,
            )

        scp_upload(args, local_path, remote_path, timeout_s=900)
        size_kb = round(local_path.stat().st_size / 1024, 2)
        log(f"[sync-db] uploaded {rel_posix} ({size_kb} KB)")
        synced.append(rel_posix)

    if args.restart_backend:
        log("[sync-db] restart backend container")
        ssh_exec(
            args,
            f"cd {sh_quote(runtime_dir)} && docker compose --env-file .env -f docker-compose.yml up -d backend",
            timeout_s=300,
        )

    log(f"[sync-db] done synced={len(synced)} skipped={len(skipped)}")


def write_local_release_record(ctx: DeployContext, filename: str, payload: dict) -> Path:
    ctx.local_logs_dir.mkdir(parents=True, exist_ok=True)
    p = ctx.local_logs_dir / filename
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def load_profile(profile_path: Path) -> dict:
    try:
        data = json.loads(profile_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"failed to read profile json: {profile_path}\n{exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"profile json must be an object: {profile_path}")
    return data


def pick_str(cli_value, profile: dict, key: str, default: str) -> str:
    if cli_value is not None and str(cli_value).strip() != "":
        return str(cli_value).strip()
    value = profile.get(key, default)
    if value is None:
        return default
    return str(value).strip()


def pick_int(cli_value, profile: dict, key: str, default: int) -> int:
    if cli_value is not None:
        value = cli_value
    else:
        value = profile.get(key, default)
    try:
        return int(value)
    except Exception as exc:
        raise RuntimeError(f"invalid integer for {key}: {value}") from exc


def parse_bool(value, key: str) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off", ""}:
        return False
    raise RuntimeError(f"invalid boolean for {key}: {value}")


def pick_bool(cli_value, profile: dict, key: str, default: bool) -> bool:
    if cli_value is not None:
        return bool(cli_value)
    value = profile.get(key, default)
    return parse_bool(value, key)


def resolve_profile_path(repo_root: Path, raw_profile: str) -> Path:
    text = (raw_profile or "").strip()
    if not text:
        return (repo_root / DEFAULT_PROFILE_REL).resolve()
    p = Path(text)
    if not p.is_absolute():
        p = (repo_root / p).resolve()
    else:
        p = p.resolve()
    return p


def resolve_runtime_args(args, repo_root: Path) -> None:
    profile_path = resolve_profile_path(repo_root, args.profile)
    profile: dict = {}
    if profile_path.exists():
        profile = load_profile(profile_path)
        log(f"profile loaded: {profile_path}")
    elif (args.profile or "").strip():
        raise RuntimeError(f"profile not found: {profile_path}")
    else:
        log(f"profile not found, using cli/default values: {profile_path}")

    args.host = pick_str(args.host, profile, "host", "")
    args.user = pick_str(args.user, profile, "user", "root")
    args.ssh_port = pick_int(args.ssh_port, profile, "ssh_port", 22)
    args.remote_dir = pick_str(args.remote_dir, profile, "remote_dir", "/opt/ragint")
    args.frontend_port = pick_int(args.frontend_port, profile, "frontend_port", 4981)
    args.backend_port = pick_int(args.backend_port, profile, "backend_port", 8000)
    args.health_url = pick_str(args.health_url, profile, "health_url", "")
    args.version_url = pick_str(args.version_url, profile, "version_url", "")
    args.health_timeout_s = pick_int(args.health_timeout_s, profile, "health_timeout_s", 180)
    args.skip_health_check = pick_bool(args.skip_health_check, profile, "skip_health_check", False)
    args.ssh_key = pick_str(args.ssh_key, profile, "ssh_key", "")

    if not args.host:
        raise RuntimeError("host is required, pass --host or set profile field 'host'")

    if args.ssh_key:
        key_path = Path(args.ssh_key)
        if not key_path.is_absolute():
            key_path = (profile_path.parent / key_path).resolve()
        else:
            key_path = key_path.resolve()
        args.ssh_key = str(key_path)
        if not key_path.exists():
            raise RuntimeError(f"ssh key not found: {args.ssh_key}")


def run_publish(args, ctx: DeployContext) -> None:
    require_cmd("docker")
    require_cmd("ssh")
    require_cmd("scp")

    backend_image = f"ragint-backend:{args.tag}"
    fronted_image = f"ragint-fronted:{args.tag}"
    remote_dir = args.remote_dir.rstrip("/")
    runtime_dir = f"{remote_dir}/runtime"
    release_dir = f"{remote_dir}/releases"
    remote_tar = f"{release_dir}/ragint_release_{args.tag}.tar"
    remote_compose = f"{runtime_dir}/docker-compose.yml"
    remote_env = f"{runtime_dir}/.env"
    remote_state = f"{runtime_dir}/release_state.env"

    tar_local = Path(tempfile.gettempdir()) / f"ragint_release_{args.tag}.tar"
    log(f"[1/8] build backend image: {backend_image}")
    run_cmd(["docker", "build", "-f", "backend/Dockerfile", "-t", backend_image, "."], cwd=ctx.repo_root, timeout_s=7200)
    log(f"[1/8] build fronted image: {fronted_image}")
    run_cmd(
        [
            "docker",
            "build",
            "-f",
            "fronted/Dockerfile",
            "--build-arg",
            "REACT_APP_BACKEND_URL=",
            "-t",
            fronted_image,
            ".",
        ],
        cwd=ctx.repo_root,
        timeout_s=7200,
    )

    log("[2/8] export images")
    run_cmd(["docker", "save", backend_image, fronted_image, "-o", str(tar_local)], cwd=ctx.repo_root, timeout_s=7200)
    if not tar_local.exists():
        raise RuntimeError(f"docker save did not produce tar: {tar_local}")
    tar_size_mb = round(tar_local.stat().st_size / (1024 * 1024), 2)
    log(f"local tar: {tar_local} ({tar_size_mb} MB)")

    log("[3/8] prepare remote directories")
    ensure_remote_layout(args, remote_dir)

    log("[4/8] upload compose + images")
    scp_upload(args, ctx.compose_template, remote_compose, timeout_s=300)
    scp_upload(args, tar_local, remote_tar, timeout_s=7200)

    log("[5/8] remote docker load")
    ssh_exec(args, f"docker load -i {sh_quote(remote_tar)}", timeout_s=7200)
    ssh_exec(args, f"rm -f {sh_quote(remote_tar)}", check=False, timeout_s=60)

    previous_tag = read_remote_env_value(args, remote_env, "IMAGE_TAG")
    log(f"previous IMAGE_TAG={previous_tag or '(none)'}")

    log("[6/8] update remote env + compose up")
    update_remote_env(
        args,
        runtime_dir,
        image_tag=args.tag,
        frontend_port=args.frontend_port,
        backend_port=args.backend_port,
    )
    ssh_exec(
        args,
        f"cd {sh_quote(runtime_dir)} && docker compose --env-file .env -f docker-compose.yml up -d",
        timeout_s=900,
    )

    if not args.skip_health_check:
        health_url = args.health_url or f"http://{args.host}:{args.frontend_port}/health"
        version_url = args.version_url or f"http://{args.host}:{args.frontend_port}/api/version"
        log(f"[7/8] health check: {health_url}")
        wait_http_ok(health_url, args.health_timeout_s)
        log(f"[7/8] version check: {version_url}")
        wait_http_ok(version_url, args.health_timeout_s)

    log("[8/8] write release state")
    write_remote_state(args, remote_state, current_tag=args.tag, previous_tag=previous_tag)
    record = {
        "mode": "publish",
        "ok": True,
        "host": args.host,
        "user": args.user,
        "tag": args.tag,
        "previous_tag": previous_tag,
        "frontend_port": args.frontend_port,
        "backend_port": args.backend_port,
        "created_at": _ts(),
    }
    local_record = write_local_release_record(ctx, f"publish-{args.tag}.json", record)
    remote_record = f"{release_dir}/publish-{args.tag}.json"
    scp_upload(args, local_record, remote_record, timeout_s=120)
    if not args.keep_local_tar:
        try:
            tar_local.unlink(missing_ok=True)
        except Exception:
            pass
    log(f"publish success: tag={args.tag}")


def run_rollback(args, ctx: DeployContext) -> None:
    require_cmd("ssh")
    remote_dir = args.remote_dir.rstrip("/")
    runtime_dir = f"{remote_dir}/runtime"
    remote_env = f"{runtime_dir}/.env"
    remote_state = f"{runtime_dir}/release_state.env"

    current_tag = read_remote_env_value(args, remote_env, "IMAGE_TAG")
    target_tag = (args.to_tag or "").strip()
    if not target_tag:
        target_tag = read_remote_env_value(args, remote_state, "PREVIOUS_TAG")
    if not target_tag:
        raise RuntimeError("rollback target tag is empty; pass --to-tag explicitly")

    log(f"rollback target={target_tag} current={current_tag or '(none)'}")
    ssh_exec(args, f"docker image inspect {sh_quote(f'ragint-backend:{target_tag}')} >/dev/null", timeout_s=60)
    ssh_exec(args, f"docker image inspect {sh_quote(f'ragint-fronted:{target_tag}')} >/dev/null", timeout_s=60)

    update_remote_env(
        args,
        runtime_dir,
        image_tag=target_tag,
        frontend_port=args.frontend_port,
        backend_port=args.backend_port,
    )
    ssh_exec(
        args,
        f"cd {sh_quote(runtime_dir)} && docker compose --env-file .env -f docker-compose.yml up -d",
        timeout_s=900,
    )

    if not args.skip_health_check:
        health_url = args.health_url or f"http://{args.host}:{args.frontend_port}/health"
        wait_http_ok(health_url, args.health_timeout_s)

    write_remote_state(args, remote_state, current_tag=target_tag, previous_tag=(current_tag or ""))
    record = {
        "mode": "rollback",
        "ok": True,
        "host": args.host,
        "user": args.user,
        "tag": target_tag,
        "previous_tag": current_tag or "",
        "frontend_port": args.frontend_port,
        "backend_port": args.backend_port,
        "created_at": _ts(),
    }
    write_local_release_record(ctx, f"rollback-{target_tag}.json", record)
    log(f"rollback success: tag={target_tag}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Publish RagInt frontend/backend to test server using docker images.")
    sub = p.add_subparsers(dest="command", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument(
            "--profile",
            default="",
            help="local json profile; default is scripts/deploy/publish.profile.local.json",
        )
        sp.add_argument("--host", default=None, help="test server host or ip")
        sp.add_argument("--user", default=None)
        sp.add_argument("--ssh-port", type=int, default=None)
        sp.add_argument("--ssh-key", default=None, help="path to ssh private key")
        sp.add_argument("--remote-dir", default=None)
        sp.add_argument("--frontend-port", type=int, default=None)
        sp.add_argument("--backend-port", type=int, default=None)
        sp.add_argument("--health-url", default=None, help="default: http://<host>:<frontend_port>/health")
        sp.add_argument("--version-url", default=None, help="default: http://<host>:<frontend_port>/api/version")
        sp.add_argument("--health-timeout-s", type=int, default=None)
        sp.add_argument("--skip-health-check", action="store_const", const=True, default=None)

    pub = sub.add_parser("publish", help="build images locally and deploy to remote test server")
    add_common(pub)
    pub.add_argument("--tag", default=_tag_now())
    pub.add_argument("--keep-local-tar", action="store_true")

    rb = sub.add_parser("rollback", help="rollback remote runtime to an older image tag")
    add_common(rb)
    rb.add_argument("--to-tag", default="", help="target image tag; defaults to PREVIOUS_TAG in remote state")

    sync_db = sub.add_parser("sync-db", help="sync local sqlite db files to remote runtime data directory")
    add_common(sync_db)
    sync_db.add_argument(
        "--local-data-dir",
        default="backend/data",
        help="local backend data directory; default: backend/data",
    )
    sync_db.add_argument(
        "--db",
        action="append",
        default=[],
        help="relative db file path under local-data-dir (repeatable), e.g. app_settings.db",
    )
    sync_db.add_argument("--all-db", action="store_true", help="sync all *.db files under local-data-dir recursively")
    sync_db.add_argument("--skip-missing", action="store_true", help="skip missing local db files instead of failing")
    sync_db.add_argument("--backup-remote", action="store_true", help="backup existing remote db files before overwrite")
    sync_db.add_argument("--restart-backend", action="store_true", help="restart backend service after sync")

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parent
    resolve_runtime_args(args, repo_root)
    ctx = DeployContext(
        repo_root=repo_root,
        compose_template=repo_root / "scripts" / "deploy" / "docker-compose.remote.yml",
        local_logs_dir=repo_root / "scripts" / "deploy" / "logs",
    )
    if not ctx.compose_template.exists():
        raise RuntimeError(f"compose template not found: {ctx.compose_template}")

    if args.command == "publish":
        run_publish(args, ctx)
        return 0
    if args.command == "rollback":
        run_rollback(args, ctx)
        return 0
    if args.command == "sync-db":
        run_sync_db(args, ctx)
        return 0
    raise RuntimeError(f"unknown command: {args.command}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        log(f"[ERROR] {exc}")
        raise SystemExit(1)
