import { EVENT_TYPES, type EventType } from '@/lib/runs/types';

// What /developers says about the event protocol (06 §3.1): who emits each event and what it carries. A hand-kept
// summary of the spec's table; a test fails if an event type exists that this page does not describe.

export const EVENT_DOCS: Record<EventType, { by: string; carries: string }> = {
  'run.queued': { by: 'server', carries: 'position in the queue' },
  'run.started': { by: 'server', carries: 'the input, the agents (id, name, role, group, model) and the prompt version' },
  'agent.started': { by: 'each agent', carries: 'the round (a second round after a debate)' },
  'agent.action': { by: 'each agent', carries: 'kind (search_web, fetch_source, llm_call …), a label and a detail' },
  'agent.note': { by: 'each agent', carries: 'a short public note (at most 140 characters, checked by the server) and its source' },
  'agent.done': { by: 'each agent', carries: 'a summary, the duration and the model that served it' },
  'agent.skipped': { by: 'server', carries: 'why (blocked, cache_hit, not_applicable)' },
  'agent.failed': { by: 'each agent', carries: 'a code, a message and whether it can be retried' },
  'evidence.found': { by: 'retriever', carries: 'one evidence object: source, locator, a verbatim quote' },
  'evidence.verified': { by: 'verifier', carries: 'accepted or rejected, and why' },
  'claim.extracted': { by: 'proposer', carries: 'one checkable part: id, text, where it sits in the message' },
  'claim.marked': { by: 'adversaries', carries: 'a relation to a span of a part, a severity, the evidence ids and a note' },
  'signal.computed': { by: 'wording checks', carries: 'one of sentiment, bias, perspective, framing, hedging, with spans over the input' },
  'debate.round': { by: 'judge', carries: 'the round and the reason for asking the challengers again' },
  'verdict.final': { by: 'judge', carries: 'the overall label and summary, a label per part, the confidence band and the five scores' },
  'assay.computed': { by: 'server', carries: 'the Assay: signals, scores, overall score, formula verdict, two keys, ledger, tipping point, masking and the Integrity Map point' },
  'run.completed': { by: 'server', carries: 'the total time and whether it came from the cache' },
  'run.failed': { by: 'server', carries: 'the stage, an error code and a message. Never a verdict' },
};

export function undocumented(): EventType[] {
  return EVENT_TYPES.filter((t) => !EVENT_DOCS[t]);
}

/** The REST calls, as curl, against the configured backend. */
export function restExamples(base: string): { title: string; note: string; code: string }[] {
  return [
    {
      title: 'Start a check',
      note: 'Answers 202 at once with the run id; progress streams from the events URL.',
      code: `curl -X POST ${base}/runs \\
  -H 'Content-Type: application/json' \\
  -d '{"input":{"type":"text","text":"The Berlin Wall fell in 1989."}}'`,
    },
    {
      title: 'Follow it live',
      note: 'Server-sent events. The id of each event is its sequence number; reconnect with Last-Event-ID to resume without a gap.',
      code: `curl -N ${base}/runs/RUN_ID/events \\
  -H 'Accept: text/event-stream' \\
  -H 'Last-Event-ID: 12'`,
    },
    {
      title: 'Read the whole log',
      note: 'The stored event log as JSON: what a case page, a replay and the Trace export are built from.',
      code: `curl ${base}/runs/RUN_ID/events.json`,
    },
    {
      title: 'Ask a library',
      note: 'Answers only from the library; every sentence carries a [N] marker for a passage that was retrieved.',
      code: `curl -X POST ${base}/qa \\
  -H 'Content-Type: application/json' \\
  -d '{"question":"How much exercise does WHO recommend?","kb_id":"KB_ID"}'`,
    },
    {
      title: 'List libraries',
      note: 'Libraries are added with POST /kb/upload (a file, a url or text) and removed with DELETE /kb/{kb_id}.',
      code: `curl ${base}/kb/list`,
    },
    { title: 'Is it awake', note: 'The first request after a quiet spell wakes a free-tier server, which can take up to a minute.', code: `curl ${base}/health` },
  ];
}
