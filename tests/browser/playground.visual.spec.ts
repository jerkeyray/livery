import { expect, test } from "@playwright/test";

test("desktop studio and timeline states remain visually coherent", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  const figure = page.getByRole("img", { name: /Checkout request/ });
  await expect(figure).toBeVisible();
  await expect(figure).toHaveAttribute("viewBox", "0 0 760 274");
  await expect(figure.locator("title")).toHaveCount(0);
  await expectNoViewportOverflow(page);
  await expect(page).toHaveScreenshot("playground-desktop.png", { animations: "disabled" });

  await figure.evaluate((svg) => {
    const state = window as typeof window & { __liveryRoot?: Element; __liveryCustomer?: Element | null };
    state.__liveryRoot = svg;
    state.__liveryCustomer = svg.querySelector('[data-livery-id="customer"]');
  });

  await page.getByRole("button", { name: "authorization", exact: true }).click();
  expect(await figure.evaluate((svg) => {
    const state = window as typeof window & { __liveryRoot?: Element; __liveryCustomer?: Element | null };
    return state.__liveryRoot === svg && state.__liveryCustomer === svg.querySelector('[data-livery-id="customer"]');
  })).toBe(true);
  await expect(figure.locator('[data-livery-id="payment"]')).toHaveAttribute("data-livery-focused", "true");
  await expect(figure.locator('[data-livery-connector="authorize"]')).toHaveAttribute("data-livery-traced", "true");
  await expect(figure.locator('[data-livery-connector="persist"]')).toHaveAttribute("opacity", "0");
  await expect(figure.locator('[data-livery-id="customer"]')).toHaveAttribute("opacity", "0.62");
  await expect(page).toHaveScreenshot("playground-authorization.png", { animations: "disabled" });

  await page.getByRole("button", { name: "request", exact: true }).click();
  await expect(figure.locator('[data-livery-connector="authorize"]')).toHaveAttribute("opacity", "0");
  await expect(figure.locator('[data-livery-id="payment"]')).toHaveAttribute("opacity", "0");

  await page.getByRole("button", { name: "complete", exact: true }).click();
  await expect(figure.locator('[data-livery-connector="persist"] path')).toHaveAttribute("stroke", "#15803d");
});

test("chat output reflows without clipping", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  const figure = page.getByRole("img", { name: /Checkout request/ });
  await expect(figure).toHaveAttribute("viewBox", "0 0 360 490");
  await expectNoViewportOverflow(page);
  await expect(page).toHaveScreenshot("checkout-chat.png", { animations: "disabled" });
});

test("mobile studio exposes source and preview as dedicated tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Preview" })).toBeVisible();
  await expect(page.getByLabel("Livery source editor")).not.toBeVisible();
  await page.getByRole("tab", { name: "Source" }).click();
  await expect(page.getByLabel("Livery source editor")).toBeVisible();
  await expectNoViewportOverflow(page);
  await expect(page).toHaveScreenshot("playground-mobile-source.png", { animations: "disabled" });
});

test("example figures replace source and render their own timelines", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const selector = page.getByLabel("Example figure");
  for (const [value, title] of [
    ["mechanism", "Valve mechanism"],
    ["data-transform", "Packet transformation"],
    ["scientific", "Orbital phase"],
    ["agent-trace", "Agent tool trace"],
    ["protocol", "Request protocol"],
    ["checkout", "Checkout request"],
  ] as const) {
    await selector.selectOption(value);
    await expect(selector).toHaveValue(value);
    await expect(page.getByRole("img", { name: title })).toBeVisible();
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  }
  await selector.selectOption("scientific");
  await expect(page.getByRole("button", { name: "quarter", exact: true })).toBeVisible();
});

for (const width of [320, 480, 720, 1024]) {
  test(`quality gallery remains coherent at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: Math.max(1180, width + 96), height: 900 });
    await page.goto(`/?gallery=1&width=${width}`);
    await expect(page.getByText(`${width}px logical width`)).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(5);
    for (const figure of await page.getByRole("img").all()) {
      await expect(figure).toHaveAttribute("viewBox", new RegExp(`^0 0 ${width} `));
    }
    await expectNoViewportOverflow(page);
    await expect(page).toHaveScreenshot(`quality-gallery-${width}.png`, { animations: "disabled", fullPage: true });
  });
}

async function expectNoViewportOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
}
