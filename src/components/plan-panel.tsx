"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  generatePlanGraph,
  regenerateGraph,
  saveExtractedGraph,
} from "@/app/projects/actions"
import {
  uploadPlanToStorage,
  uploadOverlayToStorage,
  MAX_PLAN_BYTES,
} from "@/lib/plan-upload"
import { colorizePlan, EXTRACTOR_URL } from "@/lib/plan-extract"
import { Button } from "@/components/ui/button"

export function PlanPanel({
  projectId,
  hasPlan,
  planUrl,
}: {
  projectId: string
  hasPlan: boolean
  planUrl: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | null | undefined) {
    if (!file || busy) return
    setError(null)
    if (file.size > MAX_PLAN_BYTES) {
      setError(
        `Plan is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use a file under 25 MB.`,
      )
      return
    }
    setBusy(true)
    try {
      const path = await uploadPlanToStorage(projectId, file)
      if (EXTRACTOR_URL) {
        const { overlay_png_b64, nodes, edges } = await colorizePlan(file)
        await uploadOverlayToStorage(projectId, overlay_png_b64)
        await saveExtractedGraph(projectId, { nodes, edges, width: 0, height: 0 }, path)
      } else {
        await generatePlanGraph(projectId, path)
      }
      router.refresh()
    } catch (e) {
      setError(
        e instanceof Error && e.message ? e.message : "Upload failed. Please try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Building graph…" : hasPlan ? "Replace plan" : "Upload plan"}
      </Button>

      {hasPlan && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setError(null)
            setBusy(true)
            try {
              if (EXTRACTOR_URL && planUrl) {
                // Re-run colouring + detection in the browser from the stored plan.
                const blob = await (await fetch(planUrl)).blob()
                const { overlay_png_b64, nodes, edges } = await colorizePlan(blob)
                await uploadOverlayToStorage(projectId, overlay_png_b64)
                await saveExtractedGraph(projectId, { nodes, edges, width: 0, height: 0 })
              } else {
                await regenerateGraph(projectId)
              }
              router.refresh()
            } catch (e) {
              setError(
                e instanceof Error && e.message ? e.message : "Regeneration failed.",
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          Regenerate
        </Button>
      )}

      {error && <span className="max-w-xs text-xs text-destructive">{error}</span>}
    </div>
  )
}
