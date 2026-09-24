"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Sonner's own theming hooks, pointed at the desk tokens (CSS custom properties only).
const toastVars = {
  '--normal-bg': 'var(--desk-raised)',
  '--normal-text': 'var(--desk-ink)',
  '--normal-border': 'var(--desk-line)',
  '--border-radius': 'var(--radius-chip)',
} as React.CSSProperties

// Toasts are desk chrome. Every toast is visible and announced (sonner uses a live region);
// ACHP makes no sound. No loading spinner: progress comes only from server events.
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme = "light" } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
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
