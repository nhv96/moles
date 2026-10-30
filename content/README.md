# content: lessons and audio

Lesson files, the checks on them, and the script that makes the lesson audio. The plan and the
reasons are in `../docs/content-pipeline-plan.md`.

## Folder layout

```
content/
  schema/                     the contract: JSON Schemas for the lesson, tuning, languages, manifest and index files
  prompts/generate-lesson.md  the fixed prompt for the AI that writes a lesson
  languages.json              per language: engine, voice, default speed, end cue
  lessons/<pair>/             <pair> is <learned>-<explanation>, for example fr-en
    lesson-01.json            the text, written by the AI, approved by you, then not changed
    lesson-01.tuning.json     your audio choices: speed, phrase split, pauses (optional)
  scripts/pipeline.py         the command line: validate, sweep, build
  tests/                      tests of the checks and of the build code
  out/<pair>/<lesson>/        sweep output (git-ignored): wav files + review.md
  build/index.json            list of every built lesson and end cue (committed, the app reads it)
  build/<pair>/<lesson>/      build output: m4a files + manifest.json (committed)
  build/cues/<lang>.m4a       the "lesson is finished" sentence, one per explanation language (committed)
```

The `build/` folder is committed, because the app is deployed from it. `app/scripts/sync-content.mjs`
copies it into the app. Until task 6 of the plan, the app still expects the old manifest format, so it
cannot play the new build.

## Setup (Ubuntu)

```bash
sudo apt install espeak-ng ffmpeg
cd content
uv sync --managed-python
```

## Workflow

A lesson is named by its pair and id, for example `fr-en/lesson-01`.

1. **Write the lesson.** Fill in the table at the top of `prompts/generate-lesson.md`, paste the prompt
   into a chat with the AI, and save its answer as `lessons/<pair>/<lesson-id>.json`. Have the text
   checked by a native speaker.

2. **Check it.** This makes no audio and takes a second:

   ```bash
   uv run scripts/pipeline.py validate
   ```

   It checks every file against the contract and prints each problem with the file and the sentence.
   It exits with 1 on an error; warnings (for example a speed set for a recorded language) do not fail
   it. `sweep` and `build` run the same checks and refuse a lesson with errors.

3. **Sweep.** Make every sentence at several speeds, plus phrase-by-phrase versions where the lesson
   defines `phrases`:

   ```bash
   uv run scripts/pipeline.py sweep fr-en/lesson-01                      # speeds 0.6 0.7 0.8 0.9 1.0
   uv run scripts/pipeline.py sweep fr-en/lesson-01 --speeds 0.8 0.9 1.0 # your own list
   ```

   Files: `s01_target_0.80.wav` (whole sentence), `s01_target_0.80_ph.wav` (phrase by phrase),
   `s01_meaning.wav`, and `review.md` to write your notes in.

4. **Tune.** Listen, then write your choices in `lessons/<pair>/<lesson-id>.tuning.json`:

   ```json
   {
     "schema_version": 1,
     "lesson": "lesson-01",
     "default_speed": 0.9,
     "meaning_speed": 1.0,
     "phrase_pause_ms": 400,
     "sentences": {
       "s01": { "speed": 0.87, "mode": "phrases", "phrase_pause_ms": 100 },
       "s02": { "speed": 0.9 }
     }
   }
   ```

   - `speed`: for that sentence. Without it, `default_speed` of the file applies, then the language's
     `default_speed` in `languages.json`.
   - `mode`: `"whole"` (default) or `"phrases"`. The pieces come from `phrases` in the lesson file;
     joined, they must equal `target` (`validate` checks this).
   - `phrase_pause_ms`: silence between the pieces, in milliseconds (100 if you set nothing). Tune it by ear.
   - `meaning_speed`: the speed of the explanation voice.

5. **Build** the final files with the chosen settings:

   ```bash
   uv run scripts/pipeline.py build fr-en/lesson-01
   ```

   It writes `s01_target.m4a`, `s01_meaning.m4a`, ..., `manifest.json`, and the end cue of the
   explanation language in `build/cues/`. Then it checks that every file of the manifest exists, is
   not empty and is as long as the manifest says (within 0.1 s, and longer than 0.3 s), and it
   rewrites `build/index.json` from all manifests in the folder. A failed check stops the build and
   names the files. `validate` also checks the committed `build/` folder (index, manifests, and that
   each listed file exists), without audio tools. Every clip is brought to the same loudness (-16 LUFS), 100 ms
   of silence is added at the start, peaks are limited to -3.5 dBFS, and the result is encoded as mono
   AAC at 96 kbps. To compare bitrates:

   ```bash
   uv run scripts/pipeline.py build fr-en/lesson-01 --bitrate 64 --out build-64
   ```

Silence at the start and end of each clip in the language being learned is trimmed (a short margin is
kept), so the app controls all pauses. Pauses inside a sentence only exist in phrase mode.

## Voices

`languages.json` chooses the engine of each language. Today `fr` and `en` use Kokoro (`ff_siwis` and
`af_heart`); `vi` is marked `recording` (your own voice), which is planned but not built yet, so a
lesson that needs it stops with a clear message. The "lesson is finished" sentence (`end_cue`) is
also set there, once per explanation language, and is used by all lessons that explain in it.

## Tests

```bash
uv run pytest
```

The tests use a fake voice, so they need neither Kokoro nor a model download. The tests that encode
audio need `ffmpeg` and are skipped without it. Pull requests run the tests and `validate`
automatically (`.github/workflows/content.yml`). CI installs only what the tests need, because Kokoro
(with PyTorch) is a separate dependency group in `pyproject.toml`. To work the same way locally:
`uv sync --no-default-groups --group dev`, then `uv run --no-default-groups --group dev pytest`.
A plain `uv sync` installs everything.

## Good to know

- **Kokoro is not repeatable.** Two builds of the same lesson on the same machine differ in the
  samples (its voice generator uses random noise), but not in what you hear: durations agree to about
  0.01 s and loudness to 0.1 dB. So the committed audio cannot be reproduced byte for byte, and a
  rebuild after a code change is compared by duration, loudness, peak and loudness over time, not by
  file hash.
- **The French text is not yet reviewed by a native speaker.** Please have your friend check the text
  and a sample of the final audio before relying on it.
