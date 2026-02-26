from __future__ import annotations

from backend.services.question_normalizer import normalize_question


def test_normalize_question_keeps_plain_text_stable():
    assert normalize_question("  hello   world  ") == "hello world"


def test_normalize_question_trims_trailing_punct():
    assert normalize_question("请介绍一下展厅！！！") == "请介绍一下展厅"
    assert normalize_question("what is your name???") == "what is your name"


def test_normalize_question_trims_trailing_modal_particles():
    assert normalize_question("可以开始讲解吗") == "可以开始讲解"
    assert normalize_question("继续讲解呢？") == "继续讲解"


def test_normalize_question_no_domain_specific_rewrite():
    # Keep semantics as-is; no math-only canonicalization branch.
    assert normalize_question("9*0=什么?") == "9*0=什么"
    assert normalize_question("9*0等于多少") == "9*0等于多少"
