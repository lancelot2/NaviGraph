import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { signOut } from "@/app/login/actions"
import { NewProjectForm } from "@/components/new-project-form"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"

export default async function Dashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, plan_path, created_at")
    .order("created_at", { ascending: false })

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark className="h-6 w-6 text-brand" />
            <span className="text-[15px] font-bold tracking-tight">NaviGraph</span>
            <span className="label-mono hidden sm:block">studio</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {user?.email}
            </span>
            <Link
              href="/dashboard/api"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              API keys
            </Link>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <div className="mb-8">
          <span className="label-mono">your buildings</span>
          <h1 className="mt-2 font-display text-4xl tracking-tight">
            Spatial graphs
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Each building is a plan turned into a navigable memory. Create one to
            start.
          </p>
        </div>

        <NewProjectForm />

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(projects ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_16px_40px_-24px_rgba(30,40,90,0.4)]"
            >
              <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
              <div className="relative">
                <div className="mb-8 flex items-center justify-between">
                  <span className="label-mono">building</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      p.plan_path ? "bg-brand" : "bg-muted-foreground/40"
                    }`}
                  />
                </div>
                <h3 className="font-display text-xl tracking-tight">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.plan_path ? "Plan uploaded" : "No plan yet"}
                </p>
              </div>
            </Link>
          ))}
        </section>

        {(!projects || projects.length === 0) && (
          <p className="mt-10 text-sm text-muted-foreground">
            No buildings yet — create your first one above.
          </p>
        )}
      </main>
    </div>
  )
}
