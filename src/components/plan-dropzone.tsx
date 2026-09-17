"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { generatePlanGraph, saveExtractedGraph } from "@/app/projects/actions"
import {
  uploadPlanToStorage,
  uploadOverlayToStorage,
  MAX_PLAN_BYTES,
} from "@/lib/plan-upload"
import { colorizePlan, EXTRACTOR_URL } from "@/lib/plan-extract"

// If detection hasn't finished in this long, assume something is stuck and
// surface an error instead of spinning forever. Generous because a cold
// extractor instance can take ~50s to wake before it even starts.
const WATCHDOG_MS = 120_000

// Empty-state uploader for a new building: drag & drop a plan (or click to
// browse), then show a detection loader while the graph is built.
export function PlanDropzone({ projectId }: { projectId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | null | undefined) {
    if (!file || busy) return
    setError(null)
    if (file.size > MAX_PLAN_BYTES) {
      setError(
        `That plan is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use a file under 25 MB.`,
      )
      return
    }
    if (file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = () => setPreview(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreview(null)
    }
    setBusy(true)

    const watchdog = setTimeout(() => {
      setBusy(false)
      setError(
        "This is taking longer than expected — the plan may be too large, or detection stalled. Please try again.",
      )
    }, WATCHDOG_MS)

    try {
      const path = await uploadPlanToStorage(projectId, file)
      if (EXTRACTOR_URL) {
        // Heavy work runs in the browser (off Netlify's ~10s cap): the service
        // returns the coloured overlay + a simple room/adjacency graph.
        const { overlay_png_b64, nodes, edges } = await colorizePlan(file)
        await uploadOverlayToStorage(projectId, overlay_png_b64)
        await saveExtractedGraph(projectId, { nodes, edges, width: 0, height: 0 }, path)
      } else {
        // Local/dev without an extractor: fall back to the server pipeline.
        await generatePlanGraph(projectId, path)
      }
      clearTimeout(watchdog)
      router.refresh() // plan now processed → page swaps in the coloured view
    } catch (e) {
      clearTimeout(watchdog)
      setBusy(false)
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Upload failed. Please check the file and try again.",
      )
    }
  }

  // Error — say what went wrong instead of spinning forever.
  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-8 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
          </span>
          <div>
            <p className="font-medium">Something went wrong</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Loader — the plan is in, elements are being detected.
  if (busy) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-background">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-full w-full object-contain opacity-25"
            draggable={false}
          />
        )}
        <div
          className="animate-scan-loop pointer-events-none absolute inset-y-0 w-[2px] bg-brand"
          style={{ boxShadow: "0 0 18px 4px color-mix(in oklch, var(--brand) 60%, transparent)" }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
          <div>
            <p className="font-medium">Plan uploaded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Detecting rooms and their connections…
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={`flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-10 py-16 text-center transition-colors ${
          dragging
            ? "border-brand bg-brand/5"
            : "border-border hover:border-brand/40 hover:bg-accent/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name="plan"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 15V4" />
            <path d="m8 8 4-4 4 4" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
        </span>
        <div>
          <p className="font-medium">Drag &amp; drop your floor plan</p>
          <p className="mt-1 text-sm text-muted-foreground">
            or click to browse — PDF, PNG or JPG
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          We&apos;ll detect rooms and their connections automatically.
        </p>
      </div>

      <Link
        href={`/projects/${projectId}/scan`}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ou{" "}
        <span className="font-medium text-foreground underline underline-offset-4">
          scanner en vidéo
        </span>{" "}
        en commentant à voix haute →
      </Link>
    </div>
  )
}
