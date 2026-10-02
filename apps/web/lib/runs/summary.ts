// One plain line per event for the Trace table. Only what the event itself says: nothing is
// inferred, and no model text other than the validated notes the events already carry.

import type { RunEvent } from './types';

function clip(s: string, n = 110): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

export function eventSummary(e: RunEvent): string {
  switch (e.type) {
    case 'run.queued':
      return `Waiting for a free desk (position ${e.data.position})`;
    case 'run.started':
      return `Started with ${e.data.agents.length} agents`;
    case 'agent.started':
      return e.data.round && e.data.round > 1 ? `Started round ${e.data.round}` : 'Started';
    case 'agent.action':
      return clip(e.data.detail ? `${e.data.label}: ${e.data.detail}` : e.data.label);
    case 'agent.note':
      return clip(e.data.note);
    case 'agent.done':
      return clip(e.data.summary);
    case 'agent.skipped':
      return `Skipped: ${e.data.reason.replace(/_/g, ' ')}`;
    case 'agent.failed':
      return clip(e.data.message);
    case 'evidence.found': {
      const s = e.data.evidence.source;
      return clip(`${e.data.evidence.evidence_id} · ${s.domain ?? s.kind}${s.title ? ` · ${s.title}` : ''}`);
    }
    case 'evidence.verified':
      return `${e.data.evidence_id} ${e.data.status}`;
    case 'claim.extracted':
      return clip(`${e.data.claim.claim_id} · ${e.data.claim.text}`);
    case 'claim.marked':
      return `${e.data.claim_id} · ${e.data.relation.replace(/_/g, ' ')}`;
    case 'signal.computed':
      return `${e.data.signal}: ${e.data.label}`;
    case 'debate.round':
      return clip(`Round ${e.data.round}: ${e.data.reason}`);
    case 'verdict.final':
      return `Verdict: ${e.data.overall.label.replace(/_/g, ' ')}`;
    case 'findings.recorded':
      return 'Findings of the reviewers recorded';
    case 'assay.computed':
      return 'Scores computed';
    case 'run.completed':
      return `Completed in ${(e.data.total_ms / 1000).toFixed(1)}s`;
    case 'run.failed':
      return clip(e.data.message);
  }
}
