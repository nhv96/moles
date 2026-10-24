"""Generate Kokoro TTS audio for a lesson file.

Two commands (run from the content/ folder):

  sweep   Listening test. For every sentence, make the French audio at several speeds
          (and, for sentences that define "phrases", also a phrase-by-phrase version).
          Use it to decide the best speed and mode per sentence.
              uv run scripts/generate_kokoro.py sweep
              uv run scripts/generate_kokoro.py sweep --speeds 0.7 0.8 0.9

  build   Final files. Uses the settings stored in the lesson file for each sentence
          ("speed", "mode") and writes one French and one English AAC/M4A file per sentence
          (loudness-normalized with ffmpeg loudnorm), plus manifest.json.
              uv run scripts/generate_kokoro.py build
              uv run scripts/generate_kokoro.py build --bitrate 48 --out build-48

Per-sentence settings in the lesson file (all optional):
  "speed":   number, speed for this sentence (falls back to "default_speed")
  "mode":    "whole" (default) or "phrases"
  "phrases": list of text pieces; joined they must equal "fr" (ignoring spaces)
  "phrase_pause_ms": silence between the phrases of this sentence, one number
            (falls back to the lesson-level "phrase_pause_ms", then 400)

Phrase mode makes each piece at the sentence speed, trims silence at the edges of each
piece, and joins them with "phrase_pause_ms" of silence.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np

SAMPLE_RATE = 24000  # Kokoro output rate
FR_VOICE = "ff_siwis"  # the only French voice in Kokoro
EN_VOICE = "af_heart"  # a Kokoro English voice (change with --en-voice)
EDGE_KEEP_MS = 40  # silence kept around a trimmed clip so it does not sound cut
LOUDNESS_LUFS = -16.0  # integrated loudness target for every clip
LEAD_IN_MS = 100  # silence added before every clip, so a player that loses the first moment loses no speech
PEAK_CEILING_DB = -3.5  # limiter ceiling; leaves room for AAC encoding overshoot
DEFAULT_BITRATE_KBPS = 96  # AAC bitrate, chosen by listening (2026-10-25)


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
    if mode not in ("whole", "phrases"):
        raise ValueError(f"{s['id']}: unknown mode {mode!r}")
    if mode == "phrases" and not phrases:
        raise ValueError(f"{s['id']}: mode is 'phrases' but no phrases are defined")


def sentence_speed(lesson: dict, s: dict) -> float:
    return float(s.get("speed", lesson.get("default_speed", 1.0)))


def sentence_pause_ms(lesson: dict, s: dict) -> int:
    return int(s.get("phrase_pause_ms", lesson.get("phrase_pause_ms", 400)))


# --------------------------------------------------------------------------- audio


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


def trim_silence(audio: np.ndarray, rel_threshold: float = 0.02) -> np.ndarray:
    """Cut leading and trailing near-silence, keeping a short margin."""
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak == 0.0:
        return audio
    loud = np.flatnonzero(np.abs(audio) > rel_threshold * peak)
    keep = int(SAMPLE_RATE * EDGE_KEEP_MS / 1000)
    start = max(int(loud[0]) - keep, 0)
    end = min(int(loud[-1]) + keep + 1, len(audio))
    return audio[start:end]


def synth_french(pipeline, s: dict, voice: str, speed: float, mode: str, pause_ms: int) -> np.ndarray:
    if mode == "phrases":
        pause = np.zeros(int(SAMPLE_RATE * pause_ms / 1000), dtype=np.float32)
        parts = []
        for i, phrase in enumerate(s["phrases"]):
            if i:
                parts.append(pause)
            parts.append(trim_silence(synth_text(pipeline, phrase, voice, speed)))
        return np.concatenate(parts)
    return trim_silence(synth_text(pipeline, s["fr"], voice, speed))


def write_wav(path: Path, audio: np.ndarray) -> float:
    import soundfile as sf

    sf.write(path, audio, SAMPLE_RATE)
    return len(audio) / SAMPLE_RATE


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


# --------------------------------------------------------------------------- commands


def make_pipelines():
    # Imported here so argument errors show up before the slow Kokoro import.
    from kokoro import KPipeline

    return KPipeline(lang_code="f"), KPipeline(lang_code="a")  # French (fr-fr), American English


def cmd_sweep(args) -> None:
    lesson = load_lesson(args.lesson)
    out_dir = args.out / lesson["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    fr, en = make_pipelines()

    files: dict[str, list[tuple[str, float]]] = {}  # sentence id -> [(file name, seconds)]

    for s in lesson["sentences"]:
        files[s["id"]] = []
        pause_ms = sentence_pause_ms(lesson, s)
        for speed in args.speeds:
            variants = [("whole", "")]
            if s.get("phrases"):
                variants.append(("phrases", "_ph"))
            for mode, suffix in variants:
                audio = synth_french(fr, s, args.fr_voice, speed, mode, pause_ms)
                name = f"{s['id']}_fr_{speed:.2f}{suffix}.wav"
                seconds = write_wav(out_dir / name, audio)
                files[s["id"]].append((name, seconds))
                print(f"{name}  {seconds:.1f}s")
        name = f"{s['id']}_en.wav"
        print(f"{name}  {write_wav(out_dir / name, synth_text(en, s['en'], args.en_voice, float(lesson.get('en_speed', 1.0)))):.1f}s")

    write_review_sheet(out_dir / "review.md", lesson, files)
    print(f"\nDone. Files and review.md are in {out_dir}")


def cmd_build(args) -> None:
    lesson = load_lesson(args.lesson)
    out_dir = args.out / lesson["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    en_speed = float(lesson.get("en_speed", 1.0))
    fr, en = make_pipelines()

    def encode(tmp: Path, name: str, audio: np.ndarray) -> tuple[str, float]:
        """Write audio as a temporary WAV, then normalize and encode it to out_dir/name.m4a."""
        write_wav(tmp / f"{name}.wav", audio)
        m4a_name = f"{name}.m4a"
        return m4a_name, encode_m4a(tmp / f"{name}.wav", out_dir / m4a_name, args.bitrate)

    items = []
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        for s in lesson["sentences"]:
            speed = sentence_speed(lesson, s)
            pause_ms = sentence_pause_ms(lesson, s)
            mode = s.get("mode", "whole")
            fr_name, fr_seconds = encode(tmp, f"{s['id']}_fr", synth_french(fr, s, args.fr_voice, speed, mode, pause_ms))
            en_name, en_seconds = encode(tmp, f"{s['id']}_en", synth_text(en, s["en"], args.en_voice, en_speed))
            print(f"{s['id']}  speed={speed:.2f} mode={mode}  fr {fr_seconds:.2f}s  en {en_seconds:.2f}s")
            items.append({
                "id": s["id"], "fr": s["fr"], "en": s["en"], "speed": speed, "mode": mode,
                "fr_file": fr_name, "en_file": en_name,
                "fr_seconds": round(fr_seconds, 2), "en_seconds": round(en_seconds, 2),
            })

        cue = lesson["finished_cue"]
        cue_name, cue_seconds = encode(tmp, f"{cue['id']}_en", synth_text(en, cue["en"], args.en_voice, en_speed))

    manifest = {
        "lesson": lesson["id"], "title": lesson["title"],
        "voice_fr": args.fr_voice, "voice_en": args.en_voice,
        "format": "aac-m4a", "bitrate_kbps": args.bitrate, "loudness_lufs": LOUDNESS_LUFS,
        "items": items,
        "finished_cue": {"id": cue["id"], "en": cue["en"], "file": cue_name, "seconds": round(cue_seconds, 2)},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nDone. Files and manifest.json are in {out_dir}")


def write_review_sheet(path: Path, lesson: dict, files: dict[str, list[tuple[str, float]]]) -> None:
    lines = [
        f"# Review sheet: {lesson['title']}",
        "",
        "Voice: Kokoro `ff_siwis` (France French). Files ending in `_ph` are phrase-by-phrase versions.",
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
        lines += ["", "Best file / speed / mode: ", "Text natural and correct?  yes / no. Suggested fix:", "", ""]
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

    sweep = sub.add_parser("sweep", parents=[common], help="listening test at several speeds")
    sweep.add_argument("--speeds", nargs="+", type=float, default=[0.6, 0.7, 0.8, 0.9, 1.0])
    sweep.add_argument("--out", default="out", type=Path)
    sweep.set_defaults(func=cmd_sweep)

    build = sub.add_parser("build", parents=[common], help="final files from per-sentence settings")
    build.add_argument("--out", default="build", type=Path)
    build.add_argument("--bitrate", default=DEFAULT_BITRATE_KBPS, type=int, help="AAC bitrate in kbps")
    build.set_defaults(func=cmd_build)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
