"use client";

interface GraphControlsProps {
  nodeCount: number;
  edgeCount: number;
  isMinimized: boolean;
  onToggleMinimize: () => void;
}

const LEGEND = [
  { color: "#6993FF", label: "Sales Order" },
  { color: "#4ADE80", label: "Delivery" },
  { color: "#FBBF24", label: "Billing" },
  { color: "#A78BFA", label: "Journal Entry" },
  { color: "#F472B6", label: "Payment" },
  { color: "#22D3EE", label: "Customer" },
  { color: "#FB923C", label: "Product" },
  { color: "#94A3B8", label: "Plant" },
];

export default function GraphControls({
  nodeCount,
  edgeCount,
  isMinimized,
  onToggleMinimize,
}: GraphControlsProps) {
  return (
    <div className="absolute top-14 right-3 z-50 animate-fadeIn">
      <div className="bg-zinc-900/90 border border-zinc-800/40 rounded-xl p-3 backdrop-blur-xl shadow-2xl min-w-44">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-zinc-400 font-medium">{nodeCount.toLocaleString()} nodes</p>
            <p className="text-[10px] text-zinc-600">{edgeCount.toLocaleString()} relationships</p>
          </div>
          <button
            onClick={onToggleMinimize}
            className="text-[10px] text-zinc-500 hover:text-white px-2 py-1 rounded-md hover:bg-zinc-800/50 transition-colors"
          >
            {isMinimized ? "Legend" : "Hide"}
          </button>
        </div>

        {!isMinimized && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2.5 pt-2.5 border-t border-zinc-800/40">
            {LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 py-0.5">
                <div
                  className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}33` }}
                />
                <span className="text-[10px] text-zinc-500">{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 py-0.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse border-2 border-white bg-white/20" style={{ boxShadow: "0 0 8px rgba(255,255,255,0.5)" }} />
              <span className="text-[10px] text-zinc-300">Selected</span>
            </div>
          </div>
        )}

        <div className="mt-2.5 pt-2 border-t border-zinc-800/40">
          <p className="text-[9px] text-zinc-600">Click to inspect · Scroll to pan · Pinch to zoom</p>
        </div>
      </div>
    </div>
  );
}
