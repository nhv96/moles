"""The content pipeline: check lesson files and make the lesson audio.

Three commands (run from the content/ folder). A lesson is named by its language pair and id,
for example fr-en/lesson-01 (files lessons/fr-en/lesson-01.json and .tuning.json).

  validate  Check languages.json, the lesson files in lessons/<pair>/ and the AI prompt against the
            contract in schema/. Makes no audio. Exits with 1 if anything is wrong.
                uv run scripts/pipeline.py validate

  sweep     Listening test. For every sentence, make the audio of the language being learned at
            several speeds (and, for sentences that define "phrases", also a phrase-by-phrase
            version). Use it to decide the best speed and mode per sentence.
                uv run scripts/pipeline.py sweep fr-en/lesson-01
                uv run scripts/pipeline.py sweep fr-en/lesson-01 --speeds 0.7 0.8 0.9

  build     Final files. Uses the settings in the lesson's tuning file and writes one clip per
            sentence for each of the two languages (AAC/M4A, same loudness), the end cue of the
            meaning language, manifest.json, and index.json (the list of everything built). It then checks that every
            file of the manifest exists, is not empty and has the length the manifest says.
                uv run scripts/pipeline.py build fr-en/lesson-01
                uv run scripts/pipeline.py build fr-en/lesson-01 --bitrate 48 --out build-48

The voices and engines come from languages.json; the speeds, modes and pauses from the tuning file.
sweep and build refuse a lesson that does not pass validate.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from audio import DEFAULT_BITRATE_KBPS

CONTENT_DIR = Path(__file__).resolve().parent.parent


def load_engines(lesson):
    """Create the engines for the two languages of a lesson (slow: loads the voice models)."""
    from engines import create_engine

    return (create_engine(lesson.target_lang, lesson.languages[lesson.target_lang]),
            create_engine(lesson.meaning_lang, lesson.languages[lesson.meaning_lang]))


def cmd_validate(args) -> None:
    from contract import validate_content  # no audio code, so it loads at once

    report = validate_content(args.content_dir)
    for line in report.errors:
        print(f"error:   {line}")
    for line in report.warnings:
        print(f"warning: {line}")
    print(f"{len(report.checked)} lesson file(s) checked: {len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    if report.errors:
        raise SystemExit(1)


def open_lesson(args):
    """Load the lesson and its engines, or stop with a short message."""
    from engines import EngineError
    from lesson import LessonError, load_lesson

    try:
        lesson = load_lesson(args.content_dir, args.lesson)
        return lesson, *load_engines(lesson)
    except (LessonError, EngineError) as e:
        raise SystemExit(f"error: {e}")


def cmd_sweep(args) -> None:
    from render import sweep_lesson

    lesson, target, meaning = open_lesson(args)
    out_dir = sweep_lesson(lesson, target, meaning, args.speeds, args.out or args.content_dir / "out")
    print(f"\nDone. Files and review.md are in {out_dir}")


def cmd_build(args) -> None:
    from buildcheck import BuildCheckError, check_lesson_build
    from index import IndexBuildError, write_index
    from render import build_lesson

    lesson, target, meaning = open_lesson(args)
    build_root = args.out or args.content_dir / "build"
    out_dir = build_lesson(lesson, target, meaning, build_root, args.bitrate)
    try:
        check_lesson_build(build_root, out_dir / "manifest.json")
        index = write_index(args.content_dir, build_root)
    except (BuildCheckError, IndexBuildError) as e:
        raise SystemExit(f"error: {e}")
    print(f"\nDone. Files and manifest.json are in {out_dir}; the list of all built lessons is {index}")


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--content-dir", default=CONTENT_DIR, type=Path, help="the content folder (default: this one)")

    lesson_arg = argparse.ArgumentParser(add_help=False)
    lesson_arg.add_argument("lesson", help="language pair and lesson id, for example fr-en/lesson-01")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    validate = sub.add_parser("validate", parents=[common], help="check the lesson files, languages and prompt against the contract")
    validate.set_defaults(func=cmd_validate)

    sweep = sub.add_parser("sweep", parents=[common, lesson_arg], help="listening test at several speeds")
    sweep.add_argument("--speeds", nargs="+", type=float, default=[0.8, 0.9, 1.0])
    sweep.add_argument("--out", type=Path, help="output folder (default: out/ in the content folder)")
    sweep.set_defaults(func=cmd_sweep)

    build = sub.add_parser("build", parents=[common, lesson_arg], help="final files from the tuning settings")
    build.add_argument("--out", type=Path, help="output folder (default: build/ in the content folder)")
    build.add_argument("--bitrate", default=DEFAULT_BITRATE_KBPS, type=int, help="AAC bitrate in kbps")
    build.set_defaults(func=cmd_build)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
