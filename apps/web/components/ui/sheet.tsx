"use client"

import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-desk/70 data-[state=open]:animate-[fade-in_var(--dur-deliberate)_var(--ease-out)] data-[state=closed]:animate-[fade-out_var(--dur-base)_var(--ease-exit)_forwards]",
        className
      )}
      {...props}
    />
  )
}

// 04 §5: the tray becomes a right sheet on tablet; evidence opens in a bottom sheet on mobile.
// Those are paper. Navigation is desk chrome (04 §1: two surfaces, never mixed), so the menu uses
// surface="desk". Enter uses --dur-deliberate; exit is ~30% shorter (--dur-base).
function SheetContent({
  className,
  children,
  side = "right",
  surface = "paper",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "right" | "bottom"
  surface?: "paper" | "desk"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-surface={surface}
        className={cn(
          "fixed z-50 flex flex-col gap-4 outline-none",
          surface === "paper" ? "paper rounded-sheet shadow-lift-sheet" : "bg-desk-raised text-desk-ink",
          side === "right" &&
            "inset-y-0 right-0 h-full w-[min(85vw,340px)] border-l-(length:--rule) border-surface-line data-[state=open]:animate-[slide-in-right_var(--dur-deliberate)_var(--ease-out)] data-[state=closed]:animate-[slide-out-right_var(--dur-base)_var(--ease-exit)_forwards]",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85vh] border-t-(length:--rule) border-surface-line data-[state=open]:animate-[slide-in-bottom_var(--dur-deliberate)_var(--ease-out)] data-[state=closed]:animate-[slide-out-bottom_var(--dur-base)_var(--ease-exit)_forwards]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-2 right-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-button text-surface-fg-2 transition-colors duration-(--dur-quick) hover:bg-surface-tint hover:text-surface-fg [&_svg]:size-4 [&_svg]:stroke-[1.5]">
            <XIcon aria-hidden="true" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4 pr-14", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("type-h2 text-surface-fg", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("type-body text-surface-fg-2", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
