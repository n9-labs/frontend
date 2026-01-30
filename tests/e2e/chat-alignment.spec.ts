import { test, expect } from "@playwright/test";
import { setupCopilotKitMock } from "./fixtures/copilotkit-mock";

test.describe("Chat Input Alignment", () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock for CopilotKit API
    await setupCopilotKitMock(page, {
      responseText: "I found some experts for your query.",
      delayMs: 50,
    });

    await page.goto("/");
    // Navigate to chat view
    await page.click('button:has-text("Model Serving experts")');
    // Wait for chat to load
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });

  test("textarea and submit button are vertically centered", async ({
    page,
  }) => {
    // Get the input container
    const inputContainer = page.locator(".copilotKitInput");
    await expect(inputContainer).toBeVisible();

    // Get textarea and button bounding boxes
    const textarea = page.locator(".copilotKitInput textarea");
    const submitButton = page
      .locator(".copilotKitInputControlButton, .copilotKitInput button")
      .first();

    const textareaBox = await textarea.boundingBox();
    const buttonBox = await submitButton.boundingBox();

    expect(textareaBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();

    if (textareaBox && buttonBox) {
      // Calculate vertical centers
      const textareaCenter = textareaBox.y + textareaBox.height / 2;
      const buttonCenter = buttonBox.y + buttonBox.height / 2;

      // They should be roughly aligned (within 20px tolerance)
      const verticalDifference = Math.abs(textareaCenter - buttonCenter);
      expect(verticalDifference).toBeLessThan(20);
    }
  });

  test("chat input container has proper styling", async ({ page }) => {
    const inputContainer = page.locator(".copilotKitInput");

    // Check that container uses flexbox for alignment
    const display = await inputContainer.evaluate(
      (el) => window.getComputedStyle(el).display
    );
    expect(display).toBe("flex");

    // Check items are centered
    const alignItems = await inputContainer.evaluate(
      (el) => window.getComputedStyle(el).alignItems
    );
    expect(alignItems).toBe("center");
  });

  test("submit button is positioned at the right side", async ({ page }) => {
    const inputContainer = page.locator(".copilotKitInput");
    const submitButton = page
      .locator(".copilotKitInputControlButton, .copilotKitInput button")
      .first();

    const containerBox = await inputContainer.boundingBox();
    const buttonBox = await submitButton.boundingBox();

    expect(containerBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();

    if (containerBox && buttonBox) {
      // Button should be on the right side of the container
      const containerRight = containerBox.x + containerBox.width;
      const buttonRight = buttonBox.x + buttonBox.width;

      // Button's right edge should be close to container's right edge (within padding)
      expect(containerRight - buttonRight).toBeLessThan(50);
    }
  });

  test("textarea is responsive and fills available space", async ({ page }) => {
    const inputContainer = page.locator(".copilotKitInput");
    const textarea = page.locator(".copilotKitInput textarea");

    const containerBox = await inputContainer.boundingBox();
    const textareaBox = await textarea.boundingBox();

    expect(containerBox).not.toBeNull();
    expect(textareaBox).not.toBeNull();

    if (containerBox && textareaBox) {
      // Textarea should take up most of the container width (at least 70%)
      const widthRatio = textareaBox.width / containerBox.width;
      expect(widthRatio).toBeGreaterThan(0.7);
    }
  });

  test("chat input is visible and accessible", async ({ page }) => {
    // Textarea should be visible
    const textarea = page.getByPlaceholder("Type a message...");
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();

    // Should be able to type in it
    await textarea.fill("Test message");
    await expect(textarea).toHaveValue("Test message");

    // Submit button should be visible
    const submitButton = page
      .locator(".copilotKitInputControlButton, button[name='Send']")
      .first();
    await expect(submitButton).toBeVisible();
  });

  test.describe("Visual Regression", () => {
    // Visual regression tests compare screenshots
    // Note: Snapshots may differ between platforms (macOS vs Linux)
    // Update snapshots with: npm run test:e2e:update-snapshots

    test("chat input area matches expected layout", async ({ page }) => {
      // Take a screenshot of the input area for visual comparison
      const inputContainer = page.locator(".copilotKitInput");

      // Ensure it's fully rendered
      await page.waitForTimeout(500);

      // Take screenshot (will be compared against baseline)
      // Use higher threshold in CI due to font rendering differences
      await expect(inputContainer).toHaveScreenshot("chat-input-alignment.png", {
        maxDiffPixelRatio: process.env.CI ? 0.1 : 0.02,
      });
    });
  });
});
