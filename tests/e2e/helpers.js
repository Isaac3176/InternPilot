import { expect } from "@playwright/test";

export async function createAccount(page, email = "smoke@example.com") {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-42");
  await page.getByLabel("Confirm password").fill("correct-horse-42");
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function completeTargetedOnboarding(page) {
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
}

export async function onboardFreshUser(page, email = "smoke@example.com") {
  await createAccount(page, email);
  await completeTargetedOnboarding(page);
}

export async function enterDemoWorkspace(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try demo workspace" }).click();
  await expect(page.getByText("Demo workspace").first()).toBeVisible();
}
