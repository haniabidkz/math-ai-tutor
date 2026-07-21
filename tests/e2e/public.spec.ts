import { expect, test } from "@playwright/test";

test("public home and login routes render without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Master Math/i })).toBeVisible();
    await expect(page.locator("body")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

    await page.goto("/login?role=student");
    await expect(page.getByText("Welcome Back", { exact: true })).toBeVisible();
});

test("protected assessment APIs reject anonymous requests", async ({ request }) => {
    const quiz = await request.post("/api/quiz", { data: { microTag: "c6-integers-intro", classLevel: 6 } });
    expect(quiz.status()).toBe(401);
    const progress = await request.get("/api/progress");
    expect(progress.status()).toBe(401);
    const admin = await request.get("/api/admin/overview");
    expect(admin.status()).toBe(401);
});

test("verified demo student reaches the seeded learning flow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "One authenticated smoke run is sufficient");
    await page.goto("/login?role=student");
    await page.getByLabel("Email").fill("student@demo.com");
    await page.getByLabel("Password").fill("Demo@1234");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/(placement|dashboard)/, { timeout: 20_000 });
    await expect(page.getByText(/Diagnostic|Jaiza|Welcome|Khush amdeed/).first()).toBeVisible({ timeout: 20_000 });
    if (await page.getByText(/Diagnostic|Jaiza/).count()) {
        await expect(page.getByText("1 / 24")).toBeVisible();
    }
});
