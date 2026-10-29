"""Make the audio of a lesson: the listening test (sweep) and the final files (build).

Both take the engines as arguments, so tests can use a fake engine instead of Kokoro.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np

from audio import DEFAULT_BITRATE_KBPS, LOUDNESS_LUFS, encode_m4a, join_with_pause, trim_silence, write_wav
from engines import Engine
from lesson import Lesson

FORMAT = "aac-m4a"
MANIFEST_VERSION = 1


def render_target(engine: Engine, sentence: dict, speed: float, mode: str, pause_ms: int) -> np.ndarray:
    """The sentence in the language being learned. Silence at the edges is trimmed, so the app controls all pauses."""
    rate = engine.sample_rate
    if mode == "phrases":
        parts = [trim_silence(engine.synth(phrase, speed), rate) for phrase in sentence["phrases"]]
        return join_with_pause(parts, pause_ms, rate)
    return trim_silence(engine.synth(sentence["target"], speed), rate)


# --------------------------------------------------------------------------- sweep


def sweep_lesson(lesson: Lesson, target: Engine, meaning: Engine, speeds: list[float], out_root: Path) -> Path:
    """Every sentence at several speeds, plus phrase-by-phrase versions where phrases are defined."""
    out_dir = out_root / lesson.pair / lesson.id
    out_dir.mkdir(parents=True, exist_ok=True)
    files: dict[str, list[tuple[str, float]]] = {}  # sentence id -> [(file name, seconds)]

    for s in lesson.sentences:
        files[s["id"]] = []
        pause_ms = lesson.settings(s).pause_ms
        for speed in speeds:
            variants = [("whole", "")]
            if s.get("phrases"):
                variants.append(("phrases", "_ph"))
            for mode, suffix in variants:
                audio = render_target(target, s, speed, mode, pause_ms)
                name = f"{s['id']}_target_{speed:.2f}{suffix}.wav"
                seconds = write_wav(out_dir / name, audio, target.sample_rate)
                files[s["id"]].append((name, seconds))
                print(f"{name}  {seconds:.1f}s")
        name = f"{s['id']}_meaning.wav"
        seconds = write_wav(out_dir / name, meaning.synth(s["meaning"], lesson.meaning_speed), meaning.sample_rate)
        print(f"{name}  {seconds:.1f}s")

    write_review_sheet(out_dir / "review.md", lesson, target, files)
    return out_dir


def write_review_sheet(path: Path, lesson: Lesson, target: Engine, files: dict[str, list[tuple[str, float]]]) -> None:
    language = lesson.languages[lesson.target_lang]["name"]
    voice_note = f"Voice: `{target.voice}`" + (f" ({lesson.doc['accent']})" if lesson.doc.get("accent") else "")
    register = f" ({lesson.doc['register']} register)" if lesson.doc.get("register") else ""
    lines = [
        f"# Review sheet: {lesson.doc['title']}",
        "",
        f"{voice_note}. Files ending in `_ph` are phrase-by-phrase versions.",
        "",
        "For each file, tick **OK** only if the words are clear, the sounds are right for the language",
        "and the rhythm sounds natural. Otherwise write what is wrong (which word, what is wrong).",
        "",
        f"Also note: is the *text* itself natural {language} for this situation{register}?",
        "",
    ]
    for s in lesson.sentences:
        lines += [f"## {s['id']}: {s['target']}", "", f"Meaning: {s['meaning']}", "",
                  "| File | Seconds | OK? | Notes |", "|---|---|---|---|"]
        for name, seconds in files[s["id"]]:
            lines.append(f"| `{name}` | {seconds:.1f} |  |  |")
        lines += ["", "Best file / speed / mode: ", "Text natural and correct?  yes / no. Suggested fix:", "", ""]
    lines += ["## Overall", "", "- Is the voice good enough to learn from?  yes / no", "- Other comments:", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


# --------------------------------------------------------------------------- build


def cue_file(meaning_lang: str) -> str:
    """Path of the end cue of a meaning language, relative to the build folder. One file serves all lessons."""
    return f"cues/{meaning_lang}.m4a"


def build_lesson(lesson: Lesson, target: Engine, meaning: Engine, out_root: Path,
                 bitrate: int = DEFAULT_BITRATE_KBPS) -> Path:
    """Final files: one target and one meaning clip per sentence, the end cue of the meaning language,
    and manifest.json. Returns the lesson's folder."""
    out_dir = out_root / lesson.pair / lesson.id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_root / "cues").mkdir(parents=True, exist_ok=True)

    def encode(tmp: Path, name: str, audio: np.ndarray, rate: int, dest: Path) -> float:
        """Write audio as a temporary WAV, then normalize and encode it to dest (an .m4a file)."""
        write_wav(tmp / f"{name}.wav", audio, rate)
        return encode_m4a(tmp / f"{name}.wav", dest, bitrate)

    items = []
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        for s in lesson.sentences:
            st = lesson.settings(s)
            target_name, meaning_name = f"{s['id']}_target.m4a", f"{s['id']}_meaning.m4a"
            target_seconds = encode(tmp, f"{s['id']}_target", render_target(target, s, st.speed, st.mode, st.pause_ms),
                                    target.sample_rate, out_dir / target_name)
            meaning_seconds = encode(tmp, f"{s['id']}_meaning", meaning.synth(s["meaning"], lesson.meaning_speed),
                                     meaning.sample_rate, out_dir / meaning_name)
            print(f"{s['id']}  speed={st.speed:.2f} mode={st.mode}  target {target_seconds:.2f}s  meaning {meaning_seconds:.2f}s")
            item = {"id": s["id"]}
            if "speaker" in s:
                item["speaker"] = s["speaker"]
            item.update({
                "target": s["target"], "meaning": s["meaning"], "speed": st.speed, "mode": st.mode,
                "target_file": target_name, "meaning_file": meaning_name,
                "target_seconds": round(target_seconds, 2), "meaning_seconds": round(meaning_seconds, 2),
            })
            items.append(item)

        cue_path = cue_file(lesson.meaning_lang)
        cue_seconds = encode(tmp, "end_cue", meaning.synth(lesson.end_cue_text, lesson.end_cue_speed),
                             meaning.sample_rate, out_root / cue_path)

    manifest: dict = {
        "schema_version": MANIFEST_VERSION,
        "lesson": lesson.id, "pair": lesson.pair,
        "target_lang": lesson.target_lang, "meaning_lang": lesson.meaning_lang,
        "title": lesson.doc["title"],
    }
    if "speakers" in lesson.doc:
        manifest["speakers"] = lesson.doc["speakers"]
    manifest.update({
        "target_voice": target.voice, "meaning_voice": meaning.voice,
        "format": FORMAT, "bitrate_kbps": bitrate, "loudness_lufs": LOUDNESS_LUFS,
        "items": items,
        "end_cue": {"text": lesson.end_cue_text, "file": cue_path, "seconds": round(cue_seconds, 2)},
    })
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out_dir
