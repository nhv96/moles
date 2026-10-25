import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: true,
    // Allow the Cloudflare quick tunnel hostname (*.trycloudflare.com).
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    environment: 'node',
  },
});
