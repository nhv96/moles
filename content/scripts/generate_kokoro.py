"""Generate Kokoro TTS audio for a lesson file.

Two commands (run from the content/ folder):

  sweep   Listening test. For every sentence, make the French audio at several speeds
          and in several modes, so you can pick the best setting per sentence.
              uv run scripts/generate_kokoro.py sweep
              uv run scripts/generate_kokoro.py sweep --speeds 0.9 1.0 --modes words --pauses 0 60 120

  build   Final files. Uses the settings stored in the lesson file for each sentence
          and writes one French and one English file per sentence, plus manifest.json.
              uv run scripts/generate_kokoro.py build

Modes (how the French sentence is made):
  whole    the whole sentence in one go (default)
  phrases  the pieces listed in the sentence's "phrases", each made separately
  words    every word made separately (split on spaces; a lone "?" or "!" stays with the word before)

In "phrases" and "words" mode each piece is made at the sentence speed, silence at its edges is
trimmed, and the pieces are joined with a gap of "pause_ms" milliseconds (total gap between the
spoken parts, 0 = no gap).

Per-sentence settings in the lesson file (all optional):
  "speed":    number, falls back to the lesson's "default_speed"
  "mode":     "whole" (default), "phrases" or "words"
  "phrases":  list of text pieces; joined they must equal "fr" (ignoring spaces)
  "pause_ms": gap between pieces: one number for all gaps, or a list with one number per gap.
              Falls back to the lesson's "phrase_pause_ms" (400 if missing).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

SAMPLE_RATE = 24000  # Kokoro output rate
FR_VOICE = "ff_siwis"  # the only French voice in Kokoro
EN_VOICE = "af_heart"  # a Kokoro English voice (change with --en-voice)
EDGE_KEEP_MS = 40  # quiet kept at the outer edges of a clip so it does not sound cut
FADE_MS = 5  # short fade at joins between pieces, to avoid clicks
DEFAULT_PAUSE_MS = 400
MODES = ("whole", "phrases", "words")
MODE_TAG = {"phrases": "ph", "words": "wd"}

# --------------------------------------------------------------------------- lesson file


def load_lesson(path: Path) -> dict:
    lesson = json.loads(path.read_text(encoding="utf-8"))
    for s in lesson["sentences"]:
        validate_sentence(s)
    return lesson


def squash(text: str) -> str:
    return "".join(text.split())


def validate_sentence(s: dict) -> None:
    phrases = s.get("phrases")
    if phrases and squash("".join(phrases)) != squash(s["fr"]):
        raise ValueError(f"{s['id']}: phrases do not add up to the sentence text: {phrases!r} vs {s['fr']!r}")
    mode = s.get("mode", "whole")
    if mode not in MODES:
        raise ValueError(f"{s['id']}: unknown mode {mode!r}")
    if mode == "phrases" and not phrases:
        raise ValueError(f"{s['id']}: mode is 'phrases' but no phrases are defined")


def sentence_speed(lesson: dict, s: dict) -> float:
    return float(s.get("speed", lesson.get("default_speed", 1.0)))


def sentence_pause_spec(lesson: dict, s: dict):
    """The pause setting as written: a number, or a list with one number per gap."""
    return s.get("pause_ms", lesson.get("phrase_pause_ms", DEFAULT_PAUSE_MS))


def split_words(text: str) -> list[str]:
    words: list[str] = []
    for token in text.split():
        if words and not any(c.isalnum() for c in token):
            words[-1] += " " + token  # lone punctuation, e.g. the "?" in French typography
        else:
            words.append(token)
    return words


def pieces_for(s: dict, mode: str) -> list[str]:
    if mode == "phrases":
        return list(s["phrases"])
    if mode == "words":
        return split_words(s["fr"])
    return [s["fr"]]


def resolve_pauses(spec, n_pieces: int, sentence_id: str) -> list[int]:
    gaps = max(n_pieces - 1, 0)
    if gaps == 0:
        return []
    if isinstance(spec, (int, float)):
        return [int(spec)] * gaps
    if len(spec) != gaps:
        raise ValueError(f"{sentence_id}: pause_ms has {len(spec)} values but there are {gaps} gaps")
    return [int(x) for x in spec]


def pause_label(spec) -> str:
    return f"p{int(spec):03d}" if isinstance(spec, (int, float)) else "plist"


# --------------------------------------------------------------------------- audio


def ms(n: float) -> int:
    return int(SAMPLE_RATE * n / 1000)


def to_numpy(audio) -> np.ndarray:
    """Kokoro may return a torch tensor or a numpy array; always give numpy."""
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    return np.asarray(audio, dtype=np.float32)


def synth_text(pipeline, text: str, voice: str, speed: float) -> np.ndarray:
    """Run one text through the pipeline and join the returned chunks."""
    chunks = []
    for result in pipeline(text, voice=voice, speed=speed):
        # Newer kokoro versions yield an object with .audio, older ones a tuple.
        audio = result.audio if hasattr(result, "audio") else result[2]
        if audio is not None:
            chunks.append(to_numpy(audio))
    if not chunks:
        raise RuntimeError(f"No audio produced for: {text!r}")
    return np.concatenate(chunks)


def trim_silence(audio: np.ndarray, head_ms: float, tail_ms: float, rel_threshold: float = 0.02) -> np.ndarray:
    """Cut leading and trailing near-silence, keeping head_ms / tail_ms of quiet around the sound."""
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak == 0.0:
        return audio
    loud = np.flatnonzero(np.abs(audio) > rel_threshold * peak)
    start = max(int(loud[0]) - ms(head_ms), 0)
    end = min(int(loud[-1]) + ms(tail_ms) + 1, len(audio))
    return audio[start:end]


def fade(clip: np.ndarray, fade_in: bool, fade_out: bool) -> np.ndarray:
    clip = clip.copy()
    n = min(ms(FADE_MS), len(clip) // 2)
    if n > 0 and fade_in:
        clip[:n] *= np.linspace(0.0, 1.0, n, dtype=np.float32)
    if n > 0 and fade_out:
        clip[-n:] *= np.linspace(1.0, 0.0, n, dtype=np.float32)
    return clip


def synth_french(pipeline, s: dict, voice: str, speed: float, mode: str, pause_spec) -> np.ndarray:
    pieces = pieces_for(s, mode)
    pauses = resolve_pauses(pause_spec, len(pieces), s["id"])
    last = len(pieces) - 1

    parts: list[np.ndarray] = []
    kept: list[tuple[float, float]] = []  # (head_ms, tail_ms) of quiet kept on each piece
    for i, piece in enumerate(pieces):
        head = min(EDGE_KEEP_MS, pauses[i - 1] / 2) if i > 0 else EDGE_KEEP_MS
        tail = min(EDGE_KEEP_MS, pauses[i] / 2) if i < last else EDGE_KEEP_MS
        clip = trim_silence(synth_text(pipeline, piece, voice, speed), head, tail)
        parts.append(fade(clip, fade_in=i > 0, fade_out=i < last))
        kept.append((head, tail))

    out: list[np.ndarray] = []
    for i, clip in enumerate(parts):
        out.append(clip)
        if i < last:
            # the quiet already kept on both sides counts towards the requested gap
            silence = pauses[i] - kept[i][1] - kept[i + 1][0]
            if silence > 0:
                out.append(np.zeros(ms(silence), dtype=np.float32))
    return np.concatenate(out)


def write_wav(path: Path, audio: np.ndarray) -> float:
    import soundfile as sf

    sf.write(path, audio, SAMPLE_RATE)
    return len(audio) / SAMPLE_RATE


# --------------------------------------------------------------------------- commands


def make_pipelines():
    # Imported here so argument errors show up before the slow Kokoro import.
    from kokoro import KPipeline

    return KPipeline(lang_code="f"), KPipeline(lang_code="a")  # French (fr-fr), American English


def cmd_sweep(args) -> None:
    lesson = load_lesson(args.lesson)
    out_dir = args.out / lesson["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    en_speed = float(lesson.get("en_speed", 1.0))
    fr, en = make_pipelines()

    files: dict[str, list[tuple[str, float]]] = {}  # sentence id -> [(file name, seconds)]

    for s in lesson["sentences"]:
        files[s["id"]] = []
        for speed in args.speeds:
            for mode in args.modes:
                if mode == "phrases" and not s.get("phrases"):
                    continue
                if mode == "words" and len(split_words(s["fr"])) < 2:
                    continue
                if mode == "whole":
                    variants = [(None, f"{s['id']}_fr_{speed:.2f}.wav")]
                else:
                    specs = args.pauses if args.pauses else [sentence_pause_spec(lesson, s)]
                    variants = [(p, f"{s['id']}_fr_{speed:.2f}_{MODE_TAG[mode]}_{pause_label(p)}.wav") for p in specs]
                for pause, name in variants:
                    audio = synth_french(fr, s, args.fr_voice, speed, mode, pause)
                    seconds = write_wav(out_dir / name, audio)
                    files[s["id"]].append((name, seconds))
                    print(f"{name}  {seconds:.1f}s")
        name = f"{s['id']}_en.wav"
        seconds = write_wav(out_dir / name, synth_text(en, s["en"], args.en_voice, en_speed))
        print(f"{name}  {seconds:.1f}s")

    write_review_sheet(out_dir / "review.md", lesson, files)
    print(f"\nDone. Files and review.md are in {out_dir}")


def cmd_build(args) -> None:
    lesson = load_lesson(args.lesson)
    out_dir = args.out / lesson["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    en_speed = float(lesson.get("en_speed", 1.0))
    fr, en = make_pipelines()

    items = []
    for s in lesson["sentences"]:
        speed = sentence_speed(lesson, s)
        mode = s.get("mode", "whole")
        pause = sentence_pause_spec(lesson, s) if mode != "whole" else None
        fr_name, en_name = f"{s['id']}_fr.wav", f"{s['id']}_en.wav"
        fr_seconds = write_wav(out_dir / fr_name, synth_french(fr, s, args.fr_voice, speed, mode, pause))
        en_seconds = write_wav(out_dir / en_name, synth_text(en, s["en"], args.en_voice, en_speed))
        print(f"{s['id']}  speed={speed:.2f} mode={mode} pause_ms={pause}  fr {fr_seconds:.1f}s  en {en_seconds:.1f}s")
        items.append({
            "id": s["id"], "fr": s["fr"], "en": s["en"], "speed": speed, "mode": mode, "pause_ms": pause,
            "fr_file": fr_name, "en_file": en_name,
            "fr_seconds": round(fr_seconds, 2), "en_seconds": round(en_seconds, 2),
        })

    cue = lesson["finished_cue"]
    cue_name = f"{cue['id']}_en.wav"
    cue_seconds = write_wav(out_dir / cue_name, synth_text(en, cue["en"], args.en_voice, en_speed))

    manifest = {
        "lesson": lesson["id"], "title": lesson["title"],
        "voice_fr": args.fr_voice, "voice_en": args.en_voice, "sample_rate": SAMPLE_RATE,
        "items": items,
        "finished_cue": {"id": cue["id"], "en": cue["en"], "file": cue_name, "seconds": round(cue_seconds, 2)},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nDone. Files and manifest.json are in {out_dir}")


def write_review_sheet(path: Path, lesson: dict, files: dict[str, list[tuple[str, float]]]) -> None:
    lines = [
        f"# Review sheet: {lesson['title']}",
        "",
        "Voice: Kokoro `ff_siwis` (France French). File names: `_ph_p200` = phrases with a 200 ms gap,",
        "`_wd_p060` = word by word with a 60 ms gap, no tag = whole sentence.",
        "",
        "For each file, tick **OK** only if the words are clear, liaisons and nasal vowels sound right,",
        "and the rhythm sounds natural. Otherwise write what is wrong (which word, what is wrong).",
        "",
        "Also note: is the *text* itself natural French for this situation (vous register)?",
        "",
    ]
    for s in lesson["sentences"]:
        lines += [f"## {s['id']}: {s['fr']}", "", f"Meaning: {s['en']}", "",
                  "| File | Seconds | OK? | Notes |", "|---|---|---|---|"]
        for name, seconds in files[s["id"]]:
            lines.append(f"| `{name}` | {seconds:.1f} |  |  |")
        lines += ["", "Best file (speed / mode / pause): ", "Text natural and correct?  yes / no. Suggested fix:", "", ""]
    lines += ["## Overall", "", "- Is the voice good enough to learn from?  yes / no", "- Other comments:", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


# --------------------------------------------------------------------------- cli


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--lesson", default="lessons/lesson-01.json", type=Path)
    common.add_argument("--fr-voice", default=FR_VOICE)
    common.add_argument("--en-voice", default=EN_VOICE)

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sweep = sub.add_parser("sweep", parents=[common], help="listening test at several speeds and modes")
    sweep.add_argument("--speeds", nargs="+", type=float, default=[0.6, 0.7, 0.8, 0.9, 1.0])
    sweep.add_argument("--modes", nargs="+", choices=MODES, default=["whole", "phrases"],
                       help="which versions to make (default: whole phrases)")
    sweep.add_argument("--pauses", nargs="+", type=int, default=None,
                       help="gap sizes in ms to try for phrases/words modes (default: the lesson's setting)")
    sweep.add_argument("--out", default="out", type=Path)
    sweep.set_defaults(func=cmd_sweep)

    build = sub.add_parser("build", parents=[common], help="final files from per-sentence settings")
    build.add_argument("--out", default="build", type=Path)
    build.set_defaults(func=cmd_build)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
