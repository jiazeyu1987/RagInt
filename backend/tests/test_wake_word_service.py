from __future__ import annotations

from backend.services.wake_word_service import WakeWordService


def test_wake_word_detect_and_cooldown():
    svc = WakeWordService()

    r1 = svc.detect(text="Hello, start now.", client_id="c1", wake_words=["hello"], cooldown_ms=5000, now_ms=1000)
    assert r1.detected is True
    assert r1.wake_word == "hello"
    assert r1.reason == "detected"

    r2 = svc.detect(text="hello", client_id="c1", wake_words=["hello"], cooldown_ms=5000, now_ms=1001)
    assert r2.detected is False
    assert r2.cooldown_ms_remaining > 0
    assert r2.reason == "cooldown"

    r3 = svc.detect(text="hello", client_id="c1", wake_words=["hello"], cooldown_ms=5000, now_ms=1000 + 5000 + 1)
    assert r3.detected is True


def test_wake_word_ignores_spaces_and_punctuation():
    svc = WakeWordService()

    r1 = svc.detect(text="h e l l o!!!", client_id="c1", wake_words=["hello"], cooldown_ms=0, now_ms=1)
    assert r1.detected is True


def test_wake_word_empty_text_or_client_is_noop():
    svc = WakeWordService()
    assert svc.detect(text="", client_id="c1").detected is False
    assert svc.detect(text="", client_id="c1").reason == "invalid_input"
    assert svc.detect(text="hello", client_id="").detected is False
    assert svc.detect(text="hello", client_id="").reason == "invalid_input"


def test_wake_word_prefix_mode_reduces_false_triggers():
    svc = WakeWordService()
    r1 = svc.detect(text="say hello", client_id="c1", wake_words=["hello"], cooldown_ms=0, match_mode="prefix", now_ms=1)
    assert r1.detected is False
    assert r1.reason == "no_match"

    r2 = svc.detect(text="hello, I'm here", client_id="c1", wake_words=["hello"], cooldown_ms=0, match_mode="prefix", now_ms=2)
    assert r2.detected is True

