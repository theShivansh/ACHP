'use client';

// React binding for a run's live event log: RunConnection → reduceRun. Components read slices of
// `state`; nothing else changes run state.

import { startTransition, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { apiBase } from './api';
import { RunConnection, type ConnectionOptions, type ConnectionStatus } from './connection';
import { initialRunState, isFinished, reduceAll, reduceRun, type RunState } from './reducer';
import type { RunEvent } from './types';

interface Batch {
  runId: string;
  events: RunEvent[];
}

function batchReducer(state: RunState, action: Batch): RunState {
  const base = state.runId === action.runId ? state : initialRunState(action.runId);
  return action.events.reduce(reduceRun, base);
}

export interface UseRunEventsOptions extends Partial<ConnectionOptions> {
  /** Events already fetched (server render of a stored run). The connection resumes after them. */
  initialEvents?: readonly RunEvent[];
}

export interface UseRunEvents {
  state: RunState;
  connection: ConnectionStatus;
  retry: () => void;
  /**
   * `performance.now()` when the latest live batch arrived, for display clocks only
   * ("Working · 3.2s" counts real time since the last real event). Null before any live event.
   */
  receivedAt: number | null;
}

function startState(runId: string | null, initial?: readonly RunEvent[]): RunState {
  const base = initialRunState(runId);
  return initial?.length ? reduceAll(initial, base) : base;
}

export function useRunEvents(
  runId: string | null,
  options: UseRunEventsOptions = {},
  onEvents?: (events: RunEvent[]) => void,
): UseRunEvents {
  const { initialEvents, ...connOptions } = options;
  const [state, dispatch] = useReducer(batchReducer, undefined, () => startState(runId, initialEvents));
  const [conn, setConn] = useState<{ runId: string | null; status: ConnectionStatus }>({
    runId,
    status: 'idle',
  });
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const connRef = useRef<RunConnection | null>(null);
  const onEventsRef = useRef(onEvents);
  const stateRef = useRef(state);
  const baseUrl = connOptions.baseUrl ?? apiBase();

  useEffect(() => {
    onEventsRef.current = onEvents;
    stateRef.current = state;
  });

  useEffect(() => {
    if (!runId) return;
    const current = stateRef.current.runId === runId ? stateRef.current : null;
    // A stored run that already ended needs no connection: its log is complete.
    if (current && isFinished(current)) {
      setConn({ runId, status: 'closed' });
      return;
    }
    const c = new RunConnection(
      runId,
      { ...connOptions, baseUrl },
      (events) => {
        // Rendering a batch is a transition: React renders it in slices that yield to the browser, so a big batch (the
        // lanes appearing, the report landing) is not one long task on a slow phone (P8 performance gate). The state is
        // still exactly the reduced log; only when it paints can be deferred by a frame or two.
        startTransition(() => {
          setReceivedAt(performance.now());
          dispatch({ runId, events });
        });
        onEventsRef.current?.(events);
      },
      (status) => setConn({ runId, status }),
      current?.lastSeq ?? 0,
    );
    connRef.current = c;
    c.start();
    return () => {
      c.close();
      if (connRef.current === c) connRef.current = null;
    };
    // options are read once per run; a new runId or backend opens a new connection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, baseUrl]);

  const retry = useCallback(() => connRef.current?.retry(), []);

  return {
    state: state.runId === runId ? state : initialRunState(runId),
    connection: conn.runId === runId ? conn.status : 'idle',
    retry,
    receivedAt,
  };
}
