'use client';

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { lineageEdges, reaches } from '@/lib/assay/lineage';

// Hallmark ↔ Ledger ↔ Lineage linking (05 §4.2). Hovering or focusing one of the five marks underlines the
// Ledger rows that fed it; hovering or focusing a Ledger row lights the marks it fed, its bar and its node in the
// Lineage. Like the evidence link store, the focus lives outside React state and each consumer reads a primitive,
// so a hover redraws only what changed. It never computes a score: which signals feed which metric comes from the
// lineage table (lib/assay/lineage.ts), which a test pins to the reference.

export type AssayFocus = { kind: 'metric'; id: string } | { kind: 'signal'; id: string };
export type AssayLit = 'idle' | 'active' | 'lit';

interface AssayLinkStore {
  set(focus: AssayFocus | null): void;
  peek(): AssayFocus | null;
  subscribe(listener: () => void): () => void;
}

function createStore(): AssayLinkStore {
  let focus: AssayFocus | null = null;
  const listeners = new Set<() => void>();
  return {
    set(next) {
      if (focus === next || (focus && next && focus.kind === next.kind && focus.id === next.id)) return;
      focus = next;
      for (const l of listeners) l();
    },
    peek: () => focus,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const NOOP: AssayLinkStore = { set() {}, peek: () => null, subscribe: () => () => {} };
const Ctx = createContext<AssayLinkStore>(NOOP);

export function AssayLinkProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

const EDGES = lineageEdges('code', true);
const reached = new Map<string, string[]>();
/** The metrics a raw signal feeds (through BIS and EPS into CTS too). */
export function metricsOf(signal: string): string[] {
  let r = reached.get(signal);
  if (!r) reached.set(signal, (r = reaches(EDGES, signal)));
  return r;
}

export function metricLit(focus: AssayFocus | null, code: string): AssayLit {
  if (!focus) return 'idle';
  if (focus.kind === 'metric') return focus.id === code ? 'active' : 'idle';
  return metricsOf(focus.id).includes(code) ? 'lit' : 'idle';
}

export function signalLit(focus: AssayFocus | null, signal: string): AssayLit {
  if (!focus) return 'idle';
  if (focus.kind === 'signal') return focus.id === signal ? 'active' : 'idle';
  return metricsOf(signal).includes(focus.id) ? 'lit' : 'idle';
}

/** How a metric (a Hallmark mark) relates to what is hovered or focused. */
export function useMetricLit(code: string): AssayLit {
  const store = useContext(Ctx);
  return useSyncExternalStore(
    store.subscribe,
    () => metricLit(store.peek(), code),
    () => 'idle',
  );
}

/** How a raw signal (a Ledger row, a Lineage node) relates to what is hovered or focused. */
export function useSignalLit(signal: string): AssayLit {
  const store = useContext(Ctx);
  return useSyncExternalStore(
    store.subscribe,
    () => signalLit(store.peek(), signal),
    () => 'idle',
  );
}

/** Pointer and keyboard handlers that point the link at one metric or signal (hover and focus alike). */
export function useAssayFocus(kind: AssayFocus['kind'], id: string) {
  const store = useContext(Ctx);
  const on = () => store.set({ kind, id });
  const off = () => store.set(null);
  return { onPointerEnter: on, onPointerLeave: off, onFocus: on, onBlur: off };
}
