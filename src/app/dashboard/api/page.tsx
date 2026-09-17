import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { ApiKeysManager } from "@/components/api-keys-manager"
import { LogoMark } from "@/components/logo"

export default async function ApiPage() {
  const supabase = await createClient()

  const [{ data: keys }, { data: projects }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, name, key, created_at, last_used_at")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id").limit(1),
  ])

  const sampleProjectId = projects?.[0]?.id ?? "YOUR_PROJECT_ID"
  const sampleKey = keys?.[0]?.key ?? "navi_your_api_key"

  const curl = `curl -X POST https://your-app.netlify.app/api/context \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "${sampleProjectId}",
    "instruction": "Go to the supply room",
    "image": "data:image/jpeg;base64,...optional camera frame..."
  }'`

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark className="h-6 w-6 text-brand" />
            <span className="text-[15px] font-bold tracking-tight">NaviGraph</span>
            <span className="label-mono hidden sm:block">api</span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <span className="label-mono">developers</span>
        <h1 className="mt-2 font-display text-4xl tracking-tight">API keys</h1>
        <p className="mt-2 text-muted-foreground">
          Call NaviGraph from any robot or backend.
        </p>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium">Your keys</h2>
          <ApiKeysManager keys={keys ?? []} />
        </section>

        <section className="mt-12 flex flex-col gap-5">
          <div>
            <span className="label-mono">quickstart</span>
            <h2 className="mt-1 font-display text-2xl tracking-tight">
              Make your first call
            </h2>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <p className="mb-3 text-sm font-medium">Body parameters</p>
            <dl className="space-y-2.5 text-sm">
              <ParamRow name="projectId" required>
                the building to navigate — the id in your project URL{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  /projects/&lt;projectId&gt;
                </code>
              </ParamRow>
              <ParamRow name="instruction" required>
                natural-language goal, e.g. &quot;Go to the supply room&quot;
              </ParamRow>
              <ParamRow name="image">
                optional base64 camera frame used to localize the robot
              </ParamRow>
              <ParamRow name="current_location">
                optional fallback room name (skips image localization)
              </ParamRow>
            </dl>
          </div>

          <CodeBlock title="request.sh" body={curl} />
          <CodeBlock
            title="response.json"
            body={`{
  "current_location": "Main Lobby",
  "destination": "Supply Room",
  "path": ["Main Lobby", "East Corridor", "Supply Room"],
  "landmarks": ["metal shelves"],
  "context": "You are in Main Lobby. Goal: reach Supply Room. ..."
}`}
          />

          <p className="text-sm text-muted-foreground">
            The{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              context
            </code>{" "}
            string is the deliverable — feed it straight into your navigation model
            (Robostral, OpenVLA, GR00T, …).
          </p>
        </section>
      </main>
    </div>
  )
}

function ParamRow({
  name,
  required,
  children,
}: {
  name: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <div className="flex shrink-0 items-center gap-1.5 sm:w-40">
        <code className="font-mono text-xs text-brand">{name}</code>
        {required && <span className="label-mono !text-[9px] text-clay">req</span>}
      </div>
      <div className="text-muted-foreground">{children}</div>
    </div>
  )
}

function CodeBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#181713]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 font-mono text-xs text-white/40">{title}</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-neutral-300">
        {body}
      </pre>
    </div>
  )
}
