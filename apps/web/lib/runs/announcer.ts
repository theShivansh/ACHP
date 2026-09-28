// Event → one plain sentence for the aria-live log (06 §7). ACHP is silent, so every confirmation
// a sighted user sees is also announced. Throttled to one sentence per 2s and deduped; while
// throttled, the most important pending sentence wins (verdict or failure > completion >
// agent failure or second round > progress).

import type { RunEvent } from './types';

const LABEL_WORDS: Record<string, string> = {
  supported: 'supported',
  contradicted: 'contradicted',
  mixed: 'mixed',
  missing_context: 'missing context',
  unverifiable: 'not settled by the sources',
  blocked: 'not checked',
};

const SKIP_WORDS: Record<string, string> = {
  blocked: 'the message was not checked',
  cache_hit: 'the answer came from a recent check',
  not_applicable: 'not needed for this message',
};

const STAGE_WORDS: Record<string, string> = {
  retriever: 'source search',
  proposer: 'claim splitting',
  analysis: 'challenge',
  judge: 'judging',
  config: 'setup',
  internal: 'server',
  server: 'server',
};

/** A skip reason in words ("the answer came from a recent check"). */
export function skipWords(reason: string): string {
  return SKIP_WORDS[reason] ?? reason.replace(/_/g, ' ');
}

/** A failed stage in words ("source search"). */
export function stageWords(stage: string): string {
  return STAGE_WORDS[stage] ?? stage.replace(/_/g, ' ');
}

/** A label in words ("missing context"). */
export function labelWords(label: string): string {
  return LABEL_WORDS[label] ?? label.replace(/_/g, ' ');
}

export interface Announcement {
  text: string;
  priority: number;
  seq: number;
}

type NameOf = (agentId: string | null) => string;

function sentence(text: string): string {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** The sentence for one event, or null when the event is too fine-grained to announce. */
export function describe(event: RunEvent, nameOf: NameOf): Announcement | null {
  const who = nameOf(event.agent);
  const at = (text: string, priority: number): Announcement => ({ text: sentence(text), priority, seq: event.seq });
  switch (event.type) {
    case 'run.queued': {
      const ahead = event.data.position - 1;
      return at(ahead > 0 ? `Waiting for a free desk. ${ahead} ahead` : 'Waiting for a free desk. Next in line', 1);
    }
    case 'run.started':
      return at(`Checking started with ${event.data.agents.length} agents`, 1);
    case 'agent.started':
      return event.data.round && event.data.round > 1 ? at(`${who} is taking a second look`, 1) : null;
    case 'agent.note':
      return at(`${who}: ${event.data.note}`, 1);
    case 'agent.done':
      return at(`${who} finished. ${event.data.summary}`, 1);
    case 'agent.skipped':
      return event.data.reason === 'blocked'
        ? null
        : at(`${who} skipped: ${skipWords(event.data.reason)}`, 1);
    case 'agent.failed':
      return at(`${who} could not finish. ${event.data.message}`, 2);
    case 'debate.round':
      return at(`The judge asked for a second round. ${event.data.reason}`, 2);
    case 'verdict.final': {
      const o = event.data.overall;
      if (o.label === 'blocked') return at('Not checked: this message cannot be checked safely', 4);
      return at(`Verdict: ${labelWords(o.label)}. Confidence ${o.confidence_band}. ${o.confidence_reason}`, 4);
    }
    case 'run.completed':
      return at('Check complete', 3);
    case 'run.failed':
      return at(
        `The check stopped at the ${stageWords(event.data.stage)} step. No verdict was produced`,
        4,
      );
    default:
      return null; // agent.action, evidence.*, claim.*, signal.computed, assay.computed
  }
}

export interface AnnouncerOptions {
  intervalMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/**
 * A throttled announcer. `push(event)` queues its sentence; `say` is called at most once per
 * interval. `dispose()` cancels any pending flush. Agent names come from `nameOf`, or else from
 * the run.started event the announcer has seen.
 */
export function createAnnouncer(say: (text: string) => void, nameOf?: NameOf, opts: AnnouncerOptions = {}) {
  const learned = new Map<string, string>();
  const names: NameOf = nameOf ?? ((id) => (id && learned.get(id)) || 'The desk');
  const interval = opts.intervalMs ?? 2000;
  const now = opts.now ?? (() => Date.now());
  const schedule = opts.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = opts.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let pending: Announcement[] = [];
  let lastAt = -Infinity;
  let lastText = '';
  let timer: unknown = null;

  function flush() {
    timer = null;
    if (!pending.length) return;
    const top = Math.max(...pending.map((p) => p.priority));
    // The latest of the most important sentences; the rest were overtaken while throttled.
    const pick = [...pending].reverse().find((p) => p.priority === top)!;
    pending = [];
    if (pick.text !== lastText) {
      say(pick.text);
      lastText = pick.text;
      lastAt = now();
    }
  }

  return {
    push(event: RunEvent) {
      if (event.type === 'run.started') for (const ag of event.data.agents) learned.set(ag.id, ag.name);
      const a = describe(event, names);
      if (!a || a.text === lastText || pending.some((p) => p.text === a.text)) return;
      pending.push(a);
      if (timer !== null) return;
      const wait = Math.max(0, lastAt + interval - now());
      if (wait === 0) flush();
      else timer = schedule(flush, wait);
    },
    dispose() {
      if (timer !== null) cancel(timer);
      timer = null;
      pending = [];
    },
  };
}
