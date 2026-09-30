import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  webServer: { command: 'bun run build && bunx serve _site -l 4173', port: 4173, reuseExistingServer: !process.env.CI },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
