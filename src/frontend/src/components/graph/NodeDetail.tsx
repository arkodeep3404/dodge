"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchNodeDetail } from "@/lib/api";
import type { GraphNode, NodeDetail as NodeDetailType } from "@/lib/types";

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";

  // Time objects like {"hours":5,"minutes":2,"seconds":26}
  if (typeof value === "object" && value !== null && "hours" in (value as any)) {
    const t = value as { hours: number; minutes: number; seconds: number };
    const h = String(t.hours).padStart(2, "0");
    const m = String(t.minutes).padStart(2, "0");
    const s = String(t.seconds).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  const str = String(value);

  // ISO dates like "2025-04-02T00:00:00.000Z"
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    try {
      const d = new Date(str);
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
        (str.includes("T00:00:00") ? "" : " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    } catch { return str; }
  }

  // Date-only like "2025-04-02"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    try {
      const d = new Date(str + "T00:00:00");
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch { return str; }
  }

  // Booleans
  if (str === "true") return "Yes";
  if (str === "false") return "No";

  // Other objects
  if (typeof value === "object") return JSON.stringify(value);

  return str;
}

interface NodeDetailProps {
  node: GraphNode | null;
  onClose: () => void;
  onExpand?: (nodeId: string) => void;
  isInHighlightPath?: boolean;
  onClearConnections?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  sales_order: "Sales Order",
  sales_order_item: "Order Item",
  schedule_line: "Schedule Line",
  delivery: "Delivery",
  delivery_item: "Delivery Item",
  billing_document: "Billing Document",
  billing_item: "Billing Item",
  billing_cancellation: "Cancellation",
  journal_entry: "Journal Entry",
  payment: "Payment",
  customer: "Customer",
  address: "Address",
  product: "Product",
  plant: "Plant",
  product_description: "Product Description",
  customer_company: "Company Assignment",
  customer_sales_area: "Sales Area",
};

const TYPE_COLORS: Record<string, string> = {
  sales_order: "#6993FF",
  delivery: "#4ADE80",
  billing_document: "#FBBF24",
  journal_entry: "#A78BFA",
  payment: "#F472B6",
  customer: "#22D3EE",
  product: "#FB923C",
  plant: "#94A3B8",
};

export default function NodeDetail({ node, onClose, onExpand, isInHighlightPath, onClearConnections }: NodeDetailProps) {
  const [detail, setDetail] = useState<NodeDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [visible, setVisible] = useState(false);
  const [displayNode, setDisplayNode] = useState<GraphNode | null>(null);
  const [panelWidth, setPanelWidth] = useState(320);
  const isDragging = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startW = panelWidth;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - startX;
      setPanelWidth(Math.min(Math.max(startW + delta, 260), 500));
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  useEffect(() => {
    if (node) {
      setDisplayNode(node);
      // Small delay so the DOM mounts first, then animate in
      requestAnimationFrame(() => setVisible(true));
      setLoading(true);
      setShowAll(false);
      fetchNodeDetail(node.id)
        .then(setDetail)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      // Animate out, then unmount
      setVisible(false);
      const timer = setTimeout(() => {
        setDisplayNode(null);
        setDetail(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [node]);

  if (!displayNode) return null;

  const rawProps = detail?.raw_properties || displayNode.properties || {};
  const displayEntries = Object.entries(rawProps).filter(
    ([, v]) => v !== null && v !== "" && v !== undefined
  );
  const visibleEntries = showAll ? displayEntries : displayEntries.slice(0, 10);
  const typeLabel = TYPE_LABELS[displayNode.type] || displayNode.type;
  const typeColor = TYPE_COLORS[displayNode.type] || "#64748B";

  return (
    <div
      className={`absolute top-14 left-3 z-50 bg-zinc-900/95 border border-zinc-800/40 rounded-xl backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-200 ease-out ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}
      style={{ width: panelWidth }}
    >
      {/* Colored top accent */}
      <div className="h-0.5" style={{ backgroundColor: typeColor }} />

      {/* Header */}
      <div className="px-4 py-3 flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">
            {detail?.label || displayNode.label}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `${typeColor}15`,
                color: typeColor,
                border: `1px solid ${typeColor}25`,
              }}
            >
              {typeLabel}
            </span>
            <span className="text-[10px] text-zinc-600">
              {detail?.connections ?? "..."} connections
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-white p-1 rounded-lg hover:bg-zinc-800/50 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Properties */}
      <div className="px-4 pb-3 border-t border-zinc-800/30 pt-2">
        {loading ? (
          <div className="py-6 text-center">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-zinc-600">Loading...</p>
          </div>
        ) : (
          <>
            <div className="max-h-72 overflow-auto pr-2 pb-1">
              <div className="space-y-0.5 min-w-max">
                {visibleEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between items-start text-xs py-1 hover:bg-zinc-800/20 rounded px-1 -mx-1 transition-colors gap-4">
                    <span className="text-zinc-500 shrink-0 select-all whitespace-nowrap">{key}</span>
                    <span className="text-zinc-300 text-right font-mono text-[11px] select-all whitespace-nowrap">
                      {formatValue(key, value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {displayEntries.length > 10 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 mt-2 transition-colors"
              >
                {showAll ? "Show less" : `Show all ${displayEntries.length} fields`}
              </button>
            )}
          </>
        )}

        {/* Show / Hide Connections */}
        {node && (
          <div className="mt-3">
            {isInHighlightPath ? (
              <button
                onClick={() => onClearConnections?.()}
                className="w-full flex items-center justify-center gap-2 text-[11px] font-medium text-amber-400 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg py-2 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
                Hide Connections
              </button>
            ) : (
              <button
                onClick={() => onExpand?.(displayNode.id)}
                className="w-full flex items-center justify-center gap-2 text-[11px] font-medium text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg py-2 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Show Connections
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right edge drag handle for resize */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors"
      />
    </div>
  );
}
