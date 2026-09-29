'use client';

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';

// Evidence ↔ span linking (S5.x). Hovering or focusing an evidence card lights its spans on the
// strips and dims the rest; hovering or focusing a marked strip lights its cards. The state lives
// here, outside React state, and each consumer subscribes to a primitive ("active" | "related" |
// "dimmed" | "idle"), so a hover re-renders only the cards and strips whose answer changed.

export type LinkKind = 'evidence' | 'claim';
export type LinkState = 'idle' | 'active' | 'related' | 'dimmed';

interface Focus {
  kind: LinkKind;
  id: string;
  /** Ids of the other kind that this one is tied to (from marks and the verdict). */
  related: readonly string[];
}

export interface LinkStore {
  set(focus: Focus | null): void;
  stateOf(kind: LinkKind, id: string): LinkState;
  subscribe(listener: () => void): () => void;
}

export function createLinkStore(): LinkStore {
  let focus: Focus | null = null;
  const listeners = new Set<() => void>();
  return {
    set(next) {
      if (focus === next || (focus && next && focus.kind === next.kind && focus.id === next.id)) return;
      focus = next;
      for (const l of listeners) l();
    },
    stateOf(kind, id) {
      if (!focus) return 'idle';
      if (focus.kind === kind) return focus.id === id ? 'active' : 'dimmed';
      return focus.related.includes(id) ? 'related' : 'dimmed';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const Ctx = createContext<LinkStore | null>(null);

export function LinkProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createLinkStore);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

const NOOP: LinkStore = { set() {}, stateOf: () => 'idle', subscribe: () => () => {} };

export function useLinkStore(): LinkStore {
  return useContext(Ctx) ?? NOOP;
}

/** This element's link state; re-renders only when it changes. */
export function useLinkState(kind: LinkKind, id: string): LinkState {
  const store = useLinkStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.stateOf(kind, id),
    () => 'idle',
  );
}
