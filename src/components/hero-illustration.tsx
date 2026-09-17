"use client"

import { useEffect, useState } from "react"
import { JsonBlock } from "@/components/json-highlight"

const JSON_TEXT = `{
  "rooms": [
    { "id": "office",    "type": "office" },
    { "id": "warehouse", "type": "storage" },
    { "id": "shipping",  "type": "dock" }
  ],
  "landmarks": [
    "AISLE 4 sign",
    "blue pallet racks",
    "roll-up dock door"
  ],
  "connections": [
    ["office", "warehouse"],
    ["warehouse", "shipping"]
  ]
}`

type Phase = "plan" | "scan" | "loading" | "json"

// Scan sweep duration (kept in sync with the CSS transition below).
const SWEEP = 1100

export function HeroIllustration() {
  const [phase, setPhase] = useState<Phase>("plan")
  const [chars, setChars] = useState(0)
  const [scanLeft, setScanLeft] = useState(0)

  useEffect(() => {
    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    let typer: ReturnType<typeof setInterval> | undefined
    const at = (ms: number, fn: () => void) =>
      timers.push(setTimeout(() => alive && fn(), ms))

    const typeStep = 22
    const typingMs = JSON_TEXT.length * typeStep

    // Scan does a full back-and-forth, then a short loading beat, then typing.
    const rightAt = 1120
    const leftAt = rightAt + SWEEP + 180
    const loadingAt = leftAt + SWEEP + 120
    const jsonAt = loadingAt + 760

    const run = () => {
      setPhase("plan")
      setChars(0)
      setScanLeft(0)

      // 1) scan sweeps left → right, then right → left
      at(1000, () => setPhase("scan"))
      at(rightAt, () => setScanLeft(100))
      at(leftAt, () => setScanLeft(0))

      // 2) quick loading beat once the scan is done
      at(loadingAt, () => setPhase("loading"))

      // 3) JSON types out, one character at a time
      at(jsonAt, () => {
        setPhase("json")
        let c = 0
        typer = setInterval(() => {
          if (!alive) return
          c += 1
          setChars(c)
          if (c >= JSON_TEXT.length && typer) clearInterval(typer)
        }, typeStep)
      })

      // 4) hold, then loop
      at(jsonAt + typingMs + 2400, run)
    }

    run()
    return () => {
      alive = false
      timers.forEach(clearTimeout)
      if (typer) clearInterval(typer)
    }
  }, [])

  const planVisible = phase === "plan" || phase === "scan"
  const darkVisible = phase === "loading" || phase === "json"

  return (
    <div className="relative aspect-[3/2] overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_50px_-24px_rgba(30,40,90,0.35)]">
      {/* Warehouse plan */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{ opacity: planVisible ? 1 : 0 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/warehouse_floorplan.png"
          alt="Warehouse floor plan"
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>

      {/* Scan line — sweeps across and back during the scan phase */}
      {phase === "scan" && (
        <div
          className="pointer-events-none absolute top-0 z-10 h-full w-[3px] bg-brand"
          style={{
            left: `${scanLeft}%`,
            transition: `left ${SWEEP}ms ease-in-out`,
            boxShadow: "0 0 18px 4px rgba(39,101,232,0.75)",
          }}
        >
          <span className="absolute left-1/2 top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-brand" />
        </div>
      )}

      {/* Dark overlay — loading beat, then the typed JSON readout */}
      <div
        className="absolute inset-0 bg-[#181713] p-4 font-mono text-[11px] leading-[1.6] transition-opacity duration-500 sm:p-5 sm:text-xs"
        style={{ opacity: darkVisible ? 1 : 0 }}
      >
        {phase === "loading" ? (
          <div className="flex h-full items-center justify-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <span className="text-white/60">building graph…</span>
          </div>
        ) : (
          <JsonBlock text={JSON_TEXT} theme="dark" chars={chars} caret />
        )}
      </div>
    </div>
  )
}
