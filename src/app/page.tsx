import Link from "next/link"
import { HeroIllustration } from "@/components/hero-illustration"
import { AnimatedTerminal } from "@/components/animated-terminal"
import { LogoMark, Wordmark } from "@/components/logo"

const RESPONSE = `{
  "current_location": "Receiving Dock",
  "destination": "Packing",
  "path": ["Receiving Dock", "Storage A", "Storage B", "Packing"],
  "landmarks": ["yellow floor lines", "AISLE 4 sign", "blue pallet racks"],
  "distance_m": 42,
  "context": "You are in Receiving Dock. Goal: reach Packing.\\nRoute: Receiving Dock → Storage A → Storage B → Packing (4 nodes, same floor).\\nStep 1: Exit the dock through the roll-up door into Storage A.\\nStep 2: Follow AISLE 4 past the blue pallet racks to Storage B.\\nStep 3: Packing is on your right, by the conveyor.\\nDestination landmarks: conveyor belt, PACKING banner."
}`

const STEPS = [
  {
    n: "01",
    title: "Upload",
    body: "Drop in a floor plan. The vision layer traces rooms, stairs, elevators and their connections into an editable graph laid right over the plan.",
  },
  {
    n: "02",
    title: "Enrich",
    body: "Add names, photos and connections. Every room gains landmarks, tags and a semantic embedding.",
  },
  {
    n: "03",
    title: "Localize",
    body: "From a single RGB frame, the engine matches the scene against reference photos to find which room the robot is in.",
  },
  {
    n: "04",
    title: "Navigate",
    body: "One call turns an instruction into a plain-text navigation brief — ready for any vision-language-action model.",
  },
]

const REPO_URL = "https://github.com/lancelot2/NaviGraph"

const COMPATIBLE = [
  { name: "Robostral", src: "/Robostral_logo.webp", h: "h-7" },
  { name: "OpenVLA", src: "/OpenVLA_logo.png", h: "h-9" },
  { name: "NVIDIA GR00T", src: "/NVIDIA_GR00T_logo.webp", h: "h-8" },
]

// Two entry points into the product — kept truthful to the pipeline: a floor
// plan (vision tracing) or a narrated walkthrough video (transcribe + build).
const MAP_MODES = [
  {
    icon: <PlanGlyph className="h-6 w-6" />,
    tag: "floor plan",
    title: "Upload a floor plan",
    body: "Drop in a PDF or image. The vision layer traces rooms, stairs, elevators and their connections into an editable graph laid right over the plan.",
    cta: "Upload a plan",
  },
  {
    icon: <VideoGlyph className="h-6 w-6" />,
    tag: "walkthrough video",
    title: "Record a walkthrough",
    body: "No plan on hand? Upload a narrated video of the space. NaviGraph transcribes the audio and builds the spatial graph from the rooms and landmarks you pass.",
    cta: "Start a walkthrough",
  },
]

// GitHub stars for the navbar badge. Cached and refreshed hourly; a failed or
// rate-limited fetch just drops the count (the badge still links to the repo).
async function getStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/lancelot2/NaviGraph", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { stargazers_count?: number }
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null
  } catch {
    return null
  }
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`
}

export default async function Landing() {
  const stars = await getStars()

  return (
    <main className="relative flex-1">
      <Navbar stars={stars} />

      <div className="relative overflow-hidden">
        {/* One continuous canvas — a subtle grid that dissolves into the paper. */}
        <div
          aria-hidden
          className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[85vh] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />

        {/* Hero */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-16">
          {/* Cobalt glow + floating graph nodes, echoing the banner. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-[32rem] w-[32rem] rounded-full bg-brand/10 blur-3xl"
          />
          <NodeField />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Spatial memory for embodied AI
            </span>
            <h1 className="mt-5 font-display text-5xl leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
              Turn any floor plan into{" "}
              <span className="text-brand">robot memory.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Upload any floor plan. A navigation graph gets built automatically.
              Enrich it with pictures for location and landmarks detection.
            </p>
            <div className="mt-8 flex flex-col items-start gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground shadow-lg shadow-brand/20 transition-all hover:-translate-y-0.5 hover:opacity-95"
              >
                Upload your Floor Plan
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
              >
                <GitHubIcon className="h-4 w-4" />
                Fully open source
              </a>
            </div>
          </div>

          <div className="relative">
            <HeroIllustration />
          </div>
        </section>

        {/* Two ways to map */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <span className="label-mono">get started</span>
              <h2 className="mt-3 font-display text-3xl tracking-tight sm:text-4xl">
                Map a space <span className="text-brand">two ways</span>
              </h2>
            </div>
            <span className="label-mono hidden sm:block">inputs</span>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {MAP_MODES.map((m) => (
              <Link
                key={m.title}
                href="/dashboard"
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card/70 p-7 transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_24px_60px_-30px_rgba(30,40,90,0.4)]"
              >
                <div
                  aria-hidden
                  className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(circle_at_top_right,black,transparent_70%)]"
                />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-brand/20 bg-brand/5 text-brand">
                  {m.icon}
                </div>
                <span className="label-mono relative mt-5">{m.tag}</span>
                <h3 className="relative mt-2 text-xl font-medium">{m.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                  {m.body}
                </p>
                <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                  {m.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Pipeline */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 flex items-end justify-between">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
              Build <span className="text-brand">spatial memory</span> in four steps
            </h2>
            <span className="label-mono hidden sm:block">the pipeline</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="group flex flex-col rounded-2xl border border-border bg-card/60 p-6 transition-all hover:-translate-y-1 hover:border-brand/30 hover:shadow-[0_20px_50px_-30px_rgba(30,40,90,0.4)]"
              >
                <div className="mb-4 font-mono text-sm text-brand">{s.n}</div>
                <h3 className="mb-2 text-lg font-medium">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why spatial memory */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1fr_0.8fr]">
          <div>
            <span className="label-mono">why it matters</span>
            <h2 className="mt-3 font-display text-3xl tracking-tight sm:text-4xl">
              Why <span className="text-brand">spatial memory</span> matters
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Modern vision-language-action models understand what they currently
              see, but they do not retain a persistent understanding of an entire
              building.
            </p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
              NaviGraph provides this missing{" "}
              <span className="text-brand">memory</span> layer by transforming a
              floor plan into a <span className="text-brand">semantic graph</span>{" "}
              that any robotics model can query using only a single RGB camera
              image.
            </p>
          </div>
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-brand/5 blur-2xl"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/spatial_graph_illustration.png"
              alt="A floor plan turned into a semantic graph of rooms, connections and photo counts"
              className="w-full"
              draggable={false}
            />
          </div>
        </section>

        {/* API — request / response flow */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10">
            <span className="label-mono">the deliverable</span>
            <h2 className="mt-3 font-display text-3xl tracking-tight sm:text-4xl">
              One endpoint. Navigation-ready <span className="text-brand">context.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground">
              <code className="rounded bg-card px-1.5 py-0.5 font-mono text-sm text-brand">
                POST /context
              </code>{" "}
              takes an instruction and a camera frame, and returns the location,
              destination, path, landmarks and a plain-text{" "}
              <span className="text-brand">context</span> you drop straight into
              your model.
            </p>
          </div>

          <div className="grid items-stretch gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <FlowDiagram />

            {/* response.json terminal — typewriter loop */}
            <div className="overflow-hidden rounded-xl border border-border bg-[#181713] shadow-[0_20px_50px_-20px_rgba(30,40,90,0.4)]">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="ml-2 font-mono text-xs text-white/40">response.json</span>
              </div>
              <div className="overflow-x-auto p-5 font-mono text-xs leading-relaxed">
                <AnimatedTerminal text={RESPONSE} />
              </div>
            </div>
          </div>
        </section>

        {/* Compatibility */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-16 text-center">
          <span className="label-mono">compatible with</span>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
            {COMPATIBLE.map((c) => (
              <div key={c.name} className="group flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.src}
                  alt={c.name}
                  className={`${c.h} w-auto object-contain opacity-70 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0`}
                  draggable={false}
                />
                <span className="text-base font-medium text-muted-foreground">{c.name}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-border/60 px-6 pb-10 pt-8 text-sm text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2 text-foreground">
            <LogoMark className="h-5 w-5" />
            <span className="font-medium">NaviGraph</span>
          </span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
          >
            <GitHubIcon className="h-4 w-4" />
            lancelot2/NaviGraph
          </a>
        </footer>
      </div>
    </main>
  )
}

// Sticky, translucent top bar: wordmark left; GitHub stars + auth actions right.
function Navbar({ stars }: { stars: number | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" aria-label="NaviGraph">
          <Wordmark />
        </Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
          >
            <GitHubIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Star</span>
            <span className="flex items-center gap-1 border-l border-border pl-2 text-foreground">
              <StarIcon className="h-3.5 w-3.5 text-brand" />
              {stars !== null ? formatStars(stars) : "—"}
            </span>
          </a>
          <Link
            href="/login"
            className="hidden whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="whitespace-nowrap rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground shadow-sm shadow-brand/20 transition-opacity hover:opacity-90"
          >
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  )
}

// Floating blueprint nodes — the scattered blue squares from the banner.
function NodeField() {
  const nodes = [
    { top: "8%", left: "40%", size: 10, o: 0.5 },
    { top: "16%", left: "62%", size: 16, o: 0.75 },
    { top: "6%", left: "78%", size: 8, o: 0.35 },
    { top: "30%", left: "88%", size: 12, o: 0.55 },
    { top: "50%", left: "94%", size: 8, o: 0.3 },
    { top: "22%", left: "50%", size: 6, o: 0.4 },
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {nodes.map((n, i) => (
        <span
          key={i}
          className="absolute rounded-[2px] bg-brand"
          style={{
            top: n.top,
            left: n.left,
            width: n.size,
            height: n.size,
            opacity: n.o,
          }}
        />
      ))}
    </div>
  )
}

// Input → NaviGraph → Output flow.
function FlowDiagram() {
  return (
    <div className="flex flex-col justify-center gap-3 rounded-xl border border-border bg-card p-6">
      <FlowBlock label="input" items={["instruction", "RGB camera image"]} />
      <FlowArrow />
      <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
        <LogoMark className="h-5 w-5 text-brand" />
        <span className="font-mono text-sm font-medium">POST /context</span>
      </div>
      <FlowArrow />
      <FlowBlock
        label="output"
        items={[
          "current location",
          "destination",
          "path",
          "landmarks",
          "navigation context",
        ]}
      />
    </div>
  )
}

function FlowBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/50 px-4 py-3">
      <div className="label-mono mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-xs">
            {it}
          </span>
        ))}
      </div>
    </div>
  )
}

function FlowArrow() {
  return <div className="text-center font-mono text-muted-foreground">↓</div>
}

// ── Inline icons ──────────────────────────────────────────────────────

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 16.9l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5Z" />
    </svg>
  )
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

// A tiny floor-plan glyph: rooms partitioned by walls.
function PlanGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M3 10h8M11 3v13M11 16h10M16 16v5" />
    </svg>
  )
}

// A walkthrough-video glyph: camera body with a play/lens.
function VideoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="6" width="14" height="12" rx="2" />
      <path d="M16.5 10l5-3v10l-5-3" />
      <circle cx="9" cy="12" r="2.4" />
    </svg>
  )
}
