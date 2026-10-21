# content: Kokoro voice test

Generates audio for lesson 1 ("introduce yourself", persona Marc) with the open Kokoro TTS model,
so a native French speaker can judge whether the voice is good enough.

**Status: untested.** The script was written without being able to install or run Kokoro, so expect
to fix small things on the first run.

## Folder layout

```
content/
  lessons/lesson-01.json     source of truth: French text + English meaning per sentence
  scripts/generate_kokoro.py generator
  pyproject.toml             dependencies (managed with uv)
  .python-version            3.13
  out/lesson-01/             generated (git-ignored): wav files + review.md
```

## Run it (Ubuntu)

```bash
sudo apt install espeak-ng      # Kokoro uses it for French pronunciation rules (confirm on first run)
cd content
uv run scripts/generate_kokoro.py
```

The first run downloads the model (a few hundred MB). Then it writes, per sentence, French audio at
speeds 0.8, 0.9 and 1.0 plus the English meaning, and a `review.md` sheet.

Options: `--speeds 0.85 0.95`, `--en-voice af_bella`, `--lesson lessons/other.json`.

## If `uv` cannot resolve Python 3.13

I could not check whether the current `kokoro` release supports Python 3.13. If `uv run` fails on the
Python version, pin an older one and run again:

```bash
cd content
uv python pin 3.12
uv run scripts/generate_kokoro.py
```

## Review with your friend

1. Listen yourself first, for pace and clarity only.
2. Send `out/lesson-01/` and `review.md` to your friend.
3. They mark each file OK or write what is wrong, and say whether the French text itself is natural.

Later, a Google Cloud TTS script can reuse the same lesson file and speeds so the two voices compare directly.
