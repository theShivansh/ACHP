'use client';

import { XIcon } from 'lucide-react';
import { dismiss, useNotices } from '@/lib/notify';

// Where notify() messages appear: desk chrome at the bottom of the screen. The live region carries the message text
// alone (so a screen reader hears the message, not "Dismiss"); the visible notices hold the text and a Dismiss
// button. A notice fades in (--dur-quick) and leaves at once; reduced motion shows it in place.
export function Notices() {
  const list = useNotices();
  const latest = list[list.length - 1];
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {latest?.text ?? ''}
      </p>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {list.map((n) => (
          <div
            key={n.id}
            data-notice
            className="pointer-events-auto flex max-w-[34rem] items-start gap-2 rounded-chip border-(length:--rule) border-desk-line bg-desk-raised py-2 pr-1.5 pl-3 type-ui text-desk-ink shadow-lift-card motion-safe:animate-[fade-in_var(--dur-quick)_var(--ease-out)]"
          >
            <p className="py-0.5">{n.text}</p>
            <button
              type="button"
              onClick={(e) => {
                // The button is about to go: keep keyboard focus on the page rather than dropping it to <body>.
                const hadFocus = e.currentTarget === document.activeElement;
                dismiss(n.id);
                if (hadFocus) document.getElementById('main')?.focus({ preventScroll: true });
              }}
              aria-label="Dismiss"
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-button text-desk-ink-2 hover:bg-desk hover:text-desk-ink pointer-coarse:size-11"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
