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

  test("chat view initializes correctly after clicking prompt", async ({ page }) => {
    // Navigate to chat via suggested prompt
    await page.click('button:has-text("Who owns Pipelines?")');

    // Wait for chat view to be ready
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // Verify the chat interface is properly initialized
    // Check that we're in chat view (back button visible)
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    
    // Check that the messages container exists
    const messagesContainer = page.locator('[class*="copilotKit"], [class*="Messages"], [class*="messages"]');
    await expect(messagesContainer.first()).toBeVisible({ timeout: 5000 });
    
    // Verify input is functional
    const chatInput = page.getByPlaceholder("Type a message...");
    await expect(chatInput).toBeEnabled();
  });
});

test.describe("Chat Input Functionality", () => {
  test("chat input accepts and displays user text", async ({ page }) => {
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
    
    // Type a message
    await chatInput.fill("Tell me more about KServe");
    await expect(chatInput).toHaveValue("Tell me more about KServe");
  });

  test("chat input can be cleared and retyped", async ({ page }) => {
    // Setup mock
    await setupCopilotKitMock(page, {
      responseText: "I can help you.",
      delayMs: 50,
    });

    await page.goto("/");

    // Navigate to chat
    await page.click('button:has-text("Dashboard team")');

    // Wait for chat view
    const chatInput = page.getByPlaceholder("Type a message...");
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Type, clear, and retype
    await chatInput.fill("First message");
    await expect(chatInput).toHaveValue("First message");
    
    await chatInput.clear();
    await expect(chatInput).toHaveValue("");
    
    await chatInput.fill("Second message");
    await expect(chatInput).toHaveValue("Second message");
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
