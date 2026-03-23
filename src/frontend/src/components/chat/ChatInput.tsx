"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export default function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "0";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSend = useCallback(() => {
    if (input.trim() && !isLoading) {
      onSend(input);
      setInput("");
    }
  }, [input, isLoading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Shift+Enter = new line (default textarea behavior, no prevention needed)
    },
    [handleSend]
  );

  return (
    <div className="px-3 py-3 border-t border-zinc-800/50 bg-zinc-950/95 backdrop-blur-sm">
      {isLoading && (
        <div className="flex items-center gap-2 mb-2.5 px-1 animate-fadeIn">
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
          </div>
          <p className="text-xs text-indigo-400 font-medium">Analyzing your question...</p>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about orders, deliveries, billing..."
            disabled={isLoading}
            rows={1}
            className="w-full bg-zinc-900/80 border border-zinc-800/60 text-white text-sm placeholder:text-zinc-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200 disabled:opacity-40 resize-none"
            aria-label="Message input"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/20 disabled:shadow-none shrink-0"
          aria-label="Send message"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
      <p className="text-[10px] text-zinc-500 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}
