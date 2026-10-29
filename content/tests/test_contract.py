import sys
from pathlib import Path

import pytest

import pipeline
from contract import validate_content
from helpers import CONTENT, LESSON, TUNING, lesson, load, tuning, write


def run(root: Path, lesson_doc=None, tuning_doc=None):
    write(root, LESSON, lesson() if lesson_doc is None else lesson_doc)
    if tuning_doc is not False:
        write(root, TUNING, tuning() if tuning_doc is None else tuning_doc)
    return validate_content(root)


def assert_error(report, *words):
    assert any(all(w in e for w in words) for e in report.errors), report.errors


def assert_warning(report, *words):
    assert any(all(w in e for w in words) for e in report.warnings), report.warnings


# --------------------------------------------------------------------------- valid content


def test_real_content_is_valid():
    report = validate_content(CONTENT)
    assert report.errors == []


def test_examples_are_valid(root):
    report = run(root)
    assert report.errors == []
    assert report.warnings == []
    assert report.checked == [LESSON]


def test_lesson_without_tuning_file_is_valid(root):
    assert run(root, tuning_doc=False).errors == []


def test_monologue_without_speakers_is_valid(root):
    doc = lesson()
    del doc["speakers"]
    for s in doc["sentences"]:
        del s["speaker"]
    assert run(root, doc).errors == []


# --------------------------------------------------------------------------- lesson file


def test_invalid_json_names_file_and_line(root):
    report = run(root, '{"schema_version": 1,\n  oops}')
    assert_error(report, LESSON, "not valid JSON", "line 2")


def test_schema_error_names_the_place(root):
    doc = lesson()
    doc["sentences"][2]["speaker"] = "c"
    report = run(root, doc)
    assert_error(report, LESSON, "sentences[2].speaker", "'c' is not one of")


def test_old_field_names_are_rejected(root):
    doc = lesson()
    doc["sentences"][0]["fr"] = "Bonjour"
    assert_error(run(root, doc), "sentences[0]", "'fr' was unexpected")


def test_rules_are_skipped_when_schema_fails(root):
    doc = lesson()
    del doc["title"]
    doc["sentences"][0]["phrases"] = ["x", "y"]  # would break a rule, but the schema error comes first
    report = run(root, doc)
    assert len(report.errors) == 1
    assert_error(report, "title")


def test_folder_must_match_the_language_pair(root):
    write(root, "lessons/en-fr/lesson-02.json", lesson())
    report = validate_content(root)
    assert_error(report, "lessons/en-fr/lesson-02.json", "folder is 'en-fr'", "'fr-en'")


def test_file_name_must_match_the_id(root):
    write(root, "lessons/fr-en/lesson-07.json", lesson())
    assert_error(validate_content(root), "lesson-07.json", "does not match the lesson id 'lesson-02'")


def test_same_language_twice(root):
    assert_error(run(root, lesson(meaning_lang="fr")), "both 'fr'")


def test_unknown_language(root):
    doc = lesson(target_lang="sv")
    assert_error(run(root, doc), "target_lang 'sv' is not in languages.json")


def test_meaning_language_needs_an_end_cue(root):
    # French has no end_cue, so a lesson that explains in French is not allowed yet
    write(root, "lessons/en-fr/lesson-02.json", lesson(target_lang="en", meaning_lang="fr"))
    assert_error(validate_content(root), "meaning language 'fr' has no end_cue")


def test_duplicate_sentence_ids(root):
    doc = lesson()
    doc["sentences"][1]["id"] = "s01"
    assert_error(run(root, doc), "s01", "more than once")


def test_phrases_must_add_up_to_target(root):
    doc = lesson()
    doc["sentences"][0]["phrases"] = ["Bonjour,", "je voudrais un thé."]
    assert_error(run(root, doc), "s01", "phrases do not add up")


def test_phrases_ignore_spaces(root):
    doc = lesson()
    doc["sentences"][0]["phrases"] = ["Bonjour, je", "voudrais un café."]
    assert run(root, doc).errors == []


def test_speakers_without_speaker_on_every_sentence(root):
    doc = lesson()
    del doc["sentences"][1]["speaker"]
    del doc["sentences"][3]["speaker"]
    assert_error(run(root, doc), "every sentence needs a speaker", "s02, s04")


def test_speaker_without_speakers(root):
    doc = lesson()
    del doc["speakers"]
    assert_error(run(root, doc), "no speakers")


# --------------------------------------------------------------------------- tuning file


def test_tuning_without_lesson_file(root):
    write(root, TUNING, tuning())
    assert_error(validate_content(root), TUNING, "no lesson file lesson-02.json")


def test_tuning_schema_error(root):
    doc = tuning()
    doc["sentences"]["s01"]["speed"] = 3
    assert_error(run(root, tuning_doc=doc), TUNING, "sentences.s01.speed", "maximum")


def test_tuning_for_another_lesson(root):
    assert_error(run(root, tuning_doc=tuning(lesson="lesson-09")), "lesson is 'lesson-09'")


def test_tuning_mentions_unknown_sentence(root):
    doc = tuning()
    doc["sentences"]["s09"] = {"speed": 0.9}
    assert_error(run(root, tuning_doc=doc), "s09", "no such sentence")


def test_phrases_mode_needs_phrases(root):
    doc = tuning()
    doc["sentences"]["s02"] = {"mode": "phrases"}  # s02 has no phrases in the lesson file
    assert_error(run(root, tuning_doc=doc), "s02", "defines no phrases")


def test_tuning_of_a_broken_lesson_adds_no_noise(root):
    doc = lesson()
    del doc["title"]
    report = run(root, doc)
    assert len(report.errors) == 1


def test_recorded_meaning_ignores_meaning_speed(root):
    write(root, "lessons/en-vi/lesson-02.json", lesson(target_lang="en", meaning_lang="vi"))
    write(root, "lessons/en-vi/lesson-02.tuning.json", tuning(meaning_speed=0.9))
    report = validate_content(root)
    assert report.errors == []
    assert_warning(report, "meaning_speed is ignored", "vi is recorded")


def test_recorded_target_ignores_speed_and_mode(root):
    write(root, "lessons/vi-en/lesson-02.json", lesson(target_lang="vi", meaning_lang="en"))
    write(root, "lessons/vi-en/lesson-02.tuning.json", tuning())
    report = validate_content(root)
    assert report.errors == []
    assert_warning(report, "default_speed is ignored")
    assert_warning(report, "s01", "mode is ignored")
    assert_warning(report, "s03", "speed is ignored")


# --------------------------------------------------------------------------- languages and prompt


def test_languages_kokoro_needs_a_voice(root):
    doc = load(root / "languages.json")
    del doc["languages"]["fr"]["voice"]
    write(root, "languages.json", doc)
    assert_error(validate_content(root), "languages.json", "languages.fr", "'voice' is a required property")


def test_languages_recording_has_no_voice(root):
    doc = load(root / "languages.json")
    doc["languages"]["vi"]["voice"] = "x"
    write(root, "languages.json", doc)
    assert_error(validate_content(root), "languages.json", "languages.vi")


def test_broken_languages_file_does_not_flood_lesson_errors(root):
    write(root, "languages.json", {"schema_version": 1})
    report = run(root)
    assert_error(report, "languages.json", "'languages' is a required property")
    assert not any("is not in languages.json" in e for e in report.errors)


def test_prompt_with_old_schema_copy(root):
    schema_path = root / "schema" / "lesson.schema.json"
    schema = load(schema_path)
    schema["properties"]["title"]["maxLength"] = 99
    write(root, "schema/lesson.schema.json", schema)
    assert_error(validate_content(root), "prompts/generate-lesson.md", "differs from schema/lesson.schema.json")


def test_prompt_with_invalid_example(root):
    path = root / "prompts" / "generate-lesson.md"
    path.write_text(path.read_text(encoding="utf-8").replace('"title": "Order a coffee"', '"title": ""'), encoding="utf-8")
    assert_error(validate_content(root), "prompts/generate-lesson.md (example)", "title")


def test_missing_schema_file_is_reported(root):
    (root / "schema" / "tuning.schema.json").unlink()
    assert_error(validate_content(root), "schema/tuning.schema.json", "file not found")


# --------------------------------------------------------------------------- command


def test_command_exit_code_and_output(root, capsys, monkeypatch):
    run(root)
    monkeypatch.setattr(sys, "argv", ["pipeline.py", "validate", "--content-dir", str(root)])
    pipeline.main()
    assert "1 lesson file(s) checked: 0 error(s), 0 warning(s)" in capsys.readouterr().out

    write(root, LESSON, lesson(meaning_lang="fr"))
    with pytest.raises(SystemExit) as exit_info:
        pipeline.main()
    assert exit_info.value.code == 1
    assert "error:" in capsys.readouterr().out
