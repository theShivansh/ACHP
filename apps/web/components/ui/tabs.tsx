"use client"

import * as React from "react"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

// Tabs are a ruled index, not a segmented pill: sentence-case labels over a hairline. The active tab carries a
// 2px rule in the surface's primary ink, and that rule slides from tab to tab (05 §4, --dur-base) so you see
// where you went. It is one transform on one element: translateX and scaleX, never a layout property. Until it
// has measured its first position (or where it can't, as in a vertical list) the active tab draws its own rule.
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
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const [slide, setSlide] = React.useState<{ x: number; w: number } | null>(null)
  const [settled, setSettled] = React.useState(false)

  // Follow the active trigger: Radix flips `data-state`, a resize or a font load moves it.
  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!list || list.closest("[data-orientation=vertical]")) return
    const place = () => {
      const on = list.querySelector<HTMLElement>("[data-slot=tabs-trigger][data-state=active]")
      // Fractional pixels (not offsetLeft's whole ones), so the rule sits exactly under the label's box.
      const a = on?.getBoundingClientRect()
      const box = list.getBoundingClientRect()
      const next = a ? { x: a.left - box.left - list.clientLeft + list.scrollLeft, w: a.width } : null
      setSlide((prev) => (prev && next && prev.x === next.x && prev.w === next.w ? prev : next))
    }
    place()
    const mo = new MutationObserver(place)
    mo.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
    const ro = new ResizeObserver(place)
    ro.observe(list)
    void document.fonts?.ready.then(place)
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [])

  // The first placement is not a move: switch the transition on a frame later.
  React.useEffect(() => {
    if (!slide || settled) return
    const f = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(f)
  }, [slide, settled])

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      data-slide={slide ? "on" : undefined}
      className={cn(
        "group/list relative inline-flex items-stretch gap-4 text-surface-fg-2 group-data-[orientation=horizontal]/tabs:border-b-(length:--rule) group-data-[orientation=horizontal]/tabs:border-surface-line group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:gap-1",
        className
      )}
      {...props}
    >
      {children}
      {slide && (
        <span
          aria-hidden="true"
          data-slot="tabs-indicator"
          data-settled={settled || undefined}
          style={{ "--x": `${slide.x}px`, "--w": slide.w } as React.CSSProperties}
          className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-px origin-left translate-x-(--x) scale-x-(--w) bg-surface-fg data-settled:transition-transform data-settled:duration-(--dur-base) data-settled:ease-(--ease-in-out)"
        />
      )}
    </TabsPrimitive.List>
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
        "relative -mb-px inline-flex min-h-10 pointer-coarse:min-h-11 cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-1 type-ui whitespace-nowrap transition-colors duration-(--dur-quick) hover:text-surface-fg disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-surface-fg data-[state=active]:text-surface-fg group-data-[slide=on]/list:data-[state=active]:border-transparent group-data-[orientation=vertical]/tabs:mb-0 group-data-[orientation=vertical]/tabs:border-b-0 group-data-[orientation=vertical]/tabs:border-l-2 group-data-[orientation=vertical]/tabs:pl-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.5] [&_svg:not([class*='size-'])]:size-4",
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
