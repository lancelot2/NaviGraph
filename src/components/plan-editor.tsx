"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  NODE_TYPES,
  type GraphNode,
  type NodeType,
  type Bounds,
  type Point,
} from "@/lib/graph/types"
import {
  setNodeBounds,
  setNodePoints,
  addNode,
  addPolygonNode,
  deleteNode,
} from "@/app/projects/spatial-actions"
import { addNodePhoto } from "@/app/projects/actions"
import { useEditorStore } from "@/lib/store/editor"
import { Button } from "@/components/ui/button"

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

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
type Dir = (typeof HANDLES)[number]

const HANDLE_STYLE: Record<Dir, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

// Bounding box of a polygon.
function bbox(points: Point[]): Bounds {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// Kept at module scope so the zoom level survives the editor remounting.
let persistedZoom = 1

function initialBounds(n: GraphNode): Bounds {
  if (n.metadata.bounds) return n.metadata.bounds
  return {
    x: clamp(n.pos_x / 800 - 0.08, 0, 0.82),
    y: clamp(n.pos_y / 600 - 0.06, 0, 0.86),
    w: 0.16,
    h: 0.12,
  }
}

type Room = {
  id: string
  name: string | null
  type: NodeType
  floor: number
  bounds: Bounds
  points?: Point[] // present → polygon (bounds is its bbox)
}

function toRoom(n: GraphNode): Room {
  const pts = n.metadata.points
  const base = { id: n.id, name: n.name, type: n.type, floor: n.floor }
  if (pts && pts.length >= 3) return { ...base, points: pts, bounds: bbox(pts) }
  return { ...base, bounds: initialBounds(n) }
}

export function PlanEditor({
  projectId,
  revision,
  planUrl,
  nodes,
  photosByNode,
}: {
  projectId: string
  revision: string
  planUrl: string | null
  nodes: GraphNode[]
  photosByNode: Record<string, string[]>
}) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [rooms, setRooms] = useState<Room[]>(() => nodes.map(toRoom))
  const selectedId = useEditorStore((s) => s.selectedId)
  const setSelectedId = useEditorStore((s) => s.setSelectedId)

  // Reconcile local rooms with the server graph when it changes (create / delete
  // / rename / photo / assistant) — without remounting, so the plan image and
  // zoom/scroll are preserved. Adjusting state during render is React's canonical
  // pattern for "reset state when a prop changes".
  const [prevRevision, setPrevRevision] = useState(revision)
  if (prevRevision !== revision) {
    setPrevRevision(revision)
    setRooms(nodes.map(toRoom))
  }

  // Keep the plan image src stable across refreshes: signed URLs change every
  // server render, but the underlying file (the path before "?") usually does
  // not — so only swap src (and reload the image) when the path changes.
  const pathOf = (u: string | null) => (u ? u.split("?")[0] : u)
  const [imgSrc, setImgSrc] = useState(planUrl)
  const [imgPath, setImgPath] = useState(() => pathOf(planUrl))
  if (pathOf(planUrl) !== imgPath) {
    setImgPath(pathOf(planUrl))
    setImgSrc(planUrl)
  }

  const [zoom, setZoom] = useState(() => persistedZoom)
  useEffect(() => {
    persistedZoom = zoom
  }, [zoom])

  // Trackpad pinch / ctrl+wheel to zoom (plain two-finger scroll still pans).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => clamp(Math.round((z - e.deltaY * 0.01) * 100) / 100, 0.5, 3))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // Object type used by both draw modes.
  const [newType, setNewType] = useState<NodeType>("room")

  // Draw-to-create (rectangle): pick a type, then drag a box on the plan.
  const [drawType, setDrawType] = useState<NodeType | null>(null)
  const drawStart = useRef<{ x: number; y: number } | null>(null)
  const previewRef = useRef<Bounds | null>(null)
  const [preview, setPreview] = useState<Bounds | null>(null)

  // Click-to-draw (polygon): click each corner, then close the shape.
  const [polyType, setPolyType] = useState<NodeType | null>(null)
  const [polyPoints, setPolyPoints] = useState<Point[]>([])
  const [polyCursor, setPolyCursor] = useState<Point | null>(null)

  function patch(id: string, next: Partial<Room>) {
    setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)))
  }

  function relPoint(e: React.PointerEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    }
  }

  // ── Rectangle draw ────────────────────────────────────────────────
  function drawDown(e: React.PointerEvent) {
    const p = relPoint(e)
    if (!p) return
    drawStart.current = p
    const b = { ...p, w: 0, h: 0 }
    previewRef.current = b
    setPreview(b)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function drawMove(e: React.PointerEvent) {
    const s = drawStart.current
    if (!s) return
    const p = relPoint(e)
    if (!p) return
    const b = {
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    }
    previewRef.current = b
    setPreview(b)
  }
  async function drawUp() {
    const p = previewRef.current
    const t = drawType
    drawStart.current = null
    previewRef.current = null
    setPreview(null)
    setDrawType(null)
    if (p && t && p.w > 0.02 && p.h > 0.02) {
      const id = await addNode(projectId, t, p)
      setSelectedId(id)
      router.refresh()
    }
  }

  // ── Polygon draw ──────────────────────────────────────────────────
  const CLOSE_DIST = 0.025
  function polyDown(e: React.PointerEvent) {
    const p = relPoint(e)
    if (!p) return
    if (
      polyPoints.length >= 3 &&
      Math.hypot(p.x - polyPoints[0].x, p.y - polyPoints[0].y) < CLOSE_DIST
    ) {
      void finishPolygon()
      return
    }
    setPolyPoints((pts) => [...pts, p])
  }
  async function finishPolygon() {
    const pts = polyPoints
    const t = polyType
    setPolyType(null)
    setPolyPoints([])
    setPolyCursor(null)
    if (t && pts.length >= 3) {
      const id = await addPolygonNode(projectId, t, pts)
      setSelectedId(id)
      router.refresh()
    }
  }
  function cancelPolygon() {
    setPolyType(null)
    setPolyPoints([])
    setPolyCursor(null)
  }

  // Enter finishes a polygon, Escape cancels either draw mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cancelPolygon()
        setDrawType(null)
        setPreview(null)
        drawStart.current = null
      } else if (e.key === "Enter" && polyType && polyPoints.length >= 3) {
        void finishPolygon()
      } else if (e.key === "Backspace" && polyType && polyPoints.length > 0) {
        e.preventDefault()
        setPolyPoints((pts) => pts.slice(0, -1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyType, polyPoints])

  function deleteRoom(id: string) {
    setRooms((rs) => rs.filter((r) => r.id !== id))
    setSelectedId(null)
    void deleteNode(projectId, id).then(() => router.refresh())
  }

  // ── Keyboard: delete + copy / paste the selected object ───────────
  const stateRef = useRef({ rooms, selectedId, drawing: false })
  stateRef.current = { rooms, selectedId, drawing: !!(drawType || polyType) }
  const clipboard = useRef<{
    type: NodeType
    bounds?: Bounds
    points?: Point[]
  } | null>(null)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      const { rooms, selectedId, drawing } = stateRef.current
      // Backspace / Delete removes the selected object (not while drawing).
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId && !drawing) {
        e.preventDefault()
        deleteRoom(selectedId)
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === "c" && selectedId) {
        const r = rooms.find((x) => x.id === selectedId)
        if (r) {
          clipboard.current = r.points
            ? { type: r.type, points: r.points }
            : { type: r.type, bounds: r.bounds }
          e.preventDefault()
        }
      } else if (e.key === "v" && clipboard.current) {
        e.preventDefault()
        const c = clipboard.current
        if (c.points) {
          const shifted = c.points.map((p) => ({
            x: clamp(p.x + 0.03, 0, 1),
            y: clamp(p.y + 0.03, 0, 1),
          }))
          void addPolygonNode(projectId, c.type, shifted).then((id) => {
            setSelectedId(id)
            router.refresh()
          })
        } else if (c.bounds) {
          const b: Bounds = {
            ...c.bounds,
            x: clamp(c.bounds.x + 0.03, 0, 1 - c.bounds.w),
            y: clamp(c.bounds.y + 0.03, 0, 1 - c.bounds.h),
          }
          void addNode(projectId, c.type, b).then((id) => {
            setSelectedId(id)
            router.refresh()
          })
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function handleDropPhoto(nodeId: string, file: File) {
    const fd = new FormData()
    fd.append("photo", file)
    void addNodePhoto(projectId, nodeId, fd).then(() => router.refresh())
  }

  const drawing = drawType || polyType

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
        <button
          onClick={() => setZoom((z) => clamp(z - 0.25, 0.5, 3))}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
        >
          −
        </button>
        <span className="w-11 text-center text-xs tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => clamp(z + 0.25, 0.5, 3))}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
        >
          +
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        {drawType ? (
          <>
            <span className="px-1 text-xs text-muted-foreground">
              Drag the {drawType} box on the plan…
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDrawType(null)
                setPreview(null)
                drawStart.current = null
              }}
            >
              Cancel
            </Button>
          </>
        ) : polyType ? (
          <>
            <span className="px-1 text-xs text-muted-foreground">
              Click each corner · {polyPoints.length} added
              {polyPoints.length >= 3 ? " · click the first point to close" : ""}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={polyPoints.length < 3}
              onClick={() => void finishPolygon()}
            >
              Finish
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelPolygon}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as NodeType)}
              className="h-7 rounded border border-input bg-transparent px-1 text-xs"
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={() => setDrawType(newType)}>
              Box
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPolyPoints([])
                setPolyCursor(null)
                setPolyType(newType)
              }}
            >
              Polygon
            </Button>
          </>
        )}
      </div>

      <div ref={scrollRef} className="bg-grid h-full w-full overflow-auto bg-secondary/50">
        <div
          ref={containerRef}
          className="relative mx-auto my-4 select-none"
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null)
          }}
        >
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt="Floor plan"
              className="block w-full rounded border bg-white"
              draggable={false}
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded border bg-white text-sm text-muted-foreground">
              No plan image — upload one to see rooms over the plan.
            </div>
          )}

          {rooms.map((r) =>
            r.points ? (
              <RoomPolygon
                key={r.id}
                room={r}
                points={r.points}
                selected={r.id === selectedId}
                photos={photosByNode[r.id] ?? []}
                containerRef={containerRef}
                onSelect={() => setSelectedId(r.id)}
                onChange={(pts) => patch(r.id, { points: pts, bounds: bbox(pts) })}
                onCommit={(pts) => setNodePoints(projectId, r.id, pts)}
                onDropPhoto={(file) => handleDropPhoto(r.id, file)}
              />
            ) : (
              <RoomBox
                key={r.id}
                room={r}
                selected={r.id === selectedId}
                photos={photosByNode[r.id] ?? []}
                containerRef={containerRef}
                onSelect={() => setSelectedId(r.id)}
                onChange={(b) => patch(r.id, { bounds: b })}
                onCommit={(b) => setNodeBounds(projectId, r.id, b)}
                onDropPhoto={(file) => handleDropPhoto(r.id, file)}
              />
            ),
          )}

          {drawType && (
            <div
              className="absolute inset-0 z-10 cursor-crosshair"
              onPointerDown={drawDown}
              onPointerMove={drawMove}
              onPointerUp={drawUp}
            >
              {preview && (
                <div
                  className="absolute rounded border-2 border-dashed"
                  style={{
                    left: `${preview.x * 100}%`,
                    top: `${preview.y * 100}%`,
                    width: `${preview.w * 100}%`,
                    height: `${preview.h * 100}%`,
                    borderColor: TYPE_COLOR[drawType],
                    background: `${TYPE_COLOR[drawType]}22`,
                  }}
                />
              )}
            </div>
          )}

          {polyType && (
            <div
              className="absolute inset-0 z-10 cursor-crosshair"
              onPointerDown={polyDown}
              onPointerMove={(e) => setPolyCursor(relPoint(e))}
              onDoubleClick={() => {
                if (polyPoints.length >= 3) void finishPolygon()
              }}
            >
              <svg
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {polyPoints.length > 0 && (
                  <polyline
                    points={[...polyPoints, ...(polyCursor ? [polyCursor] : [])]
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill={`${TYPE_COLOR[polyType]}22`}
                    stroke={TYPE_COLOR[polyType]}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              {/* Corner dots as fixed-size HTML so they don't scale with the
                  overlay's SVG coordinate space. */}
              {polyPoints.map((p, i) => {
                const closable = i === 0 && polyPoints.length >= 3
                return (
                  <div
                    key={i}
                    className="pointer-events-none absolute rounded-full border-2"
                    style={{
                      left: `${p.x * 100}%`,
                      top: `${p.y * 100}%`,
                      width: closable ? 14 : 10,
                      height: closable ? 14 : 10,
                      transform: "translate(-50%, -50%)",
                      borderColor: TYPE_COLOR[polyType],
                      background: closable ? TYPE_COLOR[polyType] : "#fff",
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {drawing && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
          {polyType
            ? "Esc to cancel · Enter or double-click to finish"
            : "Esc to cancel"}
        </div>
      )}
    </div>
  )
}

function RoomBox({
  room,
  selected,
  photos,
  containerRef,
  onSelect,
  onChange,
  onCommit,
  onDropPhoto,
}: {
  room: Room
  selected: boolean
  photos: string[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onSelect: () => void
  onChange: (b: Bounds) => void
  onCommit: (b: Bounds) => void
  onDropPhoto: (file: File) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const drag = useRef<{
    dir: Dir | "move"
    px: number
    py: number
    start: Bounds
    rect: DOMRect
  } | null>(null)
  const latest = useRef<Bounds>(room.bounds)
  const color = TYPE_COLOR[room.type]

  useEffect(() => {
    if (selected)
      boxRef.current?.scrollIntoView({ block: "center", inline: "center" })
  }, [selected])

  function begin(dir: Dir | "move", e: React.PointerEvent) {
    e.stopPropagation()
    onSelect()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    latest.current = { ...room.bounds }
    drag.current = { dir, px: e.clientX, py: e.clientY, start: { ...room.bounds }, rect }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.px) / d.rect.width
    const dy = (e.clientY - d.py) / d.rect.height
    const s = d.start
    const MIN = 0.02
    let b: Bounds
    if (d.dir === "move") {
      b = {
        ...s,
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
      }
    } else {
      let { x, y, w, h } = s
      if (d.dir.includes("e")) w = clamp(s.w + dx, MIN, 1 - s.x)
      if (d.dir.includes("s")) h = clamp(s.h + dy, MIN, 1 - s.y)
      if (d.dir.includes("w")) {
        const nx = clamp(s.x + dx, 0, s.x + s.w - MIN)
        w = s.x + s.w - nx
        x = nx
      }
      if (d.dir.includes("n")) {
        const ny = clamp(s.y + dy, 0, s.y + s.h - MIN)
        h = s.y + s.h - ny
        y = ny
      }
      b = { x, y, w, h }
    }
    latest.current = b
    onChange(b)
  }

  function end() {
    if (!drag.current) return
    drag.current = null
    onCommit(latest.current)
  }

  return (
    <div
      ref={boxRef}
      className={`absolute rounded border-2 ${dragOver ? "bg-blue-500/20 ring-2 ring-blue-500" : "bg-white/10"} ${selected ? "z-10 ring-2 ring-offset-1" : ""}`}
      style={{
        left: `${room.bounds.x * 100}%`,
        top: `${room.bounds.y * 100}%`,
        width: `${room.bounds.w * 100}%`,
        height: `${room.bounds.h * 100}%`,
        borderColor: color,
        cursor: "move",
      }}
      onPointerDown={(e) => begin("move", e)}
      onPointerMove={move}
      onPointerUp={end}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.type.startsWith("image/"),
        )
        if (file) onDropPhoto(file)
      }}
    >
      <RoomLabel name={room.name} type={room.type} color={color} />
      <RoomPhotos photos={photos} />

      {selected &&
        HANDLES.map((dir) => (
          <div
            key={dir}
            className={`absolute h-2.5 w-2.5 rounded-sm border border-white bg-foreground ${HANDLE_STYLE[dir]}`}
            onPointerDown={(e) => begin(dir, e)}
            onPointerMove={move}
            onPointerUp={end}
          />
        ))}
    </div>
  )
}

function RoomPolygon({
  room,
  points,
  selected,
  photos,
  containerRef,
  onSelect,
  onChange,
  onCommit,
  onDropPhoto,
}: {
  room: Room
  points: Point[]
  selected: boolean
  photos: string[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onSelect: () => void
  onChange: (pts: Point[]) => void
  onCommit: (pts: Point[]) => void
  onDropPhoto: (file: File) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const drag = useRef<{ px: number; py: number; start: Point[]; rect: DOMRect } | null>(
    null,
  )
  const latest = useRef<Point[]>(points)
  const color = TYPE_COLOR[room.type]
  const b = room.bounds

  useEffect(() => {
    if (selected)
      boxRef.current?.scrollIntoView({ block: "center", inline: "center" })
  }, [selected])

  function begin(e: React.PointerEvent) {
    e.stopPropagation()
    onSelect()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const start = points.map((p) => ({ ...p }))
    latest.current = start
    drag.current = { px: e.clientX, py: e.clientY, start, rect }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.px) / d.rect.width
    const dy = (e.clientY - d.py) / d.rect.height
    const box = bbox(d.start)
    const tdx = clamp(dx, -box.x, 1 - box.w - box.x)
    const tdy = clamp(dy, -box.y, 1 - box.h - box.y)
    const next = d.start.map((p) => ({ x: p.x + tdx, y: p.y + tdy }))
    latest.current = next
    onChange(next)
  }
  function end() {
    if (!drag.current) return
    drag.current = null
    onCommit(latest.current)
  }

  // Polygon points as percentages within the bounding box, for the SVG.
  const local = points
    .map((p) => `${((p.x - b.x) / (b.w || 1)) * 100},${((p.y - b.y) / (b.h || 1)) * 100}`)
    .join(" ")

  return (
    <div
      ref={boxRef}
      className="absolute"
      style={{
        left: `${b.x * 100}%`,
        top: `${b.y * 100}%`,
        width: `${b.w * 100}%`,
        height: `${b.h * 100}%`,
        cursor: "move",
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.type.startsWith("image/"),
        )
        if (file) onDropPhoto(file)
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        <polygon
          points={local}
          fill={dragOver ? `${color}44` : `${color}22`}
          stroke={color}
          strokeWidth={selected ? 3 : 2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <RoomLabel name={room.name} type={room.type} color={color} />
      <RoomPhotos photos={photos} />
    </div>
  )
}

function RoomLabel({
  name,
  type,
  color,
}: {
  name: string | null
  type: NodeType
  color: string
}) {
  return (
    <span
      className="pointer-events-none absolute left-1 top-1 max-w-[95%] truncate rounded bg-white/85 px-1 text-[11px] font-medium leading-tight"
      style={{ color }}
    >
      {name?.trim() || `Unnamed ${type}`}
    </span>
  )
}

function RoomPhotos({ photos }: { photos: string[] }) {
  if (photos.length === 0) return null
  return (
    <div className="pointer-events-none absolute bottom-1 left-1 flex gap-1">
      {photos.slice(0, 3).map((url) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          className="h-6 w-6 rounded object-cover ring-1 ring-white"
        />
      ))}
    </div>
  )
}
