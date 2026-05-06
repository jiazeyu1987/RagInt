from __future__ import annotations

import pytest

from backend.services.safety_filter import SensitiveWordsFilter


def test_sensitive_words_filter_parses_and_normalizes():
    f = SensitiveWordsFilter.from_config({"safety": {"blacklist": "Ab C, secret\n;TOP"}})
    assert f.enabled is True

    assert f.match_text("xx a b c yy") == "Ab C"
    assert f.match_text("this contains secret text") == "secret"
    assert f.match_text("top secret") == "secret"
    assert f.match_text("safe") is None


def test_sensitive_words_filter_stream_tail_matches_across_chunks():
    f = SensitiveWordsFilter.from_config({"safety": {"blacklist": ["sensitive"]}})
    tail = ""

    matched, tail = f.update_stream_tail_and_match(tail_norm=tail, new_text="this is sens")
    assert matched is None

    matched, tail = f.update_stream_tail_and_match(tail_norm=tail, new_text=" itive text")
    assert matched == "sensitive"


def test_sensitive_words_filter_rejects_invalid_config_shape():
    with pytest.raises(TypeError, match="safety config must be an object"):
        SensitiveWordsFilter.from_config(["bad"])

    with pytest.raises(TypeError, match="safety config section must be an object"):
        SensitiveWordsFilter.from_config({"safety": "bad"})

    with pytest.raises(TypeError, match="safety blacklist must be a string or list of strings"):
        SensitiveWordsFilter.from_config({"blacklist": {"term": "bad"}})

    with pytest.raises(TypeError, match="safety blacklist terms must be strings"):
        SensitiveWordsFilter.from_config({"safety": {"blacklist": ["ok", {"bad": True}]}})
