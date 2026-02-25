from __future__ import annotations

from backend.services.audio_utils import ensure_wav_bytes, patch_wav_header_sizes, wrap_pcm16le_as_wav


def test_patch_wav_header_sizes_fixes_streaming_placeholder_sizes():
    pcm = (b"\x00\x00" * 16000)  # ~1s @ 16kHz mono 16-bit
    wav = wrap_pcm16le_as_wav(pcm, sample_rate=16000, channels=1, bits_per_sample=16)
    bad = bytearray(wav)
    bad[4:8] = (0x7FFFFFFF).to_bytes(4, byteorder="little", signed=False)
    bad[40:44] = (0x7FFFFFFF).to_bytes(4, byteorder="little", signed=False)

    fixed, changed = patch_wav_header_sizes(bytes(bad))
    assert changed is True
    assert fixed[:4] == b"RIFF"
    assert fixed[8:12] == b"WAVE"
    assert int.from_bytes(fixed[4:8], byteorder="little", signed=False) == len(fixed) - 8
    assert int.from_bytes(fixed[40:44], byteorder="little", signed=False) == len(pcm)


def test_ensure_wav_bytes_wraps_raw_pcm_and_rejects_mp3():
    pcm = b"\x00\x00\x01\x00\xFF\x7F\x00\x80"
    wrapped = ensure_wav_bytes(pcm, sample_rate=16000)
    assert wrapped is not None
    assert wrapped[:4] == b"RIFF"
    assert wrapped[8:12] == b"WAVE"
    assert len(wrapped) == 44 + len(pcm)

    assert ensure_wav_bytes(b"ID3\x04\x00\x00\x00\x00\x00\x10") is None

