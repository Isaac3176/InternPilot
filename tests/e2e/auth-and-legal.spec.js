import { expect, test } from "@playwright/test";
import { onboardFreshUser } from "./helpers.js";

test("forgot password returns a generic reset notice", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();

  await page.getByLabel("Email").fill("reset-smoke@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("If that email has an account, a password-reset link is on its way.");
});

test("public legal pages are reachable", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText("Last updated:")).toBeVisible();

  await page.goto("/terms.html");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await expect(page.getByText("AI Output And Job Data")).toBeVisible();
});

test("production health check reports release-critical surfaces", async ({ page }) => {
  await onboardFreshUser(page, "health-smoke@example.com");
  await page.goto("/settings");

  await page.getByRole("button", { name: "Run check" }).click();

  const health = page.locator(".prod-health");
  await expect(health.getByText("Cloud auth", { exact: true })).toBeVisible();
  await expect(health.getByText("CAPTCHA", { exact: true })).toBeVisible();
  await expect(health.getByText("Legal pages", { exact: true })).toBeVisible();
  await expect(health.getByText("Secure origin", { exact: true })).toBeVisible();
  await expect(health.getByText("Gmail web surface", { exact: true })).toBeVisible();
  await expect(health.locator(".prod-health-badge.ok")).toHaveCount(4);
  await expect(health.locator(".prod-health-badge.warn")).toHaveCount(1);
});
