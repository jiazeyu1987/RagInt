from __future__ import annotations

import logging

import pytest

from backend.services.edge_tts_service import stream_edge_tts


def test_stream_edge_tts_rejects_invalid_rate_and_volume_without_defaulting():
    logger = logging.getLogger("test")

    with pytest.raises(ValueError, match="tts\\.edge\\.rate must be a signed percent"):
        next(
            stream_edge_tts(
                text="hello",
                request_id="req_rate_bad",
                config={"tts": {"edge": {"rate": "quick"}}},
                logger=logger,
            )
        )

    with pytest.raises(ValueError, match="tts\\.edge\\.volume must be a signed percent"):
        next(
            stream_edge_tts(
                text="hello",
                request_id="req_volume_bad",
                config={"tts": {"edge": {"volume": ""}}},
                logger=logger,
            )
        )
