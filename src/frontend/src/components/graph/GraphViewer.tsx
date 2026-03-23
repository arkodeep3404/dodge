"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { GraphNode, GraphEdge } from "@/lib/types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center animate-fadeIn">
        <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-zinc-500 text-sm">Initializing graph engine...</p>
      </div>
    </div>
  ),
});

interface GraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeColors: Record<string, string>;
  highlightedNodes: Set<string>;
  selectedNodeId: string | null;
  focusNodeId?: string | null;
  onFocusHandled?: () => void;
  onNodeClick: (node: GraphNode) => void;
  onNodeExpand: (nodeId: string) => void;
  onBackgroundClick?: () => void;
}

const CORE_TYPES = new Set([
  "sales_order", "delivery", "billing_document",
  "journal_entry", "payment", "customer",
]);

// Softer, more premium color palette
const PREMIUM_COLORS: Record<string, string> = {
  sales_order: "#6993FF",
  sales_order_item: "#8BABFF",
  schedule_line: "#A8C0FF",
  delivery: "#4ADE80",
  delivery_item: "#6EE7A0",
  billing_document: "#FBBF24",
  billing_item: "#FCD34D",
  billing_cancellation: "#F87171",
  journal_entry: "#A78BFA",
  payment: "#F472B6",
  customer: "#22D3EE",
  address: "#67E8F9",
  customer_company: "#34D4ED",
  customer_sales_area: "#5EE6F5",
  plant: "#94A3B8",
  product: "#FB923C",
  product_description: "#FDBA74",
  product_plant: "#CBD5E1",
  product_storage: "#E2E8F0",
};

export default function GraphViewer({
  nodes,
  edges,
  nodeColors,
  highlightedNodes,
  selectedNodeId,
  focusNodeId,
  onFocusHandled,
  onNodeClick,
  onNodeExpand,
  onBackgroundClick,
}: GraphViewerProps) {
  const graphRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prevHighlightRef = useRef<Set<string>>(new Set());
  const hoverNode = useRef<string | null>(null);

  const graphData = useMemo(() => ({
    nodes: nodes.map((n) => ({ ...n })),
    links: edges.map((e) => ({
      source: typeof e.source === "string" ? e.source : e.source.id,
      target: typeof e.target === "string" ? e.target : e.target.id,
      type: e.type,
      label: e.label,
    })),
  }), [nodes, edges]);

  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force("charge")?.strength(-150);
      graphRef.current.d3Force("link")?.distance(40);
    }
  }, [graphData]);

  // Zoom + center on a specific node when focusNodeId changes
  useEffect(() => {
    if (!focusNodeId || !graphRef.current) return;
    const node = graphData.nodes.find((n: any) => n.id === focusNodeId);
    if (node && node.x !== undefined) {
      graphRef.current.centerAt(node.x, node.y, 800);
      graphRef.current.zoom(4, 800);
    }
    onFocusHandled?.();
  }, [focusNodeId, graphData.nodes, onFocusHandled]);

  // Intercept wheel events on wrapper: two-finger scroll = pan, pinch (ctrl+wheel) = zoom
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      // ctrlKey is true for pinch-to-zoom on Mac trackpad — let the graph's default zoom handle it
      if (e.ctrlKey || e.metaKey) return;

      // Two-finger scroll → pan the graph instead of zoom
      e.preventDefault();
      e.stopImmediatePropagation();

      if (graphRef.current) {
        const center = graphRef.current.centerAt();
        const zoom = graphRef.current.zoom();
        if (center && zoom) {
          graphRef.current.centerAt(
            center.x + e.deltaX / zoom,
            center.y + e.deltaY / zoom
          );
        }
      }
    };

    el.addEventListener("wheel", handler, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", handler, { capture: true } as EventListenerOptions);
  }, []);

  // Auto-zoom to highlighted nodes
  useEffect(() => {
    const prevSet = prevHighlightRef.current;
    const newIds = [...highlightedNodes].filter((id) => !prevSet.has(id));

    if (newIds.length > 0 && graphRef.current) {
      // Center after simulation settles — try twice to catch post-expansion repositioning
      const doCenter = () => {
        const hlNodes = graphData.nodes.filter((n: any) => highlightedNodes.has(n.id));
        if (hlNodes.length > 0 && hlNodes[0].x !== undefined) {
          const avgX = hlNodes.reduce((s: number, n: any) => s + (n.x || 0), 0) / hlNodes.length;
          const avgY = hlNodes.reduce((s: number, n: any) => s + (n.y || 0), 0) / hlNodes.length;
          graphRef.current?.centerAt(avgX, avgY, 800);
          graphRef.current?.zoom(3, 800);
        }
      };
      setTimeout(doCenter, 400);
      setTimeout(doCenter, 1200);
    }
    prevHighlightRef.current = new Set(highlightedNodes);
  }, [highlightedNodes, graphData.nodes]);

  const nodeClickedRef = useRef(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleNodeClick = useCallback(
    (node: any) => {
      nodeClickedRef.current = true;
      onNodeClick(node as GraphNode);
      if (graphRef.current) {
        graphRef.current.centerAt(node.x, node.y, 600);
        graphRef.current.zoom(3.5, 600);
      }
    },
    [onNodeClick]
  );

  // Keep a ref to the latest callback so useEffect doesn't need to re-attach
  const bgClickRef = useRef(onBackgroundClick);
  bgClickRef.current = onBackgroundClick;

  // Track pointer down/up to detect actual clicks (not drags) on empty space
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      nodeClickedRef.current = false;
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      const down = pointerDownPos.current;
      if (!down) return;

      // Only treat as "click" if pointer moved less than 5px (not a drag/pan)
      const dist = Math.sqrt((e.clientX - down.x) ** 2 + (e.clientY - down.y) ** 2);
      if (dist > 5) {
        pointerDownPos.current = null;
        return;
      }

      pointerDownPos.current = null;

      // Give force-graph time to fire onNodeClick
      setTimeout(() => {
        if (!nodeClickedRef.current) {
          bgClickRef.current?.();
        }
        nodeClickedRef.current = false;
      }, 200);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
    };
  }, []); // empty deps — never re-attaches, uses ref for latest callback

  const handleNodeDoubleClick = useCallback(
    (node: any) => {
      onNodeExpand(node.id);
    },
    [onNodeExpand]
  );

  const getColor = useCallback(
    (type: string) => PREMIUM_COLORS[type] || nodeColors[type] || "#64748B",
    [nodeColors]
  );

  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D) => {
      const isHighlighted = highlightedNodes.has(node.id);
      const isSelected = selectedNodeId === node.id;
      const isHovered = hoverNode.current === node.id;
      const isCore = CORE_TYPES.has(node.type);
      const color = isHighlighted ? "#FBBF24" : getColor(node.type);

      const baseSize = isSelected ? 9 : isHighlighted ? 10 : isHovered ? 7 : isCore ? 4.5 : 2.5;

      // Outer glow for highlighted
      if (isHighlighted) {
        const t = Date.now() / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        const glowRadius = baseSize + 8 + pulse * 4;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(251, 191, 36, ${0.06 + pulse * 0.04})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, baseSize + 4, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(251, 191, 36, 0.15)";
        ctx.fill();
      }

      // Hover glow
      if (isHovered && !isHighlighted) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseSize + 4, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}22`;
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseSize, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Selected node: white glow + ring (matches "Selected" legend)
      if (isSelected) {
        // Outer white glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseSize + 7, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, baseSize + 4, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fill();

        // White border ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseSize, 0, 2 * Math.PI);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        // Subtle border for non-selected
        ctx.strokeStyle = isHighlighted
          ? "rgba(251, 191, 36, 0.8)"
          : isHovered
          ? `${color}AA`
          : "rgba(255,255,255,0.12)";
        ctx.lineWidth = isHighlighted ? 2 : isHovered ? 1.5 : 0.3;
        ctx.stroke();
      }

      // Label (always for selected/highlighted, on hover for others)
      if (isSelected || isHighlighted || isHovered) {
        const label = node.label || node.id.split("::")[1] || "";
        const fontSize = isHighlighted ? 4 : 3.5;
        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        // Text background
        const textWidth = ctx.measureText(label).width;
        const padding = 2;
        const bgY = node.y + baseSize + 2;
        ctx.fillStyle = "rgba(9, 9, 11, 0.85)";
        ctx.beginPath();
        ctx.roundRect(
          node.x - textWidth / 2 - padding,
          bgY - 1,
          textWidth + padding * 2,
          fontSize + 3,
          2
        );
        ctx.fill();

        ctx.fillStyle = isSelected ? "#FFFFFF" : isHighlighted ? "#FBBF24" : "#E2E8F0";
        ctx.fillText(label, node.x, bgY);
      }
    },
    [highlightedNodes, selectedNodeId, getColor]
  );

  // Link styling — visible edges with highlight glow
  const getLinkColor = useCallback(
    (link: any) => {
      const srcId = typeof link.source === "string" ? link.source : link.source?.id;
      const tgtId = typeof link.target === "string" ? link.target : link.target?.id;
      if (highlightedNodes.has(srcId) || highlightedNodes.has(tgtId)) {
        return "rgba(251, 191, 36, 0.6)";
      }
      return "rgba(140, 160, 190, 0.3)";
    },
    [highlightedNodes]
  );

  const getLinkWidth = useCallback(
    (link: any) => {
      const srcId = typeof link.source === "string" ? link.source : link.source?.id;
      const tgtId = typeof link.target === "string" ? link.target : link.target?.id;
      if (highlightedNodes.has(srcId) || highlightedNodes.has(tgtId)) {
        return 2;
      }
      return 0.8;
    },
    [highlightedNodes]
  );

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading graph data...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="w-full h-full">
    <ForceGraph2D
      ref={graphRef}
      graphData={graphData}
      nodeId="id"
      nodeLabel=""
      nodeCanvasObject={paintNode}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        const size = highlightedNodes.has(node.id) ? 14 : CORE_TYPES.has(node.type) ? 8 : 5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      onNodeHover={(node: any) => {
        hoverNode.current = node?.id || null;
      }}
      linkColor={getLinkColor}
      linkWidth={getLinkWidth}
      linkDirectionalArrowLength={2.5}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={getLinkColor}
      onNodeClick={handleNodeClick}
      onNodeRightClick={handleNodeDoubleClick}
      backgroundColor="#0A0A0F"
      cooldownTicks={100}
      warmupTicks={50}
      enableNodeDrag={true}
      enableZoomInteraction={true}
      enablePanInteraction={true}
    />
    </div>
  );
}
