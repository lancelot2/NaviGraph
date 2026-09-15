"use client"

// Read-only plan view: shows the coloured overlay (rooms filled up to the walls)
// produced by the /colorize service, falling back to the raw plan image. Polygon
// drawing/editing is intentionally gone — rooms and links are managed from the
// left Catalogue panel.
export function PlanView({
  overlayUrl,
  planUrl,
}: {
  overlayUrl: string | null
  planUrl: string | null
}) {
  const src = overlayUrl ?? planUrl

  return (
    <div className="bg-grid h-full w-full overflow-auto bg-secondary/50">
      <div className="flex min-h-full items-center justify-center p-6">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Coloured floor plan"
            className="max-h-full max-w-full rounded-lg border bg-white shadow-sm"
            draggable={false}
          />
        ) : (
          <div className="text-sm text-muted-foreground">No plan image.</div>
        )}
      </div>
    </div>
  )
}
