"use client"

import * as React from "react"
import { cn } from "cn"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

// The base for EvidenceCard on desktop (04 §7): a paper card, 3px radius, --lift-card.
function HoverCardContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "paper z-50 w-80 rounded-card border-(length:--rule) border-sheet-line p-4 shadow-lift-card outline-none data-[state=open]:animate-[rise-in_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[fade-out_var(--dur-quick)_var(--ease-exit)_forwards]",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
