import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PlanPanel } from "@/components/plan-panel"
import { PlanDropzone } from "@/components/plan-dropzone"
import { PlanEditor } from "@/components/plan-editor"
import { KnowledgePanel } from "@/components/knowledge-panel"
import { EnrichmentAssistant } from "@/components/enrichment-assistant"
import { SidebarTabs } from "@/components/sidebar-tabs"
import { Catalogue } from "@/components/catalogue"
import { ExportBundleButton } from "@/components/export-bundle-button"
import { computeKnowledge } from "@/lib/knowledge/score"
import type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  NodeSemantics,
} from "@/lib/graph/types"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, plan_path")
    .eq("id", id)
    .single()
  if (!project) notFound()

  const [{ data: nodeRows }, { data: edgeRows }, { data: photoRows }] =
    await Promise.all([
      supabase
        .from("nodes")
        .select("id, type, name, description, floor, pos_x, pos_y, metadata")
        .eq("project_id", id),
      supabase
        .from("edges")
        .select("id, source, target, type, certain")
        .eq("project_id", id),
      supabase.from("photos").select("node_id, storage_path").eq("project_id", id),
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

  const photoNodeIds = new Set(
    (photoRows ?? [])
      .map((p) => p.node_id)
      .filter((id): id is string => id !== null),
  )
  const knowledge = computeKnowledge({ nodes, edges }, photoNodeIds)

  // Signed URLs for the plan image and each room's photo thumbnails.
  const planUrl = project.plan_path
    ? ((await supabase.storage.from("plans").createSignedUrl(project.plan_path, 3600))
        .data?.signedUrl ?? null)
    : null

  const photosByNode: Record<string, string[]> = {}
  const photoPaths = (photoRows ?? []).filter(
    (p): p is { node_id: string; storage_path: string } =>
      !!p.node_id && !!p.storage_path,
  )
  if (photoPaths.length) {
    const { data: signed } = await supabase.storage
      .from("photos")
      .createSignedUrls(photoPaths.map((p) => p.storage_path), 3600)
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
    for (const p of photoPaths) {
      const url = urlByPath.get(p.storage_path)
      if (url) (photosByNode[p.node_id] ??= []).push(url)
    }
  }

  // A signature of the server graph. Passed to the editor as `revision` so it
  // reconciles its local rooms when the data changes — WITHOUT remounting (which
  // would reload the plan image and reset zoom/scroll on every edit).
  const graphKey =
    nodes
      .map(
        (n) =>
          `${n.id}:${n.type}:${n.name}:${n.pos_x}:${n.pos_y}:${JSON.stringify(n.metadata)}`,
      )
      .join("|") +
    "#" +
    edges.map((e) => `${e.id}:${e.certain}`).join("|") +
    "#" +
    photoPaths.map((p) => p.storage_path).join(",")

  return (
    <div className="flex h-screen flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/60 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="All buildings"
          >
            ←
          </Link>
          <div>
            <span className="label-mono">building</span>
            <h1 className="font-display text-xl leading-tight tracking-tight">
              {project.name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${project.id}/test`}
            className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            Test API →
          </Link>
          <ExportBundleButton projectId={project.id} />
          {project.plan_path && (
            <PlanPanel projectId={project.id} hasPlan />
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-96 shrink-0 flex-col border-r">
          <SidebarTabs
            assistant={
              <>
                <EnrichmentAssistant
                  projectId={project.id}
                  nodes={nodes}
                  issues={knowledge.issues}
                />
                <KnowledgePanel knowledge={knowledge} />
              </>
            }
            catalogue={
              <Catalogue
                projectId={project.id}
                nodes={nodes}
                edges={edges}
                photosByNode={photosByNode}
              />
            }
          />
        </aside>
        <div className="relative min-h-0 flex-1">
          {nodes.length === 0 ? (
            <PlanDropzone projectId={project.id} />
          ) : (
            <PlanEditor
              key={project.plan_path ?? "no-plan"}
              revision={graphKey}
              projectId={project.id}
              planUrl={planUrl}
              nodes={nodes}
              photosByNode={photosByNode}
            />
          )}
        </div>
      </div>
    </div>
  )
}
