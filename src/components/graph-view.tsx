"use client"

import { createElement, useEffect } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { GraphNode, GraphEdge, EdgeType } from "@/lib/graph/types"
import { useEditorStore } from "@/lib/store/editor"
import { setNodePosition } from "@/app/projects/spatial-actions"
import { roomIcon } from "./room-icon"

type RoomData = {
  name: string
  photo?: string
  objects: string[]
  score: number
  isSelected: boolean
}

// Custom React Flow node: photo thumbnail (or a name-based icon when none),
// room name, a completeness score, and object tags. Highlights when selected.
function RoomNode({ data }: NodeProps) {
  const d = data as unknown as RoomData
  return (
    <div
      className={`w-56 overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow ${
        d.isSelected ? "border-blue-500 ring-2 ring-blue-500/40" : "border-border"
      }`}
    >
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

function buildNodes(
  nodes: GraphNode[],
  photosByNode: Record<string, string[]>,
  selectedId: string | null,
): Node[] {
  return nodes.map((n) => {
    const photos = photosByNode[n.id] ?? []
    const objects = n.metadata.objects ?? []
    const score = Math.min(100, 40 + (photos.length ? 30 : 0) + Math.min(30, objects.length * 10))
    return {
      id: n.id,
      type: "room",
      position: { x: n.pos_x, y: n.pos_y },
      data: {
        name: n.name?.trim() || "Pièce",
        photo: photos[0],
        objects,
        score,
        isSelected: n.id === selectedId,
      },
    }
  })
}

function buildEdges(edges: GraphEdge[], selectedEdgeId: string | null): Edge[] {
  return edges.map((e) => {
    const selected = e.id === selectedEdgeId
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: edgeLabel(e.type),
      selected,
      animated: selected,
      style: {
        stroke: selected ? "#3b82f6" : "#94a3b8",
        strokeWidth: selected ? 3 : 1,
      },
      labelStyle: { fontSize: 11, fill: selected ? "#1d4ed8" : "#475569" },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
    }
  })
}

function GraphFlow({
  projectId,
  nodes,
  edges,
  photosByNode,
}: {
  projectId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  photosByNode: Record<string, string[]>
}) {
  const selectedId = useEditorStore((s) => s.selectedId)
  const setSelectedId = useEditorStore((s) => s.setSelectedId)
  const selectedEdgeId = useEditorStore((s) => s.selectedEdgeId)
  const setSelectedEdgeId = useEditorStore((s) => s.setSelectedEdgeId)
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { getNode, setCenter } = useReactFlow()

  // Rebuild from server data when the graph changes (new detection / reload).
  // Intentionally excludes selectedId so re-selecting never resets positions.
  useEffect(() => {
    setRfNodes(buildNodes(nodes, photosByNode, useEditorStore.getState().selectedId))
  }, [nodes, photosByNode, setRfNodes])

  // Edges carry no live layout, so rebuilding on selection is cheap and keeps the
  // highlight (Catalogue click ↔ graph) in sync.
  useEffect(() => {
    setRfEdges(buildEdges(edges, selectedEdgeId))
  }, [edges, selectedEdgeId, setRfEdges])

  // Bring the selected association into view (centre between its two endpoints).
  useEffect(() => {
    if (!selectedEdgeId) return
    const e = edges.find((x) => x.id === selectedEdgeId)
    if (!e) return
    const a = getNode(e.source)
    const b = getNode(e.target)
    if (a && b)
      setCenter(
        (a.position.x + b.position.x) / 2 + 112,
        (a.position.y + b.position.y) / 2 + 96,
        { zoom: 1.1, duration: 400 },
      )
  }, [selectedEdgeId, edges, getNode, setCenter])

  // Reflect the shared selection (e.g. a click in the Catalogue) onto the graph,
  // preserving live positions, and bring the selected card into view.
  useEffect(() => {
    setRfNodes((ns) =>
      ns.map((n) => ({ ...n, data: { ...n.data, isSelected: n.id === selectedId } })),
    )
    if (selectedId) {
      const n = getNode(selectedId)
      if (n) setCenter(n.position.x + 112, n.position.y + 96, { zoom: 1.15, duration: 400 })
    }
  }, [selectedId, getNode, setCenter, setRfNodes])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          const cur = useEditorStore.getState().selectedId
          setSelectedId(cur === node.id ? null : node.id)
        }}
        onEdgeClick={(_, edge) => {
          const cur = useEditorStore.getState().selectedEdgeId
          setSelectedEdgeId(cur === edge.id ? null : edge.id)
        }}
        onNodeDragStop={(_, node) => {
          void setNodePosition(projectId, node.id, node.position.x, node.position.y)
        }}
        onPaneClick={() => {
          setSelectedId(null)
          setSelectedEdgeId(null)
        }}
        selectNodesOnDrag={false}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}

// ReactFlowProvider is required for the useReactFlow hook (centering on select).
export function GraphView(props: {
  projectId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  photosByNode: Record<string, string[]>
}) {
  return (
    <ReactFlowProvider>
      <GraphFlow {...props} />
    </ReactFlowProvider>
  )
}
