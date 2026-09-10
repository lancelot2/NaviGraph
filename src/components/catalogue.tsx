"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  NODE_TYPES,
  EDGE_TYPES,
  type GraphNode,
  type GraphEdge,
  type NodeType,
  type EdgeType,
} from "@/lib/graph/types"
import { useEditorStore } from "@/lib/store/editor"
import {
  renameNode,
  setNodeType,
  createEdge,
  deleteEdge,
} from "@/app/projects/graph-actions"
import { addNodePhoto } from "@/app/projects/actions"
import { deleteNode, setNodeLandmarks } from "@/app/projects/spatial-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Link2, Tag, Image as ImageIcon } from "lucide-react"

const COLOR: Record<NodeType, string> = {
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
const LABEL: Record<NodeType, string> = {
  room: "Rooms",
  entrance: "Entrances",
  stair: "Stairs",
  elevator: "Elevators",
  landmark: "Landmarks",
  door: "Doors",
  entrance_door: "Entrance doors",
  window: "Windows",
  opening: "Openings",
}

export function Catalogue({
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
  const nameById = new Map(
    nodes.map((n) => [n.id, n.name?.trim() || `Unnamed ${n.type}`]),
  )

  return (
    <div className="flex flex-col gap-4 p-3">
      <p className="text-xs text-muted-foreground">
        {nodes.length} objects · click one to edit it.
      </p>

      {NODE_TYPES.map((type) => {
        const items = nodes.filter((n) => n.type === type)
        if (items.length === 0) return null
        return (
          <div key={type}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {LABEL[type]} ({items.length})
            </h3>
            <ul className="flex flex-col gap-1">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(selectedId === n.id ? null : n.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      selectedId === n.id ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: COLOR[type] }}
                    />
                    <span className="truncate">{nameById.get(n.id)}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5" title="associations">
                        <Link2 className="h-3 w-3" />
                        {edges.filter((e) => e.source === n.id || e.target === n.id).length}
                      </span>
                      <span className="flex items-center gap-0.5" title="tags">
                        <Tag className="h-3 w-3" />
                        {n.metadata.landmarks?.length ?? 0}
                      </span>
                      <span className="flex items-center gap-0.5" title="photos">
                        <ImageIcon className="h-3 w-3" />
                        {photosByNode[n.id]?.length ?? 0}
                      </span>
                    </span>
                  </button>

                  {selectedId === n.id && (
                    <ObjectEditor
                      projectId={projectId}
                      node={n}
                      nodes={nodes}
                      edges={edges}
                      photos={photosByNode[n.id] ?? []}
                      nameById={nameById}
                      onDeleted={() => setSelectedId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      {nodes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No objects yet — upload a plan or draw one on the plan.
        </p>
      )}
    </div>
  )
}

function ObjectEditor({
  projectId,
  node,
  nodes,
  edges,
  photos,
  nameById,
  onDeleted,
}: {
  projectId: string
  node: GraphNode
  nodes: GraphNode[]
  edges: GraphEdge[]
  photos: string[]
  nameById: Map<string, string>
  onDeleted: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(node.name ?? "")
  const [busy, setBusy] = useState(false)
  const [assocTarget, setAssocTarget] = useState("")
  const [assocType, setAssocType] = useState<EdgeType>("connected_to")

  const relations = edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  )
  const others = nodes.filter((n) => n.id !== node.id)
  const landmarks = node.metadata.landmarks ?? []
  const objects = node.metadata.objects ?? []

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-1 mt-1 flex flex-col gap-3 rounded-md border bg-white p-3">
      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim()
            if (v !== (node.name ?? "")) void run(() => renameNode(projectId, node.id, v))
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Type</label>
        <select
          value={node.type}
          onChange={(e) =>
            void run(() => setNodeType(projectId, node.id, e.target.value as NodeType))
          }
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {photos.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-border" />
          ))}
        </div>
      )}

      <form
        action={(fd) => run(() => addNodePhoto(projectId, node.id, fd))}
        className="flex items-center gap-2"
      >
        <input type="file" name="photo" accept="image/png,image/jpeg" required className="text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {busy ? "…" : "Add photo"}
        </Button>
      </form>

      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Tags (landmarks)</label>
        <div className="flex flex-wrap items-center gap-1">
          {landmarks.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              {tag}
              <button
                onClick={() =>
                  void run(() =>
                    setNodeLandmarks(
                      projectId,
                      node.id,
                      landmarks.filter((t) => t !== tag),
                    ),
                  )
                }
                className="text-muted-foreground hover:text-red-600"
                title="Remove tag"
              >
                ✕
              </button>
            </span>
          ))}
          <input
            placeholder="+ tag"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              const v = e.currentTarget.value.trim()
              if (!v) return
              e.currentTarget.value = ""
              void run(() =>
                setNodeLandmarks(
                  projectId,
                  node.id,
                  Array.from(new Set([...landmarks, v])),
                ),
              )
            }}
            className="h-6 w-20 rounded border border-input bg-transparent px-1 text-xs"
          />
        </div>
        {objects.length > 0 && (
          <p className="text-xs text-muted-foreground">
            From photos: {objects.join(", ")}
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <label className="text-xs text-muted-foreground">Associations</label>
        {relations.length === 0 ? (
          <p className="text-xs text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {relations.map((e) => {
              const otherId = e.source === node.id ? e.target : e.source
              const dir = e.source === node.id ? "→" : "←"
              return (
                <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    {dir} {nameById.get(otherId) ?? "?"}{" "}
                    <span className="text-muted-foreground">
                      ({e.type}
                      {e.certain ? "" : ", uncertain"})
                    </span>
                  </span>
                  <button
                    onClick={() => void run(() => deleteEdge(projectId, e.id))}
                    className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                    title="Remove association"
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-1 flex gap-1">
          <select
            value={assocTarget}
            onChange={(e) => setAssocTarget(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-1 text-xs"
          >
            <option value="">Link to…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {nameById.get(o.id)}
              </option>
            ))}
          </select>
          <select
            value={assocType}
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
            disabled={!assocTarget || busy}
            onClick={() =>
              void run(async () => {
                await createEdge(projectId, node.id, assocTarget, assocType)
                setAssocTarget("")
              })
            }
          >
            Add
          </Button>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="text-red-600"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await deleteNode(projectId, node.id)
            onDeleted()
          })
        }
      >
        Delete object
      </Button>
    </div>
  )
}
