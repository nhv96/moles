"""Audio helpers shared by all engines: trimming, joining, loudness, AAC encoding.

Clips are numpy float arrays at the sample rate of the engine that made them. The final step
needs ffmpeg and ffprobe on the PATH.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

EDGE_KEEP_MS = 40  # silence kept around a trimmed clip so it does not sound cut
LOUDNESS_LUFS = -16.0  # integrated loudness target for every clip
LEAD_IN_MS = 100  # silence added before every clip, so a player that loses the first moment loses no speech
PEAK_CEILING_DB = -3.5  # limiter ceiling; leaves room for AAC encoding overshoot
DEFAULT_BITRATE_KBPS = 96  # AAC bitrate, chosen by listening (2026-10-25)


def trim_silence(audio: np.ndarray, rate: int, rel_threshold: float = 0.02) -> np.ndarray:
    """Cut leading and trailing near-silence, keeping a short margin."""
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak == 0.0:
        return audio
    loud = np.flatnonzero(np.abs(audio) > rel_threshold * peak)
    keep = int(rate * EDGE_KEEP_MS / 1000)
    start = max(int(loud[0]) - keep, 0)
    end = min(int(loud[-1]) + keep + 1, len(audio))
    return audio[start:end]


def join_with_pause(parts: list[np.ndarray], pause_ms: int, rate: int) -> np.ndarray:
    """Put pause_ms of silence between the parts."""
    pause = np.zeros(int(rate * pause_ms / 1000), dtype=np.float32)
    joined: list[np.ndarray] = []
    for i, part in enumerate(parts):
        if i:
            joined.append(pause)
        joined.append(part)
    return np.concatenate(joined)


def write_wav(path: Path, audio: np.ndarray, rate: int) -> float:
    """Write a 16-bit WAV file. Returns its length in seconds."""
    import soundfile as sf

    sf.write(path, audio, rate)
    return len(audio) / rate


def run_ffmpeg(*args: str) -> str:
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {' '.join(args)}\n{result.stderr}")
    return result.stderr


def measure_loudness(wav: Path) -> float:
    """Integrated loudness of the clip in LUFS (loudnorm used as a meter only)."""
    log = run_ffmpeg("-i", str(wav), "-af", f"loudnorm=I={LOUDNESS_LUFS}:print_format=json", "-f", "null", "-")
    return float(json.loads(log[log.rindex("{"):log.rindex("}") + 1])["input_i"])


def encode_m4a(wav: Path, m4a: Path, bitrate_kbps: int) -> float:
    """Add a short silent lead-in, apply one fixed gain to reach the target loudness, limit peaks, encode AAC.

    Plain loudnorm cannot reach the target on peaky clips without breaking its true-peak
    ceiling, which left some clips several dB too quiet. A fixed gain plus a limiter keeps
    every clip at the same loudness. Returns the duration of the m4a in seconds.
    """
    gain_db = LOUDNESS_LUFS - measure_loudness(wav)
    ceiling = 10 ** (PEAK_CEILING_DB / 20)
    filters = f"adelay={LEAD_IN_MS}:all=1,volume={gain_db:.2f}dB,alimiter=limit={ceiling:.4f}:level=disabled"
    run_ffmpeg("-y", "-i", str(wav), "-af", filters, "-ac", "1",
               "-c:a", "aac", "-b:a", f"{bitrate_kbps}k", "-movflags", "+faststart", str(m4a))
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(m4a)],
        capture_output=True, text=True, check=True)
    return float(probe.stdout.strip())
