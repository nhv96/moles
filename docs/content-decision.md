# Content decision: French sentences and audio (MVP v1)

Status as of 2026-10-24. Decided and built; native-speaker review still pending.

Related: `docs/app-spec.md` (app scope and tech stack), `content/README.md` (how to run the generator).

## Decision

- The sentences are written for this app, not taken from an open corpus.
- The audio is generated with **Kokoro** (open TTS model, Apache 2.0), using its only French voice (`ff_siwis`) for France French, and a Kokoro English voice (`af_heart`) for the meanings.
- Speed, phrase splitting and pause length are set **per sentence** in a lesson file, chosen by listening.
- Code and settings: folder `content/` of this repo.

## Why not the open corpora (research of 2026-10-21)

- **Tatoeba:** about 9,800 French recordings; speakers vary in pace and clarity (user listened); audio licence is chosen by each speaker, some are non-commercial.
- **Common Voice:** terms forbid re-hosting the dataset; the French text is not conversational (largely extracted from Wikipedia).
- **Lingua Libre:** built for single words and short phrases.
- Not published, so licences matter little now; the pipeline keeps the audio source replaceable.

## Lesson 1: "introduce yourself" (persona Marc, vous)

The French is written by Claude and has **not** been reviewed by a native speaker.

| Id | French | English | Speed | Mode |
|---|---|---|---|---|
| s01 | Bonjour, je m'appelle Marc. | Hello, my name is Marc. | 0.87 | phrases (100 ms) |
| s02 | Je suis italien. | I am Italian. | 0.90 | whole |
| s03 | J'habite en Belgique. | I live in Belgium. | 0.87 | whole |
| s04 | Je travaille ici. | I work here. | 0.92 | whole |
| s05 | Je parle un peu français. | I speak a little French. | 0.85 | whole |
| s06 | J'apprends le français. | I am learning French. | 0.85 | whole |
| s07 | Et vous, comment vous appelez-vous ? | And you, what is your name? | 0.90 | phrases (100 ms) |
| s08 | Plus lentement, s'il vous plaît. | More slowly, please. | 0.90 | phrases (100 ms) |

Closing cue: "The lesson is finished."

The source of truth for these values is `content/lessons/lesson-01.json`; this table may lag behind it.

## What listening tests showed

- **Sentence length:** the first draft (6 to 10 words) was too hard to follow and repeat. Sentences of **3 to 5 words** work for a beginner. This changes the MVP spec, which still says 6 to 10 words and about 5 seconds.
- **Slowing:** Kokoro's speed setting stretches every sound equally, so slow speeds (0.8 and below) made short words drag and the audio break up. The best balance was 0.85 to 0.92, different for each sentence.
- **Phrase by phrase:** splitting a sentence at a natural pause (after a comma) and joining the pieces with a short gap sounded natural for s01, s07 and s08.
- **Word by word:** stitching single words together sounded unnatural at every pause length, even 0. Abandoned.
- **Tiny start sounds** ("ehh" or "ck" at the start of a clip or phrase): clearer the slower the speed, gone at 0.9 and above. Likely cause (from reading Kokoro's code, not proven): the speed setting also stretches the model's start and end marker tokens. Fixed per sentence by choosing a speed where they are gone.

## Pipeline (Python, in the repo)

- `lessons/lesson-01.json`: text, meaning, per-sentence `speed`, `mode`, `phrases`, `phrase_pause_ms`.
- `scripts/generate_kokoro.py sweep`: listening test at several speeds, plus phrase versions.
- `scripts/generate_kokoro.py build`: final files per sentence (French and English), the finished cue, and `manifest.json`. Edge silence is trimmed so the app controls all pauses.
- Dependencies via `uv` (Python 3.13, `uv.lock` committed); `espeak-ng` installed with apt.

## Still open

- Native speaker review of the French text and a sample of the audio.
- Whether any clip has a tiny extra sound at its end (not yet checked).
- Google Cloud TTS: deliberately not tried; Kokoro is good enough for now.
- `docs/app-spec.md` still says 6 to 10 words per sentence.
- Using the built files and `manifest.json` in the web-app prototype.
