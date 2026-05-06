from __future__ import annotations

import json
import logging
import os
import socket
import threading
from pathlib import Path
from urllib.parse import urlparse

import requests
from ragflow_sdk import RAGFlow

from backend.services.env_overrides import apply_env_overrides


class RagflowInitError(RuntimeError):
    def __init__(self, code: str, message: str, *, details: dict | None = None):
        super().__init__(str(message))
        self.code = str(code or "ragflow_init_failed")
        self.details = dict(details or {})


def _ragflow_chat_to_dict(chat):
    if chat is None:
        return None
    if hasattr(chat, "name"):
        return {"id": getattr(chat, "id", None), "name": getattr(chat, "name", None)}
    if isinstance(chat, dict):
        return {"id": chat.get("id"), "name": chat.get("name")}
    return {"id": None, "name": str(chat)}


def _ragflow_session_to_dict(session):
    if session is None:
        return None
    if isinstance(session, dict):
        return {"id": session.get("id"), "name": session.get("name") or session.get("title")}
    return {"id": getattr(session, "id", None), "name": getattr(session, "name", None) or getattr(session, "title", None)}


def _ragflow_response_text(resp) -> str:
    def _to_text(value) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, (dict, list)):
            try:
                return json.dumps(value, ensure_ascii=False)
            except Exception:
                return str(value)
        return str(value)

    def _chunk_text(chunk) -> str:
        if chunk is None:
            return ""
        if isinstance(chunk, str):
            return chunk
        for attr in ("content", "answer", "text"):
            if hasattr(chunk, attr):
                txt = _to_text(getattr(chunk, attr))
                if txt:
                    return txt
        if isinstance(chunk, dict):
            for key in ("answer", "content", "text"):
                if chunk.get(key):
                    return _to_text(chunk.get(key))
            return _to_text(chunk)
        return _to_text(chunk)

    if isinstance(resp, str):
        return resp
    if hasattr(resp, "content"):
        return _to_text(getattr(resp, "content"))
    if isinstance(resp, dict):
        for key in ("answer", "content", "text"):
            if key in resp and resp.get(key):
                return _to_text(resp.get(key))
    if hasattr(resp, "__iter__"):
        parts: list[str] = []
        current = ""
        for chunk in resp:
            txt = _chunk_text(chunk)
            if not txt:
                continue
            if not current:
                current = txt
                continue
            if txt.startswith(current):
                current = txt
                continue
            if current.startswith(txt):
                continue
            parts.append(current)
            current = txt
        if current:
            parts.append(current)
        return "".join(parts)
    return str(resp or "")


def _ragflow_named_value(item):
    if item is None:
        return ""
    if hasattr(item, "name"):
        return str(getattr(item, "name") or "").strip()
    if isinstance(item, dict):
        return str(item.get("name") or item.get("title") or "").strip()
    return str(item).strip()


def _find_named_resource(list_fn, expected_name: str, *, filter_key: str, error_code: str, page_size: int = 100):
    name = str(expected_name or "").strip()
    if not name:
        return None

    page = 1
    while True:
        items = list_fn(page=page, page_size=page_size, **{filter_key: name})
        if items is None or not isinstance(items, (list, tuple)):
            raise RuntimeError(error_code)
        for item in items:
            if _ragflow_named_value(item) == name:
                return item
        if len(items) < page_size:
            return None
        page += 1


def find_dataset_by_name(client, dataset_name):
    dataset = _find_named_resource(
        client.list_datasets,
        dataset_name,
        filter_key="name",
        error_code="ragflow_list_datasets_unexpected_response",
    )
    if dataset is None:
        return None
    if hasattr(dataset, "id"):
        return dataset.id
    if isinstance(dataset, dict):
        return dataset.get("id") or dataset
    return dataset


def find_chat_by_name(client, chat_name):
    return _find_named_resource(
        client.list_chats,
        chat_name,
        filter_key="name",
        error_code="ragflow_list_chats_unexpected_response",
    )


def _is_duplicate_chat_name_error(err: Exception) -> bool:
    msg = str(err or "").strip().lower()
    return "duplicated chat name" in msg or "duplicate chat name" in msg


class RagflowService:
    def __init__(self, config_path: Path, logger: logging.Logger | None = None, config_store=None):
        self._logger = logger or logging.getLogger(__name__)
        self._config_path = config_path
        self._config_store = config_store
        self._config_scope_id = "global"
        self._cfg_lock = threading.Lock()
        self._last_loaded_cfg: dict | None = None
        self._last_loaded_revision: tuple[str, int] | None = None

        self.client = None
        self.default_chat_name = None
        self.dataset_id = None

        self._sessions = {}
        self._lock = threading.Lock()

    @staticmethod
    def _clean_cfg(cfg: dict | None) -> dict:
        out = dict(cfg if isinstance(cfg, dict) else {})
        out.pop("__meta", None)
        return out

    @staticmethod
    def _legacy_file_bootstrap_enabled() -> bool:
        raw = str(os.environ.get("RAGINT_ENABLE_LEGACY_FILE_BOOTSTRAP", "0") or "0").strip().lower()
        return raw in ("1", "true", "yes", "on")

    def _build_bootstrap_seed(self, *, file_raw: dict) -> dict:
        """
        Build a one-time seed config only when DB is empty.

        Steady-state runtime config source is DB only.
        - ENV can participate in initial bootstrap.
        - Legacy file is opt-in via RAGINT_ENABLE_LEGACY_FILE_BOOTSTRAP=1.
        """
        base: dict = {}
        if self._legacy_file_bootstrap_enabled():
            base = self._clean_cfg(file_raw if isinstance(file_raw, dict) else {})
        seeded = apply_env_overrides(base)
        return self._clean_cfg(seeded if isinstance(seeded, dict) else {})

    def _read_file_raw(self) -> tuple[dict, int]:
        if not self._config_path.exists():
            return {}, -1
        try:
            st = self._config_path.stat()
            mtime_ns = int(getattr(st, "st_mtime_ns", int(st.st_mtime * 1e9)))
        except OSError as e:
            self._logger.warning("ragflow_config_file_stat_failed path=%s err=%s", str(self._config_path), e)
            raise
        try:
            with open(self._config_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except json.JSONDecodeError as e:
            self._logger.warning("ragflow_config_file_json_invalid path=%s err=%s", str(self._config_path), e)
            raise
        except OSError as e:
            self._logger.warning("ragflow_config_file_read_failed path=%s err=%s", str(self._config_path), e)
            raise
        if not isinstance(raw, dict):
            raise RuntimeError(f"ragflow_config_file_invalid: expected object at {self._config_path}")
        return raw, int(mtime_ns)

    def _api_request(self, *, method: str, path: str, json_body: dict | None = None, timeout: int = 15):
        cfg = self._last_loaded_cfg if self._last_loaded_cfg is not None else self.load_config()
        api_key = (cfg.get("api_key") or "").strip()
        base_url = str(cfg.get("base_url") or "").strip().rstrip("/")
        if not api_key or api_key in ["YOUR_RAGFLOW_API_KEY_HERE", "your_api_key_here"]:
            raise RuntimeError("ragflow_api_key_invalid")
        if not base_url:
            raise RuntimeError("ragflow_base_url_missing")
        url = f"{base_url}{path}"
        headers = {"Authorization": f"Bearer {api_key}"}
        resp = requests.request(method=method.upper(), url=url, headers=headers, json=json_body, timeout=timeout)
        resp.raise_for_status()
        if not resp.content:
            return {}
        try:
            return resp.json()
        except ValueError as e:
            self._logger.warning(
                "ragflow_api_response_json_parse_failed method=%s path=%s err=%s",
                method.upper(),
                path,
                e,
            )
            raise RuntimeError("ragflow_api_response_json_parse_failed") from e

    @staticmethod
    def _extract_data_list(payload):
        if isinstance(payload, dict):
            data = payload.get("data")
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                docs = data.get("docs")
                if isinstance(docs, list):
                    return docs
        if isinstance(payload, list):
            return payload
        raise RuntimeError("ragflow_api_response_unexpected_shape")

    @staticmethod
    def _api_payload_failed(payload) -> bool:
        if not isinstance(payload, dict):
            return False
        code = payload.get("code")
        if code not in (None, 0):
            return True
        return payload.get("ok") is False

    @staticmethod
    def _resolve_base_endpoint(base_url: str) -> tuple[str, str, int]:
        raw = str(base_url or "").strip().rstrip("/")
        if not raw:
            raise RagflowInitError(
                "ragflow_base_url_missing",
                "RAGFlow初始化失败: 缺少 base_url 配置。",
                details={"base_url": raw},
            )

        parsed = urlparse(raw)
        scheme = str(parsed.scheme or "").strip().lower()
        if scheme not in ("http", "https"):
            raise RagflowInitError(
                "ragflow_base_url_invalid",
                f"RAGFlow初始化失败: base_url 非法: {raw}",
                details={"base_url": raw, "scheme": scheme},
            )

        host = str(parsed.hostname or "").strip()
        if not host:
            raise RagflowInitError(
                "ragflow_base_url_invalid",
                f"RAGFlow初始化失败: base_url 缺少主机名: {raw}",
                details={"base_url": raw, "scheme": scheme},
            )

        try:
            port = int(parsed.port or (443 if scheme == "https" else 80))
        except ValueError as e:
            raise RagflowInitError(
                "ragflow_base_url_invalid",
                f"RAGFlow初始化失败: base_url 端口非法: {raw}",
                details={"base_url": raw, "scheme": scheme},
            ) from e
        return raw, host, port

    @classmethod
    def _ensure_base_url_reachable(cls, base_url: str, *, timeout_s: float = 2.0) -> tuple[str, str, int]:
        raw, host, port = cls._resolve_base_endpoint(base_url)
        try:
            with socket.create_connection((host, port), timeout=float(timeout_s)):
                return raw, host, port
        except OSError as e:
            raise RagflowInitError(
                "ragflow_base_url_unreachable",
                (
                    f"RAGFlow初始化失败: 无法连接 {raw}（host={host}, port={port}, err={e}）。"
                    "请先启动 RAGFlow 服务，或把运行时配置中的 base_url 改成正确地址。"
                ),
                details={
                    "base_url": raw,
                    "host": host,
                    "port": port,
                    "socket_error": str(e),
                },
            ) from e

    def load_config(self, *, force: bool = False) -> dict:
        """
        Load runtime config with precedence:
        1) DB store (if configured)
        2) One-time bootstrap seed (env + optional legacy file) only when DB is empty
        3) File fallback only when no DB store is configured

        After DB is populated, env/file are not applied at runtime.

        Result is memoized by (source, revision).
        """
        with self._cfg_lock:
            # Prefer DB-backed config when available.
            if self._config_store is not None:
                try:
                    rec = self._config_store.get(scope_id=self._config_scope_id)
                except Exception as e:
                    self._logger.warning("ragflow_config_db_read_failed err=%s", e)
                    raise
                if rec is not None:
                    revision = ("db", int(rec.updated_at_ms or 0))
                    if not force and self._last_loaded_cfg is not None and revision == self._last_loaded_revision:
                        return self._last_loaded_cfg
                    raw = rec.config if isinstance(rec.config, dict) else {}
                    self._last_loaded_cfg = self._clean_cfg(raw)
                    self._last_loaded_revision = revision
                    return self._last_loaded_cfg

            # DB empty: bootstrap from env (and optional legacy file), then persist.
            file_raw, file_mtime_ns = self._read_file_raw()
            if self._config_store is not None:
                seed_cfg = self._build_bootstrap_seed(file_raw=file_raw)
                if seed_cfg:
                    try:
                        rec = self._config_store.upsert(scope_id=self._config_scope_id, config=seed_cfg)
                    except Exception as e:
                        self._logger.warning("ragflow_config_db_bootstrap_failed err=%s", e)
                        raise
                    revision = ("db", int(rec.updated_at_ms or 0))
                    if not force and self._last_loaded_cfg is not None and revision == self._last_loaded_revision:
                        return self._last_loaded_cfg
                    raw = rec.config if isinstance(rec.config, dict) else {}
                    self._last_loaded_cfg = self._clean_cfg(raw)
                    self._last_loaded_revision = revision
                    self._logger.info("ragflow_config_bootstrapped_to_db scope=%s", self._config_scope_id)
                    return self._last_loaded_cfg
                revision = ("db", -1)
                if not force and self._last_loaded_cfg is not None and revision == self._last_loaded_revision:
                    return self._last_loaded_cfg
                self._last_loaded_cfg = {}
                self._last_loaded_revision = revision
                return self._last_loaded_cfg

            revision = ("file", int(file_mtime_ns))
            if not force and self._last_loaded_cfg is not None and revision == self._last_loaded_revision:
                return self._last_loaded_cfg
            self._last_loaded_cfg = self._clean_cfg(file_raw if isinstance(file_raw, dict) else {})
            self._last_loaded_revision = revision
            return self._last_loaded_cfg

    def reload_config(self) -> dict:
        return self.load_config(force=True)

    def save_config(self, cfg: dict) -> dict:
        data = self._clean_cfg(cfg if isinstance(cfg, dict) else {})
        if self._config_store is not None:
            self._config_store.upsert(scope_id=self._config_scope_id, config=data)
            return self.load_config(force=True)
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(data, ensure_ascii=False, indent=2)
        self._config_path.write_text(text + "\n", encoding="utf-8")
        return self.load_config(force=True)

    def init(self) -> bool:
        cfg = self.load_config()
        api_key = str(cfg.get("api_key") or "").strip()
        base_url = str(cfg.get("base_url") or "").strip().rstrip("/")
        dataset_name = cfg.get("dataset_name", "")
        conversation_name = cfg.get("default_conversation_name", "语音问答")

        if not api_key or api_key in ["YOUR_RAGFLOW_API_KEY_HERE", "your_api_key_here"]:
            self._logger.error("RAGFlow API key无效")
            raise RagflowInitError(
                "ragflow_api_key_invalid",
                "RAGFlow初始化失败: API key无效或缺失。",
                details={"api_key_configured": bool(api_key)},
            )
        if not base_url:
            raise RagflowInitError(
                "ragflow_base_url_missing",
                "RAGFlow初始化失败: 缺少 base_url 配置。",
                details={"base_url": base_url},
            )

        self._ensure_base_url_reachable(base_url)
        self.client = RAGFlow(api_key=api_key, base_url=base_url)
        self.default_chat_name = conversation_name

        if dataset_name:
            self.dataset_id = find_dataset_by_name(self.client, dataset_name)

        # Ensure default session exists
        sess = self.get_session(conversation_name)
        return sess is not None

    def list_chats(self) -> dict:
        if not self.client:
            raise RuntimeError("ragflow_not_initialized")
        chats = self.client.list_chats()
        if chats is None or not isinstance(chats, (list, tuple)):
            raise RuntimeError("ragflow_list_chats_unexpected_response")
        items = []
        for c in chats:
            d = _ragflow_chat_to_dict(c)
            if d and d.get("name"):
                items.append(d)
        items.sort(key=lambda x: (0 if x.get("name") == self.default_chat_name else 1, x.get("name") or ""))
        return {"chats": items, "default": self.default_chat_name}

    def list_agents(self) -> dict:
        cfg = self._last_loaded_cfg if self._last_loaded_cfg is not None else self.load_config()
        api_key = (cfg.get("api_key") or "").strip()
        base_url = str(cfg.get("base_url") or "").strip().rstrip("/")
        if not api_key or api_key in ["YOUR_RAGFLOW_API_KEY_HERE", "your_api_key_here"]:
            raise RuntimeError("ragflow_api_key_invalid")
        if not base_url:
            raise RuntimeError("ragflow_base_url_missing")

        url = f"{base_url}/api/v1/agents"
        headers = {"Authorization": f"Bearer {api_key}"}
        try:
            with requests.get(url, headers=headers, timeout=10) as r:
                r.raise_for_status()
                payload = r.json()
        except Exception as e:
            self._logger.error(f"ragflow_list_agents_failed url={url} err={e}", exc_info=True)
            raise RuntimeError("ragflow_agents_fetch_failed") from e

        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            self._logger.warning(f"ragflow_list_agents_unexpected_response url={url} payload_type={type(payload)}")
            raise RuntimeError("ragflow_agents_unexpected_response")

        agents = []
        for a in data:
            if not isinstance(a, dict):
                continue
            agent_id = a.get("id") or a.get("_id") or a.get("agent_id")
            title = (a.get("title") or a.get("name") or "").strip()
            desc = (a.get("description") or "").strip()
            if not agent_id or not title:
                continue
            agents.append({"id": str(agent_id), "title": title, "description": desc})

        agents.sort(key=lambda x: x.get("title") or "")
        return {"agents": agents, "default": agents[0]["id"] if agents else None}

    def _resolve_or_create_chat(self, name: str):
        chat = find_chat_by_name(self.client, name)
        if chat:
            return chat

        try:
            return self.client.create_chat(name=name, dataset_ids=[self.dataset_id] if self.dataset_id else [])
        except Exception as e:
            if not _is_duplicate_chat_name_error(e):
                raise
            self._logger.warning("ragflow_chat_create_duplicate_detected chat=%s; retrying lookup", name)
            chat = find_chat_by_name(self.client, name)
            if chat:
                return chat
            raise RuntimeError(f"ragflow_chat_duplicate_name_but_lookup_failed:{name}") from e

    def get_session(self, chat_name: str):
        if not self.client:
            return None
        name = str(chat_name or self.default_chat_name or "").strip()
        if not name:
            return None

        with self._lock:
            if name in self._sessions:
                return self._sessions[name]

        chat = self._resolve_or_create_chat(name)
        sess = chat.create_session("Chat Session")
        with self._lock:
            self._sessions[name] = sess
        return sess

    def ask_chat(self, chat_name: str, question: str) -> str:
        if not self.client:
            raise RuntimeError("ragflow_not_initialized")

        name = str(chat_name or "").strip()
        prompt = str(question or "").strip()
        if not name:
            raise RuntimeError("chat_name_required")
        if not prompt:
            return ""

        sess = self.get_session(name)
        if not sess:
            raise RuntimeError(f"ragflow_session_unavailable:{name}")
        if not hasattr(sess, "ask"):
            raise RuntimeError(f"ragflow_session_ask_unsupported:{name}")

        resp = sess.ask(prompt, stream=False)
        return _ragflow_response_text(resp).strip()

    def ask_chat_once(
        self,
        chat_name: str,
        question: str,
        *,
        create_if_missing: bool = False,
        session_name: str = "One Shot Session",
    ) -> str:
        if not self.client:
            raise RuntimeError("ragflow_not_initialized")

        name = str(chat_name or "").strip()
        prompt = str(question or "").strip()
        if not name:
            raise RuntimeError("chat_name_required")
        if not prompt:
            return ""

        chat = find_chat_by_name(self.client, name)
        if not chat and create_if_missing:
            chat = self._resolve_or_create_chat(name)
        if not chat:
            raise RuntimeError(f"ragflow_chat_not_found:{name}")

        chat_id = getattr(chat, "id", None) if not isinstance(chat, dict) else chat.get("id")
        if not hasattr(chat, "create_session"):
            raise RuntimeError(f"ragflow_chat_session_unsupported:{name}")

        sess = chat.create_session(str(session_name or "One Shot Session"))
        sess_info = _ragflow_session_to_dict(sess) or {}
        session_id = str(sess_info.get("id") or "").strip()

        try:
            resp = sess.ask(prompt, stream=False)
            return _ragflow_response_text(resp).strip()
        finally:
            if chat_id and session_id:
                self._api_request(
                    method="DELETE",
                    path=f"/api/v1/chats/{chat_id}/sessions",
                    json_body={"ids": [session_id]},
                )

    def create_new_session(self, chat_name: str) -> dict:
        if not self.client:
            return {"ok": False, "chat_name": str(chat_name or ""), "error": "ragflow_not_initialized"}

        name = str(chat_name or self.default_chat_name or "").strip()
        if not name:
            return {"ok": False, "chat_name": "", "error": "chat_name_required"}

        chat = self._resolve_or_create_chat(name)

        sess = chat.create_session("Chat Session")
        with self._lock:
            self._sessions[name] = sess

        sess_info = _ragflow_session_to_dict(sess) or {}
        return {
            "ok": True,
            "chat_name": name,
            "session_id": sess_info.get("id"),
            "session_name": sess_info.get("name"),
        }

    def clear_chat_sessions(self, chat_name: str) -> dict:
        if not self.client:
            return {"ok": False, "deleted": 0, "chat_name": str(chat_name or ""), "error": "ragflow_not_initialized"}

        name = str(chat_name or self.default_chat_name or "").strip()
        if not name:
            return {"ok": False, "deleted": 0, "chat_name": "", "error": "chat_name_required"}

        chat = find_chat_by_name(self.client, name)
        if not chat:
            with self._lock:
                self._sessions.pop(name, None)
            return {"ok": True, "deleted": 0, "chat_name": name, "session_ids": [], "chat_found": False}

        chat_id = getattr(chat, "id", None) if not isinstance(chat, dict) else chat.get("id")
        if not chat_id:
            return {"ok": False, "deleted": 0, "chat_name": name, "error": "chat_id_missing"}

        payload = self._api_request(method="GET", path=f"/api/v1/chats/{chat_id}/sessions")
        if self._api_payload_failed(payload):
            self._logger.warning(
                "ragflow_list_chat_sessions_failed chat=%s chat_id=%s resp=%s",
                name,
                chat_id,
                payload,
            )
            return {
                "ok": False,
                "deleted": 0,
                "chat_name": name,
                "chat_id": str(chat_id),
                "chat_found": True,
                "session_ids": [],
                "error": "ragflow_list_sessions_failed",
                "upstream": payload,
            }

        session_items = self._extract_data_list(payload)
        session_ids: list[str] = []
        for item in session_items:
            session_id = None
            if isinstance(item, dict):
                session_id = item.get("id") or item.get("session_id")
            else:
                session_id = getattr(item, "id", None)
            sid = str(session_id or "").strip()
            if not sid:
                continue
            session_ids.append(sid)

        delete_payload = {"ids": session_ids} if session_ids else None
        delete_resp = self._api_request(method="DELETE", path=f"/api/v1/chats/{chat_id}/sessions", json_body=delete_payload)

        if self._api_payload_failed(delete_resp):
            self._logger.warning(
                "ragflow_clear_chat_sessions_failed chat=%s chat_id=%s total=%s resp=%s",
                name,
                chat_id,
                len(session_items),
                delete_resp,
            )
            return {
                "ok": False,
                "deleted": 0,
                "chat_name": name,
                "chat_id": str(chat_id),
                "chat_found": True,
                "session_ids": session_ids,
                "error": "ragflow_delete_session_failed",
                "upstream": delete_resp,
            }

        with self._lock:
            self._sessions.pop(name, None)

        self._logger.info(
            "ragflow_clear_chat_sessions chat=%s chat_id=%s deleted=%s",
            name,
            chat_id,
            len(session_ids),
        )
        return {
            "ok": True,
            "deleted": len(session_ids),
            "chat_name": name,
            "chat_id": str(chat_id),
            "chat_found": True,
            "session_ids": session_ids,
        }
