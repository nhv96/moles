# app

French shadowing PWA. Vite + vanilla TypeScript.

```bash
npm install
npm run dev          # dev server on :5173
npm test             # Vitest
npm run lint         # ESLint
npm run format       # Prettier
npm run build        # type-check + production build
```

`npm run dev` and `npm run build` first copy the built lesson audio from `../content/build` into `public/lessons/` (git-ignored). The copy starts from `index.json`, and stops with the name of any file that is missing.

- `/` is the lesson screen: it reads `lessons/index.json`, shows a language pair dropdown and the lessons of that pair, and loads the chosen one. Start then runs it with the mic and audio.
- `/speech-test.html` (dev only): shows the mic level and the speech detector, for tuning and outdoor tests.
- `/audio-test.html` (dev only): plays lesson 1 with the state machine and audio module, for screen-locked tests.

## Open on the iPhone (HTTPS)

```bash
npm run dev
cloudflared tunnel --url http://localhost:5173   # in another terminal
```

Open the printed `https://*.trycloudflare.com` URL on the phone.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` checks the app and, on every push to `main`, deploys it to `https://nhv96.github.io/moles/`. The lesson audio is taken from `../content/build` (committed). To try the Pages build locally: `BASE_PATH=/moles/ npm run build && npm run preview`.
