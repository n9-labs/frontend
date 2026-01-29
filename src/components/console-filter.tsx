"use client";

import { useEffect } from "react";

/**
 * Filters out the known CopilotKit ZodError from console
 * This error occurs when LLMs return content as an array instead of string,
 * which is valid in modern OpenAI API but CopilotKit v1.x validates against.
 * The error is cosmetic - functionality works fine.
 */
export function ConsoleErrorFilter({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const originalError = console.error;
    
    console.error = (...args: unknown[]) => {
      // Check if this is the known ZodError about content type
      const errorString = args.map(arg => 
        typeof arg === 'string' ? arg : JSON.stringify(arg)
      ).join(' ');
      
      // Filter out the specific ZodError that CopilotKit throws
      if (
        errorString.includes('"code":"invalid_type"') &&
        errorString.includes('"expected":"string"') &&
        errorString.includes('"received":"array"') &&
        errorString.includes('"path":["content"]')
      ) {
        // Silently ignore this known cosmetic error
        return;
      }
      
      // Pass through all other errors
      originalError.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
    };
  }, []);
  
  return <>{children}</>;
}
