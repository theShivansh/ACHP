import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// 04 §5/§7: 6px radius (never a pill), Public Sans 500 14px, the global 2px focus outline.
// Colors come from the surface context, so a button reads correctly on the desk and on paper.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-button type-ui whitespace-nowrap transition-colors duration-(--dur-quick) ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.5] [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-pencil-blue text-on-pencil-blue hover:bg-pencil-blue/90 active:bg-pencil-blue/80",
        secondary:
          "border border-surface-line bg-transparent text-surface-fg hover:bg-surface-tint active:bg-surface-tint",
        ghost: "bg-transparent text-surface-fg-2 hover:bg-surface-tint hover:text-surface-fg",
        destructive:
          "border border-surface-red bg-transparent text-surface-red hover:bg-surface-red/10 active:bg-surface-red/15",
        link: "h-auto px-0 text-surface-blue underline underline-offset-4 hover:decoration-2",
      },
      size: {
        sm: "h-8 px-3 has-[>svg]:px-2.5",
        default: "h-10 px-4 has-[>svg]:px-3",
        lg: "h-11 px-5 has-[>svg]:px-4",
        // 44px touch targets below md (07 §6); 40px with a pointer
        icon: "size-11 md:size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
