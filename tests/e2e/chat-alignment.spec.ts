import { test, expect } from "@playwright/test";

/**
 * E2E tests for UI alignment and styling
 * 
 * These tests verify the visual layout and styling of the landing page.
 * Chat view tests are not included because they require a functioning
 * CopilotKit agent connection.
 */

test.describe("Landing Page Layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("search input and submit button are properly aligned", async ({ page }) => {
    // Get the search form container
    const searchForm = page.locator("form").first();
    await expect(searchForm).toBeVisible();

    // Get input and button
    const searchInput = page.getByPlaceholder(
      "Ask about any feature, team, or expert..."
    );
    const submitButton = page.locator("form button").first();

    const inputBox = await searchInput.boundingBox();
    const buttonBox = await submitButton.boundingBox();

    expect(inputBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();

    if (inputBox && buttonBox) {
      // Calculate vertical centers
      const inputCenter = inputBox.y + inputBox.height / 2;
      const buttonCenter = buttonBox.y + buttonBox.height / 2;

      // They should be roughly aligned (within 20px tolerance)
      const verticalDifference = Math.abs(inputCenter - buttonCenter);
      expect(verticalDifference).toBeLessThan(20);
    }
  });

  test("suggested prompts are displayed in a grid", async ({ page }) => {
    // Get all prompt buttons
    const prompts = page.locator('button:has-text("Who owns Pipelines?"), button:has-text("Model Serving experts"), button:has-text("Dashboard team"), button:has-text("Training & Fine-tuning")');
    
    await expect(prompts).toHaveCount(4);

    // Get bounding boxes to verify grid layout
    const boxes = await Promise.all([
      page.locator('button:has-text("Who owns Pipelines?")').boundingBox(),
      page.locator('button:has-text("Model Serving experts")').boundingBox(),
      page.locator('button:has-text("Dashboard team")').boundingBox(),
      page.locator('button:has-text("Training & Fine-tuning")').boundingBox(),
    ]);

    // All boxes should exist
    boxes.forEach(box => expect(box).not.toBeNull());

    // On wider screens, prompts should be in a 2-column grid
    // This means some prompts share the same Y position
    if (boxes[0] && boxes[1]) {
      // First two prompts might be on the same row
      const sameRow = Math.abs(boxes[0].y - boxes[1].y) < 10;
      // Or they might be stacked (on narrow screens)
      const stacked = boxes[1].y > boxes[0].y + boxes[0].height - 10;
      expect(sameRow || stacked).toBe(true);
    }
  });

  test("page is centered and has proper max width", async ({ page }) => {
    // The main content should be centered
    const heading = page.locator("h1");
    const headingBox = await heading.boundingBox();
    const viewportSize = page.viewportSize();

    expect(headingBox).not.toBeNull();
    expect(viewportSize).not.toBeNull();

    if (headingBox && viewportSize) {
      // Heading should be roughly centered (with some tolerance for asymmetric padding)
      const headingCenter = headingBox.x + headingBox.width / 2;
      const viewportCenter = viewportSize.width / 2;
      const offset = Math.abs(headingCenter - viewportCenter);
      
      // Should be within 100px of center
      expect(offset).toBeLessThan(100);
    }
  });

  test("search input is responsive", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      "Ask about any feature, team, or expert..."
    );
    const inputBox = await searchInput.boundingBox();
    const viewportSize = page.viewportSize();

    expect(inputBox).not.toBeNull();
    expect(viewportSize).not.toBeNull();

    if (inputBox && viewportSize) {
      // Input should take up a reasonable portion of the viewport
      const widthRatio = inputBox.width / viewportSize.width;
      // Should be at least 40% of viewport on desktop
      expect(widthRatio).toBeGreaterThan(0.4);
      // But not more than 90%
      expect(widthRatio).toBeLessThan(0.9);
    }
  });
});

// Visual regression tests are skipped by default because:
// 1. Snapshots differ between platforms (macOS vs Linux font rendering)
// 2. CI runs on Linux while local dev is often on macOS
// 3. Layout tests using bounding boxes are more reliable cross-platform
//
// To enable visual regression testing locally:
// 1. Uncomment the test below
// 2. Run: npx playwright test --update-snapshots
// 3. Commit the snapshots for your platform
//
// test.describe("Visual Regression", () => {
//   test("landing page layout matches expected design", async ({ page }) => {
//     await page.goto("/");
//     await page.waitForTimeout(500);
//     const mainContent = page.locator("main");
//     await expect(mainContent).toHaveScreenshot("landing-page-layout.png");
//   });
// });
