import { Page } from "@playwright/test";

/**
 * Mock responses for CopilotKit API using AG-UI protocol
 * CopilotKit with LangGraph uses a specific event-based streaming format
 */

// Generate a unique ID
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Create AG-UI protocol events for a text message response
function createAgUiTextMessageEvents(content: string): string[] {
  const messageId = generateId();
  const runId = generateId();
  
  return [
    // Run started event
    JSON.stringify({
      type: "run_started",
      runId: runId,
      threadId: generateId(),
    }),
    // Text message start
    JSON.stringify({
      type: "text_message_start",
      messageId: messageId,
      role: "assistant",
    }),
    // Text message content (can be chunked, but we send it all at once for simplicity)
    JSON.stringify({
      type: "text_message_content",
      messageId: messageId,
      content: content,
    }),
    // Text message end
    JSON.stringify({
      type: "text_message_end",
      messageId: messageId,
    }),
    // Run finished
    JSON.stringify({
      type: "run_finished",
      runId: runId,
    }),
  ];
}

// Create AG-UI protocol events for a tool call
function createAgUiToolCallEvents(
  toolName: string,
  args: Record<string, unknown>,
  result: string
): string[] {
  const toolCallId = generateId();
  const runId = generateId();
  
  return [
    // Run started
    JSON.stringify({
      type: "run_started",
      runId: runId,
      threadId: generateId(),
    }),
    // Tool call start
    JSON.stringify({
      type: "tool_call_start",
      toolCallId: toolCallId,
      toolName: toolName,
    }),
    // Tool call args
    JSON.stringify({
      type: "tool_call_args",
      toolCallId: toolCallId,
      args: JSON.stringify(args),
    }),
    // Tool call end
    JSON.stringify({
      type: "tool_call_end",
      toolCallId: toolCallId,
    }),
    // Tool call result
    JSON.stringify({
      type: "tool_call_result",
      toolCallId: toolCallId,
      result: result,
    }),
    // Run finished
    JSON.stringify({
      type: "run_finished",
      runId: runId,
    }),
  ];
}

// Create SSE formatted response body
function createSseResponse(events: string[]): string {
  return events.map((event) => `data: ${event}\n\n`).join("");
}

/**
 * Setup CopilotKit API mocking for E2E tests
 * Uses AG-UI protocol format that CopilotKit with LangGraph expects
 */
export async function setupCopilotKitMock(
  page: Page,
  options: {
    simulateToolCall?: boolean;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    responseText?: string;
    delayMs?: number;
  } = {}
): Promise<void> {
  const {
    simulateToolCall = false,
    toolName = "find_experts_by_topic",
    toolArgs = { query: "test query" },
    responseText = "Here are the experts I found for your query.",
    delayMs = 100,
  } = options;

  await page.route("**/api/copilotkit/**", async (route) => {
    // Add delay to simulate network latency
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    let events: string[] = [];

    if (simulateToolCall) {
      // Send tool call events first
      events = events.concat(
        createAgUiToolCallEvents(toolName, toolArgs, "Tool executed successfully")
      );
    }

    // Send text message response
    events = events.concat(createAgUiTextMessageEvents(responseText));

    const body = createSseResponse(events);

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
        // CopilotKit sends messages in various formats, try to extract content
        if (data.messages) {
          data.messages.forEach((msg: { content?: string; text?: string }) => {
            const content = msg.content || msg.text;
            if (content) {
              receivedMessages.push(content);
            }
          });
        }
        // Also check for direct content field
        if (data.content) {
          receivedMessages.push(data.content);
        }
        // Check for input field (common in chat APIs)
        if (data.input) {
          receivedMessages.push(
            typeof data.input === "string" ? data.input : JSON.stringify(data.input)
          );
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Return a simple acknowledgment response using AG-UI format
    const events = createAgUiTextMessageEvents("I received your message.");
    const body = createSseResponse(events);

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

// Keep legacy functions for backward compatibility if needed
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

export function createStreamingResponse(messages: string[]): string {
  return messages.map((msg) => `data: ${msg}\n\n`).join("") + "data: [DONE]\n\n";
}
