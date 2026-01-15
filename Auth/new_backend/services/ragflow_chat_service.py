import json
import logging
import requests
from pathlib import Path
from typing import Optional, List, AsyncIterator, Dict, Any


class RagflowChatService:
    def __init__(self, config_path: str = None, logger: logging.Logger = None, session_store=None):
        if config_path is None:
            script_dir = Path(__file__).parent.parent.parent
            config_path = script_dir.parent / "ragflow_demo" / "ragflow_config.json"

        self.config_path = Path(config_path)
        self.logger = logger or logging.getLogger(__name__)
        self.config = self._load_config()
        self.session_store = session_store

    def _load_config(self) -> dict:
        if self.config_path.exists():
            with open(self.config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    def _get_headers(self) -> dict:
        """获取请求头"""
        api_key = self.config.get("api_key", "")
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    def _get_base_url(self) -> str:
        """获取RAGFlow基础URL"""
        return self.config.get("base_url", "http://localhost:9380")

    def list_chats(
        self,
        page: int = 1,
        page_size: int = 30,
        orderby: str = "create_time",
        desc: bool = True,
        name: Optional[str] = None,
        chat_id: Optional[str] = None
    ) -> List[dict]:
        """
        列出聊天助手

        Args:
            page: 页码，默认1
            page_size: 每页数量，默认30
            orderby: 排序字段，默认create_time
            desc: 是否降序，默认True
            name: 按名称过滤
            chat_id: 按ID过滤

        Returns:
            聊天助手列表
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/chats"

            params = {
                "page": page,
                "page_size": page_size,
                "orderby": orderby,
                "desc": "true" if desc else "false"
            }

            if name:
                params["name"] = name
            if chat_id:
                params["id"] = chat_id

            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    return data.get("data", [])
                else:
                    self.logger.error(f"Failed to list chats: {data.get('message')}")
            else:
                self.logger.error(f"Failed to list chats: HTTP {response.status_code}")

            return []
        except Exception as e:
            self.logger.error(f"Failed to list chats: {e}")
            return []

    def get_chat(self, chat_id: str) -> Optional[dict]:
        """
        获取单个聊天助手信息

        Args:
            chat_id: 聊天助手ID

        Returns:
            聊天助手信息，如果不存在返回None
        """
        chats = self.list_chats(chat_id=chat_id)
        return chats[0] if chats else None

    def create_session(
        self,
        chat_id: str,
        name: str,
        user_id: Optional[str] = None
    ) -> Optional[dict]:
        """
        创建聊天会话

        Args:
            chat_id: 聊天助手ID
            name: 会话名称
            user_id: 用户ID（可选）

        Returns:
            创建的会话信息，失败返回None
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/chats/{chat_id}/sessions"

            body = {"name": name}
            if user_id:
                body["user_id"] = user_id

            response = requests.post(
                url,
                headers=self._get_headers(),
                json=body,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    session_data = data.get("data")

                    # 同步到本地数据库
                    if self.session_store and user_id and session_data:
                        session_id = session_data.get("id")
                        if session_id:
                            self.session_store.create_session(
                                session_id=session_id,
                                chat_id=chat_id,
                                user_id=user_id,
                                name=name
                            )

                    return session_data
                else:
                    self.logger.error(f"Failed to create session: {data.get('message')}")
            else:
                self.logger.error(f"Failed to create session: HTTP {response.status_code}")

            return None
        except Exception as e:
            self.logger.error(f"Failed to create session: {e}")
            return None

    def list_sessions(
        self,
        chat_id: str,
        page: int = 1,
        page_size: int = 30,
        orderby: str = "create_time",
        desc: bool = True,
        name: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> List[dict]:
        """
        列出聊天助手的所有会话

        Args:
            chat_id: 聊天助手ID
            page: 页码
            page_size: 每页数量
            orderby: 排序字段
            desc: 是否降序
            name: 按名称过滤
            session_id: 按会话ID过滤
            user_id: 按用户ID过滤

        Returns:
            会话列表
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/chats/{chat_id}/sessions"

            params = {
                "page": page,
                "page_size": page_size,
                "orderby": orderby,
                "desc": "true" if desc else "false"
            }

            if name:
                params["name"] = name
            if session_id:
                params["id"] = session_id
            if user_id:
                params["user_id"] = user_id

            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    return data.get("data", [])
                else:
                    self.logger.error(f"Failed to list sessions: {data.get('message')}")
            else:
                self.logger.error(f"Failed to list sessions: HTTP {response.status_code}")

            return []
        except Exception as e:
            self.logger.error(f"Failed to list sessions: {e}")
            return []

    async def chat(
        self,
        chat_id: str,
        question: str,
        stream: bool = True,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> AsyncIterator[dict]:
        """
        与聊天助手对话（流式）

        Args:
            chat_id: 聊天助手ID
            question: 问题
            stream: 是否流式输出
            session_id: 会话ID，如果为None则创建新会话
            user_id: 用户ID

        Yields:
            聊天响应数据块
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/chats/{chat_id}/completions"

            body = {
                "question": question,
                "stream": stream
            }

            if session_id:
                body["session_id"] = session_id
            if user_id:
                body["user_id"] = user_id

            response = requests.post(
                url,
                headers=self._get_headers(),
                json=body,
                stream=stream,
                timeout=30
            )

            if response.status_code == 200:
                if stream:
                    # SSE流式响应
                    for line in response.iter_lines():
                        if line:
                            line = line.decode('utf-8')
                            if line.startswith('data:'):
                                data_str = line[5:].strip()
                                if data_str:
                                    try:
                                        data = json.loads(data_str)
                                        yield data
                                    except json.JSONDecodeError:
                                        self.logger.warning(f"Failed to parse SSE data: {data_str}")
                                        continue
                else:
                    # 非流式响应
                    data = response.json()
                    yield data
            else:
                error_msg = f"Chat request failed: HTTP {response.status_code}"
                self.logger.error(error_msg)
                yield {"code": response.status_code, "message": error_msg}

        except Exception as e:
            self.logger.error(f"Chat error: {e}")
            yield {"code": -1, "message": str(e)}

    def delete_sessions(
        self,
        chat_id: str,
        session_ids: Optional[List[str]] = None,
        user_id: Optional[str] = None
    ) -> bool:
        """
        删除聊天会话

        Args:
            chat_id: 聊天助手ID
            session_ids: 要删除的会话ID列表，如果为None则删除所有会话
            user_id: 用户ID（用于本地数据库标记）

        Returns:
            是否成功
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/chats/{chat_id}/sessions"

            body = {}
            if session_ids:
                body["ids"] = session_ids

            response = requests.delete(
                url,
                headers=self._get_headers(),
                json=body,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                success = data.get("code") == 0

                # 同步到本地数据库（软删除）
                if success and self.session_store and session_ids and user_id:
                    self.session_store.delete_sessions(
                        session_ids=session_ids,
                        chat_id=chat_id,
                        deleted_by=user_id
                    )

                return success
            else:
                self.logger.error(f"Failed to delete sessions: HTTP {response.status_code}")
                return False

        except Exception as e:
            self.logger.error(f"Failed to delete sessions: {e}")
            return False

    def list_agents(
        self,
        page: int = 1,
        page_size: int = 30,
        orderby: str = "create_time",
        desc: bool = True,
        name: Optional[str] = None,
        id: Optional[str] = None
    ) -> List[dict]:
        """
        列出所有搜索体 (Agents)

        Args:
            page: 页码，默认1
            page_size: 每页数量，默认30
            orderby: 排序字段，默认create_time
            desc: 是否降序，默认True
            name: 按名称过滤
            id: 按ID过滤

        Returns:
            搜索体列表
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/agents"

            params = {
                "page": page,
                "page_size": page_size,
                "orderby": orderby,
                "desc": "true" if desc else "false"
            }

            if name:
                params["name"] = name
            if id:
                params["id"] = id

            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    return data.get("data", [])
                else:
                    self.logger.error(f"Failed to list agents: {data.get('message')}")
            else:
                self.logger.error(f"Failed to list agents: HTTP {response.status_code}")

            return []
        except Exception as e:
            self.logger.error(f"Failed to list agents: {e}")
            return []

    def get_agent(self, agent_id: str) -> Optional[dict]:
        """
        获取单个搜索体信息

        Args:
            agent_id: 搜索体ID

        Returns:
            搜索体信息，如果不存在返回None
        """
        agents = self.list_agents(id=agent_id)
        return agents[0] if agents else None

    async def agent_chat(
        self,
        agent_id: str,
        question: str,
        stream: bool = True,
        session_id: Optional[str] = None,
        inputs: Optional[dict] = None,
        user_id: Optional[str] = None
    ) -> AsyncIterator[dict]:
        """
        与搜索体对话（流式）

        Args:
            agent_id: 搜索体ID
            question: 问题
            stream: 是否流式输出
            session_id: 会话ID，如果为None则创建新会话
            inputs: 额外的输入参数
            user_id: 用户ID

        Yields:
            聊天响应数据块
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/agents/{agent_id}/completions"

            body = {
                "question": question,
                "stream": stream
            }

            if session_id:
                body["session_id"] = session_id
            if inputs:
                body["inputs"] = inputs
            if user_id:
                body["user"] = user_id

            response = requests.post(
                url,
                headers=self._get_headers(),
                json=body,
                stream=stream,
                timeout=30
            )

            if response.status_code == 200:
                if stream:
                    # SSE流式响应
                    for line in response.iter_lines():
                        if line:
                            line = line.decode('utf-8')
                            if line.startswith('data:'):
                                data_str = line[5:].strip()
                                if data_str:
                                    try:
                                        data = json.loads(data_str)
                                        yield data
                                    except json.JSONDecodeError:
                                        self.logger.warning(f"Failed to parse SSE data: {data_str}")
                                        continue
                else:
                    # 非流式响应
                    data = response.json()
                    yield data
            else:
                error_msg = f"Agent chat request failed: HTTP {response.status_code}"
                self.logger.error(error_msg)
                yield {"code": response.status_code, "message": error_msg}

        except Exception as e:
            self.logger.error(f"Agent chat error: {e}")
            yield {"code": -1, "message": str(e)}

    def retrieve_chunks(
        self,
        question: str,
        dataset_ids: List[str],
        page: int = 1,
        page_size: int = 30,
        similarity_threshold: float = 0.2,
        top_k: int = 1024,
        keyword: bool = False,
        highlight: bool = False
    ) -> Dict[str, Any]:
        """
        在知识库中检索文本块

        Args:
            question: 查询问题或关键词
            dataset_ids: 知识库ID列表
            page: 页码，默认1
            page_size: 每页数量，默认30
            similarity_threshold: 相似度阈值（0-1），默认0.2
            top_k: 向量计算参与的chunk数量，默认1024
            keyword: 是否启用关键词匹配，默认False
            highlight: 是否高亮匹配词，默认False

        Returns:
            检索结果字典，包含：
            - chunks: 文本块列表
            - total: 总数量
            - page: 当前页码
            - page_size: 每页数量
        """
        try:
            base_url = self._get_base_url()
            url = f"{base_url}/api/v1/retrieval"

            body = {
                "question": question,
                "dataset_ids": dataset_ids,
                "page": page,
                "page_size": page_size,
                "similarity_threshold": similarity_threshold,
                "top_k": top_k,
                "keyword": keyword,
                "highlight": highlight
            }

            response = requests.post(
                url,
                headers=self._get_headers(),
                json=body,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0:
                    result = data.get("data", {})

                    # Debug: Log the structure of the first chunk
                    chunks = result.get("chunks", [])
                    if chunks:
                        self.logger.info(f"[RETRIEVAL] First chunk keys: {list(chunks[0].keys())}")
                        self.logger.info(f"[RETRIEVAL] First chunk sample: {str(chunks[0])[:500]}...")

                    self.logger.info(f"Successfully retrieved chunks: {result.get('total', 0)} total")
                    return result
                else:
                    self.logger.error(f"Failed to retrieve chunks: {data.get('message')}")
                    return {"chunks": [], "total": 0}
            else:
                self.logger.error(f"Failed to retrieve chunks: HTTP {response.status_code}")
                return {"chunks": [], "total": 0}

        except Exception as e:
            self.logger.error(f"Failed to retrieve chunks: {e}", exc_info=True)
            return {"chunks": [], "total": 0}
