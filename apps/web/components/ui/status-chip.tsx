import * as React from "react"
import { cn } from "cn"

export type BackendStatus = "waking" | "ready" | "unreachable"

const label: Record<BackendStatus, string> = {
  waking: "Waking the desk",
  ready: "Ready",
  unreachable: "Unreachable",
}

const dot: Record<BackendStatus, string> = {
  waking: "bg-ochre",
  ready: "bg-support",
  unreachable: "bg-pencil-red",
}

// 04 §7 StatusPill: the backend's state as a chip on the desk (not a pill button).
// The status is always written out; the dot only repeats it. `elapsedSeconds` comes from the
// caller's health polling; this component keeps no timer of its own.
function StatusChip({
  status,
  elapsedSeconds,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status: BackendStatus
  elapsedSeconds?: number
}) {
  const text =
    status === "waking" && elapsedSeconds != null
      ? `${label.waking} · ${elapsedSeconds}s`
      : label[status]

  return (
    <span
      data-slot="status-chip"
      data-status={status}
      role="status"
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-chip border-(length:--rule) border-desk-line bg-desk-raised px-2.5 type-meta text-desk-ink-2",
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot[status])} />
      <span className="sr-only">Backend: </span>
      {text}
    </span>
  )
}

export { StatusChip }
