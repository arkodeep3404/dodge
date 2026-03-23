"use client";

import { useState, useCallback, useRef } from "react";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { fetchInitialGraph } from "@/lib/api";

export function useGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [nodeColors, setNodeColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const edgesRef = useRef<GraphEdge[]>([]);
  // Track which connection sets are active, keyed by the center node ID
  const activeConnectionSets = useRef<Map<string, Set<string>>>(new Map());

  const loadInitialGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInitialGraph();
      setNodes(data.nodes);
      setEdges(data.edges);
      edgesRef.current = data.edges;
      setNodeColors(data.node_colors);
    } catch (err) {
      console.error("Failed to load graph:", err);
      setError("Failed to load graph data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, []);

  const _rebuildHighlights = useCallback(() => {
    const combined = new Set<string>();
    for (const ids of activeConnectionSets.current.values()) {
      for (const id of ids) combined.add(id);
    }
    setHighlightedNodes(combined);
  }, []);

  // Light up a node + its direct connections
  const showConnections = useCallback((nodeId: string) => {
    const connectedIds = new Set<string>([nodeId]);
    for (const edge of edgesRef.current) {
      const src = typeof edge.source === "string" ? edge.source : edge.source.id;
      const tgt = typeof edge.target === "string" ? edge.target : edge.target.id;
      if (src === nodeId) connectedIds.add(tgt);
      if (tgt === nodeId) connectedIds.add(src);
    }
    activeConnectionSets.current.set(nodeId, connectedIds);
    _rebuildHighlights();
  }, [_rebuildHighlights]);

  // Hide all connection sets that touch this node — directly or via edges
  const hideConnections = useCallback((nodeId: string) => {
    // Find all highlighted nodes connected to this node via edges
    const connectedHighlighted = new Set<string>();
    const allHighlighted = new Set<string>();
    for (const ids of activeConnectionSets.current.values()) {
      for (const id of ids) allHighlighted.add(id);
    }

    for (const edge of edgesRef.current) {
      const src = typeof edge.source === "string" ? edge.source : edge.source.id;
      const tgt = typeof edge.target === "string" ? edge.target : edge.target.id;
      if (src === nodeId && allHighlighted.has(tgt)) connectedHighlighted.add(tgt);
      if (tgt === nodeId && allHighlighted.has(src)) connectedHighlighted.add(src);
    }

    // Delete any connection set that contains this node OR any of its highlighted neighbors
    const toDelete: string[] = [];
    for (const [key, ids] of activeConnectionSets.current.entries()) {
      if (key === nodeId || ids.has(nodeId)) {
        toDelete.push(key);
      } else {
        for (const cid of connectedHighlighted) {
          if (key === cid || ids.has(cid)) {
            toDelete.push(key);
            break;
          }
        }
      }
    }
    for (const key of toDelete) {
      activeConnectionSets.current.delete(key);
    }
    _rebuildHighlights();
  }, [_rebuildHighlights]);

  // Set highlights directly (from chat responses)
  const highlightNodes = useCallback((nodeIds: string[]) => {
    activeConnectionSets.current.clear();
    if (nodeIds.length > 0) {
      activeConnectionSets.current.set("_chat", new Set(nodeIds));
    }
    setHighlightedNodes(new Set(nodeIds));
  }, []);

  return {
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
  };
}
