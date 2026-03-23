"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import GraphViewer from "@/components/graph/GraphViewer";
import NodeDetail from "@/components/graph/NodeDetail";
import GraphControls from "@/components/graph/GraphControls";
import ChatPanel from "@/components/chat/ChatPanel";
import { useGraph } from "@/hooks/useGraph";
import { useChat } from "@/hooks/useChat";
import type { GraphNode } from "@/lib/types";

export default function Home() {
  const {
    nodes,
    edges,
    nodeColors,
    loading,
    error,
    highlightedNodes,
    selectedNode,
    setSelectedNode,
    loadInitialGraph,
    showConnections,
    hideConnections,
    highlightNodes,
  } = useGraph();

  const handleNodeReferences = useCallback(
    (nodeIds: string[]) => {
      highlightNodes(nodeIds);

      // Auto-select the first referenced node so the badge highlights
      // and the graph zooms to it
      if (nodeIds.length > 0) {
        const firstId = nodeIds[0];
        // Exact match first, then fuzzy
        let found = nodes.find((n) => n.id === firstId);
        if (!found) {
          const searchPart = firstId.split("::")[1] || firstId;
          found = nodes.find((n) => n.id.includes(searchPart));
        }
        if (found) {
          setSelectedNode(found);
          setFocusNodeId(found.id);
        }
      }
    },
    [highlightNodes, nodes, setSelectedNode]
  );

  const { messages, isLoading: chatLoading, sendMessage, clearChat } = useChat(handleNodeReferences);
  const [isMinimized, setIsMinimized] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatWidth, setChatWidth] = useState(384);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(384);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;

    const handleDragMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX;
      const newWidth = Math.min(Math.max(dragStartWidth.current + delta, 280), window.innerWidth * 0.6);
      setChatWidth(newWidth);
    };

    const handleDragEnd = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  }, [chatWidth]);

  useEffect(() => {
    loadInitialGraph();
  }, [loadInitialGraph]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
    },
    [setSelectedNode]
  );

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    highlightNodes([]);
  }, [setSelectedNode, highlightNodes]);

  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  const handleChatNodeSelect = useCallback(
    (nodeId: string) => {
      // Exact match first, then fuzzy match (for IDs like journal::9400635858
      // where the actual graph node is journal::ABCD-2025-9400635858)
      let found = nodes.find((n) => n.id === nodeId);
      if (!found) {
        const searchPart = nodeId.split("::")[1] || nodeId;
        found = nodes.find((n) => n.id.includes(searchPart));
      }

      const matchedId = found?.id || nodeId;
      highlightNodes([matchedId]);
      if (found) {
        setSelectedNode(found);
      }
      setFocusNodeId(matchedId);
    },
    [highlightNodes, nodes, setSelectedNode]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: "#0A0A0F" }}>
      {/* Graph Panel */}
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {/* Header bar */}
        <div className="absolute top-0 left-0 right-0 z-40 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800/60 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="text-zinc-500">Mapping</span>
              <span className="text-zinc-700">/</span>
              <span className="text-white font-medium">Order to Cash</span>
            </div>

            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                chatOpen
                  ? "bg-zinc-800/60 text-zinc-400 hover:text-white"
                  : "bg-indigo-600/90 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {chatOpen ? "Hide Chat" : "Open Chat"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-zinc-400 text-sm">Loading graph data...</p>
              <p className="text-zinc-600 text-xs mt-1">21,000+ entities</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                <span className="text-red-400 text-xl">!</span>
              </div>
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <button
                onClick={loadInitialGraph}
                className="text-sm text-blue-400 hover:text-blue-300 px-4 py-2 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        ) : (
          <>
            <GraphViewer
              nodes={nodes}
              edges={edges}
              nodeColors={nodeColors}
              highlightedNodes={highlightedNodes}
              selectedNodeId={selectedNode?.id || null}
              focusNodeId={focusNodeId}
              onFocusHandled={() => setFocusNodeId(null)}
              onNodeClick={handleNodeClick}
              onNodeExpand={() => {}}
              onBackgroundClick={handleBackgroundClick}
            />
            <NodeDetail
              node={selectedNode}
              onClose={() => {
                setSelectedNode(null);
                highlightNodes([]);
              }}
              onExpand={showConnections}
              isInHighlightPath={(() => {
                if (!selectedNode || highlightedNodes.size === 0) return false;
                // Direct check: is this node highlighted?
                if (highlightedNodes.has(selectedNode.id)) return true;
                // Edge check: does this node have any edge connecting to a highlighted node?
                for (const edge of edges) {
                  const src = typeof edge.source === "string" ? edge.source : edge.source.id;
                  const tgt = typeof edge.target === "string" ? edge.target : edge.target.id;
                  if (src === selectedNode.id && highlightedNodes.has(tgt)) return true;
                  if (tgt === selectedNode.id && highlightedNodes.has(src)) return true;
                }
                return false;
              })()}
              onClearConnections={() => {
                if (selectedNode) hideConnections(selectedNode.id);
              }}
            />
            <GraphControls
              nodeCount={nodes.length}
              edgeCount={edges.length}
              isMinimized={isMinimized}
              onToggleMinimize={() => setIsMinimized(!isMinimized)}
            />
          </>
        )}
      </div>

      {/* Chat Panel — resizable */}
      {chatOpen && (
        <div className="shrink-0 h-full flex" style={{ width: chatWidth }}>
          {/* Drag handle */}
          <div
            onMouseDown={handleDragStart}
            className="w-1 h-full cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-500/60 transition-colors bg-zinc-800/30 shrink-0"
          />
          <div className="flex-1 min-w-0 h-full">
            <ChatPanel
              messages={messages}
              isLoading={chatLoading}
              onSend={sendMessage}
              onNodeSelect={handleChatNodeSelect}
              activeNodeId={selectedNode?.id || null}
              onNewChat={() => {
                clearChat();
                highlightNodes([]);
                setSelectedNode(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
