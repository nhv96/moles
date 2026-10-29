"""Helpers shared by the test files."""

import copy
import json
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent
EXAMPLES = CONTENT / "schema" / "examples"

LESSON = "lessons/fr-en/lesson-02.json"
TUNING = "lessons/fr-en/lesson-02.tuning.json"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(root: Path, rel: str, doc) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(doc if isinstance(doc, str) else json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return path


def lesson(**changes) -> dict:
    doc = copy.deepcopy(load(EXAMPLES / "lesson-example.json"))
    doc.update(changes)
    return doc


def tuning(**changes) -> dict:
    doc = copy.deepcopy(load(EXAMPLES / "tuning-example.json"))
    doc.update(changes)
    return doc
