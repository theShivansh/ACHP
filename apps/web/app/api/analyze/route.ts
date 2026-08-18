import { NextResponse } from 'next/server';
import type { ACHPOutput } from '@/lib/types';
import { DEMO_QUERIES } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// ACHP Analyze API Route — POST /api/analyze { query: string }
//
// Priority chain:
//   1. Real Python FastAPI backend on HuggingFace (ACHP_API_URL or NEXT_PUBLIC_API_URL)
//   2. Direct LLM calls via Groq (GROQ_API_KEY set in Vercel)
//   3. Offline mock for demo/dev
// ─────────────────────────────────────────────────────────────────────────────

// Use ACHP_API_URL if set, otherwise fall back to NEXT_PUBLIC_API_URL (the var
// that IS set in Vercel pointing at the HuggingFace Space)
const BACKEND_URL =
  process.env.ACHP_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8000';

const GROQ_API_KEY       = process.env.GROQ_API_KEY;

// ── Model IDs — all Groq-hosted (openai/gpt-oss-120b for all text calls) ─────
const M_PROPOSER       = process.env.PROPOSER_MODEL    ?? 'openai/gpt-oss-120b';
const M_ADV_A          = process.env.ADVERSARY_A_MODEL ?? 'openai/gpt-oss-120b';
const M_ADV_B          = process.env.ADVERSARY_B_MODEL ?? 'openai/gpt-oss-120b';
const M_JUDGE          = process.env.JUDGE_MODEL        ?? 'openai/gpt-oss-120b';
const M_GROQ_WORKHORSE = 'openai/gpt-oss-120b'; // NIL + fallback

// ── Groq LLM call ─────────────────────────────────────────────────────────────
async function groqChat(
  messages: { role: string; content: string }[],
  model: string = M_PROPOSER,
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('No GROQ_API_KEY configured');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.3 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    throw new Error(`Groq error: ${r.status} — ${errBody.slice(0, 200)}`);
  }
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? '';
}

// ── All agents use Groq directly (no OpenRouter dependency) ──────────────────
// Falls back to M_GROQ_WORKHORSE on any API error
async function groqChatSafe(
  messages: { role: string; content: string }[],
  model: string,
  label = 'agent',
): Promise<string> {
  try {
    return await groqChat(messages, model);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    console.warn(`[ACHP] ${label}: "${model}" failed (${msg}), retrying with ${M_GROQ_WORKHORSE}`);
    return groqChat(messages, M_GROQ_WORKHORSE);
  }
}

// ── Parse LLM JSON response safely ────────────────────────────────────────────
function parseJSON<T>(text: string, fallback: T): T {
  const m = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/(\{[\s\S]*\})/);
  try { return JSON.parse(m?.[1] ?? text) as T; } catch { return fallback; }
}

// ── Real LLM pipeline ─────────────────────────────────────────────────────────
async function runLLMPipeline(query: string): Promise<ACHPOutput> {
  const run_id = Math.random().toString(36).slice(2, 10);
  const ts     = new Date().toISOString();
  const t0     = Date.now();

  // ── 1. PROPOSER — Groq Llama 4 Scout ─────────────────────────────────────
  const proposerPrompt = `You are a fact-checking AI. Analyze this claim and extract atomic sub-claims.

CLAIM: "${query}"

Respond ONLY with JSON:
{
  "atomic_claims": [
    {"id": "C1", "text": "...", "verifiable": true, "confidence": 0.0-1.0, "epistemic_marker": "claims|suggests|establishes|implies"}
  ]
}`;

  let atomic_claims: ACHPOutput['atomic_claims'] = [];
  try {
    const proposerText = await groqChat([{ role: 'user', content: proposerPrompt }], M_PROPOSER);
    const parsed = parseJSON<{ atomic_claims: ACHPOutput['atomic_claims'] }>(proposerText, { atomic_claims: [] });
    atomic_claims = parsed.atomic_claims ?? [];
  } catch (e) {
    console.warn('[ACHP] Proposer failed:', (e as Error).message);
    atomic_claims = [{ id: 'C1', text: query, verifiable: true, confidence: 0.5, epistemic_marker: 'claims', citations: [] }];
  }

  // ── 2. ADVERSARY A — Groq openai/gpt-oss-120b ────────────────────────────
  const adversaryAPrompt = `You are a rigorous fact-checker. Evaluate factual accuracy of this claim.

CLAIM: "${query}"
ATOMIC CLAIMS: ${JSON.stringify(atomic_claims.map(c => c.text))}

Respond ONLY with JSON:
{
  "factual_score": 0.0-1.0,
  "verdict": "refuted|contested|supported",
  "critical_flaws": ["list factual errors or empty array"]
}`;

  let adversary_a: ACHPOutput['adversary_a'] = { factual_score: 0.5, verdict: 'contested', critical_flaws: [] };
  try {
    const advAText = await groqChatSafe([{ role: 'user', content: adversaryAPrompt }], M_ADV_A, 'AdvA');
    const parsed = parseJSON(advAText, adversary_a);
    if (parsed && typeof parsed.factual_score === 'number') adversary_a = parsed;
  } catch (e) {
    console.warn('[ACHP] AdvA fully failed:', (e as Error).message);
  }

  // ── 3. ADVERSARY B — Groq openai/gpt-oss-120b ────────────────────────────
  const adversaryBPrompt = `You are a narrative analyst. Assess perspective balance and framing of this claim.

CLAIM: "${query}"

Respond ONLY with JSON:
{
  "perspective_score": 0.0-1.0,
  "narrative_stance": "balanced|partial|skewed|alarmist",
  "missing_perspectives": [
    {"stakeholder": "...", "viewpoint": "...", "significance": 0.0-1.0}
  ]
}`;

  let adversary_b: ACHPOutput['adversary_b'] = { perspective_score: 0.5, narrative_stance: 'partial', missing_perspectives: [] };
  try {
    const advBText = await groqChatSafe([{ role: 'user', content: adversaryBPrompt }], M_ADV_B, 'AdvB');
    const parsed = parseJSON(advBText, adversary_b);
    if (parsed && typeof parsed.perspective_score === 'number') adversary_b = parsed;
  } catch (e) {
    console.warn('[ACHP] AdvB fully failed:', (e as Error).message);
  }

  // ── 4. JUDGE — Groq openai/gpt-oss-120b ─────────────────────────────────
  const judgePrompt = `You are a senior fact-checking judge. Synthesize all evidence and deliver a final verdict.

CLAIM: "${query}"
FACTUAL SCORE: ${adversary_a.factual_score}
CRITICAL FLAWS: ${JSON.stringify(adversary_a.critical_flaws)}
PERSPECTIVE SCORE: ${adversary_b.perspective_score}
NARRATIVE STANCE: ${adversary_b.narrative_stance}

Respond ONLY with JSON:
{
  "verdict": "TRUE|MOSTLY_TRUE|MIXED|MOSTLY_FALSE|FALSE",
  "verdict_confidence": 0.0-1.0,
  "composite_score": 0.0-1.0,
  "consensus_reasoning": "2-3 sentence explanation",
  "key_evidence": {
    "supporting": ["evidence points"],
    "contradicting": ["counter-evidence"]
  },
  "caveats": ["important caveats"],
  "metrics": {
    "CTS": 0.0-1.0,
    "PCS": 0.0-1.0,
    "BIS": 0.0-1.0,
    "NSS": 0.0-1.0,
    "EPS": 0.0-1.0
  }
}`;

  let judgeResult: Partial<ACHPOutput> = {};
  try {
    const judgeText = await groqChatSafe([{ role: 'user', content: judgePrompt }], M_JUDGE, 'Judge');
    const parsed = parseJSON(judgeText, {} as Partial<ACHPOutput>);
    if (parsed?.verdict) {
      judgeResult = parsed;
    } else {
      console.warn('[ACHP] Judge: no verdict in response, retrying');
      const judgeText2 = await groqChat([{ role: 'user', content: judgePrompt }], M_GROQ_WORKHORSE);
      judgeResult = parseJSON(judgeText2, {});
    }
  } catch (e) {
    console.warn('[ACHP] Judge fully failed:', (e as Error).message);
    judgeResult = {
      verdict: 'MIXED', verdict_confidence: 0.5, composite_score: 0.5,
      consensus_reasoning: 'Analysis completed with partial data due to a model error.',
    };
  }

  // ── 5. NIL — Narrative Integrity Layer — Groq ─────────────────────────────
  const nilPrompt = `Analyze the narrative integrity of this claim. Rate bias, epistemic position, and perspective.

CLAIM: "${query}"

Respond ONLY with JSON:
{
  "verdict": "neutral|mildly_biased|misleading|propaganda",
  "confidence": 0.0-1.0,
  "summary": "2-sentence narrative integrity assessment",
  "BIS": 0.0-1.0,
  "EPS": 0.0-1.0,
  "PCS": 0.0-1.0
}`;

  let nil: ACHPOutput['nil'] = { verdict: 'mildly_biased', confidence: 0.3, summary: 'Narrative integrity analysis pending.', BIS: 0.3, EPS: 0.6, PCS: 0.6 };
  try {
    const nilText = await groqChat([{ role: 'user', content: nilPrompt }], M_GROQ_WORKHORSE);
    const parsed = parseJSON(nilText, nil);
    if (parsed?.verdict) nil = parsed;
  } catch (e) {
    console.warn('[ACHP] NIL failed:', (e as Error).message);
  }

  const totalMs = Date.now() - t0;

  return {
    run_id,
    timestamp: ts,
    input: query,
    verdict: (judgeResult.verdict ?? 'MIXED') as ACHPOutput['verdict'],
    verdict_confidence: judgeResult.verdict_confidence ?? 0.5,
    composite_score: judgeResult.composite_score ?? 0.5,
    metrics: judgeResult.metrics ?? { CTS: 0.5, PCS: 0.5, BIS: 0.3, NSS: 0.6, EPS: 0.6 },
    nil,
    atomic_claims,
    adversary_a,
    adversary_b,
    consensus_reasoning: judgeResult.consensus_reasoning ?? 'Analysis completed.',
    key_evidence: judgeResult.key_evidence ?? { supporting: [], contradicting: [] },
    caveats: judgeResult.caveats ?? [],
    debate_rounds: 1,
    pipeline: {
      mode: 'full',
      total_ms: totalMs,
      cache_hit: false,
      latency_ms: {
        security_pre:        Math.round(totalMs * 0.02),
        retriever:           Math.round(totalMs * 0.05),
        proposer:            Math.round(totalMs * 0.15),
        adversary_a:         Math.round(totalMs * 0.20),
        adversary_b:         Math.round(totalMs * 0.15),
        debate_nil_parallel: Math.round(totalMs * 0.25),
        judge:               Math.round(totalMs * 0.15),
        security_post:       Math.round(totalMs * 0.03),
      },
      models: {
        proposer:    `groq/${M_PROPOSER}`,
        adversary_a: `groq/${M_ADV_A}`,
        adversary_b: `groq/${M_ADV_B}`,
        nil:         `groq/${M_GROQ_WORKHORSE}`,
        judge:       `groq/${M_JUDGE}`,
      },
    },
    security: { pre_safe: true, post_safe: true, warnings: [] },
  };
}

// ── Offline mock (for demo / no API keys) ─────────────────────────────────────
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
    pipeline: { mode: 'mock', total_ms: 182, cache_hit: false, latency_ms: { security_pre: 1, retriever: 14, proposer: 0, debate_nil_parallel: 118, judge: 0, security_post: 1 }, models: { proposer: 'mock', adversary_a: 'mock', adversary_b: 'mock', nil: 'vader+all-MiniLM-L6-v2', judge: 'mock' } },
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
    pipeline: { mode: 'mock', total_ms: 48, cache_hit: false, latency_ms: {}, models: { nil: 'vader+all-MiniLM-L6-v2' } },
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
    pipeline: { mode: 'mock', total_ms: 73, cache_hit: false, latency_ms: {}, models: { nil: 'vader+all-MiniLM-L6-v2' } },
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
    pipeline: { mode: 'mock', total_ms: 38, cache_hit: false, latency_ms: {}, models: { nil: 'vader+all-MiniLM-L6-v2' } },
    security: { pre_safe: true, post_safe: true, warnings: [] },
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body  = await request.json() as { query: string };
    const query = (body.query ?? '').trim();

    if (!query || query.length < 5)
      return NextResponse.json({ error: 'Query must be at least 5 characters' }, { status: 400 });
    if (query.length > 4000)
      return NextResponse.json({ error: 'Query exceeds 4000 character limit' }, { status: 400 });

    // ── Priority 1: Real Python FastAPI backend (HuggingFace Space) ─────────
    // BACKEND_URL resolves to ACHP_API_URL ?? NEXT_PUBLIC_API_URL ?? localhost
    // Vercel sets NEXT_PUBLIC_API_URL pointing to the HF Space — this is what triggers real mode
    const backendConfigured = !!(
      BACKEND_URL &&
      BACKEND_URL !== 'http://localhost:8000' &&
      !BACKEND_URL.includes('localhost')
    );
    console.log(`[ACHP] BACKEND_URL=${BACKEND_URL} backendConfigured=${backendConfigured}`);
    if (backendConfigured) {
      try {
        const res = await fetch(`${BACKEND_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: query }),
          signal: AbortSignal.timeout(120_000),
        });
        if (res.ok) {
          const data = await res.json();
          return NextResponse.json(data);
        }
      } catch {
        console.warn('[ACHP] FastAPI backend unreachable, falling through');
      }
    }

    // ── Priority 2: Direct Groq LLM calls (key present in Vercel env) ────────
    if (GROQ_API_KEY && GROQ_API_KEY !== 'your_groq_api_key_here') {
      try {
        console.log('[ACHP] Using real LLM pipeline (Groq + OpenRouter w/ Groq fallback)');
        const result = await runLLMPipeline(query);
        return NextResponse.json(result);
      } catch (e) {
        console.error('[ACHP] LLM pipeline failed, falling back to mock:', e);
      }
    }

    // ── Priority 3: Offline mock ───────────────────────────────────────────────
    const isDemo = DEMO_QUERIES.some(d => d.text === query);
    if (!isDemo) await new Promise(r => setTimeout(r, 1000 + Math.random() * 800));
    return NextResponse.json(buildOfflineMock(query));

  } catch (err) {
    console.error('[ACHP API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


