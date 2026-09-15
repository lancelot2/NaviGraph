"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMediaRecorder, type KeyFrame } from "./use-media-recorder"
import { analyzeWalkthrough } from "@/lib/walkthrough"
import { saveExtractedGraph } from "@/app/projects/actions"
import { Button } from "@/components/ui/button"

let frameCounter = 0

export function ScanWizard({ projectId }: { projectId: string }) {
  const router = useRouter()
  const {
    status,
    error: recError,
    recordedUrl,
    recordedBlob,
    liveStream,
    requestPermission,
    start,
    stop,
    reset,
  } = useMediaRecorder()

  const liveRef = useRef<HTMLVideoElement>(null)
  const playbackRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [keyframes, setKeyframes] = useState<KeyFrame[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (liveRef.current && liveStream) liveRef.current.srcObject = liveStream
  }, [liveStream])

  function capture() {
    const video = playbackRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setKeyframes((ks) => [
      ...ks,
      {
        id: `frame_${++frameCounter}`,
        dataUrl: canvas.toDataURL("image/jpeg", 0.8),
        timestamp: Number(video.currentTime.toFixed(2)),
      },
    ])
  }

  async function generate() {
    if (!recordedBlob || busy) return
    setError(null)
    setBusy(true)
    try {
      const frames = await Promise.all(
        keyframes.map((k) => fetch(k.dataUrl).then((r) => r.blob())),
      )
      const { nodes, edges } = await analyzeWalkthrough(recordedBlob, frames)
      await saveExtractedGraph(projectId, { nodes, edges, width: 0, height: 0 })
      router.push(`/projects/${projectId}`)
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error && e.message ? e.message : "La génération a échoué.")
    }
  }

  if (busy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        <div>
          <p className="font-medium">Analyse de la visite…</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Transcription de la voix et extraction des pièces (jusqu&apos;à une minute).
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 overflow-auto p-6">
      <header className="flex items-center justify-between">
        <div>
          <span className="label-mono">nouvelle source</span>
          <h1 className="font-display text-xl leading-tight tracking-tight">
            Scanner en vidéo
          </h1>
        </div>
        <Link
          href={`/projects/${projectId}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          ← Retour
        </Link>
      </header>

      {(error || recError) && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error ?? recError}
        </p>
      )}

      {/* Étape 1 — enregistrement */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium">1. Filmez en commentant à voix haute</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Parcourez chaque pièce et décrivez ce que vous voyez.
        </p>

        {status === "idle" && (
          <Button className="mt-3" onClick={requestPermission}>
            Activer caméra + micro
          </Button>
        )}

        {(status === "ready" || status === "recording") && (
          <div className="mt-3 space-y-3">
            <video ref={liveRef} autoPlay muted playsInline className="w-full rounded-lg border bg-black" />
            {status === "ready" ? (
              <Button onClick={start}>● Démarrer l&apos;enregistrement</Button>
            ) : (
              <Button variant="destructive" onClick={stop}>■ Arrêter</Button>
            )}
          </div>
        )}
      </section>

      {/* Étape 2 — sélection d'images + génération */}
      {status === "stopped" && recordedUrl && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium">2. Capturez une image par pièce</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Faites défiler la vidéo et cliquez « Capturer » pour chaque pièce.
          </p>

          <video
            ref={playbackRef}
            src={recordedUrl}
            controls
            playsInline
            className="mt-3 w-full rounded-lg border bg-black"
          />
          <canvas ref={canvasRef} className="hidden" />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={capture}>📸 Capturer cette image</Button>
            <Button variant="outline" onClick={() => { setKeyframes([]); reset() }}>
              Refaire la vidéo
            </Button>
            <span className="text-sm text-muted-foreground">
              {keyframes.length} image{keyframes.length > 1 ? "s" : ""}
            </span>
          </div>

          {keyframes.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {keyframes.map((f) => (
                <div key={f.id} className="group relative overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.dataUrl} alt="" className="aspect-video w-full object-cover" />
                  <button
                    onClick={() => setKeyframes((ks) => ks.filter((k) => k.id !== f.id))}
                    className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <Button
              className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={keyframes.length === 0}
              onClick={generate}
            >
              Générer le graphe spatial
            </Button>
            {keyframes.length === 0 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Capturez au moins une image pour générer.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
