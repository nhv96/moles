import json
import shutil
import sys

import numpy as np
import pytest

import pipeline
from buildcheck import BuildCheckError, check_lesson_build
from engines import Engine, EngineError, create_engine
from helpers import CONTENT, LESSON, TUNING, lesson, load, tuning, write
from lesson import LessonError, SentenceSettings, load_lesson, normalize_key
from index import IndexBuildError, make_index, write_index
from render import build_lesson, cue_file, render_target, sweep_lesson

KEY = "fr-en/lesson-02"
needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
                                  reason="ffmpeg is not installed")


class FakeEngine(Engine):
    """A tone of 50 ms per word with 200 ms of silence on each side, and a record of the calls."""

    sample_rate = 24000

    def __init__(self, voice="fake"):
        self.voice = voice
        self.calls: list[tuple[str, float]] = []

    def synth(self, text: str, speed: float) -> np.ndarray:
        self.calls.append((text, speed))
        n = int(self.sample_rate * 0.05 * len(text.split()))
        tone = (0.3 * np.sin(2 * np.pi * 220 * np.arange(n) / self.sample_rate)).astype(np.float32)
        silence = np.zeros(int(self.sample_rate * 0.2), dtype=np.float32)
        return np.concatenate([silence, tone, silence])


@pytest.fixture
def lesson_root(root):
    write(root, LESSON, lesson())
    write(root, TUNING, tuning())
    return root


# --------------------------------------------------------------------------- loading


@pytest.mark.parametrize("text", [KEY, f"lessons/{KEY}", f"lessons/{KEY}.json"])
def test_key_forms(text):
    assert normalize_key(text) == KEY


@pytest.mark.parametrize("text", ["lesson-02", "fr/lesson-02", "fr-en/lesson-2", "../fr-en/lesson-02", "fr-en/lesson-02.tuning.json"])
def test_bad_keys(text):
    with pytest.raises(LessonError, match="write it like fr-en/lesson-01"):
        normalize_key(text)


def test_missing_lesson(root):
    with pytest.raises(LessonError, match="does not exist"):
        load_lesson(root, KEY)


def test_lesson_with_errors_is_refused(lesson_root):
    write(lesson_root, LESSON, lesson(meaning_lang="fr"))
    with pytest.raises(LessonError, match="run validate") as e:
        load_lesson(lesson_root, KEY)
    assert "both 'fr'" in str(e.value)


def test_errors_in_other_lessons_do_not_block(lesson_root):
    write(lesson_root, "lessons/fr-en/lesson-03.json", '{"broken": ')
    assert load_lesson(lesson_root, KEY).id == "lesson-02"


def test_lesson_without_tuning_file(lesson_root):
    (lesson_root / TUNING).unlink()
    loaded = load_lesson(lesson_root, KEY)
    assert loaded.tuning == {}
    # fr default_speed 0.9, no mode, pause 100; en default_speed 1.0
    assert loaded.settings(loaded.sentences[0]) == SentenceSettings(speed=0.9, mode="whole", pause_ms=100)
    assert loaded.meaning_speed == 1.0


def test_settings_order_sentence_then_lesson_then_language(lesson_root):
    write(lesson_root, TUNING, tuning(default_speed=0.8, phrase_pause_ms=250))
    loaded = load_lesson(lesson_root, KEY)
    by_id = {s["id"]: s for s in loaded.sentences}
    assert loaded.settings(by_id["s01"]) == SentenceSettings(0.87, "phrases", 100)  # all from the sentence
    assert loaded.settings(by_id["s03"]) == SentenceSettings(0.92, "whole", 250)  # speed own, pause lesson's
    assert loaded.settings(by_id["s02"]) == SentenceSettings(0.8, "whole", 250)  # no entry: lesson's values


def test_end_cue_comes_from_the_language_not_the_tuning(lesson_root):
    write(lesson_root, TUNING, tuning(meaning_speed=0.7))
    loaded = load_lesson(lesson_root, KEY)
    assert loaded.end_cue_text == "The lesson is finished."
    assert loaded.meaning_speed == 0.7
    assert loaded.end_cue_speed == 1.0


def test_real_lesson_one_keeps_its_tuned_values():
    loaded = load_lesson(CONTENT, "fr-en/lesson-01")
    assert (loaded.pair, loaded.id, len(loaded.sentences)) == ("fr-en", "lesson-01", 8)
    by_id = {s["id"]: s for s in loaded.sentences}
    assert loaded.settings(by_id["s01"]) == SentenceSettings(0.87, "phrases", 100)
    assert loaded.settings(by_id["s02"]) == SentenceSettings(0.9, "whole", 400)
    assert loaded.settings(by_id["s05"]) == SentenceSettings(0.85, "whole", 400)
    assert loaded.settings(by_id["s08"]) == SentenceSettings(0.9, "phrases", 100)
    assert loaded.meaning_speed == 1.0 and loaded.end_cue_speed == 1.0


# --------------------------------------------------------------------------- engines


def test_recording_engine_is_not_built_yet():
    with pytest.raises(EngineError, match="'vi' is recorded"):
        create_engine("vi", {"engine": "recording"})


def test_unknown_engine():
    with pytest.raises(EngineError, match="unknown engine 'magic'"):
        create_engine("xx", {"engine": "magic"})


# --------------------------------------------------------------------------- rendering


def seconds(audio: np.ndarray, engine: FakeEngine) -> float:
    return len(audio) / engine.sample_rate


def test_whole_sentence_is_trimmed_and_uses_the_speed():
    engine = FakeEngine()
    sentence = {"id": "s01", "target": "one two three four", "meaning": "x"}
    audio = render_target(engine, sentence, 0.9, "whole", 400)
    assert engine.calls == [("one two three four", 0.9)]
    # 200 ms tone + 40 ms kept at each edge, not the 600 ms the engine made
    assert seconds(audio, engine) == pytest.approx(0.2 + 0.08, abs=0.01)


def test_phrases_are_made_one_by_one_and_joined_with_a_pause():
    engine = FakeEngine()
    sentence = {"id": "s01", "target": "one two three four", "meaning": "x", "phrases": ["one two", "three four"]}
    audio = render_target(engine, sentence, 0.87, "phrases", 100)
    assert engine.calls == [("one two", 0.87), ("three four", 0.87)]
    assert seconds(audio, engine) == pytest.approx(2 * (0.1 + 0.08) + 0.1, abs=0.01)


# --------------------------------------------------------------------------- sweep and build


def test_sweep_makes_speeds_phrase_versions_and_a_review_sheet(lesson_root, tmp_path):
    loaded = load_lesson(lesson_root, KEY)
    target, meaning = FakeEngine("t"), FakeEngine("m")
    out = sweep_lesson(loaded, target, meaning, [0.8, 1.0], tmp_path / "out")
    assert out == tmp_path / "out" / "fr-en" / "lesson-02"
    names = {p.name for p in out.glob("*.wav")}
    assert {"s01_target_0.80.wav", "s01_target_1.00.wav", "s01_target_0.80_ph.wav", "s01_meaning.wav"} <= names
    assert "s02_target_0.80_ph.wav" not in names  # s02 has no phrases
    assert len(names) == 5 * 2 + 2 * 2 + 5  # whole versions, phrase versions (s01, s03), meanings
    sheet = (out / "review.md").read_text(encoding="utf-8")
    assert "Voice: `t` (France French)" in sheet and "natural French" in sheet and "(vous register)" in sheet
    assert "## s02: Bien sûr. Autre chose ?" in sheet and "Meaning: Of course. Anything else?" in sheet
    assert ("Je peux payer par carte ?", 1.0) not in meaning.calls  # meanings are spoken, not targets
    assert ("Of course. Anything else?", 1.0) in meaning.calls


@needs_ffmpeg
def test_build_writes_clips_manifest_and_a_shared_cue(lesson_root, tmp_path):
    loaded = load_lesson(lesson_root, KEY)
    target, meaning = FakeEngine("t"), FakeEngine("m")
    out_root = tmp_path / "build"
    out = build_lesson(loaded, target, meaning, out_root)

    assert out == out_root / "fr-en" / "lesson-02"
    assert sorted(p.name for p in out.iterdir()) == sorted(
        ["manifest.json"] + [f"s0{i}_{role}.m4a" for i in range(1, 6) for role in ("target", "meaning")])
    assert (out_root / cue_file("en")).is_file() and cue_file("en") == "cues/en.m4a"

    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["schema_version"] == 1
    assert (manifest["lesson"], manifest["pair"], manifest["target_lang"], manifest["meaning_lang"]) == ("lesson-02", "fr-en", "fr", "en")
    assert (manifest["target_voice"], manifest["meaning_voice"]) == ("t", "m")
    assert manifest["speakers"] == {"a": "Customer", "b": "Waiter"}
    assert manifest["end_cue"]["text"] == "The lesson is finished."
    assert manifest["end_cue"]["file"] == "cues/en.m4a" and manifest["end_cue"]["seconds"] > 0

    first = manifest["items"][0]
    assert first["id"] == "s01" and first["speaker"] == "a"
    assert (first["target"], first["meaning"]) == ("Bonjour, je voudrais un café.", "Hello, I would like a coffee.")
    assert (first["speed"], first["mode"]) == (0.87, "phrases")
    assert (first["target_file"], first["meaning_file"]) == ("s01_target.m4a", "s01_meaning.m4a")
    assert first["target_seconds"] > 0 and first["meaning_seconds"] > 0
    assert [i["id"] for i in manifest["items"]] == ["s01", "s02", "s03", "s04", "s05"]

    # settings reached the engines: tuned speeds for the target, meaning speed for the rest
    assert ("Bonjour,", 0.87) in target.calls and ("Voilà. Ça fait trois euros.", 0.9) in target.calls
    assert ("Hello, I would like a coffee.", 1.0) in meaning.calls
    assert ("The lesson is finished.", 1.0) in meaning.calls


@needs_ffmpeg
def test_two_lessons_share_one_cue_file(lesson_root, tmp_path):
    other = lesson(id="lesson-03")
    write(lesson_root, "lessons/fr-en/lesson-03.json", other)
    out_root = tmp_path / "build"
    for key in (KEY, "fr-en/lesson-03"):
        build_lesson(load_lesson(lesson_root, key), FakeEngine(), FakeEngine(), out_root)
    assert sorted(p.name for p in (out_root / "cues").iterdir()) == ["en.m4a"]
    assert (out_root / "fr-en" / "lesson-03" / "manifest.json").is_file()


@needs_ffmpeg
def test_monologue_manifest_has_no_speakers(lesson_root, tmp_path):
    doc = lesson()
    del doc["speakers"]
    for s in doc["sentences"]:
        del s["speaker"]
    write(lesson_root, LESSON, doc)
    out = build_lesson(load_lesson(lesson_root, KEY), FakeEngine(), FakeEngine(), tmp_path / "build")
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert "speakers" not in manifest and all("speaker" not in i for i in manifest["items"])


# --------------------------------------------------------------------------- index


@needs_ffmpeg
def test_index_lists_every_built_lesson_and_the_cue(lesson_root, tmp_path):
    write(lesson_root, "lessons/fr-en/lesson-03.json", lesson(id="lesson-03", title="Another"))
    out_root = tmp_path / "build"
    for key in ("fr-en/lesson-03", KEY):  # built in the "wrong" order on purpose
        build_lesson(load_lesson(lesson_root, key), FakeEngine(), FakeEngine(), out_root)

    path = write_index(lesson_root, out_root)
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert path == out_root / "index.json" and doc["schema_version"] == 1
    assert [e["lesson"] for e in doc["lessons"]] == ["lesson-02", "lesson-03"]
    first = doc["lessons"][0]
    assert (first["pair"], first["title"], first["sentences"]) == ("fr-en", "Order a coffee", 5)
    assert first["manifest"] == "fr-en/lesson-02/manifest.json"
    manifest = json.loads((out_root / first["manifest"]).read_text(encoding="utf-8"))
    assert first["seconds"] == pytest.approx(sum(i["target_seconds"] + i["meaning_seconds"] for i in manifest["items"]), abs=0.01)
    assert doc["cues"] == {"en": manifest["end_cue"]}


def test_index_of_an_empty_build_folder(root, tmp_path):
    (tmp_path / "build").mkdir()
    assert make_index(root, tmp_path / "build") == {"schema_version": 1, "cues": {}, "lessons": []}


def test_index_names_a_broken_manifest(root, tmp_path):
    write(tmp_path, "build/fr-en/lesson-02/manifest.json", {"lesson": "lesson-02"})
    write(tmp_path, "build/fr-en/lesson-03/manifest.json", "{ not json")
    with pytest.raises(IndexBuildError) as e:
        make_index(root, tmp_path / "build")
    assert "fr-en/lesson-02/manifest.json: " in str(e.value) and "fr-en/lesson-03/manifest.json: not valid JSON" in str(e.value)


def test_index_refuses_a_manifest_in_the_wrong_folder(root, tmp_path):
    from helpers import EXAMPLES
    write(tmp_path, "build/fr-en/lesson-09/manifest.json", load(EXAMPLES / "manifest-example.json"))
    with pytest.raises(IndexBuildError, match="not its folder"):
        make_index(root, tmp_path / "build")


@needs_ffmpeg
def test_cli_build_writes_the_index(monkeypatch, lesson_root, tmp_path, capsys):
    monkeypatch.setattr(pipeline, "load_engines", lambda lesson: (FakeEngine("t"), FakeEngine("m")))
    run_cli(monkeypatch, "build", KEY, "--content-dir", str(lesson_root), "--out", str(tmp_path / "build"))
    assert (tmp_path / "build" / "index.json").is_file()
    assert "index.json" in capsys.readouterr().out


# --------------------------------------------------------------------------- build check


@pytest.fixture
def built(lesson_root, tmp_path):
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        pytest.skip("ffmpeg is not installed")
    out_root = tmp_path / "build"
    out = build_lesson(load_lesson(lesson_root, KEY), FakeEngine(), FakeEngine(), out_root)
    return out_root, out / "manifest.json"


def test_a_good_build_passes_the_check(built):
    check_lesson_build(*built)


def test_missing_files_are_named(built):
    out_root, manifest = built
    (manifest.parent / "s02_meaning.m4a").unlink()
    (out_root / "cues" / "en.m4a").unlink()
    with pytest.raises(BuildCheckError) as e:
        check_lesson_build(out_root, manifest)
    assert "fr-en/lesson-02/s02_meaning.m4a: file is missing" in str(e.value)
    assert "cues/en.m4a: file is missing" in str(e.value)


def test_empty_and_unreadable_clips_are_named(built):
    out_root, manifest = built
    (manifest.parent / "s01_target.m4a").write_bytes(b"")
    (manifest.parent / "s03_target.m4a").write_bytes(b"not audio")
    with pytest.raises(BuildCheckError) as e:
        check_lesson_build(out_root, manifest)
    assert "s01_target.m4a: file is empty" in str(e.value)
    assert "s03_target.m4a: ffprobe cannot read" in str(e.value)


def test_a_clip_that_differs_from_the_manifest_is_named(built):
    out_root, manifest = built
    doc = json.loads(manifest.read_text(encoding="utf-8"))
    doc["items"][0]["target_seconds"] += 0.5
    manifest.write_text(json.dumps(doc), encoding="utf-8")
    with pytest.raises(BuildCheckError, match=r"s01_target.m4a: is \d+\.\d+s long but the manifest says"):
        check_lesson_build(out_root, manifest)


def test_a_too_short_clip_is_named(built, monkeypatch):
    import buildcheck
    out_root, manifest = built
    monkeypatch.setattr(buildcheck, "probe_seconds", lambda path: 0.2)
    with pytest.raises(BuildCheckError, match="only 0.20s long"):
        check_lesson_build(out_root, manifest)


@needs_ffmpeg
def test_cli_build_fails_and_writes_no_index_for_a_bad_build(monkeypatch, lesson_root, tmp_path):
    import buildcheck
    monkeypatch.setattr(pipeline, "load_engines", lambda lesson: (FakeEngine("t"), FakeEngine("m")))
    monkeypatch.setattr(buildcheck, "probe_seconds", lambda path: 0.2)
    with pytest.raises(SystemExit) as e:
        run_cli(monkeypatch, "build", KEY, "--content-dir", str(lesson_root), "--out", str(tmp_path / "build"))
    assert "not good" in str(e.value)
    assert not (tmp_path / "build" / "index.json").exists()


# --------------------------------------------------------------------------- command line


def run_cli(monkeypatch, *args):
    monkeypatch.setattr(sys, "argv", ["pipeline.py", *args])
    pipeline.main()


def test_cli_needs_a_lesson_for_build(monkeypatch, capsys):
    with pytest.raises(SystemExit) as e:
        run_cli(monkeypatch, "build")
    assert e.value.code == 2
    assert "lesson" in capsys.readouterr().err


def test_cli_explains_a_bad_lesson_name(monkeypatch, root):
    with pytest.raises(SystemExit) as e:
        run_cli(monkeypatch, "build", "lesson-01", "--content-dir", str(root))
    assert "write it like fr-en/lesson-01" in str(e.value)


def test_cli_explains_a_recorded_language(monkeypatch, root):
    write(root, "lessons/vi-en/lesson-02.json", lesson(target_lang="vi", meaning_lang="en"))
    with pytest.raises(SystemExit) as e:
        run_cli(monkeypatch, "sweep", "vi-en/lesson-02", "--content-dir", str(root))
    assert "'vi' is recorded" in str(e.value)
