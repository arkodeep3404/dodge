"use client";

import { useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import type { ChatMessage } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (message: string) => void;
  onNodeSelect?: (nodeId: string) => void;
  onNewChat?: () => void;
  activeNodeId?: string | null;
}

const SUGGESTED_CATEGORIES = [
  {
    label: "End-to-End Flow Tracing",
    emoji: "🔍",
    color: "text-emerald-400",
    description: "Watch the graph light up the entire order-to-cash chain",
    queries: [
      "Trace the complete journey of sales order 740556 — from order creation through delivery, billing, journal entry, and payment",
      "Start from billing document 90628265 and trace backwards to find which sales order and delivery it came from",
    ],
  },
  {
    label: "Smart Analytics",
    emoji: "📊",
    color: "text-blue-400",
    description: "Complex aggregations translated from natural language",
    queries: [
      "Which products are associated with the highest number of billing documents? Show the top 10 with product names",
      "Compare the top 3 customers by total order value — show their names, order counts, and total amounts",
    ],
  },
  {
    label: "Anomaly Detection",
    emoji: "⚠️",
    color: "text-amber-400",
    description: "Find broken processes and data quality issues",
    queries: [
      "Find all sales orders with broken or incomplete flows — categorize them by what's missing (delivery, billing, journal entry, or payment)",
      "How many billing documents have been cancelled? What's the total value lost to cancellations?",
    ],
  },
  {
    label: "Deep Entity Exploration",
    emoji: "🔎",
    color: "text-purple-400",
    description: "Click the highlighted nodes in the graph to explore",
    queries: [
      "Give me a full profile of customer Nelson, Fitzpatrick and Jordan — all their orders, delivery status, and payment history",
      "Tell me everything about product S8907367008620 — its description, which plants store it, who ordered it, and billing history",
    ],
  },
  {
    label: "Conversation Memory Demo",
    emoji: "💬",
    color: "text-cyan-400",
    description: "Ask the first, then click the follow-up to test memory",
    queries: [
      "Tell me about sales order 740509 — who placed it and what's in it?",
      "Was that order delivered? And was it billed?  ← click this after the first one",
    ],
  },
  {
    label: "Guardrails Demo",
    emoji: "🛡️",
    color: "text-red-400",
    description: "See how the system rejects off-topic queries",
    queries: [
      "Write me a poem about the sunset",
      "Who won the FIFA World Cup in 2022?",
    ],
  },
];

export default function ChatPanel({ messages, isLoading, onSend, onNodeSelect, onNewChat, activeNodeId }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800/50">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-zinc-800/50 bg-zinc-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Graph Agent</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className="text-xs text-zinc-400">Order to Cash Analysis</p>
              </div>
            </div>
          </div>

          {messages.length > 0 && onNewChat && (
            <button
              onClick={onNewChat}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors"
              title="Start new chat session"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
          )}
        </div>
      </div>

      {/* Welcome screen */}
      {messages.length === 0 && (
        <div className="flex-1 overflow-y-auto px-4 py-5 animate-fadeIn">
          <div className="text-center mb-5">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-white mb-1">Explore Your Data</h3>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Ask anything about the Order-to-Cash process. Click a query below to try it.
            </p>
          </div>

          <div className="space-y-4">
            {SUGGESTED_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <p className={`text-xs font-semibold uppercase tracking-wider px-1 ${cat.color}`}>
                  {cat.emoji} {cat.label}
                </p>
                {cat.description && (
                  <p className="text-xs text-zinc-500 px-1 mb-1.5">{cat.description}</p>
                )}
                <div className="space-y-1">
                  {cat.queries.map((q) => (
                    <button
                      key={q}
                      onClick={() => onSend(q)}
                      className="flex items-start gap-2.5 w-full text-left text-[13px] text-zinc-300 hover:text-white hover:bg-zinc-800/40 px-2.5 py-2.5 rounded-lg transition-all duration-200 group border border-transparent hover:border-zinc-800/50"
                    >
                      <span className="text-zinc-500 group-hover:text-indigo-400 mt-0.5 transition-colors shrink-0">→</span>
                      <span className="leading-snug">{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onNodeSelect={onNodeSelect}
                activeNodeId={activeNodeId}
                onRetry={msg.role === "assistant" ? () => {
                  // Find the user message right before this assistant message
                  const idx = messages.indexOf(msg);
                  if (idx > 0 && messages[idx - 1].role === "user") {
                    onSend(messages[idx - 1].content);
                  }
                } : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={onSend} isLoading={isLoading} />
    </div>
  );
}
