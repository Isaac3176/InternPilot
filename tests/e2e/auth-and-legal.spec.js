import { expect, test } from "@playwright/test";

test("forgot password returns a generic reset notice", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();

  await page.getByLabel("Email").fill("reset-smoke@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("If that email has an account, a password-reset link is on its way.")).toBeVisible();
});

test("public legal pages are reachable", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText("Last updated:")).toBeVisible();

  await page.goto("/terms.html");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await expect(page.getByText("AI Output And Job Data")).toBeVisible();
});
