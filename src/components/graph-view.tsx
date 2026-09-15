"use client"

import { createElement, useMemo } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { GraphNode, GraphEdge, EdgeType } from "@/lib/graph/types"
import { roomIcon } from "./room-icon"

type RoomData = {
  name: string
  photo?: string
  objects: string[]
  score: number
}

// Custom React Flow node: photo thumbnail (or a name-based icon when none),
// room name, a completeness score, and object tags.
function RoomNode({ data }: NodeProps) {
  const d = data as unknown as RoomData
  return (
    <div className="w-56 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />
      <div className="relative h-28 w-full bg-secondary">
        {d.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.photo} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {createElement(roomIcon(d.name), { className: "h-10 w-10", strokeWidth: 1.5 })}
          </div>
        )}
      </div>
      <div className="p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{d.name}</span>
          <span className="shrink-0 text-xs font-semibold text-emerald-500">{d.score}%</span>
        </div>
        {d.objects.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {d.objects.slice(0, 4).map((o) => (
              <span key={o} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {o}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-muted-foreground" />
    </div>
  )
}

const nodeTypes = { room: RoomNode }

// Topological links carry no door/opening distinction yet — show a readable label.
function edgeLabel(type: EdgeType): string {
  if (type === "contains") return "contient"
  if (type === "adjacent_to") return "adjacent"
  return "passage"
}

export function GraphView({
  nodes,
  edges,
  photosByNode,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  photosByNode: Record<string, string[]>
}) {
  const rfNodes: Node[] = useMemo(() => {
    const cols = Math.max(3, Math.ceil(Math.sqrt(nodes.length || 1)))
    return nodes.map((n, i) => {
      const photos = photosByNode[n.id] ?? []
      const objects = n.metadata.objects ?? []
      const score = Math.min(100, 40 + (photos.length ? 30 : 0) + Math.min(30, objects.length * 10))
      return {
        id: n.id,
        type: "room",
        position: { x: (i % cols) * 300, y: Math.floor(i / cols) * 250 },
        data: { name: n.name?.trim() || "Pièce", photo: photos[0], objects, score },
      }
    })
  }, [nodes, photosByNode])

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: edgeLabel(e.type),
        style: { stroke: "#94a3b8" },
        labelStyle: { fontSize: 11, fill: "#475569" },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      })),
    [edges],
  )

  return (
    <div className="h-full w-full">
      <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
