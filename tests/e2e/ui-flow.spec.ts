import { test, expect } from "@playwright/test";

test.describe("Expert Finder UI Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("landing page displays correctly", async ({ page }) => {
    // Check main heading
    await expect(page.locator("h1")).toContainText("Who Do I Talk To?");

    // Check subtitle
    await expect(page.getByText("Find the right experts in OpenShift AI")).toBeVisible();

    // Check search input
    const searchInput = page.getByPlaceholder("Ask about any feature, team, or expert...");
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
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({ timeout: 5000 });

    // Chat input should be visible
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  });

  test("typing in search and submitting navigates to chat", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Ask about any feature, team, or expert...");

    // Type a query
    await searchInput.fill("Who works on pipelines?");

    // Submit by pressing Enter
    await searchInput.press("Enter");

    // Should navigate to chat
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({ timeout: 5000 });
  });

  test("back button returns to landing page", async ({ page }) => {
    // Navigate to chat
    await page.click('button:has-text("Dashboard team")');

    // Verify we're in chat
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible({ timeout: 5000 });

    // Click back button
    await page.click('button:has-text("Back")');

    // Should be back on landing page
    await expect(page.locator("h1")).toContainText("Who Do I Talk To?");
    await expect(page.getByPlaceholder("Ask about any feature, team, or expert...")).toBeVisible();
  });

  test("initial message appears only once in chat", async ({ page }) => {
    // Navigate to chat via suggested prompt
    await page.click('button:has-text("Who owns Pipelines?")');

    // Wait for chat to initialize and message to appear
    await page.waitForTimeout(2000);

    // Count user messages - look for the message text directly
    const userMessageText = page.getByText("Who is the PM for Data Science Pipelines in RHOAI?");
    
    // Wait for the message to appear
    await expect(userMessageText.first()).toBeVisible({ timeout: 10000 });

    // Count occurrences - should be exactly 1
    const count = await userMessageText.count();
    expect(count).toBe(1);
  });
});

test.describe("Chat Functionality @slow", () => {
  // These tests require agent response and are slow
  // Run with: npm run test:e2e -- --grep @slow
  
  test.skip("agent responds to queries", async ({ page }) => {
    await page.goto("/");

    // Click suggested prompt
    await page.click('button:has-text("Model Serving experts")');

    // Wait for agent response (may take a while)
    await expect(
      page.getByText(/expert|KServe|model serving/i)
    ).toBeVisible({ timeout: 60000 });
  });

  test.skip("tool calls are displayed during processing", async ({ page }) => {
    await page.goto("/");

    // Click suggested prompt
    await page.click('button:has-text("Model Serving experts")');

    // Look for tool call indicator (either loading or completed)
    await expect(
      page.getByText(/Calling|Called|find_experts/i).first()
    ).toBeVisible({ timeout: 30000 });
  });
});
