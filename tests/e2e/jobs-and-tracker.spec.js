import { expect, test } from "@playwright/test";
import { enterDemoWorkspace, onboardFreshUser } from "./helpers.js";

test("saved job persists across refresh and appears in Applications", async ({ page }) => {
  await onboardFreshUser(page, "tracker-smoke@example.com");

  await page.goto("/internships");
  await expect(page.getByRole("heading", { name: "Software Engineer Intern" }).first()).toBeVisible();

  const selectedRole = (await page.locator(".detail-body h1").first().textContent())?.trim();
  await expect(page.locator(".detail-body h1").first()).not.toBeEmpty();
  await page.locator(".detail-head").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".detail-head").getByRole("button", { name: "Saved" })).toBeVisible();

  await page.reload();
  await expect(page.locator(".detail-head").getByRole("button", { name: "Saved" })).toBeVisible();

  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByText(selectedRole).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Interested" }).first()).toBeVisible();
});

test("demo apply queue opens Discover and can save a role", async ({ page }) => {
  await enterDemoWorkspace(page);

  await page.getByRole("button", { name: "Open Discover" }).click();
  await expect(page).toHaveURL(/\/internships/);
  await expect(page.locator(".detail-body h1").first()).toBeVisible();
  const selectedRole = (await page.locator(".detail-body h1").first().textContent())?.trim();

  await page.locator(".detail-head").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".detail-head").getByRole("button", { name: "Saved" })).toBeVisible();
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByText(selectedRole).first()).toBeVisible();
});
