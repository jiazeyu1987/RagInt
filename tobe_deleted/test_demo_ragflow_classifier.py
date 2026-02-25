from __future__ import annotations

import unittest

from demo_ragflow_classifier import (
    CandidateQuestion,
    build_classification_prompt,
    classify_with_ragflow,
    parse_classifier_output,
    ragflow_ask_adapter,
)


class RagflowClassifierDemoTest(unittest.TestCase):
    def test_prompt_contains_question_and_candidates(self) -> None:
        cands = [CandidateQuestion(pair_id=101, question_text="what is stent")]
        prompt = build_classification_prompt(user_question="介绍一下支架", candidates=cands)
        self.assertIn("介绍一下支架", prompt)
        self.assertIn("id=101", prompt)

    def test_parse_json_with_markdown_fence(self) -> None:
        raw = """```json
{"match": true, "candidate_id": 12, "confidence": 0.93, "reason": "same intent"}
```"""
        r = parse_classifier_output(raw)
        self.assertTrue(r.match)
        self.assertEqual(12, r.candidate_id)
        self.assertGreater(r.confidence, 0.9)

    def test_threshold_reject(self) -> None:
        cands = [CandidateQuestion(pair_id=1, question_text="what is stent")]

        def fake_ask(_prompt: str) -> str:
            return '{"match": true, "candidate_id": 1, "confidence": 0.51, "reason": "close"}'

        r = classify_with_ragflow(user_question="stent介绍", candidates=cands, ask_model=fake_ask, threshold=0.8)
        self.assertFalse(r.match)
        self.assertEqual("below_threshold", r.reason)

    def test_invalid_candidate_reject(self) -> None:
        cands = [CandidateQuestion(pair_id=1, question_text="what is stent")]

        def fake_ask(_prompt: str) -> str:
            return '{"match": true, "candidate_id": 999, "confidence": 0.98, "reason": "same"}'

        r = classify_with_ragflow(user_question="stent介绍", candidates=cands, ask_model=fake_ask, threshold=0.8)
        self.assertFalse(r.match)
        self.assertEqual("invalid_candidate_id", r.reason)

    def test_adapter_works_with_session_like_object(self) -> None:
        class _FakeSession:
            def ask(self, prompt: str, stream: bool = False):  # noqa: ARG002
                return {"answer": '{"match": true, "candidate_id": 2, "confidence": 0.9, "reason": "same intent"}'}

        cands = [CandidateQuestion(pair_id=2, question_text="心脏介入讲解")]
        ask = ragflow_ask_adapter(rag_session=_FakeSession())
        r = classify_with_ragflow(user_question="讲讲心脏介入", candidates=cands, ask_model=ask, threshold=0.8)
        self.assertTrue(r.match)
        self.assertEqual(2, r.candidate_id)


if __name__ == "__main__":
    unittest.main()

