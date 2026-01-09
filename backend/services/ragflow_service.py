from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

import requests
from ragflow_sdk import RAGFlow

from backend.services.env_overrides import apply_env_overrides


def _ragflow_chat_to_dict(chat):
    if chat is None:
        return None
    if hasattr(chat, "name"):
        return {"id": getattr(chat, "id", None), "name": getattr(chat, "name", None)}
    if isinstance(chat, dict):
        return {"id": chat.get("id"), "name": chat.get("name")}
    return {"id": None, "name": str(chat)}


def find_dataset_by_name(client, dataset_name):
    if not dataset_name:
        return None

    try:
        datasets = client.list_datasets()
        for dataset in datasets:
            if hasattr(dataset, "name"):
                if dataset.name == dataset_name:
                    return dataset.id if hasattr(dataset, "id") else dataset
            elif isinstance(dataset, dict):
                if dataset.get("name") == dataset_name:
                    return dataset.get("id") or dataset
            else:
                if dataset_name in str(dataset):
                    return dataset
    except Exception:
        pass
    return None


def find_chat_by_name(client, chat_name):
    try:
        chats = client.list_chats()
        for chat in chats:
            if hasattr(chat, "name"):
                if chat.name == chat_name:
                    return chat
            elif isinstance(chat, dict):
                if chat.get("name") == chat_name:
                    return chat
            else:
                if chat_name in str(chat):
                    return chat
    except Exception:
        pass
    return None


class RagflowService:
    def __init__(self, config_path: Path, logger: logging.Logger | None = None):
        self._logger = logger or logging.getLogger(__name__)
        self._config_path = config_path
        self._cfg_lock = threading.Lock()
        self._last_loaded_cfg: dict | None = None
        self._last_loaded_mtime_ns: int | None = None

        self.client = None
        self.default_chat_name = None
        self.dataset_id = None

        self._sessions = {}
        self._lock = threading.Lock()

    def load_config(self, *, force: bool = False) -> dict:
        """
        Load JSON config from disk with a best-effort mtime cache.

        - Keeps hot-reload behavior for local edits.
        - Avoids per-request file I/O in production steady-state.
        """
        try:
            st = self._config_path.stat()
            mtime_ns = int(getattr(st, "st_mtime_ns", int(st.st_mtime * 1e9)))
        except Exception:
            mtime_ns = None

        with self._cfg_lock:
            if not force and self._last_loaded_cfg is not None and mtime_ns is not None and mtime_ns == self._last_loaded_mtime_ns:
                return self._last_loaded_cfg

            if not self._config_path.exists():
                self._last_loaded_cfg = {}
                self._last_loaded_mtime_ns = mtime_ns
                return self._last_loaded_cfg

            with open(self._config_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
                self._last_loaded_cfg = apply_env_overrides(raw) if isinstance(raw, dict) else {}
                self._last_loaded_mtime_ns = mtime_ns
                return self._last_loaded_cfg

    def reload_config(self) -> dict:
        return self.load_config(force=True)

    def init(self) -> bool:
        cfg = self.load_config()
        api_key = cfg.get("api_key", "")
        base_url = cfg.get("base_url", "http://127.0.0.1")
        dataset_name = cfg.get("dataset_name", "")
        conversation_name = cfg.get("default_conversation_name", "语音问答")

        if not api_key or api_key in ["YOUR_RAGFLOW_API_KEY_HERE", "your_api_key_here"]:
            self._logger.error("RAGFlow API key无效")
            return False

        self.client = RAGFlow(api_key=api_key, base_url=base_url)
        self.default_chat_name = conversation_name

        if dataset_name:
            self.dataset_id = find_dataset_by_name(self.client, dataset_name)

        # Ensure default session exists
        sess = self.get_session(conversation_name)
        return sess is not None

    def list_chats(self) -> dict:
        if not self.client:
            return {"chats": [], "default": self.default_chat_name, "error": "ragflow_not_initialized"}
        chats = self.client.list_chats() or []
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
        base_url = (cfg.get("base_url") or "http://127.0.0.1").strip().rstrip("/")
        if not api_key or api_key in ["YOUR_RAGFLOW_API_KEY_HERE", "your_api_key_here"]:
            return {"agents": [], "default": None, "error": "ragflow_api_key_invalid"}

        url = f"{base_url}/api/v1/agents"
        headers = {"Authorization": f"Bearer {api_key}"}
        try:
            with requests.get(url, headers=headers, timeout=10) as r:
                r.raise_for_status()
                payload = r.json()
        except Exception as e:
            self._logger.error(f"ragflow_list_agents_failed url={url} err={e}", exc_info=True)
            return {"agents": [], "default": None, "error": "ragflow_agents_fetch_failed"}

        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            self._logger.warning(f"ragflow_list_agents_unexpected_response url={url} payload_type={type(payload)}")
            return {"agents": [], "default": None, "error": "ragflow_agents_unexpected_response"}

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

    def get_session(self, chat_name: str):
        if not self.client:
            return None
        name = str(chat_name or self.default_chat_name or "").strip()
        if not name:
            return None

        with self._lock:
            if name in self._sessions:
                return self._sessions[name]

        chat = find_chat_by_name(self.client, name)
        if not chat:
            chat = self.client.create_chat(name=name, dataset_ids=[self.dataset_id] if self.dataset_id else [])
        sess = chat.create_session("Chat Session")
        with self._lock:
            self._sessions[name] = sess
        return sess
