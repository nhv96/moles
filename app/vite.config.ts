import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The site lives under a path on GitHub Pages (for example /moles/); the
  // deploy workflow sets BASE_PATH. Locally it is the root.
  base: process.env.BASE_PATH ?? '/',
  server: {
    host: true,
    // Allow the Cloudflare quick tunnel hostname (*.trycloudflare.com).
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    environment: 'node',
  },
});
