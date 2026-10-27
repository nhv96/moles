# Interruption test plan (phone call, Siri, notification)

Status: **not run yet** (written 2026-10-27). It is the one item of prototype task 9 that is open. It can be run any time; nothing else depends on it.

## Why

When a call comes in, iOS takes over the audio: it pauses the audio players and cuts the microphone. The app has no code that reacts (it only logs the events). From reading the code, the expected result is:

- Playback probably restarts by itself after the call (the watchdog retries the clip every couple of seconds). Not sure iOS allows it.
- The microphone probably stays dead. The app then gets no sound levels and treats the learner as silent, so every sentence waits the full 15 s and moves on, with nothing on screen to say so.
- The wait timers keep running during the call.
- Worst case: iOS suspends the page during a long call, and the lesson freezes or restarts from sentence 1.

The test finds out which of these is real, so that we build recovery only if it is needed.

## Setup

- iPhone, Opera Touch, Bluetooth headphones and their mic, as in the field test.
- The app from GitHub Pages, added to the home screen (the version that is used for real). Open the "Log" section of the page; it keeps the log in the page, so do not close the app.
- Someone to call the phone (or a second phone). A normal phone call is the main case. Optional extras are listed under "Other interruptions".

## Test 1: a short phone call (the main one, about 5 minutes)

1. Start lesson 1 and wait for the first French sentence.
2. Note what the lesson is doing when the call comes in. Use the **wait** (your turn to speak) as the first run.
3. Have the phone called. Answer on the headphones, talk for about 20 seconds, then hang up.
4. Do not touch the app. Wait up to 1 minute after the call and watch/listen: does the lesson continue by itself? Does it respond when you speak (say a few words in a sentence's wait and see whether the status line changes to "Listening to you…")?
5. If nothing continues, note it, then open the app and note what it shows (still the same sentence? sentence 1? the Start button?).
6. Tap **Copy log** and save it as `debug1.log` in the repo root. Write down the times (roughly) of the call start, the answer and the hang-up, to find them in the log.

Write down, for the results table:

| Question | Answer |
|---|---|
| Did the lesson audio continue by itself after the call? After how many seconds? | |
| Where did it continue (same clip from the start, next sentence, sentence 1)? | |
| Does the app still react to your speech after the call (status "Listening to you…")? | |
| Did sentences pass by during the call (the wait timers kept running)? | |
| Did the screen show anything about the interruption? | |

## Test 2: the call comes during a French or meaning clip

Repeat Test 1, but have the call arrive while a clip is playing (not in the wait). Same notes and log (`debug2.log`).

## Test 3: a longer call (about 2 minutes), screen locked

Start the lesson, lock the screen, have the phone called and talk for about 2 minutes, then hang up. This checks the worst case (iOS suspends or restarts the page). Afterwards, unlock the phone and note: is the lesson playing, frozen, or back at the start? Log in `debug3.log` if the app is still open and has one.

## Other interruptions (optional, a few minutes)

Run these with the lesson in a wait and note the same things as in Test 1:

- Ask Siri something and let it answer.
- A notification with a sound arrives (for example a message).
- Declining a call (the phone rings, then you decline).

## What to look for in the log

The log already records these events:

- `clip event: pause` or `silent event: pause` that the app did not cause (iOS paused the players).
- `MIC TRACK MUTED`, `mic track unmuted`, `MIC TRACK ENDED`.
- `audioContext: interrupted` or `closed` (a new state after a call is the mic's context).
- `watchdog: ... stalled` and `clip play() failed` (the app retrying).
- `page hidden` and `page visible`.
- `headphone button: ...`.

## After the test: decide

- **Playback and the mic both recover cleanly:** nothing to build. Record the result in `docs/app-spec.md` section 4 (row "Interruption" of the field test) and risk 5.
- **Playback recovers, the mic does not, or the lesson freezes:** build the small recovery: detect the interruption, pause the lesson (the pause code already freezes the timers), show "Interrupted. Tap to resume.", and on the tap restart the audio, reopen the mic and measure the noise again. One tap after a call is the aim; fully automatic recovery is not reliable on iOS.
- **Calls are rare for this user's use:** the alternative is to accept "tap Stop, then Start" after a call, and only record the result.
