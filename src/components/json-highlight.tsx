import { Fragment } from "react"

type Theme = { key: string; str: string; num: string; punct: string; text: string }

const THEMES: Record<"dark" | "light", Theme> = {
  dark: { key: "#9db4ff", str: "#b7d98a", num: "#e0a96d", punct: "#6f6f66", text: "#d8d5cc" },
  light: { key: "var(--brand)", str: "#3f7d34", num: "#b4602b", punct: "#9a968c", text: "inherit" },
}

const TOKEN =
  /("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?|true|false|null)|([{}[\],:])|(\s+)/g

function renderLine(line: string, t: Theme, keyPrefix: string) {
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(line)) !== null) {
    if (m.index > last) out.push(<Fragment key={`${keyPrefix}-r${i++}`}>{line.slice(last, m.index)}</Fragment>)
    const [, keyStr, str, num, punct, ws] = m
    if (keyStr) out.push(<span key={`${keyPrefix}-t${i++}`} style={{ color: t.key }}>{keyStr}</span>)
    else if (str) out.push(<span key={`${keyPrefix}-t${i++}`} style={{ color: t.str }}>{str}</span>)
    else if (num) out.push(<span key={`${keyPrefix}-t${i++}`} style={{ color: t.num }}>{num}</span>)
    else if (punct) out.push(<span key={`${keyPrefix}-t${i++}`} style={{ color: t.punct }}>{punct}</span>)
    else if (ws) out.push(<Fragment key={`${keyPrefix}-t${i++}`}>{ws}</Fragment>)
    last = m.index + m[0].length
  }
  if (last < line.length) out.push(<Fragment key={`${keyPrefix}-r${i++}`}>{line.slice(last)}</Fragment>)
  return out
}

// Syntax-highlighted JSON. Pass `chars` to reveal only the first N characters
// (with a caret) for a real character-by-character typewriter effect.
export function JsonBlock({
  text,
  theme = "dark",
  chars,
  caret = false,
}: {
  text: string
  theme?: "dark" | "light"
  chars?: number
  caret?: boolean
}) {
  const t = THEMES[theme]
  const visible = chars != null ? text.slice(0, chars) : text
  const all = visible.length ? visible.split("\n") : [""]
  return (
    <div style={{ color: t.text }}>
      {all.map((ln, idx) => (
        <div key={idx} className="whitespace-pre-wrap">
          {renderLine(ln, t, `l${idx}`)}
          {caret && idx === all.length - 1 && (
            <span className="animate-caret ml-px inline-block h-3.5 w-[7px] translate-y-0.5 bg-brand" />
          )}
        </div>
      ))}
    </div>
  )
}
