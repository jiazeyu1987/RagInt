from __future__ import annotations


def is_riff_wav(audio_bytes: bytes) -> bool:
    b = bytes(audio_bytes or b"")
    return len(b) >= 12 and b[:4] == b"RIFF" and b[8:12] == b"WAVE"


def _u32le(n: int) -> bytes:
    n = int(n)
    if n < 0:
        n = 0
    if n > 0xFFFFFFFF:
        n = 0xFFFFFFFF
    return n.to_bytes(4, byteorder="little", signed=False)


def _find_wav_data_size_field(audio_bytes: bytes) -> tuple[int, int] | tuple[None, None]:
    """
    Returns:
      (data_size_field_offset, data_payload_offset)
    """
    b = bytes(audio_bytes or b"")
    if not is_riff_wav(b):
        return None, None

    n = len(b)
    off = 12
    while off + 8 <= n:
        chunk_size = int.from_bytes(b[off + 4 : off + 8], byteorder="little", signed=False)
        payload_off = off + 8
        if b[off : off + 4] == b"data":
            return off + 4, payload_off
        next_off = payload_off + chunk_size + (chunk_size & 1)
        if next_off <= off:
            break
        off = next_off
    return None, None


def patch_wav_header_sizes(audio_bytes: bytes) -> tuple[bytes, bool]:
    """
    Fix RIFF chunk size and data chunk size to real byte lengths.
    """
    b = bytes(audio_bytes or b"")
    if not is_riff_wav(b):
        return b, False

    data_size_field_off, data_payload_off = _find_wav_data_size_field(b)
    if data_size_field_off is None or data_payload_off is None:
        return b, False

    actual_riff_size = max(0, len(b) - 8)
    actual_data_size = max(0, len(b) - data_payload_off)
    current_riff_size = int.from_bytes(b[4:8], byteorder="little", signed=False)
    current_data_size = int.from_bytes(b[data_size_field_off : data_size_field_off + 4], byteorder="little", signed=False)

    if current_riff_size == actual_riff_size and current_data_size == actual_data_size:
        return b, False

    out = bytearray(b)
    out[4:8] = _u32le(actual_riff_size)
    out[data_size_field_off : data_size_field_off + 4] = _u32le(actual_data_size)
    return bytes(out), True


def wrap_pcm16le_as_wav(
    pcm_bytes: bytes,
    *,
    sample_rate: int = 16000,
    channels: int = 1,
    bits_per_sample: int = 16,
) -> bytes:
    pcm = bytes(pcm_bytes or b"")
    sr = max(8000, int(sample_rate or 16000))
    ch = max(1, int(channels or 1))
    bps = int(bits_per_sample or 16)
    if bps not in (8, 16, 24, 32):
        bps = 16
    sample_width = max(1, bps // 8)
    block_align = ch * sample_width
    byte_rate = sr * block_align

    data_size = len(pcm)
    riff_size = 36 + data_size
    header = (
        b"RIFF"
        + _u32le(riff_size)
        + b"WAVE"
        + b"fmt "
        + _u32le(16)
        + (1).to_bytes(2, byteorder="little", signed=False)  # PCM
        + ch.to_bytes(2, byteorder="little", signed=False)
        + _u32le(sr)
        + _u32le(byte_rate)
        + block_align.to_bytes(2, byteorder="little", signed=False)
        + bps.to_bytes(2, byteorder="little", signed=False)
        + b"data"
        + _u32le(data_size)
    )
    return header + pcm


def _looks_like_mp3(audio_bytes: bytes) -> bool:
    b = bytes(audio_bytes or b"")
    if len(b) >= 3 and b[:3] == b"ID3":
        return True
    if len(b) >= 2 and b[0] == 0xFF and (b[1] & 0xE0) == 0xE0:
        return True
    return False


def _looks_like_other_container(audio_bytes: bytes) -> bool:
    b = bytes(audio_bytes or b"")
    return b.startswith(b"OggS") or b.startswith(b"fLaC")


def ensure_wav_bytes(
    audio_bytes: bytes,
    *,
    sample_rate: int = 16000,
    channels: int = 1,
    bits_per_sample: int = 16,
) -> bytes | None:
    """
    Return WAV bytes suitable for storage/playback.
    - RIFF/WAVE input: patch header sizes if needed.
    - Raw PCM input: wrap to WAV.
    - Known non-WAV containers (mp3/ogg/flac): return None (unsupported for WAV endpoint).
    """
    b = bytes(audio_bytes or b"")
    if not b:
        return None
    if is_riff_wav(b):
        fixed, _ = patch_wav_header_sizes(b)
        return fixed
    if _looks_like_mp3(b) or _looks_like_other_container(b):
        return None
    return wrap_pcm16le_as_wav(
        b,
        sample_rate=sample_rate,
        channels=channels,
        bits_per_sample=bits_per_sample,
    )

