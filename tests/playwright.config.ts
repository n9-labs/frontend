import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  snapshotDir: "./e2e/snapshots",
  snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}",
  
  // Parallelization - run tests in parallel for speed
  fullyParallel: true,
  
  // CI-specific settings
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,  // Reduced from 2 to 1 retry
  workers: process.env.CI ? 2 : undefined,  // Increased from 1 to 2 parallel workers
  
  // Reporter
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  
  // Timeouts - reduced for faster failure detection
  timeout: 15000,  // Reduced from 30s to 15s per test
  expect: {
    timeout: 5000,  // 5s for assertions
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.1,
    },
  },
  
  // Browser settings
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Speed optimizations
    launchOptions: {
      args: ["--disable-gpu", "--no-sandbox"],
    },
  },
  
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  
  // Web server configuration
  webServer: {
    command: process.env.CI ? "npm run start" : "NEXT_PUBLIC_E2E_TEST_MODE=true npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,  // Reduced from 120s to 60s
  },
});
