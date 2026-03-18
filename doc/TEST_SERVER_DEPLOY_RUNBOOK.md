# TEST SERVER DEPLOY RUNBOOK (LLM-READY)

## 1. Scope
This document describes exactly how to:
1. log in to the test server,
2. publish local frontend + backend to the test server,
3. verify runtime status,
4. rollback when needed.

It is written so a new computer and a new LLM can execute it end-to-end without prior project knowledge.

## 2. Project Paths and Entry Points
1. Local repo root: `D:\ProjectPackage\RagInt`
2. One-click publish launcher: `publish_test_oneclick.bat`
3. Main deploy script: `publish_to_test.py`
4. Remote compose template: `scripts/deploy/docker-compose.remote.yml`
5. Local profile file: `scripts/deploy/publish.profile.local.json`
6. Example profile: `scripts/deploy/publish.profile.example.json`

## 3. Verified Test Environment Parameters
These values are currently in use and were verified on 2026-03-18.

1. Test server host: `172.30.30.58`
2. SSH user: `root`
3. SSH port: `22`
4. Remote deploy root: `/opt/ragint`
5. Frontend public port: `4981`
6. Backend public port: `8000`
7. Frontend URL: `http://172.30.30.58:4981/`
8. Login URL: `http://172.30.30.58:4981/login`
9. Chat URL: `http://172.30.30.58:4981/chat`
10. Health URL: `http://172.30.30.58:4981/health`
11. Version URL: `http://172.30.30.58:4981/api/version`

## 4. Authentication Model
Deployment uses SSH key authentication, not password authentication.

1. Current machine key path: `C:/Users/BJB110/.ssh/id_rsa`
2. A new computer must have a valid private key that can access `root@172.30.30.58`.
3. Quick SSH check:

```powershell
ssh -i C:\Users\<your-user>\.ssh\id_rsa root@172.30.30.58 -p 22 "echo ok"
```

Expected output contains `ok`.

## 5. One-Click Publish Workflow

### 5.1 First Run
1. Open `D:\ProjectPackage\RagInt`.
2. Run `publish_test_oneclick.bat`.
3. If profile file is missing, the script auto-creates:
   `scripts/deploy/publish.profile.local.json`
4. Script opens profile in Notepad and exits.
5. Fill profile values and run again.

### 5.2 One-Click Command
```powershell
cmd /c publish_test_oneclick.bat
```

### 5.3 Current Profile Content
```json
{
  "host": "172.30.30.58",
  "user": "root",
  "ssh_port": 22,
  "ssh_key": "C:/Users/BJB110/.ssh/id_rsa",
  "remote_dir": "/opt/ragint",
  "frontend_port": 4981,
  "backend_port": 8000,
  "health_timeout_s": 180,
  "skip_health_check": false
}
```

## 6. What `publish_to_test.py publish` Does
The publish command is strict-fail (no fallback path). Steps:

1. Build backend image locally: `ragint-backend:<tag>`.
2. Build frontend image locally: `ragint-fronted:<tag>`.
3. Export both images into one tar file.
4. Create remote directories under `/opt/ragint`.
5. Upload compose file and image tar to remote.
6. Run remote `docker load`.
7. Update remote runtime `.env`.
8. Run remote `docker compose up -d`.
9. Run health check and version check.
10. Write release state and release record.

## 7. Remote Runtime Layout
All runtime paths are under `/opt/ragint`.

1. Runtime dir: `/opt/ragint/runtime`
2. Releases dir: `/opt/ragint/releases`
3. Compose file: `/opt/ragint/runtime/docker-compose.yml`
4. Runtime env file: `/opt/ragint/runtime/.env`
5. Release state file: `/opt/ragint/runtime/release_state.env`
6. Backend persistent data: `/opt/ragint/runtime/data/backend`
7. Runtime config DB: `/opt/ragint/runtime/data/backend/ragflow_config.db`

Recommended server-side `.env` keys for first bootstrap seed:
1. `RAGFLOW_API_KEY`
2. `RAGFLOW_BASE_URL`
3. `BAILIAN_API_KEY`
4. `BAILIAN_TTS_VOICE` (defaulted by deploy script to `longxiaochun` if absent)

Local deploy records:
1. `scripts/deploy/logs/publish-<tag>.json`
2. `scripts/deploy/logs/rollback-<tag>.json`

## 8. Runtime Containers
Services expected after deploy:
1. `ragint-fronted`
2. `ragint-backend`
3. `ragint-redis`

Remote status commands:
```bash
cd /opt/ragint/runtime
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail=200
```

## 9. Accessing the Deployed Program
Use these URLs:

1. Frontend root: `http://172.30.30.58:4981/`
2. Frontend login: `http://172.30.30.58:4981/login`
3. Frontend chat: `http://172.30.30.58:4981/chat`
4. Frontend health: `http://172.30.30.58:4981/health`
5. Frontend-proxied backend version: `http://172.30.30.58:4981/api/version`
6. Direct backend (debug): `http://172.30.30.58:8000`

## 10. Rollback

### 10.1 Rollback to Specific Tag
```powershell
python publish_to_test.py rollback `
  --profile scripts/deploy/publish.profile.local.json `
  --to-tag 20260318_102522
```

### 10.2 Rollback to Previous Tag
```powershell
python publish_to_test.py rollback --profile scripts/deploy/publish.profile.local.json
```

If `--to-tag` is omitted, the script reads `PREVIOUS_TAG` from remote `release_state.env`.

### 10.3 Sync Local DB to Remote Runtime
Use this when remote runtime DB is empty and you want to seed it from local `backend/data`.

Sync only app settings DB (safe default):
```powershell
python publish_to_test.py sync-db `
  --profile scripts/deploy/publish.profile.local.json `
  --db app_settings.db `
  --backup-remote
```

Sync all local sqlite DB files under `backend/data`:
```powershell
python publish_to_test.py sync-db `
  --profile scripts/deploy/publish.profile.local.json `
  --all-db `
  --backup-remote
```

## 11. New Computer Setup Checklist
Run in this order:

1. Install Docker Desktop (must provide `docker` and `docker compose`).
2. Install Python 3.10+ (must provide `python`).
3. Install OpenSSH client (`ssh`, `scp`).
4. Clone repo to local disk.
5. Place valid private key on new machine.
6. Set key path in `scripts/deploy/publish.profile.local.json`.
7. Validate SSH access with `echo ok` command.
8. Run one-click publish: `cmd /c publish_test_oneclick.bat`.
9. Validate URLs in Section 9.

## 12. Common Failures and Fixes

### 12.1 SSH Permission Denied
Symptoms:
1. `Permission denied (publickey)`.
2. Connection closed immediately.

Checks:
1. Confirm `ssh_key` path in profile.
2. Confirm key has server access.
3. Confirm `host/user/port`.

### 12.2 Health Check Fails
Checks:
1. `docker compose ps` on remote.
2. Read backend and frontend logs.
3. Confirm firewall allows `4981` and `8000`.

### 12.3 Build Fails on Native Python Packages
Backend Dockerfile already installs build dependencies:
1. `build-essential`
2. `gcc`
3. `python3-dev`
4. `portaudio19-dev`
5. `libasound2-dev`
6. `ffmpeg`

### 12.4 Strict Failure Policy
Deployment intentionally stops on first error.
Do not add fallback/hidden retry logic; fix the root cause and rerun.

## 13. Direct Instructions for Another LLM
If another LLM must execute deployment on a new machine, provide this exact sequence:

1. Read this file: `doc/TEST_SERVER_DEPLOY_RUNBOOK.md`.
2. Read profile: `scripts/deploy/publish.profile.local.json`.
3. Validate SSH key and connectivity.
4. Run: `cmd /c publish_test_oneclick.bat`.
5. Verify:
   1. `http://172.30.30.58:4981/health`
   2. `http://172.30.30.58:4981/api/version`
   3. `http://172.30.30.58:4981/login`
6. If failed, return full raw error output and stop.
