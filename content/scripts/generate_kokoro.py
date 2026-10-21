"""Generate Kokoro TTS audio for a lesson file, for listening tests.

Usage (from the content/ folder):
    uv run scripts/generate_kokoro.py
    uv run scripts/generate_kokoro.py --lesson lessons/lesson-01.json --speeds 0.8 0.9 1.0

Output (default out/<lesson-id>/):
    s01_fr_0.80.wav, s01_fr_0.90.wav, s01_fr_1.00.wav, ...   French, one file per speed
    s01_en.wav, ...                                           English meaning, normal speed
    end_en.wav                                                "lesson finished" cue
    review.md                                                 sheet for the native-speaker review
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf

SAMPLE_RATE = 24000  # Kokoro output rate
FR_VOICE = "ff_siwis"  # the only French voice in Kokoro
EN_VOICE = "af_heart"  # a Kokoro English voice (change with --en-voice)


def to_numpy(audio) -> np.ndarray:
    """Kokoro may return a torch tensor or a numpy array; always give numpy."""
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    return np.asarray(audio, dtype=np.float32)


def synthesize(pipeline, text: str, voice: str, speed: float) -> np.ndarray:
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


def write_wav(path: Path, audio: np.ndarray) -> float:
    sf.write(path, audio, SAMPLE_RATE)
    return len(audio) / SAMPLE_RATE


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lesson", default="lessons/lesson-01.json", type=Path)
    parser.add_argument("--out", default="out", type=Path)
    parser.add_argument("--speeds", nargs="+", type=float, default=[0.8, 0.9, 1.0])
    parser.add_argument("--fr-voice", default=FR_VOICE)
    parser.add_argument("--en-voice", default=EN_VOICE)
    args = parser.parse_args()

    lesson = json.loads(args.lesson.read_text(encoding="utf-8"))
    out_dir = args.out / lesson["id"]
    out_dir.mkdir(parents=True, exist_ok=True)

    # Imported here so the (slow) Kokoro import only happens once arguments are valid.
    from kokoro import KPipeline

    fr = KPipeline(lang_code="f")  # French (fr-fr)
    en = KPipeline(lang_code="a")  # American English

    durations: dict[tuple[str, float], float] = {}

    for s in lesson["sentences"]:
        for speed in args.speeds:
            audio = synthesize(fr, s["fr"], args.fr_voice, speed)
            name = f"{s['id']}_fr_{speed:.2f}.wav"
            durations[(s["id"], speed)] = write_wav(out_dir / name, audio)
            print(f"{name}  {durations[(s['id'], speed)]:.1f}s")
        audio = synthesize(en, s["en"], args.en_voice, 1.0)
        name = f"{s['id']}_en.wav"
        print(f"{name}  {write_wav(out_dir / name, audio):.1f}s")

    cue = lesson["finished_cue"]
    audio = synthesize(en, cue["en"], args.en_voice, 1.0)
    write_wav(out_dir / f"{cue['id']}_en.wav", audio)

    write_review_sheet(out_dir / "review.md", lesson, args.speeds, durations)
    print(f"\nDone. Files and review.md are in {out_dir}")


def write_review_sheet(path: Path, lesson: dict, speeds: list[float], durations: dict) -> None:
    lines = [
        f"# Review sheet: {lesson['title']}",
        "",
        "Voice: Kokoro `ff_siwis` (France French). Please listen to each file and mark it.",
        "",
        "For each sentence and speed, tick **OK** only if the words are clear, liaisons and nasal",
        "vowels sound right, and the rhythm sounds natural. Otherwise write what is wrong.",
        "",
        "Also note: is the *text* itself natural French for this situation (vous register)?",
        "",
    ]
    for s in lesson["sentences"]:
        lines += [f"## {s['id']}: {s['fr']}", "", f"Meaning: {s['en']}", "",
                  "| File | Seconds | OK? | Notes (which word, what is wrong) |", "|---|---|---|---|"]
        for speed in speeds:
            lines.append(f"| `{s['id']}_fr_{speed:.2f}.wav` | {durations[(s['id'], speed)]:.1f} |  |  |")
        lines += ["", "Text natural and correct?  yes / no. Suggested fix:", "", ""]
    lines += ["## Overall", "", "- Best speed overall:", "- Is the voice good enough to learn from?  yes / no", "- Other comments:", ""]
    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
