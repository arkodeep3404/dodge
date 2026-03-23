export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  collection?: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_colors: Record<string, string>;
}

export interface NodeDetail extends GraphNode {
  raw_properties: Record<string, unknown>;
  connections: number;
}

export interface ToolCallInfo {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  referenced_nodes?: string[];
  tools_used?: ToolCallInfo[];
  query_used?: string | null;
  isStreaming?: boolean;
}

export interface StreamChunk {
  type: "token" | "tool_start" | "tool_end" | "done" | "response" | "status";
  content: string;
  referenced_nodes?: string[];
  conversation_id?: string;
  tools_used?: ToolCallInfo[];
  query_used?: string | null;
  tool_input?: Record<string, unknown>;
}
