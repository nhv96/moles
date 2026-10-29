"""Check the lesson files against the content contract.

The contract is the JSON Schemas in schema/ plus the rules a schema cannot express (see
check_lesson and check_tuning). This module has no audio or Kokoro code, so it is fast and
testable. It is used by the "validate" command of pipeline.py, and by lesson.py before any audio is made.

What is checked, starting from the content folder:
  languages.json                         against schema/languages.schema.json
  lessons/<pair>/<lesson-id>.json        against schema/lesson.schema.json, plus the rules
  lessons/<pair>/<lesson-id>.tuning.json against schema/tuning.schema.json, plus the rules
  prompts/generate-lesson.md             its copy of the lesson schema, and its example

When a file fails its schema, only the schema errors are shown for it: the rules need a file of
the right shape, so they run once the schema errors are fixed.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from jsonschema import Draft202012Validator

TUNING_SUFFIX = ".tuning.json"
PROMPT_FILE = "prompts/generate-lesson.md"
MAX_MESSAGE_CHARS = 160


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checked: list[str] = field(default_factory=list)  # lesson files that were checked

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}")

    def errors_in(self, *files: str) -> list[str]:
        """The errors that belong to the given files (paths as used in the messages)."""
        return [e for e in self.errors if any(e.startswith(f"{f}:") for f in files)]


# --------------------------------------------------------------------------- helpers


def squash(text: str) -> str:
    return "".join(text.split())


def short(message: str) -> str:
    return message if len(message) <= MAX_MESSAGE_CHARS else message[: MAX_MESSAGE_CHARS - 3] + "..."


def location(path) -> str:
    """Turn a JSON path like ['sentences', 2, 'speaker'] into 'sentences[2].speaker'."""
    text = ""
    for part in path:
        text += f"[{part}]" if isinstance(part, int) else (f".{part}" if text else str(part))
    return text or "(whole file)"


def read_json(path: Path, rel: str, report: Report):
    """Return the parsed file, or None after recording why it could not be read."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        report.error(rel, "file not found")
    except json.JSONDecodeError as e:
        report.error(rel, f"not valid JSON (line {e.lineno}, column {e.colno}): {e.msg}")
    return None


def load_validator(root: Path, name: str, report: Report) -> Draft202012Validator | None:
    rel = f"schema/{name}"
    schema = read_json(root / rel, rel, report)
    if schema is None:
        return None
    try:
        Draft202012Validator.check_schema(schema)
    except Exception as e:  # jsonschema.SchemaError
        report.error(rel, f"not a valid JSON Schema: {short(str(e).splitlines()[0])}")
        return None
    return Draft202012Validator(schema)


def schema_errors(validator: Draft202012Validator, doc, rel: str, report: Report) -> bool:
    """Record every schema error of doc. Return True if there were none."""
    found = sorted(validator.iter_errors(doc), key=lambda e: [str(p) for p in e.absolute_path])
    for e in found:
        report.error(rel, f"{location(e.absolute_path)}: {short(e.message)}")
    return not found


# --------------------------------------------------------------------------- rules


def check_lesson(doc: dict, rel: str, languages: dict | None, report: Report) -> None:
    """Rules for a lesson file that already passed its schema."""
    target, meaning = doc["target_lang"], doc["meaning_lang"]
    sentences = doc["sentences"]

    if target == meaning:
        report.error(rel, f"target_lang and meaning_lang are both {target!r}; they must differ")

    if languages is not None:
        for key in ("target_lang", "meaning_lang"):
            if doc[key] not in languages:
                report.error(rel, f"{key} {doc[key]!r} is not in languages.json")
        if meaning in languages and not languages[meaning].get("end_cue"):
            report.error(rel, f"meaning language {meaning!r} has no end_cue in languages.json")

    seen: set[str] = set()
    for s in sentences:
        if s["id"] in seen:
            report.error(rel, f"{s['id']}: sentence id is used more than once")
        seen.add(s["id"])

        phrases = s.get("phrases")
        if phrases and squash("".join(phrases)) != squash(s["target"]):
            report.error(
                rel, f"{s['id']}: phrases do not add up to the sentence text: {phrases!r} vs {s['target']!r}"
            )

    with_speaker = [s["id"] for s in sentences if "speaker" in s]
    if "speakers" in doc and len(with_speaker) != len(sentences):
        missing = [s["id"] for s in sentences if "speaker" not in s]
        report.error(rel, f"speakers is set, so every sentence needs a speaker; missing in: {', '.join(missing)}")
    if "speakers" not in doc and with_speaker:
        report.error(rel, f"sentences have a speaker ({', '.join(with_speaker)}) but the lesson has no speakers")


def check_tuning(tuning: dict, lesson: dict, rel: str, languages: dict | None, report: Report) -> None:
    """Rules for a tuning file that passed its schema, given its (valid) lesson file."""
    if tuning["lesson"] != lesson["id"]:
        report.error(rel, f"lesson is {tuning['lesson']!r} but the lesson file has id {lesson['id']!r}")

    by_id = {s["id"]: s for s in lesson["sentences"]}
    for sid, settings in tuning.get("sentences", {}).items():
        if sid not in by_id:
            report.error(rel, f"{sid}: no such sentence in the lesson file")
        elif settings.get("mode") == "phrases" and not by_id[sid].get("phrases"):
            report.error(rel, f"{sid}: mode is 'phrases' but the lesson file defines no phrases for it")

    if languages is None:
        return
    engines = {
        "target": languages.get(lesson["target_lang"], {}).get("engine"),
        "meaning": languages.get(lesson["meaning_lang"], {}).get("engine"),
    }
    if engines["target"] == "recording":
        for key in ("default_speed", "phrase_pause_ms"):
            if key in tuning:
                report.warn(rel, f"{key} is ignored: {lesson['target_lang']} is recorded, not generated")
        for sid, settings in tuning.get("sentences", {}).items():
            for key in ("speed", "mode", "phrase_pause_ms"):
                if key in settings:
                    report.warn(rel, f"{sid}: {key} is ignored: {lesson['target_lang']} is recorded, not generated")
    if engines["meaning"] == "recording" and "meaning_speed" in tuning:
        report.warn(rel, f"meaning_speed is ignored: {lesson['meaning_lang']} is recorded, not generated")


def check_prompt(root: Path, lesson_schema: dict, validator: Draft202012Validator, report: Report) -> None:
    """The prompt must hold the current lesson schema, and any lesson in it must be valid."""
    path = root / PROMPT_FILE
    if not path.exists():
        report.error(PROMPT_FILE, "file not found")
        return
    docs = []
    for block in re.findall(r"```json\n(.*?)\n```", path.read_text(encoding="utf-8"), re.S):
        try:
            docs.append(json.loads(block))
        except json.JSONDecodeError as e:
            report.error(PROMPT_FILE, f"a json block is not valid JSON (line {e.lineno}): {e.msg}")
    if lesson_schema not in docs:
        report.error(PROMPT_FILE, "the copy of the lesson schema differs from schema/lesson.schema.json; paste in the current one")
    for doc in docs:
        if isinstance(doc, dict) and "schema_version" in doc and doc != lesson_schema:
            schema_errors(validator, doc, f"{PROMPT_FILE} (example)", report)


# --------------------------------------------------------------------------- entry point


def validate_content(root: Path) -> Report:
    report = Report()

    lesson_v = load_validator(root, "lesson.schema.json", report)
    tuning_v = load_validator(root, "tuning.schema.json", report)
    languages_v = load_validator(root, "languages.schema.json", report)
    if lesson_v is None or tuning_v is None or languages_v is None:
        return report

    languages = None
    doc = read_json(root / "languages.json", "languages.json", report)
    if doc is not None and schema_errors(languages_v, doc, "languages.json", report):
        languages = doc["languages"]

    check_prompt(root, lesson_v.schema, lesson_v, report)

    lessons_dir = root / "lessons"
    files = sorted(lessons_dir.glob("*/*.json")) if lessons_dir.is_dir() else []
    tuning_files = [f for f in files if f.name.endswith(TUNING_SUFFIX)]
    lesson_files = [f for f in files if not f.name.endswith(TUNING_SUFFIX)]

    valid_lessons: dict[Path, dict] = {}
    for path in lesson_files:
        rel = path.relative_to(root).as_posix()
        report.checked.append(rel)
        doc = read_json(path, rel, report)
        if doc is None or not schema_errors(lesson_v, doc, rel, report):
            continue
        if path.stem != doc["id"]:
            report.error(rel, f"file name does not match the lesson id {doc['id']!r}")
        pair = f"{doc['target_lang']}-{doc['meaning_lang']}"
        if path.parent.name != pair:
            report.error(rel, f"folder is {path.parent.name!r} but the languages make the pair {pair!r}")
        check_lesson(doc, rel, languages, report)
        valid_lessons[path] = doc

    for path in tuning_files:
        rel = path.relative_to(root).as_posix()
        lesson_path = path.with_name(path.name[: -len(TUNING_SUFFIX)] + ".json")
        if lesson_path not in lesson_files:
            report.error(rel, f"there is no lesson file {lesson_path.name} next to it")
            continue
        doc = read_json(path, rel, report)
        if doc is None or not schema_errors(tuning_v, doc, rel, report):
            continue
        if lesson_path in valid_lessons:  # otherwise the lesson's own errors are already listed
            check_tuning(doc, valid_lessons[lesson_path], rel, languages, report)

    return report
