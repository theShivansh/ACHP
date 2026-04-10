/**
 * ACHP — Shared full-detail report exporter
 * Used by: Dashboard VerdictCard, Monitor per-row export, TopBar download button
 */
import type { ACHPOutput } from './types';

function pct(n: number | undefined | null) {
  return `${Math.round((n ?? 0) * 100)}%`;
}

function divider(char = '═', len = 64) {
  return char.repeat(len);
}

function section(title: string, char = '─') {
  const line = char.repeat(Math.max(0, 64 - title.length - 3));
  return `\n${title} ${line}`;
}

/** Build the full detailed text report for an ACHPOutput result */
export function buildFullReport(r: ACHPOutput): string {
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(divider('═'));
  lines.push('  ACHP — NARRATIVE INTEGRITY ANALYSIS REPORT');
  lines.push('  Answer · Complete · Honest Probe — Full Pipeline Output');
  lines.push(divider('═'));
  lines.push('');
  lines.push(`  Query      : ${r.input}`);
  lines.push(`  Run ID     : ${r.run_id}`);
  lines.push(`  Timestamp  : ${r.timestamp}`);
  lines.push(`  Pipeline   : ${r.pipeline?.mode ?? 'full'} mode  |  ${r.pipeline?.total_ms ?? 0}ms total`);
  lines.push(`  Cache Hit  : ${r.pipeline?.cache_hit ? 'YES ⚡' : 'NO'}`);
  lines.push(`  Debate Rnds: ${r.debate_rounds ?? 1}`);
  lines.push('');

  // ── Verdict ──────────────────────────────────────────────────────────────
  lines.push(divider('─'));
  lines.push(section('VERDICT'));
  lines.push('');
  lines.push(`  Result     : ${r.verdict}`);
  lines.push(`  Confidence : ${pct(r.verdict_confidence)}`);
  lines.push(`  Composite  : ${pct(r.composite_score)}`);
  lines.push('');
  lines.push('  Security:');
  lines.push(`    Pre-check  : ${r.security?.pre_safe ? 'PASS ✓' : 'FAIL ✗'}`);
  lines.push(`    Post-check : ${r.security?.post_safe ? 'PASS ✓' : 'FAIL ✗'}`);
  if (r.security?.warnings?.length) {
    r.security.warnings.forEach(w => lines.push(`    WARNING    : ${w}`));
  }
  lines.push('');

  // ── ACHP Metrics ─────────────────────────────────────────────────────────
  lines.push(divider('─'));
  lines.push(section('ACHP METRICS (5-Dimensional Narrative Score)'));
  lines.push('');
  lines.push(`  CTS  (Consensus Truth Score)              : ${pct(r.metrics?.CTS)}`);
  lines.push(`       Formula: 0.40·factual_A + 0.35·judge_CTS + 0.15·(1−BIS) + 0.10·EPS`);
  lines.push('');
  lines.push(`  PCS  (Perspective Completeness Score)     : ${pct(r.metrics?.PCS)}`);
  lines.push(`       Formula: 0.50·pcs_B + 0.30·nil_pcs + 0.20·(1 − missing_per/10)`);
  lines.push('');
  lines.push(`  BIS  (Bias Impact Score — lower=better)  : ${pct(r.metrics?.BIS)}`);
  lines.push(`       Formula: 0.55·nil_bis + 0.25·framing + 0.12·polarity + boost`);
  lines.push('');
  lines.push(`  NSS  (Narrative Stance Score)             : ${pct(r.metrics?.NSS)}`);
  lines.push(`       Formula: 0.40·(1−framing) + 0.35·alignment + 0.25·judge_NSS`);
  lines.push('');
  lines.push(`  EPS  (Epistemic Position Score)           : ${pct(r.metrics?.EPS)}`);
  lines.push(`       Formula: 0.70·vader_eps + 0.20·(1−framing) + 0.10·min(hedge×3,1)`);
  lines.push('');

  // ── Consensus Reasoning ───────────────────────────────────────────────────
  lines.push(divider('─'));
  lines.push(section('VERIFIED ANSWER / CONSENSUS REASONING'));
  lines.push('');
  (r.consensus_reasoning ?? '').split('\n').forEach(l => lines.push(`  ${l}`));
  lines.push('');

  // ── Adversary A — Factual Challenger ────────────────────────────────────
  const advA = r.adversary_a;
  if (advA) {
    lines.push(divider('─'));
    lines.push(section('🔹 ADVERSARY A — FACTUAL CHALLENGER (DeepSeek R1)'));
    lines.push('');
    lines.push(`  Factual Score : ${pct(advA.factual_score)}`);
    lines.push(`  Verdict       : ${advA.verdict ?? 'N/A'}`);
    lines.push('');
    if (advA.critical_flaws?.length) {
      lines.push('  Critical Flaws Identified:');
      advA.critical_flaws.forEach((f, i) => lines.push(`    ${i + 1}. ${f}`));
    }
    lines.push('');
  }

  // ── Adversary B — Narrative Auditor ─────────────────────────────────────
  const advB = r.adversary_b;
  if (advB) {
    lines.push(divider('─'));
    lines.push(section('🔹 ADVERSARY B — NARRATIVE AUDITOR (Qwen 32B)'));
    lines.push('');
    lines.push(`  Perspective Score : ${pct(advB.perspective_score)}`);
    lines.push(`  Narrative Stance  : ${advB.narrative_stance?.toUpperCase() ?? 'N/A'}`);
    lines.push('');
    if (advB.missing_perspectives?.length) {
      lines.push('  Missing Perspectives:');
      advB.missing_perspectives.forEach((p, i) => {
        lines.push(`    ${i + 1}. [${p.stakeholder}]  significance: ${pct(p.significance)}`);
        lines.push(`       Viewpoint: ${p.viewpoint}`);
      });
    }
    lines.push('');
  }

  // ── NIL — Narrative Integrity Layer ─────────────────────────────────────
  const nil = r.nil;
  if (nil) {
    lines.push(divider('─'));
    lines.push(section('🔹 NIL — NARRATIVE INTEGRITY LAYER (5 Sub-Agents)'));
    lines.push('');
    lines.push(`  Verdict          : ${nil.verdict?.toUpperCase() ?? 'N/A'}`);
    lines.push(`  Confidence       : ${pct(nil.confidence)}`);
    lines.push('');
    lines.push('  Sub-Agent Scores:');
    lines.push(`    SENTIMENT (EPS): ${pct(nil.EPS)}   — VADER compound + hedge ratio`);
    lines.push(`    BIAS (BIS)     : ${pct(nil.BIS)}   — OpenRouter DeepSeek classification`);
    lines.push(`    PERSPECTIVE    : ${pct(nil.PCS)}   — Opposing + neutral stances`);
    lines.push(`    FRAMING        : (embedded in BIS/NSS) — Cosine similarity framing score`);
    lines.push(`    CONFIDENCE SYN.: composite of all 5 sub-agents`);
    if (nil.summary) {
      lines.push('');
      lines.push('  Summary:');
      nil.summary.split('\n').forEach(l => lines.push(`    ${l}`));
    }
    lines.push('');
  }

  // ── Atomic Claims ─────────────────────────────────────────────────────────
  const claims = r.atomic_claims ?? [];
  if (claims.length) {
    lines.push(divider('─'));
    lines.push(section(`ATOMIC NARRATIVE UNITS (${claims.length} detected)`));
    lines.push('');
    claims.forEach((c, i) => {
      lines.push(`  [${c.id ?? `C${i + 1}`}] ${c.text}`);
      lines.push(`       Epistemic Marker : ${c.epistemic_marker?.toUpperCase() ?? 'CLAIM'}`);
      lines.push(`       Confidence       : ${pct(c.confidence)}`);
      lines.push(`       Verifiable       : ${c.verifiable ? 'YES' : 'NO'}`);
      if (c.verifiable) {
        const webUrl = c.source_url ?? c.citations?.find(s => s.startsWith('http'));
        if (webUrl) lines.push(`       Source URL       : ${webUrl}`);
        else if (typeof c.kb_page === 'number') {
          lines.push(`       KB Reference     : ${c.kb_name ?? 'Knowledge Base'} — chunk #${c.kb_page}`);
        }
        const textCitations = c.citations?.filter(s => !s.startsWith('http')) ?? [];
        if (textCitations.length) lines.push(`       Citations        : ${textCitations.join(' · ')}`);
      } else {
        // Not verifiable — show chain of thought reasoning
        lines.push(`       Chain-of-Thought  : Claim cannot be objectively verified.`);
        lines.push(`                         Epistemic marker "${c.epistemic_marker}" signals subjective/opinion framing.`);
        const textCitations = c.citations?.filter(s => !s.startsWith('http')) ?? [];
        if (textCitations.length) {
          lines.push(`                         Related context: ${textCitations.join(' · ')}`);
        }
      }
      lines.push('');
    });
  }

  // ── Key Evidence ──────────────────────────────────────────────────────────
  const ev = r.key_evidence;
  if (ev) {
    lines.push(divider('─'));
    lines.push(section('KEY EVIDENCE'));
    lines.push('');
    if (ev.supporting?.length) {
      lines.push('  SUPPORTING:');
      ev.supporting.forEach(s => lines.push(`    + ${s}`));
      lines.push('');
    }
    if (ev.contradicting?.length) {
      lines.push('  CONTRADICTING:');
      ev.contradicting.forEach(s => lines.push(`    − ${s}`));
      lines.push('');
    }
  }

  // ── Caveats ───────────────────────────────────────────────────────────────
  if (r.caveats?.length) {
    lines.push(divider('─'));
    lines.push(section('IMPORTANT CAVEATS'));
    lines.push('');
    r.caveats.forEach(c => lines.push(`  ⚠  ${c}`));
    lines.push('');
  }

  // ── Pipeline Timeline ─────────────────────────────────────────────────────
  const pipelineModels = r.pipeline?.models ?? {};
  const latencies = r.pipeline?.latency_ms ?? {};
  if (Object.keys(latencies).length) {
    lines.push(divider('─'));
    lines.push(section('PIPELINE EXECUTION TIMELINE'));
    lines.push('');
    const agentOrder = [
      'security_pre', 'retriever', 'proposer',
      'debate_nil_parallel', 'judge', 'security_post',
    ];
    for (const key of agentOrder) {
      if (latencies[key] !== undefined) {
        lines.push(`  ${key.padEnd(26)}: ${String(Math.round(latencies[key])).padStart(6)}ms`);
      }
    }
    Object.entries(latencies).forEach(([k, v]) => {
      if (!agentOrder.includes(k)) lines.push(`  ${k.padEnd(26)}: ${String(Math.round(v)).padStart(6)}ms`);
    });
    lines.push('');
    if (Object.keys(pipelineModels).length) {
      lines.push('  Models Used:');
      Object.entries(pipelineModels).forEach(([agent, model]) => {
        lines.push(`    ${agent.padEnd(16)}: ${model}`);
      });
    }
    lines.push('');
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push(divider('═'));
  lines.push('  Generated by ACHP — github.com/your-org/achp');
  lines.push(`  ${new Date().toISOString()}`);
  lines.push(divider('═'));

  return lines.join('\n');
}

/** Download the full ACHP report as a .txt file */
export function downloadFullReport(r: ACHPOutput): void {
  const content = buildFullReport(r);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `achp-full-report-${r.run_id}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download raw system log lines as a .log file */
export function downloadLogsAsFile(logLines: Array<{ ts: string; level: string; msg: string }>): void {
  const content = logLines
    .map(l => `[${new Date(l.ts).toISOString()}] [${l.level.padEnd(5)}] ${l.msg}`)
    .join('\n');
  const header = [
    '# ACHP — System Execution Log',
    `# Exported: ${new Date().toISOString()}`,
    `# Entries:  ${logLines.length}`,
    '#' + '─'.repeat(78),
    '',
    content,
  ].join('\n');
  const blob = new Blob([header], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `achp-execution-log-${Date.now()}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
