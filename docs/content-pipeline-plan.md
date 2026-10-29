# Content Pipeline Plan: multi-language lessons (feature 1)

Status as of 2026-10-28: **plan written, waiting for the user's review.** Nothing in this plan is built yet. Items are marked **Decided**, **Proposed** (suggested, not yet confirmed) or **Open**.

Related: `docs/app-spec.md` (app scope), `docs/content-decision.md` (current French content and audio decisions), `docs/prototype-plan.md` (the concluded prototype), `content/README.md` (how the generator runs today).

## 1. Goal

Today the app has one lesson, French with English meanings, and everything is built around it (field names `fr` and `en`, a French-only generator, a hard-coded lesson path in the app). This feature makes the content pipeline work for any language pair, with lessons written by AI, approved by the user, tuned by ear and then built and deployed.

Language pairs planned: `fr-en` (exists), `en-vi` (English voice from Kokoro, Vietnamese meanings recorded by the user), `sv-en` (Swedish needs a new TTS engine).

## 2. The pipeline

1. **Generate.** The user chats with an AI and pastes in the fixed prompt (`content/prompts/generate-lesson.md`). The AI answers with a lesson JSON that follows the schema.
2. **Approve.** The user reads the text, and a native speaker should check the target language. The file is saved as `content/lessons/<pair>/<lesson-id>.json` and then treated as locked.
3. **Validate.** `validate` checks every lesson against the schema and the extra rules (see section 5). It must pass before any audio is made.
4. **Sweep.** `sweep` makes each sentence at several speeds, plus phrase-by-phrase versions where defined.
5. **Tune.** The user listens and writes the chosen speed, mode, phrase split and pauses in `<lesson-id>.tuning.json`.
6. **Build.** `build` makes the final audio, a `manifest.json` per lesson and the `index.json` for all lessons.
7. **Sync and deploy.** `sync-content` copies the build into the app. After the user merges to `main`, the existing GitHub Actions workflow deploys.

## 3. Decisions made on 2026-10-28

| Topic | Decision | Status |
|---|---|---|
| Language pair direction | The first language is the one being learned, the second is the explanation language. Pair ids are `<target>-<meaning>`: `fr-en`, `en-vi`, `sv-en`. | **Decided** |
| Voice engines | One engine per language. Kokoro stays for French and English. Swedish needs a TTS engine, researched and tested later. | **Decided** |
| Recording engine | "Recording" (the user's own voice) is one of the engines. Vietnamese will use it. Any language in `languages.json` may choose it, as target or as meaning. | **Decided** (2026-10-28) |
| Recording flow | A guided command: it shows each sentence in turn, records from the mic, lets the user replay and redo, and saves under the right name. It lists missing and outdated clips. | **Decided** |
| Recording storage | Raw recordings are git-ignored and local only. Only the final built m4a files are committed. | **Decided** |
| Recorded languages and phrase mode | Whole-sentence clips only. Phrase mode for recorded languages is decided if a `vi-en` pair ever appears. | **Decided** |
| Lesson files | Two files per lesson. `<lesson-id>.json` holds the AI-written text and is locked after approval. `<lesson-id>.tuning.json` holds the user's audio choices. The AI can never overwrite the tuning. | **Decided** |
| App scope | The app reads a generated `index.json` and loads a chosen lesson with the new field names. A simple picker only, no new screens. | **Decided** |
| AI contract | A JSON Schema plus a fixed prompt template, both kept in the repo. | **Decided** |
| Conversation lessons | A lesson is one connected conversation: each sentence answers or continues the previous one. The learner still repeats every line, including the other person's. Each sentence may have a `speaker` (`a` or `b`) and the lesson names the two roles in `speakers`; give both or neither (a monologue like lesson 1 has neither). | **Decided** (2026-10-29) |
| End cue | The "lesson is finished" sentence is not part of a lesson. Each language that can be a meaning language has one `end_cue` text in `languages.json`, used by all lessons that explain in that language. The AI is told not to write one. | **Decided** (2026-10-29) |
| Field names | Neutral names (`target`, `meaning`) replace `fr` and `en`. | **Proposed** |
| Schema version | A `schema_version` field in every file, so scripts and the app refuse files they do not understand. | **Proposed** |

### Why this shape

- **Every language needs a voice in both roles.** In `en-vi` the meanings are spoken in Vietnamese, so Vietnamese needs a voice although the user is not learning it. English is a target in `en-vi` and a meaning in `fr-en` and `sv-en`.
- **Kokoro cannot cover everything.** As far as known (to be checked in task 9), Kokoro supports English, French, Spanish, Italian, Portuguese, Hindi, Japanese and Chinese, but not Swedish or Vietnamese. So the generator cannot stay Kokoro-only. It needs an engine layer.
- **Recording covers Vietnamese.** The user speaks Vietnamese, and a real voice is better than a synthetic one for the meanings in `en-vi`. This leaves Swedish as the only language that needs a new TTS engine.
- **A recording engine differs from a TTS engine.** It has a fixed speed, so `speed` and `mode` in the tuning file do not apply to it. It still goes through the same trim, loudness (-16 LUFS), peak limit and AAC encoding, so all clips sound consistent. Re-recording one sentence must be easy, so the pipeline reports which clips are missing or out of date.
- **Text and tuning change at different times and by different people.** The AI writes text once, the user tunes audio many times. Separate files stop a redraw of the text from wiping out the tuned speeds.

## 4. Folder layout (Proposed)

```
content/
  schema/
    lesson.schema.json          contract for the text file
    tuning.schema.json          contract for the tuning file
  prompts/generate-lesson.md    the fixed prompt for the AI
  languages.json                per language: code, engine, voice, default speed, notes
  lessons/
    fr-en/lesson-01.json
    fr-en/lesson-01.tuning.json
    en-vi/...                   later
    sv-en/...                   later
  scripts/                      generator (engine layer, validate, sweep, build)
  recordings/<pair>/<lesson-id>/  raw recordings by the user (git-ignored), one file per sentence and role
  out/                          sweep output (git-ignored)
  build/
    index.json                  generated list of all built lessons
    fr-en/lesson-01/            m4a files + manifest.json
```

## 5. File formats (Proposed)

### Lesson text file (written by the AI)

```json
{
  "schema_version": 1,
  "id": "lesson-02",
  "target_lang": "fr",
  "meaning_lang": "en",
  "title": "Order a coffee",
  "persona": "Marc",
  "register": "vous",
  "accent": "France French",
  "speakers": { "a": "Customer", "b": "Waiter" },
  "sentences": [
    {
      "id": "s01",
      "speaker": "a",
      "target": "Bonjour, je voudrais un café.",
      "meaning": "Hello, I would like a coffee.",
      "phrases": ["Bonjour,", "je voudrais un café."]
    },
    {
      "id": "s02",
      "speaker": "b",
      "target": "Bien sûr. Autre chose ?",
      "meaning": "Of course. Anything else?"
    }
  ]
}
```

(Shortened; the full example is `content/schema/examples/lesson-example.json`.)

- The sentences are one conversation in playing order. The learner repeats every one of them.
- `speakers` (the two roles, written in the meaning language) and `speaker` on each sentence are optional, but all or nothing. `a` is the learner's side and is the persona. Validation of "all or nothing" is done by `validate` (task 3), because the schema alone cannot express it.
- `phrases` is an optional suggestion from the AI where a natural pause exists. Joined, the pieces must equal `target`, ignoring spaces.
- `persona`, `register` and `accent` are optional and depend on the language (`register` makes sense for French, less so for English).
- The file holds no audio settings and no end cue.

### Tuning file (written by the user)

```json
{
  "schema_version": 1,
  "lesson": "lesson-02",
  "default_speed": 0.9,
  "meaning_speed": 1.0,
  "phrase_pause_ms": 400,
  "sentences": {
    "s01": { "speed": 0.87, "mode": "phrases", "phrase_pause_ms": 100 }
  }
}
```

A sentence without an entry uses the lesson defaults. `speed` and `mode` are ignored for a language whose engine is "recording" (`validate` warns if they are set).

### Recordings (Proposed)

- Raw files are named by sentence id and role, for example `s01_meaning.wav`.
- Next to the files, a small `recordings.json` stores the exact text that was read for each clip. If the approved text later differs, the clip is reported as outdated and the guided command offers to redo it. This is why the raw folder must stay together with its metadata.

### Language settings (`languages.json`)

Per language code: display name, engine (`kokoro`, `recording`, or a later TTS engine), voice, Kokoro language code (or the equivalent for other engines), default speed. A recording language has no voice or speed. Settings such as "vous" belong to the lesson, not here.

A language that can be a meaning language also has `end_cue`: the text of the "lesson is finished" sentence in that language (today `en` and `vi`). `validate` requires it for every meaning language used by a lesson. The cue is spoken at the language's default speed (the tuning file belongs to one lesson, so it cannot set it). For a recording language, the user records the cue once.

### Index (`build/index.json`, generated)

Lists every built pair and lesson: pair, lesson id, title, number of sentences, total duration, and the path to its `manifest.json`. The app reads only this file to find out what exists.

### Manifest (per lesson, generated)

Same content as today with neutral names: `target`, `meaning`, `target_file`, `meaning_file`, `target_seconds`, `meaning_seconds`, plus `target_lang`, `meaning_lang`, the voices used, and the optional `speaker` of each sentence. The end cue is built once per meaning language (not once per lesson) and each lesson's manifest points to it.

## 6. Tasks

Each task is done in its own branch, as in `AGENTS.md`. Each has a "done when" line.

### Task 1: this plan

Write this document and have it reviewed.
Done when: the user approves it, or the requested changes are in.

### Task 2: contract (schema, languages, prompt)

- Write `lesson.schema.json`, `tuning.schema.json` and `languages.json`.
- Write `prompts/generate-lesson.md`. It states the sentence rules from `docs/content-decision.md` (3 to 5 words for a beginner, natural spoken language), the conversation rules (each sentence follows from the previous one, two speakers, no closing sentence), the output format, and the schema. It has fill-in parts for pair, situation, speakers, persona, level and number of sentences.

Done when: a sample AI answer can be checked against the schema by a tool, and the prompt contains everything an AI needs to produce a valid file with no other context.

### Task 3: `validate` command

Add `validate` to the generator. It checks the schema, unique sentence ids, that `phrases` join back to `target`, that the tuning file only mentions existing sentence ids, that the languages exist in `languages.json` and differ from each other, that `speakers` and `speaker` are given together (all sentences or none), and that the meaning language has an `end_cue`. It also checks that the schema copy inside the prompt equals `lesson.schema.json`. Error messages name the file and the sentence.
Done when: valid files pass, and each kind of mistake is caught with a clear message (covered by tests).

**Where it lives.** The checks are in `content/scripts/contract.py` (no audio code, so it is fast and testable), and `validate` in `generate_kokoro.py` calls it. `languages.json` also got a schema, `schema/languages.schema.json`. Tests are in `content/tests/` (run `uv run pytest` in `content/`). Warnings (a speed or mode set for a recorded language) do not fail the command; errors exit with 1. When a file fails its schema, only the schema errors are listed for it, and the other rules run after they are fixed. The old `lessons/lesson-01.json` is not checked until task 4 migrates it.

**CI (added 2026-10-29).** `.github/workflows/content.yml` runs the tests and `validate` on every pull request and on pushes to `main` that touch `content/`. It installs only the `dev` dependency group; `kokoro` and `soundfile` moved to an `audio` group (installed by default locally), so CI does not download PyTorch. The workflow pins `astral-sh/setup-uv@v10.3.3` exactly, because that project has no floating major tag.

### Task 4: migrate lesson 1 and the generator

- Split `lesson-01.json` into the text file and the tuning file under `lessons/fr-en/`, with the new field names. Tuned values stay the same. Lesson 1 is a monologue, so it has no `speakers`. Its "lesson is finished" cue moves to `languages.json`.
- Add the engine layer to the generator. Kokoro is the first engine and reads voices from `languages.json`.
- Rename manifest fields, and build the end cue once per meaning language.
- **The audio must not change.** Rebuild `fr-en/lesson-01` and compare the durations and loudness with the current build, before and after.

Done when: the rebuilt lesson 1 matches the current build, within the encoder's normal variation.

**Decisions on 2026-10-29.** The committed `content/build/lesson-01/` is **not** touched in this task, because the deployed app reads its old manifest format; the new layout is committed together with `sync-content` and the app (tasks 5 and 6). The script is renamed `pipeline.py`. `sweep` and `build` take the lesson as `fr-en/lesson-01`, take voices from `languages.json`, and run the same checks as `validate` first.

**Result (2026-10-29).** Code is split into `pipeline.py` (command line), `contract.py` (checks), `lesson.py` (loading and settings), `engines.py` (Kokoro engine; recording raises a clear message), `render.py` (sweep and build) and `audio.py` (trim, loudness, encoding). `soundfile` moved to the main dependencies so the tests can write audio without Kokoro. Lesson 1 was migrated by a script that checked every sentence, speed, mode and pause against the old file. New output: `build/<pair>/<lesson>/sNN_target.m4a`, `sNN_meaning.m4a`, `manifest.json` with the neutral field names and `schema_version`, and the end cue in `build/cues/<lang>.m4a`; the manifest's `end_cue.file` is relative to the build folder. The title became "Introduce yourself" with the persona "Marc" in its own field.

**How "the audio must not change" was checked.** Kokoro is not repeatable: two runs of the old code on the same machine differ in the samples (differences up to 1.1 in amplitude), because its voice generator uses random noise. So files cannot be compared by hash. Instead: duration, integrated loudness, peak and the correlation of the loudness over time (20 ms windows). Between two runs of the old code the worst case was 0.006 s, 0.10 LU, 0.3 dB and a correlation of 0.988. The new pipeline against the committed build: 0.004 s, 0.10 LU, 0.2 dB, correlation 0.998, for all 17 clips. That is within the noise, so the audio is unchanged. The comparison script was a throwaway in the scratchpad; the idea is kept in `content/README.md`.

### Task 5: index and `sync-content`

- `build` writes `build/index.json`.
- `sync-content` copies per pair and fails with a clear message if the index or a listed file is missing.
- Move the committed build to the new layout (`build/<pair>/<lesson>/`, `build/cues/`), update `.gitignore` for it, and update the error message in `app/scripts/sync-content.mjs`, which still names the old script.
- After `build`, a check that every file in the manifest exists, no clip is empty and durations are plausible.

Done when: a clean build and sync produces a working `public/lessons` folder, and a missing file is reported by name.

### Task 6: app reads the index

- Update the manifest parser and its tests for the new field names.
- Load `index.json`, show a simple pair and lesson picker, load the chosen lesson, and replace the hard-coded `lesson-01` path.
- Update the app's `french` naming to neutral naming in code and on screen.

Done when: lint, format check and tests pass; lesson 1 plays from the picker on the phone through the tunnel as before; the deployed app still works after the merge.

### Task 7: trial run with a new AI lesson

Generate a real second lesson with the prompt, check it with `validate`, sweep, tune, build, and play it in the app. This tests the prompt and schema in practice. Fix whatever it shows.

Done when: a new `fr-en` lesson went from prompt to the deployed app without hand-editing the pipeline.

### Task 8: recording engine

- Add the "recording" engine to the engine layer.
- Add a guided `record` command. It reads the lesson, shows each sentence of a recorded language in turn, records from the mic, plays it back, and allows redo, skip and quit. It saves the raw file and updates `recordings.json`.
- `build` takes the raw files through the normal clean-up (trim, loudness, limiter, AAC). It stops with a list of missing or outdated clips instead of building a partial lesson.
- `validate` warns when tuning settings that do not apply (`speed`, `mode`) are set for a recorded language.
- Check which tool records from the mic on Ubuntu and add it to the setup notes. This is not decided yet.

Done when: a test lesson with recorded Vietnamese meanings goes through `record`, `build` and the app, the clip volume matches the TTS clips, and editing a sentence marks its recording as outdated.

### Task 9: Swedish engine (own feature)

Research which engines (for example Google Cloud TTS, Piper, Azure) support Swedish with quality good enough to learn from, check the licences, and add the best one to the engine layer. First confirm that Kokoro really lacks Swedish. Then produce one test lesson for `sv-en`.

Done when: `sv-en` has a lesson the user judged good enough by listening. Likely a separate plan.

## 7. Open points

- **Native review.** A reviewer is needed for French (still pending from the prototype) and for Swedish. For Vietnamese the user is the native speaker, but an AI-written Vietnamese text should still be read critically before recording.
- **Lost recordings.** Raw recordings are local only (decided). If the disk is lost, only the committed m4a files remain, and a rebuild with changed settings would need re-recording. A backup of `content/recordings/` outside git is up to the user.
- **Recording quality.** A room with background noise or an echo sounds different from the clean TTS clips. The loudness step fixes volume, not noise. Whether a noise-reduction step is needed is decided after the first test recordings.
- **Phrase mode and non-French languages.** The phrase-split idea was tested only with French. Whether it works the same for Swedish is unknown. Recorded languages are whole-sentence only.
- **Speeds are per engine and voice.** The 0.85 to 0.92 range was found for Kokoro's French voice. Another engine needs its own sweep and its own defaults in `languages.json`.
- **Schema changes later.** `schema_version` is in from the start. The migration approach for old lessons is not decided and is not needed until the first schema change.
- **Voices for the two speakers.** In a conversation, both speakers use the same voice for now (Kokoro has only one French voice). The `speaker` field is recorded so that a second voice, or showing who speaks, can be added later without changing the lesson files.
- **Vietnamese end cue.** `languages.json` has the text "Bài học đã kết thúc." as a proposal; the user, as the Vietnamese speaker, confirms or changes the wording before recording it. French has no `end_cue` yet, because it is not planned as a meaning language.
- **Where the shared cue audio is stored.** One cue per meaning language, built once. The exact path in `build/` and how the app finds it (through `index.json` or each manifest) is decided in task 5.
