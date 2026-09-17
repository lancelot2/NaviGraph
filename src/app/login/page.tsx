"use client"

import { useActionState } from "react"
import Link from "next/link"
import { signIn, signUp, type AuthState } from "./actions"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initial: AuthState = {}

export default function LoginPage() {
  const [signInState, signInAction, signingIn] = useActionState(signIn, initial)
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, initial)
  const error = signInState.error ?? signUpState.error
  const message = signUpState.message

  return (
    <div className="bg-grid flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <LogoMark className="h-7 w-7 text-brand" />
          <span className="text-xl font-extrabold tracking-tight">NaviGraph</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card p-7 shadow-[0_24px_60px_-30px_rgba(30,40,90,0.35)]">
          <h1 className="font-display text-2xl tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in, or create an account to build your first spatial graph.
          </p>

          <form className="mt-6 flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-brand">{message}</p>}

            <Button
              type="submit"
              formAction={signInAction}
              disabled={signingIn}
              className="mt-1 w-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {signingIn ? "Signing in…" : "Sign in"}
            </Button>
            <Button
              type="submit"
              formAction={signUpAction}
              disabled={signingUp}
              variant="outline"
              className="w-full"
            >
              {signingUp ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
