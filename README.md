# Morning Lesson

A mobile-friendly app for learning spoken French by shadowing: you hear a sentence, repeat it out loud, then hear its English meaning. It runs hands-free, so you can put on headphones, lock the phone and go for a walk.

Live app: https://nhv96.github.io/moles/ (open it on an iPhone and add it to the home screen).

Status: the prototype works and is concluded (lesson 1 tested on a walk, with Bluetooth headphones and mic, and with the screen locked). Interruptions such as phone calls are not tested yet; see `docs/interruption-test-plan.md`.

## How it works

1. The French sentence plays.
2. The app listens to the mic and waits for you to repeat it (3 seconds of silence after you speak, or at most 15 seconds).
3. The English meaning plays, then the next sentence starts.
4. After the last sentence, a spoken cue says the lesson is finished.

## Project layout

| Folder | What is in it |
|---|---|
| `app/` | The PWA (Vite + vanilla TypeScript). See `app/README.md` for commands. |
| `content/` | Lesson text and the scripts that generate the audio (Kokoro text-to-speech). Built audio is in `content/build/` and is committed. |
| `docs/` | The plans and decisions (see below). |
| `headphone-test.html`, `mic-test.html` | Early single-file spikes used to test headphone buttons and the mic on iOS. |

## Docs

- `docs/app-spec.md`: what the app is, the agreed scope, and the risks.
- `docs/content-decision.md`: how the lesson content is designed (sentence length, speed, voices).
- `docs/prototype-plan.md`: the task list for the prototype, with results and the deferred ideas.
- `docs/interruption-test-plan.md`: the phone-call test to run later.

## Develop

```bash
cd app
npm install
npm run dev
cloudflared tunnel --url http://localhost:5173   # in another terminal, for HTTPS on the phone
```

More detail, and the release flow, is in `app/README.md` and `AGENTS.md`.

## Deploy

Pull requests run lint, format check, tests and the build. A merge to `main` deploys to GitHub Pages only when `app/`, `content/build/` or the workflow file changed. Docs-only merges do not deploy.
