import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  snapshotDir: "./e2e/snapshots",
  // Use platform-agnostic snapshot names for cross-platform compatibility
  snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      // Higher threshold for cross-platform font rendering differences
      maxDiffPixelRatio: 0.1,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Web server configuration
  // CI: uses production build (npm run start) - requires prior npm run build
  // Local: uses dev server (npm run dev) - hot reload, no build required
  // 
  // IMPORTANT: For E2E tests, set NEXT_PUBLIC_E2E_TEST_MODE=true at BUILD time
  // to disable CopilotKit's agent connection (which requires a real backend)
  // In CI, this is done in the workflow: NEXT_PUBLIC_E2E_TEST_MODE=true npm run build
  // Locally: NEXT_PUBLIC_E2E_TEST_MODE=true npm run dev
  webServer: {
    command: process.env.CI ? "npm run start" : "NEXT_PUBLIC_E2E_TEST_MODE=true npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
