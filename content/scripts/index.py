"""The index of the build folder: build/index.json.

It is made by scanning the build folder for build/<pair>/<lesson>/manifest.json, so it always
lists everything that is built, not only the lesson that was built last. The app and
sync-content read only this file to find out what exists (contract: schema/index.schema.json).
"""

from __future__ import annotations

import json
from pathlib import Path

from contract import validate_build_doc

INDEX_VERSION = 1
INDEX_FILE = "index.json"


class IndexBuildError(Exception):
    """A manifest in the build folder is broken; the message lists what is wrong."""


def make_index(content_root: Path, build_root: Path) -> dict:
    """Build the index document from the manifests in build_root."""
    lessons = []
    cues: dict[str, tuple[float, dict]] = {}  # language -> (time of the manifest, cue)
    problems: list[str] = []

    for path in sorted(build_root.glob("*/*/manifest.json")):
        rel = path.relative_to(build_root).as_posix()
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            problems.append(f"{rel}: not valid JSON (line {e.lineno}): {e.msg}")
            continue
        report = validate_build_doc(content_root, "manifest", manifest, rel)
        if report.errors:
            problems += report.errors
            continue
        if path.parent != build_root / manifest["pair"] / manifest["lesson"]:
            problems.append(f"{rel}: the manifest says {manifest['pair']}/{manifest['lesson']}, which is not its folder")
            continue

        lessons.append({
            "pair": manifest["pair"],
            "lesson": manifest["lesson"],
            "title": manifest["title"],
            "target_lang": manifest["target_lang"],
            "meaning_lang": manifest["meaning_lang"],
            "sentences": len(manifest["items"]),
            "seconds": round(sum(i["target_seconds"] + i["meaning_seconds"] for i in manifest["items"]), 2),
            "manifest": rel,
        })
        # The cue file is shared by all lessons of a meaning language and is rebuilt with each of them,
        # so the newest manifest knows it best.
        mtime = path.stat().st_mtime
        lang = manifest["meaning_lang"]
        if lang not in cues or mtime >= cues[lang][0]:
            cues[lang] = (mtime, manifest["end_cue"])

    if problems:
        raise IndexBuildError("cannot make the index:\n  " + "\n  ".join(problems))

    lessons.sort(key=lambda e: (e["pair"], e["lesson"]))
    return {
        "schema_version": INDEX_VERSION,
        "cues": {lang: cue for lang, (_, cue) in sorted(cues.items())},
        "lessons": lessons,
    }


def write_index(content_root: Path, build_root: Path) -> Path:
    """Write build_root/index.json and return its path. The result is checked against the contract."""
    doc = make_index(content_root, build_root)
    report = validate_build_doc(content_root, "index", doc, INDEX_FILE)
    if report.errors:
        raise IndexBuildError("the index does not follow the contract:\n  " + "\n  ".join(report.errors))
    path = build_root / INDEX_FILE
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
