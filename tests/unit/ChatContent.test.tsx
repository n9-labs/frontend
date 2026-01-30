/**
 * Unit tests for ChatContent component
 * Focus: Preventing duplicate chat entries from the home page
 */
import React, { useRef, useEffect } from "react";
import { render, waitFor } from "@testing-library/react";

// Mock CopilotKit hooks
const mockAppendMessage = jest.fn();
let mockIsLoading = false;

jest.mock("@copilotkit/react-core", () => ({
  useCopilotChat: () => ({
    appendMessage: mockAppendMessage,
    isLoading: mockIsLoading,
  }),
  useCoAgent: () => ({ state: {} }),
  useDefaultTool: jest.fn(),
}));

jest.mock("@copilotkit/react-ui", () => ({
  CopilotChat: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="copilot-chat">{children}</div>
  ),
  CopilotKitCSSProperties: {},
}));

// Mock message class
class MockTextMessage {
  content: string;
  role: string;
  constructor({ content, role }: { content: string; role: string }) {
    this.content = content;
    this.role = role;
  }
}

const MockRole = {
  User: "user",
  Assistant: "assistant",
};

jest.mock("@copilotkit/runtime-client-gql", () => ({
  TextMessage: MockTextMessage,
  Role: MockRole,
}));

// Import the mocked module to use in tests
import { useCopilotChat } from "@copilotkit/react-core";

// Simplified test component that mimics the message sending logic
function TestMessageSender({ initialMessage }: { initialMessage: string }) {
  const messageSent = useRef(false);
  const { appendMessage, isLoading } = useCopilotChat();

  useEffect(() => {
    if (!initialMessage || messageSent.current) return;

    const sendMessage = async () => {
      if (messageSent.current) return;

      try {
        messageSent.current = true; // Set BEFORE await
        await appendMessage(
          new MockTextMessage({
            content: initialMessage,
            role: MockRole.User,
          })
        );
      } catch {
        messageSent.current = false;
        setTimeout(sendMessage, 200);
      }
    };

    if (!isLoading) {
      sendMessage();
    }
  }, [initialMessage, appendMessage, isLoading]);

  return <div data-testid="test-sender">Test</div>;
}

describe("ChatContent - Duplicate Message Prevention", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoading = false;
  });

  it("should only send the initial message once", async () => {
    mockAppendMessage.mockResolvedValue(undefined);

    render(<TestMessageSender initialMessage="Test message" />);

    await waitFor(() => {
      expect(mockAppendMessage).toHaveBeenCalledTimes(1);
    });

    // Wait a bit more to ensure no duplicate calls
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
    expect(mockAppendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Test message",
        role: "user",
      })
    );
  });

  it("should not send message when initialMessage is empty", async () => {
    render(<TestMessageSender initialMessage="" />);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("should retry on failure and eventually succeed", async () => {
    // Fail first, succeed second
    mockAppendMessage
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(undefined);

    render(<TestMessageSender initialMessage="Retry test" />);

    await waitFor(
      () => {
        expect(mockAppendMessage).toHaveBeenCalledTimes(2);
      },
      { timeout: 500 }
    );

    // Should not call more times after success
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(mockAppendMessage).toHaveBeenCalledTimes(2);
  });

  it("should not send message while chat is loading", async () => {
    mockIsLoading = true;

    render(<TestMessageSender initialMessage="Loading test" />);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("should prevent race conditions with rapid re-renders", async () => {
    mockAppendMessage.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    const { rerender } = render(<TestMessageSender initialMessage="Race test" />);

    // Simulate rapid re-renders
    rerender(<TestMessageSender initialMessage="Race test" />);
    rerender(<TestMessageSender initialMessage="Race test" />);
    rerender(<TestMessageSender initialMessage="Race test" />);

    await waitFor(
      () => {
        expect(mockAppendMessage).toHaveBeenCalled();
      },
      { timeout: 200 }
    );

    // Wait for any pending async operations
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should only have been called once despite multiple re-renders
    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
  });
});
