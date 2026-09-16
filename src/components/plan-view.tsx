"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { GraphNode, Point, EdgeType } from "@/lib/graph/types"
import { EDGE_TYPES } from "@/lib/graph/types"
import { addPolygonNode, setNodeLandmarks } from "@/app/projects/spatial-actions"
import { renameNode, createEdge } from "@/app/projects/graph-actions"
import { addNodePhoto } from "@/app/projects/actions"
import { uploadOverlayToStorage } from "@/lib/plan-upload"
import { colorizePlan, EXTRACTOR_URL } from "@/lib/plan-extract"
import { useEditorStore } from "@/lib/store/editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

const ROOM_COLOR = "#3b82f6"
const CLOSE_DIST = 0.025

// Kept at module scope so the zoom level survives the view remounting.
let persistedZoom = 1

// Existing hand-drawn room outlines, so a re-colour repaints every manual room.
function existingPolygons(nodes: GraphNode[]): Point[][] {
  return nodes
    .map((n) => n.metadata.points)
    .filter((p): p is Point[] => !!p && p.length >= 3)
}

// The coloured plan: the /colorize overlay (rooms filled to the walls), falling
// back to the raw plan. Zoomable, and — when a plan exists — a room can be traced
// directly on it (polygon → confirm modal → re-colour that bakes it in).
export function PlanView({
  projectId,
  overlayUrl,
  planUrl,
  nodes,
}: {
  projectId: string
  overlayUrl: string | null
  planUrl: string | null
  nodes: GraphNode[]
}) {
  const src = overlayUrl ?? planUrl
  const scrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(() => persistedZoom)
  useEffect(() => {
    persistedZoom = zoom
  }, [zoom])

  // Drawing state.
  const [drawing, setDrawing] = useState(false)
  const [polyPoints, setPolyPoints] = useState<Point[]>([])
  const [polyCursor, setPolyCursor] = useState<Point | null>(null)
  // The closed polygon awaiting confirmation in the modal.
  const [pendingRoom, setPendingRoom] = useState<Point[] | null>(null)

  // Drawing rooms needs the raw plan (to re-colour) and the extractor.
  const canDraw = !!planUrl && !!EXTRACTOR_URL

  // Trackpad pinch / ctrl+wheel to zoom (plain two-finger scroll still pans).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => clamp(Math.round((z - e.deltaY * 0.01) * 100) / 100, 0.5, 4))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  function cancelDraw() {
    setDrawing(false)
    setPolyPoints([])
    setPolyCursor(null)
  }

  function closePolygon() {
    if (polyPoints.length >= 3) setPendingRoom(polyPoints)
    setDrawing(false)
    setPolyCursor(null)
    setPolyPoints([])
  }

  // Enter closes, Escape cancels, Backspace removes the last point.
  useEffect(() => {
    if (!drawing) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancelDraw()
      else if (e.key === "Enter" && polyPoints.length >= 3) closePolygon()
      else if (e.key === "Backspace" && polyPoints.length > 0) {
        e.preventDefault()
        setPolyPoints((pts) => pts.slice(0, -1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, polyPoints])

  function relPoint(e: React.PointerEvent): Point | null {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    }
  }

  function polyDown(e: React.PointerEvent) {
    const p = relPoint(e)
    if (!p) return
    if (
      polyPoints.length >= 3 &&
      Math.hypot(p.x - polyPoints[0].x, p.y - polyPoints[0].y) < CLOSE_DIST
    ) {
      closePolygon()
      return
    }
    setPolyPoints((pts) => [...pts, p])
  }

  if (!src) {
    return (
      <div className="bg-grid flex h-full w-full items-center justify-center bg-secondary/50">
        <div className="text-sm text-muted-foreground">No plan image.</div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
        <button
          onClick={() => setZoom((z) => clamp(z - 0.25, 0.5, 4))}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="w-11 text-center text-xs tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => clamp(z + 0.25, 0.5, 4))}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setZoom(1)}
          className="rounded px-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          Reset
        </button>
        {canDraw && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            {drawing ? (
              <>
                <span className="px-1 text-xs text-muted-foreground">
                  Click each corner · {polyPoints.length} added
                  {polyPoints.length >= 3 ? " · click the first point to close" : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={polyPoints.length < 3}
                  onClick={closePolygon}
                >
                  Finish
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelDraw}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setDrawing(true)}>
                Draw room
              </Button>
            )}
          </>
        )}
      </div>

      <div ref={scrollRef} className="bg-grid h-full w-full overflow-auto bg-secondary/50">
        <div
          ref={containerRef}
          className="relative mx-auto my-4 w-fit select-none"
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Coloured floor plan"
            className="block w-full rounded-lg border bg-white shadow-sm"
            draggable={false}
          />

          {drawing && (
            <div
              className="absolute inset-0 z-10 cursor-crosshair"
              onPointerDown={polyDown}
              onPointerMove={(e) => setPolyCursor(relPoint(e))}
              onDoubleClick={() => closePolygon()}
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
                    fill={`${ROOM_COLOR}22`}
                    stroke={ROOM_COLOR}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
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
                      borderColor: ROOM_COLOR,
                      background: closable ? ROOM_COLOR : "#fff",
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
          Esc to cancel · Enter or double-click to finish
        </div>
      )}

      {pendingRoom && (
        <NewRoomModal
          projectId={projectId}
          planUrl={planUrl!}
          points={pendingRoom}
          nodes={nodes}
          onClose={() => setPendingRoom(null)}
        />
      )}
    </div>
  )
}

type Assoc = { targetId: string; type: EdgeType }

// Confirm a hand-drawn room: name (required) plus optional tags, photos, and
// associations. On save it creates the room + its extras, then re-colours the
// plan (with every hand-drawn outline) so the new room appears on the overlay.
function NewRoomModal({
  projectId,
  planUrl,
  points,
  nodes,
  onClose,
}: {
  projectId: string
  planUrl: string
  points: Point[]
  nodes: GraphNode[]
  onClose: () => void
}) {
  const router = useRouter()
  const setSelectedId = useEditorStore((s) => s.setSelectedId)
  const [name, setName] = useState("")
  const [tags, setTags] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [assocs, setAssocs] = useState<Assoc[]>([])
  const [assocTarget, setAssocTarget] = useState("")
  const [assocType, setAssocType] = useState<EdgeType>("connected_to")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState("")
  const [error, setError] = useState<string | null>(null)

  const nameById = new Map(
    nodes.map((n) => [n.id, n.name?.trim() || `Unnamed ${n.type}`]),
  )

  async function save() {
    if (!name.trim()) {
      setError("Please give the room a name.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      setProgress("Creating room…")
      const id = await addPolygonNode(projectId, "room", points)
      await renameNode(projectId, id, name.trim())

      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      if (tagList.length) await setNodeLandmarks(projectId, id, tagList)

      for (const [i, file] of files.entries()) {
        setProgress(`Uploading photo ${i + 1}/${files.length}…`)
        const fd = new FormData()
        fd.append("photo", file)
        await addNodePhoto(projectId, id, fd)
      }

      for (const a of assocs) {
        await createEdge(projectId, id, a.targetId, a.type)
      }

      // Re-colour the plan so the new room shows on the overlay. detect:false so
      // it never wipes the graph we just added to.
      setProgress("Redrawing coloured plan…")
      const blob = await (await fetch(planUrl)).blob()
      const polygons = [...existingPolygons(nodes), points]
      const { overlay_png_b64 } = await colorizePlan(blob, {
        polygons,
        detect: false,
      })
      await uploadOverlayToStorage(projectId, overlay_png_b64)

      setSelectedId(id)
      router.refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the room.")
      setBusy(false)
      setProgress("")
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-auto rounded-xl border border-border bg-card p-5 shadow-xl">
        <div>
          <h2 className="text-lg font-medium">New room</h2>
          <p className="text-xs text-muted-foreground">
            Traced {points.length} corners on the plan.
          </p>
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Name *</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kitchen"
            disabled={busy}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">
            Tags (comma-separated, optional)
          </label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="sink, window"
            disabled={busy}
          />
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Photos (optional)</label>
          <input
            type="file"
            accept="image/png,image/jpeg"
            multiple
            disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-xs"
          />
          {files.length > 0 && (
            <p className="text-xs text-muted-foreground">{files.length} selected</p>
          )}
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">
            Associations (optional)
          </label>
          {assocs.length > 0 && (
            <ul className="flex flex-col gap-1">
              {assocs.map((a, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">
                    ↔ {nameById.get(a.targetId)}{" "}
                    <span className="text-muted-foreground">({a.type})</span>
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => setAssocs((xs) => xs.filter((_, j) => j !== i))}
                    className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nodes.length > 0 && (
            <div className="mt-1 flex gap-1">
              <select
                value={assocTarget}
                disabled={busy}
                onChange={(e) => setAssocTarget(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-1 text-xs"
              >
                <option value="">Link to…</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nameById.get(n.id)}
                  </option>
                ))}
              </select>
              <select
                value={assocType}
                disabled={busy}
                onChange={(e) => setAssocType(e.target.value as EdgeType)}
                className="h-8 rounded-md border border-input bg-transparent px-1 text-xs"
              >
                {EDGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!assocTarget || busy}
                onClick={() => {
                  if (!assocTarget) return
                  setAssocs((xs) => [...xs, { targetId: assocTarget, type: assocType }])
                  setAssocTarget("")
                }}
              >
                Add
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          {busy && progress && (
            <span className="mr-auto text-xs text-muted-foreground">{progress}</span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save room"}
          </Button>
        </div>
      </div>
    </div>
  )
}
