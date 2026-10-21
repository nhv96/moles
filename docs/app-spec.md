# Hands-Free French Listening App: Agreed Scope (MVP v1)

Status as of 2026-10-20. Items are marked **Decided**, **Proposed** (suggested, not yet confirmed) or **Open**.

## 1. Idea

A mobile-friendly app for learning spoken French by *shadowing*: you hear a sentence, repeat it out loud as many times as you like, then hear its meaning. You never need to look at or touch the phone. You put on headphones, go for a walk, and listen and speak.

- Side project for personal use. If it helps your learning, it may be published to other users later.
- Motivation: Duolingo needs you to hold and look at the phone. Its lessons are AI-generated, drift from real-life situations, are spoken too fast, often have wrong pronunciation, and its "slow playback" button only slows the audio instead of breaking the sentence into correctly pronounced pieces.
- The learner is a French beginner with strong English (understands about 95% of everyday conversation).

## 2. Product features (MVP v1)

### Content (Decided)
- One lesson, in French, with English meanings. First lesson: introducing yourself.
- About 10 sentences, 6 to 10 words each, about 5 seconds of audio each.
- Sentences always play in the same order. No daily refresh and no spaced repetition yet.
- The meaning is spoken in English (the user's chosen language), at a steady pace, about 5 seconds long, with no "it means..." prefix.

### Per-sentence loop (Decided)
1. The French sentence plays.
2. The app waits for you to speak. Each time you speak, it pauses and keeps waiting.
3. After 3 seconds of silence, the English meaning plays. The meaning cannot be interrupted, and speech during it is ignored.
4. If you never speak, the meaning plays after 15 seconds.
5. The next sentence starts.
6. After the last sentence, a spoken cue says the lesson is finished, then the app stops until you start a lesson again.

### Controls
- **Start:** a button on the screen starts the lesson (Decided). After that, it runs hands-free.
- **Voice commands in English, "repeat" and "next" (Decided as the goal):**
  - "Repeat" replays the French sentence, then the loop continues.
  - "Next" skips the meaning and goes to the next sentence.
  - Commands are ignored while the meaning plays.
- **Headphone button fallback (Decided):** the buttons do the same jobs as the voice commands.
- **Proposed:** ship the MVP with headphone-button controls first and add voice commands in a second step, because recognizing the words in a browser is the least proven part.

### Developer settings screen (Decided)
Visible in development mode only. It lets you tweak values live without rebuilding: silence length (3s), maximum wait (15s), speech threshold, meaning voice speed, and so on.

### No grading (Decided)
No scores, no right or wrong, no streaks, no progress tracking. You can start a new lesson without finishing the current one.

### Deliberately out of scope for now
Replaying the French after the meaning (revisit after real use), daily refresh, spaced repetition, Swedish, multiple lessons, publishing to other users.

## 3. Tech stack

### Decided
- **Web app (PWA)** opened on the iPhone, with no native app for the MVP. Reasons: you develop on Linux and have no Mac, and you have never built a mobile app.
- **TypeScript** for the app (you have used it before).
- **Static hosting over HTTPS.** HTTPS is required for microphone access on iPhone. Options: GitHub Pages, Cloudflare Pages or Netlify, or a temporary tunnel (`cloudflared`) during development.
- **Go** for the content pipeline (fetching sentences, cutting audio, generating lesson files).

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

## 4. Test results so far (iPhone, iOS 18.7, Safari and Opera Touch)

A single test page was used. It beeped every 3 seconds, showed a mic level, requested a wake lock, and logged headphone button presses.

| Question | Result |
|---|---|
| Mic and audio playback with the screen locked, phone in pocket | **Worked for about 10 minutes** (chores plus walking outside). The beeps never stopped, and speech was detected throughout. |
| Headphone buttons | **Work.** They arrive as play and pause events (next and previous were not tested). |
| Mic track muted or ended while locked | **No.** |
| Fixed speech threshold | **Not reliable.** Speech levels ranged from 0.004 to 0.06 depending on the situation, so a fixed threshold won't hold up outdoors. |
| Timer accuracy while the page is hidden | **Probably coarser** (events land on whole seconds, suggesting about a 1 second tick). This is an interpretation and was not confirmed. |
| Beep quality on Bluetooth headphones with the mic active | **Good.** Clear, not loud. (Beeps only; French speech and the meaning voice are untested.) |
| Beep volume in the mic-first order | **Clearly quieter with the mic's echo cancellation, noise suppression and auto gain on; good with them off** (tested in Safari). Probably iOS voice processing. It may still be slightly quieter than audio-first, but good enough. |
| First run after granting mic permission | **Bug, reproduced.** With audio started before the mic permission, the beep played once, then nothing. The page received no pause, stalled or ended event, and still reported the audio as playing. With "mic first" ticked, the beeps repeated normally. The two runs also differed in input device (iPhone microphone vs the Bluetooth headset's microphone), and earlier, a plain refresh also made the old order work. Follow-up (3 more runs, all in Opera Touch): the stall reproduced in both fresh runs with the old order, with either microphone, so it is not tied to the input device or to a first-time-only effect. The clip was stuck at its end (3.00s of a 3s loop) while the permission dialog was open, and a watchdog restart fixed it after about 3 seconds. With mic first, no stall occurred. This is the likely cause, but not proven. |

## 5. Limitations and risks

1. **Platform risk.** Background audio and mic behavior in iOS web apps is controlled by Apple and may change.
2. **Noise.** Wind, traffic and chores can look like speech, so the app might wait for a sentence to end that never ends. The 15-second fallback covers it.
3. **Voice commands** are unproven in the browser.
4. **Bluetooth headphones** often drop to phone-call audio quality while the mic is active. In the test, the beeps stayed clear on the user's Bluetooth headphones. Real speech and the meaning voice still need checking.
5. **Interruptions** (phone call, Siri, notification) can stop audio and the mic. The app must detect this and resume cleanly. Untested.
6. **Long sessions and battery.** Only 10 minutes have been tested. A 30-minute test, with a check of battery use, is still pending.
7. **Content quality and pronunciation.** A beginner can't judge French pronunciation, so a native speaker should review a sample of the lesson audio.
8. **Apple Developer account.** Not needed for the web app. A native app would need a paid account (about $99/year, to be verified) and cloud builds.
9. **Silent playback stall.** Playback can get stuck without any event if the mic permission dialog is open when the clip's loop point passes. Mic-first order and a watchdog address it (see section 3).
10. **Which microphone iOS uses varies.** With the same headphones on, one run used the headset's mic and another the iPhone's built-in mic. The app must work with either and should log which one is active.
11. **Playback volume** drops if the mic's voice processing is left on (see section 4). Keep it off.

## 6. Next step

Settle the content source: where the French sentences and audio come from. See `handoff-content.md`.