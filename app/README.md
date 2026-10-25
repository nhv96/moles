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

## Open on the iPhone (HTTPS)

```bash
npm run dev
cloudflared tunnel --url http://localhost:5173   # in another terminal
```

Open the printed `https://*.trycloudflare.com` URL on the phone.
