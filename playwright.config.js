// @ts-check
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // Tests run against the built app, exactly as it ships. Run `npm run build` first (npm run test:e2e does).
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI
  },
  use: {
    ...devices["Pixel 7"],
    browserName: "chromium",
    baseURL: "http://localhost:4173",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    serviceWorkers: "block",
    trace: "retain-on-failure"
  }
});
