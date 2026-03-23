"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, ToolCallInfo } from "@/lib/types";
import { streamChat } from "@/lib/api";

export function useChat(onNodeReferences?: (nodeIds: string[]) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: content.trim(),
      };

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        isStreaming: true,
        tools_used: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      try {
        let fullContent = "";
        let referencedNodes: string[] = [];
        let toolsUsed: ToolCallInfo[] = [];
        let queryUsed: string | null = null;

        for await (const chunk of streamChat(content, conversationId.current)) {
          switch (chunk.type) {
            case "token":
              fullContent += chunk.content;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: fullContent,
                    isStreaming: true,
                    tools_used: toolsUsed,
                  };
                }
                return updated;
              });
              break;

            case "tool_start":
              toolsUsed = [
                ...toolsUsed,
                {
                  tool_name: chunk.content,
                  tool_input: chunk.tool_input || {},
                },
              ];
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: fullContent,
                    tools_used: toolsUsed,
                    isStreaming: true,
                  };
                }
                return updated;
              });
              break;

            case "tool_end":
              break;

            case "status":
              // Retry status — show to user
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: `*${chunk.content}*`,
                    isStreaming: true,
                  };
                }
                return updated;
              });
              fullContent = "";
              toolsUsed = [];
              break;

            case "done":
              referencedNodes = chunk.referenced_nodes || [];
              queryUsed = chunk.query_used || null;
              if (chunk.tools_used) toolsUsed = chunk.tools_used;
              if (chunk.conversation_id) {
                conversationId.current = chunk.conversation_id;
              }
              break;

            case "response":
              fullContent = chunk.content;
              if (chunk.conversation_id) {
                conversationId.current = chunk.conversation_id;
              }
              break;
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: fullContent,
              referenced_nodes: referencedNodes,
              tools_used: toolsUsed,
              query_used: queryUsed,
              isStreaming: false,
            };
          }
          return updated;
        });

        if (referencedNodes.length > 0 && onNodeReferences) {
          onNodeReferences(referencedNodes);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Chat error:", err);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: "Sorry, an error occurred. Please try again.",
              isStreaming: false,
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, onNodeReferences]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    conversationId.current = undefined;
  }, []);

  return { messages, isLoading, sendMessage, clearChat };
}
