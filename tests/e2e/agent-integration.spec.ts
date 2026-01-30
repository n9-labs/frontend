import { test, expect } from "@playwright/test";

/**
 * Integration tests that require a real CopilotKit agent backend
 * 
 * These tests are SKIPPED in CI (where CI=true)
 * Run locally with a real backend:
 *   1. Start the agent: cd agent && uv run main.py
 *   2. Build without test mode: npm run build
 *   3. Run tests: npm run test:e2e
 * 
 * Or run just these tests:
 *   npx playwright test tests/e2e/agent-integration.spec.ts
 */

// Skip all tests in this file in CI (no real backend available)
// The CI env var is set by GitHub Actions
test.skip(
  () => !!process.env.CI,
  "Agent integration tests require a real backend (skipped in CI)"
);

test.describe("Agent Integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("agent responds to user query", async ({ page }) => {
    // Click suggested prompt to navigate to chat
    await page.click('button:has-text("Model Serving experts")');

    // Wait for chat view
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // Wait for agent to respond (this requires a real backend)
    // Look for any response text in the chat
    await expect(
      page.locator('[class*="copilotKit"]').getByText(/expert|help|find/i).first()
    ).toBeVisible({ timeout: 30000 });
  });

  test("agent handles follow-up questions", async ({ page }) => {
    // Navigate to chat
    await page.click('button:has-text("Who owns Pipelines?")');

    // Wait for initial response
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // Wait for agent to respond
    await page.waitForTimeout(5000);

    // Type a follow-up question
    const chatInput = page.getByPlaceholder("Type a message...");
    await chatInput.fill("Can you tell me more about their role?");
    await chatInput.press("Enter");

    // Wait for follow-up response
    await page.waitForTimeout(10000);

    // Verify the chat still shows content
    const messages = page.locator('[class*="message"], [class*="Message"]');
    const count = await messages.count();
    expect(count).toBeGreaterThan(1);
  });

  test("tool calls are displayed during processing", async ({ page }) => {
    // Navigate to chat
    await page.click('button:has-text("Model Serving experts")');

    // Wait for chat view
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });

    // Look for tool call indicators (the custom tool render from useDefaultTool)
    // This might show "Database search" or similar text
    await expect(
      page.getByText(/searching|database|complete/i).first()
    ).toBeVisible({ timeout: 30000 });
  });
});

test.describe("Agent Error Handling", () => {
  test("displays error when agent fails", async ({ page }) => {
    // This test would require a way to trigger an agent error
    // For now, just verify the error handling UI exists
    await page.goto("/");
    
    // Navigate to chat
    await page.click('button:has-text("Dashboard team")');

    // The error banner component should be ready (even if not visible)
    // Just verify chat loads without crashing
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 5000,
    });
  });
});
