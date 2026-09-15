import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderStatus = "idle" | "ready" | "recording" | "stopped"

// A key frame captured from the recorded video (canvas → JPEG data URL).
export type KeyFrame = {
  id: string
  dataUrl: string
  timestamp: number
  label?: string
}

type UseMediaRecorder = {
  status: RecorderStatus
  error: string | null
  recordedBlob: Blob | null
  recordedUrl: string | null
  liveStream: MediaStream | null
  requestPermission: () => Promise<void>
  start: () => void
  stop: () => void
  reset: () => void
}

// Wraps MediaRecorder: camera + mic access, one webm recording, live preview
// stream. Ported from the reference prototype. Requires a secure context
// (HTTPS or localhost) for getUserMedia.
export function useMediaRecorder(): UseMediaRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const requestPermission = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      })
      setLiveStream(stream)
      setStatus("ready")
    } catch {
      setError("Accès caméra/micro refusé ou indisponible.")
    }
  }, [])

  const start = useCallback(() => {
    if (!liveStream) {
      setError("Autorisez d'abord la caméra et le micro.")
      return
    }
    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : ""
    const recorder = new MediaRecorder(liveStream, mimeType ? { mimeType } : undefined)

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" })
      setRecordedBlob(blob)
      setRecordedUrl(URL.createObjectURL(blob))
      setStatus("stopped")
    }

    recorderRef.current = recorder
    recorder.start()
    setStatus("recording")
  }, [liveStream])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    setRecordedBlob(null)
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedUrl(null)
    setStatus(liveStream ? "ready" : "idle")
  }, [recordedUrl, liveStream])

  // Stop the camera and revoke the object URL on unmount only.
  useEffect(() => {
    return () => {
      liveStream?.getTracks().forEach((t) => t.stop())
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    status,
    error,
    recordedBlob,
    recordedUrl,
    liveStream,
    requestPermission,
    start,
    stop,
    reset,
  }
}
