import * as React from "react"
import { cn } from "cn"
import { GLYPH_PATHS, type GlyphName } from "./paths"

// The hand-drawn glyph set (04 §6, §8): 24px, one 1.75px stroke with round caps, in currentColor, with a pencil's
// wobble baked into the path (paths.ts). Decorative by default (the agent's name is written next to it); pass
// `title` where the glyph is the only thing that says what it is, and it becomes a named image.

export type GlyphProps = Omit<React.ComponentProps<"svg">, "children"> & {
  /** A name for assistive tech. Without it the glyph is hidden from the accessibility tree. */
  title?: string
}

function Glyph({ glyph, title, className, ...props }: GlyphProps & { glyph: GlyphName }) {
  const titleId = React.useId()
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      data-glyph={glyph}
      {...(title ? { role: "img", "aria-labelledby": titleId } : { "aria-hidden": true })}
      className={cn("shrink-0", className)}
      {...props}
    >
      {title && <title id={titleId}>{title}</title>}
      <path d={GLYPH_PATHS[glyph]} />
    </svg>
  )
}

/** Gatekeeper: a wax seal. */
export const SealGlyph = (p: GlyphProps) => <Glyph {...p} glyph="seal" />
/** Clipper (retriever): a paperclip. */
export const PaperclipGlyph = (p: GlyphProps) => <Glyph {...p} glyph="paperclip" />
/** Decomposer (proposer): scissors. */
export const ScissorsGlyph = (p: GlyphProps) => <Glyph {...p} glyph="scissors" />
/** Fact Challenger: the red pencil. */
export const RedPencilGlyph = (p: GlyphProps) => <Glyph {...p} glyph="redPencil" />
/** Narrative Auditor: the blue pencil (a banded pencil, so the shapes differ as well as the inks). */
export const BluePencilGlyph = (p: GlyphProps) => <Glyph {...p} glyph="bluePencil" />
/** Framing Lens (NIL): a highlighter. */
export const HighlighterGlyph = (p: GlyphProps) => <Glyph {...p} glyph="highlighter" />
/** Judge: a rubber stamp. */
export const StampGlyph = (p: GlyphProps) => <Glyph {...p} glyph="stamp" />
/** Verifier (future evidence_verifier): a loupe. */
export const LoupeGlyph = (p: GlyphProps) => <Glyph {...p} glyph="loupe" />
/** Media Desk (future media_integrity): crop corners. */
export const CropGlyph = (p: GlyphProps) => <Glyph {...p} glyph="crop" />
/** The cold-start lamp (05 §3.4). */
export const LampGlyph = (p: GlyphProps) => <Glyph {...p} glyph="lamp" />
/** Unknown agent id from the server: a plain ring, so a new agent still gets a lane. */
export const DotGlyph = (p: GlyphProps) => <Glyph {...p} glyph="dot" />
