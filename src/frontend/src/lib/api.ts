import type { GraphData, NodeDetail, StreamChunk } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function fetchInitialGraph(): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/api/graph/initial`);
  if (!res.ok) throw new Error("Failed to fetch graph");
  return res.json();
}

export async function fetchNodeNeighbors(nodeId: string): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/api/graph/neighbors/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error("Failed to fetch neighbors");
  return res.json();
}

export async function fetchNodeDetail(nodeId: string): Promise<NodeDetail> {
  const res = await fetch(`${API_BASE}/api/graph/node/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error("Failed to fetch node detail");
  return res.json();
}

export async function searchNodes(query: string, type?: string) {
  const params = new URLSearchParams({ q: query });
  if (type) params.set("type", type);
  const res = await fetch(`${API_BASE}/api/graph/search?${params}`);
  if (!res.ok) throw new Error("Failed to search");
  return res.json();
}

export async function* streamChat(
  message: string,
  conversationId?: string
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });

  if (!res.ok) throw new Error("Chat request failed");
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            yield data as StreamChunk;
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
