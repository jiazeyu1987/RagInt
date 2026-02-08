from __future__ import annotations

from backend.orchestrators.ask_policies import apply_qa_requirements, apply_selling_points_topn_hint


class _Logger:
    def __init__(self):
        self.infos: list[str] = []

    def info(self, msg: str) -> None:
        self.infos.append(str(msg))


class _P:
    def __init__(self, text: str):
        self.text = text


class _SPStore:
    def __init__(self, points: list[_P]):
        self._points = list(points)
        self.last_list_args = None
        self.last_pick_args = None

    def list(self, *, stop_name: str, limit: int):  # noqa: ARG002
        self.last_list_args = {"stop_name": stop_name, "limit": int(limit)}
        return list(self._points)

    def pick_topn(self, *, points, n: int):
        self.last_pick_args = {"n": int(n)}
        return list(points)[: int(n)]


def test_apply_qa_requirements_noop_when_disabled():
    assert apply_qa_requirements("Q", apply=False, no_self_intro=True, max_answer_chars=10) == "Q"


def test_apply_qa_requirements_adds_header_and_lines():
    out = apply_qa_requirements("Q", apply=True, no_self_intro=True, max_answer_chars=10)
    assert "【回答要求】" in out
    assert "不超过10字" in out


def test_apply_selling_points_topn_hint_noop_when_not_guide():
    out = apply_selling_points_topn_hint("Q", guide={"enabled": False}, selling_points_store=_SPStore([]))
    assert out == "Q"


def test_apply_selling_points_topn_hint_injects_points_and_caps_n():
    store = _SPStore([_P("a"), _P("b"), _P("c"), _P("d"), _P("e"), _P("f")])
    logger = _Logger()
    guide = {"enabled": True, "stop_name": "s1", "duration_s": 20, "audience_profile": "专业"}
    out = apply_selling_points_topn_hint("Q", guide=guide, selling_points_store=store, logger=logger)
    assert "【本展柜卖点 Top" in out
    assert "- a" in out and "- b" in out
    assert store.last_pick_args["n"] == 3  # 2 + 1 for pro
    assert store.last_list_args["limit"] >= 50
    assert logger.infos

