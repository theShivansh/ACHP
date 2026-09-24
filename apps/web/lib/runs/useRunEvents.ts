'use client';

// React binding for a run's live event log: RunConnection → reduceRun. Components read slices of
// `state`; nothing else changes run state.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { apiBase } from './api';
import { RunConnection, type ConnectionOptions, type ConnectionStatus } from './connection';
import { initialRunState, reduceRun, type RunState } from './reducer';
import type { RunEvent } from './types';

interface Batch {
  runId: string;
  events: RunEvent[];
}

function batchReducer(state: RunState, action: Batch): RunState {
  const base = state.runId === action.runId ? state : initialRunState(action.runId);
  return action.events.reduce(reduceRun, base);
}

export interface UseRunEvents {
  state: RunState;
  connection: ConnectionStatus;
  retry: () => void;
}

export function useRunEvents(
  runId: string | null,
  options: Partial<ConnectionOptions> = {},
  onEvents?: (events: RunEvent[]) => void,
): UseRunEvents {
  const [state, dispatch] = useReducer(batchReducer, runId, initialRunState);
  const [conn, setConn] = useState<{ runId: string | null; status: ConnectionStatus }>({
    runId,
    status: 'idle',
  });
  const connRef = useRef<RunConnection | null>(null);
  const onEventsRef = useRef(onEvents);
  const baseUrl = options.baseUrl ?? apiBase();

  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

  useEffect(() => {
    if (!runId) return;
    const c = new RunConnection(
      runId,
      { ...options, baseUrl },
      (events) => {
        dispatch({ runId, events });
        onEventsRef.current?.(events);
      },
      (status) => setConn({ runId, status }),
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
  };
}
