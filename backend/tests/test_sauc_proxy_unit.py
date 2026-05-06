from __future__ import annotations

import json
import queue
import struct

import pytest

from backend.ws.sauc_proxy import (
    _CompressionType,
    _MessageFlags,
    _MessageType,
    _ProtocolVersion,
    _SerializationType,
    _build_audio_request,
    _build_full_request,
    _build_header,
    _build_ws_handshake_hints,
    _extract_transcript_text,
    _friendly_error_message,
    _gzip_compress,
    _incremental_delta,
    _normalize_start_config,
    _parse_client_message,
    _parse_sauc_response,
    _queue_get,
    _queue_put_drop_oldest,
    _to_bool,
    _to_int,
)


def _make_server_packet(*, message_type: int, flags: int, payload_obj: dict, seq: int = 1) -> bytes:
    header = bytearray()
    header.append((_ProtocolVersion.V1 << 4) | 1)
    header.append((message_type << 4) | flags)
    header.append((_SerializationType.JSON << 4) | _CompressionType.GZIP)
    header.append(0x00)

    payload_bytes = _gzip_compress(json.dumps(payload_obj, ensure_ascii=False).encode("utf-8"))
    packet = bytearray(header)
    if flags & 0x01:
        packet.extend(struct.pack(">i", int(seq)))
    if message_type == _MessageType.SERVER_FULL_RESPONSE:
        packet.extend(struct.pack(">I", len(payload_bytes)))
    elif message_type == _MessageType.SERVER_ERROR_RESPONSE:
        packet.extend(struct.pack(">i", 45000001))
        packet.extend(struct.pack(">I", len(payload_bytes)))
    packet.extend(payload_bytes)
    return bytes(packet)


def test_to_int_to_bool_and_header_helpers():
    assert _to_int("12.8", 10, min_value=1, max_value=20) == 13

    assert _to_bool(True) is True
    assert _to_bool("true") is True
    assert _to_bool("0") is False

    with pytest.raises(ValueError, match="sauc_config_invalid_seg_duration_ms"):
        _to_int("x", 10, min_value=1, max_value=20)

    with pytest.raises(ValueError, match="sauc_config_invalid_seg_duration_ms"):
        _to_int(999, 10, min_value=1, max_value=100)

    with pytest.raises(ValueError, match="sauc_config_invalid_enable_itn"):
        _to_bool("unknown")

    h = _build_header(message_type=_MessageType.CLIENT_FULL_REQUEST, message_flags=_MessageFlags.POS_SEQUENCE)
    assert len(h) == 4
    assert h[0] >> 4 == _ProtocolVersion.V1
    assert h[1] >> 4 == _MessageType.CLIENT_FULL_REQUEST


def test_build_full_request_and_audio_request_binary_layout():
    cfg, err = _normalize_start_config(
        {
            "ws_url": "wss://x",
            "resource_id": "r",
            "app_key": "a",
            "access_key": "k",
            "model_name": "m",
            "seg_duration_ms": 250,
        }
    )
    assert err is None
    assert cfg is not None

    full = _build_full_request(seq=1, cfg=cfg)
    assert isinstance(full, bytes)
    assert len(full) > 12
    assert (full[1] >> 4) == _MessageType.CLIENT_FULL_REQUEST
    assert struct.unpack(">i", full[4:8])[0] == 1

    audio_mid = _build_audio_request(seq=3, audio=b"\x01\x02", is_last=False)
    assert (audio_mid[1] >> 4) == _MessageType.CLIENT_AUDIO_ONLY_REQUEST
    assert struct.unpack(">i", audio_mid[4:8])[0] == 3

    audio_last = _build_audio_request(seq=4, audio=b"\x01\x02", is_last=True)
    assert struct.unpack(">i", audio_last[4:8])[0] == -4


def test_parse_sauc_response_full_and_error_packets():
    full_packet = _make_server_packet(
        message_type=_MessageType.SERVER_FULL_RESPONSE,
        flags=_MessageFlags.POS_SEQUENCE,
        seq=7,
        payload_obj={"result": {"text": "hello"}},
    )
    full = _parse_sauc_response(full_packet)
    assert full["code"] == 0
    assert full["payload_sequence"] == 7
    assert full["is_last_package"] is False
    assert full["payload_msg"]["result"]["text"] == "hello"

    err_packet = _make_server_packet(
        message_type=_MessageType.SERVER_ERROR_RESPONSE,
        flags=_MessageFlags.NEG_WITH_SEQUENCE,
        seq=9,
        payload_obj={"msg": "bad"},
    )
    err = _parse_sauc_response(err_packet)
    assert err["code"] == 45000001
    assert err["payload_sequence"] == 9
    assert err["is_last_package"] is True
    assert err["payload_msg"]["msg"] == "bad"


def test_parse_sauc_response_rejects_short_packet_as_protocol_error():
    with pytest.raises(ValueError, match="sauc_protocol_short_packet"):
        _parse_sauc_response(b"abc")


def test_parse_sauc_response_rejects_invalid_gzip_payload_as_protocol_error():
    raw = bytearray()
    raw.append((_ProtocolVersion.V1 << 4) | 1)
    raw.append((_MessageType.SERVER_FULL_RESPONSE << 4) | _MessageFlags.POS_SEQUENCE)
    raw.append((_SerializationType.JSON << 4) | _CompressionType.GZIP)
    raw.append(0x00)
    raw.extend(struct.pack(">i", 1))
    raw.extend(struct.pack(">I", 4))
    raw.extend(b"xxxx")

    with pytest.raises(ValueError, match="sauc_protocol_gzip_decode_failed"):
        _parse_sauc_response(bytes(raw))


def test_parse_sauc_response_rejects_invalid_json_payload_as_protocol_error():
    raw = bytearray()
    raw.append((_ProtocolVersion.V1 << 4) | 1)
    raw.append((_MessageType.SERVER_FULL_RESPONSE << 4) | _MessageFlags.POS_SEQUENCE)
    raw.append((_SerializationType.JSON << 4) | _CompressionType.GZIP)
    raw.append(0x00)
    payload = _gzip_compress(b"{not-json")
    raw.extend(struct.pack(">i", 1))
    raw.extend(struct.pack(">I", len(payload)))
    raw.extend(payload)

    with pytest.raises(ValueError, match="sauc_protocol_json_decode_failed"):
        _parse_sauc_response(bytes(raw))


def test_extract_transcript_text_and_delta_logic():
    payload = {
        "data": {
            "result": {"text": "second revision"},
            "alternatives": [
                {"text": "short"},
                {"text": "longer alt"},
            ],
            "utterances": [{"text": "first revision"}, {"text": "second revision"}],
        }
    }
    assert _extract_transcript_text(payload) == "second revision"
    assert _extract_transcript_text({"utterances": [{"text": "first"}, {"text": "second"}]}) == "second"
    assert _extract_transcript_text("plain text") == "plain text"
    assert _extract_transcript_text(None) == ""

    assert _incremental_delta("", "abc") == "abc"
    assert _incremental_delta("abc", "abcdef") == "def"
    assert _incremental_delta("abcXYZ", "abc123") == "123"
    assert _incremental_delta("foo", "bar") == "bar"


def test_parse_client_message_and_normalize_start_config():
    assert _parse_client_message('{"type":"start"}') == {"type": "start"}
    assert _parse_client_message(b'{"type":"ping"}') == {"type": "ping"}
    assert _parse_client_message(b"\xff\xfe") is None
    assert _parse_client_message("not json") is None

    cfg, err = _normalize_start_config({})
    assert cfg is None
    assert err == "sauc_config_required_fields_missing"

    cfg2, err2 = _normalize_start_config(
        {
            "ws_url": " wss://x ",
            "resource_id": " rid ",
            "app_key": " app ",
            "access_key": " key ",
            "seg_duration_ms": 1000,
            "enable_itn": "false",
            "enable_punc": "1",
            "enable_ddc": "no",
            "show_utterances": "yes",
            "enable_nonstream": "on",
        }
    )
    assert err2 is None
    assert cfg2 is not None
    assert cfg2.ws_url == "wss://x"
    assert cfg2.seg_duration_ms == 1000
    assert cfg2.enable_itn is False
    assert cfg2.enable_punc is True
    assert cfg2.enable_ddc is False
    assert cfg2.show_utterances is True
    assert cfg2.enable_nonstream is True


def test_normalize_start_config_rejects_invalid_numeric_and_boolean_values():
    cfg, err = _normalize_start_config(
        {
            "ws_url": "wss://x",
            "resource_id": "rid",
            "app_key": "app",
            "access_key": "key",
            "seg_duration_ms": "not-a-number",
        }
    )
    assert cfg is None
    assert err == "sauc_config_invalid_seg_duration_ms"

    cfg_out_of_range, err_out_of_range = _normalize_start_config(
        {
            "ws_url": "wss://x",
            "resource_id": "rid",
            "app_key": "app",
            "access_key": "key",
            "seg_duration_ms": 10000,
        }
    )
    assert cfg_out_of_range is None
    assert err_out_of_range == "sauc_config_invalid_seg_duration_ms"

    cfg2, err2 = _normalize_start_config(
        {
            "ws_url": "wss://x",
            "resource_id": "rid",
            "app_key": "app",
            "access_key": "key",
            "enable_itn": "maybe",
        }
    )
    assert cfg2 is None
    assert err2 == "sauc_config_invalid_enable_itn"


def test_queue_helpers_and_handshake_hints_and_error_message():
    q: queue.Queue[object] = queue.Queue(maxsize=2)
    _queue_put_drop_oldest(q, "a")
    _queue_put_drop_oldest(q, "b")
    _queue_put_drop_oldest(q, "c")
    assert _queue_get(q, 0.01) == "b"
    assert _queue_get(q, 0.01) == "c"

    hints = _build_ws_handshake_hints(
        {
            "REQUEST_METHOD": "GET",
            "HTTP_UPGRADE": "websocket",
            "HTTP_CONNECTION": "Upgrade",
            "werkzeug.socket": object(),
        }
    )
    assert hints["REQUEST_METHOD"] == "GET"
    assert hints["HTTP_UPGRADE"] == "websocket"
    assert hints["has_werkzeug_socket"] is True
    assert hints["has_gunicorn_socket"] is False

    assert _friendly_error_message(45000151) == "sauc_error_45000151_audio_format_mismatch"
    assert _friendly_error_message(45000002) == "sauc_error_45000002_empty_audio"
    assert _friendly_error_message(123) == "sauc_error_123"
    assert _friendly_error_message(0) == "sauc_error_unknown"
