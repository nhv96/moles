# Hands-Free French Listening App: Agreed Scope (MVP v1)

Status as of 2026-10-24. Items are marked **Decided**, **Proposed** (suggested, not yet confirmed) or **Open**.

## 1. Idea

A mobile-friendly app for learning spoken French by *shadowing*: you hear a sentence, repeat it out loud as many times as you like, then hear its meaning. You never need to look at or touch the phone. You put on headphones, go for a walk, and listen and speak.

- Side project for personal use. If it helps your learning, it may be published to other users later.
- Motivation: Duolingo needs you to hold and look at the phone. Its lessons are AI-generated, drift from real-life situations, are spoken too fast, often have wrong pronunciation, and its "slow playback" button only slows the audio instead of breaking the sentence into correctly pronounced pieces.
- The learner is a French beginner with strong English (understands about 95% of everyday conversation).

## 2. Product features (MVP v1)

### Content (Decided)
- One lesson, in French, with English meanings. First lesson: introducing yourself, with a made-up persona (Marc), polite "vous", France French (not Québécois).
- 8 sentences, 3 to 5 words each. The first draft (about 10 sentences of 6 to 10 words, about 5 seconds each) was too hard for a beginner to follow and repeat by shadowing, so sentences are short. New words are welcome: repeating them clearly helps remember how they sound.
- Sentences always play in the same order. No daily refresh and no spaced repetition yet.
- The French audio is generated speech (Kokoro, see section 3). Speed, phrase breaks and pause length are set per sentence and chosen by listening. No human recordings for now.
- The meaning is spoken in English (the user's chosen language), at a steady pace, with no "it means..." prefix. The earlier target of about 5 seconds assumed longer sentences; with short sentences the meanings are shorter. **To be confirmed.**
- The lesson text and settings are in `content/lessons/lesson-01.json`. The reasoning is in `docs/content-decision.md`.

### Per-sentence loop (Decided)
1. The French sentence plays.
2. The app waits for you to speak. Each time you speak, it pauses and keeps waiting.
3. After 3 seconds of silence, the English meaning plays. The meaning cannot be interrupted, and speech during it is ignored.
4. If you never speak, the meaning plays after 15 seconds. The same 15 seconds also ends the wait if you (or noise) keep going without a pause for that long.
5. The next sentence starts.
6. After the last sentence, a spoken cue says the lesson is finished, then the app stops until you start a lesson again.

### Controls
- **Start:** a button on the screen starts the lesson (Decided). After that, it runs hands-free.
- **Voice commands in English, "repeat" and "next" (Decided as the goal):**
  - "Repeat" replays the French sentence, then the loop continues.
  - "Next" skips the meaning and goes to the next sentence.
  - Commands are ignored while the meaning plays.
- **Headphone buttons (Decided 2026-10-24, best effort):** where the buttons reach the page, they do the same jobs as the voice commands: previous = repeat, next = next, play/pause = pause and resume. They are a bonus, not a requirement. The mic matters more than the buttons: the prototype does not give up mic quality or reliability to make the buttons work (see section 4).
- **Decided 2026-10-24:** the prototype runs the loop on its own, with the headphone buttons as above and no voice commands. Voice commands are a second step, because recognizing the words in a browser is the least proven part.
- **Volume buttons:** not used for control. iOS handles them and never tells the page. Volume quality is checked after the prototype works.

### Developer settings screen (Decided)
Visible in development mode only. It lets you tweak values live without rebuilding: silence length (3s), maximum wait (15s), speech threshold, meaning voice speed, and so on.

### No grading (Decided)
No scores, no right or wrong, no streaks, no progress tracking. You can start a new lesson without finishing the current one.

### Deliberately out of scope for now
Replaying the French after the meaning (revisit after real use), build-up practice (playing the end of a sentence, then the whole sentence, which would need cutting audio into pieces), daily refresh, spaced repetition, Swedish, multiple lessons, publishing to other users.

## 3. Tech stack

### Decided
- **Web app (PWA)** opened on the iPhone, with no native app for the MVP. Reasons: you develop on Linux and have no Mac, and you have never built a mobile app.
- **TypeScript** for the app (you have used it before).
- **Static hosting over HTTPS.** HTTPS is required for microphone access on iPhone. Options: GitHub Pages, Cloudflare Pages or Netlify, or a temporary tunnel (`cloudflared`) during development.
- **Lesson content:** the sentences are written for the app, and the audio is generated with **Kokoro** (open text-to-speech model, Apache 2.0): French voice `ff_siwis`, English voice `af_heart`. A Python script (`content/scripts/generate_kokoro.py`, managed with `uv`, Python 3.13) builds one French and one English audio file per sentence plus a `manifest.json`. Open corpora (Tatoeba, Common Voice, Lingua Libre) were rejected; the reasons are in `docs/content-decision.md`.
- **Go for the content pipeline** (fetching sentences, cutting audio, generating lesson files): *superseded for MVP v1.* The pipeline no longer fetches sentences or cuts audio, and the generator is the Python script above. See Open.

### Proposed
- No UI framework to start, since the app has very little UI. Keep the lesson loop as a separate, testable state machine (playing, waiting, meaning, next) apart from the audio and mic code.
- Measure the background noise at the start of each session and set the speech threshold relative to it. Later, replace the volume threshold with a proper voice activity detector.
- Keep a silent audio track playing between sentences, to keep the page alive when the screen is locked. This is untested.
- Ask for mic permission and set up the mic first, when the user taps start, and only then play audio. A 3-run test supports this (see section 4), but mic-first seems to make playback quieter, which is being tested separately.
- Add a playback watchdog: if the audio's current time stops advancing while the page says it is playing, detect that and restart playback. The first-run bug showed that events alone can't be trusted to report a silent stall.
- Turn off echo cancellation, noise suppression and auto gain on the mic (not needed with headphones). In a Safari test this restored playback volume to a good level in the mic-first order. Speech detection with these off, outdoors, is still to be tested.

### Open
- How to recognize "repeat" and "next" in the browser, and how reliable it is on iPhone.
- If the web app is published to other users or hits limits, whether to wrap it as a native app later (for example with Capacitor, built in the cloud).
- Audio format. Decided on 2026-10-25: mono AAC/M4A at 96 kbps, every clip at -16 LUFS (measured gain plus peak limiter), made by `build` (task 1 of `docs/prototype-plan.md`). Still to check: playback on the iPhone in Opera Touch, and the clip starts (see `docs/content-decision.md`).
- Whether the content generator stays in Python or gets a Go wrapper later. Kokoro is a Python library, and the earlier plan for Go assumed fetching and cutting audio, which is no longer needed.
- Whether to add more voices or a second TTS provider (for example Google Cloud TTS, deliberately not tried so far) if Kokoro's single French voice becomes a limit.

## 4. Test results so far (iPhone, iOS 18.7, mostly Opera Touch)

Safari was used once (the echo cancellation volume test below). All other tests ran in Opera Touch, and from 2026-10-24 all testing is done in Opera Touch only.

A single test page was used. It beeped every 3 seconds, showed a mic level, requested a wake lock, and logged headphone button presses.

| Question | Result |
|---|---|
| Mic and audio playback with the screen locked, phone in pocket | **Worked for about 10 minutes** (chores plus walking outside). The beeps never stopped, and speech was detected throughout. |
| Headphone buttons (first page, mic active) | **Did not work.** Rechecked on 2026-10-24: only the on-screen controls (play, pause, next, previous) reached the page, not the headphone buttons. An earlier note here said the headphone buttons worked; that was wrong. Same result as the headphone button test below. |
| Mic track muted or ended while locked | **No.** |
| Fixed speech threshold | **Not reliable.** Speech levels ranged from 0.004 to 0.06 depending on the situation, so a fixed threshold won't hold up outdoors. |
| Timer accuracy while the page is hidden | **Probably coarser** (events land on whole seconds, suggesting about a 1 second tick). This is an interpretation and was not confirmed. |
| Beep quality on Bluetooth headphones with the mic active | **Good.** Clear, not loud. (Beeps only; French speech and the meaning voice are untested.) |
| Beep volume in the mic-first order | **Clearly quieter with the mic's echo cancellation, noise suppression and auto gain on; good with them off** (tested in Safari). Probably iOS voice processing. It may still be slightly quieter than audio-first, but good enough. |
| First run after granting mic permission | **Bug, reproduced.** With audio started before the mic permission, the beep played once, then nothing. The page received no pause, stalled or ended event, and still reported the audio as playing. With "mic first" ticked, the beeps repeated normally. The two runs also differed in input device (iPhone microphone vs the Bluetooth headset's microphone), and earlier, a plain refresh also made the old order work. Follow-up (3 more runs, all in Opera Touch): the stall reproduced in both fresh runs with the old order, with either microphone, so it is not tied to the input device or to a first-time-only effect. The clip was stuck at its end (3.00s of a 3s loop) while the permission dialog was open, and a watchdog restart fixed it after about 3 seconds. With mic first, no stall occurred. This is the likely cause, but not proven. |

### Speech detection test (2026-10-26)

Page: `app/speech-test.html`. iPhone, iOS 18.7, Opera Touch, Bluetooth headphones (MAJOR IV), mic with echo cancellation, noise suppression and auto gain off.

| Question | Result |
|---|---|
| Speech and silence detected outdoors, iPhone microphone | **Works.** Every spoken word was detected, a noisy fan did not trigger it. Background noise measured 0.0001 to 0.001, speech peaks 0.003 to 0.04. |
| Same with the headset microphone | **Works.** Offered to the page as a second input ("MAJOR IV"), but iOS picks the iPhone microphone by itself, so the app must ask for the headset by id if it is wanted. The headset input runs in Bluetooth call mode (16000 Hz). |
| With the screen locked | **Works.** Speech was detected while the page was hidden, with both microphones. |
| First calibration after switching to the headset mic | **Wrong at first** (noise 0.03, about 60 times too high) because opening a Bluetooth mic makes a loud burst. Fixed by skipping the first second and taking the quietest half second. |
| Doors and people talking nearby | **Detected as speech.** A higher minimum level or a longer minimum speech length cannot separate them from the learner's voice without cutting off the learner. Accepted for the prototype. |

### Headphone button test (2026-10-24)

Page: `headphone-test.html` (branch `test/headphone-buttons`). iPhone, iOS 18.7, Opera Touch (`OPT/6.3.0` in the user agent), Bluetooth headphones (Bluetooth 4).

| Question | Result |
|---|---|
| Buttons with the mic off, screen locked and unlocked | **Work.** Pause, next and previous reached the page, locked and unlocked. |
| Play/pause button while the audio keeps playing | **Always arrives as `pause`, never `play`.** The app must treat it as its own toggle. A run where a pause press really pauses the audio is not done yet, so what arrives next is unknown. |
| Buttons with the mic on (mic first, processing off) | **None of the headphone buttons arrived.** Only the on-screen and lock screen controls worked. This matches the first page above (rechecked), so the behavior is the same in both tests. The log of this run was not kept, so the active input is unknown. |
| Why the buttons stop with the mic open | **Not proven.** One idea: when the headset's own mic is used, Bluetooth switches to phone-call mode and the buttons act as call controls. Not tested with the iPhone's built-in mic as the input. |
| Volume buttons (headphones and phone sides) | **Volume changes, but nothing reaches the page.** Expected: iOS handles volume itself. Not usable for control. |
| Setting the reported play state to paused while audio plays | **No effect.** The state stays `playing`; iOS goes by the real audio. |

## 5. Limitations and risks

1. **Platform risk.** Background audio and mic behavior in iOS web apps is controlled by Apple and may change.
2. **Noise.** Wind, traffic and chores can look like speech, so the app might wait for a sentence to end that never ends. The 15-second fallback covers it.
3. **Voice commands** are unproven in the browser.
4. **Bluetooth headphones** often drop to phone-call audio quality while the mic is active. In the test, the beeps stayed clear on the user's Bluetooth headphones. Real speech and the meaning voice still need checking.
5. **Interruptions** (phone call, Siri, notification) can stop audio and the mic. The app must detect this and resume cleanly. Untested.
6. **Long sessions and battery.** Only 10 minutes have been tested. A 30-minute test, with a check of battery use, is still pending.
7. **Content quality and pronunciation.** A beginner can't judge French pronunciation. The French text (written by Claude) and a sample of the audio still need review by a native speaker; the user knows one who can help. Not done yet.
8. **Apple Developer account.** Not needed for the web app. A native app would need a paid account (about $99/year, to be verified) and cloud builds.
9. **Silent playback stall.** Playback can get stuck without any event if the mic permission dialog is open when the clip's loop point passes. Mic-first order and a watchdog address it (see section 3).
10. **Which microphone iOS uses varies.** With the same headphones on, one run used the headset's mic and another the iPhone's built-in mic. The app must work with either and should log which one is active.
11. **Playback volume** drops if the mic's voice processing is left on (see section 4). Keep it off.
12. **Generated-voice limits.** Kokoro has one French voice, graded B- by its author. Slowing it stretches every sound equally, so at speeds of 0.8 and below short words dragged and the audio broke up, and at speeds around 0.85 a tiny extra sound ("ehh", "ck") can appear at the start of a clip or phrase. The per-sentence speeds in the lesson file (0.85 to 0.92) were chosen to avoid this; any new sentence needs the same listening check. Whether clips have a tiny extra sound at the end has not been checked.
13. **Headphone buttons do not work while the mic is open.** Seen in both tests on Bluetooth headphones (section 4); they work with the mic off. The cause is unknown, so the app treats the buttons as a bonus and logs which mic input is active.

## 6. Next step

The content source is settled (see `docs/content-decision.md`). What remains before the app can use lesson 1:

1. Native speaker review of the French text and a sample of the audio.
2. ~~Add loudness matching and AAC/M4A encoding to `build`~~ Done: 96 kbps (see `docs/prototype-plan.md`, task 1).
3. Load `manifest.json` and the audio files in the web prototype.
