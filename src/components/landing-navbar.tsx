"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Wordmark } from "@/components/logo"

const REPO_URL = "https://github.com/lancelot2/NaviGraph"

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`
}

// Landing top bar: transparent while pinned at the very top so it reads as one
// surface with the hero, then fades in its own chrome (blur + border) on scroll.
export function LandingNavbar({ stars }: { stars: number | null }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        scrolled
          ? "border-b border-border/60 bg-background/70 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
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
