from __future__ import annotations

import contextlib
import re
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class AskInput:
    question: str
    request_id: str
    client_id: str
    kind: str
    agent_id: str = ""
    conversation_name: str = ""
    guide: dict | None = None
    save_history: bool = True


class ConversationOrchestrator:
    def __init__(
        self,
        *,
        ragflow_service,
        ragflow_agent_service,
        intent_service,
        history_store,
        logger,
        timings_set,
        timings_get,
        default_session=None,
    ):
        self._ragflow_service = ragflow_service
        self._ragflow_agent_service = ragflow_agent_service
        self._intent_service = intent_service
        self._history_store = history_store
        self._logger = logger
        self._timings_set = timings_set
        self._timings_get = timings_get
        self._default_session = default_session

    def stream_ask(self, *, inp: AskInput, ragflow_config: dict | None, cancel_event, t_submit: float):
        question = (inp.question or "").strip()
        request_id = inp.request_id
        client_id = inp.client_id
        kind = inp.kind
        agent_id = (inp.agent_id or "").strip()
        conversation_name = (inp.conversation_name or "").strip()
        guide = inp.guide if isinstance(inp.guide, dict) else {}

        def _apply_guide_prompt(raw_question: str) -> str:
            if not guide.get("enabled", False):
                return raw_question
            style = str(guide.get("style") or "friendly").strip().lower()
            stop_name = str(guide.get("stop_name") or "").strip()
            is_continuous = bool(guide.get("continuous", False))
            try:
                target_chars = int(guide.get("target_chars") or 0)
            except Exception:
                target_chars = 0
            try:
                duration_s = int(guide.get("duration_s") or 60)
            except Exception:
                duration_s = 60
            duration_s = max(15, min(duration_s, 600))

            style_text = "通俗易懂、亲切自然" if style in ("friendly", "simple") else "更专业、术语更准确"
            if duration_s <= 35:
                length_text = "控制在约30秒内，简洁但信息密度高"
            elif duration_s <= 90:
                length_text = "控制在约1分钟内，结构清晰"
            else:
                length_text = "控制在约3分钟内，分段讲解，循序渐进"

            target_text = f"- 建议总字数：约{target_chars}字（按语速估算）\n" if target_chars > 0 else ""
            stop_text = f"- 当前展厅：{stop_name}\n" if stop_name else ""
            continuity_text = (
                "- 衔接（连续讲解）：\n"
                "  - 开头不要重复寒暄/欢迎词（如“欢迎来到/接下来我们来到/让我们来到”）。\n"
                "  - 用1句自然承接上一段，再直接进入本站主题。\n"
                "  - 结尾不要预告下一站（除非用户明确要求）。\n"
            ) if is_continuous else ""
            guide_text = (
                "【展厅讲解要求】\n"
                "你是一名展厅讲解员，面向来访者做中文讲解。\n"
                f"{stop_text}"
                f"- 讲解风格：{style_text}\n"
                f"- 时长：{length_text}\n"
                f"{target_text}"
                f"{continuity_text}"
                "- 输出：用短句分段（便于语音播报），必要时用项目符号。\n"
                "- 约束：不要编造；如果知识库/上下文没有依据，请明确说明不确定，并建议咨询现场工作人员。\n"
            )
            return f"{raw_question}\n\n{guide_text}"

        if cancel_event.is_set():
            self._logger.info(f"[{request_id}] ask_cancelled_before_start client_id={client_id}")
            return

        intent = self._intent_service.classify(question)
        self._logger.info(
            f"[{request_id}] intent_detected intent={intent.intent} conf={intent.confidence:.2f} matched={list(intent.matched)} reason={intent.reason}"
        )

        yield {
            "meta": {
                "intent": intent.intent,
                "intent_confidence": round(float(intent.confidence), 3),
                "intent_matched": list(intent.matched),
                "intent_reason": intent.reason,
                "client_id": client_id,
                "kind": kind,
            },
            "done": False,
        }

        question_for_rag = _apply_guide_prompt(question)

        ragflow_config = ragflow_config or {}
        text_cleaning = ragflow_config.get("text_cleaning", {}) or {}

        qa_cfg = ragflow_config.get("qa_constraints", {}) if isinstance(ragflow_config, dict) else {}
        if not isinstance(qa_cfg, dict):
            qa_cfg = {}
        qa_constraints_enabled = bool(qa_cfg.get("enabled", True))
        qa_no_self_intro = bool(qa_cfg.get("no_self_intro", True))
        try:
            qa_max_answer_chars = int(qa_cfg.get("max_answer_chars") or 150)
        except Exception:
            qa_max_answer_chars = 150
        qa_max_answer_chars = max(0, qa_max_answer_chars)
        apply_qa_constraints = qa_constraints_enabled and (not bool(guide.get("enabled", False)))

        def _trim_answer(s: str) -> str:
            if not apply_qa_constraints or qa_max_answer_chars <= 0:
                return str(s or "")
            s = str(s or "")
            return s[:qa_max_answer_chars]

        if apply_qa_constraints:
            req_lines = []
            if qa_no_self_intro:
                req_lines.append("- \u76f4\u63a5\u56de\u7b54\u95ee\u9898\uff0c\u4e0d\u8981\u81ea\u6211\u4ecb\u7ecd\uff08\u4e0d\u8981\u51fa\u73b0\u201c\u6211\u662f...\u201d\u201c\u6211\u53eb...\u201d\u7b49\uff09\u3002")
            if qa_max_answer_chars > 0:
                req_lines.append(f"- \u603b\u5b57\u6570\u4e0d\u8d85\u8fc7{qa_max_answer_chars}\u5b57\u3002")
            if req_lines:
                question_for_rag = f"{question_for_rag}\n\n\u3010\u56de\u7b54\u8981\u6c42\u3011\n" + "\n".join(req_lines) + "\n"

        enable_cleaning = bool(text_cleaning.get("enabled", False))
        cleaning_level = text_cleaning.get("cleaning_level", "standard")
        language = text_cleaning.get("language", "zh-CN")
        tts_buffer_enabled = bool(text_cleaning.get("tts_buffer_enabled", True))
        max_chunk_size = int(text_cleaning.get("max_chunk_size", 200))
        start_tts_on_first_chunk = bool(text_cleaning.get("start_tts_on_first_chunk", True))
        first_segment_min_chars = int(text_cleaning.get("first_segment_min_chars", 10))
        segment_flush_interval_s = float(text_cleaning.get("segment_flush_interval_s", 0.8))
        segment_min_chars = int(text_cleaning.get("segment_min_chars", first_segment_min_chars))

        text_cleaner = None
        tts_buffer = None
        emitted_segments: set[str] = set()
        last_segment_emit_at = t_submit
        segment_seq = 0

        if enable_cleaning:
            try:
                from text_cleaner import TTSTextCleaner
                from tts_buffer import TTSBuffer

                text_cleaner = TTSTextCleaner(language=language, cleaning_level=cleaning_level)
                tts_buffer = TTSBuffer(max_chunk_size=max_chunk_size, language=language) if tts_buffer_enabled else None
            except Exception as e:
                self._logger.warning(f"文本清洗/分段模块不可用，降级为整段TTS: {e}")
                enable_cleaning = False

        if intent.intent in ("direction", "complaint", "chitchat") and float(intent.confidence) >= 0.78:
            if intent.intent == "direction":
                fast_answer = (
                    "我可以帮你指路～\n"
                    "请告诉我你要去的目标位置（例如：某展位/厕所/出口/前台），以及你现在大概在什么位置（例如：入口/某展区）。\n"
                    "我会给你最短路线，并提示沿途的明显标识。"
                )
            elif intent.intent == "complaint":
                fast_answer = (
                    "非常抱歉给你带来不好的体验。\n"
                    "为了尽快帮你解决，请告诉我：发生了什么、在什么位置/哪个环节、以及你希望的处理方式。\n"
                    "如果需要，我也可以引导你到服务台或联系现场工作人员。"
                )
            else:
                fast_answer = "你好！我在～你可以直接问我展厅/产品相关问题，或说“开始讲解”。"

            fast_answer = _trim_answer(fast_answer)
            yield {"chunk": fast_answer, "done": False}
            yield {"chunk": "", "done": True}
            if inp.save_history:
                with contextlib.suppress(Exception):
                    self._history_store.add_entry(
                        request_id=request_id,
                        question=question,
                        answer=fast_answer,
                        mode="agent" if agent_id else "chat",
                        chat_name=conversation_name,
                        agent_id=agent_id,
                    )
            return

        rag_session = None
        if not agent_id:
            rag_session = self._ragflow_service.get_session(conversation_name) if conversation_name else self._default_session

        if (not agent_id) and (not rag_session):
            self._logger.warning("RAGFlow不可用，使用固定回答")
            fallback_answer = f"我收到了你的问题：{question}。由于RAGFlow服务暂时不可用，我现在只能给你一个固定的回答。请确保RAGFlow服务正在运行。"
            last_complete_content = _trim_answer(fallback_answer)

            for char in last_complete_content:
                if cancel_event.is_set():
                    self._logger.info(f"[{request_id}] ask_cancelled_during_fallback client_id={client_id}")
                    return
                yield {"chunk": char, "done": False}
                if text_cleaner and tts_buffer:
                    cleaned = text_cleaner.clean_streaming_chunk(char, is_partial=True)
                    for seg in tts_buffer.add_cleaned_chunk(cleaned):
                        seg = seg.strip()
                        if not seg or seg in emitted_segments:
                            continue
                        emitted_segments.add(seg)
                        yield {"segment": seg, "done": False}
                time.sleep(0.05)

            if text_cleaner and tts_buffer:
                for seg in tts_buffer.finalize():
                    if cancel_event.is_set():
                        self._logger.info(f"[{request_id}] ask_cancelled_during_finalize client_id={client_id}")
                        return
                    seg = seg.strip()
                    if not seg or seg in emitted_segments:
                        continue
                    emitted_segments.add(seg)
                    yield {"segment": seg, "done": False}

            yield {"chunk": "", "done": True}
            if inp.save_history:
                with contextlib.suppress(Exception):
                    self._history_store.add_entry(
                        request_id=request_id,
                        question=question,
                        answer=last_complete_content,
                        mode="agent" if agent_id else "chat",
                        chat_name=conversation_name,
                        agent_id=agent_id,
                    )
            return

        t_ragflow_request = time.perf_counter()
        response = None
        last_complete_content = ""
        last_ragflow_content = ""
        try:
            if agent_id:
                self._logger.info(f"[{request_id}] 开始RAGFlow Agent流式响应 agent_id={agent_id}")
                try:
                    response = self._ragflow_agent_service.stream_completion_text(
                        agent_id, question_for_rag, request_id=request_id, cancel_event=cancel_event
                    )
                except Exception as e:
                    self._logger.error(f"[{request_id}] ragflow_agent_stream_init_failed err={e}", exc_info=True)
                    msg = (
                        f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。"
                        f"请检查 RAGFlow 服务日志/版本或接口权限。"
                    )
                    yield {"chunk": msg, "done": False}
                    yield {"chunk": "", "done": True}
                    return
            else:
                self._logger.info(f"[{request_id}] 开始RAGFlow流式响应")
                response = rag_session.ask(question_for_rag, stream=True)
                self._logger.info(
                    f"[{request_id}] RAGFlow响应对象创建成功 dt={time.perf_counter() - t_ragflow_request:.3f}s"
                )

            chunk_count = 0
            first_ragflow_chunk_at = None
            first_ragflow_text_at = None
            first_segment_at = None
            carry_segment_text = ""
            intro_buf = ""
            intro_checked = not (apply_qa_constraints and qa_no_self_intro)

            for chunk in response:
                if cancel_event.is_set():
                    self._logger.info(f"[{request_id}] ask_cancelled_during_rag_stream client_id={client_id}")
                    with contextlib.suppress(Exception):
                        getattr(response, "close")()
                    break
                chunk_count += 1
                if first_ragflow_chunk_at is None:
                    first_ragflow_chunk_at = time.perf_counter()
                    self._logger.info(
                        f"[{request_id}] ragflow_first_chunk dt={first_ragflow_chunk_at - t_submit:.3f}s chunk_type={type(chunk)}"
                    )
                    self._timings_set(request_id, t_ragflow_first_chunk=first_ragflow_chunk_at)

                content = None
                if agent_id:
                    if isinstance(chunk, str):
                        content = last_ragflow_content + chunk
                    else:
                        content = str(chunk) if chunk is not None else ""
                elif chunk and hasattr(chunk, "content"):
                    content = chunk.content
                elif isinstance(chunk, dict) and "content" in chunk:
                    content = chunk.get("content")
                else:
                    self._logger.warning(f"Chunk没有content属性: {chunk}")

                if content is None:
                    continue

                content = str(content)
                if first_ragflow_text_at is None and content.strip():
                    first_ragflow_text_at = time.perf_counter()
                    self._logger.info(
                        f"[{request_id}] ragflow_first_text dt={first_ragflow_text_at - t_submit:.3f}s chars={len(content.strip())}"
                    )
                    self._timings_set(request_id, t_ragflow_first_text=first_ragflow_text_at)

                # incremental part
                new_part = ""
                if content.startswith(last_ragflow_content):
                    new_part = content[len(last_ragflow_content) :]
                else:
                    new_part = content
                last_ragflow_content = content

                if new_part:
                    if apply_qa_constraints and qa_no_self_intro and not intro_checked:
                        intro_buf += new_part
                        should_flush = len(intro_buf) >= 30 or any(
                            ch in intro_buf for ch in ("\n", "\u3002", "\uff01", "!", "\uff1f", "?", ".", "\uff0c", ",", "\uff1a", ":")
                        )
                        if not should_flush:
                            continue
                        new_part = re.sub(
                            r"^\\s*(\\u4f60\\u597d[!！,，。\\s]*)?(\\u6211\\u662f|\\u6211\\u53eb|\\u8fd9\\u91cc\\u662f)\\S{0,20}?(?:\\u52a9\\u624b|\\u673a\\u5668\\u4eba|AI|\\u667a\\u80fd\\u52a9\\u624b)?[,:：，。\\s]*",
                            "",
                            intro_buf,
                        )
                        new_part = re.sub(
                            r"^\s*(\u4f60\u597d[!\uff01,\uff0c\u3002\s]*)?(\u6211\u662f|\u6211\u53eb|\u8fd9\u91cc\u662f)\S{0,20}?(?:\u52a9\u624b|\u673a\u5668\u4eba|AI|\u667a\u80fd\u52a9\u624b)?[,: \uff1a\uff0c\u3002\s]*",
                            "",
                            intro_buf,
                        )
                        intro_checked = True
                        intro_buf = ""
                        if not new_part:
                            continue
                    if apply_qa_constraints and qa_max_answer_chars > 0:
                        remaining = qa_max_answer_chars - len(last_complete_content)
                        if remaining <= 0:
                            with contextlib.suppress(Exception):
                                getattr(response, "close")()
                            break
                        if len(new_part) > remaining:
                            new_part = new_part[:remaining]
                    yield {"chunk": new_part, "done": False}

                    if text_cleaner and tts_buffer:
                        cleaned = text_cleaner.clean_streaming_chunk(new_part, is_partial=True)
                        now = time.perf_counter()

                        if start_tts_on_first_chunk and first_segment_at is None and len(cleaned.strip()) >= first_segment_min_chars:
                            segs = [cleaned.strip()]
                        else:
                            segs = list(tts_buffer.add_cleaned_chunk(cleaned))

                        for seg in segs:
                            if cancel_event.is_set():
                                self._logger.info(f"[{request_id}] ask_cancelled_during_segment_emit client_id={client_id}")
                                return
                            seg = (seg or "").strip()
                            if not seg:
                                continue
                            if seg in emitted_segments:
                                continue
                            emitted_segments.add(seg)
                            segment_seq += 1
                            last_segment_emit_at = now
                            if first_segment_at is None:
                                first_segment_at = now
                                self._logger.info(
                                    f"[{request_id}] first_tts_segment dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                                )
                                self._timings_set(request_id, t_first_tts_segment=first_segment_at)
                            yield {"segment": seg, "done": False, "segment_seq": segment_seq}
                    else:
                        # coarse segmentation fallback based on punctuation/interval
                        now = time.perf_counter()
                        carry_segment_text += new_part
                        if (now - last_segment_emit_at) >= segment_flush_interval_s and len(carry_segment_text.strip()) >= segment_min_chars:
                            seg = carry_segment_text.strip()
                            carry_segment_text = ""
                            if seg and seg not in emitted_segments:
                                emitted_segments.add(seg)
                                segment_seq += 1
                                last_segment_emit_at = now
                                if first_segment_at is None:
                                    first_segment_at = now
                                    self._logger.info(
                                        f"[{request_id}] first_tts_segment dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                                    )
                                    self._timings_set(request_id, t_first_tts_segment=first_segment_at)
                                yield {"segment": seg, "done": False, "segment_seq": segment_seq}

                if new_part:
                    last_complete_content += new_part
                    if apply_qa_constraints and qa_max_answer_chars > 0 and len(last_complete_content) >= qa_max_answer_chars:
                        with contextlib.suppress(Exception):
                            getattr(response, "close")()
                        break

            self._logger.info(
                f"[{request_id}] 流式响应结束 total_dt={time.perf_counter() - t_submit:.3f}s total_chunks={chunk_count}"
            )

            if text_cleaner and tts_buffer:
                if carry_segment_text:
                    tts_buffer.current_sentence = (carry_segment_text + " " + (tts_buffer.current_sentence or "")).strip()
                    carry_segment_text = ""
                for seg in tts_buffer.finalize():
                    if cancel_event.is_set():
                        self._logger.info(f"[{request_id}] ask_cancelled_after_rag_finalize client_id={client_id}")
                        return
                    seg = seg.strip()
                    if not seg or seg in emitted_segments:
                        continue
                    emitted_segments.add(seg)
                    if first_segment_at is None:
                        first_segment_at = time.perf_counter()
                        self._logger.info(
                            f"[{request_id}] first_tts_segment_finalize dt={first_segment_at - t_submit:.3f}s chars={len(seg)}"
                        )
                        self._timings_set(request_id, t_first_tts_segment=first_segment_at)
                    yield {"segment": seg, "done": False}

            if not cancel_event.is_set():
                yield {"chunk": "", "done": True}

            if inp.save_history:
                with contextlib.suppress(Exception):
                    self._history_store.add_entry(
                        request_id=request_id,
                        question=question,
                        answer=last_complete_content,
                        mode="agent" if agent_id else "chat",
                        chat_name=conversation_name,
                        agent_id=agent_id,
                    )
        except GeneratorExit:
            self._logger.info(f"[{request_id}] ask_stream_generator_exit (client_disconnect?)")
            raise
        except Exception as e:
            self._logger.error(f"[{request_id}] 流式响应异常: {e}", exc_info=True)
            if agent_id and "ragflow_agent_completion_no_data" in str(e):
                msg = (
                    f"智能体接口暂时不可用（RAGFlow /api/v1/agents/{agent_id}/completions 无输出）。"
                    f"请检查 RAGFlow 服务日志/版本或接口权限。"
                )
                yield {"chunk": msg, "done": True}
            else:
                yield {"chunk": f"错误: {str(e)}", "done": True}
