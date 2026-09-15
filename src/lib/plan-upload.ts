import { createClient } from "@/lib/supabase/client"

// Largest plan we accept. Uploads go straight to Storage from the browser, so
// this is only bounded by the bucket limit — keep a friendly cap for UX.
export const MAX_PLAN_BYTES = 25 * 1024 * 1024 // 25 MB

// Upload a plan directly to Storage from the browser, bypassing the Server
// Action request-body limit (which 502s on anything over ~1 MB). Returns the
// stored path for a follow-up detection call.
export async function uploadPlanToStorage(
  projectId: string,
  file: File,
): Promise<string> {
  const supabase = createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    throw new Error("Your session expired — please sign in again.")
  }

  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "")
  const path = `${user.id}/${projectId}/plan.${ext || "bin"}`

  const { error } = await supabase.storage
    .from("plans")
    .upload(path, file, { upsert: true, contentType: file.type || undefined })
  if (error) throw new Error(error.message)

  return path
}

// Stores the coloured overlay (base64 PNG from /colorize) next to the plan at a
// conventional path the project page derives from plan_path — no DB column.
export async function uploadOverlayToStorage(
  projectId: string,
  base64Png: string,
): Promise<string> {
  const supabase = createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    throw new Error("Your session expired — please sign in again.")
  }

  const path = `${user.id}/${projectId}/overlay.png`
  const bytes = Uint8Array.from(atob(base64Png), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: "image/png" })

  const { error } = await supabase.storage
    .from("plans")
    .upload(path, blob, { upsert: true, contentType: "image/png" })
  if (error) throw new Error(error.message)

  return path
}
