import { defineConfig, devices } from '@playwright/test';

// The five projects from docs/upgrade/09_ACCEPTANCE_AND_QA.md §6.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
    },
    {
      name: 'mobile-light',
      use: { ...devices['iPhone 15'], viewport: { width: 390, height: 844 }, colorScheme: 'light' },
    },
    {
      name: 'mobile-reduced',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        colorScheme: 'light',
        reducedMotion: 'reduce',
      },
    },
    {
      name: 'firefox-fallback',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' },
    },
  ],
});
