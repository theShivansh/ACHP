import * as React from "react"
import { cn } from "cn"
import { LampGlyph } from "@/components/glyphs"

export type BackendStatus = "waking" | "ready" | "unreachable"

const label: Record<BackendStatus, string> = {
  waking: "Waking the desk",
  ready: "Ready",
  unreachable: "Unreachable",
}

// Desk inks. "Ready" is quiet graphite: the verdict colors belong to the sheet's stamps.
const dot: Record<BackendStatus, string> = {
  waking: "bg-desk-ochre",
  ready: "bg-desk-graphite",
  unreachable: "bg-desk-red",
}

// 04 §7 StatusPill: the backend's state as a chip on the desk (not a pill button).
// The status is always written out; the dot only repeats it. `elapsedSeconds` comes from the
// caller's health polling; this component keeps no timer of its own. While the backend wakes, the dot is a small lamp
// that flickers in irregular stepped frames (05 §3.4, the only loop allowed while nothing is checking); it stops the
// moment /health answers, and under reduced motion it is lit and still.
function StatusChip({
  status,
  elapsedSeconds,
  retryInSeconds,
  onRetry,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status: BackendStatus
  elapsedSeconds?: number
  /** While unreachable: seconds to the next automatic retry. */
  retryInSeconds?: number | null
  /** While unreachable: try now. Renders a button next to the chip's words. */
  onRetry?: () => void
}) {
  // The seconds appear once the wait is noticeable, so a fast answer never flashes a number.
  const text =
    status === "waking" && elapsedSeconds != null && elapsedSeconds >= 3
      ? `${label.waking} · ${elapsedSeconds}s`
      : status === "unreachable" && retryInSeconds != null
        ? `${label.unreachable} · retrying in ${retryInSeconds}s`
        : label[status]

  return (
    <span
      data-slot="status-chip"
      data-status={status}
      data-waking={status === "waking" || undefined}
      role="status"
      className={cn(
        "inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-chip border-(length:--rule) border-desk-line bg-desk-raised px-2.5 type-meta text-desk-ink-2",
        className
      )}
      {...props}
    >
      {status === "waking" ? (
        <LampGlyph className="lamp size-4 text-desk-ochre" />
      ) : (
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dot[status])} />
      )}
      <span className="sr-only">Backend: </span>
      {text}
      {status === "unreachable" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="-my-1 -mr-1.5 ml-0.5 min-h-6 cursor-pointer rounded-chip px-1.5 type-meta text-desk-ink underline decoration-(length:--rule) underline-offset-4 pointer-coarse:min-h-11"
        >
          Retry
        </button>
      )}
    </span>
  )
}

export { StatusChip }
