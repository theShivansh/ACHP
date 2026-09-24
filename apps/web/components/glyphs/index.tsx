import * as React from "react"
import { cn } from "cn"

// Placeholder agent glyphs (04 §6, §8): 24px, 1.75px stroke, round caps, in currentColor.
// Simple strokes with a slight wobble for now; P8 replaces them with the hand-drawn set.
// Always decorative: the agent's name is written next to the glyph.

export type GlyphProps = Omit<React.ComponentProps<"svg">, "children">

function Glyph({ className, children, ...props }: React.ComponentProps<"svg">) {
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
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  )
}

/** Gatekeeper: a wax-seal ring. */
export function SealGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3.2c2.1.1 3.3 1.4 4.9 1.9 1.7.6 3 1.8 3 3.9.1 1.9-.9 3-.8 4.9.1 2-1.3 3.5-3.2 4.3-1.6.7-2.4 2.3-4.1 2.4-1.8.1-2.7-1.5-4.3-2.2-1.9-.8-3.3-2.2-3.3-4.3 0-1.9-.9-3.1-.7-4.9.2-2 1.6-3.3 3.3-3.9 1.7-.6 3.1-2.2 5.2-2.1z" />
      <path d="M12 8.3c2.1-.1 3.7 1.6 3.7 3.7 0 2-1.6 3.8-3.7 3.7-2 0-3.6-1.7-3.6-3.7 0-2.1 1.6-3.7 3.6-3.7z" />
    </Glyph>
  )
}

/** Clipper (retriever): a paperclip. */
export function PaperclipGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M15.8 7.2 8.9 14.1c-.9.9-.8 2.2 0 3 .9.8 2.1.8 3-.1l7.4-7.4c1.7-1.7 1.6-4.2 0-5.8-1.6-1.6-4.2-1.7-5.9 0L5.9 11.3c-2.4 2.4-2.3 6.1 0 8.4 2.3 2.2 5.9 2.3 8.3-.1l6-6" />
    </Glyph>
  )
}

/** Decomposer (proposer): scissors. */
export function ScissorsGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M6.2 3.9c1.6-.1 2.8 1.2 2.8 2.7 0 1.6-1.3 2.8-2.8 2.8-1.6 0-2.8-1.3-2.7-2.8 0-1.5 1.2-2.7 2.7-2.7z" />
      <path d="M6.2 14.6c1.6-.1 2.8 1.2 2.8 2.7 0 1.6-1.3 2.8-2.8 2.8-1.6 0-2.8-1.3-2.7-2.8 0-1.5 1.2-2.7 2.7-2.7z" />
      <path d="M8.5 8.2 20.3 18.6" />
      <path d="M8.5 15.8 20.3 5.4" />
    </Glyph>
  )
}

/** Fact Challenger and Narrative Auditor: a pencil (the ink tells them apart). */
export function PencilGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M15.6 4.3c.8-.8 2.1-.9 2.9-.1l1.3 1.3c.8.8.8 2.1-.1 2.9L8.6 19.5 4 20.1l.5-4.5L15.6 4.3z" />
      <path d="m13.8 6.2 4 4" />
    </Glyph>
  )
}

/** Framing Lens (NIL): a highlighter. */
export function HighlighterGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m9.1 14.9 6.7-10.1c.6-.9 1.9-1.1 2.8-.5l.9.6c.9.6 1.1 1.8.5 2.7l-6.7 10.1" />
      <path d="m9.1 14.9 4.2 2.8-1.6 2.4-4.3-.4 1.7-4.8z" />
      <path d="M3.8 20.6h6.4" />
    </Glyph>
  )
}

/** Judge: a rubber stamp. */
export function StampGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9.6 12.3V9.4c-1.2-.7-2-2-2-3.4.1-2.3 2-4 4.4-4 2.3 0 4.3 1.8 4.3 4 0 1.5-.8 2.8-2 3.4v2.9" />
      <path d="M4.3 12.4h15.3c.6 0 1 .5 1 1v2.9H3.3v-2.9c0-.5.4-1 1-1z" />
      <path d="M5.2 20.2h13.7" />
    </Glyph>
  )
}

/** Verifier (future evidence_verifier): a loupe. */
export function LoupeGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M10.4 3.6c3.8-.1 6.8 3 6.8 6.8 0 3.8-3.1 6.9-6.8 6.8-3.8 0-6.8-3-6.8-6.8.1-3.8 3-6.8 6.8-6.8z" />
      <path d="m15.4 15.5 5.2 5" />
    </Glyph>
  )
}

/** Media Desk (future media_integrity): crop corners. */
export function CropGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M6.3 2.8v14.6c0 .5.3.8.8.8h14.1" />
      <path d="M2.8 6.4h14.1c.5 0 .8.3.8.8v14" />
    </Glyph>
  )
}

/** Unknown agent id from the server: a plain dot, so a new agent still gets a lane. */
export function DotGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 8.2c2.1 0 3.8 1.7 3.8 3.8 0 2.1-1.7 3.8-3.8 3.8-2.1 0-3.8-1.7-3.8-3.8 0-2.1 1.7-3.8 3.8-3.8z" />
    </Glyph>
  )
}
