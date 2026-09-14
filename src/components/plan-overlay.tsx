"use client"

import { useState, type ReactNode } from "react"
import type { GraphNode, NodeType, Point, Bounds } from "@/lib/graph/types"

const TYPE_COLOR: Record<NodeType, string> = {
  room: "#3b82f6",
  entrance: "#22c55e",
  stair: "#f59e0b",
  elevator: "#a855f7",
  landmark: "#ef4444",
  door: "#0ea5e9",
  entrance_door: "#06b6d4",
  window: "#f97316",
  opening: "#84cc16",
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

// Per-room visual override (used by the path view to dim/emphasize rooms).
export type RoomStyle = {
  stroke?: string
  fill?: string
  opacity?: number
}

export type PlanOverlayProps = {
  planUrl: string | null
  nodes: GraphNode[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  // Optional per-node style override.
  styleFor?: (node: GraphNode) => RoomStyle | undefined
  // Extra HTML layer stacked above the rooms in the same normalized space
  // (e.g. the computed-path polyline and step badges).
  children?: ReactNode
}

// The room outline as normalized [0,1] polygon points: the stored polygon when
// present, otherwise the bounds rectangle (with a centroid-based fallback box).
function polygonOf(n: GraphNode): Point[] {
  const pts = n.metadata.points
  if (pts && pts.length >= 3) return pts
  const b: Bounds = n.metadata.bounds ?? {
    x: clamp(n.pos_x / 800 - 0.08, 0, 0.82),
    y: clamp(n.pos_y / 600 - 0.06, 0, 0.86),
    w: 0.16,
    h: 0.12,
  }
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ]
}

function centroidOf(poly: Point[]): Point {
  const x = poly.reduce((s, p) => s + p.x, 0) / poly.length
  const y = poly.reduce((s, p) => s + p.y, 0) / poly.length
  return { x, y }
}

// Normalized [0,1] centroid of a room's outline — shared with the path view so
// its polyline/badges sit on the same geometry the overlay draws.
export function roomCentroid(n: GraphNode): Point {
  return centroidOf(polygonOf(n))
}

// Read-only vectorial overlay: renders every room as an interactive <polygon>
// over the plan image, with a centroid label. viewBox is 0..100 with
// preserveAspectRatio="none" so normalized coordinates stretch to the image box
// regardless of its pixel size. Room labels are HTML (not <text>) to stay
// undistorted by that non-uniform stretch.
export function PlanOverlay({
  planUrl,
  nodes,
  selectedId,
  onSelect,
  styleFor,
  children,
}: PlanOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const interactive = !!onSelect

  const rooms = nodes.map((n) => {
    const poly = polygonOf(n)
    return { node: n, poly, center: centroidOf(poly) }
  })

  return (
    <div className="relative w-full overflow-hidden rounded-lg border bg-white">
      {planUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={planUrl} alt="Floor plan" className="block w-full" draggable={false} />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">
          No plan image.
        </div>
      )}

      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {rooms.map(({ node, poly }) => {
          const base = TYPE_COLOR[node.type]
          const override = styleFor?.(node)
          const selected = node.id === selectedId
          const hovered = node.id === hoveredId
          const stroke = override?.stroke ?? base
          const fill = override?.fill ?? `${base}22`
          return (
            <polygon
              key={node.id}
              points={poly.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill={selected || hovered ? stroke + "33" : fill}
              fillOpacity={override?.opacity ?? 1}
              stroke={stroke}
              strokeWidth={selected ? 3 : hovered ? 2.5 : 1.75}
              strokeOpacity={override?.opacity ?? 1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ cursor: interactive ? "pointer" : "default" }}
              onClick={interactive ? () => onSelect(selected ? null : node.id) : undefined}
              onMouseEnter={interactive ? () => setHoveredId(node.id) : undefined}
              onMouseLeave={interactive ? () => setHoveredId(null) : undefined}
            />
          )
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0">
        {rooms.map(({ node, center }) => {
          const color = styleFor?.(node)?.stroke ?? TYPE_COLOR[node.type]
          const opacity = styleFor?.(node)?.opacity ?? 1
          return (
            <span
              key={node.id}
              className="absolute max-w-[95%] -translate-x-1/2 -translate-y-1/2 truncate rounded bg-white/85 px-1 text-[11px] font-medium leading-tight"
              style={{
                left: `${center.x * 100}%`,
                top: `${center.y * 100}%`,
                color,
                opacity,
              }}
            >
              {node.name?.trim() || `Unnamed ${node.type}`}
            </span>
          )
        })}
        {children}
      </div>
    </div>
  )
}
