import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.mjs', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', channel: process.env.CI ? undefined : 'chrome', headless: true },
  webServer: { command: 'node tools/serve.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  reporter: 'list'
});
