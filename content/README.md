# content: Kokoro voice test

Generates audio for lesson 1 ("introduce yourself", persona Marc) with the open Kokoro TTS model,
so the best speed, mode and pause can be chosen per sentence and a native French speaker can judge the result.

**Status:** the model call itself is only tested by you. The rest (commands, silence trimming, piece
joining, gap lengths, manifest, review sheet) was checked against a stand-in for Kokoro.

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

## Modes

How a French sentence is made:

| Mode | What it does |
|---|---|
| `whole` | The whole sentence in one go (default). |
| `phrases` | The pieces listed in the sentence's `phrases`, each made separately, then joined. |
| `words` | Every word made separately (split on spaces), then joined. A lone `?` or `!` stays with the word before it. |

In `phrases` and `words` mode, silence at the edges of each piece is trimmed, a 5 ms fade is applied at
the joins, and the pieces are joined with a gap of `pause_ms` milliseconds. The gap is the total time
between the spoken parts, so `0` means no gap and `200` means 200 ms. (Earlier versions added the pause on
top of about 80 ms of leftover quiet, so the same number now gives a slightly shorter gap.)

## Workflow

1. **Sweep:** make versions to compare.

   ```bash
   uv run scripts/generate_kokoro.py sweep                       # speeds 0.6-1.0, whole + phrases
   uv run scripts/generate_kokoro.py sweep --speeds 0.9 1.0 --modes words --pauses 0 60 120
   uv run scripts/generate_kokoro.py sweep --speeds 0.9 --modes whole phrases words --pauses 100 200
   ```

   File names: `s02_fr_0.90.wav` (whole), `s01_fr_0.90_ph_p200.wav` (phrases, 200 ms gap),
   `s02_fr_0.90_wd_p060.wav` (words, 60 ms gap), `s01_en.wav` (English meaning).
   Without `--pauses`, the sentence's own pause setting is used. Phrase versions are only made for
   sentences that define `phrases`.

2. **Choose per sentence.** Listen, then edit `lessons/lesson-01.json`:

   ```json
   { "id": "s02", "fr": "Je suis italien.", "en": "I am Italian.", "speed": 0.9 }
   { "id": "s03", "fr": "J'habite en Belgique.", "en": "I live in Belgium.", "speed": 1.0, "mode": "words", "pause_ms": 60 }
   { "id": "s01", "fr": "Bonjour, je m'appelle Marc.", "en": "...", "mode": "phrases",
     "phrases": ["Bonjour,", "je m'appelle Marc."], "pause_ms": 250 }
   { "id": "s05", "fr": "Je parle un peu français.", "en": "...", "mode": "words", "pause_ms": [150, 50, 50] }
   ```

   - `speed`: used for that sentence. Without it, `default_speed` applies (**0.9 is a placeholder**).
   - `mode`: `"whole"` (default), `"phrases"` or `"words"`.
   - `phrases`: the pieces of the sentence. Joined, they must equal `fr` (the script checks this).
   - `pause_ms`: one number for all gaps, or a list with one number per gap (a sentence with 4 pieces has
     3 gaps). Without it, the lesson-level `phrase_pause_ms` applies (400).

3. **Build** the final files with the chosen settings:

   ```bash
   uv run scripts/generate_kokoro.py build
   ```

   It writes `s01_fr.wav`, `s01_en.wav`, ..., the "lesson finished" cue, and `manifest.json`
   (order, text, speed, mode, pause, file names, durations).

Silence at the start and end of each French clip is trimmed (a short margin is kept), so the app can
control all pauses.

## The sentences

The French text is my own and has not been reviewed by a native speaker. Please have your friend check
the text (and a sample of the final audio) before relying on it.

## Later

A Google Cloud TTS script could reuse the same lesson file so the two voices compare directly.
