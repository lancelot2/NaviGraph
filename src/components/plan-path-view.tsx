"use client"

import type { GraphNode, NodeType, Bounds } from "@/lib/graph/types"

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

function boundsOf(n: GraphNode): Bounds {
  const pts = n.metadata.points
  if (pts && pts.length >= 3) {
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }
  if (n.metadata.bounds) return n.metadata.bounds
  return {
    x: clamp(n.pos_x / 800 - 0.08, 0, 0.82),
    y: clamp(n.pos_y / 600 - 0.06, 0, 0.86),
    w: 0.16,
    h: 0.12,
  }
}

// Read-only plan render that highlights the computed path over the floor plan.
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
      const b = boundsOf(n)
      return `${(b.x + b.w / 2) * 100},${(b.y + b.h / 2) * 100}`
    })
    .join(" ")

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

      <div className="absolute inset-0">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {pathNodes.length > 1 && (
            <polyline
              points={points}
              fill="none"
              stroke="#2563eb"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {nodes.map((n) => {
          const b = boundsOf(n)
          const step = stepById.get(n.id)
          const inPath = step !== undefined
          return (
            <div
              key={n.id}
              className={`absolute rounded border-2 ${inPath ? "" : "opacity-30"}`}
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.w * 100}%`,
                height: `${b.h * 100}%`,
                borderColor: inPath ? "#2563eb" : TYPE_COLOR[n.type],
                background: inPath ? "rgba(37,99,235,0.12)" : "transparent",
              }}
            >
              {inPath && (
                <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                  {step + 1}
                </span>
              )}
              <span
                className="pointer-events-none absolute left-1 top-1 max-w-[95%] truncate rounded bg-white/85 px-1 text-[11px] font-medium leading-tight"
                style={{ color: inPath ? "#2563eb" : TYPE_COLOR[n.type] }}
              >
                {n.name?.trim() || `Unnamed ${n.type}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
