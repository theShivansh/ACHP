"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Sonner's own theming hooks, pointed at the desk tokens (CSS custom properties only).
const toastVars = {
  '--normal-bg': 'var(--desk-raised)',
  '--normal-text': 'var(--desk-ink)',
  '--normal-border': 'var(--desk-line)',
  '--border-radius': 'var(--radius-chip)',
} as React.CSSProperties

// Toasts are desk chrome, and the desk is dark in both themes, so Sonner stays on its dark set.
// Every toast is visible and announced (sonner uses a live region);
// ACHP makes no sound. No loading spinner: progress comes only from server events.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon aria-hidden="true" className="size-4 stroke-[1.5]" />,
        info: <InfoIcon aria-hidden="true" className="size-4 stroke-[1.5]" />,
        warning: <TriangleAlertIcon aria-hidden="true" className="size-4 stroke-[1.5]" />,
        error: <OctagonXIcon aria-hidden="true" className="size-4 stroke-[1.5]" />,
      }}
      style={toastVars}
      {...props}
    />
  )
}

export { Toaster }
