import { expect, test } from "@playwright/test";
import { onboardFreshUser } from "./helpers.js";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body.scrollWidth) - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(2);
}

async function enterMobileDemoWorkspace(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try demo workspace" }).click();
  await expect(page.getByRole("heading", { name: /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i })).toBeVisible();
}

test("mobile onboarding keeps primary actions visible", async ({ page }) => {
  await onboardFreshUser(page, "mobile-onboarding@example.com");

  await expect(page.getByRole("heading", { name: /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jobs", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("mobile demo workspace can browse jobs and open a detail sheet", async ({ page }) => {
  await enterMobileDemoWorkspace(page);

  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  await expect(page.locator(".m-shell .job").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Jobs", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Browse" })).toHaveAttribute("aria-pressed", "true");
  await expectNoHorizontalOverflow(page);

  await page.locator(".m-shell .job").first().click();
  await expect(page.getByRole("dialog", { name: "Machine Learning Engineer Intern" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open & apply" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("mobile bottom navigation exposes core areas", async ({ page }) => {
  await enterMobileDemoWorkspace(page);

  for (const [button, heading] of [
    [/^Home$/, /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i],
    [/^Jobs$/, "Jobs"],
    [/^Tracker(\s+\d+)?$/, "Tracker"],
    [/^Toolkit$/, "Toolkit"],
    [/^Coach$/, "Coach"],
  ]) {
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("button", { name: button })).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalOverflow(page);
  }
});

test("mobile account sheet is exposed as a dialog", async ({ page }) => {
  await enterMobileDemoWorkspace(page);

  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("dialog", { name: "Demo Student" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign out/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
