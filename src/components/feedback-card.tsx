"use client";

import { useState } from "react";

type FeedbackCardProps = {
  onFeedback: (feedback: "yes" | "no") => void;
  isSubmitting?: boolean;
};

export function FeedbackCard({ onFeedback, isSubmitting = false }: FeedbackCardProps) {
  const [selectedFeedback, setSelectedFeedback] = useState<"yes" | "no" | null>(null);

  const handleFeedback = (feedback: "yes" | "no") => {
    setSelectedFeedback(feedback);
    onFeedback(feedback);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 backdrop-blur-sm border border-indigo-500/30 rounded-xl p-6 my-4 shadow-lg">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-indigo-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-2">
            Was this response helpful?
          </h3>
          <p className="text-sm text-gray-300 mb-4">
            Your feedback helps us improve the expert finder
          </p>

          {/* Feedback Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleFeedback("yes")}
              disabled={isSubmitting || selectedFeedback !== null}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all transform ${
                selectedFeedback === "yes"
                  ? "bg-green-500 text-white scale-105 shadow-lg"
                  : selectedFeedback === "no"
                  ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
                  : "bg-gray-800/50 text-gray-200 hover:bg-green-500/20 hover:text-green-400 hover:border-green-500/50 border border-gray-700"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                />
              </svg>
              <span>Yes, helpful</span>
            </button>

            <button
              onClick={() => handleFeedback("no")}
              disabled={isSubmitting || selectedFeedback !== null}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all transform ${
                selectedFeedback === "no"
                  ? "bg-red-500 text-white scale-105 shadow-lg"
                  : selectedFeedback === "yes"
                  ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
                  : "bg-gray-800/50 text-gray-200 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 border border-gray-700"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
                />
              </svg>
              <span>No, not helpful</span>
            </button>
          </div>

          {/* Submitting state */}
          {isSubmitting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-indigo-400">
              <div className="animate-spin h-3 w-3 border-2 border-indigo-400 border-t-transparent rounded-full" />
              <span>Submitting feedback...</span>
            </div>
          )}

          {/* Success state */}
          {selectedFeedback && !isSubmitting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-green-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>Thanks for your feedback!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
