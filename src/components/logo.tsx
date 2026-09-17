// NaviGraph mark.
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/new_logo.png"
      alt=""
      aria-hidden
      draggable={false}
      className={`object-contain ${className ?? ""}`}
    />
  )
}

// Wordmark: the product name, NaviGraph.
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="h-7 w-7" />
      <span className="text-[25px] font-extrabold tracking-tight">NaviGraph</span>
    </span>
  )
}
