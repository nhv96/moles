"""The contract of the build output: manifest.json and index.json."""

import copy

import pytest

from contract import validate_build_doc
from helpers import EXAMPLES, load


def manifest():
    return copy.deepcopy(load(EXAMPLES / "manifest-example.json"))


def index():
    return copy.deepcopy(load(EXAMPLES / "index-example.json"))


def check(root, kind, doc):
    return validate_build_doc(root, kind, doc, f"build/{kind}.json")


def assert_error(report, *words):
    assert any(all(w in e for w in words) for e in report.errors), report.errors


def test_examples_are_valid(root):
    assert check(root, "manifest", manifest()).errors == []
    assert check(root, "index", index()).errors == []


def test_manifest_without_speakers_is_valid(root):
    doc = manifest()
    del doc["speakers"]
    for item in doc["items"]:
        del item["speaker"]
    assert check(root, "manifest", doc).errors == []


def test_old_manifest_format_is_rejected(root):
    old = {"lesson": "lesson-01", "title": "x", "items": [{"id": "s01", "fr": "a", "en": "b"}],
           "finished_cue": {"id": "end", "en": "x", "file": "end_en.m4a", "seconds": 1}}
    assert_error(check(root, "manifest", old), "schema_version")


@pytest.mark.parametrize("change, words", [
    (lambda d: d.update(schema_version=2), ("schema_version",)),
    (lambda d: d["items"].clear(), ("items",)),
    (lambda d: d["items"][0].update(target_seconds=0), ("items[0].target_seconds",)),
    (lambda d: d["items"][0].update(target_file="../s01.m4a"), ("items[0].target_file",)),
    (lambda d: d["items"][0].update(meaning_file="/abs/s01.m4a"), ("items[0].meaning_file",)),
    (lambda d: d["items"][0].update(mode="slow"), ("items[0].mode",)),
    (lambda d: d["end_cue"].update(file="cues/en.mp3"), ("end_cue.file",)),
    (lambda d: d.pop("end_cue"), ("end_cue",)),
])
def test_manifest_schema_errors(root, change, words):
    doc = manifest()
    change(doc)
    assert_error(check(root, "manifest", doc), *words)


def test_manifest_pair_must_match_languages(root):
    doc = manifest()
    doc["pair"] = "fr-vi"
    assert_error(check(root, "manifest", doc), "pair", "fr-vi")


def test_manifest_duplicate_item_id(root):
    doc = manifest()
    doc["items"][1]["id"] = "s01"
    assert_error(check(root, "manifest", doc), "s01", "more than once")


def test_manifest_speakers_all_or_none(root):
    doc = manifest()
    del doc["items"][1]["speaker"]
    assert_error(check(root, "manifest", doc), "speakers is set")
    doc = manifest()
    del doc["speakers"]
    assert_error(check(root, "manifest", doc), "no speakers")


@pytest.mark.parametrize("change, words", [
    (lambda d: d.pop("cues"), ("cues",)),
    (lambda d: d["lessons"][0].update(sentences=0), ("lessons[0].sentences",)),
    (lambda d: d["lessons"][0].update(manifest="/x/manifest.json"), ("lessons[0].manifest",)),
])
def test_index_schema_errors(root, change, words):
    doc = index()
    change(doc)
    assert_error(check(root, "index", doc), *words)


def test_index_manifest_path_must_follow_the_layout(root):
    doc = index()
    doc["lessons"][0]["manifest"] = "fr-en/lesson-09/manifest.json"
    assert_error(check(root, "index", doc), "fr-en/lesson-02", "manifest path")


def test_index_needs_the_cue_of_each_meaning_language(root):
    doc = index()
    doc["cues"] = {}
    assert_error(check(root, "index", doc), "fr-en/lesson-02", "end cue", "'en'")


def test_index_duplicate_and_order(root):
    doc = index()
    doc["lessons"].append(copy.deepcopy(doc["lessons"][0]))
    assert_error(check(root, "index", doc), "listed more than once")
    doc = index()
    other = copy.deepcopy(doc["lessons"][0])
    other["lesson"] = "lesson-01"
    other["manifest"] = "fr-en/lesson-01/manifest.json"
    doc["lessons"].append(other)
    assert_error(check(root, "index", doc), "not sorted")
