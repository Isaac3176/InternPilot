import { expect, test } from "@playwright/test";
import { onboardFreshUser } from "./helpers.js";

test("fresh user completes onboarding and sees tailored Browse jobs", async ({ page }) => {
  await onboardFreshUser(page);

  await page.goto("/internships");
  await expect(page.locator(".target-summary")).toContainText("Software Engineer");
  await expect(page.locator(".target-summary")).toContainText("Summer 2027");
  await expect(page.getByRole("heading", { name: "Software Engineer Intern" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Machine Learning Engineer Intern" }).first()).toBeVisible();
  await expect(page.getByText("Senior Data Scientist Intern")).toHaveCount(0);

  await page.locator(".detail-head").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".detail-head").getByRole("button", { name: "Saved" })).toBeVisible();
});
