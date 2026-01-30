"use client";

import {
  useCoAgent,
  useDefaultTool,
  useCopilotChat,
} from "@copilotkit/react-core";
import { CopilotKitCSSProperties, CopilotChat } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { Role, TextMessage } from "@copilotkit/runtime-client-gql";
import { useState, FormEvent, useEffect, useRef } from "react";

export default function CopilotKitPage() {
  const [showChat, setShowChat] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");

  const handleStartChat = (message: string) => {
    setInitialMessage(message);
    setShowChat(true);
  };

  const customStyles = {
    "--copilot-kit-background-color": "#111827",
    "--copilot-kit-secondary-color": "#1f2937",
    "--copilot-kit-primary-color": "#6366f1",
    "--copilot-kit-contrast-color": "#ffffff",
    "--copilot-kit-secondary-contrast-color": "#e5e7eb",
    "--copilot-kit-separator-color": "#374151",
    "--copilot-kit-muted-color": "#6b7280",
  } as CopilotKitCSSProperties;

  return (
    <main style={customStyles} className="h-screen bg-gray-900">
      {!showChat ? (
        <LandingPage onStartChat={handleStartChat} />
      ) : (
        <ChatContent 
          initialMessage={initialMessage} 
          onBack={() => setShowChat(false)} 
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex flex-col items-center justify-start">
      {/* Hero Section */}
      <div className="w-full max-w-4xl mx-auto px-6 pt-32 pb-12 flex flex-col items-center">
        {/* Icon */}
        <div className="mb-8 text-6xl">🔍</div>
        
        {/* Title */}
        <h1 className="text-5xl font-bold text-white mb-4 text-center">
          Who Do I Talk To?
        </h1>
        
        {/* Subtitle */}
        <p className="text-xl text-gray-400 mb-12 text-center">
          Find the right experts in OpenShift AI
        </p>
        
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

function ChatContent({ initialMessage, onBack }: { initialMessage: string; onBack: () => void }) {
  const [agentError, setAgentError] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  // 🪁 Shared State: https://docs.copilotkit.ai/pydantic-ai/shared-state
  const { state } = useCoAgent({
    name: "expert_finder_agent",
  });

  const { appendMessage, isLoading } = useCopilotChat();
  const messageSent = useRef(false);

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
      
      if (isJiraTool) {
        console.log('[JIRA TOOL RENDER]', {
          name,
          status,
          args,
          result,
        });
        return (
          <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg shadow-md my-2 border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${status === "complete" ? "bg-green-500" : "bg-indigo-500 animate-pulse"}`} />
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
      
      // Default rendering for non-JIRA tools
      const textStyles = "text-gray-500 text-sm mt-2";
      if (status !== "complete") {
        return <p className={textStyles}>Calling {name}...</p>;
      }
      return <p className={textStyles}>Called {name}!</p>;
    },
  })

  return (
    <div className="h-full flex flex-col">
      {/* Navigation Header - subtle, fades into background */}
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
            title: "Expert Finder",
            placeholder: "Type a message...",
          }}
          instructions="You are an expert finder assistant for OpenShift AI. Help users find the right people to talk to about features, teams, and technical topics."
          className="h-full"
          showActivityIndicator={true}
        />
      </div>
    </div>
  );
}
