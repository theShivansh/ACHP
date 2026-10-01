'use client';

import { useSyncExternalStore } from 'react';

// The library a check or a question uses by default ("Set active" on /library; the Desk's and /ask's selectors).
// Only the id is kept, in localStorage, guarded: storage can be missing or blocked, and the page works without it.
// A stale id (a deleted library) is ignored where the list of libraries is known.

export const ACTIVE_KEY = 'achp.activeKb.v1';
const listeners = new Set<() => void>();

export function readActiveLibrary(): string | null {
  try {
    const v = window.localStorage.getItem(ACTIVE_KEY);
    return v && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setActiveLibrary(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Blocked storage: the choice lasts until the page closes only if the caller keeps it; nothing breaks.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener('storage', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', l);
  };
}

/** The active library id (null when none, or on the server). */
export function useActiveLibrary(): string | null {
  return useSyncExternalStore(subscribe, readActiveLibrary, () => null);
}
