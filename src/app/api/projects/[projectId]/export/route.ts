import { createClient } from "@/lib/supabase/server"
import { buildBundle } from "@/lib/bundle/build"
import { EMBEDDING_DIM } from "@/lib/graph/types"
import type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  NodeSemantics,
} from "@/lib/graph/types"
import type { EmbeddingSpace, ReferenceEmbedding } from "@/lib/bundle/types"

// GET /api/projects/:projectId/export
// Produces a downloadable, versioned spatial-graph bundle (see
// docs/spatial-graph-format.md) for the caller's own project. Session-authed:
// RLS scopes every read to the owner, so a non-owner simply gets a 404.

const GENERATOR = "navigraph-web@0.1.0"

// pgvector columns come back as the text form "[0.1,0.2,...]"; tolerate an
// already-parsed array too.
function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? (v as number[]) : null
    } catch {
      return null
    }
  }
  return null
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "building"
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .single()
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 })
  }

  const [{ data: nodeRows }, { data: edgeRows }, { data: photoRows }] =
    await Promise.all([
      supabase
        .from("nodes")
        .select("id, type, name, description, floor, pos_x, pos_y, metadata")
        .eq("project_id", projectId),
      supabase
        .from("edges")
        .select("id, source, target, type, certain")
        .eq("project_id", projectId),
      supabase
        .from("photos")
        .select("id, node_id, embedding")
        .eq("project_id", projectId),
    ])

  const nodes: GraphNode[] = (nodeRows ?? []).map((n) => ({
    ...n,
    type: n.type as NodeType,
    metadata: (n.metadata ?? {}) as NodeSemantics,
  }))
  const edges: GraphEdge[] = (edgeRows ?? []).map((e) => ({
    ...e,
    type: e.type as EdgeType,
  }))

  const references: ReferenceEmbedding[] = []
  for (const p of photoRows ?? []) {
    if (!p.node_id) continue
    const vec = parseEmbedding(p.embedding)
    if (vec && vec.length === EMBEDDING_DIM) {
      references.push({ id: p.id, node_id: p.node_id, embedding: vec })
    }
  }

  // The hosted pipeline embeds scene *text* (photo tags), so the modality is
  // "text". The model reflects the configured vision backend.
  const embedding: EmbeddingSpace | null = references.length
    ? {
        model:
          process.env.VISION_PROVIDER === "openai"
            ? "text-embedding-3-small"
            : "mock",
        dim: EMBEDDING_DIM,
        modality: "text",
        metric: "cosine",
      }
    : null

  const bundle = buildBundle({
    project: { id: project.id, name: project.name },
    graph: { nodes, edges },
    references,
    embedding,
    generator: GENERATOR,
  })

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${slug(project.name)}-navigraph-bundle.json"`,
      "cache-control": "no-store",
    },
  })
}
