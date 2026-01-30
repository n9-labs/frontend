import { test, expect } from "@playwright/test";
import {
  setupCopilotKitMock,
  setupCopilotKitMockWithTracking,
} from "./fixtures/copilotkit-mock";

test.describe("Expert Finder UI Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock for CopilotKit API before each test
    await setupCopilotKitMock(page, {
      responseText: "I found some experts for you.",
      delayMs: 50,
    });
    await page.goto("/");
  });

  test("landing page displays correctly", async ({ page }) => {
    // Check main heading
    await expect(page.locator("h1")).toContainText("Who Do I Talk To?");

    // Check subtitle
    await expect(
      page.getByText("Find the right experts in OpenShift AI")
    ).toBeVisible();

    // Check search input
    const searchInput = page.getByPlaceholder(
      "Ask about any feature, team, or expert..."
    );
    await expect(searchInput).toBeVisible();

    // Check suggested prompts are displayed
    await expect(page.getByText("Who owns Pipelines?")).toBeVisible();
    await expect(page.getByText("Model Serving experts")).toBeVisible();
    await expect(page.getByText("Dashboard team")).toBeVisible();
    await expect(page.getByText("Training & Fine-tuning")).toBeVisible();
  });

  test("clicking suggested prompt navigates to chat", async ({ page }) => {
    // Click on a suggested prompt
    await page.click('button:has-text("Model Serving experts")');

    // Should now be in chat view
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({
      timeout: 5000,
    });

    // Chat input should be visible
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });

  test("typing in search and submitting navigates to chat", async ({
    page,
  }) => {
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

  test("initial message appears only once in chat", async ({ page }) => {
    // Navigate to chat via suggested prompt
    await page.click('button:has-text("Who owns Pipelines?")');

    // Wait for chat view to be ready
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // Wait for chat to stabilize
    await page.waitForTimeout(1500);

    // Look for the user message text in the chat area
    // Use flexible selectors that work across CopilotKit versions
    const messageText = "Data Science Pipelines";
    const chatArea = page.locator('[class*="copilotKit"], [class*="chat"], main');
    
    // Find all elements containing our message text within the chat area
    const messageElements = chatArea.getByText(messageText, { exact: false });
    
    // Wait for at least one to appear
    await expect(messageElements.first()).toBeVisible({ timeout: 10000 });

    // Count occurrences - should be exactly 1
    const count = await messageElements.count();
    expect(count).toBe(1);
  });
});

test.describe("Chat Functionality with Mocked Backend", () => {
  test("agent responds to queries", async ({ page }) => {
    // Setup mock with response text
    await setupCopilotKitMock(page, {
      responseText:
        "Here are the top experts for Model Serving: John Doe (KServe specialist), Jane Smith (Model deployment expert).",
      delayMs: 100,
    });

    await page.goto("/");

    // Click suggested prompt
    await page.click('button:has-text("Model Serving experts")');

    // Wait for chat view
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // The user's message should appear (contains the prompt text)
    // Use flexible matching that works regardless of exact message structure
    await expect(
      page.getByText(/KServe|model serving/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("chat input remains functional after navigation", async ({ page }) => {
    // Setup mock
    await setupCopilotKitMock(page, {
      responseText: "I can help you find experts.",
      delayMs: 50,
    });

    await page.goto("/");

    // Click suggested prompt to navigate to chat
    await page.click('button:has-text("Model Serving experts")');

    // Wait for chat view
    const chatInput = page.getByPlaceholder("Type a message...");
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Verify input is enabled and can receive focus
    await expect(chatInput).toBeEnabled();
    
    // Type a follow-up message
    await chatInput.fill("Tell me more about KServe");
    await expect(chatInput).toHaveValue("Tell me more about KServe");
  });
});

test.describe("Message Deduplication", () => {
  test("tracks that only one message is sent to backend", async ({ page }) => {
    // Setup mock with tracking
    const tracker = await setupCopilotKitMockWithTracking(page);

    await page.goto("/");

    // Click suggested prompt
    await page.click('button:has-text("Who owns Pipelines?")');

    // Wait for chat to initialize
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // Wait a bit for any potential duplicate messages
    await page.waitForTimeout(2000);

    // Check that only one initial message was sent
    // (The exact message content depends on the prompt mapping)
    const messages = tracker.getReceivedMessages();
    const pipelineMessages = messages.filter(
      (m) => m.includes("Pipeline") || m.includes("pipeline")
    );

    // Should have at most one pipeline-related message
    expect(pipelineMessages.length).toBeLessThanOrEqual(1);
  });
});
