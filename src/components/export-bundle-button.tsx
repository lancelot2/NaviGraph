"use client"

import { useState } from "react"

// Downloads the project's offline spatial-graph bundle (see
// docs/spatial-graph-format.md). Fetches the versioned JSON from the export
// endpoint and saves it, so a robot or the Python SDK can run fully offline.
export function ExportBundleButton({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/export`)
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`)
      }
      const disposition = res.headers.get("content-disposition") ?? ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] ?? "navigraph-bundle.json"

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      title={error ?? "Download the offline spatial-graph bundle"}
      className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-60"
    >
      {busy ? "Exporting…" : error ? "Retry export" : "Export bundle ↓"}
    </button>
  )
}
