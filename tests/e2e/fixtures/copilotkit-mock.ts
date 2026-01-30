import { Page } from "@playwright/test";

/**
 * Mock responses for CopilotKit API
 * These simulate the streaming responses from the agent backend
 */

// Mock a simple text response from the agent
export function createMockAgentResponse(content: string): string {
  return JSON.stringify({
    choices: [
      {
        delta: {
          content: content,
        },
        finish_reason: null,
      },
    ],
  });
}

// Mock a tool call response
export function createMockToolCallResponse(
  toolName: string,
  args: Record<string, unknown>
): string {
  return JSON.stringify({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              id: `call_${Date.now()}`,
              function: {
                name: toolName,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  });
}

// Create a streaming response body
export function createStreamingResponse(messages: string[]): string {
  return messages.map((msg) => `data: ${msg}\n\n`).join("") + "data: [DONE]\n\n";
}

/**
 * Setup CopilotKit API mocking for E2E tests
 * This intercepts requests to /api/copilotkit and returns mock responses
 */
export async function setupCopilotKitMock(
  page: Page,
  options: {
    simulateToolCall?: boolean;
    toolName?: string;
    responseText?: string;
    delayMs?: number;
  } = {}
): Promise<void> {
  const {
    simulateToolCall = false,
    toolName = "find_experts_by_topic",
    responseText = "Here are the experts I found for your query.",
    delayMs = 100,
  } = options;

  await page.route("**/api/copilotkit/**", async (route) => {
    // Add delay to simulate network latency
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const messages: string[] = [];

    if (simulateToolCall) {
      // First, send tool call
      messages.push(
        createMockToolCallResponse(toolName, { query: "test query" })
      );
      // Then send the response
      messages.push(createMockAgentResponse(`Called ${toolName}! `));
    }

    // Send the main response text
    messages.push(createMockAgentResponse(responseText));

    // Create streaming response
    const body = createStreamingResponse(messages);

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body: body,
    });
  });
}

/**
 * Mock that tracks received messages for verification
 */
export async function setupCopilotKitMockWithTracking(
  page: Page
): Promise<{ getReceivedMessages: () => string[] }> {
  const receivedMessages: string[] = [];

  await page.route("**/api/copilotkit/**", async (route) => {
    const request = route.request();
    const postData = request.postData();

    if (postData) {
      try {
        const data = JSON.parse(postData);
        if (data.messages) {
          data.messages.forEach((msg: { content?: string }) => {
            if (msg.content) {
              receivedMessages.push(msg.content);
            }
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Return a simple acknowledgment response
    const body = createStreamingResponse([
      createMockAgentResponse("I received your message."),
    ]);

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: body,
    });
  });

  return {
    getReceivedMessages: () => [...receivedMessages],
  };
}
