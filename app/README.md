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

`npm run dev` and `npm run build` first copy the built lesson audio from `../content/build` into `public/lessons/` (git-ignored).

- `/speech-test.html` (dev only): shows the mic level and the speech detector, for tuning and outdoor tests.
- `/audio-test.html` (dev only): plays lesson 1 with the state machine and audio module, for screen-locked tests.

## Open on the iPhone (HTTPS)

```bash
npm run dev
cloudflared tunnel --url http://localhost:5173   # in another terminal
```

Open the printed `https://*.trycloudflare.com` URL on the phone.
