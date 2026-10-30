import shutil
from pathlib import Path

import pytest

from helpers import CONTENT


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """A small content folder: the real schemas, languages and prompt, and no lessons."""
    for name in ("schema/lesson.schema.json", "schema/tuning.schema.json", "schema/languages.schema.json",
                 "schema/manifest.schema.json", "schema/index.schema.json",
                 "languages.json", "prompts/generate-lesson.md"):
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(CONTENT / name, target)
    return tmp_path
