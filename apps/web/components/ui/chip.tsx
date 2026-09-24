import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// 04 §5: chips are 4px, never pills. A tone always travels with its text (never color alone).
const chipVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-chip border-(length:--rule) px-2 type-meta whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
  {
    variants: {
      tone: {
        neutral: "border-surface-line text-surface-fg-2",
        support: "border-support/40 text-support",
        contradicted: "border-pencil-red/40 text-pencil-red",
        ochre: "border-ochre/40 text-ochre",
        graphite: "border-graphite/40 text-graphite",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

function Chip({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
  return (
    <span
      data-slot="chip"
      data-tone={tone ?? "neutral"}
      className={cn(chipVariants({ tone }), className)}
      {...props}
    />
  )
}

export { Chip, chipVariants }
