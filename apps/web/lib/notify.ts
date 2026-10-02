import { useSyncExternalStore } from 'react';

// Short messages the reader must see and hear (a blocked clipboard, a control that is not connected yet). Shown by
// <Notices /> in a polite live region; each stays until dismissed or for NOTICE_MS. No sound (CLAUDE.md rule 8).

export type Notice = { id: number; text: string };

export const NOTICE_MS = 8000;
let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function notify(text: string): void {
  // The same message twice in a row is one notice, not a stack of copies.
  if (notices.some((n) => n.text === text)) return;
  const n = { id: nextId++, text };
  notices = [...notices, n];
  emit();
  if (typeof window !== 'undefined') window.setTimeout(() => dismiss(n.id), NOTICE_MS);
}

export function dismiss(id: number): void {
  const next = notices.filter((n) => n.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emit();
}

const EMPTY: Notice[] = [];

export function useNotices(): Notice[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => notices,
    () => EMPTY,
  );
}
