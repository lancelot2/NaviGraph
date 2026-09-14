"use client"

import type { GraphNode } from "@/lib/graph/types"
import { PlanOverlay, roomCentroid, type RoomStyle } from "@/components/plan-overlay"

const PATH_COLOR = "#2563eb"

// Read-only plan render that highlights the computed path over the floor plan.
// Rooms are drawn as vector <polygon>s by PlanOverlay; this view layers the
// path polyline and step badges on top, and dims off-path rooms.
export function PlanPathView({
  planUrl,
  nodes,
  pathIds,
}: {
  planUrl: string | null
  nodes: GraphNode[]
  pathIds: string[]
}) {
  const stepById = new Map(pathIds.map((id, i) => [id, i]))
  const pathNodes = pathIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is GraphNode => !!n)
  const points = pathNodes
    .map((n) => {
      const c = roomCentroid(n)
      return `${c.x * 100},${c.y * 100}`
    })
    .join(" ")

  const styleFor = (n: GraphNode): RoomStyle | undefined =>
    stepById.has(n.id)
      ? { stroke: PATH_COLOR, fill: "rgba(37,99,235,0.12)" }
      : { opacity: 0.3 }

  return (
    <PlanOverlay planUrl={planUrl} nodes={nodes} styleFor={styleFor}>
      {pathNodes.length > 1 && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={points}
            fill="none"
            stroke={PATH_COLOR}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="6 4"
          />
        </svg>
      )}

      {pathNodes.map((n) => {
        const c = roomCentroid(n)
        return (
          <span
            key={n.id}
            className="absolute flex h-5 w-5 -translate-x-[140%] -translate-y-[140%] items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            {stepById.get(n.id)! + 1}
          </span>
        )
      })}
    </PlanOverlay>
  )
}
