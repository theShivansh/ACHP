"use client"

import * as React from "react"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

// Tabs are a ruled index, not a segmented pill: sentence-case labels over a hairline,
// the active tab carries a 2px rule in the surface's primary ink. Works on desk and paper.
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-4 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex items-stretch gap-4 text-surface-fg-2 group-data-[orientation=horizontal]/tabs:border-b-(length:--rule) group-data-[orientation=horizontal]/tabs:border-surface-line group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:gap-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative -mb-px inline-flex min-h-10 cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-1 type-ui whitespace-nowrap transition-colors duration-(--dur-quick) hover:text-surface-fg disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-surface-fg data-[state=active]:text-surface-fg group-data-[orientation=vertical]/tabs:mb-0 group-data-[orientation=vertical]/tabs:border-b-0 group-data-[orientation=vertical]/tabs:border-l-2 group-data-[orientation=vertical]/tabs:pl-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.5] [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
