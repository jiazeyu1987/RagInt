from __future__ import annotations

from backend.services.safety_filter import SensitiveWordsFilter


def test_sensitive_words_filter_parses_and_normalizes():
    f = SensitiveWordsFilter.from_config({"safety": {"blacklist": "Ab C, 秘密\n;TOP"}})
    assert f.enabled is True

    assert f.match_text("xx a b c yy") == "Ab C"
    assert f.match_text("这里有秘密，不能说") == "秘密"
    assert f.match_text("top secret") == "TOP"
    assert f.match_text("safe") is None


def test_sensitive_words_filter_stream_tail_matches_across_chunks():
    f = SensitiveWordsFilter.from_config({"safety": {"blacklist": ["敏感词"]}})
    tail = ""

    matched, tail = f.update_stream_tail_and_match(tail_norm=tail, new_text="这是敏")
    assert matched is None

    matched, tail = f.update_stream_tail_and_match(tail_norm=tail, new_text=" 感 词 不能输出")
    assert matched == "敏感词"

