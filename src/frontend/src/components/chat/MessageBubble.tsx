"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onNodeSelect?: (nodeId: string) => void;
  onRetry?: () => void;
  activeNodeId?: string | null;
}

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  query_collection: { label: "Querying database", icon: "search" },
  trace_order: { label: "Tracing order flow", icon: "flow" },
  trace_billing: { label: "Tracing billing flow", icon: "flow" },
  find_broken_flows: { label: "Analyzing flow integrity", icon: "alert" },
  get_graph_neighbors: { label: "Exploring connections", icon: "graph" },
  search_entities: { label: "Searching entities", icon: "search" },
};

function ToolIcon({ type }: { type: string }) {
  if (type === "flow") {
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    );
  }
  if (type === "alert") {
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (type === "graph") {
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function NodeBadgeList({ nodes, activeNodeId, onNodeSelect }: {
  nodes: string[];
  activeNodeId?: string | null;
  onNodeSelect?: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleCount = 15;
  const visible = expanded ? nodes : nodes.slice(0, visibleCount);
  const remaining = nodes.length - visibleCount;

  return (
    <div>
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Highlighted in Graph</p>
      <div className="flex flex-wrap gap-1">
        {visible.map((nodeId) => {
          const [type, id] = nodeId.split("::");
          const isActive = activeNodeId ? (activeNodeId === nodeId || activeNodeId.includes(id)) : false;
          return (
            <button
              key={nodeId}
              onClick={() => onNodeSelect?.(nodeId)}
              className={`group inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-amber-500/25 text-amber-300 border-amber-400/50 ring-1 ring-amber-400/30"
                  : "bg-amber-500/8 text-amber-400/90 border-amber-500/15 hover:bg-amber-500/15 hover:border-amber-500/30"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full transition-colors ${isActive ? "bg-amber-300" : "bg-amber-400/60 group-hover:bg-amber-400"}`} />
              <span className="font-mono">{id}</span>
              <span className={`text-[9px] ${isActive ? "text-amber-400" : "text-amber-600"}`}>{type}</span>
            </button>
          );
        })}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-1.5 transition-colors flex items-center gap-1"
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {expanded ? "Show less" : `Show ${remaining} more`}
        </button>
      )}
    </div>
  );
}

export default function MessageBubble({ message, onNodeSelect, onRetry, activeNodeId }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [showDetails, setShowDetails] = useState(false);

  const hasMetadata =
    !isUser &&
    !message.isStreaming &&
    ((message.tools_used && message.tools_used.length > 0) ||
      (message.referenced_nodes && message.referenced_nodes.length > 0));

  const isProcessing = !isUser && message.isStreaming && !message.content && message.tools_used && message.tools_used.length > 0;

  const isFailed = !isUser && !message.isStreaming && message.content &&
    (message.content.toLowerCase().includes("error occurred") ||
     message.content.toLowerCase().includes("multiple attempts"));

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fadeIn`}>
      <div className={`flex items-start gap-2.5 max-w-[94%] ${isUser ? "flex-row-reverse" : ""}`}>
        {/* Avatar */}
        {!isUser && (
          <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5 shadow-lg shadow-indigo-500/20">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {isUser && (
          <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 text-[10px] font-bold shrink-0 mt-0.5 border border-zinc-700/50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}

        <div className="space-y-1.5 min-w-0 flex-1">
          {/* Processing indicator with animated steps */}
          {isProcessing && (
            <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/30 p-3 animate-slideUp">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative w-4 h-4">
                  <div className="absolute inset-0 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                </div>
                <span className="text-xs text-indigo-300 font-medium">Processing your query</span>
              </div>
              <div className="space-y-1.5 pl-1">
                {message.tools_used!.map((tool, i) => {
                  const info = TOOL_LABELS[tool.tool_name] || { label: tool.tool_name, icon: "search" };
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px] animate-fadeIn" style={{ animationDelay: `${i * 200}ms` }}>
                      <div className="w-5 h-5 rounded-md bg-indigo-500/15 flex items-center justify-center text-indigo-400">
                        <ToolIcon type={info.icon} />
                      </div>
                      <span className="text-zinc-400">{info.label}</span>
                      <div className="flex gap-0.5 ml-auto">
                        <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Message bubble */}
          {(message.content || (!isProcessing && message.isStreaming)) && (
            <div
              className={`rounded-2xl text-sm leading-relaxed ${
                isUser
                  ? "bg-indigo-600/90 text-white px-4 py-2.5 rounded-tr-md"
                  : "bg-zinc-800/60 text-zinc-200 border border-zinc-700/30 px-4 py-3 rounded-tl-md"
              }`}
            >
              {isUser ? (
                <p>{message.content}</p>
              ) : (
                <div className="min-w-0">
                  {message.content ? (
                    <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-1.5 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-white prose-strong:font-semibold prose-code:text-sky-300 prose-code:bg-zinc-900/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:text-left [&_th]:text-zinc-400 [&_th]:font-medium [&_th]:py-1.5 [&_th]:px-2 [&_th]:border-b [&_th]:border-zinc-700 [&_td]:py-1.5 [&_td]:px-2 [&_td]:border-b [&_td]:border-zinc-800/50 [&_td]:text-zinc-300 [&_tr:hover]:bg-zinc-800/30 [&_table]:my-2 [&_table]:rounded-lg [&_table]:overflow-hidden">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-zinc-500 text-xs py-0.5">
                      <div className="w-3.5 h-3.5 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin" />
                      Generating response...
                    </div>
                  )}
                  {message.isStreaming && message.content && (
                    <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-full" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Retry button for failed messages */}
          {isFailed && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 transition-colors mt-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          )}

          {/* Grounding section */}
          {hasMetadata && (
            <div className="animate-fadeIn">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="group flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-all duration-200 py-1 px-1"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${showDetails ? "rotate-90" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium">
                  {message.tools_used?.length || 0} step{(message.tools_used?.length || 0) !== 1 ? "s" : ""}
                </span>
                {message.referenced_nodes && message.referenced_nodes.length > 0 && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="flex items-center gap-1 text-amber-400/80">
                      {message.referenced_nodes.length} in graph
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    </span>
                  </>
                )}
              </button>

              {showDetails && (
                <div className="mt-1 space-y-3 pl-1 animate-slideUp">
                  {/* Analysis pipeline */}
                  {message.tools_used && message.tools_used.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Analysis Pipeline</p>
                      <div className="space-y-0">
                        {message.tools_used.map((tool, i) => {
                          const info = TOOL_LABELS[tool.tool_name] || { label: tool.tool_name, icon: "search" };
                          return (
                            <div key={i} className="flex items-start gap-2.5 relative">
                              {/* Vertical line connecting steps */}
                              {i < message.tools_used!.length - 1 && (
                                <div className="absolute left-2.5 top-6 w-px h-full bg-zinc-800" />
                              )}
                              <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0 z-10 border border-emerald-500/20">
                                <ToolIcon type={info.icon} />
                              </div>
                              <div className="pb-3 min-w-0">
                                <p className="text-[11px] text-zinc-300 font-medium">{info.label}</p>
                                {tool.tool_input && Object.keys(tool.tool_input).length > 0 && (
                                  <p className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate">
                                    {Object.entries(tool.tool_input)
                                      .filter(([k]) => !["aggregation", "projection", "filter"].includes(k))
                                      .slice(0, 3)
                                      .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
                                      .join(" · ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Query */}
                  {message.query_used && (
                    <div>
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Query</p>
                      <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 text-[10px] font-mono text-zinc-500 break-all leading-relaxed">
                        {message.query_used}
                      </div>
                    </div>
                  )}

                  {/* Referenced nodes */}
                  {message.referenced_nodes && message.referenced_nodes.length > 0 && (
                    <NodeBadgeList
                      nodes={message.referenced_nodes}
                      activeNodeId={activeNodeId}
                      onNodeSelect={onNodeSelect}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
