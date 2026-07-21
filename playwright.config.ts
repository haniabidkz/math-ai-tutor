import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    retries: 1,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:3111",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [
        { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    ],
    webServer: {
        command: "npm run start -- -p 3111",
        url: "http://127.0.0.1:3111",
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
