import { expect, test } from "@playwright/test";
import { enterDemoWorkspace } from "./helpers.js";

test("visitor can enter and leave the demo workspace", async ({ page }) => {
  await enterDemoWorkspace(page);
  await expect(page.getByText("Explore with sample data")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fast Apply" })).toBeVisible();

  await page.getByRole("link", { name: /Tracker/ }).click();
  await expect(page.getByText("DeepMind")).toBeVisible();
  await expect(page.getByText("Machine Learning Engineer Intern")).toBeVisible();

  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try demo workspace" })).toBeVisible();
});
