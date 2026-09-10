"use server"

import { randomUUID } from "crypto"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getVisionProvider } from "@/lib/vision"
import { MockVisionProvider } from "@/lib/vision/mock"
import type { ParsedGraph, PhotoAnalysis } from "@/lib/vision/types"
import type { NodeSemantics } from "@/lib/graph/types"
import type { TablesInsert } from "@/lib/database.types"

export async function createProject(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
    .from("projects")
    .insert({ name, user_id: user.id })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  redirect(`/projects/${data.id}`)
}

// Builds the first Spatial Graph from a plan the browser already uploaded to
// Storage. The heavy bytes go straight to Storage (bypassing the Server Action
// ~1 MB request-body limit, which otherwise 502s); this action only carries ids.
export async function generatePlanGraph(
  projectId: string,
  planPath: string,
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Defense in depth: only accept a path inside the caller's own folder.
  if (!planPath.startsWith(`${user.id}/${projectId}/`)) {
    throw new Error("Invalid plan path")
  }

  const { error } = await supabase
    .from("projects")
    .update({ plan_path: planPath })
    .eq("id", projectId)
  if (error) throw new Error(error.message)

  await buildGraph(projectId)
  revalidatePath(`/projects/${projectId}`)
}

// Re-runs extraction on the stored plan and replaces the graph.
export async function regenerateGraph(projectId: string): Promise<void> {
  await buildGraph(projectId)
  revalidatePath(`/projects/${projectId}`)
}

// Attaches a photo to a node and enriches the graph (Prompt 5): the VisionProvider
// extracts objects/landmarks/signs/synonyms into the node's metadata, and a
// semantic embedding of the scene is stored on the photo for localization (P6).
export async function addNodePhoto(
  projectId: string,
  nodeId: string,
  formData: FormData,
): Promise<void> {
  const file = formData.get("photo")
  if (!(file instanceof File) || file.size === 0) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `${user.id}/${projectId}/${nodeId}/${randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, file, { contentType: file.type })
  if (uploadError) throw new Error(uploadError.message)

  const { data: photo } = await supabase
    .from("photos")
    .insert({ project_id: projectId, node_id: nodeId, storage_path: path })
    .select("id")
    .single()

  // Analyse the photo and embed the scene. Wrapped so a vision failure never
  // loses the uploaded photo — it just leaves the semantics empty.
  try {
    const provider = getVisionProvider()
    const analysis = await provider.analyzePhoto({ data: bytes, mimeType: file.type })

    const { data: node } = await supabase
      .from("nodes")
      .select("name, metadata")
      .eq("id", nodeId)
      .single()
    const current = (node?.metadata ?? {}) as NodeSemantics
    // Spread `current` first so non-semantic metadata (e.g. bounds) is preserved.
    const merged = { ...current, ...mergeSemantics(current, analysis) }

    await supabase.from("nodes").update({ metadata: merged }).eq("id", nodeId)

    const sceneText = [
      node?.name ?? "",
      ...merged.objects,
      ...merged.landmarks,
      ...merged.signs,
      ...merged.synonyms,
    ]
      .filter(Boolean)
      .join(", ")

    if (sceneText && photo?.id) {
      const embedding = await provider.embed(sceneText)
      await supabase
        .from("photos")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", photo.id)
    }
  } catch (err) {
    console.error("Photo analysis failed (photo kept):", err)
  }

  revalidatePath(`/projects/${projectId}`)
}

// Union the semantic lists, de-duplicated (case-insensitive).
function mergeSemantics(a: NodeSemantics, b: PhotoAnalysis): PhotoAnalysis {
  const uniq = (xs: string[]) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of xs) {
      const k = x.trim().toLowerCase()
      if (x.trim() && !seen.has(k)) {
        seen.add(k)
        out.push(x.trim())
      }
    }
    return out
  }
  return {
    objects: uniq([...(a.objects ?? []), ...(b.objects ?? [])]),
    landmarks: uniq([...(a.landmarks ?? []), ...(b.landmarks ?? [])]),
    signs: uniq([...(a.signs ?? []), ...(b.signs ?? [])]),
    synonyms: uniq([...(a.synonyms ?? []), ...(b.synonyms ?? [])]),
  }
}

async function buildGraph(projectId: string): Promise<void> {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id, plan_path")
    .eq("id", projectId)
    .single()
  if (!project) return

  // Fetch plan bytes for real providers; the mock ignores them.
  let parsed: ParsedGraph
  try {
    let data: Uint8Array | null = null
    let mimeType: string | null = null
    if (project.plan_path) {
      const { data: blob } = await supabase.storage
        .from("plans")
        .download(project.plan_path)
      if (blob) {
        data = new Uint8Array(await blob.arrayBuffer())
        mimeType = blob.type || null
      }
    }
    parsed = await getVisionProvider().parseFloorPlan({ data, mimeType })
  } catch (err) {
    // Never block the "first graph in 2 minutes" flow: fall back to the mock.
    console.error("VisionProvider failed, falling back to mock:", err)
    parsed = await new MockVisionProvider().parseFloorPlan()
  }

  // Replace any existing graph (edges first for FK safety).
  await supabase.from("edges").delete().eq("project_id", projectId)
  await supabase.from("nodes").delete().eq("project_id", projectId)

  // Assign real UUIDs up front so edges can reference them directly.
  const idByTemp = new Map<string, string>()
  const nodeRows: TablesInsert<"nodes">[] = parsed.nodes.map((n) => {
    const id = randomUUID()
    idByTemp.set(n.tempId, id)
    return {
      id,
      project_id: projectId,
      type: n.type,
      name: n.name,
      description: n.description,
      floor: n.floor,
      pos_x: n.pos_x,
      pos_y: n.pos_y,
      metadata: n.points
        ? { points: n.points }
        : n.bounds
          ? { bounds: n.bounds }
          : {},
    }
  })

  const edgeRows: TablesInsert<"edges">[] = parsed.edges
    .filter((e) => idByTemp.has(e.sourceTempId) && idByTemp.has(e.targetTempId))
    .map((e) => ({
      project_id: projectId,
      source: idByTemp.get(e.sourceTempId)!,
      target: idByTemp.get(e.targetTempId)!,
      type: e.type,
      certain: e.certain,
      metadata: e.metadata ?? {},
    }))

  if (nodeRows.length) await supabase.from("nodes").insert(nodeRows)
  if (edgeRows.length) await supabase.from("edges").insert(edgeRows)
}
