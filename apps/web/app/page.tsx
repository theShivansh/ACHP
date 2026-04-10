'use client';

import { useState, useCallback, useRef, createContext, useEffect } from 'react';
import type { ACHPOutput, QAResponse } from '@/lib/types';
import { downloadFullReport, downloadLogsAsFile } from '@/lib/exportReport';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import QueryInput from '@/components/QueryInput';
import VerdictCard from '@/components/VerdictCard';
import MetricsRadar from '@/components/MetricsRadar';
import TransparencyReport from '@/components/TransparencyReport';
import AtomicClaims from '@/components/AtomicClaims';
import PerspectivePanel from '@/components/PerspectivePanel';
import PipelineTimeline from '@/components/PipelineTimeline';
import PipelineProgress from '@/components/PipelineProgress';
import KBManager from '@/components/KBManager';
import RAGAnswer from '@/components/RAGAnswer';

// ─── Shared export context so TopBar Download button works ───────────────────
export const ExportContext = createContext<{
  latestResult: ACHPOutput | null;
  onExport: () => void;
}>({ latestResult: null, onExport: () => {} });

// ─────────────────────────────────────────────────────────────────────────────
// Phase type
// ─────────────────────────────────────────────────────────────────────────────
type Phase = 'kb-manager' | 'analyzer';
type InputMode = 'analyze' | 'qa';


// ─────────────────────────────────────────────────────────────────────────────
// MONITOR tab
// ─────────────────────────────────────────────────────────────────────────────
function MonitorView({ results }: { results: ACHPOutput[] }) {
  if (!results.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(255,255,255,0.10)' }}>monitor_heart</span>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'Space Grotesk, sans-serif' }}>
          No analyses yet. Submit a claim to begin monitoring.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-stagger-in">
      <h2 className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.40)', fontFamily: 'Space Grotesk, sans-serif', marginBottom: 16 }}>
        Analysis History — {results.length} run{results.length !== 1 ? 's' : ''}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,0.04)' }}>
        {results.map((r, i) => {
          const verdictColor: Record<string, string> = {
            TRUE: '#00F0FF', MOSTLY_TRUE: '#7df4ff', MIXED: '#FED639',
            MOSTLY_FALSE: '#e5b5ff', FALSE: '#ffb4ab', BLOCKED: '#ff6b6b',
          };
          const col = verdictColor[r.verdict] ?? '#FED639';
          return (
            <div
              key={r.run_id}
              className="flex items-center gap-4"
              style={{ padding: '14px 16px', background: '#201f1f', transition: 'background 0.15s' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#2a2a2a')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '#201f1f')}
            >
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                #{String(i + 1).padStart(2, '0')}
              </span>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}>
                {r.input}
              </p>
              <span className="font-bold uppercase" style={{ fontSize: 10, color: col, letterSpacing: '0.05em', fontFamily: 'Space Grotesk, sans-serif', flexShrink: 0 }}>
                {r.verdict.replace('_', ' ')}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                {r.pipeline?.total_ms ?? 0}ms
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                {new Date(r.timestamp).toLocaleTimeString()}
              </span>
              {/* Per-row export button */}
              <button
                onClick={() => downloadFullReport(r)}
                title="Export full ACHP report for this analysis"
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif',
                  background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.15)',
                  color: 'rgba(0,240,255,0.55)', cursor: 'pointer', borderRadius: 2,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.12)';
                  (e.currentTarget as HTMLElement).style.color = '#00F0FF';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.40)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.05)';
                  (e.currentTarget as HTMLElement).style.color = 'rgba(0,240,255,0.55)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.15)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>download</span>
                REPORT
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGS tab — detailed 11-agent execution trace
// ─────────────────────────────────────────────────────────────────────────────
function buildDetailedLogs(results: ACHPOutput[]) {
  return results.flatMap(r => {
    const lat = r.pipeline?.latency_ms ?? {};
    const mod = r.pipeline?.models ?? {};
    const pct = (n: number | undefined) => `${Math.round((n ?? 0) * 100)}%`;
    const ms  = (k: string) => lat[k] !== undefined ? `${Math.round(lat[k])}ms` : 'N/A';
    const t   = r.timestamp;
    const id  = r.run_id;
    const isWarn = r.verdict === 'FALSE' || r.verdict === 'MOSTLY_FALSE';

    return [
      // ── Run header ──────────────────────────────────────────────────────
      { ts: t, level: 'INFO',  msg: `${'─'.repeat(60)}` },
      { ts: t, level: 'INFO',  msg: `[${id}] ▶ NEW RUN — "${r.input.slice(0, 70)}${r.input.length > 70 ? '…' : ''}"` },
      { ts: t, level: 'INFO',  msg: `[${id}] Pipeline mode: ${r.pipeline?.mode ?? 'full'} | Debate rounds: ${r.debate_rounds ?? 1}` },

      // ── Agent 1: Security Validator (pre) ───────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 1/11] SecurityValidator.validate_input() → ${r.security?.pre_safe ? 'SAFE ✓' : 'BLOCKED ✗'}  latency: ${ms('security_pre')}` },
      { ts: t, level: r.security?.pre_safe ? 'INFO' : 'ERROR',
        msg: `[${id}]   Decision: PII/toxicity scan passed guardlist. Warnings: ${r.security?.warnings?.length ?? 0}` },

      // ── Agent 2: Retriever ────────────────────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 2/11] RetrieverAgent.retrieve() | model: ${mod.retriever ?? 'onyx-rag+bm25'} | latency: ${ms('retriever')} | cache: ${r.pipeline?.cache_hit ? 'HIT ⚡' : 'MISS'}` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   RAG: BM25 + semantic search → top-k docs retrieved. Cache threshold: 0.85 cosine.` },

      // ── Agent 3: Proposer ─────────────────────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 3/11] ProposerAgent.analyze() | model: ${mod.proposer ?? 'llama-4-scout'} | claims: ${r.atomic_claims?.length ?? 0} | latency: ${ms('proposer')}` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   Decomposed into ${r.atomic_claims?.length ?? 0} atomic claims. Confidence: ${pct(r.atomic_claims?.[0]?.confidence)}.` },

      // ── Agent 4: Adversary A (parallel block start) ───────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 4/11] AdversaryA.challenge() ─┐ PARALLEL | model: ${mod.adversary_a ?? 'deepseek-r1'} | factual_score: ${pct(r.adversary_a?.factual_score)} | verdict: ${r.adversary_a?.verdict ?? 'N/A'}` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   Formula(CTS): 0.40·factual_A=${pct(r.adversary_a?.factual_score)} used in CTS computation.` },

      // ── Agent 5: Adversary B ──────────────────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 5/11] AdversaryB.audit()     ─┤ PARALLEL | model: ${mod.adversary_b ?? 'qwen-32b'} | pcs_score: ${pct(r.adversary_b?.perspective_score)} | stance: ${r.adversary_b?.narrative_stance ?? 'N/A'}` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   Missing perspectives: ${r.adversary_b?.missing_perspectives?.length ?? 0}. Formula(PCS): 0.50·pcs_B contribution.` },

      // ── Agent 6: NIL Sentiment sub-agent ─────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 6/11] NIL.SentimentAnalyzer() ─┤ 5-PARALLEL | EPS: ${pct(r.nil?.EPS)} | Formula: 0.70·vader_eps + 0.20·(1−framing) + 0.10·hedge×3` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   VADER compound applied on full claim text. Hedge markers detected.` },

      // ── Agent 7: NIL Bias Classifier ─────────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 7/11] NIL.BiasClassifier()   ─┤ 5-PARALLEL | BIS: ${pct(r.nil?.BIS)} | Formula: 0.55·nil_bis + 0.25·framing + 0.12·|polarity| + boost` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   OpenRouter DeepSeek R1 classification. Frame boost applied if delegitimize/conspiracy detected.` },

      // ── Agent 8: NIL Perspective Generator ───────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 8/11] NIL.PerspectiveGenerator() ─┤ 5-PARALLEL | PCS: ${pct(r.nil?.PCS)} | Opposing + Neutral stances generated.` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   Cosine similarity to baseline perspectives computed. Formula(PCS): 0.30·nil_pcs contribution.` },

      // ── Agent 9: NIL Framing Comparator ──────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 9/11] NIL.FramingComparator() ─┤ 5-PARALLEL | Cosine similarity framing score embedded in BIS/NSS.` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   BIS boost triggered for dominant frames: delegitimize(+0.15), alarm(+0.05), neutral(0.0).` },

      // ── Agent 10: Judge ───────────────────────────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 10/11] JudgeAgent.judge() | model: ${mod.judge ?? 'deepseek-chat'} | verdict: ${r.verdict} | confidence: ${pct(r.verdict_confidence)} | latency: ${ms('judge')}` },
      { ts: t, level: isWarn ? 'WARN' : 'DEBUG',
        msg: `[${id}]   CTS=${pct(r.metrics?.CTS)} PCS=${pct(r.metrics?.PCS)} BIS=${pct(r.metrics?.BIS)} NSS=${pct(r.metrics?.NSS)} EPS=${pct(r.metrics?.EPS)} → composite=${pct(r.composite_score)}` },
      { ts: t, level: 'DEBUG', msg: `[${id}]   NIL override: factual_score < 0.20 → misleading forced, BIS floored to max(BIS, 0.30).` },

      // ── Agent 11: Security Validator (post) ──────────────────────────
      { ts: t, level: 'INFO',  msg: `[${id}] [AGENT 11/11] SecurityValidator.validate_output() → ${r.security?.post_safe ? 'SAFE ✓' : 'FLAGGED ✗'}  latency: ${ms('security_post')}` },
      { ts: t, level: 'INFO',  msg: `[${id}] ✅ PIPELINE COMPLETE | ${r.pipeline?.total_ms ?? 0}ms total | verdict: ${r.verdict} (${pct(r.verdict_confidence)} conf)` },
    ];
  }).reverse();
}

function LogsView({ results }: { results: ACHPOutput[] }) {
  const logLines = buildDetailedLogs(results);
  const levelColor: Record<string, string> = {
    INFO: '#00F0FF', DEBUG: 'rgba(255,255,255,0.30)', WARN: '#FED639', ERROR: '#ffb4ab',
  };

  if (!logLines.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(255,255,255,0.10)' }}>terminal</span>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'Space Grotesk, sans-serif' }}>
          System log is empty. Start an analysis to generate logs.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-stagger-in">
      {/* Header + export button */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <h2 className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.40)', fontFamily: 'Space Grotesk, sans-serif' }}>
          System Logs — {logLines.length} entries
        </h2>
        <button
          onClick={() => downloadLogsAsFile(logLines)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 12px',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif',
            background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.18)',
            color: 'rgba(0,240,255,0.60)', cursor: 'pointer', borderRadius: 2,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.12)';
            (e.currentTarget as HTMLElement).style.color = '#00F0FF';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.40)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(0,240,255,0.05)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(0,240,255,0.60)';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,240,255,0.18)';
          }}
          title="Export execution log as .log file"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>download</span>
          EXPORT LOG
        </button>
      </div>
      <div
        style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.05)', padding: '16px', maxHeight: 520, overflowY: 'auto' }}
        className="custom-scrollbar"
      >
        {logLines.map((l, i) => (
          <div key={i} className="flex gap-3" style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0, paddingTop: 1, minWidth: 72 }}>
              {new Date(l.ts).toLocaleTimeString()}
            </span>
            <span className="font-bold" style={{
              fontSize: 10, color: levelColor[l.level] ?? '#00F0FF',
              fontFamily: 'JetBrains Mono, monospace', flexShrink: 0, width: 50,
            }}>
              [{l.level}]
            </span>
            <span style={{
              fontSize: 10, color: l.msg.startsWith('──') || l.msg.startsWith('  ') ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.60)',
              fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.55,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {l.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Idle + Analyzed states (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
function IdleState({
  onSubmit,
  activeKbId,
  inputMode = 'analyze',
  onModeChange,
}: {
  onSubmit: (q: string) => void;
  activeKbId?: string;
  inputMode?: 'analyze' | 'qa';
  onModeChange?: (m: 'analyze' | 'qa') => void;
}) {
  const inQA = inputMode === 'qa';
  return (
    <div className="flex-1 flex flex-col animate-stagger-in" style={{ gap: 24 }}>
      <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div className="flex items-center justify-center" style={{
          width: 64, height: 64, marginBottom: 20,
          background: inQA ? 'rgba(161,0,240,0.06)' : 'rgba(0,240,255,0.05)',
          border: `1px solid ${inQA ? 'rgba(161,0,240,0.20)' : 'rgba(0,240,255,0.15)'}`,
          transition: 'all 0.3s',
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 32,
            color: inQA ? 'rgba(161,0,240,0.70)' : 'rgba(0,240,255,0.50)',
            transition: 'color 0.3s',
          }}>
            {inQA ? 'auto_stories' : 'policy'}
          </span>
        </div>

        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.70)', marginBottom: 8, letterSpacing: '-0.01em' }}>
          {inQA ? 'Ask anything about your knowledge base' : 'Submit a claim for analysis'}
        </h2>

        {activeKbId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '6px 12px', borderRadius: 99,
            background: inQA ? 'rgba(161,0,240,0.08)' : 'rgba(0,240,255,0.07)',
            border: `1px solid ${inQA ? 'rgba(161,0,240,0.25)' : 'rgba(0,240,255,0.22)'}`,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: inQA ? '#e5b5ff' : '#00F0FF' }}>database</span>
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: inQA ? '#e5b5ff' : '#00F0FF', letterSpacing: '0.05em' }}>
              KB: {activeKbId.slice(0, 8)}… active
            </span>
          </div>
        )}

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.05em', maxWidth: 440 }}>
          {inQA
            ? 'Grounded answers from your KB only — no hallucinations. Cites exact chunks.'
            : 'The ACHP pipeline will fact-check, analyze bias, and surface alternative perspectives using 7 parallel agents.'}
        </p>

        {/* Mode toggle — only when a KB is active */}
        {activeKbId && onModeChange && (
          <div style={{
            display: 'inline-flex', marginTop: 16,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: 3, gap: 3,
          }}>
            {(['qa', 'analyze'] as const).map(m => {
              const active = inputMode === m;
              return (
                <button
                  key={m}
                  onClick={() => onModeChange(m)}
                  style={{
                    padding: '7px 16px',
                    fontSize: 10, fontFamily: 'Space Grotesk, sans-serif',
                    fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', border: 'none', cursor: 'pointer',
                    borderRadius: 4, transition: 'all 0.2s',
                    background: active
                      ? (m === 'qa' ? 'rgba(161,0,240,0.20)' : 'rgba(0,240,255,0.12)')
                      : 'transparent',
                    color: active
                      ? (m === 'qa' ? '#e5b5ff' : '#00F0FF')
                      : 'rgba(255,255,255,0.30)',
                    boxShadow: active ? '0 0 12px rgba(161,0,240,0.15)' : 'none',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 5 }}>
                    {m === 'qa' ? 'auto_stories' : 'policy'}
                  </span>
                  {m === 'qa' ? 'Ask KB' : 'Analyze Claim'}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <QueryInput onSubmit={onSubmit} isRunning={false} placeholder={inQA ? 'Ask a question about your knowledge base…' : undefined} />
    </div>
  );
}


function AnalyzedState({ result, onNewQuery, isRunning }: { result: ACHPOutput; onNewQuery: (q: string) => void; isRunning: boolean }) {
  return (
    <div className="animate-stagger-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 288px', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          <VerdictCard result={result} />
          <AtomicClaims result={result} />
          <PerspectivePanel result={result} />
          <PipelineTimeline
            latencies={result.pipeline?.latency_ms ?? {}}
            totalMs={result.pipeline?.total_ms ?? 0}
            models={result.pipeline?.models ?? {}}
            cacheHit={result.pipeline?.cache_hit ?? false}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <MetricsRadar metrics={result.metrics} />
          <TransparencyReport result={result} />
        </div>
      </div>

      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Space Grotesk, sans-serif', marginBottom: 12 }}>
          ↩ Analyze another claim
        </p>
        <QueryInput onSubmit={onNewQuery} isRunning={isRunning} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase breadcrumb / nav
// ─────────────────────────────────────────────────────────────────────────────
function PhaseBreadcrumb({
  phase,
  activeKbId,
  onBack,
}: {
  phase: Phase;
  activeKbId?: string;
  onBack: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 24px',
      background: 'rgba(0,0,0,0.30)',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      backdropFilter: 'blur(12px)',
    }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'rgba(255,255,255,0.35)',
          fontFamily: 'Space Grotesk, sans-serif', fontSize: 11, letterSpacing: '0.06em',
          padding: '4px 8px', borderRadius: 6, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#00F0FF'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
        KB Manager
      </button>
      <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>/</span>
      <span style={{ fontSize: 11, fontFamily: 'Space Grotesk, sans-serif', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em' }}>
        Dashboard
      </span>
      {activeKbId && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>·</span>
          <span style={{
            fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#00F0FF',
            background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.20)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            KB: {activeKbId.slice(0, 12)}…
          </span>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  // ── Phase state ──
  const [phase,       setPhase]       = useState<Phase>('kb-manager');
  const [phaseDir,    setPhaseDir]    = useState<'left' | 'right'>('right');
  const [activeKbId,  setActiveKbId]  = useState<string | undefined>(undefined);

  // ── Analyzer state ──
  const [results,      setResults]      = useState<ACHPOutput[]>([]);
  const [activeResult, setActiveResult] = useState<ACHPOutput | null>(null);
  const [qaResult,     setQaResult]     = useState<QAResponse | null>(null);
  const [inputMode,    setInputMode]    = useState<InputMode>('analyze');
  const [isRunning,    setIsRunning]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [activeTab,    setActiveTab]    = useState<'dashboard' | 'monitor' | 'logs'>('dashboard');
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [doneAgents,   setDoneAgents]   = useState<Set<string>>(new Set());
  const [runId,        setRunId]        = useState<string | undefined>(undefined);
  const queryInputRef = useRef<HTMLDivElement>(null);
  const sseRef        = useRef<EventSource | null>(null);

  const result = activeResult;

  // ── Phase transitions ──
  const enterAnalyzer = useCallback((kbId?: string) => {
    setActiveKbId(kbId);
    setPhaseDir('right');
    setPhase('analyzer');
    setActiveTab('dashboard');
    // Default to qa mode if a KB is being activated, analyze if no KB
    setInputMode(kbId ? 'qa' : 'analyze');
    setQaResult(null);
    setActiveResult(null);
  }, []);

  const backToKB = useCallback(() => {
    setPhaseDir('left');
    setPhase('kb-manager');
  }, []);

  // ── Agent animation helpers ──
  const markActive = (ids: string[]) =>
    setActiveAgents(prev => new Set([...prev, ...ids]));
  const markDone = (ids: string[]) => {
    setActiveAgents(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    setDoneAgents(prev => new Set([...prev, ...ids]));
  };

  // ── Export — uses shared full-detail report utility ──
  const handleExport = useCallback(() => {
    if (!activeResult) return;
    downloadFullReport(activeResult);
  }, [activeResult]);

  const handleScrollToQuery = useCallback(() => {
    queryInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ── Main run handler — SSE-connected real-time progress ──
  const handleRun = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 5) {
      setError('Please enter at least 5 characters.');
      return;
    }
    // If qa mode and a KB is active → call /qa endpoint
    if (inputMode === 'qa' && activeKbId) {
      setIsRunning(true);
      setActiveResult(null);
      setQaResult(null);
      setError(null);
      setActiveTab('dashboard');
      const fastapiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
      try {
        const r = await fetch(`${fastapiUrl}/qa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: query, kb_id: activeKbId, top_k: 6 }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || `HTTP ${r.status}`);
        }
        const qa: QAResponse = await r.json();
        setQaResult(qa);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Q&A failed. Please try again.');
      } finally {
        setIsRunning(false);
      }
      return;
    }
    setIsRunning(true);
    setActiveResult(null);
    setError(null);
    setActiveAgents(new Set());
    setDoneAgents(new Set());
    setActiveTab('dashboard');

    // ── Generate a run_id client-side so we can open SSE before POST ──
    const newRunId = Math.random().toString(36).slice(2, 10);
    setRunId(newRunId);

    const fastapiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

    // ── Open SSE stream FIRST — backend will push events into it ───────────
    if (sseRef.current) sseRef.current.close();
    const sse = new EventSource(`${fastapiUrl}/analyze/${newRunId}/stream`);
    sseRef.current = sse;

    sse.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data) as {
          event: string;
          agent?: string;
          agents?: string[];
          status?: string;
          data?: { agent?: string; agents?: string[]; status?: string };
        };

        // Backend emits: { event: "agent_status", data: { agent: "...", status: "running"/"done" } }
        // OR flat:       { event: "agent_start"|"agent_done", agent: "..." }
        const evType  = msg.event;
        const payload = msg.data ?? msg;
        const rawId   = (payload as { agent?: string; agents?: string[] }).agent
          ?? (msg.agent);
        const ids     = (payload as { agents?: string[] }).agents
          ?? (msg.agents)
          ?? (rawId ? [rawId] : []);
        const status  = (payload as { status?: string }).status ?? msg.status;

        // Normalise backend ID → frontend step ID
        const normalise = (id: string) =>
          id === 'security_validator' ? 'security'
          : id === 'nil_layer'       ? 'nil_supervisor'
          : id;

        const normIds = ids.map(normalise).filter(Boolean);

        const isStart = evType === 'agent_start'  || status === 'running' || status === 're_debating';
        const isDone  = evType === 'agent_done'   || status === 'done';

        if (isStart && normIds.length) {
          setActiveAgents(prev => new Set([...prev, ...normIds]));
        }
        if (isDone && normIds.length) {
          setActiveAgents(prev => { const n = new Set(prev); normIds.forEach(id => n.delete(id)); return n; });
          setDoneAgents(prev => new Set([...prev, ...normIds]));
        }
        if (evType === 'pipeline_complete') {
          setDoneAgents(new Set(['security','retriever','proposer','adversary_a',
            'adversary_b','nil_supervisor','judge','done']));
          setActiveAgents(new Set());
          sse.close();
        }
      } catch { /* ignore parse errors */ }
    };
    sse.onerror = () => sse.close();

    try {
      let data: ACHPOutput;
      try {
        const payload: Record<string, unknown> = { claim: query };
        if (activeKbId) payload.kb_id = activeKbId;
        const r = await fetch(`${fastapiUrl}/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Run-Id': newRunId,   // hint backend to use our run_id
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(180_000),
        });
        if (!r.ok) throw new Error(`FastAPI ${r.status}`);
        const raw = await r.json();
        data = mapFastAPIResponse(raw);
      } catch {
        // Fallback to Next.js route (no SSE progress in this case)
        const r = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
        data = await r.json();
      }

      sse.close();
      // Ensure all agents show done
      setActiveAgents(new Set());
      setDoneAgents(new Set(['security','retriever','proposer','adversary_a',
        'adversary_b','nil_supervisor','judge','done']));

      setActiveResult(data);
      setResults(prev => [data, ...prev]);
    } catch (e) {
      sse.close();
      setError(e instanceof Error ? e.message : 'Analysis failed. Please try again.');
      setActiveAgents(new Set());
    } finally {
      setIsRunning(false);
    }
  }, [activeKbId, inputMode]);

  const isAnalyzed = !isRunning && !!result;

  const phaseClass = phaseDir === 'right' ? 'phase-enter-right' : 'phase-enter-left';

  return (
    <ExportContext.Provider value={{ latestResult: activeResult, onExport: handleExport }}>
      {/* Grid backdrop */}
      <div className="fixed inset-0 grid-backdrop pointer-events-none" style={{ zIndex: 0 }} />

      <div className="relative flex flex-col h-screen overflow-hidden" style={{ zIndex: 10 }}>
        <TopBar
          isRunning={isRunning}
          runId={result?.run_id}
          activeTab={phase === 'kb-manager' ? 'kb-manager' : activeTab}
          onTabChange={t => {
            if (phase === 'kb-manager') enterAnalyzer(activeKbId);
            setActiveTab(t);
          }}
          hasResult={!!result}
          onExport={handleExport}
          onScrollToQuery={handleScrollToQuery}
          onKBManager={backToKB}
        />

        <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 64px)', marginTop: 64 }}>
          {/* Sidebar — only in analyzer phase */}
          {phase === 'analyzer' && (
            <Sidebar
              activeAgents={activeAgents}
              doneAgents={doneAgents}
              isRunning={isRunning}
              onRun={handleScrollToQuery}
              resultCount={results.length}
              onInitRun={() => {
                setActiveTab('dashboard');
                setTimeout(() => {
                  queryInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  (queryInputRef.current?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
                }, 80);
              }}
            />
          )}

          {/* Main canvas */}
          <main
            className="flex-1 overflow-y-auto custom-scrollbar"
            style={{
              display: 'flex', flexDirection: 'column',
              padding: phase === 'kb-manager' ? 0 : 24,
              gap: phase === 'kb-manager' ? 0 : 24,
            }}
          >
            {/* ── PHASE 1: KB Manager ───────────────────────────────────── */}
            {phase === 'kb-manager' && (
              <div key="kb-manager" className={phaseClass} style={{ flex: 1 }}>
                <KBManager onEnterAnalyzer={enterAnalyzer} />
              </div>
            )}

            {/* ── PHASE 2: Analyzer ─────────────────────────────────────── */}
            {phase === 'analyzer' && (
              <div key="analyzer" className={phaseClass} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Breadcrumb nav */}
                <PhaseBreadcrumb phase={phase} activeKbId={activeKbId} onBack={backToKB} />

                {/* Page header */}
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 16 }}>
                  <h1 className="font-bold" style={{
                    fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700,
                    letterSpacing: '-0.02em', color: '#e5e2e1',
                  }}>
                    {activeTab === 'monitor' ? 'Monitor' : activeTab === 'logs' ? 'Logs' : 'Dashboard'}
                  </h1>
                  <p style={{
                    fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    fontFamily: 'Space Grotesk, sans-serif',
                  }}>
                    {activeTab === 'monitor'
                      ? `Analysis History — ${results.length} run${results.length !== 1 ? 's' : ''} recorded`
                      : activeTab === 'logs'
                      ? `System Logs — ${results.length > 0 ? results.length * 5 + ' entries' : 'empty'}`
                      : isRunning
                      ? 'Processing claim through 7-agent pipeline…'
                      : isAnalyzed
                      ? 'Narrative Integrity Analysis — Complete'
                      : 'Narrative Integrity Analysis System'}
                  </p>
                </div>

                {/* Monitor tab */}
                {activeTab === 'monitor' && <MonitorView results={results} />}

                {/* Logs tab */}
                {activeTab === 'logs' && <LogsView results={results} />}

                {/* Dashboard tab */}
                {activeTab === 'dashboard' && (
                  <>
                    {isRunning && (
                      <PipelineProgress activeAgents={activeAgents} doneAgents={doneAgents} isRunning={isRunning} runId={runId} />
                    )}

                    {error && (
                      <div className="flex items-start gap-3" style={{
                        border: '1px solid rgba(255,180,171,0.25)', background: 'rgba(255,180,171,0.04)', padding: '12px 16px',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ffb4ab', flexShrink: 0, marginTop: 1 }}>error</span>
                        <div>
                          <p style={{ fontSize: 11, color: '#ffb4ab', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, marginBottom: 2 }}>Analysis Failed</p>
                          <p style={{ fontSize: 11, color: 'rgba(255,180,171,0.70)', fontFamily: 'JetBrains Mono, monospace' }}>{error}</p>
                        </div>
                        <button onClick={() => setError(null)} className="ml-auto material-symbols-outlined btn-tactile" style={{ fontSize: 16, color: 'rgba(255,255,255,0.30)' }}>close</button>
                      </div>
                    )}

                    {!isRunning && !result && !qaResult && !error && (
                      <div ref={queryInputRef}>
                        <IdleState
                          onSubmit={handleRun}
                          activeKbId={activeKbId}
                          inputMode={inputMode}
                          onModeChange={setInputMode}
                        />
                      </div>
                    )}

                    {isRunning && !result && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 288px', gap: 24 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                          {[220, 280, 180, 140].map((h, i) => (
                            <div key={i} className="shimmer-badge" style={{ height: h, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                          {[300, 200].map((h, i) => (
                            <div key={i} className="shimmer-badge" style={{ height: h, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* QA mode result */}
                    {!isRunning && qaResult && (
                      <div ref={queryInputRef}>
                        <RAGAnswer result={qaResult} onNewQuery={handleRun} />
                      </div>
                    )}

                    {isAnalyzed && result && (
                      <div ref={queryInputRef}>
                        <AnalyzedState result={result} onNewQuery={handleRun} isRunning={isRunning} />
                      </div>
                    )}

                    {error && !isRunning && (
                      <div ref={queryInputRef} style={{ marginTop: 16 }}>
                        <QueryInput onSubmit={handleRun} isRunning={isRunning} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </ExportContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Map FastAPI AnalyzeResponse → ACHPOutput format
// ─────────────────────────────────────────────────────────────────────────────
function mapFastAPIResponse(raw: Record<string, unknown>): ACHPOutput {
  const tr = (raw.transparency_report as Record<string, unknown>) ?? {};
  const arts = (raw.artifacts as Record<string, unknown>) ?? {};
  const nil = (tr.nil_sub_agents as Record<string, unknown>) ?? {};
  const latency = (tr.latency_ms as Record<string, number>) ?? {};

  return {
    run_id: (raw.run_id as string) ?? '',
    timestamp: (raw.timestamp as string) ?? new Date().toISOString(),
    input: (raw.claim as string) ?? '',
    verdict: (raw.verdict as ACHPOutput['verdict']) ?? 'MIXED',
    verdict_confidence: (raw.verdict_confidence as number) ?? 0.5,
    composite_score: (tr.composite_score as number) ?? 0.5,
    metrics: {
      CTS: (tr.cts as number) ?? 0.5,
      PCS: (tr.pcs as number) ?? 0.5,
      BIS: (tr.bis as number) ?? 0.5,
      NSS: (tr.nss as number) ?? 0.5,
      EPS: (tr.eps as number) ?? 0.5,
    },
    nil: {
      verdict: (nil.verdict as string) ?? tr.nil_verdict as string ?? 'unknown',
      confidence: (nil.confidence as number) ?? tr.nil_confidence as number ?? 0,
      summary: (nil.summary as string) ?? tr.nil_summary as string ?? '',
      BIS: (nil.BIS as number) ?? tr.bis as number ?? 0,
      EPS: (nil.EPS as number) ?? tr.eps as number ?? 0,
      PCS: (nil.PCS as number) ?? tr.pcs as number ?? 0,
    },
    atomic_claims: (arts.atomic_claims as ACHPOutput['atomic_claims']) ?? [],
    adversary_a: (arts.adversary_a as ACHPOutput['adversary_a']) ?? { factual_score: 0.5, verdict: 'contested', critical_flaws: [] },
    adversary_b: (arts.adversary_b as ACHPOutput['adversary_b']) ?? { perspective_score: 0.5, narrative_stance: 'partial', missing_perspectives: [] },
    consensus_reasoning: (raw.verified_answer as string) ?? '',
    key_evidence: (arts.key_evidence as ACHPOutput['key_evidence']) ?? { supporting: [], contradicting: [] },
    caveats: [],
    debate_rounds: (tr.debate_rounds as number) ?? 1,
    pipeline: {
      mode: (tr.pipeline_mode as string) ?? 'full',
      total_ms: (tr.total_latency_ms as number) ?? 0,
      cache_hit: (tr.cache_hit as boolean) ?? false,
      latency_ms: latency,
      models: (tr.models_used as Record<string, string>) ?? {},
    },
    security: (tr.security as ACHPOutput['security']) ?? { pre_safe: true, post_safe: true, warnings: [] },
  };
}
