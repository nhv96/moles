"""Check a lesson after "build": every file of its manifest is there and sounds plausible.

A clip is plausible if it is not empty, is longer than MIN_SECONDS, and its real length (read
from the file by ffprobe) matches the length written in the manifest within TOLERANCE_SECONDS.
All problems are collected, each naming the file, so one run shows everything that is wrong.
"""

from __future__ import annotations

import json
from pathlib import Path

from audio import probe_seconds

MIN_SECONDS = 0.3
TOLERANCE_SECONDS = 0.1


class BuildCheckError(Exception):
    """The build output is incomplete or wrong; the message lists every problem."""


def check_clip(build_root: Path, rel: str, expected_seconds: float) -> str | None:
    """Return what is wrong with one clip (path relative to build_root), or None if it is fine."""
    path = build_root / rel
    if not path.is_file():
        return f"{rel}: file is missing"
    if path.stat().st_size == 0:
        return f"{rel}: file is empty"
    try:
        seconds = probe_seconds(path)
    except ValueError as e:
        return f"{rel}: {e}"
    if seconds < MIN_SECONDS:
        return f"{rel}: only {seconds:.2f}s long, a clip must be longer than {MIN_SECONDS}s"
    if abs(seconds - expected_seconds) > TOLERANCE_SECONDS:
        return f"{rel}: is {seconds:.2f}s long but the manifest says {expected_seconds:.2f}s"
    return None


def check_lesson_build(build_root: Path, manifest_path: Path) -> None:
    """Check the clips and the end cue named in a lesson's manifest. Raises BuildCheckError."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    lesson_dir = manifest_path.parent.relative_to(build_root).as_posix()

    clips = [(f"{lesson_dir}/{item[f'{role}_file']}", item[f"{role}_seconds"])
             for item in manifest["items"] for role in ("target", "meaning")]
    clips.append((manifest["end_cue"]["file"], manifest["end_cue"]["seconds"]))

    problems = [p for rel, seconds in clips if (p := check_clip(build_root, rel, seconds))]
    if problems:
        raise BuildCheckError(f"the build of {lesson_dir} is not good:\n  " + "\n  ".join(problems))
