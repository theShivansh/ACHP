"""
ACHP memory hierarchy.

  RequestMemory   what the caller asked (claim, library, options). Immutable for the run.
  RunMemory       everything one run produced: the evidence pack, each agent's grounded output,
                  the LLM call records and the grounding report. Agents read each other's output
                  from here instead of re-parsing lossy dicts. Discarded when the run ends
                  (P2 persists the run's *events*, not this object).
  EvidenceCache   the only long-term cache on the verdict path: web evidence keyed by the exact
                  normalized query, with a short TTL and a stored retrieval time. Verdicts, agent
                  outputs and library chunks are never cached, so a stale cache can at worst
                  repeat recent sources, never a past verdict.
  Retrieval ctx   the EvidencePack (achp.evidence.pack), rebuilt for every run.

There is no conversation memory: every request is independent, and nothing from one user's run is
visible to another run except cached public web search results.
"""
from achp.memory.evidence_cache import EvidenceCache, get_evidence_cache
from achp.memory.run_memory import RequestMemory, RunMemory

__all__ = ["EvidenceCache", "get_evidence_cache", "RequestMemory", "RunMemory"]
