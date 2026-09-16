"use client"

import { useState, type ReactNode } from "react"
import { PlanView } from "./plan-view"
import { GraphView } from "./graph-view"
import type { GraphNode, GraphEdge } from "@/lib/graph/types"

// Main-area workspace with two tabs: the coloured plan image and the room graph.
export function PlanWorkspace({
  projectId,
  overlayUrl,
  planUrl,
  nodes,
  edges,
  photosByNode,
}: {
  projectId: string
  overlayUrl: string | null
  planUrl: string | null
  nodes: GraphNode[]
  edges: GraphEdge[]
  photosByNode: Record<string, string[]>
}) {
  // Default to the graph for scan projects (no plan image to colour).
  const [tab, setTab] = useState<"plan" | "graph">(
    overlayUrl || planUrl ? "plan" : "graph",
  )

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card/60 px-3 py-1.5">
        <TabBtn active={tab === "plan"} onClick={() => setTab("plan")}>
          Plan coloré
        </TabBtn>
        <TabBtn active={tab === "graph"} onClick={() => setTab("graph")}>
          Graphe
        </TabBtn>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "plan" ? (
          <PlanView
            projectId={projectId}
            overlayUrl={overlayUrl}
            planUrl={planUrl}
            nodes={nodes}
          />
        ) : (
          <GraphView
            projectId={projectId}
            nodes={nodes}
            edges={edges}
            photosByNode={photosByNode}
          />
        )}
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/50"
      }`}
    >
      {children}
    </button>
  )
}
