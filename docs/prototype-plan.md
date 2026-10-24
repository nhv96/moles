# Prototype Plan: Hands-Free French Listening App (MVP v1)

Status as of 2026-10-24. Items are marked **Decided**, **Proposed** (suggested, not yet confirmed) or **Open**.

Related: `docs/app-spec.md` (scope, loop rules, tech stack, test results), `docs/content-decision.md` (content and audio decisions), `content/README.md` (how to run the generator).

## 1. Goal

Lesson 1 runs end to end on an iPhone as a PWA, hands-free with the screen locked:

1. The French sentence plays.
2. The app waits for the learner to speak (3 s of silence ends the wait, 15 s maximum if the learner never speaks).
3. The English meaning plays.
4. The next sentence starts.
5. After the last sentence, the "lesson is finished" cue plays and the app stops.

Control during the lesson is by headphone buttons. Voice commands ("repeat", "next") are **deferred** to a separate spike after the prototype works (see `docs/app-spec.md`, section 2, Controls).

## 2. Decisions made on 2026-10-24

| Topic | Decision | Status |
|---|---|---|
| Headphone buttons | Test next/previous through the Media Session API before fixing the repeat/next mapping (task 0.1). The headphones have play/pause, next/previous and volume up/down. | **Decided** |
| Mic and audio setup | Request the mic first, with echo cancellation, noise suppression and auto gain off. | **Decided** (promoted from Proposed) |
| Playback watchdog | Detect a clip whose current time stops advancing while the page says it is playing, and restart it. | **Decided** (promoted from Proposed) |
| App structure | The lesson loop is a separate, testable state machine, apart from the audio and mic code. | **Decided** (promoted from Proposed) |
| Speech threshold | Measure the background noise at session start and set the threshold relative to it. A proper voice activity detector comes later. | **Decided** (promoted from Proposed) |
| Silent track between sentences | Keep a silent audio track playing to keep the page alive with the screen locked. Untested, so it is verified in the prototype. | **Decided** (promoted from Proposed) |
| Loudness | Normalize with `ffmpeg loudnorm` in the `build` step. | **Decided** |
| Build tooling | Vite with vanilla TypeScript, no UI framework. | **Decided** |
| Hosting | GitHub Pages first. | **Decided** |

### Still open

- **Compressed audio format:** AAC/M4A or MP3. Both play on iPhone Safari. The `loudnorm` decision is made; the container and bitrate are not (task 1).
- **Headphone button mapping** for "repeat" and "next". A natural mapping would be previous = repeat and next = next, with play/pause kept as pause and resume, but it is not chosen until task 0.1 shows which buttons reach the page.
- **Volume buttons.** They are normally handled by iOS and may never reach the page. Confirm in task 0.1.

## 3. Tasks

Each task has a "done when" line, so progress can be checked without guessing.

### Task 0: close the open tests

**0.1 Headphone button test (about 10 minutes).** Extend `mic-test.html`, or write a small new page, to register Media Session actions (`play`, `pause`, `nexttrack`, `previoustrack`) and log each press, with the screen locked and while audio plays.
Done when: it is known which of the four actions arrive on the user's headphones, and the button mapping above is fixed.

### Task 1: finish the content pipeline

Work in `content/scripts/generate_kokoro.py`.

- Add encoding to the compact format (see Still open) after the `loudnorm` step, so all clips have a consistent volume.
- Add each clip's duration to `manifest.json`.
- Listen to the end of every clip for the tiny extra sound (still open in `docs/content-decision.md`).
- Update `docs/content-decision.md` and `docs/app-spec.md` once the format is chosen.

Done when: the manifest and compact audio files load and play on iPhone Safari at a consistent volume, and the clip ends are checked.

### Task 2: project skeleton

- Vite and vanilla TypeScript, in a new folder in this repo.
- Lint, formatter and unit test runner (Vitest is the usual choice with Vite).
- Dev access over HTTPS from the iPhone using the existing `cloudflared` tunnel (see `README.md`).
- The PWA basics: web manifest and icon.

Done when: an empty page from the dev server opens on the iPhone over HTTPS and can be added to the home screen.

### Task 3: lesson state machine

A pure TypeScript module with no audio or mic code.

- States: playing French, waiting for the learner, playing meaning, next sentence, finished.
- Events: start, speech start, speech end, silence timeout, maximum-wait timeout, clip ended, repeat, next.
- The clock is injected, so tests do not need real time.
- Settings (silence length 3 s, maximum wait 15 s) are inputs, so the developer settings screen can change them.

Done when: unit tests cover every rule in `docs/app-spec.md` section 2, "Per-sentence loop", including: each speech restarts the wait, the meaning cannot be interrupted, speech and commands are ignored during the meaning, "next" skips the meaning, "repeat" replays the French and the loop continues, and the lesson stops after the finished cue.

### Task 4: audio module

- Plays the French, English and finished-cue clips from the manifest.
- Keeps the silent track playing between sentences.
- Runs the playback watchdog (restart a clip whose current time stops advancing).
- Handles the Media Session actions fixed in task 0.1.

Done when: a test page plays all of lesson 1 in order with the screen locked, and a forced stall (for example by opening the mic permission dialog) is recovered by the watchdog.

### Task 5: mic module

- Requests the mic first, with echo cancellation, noise suppression and auto gain off.
- Measures the background noise at session start and sets the speech threshold relative to it, with hysteresis so short noises do not flip the state.
- Logs which input device is active (the iPhone microphone or the headset microphone), because it varies between runs.

Done when: on the iPhone, speech is detected and silence is detected outdoors with the processing options off, using either microphone. This is the one test still missing from `docs/app-spec.md` section 4 for outdoors speech detection.

### Task 6: wiring

- Start button, manifest loader, and the loop that connects the state machine to the audio and mic modules.
- The finished cue at the end of the lesson.

Done when: lesson 1 plays end to end on the iPhone, hands-free, at the desk.

### Task 7: developer settings screen

Visible in development mode only. Live values: silence length, maximum wait, speech threshold, meaning voice speed (see `docs/app-spec.md` section 2).

Done when: the values change the loop behavior without a rebuild.

### Task 8: hosting

Deploy the static build to GitHub Pages over HTTPS.

Done when: the app opens from the Pages URL on the iPhone, can be added to the home screen, and the lesson runs from there.

### Task 9: field testing

- Full lesson 1 on a walk.
- A 30-minute run with a check of battery use (only 10 minutes have been tested so far).
- An interruption (phone call, Siri, notification): the app must detect it and resume cleanly.
- Real French speech and the English meaning voice on the Bluetooth headphones with the mic active (so far only beeps were tested).

Done when: the results are written into `docs/app-spec.md` section 4 and the failures found have follow-up tasks.

## 4. Order and dependencies

- Task 0.1 comes first because it fixes the button mapping used in tasks 3 and 4.
- Tasks 1 and 2 are independent and can run in parallel.
- Task 3 needs no audio or mic code and can start as soon as task 2 gives a test runner.
- Tasks 4 and 5 need task 2 and, for real clips, task 1.
- Task 6 needs tasks 3, 4 and 5. Task 7 needs task 6.
- Task 8 can be set up after task 2 and is needed for task 9 away from the desk.

## 5. In parallel: native speaker review

Review of the French text and a sample of the audio by the native speaker the user knows. It does not block the prototype. It blocks sharing the app with anyone else, and it blocks using the French in lesson 1 as final.

## 6. Deferred

- Voice commands "repeat" and "next": a separate spike after the prototype works.
- More lessons, daily refresh, spaced repetition, Swedish, publishing to other users.
- Wrapping the web app as a native app (for example with Capacitor).
- A second TTS provider or more voices.
