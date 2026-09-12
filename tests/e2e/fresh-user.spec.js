import { expect, test } from "@playwright/test";

test("fresh user completes onboarding and sees tailored Browse jobs", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill("smoke@example.com");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-42");
  await page.getByLabel("Confirm password").fill("correct-horse-42");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "What kind of jobs are you looking for?" })).toBeVisible();
  await page.getByRole("button", { name: "Software Engineer" }).click();
  await page.getByRole("button", { name: "Machine Learning Engineer" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Junior" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Within 6 months" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Locations").fill("Remote in USA");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "What locations do you want to work in?" }).click();
  await page.getByRole("button", { name: "Remote", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Skip resume for now" }).click();

  await page.locator(".field", { hasText: "Are you authorized to work in the U.S.?" }).getByRole("button", { name: "Yes" }).click();
  await page.locator(".field", { hasText: "Will you need visa sponsorship" }).getByRole("button", { name: "No" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  await page.goto("/internships");
  await expect(page.locator(".target-summary")).toContainText("Software Engineer");
  await expect(page.locator(".target-summary")).toContainText("Summer 2027");
  await expect(page.getByRole("heading", { name: "Software Engineer Intern" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Machine Learning Engineer Intern" }).first()).toBeVisible();
  await expect(page.getByText("Senior Data Scientist Intern")).toHaveCount(0);

  await page.locator(".detail-head").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".detail-head").getByRole("button", { name: "Saved" })).toBeVisible();
});
