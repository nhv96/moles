# Introduction

This project is to build a mobile friendly app that help the user to learn French by shadowing technique: listen and repeat the sentence.

Read `docs/app-spec.md` for an overview of the project.

Read `docs/content-decision.md` for the agreed design for the lesson content (how long is the sentece, what speed,...).

Read `docs/prototype-plan.md` for the tasks to work toward the current goal: have a first working prototype.

# Guideline

- Each task must be done in it's own branch. When a task is done (concluded by the user or meet the finish condition), then the user will merge the code from that branch into `main` branch and the agent must not continue using that branch.

# Development flow

Two stages:

1. **Develop:** run `npm run dev` in `app/` and open it on the phone through the `cloudflared` tunnel (`cloudflared tunnel --url http://localhost:5173`). Use the browser (Opera Touch), not the home-screen app, because the tunnel URL changes each time. The dev build has the settings panel and fast reloads, and nothing is public.
2. **Release:** the user merges the task branch into `main`. If `app/`, `content/build/` or the workflow file changed, GitHub Actions deploys to https://nhv96.github.io/moles/. Docs-only merges do not deploy.

Rules:
- Test a feature with the tunnel before merging. Do not use `main` and the deployed app as the test bed.
- Things that only behave right when installed (screen locked, home-screen app, long runs) get a final check on the deployed app after the merge.
- Every pull request runs lint, format check, tests and the build. Run `npm run lint`, `npm run format:check` and `npm test` in `app/` before asking the user to commit.
- Every pull request also runs the content checks (`.github/workflows/content.yml`). When `content/` changes, run `uv run pytest` and `uv run scripts/pipeline.py validate` in `content/` before asking the user to commit.

# Generating a lesson (content pipeline)

Use this when the user asks for a new lesson, for example "make a lesson about ordering at a restaurant". Lessons are made by the pipeline in `content/`. Details: `content/README.md` (every command), `docs/content-pipeline-plan.md` (why it is built this way). Do not re-explain them here; follow these steps.

A lesson is named by its pair and id: `fr-en/lesson-03` (the language being learned, then the explanation language). Run all commands in `content/`. Do the work in its own branch (see Guideline), for example `lesson-03`.

## Steps

1. **Collect the request.** Ask the user for what is missing: language pair, situation, the two speakers (for example Customer and Seller; speaker `a` is the learner's side), persona (made-up name of `a`), number of sentences (a target, not an exact count), learner level, register and accent. The lesson id is the next free number in `content/lessons/<pair>/`. Do not guess; ask when in doubt.
2. **Write the text.** Read `content/prompts/generate-lesson.md` and follow it exactly as if you were the AI it is written for: its rules, its output format and its schema. Fill its request table with the user's values. Save the answer as `content/lessons/<pair>/<lesson-id>.json`. Do not write a tuning file or an end sentence (the app adds the end cue).
3. **Check it:** `uv run scripts/pipeline.py validate`. It must report 0 errors. Fix the text and run it again. Show the user the French (or other target) text and the meanings, and say that a native speaker has not reviewed it. The user may ask for changes; the text is locked only after the user approves it.
4. **Sweep** (listening test, takes about 2 minutes for 9 sentences; output is git-ignored in `content/out/`): `uv run scripts/pipeline.py sweep <pair>/<lesson-id>`. Then stop and ask the user to listen. Give the folder `content/out/<pair>/<lesson-id>/` (the sheet is `review.md`). Files ending `_ph` are phrase-by-phrase versions.
5. **Tune.** The user tells the speed and mode (`whole` or `phrases`) per sentence, and maybe the pause between phrases. Write it in `content/lessons/<pair>/<lesson-id>.tuning.json` (format in `content/README.md`, step 4). Sentences the user does not mention use the defaults (the language's speed, whole, 100 ms pause). Do not choose speeds yourself.
6. **Build:** `uv run scripts/pipeline.py build <pair>/<lesson-id>`. It writes the audio and `manifest.json` in `content/build/<pair>/<lesson-id>/`, runs a check of every file, and rewrites `content/build/index.json`.
   - Rebuilding a lesson re-makes **all** its clips with slightly different bytes (the voice is not repeatable, the sound is the same). So do not rebuild a lesson that did not change. Never rebuild another lesson only to refresh it.
   - `build` also re-makes the shared end cue `content/build/cues/<meaning-lang>.m4a`. If that file was already committed, restore it with `git checkout content/build/cues/<meaning-lang>.m4a`, so older lessons keep the exact audio the user listened to. Then run `validate` again.
7. **Check and report.** In `content/`: `uv run pytest` and `uv run scripts/pipeline.py validate`. Tell the user what changed and ask them to play the lesson on the phone through the tunnel (`npm run dev` in `app/`; it copies the build into the app by itself). The picker lists all built lessons. Ask before committing.
8. **Commit** only when asked. One commit holds the lesson text, the tuning file, the built audio (`content/build/`) and the updated `index.json`. The user merges it. Merging deploys the app (because `content/build/` changed), so the user checks the deployed app once afterwards.

## Changing a lesson later

- To change a sentence (text): edit `lessons/<pair>/<lesson-id>.json` only when the user asks, run `validate`, then build that one lesson again (step 6). A new sentence has no entry in the tuning file, so it uses the defaults; ask the user to listen to it and tune it if needed.
- To change a speed, mode or pause: edit the tuning file and build that lesson again.
- To change the rules the AI follows: edit `content/prompts/generate-lesson.md`. The copy of the lesson schema inside it must equal `content/schema/lesson.schema.json` (a test checks it). Do not change the schema or the prompt as a side effect of writing a lesson.

## Things that stop you

- A language whose engine is `recording` (Vietnamese) cannot be built yet; the pipeline says so. Tell the user instead of working around it.
- The first `uv sync --managed-python` needs `espeak-ng` and `ffmpeg` installed (see `content/README.md`, Setup). Building and sweeping need the Kokoro voice model, which downloads on first use.
- If `validate` or `build` fails, report the message as it is. Do not edit the build files, the index or the manifests by hand.
