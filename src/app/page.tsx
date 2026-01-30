"use client";

import {
  useCoAgent,
  useDefaultTool,
  useCopilotChat,
  useLangGraphInterrupt,
} from "@copilotkit/react-core";

import { CopilotKitCSSProperties, CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { Role, TextMessage } from "@copilotkit/runtime-client-gql";
import { useState, FormEvent, useEffect, useRef } from "react";
import { FeedbackCard } from "@/components/feedback-card";

// Check if we're in E2E test mode (CopilotKit is disabled)
const isE2ETestMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true";

export default function CopilotKitPage() {
  const [showChat, setShowChat] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");

  const handleStartChat = (message: string) => {
    setInitialMessage(message);
    setShowChat(true);
  };

  const handleBackToHome = () => {
    setShowChat(false);
  };

  const customStyles = {
    "--copilot-kit-background-color": "#1f2937",
    "--copilot-kit-secondary-color": "#374151",
    "--copilot-kit-primary-color": "#6366f1",
    "--copilot-kit-contrast-color": "#ffffff",
    "--copilot-kit-secondary-contrast-color": "#e5e7eb",
    "--copilot-kit-separator-color": "#374151",
    "--copilot-kit-muted-color": "#6b7280",
  } as CopilotKitCSSProperties;

  return (
    <main style={customStyles} className="h-screen bg-gray-800">
      {!showChat ? (
        <LandingPage onStartChat={handleStartChat} />
      ) : isE2ETestMode ? (
        // In E2E test mode, show a simplified chat UI without CopilotKit
        <TestModeChatContent 
          initialMessage={initialMessage} 
          onBack={handleBackToHome} 
        />
      ) : (
        <ChatContent 
          initialMessage={initialMessage} 
          onBack={handleBackToHome}
        />
      )}
    </main>
  );
}

function LandingPage({ onStartChat }: { onStartChat: (message: string) => void }) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onStartChat(query);
    }
  };

  const suggestedPrompts = [
    {
      title: "Who owns Pipelines?",
      description: "Who is the PM for Data Science Pipelines in RHOAI?",
      message: "Who is the PM for Data Science Pipelines in RHOAI?",
    },
    {
      title: "Model Serving experts",
      description: "Who should I talk to about KServe and model serving?",
      message: "Who should I talk to about KServe and model serving?",
    },
    {
      title: "Dashboard team",
      description: "Who are the key engineers working on the RHOAI Dashboard?",
      message: "Who are the key engineers working on the RHOAI Dashboard?",
    },
    {
      title: "Training & Fine-tuning",
      description: "Who can help me understand the training and fine-tuning features?",
      message: "Who can help me understand the training and fine-tuning features?",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-800 to-gray-700 flex flex-col items-center justify-start">
      {/* Hero Section */}
      <div className="w-full max-w-4xl mx-auto px-6 pt-12 pb-12 flex flex-col items-center">
        {/* Logo */}
        <img src="/logo.png" alt="Org Chat" className="mb-4 w-80 h-80" />
        
        {/* Title */}
        <h1 className="text-5xl font-bold text-white mb-12 text-center">
          Find Answers Fast
        </h1>
        
        {/* Search Input - Now functional! */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl mb-8">
          <div className="relative">
            <input
              type="text"
              value={query}
            onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about any feature, team, or expert..."
              className="w-full px-6 py-4 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent backdrop-blur-sm transition-all"
            />
            <button 
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </form>
        
        {/* Suggested Prompts */}
        <div className="w-full max-w-3xl">
          <div className="flex items-center gap-2 mb-4 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-medium">Suggested</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestedPrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => onStartChat(prompt.message)}
                className="group text-left p-5 bg-gray-800/30 hover:bg-gray-800/50 border border-gray-700/50 hover:border-gray-600 rounded-xl transition-all"
              >
                <h3 className="font-semibold text-white mb-1 group-hover:text-indigo-400 transition-colors">
                  {prompt.title}
                </h3>
                <p className="text-sm text-gray-400">
                  {prompt.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Simplified chat UI for E2E testing
 * This component mirrors the real ChatContent layout but doesn't use CopilotKit hooks
 */
function TestModeChatContent({ initialMessage, onBack }: { initialMessage: string; onBack: () => void }) {
  return (
    <div className="h-full flex flex-col">
      {/* Navigation Header */}
      <div className="px-6 py-4 shrink-0 bg-gradient-to-b from-gray-900/80 to-transparent">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-gray-500 hover:text-gray-200 transition-all duration-200"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      {/* Chat Area - Simplified for testing */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="copilotKitMessage bg-gray-800 rounded-lg p-4 mb-4">
            <p className="text-gray-200">{initialMessage}</p>
          </div>
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-gray-300">[E2E Test Mode] Agent responses are disabled.</p>
          </div>
        </div>
        
        {/* Input Area - Matches CopilotKit structure */}
        <div className="copilotKitInput flex items-center p-4 border-t border-gray-700">
          <textarea
            placeholder="Type a message..."
            className="flex-1 bg-gray-800 text-white rounded-lg p-3 resize-none border border-gray-600 focus:border-indigo-500 focus:outline-none"
            rows={1}
          />
          <button className="copilotKitInputControlButton ml-2 p-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatContent({ initialMessage, onBack }: { initialMessage: string; onBack: () => void }) {
  const [agentError, setAgentError] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  
  
  // 🪁 Shared State: https://docs.copilotkit.ai/pydantic-ai/shared-state
  const coAgent = useCoAgent({
    name: "expert_finder_agent",
  });
  
  const { state } = coAgent;

  const { appendMessage, reset, isLoading } = useCopilotChat();
  const messageSent = useRef(false);

  // Handler for starting a new chat - uses CopilotKit's reset() to clear messages
  const handleNewChat = () => {
    reset(); // Clear all messages and reset chat state
    onBack(); // Navigate back to landing page
  };

  // Handle LangGraph interrupts for feedback - renders inline in message stream
  useLangGraphInterrupt({
    render: ({ event, resolve }) => {
      // Debug: log all interrupt events
      console.log("[INTERRUPT] Received interrupt event:", event);
      console.log("[INTERRUPT] Event type:", typeof event);
      console.log("[INTERRUPT] Event keys:", event ? Object.keys(event) : "null");
      
      // The event structure from LangGraph is:
      // { name: 'LangGraphInterruptEvent', type: 'CUSTOM', value: { type: 'feedback_request', ... } }
      // We need to check event.value.type, not event.type
      if (event && typeof event === "object" && "value" in event) {
        const value = event.value as Record<string, unknown>;
        console.log("[INTERRUPT] Event value:", value);
        console.log("[INTERRUPT] Value type:", value?.type);
        
        // Check if this is a feedback request
        if (value && typeof value === "object" && value.type === "feedback_request") {
          console.log("[INTERRUPT] ✅ Matched feedback_request, rendering card!");
          
          // Extract data from the interrupt value
          const responseText = typeof value.response === "string" ? value.response : "";
          const traceId = typeof value.traceId === "string" ? value.traceId : null;
          
          return (
            <FeedbackCard 
              onFeedback={async (feedback) => {
                console.log("[HITL] User provided feedback:", feedback);
                
                // Log feedback to MLflow via API endpoint as backup
                try {
                  const response = await fetch("/api/log-feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      feedback,
                      score: feedback === "yes" ? 1 : 0,
                      responseText: responseText.substring(0, 500),
                      traceId,
                    }),
                  });
                  
                  if (!response.ok) {
                    console.warn("[HITL] Failed to log feedback via API:", await response.text());
                  }
                } catch (error) {
                  console.error("[HITL] Error logging feedback:", error);
                }
                
                // Resolve the interrupt with the feedback value
                // This sends the feedback back to the agent's feedback_node
                resolve(JSON.stringify({ feedback }));
              }}
            />
          );
        }
      }
      
      console.log("[INTERRUPT] ❌ Not a feedback request, skipping");
      // Return empty fragment for non-feedback interrupts
      return <></>;
    }
  });

  // Check for errors in agent state
  useEffect(() => {
    // Check if there's an error in the agent state
    if (state && typeof state === "object" && "error" in state) {
      const errorMsg = state.error as string;
      // Only update if it's a new error
      if (errorMsg && errorMsg !== lastErrorRef.current) {
        lastErrorRef.current = errorMsg;
        // Defer setState to avoid cascading renders
        queueMicrotask(() => setAgentError(errorMsg));
      }
    }
  }, [state]);
  
  // Listen for global error events from the agent
  useEffect(() => {
    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.error) {
        const errorMsg = typeof customEvent.detail.error === "string" 
          ? customEvent.detail.error 
          : JSON.stringify(customEvent.detail.error);
        
        if (errorMsg !== lastErrorRef.current) {
          lastErrorRef.current = errorMsg;
          setAgentError(errorMsg);
        }
      }
    };
    
    window.addEventListener("copilotkit:error", handleError);
    window.addEventListener("agent:error", handleError);
    
    return () => {
      window.removeEventListener("copilotkit:error", handleError);
      window.removeEventListener("agent:error", handleError);
    };
  }, []);
  
  // Send the initial message when the chat is ready
  // Using a ref instead of state to avoid re-renders and race conditions
  useEffect(() => {
    if (!initialMessage || messageSent.current) return;

    // Retry until appendMessage succeeds - this handles the timing issue
    // where the chat might not be fully initialized yet
    const sendMessage = async () => {
      // Double-check we haven't already submitted (race condition protection)
      if (messageSent.current) return;
      
      try {
        // Set BEFORE await to prevent duplicate calls during async operation
        messageSent.current = true;
        await appendMessage(
          new TextMessage({
            content: initialMessage,
            role: Role.User,
          })
        );
      } catch {
        // Reset on failure to allow retry
        messageSent.current = false;
        setTimeout(sendMessage, 200);
      }
    };

    // Start trying to send once chat isn't loading
    if (!isLoading) {
      sendMessage();
    }
  }, [initialMessage, appendMessage, isLoading]);

  useDefaultTool({
    render: ({ name, status, args, result }) => {
      const isJiraTool = name.includes("jira_");
      
      // Check if the result contains an error
      const isError = result && typeof result === "string" && (
        result.includes("Error:") || 
        result.includes("HTTPError:") ||
        result.includes("HTTP error") ||
        result.includes("does not exist for the field") ||
        result.includes("Traceback") ||
        result.toLowerCase().includes("failed")
      );
      
      if (isJiraTool) {
        return (
          <div className={`backdrop-blur-sm p-4 rounded-lg shadow-md my-2 border ${
            isError 
              ? "bg-red-900/20 border-red-500/50" 
              : "bg-gray-800/50 border-gray-700"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${
                status !== "complete" 
                  ? "bg-indigo-500 animate-pulse" 
                  : isError 
                    ? "bg-red-500" 
                    : "bg-green-500"
              }`} />
              <span className="font-semibold text-gray-100">{name.replace(/_/g, " ").replace("jira ", "JIRA: ")}</span>
            </div>
            
            {args && Object.keys(args).length > 0 && (
              <div className="text-sm text-gray-300 mb-2">
                <span className="font-medium">Query:</span>
                <div className="bg-gray-900/50 p-2 rounded mt-1 font-mono text-xs text-gray-400 break-all">
                  {(() => {
                    // Try specific known fields first
                    if (args.jql) return args.jql;
                    if (args.issue_key) return args.issue_key;
                    if (args.user_identifier) return args.user_identifier;
                    if (args.query) return args.query;
                    if (args.topic) return args.topic;
                    if (args.labels) return Array.isArray(args.labels) ? args.labels.join(", ") : args.labels;
                    if (args.jira_key) return args.jira_key;
                    
                    // Fallback to JSON stringify
                    const stringified = JSON.stringify(args);
                    return stringified !== "{}" ? stringified : "";
                  })()}
                </div>
              </div>
            )}
            
            {status !== "complete" ? (
              <div className="flex items-center gap-2 text-sm text-indigo-400">
                <div className="animate-spin h-3 w-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
                <span>Searching JIRA...</span>
              </div>
            ) : isError ? (
              <div className="text-sm">
                <div className="text-red-400 font-medium mb-1">✗ Error</div>
                <div className="text-red-300 text-xs bg-red-950/30 p-2 rounded font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {(() => {
                    // Extract just the error message, not the full traceback
                    const resultStr = result as string;
                    const lines = resultStr.split('\n');
                    
                    // Look for the actual error message
                    const errorLine = lines.find(line => 
                      line.includes('Error:') || 
                      line.includes('HTTPError:') ||
                      line.includes('does not exist')
                    );
                    
                    if (errorLine) {
                      // Clean up the error message
                      return errorLine.replace(/^Error:\s*/, '').trim();
                    }
                    
                    // Fallback to showing first 200 chars of result
                    return resultStr.substring(0, 200) + (resultStr.length > 200 ? '...' : '');
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-sm text-green-400 font-medium">
                {(() => {
                  // Check if result was truncated
                  if (result && typeof result === "string" && result.includes("[TRUNCATED")) {
                    return <>✓ Complete (large result truncated)</>;
                  }
                  
                  // Try to parse JSON result
                  if (result && typeof result === "string" && result.includes("total")) {
                    try {
                      const parsed = JSON.parse(result);
                      return <>✓ Found {parsed.total || 0} issues ({parsed.issues?.length || 0} returned)</>;
                    } catch {
                      return <>✓ Complete</>;
                    }
                  }
                  
                  return <>✓ Complete</>;
                })()}
              </div>
            )}
          </div>
        );
      }

      const displayArgs = args && Object.entries(args).map(([key, value]) => `${key}: ${value}`).join(', ');

      return (
        <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg shadow-md my-2 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${status === "complete" ? "bg-green-500" : "bg-indigo-500 animate-pulse"}`} />
            <span className="font-semibold text-gray-100">Database search: {name}</span>
          </div>
          {status !== "complete" ? (
            <div className="flex items-center gap-2 text-sm text-indigo-400">
              <div className="animate-spin h-3 w-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
              <span>
                <div>Searching our database using {name}{displayArgs && ' with the following arguments:' || ''}</div>
                {displayArgs && <div className="bg-gray-900/50 p-2 rounded mt-1 font-mono text-xs text-gray-400 break-all">
                  {displayArgs}
                </div>}
              </span>
            </div>
          ) : (
            <div className="text-sm text-green-400 font-medium">
              {(() => {               
                return (
                  <>
                    <div>✓ Completed the {name} call{displayArgs && ' with the following arguments:' || '!'}</div>
                    {displayArgs && <div className="bg-gray-900/50 p-2 rounded mt-1 font-mono text-xs text-gray-400 break-all">
                      {displayArgs}
                    </div>}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )
    },
  })

  return (
    <div className="h-full flex flex-col">
      {/* Navigation Header - subtle, fades into background */}
      <div className="px-6 py-4 shrink-0 bg-gradient-to-b from-gray-900/80 to-transparent">
        <button
          onClick={handleNewChat}
          className="group flex items-center gap-2 text-gray-500 hover:text-gray-200 transition-all duration-200"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">New Chat</span>
        </button>
      </div>

      {/* Error Banner */}
      {agentError && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 mx-4 rounded-lg flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Agent Error</h3>
            <p className="text-sm font-mono text-red-300 whitespace-pre-wrap break-words">
              {agentError.length > 500 ? agentError.substring(0, 500) + "..." : agentError}
            </p>
            <button 
              onClick={() => setAgentError(null)}
              className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 min-h-0">
        <CopilotChat
          labels={{
            title: "Org Chat",
            placeholder: "Type a message...",
          }}
          instructions="You are Org Chat, an assistant that helps users find the right people to talk to about features, teams, and technical topics in OpenShift AI."
          className="h-full"
        />
      </div>
    </div>
  );
}
