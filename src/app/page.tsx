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
  // 🪁 Shared State: https://docs.copilotkit.ai/pydantic-ai/shared-state
  useCoAgent({
    name: "expert_finder_agent",
  });

  const { appendMessage, isLoading } = useCopilotChat();
  const hasSubmittedRef = useRef(false);

  // Send the initial message when the chat is ready
  // Using a ref instead of state to avoid re-renders and race conditions
  useEffect(() => {
    if (!initialMessage || hasSubmittedRef.current) return;

    // Retry until appendMessage succeeds - this handles the timing issue
    // where the chat might not be fully initialized yet
    const sendMessage = async () => {
      // Double-check we haven't already submitted (race condition protection)
      if (hasSubmittedRef.current) return;
      
      try {
        hasSubmittedRef.current = true; // Set BEFORE to prevent duplicate calls
        await appendMessage(
          new TextMessage({
            content: initialMessage,
            role: Role.User,
          })
        );
      } catch (error) {
        hasSubmittedRef.current = false; // Reset on failure to allow retry
        // If it fails, retry after a short delay
        setTimeout(sendMessage, 200);
      }
    };

    // Start trying to send once we have appendMessage and chat isn't loading
    if (appendMessage && !isLoading) {
      sendMessage();
    }
  }, [initialMessage, appendMessage, isLoading]);

  useDefaultTool({
    render: ({ name, status, args, result }) => {
      const isJiraTool = name.includes("jira_");
      
      if (isJiraTool) {
        return (
          <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg shadow-md my-2 border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${status === "complete" ? "bg-green-500" : "bg-indigo-500 animate-pulse"}`} />
              <span className="font-semibold text-gray-100">{name.replace(/_/g, " ").replace("jira ", "JIRA: ")}</span>
            </div>
            
            {args && (
              <div className="text-sm text-gray-300 mb-2">
                <span className="font-medium">Query:</span>
                <div className="bg-gray-900/50 p-2 rounded mt-1 font-mono text-xs text-gray-400 break-all">
                  {args.jql || args.issue_key || args.user_identifier || JSON.stringify(args)}
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
                {result && typeof result === "string" && result.includes("total") ? (
                  <>
                    ✓ Found {JSON.parse(result).total || 0} issues ({JSON.parse(result).issues?.length || 0} returned)
                  </>
                ) : (
                  <>✓ Complete</>
                )}
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
