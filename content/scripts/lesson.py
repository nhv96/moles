"""Load one lesson for sweep and build: its text, its tuning and the language settings.

A lesson is addressed by a key such as "fr-en/lesson-01", which names the files
lessons/fr-en/lesson-01.json (text, written by the AI) and
lessons/fr-en/lesson-01.tuning.json (audio choices, written by the user, optional).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from contract import TUNING_SUFFIX, validate_content

DEFAULT_PHRASE_PAUSE_MS = 100
FALLBACK_SPEED = 1.0  # for an engine that has no default_speed
KEY_PATTERN = re.compile(r"^[a-z]{2,3}-[a-z]{2,3}/lesson-[0-9]{2,}$")


class LessonError(Exception):
    """The lesson cannot be loaded; the message says why."""


@dataclass(frozen=True)
class SentenceSettings:
    speed: float
    mode: str  # "whole" or "phrases"
    pause_ms: int


@dataclass
class Lesson:
    key: str
    doc: dict  # the text file
    tuning: dict  # the tuning file, {} if there is none
    languages: dict  # languages.json, the "languages" part

    @property
    def id(self) -> str:
        return self.doc["id"]

    @property
    def pair(self) -> str:
        return self.key.split("/")[0]

    @property
    def target_lang(self) -> str:
        return self.doc["target_lang"]

    @property
    def meaning_lang(self) -> str:
        return self.doc["meaning_lang"]

    @property
    def sentences(self) -> list[dict]:
        return self.doc["sentences"]

    def default_speed(self, lang: str) -> float:
        return float(self.languages[lang].get("default_speed", FALLBACK_SPEED))

    def settings(self, sentence: dict) -> SentenceSettings:
        """Audio settings of a sentence: its own tuning, then the lesson's, then the language's."""
        own = self.tuning.get("sentences", {}).get(sentence["id"], {})
        return SentenceSettings(
            speed=float(own.get("speed", self.tuning.get("default_speed", self.default_speed(self.target_lang)))),
            mode=own.get("mode", "whole"),
            pause_ms=int(own.get("phrase_pause_ms", self.tuning.get("phrase_pause_ms", DEFAULT_PHRASE_PAUSE_MS))),
        )

    @property
    def meaning_speed(self) -> float:
        return float(self.tuning.get("meaning_speed", self.default_speed(self.meaning_lang)))

    @property
    def end_cue_text(self) -> str:
        return self.languages[self.meaning_lang]["end_cue"]

    @property
    def end_cue_speed(self) -> float:
        # The tuning file belongs to one lesson, but the cue is shared by all lessons in this language.
        return self.default_speed(self.meaning_lang)


def normalize_key(text: str) -> str:
    """Accept fr-en/lesson-01, lessons/fr-en/lesson-01 and lessons/fr-en/lesson-01.json."""
    key = text.removesuffix(".json").removeprefix("lessons/")
    if not KEY_PATTERN.match(key):
        raise LessonError(f"{text!r} is not a lesson; write it like fr-en/lesson-01")
    return key


def load_lesson(root: Path, text: str) -> Lesson:
    """Load a lesson after checking it, its tuning file and languages.json against the contract."""
    key = normalize_key(text)
    lesson_rel = f"lessons/{key}.json"
    tuning_rel = f"lessons/{key}{TUNING_SUFFIX}"
    if not (root / lesson_rel).exists():
        raise LessonError(f"{lesson_rel} does not exist")

    errors = validate_content(root).errors_in(lesson_rel, tuning_rel, "languages.json", "schema/lesson.schema.json",
                                              "schema/tuning.schema.json", "schema/languages.schema.json")
    if errors:
        raise LessonError("the lesson files have errors (run validate):\n  " + "\n  ".join(errors))

    tuning_path = root / tuning_rel
    return Lesson(
        key=key,
        doc=json.loads((root / lesson_rel).read_text(encoding="utf-8")),
        tuning=json.loads(tuning_path.read_text(encoding="utf-8")) if tuning_path.exists() else {},
        languages=json.loads((root / "languages.json").read_text(encoding="utf-8"))["languages"],
    )
