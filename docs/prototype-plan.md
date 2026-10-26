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
| Compressed audio format | AAC/M4A. The bitrate is chosen in task 1. | **Decided** |
| Headphone button mapping | Previous = repeat, next = next, play/pause = pause and resume (play/pause arrives as `pause` while the audio keeps playing, so the app keeps its own toggle). Confirmed by task 0.1 with the mic off. | **Decided** |
| Priority: mic over buttons | The mic matters most. The buttons are a bonus, used where they reach the page (they do not with the mic open). Volume buttons are not used; volume quality is checked after the prototype. | **Decided** (2026-10-24) |
| Build tooling | Vite with vanilla TypeScript, no UI framework. | **Decided** |
| Hosting | GitHub Pages first. | **Decided** |

### Still open

- **AAC bitrate.** Chosen in task 1 by listening.
- **Why the headphone buttons do not arrive with the mic open** (seen in both tests). Possibly the headset's own mic versus the iPhone's built-in mic. Not worked on now; task 5 logs the active input so the answer can come from normal runs.
- **Volume buttons.** They are normally handled by iOS and may never reach the page. Confirm in task 0.1.

## 3. Tasks

Each task has a "done when" line, so progress can be checked without guessing.

### Task 0: close the open tests

**0.1 Headphone button test (about 10 minutes).** `headphone-test.html` (next to `mic-test.html`) registers the Media Session actions (`play`, `pause`, `nexttrack`, `previoustrack`, plus seek and stop) and logs each press, with the screen locked, audio playing and the mic open as in the app. It is run twice: once with the audio kept playing on a pause press (as the silent track would be), and once with a pause press really pausing the audio.
Done when: it is known which actions arrive on the user's headphones, whether play/pause can work as a toggle while the silent track keeps playing, and the button mapping in section 2 is confirmed or changed to fit the buttons that arrive.

**Result (2026-10-24), closed with one part skipped.** With the mic off: pause, next and previous arrive, locked and unlocked; play/pause always arrives as `pause`. Volume buttons never reach the page. With the mic on, no headphone button arrived, the same as in the earlier test; only the on-screen controls worked. Details are in `docs/app-spec.md` section 4. The run where a pause press really pauses the audio, and a deeper look at the mic-on case, are not done: the mic has priority over the buttons (section 2), so the buttons stay best effort.

### Task 1: finish the content pipeline

Work in `content/scripts/generate_kokoro.py`.

- Add loudness normalization (`ffmpeg loudnorm`), then encoding to AAC/M4A, so all clips have a consistent volume and play on iPhone (tested in Opera Touch).
- Add each clip's duration to `manifest.json`.
- Listen to the end of every clip for the tiny extra sound (still open in `docs/content-decision.md`).
- Update `docs/content-decision.md` and `docs/app-spec.md` with the final bitrate.

Done when: the manifest and compact audio files load and play on iPhone in Opera Touch at a consistent volume, and the clip ends are checked.

**Result (2026-10-25).** `build` writes mono AAC/M4A at 96 kbps, every clip at -16 LUFS (measured gain plus peak limiter, because plain `loudnorm` left peaky clips too quiet), with 100 ms of silence at the start (a desktop player clipped the first word on repeat without it). Durations in `manifest.json` come from the final M4A. Clip ends checked by ear. The iPhone playback check in Opera Touch is done in task 4, when the app first plays audio.

### Task 2: project skeleton

- Vite and vanilla TypeScript, in a new folder in this repo.
- Lint, formatter and unit test runner (Vitest is the usual choice with Vite).
- Dev access over HTTPS from the iPhone using the existing `cloudflared` tunnel (see `README.md`).
- The PWA basics: web manifest and icon.

Done when: an empty page from the dev server opens on the iPhone over HTTPS and can be added to the home screen.

**Result (2026-10-25).** Done. The app is in `app/` (Vite, vanilla TypeScript, Vitest, ESLint, Prettier; commands in `app/README.md`). The page opens from the dev server through the `cloudflared` tunnel in Opera Touch, and Opera Touch can add it to the home screen and open it from there.

### Task 3: lesson state machine

A pure TypeScript module with no audio or mic code.

- States: playing French, waiting for the learner, playing meaning, next sentence, finished.
- Events: start, speech start, speech end, silence timeout, maximum-wait timeout, clip ended, repeat, next.
- The clock is injected, so tests do not need real time.
- Settings (silence length 3 s, maximum wait 15 s) are inputs, so the developer settings screen can change them.

Done when: unit tests cover every rule in `docs/app-spec.md` section 2, "Per-sentence loop", including: each speech restarts the wait, the meaning cannot be interrupted, speech and commands are ignored during the meaning, "next" skips the meaning, "repeat" replays the French and the loop continues, and the lesson stops after the finished cue.

**Result (2026-10-25).** Done in `app/src/lesson/machine.ts` with tests in `machine.test.ts` (29 tests, a fake clock). The machine reports effects (`playFrench`, `playMeaning`, `playFinishedCue`, `stop`); each play effect carries an id, and `clipEnded(id)` ignores ids of clips that were replaced (for example by "repeat"), so a late "ended" event cannot skip a step. Decisions made while building it:
- **Max wait (decided 2026-10-25):** the 15 s limit applies in two cases: the learner never speaks after the French ends, or one stretch of non-stop speech or noise lasts 15 s. After speech ends, 3 s of silence ends the wait. So repeating the sentence many times is allowed, and endless noise is still cut off. Both limits use the one `maxWaitMs` setting.
- Speech during the French clip is ignored, but if the learner is still speaking when the French ends, it counts as speech starting.
- "Next" skips the meaning only while the French plays or while waiting; during the meaning, as with "repeat" and speech, it is ignored.
- "Start" always restarts from the first sentence, also after the lesson finished.
- Pause and resume (play/pause button) are not in the machine; they belong to the audio module (task 4).

### Task 4: audio module

- Plays the French, English and finished-cue clips from the manifest.
- Keeps the silent track playing between sentences.
- Runs the playback watchdog (restart a clip whose current time stops advancing).
- Handles the Media Session actions (best effort, see section 2): `previoustrack` = repeat, `nexttrack` = next, `pause` and `play` = pause and resume. A `pause` press must not stop the silent track.

Done when: a test page plays all of lesson 1 in order with the screen locked, and a forced stall (for example by opening the mic permission dialog) is recovered by the watchdog.

**Result (2026-10-25): done.** The code and unit tests are in `app/src/audio/` (60 tests in the app), and lesson 1 plays in order with the screen locked on the phone. A forced stall could not be reproduced on the phone, because the mic permission dialog did not stall a one-shot clip; the user accepted the watchdog as verified by unit tests only, with real stalls left for task 9. Details of the build and the phone tests:
- `loader.ts` downloads the manifest and every clip before the lesson starts and keeps them as blob URLs, so nothing is fetched with the screen locked.
- `player.ts` (`LessonAudio`) follows the state machine's effects. It plays a silent looping track on one audio element and the clips on a second one, and it exposes the headphone buttons as events. Pause stops only the clip, never the silent track.
- The watchdog (`stall-detector.ts`) polls every 0.5 s. If the time has not moved for 2 s while a clip should play, it resumes the clip; if it is still stuck 2 s later, it reloads the clip from the start; a clip stuck at its very end counts as ended (the case seen in the mic permission test). The silent track is restarted the same way.
- Test page: `npm run dev` in `app/`, then open `/audio-test.html` through the tunnel. It plays lesson 1 with the real state machine (no mic, 3 s waits), logs everything, and has a button that asks for mic permission to force a stall. `npm run dev` and `npm run build` first copy `content/build/lesson-*` into `app/public/lessons/` (git-ignored) and stop with a message if the audio has not been built.
- **Phone test 1 (2026-10-25, mic off, screen locked, 3 s waits):** all 17 clips played in order, including the finished cue. The AAC clips play in Opera Touch, and a clip element and the silent element can play together.
- **Phone test 2 (30 s waits, `?wait=30`):** the lesson survived the long gaps with the screen locked, with the silent track on.
- **Phone test 3 (30 s waits, `?wait=30&silent=0`, no silent track):** playback stopped after the screen locked, and after about 5 minutes the page had been reloaded by iOS. **So the silent track is required.**
- **The silent track's `currentTime` stays at 0.00** while its `paused` is false (the first watchdog version restarted it every 2 s for nothing). The track still works, so the time-based watchdog is dropped for it; the watchdog now only restarts it if it is really paused.
- **The mic permission dialog did not stall a clip this time** (the clip kept playing and the mic was granted: "iPhone Microphone"), so the clip watchdog's recovery is still unproven on the phone.
- **Headphone buttons with the mic on: none arrived**, now also seen with the iPhone's built-in mic as the input. The idea that only the headset mic causes this is therefore unlikely.
- **Headphone buttons with the mic off: they arrive** (pause, next, previous), and so do the lock screen controls. Heard with the physical headphone buttons only: after pause then resume the speech did not continue from where it paused, and after "next" the new sentence started about in the middle. Not an app bug: the same mute of 0 to 1 second happens in Spotify when the headphone buttons are used (not when a song is picked on screen), and the lock screen controls had no problem in this app. The log agrees: the clip pauses at 0.50 s and resumes from 0.50 s, and iOS fires no pause or seek on the clip by itself. So physical headphone presses briefly mute the audio on this phone and headphones, and nothing in the app can change that. One more reason the buttons are a bonus.
- The silent track fires a `seeking`/`seeked` pair about every 1.6 s while it plays. That is its 1 s loop restarting; it shows the track really is playing.
- Play/pause pausing the machine's wait timers is left to task 6: the audio module only reports `pausedChange`.
- This task also does the iPhone playback check of the AAC clips (moved here from task 1).

### Task 5: mic module

- Requests the mic first, with echo cancellation, noise suppression and auto gain off.
- Measures the background noise at session start and sets the speech threshold relative to it, with hysteresis so short noises do not flip the state.
- Logs which input device is active (the iPhone microphone or the headset microphone), because it varies between runs.

Done when: on the iPhone, speech is detected and silence is detected outdoors with the processing options off, using either microphone. This is the one test still missing from `docs/app-spec.md` section 4 for outdoors speech detection.

**Result (2026-10-26): done, good enough for the prototype.** The code and unit tests are in `app/src/mic/` (76 tests in the app). On the phone, speech and silence were detected outdoors with the processing options off, on both microphones, also with the screen locked. The detector is not perfect: it only looks at loudness, so a loud door or people talking nearby can trigger it. Raising the minimum level a lot (up to 0.02) did not remove the door sounds, and a longer "speech must last" above about 150 to 200 ms starts to cut off the learner's own words. Decision (2026-10-26): leave the defaults as they are (minimum level 0.003, ratios 3 and 2, start 100 ms, end 400 ms) and accept this, since walking outside has few sounds like doors. A real voice activity detector stays a later improvement (see section 6). Details:
- `speech-detector.ts` is pure logic (15 tests). It runs on the audio clock, not on timers. The first 1.5 s of levels (the learner quiet) give the background noise (90th percentile). Speech starts when the level stays above 3 × noise for 100 ms, and ends when it stays below 2 × noise for 400 ms, so short noises and gaps between words do not flip the state. The ratios, a minimum level (0.003), the timings and the calibration length are settings (the developer screen of task 7 can change them), and "measure again" is available.
- `mic-monitor.ts` opens the mic (echo cancellation, noise suppression and auto gain off), creates the audio context inside the tap, and logs the active input and the track mute/end events. The level comes from an AudioWorklet (`level-processor.ts`) that measures a block of about 40 ms on the audio thread and posts it with its audio clock time, so a page that is throttled with the screen locked still gets every level (late, but in order and with the right timing). The test page shows the worst delivery delay.
- Test page: `/speech-test.html` (dev only): level bar with the start and end thresholds, "speaking" state, sliders for the two ratios, a button to measure the noise again, and a log.
- **Phone tests (2026-10-26), headphones on, outdoors and at a desk:** the AudioWorklet runs on iOS with nothing connected to its output. Every spoken word was detected, a noisy fan did not trigger it, and detection kept working with the screen locked (speech was detected while the page was hidden). The measured noise was very low (0.0001 to 0.001) and speech peaked between 0.003 and 0.04, so the start threshold sat on the 0.003 floor every time. The floor was left at 0.003 by decision (2026-10-26).
- **Microphone choice:** with the headphones connected, iOS offers both "MAJOR IV" (the headset) and "iPhone Microphone" to the page, but it picked the iPhone microphone by itself in every run. A page can ask for a specific one by id (the test page has a picker). Switching to the headset mic moves the sample rate from 44100 to 16000 Hz (Bluetooth call mode), and speech detection works the same.
- **Switching to the headset mic made the first calibration wrong:** the noise was measured as 0.0314 (about 60 times too high, start threshold 0.094) because opening a Bluetooth mic makes a loud burst. "Measure again" fixed it (noise 0.0005). So calibration now skips the first 1 s after the mic opens and takes the average of the quietest 0.5 s of the next 1.5 s, which also survives a cough or bang during the measurement. Startup therefore takes about 2.5 s. Re-tested on the phone (2026-10-26): the first calibration after the switch now gives noise 0.0003 and threshold 0.003, with no jump.
- **Headset mic false triggers:** with the headset mic and the 0.003 floor, door sounds and people talking nearby were detected as speech. The noise is 0.0003, so the floor sets the threshold, and the ratios have no effect. The test page now also has sliders for the minimum level and for how long speech must last, to find values by trying; the values for each microphone are still to be chosen.
- **Switching microphones a third time failed** (`AbortError: Importing a module script failed` when loading the worklet, and every later switch failed too). The cause is not known (an iOS limit on audio contexts, or a failed fetch through the tunnel). The mic module now creates one audio context and loads the worklet once, then reuses them for every microphone; switching only replaces the mic source, and open calls are queued so quick taps cannot overlap. Re-tested on the phone: switching between the two microphones worked (not five times in a row, but no failure). The audio context stays at 44100 Hz after a switch to the headset mic, where a context created after the switch ran at 16000 Hz.

### Task 6: wiring

- Start button, manifest loader, and the loop that connects the state machine to the audio and mic modules.
- The finished cue at the end of the lesson.

Done when: lesson 1 plays end to end on the iPhone, hands-free, at the desk.

### Task 7: developer settings screen

Visible in development mode only. Live values: silence length, maximum wait, speech threshold, meaning voice speed (see `docs/app-spec.md` section 2).

Done when: the values change the loop behavior without a rebuild.

### Task 8: hosting

Deploy the static build to GitHub Pages over HTTPS.

Done when: the app opens from the Pages URL on the iPhone, can be added to the home screen, and the lesson runs from there, in the browser the user uses (Opera Touch). If it cannot be added from there, this is raised before going on.

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

- A proper voice activity detector, to tell the learner's voice from doors and other people (the loudness detector of task 5 cannot).
- Voice commands "repeat" and "next": a separate spike after the prototype works.
- Playback volume quality (iOS controls the volume buttons): checked after the prototype works.
- Finding out why the headphone buttons stop arriving in some mic-on runs.
- More lessons, daily refresh, spaced repetition, Swedish, publishing to other users.
- Wrapping the web app as a native app (for example with Capacitor).
- A second TTS provider or more voices.
