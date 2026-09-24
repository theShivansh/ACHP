import { NextResponse } from 'next/server';
import type { ACHPOutput } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analyze { query } — a thin proxy to the FastAPI backend.
//
// All model calls happen in the backend (apps/api, one shared Groq runtime). This route never
// calls a model and never invents a verdict: if the backend can't answer, it returns an error.
// Demo data is served only when the request carries ?demo=1 or DEMO_MODE=1 is set, and it is
// labelled pipeline.mode = 'demo' so the UI can watermark it.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL =
  process.env.ACHP_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8000';

const DEMO_MODE = process.env.DEMO_MODE === '1';

// ── Demo data (only with ?demo=1 or DEMO_MODE=1; the UI must watermark it) ────
function buildOfflineMock(query: string): ACHPOutput {
  const q = query.toLowerCase();
  const isClimate     = q.includes('climate') || q.includes('hoax') || q.includes('chinese government');
  const isExercise    = q.includes('exercise') || q.includes('cardiovascular') || q.includes('heart');
  const isImmigration = q.includes('immigra') || q.includes('destroy') || q.includes('jobs');
  const run_id = Math.random().toString(36).slice(2, 10);
  const ts     = new Date().toISOString();

  if (isClimate) return {
    run_id, timestamp: ts, input: query,
    verdict: 'FALSE', verdict_confidence: 0.64, composite_score: 0.638,
    metrics: { CTS: 0.234, PCS: 0.673, BIS: 0.256, NSS: 0.688, EPS: 0.852 },
    nil: { verdict: 'misleading', confidence: 0.46, summary: 'Conspiracy framing detected. Strong delegitimisation markers.', BIS: 0.30, EPS: 0.88, PCS: 0.625 },
    atomic_claims: [
      { id: 'C1', text: 'Climate change is a hoax', verifiable: true, confidence: 0.10, epistemic_marker: 'claims', citations: [] },
      { id: 'C2', text: 'Climate change was manufactured by China', verifiable: true, confidence: 0.05, epistemic_marker: 'claims', citations: [] },
    ],
    adversary_a: { factual_score: 0.05, verdict: 'refuted', critical_flaws: ['Contradicted by 97% scientific consensus (NASA, NOAA, IPCC)', "China is the world's largest renewable energy investor ($750B)"] },
    adversary_b: { perspective_score: 0.65, narrative_stance: 'partial', missing_perspectives: [{ stakeholder: 'Climate scientists', viewpoint: '99.9% reject the hoax narrative', significance: 0.95 }, { stakeholder: 'Coastal communities', viewpoint: 'Experiencing measurable sea-level rise', significance: 0.90 }] },
    consensus_reasoning: 'Scientific consensus overwhelmingly refutes climate change denial. The claim is contradicted by independent atmospheric measurements from 195 countries and ice-core data spanning 800,000 years.',
    key_evidence: { supporting: [], contradicting: ['97.1% of peer-reviewed papers confirm anthropogenic warming (Cook et al., 2013)', 'China committed $750B to clean energy'] },
    caveats: ['Attribution of individual weather events to climate change carries inherent uncertainty ranges'],
    debate_rounds: 1,
    pipeline: { mode: 'demo', total_ms: 182, cache_hit: false, latency_ms: { security_pre: 1, retriever: 14, proposer: 0, debate_nil_parallel: 118, judge: 0, security_post: 1 }, models: { proposer: 'mock', adversary_a: 'mock', adversary_b: 'mock', nil: 'vader+all-MiniLM-L6-v2', judge: 'mock' } },
    security: { pre_safe: true, post_safe: true, warnings: [] },
  };

  if (isExercise) return {
    run_id, timestamp: ts, input: query,
    verdict: 'MOSTLY_TRUE', verdict_confidence: 0.911, composite_score: 0.831,
    metrics: { CTS: 0.853, PCS: 0.758, BIS: 0.119, NSS: 0.955, EPS: 0.709 },
    nil: { verdict: 'mildly_biased', confidence: 0.20, summary: 'Well-hedged scientific claim. No alarm/conspiracy framing.', BIS: 0.16, EPS: 0.71, PCS: 0.625 },
    atomic_claims: [{ id: 'C1', text: 'Regular exercise reduces cardiovascular disease risk', verifiable: true, confidence: 0.90, epistemic_marker: 'suggests', citations: ['AHA Guidelines 2021'] }, { id: 'C2', text: 'Risk reduction is approximately 30–40%', verifiable: true, confidence: 0.80, epistemic_marker: 'approximately', citations: [] }],
    adversary_a: { factual_score: 0.88, verdict: 'contested', critical_flaws: ['Some meta-analyses suggest benefits closer to 30–35%, not 30–40%'] },
    adversary_b: { perspective_score: 0.78, narrative_stance: 'partial', missing_perspectives: [{ stakeholder: 'Cardiologists', viewpoint: 'Benefits depend on exercise type and baseline fitness', significance: 0.75 }] },
    consensus_reasoning: 'Multiple large meta-analyses confirm regular moderate exercise reduces cardiovascular disease risk by approximately 30–35%.',
    key_evidence: { supporting: ['AHA: 150 min/week moderate exercise → 30–35% lower CVD risk (Circulation, 2021)'], contradicting: ['Effect size varies significantly by age and baseline fitness'] },
    caveats: ['The 30–40% reduction applies to moderate exercise; high-intensity carries different risk profiles'],
    debate_rounds: 1,
    pipeline: { mode: 'demo', total_ms: 48, cache_hit: false, latency_ms: {}, models: { nil: 'vader+all-MiniLM-L6-v2' } },
    security: { pre_safe: true, post_safe: true, warnings: [] },
  };

  if (isImmigration) return {
    run_id, timestamp: ts, input: query,
    verdict: 'MOSTLY_FALSE', verdict_confidence: 0.52, composite_score: 0.52,
    metrics: { CTS: 0.280, PCS: 0.458, BIS: 0.319, NSS: 0.700, EPS: 0.480 },
    nil: { verdict: 'misleading', confidence: 0.46, summary: 'Alarm/delegitimise framing detected. Lump-of-labour fallacy present.', BIS: 0.30, EPS: 0.48, PCS: 0.625 },
    atomic_claims: [{ id: 'C1', text: 'Immigrants are harming the economy', verifiable: true, confidence: 0.15, epistemic_marker: 'claims', citations: [] }, { id: 'C2', text: 'Immigrants take all the jobs', verifiable: true, confidence: 0.10, epistemic_marker: 'claims', citations: [] }],
    adversary_a: { factual_score: 0.15, verdict: 'refuted', critical_flaws: ['Economic consensus shows net positive fiscal contribution from immigrants', 'Lump-of-labour fallacy: immigrants also create demand and new jobs'] },
    adversary_b: { perspective_score: 0.30, narrative_stance: 'skewed', missing_perspectives: [{ stakeholder: 'Economists', viewpoint: 'Net positive GDP impact in OECD countries', significance: 0.90 }, { stakeholder: 'Immigrant entrepreneurs', viewpoint: '44% of Fortune 500 companies founded by immigrants', significance: 0.80 }] },
    consensus_reasoning: "Economic consensus contradicts the claim's framing. IMF, World Bank, CBO, and NAS studies consistently show immigrants contribute net positive fiscal value.",
    key_evidence: { supporting: ['Short-term wage suppression documented in some specific low-skill sectors'], contradicting: ['CBO 2024: immigrants add $1.7 trillion to US GDP over a decade'] },
    caveats: ['Short-term localized wage effects in specific sectors do exist'],
    debate_rounds: 1,
    pipeline: { mode: 'demo', total_ms: 73, cache_hit: false, latency_ms: {}, models: { nil: 'vader+all-MiniLM-L6-v2' } },
    security: { pre_safe: true, post_safe: true, warnings: [] },
  };

  return {
    run_id, timestamp: ts, input: query,
    verdict: 'MIXED', verdict_confidence: 0.55, composite_score: 0.55,
    metrics: { CTS: 0.50, PCS: 0.55, BIS: 0.25, NSS: 0.60, EPS: 0.65 },
    nil: { verdict: 'mildly_biased', confidence: 0.28, summary: 'Claim requires further evidence to reach a definitive verdict.', BIS: 0.25, EPS: 0.65, PCS: 0.625 },
    atomic_claims: [{ id: 'C1', text: query, verifiable: true, confidence: 0.50, epistemic_marker: 'claims', citations: [] }],
    adversary_a: { factual_score: 0.50, verdict: 'contested', critical_flaws: ['Insufficient evidence to fully accept or reject the claim'] },
    adversary_b: { perspective_score: 0.55, narrative_stance: 'partial', missing_perspectives: [{ stakeholder: 'Subject matter experts', viewpoint: 'Additional expert consensus needed', significance: 0.80 }] },
    consensus_reasoning: 'The claim could not be fully verified or refuted with available evidence.',
    key_evidence: { supporting: [], contradicting: [] },
    caveats: ['Real-time LLM analysis provides deeper research; configure GROQ_API_KEY in Vercel and ACHP_API_URL pointing to the HuggingFace backend for full pipeline analysis'],
    debate_rounds: 1,
    pipeline: { mode: 'demo', total_ms: 38, cache_hit: false, latency_ms: {}, models: { nil: 'vader+all-MiniLM-L6-v2' } },
    security: { pre_safe: true, post_safe: true, warnings: [] },
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let query = '';
  try {
    const body = (await request.json()) as { query?: string };
    query = (body.query ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Send JSON: { "query": "..." }' }, { status: 400 });
  }
  if (query.length < 5)
    return NextResponse.json({ error: 'Query must be at least 5 characters' }, { status: 400 });
  if (query.length > 4000)
    return NextResponse.json({ error: 'Query exceeds 4000 character limit' }, { status: 400 });

  const demo = DEMO_MODE || new URL(request.url).searchParams.get('demo') === '1';
  if (demo) return NextResponse.json(buildOfflineMock(query));

  try {
    const res = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim: query }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : `The checker returned ${res.status}.`;
      return NextResponse.json({ error: detail, stage: data?.stage ?? null }, { status: res.status >= 500 ? 503 : res.status });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'The checking service is unreachable right now. No verdict was produced.' },
      { status: 503 },
    );
  }
}
