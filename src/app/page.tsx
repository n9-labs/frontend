"use client";

import { WeatherCard } from "@/components/weather";
import { MoonCard } from "@/components/moon";
import {
  useCoAgent,
  useDefaultTool,
  useFrontendTool,
  useHumanInTheLoop,
  useRenderToolCall,
  useCopilotChat,
} from "@copilotkit/react-core";
import { CopilotKitCSSProperties, CopilotChat } from "@copilotkit/react-ui";
import { Role, TextMessage } from "@copilotkit/runtime-client-gql";
import { useState, FormEvent, useEffect } from "react";

export default function CopilotKitPage() {
  const [themeColor, setThemeColor] = useState("#6366f1");
  const [showChat, setShowChat] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");

  // 🪁 Frontend Actions: https://docs.copilotkit.ai/pydantic-ai/frontend-actions
  useFrontendTool({
    name: "setThemeColor",
    parameters: [
      {
        name: "themeColor",
        description: "The theme color to set. Make sure to pick nice colors.",
        required: true,
      },
    ],
    handler({ themeColor }: { themeColor: string }): void {
      setThemeColor(themeColor);
    },
  });

  const handleStartChat = (message: string) => {
    setInitialMessage(message);
    setShowChat(true);
  };

  return (
    <main
      style={
        { 
          "--copilot-kit-primary-color": "#6366f1",
          "--copilot-kit-background-color": "#111827",
          "--copilot-kit-secondary-color": "#1f2937",
          "--copilot-kit-secondary-contrast-color": "#f3f4f6",
          "--copilot-kit-separator-color": "rgba(75, 85, 99, 0.3)",
        } as CopilotKitCSSProperties
      }
      className="h-screen"
    >
      {!showChat ? (
        <LandingPage onStartChat={handleStartChat} />
      ) : (
        <CopilotChat
          labels={{
            title: "Expert Finder",
            initial: "👋 Ask me who to talk to about any feature, team, or expert in OpenShift AI!",
          }}
          instructions="You are an expert finder assistant for OpenShift AI. Help users find the right people to talk to about features, teams, and technical topics."
          className="h-full copilotKitChat"
          initialMessages={[
            {
              role: "user",
              content: initialMessage,
            }
          ]}
        >
          <ChatContent themeColor={themeColor} initialMessage={initialMessage} />
        </CopilotChat>
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
        
        {/* Action Buttons */}
        <div className="flex gap-4 mb-16">
          <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-all flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Browse JIRAs
          </button>
          <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-all flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Search Code
          </button>
          <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-all flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Get Help
          </button>
        </div>
        
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

function ChatContent({ themeColor, initialMessage }: { themeColor: string; initialMessage: string }) {
  // 🪁 Shared State: https://docs.copilotkit.ai/pydantic-ai/shared-state
  useCoAgent({
    name: "expert_finder_agent",
  });

  const { appendMessage } = useCopilotChat();
  
  // Auto-submit the initial message
  useEffect(() => {
    if (initialMessage) {
      const timer = setTimeout(() => {
        appendMessage(
          new TextMessage({
            content: initialMessage,
            role: Role.User,
          })
        );
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //🪁 Generative UI: https://docs.copilotkit.ai/pydantic-ai/generative-ui
  useRenderToolCall(
    {
      name: "get_weather",
      description: "Get the weather for a given location.",
      parameters: [{ name: "location", type: "string", required: true }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: ({ args }: { args: any }) => {
        return <WeatherCard location={args.location} themeColor={themeColor} />;
      },
    },
    [themeColor],
  );

  useDefaultTool({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: ({ name, status, args, result }: { name: string; status: string; args: any; result: any }) => {
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
                <div className="bg-gray-900/50 p-2 rounded mt-1 font-mono text-xs text-indigo-300 border border-gray-700">
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
      const textStyles = "text-gray-400 text-sm mt-2";
      if (status !== "complete") {
        return <p className={textStyles}>Calling {name}...</p>;
      }
      return <p className={textStyles}>Called {name}!</p>;
    },
  })

  // 🪁 Human In the Loop: https://docs.copilotkit.ai/pydantic-ai/human-in-the-loop
  useHumanInTheLoop(
    {
      name: "go_to_moon",
      description: "Go to the moon on request.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: ({ respond, status }: { respond: any; status: "inProgress" | "executing" | "complete" }) => {
        return (
          <MoonCard themeColor={themeColor} status={status} respond={respond} />
        );
      },
    },
    [themeColor],
  );

  return null; // Chat UI is rendered by CopilotChat
}
