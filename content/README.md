# content: Kokoro voice test

Generates audio for lesson 1 ("introduce yourself", persona Marc) with the open Kokoro TTS model,
so the right speed and mode can be chosen per sentence and a native French speaker can judge the result.

**Status:** the model call itself is only tested by you. The rest (commands, silence trimming, phrase
joining, manifest, review sheet) was checked here against a stand-in for Kokoro.

## Folder layout

```
content/
  lessons/lesson-01.json     source of truth: text, meaning, per-sentence settings
  scripts/generate_kokoro.py generator with two commands: sweep, build
  pyproject.toml             dependencies (managed with uv)
  .python-version            3.13
  out/lesson-01/             sweep output (git-ignored): wav files + review.md
  build/lesson-01/           build output (git-ignored): final wav files + manifest.json
```

## Setup (Ubuntu)

```bash
sudo apt install espeak-ng
cd content
uv sync --managed-python
```

## Workflow

1. **Sweep:** make every sentence at several speeds, plus phrase-by-phrase versions where defined.

   ```bash
   uv run scripts/generate_kokoro.py sweep                      # speeds 0.6 0.7 0.8 0.9 1.0
   uv run scripts/generate_kokoro.py sweep --speeds 0.8 0.9 1.0 # your own list
   ```

   Files: `s01_fr_0.80.wav` (whole sentence), `s01_fr_0.80_ph.wav` (phrase by phrase), `s01_en.wav`.

2. **Choose per sentence.** Listen, then edit `lessons/lesson-01.json`:

   ```json
   { "id": "s02", "fr": "Je suis italien.", "en": "I am Italian.", "speed": 0.8 }
   { "id": "s01", "fr": "...", "speed": 0.9, "mode": "phrases", "phrases": ["Bonjour,", "je m'appelle Marc."] }
   ```

   - `speed`: used for that sentence. Without it, `default_speed` applies (**0.9 is a placeholder**).
   - `mode`: `"whole"` (default) or `"phrases"`.
   - `phrases`: the pieces of the sentence. Joined, they must equal `fr` (the script checks this).
   - `phrase_pause_ms`: silence between the pieces, in milliseconds. Set it on a sentence to override the
     lesson-level value (top of the file, 400 by default). One number per sentence. Tune it by ear.

3. **Build** the final files with the chosen settings:

   ```bash
   uv run scripts/generate_kokoro.py build
   ```

   It writes `s01_fr.wav`, `s01_en.wav`, ..., the "lesson finished" cue, and `manifest.json`
   (order, text, speed, mode, file names, durations).

Silence at the start and end of each French clip is trimmed (a short margin is kept), so the app can
control all pauses. Pauses inside a sentence only exist in phrase mode.

## The sentences

The French text is my own and has not been reviewed by a native speaker. Please have your friend check
the text (and a sample of the final audio) before relying on it.

## Later

A Google Cloud TTS script could reuse the same lesson file so the two voices compare directly.
