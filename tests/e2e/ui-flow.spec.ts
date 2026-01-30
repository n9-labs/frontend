import { test, expect } from "@playwright/test";

/**
 * E2E tests for Expert Finder UI
 * 
 * These tests run with NEXT_PUBLIC_E2E_TEST_MODE=true which disables
 * CopilotKit's agent connection, allowing us to test the UI without
 * requiring a real backend.
 */

test.describe("Expert Finder Landing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays main heading and subtitle", async ({ page }) => {
    // Check main heading
    await expect(page.locator("h1")).toContainText("Who Do I Talk To?");

    // Check subtitle
    await expect(
      page.getByText("Find the right experts in OpenShift AI")
    ).toBeVisible();
  });

  test("displays search input", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      "Ask about any feature, team, or expert..."
    );
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeEnabled();
  });

  test("displays all suggested prompts", async ({ page }) => {
    await expect(page.getByText("Who owns Pipelines?")).toBeVisible();
    await expect(page.getByText("Model Serving experts")).toBeVisible();
    await expect(page.getByText("Dashboard team")).toBeVisible();
    await expect(page.getByText("Training & Fine-tuning")).toBeVisible();
  });

  test("search input accepts text", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      "Ask about any feature, team, or expert..."
    );
    
    await searchInput.fill("Who works on pipelines?");
    await expect(searchInput).toHaveValue("Who works on pipelines?");
  });

  test("suggested prompts are clickable buttons", async ({ page }) => {
    const pipelinesButton = page.locator('button:has-text("Who owns Pipelines?")');
    const modelServingButton = page.locator('button:has-text("Model Serving experts")');
    const dashboardButton = page.locator('button:has-text("Dashboard team")');
    const trainingButton = page.locator('button:has-text("Training & Fine-tuning")');

    await expect(pipelinesButton).toBeVisible();
    await expect(modelServingButton).toBeVisible();
    await expect(dashboardButton).toBeVisible();
    await expect(trainingButton).toBeVisible();
  });

  test("page has correct visual structure", async ({ page }) => {
    // Check the icon is displayed
    await expect(page.getByText("🔍")).toBeVisible();

    // Check "Suggested" label is visible
    await expect(page.getByText("Suggested")).toBeVisible();

    // Check the prompts are in a grid layout (4 prompts visible)
    const promptButtons = page.locator('button:has-text("Who owns Pipelines?"), button:has-text("Model Serving experts"), button:has-text("Dashboard team"), button:has-text("Training & Fine-tuning")');
    await expect(promptButtons).toHaveCount(4);
  });
});

test.describe("Chat Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("clicking suggested prompt navigates to chat", async ({ page }) => {
    // Click on a suggested prompt
    await page.click('button:has-text("Model Serving experts")');

    // Should now be in chat view - back button visible
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({
      timeout: 5000,
    });

    // Chat input should be visible
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });

  test("typing in search and submitting navigates to chat", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      "Ask about any feature, team, or expert..."
    );

    // Type a query
    await searchInput.fill("Who works on pipelines?");

    // Submit by pressing Enter
    await searchInput.press("Enter");

    // Should navigate to chat
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("back button returns to landing page", async ({ page }) => {
    // Navigate to chat
    await page.click('button:has-text("Dashboard team")');

    // Verify we're in chat
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({
      timeout: 5000,
    });

    // Click back button
    await page.click('button:has-text("Back")');

    // Should be back on landing page
    await expect(page.locator("h1")).toContainText("Who Do I Talk To?");
    await expect(
      page.getByPlaceholder("Ask about any feature, team, or expert...")
    ).toBeVisible();
  });

  test("initial message appears in chat", async ({ page }) => {
    // Click suggested prompt
    await page.click('button:has-text("Who owns Pipelines?")');

    // Wait for chat view
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // The initial message should appear in the chat
    // In test mode, we show the message in a copilotKitMessage div
    await expect(
      page.getByText("Data Science Pipelines", { exact: false })
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Chat Input Functionality", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Navigate to chat
    await page.click('button:has-text("Model Serving experts")');
    // Wait for chat view
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });
  });

  test("chat input accepts and displays user text", async ({ page }) => {
    const chatInput = page.getByPlaceholder("Type a message...");

    // Verify input is enabled
    await expect(chatInput).toBeEnabled();
    
    // Type a message
    await chatInput.fill("Tell me more about KServe");
    await expect(chatInput).toHaveValue("Tell me more about KServe");
  });

  test("chat input can be cleared and retyped", async ({ page }) => {
    const chatInput = page.getByPlaceholder("Type a message...");

    // Type, clear, and retype
    await chatInput.fill("First message");
    await expect(chatInput).toHaveValue("First message");
    
    await chatInput.clear();
    await expect(chatInput).toHaveValue("");
    
    await chatInput.fill("Second message");
    await expect(chatInput).toHaveValue("Second message");
  });
});

test.describe("Landing Page Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("search input has proper placeholder", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      "Ask about any feature, team, or expert..."
    );
    await expect(searchInput).toBeVisible();
  });

  test("submit button is present in search form", async ({ page }) => {
    // The search form should have a submit mechanism
    const submitButton = page.locator('form button[type="submit"], form button').first();
    await expect(submitButton).toBeVisible();
  });
});
